// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar: the operations of the one avatar, a face drawn from the parts of the knowledge world `k.faces` (worlds/ui.avatar/facelogic.mjs: the generic operations over
// slots; facedraw.mjs: the one renderer). The data comes from the catalog through the host (`ctx.knowledge.peekFaces()`, built by src/knowledge/faces.mjs before the
// operation runs: the world's `needs` hook says so); nothing about slots, variants or accessories is written in this world. State: { name, face }.
// Browser-safe: imports only its siblings.
import * as F from './facelogic.mjs?v=994c02d169';
import { DEFAULT_FACE } from './default-face.mjs?v=f21fba5192';

const ok = (value) => ({ status: 'supported', value });
const no = (note) => ({ status: 'unsupported', note });
const DEFAULT_NAME = 'PSys2';
/** The faces of the catalog, else the bundled default face (generated from k.faces: the default preset only): the avatar always has a face. */
const dataOf = (ctx) => ctx.knowledge?.peekFaces?.() ?? DEFAULT_FACE;
const ensure = (ctx) => { ctx.state.name = typeof ctx.state.name === 'string' && ctx.state.name ? ctx.state.name : DEFAULT_NAME; return ctx.state; };
const W = (fn) => (ctx, args = {}) => { ensure(ctx); return fn(ctx, args, dataOf(ctx)); };

// ---- host hook: what the world needs from the catalog before an operation runs --------------------------------------------------------------------------------
export function needs() { return ['faces']; }

// ---- the generic operations over slots ----------------------------------------------------------------------------------------------------------------------------
export const add = W(F.faceAdd);
export const remove = W(F.faceRemove);
export const bare = W(F.faceBare);
export const restyle = W(F.faceRestyle);
export const change = W(F.faceChange);
export const which = W(F.faceWhich);
export const colour = W(F.faceColour);
export const resize = W(F.faceResize);
export const move = W(F.faceMove);
export const mood = W(F.faceMood);
export const askMood = W(F.faceAskMood);
export const checkMood = W(F.faceCheckMood);
export const describeFace = W(F.faceDescribe);
export const describe = W(F.faceSelf);
export const has = W(F.faceHas);
export const parts = W(F.faceParts);
export const save = W(F.faceSave);
export const load = W((ctx, a, d) => F.faceLoad(ctx, a, d));
export const list = W(F.faceList);
export const surprise = W(F.faceSurprise);
export const reset = W(F.faceReset);
export const undo = W(F.faceUndo);
export const redo = W(F.faceRedo);
/** "become a woman": a preset of the catalog by name. */
export const preset = W((ctx, a, d) => (d ? (F.facePreset(ctx, String(a.kind ?? a.who ?? '').toLowerCase().replace(/^(?:a|an|the)_/, ''), d) ?? no(`I do not have a face like ${String(a.kind ?? a.who ?? '').replace(/_/g, ' ')}. Ask me "list the faces".`)) : no('I cannot reach the face catalog right now.')));

// ---- name and moves ---------------------------------------------------------------------------------------------------------------------------------------------------
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
export const setPartUnknown = W((ctx, a, d) => (a.part ? F.faceResize(ctx, { words: a.part, dir: /small|tini|little|short|narrow|half/.test(String(a.words ?? '')) ? 'smaller' : 'bigger' }, d) : no('Which part?')));
