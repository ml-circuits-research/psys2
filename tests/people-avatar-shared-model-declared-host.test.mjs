// The Avatar is a view of the Drawing tab's person (owner direction 2026-11-20): one model of a person (a face and a
// body with clothes: k.faces styles plain and figure), composed and edited by the same rules (worlds/art.draw/
// person-rules.sop, look-rules.sop, look-projection.sop), drawn by the Drawing tab on the page and by the Avatar tab
// framed on the face (worlds/ui.avatar/view-projection.sop). A garment added to the people's knowledge therefore
// appears in both tabs with no change to either: here a poncho, added to the figure's tops and to the outfit "girl
// clothes" (the catalog files are changed as the test reads them).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogDir,peopleArea} from './fixtures/people-area.mjs';

const skip=catalogDir?false:'the pinned catalog (docs/webchat/catalog or .cache/catalog at the pin) is not available';
const PONCHO=['',
 '# top: poncho (added by the test)',
 '@k.faces.figure.top.poncho k.faces.variant slot=top name=poncho style=figure length=medium kind=poncho core.source="hand-core 1"',
 '@k.faces.figure.top.poncho.cape k.faces.part slot=top of=poncho name=cape shape=polygon x=30 y=30 w=40 h=36 z=1 colour=green tint=clothes core.source="hand-core 1"',
 '@k.faces.figure.top.poncho.cape.p1 k.faces.point part=$k.faces.figure.top.poncho.cape n=1 x=44 y=30 core.source="hand-core 1"',
 '@k.faces.figure.top.poncho.cape.p2 k.faces.point part=$k.faces.figure.top.poncho.cape n=2 x=56 y=30 core.source="hand-core 1"',
 '@k.faces.figure.top.poncho.cape.p3 k.faces.point part=$k.faces.figure.top.poncho.cape n=3 x=70 y=66 core.source="hand-core 1"',
 '@k.faces.figure.top.poncho.cape.p4 k.faces.point part=$k.faces.figure.top.poncho.cape n=4 x=30 y=66 core.source="hand-core 1"',''].join('\n');
const change={
 'k.faces/shards/figure-top.sop':text=>text+PONCHO,
 'k.faces/shards/figure-presets.sop':text=>text.replace(/(name="girl clothes" [^\n]*?)top=dress/,'$1top=poncho'),
};
// The poncho drawn: its own polygon (the SVG carries the shape, not its source).
const poncho=/points="44,30 56,30 70,66 30,66"/;

test('a garment added to the people\'s knowledge is drawn on a Drawing person and on the Avatar',{skip},async()=>{
 // The Avatar, given the girl preset (the default is the robot): her body wears the outfit "girl clothes" of her age and sex, now with the poncho.
 const avatar=await peopleArea('ui.avatar',{change});
 assert.equal((await avatar.run('avatar.face.preset',{preset:'girl'})).status,'changed');
 assert.ok(avatar.facts('w.face.top').some(f=>/variant=poncho/.test(f)),avatar.facts('w.face.top').join('\n'));
 assert.match(await avatar.render(),poncho);
 assert.ok(avatar.objects().some(o=>o.id==='top'),'the Avatar observes the body\'s clothes as its parts');
 // The same garment by its word on a person of the Drawing tab.
 const drawing=await peopleArea('art.draw',{change});
 assert.equal((await drawing.run('drawing.catalog.make',{name:'girl'})).status,'changed');
 assert.equal((await drawing.run('drawing.part.add',{id:'o1',kind:'poncho'})).status,'changed');
 assert.match(await drawing.render(),poncho);
 // And the Avatar's clothes take any top of the knowledge through its own controls.
 assert.equal((await avatar.run('avatar.part.change',{ids:'top',variant:'t-shirt'})).status,'changed');
 assert.doesNotMatch(await avatar.render(),poncho);
});
