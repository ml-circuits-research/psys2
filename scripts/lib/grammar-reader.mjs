// Offline development comparator only. Never imported by the application.
import * as api from '../../src/vendor/sopworld/sopworld.mjs';
import {World,compileGrammarOverlay,readGrammarRequests} from '../../src/vendor/sopworld/sopworld.mjs';
import SOURCE from './grammar-source.mjs';
import {createGeneralEnglishReader,englishRequestMappings} from './reader-compat/general.mjs';
import {executeRequestCandidate} from '../../src/dialog/new-engine.mjs';
let grammar;
const reply=(text,supported,trace={})=>({text,parts:[{text,translate:false}],statuses:[supported?'supported':'unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',...trace}});
const refusal=(reason,trace={})=>reply('The declared grammar could not resolve this request. Nothing changed.',false,{reason,...trace});
// The frozen comparator contains flattened module declarations. Its face rule
// reads the inherited kind slot from std.schema, a dependency of its matrix.
function restoreComparator(snapshot) {
  const prelude = new World();
  prelude.load('@comparator.schema core.use world=std.schema');
  return World.fromJSON({...snapshot, log:[...prelude.toJSON().log, ...snapshot.log]});
}
function reader() {
  if (!grammar) {
    const world = restoreComparator(SOURCE.snapshot);
    const compiled = compileGrammarOverlay(world, { types: SOURCE.types });
    if (!compiled.ok) throw new Error('Declared reader could not compile');
    const phraseWorld = restoreComparator(SOURCE.phraseSnapshot), frameWorld = restoreComparator(SOURCE.frameSnapshot);
    const mappings = englishRequestMappings(api, frameWorld);
    if (!mappings.ok) throw new Error('Declared request mappings could not compile');
    const general = createGeneralEnglishReader(api);
    const generalCompiled = general.compile({ phraseWorld, frameWorld, mappings: mappings.mappings });
    if (!generalCompiled.ok) throw new Error('Declared general reader could not compile');
    grammar = { world, compiled, general, generalCompiled };
  }
  return grammar;
}
/** The caller owns UI selection and boundary translation; this runner never invokes a legacy reader. */
export function runGrammarEngine(session, text, options = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 65536) return refusal('reading', { unsupported: 'A bounded nonempty English message is required.' });
  const tab = options.view ?? session.isession.state['ui.shell']?.activeTab;
  if (options.language && options.language !== 'en') return refusal('language');
  const prior = options.invocation && (session.newEngineJournal || []).find(record => record.invocation === options.invocation);
  if (prior) {
    if (prior.text !== text || prior.area !== tab) return refusal('identity');
    return reply('This invocation was already recorded. No new operation was performed.', false,
      { replayed: true, historicalReceipt: { ...structuredClone(prior.receipt), replayed: true }, journal: structuredClone(prior) });
  }
  const { world: source, compiled, general, generalCompiled } = reader();
  // Parallel declared proposal sources, never an old-route fallback. Distinct
  // graphs remain alternatives until an explicit semantic equivalence proof.
  const providers = [
    { id: 'property-profile', result: readGrammarRequests(source, text, { compiled, ...SOURCE.options, max: 32 }) },
    { id: 'general-frames', result: general.read(generalCompiled, text) },
  ];
  const candidates = providers.flatMap(provider => provider.result.coverage?.complete
    ? provider.result.candidates.map(candidate => ({ ...candidate, provider: provider.id })) : []);
  const reading = { candidates, coverage: { complete: candidates.length > 0 }, providers };
  if (!reading.coverage?.complete || reading.candidates.length !== 1) return refusal('reading', { reading });
  return executeRequestCandidate(session, reading.candidates[0], text, options);
}

