// SPDX-License-Identifier: AGPL-3.0-only
// More English forms of the acts (spec 21 section 8): the forms of a world whose things carry NAMED VALUES (a chart, a table of data, a settings panel): an enum, a switch or a text
// attribute said without its name ("make it a pie chart", "hide the legend", "call it Fruit", "pears 7", "double the kiwis", "go to the next chart"). Written once, gated by the
// flag `valued` of acts.schema (and `ordered` for the forms that sort), its forms are the facts of set `acts.data` in the catalog w.lang.en (shard frames-acts-data).
export const FLAGS_DATA = ['valued', 'ordered', 'textual', 'facts', 'playable'];
