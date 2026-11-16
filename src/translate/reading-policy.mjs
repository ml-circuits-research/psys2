// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WHO READS THE PERSON'S WORDS (reviewer 2026-11-16 02:30, questions.md Q50; spec 05 section 6.4 "Reading fallback"): a language that has a rules translator is read by the rules
 * (with the source repairs and the glosses); the machine translator (the browser's or the on-device model) is not a candidate of the request reading for it, because on real rows it
 * added wrong executions and no right answer. A language with no rules translator keeps the machine reading. Replies are not concerned (reply facts, then the translators).
 * This is data, reversible: a host sets `engine.machineReading = { ro: true }` (Node: PSYS2_RO_MODEL=1) to put the model back for a language. Browser-safe.
 */
export const MACHINE_READING_OFF = Object.freeze(['ro']);

/** Does the machine translator propose readings of the person's words in `lang`? `override`: the host's { <lang>: boolean } (engine.machineReading). */
export function machineReads(lang, override = null) {
  const code = String(lang ?? '').toLowerCase().split('-')[0];
  if (override && Object.hasOwn(override, code)) return !!override[code];
  return !MACHINE_READING_OFF.includes(code);
}
