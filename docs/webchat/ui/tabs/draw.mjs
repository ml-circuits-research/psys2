import {mountInspectorSplitter} from '../pane-splitter.mjs';
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
.dr-root{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:380px;gap:6px;color:#263646;font:13px system-ui;container-type:inline-size}
.dr-add-chooser{position:absolute;max-width:calc(100% - 16px);z-index:20;width:280px;max-height:65%;overflow:auto;padding:12px;box-sizing:border-box;background:#fff;border:1px solid #bbc7d5;border-radius:7px;box-shadow:0 7px 24px #24344733;display:grid;gap:8px}.dr-add-chooser label{display:grid;gap:5px}.dr-shape-choices{display:flex;gap:5px;flex-wrap:wrap}.dr-toolbar,.dr-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.dr-toolbar{padding:4px 0}.dr-toolbar label{display:flex;align-items:center;gap:6px}
.dr-workspace{display:grid;grid-template-columns:minmax(0,1fr) 264px;gap:8px;flex:1;min-height:0}.dr-board{position:relative;width:100%;height:100%;min-width:0;border:1px solid #d5dae0;background:#f7f8fa;border-radius:6px;box-sizing:border-box;overflow:hidden}.dr-paper{position:relative;width:100%;height:100%;min-height:320px;touch-action:none}.dr-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}.dr-canvas:focus-visible{box-shadow:inset 0 0 0 2px #356ac3}.dr-inspector{overflow:auto;min-width:0;background:#fff;border:1px solid #d5dae0;border-radius:6px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}.dr-inspector h3{font-size:13px;margin:0 0 8px}.dr-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-editor label{display:grid;gap:4px;min-width:0;font-size:12px;color:#536171}.dr-editor label:has(select[multiple]),.dr-editor label:has(input[type=search]),.dr-editor label:has(input[aria-label="Label"]){grid-column:1/-1}
.dr-root input,.dr-root select{font:13px system-ui;border:1px solid #d5dae0;background:#fff;color:#263646;border-radius:5px;padding:7px;min-width:0;max-width:100%;box-sizing:border-box}.dr-editor input,.dr-editor select{width:100%}.dr-act{font:600 12px system-ui;border:1px solid #d5dae0;border-radius:5px;background:#fff;color:#263646;min-height:32px;padding:6px 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}.dr-act:hover{background:#f0f4fa}.dr-act[aria-pressed=true]{background:#e9f0fd;border-color:#356ac3;color:#2359a9}.dr-act:disabled{opacity:.45;cursor:default}.dr-act svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.dr-grain,.dr-vignette,.dr-crayons{display:none}.dr-hint{position:absolute;inset:0;display:grid;place-content:center;pointer-events:none;text-align:center;padding:30px;color:#788491;font:14px system-ui}.dr-hint b{font-size:19px;font-weight:500;display:block;margin-bottom:8px}.dr-pencil{display:none}.dr-tools{display:flex;flex-direction:column;gap:8px}.dr-caption{margin:0;font-size:12px;color:#66717e;min-height:18px}.dr-root [hidden]{display:none!important}.dr-empty-selection{color:#788491;line-height:1.6}.dr-selection-heading{grid-column:1/-1;margin:0;font-size:13px}.dr-inspector details{grid-column:1/-1}.dr-inspector summary{cursor:pointer;color:#536171;font-size:12px}.dr-inspector details>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:10px}
@media(max-width:700px){.dr-root{height:auto;min-height:0}.dr-workspace{display:flex;flex-direction:column;flex:none}.dr-board{height:360px;min-height:280px}.dr-paper{min-height:280px}.dr-inspector{overflow:visible}.dr-act{min-height:44px}.dr-root input,.dr-root select{font-size:16px}.dr-add-chooser{max-height:min(65dvh,420px)}}
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
  canvas.setAttribute('role', 'img');canvas.tabIndex=0;canvas.title='Click to select; Ctrl or Command-click selects several. Drag handles to resize. Double-click empty space to add. Delete removes.';
  const grain = el('div', 'dr-grain'), vignette = el('div', 'dr-vignette'), hint = el('div', 'dr-hint');
  paper.append(canvas, grain, vignette, hint);
  board.append(paper);
  const tools = el('div', 'dr-tools'), crayons = el('div', 'dr-crayons'), actions = el('div', 'dr-actions'), caption = el('p', 'dr-caption');
  caption.setAttribute('aria-live', 'polite');
  holder.append(board, tools, caption);
  tools.append(crayons, actions);

  let scene = null, renderer = null, rough = null, rc = null, ctx = null;
  let drag=null,toolBindings=[],colourKnowledge=null,partTools=null,marquee=null,identifyTimer=0,chooserPoint=null,multiSelect=false;const activePointers=new Set();let multiTouch=false;
  let state = EMPTY, loadError = null, destroyed = false, raf = 0, hintTimer = 0, hintIndex = 0, last = 0, hover = null;
  const shown = new Map();   // id -> { obj, cur: pose, born, dying }

  // Native operation arguments are shared by pointer/keyboard gestures and future voice commands.
  const tool=async(operation,args={})=>{try{if(typeof host.tool!=='function')throw Error('The drawing tools are not available.');const result=await host.tool(operation,args);if(result?.text)caption.textContent=result.text;return result;}catch(e){caption.textContent=String(e.message??e);return null;}};
  const selectedIds=()=>(state.selectedIds??(state.selected?[state.selected]:[])).filter(id=>!!findObject(id));
  const findObject=id=>partTools?.findDrawingObject(state,id)??state.objects?.find(o=>o.id===id)??null;
  const selected=()=>findObject(state.selected);
  const readable=o=>o.name||scene?.kindName?.(scene.kindKey(o))||o.thing||o.kind;
  const editor=el('div','dr-editor');holder.insertBefore(editor,board);
  const control=(label,type='text')=>{const box=el('label');box.append(document.createTextNode(label));const input=el(type==='select'?'select':'input');if(type!=='select')input.type=type;input.setAttribute('aria-label',label);box.append(input);editor.append(box);return input;};
  const idInput=control('ObjectID');idInput.readOnly=true;
  const nameInput=control('Label'),sizeInput=control('Size','number'),widthInput=control('Width','number'),heightInput=control('Height','number'),colourInput=control('Colour','color'),colourChoice=control('Named colour','select');
  sizeInput.min=widthInput.min=heightInput.min='.01';sizeInput.step=widthInput.step=heightInput.step='1';
  nameInput.addEventListener('change',()=>{const o=selected();if(o)tool('drawing.object.change',{ids:[o.id],label:nameInput.value});});
  nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nameInput.blur();canvas.focus();}});
  for(const [input,key]of [[sizeInput,'size'],[widthInput,'width'],[heightInput,'height']])input.addEventListener('change',()=>{const ids=selectedIds(),value=Number(input.value);if(!ids.length||!Number.isFinite(value)||value<=0)return;if(ids.length>1){const b=selectionBounds();if(b)tool('drawing.objects.transform',{ids,x:b.x0,y:b.y0,width:key==='width'?value:b.w,height:key==='height'?value:b.h});}else tool('drawing.object.change',{ids,[key]:value});});
  colourInput.addEventListener('change',()=>{const ids=selectedIds();if(ids.length)tool('drawing.object.change',{ids,color:colourInput.value});});
  colourChoice.addEventListener('change',()=>{const ids=selectedIds(),color=colourChoice.value?colourKnowledge?.colourHex(colourChoice.value):null;if(ids.length&&(color||colourChoice.value===''))tool('drawing.object.change',{ids,color});});
  const act=(label,icon,callback)=>{const b=el('button','dr-act',`${ICON[icon]??''}<span>${label}</span>`);b.type='button';b.addEventListener('click',callback);actions.append(b);return b;};
  const removeButton=act('Delete selection','',()=>{const ids=selectedIds();if(ids.length)tool('drawing.object.remove',{ids});});editor.append(removeButton);
  act('Undo','undo',()=>tool('undo'));
  const redoButton=act('Redo','redo',()=>tool('drawing.redo'));redoButton.disabled=true;
  act('Clear drawing','fresh',()=>tool('drawing.page.clear'));
  act('Save PNG','save',()=>api.download({format:'png'}));act('Save SVG','save',()=>api.download({format:'svg'}));
  act('Identify IDs','',()=>tool('drawing.ids.show',{mode:'temporary'}));
  const showIdsLabel=el('label'),showIdsInput=el('input');showIdsInput.type='checkbox';showIdsInput.setAttribute('aria-label','Show IDs');showIdsLabel.append(showIdsInput,document.createTextNode('Show IDs'));actions.append(showIdsLabel);
  showIdsInput.addEventListener('change',()=>tool('drawing.ids.show',{mode:showIdsInput.checked?'always':'off'}));
  const chooser=el('div','dr-add-chooser');chooser.hidden=true;chooser.setAttribute('role','dialog');chooser.setAttribute('aria-label','Add drawing object');
  const shapeChoices=el('div','dr-shape-choices'),knowledgeInput=control('Find a word in knowledge','search'),dictionary=el('datalist');dictionary.id='drawing-words-'+crypto.randomUUID();knowledgeInput.setAttribute('list',dictionary.id);let dictionaryWords=null,dictionaryPromise=null;
  const loadDictionary=()=>dictionaryPromise??=Promise.all([import(host.asset('lib/loaders/knowledge-source.mjs')),import(host.asset('lib/knowledge/catalog-pin.mjs'))]).then(async([k,pin])=>{const source=k.createKnowledgeSource(pin.KNOWLEDGE_URLS),raw=await source.text('vocab.json');if(!raw)throw Error('Knowledge dictionary is unavailable.');const vocab=JSON.parse(raw);dictionaryWords=Object.entries(vocab).filter(([,shards])=>Array.isArray(shards)&&shards.some(id=>/^(k.objects|k.people|k.scenes)\//.test(id))).map(([word])=>word).sort();return dictionaryWords;}).catch(e=>{dictionaryPromise=null;caption.textContent=e.message;return [];});
  const suggestWords=async()=>{await loadDictionary();dictionary.textContent='';const query=knowledgeInput.value.trim().toLowerCase();for(const word of (dictionaryWords??[]).filter(w=>w.startsWith(query)).slice(0,80)){const option=el('option');option.value=word;dictionary.append(option);}};
  knowledgeInput.addEventListener('focus',suggestWords);knowledgeInput.addEventListener('input',suggestWords);
  const closeChooser=()=>{chooser.hidden=true;addButton.setAttribute('aria-expanded','false');};
  const createObject=async(operation,args)=>{await tool(operation,{...args,...chooserPoint});closeChooser();canvas.focus();};
  const addKnowledge=el('button','dr-act','Add from knowledge');addKnowledge.type='button';addKnowledge.addEventListener('click',()=>{const name=knowledgeInput.value.trim();if(name)createObject('drawing.catalog.make',{name});});knowledgeInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addKnowledge.click();}});
  const cancelAdd=el('button','dr-act','Cancel');cancelAdd.type='button';cancelAdd.addEventListener('click',closeChooser);chooser.append(shapeChoices,knowledgeInput.parentElement,addKnowledge,dictionary,cancelAdd);
  const toolbar=el('div','dr-toolbar'),addButton=el('button','dr-act','Add');addButton.type='button';addButton.disabled=true;addButton.setAttribute('aria-haspopup','dialog');addButton.setAttribute('aria-expanded','false');
  function openChooser(point=null,event=null){chooserPoint=point??{x:W/2,y:H/2};chooser.hidden=false;addButton.setAttribute('aria-expanded','true');if(event){const rect=holder.getBoundingClientRect();chooser.style.left=Math.max(4,Math.min(rect.width-290,event.clientX-rect.left))+'px';chooser.style.top=Math.max(40,Math.min(rect.height-250,event.clientY-rect.top))+'px';}else{chooser.style.left='4px';chooser.style.top='40px';}shapeChoices.querySelector('button')?.focus();}
  addButton.addEventListener('click',()=>chooser.hidden?openChooser():closeChooser());chooser.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeChooser();canvas.focus();}});const multiButton=el('button','dr-act','Select multiple');multiButton.type='button';multiButton.setAttribute('aria-pressed','false');multiButton.addEventListener('click',()=>{multiSelect=!multiSelect;multiButton.setAttribute('aria-pressed',String(multiSelect));caption.textContent=multiSelect?'Tap objects to add or remove them from the selection.':'Tap an object to select or move it.';});toolbar.append(addButton,multiButton,actions);
  const memberChoice=control('Group member','select');memberChoice.addEventListener('change',()=>{if(memberChoice.value)tool('drawing.object.select',{id:memberChoice.value});});
  const partChoice=control('Object part','select'),partX=control('Part X','number'),partY=control('Part Y','number'),partWidth=control('Part width','number'),partHeight=control('Part height','number'),partColour=control('Part colour','color');
  const currentPart=()=>{const o=selected(),index=o&&state.selectedPart?.id===o.id?state.selectedPart.index:null;return o&&index!==null?partTools?.drawingPartsOf(o)[index]??null:null;};
  partChoice.addEventListener('change',()=>{const o=selected();if(o)tool(partChoice.value===''?'drawing.object.select':'drawing.part.select',partChoice.value===''?{id:o.id}:{id:o.id,index:Number(partChoice.value)});});
  const movePart=()=>{const p=currentPart(),x=Number(partX.value),y=Number(partY.value);if(p&&Number.isFinite(x)&&Number.isFinite(y))tool('drawing.part.place',{id:p.object,index:p.index,x,y});};partX.addEventListener('change',movePart);partY.addEventListener('change',movePart);
  for(const [input,key]of [[partWidth,'width'],[partHeight,'height']]){input.min='.01';input.step='1';input.addEventListener('change',()=>{const p=currentPart(),value=Number(input.value);if(p&&Number.isFinite(value)&&value>0)tool('drawing.part.change',{id:p.object,index:p.index,[key]:value});});}
  partColour.addEventListener('change',()=>{const p=currentPart();if(p)tool('drawing.part.change',{id:p.object,index:p.index,color:partColour.value});});
  const partAction=(label,operation)=>{const b=el('button','dr-act',label);b.type='button';b.addEventListener('click',()=>{const p=currentPart();if(p)tool(operation,{id:p.object,index:p.index});});editor.append(b);return b;};
  const extractPart=partAction('Extract part','drawing.part.extract'),deletePart=partAction('Delete part','drawing.part.remove');
  const groupName=control('Group label');groupName.value='';const groupButton=el('button','dr-act','Group objects');groupButton.type='button';groupButton.addEventListener('click',()=>tool('drawing.object.group',{ids:selectedIds(),name:groupName.value.trim()||'Group',label:groupName.value.trim()}));editor.append(groupButton);
  const ungroup=el('button','dr-act','Ungroup');ungroup.type='button';ungroup.addEventListener('click',()=>{const o=selected();if(o)tool('drawing.object.ungroup',{id:o.id});});editor.append(ungroup);
  const selectionHeading=el('h3','dr-selection-heading','Selection'),emptySelection=el('p','dr-empty-selection','Click an object to edit it. Ctrl or Command-click adds to selection. Drag empty space to select several.');selectionHeading.setAttribute('data-selected-native-id','');editor.prepend(selectionHeading);
  tools.remove();crayons.remove();const workspace=el('div','dr-workspace'),inspector=el('aside','dr-inspector');workspace.append(board,inspector);inspector.append(emptySelection,editor);holder.replaceChildren(toolbar,chooser,workspace,caption);const closeInspectorSplitter=mountInspectorSplitter(workspace,inspector,{id:'draw',width:264,persist:host.persistent!==false});
  function syncControls(){
    showIdsInput.checked=state.idDisplay?.mode==='always';clearTimeout(identifyTimer);if(state.idDisplay?.mode==='temporary'&&state.idDisplay.expiresAt>Date.now())identifyTimer=setTimeout(schedule,Math.min(60001,state.idDisplay.expiresAt-Date.now()+1));
    const o=selected(),ids=selectedIds(),multi=ids.length>1,part=currentPart();inspector.dataset.selectedNativeIds=JSON.stringify(part?[part.id]:ids);
    selectionHeading.textContent=multi?`${ids.length} objects`:o?'Object '+o.id:'Selection';selectionHeading.dataset.selectedNativeId=o?.id??'';emptySelection.hidden=!!o;editor.hidden=!o;
    const visible=(input,show)=>{(input.closest('label')??input).hidden=!show;};
    const members=o?.shape?.nativeMembers?(partTools?.restoreMembers(o)??[]):[],parent=!state.objects.some(root=>root.id===o?.id)&&o?(partTools.drawingObjectsOf(state).find(group=>group.shape?.nativeMembers&&partTools.restoreMembers(group).some(child=>child.id===o.id))):null;visible(memberChoice,!multi&&!!(members.length||parent));memberChoice.textContent='';const memberPlaceholder=el('option');memberPlaceholder.value='';memberPlaceholder.textContent=parent?'Member '+o.id:'Choose a member';memberChoice.append(memberPlaceholder);if(parent){const back=el('option');back.value=parent.id;back.textContent='Group '+parent.id;memberChoice.append(back);}for(const member of members){const option=el('option');option.value=member.id;option.textContent=member.id+' · '+(member.label??member.name??member.semanticKind??member.kind);memberChoice.append(option);}
    for(const input of [idInput,nameInput,sizeInput,partChoice])visible(input,!!o&&!multi);
    for(const input of [widthInput,heightInput,colourInput,colourChoice,removeButton]){visible(input,!!o);input.disabled=!o;}
    for(const input of [groupName,groupButton])visible(input,multi);
    visible(ungroup,!!o&&!multi&&!!(o.shape?.members?.length||partTools?.drawingPartsOf(o).length>1));
    for(const input of [partX,partY,partWidth,partHeight,partColour,extractPart,deletePart]){visible(input,!!part&&!multi);input.disabled=!part;}
    partChoice.textContent='';const whole=el('option');whole.value='';whole.textContent='Whole object';partChoice.append(whole);for(const p of o&&partTools?partTools.drawingPartsOf(o):[]){const option=el('option');option.value=String(p.index);option.textContent=`${p.index+1}. ${p.role} · ${p.primitive}`;partChoice.append(option);}partChoice.value=part?String(part.index):'';
    if(part){partX.value=part.x.toFixed(1);partY.value=part.y.toFixed(1);partWidth.value=part.width.toFixed(1);partHeight.value=part.height.toFixed(1);partColour.value=part.color;}
    idInput.value=o?.id??'';nameInput.value=o?.label??o?.name??'';sizeInput.value=o?.size??'';
    const b=selectionBounds();widthInput.value=b?Number(b.w.toFixed(2)):'';heightInput.value=b?Number(b.h.toFixed(2)):'';
    const color=o?(o.color??scene?.defaultColor?.(scene.kindKey(o))):null;colourInput.value=color&&/^#[0-9a-f]{6}$/i.test(color)?color:scene?.colorHex?.(color)??'#356ac3';const tint=o?.color,tintHex=tint&&(/^#[0-9a-f]{6}$/i.test(tint)?tint:colourKnowledge?.colourHex(tint));colourChoice.value=tint?([...colourChoice.options].find(option=>option.value&&tintHex&&colourKnowledge?.colourHex(option.value)?.toLowerCase()===tintHex.toLowerCase())?.value??'__custom'):'';
  }

  // ---- hint for the empty page ---------------------------------------------------------------------------------
  function showHint() {
    const empty = !(state.objects?.length) && !state.sky && !state.ground;
    hint.hidden = !empty;
    if (!empty) return;
    hint.innerHTML='<b>Create your drawing</b><span>Use Add or double-click empty space.<br>Click to select, drag to move or resize.</span>';
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
    paintFrame(poses);
    if (busy) raf = requestAnimationFrame(frame);
  }
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function paintFrame(poses) {
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);const scale=Math.min(canvas.width/W,canvas.height/H);ctx.setTransform(scale,0,0,scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);
    // dying objects are no longer in the state: draw them from their last known data
    const preview=previewObjects(),objs=[...shown.values()].map(s=>preview.get(s.obj.id)??s.obj),scn={...state,objects:objs};
    for(const id of preview.keys())poses.delete(id);
    renderer.drawScene(ctx,rc,scn,{selected:null,poses,labelOf:null});
    const b=selectionBounds(objs);if(b&&!currentPart()){ctx.save();ctx.strokeStyle='#356ac3';ctx.lineWidth=2;ctx.strokeRect(b.x0,b.y0,b.w,b.h);for(const h of handlesOf(b)){ctx.fillStyle='#fff';ctx.fillRect(h.x-5,h.y-5,10,10);ctx.strokeRect(h.x-5,h.y-5,10,10);}ctx.restore();}
    if(state.idDisplay?.mode==='always'||state.idDisplay?.mode==='temporary'&&Date.now()<state.idDisplay.expiresAt){ctx.save();ctx.font='600 16px system-ui';ctx.textBaseline='top';for(const o of partTools.drawingObjectsOf({objects:objs})){const box=scene.bbox(o),text=o.id,w=ctx.measureText(text).width+10,x=Math.max(2,box.x0),y=Math.max(2,box.y0-24);ctx.fillStyle='#183b63';ctx.fillRect(x,y,w,22);ctx.fillStyle='#fff';ctx.fillText(text,x+5,y+2);}ctx.restore();}
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
    const inner=selected();if(inner&&!state.objects.some(o=>o.id===inner.id)){const b=scene.bbox(inner);if(x>=b.x0-6&&x<=b.x1+6&&y>=b.y0-6&&y<=b.y1+6)return inner;}
    const objs = [...(state.objects ?? [])].filter(known).sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    for (const o of objs) {
      const b = scene.bbox(o), pad = 6;
      if(x>=b.x0-pad&&x<=b.x1+pad&&y>=b.y0-pad&&y<=b.y1+pad||(partTools?.drawingPartsOf(o)??[]).some(p=>x>=p.bounds.x0-pad&&x<=p.bounds.x1+pad&&y>=p.bounds.y0-pad&&y<=p.bounds.y1+pad))return o;
    }
    return null;
  }
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); const scale=Math.min(r.width/W,r.height/H);return [(e.clientX-r.left-(r.width-W*scale)/2)/scale,(e.clientY-r.top-(r.height-H*scale)/2)/scale]; };
  const canvasTool=(operation,args)=>tool(operation,args).finally(()=>{if(document.activeElement===document.body)canvas.focus({preventScroll:true});});
  function selectionBounds(objects=state.objects,ids=selectedIds()){
    if(!scene||!ids.length)return null;const all=partTools?.drawingObjectsOf({objects})??objects,boxes=all.filter(o=>ids.includes(o.id)).map(o=>scene.bbox(o));if(!boxes.length)return null;const x0=Math.min(...boxes.map(b=>b.x0)),x1=Math.max(...boxes.map(b=>b.x1)),y0=Math.min(...boxes.map(b=>b.y0)),y1=Math.max(...boxes.map(b=>b.y1));return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
  }
  const handlesOf=b=>[{key:'nw',x:b.x0,y:b.y0},{key:'n',x:(b.x0+b.x1)/2,y:b.y0},{key:'ne',x:b.x1,y:b.y0},{key:'e',x:b.x1,y:(b.y0+b.y1)/2},{key:'se',x:b.x1,y:b.y1},{key:'s',x:(b.x0+b.x1)/2,y:b.y1},{key:'sw',x:b.x0,y:b.y1},{key:'w',x:b.x0,y:(b.y0+b.y1)/2}];
  function transformArgs(d){const b=d.bounds;if(d.kind==='resize'){let x0=b.x0,y0=b.y0,x1=b.x1,y1=b.y1;if(d.handle.includes('w'))x0=Math.min(x1-1,d.x);if(d.handle.includes('e'))x1=Math.max(x0+1,d.x);if(d.handle.includes('n'))y0=Math.min(y1-1,d.y);if(d.handle.includes('s'))y1=Math.max(y0+1,d.y);return {ids:d.ids,x:x0,y:y0,width:x1-x0,height:y1-y0};}return {ids:d.ids,x:b.x0+d.x-d.ox,y:b.y0+d.y-d.oy,width:b.w,height:b.h};}
  function previewObjects(){const preview=new Map();if(!drag?.moved||drag.kind==='part'||!drag.bounds)return preview;const a=transformArgs(drag),b=drag.bounds,sx=a.width/b.w,sy=a.height/b.h,draft={objects:structuredClone(state.objects)};for(const id of drag.ids){const o=partTools.findDrawingObject(draft,id);if(!o)continue;const m=scene.objectMatrix(o),changed={...o,x:a.x+(o.x-b.x0)*sx,y:a.y+(o.y-b.y0)*sy,geometryMatrix:[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy]};partTools.replaceDrawingObject(draft,id,[changed]);}for(const o of draft.objects)preview.set(o.id,o);return preview;}
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;activePointers.add(e.pointerId);if(activePointers.size>1){multiTouch=true;drag=null;marquee=null;schedule();return;}e.preventDefault();canvas.focus({preventScroll:true});closeChooser();const [x,y]=toLogical(e),ids=selectedIds(),b=selectionBounds(),handle=b&&!currentPart()?handlesOf(b).find(h=>Math.hypot(h.x-x,h.y-y)<10):null,add=multiSelect||e.ctrlKey||e.metaKey||e.shiftKey;
    if(handle){drag={pointer:e.pointerId,kind:'resize',handle:handle.key,ids,bounds:b,x0:x,y0:y,x,y,moved:false};}
    else{const o=objectAt(x,y),part=currentPart(),p=part&&part.object===o?.id&&x>=part.bounds.x0&&x<=part.bounds.x1&&y>=part.bounds.y0&&y<=part.bounds.y1?part:null;
      if(!o){marquee={pointer:e.pointerId,x0:x,y0:y,x,y,shift:add};drag=null;}
      else{const targets=ids.includes(o.id)?ids:[o.id];drag={pointer:e.pointerId,id:o.id,shift:add,kind:p?'part':'object',ids:targets,bounds:selectionBounds(state.objects,targets),index:p?.index,x0:x,y0:y,ox:p?.x??o.x,oy:p?.y??o.y,x:p?.x??o.x,y:p?.y??o.y,moved:false};}}
    try{canvas.setPointerCapture(e.pointerId);}catch{}
  });
  canvas.addEventListener('pointermove',e=>{if(multiTouch)return;const [x,y]=toLogical(e);if(marquee?.pointer===e.pointerId){marquee.x=x;marquee.y=y;schedule();return;}if(drag&&drag.pointer===e.pointerId){if(Math.hypot(x-drag.x0,y-drag.y0)>(e.pointerType==='touch'?8/Math.min(canvas.clientWidth/W,canvas.clientHeight/H):3))drag.moved=true;if(drag.kind==='resize'){drag.x=x;drag.y=y;}else{drag.x=drag.ox+x-drag.x0;drag.y=drag.oy+y-drag.y0;}schedule();return;}const b=selectionBounds(),h=b&&!currentPart()?handlesOf(b).find(h=>Math.hypot(h.x-x,h.y-y)<10):null;canvas.style.cursor=h?`${h.key}-resize`:objectAt(x,y)?'move':'default';});
  canvas.addEventListener('pointerup',e=>{activePointers.delete(e.pointerId);if(multiTouch){if(!activePointers.size)multiTouch=false;drag=null;marquee=null;schedule();return;}if(marquee?.pointer===e.pointerId){const m=marquee;marquee=null;const x0=Math.min(m.x0,m.x),x1=Math.max(m.x0,m.x),y0=Math.min(m.y0,m.y),y1=Math.max(m.y0,m.y),hit=(state.objects??[]).filter(o=>{const b=scene.bbox(o);return b.x0>=x0&&b.x1<=x1&&b.y0>=y0&&b.y1<=y1;}).map(o=>o.id);canvasTool('drawing.objects.select',{ids:[...new Set([...(m.shift?selectedIds():[]),...hit])]});schedule();return;}
    const current=drag;drag=null;if(current&&current.pointer===e.pointerId){if(current.moved)canvasTool(current.kind==='part'?'drawing.part.place':'drawing.objects.transform',current.kind==='part'?{id:current.id,index:current.index,x:current.x,y:current.y}:transformArgs(current));else if(current.kind!=='resize'){if(current.shift){const ids=selectedIds();canvasTool('drawing.objects.select',{ids:ids.includes(current.id)?ids.filter(id=>id!==current.id):[...ids,current.id]});}else canvasTool(current.kind==='part'?'drawing.part.select':'drawing.object.select',current.kind==='part'?{id:current.id,index:current.index}:{id:current.id});}}schedule();
  });
  canvas.addEventListener('pointercancel',event=>{activePointers.delete(event.pointerId);if(!activePointers.size)multiTouch=false;drag=null;marquee=null;schedule();});
  canvas.addEventListener('dblclick',e=>{const [x,y]=toLogical(e),o=objectAt(x,y);if(o)canvasTool('drawing.object.select',{id:o.id}).then(()=>{nameInput.focus();nameInput.select();});else openChooser({x,y},e);});
  canvas.addEventListener('keydown',e=>{const o=selected(),part=currentPart(),moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},move=moves[e.key];
    if(move&&o){e.preventDefault();const step=e.shiftKey?20:2,b=selectionBounds();canvasTool(part?'drawing.part.place':'drawing.objects.transform',part?{id:o.id,index:part.index,x:part.x+move[0]*step,y:part.y+move[1]*step}:{ids:selectedIds(),x:b.x0+move[0]*step,y:b.y0+move[1]*step,width:b.w,height:b.h});}
    else if(e.key==='Delete'&&o){e.preventDefault();canvasTool(part?'drawing.part.remove':'drawing.object.remove',part?{id:o.id,index:part.index}:{ids:selectedIds()});}
    else if(e.key==='Enter'&&o){e.preventDefault();nameInput.focus();nameInput.select();}
    else if(e.key==='Escape'){e.preventDefault();closeChooser();canvasTool('drawing.object.select',{id:null});}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();canvasTool(e.shiftKey?'drawing.redo':'undo');}
  });

  // ---- library loading ------------------------------------------------------------------------------------------
  Promise.all([import(VENDOR.href), import(host.asset(SCENE_ASSET)),import(host.asset(TOOLS_ASSET)),import(host.asset(VALUES_ASSET)),import(host.asset(PARTS_ASSET))]).then(([r,s,t,v,p]) => {
    if (destroyed) return;
    rough=r.default??r.rough;scene=s;toolBindings=t.DRAWING_TOOL_BINDINGS;colourKnowledge=v;partTools=p;for(const kind of toolBindings.find(op=>op.id==='drawing.object.make').params.kind.enum){const button=el('button','dr-act');button.type='button';button.textContent=scene.kindName(kind);button.addEventListener('click',()=>createObject('drawing.object.make',{kind}));shapeChoices.append(button);}addButton.disabled=false;redoButton.disabled=!toolBindings.some(op=>op.id==='drawing.redo');const original=el('option');original.value='';original.textContent='Original colours';colourChoice.append(original);const custom=el('option');custom.value='__custom';custom.textContent='Custom colour';custom.disabled=true;colourChoice.append(custom);for(const name of v.colourNames().sort()){const option=el('option');option.value=name;option.textContent=name;colourChoice.append(option);}syncControls();
    renderer = createRenderer(rough, scene, partTools);
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
    destroy() { destroyed = true;clearTimeout(identifyTimer);closeInspectorSplitter(); clearInterval(hintTimer); if (raf) cancelAnimationFrame(raf); },
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
