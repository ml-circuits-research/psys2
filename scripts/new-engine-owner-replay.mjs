// English development/acceptance replay only; never reads independent holdout or old reader outputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runNewEngine } from '../src/dialog/new-engine.mjs';
import { initialState } from '../worlds/art.draw/board.mjs';
const pin = '2ba0259603ed5155b57324fca7c27fc249ba2a0a';
const path = 'compat/psys2/reader/development/rows.jsonl';
const raw = execFileSync('git', ['-C', '../soplang-words-lib', 'show', `${pin}:${path}`], { encoding: 'utf8', maxBuffer: 4_000_000 });
const input = raw.trim().split('\n').map(JSON.parse);
const retired = new Set(JSON.parse(readFileSync('docs/webchat/worlds/index.json')).retiredAreas.flatMap(area => [area.tab, area.id]));
const sessions = new Map(), rows = [];
for (const row of input) {
  const key = row.context.session ?? row.id;
  let session = sessions.get(key);
  if (!session) { session = { isession: { state: { 'art.draw': initialState(), 'ui.shell': {} } }, newEngineJournal: [] }; sessions.set(key, session); }
  const tab = row.context.tab;
  session.isession.state['ui.shell'].activeTab = tab;
  const before = JSON.stringify(session.isession.state), reply = runNewEngine(session, row.text, { language: 'en' });
  const unchanged = before === JSON.stringify(session.isession.state);
  const refused = reply.statuses.every(status => status === 'unsupported');
  // Without an independently reviewed state-intent check, success is never promoted to right.
  const verdict = refused && unchanged && reply.effects.length === 0 && reply.text.trim() ? 'honest' : 'needs-review';
  rows.push({ id: row.id, text: row.text, session: key, tab, area: row.area, retired: retired.has(tab), verdict,
    reason: reply.trace.reason ?? null, reply: reply.text, unchanged, legacy: reply.trace.legacy,
    source: { ...row.source, originalText: undefined }, contextualSetupReplayed: false });
}
const summary = Object.fromEntries(['right', 'partly', 'honest', 'wrong', 'needs-review'].map(verdict => [verdict, rows.filter(row => row.verdict === verdict).length]));
const result = { source: { libraryCommit: pin, path, sha256: createHash('sha256').update(raw).digest('hex') },
  scope: '205 reviewed English development rows; sessions replay in recorded order from empty native Drawing state. Historical external UI actions and hand-gloss setup commands are not reconstructed. This measures truthful refusal and observed effects, not semantic success against provisional labels.',
  summary, retired: rows.filter(row => row.retired).length, rows };
writeFileSync('training/results/new-engine-owner-english.json', JSON.stringify(result, null, 2) + '\n');
const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
writeFileSync('training/results/new-engine-owner-english.md', '# New-engine English owner replay\n\n' + result.scope + '\n\n' + JSON.stringify(summary) + `; retired rows: ${result.retired}. No legacy column.\n\n| Row | Tab | Retired | Verdict | Message | Reply |\n|---|---|---|---|---|---|\n` + rows.map(row => [row.id, row.tab, row.retired, row.verdict, row.text, row.reply].map(escape).join(' | ')).map(row => '| ' + row + ' |').join('\n') + '\n');
console.log(JSON.stringify({ summary, retired: result.retired, rows: rows.length }));
if (summary.wrong || summary['needs-review'] || rows.some(row => row.legacy !== false)) process.exitCode = 1;
