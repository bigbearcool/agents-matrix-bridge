#!/bin/bash
# ZCode Matrix Bridge — 一键部署脚本（引擎同步 + 插件更新 + 验证）
# 用法：机器稳定后，在「终端 Terminal」中执行：
#   bash /Users/xiangyu/开发项目/matrix-bridge/ZCODE/deploy.sh
set -euo pipefail

SRC="/Users/xiangyu/开发项目/matrix-bridge/ZCODE/plugins/matrix-bridge"

echo "==> [1/4] 同步引擎到稳定目录并重启守护进程（含 CORS 支持）..."
/opt/homebrew/bin/node "$SRC/engine/daemonctl.mjs" install
sleep 3

echo "==> [2/4] 验证守护进程与 CORS ..."
curl -s --max-time 5 http://127.0.0.1:47613/api/status | /opt/homebrew/bin/node -e \
  'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d);console.log("    Bot: "+s.sync_state+" · "+s.user_id+" · 房间 "+s.room_count)})'
curl -s -i -X OPTIONS http://127.0.0.1:47613/api/status -H "Origin: zcode-sandbox://test" | grep -i "access-control" | head -1 || \
  { echo "    ❌ CORS 头缺失（引擎可能未更新）"; exit 1; }

echo "==> [3/4] 更新插件市场与插件（v0.2.1：面板 mcp-app 握手修复 + 全面 MCP 化）..."
zcode plugins marketplace update dev-matrix-bridge-zcode
zcode plugins update matrix-bridge

echo "==> [4/4] 验证面板资源生成 ..."
CLAUDE_PLUGIN_ROOT="$SRC" /opt/homebrew/bin/node -e '
const { spawn } = require("child_process");
const child = spawn(process.execPath, [process.env.CLAUDE_PLUGIN_ROOT + "/mcp/server.mjs"]);
let out = "";
child.stdout.on("data", d => {
  out += d.toString();
  const lines = out.split("\n").filter(Boolean);
  const resp = lines.map(l => { try { return JSON.parse(l); } catch { return null; } })
    .find(m => m?.id === 3 && m?.result?.contents);
  if (resp) {
    const html = resp.result.contents[0].text;
    console.log("    面板 HTML: " + html.length + " 字节, mimeType: " + resp.result.contents[0].mimeType);
    // 断言 mcp-app 连接器已内联（ui/initialize 握手修复），且 preload 桩已被替换
    // 注意：本段嵌在 bash 单引号内，JS 字符串只能用双引号
    if (!html.includes("matrix-bridge-console") || html.includes("<script src=\"/preload.js\">")) {
      console.error("    ❌ 面板缺少 mcp-app 连接器（vendor/mcp-app-connector.js 未内联）");
      child.kill(); process.exit(1);
    }
    console.log("    mcp-app 连接器: 已内联 ✓");
    child.kill(); process.exit(0);
  }
});
child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05"}})+"\n");
child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:3,method:"resources/read",params:{uri:"ui://matrix-bridge/panel.html"}})+"\n");
setTimeout(() => { console.error("    ❌ 面板资源未返回"); child.kill(); process.exit(1); }, 15000);
'

echo
echo "✅ 部署完成。最后一步：重启 ZCode 桌面（或新开会话），右侧切换面板即出现「Matrix Bot」。"
echo "   浏览器控制台不变：http://127.0.0.1:47613/"
