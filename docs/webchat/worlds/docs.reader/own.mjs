// SPDX-License-Identifier: AGPL-3.0-only
// docs.reader (spec 21): what the schema cannot say and other code needs from this world. The reader engine (documents, entities, events, search, the answers, reading aloud) is read.mjs; the
// schema reads the acts, the operations below are the families that have no act (a character, where an event happened, who said it, a count, a search step ...) and the state hooks of the tab.
export {
  initialState, makeDocument, withDocument, sampleDocument, stemWord, topicSummary,
  describe, summary, characters, mainCharacter, places, keywords, outline, stats, who, did, happened, where, whereDid, whenDid, whoV, didV, said, saying, part, sentence, count,
  search, searchStep, clearSearch, across, relation, isRelated, read, list, open, close, loadSample, more, sectionExtreme,
  ask as askPassage, pick as pickSection,
} from './read.mjs?v=a8a79efab0';
export { digest, compose } from './textgen.mjs?v=1544f074ca';
