/** Runs a world's tests.sop through a dialog engine (spec 02 Tests). Browser-safe. */

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** Value at a dot path inside a state object (array indexes and `length` work); undefined when absent. */
function statePath(state, path) {
  let v = state;
  for (const part of path.split('.')) { if (v === null || v === undefined) return undefined; v = v[part]; }
  return v;
}

/**
 * @returns {Promise<{ worldId, total, passed, failed: {id, message}[], skipped: {id, reason}[] }>}
 */
export async function runWorldTests(engine, worldId) {
  const world = engine.set.get(worldId);
  const result = { worldId, total: 0, passed: 0, failed: [], skipped: [] };
  if (!world) { result.failed.push({ id: worldId, message: 'unknown world' }); return result; }
  const sessions = new Map();
  for (const t of [...world.tests].sort((a, b) => natural(a.id, b.id))) {
    result.total++;
    if (t.language !== 'en' && !engine.translator) { result.skipped.push({ id: t.id, reason: 'no translator available' }); continue; }
    let s = t.session ? sessions.get(t.session) : null;
    if (!s) { s = engine.createSession({ language: 'en' }); if (t.session) sessions.set(t.session, s); }
    try {
      const reply = await s.send(t.input, { language: t.language });
      const last = reply.answers.at(-1);
      const shown = last ? last.text : reply.text;
      const problems = [];
      if (!t.expect.length && !t.expectStatus && !t.expectState.length && !t.expectEffect.length) problems.push('test has no expect, expectStatus, expectState or expectEffect');
      for (const sub of t.expect) if (!shown.includes(sub)) problems.push(`expected "${sub}" in "${shown}"`);
      for (const spec of t.expectState) {
        const m = String(spec).match(/^(?:([\w.]+):)?([^=]+)=(.*)$/);
        if (!m) { problems.push(`bad expectState '${spec}'`); continue; }
        const actual = statePath(s.state(m[1] ?? t.worldId), m[2].trim());
        const shownValue = typeof actual === 'object' && actual !== null ? JSON.stringify(actual) : String(actual);
        if (shownValue !== m[3]) problems.push(`expected state ${m[2].trim()}=${m[3]}, got ${shownValue}`);
      }
      for (const name of t.expectEffect) if (!reply.effects.some((e) => e.name === name)) problems.push(`expected effect ${name}, got [${reply.effects.map((e) => e.name).join(', ')}]`);
      if (t.expectStatus && reply.statuses.at(-1) !== t.expectStatus) problems.push(`expected status ${t.expectStatus}, got ${reply.statuses.at(-1)} ("${shown}")`);
      if (problems.length) result.failed.push({ id: t.id, message: problems.join('; ') });
      else result.passed++;
    } catch (e) {
      result.failed.push({ id: t.id, message: `exception: ${e.message}` });
    }
  }
  return result;
}
