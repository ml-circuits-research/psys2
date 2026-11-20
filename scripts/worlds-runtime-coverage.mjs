// Measures which registered runtime modules execute code during real chat turns (V8 precise coverage in the page and the engine worker).
// Usage: node scripts/worlds-runtime-coverage.mjs [site root] [output.json]; see specs/js-generality-audit.md.
// Which runtime modules execute code during real chat turns (engine worker + page), from V8 precise coverage.
import {writeFileSync} from 'node:fs';
import {openBrowserReaderRoute} from '/home/salboaie/work/sopworlds/psys2/scripts/lib/browser-reader-route.mjs';
const [root=undefined,out='/dev/stdout']=process.argv.slice(2);
const b=await openBrowserReaderRoute({root});
const wait=async(expression,ms=120000)=>{const end=Date.now()+ms;while(!await b.evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,150));}};
const turns=[['diagram','add a circle and a square'],['diagram','connect the circle to the square'],['draw','draw a house'],['draw','put a sun above the house'],['draw','make it bigger'],['calendar','add a meeting tomorrow at 10'],['editor','write a title about cats'],['avatar','smile'],['draw','undo']];
try{
 await wait(`!window.psys2.isBusy()`);
 const sessions=b.targets().map(t=>t.sessionId).concat([undefined]);
 for(const id of sessions){try{await b.call('Profiler.enable',{},id);await b.call('Profiler.startPreciseCoverage',{callCount:true,detailed:false},id);}catch(e){console.error('cov',id,e.message);}}
 const replies=[];
 for(const [tab,text] of turns){await b.evaluate(`window.psys2.showTab('${tab}');true`);await wait(`!window.psys2.isBusy()`);await b.evaluate(`window.psys2.send(${JSON.stringify(text)});true`);await new Promise(r=>setTimeout(r,400));await wait(`!window.psys2.isBusy()`);replies.push([tab,text,await b.evaluate(`[...document.querySelectorAll('[class*=msg]')].at(-1)?.textContent?.slice(0,140)??null`)]);}
 const executed={};
 for(const id of b.targets().map(t=>t.sessionId).concat([undefined])){let r;try{r=await b.call('Profiler.takePreciseCoverage',{},id);}catch{continue;}
  for(const script of r.result){const m=script.url.match(/\/(lib|ui|worlds|vendor)\/(.+?\.mjs)/)||script.url.match(/\/(app\.mjs)/);if(!m)continue;const rel=m[1]==='app.mjs'?'docs/webchat/app.mjs':m[1]==='lib'?'src/'+m[2]:m[1]==='worlds'?'worlds/'+m[2]:m[1]==='vendor'?'docs/webchat/vendor/'+m[2]:'docs/webchat/ui/'+m[2];
   const calls=script.functions.filter(f=>f.functionName!==''||f.ranges[0].startOffset>0).reduce((n,f)=>n+(f.ranges[0].count>0?1:0),0);executed[rel]=(executed[rel]??0)+calls;}}
 writeFileSync(out,JSON.stringify({turns:replies,executed},null,1));console.log(JSON.stringify(replies,null,1));console.log(Object.keys(executed).length,'scripts');
}finally{await b.close();}
