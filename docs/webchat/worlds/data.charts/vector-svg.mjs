// SPDX-License-Identifier: AGPL-3.0-only
// Numeric data becomes vector marks in the diagram coordinate frame.
import {SERIES,PALETTES} from './palettes.mjs?v=624dcc19cf';
export {PALETTES};
const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const num=value=>Number(value.toPrecision(12));
const tag=(name,attrs={},body='')=>`<${name} ${Object.entries(attrs).map(([k,v])=>`${k}="${xml(v)}"`).join(' ')}>${body}</${name}>`;
const text=(x,y,value,attrs={})=>tag('text',{x:num(x),y:num(y),fill:'#263646','font-size':11,'font-family':'system-ui, sans-serif',...attrs},xml(value));
const line=(x1,y1,x2,y2,attrs={})=>tag('line',{x1:num(x1),y1:num(y1),x2:num(x2),y2:num(y2),stroke:'#d7e0e7',...attrs});
const circle=(cx,cy,r,attrs={},body='')=>tag('circle',{cx:num(cx),cy:num(cy),r:num(r),...attrs},body);
export function chartBounds(chart,index=0){return {x:60+(index%2)*460,y:60+Math.floor(index/2)*350,width:420,height:300,...chart.placement};}
export function chartRows(chart){
 const ds=chart.datasets??[],rows=(chart.labels??[]).map((label,i)=>({label,value:ds[0]?.data[i],values:ds.map(d=>d.data[i]),index:i}));
 if(!ds.length||rows.some(r=>typeof r.label!=='string'||r.values.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw Error('invalid-chart-data');
 const order=chart.options?.sort;if(order==='asc'||order==='desc')rows.sort((a,b)=>(order==='asc'?1:-1)*(a.value-b.value)||a.index-b.index);else if(order==='alpha')rows.sort((a,b)=>a.label.localeCompare(b.label));return rows;
}
function sector(cx,cy,outer,inner,start,end){
 const pt=(r,a)=>[num(cx+r*Math.cos(a)),num(cy+r*Math.sin(a))],extent=end-start;
 if(extent>=Math.PI*2-1e-8){const loop=r=>`M ${cx-r} ${cy} a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 ${-r*2} 0`;return loop(outer)+(inner?loop(inner):'');}
 return `M ${pt(outer,start).join(' ')} A ${outer} ${outer} 0 ${extent>Math.PI?1:0} 1 ${pt(outer,end).join(' ')} L ${pt(inner,end).join(' ')} ${inner?`A ${inner} ${inner} 0 ${extent>Math.PI?1:0} 0 ${pt(inner,start).join(' ')}`:''} Z`;
}
export function chartSVG(chart,{selected=false,index=0}={}){
 const p=chartBounds(chart,index),W=p.width,H=p.height,rows=chartRows(chart),opts=chart.options??{},datasets=chart.datasets,palette=PALETTES[opts.palette]??SERIES;
 const colour=(si,category=null)=>datasets[si].color??palette[(category!==null&&datasets.length===1?category:si)%palette.length],legend=opts.showLegend!==false,show=opts.showValues===true;
 let body=tag('rect',{x:0,y:0,width:W,height:H,rx:10,fill:'#fff',stroke:selected?'#356ac3':'#d5dee7','stroke-width':selected?3:1});body+=text(18,27,chart.title||'Untitled chart',{'font-size':15,'font-weight':650});
 const lx=58,ty=48,right=W-20,bottom=H-(legend?48:30),pw=right-lx,ph=bottom-ty;
 if(!rows.length)body+=text(W/2,H/2,'No data',{'text-anchor':'middle'});
 else if(['pie','doughnut','polarArea'].includes(chart.type)){
  const radius=Math.min(pw,ph)/2-5,cx=(lx+right)/2,cy=(ty+bottom)/2,hole=chart.type==='doughnut'?radius*.35:0,band=(radius-hole)/datasets.length;
  for(const [si,dataset]of datasets.entries()){
   const magnitude=Math.max(1,...rows.map(r=>r.values[si])),sum=rows.reduce((n,r)=>n+Math.max(0,r.values[si])/magnitude,0);let angle=-Math.PI/2;
   for(const [i,r]of rows.entries()){
    const value=r.values[si],extent=chart.type==='polarArea'?Math.PI*2/rows.length:sum?Math.max(0,value)/magnitude/sum*Math.PI*2:0,inner=hole+band*si;
    const outer=inner+band*(chart.type==='polarArea'?Math.sqrt(Math.max(0,value)/magnitude):1);
    if(extent>0&&outer>inner){body+=tag('path',{d:sector(cx,cy,outer,inner,angle,angle+extent),fill:colour(si,i),stroke:'#fff','stroke-width':1,'fill-rule':'evenodd'},tag('title',{},xml(`${dataset.label}, ${r.label}: ${value}`)));if(show){const rr=(inner+outer)/2;body+=text(cx+rr*Math.cos(angle+extent/2),cy+rr*Math.sin(angle+extent/2),value,{'text-anchor':'middle',fill:'#fff','font-weight':700});}}angle+=extent;
   }
   if(sum===0&&datasets.length===1)body+=text(cx,cy,'All values are zero',{'text-anchor':'middle'});
  }
 }else if(chart.type==='radar'){
  const magnitude=Math.max(1,...rows.flatMap(r=>r.values.map(Math.abs))),min=Math.min(0,...rows.flatMap(r=>r.values))/magnitude,max=Math.max(1,...rows.flatMap(r=>r.values))/magnitude,radius=Math.min(pw,ph)/2-20,cx=(lx+right)/2,cy=(ty+bottom)/2;
  const point=(i,r)=>[cx+Math.cos(-Math.PI/2+i*Math.PI*2/rows.length)*r,cy+Math.sin(-Math.PI/2+i*Math.PI*2/rows.length)*r];
  for(let ring=1;ring<=4;ring++)body+=tag('polygon',{points:rows.map((_,i)=>point(i,radius*ring/4).map(num).join(',')).join(' '),fill:'none',stroke:'#d7e0e7'});
  for(const [i,r]of rows.entries()){const [x,y]=point(i,radius);body+=line(cx,cy,x,y);if(rows.length<=16)body+=text(...point(i,radius+12),r.label,{'text-anchor':'middle','font-size':10});}
  for(const [si,dataset]of datasets.entries()){body+=tag('polygon',{'data-series':si,points:rows.map((r,i)=>point(i,radius*(r.values[si]/magnitude-min)/(max-min)).map(num).join(',')).join(' '),fill:colour(si),'fill-opacity':.15,stroke:colour(si),'stroke-width':2},tag('title',{},xml(dataset.label)));}
 }else{
  const magnitude=Math.max(1,...rows.flatMap(r=>r.values.map(Math.abs))),stacked=opts.stacked===true;
  const limits=rows.flatMap(r=>stacked?[r.values.reduce((n,v)=>n+Math.min(0,v)/magnitude,0),r.values.reduce((n,v)=>n+Math.max(0,v)/magnitude,0)]:r.values.map(v=>v/magnitude));
  const min=Math.min(0,...limits),max=Math.max(1/magnitude,...limits),range=max-min,horizontal=chart.type==='bar'&&opts.horizontal===true;
  const y=v=>ty+(max-v)/range*ph,x=v=>lx+(v-min)/range*pw;
  for(let i=0;i<=4;i++){const v=min*(1-i/4)+max*i/4,value=Number.isFinite(v*magnitude)?num(v*magnitude):`${num(v)} × ${magnitude}`;if(horizontal){const xx=x(v);body+=line(xx,ty,xx,bottom)+text(xx,bottom+15,value,{'text-anchor':'middle','font-size':9});}else{const yy=y(v);body+=line(lx,yy,right,yy)+text(lx-7,yy+4,value,{'text-anchor':'end','font-size':9});}}
  const step=(horizontal?ph:pw)/rows.length,groupWidth=step*.72,band=groupWidth/(stacked?1:datasets.length),points=datasets.map(()=>[]);
  for(const [i,r]of rows.entries()){
   let positive=0,negative=0;
   for(const [si,dataset]of datasets.entries()){
    const value=r.values[si],v=value/magnitude,base=stacked?(v>=0?positive:negative):0,end=base+v,center=(horizontal?ty:lx)+(i+.5)*step,offset=stacked?0:(si-(datasets.length-1)/2)*band;
    if(v>=0)positive=end;else negative=end;
    if(chart.type==='bar'){
     const attrs=horizontal?{x:Math.min(x(base),x(end)),y:center+offset-band/2,width:Math.abs(x(end)-x(base)),height:band}:{x:center+offset-band/2,y:Math.min(y(base),y(end)),width:band,height:Math.abs(y(end)-y(base))};
     body+=tag('rect',{'data-series':si,...Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,num(v)])),fill:colour(si)},tag('title',{},xml(`${dataset.label}, ${r.label}: ${value}`)));
     if(show)body+=horizontal?text(x(end)+4,center+offset+4,value,{'font-size':9}):text(center+offset,y(end)-5,value,{'text-anchor':'middle','font-size':9});
    }else{const xx=lx+(i+.5)*step,yy=y(stacked?end:v);points[si].push([xx,yy]);body+=circle(xx,yy,3.5,{fill:colour(si),'data-series':si},tag('title',{},xml(`${dataset.label}, ${r.label}: ${value}`)));if(show)body+=text(xx,yy-8,value,{'text-anchor':'middle','font-size':9});}
   }
   if(rows.length<=16)body+=horizontal?text(lx-5,ty+(i+.5)*step+4,r.label,{'text-anchor':'end','font-size':9}):text(lx+(i+.5)*step,bottom+15,r.label,{'text-anchor':'middle','font-size':9});
  }
  if(chart.type==='line')for(const [si,path]of points.entries())body+=tag('polyline',{'data-series':si,points:path.map(p=>p.map(num).join(',')).join(' '),stroke:colour(si),'stroke-width':2,fill:'none'});
  body+=horizontal?line(x(0),ty,x(0),bottom,{stroke:'#738496'}):line(lx,y(0),right,y(0),{stroke:'#738496'});
 }
 if(legend){const radial=['pie','doughnut','polarArea'].includes(chart.type),items=radial&&datasets.length===1?rows:datasets;for(const [i,r]of items.slice(0,4).entries()){const xx=18+i*(W-36)/Math.min(4,items.length);body+=tag('rect',{x:xx,y:H-21,width:8,height:8,rx:2,fill:radial&&datasets.length===1?colour(0,i):colour(i)})+text(xx+13,H-13,r.label.slice(0,17),{'font-size':10});}}
 return tag('g',{'data-chart-id':chart.id,class:'dg-chart',transform:`translate(${num(p.x)} ${num(p.y)})`,role:'button',tabindex:0,'aria-label':`${chart.title||'Chart'}, ${chart.type}, ${rows.length} categories, ${datasets.length} series`},body);
}
