# 01 — SOP Lang v1

Normative summary of vision §2, plus the exact parser contract used by `src/soplang/`.

## Syntax

```
@wireId wireType key=value key=value ...
```

- A **declaration** (wire) starts with an unquoted `@` and ends right before the next unquoted `@` or at end of input. It may span any number of lines.
- `wireId` and `wireType` are **identifiers**: one or more segments `[A-Za-z_][A-Za-z0-9_-]*` joined by `.` (for example `b1`, `kids.arith.holding`, `legend.kids.arith`).
- An **entry** is `key=value` with no spaces around `=`. Keys are identifiers.
- A **value** is one of:
  - **string**: `"..."` with JSON string escapes (`\"`, `\\`, `\n`, `é`, ...). `@`, `$`, `=` inside strings are ordinary text.
  - **reference**: `$` followed by an identifier (`$b1`, `$legend.kids.arith`).
  - **atom**: any non-empty token without whitespace, `"`, `@`, `$`, `=` or `\` (`2kg`, `10N`, `true`, `kids.arith.holding.count`, `3.5`, `-4`).
- Tokens are separated by whitespace (spaces, tabs, newlines).
- There are **no comments** in v1. Use a `doc="..."` entry or a `core.note` wire.
- A repeated key is kept as several entries in order. Whether repetition is legal is decided by the legend (cardinality), not by the parser.

## Errors (no silent repair)
The parser rejects, with a character offset, line and column:
- text before the first `@` other than whitespace;
- a declaration without id or type;
- a token that is not `key=value` after the type;
- an empty value (`key=`), an unterminated string, a bad escape;
- an invalid identifier in id, type, key or reference;
- a duplicate wire id within one parse unit.

## Parser API (`src/soplang/index.mjs`)

```js
parse(text, { source }) -> { wires: Wire[], errors: ParseError[] }
// Wire = { id, type, entries: [{ key, value }], span: { start, end, line } , source }
// value = { kind: 'atom', v: '2kg' } | { kind: 'string', v: 'free text' } | { kind: 'ref', v: 'b1' }
// ParseError = { message, offset, line, column, source }
parseOrThrow(text, opts) -> Wire[]          // throws SopSyntaxError listing all errors
serialize(wires, { canonical }) -> string   // one wire per block, entries one per line, 4-space indent
get(wire, key) -> value | undefined         // first value
getAll(wire, key) -> value[]
```

**Canonical serialization** (for hashing and stable diffs): wires in input order; entries sorted by key, keeping the relative order of repeated keys; strings re-escaped with JSON escapes; atoms and references unchanged; `\n` line endings; trailing newline.

## Short and full keys
Keys may be written in short form (`mass`) inside a wire whose type is `phys.mech.body`; the legend layer (`src/legends`) resolves them to full keys (`phys.mech.body.mass`) against the type and its ancestors. A key that contains a dot is treated as full when it resolves, otherwise as short. Resolution is unambiguous or an error. The parser itself never resolves keys.

## Core keys (namespace `core`)
| Key | Meaning |
| --- | --- |
| `core.source` | Source record reference or locator (`"kids-story.txt#12-48"`), with exact span when known |
| `core.in` | Context (world, session, document, assumption branch) |
| `core.from` | Supporting wires (repeatable) |
| `core.via` | Operation or pattern id and version that produced the wire |
| `core.status` | `asserted`, `derived`, `candidate`, `retracted`, `supported`, `refuted`, `unresolved`, `conflicting` |
