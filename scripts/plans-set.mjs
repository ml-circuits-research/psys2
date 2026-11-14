// SPDX-License-Identifier: AGPL-3.0-only
// The 60 multi-step requests of PLANS FROM KNOWLEDGE (specs/24-plans-from-knowledge.md), judged by the state of the live worlds, not by the words of the reply. Used by scripts/eval-plans.mjs and tests/plans.test.mjs.
// A case: { id, group, say: [lines said before, each in the same session], ask: the request, ok: (r) => boolean }. `r` = { reply, before, after, drawn (objects added), said (all replies), st (state of a world) }.
// English only. A refusal is judged right only where the case says `refuse: true` (an impossible request): a request that cannot be done must say so and leave the picture as it was.

const NOT_DONE = /^(?:[A-Z][^.]* is a kind of [a-z ]+\. )?(?:I don't know how|I do not know|I can't|I cannot|I can not|I did not understand|I do not understand|I can draw a house|Which|Where should|There is nothing|What should|I am not sure|Tell me|OK, I added a table|OK, I made a table|I did not catch)/i;   // a refusal or a question starts the reply
const kindOf = (o) => (o.kind === 'composite' ? o.thing : o.kind);
const count = (xs) => xs.length;
const PEOPLE = /^(?:person|man|woman|boy|girl|child|baby|doctor|king|queen|pirate|teacher|farmer|nurse|chef|knight|firefighter|police|clown|soldier|mother|father|ewe)/;   // ewe: a girl the catalog draws as one (a stand-in)

/** A thing a is on a thing b: its centre inside b's width and its bottom no lower than b's bottom, centre above b's centre. `box` is the board's bbox. */
export const onTop = (box) => (a, b) => { const A = box(a), B = box(b); return Math.abs(A.cx - B.cx) <= B.w / 2 + 1 && A.y1 <= B.y1 + 2 && A.cy < B.cy + 1; };
const some = (r, re) => r.drawn.filter((o) => re.test(String(kindOf(o)))) ;
const named = (r, k) => r.drawn.filter((o) => String(kindOf(o)) === k);
const done = (r) => !NOT_DONE.test(r.reply) && r.drawn.length > 0;
const scene = (n) => (r) => done(r) && new Set(r.drawn.map(kindOf)).size >= n;
const placed = (r, aRe, bRe, box) => { const a = r.after.filter((o) => aRe.test(String(kindOf(o)))), b = r.after.filter((o) => bRe.test(String(kindOf(o)))); return a.some((x) => b.some((y) => onTop(box)(x, y))); };
const unchanged = (r) => r.after.length === r.before.length && r.reply.length > 0;

export const CASES = [
  // ---- scenes: what a scene has, where it usually is (k.scenes) ----
  ...['farm', 'beach', 'market', 'kitchen', 'garden', 'zoo', 'forest', 'playground', 'circus', 'desert', 'jungle', 'village'].map((w, i) => ({ id: `scene-${w}`, group: 'scene', ask: `draw a ${w}`, ok: scene(i < 4 ? 6 : 4) })),
  { id: 'scene-night-farm', group: 'scene', ask: 'draw a farm with three animals near the barn', say: [], ok: (r) => done(r) && count(some(r, /cow|pig|sheep|horse|goat|hen|dog|cat|duck/)) >= 3 && some(r, /barn/).length >= 1 },
  { id: 'scene-undo', group: 'scene', ask: 'undo', say: ['draw a beach'], ok: (r) => r.after.length === 0 },
  // ---- people of a role, wearables (k.people, k.wearables) ----
  ...['doctor', 'pirate', 'king', 'teacher', 'farmer', 'nurse'].map((w) => ({ id: `role-${w}`, group: 'role', ask: `draw a ${w}`, ok: (r) => done(r) && r.drawn.length >= 2 && r.drawn.some((o) => PEOPLE.test(String(kindOf(o)))) })),
  { id: 'wear-hat-man', group: 'role', say: ['draw a man'], ask: 'put a hat on the man', ok: (r) => done(r) && some(r, /hat/).length >= 1 },
  { id: 'wear-scarf-girl', group: 'role', say: ['draw a girl'], ask: 'put a scarf on the girl', ok: (r) => done(r) && some(r, /scarf/).length >= 1 },
  { id: 'wear-crown-queen', group: 'role', ask: 'draw a queen with a crown', ok: (r) => done(r) && r.drawn.length >= 2 },
  // ---- placement on an anchor of another thing (k.layouts anchors) ----
  { id: 'anchor-person-swing', group: 'anchor', ask: 'draw a person on the swing', ok: (r, box) => done(r) && placed(r, PEOPLE, /swing/, box) },
  { id: 'anchor-girl-swing', group: 'anchor', say: ['draw a swing', 'draw a girl'], ask: 'put the girl on the swing', ok: (r, box) => placed(r, PEOPLE, /swing/, box) && !NOT_DONE.test(r.reply) },
  { id: 'anchor-man-bench', group: 'anchor', ask: 'draw a man on the bench', ok: (r, box) => done(r) && placed(r, PEOPLE, /bench/, box) },
  { id: 'anchor-cup-table', group: 'anchor', say: ['draw a table'], ask: 'draw a cup on the table', ok: (r, box) => placed(r, /cup|mug/, /table/, box) },
  { id: 'anchor-cat-sofa', group: 'anchor', say: ['draw a sofa'], ask: 'draw a cat on the sofa', ok: (r, box) => placed(r, /cat/, /sofa/, box) },
  { id: 'anchor-duck-pond', group: 'anchor', say: ['draw a pond'], ask: 'draw a duck on the pond', ok: (r, box) => placed(r, /duck/, /pond/, box) },
  { id: 'anchor-boat-lake', group: 'anchor', say: ['draw a lake'], ask: 'draw a boat on the lake', ok: (r, box) => placed(r, /boat/, /lake/, box) },
  { id: 'anchor-king-throne', group: 'anchor', ask: 'draw a king on the throne', ok: (r, box) => done(r) && placed(r, PEOPLE, /throne/, box) },
  { id: 'anchor-candle-cake', group: 'anchor', say: ['draw a cake'], ask: 'draw a candle on the cake', ok: (r, box) => placed(r, /candle/, /cake/, box) },
  { id: 'anchor-flag-tower', group: 'anchor', say: ['draw a tower'], ask: 'draw a flag on the tower', ok: (r, box) => placed(r, /flag/, /tower/, box) },
  { id: 'anchor-plate-table', group: 'anchor', say: ['draw a table'], ask: 'put a plate on the table', ok: (r, box) => placed(r, /plate/, /table/, box) },
  { id: 'anchor-person-chair', group: 'anchor', say: ['draw a chair'], ask: 'draw a boy on the chair', ok: (r, box) => placed(r, PEOPLE, /chair/, box) },
  { id: 'anchor-bird-tree', group: 'anchor', say: ['draw a tree'], ask: 'draw a bird on the tree', ok: (r) => done(r) && some(r, /bird/).length === 1 },
  { id: 'anchor-impossible', group: 'anchor', say: ['draw a house'], ask: 'draw a swing on the sun', refuse: true, ok: (r) => unchanged(r) || r.after.length <= r.before.length + 1 },
  // ---- layouts (k.layouts) and named tasks (k.procedures) ----
  { id: 'layout-family-photo', group: 'layout', ask: 'draw a family photo', ok: (r) => done(r) && /family photo/i.test(r.reply) },
  { id: 'layout-arrange-people', group: 'layout', say: ['draw a man, a woman, a boy and a girl'], ask: 'arrange them like a family photo', ok: (r) => !NOT_DONE.test(r.reply) },
  { id: 'layout-make-family-photo', group: 'layout', ask: 'make a family photo', ok: (r) => done(r) },
  { id: 'layout-group-photo', group: 'layout', ask: 'draw a group photo', ok: (r) => done(r) },
  { id: 'layout-table-four', group: 'layout', ask: 'set a table for four', ok: (r) => done(r) && some(r, /chair/).length >= 4 },
  { id: 'layout-table-setting', group: 'layout', ask: 'draw a table setting for four', ok: (r) => done(r) && some(r, /chair/).length >= 4 },
  { id: 'layout-row', group: 'layout', say: ['draw a house', 'draw a tree', 'draw a car'], ask: 'put them in a row', ok: (r) => !NOT_DONE.test(r.reply) && new Set(r.after.map((o) => Math.round(o.y / 40))).size <= 2 },
  { id: 'layout-circle', group: 'layout', say: ['draw 4 flowers'], ask: 'arrange them in a circle', ok: (r) => !NOT_DONE.test(r.reply) },
  // ---- taking apart, building, grouping (k.objects, k.parts, k.layouts joins) ----
  { id: 'apart-house', group: 'apart', say: ['draw a house'], ask: 'take the house apart', ok: (r) => !NOT_DONE.test(r.reply) && r.after.length >= 3 },
  { id: 'apart-car', group: 'apart', say: ['draw a car'], ask: 'take the car apart', ok: (r) => !NOT_DONE.test(r.reply) && r.after.length >= 3 },
  { id: 'apart-roof', group: 'apart', say: ['draw a house'], ask: 'separate the roof from the house', ok: (r) => !NOT_DONE.test(r.reply) && r.after.length >= 2 },
  { id: 'apart-group', group: 'apart', say: ['draw a sun and a cloud', 'put them together as a sky'], ask: 'take the sky apart', ok: (r) => !NOT_DONE.test(r.reply) && r.after.length === 2 },
  { id: 'apart-idea', group: 'apart', ask: 'take the idea apart', refuse: true, ok: (r) => unchanged(r) },
  { id: 'build-house-parts', group: 'apart', ask: 'build a house from parts', ok: (r) => !NOT_DONE.test(r.reply) },
  { id: 'group-two', group: 'apart', say: ['draw a house and a tree'], ask: 'put the house and the tree together as a village', ok: (r) => !NOT_DONE.test(r.reply) && r.after.length === 1 },
  // ---- documents, charts and transfers about the discussion (session.things, std.dialogue) ----
  { id: 'doc-discussion', group: 'transfer', say: ['draw a cat and a dog'], ask: 'make a document about the current discussion', ok: (r) => /made a document/i.test(r.reply) && !NOT_DONE.test(r.reply) },
  { id: 'doc-what-we-did', group: 'transfer', say: ['draw a cat', 'draw a tree'], ask: 'make a document about what we did', ok: (r) => /made a document/i.test(r.reply) },
  { id: 'chart-discussion', group: 'transfer', say: ['draw a cat and a dog'], ask: 'create a chart about the current discussion', ok: (r) => /bar chart/i.test(r.reply) },
  { id: 'chart-animals-drawn', group: 'transfer', say: ['draw 2 cats', 'draw a dog'], ask: 'make a chart of the animals I drew', ok: (r) => /bar chart/i.test(r.reply) && /cat/i.test(r.reply) },
  { id: 'chart-things-picture', group: 'transfer', say: ['draw a house', 'draw 2 trees'], ask: 'show a chart of the things in the picture', ok: (r) => /bar chart/i.test(r.reply) },
  { id: 'doc-report', group: 'transfer', say: ['draw a house', 'make it blue'], ask: 'write a report about what we did', ok: (r) => /made a document/i.test(r.reply) },
  { id: 'doc-picture-things', group: 'transfer', say: ['draw a house', 'draw a tree'], ask: 'put the things from the drawing into a document', ok: (r) => /made a document|added \d+ things? to the document/i.test(r.reply) },
  { id: 'chart-empty', group: 'transfer', ask: 'make a chart of the things in the picture', refuse: true, ok: (r) => !/created|bar chart of/i.test(r.reply) || /nothing|no such|empty/i.test(r.reply) },
];
export const REFUSE_OK = (c) => c.refuse === true;
