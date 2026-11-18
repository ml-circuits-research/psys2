import {editorGestureSop} from '../../src/dialog/native-control-intent.mjs';
import {prepareNativeControlHost} from '../../src/dialog/native-control-preparation.mjs';
import {invokeNativeControl} from '../../src/dialog/native-tool-controls.mjs';

export async function performGesture(session,{view,operation,args={}}){
 const sop=await editorGestureSop(operation,args,async()=>(await prepareNativeControlHost(session,{view})).bindings());
 return invokeNativeControl(session,{view,sop});
}
