// Maximum-emission legal BIO path. This is structural decoding, never confidence.
export function decodeBioViterbi(emissions,{maxTokens=4096,maxWork=100000}={}){
 let work=0;const budget={tick(){if(++work>maxWork)throw Error('bio-budget');}};
 const refused=reason=>({ok:false,labels:[],reason,work,decoder:'bio-viterbi/1',calibrated:false});
 const array=(value,limit)=>{
  budget.tick();if(!Array.isArray(value))throw Error('invalid-emissions');
  const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if(!Number.isSafeInteger(length)||length>limit)throw Error('emission-limit');
  const descriptors=Object.getOwnPropertyDescriptors(value),out=[];
  for(const key of Reflect.ownKeys(descriptors)){
   budget.tick();if(key==='length')continue;
   if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value'))throw Error('invalid-emissions');
  }
  for(let i=0;i<length;i++){budget.tick();if(!Object.hasOwn(descriptors,String(i)))throw Error('sparse-emissions');out.push(descriptors[i].value);}
  return out;
 };
 try{
  if(!Number.isSafeInteger(maxTokens)||maxTokens<1||!Number.isSafeInteger(maxWork)||maxWork<1)return refused('invalid-limits');
  const rows=array(emissions,maxTokens).map(row=>{budget.tick();const values=array(row,3);if(values.length!==3||values.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('invalid-logit');return values;});
  if(!rows.length)return {ok:true,labels:[],summedLogit:0,paths:1,work,decoder:'bio-viterbi/1',calibrated:false};
  let scores=[rows[0][0],rows[0][1],null],counts=[1,1,0];const back=[[-1,-1,-1]];
  for(let i=1;i<rows.length;i++){
   budget.tick();const next=[null,null,null],ways=[0,0,0],parents=[-1,-1,-1];
   for(let state=0;state<3;state++){
    budget.tick();
    for(let previous=0;previous<3;previous++){
     budget.tick();if(scores[previous]===null||state===2&&previous===0)continue;
     const score=scores[previous]+rows[i][state];if(!Number.isFinite(score))throw Error('nonfinite-path-score');
     if(next[state]===null||score>next[state]){next[state]=score;ways[state]=counts[previous];parents[state]=previous;}
     else if(score===next[state])ways[state]=Math.min(2,ways[state]+counts[previous]);
    }
   }
   scores=next;counts=ways;back.push(parents);
  }
  let best=null,state=-1,paths=0;
  for(let i=0;i<3;i++){budget.tick();if(scores[i]===null)continue;if(best===null||scores[i]>best){best=scores[i];state=i;paths=counts[i];}else if(scores[i]===best)paths=Math.min(2,paths+counts[i]);}
  if(paths!==1)return {...refused('ambiguous-best-path'),summedLogit:best,paths};
  const labels=new Array(rows.length);
  for(let i=rows.length-1;i>=0;i--){budget.tick();labels[i]=state;state=back[i][state];}
  return {ok:true,labels,summedLogit:best,paths,work,decoder:'bio-viterbi/1',calibrated:false};
 }catch(error){return refused(error.message||'invalid-emissions');}
}
