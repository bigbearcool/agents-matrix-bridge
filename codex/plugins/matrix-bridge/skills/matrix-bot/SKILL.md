---
name: matrix-bot
description: Inspect and manage the local Codex Matrix bridge bot — connection status, joined rooms, workspace bindings, reply policies, admin whitelists, invite/message security policies, federation privacy guards, models/effort, media attachments, and the embedded panel.
---

# Matrix Bot Manager (Codex)

本 Skill 用于引导与管理 Codex 的 Matrix 原生插件（matrix-bridge）。

## 1. 快捷面板与管理台

用户可在聊天中或侧栏使用 `matrix_bridge_open` 工具打开 Codex 内嵌的 **Matrix Bridge 管理台**（也可直接访问 http://127.0.0.1:47614/）：
- **房间**：房间筛选（全部/群聊/私聊/已绑定）、多级下钻目录树选择器与最多 4 层深度递归搜索、房间专属模型与思考深度选择、触发策略调整、重置上下文、历史会话候选迁移选择与事件核对。
- **安全准入**：管理员白名单（支持房间成员快速选入）、邀请准入策略、接收消息名单配置、联邦群聊自动静默防护、未绑定目录强制沙箱、出站文本脱敏、防洪限流。
- **账号与模型**：账号密码登录与 Access Token 登录、全局默认模型与思考深度配置、群聊默认策略与项目根目录配置、指令速查。
- **动态**：实时审计与运行事件日志流、按日志级别筛选（普通/消息/安全/异常）、一键清空日志。

管理台 UI 与 Antigravity 管理台完全对齐。

## 2. 常用 MCP 工具（前缀 matrix_bridge_）

| 工具 | 说明 |
| :--- | :--- |
| `matrix_bridge_open` | 在 Codex 中打开内嵌 Matrix Bridge 管理控制台 |
| `matrix_bridge_status` | 查看运行状态、账号、房间数、同步状态 |
| `matrix_bridge_config` | 查看非秘密安全与运行配置 |
| `matrix_bridge_update_config` | 修改管理员白名单、邀请/消息策略、联邦防护等安全配置 |
| `matrix_bridge_models` | 获取 Codex 可用模型列表与当前默认设置 |
| `matrix_bridge_defaults` | 设置全局默认模型和思考深度 |
| `matrix_bridge_rooms` | 查看房间列表、工作区绑定、回复策略、模型与思考深度 |
| `matrix_bridge_update_room` | 修改房间工作区、回复策略、专属模型或思考深度 |
| `matrix_bridge_browse` | 多级下钻浏览工作区目录 |
| `matrix_bridge_search` | 在默认项目根目录下递归搜索子目录 |
| `matrix_bridge_projects` | 获取默认根目录下的项目列表 |
| `matrix_bridge_auth` | 验证并设置账号凭据（仅保留在进程内存，不落盘） |
| `matrix_bridge_logout` | 清除凭据并暂停同步 |
| `matrix_bridge_connection` | 暂停或恢复同步 |
| `matrix_bridge_migration` | 选择旧房间会话的迁移候选 |
| `matrix_bridge_reconcile` | 人工核对未知结果后继续房间队列 |
| `matrix_bridge_logs` / `matrix_bridge_clear_logs` | 查看或清空运行事件与审计日志 |

## 3. 聊天指令（Matrix 客户端内）

> 私聊直接发送指令；群聊须先 `@本机器人` 再接指令（避免与群内其他 Bot 冲突）。

- `/status` — 查看当前房间工作目录、触发策略、模型、思考深度
- `/help` — 查看指令指南
- `/workspace [list [子路径] | bind <多级路径> | unbind]` — 浏览或绑定任意层级的工作目录（简写 `/ws`）
- `/model [list | <模型ID> | global <模型> | default]` — 查看或切换房间/全局模型（管理员）
- `/effort [minimal|low|medium|high|xhigh|max|default]` — 设置思考深度（管理员，别名 `/thinking`、`/reasoning`）
- `/policy [mention|all|mute|default]` — 切换房间触发策略（管理员）
- `/sendfile <路径>` — 上传并发送本地文件/图片至当前房间（管理员，别名 `/upload`）
- `/new`（`/reset`） — 重置当前房间主会话或当前 Thread 独立子会话（群聊限管理员）

## 4. 多模态媒体与附件双向互通

- **入站多模态**：发送的图片、代码、文档附件自动安全校验并下载至本地私有目录，组装本地路径供 Codex 处理分析。
- **出站媒体自动投递**：模型回复中的 Markdown 图片语法 `![alt](path)` 或 `<send-file path="..." />` / `[SEND_FILE: path]` 标记，自动读取、尺寸检测并上传至 Matrix 媒体库，以原生 `m.image` / `m.file` 事件发送。
- **管理员文件发送**：使用 `/sendfile <文件路径>` 一键向房间推送本地图表或文件。

## 5. 安全准入与纵深防护

- **凭证安全隔离**：Token 和密码绝不写入磁盘配置文件，仅保留在当前运行进程内存中。
- **四层纵深防护**：管理员白名单严格校验；房间邀请与消息白名单/黑名单；群聊含外服成员时自动拦截静默；未绑定目录强制在独立受限沙箱中运行；出站文本密钥/路径脱敏；非管理员防洪限流。
