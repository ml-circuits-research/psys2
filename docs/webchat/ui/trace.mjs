// Trace panel: the visible proof that no LLM is involved. One <details> block per answer.
import { h } from './util.mjs';

const json = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

function section(title, ...body) {
  return h('section', { class: 'p2-trace-sec' }, h('h4', {}, title), ...body);
}
function kv(rows) {
  return h('dl', { class: 'p2-kv' }, rows.filter(([, v]) => v !== undefined && v !== null && v !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}
const code = (text) => h('pre', { class: 'p2-code' }, h('code', {}, text));

/**
 * @param reply  the session.send() result
 * @param extra  { translation: usage[], effects: [{name,args,ok,detail}], serializeWires(wires) -> string, formalizer }
 */
export function renderTrace(reply, extra = {}) {
  const t = reply.trace ?? {};
  const root = h('div', { class: 'p2-trace' });

  const tr = reply.translation;
  const usage = extra.translation ?? [];
  root.append(section('Language and translation', kv([
    ['Language', reply.lang ?? t.language ?? 'en'],
    ['Original', t.original],
    ['English', t.english !== t.original ? t.english : undefined],
    ['Reply in English', t.replyEnglish && t.replyEnglish !== reply.text ? t.replyEnglish : undefined],
    ['Strategy', usage.length ? usage.map((u) => `${u.direction}: ${u.strategy}${u.fallback ? ` (fell back to rules: ${u.reason})` : ''}`).join('; ') : (reply.lang && reply.lang !== 'en' ? 'rules' : 'none (English input)')],
    ['Confidence', tr?.confidence != null ? String(tr.confidence) : undefined],
    ['Unknown words', tr?.unknown?.length ? tr.unknown.map((u) => u.word).join(', ') : undefined],
    ['Notes', tr?.notes?.length ? tr.notes.join('; ') : undefined],
  ])));

  const segs = t.segments ?? [];
  root.append(section('Segments, router and patterns', segs.length ? h('ol', { class: 'p2-segs' }, segs.map((s, i) => h('li', {},
    h('div', {}, h('q', {}, s.text), s.unparsed ? h('span', { class: 'p2-tag is-warn' }, 'not understood') : null, s.isQuestion ? h('span', { class: 'p2-tag' }, 'question') : null),
    kv([
      ['Router scores', (s.worlds ?? []).map((w) => `${w.id} ${w.score}`).join(', ') || undefined],
      ['Matched pattern', s.match?.patternId],
      ['Slots', s.match?.slots ? Object.entries(s.match.slots).map(([k, v]) => `${k}=${v.text ?? v.value ?? ''}`).join(', ') : undefined],
      ['Formalizer', s.formalizer ?? extra.formalizer ?? 'rules'],
      ['Alternatives', s.alternatives?.length ? s.alternatives.map((a) => a.worldId).join(', ') : undefined],
      ['Wires', s.wires?.join(', ') || undefined],
      ['Errors', s.errors?.length ? json(s.errors) : undefined],
    ])))) : h('p', { class: 'p2-muted' }, 'No segments.')));


  const d = t.dispatch;
  if (d) {
    const pct = (x) => `${Math.round(x * 100)}%`;
    const clip = (x, n = 60) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
    root.append(section('Dispatcher (encoder)', h('p', {}, h('span', { class: `p2-tag ${d.status === 'understood' ? 'is-supported' : 'is-warn'}` }, d.status === 'understood' ? 'validated' : 'not understood'),
      ` model ${d.modelMs} ms, with validation ${d.totalMs} ms; context: tab ${d.context?.tab ?? 'none'}, recent ${(d.context?.recent_worlds ?? []).join(', ') || 'none'}`),
    h('p', { class: 'p2-why' }, h('strong', {}, 'Why: '), d.why),
    h('ol', { class: 'p2-segs' }, (d.segmentations ?? []).map((g) => h('li', { class: g.index === d.winnerIndex ? 'is-winner' : '' },
      h('div', {}, `Segmentation ${g.index + 1}`, g.index === d.winnerIndex ? h('span', { class: 'p2-tag is-supported' }, 'winner') : null, g.valid ? null : h('span', { class: 'p2-tag is-warn' }, `${g.nInvalid} piece(s) not read`),
        ` dispatcher log-prob ${g.dispatcherScore.toFixed(2)}, total ${g.score.toFixed(2)}`),
      h('ul', { class: 'p2-list' }, g.pieces.map((p) => h('li', {}, h('q', {}, clip(p.text)), ' ',
        p.simplified ? h('span', { class: 'p2-muted' }, 'rephrased: ', h('q', {}, clip(p.simplified)), p.chosen?.variant === 'simplified' ? h('span', { class: 'p2-tag is-supported' }, 'used') : ' (not used)', ' ') : null,
        p.valid && p.chosen ? h('span', { class: 'p2-ok' }, `→ ${p.chosen.world}${p.chosen.rank > 1 ? ` (candidate ${p.chosen.rank})` : ''}`) : h('span', { class: 'p2-bad' }, 'not validated'),
        h('div', { class: 'p2-muted' }, p.attempts.filter((a) => a.variant === 'original' || a.variant === 'simplified').map((a) => `${a.variant === 'simplified' ? 'rephrased ' : ''}${a.world} ${pct(a.worldScore)} ${a.valid ? (a.refused ? 'accepted (refused by state)' : 'validated') : `rejected: ${a.reason}`}`).join(' | '))))))))));
  }

  let sop = '';
  try { sop = extra.serializeWires ? extra.serializeWires(reply.wires ?? []) : ''; } catch (e) { sop = `(could not serialize wires: ${e.message})`; }
  root.append(section('Wires (SOP Lang)', sop ? code(sop.trim()) : h('p', { class: 'p2-muted' }, 'No wires.')));

  const ops = t.operations ?? [];
  root.append(section('Operations', ops.length ? h('table', { class: 'p2-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Operation'), h('th', {}, 'Status'), h('th', {}, 'ms'), h('th', {}, 'Arguments'))),
    h('tbody', {}, ops.map((o) => h('tr', {}, h('td', {}, o.op), h('td', {}, o.status), h('td', {}, o.ms != null ? String(Math.round(o.ms * 10) / 10) : ''), h('td', {}, o.args ? json(o.args) : ''))))) : h('p', { class: 'p2-muted' }, 'No operations called.')));

  root.append(section('Statuses', (reply.statuses ?? t.statuses ?? []).length
    ? h('p', {}, (reply.statuses ?? t.statuses).map((s) => h('span', { class: `p2-tag is-${s}` }, s))) : h('p', { class: 'p2-muted' }, 'None.')));

  const fx = extra.effects ?? [];
  const changed = reply.state ? Object.keys(reply.state) : [];
  root.append(section('Effects and state', fx.length ? h('ul', { class: 'p2-list' }, fx.map((e) => h('li', {}, h('code', {}, e.name), ' ', json(e.args), ' → ', h('span', { class: e.ok ? 'p2-ok' : 'p2-bad' }, e.ok ? 'done' : 'ignored'), e.detail ? ` (${e.detail})` : ''))) : h('p', { class: 'p2-muted' }, 'No effects.'),
    changed.length ? h('p', {}, 'World state changed: ', changed.join(', ')) : null));
  return root;
}
