// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar (spec 21): the operations that are not acts: the name, a moment of the stage (wave, nod, dance ...), the host hook `needs`, and what other worlds call
// (avatar.nameOf, avatar.setPartUnknown). The face itself is changed by the acts of the schema (hooks.mjs). Browser-safe.
import * as F from './facelogic.mjs?v=abf9e9023a';
import { DEFAULT_FACE } from './default-face.mjs?v=f21fba5192';

export const ok = (value) => ({ status: 'supported', value });
export const no = (note) => ({ status: 'unsupported', note });
export const DEFAULT_NAME = 'PSys2';
/** The faces of the catalog, else the bundled default face: the avatar always has a face. */
export const dataOf = (ctx) => ctx.knowledge?.peekFaces?.() ?? DEFAULT_FACE;
export const ensure = (ctx) => { ctx.state.name = typeof ctx.state.name === 'string' && ctx.state.name ? ctx.state.name : DEFAULT_NAME; return ctx.state; };

/** The engine seeds the state of a tool world at the start of a session: the avatar has its name before anything is said. */
export function initialState() { return { name: DEFAULT_NAME }; }

/** Host hook: what the world needs from the catalog before an operation runs. */
export function needs() { return ['faces']; }

export const setName = (ctx, { name } = {}) => {
  const n = String(name ?? '').trim().replace(/[.!?]+$/, '');
  const me = /^me\s+(?:as\s+|by\s+|the name\s+)?(\S.*)$/i.exec(n);   // "call me Andy" names the user, not the avatar
  if (me) { const r = ctx.request('chat.meet', { name: me[1] }); if (r?.status === 'supported') return ok(r.value); }
  if (!n) return no('What should my name be?');
  if (n.length > 40) return no('That name is too long for me.');
  ensure(ctx).name = n;
  return ok(`Nice! From now on my name is ${n}.`);
};
export const askName = (ctx) => ok(`My name is ${ensure(ctx).name}.`);
/** The bare name: the assistant and the avatar are one character, so kids.common reads it through ctx.request('avatar.nameOf'). */
export const nameOf = (ctx) => ok(ensure(ctx).name);
/** A moment of the stage (wave, nod, dance, wink ...): an effect of the host, not stored state. */
export const animate = (ctx, { anim } = {}) => {
  const name = String(anim ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!name) return no('I do not know how to do that.');
  if (/^(wink|blink)$/.test(name)) { const d = dataOf(ctx); if (d) return F.faceMood(ctx, { mood: 'wink' }, d); }
  ctx.effect('avatar.animate', { name });
  ctx.request('ui.openTab', { tab: 'robot' });
  return ok({ wave: 'I wave at you!', nod: 'I nod.', dance: 'I dance!', shake: 'I shake my head.', spin: 'Wheee!', jump: 'I jump!', bounce: 'I bounce!', wiggle: 'I wiggle.' }[name] ?? `OK, ${name}!`);
};
/** The drawing world hands "make your nose bigger" over when "your ..." names no object: { part, words: the size word }. */
export const setPartUnknown = (ctx, a = {}) => { ensure(ctx); return a.part ? F.faceResize(ctx, { words: a.part, dir: /small|tini|little|short|narrow|half/.test(String(a.words ?? '')) ? 'smaller' : 'bigger' }, dataOf(ctx)) : no('Which part?'); };
