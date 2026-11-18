// One-time migration from the former independent chart tab into the diagram instance.
import {migrateChartTools,initialDiagramState} from '../../worlds/diagram.sketch/declared-host.mjs?v=fbda26f01e';
export function migrateDemoState(state){
 if(!state||typeof state!=='object')return state;
 const legacy=state['data.charts'];
 if(legacy){state['diagram.sketch']??=initialDiagramState();migrateChartTools(state['diagram.sketch'],legacy);delete state['data.charts'];}
 if(state['ui.shell']?.activeTab==='charts')state['ui.shell'].activeTab='diagram';
 return state;
}
