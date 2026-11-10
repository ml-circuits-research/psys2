/**
 * Deterministic compute budget of one turn (spec 06 "Compute budgets"). Browser-safe, no `node:*` imports.
 *
 *   const budget = createBudget();            // default limits from budget-limits.mjs
 *   budget.tick('matcher.backtrack');         // one unit of work at this site; throws BudgetExceeded when a limit is passed
 *   budget.tick('layout.search', 50);         // n units
 *   budget.ticks, budget.bySite               // totals, for the trace and the phrase log
 *
 * `UNLIMITED` is a shared no-op budget for callers that have none (it counts nothing and never throws).
 */
import { BUDGET_LIMITS } from './budget-limits.mjs';

export class BudgetExceeded extends Error {
  constructor(site, ticks, limit = 'site') {
    super(`compute budget exceeded at ${site} (${ticks} ticks, ${limit} limit)`);
    this.name = 'BudgetExceeded';
    this.site = site;
    this.ticks = ticks;
    this.limit = limit;
  }
}

/** `limits` = { perTurn, perSite, sites: { <site>: n } }; missing keys fall back to BUDGET_LIMITS; `Infinity` disables a limit. */
export function createBudget(limits = {}) {
  const perTurn = limits.perTurn ?? BUDGET_LIMITS.perTurn;
  const perSite = limits.perSite ?? BUDGET_LIMITS.perSite;
  const sites = { ...BUDGET_LIMITS.sites, ...(limits.sites ?? {}) };
  const bySite = Object.create(null);
  const budget = {
    ticks: 0,
    bySite,
    exceeded: null,
    tick(site, n = 1) {
      budget.ticks += n;
      const s = (bySite[site] = (bySite[site] ?? 0) + n);
      if (s > (sites[site] ?? perSite)) throw (budget.exceeded = new BudgetExceeded(site, s, 'site'));
      if (budget.ticks > perTurn) throw (budget.exceeded = new BudgetExceeded(site, budget.ticks, 'turn'));
    },
  };
  return budget;
}

/** No-op budget: counts nothing, never throws. The default wherever a budget is optional. */
export const UNLIMITED = Object.freeze({ ticks: 0, bySite: Object.freeze({}), exceeded: null, tick() {} });

/** `b` if it is a budget, else UNLIMITED. */
export const orUnlimited = (b) => (b && typeof b.tick === 'function' ? b : UNLIMITED);

export const isBudgetExceeded = (e) => e?.name === 'BudgetExceeded';
