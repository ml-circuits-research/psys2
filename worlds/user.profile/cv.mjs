// CV view of a profile state (spec 12): the model the Profile tab draws and the Markdown/JSON exports. Browser-safe, imports nothing.
//
// PLAN_FALLBACK mirrors the fields of kb.sop (a test checks that they agree); the tab uses it before the world has put the real plan
// into its state, ops.mjs uses the knowledge base.
export const SECTIONS_FALLBACK = [
  {"id":"basics","label":"Basics","order":1},
  {"id":"professional","label":"Professional","order":2},
  {"id":"education","label":"Education","order":3},
  {"id":"skills","label":"Skills","order":4},
  {"id":"interests","label":"Interests","order":5},
  {"id":"goals","label":"Goals","order":6},
  {"id":"preferences","label":"Preferences","order":7},
];
export const PLAN_FALLBACK = [
  {"id":"name","section":"basics","label":"Preferred name","prio":10,"card":"one","want":"what to call you","example":"Andy"},
  {"id":"address","section":"basics","label":"How to address you","prio":5,"card":"one","want":"how formal to be when I address you","example":"first name","needs":"name"},
  {"id":"location","section":"basics","label":"City or country","prio":3,"card":"one","want":"where you are based (city or country, never an address)","example":"Cluj, Romania"},
  {"id":"role","section":"professional","label":"Current role","prio":9,"card":"one","want":"what you do for work","example":"software engineer"},
  {"id":"field","section":"professional","label":"Field or industry","prio":8,"card":"one","want":"which field or industry you work in","example":"healthcare","needs":"role"},
  {"id":"org","section":"professional","label":"Organisation","prio":4,"card":"one","want":"where you work (optional)","example":"Acme","needs":"role"},
  {"id":"years","section":"professional","label":"Years of experience","prio":6,"card":"one","want":"how long you have been doing this","example":"12","needs":"role"},
  {"id":"previous","section":"professional","label":"Previous roles","prio":3,"card":"many","want":"what you did before","example":"teacher, barista","needs":"role"},
  {"id":"education","section":"education","label":"Education","prio":5,"card":"one","want":"what you studied and where","example":"Physics at Cluj"},
  {"id":"skills","section":"skills","label":"Skills","prio":6,"card":"many","want":"what you are good at","example":"leadership, writing"},
  {"id":"tools","section":"skills","label":"Tools and languages","prio":5,"card":"many","want":"tools, software or programming languages you use","example":"Python, SQL"},
  {"id":"hobbies","section":"interests","label":"Hobbies","prio":7,"card":"many","want":"what you like doing in your free time","example":"hiking, chess"},
  {"id":"topics","section":"interests","label":"Topics you like","prio":5,"card":"many","want":"topics you enjoy reading or talking about","example":"space, history"},
  {"id":"media","section":"interests","label":"Books, music and films","prio":4,"card":"many","want":"books, music or films you love","example":"Dune, jazz"},
  {"id":"sports","section":"interests","label":"Sports","prio":3,"card":"many","want":"sports you play or follow","example":"football"},
  {"id":"learning","section":"goals","label":"Learning goals","prio":6,"card":"many","want":"what you would like to learn","example":"Rust, public speaking"},
  {"id":"career","section":"goals","label":"Career goals","prio":4,"card":"one","want":"where you want your work to go","example":"lead a team","needs":"role"},
  {"id":"year","section":"goals","label":"Goal for this year","prio":5,"card":"one","want":"what you want to achieve this year","example":"run a half marathon"},
  {"id":"length","section":"preferences","label":"Answer length","prio":6,"card":"one","want":"whether you like short or detailed answers","example":"short"},
  {"id":"tone","section":"preferences","label":"Tone","prio":5,"card":"one","want":"formal or casual","example":"casual"},
  {"id":"language","section":"preferences","label":"Preferred language","prio":4,"card":"one","want":"which language you prefer for answers","example":"English"},
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/** Known fields (said or guessed) and counts. */
export function counts(state, plan = PLAN_FALLBACK) {
  const f = state?.fields ?? {};
  const known = plan.filter((p) => list(f[p.id]?.v).length).length;
  const skipped = plan.filter((p) => !list(f[p.id]?.v).length && state?.skipped?.[p.id]).length;
  return { known, total: plan.length, skipped };
}

/** { name, headline, line, sections: [{ id, label, fields: [{ id, label, values, src, note, want, example, skipped }] }], counts } */
export function buildView(state, plan = state?.plan ?? PLAN_FALLBACK, sections = SECTIONS_FALLBACK) {
  const f = state?.fields ?? {};
  const val = (id) => list(f[id]?.v);
  const name = val('name')[0] ?? '';
  const headline = [val('role')[0] ? cap(val('role')[0]) : '', val('field')[0] ? cap(val('field')[0]) : ''].filter(Boolean).join(' · ');
  const line = [val('org')[0], val('location')[0], val('years')[0] ? `${val('years')[0]} years of experience` : ''].filter(Boolean).join(' · ');
  const secs = sections.map((s) => ({
    id: s.id, label: s.label,
    fields: plan.filter((p) => p.section === s.id).map((p) => ({
      id: p.id, label: p.label, card: p.card, values: val(p.id), src: f[p.id]?.src ?? null, note: f[p.id]?.note ?? '', want: p.want, example: p.example,
      skipped: !val(p.id).length && !!state?.skipped?.[p.id],
    })),
  })).filter((s) => s.fields.length);
  return { name, headline, line, sections: secs, counts: counts(state, plan) };
}

/** The profile as JSON text: every known field with where it came from. */
export function toJson(state, plan = state?.plan ?? PLAN_FALLBACK) {
  const f = state?.fields ?? {};
  const fields = {};
  for (const p of plan) if (list(f[p.id]?.v).length) fields[p.id] = { label: p.label, value: f[p.id].v, source: f[p.id].src, ...(f[p.id].note ? { note: f[p.id].note } : {}) };
  const notes = (state?.sensitive ?? []).map((x) => ({ category: x.cat, text: x.text }));
  return JSON.stringify({ format: 'psys2-profile', version: 1, fields, ...(notes.length ? { privateNotes: notes } : {}) }, null, 2);
}

/** The profile as a one-page Markdown CV. */
export function toMarkdown(state, plan = state?.plan ?? PLAN_FALLBACK, sections = SECTIONS_FALLBACK) {
  const v = buildView(state, plan, sections);
  const out = [`# ${v.name || 'Profile'}`];
  if (v.headline) out.push(`**${v.headline}**`);
  if (v.line) out.push(v.line);
  for (const s of v.sections) {
    const rows = s.fields.filter((x) => x.values.length && !(s.id === 'basics') && !(s.id === 'professional' && ['role', 'field', 'org', 'years'].includes(x.id)));
    const basics = s.id === 'basics' ? s.fields.filter((x) => x.values.length && !['name', 'location'].includes(x.id)) : [];
    const all = [...rows, ...basics];
    if (!all.length) continue;
    out.push('', `## ${s.label}`);
    for (const x of all) out.push(`- **${x.label}:** ${x.values.map(cap).join(', ')}${x.src === 'guessed' ? ' (guessed)' : ''}${x.note ? ` (${x.note})` : ''}`);
  }
  out.push('', '_Built by PSys2 from a conversation; kept only in this browser._');
  return out.join('\n') + '\n';
}
