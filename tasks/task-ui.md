# 任务目标：构建统一前端工程 packages/matrix-console-ui

## 背景
当前仓库中存在三份几乎相同的前端代码：
- `antigravity/sidecars/matrix_console/`
- `codex/plugins/matrix-bridge/engine/console/`
- `ZCODE/plugins/matrix-bridge/engine/console/`
以及 `codex/plugins/matrix-bridge/mcp/panel-adapter.js`。

请将它们合成为唯一的真理源（Single Source of Truth），输出到 `packages/matrix-console-ui/`。

## 详细要求

### 1. 目录结构
创建并完善以下文件：
- `packages/matrix-console-ui/src/index.html`
- `packages/matrix-console-ui/src/styles.css`
- `packages/matrix-console-ui/src/app.js`
- `packages/matrix-console-ui/src/panel-adapter.js`
- `packages/matrix-console-ui/build.mjs` (将 `src/` 中的文件输出并校验到 `dist/`)
- `packages/matrix-console-ui/package.json` (包含 name: "@matrix-bridge/console-ui", version: "1.0.0", scripts: { "build": "node build.mjs" })

### 2. 代码合并与功能保留关键点
1. **HTML (`index.html`)**：
   - 标题命名为 `Matrix Bridge 控制台`，副标题或徽标支持动态感知当前 Agent（Antigravity / Codex / ZCode）；
   - 保留 `<form id="auth-form">` 包裹登录卡片，保留 `<p id="error" class="hidden" role="alert"></p>`（用于无障碍和自动化测试检测）；
   - 通用化标签：默认模型选项文案“跟随系统 / CLI 默认设置”；Agent CLI 路径输入框使用通用 id 如 `inputAgentCliCmd` 或同时兼容 `inputCodexCmd` / `inputAgyCmd` 别名；
   - 引用 `<script src="/panel-adapter.js"></script>` 和 `<script type="module" src="/app.js"></script>`。

2. **样式 (`styles.css`)**：
   - 保留完整的现代深浅色 CSS 变量体系（支持系统偏好与手动切换 `data-theme="dark"` / `data-theme="light"`）；
   - 包含 `.confirm-overlay` 和 `.confirm-dialog` 样式（来自 `codex/.../styles.css`）；
   - 确保侧边栏抽屉、多级目录选择树、面包屑、状态指示圆点、表格和响应式适配在深浅色模式下均对比度清晰。

3. **双模适配层 (`panel-adapter.js`)**：
   - 结合 `codex/plugins/matrix-bridge/mcp/panel-adapter.js` 的思想：
   - 在页面最开始执行，检测运行环境：
     - 若 `window.app?.callServerTool` 存在（即处于 Codex MCP App 容器中），将 API 请求转为 MCP Tool 调用；
     - 若在普通浏览器、Antigravity Sidecar 或本地服务中，提供标准 `fetch(API_BASE + path, options)`；若 URL 带有 `?token=...` 则自动在 Header 附加 `X-Sidecar-Token`；
   - 向全局导出标准 `window.bridgeAPI = { request: async (path, options) => ... }`，并提供全局兼容别名 `window.api`。

4. **主逻辑 (`app.js`)**：
   - 优先使用 `window.bridgeAPI.request` 进行网络通信；
   - 完整保留 `codex/plugins/matrix-bridge/engine/console/app.js` 中的新特性：
     - `migration_candidates` 历史会话延续按钮与事件监听器；
     - `room.blocked` 暂停保护卡片与 `reconcile-event` 核对恢复逻辑；
     - 多级工作区选择器、DM 状态徽章自愈显示、表单回显与动态状态刷新；
   - 不丢失任何既有 UI 交互（房间设置修改、模型切换、白名单配置、日志查看）。

5. **构建脚本 (`build.mjs`)**：
   - 读取 `src/` 中的文件，创建 `dist/`，并将文件复制到 `dist/`；
   - 对 HTML/CSS/JS 进行基础语法和完整性检查（比如文件非空，关键 id 存在）。

完成后执行 `npm run build` 或 `node build.mjs`，确保 `dist/` 生成完毕，并输出简明总结。
