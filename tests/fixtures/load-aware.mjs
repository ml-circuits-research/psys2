// SPDX-License-Identifier: AGPL-3.0-only
// Time limits for browser tests that run inside the full gate: node --test runs one process per file on every core, so a page competes with the rest of
// the gate (and with any training on the machine) for CPU. A limit measured on an idle machine is scaled by how far the run queue exceeds the cores:
// factor = max(1, 1-minute load average / available cores). On an idle or normally loaded machine the factor is 1 and the limit is unchanged.
import { availableParallelism, loadavg } from 'node:os';

export const loadFactor = () => Math.max(1, loadavg()[0] / availableParallelism());
/** `ms` scaled by the current load factor (rounded). */
export const loadAwareLimit = (ms) => Math.round(ms * loadFactor());
