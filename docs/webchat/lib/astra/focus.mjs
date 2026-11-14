/**
 * ASTRA focus stack and entity registry (spec 13 section 5). Browser-safe, pure.
 *
 * Both live inside the discussion record (`d.focus`, `d.entities`), so switching discussion restores that discussion's focus.
 */
import { en } from '../lang/en.mjs?v=3d429f211d';
const plain = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const PRONOUNS = new Set([...en.words('pron', 'astra'), ...en.words('anaphor', 'astra')]);
const ORDINALS = en.ordinals('acts');
const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'one', 'ones', 'of', 'to']);

export class Focus {
  constructor(d) { this.d = d; d.focus ??= { stack: [] }; d.focus.stack ??= []; }
  get stack() { return this.d.focus.stack; }
  top() { return this.stack[0]?.entity ?? null; }
  touch(entity, turn = null) {
    this.d.focus.stack = [{ entity, turn }, ...this.stack.filter((x) => x.entity !== entity)].slice(0, 8);
    return entity;
  }
  /** The entity before the top one (satisfying `ok`), for "the other one". */
  previous(ok = () => true) { return this.stack.slice(1).map((x) => x.entity).find(ok) ?? null; }
}

export class Entities {
  constructor(d) { this.d = d; d.entities ??= { items: [] }; d.entities.items ??= []; this.focus = new Focus(d); }
  get items() { return this.d.entities.items; }

  /** Register (or update) an entity: { id, instance, kind, noun, aliases, attrs }. Order of first registration is its ordinal. */
  register(e) {
    const i = this.items.findIndex((x) => x.id === e.id && x.instance === (e.instance ?? null));
    const rec = { id: e.id, instance: e.instance ?? null, kind: e.kind ?? null, noun: e.noun ?? e.kind ?? null, aliases: [...(e.aliases ?? [])], attrs: { ...(e.attrs ?? {}) } };
    if (i >= 0) this.items[i] = rec; else this.items.push(rec);
    return rec;
  }

  /** Register the referents a world lists through its `referents(ctx)` hook (`[{ id, kind, noun, words, attrs, salient }]`). */
  ingest(instance, referents = []) {
    const keep = new Set(referents.map((r) => String(r.id)));
    this.d.entities.items = this.items.filter((x) => x.instance !== instance || keep.has(String(x.id)));
    for (const r of referents) {
      this.register({ id: String(r.id), instance, kind: r.kind, noun: r.noun, aliases: r.words ?? [], attrs: r.attrs ?? {} });
      if (r.salient) this.focus.touch(String(r.id));
    }
  }

  byId(id) { return this.items.find((x) => x.id === id) ?? null; }

  /**
   * Resolve a phrase against the discussion's entities. `{ status: 'one' | 'ambiguous' | 'none', candidates, how }`.
   * `kinds` restricts the entity kinds; `instance` restricts to one instance.
   */
  resolve(phrase, { kinds = null, instance = null } = {}) {
    const t = plain(phrase);
    const pool = this.items.filter((x) => (!kinds || kinds.includes(x.kind)) && (!instance || x.instance === instance));
    const done = (candidates, how) => ({ status: candidates.length === 1 ? 'one' : candidates.length ? 'ambiguous' : 'none', candidates, how });
    if (!t) return done([], 'empty');
    if (PRONOUNS.has(t)) { const top = pool.find((x) => x.id === this.focus.top()); return top ? done([top], 'focus') : done(pool.length === 1 ? pool : [], 'focus'); }
    if (/^(?:the )?other(?: one)?$/.test(t)) {
      const top = this.byId(this.focus.top());
      const prev = this.focus.previous((id) => pool.some((x) => x.id === id && (!top || x.kind === top.kind)));
      if (prev) return done([pool.find((x) => x.id === prev)], 'other');
      const rest = pool.filter((x) => x.id !== top?.id && (!top || x.kind === top.kind));
      return done(rest, 'other');
    }
    const words = t.split(' ').filter((w) => !STOP.has(w));
    const ord = words.find((w) => ORDINALS[w]);
    const rest = words.filter((w) => w !== ord);
    let cands = pool.filter((x) => rest.every((w) => this._matches(x, w)));
    if (ord && cands.length) {
      const n = ORDINALS[ord];
      const pick = n === -1 ? cands.at(-1) : cands[n - 1];
      return done(pick ? [pick] : [], 'ordinal');
    }
    if (!rest.length && !ord) return done([], 'none');
    // several matches: the salient one (top of focus) wins only when it is among them and the phrase named no attribute beyond the noun
    return done(cands, rest.length ? 'attributes' : 'none');
  }

  _matches(x, w) {
    const w1 = w.replace(/s$/, '');
    if ([x.noun, x.kind, x.id].some((v) => v && (plain(v) === w || plain(v) === w1))) return true;
    if (x.aliases.some((a) => plain(a) === w || plain(a) === w1)) return true;
    return Object.values(x.attrs).some((v) => v != null && plain(v) === w);
  }

  /** The one short question for an ambiguous reference: "Which one: the red house or the blue house?" */
  askWhich(candidates) {
    const name = (c) => `the ${[c.attrs?.color ?? c.attrs?.colour, c.attrs?.size, c.noun ?? c.kind].filter(Boolean).join(' ')}`;
    const names = candidates.map(name);
    if (!names.length) return null;
    if (names.length === 1) return `Do you mean ${names[0]}?`;
    return `Which one: ${names.slice(0, -1).join(', ')} or ${names.at(-1)}?`;
  }
}
