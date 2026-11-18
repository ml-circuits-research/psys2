// SPDX-License-Identifier: AGPL-3.0-only
// Drawing authority consists of owned board, object and vector SOP facts.
import { toolInstanceStateCodec } from '../tool-instance-state.mjs?v=d6522ec37e';
import authoredSchema from './state-schema-source.mjs?v=9b442dbc4b';
import { copyHostData } from '../native-tool-host.mjs?v=7abe128286';
import { initialState } from './board.mjs?v=bedcd7dae6';

export const DRAWING_STATE_SCHEMA=authoredSchema;
const board=toolInstanceStateCodec(authoredSchema,'art.draw.state.board');

const uiFields = new Set(['selected','selectedIds','selectedPart','idDisplay','last','history','future',
 'prev','stepGroup','lastMove','lastMoveInfo','pendingJoin','advised','drawnAsSaid','guessSaid']);
const initialRuntime = () => ({selected:null,last:[],history:[],future:[]});
function recordTuple(array,names) {
 if(!Array.isArray(array)||array.length!==names.length)throw TypeError('drawing-geometry-tuple');
 return Object.fromEntries(names.map((key,index)=>[key,array[index]]));
}
const readTuple=(record,names)=>names.map(key=>record[key]);
function vec(record, id) {
 const { matrix,pts,...rest }=record;
 return {...rest,...(id?{id,nativeType:'art.draw.part'}:{}),
  ...(matrix===undefined?{}:{matrix:recordTuple(matrix,'abcdef'.split(''))}),
  ...(pts===undefined?{}:{pts:pts.map(point=>recordTuple(point,['x','y']))})};
}
function unvec({ id,nativeType,matrix,pts,...rest }) {
 return {...rest,...(matrix===undefined?{}:{matrix:readTuple(matrix,'abcdef'.split(''))}),
  ...(pts===undefined?{}:{pts:pts.map(point=>readTuple(point,['x','y']))})};
}
function objectToFacts({ geometryMatrix,shape,parts,extra,...object },depth=0) {
 if(depth>32)throw RangeError('drawing-group-depth');
 const facts={...object,nativeType:'art.draw.object'};
 if(geometryMatrix!==undefined)facts.geometryMatrix=recordTuple(geometryMatrix,'abcd'.split(''));
 if(parts!==undefined)facts.parts=Object.entries(parts).map(([role,color])=>({role,color}));
 if(extra!==undefined)facts.extra=Object.entries(extra).map(([role,count])=>({role,count}));
 if(shape!==undefined){
  const { members,parts:vectors,...rest }=shape;
  const exposed=!object.hide?.length&&!Object.keys(extra??{}).length;
  facts.shape={...rest};
  if(vectors!==undefined)facts.shape.parts=vectors.map((part,index)=>vec(part,exposed?JSON.stringify([object.id,'part',index]):undefined));
  if(members!==undefined)facts.shape.members=members.map(child=>objectToFacts(child,depth+1));
 }
 return facts;
}
function objectFromFacts({ nativeType,geometryMatrix,shape,parts,extra,...object }) {
 if(nativeType!=='art.draw.object')throw TypeError('drawing-object-interface');
 const native={...object};
 if(geometryMatrix!==undefined)native.geometryMatrix=readTuple(geometryMatrix,'abcd'.split(''));
 if(parts!==undefined)native.parts=Object.fromEntries(parts.map(row=>[row.role,row.color]));
 if(extra!==undefined)native.extra=Object.fromEntries(extra.map(row=>[row.role,row.count]));
 if(shape!==undefined){
  const { members,parts:vectors,...rest }=shape;
  native.shape={...rest};
  if(vectors!==undefined)native.shape.parts=vectors.map(unvec);
  if(members!==undefined)native.shape.members=members.map(objectFromFacts);
 }
 return native;
}
const convertObjects=(state,convert)=>({...state,
 objects:state.objects.map(object=>convert(object)),
 ...(state.sunStash===undefined?{}:{sunStash:state.sunStash.map(object=>convert(object))})});
function checkedRuntime(input) {
 const runtime=copyHostData(input??{});
 if(!runtime||Array.isArray(runtime)||!Object.keys(runtime).every(key=>uiFields.has(key)) ||
  ['history','future','last'].some(key=>Object.hasOwn(runtime,key)&&!Array.isArray(runtime[key])))throw TypeError('drawing-runtime-fields');
 return {...initialRuntime(),...runtime};
}
function checkBoard(state) {
 if(state.nextId<1)throw RangeError('drawing-next-id');
 for(const object of [...state.objects,...(state.sunStash??[])]){
  if(!object.kind||!Number.isFinite(object.x)||!Number.isFinite(object.y)||!(object.size>0))throw TypeError('drawing-object-geometry');
 }
 return state;
}
function decodeCarrier(carrier) {
 if(Object.keys(carrier).some(key=>key!=='sop'&&key!=='runtime'))throw TypeError('drawing-carrier-fields');
 const decoded=board.decode(carrier.sop);
 const state=checkBoard(convertObjects(decoded.data,objectFromFacts));
 return {world:decoded.world,state,runtime:checkedRuntime(carrier.runtime)};
}
export function canonicalDrawingState(input=initialState()) {
 if(Object.hasOwn(input,'sop')){
  const decoded=decodeCarrier(input);
  return {sop:input.sop,runtime:decoded.runtime};
 }
 const data=copyHostData(input),runtime={},state={};
 for(const [key,value] of Object.entries(data))(uiFields.has(key)?runtime:state)[key]=value;
 return {sop:board.encode(convertObjects(checkBoard(state),objectToFacts)),runtime:checkedRuntime(runtime)};
}
export function toNativeDrawingState(input) {
 if(!Object.hasOwn(input,'sop'))return copyHostData(input);
 const decoded=decodeCarrier(input);
 return {...decoded.state,...decoded.runtime};
}
export const drawingStateWorld = carrier => decodeCarrier(carrier).world;
export const DRAWING_STATE_INTERFACE={
 canonicalizeState:canonicalDrawingState,projectState:toNativeDrawingState,stateWorld:drawingStateWorld,
 stateSchema:DRAWING_STATE_SCHEMA,stateInterfaceTypeKey:'nativeType',separateRuntime:true,
 observationOnlyTypes:['art.draw.part','art.draw.page'],
};
