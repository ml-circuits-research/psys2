// Bilingual Romanian -> English lexicon (browser-safe, data only).
//
// Noun rows : "sg,pl|en[/enPlural]|gender flags... [|extraDefForms]"   gender: m f n
//             flags: mass (uncountable) anim (animate) pl (plural only) inst (bare after preposition)
//                    time kin unit
// Verb rows : "inf|en[/past[/pp]]|six present forms or type:stem|participle|flags"
//             types: a (cânt, cânți, cântă...), az (-ez), is (-esc); '-' = no form
//             flags: i (intransitive) t d(ditransitive) imp (imperative-capable) imps vs motion exp
//                    comp=modal|to|bare  mod=can|must  post=left  imp=form1,form2  sj=form
// Adj rows  : "m,f,mpl,fpl|en[/comparative/superlative]"  (2 forms = sg,pl; 1 form = invariant)
// Word rows : "key1,key2|en|pos|flags"

const NOUN_ROWS = `
măr,mere|apple|n
pară,pere|pear|f
banană,banane|banana|f
portocală,portocale|orange|f
lămâie,lămâi|lemon|f
căpșună,căpșuni|strawberry|f
cireașă,cireșe|cherry|f
strugure,struguri|grape|m
piersică,piersici|peach|f
prună,prune|plum|f
pepene,pepeni|watermelon|m
kiwi,kiwi|kiwi|m
ananas,ananași|pineapple|m
caisă,caise|apricot|f
smochină,smochine|fig|f
rodie,rodii|pomegranate|f
fruct,fructe|fruit|n
legumă,legume|vegetable|f
roșie,roșii|tomato|f
castravete,castraveți|cucumber|m
morcov,morcovi|carrot|m
cartof,cartofi|potato|m
ceapă,cepe|onion|f
ardei,ardei|pepper|m
varză,verze|cabbage|f
fasole,fasole|bean|f
mazăre,mazări|pea|f
porumb,porumburi|corn|m mass
ou,ouă|egg|n
pâine,pâini|bread|f mass
lapte,lapte|milk|n mass
brânză,brânzeturi|cheese|f mass
unt,unt|butter|n mass
iaurt,iaurturi|yogurt|n mass
carne,cărnuri|meat|f mass
orez,orez|rice|n mass
paste,paste|pasta|f mass
supă,supe|soup|f mass
salată,salate|salad|f
sandviș,sandvișuri|sandwich|n
pizza,pizza|pizza|f
tort,torturi|cake|n
prăjitură,prăjituri|pastry|f
biscuit,biscuiți|cookie|m
bomboană,bomboane|candy|f
ciocolată,ciocolate|chocolate|f
înghețată,înghețate|ice cream|f
acadea,acadele|lollipop|f
clătită,clătite|pancake|f
gem,gemuri|jam|n mass
miere,miere|honey|f mass
zahăr,zahăr|sugar|n mass
sare,sare|salt|f mass
ulei,uleiuri|oil|n mass
apă,ape|water|f mass
suc,sucuri|juice|n
ceai,ceaiuri|tea|n
cafea,cafele|coffee|f
limonadă,limonade|lemonade|f
nucă,nuci|nut|f
făină,făină|flour|f mass
gustare,gustări|snack|f
prânz,prânzuri|lunch|n
cină,cine|dinner|f
mâncare,mâncăruri|food|f mass
hrană,hrană|food|f mass
sticlă,sticle|bottle|f
pahar,pahare|glass|n
farfurie,farfurii|plate|f
lingură,linguri|spoon|f
furculiță,furculițe|fork|f
cuțit,cuțite|knife/knives|n
ceașcă,cești|cup|f
minge,mingi|ball|f
păpușă,păpuși|doll|f
mașinuță,mașinuțe|toy car|f
jucărie,jucării|toy|f
trenuleț,trenulețe|toy train|n
cub,cuburi|cube|n
puzzle,puzzle-uri|puzzle|n
robot,roboți|robot|m
zmeu,zmeie|kite|m
balon,baloane|balloon|n
ursuleț,ursuleți|teddy bear|m
bicicletă,biciclete|bicycle|f
trotinetă,trotinete|scooter|f
avion,avioane|airplane|n
tren,trenuri|train|n
mașină,mașini|car|f
autobuz,autobuze|bus|n
barcă,bărci|boat|f
camion,camioane|truck|n
joc,jocuri|game|n
carte,cărți|book|f||cărții
umbrelă,umbrele|umbrella|f
pălărie,pălării|hat|f
haină,haine|coat|f
geantă,genți|handbag|f
pungă,pungi|bag|f
pantof,pantofi|shoe|m
șosetă,șosete|sock|f
tricou,tricouri|T-shirt|n
rochie,rochii|dress|f
cheie,chei|key|f
ușă,uși|door|f
fereastră,ferestre|window|f
casă,case|house|f
cameră,camere|room|f
pat,paturi|bed|n inst
cutie,cutii|box|f
coș,coșuri|basket|n
masă,mese|table|f||mesei
scaun,scaune|chair|n
canapea,canapele|sofa|f
lampă,lămpi|lamp|f
oglindă,oglinzi|mirror|f
televizor,televizoare|television|n
calculator,calculatoare|computer|n
telefon,telefoane|phone|n
fotografie,fotografii|photo|f
ceas,ceasuri|clock|n
bani|money|m mass pl
creion,creioane|pencil|n
pix,pixuri|pen|n
caiet,caiete|notebook|n
ghiozdan,ghiozdane|schoolbag|n
riglă,rigle|ruler|f
radieră,radiere|eraser|f
ascuțitoare,ascuțitori|sharpener|f
foaie,foi|sheet|f
hârtie,hârtii|paper|f mass
tablă,table|blackboard|f
cretă,cretă|chalk|f mass
bancă,bănci|desk|f
clasă,clase|class|f
școală,școli|school|f inst
profesor,profesori|teacher|m anim
învățătoare,învățătoare|teacher|f anim
elev,elevi|student|m anim
lecție,lecții|lesson|f
temă,teme|homework|f mass
test,teste|test|n
notă,note|grade|f
răspuns,răspunsuri|answer|n
întrebare,întrebări|question|f
problemă,probleme|problem|f
exercițiu,exerciții|exercise|n
număr,numere|number|n
cifră,cifre|digit|f
literă,litere|letter|f
cuvânt,cuvinte|word|n
propoziție,propoziții|sentence|f
poveste,povești|story|f
desen,desene|drawing|n
culoare,culori|color|f
asistent,asistenți|assistant|m anim
element,elemente|item|n
formă,forme|shape|f
cumpărături|shopping|f mass pl
kg,kg|kg/kg|n
kilogram,kilograme|kilogram|n
litru,litri|liter|m
metru,metri|meter|m
gram,grame|gram|n
latură,laturi|side|f
unghi,unghiuri|angle|n
anotimp,anotimpuri|season|n time
foarfecă,foarfeci|scissors|f
lipici,lipici|glue|n mass
pensulă,pensule|brush|f
vopsea,vopsele|paint|f mass
listă,liste|list|f
mesaj,mesaje|message|n
nume,nume|name|n
vârstă,vârste|age|f
leu,lei|leu/lei|m unit
preț,prețuri|price|n
rest,rest|change|n mass
euro,euro|euro/euro|m unit
dolar,dolari|dollar|m unit
monedă,monede|coin|f
bancnotă,bancnote|bill|f
portofel,portofele|wallet|n
magazin,magazine|store|n
piață,piețe|market|f
plată,plăți|payment|f
oră,ore|hour|f time
minut,minute|minute|n time
secundă,secunde|second|f time
zi,zile|day|f time||ziua,zilei
săptămână,săptămâni|week|f time
lună,luni|month|f time
an,ani|year|m time
dimineață,dimineți|morning|f time
seară,seri|evening|f time
noapte,nopți|night|f time
amiază,amiezi|noon|f time
după-amiază,după-amiezi|afternoon|f time
vară,veri|summer|f time
primăvară,primăveri|spring|f time
toamnă,toamne|autumn|f time
iarnă,ierni|winter|f time
timp,timp|time|n mass
weekend,weekenduri|weekend|n time
ploaie,ploi|rain|f
soare,sori|sun|m
vânt,vânturi|wind|n
zăpadă,zăpezi|snow|f
nor,nori|cloud|m
furtună,furtuni|storm|f
curcubeu,curcubeie|rainbow|n
cer,ceruri|sky|n
stea,stele|star|f
iarbă,ierburi|grass|f mass
frunză,frunze|leaf/leaves|f
floare,flori|flower|f
copac,copaci|tree|m
pădure,păduri|forest|f
mare,mări|sea|f
râu,râuri|river|n
lac,lacuri|lake|n
munte,munți|mountain|m
câmp,câmpuri|field|n
grădină,grădini|garden|f
parc,parcuri|park|n
stradă,străzi|street|f
oraș,orașe|city|n
sat,sate|village|n
țară,țări|country|f
lume,lumi|world|f
piatră,pietre|stone|f
nisip,nisip|sand|n mass
foc,focuri|fire|n
aer,aer|air|n mass
pisică,pisici|cat|f anim||pisicii
câine,câini|dog|m anim
pasăre,păsări|bird|f anim
pește,pești|fish/fish|m anim
cal,cai|horse|m anim
vacă,vaci|cow|f anim
oaie,oi|sheep/sheep|f anim
capră,capre|goat|f anim
porc,porci|pig|m anim
găină,găini|hen|f anim
cocoș,cocoși|rooster|m anim
pui,pui|chick|m anim
rață,rațe|duck|f anim
gâscă,gâște|goose/geese|f anim
curcan,curcani|turkey|m anim
iepure,iepuri|rabbit|m anim
șoarece,șoareci|mouse/mice|m anim
șobolan,șobolani|rat|m anim
hamster,hamsteri|hamster|m anim
cobai,cobai|guinea pig|m anim
urs,urși|bear|m anim
lup,lupi|wolf/wolves|m anim
vulpe,vulpi|fox|f anim
cerb,cerbi|deer/deer|m anim
elefant,elefanți|elephant|m anim
girafă,girafe|giraffe|f anim
zebră,zebre|zebra|f anim
maimuță,maimuțe|monkey|f anim
tigru,tigri|tiger|m anim
leu,leii|lion|m anim
leopard,leoparzi|leopard|m anim
crocodil,crocodili|crocodile|m anim
șarpe,șerpi|snake|m anim
broască,broaște|frog|f anim
țestoasă,țestoase|turtle|f anim
șopârlă,șopârle|lizard|f anim
rinocer,rinoceri|rhinoceros|m anim
hipopotam,hipopotami|hippopotamus|m anim
cămilă,cămile|camel|f anim
cangur,canguri|kangaroo|m anim
panda,panda|panda|m anim
delfin,delfini|dolphin|m anim
balenă,balene|whale|f anim
rechin,rechini|shark|m anim
caracatiță,caracatițe|octopus|f anim
crab,crabi|crab|m anim
focă,foci|seal|f anim
pinguin,pinguini|penguin|m anim
vultur,vulturi|eagle|m anim
bufniță,bufnițe|owl|f anim
papagal,papagali|parrot|m anim
lebădă,lebede|swan|f anim
rândunică,rândunici|swallow|f anim
vrabie,vrăbii|sparrow|f anim
cioară,cioare|crow|f anim
porumbel,porumbei|pigeon|m anim
struț,struți|ostrich|m anim
fluture,fluturi|butterfly|m anim
albină,albine|bee|f anim
furnică,furnici|ant|f anim
păianjen,păianjeni|spider|m anim
muscă,muște|fly|f anim
țânțar,țânțari|mosquito|m anim
buburuză,buburuze|ladybug|f anim
omidă,omizi|caterpillar|f anim
melc,melci|snail|m anim
vierme,viermi|worm|m anim
mamifer,mamifere|mammal|n anim
reptilă,reptile|reptile|f anim
amfibian,amfibieni|amphibian|m anim
insectă,insecte|insect|f anim
animal,animale|animal|n anim
picior,picioare|leg|n
aripă,aripi|wing|f
blană,blănuri|fur|f mass
coadă,cozi|tail|f
cap,capete|head|n
ochi,ochi|eye|m
ureche,urechi|ear|f
gură,guri|mouth|f
nas,nasuri|nose|n
labă,labe|paw|f
cioc,ciocuri|beak|n
pană,pene|feather|f
solz,solzi|scale|m
corn,coarne|horn|n
dinte,dinți|tooth/teeth|m
braț,brațe|arm|n
mână,mâini|hand|f
deget,degete|finger|n
ghiară,ghiare|claw|f
corp,corpuri|body|n
inimă,inimi|heart|f
mamă,mame|mother|f anim kin
tată,tați|father|m anim kin
părinte,părinți|parent|m anim kin
copil,copii|child/children|m anim kin
fiu,fii|son|m anim kin
fiică,fiice|daughter|f anim kin
frate,frați|brother|m anim kin
soră,surori|sister|f anim kin
bunic,bunici|grandfather|m anim kin
bunică,bunice|grandmother|f anim kin
unchi,unchi|uncle|m anim kin
mătușă,mătuși|aunt|f anim kin
văr,veri|cousin|m anim kin
verișoară,verișoare|cousin|f anim kin
nepot,nepoți|grandson|m anim kin
nepoată,nepoate|granddaughter|f anim kin
soț,soți|husband|m anim kin
soție,soții|wife|f anim kin
băiat,băieți|boy|m anim
fată,fete|girl|f anim||fetei
om,oameni|person/people|m anim
bărbat,bărbați|man/men|m anim
femeie,femei|woman/women|f anim
prieten,prieteni|friend|m anim
prietenă,prietene|friend|f anim
coleg,colegi|classmate|m anim
vecin,vecini|neighbor|m anim
doctor,doctori|doctor|m anim
polițist,polițiști|police officer|m anim
pompier,pompieri|firefighter|m anim
bucătar,bucătari|cook|m anim
șofer,șoferi|driver|m anim
vânzător,vânzători|seller|m anim
fermier,fermieri|farmer|m anim
pictor,pictori|painter|m anim
cerc,cercuri|circle|n
pătrat,pătrate|square|n
triunghi,triunghiuri|triangle|n
dreptunghi,dreptunghiuri|rectangle|n
romb,romburi|diamond|n
oval,ovaluri|oval|n
linie,linii|line|f
lucru,lucruri|thing|n
loc,locuri|place|n
drum,drumuri|road|n
viață,vieți|life|f
ajutor,ajutor|help|n mass
idee,idei|idea|f
vis,vise|dream|n
sumă,sume|sum|f
total,totaluri|total|n
diferență,diferențe|difference|f
jumătate,jumătăți|half/halves|f
sfert,sferturi|quarter|n
pereche,perechi|pair|f
grup,grupuri|group|n
rând,rânduri|row|n
fel,feluri|kind|n
sunet,sunete|sound|n
cântec,cântece|song|n
muzică,muzică|music|f mass
film,filme|movie|n
fotbal,fotbal|soccer|n mass
sport,sporturi|sport|n
petrecere,petreceri|party|f
cadou,cadouri|gift|n
vacanță,vacanțe|vacation|f
călătorie,călătorii|trip|f
doctorie,doctorii|medicine|f
medic,medici|doctor|m anim
bibliotecă,biblioteci|library|f
spital,spitale|hospital|n
gară,gări|station|f
aeroport,aeroporturi|airport|n
bucătărie,bucătării|kitchen|f
baie,băi|bathroom|f
curte,curți|yard|f
gard,garduri|fence|n
pod,poduri|bridge|n
semn,semne|sign|n
hartă,hărți|map|f
steag,steaguri|flag|n
cuib,cuiburi|nest|n
bec,becuri|light bulb|n
baterie,baterii|battery|f
cablu,cabluri|cable|n
tastatură,tastaturi|keyboard|f
ecran,ecrane|screen|n
pagină,pagini|page|f
ziar,ziare|newspaper|n
revistă,reviste|magazine|f
scrisoare,scrisori|letter|f
bilet,bilete|ticket|n
card,carduri|card|n
punct,puncte|point|n
`;

const VERB_ROWS = `
avea|have/had/had|am ai are avem aveți au|avut|t sj=aibă
fi|be/was/been|sunt ești este suntem sunteți sunt|fost|i sj=fie alt3=e
da|give/gave/given|dau dai dă dăm dați dau|dat|d imp=dă,dați sj=dea
primi|receive/received|is:prim|primit|t
lua|take/took/taken|iau iei ia luăm luați iau|luat|t imp=ia,luați
mânca|eat/ate/eaten|mănânc mănânci mănâncă mâncăm mâncați mănâncă|mâncat|t imp
bea|drink/drank/drunk|beau bei bea bem beți beau|băut|t sj=bea
cumpăra|buy/bought/bought|a:cumpăr|cumpărat|t imp sj=cumpere
vinde|sell/sold/sold|vând vinzi vinde vindem vindeți vând|vândut|t
pierde|lose/lost/lost|pierd pierzi pierde pierdem pierdeți pierd|pierdut|t
găsi|find/found/found|is:găs|găsit|t imp
rămâne|be/was/been|rămân rămâi rămâne rămânem rămâneți rămân|rămas|i vs post=left
face|make/made/made|fac faci face facem faceți fac|făcut|t imp imp=fă,faceți
costa|cost/cost/cost|cost costi costă costăm costați costă|costat|t
plăti|pay/paid/paid|is:plăt|plătit|t imp
număra|count|a:număr|numărat|t imp
scădea|subtract|scad scazi scade scădem scădeți scad|scăzut|t
înmulți|multiply|is:înmulț|înmulțit|t
împărți|share|împart împarți împarte împărțim împărțiți împart|împărțit|t imp
calcula|calculate|az:calcul|calculat|t imp
rezolva|solve|az:rezolv|rezolvat|t imp
adăuga|add|adaug adaugi adaugă adăugăm adăugați adaugă|adăugat|t imp sj=adauge
aduna|add|a:adun|adunat|t imp
șterge|delete|șterg ștergi șterge ștergem ștergeți șterg|șters|t imp
termina|finish|a:termin|terminat|t imp
scrie|write/wrote/written|scriu scrii scrie scriem scrieți scriu|scris|t imp
citi|read/read/read|is:cit|citit|t imp
vedea|see/saw/seen|văd vezi vede vedem vedeți văd|văzut|t
auzi|hear/heard/heard|aud auzi aude auzim auziți aud|auzit|t
spune|say/said/said|spun spui spune spunem spuneți spun|spus|d imp
ști|know/knew/known|știu știi știe știm știți știu|știut|t
vrea|want|vreau vrei vrea vrem vreți vor|vrut|t comp=to
putea|can|pot poți poate putem puteți pot|putut|i mod=can comp=modal
trebui|must|trebuie trebuie trebuie trebuie trebuie trebuie|trebuit|i mod=must comp=modal
merge|go/went/gone|merg mergi merge mergem mergeți merg|mers|i motion imp sj=meargă
veni|come/came/come|vin vii vine venim veniți vin|venit|i motion imp vs imp=vino,veniți
alerga|run/ran/run|alerg alergi aleargă alergăm alergați aleargă|alergat|i
zbura|fly/flew/flown|zbor zbori zboară zburăm zburați zboară|zburat|i
înota|swim/swam/swum|înot înoți înoată înotăm înotați înoată|înotat|i
trăi|live|trăiesc trăiești trăiește trăim trăiți trăiesc|trăit|i
locui|live|locuiesc locuiești locuiește locuim locuiți locuiesc|locuit|i
sări|jump|sar sari sare sărim săriți sar|sărit|i
cânta|sing/sang/sung|a:cânt|cântat|t
dansa|dance|az:dans|dansat|i
juca|play|joc joci joacă jucăm jucați joacă|jucat|t
lucra|work|az:lucr|lucrat|i
dormi|sleep/slept/slept|dorm dormi doarme dormim dormiți dorm|dormit|i
râde|laugh|râd râzi râde râdem râdeți râd|râs|i
plânge|cry|plâng plângi plânge plângem plângeți plâng|plâns|i
mirosi|smell|miros miroși miroase mirosim miroșiți miros|mirosit|t
lătra|bark|latru latri latră lătrăm lătrați latră|lătrat|i
mieuna|meow|mieun mieuni mieună mieunăm mieunați mieună|mieunat|i
iubi|love|is:iub|iubit|t
plăcea|like|plac placi place plăcem plăceți plac|plăcut|t exp
chema|call|a:chem|chemat|t imp
numi|call|is:num|numit|t
ajuta|help|a:ajut|ajutat|t imp
învăța|learn|învăț înveți învață învățăm învățați învață|învățat|t
întreba|ask|a:întreb|întrebat|t imp
răspunde|answer|răspund răspunzi răspunde răspundem răspundeți răspund|răspuns|t imp
ține|hold/held/held|țin ții ține ținem țineți țin|ținut|t
pune|put/put/put|pun pui pune punem puneți pun|pus|t imp
aduce|bring/brought/brought|aduc aduci aduce aducem aduceți aduc|adus|t imp
duce|carry|duc duci duce ducem duceți duc|dus|t
trimite|send/sent/sent|trimit trimiți trimite trimitem trimiteți trimit|trimis|d imp
deschide|open|deschid deschizi deschide deschidem deschideți deschid|deschis|t imp
închide|close|închid închizi închide închidem închideți închid|închis|t imp
începe|begin/began/begun|încep începi începe începem începeți încep|început|t comp=to vs
opri|stop|is:opr|oprit|t imp
aștepta|wait|aștept aștepți așteaptă așteptăm așteptați așteaptă|așteptat|i imp
încerca|try|încerc încerci încearcă încercăm încercați încearcă|încercat|t comp=to
folosi|use|is:folos|folosit|t imp
arăta|show|arăt arăți arată arătăm arătați arată|arătat|d imp
compara|compare|a:compar|comparat|t imp
alege|choose/chose/chosen|aleg alegi alege alegem alegeți aleg|ales|t imp
desena|draw/drew/drawn|az:desen|desenat|t imp
picta|paint|az:pict|pictat|t
tăia|cut/cut/cut|tai tai taie tăiem tăiați taie|tăiat|t
coace|bake|coc coci coace coacem coaceți coc|copt|t
găti|cook|is:găt|gătit|t
spăla|wash|a:spăl|spălat|t
curăța|clean|a:curăț|curățat|t
construi|build/built/built|construiesc construiești construiește construim construiți construiesc|construit|t
rupe|break/broke/broken|rup rupi rupe rupem rupeți rup|rupt|t
câștiga|win/won/won|a:câștig|câștigat|t
ploua|rain|- - plouă - - -|plouat|i imps
ninge|snow|- - ninge - - -|nins|i imps
străluci|shine/shone/shone|is:străluc|strălucit|i
crește|grow/grew/grown|cresc crești crește creștem creșteți cresc|crescut|i
muri|die|mor mori moare murim muriți mor|murit|i
vorbi|talk|is:vorb|vorbit|i
striga|shout|a:strig|strigat|i
saluta|greet|a:salut|salutat|t
mulțumi|thank|is:mulțum|mulțumit|t
sta|stay|stau stai stă stăm stați stau|stat|i
sosi|arrive|is:sos|sosit|i vs
pleca|leave/left/left|plec pleci pleacă plecăm plecați pleacă|plecat|i
ieși|go out/went out/gone out|ies ieși iese ieșim ieșiți ies|ieșit|i motion
intra|enter|intru intri intră intrăm intrați intră|intrat|i
urca|climb|a:urc|urcat|i
lovi|hit/hit/hit|is:lov|lovit|t
prinde|catch/caught/caught|prind prinzi prinde prindem prindeți prind|prins|t
fugi|run away|fug fugi fuge fugim fugiți fug|fugit|i
dori|wish|is:dor|dorit|t comp=to
crede|believe|cred crezi crede credem credeți cred|crezut|t
gândi|think/thought/thought|is:gând|gândit|i
simți|feel/felt/felt|simt simți simte simțim simțiți simt|simțit|t
înțelege|understand/understood/understood|înțeleg înțelegi înțelege înțelegem înțelegeți înțeleg|înțeles|t
uita|forget/forgot/forgotten|uit uiți uită uităm uitați uită|uitat|t
aminti|remind|is:amint|amintit|d imp
umple|fill|umplu umpli umple umplem umpleți umplu|umplut|t
goli|empty|is:gol|golit|t
împrumuta|borrow|a:împrumut|împrumutat|t
aprinde|light|aprind aprinzi aprinde aprindem aprindeți aprind|aprins|t
stinge|turn off|sting stingi stinge stingem stingeți sting|stins|t
suna|call|a:sun|sunat|t imp
căuta|look for|caut cauți caută căutăm căutați caută|căutat|t imp
vizita|visit|az:vizit|vizitat|t
însemna|mean|înseamnă înseamnă înseamnă înseamnă înseamnă înseamnă|însemnat|i
`;

const ADJ_ROWS = `
roșu,roșie,roșii,roșii|red
albastru,albastră,albaștri,albastre|blue
verde,verde,verzi,verzi|green
galben,galbenă,galbeni,galbene|yellow
portocaliu,portocalie,portocalii,portocalii|orange
mov|purple
roz|pink
negru,neagră,negri,negre|black
alb,albă,albi,albe|white
maro|brown
gri|gray
auriu,aurie,aurii,aurii|golden
violet|violet
mare,mari|big/bigger/biggest
mic,mică,mici,mici|small/smaller/smallest
lung,lungă,lungi,lungi|long/longer/longest
scurt,scurtă,scurți,scurte|short/shorter/shortest
înalt,înaltă,înalți,înalte|tall/taller/tallest
gros,groasă,groși,groase|thick/thicker/thickest
subțire,subțiri|thin/thinner/thinnest
greu,grea,grei,grele|heavy/heavier/heaviest
ușor,ușoară,ușori,ușoare|light/lighter/lightest
nou,nouă,noi,noi|new/newer/newest
vechi,veche,vechi,vechi|old/older/oldest
tânăr,tânără,tineri,tinere|young/younger/youngest
bun,bună,buni,bune|good/better/best
rău,rea,răi,rele|bad/worse/worst
frumos,frumoasă,frumoși,frumoase|beautiful
urât,urâtă,urâți,urâte|ugly
fericit,fericită,fericiți,fericite|happy
trist,tristă,triști,triste|sad
supărat,supărată,supărați,supărate|upset
obosit,obosită,obosiți,obosite|tired
flămând,flămândă,flămânzi,flămânde|hungry
însetat,însetată,însetați,însetate|thirsty
cald,caldă,calzi,calde|warm/warmer/warmest
rece,rece,reci,reci|cold/colder/coldest
fierbinte,fierbinți|hot
dulce,dulci|sweet
sărat,sărată,sărați,sărate|salty
acru,acră,acri,acre|sour
amar,amară,amari,amare|bitter
gustos,gustoasă,gustoși,gustoase|tasty
plin,plină,plini,pline|full
gol,goală,goi,goale|empty
deschis,deschisă,deschiși,deschise|open
închis,închisă,închiși,închise|closed
curat,curată,curați,curate|clean
murdar,murdară,murdari,murdare|dirty
rapid,rapidă,rapizi,rapide|fast
lent,lentă,lenți,lente|slow
puternic,puternică,puternici,puternice|strong
slab,slabă,slabi,slabe|weak
periculos,periculoasă,periculoși,periculoase|dangerous
blând,blândă,blânzi,blânde|gentle
sălbatic,sălbatică,sălbatici,sălbatice|wild
domestic,domestică,domestici,domestice|domestic
corect,corectă,corecți,corecte|correct
greșit,greșită,greșiți,greșite|wrong
adevărat,adevărată,adevărați,adevărate|true
fals,falsă,falși,false|false
gata|ready
liber,liberă,liberi,libere|free
ocupat,ocupată,ocupați,ocupate|busy
sigur,sigură,siguri,sigure|sure
mulțumit,mulțumită,mulțumiți,mulțumite|pleased
amuzant,amuzantă,amuzanți,amuzante|funny
interesant,interesantă,interesanți,interesante|interesting
important,importantă,importanți,importante|important
diferit,diferită,diferiți,diferite|different
întreg,întreagă,întregi,întregi|whole
stâng,stângă,stângi,stângi|left
drept,dreaptă,drepți,drepte|right
rotund,rotundă,rotunzi,rotunde|round
ascuțit,ascuțită,ascuțiți,ascuțite|sharp
moale|soft
tare,tari|hard
zgomotos,zgomotoasă,zgomotoși,zgomotoase|noisy
liniștit,liniștită,liniștiți,liniștite|quiet
singur,singură,singuri,singure|alone
bolnav,bolnavă,bolnavi,bolnave|sick
sănătos,sănătoasă,sănătoși,sănătoase|healthy
mort,moartă,morți,moarte|dead
viu,vie,vii,vii|alive
ud,udă,ude,ude|wet
uscat,uscată,uscați,uscate|dry
înfricoșător|scary
inteligent,inteligentă,inteligenți,inteligente|smart
leneș,leneșă,leneși,leneșe|lazy
același,aceeași,aceiași,aceleași|same
`;

// Function words. flags: neg, freq, time, lead, drop, op
const WORD_ROWS = `
în|in|prep
la|at|prep
pe|on|prep
din|from|prep
de|of|prep
cu|with|prep
fără|without|prep neg
pentru|for|prep
spre|toward|prep
către|to|prep
între|between|prep
sub|under|prep
peste|over|prep
lângă|next to|prep
după|after|prep
înainte|before|prep
despre|about|prep
prin|through|prep
până|until|prep
dintre|among|prep
contra|against|prep
deasupra|above|prep
dedesubt|below|prep
ca|like|prep
și|and|conj
sau|or|conj
dar|but|conj
iar|and|conj
însă|however|conj
dacă|if|conj sub
când|when|conj sub
că|that|conj sub
deoarece,fiindcă|because|conj sub
deci|so|conj
decât|than|conj than
deși|although|conj sub
atunci|then|adv lead
apoi|then|adv lead
foarte|very|adv
mai|more|adv
mereu,întotdeauna|always|adv freq
uneori|sometimes|adv freq
des,adesea|often|adv freq
rar|rarely|adv freq
niciodată|never|adv freq neg
deja|already|adv freq
încă|still|adv freq
doar,numai|only|adv freq
tot|still|adv freq
acum|now|adv time
azi,astăzi|today|adv time
mâine|tomorrow|adv time
ieri|yesterday|adv time
devreme|early|adv time
târziu|late|adv time
aici|here|adv
acolo|there|adv
sus|up|adv
jos|down|adv
departe|far|adv
aproape|near|adv
împreună|together|adv
repede|quickly|adv
încet|slowly|adv
bine|well|adv
așa|like this|adv
cam,aproximativ|about|adv
exact|exactly|adv
poate|maybe|adv
desigur|of course|adv lead
probabil|probably|adv
imediat|immediately|adv
deodată|suddenly|adv
acasă|home|adv
afară|outside|adv
înăuntru|inside|adv
nu|not|neg
nici|nor|neg
nimic|nothing|neg
nimeni|nobody|neg
nicăieri|nowhere|neg
deloc|at all|adv
ok,okay|OK|interj lead
mersi|thanks|interj lead
scuze|sorry|interj lead
pa|bye|interj lead
hei|hey|interj lead
vai|oh|interj lead
ura|hooray|interj lead
oare|-|adv drop
plus|plus|op
minus|minus|op
ori|times|op
egal|equals|op
ce|what|wh
să|-|sa
cine|who|wh
care|which|wh
unde|where|wh
cum|how|wh
cât,câtă|how much|wh
câte,câți|how many|wh
un|a|det
o|a|det
niște|some|det quant
acest,această,acești,aceste|this/these|det
acel,acea,acei,acele|that/those|det
fiecare|each|det quant
orice,oricare|any|det quant
toți,toate,toată|all|det quant
mulți,multe,multă|many|det quant
puțini,puține,puțină|few|det quant
câțiva,câteva|some|det quant
ambii,ambele|both|det quant
alt,altă,alți,alte|other|det
niciun,nicio,nici un|no|det neg
ceva|something|pron
altceva|something else|pron
eu|I|pron
tu|you|pron
el|he|pron
ea|she|pron
noi|we|pron
voi|you|pron
ei,ele|they|pron
dumneavoastră,dumneata|you|pron
mine|me|pron
tine|you|pron
meu,mea,mei,mele|my|poss
tău,ta,tăi,tale|your|poss
său,sa,săi,sale|his|poss
nostru,noastră,noștri,noastre|our|poss
vostru,voastră,voștri,voastre|your|poss
lor|their|poss
luni|Monday|day
marți|Tuesday|day
miercuri|Wednesday|day
joi|Thursday|day
vineri|Friday|day
sâmbătă|Saturday|day
duminică|Sunday|day
ianuarie|January|month
februarie|February|month
martie|March|month
aprilie|April|month
mai|May|month
iunie|June|month
iulie|July|month
august|August|month
septembrie|September|month
octombrie|October|month
noiembrie|November|month
decembrie|December|month
da|yes|interj lead
bună|hello|interj lead
salut|hi|interj lead
mulțumesc|thank you|interj lead
gata|done|interj lead
`;

const NAME_ROWS = `
Ion|m
Maria|f
Ana|f
Andrei|m
Mihai|m
Elena|f
Ioana|f
Radu|m
Vlad|m
Mara|f
Tudor|m
Alex|m
Dan|m
Gabriel|m
Sofia|f
Luca|m
Matei|m
Cristina|f
Andreea|f
Ioan|m
Vasile|m
George|m
Paul|m
Bogdan|m
Ștefan|m
Irina|f
Laura|f
Diana|f
Alina|f
Teo|m
Tom|m
Anna|f
Mia|f
Dana|f
Carmen|f
Victor|m
Nicu|m
Gheorghe|m
Raluca|f
Bianca|f
Rareș|m
Darius|m
Denisa|f
Adrian|m
Florin|m
Mădălina|f
Simona|f
Sorin|m
Ciprian|m
Lucian|m
Emil|m
Eva|f
Ema|f
`;

const NUMBER_ROWS = `
zero|0
unu,una,unul|1
doi,două|2
trei|3
patru|4
cinci|5
șase|6
șapte|7
opt|8
nouă|9
zece|10
unsprezece,unspe|11
doisprezece,douăsprezece,douăspe|12
treisprezece,treispe|13
paisprezece,paispe|14
cincisprezece,cincispe|15
șaisprezece,șaispe|16
șaptesprezece,șaptespe|17
optsprezece,optspe|18
nouăsprezece,nouăspe|19
douăzeci|20
treizeci|30
patruzeci|40
cincizeci|50
șaizeci|60
șaptezeci|70
optzeci|80
nouăzeci|90
sută,sute|100
mie,mii|1000
`;

function lines(str) {
  return str.split('\n').map((l) => l.trim()).filter(Boolean);
}

function parseNouns() {
  return lines(NOUN_ROWS).map((l) => {
    const [ro, en, gf, , extra] = l.split('|');
    const [sg, pl] = ro.split(',');
    const [esg, epl] = en.split('/');
    const fl = (gf || 'n').trim().split(/\s+/);
    const flags = new Set(fl.slice(1));
    if (flags.has('pl') && !pl) { /* plural-only */ }
    return {
      pos: 'noun', ro: sg, rop: pl || null, en: esg, enp: epl || null, g: fl[0], flags,
      extra: extra ? extra.split(',') : [],
    };
  });
}

function parseVerbs() {
  return lines(VERB_ROWS).map((l) => {
    const [inf, en, pres, part, flagStr] = l.split('|');
    const [base, past, pp] = en.split('/');
    const flags = {};
    for (const f of (flagStr || '').trim().split(/\s+/).filter(Boolean)) {
      const eq = f.indexOf('=');
      if (eq >= 0) flags[f.slice(0, eq)] = f.slice(eq + 1); else flags[f] = true;
    }
    return { pos: 'verb', inf, en: base, past: past || null, pp: pp || null, pres: pres.trim(), part: part === '-' ? null : part, flags };
  });
}

function parseAdjs() {
  return lines(ADJ_ROWS).map((l) => {
    const [ro, en] = l.split('|');
    const forms = ro.split(',');
    const [e, comp, sup] = en.split('/');
    let f;
    if (forms.length === 1) f = { ms: forms[0], fs: forms[0], mp: forms[0], fp: forms[0] };
    else if (forms.length === 2) f = { ms: forms[0], fs: forms[0], mp: forms[1], fp: forms[1] };
    else f = { ms: forms[0], fs: forms[1], mp: forms[2], fp: forms[3] };
    return { pos: 'adj', ro: forms[0], forms: f, en: e, comp: comp || null, sup: sup || null };
  });
}

function parseWords() {
  return lines(WORD_ROWS).map((l) => {
    const [ro, en, posField, fl] = l.split('|');
    const [pos, ...pf] = posField.trim().split(/\s+/);
    const flags = new Set([...pf, ...(fl || '').trim().split(/\s+/)].filter(Boolean));
    return { pos, keys: ro.split(','), en, flags, ro: ro.split(',')[0] };
  });
}

function parseNames() {
  return lines(NAME_ROWS).map((l) => {
    const [name, g] = l.split('|');
    return { pos: 'name', name, gender: g };
  });
}

function parseNumbers() {
  return lines(NUMBER_ROWS).map((l) => {
    const [ro, v] = l.split('|');
    return { pos: 'num', keys: ro.split(','), value: Number(v), ro: ro.split(',')[0] };
  });
}

export const nouns = parseNouns();
export const verbs = parseVerbs();
export const adjectives = parseAdjs();
export const words = parseWords();
export const names = parseNames();
export const numberWords = parseNumbers();

/** Number of lexicon entries (nouns + verbs + adjectives + function words + names + number words). */
export const lexiconSize = nouns.length + verbs.length + adjectives.length + words.length + names.length + numberWords.length;

export default { nouns, verbs, adjectives, words, names, numberWords, lexiconSize };
