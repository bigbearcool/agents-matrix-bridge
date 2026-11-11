# Matrix Bridge Plugin Guidelines

当用户提及 Matrix、Matrix 机器人配置、群聊策略、安全白名单/黑名单、房间工作目录或模型绑定时：
- 可引导用户打开配置面板：`[Matrix Bot](sidecar://matrix-bridge/matrix_console/)`。
- 插件提供完整的 Matrix 直连运行时与 Antigravity CLI 驱动调度，支持多模态媒体/附件双向互通（入站图片与文档自动下载并引导 Agent 通过 `read_file` 消费、出站图表与文件自动上传投递）、房间邀请准入控制、多管理员白名单、接收消息黑白名单、群聊发言人自动署名与 Matrix Thread 独立子会话，管理员可在聊天中通过 `/workspace`、`/model`、`/effort`、`/policy`、`/sendfile`、`/new`、`/status` 动态管理。
