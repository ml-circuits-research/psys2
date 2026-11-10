/**
 * Compute-budget limits, in one place (spec 06 "Compute budgets"). Browser-safe, no `node:*` imports.
 * Units are ticks (one tick is one iteration of a guarded loop, or `n` units of work), never milliseconds, so a budget is deterministic.
 * Defaults are 10x the p99 measured on the operational set and the dialogues (`node scripts/measure-ticks.mjs`), rounded up.
 * `perTurn` caps the sum of every site; a site listed in `sites` has its own cap; any other site falls under `perSite`.
 */
export const BUDGET_LIMITS = {
  perTurn: 5_000_000,
  perSite: 1_000_000,
  sites: {},
};
