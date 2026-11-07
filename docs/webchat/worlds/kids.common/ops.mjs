// Operations of kids.common (browser-safe: no imports).
//
// Besides the spec 04 ctx API these operations use one extra facility:
//   ctx.worlds() -> [{ id, title, status, doc }]   read-only list of the loaded worlds.
// It is implemented by the interpreter (src/interpreter/index.mjs) from the WorldSet.

export function greet() { return { status: 'supported', value: 'Hello' }; }

/** Name of the assistant entity (e.assistant). */
export function assistantName(ctx) { return { status: 'supported', value: ctx.name('e.assistant') }; }

export function thanks() { return { status: 'supported', value: 'You are welcome' }; }

export function bye() { return { status: 'supported', value: 'Goodbye' }; }

/** Titles of all loaded worlds except the bootstrap world `core`. */
export function capabilities(ctx) {
  const titles = ctx.worlds().filter((w) => w.id !== 'core').map((w) => w.title);
  return { status: 'supported', values: titles };
}
