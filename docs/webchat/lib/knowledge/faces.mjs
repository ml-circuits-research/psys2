// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The knowledge world `k.faces` (slots of a face with anchor boxes, variants with plain features, presets, expressions, colour names), read like `k.objects`: one file of SOP
 * wires per world, found through the knowledge source (src/loaders/knowledge-source.mjs). Browser-safe: no `node:*`.
 *
 *   const faces = createFaces({ source });   // source: { text(path) -> Promise<string|null> }, or none
 *   await faces.load();                      // reads k.faces/shards/faces.sop; when the catalog has none (or no network) the built-in stub stays in use
 *   faces.data                               // the parsed data (slots, presets, expressions, colours, synonyms), same shape as the stub of the avatar world
 *
 * `load()` also makes the data the one the avatar world draws (`useFaces`), so that the real world replaces the stub without another change.
 */
import { parseFaces, getFaces, useFaces } from '../../worlds/ui.avatar/facedata.mjs?v=129f43f6f1';

export const FACES_PATH = 'k.faces/shards/faces.sop';

export function createFaces({ source = null, path = FACES_PATH } = {}) {
  let loaded = null;
  const api = {
    get data() { return getFaces(); },
    /** The catalog's faces when it has them (every slot with at least one variant), else the stub; never throws. */
    async load() {
      loaded ??= (async () => {
        try {
          const text = source ? await source.text(path) : null;
          const d = text ? parseFaces(text) : null;
          if (d?.slots.length && d.slots.every((s) => s.variants.length)) { useFaces(d); return 'catalog'; }
        } catch { /* no network: the stub */ }
        return 'stub';
      })();
      return loaded;
    },
  };
  return api;
}
