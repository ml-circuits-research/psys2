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
/** Words that trail a name in speech ("Ioana, sorry", "Ben lol") and are no part of it. */
const NAME_TAIL = /(?:[\s,]+(?:sorry|lol|haha|hehe|please|pls|plz|thanks|thx|anyway|though|tho|now|again|ok|okay|btw|my bad))+$/i;
/** Words that make a "name" impossible: the pattern read a sentence ("I'm here", "never mind", "that's great") as an introduction. */
const NOT_A_NAME = new Set(['i', 'im', "i'm", 'am', 'is', 'are', 'was', 'here', 'there', 'back', 'done', 'sorry', 'wait', 'never', 'mind', 'no', 'not', 'yes', 'thanks', 'thank', 'lol', 'hmm', 'ok', 'okay', 'what', 'why', 'how', 'that', "that's", 'thats', 'this', 'it', "it's", 'its', 'fine', 'good', 'great', 'sure', 'ready', 'tired', 'happy', 'sad', 'hungry', 'bored', 'confused', 'lost', 'new', 'late', 'early']);
export function meet(ctx, args) {
  const cleaned = String(args?.name ?? '').replace(NAME_TAIL, '');
  const name = properName(cleaned);
  if (!name || name.split(/\s+/).some((w) => NOT_A_NAME.has(w.toLowerCase().replace(/[^\p{L}']/gu, '')))) return { status: 'unsupported', note: 'What is your name?' };
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

const HOWRU = ['I am fine, thank you!', 'I am doing well, thanks for asking!', 'I am great! What shall we do?'];
let howruTurn = 0;
/** Small talk ("how are you"): a friendly answer, rotating a little so it does not repeat. */
export function howAreYou() { return { status: 'supported', value: HOWRU[howruTurn++ % HOWRU.length] }; }
