# Antigravity Matrix Bridge 插件 (`matrix-bridge`)

将 Google Antigravity (`agy`) 以原生 Bot 身份接入 Matrix 去中心化通信网络，并提供侧栏可视化管理控制台（`sidecar://matrix-bridge/matrix_console/`）。

---

## 1. 目录结构说明

```text
antigravity/
├── plugin.json                        # Antigravity 插件清单文件
├── README.md                          # 插件完整使用、架构与开发说明
├── install.sh                         # 一键同步安装并热重启本地插件脚本
├── assets/
│   └── logo.svg                       # 插件图标
├── rules/
│   └── AGENTS.md                      # Agent 全局提示词规则
├── skills/
│   └── matrix-bot/
│       └── SKILL.md                   # Matrix Bot 技能定义与指引
└── sidecars/
    └── matrix_console/
        ├── sidecar.json               # Sidecar 挂载与守护进程配置
        ├── package.json               # ESM 模块声明
        ├── main.mjs                   # 核心后端：Matrix 同步引擎、安全策略、多级目录浏览与 agy 调度
        ├── index.html                 # 侧栏控制台视图结构（房间 / 安全准入 / 账号与模型 / 动态）
        ├── styles.css                 # 侧栏自适应样式表（支持深浅色主题同步与 340px+ 窄栏布局）
        └── app.js                     # 侧栏控制台前端交互逻辑
```

---

## 2. 核心功能与架构特性

### 2.1 直连 Matrix Client-Server API
- 内置轻量长轮询同步循环（`/_matrix/client/v3/sync`），无需外部反代或 Webhook。
- 支持 **账号密码登录**（自动向 Homeserver 签发 `AGY-MATRIX-BOT` 设备 Token，密码仅用于单次鉴权，绝不明文落盘）与 **Access Token 直连**。

### 2.2 房间与会话绑定模型（群聊主会话署名 + Matrix Thread 子会话）
- **1 对 1 私聊 (`is_dm = true`)**：
  - 默认直接回复所有消息；每个私聊房间维护独立的 `session_id` 上下文。
  - 管理员在私聊中发送 `/status`、`/workspace`、`/model` 等斜杠指令时**无需 `@`**。
- **多人研发群聊 (`is_dm = false`)**：
  - **主聊天流共享上下文 + 发言人自动署名**：发往 `agy` 的群聊消息会自动冠以 `[群聊发言人: 显示名 (@user:server)]`，使模型在多人协同讨论同一项目时能准确区分每位成员。
  - **Matrix Thread（消息线程）自动拆分子会话**：当群成员在 Element 等客户端对某条消息开启 **Thread（线程回复）** 时，系统自动按 `threadRootId` 在 `room.thread_sessions[threadRootId]` 中维护隔离的 `agy` 子会话，并原路回复至该 Thread 内。
  - **多 Bot 防冲突机制**：群聊中执行 `/status`、`/workspace`、`/model` 等斜杠指令**必须显式 `@本机器人`**（如 `@antigravity /model`），未 `@` 的斜杠指令一律忽略，避免群内存在其他 Bot（如 `claude-mini`、`codex-mini-bot`）时发生冲突。

### 2.3 多级子目录工作区绑定
- **控制台多级下钻目录浏览器**：
  - 支持面包屑路径导航（`↑ 上级`、`默认目录 / 开发项目 / 子项目 / 模块`），自动识别标注 `Git` 仓库与下级子目录数量。
  - 点击左侧文件夹名称可无限向下进入二级、三级、四级等深层子目录；点击右侧「绑定」或顶部「绑定当前目录」即可一键绑定任意深度目录。
- **多级目录实时递归搜索**：
  - 搜索框支持在默认根目录下向下递归检索最多 4 层深度的子目录（自动过滤 `node_modules`、`.git`、`venv` 等缓存目录）。

### 2.4 安全准入与开放联邦纵深防护
在 **「安全准入」** 页签下提供四层安全控制：

1. **管理员账号白名单 (`admins`)**
   - 可配置多个具体管理员 Matrix ID（如 `@bigbear:matrix.bigbear.cool`），支持从已发现房间成员中一键点选添加。
   - 严禁 `*` 通配符提权；仅管理员可执行工作区绑定、模型切换、思考深度与策略修改命令。
2. **房间邀请准入策略 (`invite_policy`)**
   - **所有人 (`all`)**：自动接受所有邀请
   - **仅本服务器用户 (`local_server`)**：仅接受与 Bot 同域名（如 `@*:matrix.bigbear.cool`）的本服用户及管理员邀请，自动拒绝外服联邦拉群
   - **白名单 (`allowlist`)**：仅接受白名单与管理员邀请（支持 `@user:server` 或 `@*:trusted.org` 整服规则）
   - **拒绝所有邀请 (`none`)**：自动调用 `/leave` 婉拒所有新邀请
3. **接收消息名单配置 (`message_policy`)**
   - **所有人 (`all`)**：接收所有成员消息
   - **仅本服务器用户 (`local_server`)**：仅响应本服成员与管理员，静默拦截外部联邦服务器账号
   - **白名单 (`allowlist`)**：仅响应白名单与管理员
   - **黑名单 (`blocklist`)**：拦截黑名单账号或外服域名（如 `@*:matrix.org`）
   - **拒绝所有消息 (`none`)**：暂停所有普通对话响应，仅保留管理员指令通道
4. **联邦与隐私纵深防护开关**
   - **拦截含外服成员的群聊 (`federated_room_guard`，默认开启)**：当群聊存在外部联邦服务器成员或房间建在外服时，房间卡片标注 `🌐 含外服` 且自动禁止触发 Agent 回复，防止本地代码与架构跨服同步外泄。
   - **未绑定目录房间强制沙箱隔离 (`isolate_unbound_rooms`，默认开启)**：未经管理员显式绑定项目的房间强制在空沙箱目录 `~/.gemini/antigravity/plugin_data/matrix-bridge/sandbox/` 中运行，禁止回退访问本地主目录。
   - **仅管理员可触发本地工作区执行 (`admin_only_workspace`，默认关闭)**：开启后，普通群成员无法在已绑定项目的群聊中触发代码读写。
   - **出站消息密钥与本机路径自动脱敏 (`redact_sensitive`，默认开启)**：发往 Matrix 前自动将本机主目录路径替换为 `~`，并抹除疑似 Token（`syt_`、`sk-`、`ghp_`、`AIza`、私钥块）。
   - **非管理员防洪限流与超长拦截 (`rate_limit_enabled`，默认开启)**：限制非管理员每分钟最多 6 次请求、单条消息不超过 12,000 字符。

### 2.5 多模态媒体与附件双向互通
- **入站附件下载与多模态分析**：
  - 成员在 Matrix 发送的图片（PNG、JPEG、WebP、GIF）、文档（PDF、TXT、Markdown、JSON、代码）及音视频文件，插件将通过 Matrix Media API 自动鉴权下载并保存至 `plugin_data/matrix-bridge/attachments/<roomId>/`。
  - 插件自动向 `agy` CLI 组装多模态提示词，包含附件名称、文件类型、大小、图像分辨率以及本地绝对路径，并引导模型使用内置的 `read_file` 工具读取该路径，实现开箱即用的多模态图像识别、代码审查与文档分析。
  - 内置 **50MB** 单文件安全阈值拦截与下载流控。
- **出站媒体自动检测与原生投递**：
  - Agent 回复中包含的本地 Markdown 图片语法（`![alt](path)`）或文件导出标记（`<send-file path="..." />` / `[SEND_FILE: path]`），插件会自动校验本地路径、读取二进制流、识别图像尺寸并通过 `POST /_matrix/media/v3/upload` 上传至 Matrix 媒体库。
  - 自动向当前房间或正在对话的 Thread 线程发送原生 `m.image` 或 `m.file` 消息事件，并保留附带的文本说明。
- **管理员一键推送文件**：
  - 管理员可随时使用 `/sendfile <路径>`（别名 `/upload`）直接向房间发送本地图表、安装包或生成报告。

---

## 3. 聊天指令速查

> **触发规则**：1 对 1 私聊直接发送指令（无需 `@`）；群聊中请先 `@本机器人` 再接指令（如 `@antigravity /status`）。

| 指令 | 权限 | 说明 |
| :--- | :--- | :--- |
| `/status` | 全体 | 查看当前房间绑定目录、生效模型、思考深度、联邦状态与会话 ID |
| `/help` | 全体 | 查看指令帮助 |
| `/workspace` | 全体 | 查看当前房间绑定的工作目录（简写 `/ws`） |
| `/workspace list [子路径]` | 管理员 | 浏览默认根目录或指定多级子目录下的文件夹列表 |
| `/workspace bind <多级路径>` | 管理员 | 绑定默认目录下的多级相对路径或任意绝对路径（切换目录自动重置上下文） |
| `/workspace unbind` | 管理员 | 解除当前房间的工作目录绑定 |
| `/model` 或 `/model list` | 全体 | 查看当前模型及 `agy models` 可用模型编号列表 |
| `/model <序号或模型ID>` | 管理员 | 切换当前房间的专属对话模型 |
| `/model global <序号或模型ID>` | 管理员 | 切换全局默认对话模型 |
| `/model default` | 管理员 | 恢复当前房间跟随全局默认模型 |
| `/effort <low\|medium\|high\|xhigh\|max\|default>` | 管理员 | 设置当前房间思考深度（别名 `/thinking`、`/reasoning`；加 `global` 设置全局） |
| `/policy <mention\|all\|mute\|default>` | 管理员 | 切换当前房间群聊触发策略 |
| `/sendfile <文件路径>` | 管理员 | 上传并发送本地文件/媒体至当前房间（别名 `/upload`） |
| `/new`（或 `/reset`） | 管理员 (私聊全体) | 重置当前房间主会话或当前 Thread 的独立对话上下文 |

---

## 4. 安装、同步与运行数据目录

### 4.1 一键同步到 Antigravity 插件目录
修改本目录（`/Users/xiangyu/开发项目/matrix-bridge/antigravity`）下的源码后，可执行 `./install.sh` 一键同步至全局插件目录并热重启 Sidecar：

```bash
cd /Users/xiangyu/开发项目/matrix-bridge/antigravity
./install.sh
```

- **全局插件安装路径**：`~/.gemini/config/plugins/matrix-bridge/`
- **运行期持久化数据路径**：`~/.gemini/antigravity/plugin_data/matrix-bridge/`
  - `config.json`：账号凭证、管理员白名单、邀请与消息策略、联邦防护开关、默认模型与思考深度
  - `rooms.json`：已同步房间元数据、每个房间绑定的工作区路径、模型/思考深度覆盖及 `session_id` / `thread_sessions`
  - `sandbox/`：未绑定工作区房间的受限隔离沙箱目录
  - `attachments/`：自动按房间划分存储的接收媒体与附件（图片、PDF、文档、音视频）
