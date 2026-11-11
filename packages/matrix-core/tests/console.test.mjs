import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { Bridge } from '../src/bridge.mjs';
import { AgentRuntimeAdapter } from '../src/adapter.mjs';
import { createConsole } from '../src/console-server.mjs';

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function setup(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'matrix-core-console-'));
  const dist = join(dir, 'dist');
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Matrix Bridge 控制台</title><script type="module" src="/app.js"></script>');
  await writeFile(join(dist, 'app.js'), 'console.log("app");');
  await writeFile(join(dist, 'styles.css'), 'body{}');
  await writeFile(join(dist, 'panel-adapter.js'), 'window.bridgeAPI={};');
  const config = {
    cwd: dir,
    admins: ['@admin:example.org'],
    allowed_senders: ['*'],
    homeserver: 'https://example.org',
    user_id: '@bot:example.org',
    direct_rooms: [],
    state_path: join(dir, 'state.json'),
    staticDir: dist,
    ...overrides
  };
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const resets = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake', defaultCliPath: '/bin/fake' });
  adapter.listAvailableModels = async () => ({
    models: [{ id: 'm1', name: 'Model One', description: 'first' }],
    efforts: ['low', 'high']
  });
  adapter.resetSession = async (roomId, threadId) => { resets.push({ roomId, threadId }); };
  const bridge = new Bridge({
    config,
    adapter,
    token: '',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });
  await bridge.load();
  bridge.running = true;
  bridge.activity.push({ time: new Date().toISOString(), kind: 'message', message: 'hello' });
  const port = await freePort();
  const server = createConsole(bridge, configPath, port);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${port}`;
  return { dir, dist, config, configPath, adapter, bridge, port, server, origin, resets };
}

async function close(context) {
  await new Promise((resolve) => context.server.close(resolve));
}

test('hosts the static console and blocks path traversal', async () => {
  const context = await setup();
  try {
    const index = await fetch(context.origin + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await index.text(), /Matrix Bridge 控制台/);

    const app = await fetch(context.origin + '/app.js');
    assert.equal(app.status, 200);
    assert.match(app.headers.get('content-type'), /application\/javascript/);

    const css = await fetch(context.origin + '/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const adapter = await fetch(context.origin + '/panel-adapter.js');
    assert.equal(adapter.status, 200);

    const traversal = await fetch(context.origin + '/..%2fsecret.txt');
    assert.equal(traversal.status, 404);

    const hostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest({
        host: '127.0.0.1',
        port: context.port,
        path: '/api/status',
        headers: { Host: 'evil.example' }
      }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(hostStatus, 403);
  } finally {
    await close(context);
  }
});

test('serves status, config and models without leaking credentials', async () => {
  const context = await setup();
  try {
    const status = await (await fetch(context.origin + '/api/status')).json();
    assert.equal(status.running, true);
    assert.equal(status.configured, false);
    assert.equal(status.adapter, 'fake');
    assert.equal(status.agent_cli, '/bin/fake');
    assert.equal(status.user_id, '@bot:example.org');

    const config = await (await fetch(context.origin + '/api/config')).json();
    assert.equal(config.has_token, false);
    assert.equal(config.default_policy, 'mention');
    assert.equal(config.adapter, 'fake');
    assert.equal('access_token' in config, false);
    assert.equal(config.cwd, context.dir);

    const models = await (await fetch(context.origin + '/api/models')).json();
    assert.equal(models.adapter, 'fake');
    assert.deepEqual(models.models, [{ id: 'm1', name: 'Model One', description: 'first' }]);
    assert.deepEqual(models.efforts, ['low', 'high']);

    const logs = await (await fetch(context.origin + '/api/logs')).json();
    assert.equal(logs.logs.length, 1);

    const browsed = await (await fetch(context.origin + '/api/fs/browse?path=' + encodeURIComponent(context.dir))).json();
    assert.equal(browsed.path, context.dir);
    assert.ok(browsed.dirs.includes('dist'));
  } finally {
    await close(context);
  }
});

test('rejects cross-origin writes and unknown config fields while accepting local JSON clients', async () => {
  const context = await setup();
  try {
    const denied = await fetch(context.origin + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ default_policy: 'all' })
    });
    assert.equal(denied.status, 403);

    const wrongType = await fetch(context.origin + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ default_policy: 'all' })
    });
    assert.equal(wrongType.status, 403);

    const accepted = await fetch(context.origin + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_policy: 'all', base_dir: context.dir })
    });
    assert.equal(accepted.status, 200);
    const saved = JSON.parse(await readFile(context.configPath, 'utf8'));
    assert.equal(saved.default_policy, 'all');
    assert.equal(saved.cwd, context.dir);
    assert.equal(context.bridge.config.default_policy, 'all');

    const unknown = await fetch(context.origin + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: 'dummy' })
    });
    assert.equal(unknown.status, 400);

    const missing = await fetch(context.origin + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: '/definitely/not/here' })
    });
    assert.equal(missing.status, 400);
  } finally {
    await close(context);
  }
});

test('room listing, update routes and reconcile enforce exact unknown events', async () => {
  const context = await setup();
  const { bridge } = context;
  try {
    bridge.state.rooms['!r'] = { name: 'Group Chat', peers: { '@user:example.org': 'User' }, workspace: context.dir, thread_id: 'old' };
    const rooms = await (await fetch(context.origin + '/api/rooms')).json();
    assert.equal(rooms.rooms.length, 1);
    assert.equal(rooms.rooms[0].id, '!r');
    assert.equal(rooms.rooms[0].name, 'Group Chat');
    assert.equal(rooms.rooms[0].effective_policy, 'mention');

    const updated = await fetch(context.origin + '/api/rooms/' + encodeURIComponent('!r'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: 'all', model: 'm1', effort: 'high', reset_session: true })
    });
    assert.equal(updated.status, 200);
    assert.equal(bridge.state.rooms['!r'].policy, 'all');
    assert.equal(bridge.state.rooms['!r'].model, 'm1');
    assert.equal(bridge.state.rooms['!r'].effort, 'high');
    assert.equal(bridge.state.rooms['!r'].thread_id, '');
    assert.deepEqual(context.resets, [{ roomId: '!r', threadId: 'old' }]);

    const invalid = await fetch(context.origin + '/api/rooms/' + encodeURIComponent('!r'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effort: 'extreme' })
    });
    assert.equal(invalid.status, 400);

    const resumed = [];
    bridge.enqueue = (item) => resumed.push(item.id);
    bridge.state.inbox = [
      { roomId: '!r', id: '$unknown', status: 'replying' },
      { roomId: '!r', id: '$next', status: 'queued' }
    ];
    bridge.blockedRooms.add('!r');
    const wrong = await fetch(context.origin + '/api/rooms/' + encodeURIComponent('!r') + '/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: '$wrong' })
    });
    assert.equal(wrong.status, 400);
    assert.deepEqual(resumed, []);
    const correct = await fetch(context.origin + '/api/rooms/' + encodeURIComponent('!r') + '/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: '$unknown' })
    });
    assert.equal(correct.status, 200);
    assert.deepEqual(resumed, ['$next']);
    assert.equal(bridge.blockedRooms.has('!r'), false);
    assert.deepEqual(bridge.state.inbox.map((item) => item.id), ['$next']);
  } finally {
    await close(context);
  }
});

test('login verifies the Matrix account and keeps the token only in memory', async () => {
  const context = await setup();
  const { bridge } = context;
  try {
    bridge.token = '';
    bridge.fetch = async (url) => {
      assert.match(url, /account\/whoami/);
      return { ok: true, json: async () => ({ user_id: '@bot:example.org', device_id: 'DEVICE' }) };
    };
    const response = await fetch(context.origin + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: 'super-secret-token' })
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(JSON.parse(text).user_id, '@bot:example.org');
    assert.equal(bridge.token, 'super-secret-token');
    assert.equal(text.includes('super-secret-token'), false);
    assert.equal((await readFile(context.configPath, 'utf8')).includes('super-secret-token'), false);

    const status = await (await fetch(context.origin + '/api/status')).json();
    assert.equal(status.configured, true);
    assert.equal(status.connected, true);
  } finally {
    await close(context);
  }
});

test('legacy room/update, migration and defaults endpoints remain available', async () => {
  const context = await setup();
  const { bridge } = context;
  try {
    bridge.state.rooms['!r'] = { thread_id: 'old', migration_candidates: [{ thread_id: 'a', scopes: ['room'] }] };
    const defaults = await fetch(context.origin + '/api/defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'm1', effort: 'high' })
    });
    assert.equal(defaults.status, 200);
    assert.equal(bridge.state.settings.default_model, 'm1');

    const update = await fetch(context.origin + '/api/rooms/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '!r', policy: 'mute' })
    });
    assert.equal(update.status, 200);
    assert.equal(bridge.state.rooms['!r'].policy, 'mute');

    const resumed = [];
    bridge.enqueue = (item) => resumed.push(item.id);
    bridge.state.inbox = [{ roomId: '!r', id: '$next', status: 'queued' }];
    bridge.blockedRooms.add('!r');
    const migration = await fetch(context.origin + '/api/migration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '!r', thread_id: 'a' })
    });
    assert.equal(migration.status, 200);
    assert.equal(bridge.state.rooms['!r'].thread_id, 'a');
    assert.deepEqual(resumed, ['$next']);
  } finally {
    await close(context);
  }
});
