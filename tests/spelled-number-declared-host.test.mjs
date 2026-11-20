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
 const units=w=>w==='pixels'?{factor:1}:w==='cm'?{factor:37.7952755906}:w==='furlongs'?true:null;
 assert.equal(spelledNumberProof('150 pixels wide',units)?.value,150,'the canvas unit itself');
 assert.equal(spelledNumberProof('2 cm',units)?.value,75.590551,'a declared conversion');
 assert.equal(spelledNumberProof('3 furlongs',units),null,'a unit without a conversion');
});
