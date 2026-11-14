# SOURCE: Wikidata given names (English label, sex class, holder count)

- URL: https://query.wikidata.org/sparql (Wikidata Query Service), https://www.wikidata.org
- Fetched: 2026-11-14 (User-Agent `psys2-data-fetch/1.0`, one request per minute or slower).
- Licence: CC0 1.0 (https://www.wikidata.org/wiki/Wikidata:Licensing).
- File: `given-names.tsv`, header `name  sex  usage  qid`, 3,000 rows (1,609 male, 1,206 female, 185 unisex), about 79 KB, sorted by `usage` descending.
  - `name`: English label. `sex`: `male` (Q12308941), `female` (Q11879590) or `unisex` (Q3409032; also any item found in more than one of those classes). `usage`: number of items with `wdt:P735` (given name) pointing to the name, i.e. Wikidata humans carrying it. `qid`: the Wikidata item.
  - The generic class Q202444 'given name' was not queried on its own: items with a sex class are what the need requires, and the generic class is far larger and mostly unlabelled in English.
- Why not SSA: names.zip is blocked (403) to automated clients and 8 MB is more than this need justifies, so it was skipped.

## How it was cut

The direct query (count P735 holders per name over a whole class, `GROUP BY`, `ORDER BY DESC`) times out on the endpoint, so the cut is in two steps.

1. Candidates per class (one query per class; all returned complete under LIMIT 8000, so nothing was truncated):
   `SELECT ?n ?l ?s WHERE { ?n wdt:P31 wd:<CLASS> ; wikibase:sitelinks ?s . FILTER(?s>=6) ?n rdfs:label ?l . FILTER(LANG(?l)="en") }`
   Result: 1,702 male, 1,294 female, 183 unisex candidates (3,179 rows; a few items are in two classes).
2. Holder counts, in batches of 150-300 ids (first 795 ids with an equivalent `FILTER(?n IN (...))` form):
   `SELECT ?n (COUNT(?p) AS ?u) WHERE { { SELECT ?n ?p WHERE { VALUES ?n { wd:Q... } ?p wdt:P735 ?n } } } GROUP BY ?n`
3. Candidates with zero holders were dropped (this also removes non-name items such as people mistyped as given names); the top 3,000 by `usage` were kept (3,110 had holders).

## Notes

- The candidate filter is at least 6 Wikipedia/sitelinks, so a rare name with few sitelinks but some holders can be missing; the very bottom of the ranking (usage about 20) is therefore approximate. Common names are all present.
- `usage` is a Wikidata holder count, biased towards notable people and towards well-covered countries; it is not a population frequency.
- Labels are English-script labels as given by Wikidata (many are transliterated or non-English names such as `Takuya`).
