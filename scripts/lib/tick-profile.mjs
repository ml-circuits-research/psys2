// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Per-site tick profile of a replay (spec 06 "Compute budgets", SCAN-PROFILE 2026-11-15): which budget sites do the work over a whole set, and which grow with the
 * length of the session (a scan per lookup of a structure that grows with the session makes a site's ticks per turn grow with the turn's position: the
 * LEARNED-MEM-INDEX fault).
 *
 *   profileSites(rows)   rows = [{ pos, tk: { total, sites: { <site>: ticks } } }]   (pos: the 0-based position of the turn in its session)
 *     -> { turns, total: { sum, p50, max }, sites: [{ site, sum, share, turns, p50, max, early, late, growth, slope }] }  sorted by sum, descending
 *   early / late: mean ticks per turn at positions < 10 and >= 20 (over all turns, a turn without the site counts 0); growth = late / early (null when either side is empty);
 *   slope: least-squares ticks per turn position (ticks added by each earlier turn of the session).
 */
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function profileSites(rows) {
  const withTk = rows.filter((r) => r.tk && r.tk.sites);
  const totals = withTk.map((r) => r.tk.total);
  const names = new Set(withTk.flatMap((r) => Object.keys(r.tk.sites)));
  const grand = totals.reduce((a, b) => a + b, 0) || 1;
  const early = withTk.filter((r) => r.pos < 10), late = withTk.filter((r) => r.pos >= 20);
  const mean = (rs, s) => (rs.length ? rs.reduce((a, r) => a + (r.tk.sites[s] ?? 0), 0) / rs.length : null);
  const n = withTk.length, mx = withTk.reduce((a, r) => a + r.pos, 0) / (n || 1);
  const sxx = withTk.reduce((a, r) => a + (r.pos - mx) ** 2, 0) || 1;
  const sites = [...names].map((site) => {
    const vals = withTk.map((r) => r.tk.sites[site] ?? 0);
    const used = vals.filter((v) => v > 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    const my = sum / (n || 1);
    const slope = withTk.reduce((a, r, i) => a + (r.pos - mx) * (vals[i] - my), 0) / sxx;
    const e = mean(early, site), l = mean(late, site);
    return { site, sum, share: Math.round((sum / grand) * 1000) / 10, turns: used.length, p50: pct(used, 0.5), max: used.length ? Math.max(...used) : 0, early: e == null ? null : Math.round(e), late: l == null ? null : Math.round(l), growth: e && l != null ? Math.round((l / e) * 100) / 100 : null, slope: Math.round(slope * 10) / 10 };
  }).sort((a, b) => b.sum - a.sum);
  return { turns: n, total: { sum: grand, p50: pct(totals, 0.5), max: totals.length ? Math.max(...totals) : 0 }, sites };
}

/** The printed table: the top `k` sites by total, then the top `k` by growth (slope per turn position). */
export function formatProfile(p, k = 15) {
  const f = (x) => (x == null ? '-' : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : String(x));
  const line = (s) => `  ${s.site.padEnd(28)} ${f(s.sum).padStart(7)} ${String(s.share).padStart(5)}% ${String(s.turns).padStart(5)} ${f(s.p50).padStart(7)} ${f(s.max).padStart(7)} ${f(s.early).padStart(7)} ${f(s.late).padStart(7)} ${String(s.growth ?? '-').padStart(6)} ${String(s.slope).padStart(8)}`;
  const head = `  ${'site'.padEnd(28)} ${'sum'.padStart(7)} ${'share'.padStart(6)} ${'turns'.padStart(5)} ${'p50'.padStart(7)} ${'max'.padStart(7)} ${'early'.padStart(7)} ${'late'.padStart(7)} ${'growth'.padStart(6)} ${'slope'.padStart(8)}`;
  return [`ticks per turn: p50 ${f(p.total.p50)}, max ${f(p.total.max)}, sum ${f(p.total.sum)} over ${p.turns} turns`, 'top sites by total:', head, ...p.sites.slice(0, k).map(line),
    'top sites by growth with the session (slope: ticks per turn position):', head, ...[...p.sites].sort((a, b) => b.slope - a.slope).slice(0, k).map(line)].join('\n');
}
