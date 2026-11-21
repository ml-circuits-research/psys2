import { World } from '../src/vendor/sopworld/sopworld.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {diagramNodes} from './diagram-state.mjs';
import {drawingObjects,drawingState} from './drawing-state.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { executeDeclaredRequest } from '../src/dialog/declared-execution.mjs';
import { performGesture } from './fixtures/editor-gesture.mjs';
import { routeNewEngine } from '../src/dialog/reader-routing.mjs';
import { createDiagramArea as createDiagramHost, emptyDiagramState as initialDiagramState } from '../worlds/diagram.sketch/sop-diagram.mjs';
import { emptyDocumentArea as initialDocumentState } from '../worlds/docs.editor/sop-document.mjs';
import { documentOf } from './document-state.mjs';
import {emptyCalendarArea,calendarAreaStateWorld} from '../worlds/time.calendar/sop-calendar.mjs';
import {str as sopText} from '../src/vendor/sopworld/sopworld.mjs';
const calendarThings=(state,kind)=>calendarAreaStateWorld(state).ofType('w.meetings.'+kind).map(fact=>Object.fromEntries(Object.entries(fact.attrs).map(([key,values])=>[key,values.length===1?(values[0].startsWith('"')?sopText(values[0]):values[0]):values])));

const literal = (value) => typeof value === 'string' ? JSON.stringify(value) : String(value);
function graph({ act, mode, kind, name, conditions = {} }) {
  const wires = [
    '@r std.request act=' + act + ' mood=do source=$source',
    '@source std.request.source text="Author supplied a complete request graph"',
    '@t std.request.target request=$r mode=' + mode + ' kind=' + kind + (name ? ' name=' + literal(name) : ''),
    ...Object.entries(conditions).map(([key, value], index) =>
      '@condition.' + index + ' std.request.constraint request=$r target=$t concept=' + key +
      ' operator=eq character=requirement polarity=positive value=' + literal(value)),
  ];
  return { request: 'r', wires: wires.join('\n') };
}
function binding(area, kind, lemma, operation, on, properties = {}) {
  return { kinds: [{ area, canonical: kind, lemma, nativeFamilyBinding: { operation } }],
    properties: Object.entries(properties).map(([concept, parameter]) =>
      ({ area, canonical: concept, hostBinding: { sourceType: on, parameter } })) };
}
function session(world, instance) {
  const activity = [];
  const value = {
    isession: { state: { [world]: instance } },
    engine: {
      loader: { readFile: (owner, file) => readFile(new URL('../worlds/' + owner + '/' + file, import.meta.url), 'utf8') },
      onWorldActivity: (notice) => activity.push(notice),
    },
  };
  return { value, activity };
}
async function invoke(host, operation, args) {
  return invokeToolCommand(host,{ invocation: crypto.randomUUID(), expectedVersion: host.observe().version, operation, args });
}

test('Drawing compiled change uses actual recency, named matches and valid focus', async () => {
  const state = await drawingState([{ kind: 'house', name: 'First', label: 'First' }, { kind: 'house', name: 'Last', label: 'Last' }]);
  const { value, activity } = session('art.draw', state);
  const bindings = binding('drawing', 'canonical.house', 'house', 'drawing.object.make', 'art.draw.object', { label: 'label' });
  value.engine.nativeBindings = bindings;
  const run = (label, name) => routeNewEngine(value,
    graph({ act: 'change', mode: 'existing', kind: 'canonical.house', name, conditions: { label } }).wires, { view: 'draw' });
  const latest = await run('By recency');
  assert.equal(latest.statuses[0], 'supported');
  assert.equal(latest.trace.authored, true);
  assert.deepEqual(drawingObjects(state).map((object) => object.label), ['First', 'By recency']);
  assert.match(latest.trace.compiledSop, /std\.capability\.result status=compiled.*act=change/);
  assert.match(latest.trace.compiledSop, /std\.capability\.call operation="drawing.object.change"/);
  assert.equal(new World().compileToolInput(latest.trace.compiledSop), latest.trace.controlIntent);
  assert.equal(latest.trace.controlIntent, activity.find((event) => event.operation === 'drawing.object.change' && event.phase === 'start').sop);
  assert.equal((await run('By name', 'First')).statuses[0], 'supported');
  assert.deepEqual(drawingObjects(state).map((object) => object.label), ['By name', 'By recency']);
  assert.equal((await run('By focus')).statuses[0], 'supported');
  assert.deepEqual(drawingObjects(state).map((object) => object.label), ['By focus', 'By recency']);
  const undo = '@r std.request act=undo mood=do source=$s\n@s std.request.source text="Undo the last action"';
  assert.equal((await routeNewEngine(value, undo, { view: 'draw' })).statuses[0], 'supported');
  assert.deepEqual(drawingObjects(value.isession.state['art.draw']).map((object) => object.label), ['By name', 'By recency']);
});

test('Diagram compiled place and remove reach real tool mutations', async () => {
  const state = initialDiagramState(), host = await createDiagramHost({ state, instanceId: 'seed-diagram' });
  await invoke(host, 'diagram.node.make', { kind: 'rectangle', x: 200, y: 210 });
  const { value } = session('diagram.sketch', state);
  const bindings = binding('diagram', 'canonical.rectangle', 'rectangle', 'diagram.node.make', 'diagram.sketch.node', { x: 'x', y: 'y' });
  const run = (act, conditions) => executeDeclaredRequest(value,
    graph({ act, mode: 'existing', kind: 'canonical.rectangle', conditions }), '', { view: 'diagram', bindings });
  const moved = await run('place', { x: 260, y: 270 });
  assert.equal(moved.statuses[0], 'supported', JSON.stringify(moved.trace));
  assert.deepEqual(diagramNodes(state).map(({x,y})=>[x,y])[0], [260, 270]);
  assert.match(moved.trace.compiledSop, /operation="diagram.node.place"/);
  assert.equal((await run('remove')).statuses[0], 'supported');
  assert.equal(diagramNodes(state).length, 0);
});

test('Document overwrite and Calendar coverage policies read declared SOP guards', async () => {
  const document = initialDocumentState();
  const { value: editor, activity: editorActivity } = session('docs.editor', document);
  const editorBindings = binding('document', 'canonical.document', 'document', 'document.write', 'docs.editor.document');
  const write = (name) => executeDeclaredRequest(editor,
    graph({ act: 'make', mode: 'new', kind: 'canonical.document', name }), '', { view: 'editor', bindings: editorBindings });
  const inserted = await write('Initial');
  assert.equal(inserted.statuses[0], 'supported', JSON.stringify(inserted.trace));
  assert.equal(documentOf(document).title, 'Initial');
  assert.match(inserted.trace.compiledSop, /std\.capability\.list/);
  const before = structuredClone(document);
  const refused = await write('Replacement');
  assert.equal(refused.trace.reason, 'overwrite-needs-stricter-admission');
  assert.match(refused.trace.compiledSop, /support="guard.document"/);
  assert.deepEqual(document, before);
  assert.equal(editorActivity.filter((event) => event.operation === 'document.write' && event.phase === 'start').length, 1);

  const { value: calendar, activity: calendarActivity } = session('time.calendar', emptyCalendarArea());
  assert.equal((await performGesture(calendar, { view: 'calendar', operation: 'calendar.calendar.add',
    args: { id: 'office', label: 'Office' } })).ok, true);
  const calendarBindings = binding('calendar', 'canonical.meeting', 'meeting', 'calendar.meeting.add', 'time.calendar.meeting',
    { start: 'start', title: 'title', calendar: 'calendar', duration: 'duration' });
  const meeting = graph({ act: 'make', mode: 'new', kind: 'canonical.meeting', conditions: { start: 3600000, title: 'First event', calendar: 'office' } });
  const blocked = await executeDeclaredRequest(calendar, meeting, '', { view: 'calendar', bindings: calendarBindings, unapplied: ['room identity'] });
  assert.equal(blocked.trace.reason, 'unapplied-scheduling-details');
  assert.match(blocked.trace.compiledSop, /support="guard.calendar"/);
  assert.equal(calendarActivity.filter((event) => event.operation === 'calendar.meeting.add' && event.phase === 'start').length, 0);
  const added = await executeDeclaredRequest(calendar, meeting, '', { view: 'calendar', bindings: calendarBindings });
  assert.equal(added.statuses[0], 'supported', JSON.stringify(added.trace));
  assert.match(added.trace.compiledSop, /name="duration" value=1800000/);
  const [event] = calendarThings(calendar.isession.state['time.calendar'], 'meeting').map(m=>({...m,duration:Number(m.duration)}));
  assert.equal(event.title, 'First event');
  assert.equal(event.duration, 1800000);
  assert.doesNotMatch(added.text, /starting now/);
  const started = Date.now();
  const now = await executeDeclaredRequest(calendar, graph({
    act: 'make', mode: 'new', kind: 'canonical.meeting',
    conditions: { title: 'Observed time', calendar: 'office', duration: 300000 },
  }), '', { view: 'calendar', bindings: calendarBindings });
  assert.equal(now.statuses[0], 'supported', JSON.stringify(now.trace));
  assert.match(now.text, /starting now/);
  assert.doesNotMatch(now.text, /30-minute duration/);
  const created = calendarThings(calendar.isession.state['time.calendar'], 'meeting').map(m=>({...m,start:Number(m.start),duration:Number(m.duration)})).find((item) => item.title === 'Observed time');
  assert.equal(created.duration, 300000);
  assert.ok(created.start >= started && created.start <= Date.now());
});

test('two reader-proposed meanings for one turn compile against the observed diagram before any effect',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'seed'});
 await invoke(host,'diagram.node.make',{kind:'rectangle',x:55,y:70});
 const {value}=session('diagram.sketch',state);
 const binds=binding('diagram','example.rectangle','rectangle','diagram.node.make','diagram.sketch.node',{x:'x',y:'y'});
 const option=kind=>graph({act:'place',mode:'existing',kind,conditions:{x:100,y:120}});
 const phrase='Author supplied a complete request graph';
 value.engine.requestReader={bindings:()=>binds,provenance:()=>({modelSha256:'f'.repeat(64)}),propose:async()=>({
  candidates:[option('example.absent'),option('example.rectangle')],coverage:{complete:true,graphProposal:true},failures:[],
  selectionScore:{definition:'psys2.model-minimum/1',value:0.8},
 })};
 const r=await routeNewEngine(value,phrase,{view:'diagram',interactionMode:'thinking'});   // comparing meanings is the Thinking path
 assert.deepEqual(r.statuses,['supported'],JSON.stringify(r.trace));
 assert.match(r.trace.readingComparison,/std.interpret.reading/);
 assert.deepEqual(diagramNodes(value.isession.state['diagram.sketch']).map(n=>[n.x,n.y]),[[100,120]]);
 assert.equal(value.newEngineUndo.length,1);
});
