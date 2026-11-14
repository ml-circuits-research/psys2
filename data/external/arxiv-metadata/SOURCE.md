# SOURCE: arXiv metadata, 2,000 titles + abstracts

- URL: https://export.arxiv.org/oai2 (OAI-PMH, metadataPrefix=arXiv); policy at https://info.arxiv.org/help/license/index.html
- Fetched: 2026-11-14 (User-Agent psys2-data-fetch/1.0).
- Licence: "A Creative Commons CC0 1.0 Universal Public Domain Dedication will apply to all metadata." (arXiv metadata licence). The full texts have their own licences and are NOT included. Conservatively, records whose own per-article licence is NC or ND (by-nc-*, by-nc-nd) were excluded; the per-record `license` field is kept in the file.
- Subset: `abstracts-2000.jsonl`, 2,000 records `{id, set, categories, title, abstract, license, created}` from OAI sets cs 450, math 350, physics 350, q-bio 200, q-fin 150, stat 250, econ 100, eess 150, the first records returned for datestamps 2024-03-01..2024-09-30 per set; whitespace normalised, nothing else changed.
