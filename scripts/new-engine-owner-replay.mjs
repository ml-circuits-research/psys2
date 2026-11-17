// English development/acceptance replay only; never reads independent holdout or old reader outputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { routeNewEngine as runNewEngine } from '../src/dialog/reader-routing.mjs';
import { initialState } from '../worlds/art.draw/board.mjs';
import {createDrawingHost} from '../worlds/art.draw/declared-host.mjs';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
import {summarizeReaderStages,rankLeafReasons} from './lib/reader-stage-counts.mjs';
const args=process.argv.slice(2),specIndex=args.indexOf('--reader-spec'),outIndex=args.indexOf('--output-prefix'),browserMode=args.includes('--browser-route');
if(browserMode&&specIndex>=0)throw Error('one-reader-runtime-only');
if((specIndex>=0||browserMode)&&outIndex<0)throw Error('actual-reader-requires-separate-output-prefix');
const actual=specIndex<0?null:await loadActualReplayReader(JSON.parse(readFileSync(args[specIndex+1],'utf8'))),output=outIndex<0?'training/results/new-engine-owner-english':args[outIndex+1],histories=new Map(),hosts=new Map();
const browser=browserMode?await (await import('./lib/browser-reader-route.mjs')).openBrowserReaderRoute():null;
const config=actual?JSON.parse(JSON.parse(readFileSync(JSON.parse(readFileSync(args[specIndex+1])).artifactRoot+'/manifest.json')).configJSON):null;
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
  const before = JSON.stringify(session.isession.state);
  if(actual&&!hosts.has(key))hosts.set(key,createDrawingHost({state:session.isession.state['art.draw'],instanceId:'owner-'+createHash('sha256').update(key).digest('hex')}));
  const measured=browser?await browser.send({text:row.text,state:session.isession.state,meta:{readerPrevious:histories.get(key)??null}}):actual?await actual.run(session,row.text,{area:tab==='draw'?'drawing':tab,host:tab==='draw'?hosts.get(key):null,previous:histories.get(key)??null}):null;
  if(browser&&measured.state)session.isession.state=measured.state;
  const reply=measured?measured.reply:await runNewEngine(session,row.text,{language:'en'});histories.set(key,row.text);
  const unchanged = browser?(measured.unchanged??JSON.stringify(measured.before)===JSON.stringify(measured.state)):before === JSON.stringify(session.isession.state);
  const refused = reply.statuses.every(status => status === 'unsupported');
  // Without an independently reviewed state-intent check, success is never promoted to right.
  const verdict = refused && unchanged && reply.effects.length === 0 && reply.text.trim() ? 'honest' : 'needs-review';
  rows.push({ ...(actual?{stages:summarizeReaderStages(measured?.measurement,config)}:{}),acted:reply?.statuses?.includes('supported')===true&&(!unchanged||reply?.trace?.assessment==='unchanged'),readerMeasurement:browser?{browser:true,readerHost:measured.reply?.trace?.readerHost??null}:measured?.measurement, readerRouting: reply.trace.readerRouting, classes: Array.isArray(row.classes) && row.classes.length ? row.classes : ['unclassified'], classificationStatus: Array.isArray(row.classes) && row.classes.length ? 'source-declared' : 'pending-reviewed-intent-tags', id: row.id, text: row.text, session: key, tab, area: row.area, retired: retired.has(tab), verdict,
    reason: reply.trace.reason ?? null, reply: reply.text, unchanged, legacy: reply.trace.legacy,
    source: { ...row.source, originalText: undefined }, contextualSetupReplayed: false });
}
const summary = Object.fromEntries(['right', 'partly', 'honest', 'wrong', 'needs-review'].map(verdict => [verdict, rows.filter(row => row.verdict === verdict).length]));
const stageSummary=actual?{cutterComplete:rows.filter(r=>r.stages?.cutter.complete).length,rawComplete:rows.filter(r=>r.stages?.raw.complete).length,bound:rows.filter(r=>r.stages?.pipeline.nonemptyGraph).length,executed:rows.filter(r=>r.acted).length,reasons:rankLeafReasons(rows)}:null;
const result = { stageSummary,reader:browser?.info??actual?.verified, source: { libraryCommit: pin, path, sha256: createHash('sha256').update(raw).digest('hex') },
  scope: '205 reviewed English development rows; sessions replay in recorded order from empty native Drawing state. Historical external UI actions and hand-gloss setup commands are not reconstructed. This measures truthful refusal and observed effects, not semantic success against provisional labels.',
  classCounts: Object.fromEntries([...new Set(rows.flatMap(row => row.classes))].sort().map(name => [name, rows.filter(row => row.classes.includes(name)).length])),
  summary, retired: rows.filter(row => row.retired).length, rows };
writeFileSync(output+'.json', JSON.stringify(result, null, 2) + '\n');
const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
writeFileSync(output+'.md', '# New-engine English owner replay\n\n' + result.scope + '\n\n' + JSON.stringify(summary) + `; retired rows: ${result.retired}. No legacy column.\n\n| Row | Classes | Tab | Retired | Verdict | Message | Reply |\n|---|---|---|---|---|---|---|\n` + rows.map(row => [row.id, row.classes.join(', '), row.tab, row.retired, row.verdict, row.text, row.reply].map(escape).join(' | ')).map(row => '| ' + row + ' |').join('\n') + '\n');
console.log(JSON.stringify({ summary, retired: result.retired, rows: rows.length }));
if(browser)await browser.close();
if (summary.wrong || summary['needs-review'] || rows.some(row => row.legacy !== false)) process.exitCode = 1;
