// Read-only description of the std.problem search providers for the Worlds map. It reads the provider module's
// exported status and the recorded placement activity; it never loads, warms or calls Z3.
import {placementSearchStatus} from './placement-search-provider.mjs?v=b75b2ff894';
import {z3Version} from '../vendor/sopworld/smt-z3.mjs?v=014593d224';

// The single read of the provider's state (placementSearchStatus is the provider's z3Status accessor).
const readStatus=()=>placementSearchStatus();

const isPlacement=event=>event?.operation==='std.placement';
const STATES={'not-loaded':'not loaded','not loaded':'not loaded',warming:'warming',loading:'warming',ready:'ready',loaded:'ready',unavailable:'unavailable',failed:'unavailable'};

/**
 * The state of each placement search provider: the library's internal search (always available) and Z3.
 * Z3 states: not loaded, warming, ready (with its load time), unavailable (page not cross-origin isolated, or
 * the load failed). activity: the retained world-activity events; the last placement end says which provider
 * solved it.
 */
export function describePlacementSearch({status=readStatus(),activity=[]}={}){
 // Only the compile end carries a provider (the effect check that follows has none).
 const ends=activity.filter(event=>isPlacement(event)&&event.phase==='end'&&event.provider),lastEnd=ends.at(-1);
 const load=status?.load??null,version=status?.version??z3Version,base=status?.base??null,error=status?.error??load?.error??null;
 // An older status record has no state: derive it from support and the load record.
 // A page that cannot run Z3 never loads it, whatever the provider has recorded so far.
 const raw=!status?.supported?'unavailable':status?.state??(load?.status==='loaded'?'ready':load?.status==='failed'?'unavailable':'not-loaded');
 const state=STATES[raw]??String(raw),loadMs=Number.isFinite(status?.loadMs)?status.loadMs:Number.isFinite(load?.ms)?load.ms:null;
 const notIsolated=status?.isolated===false||!status?.supported;
 // What started the load: the worker's start-up preload, the idle warm-up or a placement turn.
 const started=status?.warmedBy?({startup:'the start-up',idle:'the idle warm-up',turn:'a placement'})[status.warmedBy]??String(status.warmedBy):null;
 const summary={
  'not loaded':'Not loaded: nothing has been fetched yet; the idle warm-up or the first placement problem loads it.',
  warming:'Warming: loading from '+(base??'the library site')+(started?' (started by '+started+')':'')+'.',
  ready:'Ready: loaded from '+(load?.base??base)+' (z3-solver '+version+(loadMs!=null?', '+Math.round(loadMs)+' ms':'')+(started?', started by '+started:'')+').',
  unavailable:error?'Unavailable: the load failed ('+error+'); the internal search answers.'
   :notIsolated?'Unavailable: the page is not cross-origin isolated (no SharedArrayBuffer), so the internal search answers.'
   :'Unavailable; the internal search answers.',
 }[state]??state;
 return {z3:{state,summary,version,base,supported:!!status?.supported,isolated:status?.isolated??null,loadMs,warmedBy:status?.warmedBy??null,
  error,lastSolve:status?.lastSolve??null},lastSolvedBy:lastEnd?.provider??null,lastStatus:lastEnd?.status??null,lastPlacementAt:lastEnd?.time??null,placements:ends.length};
}
