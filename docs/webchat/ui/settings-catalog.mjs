// SPDX-License-Identifier: AGPL-3.0-only
// Settings catalogue (SETTINGS-COHERENT items 5 and 6; spec 06 "Settings modal"): every option the Settings dialog offers, with the group it belongs to,
// a plain label, one sentence on what changes for the person, one on when to turn it on, an optional small "details" line (internal names live only there),
// the shipped default and why (the gate it passed, the measured numbers, or the user decision). Pure data, no DOM, so node:test can import it
// and the worker-log table is generated from it.

export const GROUPS = Object.freeze([
  ['reading', 'Reading'],
  ['languages', 'Languages and voice'],
  ['models', 'Models'],
  ['privacy', 'Privacy and history'],
  ['developer', 'Developer'],
]);

/** The "How I read your messages" choices; `value` is the stored `reading` setting. */
export const READING_MODES = Object.freeze([
  { value: 'hybrid', label: 'Hybrid (default)', short: 'Hybrid (default): rules first, the model reads what they could not', text: 'Rules first; the model reads what the rules could not.' },
  { value: 'model', label: 'Model first', short: 'Model first: the model reads, the rules check and fall back', text: 'The model reads first; the rules check it and take over when it fails. Measured worse: 16.2% wrong answers against 0.3% with Hybrid.' },
  { value: 'rules', label: 'Rules only', short: 'Rules only: no model reads anything', text: 'No model reads anything; fastest, and works before the model has loaded.' },
]);

/**
 * id, group, key (the stored setting, when one), label, what, when, details, default, reason.
 * `label` has no internal name (dispatcher, head, nx, veto, matrix, formalizer); those may appear in `details` only.
 */
export const OPTIONS = Object.freeze([
  // ---- Reading ----
  { id: 'reading', group: 'reading', key: 'reading', label: 'How I read your messages', default: 'hybrid',
    what: 'Chooses who reads a message first: the rules, the small model, or both.',
    when: 'Leave it on Hybrid; pick Rules only to avoid the model download or to compare, Model first only to try it (it is measured worse).',
    details: 'Stored as `reading`; the engine still gets the older `formalizer` (encoder | rules) and `nxStrategy` (hybrid | neural | rules) derived from it.',
    reason: 'ADR-009: Hybrid adds nothing wrong on the dev data; model first measured 16.2% wrong on the operational set against 0.3% shipped, and about 20 points fewer dialogue turns right.' },
  { id: 'spellcheck', group: 'reading', key: 'spellcheck', label: 'Fix typos and chat abbreviations', default: true,
    what: 'A word that no world knows is replaced by the closest word a world knows, and I say so.',
    when: 'Keep it on; turn it off if I change a word you meant exactly, such as a made-up name.',
    details: 'Spelling repair against the vocabulary of the worlds (spec 03, 7.9).',
    reason: 'Passed its gate (RD1b: a word that is valid in some world is never corrected); evaluations unchanged with it on.' },
  { id: 'normalizer', group: 'reading', key: 'normalizer', label: 'Rephrase what I cannot read', default: true,
    what: 'When nothing else reads a sentence, a small model suggests a simpler wording; I use it only if the rules read it and every number, name, colour and negation is kept.',
    when: 'Keep it on; turn it off to save the model download or if you ever see a rewrite that changed your meaning.',
    details: 'The normalizer (FLAN-T5 small, int8), spec 03, 7.12.',
    reason: 'Operational English set: 98.6% right and 0.4% wrong with the dispatcher and the normalizer, against 95.4% and 0.5% with the rules alone (training/RESULTS.md).' },
  { id: 'partial', group: 'reading', key: 'partialUnderstanding', label: 'Do what I understood and say what I ignored', default: true,
    what: 'In a long message, I do the parts I understood and tell you which part I skipped.',
    when: 'Keep it on; turn it off if you prefer me to do nothing unless I understood the whole message.',
    details: 'Partial understanding, spec 03, 7.10.',
    reason: 'In the shipped pipeline since 7.10; evaluations count a partly understood message as right only when the executed part is right.' },
  { id: 'bestEffort', group: 'reading', key: 'bestEffort', label: 'Guess loose words and say how I took them', default: true,
    what: 'When words do not form a sentence (“square eyes robot”), I do the most sensible reading and say how I took it.',
    when: 'Keep it on; turn it off if you want “I did not understand” instead of a guess.',
    details: 'Best effort with loose words, spec 03, 7.15.',
    reason: 'In the shipped pipeline since 7.15: a guess is acceptable because the worlds are harmless and the reply says how it was read.' },
  { id: 'fastPath', group: 'reading', key: 'fastPath', label: 'Answer at once when the rules read everything', default: true,
    what: 'When the rules understand the whole message and every part works, I answer without waiting for the model.',
    when: 'Keep it on, especially on a phone; turn it off only to compare with the full pipeline.',
    details: 'Fast path, spec 06; the model still handles everything the rules did not read.',
    reason: 'Passed its gate: model ready under 5 s and median answer 300 ms or less at 4x CPU throttle; evaluation unchanged (0 differences).' },
  // ---- Languages and voice ----
  { id: 'language', group: 'languages', key: 'language', label: 'Language', default: 'en',
    what: 'The language you talk to me in and I answer in; the microphone listens in it too.',
    when: 'Change it when you want to speak or write another language; the same as the selector in the header.',
    details: 'Another language is translated to and from English by the translation engine (Models).',
    reason: 'English is the language of the worlds; the browser language is used once, at the first start.' },
  { id: 'translation', group: 'languages', key: 'translation', label: 'How messages are translated', default: 'auto',
    what: 'Chooses what translates your messages and my answers when the language is not English: the browser’s own translator, the on-device model, or the rules.',
    when: 'Leave it on Automatic; choose Rules only to compare or when the browser translator misbehaves.',
    details: 'Automatic = the browser Translator when it has the language, otherwise the on-device model; every translation is checked for numbers, names and negation.',
    reason: 'Owner rule 2026-11-12: with a browser Translator available it is the translator; the rules are the fallback.' },
  { id: 'languageHint', group: 'languages', key: 'languageDetection', label: 'Suggest switching language', default: 'auto',
    what: 'After a typed message that is clearly in the other language, I offer a button to switch; I never switch by myself.',
    when: 'Leave it on Automatic; set Rules to avoid the browser language detector.',
    details: 'Language detector: the browser LanguageDetector or the rules; never used for voice.',
    reason: 'Selected language is the only language; the hint is a suggestion only (LANG-FIXED).' },
  { id: 'englishVariant', group: 'languages', key: 'englishVariant', label: 'English accent', default: 'en-US',
    what: 'Picks the American or British English voice and recognizer.',
    when: 'Change it if the voice or the microphone does not suit your accent.',
    details: 'en-US | en-GB.', reason: 'US English is the default of most voices.' },
  { id: 'voice', group: 'languages', key: 'voice', label: 'Voice', default: '',
    what: 'Picks which installed voice reads my answers aloud.',
    when: 'Change it if the automatic voice sounds wrong for your language.',
    details: 'The speechSynthesis voices of this device.', reason: 'Automatic picks the best installed voice of the language.' },
  { id: 'rate', group: 'languages', key: 'rate', label: 'Speech speed', default: 1,
    what: 'How fast I read answers aloud.', when: 'Slow it down if you miss words, speed it up if you read along.',
    details: 'Rate 0.5 to 1.8.', reason: 'Normal speed.' },
  { id: 'keepListening', group: 'languages', key: 'keepListening', label: 'Keep listening until I say stop', default: true,
    what: 'With the microphone on, I keep listening after each message until you say “stop microphone”.',
    when: 'Turn it off to speak one message at a time.',
    details: 'Hands-free mode ends only on a stop command.', reason: 'Hands-free is the point of the microphone button.' },
  { id: 'wakeWord', group: 'languages', key: 'wakeWord', label: 'Only respond when I address you', default: false,
    what: 'With the microphone on, I ignore everything you say unless it starts with one of my names.',
    when: 'Turn it on in a room where other people talk.',
    details: 'Address words: the app name and the English words robot, assistant, computer, translated once for the selected language and cached.',
    reason: 'Off: a typed message and a clear command always pass; it is for noisy rooms only.' },
  { id: 'speaker', group: 'languages', key: 'speaker', label: 'Read answers aloud', default: false,
    what: 'I speak every answer with the selected voice.', when: 'Turn it on when you do not want to look at the screen.',
    details: 'Same as the speaker button in the header.', reason: 'Off: sound should never start by surprise.' },
  // ---- Privacy and history ----
  { id: 'logPhrases', group: 'privacy', key: 'logPhrases', label: 'Keep a history of my messages', default: true,
    what: 'Remembers what you said, how I read it and whether it worked; it stays in this browser and never leaves it by itself.',
    when: 'Keep it on so you can export it and help me learn; turn it off for a private session.',
    details: 'The phrase log, localStorage, last 5000 entries.', reason: 'Real phrasings are the training data we need (industrial research principle); nothing is sent.' },
  { id: 'exportButtons', group: 'privacy', key: 'exportButtons', label: 'Include button presses in exports', default: false,
    what: 'Adds the messages that came from buttons and the example die to the exported file.',
    when: 'Leave it off: they are not your own phrasing.', details: 'Records with source chip.', reason: 'Buttons are not human phrasing.' },
  // ---- Developer ----
  { id: 'showTrace', group: 'developer', key: 'showTrace', label: 'Show how each answer was made', default: false,
    what: 'Opens, under every answer, the list of the parts of your message with the rule or model that read each one.',
    when: 'Turn it on to find out why an answer was wrong.', details: 'Trace of formalizer, validator, translator.', reason: 'A diagnostic, not for everyday use.' },
  { id: 'devMode', group: 'developer', key: 'devMode', label: 'Developer mode', default: false,
    what: 'Adds a Debug button to every tab: commands, the last 200 turns with their wires, a dry run, the state and the models.',
    when: 'Turn it on when you report a problem; it records more while on.', details: 'Debug panel, SOP Lang wires.', reason: 'A diagnostic.' },
  { id: 'showPerf', group: 'developer', key: 'showPerf', label: 'Show timing of the last message', default: false,
    what: 'Shows how long each stage of the last message took.', when: 'Turn it on to see why something felt slow (also ?perf=1 in the address).',
    details: 'Per-stage timing overlay.', reason: 'A diagnostic.' },
  { id: 'reasoner', group: 'developer', key: 'reasoner', label: 'Engine for shop, arithmetic and task worlds', default: 'matrix',
    what: 'Chooses which engine answers the shop, arithmetic and tasks worlds; the new one also asks for a missing item, takes “undo that” back and explains “why?”.',
    when: 'Leave it on the new engine; switch to the old one only to compare. Changing it restarts the engine and forgets the shop, arithmetic and list facts.',
    details: 'Reasoner: matrix (sopworld library, default) | ops (fallback); spec 15.', reason: 'User decision 2026-11-11: matrix is the default.' },
  { id: 'worldAware', group: 'developer', key: 'worldAware', label: 'Check readings against what the worlds contain', default: 'veto',
    what: 'Before acting I check that the reading fits the world: no deleting a thing that does not exist, no game move when no game runs; I say why when I refuse.',
    when: 'Leave it on; turn it off to act on every reading as before, or set “Observe only” to see what it would have refused.',
    details: 'World-aware reading, spec 16: veto | choose | observe | off.', reason: 'User decision 2026-11-12: veto is the default.' },
  { id: 'routing', group: 'developer', key: 'routing', label: 'Which world takes a message', default: 'symbolic+encoder',
    what: 'Chooses how I pick the world (drawing, chess, shop ...) for a message: rules that give a reason for every choice, with the small model as a hint (default), the rules alone, or the older way where the model proposes and the rules check.',
    when: 'Leave it on the default; switch to compare. “Show how each answer was made” says why a world was taken.',
    details: 'Routing, spec 20: symbolic+encoder (C, default) | symbolic (B) | dispatcher (A).', reason: 'Reviewer decision 2026-11-13: C is the default.' },
  { id: 'timeLimits', group: 'developer', key: 'timeLimits', label: 'Time limits', default: 'built-in',
    what: 'How long each stage may take before I stop it and say so.', when: 'Raise them on a very slow device; lower them to test the safety stops.',
    details: 'Clamped to a range per limit; applied at the next turn.', reason: 'Defaults come from the compute-budget work (src/dialog/time-limits.mjs).' },
  { id: 'acceptRefused', group: 'developer', key: 'encoderAcceptRefused', label: 'Accept game commands when no game is on', default: true,
    what: 'A command such as “move the piece” is understood even when no game runs, so I can answer “start a game first”.',
    when: 'Leave it on; turn it off to treat such commands as not understood.',
    details: 'Accept parses the interpreter refuses by state (spec 03, 7.14).', reason: 'Shipped default of the encoder pipeline (spec 03, 7.14); no separate gate was run.' },
  { id: 'editHead', group: 'developer', key: 'editHead', label: 'Experimental: let the model reword a part before the rules read it', default: false,
    what: 'Also tries the model’s own simplified wording of a part that nothing else reads. Measured: it recovers 3 messages and misleads 7.',
    when: 'Do not turn it on unless you are testing; it is off until the owner decides.',
    details: 'S1 edit head, spec 03, 7.8; eval-dispatch on 11,303 messages (test + held-out), review decision (e) 2026-11-09.',
    reason: 'Failed its gate (misled must be at most a quarter of recovered): 3 recovered against 7 misled on eval-dispatch, test + held-out, 11,303 messages.' },
]);

export const optionById = (id) => OPTIONS.find((o) => o.id === id) ?? null;
export const optionsOf = (group) => OPTIONS.filter((o) => o.group === group);

/** Words that must never appear in a label (they may appear in `details`). */
export const INTERNAL_WORDS = Object.freeze(['dispatcher', 'head', 'nx', 'veto', 'matrix', 'formalizer', 'encoder', 'normalizer', 'wire', 'sopworld']);

/** The default of every option as a markdown table (for worker-log). */
export function defaultsTable() {
  const rows = OPTIONS.map((o) => `| ${GROUPS.find(([g]) => g === o.group)[1]} | ${o.label} | \`${String(o.default)}\` | ${o.reason} |`);
  return ['| Group | Option | Default | Reason |', '| --- | --- | --- | --- |', ...rows].join('\n');
}
