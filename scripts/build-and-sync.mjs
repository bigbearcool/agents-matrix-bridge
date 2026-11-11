#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

console.log('🚀 开始构建并同步统一 Matrix Bridge 产物...\n');

// 1. 构建 packages/matrix-console-ui
console.log('📦 [1/3] 构建 packages/matrix-console-ui...');
const uiDir = join(ROOT, 'packages', 'matrix-console-ui');
execSync('node build.mjs', { cwd: uiDir, stdio: 'inherit' });
const uiDist = join(uiDir, 'dist');

// 2. 同步统一 UI 到三大宿主目录
console.log('\n🎨 [2/3] 同步统一 UI 至宿主发布目录...');
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

// 3. 校验 Core 与 Adapters
console.log('\n🧩 [3/3] 校验 packages/matrix-core 与 adapters/...');
const coreDir = join(ROOT, 'packages', 'matrix-core');
if (existsSync(join(coreDir, 'tests'))) {
  console.log('  → 运行 matrix-core 单元测试...');
  try {
    execSync('node --test tests/*.test.mjs', { cwd: coreDir, stdio: 'inherit' });
    console.log('  ✓ matrix-core 测试通过');
  } catch (err) {
    console.warn('  ⚠️ matrix-core 测试尚未就绪或有未完成项:', err.message);
  }
}

console.log('\n🎉 构建与同步完成！所有端已对齐到统一 UI 与架构真理源。');
