// Permanent avatar editor. One native ui.avatar instance, with a canvas and inspector.
import {createAvatar} from '../avatar.mjs';
export default {
 id:'avatar',label:'Avatar',world:'ui.avatar',order:100,
 make(holder,host){
  Object.assign(holder.style,{padding:'0',height:'100%',minHeight:'0',maxWidth:'none',overflow:'hidden',boxSizing:'border-box'});
  const root=document.createElement('div');root.style.height='100%';root.style.minHeight='0';holder.append(root);
  const ui=createAvatar(root,host,{editor:true});ui.update(host.state?.('ui.avatar'));ui.setVisible(!holder.hidden);
  const visibility=typeof MutationObserver==='function'?new MutationObserver(()=>ui.setVisible(!holder.hidden)):null;
  visibility?.observe(holder,{attributes:true,attributeFilter:['hidden','style']});
  return {...ui,update(state){ui.update(state);ui.setVisible(!holder.hidden);},destroy(){visibility?.disconnect();ui.destroy();root.remove();}};
 },
 effects:{'avatar.animate':async(args,{ui})=>{ui.animate(args);return {ok:true};}},
};
