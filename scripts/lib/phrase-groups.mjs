/**
 * Shared helpers of the phrase-macro tools (L3 `build-lang-common.mjs`, L4 `migrate-macros.mjs`): reading the raw patterns of a
 * world, splitting a match string into elements, finding the optional lead-in and suffix groups and classifying their
 * alternatives. Node (reads files); the engine itself never imports this.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isOldFiller } from '../../src/formalizer/rules/normalize.mjs';
import { parse, get } from '../../src/soplang/index.mjs';

/** Groups with fewer alternatives are never turned into macros (`[the]?`, `[me]?`). */
export const MIN_GROUP = 3;

/** Group syntax of one match element: `[a|b|c]` or `[a|b|c]?`, null for anything else. */
export function parseGroup(part) {
  const m = part.match(/^\[([^\[\]]*)\](\?)?$/);
  return m ? { alts: m[1].split('|'), optional: !!m[2] } : null;
}

/**
 * True when the alternative can never match: the tokenizer always drops one of its words (the old fillers please, ok, okay, well, um;
 * spec 03 section 1.5). The newer fillers (hey, pls, thx ...) stay words in the compat reading, so alternatives with them are reachable.
 */
export const isUnreachable = (alt) => alt.split('_').some((w) => isOldFiller(w.toLowerCase()));

/**
 * Role of each element of a match string: 'lead' (optional groups before the first other element), 'tail' (optional groups after
 * the last other element), else 'body'. Returns one role per element.
 */
export function rolesOf(parts) {
  const opt = parts.map((p) => { const g = parseGroup(p); return !!(g && g.optional); });
  const roles = parts.map(() => 'body');
  let i = 0;
  while (i < parts.length && opt[i]) roles[i++] = 'lead';
  let j = parts.length - 1;
  while (j >= i && opt[j]) roles[j--] = 'tail';
  return roles;
}

const LEAD_FILLER = new Set(`like you_know y_know ya_know u_know i_mean basically actually just so well okay ok um umm uh uhh uhm hmm hmmm hm hey yo oh ah aha ahem ahh aah alright all_right right_so alright_so so_like oh_my oh_no oh_wait oh_wow oh_and but then and now maybe perhaps honestly seriously literally totally really kinda sorta sort_of kind_of by_the_way btw
anyway anyways yeah yep nope nah man dude bro buddy mate pal sir maam mister miss mr mrs ms lol oops whoops wow awesome cool nice great sweet neat ugh geez gosh golly mhm mm mmm eh huh er erm psst sry sorry excuse_me goodness gee yay okey
alexa siri google cheers quick_q quick_question one_more_thing sure`.split(/\s+/));
const TAIL_FILLER = new Set(`pls plz plss pleeease pleas thx ty tysm lol rn for_me for_us for_now thanks thank_you thank_you_very_much thanks_a_lot cheers thx ty asap real_quick quickly right_now right_away now at_the_moment at_once at_this_point for_a_sec for_a_bit lol haha hehe btw buddy mate man dude bro pal friend anyway anyways again once_more one_more_time too already yet then today tho though or_something or_what or_so or_whatever just_curious if_you_can if_possible for_sure yeah yep nope nah ok okay sir maam mister miss
please_pls me_now to_me with_me for_real for_today real_quick in_total at_all atm anymore any_more`.split(/\s+/));

/**
 * Class of a lead-in or suffix alternative, or null when it is not generic frame vocabulary (it then stays inline in the
 * pattern): `lead.question` (indirect question lead-ins), `lead.polite` (polite request forms), `lead.filler`, `tail.filler`.
 * The fillers are curated word lists: an optional lead-in group of a world also holds content words ("add", "what is the") that
 * must never become common phrasing.
 */
export function classOf(alt, role) {
  if (role === 'tail') return TAIL_FILLER.has(alt) ? 'tail.filler' : null;
  if (/(^|_)(tell_me|let_me_know|find_out|know|wonder|wondering|curious)(_|$)/.test(alt) && !/^(i_)?(dont|do_not)_know|^i_know/.test(alt)) return 'lead.question';
  if (/^let_(it|me)_be$|^(i_)?(dont|do_not)_know$/.test(alt)) return null;
  if (/^(can|could|would|will|may|shall)_(you|u|we|i)(_|$)|^(i|id|im)_(want|need|would|wanna|wana|like)|^i_d_(like|love)|^you_should|^let(s|_us|_me)?(_|$)|^how_about|^why_dont_you|^go_ahead/.test(alt)) return 'lead.polite';
  return LEAD_FILLER.has(alt) ? 'lead.filler' : null;
}

/** `[{ world, id, match }]` of every pattern in `worldsRoot/<world>/patterns.sop` (or the given worlds). */
export function readPatterns(worldsRoot, only = null) {
  const out = [];
  for (const world of readdirSync(worldsRoot).sort()) {
    if (only && !only.includes(world)) continue;
    const f = join(worldsRoot, world, 'patterns.sop');
    if (!existsSync(f)) continue;
    for (const x of parse(readFileSync(f, 'utf8')).wires) {
      const match = get(x, 'match')?.v;
      if (match) out.push({ world, id: x.id, match });
    }
  }
  return out;
}

/** Statistics per alternative and role over patterns: Map(`class\talt`) -> { class, alt, patterns, worlds:Set, groupSize }. */
export function altStats(patterns) {
  const stats = new Map();
  for (const p of patterns) {
    const parts = p.match.trim().split(/\s+/);
    const roles = rolesOf(parts);
    parts.forEach((part, k) => {
      if (roles[k] === 'body') return;
      const g = parseGroup(part);
      if (g.alts.length < MIN_GROUP) return;
      for (const alt of g.alts) {
        if (!/[a-z]/i.test(alt) || alt.startsWith('$') || isUnreachable(alt)) continue;
        const cls = classOf(alt, roles[k]);
        if (!cls) continue;
        const key = cls + '\t' + alt;
        const e = stats.get(key) ?? { class: cls, alt, patterns: 0, worlds: new Set(), maxGroup: 0 };
        e.patterns++; e.worlds.add(p.world); e.maxGroup = Math.max(e.maxGroup, g.alts.length);
        stats.set(key, e);
      }
    });
  }
  return stats;
}
