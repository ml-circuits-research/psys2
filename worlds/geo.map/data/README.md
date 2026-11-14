# Data of the world geo.map

Since the schema + acts switch (2026-11-14) the world keeps NO knowledge base: the places come by lookup from the catalog's `k.geo` (`places.mjs`). The table below records where the catalog's own data came from (it was built from these packages by `scripts/build-geo-data.mjs` when the world held the data); the offline outlines and label places in `docs/webchat/vendor/map/` stay the map tab's renderer data.

| Data | Package (version) | Licence | Used for |
| --- | --- | --- | --- |
| Countries: names, capitals, region, borders, area, currencies, languages, landlocked | world-countries 5.1.0 (mledoze/countries) | ODbL 1.0 (attribution and share-alike for the database) | `geo.map.country` wires |
| Country population | country-json 2.3.0 (country-by-population, about 2018 estimates) | MIT | `pop` of countries (Timor-Leste added by hand: World Bank 2018) |
| Cities | all-the-cities 3.1.0 (GeoNames gazetteer, https://www.geonames.org) | CC BY 4.0 (attribution required) | `geo.map.city` wires: 246 capitals, every city of 500,000+ people, Romanian and Moldovan cities of 30,000+ (1001 in all) |
| Country outlines (offline base map) | world-atlas 2.0.2 countries-50m (Natural Earth) | public domain | `docs/webchat/vendor/map/countries-50m.json`, bounding boxes of countries (`bb`) |
| Groups (EU, NATO, Nordic ...) | hand-written, as of 2024 | none | `geo.map.region` wires of kind `group` |

Every KB wire carries its source and licence in `core.source`. Population figures are rough and dated; city populations are GeoNames city-proper values (a few large cities are much smaller than their metro areas).

Counts: 250 countries and territories (194 independent), 1001 cities, 38 regions, 1464 lexicon names. Capitals without a GeoNames match (no city wire; the capital name is still known): EH:El Aaiún, IO:Diego Garcia, TK:Fakaofo.

Rebuild: `npm i world-countries@5.1.0 all-the-cities@3.1.0 country-json@2.3.0 world-atlas@2.0.2 topojson-client@3.1.0` in a temporary directory, then `node scripts/build-geo-data.mjs --modules <dir>/node_modules`.
