# SOURCE: ConceptNet 5.7 English assertions (7 relations)

- URL: https://conceptnet.io , file https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz ; paper Speer, Chin, Havasi, "ConceptNet 5.5", AAAI 2017.
- Fetched: 2026-11-14.
- Licence: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as stated by ConceptNet (https://github.com/commonsense/conceptnet5/wiki/Copyright-and-Licensing). ShareAlike: keep this folder separate with this note and the attribution "ConceptNet 5 (conceptnet.io), derived in part from Open Mind Common Sense, Wiktionary, WordNet and other sources"; an importer must carry the licence with anything derived from it.
- Subset: `assertions-en.tsv` (136,622 rows, 16 MB) from the 34,074,917 assertions: relations UsedFor, CapableOf, HasPrerequisite, HasSubevent, AtLocation, MadeOf; both concepts English (`/c/en/`), edge weight >= 1.0 (drops weakly supported edges). Columns: relation, start term, end term (sense suffix dropped), weight, surface_text (when present), dataset (provenance). Candidate facts only; import after review.

## Addition 2026-11-15: HasProperty (reviewer [DATA] block 2026-11-15 06:55, knowledge repository Q80)

- Same URL, same licence (CC BY-SA 4.0) and same attribution as above. Streamed again on 2026-11-15.
- `hasproperty-en.tsv` (8,433 rows, 0.9 MB): relation HasProperty, both concepts English (`/c/en/`), edge weight >= 1.0. Same columns and same cut as `assertions-en.tsv`.
- The reviewer asked for a folder `data/external/conceptnet-5.7-en/` with CapableOf, MadeOf, HasProperty and UsedFor. That folder was not created, so nothing is stored twice: **use this folder** (`conceptnet-en/`). The four requested relations are the CapableOf, MadeOf and UsedFor rows of `assertions-en.tsv` plus `hasproperty-en.tsv`, 71,445 rows in all. The 2026-11-15 re-stream found the same row counts for the three older relations (CapableOf 22,677, MadeOf 545, UsedFor 39,790). For these four relations every English–English edge has weight >= 1.0, so the weight cut drops nothing.
