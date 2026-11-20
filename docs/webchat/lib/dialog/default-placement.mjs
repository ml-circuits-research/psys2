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
// What holds the object up (app.place.avoid, from k.scenes.support): it keeps out of every observed region of a
// surface it avoids (the water of a river or a lake, a road), a hard constraint; when no region can keep that, the
// placement is solved again with the surfaces as a soft constraint of avoidWeight, so it still keeps out where it can.
// A thing that lies in the land (app.place.peers strength=hard: a lake, a river) keeps clear of every observed object
// the same way: hard first, then soft at peerWeight.
import {solveProblem,parse,str} from '../vendor/sopworld/sopworld.mjs?v=915a9d5c18';
import {placementSearchProvider,z3Status} from './placement-search-provider.mjs?v=547b7a981b';
import {resolveObjective,chooseRegion,stopAtNoOverlap} from './placement-default-policy.mjs?v=e2e7db903c';
// Every weight, budget, grid division and centre share an area leaves out comes from the declared application defaults
// (worlds/app.project/placement-default-policy.sop app.placement.default); the keys taken from there are reported
// (defaulted), and the candidate region is chosen by its declared criteria (std.decide of=app.place.region).
const D=()=>resolveObjective({}).objective;

const field=(row,key)=>{const raw=row?.attrs[key]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
const n=v=>Number.isInteger(v)?String(v):String(+v.toFixed(6));

/** The std.problem packet for one region: the subject's box corner as variables, the peers, frame and centre box. */
// footprint: the share of its size the object occupies across and down (app.place.footprint: a river by its water,
// not by the square it is drawn in); the whole square by default.
export function regionProblem({region,frame,peers,objective,objects=peers,avoid=[],avoidStrength='hard',footprint,peerStrength='soft',prefer=[]}) {
 const s=region.size,hs=s/2,fw=frame.max_x-frame.min_x,fh=frame.max_y-frame.min_y;
 const sw=s*(footprint?.w>0?footprint.w:1),sh=s*(footprint?.h>0?footprint.h:1),hw=sw/2,hh=sh/2;
 const range=(lo,hi,f0,f1,hs)=>{const mid=(lo+hi)/2;let a=Math.min(lo+hs,mid),b=Math.max(hi-hs,mid);
  const pa=f0+hs,pb=Math.max(f0+hs,f1-hs);a=Math.min(Math.max(a,pa),pb);b=Math.min(Math.max(b,pa),pb);return [a-hs,Math.max(a,b)-hs];};
 const [x0,x1]=range(region.min_x,region.max_x,frame.min_x,frame.max_x,hw),[y0,y1]=range(region.min_y,region.max_y,frame.min_y,frame.max_y,hh);
 const grid=Number(objective.grid)>0?Number(objective.grid):Math.max(1,Math.min(fw,fh)/D().gridDivisions);
 // The point the subject is pulled to: the middle of the region across, and at fy (a share 0 to 100 of its height, 50 by default) down.
 const fy=Number.isFinite(region.fy)?region.fy:D().fy,cx=(region.min_x+region.max_x)/2,cy=region.min_y+(region.max_y-region.min_y)*fy/100;
 const lines=[],refs={var:[],box:[],constraint:[]};
 const add=(kind,id,text)=>{lines.push('@'+id+' std.problem.'+kind+' '+text);refs[kind].push('$'+id);};
 add('var','vx',`name=x min=${n(x0)} max=${n(x1)} step=${n(grid)}`);
 add('var','vy',`name=y min=${n(y0)} max=${n(y1)} step=${n(grid)}`);
 add('box','subject',`name=subject x=x y=y w=${n(sw)} h=${n(sh)}`);
 // The centre of the region, as the box the subject would have there: aligning with it pulls the subject's centre.
 add('box','centre',`name=centre x=${n(cx-hw)} y=${n(cy-hh)} w=${n(sw)} h=${n(sh)}`);
 const weight=Number(objective.centreWeight??D().centreWeight);
 add('constraint','centre.x',`name=centre.x predicate=align a=subject b=centre axis=x edge=0.5 strength=soft weight=${n(weight)}`);
 add('constraint','centre.y',`name=centre.y predicate=align a=subject b=centre axis=y edge=0.5 strength=soft weight=${n(weight)}`);
 peers.forEach((peer,i)=>{
  add('box','peer'+i,`name=peer${i} x=${n(peer.min_x)} y=${n(peer.min_y)} w=${n(peer.max_x-peer.min_x)} h=${n(peer.max_y-peer.min_y)}`);
  add('constraint','apart'+i,`name=apart${i} predicate=apart a=subject b=peer${i} gap=${n(Number(objective.gap??D().gap))} strength=${peerStrength}${peerStrength==='soft'?' weight='+n(Number(objective.peerWeight??D().peerWeight)):''}`);
 });
 // Not centred on an object (its container too): the subject's centre stays out of a window of stackDistance around
 // the object's centre, i.e. the subject's box is not inside that window grown by the subject's size (soft).
 const d=Number(objective.stackDistance);
 if(d>0)objects.forEach((object,i)=>{
  const ox=(object.min_x+object.max_x)/2,oy=(object.min_y+object.max_y)/2;
  add('box','stack'+i,`name=stack${i} x=${n(ox-hw-d)} y=${n(oy-hh-d)} w=${n(sw+2*d)} h=${n(sh+2*d)}`);
  add('constraint','offcentre'+i,`name=offcentre${i} predicate=outside a=subject b=stack${i} strength=soft weight=${n(Number(objective.stackWeight??D().stackWeight))}`);
 });
 // Out of every region of a surface the object avoids (hard; soft at avoidWeight when relaxed).
 avoid.forEach((box,i)=>{
  add('box','avoid'+i,`name=avoid${i} x=${n(box.min_x)} y=${n(box.min_y)} w=${n(box.max_x-box.min_x)} h=${n(box.max_y-box.min_y)}`);
  add('constraint','keepout'+i,`name=keepout${i} predicate=apart a=subject b=avoid${i} gap=0 strength=${avoidStrength}${avoidStrength==='soft'?' weight='+n(Number(objective.avoidWeight??D().avoidWeight)):''}`);
 });
 // Out of the regions it prefers to keep out of (soft, at their own weight: the columns over standing things).
 prefer.forEach((box,i)=>{
  add('box','prefer'+i,`name=prefer${i} x=${n(box.min_x)} y=${n(box.min_y)} w=${n(box.max_x-box.min_x)} h=${n(box.max_y-box.min_y)}`);
  add('constraint','aside'+i,`name=aside${i} predicate=apart a=subject b=prefer${i} gap=0 strength=soft weight=${n(box.weight)}`);
 });
 const budget=Number(objective.budget)>0?Number(objective.budget):D().budget;
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
 const gap=Number(declared.objective.gap??D().gap);
 const avoided=new Set(declared.avoid??[]),avoid=(spatial.regions??[]).filter(r=>avoided.has(r.kind)&&[r.min_x,r.min_y,r.max_x,r.max_y].every(Number.isFinite));
 // Regions it keeps out of where it can (app.place.avoid strength=soft weight=), at their weight.
 const weights=new Map((declared.prefer??[]).map(p=>[p.surface,Number(p.weight)||1])),prefer=(spatial.regions??[]).filter(r=>weights.has(r.kind)&&[r.min_x,r.min_y,r.max_x,r.max_y].every(Number.isFinite)).map(r=>({...r,weight:weights.get(r.kind)}));
 const started=performance.now(),solves=[],solved=[];
 const hardPeers=declared.peers==='hard'&&occupants.length>0;
 for(const avoidStrength of avoid.length||hardPeers?['hard','soft']:['hard']){
 const seen=new Set();
 for(const region of declared.regions){
  const key=[region.size,region.min_x,region.min_y,region.max_x,region.max_y,region.host].join(',');
  if(seen.has(key))continue;
  seen.add(key);
  const peers=occupants.filter(box=>box.entity!==region.host);
  // A region on a surface the object goes onto is not avoided there (its host's own surface).
  const keepout=avoid.filter(r=>r.entity!==region.host);
  const packet=regionProblem({region,frame,peers,objects:occupants,objective:declared.objective,avoid:keepout,avoidStrength,footprint:declared.footprint,prefer:prefer.filter(r=>r.entity!==region.host),peerStrength:hardPeers&&avoidStrength==='hard'?'hard':'soft'});
  const t0=performance.now();
  const out=await solveProblem(packet,provider?{provider}:{});
  const rows=parse(out),result=rows.find(row=>row.type==='std.problem.result'),status=field(result,'status');
  const values=Object.fromEntries(rows.filter(row=>row.type==='std.problem.assignment').map(row=>[field(row,'var'),Number(field(row,'value'))]));
  const solve={region:region.key,status,provider:field(result,'provider'),ms:Math.round((performance.now()-t0)*10)/10,...(avoid.length?{avoid:avoidStrength}:{})};
  solves.push(solve);
  if(status!=='solved'||!Number.isFinite(values.x)||!Number.isFinite(values.y))continue;
  const fpw=region.size*(declared.footprint?.w>0?declared.footprint.w:1),fph=region.size*(declared.footprint?.h>0?declared.footprint.h:1);
  const box={min_x:values.x,min_y:values.y,max_x:values.x+fpw,max_y:values.y+fph};
  const overlaps=peers.filter(peer=>overlapping(box,peer,gap)).length;
  solve.overlaps=overlaps;
  solved.push({region,values,overlaps,order:solved.length,provider:solve.provider,avoid:avoid.length?avoidStrength:undefined});
  if(overlaps===0&&stopAtNoOverlap())break;
 }
 if(solved.length)break;
 }
 if(!solved.length)return {solved:false,solves,ms:Math.round(performance.now()-started),z3:z3Status(),defaulted:defaultedKeys(declared.objective,declared.regions,'budget')};
 // The declared criteria (fewest overlaps, then declared order) pick the region; the choice is part of the result.
 const choice=chooseRegion(solved),best=solved[choice.index];
 const round=v=>Math.round(v*10)/10,hx=best.region.size*(declared.footprint?.w>0?declared.footprint.w:1)/2,hy=best.region.size*(declared.footprint?.h>0?declared.footprint.h:1)/2;
 return {solved:true,candidates:declared.regions.map(r=>r.key+'@'+r.size),x:round(best.values.x+hx),y:round(best.values.y+hy),size:best.region.size,region:best.region.key,provider:best.provider,
  overlaps:best.overlaps,avoid:best.avoid,solves,ms:Math.round(performance.now()-started),z3:z3Status(),choice:{input:choice.input,sop:choice.sop},defaulted:defaultedKeys(declared.objective,declared.regions,'budget')};
}

/**
 * The std.problem packet for several new objects placed together (a count, or coordinated things): each subject's
 * box corner as variables in its own region, as regionProblem places one, and every pair of subjects kept the
 * declared gap apart (soft, peerWeight each) like observed objects. One problem, solved at once.
 */
// Each subject keeps out of the observed regions of the surfaces it avoids (avoid: boxes; hard, or soft at
// avoidWeight when relaxed), as regionProblem does for one object.
export function groupProblem({subjects,frame,occupants,objective,avoidStrength='hard'}) {
 const fw=frame.max_x-frame.min_x,fh=frame.max_y-frame.min_y,grid=Number(objective.grid)>0?Number(objective.grid):Math.max(1,Math.min(fw,fh)/D().gridDivisions);
 const lines=[],refs={var:[],box:[],constraint:[]},peerWeight=Number(objective.peerWeight??D().peerWeight),gap=Number(objective.gap??D().gap),weight=Number(objective.centreWeight??D().centreWeight),d=Number(objective.stackDistance);
 const add=(kind,id,text)=>{lines.push('@'+id+' std.problem.'+kind+' '+text);refs[kind].push('$'+id);};
 occupants.forEach((peer,k)=>add('box','peer'+k,`name=peer${k} x=${n(peer.min_x)} y=${n(peer.min_y)} w=${n(peer.max_x-peer.min_x)} h=${n(peer.max_y-peer.min_y)}`));
 subjects.forEach(({region},i)=>{
  const s=region.size,hs=s/2;
  const range=(lo,hi,f0,f1)=>{const mid=(lo+hi)/2;let a=Math.min(lo+hs,mid),b=Math.max(hi-hs,mid);
   const pa=f0+hs,pb=Math.max(f0+hs,f1-hs);a=Math.min(Math.max(a,pa),pb);b=Math.min(Math.max(b,pa),pb);return [a-hs,Math.max(a,b)-hs];};
  const [x0,x1]=range(region.min_x,region.max_x,frame.min_x,frame.max_x),[y0,y1]=range(region.min_y,region.max_y,frame.min_y,frame.max_y);
  const fy=Number.isFinite(region.fy)?region.fy:D().fy,cx=(region.min_x+region.max_x)/2,cy=region.min_y+(region.max_y-region.min_y)*fy/100;
  add('var','vx'+i,`name=x${i} min=${n(x0)} max=${n(x1)} step=${n(grid)}`);
  add('var','vy'+i,`name=y${i} min=${n(y0)} max=${n(y1)} step=${n(grid)}`);
  add('box','subject'+i,`name=subject${i} x=x${i} y=y${i} w=${n(s)} h=${n(s)}`);
  add('box','centre'+i,`name=centre${i} x=${n(cx-hs)} y=${n(cy-hs)} w=${n(s)} h=${n(s)}`);
  add('constraint','centre.x'+i,`name=centre.x${i} predicate=align a=subject${i} b=centre${i} axis=x edge=0.5 strength=soft weight=${n(weight)}`);
  add('constraint','centre.y'+i,`name=centre.y${i} predicate=align a=subject${i} b=centre${i} axis=y edge=0.5 strength=soft weight=${n(weight)}`);
  occupants.forEach((peer,k)=>{
   if(peer.entity!==region.host)add('constraint',`apart${i}.${k}`,`name=apart${i}.${k} predicate=apart a=subject${i} b=peer${k} gap=${n(gap)} strength=soft weight=${n(peerWeight)}`);
   if(d>0){const ox=(peer.min_x+peer.max_x)/2,oy=(peer.min_y+peer.max_y)/2;
    add('box',`stack${i}.${k}`,`name=stack${i}.${k} x=${n(ox-hs-d)} y=${n(oy-hs-d)} w=${n(s+2*d)} h=${n(s+2*d)}`);
    add('constraint',`offcentre${i}.${k}`,`name=offcentre${i}.${k} predicate=outside a=subject${i} b=stack${i}.${k} strength=soft weight=${n(Number(objective.stackWeight??D().stackWeight))}`);}
  });
  (subjects[i].avoid??[]).filter(r=>r.entity!==region.host).forEach((r,k)=>{
   add('box',`avoid${i}.${k}`,`name=avoid${i}.${k} x=${n(r.min_x)} y=${n(r.min_y)} w=${n(r.max_x-r.min_x)} h=${n(r.max_y-r.min_y)}`);
   add('constraint',`keepout${i}.${k}`,`name=keepout${i}.${k} predicate=apart a=subject${i} b=avoid${i}.${k} gap=0 strength=${avoidStrength}${avoidStrength==='soft'?' weight='+n(Number(objective.avoidWeight??D().avoidWeight)):''}`);
  });
  for(let j=0;j<i;j++)add('constraint',`together${i}.${j}`,`name=together${i}.${j} predicate=apart a=subject${i} b=subject${j} gap=${n(gap)} strength=soft weight=${n(peerWeight)}`);
 });
 const budget=Number(objective.budget)>0?Number(objective.budget):D().groupBudget;
 return `@problem std.problem.request budget=${budget} ${[...refs.var.map(r=>'var='+r),...refs.box.map(r=>'box='+r),...refs.constraint.map(r=>'constraint='+r)].join(' ')}\n${lines.join('\n')}`;
}

/**
 * Several new objects without a requested place, placed together in ONE std.problem: `intents` are their calls (one
 * per object; a count repeats the call). Each object takes its own declared regions in order; the regions are tried
 * level by level (every object at its first region, then its second, ...), and the first level whose solution
 * overlaps nothing wins, else the one with the fewest overlaps (reported). Answers { solved, places: [{ x, y, size,
 * region }], overlaps, provider, solves, ms } or null when the area declares no problem for one of them.
 */
export async function solveGroupPlacement(host,{intents,provider=placementSearchProvider()}) {
 if(typeof host.placementProblem!=='function'||typeof host.observeSpatial!=='function')return null;
 const declared=intents.map(intent=>host.placementProblem(intent));
 if(!declared.length||declared.some(d=>!d?.regions?.length))return null;
 const spatial=host.observeSpatial(),boxes=new Map(spatial.boxes.map(box=>[box.entity,box])),frame=boxes.get(spatial.frame);
 if(!frame)return null;
 const occupants=spatial.occupants.map(id=>boxes.get(id)).filter(Boolean),objective=declared[0].objective,gap=Number(objective.gap??D().gap);
 const started=performance.now(),solves=[],levels=Math.max(...declared.map(d=>d.regions.length));
 // What each subject keeps out of (app.place.avoid): the observed regions of those surfaces.
 const avoidOf=d=>{const kinds=new Set(d.avoid??[]);return (spatial.regions??[]).filter(r=>kinds.has(r.kind)&&[r.min_x,r.min_y,r.max_x,r.max_y].every(Number.isFinite));};
 const avoids=declared.map(avoidOf),anyAvoid=avoids.some(a=>a.length);
 const solved=[];
 for(const avoidStrength of anyAvoid?['hard','soft']:['hard']){
 const seen=new Set();
 for(let level=0;level<levels;level++){
  const subjects=declared.map((d,i)=>({region:d.regions[Math.min(level,d.regions.length-1)],avoid:avoids[i]}));
  const key=subjects.map(({region:r})=>[r.size,r.min_x,r.min_y,r.max_x,r.max_y,r.host].join(',')).join(';');
  if(seen.has(key))continue;
  seen.add(key);
  const t0=performance.now(),out=await solveProblem(groupProblem({subjects,frame,occupants,objective,avoidStrength}),provider?{provider}:{});
  const rows=parse(out),result=rows.find(row=>row.type==='std.problem.result'),status=field(result,'status');
  const values=Object.fromEntries(rows.filter(row=>row.type==='std.problem.assignment').map(row=>[field(row,'var'),Number(field(row,'value'))]));
  const solve={level,regions:subjects.map(s=>s.region.key),status,provider:field(result,'provider'),reason:field(result,'reason'),ms:Math.round((performance.now()-t0)*10)/10};
  solves.push(solve);
  if(status!=='solved'||subjects.some((_,i)=>!Number.isFinite(values['x'+i])||!Number.isFinite(values['y'+i])))continue;
  const placed=subjects.map(({region},i)=>({region,box:{min_x:values['x'+i],min_y:values['y'+i],max_x:values['x'+i]+region.size,max_y:values['y'+i]+region.size}}));
  // An object overlaps when it meets an observed object other than its region's host, or another of the group.
  const overlapping=placed.map((p,i)=>occupants.some(peer=>peer.entity!==p.region.host&&overlapping_(p.box,peer,gap))||placed.some((q,j)=>j!==i&&overlapping_(p.box,q.box,gap)));
  const overlaps=overlapping.filter(Boolean).length;
  solve.overlaps=overlaps;
  solved.push({placed,overlapping,overlaps,order:solved.length,provider:solve.provider});
  if(overlaps===0&&stopAtNoOverlap())break;
 }
 if(solved.length)break;
 }
 if(!solved.length)return {solved:false,solves,ms:Math.round(performance.now()-started),z3:z3Status(),defaulted:defaultedKeys(objective,declared.flatMap(d=>d.regions),'groupBudget')};
 const choice=chooseRegion(solved),best=solved[choice.index];
 const round=v=>Math.round(v*10)/10;
 return {solved:true,places:best.placed.map(({region,box},i)=>({x:round(box.min_x+region.size/2),y:round(box.min_y+region.size/2),size:region.size,region:region.key,overlaps:best.overlapping[i]})),
  overlaps:best.overlaps,provider:best.provider,solves,ms:Math.round(performance.now()-started),z3:z3Status(),choice:{input:choice.input,sop:choice.sop},defaulted:defaultedKeys(objective,declared.flatMap(d=>d.regions),'groupBudget')};
}
// The declared default keys a problem actually used: objective keys the area left out (grid divisions only without a
// grid, the centre share only for a region without fy, the budget of this problem kind only).
function defaultedKeys(objective,regions,budgetKey){
 const {defaulted}=resolveObjective(objective);
 return defaulted.filter(key=>key==='gridDivisions'?!(Number(objective.grid)>0):key==='fy'?regions.some(region=>!Number.isFinite(region.fy)):
  key==='budget'||key==='groupBudget'?key===budgetKey&&!(Number(objective.budget)>0):true);
}
const overlapping_=(a,b,gap)=>overlapping(a,b,gap);
