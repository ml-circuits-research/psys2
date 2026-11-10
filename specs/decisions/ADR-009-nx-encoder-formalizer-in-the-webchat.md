# ADR-009: the NX encoder formalizer in the webchat, with a strategy setting

Status: accepted (user decisions of 2026-11-10)

## Context
The NX experiment (training/RESULTS.md NX, NX5, NX7; training/nx/README.md) trained two heads on the frozen dispatcher v4 encoder: an operation head and a BIO tag head. A reading of a segment is: operation and spans, a candidate pattern of the worlds, the rules' own matcher and emit template to build the wires, then the legend check and an interpreter dry run (the validator), else abstain. The model never builds wires itself; the rules stay the only formalizer. NX was first kept outside `src/` and the webchat ("no webchat integration"). The measurements were:
- model reading alone: 62-66 % right on the operational set against the rules' 95.6 %;
- model first, rules as fallback, over the shipped `encoder+n1` pipeline (NX7): 16.2 % wrong on the operational set against 0.3 % shipped, and dialogue turns right down about 20 points;
- model as the reader of what the rules cannot read: right on 71-82 % of paraphrases outside the patterns where the rules are right on 22 %; with the NX7 gate (A3, tau_op 0.99, tau_frame 0.9, negation guard) it adds nothing wrong on the dev data.

## Decision
1. **Integrate the NX reading into the webchat** (user, 2026-11-10, overriding "no webchat integration") as a strategy with a persisted setting `nxStrategy` (Settings > Understanding, "Reading strategy"):
   - `rules`: today's behaviour, the model is never asked to read.
   - `hybrid`: the shipped path (dispatcher, validator, normalizer, spelling, partial understanding, best effort) runs unchanged; the model reads only a segment that path left **unparsed**, behind the NX7 gate (operation probability >= 0.99, every span inside the pattern's frame with frame score >= 0.9, no negation word in the segment) and the validator. A partial or corrected answer is kept.
   - `neural`: the model reads the whole message first (negation guard and a minimum word coverage of 0.6; validator always); if any segment is not read, or does not pass, the whole message goes to the shipped path exactly as today.
2. **The default is `hybrid`.** The user first asked for `neural` (model first) as the default, expecting more flexibility on real-world phrasing; after the NX7 numbers (16.2 % wrong, about 20 points fewer dialogue turns right) he chose `hybrid`. `neural` and `rules` stay selectable. The default is the single constant `DEFAULT_NX_STRATEGY` in `src/formalizer/nx.mjs`.
3. **Worlds the model is not trained on are read by the rules only** (today `user.profile`; `core` and `lang.common` are not command worlds). No pattern of such a world is a model candidate, and in `neural` a message that an untrained world's rules read goes to the rules path. The trained worlds are listed in the published `meta.json` (`nx.trained_worlds`).
4. **Model: A3** (heads on the frozen v4 encoder, `training/runs/export/nx-a-nx3`), published as the webchat dispatcher model (int8, 68.0 MB, sha256 56741a80). Its dispatcher outputs equal v4's (max abs diff 0.0 over 600 inputs). **One encoder pass serves both**: the dispatcher runtime keeps the op and tag logits of the routing pass next to the world logits (`rankFull(...).nx`), and the NX reading reads them from that cache; a second pass is never made. The segmentation pass asks the ORT worker for `seg_logits` only.
5. **Robustness**: the model is asked only with the encoder formalizer chosen, the model ready and ORT not paused; the reading runs inside the turn guard (cancel, deadlines, soft deadline), through the existing ORT worker (no main-thread inference). A failure keeps the rules' answer. The trace and the debug view say which strategy produced each reading (`model` / `rules`).

## Consequences
- The default webchat answers exactly as before except for segments the shipped path could not read; those may now be read by the model when it is very sure.
- `neural` is available to the user but is measurably worse on the operational set and on dialogues; it is documented as such in Settings and in training/RESULTS.md (NX-INTEGRATION).
- Changing the default later is one constant (and the saved value of users who chose a strategy is respected).
- The evaluators build the same configuration (`scripts/eval-nx.mjs --system webchat-<strategy>`), so a reported number describes the shipped product.
- Not decided here: C (per-world LoRA adapters), A+ (unfrozen layers; it changes the dispatcher outputs and needs a re-evaluation of the simplifier thresholds).
