// Where a new object goes when the request names no place: the placement problem the area's own rules declare
// (app.place.region candidates in their order, each with the object's size there, and app.place.objective), solved
// as std.problem by the library: Z3 where the page can run it, the internal search otherwise. Nothing here knows a
// tab or a kind; the regions, sizes and weights are the area's.
//
// In each region the object's centre stays inside the region when the object fits there (else at its middle) and
// the object stays on the frame; it keeps the declared gap from every observed object except the region's host
// (soft, peerWeight each) and is as near the region's centre as it can be (soft, centreWeight per unit of distance
// on each axis; vertically at the region's fy share), with its centre not on an object's centre (soft, stackWeight).
// The first region (in the declared order) whose solution overlaps nothing wins, else the one that overlaps the fewest.
import {solveProblem,parse,str} from '../vendor/sopworld/sopworld.mjs';
import {placementSearchProvider,z3Status} from './placement-search-provider.mjs';

const field=(row,key)=>{const raw=row?.attrs[key]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
const n=v=>Number.isInteger(v)?String(v):String(+v.toFixed(6));

/** The std.problem packet for one region: the subject's box corner as variables, the peers, frame and centre box. */
export function regionProblem({region,frame,peers,objective,objects=peers}) {
 const s=region.size,hs=s/2,fw=frame.max_x-frame.min_x,fh=frame.max_y-frame.min_y;
 const range=(lo,hi,f0,f1)=>{const mid=(lo+hi)/2;let a=Math.min(lo+hs,mid),b=Math.max(hi-hs,mid);
  const pa=f0+hs,pb=Math.max(f0+hs,f1-hs);a=Math.min(Math.max(a,pa),pb);b=Math.min(Math.max(b,pa),pb);return [a-hs,Math.max(a,b)-hs];};
 const [x0,x1]=range(region.min_x,region.max_x,frame.min_x,frame.max_x),[y0,y1]=range(region.min_y,region.max_y,frame.min_y,frame.max_y);
 const grid=Number(objective.grid)>0?Number(objective.grid):Math.max(1,Math.min(fw,fh)/40);
 // The point the subject is pulled to: the middle of the region across, and at fy (a share 0 to 100 of its height, 50 by default) down.
 const fy=Number.isFinite(region.fy)?region.fy:50,cx=(region.min_x+region.max_x)/2,cy=region.min_y+(region.max_y-region.min_y)*fy/100;
 const lines=[],refs={var:[],box:[],constraint:[]};
 const add=(kind,id,text)=>{lines.push('@'+id+' std.problem.'+kind+' '+text);refs[kind].push('$'+id);};
 add('var','vx',`name=x min=${n(x0)} max=${n(x1)} step=${n(grid)}`);
 add('var','vy',`name=y min=${n(y0)} max=${n(y1)} step=${n(grid)}`);
 add('box','subject',`name=subject x=x y=y w=${n(s)} h=${n(s)}`);
 // The centre of the region, as the box the subject would have there: aligning with it pulls the subject's centre.
 add('box','centre',`name=centre x=${n(cx-hs)} y=${n(cy-hs)} w=${n(s)} h=${n(s)}`);
 const weight=Number(objective.centreWeight??1);
 add('constraint','centre.x',`name=centre.x predicate=align a=subject b=centre axis=x edge=0.5 strength=soft weight=${n(weight)}`);
 add('constraint','centre.y',`name=centre.y predicate=align a=subject b=centre axis=y edge=0.5 strength=soft weight=${n(weight)}`);
 peers.forEach((peer,i)=>{
  add('box','peer'+i,`name=peer${i} x=${n(peer.min_x)} y=${n(peer.min_y)} w=${n(peer.max_x-peer.min_x)} h=${n(peer.max_y-peer.min_y)}`);
  add('constraint','apart'+i,`name=apart${i} predicate=apart a=subject b=peer${i} gap=${n(Number(objective.gap??0))} strength=soft weight=${n(Number(objective.peerWeight??100))}`);
 });
 // Not centred on an object (its container too): the subject's centre stays out of a window of stackDistance around
 // the object's centre, i.e. the subject's box is not inside that window grown by the subject's size (soft).
 const d=Number(objective.stackDistance);
 if(d>0)objects.forEach((object,i)=>{
  const ox=(object.min_x+object.max_x)/2,oy=(object.min_y+object.max_y)/2;
  add('box','stack'+i,`name=stack${i} x=${n(ox-hs-d)} y=${n(oy-hs-d)} w=${n(s+2*d)} h=${n(s+2*d)}`);
  add('constraint','offcentre'+i,`name=offcentre${i} predicate=outside a=subject b=stack${i} strength=soft weight=${n(Number(objective.stackWeight??50))}`);
 });
 const budget=Number(objective.budget)>0?Number(objective.budget):2000;
 return `@problem std.problem.request budget=${budget} ${[...refs.var.map(r=>'var='+r),...refs.box.map(r=>'box='+r),...refs.constraint.map(r=>'constraint='+r)].join(' ')}\n${lines.join('\n')}`;
}

const overlapping=(a,b,gap)=>a.min_x<b.max_x+gap&&b.min_x<a.max_x+gap&&a.min_y<b.max_y+gap&&b.min_y<a.max_y+gap;

/**
 * Solve the declared default placement of the command `intent` on `host` (an area host with placementProblem and
 * observeSpatial), with `provider` (Z3 where the page can run it by default; none: the internal search). Answers { x, y, size, region, provider, overlaps, solves, ms } or null when the area declares no
 * problem for this command.
 */
export async function solveDefaultPlacement(host,{intent,provider=placementSearchProvider()}) {
 if(typeof host.placementProblem!=='function'||typeof host.observeSpatial!=='function')return null;
 const declared=host.placementProblem(intent);
 if(!declared)return null;
 const spatial=host.observeSpatial(),boxes=new Map(spatial.boxes.map(box=>[box.entity,box]));
 const frame=boxes.get(spatial.frame);
 if(!frame)return null;
 const occupants=spatial.occupants.map(id=>boxes.get(id)).filter(Boolean);
 const gap=Number(declared.objective.gap??0);
 const started=performance.now(),solves=[],seen=new Set();
 let best=null;
 for(const region of declared.regions){
  const key=[region.size,region.min_x,region.min_y,region.max_x,region.max_y,region.host].join(',');
  if(seen.has(key))continue;
  seen.add(key);
  const peers=occupants.filter(box=>box.entity!==region.host);
  const packet=regionProblem({region,frame,peers,objects:occupants,objective:declared.objective});
  const t0=performance.now();
  const out=await solveProblem(packet,provider?{provider}:{});
  const rows=parse(out),result=rows.find(row=>row.type==='std.problem.result'),status=field(result,'status');
  const values=Object.fromEntries(rows.filter(row=>row.type==='std.problem.assignment').map(row=>[field(row,'var'),Number(field(row,'value'))]));
  const solve={region:region.key,status,provider:field(result,'provider'),ms:Math.round((performance.now()-t0)*10)/10};
  solves.push(solve);
  if(status!=='solved'||!Number.isFinite(values.x)||!Number.isFinite(values.y))continue;
  const box={min_x:values.x,min_y:values.y,max_x:values.x+region.size,max_y:values.y+region.size};
  const overlaps=peers.filter(peer=>overlapping(box,peer,gap)).length;
  solve.overlaps=overlaps;
  if(!best||overlaps<best.overlaps)best={region,values,overlaps,provider:solve.provider};
  if(overlaps===0)break;
 }
 if(!best)return {solved:false,solves,ms:Math.round(performance.now()-started),z3:z3Status()};
 const round=v=>Math.round(v*10)/10,hs=best.region.size/2;
 return {solved:true,candidates:declared.regions.map(r=>r.key+'@'+r.size),x:round(best.values.x+hs),y:round(best.values.y+hs),size:best.region.size,region:best.region.key,provider:best.provider,
  overlaps:best.overlaps,solves,ms:Math.round(performance.now()-started),z3:z3Status()};
}
