// SPDX-License-Identifier: AGPL-3.0-only
// The NX strategies and the default, in a module of their own: the page needs them to read a setting and must not load the reading engine for that (LAZY LOADING).
/** The strategies and the one constant that picks the default. */
export const NX_STRATEGIES = Object.freeze(['hybrid', 'neural', 'rules']);
export const DEFAULT_NX_STRATEGY = 'rules';   // owner decision 2026-11-14 (defaults by the numbers): the rules read; hybrid rescued 6 turns and broke 9 of 6,744, neural is 126 right fewer. The strategies stay for measurement only (no setting offers them).
export const normalizeNxStrategy = (v) => (NX_STRATEGIES.includes(v) ? v : DEFAULT_NX_STRATEGY);
