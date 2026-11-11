#!/usr/bin/env node
/**
 * Matrix API & Provisioning Helper for install.sh
 * Provides robust, cross-platform Matrix CS-API operations without external dependencies.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function out(data) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

function fail(msg) {
  out({ ok: false, error: String(msg) });
  process.exit(0); // keep exit 0 so bash can parse JSON output cleanly
}

const [,, cmd, ...args] = process.argv;

async function request(url, options = {}) {
  const timeoutMs = options.timeout || 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, ok: false, error: err.message };
  }
}

function cleanBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

switch (cmd) {
  case 'check-server': {
    const baseUrl = cleanBaseUrl(args[0]);
    if (!baseUrl) fail('URL required');
    const res = await request(`${baseUrl}/_matrix/client/versions`, { timeout: 4000 });
    if (res.ok && Array.isArray(res.data?.versions)) {
      out({ ok: true, versions: res.data.versions, server: baseUrl });
    } else {
      out({ ok: false, error: res.error || `HTTP ${res.status}` });
    }
    break;
  }

  case 'login': {
    const baseUrl = cleanBaseUrl(args[0]);
    const username = String(args[1] || '').trim();
    const password = String(args[2] || '').trim();
    if (!baseUrl || !username || !password) fail('Missing baseUrl, username or password');

    // Matrix allows user to login via user identifier or raw username
    const body = {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: username.startsWith('@') ? username.split(':')[0].slice(1) : username
      },
      password,
      initial_device_display_name: 'Matrix Bridge Agent'
    };

    const res = await request(`${baseUrl}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok && res.data?.access_token) {
      out({
        ok: true,
        user_id: res.data.user_id,
        access_token: res.data.access_token,
        device_id: res.data.device_id
      });
    } else {
      out({
        ok: false,
        error: res.data?.error || `HTTP ${res.status}: Login failed`
      });
    }
    break;
  }

  case 'register': {
    const baseUrl = cleanBaseUrl(args[0]);
    const username = String(args[1] || '').trim().replace(/^@/, '').split(':')[0];
    const password = String(args[2] || '').trim();
    const sharedSecret = String(args[3] || '').trim();

    if (!baseUrl || !username || !password) fail('Missing required registration parameters');

    const body = {
      username,
      password,
      auth: { type: 'm.login.dummy' },
      inhibit_login: false
    };

    const res = await request(`${baseUrl}/_matrix/client/v3/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok && res.data?.user_id) {
      out({
        ok: true,
        user_id: res.data.user_id,
        access_token: res.data.access_token,
        device_id: res.data.device_id
      });
    } else {
      // If registration fails because user exists, try to log in
      if (res.data?.errcode === 'M_USER_IN_USE') {
        const loginRes = await request(`${baseUrl}/_matrix/client/v3/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'm.login.password',
            identifier: { type: 'm.id.user', user: username },
            password
          })
        });
        if (loginRes.ok && loginRes.data?.access_token) {
          out({
            ok: true,
            user_id: loginRes.data.user_id,
            access_token: loginRes.data.access_token,
            existed: true
          });
          break;
        }
      }
      out({
        ok: false,
        error: res.data?.error || `HTTP ${res.status}: Registration failed`
      });
    }
    break;
  }

  case 'save-config': {
    const destPath = args[0];
    const configJson = args[1];
    if (!destPath || !configJson) fail('Path and JSON payload required');
    try {
      const parsed = JSON.parse(configJson);
      let existing = {};
      try {
        existing = JSON.parse(await readFile(destPath, 'utf8'));
      } catch {
        // file doesn't exist yet
      }
      const merged = { ...existing, ...parsed };
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      out({ ok: true, path: destPath });
    } catch (err) {
      fail(err.message);
    }
    break;
  }

  default:
    fail(`Unknown command: ${cmd}`);
}
