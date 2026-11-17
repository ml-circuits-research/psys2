// Uncalibrated neural decision probabilities used only to rank proposals and fit empirical thresholds.
export const MODEL_SELECTION_SCORE='psys2.model-minimum/1';
export function selectedProbability(logits,index) {
  if(!Array.isArray(logits)||!logits.length||!Number.isSafeInteger(index)||index<0||index>=logits.length||logits.some(v=>!Number.isFinite(v)))throw Error('invalid-decision-logits');
  const max=Math.max(...logits);return Math.exp(logits[index]-max)/logits.reduce((sum,v)=>sum+Math.exp(v-max),0);
}
export function binaryDecisionProbability(logit) {
  if(!Number.isFinite(logit))throw Error('invalid-presence-logit');
  return 1/(1+Math.exp(-Math.abs(logit)));
}
export function combineModelScores(scores) {
  if(!Array.isArray(scores)||scores.length<2||scores.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))return null;
  return {definition:MODEL_SELECTION_SCORE,value:Math.min(...scores),components:scores.length,calibrated:false};
}
