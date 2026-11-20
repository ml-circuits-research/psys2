// Authored architecture help. Representation describes this node, not all of its dependencies.
// A native adapter does not become a SOP World because its interface contains SOP declarations.
const COMPONENTS={
 'runtime:registry':'Loads the editor packages and their declared source files. It is the JavaScript loader, not the world that stores your drawing or calendar.',
 'component:reader':'Finds actions, objects and values in your words using SOP-BERT. It proposes requests; it does not draw objects or change editor state.',
 'component:request-admission':'Assesses and ranks the reader’s candidate graphs against the configured confidence policy before execution.',
 'component:reasoner':'Runs a conversation turn, routes its requests and keeps the preceding action available for follow-up commands and Undo.',
 'component:control-interpreter':'Reads the concrete SOP commands emitted by editor gestures and validates their tool arguments. These exact commands do not need SOP-BERT to interpret them again.',
 'component:library':'Provides the SOP parser, typed Worlds and shared reasoning mechanisms. This node is their JavaScript implementation; linked schema nodes contain their SOP declarations.',
 'runtime:activity-bus':'Carries the execution events that animate this map and populate the log. It observes recorded boundaries and makes no decisions itself.',
 'runtime:session-memory':'Keeps conversational references, focus and undo/redo journals between commands. This container is still JavaScript state.',
 'knowledge:catalog':'Indexes the published worlds and the files that define them. This is a catalog managed by JavaScript, not a SOP knowledge World.',
 'execution:policy':'Stores omitted-argument defaults and knowledge-value joins as SOP facts, so the action executor reads these choices instead of an operation-specific JavaScript map. Current time comes from its declared host clock.',
 'execution:composition-policy':'Declares the order for separately read requests and their shared Undo group. It does not infer whether repeated nouns are targets or reference objects.',
 'execution:source-snapshot':'Supplies the frozen SOP knowledge used by the executors. Its recorded version may differ from the live catalog; that version is shown in the metadata.',
 'execution:module:new-engine':'Applies property changes through declared tool bindings and checks the observed effect. This executor is JavaScript even though it reads SOP knowledge.',
 'execution:module:declared-execution':'Binds a checked creation, movement or removal request to a real editor tool. The tool adapter performs the effect and returns evidence.',
 'execution:journal':'Keeps the evidence from completed operations so the system can inspect what changed. The collection is JavaScript; each linked evidence record contains its retained SOP facts.',
 'project:application':'Links each editor tab to its domain, schema and current instance. The application reads these SOP facts when resolving the active editor.',
 'project:schema':'Defines the domain and instance links allowed in the tab registry World, so the central registry can be validated.',
 'browser:instance-store':'Saves and restores editor instance archives as SOP and makes the stored wires available for export.',
 'browser:intent-records':'Collects the text, SOP command and actual effect of UI actions for inspection and explicit training-data export.',
 'browser:chat-history':'Keeps displayed messages and UI event history. Clearing chat history does not clear editor objects or their Undo journals.',
 'browser:worlds-view':'Draws this architecture map and opens details from runtime records. It is a JavaScript inspector, not a reasoning World.'
};
// Area titles come from the world index (inspectWorldsRuntime sets areaTitle); no title table is kept here.
const display=(world,node)=>node?.areaTitle??world;
const USAGE_REASONS={
 available:'This definition is published in the catalog. No source read is recorded for the current session; catalog membership does not establish a working demo capability.',
 'inspection-only':'Its sources were opened for inspection only. Opening a source does not activate any reasoning mechanism.',
 'runtime-read':'Its sources were read by the runtime in this session. Reading a source does not activate a reasoning mechanism by itself; only recorded activity events show which mechanism ran.',
};
export function worldsNodeRepresentation(node){
 if(node.id==='component:reader')return 'model';
 if(node.representation)return node.representation;
 if(/^(?:browser:|native:|structure:|session-memory:)/.test(node.id)||['runtime','component','adapter','interpreter','storage','structure'].includes(node.kind))return 'javascript';
 if(node.id==='knowledge:catalog'||node.id.startsWith('knowledge-file:')&&!node.id.endsWith('.sop'))return 'catalog';
 if(node.id.startsWith('world:'))return node.packageHasNativeCode?'javascript':'sop';
 if(['schema','instance','knowledge','episode','method','project','world'].includes(node.kind))return 'sop';
 return 'javascript';
}
export function describeWorldsNode(node){
 const representation=worldsNodeRepresentation(node),world=node.details?.world??node.id.split(':')[1],name=display(world,node);
 let why=COMPONENTS[node.id]??node.why;
 if(!why&&node.id.startsWith('world:'))why=`Declares the ${display(node.id.slice(6),node)} package and connects its schemas to the application. The live instance stores the current objects; native adapters remain separate.`;
 if(!why&&node.id.startsWith('instance:'))why=`Keeps the current ${name} objects and relationships as SOP facts. ${node.implementation?.startsWith('Authoritative')?'These facts own the operational state.':'These facts are observed from the native editor, which still owns the operational state.'}`;
 if(!why&&node.id.startsWith('native:'))why=`Keeps ${display(node.id.slice(7),node)}’s operational editor data. The linked SOP instance observes its declared facts.`;
 if(!why&&node.id.startsWith('interpreter:'))why=`Connects ${display(node.id.slice(12),node)} tools to the actual editor state and exposes their observations. Its geometry and domain handlers still run in JavaScript.`;
 if(!why&&node.kind==='schema')why=node.details?.role==='native-tool-interface'?`Defines ${name} tool operations and parameters so concrete commands can be validated before invocation.`:node.id.startsWith('governing-schema:')?`Defines the facts, values and references allowed in ${name}’s operational SOP state.`:`Defines the types, fields and constraints for ${node.details?.schemaWorld??node.details?.module??node.label}. Its source is a definition, not live editor state.`;
 if(!why&&node.id.startsWith('execution:episode:'))why='Retains the actual SOP evidence from one operation, so its inputs and observed changes can be inspected later.';
 if(!why&&node.id.startsWith('knowledge-file:'))why=node.id.endsWith('.sop')?'Provides this exact SOP source file to the knowledge loader. Opening it for inspection does not prove that a request used its knowledge.':'Provides catalog metadata that locates the published SOP definitions. This file is not SOP Lang.';
 if(!why&&node.id.startsWith('knowledge-world:'))why=`Publishes the ${node.label} definition and its declared source files. Availability in this catalog does not establish use by the running request.`;
 why??=node.help?.purpose??node.description??'Exposes an actual runtime record for inspection; its role has not yet been documented.';
 const sourceText=typeof node.wires==='string'&&node.wires.trim()?node.wires:undefined;
 // Usage reasons are the same for every world: no world is named here (a per-world reason belongs in its catalog entry).
 const usageReason=node.usageReason??USAGE_REASONS[node.usage];
 return {...node,...(node.id.startsWith('knowledge-world:')?{role:'Published catalog definition'}:{}),wires:sourceText,representation,why,...(usageReason?{usageReason}:{}),sopAvailable:representation==='sop'&&(sourceText!==undefined||(node.sourceFiles??[]).some(file=>file.path?.endsWith('.sop')))};
}
export const describeWorldsNodes=nodes=>nodes.map(describeWorldsNode);
