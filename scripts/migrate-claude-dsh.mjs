#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('🚀 开始执行 Claude 与 DSH 的 Matrix Bridge 凭证与配置迁移...\n');

// 辅助执行命令
function run(cmd, allowFail = false) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return '';
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

// 简单 TOML 字段提取
function parseTomlValue(content, key) {
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm');
  const match = content.match(regex);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      return JSON.parse(raw.replace(/'/g, '"'));
    } catch {
      return raw.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
  }
  return raw;
}

const BACKUP_DIR = join(homedir(), `matrix-bridge-migration-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
mkdirSync(BACKUP_DIR, { recursive: true });

// ==============================================================================
// 1. 迁移 Claude 配置与凭据
// ==============================================================================
console.log('📦 [1/4] 迁移 Claude Code Matrix 凭证...');
const OLD_CLAUDE_DIR = join(homedir(), 'claude-matrix');
const NEW_CLAUDE_DIR = join(homedir(), '.claude', 'matrix-bridge');
const OLD_CLAUDE_TOML = join(OLD_CLAUDE_DIR, 'config.toml');

if (existsSync(OLD_CLAUDE_TOML)) {
  const toml = readFileSync(OLD_CLAUDE_TOML, 'utf8');
  const homeserver = parseTomlValue(toml, 'homeserver') || 'https://matrix.bigbear.cool:8443';
  const userId = parseTomlValue(toml, 'user_id') || '@claude-mini:matrix.bigbear.cool';
  const token = parseTomlValue(toml, 'access_token') || '';
  const adminRaw = parseTomlValue(toml, 'admin_from') || '@bigbear:matrix.bigbear.cool,@yuanzhang:matrix.bigbear.cool';
  const admins = adminRaw.split(',').map(s => s.trim()).filter(Boolean);
  const cwd = parseTomlValue(toml, 'base_dir') || join(homedir(), '开发项目');
  const knownBots = parseTomlValue(toml, 'known_bot_localparts') || ['claude-win', 'claude-mini'];

  // 备份原目录
  const backupClaude = join(BACKUP_DIR, 'claude-matrix');
  mkdirSync(backupClaude, { recursive: true });
  cpSync(OLD_CLAUDE_TOML, join(backupClaude, 'config.toml'));
  console.log(`  ✓ 已备份原 Claude 配置至 ${backupClaude}/config.toml`);

  // 创建新目录
  mkdirSync(NEW_CLAUDE_DIR, { recursive: true });
  mkdirSync(join(NEW_CLAUDE_DIR, 'logs'), { recursive: true });

  // 写入纯净 config.json（无 token，遵循 Invariant 4）
  const claudeConfig = {
    homeserver,
    user_id: userId,
    admins,
    allowed_senders: ['*'],
    direct_rooms: [],
    cwd,
    console_port: 47615,
    auto_connect: true,
    auto_join: true,
    group_reply_all: true,
    known_bot_localparts: knownBots
  };
  writeFileSync(join(NEW_CLAUDE_DIR, 'config.json'), JSON.stringify(claudeConfig, null, 2) + '\n', 'utf8');
  console.log(`  ✓ 已写入新配置: ${join(NEW_CLAUDE_DIR, 'config.json')}`);

  // 写入安全 token 文件 (0600)
  if (token) {
    writeFileSync(join(NEW_CLAUDE_DIR, 'token'), token + '\n', { mode: 0o600 });
    console.log(`  ✓ 已迁移 Matrix Token 至安全文件 (mode 0600): ${join(NEW_CLAUDE_DIR, 'token')}`);
  }

  // 部署 engine
  const claudeEngineSrc = join(ROOT, 'claude', 'plugins', 'matrix-bridge', 'engine');
  const claudeEngineDst = join(NEW_CLAUDE_DIR, 'engine');
  mkdirSync(claudeEngineDst, { recursive: true });
  cpSync(claudeEngineSrc, claudeEngineDst, { recursive: true });
  console.log(`  ✓ 已同步 Claude Engine 至 ${claudeEngineDst}`);
} else {
  console.log('  ⚠️ 未找到原 Claude 配置文件，跳过迁移');
}

// ==============================================================================
// 2. 迁移 DSH 配置与凭据
// ==============================================================================
console.log('\n📦 [2/4] 迁移 DSH Matrix 凭证...');
const OLD_DSH_DIR = join(homedir(), 'dsh-matrix');
const NEW_DSH_DIR = join(homedir(), '.dsh', 'matrix-bridge');
const OLD_DSH_TOML = join(OLD_DSH_DIR, 'config.toml');

if (existsSync(OLD_DSH_TOML)) {
  const toml = readFileSync(OLD_DSH_TOML, 'utf8');
  const homeserver = parseTomlValue(toml, 'homeserver') || 'https://matrix.bigbear.cool:8443';
  const userId = parseTomlValue(toml, 'user_id') || '@dsh-mini-bot:matrix.bigbear.cool';
  const token = parseTomlValue(toml, 'access_token') || '';
  const adminRaw = parseTomlValue(toml, 'admin_from') || '@bigbear:matrix.bigbear.cool,@yuanzhang:matrix.bigbear.cool';
  const admins = adminRaw.split(',').map(s => s.trim()).filter(Boolean);
  const cwd = parseTomlValue(toml, 'base_dir') || join(homedir(), '开发项目');

  // 备份原目录
  const backupDsh = join(BACKUP_DIR, 'dsh-matrix');
  mkdirSync(backupDsh, { recursive: true });
  cpSync(OLD_DSH_TOML, join(backupDsh, 'config.toml'));
  console.log(`  ✓ 已备份原 DSH 配置至 ${backupDsh}/config.toml`);

  // 创建新目录
  mkdirSync(NEW_DSH_DIR, { recursive: true });
  mkdirSync(join(NEW_DSH_DIR, 'logs'), { recursive: true });

  // 写入纯净 config.json（无 token）
  const dshConfig = {
    homeserver,
    user_id: userId,
    admins,
    allowed_senders: ['*'],
    direct_rooms: [],
    cwd,
    console_port: 47616,
    auto_connect: true,
    auto_join: true,
    group_reply_all: true
  };
  writeFileSync(join(NEW_DSH_DIR, 'config.json'), JSON.stringify(dshConfig, null, 2) + '\n', 'utf8');
  console.log(`  ✓ 已写入新配置: ${join(NEW_DSH_DIR, 'config.json')}`);

  // 写入安全 token 文件 (0600)
  if (token) {
    writeFileSync(join(NEW_DSH_DIR, 'token'), token + '\n', { mode: 0o600 });
    console.log(`  ✓ 已迁移 Matrix Token 至安全文件 (mode 0600): ${join(NEW_DSH_DIR, 'token')}`);
  }

  // 部署 engine
  const dshEngineSrc = join(ROOT, 'dsh', 'engine');
  const dshEngineDst = join(NEW_DSH_DIR, 'engine');
  mkdirSync(dshEngineDst, { recursive: true });
  cpSync(dshEngineSrc, dshEngineDst, { recursive: true });
  console.log(`  ✓ 已同步 DSH Engine 至 ${dshEngineDst}`);
} else {
  console.log('  ⚠️ 未找到原 DSH 配置文件，跳过迁移');
}

// ==============================================================================
// 3. 安装 DSH 插件至 desktop profile
// ==============================================================================
console.log('\n🧩 [3/4] 挂载 DSH 原生桌面插件至 ~/.dsh/profiles/desktop ...');
const desktopProfileDir = join(homedir(), '.dsh', 'profiles', 'desktop');
const desktopPkgJsonPath = join(desktopProfileDir, 'package.json');
const desktopPatchPath = join(desktopProfileDir, 'cordis.patch.yml');

if (existsSync(desktopProfileDir) && existsSync(desktopPkgJsonPath)) {
  const dshSrc = join(ROOT, 'dsh');
  const desktopPluginDest = join(desktopProfileDir, 'node_modules', 'dsh-matrix-bridge');
  
  mkdirSync(join(desktopProfileDir, 'node_modules'), { recursive: true });
  cpSync(dshSrc, desktopPluginDest, { recursive: true });
  console.log(`  ✓ 已将 dsh-matrix-bridge 插件安装至 ${desktopPluginDest}`);

  // 更新 package.json
  const pkg = JSON.parse(readFileSync(desktopPkgJsonPath, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies['dsh-matrix-bridge'] = '^1.0.0';
  if (pkg.dsh?.profile?.bundles && !pkg.dsh.profile.bundles.includes('dsh-matrix-bridge')) {
    pkg.dsh.profile.bundles.push('dsh-matrix-bridge');
  }
  writeFileSync(desktopPkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  ✓ 已注册插件依赖与 bundle 到 desktop profile package.json');

  // 更新 cordis.patch.yml
  if (existsSync(desktopPatchPath)) {
    let patch = readFileSync(desktopPatchPath, 'utf8');
    if (!patch.includes('dsh-matrix-bridge')) {
      const entry = `\n- id: dsh-matrix-bridge\n  name: "dsh-matrix-bridge"\n  config:\n    enabled: true\n`;
      patch += entry;
      writeFileSync(desktopPatchPath, patch, 'utf8');
      console.log('  ✓ 已在 cordis.patch.yml 中配置插件自动挂载');
    }
  }
}

// ==============================================================================
// 4. 平滑切换 LaunchAgent 守护进程
// ==============================================================================
console.log('\n⚙️  [4/4] 切换 LaunchAgent 守护进程...');
const uid = typeof process.getuid === 'function' ? process.getuid() : 501;

// 1) 停止并卸载旧的 cc-connect 守护进程
console.log('  • 停止旧的 Claude/DSH cc-connect 守护进程...');
run(`launchctl bootout gui/${uid}/ai.bigbear.claude-mini-matrix`, true);
run(`launchctl bootout gui/${uid}/ai.bigbear.dsh-mini-matrix`, true);
run(`launchctl disable gui/${uid}/ai.bigbear.claude-mini-matrix`, true);
run(`launchctl disable gui/${uid}/ai.bigbear.dsh-mini-matrix`, true);

// 2) 安装并启动新的 Claude 守护进程
console.log('  • 注册并启动新的 Claude Matrix Bridge (ai.bigbear.claude-matrix-bridge)...');
try {
  run(`node "${join(NEW_CLAUDE_DIR, 'engine', 'daemonctl.mjs')}" install`);
  run(`node "${join(NEW_CLAUDE_DIR, 'engine', 'daemonctl.mjs')}" restart`);
  console.log('  ✓ Claude 守护进程已启动');
} catch (e) {
  console.warn('  ⚠️ Claude 守护进程启动提示:', e.message);
}

// 3) 安装并启动新的 DSH 守护进程
console.log('  • 注册并启动新的 DSH Matrix Bridge (ai.bigbear.dsh-matrix-bridge)...');
try {
  run(`node "${join(NEW_DSH_DIR, 'engine', 'daemonctl.mjs')}" install`);
  run(`node "${join(NEW_DSH_DIR, 'engine', 'daemonctl.mjs')}" restart`);
  console.log('  ✓ DSH 守护进程已启动');
} catch (e) {
  console.warn('  ⚠️ DSH 守护进程启动提示:', e.message);
}

console.log('\n🎉 迁移完成！所有旧 cc-connect 进程已下线，新 ESM 守护进程已无缝接管。\n');
