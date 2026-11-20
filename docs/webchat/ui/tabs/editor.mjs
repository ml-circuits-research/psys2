// The Documents tab: the generic SOP area view over the docs.editor projection (worlds/docs.editor/area.sop).
// What is shown is the page the area's rules set from the w.document instance (render-projection.sop); the
// inspector is built from the area's declared controls. This file only mounts the view as a scrolling page.
import {createSopAreaView} from '../sop-area-view.mjs';
const CSS = `.p2-area-page .p2-area-stage{align-items:flex-start;overflow:auto;background:#e8edf5}
.p2-area-page .p2-area-stage>svg{width:100%;max-width:820px;max-height:none;margin:0 auto;box-shadow:0 1px 4px #0002;border-radius:4px}
.p2-area-page .p2-area-stage g[data-selected="true"]:has(text){filter:none}
.p2-area-page .p2-area-inspector textarea{font:inherit;resize:vertical}`;
function make(holder, host) {
 if (!document.getElementById('p2-area-page-css')) { const style = document.createElement('style'); style.id = 'p2-area-page-css'; style.textContent = CSS; document.head.append(style); }
 Object.assign(holder.style, {padding:'0', height:'100%', minHeight:'0', maxWidth:'none', overflow:'hidden', boxSizing:'border-box'});
 const root = document.createElement('div'); root.style.height = '100%'; root.style.minHeight = '0'; root.className = 'p2-area-page'; holder.append(root);
 const ui = createSopAreaView(root, host, {world:'docs.editor', view:'editor', editor:true});
 ui.update(host.state?.('docs.editor')); ui.setVisible(!holder.hidden);
 return {...ui, update(state){ ui.update(state); }, destroy(){ ui.destroy(); root.remove(); }};
}
export default {id:'editor', label:'Documents', world:'docs.editor', order:20, make};
