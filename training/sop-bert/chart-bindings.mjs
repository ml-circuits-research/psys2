// SPDX-License-Identifier: AGPL-3.0-only
// Export-time alignment data of the chart family for the structural bindings (export-structural-bindings.mjs): which
// catalog chart kind sets which chart.make type, and which reader keys reach which chart.make parameters. Training-side
// data, moved here from the retired runtime chart host (worlds/data.charts/declared-host.mjs).
export const CHART_KIND_PARAMETERS={
 'w.chart.chart':{type:'bar'},'k.charts.kind.bar_chart':{type:'bar'},'k.charts.kind.line_chart':{type:'line'},
 'k.charts.kind.pie_chart':{type:'pie'},'k.charts.kind.scatter_plot':{type:'scatter'},
};
export const CHART_PROPERTY_ALIGNMENTS=[
 {key:'chart.labels',sourceWire:'w.chart.point.category',canonical:'w.chart.point.category',operation:'chart.make',parameter:'labels',codec:'string-list'},
 {key:'chart.values',sourceWire:'w.chart.point.value',canonical:'w.chart.point.value',operation:'chart.make',parameter:'values',codec:'number-list'},
 {key:'chart.series',sourceWire:'w.chart.series.name',canonical:'w.chart.series.name',operation:'chart.make',parameter:'series'},
].map(row=>({...row,area:'diagram',host:'diagram',valueKind:'string'}));
