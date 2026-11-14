# What the catalog lacks for PSys2 (KNOWLEDGE-OUT step 4, for the knowledge repository)

Found by comparing the hand or generated kb files of PSys2 with the catalog checkout. Nothing here is kept as a private copy beyond this landing.

## Places (geo.map: the pilot reads k.geo by lookup; 2026-11-14, rewritten after the schema pilot)

The pilot world `worlds-pilot/geo.map` keeps no knowledge base: countries, cities, groups and the other names of countries are read from k.geo (`places.mjs`), rivers and mountains by the lookup of their name. What it still carries privately, for ONE landing, and what the catalog should hold instead:

- **Regions (38):** the bounding box of each continent, UN subregion and group (the map fits the view to it), the aliases people say ("east asia", "central africa", "the EU", "balkan") and the countries of two subregions the catalog has no word for (Central Europe, Southeast Europe): `worlds-pilot/geo.map/regions.mjs`. Wanted in k.geo: `k.geo.region` (name, kind, box, `core.word` aliases, members), and `region` values for every country that the UN geoscheme gives (the catalog has 21 values, no Central Europe / Southeast Europe; Caribbean has 28 members where the old table had 13).
- **Short and older names** that k.geo does not list as `core.word` of a place: Cluj (Cluj-Napoca), Peking (Beijing), Saint Petersburg / St. Petersburg, Frankfurt, Copenhagen (the catalog has København), Bombay-style names, "the UK", "the Netherlands" with its article. Accent-free spellings are NOT a lack: the reader folds the vocabulary (`foldedVocab`).
- **46 cities of the old table with no k.geo city of that name:** Andorra la Vella, San Miguel de Tucuman, Chittagong, Frankfurt am Main, Copenhagen, Santo Domingo Este, Port Said, Sevilla, St. George's, Camayenne, King Edward Point, Hagatna, City of Victoria, Kowloon, Karol Bagh, Basrah, Al Mawsil al Jadidah, Al Basrah al Qadimah, Erbil, New Kingston, Zarqa, South Tarawa, Astana, Ras Beirut, Benghazi, Fes, Sale, Ulan Bator, Saipan, Cuauhtemoc, Subang Jaya, Caloocan City, Ngerulmud, Saint Petersburg, Nizhniy Novgorod, Mecca, Sultanah, City of San Marino, Cockburn Town, Cankaya (mostly spelling variants of a city k.geo has under another name).
- **Country bounding boxes of countries with overseas parts** include the territories (France: west -61.79, south -21.37, east 55.84), so "show France" fits half the world; wanted: `west south east north` of the mainland (or a `core_box` next to the full box), and `lat` `lon` of the capital region. The outlines of countries (Natural Earth 50m, `docs/webchat/vendor/map/countries-50m.json`) and the label places (`places.json`) stay the tab's renderer data.
- **Facts that differ from the old table (the world's tests encoded the old ones):** the population of a city is the GeoNames metro figure for some (Tokyo 35.7 million, Paris 9.9 million; the old table gave the city proper, 8.3 million and 2.1 million); `capital_of` is set for Kyoto, so Japan "has 2 capitals", and South Africa has 4 (Johannesburg); the area of Vatican City is 0; Europe has 52 countries and territories where the old table had 45.
- **Demonyms** (adjective -> country: "Japanese", "Brazilians"): the map keeps a small table; wanted `k.geo.country.demonym` (many).
- **ISO2 code:** 4 territories have no `code2` (Somaliland, Indian Ocean Territories, Northern Cyprus, Ashmore and Cartier Islands); the tab matches outlines by it.
- **Parser (fixed in this landing):** keys with digits (`code2`) were invisible to the shared fact parser (`src/knowledge/catalog.mjs`), so every wire read through `thing()` / `wires()` lost them.

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

## geo.map ledger by mechanism (2026-11-14, build geo-map-switch rows): what only the catalog can give

Of the 43 rows, 41 are closed by general mechanisms in PSys2 (see docs/lessons.md "geo.map ledger by mechanism"); two need catalog words, and three kinds of word are the ones that made a local mechanism necessary:

- **Names**: `Peking` (Beijing; row n024); short alphabetic names of 2 letters (`EU`, `UK`, `US`) that the vocabulary reader skips (its minimum is 3 letters), so the map reads the aliases of its own `regions.mjs` for them (wanted: `core.word` for the groups and a rule that a 2-letter word of k.geo counts when written in capitals).
- **Coordination words**: `n` ("france n spain"), `&`, `plus`, `as well as` as joiners in `w.lang.en` (the splitter, the card cutter and `splitList` know `and`, `,`, `then`, `also`, `but`); row r2n125.
- **Kinds of a vocabulary key**: `back`, `out`, `away`, `north` ... are words of `k.values/directions`, `k.body` and `k.objects` as well as names in `k.geo` (a river `Back`). The vocabulary gives only the shard of a key, not its kind, so no reader can tell "pull back a bit" from the river. Wanted: the kind of each key (`core.word kind=` or the shard's type) in `vocab.json`; until then the map reads direction words by the zoom attribute of its schema (`less` / `more` words) before any place of the same spelling.
- **Verb `pin` / `flag` / `tag`** in `k.actions` (the acts lexicon has `mark`, not the verb forms of the nouns), and the demonyms already listed above (plural "Brazilians", "Japanese people").
