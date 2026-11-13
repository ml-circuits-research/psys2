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

/**
 * THE RULE (2026-11-14, owner): an option exists only while its values differ measurably (more than 0.3 point on some set), or the person must choose for a reason other than accuracy
 * (size, privacy, sound, language). A switch that is only being measured lives in EXPERIMENTS (Developer), with its last numbers and the date; an experiment that loses is deleted, not kept as an option.
 */

/**
 * id, group, key (the stored setting, when one), label, what, when, details, default, reason.
 * `label` has no internal name (dispatcher, head, nx, veto, matrix, formalizer); those may appear in `details` only.
 */
export const OPTIONS = Object.freeze([
  // ---- Reading ----
  { id: 'helperModel', group: 'reading', key: 'helperModel', label: 'Use the helper model for typos and long sentences', default: true,
    what: 'A small model (68 MB, loaded in the background, never in the way) splits long messages into their parts and hints which tab a short one belongs to; the rules still read and check everything. While it loads, the rules alone answer.',
    when: 'Keep it on; turn it off on a phone with little data or memory: you lose 0.7 point (43 of 6,100 test messages: misspelled words 4 points better with it, loose-word sentences 2.5 points worse) and the page needs 68 MB less.',
    details: 'The dispatcher encoder: segmentation and world prior (spec 03 7.14, spec 20). The model never reads a message on its own (the "model first" and hybrid readers were removed: 126 right fewer, and 6 rescued against 9 broken).',
    reason: 'Ablation 2026-11-13 and the re-measure after the clause cutter and the suspect-word leniency (worker-log 2026-11-14): the gap against the rules alone is in the report.' },
  { id: 'spellcheck', group: 'reading', key: 'spellcheck', label: 'Fix typos and chat abbreviations', default: true,
    what: 'A word that no world knows is replaced by the closest word a world knows, and I say so.',
    when: 'Keep it on; turn it off if I change a word you meant exactly, such as a made-up name.',
    details: 'Spelling repair against the vocabulary of the worlds (spec 03, 7.9).',
    reason: 'Passed its gate (RD1b: a word that is valid in some world is never corrected); evaluations unchanged with it on.' },
  { id: 'normalizer', group: 'reading', key: 'normalizer', label: 'Help me with garbled sentences', default: false,
    what: 'Downloads a second small model (97 MB, once, kept in this browser). When nothing else reads a sentence it suggests a simpler wording; I use it only if the rules read it and every number, name, colour and negation is kept.',
    when: 'Only if you often write scrambled or badly misspelled sentences and have the data to spare: it reads 28 more of 6,100 test messages (0.5 point), nothing for ordinary sentences.',
    details: 'The normalizer (FLAN-T5 small, int8), spec 03, 7.12. Not loaded until you switch this on.',
    reason: 'Ablation 2026-11-13: +28 right of 6,099 for 97 MB and about 20 ms more per message that the rules could not read; owner decision 2026-11-14: optional download.' },
  { id: 'partial', group: 'reading', key: 'partialUnderstanding', label: 'Do what I understood and say what I ignored', default: true,
    what: 'In a long message, I do the parts I understood and tell you which part I skipped.',
    when: 'Keep it on; turn it off if you prefer me to do nothing unless I understood the whole message.',
    details: 'Partial understanding, spec 03, 7.10.',
    reason: 'In the shipped pipeline since 7.10; evaluations count a partly understood message as right only when the executed part is right.' },
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
  { id: 'timeLimits', group: 'developer', key: 'timeLimits', label: 'Time limits', default: 'built-in',
    what: 'How long each stage may take before I stop it and say so.', when: 'Raise them on a very slow device; lower them to test the safety stops.',
    details: 'Clamped to a range per limit; applied at the next turn.', reason: 'Defaults come from the compute-budget work (src/dialog/time-limits.mjs).' },
  { id: 'experiments', group: 'developer', key: null, label: 'Experiments', default: 'see the list',
    what: 'Switches that are still being measured, each with its last numbers and date. They are here so they can be compared, not because everyday use needs them.',
    when: 'Only when you test or report a problem. An experiment that loses its measurement is deleted, not kept.',
    details: 'EXPERIMENTS in settings-catalog.mjs.', reason: 'Owner rule 2026-11-14: one list, not one option per experiment.' },
]);

/**
 * What is still being measured. `key` is the stored setting, `values` [value, label], `last` the numbers of the last measurement and `date` when. `restart: true` = changing it restarts the engine.
 * Dropped by the measurement of 2026-11-13/14: router A, model first, the NX hybrid reader, the edit head, the fast-path and best-effort switches (no difference above 0.3 point).
 */
export const EXPERIMENTS = Object.freeze([
  { id: 'routing', key: 'routing', default: 'symbolic+encoder', label: 'Which world takes a message',
    values: [['symbolic+encoder', 'Rules with reasons, the helper model as a hint (default)'], ['symbolic', 'Rules with reasons only']],
    last: 'End to end the two differ by 3 messages of 6,100 (0.05 point); at world level alone 81.3% against 70.6% (3,984 messages). Without the helper model the second one runs.', date: '2026-11-13' },
  { id: 'worldAware', key: 'worldAware', default: 'veto', label: 'Check readings against what the worlds contain',
    values: [['veto', 'Check and refuse (default)'], ['choose', 'Check, refuse and choose between readings'], ['observe', 'Only observe (diagnostic)'], ['off', 'Off']],
    last: 'veto +4 and choose +1 right of 6,092 against off (0.07 point); it refuses what cannot happen and says why (user decision 2026-11-12).', date: '2026-11-13' },
  { id: 'reasoner', key: 'reasoner', default: 'matrix', label: 'Engine for shop, arithmetic and task worlds', restart: true,
    values: [['matrix', 'New engine (default)'], ['ops', 'Old engine (fallback)']],
    last: 'The same results on the suites (both pass every world test); the new one asks for a missing item, takes "undo that" back and explains "why?" (user decision 2026-11-11). Changing it forgets the shop, arithmetic and list facts.', date: '2026-11-11' },
  { id: 'acceptRefused', key: 'encoderAcceptRefused', default: true, label: 'Accept game commands when no game is on', boolean: true,
    values: [[true, 'On (default)'], [false, 'Off']],
    last: 'Not measured separately (shipped with the helper model pipeline); lets me answer "start a game first".', date: 'not measured' },
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
