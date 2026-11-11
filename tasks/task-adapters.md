# 任务目标：构建各 Agent 运行时适配器 adapters/

## 背景
在统一架构中，内核 `@matrix-bridge/core` 通过 `AgentRuntimeAdapter` 与底层各端交互。
我们需要在 `adapters/` 目录下为当前三个端分别实现标准适配器：
1. `adapters/codex/`：Codex 适配器（调用 app-server stdio JSON-RPC 或现有的 codex-client 逻辑）
2. `adapters/antigravity/`：Antigravity 适配器（调用 `agy` CLI，执行会话对话）
3. `adapters/zcode/`：ZCode 适配器（调用 `zcode` CLI / 本地服务）

## 详细要求

### 1. 目录结构
```text
adapters/
├── codex/
│   ├── index.mjs            # 导出 CodexAdapter（继承 AgentRuntimeAdapter）
│   ├── client.mjs           # 与 codex app-server 或 cli 交互封装
│   └── package.json
├── antigravity/
│   ├── index.mjs            # 导出 AntigravityAdapter（继承 AgentRuntimeAdapter）
│   └── package.json
├── zcode/
│   ├── index.mjs            # 导出 ZCodeAdapter（继承 AgentRuntimeAdapter）
│   └── package.json
└── index.mjs                # 统一导出各适配器与工厂函数 createAdapter(name, options)
```

### 2. 接口契约规范 (需与 packages/matrix-core/src/adapter.mjs 保持完全一致)
每个适配器必须实现：
- `name`: 'codex' | 'antigravity' | 'zcode'
- `defaultCliPath`: string
- `async executeTurn({ prompt, cwd, model, effort, threadId, attachments, onApproval, onInput, roomId })`
  - 返回 `{ replyText, generatedFiles, error }`
- `async listAvailableModels()`
  - 返回 `{ models: Array<{ id, name, description }>, efforts: string[] }`
- `async resetSession(roomId, threadId)`
  - 重置上下文或清空线程
