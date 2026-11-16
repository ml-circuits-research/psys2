// SPDX-License-Identifier: AGPL-3.0-only
// Availability is selected by an explicit host area identifier, never by request words.
export const retiredArea = (areas, selector) => typeof selector === 'string'
  ? (areas ?? []).find((area) => area.id === selector && area.status === 'retired') ?? null : null;
export const unavailableAreaMessage = (area) => `${area.label} is not part of this application.`;
export function unavailableAreaReply(area, input) {
  const text = unavailableAreaMessage(area);
  const unavailableArea = { id: area.id, world: area.world, label: area.label, status: area.status };
  const segments = [{ text: String(input), unparsed: false, status: 'unsupported' }];
  return { text, parts: [{ text }], lang: 'en', translation: null, segments, wires: [], answers: [], statuses: ['unsupported'], state: {}, effects: [], unavailableArea,
    trace: { intercepted: 'application-area', unavailableArea, original: input, english: input, replyEnglish: text, effects: [], segments, router: [], routing: [], patterns: [], operations: [], statuses: ['unsupported'], wires: [] } };
}
