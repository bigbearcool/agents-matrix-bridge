import { open, mkdir, unlink, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function acquireLock(statePath) {
  const path=statePath+'.lock'; await mkdir(dirname(path),{recursive:true,mode:0o700});
  const handle=await open(path,'wx',0o600); const identity=`${process.pid}:${randomUUID()}`;
  try { await handle.writeFile(identity); } catch(e) { await handle.close(); throw e; }
  return async () => { const contents=await readFile(path,'utf8').catch(()=>null); await handle.close(); if (contents===identity) await unlink(path); };
}
