// Styles of the Music tab, scoped under .p2m. Uses the page variables of .p2 (light and dark).
export const CSS = `
.p2m { --key-color: var(--accent); display: grid; gap: 14px; }
.p2m * { box-sizing: border-box; }
.p2m-lock { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--warn); background: color-mix(in srgb, var(--warn) 12%, var(--surface)); cursor: pointer; font-size: 14px; text-align: left; width: 100%; }
.p2m-lock b { color: var(--warn); }
.p2m-hero { position: relative; overflow: hidden; border-radius: 18px; padding: 18px 20px; color: #fff; min-height: 118px;
  background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--key-color) 85%, #0b1220) 0%, #101a2e 62%, #0b1220 100%); box-shadow: 0 8px 28px rgba(8, 14, 30, .28); }
.p2m-hero canvas { position: absolute; inset: auto 0 0 0; width: 100%; height: 64%; opacity: .9; pointer-events: none; }
.p2m-hero-in { position: relative; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.p2m-title { margin: 0; font-size: 22px; letter-spacing: .2px; font-weight: 700; }
.p2m-sub { margin: 4px 0 0; opacity: .82; font-size: 13.5px; max-width: 34em; }
.p2m-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.14); backdrop-filter: blur(4px); font-size: 13px; font-weight: 600; max-width: 100%; }
.p2m-pill i { width: 9px; height: 9px; border-radius: 50%; background: #9aa7b4; flex: none; }
.p2m-pill.is-on i { background: #5ef2a1; box-shadow: 0 0 0 0 rgba(94,242,161,.7); animation: p2m-pulse 1.1s infinite; }
.p2m-pill.is-lock i { background: #ffb454; }
.p2m-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes p2m-pulse { 0% { box-shadow: 0 0 0 0 rgba(94,242,161,.65); } 100% { box-shadow: 0 0 0 10px rgba(94,242,161,0); } }
.p2m-now { position: relative; margin-top: 14px; font-size: 13px; opacity: .9; min-height: 1.3em; }
.p2m-bar { position: relative; height: 3px; margin-top: 6px; border-radius: 3px; background: rgba(255,255,255,.18); overflow: hidden; }
.p2m-bar b { display: block; height: 100%; width: 0; background: #fff; border-radius: 3px; }
.p2m-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; }
.p2m-card h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.p2m-controls { display: grid; gap: 12px; }
.p2m-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.p2m-chip { --c: var(--accent); border: 1px solid var(--line); background: var(--surface-2); border-radius: 999px; padding: 6px 12px 6px 10px; cursor: pointer; display: inline-flex; gap: 7px; align-items: center; font-size: 13.5px; }
.p2m-chip::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.p2m-chip:hover { border-color: var(--c); }
.p2m-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--c) 18%, var(--surface)); border-color: var(--c); font-weight: 650; }
.p2m-meter { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); font-size: 13.5px; }
.p2m-meter b { min-width: 3.2em; text-align: center; font-variant-numeric: tabular-nums; }
.p2m-meter small { color: var(--muted); }
.p2m-round { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-weight: 700; line-height: 1; }
.p2m-round:hover { border-color: var(--accent); color: var(--accent); }
.p2m-vol { width: 120px; accent-color: var(--accent); }
.p2m-btn { border: 0; border-radius: 999px; padding: 8px 16px; font-weight: 650; cursor: pointer; background: var(--accent); color: var(--accent-ink); display: inline-flex; gap: 6px; align-items: center; }
.p2m-btn.is-ghost { background: var(--surface-2); color: var(--ink); border: 1px solid var(--line); }
.p2m-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 22%, var(--surface)); color: var(--ink); border: 1px solid var(--accent); }
.p2m-sheetwrap { background: #fffdf8; color: #1b1a17; border-radius: 12px; padding: 8px 10px; min-height: 120px; border: 1px solid var(--line); }
@media (prefers-color-scheme: dark) { .p2m-sheetwrap { background: #f6f1e6; } }
.p2m-sheet svg { width: 100%; height: auto; display: block; }
.p2m-sheet .abcjs-title { font-weight: 700; }
.p2m-hl, .p2m-hl * { fill: var(--key-color, #0f766e) !important; stroke: var(--key-color, #0f766e) !important; }
.p2m-empty { margin: 0; padding: 26px 8px; text-align: center; color: #6b665c; font-size: 14px; }
.p2m-meta { display: flex; gap: 14px; flex-wrap: wrap; margin: 10px 2px 0; color: var(--muted); font-size: 13px; }
.p2m-meta b { color: var(--ink); font-weight: 650; }
.p2m-piano { position: relative; height: 150px; user-select: none; touch-action: manipulation; border-radius: 0 0 10px 10px; overflow: hidden; background: #14181d; padding-top: 6px; }
.p2m-key { position: absolute; top: 0; margin: 0; padding: 0; border: 0; cursor: pointer; transition: background .08s, transform .08s, box-shadow .12s; }
.p2m-key.is-white { height: calc(100% - 6px); top: 6px; background: linear-gradient(#fbfbf8, #e9e7e0); border: 1px solid #9b978d; border-radius: 0 0 7px 7px; color: #6e6a62; z-index: 1; }
.p2m-key.is-black { height: 62%; top: 6px; background: linear-gradient(#3b4048, #0e1013); border-radius: 0 0 5px 5px; z-index: 2; box-shadow: 0 2px 3px rgba(0,0,0,.5); }
.p2m-keyname { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font-size: 10.5px; pointer-events: none; }
.p2m-key.is-idle.is-white { background: linear-gradient(color-mix(in srgb, var(--key-color) 28%, #fff), color-mix(in srgb, var(--key-color) 50%, #fff)); color: #111; }
.p2m-key.is-idle.is-black { background: linear-gradient(color-mix(in srgb, var(--key-color) 70%, #111), color-mix(in srgb, var(--key-color) 50%, #000)); }
.p2m-key.is-live.is-white { background: var(--key-color); color: #fff; box-shadow: inset 0 -10px 18px rgba(0,0,0,.18), 0 0 18px var(--key-color); transform: translateY(2px); }
.p2m-key.is-live.is-black { background: var(--key-color); box-shadow: 0 0 16px var(--key-color); transform: translateY(2px); }
.p2m-key.is-press { transform: translateY(2px); filter: brightness(.94); }
.p2m-songs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.p2m-song { text-align: left; border: 1px solid var(--line); background: var(--surface-2); border-radius: 12px; padding: 9px 11px; cursor: pointer; display: grid; gap: 2px; }
.p2m-song:hover { border-color: var(--accent); }
.p2m-song[aria-current="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.p2m-song b { font-size: 13.5px; }
.p2m-song span { font-size: 12px; color: var(--muted); }
.p2m-tips { display: flex; gap: 6px; flex-wrap: wrap; }
.p2m-tip { border: 1px dashed var(--line); background: transparent; border-radius: 999px; padding: 4px 10px; font-size: 12.5px; cursor: pointer; color: var(--muted); }
.p2m-tip:hover { color: var(--ink); border-color: var(--accent); }
`;
