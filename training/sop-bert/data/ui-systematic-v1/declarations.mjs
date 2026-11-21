// Dump the live declared native interfaces of the five editor areas (host.bindings()) and describe UI intents.
// Usage: node declarations.mjs dump > declarations.json
//        node declarations.mjs describe < intents.json > described.json   (intents: [{view, operation, args}])
import {readFile} from 'node:fs/promises';
import {prepareNativeControlHost} from '../../../../src/dialog/native-control-preparation.mjs';
import {describeNativeControl} from '../../../../src/dialog/native-control-intent.mjs';
import {emptyDrawingState} from '../../../../worlds/art.draw/sop-drawing.mjs';
import {emptyDiagramState} from '../../../../worlds/diagram.sketch/sop-diagram.mjs';
import {emptyDocumentArea} from '../../../../worlds/docs.editor/sop-document.mjs';
import {emptyCalendarArea} from '../../../../worlds/time.calendar/sop-calendar.mjs';
import {emptyAvatarState} from '../../../../worlds/ui.avatar/sop-avatar.mjs';
const VIEWS = {draw: 'drawing', diagram: 'diagram', editor: 'document', calendar: 'calendar', avatar: 'avatar'};
const state = {'art.draw': emptyDrawingState(), 'diagram.sketch': emptyDiagramState(), 'docs.editor': emptyDocumentArea(), 'time.calendar': emptyCalendarArea(), 'ui.avatar': emptyAvatarState()};
const session = {isession: {state}, engine: {loader: {readFile: (world, file) => readFile(new URL(`../../../../worlds/${world}/${file}`, import.meta.url), 'utf8')}}};
const hosts = {};
for (const view of Object.keys(VIEWS)) hosts[view] = await prepareNativeControlHost(session, {view});
const mode = process.argv[2];
if (mode === 'dump') {
  const out = {};
  for (const [view, tab] of Object.entries(VIEWS)) out[tab] = {view, operations: hosts[view].bindings()};
  process.stdout.write(JSON.stringify(out, null, 1));
} else if (mode === 'describe') {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const out = JSON.parse(input).map(({view, operation, args}) => {
    const declaration = hosts[view].bindings().find(d => d.id === operation);
    if (!declaration) return {error: 'undeclared'};
    try {
      const d = describeNativeControl({operation: declaration, args});
      return {text: d.text, wires: d.wires, validArguments: d.expected.validArguments, argumentIssue: d.expected.argumentIssue ?? null};
    } catch (e) { return {error: String(e.message || e)}; }
  });
  process.stdout.write(JSON.stringify(out));
}
