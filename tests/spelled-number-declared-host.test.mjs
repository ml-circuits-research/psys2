// A numeric property's value span spells one number (src/dialog/key-reader-value-proof.mjs spelledNumberProof).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spelledNumberProof} from '../src/dialog/key-reader-value-proof.mjs';

test('a value span spelling one number gives that number; a unit or two numbers give none',()=>{
 assert.equal(spelledNumberProof('size 45')?.value,45);
 assert.equal(spelledNumberProof('two hundred sixty')?.value,260);
 assert.equal(spelledNumberProof('-3.5')?.value,-3.5);
 assert.equal(spelledNumberProof('forty five')?.value,45);
 assert.equal(spelledNumberProof('5 by 3'),null,'two numbers');
 assert.equal(spelledNumberProof('150 pixels',w=>w==='pixels'),null,'a unit needs its own projection');
 assert.equal(spelledNumberProof('big'),null);
});
