/** Emit templates (spec 03 section 2): placeholders, fresh ids, auto-added core keys. Browser-safe. */
import { parse, atom, ref, str } from '../../soplang/index.mjs';

const OPT_ENTRY = /(\s)([A-Za-z_][\w.-]*)=("?)\{([A-Za-z_]\w*)(?:\|\w+)?\}\3(?=\s|$|@)/g;
const FRESH = /^_\d*$/;

const jsonInner = (s) => JSON.stringify(s).slice(1, -1);

/** Placeholder filters `{slot|filter}`: `cap` capitalizes the first letter of every word (stored names: "zed" -> "Zed"). */
export const EMIT_FILTERS = {
  cap: (s) => String(s).replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()),
};

/**
 * Substitute placeholders in an emit template and return SOP text.
 * `slots`: name -> { value, text }; `fresh()` returns a new wire id.
 * Optional slots that were not captured remove the whole `key={slot}` entry.
 */
export function substituteEmit(template, slots, fresh) {
  const t = template.replace(OPT_ENTRY, (all, ws, _key, _q, name) => (name in slots || FRESH.test(name) ? all : ws));
  const ids = new Map();
  let out = '';
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (c === '\\') { out += c + (t[i + 1] ?? ''); i++; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
    } else if (c === '"') { inStr = true; out += c; continue; }
    if (c !== '{') { out += c; continue; }
    const end = t.indexOf('}', i);
    if (end < 0) throw new Error('unterminated placeholder in emit template');
    const [name, filter] = t.slice(i + 1, end).split('|');
    i = end;
    if (filter !== undefined && !EMIT_FILTERS[filter]) throw new Error(`unknown emit filter '${filter}'`);
    if (FRESH.test(name)) {
      if (!ids.has(name)) ids.set(name, fresh());
      out += ids.get(name);
      continue;
    }
    const slot = slots[name];
    if (!slot) throw new Error(`emit uses slot '${name}' that was not captured`);
    const f = filter ? EMIT_FILTERS[filter] : (x) => x;
    out += inStr ? jsonInner(f(slot.text)) : slot.value.startsWith('$') ? slot.value : f(slot.value);
  }
  return out;
}

/**
 * Parse the substituted emit text and add core.via, core.source, core.seq and core.in.
 * @returns {object[]} wires (short keys as written by the pattern, plus full core keys)
 */
export function buildWires(pattern, slots, { fresh, nextSeq, sourceRef, worldId }) {
  const sop = substituteEmit(pattern.emit, slots, fresh);
  const { wires, errors } = parse(sop, { source: pattern.id });
  if (errors.length) throw new Error(`emit of ${pattern.id} is not valid SOP Lang: ${errors[0].message} in "${sop}"`);
  return wires.map((w) => addCore(w, { via: pattern.id, sourceRef, seq: nextSeq(), worldId }));
}

/** Append the engine-managed core keys to a wire. */
export function addCore(w, { via, sourceRef, seq, worldId }) {
  const entries = [...w.entries,
    { key: 'core.via', value: ref(via) },
    ...(sourceRef ? [{ key: 'core.source', value: str(sourceRef) }] : []),
    { key: 'core.seq', value: atom(seq) }];
  if (worldId) entries.push({ key: 'core.in', value: ref(worldId) });
  return { ...w, entries };
}

/** Dummy slot values for static checking of a pattern's emit template. */
export function dummySlots(slotDefs) {
  const out = {};
  for (const [name, def] of slotDefs) {
    if (def.cls === 'agent') out[name] = { value: '$e.dummy', text: 'Dummy' };
    else if ((def.cls === 'number' || def.cls === 'ordinal')) out[name] = { value: '1', text: '1' };
    else if (def.cls === 'words') out[name] = { value: 'some words', text: 'some words' };
    else out[name] = { value: 'x', text: 'x' };
  }
  return out;
}
