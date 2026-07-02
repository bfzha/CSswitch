# 已知问题 / 待修队列

下一版（v0.1.5）计划做的事。按用户反馈与自测记录，附根因与方向。

> **本轮排期（用户 2026-07-03 定）**：**v0.1.5 只含 #1 文案脱敏（已完成，见下），其余顺延，尽快构建发布**。#1 之后的**下个主线** = 面板内自定义 OpenAI 兼容端点（见文末 roadmap，是 #4 provider 研究的可落地切片）。

> **约定**：已修问题发布后从本文件「毕业」到 [`../CHANGELOG.md`](../CHANGELOG.md)。
> **v0.1.4 已发布**（2026-07-03，Latest）：原拖不动、缺 node（node-ectomy 治本）、卡「Switching organization」（CONNECT fast-fail 403→401）、正常窗口去托盘，均已发布，见 CHANGELOG。

## 1. 对外文案脱敏：主按钮改名（最优先）

> **状态：代码已改 + 已提交（`348b00a`）+ 已推 origin/main，待 v0.1.5 构建发布后毕业到 CHANGELOG。** 用户可见的「一键越过登录」全部改为中性的「**一键开始**」。

- **诉求**：主按钮原叫「**一键越过登录**」，措辞**太露骨**（直白讲「越过/绕过登录」，对一个公开工具在观感与合规上都敏感）。已改成**中性、不露骨**的「**一键开始**」。
- **已改（用户可见处）**：
  - `desktop/src/index.html`：主按钮 → `⚡ 一键开始`。
  - `desktop/src/main.js`：`applyMode()` 按钮文案 + `oneClick()`/`switchMode()`/`saveKey()` 的 `setMsg()` 提示语（含「一键越登录失败」这类漏字变体）全部改为「一键开始」。
  - `desktop/src-tauri/src/lib.rs`：`open_url` 里会回传给用户的错误串 `请先「一键开始」`（`set_mode` 的 doc 注释一并改）。
  - `README.md`：开场白「绕过 Claude 登录」→「**无需 Claude 订阅**也能用上它」；快速开始里的按钮名 →「一键开始」。
  - `desktop/README.md`：面板功能列表与前置说明里的按钮名 →「一键开始」。
- **刻意保留（按边界）**：`README.md` 免责声明里「越过登录」（DMCA §1201 反规避的法律概念，软化会失真）；`CLAUDE.md`/`docs/`/`findings/`/`CHANGELOG.md` 等**技术内部文档、历史记录、机制描述**（「越过门票 / 虚拟登录」）不动。
- **边界**：只脱敏**用户直接看到**的字；技术/机制/法律描述保留。
- **收尾**：随下一版（v0.1.5）构建发布后从本文件毕业到 `CHANGELOG.md`。

## 2. DeepSeek 在 Science 里自检 `request_host_access` ❌ 被拒（路径不存在）

> **状态：新记录，待查（信息不全，需复现细节）。**

- **现象**：用户让 DeepSeek 在 Science 里跑自检，`request_host_access` 返回 **❌ 被拒（路径不存在）**。
- **背景推测（待验证，勿当定论）**：`request_host_access` 应是 Science 的一个能力/工具（申请访问宿主机某路径）。「路径不存在」说明它请求的路径在**沙箱环境**里不存在。候选方向：
  1. 沙箱 HOME 是 `~/.csswitch/sandbox/home`（独立于真实 HOME），Science 预期的工作目录 / 项目路径在沙箱里没被创建 → 申请的路径不存在。
  2. 该能力可能依赖真实授权 / 官方后端，虚拟登录下受限（类似远程 MCP 被 fast-fail 那种「虚拟登录用不了官方托管能力」）。
  3. DeepSeek 走**原生 Anthropic 透传**（非翻译），所以**不是翻译层的锅**，更可能是环境 / 路径 / 授权。
- **待收集（下次复现时）**：① 完整报错文本；② 它请求的**具体路径**是什么；③ 是否只有 DeepSeek 触发、还是任何 provider 都这样；④ 该自检具体是什么（Science 自带的环境自检？哪个 agent 发起？）。
- **不改代码**，先记录待查。

## 3. 运行中再点主按钮的幂等分派（体验）

> **状态：已设计，待实现（排在 v0.1.5 之后）。** 主按钮（改名后）在「已在运行」时再点，行为要更合理。

- **现状**：`one_click_login` 会 ① `ensure_proxy`（幂等：端口/provider/key 指纹一致且健康就复用）② **无条件重新伪造 OAuth**（往沙箱目录重写，哪怕 operon 正跑）③ 起沙箱脚本检测 daemon 已在跑 → 复用 ④ 再开一次浏览器。=> 能用，但往活着的沙箱重写登录文件多余且有风险，消息还像干了新活。
- **目标（按当前状态分派）**：

  | 当前状态 | 再点应做什么 |
  |---|---|
  | 代理 + 沙箱都健康、key 没变 | 不重启、不重伪造，只**重新打开 Science**，提示「已在运行，已重新打开」 |
  | key / provider 变了 | **只重启代理**（带新 key），operon 不动，提示「已用新 key 重启代理」 |
  | 单边挂（代理或沙箱） | 只补起挂掉的那个 |
  | 都没起（首次） | 走完整流程 |

- **两条核心**：① 沙箱已健康就**跳过重新伪造**；② 消息**说实话**（区分新起 vs 只是重新打开）。防连点已由前端 `setBusy` 覆盖。

## 4. 更广的 provider / API 支持（调研已封存，慢慢做）

> **状态：调研进行中被用户叫停、就地封存。** 已成文的部分见 [`provider-support.md`](provider-support.md)：核心分型（Anthropic 原生透传 vs OpenAI 兼容翻译）、Science 工具调用格式与翻译坑、CC Switch 参考（70 预设、65 直连 Anthropic）、国际 provider 表已并入。**缺口**：国产各家的 OpenAI 端点 / 模型细节大表（深挖 agent 中断）未并入，留待续做。

## 5. 用户反馈「request 有但 console 报错」（信息不全，沟通中）

- **现象**：console 显示 4 条报错。逐条分析多为**浏览器扩展噪声**（Adobe Acrobat 扩展 `efaidnbmnnnibpcajpcglclefindmkaj` 的慢网络/字体干预、PWA 横幅、扩展消息通道 `message channel closed`），**非 CSSwitch/Science 自身错误**。唯一有意义信号是「Slow network」，印证网络因素。
- **要问清**：① "request 有" 具体指什么、模型有没有正常回复；② 用无痕 / 禁扩展或按 `localhost:<port>` 过滤 console 复看，看有没有真正来自 Science 页面的错误。
- **状态**：信息不全，记录 + 沟通中，不改。

---

**下个主线（用户 2026-07-03 定，#1 之后优先做）**：
- **面板内自定义 OpenAI 兼容端点**：面板里配 base_url / 模型名 / 鉴权头，无需改代码即接任意 OpenAI 兼容上游。它是第 4 条 provider 研究（[`provider-support.md`](provider-support.md)）的**可落地产品化切片**。开工前先走一轮 brainstorming + 设计。

**其它 roadmap（非 bug）**：
- **python-ectomy**：翻译代理移到 Rust（axum），拔掉 python（node 已在 v0.1.4 拔除），最终零外部运行时。
- Intel（x86_64）/ universal 构建；可选正式签名 + Apple 公证。
