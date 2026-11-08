// Operations of kids.common (browser-safe: no imports).

/** "Hello", or "Hello, Ben" once the user has said their name. */
export function greet(ctx) { return { status: 'supported', value: ctx.state?.userName ? `Hello, ${ctx.state.userName}` : 'Hello' }; }

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
/** The user introduces themselves: remember the name for this session ("What is my name?"). */
export function meet(ctx, args) {
  const name = properName(args?.name);
  if (!name) return { status: 'unsupported', note: 'What is your name?' };
  const before = ctx.state.userName;
  ctx.state.userName = name;
  return { status: 'supported', value: before && before !== name ? `Okay, I will call you ${name} from now on.` : `Nice to meet you, ${name}!` };
}
export function myName(ctx) {
  return { status: 'supported', value: ctx.state?.userName ? `Your name is ${ctx.state.userName}.` : 'I do not know your name yet. Tell me: "my name is ...".' };
}

export function thanks() { return { status: 'supported', value: 'You are welcome' }; }

export function bye() { return { status: 'supported', value: 'Goodbye' }; }
