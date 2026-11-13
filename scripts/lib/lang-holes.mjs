// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The cases of the holes of English (handover/lang.en: relative clauses, "some of", "the other one", "or", negated acts, temporal prepositions), training/eval/lang-holes.jsonl.
 * One case = { id, hole, world, tab, setup: [messages], message, expect } in the expectation vocabulary of scripts/lib/operational-check.mjs; each runs in a fresh rules-mode session.
 * `runHoleCases()` returns one row per case ({ id, hole, text, tab, outcome: right | wrong, happened, expected }); scripts/eval-lang-holes.mjs prints them per hole and
 * scripts/update-cases.mjs (source `holes`) records them in the case corpus, so a hole closing (wrong > right) or a case breaking (right > wrong) is visible.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { createEngine } from '../../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../../src/dialog/runtime-config.mjs';
import { evaluateCase } from './operational-check.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const HOLES_FILE = join(REPO, 'training/eval/lang-holes.jsonl');

export const readHoleCases = (file = HOLES_FILE) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

export async function runHoleCases({ file = HOLES_FILE, only = null } = {}) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const rows = [];
  for (const c of readHoleCases(file)) {
    if (only && !only.includes(c.hole) && !only.includes(c.id)) continue;
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    s.setWorldState('ui.shell', { activeTab: c.tab });
    for (const m of c.setup ?? []) await s.send(m);
    const before = JSON.parse(JSON.stringify(s.state()));
    let reply = null, error = null;
    try { reply = await s.send(c.message); } catch (e) { error = e.message; }
    let outcome = 'wrong', happened = error ? `(error) ${error}` : '(no reply)';
    if (reply) {
      const text = reply.trace?.replyEnglish ?? reply.text;
      const items = evaluateCase(c, { before, after: s.state(), replyText: text, message: c.message, effects: reply.effects ?? [], statuses: reply.statuses, unparsedAll: reply.segments.length === 0 });
      const bad = items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`);
      outcome = bad.length ? 'wrong' : 'right';
      happened = `${text.replace(/\s+/g, ' ').slice(0, 220)}${bad.length ? ` [check: ${bad.join(' ')}]` : ''}`;
    }
    rows.push({ id: c.id, hole: c.hole, text: c.message, tab: c.tab, outcome, happened, expected: JSON.stringify(c.expect), setup: c.setup?.length ?? 0 });
  }
  return rows;
}
