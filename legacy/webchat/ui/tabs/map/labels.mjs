// Canvas label layer of the Map tab: country names, city dots and names (offline base map), names of highlighted countries.
// Drawn over the map in container pixels; redrawn on every map move; hidden while a zoom animation runs.
import { minCityPop, countryPixels } from './geo.mjs';

export function createLabels(map, container, getContext) {
  const canvas = document.createElement('canvas');
  canvas.className = 'geo-labels';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  let raf = 0;
  const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  function resize() {
    const r = map.getSize(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.x * dpr); canvas.height = Math.round(r.y * dpr);
    canvas.style.width = `${r.x}px`; canvas.style.height = `${r.y}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    raf = 0;
    const { places, state, osm } = getContext();
    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
    if (!places) return;
    const z = map.getZoom();
    const taken = [];
    const skip = new Set([state.focus?.name, ...((state.markers ?? []).length <= 40 ? state.markers.map((m) => m.name) : [])].filter(Boolean));
    const free = (x, y, w, h) => {
      if (x < -w || y < -h || x > size.x || y > size.y) return false;
      for (const t of taken) if (x < t[0] + t[2] && x + w > t[0] && y < t[1] + t[3] && y + h > t[1]) return false;
      taken.push([x, y, w, h]);
      return true;
    };
    const halo = (text, x, y, color, font, halo = 'rgba(244,239,227,.92)') => {
      ctx.font = font; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.strokeStyle = halo; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    };
    ctx.textBaseline = 'middle';
    const pt = (lat, lon) => map.latLngToContainerPoint([lat, lon]);

    // highlighted countries first (so their names win collisions)
    ctx.textAlign = 'center';
    for (const h of state.highlighted ?? []) {
      const p = pt(h.lat, h.lon);
      const font = `700 ${z < 3 ? 11 : 13}px ${FONT}`;
      ctx.font = font;
      const w = ctx.measureText(h.name).width + 6;
      if (free(p.x - w / 2, p.y - 8, w, 16)) halo(h.name, p.x, p.y, '#6b3a05', font, 'rgba(255,236,200,.95)');
    }
    if (osm) return;

    // country names
    ctx.textAlign = 'center';
    const hl = new Set((state.highlighted ?? []).map((h) => h.cc));
    for (const [cc, name, lat, lon, , area] of places.countries) {
      if (hl.has(cc) || !area) continue;
      const px = countryPixels(area, z, lat), w0 = name.length * 6.2;
      if (px < w0 * 0.85 || z > 7) continue;
      const size2 = Math.max(9, Math.min(15, px / name.length * 1.35));
      const text = name.toUpperCase();
      const font = `600 ${size2.toFixed(1)}px ${FONT}`;
      ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
      const w = ctx.measureText(text).width + 4;
      const p = pt(lat, lon);
      if (free(p.x - w / 2, p.y - size2 / 2, w, size2)) { ctx.fillStyle = 'rgba(122,111,88,.85)'; ctx.strokeStyle = 'rgba(244,239,227,.75)'; ctx.lineWidth = 2.5; ctx.strokeText(text, p.x, p.y); ctx.fillText(text, p.x, p.y); }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    // cities
    const minPop = minCityPop(z);
    ctx.textAlign = 'left';
    for (const [name, lat, lon, pop, cap, cc] of places.cities) {
      if (skip.has(name)) continue;
      const show = (cap && z >= 4) || pop >= minPop;   // SETTINGS-COHERENT 3: no country gets more labels than another
      if (!show) continue;
      const p = pt(lat, lon);
      if (p.x < -20 || p.y < -20 || p.x > size.x + 20 || p.y > size.y + 20) continue;
      const r = Math.max(2.2, Math.min(6, Math.log10(pop) - 3.4));
      ctx.beginPath();
      if (cap) { ctx.rect(p.x - r, p.y - r, r * 2, r * 2); ctx.fillStyle = '#3b3a36'; } else { ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#7b5e3b'; }
      ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
      const font = `${cap ? 600 : 500} ${cap ? 11.5 : 11}px ${FONT}`;
      ctx.font = font;
      const w = ctx.measureText(name).width + 4;
      if (free(p.x + r + 2, p.y - 7, w, 14)) halo(name, p.x + r + 3, p.y, '#3b3a36', font);
    }
  }

  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  map.on('move zoom moveend zoomend viewreset', redraw);
  map.on('zoomstart', () => canvas.classList.add('is-hidden'));
  map.on('zoomend', () => { canvas.classList.remove('is-hidden'); redraw(); });
  map.on('resize', () => { resize(); redraw(); });
  resize();
  return { redraw, resize, destroy() { cancelAnimationFrame(raf); canvas.remove(); } };
}
