// KNOWLEDGE-OUT: a tab world holds no NEW general knowledge. Every kb fact type, code table and lexicon group of a world must be in the baseline of today's allowed items
// (tests/fixtures/knowledge-inventory-baseline.json, shrinking as moves land) and not bigger than the baseline says. Adding knowledge of the world at large to a world fails here:
// it belongs in the knowledge catalog. After a MOVE (an item deleted or smaller) run `node scripts/knowledge-inventory.mjs --update-baseline` so the baseline shrinks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, violations } from '../scripts/knowledge-inventory.mjs';

test('no new general fact, table or lexicon group appears in a world', () => {
  const v = violations(inventory());
  assert.deepEqual(v, [], `new or grown items (move them to the knowledge catalog, or if it is the world's own sample data mark it in scripts/knowledge-inventory.mjs SAMPLE):\n${JSON.stringify(v, null, 1)}`);
});
