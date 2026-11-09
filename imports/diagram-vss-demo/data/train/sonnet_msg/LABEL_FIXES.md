# Label fixes (one line per change)

- sm-0004: self-correction not applied (separate set wire for a corrected colour): create yellow + set $new orange -> create orange, set wire removed
- sm-0025: "both under Travel" missing on Kyoto: create Kyoto (no position) -> position below, anchor Travel
- sm-0042: trigger/span: trigger "just" (no action word) -> span from "Delete ...", trigger "Delete"
- sm-0070: arrange row not expressed (text says left and right of the Cake): arrange Bride,Cake,Groom row -> move Bride leftOf Cake + move Groom rightOf Cake
- sm-0178: missing wire for the question "Does a rectangle named Detail exist?": added question check target Detail shape rectangle (before the count)
- sm-0194: missing wire: "a blue circle near Red1" had no create: added create circle blue near Red1
- sm-0205: self-correction not applied ("wrong color, make the Charger teal"): create purple + set $new teal -> create teal, set wire removed
- sm-0230: self-correction not applied ("make Characters small instead"): create large + set $new small -> create small, set wire removed
- sm-0248: self-correction ("actually everything should be two-way"): chain + extra connect Syn,SynAck both -> one chain with arrow both
- sm-0290: missing wires: "Connect Scope and Risks to Project, and label the Scope line core" had none: added connect Scope,Risks -> Project and connect Scope -> Project label core
- sm-0315: missing wire for the question "What shape is the Podium?": added question property Podium shape
- sm-0346: missing fact: "Red, Blue and Green are three circles" had no wire: added fact target Red,Blue,Green shape circle
- sm-0394: missing wires: "Colour each team its color, Reds red and so on" only set Reds: added set Blues blue, Greens green, Yellows yellow
- sm-0411: missing wire: "undo the last colour change, I want the Cake yellow" -> added set Cake color yellow after the undo
- sm-0496: arrange column not expressed ("Church top, Hall middle, Hotel bottom"): arrange Church,Hall,Hotel column -> move Church top, move Hall center, move Hotel bottom
- sm-0529: wrong reference: "Is the Tree green?" target mention(recency=oldest,shape=triangle) -> Tree (named shape)
- sm-0582: missing wires: "Start left, Finish right" had none: added move Start left, move Finish right
