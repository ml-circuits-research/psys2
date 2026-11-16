// soplang.js — SOP Lang wires and the writer (mirrors tool/sop/soplang.py: Atom, Line, Wire, Doc, format_atom, write).
// A value is built from: a string (a word), ["ref", id], ["&", [values]] / ["|", [values]], "~" (occupancy marker), "?" (asked role).

const BARE_OK = /^[^\s$~?"&|][^\s"&|]*$/;
export const FREE_TEXT_KEYS = new Set(["_text"]);

export class Atom { constructor(kind, text = null, quoted = false) { this.kind = kind; this.text = text; this.quoted = quoted; } }

export function toAtoms(value) {
  if (value instanceof Atom) return [[value], null];
  if (Array.isArray(value) && value.length === 2 && value[0] === "ref") return [[new Atom("ref", value[1])], null];
  if (Array.isArray(value) && value.length === 2 && (value[0] === "&" || value[0] === "|")) {
    const atoms = value[1].map((v) => toAtoms(v)[0][0]); return [atoms, atoms.length > 1 ? value[0] : null];
  }
  if (value === "~") return [[new Atom("unknown")], null];
  if (value === "?") return [[new Atom("asked")], null];
  return [[new Atom("word", String(value))], null];
}

export class Line {
  constructor(key, raw = null, atoms = [], sep = null) { this.key = key; this.raw = raw; this.atoms = atoms; this.sep = sep; }
  get text() {
    if (FREE_TEXT_KEYS.has(this.key)) return this.raw;
    if (this.atoms.length === 1 && this.atoms[0].kind === "word") return this.atoms[0].text;
    return this.raw !== null ? this.raw : formatValue(this.atoms, this.sep);
  }
  refs() { return this.atoms.filter((a) => a.kind === "ref").map((a) => a.text); }
}

export function line(key, value) {
  if (FREE_TEXT_KEYS.has(key)) return new Line(key, String(value).replace(/\n/g, " "));
  const [atoms, sep] = toAtoms(value); return new Line(key, null, atoms, sep);
}

export class Wire {
  constructor(id, type) { this.id = id; this.type = type; this.lines = []; }
  get(key) { return this.lines.find((l) => l.key === key) || null; }
  value(key, dflt = null) { const l = this.get(key); return l === null ? dflt : l.text; }
  set(key, value) {
    const [atoms, sep] = toAtoms(value); let l = this.get(key);
    if (l === null) { l = new Line(key); this.lines.push(l); }
    l.atoms = atoms; l.sep = sep; l.raw = null;
    if (FREE_TEXT_KEYS.has(key)) { l.raw = String(value).replace(/\n/g, " "); l.atoms = []; }
    return l;
  }
  refs() { return this.lines.flatMap((l) => l.refs()); }
}

export function quote(t) { return '"' + t.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
export function formatAtom(a) {
  if (a.kind === "ref") return "$" + a.text;
  if (a.kind === "unknown") return "~";
  if (a.kind === "asked") return "?";
  return BARE_OK.test(a.text) && !a.quoted ? a.text : quote(a.text);
}
export function formatValue(atoms, sep = null) { return atoms.length > 1 ? atoms.map(formatAtom).join(` ${sep} `) : formatAtom(atoms[0]); }

/** directives: [[name, value]], wires: [Wire] -> text in the canonical layout */
export function write(directives, wires) {
  const out = directives.map(([n, v]) => `!${n} ${v}`), blocks = [];
  for (const w of wires) {
    const b = [`@${w.id} ${w.type}`];
    for (const l of w.lines) {
      if (l.raw !== null) b.push(`${l.key}=${l.raw}`);
      else if (FREE_TEXT_KEYS.has(l.key)) b.push(`${l.key}=` + (l.atoms.length ? l.atoms[0].text : "").replace(/\n/g, " "));
      else b.push(`${l.key}=${formatValue(l.atoms, l.sep)}`);
    }
    blocks.push(b.join("\n"));
  }
  const parts = (out.length ? [out.join("\n")] : []).concat(blocks);
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}
