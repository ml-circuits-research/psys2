// SPDX-License-Identifier: AGPL-3.0-only
/** Native projection of axis-aligned bounds. The evidence describes the approximation. */
export function spatialBox(id, scope, bounds, evidence = 'bounds') {
  const [min_x, min_y, max_x, max_y] = bounds;
  if (!bounds.every(Number.isFinite) || min_x > max_x || min_y > max_y) return null;
  return { entity: id, scope, min_x, min_y, max_x, max_y, evidence };
}

export function centeredSpatialBox(id, scope, { x, y, w, h }, evidence) {
  return spatialBox(id, scope, [x - w / 2, y - h / 2, x + w / 2, y + h / 2], evidence);
}

export function unionSpatialBoxes(id, scope, boxes) {
  if (!boxes.length || boxes.some(box => !box)) return null;
  return spatialBox(id, scope, [
    Math.min(...boxes.map(box => box.min_x)), Math.min(...boxes.map(box => box.min_y)),
    Math.max(...boxes.map(box => box.max_x)), Math.max(...boxes.map(box => box.max_y)),
  ]);
}
