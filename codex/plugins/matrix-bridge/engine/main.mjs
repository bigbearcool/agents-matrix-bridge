import { readFile } from 'node:fs/promises';
import { Bridge } from './bridge.mjs';
import { stat } from 'node:fs/promises';
import { acquireLock } from './instance-lock.mjs';
import { createConsole } from './console-server.mjs';
const path = process.argv[2];
if (!path) { console.error('Usage: node main.mjs /path/to/config.json'); process.exit(2); }
const config = JSON.parse(await readFile(path, 'utf8'));
if ('access_token' in config || 'password' in config) throw new Error('Credentials must not be stored in the configuration file');
const endpoint = new URL(config.homeserver);
if (!['https:', ...(config.matrix_transport === 'pantalaimon' ? ['http:'] : [])].includes(endpoint.protocol) || endpoint.username || endpoint.password || !config.user_id || !config.cwd || !Array.isArray(config.allowed_senders) || !config.allowed_senders.length || !Array.isArray(config.direct_rooms)) throw new Error('Invalid Matrix endpoint or required configuration');
if (config.matrix_transport && !['direct','pantalaimon'].includes(config.matrix_transport)) throw new Error('Unknown Matrix transport');
if (!Array.isArray(config.admins) || !config.admins.length || config.admins.some(id => typeof id !== 'string' || !/^@[^:*]+:[^*]+$/.test(id))) throw new Error('admins must contain explicit Matrix user IDs');
if (!(await stat(config.cwd)).isDirectory()) throw new Error('cwd must be an existing directory');
const bridge = new Bridge(config, process.env.MATRIX_ACCESS_TOKEN || '');
const releaseLock = await acquireLock(bridge.statePath);
process.on('SIGTERM', () => bridge.stop());
process.on('SIGINT', () => bridge.stop());
let consoleServer;
try {
  const port = Number(config.console_port || 47614);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid console port');
  consoleServer = createConsole(bridge, path, port);
  await new Promise((resolve,reject)=>{consoleServer.once('error',reject);consoleServer.listen(port,'127.0.0.1',resolve);});
  await bridge.run();
} finally { if (consoleServer?.listening) await new Promise(resolve=>consoleServer.close(resolve)); await releaseLock(); }
