import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import {
  SECURITY_LAYERS,
  domain,
  matches,
  isAdmin,
  authorized,
  messageAllowed,
  inviteAllowed,
  effectivePolicy,
  evaluateAdmission,
  transportAllowed,
  isUndecryptable,
  rateLimitAllows,
  redact,
  isValidMatrixUserId
} from '../src/security.mjs';

const config = {
  user_id: '@bot:home.example',
  admins: ['@admin:home.example'],
  allowed_senders: ['@friend:home.example'],
  message_policy: 'allowlist',
  message_allowlist: ['@*:trusted.example', '@friend:home.example'],
  invite_policy: 'local_server'
};

test('domain and wildcard list matching', () => {
  assert.equal(domain('@a:Example.ORG'), 'example.org');
  assert.equal(domain('!room:example.org'), 'example.org');
  assert.equal(domain(''), '');
  assert.equal(matches('@a:trusted.example', ['@*:trusted.example']), true);
  assert.equal(matches('@a:other.example', ['@*:trusted.example']), false);
  assert.equal(matches('@a:other.example', ['@a:other.example']), true);
});

test('explicit sender allow-list is a hard gate with admin bypass removed', () => {
  assert.equal(authorized({ allowed_senders: ['*'] }, '@any:example.org'), true);
  assert.equal(authorized({ allowed_senders: ['@a:example.org'] }, '@a:example.org'), true);
  assert.equal(authorized({ allowed_senders: ['@a:example.org'] }, '@b:example.org'), false);
  assert.equal(isAdmin(config, '@admin:home.example'), true);
});

test('message policies: all, none, allowlist, blocklist and local server', () => {
  assert.equal(messageAllowed({ message_policy: 'all' }, '@a:remote.example'), true);
  assert.equal(messageAllowed({ message_policy: 'none' }, '@a:home.example'), false);
  assert.equal(messageAllowed({ message_policy: 'allowlist', message_allowlist: ['@*:trusted.example'] }, '@a:trusted.example'), true);
  assert.equal(messageAllowed({ message_policy: 'allowlist', message_allowlist: [] }, '@a:trusted.example'), false);
  assert.equal(messageAllowed({ message_policy: 'blocklist', message_blocklist: ['@bad:example.org'] }, '@bad:example.org'), false);
  assert.equal(messageAllowed({ message_policy: 'blocklist', message_blocklist: [] }, '@ok:example.org'), true);
  assert.equal(messageAllowed({ user_id: '@bot:home.example', message_policy: 'local_server' }, '@a:home.example'), true);
  assert.equal(messageAllowed({ user_id: '@bot:home.example', message_policy: 'local_server' }, '@a:remote.example'), false);
  assert.equal(messageAllowed(config, '@admin:home.example'), true);
  assert.equal(messageAllowed(config, '@friend:home.example'), true);
  assert.equal(messageAllowed(config, '@stranger:other.example'), false);
});

test('invite policies and admin bypass', () => {
  assert.equal(inviteAllowed({ invite_policy: 'all' }, '@a:remote.example'), true);
  assert.equal(inviteAllowed({ invite_policy: 'none' }, '@a:home.example'), false);
  assert.equal(inviteAllowed(config, '@friend:home.example'), true);
  assert.equal(inviteAllowed(config, '@friend:other.example'), false);
  assert.equal(inviteAllowed({ user_id: '@bot:home.example', invite_policy: 'allowlist', invite_allowlist: ['@ok:any.example'] }, '@ok:any.example'), true);
  assert.equal(inviteAllowed({ auto_join: true }, '@a:any.example'), true);
  assert.equal(inviteAllowed({}, '@a:any.example'), false);
  assert.equal(inviteAllowed({ admins: ['@admin:home.example'] }, '@admin:home.example'), true);
});

test('effective policy prefers room override, then DM, then config default', () => {
  assert.equal(effectivePolicy({ default_policy: 'mention' }, {}, true), 'all');
  assert.equal(effectivePolicy({ default_policy: 'mention' }, {}, false), 'mention');
  assert.equal(effectivePolicy({ group_reply_all: true }, {}, false), 'all');
  assert.equal(effectivePolicy({ default_policy: 'mention' }, { policy: 'mute' }, true), 'mute');
  assert.equal(effectivePolicy({ default_policy: 'all' }, { policy: 'default' }, false), 'all');
});

test('admission gateway combines identity, policy, room and permission layers', () => {
  assert.deepEqual(SECURITY_LAYERS, ['identity', 'policy', 'room', 'permission']);

  const base = {
    config: {
      user_id: '@bot:home.example',
      admins: ['@admin:home.example'],
      allowed_senders: ['@user:home.example', '@admin:home.example'],
      message_policy: 'all',
      default_policy: 'mention'
    },
    sender: '@user:home.example',
    room: {},
    addressed: true
  };

  assert.equal(evaluateAdmission({ ...base, sender: '@stranger:home.example' }).reason, 'sender-not-authorized');
  assert.equal(evaluateAdmission({ ...base, config: { ...base.config, message_policy: 'none' } }).reason, 'message-policy');
  assert.equal(evaluateAdmission({ ...base, isCommand: true, addressed: false }).reason, 'command-requires-mention');
  assert.equal(evaluateAdmission({ ...base, addressed: false }).reason, 'mention-required');
  assert.equal(evaluateAdmission({ ...base, room: { policy: 'mute' } }).reason, 'room-muted');
  assert.equal(evaluateAdmission({ ...base, room: { policy: 'mute' }, isCommand: true, addressed: true }).reason, 'room-muted');
  assert.equal(evaluateAdmission({ ...base, room: { policy: 'mute' }, isCommand: true, addressed: true, sender: '@admin:home.example' }).allowed, true);
  assert.equal(evaluateAdmission({ ...base, isCommand: false, config: { ...base.config, admin_only_workspace: true } }).reason, 'admin-only-workspace');
  assert.equal(evaluateAdmission({ ...base, isCommand: false, addressed: false, isDirect: true }).allowed, true);
  assert.equal(evaluateAdmission({ ...base, isCommand: true, addressed: false, sender: '@admin:home.example' }).allowed, false);
  assert.equal(evaluateAdmission({ ...base, isCommand: true, addressed: true, sender: '@admin:home.example' }).allowed, true);
});

test('transport gate only opens encrypted rooms through Pantalaimon', () => {
  assert.equal(transportAllowed({}, { encrypted: true }), false);
  assert.equal(transportAllowed({ matrix_transport: 'direct' }, { encrypted: true }), false);
  assert.equal(transportAllowed({ matrix_transport: 'pantalaimon' }, { encrypted: true }), true);
  assert.equal(transportAllowed({}, {}), true);
  assert.equal(isUndecryptable('** Unable to decrypt: missing key'), true);
  assert.equal(isUndecryptable('hello'), false);
});

test('rate limit is a sliding window and skips administrators', () => {
  const state = {};
  const now = 1_000_000;
  for (let index = 0; index < 6; index++) {
    assert.equal(rateLimitAllows(state, '@a:example.org', 'hi', { enabled: true, now }), true);
  }
  assert.equal(rateLimitAllows(state, '@a:example.org', 'hi', { enabled: true, now }), false);
  assert.equal(rateLimitAllows(state, '@a:example.org', 'hi', { enabled: true, admin: true, now }), true);
  assert.equal(rateLimitAllows(state, '@a:example.org', 'x'.repeat(12_001), { enabled: true, now }), false);
  assert.equal(rateLimitAllows(state, '@a:example.org', 'hi', { enabled: true, now: now + 60_001 }), true);
  assert.equal(rateLimitAllows(state, '@a:example.org', 'hi', { enabled: false, now }), true);
});

test('redaction strips the exact token, home paths, keys and well-known secrets', () => {
  assert.equal(redact('plain', false, 'secret'), 'plain');
  assert.equal(redact('token-actual-value', true, 'token-actual-value'), '[TOKEN_REDACTED]');
  const home = homedir();
  assert.equal(redact(`path ${home}/project`, true), 'path ~/project');
  const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----';
  assert.equal(redact(privateKey, true), '[PRIVATE_KEY_REDACTED]');
  assert.equal(redact('syt_abcdefghijkl', true), '[TOKEN_REDACTED]');
  assert.equal(redact('sk-abcdefghijklmnopqrst', true), '[TOKEN_REDACTED]');
  assert.equal(redact('ghp_abcdefghijklmnopqrstuvwx', true), '[TOKEN_REDACTED]');
  assert.equal(redact('github_pat_abcdefghijklmnopqrstuvwx', true), '[TOKEN_REDACTED]');
  assert.equal(redact('ordinary text', true), 'ordinary text');
});

test('Matrix user id validation matches the console contract', () => {
  assert.equal(isValidMatrixUserId('@admin:example.org'), true);
  assert.equal(isValidMatrixUserId('@admin:example.org:8448'), true);
  assert.equal(isValidMatrixUserId('admin:example.org'), false);
  assert.equal(isValidMatrixUserId('@bad:*'), false);
});
