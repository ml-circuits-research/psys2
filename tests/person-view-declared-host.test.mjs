// SPDX-License-Identifier: AGPL-3.0-only
// The view of the person (Settings > Privacy) is filled by the declared rows of worlds/app.project/person-view.sop;
// src/dialog/person-view.mjs names no type or slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/vendor/sopworld/sopworld.mjs';
import SCHEMA from '../worlds/app.project/person-view-schema-source.mjs';
import ROWS from '../worlds/app.project/person-view-source.mjs';
import { personView } from '../src/dialog/person-view.mjs';

test('the person view rows are valid declarations and the host names no w.person type', () => {
  const world = new World({ library: { 'app.person': SCHEMA } });
  assert.equal(world.tell(ROWS).ok, true);
  assert.doesNotMatch(readFileSync(new URL('../src/dialog/person-view.mjs', import.meta.url), 'utf8'), /w\.person|kids\.common/);
});

test('told facts fill the declared rows: the latest name, distinct languages, counts, a taste said again moves', () => {
  const view = personView({ person: { me: { name: 'Ana' }, lines: ['@p1 w.person.person age=7 language=en', '@r1 w.person.relative relation=child count=2',
    '@t1 w.person.taste thing="cats" stance=likes', '@t2 w.person.taste thing="dogs" stance=likes', '@t3 w.person.taste thing="cats" stance=dislikes', '@p2 w.person.person name="Bob"'] } });
  assert.deepEqual(view.map((r) => [r.label, r.values]), [['Name', ['Bob']], ['Age', ['7']], ['Languages', ['en']], ['Family', ['2 × child']], ['Likes', ['dogs']], ['Does not like', ['cats']]]);
  assert.deepEqual(personView(undefined), []);
});
