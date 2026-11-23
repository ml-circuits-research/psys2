# Owner phrase-log items (English; Romanian originals translated by hand, typos kept where the owner typed English).
import json,sys
OUT=sys.argv[1]
items=[]
def add(tab,session,text,desc,effects,cons=(),ctx=None,src='phrase-log',orig_lang='en'):
    n=len(items)+1
    it={"id":f"owner-{tab}-{n:03d}","tab":tab,"area":tab,"text":text,"session":session,
        "source":{"corpus":"owner-phrase-log","id":src,"licence":"project-owned (AGPL-3.0 repository data)","translated_from_other_language":orig_lang!='en'},
        "redistributable":True,"adaptation":"translated to English" if orig_lang!='en' else "none",
        "construction":list(cons),"expect":{"description":desc,"effects":effects}}
    if ctx is not None: it["context"]=ctx
    items.append(it)
E={"existing":[]}
C=lambda kind,**k:dict(type="create",kind=kind,**k)
CH=lambda t,p,v=None:{"type":"change","target":t,"property":p,**({"value":v} if v else {})}
MV=lambda t,d=None,rel=None:{"type":"move","target":t,**({"direction":d} if d else {}),**({"relation":rel} if rel else {})}
RM=lambda t:{"type":"remove","target":t}
NC=lambda why:{"type":"no_change","why":why}
LAY=lambda a,t="all":{"type":"layout","target":t,"arrangement":a}
# --- Drawing session analysed in owner-log-analysis.md (exports v3/v4 replay)
s='owner-draw-v4'
add('drawing',s,"draw a boy and a girl","A boy and a girl are drawn.",[C('boy'),C('girl')],['create','coordination','multi-request'],E,'v4-export')
add('drawing',s,"draw an old person","An old person (e.g. grandfather or grandmother) is drawn.",[C('old person')],['create','attribute'],None,'v4-export')
add('drawing',s,"draw a cat and 2 dogs","One cat and two dogs are drawn.",[C('cat'),C('dog',count=2)],['create','coordination','quantity'],None,'v4-export')
add('drawing',s,"draw some land in background","Land/ground fills the lower background band of the picture.",[C('land',relation={"rel":"in","landmark":"background"})],['create','region','vague-quantity'],None,'v4-export')
add('drawing',s,"draw a lake over that background, the background should be big like 30% from the bottom of the screen","A lake is drawn on the land; the land covers about the bottom 30% of the page.",[C('lake',relation={"rel":"on","landmark":"land"}),CH('land','size','30% from the bottom')],['create','relation','anaphora','multi-request','degree'],None,'v4-export')
add('drawing',s,"draw some houses near th e lake","Several (2-5) houses are drawn near the lake.",[C('house',count='some',relation={"rel":"near","landmark":"lake"})],['create','vague-quantity','relation','typo'],None,'v4-export')
add('drawing',s,"the lake shape should be iregulat, nor a circle of elipse","The lake outline becomes irregular (not a circle or ellipse).",[CH('lake','shape','irregular')],['change','shape','negation','typo'],None,'v4-export')
add('drawing',s,"draw a sun","A sun is drawn (in the sky).",[C('sun')],['create'],None,'v4-export')
add('drawing',s,"draw some clouds","Several (2-5) clouds are drawn in the sky.",[C('cloud',count='some')],['create','vague-quantity'],None,'v4-export')
add('drawing',s,"put some yes to the sun","Eyes are added to the sun (typo for 'eyes').",[{"type":"change","target":"sun","property":"part","value":"add eyes"}],['part','typo','change'],None,'v4-export')
add('drawing',s,"some eyes","Eyes are added to the sun (repair of the previous turn).",[{"type":"change","target":"sun","property":"part","value":"add eyes"}],['fragment','part','anaphora'],None,'v4-export')
add('drawing',s,"who is eyes a cat?","An explanation of why 'eyes' was taken as a cat (challenge to the previous result); nothing changes.",[{"type":"query","about":"why the previous turn drew a cat"}],['question','complaint','typo'],None,'v4-export')
add('drawing',s,"draw some dogs","Several (2-5) dogs are drawn.",[C('dog',count='some')],['create','vague-quantity'],None,'v4-export')
add('drawing',s,"draw a person","A person is drawn.",[C('person')],['create'],None,'v4-export')
add('drawing',s,"it is ugly draw a different person","The person is replaced by (or joined by) a person who looks different.",[C('person',attrs={"look":"different"})],['create','complaint','comparative'],None,'v4-export')
# --- Drawing exports 2026-11-14/15/16
add('drawing','owner-draw-1114',"draw something random","Some random object or small scene is drawn.",[C('any')],['create','vague'],E,'phrase-log-2026-11-14T2243','ro')
s='owner-draw-1115'
add('drawing',s,"draw something beautiful","Something beautiful (e.g. a small scene) is drawn.",[C('any')],['create','vague'],E,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"draw a house","A house is drawn.",[C('house')],['create'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"draw whatever you want","Any drawing is made.",[C('any')],['create','vague'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"delete the drawing","The page is cleared.",[RM('all')],['remove'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"draw a painting with a lake","A picture (landscape) containing a lake is drawn.",[C('lake')],['create','scene'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"draw a pond","A pond (small lake) is drawn.",[C('pond')],['create'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"you overdid it","Acknowledge the complaint (too many elements); nothing changes or extra elements are reduced.",[NC('complaint')],['complaint'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"delete the extra elements, way too many elements, where is the water?","Superfluous elements are removed, and the user is told where the water is (or water is shown).",[RM('extra elements'),{"type":"query","about":"where the water is"}],['remove','question','multi-request','vague'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"put the fish in that","The fish are moved into the water.",[MV('fish',rel={"rel":"in","landmark":"water"})],['move','anaphora','relation'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"leave the water plants in the water, put grass above the water, keep the sky azure blue","Water plants stay in the water, grass is placed above the water, the sky stays azure.",[MV('water plants',rel={"rel":"in","landmark":"water"}),C('grass',relation={"rel":"above","landmark":"water"}),CH('sky','colour','azure')],['multi-request','relation','colour'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"the water plants, I said","Repair: the water plants (not something else) go in the water.",[MV('water plants',rel={"rel":"in","landmark":"water"})],['fragment','repair'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"put the fish down on the first level","The fish move down to the lowest (water) level.",[MV('fish','down',rel={"rel":"in","landmark":"first level"})],['move','ordinal','region'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"move the fish to the first level","The fish move to the lowest level.",[MV('fish',rel={"rel":"in","landmark":"first level"})],['move','ordinal','region'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"split the drawing into 3 levels: water, grass/landscape, sky","The page is organised in three horizontal bands: water at the bottom, grass/landscape in the middle, sky on top.",[LAY('three bands: water, grass, sky')],['layout','region','enumeration'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"move the elements logically onto the three levels","Each object moves to the band where it belongs (fish to water, trees to land, clouds to sky).",[LAY('objects to their bands')],['layout','vague','knowledge'],None,'phrase-log-2026-11-15T0734','ro')
add('drawing',s,"you don't really understand what I'm telling you, are you stupid?","Acknowledge the frustration politely; nothing changes.",[NC('complaint')],['complaint','question'],None,'phrase-log-2026-11-15T0734','ro')
s='owner-draw-1115en'
add('drawing',s,"create a random picture","A random picture is drawn.",[C('any')],['create','vague'],E,'phrase-log-2026-11-15T1143-en')
add('drawing',s,"break in 3 layers: eater, land and sky","The page is organised in three bands: water, land, sky (typo 'eater' = water).",[LAY('three bands: water, land, sky')],['layout','region','typo','enumeration'],None,'phrase-log-2026-11-15T1143-en')
add('drawing',s,"make sunt green","The sun becomes green (typo 'sunt').",[CH('sun','colour','green')],['change','colour','typo'],None,'phrase-log-2026-11-15T1143-en')
add('drawing',s,"add a small pond","A small pond is drawn.",[C('pond',attrs={"size":"small"})],['create','attribute'],None,'phrase-log-2026-11-15T1143-en')
s='owner-draw-1116'
add('drawing',s,"draw a landscape with water, ground, sky, clouds, sun, 2 different houses","A landscape with water, ground, sky, clouds, a sun and two houses that look different.",[C('water'),C('ground'),C('sky'),C('cloud',count='some'),C('sun'),C('house',count=2,attrs={"look":"different"})],['create','enumeration','quantity','scene'],E,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw a landscape with water, ground, sky","A landscape with water, ground and sky.",[C('water'),C('ground'),C('sky')],['create','enumeration','scene'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw a random landscape","A random landscape is drawn.",[C('landscape')],['create','scene','vague'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw something","Something is drawn.",[C('any')],['create','vague'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"something else","Something different from the previous drawing is drawn.",[C('any')],['fragment','anaphora'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"arrange everything more naturally","Objects are rearranged into a more natural composition.",[LAY('natural')],['layout','vague','comparative'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"arrange the elements better","Objects are rearranged into a better composition.",[LAY('better')],['layout','vague','comparative'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put a duck","A duck is drawn.",[C('duck')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"on the lake","The duck (just drawn) is placed on the lake.",[MV('duck',rel={"rel":"on","landmark":"lake"})],['fragment','relation','anaphora'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put the duck on the lake","The duck is placed on the lake.",[MV('duck',rel={"rel":"on","landmark":"lake"})],['move','relation'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"how come it doesn't exist?","An explanation of why the duck/lake was not found; nothing changes.",[{"type":"query","about":"why the object was not found"}],['question','complaint'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"add a green duck","A green duck is drawn.",[C('duck',attrs={"colour":"green"})],['create','colour'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the green duck in water","The green duck moves into the water.",[MV('duck',rel={"rel":"in","landmark":"water"})],['move','relation','attribute-selector'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"Change the colour of the green bird to yellow.","The green bird/duck becomes yellow.",[CH('duck','colour','yellow')],['change','colour','attribute-selector'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move it to the lake","The bird moves to the lake.",[MV('duck',rel={"rel":"on","landmark":"lake"})],['move','anaphora','relation'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the house over water","The house moves above the water.",[MV('house',rel={"rel":"above","landmark":"water"})],['move','relation'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the birds near lake","The birds move near the lake.",[MV('bird',rel={"rel":"near","landmark":"lake"})],['move','relation','plural'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"the lake is not there","Complaint: the lake is missing/misplaced; show or recreate the lake.",[{"type":"query","about":"where the lake is"}],['complaint','negation'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the house down","The house moves down.",[MV('house','down')],['move','direction'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"down","The house moves further down.",[MV('house','down')],['fragment','anaphora','direction'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the flowers down","The flowers move down.",[MV('flower','down')],['move','direction','plural'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"the pond up","The pond moves up.",[MV('pond','up')],['fragment','direction'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move th epond upper","The pond moves up.",[MV('pond','up')],['move','direction','typo','comparative'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the lake upper","The lake moves up.",[MV('lake','up')],['move','direction','comparative'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"move the watter upper","The water moves up.",[MV('water','up')],['move','direction','typo'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"put more patches for green","More green patches (grass) are added.",[C('patch',count='some',attrs={"colour":"green"})],['create','vague-quantity','comparative'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"put  green grass","Green grass is drawn.",[C('grass',attrs={"colour":"green"})],['create','colour'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"more","More of the same (grass) is added.",[C('grass',count='some')],['fragment','anaphora','vague-quantity'],None,'phrase-log-2026-11-16T0751')
add('drawing',s,"place a swing","A swing is drawn.",[C('swing')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put a swing","A swing is drawn.",[C('swing')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put a child on the swing","A child is drawn sitting on the swing.",[C('child',relation={"rel":"on","landmark":"swing"})],['create','relation'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw a child","A child is drawn.",[C('child')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put him on the swing","The child moves onto the swing.",[MV('child',rel={"rel":"on","landmark":"swing"})],['move','anaphora','relation'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"the child is not a skeleton, make a real child","The stick-figure child is replaced by a realistic-looking child.",[CH('child','look','realistic')],['complaint','negation','change'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw a grandfather","A grandfather is drawn.",[C('grandfather')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"draw a little girl","A little girl is drawn.",[C('girl')],['create'],None,'phrase-log-2026-11-16T0751','ro')
add('drawing',s,"put random colours on the flowers' petals","Each flower's petals get random colours.",[CH('flower petals','colour','random')],['change','part','possessive','random'],None,'phrase-log-2026-11-16T0751','ro')
# --- Avatar requests typed in the draw tab (avatar intent)
s='owner-avatar-1116'
add('avatar',s,"change the avatar to be a robot","The avatar becomes a robot.",[CH('avatar','preset','robot')],['change','preset'],E,'phrase-log-2026-11-16T0751','ro')
add('avatar',s,"make the avatar a man","The avatar becomes a man.",[CH('avatar','preset','man')],['change','preset'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"become a boy","The avatar becomes a boy.",[CH('avatar','preset','boy')],['change','preset','implicit-object'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"become a man","The avatar becomes a man.",[CH('avatar','preset','man')],['change','preset','implicit-object'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"look surprised","The avatar shows a surprised expression.",[CH('avatar','expression','surprised')],['change','expression','implicit-object'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"look sad","The avatar shows a sad expression.",[CH('avatar','expression','sad')],['change','expression','implicit-object'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"become a woman with curly hair","The avatar becomes a woman with curly hair.",[CH('avatar','preset','woman with curly hair')],['change','preset','attribute'],None,'phrase-log-2026-11-16T0751')
add('avatar',s,"become a bearded man","The avatar becomes a bearded man.",[CH('avatar','preset','bearded man')],['change','preset','attribute'],None,'phrase-log-2026-11-16T0751')
# --- Diagram session from this conversation (owner, 2026-11-20)
s='owner-diagram-1120'
add('diagram',s,"ad a diagram with 5 nodes","Five nodes are created.",[C('node',count=5)],['create','quantity','typo'],E,'owner-session-2026-11-20')
add('diagram',s,"add another box","One more rectangular node is added.",[C('rectangle')],['create','anaphora','comparative'],None,'owner-session-2026-11-20')
add('diagram',s,"connect all elements","All nodes are connected (e.g. a chain or a tree).",[{"type":"connect","from":"all","to":"all"}],['connect','quantifier'],None,'owner-session-2026-11-20')
add('diagram',s,"connect cirles with an arraw","The circles are connected with arrows.",[{"type":"connect","from":"circle","to":"circle","attrs":{"arrow":"forward"}}],['connect','plural','typo'],None,'owner-session-2026-11-20')
add('diagram',s,"improve layout","The diagram is laid out more clearly.",[LAY('better')],['layout','vague','comparative'],None,'owner-session-2026-11-20')
add('diagram',s,"make the line e1 to look better","Link e1 gets a cleaner look (e.g. straighter, thicker or better routed).",[CH('e1','style','better')],['change','vague','identifier'],None,'owner-session-2026-11-20')
# same sentences with the state the owner had (seeded), single-turn
N5={"existing":[{"kind":"circle","name":"A"},{"kind":"circle","name":"B"},{"kind":"circle","name":"C"},{"kind":"rectangle","name":"D"},{"kind":"rectangle","name":"E"}]}
add('diagram',None,"add another box","One more rectangular node is added.",[C('rectangle')],['create','anaphora'],N5,'owner-session-2026-11-20 (seeded)')
add('diagram',None,"connect all elements","All nodes are connected.",[{"type":"connect","from":"all","to":"all"}],['connect','quantifier'],N5,'owner-session-2026-11-20 (seeded)')
add('diagram',None,"connect cirles with an arraw","The circles are connected with arrows.",[{"type":"connect","from":"circle","to":"circle"}],['connect','plural','typo'],N5,'owner-session-2026-11-20 (seeded)')
add('diagram',None,"improve layout","The diagram is laid out more clearly.",[LAY('better')],['layout','vague'],N5,'owner-session-2026-11-20 (seeded)')
# --- Diagram exports
s='owner-diagram-1115'
L='phrase-log-2026-11-15T0734'
add('diagram',s,"draw a diagram shaped like a house","Nodes and links are created and arranged in the outline of a house.",[C('node',count='some'),LAY('house shape')],['create','layout','shape'],E,L,'ro')
add('diagram',s,"create a random diagram","A random diagram (nodes with links) is created.",[C('node',count='some'),{"type":"connect","from":"all","to":"all"}],['create','vague'],None,L,'ro')
add('diagram',s,"arrange the diagram's elements as a hexagon","Nodes are placed on a hexagon.",[LAY('hexagon')],['layout','shape'],None,L,'ro')
add('diagram',s,"arrange the diagram's elements as a hexagon with the circle in the middle","Nodes on a hexagon, the circle node in the centre.",[LAY('hexagon with circle in centre')],['layout','shape','relation'],None,L,'ro')
add('diagram',s,"arrange the diagram's elements better","Nodes are laid out more clearly.",[LAY('better')],['layout','vague','comparative'],None,L,'ro')
add('diagram',s,"rearrange the diagram","A new layout is applied.",[LAY('different')],['layout'],None,L,'ro')
add('diagram',s,"make the diagram prettier","The diagram looks better (layout/colours).",[LAY('better')],['layout','vague','comparative'],None,L,'ro')
add('diagram',s,"rearrange","A new layout is applied.",[LAY('different')],['layout','fragment'],None,L,'ro')
add('diagram',s,"put the elements in the middle higher","The middle nodes move up.",[MV('middle nodes','up')],['move','direction','region-selector'],None,L,'ro')
add('diagram',s,"delete the circle","The circle node is removed.",[RM('circle')],['remove'],None,L,'ro')
add('diagram',s,"put the first and last node lower and the node in the centre higher","First and last nodes move down; the central node moves up.",[MV('first node','down'),MV('last node','down'),MV('centre node','up')],['move','ordinal','multi-request','coordination'],None,L,'ro')
NR={"existing":[{"kind":"rectangle","name":"Problems"},{"kind":"rectangle","name":"Work done"},{"kind":"rectangle","name":"Results"},{"kind":"rectangle","name":"Summary"}]}
s='owner-diagram-1115b'
add('diagram',s,"move results higher","The Results node moves up.",[MV('Results','up')],['move','direction','name'],NR,L,'ro')
add('diagram',s,"and higher still","Results moves further up.",[MV('Results','up')],['fragment','anaphora','degree'],None,L,'ro')
add('diagram',s,"move work done and problems higher","Work done and Problems move up.",[MV('Work done','up'),MV('Problems','up')],['move','coordination','name'],None,L,'ro')
add('diagram',s,"move summary to around the middle","Summary moves to about the centre.",[MV('Summary',rel={"rel":"at","landmark":"centre"})],['move','region','hedge'],None,L,'ro')
add('diagram',s,"lower","Summary moves down.",[MV('Summary','down')],['fragment','anaphora','direction'],None,L,'ro')
add('diagram',s,"no, problems; put problems back where it was","Correction: Problems returns to its previous position.",[MV('Problems',rel={"rel":"at","landmark":"previous position"})],['repair','negation','undo'],None,L,'ro')
add('diagram',s,"wrong, move problems higher","Problems moves up.",[MV('Problems','up')],['repair','move','direction'],None,L,'ro')
add('diagram',s,"move summary lower","Summary moves down.",[MV('Summary','down')],['move','direction'],None,L,'ro')
add('diagram',s,"move problems higher","Problems moves up.",[MV('Problems','up')],['move','direction'],None,L,'ro')
add('diagram',None,"make a random drawing","A random diagram is created in the diagram tab.",[C('node',count='some')],['create','vague','cross-tab'],E,L,'ro')
add('diagram',None,"draw something random","A random diagram is created in the diagram tab.",[C('node',count='some')],['create','vague','cross-tab'],E,L,'ro')
s='owner-diagram-1115en'
L='phrase-log-2026-11-15T1143-en'
add('diagram',s,"creare a random diagram","A random diagram (nodes and links) is created.",[C('node',count='some')],['create','vague','typo'],E,L)
add('diagram',s,"this is stupid, my expectatiom was to get a nice eiagram5-10 ndes, arraws, nice layout, not a circle","A diagram with 5-10 nodes connected by arrows in a clear (non-circular) layout replaces the circle layout.",[C('node',count='5-10'),{"type":"connect","from":"all","to":"all"},LAY('not circle')],['complaint','create','quantity','negation','typo'],None,L)
add('diagram',s,"you are saying that I am stupid?","Polite clarification; nothing changes.",[NC('chit-chat')],['complaint','question'],None,L)
add('diagram',s,"you are stupid","Polite acknowledgement; nothing changes.",[NC('complaint')],['complaint'],None,L)
add('diagram',s,"add 5 random nodes","Five nodes of random shapes are added.",[C('node',count=5)],['create','quantity','random'],None,L)
add('diagram',s,"not all circles, better layout","Some nodes change to other shapes and the layout improves.",[CH('nodes','kind','varied'),LAY('better')],['negation','quantifier','multi-request','fragment'],None,L)
# --- Document requests typed in the editor tab
L='phrase-log-2026-11-15T0734'
add('document',None,"where is Paris","A knowledge answer (Paris is in France) or an honest out-of-scope reply; the document is unchanged.",[{"type":"query","about":"location of Paris"}],['question','out-of-scope'],E,L,'ro')
add('document',None,"write me a story about a lake where a storyteller writes a story about frogs","A story about a lake, with a storyteller writing about frogs, is composed in the document.",[C('text',attrs={"genre":"story","topic":"a lake; storyteller writing about frogs"})],['create','compose','nested-topic'],E,L,'ro')
add('document',None,"compose a story with 3 chapters about a lake","A three-chapter story about a lake is composed.",[C('text',attrs={"genre":"story","topic":"lake","chapters":3})],['create','compose','quantity'],E,L,'ro')
with open(OUT,'w') as f:
    for it in items: f.write(json.dumps(it,ensure_ascii=False)+'\n')
from collections import Counter
print(len(items),Counter(i['tab'] for i in items))
