---
name: matrix-bot
description: Manage the ZCode Matrix Bridge bot — connection status, joined rooms, per-room workspace bindings, trigger policies, admin whitelists, invite/message security policies, federation privacy guards, models/effort, media attachments, and the 24/7 LaunchAgent daemon. Chat commands are dispatched to headless `zcode -p` sessions.
---

# Matrix Bot Manager (ZCode)

本 Skill 用于引导与管理 ZCode 的 Matrix 原生插件（matrix-bridge）。

## 1. 架构速览

- **引擎守护进程**：`~/.zcode/matrix-bridge/engine/main.mjs`，由 LaunchAgent `ai.bigbear.zcode-matrix-bridge` 常驻运行（24/7，与 ZCode 桌面是否打开无关）。
- **消息调度**：每条触发消息以 `zcode -p <提示词> --json [--resume <sessionId>] [--model <model>]` 无头执行，解析 JSON 输出中的 `sessionId` 与 `response`；主聊天流共享会话，Matrix Thread 自动拆分独立子会话。
- **可视化管理控制台**：http://127.0.0.1:47613/ （仅监听本机回环地址）。
- **运行数据**：`~/.zcode/matrix-bridge/`（`config.json` 账号与安全策略、`rooms.json` 房间绑定与会话、`sandbox/` 未绑定房间的隔离沙箱、`attachments/` 多模态附件持久化、`logs/` 守护进程日志）。

## 2. 右侧管理面板与 UI 对齐

插件在 ZCode 桌面注册了右侧切换面板 **Matrix Bot**（`ui.surfaces`，mcp-app 面板）：
- **房间**：房间筛选（全部/群聊/私聊/已绑定）、多级下钻目录树选择器与最多 4 层深度递归搜索、房间专属模型与思考深度选择、触发策略调整、重置上下文。
- **安全准入**：管理员白名单（支持房间成员快速选入）、邀请准入策略、接收消息名单配置、联邦群聊自动静默防护、未绑定目录强制沙箱、出站文本脱敏、防洪限流。
- **账号与模型**：账号密码登录与 Access Token 登录、全局默认模型与思考深度配置、群聊默认策略与项目根目录配置、ZCode CLI 路径高级配置、指令速查。
- **动态**：实时审计与运行事件日志流、按日志级别筛选（普通/消息/安全/异常）、一键清空日志。

面板直连守护进程 API（CSP 白名单放行 127.0.0.1:47613），与 Antigravity 管理台 UI 完全对齐。

## 3. 常用 MCP 工具（前缀 matrix_bridge_）

| 工具 | 说明 |
| :--- | :--- |
| `matrix_bridge_status` | 连接状态、账号、房间数、同步状态 |
| `matrix_bridge_config` | 读取（get）或修改（set, action）安全策略/管理员/默认目录/默认模型/思考深度 |
| `matrix_bridge_models` | 获取可用模型列表与思考深度档位 |
| `matrix_bridge_rooms` | 列出已同步房间、绑定目录、生效策略、模型与思考深度、联邦状态 |
| `matrix_bridge_room_update` | 按房间绑定工作区 / 切换模型与思考深度 / 切换触发策略 / 重置会话 |
| `matrix_bridge_fs_browse` / `matrix_bridge_fs_search` | 多级目录浏览与递归搜索（用于选择绑定目录） |
| `matrix_bridge_projects` | 扫描默认项目根目录下的项目列表 |
| `matrix_bridge_login` / `matrix_bridge_token` | 账号密码登录 / Access Token 直连 |
| `matrix_bridge_logout` | 退出账号连接 |
| `matrix_bridge_connect` / `matrix_bridge_disconnect` | 启动或暂停同步 |
| `matrix_bridge_logs` / `matrix_bridge_clear_logs` | 获取或清空运行与安全拦截日志 |
| `matrix_bridge_daemon` | 守护进程 install/start/stop/restart/status/uninstall |

## 4. 聊天指令（Matrix 客户端内）

> 私聊直接发送指令；群聊须先 `@本机器人` 再接指令（避免与群内其他 Bot 冲突）。

- `/status` — 查看当前房间绑定目录、触发策略、使用模型、思考深度、联邦状态与会话 ID
- `/help` — 指令帮助
- `/workspace`（`/ws`）— 查看当前绑定；`/workspace list [子路径]` 浏览多级目录；`/workspace bind <多级路径>` 绑定；`/workspace unbind` 解绑（后三者管理员）
- `/model [list | <序号或模型ID> | global <模型> | default]` — 查看或切换房间/全局模型（管理员）
- `/effort [low|medium|high|xhigh|max|default]` — 设置思考深度（管理员，别名 `/thinking`、`/reasoning`）
- `/policy [mention|all|mute|default]` — 切换房间触发策略（管理员）
- `/sendfile <路径>` — 上传并发送本地文件/图片至当前房间（管理员，别名 `/upload`）
- `/new`（`/reset`） — 重置当前房间主会话或当前 Thread 独立子会话（群聊限管理员）

## 5. 多模态媒体与附件双向互通

- **入站多模态**：发送的图片、代码、文档附件自动安全校验并下载至本地持久化目录，组装提示词引导模型读取分析。
- **出站媒体自动投递**：模型回复中的 Markdown 图片语法 `![alt](path)` 或 `<send-file path="..." />` / `[SEND_FILE: path]` 标记，自动读取、尺寸检测并上传至 Matrix 媒体库，以原生 `m.image` / `m.file` 事件发送。
- **管理员文件发送**：使用 `/sendfile <文件路径>` 一键向房间推送本地图表或文件。

## 6. 安全模型（与 Antigravity 版完全一致）

- **四层纵深防护**：管理员白名单严格校验；房间邀请与消息白名单/黑名单；群聊含外服成员时自动拦截静默；未绑定目录强制在独立受限沙箱中运行；出站文本密钥/路径脱敏；非管理员每分钟 6 次限流拦截。
