// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Node adapter of the on-device translation host (docs/webchat/ui/mt-host.mjs): the same engine, registry and worker as the page uses, with the files cached in a
 * directory (gzip as downloaded) and the vendored classic worker run in a worker_threads worker. Used by the measuring scripts and the "phone" test mode.
 *
 *   const mt = await createNodeMt({ cacheDir });  await mt.ensure('ro');  await mt.translate('Cât face 3 plus 4?', 'ro', 'en');  mt.reset();
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createMtHost } from '../../docs/webchat/ui/mt-host.mjs';
import { protectedTranslate } from '../../src/translate/keep-list.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VENDOR = join(REPO, 'docs/webchat/vendor/bergamot');
export const loadRegistry = () => JSON.parse(readFileSync(join(VENDOR, 'registry.json'), 'utf8'));

/** The vendored worker is a classic script that expects `__dirname`, `__filename` and `require` (CommonJS): run it as an eval worker with those defined. */
function spawnNodeWorker() {
  const src = readFileSync(join(VENDOR, 'translator-worker.js'), 'utf8');
  const code = `const __dirname = ${JSON.stringify(VENDOR)}, __filename = ${JSON.stringify(join(VENDOR, 'translator-worker.js'))};\n${src}`;
  const w = new Worker(code, { eval: true });
  const like = { postMessage: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null };
  w.on('message', (data) => like.onmessage?.({ data }));
  w.on('error', (e) => like.onerror?.(e));
  return like;
}

export async function createNodeMt({ cacheDir, registry = loadRegistry(), onState, deadlineMs, initDeadlineMs, keep = null } = {}) {   // keep: () => { keep, extra } (src/translate/keep-list.mjs): the app words the model must not change
  mkdirSync(cacheDir, { recursive: true });
  const fetchFile = async (url, { bytes, onProgress }) => {
    const file = join(cacheDir, url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_'));
    let gz;
    if (existsSync(file)) gz = readFileSync(file);
    else {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`download failed (${r.status}): ${url}`);
      gz = Buffer.from(await r.arrayBuffer());
      const tmp = `${file}.part`;
      writeFileSync(tmp, gz); renameSync(tmp, file);
    }
    onProgress?.(gz.length);
    const out = gunzipSync(gz);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  };
  const host = createMtHost({ registry, fetchFile, spawn: spawnNodeWorker, onState, deadlineMs, initDeadlineMs });
  if (keep) host.translate = protectedTranslate(host.translate.bind(host), keep);
  return host;
}
