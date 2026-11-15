# Knowledge worlds catalog

This folder is served by GitHub Pages. Everything in it is generated or validated by the tools of the repository
(`npm test` checks it); do not edit `index.json`, `vocab.json`, `vocab-kinds.json` or `LICENSES.md` by hand: run `node tools/build-catalog.mjs`.

**Three kinds of worlds** (names used in every repository and in the library's docs): a **world schema** says what
a kind of world is (its kinds of things, attributes, value types, acts, limits, rules and the words for them) and
holds no particular things: `w.seating` (a seating plan: tables, seats, guests). A **knowledge world** holds facts
about the world at large, true for everyone, with no session state: `k.animals` (a rabbit is a mammal; its young is
a kit), and `w.lang.en`, a knowledge world about English. A **live world** is one running instance of a world schema
in a session (the tables a user made, their seats, the focus, the history and undo); a tab shows it through a view.
This repository holds world schemas (`w.*`) and knowledge worlds (`k.*`, `w.lang.en`), never live worlds; the
library's modules (`std.*`: acts, fill, focus, relations, turn, know, grammar) are mechanisms, not worlds.

## Files

- `k.<world>/schema.sop`: the world as a sopworld module (`core.module name=k.<world>`): types, slots, rules, soft
  rules (`core.deny … soft=true`), and `core.word` facts for its vocabulary. Types and slots are all under
  `k.<world>.`; matrix ids are written fully qualified (`@k.objects.part.name`) so that loading the module through
  `imports=` (ids unchanged) or `core.use` (ids prefixed) never clashes with the application's ids.
- `k.<world>/shards/<key>.sop`: facts only, at most about 2,000 wires and 300 kB each. Each starts with a header
  (`# sources:`, `# license:`, `# script:`) and every wire carries `core.source="<source id> <version>"`.
- `k.<world>/shards/derived*.sop`: **generated** (`tools/derive.mjs`, in `npm run build`): what the rules of the
  module derive from the told facts, each wire with `derived=true` and `core.source="rule <rule id>"`, so that a
  host or a tool that reads shards sees them without running the rules. A test keeps them fresh.
- `k.<world>/WORLD.md`: what the world knows, its sources, and questions it helps with.
- Shared modules with no facts of their own: `k.kinds` (`is_a`, and `kind_of` by its rules), `k.drawing` (parts and
  points of a drawing), `k.named` (the slot `named=model`, taken by <!--n:named-takers-->21<!--/n--> types through `extends=k.named.labelled`, a
  slot group of sopworld 0.34+). A world that takes one imports it. An approximate key (`moons_about`) and its exact
  twin (`moons`) exclude each other on the slot (`excludes=`), not by a rule. The joins to drawings (`drawing=`, <!--n:slots:drawing-->12<!--/n--> slots
  of <!--n:slot-worlds:drawing-->9<!--/n--> worlds) are declared `type=k.objects.object by=name` (sopworld 0.60+: open while no object is loaded, checked
  when objects are; `world.check()` lists those still open), and a test checks them all again. A host that loads
  object shards lazily tells the shard of a thing's drawing before the thing, or loads the thing first: a reference
  told after some objects but before its own is refused (questions.md Q49). The stand-ins of k.objects name drawings
  of other shards of the same world and keep an undeclared join.
- `w.<name>/schema.sop`: a **reusable world**: a schema in the library's `std.schema` format (kinds, attributes, the
  acts that apply, words), data only; `w.<name>/WORLD.md` says how to load it. Listed under `schemas` in `index.json`
  (`names`: the words that find it; `kinds` with their `acts`, `attributes` and `words`). They are validated with
  the same sopworld build as the knowledge worlds, the commit in `sopworld`.
- `index.json`: the catalog.
- `vocab.json`: lowercased English lemma → shard ids.
- `LICENSES.md`: the terms and attribution text of every source, generated with the catalog.

## index.json

```json
{ "version": "<content hash>", "sopworld": "05d2f93",
  "worlds": [ { "id": "k.objects", "version": "1", "schema": "k.objects/schema.sop",
                "exports": ["k.objects.object", "k.objects.part"], "depends": ["k.commonsense"],
                "shards": [ { "id": "k.objects/shards/buildings", "path": "k.objects/shards/buildings.sop",
                              "wires": 40, "bytes": 3000, "keys": ["house", "roof"],
                              "sources": ["hand-core-1"], "license": "CC0-1.0", "warnings": [] } ],
                "sources": ["hand-core-1"], "licenses": ["CC0-1.0"], "warnings": [] } ] }
```

- `version`: a hash of every file in this folder except the generated ones (`index.json`, `vocab.json`, `LICENSES.md`). Pin it; cache shards by it.
- `sopworld`: the sopworld commit every file was validated with.
- World `version`: the schema's version (`version=` on its `core.module` wire); a breaking schema change raises it.
- `exports`: the types other modules may read. `depends`: worlds whose schemas must be in the same library.
- Shard `keys`: the identity values of its wires (lowercased). `sources`: the `core.source` values, as `<id>-<version>`.
  `license`: the shard's terms (a shard keeps its source's terms). Only licences of the allowlist in
  `tools/lib/licenses.mjs` are published (CC0, public domain, MIT, BSD, Apache, MPL, WordNet, CC BY, ODbL, CC BY-SA,
  CDLA; never non-commercial, no-derivatives, research-only or unknown), and a share-alike licence is alone in its file.
- World `data` (KR1 item 6): the folders of data files that are not SOP (the TSV dictionaries of `w.lang.en` and
  `w.lang.ro`), one entry per folder: `id`, `path`, `format` (`tsv`), `files`, `bytes`, `sources`, `license` (one
  licence per folder: the UniMorph-derived `w.lang.ro/dictionary-unimorph` is CC-BY-SA-3.0, apart from the CC0
  `dictionary`). The world's `sources` and `licenses` include them.
  `warnings`: what sopworld noted when loading it (no shard is published with errors).

## vocab.json

`{ "chimney": ["k.objects/shards/buildings"], "capital": ["k.geo/schema.sop"], ... }`. Built from the `text=` of
`core.word` facts and from the identity values of the shard wires. A word for a value points to shard ids (the path
without `.sop`); a word for a type or a key of a world ("capital", "synonym", "colour") points to the world's schema
path (`k.<world>/schema.sop`): it says the world is relevant, and the other words of the message pick the shards. A
host translates a message to English, lemmatises it, looks each lemma up, and fetches only those shards.
The shards of a word are sorted, except that a shard the word reaches only through a reading that needs a context
comes after the others: a given name with `context=person` (Rose, Hope, May) puts its names shard last for that word,
so a host that fetches the first shards of "rose" fetches the flower's. A keyword (`k.objects.keyword`, the tags an
image library files a drawing under, Q67) also comes last: "ship" reaches the ship's shard before the anchor's.

## vocab-kinds.json

The same words and shards, grouped by what the word names there: `{ "back": { "k.body.part": [...],
"k.geo.river": ["k.geo/shards/north-america"], ... }, "peking": { "k.geo.city": ["k.geo/shards/aliases"] },
"capital": { "k.geo.country.capital": ["k.geo/schema.sop"] } }`. The kind is the type of the wire whose identity
value the word is, the type of the key a `core.word` gives another word for (`of=`), the type or key a word of a
schema means, the type that holds it as a search word (`k.objects.keyword`: a drawing the word is only a keyword of),
or the reusable world (`w.seating`) its words name. A reader that cannot resolve rivers or mountains
skips those kinds before it fetches anything. One line per word; a host that does not need it never loads it.

## Using them

See `../index.html` for a JavaScript example, and PLAN.md §2 in the repository for the contract.
