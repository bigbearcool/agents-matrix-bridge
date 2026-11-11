# ZCode Matrix Bridge 插件（`matrix-bridge`）

将 ZCode 以**原生 Bot 身份 24/7 接入 Matrix**：不依赖 cc-connect 桥接，聊天消息由常驻守护进程直接同步，并按消息无头调度 `zcode -p ... --json` 会话执行。本插件参照 Antigravity 版 Matrix 插件（`../antigravity/`）开发，安全模型与其保持一致。

---

## 1. 目录结构

```text
ZCODE/
├── README.md                              # 本说明
├── docs/
│   └── migration-from-cc-connect.md       # cc-connect → 原生插件迁移手册（含回滚）
├── tools/console-build/                   # 面板 mcp-app 连接器构建（产物提交，不入安装树）
│   ├── connector.src.js                   # 连接器源码（ext-apps SDK 握手 + 主题跟随）
│   └── build.mjs                          # esbuild 打包脚本（npm run build）
└── plugins/                               # 本地开发市场根目录（添加市场时粘贴此目录）
    ├── marketplace.json                   # 本地市场目录
    └── matrix-bridge/                     # 插件源码
        ├── .zcode-plugin/plugin.json      # ZCode 插件清单（skills + MCP + ui 面板）
        ├── skills/matrix-bot/SKILL.md     # Agent 技能指引
        ├── mcp/server.mjs                 # MCP 管理服务器（stdio，转发到守护进程 API + 提供面板资源）
        └── engine/                        # 引擎（会被复制到 ~/.zcode/matrix-bridge/engine 常驻运行）
            ├── main.mjs                   # Matrix 同步引擎 + zcode 调度 + 管理 API + 控制台服务
            ├── daemonctl.mjs              # LaunchAgent 守护进程安装/启停管理器
            └── console/                   # 可视化管理控制台 (http://127.0.0.1:47613/)
                ├── index.html
                ├── app.js
                ├── styles.css
                └── vendor/mcp-app-connector.js  # 构建产物：ZCode 面板 mcp-app 握手连接器
```

**与 Antigravity 版的关键差异**：

| 维度 | Antigravity 版 | ZCode 版 |
| :--- | :--- | :--- |
| 宿主形态 | Sidecar 守护进程（宿主内嵌面板） | LaunchAgent 独立守护进程 + 浏览器控制台 |
| Agent 调度 | `agy --print --output-format=json` | `zcode -p --json`（`--resume` 续会话） |
| 模型/思考深度 | `/model`、`/effort` 按房间切换 | 不支持（无对应 CLI 参数），已移除，模型随 ZCode 全局配置 |
| 会话模型 | `--conversation=<id>` | `--resume sess_<id>`（输出 JSON 的 `sessionId` 字段回填） |
| 运行数据 | `~/.gemini/antigravity/plugin_data/matrix-bridge/` | `~/.zcode/matrix-bridge/` |
| 管理入口 | Antigravity 侧栏 sidecar 面板 | ZCode 会话内 MCP 工具 + 浏览器控制台 |

## 2. 架构

```text
Matrix Homeserver (matrix.bigbear.cool:8443)
        ▲  /sync 长轮询
        │
┌───────┴────────────────────────────────────────────┐
│ LaunchAgent ai.bigbear.zcode-matrix-bridge (24/7)  │
│  ~/.zcode/matrix-bridge/engine/main.mjs            │
│  ├─ Matrix 同步引擎（邀请/消息准入、联邦防护、限流） │
│  ├─ 房间/Thread 会话管理（rooms.json）             │
│  ├─ 每消息: spawn zcode -p <提示词> --json         │
│  │          [--resume <sess>] --cwd <绑定目录>      │
│  └─ 管理 API + 控制台 @ 127.0.0.1:47613            │
└───────┬────────────────────────────────────────────┘
        ▲ HTTP (127.0.0.1)
┌───────┴──────────────┐   ┌─────────────────────────┐
│ MCP server.mjs       │   │ 浏览器控制台             │
│ (ZCode 会话内管理工具)│   │ (http://127.0.0.1:47613)│
└──────────────────────┘   └─────────────────────────┘
```

- **会话模型**：主聊天流共享一个 `sessionId`（群聊消息自动冠以 `[群聊发言人: 显示名 (@user:server)]` 署名）；Matrix Thread 按 `threadRootId` 隔离子会话并原路回复到线程内。
- **沙箱隔离**：未绑定目录的房间默认在 `~/.zcode/matrix-bridge/sandbox/` 受限运行，严禁触碰宿主主目录。
- **守护进程独立性**：引擎与 ZCode 桌面应用解耦，桌面是否打开都不影响 Bot 在线；MCP 工具只是「遥控器」。

## 3. 安装

### 3.1 本地市场安装（开发期）

1. 打开 ZCode → **插件市场 → 添加 → 添加插件市场**，粘贴目录：
   `/Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins`
2. **个人 → dev-matrix-bridge-zcode → Matrix Bridge (ZCode) → 安装**。

或使用 CLI：

```bash
zcode plugins marketplace add /Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins
zcode plugins install matrix-bridge@dev-matrix-bridge-zcode
```

### 3.2 启动常驻守护进程（必做）

插件安装后 MCP 工具即可用，但 Bot 在线需要守护进程：

```bash
node /Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins/matrix-bridge/engine/daemonctl.mjs install
```

`install` 会把引擎复制到稳定目录 `~/.zcode/matrix-bridge/engine/` 并注册 LaunchAgent（开机自启、崩溃自动拉起）。也可在 ZCode 会话中让 Agent 调用 MCP 工具 `matrix_bridge_daemon`。

> 插件缓存目录带版本号，更新插件后**必须重跑 `daemonctl install`** 同步引擎（配置与房间数据不受影响）。

### 3.3 配置账号

浏览器打开 [http://127.0.0.1:47613/](http://127.0.0.1:47613/)：
- **账号密码登录**：向 Homeserver 签发 `ZCODE-MATRIX-BOT` 设备 Token（密码不落盘）；
- **Access Token 直连**：适合从 cc-connect 等旧桥迁移复用令牌（自动 `/whoami` 校验）。

## 4. 运行数据目录 `~/.zcode/matrix-bridge/`

| 路径 | 用途 |
| :--- | :--- |
| `config.json` | 账号凭证、管理员白名单、邀请/消息策略、防护开关、默认目录、zcode_cmd |
| `rooms.json` | 房间元数据、工作区绑定、`session_id` / `thread_sessions` |
| `engine/` | 守护进程运行的引擎副本（daemonctl install 维护） |
| `sandbox/` | 未绑定目录房间的受限隔离沙箱 |
| `logs/` | 守护进程 stdout/stderr 日志 |

## 5. 聊天指令速查

> **触发规则**：私聊直接发送；群聊先 `@机器人` 再接指令。

| 指令 | 权限 | 说明 |
| :--- | :--- | :--- |
| `/status` | 全体 | 查看绑定目录、触发策略、联邦状态与会话 |
| `/help` | 全体 | 指令帮助 |
| `/workspace`（`/ws`） | 全体 | 查看当前绑定 |
| `/workspace list [子路径]` | 管理员 | 浏览默认根目录或任意多级子目录 |
| `/workspace bind <多级路径>` | 管理员 | 绑定目录（切换自动重置会话） |
| `/workspace unbind` | 管理员 | 解除绑定 |
| `/policy <mention\|all\|mute\|default>` | 管理员 | 切换房间触发策略 |
| `/new`（`/reset`） | 管理员(私聊全体) | 重置房间主会话或当前 Thread 子会话 |

## 6. 安全准入（与 Antigravity 版一致）

1. **管理员白名单**：仅具体 MXID，严禁 `*`；仅管理员可执行绑定/策略/重置指令。
2. **邀请准入** `invite_policy`：all / local_server / allowlist（支持 `@*:domain`）/ none。
3. **消息准入** `message_policy`：all / local_server / allowlist / blocklist / none（管理员始终放行）。
4. **联邦纵深防护**：含外服成员群聊自动静默（`federated_room_guard`）、未绑定房间沙箱隔离（`isolate_unbound_rooms`）、仅管理员触发工作区（`admin_only_workspace`）、出站路径与密钥脱敏（`redact_sensitive`）、非管理员限流 6 次/分钟 + 12000 字符（`rate_limit_enabled`）。

## 7. 运维

```bash
D=~/.zcode/matrix-bridge/engine/daemonctl.mjs   # 或用插件源内 daemonctl.mjs
node $D status    # 守护进程与 Bot 在线状态
node $D restart   # 重启（改配置后生效）
node $D stop      # 停止
node $D install   # 重新同步引擎（插件升级后）
node $D uninstall # 停止并移除自启（保留 config/rooms 数据）
```

- 控制台：[http://127.0.0.1:47613/](http://127.0.0.1:47613/)（仅本机回环）
- 守护进程日志：`~/.zcode/matrix-bridge/logs/daemon.out.log`
- 出站消息自动把主目录路径替换为 `~` 并抹除 `syt_`/`sk-`/`ghp_`/`AIza`/私钥块。

## 8. 从源码更新插件

1. 修改 `ZCODE/plugins/matrix-bridge/` 源码，`plugin.json` 的 `version` 递增。
2. 若改了面板连接器（`tools/console-build/connector.src.js`），先重建产物：
   `cd tools/console-build && npm install && npm run build`（生成 `engine/console/vendor/mcp-app-connector.js`，产物随源码提交）。
3. 同步守护进程引擎：`node engine/daemonctl.mjs install`。
4. ZCode 插件市场 → 对应市场 → 刷新 → 更新插件（或 CLI `zcode plugins update matrix-bridge`）。

> **ZCode 右侧面板（mcp-app）说明**：面板 HTML 由 `mcp/server.mjs` 在 `resources/read` 时内联生成，其中 `vendor/mcp-app-connector.js` 负责与宿主完成 `ui/initialize` 握手（官方 ext-apps SDK），面板数据统一经 `app.callServerTool` 走 MCP 工具通道；浏览器直开 `http://127.0.0.1:47613/` 时不加载连接器，走 fetch 直连守护进程。
