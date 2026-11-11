#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Writes worlds/kids.time/matrix.sop: the shift rules (day, month, season, season question) are the same four rules over a table of variants, so they are
// generated; the rest of the file (the told state, the clock deny, the days and hours between) is written here as it is. Run after changing the table,
// then `node src/cli.mjs test-world kids.time`.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = [];
const w = (s) => out.push(s);
w(`# kids.time as a matrix: the calendar is wires (the knowledge base, kb.sop) and what follows from them is rules. Told: what day it is today, which month it is now,
# what the clock shows (each telling is a new wire; the latest is what holds). Left to the operations (ops.mjs, \`ops=\` in world.sop): how many small spans fit in
# a big one (a shortest chain over the length facts), the 12-hour clock text and reading the real clock. The words around the numbers ("The day after Monday is",
# "Tomorrow is", the remark about February) are the world's (fns.mjs, \`voice\`).

@tm.seq core.sequence key=core.seq

# ---- what the dialogue says about now: the latest statement of each
@tm.td kids.time.today core.select=latest day=?d
@tm.nd kids.time.nowday day=?d
@tm.r.nd core.rule when=$tm.td then=$tm.nd
@tm.tm kids.time.thismonth core.select=latest month=?m
@tm.nm kids.time.nowmonth month=?m
@tm.r.nm core.rule when=$tm.tm then=$tm.nm
@tm.tc kids.time.clockset core.select=latest hour=?h
@tm.nc kids.time.nowclock hour=?h
@tm.r.nc core.rule when=$tm.tc then=$tm.nc

# ---- the clock has hours 0 to 24 only: another hour is refused when told, with the reason
@tm.hb kids.time.clockset hour=?h
@tm.t.low core.check fn=lt args=?h args=0
@tm.t.high core.check fn=gt args=?h args=24
@tm.d.low core.deny when=$tm.hb if=$tm.t.low why="That is not an hour on a clock: ?h o'clock."
@tm.d.high core.deny when=$tm.hb if=$tm.t.high why="That is not an hour on a clock: ?h o'clock."

# ---- keys the rules fill on a question
@tm.k.shift.start core.slot of=kids.time.shift key=start kind=atom
@tm.k.shift.pos core.slot of=kids.time.shift key=pos kind=integer
@tm.k.ss.start core.slot of=kids.time.seasonshift key=start kind=atom
@tm.k.ss.pos core.slot of=kids.time.seasonshift key=pos kind=integer
@tm.k.gap.start core.slot of=kids.time.gap key=start kind=atom
@tm.k.gap.unit core.slot of=kids.time.gap key=unit kind=atom
@tm.k.hg.unit core.slot of=kids.time.hoursgap key=unit kind=atom
`);
const variants = [
  { id: 'sd', qt: 'kids.time.shift', unit: 'day', info: 'kids.time.dayinfo', n: 7, now: ['today', 'kids.time.nowday', 'day'], title: 'the day after or before another day, wrapping round the week' },
  { id: 'sm', qt: 'kids.time.shift', unit: 'month', info: 'kids.time.monthinfo', n: 12, now: ['this_month', 'kids.time.nowmonth', 'month'], title: 'the month some steps from another one, wrapping round the year' },
  { id: 'ss', qt: 'kids.time.shift', unit: 'season', info: 'kids.time.seasoninfo', n: 4, title: 'the season some steps from another one' },
  { id: 'ts', qt: 'kids.time.seasonshift', unit: 'season', info: 'kids.time.seasoninfo', n: 4, title: 'the same, asked as a season question' },
];
for (const v of variants) {
  const p = `tm.${v.id}`;
  const D = (id) => `$${p}.${id}`;
  w(`# ---- ${v.title}: start (a name, or the one told for "${v.now?.[0] ?? 'now'}"), the place counted from it, the one at that place`);
  w(`@${p}.q1 ${v.qt} unit=${v.unit} from=?f
@${p}.d1 ${v.info} name=?f
@${p}.s1 ${v.qt} core.on=${D('q1')} start=?f
@${p}.r.s1 core.rule when=${D('q1')} when=${D('d1')} then=${D('s1')}`);
  if (v.now) w(`@${p}.q2 ${v.qt} unit=${v.unit} from=${v.now[0]}
@${p}.n2 ${v.now[1]} ${v.now[2]}=?d
@${p}.s2 ${v.qt} core.on=${D('q2')} start=?d
@${p}.r.s2 core.rule when=${D('q2')} when=${D('n2')} then=${D('s2')}`);
  w(`@${p}.q3 ${v.qt} unit=${v.unit} start=?s by=?n
@${p}.d3 ${v.info} name=?s index=?i
@${p}.c1 core.calc out=?a fn=add args=?i args=?n
@${p}.c2 core.calc out=?b fn=sub args=?a args=1
@${p}.c3 core.calc out=?c fn=mod args=?b args=${v.n}
@${p}.c4 core.calc out=?e fn=add args=?c args=1
@${p}.s3 ${v.qt} core.on=${D('q3')} pos=?e
@${p}.r.s3 core.rule when=${D('q3')} when=${D('d3')} with=${D('c1')} with=${D('c2')} with=${D('c3')} with=${D('c4')} then=${D('s3')}
@${p}.q4 ${v.qt} unit=${v.unit} pos=?e
@${p}.d4 ${v.info} index=?e name=?x
@${p}.s4 ${v.qt} core.on=${D('q4')} result=?x
@${p}.r.s4 core.rule when=${D('q4')} when=${D('d4')} then=${D('s4')}
`);
}
w(`# ---- how many days until a day of the week comes, counting forward (from a named day or from today)
@tm.g.q1 kids.time.gap from=?f
@tm.g.d1 kids.time.dayinfo name=?f
@tm.g.s1 kids.time.gap core.on=$tm.g.q1 start=?f
@tm.g.r.s1 core.rule when=$tm.g.q1 when=$tm.g.d1 then=$tm.g.s1
@tm.g.q2 kids.time.gap from=today
@tm.g.n2 kids.time.nowday day=?d
@tm.g.s2 kids.time.gap core.on=$tm.g.q2 start=?d
@tm.g.r.s2 core.rule when=$tm.g.q2 when=$tm.g.n2 then=$tm.g.s2
@tm.g.q3 kids.time.gap start=?s to=?t
@tm.g.d3 kids.time.dayinfo name=?s index=?i
@tm.g.d4 kids.time.dayinfo name=?t index=?j
@tm.g.c1 core.calc out=?a fn=sub args=?j args=?i
@tm.g.c2 core.calc out=?c fn=mod args=?a args=7
@tm.g.s3 kids.time.gap core.on=$tm.g.q3 count=?c unit=day
@tm.g.r.s3 core.rule when=$tm.g.q3 when=$tm.g.d3 when=$tm.g.d4 with=$tm.g.c1 with=$tm.g.c2 then=$tm.g.s3

# ---- hours from one o'clock to another on a 12-hour clock: 12 when the two hours are different and a whole turn apart, 0 when they are the same
@tm.h.q kids.time.hoursgap from=?a to=?b
@tm.h.t1 core.check fn=gte args=?a args=0
@tm.h.t2 core.check fn=lte args=?a args=24
@tm.h.t3 core.check fn=gte args=?b args=0
@tm.h.t4 core.check fn=lte args=?b args=24
@tm.h.c1 core.calc out=?d fn=sub args=?b args=?a
@tm.h.c2 core.calc out=?m fn=mod args=?d args=12
@tm.h.t.nz core.check fn=neq args=?m args=0
@tm.h.t.z core.check fn=eq args=?m args=0
@tm.h.t.same core.check fn=eq args=?a args=?b
@tm.h.t.diff core.check fn=neq args=?a args=?b
@tm.h.a1 kids.time.hoursgap core.on=$tm.h.q count=?m unit=hour
@tm.h.a2 kids.time.hoursgap core.on=$tm.h.q count=0 unit=hour
@tm.h.a3 kids.time.hoursgap core.on=$tm.h.q count=12 unit=hour
@tm.h.r1 core.rule when=$tm.h.q with=$tm.h.c1 with=$tm.h.c2 if=$tm.h.t1 if=$tm.h.t2 if=$tm.h.t3 if=$tm.h.t4 if=$tm.h.t.nz then=$tm.h.a1
@tm.h.r2 core.rule when=$tm.h.q with=$tm.h.c1 with=$tm.h.c2 if=$tm.h.t1 if=$tm.h.t2 if=$tm.h.t3 if=$tm.h.t4 if=$tm.h.t.z if=$tm.h.t.same then=$tm.h.a2
@tm.h.r3 core.rule when=$tm.h.q with=$tm.h.c1 with=$tm.h.c2 if=$tm.h.t1 if=$tm.h.t2 if=$tm.h.t3 if=$tm.h.t4 if=$tm.h.t.z if=$tm.h.t.diff then=$tm.h.a3
`);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '../worlds/kids.time/matrix.sop'), out.join('\n'));
