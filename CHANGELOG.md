# 更新日志 / Changelog

本项目所有值得记录的变更都写在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **约定**：已修问题从 [`docs/known-issues.md`](docs/known-issues.md)「毕业」到这里（发布即定稿）；未修/进行中留在 known-issues；硬 bug 的根因证据链存在 [`findings/`](findings/)。

## [未发布] — v0.1.5

### 变更 Changed
- **主按钮及提示文案脱敏**：用户可见的「一键越过登录」全部改为中性的「一键开始」（`desktop/src/index.html` 主按钮 + `desktop/src/main.js` 各 `setMsg` 提示 + `desktop/src-tauri/src/lib.rs` 回传给用户的错误串 + `README.md` / `desktop/README.md` 里展示的按钮名）。README 开场白「绕过 Claude 登录」改为「无需 Claude 订阅也能用上它」。技术内部文档、历史记录与 DMCA 免责里的机制描述按边界保留。

## [0.1.4] — 2026-07-03

> 自 0.1.2 起合并数波修复发布：node-ectomy（拔掉 node 运行时依赖）、沙箱卡「Switching organization」实机修（CONNECT 403→401）、面板改正常窗口去托盘、第三方 / 官方模式一键切换，及两轮外部复审加固。

### 重大：开箱即用（拔掉 node 运行时依赖）
- **🎯 node-ectomy —— 虚拟 OAuth 伪造器移进 Rust 原生实现，app 彻底不再需要 node。** 那 220 行 `make-virtual-oauth.mjs`（HKDF-SHA256 + AES-256-GCM 的 v2 加密令牌）用 RustCrypto（`aes-gcm`/`hkdf`/`sha2`）1:1 重写为 `src/oauth_forge.rs`，编进二进制；一键流程在进程内伪造，启动脚本带 `--skip-oauth-forge` 跳过 node 步。**与 `.mjs` 的 v2 GCM 格式字节兼容**，由 node↔rust 双向解密对拍单测钉死（`oauth_forge::tests::crosscompat_*`）。这是 #2「缺 node」的**治本解**：不管用户装没装 node（含 B 类「根本没装」的研究者用户），app 都能用。`.mjs` 保留作 dev/独立脚本 + 对拍预言机。`doctor` 里 node 从「必需」降为「仅 dev」。

### 新增 Added
- **第三方 / 官方 模式一键切换**：面板顶部加分段切换。**第三方模型**（默认）= 原有一键越过登录 → 走 DeepSeek/Qwen；**官方 Claude** = 面板收起 provider/key/沙箱那套，主按钮改为「打开官方 Claude Science」，用 `open`（LaunchServices 正常启动，显式抹掉任何 `ANTHROPIC_*`）把用户交回自己真实的 Science 与订阅——**CSSwitch 不插手官方登录、不起代理/沙箱、不碰任何真实凭证**（铁律 1/2/3）。切到官方是**真正的切换**：后端先停掉第三方链路（沙箱 + 代理、清 secret），既不留后台空跑，也避免 macOS 单实例下 `open` 误聚焦还活着的沙箱实例。给「有 Claude 订阅、想正常走官方 OAuth」的用户用。模式存 `~/.csswitch/config.json` 的 `mode` 字段，下次启动记住。

### 修复 Fixed
- **#2 已装 node 仍报「缺少依赖 node」**（GUI 从访达启动只拿到最小 PATH，查不到装在 `/usr/local/bin`、Homebrew、nvm 等处的 node）。两层解决：**① 治本** = 上面的 node-ectomy（app 不再需要 node）；**② 止血兜底**（仍用于定位 python3）= `which()` PATH 未命中时扫常见安装目录 + 登录 shell `zsh -lic 'command -v'` 解析真实 PATH。*多位客户 + 开发者第二台机器复现确认。*
- **#3 沙箱卡在「Switching organization」**（启动时对 `claude.ai/api/oauth/profile` 的阻塞请求在到不了 claude.ai 的网络上挂住）。代理新增 `do_CONNECT`：对 `claude.ai / *.claude.com / *.anthropic.com` 的 CONNECT 立即 **401（未登录）** fast-fail，其余域名隧道透传；`launch-virtual-sandbox.sh` 注入 `https_proxy` 指向代理 + `no_proxy=127.0.0.1`（本地推理仍直连）。**实机整链验证并修正**：初版回 403（禁止）会让 operon 当组织问题反复重试、仍卡住；改回 **401** 才触发 operon `treating as logged-out` 秒过（operon 日志实测：403→卡、401→过，唯一变量就是状态码）。根因与实机证据见 [`findings/switching-organization-hang.md`](findings/switching-organization-hang.md)。
- **#1 面板无法鼠标拖动**：随 #4 消失（原生标题栏自带拖动）。

### 变更 Changed
- **#4 面板从「菜单栏 accessory」改为正常 Dock 窗口**：`decorations`（标题栏关闭/最小化/缩放三键）+ `visible`（启动即显示）+ `center`（居中）+ `resizable`（min 320×520）；**移除菜单栏托盘图标**（纯正常窗口）；从红叉关窗与「退出」按钮一致——停代理、清 secret、保留沙箱（避免留孤儿代理）。
- 依赖收敛：app 运行时依赖从 node + python3 减为 **仅 python3**（下一步同法移 axum 拔 python，见 [`docs/dependency-analysis.md`](docs/dependency-analysis.md)）。

### 安全 / 健壮性（外部复审修复）
- **[P1] 伪造器符号链接重定向**：去掉旧 `.sandbox/` 字符串启发式后，仅「==真实凭证目录」拦不住把 auth_dir 预置成指向其它目录的符号链接 → 恢复「沙箱根内」约束（`forge` 收 `sandbox_root=sandbox_home()`，解析后路径必须落其下），在写任何文件前拒绝逃逸。加回归测试 `forge_rejects_symlink_escaping_sandbox_root`。
- **[P2] 旧 `.enc` 删除失败被静默忽略**：原 `let _ = remove_file`，删不掉会残留多个 `.enc`（Science 预期恰好一个 → 显示启动成功却登录不上）→ 改为显式失败。
- **[P2] `http_proxy` 设了却不支持普通 HTTP 代理**：普通 HTTP 的 MCP/下载会撞代理拿 404 → 启动脚本改为**只设 `https_proxy`**（fast-fail 目标 `claude.ai/api/oauth/profile` 是 HTTPS），普通 HTTP 直连或走用户自己的代理。
- **[P3] 登录 shell 探测超时后泄漏子进程**：改 spawn + 轮询 + 超时 kill，病态 rc 卡死时终止 zsh。
- **[P2·评估后保留] CONNECT 不校验 path-secret**：代理只绑回环 + 隧道是裸 TCP 转发（不注入 key、不经推理端点），path-secret 守护的边界未被削弱，风险面小；已在代码注释记录该判断与「`Proxy-Authorization` 收紧」路径，待整链联调验证 operon 行为再定。

### 安全 / 健壮性（第二轮外部复审修复）
- **[P1] 模式切换只改配置、不切换进程** → `set_mode` 切到「官方」时**真正拆掉第三方链路**（停沙箱 Science + 杀代理 + 清 secret），做成名副其实的「切换」而非「选择模式」；也堵住 macOS 单实例下 `open` 误聚焦到还带着 `ANTHROPIC_*` 环境的沙箱实例。全程绝不碰真实 8765。
- **[P1] 伪造器信任根仍可被父级软链接带偏**：若 `~/.csswitch/sandbox` 被预置成指向真实 `~/.claude-science` 子树的符号链接，沙箱根自身会解析进真实树，令「沙箱根内」检查失效。**新增护栏 0（铁律最高优先，先于沙箱根检查）**：解析后的写入根绝不落在真实 Science 目录之内或本身，任何异常布局都绝不触碰真实目录。加回归测试 `forge_rejects_symlink_into_real_science_tree`（验真实目录零改动）。
- **[P2] 切换失败时 UI 谎报成功**：原「先翻 UI 再写配置、失败不回滚、错误提示又被后续普通提示覆盖」→ 改为**先落盘成功再翻 UI**，失败保持旧模式并如实报错、不被覆盖，切换期间禁用按钮，切成后刷新状态灯。
- **[P2] 关键 OAuth 实现未纳入 Git**：`oauth_forge.rs`（及对拍脚本 `test/decrypt-oauth.mjs`、CONNECT 测试 `test/test_proxy_connect.py`）此前是未跟踪文件，干净检出会因缺 `mod oauth_forge` 而构建失败 → 本次一并纳入版本控制。

## [0.1.2] — 2026-07-03

### 修复 Fixed
- 面板拖拽与端口相关修复。

### 新增 Added
- 存 API key 后用一条最小请求**真实验证一次 key**（200 可用 / 401·403 被拒）。
- 稳定复用的 path-secret（一次性鉴权令牌持久化，沙箱重连不失效）。
- 反馈 / 报 bug 基建（一键跳 GitHub issue 模板、打开日志目录自查）。

## [0.1.1] — 2026-07-03

### 新增 Added
- 一键越过登录面板（填 key → 一键起代理 + 沙箱 + 打开浏览器）。
- 检查更新（跳 GitHub Releases）。
- terracotta 暖橘品牌主题与图标集。

## [0.1.0] — 2026-07-03

### 新增 Added
- 首个公开版本。
- Tauri 菜单栏 app（进程管家）：管代理与沙箱两个子进程、读写 `~/.csswitch/config.json`、key 只注入环境变量、探活。
- provider 可切代理 `csswitch_proxy.py`：DeepSeek 原生 Anthropic 透传（默认）/ 通义千问 DashScope 翻译。
- 虚拟 OAuth 伪造器（本地假凭证越过 Science 的登录门票，零真实凭证）。
- 运维三件套 `doctor` / `verify-proxy` / `self-test` + 离线回归套件。
- 每日维护巡检（launchd 09:00/21:00，只读 + 规划，守铁律）。
