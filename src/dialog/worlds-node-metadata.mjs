// Authored architecture help. Representation describes this node, not all of its dependencies.
// A native adapter does not become a SOP World because its interface contains SOP declarations.
const COMPONENTS={
 'runtime:registry':'Loads the editor packages and their declared source files. It is the JavaScript loader, not the world that stores your drawing or calendar.',
 'component:reader':'Finds actions, objects and values in your words using SOP-BERT. It proposes requests; it does not draw objects or change editor state.',
 'component:formalizer':'Checks the reader’s proposed objects and properties against declared meanings and capabilities before execution.',
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
 'project:schema':'Defines the domain and instance links allowed in Main World, so the central registry can be validated.',
 'browser:instance-store':'Buffers work only when you explicitly export it. It does not automatically save or restore the editors.',
 'browser:intent-records':'Collects the text, SOP command and actual effect of UI actions for inspection and explicit training-data export.',
 'browser:chat-history':'Keeps displayed messages and UI event history. Clearing chat history does not clear editor objects or their Undo journals.',
 'browser:worlds-view':'Draws this architecture map and opens details from runtime records. It is a JavaScript inspector, not a reasoning World.'
};
const FIELDS={
 face:'Keeps the avatar’s complete composition, parts and adjustments.',selectedSlot:'Identifies the avatar part currently selected for editing.',
 title:'Stores the document title.',titleMarks:'Keeps the formatting applied to the document title.',titleAlign:'Controls the title alignment.',titleSize:'Controls the displayed title size.',
 blocks:'Stores the document’s ordered content blocks and their hierarchy.',cursor:'Tracks the current document insertion position.',selection:'Identifies the selected document range or blocks.',focus:'Tracks which editor field receives input.',inputMode:'Tracks the editor’s current input mode.',
 history:'Keeps earlier states for the editor’s Undo operation.',future:'Keeps states available for Redo after an Undo.',undo:'Keeps the editor’s undo entries.',redo:'Keeps its redo entries.',
 nextId:'Allocates the next object identity without reusing an existing one.',dictBlock:'Tracks the content block receiving dictated text.',kind:'Keeps the document’s current kind.',about:'Keeps the document’s declared subject.',textId:'Links the editor content to its text identity.',doc:'Keeps the document representation used by the native editor.',stats:'Keeps document statistics used by the editor.',
 shapes:'Stores the diagram nodes and their geometry.',edges:'Stores connections and arrow properties between diagram nodes.',rules:'Stores the diagram’s declared layout rules.',seq:'Tracks generated identities within object families.',edgeSeq:'Allocates connection identities.',ruleSeq:'Allocates layout-rule identities.',order:'Tracks drawing order for diagram elements.',frame:'Stores the current diagram coordinate frame.',frames:'Keeps the diagram’s named frames.',groups:'Stores diagram group membership and group properties.',last:'Identifies the objects affected by the last editor operation.',selected:'Identifies the current selection.',pending:'Keeps an unfinished editor operation until it can be completed.',rev:'Tracks the diagram’s revision.',chartTools:'Stores charts embedded in Diagram and their editor state.',compositionHistory:'Keeps earlier diagram/chart compositions for Undo.',compositionFuture:'Keeps diagram/chart compositions available for Redo.',
 canvas:'Stores the drawing canvas properties.',objects:'Stores the drawing’s current objects and grouped constituents.',background:'Controls the drawing background.',sky:'Keeps the current sky treatment.',ground:'Keeps the ground treatment.',groundColor:'Controls the ground colour.',mood:'Keeps the scene’s chosen mood.',sunStash:'Keeps a temporarily hidden sun so it can be restored.',sunPose:'Keeps the sun’s scene placement.',seed:'Keeps the scene’s random seed.',rels:'Stores relationships between drawing objects.',scenes:'Stores named drawing compositions and their members.',sceneSeq:'Allocates scene identities.',
 activeTab:'Identifies the editor tab currently used for request routing.',previousTab:'Keeps the preceding editor tab for navigation.',speaker:'Controls spoken response playback.',listening:'Tracks microphone listening state.',handsFree:'Controls hands-free voice interaction.',rate:'Stores the speech playback rate.',language:'Stores the interface language selection.',
 sop:'Carries the canonical SOP text. Its linked instance contains the actual domain facts; this JavaScript property is only their container.',
 v:'Identifies the session-memory format.',newEngineUndo:'Keeps turn-level snapshots for Undo across editor actions.',newEngineRedo:'Keeps turn-level snapshots available for Redo.',newEngineFocus:'Keeps the most recently focused object in each editor.',newEngineLastAction:'Keeps the preceding interpreted action for follow-up requests.',discourse:'Keeps conversational referents used by follow-up requests.',dialogue:'Keeps the dialogue’s current context.',astra:'Keeps the session’s auxiliary conversation state.',recent:'Keeps recent conversational references.'
};
const TITLES={'art.draw':'Drawing','diagram.sketch':'Diagram','time.calendar':'Calendar','docs.editor':'Documents','ui.avatar':'Avatar','ui.shell':'Interface'};
const display=world=>TITLES[world]??world;
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
 const representation=worldsNodeRepresentation(node),world=node.details?.world??node.id.split(':')[1],name=display(world);
 let why=COMPONENTS[node.id]??node.why;
 if(!why&&node.id.startsWith('world:'))why=`Declares the ${display(node.id.slice(6))} package and connects its schemas to the application. The live instance stores the current objects; native adapters remain separate.`;
 if(!why&&node.id.startsWith('instance:'))why=`Keeps the current ${name} objects and relationships as SOP facts. ${node.implementation?.startsWith('Authoritative')?'These facts own the operational state.':'These facts are observed from the native editor, which still owns the operational state.'}`;
 if(!why&&node.id.startsWith('native:'))why=node.description?.startsWith('SOP carrier')?`Holds the transport container for ${display(node.id.slice(7))}’s canonical SOP state. Its linked instance is the authority; renderer objects are temporary projections.`:`Keeps ${display(node.id.slice(7))}’s operational editor data. This state is still JavaScript; its linked SOP instance is an observation.`;
 if(!why&&node.id.startsWith('interpreter:'))why=`Connects ${display(node.id.slice(12))} tools to the actual editor state and exposes their observations. Its geometry and domain handlers still run in JavaScript.`;
 if(!why&&(node.id.startsWith('structure:')||node.id.startsWith('session-memory:')))why=FIELDS[node.details?.key??node.id.split(':').at(-1)]??`Keeps the ${node.details?.key??node.label} runtime value. Its exact contents are available in Data; no SOP authority is implied.`;
 if(!why&&node.kind==='schema')why=node.details?.role==='native-tool-interface'?`Defines ${name} tool operations and parameters so concrete commands can be validated before invocation.`:node.id.startsWith('governing-schema:')?`Defines the facts, values and references allowed in ${name}’s operational SOP state.`:`Defines the types, fields and constraints for ${node.details?.schemaWorld??node.details?.module??node.label}. Its source is a definition, not live editor state.`;
 if(!why&&node.id.startsWith('execution:episode:'))why='Retains the actual SOP evidence from one operation, so its inputs and observed changes can be inspected later.';
 if(!why&&node.id.startsWith('knowledge-file:'))why=node.id.endsWith('.sop')?'Provides this exact SOP source file to the knowledge loader. Opening it for inspection does not prove that a request used its knowledge.':'Provides catalog metadata that locates the published SOP definitions. This file is not SOP Lang.';
 if(!why&&node.id.startsWith('knowledge-world:'))why=`Publishes the ${node.label} definition and its declared source files. Availability in this catalog does not establish use by the running request.`;
 why??=node.help?.purpose??node.description??'Exposes an actual runtime record for inspection; its role has not yet been documented.';
 const sourceText=typeof node.wires==='string'&&node.wires.trim()?node.wires:undefined;
 const usageReason=node.usageReason??(node.id==='knowledge-world:k.interest'?'This demo has no interest-scoring call. Its executor snapshot contains an older schema, but not the scoring facts; opening these sources does not activate that mechanism.':node.usage==='available'?'This definition is published in the catalog. No source read is recorded for the current session; catalog membership does not establish a working demo capability.':undefined);
 return {...node,...(node.id.startsWith('knowledge-world:')?{role:'Published catalog definition'}:{}),wires:sourceText,representation,why,...(usageReason?{usageReason}:{}),sopAvailable:representation==='sop'&&(sourceText!==undefined||(node.sourceFiles??[]).some(file=>file.path?.endsWith('.sop')))};
}
export const describeWorldsNodes=nodes=>nodes.map(describeWorldsNode);
