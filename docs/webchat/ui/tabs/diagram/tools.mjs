// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab's visual tools (specs/diagram-capabilities.md): the page bar (theme, colour by, layout, direction,
// spacing, routes, improve, step numbers) and the inspector's style, structure and chart panels (shape palette, fill,
// outline and text swatches, font, effects, align and distribute, many links, duplicate, merge, split, link route,
// reverse, insert, the chart's data table and formatting). Every control sends a declared native command through
// the tab's tool route; every choice list comes from the declared interface (host.tools) or the observed options.
const NS = 'http://www.w3.org/2000/svg';
const values = (ops, operation, param) => ops.find((op) => op.id === operation)?.params?.[param] ?? {};

// A small picture of each shape for the palette (presentation only; the shape drawn is the projection's).
const ICONS = {
  rectangle: '<rect x="3" y="6" width="18" height="12"/>', rounded_rectangle: '<rect x="3" y="6" width="18" height="12" rx="4"/>',
  square: '<rect x="5" y="5" width="14" height="14"/>', circle: '<circle cx="12" cy="12" r="8"/>', ellipse: '<ellipse cx="12" cy="12" rx="10" ry="6"/>',
  oval: '<rect x="2" y="7" width="20" height="10" rx="5"/>', diamond: '<polygon points="12,3 21,12 12,21 3,12"/>',
  parallelogram: '<polygon points="7,6 21,6 17,18 3,18"/>', hexagon: '<polygon points="3,12 7,5 17,5 21,12 17,19 7,19"/>',
  triangle: '<polygon points="12,4 21,20 3,20"/>', star: '<polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17.5 6.5,21 8,14 3,9.5 9.5,9"/>',
  chevron: '<polygon points="3,6 16,6 21,12 16,18 3,18 7,12"/>', double_rectangle: '<rect x="3" y="6" width="18" height="12"/><path d="M6 6v12M18 6v12"/>',
  document: '<path d="M4 5h16v11c-4 4-8-3-16 1z"/>', cylinder: '<path d="M4 7v10c0 3 16 3 16 0V7"/><ellipse cx="12" cy="7" rx="8" ry="3"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 2 9z"/>', actor: '<circle cx="12" cy="6" r="3"/><path d="M12 9v7M6 12h12M12 16l-5 6M12 16l5 6" fill="none"/>',
  note: '<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4" fill="none"/>', text: '<text x="12" y="16" text-anchor="middle" font-size="12" stroke="none" fill="currentColor">Aa</text>', dot: '<circle cx="12" cy="12" r="3"/>',
};
const icon = (kind) => { const span = document.createElement('span'); span.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 24 24" width="22" height="22" fill="var(--dg-card)" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${ICONS[kind] ?? ICONS.rectangle}</svg>`; return span.firstChild; };
const ALIGN = [['left', 'Align left', '⇤'], ['centre', 'Align centres', '↔'], ['right', 'Align right', '⇥'], ['top', 'Align top', '⤒'], ['middle', 'Align middles', '↕'], ['bottom', 'Align bottom', '⤓']];

export const TOOLS_STYLE = `
.dg-pagebar { display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font:12px system-ui,sans-serif;color:var(--dg-faint); }
.dg-pagebar label { display:inline-flex;align-items:center;gap:4px; }
.dg-pagebar select { border:1px solid var(--dg-line);border-radius:6px;padding:4px;background:var(--dg-card);color:var(--dg-ink);font:12px system-ui; }
.dg-palette { display:flex;flex-wrap:wrap;gap:4px; }
.dg-palette .dg-btn { min-width:32px;height:32px;padding:0 4px; }
.dg-swatches { display:grid;grid-template-columns:repeat(auto-fill,minmax(20px,1fr));gap:3px; }
.dg-swatch { all:unset;cursor:pointer;width:20px;height:20px;border-radius:4px;box-shadow:inset 0 0 0 1px #0003; }
.dg-swatch[aria-pressed="true"] { box-shadow:0 0 0 2px var(--dg-accent); }
.dg-row { display:flex;flex-wrap:wrap;gap:4px;align-items:center; }
.dg-subhead { margin:10px 0 4px;font:600 12px system-ui;color:var(--dg-faint); }
.dg-table { width:100%;border-collapse:collapse;font:12px system-ui; }
.dg-table td { padding:2px; }
.dg-table input { width:100%;box-sizing:border-box;border:1px solid var(--dg-line);border-radius:4px;padding:4px;background:var(--dg-bg);color:var(--dg-ink); }
`;

/** The page bar: page-wide settings of the diagram. */
export function makePageBar(bar, { tool, model, html, btn }) {
  const select = (label, onchange) => {
    const wrap = html('label', '', label + ' '), input = html('select'); input.setAttribute('aria-label', label);
    input.addEventListener('change', () => { if (input.value) onchange(input.value); });
    wrap.append(input); bar.append(wrap); return input;
  };
  const fill = (input, list, blank) => { const keep = input.value; input.replaceChildren(); const b = html('option', '', blank); b.value = ''; input.append(b);
    for (const value of list) { const o = html('option', '', String(value)); o.value = String(value); input.append(o); } input.value = keep; };
  const selectionIds = { current: () => [] };
  const theme = select('Theme', (value) => { const ids = selectionIds.current(); tool('diagram.style.apply', { theme: value, ...(ids.length ? { ids } : {}) }); });
  const colourBy = select('Colour by', (value) => tool('diagram.colour.by', { by: value }));
  const layout = select('Layout', (value) => tool('diagram.layout', { layout: value }));
  const direction = select('Direction', (value) => tool('diagram.layout', { direction: value }));
  const spacing = select('Spacing', (value) => tool('diagram.layout', { spacing: value }));
  const route = select('Lines', (value) => tool('diagram.layout', { route: value }));
  const improve = btn('Improve layout', 'Tidy the layout: back to the automatic layout, orthogonal lines, normal spacing', () => tool('diagram.layout.improve', {}));
  const steps = btn('Number steps', 'Show or hide step numbers', () => tool('diagram.steps.number', { mode: page().numbered === true ? 'off' : 'on' }));
  bar.append(improve, steps);
  const page = () => model().inputs?.page ?? {};
  return {
    declare(ops) {
      fill(theme, values(ops, 'diagram.style.apply', 'theme').enum ?? model().options.theme ?? [], '—');
      fill(colourBy, values(ops, 'diagram.colour.by', 'by').enum ?? [], '—');
      fill(layout, values(ops, 'diagram.layout', 'layout').enum ?? [], '—');
      fill(direction, values(ops, 'diagram.layout', 'direction').enum ?? [], '—');
      fill(spacing, values(ops, 'diagram.layout', 'spacing').enum ?? [], '—');
      fill(route, values(ops, 'diagram.layout', 'route').enum ?? [], '—');
    },
    sync(selected) {
      selectionIds.current = () => selected();
      const p = page(), put = (input, value) => { if (document.activeElement !== input) input.value = value ?? ''; };
      put(theme, p.theme); put(layout, p.arrange); put(direction, p.direction); put(spacing, p.spacing); put(route, p.route); colourBy.value = '';
      steps.setAttribute('aria-pressed', String(p.numbered === true));
    },
  };
}

/** The inspector's style, structure and chart panels. */
export function makeStylePanels(host, { tool, model, selection, html, btn }) {
  let ops = [];
  const section = (title) => { const s = html('section', 'dg-chart-tools'); s.append(html('h3', '', title)); host.append(s); return s; };
  const sub = (parent, text) => parent.append(html('p', 'dg-subhead', text));
  const nodes = () => { const m = model(); return selection().nodes.filter((id) => m.node.has(id)); };
  const links = () => { const m = model(); return selection().links.filter((id) => m.link.has(id)); };
  const change = (patch) => { const ids = nodes(); if (ids.length) tool('diagram.node.change', { ids, ...patch }); };

  // ---- node style: shape palette, swatches, font, effects ----
  const style = section('Style');
  sub(style, 'Shape'); const palette = html('div', 'dg-palette'); style.append(palette);
  const swatchRow = (label, key) => { sub(style, label); const grid = html('div', 'dg-swatches'); grid.dataset.key = key; style.append(grid); return grid; };
  const fillGrid = swatchRow('Fill', 'colour'), outlineGrid = swatchRow('Outline', 'outline'), textGrid = swatchRow('Text colour', 'textColour');
  sub(style, 'Text and effects');
  const fontRow = html('div', 'dg-row'), fontSize = html('input'); fontSize.type = 'number'; fontSize.min = '8'; fontSize.max = '48'; fontSize.style.width = '64px';
  fontSize.setAttribute('aria-label', 'Font size'); fontSize.addEventListener('change', () => { if (Number(fontSize.value) > 0) change({ fontSize: Number(fontSize.value) }); });
  const bold = btn('B', 'Bold label', () => change({ fontWeight: bold.getAttribute('aria-pressed') === 'true' ? 'normal' : 'bold' }));
  const effect = html('select'); effect.setAttribute('aria-label', 'Effect'); effect.addEventListener('change', () => { if (effect.value) change({ effect: effect.value }); });
  const opacity = html('input'); opacity.type = 'range'; opacity.min = '0.1'; opacity.max = '1'; opacity.step = '0.1'; opacity.setAttribute('aria-label', 'Opacity');
  opacity.addEventListener('change', () => change({ opacity: Number(opacity.value) }));
  const corner = html('input'); corner.type = 'number'; corner.min = '0'; corner.max = '40'; corner.style.width = '56px'; corner.setAttribute('aria-label', 'Corner radius');
  corner.addEventListener('change', () => { if (corner.value !== '') change({ corner: Number(corner.value) }); });
  const rotation = html('input'); rotation.type = 'number'; rotation.min = '-360'; rotation.max = '360'; rotation.step = '15'; rotation.style.width = '64px'; rotation.setAttribute('aria-label', 'Rotation');
  rotation.addEventListener('change', () => { if (rotation.value !== '') change({ rotation: Number(rotation.value) }); });
  fontRow.append(fontSize, bold, effect, opacity, corner, rotation); style.append(fontRow);

  // ---- structure: align, distribute, many links, duplicate, merge, split ----
  const structure = section('Arrange and connect');
  const alignRow = html('div', 'dg-row');
  for (const [edge, title, mark] of ALIGN) alignRow.append(btn(mark, title, () => { const ids = nodes(); if (ids.length > 1) tool('diagram.nodes.align', { ids, edge }); }));
  alignRow.append(btn('⇹', 'Distribute horizontally', () => { const ids = nodes(); if (ids.length > 2) tool('diagram.nodes.distribute', { ids, axis: 'horizontal' }); }),
    btn('⇳', 'Distribute vertically', () => { const ids = nodes(); if (ids.length > 2) tool('diagram.nodes.distribute', { ids, axis: 'vertical' }); }));
  const connectRow = html('div', 'dg-row');
  for (const [pattern, label, title] of [['chain', 'Chain', 'Connect them in order'], ['cycle', 'Loop', 'Connect them in a loop'], ['star', 'To first', 'Connect the first to every other'], ['all', 'All', 'Connect every pair']])
    connectRow.append(btn(label, title, () => { const ids = nodes(); if (ids.length > 1) tool('diagram.links.connect', { ids, pattern, ...(pattern === 'all' ? { confirm: true } : {}) }); }));
  const editRow = html('div', 'dg-row');
  editRow.append(btn('Duplicate', 'Duplicate the selected nodes', () => { const ids = nodes(); if (ids.length) tool('diagram.node.duplicate', { ids }); }),
    btn('Merge', 'Merge the selected nodes into the first', () => { const ids = nodes(); if (ids.length > 1) tool('diagram.node.merge', { ids }); }),
    btn('Split', 'Split the node into two steps', () => { const [id] = nodes(); if (id) tool('diagram.node.split', { id }); }),
    btn('Swap', 'Swap the places of the two selected nodes', () => { const ids = nodes(); if (ids.length === 2) tool('diagram.nodes.swap', { ids }); }),
    btn('Bigger', 'Make the selected nodes 20% bigger', () => { const ids = nodes(); if (ids.length) tool('diagram.node.scale', { ids, factor: 1.2 }); }),
    btn('Smaller', 'Make the selected nodes 20% smaller', () => { const ids = nodes(); if (ids.length) tool('diagram.node.scale', { ids, factor: 0.8 }); }));
  structure.append(alignRow, connectRow, editRow);

  // ---- links: route, reverse, insert ----
  const linkTools = section('Link tools');
  const routeSel = html('select'); routeSel.setAttribute('aria-label', 'Link route');
  routeSel.addEventListener('change', () => { const ids = links(); if (ids.length && routeSel.value) tool('diagram.link.change', { ids, route: routeSel.value }); });
  const linkRow = html('div', 'dg-row');
  linkRow.append(routeSel, btn('Reverse', 'Reverse the selected links', () => { const ids = links(); if (ids.length) tool('diagram.link.reverse', { ids }); }),
    btn('Insert node', 'Insert a node in the middle of the link', () => { const [link] = links(); if (link) tool('diagram.node.insert', { link }); }),
    btn('Tidy', 'Give the selected links the tidy look (orthogonal, solid, 2 wide)', () => { const ids = links(); if (ids.length) tool('diagram.link.improve', { ids }); }));
  linkTools.append(linkRow);

  // ---- charts: data table and formatting ----
  const chart = section('Chart');
  const table = html('table', 'dg-table'), addRow = html('div', 'dg-row');
  const newLabel = html('input'), newValue = html('input'); newLabel.placeholder = 'Category'; newValue.placeholder = 'Value'; newValue.type = 'number';
  newLabel.setAttribute('aria-label', 'New category'); newValue.setAttribute('aria-label', 'New value'); newLabel.style.width = '45%'; newValue.style.width = '30%';
  addRow.append(newLabel, newValue, btn('Add', 'Add a category', () => { const g = selection().group; if (g && newLabel.value.trim() && newValue.value !== '') { tool('diagram.chart.category.add', { id: g, label: newLabel.value.trim(), value: Number(newValue.value) }); newLabel.value = newValue.value = ''; } }));
  const formatRow = html('div', 'dg-chart-form');
  const field = (label, type = 'text') => { const wrap = html('label', '', label), input = html('input'); input.type = type; input.setAttribute('aria-label', label); wrap.append(input); formatRow.append(wrap); return input; };
  const xLabel = field('X axis title'), yLabel = field('Y axis title');
  const legend = html('select'); legend.setAttribute('aria-label', 'Legend');
  const valueLabels = btn('Values', 'Show or hide the values', () => format({ valueLabels: !(currentGroup()?.valueLabels !== false) }));
  const gridlines = btn('Gridlines', 'Show or hide gridlines', () => format({ gridlines: currentGroup()?.gridlines !== true }));
  const format = (patch) => { const g = selection().group; if (g) tool('diagram.chart.format', { id: g, ...patch }); };
  xLabel.addEventListener('change', () => format({ xLabel: xLabel.value })); yLabel.addEventListener('change', () => format({ yLabel: yLabel.value }));
  legend.addEventListener('change', () => { if (legend.value) format({ legend: legend.value }); });
  const yMax = field('Value axis top', 'number'); yMax.addEventListener('change', () => { if (yMax.value !== '') format({ yMax: Number(yMax.value) }); });
  const sort = html('select'); sort.setAttribute('aria-label', 'Sort categories'); sort.addEventListener('change', () => { const g = selection().group; if (g && sort.value) tool('diagram.chart.sort', { id: g, order: sort.value }); sort.value = ''; });
  const condRow = html('div', 'dg-row'), condTest = html('select'), condValue = html('input'), condColour = html('select');
  condTest.setAttribute('aria-label', 'Colour values'); condValue.type = 'number'; condValue.style.width = '64px'; condValue.setAttribute('aria-label', 'Threshold'); condColour.setAttribute('aria-label', 'Condition colour');
  condRow.append(condTest, condValue, condColour, btn('Colour', 'Colour the categories whose value is below or above the threshold', () => { const g = selection().group; if (g && condTest.value && condValue.value !== '' && condColour.value) tool('diagram.chart.highlight', { id: g, test: condTest.value, value: Number(condValue.value), colour: condColour.value }); }));
  const toggles = html('div', 'dg-row'); toggles.append(valueLabels, gridlines, legend, sort);
  chart.append(condRow);
  chart.append(table, addRow, formatRow, toggles);
  const currentGroup = () => model().group.get(selection().group);

  function swatches(grid, colours) {
    grid.replaceChildren();
    for (const name of colours) {
      const b = html('button', 'dg-swatch'); b.type = 'button'; b.title = name; b.setAttribute('aria-label', grid.dataset.key + ' ' + name); b.style.background = name.replace(/ /g, '');
      b.dataset.value = name; b.addEventListener('click', () => change({ [grid.dataset.key]: name })); grid.append(b);
    }
  }
  return {
    declare(operations) {
      ops = operations ?? [];
      palette.replaceChildren();
      for (const kind of values(ops, 'diagram.node.change', 'kind').enum ?? []) { const b = btn('', 'Make it a ' + kind.replace(/_/g, ' '), () => change({ kind })); b.append(icon(kind)); b.dataset.kind = kind; palette.append(b); }
      const colours = values(ops, 'diagram.node.change', 'colour').enum ?? model().options.colour ?? [];
      swatches(fillGrid, colours); swatches(outlineGrid, colours); swatches(textGrid, colours);
      const fillSel = (input, list) => { input.replaceChildren(); const b = html('option', '', '—'); b.value = ''; input.append(b); for (const v of list) { const o = html('option', '', v); o.value = v; input.append(o); } };
      fillSel(effect, values(ops, 'diagram.node.change', 'effect').enum ?? []); fillSel(routeSel, values(ops, 'diagram.link.change', 'route').enum ?? []);
      fillSel(legend, values(ops, 'diagram.chart.format', 'legend').enum ?? []);
      fillSel(sort, values(ops, 'diagram.chart.sort', 'order').enum ?? []); fillSel(condTest, values(ops, 'diagram.chart.highlight', 'test').enum ?? []); fillSel(condColour, colours);
    },
    sync() {
      const m = model(), sel = selection(), ns = sel.group ? [] : nodes().map((id) => m.node.get(id)), ls = sel.group ? [] : links().map((id) => m.link.get(id));
      style.hidden = !ns.length; structure.hidden = !ns.length; linkTools.hidden = !ls.length;
      const first = ns[0];
      if (first) {
        const mark = (grid, value) => { for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.value === value)); };
        mark(fillGrid, first.colour); mark(outlineGrid, first.outline); mark(textGrid, first.textColour);
        for (const b of palette.children) b.setAttribute('aria-pressed', String(ns.every((n) => n.kind === b.dataset.kind)));
        if (document.activeElement !== fontSize) fontSize.value = first.fontSize ?? '';
        bold.setAttribute('aria-pressed', String(first.fontWeight === 'bold')); if (document.activeElement !== rotation) rotation.value = first.rotation ?? ''; effect.value = first.effect ?? ''; opacity.value = first.opacity ?? 1; if (document.activeElement !== corner) corner.value = first.corner ?? '';
      }
      for (const b of [...alignRow.children, ...connectRow.children]) b.disabled = ns.length < 2;
      alignRow.children[6].disabled = alignRow.children[7].disabled = ns.length < 3;
      editRow.children[1].disabled = ns.length < 2; editRow.children[2].disabled = ns.length !== 1; editRow.children[3].disabled = ns.length !== 2;
      if (ls[0]) routeSel.value = ls[0].route ?? '';
      const group = m.group.get(sel.group), isChart = !!group && ['bar', 'line', 'area', 'pie', 'doughnut'].includes(group.layout);
      chart.hidden = !isChart;
      if (!isChart) return;
      table.replaceChildren();
      for (const id of group.members) {
        const node = m.node.get(id); if (!node) continue;
        const row = html('tr'), label = html('input'), value = html('input'), cellA = html('td'), cellB = html('td'), cellC = html('td');
        label.value = node.label ?? ''; value.type = 'number'; value.value = node.value ?? ''; label.setAttribute('aria-label', 'Category ' + id); value.setAttribute('aria-label', 'Value of ' + (node.label ?? id));
        label.addEventListener('change', () => tool('diagram.chart.category.rename', { id: group.id, category: id, label: label.value }));
        value.addEventListener('change', () => { if (value.value !== '') tool('diagram.chart.value', { id: group.id, category: id, value: Number(value.value) }); });
        cellA.append(label); cellB.append(value); cellC.append(btn('×', 'Remove ' + (node.label ?? id), () => tool('diagram.chart.category.remove', { id: group.id, category: id })));
        row.append(cellA, cellB, cellC); table.append(row);
      }
      if (document.activeElement !== yMax) yMax.value = group.yMax ?? ''; if (document.activeElement !== xLabel) xLabel.value = group.xLabel ?? ''; if (document.activeElement !== yLabel) yLabel.value = group.yLabel ?? '';
      valueLabels.setAttribute('aria-pressed', String(group.valueLabels !== false)); gridlines.setAttribute('aria-pressed', String(group.gridlines === true)); legend.value = group.legend ?? '';
    },
  };
}
