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
  commit: '0966924e0a5bb7ad69d18590bb64b7a0204c151e',   // 2026-11-15 the catalog head: w.request, w.dialogue, k.expect, w.lang.en cues (spec 28); before 085bc0da (w.lang.ro.fn, frames and dictionary as data, plural categories, words shards, k.kinds arrangement; before: w.person, k.layouts outlines + shape frames, w.lang.ro reply/request templates, w.lang.en.fn, k.colours the one home of colour names, K3-K7, K10, w.list v4, sensitivity key): every generated file names it
  path: 'docs/worlds',
});

/** The versioned URL of the catalog folder at the pin (jsDelivr serves a GitHub commit immutably, with CORS). */
export const catalogUrl = (pin = CATALOG_PIN) => `https://cdn.jsdelivr.net/gh/${pin.repo.replace(/^https:\/\/github\.com\//, '')}@${pin.commit}/${pin.path}`;

/** The same folder at the same commit on raw.githubusercontent.com (immutable by commit, CORS `*`; checked 2026-11-15): the first external mirror. */
export const rawCatalogUrl = (pin = CATALOG_PIN) => `https://raw.githubusercontent.com/${pin.repo.replace(/^https:\/\/github\.com\//, '')}/${pin.commit}/${pin.path}`;

/**
 * THE SITE'S OWN COPY (reviewer 2026-11-15 09:10 item 2; questions.md Q33): `scripts/build-webchat.mjs` copies the files the app can load (index.json, vocab.json, every world's
 * schema and shards: 1,187 files) of the pinned folder to `docs/webchat/catalog/<commit>/`, so the page reads its catalog from its own origin (no CORS, no third-party CDN, no
 * shared rate limit; immutable: the commit is in the path). The folder relative to the site root; `siteCatalogUrl()` is its URL when this module is served over http (the page),
 * null otherwise (node: the scripts and tests read a local checkout or the external mirrors).
 */
export const SITE_CATALOG = (pin = CATALOG_PIN) => `catalog/${pin.commit}`;
export const siteCatalogUrl = (here = import.meta.url, pin = CATALOG_PIN) => (/^https?:/i.test(String(here)) ? new URL(`../../${SITE_CATALOG(pin)}`, here).href : null);   // lib/knowledge/ -> the site root

/**
 * Every immutable source of the pinned commit, in the order they are asked (src/loaders/knowledge-source.mjs retries, marks a dead mirror and falls back through them; one commit, so
 * the texts are equal): the site's own copy first (on the page), then raw.githubusercontent.com, then jsDelivr. jsDelivr is last: its /gh/ route refuses a repository past 50 MB
 * ("Package size exceeded the configured limit of 50 MB", live 2026-11-15, every shard of pin 085bc0da) and sop-knowledge-worlds is past it.
 */
export const knowledgeUrls = (here = import.meta.url, pin = CATALOG_PIN) => Object.freeze([siteCatalogUrl(here, pin), rawCatalogUrl(pin), catalogUrl(pin)].filter(Boolean));
export const KNOWLEDGE_URLS = knowledgeUrls();
/** The URL the page reads the catalog from first. */
export const KNOWLEDGE_URL = KNOWLEDGE_URLS[0];
