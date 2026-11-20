// Test helpers for the Documents tab's SOP area (worlds/docs.editor/area.sop): a state made through the area's own
// commands, and the document, blocks, items and marks of a state read back from its w.document facts. No knowledge
// of the old JS format.
import {createDocumentArea,emptyDocumentArea,documentAreaStateWorld} from '../worlds/docs.editor/sop-document.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';

const value = (raw) => raw === undefined ? undefined : raw.startsWith('"') ? JSON.parse(raw) : raw === 'true' || raw === 'false' ? raw === 'true' : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;

/** A Documents state made by these commands, in order: [[operation, args]]. The first state holds document text1. */
export async function documentState(commands = []) {
  const state = emptyDocumentArea(), host = await createDocumentArea({ state });
  commands.forEach(([operation, args], n) => {
    const result = invokeToolCommand(host, { operation, args, invocation: 'fixture-' + n, expectedVersion: host.observe().version });
    if (result.status !== 'changed') throw Error('document-fixture-refused:' + operation + ':' + (result.reason ?? result.status));
  });
  return state;
}

/** The document of a state: {code, title, genre, topic}, or null when there is none. */
export function documentOf(state) {
  const [doc] = documentAreaStateWorld(state).ofType('w.document.document');
  return doc ? Object.fromEntries(['code', 'title', 'genre', 'topic'].filter((k) => doc.attrs[k]).map((k) => [k, value(doc.attrs[k][0])])) : null;
}

/** The blocks of a state in document order: [{id, kind, text, level, align, name, style, header}]. */
export function documentBlocks(state) {
  return documentAreaStateWorld(state).ofType('w.document.block').map((fact) => {
    const a = (key) => value(fact.attrs[key]?.[0]);
    return Object.fromEntries(Object.entries({ id: a('code'), kind: a('form'), text: a('text'), level: a('level'), align: a('align'), name: a('name'), style: a('style'), header: a('header'), n: a('n') }).filter(([, v]) => v !== undefined));
  }).sort((p, q) => p.n - q.n).map(({ n, ...block }) => block);
}

/** The item texts of a list block, in order. */
export function documentItems(state, code) {
  const world = documentAreaStateWorld(state), block = world.ofType('w.document.block').find((b) => b.attrs.code[0] === code);
  return world.ofType('w.document.item').filter((i) => block && i.attrs.block[0] === '$' + block.id)
    .sort((p, q) => value(p.attrs.n[0]) - value(q.attrs.n[0])).map((i) => value(i.attrs.text?.[0]));
}
