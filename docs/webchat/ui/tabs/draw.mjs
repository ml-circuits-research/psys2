// The Drawing tab: the generic SOP area view over the art.draw projection (worlds/art.draw/area.sop). What is drawn
// is the projection of the w.drawing instance with k.objects; this file only mounts the view and saves the picture.
import {createSopAreaView} from '../sop-area-view.mjs';
function make(holder, host) {
 Object.assign(holder.style, {padding:'0', height:'100%', minHeight:'0', maxWidth:'none', overflow:'hidden', boxSizing:'border-box'});
 const root = document.createElement('div'); root.style.height = '100%'; root.style.minHeight = '0'; root.className = 'p2-area-wide'; holder.append(root);
 const ui = createSopAreaView(root, host, {world:'art.draw', view:'draw', editor:true});
 ui.update(host.state?.('art.draw')); ui.setVisible(!holder.hidden);
 // Saving the picture: the SVG the view shows, as a file.
 const download = ({filename = 'my-drawing'} = {}) => {
  const svg = root.querySelector('svg'); if (!svg) return {ok:false, detail:'nothing is drawn yet'};
  const text = svg.outerHTML.includes('xmlns=') ? svg.outerHTML : svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'image/svg+xml'})); a.download = filename + '.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return {ok:true, detail:'saved ' + filename + '.svg'};
 };
 return {...ui, download, update(state){ ui.update(state); }, destroy(){ ui.destroy(); root.remove(); }};
}
export default {id:'draw', label:'Drawing', world:'art.draw', order:80, make,
 effects:{'draw.download': async (args, {ui}) => (ui?.download ? ui.download(args ?? {}) : {ok:false, detail:'the Drawing tab is not open'})}};
