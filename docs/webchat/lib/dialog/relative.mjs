// SPDX-License-Identifier: AGPL-3.0-only
/**
 * RELATIVE CONTINUATIONS of a move, for every world with things to point at (spec 22 "Relative continuations"). Browser-safe: no `node:*` imports.
 *
 * Real turns continue a move without saying the verb or the thing again, or correct which thing was meant:
 *   "even higher", "move it even further to the left", "a bit lower", "further to the right"     the same move again (or the direction they name) on the thing just moved;
 *   "not the first house, the one in the middle", "no, the last one"                              the last move taken back and done on the thing they pick.
 * Which roles the turn gives is decided by the vendored library (sopworld `resolveEllipsis`, relative continuations since 0.116): the turn's words are read against a
 * small World of the scene (each thing of the moved thing's world, typed by its kind, with its `x`), the English direction lexicon (`lex.acts.dir`), the negation and the
 * ordinals of the language; the library returns the act's roles with what changed (the direction, the thing by its position: first, middle, last, an ordinal) and
 * `relative.more`. The host realises that as the world's own request ("move the red house to the left"), which the world must read completely and could carry out
 * (the dry run), else nothing happens here. A correction (a clause with a negation dropped) takes the last move back first, one step for the user.
 *
 * The turn must have no verb of its own other than the verb of the move it continues (structural, like continuation.mjs: what is left outside the closed classes,
 * the directions, the positions and the scene's nouns), so a request of its own ("move the tree to the left") is never taken here.
 */
import { budget } from './budget.mjs?v=00bce6e369';
import { GRAMMAR } from './continuation.mjs?v=427484a0f2';
import { describeReferent } from './meta.mjs?v=aa6dfcad14';

const tokens = (t) => String(t ?? '').toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
const MORE = ['more', 'further', 'even', 'again', 'still'], SMALL = ['bit', 'little', 'slightly', 'a'];
const NEG = ['not', 'no'];
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'thing';

/** The direction items of the language in the text, in order (longest first at each position): ["left", "lower"]. */
function directionsIn(ws, dirs) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    budget.tick('relative.dirs');
    const d = dirs.find((x) => x.every((w, k) => ws[i + k] === w));
    if (d) { out.push(d.join(' ')); i += d.length - 1; }
  }
  return out;
}
/** A direction item said as the world reads it in a request. */
const dirPhrase = (d) => (/^(?:left|right)$/.test(d) ? `to the ${d}` : /^(?:front|back)$/.test(d) ? `to the ${d}` : d);

/**
 * The relative continuation of `text` after the last move, or null. `dialog` is the Dialogue (session.dialogue); returns `{ pre }` like `Dialogue.complete`.
 */
export async function relativeTurn(dialog, text, sid) {
  const s = dialog.s, d = dialog.disc, lang = dialog.lang, lib = s.engine.sopworld;
  if (!lib?.resolveEllipsis || !lib.World) return null;
  const act = d._recentAction(3);
  if (!act || act.readOnly) return null;
  const world = act.worlds.find((w) => typeof s.engine.set.get(w)?.ops?.referents === 'function');
  if (!world) return null;
  const frameText = act.frames?.[0]?.text ?? act.text ?? '';
  const dirs = [...new Set(lang.lexicon('lex.acts.dir'))].map((x) => x.split(' ')).sort((a, b) => b.length - a.length);
  const fw = tokens(frameText), ws = tokens(text);
  if (!ws.length || ws.length > 12) return null;
  const prevDirs = directionsIn(fw, dirs);
  if (!prevDirs.length) return null;   // only a move is continued here (a change of colour or size has its own degree fragments)
  const refs = d._refs(world), before = act.before?.[world] !== undefined ? d._refs(world, act.before[world]) : [];
  const changed = refs.filter((r) => { const b = before.find((x) => x.id === r.id); return b && b.sig !== r.sig; });
  const moved = changed.length ? changed : refs.filter((r) => r.salient);   // a move that could not go further (at the edge) changed nothing: the thing it was about is the salient one
  if (!moved.length) return null;
  const verb = tokens(frameText)[0];
  // the structural test: no word of its own but the verb of the move
  const nouns = new Set(refs.flatMap((r) => [r.noun, ...(r.words ?? [])].flatMap((w) => tokens(w))));
  const known = (w) => GRAMMAR.has(w) || MORE.includes(w) || SMALL.includes(w) || NEG.includes(w) || dirs.some((x) => x.includes(w)) || lang.ordinal(w) != null || /^(?:middle|centre|center|one|ones|then|instead|way|step)$/.test(w)
    || nouns.has(w) || nouns.has(w.replace(/e?s$/, '')) || lang.colour([w]) != null;
  const own = ws.filter((w) => !known(w));
  if (own.length > 1 || (own.length === 1 && !(own[0] === verb && ws[0] === verb))) return null;
  if (own.length && ws.slice(1).some((w) => nouns.has(w) || nouns.has(w.replace(/e?s$/, '')))) return null;   // "move the tree to the left": a request of its own
  // the scene as a library World: each thing typed by its kind, with its x; the language's directions, negations and ordinals
  const q = lib.quote, ids = new Map();
  const lines = [`@rel.dir w.lang.en.lex name=acts.dir ${dirs.map((x) => `item=${q(x.join(' '))}`).join(' ')}`, ...NEG.map((n) => `@rel.neg.${n} w.lang.en.neg text=${q(n)}`)];
  for (let n = 1; n <= 10; n++) { const o = lang.ordinalWord(n); if (o) lines.push(`@rel.ord.${n} w.lang.en.ordinal text=${q(o)} value=${n}`); }
  for (const r of refs) {
    budget.tick('relative.scene');
    const id = `t_${slug(r.id)}`;
    ids.set(id, r);
    lines.push(`@${id} scene.${slug(r.kind)} x=${Math.round(Number(r.attrs?.x ?? 0))}`);
  }
  let res = null;
  try {
    const w = new lib.World({});
    const ld = w.load(lines.join('\n'));
    if (ld && ld.ok === false) return null;
    const prevId = [...ids].find(([, r]) => r.id === moved[0].id)?.[0];
    res = lib.resolveEllipsis(w, text, { act: 'move', args: { thing: prevId, dir: prevDirs.join(' and ') } }, { more: MORE, small: SMALL.filter((x) => x !== 'a') });
  } catch { return null; }
  if (!res) return null;
  const clauses = String(text).toLowerCase().split(/[,;]+/).map(tokens).filter((c) => c.length);
  const correction = clauses.length > 1 && clauses.some((c) => c.some((t) => NEG.includes(t))) && clauses.some((c) => !c.some((t) => NEG.includes(t)));
  const picked = res.changed.includes('thing') ? ids.get(res.args.thing) : null;
  if (correction && !picked) return null;   // "not that, ..." without a thing picked: not a correction of the referent
  if (!picked && ws.some((w) => nouns.has(w) || nouns.has(w.replace(/e?s$/, '')))) return null;   // "sun up a bit": a thing named by its noun is the world's own reading (the scene World has kinds, not names)
  // the thing picked is said in the USER's words with the kind's noun ("the one in the middle" -> "the house in the middle"): the world resolves a position by its own
  // order (reading order, rows), which the library's order by x may not be; the library decided THAT a thing is picked and that the clause is the one meant
  const ownNP = () => {
    const raw = String(text).split(/[,;]+/).map((c) => c.trim()).filter((c) => c && !tokens(c).some((t) => NEG.includes(t))).at(-1) ?? '';
    let np = tokens(raw).filter((t, i, a) => !(i === 0 && /^(?:but|and|then|so)$/.test(t)) && !(i === a.length - 1 && /^(?:instead|then|please)$/.test(t))).join(' ');
    if (!np || directionsIn(tokens(np), dirs).length) return null;
    if (!tokens(np).some((t) => nouns.has(t) || nouns.has(t.replace(/e?s$/, '')))) np = /\bones?\b/.test(np) ? np.replace(/\bone\b/, picked.noun).replace(/\bones\b/, `${picked.noun}s`) : `${np} ${picked.noun}`;
    return /^(?:the|a|an)\b/.test(np) ? np : `the ${np}`;
  };
  const thing = picked ? (ownNP() ?? describeReferent(picked, refs, lang)) : moved.length === 1 ? describeReferent(moved[0], refs, lang) : `the ${moved[0].noun}s`;
  const dir = String(res.args.dir ?? '').split(' and ').map((x) => dirPhrase(x.trim())).join(' and ');
  if (!dir) return null;
  const sentence = `${verb} ${thing} ${dir}`;
  const hit = await d._try(world, sentence, d._opts(sid));
  if (!hit) return null;
  const seg = hit.res.segments[0];
  let ok = seg.match.patternId !== 'unknown' && !seg.ignored?.length && !Object.values(seg.match.slots ?? {}).some((sl) => sl.class === 'rest');
  if (ok && !correction) { try { ok = s._dryStatuses(hit.res.segments).every((x) => x === 'supported'); } catch { ok = true; } }
  if (!ok) { s.isession.form.restore(hit.snap); return null; }
  if (correction) d.undoAction(act);   // the move on the wrong thing is taken back; the new one is the same step for the user
  dialog.note = [{ role: 'thing', value: thing, source: picked ? 'position' : 'focus' }, { role: 'action', value: verb, source: 'focus' }];
  const info = { kind: correction ? 'repair' : 'continuation', how: 'relative', dialogue: correction ? 'correction' : 'continuation', of: frameText, fragment: text, rewritten: sentence, world, frameTurn: act.turn, relative: res.relative ?? null, changed: res.changed, via: 'sopworld.resolveEllipsis' };
  dialog._kind = info.dialogue;
  return { pre: d._finish(hit, info) };
}
