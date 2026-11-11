#!/usr/bin/env node
/**
 * Matrix Bridge Console UI 构建脚本
 *
 * 1. 读取 src/ 下的四个真理源文件；
 * 2. 对 HTML / CSS / JS 做基础语法与完整性校验；
 * 3. 清理并重建 dist/，复制全部文件；
 * 4. 校验 dist 与 src 字节级一致。
 */
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, 'src');
const DIST_DIR = join(ROOT, 'dist');

export const SOURCE_FILES = ['index.html', 'styles.css', 'app.js', 'panel-adapter.js'];

const REQUIRED_HTML_IDS = [
  'statePill',
  'stateLabel',
  'headerSub',
  'agentBadge',
  'agentBadgeLabel',
  'roomCountBadge',
  'roomsContainer',
  'roomSearchInput',
  'auth-form',
  'authFormCard',
  'inputHomeserver',
  'inputUsername',
  'inputPassword',
  'inputAccessToken',
  'selectDefaultModel',
  'inputBaseDir',
  'inputAgentCliCmd',
  'btnSaveAgentCliCmd',
  'error',
  'toastStack',
  'logStream'
];

const REQUIRED_APP_MARKERS = [
  'window.bridgeAPI.request',
  'migration_candidates',
  '/api/migration',
  'js-pick-migration',
  'room.blocked',
  '/api/reconcile',
  'js-reconcile-event',
  'mountMultiLevelExplorer',
  'roomKind',
  'inputAgentCliCmd',
  'inputCodexCmd',
  'inputAgyCmd'
];

const REQUIRED_ADAPTER_MARKERS = [
  'window.bridgeAPI',
  'request',
  'window.api',
  'callServerTool',
  'matrix_bridge_status',
  'X-Sidecar-Token',
  'fetch',
  'detectAgent'
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertNonEmpty(name, content) {
  assert(typeof content === 'string' && content.trim().length > 0, `${name} 为空`);
  assert(!content.includes('\u0000'), `${name} 包含 NUL 字符`);
}

function checkHtml(html) {
  assert(/^\s*<!DOCTYPE html>/i.test(html), 'index.html 缺少 <!DOCTYPE html>');
  assert(/<html[^>]*lang="zh-CN"/i.test(html), 'index.html 缺少 lang="zh-CN"');
  assert(/<title>\s*Matrix Bridge 控制台\s*<\/title>/.test(html), 'index.html 标题必须为「Matrix Bridge 控制台」');
  assert(/<meta[^>]*charset="UTF-8"/i.test(html), 'index.html 缺少 UTF-8 charset');
  assert(/<meta[^>]*name="viewport"/i.test(html), 'index.html 缺少 viewport');

  // 登录卡片必须被 form#auth-form 包裹
  assert((html.match(/<form\b/gi) || []).length === 1, 'index.html 必须且只能包含一个 <form>');
  assert((html.match(/<\/form>/gi) || []).length === 1, 'index.html 的 </form> 数量不匹配');
  assert(/<form[^>]*\bid="auth-form"/i.test(html), 'index.html 缺少 <form id="auth-form">');
  const formStart = html.search(/<form[^>]*\bid="auth-form"/i);
  const formEnd = html.search(/<\/form>/i);
  const authCardStart = html.search(/<section[^>]*\bid="authFormCard"/i);
  assert(authCardStart !== -1 && authCardStart < formStart, 'index.html 登录卡片缺少 #authFormCard');
  assert(formEnd > formStart, 'index.html 的 form#auth-form 未正确闭合');

  // 自动化 / 无障碍错误节点
  const errorTag = html.match(/<p\b[^>]*\bid="error"[^>]*>/i);
  assert(errorTag, 'index.html 缺少 <p id="error">');
  assert(/\brole="alert"/i.test(errorTag[0]), 'index.html 的 #error 缺少 role="alert"');
  assert(/\bclass="[^"]*\bhidden\b/i.test(errorTag[0]), 'index.html 的 #error 缺少 hidden 类');

  // 通用模型标签与 Agent CLI 路径输入
  assert(html.includes('跟随系统 / CLI 默认设置'), 'index.html 缺少通用默认模型文案');
  assert(/<input\b[^>]*\bid="inputAgentCliCmd"/i.test(html), 'index.html 缺少 #inputAgentCliCmd');
  assert(/inputCodexCmd/.test(html) && /inputAgyCmd/.test(html), 'index.html 缺少 Agent CLI 兼容别名声明');
  assert(/<[^>]*\bid="agentBadge"/i.test(html), 'index.html 缺少 Agent 徽标 #agentBadge');

  // 脚本加载顺序：panel-adapter 必须先于模块化 app.js
  const adapterIndex = html.search(/<script[^>]*src="\/panel-adapter\.js"/i);
  const appIndex = html.search(/<script[^>]*type="module"[^>]*src="\/app\.js"/i);
  assert(adapterIndex !== -1, 'index.html 缺少 <script src="/panel-adapter.js">');
  assert(appIndex !== -1, 'index.html 缺少 <script type="module" src="/app.js">');
  assert(adapterIndex < appIndex, 'panel-adapter.js 必须先于 app.js 加载');

  const missingIds = REQUIRED_HTML_IDS.filter(id => !new RegExp(`\\bid="${id}"`).test(html));
  assert(missingIds.length === 0, `index.html 缺少关键元素 id: ${missingIds.join(', ')}`);

  // 基本标签配对：form/section/main 等关键结构标签
  const structuralTags = ['html', 'head', 'body', 'header', 'nav', 'main', 'section', 'form'];
  for (const tag of structuralTags) {
    const opens = (html.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    const closes = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    assert(opens === closes, `index.html <${tag}> 开合数量不匹配 (${opens}/${closes})`);
  }
}

function checkCss(css) {
  assert(/data-theme="dark"/.test(css), 'styles.css 缺少 data-theme="dark"');
  assert(/data-theme="light"/.test(css), 'styles.css 缺少 data-theme="light"');
  assert(/prefers-color-scheme:\s*light/.test(css), 'styles.css 缺少系统浅色偏好适配');
  assert(/\.confirm-overlay\b/.test(css), 'styles.css 缺少 .confirm-overlay');
  assert(/\.confirm-dialog\b/.test(css), 'styles.css 缺少 .confirm-dialog');
  assert(/\.agent-badge\b/.test(css), 'styles.css 缺少 .agent-badge');
  assert(/\.room-notice-box\b/.test(css), 'styles.css 缺少 .room-notice-box');
  assert(/\.data-table\b/.test(css), 'styles.css 缺少 .data-table 表格样式');
  assert(/\.ws-crumb\b/.test(css), 'styles.css 缺少 .ws-crumb 面包屑样式');
  assert(/\.ws-picker\b/.test(css), 'styles.css 缺少 .ws-picker 目录抽屉样式');

  // 去除注释后检查花括号平衡
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const char of stripped) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert(depth >= 0, 'styles.css 出现多余的右花括号 }');
  }
  assert(depth === 0, `styles.css 花括号未闭合 (剩余 ${depth})`);
}

function checkJsSyntax(name, source) {
  try {
    // app.js / panel-adapter.js 都是经典脚本（IIFE），可直接由 vm 解析
    new vm.Script(source, { filename: name });
  } catch (error) {
    fail(`${name} 语法错误: ${error.message}`);
  }
}

function checkAppJs(source) {
  checkJsSyntax('app.js', source);
  for (const marker of REQUIRED_APP_MARKERS) {
    assert(source.includes(marker), `app.js 缺少关键逻辑标记: ${marker}`);
  }
  assert(!/async function api\(path,options\)\{.*?\bfetch\(/.test(source), 'app.js 仍包含旧的顶层 fetch API 实现');
  assert(/async function api\(path, method = 'GET', body = null\)/.test(source), 'app.js 缺少统一 api 客户端');
}

function checkAdapterJs(source) {
  checkJsSyntax('panel-adapter.js', source);
  for (const marker of REQUIRED_ADAPTER_MARKERS) {
    assert(source.includes(marker), `panel-adapter.js 缺少关键能力标记: ${marker}`);
  }
  assert(/window\.app\b/.test(source), 'panel-adapter.js 未检测 window.app');
  assert(/__mcpAppReady/.test(source), 'panel-adapter.js 未检测 __mcpAppReady');
}

export async function validateSources() {
  const contents = {};
  for (const file of SOURCE_FILES) {
    const fullPath = join(SRC_DIR, file);
    let content;
    try {
      content = await readFile(fullPath, 'utf8');
    } catch (error) {
      fail(`无法读取 src/${file}: ${error.message}`);
    }
    assertNonEmpty(`src/${file}`, content);
    contents[file] = content;
  }

  checkHtml(contents['index.html']);
  checkCss(contents['styles.css']);

  // app.js 中静态引用的所有 id 必须真实存在于 index.html
  const dynamicIds = new Set(['btnEmptyGoSetup']);
  const htmlIds = new Set(
    [...contents['index.html'].matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  );
  const referencedIds = new Set(
    [...contents['app.js'].matchAll(/\$\('([^']+)'\)/g)].map(match => match[1])
  );
  const missingRefs = [...referencedIds].filter(id => !htmlIds.has(id) && !dynamicIds.has(id));
  assert(
    missingRefs.length === 0,
    `app.js 引用了 index.html 中不存在且未声明为动态创建的元素 id: ${missingRefs.join(', ')}`
  );

  checkAppJs(contents['app.js']);
  checkAdapterJs(contents['panel-adapter.js']);

  return contents;
}

async function assertDistMatches(contents) {
  const entries = await readdir(DIST_DIR);
  const expected = [...SOURCE_FILES].sort();
  const actual = entries.filter(name => !name.startsWith('.')).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `dist/ 文件列表不符合预期: ${actual.join(', ')}`
  );

  for (const file of SOURCE_FILES) {
    const built = await readFile(join(DIST_DIR, file), 'utf8');
    assert(built === contents[file], `dist/${file} 与 src/${file} 不一致`);
  }
}

export async function build() {
  console.log('▶ Matrix Bridge Console UI build');
  const contents = await validateSources();
  console.log(`  ✓ 源文件校验通过 (${SOURCE_FILES.length} 个)`);

  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  for (const file of SOURCE_FILES) {
    await copyFile(join(SRC_DIR, file), join(DIST_DIR, file));
  }

  await assertDistMatches(contents);

  let totalBytes = 0;
  const lines = [];
  for (const file of SOURCE_FILES) {
    const info = await stat(join(DIST_DIR, file));
    totalBytes += info.size;
    lines.push(`  ✓ dist/${file} (${(info.size / 1024).toFixed(1)} KB)`);
  }

  console.log('  ✓ 关键 id / 语法 / 主题变量 / 双模适配标记校验通过');
  console.log(lines.join('\n'));
  console.log(`◀ 构建完成：dist/ 共 ${SOURCE_FILES.length} 个文件，${(totalBytes / 1024).toFixed(1)} KB`);

  return { files: [...SOURCE_FILES], totalBytes };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  build().catch(error => {
    console.error(`✗ 构建失败: ${error.message}`);
    process.exitCode = 1;
  });
}
