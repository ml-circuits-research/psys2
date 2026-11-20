// Architecture navigation is a read-only view of real runtime records.
// Background groups organize layout only; every graph node is an actual runtime record.
import {h} from './util.mjs';

const NS='http://www.w3.org/2000/svg';
// Role names of the actual record kinds (detail subtitles and accessible names).
const KINDS={
 world:'Tab SOP files (declarations)',schema:'Schema / declarations',knowledge:'Knowledge',instance:'World instance',interpreter:'Interpreter',
 component:'Implementation component',runtime:'Runtime record',structure:'Runtime structure',storage:'Storage adapter',
 adapter:'Adapter',method:'Method',episode:'Episode',project:'Project'
};
// Map encoding: COLOUR is the primary cue. Everything that is JavaScript is ONE kind in the Native Layer (one colour; the only
// marker is badge D for domain logic in JavaScript); the trained reader has its own colour there. SOP Lang Worlds are told
// apart rigorously: rules and policies (greens), instances (blues), knowledge (teals), schemas (greys), each kind with its own
// shade. The shape repeats the family as a secondary cue. Hollow = not used in this session.
const FAMILIES={native:'Native Layer',rules:'Rules and policies (SOP)',state:'Instances',knowledge:'Knowledge',schema:'Schemas'};
const ENTRIES={
 native:{family:'native',label:'JavaScript',color:'#f08a3c',shape:'hexagon',meaning:'Native code and its data: tool hosts, interpreters, the turn coordinator, loaders, UI helpers, model runtime hosts and session data still kept as JavaScript. Badge D: it makes domain decisions that belong in SOP rules or knowledge.'},
 model:{family:'native',label:'Trained reader (SOP-BERT and its binding bundle)',color:'#b48cff',shape:'hexagon',meaning:'The trained model that reads your words into proposed requests, with the data that binds its words to kinds, properties and tool parameters. Not an SOP World.'},
 'tab-rules':{family:'rules',label:'Tab rules (SOP files a tab ships)',color:'#9bdc4a',shape:'diamond',meaning:'The SOP files one tab ships: its area declaration and act rules, its native tool interface and its instance schema.'},
 policy:{family:'rules',label:'Operational policy World',color:'#2fa84f',shape:'diamond',meaning:'SOP rules that decide how requests are read, admitted, routed, created, placed and undone.'},
 registry:{family:'rules',label:'Area registry World',color:'#c8e86a',shape:'diamond',meaning:'The SOP World that links each tab to its domain, schema and instance; the application reads it to resolve the active area.'},
 instance:{family:'state',label:'Instance World (live state)',color:'#4a9dff',shape:'circle',meaning:'The current facts of one tab or of the session, held as an SOP World.'},
 evidence:{family:'state',label:'Execution evidence (SOP)',color:'#9fcbff',shape:'circle',meaning:'SOP facts retained from one executed operation.'},
 'knowledge-world':{family:'knowledge',label:'Knowledge World (catalog)',color:'#19b5a5',shape:'diamond',meaning:'Reusable knowledge published in the shared catalog, read by reference.'},
 'knowledge-file':{family:'knowledge',label:'Knowledge source or catalog file',color:'#7fe3d8',shape:'diamond',meaning:'An exact file of the catalog: an SOP source or the catalog index (JSON).'},
 schema:{family:'schema',label:'Schema',color:'#a3afbf',shape:'square',meaning:'Types, slots and constraints that validate Worlds.'},
 'tool-interface':{family:'schema',label:'Tool interface declaration',color:'#d5dbe3',shape:'square',meaning:'The operations and parameters of a tab\'s tools, used to validate commands. Not a complete state schema.'},
};
const ENTRY_ORDER=Object.keys(ENTRIES),FAMILY_ORDER=Object.keys(FAMILIES);
const entryOf=node=>{
 if(Object.hasOwn(ENTRIES,node.entry))return node.entry;
 if(node.representation==='model')return 'model';
 if(node.kind==='schema')return node.details?.role==='native-tool-interface'?'tool-interface':'schema';
 // An operational SOP World of instance kind (the area registry) holds rules the application reads, not editor state.
 if(node.kind==='project'||node.kind==='instance'&&/operational/i.test(String(node.implementation??'')))return 'registry';
 if(node.kind==='instance')return 'instance';
 if(node.kind==='episode')return 'evidence';
 if(node.kind==='world')return 'tab-rules';
 if(node.kind==='knowledge'){if(/operational|policy/i.test(String(node.implementation??''))||/^(?:execution:|knowledge:reader-)/.test(node.id))return 'policy';return node.id.startsWith('knowledge-file:')||node.representation==='catalog'?'knowledge-file':'knowledge-world';}
 if(node.representation==='catalog')return 'knowledge-file';
 return 'native';
};
const familyOf=node=>ENTRIES[entryOf(node)].family;
const displayName=node=>node.displayName??node.help?.title??node.label??node.id;
const kindOf=node=>Object.hasOwn(KINDS,node.kind)?node.kind:'component';
const hasTools=node=>Array.isArray(node.tools)?node.tools.length>0:node.tools&&typeof node.tools==='object'?Object.keys(node.tools).length>0:node.tools!==undefined&&node.tools!==null;
const isSopRecord=node=>node.representation==='sop';
const representationOf=node=>node.representation??'javascript';
const entryMeta=node=>ENTRIES[entryOf(node)];
const roleOf=node=>node.role??KINDS[kindOf(node)];
const USAGE={available:['A','Catalog only','Catalog entry; runtime use has not been recorded.'], 'inspection-only':['I','Inspected only','Read for inspection only; this does not demonstrate runtime reasoning.'], 'runtime-read':['R','Source read','The runtime read this source. Access alone does not prove reasoning participation.']};
let explorerSequence=0;
// Per-session view preferences (legend open, collapsed layers, compact zoom); the view works without storage.
const viewStore={get(key){try{return sessionStorage.getItem(key);}catch{return null;}},set(key,value){try{sessionStorage.setItem(key,value);}catch{/* storage unavailable */}}};
// Below this explorer width (or on a short, not wide pane) the map uses the compact phone layout.
const COMPACT_WIDTH=640;
const textOf=value=>value===null?'null':value===undefined?'undefined':typeof value==='string'?value:JSON.stringify(value);
const valueType=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const entriesOf=value=>value!==null&&typeof value==='object'?Object.entries(value):[];
function svg(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(attrs['font-size'])node.style.fontSize=`calc(${attrs['font-size']}px * var(--worlds-font-scale,1))`;if(text!==undefined)node.textContent=text;return node;}
const SHAPES={hexagon:'0,-9 8,-4.5 8,4.5 0,9 -8,4.5 -8,-4.5',diamond:'0,-9.5 9.5,0 0,9.5 -9.5,0',triangle:'0,-9 9,7.5 -9,7.5'};
function shapeElement(shape,attrs){
 if(shape==='circle')return svg('circle',{r:8,...attrs});
 if(shape==='square')return svg('rect',{x:-7.5,y:-7.5,width:15,height:15,rx:2,...attrs});
 return svg('polygon',{points:SHAPES[shape],...attrs});
}
// One renderer for map nodes and legend samples: the legend shows exactly the glyphs on the map.
function glyphKey(node,usage){return [entryOf(node),usage==='available'?'hollow':'filled'].join('|');}
function worldGlyph(node,usage){
 const entry=entryOf(node),{color,shape}=ENTRIES[entry],hollow=usage==='available';
 const glyph=svg('g',{class:'p2-worlds-glyph','data-glyph-entry':entry,'data-glyph-family':ENTRIES[entry].family,'data-representation':representationOf(node),'data-fill':hollow?'hollow':'filled',style:'--world-color:'+color});
 glyph.append(shapeElement(shape,{class:'p2-worlds-shape',fill:hollow?'none':color,'fill-opacity':hollow?1:.85,stroke:color,'stroke-width':1.8}));
 return glyph;
}
// Audit marks of a JavaScript component: D (domain logic in JS) or G (generic), and a dashed ring when it has no activity hook.
const BADGES={'domain-logic':['D','#ff8a7a','Domain logic in JavaScript: it decides with words, kinds, areas, thresholds, orderings or fallbacks that belong in SOP rules or knowledge.'],generic:['G','#8fd8ae','Generic JavaScript: parsing, transport, rendering primitives, solver plumbing or storage, with no domain decision.']};
function auditMarks(node){
 if(node.audit?.badge!=='domain-logic')return [];const [letter,color]=BADGES['domain-logic'];
 const badge=svg('g',{class:'p2-worlds-badge',transform:'translate(7,-8)','data-badge':'domain-logic'});badge.append(svg('circle',{r:4.8,fill:color}),svg('text',{x:0,y:2.4,'text-anchor':'middle','font-size':6.5},letter));
 return [badge];
}
// Wraps a caption into at most two lines of the given character budget, ellipsizing the rest.
function captionLines(text,budget){
 const words=String(text).split(/\s+/).filter(Boolean),lines=[''];
 for(const word of words){const next=(lines.at(-1)+' '+word).trim();if(next.length<=budget||!lines.at(-1))lines[lines.length-1]=next;else if(lines.length<2)lines.push(word);else{lines[1]+=' '+word;}}
 return lines.map(line=>line.length>budget?line.slice(0,Math.max(1,budget-1))+'…':line);
}
function styles(){
 if(document.getElementById('p2-worlds-explorer-style'))return;
 document.head.append(h('style',{id:'p2-worlds-explorer-style',text:`
.p2-worlds{height:100%;min-height:400px;min-width:0;display:flex;flex-direction:column;color:#e4ebf5;background:#141b25;font:inherit;overflow:hidden}
.p2-worlds *{box-sizing:border-box}.p2-worlds button,.p2-worlds input,.p2-worlds-dialog button{font:inherit;color:inherit;border:1px solid #98acc044;border-radius:7px;background:#829ab512;padding:8px 11px}.p2-worlds button,.p2-worlds-dialog button{cursor:pointer}.p2-worlds button:hover,.p2-worlds-dialog button:hover{background:#829ab527}.p2-worlds button:disabled,.p2-worlds-dialog button:disabled{opacity:.35;cursor:default}.p2-worlds button:focus-visible,.p2-worlds [tabindex]:focus-visible,.p2-worlds-dialog button:focus-visible{outline:2px solid #81baff;outline-offset:2px}
.p2-worlds-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #96abc02a}.p2-worlds-toolbar h2{font-size:17px;margin:0 10px 0 0}.p2-worlds-search{flex:1;min-width:160px;max-width:400px}.p2-worlds-status{font-size:12px;opacity:.75;margin-left:auto}.p2-worlds-status[role=alert]{color:#ffb6b6;opacity:1}
.p2-worlds-legend{display:block;max-height:260px;overflow:auto;gap:15px;flex-wrap:wrap;padding:8px 16px;font-size:12px;color:#a4b5ca}.p2-worlds-legend summary{cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;list-style-position:inside}.p2-worlds-legend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin:14px 0}.p2-worlds-legend-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;padding:10px;border:1px solid #91a9c62b;border-radius:7px}.p2-worlds-legend-symbol{width:26px;height:26px}.p2-worlds-legend-item strong{color:#d8e5f5;font-size:13px}.p2-worlds-legend-item p{margin:5px 0 0;line-height:1.5;font-size:12px}.p2-worlds-legend-note{font-size:12px;line-height:1.5;margin:9px 0}.p2-worlds-help-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:18px 0 24px}.p2-worlds-help-card{padding:16px 18px;border:1px solid #98acc033;border-radius:8px;min-width:0}.p2-worlds-help-card h3{font-size:15px}.p2-worlds-help-card ul{margin:8px 0 0;padding-left:19px;line-height:1.65}.p2-worlds-help-card li{margin:5px 0;overflow-wrap:anywhere}.p2-worlds-help-card p{font-size:13px;margin:5px 0}.p2-worlds-kind-note{font-size:13px!important;color:#b7c9df}
.p2-worlds-graph-pane{position:relative;flex:1;min-height:240px;min-width:0;overflow:hidden;background:radial-gradient(circle at 50% 45%,#526f9a16,transparent 65%)}.p2-worlds-graph{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.p2-worlds-graph:active{cursor:grabbing}.p2-worlds-graph text{font-family:inherit;pointer-events:none}.p2-worlds-node{cursor:pointer}.p2-worlds-node.dim{opacity:.25}.p2-worlds-edge{stroke:#9ab0ca35;stroke-width:1.3;fill:none}.p2-worlds-edge.connected{stroke:#b8d5ff;stroke-width:2.2}.p2-worlds-graph-hint{position:absolute;top:12px;right:16px;max-width:calc(100% - 270px);text-align:right;font-size:11px;color:#90a4bf;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p2-worlds-empty{position:absolute;inset:40px;display:grid;place-items:center;font-size:15px;color:#a2b4cd;text-align:center}
.p2-worlds-log-grip{height:7px;cursor:row-resize;touch-action:none;background:#90aaca20;flex:0 0 7px}.p2-worlds-log-grip:after{content:"";display:block;width:40px;height:2px;margin:2px auto;background:#9bb4ce88;border-radius:2px}.p2-worlds-events{overflow:hidden;flex-shrink:0;border-top:1px solid #96abc02a;flex:0 0 124px;min-height:70px;display:flex;flex-direction:column}.p2-worlds-events header{flex-wrap:wrap;display:flex;align-items:center;gap:10px;padding:8px 16px;font-size:12px}.p2-worlds-events header button{padding:3px 7px;font-size:11px}.p2-worlds-playback-status{font-size:11px;opacity:.8}.p2-worlds-log-tools{display:flex;gap:8px;padding:3px 16px 7px}.p2-worlds-log-tools input{flex:1;min-width:80px;font-size:12px;padding:4px 8px}.p2-worlds-log-tools button{font-size:11px;padding:4px 8px}.p2-worlds-events.collapsed .p2-worlds-log-tools,.p2-worlds-events.collapsed .p2-worlds-event-list,.p2-worlds-events.collapsed .p2-worlds-log-grip{display:none}.p2-worlds-event-error{color:#ffb4b4}.p2-worlds-event-world,.p2-worlds-event-result,.p2-worlds-event-duration{color:#9fb4cf;font-size:11px;white-space:nowrap}.p2-worlds-live{color:#7ee0b8}.p2-worlds-event-count{opacity:.6;margin-left:auto}.p2-worlds-event-list{flex:1;min-height:0;overflow:auto;padding:0 16px 8px;display:flex;flex-direction:column;gap:3px}.p2-worlds-event{display:flex;gap:12px;align-items:baseline;text-align:left;width:100%;padding:5px 7px!important;border:0!important;background:transparent!important;font-size:12px!important}.p2-worlds-event time{opacity:.5;white-space:nowrap;font-size:11px}.p2-worlds-event-phase{color:#99bde8;min-width:70px}.p2-worlds-event-label{overflow-wrap:anywhere}.p2-worlds-event.empty{opacity:.6}
.p2-worlds-dialog{color:#e4ebf5;font:inherit;position:fixed;inset:24px;margin:0;width:calc(100vw - 48px);height:calc(100dvh - 48px);max-width:none;max-height:none;padding:0;border:1px solid #627b97;border-radius:12px;background:#182231;color:#e4ebf5;box-shadow:0 25px 100px #0009;font:14px/1.5 system-ui,sans-serif;overflow:hidden}.p2-worlds-dialog-shell{height:100%;display:flex;flex-direction:column}.p2-worlds-dialog-header{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #98acc033}.p2-worlds-dialog-header h2{margin:0;font-size:20px;line-height:1.3;overflow-wrap:anywhere}.p2-worlds-dialog-subtitle{font-size:12px;color:#a0b3cb;margin-top:4px;overflow-wrap:anywhere}.p2-worlds-dialog-heading{flex:1;min-width:0}.p2-worlds-dialog button{font-size:13px}.p2-worlds-detail-tabs{display:flex;gap:5px;padding:10px 20px;border-bottom:1px solid #98acc033;overflow:auto;flex:0 0 auto}.p2-worlds-detail-tabs button{white-space:nowrap;background:transparent;border-color:transparent}.p2-worlds-detail-tabs button[aria-selected=true]{background:#344c6b;color:#fff;border-color:#6c9cd0}.p2-worlds-detail-body{flex:1;overflow:auto;padding:22px 28px;min-height:0}.p2-worlds-detail-body h3{font-size:17px;margin:0 0 14px}.p2-worlds-detail-body p{max-width:1000px;font-size:15px;line-height:1.7;overflow-wrap:anywhere}.p2-worlds-detail-body dl{display:grid;grid-template-columns:minmax(100px,160px) minmax(0,1fr);gap:12px 20px;max-width:1100px;font-size:14px}.p2-worlds-detail-body dt{color:#9fb3ce}.p2-worlds-detail-body dd{margin:0;overflow-wrap:anywhere}.p2-worlds-detail-body pre{font:13px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;margin:16px 0}.p2-worlds-detail-summary{color:#a7bbd4;font-size:13px!important}.p2-worlds-note{border-left:3px solid #a8b7d4;padding:10px 16px;background:#829ab510}.p2-worlds-property-path{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-bottom:16px}.p2-worlds-property-path button{padding:5px 9px;font-size:12px}.p2-worlds-property-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px}.p2-worlds-property-table th{text-align:left;color:#9fb3ce;font-size:12px;font-weight:500}.p2-worlds-property-table th,.p2-worlds-property-table td{padding:12px 10px;border-bottom:1px solid #98acc022;vertical-align:top;overflow-wrap:anywhere}.p2-worlds-property-table th:first-child{width:28%}.p2-worlds-property-table th:nth-child(2){width:13%}.p2-worlds-property-table button{text-align:left;font-size:14px;background:#7399c119;max-width:100%;overflow-wrap:anywhere}.p2-worlds-property-type{color:#a5b5cd;font:12px ui-monospace,monospace}.p2-worlds-scalar{white-space:pre-wrap;overflow-wrap:anywhere}.p2-worlds-tool-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.p2-worlds-tool-card{margin:0 0 16px;padding:16px 18px;border:1px solid #98acc033;border-radius:8px;min-width:0}.p2-worlds-tool-card h4{font-size:15px;margin:0 0 8px;overflow-wrap:anywhere}.p2-worlds-tool-card p{font-size:13px;margin:5px 0}.p2-worlds-connection{display:grid;grid-template-columns:30px minmax(120px,200px) minmax(0,1fr);gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid #98acc022}.p2-worlds-connection button{text-align:left;overflow-wrap:anywhere}.p2-worlds-connection-label{color:#a8bed8;font-size:13px}.p2-worlds-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.p2-worlds-nav-summary{font-size:13px;color:#a1b4ce;max-width:1000px;margin:0 0 18px}.p2-worlds-collection-member{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #98acc022}.p2-worlds-collection-member button{text-align:left}
.p2-worlds-node rect.p2-worlds-hit{fill:transparent;stroke:none}.p2-worlds-node:hover rect.p2-worlds-hit,.p2-worlds-node:focus rect.p2-worlds-hit{fill:#8fb4dc14}.p2-worlds-node:focus{outline:none}.p2-worlds-shape{transition:stroke-width .15s,fill-opacity .15s}.p2-worlds-node:hover .p2-worlds-shape{stroke-width:2.6}.p2-worlds-node.active .p2-worlds-shape{fill-opacity:.85;stroke-width:3;filter:drop-shadow(0 0 7px var(--world-color))}.p2-worlds-node.active .p2-worlds-caption{fill:#ffffff;font-weight:600}.p2-worlds-edge{fill:none;stroke:#a3bfd5;stroke-width:.8;opacity:.22;pointer-events:stroke}.p2-worlds-edge,.p2-worlds-edge.is-background{opacity:0}.p2-worlds-graph.show-links .p2-worlds-edge{opacity:.28}.p2-worlds-graph.show-links .p2-worlds-edge.is-background{opacity:.08}.p2-worlds-edge-label{fill:#e1ecf8;paint-order:stroke;stroke:#141b25;stroke-width:4px;pointer-events:none}.p2-worlds-graph.highlighting .p2-worlds-edge{opacity:.07}.p2-worlds-graph.highlighting .p2-worlds-edge.connected{stroke:#c3e0ff;opacity:1;stroke-width:1.4}.p2-worlds-graph .p2-worlds-edge.playing-edge{stroke:#a5ffca;opacity:1;stroke-width:2.3}.p2-worlds-graph [data-layout-group].active rect{stroke:#81c6a8;stroke-width:2}.p2-worlds-tooltip{position:absolute;z-index:3;max-width:340px;display:flex;flex-direction:column;gap:5px;padding:12px 14px;border:1px solid #7291b2;border-radius:8px;background:#1c2b3df5;box-shadow:0 5px 25px #0008;pointer-events:none;font-size:12px;overflow-wrap:anywhere}.p2-worlds-tooltip[hidden]{display:none}.p2-worlds-tooltip strong{font-size:14px}.p2-worlds-tooltip span{color:#adc0d8}.p2-worlds-dialog{inset:12px;width:calc(100vw - 24px);height:calc(100dvh - 24px)}
.p2-worlds [hidden]{display:none!important}.p2-worlds-dialog{position:relative;inset:auto;margin:0;width:100%;height:100%;flex:1;min-height:0;border:0;border-radius:0;box-shadow:none;max-width:none;max-height:none}.p2-worlds-detail-breadcrumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid #98acc022;max-height:105px;overflow:auto;flex:0 0 auto;font-size:12px}.p2-worlds-detail-breadcrumbs button{padding:4px 8px;font-size:12px}.p2-worlds-detail-breadcrumbs span{opacity:.6}.p2-worlds-detail-breadcrumbs strong{font-size:12px}.p2-worlds-dialog-header{flex-wrap:wrap}.p2-worlds-dialog-heading{min-width:160px}
.p2-worlds-playback-bar[hidden]{display:none}.p2-worlds-events{flex:1;min-height:0;max-height:none;border-top:0}.p2-worlds-map-shell{flex:1;min-height:0;min-width:0;display:flex;overflow:hidden}.p2-worlds-legend{flex:0 0 126px;width:126px;max-height:none;overflow:auto;padding:12px;border-right:1px solid #98acc02b}.p2-worlds-legend.is-open{position:absolute;inset:8px auto 8px 8px;z-index:4;width:min(320px,calc(100% - 16px));max-height:calc(100% - 16px);border:1px solid #98acc044;border-radius:8px;background:#182231f5;box-shadow:0 10px 40px #0009}.p2-worlds-legend summary{display:flex;flex-direction:column;align-items:flex-start;gap:4px;cursor:pointer;font-size:calc(15px * var(--worlds-font-scale,1))}.p2-worlds-legend summary:before{content:'▸';font-size:14px}.p2-worlds-legend details[open]>summary:before{content:'▾'}.p2-worlds-legend-grid{display:flex;flex-direction:column;gap:2px;margin:10px 0}.p2-worlds-legend-item{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;padding:7px 0;border:0;border-bottom:1px solid #91a9c62b;border-radius:0}.p2-worlds-legend-item strong{font-size:calc(13px * var(--worlds-font-scale,1))}.p2-worlds-legend-item p,.p2-worlds-legend-note{font-size:calc(12px * var(--worlds-font-scale,1));line-height:1.45;margin:2px 0 0}.p2-worlds-playback-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid #98acc02b;flex:0 0 auto}.p2-worlds-playback-bar button{font-size:calc(12px * var(--worlds-font-scale,1));padding:5px 8px}.p2-worlds-playback-bar[hidden]{display:none}.p2-worlds-events{flex:1;min-height:0;border:0;overflow:hidden}.p2-worlds-events header{padding:14px 20px;flex:0 0 auto}.p2-worlds-events h3{font-size:calc(19px * var(--worlds-font-scale,1));margin:0}.p2-worlds-events .p2-worlds-event{font-size:calc(14px * var(--worlds-font-scale,1))!important;padding:9px 8px!important}.p2-worlds-events time{font-size:calc(12px * var(--worlds-font-scale,1))}.p2-worlds-detail-body{font-size:calc(15px * var(--worlds-font-scale,1));line-height:1.65}.p2-worlds-detail-body p{font-size:calc(16px * var(--worlds-font-scale,1))}.p2-worlds-detail-body h3{font-size:calc(19px * var(--worlds-font-scale,1));margin:12px 0 16px}.p2-worlds-detail-body dl,.p2-worlds-property-table{font-size:calc(15px * var(--worlds-font-scale,1))}.p2-worlds-detail-body pre{font-size:calc(14px * var(--worlds-font-scale,1))}.p2-worlds-dialog button,.p2-worlds-detail-tabs button,.p2-worlds-detail-breadcrumbs button{font-size:calc(14px * var(--worlds-font-scale,1))}.p2-worlds-detail-breadcrumbs{font-size:calc(14px * var(--worlds-font-scale,1));padding:9px 16px}.p2-worlds-detail-breadcrumbs strong{font-size:inherit}.p2-worlds-help-card p,.p2-worlds-detail-summary{font-size:calc(14px * var(--worlds-font-scale,1))!important}.p2-worlds-toolbar button,.p2-worlds-toolbar input{font-size:calc(14px * var(--worlds-font-scale,1))}
.p2-worlds-map-shell{position:relative}.p2-worlds-legend:not(.is-open){position:absolute;z-index:4;top:8px;left:8px;width:auto;max-width:calc(100% - 16px);padding:7px 10px;border:1px solid #98acc044;border-radius:8px;background:#182231ed;max-height:48px;overflow:hidden}.p2-worlds-legend:not(.is-open) summary{flex-direction:row;align-items:center;gap:7px}.p2-worlds-legend:not(.is-open) summary span{font-size:12px;color:#a4b5ca}.p2-worlds-legend.is-open{min-width:0}.p2-worlds-toolbar,.p2-worlds-playback-bar{flex-shrink:0}.p2-worlds-search{min-width:0}.p2-worlds-help-grid,.p2-worlds-tool-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.p2-worlds-source-files{display:flex;flex-wrap:wrap;gap:7px 16px;max-height:160px;overflow:auto;line-height:1.5;margin:14px 0}.p2-worlds-source-files a[aria-current=page]{color:#e3f0ff;font-weight:600}.p2-worlds-selected-source{font-size:14px;overflow-wrap:anywhere}.p2-worlds-usage{font-size:14px!important;color:#b5c8dd}.p2-worlds a.p2-worlds-link{color:#a8cdf4;text-decoration:underline;text-underline-offset:3px;border:0!important;background:none!important;border-radius:0!important;padding:0!important;cursor:pointer;overflow-wrap:anywhere}.p2-worlds a.p2-worlds-link:hover{color:#e2efff}.p2-worlds-detail-breadcrumbs a{font-size:inherit}.p2-worlds-detail-body .p2-worlds-why{font-size:calc(17px * var(--worlds-font-scale,1));max-width:940px;margin:0 0 14px}.p2-worlds-detail-body .p2-worlds-help-card,.p2-worlds-tool-card{border:0;border-bottom:1px solid #98acc02b;border-radius:0;padding:12px 0;margin:0}.p2-worlds-detail-body .p2-worlds-note{border:0;background:none;padding:0}.p2-worlds-detail-tabs button{border:0!important;border-radius:0!important;background:none!important}.p2-worlds-detail-tabs button[aria-selected=true]{box-shadow:inset 0 -2px #81baff}
.p2-worlds-badge{pointer-events:none}.p2-worlds-badge text{font-weight:700;fill:#141b25}.p2-worlds-silent-ring{fill:none;stroke:#e8eef6;stroke-width:1;stroke-dasharray:2 2;opacity:.85}.p2-worlds-audit-table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 14px}.p2-worlds-audit-table th,.p2-worlds-audit-table td{border-bottom:1px solid #96abc02a;padding:5px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-line}.p2-worlds-audit-table td.is-domain{color:#ffb2a6;font-weight:600}.p2-worlds-audit-table td.is-generic{color:#9fe0b8}.p2-worlds-audit-secret{color:#ffd27a}.p2-worlds-legend-badge{display:flex;align-items:center;gap:8px;margin:4px 0}.p2-worlds-legend-badge svg{width:20px;height:20px;flex:0 0 20px}
@media(max-width:700px){.p2-worlds{min-height:0}.p2-worlds-toolbar h2{display:none}.p2-worlds-toolbar input{flex-basis:100%;max-width:none;width:100%}.p2-worlds-toolbar button{padding:7px 9px}.p2-worlds-toolbar{gap:5px}.p2-worlds-status{font-size:11px}.p2-worlds-playback-bar{gap:5px;padding:7px 10px}.p2-worlds-playback-bar .p2-worlds-live{font-size:12px}.p2-worlds-playback-status{flex-basis:100%;overflow-wrap:anywhere}.p2-worlds-playback-bar button{padding:5px 7px;font-size:12px}.p2-worlds-graph-pane{min-height:180px}.p2-worlds-legend.is-open{position:absolute;inset:8px auto 8px 8px;z-index:4;width:min(285px,calc(100% - 16px));max-height:calc(100% - 16px);border:1px solid #98acc044;border-radius:8px;background:#182231f5}.p2-worlds-detail-breadcrumbs{padding:7px 10px;max-height:90px}.p2-worlds-detail-body{padding:12px}.p2-worlds-detail-body dl{grid-template-columns:minmax(80px,30%) minmax(0,1fr);gap:8px}.p2-worlds-connection{grid-template-columns:20px minmax(65px,30%) minmax(0,1fr);gap:6px}.p2-worlds-events .p2-worlds-event{flex-wrap:wrap;gap:5px 9px}.p2-worlds-event-label{flex-basis:100%;text-align:left}.p2-worlds-event-world{white-space:normal;overflow-wrap:anywhere}.p2-worlds-log-tools{flex-wrap:wrap;padding:4px 10px}.p2-worlds-log-tools input{flex-basis:100%}}
@media(max-width:700px){.p2-worlds-toolbar{padding:8px 10px;gap:6px;flex-wrap:nowrap;overflow-x:auto;flex:0 0 auto}.p2-worlds-toolbar>*{flex-shrink:0}.p2-worlds-toolbar .p2-worlds-search{flex:0 0 140px;min-width:140px}.p2-worlds-playback-bar{flex-wrap:nowrap;overflow-x:auto;padding:7px 10px}.p2-worlds-playback-bar>*{flex-shrink:0}.p2-worlds-playback-status{max-width:190px;white-space:normal}.p2-worlds-toolbar h2{font-size:15px}.p2-worlds-status{width:auto;margin-left:0;white-space:nowrap}.p2-worlds-dialog{inset:auto;width:100%;height:100%;border-radius:0}.p2-worlds-dialog-header{padding:12px;gap:6px}.p2-worlds-dialog-header h2{font-size:17px}.p2-worlds-detail-tabs{padding:8px}.p2-worlds-detail-body{padding:16px}.p2-worlds-property-table th:first-child{width:25%}.p2-worlds-property-table th:nth-child(2){width:18%}.p2-worlds-events{flex-basis:110px}}
.p2-worlds-zoom{display:contents}.p2-worlds:not(.is-compact) .p2-worlds-toolbar .p2-worlds-search{min-width:180px}.p2-worlds-legend-close{display:none}.p2-worlds-legend.is-open .p2-worlds-legend-close{display:inline-grid;place-items:center;position:sticky;top:0;float:right;z-index:2;width:36px;height:36px;padding:0!important;margin:-4px -4px 0 8px;font-size:20px!important;line-height:1;background:#22324a!important}.p2-worlds-legend-scrim{display:none}@media(max-height:480px){.p2-worlds{min-height:0}}
.p2-worlds.is-compact{min-height:0}.p2-worlds.is-compact .p2-worlds-toolbar{flex-wrap:wrap;overflow:hidden;padding:6px 8px;gap:5px}.p2-worlds.is-compact .p2-worlds-toolbar h2{display:none}.p2-worlds.is-compact .p2-worlds-toolbar .p2-worlds-search{flex:1 1 90px;min-width:70px;max-width:none;width:auto;padding:7px 9px}.p2-worlds.is-compact .p2-worlds-toolbar button{flex:0 0 auto;min-height:36px;min-width:36px;padding:6px 8px}.p2-worlds.is-compact [data-short]{font-size:0!important}.p2-worlds.is-compact [data-short]::after{content:attr(data-short);font-size:13px}.p2-worlds.is-compact .p2-worlds-status:not([role=alert]){display:none}.p2-worlds.is-compact .p2-worlds-status[role=alert]{flex:1 1 100%;white-space:normal;margin:0}.p2-worlds.is-compact.is-map-page .p2-worlds-detail-breadcrumbs,.p2-worlds.is-compact .p2-worlds-graph-hint{display:none}
.p2-worlds.is-compact .p2-worlds-graph-pane{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;min-height:0;background:none}.p2-worlds.is-compact .p2-worlds-graph{touch-action:pan-x pan-y;cursor:default}.p2-worlds.is-compact .p2-worlds-graph:active{cursor:default}.p2-worlds.is-compact .p2-worlds-zoom{display:flex;position:absolute;z-index:3;right:10px;bottom:10px;gap:4px;padding:3px;border:1px solid #98acc044;border-radius:10px;background:#182231ed;box-shadow:0 4px 16px #0007}.p2-worlds.is-compact .p2-worlds-zoom button{min-width:40px;min-height:38px;padding:4px 8px;font-size:15px}
.p2-worlds.is-compact .p2-worlds-legend:not(.is-open){top:auto;bottom:10px;left:10px;max-width:calc(100% - 170px);max-height:46px;padding:0;box-shadow:0 4px 16px #0007}.p2-worlds.is-compact .p2-worlds-legend:not(.is-open) summary{padding:10px 12px;min-height:44px;flex-wrap:nowrap;white-space:nowrap}.p2-worlds.is-compact .p2-worlds-legend:not(.is-open) summary span{overflow:hidden;text-overflow:ellipsis;min-width:0}.p2-worlds.is-compact .p2-worlds-legend.is-open{inset:auto 0 0 0;width:auto;max-height:min(72%,560px);border-radius:14px 14px 0 0;border-bottom:0;padding:12px 14px calc(14px + env(safe-area-inset-bottom));z-index:6}.p2-worlds.is-compact .p2-worlds-legend.is-open+.p2-worlds-legend-scrim{display:block;position:absolute;inset:0;z-index:5;background:#05090f99}.p2-worlds.is-compact .p2-worlds-legend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:0 14px}
` }));
}

export function createWorldsExplorer({load,subscribe,copy,loadSources}={}){
 if(typeof load!=='function')throw new TypeError('Worlds explorer requires a runtime loader.');styles();
 const button=(label,action,attrs={})=>h('button',{type:'button',text:label,onclick:action,...attrs});
 const link=(label,action,attrs={})=>h('a',{href:'#'+element.id,class:'p2-worlds-link',text:label,onclick:event=>{event.preventDefault();action(event);},...attrs});
 const sourceResponses=new Map(),sourceLoading=new Set(),selectedSourcePaths=new Map();
 const effectiveUsage=node=>node.usage==='available'&&sourceResponses.get(node.id)?.sources?.some(source=>source.language==='sop'&&typeof source.text==='string')?'inspection-only':node.usage;
 const hasSopSource=node=>isSopRecord(node)&&(typeof node.wires==='string'&&node.wires.trim().length>0||Array.isArray(node.sourceFiles)&&node.sourceFiles.length>0);
 let disposed=false,generation=0,data={nodes:[],edges:[]},query='',totalEvents=0,events=[],layoutGroups=new Map(),memberships=new Map(),positions=new Map();
 let legendOpen=viewStore.get('p2-worlds-legend')==='open';let legendHistory=false;let viewAdjusted=false;
 let compact=false,compactScale=Math.max(.8,Math.min(2,Number(viewStore.get('p2-worlds-compact-scale'))||1)),collapsedLayers=new Set();
 try{const saved=JSON.parse(viewStore.get('p2-worlds-collapsed')??'[]');if(Array.isArray(saved))collapsedLayers=new Set(saved.filter(id=>typeof id==='string'));}catch{/* ignore a malformed preference */}
let graphView=null,currentDetail=null,currentPage='map',fontScale=1,graphBounds={x:0,y:0,w:900,h:500};
 const seenEvents=new Set(),active=new Map(),nodeElements=new Map(),groupElements=new Map();
 let playbackQueue=[],playing=null,playbackTimer=null,playbackStarted=0,playbackElapsed=0,paused=false,viewVisible=true,visibilityPaused=false,clockRunning=false,explicitReplay=false,replayCommand="",logFrame=null,logQuery='';
 const element=h('section',{id:'worlds-view-'+(++explorerSequence),class:'p2-worlds','aria-label':'Worlds architecture'}),status=h('span',{class:'p2-worlds-status',role:'status'}),search=h('input',{class:'p2-worlds-search',type:'search',placeholder:'Find a world, object or component…','aria-label':'Find a world or component'});
 const graph=svg('svg',{class:'p2-worlds-graph','aria-label':'Runtime architecture graph',role:'group'}),graphPane=h('div',{class:'p2-worlds-graph-pane'},graph),legend=h('aside',{class:'p2-worlds-legend','aria-label':'World kinds legend'}),eventList=h('div',{class:'p2-worlds-event-list',role:'log','aria-label':'Runtime activation events'}),eventCount=h('span',{class:'p2-worlds-event-count'});
 const detailBreadcrumbs=h('nav',{class:'p2-worlds-detail-breadcrumbs','aria-label':'Worlds location'});
 const zoomControls=h('div',{class:'p2-worlds-zoom',role:'group','aria-label':'Map zoom'},button('−',()=>zoom(1.2),{'aria-label':'Zoom out'}),button('+',()=>zoom(1/1.2),{'aria-label':'Zoom in'}),button('Fit',fitView,{'aria-label':'Fit the map'}));
 const toolbar=h('header',{class:'p2-worlds-toolbar'},h('h2',{text:'Worlds'}),search,button('Activity log',showActivityLog,{'aria-label':'Open activity log','data-short':'Log'}),button('Refresh',()=>void refresh(),{'aria-label':'Refresh','data-short':'↻'}),zoomControls,button('All links',event=>{const on=graph.classList.toggle('show-links');event.currentTarget.setAttribute('aria-pressed',String(on));},{'aria-pressed':'false','data-worlds-links':'','data-short':'Links'}),button('About this view',()=>openDetails({id:'ui:architecture-notes',label:'About the architecture view',kind:'component',implementation:'Read-only JavaScript projection',why:'One map of the records this session actually has, read as a snapshot between actions: the worker waits for a running turn before it reads, so during a long action the map shows the previous state until Refresh. Rows from top to bottom: the Native Layer (all JavaScript as one orange kind, badge D where it makes domain decisions; the trained reader in purple), the SOP Worlds that hold rules and policies (greens: tab rules, operational policies, the area registry), the instance Worlds that hold the live state (blues), knowledge (teals) and schemas (greys). SOP Worlds are told apart by kind; JavaScript is not, because we are reducing it. A tab\'s SOP files are the rules and declarations it ships (formerly called the tool package). No preferences World exists yet; w.preferences is planned. Columns are the tabs (Diagram, Drawing, Calendar, Documents, Avatar) plus Shared for what all tabs use. Colour says what kind of record it is (the shape repeats its family); the legend lists only the kinds on this map.',description:'There is no separate session layer. Every tab keeps its state as an SOP instance World, and so does the undo/redo journal: they are the instances. The area registry is an SOP World of rules, shown with the rules. The few records still kept as JavaScript (application shell state, session memory, chat history, UI training pairs) are native data, so they sit in the Native Layer. The world loader is JavaScript, so it sits in the Native Layer; session memory is part of the Session (turn coordinator) and is listed inside it. Source files and schemas that belong to one World are listed inside that World. Layers and columns only arrange the map; they are not additional SOP Worlds. Activity retention: the worker and this page each keep the last 300 activity events; Copy retained log copies the page\'s 300.',details:{limitations:data.limitations??[],runtimeAudit:data.runtimeAudit??null,actualNodes:data.nodes.length,actualLinks:data.edges.length}}),{'data-short':'About'}),status);
 const tooltip=h('div',{class:'p2-worlds-tooltip',role:'tooltip',hidden:true});graphPane.append(tooltip,h('div',{class:'p2-worlds-graph-hint',text:'Snapshot read between actions (Refresh reads it again) · point at a record to see its links · click for details · drag to pan · scroll to zoom'}));
 const playbackStatus=h('span',{class:'p2-worlds-playback-status',role:'status','aria-live':'off'}),pauseButton=button('Pause',togglePause),logFilter=h('input',{type:'search',placeholder:'Filter log…','aria-label':'Filter activity log'}),logPanel=h('section',{class:'p2-worlds-events',role:'region','aria-label':'Activity log',hidden:true});
 const playbackBar=h('div',{class:'p2-worlds-playback-bar'},h('span',{class:'p2-worlds-live',text:'Recorded activity playback'}),playbackStatus,pauseButton,button('Stage details',showPlaybackStage),button('Clear playback',stopPlayback));
 logPanel.append(h('header',{},h('h3',{text:'Activity log'}),eventCount),h('div',{class:'p2-worlds-log-tools'},logFilter,...(copy?[button('Copy retained log',async()=>{try{await copy(JSON.stringify(events,null,2));}catch(error){setStatus('Copy log failed: '+error.message,true);}})]:[])),eventList);
 const legendScrim=h('div',{class:'p2-worlds-legend-scrim','aria-hidden':'true',onclick:()=>setLegendOpen(false)}),legendClose=button('×',()=>setLegendOpen(false),{class:'p2-worlds-legend-close','aria-label':'Close legend','data-legend-close':''});
 const mapShell=h('div',{class:'p2-worlds-map-shell'},legend,legendScrim,graphPane);element.append(toolbar,detailBreadcrumbs,playbackBar,mapShell,logPanel);
 logFilter.addEventListener('input',()=>{logQuery=logFilter.value.toLowerCase().trim();scheduleLogRender();});
 const dialog=h('section',{class:'p2-worlds-dialog',role:'region','aria-label':'World or component details',hidden:true}),dialogBody=h('div',{class:'p2-worlds-detail-body'}),dialogTitle=h('h2'),dialogSubtitle=h('div',{class:'p2-worlds-dialog-subtitle'}),detailTabs=h('div',{class:'p2-worlds-detail-tabs',role:'tablist','aria-label':'World details'});
 dialog.append(h('div',{class:'p2-worlds-dialog-shell'},h('header',{class:'p2-worlds-dialog-header'},h('div',{class:'p2-worlds-dialog-heading'},dialogTitle,dialogSubtitle)),detailTabs,dialogBody));element.append(dialog);


 const setStatus=(message,error=false)=>{status.textContent=message;status.setAttribute('role',error?'alert':'status');};
 const actualNode=id=>data.nodes.find(node=>node.id===id);
 const getNode=id=>actualNode(id);
 const related=node=>data.edges.filter(edge=>edge.from===node.id||edge.to===node.id);
 // An event lights the records it names and every audited JavaScript component that declares the event's operation
 // as its own activity hook (src/dialog/runtime-component-registry.mjs); nothing else is inferred.
 let operationOwners=new Map();
 const indexOperations=()=>{operationOwners=new Map();for(const node of data.nodes)for(const operation of node.audit?.activity?.operations??[]){if(!operationOwners.has(operation))operationOwners.set(operation,[]);operationOwners.get(operation).push(node.id);}};
 const declaredEmitters=event=>typeof event?.operation==='string'?(operationOwners.get(event.operation)??[]).filter(id=>!(event.nodeIds??[]).includes(id)):[];
 const litIds=event=>[...new Set([...(event.nodeIds??[]),...declaredEmitters(event)])];
 const matches=node=>!query||[node.id,node.label,node.displayName,node.help?.title,node.kind,node.description,node.implementation,node.audit?.badge==='domain-logic'?'domain logic in js':node.audit?'generic js':null,...(node.audit?.modules??[]).map(module=>module.path)].some(value=>String(value??'').toLowerCase().includes(query));
 // Shared records are ordered first in the Shared column: the registry and session Worlds, then the components every tab uses.
 const SHARED_ORDER=['project:application','instance:app.history','component:reasoner','component:reader','component:request-admission','component:control-interpreter','execution:module:declared-execution','component:sop-area','component:sop-world-host','component:problem-compiler','provider:z3','provider:internal-search','component:library','runtime:registry','runtime:activity-bus','knowledge:catalog'];
 const sharedRank=id=>{const index=SHARED_ORDER.indexOf(id);return index<0?SHARED_ORDER.length:index;};
 // Folding is presentation only: a record declared (partOf) or structurally used as a part of one owner is listed inside that owner.
 let folds=new Map(),parts=new Map(),lastSize=null,edgeLabelLayer=null;
 const visibleOf=id=>folds.get(id)??id;
 function computeFolds(){
  const byId=new Map(data.nodes.map(node=>[node.id,node])),parent=new Map(),incoming=new Map(),outgoing=new Map();
  const add=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
  for(const edge of data.edges)if(byId.has(edge.from)&&byId.has(edge.to)&&edge.from!==edge.to){add(incoming,edge.to,edge.from);add(outgoing,edge.from,edge.to);}
  const isPart=node=>node?.kind==='schema'||node?.id.startsWith('knowledge-file:');
  for(const node of data.nodes){
   if(typeof node.partOf==='string'&&byId.has(node.partOf)&&node.partOf!==node.id){parent.set(node.id,node.partOf);continue;}
   // A declaration source used by exactly one knowledge or policy World is shown inside that World.
   if(!isPart(node)||[...(outgoing.get(node.id)??[])].some(id=>!isPart(byId.get(id))))continue;
   const owners=[...(incoming.get(node.id)??[])];
   if(owners.length===1&&byId.get(owners[0]).kind==='knowledge')parent.set(node.id,owners[0]);
  }
  folds=new Map();parts=new Map();
  for(const id of parent.keys()){
   let root=id;const seen=new Set([id]);
   for(const step of data.nodes){if(!parent.has(root))break;root=parent.get(root);if(seen.has(root)){root=id;break;}seen.add(root);}
   if(root!==id){folds.set(id,root);if(!parts.has(root))parts.set(root,[]);parts.get(root).push(id);}
  }
 }
 // What the instances layer holds, from the actual records.
 function stateDescription(){
  const names=data.nodes.filter(node=>!folds.has(node.id)&&familyOf(node)==='state').map(displayName);
  return 'Blues: the current facts, held as SOP instance Worlds: '+(names.length?names.join(', '):'none')+'. Session data still kept as JavaScript is in the Native Layer, because it is JavaScript, not an SOP World.';
 }
 function organize(){
  layoutGroups=new Map();memberships=new Map();
  // Rows follow a request from top to bottom: your words reach the code and the reader, SOP rules decide, the live state
  // changes; knowledge and schemas are read by reference.
  const definitions=[
   ['native',FAMILIES.native,'Orange: everything that is JavaScript, as one kind: tool hosts, interpreters, audited components (from the declared component registry), UI helpers, model runtime hosts and session data still kept as JavaScript. We are reducing and unifying these pieces, so they are not told apart; badge D marks JavaScript that makes domain decisions (words, kinds, areas, thresholds, orderings, fallbacks) that belong in SOP rules or knowledge. Purple: the trained reader (SOP-BERT and its binding bundle), which is not an SOP World.'],
   ['rules',FAMILIES.rules,'Greens: SOP Worlds that hold rules and policies. Tab rules: the SOP files each tab ships (area declaration and act rules, tool interface, instance schema). Operational policies: interpretation, reader context and admission, routing, composition, creation, placement and scene defaults, history. The area registry World links each tab to its domain, schema and instance. No preferences World exists yet (planned: w.preferences).'],
   ['state',FAMILIES.state,stateDescription()],
   ['knowledge',FAMILIES.knowledge,'Teals: published catalog Worlds and their files, read by reference. A hollow symbol means none of its sources were read in this session.'],
   ['schemas',FAMILIES.schema,'Greys: types, slots and constraints that validate the other Worlds, and the tool interface declarations. A schema used by exactly one World is listed inside that World.'],
  ];
  const layerOf={native:'native',rules:'rules',state:'state',knowledge:'knowledge',schema:'schemas'};
  for(const [id,label,description]of definitions)layoutGroups.set(id,{id,label,description,members:[]});
  for(const node of data.nodes){const shown=actualNode(visibleOf(node.id))??node,id=layerOf[familyOf(shown)];if(!folds.has(node.id))layoutGroups.get(id).members.push(node.id);memberships.set(node.id,id);}
 }
 function declaredAreas(){
  const supplied=Array.isArray(data.areas)?data.areas:[],unique=new Map();
  for(const area of supplied)if(typeof area.world==='string')unique.set(area.world,{...area,world:area.world,label:area.label??area.title??area.view??area.world});
  if(!unique.size)for(const node of data.nodes)if(node.kind==='instance'&&typeof node.details?.world==='string')unique.set(node.details.world,{world:node.details.world,label:actualNode('world:'+node.details.world)?.details?.tab?.title??node.details.world});
  return [...unique.values()];
 }
 function domainPlacement(areas){
  const known=new Map(areas.flatMap(area=>[[area.world,area.world],...(area.schemaWorld?[[area.schemaWorld,area.world]]:[])])),owners=new Map(),adjacency=new Map(data.nodes.map(node=>[node.id,new Set()]));
  for(const node of data.nodes){const explicit=node.world??node.details?.world;const world=known.has(explicit)?known.get(explicit):node.kind==='world'&&known.has(node.id.slice('world:'.length))&&node.id.startsWith('world:')?known.get(node.id.slice('world:'.length)):null;if(world)owners.set(node.id,world);}
  for(const edge of data.edges){adjacency.get(edge.from)?.add(edge.to);adjacency.get(edge.to)?.add(edge.from);}
  // This is a layout choice only: place directly connected records near a single declared owner.
  // Ambiguous/shared records stay in Shared; no ownership fact is added to the runtime.
  for(const node of data.nodes)if(!owners.has(node.id)&&['schema','instance','runtime','structure','adapter'].includes(node.kind)){
   const neighbors=[...(adjacency.get(node.id)??[])].map(id=>owners.get(id)).filter(Boolean),distinct=[...new Set(neighbors)];if(distinct.length===1)owners.set(node.id,distinct[0]);
  }
  return owners;
 }
 function applyView(){if(graphView)graph.setAttribute('viewBox',`${graphView.x} ${graphView.y} ${graphView.w} ${graphView.h}`);}
 function fit(){viewAdjusted=false;graphView={...graphBounds};applyView();}
 // Fit button: the wide map shows everything; the compact map returns to its fit-to-width size and the top.
 function fitView(){if(compact){setCompactScale(1);graphPane.scrollTo?.(0,0);}else fit();}
 function zoom(factor){fontScale=Math.max(.85,Math.min(1.6,fontScale*(factor<1?1.06:1/1.06)));element.style.setProperty('--worlds-font-scale',String(fontScale));if(compact){setCompactScale(compactScale/factor);return;}zoomView(factor);}
 function zoomView(factor){if(!graphView)return;viewAdjusted=true;const view=graphView,w=view.w*factor,height=view.h*factor;if(w<150||w>18000)return;graphView={x:view.x+(view.w-w)/2,y:view.y+(view.h-height)/2,w,h:height};applyView();}
 // The compact map is always as wide as the pane: zooming enlarges the chips and lays them out again in fewer columns.
 function setCompactScale(scale){const next=Math.max(.8,Math.min(2,scale));if(Math.abs(next-compactScale)<.01)return;const ratio=graphPane.scrollTop/Math.max(1,graphPane.scrollHeight);compactScale=next;viewStore.set('p2-worlds-compact-scale',String(next));draw();graphPane.scrollTop=ratio*graphPane.scrollHeight;}
 function toggleLayer(id){if(collapsedLayers.has(id))collapsedLayers.delete(id);else collapsedLayers.add(id);viewStore.set('p2-worlds-collapsed',JSON.stringify([...collapsedLayers]));draw();}
 function isCompact(){const w=element.clientWidth,height=element.clientHeight;return w>0&&(w<COMPACT_WIDTH||height>0&&height<380&&w<900);}
 function measuredSize(){const w=graphPane.clientWidth,height=graphPane.clientHeight;return w>=50&&height>=50?{w,h:height}:null;}
 const captionOf=(node,column)=>{let text=displayName(node);if(column.world&&typeof column.label==='string'&&text.toLowerCase().startsWith(column.label.toLowerCase()+' ')){text=text.slice(column.label.length+1);text=text.charAt(0).toUpperCase()+text.slice(1);}return text;};
 const recordOrder=(a,b)=>sharedRank(a.id)-sharedRank(b.id)||ENTRY_ORDER.indexOf(entryOf(a))-ENTRY_ORDER.indexOf(entryOf(b))||a.id.split(':')[0].localeCompare(b.id.split(':')[0])||displayName(a).localeCompare(displayName(b));
 // The map is laid out in the pane's own pixels: columns and rows fill the available width and height.
 function plan(size,areas,owners){
  const visible=data.nodes.filter(node=>!folds.has(node.id)),order=(a,b)=>sharedRank(a.id)-sharedRank(b.id)||ENTRY_ORDER.indexOf(entryOf(a))-ENTRY_ORDER.indexOf(entryOf(b))||a.id.split(':')[0].localeCompare(b.id.split(':')[0])||displayName(a).localeCompare(displayName(b));
  const columns=[{world:null,label:'Shared by all tabs'},...areas];
  const bands=[...layoutGroups.values()].filter(layer=>layer.members.length).map(layer=>{const cells=columns.map(column=>({column,members:visible.filter(node=>memberships.get(node.id)===layer.id&&(owners.get(node.id)??null)===column.world).sort(order)}));return {layer,cells,span:!areas.length||cells.slice(1).every(cell=>!cell.members.length)};});
  const pad=10,headerH=(areas.length?24:4)+34,bandHead=24,bandPad=6,bandGap=8,W=size.w-2*pad;
  const attempt=(sw,rh,tabW)=>{
   const sharedW=W-tabW*areas.length;
   let rows=0;const laid=bands.map(band=>{
    const cells=band.span?[{...band.cells[0],x:pad,width:W}]:band.cells.map((cell,index)=>({...cell,x:index?pad+sharedW+(index-1)*tabW:pad,width:index?tabW:sharedW}));
    for(const cell of cells){cell.perRow=Math.max(1,Math.floor(cell.width/sw));cell.rows=Math.ceil(cell.members.length/cell.perRow);}
    const bandRows=Math.max(0,...cells.map(cell=>cell.rows));rows+=bandRows;return {...band,cells,rows:bandRows};
   });
   const height=headerH+laid.reduce((sum,band)=>sum+bandHead+bandPad*2+Math.max(band.rows,.6)*rh,0)+bandGap*(laid.length-1)+pad*2;
   return {sw,rh,tabW,sharedW,laid,rows,height};
  };
  let chosen=null;
  search:for(const [sw,rh]of [[190,30],[170,30],[150,30],[132,30],[118,28],[104,26],[92,24]]){
   const widths=areas.length?[...new Set([Math.min(sw,(W-sw)/areas.length),130,110,92].map(width=>Math.floor(Math.min(sw,width))).filter(width=>width>=Math.min(92,sw)&&W-width*areas.length>=sw))]:[0];
   for(const tabW of widths.length?widths:[Math.max(40,Math.floor((W-sw)/areas.length))]){chosen=attempt(sw,rh,tabW);if(chosen.height<=size.h)break search;}
  }
  // Spare height widens the rows (up to 46 px) so the map uses the whole pane.
  if(chosen.height<size.h&&chosen.rows)chosen=attempt(chosen.sw,Math.min(46,chosen.rh+(size.h-chosen.height)/chosen.rows),chosen.tabW);
  return {...chosen,columns,pad,headerH,bandHead,bandPad,bandGap,W};
 }
 // Compact (phone) layout: each layer is a collapsible section with its record count; inside it every tab that has records
 // gets a small heading and its records flow as chips in as many columns as fit the width (two or more on a phone).
 // The map is always as wide as the pane and scrolls vertically; zoom enlarges the chips and recomputes the columns.
 function layoutCompact(size,areas,owners,background,captions){
  const scale=compactScale,width=size.w/scale,pad=10,W=width-2*pad,head=38,sub=22,rh=36,gap=8,chip=100;
  const perRow=Math.max(1,Math.floor((W-8)/chip)),pitch=(W-8)/perRow,visible=data.nodes.filter(node=>!folds.has(node.id));
  const columns=[{world:null,label:'Shared by all tabs'},...areas];
  let y=pad;
  for(const layer of layoutGroups.values()){
   if(!layer.members.length)continue;
   const collapsed=collapsedLayers.has(layer.id);
   const cells=columns.map(column=>({column,members:visible.filter(node=>memberships.get(node.id)===layer.id&&(owners.get(node.id)??null)===column.world).sort(recordOrder)})).filter(cell=>cell.members.length);
   const headed=cells.length>1||cells.length===1&&cells[0].column.world!==null;
   // Tabs with few records share a row (shelf packing in chip columns), so small groups never stack into one tall column.
   const shelves=[];for(const cell of cells){const span=Math.min(perRow,cell.members.length),rows=Math.ceil(cell.members.length/perRow),shelf=shelves.at(-1);
    if(shelf&&shelf.used+span<=perRow&&rows===1&&shelf.rows===1){cell.col=shelf.used;shelf.used+=span;shelf.cells.push(cell);}else{cell.col=0;shelves.push({used:span,rows,cells:[cell]});}cell.span=span;}
   const body=collapsed?0:shelves.reduce((sum,shelf)=>sum+(headed?sub:0)+shelf.rows*rh,0)+6;
   const height=head+body,group=svg('g',{'data-layout-group':layer.id,'data-collapsed':String(collapsed),style:'--world-color:#8eaecf'});
   group.append(svg('rect',{x:pad,y,width:W,height,rx:8,fill:'#1c2838','fill-opacity':'.72',stroke:'#6c86a23f'}));
   const toggle=svg('rect',{x:pad,y,width:W-64,height:head,rx:8,fill:'transparent',class:'p2-worlds-layer-toggle',tabindex:0,role:'button','aria-expanded':String(!collapsed),'aria-label':`${layer.label}, ${layer.members.length} records, ${collapsed?'expand':'collapse'}`,'data-layer-toggle':layer.id,style:'cursor:pointer'});
   toggle.addEventListener('click',event=>{event.stopPropagation();toggleLayer(layer.id);});toggle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLayer(layer.id);}});
   const chevron=svg('text',{x:pad+12,y:y+24,fill:'#9fb4cf','font-size':12},collapsed?'▸':'▾'),title=svg('text',{x:pad+28,y:y+24,fill:'#d2e1f3','font-size':14,'font-weight':600},layer.label);
   const count=svg('text',{x:pad+36+layer.label.length*8.6,y:y+24,fill:'#8fa5c0','font-size':12},String(layer.members.length));
   const about=svg('text',{x:pad+W-12,y:y+24,'text-anchor':'end',fill:'#9fc3ff','font-size':12,'text-decoration':'underline',class:'p2-worlds-layer-about',tabindex:0,role:'button','data-layer-about':layer.id,'aria-label':'What is in the '+layer.label+' layer?',style:'cursor:pointer'},'About');
   const openLayer=()=>openDetails({id:'ui:layer:'+layer.id,label:layer.label,kind:'component',implementation:'UI layout group',why:layer.description,description:layer.description,details:{records:layer.members.map(id=>displayName(actualNode(id)))}});
   about.addEventListener('click',event=>{event.stopPropagation();openLayer();});about.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLayer();}});
   group.append(toggle,chevron,title,count,about,svg('title',{},layer.description+' — UI layout only, not an additional runtime world.'));background.append(group);groupElements.set(layer.id,group);
   let measuredTitle=0;try{measuredTitle=title.getComputedTextLength();}catch{/* not laid out */}count.setAttribute('x',pad+36+(measuredTitle||layer.label.length*8.6));
   let top=y+head;
   if(!collapsed)for(const shelf of shelves){
    if(headed)background.append(svg('path',{d:`M ${pad+8} ${top+2} H ${pad+W-8}`,stroke:'#91a9c61f'}));
    for(const cell of shelf.cells){
     const left=pad+4+cell.col*pitch,label=`${cell.column.label} · ${cell.members.length}`,room=Math.max(4,Math.floor((cell.span*pitch-14)/6.4));
     if(headed)background.append(svg('text',{x:left+8,y:top+15,fill:'#a9bdd6','font-size':11,'font-weight':600,'data-column-label':cell.column.world??'shared'},label.length>room?label.slice(0,room-1)+'…':label));
     cell.members.forEach((node,position)=>{positions.set(node.id,{x:left+16+(position%perRow)*pitch,y:top+(headed?sub:0)+Math.floor(position/perRow)*rh+rh/2,pitch});captions.set(node.id,captionOf(node,cell.column));});
    }
    top+=(headed?sub:0)+shelf.rows*rh;
   }
   y+=height+gap;
  }
  // Room below the last layer for the floating legend and zoom controls.
  return {x:0,y:0,w:width,h:y-gap+pad+52};
 }
 // The status line can change the pane size while drawing; a second pass lays the map out in the final size.
 function draw(){for(const pass of [1,2]){drawPass();const settled=measuredSize();if(!settled||lastSize&&Math.abs(settled.w-lastSize.w)<=2&&Math.abs(settled.h-lastSize.h)<=2)break;}}
 function drawPass(){
  computeFolds();organize();positions=new Map();nodeElements.clear();groupElements.clear();graph.replaceChildren();tooltip.hidden=true;
  const defs=svg('defs'),marker=svg('marker',{id:'p2-worlds-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:4,markerHeight:4,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#91a5bd'}));const lit=marker.cloneNode(true);lit.id='p2-worlds-active-arrow';lit.firstChild.setAttribute('fill','#a5ffca');defs.append(marker,lit);graph.append(defs);
   compact=isCompact();element.classList.toggle('is-compact',compact);placeZoomControls();
   const measured=measuredSize(),size=measured??{w:900,h:560};lastSize=measured;
   const areas=declaredAreas(),owners=domainPlacement(areas),captions=new Map();
  const background=svg('g',{class:'p2-worlds-backgrounds'}),edgeLayer=svg('g',{class:'p2-worlds-edges'}),nodeLayer=svg('g',{class:'p2-worlds-nodes'});edgeLabelLayer=svg('g',{class:'p2-worlds-edge-labels'});graph.append(background,edgeLayer,nodeLayer,edgeLabelLayer);
   if(compact)graphBounds=layoutCompact(size,areas,owners,background,captions);else{
   const layout=plan(size,areas,owners),{pad,headerH,bandHead,bandPad,bandGap,W,rh}=layout;
   if(areas.length){const first=layout.laid.find(band=>!band.span)??layout.laid[0];for(const cell of first.cells.length>1?first.cells:[{x:pad,width:W,column:{label:'Shared by all tabs'}},...areas.map((area,index)=>({x:pad+layout.sharedW+index*layout.tabW,width:layout.tabW,column:area}))])background.append(svg('text',{x:cell.x+10,y:pad+headerH-8,fill:'#c3d4e9','font-size':13,'font-weight':600,'data-column-label':cell.column.world??'shared'},cell.column.label));}
   let y=pad+headerH;
  for(const band of layout.laid){
   const layer=band.layer,height=bandHead+bandPad*2+Math.max(band.rows,.6)*rh,group=svg('g',{'data-layout-group':layer.id,style:'--world-color:#8eaecf'});
   group.append(svg('rect',{x:pad,y,width:W,height,rx:8,fill:layer.id==='instances'?'#1b2c35':'#1c2838','fill-opacity':'.72',stroke:'#6c86a23f'}));
   const title=svg('text',{x:pad+10,y:y+17,fill:'#d2e1f3','font-size':13,'font-weight':600},layer.label),count=svg('text',{x:pad+18+layer.label.length*7.4,y:y+17,fill:'#8fa5c0','font-size':11},`${layer.members.length} records`);
   const about=svg('text',{x:pad+26+layer.label.length*7.4+((String(layer.members.length).length+8)*6),y:y+17,fill:'#9fc3ff','font-size':11,'text-decoration':'underline',class:'p2-worlds-layer-about',tabindex:0,role:'button','data-layer-about':layer.id,style:'cursor:pointer'},'What is in this layer?');
   const openLayer=()=>openDetails({id:'ui:layer:'+layer.id,label:layer.label,kind:'component',implementation:'UI layout group',why:layer.description,description:layer.description,details:{records:layer.members.map(id=>displayName(actualNode(id)))}});
   about.addEventListener('click',event=>{event.stopPropagation();openLayer();});about.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLayer();}});
   group.append(title,count,about,svg('title',{},layer.description+' — UI layout only, not an additional runtime world.'));background.append(group);groupElements.set(layer.id,group);
   const top=y+bandHead+bandPad;
   band.cells.forEach((cell,index)=>{
    if(!band.span&&index)background.append(svg('path',{d:`M ${cell.x} ${top-2} V ${y+height-6}`,stroke:'#91a9c61f'}));
    const pitch=cell.width/cell.perRow;
    cell.members.forEach((node,position)=>{positions.set(node.id,{x:cell.x+16+(position%cell.perRow)*pitch,y:top+Math.floor(position/cell.perRow)*rh+rh/2,pitch});captions.set(node.id,captionOf(node,cell.column));});
   });
   y+=height+bandGap;
  }
  const total=y-bandGap+pad;
   graphBounds=total<=size.h?{x:0,y:0,w:size.w,h:size.h}:{x:-(total*size.w/size.h-size.w)/2,y:0,w:total*size.w/size.h,h:total};
   }
   graph.style.height=compact?Math.ceil(graphBounds.h*compactScale)+'px':'';if(compact)viewAdjusted=false;
  // One line per related pair of shown records; lines at busy hubs stay hidden until a record is pointed at.
  const pairs=new Map();
  for(const edge of data.edges){const from=visibleOf(edge.from),to=visibleOf(edge.to);if(from===to||!positions.has(from)||!positions.has(to))continue;const key=from+'\n'+to;if(!pairs.has(key))pairs.set(key,{from,to,labels:[]});const labels=pairs.get(key).labels,label=edge.label??'connected';if(!labels.includes(label))labels.push(label);}
  const degree=new Map();for(const {from,to}of pairs.values())for(const id of [from,to])degree.set(id,(degree.get(id)??0)+1);
  for(const pair of pairs.values()){
   const a=positions.get(pair.from),b=positions.get(pair.to),length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,bend=Math.min(36,length*.12);
   const cx=(a.x+b.x)/2-uy*bend,cy=(a.y+b.y)/2+ux*bend,busy=(degree.get(pair.from)??0)>10||(degree.get(pair.to)??0)>10;
   const path=svg('path',{d:`M ${a.x+ux*9} ${a.y+uy*9} Q ${cx} ${cy} ${b.x-ux*10} ${b.y-uy*10}`,class:'p2-worlds-edge'+(busy?' is-background':''),'marker-end':'url(#p2-worlds-arrow)','data-edge-from':pair.from,'data-edge-to':pair.to,'data-edge-label':pair.labels.join(' · '),'data-mid':`${(a.x+2*cx+b.x)/4},${(a.y+2*cy+b.y)/4}`});
   path.append(svg('title',{},`${displayName(actualNode(pair.from))} → ${displayName(actualNode(pair.to))}: ${pair.labels.join(' · ')}`));edgeLayer.append(path);
  }
  for(const node of data.nodes){
   const position=positions.get(node.id);if(!position)continue;
   const type=roleOf(node),usage=effectiveUsage(node),{color}=entryMeta(node),inside=parts.get(node.id)?.length??0;
   const group=svg('g',{transform:'translate('+position.x+','+position.y+')',class:'p2-worlds-node',tabindex:0,role:'button',
    'aria-label':displayName(node)+', '+type+', '+(node.implementation??''),'data-world-node':node.id,'data-world-role':type,
    'data-layer':memberships.get(node.id),...(node.audit?{'data-audit-badge':node.audit.badge,'data-activity-hook':node.audit.activityHook?'declared':'none'}:{}),'data-representation':representationOf(node),'data-usage':usage??'unknown',style:'--world-color:'+color});
   group.classList.toggle('active',active.has(node.id));
   const budget=Math.max(6,Math.floor((position.pitch-30)/6.1)),lines=captionLines(captions.get(node.id),budget);
   const label=svg('text',{x:13,y:lines.length>1?-2:4,fill:'#d6e2f0','font-size':11,class:'p2-worlds-caption','data-caption':''});
   lines.forEach((line,index)=>label.append(svg('tspan',{x:13,dy:index?12:0},line)));
   group.append(svg('rect',{x:-11,y:compact?-16:-13,width:Math.max(24,position.pitch-8),height:compact?32:26,rx:5,class:'p2-worlds-hit'}),worldGlyph(node,usage),...auditMarks(node),label,
    svg('title',{},[displayName(node),node.id,type,node.implementation,inside?`Contains ${inside} more records (listed in its details)`:null].filter(Boolean).join('\n')));
   const activate=()=>openDetails(node);group.addEventListener('click',activate);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});group.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showTooltip(node,event);});group.addEventListener('pointermove',event=>positionTooltip(event));group.addEventListener('pointerleave',()=>{tooltip.hidden=true;highlight(null);});group.addEventListener('focus',()=>highlight(node.id));group.addEventListener('blur',()=>highlight(null));nodeElements.set(node.id,group);nodeLayer.append(group);
  }
  graph.setAttribute('preserveAspectRatio','xMidYMin meet');
  renderLegend();if(!data.nodes.length)legend.append(h('span',{text:'No runtime records returned.'}));if(!graphView||!viewAdjusted)fit();else applyView();updateSearch();applyPlaybackHighlight();
 }
 function renderLegend(){
  const groups=new Map(),details=h('details',{open:legendOpen,'data-worlds-legend':''}),list=h('div',{class:'p2-worlds-legend-grid'});
  for(const node of data.nodes){
   if(folds.has(node.id))continue;const usage=effectiveUsage(node),key=glyphKey(node,usage),row=groups.get(key);
   if(row)row.count++;else groups.set(key,{node,usage,count:1});
  }
  // One row per kind of record on the map, in its own colour; a hollow row for a kind with records not used in this session.
  const rows=[...groups.values()].sort((a,b)=>ENTRY_ORDER.indexOf(entryOf(a.node))-ENTRY_ORDER.indexOf(entryOf(b.node))||(a.usage==='available')-(b.usage==='available'));
  for(const {node,usage,count} of rows){
   const entry=entryOf(node),meta=ENTRIES[entry],hollow=usage==='available';
   const sample=svg('svg',{class:'p2-worlds-legend-symbol',viewBox:'-11 -11 22 22','aria-hidden':true});sample.append(worldGlyph(node,usage));
   list.append(h('article',{class:'p2-worlds-legend-item','data-legend-entry':entry,'data-legend-family':meta.family,'data-legend-fill':hollow?'hollow':'filled'},
    sample,h('div',{},h('strong',{text:`${meta.label}${hollow?' · not used in this session':''} (${count})`}),h('p',{text:hollow?'Present in the catalog; none of its sources were read in this session.':meta.meaning}))));
  }
  const audited=data.nodes.filter(node=>node.audit&&!folds.has(node.id)),badgeRows=[];
  for(const [badge,[letter,color,meaning]]of Object.entries(BADGES).filter(([badge])=>badge==='domain-logic')){const count=audited.filter(node=>node.audit.badge===badge).length;if(!count)continue;const sample=svg('svg',{viewBox:'-10 -10 20 20','aria-hidden':true});const g=svg('g');g.append(svg('circle',{r:6,fill:color}),svg('text',{x:0,y:3,'text-anchor':'middle','font-size':8,'font-weight':700,fill:'#141b25'},letter));sample.append(g);badgeRows.push(h('div',{class:'p2-worlds-legend-badge','data-legend-badge':badge},sample,h('span',{text:`Badge ${letter} (${count}): ${meaning}`})));}
  details.append(h('summary',{},h('strong',{text:'Legend'}),h('span',{text:groups.size+' kinds on this map'})),list,...badgeRows,
   h('p',{class:'p2-worlds-legend-note',text:'Colour: what kind of thing the record is. All JavaScript is one kind (orange, badge D for domain logic); SOP Worlds have one colour per kind, in shades of their family. Rows: Native Layer, rules and policies (SOP), instances, knowledge, schemas. Columns: the tab that owns it, or Shared. Point at a record to see its links; records with source files or schemas list them in their details. About this view: the map is a snapshot the worker reads between actions (it waits for a running turn), so during a long action it shows the previous state; Refresh reads it again. The worker and this page each retain the last 300 activity events; Copy retained log copies the page\'s.'}));
   details.addEventListener('toggle',()=>setLegendOpen(details.open));
   legend.classList.toggle('is-open',legendOpen);legend.replaceChildren(legendClose,details);
 }
 // The legend opens as an overlay (a bottom sheet on a phone) and always closes again: × button, tap outside, Escape or Back.
 // Its open state is remembered for the session; on the compact map opening it adds one history entry, so Back closes it.
 function setLegendOpen(open,{fromPop=false}={}){
  open=!!open;const details=legend.querySelector('[data-worlds-legend]');if(details&&details.open!==open)details.open=open;
  legend.classList.toggle('is-open',open);if(legendOpen===open)return;legendOpen=open;viewStore.set('p2-worlds-legend',open?'open':'closed');
  if(open&&compact&&!legendHistory){try{history.pushState({...(history.state??{}),p2worldsLegend:true},'',location.href);legendHistory=true;}catch{/* no history */}}
  else if(!open&&legendHistory){legendHistory=false;if(!fromPop){try{history.back();}catch{/* no history */}}}
 }
 function placeZoomControls(){if(compact){if(zoomControls.parentNode!==mapShell)mapShell.append(zoomControls);}else if(zoomControls.parentNode!==toolbar)toolbar.insertBefore(zoomControls,toolbar.querySelector('[data-worlds-links]'));}
 function updateSearch(){
  for(const [id,group]of nodeElements)group.classList.toggle('dim',!(matches(actualNode(id))||(parts.get(id)??[]).some(part=>matches(actualNode(part)))));
  const count=data.nodes.filter(matches).length;setStatus(`${data.nodes.length} records (${nodeElements.size} on the map) · ${data.edges.length} links${query?' · '+count+' matches':''}`);
 }
 function showTooltip(node,event){const inside=parts.get(node.id)?.length??0;tooltip.replaceChildren(h('strong',{text:displayName(node)}),...(node.label&&node.label!==displayName(node)?[h('span',{text:node.label})]:[]),h('span',{text:node.id}),h('span',{text:roleOf(node)}),h('span',{text:typeof node.implementation==='string'?node.implementation:JSON.stringify(node.implementation??'')}));if(node.status)tooltip.append(h('span',{text:'Status: '+node.status}));if(USAGE[effectiveUsage(node)])tooltip.append(h('span',{text:USAGE[effectiveUsage(node)][1]}));if(inside)tooltip.append(h('span',{text:`Contains ${inside} more records; click to list them.`}));if(node.why)tooltip.append(h('span',{text:node.why}));tooltip.hidden=false;positionTooltip(event);highlight(node.id);}
 function positionTooltip(event){const bounds=graphPane.getBoundingClientRect();const x=Math.max(8,Math.min(bounds.width-tooltip.offsetWidth-8,event.clientX-bounds.left+16)),y=Math.max(8,Math.min(bounds.height-tooltip.offsetHeight-8,event.clientY-bounds.top+16));tooltip.style.left=x+'px';tooltip.style.top=y+graphPane.scrollTop+'px';}
 function highlight(id){
  graph.classList.toggle('highlighting',!!id);edgeLabelLayer?.replaceChildren();
  const lines=[...graph.querySelectorAll('[data-edge-from]')],connected=lines.filter(line=>!!id&&(line.dataset.edgeFrom===id||line.dataset.edgeTo===id));
  for(const line of lines)line.classList.toggle('connected',connected.includes(line));
  // Relationship names appear for a record with few links, placed on each line and never on top of each other.
  if(!edgeLabelLayer||connected.length>10)return;const placed=[];
  for(const line of connected){
   const [x,y]=line.dataset.mid.split(',').map(Number),text=line.dataset.edgeLabel.length>48?line.dataset.edgeLabel.slice(0,47)+'…':line.dataset.edgeLabel,box={x:x-text.length*2.8,y:y-9,w:text.length*5.6,h:12};
   if(placed.some(other=>box.x<other.x+other.w&&other.x<box.x+box.w&&box.y<other.y+other.h&&other.y<box.y+box.h))continue;placed.push(box);
   edgeLabelLayer.append(svg('text',{x,y,'text-anchor':'middle',class:'p2-worlds-edge-label','font-size':10},text));
  }
 }
 function closeDetails(){currentPage='map';dialog.hidden=true;logPanel.hidden=true;mapShell.hidden=false;renderPageBreadcrumbs();applyView();}
 function showActivityLog(){currentPage='log';dialog.hidden=true;mapShell.hidden=true;logPanel.hidden=false;renderPageBreadcrumbs();renderEvents();}
 function openDetails(node,tab='overview',path=[],page=0){
  const previous=currentPage==='detail'?currentDetail:null,ancestorIndex=previous?.ancestors?.findIndex(ancestor=>ancestor.node.id===node.id)??-1,ancestors=ancestorIndex>=0?previous.ancestors.slice(0,ancestorIndex):previous&&previous.node.id!==node.id?[...(previous.ancestors??[]),{node:previous.node,tab:previous.tab,path:[...previous.path],page:previous.page}]:previous?.ancestors??[];
  currentDetail={node,tab,path:[...path],page,ancestors,origin:previous?.origin??(currentPage==='log'?'log':'map')};currentPage='detail';mapShell.hidden=true;logPanel.hidden=true;dialog.hidden=false;renderDetail();
  if(tab==='sop'&&hasSopSource(node)&&!(typeof node.wires==='string'&&node.wires.trim())&&typeof loadSources==='function'&&!sourceResponses.has(node.id)&&!sourceLoading.has(node.id))void fetchSources(node,0);
 }
 function visitDetail({tab=detailState().tab,path=detailState().path,page=0}={}){openDetails(detailState().node,tab,path,page);}
 function renderPageBreadcrumbs(){
  element.classList.toggle('is-map-page',currentPage==='map');
  detailBreadcrumbs.replaceChildren(link('Worlds map',closeDetails,{'data-breadcrumb-map':'','aria-current':currentPage==='map'?'page':undefined}));
  if(currentPage==='log'){detailBreadcrumbs.append(h('span',{text:'›'}),h('strong',{text:'Activity log','aria-current':'page'}));return;}
  if(currentPage!=='detail')return;const state=currentDetail;
  if(state.origin==='log')detailBreadcrumbs.append(h('span',{text:'›'}),link('Activity log',showActivityLog,{'data-breadcrumb-log':''}));
  for(const ancestor of state.ancestors??[])detailBreadcrumbs.append(h('span',{text:'›'}),link(displayName(ancestor.node),()=>openDetails(ancestor.node,ancestor.tab,ancestor.path,ancestor.page),{'data-breadcrumb-node':ancestor.node.id}));
  detailBreadcrumbs.append(h('span',{text:'›'}),link(displayName(state.node),()=>visitDetail({tab:'overview',path:[]}),{'data-breadcrumb-current':state.node.id}));
  if(['properties','implementation'].includes(state.tab)){
   detailBreadcrumbs.append(h('span',{text:'›'}),link(state.tab==='implementation'?'Implementation metadata':'Properties',()=>visitDetail({path:[]}),{'data-breadcrumb-root':''}));state.path.forEach((key,index)=>detailBreadcrumbs.append(h('span',{text:'›'}),link(String(key),()=>visitDetail({path:state.path.slice(0,index+1)}),{'data-breadcrumb-path':String(index)})));
  }else detailBreadcrumbs.append(h('span',{text:'›'}),h('strong',{text:state.tab==='activity'?'Exact event':state.tab==='sop'?'SOP Lang':state.tab==='schema'?'Schema / legend':state.tab==='overview'?'Why':state.tab, 'aria-current':'page'}));
 }
 function detailState(){return currentDetail;}
 function copyButton(label,text){return button(label,async event=>{const target=event.currentTarget;try{await copy(text);if(!disposed&&target.isConnected)target.textContent='Copied';}catch(error){setStatus('Copy failed: '+error.message,true);}});}
 function renderDetail(){
  const state=detailState();if(!state)return;const node=state.node;dialogTitle.textContent=displayName(node);dialogSubtitle.textContent=`${roleOf(node)} · ${node.id}`;detailTabs.replaceChildren();dialogBody.replaceChildren();renderPageBreadcrumbs();
  const tabs=[...(node.activityEvent?[['activity','Exact event']]:[]),...(node.schemaView?.status==='parsed declarations'?[['schema','Schema / legend']]:[]),...(isSopRecord(node)?[['overview','Why'],...(hasSopSource(node)?[['sop','SOP Lang']]:[]),['connections','Connections'],...(hasTools(node)?[['tools','Tools']]:[]),...(node.details!==undefined?[['implementation','Implementation metadata (JavaScript)']]:[])]:[['overview','Why'],...(node.details!==undefined?[['properties','Properties']]:[]),...(hasTools(node)?[['tools','Tools']]:[]),['connections','Connections'],['raw','Raw record']])];for(const [id,label] of tabs)detailTabs.append(button(label,()=>visitDetail({tab:id}),{role:'tab','aria-selected':String(state.tab===id),'data-detail-tab':id}));
  if(state.tab==='activity')renderActivity(node.activityEvent);
  else if(state.tab==='schema')renderSchema(node);
  else if(state.tab==='overview'){
   renderOverview(node,state);
  }else if(state.tab==='properties'||state.tab==='implementation'){if(state.tab==='implementation')dialogBody.append(h('p',{class:'p2-worlds-note',text:'JavaScript inspection metadata, separate from the SOP declarations. These fields come from the loader or native runtime; this view does not turn them into SOP facts.'}));renderProperties(node.details??{},state);}
  else if(state.tab==='sop')renderSop(node);
  else if(state.tab==='tools')renderTools(node.tools,state);
  else if(state.tab==='connections')renderConnections(node);
  else{dialogBody.append(h('h3',{text:'Complete runtime record'}),h('p',{class:'p2-worlds-detail-summary',text:'Exact record received by the inspector, including all fields. All fields are retained.'}));const raw=JSON.stringify(node,null,2);if(copy)dialogBody.append(copyButton('Copy raw record',raw));dialogBody.append(h('pre',{class:'p2-worlds-raw',text:raw}));}
 }
 function renderOverview(node,state){
  const help=node.help??{},usage=effectiveUsage(node);
  dialogBody.append(h('p',{class:'p2-worlds-why',text:node.why??help.purpose??node.description??'No explanation has been supplied for this record.'}));
  const status=[node.status,node.implementation,isSopRecord(node)&&!hasSopSource(node)?'Declared definition; SOP source is unavailable. See schema connections.':null].filter(value=>typeof value==='string'&&value).join(' · ');
  if(status)dialogBody.append(h('p',{class:'p2-worlds-detail-summary',text:status}));
  if(USAGE[usage])dialogBody.append(h('p',{class:'p2-worlds-usage','data-usage-label':usage},h('strong',{text:USAGE[usage][1]+' · '}),usage!==node.usage?USAGE[usage][2]:node.usageReason??USAGE[usage][2]));
  if(node.audit)renderAudit(node.audit);
  const inside=(parts.get(node.id)??[]).map(actualNode).filter(Boolean);
  if(inside.length){const list=h('p',{class:'p2-worlds-detail-parts','data-detail-parts':''});inside.forEach((part,index)=>{if(index)list.append(' · ');list.append(link(displayName(part),()=>openDetails(part),{'data-open-part':part.id}));});dialogBody.append(h('h3',{text:`Shown inside this record on the map (${inside.length})`}),list);}
  const links=h('p',{class:'p2-worlds-detail-links'},link('Connections',()=>visitDetail({tab:'connections'})));
  if(node.details!==undefined)links.append(' · ',link('Properties',()=>visitDetail({tab:isSopRecord(node)?'implementation':'properties'})));
  links.append(' · ',link('Complete inspection record',()=>openDetails({id:node.id+'/inspection-record',label:displayName(node)+' · inspection record',kind:'structure',representation:'javascript',implementation:'JavaScript inspection record',why:'Every field returned for this record, including source metadata and help.',details:node},'properties')));dialogBody.append(links);
 }
 // Generality audit of a JavaScript component: its modules, the decisions they make, evidence, replacement and hidden behaviour.
 function renderAudit(audit){
  const [letter,,meaning]=BADGES[audit.badge]??BADGES.generic;
  dialogBody.append(h('h3',{text:'Generality audit · badge '+letter}),h('p',{class:'p2-worlds-detail-summary','data-audit-summary':audit.badge,text:meaning+' '+(audit.activityHook?'Activity hook: lights up for '+[...(audit.activity.operations??[]).map(operation=>'operation '+operation),...(audit.activity.nodeIds??[]).map(id=>'events naming '+id)].join(', ')+'.':'No activity hook: it can act without lighting up the map.')}));
  if(audit.actsOn?.length){const list=h('p',{class:'p2-worlds-detail-links'});audit.actsOn.forEach(([id,label],index)=>{if(index)list.append(' · ');const target=actualNode(id);list.append(target?link(label+': '+displayName(target),()=>openDetails(target),{'data-audit-target':id}):h('span',{text:label+': '+id}));});dialogBody.append(h('h4',{text:'Acts on'}),list);}
  const table=h('table',{class:'p2-worlds-audit-table','data-audit-modules':''}),head=h('tr');for(const title of ['Module','Class','Decision','Evidence','SOP replacement','Hidden behaviour'])head.append(h('th',{text:title}));table.append(head);
  for(const module of audit.modules){const row=h('tr',{'data-audit-module':module.path});row.append(h('td',{text:module.path}),h('td',{class:module.classification==='domain-logic'?'is-domain':'is-generic',text:module.classification+(module.generality&&module.generality!=='none'?' ('+module.generality+')':'')}),h('td',{text:module.decision??''}),h('td',{text:(module.evidence??[]).join('\n')}),h('td',{text:module.replacement??''}),h('td',{class:'p2-worlds-audit-secret',text:(module.secret??[]).join('\n')}));table.append(row);}
  dialogBody.append(h('h4',{text:`Modules (${audit.modules.length})`}),table);
 }
 function renderSop(node){
  if(!hasSopSource(node)){dialogBody.append(h('p',{text:'No declared SOP source is available for this record.'}));return;}
  const response=sourceResponses.get(node.id),sources=response?.sources?.filter(source=>source.language==='sop'&&typeof source.text==='string')??[];
  const selected=sources.find(source=>source.path===selectedSourcePaths.get(node.id))??sources.find(source=>/(^|\/)schema\.sop$/.test(source.path))??sources.find(source=>source.role==='schema')??sources[0];
  dialogBody.append(h('h3',{text:typeof node.wires==='string'&&node.wires.trim()||selected?.text.length>0?'Exact SOP Lang':'SOP sources'}));
  if(typeof node.wires==='string'&&node.wires.trim().length>0){
   if(copy)dialogBody.append(copyButton('Copy SOP Lang',node.wires));
   dialogBody.append(h('pre',{class:'p2-worlds-wires',text:node.wires}));return;
  }
  if(sources.length){
   dialogBody.append(h('p',{class:'p2-worlds-detail-summary',text:`${sources.length}${Number.isSafeInteger(response.totalFiles)?' of '+response.totalFiles:''} files fetched for inspection. Reading source does not initialize or execute a world.`}));
   selectedSourcePaths.set(node.id,selected.path);const files=h('nav',{class:'p2-worlds-source-files','aria-label':'SOP source files'});
   for(const source of sources)files.append(link(source.path,()=>{selectedSourcePaths.set(node.id,source.path);queueMicrotask(renderDetail);},{'data-source-file':source.path,'aria-current':source.path===selected.path?'page':undefined}));
   dialogBody.append(files,h('h4',{class:'p2-worlds-selected-source',text:selected.path}));
   if(copy)dialogBody.append(copyButton('Copy SOP source',selected.text));
   if(!selected.text.length)dialogBody.append(h('p',{class:'p2-worlds-detail-summary',text:'This declared source file is empty.'}));
   dialogBody.append(h('pre',{class:'p2-worlds-wires','data-source-path':selected.path,text:selected.text}));
   dialogBody.append(h('p',{},link('Source inspection metadata',()=>openDetails({id:node.id+'/source-inspection',label:displayName(node)+' · source inspection',kind:'structure',representation:'javascript',why:'Retained file records and metadata from source inspection; no compilation is performed.',details:response},'properties'))));
   if(response.nextOffset!==null&&response.nextOffset!==undefined)dialogBody.append(button(sourceLoading.has(node.id)?'Loading more sources…':'Load more SOP files',()=>void fetchSources(node,response.nextOffset),{disabled:sourceLoading.has(node.id),'data-load-more-sop':node.id}));
   if(response.error)dialogBody.append(h('p',{role:'alert',text:String(response.error)}));
   if(response.errors?.length)dialogBody.append(h('p',{role:'alert',text:response.errors.map(error=>typeof error==='string'?error:JSON.stringify(error)).join(' · ')}));return;
  }
  dialogBody.append(h('p',{text:response?.status==='unavailable'?'Declared SOP source is unavailable.':'SOP source is not loaded. This is not an empty world or an empty source file.'}));
  for(const source of node.sourceFiles??[])dialogBody.append(h('p',{class:'p2-worlds-detail-summary',text:source.path+(source.role?' · '+source.role:'')}));
  if(typeof loadSources==='function'&&!sourceLoading.has(node.id))dialogBody.append(button(sourceResponses.has(node.id)?'Retry SOP source':'Load SOP source',()=>void fetchSources(node,0),{'data-load-sop-source':node.id}));
  if(sourceLoading.has(node.id))dialogBody.append(h('p',{role:'status',text:'Loading declared source for inspection…'}));
  if(response?.error)dialogBody.append(h('p',{role:'alert',text:String(response.error)}));
  if(response?.errors?.length)dialogBody.append(h('p',{role:'alert',text:response.errors.map(error=>typeof error==='string'?error:JSON.stringify(error)).join(' · ')}));
 }
 async function fetchSources(node,offset){
  if(disposed||sourceLoading.has(node.id))return;sourceLoading.add(node.id);queueMicrotask(renderDetail);
  try{const result=await loadSources(node,{offset});if(result?.nodeId!==node.id)throw Error('Source response identity mismatch.');
   const previous=offset?sourceResponses.get(node.id)?.sources??[]:[],sources=[...previous,...(result.sources??[])];sourceResponses.set(node.id,{...result,sources});
  }catch(error){sourceResponses.set(node.id,{...sourceResponses.get(node.id),status:'unavailable',error:String(error.message??error)});}
  finally{sourceLoading.delete(node.id);if(!disposed){const group=nodeElements.get(node.id),usage=effectiveUsage(node);if(group){group.setAttribute('data-usage',usage??'unknown');group.querySelector('.p2-worlds-glyph')?.replaceWith(worldGlyph(node,usage));}if(currentDetail?.node.id===node.id)queueMicrotask(renderDetail);}}
 }
 function renderSchema(node){
  const view=node.schemaView;dialogBody.append(h('h3',{text:'Schema and legend declarations'}),h('p',{class:'p2-worlds-detail-summary',text:isSopRecord(node)?'Readable index of the actual declarations. SOP Lang retains the exact source.':'Runtime-provided schema metadata. This implementation record does not expose SOP source.'}));
  const identity=h('dl');for(const [label,value]of [['Source status',view.status],['Declared role',node.details?.role],['Complete state schema',node.details?.completeStateSchema],['Declared schema world',node.details?.schemaWorld]])if(value!==undefined)identity.append(h('dt',{text:label}),h('dd',{text:String(value)}));dialogBody.append(identity);
  if(view.error)dialogBody.append(h('p',{class:'p2-worlds-note',text:view.error}));
  dialogBody.append(h('h3',{text:'Connection to natural language'}),h('p',{class:'p2-worlds-note',text:view.languageStatus??'No language evidence was supplied.'}));
  const attrs=entry=>entry.attributes??{};
  const values=(entry,key)=>(attrs(entry)[key]??[]).join(' ');
  const kind=entry=>values(entry,'of')||entry.id;
  const sourceDetails=entry=>h('details',{},h('summary',{text:'SOP declaration · '+entry.id}),h('pre',{text:entry.wire??''}));
  function table(title,entries,columns){
   const section=h('section',{'data-schema-section':title},h('h3',{text:title+' ('+entries.length+')'}));if(!entries.length){section.append(h('p',{class:'p2-worlds-detail-summary',text:'No matching declarations in this source.'}));dialogBody.append(section);return;}
   const table=h('table',{class:'p2-worlds-property-table'},h('thead',{},h('tr',{},...columns.map(([label])=>h('th',{text:label}))))),body=h('tbody');table.append(body);
   for(const entry of entries){const row=h('tr',{'data-declaration-id':entry.id});for(const [,value]of columns)row.append(h('td',{text:value(entry)||'Not declared'}));body.append(row);const detail=h('td',{colspan:columns.length},sourceDetails(entry));body.append(h('tr',{},detail));}section.append(table);dialogBody.append(section);
  }
  table('Legends and modules',[...(view.legends??[]),...(view.modules??[])],[['Declaration',entry=>entry.id],['Predicate',entry=>entry.predicate],['Declared fields',entry=>Object.entries(attrs(entry)).map(([key,value])=>key+'='+value.join(' ')).join(' · ')]]);
  table('Types',view.types??[],[['Type',kind],['Parent types',entry=>values(entry,'extends')],['Declared explanation',entry=>entry.documentation??values(entry,'meaning')]]);
  table('Slots and keys',view.slots??[],[['Owner / key',entry=>(values(entry,'of')||values(entry,'for'))+' / '+(values(entry,'key')||entry.id)],['Kind / referenced type',entry=>[values(entry,'kind'),values(entry,'type')].filter(Boolean).join(' · ')],['Declared constraints',entry=>Object.entries(attrs(entry)).filter(([key])=>!['of','for','key','kind','type','doc'].includes(key)).map(([key,value])=>key+'='+value.join(' ')).join(' · ')],['Declared explanation',entry=>entry.documentation]]);
  table('Native tool operations',view.tools??[],[['Operation',entry=>values(entry,'id')||entry.id],['Act',entry=>values(entry,'act')],['Target type',entry=>values(entry,'on')]]);
  const operations=new Map((view.tools??[]).map(entry=>[entry.id,values(entry,'id')||entry.id]));
  table('Native tool parameters',view.parameters??[],[['Operation / parameter',entry=>(operations.get(values(entry,'operation').replace(/^\$/,''))||values(entry,'operation'))+' / '+values(entry,'name')],['Declared type',entry=>values(entry,'type')],['Declared constraints',entry=>Object.entries(attrs(entry)).filter(([key])=>!['operation','name','type','definition'].includes(key)).map(([key,value])=>key+'='+value.join(' ')).join(' · ')]]);
  table('Language declarations',view.language??[],[['Declaration',entry=>entry.id],['Predicate',entry=>entry.predicate],['Exact declared fields',entry=>Object.entries(attrs(entry)).map(([key,value])=>key+'='+value.join(' ')).join(' · ')]]);
  table('Declared documentation',view.documentation??[],[['Declaration',entry=>entry.id],['Predicate',entry=>entry.predicate],['Explanation from source',entry=>entry.documentation]]);
 }
 function renderProperties(root,state){
  let value=root;for(const key of state.path){if(value!==null&&typeof value==='object'&&Object.hasOwn(value,key))value=value[key];else{state.path=[];value=root;break;}}
  if(value===null||typeof value!=='object'){dialogBody.append(h('h3',{text:'Property value'}),h('p',{class:'p2-worlds-property-type',text:valueType(value)}),h('div',{class:'p2-worlds-scalar',text:textOf(value)}));return;}
  const path=h('nav',{class:'p2-worlds-property-path','aria-label':'Property location'},link('Properties',()=>visitDetail({path:[]})));state.path.forEach((key,index)=>path.append(h('span',{text:'›'}),link(String(key),()=>visitDetail({path:state.path.slice(0,index+1)}))));dialogBody.append(path);
  const entries=entriesOf(value);if(value===null||typeof value!=='object'){dialogBody.append(h('h3',{text:state.path.at(-1)??'Value'}),h('span',{class:'p2-worlds-property-type',text:valueType(value)}),h('p',{class:'p2-worlds-scalar',text:textOf(value)}));return;}
  const pages=Math.max(1,Math.ceil(entries.length/40));state.page=Math.min(state.page,pages-1);dialogBody.append(h('p',{class:'p2-worlds-nav-summary',text:`${valueType(value)} · ${entries.length} ${Array.isArray(value)?'items':'properties'}. Open an object or array to inspect its contents; values retain their original types.`}));
  const table=h('table',{class:'p2-worlds-property-table'},h('thead',{},h('tr',{},h('th',{text:Array.isArray(value)?'Index':'Property'}),h('th',{text:'Type'}),h('th',{text:'Value'})))),body=h('tbody');table.append(body);
  for(const [key,child] of entries.slice(state.page*40,(state.page+1)*40)){const structured=child!==null&&typeof child==='object',preview=structured?`${entriesOf(child).length} ${Array.isArray(child)?'items':'properties'} ›`:textOf(child),cell=h('td');if(structured)cell.append(link(preview,()=>visitDetail({path:[...state.path,key]}),{'data-property-open':String(key)}));else cell.append(h('span',{class:'p2-worlds-scalar',text:preview}));body.append(h('tr',{},h('td',{text:key}),h('td',{class:'p2-worlds-property-type',text:valueType(child)}),cell));}
  dialogBody.append(table);if(pages>1)dialogBody.append(h('div',{class:'p2-worlds-modal-actions'},button('Previous properties',()=>visitDetail({page:state.page-1}),{disabled:state.page===0}),h('span',{text:`${state.page*40+1}–${Math.min(entries.length,(state.page+1)*40)} of ${entries.length}`}),button('Next properties',()=>visitDetail({page:state.page+1}),{disabled:state.page>=pages-1})));if(!entries.length)dialogBody.append(h('p',{text:Array.isArray(value)?'Empty array.':'Empty object.'}));
 }
 function renderTools(tools,state){
  if(tools===undefined||tools===null){dialogBody.append(h('p',{text:'No tools are attached to this record.'}));return;}
  const entries=Array.isArray(tools)?tools.map((value,index)=>[String(index),value]):typeof tools==='object'?Object.entries(tools):[['tools',tools]];
  dialogBody.append(h('p',{class:'p2-worlds-nav-summary',text:`${entries.length} declared tools / capability entries. Each parameter comes directly from the declaration. Open a tool for all its metadata.`}));
  for(const [key,tool] of entries){
   const label=tool?.operation??tool?.name??tool?.id??key,card=h('article',{class:'p2-worlds-tool-card'},h('h4',{text:label}));if(tool?.description)card.append(h('p',{text:tool.description}));
   const facts=h('dl');for(const [name,value]of [['Act',tool?.act],['On',tool?.on]])if(value!==undefined)facts.append(h('dt',{text:name}),h('dd',{text:textOf(value)}));if(facts.children.length)card.append(facts);
   const params=tool?.params??tool?.parameters;if(params&&typeof params==='object'){
    const table=h('table',{class:'p2-worlds-property-table'},h('thead',{},h('tr',{},h('th',{text:'Parameter'}),h('th',{text:'Type'}),h('th',{text:'Requirements / values'})))),body=h('tbody');table.append(body);
    for(const [name,param]of Object.entries(params)){const constraints=param&&typeof param==='object'?Object.entries(param).filter(([key])=>key!=='type').map(([key,value])=>key+': '+textOf(value)).join(' · '):textOf(param);body.append(h('tr',{},h('td',{text:name}),h('td',{class:'p2-worlds-property-type',text:param?.type??valueType(param)}),h('td',{text:constraints||'No further constraints declared'})));}card.append(table);
   }
   card.append(h('div',{class:'p2-worlds-modal-actions'},link('Inspect complete tool',()=>openDetails({id:state.node.id+'/tool/'+key,label:String(label),kind:'component',representation:'javascript',implementation:'Declared tool interface metadata',description:'Exact tool entry attached to '+state.node.id,details:tool},'properties'))));dialogBody.append(card);
  }
 }
 function renderConnections(node){
  const edges=node.activityEvent?(node.activityEvent.nodeIds??[]).map(id=>({from:node.id,to:id,label:'recorded node reference'})):related(node);dialogBody.append(h('p',{class:'p2-worlds-nav-summary',text:`${edges.length} actual declared connections. Opening another record preserves this detail page in Back / Forward.`}));
  for(const edge of edges){const outgoing=node.members?node.members.includes(edge.from):edge.from===node.id,targetId=outgoing?edge.to:edge.from,target=getNode(targetId);const row=h('div',{class:'p2-worlds-connection'},h('span',{text:outgoing?'→':'←'}),h('span',{class:'p2-worlds-connection-label',text:edge.label??'connected'}));row.append(target?link(displayName(target),()=>openDetails(target),{'data-open-connection':target.id}):h('span',{text:targetId+' (not present in this runtime response)'}));dialogBody.append(row);}
  if(!edges.length)dialogBody.append(h('p',{text:'No connections are attached to this record.'}));
 }
 function eventKey(event){return event.id??event.sequence??JSON.stringify(event);}
 function scheduleLogRender(){if(logFrame!==null||disposed)return;logFrame=setTimeout(()=>{logFrame=null;if(!disposed)renderEvents();},0);}
 function renderEvents(){
  const shown=events.filter(event=>!logQuery||JSON.stringify(event).toLowerCase().includes(logQuery));eventList.replaceChildren();eventCount.textContent=`${shown.length} shown / ${events.length} retained / ${totalEvents} received${totalEvents>events.length?' · oldest records evicted':''}`;
  if(!shown.length){eventList.append(h('div',{class:'p2-worlds-event empty',text:events.length?'No events match this filter.':'No activation events received yet. Use an editor or send a command to observe the runtime.'}));return;}
  const fragment=document.createDocumentFragment();
  for(const event of [...shown].reverse()){
   const timestamp=event.time??event.timestamp,date=timestamp!==undefined?new Date(timestamp):null,time=date&&!Number.isNaN(date.valueOf())?date.toISOString().slice(11,23):'—';
   const row=button('',()=>openDetails({id:'event:'+eventKey(event),label:String(event.label??event.operation??event.type??'Runtime activity'),kind:'episode',implementation:'Observed runtime event',description:'Exact activity-bus evidence. The visual replay clock is separate from the original runtime timestamps.',details:event,activityEvent:event},'activity'),{class:'p2-worlds-event','data-event-id':String(eventKey(event))});
   row.append(h('time',{text:time,title:date&&!Number.isNaN(date.valueOf())?date.toISOString():'Runtime timestamp not supplied'}),h('span',{class:'p2-worlds-event-phase',text:String(event.phase??'activity')}),h('span',{class:'p2-worlds-event-label',text:String(event.label??event.operation??event.type??'Runtime activity')}));
   if(event.world)row.append(h('span',{class:'p2-worlds-event-world',text:data.areas?.find(area=>area.world===event.world)?.label??event.world}));if(event.status!==undefined)row.append(h('span',{class:'p2-worlds-event-result',text:String(event.status)}));const duration=event.durationMs??event.elapsedMs;if(duration!==undefined)row.append(h('span',{class:'p2-worlds-event-duration',text:String(duration)+' ms runtime'}));if(event.error!==undefined)row.append(h('span',{class:'p2-worlds-event-error',text:typeof event.error==='string'?event.error:JSON.stringify(event.error)}));fragment.append(row);
  }eventList.append(fragment);
 }
 function renderActivity(event){
  dialogBody.append(h('h3',{text:event.label??event.operation??'Recorded activity'}),h('p',{class:'p2-worlds-note',text:'Runtime timestamps and durations below are recorded evidence. Animation holds each stage for at least 500 ms; that playback delay is not execution time.'}));
  const fields=h('dl');for(const [label,value]of [['Event ID',event.id??event.sequence],['Runtime timestamp',event.time??event.timestamp],['Phase',event.phase],['Operation',event.operation],['World',event.world],['Status',event.status],['Runtime duration (ms)',event.durationMs??event.elapsedMs],['Error',event.error]])if(value!==undefined)fields.append(h('dt',{text:label}),h('dd',{text:typeof value==='string'?value:JSON.stringify(value)}));dialogBody.append(fields,h('h3',{text:'Recorded node references'}));
  for(const id of event.nodeIds??[]){const node=actualNode(id);dialogBody.append(node?link(displayName(node)+' · '+id,()=>openDetails(node),{'data-event-node':id}):h('p',{text:id+' — not present in the current architecture response.'}));}
  const emitters=declaredEmitters(event).map(actualNode).filter(Boolean);
  if(emitters.length){dialogBody.append(h('h3',{text:'JavaScript components that emit this operation'}),h('p',{class:'p2-worlds-note',text:'Lit because their registry entry declares "'+event.operation+'" as their activity hook.'}));for(const node of emitters)dialogBody.append(link(displayName(node)+' · '+node.id,()=>openDetails(node),{'data-event-emitter':node.id}));}
  const raw=JSON.stringify(event,null,2);if(copy)dialogBody.append(h('div',{class:'p2-worlds-modal-actions'},copyButton('Copy exact event',raw)));dialogBody.append(h('details',{},h('summary',{text:'Complete exact event payload'}),h('pre',{class:'p2-worlds-exact-event',text:raw})));
 }
 function applyPlaybackHighlight(){
  // Recorded node identities light the record that shows them on the map (a folded part lights its owner).
  const lit=new Set([...active.keys()].map(visibleOf)),stages=(playing?.events??[]).map(event=>new Set(litIds(event).map(visibleOf)));
  for (const edge of graph.querySelectorAll('[data-edge-from]')) {
   const on=stages.some(ids=>ids.has(edge.dataset.edgeFrom)&&ids.has(edge.dataset.edgeTo));
   edge.classList.toggle('playing-edge',on);
   edge.setAttribute('marker-end',on?'url(#p2-worlds-active-arrow)':'url(#p2-worlds-arrow)');
  }
  for(const [id,node]of nodeElements)node.classList.toggle('active',lit.has(id));for(const [groupId,node]of groupElements)node.classList.toggle('active',[...lit].some(id=>memberships.get(id)===groupId));
 }
 function playbackKey(event){return typeof event.operation==='string'?JSON.stringify([event.operation,event.stage??null,event.correlationId??null,event.invocation??null,event.world??null]):null;}
 function appendPlaybackEvent(group,event){group.events.push(event);group.phase=event.phase;for(const id of litIds(event))if(!group.nodeSet.has(id)){group.nodeSet.add(id);group.nodeIds.push(id);if(group===playing)active.set(id,true);}if(group===playing)applyPlaybackHighlight();}
 function newPlaybackGroup(event){return {id:eventKey(event),key:playbackKey(event),operation:event.operation,stage:event.stage,phase:event.phase,nodeIds:litIds(event),nodeSet:new Set(litIds(event)),events:[event]};}
 function playbackGroups(recorded){const groups=[];for(const event of recorded){const key=playbackKey(event),last=groups.at(-1);if(key&&last?.key===key)appendPlaybackEvent(last,event);else groups.push(newPlaybackGroup(event));}return groups;}
 function showPlaybackStage(){if(!playing)return;const summary={grouping:'UI playback of consecutive actual events with the same explicit operation/stage/correlation/invocation/world',minimumPlaybackMs:500,eventIds:playing.events.map(eventKey),nodeIds:[...playing.nodeIds],events:[...playing.events]};openDetails({id:'playback:'+playing.id,label:'Recorded playback stage',kind:'episode',implementation:'UI grouping of recorded events',description:'This visual stage groups consecutive source records; it is not an additional runtime event or fabricated world participation. Every original event remains in the Activity log.',details:summary},'properties');}
 function updatePlaybackStatus(){
  playbackBar.hidden=!explicitReplay;
  const command=replayCommand;
  const label=playing?.events.at(-1)?.label;
  const elapsed=playing?playbackElapsed+(clockRunning?performance.now()-playbackStarted:0):0;playbackStatus.textContent=playing?`${paused?'Paused · ':visibilityPaused?'Paused while hidden/unfocused · ':''}${command?'“'+command+'” · ':''}${label?label+' · ':''}${playing.operation??playing.phase??'activity'}${playing.events.length>1?' · '+playing.events.length+' events':''} · ${Math.floor(elapsed)}ms playback · ${playbackQueue.length} stages queued`:`${paused?'Paused · ':visibilityPaused?'Paused while hidden/unfocused · ':''}${playbackQueue.length} queued · ≥500 ms per stage`;pauseButton.textContent=paused?'Resume':'Pause';
  if(playing)playbackStatus.setAttribute('data-playing-event',String(eventKey(playing)));else playbackStatus.removeAttribute('data-playing-event');
 }
 function playbackAllowed(){return viewVisible&&!document.hidden&&document.hasFocus()&&element.isConnected&&element.getClientRects().length>0;}
 function pausePlaybackClock(){if(clockRunning){playbackElapsed+=performance.now()-playbackStarted;clockRunning=false;}clearTimeout(playbackTimer);playbackTimer=null;}
 function syncPlaybackVisibility(){
  if(disposed||!explicitReplay)return;visibilityPaused=!playbackAllowed();
  if(paused||visibilityPaused){pausePlaybackClock();updatePlaybackStatus();return;}
  if(!playing){advancePlayback();return;}if(!clockRunning){playbackStarted=performance.now();clockRunning=true;schedulePlayback();updatePlaybackStatus();}
 }
 function schedulePlayback(){
  if(disposed||!clockRunning)return;clearTimeout(playbackTimer);const remaining=Math.max(0,500-playbackElapsed-(performance.now()-playbackStarted));playbackTimer=setTimeout(()=>{if(disposed)return;if(!playbackAllowed()||paused){syncPlaybackVisibility();return;}updatePlaybackStatus();if(playbackElapsed+performance.now()-playbackStarted>=500)advancePlayback();else schedulePlayback();},Math.min(100,Math.max(1,remaining)));
 }
 function advancePlayback(){
  clearTimeout(playbackTimer);playbackTimer=null;if(disposed)return;if(paused||!playbackAllowed()){syncPlaybackVisibility();return;}
  playing=playbackQueue.shift()??null;playbackElapsed=0;playbackStarted=performance.now();clockRunning=!!playing;visibilityPaused=false;if(!playing)explicitReplay=false;active.clear();for(const id of playing?.nodeIds??[])active.set(id,true);applyPlaybackHighlight();updatePlaybackStatus();schedulePlayback();
 }
 function stopPlayback(){pausePlaybackClock();playbackQueue=[];playing=null;explicitReplay=false;playbackElapsed=0;active.clear();applyPlaybackHighlight();updatePlaybackStatus();}
 function togglePause(){paused=!paused;syncPlaybackVisibility();}
 function setVisible(visible){viewVisible=!!visible;if(!viewVisible)stopPlayback();syncPlaybackVisibility();return {visible:viewVisible,paused:paused||visibilityPaused};}
 function replayEvents(eventsOrIDs,command=""){
  if(!Array.isArray(eventsOrIDs))throw TypeError('Replay expects recorded events or retained event IDs.');
  const retained=new Map(events.map(event=>[eventKey(event),event])),selected=[],missingIDs=[],seen=new Set();
  for(const input of eventsOrIDs){const event=input&&typeof input==='object'?input:retained.get(input);if(!event){missingIDs.push(input);continue;}const key=eventKey(event);if(seen.has(key))continue;seen.add(key);selected.push(event);receive(event);}
  stopPlayback();if(selected.length)closeDetails();replayCommand=command;paused=false;explicitReplay=selected.length>0;playbackQueue=playbackGroups(selected);syncPlaybackVisibility();return {accepted:selected.length,missingIDs};
 }
 function receive(event){
  if(disposed||!event||typeof event!=='object')return;const key=eventKey(event);
  if(!seenEvents.has(key)){seenEvents.add(key);events.push(event);totalEvents++;if(events.length>300)events.shift();scheduleLogRender();}
 }
 function ingestHistory(history){
  const incoming=[];for(const event of history){if(!event||typeof event!=='object'||seenEvents.has(eventKey(event)))continue;seenEvents.add(eventKey(event));incoming.push(event);totalEvents++;}
  if(incoming.length){events=[...incoming,...events].slice(-300);scheduleLogRender();}
 }
 async function refresh(){if(disposed)return false;const token=++generation;setStatus('Reading runtime…');try{const result=await load();if(disposed||token!==generation)return false;if(!result||!Array.isArray(result.nodes)||!Array.isArray(result.edges))throw Error('Runtime graph must provide nodes and edges.');const ids=new Set();for(const node of result.nodes){if(typeof node.id!=='string'||ids.has(node.id))throw Error('Runtime graph has a missing or duplicate node ID.');ids.add(node.id);}const declared=(Array.isArray(result.componentLinks)?result.componentLinks:[]).filter(link=>ids.has(link.from)&&ids.has(link.to)&&!result.edges.some(edge=>edge.from===link.from&&edge.to===link.to&&edge.label===link.label));data={...result,edges:[...result.edges,...declared]};indexOperations();ingestHistory(result.activity??[]);draw();return true;}catch(error){if(!disposed&&token===generation)setStatus('Could not load Worlds: '+error.message,true);return false;}}
 search.addEventListener('input',()=>{query=search.value.toLowerCase().trim();updateSearch();});search.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=data.nodes.find(matches);if(first)openDetails(first);}});
 let drag=null;graph.addEventListener('pointerdown',event=>{if(compact||event.target.closest('[data-world-node],[data-layer-about],[data-layer-toggle]')||event.button!==0)return;viewAdjusted=true;drag={x:event.clientX,y:event.clientY,view:{...graphView}};graph.setPointerCapture(event.pointerId);});graph.addEventListener('pointermove',event=>{if(!drag)return;const rect=graph.getBoundingClientRect(),scale=Math.max(drag.view.w/Math.max(1,rect.width),drag.view.h/Math.max(1,rect.height));graphView.x=drag.view.x-(event.clientX-drag.x)*scale;graphView.y=drag.view.y-(event.clientY-drag.y)*scale;applyView();});for(const type of ['pointerup','pointercancel'])graph.addEventListener(type,()=>{drag=null;});graph.addEventListener('wheel',event=>{if(compact&&!event.ctrlKey)return;event.preventDefault();if(compact){setCompactScale(compactScale*(event.deltaY>0?1/1.1:1.1));return;}if(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)){if(graphView){viewAdjusted=true;graphView.x+=(event.deltaX||event.deltaY)*graphView.w/Math.max(1,graphPane.clientWidth);applyView();}}else zoom(event.deltaY>0?1.12:1/1.12);},{passive:false});
 // Two-finger pinch zooms on touch screens: the wide map zooms its view, the compact map previews the scale and lays out again.
 let pinch=null;const spread=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY)||1;
 graph.addEventListener('touchstart',event=>{if(event.touches.length!==2)return;event.preventDefault();drag=null;pinch={start:spread(event.touches),ratio:1};},{passive:false});
 graph.addEventListener('touchmove',event=>{if(!pinch||event.touches.length!==2)return;event.preventDefault();const ratio=Math.max(.4,Math.min(3,spread(event.touches)/pinch.start));if(compact){graph.style.transformOrigin='0 0';graph.style.transform=`scale(${ratio})`;}else zoomView(pinch.ratio/ratio);pinch.ratio=ratio;},{passive:false});
 for(const type of ['touchend','touchcancel'])graph.addEventListener(type,event=>{if(!pinch||event.touches.length>=2)return;const {ratio}=pinch;pinch=null;graph.style.transform='';if(compact&&Math.abs(ratio-1)>.05)setCompactScale(compactScale*ratio);});
 const closeLegendOutside=event=>{if(legendOpen&&!legend.contains(event.target)&&event.target!==legendScrim)setLegendOpen(false);};document.addEventListener('pointerdown',closeLegendOutside,true);
 const closeLegendOnBack=()=>{if(legendHistory&&!history.state?.p2worldsLegend)setLegendOpen(false,{fromPop:true});};window.addEventListener('popstate',closeLegendOnBack);
 element.addEventListener('keydown',event=>{if(event.key==='Escape'&&legendOpen){event.preventDefault();setLegendOpen(false);legend.querySelector('summary')?.focus();}});
 window.addEventListener('focus',syncPlaybackVisibility);window.addEventListener('blur',syncPlaybackVisibility);document.addEventListener('visibilitychange',syncPlaybackVisibility);
 // The layout follows the pane: a real size change lays the map out again and fits it.
 let resizeFrame=null;const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(resizeFrame!==null)return;resizeFrame=setTimeout(()=>{resizeFrame=null;const size=measuredSize();if(disposed||!size||!data.nodes.length||currentPage!=='map')return;if(lastSize&&Math.abs(lastSize.w-size.w)<3&&Math.abs(lastSize.h-size.h)<3)return;viewAdjusted=false;draw();},30);}):null;resizeObserver?.observe(graphPane);
 const unsubscribe=typeof subscribe==='function'?subscribe(receive):null;renderEvents();renderPageBreadcrumbs();updatePlaybackStatus();void refresh();
 return {element,refresh,replayEvents,setVisible,destroy(){if(disposed)return;disposed=true;resizeObserver?.disconnect();if(resizeFrame!==null)clearTimeout(resizeFrame);generation++;clearTimeout(playbackTimer);if(logFrame!==null)clearTimeout(logFrame);if(typeof unsubscribe==='function')unsubscribe();document.removeEventListener('pointerdown',closeLegendOutside,true);window.removeEventListener('popstate',closeLegendOnBack);window.removeEventListener('focus',syncPlaybackVisibility);window.removeEventListener('blur',syncPlaybackVisibility);document.removeEventListener('visibilitychange',syncPlaybackVisibility);element.remove();}};
}
