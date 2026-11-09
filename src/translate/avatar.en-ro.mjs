// English -> Romanian words for the avatar's own descriptions (worlds/ui.avatar/ops.mjs: PHRASE, EYES_PHRASE, describeShort), RP5b.
// The avatar names its parts from the generated DiceBear vocabulary ("collared clothes", "a teeth smile mouth"); this table gives the
// authored Romanian phrase of every variant of the robot, emoji, person, cartoon and kid characters, keyed like ops.mjs builds the English
// phrase (the article rules are copied from there). Browser-safe, data only. `avatarBitRo(bit)` -> Romanian phrase | null.

const a = (w) => (/s$/.test(w) && !/ss$/.test(w) ? '' : /^[aeiou]/i.test(w) ? 'an' : 'a');
const NO_ARTICLE_HAIR = /^(?:.*\bhair(?: with .*)?|.*\b(?:knots|buns|braids|dreadlocks|twists)|cornrows.*|shoulder-length.*)$/;
const hairPhrase = (d) => (NO_ARTICLE_HAIR.test(d) ? d : /^(?:long|short) \d+$/.test(d) ? `${d} hair` : `${/^[a-z]+s$/.test(d) && !/ss$/.test(d) ? '' : /^[aeiou]/i.test(d) ? 'an' : 'a'} ${d}`);
const EN = {
  hair: hairPhrase, head: hairPhrase, eyebrows: (d) => `${d} eyebrows`, nose: (d) => `${a(d)} ${d} nose`, beard: (d) => `${a(d)} ${d}`, hat: (d) => `${a(d)} ${d}`, glasses: (d) => `${d} glasses`,
  earrings: (d) => `${d} earrings`, freckles: (d) => `${d} freckles`, clothes: (d) => `${d} clothes`, hairAccessories: (d) => `${a(d)} ${d}`,
  eyes: (d) => `${d} eyes`, mouth: (d) => `${a(d)} ${d} mouth`, top: (d) => `${a(d)} ${d} on top`, chest: (d) => `${a(d)} ${d} on my chest`,
  expression: (d) => `${a(d)} ${d} expression`, accessories: (d) => `${a(d)} ${d}`, facialHair: (d) => `${a(d)} ${d}`, mask: (d) => `${a(d)} ${d}`, face: (d) => `${a(d)} ${d} face`,
  cheeks: (d) => `${d} cheeks`, ears: (d) => `${d} ears`,
};

// part -> { display: Romanian phrase }
const RO = {
  chest: { buttons: 'nasturi pe piept', vents: 'orificii de aerisire pe piept', screen: 'un ecran pe piept', heart: 'o inimă pe piept', dial: 'un cadran pe piept', slot: 'o fantă pe piept' },
  top: { antenna: 'o antenă deasupra', twin: 'două antene deasupra', dish: 'o antenă parabolică deasupra', fin: 'o înotătoare deasupra', lightbar: 'o bară luminoasă deasupra', studs: 'nituri deasupra', siren: 'o sirenă deasupra' },
  eyes: {
    round: 'ochi rotunzi', square: 'ochi pătrați', visor: 'ochi cu vizieră', cyclops: 'ochi de ciclop', happy: 'ochi fericiți', sleepy: 'ochi somnoroși', plus: 'ochi în formă de plus',
    small: 'ochi mici', uneven: 'ochi inegali', closed: 'ochi închiși', squint: 'ochi mijiți', calm: 'ochi liniștiți', angry: 'ochi furioși',
    cheery: 'ochi veseli', confused: 'ochi nedumeriți', normal: 'ochi normali', sad: 'ochi triști', starstruck: 'ochi plini de uimire', winking: 'ochi care fac cu ochiul',
    eyes: 'ochi', 'eyes shadow': 'ochi cu umbră', smiling: 'ochi zâmbitori', 'smiling shadow': 'ochi zâmbitori cu umbră',
  },
  mouth: {
    grill: 'o gură grătar', speaker: 'o gură difuzor', line: 'o gură dreaptă', smile: 'o gură zâmbitoare', zigzag: 'o gură în zigzag',
    wide: 'o gură lată', 'big smile': 'o gură cu zâmbet mare', 'smile open': 'o gură zâmbitoare deschisă', grin: 'o gură cu rânjet', cat: 'o gură de pisică', smirk: 'o gură cu zâmbet strâmb', open: 'o gură deschisă',
    gasp: 'o gură căscată', frown: 'o gură încruntată', wavy: 'o gură ondulată', tongue: 'o gură cu limba scoasă', laugh: 'o gură care râde', teeth: 'o gură cu dinți',
    laughing: 'o gură care râde', nervous: 'o gură nervoasă', pucker: 'o gură țuguiată', sad: 'o gură tristă', surprised: 'o gură surprinsă',
    'awkward smile': 'o gură cu zâmbet stânjenit', braces: 'o gură cu aparat dentar', 'gap smile': 'o gură cu zâmbet cu dinții depărtați', kawaii: 'o gură kawaii', 'open sad': 'o gură tristă deschisă',
    'opened smile': 'o gură cu zâmbet larg deschis', 'teeth smile': 'o gură cu zâmbet cu dinți', unimpressed: 'o gură nemulțumită',
  },
  face: { circle: 'o față rotundă', squircle: 'o față pătrată cu colțuri rotunjite', 'soft square': 'o față pătrată rotunjită', wide: 'o față lată', tall: 'o față înaltă', hexagon: 'o față hexagonală', bean: 'o față în formă de fasole', pebble: 'o față în formă de pietricică', blob: 'o față amorfă' },
  cheeks: { blush: 'obraji îmbujorați' },
  clothes: { collared: 'haine cu guler', crew: 'haine cu decolteu rotund', open: 'haine descheiate' },
  earrings: { hoop: 'cercei cerc', stud: 'cercei mici' },
  ears: { attached: 'urechi lipite', detached: 'urechi depărtate' },
  eyebrows: { down: 'sprâncene lăsate', 'eyelashes down': 'gene și sprâncene lăsate', 'eyelashes up': 'gene și sprâncene ridicate', up: 'sprâncene ridicate' },
  facialHair: {
    beard: 'o barbă', scruff: 'o barbă nerasă', 'chin strap beard': 'o barbă pe maxilar', 'short beard': 'o barbă scurtă', 'long beard': 'o barbă lungă', 'thick beard': 'o barbă deasă', 'hair-colored beard': 'o barbă de culoarea părului',
    'moustache and goatee': 'o mustață cu barbiță', 'round goatee': 'o barbiță rotundă', 'thin moustache': 'o mustață subțire', 'walrus moustache': 'o mustață de morsă', 'handlebar moustache': 'o mustață cu vârfurile răsucite',
    'fine curly moustache': 'o mustață creață și fină', 'bushy moustache': 'o mustață stufoasă', 'wide moustache': 'o mustață lată', 'curved moustache': 'o mustață curbată',
    'very long curly moustache': 'o mustață foarte lungă și creață', 'hair-colored moustache': 'o mustață de culoarea părului',
  },
  glasses: { round: 'ochelari rotunzi', square: 'ochelari pătrați' },
  hair: {
    'side swept hair': 'păr dat pe o parte', 'wispy hair': 'păr rar', quiff: 'un moț', 'long wavy hair': 'păr lung și ondulat', 'bald head': 'un cap chel', mohawk: 'o creastă mohawk', 'pixie cut': 'o tunsoare pixie', turban: 'un turban',
    bangs: 'breton', 'bowl cut': 'o tunsoare la oală', braids: 'codițe', 'top bun': 'un coc sus', 'curly bob': 'un bob creț', 'short curly hair': 'păr scurt și creț', 'afro bun': 'un coc afro', 'half shaved head': 'un cap pe jumătate ras',
    'shaved head': 'un cap ras', 'short hair': 'păr scurt', 'long straight hair': 'păr lung și drept', 'wavy bob': 'un bob ondulat',
  },
  nose: { curve: 'un nas curbat', pointed: 'un nas ascuțit', tound: 'un nas rotund' },
  accessories: {
    'cat ears': 'urechi de pisică', 'clown nose': 'un nas de clovn', 'face mask': 'o mască de față', 'thin square glasses': 'ochelari pătrați subțiri', mustache: 'o mustață', 'sailormoon crown': 'o coroană Sailor Moon',
    'sleep mask': 'o mască de dormit', 'round sunglasses': 'ochelari de soare rotunzi', eyepatch: 'un petic peste ochi', 'thin round glasses': 'ochelari rotunzi subțiri', 'browline glasses': 'ochelari cu ramă groasă sus',
    'white-framed glasses': 'ochelari cu ramă albă', 'thick round glasses': 'ochelari rotunzi groși', 'browline sunglasses': 'ochelari de soare cu ramă groasă sus',
  },
  mask: { 'medical mask': 'o mască medicală', respirator: 'un respirator' },
  expression: {
    'angry with fang': 'o expresie furioasă cu colți', awe: 'o expresie de uimire', blank: 'o expresie goală', calm: 'o expresie calmă', cheeky: 'o expresie obraznică', concerned: 'o expresie îngrijorată',
    'concerned fear': 'o expresie îngrijorată și speriată', contempt: 'o expresie disprețuitoare', cute: 'o expresie drăguță', cyclops: 'o expresie de ciclop', driven: 'o expresie hotărâtă', 'eating happy': 'o expresie fericită, mâncând',
    explaining: 'o expresie de explicație', 'eyes closed': 'o expresie cu ochii închiși', fear: 'o expresie speriată', hectic: 'o expresie agitată', 'loving grin': 'o expresie de rânjet iubitor',
    'toothy loving grin': 'o expresie de rânjet iubitor cu dinți', monster: 'o expresie de monstru', old: 'o expresie bătrână', rage: 'o expresie de furie', serious: 'o expresie serioasă', smile: 'o expresie zâmbitoare',
    'smile big': 'o expresie cu zâmbet larg', 'smile lol': 'o expresie de râs', 'smile teeth gap': 'o expresie cu zâmbet cu dinții depărtați', solemn: 'o expresie solemnă', suspicious: 'o expresie suspicioasă',
    tired: 'o expresie obosită', 'very angry': 'o expresie foarte furioasă',
  },
  head: {
    afro: 'un afro', 'shoulder-length hair with bangs': 'păr până la umeri cu breton', 'bob with bangs': 'un bob cu breton', 'bantu knots': 'noduri bantu', 'thinning hair with stubble': 'păr rărit cu barbă de câteva zile',
    'bun with a bandana': 'un coc cu bandană', 'curly bun with a hair tie': 'un coc creț cu elastic', 'twin buns': 'două coafuri cu coc', 'cornrows in a ponytail': 'codițe lipite pe cap, strânse în coadă', 'side braids': 'împletituri pe o parte',
    'puffy dreadlocks': 'dreadlocks umflați', 'curly dreadlocks': 'dreadlocks creți', 'flat top': 'o tunsoare plată sus', 'tall flat top': 'o tunsoare plată înaltă sus', 'top knot': 'un coc sus', 'rounded bob': 'un bob rotunjit',
    'short side-swept hair': 'păr scurt dat pe o parte', beanie: 'o căciulă', 'wide-brimmed hat': 'o pălărie cu boruri largi', hijab: 'un hijab', 'long hair': 'păr lung', 'big afro': 'un afro mare', 'long hair with bangs': 'păr lung cu breton',
    'long curly hair': 'păr lung și creț', 'short bob': 'un bob scurt', 'medium wavy hair': 'păr mediu ondulat', 'medium layered hair': 'păr mediu tuns în straturi', 'medium hair with bangs': 'păr mediu cu breton',
    'wavy hair with bangs': 'păr ondulat cu breton', 'medium hair with straight bangs': 'păr mediu cu breton drept', 'medium straight hair': 'păr mediu drept', 'short mohawk': 'o creastă mohawk scurtă', 'spiky mohawk': 'o creastă mohawk țepoasă',
    'bald head': 'un cap chel', 'almost bald head': 'un cap aproape chel', 'bald head with a tuft': 'un cap chel cu un smoc de păr', quiff: 'un moț', 'rounded fade': 'o tunsoare degrade rotunjită', 'textured fade': 'o tunsoare degrade texturată',
    'messy windswept hair': 'păr zburlit de vânt', 'short side-parted hair': 'păr scurt cu cărare pe o parte', 'short neat hair': 'păr scurt și îngrijit', 'short curly hair': 'păr scurt și creț', 'short wavy hair': 'păr scurt și ondulat',
    'short spiky hair': 'păr scurt și țepos', turban: 'un turban', 'short twists': 'răsuciri scurte', 'tall twists': 'răsuciri înalte',
  },
};
RO.head = { ...RO.hair, ...RO.head };
RO.hair = RO.head;

const FIXED = {
  'no hair': 'fără păr', 'no beard': 'fără barbă', 'no glasses': 'fără ochelari', 'no earrings': 'fără cercei', 'no freckles': 'fără pistrui', 'no hat': 'fără pălărie', 'no hair accessory': 'fără accesoriu de păr',
  'nothing on top': 'nimic deasupra', 'nothing on my chest': 'nimic pe piept', 'no accessories': 'fără accesorii', 'no facial hair': 'fără păr facial', 'no mask': 'fără mască', 'no cheeks': 'fără obraji',
  'round eyes with pupils': 'ochi rotunzi cu pupile', 'big pupils': 'pupile mari', 'tall pupils': 'pupile înalte', 'sparkling eyes': 'ochi sclipitori', 'eyes looking sideways': 'ochi care se uită într-o parte',
  'eyes looking down': 'ochi care se uită în jos', 'eyes looking up': 'ochi care se uită în sus', 'a winking eye': 'un ochi care face cu ochiul', 'eyes eyes': 'ochi',
};
const STYLE_NOUN_RO = { eyes: 'ochi', mouth: 'gura', 'face shape': 'forma feței', hair: 'părul', eyebrow: 'sprânceana', nose: 'nasul', beard: 'barba', glasses: 'ochelarii', earring: 'cercelul', freckles: 'pistruii', hat: 'pălăria', clothes: 'hainele', accessory: 'accesoriul', 'hair accessory': 'accesoriul de păr', ear: 'urechea', detail: 'detaliul' };

const BITS = new Map(Object.entries(FIXED));
for (const [part, table] of Object.entries(RO)) for (const [display, ro] of Object.entries(table)) if (EN[part]) { const en = EN[part](display).replace(/ {2,}/g, ' ').trim(); if (!BITS.has(en)) BITS.set(en, ro); }

/** Romanian phrase of one part phrase of the avatar ("collared clothes" -> "haine cu guler"), or null. */
export function avatarBitRo(bit) {
  const b = String(bit).trim();
  if (BITS.has(b)) return BITS.get(b);
  const m = /^(.+?) style (\d+)$/.exec(b);
  if (m && STYLE_NOUN_RO[m[1]]) return `${STYLE_NOUN_RO[m[1]]} stil ${m[2]}`;
  return null;
}

/** Romanian for an English list of part phrases ("a, b and c"), or null when any phrase is unknown (phrases may contain "and": try every split). */
export function avatarListRo(list) {
  const split = (t) => {
    const whole = avatarBitRo(t);
    const seps = [...t.matchAll(/, and |, | and /g)];
    for (const m of seps) {
      const head = avatarBitRo(t.slice(0, m.index));
      if (head == null) continue;
      const rest = split(t.slice(m.index + m[0].length));
      if (rest) return [head, ...rest];
    }
    return whole != null ? [whole] : null;
  };
  const bits = split(String(list).trim());
  if (!bits) return null;
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} și ${bits.at(-1)}` : bits[0];
}

export const AVATAR_CHARACTER_RO = { robot: 'un robot', person: 'o persoană', emoji: 'un emoji', portrait: 'un portret', cartoon: 'un desen animat', kid: 'un copil', pixel: 'o persoană pixel', pixelbot: 'un robot pixel', funemoji: 'un emoji distractiv' };
export const AVATAR_CHARACTER_EN = { 'a robot': 'robot', 'a person': 'person', 'an emoji': 'emoji', 'a portrait': 'portrait', 'a cartoon': 'cartoon', 'a kid': 'kid', 'a pixel person': 'pixel', 'a pixel robot': 'pixelbot', 'a fun emoji': 'funemoji' };

// ---- "I cannot change the size of my mouth, but I can change its style. My mouth can be grill, speaker, line ..." ----
/** [English label (ops.mjs LABEL), table key, genitive, "my X can be"] */
export const AVATAR_PARTS = [
  ['mouth', 'mouth', 'gurii', 'Gura mea poate fi'], ['eyes', 'eyes', 'ochilor', 'Ochii mei pot fi'], ['eyebrows', 'eyebrows', 'sprâncenelor', 'Sprâncenele mele pot fi'], ['nose', 'nose', 'nasului', 'Nasul meu poate fi'],
  ['hairstyle', 'hair', 'coafurii', 'Coafura mea poate fi'], ['glasses', 'glasses', 'ochelarilor', 'Ochelarii mei pot fi'], ['earrings', 'earrings', 'cerceilor', 'Cerceii mei pot fi'], ['clothes', 'clothes', 'hainelor', 'Hainele mele pot fi'],
  ['ears', 'ears', 'urechilor', 'Urechile mele pot fi'], ['face shape', 'face', 'formei feței', 'Forma feței mele poate fi'], ['cheeks', 'cheeks', 'obrajilor', 'Obrajii mei pot fi'],
  ['facial hair', 'facialHair', 'părului facial', 'Părul meu facial poate fi'], ['beard', 'facialHair', 'bărbii', 'Barba mea poate fi'], ['accessories', 'accessories', 'accesoriilor', 'Accesoriile mele pot fi'],
  ['mask', 'mask', 'măștii', 'Masca mea poate fi'], ['expression', 'expression', 'expresiei', 'Expresia mea poate fi'], ['top piece', 'top', 'piesei de deasupra', 'Piesa mea de deasupra poate fi'], ['chest', 'chest', 'pieptului', 'Pieptul meu poate fi'],
];
const BARE = /^(?:o gură|ochi|sprâncene|un nas|o față|haine|cercei|urechi|ochelari|obraji|o expresie|o|un)\s+/;
/** The bare Romanian name of one option of a part ("grill" of the mouth -> "grătar"), or null. */
export function avatarOptionRo(tableKey, word) {
  const w = String(word).trim();
  const m = /^style (\d+)$/.exec(w);
  if (m) return `stil ${m[1]}`;
  const full = RO[tableKey]?.[w];
  if (!full) return null;
  return full.replace(BARE, '') || full;
}
/** "grill, speaker or zigzag and 3 more" -> "grătar, difuzor sau zigzag și încă 3", or null. */
export function avatarOptionsRo(tableKey, text) {
  let t = String(text).trim(), more = '';
  const mm = / and (\d+) more$/.exec(t);
  if (mm) { t = t.slice(0, mm.index); more = ` și încă ${mm[1]}`; }
  const items = t.split(/, | or /).map((x) => avatarOptionRo(tableKey, x));
  if (!items.length || items.some((x) => x == null)) return null;
  const list = items.length > 1 ? `${items.slice(0, -1).join(', ')} sau ${items.at(-1)}` : items[0];
  return list + more;
}
