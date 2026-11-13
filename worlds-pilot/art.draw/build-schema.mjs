// SPDX-License-Identifier: AGPL-3.0-only
// Writes worlds-pilot/art.draw/schema.sop (spec 21, pilot of art.draw): the schema of the drawing board as a view of the session things (spec 23). The colours and the shades are the
// palette of the renderer (worlds/art.draw/scene.mjs: BASE_COLORS, SHADES), so a new colour of the renderer is a colour word of the schema without a line here.
//   node worlds-pilot/art.draw/build-schema.mjs && node scripts/build-schema-world.mjs worlds-pilot/art.draw
import { writeFile } from 'node:fs/promises';
import { BASE_COLORS, SHADES } from '../../worlds/art.draw/scene.mjs';
import { KIND_WORDS, SIZE_WORDS } from '../../worlds/art.draw/ops.mjs';

const colours = Object.keys(BASE_COLORS);
const shades = ['light', 'dark', 'pale', 'bright', 'deep', 'soft'].filter((s) => SHADES[s]);
const values = [...colours, 'gray', ...shades.flatMap((s) => colours.map((c) => `${s}_${c}`))];
const of = (...k) => k.map((x) => `    of=${x}`).join('\n');
const lines = (key, ws) => ws.map((w) => `    ${key}=${w}`).join('\n');
export function build() {
  return `@pic acts.schema
    noun="drawing"
    doc="The drawing board as a schema (pilot of art.draw, spec 21 and 23): things of any drawable kind of the knowledge (k.objects, stand-ins), regions (the sky, the ground, lakes), groups; colour, size and place; the acts make, remove, change, place (words and layouts of the space module), group, take apart, copy, pick, ask, save, send. The renderer, the scene composition and the drawing from facts stay in worlds/art.draw (scene.mjs, ops.mjs); hooks.mjs maps the roles of an act onto them."
    hooks=hooks.mjs
${['add:draw.add', 'drawUndo:draw.undo', 'drawRedo:draw.redo', 'newDrawing:draw.new', 'openTab:draw.open'].map((o) => `    own=${o}`).join('\n')}
    sample=house
    dir=yes
    layout=yes
    bare=yes
${['wish', 'list', 'say', 'scale', 'turn', 'clear', 'random'].map((f) => `    ${f}=yes`).join('\n')}
${['make', 'remove', 'change', 'place', 'group', 'pick', 'ask', 'copy', 'undo', 'redo', 'save', 'send'].map((a) => `    acts=${a}`).join('\n')}
    limit.items=400
    limit.history=50

@pic.view acts.view
    aspects=visual
    aspects=spatial
    word=drawing
    word=picture
    word=canvas
    word=drawing_board

@pic.thing acts.kind
    plural=things
    any=knowledge
    in=thing
    word=object
    word=item
    word=shape
${lines('catalog', ['k.objects', 'k.animals', 'k.food'])}
${lines('word', Object.entries(KIND_WORDS).filter(([, k]) => k !== '*').map(([w]) => w))}

@pic.ground acts.kind
    plural=grounds
${lines('word', ['grass', 'lawn', 'meadow', 'sand', 'beach', 'snow', 'sea', 'ocean', 'water', 'floor'])}

@pic.sky acts.kind
    plural=skies
    word=background
    word=paper

@pic.group acts.kind
    plural=groups
    word=bunch

@pic.colour acts.attr
${of('thing', 'ground', 'sky', 'group')}
    type=colour
${lines('values', values)}
    word=color

@pic.size acts.attr
${of('thing', 'group')}
    type=enum
${lines('values', Object.keys(SIZE_WORDS))}
    more=bigger
    more=larger
    more=taller
    more=wider
    more=longer
    less=smaller
    less=tinier
    less=shorter
    less=narrower

@pic.fill acts.attr
${of('thing')}
    type=enum
${lines('values', ['solid', 'filled', 'crayon', 'scribbled', 'empty', 'hollow', 'outline', 'outlined'])}

@pic.cover acts.attr
${of('ground')}
    type=enum
${lines('values', ['grass', 'sand', 'snow', 'sea', 'water'])}
    word=surface

@pic.time acts.attr
${of('sky')}
    type=enum
${lines('values', ['night', 'nighttime', 'day', 'daytime', 'morning', 'daylight', 'sunny', 'noon', 'sunset', 'sunrise', 'dusk', 'dawn', 'evening', 'midnight', 'twilight'])}
    word=time
`;
}
if (import.meta.url === `file://${process.argv[1]}`) { await writeFile(new URL('./schema.sop', import.meta.url), build()); console.log('written schema.sop'); }
