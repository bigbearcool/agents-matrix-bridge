/**
 * @matrix-bridge/core — agent-agnostic Matrix bridge kernel.
 */

export {
  AgentRuntimeAdapter,
  ADAPTER_METHODS,
  assertAgentRuntimeAdapter,
  isAgentRuntimeAdapter,
  normalizeTurnResult,
  normalizeModelCatalog
} from './adapter.mjs';

export { Bridge } from './bridge.mjs';
export { handleCommand, parseCommand, readModelCatalog } from './commands.mjs';
export { createConsole, cleanConfig, validateConfigPatch } from './console-server.mjs';
export {
  SECURITY_LAYERS,
  domain,
  matches,
  isAdmin,
  authorized,
  isAuthorizedSender,
  messageAllowed,
  inviteAllowed,
  effectivePolicy,
  evaluateAdmission,
  transportAllowed,
  isUndecryptable,
  rateLimitAllows,
  redact,
  isValidMatrixUserId
} from './security.mjs';
export {
  MAX_MEDIA_BYTES,
  mimeTypeFor,
  imageDimensions,
  outputFiles,
  downloadMedia,
  sendFile
} from './media.mjs';
export { acquireLock } from './instance-lock.mjs';
export { Bridge as CoreEngine } from './bridge.mjs';

export const VERSION = '1.0.0';

import { Bridge } from './bridge.mjs';

/**
 * Convenience factory mirroring the constructor contract.
 * @param {{config: object, adapter: import('./adapter.mjs').AgentRuntimeAdapter, token?: string, fetchImpl?: Function, statePath?: string}} options
 */
export function createBridge(options) {
  return new Bridge(options);
}

export default Bridge;
