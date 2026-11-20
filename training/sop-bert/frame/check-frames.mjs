// Check converted frames with the library's frame inspection and compile each to std.request graphs (unbound).
// usage: node training/sop-bert/frame/check-frames.mjs FRAMES.jsonl[.gz] [LIBRARY_SRC]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
const [file, librarySrc = path.resolve(import.meta.dirname, '../../../../soplang-words-lib/src')] = process.argv.slice(2);
const { inspectFrame, frameToRequests, prepareRequestBatch } = await import(path.join(librarySrc, 'index.mjs'));
const bytes = readFileSync(file), text = file.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
const counts = { rows: 0, valid: 0, compiled: 0, batchOk: 0 }, reasons = {};
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line); counts.rows++;
  const check = inspectFrame(row.frame);
  if (!check.ok) { for (const i of check.issues) reasons['frame:' + i.reason] = (reasons['frame:' + i.reason] || 0) + 1; continue; }
  counts.valid++;
  const out = frameToRequests(row.frame);
  if (!out.ok || !out.entries.length) { reasons['no-entries'] = (reasons['no-entries'] || 0) + 1; continue; }
  counts.compiled++;
  const batch = prepareRequestBatch({ entries: out.entries });
  if (batch.ok) counts.batchOk++; else reasons['batch:' + batch.issues[0].reason] = (reasons['batch:' + batch.issues[0].reason] || 0) + 1;
}
console.log(JSON.stringify({ ...counts, reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 15)) }, null, 1));
