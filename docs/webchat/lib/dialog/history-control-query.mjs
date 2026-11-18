// UI history gestures are requests because the current journal head determines the call.
const queries = new Map(['undo', 'redo'].map(direction => [
 direction, '@history.source std.request.source text="' + (direction === 'undo' ? 'Undo' : 'Redo') +
  ' the last action."\n@history.control std.request act=' + direction + ' mood=do source=$history.source'
]));

export function historyControlQuery(operation) {
 return queries.get(operation.replace(/^ui\.history\./, ''));
}

export function isHistoryControlQuery(sop) {
 return [...queries.values()].includes(sop);
}
