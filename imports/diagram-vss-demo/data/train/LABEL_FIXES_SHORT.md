# Label fixes for the one-request short messages (llm_train/sonnet_short, haiku_short)

Label check of 2026-11-02 following skills/llm-annotated-data/SKILL.md step 4 (run by the annotating agent, Sonnet; the coordinator should review). Checked by script: every gold wire of the 3000 rows (1500 + 1500) against `LABEL_CONVENTIONS.md` (legend keys and values, mention format and key order, `$new`, "line", "next to", pairing, size words, shape for "box") and against the keys-per-action majority of the existing data (`llm_train/*_msg*`, `sonnet_long`, `llm_bench/fresh1`, `llm_bench/*_spans`; 4640 messages, 22702 wires). Not changed: texts, ids, names (verified byte-identical to `texts_*.jsonl`, which are copies of `llm_train/{sonnet,haiku}/train_*.jsonl`). The source files `llm_train/{sonnet,haiku}/train_*.jsonl` were not touched; only the gold in `msg_*.jsonl` was fixed. Spans and triggers are unchanged by the fixes.

## Counts

| kind of fix | wires changed |
|---|---|
| Rule 2026-10-31: connect whose text says "line" and not "arrow" -> arrow none | 31 |
| "next to X" question -> list, position near, anchor X (was neighbors) | 8 |
| chain / next written with `to` equal to `from` -> `to` removed | 26 |
| pairing all on a one-to-several or several-to-one connect -> pairing removed | 16 |
| total | 81 |

Rows changed: 78 of 3000. Skipped on purpose: ts-1386 "label the line from Dam to Lake" (an existing link, like sm-0290 in the long data).

## Log (id, before, after)

`[text]` is the message text. Arguments are `key=value`.

### Rule 2026-10-31: connect whose text says "line" and not "arrow" -> arrow none

Reason: LABEL_CONVENTIONS (401 spans of the long data; the 3 two-way lines keep their own arrow value both). Count: 31.

- ts-0003 [hook up api to cache with a dashed line]: action=connect,from=Api,to=Cache,style=dashed  ->  action=connect,from=Api,to=Cache,style=dashed,arrow=none
- ts-0242 [connect spleen to liver using a thin dotted line]: action=connect,from=Spleen,to=Liver,style=dotted  ->  action=connect,from=Spleen,to=Liver,style=dotted,arrow=none
- ts-0384 [connect dial to knob, solid green line labelled "turn"]: action=connect,from=Dial,to=Knob,color=green,label=turn  ->  action=connect,from=Dial,to=Knob,color=green,label=turn,arrow=none
- ts-0442 [run a dotted line from pub to inn]: action=connect,from=Pub,to=Inn,style=dotted  ->  action=connect,from=Pub,to=Inn,style=dotted,arrow=none
- ts-0564 [tie ark to flood with a dashed line labelled "escape"]: action=connect,from=Ark,to=Flood,style=dashed,label=escape  ->  action=connect,from=Ark,to=Flood,style=dashed,label=escape,arrow=none
- ts-0664 [connect fan to roof with a navy dotted line]: action=connect,from=Fan,to=Roof,color=navy,style=dotted  ->  action=connect,from=Fan,to=Roof,color=navy,style=dotted,arrow=none
- ts-0668 [draw a line labelled "mentor" from sam to tess]: action=connect,from=Sam,to=Tess,label=mentor  ->  action=connect,from=Sam,to=Tess,label=mentor,arrow=none
- ts-0807 [connect axle to wheel with a dashed line]: action=connect,from=Axle,to=Wheel,style=dashed  ->  action=connect,from=Axle,to=Wheel,style=dashed,arrow=none
- ts-0936 [i want a dotted line from sink to drain]: action=connect,from=Sink,to=Drain,style=dotted  ->  action=connect,from=Sink,to=Drain,style=dotted,arrow=none
- ts-1045 [join fan and grille with a dashed orange line]: action=connect,from=Fan,to=Grille,style=dashed,color=orange  ->  action=connect,from=Fan,to=Grille,style=dashed,color=orange,arrow=none
- ts-1145 [connect pisa to siena with a dotted gray line]: action=connect,from=Pisa,to=Siena,style=dotted,color=gray  ->  action=connect,from=Pisa,to=Siena,style=dotted,color=gray,arrow=none
- ts-1147 [connect milan to bari and call the line "rail"]: action=connect,from=Milan,to=Bari,label=rail  ->  action=connect,from=Milan,to=Bari,label=rail,arrow=none
- ts-1382 [draw a dashed line from tap2 to basin]: action=connect,from=Tap2,to=Basin,style=dashed  ->  action=connect,from=Tap2,to=Basin,style=dashed,arrow=none
- ts-1484 [connect web2 to api2 with a dashed line]: action=connect,from=Web2,to=Api2,style=dashed  ->  action=connect,from=Web2,to=Api2,style=dashed,arrow=none
- ts-1485 [link db2 and cache2 with a dotted line]: action=connect,from=Db2,to=Cache2,style=dotted  ->  action=connect,from=Db2,to=Cache2,style=dotted,arrow=none
- th-0022 [hook up switch and server with a dashed line]: action=connect,from=Switch,to=Server,style=dashed  ->  action=connect,from=Switch,to=Server,style=dashed,arrow=none
- th-0122 [connect api to db with a dotted line]: action=connect,from=Api,to=Db,style=dotted  ->  action=connect,from=Api,to=Db,style=dotted,arrow=none
- th-0123 [run a red line from worker to queue]: action=connect,from=Worker,to=Queue,color=red  ->  action=connect,from=Worker,to=Queue,color=red,arrow=none
- th-0322 [cto and cfo both report to ceo, draw all of those lines]: action=connect,from=Cto,Cfo,to=Ceo,pairing=all  ->  action=connect,from=Cto,Cfo,to=Ceo,pairing=all,arrow=none
- th-0424 [a red line from travel to notes labelled 'plan']: action=connect,from=Travel,to=Notes,color=red,label=plan  ->  action=connect,from=Travel,to=Notes,color=red,label=plan,arrow=none
- th-0623 [draw a dotted line between mom and kid]: action=connect,from=Mom,to=Kid,style=dotted  ->  action=connect,from=Mom,to=Kid,style=dotted,arrow=none
- th-0722 [run lines from each of central, harbor and park to the next one]: action=connect,from=Central,Harbor,Park,to=Central,Harbor,Park,pairing=next  ->  action=connect,from=Central,Harbor,Park,to=Central,Harbor,Park,pairing=next,arrow=none
- th-0723 [connect museum and park with a dashed line]: action=connect,from=Museum,to=Park,style=dashed  ->  action=connect,from=Museum,to=Park,style=dashed,arrow=none
- th-0825 [draw a navy line from user to ledger]: action=connect,from=User,to=Ledger,color=navy  ->  action=connect,from=User,to=Ledger,color=navy,arrow=none
- th-0920 [a dotted line from striker to winger]: action=connect,from=Striker,to=Winger,style=dotted  ->  action=connect,from=Striker,to=Winger,style=dotted,arrow=none
- th-1021 [run a dashed line from hall to bedroom]: action=connect,from=Hall,to=Bedroom,style=dashed  ->  action=connect,from=Hall,to=Bedroom,style=dashed,arrow=none
- th-1121 [a dashed line from beaker to flask]: action=connect,from=Beaker,to=Flask,style=dashed  ->  action=connect,from=Beaker,to=Flask,style=dashed,arrow=none
- th-1219 [run a line from mic and drum to band, both of them]: action=connect,from=Mic,Drum,to=Band,pairing=all  ->  action=connect,from=Mic,Drum,to=Band,pairing=all,arrow=none
- th-1220 [connect drum to cymbal with a dotted line]: action=connect,from=Drum,to=Cymbal,style=dotted  ->  action=connect,from=Drum,to=Cymbal,style=dotted,arrow=none
- th-1321 [a dashed line from dice to card]: action=connect,from=Dice,to=Card,style=dashed  ->  action=connect,from=Dice,to=Card,style=dashed,arrow=none
- th-1424 [a red line from freeze to ship]: action=connect,from=Freeze,to=Ship,color=red  ->  action=connect,from=Freeze,to=Ship,color=red,arrow=none

### "next to X" question -> list, position near, anchor X (was neighbors)

Reason: LABEL_CONVENTIONS rules of 2026-10-31 (17 questions changed there). Count: 8.

- ts-0113 [what is next to atom?]: ask=neighbors,target=Atom  ->  ask=list,position=near,anchor=Atom
- ts-0699 [which shapes are next to doe]: ask=neighbors,target=Doe  ->  ask=list,position=near,anchor=Doe
- th-0077 [who's next to firewall]: ask=neighbors,target=Firewall  ->  ask=list,position=near,anchor=Firewall
- th-0478 [what's next to budget]: ask=neighbors,target=Budget  ->  ask=list,position=near,anchor=Budget
- th-0778 [which stops are next to central]: ask=neighbors,target=Central  ->  ask=list,position=near,anchor=Central
- th-1075 [what's next to the kitchen]: ask=neighbors,target=Kitchen  ->  ask=list,position=near,anchor=Kitchen
- th-1375 [which pieces are next to board]: ask=neighbors,target=Board  ->  ask=list,position=near,anchor=Board
- th-1476 [who's next to retro]: ask=neighbors,target=Retro  ->  ask=list,position=near,anchor=Retro

### chain / next written with `to` equal to `from` -> `to` removed

Reason: LABEL_CONVENTIONS connect conventions; long data: 1006 chain, 102 next, 40 all, all with no `to`, 0 with `to`. Count: 26.

- th-0021 [tie Router, Firewall and Switch into a chain]: action=connect,from=Router,Firewall,Switch,to=Router,Firewall,Switch,pairing=chain  ->  action=connect,from=Router,Firewall,Switch,pairing=chain
- th-0024 [connect Printer, Switch and Server in a chain]: action=connect,from=Printer,Switch,Server,to=Printer,Switch,Server,pairing=chain  ->  action=connect,from=Printer,Switch,Server,pairing=chain
- th-0121 [tie Web, Api and Db into a chain]: action=connect,from=Web,Api,Db,to=Web,Api,Db,pairing=chain  ->  action=connect,from=Web,Api,Db,pairing=chain
- th-0125 [chain Auth, Api and Web together]: action=connect,from=Auth,Api,Web,to=Auth,Api,Web,pairing=chain  ->  action=connect,from=Auth,Api,Web,pairing=chain
- th-0222 [link Start and Check, each one to the next]: action=connect,from=Start,Check,to=Start,Check,pairing=next  ->  action=connect,from=Start,Check,pairing=next
- th-0225 [chain Start, Check, Review and Done]: action=connect,from=Start,Check,Review,Done,to=Start,Check,Review,Done,pairing=chain  ->  action=connect,from=Start,Check,Review,Done,pairing=chain
- th-0226 [connect each of Start, Check and Done to the next one]: action=connect,from=Start,Check,Done,to=Start,Check,Done,pairing=next  ->  action=connect,from=Start,Check,Done,pairing=next
- th-0325 [connect Pm, Dev, and Lead in a chain]: action=connect,from=Pm,Dev,Lead,to=Pm,Dev,Lead,pairing=chain  ->  action=connect,from=Pm,Dev,Lead,pairing=chain
- th-0425 [chain Goals, Risks and Notes]: action=connect,from=Goals,Risks,Notes,to=Goals,Risks,Notes,pairing=chain  ->  action=connect,from=Goals,Risks,Notes,pairing=chain
- th-0522 [wire Dough, Oven and Mix together in a chain]: action=connect,from=Dough,Oven,Mix,to=Dough,Oven,Mix,pairing=chain  ->  action=connect,from=Dough,Oven,Mix,pairing=chain
- th-0525 [string Sauce, Dough and Oven together in a chain]: action=connect,from=Sauce,Dough,Oven,to=Sauce,Dough,Oven,pairing=chain  ->  action=connect,from=Sauce,Dough,Oven,pairing=chain
- th-0526 [tie each of Cool, Serve and Timer to the next one]: action=connect,from=Cool,Serve,Timer,to=Cool,Serve,Timer,pairing=next  ->  action=connect,from=Cool,Serve,Timer,pairing=next
- th-0622 [Grandma, Mom and Dad link up in a chain]: action=connect,from=Grandma,Mom,Dad,to=Grandma,Mom,Dad,pairing=chain  ->  action=connect,from=Grandma,Mom,Dad,pairing=chain
- th-0625 [chain Grandma, Mom and Kid]: action=connect,from=Grandma,Mom,Kid,to=Grandma,Mom,Kid,pairing=chain  ->  action=connect,from=Grandma,Mom,Kid,pairing=chain
- th-0722 [run lines from each of Central, Harbor and Park to the next one]: action=connect,from=Central,Harbor,Park,to=Central,Harbor,Park,pairing=next,arrow=none  ->  action=connect,from=Central,Harbor,Park,pairing=next,arrow=none
- th-0726 [string Harbor, Stop, Museum in a chain]: action=connect,from=Harbor,Stop,Museum,to=Harbor,Stop,Museum,pairing=chain  ->  action=connect,from=Harbor,Stop,Museum,pairing=chain
- th-0822 [link User, Session and Token in a chain]: action=connect,from=User,Session,Token,to=User,Session,Token,pairing=chain  ->  action=connect,from=User,Session,Token,pairing=chain
- th-0824 [chain Cart, Order and Invoice in order]: action=connect,from=Cart,Order,Invoice,to=Cart,Order,Invoice,pairing=chain  ->  action=connect,from=Cart,Order,Invoice,pairing=chain
- th-0922 [connect Keeper, Defender and Mid in a chain]: action=connect,from=Keeper,Defender,Mid,to=Keeper,Defender,Mid,pairing=chain  ->  action=connect,from=Keeper,Defender,Mid,pairing=chain
- th-1023 [chain Attic, Bath and Bedroom]: action=connect,from=Attic,Bath,Bedroom,to=Attic,Bath,Bedroom,pairing=chain  ->  action=connect,from=Attic,Bath,Bedroom,pairing=chain
- th-1120 [wire Probe, Beaker and Flask one after the next]: action=connect,from=Probe,Beaker,Flask,to=Probe,Beaker,Flask,pairing=next  ->  action=connect,from=Probe,Beaker,Flask,pairing=next
- th-1123 [chain Tube, Flask and Cork together]: action=connect,from=Tube,Flask,Cork,to=Tube,Flask,Cork,pairing=chain  ->  action=connect,from=Tube,Flask,Cork,pairing=chain
- th-1222 [chain Spot, Mic and Lamp]: action=connect,from=Spot,Mic,Lamp,to=Spot,Mic,Lamp,pairing=chain  ->  action=connect,from=Spot,Mic,Lamp,pairing=chain
- th-1323 [chain Board, Prize and Card]: action=connect,from=Board,Prize,Card,to=Board,Prize,Card,pairing=chain  ->  action=connect,from=Board,Prize,Card,pairing=chain
- th-1420 [connect Kickoff, Design and Launch in order]: action=connect,from=Kickoff,Design,Launch,to=Kickoff,Design,Launch,pairing=chain  ->  action=connect,from=Kickoff,Design,Launch,pairing=chain
- th-1423 [chain Kickoff, Design, Beta and Launch]: action=connect,from=Kickoff,Design,Beta,Launch,to=Kickoff,Design,Beta,Launch,pairing=chain  ->  action=connect,from=Kickoff,Design,Beta,Launch,pairing=chain

### pairing all on a one-to-several or several-to-one connect -> pairing removed

Reason: LABEL_CONVENTIONS ("a key is written only when the text expresses it", one-to-several and several-to-one: no pairing); long data: 0 such wires with pairing, 297 several-to-one without. Count: 16.

- ts-0323 [attach Hen to all the stars]: action=connect,from=Hen,to=mention(quantifier=all,shape=star),pairing=all  ->  action=connect,from=Hen,to=mention(quantifier=all,shape=star)
- ts-0567 [connect Root to every triangle]: action=connect,from=Root,to=mention(quantifier=all,shape=triangle),pairing=all  ->  action=connect,from=Root,to=mention(quantifier=all,shape=triangle)
- ts-0667 [connect Hub to all the circles]: action=connect,from=Hub,to=mention(quantifier=all,shape=circle),pairing=all  ->  action=connect,from=Hub,to=mention(quantifier=all,shape=circle)
- ts-0784 [connect Main to every square]: action=connect,from=Main,to=mention(quantifier=all,shape=square),pairing=all  ->  action=connect,from=Main,to=mention(quantifier=all,shape=square)
- ts-0846 [link Boss to all the circles]: action=connect,from=Boss,to=mention(quantifier=all,shape=circle),pairing=all  ->  action=connect,from=Boss,to=mention(quantifier=all,shape=circle)
- ts-0938 [connect Gate to all the diamonds]: action=connect,from=Gate,to=mention(quantifier=all,shape=diamond),pairing=all  ->  action=connect,from=Gate,to=mention(quantifier=all,shape=diamond)
- ts-1048 [point Server at all the hexagons]: action=connect,from=Server,to=mention(quantifier=all,shape=hexagon),pairing=all  ->  action=connect,from=Server,to=mention(quantifier=all,shape=hexagon)
- ts-1148 [hook Hub up to all the stars]: action=connect,from=Hub,to=mention(quantifier=all,shape=star),pairing=all  ->  action=connect,from=Hub,to=mention(quantifier=all,shape=star)
- ts-1261 [connect Core to all the squares]: action=connect,from=Core,to=mention(quantifier=all,shape=square),pairing=all  ->  action=connect,from=Core,to=mention(quantifier=all,shape=square)
- ts-1387 [connect Source2 to all the triangles]: action=connect,from=Source2,to=mention(quantifier=all,shape=triangle),pairing=all  ->  action=connect,from=Source2,to=mention(quantifier=all,shape=triangle)
- ts-1490 [connect Boss2 to all the ellipses]: action=connect,from=Boss2,to=mention(quantifier=all,shape=ellipse),pairing=all  ->  action=connect,from=Boss2,to=mention(quantifier=all,shape=ellipse)
- th-0322 [Cto and Cfo both report to Ceo, draw all of those lines]: action=connect,from=Cto,Cfo,to=Ceo,pairing=all,arrow=none  ->  action=connect,from=Cto,Cfo,to=Ceo,arrow=none
- th-0919 [Keeper and Striker both link to Defender, every one of them]: action=connect,from=Keeper,Striker,to=Defender,pairing=all  ->  action=connect,from=Keeper,Striker,to=Defender
- th-1020 [connect Kitchen and Bath to Den, all of them]: action=connect,from=Kitchen,Bath,to=Den,pairing=all  ->  action=connect,from=Kitchen,Bath,to=Den
- th-1219 [run a line from Mic and Drum to Band, both of them]: action=connect,from=Mic,Drum,to=Band,pairing=all,arrow=none  ->  action=connect,from=Mic,Drum,to=Band,arrow=none
- th-1320 [link Pawn and Dice to Board, all of them]: action=connect,from=Pawn,Dice,to=Board,pairing=all  ->  action=connect,from=Pawn,Dice,to=Board

## Not decided (for the owner)

- Disjoint pairs in one connect: ts-0303 "connect Mon to the next one, Tue, then Wed to Thu", ts-0847 "connect A to B and C to D, pairwise", ts-1149, ts-1491 are written from="A,C", to="B,D", pairing next. The long data has no wire with both `to` and pairing, so there is no majority; left as written (4 wires).
- Many-to-many with pairing all: th-0426 "wire Hub and Ideas to each of Goals and Risks", th-0626 "connect Dad and Mom to Aunt and Uncle, all of them" (from two, to two, pairing all). Left as written (2 wires).
- ts-0535 "Lime1 is not purple" is check (notColor); the long data writes a statement "X is red" as fact, and fact has no notColor key. Left as written (1 wire; ts-0694, ts-1422 are tag questions, check is right).
- ts-0552 "no more rules for new shapes" is forget; could also be read as a rules question. Left as written.
- 25 rows name a second shape that is not in the row's `names` (e.g. ts-0029 "is Tree bigger than Leaf", names [Tree]): `names` is the shapes on the canvas and is copied unchanged; the gold uses the name from the text. Not changed.
- "I want / I'd like / I'd love / I need / we need" at the start: the long data splits (kept in the span 53, left out 44 of 97 sentence-initial cases, no 2/3 majority). In the short set they are KEPT in the span (see the Result section of SHORT.md); 20 rows.
