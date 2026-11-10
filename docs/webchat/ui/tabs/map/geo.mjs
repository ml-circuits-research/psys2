// Pure helpers of the Map tab (no DOM, no Leaflet): TopoJSON decoding, great-circle lines, label rules.

/** Decode the features of a TopoJSON object (quantized or not) to GeoJSON features: [{ type, properties, geometry }]. */
export function topoFeatures(topology, objectName) {
  const obj = topology.objects[objectName];
  const { scale = [1, 1], translate = [0, 0] } = topology.transform ?? {};
  const quantized = !!topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      if (quantized) { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }
      return [dx, dy];
    });
  });
  const arcCoords = (i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]);
  const ring = (ids) => { const out = []; ids.forEach((id, k) => { const c = arcCoords(id); out.push(...(k ? c.slice(1) : c)); }); return out; };
  const geometry = (g) => {
    if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.arcs.map(ring) };
    if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.arcs.map((p) => p.map(ring)) };
    return null;
  };
  return obj.geometries.map((g) => ({ type: 'Feature', id: g.id, properties: g.properties ?? {}, geometry: geometry(g) })).filter((f) => f.geometry);
}

const RAD = Math.PI / 180;
/** Points of the great-circle arc a -> b ({ lat, lon }), longitudes unwrapped so the line never jumps across the antimeridian. */
export function greatCircle(a, b, n = 64) {
  const toV = (p) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
  const A = toV(a), B = toV(b);
  const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return [[a.lat, a.lon], [b.lat, b.lon]];
  const out = [];
  let prev = a.lon;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * w) / Math.sin(w), s2 = Math.sin(t * w) / Math.sin(w);
    const v = [s1 * A[0] + s2 * B[0], s1 * A[1] + s2 * B[1], s1 * A[2] + s2 * B[2]];
    const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD;
    let lon = Math.atan2(v[1], v[0]) / RAD;
    // bounded: lon moves 360 per pass towards prev: at most a few passes for a finite longitude
    while (lon - prev > 180) lon -= 360;
    // bounded: lon moves 360 per pass towards prev: at most a few passes for a finite longitude
    while (lon - prev < -180) lon += 360;
    prev = lon;
    out.push([lat, lon]);
  }
  return out;
}

/** Minimum city population shown at a zoom level on the offline map (Infinity: no city dots). */
export const minCityPop = (z) => (z < 3 ? Infinity : z < 4 ? 4e6 : z < 5 ? 2e6 : z < 6 ? 1e6 : z < 7 ? 6e5 : 0);
/** Pixel width of a country of `areaKm2` square kilometres at zoom `z` and latitude `lat`. */
export const countryPixels = (areaKm2, z, lat) => Math.sqrt(areaKm2) / ((40075 * Math.max(0.2, Math.cos(lat * RAD))) / (256 * 2 ** z));
/** Compact number: 8.3M, 317k. */
export const compact = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
export const fmtKm = (km) => `${Math.round(km).toLocaleString('en-US')} km`;
