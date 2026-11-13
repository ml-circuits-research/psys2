# 17. Knowledge by lookup

Owner's rule (2026-11-13): the encoder and the rules learn the **shape** of a request; the knowledge worlds of sop-knowledge-worlds (`k.commonsense`, `k.objects`, `k.words`) supply the **words**, by lookup at run time. No training rows are made from the knowledge worlds and the encoder is not retrained for it. No model takes part in the lookup.

## 1. The catalog
- `src/knowledge/catalog.mjs` (DRAW-FROM-FACTS): shared access to drawable objects (`parseLine`, `parseShard`, `createCatalog`, `createFetchLoader`).
- `src/knowledge/facts.mjs` (this spec): `createFacts({ source })` over `vocab.json` (lemma -> shard ids) and the shards `<id>.sop` of the Pages tree `docs/worlds`. `thing(word)` tries the lemma candidates of the word (`lemmaCandidates`: plural forms, no vocabulary), loads **only the shards of the first lemma the vocabulary knows** (lazily, once, cached) and returns `{ name, loaded, objects (parts as the shared parser reads them), commonsense, senses (WordNet) }` or `null`. `peek(word)` is the settled lookup, readable synchronously (undefined = not looked up, null = not known). `countOf(thing, 'legs')` is the number a word sense states ("eight legs"), else the parts of the drawing (reported as a picture, not a fact).
- `src/loaders/knowledge-source.mjs`: where the files come from, a directory or the Pages URL (`PSYS2_KNOWLEDGE`, or `engine.setKnowledge(createFacts(...))`). **Without a catalog nothing here runs and the dialog is as it was.**

## 2. Frames (shape, not vocabulary)
`lang.know.*` phrase groups of `lang.common` hold the frame words; `lang.know(text)` (`src/interpreter/lang.mjs`) returns `{ kind, slot, part? }`: `define` ("what is a X", "tell me about X"), `count` ("how many P does a X have"), `made` ("what is a X made of"), `where` ("where does a X live"), `can` ("what can a X do"). The slot is 1 to 3 words and any noun fits, invented ones too. `art.draw` already has the open-slot frame "draw a X" (`arg.open`).

## 3. Who uses a hit (`src/dialog/knowledge-lookup.mjs`)
The frame decides the world; a hit decides only which knowledge is loaded; **a hit alone never moves a message to another world.**
1. **Question with no tab action.** A one-clause message with a knowledge frame, whose reading is none or leaves content words out (or respelled the thing: "candle" as "handle"), is answered by the conversation from the loaded shard (`meta.info.kind = 'knowledge'`). No hit: "I don't know what a blorp is." A frame the reading took whole and whose world answered `missing` (the animals world has not heard of the thing) is asked of the catalog after the operations ran; a hit replaces the "I don't know", no hit keeps the world's reply (it may offer to learn).
2. **Action that needs a thing.** A world may export `openSlots(ctx, { action, args })` (a host hook like `checkReferents`): the things of a reading it has no picture of. The host looks them up (and the content words the reading left out) before the operations run; operations read `ctx.knowledge.peek(name)`. `art.draw` registers a hit as a drawable thing from its parts (`registerKnown`) and draws it like any other; no hit: "I don't know how to draw a blorp yet."
3. **E2 veto.** `no-referent` asks the catalog before "I can't find ..."; with a hit the sentence says there is no X in the world yet but X is known (and keeps the offer to add); the plain refusal only without a hit.

## 4. Limits (measured, `training/results/knowledge-lookup-2026-11-13.md`)
Registration of a looked-up thing lives in the `art.draw` module for the page's life; a saved picture that names it needs the lookup again. "add a box shaped like a X" is not read by `diagram.sketch` (only "a diagram shaped like a X"). Parts of an imported emoji drawing are artwork, not anatomy, so counts come from word senses first. "tell me about X" is read by `media.music` as a song question when X is not a song.
