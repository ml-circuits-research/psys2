// Map tab (spec 07 §6-7): draws the state of the world geo.map with Leaflet (vendor/map/leaflet.mjs, BSD-2-Clause).
// Default base map: offline country outlines from Natural Earth (vendor/map/countries-50m.json, public domain) with
// country names and city labels from vendor/map/places.json (GeoNames, CC BY 4.0). Optional layer: OpenStreetMap raster tiles.
// The world owns the state (center, zoom, bounds, markers, highlighted, lines, layer, focus, me); this file only renders it.
// Clicks become typed commands through host.send, so mouse and voice share one language layer.
import { h } from '../util.mjs';
import { topoFeatures, greatCircle, fmtKm } from './map/geo.mjs';
import { createLabels } from './map/labels.mjs';
import { MAP_CSS } from './map/style.mjs';

const WORLD = 'geo.map';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const DATA_ATTRIBUTION = 'Outlines: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> (public domain) &middot; Places: <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';
const DEFAULT_STATE = { center: { lat: 25, lon: 10 }, zoom: 2, bounds: null, markers: [], highlighted: [], lines: [], layer: 'offline', focus: null };
const LAND = { fill: '#f1ead8', stroke: '#b8ad92' };

function injectCss() {
  if (document.getElementById('geo-map-css')) return;
  document.head.append(h('style', { id: 'geo-map-css' }, MAP_CSS));
}
const textNode = (name, label) => h('div', {}, h('strong', {}, name), label ? h('br') : null, label ? h('span', {}, label) : null);

function make(holder, host) {
  injectCss();
  holder.classList.add('geo-map-body');
  const root = h('div', { class: 'geo-map', role: 'application', 'aria-label': 'World map. Use the chat or your voice to move it.' });
  const loading = h('div', { class: 'geo-loading' });   // empty while loading (the host's progress panel names the step); the text appears only on failure
  const chip = h('div', { class: 'geo-chip', hidden: true, 'aria-hidden': 'true' });
  const statusEl = h('div', { class: 'geo-status', 'aria-hidden': 'true' });
  const sr = h('p', { class: 'geo-sr', 'aria-live': 'polite' });
  const hint = h('div', { class: 'geo-hint' }, 'Try: “show me Paris” · “zoom in” · “how far is Paris from Rome?” · “highlight Romania and its neighbours”');
  const offBtn = h('button', { type: 'button', 'aria-pressed': 'true', title: 'Offline country map', onclick: () => host.send('switch to the offline map') }, 'Offline');
  const osmBtn = h('button', { type: 'button', 'aria-pressed': 'false', title: 'Street map (OpenStreetMap tiles, needs internet)', onclick: () => host.send('switch to the street map') }, 'Street map');
  const layers = h('div', { class: 'geo-layers', role: 'group', 'aria-label': 'Base map' }, offBtn, osmBtn);
  const mapEl = h('div', { style: 'position:absolute;inset:0' });
  root.append(mapEl, chip, layers, statusEl, hint, sr, loading);
  holder.append(root);

  let L = null, map = null, places = null, countries = null, labels = null, tiles = null, osmReady = false, note = null;
  let state = { ...DEFAULT_STATE }, lastKey = null, pendingState = null, destroyed = false, flying = 0, programmatic = 0, progTimer = 0, reportTimer = 0, tilesLoaded = false, tileErrors = 0;
  let countryLayers = new Map(), markerLayer = null, lineLayer = null, focusLayer = null, ro = null, focusKey = null;

  const key = (s) => JSON.stringify(s.bounds ?? [s.center, s.zoom]);
  const sizeOk = () => root.clientWidth > 20 && root.clientHeight > 20;

  async function init() {
    host.progress?.start('map-data', 'Loading the map: countries and places');   // PROGRESS: the one panel, no spinner of the tab's own
    try {
      const [lib, topo, pl] = await Promise.all([
        import(host.asset('vendor/map/leaflet.mjs')),
        fetch(host.asset('vendor/map/countries-50m.json')).then((r) => { if (!r.ok) throw new Error(`countries: HTTP ${r.status}`); return r.json(); }),
        fetch(host.asset('vendor/map/places.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (destroyed) return;
      L = lib.default;
      places = pl;
      countries = topoFeatures(topo, 'countries');
      build();
      host.progress?.end('map-data');
    } catch (e) {
      console.warn('map tab failed to start', e);
      loading.textContent = `The map could not be loaded (${e?.message ?? e}).`;
      host.progress?.fail('map-data', 'The map could not be loaded', 'the other tabs still work');
    }
  }

  function build() {
    map = L.map(mapEl, { zoomControl: true, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 1, wheelPxPerZoomLevel: 90,
      minZoom: 1, maxZoom: 12, preferCanvas: true, center: [state.center.lat, state.center.lon], zoom: state.zoom, inertia: true });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(DATA_ATTRIBUTION);

    // graticule (every 10 degrees, stronger every 30)
    const grat = L.layerGroup().addTo(map);
    for (let lon = -180; lon <= 180; lon += 10) L.polyline([[-85, lon], [85, lon]], { color: '#fff', weight: lon % 30 === 0 ? 1 : 0.6, opacity: lon % 30 === 0 ? 0.5 : 0.28, interactive: false }).addTo(grat);
    for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], { color: '#fff', weight: lat % 30 === 0 ? 1 : 0.6, opacity: lat % 30 === 0 ? 0.5 : 0.28, interactive: false }).addTo(grat);

    // countries
    const names = new Map((places?.countries ?? []).map((c) => [c[0], c[1]]));
    const geo = L.geoJSON({ type: 'FeatureCollection', features: countries }, {
      style: () => ({ color: LAND.stroke, weight: 0.8, fillColor: LAND.fill, fillOpacity: 1, bubblingMouseEvents: false }),
      onEachFeature(f, layer) {
        const cc = f.properties.cc;
        if (cc) countryLayers.set(cc, [...(countryLayers.get(cc) ?? []), layer]);
        layer.bindTooltip(names.get(cc) ?? f.properties.name, { sticky: true, className: 'geo-country-tip', direction: 'top', opacity: 0.92 });
        layer.on('click', (ev) => onCountryClick(cc, names.get(cc) ?? f.properties.name, ev.latlng));
      },
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    lineLayer = L.layerGroup().addTo(map);
    focusLayer = L.layerGroup().addTo(map);

    labels = createLabels(map, root, () => ({ places, state, osm: state.layer === 'osm' && osmReady }));
    map.on('click', (ev) => onMapClick(ev.latlng));
    map.on('moveend', () => { if (!programmatic) scheduleReport(); updateStatus(); });
    map.on('zoom', updateStatus);

    ro = new ResizeObserver(() => { if (map && sizeOk()) { map.invalidateSize({ animate: false }); labels.resize(); labels.redraw(); if (pendingState) { const s = pendingState; pendingState = null; apply(s, true); } } });
    ro.observe(root);
    loading.remove();
    apply(pendingState ?? state, true);
    pendingState = null;
    updateStatus();
  }

  // ---- reading the state ----
  function updateStatus() {
    if (!map) return;
    const c = map.getCenter();
    statusEl.textContent = `zoom ${Math.round(map.getZoom() * 4) / 4} · ${Math.abs(c.lat).toFixed(2)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(((c.lng + 540) % 360) - 180).toFixed(2)}°${((c.lng + 540) % 360) - 180 >= 0 ? 'E' : 'W'}`;
  }
  // A view change that the world itself asked for (apply: layer clamp, fly) is not a user move: its intermediate
  // (animated) views must never be reported back, or the host would overwrite the state the world just set (a clamp by the
  // library, an undo/redo). The guard ends when the animation ends, with a timeout as a safety net.
  function beginProgrammatic(ms) {
    programmatic++; clearTimeout(reportTimer);
    const done = () => { programmatic = Math.max(0, programmatic - 1); clearTimeout(reportTimer); };
    let over = false;
    const end = () => { if (over) return; over = true; clearTimeout(t); done(); };
    const t = setTimeout(end, ms);
    return end;
  }
  function scheduleReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      if (!map || destroyed || programmatic) return;
      const c = map.getCenter(), lon = ((c.lng + 540) % 360) - 180;
      const patch = { center: { lat: Number(c.lat.toFixed(4)), lon: Number(lon.toFixed(4)) }, zoom: Math.round(map.getZoom() * 4) / 4, bounds: null };
      // An echo of the state the world itself set (same zoom, same center, no bounds to fit) is no user move: adopting it would make the library
      // take a "change" over (a turn that clears the redo steps, a new undo step) and the clamp or undo of the library would be overwritten.
      const same = state.bounds == null && Math.abs(patch.zoom - state.zoom) < 0.01 && Math.abs(patch.center.lat - state.center.lat) < 0.01 && Math.abs(patch.center.lon - state.center.lon) < 0.01;
      if (same) return;
      state = { ...state, ...patch };
      lastKey = key(state);
      host.setWorldState?.(WORLD, patch);
    }, 350);
  }

  function apply(s, force = false) {
    if (!map) { pendingState = s; return; }
    const prevLayer = state.layer;
    state = { ...DEFAULT_STATE, ...s };
    if (!sizeOk()) { pendingState = s; return; }
    clearTimeout(reportTimer);
    beginProgrammatic(450);   // ends by its own timeout: a clamp by setMaxZoom animates and ends later than this call
    setLayer(state.layer);
    drawCountries();
    drawMarkers();
    drawLines();
    drawFocus();
    offBtn.setAttribute('aria-pressed', String(state.layer !== 'osm'));
    osmBtn.setAttribute('aria-pressed', String(state.layer === 'osm'));
    root.classList.toggle('is-osm', state.layer === 'osm');
    const k = key(state);
    if (force || k !== lastKey) { lastKey = k; fly(force); }
    labels?.redraw();
    if (prevLayer !== state.layer) updateStatus();
  }

  function fly(instant) {
    const dur = instant ? 0 : 1.3;
    const opts = { animate: !instant, duration: dur, easeLinearity: 0.25 };
    const b = state.bounds;
    flying++;
    const endProg = beginProgrammatic(dur * 1000 + 500);
    map.once('moveend', () => { flying = Math.max(0, flying - 1); setTimeout(endProg, 0); });
    if (b) {
      const bounds = L.latLngBounds(b[0], b[1]);
      if (instant) map.fitBounds(bounds, { animate: false, padding: [24, 24], maxZoom: 10 });
      else map.flyToBounds(bounds, { ...opts, padding: [24, 24], maxZoom: 10 });
    } else if (instant) map.setView([state.center.lat, state.center.lon], state.zoom, { animate: false });
    else map.flyTo([state.center.lat, state.center.lon], state.zoom, opts);
  }

  // ---- layers ----
  function setLayer(layer) {
    const osm = layer === 'osm';
    map.setMaxZoom(osm ? 18 : 12);
    if (osm && !tiles) {
      tilesLoaded = false; tileErrors = 0;
      tiles = L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION, crossOrigin: true });
      tiles.on('tileload', () => { if (!tilesLoaded) { tilesLoaded = true; osmReady = true; showNote(null); drawCountries(); labels?.redraw(); } });
      tiles.on('tileerror', () => {
        tileErrors++;
        if (!tilesLoaded && tileErrors === 4) showNote('The street map needs an internet connection and could not load its tiles, so you see the offline country map.');
      });
      tiles.addTo(map);
      tiles.bringToBack();
    } else if (!osm && tiles) {
      map.removeLayer(tiles); tiles = null; osmReady = false; showNote(null); labels?.redraw();
    }
  }
  function showNote(text) {
    note?.remove(); note = null;
    if (text) { note = h('div', { class: 'geo-note', role: 'status' }, text); root.append(note); }
  }

  function drawCountries() {
    if (!countryLayers.size) return;
    const hl = new Set((state.highlighted ?? []).map((x) => x.cc));
    const focusCc = state.focus?.kind === 'country' || state.focus?.kind === 'city' ? state.focus.cc : null;
    const osm = state.layer === 'osm' && osmReady;
    for (const [cc, layersOf] of countryLayers) {
      let style;
      if (hl.has(cc)) style = { fillColor: '#f0a13a', fillOpacity: osm ? 0.5 : 0.82, color: '#a85d08', weight: 1.6 };
      else if (focusCc === cc && state.focus?.kind === 'country') style = { fillColor: osm ? '#2f7be0' : '#cfe6f7', fillOpacity: osm ? 0.18 : 1, color: '#1b6ca8', weight: 2.4 };
      else style = osm ? { fillColor: '#ffffff', fillOpacity: 0, color: '#8a8272', weight: 0.7 } : { fillColor: LAND.fill, fillOpacity: 1, color: LAND.stroke, weight: 0.8 };
      for (const l of layersOf) { l.setStyle(style); if (hl.has(cc) || focusCc === cc) l.bringToFront(); }
    }
    // the sea shows through where there is no land; unknown (id-less) countries keep the default style
  }

  const pinIcon = (m) => (m.id === 'me'
    ? L.divIcon({ className: '', html: '<span class="geo-me"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
    : L.divIcon({ className: '', html: '<span class="geo-pin"></span>', iconSize: [22, 24], iconAnchor: [11, 24], popupAnchor: [0, -22] }));
  function drawMarkers() {
    markerLayer.clearLayers();
    const many = (state.markers ?? []).length > 40;
    for (const m of state.markers ?? []) {
      const mk = L.marker([m.lat, m.lon], { icon: pinIcon(m), title: m.name, keyboard: true, riseOnHover: true }).addTo(markerLayer);
      mk.bindPopup(textNode(m.name, m.label), { offset: [0, -2], closeButton: false });
      if (m.id === 'me') mk.bindTooltip(m.name, { permanent: true, direction: 'top', offset: [0, -10], className: 'geo-tip' });
      else mk.bindTooltip(m.name, { permanent: !many, direction: 'right', offset: [10, -12], className: 'geo-tip', opacity: 0.95 });
    }
  }
  function drawLines() {
    lineLayer.clearLayers();
    for (const ln of state.lines ?? []) {
      const pts = greatCircle(ln.from, ln.to);
      L.polyline(pts, { color: '#fff', weight: 6, opacity: 0.8, interactive: false }).addTo(lineLayer);
      L.polyline(pts, { color: '#c2255c', weight: 3, dashArray: '8 7', interactive: false }).addTo(lineLayer);
      [[ln.from, pts[0]], [ln.to, pts[pts.length - 1]]].forEach(([p, at]) => {
        L.marker(at, { icon: L.divIcon({ className: '', html: '<span class="geo-end"></span>', iconSize: [12, 12], iconAnchor: [6, 6] }), interactive: false })
          .bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -6], className: 'geo-tip' }).addTo(lineLayer);
      });
      const mid = pts[Math.floor(pts.length / 2)];
      L.marker(mid, { icon: L.divIcon({ className: '', html: `<span class="geo-km">${fmtKm(ln.km)}</span>`, iconSize: [0, 0] }), interactive: false }).addTo(lineLayer);
    }
  }
  function drawFocus() {
    focusLayer.clearLayers();
    const f = state.focus;
    if (!f) { chip.hidden = true; chip.setAttribute('aria-hidden', 'true'); sr.textContent = ''; focusKey = null; return; }
    chip.replaceChildren(h('strong', {}, f.name), f.label ? h('span', {}, f.label) : null);
    chip.hidden = false; chip.removeAttribute('aria-hidden');
    const k = `${f.name}|${f.lat}|${f.lon}`;
    if (k !== focusKey) { focusKey = k; sr.textContent = `${f.name}${f.label ? `: ${f.label}` : ''}`; }
    if (['city', 'point', 'me'].includes(f.kind)) {
      L.marker([f.lat, f.lon], { icon: L.divIcon({ className: '', html: '<span class="geo-ring"></span>', iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false, keyboard: false }).addTo(focusLayer);
      if (f.kind === 'city') L.marker([f.lat, f.lon], { icon: L.divIcon({ className: '', html: '', iconSize: [0, 0] }), interactive: false }).bindTooltip(f.name, { permanent: true, direction: 'top', offset: [0, -20], className: 'geo-tip' }).addTo(focusLayer);
    }
  }

  // ---- clicks become commands ----
  function onCountryClick(cc, name, ll) {
    if (!map) return;
    if (cc && map.getZoom() < 6) { host.send(`show ${name}`); return; }
    onMapClick(ll, cc, name);
  }
  function onMapClick(ll, cc = null, name = null) {
    const lon = ((ll.lng + 540) % 360) - 180;
    host.setWorldState?.(WORLD, { clicked: { lat: Number(ll.lat.toFixed(4)), lon: Number(lon.toFixed(4)), cc, country: name } });
    host.send('what is here?');
  }

  init();
  return {
    update(s) { const next = s && typeof s === 'object' ? s : DEFAULT_STATE; if (s && (s.focus || s.markers?.length || s.highlighted?.length || s.lines?.length)) hint.remove(); if (!map) { pendingState = next; state = { ...DEFAULT_STATE, ...next }; } else apply(next); },
    /** Test and embedding hook: the Leaflet map once it is ready. */
    get map() { return map; },
    destroy() { destroyed = true; clearTimeout(reportTimer); ro?.disconnect(); labels?.destroy(); map?.remove(); root.remove(); },
  };
}

/** Browser geolocation as an effect: the outcome goes back to the world through the observation loop (spec 07 §6). */
async function locate() {
  if (!('geolocation' in navigator)) return { ok: false, detail: 'this browser has no geolocation' };
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => resolve({ ok: true, detail: 'position found', data: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy } }),
    (e) => resolve({ ok: false, detail: e.code === 1 ? 'permission denied' : e.code === 2 ? 'position unavailable' : 'timed out' }),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
  ));
}

export default {
  id: 'map', label: 'Map', world: WORLD, order: 60,
  make,
  effects: { 'geo.locate': async () => locate() },
};
