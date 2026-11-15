// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE CATALOG PIN (P4, reviewer 2026-11-15 01:15; architecture review finding 4): the one commit of the knowledge catalog (sop-knowledge-worlds) this build uses.
 * The page reads the catalog at this commit (a versioned, immutable URL, not the moving GitHub Pages head); the bundled English (src/lang/en.facts.generated.mjs, its header
 * names the commit) and the generated schema worlds are built from it (`node scripts/build-lang-en.mjs --check` fails the webchat build when they are stale), and the real set
 * is measured on it (scripts/lib/catalog-pin.mjs makes the local checkout). The offline subsets (src/knowledge/bundled-*.mjs, the act verbs, the default face) are generated from it
 * too, their headers name the commit, and each script has a --check (scripts/lib/generated.mjs); build-lang-en runs them all. Moving to a newer catalog: edit `commit` here, run
 * `node scripts/build-lang-en.mjs` (no folder: the bundle, every bundled subset, every schema world), then re-measure the real set. Browser-safe: no `node:*`.
 */
export const CATALOG_PIN = Object.freeze({
  repo: 'https://github.com/ml-circuits-research/sop-knowledge-worlds',
  commit: '7ecf82db79603dc624885693c697cf9389e9219d',   // 2026-11-15 the catalog head (w.person, k.layouts outlines + shape frames, w.lang.ro reply/request templates, w.lang.en.fn, k.colours the one home of colour names, K3-K7, K10, w.list v4, sensitivity key): every generated file names it
  path: 'docs/worlds',
});

/** The versioned URL of the catalog folder at the pin (jsDelivr serves a GitHub commit immutably, with CORS). */
export const catalogUrl = (pin = CATALOG_PIN) => `https://cdn.jsdelivr.net/gh/${pin.repo.replace(/^https:\/\/github\.com\//, '')}@${pin.commit}/${pin.path}`;

/** The same folder at the same commit on raw.githubusercontent.com (immutable by commit, CORS `*`; checked 2026-11-15): the second mirror. */
export const rawCatalogUrl = (pin = CATALOG_PIN) => `https://raw.githubusercontent.com/${pin.repo.replace(/^https:\/\/github\.com\//, '')}/${pin.commit}/${pin.path}`;

/** The URL the page reads the catalog from first. */
export const KNOWLEDGE_URL = catalogUrl();
/** Every immutable source of the pinned commit, in the order they are asked (src/loaders/knowledge-source.mjs retries and falls back through them; one commit, so the texts are equal). */
export const KNOWLEDGE_URLS = Object.freeze([catalogUrl(), rawCatalogUrl()]);
