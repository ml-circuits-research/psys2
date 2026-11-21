// SPDX-License-Identifier: AGPL-3.0-only
// The answer mode is the declared interaction.mode preference (worlds/app.project/interaction-preferences.sop) and its
// limits are declared per mode (interpretation-policy.sop app.interpret.mode).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interactionMode,modeLimits,statePreference,readPreferenceStatement,preferenceDefault,MODE_KEY,APP_PREFERENCES} from '../src/dialog/interaction-mode.mjs';
import {interpretationPolicy} from '../src/dialog/interpretation-policy.mjs';

const session=()=>({isession:{state:{}}});

test('interaction.mode: the declared default is fast, and fast takes the first acceptable path', () => {
 const s=session();
 assert.equal(preferenceDefault(MODE_KEY),'fast');
 assert.equal(interactionMode(s),'fast');
 const fast=modeLimits(s),thinking=interpretationPolicy().modes.thinking;
 assert.equal(fast.compare,1);assert.equal(fast.placement,'first');
 assert.ok(fast.retries<=1&&fast.fallbacks<=1&&fast.areas<=1);
 assert.ok(thinking.retries>fast.retries&&thinking.compare>fast.compare&&thinking.fallbacks>fast.fallbacks);
 assert.equal(thinking.placement,'optimise');
});

test('interaction.mode: a statement is a w.preferences.preference fact; the latest one is in force', () => {
 const s=session();
 assert.equal(statePreference(s,MODE_KEY,'thinking',{about:'the chat toggle'}),true);
 assert.match(s.isession.state[APP_PREFERENCES].sop,/w\.preferences\.preference key=interaction\.mode field=value value=thinking/);
 assert.equal(interactionMode(s),'thinking');
 assert.equal(modeLimits(s).placement,'optimise');
 statePreference(s,MODE_KEY,'fast');
 assert.equal(interactionMode(s),'fast');
 assert.equal((s.isession.state[APP_PREFERENCES].sop.match(/w\.preferences\.preference/g)??[]).length,1,'one value per field');
 assert.throws(()=>statePreference(s,MODE_KEY,'slow'),/undeclared-preference-value/);
});

test('interaction.mode: declared phrases state it, as whole words, and leave the rest of the message', () => {
 assert.deepEqual((({key,value,rest})=>({key,value,rest}))(readPreferenceStatement('Think harder!')),{key:MODE_KEY,value:'thinking',rest:''});
 assert.equal(readPreferenceStatement('take your time and draw a house with a garden').rest,'draw a house with a garden');
 assert.equal(readPreferenceStatement('be quick, add a cat').value,'fast');
 assert.equal(readPreferenceStatement('draw a fast car'),null);
 assert.equal(readPreferenceStatement('draw a quick brown fox'),null);
});
