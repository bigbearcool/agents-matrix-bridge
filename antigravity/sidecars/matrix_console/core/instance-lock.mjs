import { open, mkdir, unlink, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Acquire an exclusive single-instance lock next to the state file.
 * Returns an idempotent release function; a second holder gets EEXIST.
 */
export async function acquireLock(statePath) {
  const path = statePath + '.lock';
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, 'wx', 0o600);
  const identity = `${process.pid}:${randomUUID()}`;
  try {
    await handle.writeFile(identity);
  } catch (error) {
    await handle.close();
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    const contents = await readFile(path, 'utf8').catch(() => null);
    await handle.close();
    if (contents === identity) await unlink(path);
  };
}
