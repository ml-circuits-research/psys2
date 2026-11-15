# SOURCE: Wikidata attributes of items linked to WordNet 3.1 synsets

- URL: Wikidata Query Service, https://query.wikidata.org/sparql (labels filled in from https://www.wikidata.org/w/api.php `wbgetentities`).
- Fetched: 2026-11-15.
- Licence: CC0 1.0 (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/ , which covers all structured data in Wikidata (https://www.wikidata.org/wiki/Wikidata:Licensing).
- How it was cut: items with a WordNet 3.1 synset ID (P8814), with their direct (truthy, `wdt:`) values for five properties. Each property was fetched with its own SPARQL query of this form:
  `SELECT ?syn ?item ?itemLabel ?value ?valueLabel WHERE { ?item wdt:P8814 ?syn . ?item wdt:<P> ?value . OPTIONAL English rdfs:label of item and value }`.
  P31 and P279 timed out as one query, so they were split into 16 queries by the first two digits of the synset ID (`00`–`15`). Labels are English (`en`). When an item has no `en` label, its multilingual default label (`mul`) is used, filled in through `wbgetentities` (580 labels). 16 item labels and 180 value labels are still empty: the entity has neither label, or the value is a literal or an unknown value. Duplicate (synset, item, value) triples were removed.
- File: `thing-attributes.tsv`: 84,380 rows, 5.8 MB, 35,557 distinct synsets, 34,660 distinct items. Sorted by property, synset, item, value. Columns: synset_id (P8814 value, e.g. `07889783-n`), item (QID), label, property (PID), property_label, value_item (QID), value_label.
- Rows per property: P462 color 422, P186 made from material 3,610, P366 has use 5,679, P31 instance of 39,955, P279 subclass of 34,714.
- Use P31/P279 to place an item in a taxonomy. Colour and material are sparse in Wikidata and sometimes not "typical" (a breed or a flag colour). Candidate facts only; import after review.
