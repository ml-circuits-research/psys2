// vss.js — the VSS reader in the browser (VSS Diagram Editor spec section 7). ES module, no dependency.
//   import { load } from "./vss.js";
//   const vss = await load("model/");                          // the folder written by `sop export-web`
//   const r = vss.read("put a yellow note 10 px below the database .");
//   r.sop (SOP Lang text), r.frame, r.margins, r.presence, r.status, r.residual, r.timings
// Modules (spec Table 6): vss/stars.js (portable stars), vss/routebook.js (addresses), vss/reader.js (tokenize, kinds, decoder,
// residual / status, frame -> wires), vss/soplang.js (SOP Lang writer), vss/loader.js (export-web files).
import { loadFiles } from "./vss/loader.js";
import { Stars } from "./vss/stars.js";
import { Routebook } from "./vss/routebook.js";
import { Reader, tokenize } from "./vss/reader.js";
import { write } from "./vss/soplang.js";

export { tokenize };

function* idgen(prefix = "w", start = 1) { let i = start; for (;;) yield `${prefix}${i++}`; }

export class VSS {
  constructor(files, opts = {}) {
    const { model, routebook } = files;
    const cfg = Object.assign({}, model.config, { star_seed: model.catalog.star_seed, star_version: model.catalog.star_version || 1, identity_table: model.catalog.identity_table });
    this.model = model; this.manifest = files.manifest;
    this.stars = new Stars(cfg, files.stars);
    this.rb = new Routebook(Object.assign({ D: model.config.D }, routebook.header), routebook.arrays);
    this.reader = new Reader(model, this.rb, this.stars, opts);
  }
  /** one sentence -> {sop, wires, frame, margins, presence, status, residual, unplaced, undecided, tokens, state, timings} */
  read(text, opts = {}) {
    const t0 = performance.now(), { wires, frame, decoded, info } = this.reader.formalize(text, opts.sentence ?? 0, idgen("w", opts.start || 1), opts);
    const sop = write(opts.directives || [["world", this.model.world || "?"], ["legend", this.model.legend_sha256]], wires);
    const fr = { speakers: decoded.speakers, neg: decoded.neg, event: decoded.event, roles: decoded.roles, shape: frame.shape, lemma: decoded.lemma ?? null, depth: decoded.depth ?? 0, scope: decoded.scope ?? null };
    return { sop, wires, frame: fr, shape: frame.shape, margins: decoded.margins || {}, presence: decoded.presence || {}, status: info.status, residual: info.residual,
             unplaced: info.unplaced.map((i) => info.tokens[i]), tokens: info.tokens, state: info.S, missingStars: [...this.stars.missing], candidates: decoded.runner_up || {},
             undecided: undecidedOf(wires[0]), presenceQueries: presenceQueriesOf(wires[0]), offers: offersOf(wires[0]),
             timings: { chart_ms: info.ms_chart, total_ms: performance.now() - t0 } };
  }
  /** a whole message (normalized tokens, or their text) with a centre model (legend reader.centres) -> {tokens, centres, ignored}:
   *  centres in text order, each {pos, token, null, accepted, members (token indices), and when accepted: text, sop, wires, frame, status,
   *  residual, unplaced}; ignored = the token spans [a, b) no accepted centre took (its reading ok / abstain) */
  readMessage(tokens, opts = {}) {
    if (!this.reader.centres) throw new Error("vss.js: readMessage needs a centre model (legend reader.centres)");
    const m = this.reader.readMessage(tokens, opts.sentence ?? 0, idgen("w", opts.start || 1), opts);
    const dir = opts.directives || [["world", this.model.world || "?"], ["legend", this.model.legend_sha256]];
    const centres = m.centres.map((c) => {
      const o = { pos: c.pos, token: c.token, null: c.null, accepted: c.accepted, members: c.members };
      if (c.accepted) {
        const { wires, frame, decoded, info } = c.result;
        Object.assign(o, { text: c.text, sop: write(dir, wires), wires, shape: frame.shape, status: info.status, residual: info.residual, margins: decoded.margins || {},
          frame: { speakers: decoded.speakers, neg: decoded.neg, event: decoded.event, roles: decoded.roles, shape: frame.shape, lemma: decoded.lemma ?? null },
          unplaced: info.unplaced.map((i) => info.tokens[i]), tokens: info.tokens });
      }
      return o;
    });
    return { tokens: m.tokens, centres, ignored: m.ignored };
  }
}

/** the adjacency rule's queries of the top wire (`_undecided.<role>=a|b`, addendum q-formalisation 10) -> { role: [a, b] } */
function undecidedOf(top) {
  const out = {};
  for (const l of top?.lines || []) if (l.key.startsWith("_undecided.")) out[l.key.slice("_undecided.".length)] = String(l.text).split("|");
  return out;
}

/** the presence queries of the top wire (`_presence_query.<role>=<margin>`, responses D14): a role read as absent whose presence margin
 *  is under tau -> { role: margin }; the reader no longer lowers the frame's margin for it */
function presenceQueriesOf(top) {
  const out = {};
  for (const l of top?.lines || []) if (l.key.startsWith("_presence_query.")) out[l.key.slice("_presence_query.".length)] = Number(l.text);
  return out;
}

/** the words offered to empty roles (`_offer.<role>=<word>`, responses D27): an unplaced word that exactly one empty role of the decided
 *  event admits, asked for as a presence query -> { role: word } */
function offersOf(top) {
  const out = {};
  for (const l of top?.lines || []) if (l.key.startsWith("_offer.")) out[l.key.slice("_offer.".length)] = String(l.text);
  return out;
}

/** load a model folder (URL in the browser, or a readFile function in node) */
export async function load(base, opts = {}) {
  const files = await loadFiles(base, opts.readFile);
  return new VSS(files, opts);
}
