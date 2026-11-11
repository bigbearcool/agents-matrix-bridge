# 迁移手册：ZCode 接入 Matrix 由 cc-connect → 原生插件

- **迁移对象**：`@zcode-mini:matrix.bigbear.cool`（此前由 `cc-matrix-isolated-test-20261108-a` 目录的 cc-connect + zcode-acp 桥接，LaunchAgent `ai.bigbear.zcode-mini-matrix`）
- **迁移目标**：ZCode 原生插件 `matrix-bridge`（LaunchAgent `ai.bigbear.zcode-matrix-bridge`），账号不变、令牌复用，房间与行为对群成员无感知。
- **执行日期**：2026-11-10（首次执行）。

## 行为对照（cc-connect → 原生插件）

| 维度 | cc-connect (旧) | 原生插件 (新) |
| :--- | :--- | :--- |
| 账号 | `@zcode-mini:matrix.bigbear.cool` | 同一账号，同一 access_token（token 直连校验） |
| 管理员 | `admin_from: @bigbear, @yuanzhang` | `admins: [@bigbear, @yuanzhang]` |
| 根目录 | `base_dir: /Users/xiangyu/开发项目` | 相同 |
| 群聊触发 | `group_reply_all: false`（仅点名） | `default_policy: mention`（等价） |
| 邀请 | `auto_join: true` | `invite_policy: all`（等价） |
| 消息准入 | `allow_from: "*"` | `message_policy: all`（等价） |
| 会话 | `share_session_in_channel: true` | 主流共享 sessionId + Thread 独立子会话（增强） |
| 沙箱/联邦防护/脱敏/限流 | 无 | 默认开启（增强，见 README §6） |
| 按房间绑定目录 | 无（仅全局 base_dir） | 支持（/workspace bind + 控制台多级浏览器） |

> 注意：迁移会丢失 cc-connect 侧的旧对话上下文（新引擎从全新会话开始）；房间绑定需在控制台按房间重新设置一次。

## 迁移步骤（已按此执行）

1. **安装插件**（市场目录 `/Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins`）：
   ```bash
   zcode plugins marketplace add /Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins
   zcode plugins install matrix-bridge@dev-matrix-bridge-zcode
   ```
2. **预写配置** `~/.zcode/matrix-bridge/config.json`：homeserver、从 cc-connect `config.toml` 迁移的 `access_token`/`user_id`、admins、base_dir、`default_policy=mention`、`zcode_cmd=/Users/xiangyu/bin/zcode`、`auto_connect=true`。
3. **停止旧桥**（避免双实例对同一消息重复回复）：
   ```bash
   launchctl bootout gui/$(id -u)/ai.bigbear.zcode-mini-matrix
   launchctl disable gui/$(id -u)/ai.bigbear.zcode-mini-matrix   # 持久禁用，防止重启后双实例
   ```
   plist 保留在 `~/Library/LaunchAgents/` 供回滚；cc-connect 目录与 config.toml 原样保留。
4. **安装并启动新守护进程**：
   ```bash
   node <插件>/engine/daemonctl.mjs install
   ```
5. **验证**：
   - `curl http://127.0.0.1:47613/api/status` → `sync_state: online`、`user_id: @zcode-mini:...`
   - 控制台房间列表与 cc-connect 时期一致；
   - 群内 `@zcode-mini /status` 由管理员发出，收到 ZCode Bot 回复；
   - 群内普通消息（未 @）不再触发回复（mention 策略生效）。
6. **绑定房间目录**：控制台或 `/workspace bind <路径>`。

## 回滚（恢复 cc-connect）

```bash
# 停新
launchctl bootout gui/$(id -u)/ai.bigbear.zcode-matrix-bridge
# 起旧（先解除持久禁用）
launchctl enable gui/$(id -u)/ai.bigbear.zcode-mini-matrix
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.bigbear.zcode-mini-matrix.plist
```
旧桥使用同一 access_token，账号侧无需任何改动。`~/.zcode/matrix-bridge/` 数据目录可保留或删除。

## 收尾清单

- [x] 旧 LaunchAgent 已停止并持久禁用（plist 保留可回滚）
- [x] 新守护进程 install 并 online（`@zcode-mini` 同步 6 个房间）
- [x] 插件市场注册 + 插件安装（matrix-bridge@dev-matrix-bridge-zcode）
- [x] 「园长·大熊·ZCode 协作」房间已绑定 `/Users/xiangyu/开发项目/Agent协作/园长-ZCode`
- [ ] 群内实测消息往返（待大熊在 Matrix 客户端验证：`@zcode-mini /status`）
- [ ] 其余房间工作区按需绑定（当前未绑定 → 沙箱隔离运行）
- [ ] 观察 24h 后可考虑清理 `cc-matrix-isolated-test-20261108-a`（由大熊裁决）
