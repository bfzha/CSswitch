# CSSwitch 真机复测步骤（P1/P2 修复验证）

本文只覆盖这次改动需要真机确认的部分：**RM-06**（native 无效 key 必须被拦、不谎报「已切到」、旧代理不动）、**RM-04**（非 active native 连接编辑即时上游校验）、**RM-13**（端口占用报错措辞），外加全程安全不变量。完整 18 条矩阵与打包细节见 `test/REAL_MACHINE_TEST.md`。

跑之前先跑离线基线确认没回归：`bash test/run_all.sh`（ALL GREEN）、`(cd desktop/src-tauri && cargo test --lib)`（113 passed）。

---

## 0. 铁律（必读，做之前对照一遍）

- 全程**不读、不改、不删**真实 `~/.claude-science`（登录凭证在里面）。
- 真实 Science 跑在端口 **8765**，本测试只用 `lsof` 观察它的监听 PID，绝不动它。
- 沙箱 Science 要**你手动**在沙箱里独立登录，Claude 不代做登录。
- 测试用独立 HOME、独立 `~/.csswitch`、独立 data-dir、独立测试端口（默认 18991/8990）。
- 任一步若 8765 的 PID 变了，或发现真实 `~/.csswitch` / `~/.claude-science` 被动过，**立即停止**。

---

## 1. 准备

需要三个值（两个有效、一个故意无效）：

```bash
export DEEPSEEK_API_KEY='你的有效 DeepSeek key'      # 用于「正常切换应成功」
export DASHSCOPE_API_KEY='你的有效通义千问 key'      # 用于整链/对照
export BAD_KEY='sk-definitely-invalid-0000'          # 故意无效，用于 RM-06/RM-04 拦截
```

依赖：`jq`（护栏 prepare-legacy 需要）、`python3`（代理需要）、已装好的 Rust 工具链。

构建当前工作树（**不是旧 DMG**）的验收 app（独立 bundle id，避免 macOS 唤起已装旧窗口误测旧代码）：

```bash
cd desktop
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  npm run tauri build -- --config ../test/tauri.real-machine.conf.json --bundles app
cd ..
```

产物在 `desktop/src-tauri/target/release/bundle/macos/CSSwitch Acceptance.app`。

---

## 2. 安全护栏 + 隔离基线

```bash
bash test/real_machine_guard.sh preflight       # 记录 8765 基线 PID、建隔离 HOME、验端口空闲
bash test/real_machine_guard.sh prepare-legacy  # 在独立 HOME 写 v1 迁移样本（key 从 env 读、不回显）
eval "$(bash test/real_machine_guard.sh env)"   # 导出隔离 HOME / 测试端口到当前 shell
```

`preflight` 必须最后打印 `PASS: 真实 Science 8765 监听 PID 保持不变`。

启动验收 app（用隔离 HOME，指向当前工作树资源）：

```bash
HOME="$(bash test/real_machine_guard.sh env | sed -n 's/^HOME=//p')" \
CSSWITCH_REPO="$PWD" \
"desktop/src-tauri/target/release/bundle/macos/CSSwitch Acceptance.app/Contents/MacOS/desktop"
```

首启后面板应列出 **DeepSeek** 与 **Qwen** 两条 profile，DeepSeek 生效，key 只显示掩码。

> 每做完一步会改变运行态的操作，就在另一个终端跑一次
> `bash test/real_machine_guard.sh guard`，确认 8765 PID 不变。

---

## 3. 复测用例

术语约定，用来客观取证（都不暴露 key/secret）：

- 看代理/沙箱是否在跑、PID 多少：`lsof -nP -iTCP:$CSSWITCH_TEST_PROXY_PORT -sTCP:LISTEN` 和 `-iTCP:$CSSWITCH_TEST_SANDBOX_PORT`。
- 看当前生效 profile：读隔离 HOME 里的 `~/.csswitch/config.json` 的 `active_id` 字段（**只看 active_id，别把 key 截进图**）。

### RM-06a：native 无效 key 必须被拦（P1 核心）

前置：DeepSeek 生效、代理与沙箱在跑（先点一次「一键开始」）。记下代理 PID 和 `active_id`。

1. 在面板把 **Qwen**（非当前生效那条）的 key 改成 `$BAD_KEY` 保存。
2. 点 Qwen 那条的「**设为当前**」。

必须满足（全部）：

- 顶部提示是**错误红字**，内容形如「**上游拒绝（401），key/权限有误，未切换（当前配置不变）。**」。
- **不出现**「已切到「通义千问」」这类成功提示。
- `active_id` **仍是 DeepSeek**（读 config.json 确认没变）。
- 代理端口的监听 **PID 不变**（旧 DeepSeek 代理没被换掉）。
- 沙箱端口 PID 不变。
- 8765 PID 不变。

失败判据（命中任一即 P1 未修复）：提示「已切到」、`active_id` 变成 Qwen、代理 PID 变了。

### RM-06b：native 有效 key 正常切换仍要成功（防误伤）

1. 把 Qwen 的 key 改回**有效**的 `$DASHSCOPE_API_KEY` 保存。
2. 点 Qwen「设为当前」。

必须满足：

- 顶部提示「**已切到「通义千问」**」。
- `active_id` 变成 Qwen；代理 PID 变化（换成 Qwen 代理）；沙箱 PID 不变；8765 不变。
- 注意：这一步比修复前多一次真实上游最小探测（约 1 至 4 秒），属正常。

切回 DeepSeek 同理再验一次成功路径。

### RM-04：非 active native 连接编辑即时校验

对**非当前生效**的一条 native profile 编辑连接：

1. 填**有效** key → 保存 → 顶部应显示「**已保存连接（已通过上游校验）。**」。
2. 填 `$BAD_KEY` → 保存 → 顶部应显示错误「**连接未保存：上游拒绝（401），key/权限有误，连接未保存。**」，且该 profile 的 key **未被改动**（validate-before-persist；读 config.json 或重开编辑框确认还是旧值）。
3. 断网或填一个连不通的情形 → 应显示「**已保存连接（未能连通上游校验，激活时会再验）。**」（含糊态 best-effort 落盘、如实标未校验）。

要点：第 2 步「明确 401 → 不落盘」是本次修复的关键，修复前 native 会被直接标「未校验」并保存。

### RM-13：端口占用报错措辞（P2）

1. 先用普通进程占住代理测试端口：
   ```bash
   python3 -m http.server "$CSSWITCH_TEST_PROXY_PORT" >/dev/null 2>&1 &
   OCC=$!
   ```
2. 在面板点「一键开始」。

必须满足：

- 报错**明确指向端口占用**，形如「**端口 18991 已被占用，换个端口或先停掉占用进程后重试。**」。
- **不再**出现旧的含糊措辞「端口 … 可能被占用，或 key 无效」。
- 占位进程**没被误杀**（`kill -0 $OCC` 仍在）。

收尾：`kill $OCC`。

### RM-09（可选，整链推理）

若要顺带确认整链没坏：在沙箱 Science（测试端口）发一条最小文本请求和一次工具请求，确认可用；代理日志里不得出现 path-secret 或完整 key；8765 PID 全程不变。这步要起沙箱 Science，属铁律 #4，需你在场手动。

---

## 4. 收尾

```bash
# 在面板点「全部停止」，再退出验收 app。然后：
bash test/real_machine_guard.sh assert-stopped   # 测试代理/沙箱端口应全部空闲、8765 PID 不变
```

再人工确认：

- 真实 `~/.claude-science` 修改时间未变、内容未动（只看时间戳，别打开内容）。
- 真实 `~/.csswitch/config.json`（你日常用的那个，**非**隔离 HOME 里的）未被改动。
- 已装的 `/Applications/CSSwitch.app` 原进程没被退出（验收 app 是独立 bundle id，并行跑）。

清理隔离目录（可选）：`rm -rf "$CSSWITCH_REAL_TEST_ROOT"`。

---

## 5. 证据记录（脱敏）

- 截图/日志**不得**包含完整 key、path-secret、OAuth 文件内容。
- 只记录：监听端口与 PID、`active_id`、profile 名称、顶部提示文案、HTTP 状态码、8765 基线 vs 当前 PID。
- 每条用例如实标注：通过 / 失败 / 因环境未执行 / 需人工判断。不要把「未执行」写成「通过」。

## 判定

RM-06a + RM-04 第 2 步 + RM-13 三条全绿 = 本次 P1/P2 修复真机确认通过，可进入拆 commit（native 校验 / 护栏与前端 / 文档）与 merge 讨论。任一条不符 = 回报现象（附脱敏证据），先不提交。
