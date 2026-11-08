// Operations of kids.common (browser-safe: no imports).

/** "Hello", or "Hello, Ben" once the user has said their name. */
export function greet(ctx) { const n = readName(ctx); return { status: 'supported', value: n ? `Hello, ${n}` : 'Hello' }; }

/**
 * Name of the assistant. The avatar (ui.avatar) is the assistant's face and carries its name, so that name wins when the
 * world is loaded; otherwise the name of the entity e.assistant.
 */
export function assistantName(ctx) {
  const r = ctx.request('avatar.nameOf');
  return { status: 'supported', value: r?.status === 'supported' && r.value ? r.value : ctx.name('e.assistant') };
}

/** "my name is ben" -> "Ben" (each word capitalized; punctuation at the ends dropped). */
const properName = (s) => String(s ?? '').trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
/** The user's name is one fact: it lives in the profile world (user.profile, field "name") when that world is loaded, else in this world's state. */
function readName(ctx) {
  try { const r = ctx.request('prof.nameOf'); if (r?.status === 'supported') return r.value || ''; } catch { /* no profile world */ }
  return ctx.state?.userName || '';
}
function writeName(ctx, name) {
  try { const r = ctx.request('prof.setName', { name }); if (r?.status === 'supported') return; } catch { /* no profile world */ }
  ctx.state.userName = name;
}
/** The user introduces themselves: remember the name ("What is my name?"). */
export function meet(ctx, args) {
  const name = properName(args?.name);
  if (!name) return { status: 'unsupported', note: 'What is your name?' };
  const before = readName(ctx);
  writeName(ctx, name);
  return { status: 'supported', value: before && before !== name ? `Okay, I will call you ${name} from now on.` : `Nice to meet you, ${name}!` };
}
export function myName(ctx) {
  const n = readName(ctx);
  return { status: 'supported', value: n ? `Your name is ${n}.` : 'I do not know your name yet. Tell me: "my name is ...".' };
}

export function thanks() { return { status: 'supported', value: 'You are welcome' }; }

export function bye() { return { status: 'supported', value: 'Goodbye' }; }
