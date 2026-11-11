import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = join(HERE, 'fixtures');

/** Return an executable fixture path (chmod is idempotent and CI-safe). */
export function fixture(name) {
  const path = join(FIXTURES_DIR, name);
  chmodSync(path, 0o755);
  return path;
}

/** Create a temporary workspace and remove it when the test ends. */
export function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'matrix-bridge-adapter-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

export function envWith(overrides = {}) {
  return { ...process.env, NO_COLOR: '1', ...overrides };
}
