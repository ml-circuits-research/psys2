// The Calendar tab: the generic SOP area view over the time.calendar projection (worlds/time.calendar/area.sop).
import {createSopAreaView} from '../sop-area-view.mjs';
function make(holder, host) {
 Object.assign(holder.style, {padding:'0', height:'100%', minHeight:'0', maxWidth:'none', overflow:'hidden', boxSizing:'border-box'});
 const root = document.createElement('div'); root.style.height = '100%'; root.style.minHeight = '0'; holder.append(root);
 const ui = createSopAreaView(root, host, {world:'time.calendar', view:'calendar', editor:true});
 ui.update(host.state?.('time.calendar')); ui.setVisible(!holder.hidden);
 return {...ui, update(state){ ui.update(state); }, destroy(){ ui.destroy(); root.remove(); }};
}
export default {id:'calendar', label:'Calendar', world:'time.calendar', order:70, make};
