#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE LEARNING CURVE (worker-tasks 2026-11-14 06:30): does adding general mechanisms keep generalising, or are we fitting cases?
 * Two curves over landings, history in training/eval/learning-curve.jsonl (append-only, one point per landing):
 *
 *   1. held-out real messages: share right of the FROZEN set (training/eval/heldout-real/, scripts/freeze-heldout.mjs), judged by hand. Never used to write a rule.
 *   2. unseen formulations: (a) the meaning-kept paraphrases (paraphrases-rt, meaning: same, re-judged 2026-11-14; training/eval/indicators.json robustness) and
 *                           (b) the "new world from a schema alone" score (seating60, judged by hand; indicators.json).
 *
 * x = the landing (date, build) with the count of GENERAL MECHANISMS then in the repository: schema worlds (worlds/<w>/schema.sop) + acts + verb groups of worlds/acts. This is a proxy that can be
 * computed at any commit; it counts what the library gives a world for free, not hand-written language lines. The components are stored in the point, so a better count can replace it later.
 * Slope at each landing = change of the share (percentage points) divided by the mechanisms added since the previous point that HAD that measure; "gap" when a measure did not exist then.
 * Reading: curves that rise with each general addition = the symbolic approach generalises. Curves that stay flat while the per-case sets rise = fitting cases; the learned fallback must take more load.
 *
 *   node scripts/learning-curve.mjs [--record ["note"]]    (no flag: print the history with slopes; --record appends a point for this build from the current files)
 */
import { readFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summary as heldoutSummary } from './freeze-heldout.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = join(REPO, 'training/eval/learning-curve.jsonl');
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const history = () => jsonl(FILE);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The general mechanisms now in the repository (the x of the curve). */
export async function mechanisms() {
  const schemaWorlds = readdirSync(join(REPO, 'worlds')).filter((d) => existsSync(join(REPO, 'worlds', d, 'schema.sop'))).length;
  let acts = 0, verbGroups = 0;
  try { const A = await import(pathToFileURL(join(REPO, 'worlds/acts/acts.mjs')).href); acts = Object.keys(A.ACTS).length; verbGroups = Object.keys(A.ACT_VERBS ?? {}).length; } catch { /* no acts module */ }
  return { schemaWorlds, acts, verbGroups, total: schemaWorlds + acts + verbGroups };
}

/** The share of every curve for a point: { key: { right, total } | null }. */
export const SERIES = [
  { key: 'heldout', label: 'Held-out real messages (frozen, judged)', color: 'var(--k-fill)' },
  { key: 'paraphrasesSame', label: 'Paraphrases, meaning kept', color: 'var(--k-ask)' },
  { key: 'seating60', label: 'New world from a schema alone', color: 'var(--k-view)' },
];
const share = (m) => (m && m.total ? m.right / m.total : null);

/** The current point from the current files (indicators.json, the frozen set). */
export async function currentPoint(note = '') {
  const ind = JSON.parse(readFileSync(join(REPO, 'training/eval/indicators.json'), 'utf8'));
  const h = heldoutSummary();
  const build = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const same = ind.robustness?.paraphrasesDate ? ind.robustness['paraphrases-rt'] : null;   // only after the re-judging (meaning kept) does the set mean "paraphrases"
  return { date: new Date().toISOString().slice(0, 10), build, mechanisms: await mechanisms(),
    heldout: h.judged ? { right: h.right, total: h.judged, frozen: h.total } : null,
    paraphrasesSame: same ? { right: same.right, total: same.total } : null,
    seating60: ind.seating60 ? { right: ind.seating60.right, total: ind.seating60.total } : null, note };
}

/** Slope of each series at each point: percentage points per added mechanism since the previous point that had the measure (null = first point or a gap). */
export function slopes(pts = history()) {
  return pts.map((p, i) => {
    const out = {};
    for (const s of SERIES) {
      const now = share(p[s.key]);
      let prev = null;
      for (let j = i - 1; j >= 0 && prev == null; j--) if (share(pts[j][s.key]) != null) prev = pts[j];
      if (now == null) out[s.key] = { state: 'gap' };
      else if (!prev) out[s.key] = { state: 'first' };
      else {
        const dm = p.mechanisms.total - prev.mechanisms.total, dpp = Math.round((now - share(prev[s.key])) * 1000) / 10;
        out[s.key] = { state: 'slope', dPP: dpp, dMech: dm, perMech: dm ? Math.round((dpp / dm) * 100) / 100 : null };
      }
    }
    return out;
  });
}

const pctText = (m) => (share(m) == null ? 'gap' : `${Math.round(share(m) * 1000) / 10}% (${m.right}/${m.total})`);
const slopeText = (x) => (x.state === 'gap' ? 'gap' : x.state === 'first' ? 'first point' : x.perMech == null ? `${x.dPP >= 0 ? '+' : ''}${x.dPP} pp, no mechanism added` : `${x.dPP >= 0 ? '+' : ''}${x.dPP} pp over +${x.dMech} mechanisms = ${x.perMech} pp each`);

/** Rows for the landing table: one per curve, with the latest value and the slope at the latest landing. */
export function tableRows(pts = history()) {
  if (!pts.length) return [];
  const sl = slopes(pts), last = pts.at(-1), lastS = sl.at(-1), m = last.mechanisms;
  return SERIES.map((s) => {
    const v = last[s.key];
    return { label: `Learning curve: ${s.label}`, value: v ? `${Math.round(share(v) * 1000) / 10}%` : 'gap',
      detail: `${v ? `${v.right} of ${v.total}` : s.key === 'heldout' ? `no judged messages yet (${heldoutSummary().total} frozen)` : 'not measured at this landing'}; at ${last.date} ${last.build} with ${m.total} general mechanisms (${m.schemaWorlds} schema worlds + ${m.acts} acts + ${m.verbGroups} verb groups); slope at this landing: ${slopeText(lastS[s.key])}; ${pts.length} landings in training/eval/learning-curve.jsonl` };
  });
}

/** Inline SVG of the two curves (x = landing, labelled date and mechanisms; y = share right); colours from the page's CSS variables, so light and dark both work. */
export function svg(pts = history()) {
  const W = 680, H = 300, L = 46, R = 16, T = 18, B = 72, pw = W - L - R, ph = H - T - B;
  const n = pts.length, X = (i) => L + (n <= 1 ? pw / 2 : (pw * i) / (n - 1)), Y = (f) => T + ph * (1 - f);
  const g = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) g.push(`<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--mut)">${t * 100}%</text>`);
  pts.forEach((p, i) => g.push(`<text x="${X(i)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="var(--fg)">${esc(p.date.slice(5))}</text><text x="${X(i)}" y="${H - B + 30}" text-anchor="middle" font-size="11" fill="var(--mut)">${p.mechanisms.total} mech.</text>`));
  for (const s of SERIES) {
    let d = '', pen = false;
    pts.forEach((p, i) => { const f = share(p[s.key]); if (f == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(f).toFixed(1)} `; pen = true; });
    if (d) g.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`);
    pts.forEach((p, i) => { const f = share(p[s.key]); if (f != null) g.push(`<circle cx="${X(i)}" cy="${Y(f)}" r="4" fill="${s.color}"><title>${esc(s.label)} ${p.date} ${p.build}: ${esc(pctText(p[s.key]))}</title></circle>`); });
  }
  SERIES.forEach((s, k) => g.push(`<rect x="${L + k * 205}" y="${H - 26}" width="10" height="10" fill="${s.color}"/><text x="${L + k * 205 + 15}" y="${H - 17}" font-size="11" fill="var(--fg)">${esc(s.label)}${pts.some((p) => p[s.key]) ? '' : ' (no data yet)'}</text>`));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Learning curve: share right over landings, x = landing date and number of general mechanisms" style="max-width:100%;height:auto;font-family:inherit">${g.join('')}</svg>`;
}

/** The section for docs/system-map.html (called by landing-table's toHtml). */
export function html(pts = history()) {
  if (!pts.length) return '';
  const sl = slopes(pts);
  const rowsHtml = pts.map((p, i) => `<tr><td>${esc(p.date)} <code>${esc(p.build)}</code></td><td class="num">${p.mechanisms.total}</td>${SERIES.map((s) => `<td style="white-space:normal">${esc(pctText(p[s.key]))}<br><small>${esc(slopeText(sl[i][s.key]))}</small></td>`).join('')}</tr>`).join('\n');
  return `<h3>Learning curve</h3>
<p>Does each general mechanism keep generalising? x = landing, labelled with the count of general mechanisms (schema worlds + acts + verb groups); y = share right. Curves that rise with the additions: the symbolic approach generalises. Flat curves while the per-case sets rise: we are fitting cases, and the learned fallback must take more load. History: <code>training/eval/learning-curve.jsonl</code> (<code>scripts/learning-curve.mjs</code>); the held-out messages are frozen at arrival (<code>scripts/freeze-heldout.mjs</code>) and never used to write a rule.</p>
${svg(pts)}
<div class="scroll"><table><thead><tr><th>landing</th><th class="num">mechanisms</th>${SERIES.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>
${rowsHtml}</tbody></table></div>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--record')) {
    const note = argv[argv.indexOf('--record') + 1]?.startsWith('--') ? '' : (argv[argv.indexOf('--record') + 1] ?? '');
    const p = await currentPoint(note), last = history().at(-1);
    const same = last && last.build === p.build && JSON.stringify({ ...last, note: '' }) === JSON.stringify({ ...p, note: '' });
    if (same) console.log('no change since the last point; nothing appended');
    else { appendFileSync(FILE, `${JSON.stringify(p)}\n`); console.log('appended', JSON.stringify(p)); }
  }
  const pts = history(), sl = slopes(pts);
  pts.forEach((p, i) => console.log(`${p.date} ${p.build} mech=${p.mechanisms.total}${p.backfilled ? ' (backfilled)' : ''}\n${SERIES.map((s) => `   ${s.label}: ${pctText(p[s.key])}; slope: ${slopeText(sl[i][s.key])}`).join('\n')}`));
  process.exit(0);
}
