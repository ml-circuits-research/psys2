#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Wrong-world analysis of a webchat history export (SETTINGS-COHERENT item 7; spec 06 "Phrase log").
//
//   node scripts/analyze-phrase-log.mjs <export.json | export.jsonl>... [--markdown] [--all]
//
// Input: the Settings > Phrase log "Export JSON" file (format psys2-phrase-log/2, { records: [...] }), a JSONL file of such records, or the reviewer's
// owner-log JSONL (training/eval/owner-log-*.jsonl: { tab, text, got: { status, readings } }). Several files are merged.
// Output: a table of the messages that (a) went to a world other than the world of the open tab, or (b) were not understood, grouped by
// "<open tab> -> <chosen world>" and pattern, with the message texts. `--all` also lists the messages that went to the tab's own world.
// `--timeline` (export format 3): every user action and turn in order (tab, message, reading, what changed, replies with worlds, reaction), flagging messages read in another tab's world.
// Messages answered by ui.shell / ui.help / session worlds are not wrong-world cases (they are available in every tab); `--all` keeps them.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Tab id -> the world of that tab (docs/webchat/ui/tabs/*.mjs and TABS in app.mjs); a record that carries `routing.activeWorld` wins. */
export const TAB_WORLDS = Object.freeze({
  robot: 'ui.avatar', editor: 'docs.editor', tictactoe: 'games.tictactoe', guess: 'games.guess', hangman: 'games.hangman',
  chess: 'games.chess', draw: 'art.draw', diagram: 'diagram.sketch', charts: 'data.charts', music: 'media.music', map: 'geo.map',
});
/** Worlds that answer in every tab: not a wrong world. */
export const EVERYWHERE = new Set(['ui.shell', 'ui.help', 'core', 'lang.common', 'common.sense', 'session.conversation', 'kids.common', 'user.profile']);
const NOT_UNDERSTOOD = new Set(['unparsed', 'unsupported', 'missing', 'refused', 'ignored', 'stopped', 'timeout']);

const clean = (w) => (w && w !== 'null' && w !== 'undefined' ? String(w) : null);

/** One uniform row from any of the accepted record shapes. */
export function normalizeRecord(r) {
  const routing = r?.routing ?? null;
  const pieces = routing?.pieces?.length ? routing.pieces
    : r?.got?.readings ? r.got.readings.map((x) => ({ text: x.text ?? null, chosen: x.world ?? null, pattern: x.pattern ?? null, candidates: x.candidates ?? [] }))
      : (r?.detail?.readings ?? r?.segments ?? []).map((x) => ({ text: x.text ?? null, chosen: x.world ?? x.match?.worldId ?? null, pattern: x.pattern ?? x.match?.patternId ?? null, candidates: x.candidates ?? [] }));
  const tab = r?.tab ?? routing?.activeTab ?? null;
  return {
    time: r?.time ?? null, text: String(r?.text ?? ''), lang: r?.lang ?? null, tab,
    tabWorld: clean(routing?.activeWorld) ?? clean(r?.tabWorld) ?? TAB_WORLDS[tab] ?? null,
    status: r?.got?.status ?? r?.status ?? (r?.outcome ?? 'unknown'),
    cls: r?.class ?? null, expected: r?.expected ?? null,
    pieces: pieces.map((p) => ({ ...p, chosen: clean(p.chosen), pattern: clean(p.pattern) })),
  };
}

/** Parse a file: one JSON document ({ records } or an array) or JSON lines. */
export function parseExport(text, { events = false } = {}) {
  const t = String(text).trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (events) return Array.isArray(j?.events) ? j.events : [];   // format 3 only; older exports have no events
    if (Array.isArray(j)) return j;
    if (Array.isArray(j?.records)) return j.records;
    if (j && typeof j === 'object') return [j];
  } catch { /* JSON lines */ }
  if (events) return [];
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Classify one normalized row: { kind: 'wrong-world' | 'not-understood' | 'ok' | 'shared', chosen, pattern }. */
export function classify(row) {
  const chosen = [...new Set(row.pieces.map((p) => p.chosen).filter(Boolean))];
  const foreign = chosen.filter((w) => !EVERYWHERE.has(w) && row.tabWorld && w !== row.tabWorld);
  if (foreign.length) {
    const piece = row.pieces.find((p) => p.chosen === foreign[0]);
    return { kind: 'wrong-world', chosen: foreign[0], pattern: piece?.pattern ?? null };
  }
  if (NOT_UNDERSTOOD.has(row.status) || (!chosen.length && row.status !== 'supported')) return { kind: 'not-understood', chosen: chosen[0] ?? 'none', pattern: row.pieces.find((p) => p.pattern)?.pattern ?? null };
  return { kind: chosen.length && chosen.every((w) => EVERYWHERE.has(w)) ? 'shared' : 'ok', chosen: chosen[0] ?? null, pattern: row.pieces[0]?.pattern ?? null };
}

/** Group the rows to report: key "<tab> -> <world>" + pattern. Returns [{ key, kind, tab, chosen, pattern, messages: [{ text, lang, status, ...}] }] sorted by size. */
export function analyze(records, { all = false } = {}) {
  const groups = new Map();
  let total = 0;
  for (const rec of records) {
    const row = normalizeRecord(rec);
    if (!row.text) continue;
    total++;
    const c = classify(row);
    if (!all && (c.kind === 'ok' || c.kind === 'shared')) continue;
    const key = `${row.tab ?? '?'} -> ${c.chosen ?? 'none'} | ${c.pattern ?? '-'} | ${c.kind}`;
    if (!groups.has(key)) groups.set(key, { key, kind: c.kind, tab: row.tab ?? '?', chosen: c.chosen ?? 'none', pattern: c.pattern ?? '-', messages: [] });
    groups.get(key).messages.push({ text: row.text, lang: row.lang, status: row.status, cls: row.cls, expected: row.expected, candidates: row.pieces.flatMap((p) => p.candidates ?? []).slice(0, 3) });
  }
  const list = [...groups.values()].sort((a, b) => b.messages.length - a.messages.length || a.key.localeCompare(b.key));
  return { total, groups: list, flagged: list.reduce((n, g) => n + g.messages.length, 0) };
}

/**
 * The timeline of an export (format 3): every user action and every turn in time order. A turn shows the tab on screen, the message, the reading (worlds),
 * what changed, the replies with their worlds, and the reaction; `otherTab` flags a message whose reading used another world than the tab on screen.
 */
export function timeline(records, events = []) {
  const items = [];
  for (const e of events) if (e.kind !== 'message') items.push({ type: 'event', time: e.time, e });   // a message is shown as its turn
  for (const r of records) {
    const row = normalizeRecord(r), c = classify(row);
    items.push({ type: 'turn', time: row.time ?? '', r, row, kind: c.kind, otherTab: c.kind === 'wrong-world' || (c.kind === 'not-understood' && false) });
  }
  return items.sort((a, b) => String(a.time).localeCompare(String(b.time)));
}
export function renderTimeline(items) {
  const out = [];
  for (const it of items) {
    const at = String(it.time).slice(11, 19);
    if (it.type === 'event') {
      const e = it.e;
      out.push(`${at}  [${e.kind}] ${e.target ?? ''}${e.value !== undefined ? ` = ${JSON.stringify(e.value)}` : ''}${e.via ? ` (via ${e.via})` : ''}${e.zone ? ` in ${e.zone}` : ''}${e.tab !== e.tabAfter && e.tabAfter ? `   tab ${e.tab} -> ${e.tabAfter}` : e.tab ? `   tab ${e.tab}` : ''}${e.kind === 'step' ? `   ${e.ms ?? '?'} ms${e.bytes ? `, ${e.bytes} B` : ''}${e.ok === false ? ' FAILED' : ''}` : ''}`);
      continue;
    }
    const { r, row } = it, h = r.happened ?? {};
    const worlds = [...new Set(row.pieces.map((p) => p.chosen).filter(Boolean))];
    out.push(`${at}  TURN on tab ${row.tab ?? '?'}${h.tabAfter && h.tabAfter !== row.tab ? ` -> ${h.tabAfter}` : ''}: "${row.text}"${it.otherTab ? `   <-- reading used ${worlds.filter((w) => !EVERYWHERE.has(w)).join(', ')}, not the tab's world ${row.tabWorld ?? '?'}` : ''}`);
    out.push(`          reading: ${worlds.join(', ') || 'none'} [${row.status}]${row.pieces[0]?.pattern ? ` ${row.pieces[0].pattern}` : ''}`);
    const ch = (h.changes ?? []).map((x) => `${x.world}: ${x.changes.join('; ')}`);
    out.push(`          changed: ${ch.length ? ch.join(' | ') : 'nothing'}${h.viewEffects?.length ? `   view: ${h.viewEffects.map((v) => v.kind + (v.to ? ` ${v.to}` : '')).join(', ')}` : ''}`);
    for (const s of h.shown ?? []) out.push(`          shown [${s.world ?? s.from ?? 'host'}]: ${String(s.text).replace(/\s+/g, ' ').slice(0, 160)}`);
    if (!h.shown?.length && r.detail?.answer) out.push(`          shown [${worlds.join(', ') || 'host'}]: ${String(r.detail.answer).slice(0, 160)}`);
    if (r.reaction) out.push(`          reaction: ${r.reaction.kind}${r.reaction.target ? ` "${r.reaction.target}"` : ''} after ${Math.round(r.reaction.afterMs / 1000)} s`);
  }
  return out.join('\n');
}

export function render(result, { markdown = false } = {}) {
  const out = [];
  out.push(`${result.flagged} of ${result.total} messages went to another world than the open tab's, or were not understood (${result.groups.length} groups).`);
  if (markdown) out.push('', '| open tab -> chosen world | pattern | kind | n | messages |', '| --- | --- | --- | ---: | --- |');
  for (const g of result.groups) {
    const texts = g.messages.map((m) => `"${m.text.replace(/\|/g, '/')}"${m.expected ? ` (meant: ${m.expected})` : ''}`);
    if (markdown) out.push(`| ${g.tab} -> ${g.chosen} | ${g.pattern} | ${g.kind} | ${g.messages.length} | ${texts.join('; ')} |`);
    else out.push('', `${g.tab} -> ${g.chosen}   pattern ${g.pattern}   [${g.kind}]   x${g.messages.length}`, ...texts.map((t) => `    ${t}`));
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) { console.error('usage: node scripts/analyze-phrase-log.mjs <export.json|export.jsonl>... [--markdown] [--all] [--timeline]'); process.exit(2); }
  const records = files.flatMap((f) => parseExport(readFileSync(f, 'utf8')));
  if (args.includes('--timeline')) {
    const events = files.flatMap((f) => parseExport(readFileSync(f, 'utf8'), { events: true }));
    console.log(renderTimeline(timeline(records, events)));
    const flagged = timeline(records, events).filter((i) => i.otherTab).length;
    console.log(`\n${flagged} message${flagged === 1 ? '' : 's'} read in another tab's world than the one on screen.`);
    process.exit(0);
  }
  console.log(render(analyze(records, { all: args.includes('--all') }), { markdown: args.includes('--markdown') }));
}
