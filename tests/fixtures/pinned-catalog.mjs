// SPDX-License-Identifier: AGPL-3.0-only
// The knowledge catalog folder at the pin (src/knowledge/catalog-pin.mjs), for tests that read catalog files: the build's own extraction (scripts/lib/catalog-pin.mjs),
// never the sibling working tree, whose head and uncommitted edits move independently of this repository.
import { pathToFileURL } from 'node:url';
import { pinnedCatalog } from '../../scripts/lib/catalog-pin.mjs';

/** file: URL of the pinned `docs/worlds` folder, with a trailing slash. */
export const PINNED_CATALOG = pathToFileURL(`${pinnedCatalog().dir}/`);
