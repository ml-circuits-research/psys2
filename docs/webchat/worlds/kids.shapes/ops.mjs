// Operations of kids.shapes (browser-safe: no imports).
//
// "Yes" and "no" are separate operations (…Yes / …No): an explicit "no" in the knowledge base or
// taught in the dialog (refuted) is a supported answer, a missing statement is `missing` (unknown).

const NS = 'kids.shapes';
const words = (s) => String(s).replace(/_/g, ' ');
const uniq = (a) => [...new Set(a)];
const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const missingKey = (type, k) => ({ status: 'missing', missing: [`${NS}.${type}.${k}`] });

// ---- is a <shape> a <kind> ------------------------------------------------------------------------
function holds(ctx, shape, kind, want) {
  if (!shape || !kind) return missingKey('family', 'holds');
  const ws = ctx.find(`${NS}.family`, { shape, kind });
  const yes = ws.filter((w) => ctx.val(w, 'holds') === true);
  const no = ws.filter((w) => ctx.val(w, 'holds') === false);
  if (yes.length && no.length) {
    return { status: 'conflicting', alternatives: ['yes', 'no'], from: ws.map((w) => w.id), note: 'different statements' };
  }
  const hit = want ? yes : no;
  if (!hit.length) return missingKey('family', 'holds');
  const because = want ? undefined : hit.map((w) => ctx.val(w, 'because')).find(Boolean);
  return { status: 'supported', value: want ? 'yes' : 'no', from: hit.map((w) => w.id), ...(because ? { note: because } : {}) };
}
export const holdsYes = (ctx, { shape, kind }) => holds(ctx, shape, kind, true);
export const holdsNo = (ctx, { shape, kind }) => holds(ctx, shape, kind, false);

// ---- describe a shape ------------------------------------------------------------------------------
export function describeShape(ctx, { name }) {
  const ws = ctx.find(`${NS}.shape`, { name });
  if (!ws.length) return missingKey('shape', 'sides');
  const sides = ws.map((w) => ctx.val(w, 'sides')).find((v) => v !== undefined);
  const corners = ws.map((w) => ctx.val(w, 'corners')).find((v) => v !== undefined);
  if (sides === undefined && corners === undefined) return missingKey('shape', 'sides');
  const n = (v, word) => (v === 0 ? `no ${word}s` : `${v} ${word}${v === 1 ? '' : 's'}`);
  const bits = [];
  if (sides !== undefined) bits.push(n(sides, 'side'));
  if (corners !== undefined) bits.push(n(corners, 'corner'));
  const round = sides === 0 && corners === 0;
  const head = round ? 'a round shape' : 'a flat shape';
  return { status: 'supported', value: `${head} with ${joinAnd(bits)}.`, from: ws.map((w) => w.id) };
}

// ---- colors of things -------------------------------------------------------------------------------
function thingInfo(ctx, name) {
  const ws = ctx.find(`${NS}.thing`, { name });
  const colors = uniq(ws.flatMap((w) => ctx.vals(w, 'color')));
  const article = ws.map((w) => ctx.val(w, 'article')).find(Boolean);
  const nm = words(name);
  let display = nm;
  if (article === 'the') display = `the ${nm}`;
  else if (article === 'none') display = nm;
  else display = `${article === 'an' || (!article && /^[aeiou]/.test(nm)) ? 'an' : 'a'} ${nm}`;
  return { colors, display, from: ws.map((w) => w.id) };
}

export function colorOf(ctx, { name }) {
  if (!name) return missingKey('thing', 'color');
  const t = thingInfo(ctx, name);
  if (!t.colors.length) return missingKey('thing', 'color');
  return { status: 'supported', values: t.colors.map(words), note: t.display, from: t.from };
}

function colorCheck(ctx, name, asked, wantYes) {
  if (!name || !asked) return missingKey('thing', 'color');
  const t = thingInfo(ctx, name);
  if (!t.colors.length) return missingKey('thing', 'color');
  const yes = t.colors.includes(asked);
  if (wantYes === yes) {
    return { status: 'supported', value: wantYes ? 'yes' : t.colors.map(words).join(' or '), note: t.display, from: t.from };
  }
  return missingKey('thing', 'color');
}
export const colorYes = (ctx, { name, is_color }) => colorCheck(ctx, name, is_color, true);
export const colorNo = (ctx, { name, is_color }) => colorCheck(ctx, name, is_color, false);

// ---- color kinds --------------------------------------------------------------------------------------
function kindCheck(ctx, name, asked, wantYes) {
  const ws = name ? ctx.find(`${NS}.color`, { name }) : [];
  const kinds = uniq(ws.flatMap((w) => ctx.vals(w, 'kind')));
  if (!kinds.length || !asked) return missingKey('color', 'kind');
  if (kinds.length > 1) return { status: 'conflicting', alternatives: kinds, from: ws.map((w) => w.id) };
  const yes = kinds[0] === asked;
  if (wantYes === yes) return { status: 'supported', value: wantYes ? 'yes' : kinds[0], from: ws.map((w) => w.id) };
  return missingKey('color', 'kind');
}
export const kindYes = (ctx, { name, is_kind }) => kindCheck(ctx, name, is_kind, true);
export const kindNo = (ctx, { name, is_kind }) => kindCheck(ctx, name, is_kind, false);

// ---- mixing ---------------------------------------------------------------------------------------------
/** What two colors make; the order of the two colors does not matter. */
export function mixResult(ctx, { first, second }) {
  if (!first || !second) return missingKey('mix', 'result');
  const ws = [...ctx.find(`${NS}.mix`, { first, second }), ...ctx.find(`${NS}.mix`, { first: second, second: first })];
  const results = uniq(ws.map((w) => ctx.val(w, 'result')).filter(Boolean));
  if (!results.length) return missingKey('mix', 'result');
  if (results.length > 1) return { status: 'conflicting', alternatives: results, from: ws.map((w) => w.id) };
  return { status: 'supported', value: results[0], from: ws.map((w) => w.id) };
}

/** Which two colors make a color. */
export function mixRecipe(ctx, { result }) {
  const ws = result ? ctx.find(`${NS}.mix`, { result }) : [];
  if (!ws.length) return missingKey('mix', 'recipe');
  const recipes = uniq(ws.map((w) => `${words(ctx.val(w, 'first'))} and ${words(ctx.val(w, 'second'))}`));
  return { status: 'supported', value: recipes.join(' or '), from: ws.map((w) => w.id) };
}
