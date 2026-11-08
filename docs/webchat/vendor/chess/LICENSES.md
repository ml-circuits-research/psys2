# Licences of the chess host libraries

Everything in this folder is used by the chess tab only (`docs/webchat/ui/tabs/chess.mjs`). Game rules live in the world
(`worlds/games.chess/`, chess.js); these files only draw the board and run the engine in a Web Worker. All licences are
compatible with GPL-3.0 (the licence of this project).

| File | What | Version | Source | Licence |
| --- | --- | --- | --- | --- |
| `chessground.mjs` | Chessground board UI (one bundled ES module) | @lichess-org/chessground 10.1.1 | https://github.com/lichess-org/chessground | GPL-3.0-or-later |
| `chessground.css` | Chessground base CSS + `cburnett` piece set (embedded SVG) | @lichess-org/chessground 10.1.1 assets | https://github.com/lichess-org/chessground | base CSS GPL-3.0-or-later; pieces by Colin M.L. Burnett, GPL-2.0-or-later (also offered under BSD and GFDL on Wikimedia Commons) |
| `stockfish-19-lite-single.js` + `.wasm` | Stockfish.js 19, lite NNUE, single-threaded (needs no cross-origin isolation); loaded as a Web Worker | stockfish 19.0.1 (npm) | https://github.com/nmrugg/stockfish.js , engine: https://github.com/official-stockfish/Stockfish | GPL-3.0 |
| `LICENSE-GPL-3.0.txt` | GPL-3.0 text shipped with the stockfish package | | | |

The chess.js rules library (BSD-2-Clause, Jeff Hlywa) is vendored inside the world as `worlds/games.chess/vendor/chess.mjs`
with its licence in `worlds/games.chess/vendor/LICENSE-chess.js.txt`.

The board squares and highlights are drawn by `docs/webchat/ui/tabs/chess/chess.css` (own code); the piece SVGs are the only
third-party artwork. Stockfish is stored unmodified as published in the npm package; the source is at the URLs above.
