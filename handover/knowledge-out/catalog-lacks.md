# What the catalog lacks for PSys2 (KNOWLEDGE-OUT step 4, for the knowledge repository)

Found by comparing the hand or generated kb files of PSys2 with the catalog checkout. Nothing here is kept as a private copy beyond this landing.

## Places (geo.map kb against k.geo)

- 137 of the 1,001 cities of `worlds/geo.map/kb.sop` have no k.geo city of the same name. Many are spelling variants of a city the catalog has under another name (Copenhagen, Bogota with its accent, Frankfurt am Main), the rest are real gaps: Andorra la Vella, San Miguel de Tucuman, Chittagong, Rajshahi, Santa Cruz de la Sierra, Guarulhos, Nova Iguacu, Duque de Caxias, Sao Bernardo do Campo, Osasco, Santo Andre, Contagem, Mississauga, North York, Scarborough, Abobo, Puente Alto, Foshan, Zhabei, Santiago de los Caballeros, Santo Domingo Oeste and Este (first 25; regenerate the full list with the comparison in worker-log).
- 16 of the 250 countries have no k.geo country of the same name (name variants): Antarctica, Aland Islands, Saint Barthelemy, DR Congo, Republic of the Congo, Ivory Coast, Cape Verde, Faroe Islands, South Georgia, Saint Martin, Macau, Saint Helena Ascension and Tristan da Cunha, Sao Tome and Principe, Turkiye, Vatican City, Wallis and Futuna. Wanted: `core.word` synonyms from the common names.
- The 38 regions of the map (the world, Europe, Asia ...) with a bounding box (`bb`), and country outlines: not in the catalog (the map keeps its own generated data).
- Country wires lack `code`, `cc` for some entries that the map uses for flags and neighbours (the map reads `nb=`; k.geo has `neighbour`).

## Arrangement

- `k.layouts.joins rel=around` (chairs around a table, a bench around a fire): none. The space module's `around` table (7 pairs) is gone with this landing.
- Face parts: the layout `face` has no flag saying which slots are the parts of the face proper (the reader takes the non-optional slots of one holds-word that are less than 30 high, so `neck` counts as a part).

## Kids facts stated as a child's book states them

- k.animals: habitat words (the old world said home, farm, savanna, polar regions; the catalog says house, desert, ...), foods as the book lists them, `cannot` for flightless birds (penguin is there; others missing), the plural class names, the `which animals are mammals` listing needs `class` on every animal.
- k.time: relative days (today, tomorrow, yesterday) need a clock, they stay in kids.time; `February has 28 days, 29 in a leap year` is one number in the catalog.
- k.shapes / k.colours: the primary colours as a list, `a stop sign is an octagon` (thing to shape), two usual colours of a thing (apples red and green).

## Found by step 5 (the Talk frames over the catalog)

- `k.shapes.shape.thing` (a stop sign is an octagon, a plate is a circle) is not in `vocab.json`: the vocabulary lists the names of a shape, not the values of `thing`, so a question "what shape is a stop sign" cannot find the shard from the thing. Wanted: the values of `thing` as keys of the shape shards (or `k.shapes.thing` wires keyed by the thing).
- `k.colours.colour kind=primary|secondary` exists only in the psys2 shard; the colour shard has no `kind`, so "is red a primary colour" needs the value `primary` found through the schema enum of `kind` (done in Talk) and every colour of a family should carry its kind.
- Habitat words of `k.animals.animal`: `house` and `ice` where a child's book says home and polar regions; the games and the editor map two of them (home, polar). A `core.word` synonym per habitat would let every host read "home".
- `k.animals.animal.can` / `cannot` for flightless birds other than the penguin (ostrich, emu, kiwi, dodo ... have no `cannot=fly`): "can an ostrich fly" answers "I don't know whether".
