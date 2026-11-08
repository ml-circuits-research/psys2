/**
 * World groups used in every training report (worker-tasks T7 table): one mapping, reused by all evaluation scripts.
 * Browser-safe, no imports.
 */
export const GROUP_ORDER = ['kids', 'avatar/shell/editor', 'music/draw/map/charts', 'games', 'documents', 'other'];

const MEDIA = new Set(['media.music', 'art.draw', 'geo.map', 'data.charts']);

/** Group name of a world id. */
export function groupOf(world) {
  if (world.startsWith('kids.')) return 'kids';
  if (world.startsWith('ui.') || world === 'docs.editor') return 'avatar/shell/editor';
  if (MEDIA.has(world)) return 'music/draw/map/charts';
  if (world.startsWith('games.')) return 'games';
  if (world.startsWith('docs.')) return 'documents';
  return 'other';
}
