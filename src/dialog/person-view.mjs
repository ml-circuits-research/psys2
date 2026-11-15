// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The view of the person of the session (src/dialog/person.mjs, spec 23 "The person of the session"): what a host shows in Settings › Privacy and a test or a real-set expectation
 * reads, computed from the state of session.things (`person`: the user's own keys and the told w.person lines). No imports: the page's main thread reads it without the engine.
 *
 *   personView(state) -> { name, age, occupation, language: [], relatives: [{ relation, count }], likes: [{ thing, type? }], dislikes: [...] }   (state: the session's world states, a session.things state or its `person`)
 */
const HOME = 'session.things';

/** The view of the person a host shows (Settings › Privacy) and a test reads: from the told lines, no library needed. */
export function personView(state) {
  const p = state?.[HOME]?.person ?? state?.person ?? state;
  const me = p?.me ?? {};
  // the user's name has its home in kids.common (its reader of introductions); the interview keeps it there too
  const out = { name: state?.['kids.common']?.userName ?? me.name ?? null, age: me.age ?? null, occupation: me.occupation ?? null, language: [...(me.language ?? [])], relatives: [], likes: [], dislikes: [] };
  for (const line of p?.lines ?? []) {
    const attrs = {};
    for (const m of line.matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g)) (attrs[m[1]] ??= []).push(m[2].startsWith('"') ? JSON.parse(m[2]) : m[2]);
    const type = line.split(/\s+/)[1];
    if (type === 'w.person.person') { if (attrs.name) out.name = attrs.name[0]; if (attrs.age) out.age = Number(attrs.age[0]); if (attrs.occupation) out.occupation = attrs.occupation[0]; for (const l of attrs.language ?? []) if (!out.language.includes(l)) out.language.push(l); }
    else if (type === 'w.person.relative') { const r = out.relatives.find((x) => x.relation === attrs.relation[0]); if (r) r.count = Number(attrs.count?.[0] ?? 1); else out.relatives.push({ relation: attrs.relation[0], count: Number(attrs.count?.[0] ?? 1) }); }
    else if (type === 'w.person.taste') {
      const t = { thing: attrs.thing[0], ...(attrs.type ? { type: attrs.type[0] } : {}) }, mine = attrs.stance?.[0] === 'dislikes' ? out.dislikes : out.likes, other = mine === out.likes ? out.dislikes : out.likes;
      const at = other.findIndex((x) => x.thing === t.thing); if (at >= 0) other.splice(at, 1);
      if (!mine.some((x) => x.thing === t.thing)) mine.push(t);
    }
  }
  Object.defineProperty(out, 'said', { value: p?.said ?? {}, enumerable: false });   // the user's words for the things (replies only; not part of the view)
  return out;
}
