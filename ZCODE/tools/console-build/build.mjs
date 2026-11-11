#!/usr/bin/env node
// 把 connector.src.js 打包成可内联进面板 HTML 的 IIFE bundle（<script> 内联不支持 ESM）。
// 产物提交进插件源码树：plugins/matrix-bridge/engine/console/vendor/mcp-app-connector.js
// server.mjs 的 buildPanelHtml() 在 resources/read 时读取该产物注入面板。
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '../../plugins/matrix-bridge/engine/console/vendor/mcp-app-connector.js');

mkdirSync(dirname(outFile), { recursive: true });
const result = await build({
  entryPoints: [join(here, 'connector.src.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  legalComments: 'none',
  target: ['safari16'], // ZCode 桌面面板 webview 为 WKWebView
  metafile: true,
  outfile: outFile
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + (o.bytes || 0), 0);
const sizeKB = bytes / 1024;
console.log(`built: ${outFile} (${sizeKB.toFixed(1)} KB)`);
if (sizeKB > 1024) {
  console.warn('警告：bundle 超过 1 MB，面板 HTML 宿主上限为 4 MiB，请检查依赖');
}
