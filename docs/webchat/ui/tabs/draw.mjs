// Drawing tab (world art.draw, spec 07 sections 6-7): a children's drawing board. The world holds the scene graph
// (objects, sky, ground, selection); this module only draws it with rough.js (vendored in ../../vendor/draw/) so it
// looks hand-drawn, pops new things in, and sends explicit editing gestures through declared native tools.
// Effects: draw.download { format: 'png' | 'svg', filename }.
import { createRenderer, PAPER } from './draw/render.mjs';

const VENDOR = new URL('../../vendor/draw/rough.mjs', import.meta.url);
const TOOLS_ASSET = 'worlds/art.draw/declared-host.mjs';
const PARTS_ASSET = 'worlds/art.draw/part-tools.mjs';
const VALUES_ASSET = 'lib/knowledge/values.mjs';
const SCENE_ASSET = 'worlds/art.draw/scene.mjs';
const W = 1000, H = 700;

const CRAYONS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const HINTS = [
  'draw a red house', 'draw three trees', 'put a big yellow sun in the top right corner', 'add a cloud next to the sun',
  'draw a cat under the tree', 'make the sky dark blue', 'make it night', 'add grass', 'draw a rainbow',
];
const EMPTY = { objects: [], background: 'white', sky: null, ground: null, selected: null };

const CSS = `
.dr-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:380px;gap:6px;color:#263646;font:13px system-ui;container-type:inline-size}
.dr-toolbar,.dr-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.dr-toolbar{padding:4px 0}.dr-toolbar label{display:flex;align-items:center;gap:6px}
.dr-workspace{display:grid;grid-template-columns:minmax(0,1fr) 264px;gap:8px;flex:1;min-height:0}.dr-board{position:relative;width:100%;height:100%;min-width:0;border:1px solid #d5dae0;background:#f7f8fa;border-radius:6px;box-sizing:border-box;overflow:hidden}.dr-paper{position:relative;width:100%;height:100%;min-height:320px;touch-action:none}.dr-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}.dr-canvas:focus-visible{box-shadow:inset 0 0 0 2px #356ac3}.dr-inspector{overflow:auto;min-width:0;background:#fff;border:1px solid #d5dae0;border-radius:6px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}.dr-inspector h3{font-size:13px;margin:0 0 8px}.dr-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-editor label{display:grid;gap:4px;min-width:0;font-size:12px;color:#536171}.dr-editor label:has(select[multiple]),.dr-editor label:has(input[type=search]),.dr-editor label:has(input[aria-label="Object name"]){grid-column:1/-1}
.dr-root input,.dr-root select{font:13px system-ui;border:1px solid #d5dae0;background:#fff;color:#263646;border-radius:5px;padding:7px;min-width:0;max-width:100%;box-sizing:border-box}.dr-editor input,.dr-editor select{width:100%}.dr-act{font:600 12px system-ui;border:1px solid #d5dae0;border-radius:5px;background:#fff;color:#263646;min-height:32px;padding:6px 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}.dr-act:hover{background:#f0f4fa}.dr-act[aria-pressed=true]{background:#e9f0fd;border-color:#356ac3;color:#2359a9}.dr-act:disabled{opacity:.45;cursor:default}.dr-act svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.dr-grain,.dr-vignette,.dr-crayons{display:none}.dr-hint{position:absolute;inset:0;display:grid;place-content:center;pointer-events:none;text-align:center;padding:30px;color:#788491;font:14px system-ui}.dr-hint b{font-size:19px;font-weight:500;display:block;margin-bottom:8px}.dr-pencil{display:none}.dr-tools{display:flex;flex-direction:column;gap:8px}.dr-caption{margin:0;font-size:12px;color:#66717e;min-height:18px}.dr-root [hidden]{display:none!important}.dr-empty-selection{color:#788491;line-height:1.6}.dr-selection-heading{grid-column:1/-1;margin:0;font-size:13px}.dr-inspector details{grid-column:1/-1}.dr-inspector summary{cursor:pointer;color:#536171;font-size:12px}.dr-inspector details>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:10px}
@container(max-width:640px){.dr-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(320px,55vh) auto}.dr-inspector{overflow:visible}.dr-editor{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
`;

function ensureCss() {
  if (document.getElementById('p2-draw-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-draw-css';
  st.textContent = CSS;
  document.head.append(st);
}

/** A soft paper-grain tile as a data URL (generated once). */
let grainUrl = null;
function paperGrain() {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  let t = 12345;
  const rnd = () => { t = (Math.imul(t, 1664525) + 1013904223) >>> 0; return t / 4294967296; };
  g.fillStyle = '#fff'; g.fillRect(0, 0, 220, 220);
  for (let i = 0; i < 2600; i++) { const v = 215 + Math.floor(rnd() * 40); g.fillStyle = `rgba(${v - 12},${v - 22},${v - 40},${0.05 + rnd() * 0.16})`; g.fillRect(rnd() * 220, rnd() * 220, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(170,140,90,${0.04 + rnd() * 0.07})`; g.beginPath(); const x = rnd() * 220, y = rnd() * 220; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26); g.stroke(); }
  grainUrl = `url(${c.toDataURL()})`;
  return grainUrl;
}

const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  fresh: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12 11v6M9 14h6"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>',
};
const PENCIL = '<svg class="dr-pencil" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56l4-14L42 12a6 6 0 0 1 8.5 0l1.5 1.5a6 6 0 0 1 0 8.5L22 52z" fill="#ffd43b" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/><path d="M8 56l4-14 10 10z" fill="#f3c69b" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/><path d="M8 56l1.7-6 4.3 4.3z" fill="#3a3040"/><path d="M44 10l10 10" stroke="#3a3040" stroke-width="3"/><path d="M46 8l10 10-4 4-10-10z" fill="#ff7eb6" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/></svg>';

const plural = (kind, n) => (n === 1 ? kind : kind === 'person' ? 'people' : kind === 'fish' ? 'fish' : /s$/.test(kind) ? `${kind}es` : `${kind}s`);
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

/** "2 trees, a house and the sun" for the caption. */
export function captionOf(state) {
  const objs = state?.objects ?? [];
  if (!objs.length && !state?.sky && !state?.ground) return 'An empty page. Say what to draw!';
  const counts = new Map();
  for (const o of objs) counts.set(o.name??o.semanticKind??o.thing??o.kind,(counts.get(o.name??o.semanticKind??o.thing??o.kind)??0)+1);
  const bits = [...counts].map(([k, n]) => (n === 1 ? `a ${k}` : `${n} ${plural(k, n)}`));
  if (state?.sky) bits.push(`${state.sky} sky`);
  if (state?.ground) bits.push(state.ground);
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0];
}

function make(holder, host) {
  let api;
  ensureCss();
  holder.style.maxWidth='none';holder.style.height='100%';
  holder.classList.add('dr-root');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const board = el('div', 'dr-board'), paper = el('div', 'dr-paper'), canvas = el('canvas', 'dr-canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  canvas.setAttribute('role', 'img');canvas.tabIndex=0;canvas.title='Drag to move. Arrow keys nudge; Shift moves farther. Enter edits the name; Delete removes.';
  const grain = el('div', 'dr-grain'), vignette = el('div', 'dr-vignette'), hint = el('div', 'dr-hint');
  paper.append(canvas, grain, vignette, hint);
  board.append(paper);
  const tools = el('div', 'dr-tools'), crayons = el('div', 'dr-crayons'), actions = el('div', 'dr-actions'), caption = el('p', 'dr-caption');
  caption.setAttribute('aria-live', 'polite');
  holder.append(board, tools, caption);
  tools.append(crayons, actions);

  let scene = null, renderer = null, rough = null, rc = null, ctx = null;
  let drag=null,toolBindings=[],colourKnowledge=null,partTools=null,mode='select',marquee=null;
  let state = EMPTY, loadError = null, destroyed = false, raf = 0, hintTimer = 0, hintIndex = 0, last = 0, hover = null;
  const shown = new Map();   // id -> { obj, cur: pose, born, dying }

  // Native operation arguments are shared by pointer/keyboard gestures and future voice commands.
  const tool=async(operation,args={})=>{try{if(typeof host.tool!=='function')throw Error('The drawing tools are not available.');const result=await host.tool(operation,args);if(result?.text)caption.textContent=result.text;return result;}catch(e){caption.textContent=String(e.message??e);return null;}};
  const selectedIds=()=>(state.selectedIds??(state.selected?[state.selected]:[])).filter(id=>state.objects.some(o=>o.id===id));
  const selected=()=>state.objects?.find(o=>o.id===state.selected)??null;
  const readable=o=>o.name||scene?.kindName?.(scene.kindKey(o))||o.thing||o.kind;
  const editor=el('div','dr-editor');holder.insertBefore(editor,board);
  const control=(label,type='text')=>{const box=el('label');box.append(document.createTextNode(label));const input=el(type==='select'?'select':'input');if(type!=='select')input.type=type;input.setAttribute('aria-label',label);box.append(input);editor.append(box);return input;};
  const kinds=control('Add shape or object','select');kinds.disabled=true;
  const addButton=el('button','dr-act','Add');addButton.type='button';addButton.disabled=true;addButton.addEventListener('click',()=>setMode('add'));editor.append(addButton);
  const objectChoice=control('Selected object','select');objectChoice.addEventListener('change',()=>tool('drawing.object.select',{id:objectChoice.value||null}));
  const nameInput=control('Object name'),sizeInput=control('Size','number'),colourInput=control('Colour','color'),colourChoice=control('Named colour','select');
  sizeInput.min='1';sizeInput.step='1';
  const applyName=()=>{const o=selected();if(o)tool('drawing.object.change',{ids:[o.id],name:nameInput.value});};
  nameInput.addEventListener('change',applyName);nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nameInput.blur();canvas.focus();}});
  sizeInput.addEventListener('change',()=>{const o=selected(),size=Number(sizeInput.value);if(o&&Number.isFinite(size)&&size>0)tool('drawing.object.change',{ids:[o.id],size});});
  colourInput.addEventListener('change',()=>{const o=selected();if(o)tool('drawing.object.change',{ids:[o.id],color:colourInput.value});});
  colourChoice.addEventListener('change',()=>{const o=selected(),color=colourChoice.value?colourKnowledge?.colourHex(colourChoice.value):null;if(o&&(color||colourChoice.value===''))tool('drawing.object.change',{ids:[o.id],color});});
  const act=(label,icon,callback)=>{const b=el('button','dr-act',`${ICON[icon]??''}<span>${label}</span>`);b.type='button';b.addEventListener('click',callback);actions.append(b);return b;};
  const removeButton=act('Delete selection','',()=>{const ids=selectedIds();if(ids.length)tool('drawing.object.remove',{ids});});
  act('Undo','undo',()=>tool('undo'));
  const redoButton=act('Redo','redo',()=>tool('drawing.redo'));redoButton.disabled=true;
  act('Clear drawing','fresh',()=>tool('drawing.page.clear'));
  act('Save PNG','save',()=>api.download({format:'png'}));act('Save SVG','save',()=>api.download({format:'svg'}));
  const crayonButtons=[];
  const paintCrayons=()=>{for(const [c,b]of crayonButtons){const hex=colourKnowledge?.colourHex(c);if(hex)b.style.background=hex;b.disabled=!selected()||!hex;}};
  for(const c of CRAYONS){const b=el('button','dr-crayon');b.type='button';b.title=`Colour selected ${c}`;b.setAttribute('aria-label',`Colour selected ${c}`);b.disabled=true;crayonButtons.push([c,b]);if(c==='white')b.style.boxShadow='inset 0 0 0 2px #d8d2c4, 0 1px 0 rgba(0,0,0,.25)';b.addEventListener('click',()=>{const o=selected(),color=colourKnowledge?.colourHex(c);if(o&&color)tool('drawing.object.change',{ids:[o.id],color});});crayons.append(b);}
  const knowledgeInput=control('Find a word in knowledge','search'),dictionary=el('datalist');dictionary.id='drawing-words-'+crypto.randomUUID();knowledgeInput.setAttribute('list',dictionary.id);editor.append(dictionary);let dictionaryWords=null,dictionaryPromise=null;
  const loadDictionary=()=>dictionaryPromise??=Promise.all([import(host.asset('lib/loaders/knowledge-source.mjs')),import(host.asset('lib/knowledge/catalog-pin.mjs'))]).then(async([k,pin])=>{const source=k.createKnowledgeSource(pin.KNOWLEDGE_URLS),raw=await source.text('vocab.json');if(!raw)throw Error('Knowledge dictionary is unavailable.');const vocab=JSON.parse(raw);dictionaryWords=Object.entries(vocab).filter(([,shards])=>Array.isArray(shards)&&shards.some(id=>/^(k.objects|k.people|k.scenes)\//.test(id))).map(([word])=>word).sort();return dictionaryWords;}).catch(e=>{dictionaryPromise=null;caption.textContent=e.message;return [];});
  const suggestWords=async()=>{await loadDictionary();dictionary.textContent='';const query=knowledgeInput.value.trim().toLowerCase();for(const word of (dictionaryWords??[]).filter(w=>w.startsWith(query)).slice(0,80)){const option=el('option');option.value=word;dictionary.append(option);}};
  knowledgeInput.addEventListener('focus',suggestWords);knowledgeInput.addEventListener('input',suggestWords);
  const addKnowledge=el('button','dr-act','Add from knowledge');addKnowledge.type='button';addKnowledge.addEventListener('click',()=>{const name=knowledgeInput.value.trim();if(name)tool('drawing.catalog.make',{name});});editor.append(addKnowledge);
  const partChoice=control('Object part','select'),partX=control('Part X','number'),partY=control('Part Y','number'),partWidth=control('Part width','number'),partHeight=control('Part height','number'),partColour=control('Part colour','color');
  const currentPart=()=>{const o=selected(),index=o&&state.selectedPart?.id===o.id?state.selectedPart.index:null;return o&&index!==null?partTools?.drawingPartsOf(o)[index]??null:null;};
  partChoice.addEventListener('change',()=>{const o=selected();if(o)tool(partChoice.value===''?'drawing.object.select':'drawing.part.select',partChoice.value===''?{id:o.id}:{id:o.id,index:Number(partChoice.value)});});
  const movePart=()=>{const p=currentPart(),x=Number(partX.value),y=Number(partY.value);if(p&&Number.isFinite(x)&&Number.isFinite(y))tool('drawing.part.place',{id:p.object,index:p.index,x,y});};partX.addEventListener('change',movePart);partY.addEventListener('change',movePart);
  for(const [input,key]of [[partWidth,'width'],[partHeight,'height']]){input.min='.01';input.step='1';input.addEventListener('change',()=>{const p=currentPart(),value=Number(input.value);if(p&&Number.isFinite(value)&&value>0)tool('drawing.part.change',{id:p.object,index:p.index,[key]:value});});}
  partColour.addEventListener('change',()=>{const p=currentPart();if(p)tool('drawing.part.change',{id:p.object,index:p.index,color:partColour.value});});
  const partAction=(label,operation)=>{const b=el('button','dr-act',label);b.type='button';b.addEventListener('click',()=>{const p=currentPart();if(p)tool(operation,{id:p.object,index:p.index});});editor.append(b);return b;};
  const extractPart=partAction('Extract part','drawing.part.extract'),deletePart=partAction('Delete part','drawing.part.remove');
  const groupChoice=control('Objects to group','select');groupChoice.multiple=true;groupChoice.size=4;groupChoice.addEventListener('change',()=>tool('drawing.objects.select',{ids:[...groupChoice.selectedOptions].map(o=>o.value)}));
  const groupName=control('Group name');groupName.value='Group';const groupButton=el('button','dr-act','Group objects');groupButton.type='button';groupButton.addEventListener('click',()=>tool('drawing.object.group',{ids:[...groupChoice.selectedOptions].map(o=>o.value),name:groupName.value.trim()||'Group'}));editor.append(groupButton);
  const ungroup=el('button','dr-act','Ungroup / separate parts');ungroup.type='button';ungroup.addEventListener('click',()=>{const o=selected();if(o)tool('drawing.object.ungroup',{id:o.id});});editor.append(ungroup);
  const toolbar=el('div','dr-toolbar'),selectButton=el('button','dr-act','Select');selectButton.type='button';selectButton.setAttribute('aria-label','Select objects');selectButton.addEventListener('click',()=>setMode('select'));
  function setMode(next){mode=next;selectButton.setAttribute('aria-pressed',String(mode==='select'));addButton.setAttribute('aria-pressed',String(mode==='add'));canvas.style.cursor=mode==='add'?'crosshair':'default';caption.textContent=mode==='add'?'Click the canvas to place '+kinds.options[kinds.selectedIndex]?.textContent+'.':'Click to select. Shift-click adds to selection; drag empty space to select several.';}
  kinds.addEventListener('change',()=>setMode('add'));toolbar.append(selectButton,kinds.parentElement,addButton);
  const selectionHeading=el('h3','dr-selection-heading','Selection'),emptySelection=el('p','dr-empty-selection','Select an object to edit its properties. Drag a rectangle around objects to group them.');editor.prepend(selectionHeading);
  const advanced=el('details'),advancedBody=el('div');advanced.append(el('summary','','Knowledge library'),advancedBody);advancedBody.append(knowledgeInput.parentElement,addKnowledge,dictionary);editor.append(advanced);
  tools.remove();toolbar.append(actions);crayons.remove();
  const workspace=el('div','dr-workspace'),inspector=el('aside','dr-inspector');workspace.append(board,inspector);inspector.append(emptySelection,editor,advanced);holder.replaceChildren(toolbar,workspace,caption);setMode('select');
  function syncControls(){
    objectChoice.textContent='';const none=el('option');none.value='';none.textContent='None';objectChoice.append(none);
    for(const o of state.objects??[]){const option=el('option');option.value=o.id;option.textContent=readable(o)+' · '+o.id;objectChoice.append(option);}objectChoice.value=state.selected??'';
    groupChoice.textContent='';for(const item of state.objects??[]){const option=el('option');option.value=item.id;option.textContent=readable(item);option.selected=selectedIds().includes(item.id);groupChoice.append(option);}
    const o=selected(),multi=selectedIds().length>1;selectionHeading.textContent=multi?selectedIds().length+' objects selected':o?readable(o):'Selection';emptySelection.hidden=!!o;editor.hidden=!o;
    const visible=(input,show)=>{(input.closest('label')??input).hidden=!show;};
    for(const input of [nameInput,sizeInput,colourInput,colourChoice,partChoice])visible(input,!!o&&!multi);
    for(const input of [groupChoice,groupName,groupButton])visible(input,multi);groupChoice.parentElement.hidden=true;
    visible(ungroup,!!o&&!multi&&!!(o.shape?.members?.length||partTools?.drawingPartsOf(o).length>1));
    const partSelected=!!currentPart();for(const input of [partX,partY,partWidth,partHeight,partColour,extractPart,deletePart])visible(input,partSelected&&!multi);
    objectChoice.parentElement.hidden=true;advanced.hidden=multi;
    partChoice.textContent='';const whole=el('option');whole.value='';whole.textContent='Whole object';partChoice.append(whole);for(const part of o&&partTools?partTools.drawingPartsOf(o):[]){const option=el('option');option.value=String(part.index);option.textContent=(part.index+1)+'. '+part.role+' · '+part.primitive;partChoice.append(option);}partChoice.value=o&&state.selectedPart?.id===o.id?String(state.selectedPart.index):'';partChoice.disabled=!o;ungroup.disabled=!o;const part=currentPart();for(const input of [partX,partY,partWidth,partHeight,partColour,extractPart,deletePart])input.disabled=!part;if(part){partX.value=part.x.toFixed(1);partY.value=part.y.toFixed(1);partWidth.value=part.width.toFixed(1);partHeight.value=part.height.toFixed(1);partColour.value=part.color;}
    for(const control of [nameInput,sizeInput,colourInput,colourChoice,removeButton])control.disabled=!o;
    nameInput.value=o?.name??'';sizeInput.value=o?.size??'';const color=o?(o.color??scene?.defaultColor?.(scene.kindKey(o))):null;colourInput.value=color&&/^#[0-9a-f]{6}$/i.test(color)?color:scene?.colorHex?.(color)??'#356ac3';const tint=o?.color,tintHex=tint&&(/^#[0-9a-f]{6}$/i.test(tint)?tint:colourKnowledge?.colourHex(tint));colourChoice.value=tint?([...colourChoice.options].find(option=>option.value&&tintHex&&colourKnowledge?.colourHex(option.value)?.toLowerCase()===tintHex.toLowerCase())?.value??'__custom'):'';paintCrayons();
  }

  // ---- hint for the empty page ---------------------------------------------------------------------------------
  function showHint() {
    const empty = !(state.objects?.length) && !state.sky && !state.ground;
    hint.hidden = !empty;
    if (!empty) return;
    hint.innerHTML = '<b>Create your drawing</b><span>Choose a shape, then click the canvas.<br>Use Select to move, edit or group objects.</span>';
  }
  hintTimer = setInterval(() => { hintIndex++; if (!hint.hidden) showHint(); }, 4200);

  // ---- animation -----------------------------------------------------------------------------------------------
  // Things of the knowledge catalog (spec 17) that the page does not have yet are fetched here (the engine worker has its own copy): they appear once their parts are there.
  const known=o=>{if(scene&&o.shape)scene.ensureCustom(o);return !scene||o.kind!=='composite'||scene.isThing(o.thing);},asking=new Set();
  let facts = null;
  function ensureThings(objs) {
    for (const o of objs) {
      if (known(o) || asking.has(o.thing)) continue;
      asking.add(o.thing);
      (async () => {
        try {
          // the engine's own copy first: the reply listed what the engine drew, so the page draws those very parts (live finding 2026-11-15: a second copy got a 403 the engine's did not)
          let th = await host.thingParts?.(o.thing);
          if (th === undefined) {   // no engine worker: the tab reads the catalog at the pinned commit itself, through its mirrors (P4)
            facts ??= await Promise.all([import(host.asset('lib/knowledge/facts.mjs')), import(host.asset('lib/loaders/knowledge-source.mjs')), import(host.asset('lib/knowledge/catalog-pin.mjs'))]).then(([f, k, pin]) => f.createFacts({ source: k.createKnowledgeSource(pin.KNOWLEDGE_URLS) }));
            const t = await facts.thing(o.thing); th = t ? { name: t.name, parts: t.objects?.[0]?.parts } : null;
          }
          const parts = th?.parts;
          if (parts?.length) { scene.registerThings(new Map([[th.name, parts]])); if (!destroyed) { sync(state); schedule(); } }
        } catch { /* the picture shows without it */ }
        asking.delete(o.thing);
      })();
    }
  }
  function sync(next) {
    const now = performance.now();
    const ids = new Set();
    let batch = 0;
    ensureThings(next.objects ?? []);
    for (const o of (next.objects ?? []).filter(known)) {
      ids.add(o.id);
      const s = shown.get(o.id);
      if (!s) shown.set(o.id, { obj: o, cur: { x: o.x, y: o.y, size: o.size, rotation: o.rotation ?? 0, flipX: o.flip ? -1 : 1 }, born: now + batch++ * 140, dying: 0 });
      else { s.obj = o; s.dying = 0; }
    }
    for (const [id, s] of shown) if (!ids.has(id) && !s.dying) s.dying = now;
  }
  // The backing store follows the displayed size (x device pixel ratio, at most 2000 px wide): a 2000x1400 canvas redrawn and committed every animation frame
  // cost ~20 ms of main-thread time per frame on a phone. A hidden tab paints nothing; it paints again when it is shown (the resize observer fires).
  let shownW=0,shownH=0;   // displayed width, from the resize observer (no layout read per frame)
  function fit() {
    const w = shownW;
    if (!w) return false;
    const height=shownH||w*H/W,ratio=Math.min(2,globalThis.devicePixelRatio||1,2000/w,1400/height),pw=Math.max(1,Math.round(w*ratio)),ph=Math.max(1,Math.round(height*ratio));
    if (canvas.width === pw && canvas.height === ph) return true;
    canvas.width = pw; canvas.height = ph;
    return true;
  }
  const visible = () => canvas.isConnected && shownW > 0;
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { shownW=Math.round(es.at(-1)?.contentRect?.width??0);shownH=Math.round(es.at(-1)?.contentRect?.height??0); if (!destroyed && visible()) { fit(); schedule(); } }).observe(canvas);
  else shownW = 400;
  function frame(t) {
    raf = 0;
    if (destroyed || !renderer) return;
    if (!visible()) { last = 0; return; }   // hidden tab: no painting; the resize observer schedules a frame when it is shown
    fit();
    const dt = Math.min(0.05, (t - (last || t)) / 1000 || 0.016); last = t;
    const k = 1 - Math.exp(-dt * 11);
    let busy = false;
    const poses = new Map();
    for (const [id, s] of [...shown]) {
      const o = s.obj, c = s.cur, tgtFlip = o.flip ? -1 : 1;
      c.x += (o.x - c.x) * k; c.y += (o.y - c.y) * k; c.size += (o.size - c.size) * k;
      c.rotation += ((o.rotation ?? 0) - c.rotation) * k; c.flipX += (tgtFlip - c.flipX) * k;
      if (Math.abs(o.x - c.x) > 0.3 || Math.abs(o.y - c.y) > 0.3 || Math.abs(o.size - c.size) > 0.3 || Math.abs((o.rotation ?? 0) - c.rotation) > 0.2 || Math.abs(tgtFlip - c.flipX) > 0.01) busy = true;
      else { c.x = o.x; c.y = o.y; c.size = o.size; c.rotation = o.rotation ?? 0; c.flipX = tgtFlip; }
      let scale = 1, alpha = 1;
      if (s.dying) {
        const u = clamp01((t - s.dying) / 280);
        scale = 1 - u * 0.6; alpha = 1 - u; busy = true;
        if (u >= 1) { shown.delete(id); continue; }
      } else if (t < s.born + 560) {
        const u = clamp01((t - s.born) / 560);
        scale = t < s.born ? 0 : easeOutBack(u); alpha = t < s.born ? 0 : Math.min(1, u * 3); busy = true;
      }
      poses.set(id, { x: c.x, y: c.y, size: c.size, rotation: c.rotation, flipX: c.flipX, scale, alpha });
    }
    if(drag?.moved&&drag.kind!=='part'&&poses.has(drag.id)){const p=poses.get(drag.id);p.x=drag.x;p.y=drag.y;}
    paintFrame(poses);
    if (busy) raf = requestAnimationFrame(frame);
  }
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function paintFrame(poses) {
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);const scale=Math.min(canvas.width/W,canvas.height/H);ctx.setTransform(scale,0,0,scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);
    // dying objects are no longer in the state: draw them from their last known data
    const objs = [...shown.values()].map((s) => s.obj);
    const scn = { ...state, objects: objs };
    renderer.drawScene(ctx, rc, scn, { selected: drag?.id??state.selected??null, poses, labelOf:null });
    for(const id of selectedIds().filter(id=>id!==state.selected)){const o=state.objects.find(o=>o.id===id);if(o){const b=scene.bbox(o);ctx.save();ctx.strokeStyle='#356ac3';ctx.lineWidth=2;ctx.strokeRect(b.x0-5,b.y0-5,b.w+10,b.h+10);ctx.restore();}}
    if(marquee){ctx.save();ctx.fillStyle='rgba(53,106,195,.08)';ctx.strokeStyle='#356ac3';ctx.lineWidth=1;ctx.fillRect(marquee.x0,marquee.y0,marquee.x-marquee.x0,marquee.y-marquee.y0);ctx.strokeRect(marquee.x0,marquee.y0,marquee.x-marquee.x0,marquee.y-marquee.y0);ctx.restore();}
    const part=currentPart();if(part){const b=part.bounds,dx=drag?.kind==='part'&&drag.moved?drag.x-part.x:0,dy=drag?.kind==='part'&&drag.moved?drag.y-part.y:0;ctx.save();ctx.strokeStyle='#356ac3';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(b.x0+dx-3,b.y0+dy-3,b.x1-b.x0+6,b.y1-b.y0+6);ctx.restore();}
  }
  const labelOf = (o) => {
    const name = scene?.kindName?.(scene.kindKey(o))??o.thing??o.kind, same = (state.objects ?? []).filter((x) => (x.thing ?? x.kind) === name);
    return same.length > 1 ? `${ordinal(same.findIndex((x) => x.id === o.id) + 1)} ${name}` : `the ${name}`;
  };
  const ordinal = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] ?? `${n}th`;
  function schedule() { if (!raf && renderer && !destroyed) raf = requestAnimationFrame(frame); }

  // ---- clicks ---------------------------------------------------------------------------------------------------
  function objectAt(x, y) {
    if (!scene) return null;
    const objs = [...(state.objects ?? [])].filter(known).sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    for (const o of objs) {
      const b = scene.bbox(o), pad = 6;
      if(x>=b.x0-pad&&x<=b.x1+pad&&y>=b.y0-pad&&y<=b.y1+pad||(partTools?.drawingPartsOf(o)??[]).some(p=>x>=p.bounds.x0-pad&&x<=p.bounds.x1+pad&&y>=p.bounds.y0-pad&&y<=p.bounds.y1+pad))return o;
    }
    return null;
  }
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); const scale=Math.min(r.width/W,r.height/H);return [(e.clientX-r.left-(r.width-W*scale)/2)/scale,(e.clientY-r.top-(r.height-H*scale)/2)/scale]; };
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;canvas.focus();const [x,y]=toLogical(e);if(mode==='add'){tool('drawing.object.make',{kind:kinds.value,x,y}).then(()=>setMode('select'));return;}const o=objectAt(x,y),part=currentPart(),p=part&&part.object===o?.id&&x>=part.bounds.x0&&x<=part.bounds.x1&&y>=part.bounds.y0&&y<=part.bounds.y1?part:null;
    if(!o){marquee={pointer:e.pointerId,x0:x,y0:y,x,y,shift:e.shiftKey};drag=null;}else drag={pointer:e.pointerId,id:o.id,shift:e.shiftKey,kind:p?'part':'object',index:p?.index,x0:x,y0:y,ox:p?.x??o.x,oy:p?.y??o.y,x:p?.x??o.x,y:p?.y??o.y,moved:false};try{canvas.setPointerCapture(e.pointerId);}catch{}});
  canvas.addEventListener('pointermove',e=>{const [x,y]=toLogical(e);if(marquee?.pointer===e.pointerId){marquee.x=x;marquee.y=y;schedule();return;}if(drag&&drag.pointer===e.pointerId){if(Math.hypot(x-drag.x0,y-drag.y0)>3)drag.moved=true;drag.x=drag.ox+x-drag.x0;drag.y=drag.oy+y-drag.y0;schedule();return;}const o=objectAt(x,y);canvas.classList.toggle('is-hover',!!o);});
  canvas.addEventListener('pointerup',e=>{if(marquee?.pointer===e.pointerId){const m=marquee;marquee=null;const x0=Math.min(m.x0,m.x),x1=Math.max(m.x0,m.x),y0=Math.min(m.y0,m.y),y1=Math.max(m.y0,m.y),hit=(state.objects??[]).filter(o=>{const b=scene.bbox(o);return b.x0>=x0&&b.x1<=x1&&b.y0>=y0&&b.y1<=y1;}).map(o=>o.id);tool('drawing.objects.select',{ids:[...new Set([...(m.shift?selectedIds():[]),...hit])]});schedule();return;}
    const current=drag;drag=null;if(current&&current.pointer===e.pointerId){if(current.moved)tool(current.kind==='part'?'drawing.part.place':'drawing.object.place',current.kind==='part'?{id:current.id,index:current.index,x:current.x,y:current.y}:{ids:[current.id],x:current.x,y:current.y});else if(current.shift){const ids=selectedIds();tool('drawing.objects.select',{ids:ids.includes(current.id)?ids.filter(id=>id!==current.id):[...ids,current.id]});}else tool(current.kind==='part'?'drawing.part.select':'drawing.object.select',current.kind==='part'?{id:current.id,index:current.index}:{id:current.id});}schedule();});
  canvas.addEventListener('pointercancel',()=>{drag=null;marquee=null;schedule();});
  canvas.addEventListener('dblclick',e=>{const o=objectAt(...toLogical(e));if(o)tool('drawing.object.select',{id:o.id}).then(()=>{nameInput.focus();nameInput.select();});});
  canvas.addEventListener('keydown',e=>{const o=selected(),part=currentPart(),moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},move=moves[e.key];
    if(move&&o){e.preventDefault();const step=e.shiftKey?20:2;tool(part?'drawing.part.place':'drawing.object.place',part?{id:o.id,index:part.index,x:part.x+move[0]*step,y:part.y+move[1]*step}:{ids:[o.id],x:o.x+move[0]*step,y:o.y+move[1]*step});}
    else if(e.key==='Delete'&&o){e.preventDefault();tool(part?'drawing.part.remove':'drawing.object.remove',part?{id:o.id,index:part.index}:{ids:selectedIds()});}
    else if(e.key==='Enter'&&o){e.preventDefault();nameInput.focus();nameInput.select();}
    else if(e.key==='Escape'){e.preventDefault();tool('drawing.object.select',{id:null});}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();tool(e.shiftKey?'drawing.redo':'undo');}
  });

  // ---- library loading ------------------------------------------------------------------------------------------
  Promise.all([import(VENDOR.href), import(host.asset(SCENE_ASSET)),import(host.asset(TOOLS_ASSET)),import(host.asset(VALUES_ASSET)),import(host.asset(PARTS_ASSET))]).then(([r,s,t,v,p]) => {
    if (destroyed) return;
    rough=r.default??r.rough;scene=s;toolBindings=t.DRAWING_TOOL_BINDINGS;colourKnowledge=v;partTools=p;kinds.textContent='';for(const kind of toolBindings.find(op=>op.id==='drawing.object.make').params.kind.enum){const option=el('option');option.value=kind;option.textContent=scene.kindName(kind);kinds.append(option);}kinds.disabled=addButton.disabled=false;redoButton.disabled=!toolBindings.some(op=>op.id==='drawing.redo');const original=el('option');original.value='';original.textContent='Original colours';colourChoice.append(original);const custom=el('option');custom.value='__custom';custom.textContent='Custom colour';custom.disabled=true;colourChoice.append(custom);for(const name of v.colourNames().sort()){const option=el('option');option.value=name;option.textContent=name;colourChoice.append(option);}syncControls();
    renderer = createRenderer(rough, scene);
    ctx = canvas.getContext('2d');
    rc = rough.canvas(canvas);

    sync(state); schedule();
  }).catch((e) => {
    loadError = e;
    console.warn('drawing tab: libraries failed to load', e);
    caption.textContent = 'The drawing libraries could not be loaded. The commands still work.';
  });

  return api = {
    update(next) {
      state = { ...EMPTY, ...(next && typeof next === 'object' ? next : {}) };
      caption.textContent = loadError ? caption.textContent : captionOf(state);
      canvas.setAttribute('aria-label', `Drawing: ${captionOf(state)}`);
      showHint();syncControls();
      if (renderer) { sync(state); schedule(); }
    },
    /** Download the picture as PNG (2x) or SVG; returns { ok, detail }. */
    async download({ format = 'png', filename = 'my-drawing' } = {}) {
      if (!renderer) return { ok: false, detail: 'the drawing is not ready yet' };
      const name = `${String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'my-drawing'}.${format === 'svg' ? 'svg' : 'png'}`;
      let blob;
      if (format === 'svg') blob = new Blob([renderer.toSVG({ ...state, objects: (state.objects ?? []).filter(known) })], { type: 'image/svg+xml' });
      else {
        const off = document.createElement('canvas');
        off.width = W * 2; off.height = H * 2;
        const octx = off.getContext('2d');
        octx.setTransform(2, 0, 0, 2, 0, 0);
        renderer.drawScene(octx, rough.canvas(off), { ...state, objects: (state.objects ?? []).filter(known) }, { selected: null });
        blob = await new Promise((res) => off.toBlob(res, 'image/png'));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.hidden = true;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, detail: name };
    },
    destroy() { destroyed = true; clearInterval(hintTimer); if (raf) cancelAnimationFrame(raf); },
  };
}

export default {
  id: 'draw',
  label: 'Drawing',
  world: 'art.draw',
  order: 80,
  make,
  effects: {
    'draw.download': async (args, { ui }) => (ui?.download ? ui.download(args ?? {}) : { ok: false, detail: 'the Drawing tab is not open' }),
  },
};
