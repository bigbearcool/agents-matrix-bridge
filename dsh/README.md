# DSH Matrix Bridge（DeepSeek Harness 桌面插件）

把 DeepSeek Harness（DSH）接入 Matrix 的宿主插件：Matrix 房间里的消息交给
`dsh --profile headless` 回答，本地管理控制台负责登录、房间绑定、工作目录、
模型和准入策略。

- 插件类型：DSH bundle patch（`package.json` 的 `dsh.bundle.patch`）
- 控制台端口：`127.0.0.1:47616`
- 适配器：`adapters/dsh/index.mjs`（`DshAdapter`）
- 数据目录：`~/.dsh/matrix-bridge/`（`config.json`、`state.json`、`logs/`）

## 安装到 DSH 桌面

```bash
# 在仓库根目录执行；路径必须是绝对路径
dsh plugin --profile desktop add "$(pwd)/dsh"
```

`package.json` 声明了 `dsh.bundle.patch`，插件管理器会把这个包追加到桌面
profile 的 bundle 层栈，并把下面的行插入 Cordis 树：

```yaml
- insert:
    - id: dsh-matrix-bridge
      name: "dsh-matrix-bridge"
      config: {}
```

重启 DSH 桌面（或让 profile 热重载生效）后，控制台应就绪：

```bash
curl -s http://127.0.0.1:47616/api/status
open http://127.0.0.1:47616/
```

插件在 Cordis 中 `inject` 了 `sessionController`、`sessionQuery` 和
`workspaceRegistry`；未设置工作目录时，默认取 `workspaceRegistry` 里第一个
项目目录。Cordis 卸载该行（改配置、禁用插件、退出桌面）时通过 `ctx.effect`
停止 Matrix 同步、结束在跑的 `dsh` 子进程并关闭控制台监听。

## 独立守护进程（可选）

不想让桥接进程跟着桌面 UI 生命周期时，用 LaunchAgent 常驻：

```bash
node dsh/engine/daemonctl.mjs install    # 复制引擎到 ~/.dsh/matrix-bridge/engine 并注册自启
node dsh/engine/daemonctl.mjs status     # 进程状态 + 控制台探测
node dsh/engine/daemonctl.mjs restart    # 插件升级后同步引擎并原地重启
node dsh/engine/daemonctl.mjs uninstall  # 移除 plist 与引擎副本，保留 config/state/logs
```

- LaunchAgent：`ai.bigbear.dsh-matrix-bridge`
- 稳定引擎目录：`~/.dsh/matrix-bridge/engine/`
- 日志：`~/.dsh/matrix-bridge/logs/daemon.{out,err}.log`

两种方式共用同一份配置与状态，同一时间只应启用一种。守护进程用
`state.json.lock` 单实例锁阻止重复启动；插件则把控制台端口（默认 `47616`）
被占用视为已有实例在跑，停止自己的 Matrix 连接并记录日志。

## 配置

首次启动从 `~/.dsh/matrix-bridge/config.json` 读取配置（不存在则用内置默认值）。
推荐直接在控制台完成：

| 配置 | 说明 |
| --- | --- |
| `homeserver` / `user_id` | Matrix 账号；密码登录后控制台只保存 token |
| `allowed_senders` / `admins` | 私聊白名单与管理员 |
| `cwd` | 房间默认工作目录（可在房间里用 `/workspace` 切换） |
| `console_port` | 控制台端口，默认 `47616` |
| `dsh_cmd` | DSH CLI 路径，默认 `~/bin/dsh` 或 `dsh` |
| `dsh_profile` | headless profile 名，默认 `headless` |
| `permission_mode` / `approval_policy` | 默认 `workspace-write` / `never` |
| `turn_timeout_ms` | 单轮超时，默认 30 分钟 |
| `models` / `efforts` | 覆盖控制台展示的模型目录 |

`cordis.patch.yml` 里该行的 `config` 会覆盖配置文件同名字段；留空对象即完全
交给控制台管理。

## Matrix 房间里的行为

- 每轮执行：`dsh --profile headless --json --permission-mode workspace-write
  --approval-policy never [--session-id <id>] <prompt>`
- `session` 事件里的 `sessionId` 会作为房间的 `thread_id` 保存，后续消息用
  `--session-id` 续聊；DSH 侧会话被删除时适配器会自动重开新会话。
- `final.text` 作为回复；为空时回退到已提交的 `text` 事件拼接。
- 回复里的 `[SEND_FILE: <path>]`、`<send-file path="…" />` 和 Markdown 图片
  会被识别为附件发送。
- 房间命令 `/new`、`/model`、`/effort`、`/workspace` 由 core 内核处理；
  `/new` 只清除桥接侧的会话令牌，不删除 DSH 的会话历史。

## 目录结构

```text
dsh/
├── package.json           # DSH 插件清单（dsh.bundle.patch）
├── cordis.patch.yml       # 插入 dsh-matrix-bridge 行
└── engine/
    ├── index.mjs          # Cordis 插件入口（apply / inject / name）
    ├── main.mjs           # 独立引擎入口（daemonctl / 手工启动）
    ├── daemonctl.mjs      # LaunchAgent 管理器
    ├── adapter.mjs        # 由 adapters/dsh/index.mjs 同步而来
    ├── core/              # 由 packages/matrix-core/src 同步而来
    └── console/           # 由 packages/matrix-console-ui/dist 同步而来
```

`engine/adapter.mjs`、`engine/core/` 和 `engine/console/` 是真理源的发布副本：
修改适配器请改 `adapters/dsh/index.mjs`，修改 UI 请改
`packages/matrix-console-ui/src/`，然后按仓库的同步脚本重新分发。
