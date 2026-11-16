// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE PAGE'S KNOWLEDGE, FOR NODE (reviewer 2026-11-16 09:50): attaches the catalog at the pin to an engine exactly as the page does (docs/webchat/ui/engine-worker.mjs: createFacts over the
 * catalog, layered over the bundled subset), reading the site's own copy `docs/webchat/catalog/<pin>/` (no network), else the local checkout of the pin (scripts/lib/catalog-pin.mjs).
 * Used by `node src/cli.mjs chat` (default; `--no-catalog` runs without), by the probes (scripts/request-probe.mjs) and by any test that opts in: unit suites that do not need the
 * catalog never call it, so they stay fast.
 *
 *   const info = await attachPinnedCatalog(engine);   // { commit, short, bases, dir } ; engine.setKnowledge(...) is done
 *   console.log(catalogLine(info));                    // "catalog c9d5d0a9 loaded, 57 bases"
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_PIN, SITE_CATALOG } from '../../src/knowledge/catalog-pin.mjs';
import { createFacts } from '../../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../../src/loaders/knowledge-source.mjs';
import { createLayeredSource } from '../../src/knowledge/bundled-source.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The folder of the pinned catalog: the site copy when it is there, else the pinned checkout (made once, may need the network). */
export async function pinnedCatalogDir() {
  const site = join(REPO, 'docs/webchat', SITE_CATALOG());
  if (existsSync(join(site, 'index.json'))) return site;
  const { pinnedCatalog } = await import('./catalog-pin.mjs');
  return pinnedCatalog().dir;
}

export async function attachPinnedCatalog(engine) {
  const dir = await pinnedCatalogDir();
  const source = createKnowledgeSource(dir);
  const facts = createFacts({ source: createLayeredSource({ text: (p) => source.text(p).catch(() => null) }) });
  await facts.world?.('k.objects');   // the index, as the page's start-up step does
  engine.setKnowledge(facts);
  let bases = 0;
  try { bases = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).worlds.length; } catch { /* count unknown */ }
  return { commit: CATALOG_PIN.commit, short: CATALOG_PIN.commit.slice(0, 8), bases, dir, facts };
}

export const catalogLine = (info) => `catalog ${info.short} loaded, ${info.bases} bases`;
