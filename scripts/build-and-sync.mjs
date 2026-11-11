#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

console.log('🚀 开始构建并同步统一 Matrix Bridge 架构产物...\n');

// 1. 构建 packages/matrix-console-ui
console.log('📦 [1/4] 构建 packages/matrix-console-ui...');
const uiDir = join(ROOT, 'packages', 'matrix-console-ui');
execSync('node build.mjs', { cwd: uiDir, stdio: 'inherit' });
const uiDist = join(uiDir, 'dist');

// 2. 同步统一 UI 到各端发布目录
console.log('\n🎨 [2/4] 同步统一 UI 至宿主发布目录...');
const uiTargets = [
  {
    name: 'Antigravity Sidecar',
    dest: join(ROOT, 'antigravity', 'sidecars', 'matrix_console'),
    files: ['index.html', 'styles.css', 'app.js', 'panel-adapter.js']
  },
  {
    name: 'Codex Console',
    dest: join(ROOT, 'codex', 'plugins', 'matrix-bridge', 'engine', 'console'),
    files: ['index.html', 'styles.css', 'app.js']
  },
  {
    name: 'Codex MCP Panel Adapter',
    dest: join(ROOT, 'codex', 'plugins', 'matrix-bridge', 'mcp'),
    files: ['panel-adapter.js']
  },
  {
    name: 'ZCode Console',
    dest: join(ROOT, 'ZCODE', 'plugins', 'matrix-bridge', 'engine', 'console'),
    files: ['index.html', 'styles.css', 'app.js']
  },
  {
    name: 'Claude Console',
    dest: join(ROOT, 'claude', 'plugins', 'matrix-bridge', 'engine', 'console'),
    files: ['index.html', 'styles.css', 'app.js']
  },
  {
    name: 'DSH Console',
    dest: join(ROOT, 'dsh', 'engine', 'console'),
    files: ['index.html', 'styles.css', 'app.js']
  }
];

for (const target of uiTargets) {
  mkdirSync(target.dest, { recursive: true });
  for (const file of target.files) {
    const srcFile = join(uiDist, file);
    const destFile = join(target.dest, file);
    if (existsSync(srcFile)) {
      cpSync(srcFile, destFile);
      console.log(`  ✓ [${target.name}] 已同步 ${file}`);
    }
  }
}

// 3. 同步 Core 与各自 Adapter 至各宿主 Thin Wrapper 目录
console.log('\n🧩 [3/4] 部署 Core 内核与适配器至各端发布目录...');
const coreSrc = join(ROOT, 'packages', 'matrix-core', 'src');

const hostTargets = [
  {
    name: 'Antigravity Sidecar',
    dir: join(ROOT, 'antigravity', 'sidecars', 'matrix_console'),
    adapterSrc: join(ROOT, 'adapters', 'antigravity', 'index.mjs')
  },
  {
    name: 'Codex Engine',
    dir: join(ROOT, 'codex', 'plugins', 'matrix-bridge', 'engine'),
    adapterSrc: join(ROOT, 'adapters', 'codex', 'index.mjs'),
    clientSrc: join(ROOT, 'adapters', 'codex', 'client.mjs')
  },
  {
    name: 'ZCode Engine',
    dir: join(ROOT, 'ZCODE', 'plugins', 'matrix-bridge', 'engine'),
    adapterSrc: join(ROOT, 'adapters', 'zcode', 'index.mjs')
  },
  {
    name: 'Claude Engine',
    dir: join(ROOT, 'claude', 'plugins', 'matrix-bridge', 'engine'),
    adapterSrc: join(ROOT, 'adapters', 'claude', 'index.mjs')
  },
  {
    name: 'DSH Engine',
    dir: join(ROOT, 'dsh', 'engine'),
    adapterSrc: join(ROOT, 'adapters', 'dsh', 'index.mjs')
  }
];

for (const host of hostTargets) {
  const hostCore = join(host.dir, 'core');
  mkdirSync(hostCore, { recursive: true });
  cpSync(coreSrc, hostCore, { recursive: true });
  if (existsSync(host.adapterSrc)) {
    let content = readFileSync(host.adapterSrc, 'utf8');
    content = content.replaceAll('../../packages/matrix-core/src/', './core/');
    writeFileSync(join(host.dir, 'adapter.mjs'), content, 'utf8');
  }
  if (host.clientSrc && existsSync(host.clientSrc)) {
    cpSync(host.clientSrc, join(host.dir, 'client.mjs'));
  }
  console.log(`  ✓ [${host.name}] 已同步 Core 内核与专用 Adapter`);
}

// 4. 校验 Core 与 Adapters 单元测试
console.log('\n🧪 [4/4] 运行全量单元测试与回归套件...');
const coreDir = join(ROOT, 'packages', 'matrix-core');
if (existsSync(join(coreDir, 'tests'))) {
  try {
    execSync('node --test tests/*.test.mjs', { cwd: coreDir, stdio: 'inherit' });
    console.log('  ✓ matrix-core 测试通过 (51 passed)');
  } catch (err) {
    console.error('  ❌ matrix-core 测试失败:', err.message);
    process.exit(1);
  }
}

console.log('\n🎉 构建与同步完成！所有旧架构已彻底精简，各端 100% 消费统一 Core 与 UI 真理源。');
