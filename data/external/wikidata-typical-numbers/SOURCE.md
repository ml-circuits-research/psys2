# SOURCE: Wikidata typical numbers

- URL: https://query.wikidata.org/sparql (Wikidata Query Service), https://www.wikidata.org
- Fetched: 2026-11-14 (User-Agent psys2-data-fetch/1.0, throttled to the endpoint's 1 request/minute).
- Licence: CC0 1.0 (Wikidata structured data, https://www.wikidata.org/wiki/Wikidata:Licensing).
- Subset: one CSV per property, `item, label, value, unit` (English labels; unit label from the quantity's unit; a quantity with several statements gives several rows). Each query was capped by LIMIT 1500, so a file is an arbitrary sample, not complete.
  - animals-mass (P2067), animals-length (P2043), animals-height (P2048), animals-lifespan (P2250), animals-speed (P2052): instance of taxon (Q16521). Height, lifespan and speed files are small because few taxa carry them with a unit.
  - buildings-height, structures-height (P2048): instance of a direct subclass of building (Q41176) / architectural structure (Q811979).
  - countries-population (P1082), countries-area (P2046), countries-elevation (P2044): instance of country (Q6256); countries-elevation has only 7 rows.
  - cities-population, cities-area, cities-elevation: instance of city (Q515), first 1,500 rows each; area units vary (e.g. hectare), check `unit` before use.
  - planets-mass (P2067), planets-radius (P2120): instance of a direct subclass of planet (Q634); the result is mostly exoplanets (units such as Jupiter mass), not the solar-system planets. A planets-area query returned nothing and was dropped.
- Values are unnormalised; use for typical ranges only after unit conversion.
