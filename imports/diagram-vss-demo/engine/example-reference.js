/* Display-only expected results. Saved SOP references are replayed in an isolated engine; no reader is called. */
(function (root) {
'use strict';
const K = typeof SOPKit !== 'undefined' ? SOPKit : (typeof require === 'function' ? require('./logic.js') : null);
const clone = x => JSON.parse(JSON.stringify(x));
function rename(text, map) {
  const keys = Object.keys(map || {});
  if (!keys.length) return text;
  const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp(`\\b(${escaped.join('|')})\\b`, 'g'), word => map[word]);
}
function renameProgram(sop, map) {
  const value = v => Array.isArray(v) ? v.map(value) : typeof v === 'string' ? rename(v, map) : v;
  return K.parse(sop).map(n => K.serialize({ ...n, args: Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, value(v)])) })).join('\n');
}
function create(catalog, opts) {
  const saved = opts.id && catalog.scenarios[opts.id];
  const sys = K.createSystem(), cache = [];
  if (opts.initial) {
    sys.world.restore(clone(opts.initial));
    sys.world.undoStack = clone(opts.undo || []); sys.world.redoStack = clone(opts.redo || []);
  }
  const rows = opts.turns.map((text, i) => {
    const row = saved ? saved[i] : catalog.quick.find(r => r.text === text);
    if (row && rename(row.text, opts.map) === text) return { ...row, text, sop: renameProgram(row.sop, opts.map) };
    // An edited/custom script has no invented answer. Explicit SOP is already the requested program.
    if (text.startsWith('@')) { try { K.parse(text); return { text, sop: text, source: 'Explicit SOP Lang supplied in the example' }; } catch (_) { /* show unavailable below */ } }
    return { text, sop: null, source: null };
  });
  function at(index) {
    index = Math.max(0, Math.min(rows.length - 1, index));
    for (let i = cache.length; i <= index; i++) {
      const row = rows[i], previous = cache[i - 1];
      const problems = [];
      let result = null;
      if (previous?.blocked) problems.push(`The expected drawing depends on unresolved step ${previous.blocked}.`);
      else if (row.sop == null) problems.push('No saved reference is available for this request.');
      else if (row.setup === 'empty' && !sys.world.state.shapes.length) {
        result = { steps: [{ answer: 'The example starts on an empty canvas.' }] };
      } else {
        try {
          result = sys.engine.run(K.parse(row.sop), { partial: false });
          if (result.error) problems.push(result.error.message || String(result.error));
          for (const step of result.steps) if (step.error) problems.push(step.error.message || String(step.error));
        } catch (error) { problems.push(error.message); }
      }
      const state = sys.world.snapshot();
      cache.push({ row, state, sop: K.worldSOP(state), problems,
        incomplete: previous?.incomplete || (row.incomplete ? i + 1 : null),
        blocked: previous?.blocked || (problems.length ? i + 1 : null),
        answers: result ? result.steps.filter(s => s.answer).map(s => s.answer) : [] });
    }
    return cache[index];
  }
  return { rows, at };
}
const api = { create, rename, renameProgram };
if (typeof module !== 'undefined') module.exports = api;
else root.ExampleReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
