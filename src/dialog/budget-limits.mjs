/**
 * Compute-budget limits, in one place (spec 06 "Compute budgets"). Browser-safe, no `node:*` imports.
 * Units are ticks (one tick is one iteration of a guarded loop, or `n` units of work), never milliseconds, so a budget is deterministic.
 * Measured by `node scripts/measure-ticks.mjs` in rules and encoder+n1 mode over operational, long, operational-ro and the dialogues
 * (7484 turns each, 2026-11-10; the encoder+n1 numbers are the larger and are quoted below).
 * Rule: a site's limit is the larger of 10x the p99 and 2x the maximum seen, rounded up to one significant digit, at least 20 000; every site
 * not listed falls under `perSite`. `perTurn` caps the sum of all sites (10x the p99 of the total is 6.3 M, the largest real turn 5.2 M).
 */
export const BUDGET_LIMITS = {
  perTurn: 10_000_000,
  perSite: 1_000_000,
  sites: {
    'rules.pattern': 8_000_000,        // p99 425 k, max 4.0 M
    'matcher.backtrack': 2_000_000,    // p99 138 k, max 815 k
    'spell.edit': 1_000_000,           // p99 89 k, max 191 k
    'matcher.attempt': 400_000,        // p99 29 k, max 187 k
    'interpreter.visit': 1_000_000,    // p99 25 k, max 443 k (a long map message with several lookups)
    'translate.frame': 200_000,        // p99 14 k, max 26 k
    'soplang.entry': 200_000,          // p99 3.1 k, max 92 k
    'soplang.wire': 40_000,            // p99 579, max 15.7 k
    'wordpiece.start': 200_000,        // per-word quadratic scan; p99 165, max 311
    'wordpiece.end': 200_000,
    'translate.tokenize': 20_000,      // max 2 k
    'translate.np': 20_000,
    'translate.parse': 20_000,
    'translate.render': 20_000,
    'translate.items': 20_000,
    'translate.clause': 20_000,
    'translate.segment': 20_000,
    'rules.readgroup': 20_000,         // max 8.4 k
    'rules.sentence': 20_000,
    'normalize.fixpoint': 20_000,
    'ops.call': 20_000,                // max 2.7 k
    'normalizer.decode': 20_000,
    'dialog.lenient': 20_000,
    'dialog.besteffort': 20_000,
    'dialog.capability': 20_000,
    'dialog.formalize': 20_000,
    'dialog.names': 20_000,
    'dialog.spell': 20_000,
    'dialog.settle': 20_000,
    'discourse.meta': 20_000,
    'discourse.fill': 20_000,
    'discourse.ellipsis': 20_000,
    'discourse.pronoun': 20_000,
    'voice.rec': 20_000,
    'dispatch.segmentation': 20_000,
    'dispatch.rewrite': 20_000,
  },
};
