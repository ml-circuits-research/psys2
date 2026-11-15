// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE CATALOG PIN (P4, reviewer 2026-11-15 01:15; architecture review finding 4): the one commit of the knowledge catalog (sop-knowledge-worlds) this build uses.
 * The page reads the catalog at this commit (a versioned, immutable URL, not the moving GitHub Pages head); the bundled English (src/lang/en.facts.generated.mjs, its header
 * names the commit) and the generated schema worlds are built from it (`node scripts/build-lang-en.mjs --check` fails the webchat build when they are stale), and the real set
 * is measured on it (scripts/lib/catalog-pin.mjs makes the local checkout). The offline subsets (src/knowledge/bundled-*.mjs) state a catalog world version only and have no
 * --check yet: regenerate them from the pinned checkout when the pin moves. Moving to a newer catalog: edit `commit` here, run `node scripts/build-lang-en.mjs` (no folder)
 * and the bundle scripts with the checkout's folder, then re-measure the real set. Browser-safe: no `node:*`.
 */
export const CATALOG_PIN = Object.freeze({
  repo: 'https://github.com/ml-circuits-research/sop-knowledge-worlds',
  commit: 'ab3b2ab868ba27868f88d2dbdfce3433a699ece6',   // 2026-11-14 22:09 "k.objects keywords as their own relation (Q67 b)": the commit en.facts.generated.mjs was generated from
  path: 'docs/worlds',
});

/** The versioned URL of the catalog folder at the pin (jsDelivr serves a GitHub commit immutably, with CORS). */
export const catalogUrl = (pin = CATALOG_PIN) => `https://cdn.jsdelivr.net/gh/${pin.repo.replace(/^https:\/\/github\.com\//, '')}@${pin.commit}/${pin.path}`;

/** The URL the page reads the catalog from. */
export const KNOWLEDGE_URL = catalogUrl();
