// Calendar view and typed controls. The world owns all calendars, rooms and events.
const WORLD='time.calendar';
const pad=n=>String(n).padStart(2,'0');
const dateInput=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const clock=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const element=(tag,props={},text)=>{const e=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='class')e.className=v;else if(k==='onClick')e.addEventListener('click',v);else if(k in e)e[k]=v;else e.setAttribute(k,v);}if(text!==undefined)e.textContent=text;return e;};
const button=(text,onClick,cls='')=>element('button',{type:'button',class:'cal-button '+cls,onClick},text);
const CSS=`
.cal-root{font:14px system-ui,sans-serif;color:var(--text,#253048);width:100%;height:100%;display:flex;flex-direction:column;container-type:inline-size;margin:0}.cal-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}.cal-top h2{font-size:24px;margin:0}.cal-muted{color:var(--muted,#667085);font-size:12px;line-height:1.6}.cal-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;grid-template-rows:auto minmax(0,1fr);gap:10px;min-height:0;flex:1}.cal-sidebar{grid-column:1/-1;display:flex;gap:10px;max-height:160px;overflow:auto}.cal-sidebar>.cal-panel{flex:1;min-width:0}.cal-main{grid-column:1;min-width:0;overflow:auto}.cal-inspector{grid-column:2;min-width:0;overflow:auto;align-self:stretch;margin:0}.cal-fields{grid-template-columns:minmax(0,1fr)}.cal-panel{border:1px solid #8797ad44;border-radius:14px;padding:10px;margin-bottom:10px;background:var(--surface,transparent)}.cal-panel h3{font-size:14px;margin:0 0 12px}.cal-button{border:1px solid #8797ad55;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer;background:var(--card,#fff);color:inherit}.cal-button:hover{border-color:#6576db}.cal-button.primary{background:#5966d9;color:white;border-color:#5966d9}.cal-button.small{padding:5px 8px;font-size:12px}.cal-button.danger{color:#bc3748}.cal-button:disabled{opacity:.5;cursor:wait}.cal-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.cal-resource{display:flex;align-items:center;gap:8px;margin:10px 0;overflow-wrap:anywhere}.cal-dot{width:9px;height:9px;flex:none;border-radius:50%;background:var(--cal-color,#6f7ad9)}.cal-resource small{display:block;color:var(--muted,#667085);font-size:11px}.cal-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;min-width:0}.cal-week-scroll{overflow:auto}.cal-day{border:1px solid #8797ad33;border-radius:10px;min-height:225px;padding:7px;background:var(--card,transparent)}.cal-day.selected{border-color:#7986e5;background:#7986e50c}.cal-day-head{display:block;width:100%;border:0;background:none;color:inherit;text-align:left;cursor:pointer;margin-bottom:12px;font:inherit}.cal-day-head strong{font-size:19px;display:block}.cal-event{display:block;text-align:left;max-width:100%;width:100%;border:0;border-left:3px solid var(--cal-color,#6675d7);background:color-mix(in srgb,var(--cal-color,#6675d7) 13%,transparent);border-radius:5px;padding:6px;margin:5px 0;color:inherit;font:inherit;font-size:11px;cursor:pointer;overflow-wrap:anywhere}.cal-event strong{display:block;margin:3px 0}.cal-agenda-row{display:grid;grid-template-columns:95px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid #8797ad22;align-items:center}.cal-agenda-row:last-child{border:0}.cal-empty{padding:24px 12px;text-align:center;color:var(--muted,#667085);line-height:1.7}.cal-room{padding:10px 0;border-bottom:1px solid #8797ad22}.cal-room:last-child{border:0}.cal-dialog{border:1px solid #8797ad55;border-radius:16px;background:var(--card,#fff);color:var(--text,#253048);max-width:480px;width:calc(100% - 48px);padding:24px;box-shadow:0 20px 80px #0003}.cal-dialog::backdrop{background:#11182766}.cal-dialog h3{margin:0 0 18px;font-size:20px}.cal-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.cal-field{display:flex;flex-direction:column;gap:6px;font-size:12px}.cal-field.wide{grid-column:1/-1}.cal-field input,.cal-field select,.cal-field textarea{box-sizing:border-box;width:100%;min-height:38px;border:1px solid #8797ad66;border-radius:8px;padding:8px;background:var(--card,#fff);color:inherit;font:14px system-ui}.cal-dialog .cal-actions{margin-top:20px;justify-content:flex-end}.cal-status{min-height:22px;margin:10px 0;font-size:13px}.cal-status.error{color:#ba3647}.cal-form-error{color:#ba3647;font-size:13px;min-height:18px;margin-top:12px}@container(min-width:1200px){.cal-layout{grid-template-columns:180px minmax(0,1fr) 280px;grid-template-rows:minmax(0,1fr)}.cal-sidebar{grid-column:1;display:block;max-height:none}.cal-main{grid-column:2}.cal-inspector{grid-column:3}}@container(max-width:700px){.cal-layout{grid-template-columns:1fr;overflow:auto}.cal-main,.cal-inspector{grid-column:1;overflow:visible}.cal-sidebar{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.cal-panel{padding:12px}.cal-top h2{font-size:20px}.cal-agenda-row{grid-template-columns:70px 1fr auto;gap:6px}.cal-fields{grid-template-columns:1fr}.cal-field.wide{grid-column:auto}}`;
function make(holder,host){
 if(!document.getElementById('p2-calendar-css'))document.head.append(element('style',{id:'p2-calendar-css'},CSS));
 let state={calendars:[],people:[],rooms:[],meetings:[]},day=new Date(),filter='',pending=false;
 const hidden=new Set(),root=element('section',{class:'cal-root','aria-label':'Calendar planner'}),top=element('div',{class:'cal-top'}),layout=element('div',{class:'cal-layout'}),side=element('aside',{class:'cal-sidebar'}),main=element('div',{class:'cal-main'}),status=element('p',{class:'cal-status',role:'status','aria-live':'polite'}),dialog=element('section',{class:'cal-inspector cal-panel','aria-label':'Calendar properties'});
 holder.append(root);root.append(top,status,layout);layout.append(side,main,dialog);
 dialog.close=()=>{dialog.removeAttribute('data-calendar-form');dialog.replaceChildren(element('h3',{},'Properties'),element('p',{class:'cal-muted'},'Select an event, calendar or room to edit it here.'));};
 dialog.showModal=()=>{dialog.setAttribute('data-calendar-form','');};dialog.close();
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const list=key=>state[key]??[];
 const name=(key,id)=>list(key).find(x=>x.id===id)?.label??'';
 const color=id=>list('calendars').find(x=>x.id===id)?.colour??'#6976d7';
 const busy=()=>pending||host.isBusy?.();
 async function perform(operation,args,message){
  if(busy())return {ok:false,message:'Please wait for the current action.'};
  pending=true;root.setAttribute('aria-busy','true');
  try{const r=await host.tool(operation,args);status.textContent=r.ok?message:r.message;status.classList.toggle('error',!r.ok);return r;}
  catch(e){status.textContent=e.message;status.classList.add('error');return {ok:false,message:e.message};}
  finally{pending=false;root.removeAttribute('aria-busy');}
 }
 function field(form,label,type,value,{wide=false,required=false,options=null,min=null}={}){
  const wrap=element('label',{class:'cal-field'+(wide?' wide':'')},label),input=element(options?'select':type==='textarea'?'textarea':'input',options||type==='textarea'?{}:{type});
  if(options)for(const [v,t]of options)input.append(element('option',{value:v},t));
  input.value=value??'';input.required=required;if(min!==null)input.min=min;wrap.append(input);form.append(wrap);return input;
 }
 function openForm(title,build){
  dialog.replaceChildren();const form=element('form'),fields=element('div',{class:'cal-fields'}),error=element('div',{class:'cal-form-error',role:'alert'}),actions=element('div',{class:'cal-actions'}),cancel=button('Cancel',()=>dialog.close());
  dialog.append(element('h3',{},title),form);form.append(fields,error,actions);const submit=element('button',{type:'submit',class:'cal-button primary'},'Save');actions.append(cancel,submit);
  dialog.setAttribute('data-calendar-form','');
  const handler=build(fields,actions);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity()||busy())return;submit.disabled=true;const r=await handler();submit.disabled=false;if(r?.ok)dialog.close();else error.textContent=r?.message??'Could not save.';});
  dialog.showModal();setTimeout(()=>form.querySelector('input')?.focus(),0);
 }
 function resourceForm(kind,record=null){
  openForm(record?'Edit '+(kind==='calendar'?'calendar':'room'):'New '+(kind==='calendar'?'calendar':'room'),(fields,actions)=>{
   const label=field(fields,'Name','text',record?.label??'',{required:true,wide:true});let colour,capacity,location;
   if(kind==='calendar')colour=field(fields,'Colour','color',record?.colour??'#6976d7');
   else{capacity=field(fields,'Seats (optional)','number',record?.capacity??'',{min:1});location=field(fields,'Location (optional)','text',record?.location??'');}
   if(record)actions.prepend(button('Delete',async()=>{const r=await perform(`calendar.${kind}.remove`,{id:record.id},'Removed '+record.label+'.');if(r.ok)dialog.close();else dialog.querySelector('[role="alert"]').textContent=r.message;},'danger'));
   return ()=>perform(`calendar.${kind}.${record?'change':'add'}`,{id:record?.id??crypto.randomUUID(),label:label.value.trim(),...(colour?{colour:colour.value}:{}),...(capacity&&(capacity.value||record)?{capacity:capacity.value?Number(capacity.value):null}:{}),...(location&&(location.value.trim()||record)?{location:location.value.trim()||null}:{})},(record?'Updated ':'Added ')+label.value.trim()+'.');
  });
 }
 function eventForm(record=null,presetRoom=null){
  if(!list('calendars').length&&!list('rooms').length){resourceForm('calendar');return;}
  const startDate=record?new Date(record.start):new Date(day.getFullYear(),day.getMonth(),day.getDate(),9),endDate=record?new Date(record.start+record.duration):new Date(startDate.getTime()+3600000);
  openForm(record?'Edit event':'New event or room booking',(fields,actions)=>{
   const title=field(fields,'Title','text',record?.title??'',{required:true,wide:true}),date=field(fields,'Date','date',dateInput(startDate),{required:true}),endDay=field(fields,'End date','date',dateInput(endDate),{required:true}),start=field(fields,'Start time','time',clock(startDate),{required:true}),end=field(fields,'End time','time',clock(endDate),{required:true});
   const cal=field(fields,'Personal calendar','select',record?(record.calendar??''):(list('calendars')[0]?.id??''),{options:[['','Room booking only'],...list('calendars').map(c=>[c.id,c.label])]}),room=field(fields,'Room','select',record?.room??presetRoom??'',{options:[['','No room'],...list('rooms').map(r=>[r.id,r.label])]}),notes=field(fields,'Notes (optional)','textarea',record?.notes??'',{wide:true});
   if(record)actions.prepend(button('Delete',async()=>{const r=await perform('calendar.meeting.remove',{id:record.id},'Removed '+record.title+'.');if(r.ok)dialog.close();else dialog.querySelector('[role="alert"]').textContent=r.message;},'danger'));
   return ()=>{
    const from=new Date(date.value+'T'+start.value),to=new Date(endDay.value+'T'+end.value);
    if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from)return {ok:false,message:'The end must be after the start.'};
    if(!cal.value&&!room.value)return {ok:false,message:'Choose a personal calendar or a room.'};
    return perform('calendar.meeting.'+(record?'change':'add'),{id:record?.id??crypto.randomUUID(),title:title.value.trim(),start:+from,duration:to-from,participants:record?.participants??[],calendar:cal.value||null,room:room.value||null,notes:notes.value.trim()},(record?'Updated ':'Added ')+title.value.trim()+'.');
   };
  });
 }
 const sameDay=(a,b)=>dateInput(a)===dateInput(b);
 function visibleEvents(){return list('meetings').filter(m=>!hidden.has(m.calendar)&&(!filter||m.room===filter)).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));}
 function eventsOn(date,events=visibleEvents()){
  const start=new Date(date.getFullYear(),date.getMonth(),date.getDate()),end=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1);
  return events.filter(m=>m.start<+end&&m.start+m.duration>+start);
 }
 const scheduleRender=()=>queueMicrotask(render);
 function render(){
  if(filter&&!list('rooms').some(r=>r.id===filter))filter='';
  top.replaceChildren();side.replaceChildren();main.replaceChildren();
  const heading=element('div');heading.append(element('h2',{},'Your calendar'),element('div',{class:'cal-muted'},'Personal schedules & shared rooms · '+timezone));
  const topActions=element('div',{class:'cal-actions'});topActions.append(button('Undo',async()=>{await perform('undo',{},'Undid the last action.');}),button('+ New event',()=>eventForm(),'primary'));top.append(heading,topActions);
  const calendars=element('section',{class:'cal-panel'});calendars.append(element('h3',{},'Personal calendars'));
  for(const c of list('calendars')){
   const row=element('div',{class:'cal-resource'}),check=element('input',{type:'checkbox',checked:!hidden.has(c.id),'aria-label':'Show '+c.label}),dot=element('span',{class:'cal-dot'});dot.style.setProperty('--cal-color',c.colour??'#6976d7');check.addEventListener('change',()=>{check.checked?hidden.delete(c.id):hidden.add(c.id);scheduleRender();});row.append(check,dot,button(c.label,()=>resourceForm('calendar',c),'small'));calendars.append(row);
  }
  if(!list('calendars').length)calendars.append(element('p',{class:'cal-muted'},'Add a calendar for yourself, your work or a project.'));
  calendars.append(button('+ Calendar',()=>resourceForm('calendar'),'small'));
  const rooms=element('section',{class:'cal-panel'});rooms.append(element('h3',{},'Managed rooms'));
  for(const room of list('rooms')){const row=element('div',{class:'cal-resource'}),label=element('div');label.append(button(room.label,()=>resourceForm('room',room),'small'),element('small',{},[room.capacity?room.capacity+' seats':'',room.location].filter(Boolean).join(' · ')));row.append(label);rooms.append(row);}
  if(!list('rooms').length)rooms.append(element('p',{class:'cal-muted'},'Add a meeting room to see and reserve its time.'));
  rooms.append(button('+ Room',()=>resourceForm('room'),'small'));side.append(calendars,rooms);
  const nav=element('div',{class:'cal-top'}),navActions=element('div',{class:'cal-actions'}),picker=element('input',{type:'date',value:dateInput(day),'aria-label':'Selected date'});
  picker.addEventListener('change',()=>{if(picker.value){day=new Date(picker.value+'T12:00');scheduleRender();}});
  const shift=n=>{day=new Date(day.getFullYear(),day.getMonth(),day.getDate()+n);scheduleRender();};
  navActions.append(button('‹',()=>shift(-7)),button('Today',()=>{day=new Date();scheduleRender();}),button('›',()=>shift(7)),picker);
  const roomSelect=element('select',{'aria-label':'Filter by room'});for(const [id,label]of [['','All rooms & calendars'],...list('rooms').map(r=>[r.id,r.label])])roomSelect.append(element('option',{value:id},label));roomSelect.value=filter;roomSelect.addEventListener('change',()=>{filter=roomSelect.value;scheduleRender();});nav.append(navActions,roomSelect);main.append(nav);
  const scroll=element('div',{class:'cal-week-scroll'}),week=element('div',{class:'cal-week'}),monday=new Date(day.getFullYear(),day.getMonth(),day.getDate()-((day.getDay()+6)%7));scroll.append(week);main.append(scroll);
  for(let i=0;i<7;i++){
   const d=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i),column=element('div',{class:'cal-day'+(sameDay(d,day)?' selected':'')}),head=button(d.toLocaleDateString('en',{weekday:'short'}),()=>{day=d;scheduleRender();},'cal-day-head');head.className='cal-day-head';head.append(element('strong',{},String(d.getDate())));column.append(head);column.addEventListener('dragover',e=>e.preventDefault());column.addEventListener('drop',async e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain'),event=list('meetings').find(m=>m.id===id);if(!event)return;const old=new Date(event.start),next=new Date(d.getFullYear(),d.getMonth(),d.getDate(),old.getHours(),old.getMinutes());const r=await perform('calendar.meeting.move',{id,start:+next},'Moved '+event.title+'.');if(r.ok){day=d;queueMicrotask(render);}});
   for(const event of eventsOn(d)){const chip=button('',()=>eventForm(event));chip.className='cal-event';chip.draggable=true;chip.dataset.event=event.id;
    chip.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',event.id);e.dataTransfer.effectAllowed='move';});
    chip.addEventListener('keydown',async e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const next=new Date(event.start);if(e.key==='ArrowLeft'||e.key==='ArrowRight')next.setDate(next.getDate()+(e.key==='ArrowLeft'?-1:1));else next.setMinutes(next.getMinutes()+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?15:30));const r=await perform('calendar.meeting.move',{id:event.id,start:+next},'Moved '+event.title+'.');if(r.ok){day=next;queueMicrotask(render);}});chip.style.setProperty('--cal-color',color(event.calendar));chip.append(element('span',{},clock(new Date(event.start))+'–'+clock(new Date(event.start+event.duration))),element('strong',{},event.title));if(event.room)chip.append(element('span',{},name('rooms',event.room)));column.append(chip);}week.append(column);
  }
  const agenda=element('section',{class:'cal-panel'});agenda.style.marginTop='16px';agenda.append(element('h3',{},day.toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})));
  const daily=eventsOn(day);if(!daily.length){const empty=element('div',{class:'cal-empty'});empty.append(element('div',{},'No events on this day.'),button('Add an event',()=>eventForm(),'small'));agenda.append(empty);}
  for(const event of daily){const row=element('div',{class:'cal-agenda-row'}),info=element('div');info.append(element('strong',{},event.title),element('div',{class:'cal-muted'},[name('calendars',event.calendar),name('rooms',event.room)].filter(Boolean).join(' · ')));if(event.notes)info.append(element('div',{class:'cal-muted'},event.notes));row.append(element('div',{class:'cal-muted'},clock(new Date(event.start))+'–'+clock(new Date(event.start+event.duration))),info,button('Edit',()=>eventForm(event),'small'));agenda.append(row);}main.append(agenda);
  if(list('rooms').length){const occupancy=element('section',{class:'cal-panel'});occupancy.append(element('h3',{},'Room bookings · '+day.toLocaleDateString('en',{month:'short',day:'numeric'})));for(const room of list('rooms')){const bookings=eventsOn(day,list('meetings').filter(m=>m.room===room.id)),row=element('div',{class:'cal-room'});row.append(element('strong',{},room.label),element('div',{class:'cal-muted'},bookings.length?bookings.map(m=>clock(new Date(m.start))+'–'+clock(new Date(m.start+m.duration))+' '+m.title).join(' · '):'No bookings'),button('Book room',()=>eventForm(null,room.id),'small'));occupancy.append(row);}main.append(occupancy);}
 }
 queueMicrotask(render);return {update(next){state=next&&typeof next==='object'?next:{calendars:[],people:[],rooms:[],meetings:[]};queueMicrotask(render);},destroy(){dialog.close();root.remove();}};
}
export default {id:'calendar',label:'Calendar',world:WORLD,order:70,make};
