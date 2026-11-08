# Vendored third-party code (browser host only)

Each library is bundled into one file (or one folder for multi-file assets) with a header naming the library, version, source and licence. The engine and the worlds never depend on these files, except the rule libraries vendored inside worlds (listed at the end). All licences are compatible with the project's GPL-3.0.

| Folder / file | Library | Version | Licence | Used by |
| --- | --- | --- | --- | --- |
| `dicebear-core.mjs`, `dicebear-styles/` (`voxel-bot.json`, `open-peeps.json`, `moods.json`) | DiceBear core; styles voxel-bot, open-peeps, moods | 10.7.0 / 10.6.0 | MIT / CC0 1.0 | Avatar tab |
| `editor/` | TipTap + ProseMirror (and linkifyjs, orderedmap, rope-sequence, w3c-keyname) | 3.33.0 | MIT | Editor tab |
| `chess/` | chessground (cburnett pieces), Stockfish 19 lite single-threaded (JS + WASM) | see `chess/LICENSES.md` | GPL-3.0 | Chess tab |
| `music/` | Tone.js, abcjs | 15.1.22 / 6.7.2 | MIT | Music tab |
| `map/` | Leaflet; Natural Earth outlines; GeoNames places | 1.9.4 | BSD-2 / public domain / CC BY 4.0 | Map tab (OSM tiles online: ODbL, attributed) |
| `charts/` | Chart.js, @kurkle/color | 4.6.1 / 0.3.4 | MIT | Charts tab |
| `draw/` | rough.js | 4.6.6 | MIT | Drawing tab |

Rule libraries vendored inside worlds (so C2 reasoning stays deterministic and testable): `worlds/games.chess/vendor/chess.mjs` (chess.js, BSD-2), `worlds/media.music/vendor/tonal.mjs` (tonal, MIT). World data: `worlds/geo.map` (GeoNames CC BY 4.0, world-countries ODbL, country-json MIT; see its data README).

Details per folder are in each `LICENSES.md`.
