// SPDX-License-Identifier: AGPL-3.0-only
// plan.timeline (spec 21, spec 23 section 8): the one hook of the world. A moment whose name is a time of the calendar (a weekday, a month, a season, a part of the day, a clock hour: k.time,
// read through src/knowledge/time.mjs, bundled for offline) takes its place in time from the catalog: its `when` is its position in its cycle (March is 3, Friday is 5), and it remembers the
// cycle (`time: { cycle, kind }`) so that the row puts the months with the months and the days with the days, each in the order of its cycle. A moment that is no time of the calendar
// (a birthday called Ann) keeps its `when`; one the user set ("set Monday time to 2") keeps what was said. Nothing here names a month or a day.
import { timePosition } from '../../lib/knowledge/time.mjs?v=25af79c1b8';

export const hooks = {
  after(ctx, act, req, r) {
    if (r?.status && r.status !== 'supported') return r;
    for (const it of ctx.state?.items ?? []) {
      if (it.kind !== 'moment' || 'time' in it) continue;
      const p = it.name ? timePosition(it.name) : null;
      it.time = p ? { cycle: p.cycle, kind: p.kind } : null;
      if (p) it.attrs = { ...(it.attrs ?? {}), when: p.n };
    }
    return r;
  },
};
