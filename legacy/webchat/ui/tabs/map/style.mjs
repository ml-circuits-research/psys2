// Stylesheet of the Map tab, injected once.
export const MAP_CSS = `
.p2-panel:has(> .geo-map-body) { padding: 0; position: relative; }
.p2-tabbody.geo-map-body { max-width: none; margin: 0; position: absolute; inset: 0; }
.geo-map { position: relative; width: 100%; height: 100%; min-height: 320px; background: #cfe3ee; overflow: hidden; font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2f2b24; }
.geo-map.is-osm { background: #e9e5dc; }
.geo-map .leaflet-container { background: transparent; font: inherit; }
.geo-labels { position: absolute; inset: 0; z-index: 450; pointer-events: none; transition: opacity .15s; }
.geo-labels.is-hidden { opacity: 0; }
.geo-chip { position: absolute; z-index: 800; left: 58px; top: 12px; max-width: min(70%, 420px); padding: 7px 12px; border-radius: 10px; background: rgba(255,255,255,.92); box-shadow: 0 1px 6px rgba(40,40,40,.25); pointer-events: none; transition: opacity .25s; }
.geo-chip[hidden] { display: block; opacity: 0; }
.geo-chip strong { display: block; font-size: 14px; }
.geo-chip span { color: #6a6358; font-size: 12px; }
.geo-layers { position: absolute; z-index: 800; right: 12px; top: 12px; display: flex; border-radius: 9px; overflow: hidden; box-shadow: 0 1px 6px rgba(40,40,40,.25); background: #fff; }
.geo-layers button { border: 0; background: transparent; padding: 6px 11px; font: inherit; font-size: 12px; cursor: pointer; color: #4a443a; }
.geo-layers button[aria-pressed="true"] { background: #2f6f9f; color: #fff; }
.geo-layers button:focus-visible { outline: 2px solid #f0a13a; outline-offset: -2px; }
.geo-status { position: absolute; z-index: 800; left: 12px; bottom: 26px; padding: 3px 9px; border-radius: 8px; background: rgba(255,255,255,.85); font-size: 11px; color: #6a6358; pointer-events: none; font-variant-numeric: tabular-nums; }
.geo-hint { position: absolute; z-index: 800; left: 50%; transform: translateX(-50%); bottom: 26px; max-width: 60%; padding: 4px 12px; border-radius: 9px; background: rgba(47,43,36,.78); color: #fff; font-size: 12px; text-align: center; pointer-events: none; }
.geo-note { position: absolute; z-index: 800; right: 12px; top: 50px; max-width: 260px; padding: 7px 11px; border-radius: 9px; background: #fff4d6; color: #5c4a14; font-size: 12px; box-shadow: 0 1px 6px rgba(40,40,40,.25); }
.geo-loading { position: absolute; inset: 0; z-index: 900; display: grid; place-items: center; background: #cfe3ee; color: #4a6a80; font-size: 14px; }
.geo-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.geo-pin { display: block; width: 22px; height: 22px; background: #e0443e; border: 2px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 5px rgba(0,0,0,.4); }
.geo-pin::after { content: ''; position: absolute; left: 5px; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.geo-me { display: block; width: 16px; height: 16px; border-radius: 50%; background: #2f7be0; border: 3px solid #fff; box-shadow: 0 0 0 0 rgba(47,123,224,.6); animation: geo-pulse 1.8s infinite; }
.geo-ring { display: block; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #1b6ca8; background: rgba(27,108,168,.15); animation: geo-ring 1.6s ease-out infinite; }
.geo-end { display: block; width: 12px; height: 12px; border-radius: 50%; background: #c2255c; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
.geo-km { display: block; padding: 2px 8px; border-radius: 10px; background: #c2255c; color: #fff; font-weight: 600; font-size: 12px; white-space: nowrap; transform: translate(-50%, -50%); box-shadow: 0 1px 4px rgba(0,0,0,.35); width: max-content; }
.geo-tip.leaflet-tooltip { background: rgba(255,255,255,.92); border: 0; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,.3); color: #2f2b24; font-weight: 600; font-size: 12px; padding: 2px 7px; }
.geo-tip.leaflet-tooltip-top:before, .geo-tip.leaflet-tooltip-right:before, .geo-tip.leaflet-tooltip-left:before, .geo-tip.leaflet-tooltip-bottom:before { display: none; }
.geo-country-tip.leaflet-tooltip { background: #2f2b24; color: #fff; border: 0; font-size: 12px; padding: 3px 8px; border-radius: 6px; opacity: .92; }
.geo-country-tip.leaflet-tooltip:before { display: none; }
.leaflet-container .leaflet-control-attribution { font-size: 10px; background: rgba(255,255,255,.75); }
.leaflet-container .leaflet-control-zoom a { color: #3a3630; }
@keyframes geo-pulse { 70% { box-shadow: 0 0 0 14px rgba(47,123,224,0); } 100% { box-shadow: 0 0 0 0 rgba(47,123,224,0); } }
@keyframes geo-ring { 0% { transform: scale(.55); opacity: 1; } 100% { transform: scale(1.25); opacity: .15; } }
@media (prefers-reduced-motion: reduce) { .geo-me, .geo-ring { animation: none; } }
@media (max-width: 640px) { .geo-hint { display: none; } }
`;
