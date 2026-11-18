// Send runtime evidence through the authored SOP decision rules.
import { World, parse, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=327fb3cf41';
import SOURCE from '../../worlds/app.project/reader-admission-policy-source.mjs?v=f39ec7261d';

let loaded;
function policyWorld(source) {
  if (source === SOURCE && loaded) return loaded;
  const context = new World({ library: { 'app.reader': source } });
  if (!context.use('app.reader', { prefix: false }).ok) throw Error('invalid-reader-admission-policy');
  if (source === SOURCE) loaded = context;
  return context;
}

export function compileReaderAdmission(evidenceSop, source = SOURCE) {
  const [evidence, ...other] = parse(evidenceSop);
  if (other.length || evidence?.type !== 'app.reader.evidence') throw Error('invalid-reader-admission-evidence');
  const trial = policyWorld(source).fork();
  if (!trial.tell([evidence], { factsOnly: true }).ok) throw Error('invalid-reader-admission-evidence');
  const decisions = trial.ofType('app.reader.decision');
  if (decisions.length !== 1) throw Error('invalid-reader-admission-decision');
  return serialize(decisions);
}

export function readerCalibrationErrorLimit() {
  const profiles = policyWorld(SOURCE).ofType('app.reader.profile').filter(row => str(row.attrs.default[0]) === 'true');
  if (profiles.length !== 1) throw Error('invalid-reader-calibration-default');
  return Number(profiles[0].attrs['max.error.rate'][0]);
}

export function inspectReaderAdmissionPolicy() {
  return { source: 'worlds/app.project/reader-admission-policy.sop', wires: SOURCE, loaded: !!loaded };
}
