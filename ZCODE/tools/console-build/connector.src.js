// ZCode 面板 webview 专用连接器：用官方 MCP Apps SDK 完成 ui/initialize 握手，
// 并向 app.js 暴露 window.__mcpApp / window.__mcpAppReady（MCP 工具分发层依赖）。
// 浏览器直开（守护进程 HTTP 控制台）不会加载本文件，走 fetch 直连不受影响。
// 修改本文件后需在本目录执行 `npm run build` 重新生成 vendor 产物。
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';

const PLUGIN_VERSION = '0.2.1';
const CONNECT_TIMEOUT_MS = 8000;

const app = new App(
  { name: 'matrix-bridge-console', version: PLUGIN_VERSION },
  {},
  { autoResize: false }
);

// 宿主主题跟随：styles.css 以 <html data-theme="light|dark"> 切换配色
function applyHostContext(ctx) {
  if (!ctx) return;
  if (ctx.theme === 'light' || ctx.theme === 'dark') {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles && ctx.styles.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
}

app.onhostcontextchanged = (params) => applyHostContext(params);

const connectPromise = app
  .connect()
  .then(() => {
    // 无论下方面板首屏竞速是否已超时，建连成功即挂载，后续 api() 调用自动切换 MCP 通道
    window.__mcpApp = app;
    applyHostContext(app.getHostContext());
    return app;
  })
  .catch((err) => {
    // 宿主握手失败（非面板环境等）：静默降级，app.js 继续用 fetch 直连守护进程
    console.warn('[matrix-bridge] mcp-app 握手失败，回退直连 HTTP:', err && err.message ? err.message : err);
    return null;
  });

// 面板首屏最多等 8s：宿主异常时不阻塞数据加载，fetch 兜底（CSP 已放行 127.0.0.1:47613）
window.__mcpAppReady = Promise.race([
  connectPromise,
  new Promise((resolve) => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS))
]);
