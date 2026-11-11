# @matrix-bridge/core

Agent 无关的 Matrix 桥接内核。负责 Matrix Sync、DM 自愈、Pantalaimon/E2EE 感知、房间策略与队列、审批、媒体收发、持久化和本地控制台 REST API；具体 Agent 通过 `AgentRuntimeAdapter` 接入。

## 安装与测试

```bash
cd packages/matrix-core
npm test          # 等价于 node --test tests/*.test.mjs
```

要求 Node.js >= 20，无运行时第三方依赖。

## 快速开始

```js
import { Bridge, AgentRuntimeAdapter } from '@matrix-bridge/core';

class MyAdapter extends AgentRuntimeAdapter {
  constructor() { super({ name: 'my-agent', defaultCliPath: 'my-agent' }); }

  async executeTurn({ prompt, cwd, model, effort, threadId, attachments, onApproval, onInput, onThread }) {
    await onThread(threadId || 'new-thread');
    return { replyText: `echo: ${prompt}`, generatedFiles: [] };
  }

  async listAvailableModels() {
    return { models: [{ id: 'fast', name: 'Fast', description: '快速模式' }], efforts: ['low', 'high'] };
  }

  async resetSession(roomId, threadId) {
    // 清理该房间/线程的上下文
  }
}

const bridge = new Bridge({
  config: {
    homeserver: 'https://matrix.example.org',
    user_id: '@bot:example.org',
    allowed_senders: ['@admin:example.org'],
    admins: ['@admin:example.org'],
    direct_rooms: [],
    cwd: '/path/to/workspace'
  },
  adapter: new MyAdapter(),
  token: process.env.MATRIX_ACCESS_TOKEN
});

await bridge.load();
await bridge.run();
```

Access token 只保存在内存中，不写入配置文件或状态文件。

## 适配器契约

| 成员 | 说明 |
| --- | --- |
| `name` | Agent 标识，例如 `codex` / `antigravity` / `zcode` |
| `defaultCliPath` | 默认 CLI 路径 |
| `executeTurn(params)` | 执行一轮对话，返回 `{ replyText, generatedFiles?, error?, threadId? }` |
| `listAvailableModels()` | 返回 `{ models: [{ id, name, description }], efforts: string[] }` |
| `resetSession(roomId, threadId)` | `/new`、`/reset` 或控制台重置时清理上下文 |

`executeTurn` 会收到：
`prompt`、`cwd`、`model`、`effort`、`threadId`、`attachments`、`onApproval`、`onInput`、`onThread`、`roomId`。
`onApproval(request)` 返回 `Promise<'accept' | 'decline'>`，`onInput(request)` 返回 `Promise<answers>`；内核负责把审批/补充信息请求投递到 Matrix 并将管理员回复回传给适配器。

## 控制台 REST API

`createConsole(coreEngine, configPath, port, { staticDir })` 只监听 loopback，并拒绝跨域写请求：

- `GET /api/status`
- `GET /api/config` / `POST /api/config`
- `POST /api/login`（也兼容 `/api/auth`、`/api/verify-token`）
- `GET /api/rooms` / `POST /api/rooms/:id`
- `POST /api/rooms/:id/reconcile`
- `GET /api/models`
- `GET /api/fs/browse`
- `GET /api/logs`

`staticDir` 可来自构造函数选项或配置项 `staticDir`，用于托管前端 UI 的 `dist/`。

## 安全模型

入站消息依次经过四层准入：

1. **identity** — `allowed_senders` 显式允许名单；
2. **policy** — `message_policy`（all / none / allowlist / blocklist / local_server）；
3. **room** — 房间策略（all / mention / mute）、@ 提及与指令寻址；
4. **permission** — 管理员权限与 `admin_only_workspace`。

另有：联邦房间守卫、滑动窗口限流、E2EE 直连阻断（仅 `matrix_transport: "pantalaimon"` 放行加密房间）、未解密占位符丢弃、出站敏感信息脱敏（token/私钥/常见密钥前缀/家目录）。

## 关键行为

- 每个房间串行队列；执行结果未知时暂停该房间并留下待核对事件，绝不自动重放。
- `m.direct` account data 与成员变化共同维护 DM 判定；单聊自动写入 `m.direct` 自愈。
- 线程（`m.thread`）与会话（`/new`、`/switch`）拥有独立 thread id，避免上下文串线。
- 附件下载到 `statePath` 同级 `attachments/` 私有缓存（0700 目录 / 0600 文件，50 MiB 上限）。
- 支持 `/sendfile`、Agent 回传文件标记（`[SEND_FILE: ...]`、`<send-file ...>`、Markdown 图片）的原生 Matrix 上传。
- `migration_candidates` 房间在启动时挂起，必须通过控制台 `/api/migration` 选择历史线程后恢复。
