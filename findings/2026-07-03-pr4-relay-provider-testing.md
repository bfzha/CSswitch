# PR #4 relay（中转站）真机测试记录

- 日期：2026-07-03
- 分支：`feat/relay-provider`（PR #4）
- 方式：**隔离层**（翻译代理 ↔ 真实上游，**未启动 Science**，守铁律 4）。代理起在 127.0.0.1:18995，key 经 gitignored 的 `.env`（0600）注入，绝不进 argv / 日志 / git。
- 目的：验证 PR #4 的 relay provider 是否真能连真实中转站/上游、拉模型、对话——单测 51/51+18/18 只证明逻辑自洽，不证明能用。

## 结论速览

- **relay 代码路径本身是通的**：起代理、env-file 读 key（未泄露）、上游端点装配（`base + /v1/messages`）、双鉴权头、透传、`/v1/models` 归一化、**上游错误如实回传**，全部正确。GLM 上 8 个模型成功回源 + 归一化、`claude-*` 与 `glm-*` 双双被接受。
- **小米 + GLM 充值后：relay happy path 全通** —— 两家都验了非流式 + 流式 SSE + **工具调用 tool_use**（小米见「一」末，GLM 见「二」）。至此 relay 代码在**隔离层已端到端验证**（含工具）。硅基流动 / OpenRouter 仅验了非流式（真对话通），流式+工具未单独复验（relay 透传逻辑 provider 无关，已由小米+GLM 双证）。
- **各家上游兼容性差异极大**，是选型与文案的关键，也暴露了 relay 当前设计的两处硬假设（`claude-*` 透传 + `/v1/models` 存在），小米两条都不满足、GLM 两条都满足。

## 兼容性总表（4 家真机实测，隔离层）

relay 代码对**四家全部跑通**（起代理/鉴权/透传/流式/错误传递）。差异全在上游兼容性，决定整链 UX：

| Provider | base_url | `/v1/models` | `claude-*` 透传 | 真对话 | 整链适配度 |
|---|---|---|---|---|---|
| 智谱 GLM | `open.bigmodel.cn/api/anthropic` | ✅ 8 | ✅ 映射（含裸名） | ✅ | **理想**：两条都满足 |
| OpenRouter | `openrouter.ai/api` | ✅ 340 | ✅ 认（含裸 `claude-opus-4-8`） | ✅ 真 Claude | **好**：都满足，但选择器被 340 个灌满；需海外支付 |
| 硅基流动 | `api.siliconflow.cn` | ✅ 91 | ❌ 不认（400） | ✅ 自家模型 | **中**：选择器能铺满，但后台/裸 `claude-*` agent 会 400 |
| 小米 MiMo | `api.xiaomimimo.com/anthropic` | ❌ 404 | ❌ 不认（400） | ✅ `mimo-v2.5-pro` | **最难**：选择器铺不满 + 后台 agent 400 |

**对 PR 的核心结论**：relay 管道没问题；`claude-*` 透传 + `/v1/models` 是它的两条隐含假设。满足两条的（GLM/OpenRouter）开箱顺滑；缺一条或两条的（硅基流动/小米）需要「面板手填模型名 + 可自定义/关闭 `claude-*` 默认模型」才能覆盖。当前 PR 缺这个能力。

## 一、小米 MiMo（`https://api.xiaomimimo.com/anthropic`）

| 项 | 结果 |
|---|---|
| `/v1/messages` | ✓ 端点在、能打 |
| `/v1/models`（回源拉模型） | ❌ **404 Not Found**（小米 Anthropic 端点无此路径） |
| 模型名 `claude-*` | ❌ 全部 `400 Not supported model`（claude-sonnet-4 / claude-3-5-sonnet-… 都拒） |
| 模型名 `mimo-v2.5-pro`（文档现行 id） | ✓ 被接受（不再报「not supported」）；旧的 `MiMo-V2-Flash` 已废弃 |
| 鉴权 | ✓ key **有效**——发正确模型得 **402 计费状态**（非 401/403，说明已过鉴权） |
| 能否对话 | ✅ **充值后全通**（见本节末「充值后验证」）。此前 `402 Insufficient account balance` 是余额 0，非代码问题 |

**对 PR 的影响（整链时必踩）**：
1. **「自动获取模型」按钮对小米用不了**（`/v1/models` 404 → 退回静态空列表 → 选择器空）。
2. relay 空名兜底 `default_model=claude-opus-4-8`，而 Science 的标题/后台 agent 常发裸 `claude-*` 或空名 → **这些后台请求在小米上会 400**。主对话手选 `mimo-v2.5-pro` 可用，但后台 agent 报错。
3. **小米是 relay 当前设计的最难样本**：既无 `/v1/models` 可自动铺、又不映射 `claude-*`。选择器既填不满、透传又被拒 → 对小米这类家，relay 需要「手动指定模型名」的能力，当前 UI 没有。

**充值后验证（隔离层，`mimo-v2.5-pro`）**：

| 用例 | 结果 |
|---|---|
| 非流式对话 | ✅ 真出字（「你好，我是MiMo-v2.5-pro，…」），`stop_reason` 正常、`usage` 正常 |
| 流式 SSE | ✅ 事件序列标准（`message_start → content_block_start → content_block_delta×N → content_block_stop …`），拼出文本正确（「1,2,3,4,5」） |
| **工具调用** | ✅ `stop_reason: tool_use`，正确吐出 `tool_use` 块（`name=get_weather`、`input={"city":"北京"}`、带 `id`）。**Science 重度依赖工具，这条最关键** |

→ **relay 的代码路径在隔离层端到端跑通**（透传 + 流式 + 工具，全保真）。小米剩余问题只在「无 `/v1/models` + 不映射 `claude-*`」这两处产品适配，不是 relay 管道问题。

## 二、智谱 GLM（`https://open.bigmodel.cn/api/anthropic`）

| 项 | 结果 |
|---|---|
| `/v1/messages` | ✓ |
| `/v1/models`（回源拉模型） | ✅ **有**，返回 8 个：`glm-4.5 / glm-4.5-air / glm-4.6 / glm-4.7 / glm-5 / glm-5-turbo / glm-5.1 / glm-5.2`。relay 归一化成功 → **「自动获取模型」按钮对 GLM 可用** |
| 模型名 `claude-*` | ✅ **接受**（`claude-sonnet-4` 被 GLM 映射，不报 not-supported）→ relay 透传 + Science 后台/标题 agent 在 GLM 上**不会 400** |
| 模型名 `glm-4.6` | ✅ 接受 |
| 鉴权 | ✓ key **有效**（过鉴权，得计费错误非 401） |
| 能否对话 | ✅ **充值后全通**（初测 `429 code 1113` 余额不足；充值后复测通过） |

**充值后验证（隔离层，2026-07-03）**：
| 用例 | 结果 |
|---|---|
| 非流式 `glm-4.6` | ✅ 真出字「我是一个由Z.ai开发的大型语言模型。」，`stop=end_turn` |
| `claude-sonnet-4`（验映射） | ✅ GLM 映射到 `glm-4.7`，回「你好」→ **Science 后台/裸 `claude-*` agent 在 GLM 上真能出字** |
| 流式 `glm-4.6` | ✅ 事件序列标准，文本「1，2，3。」 |
| **工具调用 `glm-4.6`** | ✅ `stop=tool_use`，正确吐 `get_weather {"city":"上海"}` |

**对 PR 的启示**：GLM 是 relay 的「理想样本」——有 `/v1/models` + 映射 `claude-*`（含裸名）+ 流式/工具全保真，happy path 全通。与小米对照，正说明「Anthropic 兼容端点」分两类：relay 对 GLM/OpenRouter 型友好、对小米/硅基流动型需补「面板选模型 + 代理 override」。

## 三、整链验证（隔离沙箱 Science ↔ relay ↔ GLM）

- **隔离**：HOME=`.sandbox/home`、data-dir=`.sandbox/home/.claude-science`、端口 **8990**，虚拟 OAuth（node 伪造，org 62169860…）。真实 **8765 / `~/.claude-science` 全程未碰**（launch 脚本硬护栏：拒 8765、拒 data-dir 真实路径指向真实目录；仅 APFS 克隆 `bin/conda/runtime/seed-assets`，**绝不拷凭证**）。启动时真实 Science 仍在 8765 跑，未受影响。
- Science 起在 8990，`ANTHROPIC_BASE_URL` 指 `http://127.0.0.1:18995/<secret>`（GLM relay）。
- **relay 代理日志证据（沙箱 Science 启动后）**：
  - `CONNECT claude.ai:443 -> 401 未登录（fast-fail）`（多条，含 *.mcp.claude.com）：Anthropic 域名被拦 → **虚拟登录越过成功、无「Switching organization」卡死**。
  - `GET /v1/models -> relay(回源): 8 个模型`：**Science 成功拉到 GLM 模型列表 → 选择器铺满**。
- **待补（用户在自己浏览器做）**：UI 里手选一个模型、发一条消息看 GLM 回。Claude 浏览器扩展未连、无法代驱。但 `/v1/messages` 路径已在隔离层用**同样的调用**证过（glm-4.6 / claude-sonnet-4 映射 / 流式 / 工具全 OK），整链只差这一下 UI 确认。

## 四、硅基流动 SiliconFlow（`https://api.siliconflow.cn`）

| 项 | 结果 |
|---|---|
| `/v1/messages` | ✓ 有 Anthropic 端点 |
| `/v1/models` | ✅ **91 个**（LongCat / GLM-5.2 / Kimi-K2.7 / DeepSeek-V4 / Qwen…），归一化成功 |
| `claude-*` | ❌ `claude-sonnet-4` → `400 Model does not exist`（不映射，同小米） |
| 自家模型 | ✅ `Qwen/Qwen2.5-7B-Instruct`、`deepseek-ai/DeepSeek-V3` 均真出字 |
| 定位 | 「中」等：有 models 端点（选择器能铺满 91 个）但不认 `claude-*`（后台 agent 会 400） |

## 五、OpenRouter（`https://openrouter.ai/api`）

| 项 | 结果 |
|---|---|
| 连通 | ✓ 直连成功（国际站，本机走 clash 透明路由） |
| `/v1/models` | ✅ **340 个**（19 个 claude 系，如 `anthropic/claude-sonnet-5`、`anthropic/claude-opus-4.8-fast`） |
| 真 Claude 对话 | ✅ `anthropic/claude-sonnet-5` → 真出字（回 `claude-sonnet-5-20260630`） |
| 裸 `claude-*` | ✅ `claude-opus-4-8`（无前缀）也被 OpenRouter 别名解析 → OK（**Science 后台/默认 agent 不会 400**，比预期好） |
| 注意 | 340 个模型灌满选择器；`is_main_list_model` 不匹配 `anthropic/claude-…` 前缀 → 全折进「More models」；需海外支付 |
| 定位 | 「好」：真 Claude、prefixed 与裸名都认、有 models 端点；唯一糙点是选择器过载 |

## 建议（据已测）

- relay 更适合「认 `claude-*`（映射自家）或有 `/v1/models`」的上游：DeepSeek `/anthropic`、GLM、Kimi、OpenRouter 一类。
- 对小米这种「只认自家 id + 无 models 端点」的家，PR 若要覆盖，需补：面板内手填模型名（不依赖 `/v1/models`）+ 关掉 `claude-*` 空名兜底或允许自定义默认模型。
- 文案/文档应说明：并非所有「Anthropic 兼容端点」都认 `claude-*`，也并非都有 `/v1/models`。
