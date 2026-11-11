# 01 — SOP Lang v1.1

Normative summary of vision §2, plus the exact parser contract used by `src/soplang/`. This is SOP Lang **v1.1**: the one language of facts, rule files and the consistency matrix, adopted from the sopworld library's "The language" (`docs/language.md`, library 0.6.1, vendored at `src/vendor/sopworld`). Every v1 text is a v1.1 text with the same meaning. There is one parser in the product: `src/soplang/` also reads the `matrix.sop` files, and `src/reasoner/` hands the library their wires.

## Syntax

```
@wireId wireType key=value key=value ...
```

- A **declaration** (wire) starts with an `@` at the start of a token and ends right before the next token that starts with `@`, or at end of input. It may span any number of lines; indentation has no meaning. An `@` anywhere else (inside a string, inside an atom such as `mail=ann@example.org`) is text.
- `wireId` and `wireType` are **identifiers**: one or more segments joined by single dots. The first segment is `[A-Za-z_][A-Za-z0-9_-]*`; a later segment may also start with a digit (`b1`, `kids.arith.holding`, `pat.kids.shop.price.q.2`, `legend.kids.arith`). `a..b`, `a.` and `1a` are not identifiers.
- An **entry** is `key=value` with no spaces around `=`. Keys are identifiers.
- A **value** is one of:
  - **string**: `"..."` with the escapes of JSON (`\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`) and no others. `@`, `$`, `=`, `?`, `#` inside strings are ordinary text, and a line end or tab may stand in a string as it is (it is stored, and serialized, as `\n`, `\t`). A string is a whole value: it starts right after the `=` and the token ends at its closing quote.
  - **reference**: `$` followed by an identifier (`$b1`, `$legend.kids.arith`), or `$?` followed by an identifier (`$?x`: the wire whose id the variable `?x` holds; `v` is `?x`).
  - **variable**: `?` followed by an identifier (`?i`, `?q.total`). Legal only in the wires that a rule, deny, relation, action or query names (patterns, templates, calcs); see "Variables".
  - **atom**: any other non-empty token without whitespace, `"` or `\`. It does not start with `$` or `?` (those start a reference or a variable). Because the first `=` of an entry decides where the value starts, an atom may start with `@` or `#` (`colour=#fff`, `k=@x`, as in the library), and `=`, `@`, `$`, `#` and `?` inside an atom are text: `2kg`, `10N/kg`, `3.5`, `-4`, `a=b`, `ann@example.org`, `10$`.
- Tokens are separated by whitespace (spaces, tabs, newlines).
- **Comments**: `#` where a token could start (between entries, between declarations, after the type) starts a comment that runs to the end of the line. A `#` inside a string or inside a token is text. (v1 had no comments.)
- A repeated key is kept as several entries in order. Whether repetition is legal is decided by the legend (cardinality), not by the parser.

## Variables
A variable `?name` is a placeholder bound by matching. It is only legal in a wire that a rule (`when=`, `not=`, `then=`, `with=`, `set=`, `add=`, `over=`, `remove=`), deny, relation, action or query names, and in `core.calc` wires. The parser accepts `?name` in any wire (it never looks at types); a **fact** that contains a variable is refused by the layers above: legend validation reports `a variable (?x) is only legal in a rule file, not in a fact`, and the library refuses it (`variable`). `?` never starts a declaration: `@p purchase qty=?q` declares a wire named `p` whose `qty` is the variable `?q`.

## Errors (no silent repair)
The parser rejects, with a character offset, line and column, and reports every error in the text:
- text before the first `@` other than whitespace and comments;
- a declaration without id or type;
- a token that is not `key=value` after the type;
- an empty value (`key=`), an unterminated string, a bad escape (`bad escape '\q'`, `bad \u escape`);
- an invalid identifier in id, type, key, reference or variable (`invalid variable '?1'`);
- text after the closing quote of a string, after a reference or after a variable;
- a quote or a backslash inside an unquoted atom (`a quote ... is not allowed in an unquoted value (quote the string)`);
- a duplicate wire id within one parse unit.

Differences from the library's `language.md`, kept on purpose: our messages keep the v1 wording (the tests and the editor show them), and we have no `lenient` mode; the library's wire form `{ id, type, attrs }` is produced from ours by `lib.writeValue` in `src/reasoner/`; a value directly followed by `@` (`k="x"@b t`) still ends the value and starts a declaration, as in v1.

## Parser API (`src/soplang/index.mjs`)

```js
parse(text, { source }) -> { wires: Wire[], errors: ParseError[] }
// Wire = { id, type, entries: [{ key, value }], span: { start, end, line } , source }
// value = { kind: 'atom', v: '2kg' } | { kind: 'string', v: 'free text' } | { kind: 'ref', v: 'b1' }
//       | { kind: 'var', v: 'i' }          // ?i ; `$?x` is { kind: 'ref', v: '?x' }
// ParseError = { message, offset, line, column, source }
parseOrThrow(text, opts) -> Wire[]          // throws SopSyntaxError listing all errors
serialize(wires, { canonical }) -> string   // one wire per block, entries one per line, 4-space indent
get(wire, key) -> value | undefined         // first value
getAll(wire, key) -> value[]
atom(v), str(v), ref(v), variable(v)        // value builders
```

**Canonical serialization** (for hashing and stable diffs): wires in input order; entries sorted by key, keeping the relative order of repeated keys; strings re-escaped with JSON escapes; atoms, references and variables unchanged; `\n` line endings; trailing newline. Comments are not kept.

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
