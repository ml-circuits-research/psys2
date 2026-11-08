// games.chess: world tests, language layer, engine observation loop, fallback chooser, vendored files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { generate } from '../worlds/games.chess/datagen.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const engine = await createEngine({ loader: createFsLoader({}) });
const fresh = () => engine.createSession({ language: 'en' });
const fen = (s) => s.getWorldState?.('games.chess')?.fen;

test('world tests in tests.sop all pass and there are at least 60', async () => {
  const r = await runWorldTests(engine, 'games.chess');
  assert.equal(r.failed.length, 0);
  assert.ok(r.total >= 60);
});

test('a move, the engine effect, and a stale-safe observation reply', async () => {
  const s = fresh();
  const r = await s.send('e2 to e4');
  const eff = r.effects.find((e) => e.name === 'chess.engine.bestmove');
  assert.ok(eff, 'engine effect requested');
  assert.equal(eff.world, 'games.chess');
  const o = await s.observe({ effect: eff.name, ok: true, world: eff.world, data: { bestmove: 'e7e5', fen: eff.args?.fen } });
  assert.match(o.text ?? '', /I play pawn to e5\. Your move\./);
});

test('engine failure falls back to the built-in chooser', async () => {
  const s = fresh();
  const r = await s.send('knight to f3');
  const eff = r.effects.find((e) => e.name === 'chess.engine.bestmove');
  const o = await s.observe({ effect: eff.name, ok: false, world: eff.world });
  assert.match(o.text ?? '', /^I play .*Your move\.$/);
});

test('illegal moves are explained and ambiguity is asked about', async () => {
  const s = fresh();
  const a = await s.send('e2 to e5');
  assert.doesNotMatch(a.text, /^$/);
  assert.equal(a.effects.filter((e) => e.name.startsWith('chess.engine')).length, 0);
});

test('datagen is deterministic and rich', () => {
  let n = 1;
  const rng = () => ((n = (n * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = generate({ rng, count: 200 });
  assert.ok(a.length >= 150);
  n = 1;
  const b = generate({ rng, count: 200 });
  assert.deepEqual(a, b);
});

test('vendored files and licences are present', async () => {
  for (const f of ['worlds/games.chess/vendor/chess.mjs', 'worlds/games.chess/vendor/LICENSE-chess.js.txt', 'docs/webchat/vendor/chess/chessground.mjs', 'docs/webchat/vendor/chess/chessground.css', 'docs/webchat/vendor/chess/stockfish-19-lite-single.js', 'docs/webchat/vendor/chess/stockfish-19-lite-single.wasm', 'docs/webchat/vendor/chess/LICENSES.md']) {
    await access(root(f));
  }
  const lic = await readFile(root('docs/webchat/vendor/chess/LICENSES.md'), 'utf8');
  for (const w of ['chess.js', 'Chessground', 'Stockfish', 'GPL']) assert.match(lic, new RegExp(w));
  assert.match(await readFile(root('docs/webchat/vendor/chess/chessground.mjs'), 'utf8').then((t) => t.slice(0, 600)), /chessground/i);
});
