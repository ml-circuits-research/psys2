import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { gatherCandidates } from '../src/translate/candidates.mjs';
import { createRoGrammarVoice } from '../src/translate/voice-ro.mjs';
const voice = createRoGrammarVoice();
const tr = createSwitchTranslator({ rules: createTranslator(), getStrategy: () => 'auto', voices: () => [voice], backend: { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' } });
for (const t of process.argv.slice(2)) { const c = await gatherCandidates(t, { from: 'ro', to: 'en', translator: tr }); console.log(t, '=>', c.map((x) => `${x.source}:${x.text}`).join(' | ')); }
