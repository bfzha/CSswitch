# CSSwitch 多 profile 真机验收

本验收覆盖当前工作树，而不是旧 DMG。执行时使用独立 `HOME`、独立
`~/.csswitch`、独立 Science data-dir 和测试端口；真实 Science 只用 `lsof`
观察 8765 监听 PID，绝不读取或改动真实 `~/.claude-science`。

## 1. 自动化基线

- `bash test/run_all.sh`：代理鉴权、畸形输入、CONNECT、流中断、脚本护栏。
- `cargo test`：配置迁移/备份/权限、OAuth 隔离、生命周期事务、profile CRUD。
- `cargo clippy --all-targets -- -D warnings`、`cargo fmt --check`、`node --check`。
- `gitleaks detect --redact`：扫描提交历史；本地 `.env` 只报告是否存在命中，不回显值。
- `npm run tauri build`：验证当前工作树实际可打包；检查 `.app`/DMG 的资源与签名状态。
- 若已安装的 CSSwitch 正在运行，用 `test/tauri.real-machine.conf.json` 构建独立
  `CSSwitch Acceptance.app`（独立 bundle ID），防止 macOS 激活旧窗口而误测旧代码。

## 2. 真机安全准备

```bash
bash test/real_machine_guard.sh preflight
bash test/real_machine_guard.sh prepare-legacy
bash test/real_machine_guard.sh env
```

机器上没有其它 CSSwitch 进程时，可直接启动当前工作树 release 二进制：

```bash
HOME="$(bash test/real_machine_guard.sh env | sed -n 's/^HOME=//p')" \
CSSWITCH_REPO="$PWD" \
desktop/src-tauri/target/release/desktop
```

机器上已有 CSSwitch 时，不要为测试强退用户实例。构建并启动独立验收 app：

```bash
cd desktop
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  npm run tauri build -- --config ../test/tauri.real-machine.conf.json --bundles app

HOME="$(cd .. && bash test/real_machine_guard.sh env | sed -n 's/^HOME=//p')" \
CSSWITCH_REPO="$(cd .. && pwd)" \
src-tauri/target/release/bundle/macos/CSSwitch\ Acceptance.app/Contents/MacOS/desktop
```

每个会改变运行态的步骤后运行 `bash test/real_machine_guard.sh guard`。若 8765
PID 变化，立即终止验收。

## 3. 验收矩阵

| ID | 场景 | 操作 | 必须满足 |
|---|---|---|---|
| RM-01 | v1→v2 迁移 | 用 `prepare-legacy` 后首次启动 | 列表出现 DeepSeek/Qwen；DeepSeek 生效；`config.json.v1.bak` 存在且 0600；key 只显示末四位 |
| RM-02 | 新建 profile | 新建自定义配置并取消/完成一次 | 取消不落盘；完成后新增一条且不自动生效；同模板可多条 |
| RM-03 | 元数据编辑 | 改名和备注，重启 app | 名称/备注持久；连接字段与 key 不变 |
| RM-04 | 非 active 连接编辑 | 正确 key、错误 key、上游 5xx/断网各一次 | 200 标“已校验”；明确 4xx 拒绝且不落盘；含糊态保存但明确标“未校验” |
| RM-05 | 激活切换 | DeepSeek↔Qwen | scratch→正式代理健康后才切 active；代理 PID/adapter 变化；沙箱 PID 不变；请求走新上游 |
| RM-06 | 激活失败回滚 | 候选填错误 key/模型后激活 | active_id 不变；旧代理恢复；UI 不谎称成功；沙箱不停止 |
| RM-07 | active 连接编辑 | 修改当前连接为有效/无效值 | 有效值提交并换代理；无效值不落盘并恢复旧代理 |
| RM-08 | 一键开始 | 生效配置下点击“一键开始”两次 | 首次起代理+独立沙箱；第二次幂等复用并重新打开；三个状态灯符合实况 |
| RM-09 | 整链推理 | 在沙箱 Science 发最小文本请求与一次工具请求 | 文本/工具链可用；代理日志不出现 path-secret/key；真实 8765 PID 不变 |
| RM-10 | 清 key | 对 active 与 non-active 各清一次 | active：代理撤销、active 清空；non-active：不影响当前链路；config 与滚动备份均不可恢复旧 key |
| RM-11 | 删除 | 删除 non-active；尝试删除 active | non-active 消失且链路不变；active 必须先切走/清 active，不能留下悬空 active_id |
| RM-12 | 端口变更 | 链路运行时改代理端口，再改沙箱端口 | 先成功停独立沙箱/代理再落盘；旧端口释放；下次一键按新端口重建 |
| RM-13 | 端口冲突 | 预占候选端口再启动 | 明确报告端口占用；不误报 key 无效；不杀占位进程 |
| RM-14 | 官方模式 | 链路运行时切“官方 Claude” | 只停测试代理/沙箱；真实 8765 PID 保持；切回第三方不自动起链路 |
| RM-15 | 全部停止/退出 | 点“全部停止”，再退出 app | 据实报告停止结果；测试端口释放；无残留 CSSwitch/python 子进程 |
| RM-16 | 重启恢复 | 退出并用同一测试 HOME 重开 | profiles/active/notes/端口持久；不自动启动代理或沙箱 |
| RM-17 | 包资源 | 从 `.app` 与挂载 DMG 启动 | `Contents/Resources/{proxy,scripts}` 齐全；无需 `CSSWITCH_REPO` 也能起代理 |
| RM-18 | 发布安全 | `codesign --verify --deep --strict`、`spctl -a -vv` | 分别记录签名完整性与 Gatekeeper 接受结果，不把 ad-hoc 签名写成已公证 |

## 4. 证据与收尾

- 截图不得包含完整 key、path-secret 或 OAuth 文件内容。
- 只记录监听 PID、端口、状态码、profile 名称和脱敏日志摘要。
- 停止后执行 `bash test/real_machine_guard.sh assert-stopped`。
- 报告必须区分：通过、失败、因环境未执行、需人工判断；不能把“未执行”写成通过。
