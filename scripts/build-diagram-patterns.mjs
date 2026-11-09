#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Writes worlds/diagram.sketch/patterns.sop and the generated cue phrases / helper lexicons at the end of its lexicon.sop.
//   node scripts/build-diagram-patterns.mjs [--filter]
// Inputs: imports/diagram-vss-demo/world-draft/legend.json (the cue words of the source legend, commit 9900d34) and the most frequent short
// spans per act of imports/diagram-vss-demo/data/train (via training/diagram/top-spans.json, written by scripts/convert-diagram-data.mjs).
// Each act has one pattern made of the lead-in macros of lang.common, a world-local cue phrase (the legend's cue words of that act) and a tail;
// the pattern hands the sentence itself ({segment}) to the operation, whose engine reads the arguments (worlds/diagram.sketch/ops.mjs).
// With --filter, examples that the finished world does not read with that very pattern are dropped (so every example is a real example).
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const W = path.join(REPO, 'worlds/diagram.sketch');
const legend = JSON.parse(await readFile(path.join(REPO, 'imports/diagram-vss-demo/world-draft/legend.json'), 'utf8'));
const spansFile = path.join(REPO, 'training/diagram/top-spans.json');
const SPANS = existsSync(spansFile) ? JSON.parse(await readFile(spansFile, 'utf8')) : {};
const valuesOf = (key) => legend.find((q) => q.key === key)?.values ?? {};
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9' -]/g, '').trim().split(/\s+/).join('_');
const ok = (w) => /^[a-z][a-z0-9_]*$/.test(w);

// ---- cue phrases ----------------------------------------------------------------------------------------------------------
const CUES = {};
for (const act of Object.keys(valuesOf('action'))) CUES[act] = [...new Set((valuesOf('action')[act] ?? []).map(words).filter(ok))];
// words the legend does not list, written by the labelled data's most frequent spans
Object.assign(CUES, {
  undo: [...CUES.undo, 'take_that_back', 'take_it_back', 'go_back'], redo: [...CUES.redo, 'redo_that'],
  create: CUES.create, delete: [...CUES.delete, 'start_over', 'clean_out'], move: [...CUES.move, 'set'], set: [...CUES.set, 'make'], resize: [...CUES.resize, 'make'],
  rename: CUES.rename, label: CUES.label, duplicate: CUES.duplicate, swap: [...CUES.swap, 'switch', 'flip_places_of'], group: CUES.group, ungroup: [...CUES.ungroup, 'split'],
  connect: [...CUES.connect, 'chain'], disconnect: [...CUES.disconnect, 'unconnect'], align: CUES.align, arrange: [...CUES.arrange, 'lay', 'stack', 'put_everything'], distribute: CUES.distribute, forget: [...CUES.forget, 'reset', 'drop'],
  improve: CUES.improve, respace: [...CUES.respace, 'less_space', 'more_space'], snap: CUES.snap, flip: CUES.flip, reverse: CUES.reverse, sort: [...CUES.sort, 'order'], equalize: CUES.equalize,
  straighten: CUES.straighten, untangle: CUES.untangle, fit: [...CUES.fit, 'center', 'centre'],
});
CUES.groupBy = ['group', 'cluster'];
CUES.toFront = ['bring', 'raise', 'move', 'put', 'send', 'push', 'pull'];
CUES.toBack = ['send', 'move', 'put', 'push', 'drop'];

const phraseLines = [];
const phrase = (id, alts, doc) => {
  phraseLines.push(`@phrase.diagram.sketch.${id} core.phrase`, '    frame=false', `    doc="${doc}"`);
  for (const a of [...new Set(alts)].sort((x, y) => y.split('_').length - x.split('_').length)) phraseLines.push(`    alt=${a}`);
  phraseLines.push('');
};
for (const [act, cues] of Object.entries(CUES)) phrase(`v_${act}`, cues, `Cue words of the diagram action ${act} (the legend of diagram-vss-demo).`);
phrase('v_save', ['save', 'export', 'download', 'store', 'keep'], 'Words that save the diagram as a file.');
phrase('v_newdiagram', ['start', 'make', 'create', 'begin', 'open', 'give_me'], 'Words that start a new diagram.');
phrase('rel_front', ['to_the_front', 'to_front', 'to_the_top', 'in_front', 'in_front_of_the_others', 'in_front_of_everything', 'on_top_of_the_others', 'on_top_of_everything', 'above_the_others', 'above_everything', 'forward', 'front', 'frontmost', 'topmost', 'on_top'], 'Ways to say the front of the z-order.');
phrase('rel_back', ['in_the_back', 'in_back', 'at_the_back', 'to_the_back', 'to_back', 'to_the_bottom', 'behind_the_others', 'behind_everything', 'behind_all_the_others', 'below_the_others', 'under_the_others', 'beneath_everything', 'backward', 'backwards', 'behind', 'back', 'backmost'], 'Ways to say the back of the z-order.');
phrase('conn_to', ['to', 'with', 'and', 'and_to', 'together_with', 'onto', 'into'], 'Linking words between the two ends of a connection.');
phrase('naming', ['called', 'named', 'labeled', 'labelled', 'titled', 'saying', 'reading', 'tagged', 'captioned'], 'Words that give a new shape its name or text.');
phrase('placing', ['at', 'in', 'on', 'to', 'above', 'below', 'under', 'beneath', 'beside', 'between', 'inside', 'within', 'next_to', 'near', 'left_of', 'right_of', 'to_the_left_of', 'to_the_right_of', 'on_top_of', 'into', 'onto'], 'Place words after a shape to move.');
phrase('rule_lead', ['from_now_on', 'from_here_on', 'from_this_point_on', 'henceforth', 'by_default', 'as_a_default', 'default'], 'Words that start a default rule.');

// ---- lexicons made from the legend ---------------------------------------------------------------------------------------------
const lexLines = [];
const lexicon = (id, ws, doc) => {
  lexLines.push(`@lex.diagram.sketch.${id} core.lexicon`, '    class=noun', `    doc="${doc}"`);
  for (const w of [...new Set(ws)].filter(ok)) lexLines.push(`    word=${w}`);
  lexLines.push('');
};
const shapeV = valuesOf('shape');
const anyWords = new Set(['any', ...(shapeV.any ?? [])]);
const textWords = new Set(['text', ...(shapeV.text ?? [])]);
const concrete = Object.entries(shapeV).filter(([k]) => k !== 'any' && k !== 'text').flatMap(([k, v]) => [k, ...v]).map(words)
  .filter((w) => !anyWords.has(w) && !textWords.has(w) && !['ring'].includes(w));
lexicon('shapenoun', concrete, 'Concrete shape nouns (circle, square, rectangle, triangle, diamond, ellipse, hexagon, star and their synonyms): a sentence with one of them can draw a shape.');
lexicon('shapeany', [...anyWords, ...concrete, ...textWords, 'arrow', 'arrows', 'connection', 'connections'].map(words), 'Any word for the shapes of a diagram, concrete or generic.');
const attr = (k) => Object.entries(valuesOf(k)).flatMap(([a, b]) => [a, ...b]).map(words);
lexicon('setvalue', [...attr('color'), ...attr('size'), ...attr('outline'), ...attr('fill'), ...attr('style'), ...attr('shape'), 'bigger', 'smaller', 'larger'], 'A value a shape can be set to: a colour, size, outline, fill, line style or shape kind.');
const posWords = [...Object.entries(valuesOf('position')).flatMap(([a, b]) => [a, ...b]), ...Object.entries(valuesOf('direction')).flatMap(([a, b]) => [a, ...b]), ...Object.entries(valuesOf('layer')).flatMap(([a, b]) => [a, ...b])].map(words);
lexicon('checkword', [...attr('color'), ...attr('size'), ...attr('outline'), ...attr('fill'), ...attr('style'), ...attr('shape'), ...posWords, 'connected', 'linked', 'joined', 'attached', 'grouped', 'selected', 'visible'].filter((w) => !['any', 'one', 'ones', 'none', 'no', 'item', 'light', 'line'].includes(w)), 'A word that makes a yes/no question about shapes a question about the diagram (colour, size, shape kind, place, connected).');
lexicon('diagramform', ['flowchart', 'flow_chart', 'org_chart', 'organization_chart', 'organisation_chart', 'venn_diagram', 'venn', 'timeline', 'pyramid', 'funnel', 'mind_map', 'mindmap', 'swot', 'roadmap', 'process_diagram', 'cycle_diagram', 'hierarchy', 'org_tree', 'family_tree', 'flow_diagram', 'tree_diagram', 'matrix', 'hub_and_spoke', 'process_flow', 'workflow', 'diagram', 'flow'], 'Names of whole diagram forms (flowchart, org chart, pyramid ...): a sentence that asks for one is a diagram request, whatever tab is open.');
lexicon('fileformat', ['svg', 'png', 'image', 'picture', 'file'], 'File formats a diagram can be saved as.');

// ---- patterns -------------------------------------------------------------------------------------------------------------------
const L = '[$lang.connective]? [$lang.lead.filler]? [$lang.lead.polite]?';
const Q = '[$lang.lead.filler]? [$lang.lead.question]?';
const pats = [];
const sentence = (s) => { const t = String(s).trim().replace(/[.!?]+$/, ''); return t.charAt(0).toUpperCase() + t.slice(1) + (/^(is|are|does|do|can|which|what|how|who|where|any)\b/i.test(t) ? '?' : '.'); };
function add(id, { match, act, kind = 'request', priority = 8, tabPriority = null, needs = 'shapes', tabOnly = false, signal = false, examples = [], spans = [], doc }) {
  const spanEx = (SPANS[spans[0]] ?? []).slice(0, spans[1] ?? 12).map(sentence);
  pats.push({ id, match, act, kind, priority, tabPriority: tabPriority ?? priority + 8, needs, tabOnly, signal, examples: [...new Set([...examples, ...spanEx])], doc });
}
const tail = '{t:rest?}';
const act = (a, extra = {}) => add(a, { match: `${L} [$diagram.sketch.v_${a}] ${tail}`, act: `diagram.${a}`, spans: [`command:${a}`], doc: `Reads a request to ${a.replace(/([A-Z])/g, ' $1').toLowerCase()} in the diagram.`, ...extra });

// creating
add('create', { match: `${L} [$diagram.sketch.v_create] [a|an|another|new|some|one_more|a_few] ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 10, needs: null, spans: ['command:create', 30],
  examples: ['Draw a red circle.', 'Add a small blue square.', 'Create a huge gold star in the center.'], doc: 'Draws a shape: its kind, colour, size, name, label and place (the engine reads them).' });
add('create.named', { match: `${L} [$diagram.sketch.v_create] [a|an|another|new|the|one]? ... {s:lex.diagram.sketch.shapenoun} [$diagram.sketch.naming] {n:rest}`, act: 'diagram.create', priority: 13, needs: null, signal: true,
  examples: ['Draw a rectangle called Api.', 'Add a red circle named Start.', 'Create a diamond labeled Check.'], doc: 'Draws a named shape ("a rectangle called Api"): a name makes it a diagram request on any tab.' });
add('template', { match: `${L} [$diagram.sketch.v_create|show|give_me|build|generate] ... {f:lex.diagram.sketch.diagramform} ${tail}`, act: 'diagram.create', priority: 13, needs: null, signal: true,
  examples: ['Draw a flowchart.', 'Make an org chart with Ann, Bob and Cy.', 'Create a pyramid with three levels.', 'Build a timeline of five steps.'], doc: 'Draws a whole diagram form (flowchart, org chart, pyramid, timeline ...) from a list of texts.' });
// DIAG2 round 2: forms of the unread clauses of data/test (no cue verb: "a blue rectangle called Dad", "venn diagram with two circles")
add('create.bare', { match: `${L} [a|an|one|another|the]? ... {s:lex.diagram.sketch.shapenoun} [$diagram.sketch.naming] {n:rest}`, act: 'diagram.create', priority: 10, needs: null,
  examples: ['A blue rectangle called Dad.', 'Under them I want a blue rectangle called Dad.', 'A navy diamond named Fraud gets placed above Pay.'], doc: 'A named shape without a cue verb ("a blue rectangle called Dad"): the sentence names a new shape.' });
add('create.bare.count', { match: `${L} {n:number} ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 9, needs: 'shapes', examples: ['Four squares stacked on the left.'], doc: 'A count of shapes without a cue verb ("four squares stacked on the left").' });
add('template.bare', { match: `${L} [a|an|the]? {f:lex.diagram.sketch.diagramform} [with|of|for|showing] ${tail}`, act: 'diagram.create', priority: 12, needs: null, signal: true, examples: ['Venn diagram with two circles.', 'An org chart for the team.'], doc: 'A diagram form without a cue verb ("venn diagram with two circles").' });
add('create.count', { match: `${L} [$diagram.sketch.v_create] {n:number} ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 10, needs: null, examples: ['Add 3 circles.', 'Draw 2 red squares.'], doc: 'Draws several shapes at once.' });
const WANT = '[i_d_like|i_would_like|i_want|i_need|i_d_love|give_me|get_me|can_i_get|can_i_have|could_i_have|could_i_get|may_i_have|let_me_have|we_need|we_want]';
add('create.want', { match: `${L} ${WANT} [a|an|another|some] [more]? ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 10, needs: null, examples: ['I need a red circle.', 'I would like a big green box under Process.'], doc: 'Asks for a shape in a roundabout way ("I would like a big green box").' });
add('create.want.count', { match: `${L} ${WANT} {n:number} [more]? ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 10, needs: null, examples: ['I need two more green squares.'], doc: 'Asks for several shapes in a roundabout way ("I need two more green squares").' });
add('create.me', { match: `${L} [$diagram.sketch.v_create] [me|us] [a|an|another|some] [more]? ... {s:lex.diagram.sketch.shapenoun} ${tail}`, act: 'diagram.create', priority: 10, needs: null, examples: ['Sketch me a purple hexagon.'], doc: 'Draws a shape for the speaker ("sketch me a hexagon").' });
add('set.of', { match: `${L} [change|set|make|turn|paint|recolor|recolour|color|colour|fill] [the]? [color|colour|size|outline|fill|shape|border]? [of|for]? {t:words(4)} [to|into|be|as]? {v:lex.diagram.sketch.setvalue} {u:rest?}`, act: 'diagram.set', priority: 8, examples: ['Change the color of Check to pink.'], doc: 'Sets a property of a named shape ("change the color of Check to pink").' });
// editing
act('delete', { examples: ['Delete everything.', 'Remove them.', 'Clear everything.'] });
act('move', { priority: 8, examples: ['Move it to the left.', 'Nudge it upwards.'] });
add('move.place', { match: `${L} [put|place|park|tuck|set|stick] {t:words(5)} [$diagram.sketch.placing] {r:rest}`, act: 'diagram.move', priority: 9, examples: ['Put it in the center.', 'Place Done below Check.'], doc: 'Moves a shape to a place: "put Done below Check", "put it in the center".' });
add('move.at', { match: `${L} {t:words(3)} [is|are|goes|go|belongs|belong|should_be|must_be|sits|sit|stays|stay]? [at|on|in|to] [the]? [far|very|extreme]? [left|right|top|bottom|middle|center|centre|upper|lower|front|back] {u:rest?}`, act: 'diagram.move', priority: 7, examples: ['Origin on the far right.', 'Farmer is at the left bank.'], doc: 'A shape and where it belongs ("Origin on the far right").' });
add('move.goes', { match: `${L} {t:words(3)} [goes|go|moves|move|slides|slide|shifts|shift|nudges] {r:rest}`, act: 'diagram.move', priority: 6, examples: ['Buffer goes 40px up.'], doc: 'A shape and a displacement ("Buffer goes 40px up").' });
add('set.should', { match: `${L} [the]? {t:words(3)} [should_be|must_be|is_now|becomes|to_be] [a|an]? ... {v:lex.diagram.sketch.setvalue} {u:rest?}`, act: 'diagram.set', priority: 7, examples: ['The Bot should be a cyan square.', 'The Lid should be a small gray circle.'], doc: 'A shape that should be of some kind or colour ("the Bot should be a cyan square").' });
add('set.the', { match: `${L} [the] {t:words(2)} [a|an] ... {v:lex.diagram.sketch.setvalue} {u:rest?}`, act: 'diagram.set', priority: 5, examples: ['The Mall a red square.'], doc: 'A shape and its new kind ("the Mall a red square").' });
add('arrange.row', { match: `${L} [put|place|line_up|lay|set|stack|arrange|organize|organise] ... [in|into|as|to_form|in_a|into_a] [a|an|one]? [row|column|line|grid|circle|stack|cluster|ring|triangle|square|pyramid|tree|horizontal_line|vertical_line|diagonal] {u:rest?}`, act: 'diagram.arrange', priority: 11, examples: ['Put all the boxes in a row.', 'Put the three in a column.'], doc: 'Arranges shapes in a layout ("put them in a row").' });
add('set.box', { match: `${L} [the]? {t:words(3)} [box|shape|circle|square|node|one|element|rectangle] [a|an]? {v:lex.diagram.sketch.setvalue} {u:rest?}`, act: 'diagram.set', priority: 6, examples: ['The Serve box smaller.'], doc: 'A shape and its new value without a verb ("the Serve box smaller").' });
add('set.canyou', { match: `${L} {t:words(3)} [can_you|could_you|would_you|can_we|could_we] [please]? [make|turn|paint|color|colour|set] [it|them]? [a|an|the]? ... {v:lex.diagram.sketch.setvalue} {u:rest?}`, act: 'diagram.set', priority: 7, examples: ['The Motor, can you turn it brown.'], doc: 'A shape then a polite request about it ("the Motor, can you turn it brown").' });
add('set', { match: `${L} [$diagram.sketch.v_set] ... {v:lex.diagram.sketch.setvalue} ${tail}`, act: 'diagram.set', priority: 9, spans: ['command:set', 30], examples: ['Make it huge.', 'Make it red.', 'Turn Check green.'], doc: 'Sets a property of shapes: colour, outline, fill, size, line style or kind.' });
add('resize', { match: `${L} [$diagram.sketch.v_resize] ${tail}`, act: 'diagram.resize', spans: ['command:resize', 16], examples: ['Shrink it.', 'Enlarge them.'], doc: 'Makes shapes bigger or smaller.' });
add('resize.bigger', { match: `${L} [make] {t:words(4)} [bigger|larger|smaller|wider|taller|shorter|a_bit_bigger|a_bit_smaller|twice_as_big|bigger_again] {u:rest?}`, act: 'diagram.resize', priority: 10, examples: ['Make it bigger.', 'Make the star smaller.'], doc: 'Makes a shape bigger or smaller by comparison.' });
act('rename', { examples: ['Rename it to Fable.', 'Rename Branding to Indigo2.'] });
act('label', { examples: ['Label it "Start".'] });
act('duplicate', { examples: ['Duplicate it.', 'Copy it 3 times.'] });
add('disconnect.edge', { match: `${L} [remove|delete|erase|cut|drop|get_rid_of|clear|take_away|take_out|snip|sever] [the|that|this|an|a|any|all|every|each|these|those]? ... [arrow|arrows|link|links|connection|connections|connector|connectors|edge|edges|lines|line] ${tail}`, act: 'diagram.disconnect', priority: 10, examples: ['Remove the arrow between Api and Db.', 'Erase all links.'], doc: 'Removes arrows or links between shapes.' });
add('label.put', { match: `${L} [put|write|add|place|stamp|type|set] [the|a]? [text|label|caption|words|word|title|name] {t:rest}`, act: 'diagram.label', priority: 9, examples: ['Put the text "approve" on Check.'], doc: 'Writes a text on a shape ("put the text approve on Check").' });
add('duplicate.copy', { match: `${L} [make|create|get|give|take|do|produce] [me|us]? [a|an|another|one|2|3|4|5]? [copy|copies|duplicate|duplicates|clone|clones|replica] [of|for] ${tail}`, act: 'diagram.duplicate', priority: 10, examples: ['Make a copy of Done.'], doc: 'Makes a copy of a shape ("make a copy of Done").' });
act('swap', { examples: ['Swap them.', 'Swap Vcc with Ground.'] });
act('group', { examples: ['Group Climax and Chapter4 as Layer2.'] });
act('ungroup', { examples: ['Ungroup Zone4.'] });
// connections
add('connect', { match: `${L} [$diagram.sketch.v_connect] {t:rest?}`, act: 'diagram.connect', spans: ['command:connect', 30], signal: true, priority: 9, needs: null, examples: ['Connect them in a chain.', 'Connect Api to Db.', 'Link Start with Done.'], doc: 'Connects shapes with an arrow or line: from, to, style, arrow, chain or fan-out.' });
add('connect.draw', { match: `${L} [draw|add|make|put|create] [a|an|another]? ... [arrow|arrows|connection|link|connector] [from|between] {a:words(3)} [to|and|with] {b:words(3)}`, act: 'diagram.connect', priority: 12, signal: true, needs: null,
  examples: ['Draw an arrow from Api to Db.', 'Draw a dotted line between Start and Done.'], doc: 'Draws an arrow or line between two shapes.' });
add('connect.line', { match: `${L} [draw|add|make|put|create] [a|an|another]? ... [line|lines] [from|between] {a:words(3)} [to|and|with] {b:words(3)}`, act: 'diagram.connect', priority: 12, examples: ['Draw a dotted line between Start and Done.'], doc: 'Draws a line between two shapes (only while the diagram has shapes or its tab is open: other tabs draw lines too).' });
add('connect.arrow', { match: `${L} [a|an|another|one|two|dotted|dashed|plain|the]? ... [arrow|arrows|connection|connections|link|links|edge|edges] [from|between] {a:words(3)} [to|and|with|into] {b:rest}`, act: 'diagram.connect', priority: 9, needs: null,
  examples: ['Arrow from Check to Retry.', 'A dashed line between Start and Done.'], doc: 'An arrow or line between two shapes without a cue verb ("arrow from Check to Retry").' });
add('connect.verb', { match: `${L} [both]? {a:words(4)} [connects|connect|leads|lead|points|point|flows|flow|links|link|feeds|feed|sends|send|pulls|pull|commands|command|affects|affect|calls|call|answers|answer|triggers|trigger|becomes|become|pushes|push|depends_on] [to|into|onto|with|from]? {b:rest}`, act: 'diagram.connect', priority: 7, needs: 'shapes',
  examples: ['Phone connects to Cloud.', 'Idea becomes Prototype becomes Demo.', 'Climate affects Rain.'], doc: 'A relation written as a statement ("Phone connects to Cloud"): the diagram gets an arrow.' });
add('connect.goes', { match: `${L} [both]? {a:words(4)} [goes|go|leads|lead|points|point|flows|flow|links|link|feeds|feed|reports|report] [to|into|onto] {b:rest}`, act: 'diagram.connect', priority: 7, needs: 'shapes',
  examples: ['Modem goes to Router, Router goes to Tv.', 'Triage goes into Surgery and Waiting.'], doc: 'A relation with a preposition ("Modem goes to Router"): the diagram gets an arrow.' });
add('connect.order', { match: `${L} {t:words(8)} [should_be|must_be|are|is|get|to_be] [all]? [connected|linked|joined|chained|wired] [in_that_order|in_order|in_a_chain|in_a_row|one_after_another|one_after_the_other|together|to_each_other|to_each_other_in_order] {u:rest?}`, act: 'diagram.connect', priority: 8, signal: true, needs: null,
  examples: ['Ceremony, Photos and Party should be connected in that order.'], doc: 'A list of shapes that should be connected in order.' });
act('disconnect', { examples: ['Disconnect them.', 'Remove all links.'] });
// layout
act('align', { examples: ['Align them horizontally.', 'Line up all the nodes vertically.'] });
act('arrange', { examples: ['Arrange them in a row.', 'Arrange them in a grid.'] });
act('distribute', { examples: ['Distribute them vertically.', 'Spread them evenly.'] });
add('toFront', { match: `${L} [$diagram.sketch.v_toFront] {t:words(6)} [$diagram.sketch.rel_front]`, act: 'diagram.toFront', priority: 9, spans: ['command:toFront', 10], examples: ['Bring it to the front.'], doc: 'Brings shapes to the front of the stack.' });
add('toBack', { match: `${L} [$diagram.sketch.v_toBack] {t:words(6)} [$diagram.sketch.rel_back]`, act: 'diagram.toBack', priority: 9, spans: ['command:toBack', 10], examples: ['Send it to the back.'], doc: 'Sends shapes to the back of the stack.' });
act('forget', { examples: ['Forget the rules.'] });
act('improve', { examples: ['Tidy up.', 'Tidy up the diagram.'] });
act('respace', { examples: ['Condense the diagram.', 'Spread them out more.'] });
act('snap', { examples: ['Snap everything to the grid.'] });
act('flip', { examples: ['Flip everything vertically.'] });
act('reverse', { examples: ['Reverse every arrow.'] });
act('sort', { examples: ['Sort the shapes by name.', 'Alphabetize everything.'] });
add('groupBy', { match: `${L} [$diagram.sketch.v_groupBy] {t:words(4)?} by {p:rest}`, act: 'diagram.groupBy', priority: 9, spans: ['command:groupBy', 10], examples: ['Group the shapes by color.'], doc: 'Groups shapes by a property (shape, colour, size).' });
act('equalize', { examples: ['Equalize the sizes.', 'Unify the colors.'] });
act('straighten', { examples: ['Straighten the arrows.'] });
act('untangle', { examples: ['Uncross the links.', 'Untangle the arrows.'] });
act('fit', { examples: ['Fit everything on the canvas.', 'Recenter everything.'] });
// history
add('undo', { match: `${L} [$diagram.sketch.v_undo] ${tail}`, act: 'diagram.undo', tabOnly: true, needs: null, priority: 12, spans: ['command:undo', 8], examples: ['Undo.', 'Undo that.'], doc: 'Undoes the last change of the diagram (only on the Diagram tab; other tabs have their own undo).' });
add('redo', { match: `${L} [$diagram.sketch.v_redo] ${tail}`, act: 'diagram.redo', tabOnly: true, needs: null, priority: 12, spans: ['command:redo', 8], examples: ['Redo.', 'Redo that.'], doc: 'Redoes the change that was undone (only on the Diagram tab).' });
// facts and rules
add('fact.place', { match: '{a:words(3)} [is|are|should_be|must_be] [to_the_left_of|to_the_right_of|left_of|right_of|above|below|under|over|beneath|on_top_of|next_to|near|beside|inside|within|between] {b:rest}', act: 'diagram.fact', kind: 'statement', priority: 6, examples: ['Check is above Process.', 'Done is to the left of Check.'], doc: 'A statement about where a shape is ({A} is above {B}): the engine makes it true.' });
add('fact', { match: '{a:words(3)} [is|are|should_be|must_be] [a|an]? {v:lex.diagram.sketch.setvalue} {u:rest?}', act: 'diagram.fact', kind: 'statement', priority: 6, spans: ['fact:-', 12], examples: ['Mars is red.', 'Pond is blue.'], doc: 'A statement about a shape ("Mars is red"): the engine makes it true.' });
add('rule', { match: `${L} [$diagram.sketch.rule_lead|new] ... {s:lex.diagram.sketch.shapeany} ${tail}`, act: 'diagram.rule', needs: null, priority: 11, spans: ['rule:-', 12], examples: ['From now on all shapes are tiny.', 'Henceforth new shapes should be black.'], doc: 'A default for shapes drawn from now on ("from now on all shapes are tiny").' });
// questions
const askp = (id, match, spansKey, examples, doc, o = {}) => add(`ask.${id}`, { match, act: `diagram.ask.${spansKey ?? id}`, kind: 'question', priority: 8, spans: [`question:${spansKey ?? id}`, 12], examples, doc, ...o });
askp('count', `${Q} [how_many|count|number_of|how_much] ${tail}`, 'count', ['How many shapes are there?', 'Count the links.'], 'How many shapes, connections or groups there are.');
askp('degree', `${Q} [tell_me|show_me|let_me_know|i_want_to_know|can_you_tell_me]? [how_many] ... [connections|links|arrows|lines|edges|neighbors|neighbours] [does|has|do|have] ${tail}`, 'degree', ['How many connections does Api have?'], 'How many connections one shape has.', { priority: 9 });
askp('exists', `${Q} [is_there|are_there|is_there_a|are_there_any|any|do_we_have|do_i_have|have_we_got|is_anything|is_anyone|is_there_anything|is_there_anyone|anything|anyone] ${tail}`, 'exists', ['Is there a dot?', 'Are there any groups?'], 'Whether a shape of a kind exists.');
askp('list', `${Q} [list|which|show|show_me|name|what_are] ${tail}`, 'list', ['List all arrows.', 'Show me the connections.'], 'Lists shapes, connections or groups.');
askp('property', `${Q} [what_color|what_colour|what_shape|what_size|where_is|where_are|how_big|how_large|how_small|how_tall|how_wide|what_does|what_text|whats_the_color|what_is_the_color_of|what_is_the_size_of|what_is_the_shape_of|what_is_the_label_of|where_s|how_big_is] ${tail}`, 'property', ['What color is it?', 'Where is Api?', 'How large is Process?'], 'A property of a shape: colour, shape, size, label or place.', { priority: 9 });
askp('property.tell', `${Q} [tell_me|just_tell_me|let_me_know|show_me|i_want_to_know|i_d_like_to_know] [where|what|how] {t:words(5)}`, 'property', ['Tell me where Done is.'], 'A property of a shape asked as an order ("tell me where Done is").', { priority: 8 });
askp('property.of', `${Q} [tell_me|just_tell_me|let_me_know|show_me|what_is|what_s|whats|give_me] {t:words(4)} [colour|color|size|shape|position|location|label|text|outline|border]`, 'property', ['Tell me the color of Done.'], 'A property written as a possessive ("tell me Done colour").', { priority: 8 });
askp('describe', `${Q} [describe|summarize|summarise|overview_of|what_is_on|what_s_on|whats_on|what_is_in_the|tell_me_about] ${tail}`, 'describe', ['Describe the diagram.', 'What is on the canvas?'], 'Describes the whole diagram or one shape.', { priority: 9 });
askp('neighbors', `${Q} [what_is_connected_to|what_s_connected_to|what_are_the_neighbors_of|what_are_the_neighbours_of|what_is_joined_to|who_is_connected_to|which_shapes_are_connected_to|which_nodes_are_connected_to|which_ones_are_connected_to|what_shapes_are_connected_to|what_links_to|what_connects_to|which_nodes_point_to|which_shapes_point_to|what_points_to|what_is_attached_to|list_the_neighbors_of|list_the_neighbours_of|list_the_connections_of|what_are_the_connections_of|which_nodes_link_to|which_shapes_link_to] ${tail}`, 'neighbors', ['What is connected to Api?', 'Which shapes are connected to Db?'], 'The shapes a shape is connected to.', { priority: 10 });
askp('neighbors.of', `${Q} [what|which|who]? [does|is|are|do] {t:words(4)} [connect|link|point|lead|connected|linked|attached|joined|adjacent] [to|with]`, 'neighbors', ['What does Start connect to?', 'What is Done connected to?'], 'The shapes a named shape is connected to ("what does Start connect to").', { priority: 9 });
askp('connected', `${Q} [is|are|does|do] {a:words(4)} [and]? {b:words(4)?} [connected|linked|joined|attached|connect|link|join|adjacent] [to|with|together]? ${tail}`, 'connected', ['Are Db and Worker linked?', 'Is Atom connected to Nucleus?'], 'Whether two shapes are connected.', { priority: 7 });
askp('check', `${Q} [is|are|does|do|has|have|can|will] ... {v:lex.diagram.sketch.checkword} ${tail}`, 'check', ['Is it white?', 'Is Validate an oval?'], 'Whether something about the diagram is true ("is it red", "is A left of B").', { priority: 6 });
askp('check.cmp', `${Q} [is|are|does|do|will|would]? [the]? {a:words(3)} [is|are|be]? [bigger|smaller|larger|taller|wider|shorter|higher|lower|closer|farther|further|longer|heavier|lighter] [than] {b:rest}`, 'check', ['Is Hour bigger than Minute?', 'Is the Fiat smaller than the Ford?'], 'A comparison of two shapes ("is Hour bigger than Minute").', { priority: 7 });
askp('degree.of', `${Q} [what_is|what_s|whats|tell_me|give_me|show_me|find]? [the]? [degree|number_of_connections|number_of_links|connection_count|link_count] [of|for] ${tail}`, 'degree', ['What is the degree of Flask?'], 'The number of connections of one shape ("what is the degree of Flask").', { priority: 9 });
askp('path.of', `${Q} [what_is|what_s|whats|tell_me|give_me|show_me|find|get]? [the|a]? [path|route|way|shortest_path] [from|between] {a:words(3)} [to|and] ${tail}`, 'path', ['What is the path from Terminal1 to Gates?', 'The path from Attacker to Server.'], 'The path between two shapes ("what is the path from A to B").', { priority: 9 });
askp('neighbors.who', `${Q} [who|what|which|which_shapes|which_nodes|which_ones]? [is|are|does|do]? [directly|immediately|currently]? [linked|connected|joined|attached|adjacent|next] [to|with] ${tail}`, 'neighbors', ['Who is directly linked to Mid6?'], 'The shapes linked to a named shape ("who is linked to Mid6").', { priority: 9 });
askp('path', `${Q} [is_there_a_path|is_there_a_route|can_i_get_from|is_there_a_way|how_do_i_get|can_you_reach|can_i_reach|can_we_reach|can_i_go|does_a_path_exist|is_there_a_connection_from|does_it_lead|can_you_get_from|can_we_get_from] ${tail}`, 'path', ['Is there a route from Begin to Done?', 'Can I get from Village to Shrine?'], 'Whether one shape leads to another along the arrows.', { priority: 10 });
askp('path.reach', `${Q} [is|are|does|do|can|could] {a:words(3)} [reachable|reach|lead_to|leads_to|connect_to|go_to|downstream_of|upstream_of|reached] ${tail}`, 'path', ['Is Done reachable from Process?', 'Does Courier lead to Factory?'], 'Whether a named shape can reach or be reached from another.', { priority: 9 });
askp('reachable', `${Q} [what_can_be_reached_from|which_shapes_can_be_reached_from|what_is_reachable_from|where_can_i_go_from|what_can_i_reach_from|what_is_reachable|what_lies_downstream_of|what_is_downstream_of|what_comes_after|what_follows|what_comes_next_after|what_is_after|what_is_upstream_of|which_shapes_follow|which_shapes_come_after|everything_after|what_is_downstream] ${tail}`, 'reachable', ['What can be reached from Begin?', 'What comes after Output?'], 'Everything reachable from a shape along the arrows.', { priority: 10 });
askp('cycle', `${Q} [is|are|does|do|has|have|any|can_you_find|is_there|are_there]? [there]? [a|an|any|the]? [diagram|graph|canvas|drawing]? [have|has|contain|contains|include|got]? [a|an|any]? [cycle|cycles|loop|loops|cyclic|circular_path|circular_paths] ${tail}`, 'cycle', ['Is there a cycle?', 'Any cycles?', 'Does the graph contain a loop?'], 'Whether the arrows form a cycle.', { priority: 11 });
askp('rules', `${Q} [show_me_the_rules|what_are_the_rules|which_rules_are_active|which_defaults_are_active|what_rules_are_there|what_default_rules_do_we_have|what_rules|list_the_rules|show_the_rules|show_the_defaults] ${tail}`, 'rules', ['Show me the rules.', 'Which rules are active?'], 'The default rules in force.', { priority: 11, needs: null });
askp('members', `${Q} [what_is_in|what_s_in|whats_in|which_shapes_are_in|what_does|what_are_the_members_of|members_of|what_is_inside] ${tail}`, 'members', ['What is in Backend?', 'Which shapes are in Team1?'], 'The members of a group.', { priority: 9 });
askp('groupOf', `${Q} [what_group|which_group|is|are] ... [group|belong_to|belongs_to|part_of] ${tail}`, 'groupOf', ['What group does Train belong to?', 'Is Lead in a group?'], 'Which group a shape belongs to.', { priority: 9 });
askp('nearest', `${Q} [what|which|who]? [is|are]? [the]? ... [closest|nearest|farthest|furthest] ${tail}`, 'nearest', ['What is closest to the red triangle?'], 'The shape nearest to (or farthest from) another.', { priority: 9 });
askp('extreme', `${Q} [which|what|who] ... [biggest|smallest|largest|leftmost|rightmost|topmost|bottommost|highest|lowest|tiniest|at_the_bottom|at_the_top|at_the_left|at_the_right|on_the_left|on_the_right|on_top|at_the_end|at_the_start|most_connections|fewest_connections|most_links|least_connections] ${tail}`, 'extreme', ['Which shape is the biggest?', 'Which shape is the leftmost?'], 'The shape with an extreme property (biggest, leftmost, most connections).', { priority: 9 });
// tab commands
add('export', { match: `${L} [$diagram.sketch.v_save] [my|the|this|your]? [diagram|drawing|picture|chart|flowchart|canvas] [as|to|in|into|a]? {f:lex.diagram.sketch.fileformat?} [file]?`, act: 'diagram.export', needs: 'shapes', priority: 11, examples: ['Save the diagram as SVG.', 'Export my diagram as a PNG.', 'Download the diagram.'], doc: 'Saves the diagram as an SVG or PNG file.' });
add('new', { match: `${L} [$diagram.sketch.v_newdiagram|clear|reset] [a|an|the]? [new|fresh|clean|blank|empty]? [diagram|canvas|drawing|sketch] [please]?`, act: 'diagram.new', needs: null, priority: 11, examples: ['Start a new diagram.', 'Clear the canvas.'], doc: 'Starts a clean canvas.' });


// the bare forms (no cue verb) are read on the Diagram tab only: elsewhere they would steal sentences of other worlds ("draw a line from Cluj to Bucharest" is the map's)
const TAB_ONLY = new Set(['create.bare', 'create.bare.count', 'move.at', 'move.goes', 'set.should', 'set.the', 'set.box', 'set.canyou', 'connect.arrow', 'connect.verb', 'connect.goes', 'connect.order', 'arrange.row']);
for (const p of pats) if (TAB_ONLY.has(p.id)) p.tabOnly = true;

// canonical examples (help and "Did you mean" offer only these; src/worlds/canonical.mjs): clean sentences about the shapes Api and Db
const CANON = {
  create: ['Draw a red circle.', 'Add a small blue square.'], 'create.named': ['Draw a rectangle called Api.'], 'create.count': ['Add 3 circles.'], template: ['Make an org chart with Ann, Bob and Cy.'],
  delete: ['Delete Api.', 'Delete everything.'], move: ['Move Api to the left.'], 'move.place': ['Put Db below Api.'], set: ['Make Db huge.', 'Turn Api green.'], resize: ['Enlarge Api.'], 'resize.bigger': ['Make Api bigger.'],
  rename: ['Rename Api to Gateway.'], label: ['Label Api "Start".'], duplicate: ['Duplicate Api.'], swap: ['Swap Api and Db.'], group: ['Please group Api and Db as Backend.'], ungroup: ['Please ungroup Backend.'],
  connect: ['Connect Api to Db.'], 'connect.draw': ['Draw an arrow from Api to Db.'], disconnect: ['Disconnect Api from Db.'], align: ['Align all shapes horizontally.'], arrange: ['Arrange all shapes in a row.'],
  distribute: ['Distribute all shapes evenly.'], toFront: ['Bring Api to the front.'], toBack: ['Send Db to the back.'], forget: ['Forget the rules.'], improve: ['Tidy up the diagram.'],
  respace: ['Please condense the diagram.'], snap: ['Please snap everything to the grid.'], flip: ['Please flip the diagram vertically.'], reverse: ['Please reverse every arrow.'],
  sort: ['Please sort the shapes by name.'], groupBy: ['Group the shapes by color.'], equalize: ['Please equalize the sizes.'], straighten: ['Please straighten the arrows.'],
  untangle: ['Please untangle the arrows.'], fit: ['Please fit everything on the canvas.'], undo: ['Undo.'], redo: ['Redo.'], fact: ['Mars is red.'], rule: ['Please, from now on all shapes are tiny.'],
  'ask.count': ['How many shapes are there?'], 'ask.degree': ['How many connections does Api have?'], 'ask.exists': ['Is there a circle?'], 'ask.list': ['List all arrows.'],
  'ask.property': ['What color is Db?'], 'ask.describe': ['Describe the diagram.'], 'ask.neighbors': ['What is connected to Api?'], 'ask.connected': ['Are Api and Db connected?'],
  'ask.check': ['Is Db red?'], 'ask.path': ['Can I get from Api to Db?'], 'ask.reachable': ['What can be reached from Api?'], 'ask.cycle': ['Is there a cycle?'], 'ask.rules': ['Show me the rules.'],
  'ask.members': ['What is in Backend?'], 'ask.groupOf': ['What group does Api belong to?'], 'ask.nearest': ['What is closest to Api?'], 'ask.extreme': ['Which shape is the biggest?'],
  export: ['Save the diagram as SVG.'], new: ['Start a new diagram.'],
};
const { isCanonicalSentence } = await import('../src/worlds/canonical.mjs');
const clean = (s) => (isCanonicalSentence(s) ? s : `Please ${s.charAt(0).toLowerCase()}${s.slice(1)}`);
for (const p of pats) { p.canonical = (CANON[p.id] ?? []).map(clean); p.examples = [...new Set([...p.canonical, ...p.examples])]; }

// ---- write -----------------------------------------------------------------------------------------------------------------------
const q = (s) => JSON.stringify(s);
const render = () => {
  const out = ['@gen.diagram.sketch.note core.note', '    text="Generated by scripts/build-diagram-patterns.mjs from the cue words of the source legend; edit the script, not this file. Each pattern reads the cue of one act and hands the whole sentence ({segment}) to its operation: the engine of diagram-vss-demo reads the arguments."', ''];
  for (const p of pats) {
    out.push(`@pat.diagram.sketch.${p.id} core.pattern`, `    match=${q(p.match)}`, `    emit=${q(`@{_} core.request action=${p.act} arg.text="{segment}"`)}`, `    kind=${p.kind}`, `    priority=${p.priority}`);
    if (p.tabPriority != null) out.push(`    tabPriority=${p.tabPriority}`);
    if (p.needs) out.push(`    needsState=${p.needs}`);
    if (p.tabOnly) out.push('    tabOnly=true');
    if (p.signal) out.push('    signal=true');
    for (const e of p.examples) out.push(`    ${p.canonical.includes(e) ? 'canonical' : 'example'}=${q(e)}`);
    out.push(`    doc=${q(p.doc ?? '')}`, '');
  }
  return out.join('\n');
};
if (process.argv.includes('--filter')) {
  // keep an example only when the finished world reads it with a pattern of the same act on the Diagram tab (the first run writes everything,
  // this pass runs on the loaded world; run the script twice: once plain, once with --filter)
  await writeFile(path.join(W, 'patterns.sop'), render());
  const { createFsLoader } = await import('../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../src/dialog/index.mjs');
  const engine = await createEngine({ loader: createFsLoader() });
  let dropped = 0;
  for (const p of pats) {
    const keep = [];
    for (const ex of p.examples) {
      const s = engine.createSession({ language: 'en' });
      s.setWorldState('ui.shell', { activeTab: 'diagram' });
      s.setWorldState('diagram.sketch', { shapes: [{ name: 'Api', shape: 'rectangle', x: 100, y: 100, size: 62, color: 'white', order: 1 }, { name: 'Db', shape: 'circle', x: 300, y: 100, size: 62, color: 'red', order: 2 }], seq: {}, edgeSeq: 0, order: 2 });
      const r = await s.send(ex, { language: 'en' });
      const m = r.segments?.[0]?.match;
      const act = (id) => pats.find((q2) => `pat.diagram.sketch.${q2.id}` === id)?.act;
      if (m?.worldId === 'diagram.sketch' && (m.patternId === `pat.diagram.sketch.${p.id}` || act(m.patternId) === p.act)) keep.push(ex); else dropped++;
    }
    p.examples = keep; p.canonical = p.canonical.filter((c) => keep.includes(c));
  }
  console.log(`--filter: dropped ${dropped} examples that the world does not read as that act`);
}
await writeFile(path.join(W, 'patterns.sop'), render());

const lexPath = path.join(W, 'lexicon.sop');
let lex = await readFile(lexPath, 'utf8');
const MARK = '@gen.diagram.sketch.note core.note\n    text="Everything below is generated by scripts/build-diagram-patterns.mjs: the cue phrases of the acts and the helper lexicons."';
if (lex.includes(MARK)) lex = lex.slice(0, lex.indexOf(MARK));
await writeFile(lexPath, `${lex.replace(/\s+$/, '')}\n\n${MARK}\n\n${phraseLines.join('\n')}\n${lexLines.join('\n')}`);
console.log(`diagram.sketch: ${pats.length} patterns, ${phraseLines.filter((l) => l.startsWith('@')).length} phrases, ${lexLines.filter((l) => l.startsWith('@')).length} lexicons`);
