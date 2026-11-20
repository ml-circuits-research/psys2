// SPDX-License-Identifier: AGPL-3.0-only
// Time limits for browser tests that run inside the full gate: node --test runs one process per file on every core, so a page competes with the rest of
// the gate (and with any training on the machine) for CPU. A limit measured on an idle machine is scaled by how far the run queue exceeds the cores:
// factor = max(1, 1-minute load average / available cores). On an idle or normally loaded machine the factor is 1 and the limit is unchanged.
import { availableParallelism, loadavg } from 'node:os';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../docs/webchat/ui/settings.mjs';
import { TIME_LIMIT_SPECS } from '../../src/dialog/time-limits.mjs';

export const loadFactor = () => Math.max(1, loadavg()[0] / availableParallelism());
/** `ms` scaled by the current load factor (rounded). */
export const loadAwareLimit = (ms) => Math.round(ms * loadFactor());

/**
 * Page init script (openBrowserReaderRoute initScripts) for browser tests that check what a turn does, not how fast: it saves the page setting
 * Settings › Developer › Time limits › Turn watchdog at its maximum, so a turn slowed by the rest of the gate is not cut off at the 8 s default
 * (the product default and its behaviour stay covered by the turn-lifecycle tests). Other saved settings are kept.
 */
export function functionalTurnLimitsScript(watchdogMs = TIME_LIMIT_SPECS.watchdogMs.max) {
  return `try{const k=${JSON.stringify(SETTINGS_KEY)},s=JSON.parse(localStorage.getItem(k)??'null')??{settingsVersion:${SETTINGS_VERSION}};`
    + `s.timeLimits={...(s.timeLimits??{}),watchdogMs:${Number(watchdogMs)}};localStorage.setItem(k,JSON.stringify(s));}catch{}`;
}
