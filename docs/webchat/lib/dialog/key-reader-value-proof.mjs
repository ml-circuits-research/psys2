// Exact declared-value proofs; no language rules or domain vocabulary.
import {numberValue} from '../knowledge/values.mjs?v=3842436585';
import {parseNumberRun} from '../knowledge/number-run.mjs?v=671295a6b1';
import {budget} from './budget.mjs?v=00bce6e369';
import {selectedProbability} from './model-selection-score.mjs?v=ac3ac10191';
export function classifierAlternative(bank,logits){
 if(!Array.isArray(bank)||!Array.isArray(logits)||logits.length!==bank.length||!logits.length||logits.some(v=>typeof v!=='number'||!Number.isFinite(v)))return {index:null,state:'invalid',probability:null};
 const max=Math.max(...logits),indices=logits.flatMap((v,i)=>v===max?[i]:[]);
 if(indices.length!==1)return {index:null,state:'ambiguous',probability:null};
 const index=indices[0],entry=bank[index];return {index,state:entry.state,...(Object.hasOwn(entry,'value')?{value:entry.value}:{}),probability:selectedProbability(logits,index)};
}
export function canonicalLiteralProof(bank,literal,logits,tick=()=>{}){
 if(typeof literal!=='string'||!Array.isArray(bank))return null;
 const matches=[];for(let i=0;i<bank.length;i++){tick();const e=bank[i];if(e?.state==='value'&&typeof e.value==='string'&&e.value===literal)matches.push(i);}
 if(matches.length!==1)return null;
 const alternative=classifierAlternative(bank,logits);return {kind:'declared-canonical-string',value:literal,bankIndex:matches[0],classifier:alternative,disagrees:alternative.state!=='value'||alternative.value!==literal};
}
export function positiveIntegerLiteralProof(literal){
 if(typeof literal!=='string'||!/^[0-9]+$/.test(literal))return null;
 const value=Number(literal);return Number.isSafeInteger(value)&&value>0?{kind:'positive-safe-integer',value,literal}:null;
}

/** Read only an already anchored cardinal span. Words come from k.values. */
export function positiveCardinalProof(literal){
 const digits=positiveIntegerLiteralProof(literal);
 if(digits)return digits;
 if(typeof literal!=='string'||!literal)return null;
 const value=numberValue(literal,'cardinal');
 return Number.isSafeInteger(value)&&value>0?{kind:'declared-cardinal-number',value,literal,world:'k.values'}:null;
}

/**
 * The one number a value span spells for a numeric property ("size 45" -> 45, "two hundred sixty" -> 260, "-3.5"):
 * digits or a run of declared number words (k.values), the other words being no number and no unit (isUnit: the
 * binding table's unit lemmas; a measure with a unit needs its own projection). Null otherwise.
 */
export function spelledNumberProof(literal,isUnit=()=>false){
 // isUnit(word): false/null for no unit, true for a unit that cannot be converted, or {factor} for one that can (the
 // value is the number times the factor); at most one unit word.
 if(typeof literal!=='string'||!literal.trim())return null;
 const words=literal.toLowerCase().replace(/[,;:!?]+/g,' ').split(/\s+/).filter(Boolean),found=[];let factor=1;
 for(let i=0;i<words.length;i++){
  budget.tick('value-proof.spelled');
  const w=words[i];
  if(/^[-+]?\d+(\.\d+)?$/.test(w)){found.push(Number(w));continue;}
  const run=parseNumberRun(words,i);
  if(run){found.push(run.value);i+=run.length-1;continue;}
  if(/\d/.test(w))return null;
  const unit=isUnit(w);
  if(unit===true||unit&&factor!==1)return null;
  if(unit&&typeof unit==='object'&&Number.isFinite(unit.factor))factor=unit.factor;
 }
 return found.length===1&&Number.isFinite(found[0])?{kind:'spelled-number',value:+(found[0]*factor).toFixed(6),literal,...(factor!==1?{factor}:{})}:null;
}
