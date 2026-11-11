import { basename, extname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

export function mimeTypeFor(filename) {
  return TYPES[extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

/** Parse image dimensions without any native dependency. */
export function imageDimensions(buf) {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString())) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let pos = 2;
    while (pos + 3 < buf.length) {
      if (buf[pos] !== 0xff) { pos++; continue; }
      const marker = buf[pos + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0xff) { pos++; continue; }
      const len = buf.readUInt16BE(pos + 2);
      if (len < 2 || pos + 2 + len > buf.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && len >= 7) {
        return { w: buf.readUInt16BE(pos + 7), h: buf.readUInt16BE(pos + 5) };
      }
      pos += 2 + len;
    }
  }
  return {};
}

/** Extract file references produced by an agent reply. */
export function outputFiles(text, cwd) {
  const found = [];
  const seen = new Set();
  const patterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,
    /<send-file\s+path=["']([^"']+)["']\s*\/?>/gi,
    /\[SEND_FILE:\s*([^\]]+)\]/gi
  ];
  for (const pattern of patterns) {
    for (const match of String(text ?? '').matchAll(pattern)) {
      let path = match[1].trim().replace(/^file:\/\//, '');
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) continue;
      path = isAbsolute(path) ? path : resolve(cwd, path);
      if (!seen.has(path)) { seen.add(path); found.push({ path, marker: match[0] }); }
    }
  }
  return found;
}

async function readLimitedBody(res, limit) {
  const chunks = [];
  let size = 0;
  if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > limit) throw new Error('attachment exceeds 50 MiB');
      chunks.push(chunk);
    }
  } else if (typeof res.arrayBuffer === 'function') {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > limit) throw new Error('attachment exceeds 50 MiB');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Download a Matrix media event into a private, 0700 cache directory.
 * Encrypted attachments fail closed (Pantalaimon is expected to expose plain
 * media URLs once configured); size limits are enforced on metadata, headers
 * and bytes so a lying homeserver cannot exhaust disk.
 *
 * @returns {Promise<string>} absolute path of the cached file
 */
export async function downloadMedia({
  fetchImpl = fetch,
  homeserver = '',
  token = '',
  content = {},
  cacheDir,
  maxBytes = MAX_MEDIA_BYTES
} = {}) {
  if (content.file) throw new Error('encrypted attachments are not supported');
  const match = /^mxc:\/\/([^/]+)\/([^/]+)$/.exec(content.url || '');
  if (!match) throw new Error('invalid Matrix attachment URL');
  if (Number(content.info?.size || 0) > maxBytes) throw new Error('attachment exceeds 50 MiB');

  const base = String(homeserver).replace(/\/$/, '');
  const part = `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
  let res = await fetchImpl(`${base}/_matrix/client/v1/media/download/${part}`, {
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}` }
  });
  if ([404, 405, 501].includes(res.status)) {
    res = await fetchImpl(`${base}/_matrix/media/v3/download/${part}`, {
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
  if (!res.ok) throw new Error(`Matrix media HTTP ${res.status}`);
  if (Number(res.headers?.get?.('content-length') || 0) > maxBytes) {
    throw new Error('attachment exceeds 50 MiB');
  }
  const buffer = await readLimitedBody(res, maxBytes);

  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const rawExt = extname(String(content.body || '')).toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : '';
  const file = resolve(cacheDir, `${randomUUID()}${safeExt}`);
  await writeFile(file, buffer, { mode: 0o600, flag: 'wx' });
  return file;
}

/** Upload a local file to the room and send it as a native Matrix media event. */
export async function sendFile(bridge, roomId, path, eventId, threadRoot) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('附件不是普通文件');
  if (info.size > MAX_MEDIA_BYTES) throw new Error('附件大于 50 MiB');
  const buffer = await readFile(path);
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('附件大于 50 MiB');
  const filename = basename(path);
  const mime = mimeTypeFor(filename);
  const url = bridge.config.homeserver.replace(/\/$/, '') + '/_matrix/media/v3/upload?filename=' + encodeURIComponent(filename);
  const response = await bridge.fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': mime },
    body: buffer
  });
  if (!response.ok) throw new Error(`Matrix upload HTTP ${response.status}`);
  const uploaded = await response.json();
  if (!/^mxc:\/\//.test(uploaded.content_uri || '')) throw new Error('Matrix upload response missing content URI');
  const msgtype = mime.startsWith('image/') ? 'm.image' : mime.startsWith('video/') ? 'm.video' : mime.startsWith('audio/') ? 'm.audio' : 'm.file';
  const relation = threadRoot
    ? { rel_type: 'm.thread', event_id: threadRoot, is_falling_back: true, 'm.in_reply_to': { event_id: eventId } }
    : eventId
      ? { 'm.in_reply_to': { event_id: eventId } }
      : null;
  const body = {
    msgtype,
    body: filename,
    url: uploaded.content_uri,
    info: { mimetype: mime, size: buffer.length, ...imageDimensions(buffer) },
    ...(relation ? { 'm.relates_to': relation } : {})
  };
  const result = await bridge.api(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${randomUUID()}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  await bridge.rememberSent(roomId, result.event_id);
  return result;
}
