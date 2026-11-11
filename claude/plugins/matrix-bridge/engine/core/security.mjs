import { homedir } from 'node:os';

/**
 * Security gateway primitives for @matrix-bridge/core.
 *
 * Inbound messages cross four independent gates before an agent turn is
 * scheduled:
 *   1. identity   — sender must be an authorized Matrix user id;
 *   2. policy     — sender must pass message_policy / lists;
 *   3. room       — room policy (all/mention/mute), mentions and commands;
 *   4. permission — administrator-only workspace and command rights.
 *
 * `evaluateAdmission()` combines gates 1–4 into one pure decision. Transport
 * (E2EE/Pantalaimon) and rate/federation signals stay separate so callers can
 * keep fail-closed behavior for unknown delivery outcomes.
 */

export const SECURITY_LAYERS = Object.freeze(['identity', 'policy', 'room', 'permission']);

export const domain = (id) => String(id || '').split(':').slice(1).join(':').toLowerCase();

export function matches(user, list = []) {
  const host = domain(user);
  return list.some((rule) => rule === user || (rule.startsWith('@*:') && rule.slice(3).toLowerCase() === host));
}

export function isAdmin(config, sender) {
  return (config?.admins || []).includes(sender);
}

/** Explicit allow-list used before any Matrix API is called. */
export function authorized(config, sender) {
  const allowed = config?.allowed_senders || [];
  return allowed.includes('*') || allowed.includes(sender);
}

export const isAuthorizedSender = authorized;

export function messageAllowed(config, sender) {
  if (isAdmin(config, sender)) return true;
  const policy = config?.message_policy || 'all';
  if (policy === 'none') return false;
  if (policy === 'allowlist') return matches(sender, config.message_allowlist);
  if (policy === 'blocklist') return !matches(sender, config.message_blocklist);
  if (policy === 'local_server') {
    return domain(sender) === domain(config.user_id) && !matches(sender, config.message_blocklist);
  }
  return policy === 'all';
}

export function inviteAllowed(config, sender) {
  if (isAdmin(config, sender)) return true;
  const policy = config?.invite_policy || (config?.auto_join ? 'all' : 'none');
  if (policy === 'all') return true;
  if (policy === 'local_server') return !!sender && domain(sender) === domain(config.user_id);
  if (policy === 'allowlist') return matches(sender, config.invite_allowlist);
  return false;
}

/** Effective delivery policy for a room, accounting for direct chats. */
export function effectivePolicy(config, room = {}, isDirect = false) {
  if (room.policy && room.policy !== 'default') return room.policy;
  if (isDirect) return 'all';
  return config?.default_policy || (config?.group_reply_all ? 'all' : 'mention');
}

function decision(allowed, reason, layer, admin = false) {
  return { allowed, reason, layer, admin };
}

/**
 * Pure admission decision across the four security layers.
 *
 * @param {object} input
 * @param {object} input.config
 * @param {string} input.sender
 * @param {object} [input.room]
 * @param {boolean} [input.isDirect]
 * @param {boolean} [input.isCommand]
 * @param {boolean} [input.addressed]    Whether the bot was explicitly addressed.
 * @returns {{allowed: boolean, reason: string, layer: string, admin: boolean}}
 */
export function evaluateAdmission({
  config = {},
  sender = '',
  room = {},
  isDirect = false,
  isCommand = false,
  addressed = false
} = {}) {
  const admin = isAdmin(config, sender);

  // Layer 1 — identity: explicit sender allow-list.
  if (!authorized(config, sender)) return decision(false, 'sender-not-authorized', 'identity', admin);

  // Layer 2 — sender policy (allow/block/local server).
  if (!messageAllowed(config, sender)) return decision(false, 'message-policy', 'policy', admin);

  // Layer 3 — room policy. Commands always require the bot to be addressed.
  if (isCommand && !addressed) return decision(false, 'command-requires-mention', 'room', admin);
  const policy = effectivePolicy(config, room, isDirect);
  if (policy === 'mute') {
    if (isCommand && addressed && admin) return decision(true, 'admin-command-override', 'permission', admin);
    return decision(false, 'room-muted', 'room', admin);
  }
  if (policy !== 'all' && !addressed) return decision(false, 'mention-required', 'room', admin);

  // Layer 4 — permission: non-command turns in admin-only workspaces.
  if (!isCommand && config.admin_only_workspace && !admin) {
    return decision(false, 'admin-only-workspace', 'permission', admin);
  }

  return decision(true, `policy-${policy}`, 'permission', admin);
}

/** E2EE transport guard: encrypted rooms are only safe through Pantalaimon. */
export function transportAllowed(config = {}, room = {}) {
  return !room.encrypted || config.matrix_transport === 'pantalaimon';
}

/** Pantalaimon placeholder emitted before a session key is available. */
export function isUndecryptable(body) {
  return String(body || '').startsWith('** Unable to decrypt');
}

/**
 * Sliding-window rate limit. Mutates `state.senderRates` (Map) exactly like the
 * historical bridge implementation.
 */
export function rateLimitAllows(state, sender, body, options = {}) {
  const {
    enabled = false,
    admin = false,
    max = 6,
    windowMs = 60_000,
    maxLength = 12_000,
    now = Date.now()
  } = options;
  if (!enabled || admin) return true;
  if (String(body || '').length > maxLength) return false;
  const rates = state.senderRates || (state.senderRates = new Map());
  const recent = (rates.get(sender) || []).filter((time) => now - time < windowMs);
  if (recent.length >= max) {
    rates.set(sender, recent);
    return false;
  }
  recent.push(now);
  rates.set(sender, recent);
  return true;
}

export function redact(text, enabled, exactToken = '') {
  let out = String(text || '');
  if (!enabled) return out;
  if (exactToken) out = out.split(exactToken).join('[TOKEN_REDACTED]');
  const home = homedir();
  if (home && home.length > 1) out = out.split(home).join('~');
  return out
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[PRIVATE_KEY_REDACTED]')
    .replace(/\bsyt_[A-Za-z0-9._~-]{10,}\b/g, '[TOKEN_REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[TOKEN_REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[TOKEN_REDACTED]');
}

/** Matrix user id shape accepted by the console configuration validator. */
export function isValidMatrixUserId(value) {
  return typeof value === 'string' && /^@[^:*]+:[^*]+$/.test(value);
}
