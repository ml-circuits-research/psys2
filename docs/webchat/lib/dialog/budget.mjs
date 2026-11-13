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
import { BUDGET_LIMITS } from './budget-limits.mjs?v=fb1adadf05';

/** A short caller id: the first frames of the stack after the budget internals, `fn (file:line)`, at most 6. */
export function shortStack(skip = 3, max = 6) {
  const lines = String(new Error().stack ?? '').split('\n').slice(1 + skip, 1 + skip + max);
  return lines.map((l) => l.trim().replace(/^at /, '').replace(/\(?(?:file:\/\/)?[^()]*\/([^/()]+\/[^/()]+:\d+):\d+\)?$/, '($1)')).filter(Boolean);
}

export class BudgetExceeded extends Error {
  constructor(site, ticks, limit = 'site', extra = {}) {
    super(`compute budget exceeded at ${site} (${ticks} ticks, ${limit} limit)`);
    this.name = 'BudgetExceeded';
    this.site = site;
    this.ticks = ticks;
    this.limit = limit;
    this.bySite = extra.bySite ?? null;   // the per-site tick table at the moment of the excess
    this.stack_ = extra.stack ?? null;     // short caller id (see shortStack)
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
      if (budget.exceeded) throw budget.exceeded;   // sticky: the first excess is the record
      if (s > (sites[site] ?? perSite)) throw (budget.exceeded = new BudgetExceeded(site, s, 'site', { bySite: { ...bySite }, stack: shortStack() }));
      if (budget.ticks > perTurn) throw (budget.exceeded = new BudgetExceeded(site, budget.ticks, 'turn', { bySite: { ...bySite }, stack: shortStack() }));
    },
    /** Ticks left before `tick(site)` would throw: the smaller of the turn's and the site's remainder (a host layer with its own step limit passes it on). */
    remaining(site) { return Math.max(0, Math.min(perTurn - budget.ticks, (sites[site] ?? perSite) - (bySite[site] ?? 0))); },
  };
  return budget;
}

/** No-op budget: counts nothing, never throws. The default wherever a budget is optional. */
export const UNLIMITED = Object.freeze({ ticks: 0, bySite: Object.freeze({}), exceeded: null, tick() {}, remaining: () => Infinity });

/**
 * The budget of the turn in progress. Loop sites call `budget.tick(site, n)` on this shared handle (like `guard` for deadlines), so deep code
 * needs no extra parameter; world operations get it as `ctx.budget`. Outside a turn it is UNLIMITED (no-op).
 * `DialogSession` installs the turn's budget with `installBudget` (the outermost turn wins; nested replays and dry runs join it).
 */
let current = UNLIMITED;
let token = null;

export const budget = {
  tick(site, n = 1) { current.tick(site, n); },
  /** Ticks left at `site` in this turn (Infinity outside a turn or for a budget without limits). */
  remaining(site) { return current.remaining ? current.remaining(site) : Infinity; },
  get ticks() { return current.ticks; },
  get bySite() { return current.bySite; },
  get exceeded() { return current.exceeded; },
  get active() { return token !== null; },
};

/** Installs `b` as the current budget unless one is installed (then returns null and joins it); `force` replaces it. The caller of a non-null token must `releaseBudget(token)`. */
export function installBudget(b, { force = false } = {}) {
  if (token && !force) return null;
  current = orUnlimited(b); token = { b: current };
  return token;
}

/** Releases the budget of `t` (a no-op when another budget replaced it meanwhile). */
export function releaseBudget(t) { if (t && token === t) { current = UNLIMITED; token = null; } }

/** `b` if it is a budget, else UNLIMITED. */
export function orUnlimited(b) { return b && typeof b.tick === 'function' ? b : UNLIMITED; }

export const isBudgetExceeded = (e) => e?.name === 'BudgetExceeded';

/**
 * World helpers that have no `ctx` (placement, layout, routing, solvers) and may not import (a world is plain browser-safe files) reach the turn's
 * budget through this well-known global handle: `globalThis[Symbol.for('psys2.budget')]?.tick(site, n)`. It is the shared `budget` above, a no-op
 * outside a turn, so tests and the CLI work without a session. Each such file starts with `const budget = { tick: ... }` (see worlds/art.draw/engine.mjs).
 */
export const BUDGET_GLOBAL = Symbol.for('psys2.budget');
globalThis[BUDGET_GLOBAL] = budget;
