---
name: matrix-bot
description: Manage Matrix Bot integration, check connected Matrix rooms, configure invite/message security policies, federation privacy guards, admin accounts, models/effort, per-room group chat policies and multi-level project directory bindings.
---

# Matrix Bot Manager

本 Skill 用于引导与管理 Antigravity 的 Matrix Bot 插件。

## 1. 快捷面板

用户可以通过辅助面板打开可视化管理控制台：
- [Matrix Bot](sidecar://matrix-bridge/matrix_console/)

## 2. 核心功能说明

1. **账号与模型配置（「账号与模型」页签）**：
   - 支持输入 Matrix Homeserver（如 `https://matrix.bigbear.cool:8443`）、用户名与密码一键登录签发专属 Device Token（密码不明文落盘），或直接输入现有 Access Token。
   - 支持设置全局默认对话模型（自动读取 `agy models`）与全局默认思考深度（`low | medium | high | xhigh | max`）。
2. **安全准入与联邦隐私纵深防护（「安全准入」页签）**：
   - **管理员账号 (`admins`)**：可配置多个管理员 Matrix 账号（如 `@user:server`），支持一键从已发现房间成员快速添加。
   - **房间邀请准入策略 (`invite_policy`)**：可选 **所有人 (`all`)** / **仅本服务器用户 (`local_server`)** / **白名单 (`allowlist`)** / **拒绝所有邀请 (`none`)**。支持整服域名规则 `@*:domain.com`。
   - **接收消息名单配置 (`message_policy`)**：可选 **所有人 (`all`)** / **仅本服务器用户 (`local_server`)** / **白名单 (`allowlist`)** / **黑名单 (`blocklist`)** / **拒绝所有消息 (`none`)**（管理员始终放行）。
   - **联邦与隐私纵深防护**：
     - **拦截含外服成员的群聊 (`federated_room_guard`)**：群内有外部联邦服务器成员或属外服房间时自动静默，防止本地代码跨服同步外泄。
     - **未绑定目录房间强制沙箱隔离 (`isolate_unbound_rooms`)**：未绑定项目的房间强制在独立受限沙箱运行，禁止回退访问本地主目录。
     - **仅管理员可触发本地工作区执行 (`admin_only_workspace`)**：限制仅管理员可调用工作区读写与命令执行。
     - **出站消息密钥与本机路径脱敏 (`redact_sensitive`)**：自动将本机主目录路径替换为 `~` 并擦除疑似 Token/Key/私钥。
     - **非管理员防洪限流与超长拦截 (`rate_limit_enabled`)**：限制非管理员单分钟请求频次与最大字符长度。
3. **房间、会话与多级工作区管理（「房间」页签）**：
   - **多级工作目录选择器**：支持面包屑导航逐级下钻任意深度子目录、随时一键绑定当前层级目录或子目录，并支持最多 4 层深度的跨级目录实时搜索。
   - **会话模型**：主聊天流共享上下文并自动为群聊消息注入 `[群聊发言人: 昵称 (@user:server)]` 署名；在 Matrix 客户端开启 **Thread（消息线程）** 时自动拆分为独立子会话。
4. **多模态与媒体附件支持**：
   - **入站多模态**：用户在私聊或群聊发送的图片（PNG、JPEG、WebP、GIF）、文档（PDF、TXT、Markdown、JSON、代码）及音频视频附件，插件自动安全校验并下载至本地持久化目录，提示词自动携带本地绝对路径并引导 Antigravity CLI 使用 `read_file` 工具直接进行多模态分析。
   - **出站媒体自动投递**：Agent 生成的图表、本地图片（`![alt](path)`）或文件导出（`<send-file path="..." />` / `[SEND_FILE: path]`）会自动由插件读取、尺寸识别并上传至 Matrix 媒体库，以原生 `m.image` / `m.file` 消息投递至当前房间或 Thread。
   - **管理员文件发送**：管理员可在聊天中使用 `/sendfile <文件路径>` 直接将服务器本地文件或图片推送到当前房间。
5. **管理员聊天命令**：
   - `/workspace [list [子路径] | bind <多级路径> | unbind]`：浏览或绑定任意层级的工作目录（简写 `/ws`）。
   - `/model [list | <序号或模型ID> | global <模型> | default]`：查看或切换房间/全局模型。
   - `/effort [low | medium | high | xhigh | max | default]`：切换房间/全局思考深度（别名 `/thinking`、`/reasoning`）。
   - `/policy [mention | all | mute | default]`：切换当前房间触发策略。
   - `/sendfile <路径>`：上传并发送本地文件/媒体至当前房间（别名 `/upload`）。
   - `/new`（或 `/reset`）、`/status`、`/help`。
