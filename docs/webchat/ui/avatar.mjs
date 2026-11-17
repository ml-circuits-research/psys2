import {mountInspectorSplitter} from './pane-splitter.mjs';
// SPDX-License-Identifier: AGPL-3.0-only
// The avatar: the one avatar, a face drawn by one renderer (worlds/ui.avatar/facedraw.mjs) from the data of the knowledge world `k.faces` (read from the catalog like any other
// knowledge, cached by the browser). The first paint uses a small bundled fallback (worlds/ui.avatar/default-face.mjs: the drawings of the default preset, the expressions and the
// motion only, generated from the catalog); the full set replaces it when it arrives. The world holds the state (state.face: a variant for each slot, colours, size and place,
// expression); this module only draws it: the big face (in the popup of the icon in the input bar), the small face of the icon, the expression chips, the faces of the catalog and
// the saved ones, and the variants of a part as small pictures to tap (a tap is typed into the chat like any other command).
// The face MOVES by rules: the host emits events (reply with its text and outcome, thinking, the voice speaking) and worlds/ui.avatar/motion.mjs (a thin call of the library's std.motion over the
// knowledge world `k.motion`, read from the catalog; the bundled subset worlds/ui.avatar/default-motion.mjs, generated from it, moves the face before the catalog arrives and offline) answers which
// eyes, brows and mouth to lay over the face now. Nothing moves while the page is hidden, and prefers-reduced-motion is honoured.
const FADE_MS = 380;
const plain = (t) => String(t).replace(/_/g, ' ');
const nounOf = (slot) => plain(slot.split('_')[0]);

const CSS = `
.p2-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.p2-avatar-stage { position: relative; width: min(100%, 460px); aspect-ratio: 1; max-height: 64vh; border-radius: 28px; overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #fff, #e8edf5 80%); box-shadow: 0 10px 30px rgba(20, 30, 60, .18); transform-origin: 50% 80%; }
.p2-avatar-layer { position: absolute; inset: 0; opacity: 0; transition: opacity ${FADE_MS}ms ease; }
.p2-avatar-layer.is-in { opacity: 1; }
.p2-avatar-layer svg { display: block; width: 100%; height: 100%; }
.p2-avatar-selection{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;overflow:visible}
.p2-avatar-selection [data-resize-handle]{pointer-events:all;cursor:nwse-resize;touch-action:none;fill:#fff;stroke:#1765d1;stroke-width:1.5;vector-effect:non-scaling-stroke}
.p2-avatar-selection [data-resize-handle=ne],.p2-avatar-selection [data-resize-handle=sw]{cursor:nesw-resize}
.p2-avatar-selection-box{fill:#1765d10a;stroke:#1765d1;stroke-width:1.8;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.p2-avatar-object-id{font:3px ui-monospace,monospace;fill:#122851;stroke:#fff;stroke-width:.8;paint-order:stroke;pointer-events:none}
.p2-avatar-object-identity{flex:1 1 100%;font-size:12px;overflow-wrap:anywhere}.p2-avatar-object-identity code{font-weight:600;user-select:all}
.p2-avatar-stage.fx-dance { animation: p2-av-dance .9s ease-in-out 3; }
.p2-avatar-stage.fx-nod { animation: p2-av-nod .5s ease-in-out 3; }
.p2-avatar-stage.fx-shake { animation: p2-av-shake .45s ease-in-out 3; }
.p2-avatar-stage.fx-wave { animation: p2-av-wave .7s ease-in-out 3; }
.p2-avatar-stage.fx-spin { animation: p2-av-spin 1s ease-in-out 1; }
.p2-avatar-stage.fx-jump, .p2-avatar-stage.fx-bounce { animation: p2-av-jump .5s ease-out 3; }
.p2-avatar-stage.fx-wiggle { animation: p2-av-wiggle .35s ease-in-out 4; }
.p2-avatar-caption { text-align: center; max-width: 460px; }
.p2-avatar-name { margin: 0; font-weight: 600; font-size: 18px; }
.p2-avatar-parts { margin: 2px 0 0; font-size: 13px; opacity: .72; }
.p2-avatar-row { display: flex; gap: 8px; width: min(100%, 460px); overflow-x: auto; padding: 4px 2px 6px; }
.p2-avatar-row[hidden] { display: none; }
.p2-avatar-card { flex: 0 0 auto; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 4px 6px; border: 2px solid transparent; border-radius: 12px;
  background: rgba(127, 140, 170, .12); color: inherit; font: inherit; cursor: pointer; }
.p2-avatar-card:hover { background: rgba(127, 140, 170, .24); }
.p2-avatar-card.is-on { border-color: #3b82f6; background: rgba(59, 130, 246, .14); }
.p2-avatar-pic { display: block; width: 52px; height: 52px; border-radius: 12px; overflow: hidden; background: #e8edf5; }
.p2-avatar-pic svg { display: block; width: 100%; height: 100%; }
.p2-avatar-lbl { font-size: 11px; line-height: 1.1; text-align: center; }
.p2-avatar-chip { display: inline-flex; align-items: center; padding: 3px 10px; border: 1px solid rgba(127, 140, 170, .45); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.p2-avatar-chip:hover { background: rgba(127, 140, 170, .2); }
.p2-avatar-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%; max-width: 460px; }
.p2-avatar-chips[hidden] { display: none; }
.p2-avatar-note { margin: 0; font-size: 11px; opacity: .65; text-align: center; max-width: 460px; }
.p2-avatar-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;width:min(100%,460px)}.p2-avatar-tools label{display:flex;align-items:center;gap:5px;font-size:12px}.p2-avatar-tools select{font:inherit;max-width:155px;background:var(--surface,#fff);color:inherit;border:1px solid #9aa4ba77;border-radius:6px;padding:5px}.p2-avatar-tools button{font:inherit;border:1px solid #9aa4ba77;border-radius:6px;background:transparent;color:inherit;padding:5px 8px;cursor:pointer}.p2-avatar-tools button:disabled{opacity:.4;cursor:default}.p2-avatar-stage:focus-visible{outline:3px solid #4478d8;outline-offset:3px}.p2-avatar-status{font-size:12px;min-height:18px;margin:0;text-align:center;max-width:460px}
.p2-avatar-stage.is-empty::after{content:"Empty avatar — choose a composition base and Recompose";position:absolute;inset:0;display:grid;place-content:center;padding:24px;text-align:center;font:16px system-ui;color:var(--muted,#687489);pointer-events:none}.p2-avatar-editor{display:grid;grid-template-columns:minmax(0,1fr) 280px;align-items:stretch;gap:0;height:100%;min-height:0;overflow:hidden}.p2-avatar-editor .p2-avatar-canvas{min-width:0;min-height:0;display:flex;position:relative}.p2-avatar-editor .p2-avatar-stage{width:100%;height:100%;aspect-ratio:auto;max-height:none;border-radius:0;box-shadow:none;background:var(--surface-2,#edf1f8)}.p2-avatar-editor .p2-avatar-inspector{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;border-left:1px solid var(--line,#b4bfd255);padding:12px;box-sizing:border-box}.p2-avatar-editor .p2-avatar-caption,.p2-avatar-editor .p2-avatar-tools,.p2-avatar-editor .p2-avatar-chips,.p2-avatar-editor .p2-avatar-note,.p2-avatar-editor .p2-avatar-row,.p2-avatar-editor .p2-avatar-status{width:100%;max-width:none}.p2-avatar-editor .p2-avatar-row{display:flex;flex-wrap:wrap;overflow:visible;box-sizing:border-box}.p2-avatar-editor .p2-avatar-caption{text-align:left}.p2-avatar-editor .p2-avatar-name{font-size:18px}.p2-avatar-editor .p2-avatar-parts{font-size:12px}.p2-avatar-editor .p2-avatar-tools{justify-content:flex-start}.p2-avatar-editor .p2-avatar-tools label{flex:1 1 100%;justify-content:space-between}.p2-avatar-editor .p2-avatar-tools select{min-width:0;max-width:170px}.p2-avatar-editor .p2-avatar-chips{justify-content:flex-start}.p2-avatar-wordlist{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.p2-avatar-wordlist summary{cursor:pointer;font-weight:600}.p2-avatar-scope{flex:1 1 100%;font-size:11px;line-height:1.5;opacity:.75}.p2-avatar-editor .p2-avatar-card{width:60px;min-width:0}.p2-avatar-editor .p2-avatar-note{text-align:left}@media(max-width:780px){.p2-avatar-editor{grid-template-columns:minmax(0,1fr) 235px}.p2-avatar-editor .p2-avatar-inspector{padding:8px;gap:8px}}@media(max-width:560px){.p2-avatar-editor{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(220px,50%) minmax(0,1fr)}.p2-avatar-editor .p2-avatar-inspector{border-left:0;border-top:1px solid var(--line,#b4bfd255)}}

@keyframes p2-av-dance { 0%, 100% { transform: rotate(0) translateY(0); } 25% { transform: rotate(-5deg) translateY(-8px); } 75% { transform: rotate(5deg) translateY(-8px); } }
@keyframes p2-av-nod { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(12px); } }
@keyframes p2-av-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-14px); } 75% { transform: translateX(14px); } }
@keyframes p2-av-wave { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(7deg); } }
@keyframes p2-av-spin { to { transform: rotate(360deg); } }
@keyframes p2-av-jump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-26px); } }
@keyframes p2-av-wiggle { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) { .p2-avatar-stage, .p2-avatar-layer { animation: none !important; transition: none; } }
`;
function ensureCss() {
  if (document.getElementById('p2-avatar-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-avatar-css';
  st.textContent = CSS;
  document.head.append(st);
}

/** What a tap on a variant says (typed into the chat like any other command): the same words as a person would use. */
/** What the face cards and the expression chips say (a tap types it into the chat like any other request; tests/avatar-cards.test.mjs reads every one through the product path). */
export const presetSay = (name) => `become ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${plain(name)}`;
export const expressionSay = (name) => (name === 'wink' ? 'wink' : `look ${name}`);
export const variantSay = (slot, name) => (name === 'none' ? `remove the ${nounOf(slot)}` : `swap the ${nounOf(slot)} for ${plain(name)}`);

/**
 * Renderer. Returns { update(state), emit(type, payload), setSpeaking(bool, text), setVisible(bool), mirror(el, px), animate({ name }), destroy() }.
 * `host.asset(path)` locates the modules of the page (the renderer, the motion rules, the catalog reader). `mirror(el, px)` keeps a small copy of the face in `el` (the icon).
 * `host.motionSeed` fixes the blink generator (tests); `host.now()` is the clock.
 */
export function createAvatar(container, host = null,{editor=false}={}) {
  ensureCss();
  container.classList.add('p2-avatar-wrap');
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const stage = el('div', 'p2-avatar-stage', { role: 'img', tabindex:'0' });
  const svgNode=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const selectionLayer=svgNode('svg',{class:'p2-avatar-selection','aria-label':'Avatar selection bounds'});stage.append(selectionLayer);
  const caption = el('div', 'p2-avatar-caption'), nameEl = el('p', 'p2-avatar-name'), partsEl = el('p', 'p2-avatar-parts');
  caption.append(nameEl, partsEl);
  const chipsEl = el('div', 'p2-avatar-chips', { role: 'group', 'aria-label': 'Expressions' });
  const optsEl = el('div', 'p2-avatar-row', { role: 'group', 'aria-label': 'Choices' });
  const facesEl = el('div', 'p2-avatar-row', { role: 'group', 'aria-label': 'Faces' });
  const noteEl = el('p', 'p2-avatar-note');
  const toolsEl=el('div','p2-avatar-tools',{'aria-label':'Edit avatar parts'}),statusEl=el('p','p2-avatar-status',{role:'status','aria-live':'polite'});
  let closeInspectorSplitter=()=>{};
  if(editor){container.classList.add('p2-avatar-editor');const canvas=el('div','p2-avatar-canvas'),inspector=el('aside','p2-avatar-inspector',{'aria-label':'Avatar inspector'});canvas.append(stage);inspector.append(caption,toolsEl,optsEl,noteEl,statusEl);container.append(canvas,inspector);closeInspectorSplitter=mountInspectorSplitter(container,inspector,{id:'avatar',persist:host?.persistent!==false});}else container.append(stage,caption,toolsEl,optsEl,noteEl,statusEl);
  optsEl.hidden = true; facesEl.hidden = true;

  let full = false, state = null, data = null, mods = null, loading = null, retry = 0, destroyed = false, lastSvg = '', shown = '';
  let catalogFacts = null, defaultMotion = '', motionAsked = false,selectedSlot=null,controlBusy=false;
  let resizeGesture=null,identifyTimer=0,geometryFrame=0,suppressSelectionClick=0;
  let fxTimer = 0, visible = false, motion = null, motionRules = null, motionTimer = 0, frame = { over: null, talking: false }, frameKey = '';
  const mirrors = [];   // { el, px, svg }: the small copies of the face (the icon)
  const now = () => (host?.now ? host.now() : performance.now());
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const say = (text) => { try { host?.send?.(text); } catch (e) { console.warn('avatar: could not send', e); } };
  async function control(operation,args){
    if(controlBusy||host?.isBusy?.())return;
    if(!host?.tool){statusEl.textContent='Face controls are unavailable.';return;}
    controlBusy=true;toolsEl.setAttribute('aria-busy','true');
    try{const result=await host.tool(operation,args,{view:'avatar'});statusEl.textContent=result.message??(result.ok?'Updated the face.':'Could not update the face.');}
    catch(error){statusEl.textContent=error.message;}
    finally{controlBusy=false;toolsEl.removeAttribute('aria-busy');}
  }
  const asset = (p) => (host?.asset ? host.asset(p) : new URL(`../${p}`, import.meta.url).href);

  /** The renderer, the motion rules and the faces of the catalog, loaded once; a catalog that cannot be reached is asked again later (the avatar then says so). */
  function load() {
    if (loading || destroyed || full) return;
    loading = (async () => {
      try {
        const [draw, logic, { DEFAULT_FACE }, motionMod, { DEFAULT_MOTION }, { createFacts }, { createKnowledgeSource }, { createCachedSource }, lib,native] = await Promise.all(['worlds/ui.avatar/facedraw.mjs', 'worlds/ui.avatar/facelogic.mjs', 'worlds/ui.avatar/default-face.mjs', 'worlds/ui.avatar/motion.mjs', 'worlds/ui.avatar/default-motion.mjs', 'lib/knowledge/facts.mjs', 'lib/loaders/knowledge-source.mjs', 'lib/loaders/knowledge-cache.mjs', 'lib/vendor/sopworld/sopworld.mjs','worlds/ui.avatar/declared-host.mjs'].map((p) => import(asset(p))));
        const { KNOWLEDGE_URLS } = await import(asset('lib/knowledge/catalog-pin.mjs'));   // the catalog at the pinned commit (P4), its mirrors when one fails
        const src = createCachedSource({ source: createKnowledgeSource(host?.knowledgeUrl?.() || KNOWLEDGE_URLS), caches: globalThis.caches });
        const facts = createFacts({ source: { text: (p) => Promise.race([src.text(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), 6000))]) } });
        mods = { draw, logic, motionMod, lib,native }; data = DEFAULT_FACE; shown = ''; motionRules = mods.motionMod.parseMotion(lib, DEFAULT_MOTION); startMotion(); draw_();   // the bundled fallback face first: the avatar never waits for the network
        host?.progress?.start?.('faces', 'Loading the face set', { quiet: true });   // PROGRESS: recorded, never shown while it loads (the fallback face is already drawn: this is an upgrade); said only when it cannot be had
        catalogFacts = facts; defaultMotion = DEFAULT_MOTION;   // the catalog's k.motion is read when the face is first looked at or first replies (adoptCatalogMotion): the bundled copy is the same text and has moved the face since the first paint
        const d = await facts.faces();
        if (!d) throw new Error('no faces in the catalog');
        data = d; full = true; shown = '';
        host?.progress?.end?.('faces', { label: 'Face set loaded' });
      } catch (e) {
        console.warn('avatar: the faces of the catalog could not be loaded; the fallback face stays', e);
        host?.progress?.fail?.('faces', 'The face set could not be loaded', 'the fallback face works: its parts can be added, removed and coloured, with fewer variants');
        if (!destroyed) retry = setTimeout(() => { loading = null; load(); }, 30000);
        loading = null;
        if (mods) { draw_(); return; }
        data = null; draw_();
        return;
      }
      loading = null;
      draw_();
    })();
  }

  // ---- motion: events in, a frame of variants over the face out; one timer, none while hidden --------------------------------------------------------------------
  const has = (slot, name) => !!data?.slots.find((s) => s.name === slot)?.variants.some((v) => v.name === name && v.parts?.length !== 0);
  /** Once, when the face is first opened or first replies: the rules of the catalog's k.motion replace the bundled ones (same text unless the catalog moved on). Offline or unreadable: the bundled rules stay. */
  function adoptCatalogMotion() {
    if (motionAsked || !catalogFacts || !mods) return;
    motionAsked = true;
    catalogFacts.worldText('k.motion').then((text) => { if (!text || text === defaultMotion || destroyed) return; motionRules = mods.motionMod.parseMotion(mods.lib, text); motion = null; frameKey = ''; startMotion(); })
      .catch((e) => console.warn('avatar: the k.motion of the catalog was not used; the bundled rules stay', e));
  }
  const features = (slot, name) => data?.slots.find((s) => s.name === slot)?.variants.find((v) => v.name === name)?.features ?? {};
  function startMotion() {
    if (!mods?.motionMod || !motionRules || motion) return;
    motion = mods.motionMod.createMotion({ lib: mods.lib, motion: motionRules, features, seed: host?.motionSeed ?? (Math.floor(Math.random() * 1e9) | 1), has, reduced: !!reducedQuery?.matches, t0: now() });
    tick();
  }
  reducedQuery?.addEventListener?.('change', () => { motion = null; frameKey = ''; startMotion(); });   // the preference changed: a new scheduler
  const awake = () => !destroyed && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  function tick() {
    clearTimeout(motionTimer); motionTimer = 0;
    if (!motion || !data || !awake()) return;
    const t = now();
    frame = motion.frame(t);
    const key = JSON.stringify(frame);
    if (key !== frameKey) { frameKey = key; draw_(); }
    const ms = motion.nextChange(t);
    if (Number.isFinite(ms)) motionTimer = setTimeout(tick, ms);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); else clearTimeout(motionTimer); });

  const faceOf = () => (state?.face?.v === 2 ? state.face : mods.logic.newFace(data));
  const svgOf = (face, size) => mods.draw.renderFace(data, face, { size, padding:editor&&!size?Math.max(data.frame.w,data.frame.h)*(mods.native.avatarCapabilities(data).geometry.maxScale-1)/2:0,over: mods.draw.shownOver(face, frame), bg: size ? undefined : '#e8edf5', label: `${state?.name ?? 'Avatar'}, a drawn face with ${mods.logic.describeFace(data, face)}` });

  function paint(svg, fade) {
    if (svg === lastSvg) return;
    lastSvg = svg;
    const top = [...stage.children].filter(node=>node.classList.contains('p2-avatar-layer')).at(-1);
    if (!fade && top?.classList.contains('p2-avatar-layer')) { top.innerHTML = svg; return; }
    const layer = el('div', 'p2-avatar-layer');
    layer.innerHTML = svg;
    const old = [...stage.children].filter(node=>node.classList.contains('p2-avatar-layer'));
    stage.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add('is-in'); old.forEach((o) => o.classList.remove('is-in')); }));
    setTimeout(() => old.forEach((o) => o.remove()), FADE_MS + 60);
  }
  const card = (label, action, svg, on) => {
    const b = el('button', `p2-avatar-card${on ? ' is-on' : ''}`, { type: 'button', title: label,'aria-pressed':String(!!on) });
    const pic = el('span', 'p2-avatar-pic'); if (svg) pic.innerHTML = svg;
    const lbl = el('span', 'p2-avatar-lbl'); lbl.textContent = label;
    b.append(pic, lbl); b.addEventListener('click', action);
    return b;
  };
  const rendererSvg=()=>[...stage.querySelectorAll('.p2-avatar-layer > svg')].at(-1);
  function renderedBounds(id,svg=rendererSvg()){
    if(!svg)return null;
    const nodes=id==='face'?[svg.querySelector('[data-avatar-face]')]:[...svg.querySelectorAll('[data-avatar-slot]')].filter(node=>node.getAttribute('data-avatar-slot')===id);
    const inverse=svg.getScreenCTM()?.inverse();if(!inverse)return null;
    const points=[];
    for(const node of nodes){if(!node)continue;const matrix=inverse.multiply(node.getScreenCTM()),box=node.getBBox();for(const [x,y]of [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]])points.push(new DOMPoint(x,y).matrixTransform(matrix));}
    if(!points.length)return null;
    const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y;
    return w||h?{x,y,w,h}:null;
  }
  const currentScale=id=>faceOf().adj?.[id]?.s??1;
  function paintSelection(box){
    selectionLayer.querySelector('[data-selection-geometry]')?.remove();if(!box||!selectedSlot)return;
    const group=svgNode('g',{'data-selection-geometry':'true'}),pad=1;
    group.append(svgNode('rect',{class:'p2-avatar-selection-box',x:box.x-pad,y:box.y-pad,width:Math.max(box.w,0)+pad*2,height:Math.max(box.h,0)+pad*2,'data-selected-object-id':selectedSlot}));
    const label=svgNode('text',{class:'p2-avatar-object-id',x:box.x,y:box.y-2});label.textContent=selectedSlot;group.append(label);
    for(const [corner,x,y]of [['nw',box.x,box.y],['ne',box.x+box.w,box.y],['sw',box.x,box.y+box.h],['se',box.x+box.w,box.y+box.h]])group.append(svgNode('circle',{'data-resize-handle':corner,cx:x,cy:y,r:1.8,role:'button',tabindex:0,'aria-label':'Resize '+selectedSlot+' from '+corner}));
    selectionLayer.append(group);
  }
  function geometry(){
    if(destroyed||!data||!visible)return;
    selectionLayer.setAttribute('viewBox',rendererSvg()?.getAttribute('viewBox')??`0 0 ${data.frame.w} ${data.frame.h}`);selectionLayer.replaceChildren();
    if(state?.idDisplay?.mode==='always'||state?.idDisplay?.mode==='temporary'&&Date.now()<state.idDisplay.expiresAt){
      const svg=rendererSvg(),ids=[...new Set([...svg?.querySelectorAll('[data-avatar-slot]')??[]].map(node=>node.getAttribute('data-avatar-slot')))];
      for(const id of ['face',...ids]){if(id===selectedSlot)continue;const box=renderedBounds(id,svg);if(!box)continue;const label=svgNode('text',{class:'p2-avatar-object-id',x:box.x,y:box.y-1,'data-object-id':id});label.textContent=id;selectionLayer.append(label);}
    }
    paintSelection(renderedBounds(selectedSlot));
  }
  function scheduleGeometry(){cancelAnimationFrame(geometryFrame);geometryFrame=requestAnimationFrame(()=>{geometryFrame=0;if(!resizeGesture)geometry();});}
  const geometryObserver=new ResizeObserver(scheduleGeometry);geometryObserver.observe(stage);
  function cursorPoint(event){const matrix=selectionLayer.getScreenCTM();return matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()):null;}
  const scaleLimits=()=>mods.native.avatarCapabilities(data).geometry;
  function resizeValue(event){
    const point=cursorPoint(event);if(!point||!resizeGesture)return null;
    const {center,initialDistance,scale}=resizeGesture,limits=scaleLimits();
    return Math.max(limits.minScale,Math.min(limits.maxScale,scale*Math.hypot(point.x-center.x,point.y-center.y)/initialDistance));
  }
  selectionLayer.addEventListener('pointerdown',event=>{
    const handle=event.target.closest?.('[data-resize-handle]');if(!handle||event.button!==0||controlBusy||host?.isBusy?.())return;
    const box=renderedBounds(selectedSlot),point=cursorPoint(event);if(!box||!point)return;
    const center={x:box.x+box.w/2,y:box.y+box.h/2},initialDistance=Math.hypot(point.x-center.x,point.y-center.y);if(initialDistance===0)return;
    event.preventDefault();event.stopPropagation();resizeGesture={pointer:event.pointerId,id:selectedSlot,box,center,initialDistance,scale:currentScale(selectedSlot)};stage.setPointerCapture(event.pointerId);
  });
  const resizeMove=event=>{if(resizeGesture?.pointer!==event.pointerId)return;const scale=resizeValue(event);if(scale===null)return;const {box,center}=resizeGesture,ratio=scale/resizeGesture.scale;paintSelection({x:center.x-box.w*ratio/2,y:center.y-box.h*ratio/2,w:box.w*ratio,h:box.h*ratio});};
  const resizeEnd=event=>{
    if(resizeGesture?.pointer!==event.pointerId)return;
    const gesture=resizeGesture,scale=event.type==='pointerup'?resizeValue(event):null;resizeGesture=null;suppressSelectionClick=performance.now()+100;
    if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);geometry();
    if(scale!==null&&scale!==gesture.scale)control(gesture.id==='face'?'avatar.face.resize':'avatar.part.resize',gesture.id==='face'?{id:'face',scale}:{ids:[gesture.id],scale});
  };
  window.addEventListener('pointermove',resizeMove,true);window.addEventListener('pointerup',resizeEnd,true);window.addEventListener('pointercancel',resizeEnd,true);
  selectionLayer.addEventListener('keydown',event=>{if(!event.target.closest?.('[data-resize-handle]')||!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key))return;event.preventDefault();event.stopPropagation();const limits=scaleLimits(),scale=Math.max(limits.minScale,Math.min(limits.maxScale,currentScale(selectedSlot)+(['ArrowUp','ArrowRight'].includes(event.key)?1:-1)*(event.shiftKey?.1:.01)));control(selectedSlot==='face'?'avatar.face.resize':'avatar.part.resize',selectedSlot==='face'?{id:'face',scale}:{ids:[selectedSlot],scale});});
  function rows(face) {
    const caps=mods.native.avatarCapabilities(data);
    selectedSlot=state?.selectedSlot??null;
    selectedSlot=selectedSlot==='face'||caps.slots.some(s=>s.id===selectedSlot)?selectedSlot:null;
    const sig = JSON.stringify([face.base,face.expression,face.expressionParts,face.slots,face.colours,face.paint,face.grade,face.adj,selectedSlot,state?.idDisplay,full]);
    if (sig === shown) return;
    shown = sig;
    toolsEl.replaceChildren();
    const select=(label,values,value,change)=>{const wrap=el('label',''),input=el('select','',{'aria-label':label});wrap.append(document.createTextNode(label+' '),input);for(const [id,name]of values){const option=el('option','',{value:id});option.textContent=name;input.append(option);}input.value=value;input.addEventListener('change',()=>change(input.value));toolsEl.append(wrap);return input;};
    const characterKind=data.presets[face.base]?.kind??'';
    select('Character kind',caps.characterKinds.map(kind=>[kind,plain(kind)]),characterKind,kind=>control('avatar.face.compose',{characterKind:kind}));
    select('Composition base',caps.presets.filter(name=>!characterKind||data.presets[name].kind===characterKind).map(name=>[name,plain(name)]),face.base,base=>control('avatar.face.compose',{base}));
    const emotions=[['','Neutral'],...caps.emotions.map(name=>[name,plain(name)])];if(face.expression&&!emotions.some(([name])=>name===face.expression))emotions.push([face.expression,plain(face.expression)+' (legacy pose)']);
    select('Emotion',emotions,face.expression??'',expression=>control('avatar.face.expression',{expression}));
    select('Selection',[['','Choose an object'],['face','Whole avatar'],...caps.slots.filter(s=>s.variants.length).map(s=>[s.id,s.label])],selectedSlot??'',id=>control(id==='face'?'avatar.face.select':'avatar.part.select',{id:id||null}));
    const identity=el('p','p2-avatar-object-identity',{'data-selected-native-id':selectedSlot??''}),identityValue=el('code','');identity.append(document.createTextNode('Object ID: '),identityValue);identityValue.textContent=selectedSlot??'none';toolsEl.append(identity);
    const identify=el('button','',{type:'button','aria-label':'Identify avatar object IDs'});identify.textContent='Identify IDs';identify.addEventListener('click',()=>control('avatar.ids.show',{mode:'temporary'}));toolsEl.append(identify);
    const alwaysWrap=el('label',''),always=el('input','',{type:'checkbox','aria-label':'Always show avatar object IDs'});always.checked=state?.idDisplay?.mode==='always';alwaysWrap.append(always,document.createTextNode('Always show IDs'));always.addEventListener('change',()=>control('avatar.ids.show',{mode:always.checked?'always':'off'}));toolsEl.append(alwaysWrap);
    if(selectedSlot){const scaleWrap=el('label',''),scale=el('input','',{type:'number',min:caps.geometry.minScale,max:caps.geometry.maxScale,step:'any','aria-label':'Selection scale'});scale.value=String(currentScale(selectedSlot));scaleWrap.append(document.createTextNode('Scale '),scale);scale.addEventListener('change',()=>{const value=Number(scale.value);if(!Number.isFinite(value)||value<caps.geometry.minScale||value>caps.geometry.maxScale){statusEl.textContent=`Scale must be between ${caps.geometry.minScale} and ${caps.geometry.maxScale}.`;scale.value=String(currentScale(selectedSlot));return;}control(selectedSlot==='face'?'avatar.face.resize':'avatar.part.resize',selectedSlot==='face'?{id:'face',scale:value}:{ids:[selectedSlot],scale:value});});toolsEl.append(scaleWrap);}
    const clear=el('button','',{type:'button'});clear.textContent='Clear avatar';clear.addEventListener('click',()=>{const f=faceOf(),ids=data.slots.filter(s=>(f.expressionParts?.[s.name]??f.slots[s.name])&&((f.expressionParts?.[s.name]??f.slots[s.name])!=='none')).map(s=>s.name);control('avatar.clear',{ids});});toolsEl.append(clear);
    const recompose=el('button','',{type:'button'});recompose.textContent='Recompose';recompose.addEventListener('click',()=>control('avatar.face.preset',{preset:faceOf().base}));toolsEl.append(recompose);
    const undo=el('button','',{type:'button'});undo.textContent='Undo';undo.addEventListener('click',()=>control('avatar.undo',{}));toolsEl.append(undo);
    const slot=caps.slots.find(s=>s.id===selectedSlot),present=(face.expressionParts?.[selectedSlot]??face.slots[selectedSlot])&&(face.expressionParts?.[selectedSlot]??face.slots[selectedSlot])!=='none';
    if(!slot){optsEl.replaceChildren();optsEl.hidden=true;return;}
    const variant=data.slots.find(s=>s.name===selectedSlot)?.variants.find(v=>v.name===(face.expressionParts?.[selectedSlot]??face.slots[selectedSlot]));
    for(const [property,values]of Object.entries(slot.features??{})){if(!values.length)continue;const input=select('Feature '+plain(property),[['','Set '+plain(property)],...values.map(value=>[value,plain(value)])],'',value=>{if(value)control('avatar.part.feature',{id:selectedSlot,property,value});});input.disabled=!present;}
    const features=el('div','p2-avatar-scope');features.textContent='Current features: '+Object.entries(variant?.features??{}).map(([key,values])=>plain(key)+': '+values.map(plain).join(', ')).join(' · ');toolsEl.append(features);
    const colours=mods.native.avatarColoursFor(data,face,selectedSlot);
    const colour=select(slot.colourRole?plain(slot.colourRole)+' colour':'Part colour',[['','Choose'],...colours.map(c=>[c,plain(c)])],face.paint?.[selectedSlot]??face.colours?.[slot.colourRole]??'',c=>{if(c)control('avatar.part.change',{ids:mods.native.avatarColourScope(data,faceOf(),selectedSlot,c),colour:c});});colour.disabled=!present||!colours.length;
    const colourValue=face.paint?.[selectedSlot]??face.colours?.[slot.colourRole],scope=colourValue?mods.native.avatarColourScope(data,face,selectedSlot,colourValue):[selectedSlot];
    const scopeEl=el('div','p2-avatar-scope');scopeEl.textContent='Colour affects: '+scope.map(plain).join(', ');toolsEl.append(scopeEl);
    const size=select('Size preset',[['','Choose a preset'],...caps.sizes.map(s=>[s,plain(s)])],'',size=>{if(size)control('avatar.part.change',{ids:[selectedSlot],size});});size.disabled=!present;
    const linkedParts=mods.native.avatarResizeScope(data,selectedSlot);
    if(linkedParts.length){const linked=el('div','p2-avatar-scope');linked.textContent='Resizing also adjusts the attached parts: '+linkedParts.map(plain).join(', ');toolsEl.append(linked);}
    for(const [label,direction]of [['←','left'],['↑','up'],['↓','down'],['→','right']]){const b=el('button','',{type:'button',title:'Move '+slot.label+' '+direction,'aria-label':'Move '+slot.label+' '+direction});b.textContent=label;b.disabled=!present;b.addEventListener('click',()=>control('avatar.part.move',{ids:[selectedSlot],place:direction}));toolsEl.append(b);}
    const remove=el('button','',{type:'button'});remove.textContent='Delete selected part';remove.disabled=!present;remove.addEventListener('click',()=>control('avatar.parts.remove',{ids:[selectedSlot]}));toolsEl.append(remove);
    const wordlist=el('details','p2-avatar-wordlist'),wordTitle=el('summary','');wordTitle.textContent='Words for '+slot.label;const wordBody=el('div','');wordBody.textContent=[slot.label,...(data.aliases?.[selectedSlot]??[])].filter((w,i,a)=>a.indexOf(w)===i).join(' · ');wordlist.append(wordTitle,wordBody);toolsEl.append(wordlist);
    const choices=slot.optional?['none',...slot.variants]:slot.variants;
    optsEl.replaceChildren(...choices.map(variant=>card(variant==='none'?'Remove':plain(variant),()=>variant==='none'?control('avatar.parts.remove',{ids:[selectedSlot]}):present?control('avatar.part.change',{ids:[selectedSlot],variant}):control('avatar.part.add',{id:selectedSlot,variant}),variant==='none'?'':mods.draw.variantSvg(data,face,selectedSlot,variant,{size:52}),(face.expressionParts?.[selectedSlot]??face.slots[selectedSlot])===variant)));optsEl.hidden=false;
  }
  stage.addEventListener('click',event=>{if(performance.now()<suppressSelectionClick||event.target.closest?.('[data-resize-handle]'))return;const id=event.target.closest?.('[data-avatar-slot]')?.getAttribute('data-avatar-slot');control(id?'avatar.part.select':'avatar.face.select',{id:id??'face'});stage.focus();});
  stage.addEventListener('keydown',event=>{if(!data||!selectedSlot)return;const directions={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};if(directions[event.key]&&selectedSlot!=='face'){event.preventDefault();control('avatar.part.move',{ids:[selectedSlot],place:directions[event.key]});}else if((event.key==='Delete'||event.key==='Backspace')&&selectedSlot!=='face'){event.preventDefault();control('avatar.parts.remove',{ids:[selectedSlot]});}});

  function draw_() {
    if (destroyed) return;
    clearTimeout(identifyTimer);if(state?.idDisplay?.mode==='temporary'&&state.idDisplay.expiresAt>Date.now())identifyTimer=setTimeout(geometry,Math.min(60001,state.idDisplay.expiresAt-Date.now()+1));
    const inspector=container.querySelector(':scope > .p2-avatar-inspector');if(inspector)inspector.dataset.selectedNativeIds=JSON.stringify(state?.selectedSlot?[state.selectedSlot]:[]);
    nameEl.textContent = state?.name ?? 'PSys2';
    if (!data) {
      load();
      partsEl.textContent = 'Drawing my face…';
      return;
    }
    const face = faceOf();
    for (const m of mirrors) { const svg = svgOf(face, m.px).replace(/ width="[\d.]+" height="[\d.]+"/, ''); if (svg !== m.svg) { m.svg = svg; m.el.innerHTML = svg; } }
    if (!visible) return;   // the big face and its rows are drawn while the popup is open
    const empty=!data.slots.some(s=>(face.expressionParts?.[s.name]??face.slots[s.name])&&((face.expressionParts?.[s.name]??face.slots[s.name])!=='none'));stage.classList.toggle('is-empty',empty);
    partsEl.textContent = empty?'Empty avatar — choose a composition base and Recompose.':mods.logic.describeFace(data,{...face,slots:{...face.slots,...(face.expressionParts??{})}});
    noteEl.textContent = (full?'Parts and looks from the face knowledge catalog. ':'Showing the built-in composition while the catalog loads. ')+'Choose a part or click it in the preview. Arrow keys move it; Delete removes the selected part.';
    stage.setAttribute('aria-label', `${nameEl.textContent}, a drawn face with ${partsEl.textContent}`);
    rows(face);
    paint(svgOf(face), !frame.talking&&!resizeGesture);scheduleGeometry();
  }

  load();
  draw_();
  return {
    update(next) { state = next ?? state; draw_(); },
    /** An event of the host: 'reply' { text, outcome }, 'thinking' { on }, 'reset' (a 'typing' or a 'mood' has no rule in k.motion and changes nothing). Moves the face by the motion rules. */
    emit(type, payload = {}) { if (type === 'reply') adoptCatalogMotion(); if (!motion) return; motion.emit(type, payload, now()); tick(); },
    setSpeaking(on, text) { if (!motion) return; motion.emit('speaking', { on: !!on, text }, now()); tick(); },
    /** The popup opens or closes: the big face is drawn only while it is open; closing keeps the state. */
    setVisible(on) { visible = !!on; if (visible) { shown = ''; lastSvg = ''; adoptCatalogMotion(); } draw_(); },
    /** Keeps a small copy of the face in `target` (the icon in the input bar). */
    mirror(target, px = 36) { mirrors.push({ el: target, px, svg: '' }); draw_(); },
    /** The motion's current frame (tests and the debug view). */
    frame: () => frame,
    /** Effect avatar.animate { name }. */
    animate({ name } = {}) {
      if (!/^[a-z]+$/.test(String(name ?? ''))) return;
      clearTimeout(fxTimer);
      stage.className = stage.className.replace(/\bfx-\w+/g, '').trim();
      void stage.offsetWidth;
      stage.classList.add(`fx-${name}`);
      fxTimer = setTimeout(() => { stage.className = stage.className.replace(/\bfx-\w+/g, '').trim(); }, 2800);
    },
    destroy() { destroyed = true;closeInspectorSplitter();geometryObserver.disconnect(); clearTimeout(retry); clearTimeout(motionTimer); clearTimeout(fxTimer);clearTimeout(identifyTimer);cancelAnimationFrame(geometryFrame);window.removeEventListener('pointermove',resizeMove,true);window.removeEventListener('pointerup',resizeEnd,true);window.removeEventListener('pointercancel',resizeEnd,true);resizeGesture=null; },
  };
}
