// Word lists and small inflection helpers used by the document analyzer (docs.reader). Browser-safe, imports nothing.
// These are data tables of the rule formalizer: the verbs people use in stories, role nouns for characters, place and thing nouns,
// kinship words, speech verbs, first names with a gender, and the function words that never start a name.

export const STOP = new Set(`a an the and or but nor so yet for of in on at to from by with without into onto over under about above below across after before again against along among around as
because been being between both but can could did do does doing down during each either else every few for further had has have having he her here hers herself him himself his how i if is it its itself just
me more most my myself no not now of off once only other our ours ourselves out own same she should since some such than that their theirs them themselves then there these they this those through too
until up very was we were what when where which while who whom why will would you your yours yourself yourselves also soon then even still ever never always much many any all one two three there's it's`.split(/\s+/));

/** Words that start a sentence without being names. */
export const STARTERS = new Set(`the a an and but or so then once soon finally suddenly later early every after before at on in from when while as that this there now today yesterday tomorrow one two some many all
if because although though however meanwhile still yet just only even also not no yes oh well here what who why how where which whose whom he she it they we i you his her their its our my your these those such each
both either neither more most other another few several first second third last next then thus therefore perhaps maybe however instead afterwards afterward again always never often sometimes usually together
nobody everybody everyone someone something nothing everything anything anyone`.split(/\s+/));

export const DAYS_MONTHS = new Set('monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december'.split(' '));

export const PRONOUNS = {
  he: { g: 'm', case: 'nom' }, him: { g: 'm', case: 'obj' }, his: { g: 'm', case: 'poss' }, himself: { g: 'm', case: 'refl' },
  she: { g: 'f', case: 'nom' }, her: { g: 'f', case: 'objposs' }, hers: { g: 'f', case: 'poss' }, herself: { g: 'f', case: 'refl' },
  they: { g: 'p', case: 'nom' }, them: { g: 'p', case: 'obj' }, their: { g: 'p', case: 'poss' }, theirs: { g: 'p', case: 'poss' }, themselves: { g: 'p', case: 'refl' },
};

/** Role nouns for characters, with gender (m, f, '' = unknown) and a flag for plural-only words. */
export const ROLES = {
  father: 'm', dad: 'm', mother: 'f', mom: 'f', mum: 'f', stepmother: 'f', stepfather: 'm', son: 'm', daughter: 'f', brother: 'm', sister: 'f', husband: 'm', wife: 'f', grandmother: 'f', grandfather: 'm', grandma: 'f', grandpa: 'm',
  uncle: 'm', aunt: 'f', cousin: '', parent: '', child: '', baby: '', boy: 'm', girl: 'f', man: 'm', woman: 'f', lady: 'f', gentleman: 'm', maiden: 'f', youth: 'm',
  king: 'm', queen: 'f', prince: 'm', princess: 'f', emperor: 'm', empress: 'f', lord: 'm', duke: 'm', knight: 'm', soldier: '', servant: '', maid: 'f', page: '',
  witch: 'f', wizard: 'm', sorcerer: 'm', fairy: 'f', giant: '', dwarf: 'm', elf: '', ogre: '', troll: '', dragon: '', ghost: '', goblin: '', devil: 'm', angel: '', mermaid: 'f', spirit: '',
  woodcutter: 'm', hunter: 'm', huntsman: 'm', miller: 'm', baker: 'm', tailor: 'm', shoemaker: 'm', farmer: 'm', fisherman: 'm', shepherd: 'm', merchant: 'm', thief: '', robber: '', beggar: '', peasant: '', cook: '', doctor: '', teacher: '', worker: '', judge: '', priest: 'm', captain: 'm', sailor: 'm', pirate: '',
  wolf: '', fox: '', bear: '', lion: '', tiger: '', mouse: '', rat: '', cat: '', dog: '', horse: '', pig: '', goat: '', sheep: '', cow: '', bird: '', duck: '', swan: '', goose: '', hen: 'f', cock: 'm', rooster: 'm', frog: '', toad: '', snake: '', rabbit: '', hare: '', deer: '', donkey: '', owl: '', crow: '', raven: '', dove: '', bee: '', spider: '', fish: '', whale: '', elephant: '', monkey: '',
  friend: '', enemy: '', stranger: '', guest: '', neighbor: '', neighbour: '', villager: '', people: '', children: '', twins: '', couple: '', crowd: '',
  student: '', scientist: '', author: '', writer: '', president: '', manager: '', director: '', professor: '', engineer: '', patient: '', customer: '', citizen: '', leader: '', mayor: '', governor: '', minister: '',
};
export const PLURAL_ROLES = { children: 'child', people: 'person', twins: 'twin', men: 'man', women: 'woman', brothers: 'brother', sisters: 'sister', parents: 'parent', villagers: 'villager', soldiers: 'soldier', servants: 'servant', friends: 'friend' };
/** Generic role words that lose against a more specific one when two descriptions of the same character are merged. */
export const GENERIC = new Set(['woman', 'man', 'boy', 'girl', 'person', 'lady', 'gentleman', 'creature', 'one', 'voice', 'animal', 'bird', 'child', 'stranger', 'youth', 'maiden', 'baby', 'people', 'children']);
export const KIN = new Set(['father', 'dad', 'mother', 'mom', 'mum', 'stepmother', 'stepfather', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife', 'grandmother', 'grandfather', 'grandma', 'grandpa', 'uncle', 'aunt', 'cousin', 'parent', 'friend']);
/** Kinship role -> the role the other person has, by the gender of the first person. */
export const KIN_INVERSE = { brother: { m: 'brother', f: 'sister', '': 'sibling' }, sister: { m: 'brother', f: 'sister', '': 'sibling' }, husband: { m: 'husband', f: 'wife', '': 'spouse' }, wife: { m: 'husband', f: 'wife', '': 'spouse' }, friend: { m: 'friend', f: 'friend', '': 'friend' }, cousin: { m: 'cousin', f: 'cousin', '': 'cousin' },
  father: { m: 'son', f: 'daughter', '': 'child' }, mother: { m: 'son', f: 'daughter', '': 'child' }, stepmother: { m: 'stepson', f: 'stepdaughter', '': 'stepchild' }, stepfather: { m: 'stepson', f: 'stepdaughter', '': 'stepchild' }, dad: { m: 'son', f: 'daughter', '': 'child' }, mom: { m: 'son', f: 'daughter', '': 'child' }, mum: { m: 'son', f: 'daughter', '': 'child' },
  son: { m: 'father', f: 'mother', '': 'parent' }, daughter: { m: 'father', f: 'mother', '': 'parent' }, grandmother: { m: 'grandson', f: 'granddaughter', '': 'grandchild' }, grandfather: { m: 'grandson', f: 'granddaughter', '': 'grandchild' },
  uncle: { m: 'nephew', f: 'niece', '': 'nephew' }, aunt: { m: 'nephew', f: 'niece', '': 'nephew' } };
export const KIN_GENDER = { brother: 'm', sister: 'f', husband: 'm', wife: 'f', father: 'm', mother: 'f', son: 'm', daughter: 'f', uncle: 'm', aunt: 'f', grandmother: 'f', grandfather: 'm', stepmother: 'f', stepfather: 'm', dad: 'm', mom: 'f', mum: 'f' };

export const PLACES = new Set(`forest wood woods house home cottage hut castle palace tower village town city kingdom country land world kitchen garden orchard lake river sea ocean pond well brook stream mountain mountains hill valley cave bridge road path street
field meadow clearing oven cage barn stable church school market inn tavern shop room bedroom hall cellar attic yard island beach desert jungle swamp harbor harbour port farm mill mine prison dungeon temple square park station office hospital library museum factory
shore bank coast border fire fireplace bed door window gate wall roof floor camp tent nest den burrow pit grave heaven hell`.split(/\s+/));
/** Place nouns that are only places when used as the target of a preposition (they are things too). */
export const PLACE_ONLY_AFTER_PREP = new Set(['bed', 'door', 'window', 'gate', 'wall', 'roof', 'floor', 'fire', 'fireplace', 'well', 'bank', 'oven', 'cage', 'path']);
export const PLACE_PREPS = new Set(['in', 'into', 'at', 'to', 'from', 'through', 'across', 'on', 'onto', 'inside', 'outside', 'near', 'behind', 'over', 'under', 'toward', 'towards', 'beside', 'by', 'around', 'along', 'beyond', 'within', 'above', 'below', 'up', 'down', 'out_of', 'off', 'past']);
export const PREPS = new Set([...PLACE_PREPS, 'of', 'for', 'with', 'without', 'about', 'against', 'after', 'before', 'during', 'until', 'like', 'than', 'between', 'among', 'upon']);
export const PART_NOUNS = new Set(['edge', 'middle', 'end', 'side', 'top', 'bottom', 'center', 'centre', 'heart', 'back', 'front', 'foot', 'corner', 'inside', 'outskirts', 'bank', 'shore']);

export const THINGS = new Set(`bread cake pebble pebbles crumb crumbs apple apples ball ring key sword mirror crown gold pearl pearls jewel jewels treasure money coin coins basket book letter map lamp candle rope stick stone stones shoe shoes dress hat cloak
spell potion door box chest bag pocket pockets apron water milk cheese egg eggs flower flowers rose rain snow sun moon star stars finger bone bones plan sugar candy sweets food supper dinner breakfast meal bed fire wood`.split(/\s+/));
export const ADJ = new Set(`a an the his her their its my our your poor little small big great large old young new good bad kind cruel wicked evil beautiful pretty ugly white black red green blue yellow golden silver clear thin fat tall short long wide deep dark bright warm cold hot hungry tired happy sad angry glad
furious dear first last next other same whole only own every each some any no all both few many several two three four five six seven eight nine ten hundred third second early late old-fashioned tiny huge wonderful terrible strange magic magical secret hidden lost lonely`.split(/\s+/));

export const SPEECH = new Set(`say said says ask asked asks reply replied replies cry cried cries whisper whispered whispers shout shouted shouts answer answered answers call called calls exclaim exclaimed exclaims order ordered orders
tell told tells speak spoke speaks scream screamed screams sigh sighed laugh laughed mutter muttered murmur murmured declare declared announce announced add added continue continued begin began beg begged cheer cheered
suggest suggested promise promised warn warned demand demanded wonder wondered remark remarked explain explained roar roared growl growled sing sang`.split(/\s+/));
export const SPEECH_LEMMA = { said: 'say', says: 'say', asked: 'ask', replied: 'reply', cried: 'cry', whispered: 'whisper', shouted: 'shout', answered: 'answer', called: 'call', exclaimed: 'exclaim', ordered: 'order', told: 'tell', spoke: 'speak', screamed: 'scream', sighed: 'sigh', laughed: 'laugh', muttered: 'mutter', murmured: 'murmur', declared: 'declare', announced: 'announce', added: 'add', continued: 'continue', begged: 'beg', cheered: 'cheer', suggested: 'suggest', promised: 'promise', warned: 'warn', demanded: 'demand', wondered: 'wonder', remarked: 'remark', explained: 'explain', roared: 'roar', growled: 'growl', sang: 'sing' };

export const ADVERBS = new Set(`soon then finally suddenly quickly slowly gently quietly softly loudly carefully happily sadly angrily kindly cruelly never always also still just even almost already only really often again
once ever now first at_last later early away instead well badly hard fast far enough`.split(/\s+/));
export const AUX = new Set(['had', 'has', 'have', 'did', 'does', 'do', 'could', 'would', 'should', 'might', 'must', 'will', 'can', 'may']);
export const COPULA = new Set(['was', 'were', 'is', 'are', 'am', 'been', 'be', 'became', 'become', 'becomes', 'seemed', 'looked']);

// ---- first names with a gender (small list; unknown names stay unknown) ----
const MALE = 'hansel john james peter paul tom thomas george henry arthur william harry jack jacob david michael robert richard charles edward frank fred sam samuel ben benjamin daniel joseph adam alex andrew anthony oliver max leo luke mark matthew simon stephen victor walter ralph roland hugo karl carl otto ivan juan pedro marco mario luigi hans fritz franz wilhelm friedrich ernest albert alfred harold ron ronald rupert oscar nick nicholas noah liam ethan jason kevin brian eric tim timothy tony ted'.split(' ');
const FEMALE = 'gretel mary anna anne ann alice emma jane elizabeth lily lucy kate katie sarah sara susan margaret maria helen laura julia sophie sophia grace rose ruth eve eva clara cinderella snow rapunzel belle ella emily amy lisa linda nancy betty carol diana ellen fiona hannah irene janet joan karen lena lara mia nina olga rita rosa sally tina vera wendy zoe ada ida edith'.split(' ');
export const GIVEN = new Map([...MALE.map((n) => [n, 'm']), ...FEMALE.map((n) => [n, 'f'])]);
export const TITLES = { mr: 'm', mrs: 'f', miss: 'f', ms: 'f', dr: '', sir: 'm', lady: 'f', lord: 'm', king: 'm', queen: 'f', prince: 'm', princess: 'f', captain: 'm', professor: '', saint: '', st: '', uncle: 'm', aunt: 'f' };
export const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'sr', 'jr', 'vs', 'etc', 'no', 'fig', 'eg', 'ie', 'cf', 'capt', 'col', 'gen', 'lt', 'sgt', 'mt', 'ft', 'inc', 'ltd', 'co']);

// ---- verbs ----
const IRREGULAR = `go went gone|come came come|see saw seen|take took taken|make made made|say said said|tell told told|find found found|give gave given|eat ate eaten|lead led led|put put put|set set set|throw threw thrown|shake shook shaken|hold held held|think thought thought|know knew known|hear heard heard|feel felt felt|keep kept kept|leave left left|lose lost lost|begin began begun|bring brought brought|build built built|catch caught caught|run ran run|sit sat sat|stand stood stood|fall fell fallen|get got gotten|grow grew grown|hide hid hidden|fly flew flown|wake woke woken|win won won|write wrote written|speak spoke spoken|steal stole stolen|sleep slept slept|send sent sent|pay paid paid|ride rode ridden|ring rang rung|sing sang sung|swim swam swum|teach taught taught|wear wore worn|buy bought bought|fight fought fought|forget forgot forgotten|draw drew drawn|drink drank drunk|drive drove driven|break broke broken|bite bit bitten|blow blew blown|choose chose chosen|cut cut cut|dig dug dug|do did done|have had had|hit hit hit|hurt hurt hurt|lay laid laid|lie lay lain|mean meant meant|meet met met|read read read|rise rose risen|seek sought sought|sell sold sold|shoot shot shot|shut shut shut|sink sank sunk|slide slid slid|spend spent spent|spin spun spun|spring sprang sprung|strike struck struck|sweep swept swept|tear tore torn|understand understood understood|weep wept wept|wind wound wound|forgive forgave forgiven|overcome overcame overcome|undo undid undone|beat beat beaten|bend bent bent|bind bound bound|bleed bled bled|burst burst burst|cost cost cost|creep crept crept|deal dealt dealt|feed fed fed|flee fled fled|fling flung flung|freeze froze frozen|hang hung hung|kneel knelt knelt|lend lent lent|let let let|light lit lit|shine shone shone|sting stung stung|swing swung swung|wring wrung wrung|become became become|bear bore born|be was been`.split('|').map((s) => s.split(' '));
const REGULAR = `walk look call ask answer reply cry whisper shout smile laugh love hate want need live die kill burn push pull open close climb carry follow wait watch help save rescue free guess order agree learn play work start stop turn move jump hug dance fill scatter drop lock kick discover visit enter reach arrive return travel marry
nibble decide promise warn show talk wish hope pray cook clean wash cover kiss touch cross plant plan invite join lift row paint protect attack escape finish shout cheer thank appear remain stay wander roll glow shine tremble fear believe notice remember
create build use develop study introduce describe explain present publish write offer provide support include contain require produce increase decrease lead manage organize organise measure test analyse analyze compare define collect give`.split(/\s+/);
const DOUBLE = new Set(['stop', 'drop', 'hug', 'plan', 'beg', 'nibble_', 'rob', 'step', 'skip', 'clap', 'trip', 'wrap', 'grab', 'tap', 'pat', 'shop', 'chop', 'jog', 'nod', 'hop']);
const reg = (b) => ({
  past: /e$/.test(b) ? `${b}d` : /[^aeiou]y$/.test(b) ? `${b.slice(0, -1)}ied` : DOUBLE.has(b) ? `${b}${b.at(-1)}ed` : `${b}ed`,
  s: /(s|x|z|ch|sh|o)$/.test(b) ? `${b}es` : /[^aeiou]y$/.test(b) ? `${b.slice(0, -1)}ies` : `${b}s`,
  ing: /[^e]e$/.test(b) ? `${b.slice(0, -1)}ing` : /ie$/.test(b) ? `${b.slice(0, -2)}ying` : DOUBLE.has(b) ? `${b}${b.at(-1)}ing` : `${b}ing`,
});
/** form -> { lemma, form: 'base'|'s'|'past'|'ing'|'pp' } */
export const VERBS = new Map();
const addForm = (f, lemma, kind) => { if (!VERBS.has(f)) VERBS.set(f, { lemma, kind }); };
for (const [b, past, pp] of IRREGULAR) {
  if (b === 'be') continue;
  const r = reg(b);
  addForm(b, b, 'base'); addForm(past, b, 'past'); addForm(pp, b, 'pp'); addForm(r.s, b, 's'); addForm(r.ing, b, 'ing');
}
for (const b of REGULAR) { const r = reg(b); addForm(b, b, 'base'); addForm(r.past, b, 'past'); addForm(r.s, b, 's'); addForm(r.ing, b, 'ing'); }
/** Words ending in -ed that are not verbs (or not events). */
export const NOT_VERB = new Set(['hundred', 'red', 'bed', 'need', 'seed', 'speed', 'indeed', 'breed', 'greed', 'weed', 'shed', 'sled', 'wicked', 'naked', 'sacred', 'beloved', 'tired', 'scared', 'excited', 'married', 'surprised', 'pleased', 'amazed', 'crooked', 'ragged', 'rugged', 'learned', 'aged', 'jagged', 'bearded', 'wounded', 'crowded', 'hundreds', 'bled', 'fed', 'led']);
/** Verbs that are base forms but also common nouns/other words and should not start an event after a bare noun. */
export const AMBIG_BASE = new Set(['light', 'cost', 'set', 'open', 'close', 'cook', 'work', 'play', 'look', 'call', 'love', 'wish', 'hope', 'fear', 'order', 'plan', 'show', 'talk', 'help', 'watch', 'cry', 'guess', 'turn', 'start', 'stop', 'fill', 'use', 'cover', 'cross', 'plant', 'present', 'lead', 'test', 'bear', 'ring', 'rise', 'wind', 'lie', 'lay', 'hit', 'cut', 'read', 'hurt', 'let', 'put', 'beat', 'bind', 'deal', 'dig', 'drive', 'draw', 'feed', 'hang', 'hide', 'ride', 'sink', 'slide', 'spring', 'strike', 'swing', 'tear', 'wear', 'wake', 'fight', 'fly', 'build', 'bite', 'blow', 'break', 'stand', 'sit', 'run', 'walk', 'smile', 'laugh', 'kiss', 'touch', 'visit', 'dance', 'paint', 'rescue', 'free', 'march', 'jump', 'move', 'hug', 'drop', 'push', 'pull', 'climb', 'carry', 'follow', 'wait', 'save']);

/** Past tense / s form detection of a token; returns { lemma, kind } or null. `lower` must be lowercase. */
export function verbForm(lower) {
  const v = VERBS.get(lower);
  if (v) return v;
  if (NOT_VERB.has(lower)) return null;
  if (/ied$/.test(lower) && lower.length > 4) return { lemma: `${lower.slice(0, -3)}y`, kind: 'past' };
  if (/(.)\1ed$/.test(lower) && lower.length > 5) return { lemma: lower.slice(0, -3), kind: 'past' };
  if (/ed$/.test(lower) && lower.length > 4) return { lemma: /[^aeiou]ed$/.test(lower) && /[aeiou][^aeiou]ed$/.test(lower) && lower.length <= 6 ? lower.slice(0, -1) : lower.slice(0, -2), kind: 'past', guess: true };
  return null;
}
export const lemmaOfVerb = (lower) => verbForm(lower)?.lemma ?? lower;

export const PLACE_WORDS_IN_NAMES = new Set(['forest', 'castle', 'lake', 'river', 'mountain', 'mountains', 'island', 'bridge', 'palace', 'tower', 'village', 'city', 'town', 'sea', 'ocean', 'valley', 'hill', 'hills', 'street', 'road', 'square', 'park', 'bay', 'cape', 'mount', 'fort', 'kingdom', 'land', 'woods']);
export const PLACE_NAME_PREV = new Set(['in', 'at', 'to', 'from', 'near', 'through', 'into', 'toward', 'towards', 'across', 'reached', 'visited', 'entered', 'left', 'reach', 'visit', 'enter', 'leave', 'inside', 'outside', 'around', 'beyond', 'throughout', 'within', 'of']);

export const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1, final: -1 };
export const NUMWORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const plural = (w) => (/(sheep|fish|deer)$/.test(w) ? w : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
export const singular = (w) => {
  if (PLURAL_ROLES[w]) return PLURAL_ROLES[w];
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w) && w.length > 3 && !/(us|is)$/.test(w)) return w.slice(0, -1);
  return w;
};
