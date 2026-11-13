/**
 * Browser loader. Takes a bundle { worlds: { id: { files: { 'world.sop': text, ... }, opsUrl } } }
 * (produced by scripts/build-webchat.mjs) and imports each world's ops module from its URL.
 * Browser-safe: no node:* imports.
 */
export function createBundleLoader(bundle) {
  const worlds = bundle?.worlds ?? {};
  return {
    async listWorlds() { return Object.keys(worlds); },
    async readFile(id, name) { return worlds[id]?.files?.[name] ?? null; },
    async loadOps(id) {
      const url = worlds[id]?.opsUrl;
      return url ? import(/* @vite-ignore */ url) : null;
    },
    async loadFns(id) {
      const url = worlds[id]?.fnsUrl;
      return url ? import(/* @vite-ignore */ url) : null;
    },
  };
}
