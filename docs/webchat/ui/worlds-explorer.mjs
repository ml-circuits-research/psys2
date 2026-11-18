// Architecture navigation is a read-only view of real runtime records.
// Background groups organize layout only; every graph node is an actual runtime record.
import {h} from './util.mjs';

const NS='http://www.w3.org/2000/svg';
const KINDS={
 world:['Tool package','◎'],
 schema:['Schema / declarations','▦'],knowledge:['Knowledge','◈'],
 instance:['World instance','●'],interpreter:['Interpreter','⚙'],
 component:['Implementation component','⬡'],runtime:['Runtime implementation','⏵'],
 structure:['Runtime structure','▤'],storage:['Storage adapter','▰'],
 adapter:['Adapter','⇄'],method:['Method','ƒ'],episode:['Episode','◷'],
 project:['Project','◇']
};
const KIND_HELP={
 world:'An application package containing SOP declarations, methods or initial facts. A package is not automatically a concrete world instance.',
 schema:'Reusable types, slots, constraints and rules that describe or validate worlds. Schema source is distinct from live instance facts.',
 knowledge:'Published reusable knowledge or catalog source. A published entry may contain a world pattern or a knowledge base; its exact role is shown only when declared.',
 instance:'Concrete facts for one world instance. The record states whether these facts are authoritative operational state or an observation from a native adapter.',
 project:'A registry linking application domains, schema identities and live instances. Its implementation and source show what is operational SOP state.',
 interpreter:'Executes or validates declared commands. Its implementation may be JavaScript, SOP mechanisms or a combination; it is distinct from the text reader.',
 adapter:'Connects tools or native editor data to the rest of the system. Any JavaScript behavior and remaining semantic responsibility are disclosed in its details.',
 component:'An implementation component such as a reader, formalizer or executor. Being visible here does not make its internal behavior a SOP World.',
 runtime:'Native runtime data or a JavaScript implementation structure. Serialization into SOP does not by itself make this structure a reasoning mechanism.',
 structure:'A property or collection held by the runtime. It remains distinct from an independently declared SOP World.',
 storage:'An adapter for explicit work files, browser storage or model artifacts. Inspect the record for what it actually stores.',
 method:'A declared procedure or mechanism. Availability does not prove it participated in a particular decision.',
 episode:'Retained evidence or an observed activity record. It documents only the execution boundaries actually recorded.'
};
const displayName=node=>node.displayName??node.help?.title??node.label??node.id;
const kindOf=node=>Object.hasOwn(KINDS,node.kind)?node.kind:'component';
const hasTools=node=>Array.isArray(node.tools)?node.tools.length>0:node.tools&&typeof node.tools==='object'?Object.keys(node.tools).length>0:node.tools!==undefined&&node.tools!==null;
const isSopRecord=node=>node.representation==='sop';
const representationOf=node=>node.representation??'javascript';
const REPRESENTATIONS={
 javascript:['JavaScript / native data','#efa66e'],sop:['SOP Lang','#65d7b4'],
 model:['SOP-BERT','#72a8ff'],catalog:['Catalog metadata','#b2a7d9'],
};
const representationMeta=node=>REPRESENTATIONS[representationOf(node)]??REPRESENTATIONS.javascript;
const roleOf=node=>node.role??KINDS[kindOf(node)][0];
const USAGE={available:['A','Catalog only','Catalog entry; runtime use has not been recorded.'], 'inspection-only':['I','Inspected only','Read for inspection only; this does not demonstrate runtime reasoning.'], 'runtime-read':['R','Source read','The runtime read this source. Access alone does not prove reasoning participation.']};
let explorerSequence=0;
const textOf=value=>value===null?'null':value===undefined?'undefined':typeof value==='string'?value:JSON.stringify(value);
const valueType=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const entriesOf=value=>value!==null&&typeof value==='object'?Object.entries(value):[];
function svg(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(attrs['font-size'])node.style.fontSize=`calc(${attrs['font-size']}px * var(--worlds-font-scale,1))`;if(text!==undefined)node.textContent=text;return node;}
function worldGlyph(node,usage){
 const kind=kindOf(node),[,icon]=KINDS[kind],[,color]=representationMeta(node);
 const glyph=svg('g',{class:'p2-worlds-glyph','data-glyph-kind':kind,'data-usage':usage??'unknown',
  'data-representation':representationOf(node),style:'--world-color:'+color});
 glyph.append(svg('circle',{r:8.5,fill:'#263b52',stroke:color,'stroke-width':1.5}),
  svg('text',{x:0,y:4.5,'text-anchor':'middle',fill:'#dce4ef','font-size':13},icon));
 if(USAGE[usage]){
  const [letter,badgeLabel]=USAGE[usage],badge=svg('text',{x:9,y:-8,fill:'#c6d5e4','font-size':7,'data-usage-badge':usage},letter);
  badge.append(svg('title',{},badgeLabel));glyph.append(badge);
 }
 return glyph;
}
function styles(){
 if(document.getElementById('p2-worlds-explorer-style'))return;
 document.head.append(h('style',{id:'p2-worlds-explorer-style',text:`
.p2-worlds{height:100%;min-height:400px;min-width:0;display:flex;flex-direction:column;color:#e4ebf5;background:#141b25;font:inherit;overflow:hidden}
.p2-worlds *{box-sizing:border-box}.p2-worlds button,.p2-worlds input,.p2-worlds-dialog button{font:inherit;color:inherit;border:1px solid #98acc044;border-radius:7px;background:#829ab512;padding:8px 11px}.p2-worlds button,.p2-worlds-dialog button{cursor:pointer}.p2-worlds button:hover,.p2-worlds-dialog button:hover{background:#829ab527}.p2-worlds button:disabled,.p2-worlds-dialog button:disabled{opacity:.35;cursor:default}.p2-worlds button:focus-visible,.p2-worlds [tabindex]:focus-visible,.p2-worlds-dialog button:focus-visible{outline:2px solid #81baff;outline-offset:2px}
.p2-worlds-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #96abc02a}.p2-worlds-toolbar h2{font-size:17px;margin:0 10px 0 0}.p2-worlds-search{flex:1;min-width:160px;max-width:400px}.p2-worlds-status{font-size:12px;opacity:.75;margin-left:auto}.p2-worlds-status[role=alert]{color:#ffb6b6;opacity:1}
.p2-worlds-legend{display:block;max-height:260px;overflow:auto;gap:15px;flex-wrap:wrap;padding:8px 16px;font-size:12px;color:#a4b5ca}.p2-worlds-legend summary{cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;list-style-position:inside}.p2-worlds-legend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin:14px 0}.p2-worlds-legend-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;padding:10px;border:1px solid #91a9c62b;border-radius:7px}.p2-worlds-legend-symbol{width:26px;height:26px}.p2-worlds-legend-item strong{color:#d8e5f5;font-size:13px}.p2-worlds-legend-item p{margin:5px 0 0;line-height:1.5;font-size:12px}.p2-worlds-legend-note{font-size:12px;line-height:1.5;margin:9px 0}.p2-worlds-help-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:18px 0 24px}.p2-worlds-help-card{padding:16px 18px;border:1px solid #98acc033;border-radius:8px;min-width:0}.p2-worlds-help-card h3{font-size:15px}.p2-worlds-help-card ul{margin:8px 0 0;padding-left:19px;line-height:1.65}.p2-worlds-help-card li{margin:5px 0;overflow-wrap:anywhere}.p2-worlds-help-card p{font-size:13px;margin:5px 0}.p2-worlds-kind-note{font-size:13px!important;color:#b7c9df}
.p2-worlds-graph-pane{position:relative;flex:1;min-height:240px;min-width:0;overflow:hidden;background:radial-gradient(circle at 50% 45%,#526f9a16,transparent 65%)}.p2-worlds-graph{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.p2-worlds-graph:active{cursor:grabbing}.p2-worlds-graph text{font-family:inherit;pointer-events:none}.p2-worlds-node{cursor:pointer}.p2-worlds-node rect{fill:#202d3e;stroke:var(--world-color);stroke-width:1.5;transition:fill .15s,stroke-width .15s}.p2-worlds-node:hover rect{fill:#2b3d53;stroke-width:2.5}.p2-worlds-node.active rect{fill:#304e42;stroke-width:4;filter:drop-shadow(0 0 8px var(--world-color))}.p2-worlds-node.dim{opacity:.25}.p2-worlds-edge{stroke:#9ab0ca35;stroke-width:1.3;fill:none}.p2-worlds-edge.connected{stroke:#b8d5ff;stroke-width:2.2}.p2-worlds-edge-label{fill:#c4d4e8;font-size:12px;paint-order:stroke;stroke:#141b25;stroke-width:5;opacity:0}.p2-worlds-edge-label.connected{opacity:1}.p2-worlds-graph-hint{position:absolute;bottom:10px;left:16px;right:16px;font-size:11px;color:#90a4bf;pointer-events:none}.p2-worlds-empty{position:absolute;inset:40px;display:grid;place-items:center;font-size:15px;color:#a2b4cd;text-align:center}
.p2-worlds-log-grip{height:7px;cursor:row-resize;touch-action:none;background:#90aaca20;flex:0 0 7px}.p2-worlds-log-grip:after{content:"";display:block;width:40px;height:2px;margin:2px auto;background:#9bb4ce88;border-radius:2px}.p2-worlds-events{overflow:hidden;flex-shrink:0;border-top:1px solid #96abc02a;flex:0 0 124px;min-height:70px;display:flex;flex-direction:column}.p2-worlds-events header{flex-wrap:wrap;display:flex;align-items:center;gap:10px;padding:8px 16px;font-size:12px}.p2-worlds-events header button{padding:3px 7px;font-size:11px}.p2-worlds-playback-status{font-size:11px;opacity:.8}.p2-worlds-log-tools{display:flex;gap:8px;padding:3px 16px 7px}.p2-worlds-log-tools input{flex:1;min-width:80px;font-size:12px;padding:4px 8px}.p2-worlds-log-tools button{font-size:11px;padding:4px 8px}.p2-worlds-events.collapsed .p2-worlds-log-tools,.p2-worlds-events.collapsed .p2-worlds-event-list,.p2-worlds-events.collapsed .p2-worlds-log-grip{display:none}.p2-worlds-event-error{color:#ffb4b4}.p2-worlds-event-world,.p2-worlds-event-result,.p2-worlds-event-duration{color:#9fb4cf;font-size:11px;white-space:nowrap}.p2-worlds-live{color:#7ee0b8}.p2-worlds-event-count{opacity:.6;margin-left:auto}.p2-worlds-event-list{flex:1;min-height:0;overflow:auto;padding:0 16px 8px;display:flex;flex-direction:column;gap:3px}.p2-worlds-event{display:flex;gap:12px;align-items:baseline;text-align:left;width:100%;padding:5px 7px!important;border:0!important;background:transparent!important;font-size:12px!important}.p2-worlds-event time{opacity:.5;white-space:nowrap;font-size:11px}.p2-worlds-event-phase{color:#99bde8;min-width:70px}.p2-worlds-event-label{overflow-wrap:anywhere}.p2-worlds-event.empty{opacity:.6}
.p2-worlds-dialog{color:#e4ebf5;font:inherit;position:fixed;inset:24px;margin:0;width:calc(100vw - 48px);height:calc(100dvh - 48px);max-width:none;max-height:none;padding:0;border:1px solid #627b97;border-radius:12px;background:#182231;color:#e4ebf5;box-shadow:0 25px 100px #0009;font:14px/1.5 system-ui,sans-serif;overflow:hidden}.p2-worlds-dialog-shell{height:100%;display:flex;flex-direction:column}.p2-worlds-dialog-header{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #98acc033}.p2-worlds-dialog-header h2{margin:0;font-size:20px;line-height:1.3;overflow-wrap:anywhere}.p2-worlds-dialog-subtitle{font-size:12px;color:#a0b3cb;margin-top:4px;overflow-wrap:anywhere}.p2-worlds-dialog-heading{flex:1;min-width:0}.p2-worlds-dialog button{font-size:13px}.p2-worlds-detail-tabs{display:flex;gap:5px;padding:10px 20px;border-bottom:1px solid #98acc033;overflow:auto;flex:0 0 auto}.p2-worlds-detail-tabs button{white-space:nowrap;background:transparent;border-color:transparent}.p2-worlds-detail-tabs button[aria-selected=true]{background:#344c6b;color:#fff;border-color:#6c9cd0}.p2-worlds-detail-body{flex:1;overflow:auto;padding:22px 28px;min-height:0}.p2-worlds-detail-body h3{font-size:17px;margin:0 0 14px}.p2-worlds-detail-body p{max-width:1000px;font-size:15px;line-height:1.7;overflow-wrap:anywhere}.p2-worlds-detail-body dl{display:grid;grid-template-columns:minmax(100px,160px) minmax(0,1fr);gap:12px 20px;max-width:1100px;font-size:14px}.p2-worlds-detail-body dt{color:#9fb3ce}.p2-worlds-detail-body dd{margin:0;overflow-wrap:anywhere}.p2-worlds-detail-body pre{font:13px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;margin:16px 0}.p2-worlds-detail-summary{color:#a7bbd4;font-size:13px!important}.p2-worlds-note{border-left:3px solid #a8b7d4;padding:10px 16px;background:#829ab510}.p2-worlds-property-path{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-bottom:16px}.p2-worlds-property-path button{padding:5px 9px;font-size:12px}.p2-worlds-property-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px}.p2-worlds-property-table th{text-align:left;color:#9fb3ce;font-size:12px;font-weight:500}.p2-worlds-property-table th,.p2-worlds-property-table td{padding:12px 10px;border-bottom:1px solid #98acc022;vertical-align:top;overflow-wrap:anywhere}.p2-worlds-property-table th:first-child{width:28%}.p2-worlds-property-table th:nth-child(2){width:13%}.p2-worlds-property-table button{text-align:left;font-size:14px;background:#7399c119;max-width:100%;overflow-wrap:anywhere}.p2-worlds-property-type{color:#a5b5cd;font:12px ui-monospace,monospace}.p2-worlds-scalar{white-space:pre-wrap;overflow-wrap:anywhere}.p2-worlds-tool-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.p2-worlds-tool-card{margin:0 0 16px;padding:16px 18px;border:1px solid #98acc033;border-radius:8px;min-width:0}.p2-worlds-tool-card h4{font-size:15px;margin:0 0 8px;overflow-wrap:anywhere}.p2-worlds-tool-card p{font-size:13px;margin:5px 0}.p2-worlds-connection{display:grid;grid-template-columns:30px minmax(120px,200px) minmax(0,1fr);gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid #98acc022}.p2-worlds-connection button{text-align:left;overflow-wrap:anywhere}.p2-worlds-connection-label{color:#a8bed8;font-size:13px}.p2-worlds-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.p2-worlds-nav-summary{font-size:13px;color:#a1b4ce;max-width:1000px;margin:0 0 18px}.p2-worlds-collection-member{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #98acc022}.p2-worlds-collection-member button{text-align:left}
.p2-worlds-node rect.p2-worlds-hit{fill:transparent;stroke:none}.p2-worlds-node:hover circle{fill:#47688b;stroke-width:2.5}.p2-worlds-node.active circle{fill:#6bc59e;stroke:#b8ffe0;stroke-width:3;filter:drop-shadow(0 0 7px #70e2b4)}.p2-worlds-edge{stroke:#a3bfd54d;stroke-width:.65;opacity:.36;pointer-events:stroke}.p2-worlds-graph.highlighting .p2-worlds-edge{opacity:.07}.p2-worlds-graph.highlighting .p2-worlds-edge.connected{stroke:#c3e0ff;opacity:1;stroke-width:1.4}.p2-worlds-graph .p2-worlds-edge.playing-edge{stroke:#a5ffca;opacity:1;stroke-width:2.3}.p2-worlds-graph [data-layout-group].active rect{stroke:#81c6a8;stroke-width:2}.p2-worlds-tooltip{position:absolute;z-index:3;max-width:340px;display:flex;flex-direction:column;gap:5px;padding:12px 14px;border:1px solid #7291b2;border-radius:8px;background:#1c2b3df5;box-shadow:0 5px 25px #0008;pointer-events:none;font-size:12px;overflow-wrap:anywhere}.p2-worlds-tooltip[hidden]{display:none}.p2-worlds-tooltip strong{font-size:14px}.p2-worlds-tooltip span{color:#adc0d8}.p2-worlds-dialog{inset:12px;width:calc(100vw - 24px);height:calc(100dvh - 24px)}
.p2-worlds [hidden]{display:none!important}.p2-worlds-dialog{position:relative;inset:auto;margin:0;width:100%;height:100%;flex:1;min-height:0;border:0;border-radius:0;box-shadow:none;max-width:none;max-height:none}.p2-worlds-detail-breadcrumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid #98acc022;max-height:105px;overflow:auto;flex:0 0 auto;font-size:12px}.p2-worlds-detail-breadcrumbs button{padding:4px 8px;font-size:12px}.p2-worlds-detail-breadcrumbs span{opacity:.6}.p2-worlds-detail-breadcrumbs strong{font-size:12px}.p2-worlds-dialog-header{flex-wrap:wrap}.p2-worlds-dialog-heading{min-width:160px}
.p2-worlds-playback-bar[hidden]{display:none}.p2-worlds-events{flex:1;min-height:0;max-height:none;border-top:0}.p2-worlds-map-shell{flex:1;min-height:0;min-width:0;display:flex;overflow:hidden}.p2-worlds-legend{flex:0 0 126px;width:126px;max-height:none;overflow:auto;padding:12px;border-right:1px solid #98acc02b}.p2-worlds-legend.is-open{flex-basis:285px;width:285px}.p2-worlds-legend summary{display:flex;flex-direction:column;align-items:flex-start;gap:4px;cursor:pointer;font-size:calc(15px * var(--worlds-font-scale,1))}.p2-worlds-legend summary:before{content:'▸';font-size:14px}.p2-worlds-legend details[open]>summary:before{content:'▾'}.p2-worlds-legend-grid{display:flex;flex-direction:column;gap:12px;margin:16px 0}.p2-worlds-legend-item{display:grid;grid-template-columns:26px minmax(0,1fr);padding:12px 0;border:0;border-bottom:1px solid #91a9c62b;border-radius:0}.p2-worlds-legend-item strong{font-size:calc(15px * var(--worlds-font-scale,1))}.p2-worlds-legend-item p,.p2-worlds-legend-note{font-size:calc(14px * var(--worlds-font-scale,1));line-height:1.65}.p2-worlds-playback-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid #98acc02b;flex:0 0 auto}.p2-worlds-playback-bar button{font-size:calc(12px * var(--worlds-font-scale,1));padding:5px 8px}.p2-worlds-playback-bar[hidden]{display:none}.p2-worlds-events{flex:1;min-height:0;border:0;overflow:hidden}.p2-worlds-events header{padding:14px 20px;flex:0 0 auto}.p2-worlds-events h3{font-size:calc(19px * var(--worlds-font-scale,1));margin:0}.p2-worlds-events .p2-worlds-event{font-size:calc(14px * var(--worlds-font-scale,1))!important;padding:9px 8px!important}.p2-worlds-events time{font-size:calc(12px * var(--worlds-font-scale,1))}.p2-worlds-detail-body{font-size:calc(15px * var(--worlds-font-scale,1));line-height:1.65}.p2-worlds-detail-body p{font-size:calc(16px * var(--worlds-font-scale,1))}.p2-worlds-detail-body h3{font-size:calc(19px * var(--worlds-font-scale,1));margin:12px 0 16px}.p2-worlds-detail-body dl,.p2-worlds-property-table{font-size:calc(15px * var(--worlds-font-scale,1))}.p2-worlds-detail-body pre{font-size:calc(14px * var(--worlds-font-scale,1))}.p2-worlds-dialog button,.p2-worlds-detail-tabs button,.p2-worlds-detail-breadcrumbs button{font-size:calc(14px * var(--worlds-font-scale,1))}.p2-worlds-detail-breadcrumbs{font-size:calc(14px * var(--worlds-font-scale,1));padding:9px 16px}.p2-worlds-detail-breadcrumbs strong{font-size:inherit}.p2-worlds-help-card p,.p2-worlds-detail-summary{font-size:calc(14px * var(--worlds-font-scale,1))!important}.p2-worlds-toolbar button,.p2-worlds-toolbar input{font-size:calc(14px * var(--worlds-font-scale,1))}
.p2-worlds-map-shell{position:relative}.p2-worlds-legend:not(.is-open){position:absolute;z-index:4;top:8px;left:8px;width:auto;max-width:calc(100% - 16px);padding:7px 10px;border:1px solid #98acc044;border-radius:8px;background:#182231ed;max-height:48px;overflow:hidden}.p2-worlds-legend:not(.is-open) summary{flex-direction:row;align-items:center;gap:7px}.p2-worlds-legend:not(.is-open) summary span{font-size:12px;color:#a4b5ca}.p2-worlds-legend.is-open{min-width:0}.p2-worlds-toolbar,.p2-worlds-playback-bar{flex-shrink:0}.p2-worlds-search{min-width:0}.p2-worlds-help-grid,.p2-worlds-tool-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.p2-worlds-source-files{display:flex;flex-wrap:wrap;gap:7px 16px;max-height:160px;overflow:auto;line-height:1.5;margin:14px 0}.p2-worlds-source-files a[aria-current=page]{color:#e3f0ff;font-weight:600}.p2-worlds-selected-source{font-size:14px;overflow-wrap:anywhere}.p2-worlds-glyph[data-usage=available] circle{fill:none}.p2-worlds-node[data-usage=available].active circle{fill:none}.p2-worlds-usage{font-size:14px!important;color:#b5c8dd}.p2-worlds a.p2-worlds-link{color:#a8cdf4;text-decoration:underline;text-underline-offset:3px;border:0!important;background:none!important;border-radius:0!important;padding:0!important;cursor:pointer;overflow-wrap:anywhere}.p2-worlds a.p2-worlds-link:hover{color:#e2efff}.p2-worlds-detail-breadcrumbs a{font-size:inherit}.p2-worlds-detail-body .p2-worlds-why{font-size:calc(17px * var(--worlds-font-scale,1));max-width:940px;margin:0 0 14px}.p2-worlds-detail-body .p2-worlds-help-card,.p2-worlds-tool-card{border:0;border-bottom:1px solid #98acc02b;border-radius:0;padding:12px 0;margin:0}.p2-worlds-detail-body .p2-worlds-note{border:0;background:none;padding:0}.p2-worlds-detail-tabs button{border:0!important;border-radius:0!important;background:none!important}.p2-worlds-detail-tabs button[aria-selected=true]{box-shadow:inset 0 -2px #81baff}.p2-worlds-node.active circle{fill:color-mix(in srgb,var(--world-color) 32%,#263b52);stroke:var(--world-color);filter:drop-shadow(0 0 7px var(--world-color))}
@media(max-width:700px){.p2-worlds{min-height:0}.p2-worlds-toolbar h2{display:none}.p2-worlds-toolbar input{flex-basis:100%;max-width:none;width:100%}.p2-worlds-toolbar button{padding:7px 9px}.p2-worlds-toolbar{gap:5px}.p2-worlds-status{font-size:11px}.p2-worlds-playback-bar{gap:5px;padding:7px 10px}.p2-worlds-playback-bar .p2-worlds-live{font-size:12px}.p2-worlds-playback-status{flex-basis:100%;overflow-wrap:anywhere}.p2-worlds-playback-bar button{padding:5px 7px;font-size:12px}.p2-worlds-graph-pane{min-height:180px}.p2-worlds-legend.is-open{position:absolute;inset:8px auto 8px 8px;z-index:4;width:min(285px,calc(100% - 16px));max-height:calc(100% - 16px);border:1px solid #98acc044;border-radius:8px;background:#182231f5}.p2-worlds-detail-breadcrumbs{padding:7px 10px;max-height:90px}.p2-worlds-detail-body{padding:12px}.p2-worlds-detail-body dl{grid-template-columns:minmax(80px,30%) minmax(0,1fr);gap:8px}.p2-worlds-connection{grid-template-columns:20px minmax(65px,30%) minmax(0,1fr);gap:6px}.p2-worlds-events .p2-worlds-event{flex-wrap:wrap;gap:5px 9px}.p2-worlds-event-label{flex-basis:100%;text-align:left}.p2-worlds-event-world{white-space:normal;overflow-wrap:anywhere}.p2-worlds-log-tools{flex-wrap:wrap;padding:4px 10px}.p2-worlds-log-tools input{flex-basis:100%}}
@media(max-width:700px){.p2-worlds-toolbar{padding:8px 10px;gap:6px;flex-wrap:nowrap;overflow-x:auto;flex:0 0 auto}.p2-worlds-toolbar>*{flex-shrink:0}.p2-worlds-toolbar .p2-worlds-search{flex:0 0 140px;min-width:140px}.p2-worlds-playback-bar{flex-wrap:nowrap;overflow-x:auto;padding:7px 10px}.p2-worlds-playback-bar>*{flex-shrink:0}.p2-worlds-playback-status{max-width:190px;white-space:normal}.p2-worlds-toolbar h2{font-size:15px}.p2-worlds-status{width:auto;margin-left:0;white-space:nowrap}.p2-worlds-dialog{inset:auto;width:100%;height:100%;border-radius:0}.p2-worlds-dialog-header{padding:12px;gap:6px}.p2-worlds-dialog-header h2{font-size:17px}.p2-worlds-detail-tabs{padding:8px}.p2-worlds-detail-body{padding:16px}.p2-worlds-property-table th:first-child{width:25%}.p2-worlds-property-table th:nth-child(2){width:18%}.p2-worlds-events{flex-basis:110px}}
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
 let legendOpen=false;let viewAdjusted=false;let graphView=null,currentDetail=null,currentPage='map',fontScale=1,graphBounds={w:900,h:500};
 const seenEvents=new Set(),active=new Map(),nodeElements=new Map(),groupElements=new Map();
 let playbackQueue=[],playing=null,playbackTimer=null,playbackStarted=0,playbackElapsed=0,paused=false,viewVisible=true,visibilityPaused=false,clockRunning=false,explicitReplay=false,replayCommand="",logFrame=null,logQuery='';
 const element=h('section',{id:'worlds-view-'+(++explorerSequence),class:'p2-worlds','aria-label':'Worlds architecture'}),status=h('span',{class:'p2-worlds-status',role:'status'}),search=h('input',{class:'p2-worlds-search',type:'search',placeholder:'Find a world, object or component…','aria-label':'Find a world or component'});
 const graph=svg('svg',{class:'p2-worlds-graph','aria-label':'Runtime architecture graph',role:'group'}),graphPane=h('div',{class:'p2-worlds-graph-pane'},graph),legend=h('aside',{class:'p2-worlds-legend','aria-label':'World kinds legend'}),eventList=h('div',{class:'p2-worlds-event-list',role:'log','aria-label':'Runtime activation events'}),eventCount=h('span',{class:'p2-worlds-event-count'});
 const detailBreadcrumbs=h('nav',{class:'p2-worlds-detail-breadcrumbs','aria-label':'Worlds location'});
 const toolbar=h('header',{class:'p2-worlds-toolbar'},h('h2',{text:'Worlds'}),search,button('Activity log',showActivityLog,{'aria-label':'Open activity log'}),button('Refresh',()=>void refresh()),button('−',()=>zoom(1.2),{'aria-label':'Zoom out'}),button('+',()=>zoom(1/1.2),{'aria-label':'Zoom in'}),button('Fit',fit),button('About this view',()=>openDetails({id:'ui:architecture-notes',label:'About the architecture view',kind:'component',implementation:'Read-only JavaScript projection',why:'Shows the actual implementation records and available definitions in one map. Colours identify JavaScript, SOP sources and SOP-BERT; reading source does not establish reasoning use.',description:'World pattern: reusable schema. Knowledge base: general content. World instance: concrete state. Application SOP world packages can contain declarations, methods and initial facts; they are not all pure world patterns. Background groups organize the map visually; each icon is one actual record. They are not additional SOP worlds.',details:{limitations:data.limitations??[],actualNodes:data.nodes.length,actualLinks:data.edges.length}})),status);
 const tooltip=h('div',{class:'p2-worlds-tooltip',role:'tooltip',hidden:true});graphPane.append(tooltip,h('div',{class:'p2-worlds-graph-hint',text:'All actual records · hover for identity · click for details · drag to pan · scroll to zoom'}));
 const playbackStatus=h('span',{class:'p2-worlds-playback-status',role:'status','aria-live':'off'}),pauseButton=button('Pause',togglePause),logFilter=h('input',{type:'search',placeholder:'Filter log…','aria-label':'Filter activity log'}),logPanel=h('section',{class:'p2-worlds-events',role:'region','aria-label':'Activity log',hidden:true});
 const playbackBar=h('div',{class:'p2-worlds-playback-bar'},h('span',{class:'p2-worlds-live',text:'Recorded activity playback'}),playbackStatus,pauseButton,button('Stage details',showPlaybackStage),button('Clear playback',stopPlayback));
 logPanel.append(h('header',{},h('h3',{text:'Activity log'}),eventCount),h('div',{class:'p2-worlds-log-tools'},logFilter,...(copy?[button('Copy retained log',async()=>{try{await copy(JSON.stringify(events,null,2));}catch(error){setStatus('Copy log failed: '+error.message,true);}})]:[])),eventList);
 const mapShell=h('div',{class:'p2-worlds-map-shell'},legend,graphPane);element.append(toolbar,detailBreadcrumbs,playbackBar,mapShell,logPanel);
 logFilter.addEventListener('input',()=>{logQuery=logFilter.value.toLowerCase().trim();scheduleLogRender();});
 const dialog=h('section',{class:'p2-worlds-dialog',role:'region','aria-label':'World or component details',hidden:true}),dialogBody=h('div',{class:'p2-worlds-detail-body'}),dialogTitle=h('h2'),dialogSubtitle=h('div',{class:'p2-worlds-dialog-subtitle'}),detailTabs=h('div',{class:'p2-worlds-detail-tabs',role:'tablist','aria-label':'World details'});
 dialog.append(h('div',{class:'p2-worlds-dialog-shell'},h('header',{class:'p2-worlds-dialog-header'},h('div',{class:'p2-worlds-dialog-heading'},dialogTitle,dialogSubtitle)),detailTabs,dialogBody));element.append(dialog);


 const setStatus=(message,error=false)=>{status.textContent=message;status.setAttribute('role',error?'alert':'status');};
 const actualNode=id=>data.nodes.find(node=>node.id===id);
 const getNode=id=>actualNode(id);
 const related=node=>data.edges.filter(edge=>edge.from===node.id||edge.to===node.id);
 const matches=node=>!query||[node.id,node.label,node.displayName,node.help?.title,node.kind,node.description,node.implementation].some(value=>String(value??'').toLowerCase().includes(query));
 const isSharedHub=id=>id===data.centralNodeId||['component:library','component:reader','runtime:registry'].includes(id);

 function organize(){
  layoutGroups=new Map();memberships=new Map();
  const layerOf=node=>{
   if(isSharedHub(node.id))return 'tools';
   if(['instance','project'].includes(node.kind))return 'instances';
   if(node.kind==='schema')return 'schemas';
   if(node.kind==='knowledge')return 'knowledge';
   if(['runtime','structure','episode'].includes(node.kind))return 'runtime';
   return 'tools';
  };
  const definitions=[
   ['tools','Tools/Interpreters','Tool packages and the runtime components that read, validate or execute their commands'],
   ['instances','World instances','Operational SOP state and separately identified observations'],
   ['runtime','Runtime data','Native editor state, properties, history and retained evidence'],
   ['knowledge','Catalog definitions and sources','Catalog roles follow the source declarations'],
   ['schemas','Schemas and legends','Types, slots, rules and source declarations'],
  ];
  for(const [id,label,description]of definitions)layoutGroups.set(id,{id,label,description,members:[]});
  for(const node of data.nodes){const id=layerOf(node);layoutGroups.get(id).members.push(node.id);memberships.set(node.id,id);}
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
 function fit(){viewAdjusted=false;graphView={x:-20,y:-20,w:graphBounds.w+40,h:graphBounds.h+40};applyView();}
 function zoom(factor){fontScale=Math.max(.85,Math.min(1.6,fontScale*(factor<1?1.06:1/1.06)));element.style.setProperty('--worlds-font-scale',String(fontScale));if(!graphView)return;viewAdjusted=true;const view=graphView,w=view.w*factor,height=view.h*factor;if(w<150||w>18000)return;graphView={x:view.x+(view.w-w)/2,y:view.y+(view.h-height)/2,w,h:height};applyView();}
 function draw(){
  organize();positions=new Map();nodeElements.clear();groupElements.clear();graph.replaceChildren();tooltip.hidden=true;
  const defs=svg('defs'),marker=svg('marker',{id:'p2-worlds-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:4,markerHeight:4,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#91a5bd'}));const lit=marker.cloneNode(true);lit.id='p2-worlds-active-arrow';lit.firstChild.setAttribute('fill','#a5ffca');defs.append(marker,lit);graph.append(defs);
  const areas=declaredAreas(),owners=domainPlacement(areas),labelWidth=190,sharedWidth=270,domainWidth=170,gap=22,headerHeight=34;
  const columns=[{world:null,label:'Shared / unassigned',x:labelWidth,width:sharedWidth},...areas.map((area,index)=>({...area,x:labelWidth+sharedWidth+index*domainWidth,width:domainWidth}))],width=labelWidth+sharedWidth+areas.length*domainWidth;
  for(const column of columns)graph.append(svg('text',{x:column.x+12,y:18,fill:'#c3d4e9','font-size':14,'font-weight':600},column.label));
  let y=headerHeight;
  for(const layer of layoutGroups.values()){
   const central=layer.members.filter(isSharedHub),cells=columns.map(column=>({...column,members:layer.members.filter(id=>!central.includes(id)&&(owners.get(id)??null)===column.world),count:Math.max(1,Math.floor((column.width-26)/gap))}));
   const rows=Math.max(1,...cells.map(cell=>Math.ceil(cell.members.length/cell.count))),top=central.length?58:0,height=Math.max(100,rows*gap+42+top),background=svg('g',{'data-layout-group':layer.id,style:'--world-color:#8eaecf'});
   background.append(svg('rect',{x:0,y,width,height,rx:10,fill:layer.id==='instances'?'#1b2c35':'#1c2838','fill-opacity':'.72',stroke:'#6c86a23f'}));
   const words=layer.label.split(' '),lines=[''];for(const word of words){if((lines.at(-1)+' '+word).trim().length>20)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+' '+word).trim();}lines.forEach((line,index)=>background.append(svg('text',{x:15,y:y+25+index*19,fill:'#c4d7ef','font-size':15,'font-weight':600},line)));background.append(svg('text',{x:15,y:y+height-15,fill:'#8fa5c0','font-size':11},`${layer.members.length} actual records`),svg('title',{},layer.description+' — UI layout only, not an additional runtime world.'));
   graph.append(background);groupElements.set(layer.id,background);
   for(const cell of cells){graph.append(svg('path',{d:`M ${cell.x} ${y+top+8} V ${y+height-8}`,stroke:'#91a9c61a'}));cell.members.forEach((id,index)=>positions.set(id,{x:cell.x+18+(index%cell.count)*gap,y:y+top+23+Math.floor(index/cell.count)*gap}));}
   central.forEach((id,index)=>{
    const x=width/2+(index-(central.length-1)/2)*Math.min(142,width/(central.length+1)),hubY=y+20;
    positions.set(id,{x,y:hubY});
    graph.append(svg('text',{'data-hub-label':id,x,y:hubY+24,'text-anchor':'middle',fill:'#c3d4e9','font-size':12},displayName(actualNode(id))));
   });
   y+=height+17;
  }
  graphBounds={w:Math.max(700,width),h:y};
  for(const edge of data.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;const length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;const d=edge.from===edge.to?`M ${a.x+7} ${a.y-7} C ${a.x+27} ${a.y-35}, ${a.x-27} ${a.y-35}, ${a.x-7} ${a.y-9}`:`M ${a.x+ux*10} ${a.y+uy*10} Q ${(a.x+b.x)/2+12} ${(a.y+b.y)/2-15} ${b.x-ux*11} ${b.y-uy*11}`,path=svg('path',{d,class:'p2-worlds-edge','marker-end':'url(#p2-worlds-arrow)','data-edge-from':edge.from,'data-edge-to':edge.to});path.append(svg('title',{},`${actualNode(edge.from)?.label??edge.from} → ${edge.label??'connected'} → ${actualNode(edge.to)?.label??edge.to}`));graph.append(path);}
  for(const node of data.nodes){
   const position=positions.get(node.id),type=roleOf(node),usage=effectiveUsage(node),[,color]=representationMeta(node);
   const group=svg('g',{transform:'translate('+position.x+','+position.y+')',class:'p2-worlds-node',tabindex:0,role:'button',
    'aria-label':displayName(node)+', '+type+', '+(node.implementation??''),'data-world-node':node.id,'data-world-role':type,
    'data-layer':memberships.get(node.id),'data-representation':representationOf(node),'data-usage':usage??'unknown',style:'--world-color:'+color});
   group.classList.toggle('active',active.has(node.id));group.classList.toggle('dim',!matches(node));
   group.append(svg('rect',{x:-12,y:-12,width:24,height:24,rx:5,fill:'transparent',stroke:'none',class:'p2-worlds-hit'}),worldGlyph(node,usage),
    svg('title',{},[node.label??node.id,node.id,type,node.implementation,node.description].filter(Boolean).join('\n')));
   const activate=()=>openDetails(node);group.addEventListener('click',activate);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});group.addEventListener('pointerenter',event=>showTooltip(node,event));group.addEventListener('pointermove',event=>positionTooltip(event));group.addEventListener('pointerleave',()=>{tooltip.hidden=true;highlight(null);});group.addEventListener('focus',()=>highlight(node.id));group.addEventListener('blur',()=>highlight(null));nodeElements.set(node.id,group);graph.append(group);
  }
  renderLegend();if(!data.nodes.length)legend.append(h('span',{text:'No runtime records returned.'}));if(!graphView||!viewAdjusted)fit();else applyView();updateSearch();applyPlaybackHighlight();
 }
 function renderLegend(){
  const groups=new Map(),details=h('details',{open:legendOpen,'data-worlds-legend':''}),list=h('div',{class:'p2-worlds-legend-grid'});
  for(const node of data.nodes){
   const usage=effectiveUsage(node),key=JSON.stringify([kindOf(node),roleOf(node),representationOf(node),usage]);
   const row=groups.get(key);
   if(row)row.count++;
   else groups.set(key,{node,usage,count:1});
  }
  for(const {node,usage,count} of groups.values()){
   const kind=kindOf(node),role=roleOf(node),[representation]=representationMeta(node);
   const sample=svg('svg',{class:'p2-worlds-legend-symbol',viewBox:'-13 -13 26 26','aria-hidden':true});
   sample.append(worldGlyph(node,usage));
   const qualifiers=[representation,USAGE[usage]?.[1]].filter(Boolean).join(' · ');
   list.append(h('article',{class:'p2-worlds-legend-item','data-legend-kind':kind,'data-legend-role':role},
    sample,h('div',{},h('strong',{text:role+' ('+count+')'}),h('p',{text:qualifiers}),h('p',{text:KIND_HELP[kind]}))));
  }
  details.append(h('summary',{},h('strong',{text:'Legend'}),h('span',{text:groups.size+' symbols'})),list,
   h('p',{class:'p2-worlds-legend-note',text:'Arrows show recorded relationships. Pulses replay activity. Rows and columns position the records on the map.'}));
  details.addEventListener('toggle',()=>{legendOpen=details.open;legend.classList.toggle('is-open',legendOpen);});
  legend.classList.toggle('is-open',legendOpen);legend.replaceChildren(details);

 }
 function updateSearch(){for(const node of data.nodes)nodeElements.get(node.id)?.classList.toggle('dim',!matches(node));const count=data.nodes.filter(matches).length;setStatus(`${data.nodes.length} actual records · ${data.edges.length} actual links${query?' · '+count+' matches':''}`);}
 function showTooltip(node,event){tooltip.replaceChildren(h('strong',{text:displayName(node)}),...(node.label&&node.label!==displayName(node)?[h('span',{text:node.label})]:[]),h('span',{text:node.id}),h('span',{text:roleOf(node)}),h('span',{text:typeof node.implementation==='string'?node.implementation:JSON.stringify(node.implementation??'')}));if(USAGE[effectiveUsage(node)])tooltip.append(h('span',{text:USAGE[effectiveUsage(node)][1]}));if(node.why)tooltip.append(h('span',{text:node.why}));tooltip.hidden=false;positionTooltip(event);highlight(node.id);}
 function positionTooltip(event){const bounds=graphPane.getBoundingClientRect();const x=Math.max(8,Math.min(bounds.width-tooltip.offsetWidth-8,event.clientX-bounds.left+16)),y=Math.max(8,Math.min(bounds.height-tooltip.offsetHeight-8,event.clientY-bounds.top+16));tooltip.style.left=x+'px';tooltip.style.top=y+'px';}
 function highlight(id){graph.classList.toggle('highlighting',!!id);for(const line of graph.querySelectorAll('[data-edge-from]'))line.classList.toggle('connected',line.dataset.edgeFrom===id||line.dataset.edgeTo===id);}
 function closeDetails(){currentPage='map';dialog.hidden=true;logPanel.hidden=true;mapShell.hidden=false;renderPageBreadcrumbs();applyView();}
 function showActivityLog(){currentPage='log';dialog.hidden=true;mapShell.hidden=true;logPanel.hidden=false;renderPageBreadcrumbs();renderEvents();}
 function openDetails(node,tab='overview',path=[],page=0){
  const previous=currentPage==='detail'?currentDetail:null,ancestorIndex=previous?.ancestors?.findIndex(ancestor=>ancestor.node.id===node.id)??-1,ancestors=ancestorIndex>=0?previous.ancestors.slice(0,ancestorIndex):previous&&previous.node.id!==node.id?[...(previous.ancestors??[]),{node:previous.node,tab:previous.tab,path:[...previous.path],page:previous.page}]:previous?.ancestors??[];
  currentDetail={node,tab,path:[...path],page,ancestors,origin:previous?.origin??(currentPage==='log'?'log':'map')};currentPage='detail';mapShell.hidden=true;logPanel.hidden=true;dialog.hidden=false;renderDetail();
  if(tab==='sop'&&hasSopSource(node)&&!(typeof node.wires==='string'&&node.wires.trim())&&typeof loadSources==='function'&&!sourceResponses.has(node.id)&&!sourceLoading.has(node.id))void fetchSources(node,0);
 }
 function visitDetail({tab=detailState().tab,path=detailState().path,page=0}={}){openDetails(detailState().node,tab,path,page);}
 function renderPageBreadcrumbs(){
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
  const links=h('p',{class:'p2-worlds-detail-links'},link('Connections',()=>visitDetail({tab:'connections'})));
  if(node.details!==undefined)links.append(' · ',link('Properties',()=>visitDetail({tab:isSopRecord(node)?'implementation':'properties'})));
  links.append(' · ',link('Complete inspection record',()=>openDetails({id:node.id+'/inspection-record',label:displayName(node)+' · inspection record',kind:'structure',representation:'javascript',implementation:'JavaScript inspection record',why:'Every field returned for this record, including source metadata and help.',details:node},'properties')));dialogBody.append(links);
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
  finally{sourceLoading.delete(node.id);if(!disposed){const group=nodeElements.get(node.id),usage=effectiveUsage(node);if(group){group.setAttribute('data-usage',usage??'unknown');const badge=group.querySelector('[data-usage-badge]');if(badge&&USAGE[usage]){badge.setAttribute('data-usage-badge',usage);badge.textContent=USAGE[usage][0];badge.append(svg('title',{},USAGE[usage][1]));}}if(currentDetail?.node.id===node.id)queueMicrotask(renderDetail);}}
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
  const raw=JSON.stringify(event,null,2);if(copy)dialogBody.append(h('div',{class:'p2-worlds-modal-actions'},copyButton('Copy exact event',raw)));dialogBody.append(h('details',{},h('summary',{text:'Complete exact event payload'}),h('pre',{class:'p2-worlds-exact-event',text:raw})));
 }
 function applyPlaybackHighlight(){
  for (const edge of graph.querySelectorAll('[data-edge-from]')) {
   const lit=playing?.events.some(event=>event.nodeIds?.includes(edge.dataset.edgeFrom)&&event.nodeIds.includes(edge.dataset.edgeTo))??false;
   edge.classList.toggle('playing-edge',lit);
   edge.setAttribute('marker-end',lit?'url(#p2-worlds-active-arrow)':'url(#p2-worlds-arrow)');
  }
  for(const [id,node]of nodeElements)node.classList.toggle('active',active.has(id));for(const [groupId,node]of groupElements)node.classList.toggle('active',[...active.keys()].some(id=>memberships.get(id)===groupId));
 }
 function playbackKey(event){return typeof event.operation==='string'?JSON.stringify([event.operation,event.stage??null,event.correlationId??null,event.invocation??null,event.world??null]):null;}
 function appendPlaybackEvent(group,event){group.events.push(event);group.phase=event.phase;for(const id of event.nodeIds??[])if(!group.nodeSet.has(id)){group.nodeSet.add(id);group.nodeIds.push(id);if(group===playing)active.set(id,true);}if(group===playing)applyPlaybackHighlight();}
 function newPlaybackGroup(event){return {id:eventKey(event),key:playbackKey(event),operation:event.operation,stage:event.stage,phase:event.phase,nodeIds:[...new Set(event.nodeIds??[])],nodeSet:new Set(event.nodeIds??[]),events:[event]};}
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
 async function refresh(){if(disposed)return false;const token=++generation;setStatus('Reading runtime…');try{const result=await load();if(disposed||token!==generation)return false;if(!result||!Array.isArray(result.nodes)||!Array.isArray(result.edges))throw Error('Runtime graph must provide nodes and edges.');const ids=new Set();for(const node of result.nodes){if(typeof node.id!=='string'||ids.has(node.id))throw Error('Runtime graph has a missing or duplicate node ID.');ids.add(node.id);}data=result;ingestHistory(result.activity??[]);draw();return true;}catch(error){if(!disposed&&token===generation)setStatus('Could not load Worlds: '+error.message,true);return false;}}
 search.addEventListener('input',()=>{query=search.value.toLowerCase().trim();updateSearch();});search.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=data.nodes.find(matches);if(first)openDetails(first);}});
 let drag=null;graph.addEventListener('pointerdown',event=>{if(event.target.closest('[data-world-node]')||event.button!==0)return;viewAdjusted=true;drag={x:event.clientX,y:event.clientY,view:{...graphView}};graph.setPointerCapture(event.pointerId);});graph.addEventListener('pointermove',event=>{if(!drag)return;const rect=graph.getBoundingClientRect(),scale=Math.max(drag.view.w/Math.max(1,rect.width),drag.view.h/Math.max(1,rect.height));graphView.x=drag.view.x-(event.clientX-drag.x)*scale;graphView.y=drag.view.y-(event.clientY-drag.y)*scale;applyView();});for(const type of ['pointerup','pointercancel'])graph.addEventListener(type,()=>{drag=null;});graph.addEventListener('wheel',event=>{event.preventDefault();if(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)){if(graphView){viewAdjusted=true;graphView.x+=(event.deltaX||event.deltaY)*graphView.w/Math.max(1,graphPane.clientWidth);applyView();}}else zoom(event.deltaY>0?1.12:1/1.12);},{passive:false});
 window.addEventListener('focus',syncPlaybackVisibility);window.addEventListener('blur',syncPlaybackVisibility);document.addEventListener('visibilitychange',syncPlaybackVisibility);
 const unsubscribe=typeof subscribe==='function'?subscribe(receive):null;renderEvents();renderPageBreadcrumbs();updatePlaybackStatus();void refresh();
 return {element,refresh,replayEvents,setVisible,destroy(){if(disposed)return;disposed=true;generation++;clearTimeout(playbackTimer);if(logFrame!==null)clearTimeout(logFrame);if(typeof unsubscribe==='function')unsubscribe();window.removeEventListener('focus',syncPlaybackVisibility);window.removeEventListener('blur',syncPlaybackVisibility);document.removeEventListener('visibilitychange',syncPlaybackVisibility);element.remove();}};
}
