/**
 * Unified adapter entry point.
 *
 *   import { createAdapter } from './adapters/index.mjs';
 *   const adapter = createAdapter('codex', { defaultCliPath: '/usr/local/bin/codex' });
 *
 * Every adapter implements the `AgentRuntimeAdapter` contract from
 * `@matrix-bridge/core` (see packages/matrix-core/src/adapter.mjs).
 */

import { assertAgentRuntimeAdapter } from '../packages/matrix-core/src/adapter.mjs';
import { CodexAdapter } from './codex/index.mjs';
import { AntigravityAdapter } from './antigravity/index.mjs';
import { ZCodeAdapter } from './zcode/index.mjs';

export { CodexAdapter, AntigravityAdapter, ZCodeAdapter };
export { CodexClient, CodexAppServerClient } from './codex/client.mjs';

export const ADAPTER_NAMES = Object.freeze(['codex', 'antigravity', 'zcode']);

export const ADAPTERS = Object.freeze({
  codex: CodexAdapter,
  antigravity: AntigravityAdapter,
  zcode: ZCodeAdapter
});

const ALIASES = Object.freeze({
  agy: 'antigravity',
  'anti-gravity': 'antigravity',
  anti_gravity: 'antigravity',
  'codex-cli': 'codex',
  codex_cli: 'codex',
  'z-code': 'zcode',
  z_code: 'zcode'
});

function canonicalName(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return '';
  return Object.prototype.hasOwnProperty.call(ADAPTERS, raw) ? raw : ALIASES[raw] || '';
}

/**
 * Return the adapter class registered for `name` (case-insensitive, aliases
 * included).  Throws a descriptive error for unknown names.
 */
export function getAdapterClass(name) {
  const key = canonicalName(name);
  if (!key) {
    throw new Error(`Unknown adapter "${name}". Available adapters: ${ADAPTER_NAMES.join(', ')}`);
  }
  return ADAPTERS[key];
}

/**
 * Create and validate an adapter instance.
 *
 * @param {'codex'|'antigravity'|'zcode'|string} name
 * @param {object} [options] Adapter-specific options forwarded to the constructor.
 * @returns {import('../packages/matrix-core/src/adapter.mjs').AgentRuntimeAdapter}
 */
export function createAdapter(name, options = {}) {
  let adapterName = name;
  let adapterOptions = options;
  if (name && typeof name === 'object') {
    adapterOptions = { ...name, ...options };
    adapterName = name.name || name.adapter;
  }
  if (!adapterOptions || typeof adapterOptions !== 'object') {
    throw new TypeError('createAdapter options must be an object');
  }
  const Adapter = getAdapterClass(adapterName);
  const adapter = new Adapter(adapterOptions);
  return assertAgentRuntimeAdapter(adapter);
}

export default createAdapter;
