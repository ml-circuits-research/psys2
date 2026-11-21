// Compile the declared reader projection once, independently of scene size.
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import { compileObservedChoice } from './observed-choice.mjs?v=ca9485e4cd';
import SCHEMA from '../../worlds/app.project/reader-context-schema-source.mjs?v=6a8b32506d';
import POLICY from '../../worlds/app.project/reader-context-policy-source.mjs?v=5e9faaf675';

const prefix = 'app.readerContext.';
const attr = (wire, key) => str(wire.attrs[key]?.[0]);
const attrs = (wire, key) => (wire.attrs[key] ?? []).map(str);
export const contextClass = (mentioned, focused, parented) =>
  Number(mentioned) * 4 + Number(focused) * 2 + Number(parented);

let compiled;
export function readerContextPolicy() {
  if (compiled) return compiled;
  const world = new World({ library: { 'app.readerContext': SCHEMA } });
  world.load(POLICY);
  const rows = type => world.ofType(prefix + type);
  const classes = new Map();
  for (const row of rows('eligible')) {
    const observed = Object.fromEntries(['mentioned', 'focused', 'parented'].map(key => [key, Number(attr(row, key))]));
    classes.set(contextClass(observed.mentioned, observed.focused, observed.parented), observed);
  }
  const evidence = [...classes.values()], keys = [...classes.keys()];
  const { selected, alternatives } = compileObservedChoice(world, 'app.readerContext', evidence);
  const buckets = new Map([selected, ...alternatives].map((index, rank) => [keys[index], rank]));
  if (buckets.size !== classes.size || buckets.has(undefined)) throw Error('invalid-native-context-criteria');
  const [fallback] = rows('fallback'), [focus] = rows('focus'), [profile] = rows('profile');
  compiled = {
    display: new Map(rows('display').map(row => [attr(row, 'on'), attr(row, 'binding')])),
    fallback: { inputs: new Set(attrs(fallback, 'input')), field: attr(fallback, 'object') },
    relations: rows('relation').map(row => ({ path: attrs(row, 'path'), parent: attr(row, 'endpoint') === 'parent' })),
    focus: { key: attr(focus, 'input'), token: focus.attrs.value[0] },
    reverse: attr(profile, 'ties') === 'reverse',
    mention: { row: attrs(profile, 'mention.row'), object: attrs(profile, 'mention.object') },
    buckets,
  };
  return compiled;
}
export function inspectReaderContextPolicy() {
  return { schema: SCHEMA, policy: POLICY, loaded: !!compiled };
}
