import { PROPERTY_CHANGE_REQUEST_PROFILE } from './request-profile.mjs';
// Consumer wiring only. Facts and vocabulary come from the pinned knowledge repo.
export const ENGLISH_OVERLAY_TYPES = Object.fromEntries(['binding', 'feature', 'filter', 'rule', 'map', 'node', 'step', 'agreement'].map(role => [role, `w.reader.en.${role}`]));
export const ENGLISH_READER_FACTS = {
  'w.reader.en': Object.values(ENGLISH_OVERLAY_TYPES),
  'w.lang.en': ['w.lang.en.prep', 'w.lang.en.det'],
  'k.attributes': ['k.attributes.attribute'],
  'k.shapes': ['k.shapes.shape', 'core.word'],
  'k.colours': ['k.colours.colour'],
  'k.objects': ['k.objects.object'],
  'k.animals': ['k.animals.animal'],
  'k.people': ['k.people.kind'],
  'k.genres': ['k.genres.genre'],
  'k.actions': ['k.actions.verb'],
};

// Language policy for this bounded imperative profile; other punctuation declines.
export const ENGLISH_REQUEST_OPTIONS = Object.freeze({ profile: PROPERTY_CHANGE_REQUEST_PROFILE, start: 'Message', terminalPunctuation: Object.freeze(['.']) });
