// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab's inspector: node, connection and group properties, the numeric-group (chart) form and the
// selection buttons. It reads only the tab's model of the SOP area projection (observed objects and inputs) and
// sends declared native commands; every choice list and limit comes from the declared interface (host.tools).
const values = (ops, operation, param) => ops.find((op) => op.id === operation)?.params?.[param] ?? {};
const mean = (items, key) => items.reduce((sum, item) => sum + item[key] / items.length, 0);
const nameOf = (item) => (item?.label ? item.label + ' · ' : '') + (item?.id ?? '');

export function makeInspector(inspector, { tool, model, selection, select, html, btn, focusBoard, lineDefaults = () => ({}) }) {
  let ops = [], chartDraft = false;
  const fill = (input, list, { blank = null } = {}) => {
    const keep = input.value; input.replaceChildren();
    if (blank !== null) { const option = html('option', '', blank); option.value = ''; input.append(option); }
    for (const value of list) { const option = html('option', '', String(value)); option.value = String(value); input.append(option); }
    input.value = keep;
  };
  // A field: <label>Text <input aria-label="Text"></label> appended to a form.
  const field = (form, label, tag = 'input', type = 'text') => {
    const wrap = html('label', '', label), input = html(tag);
    if (tag === 'input') input.type = type;
    input.setAttribute('aria-label', label); wrap.append(input); form.append(wrap); return input;
  };
  // Inputs keep what the person is typing: an update does not overwrite the focused field.
  const put = (input, value) => { if (document.activeElement !== input) input.value = value ?? ''; };
  const hide = (input, hidden) => { (input.closest('label') ?? input).hidden = hidden; };

  const selectedIdentity = html('p'); selectedIdentity.setAttribute('data-selected-native-id', '');
  const emptyInspector = html('p', 'dg-empty-selection', 'Click an object to edit it. Shift-click, Ctrl-click or drag a rectangle to select several objects; Select multiple does the same by tapping.');

  // ---- nodes ----
  const editBox = html('form', 'dg-chart-form'); editBox.setAttribute('aria-label', 'Node properties');
  const editLabel = field(editBox, 'Label'), editValue = field(editBox, 'Numeric value', 'input', 'number');
  editLabel.setAttribute('aria-label', 'Node label'); editValue.setAttribute('aria-label', 'Node value'); editValue.step = 'any'; editValue.placeholder = 'Numeric value';
  const objectId = field(editBox, 'Object ID'); objectId.readOnly = true;
  const nodeShape = field(editBox, 'Node shape', 'select');
  const nodeWidth = field(editBox, 'Width', 'input', 'number'), nodeHeight = field(editBox, 'Height', 'input', 'number');
  nodeWidth.step = nodeHeight.step = 'any';
  const nodeColour = field(editBox, 'Node colour', 'select'), nodeSize = field(editBox, 'Node size', 'select');
  const nodeX = field(editBox, 'Node X', 'input', 'number'), nodeY = field(editBox, 'Node Y', 'input', 'number'); nodeX.step = nodeY.step = 'any';
  const saveLabel = btn('Save label', 'Save node label and value', () => {}); saveLabel.type = 'submit';
  const deleteNode = btn('Delete node', 'Delete the selected nodes', () => { const ids = selection().nodes; if (ids.length) tool('diagram.node.remove', { ids: [...ids] }); });
  editBox.append(saveLabel, deleteNode);
  const selectedNodes = () => { const m = model(); return selection().nodes.map((id) => m.node.get(id)).filter(Boolean); };
  editBox.addEventListener('submit', (event) => {
    event.preventDefault();
    const [node] = selectedNodes(); if (!node) return;
    const raw = editValue.value.trim();
    tool('diagram.node.change', { ids: [node.id], label: editLabel.value, ...(raw && Number.isFinite(Number(raw)) ? { value: Number(raw) } : {}) });
  });
  for (const [input, key] of [[nodeShape, 'kind'], [nodeColour, 'colour'], [nodeSize, 'size']]) input.addEventListener('change', () => {
    const ids = selection().nodes; if (ids.length && input.value) tool('diagram.node.change', { ids: [...ids], [key]: input.value });
  });
  // Width and height: a node whose sides are equal keeps them equal (a circle or a square stays one).
  const resizeNodes = (event) => {
    const nodes = selectedNodes(); if (!nodes.length) return;
    if (nodes.every((node) => node.w === node.h)) nodeWidth.value = nodeHeight.value = event.target.value;
    const width = Number(nodeWidth.value), height = Number(nodeHeight.value);
    if (width > 0 && height > 0) tool('diagram.node.resize', { ids: nodes.map((node) => node.id), width, height });
  };
  nodeWidth.addEventListener('change', resizeNodes); nodeHeight.addEventListener('change', resizeNodes);
  for (const input of [nodeX, nodeY]) input.addEventListener('change', () => {
    const ids = selection().nodes; if (ids.length && nodeX.value !== '' && nodeY.value !== '') tool('diagram.node.place', { ids: [...ids], x: Number(nodeX.value), y: Number(nodeY.value) });
  });

  // ---- groups (stable ids; label, layout, members' colour and size, scale and place) ----
  const groupPanel = html('section', 'dg-chart-tools'), groupHeading = html('h3', '', 'Group properties'), groupForm = html('div', 'dg-chart-form');
  groupPanel.append(groupHeading, groupForm);
  const groupId = field(groupForm, 'Group Object ID'); groupId.readOnly = true;
  const groupLabel = field(groupForm, 'Group label'), groupLayout = field(groupForm, 'Group layout', 'select');
  const groupColour = field(groupForm, 'Group colour', 'select'), groupSize = field(groupForm, 'Group size', 'select');
  const groupX = field(groupForm, 'Group X', 'input', 'number'), groupY = field(groupForm, 'Group Y', 'input', 'number'); groupX.step = groupY.step = 'any';
  const groupScale = field(groupForm, 'Scale group', 'input', 'number'); groupScale.step = '0.1';
  const groupRegion = field(groupForm, 'Place group at', 'select');
  groupRegion.addEventListener('change', () => { const group = currentGroup(); if (group && groupRegion.value) tool('diagram.group.place', { id: group.id, at: groupRegion.value }); groupRegion.value = ''; });
  const currentGroup = () => model().group.get(selection().group);
  // The next free group name: g<k> after every code in use (the rules refuse a name that is taken).
  const nextGroupName = () => { const m = model(), taken = new Set([...m.node.keys(), ...m.link.keys(), ...m.group.keys()]); for (let n = 1; n <= 10000; n++) if (!taken.has('g' + n)) return 'g' + n; return null; };
  // The new group is selected once it is made, so its properties and Ungroup are at hand.
  const makeGroup = btn('Group selected', 'Group the selected nodes', async () => {
    const ids = selection().nodes, name = nextGroupName(); if (!name || ids.length < 2) return;
    const reply = await tool('diagram.group.make', { name, label: groupLabel.value.trim() || 'Group', ids: [...ids] });
    if (reply?.ok) { groupLabel.dataset.typed = ''; select({ group: name }); }
  });
  const ungroup = btn('Ungroup', 'Ungroup: the members stay', () => { const group = currentGroup(); if (group) tool('diagram.group.ungroup', { id: group.id }); });
  const removeGroup = btn('Delete group', 'Delete the group with its members', () => { const group = currentGroup(); if (group) tool('diagram.group.remove', { id: group.id }); });
  groupForm.append(makeGroup, ungroup, removeGroup);
  const members = html('div', 'dg-group-members'); groupForm.append(members);
  groupLabel.addEventListener('change', () => { const group = currentGroup(); if (group) tool('diagram.group.change', { id: group.id, label: groupLabel.value }); });
  for (const [input, key] of [[groupColour, 'colour'], [groupSize, 'size']]) input.addEventListener('change', () => { const group = currentGroup(); if (group && input.value) tool('diagram.group.change', { id: group.id, [key]: input.value }); });
  groupLayout.addEventListener('change', () => { const group = currentGroup(); if (group && groupLayout.value) tool('diagram.group.layout', { id: group.id, layout: groupLayout.value }); });
  for (const input of [groupX, groupY]) input.addEventListener('change', () => { const group = currentGroup(); if (group && groupX.value !== '' && groupY.value !== '') tool('diagram.group.place', { id: group.id, x: Number(groupX.value), y: Number(groupY.value) }); });
  groupScale.addEventListener('change', () => { const group = currentGroup(); if (group && Number(groupScale.value) > 0) tool('diagram.group.resize', { id: group.id, scale: Number(groupScale.value) }); });

  // ---- connections ----
  const linkPanel = html('section', 'dg-chart-tools'), linkForm = html('div', 'dg-chart-form');
  linkPanel.append(html('h3', '', 'Connections'), linkForm);
  const linkId = field(linkForm, 'Connection Object ID'); linkId.readOnly = true;
  const linkFrom = field(linkForm, 'From node', 'select'), linkTo = field(linkForm, 'To node', 'select');
  const linkLabel = field(linkForm, 'Connection label'), linkColour = field(linkForm, 'Connection colour', 'select');
  const linkStyle = field(linkForm, 'Line style', 'select'), linkArrow = field(linkForm, 'Arrowheads', 'select');
  const linkWidth = field(linkForm, 'Line width', 'input', 'number'); linkWidth.step = '0.5';
  // Where each end is attached, the mark at each end and where the label sits (link-geometry.sop).
  const linkFromSide = field(linkForm, 'Start side', 'select'), linkToSide = field(linkForm, 'End side', 'select');
  const linkHead = field(linkForm, 'End mark', 'select'), linkTail = field(linkForm, 'Start mark', 'select');
  const linkLabelAt = field(linkForm, 'Label position', 'input', 'range'); linkLabelAt.min = '0'; linkLabelAt.max = '1'; linkLabelAt.step = '0.05';
  const linkBends = html('p', 'dg-empty-selection');
  const changeLinks = (patch) => { const ids = selection().links; if (ids.length) tool('diagram.link.change', { ids: [...ids], ...patch }); };
  const numeric = new Set(['width', 'labelPosition']);
  for (const [input, key] of [[linkFrom, 'from'], [linkTo, 'to'], [linkLabel, 'label'], [linkColour, 'colour'], [linkStyle, 'style'], [linkArrow, 'arrow'], [linkWidth, 'width'],
    [linkFromSide, 'fromSide'], [linkToSide, 'toSide'], [linkHead, 'head'], [linkTail, 'tail'], [linkLabelAt, 'labelPosition']]) input.addEventListener('change', () => {
    if (!selection().links.length || (key !== 'label' && input.value === '')) return;
    if (numeric.has(key) && !Number.isFinite(Number(input.value))) return;
    changeLinks({ [key]: numeric.has(key) ? Number(input.value) : input.value });
  });
  const connect = btn('Connect nodes', 'Connect the chosen nodes', () => tool('diagram.link.make', { from: linkFrom.value, to: linkTo.value, ...lineDefaults() }));
  const linkOne = (operation, args = {}) => { const ids = selection().links; if (ids.length) tool(operation, { ids: [...ids], ...args }); };
  const straighten = btn('Remove bends', 'Remove every bend of the selected connections', () => linkOne('diagram.link.bend.remove'));
  const detachStart = btn('Detach start', 'Free the start of the selected connections from its node', () => linkOne('diagram.link.detach', { end: 'start' }));
  const detachEnd = btn('Detach end', 'Free the end of the selected connections from its node', () => linkOne('diagram.link.detach', { end: 'end' }));
  linkForm.append(linkBends, connect, straighten, detachStart, detachEnd);

  // ---- a numeric group drawn as a chart: one node per label with its value ----
  const chartPanel = html('section', 'dg-chart-tools'), chartForm = html('div', 'dg-chart-form');
  chartPanel.append(html('h3', '', 'New numeric group'), chartForm);
  const chartTitle = field(chartForm, 'Numeric group label'), chartLayout = field(chartForm, 'Chart layout', 'select'), chartData = field(chartForm, 'Chart data', 'textarea');
  chartData.placeholder = 'Label, number[, error] per line, or a pasted table; a label said again is one more record of it';
  const chartAggregate = field(chartForm, 'Aggregate records', 'select'), chartBins = field(chartForm, 'Histogram bins', 'input', 'number');
  const chartStatus = html('p', 'dg-empty-selection');
  chartForm.append(btn('Create numeric group', 'Create editable numeric nodes and their group', async () => {
    const labels = [], numbers = [];
    // A pasted table works too: a first line without a number (its header) is skipped; cells split by commas, semicolons or tabs.
    const errors = [];
    for (const line of chartData.value.split('\n').filter((row) => row.trim())) {
      const cells = line.split(/[,;\t]/).map((cell) => cell.trim()), label = cells[0], number = Number(cells[1]), error = cells.length > 2 ? Number(cells[2]) : NaN;
      if (cells.length < 2 || !label || cells[1] === '' || !Number.isFinite(number)) { if (!labels.length && cells.length > 1) continue; chartStatus.textContent = 'Use one label, number per line.'; return; }
      labels.push(label); numbers.push(number); if (Number.isFinite(error)) errors.push(error);
    }
    chartStatus.textContent = '';
    const bins = Number(chartBins.value);
    const reply = await tool('diagram.group.chart.make', { label: chartTitle.value.trim() || 'Data group', labels, values: numbers, layout: chartLayout.value,
      ...(chartAggregate.value ? { aggregate: chartAggregate.value } : {}), ...(bins >= 2 ? { bins } : {}), ...(errors.length === numbers.length ? { errors } : {}) });
    if (reply?.ok) { chartDraft = false; sync(); }
  }), btn('Cancel', 'Cancel numeric group creation', () => { chartDraft = false; sync(); }), chartStatus);

  const deleteSelection = btn('Delete selection', 'Delete the selected objects', () => removeSelection());
  inspector.append(selectedIdentity, emptyInspector, editBox, groupPanel, linkPanel, chartPanel, deleteSelection);

  /** Deletes what is selected: a group with its members, or the selected nodes and connections. */
  function removeSelection() {
    const { nodes, links, group } = selection();
    if (group) return tool('diagram.group.remove', { id: group });
    if (nodes.length && links.length) return tool('diagram.selection.remove', { nodes: [...nodes], links: [...links] });
    if (nodes.length) return tool('diagram.node.remove', { ids: [...nodes] });
    if (links.length) return tool('diagram.link.remove', { ids: [...links] });
    return null;
  }

  /** The declared interface: choice lists and limits for every control. */
  function declare(operations) {
    ops = operations ?? [];
    const m = model();
    fill(nodeShape, values(ops, 'diagram.node.change', 'kind').enum ?? [], { blank: '—' });
    fill(nodeColour, values(ops, 'diagram.node.change', 'colour').enum ?? m.options.colour ?? [], { blank: '—' });
    fill(nodeSize, values(ops, 'diagram.node.change', 'size').enum ?? m.options.size ?? [], { blank: '—' });
    const size = values(ops, 'diagram.node.resize', 'width');
    for (const input of [nodeWidth, nodeHeight]) { if (size.min !== undefined) input.min = size.min; if (size.max !== undefined) input.max = size.max; }
    fill(groupLayout, values(ops, 'diagram.group.layout', 'layout').enum ?? [], { blank: '—' });
    fill(groupRegion, values(ops, 'diagram.group.place', 'at').enum ?? [], { blank: '—' });
    fill(groupColour, values(ops, 'diagram.group.change', 'colour').enum ?? m.options.colour ?? [], { blank: '—' });
    fill(groupSize, values(ops, 'diagram.group.change', 'size').enum ?? m.options.size ?? [], { blank: '—' });
    const scale = values(ops, 'diagram.group.resize', 'scale'); if (scale.min !== undefined) groupScale.min = scale.min; if (scale.max !== undefined) groupScale.max = scale.max;
    fill(linkColour, values(ops, 'diagram.link.change', 'colour').enum ?? m.options.colour ?? [], { blank: '—' });
    fill(linkStyle, values(ops, 'diagram.link.change', 'style').enum ?? []);
    fill(linkArrow, values(ops, 'diagram.link.change', 'arrow').enum ?? []);
    const width = values(ops, 'diagram.link.change', 'width'); if (width.min !== undefined) linkWidth.min = width.min; if (width.max !== undefined) linkWidth.max = width.max;
    fill(linkFromSide, values(ops, 'diagram.link.change', 'fromSide').enum ?? []); fill(linkToSide, values(ops, 'diagram.link.change', 'toSide').enum ?? []);
    fill(linkHead, values(ops, 'diagram.link.change', 'head').enum ?? []); fill(linkTail, values(ops, 'diagram.link.change', 'tail').enum ?? []);
    fill(chartLayout, values(ops, 'diagram.group.chart.make', 'layout').enum ?? []);
    fill(chartAggregate, values(ops, 'diagram.group.chart.make', 'aggregate').enum ?? [], { blank: 'sum' });
    const binLimits = values(ops, 'diagram.group.chart.make', 'bins'); if (binLimits.min !== undefined) chartBins.min = binLimits.min; if (binLimits.max !== undefined) chartBins.max = binLimits.max;
    sync();
  }

  function syncNodes(m, nodes, group) {
    const node = nodes.length === 1 ? nodes[0] : null;
    editBox.hidden = !nodes.length || !!group;
    hide(editLabel, !node); hide(editValue, !node); saveLabel.hidden = !node;
    if (!nodes.length) return;
    const same = (key) => nodes.every((item) => item[key] === nodes[0][key]);
    put(editLabel, node?.label ?? ''); put(editValue, node?.value ?? ''); put(objectId, nodes.map((item) => item.id).join(', '));
    put(nodeShape, same('kind') ? nodes[0].kind : ''); put(nodeColour, same('colour') ? nodes[0].colour ?? '' : ''); put(nodeSize, same('size') ? nodes[0].size ?? '' : '');
    put(nodeWidth, same('w') ? nodes[0].w : ''); put(nodeHeight, same('h') ? nodes[0].h : '');
    put(nodeX, Math.round(mean(nodes, 'x'))); put(nodeY, Math.round(mean(nodes, 'y')));
    // A member of a group moves with its group: its place is the group's.
    for (const input of [nodeX, nodeY]) input.disabled = nodes.some((item) => item.group);
  }
  function syncGroup(m, nodes, group) {
    groupPanel.hidden = !group && nodes.length < 2;
    if (groupPanel.hidden) return;
    groupHeading.textContent = group ? 'Group properties' : nodes.length + ' selected objects';
    put(groupId, group?.id ?? nextGroupName() ?? '');
    makeGroup.hidden = !!group; makeGroup.disabled = nodes.length < 2;
    for (const input of [groupLayout, groupColour, groupSize, groupX, groupY, groupScale, groupRegion]) hide(input, !group);
    ungroup.hidden = removeGroup.hidden = !group;
    if (group) {
      put(groupLabel, group.label ?? ''); put(groupLayout, group.layout ?? ''); put(groupScale, group.scale ?? 1);
      if (group.box) { put(groupX, Math.round((group.box.x0 + group.box.x1) / 2)); put(groupY, Math.round((group.box.y0 + group.box.y1) / 2)); }
    } else if (document.activeElement !== groupLabel && !groupLabel.dataset.typed) groupLabel.value = '';
    members.replaceChildren();
    for (const id of group?.members ?? []) members.append(btn(nameOf(m.node.get(id) ?? { id }), 'Select ' + id, () => select({ nodes: [id], links: [], group: null })));
  }
  function syncLinks(m, nodes, links) {
    const link = links.length === 1 ? links[0] : null;
    linkPanel.hidden = !links.length && nodes.length < 2;
    if (linkPanel.hidden) return;
    put(linkId, links.map((item) => item.id).join(', '));
    for (const [input, target] of [[linkFrom, link?.from ?? nodes[0]?.id], [linkTo, link?.to ?? nodes[1]?.id]]) {
      const options = [...m.node.values()].map((node) => [node.id, nameOf(node)]);
      if (input.dataset.options !== JSON.stringify(options)) {
        input.dataset.options = JSON.stringify(options); input.replaceChildren();
        for (const [id, text] of options) { const option = html('option', '', text); option.value = id; input.append(option); }
      }
      put(input, target ?? ''); input.disabled = links.length > 1;
    }
    put(linkLabel, link?.label ?? ''); put(linkColour, link?.colour ?? ''); put(linkStyle, link?.style ?? 'solid'); put(linkArrow, link?.arrow ?? 'forward'); put(linkWidth, link?.width ?? 2);
    // A free end shows as free; a mark not shown by the direction as none.
    const arrow = link?.arrow ?? 'forward';
    put(linkFromSide, link?.fromFree ? '' : link?.fromSide ?? 'auto'); put(linkToSide, link?.toFree ? '' : link?.toSide ?? 'auto');
    put(linkHead, ['forward', 'both'].includes(arrow) ? link?.head ?? 'arrow' : 'none'); put(linkTail, ['back', 'both'].includes(arrow) ? link?.tail ?? 'arrow' : 'none');
    put(linkLabelAt, link?.labelPosition ?? 0.5);
    linkBends.textContent = link ? [link.fromFree ? 'Start: free' : '', link.toFree ? 'End: free' : '', link.bends.length ? link.bends.length + ' bend' + (link.bends.length === 1 ? '' : 's') + ' (drag a bend to move it, double-click it to remove it)' : 'Drag the middle handle of the line to add a bend.'].filter(Boolean).join(' · ') : '';
    for (const input of [linkId, linkLabel, linkColour, linkStyle, linkArrow, linkWidth, linkFromSide, linkToSide, linkHead, linkTail, linkLabelAt]) hide(input, !links.length);
    for (const button of [straighten, detachStart, detachEnd, linkBends]) button.hidden = !links.length;
    straighten.disabled = !links.some((item) => item.bends.length);
    connect.hidden = !!links.length; connect.disabled = !linkFrom.value || !linkTo.value || linkFrom.value === linkTo.value;
  }
  function sync() {
    const m = model(), sel = selection(), group = m.group.get(sel.group) ?? null;
    const nodes = group ? [] : sel.nodes.map((id) => m.node.get(id)).filter(Boolean), links = group ? [] : sel.links.map((id) => m.link.get(id)).filter(Boolean);
    inspector.dataset.selectedNativeIds = JSON.stringify(group ? [group.id] : [...nodes.map((n) => n.id), ...links.map((l) => l.id)]);
    selectedIdentity.textContent = group ? nameOf(group) : nodes.length === 1 && !links.length ? nameOf(nodes[0]) : [...nodes, ...links].map((item) => item.id).join(', ');
    selectedIdentity.hidden = !selectedIdentity.textContent;
    emptyInspector.hidden = !!(nodes.length || links.length || group || chartDraft);
    chartPanel.hidden = !chartDraft;
    deleteSelection.disabled = !(nodes.length || links.length || group);
    syncNodes(m, nodes, group); syncGroup(m, nodes, group); syncLinks(m, nodes, links);
  }
  groupLabel.addEventListener('input', () => { groupLabel.dataset.typed = groupLabel.value ? '1' : ''; });
  editLabel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); focusBoard(); } });

  return {
    sync, declare, removeSelection,
    /** Opens the chart form (toolbar Chart button). */
    openChart() { chartDraft = true; sync(); chartTitle.focus(); },
    /** Focuses the label of the selected node (double click on a node). */
    focusLabel() { sync(); if (!editBox.hidden && !editLabel.closest('label').hidden) { editLabel.focus(); editLabel.select(); } },
    destroy() { inspector.replaceChildren(); },
  };
}
