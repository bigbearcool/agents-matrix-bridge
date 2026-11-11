# Codex Matrix Bridge

本目录是参照 Antigravity Matrix 插件实现的 Codex 本地插件及常驻引擎。Codex 通过 app-server 执行，Matrix 同步与控制台由本地进程承担。当前是开发版本，尚未替换现有 cc-connect。

## 功能

- Matrix 消息接收、回复、邀请处理、私聊与群聊提及；支持回复机器人消息触发。群聊主会话共享上下文，Matrix Thread 独立续会话。
- 文本、图片、文档、音频、视频入站；接收文件上限 50 MiB，存入私有数据目录。图片和音频通过 Codex 本地媒体输入；其他文件通过路径交给 Codex。出站识别 Markdown 图片、`<send-file path="..." />`、`[SEND_FILE: ...]`，并提供管理员 `/sendfile`、`/upload`。
- 按房间设置工作区、模型、思考深度和回复策略；支持 `/workspace`、`/policy`、`/model`、`/effort`、`/status`、`/help`、`/new`、`/reset`，并保留基础 `/list`、`/switch`、`/current`、`/dir`。
- 管理员与消息名单、邀请准入、联邦群拦截、出站脱敏、限流、管理员工作区执行限制；未绑定房间可使用独立工作目录。**独立工作目录不是操作系统级读取隔离**，Codex 的只读沙箱不保证不能读取其他目录。
- Codex 内嵌 MCP App 管理台及本地浏览器管理台：房间、工作区、安全、目录浏览/搜索、账号登录、模型和状态。仅监听 `127.0.0.1`，不向界面返回令牌；写请求检查 Host 和 Origin。令牌或密码登录后凭证仅保存在进程内，不写配置文件。
- 插件 MCP 工具提供状态、房间、模型、配置、目录浏览与管理。安装插件不会自动启动桥接引擎。
- `suggest` 模式使用 Codex app-server 的 `read-only` 和 `on-request`；命令、文件修改及权限申请通过房间管理员审批。普通补充问题由发起人或管理员回复，秘密问题不会转发到房间。
- 入站先记录再执行；结果或投递不明确时暂停房间并不自动重放。同一状态目录使用单实例锁；异常退出可能留下锁，须人工核实进程后处理。

## Pantalaimon 与加密房间

直连 Matrix 时，加密房间的消息会被拒绝，避免发送明文。接入 Pantalaimon 时，显式设置 `"matrix_transport": "pantalaimon"`，并把 `homeserver` 指向可信的 Pantalaimon 代理地址。该模式允许 HTTP 地址；请确保代理连接可信。不要把普通 Homeserver 伪装成代理，否则不能保证加密。

Pantalaimon 需要先通过代理登录并具备相应设备和房间密钥；本插件不安装或配置 Pantalaimon，也不负责密钥及设备验证。当前仅做了模拟协议测试，尚未与实际 Pantalaimon 完成加密消息或加密附件的端到端验收。

## 配置与运行

复制 `config.example.json` 到私有位置并填写。配置不要包含 `access_token` 或密码。设置环境变量 `MATRIX_ACCESS_TOKEN` 后运行，也可以不设置令牌、启动后在管理台登录：

```sh
node plugins/matrix-bridge/engine/main.mjs /绝对路径/config.json
```

管理台默认地址为 `http://127.0.0.1:47614/`，可通过 `console_port` 修改。`admins` 必须是具体 MXID；`allowed_senders` 支持具体 MXID 或 `*`。首次同步不处理历史消息。状态默认存于 `~/.codex/matrix-bridge/state.json`，附件位于同目录的 `attachments`；状态包含消息内容，请保护目录。令牌不传给 Codex 子进程。浏览器登录所得令牌不持久化，进程重启后需重新登录或重新提供令牌。

## 安装插件

推荐使用根目录统一安装器：

```sh
./install.sh --agent codex
```

或使用 Codex 插件市场命令：

```sh
codex plugin marketplace add /绝对路径/codex/plugins
codex plugin add matrix-bridge@bigbear-matrix-codex
```

## 验证与测试

```sh
npm test
```

模拟测试不等于真实渠道验收。尚未完成 Pantalaimon 加密、真实 Matrix 收发和附件、Codex 实际回答及续接、审批和迁移切换验收；模型兼容性、图片格式尺寸、文件回传、Codex 宿主内的嵌入入口及 Antigravity 控制台的完整交互仍需逐项核对。源项目中的模型自动重试没有照搬：执行结果未知时不自动重放。
