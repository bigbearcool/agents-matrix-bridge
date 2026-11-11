import { homedir } from 'node:os';
export const domain = id => String(id || '').split(':').slice(1).join(':').toLowerCase();
export function matches(user, list = []) { const host=domain(user); return list.some(rule => rule===user || (rule.startsWith('@*:') && rule.slice(3).toLowerCase()===host)); }
export function messageAllowed(config, sender) {
  if ((config.admins||[]).includes(sender)) return true;
  const p=config.message_policy || 'all';
  if(p==='none') return false;
  if(p==='allowlist') return matches(sender,config.message_allowlist);
  if(p==='blocklist') return !matches(sender,config.message_blocklist);
  if(p==='local_server') return domain(sender)===domain(config.user_id) && !matches(sender,config.message_blocklist);
  return p==='all';
}
export function inviteAllowed(config, sender) {
  if ((config.admins||[]).includes(sender)) return true;
  const p=config.invite_policy || (config.auto_join?'all':'none');
  if(p==='all') return true;
  if(p==='local_server') return !!sender && domain(sender)===domain(config.user_id);
  if(p==='allowlist') return matches(sender,config.invite_allowlist);
  return false;
}
export function redact(text, enabled, exactToken='') {
  let out=String(text || ''); if (!enabled) return out;
  if(exactToken) out=out.split(exactToken).join('[TOKEN_REDACTED]');
  const home=homedir(); if(home && home.length>1) out=out.split(home).join('~');
  return out.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,'[PRIVATE_KEY_REDACTED]').replace(/\bsyt_[A-Za-z0-9._~-]{10,}\b/g,'[TOKEN_REDACTED]').replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[TOKEN_REDACTED]').replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,'[TOKEN_REDACTED]');
}
