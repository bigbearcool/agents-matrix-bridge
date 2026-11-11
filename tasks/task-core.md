# 任务目标：构建通用后端内核 packages/matrix-core

## 背景
当前 `codex/plugins/matrix-bridge/engine/` 已经具备了相对优雅的模块化架构（`bridge.mjs`, `console-server.mjs`, `commands.mjs`, `media.mjs`, `security.mjs`, `instance-lock.mjs`）。
但它直接耦合了 `codex-client.mjs`。
我们需要将与具体 Agent 解耦的所有核心协议与业务逻辑提取为通用内核包 `packages/matrix-core/`。

## 详细要求

### 1. 目录结构
在 `packages/matrix-core/` 下建立：
```text
packages/matrix-core/
├── src/
│   ├── adapter.mjs          # AgentRuntimeAdapter 基类与接口规范
│   ├── bridge.mjs           # Matrix 主桥接引擎（接管 Sync, DM自愈, Pantalaimon, 会话路由）
│   ├── commands.mjs         # 聊天命令解析调度器 (/workspace, /model, /effort, /new 等)
│   ├── console-server.mjs   # 管理控制台 HTTP REST API 服务与静态托管
│   ├── security.mjs         # 四层安全准入网关（联合阻断、脱敏、权限验证）
│   ├── media.mjs            # 多媒体收发、图片尺寸解析、私有缓存
│   ├── instance-lock.mjs    # 单实例文件锁
│   └── index.mjs            # 核心导出入口
├── tests/
│   ├── adapter.test.mjs     # 适配器接口契约测试
│   ├── security.test.mjs    # 安全脱敏与准入测试
│   └── commands.test.mjs    # 指令解析测试
└── package.json             # name: "@matrix-bridge/core", type: "module", version: "1.0.0"
```

### 2. 核心模块重构与解耦关键点

1. **`src/adapter.mjs` (标准契约)**：
   定义 `AgentRuntimeAdapter` 基类：
   ```javascript
   export class AgentRuntimeAdapter {
     constructor(options = {}) {
       this.name = options.name || 'generic';
       this.defaultCliPath = options.defaultCliPath || '';
     }
     // 执行一次对话 turn
     async executeTurn(params) {
       // params: { prompt, cwd, model, effort, threadId, attachments, onApproval, onInput, roomId }
       // 返回: { replyText: string, generatedFiles?: string[], error?: any }
       throw new Error('executeTurn must be implemented by adapter');
     }
     // 获取支持的模型列表与思考深度
     async listAvailableModels() {
       return { models: [], efforts: [] };
     }
     // 重置会话上下文 (对应 /new)
     async resetSession(roomId, threadId) {
       return;
     }
   }
   ```

2. **`src/bridge.mjs` (解除与具体 Agent 绑定)**：
   - 构造函数接收 `{ config, adapter, ... }`；
   - 将原来所有针对 `this.codex` 的调用替换为 `this.adapter.executeTurn(...)`、`this.adapter.listAvailableModels()`、`this.adapter.resetSession(...)`；
   - 完整保留既有的强大特性：
     - Pantalaimon E2EE 代理与未解密占位符过滤；
     - `m.direct` 存量同步与自愈；
     - 房间工作区锁定、权限与多线程上下文隔离；
     - `migration_candidates` 候选追踪与故障自愈挂起；
     - 原生文件上传与图片媒体处理。

3. **`src/commands.mjs`, `src/security.mjs`, `src/media.mjs`, `src/instance-lock.mjs`**：
   - 从 `codex/plugins/matrix-bridge/engine/` 中迁入，保持纯净无状态或依赖注入；
   - `commands.mjs` 支持查询当前 adapter 的模型列表并返回友好帮助提示。

4. **`src/console-server.mjs`**：
   - 接收 `coreEngine` 实例，提供统一的 REST API：
     - `GET /api/status`, `GET /api/config`, `POST /api/config`, `POST /api/login`
     - `GET /api/rooms`, `POST /api/rooms/:id`, `POST /api/rooms/:id/reconcile`
     - `GET /api/models` (代理给 `adapter.listAvailableModels()`)
     - `GET /api/fs/browse`, `GET /api/logs`
   - 支持托管静态前端文件（通过配置 `staticDir` 指向 UI 的 `dist/` 目录）。

5. **`tests/`**：
   - 编写使用 Node.js 自带 `node:test` 的测试用例，覆盖 adapter 接口契约、安全脱敏、指令解析。

完成后运行 `node --test tests/*.test.mjs` 确保测试全部通过。
