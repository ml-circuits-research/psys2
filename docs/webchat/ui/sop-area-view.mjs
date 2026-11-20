// SPDX-License-Identifier: AGPL-3.0-only
// A tab view over a SOP area projection (worlds/sop-area.mjs projectSopArea): it shows the SVG the projection
// drew, outlines the selected object, and builds its inspector from the declared controls with their options.
// It knows no tab: every label, operation, option and selection comes from the projection.
const css = `
.p2-area{display:flex;height:100%;min-height:0;gap:12px;box-sizing:border-box;padding:12px}
.p2-area-stage{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:#e8edf5;border-radius:12px;position:relative}
.p2-area-stage>svg{max-width:100%;max-height:100%;width:min(100%,520px);height:auto;cursor:pointer}.p2-area-wide .p2-area-stage>svg{width:100%}
.p2-area-stage [data-selected="true"]{outline:none;filter:drop-shadow(0 0 1.2px #1d6fe8) drop-shadow(0 0 1.2px #1d6fe8)}
.p2-area-inspector{width:260px;flex:none;overflow:auto;display:flex;flex-direction:column;gap:10px;font:14px system-ui,sans-serif}
.p2-area-inspector label{display:flex;flex-direction:column;gap:4px}
.p2-area-form{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid #d6dce6;border-radius:10px}
.p2-area-inspector .p2-area-buttons{display:flex;flex-wrap:wrap;gap:6px}
.p2-area-inspector button{padding:4px 10px;border-radius:8px;border:1px solid #c8d0dc;background:#fff;cursor:pointer}
.p2-area-status{color:#555;min-height:1.2em;margin:0}
@media (max-width:700px){.p2-area{flex-direction:column}.p2-area-inspector{width:auto}}`;
const plain = (value) => String(value ?? '').replace(/[_.]/g, ' ');

export function createSopAreaView(container, host = null, { world, view, editor = true } = {}) {
  if (typeof document !== 'undefined' && !document.getElementById('p2-area-css')) {
    const style = document.createElement('style'); style.id = 'p2-area-css'; style.textContent = css; document.head.append(style);
  }
  const el = (tag, cls, attrs = {}) => { const node = document.createElement(tag); if (cls) node.className = cls; for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };
  const root = el('div', 'p2-area'), stage = el('div', 'p2-area-stage', { role: 'img', tabindex: '0' }), inspector = el('aside', 'p2-area-inspector', { 'aria-label': 'Inspector' });
  const status = el('p', 'p2-area-status', { role: 'status', 'aria-live': 'polite' });
  root.append(stage); if (editor) root.append(inspector); container.append(root);
  let state = null, visible = true, busy = false, shown = '', destroyed = false;
  const mirrors = [];

  async function control(operation, args) {
    if (busy || host?.isBusy?.() || !host?.tool) return;
    busy = true; inspector.setAttribute('aria-busy', 'true');
    try { const result = await host.tool(operation, args, { view }); status.textContent = result?.message ?? ''; }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; inspector.removeAttribute('aria-busy'); }
  }
  const argsOf = (item, value) => {
    const args = {};
    if (item.param) args[item.param] = value;
    if (item.target === 'selected' && state?.selected) args[item.list ?? 'id'] = item.list === 'ids' ? [state.selected] : state.selected;
    return args;
  };
  // A control with fields is a form: each field asks for one argument in the way its input declares.
  function formFor(item) {
    const form = el('form', 'p2-area-form', { 'aria-label': item.label }), title = el('div', ''); title.textContent = item.label; form.append(title);
    const inputs = item.fields.map((field) => {
      const wrap = el('label', ''), input = el('input', '', { 'aria-label': field.label, required: 'true',
        type: field.input === 'datetime' ? 'datetime-local' : ['minutes', 'number'].includes(field.input) ? 'number' : 'text' });
      if (field.input === 'minutes') input.setAttribute('min', '1');
      wrap.append(document.createTextNode(field.label), input); form.append(wrap);
      return [field, input];
    });
    const submit = el('button', '', { type: 'submit' }); submit.textContent = item.label; form.append(submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const args = argsOf(item, item.param === 'id' && item.target === null ? 'item-' + Date.now().toString(36) : undefined);
      for (const [field, input] of inputs) {
        const raw = input.value;
        args[field.param] = field.input === 'datetime' ? Date.parse(raw + 'Z') : field.input === 'minutes' ? Math.round(Number(raw) * field.scale) : field.input === 'number' ? Number(raw) * field.scale : raw;
      }
      if (item.param && args[item.param] === undefined) delete args[item.param];
      control(item.operation, args);
    });
    return form;
  }
  function inspectorRows() {
    const signature = JSON.stringify([state?.controls, state?.selected]);
    if (signature === shown) return;
    shown = signature;
    inspector.replaceChildren();
    for (const item of state?.controls ?? []) {
      if (!item.available) continue;
      if (item.fields?.length) { inspector.append(formFor(item)); continue; }
      if (!item.param) { const button = el('button', '', { type: 'button' }); button.textContent = item.label; button.addEventListener('click', () => control(item.operation, argsOf(item))); inspector.append(button); continue; }
      if (item.options.length && item.options.length <= 6) {
        const wrap = el('div', ''), title = el('div', ''); title.textContent = item.label;
        const buttons = el('div', 'p2-area-buttons');
        for (const option of item.options) { const button = el('button', '', { type: 'button' }); button.textContent = plain(option); button.addEventListener('click', () => control(item.operation, argsOf(item, option))); buttons.append(button); }
        wrap.append(title, buttons); inspector.append(wrap); continue;
      }
      const wrap = el('label', ''), select = el('select', '', { 'aria-label': item.label });
      wrap.append(document.createTextNode(item.label), select);
      const first = el('option', '', { value: '' }); first.textContent = 'Choose…'; select.append(first);
      for (const option of item.options) { const node = el('option', '', { value: option }); node.textContent = plain(option); if (option === state?.selected && item.param === 'id') node.selected = true; select.append(node); }
      select.addEventListener('change', () => { if (select.value) control(item.operation, argsOf(item, select.value)); });
      inspector.append(wrap);
    }
    inspector.append(status);
  }
  function draw() {
    if (destroyed) return;
    const svg = state?.svg ?? '';
    for (const mirror of mirrors) if (mirror.svg !== svg) { mirror.svg = svg; mirror.el.innerHTML = svg.replace(/ width="[\d.]+" height="[\d.]+"/, ''); }
    if (!visible) return;
    if (stage.dataset.svg !== svg) { stage.dataset.svg = svg; stage.innerHTML = svg || '<p>Loading…</p>'; }
    for (const node of stage.querySelectorAll('[data-select]')) node.setAttribute('data-selected', String(node.getAttribute('data-select') === state?.selected));
    if (editor) inspectorRows();
  }
  stage.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-select]')?.getAttribute('data-select');
    const select = state?.controls?.find((item) => item.param === 'id' && item.target === null);
    if (id && select) control(select.operation, { id });
  });
  return {
    update(next) { state = next ?? state; draw(); },
    setVisible(on) { visible = !!on; draw(); },
    mirror(target, px = 36) { mirrors.push({ el: target, px, svg: null }); draw(); },
    emit() {}, setSpeaking() {}, frame: () => null, animate() {},
    destroy() { destroyed = true; root.remove(); },
  };
}
