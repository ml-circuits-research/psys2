# Label fixes for sonnet_msg2 (one block per change; id, wire before, wire after, reason / majority count)

Reviewer: label-review agent. Message texts, ids, names and domains are unchanged; no message was dropped (600 messages). Wires: 2774 before, 2789 after (78 changed, 28 added, 13 removed in the first pass; the unshared-spans pass below then rewrote the span of 273 wires, trigger of 131 of them).
Counts quoted as N/M come from the already-corrected data in sonnet_msg and haiku_msg (1200 messages). `->` separates before and after; `+` marks a second wire inserted right after the first; `||` marks two wires merged into one.
Process note: one recursive grep from the repository root printed a few lines of training/sketch/llm_bench/sonnet/LABEL_FIXES.md (a test-set file) by accident. Nothing from it was used. All later searches were restricted to non-bench paths.

## Changes

### loop split
- sm2-0056 [loop split]: command:connect from=Red,Green,Yellow,Red pairing=chain [Wire] «Wire Red to Green, Green to Yellow, Yellow to Red» -> command:connect from=Red,Green,Yellow pairing=chain [Wire] «Wire Red to Green, Green to Yellow»  +  command:connect from=Yellow to=Red [Yellow to] «Yellow to Red»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0133 [loop split]: command:connect from=Home,First,Second,Third,Home pairing=chain [tie] «tie Home to First, First to Second, Second to Third, and Third back to Home» -> command:connect from=Home,First,Second,Third pairing=chain [tie] «tie Home to First, First to Second, Second to Third»  +  command:connect from=Third to=Home [Third back to] «Third back to Home»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0252 [loop split]: command:connect from=Plan,Do,Check,Act,Plan pairing=chain [Tie] «Tie Plan to Do, Do to Check, Check to Act and Act back to Plan» -> command:connect from=Plan,Do,Check,Act pairing=chain [Tie] «Tie Plan to Do, Do to Check, Check to Act»  +  command:connect from=Act to=Plan [Act back to] «Act back to Plan»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0262 [loop split]: command:connect from=A,B,C,A pairing=chain [Draw] «Draw arrows from A to B, B to C and C to A» -> command:connect from=A,B,C pairing=chain [Draw] «Draw arrows from A to B, B to C»  +  command:connect from=C to=A [C to] «C to A»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0311 [loop split]: command:connect from=Q0,Q1,Q2,Q0 pairing=chain [goes to] «Q0 goes to Q1, Q1 goes to Q2, and Q2 goes to Q0» -> command:connect from=Q0,Q1,Q2 pairing=chain [goes to] «Q0 goes to Q1, Q1 goes to Q2»  +  command:connect from=Q2 to=Q0 [goes to] «Q2 goes to Q0»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0394 [loop split]: command:connect from=On,Off,On pairing=chain [goes to] «On goes to Off, Off goes to On» -> command:connect from=On to=Off [goes to] «On goes to Off»  +  command:connect from=Off to=On [goes to] «Off goes to On»  (reason: two-shape loop: a chain of two with a repeated name is a self-loop in logic.js; written as two connects)
- sm2-0445 [loop split]: command:connect from=Red,Green,Amber,Red pairing=chain [Wire] «Red to Green to Amber to Red. Wire it as a loop» -> command:connect from=Red,Green,Amber pairing=chain [Red to] «Red to Green to Amber»  +  command:connect from=Amber to=Red [Wire] «Amber to Red. Wire it as a loop»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0491 [loop split]: command:connect from=R1,R2,R3,R4,R1 pairing=chain [Connect] «Connect them as a chain and close the ring» -> command:connect from=R1,R2,R3,R4 pairing=chain [Connect] «Connect them as a chain»  +  command:connect from=R4 to=R1 [close] «close the ring»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing; repeated name not executable))
- sm2-0538 [loop split]: command:connect from=Idle,Go,Stop,Idle pairing=chain [Chain] «Idle to Go, Go to Stop, Stop to Idle. Chain it as a loop» -> command:connect from=Idle,Go,Stop pairing=chain [Idle to] «Idle to Go, Go to Stop»  +  command:connect from=Stop to=Idle [Chain] «Stop to Idle. Chain it as a loop»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0545 [loop split]: command:connect from=Sw1,Sw2,Sw3,Sw1 pairing=chain [connect] «Sw1 to Sw2, Sw2 to Sw3, Sw3 to Sw1: connect each to the next, and close it» -> command:connect from=Sw1,Sw2,Sw3 pairing=next [connect] «Sw1 to Sw2, Sw2 to Sw3, Sw3 to Sw1: connect each to the next»  +  command:connect from=Sw3 to=Sw1 [close] «close it»  (reason: "each to the next, and close it": next pairing, then the closing link as a separate connect (4/4 existing: sm-0140, sm-0322))
- sm2-0561 [loop split]: command:connect from=On,Off,On pairing=chain [goes to] «On goes to Off and Off goes back to On» -> command:connect from=On to=Off [goes to] «On goes to Off»  +  command:connect from=Off to=On [goes back to] «Off goes back to On»  (reason: two-shape loop written as two connects (chain with repeated name is not executable))
- sm2-0582 [loop split]: command:connect from=A,B,C,D,A pairing=chain [Wire] «A to B, B to C, C to D, D to A. Wire the loop» -> command:connect from=A,B,C,D pairing=chain [A to] «A to B, B to C, C to D»  +  command:connect from=D to=A [Wire] «D to A. Wire the loop»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))
- sm2-0593 [loop split]: command:connect from=Cloud,Rain,Sea,Cloud pairing=chain [Connect] «Cloud to Rain, Rain to Sea, Sea to Cloud. Connect them as a loop» -> command:connect from=Cloud,Rain,Sea pairing=chain [Cloud to] «Cloud to Rain, Rain to Sea»  +  command:connect from=Sea to=Cloud [Connect] «Sea to Cloud. Connect them as a loop»  (reason: closing link of a loop is a separate connect after the chain (4/4 existing: sm-0140, sm-0322, sm-0489, sm-0585; logic.js sorts and does not dedupe a repeated name, so a chain with a repeated name is a self-loop))

### rename follow-up
- sm2-0134 [rename follow-up]: question:connected target=Lb anchor=Web2 [connected] «whether Lb and Spare are directly connected» -> question:connected target=Lb anchor=Spare [connected] «whether Lb and Spare are directly connected»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0160 [rename follow-up]: question:connected target=Busy anchor=Idle [linked to] «Is Working linked to Idle» -> question:connected target=Working anchor=Idle [linked to] «Is Working linked to Idle»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0192 [rename follow-up]: command:move target=Sec position=leftOf anchor=Pres [Place] «Place Scribe left of Pres» -> command:move target=Scribe position=leftOf anchor=Pres [Place] «Place Scribe left of Pres»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0240 [rename follow-up]: command:move target=Cee direction=right distance=100 [nudge] «nudge it 100 pixels right» -> command:move target=Anchor direction=right distance=100 [nudge] «nudge it 100 pixels right»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0295 [rename follow-up]: question:neighbors target=Master [neighbours] «Give me the neighbours of Boss» -> question:neighbors target=Boss [neighbours] «Give me the neighbours of Boss»  (reason: follow-up after rename uses the name as written in the text (16/17 existing) (neighbours of Boss))
- sm2-0338 [rename follow-up]: question:check target=Wait position=between anchor=Go,Stop [between] «Is Slow in the middle? I mean between Go and Stop» -> question:check target=Slow position=between anchor=Go,Stop [between] «Is Slow in the middle? I mean between Go and Stop»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0372 [rename follow-up]: command:move target=Q position=leftOf anchor=R [Move] «Move Q to the left of Rho» -> command:move target=Q position=leftOf anchor=Rho [Move] «Move Q to the left of Rho»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0372 [rename follow-up]: question:connected target=Q anchor=R [linked to] «Is Q linked to Rho» -> question:connected target=Q anchor=Rho [linked to] «Is Q linked to Rho»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0478 [rename follow-up]: question:check target=Cam1 shape=circle [Is] «Is Door a circle» -> question:check target=Door shape=circle [Is] «Is Door a circle»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0521 [rename follow-up]: command:move target=Vp position=between anchor=Pres,Sec [Put] «Put Deputy between Pres and Sec» -> command:move target=Deputy position=between anchor=Pres,Sec [Put] «Put Deputy between Pres and Sec»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0521 [rename follow-up]: question:check target=Vp position=near anchor=Sec [near] «Is the Deputy near Sec» -> question:check target=Deputy position=near anchor=Sec [near] «Is the Deputy near Sec»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0550 [rename follow-up]: command:duplicate target=Clean [Clone] «Clone Tidy once» -> command:duplicate target=Tidy [Clone] «Clone Tidy once»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0550 [rename follow-up]: question:path from=Raw to=Clean [reachable] «Is Tidy reachable from Raw» -> question:path from=Raw to=Tidy [reachable] «Is Tidy reachable from Raw»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0550 [rename follow-up]: question:reachable from=Clean [reachable] «What's reachable from Tidy» -> question:reachable from=Tidy [reachable] «What's reachable from Tidy»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0564 [rename follow-up]: command:disconnect from=Load to=Report [Disconnect] «Disconnect Store from Report» -> command:disconnect from=Store to=Report [Disconnect] «Disconnect Store from Report»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0569 [rename follow-up]: question:check target=Hall position=between anchor=Door,Room [between] «Is the Hall between Door and Lab» -> question:check target=Hall position=between anchor=Door,Lab [between] «Is the Hall between Door and Lab»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))
- sm2-0596 [rename follow-up]: question:reachable from=Ctl [Reachable] «Reachable from Master» -> question:reachable from=Master [Reachable] «Reachable from Master»  (reason: follow-up after rename uses the name as written in the text (16/17 existing))

### copy mention
- sm2-0035 [copy mention]: command:arrange target=mention(quantifier=all) layout=grid [arrange] «arrange all the cards in a grid» -> command:arrange target=Card,mention(quantifier=all,recency=newest) layout=grid [arrange] «arrange all the cards in a grid»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new; the grid holds the Card and its copies)
- sm2-0086 [copy mention]: command:move target=$new position=rightOf anchor=Panel2 [put] «put the copy right of Panel2» -> command:move target=mention(recency=newest) position=rightOf anchor=Panel2 [put] «put the copy right of Panel2»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0258 [copy mention]: command:arrange target=Pod1,Pod2,Pod3,$new layout=row [arrange] «arrange them in a row» -> command:arrange target=Pod1,Pod2,Pod3,mention(recency=newest) layout=row [arrange] «arrange them in a row»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0348 [copy mention]: command:arrange target=Sensor,$new layout=column [Align] «Align the sensors in a column» -> command:arrange target=Sensor,mention(quantifier=all,recency=newest) layout=column [Align] «Align the sensors in a column»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0393 [copy mention]: command:arrange target=Basil,$new layout=row [Arrange] «Arrange all four basils in a row» -> command:arrange target=Basil,mention(quantifier=all,recency=newest) layout=row [Arrange] «Arrange all four basils in a row»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0422 [copy mention]: command:arrange target=Core,Sub,$new layout=circle [Arrange] «Arrange Core and the copies in a circle» -> command:arrange target=Core,Sub,mention(quantifier=all,recency=newest) layout=circle [Arrange] «Arrange Core and the copies in a circle»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0468 [copy mention]: command:set target=Gnome color=lime [Make] «Make the gnomes lime» -> command:set target=Gnome,mention(quantifier=all,recency=newest) color=lime [Make] «Make the gnomes lime»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0485 [copy mention]: command:delete target=$new [Zap] «Zap the new copy» -> command:delete target=mention(recency=newest) [Zap] «Zap the new copy»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0529 [copy mention]: command:align target=Wall,$new axis=horizontal [Align] «Align all the walls in a row on the horizontal» -> command:align target=Wall,mention(quantifier=all,recency=newest) axis=horizontal [Align] «Align all the walls in a row on the horizontal»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)
- sm2-0547 [copy mention]: command:arrange target=Panel,$new layout=grid [Put] «Put all the panels in a grid» -> command:arrange target=Panel,mention(quantifier=all,recency=newest) layout=grid [Put] «Put all the panels in a grid»  (reason: copies of a duplicate are labelled with mention(recency=newest) (20/20 existing), not $new)

### neighbors
- sm2-0027 [neighbors]: question:list position=near anchor=Heart [next to] «what is next to the Heart» -> question:neighbors target=Heart [next to] «what is next to the Heart»  (reason: "next to / who is linked to" -> neighbors (next to 7/7, linked-to 7/7 existing))
- sm2-0078 [neighbors]: question:list position=near anchor=Dad [next to] «Which shapes are next to Dad» -> question:neighbors target=Dad [next to] «Which shapes are next to Dad»  (reason: "next to / who is linked to" -> neighbors (next to 7/7, linked-to 7/7 existing))
- sm2-0149 [neighbors]: question:list position=near anchor=Rally [next to] «Show what is next to the Rally» -> question:neighbors target=Rally [next to] «Show what is next to the Rally»  (reason: "next to / who is linked to" -> neighbors (next to 7/7, linked-to 7/7 existing))
- sm2-0154 [neighbors]: question:list position=near anchor=Summer [next to] «Which shapes are next to Summer» -> question:neighbors target=Summer [next to] «Which shapes are next to Summer»  (reason: "next to / who is linked to" -> neighbors (next to 7/7, linked-to 7/7 existing))
- sm2-0201 [neighbors]: question:list position=near anchor=Wifi [next to] «what's next to the Wifi» -> question:neighbors target=Wifi [next to] «what's next to the Wifi»  (reason: "next to / who is linked to" -> neighbors (next to 7/7, linked-to 7/7 existing))

### restyle
- sm2-0040 [restyle]: command:connect from=Wifi to=Laptop color=teal [make] «make it teal» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire ("make it teal" colours the Wifi->Laptop link))
- sm2-0059 [restyle]: command:connect from=Parse to=Store style=dashed [Make] «Make the second link dashed» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire)
- sm2-0079 [restyle]: command:connect from=Svc to=Mq color=blue [Colour] «Colour the line from Svc to Mq blue» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire)
- sm2-0128 [restyle]: command:connect from=Main to=Sub1,Sub2 style=dashed [redo] «redo them as dashed» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire (undo of the plain lines, then re-create as dashed: undo+recreate class, see owner list))
- sm2-0178 [restyle]: command:connect from=Sw to=Ph arrow=both [Draw] «Draw the Ph connection with an arrow on both ends» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire)
- sm2-0218 [restyle]: command:connect from=Dmz to=Lan style=dashed [redraw] «redraw it dashed» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire ("redraw it dashed" on the existing Dmz->Lan link))
- sm2-0238 [restyle]: command:connect from=Tower to=Cloud arrow=both [two-way] «Make the lines two-way. Eh, you know what, just the one from Tower to Cloud» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire (two-way on the existing Tower->Cloud link))
- sm2-0342 [restyle]: command:connect from=Idle to=Run arrow=both [two-way] «Make the Idle to Run link two-way» -> (no wire)  (reason: restyle of an existing link: connect on an existing pair only notes "already exists" (logic.js connect run()), so the legend cannot express it -> no wire (two-way on the existing Idle->Run link))

### restyle folded
- sm2-0375 [restyle folded]: command:connect from=Main to=Backup style=dashed [link] «Main and Backup need a link, a dashed one»  ||  command:connect from=Main to=Backup arrow=both [Draw] «Draw it two-way» -> command:connect from=Main to=Backup style=dashed arrow=both [link] «Main and Backup need a link, a dashed one. Draw it two-way»  (reason: restyle of the link created one sentence earlier applies to the whole wire: folded into the create-connect (precedent sm-0389, sm-0234; only 2 cases, so on the owner list))
- sm2-0472 [restyle folded]: command:connect from=Pitcher to=Catcher [Draw] «Pitcher throws to Catcher. Draw an arrow»  ||  command:connect from=Pitcher to=Catcher arrow=both [make] «make it two-way» -> command:connect from=Pitcher to=Catcher arrow=both [Draw] «Pitcher throws to Catcher. Draw an arrow. Hmm, make it two-way»  (reason: self-correction "Draw an arrow. Hmm, make it two-way": final value arrow=both (LABEL_CONVENTIONS: self-corrections take the final value))

### taken back
- sm2-0090 [taken back]: command:resize target=Rug [enlarge] «enlarge it a lot» -> (no wire)  (reason: self-correction: "enlarge it a lot" is replaced by "Make the Rug huge, in fact"; the final value is the set wire)
- sm2-0533 [taken back]: command:connect from=Fetch to=Save style=dashed [Make] «Make it dashed» -> (no wire)  (reason: "Make it dashed. Hmm, undo." is a request taken back: no wire (and a restyle, see 0040))
- sm2-0533 [taken back]: command:undo  [undo] «undo» -> (no wire)  (reason: the undo takes back the dashed restyle (no wire for it); a stray undo would undo the connect instead)

### missing fact
- sm2-0068 [missing fact]: (no wire) -> fact:None target=Cell color=green size=large [is] «the Cell is big and green»  (reason: stated fact "the Cell is big and green" had no wire (big -> large 27/28 existing))
- sm2-0527 [missing fact]: (no wire) -> fact:None target=Mid size=large [is] «Mid is big»  (reason: stated fact "Mid is big" had no wire (big -> large 27/28 existing))

### missing question
- sm2-0150 [missing question]: (no wire) -> question:count notColor=red [how many] «how many are not red»  (reason: second question of the sentence had no wire (notColor is in the legend))

### missing rename
- sm2-0215 [missing rename]: (no wire) -> command:rename target=mention(recency=newest) name=Colleagues [call] «call the copy Colleagues»  (reason: "call the copy Colleagues" had no wire (rename of the copy, 3/3 pronoun/copy renames by new text name))
- sm2-0367 [missing rename]: (no wire) -> command:rename target=mention(recency=newest) name=Phase [call] «call the copy Phase»  (reason: "call the copy Phase" had no wire)

### missing command
- sm2-0225 [missing command]: (no wire) -> command:resize target=Left,Right [shrink] «shrink the others otherwise»  (reason: conditional request "shrink the others otherwise" had no wire (conditionals are wired))
- sm2-0279 [missing command]: (no wire) -> command:toFront target=Pitch [in front] «Put it in front, I mean Pitch if it is»  (reason: conditional request had no wire (conditionals are wired))
- sm2-0399 [missing command]: (no wire) -> command:disconnect from=Job3 to=Job1 [Axe] «Axe the loop link if there is a cycle»  (reason: conditional request had no wire (conditionals are wired))
- sm2-0399 [missing command]: (no wire) -> command:undo  [undo] «then undo the axe»  (reason: "then undo the axe" had no wire)
- sm2-0505 [missing command]: (no wire) -> command:undo  [undo] «undo if it looks silly»  (reason: conditional undo had no wire (precedent sm-0451))
- sm2-0560 [missing command]: (no wire) -> command:redo  [redo] «redo the label on Nav»  (reason: "just redo the label on Nav" had no wire (redo))

### added
- sm2-0253 [added]: command:move target=Hero direction=right distance=30 [Nudge] «Nudge the Hero 30 pixels right» -> command:move target=Hero direction=right distance=30 [Nudge] «Nudge the Hero 30 pixels right, then another 30»  +  command:move target=Hero direction=right distance=30 [Nudge] «Nudge the Hero 30 pixels right, then another 30»  (reason: "then another 30" is a second move of the same size; ellipsis in the same sentence -> same span and trigger)
- sm2-0433 [added]: question:extreme superlative=biggest [biggest] «Which are the biggest» -> question:extreme superlative=biggest [biggest] «Which are the biggest and the smallest»  +  question:extreme superlative=smallest [smallest] «Which are the biggest and the smallest»  (reason: "the smallest" is a second question in the same sentence (same span, own trigger))
- sm2-0469 [added]: (no wire) -> command:resize target=Worker [Resize] «Resize the Worker bigger, then a bit smaller»  +  command:resize target=Worker [Resize] «Resize the Worker bigger, then a bit smaller»  (reason: "Resize the Worker bigger, then a bit smaller": two resizes of the same target (resize has no direction key) had no wire)

### value
- sm2-0283 [value]: command:connect from=Disk,Snap to=Vm [Connect] «Disk attaches to Vm, and Snap is made from Disk. Connect those» -> command:connect from=Disk to=Vm,Snap [Connect] «Disk attaches to Vm, and Snap is made from Disk. Connect those»  (reason: "Snap is made from Disk" -> Disk->Snap; Disk->Vm; both start at Disk (one to several))
- sm2-0298 [value]: command:connect from=Ceo to=$new [Link] «Link the Ceo to both» -> command:connect from=Ceo to=$new,$new [Link] «Link the Ceo to both»  (reason: "to both" = the two created shapes, both are $new (scorable: refs of a create canonicalise to $new))
- sm2-0487 [value]: command:move target=Lead position=above anchor=A [Put] «Put Lead above all three» -> command:move target=Lead position=above anchor=A,B,C [Put] «Put Lead above all three»  (reason: anchor "all three" = A,B,C comma-joined in one key (LABEL_CONVENTIONS; existing list anchors sm-0044, sm-0280: only 2))

### span
- sm2-0084 [span]: command:move target=Egg,Toast position=near anchor=Plate [Tuck] «Tuck Egg and Toast on the Plate» -> command:move target=Egg,Toast position=near anchor=Plate [Tuck] «Tuck Egg and Toast on the Plate, I mean move them near the Plate»  (reason: span must cover the self-correction that gives position=near)
- sm2-0152 [span]: command:connect from=Start to=End style=dotted [wire] «wire Start straight to End» -> command:connect from=Start to=End style=dotted [wire] «wire Start straight to End. Make that line dotted»  (reason: span must contain the sentence that gives style=dotted (fold; owner list: only 2 existing folds))
- sm2-0160 [span]: command:connect from=Idle to=Busy arrow=both [two-way] «Make it just one two-way link then» -> command:connect from=Idle to=Busy arrow=both [Tie] «Tie Idle to Busy with an arrow, and Busy back to Idle. In other words, a two-way link. Make it just one two-way link then»  (reason: span must cover the request that carries the names; final value two-way)
- sm2-0195 [span]: command:connect from=Pg,Sg,Sf pairing=chain [Draw] «Draw it» -> command:connect from=Pg,Sg,Sf pairing=chain [Draw] «The pass goes from Pg to Sg to Sf. Draw it»  (reason: span must contain the names the chain is built from)
- sm2-0216 [span]: command:move target=Wc position=between anchor=Hall,Office [shove] «shove it there» -> command:move target=Wc position=between anchor=Hall,Office [shove] «The Wc should sit between Hall and Office, so shove it there»  (reason: span must contain the names (Wc, Hall, Office) that the pronoun move needs)
- sm2-0247 [span]: command:connect from=Yeast,Flour to=Dough style=dotted [flow into] «Yeast and Flour both flow into Dough» -> command:connect from=Yeast,Flour to=Dough style=dotted [flow into] «Yeast and Flour both flow into Dough. Draw them with dotted arrows»  (reason: span must contain the sentence that gives style=dotted (fold; owner list))
- sm2-0280 [span]: command:create shape=star color=red count=3 position=near anchor=Boss [make] «make it three red stars only» -> command:create shape=star color=red count=3 position=near anchor=Boss [Throw in] «Throw in two red stars and two blue stars near the Boss. Hmm, change that: make it three red stars only»  (reason: span must cover the whole self-correction chain (final value: three red stars only))
- sm2-0321 [span]: command:connect from=Player,Ball,Goal pairing=chain [Hook] «Hook those with arrows» -> command:connect from=Player,Ball,Goal pairing=chain [Hook] «Let the Player point at the Ball, and the Ball point at the Goal. Hook those with arrows»  (reason: span must contain the names the pronoun refers to)
- sm2-0379 [span]: command:connect from=Spawn,Chest,Boss pairing=chain [Draw] «Draw that path with arrows» -> command:connect from=Spawn,Chest,Boss pairing=chain [Draw] «From the Spawn you walk to the Chest and then to the Boss. Draw that path with arrows»  (reason: span must contain the names the chain is built from)

### span split
- sm2-0519 [span split]: command:move target=Hero position=left [Park] «Park Hero at the far left. Foe at the far right» -> command:move target=Hero position=left [Park] «Park Hero at the far left»  (reason: two sentences: the second has its own span, trigger = leading phrase (existing handling))
- sm2-0519 [span split]: command:move target=Foe position=right [Park] «Park Hero at the far left. Foe at the far right» -> command:move target=Foe position=right [Foe at] «Foe at the far right»  (reason: two sentences: the second has its own span, trigger = leading phrase (existing handling))

### trigger
- sm2-0034 [trigger]: command:connect from=Mom to=Me [to] «Then Mom to Me» -> command:connect from=Mom to=Me [Mom to] «Then Mom to Me»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))
- sm2-0040 [trigger]: command:connect from=Wifi to=Phone,Laptop [to] «then Wifi to Phone and Laptop» -> command:connect from=Wifi to=Phone,Laptop [Wifi to] «then Wifi to Phone and Laptop»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))
- sm2-0049 [trigger]: command:connect from=Soil to=Plant style=dotted [too] «Soil too, with a dotted line» -> command:connect from=Soil to=Plant style=dotted [Soil too] «Soil too, with a dotted line»  (reason: elided verb in a new sentence: trigger = leading phrase, not the weak word "too")
- sm2-0166 [trigger]: command:connect from=R4 to=R1 [to] «Then R4 back to R1» -> command:connect from=R4 to=R1 [R4 back to] «Then R4 back to R1»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))
- sm2-0477 [trigger]: command:connect from=Order,Pack,Ship pairing=chain [to] «Order to Pack to Ship» -> command:connect from=Order,Pack,Ship pairing=chain [Order to] «Order to Pack to Ship»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))
- sm2-0482 [trigger]: command:connect from=Oats,Milk to=$new arrow=none [to] «Oats and Milk to Pot, plain lines» -> command:connect from=Oats,Milk to=$new arrow=none [Oats and Milk to] «Oats and Milk to Pot, plain lines»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))
- sm2-0533 [trigger]: command:connect from=Fetch,$new,Save pairing=chain [to] «Fetch to Check to Save» -> command:connect from=Fetch,$new,Save pairing=chain [Fetch to] «Fetch to Check to Save»  (reason: verbless trigger: leading phrase (existing handling, e.g. "Carol to"))

## Unshared spans (coordinator decision after the first report)
Existing data (sonnet_msg + haiku_msg) labels verb ellipsis with a SEPARATE span per request and a trigger that is a word inside that request's own span; shared spans exist in 2 wires only (sm-0070, sm-0194). Every group of wires with an identical span in sonnet_msg2 (120 groups, 105 messages, 273 wires; the writer's, plus the ones from my first pass in 0092, 0099, 0111, 0253, 0320, 0433, 0469) was split into one span per request. A request with its own repeated verb always gets its own span. Texts are unchanged; wire order and count are unchanged (2789).
Trigger rule, counted on 390 existing elided-verb wires (second and later request of a sentence, same action as the previous wire, own clause without a verb):
- set / fact / create / label / rename / rule: trigger = the leading words of the own span (the name, or "another" / "a blue one" for a create): 136 of 137 (set 78/79, create 43/43, fact 10/10, label 3/3, rename 1/1, rule 1/1). Used here: the name ("Warn yellow" -> Warn, "the Star white" -> the Star), the noun phrase before called/named for a create.
- move: trigger = the position or direction phrase of the own span ("at the bottom", "left of", "under"), 180 of 205 (last word of the span 137, inside the span 43); the leading name only 25. Used here: the position phrase, or the direction word for "Review 50 px right".
- connect: 33 cases, 21 with the words inside the span such as "Core to", 12 leading ("Paris to", "Closed to Locked"). Used here: "Name to".
- extreme / nearest: the superlative word, 12 of 12 ("the smallest" -> smallest).
- A clause with its own verb keeps that verb as trigger ("is", "talks to", "goes"). The first request keeps its original trigger.
Special handling (listed because the split is not mechanical): sm2-0136 the last span keeps the correction ("Wed lime? Actually, Wed teal"); sm2-0229 and sm2-0500 the shared distance ("about 100 pixels each") stays in the span of the last request only; sm2-0405 the two connects now point at the statements "Web tier talks to Api" and "Api talks to Db and Cache" instead of "wire exactly that"; sm2-0253 "another 30" and sm2-0469 "a bit smaller", sm2-0433 "the smallest" are own spans.
Per wire (span before -> span after, with trigger):

- sm2-0017 [shared span reverted]: command:set [Recolour] «Recolour Food orange and Music purple» -> command:set [Recolour] «Recolour Food orange»
- sm2-0017 [shared span reverted]: command:set [Recolour] «Recolour Food orange and Music purple» -> command:set [Music] «Music purple»
- sm2-0043 [shared span reverted]: command:move [Nudge] «Nudge Backlog 50 px left and Review 50 px right» -> command:move [Nudge] «Nudge Backlog 50 px left»
- sm2-0043 [shared span reverted]: command:move [Nudge] «Nudge Backlog 50 px left and Review 50 px right» -> command:move [right] «Review 50 px right»
- sm2-0062 [shared span reverted]: command:move [Park] «Park Left at the left edge and Right at the right edge» -> command:move [Park] «Park Left at the left edge»
- sm2-0062 [shared span reverted]: command:move [Park] «Park Left at the left edge and Right at the right edge» -> command:move [Right] «Right at the right edge»
- sm2-0073 [shared span reverted]: command:set [make] «make Work huge and Home medium» -> command:set [make] «make Work huge»
- sm2-0073 [shared span reverted]: command:set [make] «make Work huge and Home medium» -> command:set [Home] «Home medium»
- sm2-0092 [shared span reverted]: command:move [Slide] «Slide Calm 30 px left, then Focus 30 px right» -> command:move [Slide] «Slide Calm 30 px left»
- sm2-0092 [shared span reverted]: command:move [Slide] «Slide Calm 30 px left, then Focus 30 px right» -> command:move [right] «Focus 30 px right»
- sm2-0099 [shared span reverted]: command:move [place] «place Icon left of Label and Label above Panel» -> command:move [place] «place Icon left of Label»
- sm2-0099 [shared span reverted]: command:move [place] «place Icon left of Label and Label above Panel» -> command:move [Label] «Label above Panel»
- sm2-0111 [shared span reverted]: command:connect [Arrows] «Arrows from Ingest and Clean to Train, then Train to Serve» -> command:connect [Arrows] «Arrows from Ingest and Clean to Train»
- sm2-0111 [shared span reverted]: command:connect [Arrows] «Arrows from Ingest and Clean to Train, then Train to Serve» -> command:connect [Train to] «Train to Serve»
- sm2-0118 [shared span reverted]: command:move [Nudge] «Nudge Lift 15 pixels up and the Stairs 15 pixels down» -> command:move [Nudge] «Nudge Lift 15 pixels up»
- sm2-0118 [shared span reverted]: command:move [Nudge] «Nudge Lift 15 pixels up and the Stairs 15 pixels down» -> command:move [down] «the Stairs 15 pixels down»
- sm2-0121 [shared span reverted]: command:set [paint] «paint Mars red and Venus orange» -> command:set [paint] «paint Mars red»
- sm2-0121 [shared span reverted]: command:set [paint] «paint Mars red and Venus orange» -> command:set [Venus] «Venus orange»
- sm2-0131 [shared span reverted]: command:move [Put] «Put Db at the bottom and Ui at the top» -> command:move [Put] «Put Db at the bottom»
- sm2-0131 [shared span reverted]: command:move [Put] «Put Db at the bottom and Ui at the top» -> command:move [at the top] «Ui at the top»
- sm2-0136 [shared span reverted]: command:set [Paint] «Paint Mon red, Tue gold and Wed lime? Actually, Wed teal» -> command:set [Paint] «Paint Mon red»
- sm2-0136 [shared span reverted]: command:set [Paint] «Paint Mon red, Tue gold and Wed lime? Actually, Wed teal» -> command:set [Tue] «Tue gold»
- sm2-0136 [shared span reverted]: command:set [Paint] «Paint Mon red, Tue gold and Wed lime? Actually, Wed teal» -> command:set [Wed] «Wed lime? Actually, Wed teal»
- sm2-0143 [shared span reverted]: command:move [Put] «Put Troll above the Lair, and Kobold left of the Lair» -> command:move [Put] «Put Troll above the Lair»
- sm2-0143 [shared span reverted]: command:move [Put] «Put Troll above the Lair, and Kobold left of the Lair» -> command:move [left of] «Kobold left of the Lair»
- sm2-0150 [shared span reverted]: command:set [Tint] «Tint Ok green, Warn yellow, Err red» -> command:set [Tint] «Tint Ok green»
- sm2-0150 [shared span reverted]: command:set [Tint] «Tint Ok green, Warn yellow, Err red» -> command:set [Warn] «Warn yellow»
- sm2-0150 [shared span reverted]: command:set [Tint] «Tint Ok green, Warn yellow, Err red» -> command:set [Err] «Err red»
- sm2-0162 [shared span reverted]: command:create [Spawn] «Spawn a gray ellipse called Bronze left of Gold and a lime ellipse called Silver between them» -> command:create [Spawn] «Spawn a gray ellipse called Bronze left of Gold»
- sm2-0162 [shared span reverted]: command:create [Spawn] «Spawn a gray ellipse called Bronze left of Gold and a lime ellipse called Silver between them» -> command:create [a lime ellipse] «a lime ellipse called Silver between them»
- sm2-0167 [shared span reverted]: command:move [Slide] «Slide Room1 to the left of Hall and Room2 to the right of Hall» -> command:move [Slide] «Slide Room1 to the left of Hall»
- sm2-0167 [shared span reverted]: command:move [Slide] «Slide Room1 to the left of Hall and Room2 to the right of Hall» -> command:move [to the right of] «Room2 to the right of Hall»
- sm2-0168 [shared span reverted]: command:create [Plant] «Plant a small green star next to Pro and a small red star next to Con» -> command:create [Plant] «Plant a small green star next to Pro»
- sm2-0168 [shared span reverted]: command:create [Plant] «Plant a small green star next to Pro and a small red star next to Con» -> command:create [a small red star next to Con] «a small red star next to Con»
- sm2-0170 [shared span reverted]: command:label [Label] «Label Circle with Round, Square with Four, and Triangle with Three» -> command:label [Label] «Label Circle with Round»
- sm2-0170 [shared span reverted]: command:label [Label] «Label Circle with Round, Square with Four, and Triangle with Three» -> command:label [Square] «Square with Four»
- sm2-0170 [shared span reverted]: command:label [Label] «Label Circle with Round, Square with Four, and Triangle with Three» -> command:label [Triangle] «Triangle with Three»
- sm2-0182 [shared span reverted]: command:move [Place] «Place Todo above Wip, and Wip above Done» -> command:move [Place] «Place Todo above Wip»
- sm2-0182 [shared span reverted]: command:move [Place] «Place Todo above Wip, and Wip above Done» -> command:move [above] «Wip above Done»
- sm2-0203 [shared span reverted]: command:set [Colour] «Colour Rock red, Jazz blue and Pop pink» -> command:set [Colour] «Colour Rock red»
- sm2-0203 [shared span reverted]: command:set [Colour] «Colour Rock red, Jazz blue and Pop pink» -> command:set [Jazz] «Jazz blue»
- sm2-0203 [shared span reverted]: command:set [Colour] «Colour Rock red, Jazz blue and Pop pink» -> command:set [Pop] «Pop pink»
- sm2-0204 [shared span reverted]: command:connect [Wire] «Wire Web to Api, then Api to Cache and Api to Db» -> command:connect [Wire] «Wire Web to Api»
- sm2-0204 [shared span reverted]: command:connect [Wire] «Wire Web to Api, then Api to Cache and Api to Db» -> command:connect [Api to] «Api to Cache and Api to Db»
- sm2-0213 [shared span reverted]: command:swap [swap] «swap A with D and B with C» -> command:swap [swap] «swap A with D»
- sm2-0213 [shared span reverted]: command:swap [swap] «swap A with D and B with C» -> command:swap [B with] «B with C»
- sm2-0225 [shared span reverted]: command:set [Make] «Make Mid huge and Left and Right small» -> command:set [Make] «Make Mid huge»
- sm2-0225 [shared span reverted]: command:set [Make] «Make Mid huge and Left and Right small» -> command:set [Left] «Left and Right small»
- sm2-0228 [shared span reverted]: command:connect [Connect] «Connect Sw1 to Sw3 and Sw4, and Sw2 to Sw3 and Sw4 as well» -> command:connect [Connect] «Connect Sw1 to Sw3 and Sw4»
- sm2-0228 [shared span reverted]: command:connect [Connect] «Connect Sw1 to Sw3 and Sw4, and Sw2 to Sw3 and Sw4 as well» -> command:connect [Sw2 to] «Sw2 to Sw3 and Sw4 as well»
- sm2-0229 [shared span reverted]: command:move [Slide] «Slide Day to the left and Night to the right, about 100 pixels each» -> command:move [Slide] «Slide Day to the left»
- sm2-0229 [shared span reverted]: command:move [Slide] «Slide Day to the left and Night to the right, about 100 pixels each» -> command:move [to the right] «Night to the right, about 100 pixels each»
- sm2-0235 [shared span reverted]: command:move [Put] «Put the Deck next to the Pool and the Bar next to the Deck» -> command:move [Put] «Put the Deck next to the Pool»
- sm2-0235 [shared span reverted]: command:move [Put] «Put the Deck next to the Pool and the Bar next to the Deck» -> command:move [next to] «the Bar next to the Deck»
- sm2-0245 [shared span reverted]: command:move [Put] «Put P1 left of the Flag and P2 right of the Flag» -> command:move [Put] «Put P1 left of the Flag»
- sm2-0245 [shared span reverted]: command:move [Put] «Put P1 left of the Flag and P2 right of the Flag» -> command:move [right of] «P2 right of the Flag»
- sm2-0249 [shared span reverted]: command:set [Colour] «Colour Spring lime, Summer yellow, Autumn orange and Winter cyan» -> command:set [Colour] «Colour Spring lime»
- sm2-0249 [shared span reverted]: command:set [Colour] «Colour Spring lime, Summer yellow, Autumn orange and Winter cyan» -> command:set [Summer] «Summer yellow»
- sm2-0249 [shared span reverted]: command:set [Colour] «Colour Spring lime, Summer yellow, Autumn orange and Winter cyan» -> command:set [Autumn] «Autumn orange»
- sm2-0249 [shared span reverted]: command:set [Colour] «Colour Spring lime, Summer yellow, Autumn orange and Winter cyan» -> command:set [Winter] «Winter cyan»
- sm2-0253 [shared span reverted]: command:move [Nudge] «Nudge the Hero 30 pixels right, then another 30» -> command:move [Nudge] «Nudge the Hero 30 pixels right»
- sm2-0253 [shared span reverted]: command:move [Nudge] «Nudge the Hero 30 pixels right, then another 30» -> command:move [another] «another 30»
- sm2-0263 [shared span reverted]: command:move [Shove] «Shove Todo to the far left, Done to the far right, and Doing to the center» -> command:move [Shove] «Shove Todo to the far left»
- sm2-0263 [shared span reverted]: command:move [Shove] «Shove Todo to the far left, Done to the far right, and Doing to the center» -> command:move [to the far right] «Done to the far right»
- sm2-0263 [shared span reverted]: command:move [Shove] «Shove Todo to the far left, Done to the far right, and Doing to the center» -> command:move [center] «Doing to the center»
- sm2-0269 [shared span reverted]: command:set [Make] «Make Lava red and Ice cyan, and Grass green» -> command:set [Make] «Make Lava red»
- sm2-0269 [shared span reverted]: command:set [Make] «Make Lava red and Ice cyan, and Grass green» -> command:set [Ice] «Ice cyan»
- sm2-0269 [shared span reverted]: command:set [Make] «Make Lava red and Ice cyan, and Grass green» -> command:set [Grass] «Grass green»
- sm2-0269 [shared span reverted]: command:move [Slide] «Slide Ice below Lava and Grass below Ice» -> command:move [Slide] «Slide Ice below Lava»
- sm2-0269 [shared span reverted]: command:move [Slide] «Slide Ice below Lava and Grass below Ice» -> command:move [below] «Grass below Ice»
- sm2-0270 [shared span reverted]: command:set [Make] «Make Tiger huge and Moss tiny» -> command:set [Make] «Make Tiger huge»
- sm2-0270 [shared span reverted]: command:set [Make] «Make Tiger huge and Moss tiny» -> command:set [Moss] «Moss tiny»
- sm2-0276 [shared span reverted]: command:set [Tint] «Tint Egg yellow and Milk white» -> command:set [Tint] «Tint Egg yellow»
- sm2-0276 [shared span reverted]: command:set [Tint] «Tint Egg yellow and Milk white» -> command:set [Milk] «Milk white»
- sm2-0281 [shared span reverted]: fact:None [is] «Noun is a circle and Verb is a square» -> fact:None [is] «Noun is a circle»
- sm2-0281 [shared span reverted]: fact:None [is] «Noun is a circle and Verb is a square» -> fact:None [is] «Verb is a square»
- sm2-0284 [shared span reverted]: command:set [Paint] «Paint Home green, Away red, Draw gray» -> command:set [Paint] «Paint Home green»
- sm2-0284 [shared span reverted]: command:set [Paint] «Paint Home green, Away red, Draw gray» -> command:set [Away] «Away red»
- sm2-0284 [shared span reverted]: command:set [Paint] «Paint Home green, Away red, Draw gray» -> command:set [Draw] «Draw gray»
- sm2-0286 [shared span reverted]: command:set [Colour] «Colour X red and Y blue» -> command:set [Colour] «Colour X red»
- sm2-0286 [shared span reverted]: command:set [Colour] «Colour X red and Y blue» -> command:set [Y] «Y blue»
- sm2-0296 [shared span reverted]: command:set [Make] «Make the Moon gray and the Star white» -> command:set [Make] «Make the Moon gray»
- sm2-0296 [shared span reverted]: command:set [Make] «Make the Moon gray and the Star white» -> command:set [the Star] «the Star white»
- sm2-0298 [shared span reverted]: command:create [Create] «Create a magenta circle labelled Cmo above the Ceo, and a teal one labelled Coo below the Ceo» -> command:create [Create] «Create a magenta circle labelled Cmo above the Ceo»
- sm2-0298 [shared span reverted]: command:create [Create] «Create a magenta circle labelled Cmo above the Ceo, and a teal one labelled Coo below the Ceo» -> command:create [a teal one] «a teal one labelled Coo below the Ceo»
- sm2-0309 [shared span reverted]: command:set [Tint] «Tint Aunt pink, Mother purple» -> command:set [Tint] «Tint Aunt pink»
- sm2-0309 [shared span reverted]: command:set [Tint] «Tint Aunt pink, Mother purple» -> command:set [Mother] «Mother purple»
- sm2-0315 [shared span reverted]: fact:None [is] «Hero is blue and Villain is red» -> fact:None [is] «Hero is blue»
- sm2-0315 [shared span reverted]: fact:None [is] «Hero is blue and Villain is red» -> fact:None [is] «Villain is red»
- sm2-0315 [shared span reverted]: command:move [Move] «Move the Hero to the left of Villain, and the Sidekick below the Hero» -> command:move [Move] «Move the Hero to the left of Villain»
- sm2-0315 [shared span reverted]: command:move [Move] «Move the Hero to the left of Villain, and the Sidekick below the Hero» -> command:move [below] «the Sidekick below the Hero»
- sm2-0316 [shared span reverted]: command:set [Make] «Make the Hall huge and the rooms small» -> command:set [Make] «Make the Hall huge»
- sm2-0316 [shared span reverted]: command:set [Make] «Make the Hall huge and the rooms small» -> command:set [the rooms] «the rooms small»
- sm2-0318 [shared span reverted]: command:move [Park] «Park Left at the far left and Right at the far right, Center in the middle» -> command:move [Park] «Park Left at the far left»
- sm2-0318 [shared span reverted]: command:move [Park] «Park Left at the far left and Right at the far right, Center in the middle» -> command:move [Right] «Right at the far right»
- sm2-0318 [shared span reverted]: command:move [Park] «Park Left at the far left and Right at the far right, Center in the middle» -> command:move [Center] «Center in the middle»
- sm2-0320 [shared span reverted]: command:move [Sort out] «Sort out the layers: App on top, Db at the bottom» -> command:move [Sort out] «Sort out the layers: App on top»
- sm2-0320 [shared span reverted]: command:move [Sort out] «Sort out the layers: App on top, Db at the bottom» -> command:move [at the bottom] «Db at the bottom»
- sm2-0320 [shared span reverted]: command:move [goes] «Cache goes between them, Queue to the right of App» -> command:move [goes] «Cache goes between them»
- sm2-0320 [shared span reverted]: command:move [goes] «Cache goes between them, Queue to the right of App» -> command:move [to the right of] «Queue to the right of App»
- sm2-0322 [shared span reverted]: command:create [Throw in] «Throw in a diamond named Choose between them, and a circle named Retry above End» -> command:create [Throw in] «Throw in a diamond named Choose between them»
- sm2-0322 [shared span reverted]: command:create [Throw in] «Throw in a diamond named Choose between them, and a circle named Retry above End» -> command:create [a circle] «a circle named Retry above End»
- sm2-0324 [shared span reverted]: command:rename [Rename] «Rename Page1 to Home, Page2 to About» -> command:rename [Rename] «Rename Page1 to Home»
- sm2-0324 [shared span reverted]: command:rename [Rename] «Rename Page1 to Home, Page2 to About» -> command:rename [Page2] «Page2 to About»
- sm2-0326 [shared span reverted]: command:create [Create] «Create a green circle named Rae near Pip and a lime one named Sol near Quin» -> command:create [Create] «Create a green circle named Rae near Pip»
- sm2-0326 [shared span reverted]: command:create [Create] «Create a green circle named Rae near Pip and a lime one named Sol near Quin» -> command:create [a lime one] «a lime one named Sol near Quin»
- sm2-0326 [shared span reverted]: command:connect [Link] «Link Pip to Rae and Quin to Sol» -> command:connect [Link] «Link Pip to Rae»
- sm2-0326 [shared span reverted]: command:connect [Link] «Link Pip to Rae and Quin to Sol» -> command:connect [Quin to] «Quin to Sol»
- sm2-0328 [shared span reverted]: command:set [Set] «Set the Toast to large, and Jam to small» -> command:set [Set] «Set the Toast to large»
- sm2-0328 [shared span reverted]: command:set [Set] «Set the Toast to large, and Jam to small» -> command:set [Jam] «Jam to small»
- sm2-0329 [shared span reverted]: command:move [Put] «Put Idea in the center, Risk above it and Cost below it» -> command:move [Put] «Put Idea in the center»
- sm2-0329 [shared span reverted]: command:move [Put] «Put Idea in the center, Risk above it and Cost below it» -> command:move [above] «Risk above it»
- sm2-0329 [shared span reverted]: command:move [Put] «Put Idea in the center, Risk above it and Cost below it» -> command:move [below] «Cost below it»
- sm2-0332 [shared span reverted]: command:move [Put] «Put the Bat left of the Ball and the Glove right of the Ball» -> command:move [Put] «Put the Bat left of the Ball»
- sm2-0332 [shared span reverted]: command:move [Put] «Put the Bat left of the Ball and the Glove right of the Ball» -> command:move [right of] «the Glove right of the Ball»
- sm2-0334 [shared span reverted]: command:set [Make] «Make Dog huge, Cat large and Fish small» -> command:set [Make] «Make Dog huge»
- sm2-0334 [shared span reverted]: command:set [Make] «Make Dog huge, Cat large and Fish small» -> command:set [Cat] «Cat large»
- sm2-0334 [shared span reverted]: command:set [Make] «Make Dog huge, Cat large and Fish small» -> command:set [Fish] «Fish small»
- sm2-0334 [shared span reverted]: command:label [Label] «Label Dog with 12 votes, Cat with 9 votes, and Fish with 3 votes» -> command:label [Label] «Label Dog with 12 votes»
- sm2-0334 [shared span reverted]: command:label [Label] «Label Dog with 12 votes, Cat with 9 votes, and Fish with 3 votes» -> command:label [Cat] «Cat with 9 votes»
- sm2-0334 [shared span reverted]: command:label [Label] «Label Dog with 12 votes, Cat with 9 votes, and Fish with 3 votes» -> command:label [Fish] «Fish with 3 votes»
- sm2-0336 [shared span reverted]: command:set [Top] «Top red, Mid green, Bot blue» -> command:set [Top] «Top red»
- sm2-0336 [shared span reverted]: command:set [Top] «Top red, Mid green, Bot blue» -> command:set [Mid] «Mid green»
- sm2-0336 [shared span reverted]: command:set [Top] «Top red, Mid green, Bot blue» -> command:set [Bot] «Bot blue»
- sm2-0338 [shared span reverted]: command:move [Slide] «Slide Go to the left of Wait, and Stop to the right of Wait» -> command:move [Slide] «Slide Go to the left of Wait»
- sm2-0338 [shared span reverted]: command:move [Slide] «Slide Go to the left of Wait, and Stop to the right of Wait» -> command:move [to the right of] «Stop to the right of Wait»
- sm2-0340 [shared span reverted]: command:move [Put] «Put Now above Next and Next above Later» -> command:move [Put] «Put Now above Next»
- sm2-0340 [shared span reverted]: command:move [Put] «Put Now above Next and Next above Later» -> command:move [above] «Next above Later»
- sm2-0341 [shared span reverted]: command:move [goes] «Spoon goes next to the Soup, Bread goes right of the Soup» -> command:move [goes] «Spoon goes next to the Soup»
- sm2-0341 [shared span reverted]: command:move [goes] «Spoon goes next to the Soup, Bread goes right of the Soup» -> command:move [goes] «Bread goes right of the Soup»
- sm2-0343 [shared span reverted]: command:set [Make] «Make Area a triangle and Angle a circle» -> command:set [Make] «Make Area a triangle»
- sm2-0343 [shared span reverted]: command:set [Make] «Make Area a triangle and Angle a circle» -> command:set [Angle] «Angle a circle»
- sm2-0349 [shared span reverted]: fact:None [is] «Open is a circle, Mid is a diamond, and Close is a star» -> fact:None [is] «Open is a circle»
- sm2-0349 [shared span reverted]: fact:None [is] «Open is a circle, Mid is a diamond, and Close is a star» -> fact:None [is] «Mid is a diamond»
- sm2-0349 [shared span reverted]: fact:None [is] «Open is a circle, Mid is a diamond, and Close is a star» -> fact:None [is] «Close is a star»
- sm2-0353 [shared span reverted]: fact:None [is] «Joy is yellow, Fear is purple, and Anger is red» -> fact:None [is] «Joy is yellow»
- sm2-0353 [shared span reverted]: fact:None [is] «Joy is yellow, Fear is purple, and Anger is red» -> fact:None [is] «Fear is purple»
- sm2-0353 [shared span reverted]: fact:None [is] «Joy is yellow, Fear is purple, and Anger is red» -> fact:None [is] «Anger is red»
- sm2-0362 [shared span reverted]: command:set [Colour] «Colour Sky cyan, Sea blue, and Land brown» -> command:set [Colour] «Colour Sky cyan»
- sm2-0362 [shared span reverted]: command:set [Colour] «Colour Sky cyan, Sea blue, and Land brown» -> command:set [Sea] «Sea blue»
- sm2-0362 [shared span reverted]: command:set [Colour] «Colour Sky cyan, Sea blue, and Land brown» -> command:set [Land] «Land brown»
- sm2-0362 [shared span reverted]: command:move [Put] «Put Sky above Sea and Sea above Land» -> command:move [Put] «Put Sky above Sea»
- sm2-0362 [shared span reverted]: command:move [Put] «Put Sky above Sea and Sea above Land» -> command:move [above] «Sea above Land»
- sm2-0364 [shared span reverted]: command:move [Put] «Put Rice in the center and Nori above it» -> command:move [Put] «Put Rice in the center»
- sm2-0364 [shared span reverted]: command:move [Put] «Put Rice in the center and Nori above it» -> command:move [above] «Nori above it»
- sm2-0366 [shared span reverted]: command:move [Put] «Put the Key left of the Gate and the Troll right of the Gate» -> command:move [Put] «Put the Key left of the Gate»
- sm2-0366 [shared span reverted]: command:move [Put] «Put the Key left of the Gate and the Troll right of the Gate» -> command:move [right of] «the Troll right of the Gate»
- sm2-0377 [shared span reverted]: command:move [Place] «Place Title at the top, Body at the center and Foot at the bottom» -> command:move [Place] «Place Title at the top»
- sm2-0377 [shared span reverted]: command:move [Place] «Place Title at the top, Body at the center and Foot at the bottom» -> command:move [center] «Body at the center»
- sm2-0377 [shared span reverted]: command:move [Place] «Place Title at the top, Body at the center and Foot at the bottom» -> command:move [at the bottom] «Foot at the bottom»
- sm2-0382 [shared span reverted]: command:move [Park] «Park Volume at the far right and Tone in the center» -> command:move [Park] «Park Volume at the far right»
- sm2-0382 [shared span reverted]: command:move [Park] «Park Volume at the far right and Tone in the center» -> command:move [in the center] «Tone in the center»
- sm2-0382 [shared span reverted]: command:set [Colour] «Colour them all different: Pitch red, Tone yellow, Volume blue» -> command:set [Colour] «Colour them all different: Pitch red»
- sm2-0382 [shared span reverted]: command:set [Colour] «Colour them all different: Pitch red, Tone yellow, Volume blue» -> command:set [Tone] «Tone yellow»
- sm2-0382 [shared span reverted]: command:set [Colour] «Colour them all different: Pitch red, Tone yellow, Volume blue» -> command:set [Volume] «Volume blue»
- sm2-0383 [shared span reverted]: command:create [Throw in] «Throw in a gray circle named Check below Do, and another gray one named Act below Check» -> command:create [Throw in] «Throw in a gray circle named Check below Do»
- sm2-0383 [shared span reverted]: command:create [Throw in] «Throw in a gray circle named Check below Do, and another gray one named Act below Check» -> command:create [another gray one] «another gray one named Act below Check»
- sm2-0387 [shared span reverted]: command:set [Make] «Make the Maybe a diamond, and Q a star» -> command:set [Make] «Make the Maybe a diamond»
- sm2-0387 [shared span reverted]: command:set [Make] «Make the Maybe a diamond, and Q a star» -> command:set [Q] «Q a star»
- sm2-0398 [shared span reverted]: command:set [Make] «Make A and B red; C and D blue» -> command:set [Make] «Make A and B red»
- sm2-0398 [shared span reverted]: command:set [Make] «Make A and B red; C and D blue» -> command:set [C] «C and D blue»
- sm2-0400 [shared span reverted]: command:move [Park] «Park Fwd at the top and Gk at the bottom» -> command:move [Park] «Park Fwd at the top»
- sm2-0400 [shared span reverted]: command:move [Park] «Park Fwd at the top and Gk at the bottom» -> command:move [at the bottom] «Gk at the bottom»
- sm2-0404 [shared span reverted]: command:set [Make] «Make Lake huge, Pond medium and Puddle tiny» -> command:set [Make] «Make Lake huge»
- sm2-0404 [shared span reverted]: command:set [Make] «Make Lake huge, Pond medium and Puddle tiny» -> command:set [Pond] «Pond medium»
- sm2-0404 [shared span reverted]: command:set [Make] «Make Lake huge, Pond medium and Puddle tiny» -> command:set [Puddle] «Puddle tiny»
- sm2-0405 [shared span reverted]: command:connect [wire] «wire exactly that» -> command:connect [talks to] «Web tier talks to Api»
- sm2-0405 [shared span reverted]: command:connect [wire] «wire exactly that» -> command:connect [talks to] «Api talks to Db and Cache»
- sm2-0408 [shared span reverted]: command:move [Slide] «Slide the Nav to the top and the Grid to the bottom» -> command:move [Slide] «Slide the Nav to the top»
- sm2-0408 [shared span reverted]: command:move [Slide] «Slide the Nav to the top and the Grid to the bottom» -> command:move [to the bottom] «the Grid to the bottom»
- sm2-0413 [shared span reverted]: command:label [Label] «Label One with I, Two with II, and Three with III» -> command:label [Label] «Label One with I»
- sm2-0413 [shared span reverted]: command:label [Label] «Label One with I, Two with II, and Three with III» -> command:label [Two] «Two with II»
- sm2-0413 [shared span reverted]: command:label [Label] «Label One with I, Two with II, and Three with III» -> command:label [Three] «Three with III»
- sm2-0418 [shared span reverted]: command:move [Throw] «Throw Ask on top, Yes and No under it» -> command:move [Throw] «Throw Ask on top»
- sm2-0418 [shared span reverted]: command:move [Throw] «Throw Ask on top, Yes and No under it» -> command:move [under] «Yes and No under it»
- sm2-0418 [shared span reverted]: command:set [should be] «Yes should be green and No red» -> command:set [should be] «Yes should be green»
- sm2-0418 [shared span reverted]: command:set [should be] «Yes should be green and No red» -> command:set [No] «No red»
- sm2-0419 [shared span reverted]: command:set [Make] «Make Lb a hexagon and Web a circle» -> command:set [Make] «Make Lb a hexagon»
- sm2-0419 [shared span reverted]: command:set [Make] «Make Lb a hexagon and Web a circle» -> command:set [Web] «Web a circle»
- sm2-0420 [shared span reverted]: command:move [Place] «Place Heart left of Lung and Liver below Lung» -> command:move [Place] «Place Heart left of Lung»
- sm2-0420 [shared span reverted]: command:move [Place] «Place Heart left of Lung and Liver below Lung» -> command:move [below] «Liver below Lung»
- sm2-0420 [shared span reverted]: command:set [Colour] «Colour Heart red and Liver brown» -> command:set [Colour] «Colour Heart red»
- sm2-0420 [shared span reverted]: command:set [Colour] «Colour Heart red and Liver brown» -> command:set [Liver] «Liver brown»
- sm2-0427 [shared span reverted]: command:move [on top] «Header on top, Footer at the bottom» -> command:move [on top] «Header on top»
- sm2-0427 [shared span reverted]: command:move [on top] «Header on top, Footer at the bottom» -> command:move [at the bottom] «Footer at the bottom»
- sm2-0430 [shared span reverted]: fact:None [is] «Svc is a circle and Db is a square» -> fact:None [is] «Svc is a circle»
- sm2-0430 [shared span reverted]: fact:None [is] «Svc is a circle and Db is a square» -> fact:None [is] «Db is a square»
- sm2-0433 [shared span reverted]: fact:None [is] «Congo is large, Niger is medium» -> fact:None [is] «Congo is large»
- sm2-0433 [shared span reverted]: fact:None [is] «Congo is large, Niger is medium» -> fact:None [is] «Niger is medium»
- sm2-0433 [shared span reverted]: command:move [Move] «Move Nile to the top, Congo center, Niger bottom» -> command:move [Move] «Move Nile to the top»
- sm2-0433 [shared span reverted]: command:move [Move] «Move Nile to the top, Congo center, Niger bottom» -> command:move [center] «Congo center»
- sm2-0433 [shared span reverted]: command:move [Move] «Move Nile to the top, Congo center, Niger bottom» -> command:move [bottom] «Niger bottom»
- sm2-0433 [shared span reverted]: question:extreme [biggest] «Which are the biggest and the smallest» -> question:extreme [biggest] «Which are the biggest»
- sm2-0433 [shared span reverted]: question:extreme [smallest] «Which are the biggest and the smallest» -> question:extreme [smallest] «the smallest»
- sm2-0437 [shared span reverted]: command:set [Tint] «Tint Ace green and Fault red» -> command:set [Tint] «Tint Ace green»
- sm2-0437 [shared span reverted]: command:set [Tint] «Tint Ace green and Fault red» -> command:set [Fault] «Fault red»
- sm2-0437 [shared span reverted]: command:toBack [to the back] «Throw Fault to the back and Ace to the front» -> command:toBack [to the back] «Throw Fault to the back»
- sm2-0437 [shared span reverted]: command:toFront [to the front] «Throw Fault to the back and Ace to the front» -> command:toFront [to the front] «Ace to the front»
- sm2-0439 [shared span reverted]: fact:None [is] «Act1 is red, Act2 is orange, Act3 is yellow» -> fact:None [is] «Act1 is red»
- sm2-0439 [shared span reverted]: fact:None [is] «Act1 is red, Act2 is orange, Act3 is yellow» -> fact:None [is] «Act2 is orange»
- sm2-0439 [shared span reverted]: fact:None [is] «Act1 is red, Act2 is orange, Act3 is yellow» -> fact:None [is] «Act3 is yellow»
- sm2-0440 [shared span reverted]: command:move [Put] «Put Cl1 left of Srv and Cl2 right of Srv» -> command:move [Put] «Put Cl1 left of Srv»
- sm2-0440 [shared span reverted]: command:move [Put] «Put Cl1 left of Srv and Cl2 right of Srv» -> command:move [right of] «Cl2 right of Srv»
- sm2-0442 [shared span reverted]: command:move [Put] «Put Left to the left of Hub and Right to the right of Hub» -> command:move [Put] «Put Left to the left of Hub»
- sm2-0442 [shared span reverted]: command:move [Put] «Put Left to the left of Hub and Right to the right of Hub» -> command:move [to the right of] «Right to the right of Hub»
- sm2-0445 [shared span reverted]: command:set [Colour] «Colour each state with its own colour: Red red, Green green, Amber orange» -> command:set [Colour] «Colour each state with its own colour: Red red»
- sm2-0445 [shared span reverted]: command:set [Colour] «Colour each state with its own colour: Red red, Green green, Amber orange» -> command:set [Green] «Green green»
- sm2-0445 [shared span reverted]: command:set [Colour] «Colour each state with its own colour: Red red, Green green, Amber orange» -> command:set [Amber] «Amber orange»
- sm2-0446 [shared span reverted]: command:move [Park] «Park the House in the center, Garage on its left and Garden on its right» -> command:move [Park] «Park the House in the center»
- sm2-0446 [shared span reverted]: command:move [Park] «Park the House in the center, Garage on its left and Garden on its right» -> command:move [left] «Garage on its left»
- sm2-0446 [shared span reverted]: command:move [Park] «Park the House in the center, Garage on its left and Garden on its right» -> command:move [right] «Garden on its right»
- sm2-0452 [shared span reverted]: fact:None [is] «Tea is green and Water is cyan» -> fact:None [is] «Tea is green»
- sm2-0452 [shared span reverted]: fact:None [is] «Tea is green and Water is cyan» -> fact:None [is] «Water is cyan»
- sm2-0455 [shared span reverted]: command:set [Colour] «Colour Oak brown, Maple red, Pine green and Birch white» -> command:set [Colour] «Colour Oak brown»
- sm2-0455 [shared span reverted]: command:set [Colour] «Colour Oak brown, Maple red, Pine green and Birch white» -> command:set [Maple] «Maple red»
- sm2-0455 [shared span reverted]: command:set [Colour] «Colour Oak brown, Maple red, Pine green and Birch white» -> command:set [Pine] «Pine green»
- sm2-0455 [shared span reverted]: command:set [Colour] «Colour Oak brown, Maple red, Pine green and Birch white» -> command:set [Birch] «Birch white»
- sm2-0457 [shared span reverted]: command:move [Park] «Park the Kitchen at the top and Hall at the bottom» -> command:move [Park] «Park the Kitchen at the top»
- sm2-0457 [shared span reverted]: command:move [Park] «Park the Kitchen at the top and Hall at the bottom» -> command:move [at the bottom] «Hall at the bottom»
- sm2-0461 [shared span reverted]: command:set [Colour] «Colour Pass green and Fail red» -> command:set [Colour] «Colour Pass green»
- sm2-0461 [shared span reverted]: command:set [Colour] «Colour Pass green and Fail red» -> command:set [Fail] «Fail red»
- sm2-0462 [shared span reverted]: command:set [Make] «Make Ok green, Cancel gray» -> command:set [Make] «Make Ok green»
- sm2-0462 [shared span reverted]: command:set [Make] «Make Ok green, Cancel gray» -> command:set [Cancel] «Cancel gray»
- sm2-0469 [shared span reverted]: command:resize [Resize] «Resize the Worker bigger, then a bit smaller» -> command:resize [Resize] «Resize the Worker bigger»
- sm2-0469 [shared span reverted]: command:resize [Resize] «Resize the Worker bigger, then a bit smaller» -> command:resize [smaller] «a bit smaller»
- sm2-0470 [shared span reverted]: command:set [Tint] «Tint Egg yellow and Butter gold» -> command:set [Tint] «Tint Egg yellow»
- sm2-0470 [shared span reverted]: command:set [Tint] «Tint Egg yellow and Butter gold» -> command:set [Butter] «Butter gold»
- sm2-0480 [shared span reverted]: command:move [Place] «Place Search on top and Results at the bottom» -> command:move [Place] «Place Search on top»
- sm2-0480 [shared span reverted]: command:move [Place] «Place Search on top and Results at the bottom» -> command:move [at the bottom] «Results at the bottom»
- sm2-0500 [shared span reverted]: command:move [Slide] «Slide Yes left and No right, 50 pixels each» -> command:move [Slide] «Slide Yes left»
- sm2-0500 [shared span reverted]: command:move [Slide] «Slide Yes left and No right, 50 pixels each» -> command:move [right] «No right, 50 pixels each»
- sm2-0500 [shared span reverted]: command:set [Make] «Make Yes green and No red» -> command:set [Make] «Make Yes green»
- sm2-0500 [shared span reverted]: command:set [Make] «Make Yes green and No red» -> command:set [No] «No red»
- sm2-0513 [shared span reverted]: command:move [Put] «Put Me at the bottom, Gran at the top» -> command:move [Put] «Put Me at the bottom»
- sm2-0513 [shared span reverted]: command:move [Put] «Put Me at the bottom, Gran at the top» -> command:move [at the top] «Gran at the top»
- sm2-0519 [shared span reverted]: fact:None [is] «Hero is blue, Foe is black» -> fact:None [is] «Hero is blue»
- sm2-0519 [shared span reverted]: fact:None [is] «Hero is blue, Foe is black» -> fact:None [is] «Foe is black»
- sm2-0525 [shared span reverted]: command:set [Make] «Make Yes green and No red» -> command:set [Make] «Make Yes green»
- sm2-0525 [shared span reverted]: command:set [Make] «Make Yes green and No red» -> command:set [No] «No red»
- sm2-0527 [shared span reverted]: command:move [Put] «Put Open on the left, Close on the right» -> command:move [Put] «Put Open on the left»
- sm2-0527 [shared span reverted]: command:move [Put] «Put Open on the left, Close on the right» -> command:move [on the right] «Close on the right»
- sm2-0528 [shared span reverted]: command:set [Recolour] «Recolour Leaf green and Root brown» -> command:set [Recolour] «Recolour Leaf green»
- sm2-0528 [shared span reverted]: command:set [Recolour] «Recolour Leaf green and Root brown» -> command:set [Root] «Root brown»
- sm2-0532 [shared span reverted]: command:move [Park] «Park Mom left, Dad right, and Kid in the center» -> command:move [Park] «Park Mom left»
- sm2-0532 [shared span reverted]: command:move [Park] «Park Mom left, Dad right, and Kid in the center» -> command:move [right] «Dad right»
- sm2-0532 [shared span reverted]: command:move [Park] «Park Mom left, Dad right, and Kid in the center» -> command:move [in the center] «Kid in the center»
- sm2-0537 [shared span reverted]: fact:None [is] «Pa is a square and Ma is a circle» -> fact:None [is] «Pa is a square»
- sm2-0537 [shared span reverted]: fact:None [is] «Pa is a square and Ma is a circle» -> fact:None [is] «Ma is a circle»
- sm2-0539 [shared span reverted]: fact:None [is] «Sea is blue, Land is green, Sky is cyan» -> fact:None [is] «Sea is blue»
- sm2-0539 [shared span reverted]: fact:None [is] «Sea is blue, Land is green, Sky is cyan» -> fact:None [is] «Land is green»
- sm2-0539 [shared span reverted]: fact:None [is] «Sea is blue, Land is green, Sky is cyan» -> fact:None [is] «Sky is cyan»
- sm2-0539 [shared span reverted]: command:move [Put] «Put Sky above Land and Land above Sea» -> command:move [Put] «Put Sky above Land»
- sm2-0539 [shared span reverted]: command:move [Put] «Put Sky above Land and Land above Sea» -> command:move [above] «Land above Sea»
- sm2-0540 [shared span reverted]: command:set [Make] «Make Mage purple, Rogue black and Cleric white» -> command:set [Make] «Make Mage purple»
- sm2-0540 [shared span reverted]: command:set [Make] «Make Mage purple, Rogue black and Cleric white» -> command:set [Rogue] «Rogue black»
- sm2-0540 [shared span reverted]: command:set [Make] «Make Mage purple, Rogue black and Cleric white» -> command:set [Cleric] «Cleric white»
- sm2-0544 [shared span reverted]: command:set [Tint] «Tint Salt white, Pepper gray, Meat brown» -> command:set [Tint] «Tint Salt white»
- sm2-0544 [shared span reverted]: command:set [Tint] «Tint Salt white, Pepper gray, Meat brown» -> command:set [Pepper] «Pepper gray»
- sm2-0544 [shared span reverted]: command:set [Tint] «Tint Salt white, Pepper gray, Meat brown» -> command:set [Meat] «Meat brown»
- sm2-0548 [shared span reverted]: command:set [Make] «Make the Hall huge and the Room small» -> command:set [Make] «Make the Hall huge»
- sm2-0548 [shared span reverted]: command:set [Make] «Make the Hall huge and the Room small» -> command:set [the Room] «the Room small»
- sm2-0560 [shared span reverted]: command:label [Label] «Label Logo as Brand and Nav as Menu» -> command:label [Label] «Label Logo as Brand»
- sm2-0560 [shared span reverted]: command:label [Label] «Label Logo as Brand and Nav as Menu» -> command:label [Nav] «Nav as Menu»
- sm2-0563 [shared span reverted]: fact:None [is] «Backlog is gray, Doing is yellow, Done is green» -> fact:None [is] «Backlog is gray»
- sm2-0563 [shared span reverted]: fact:None [is] «Backlog is gray, Doing is yellow, Done is green» -> fact:None [is] «Doing is yellow»
- sm2-0563 [shared span reverted]: fact:None [is] «Backlog is gray, Doing is yellow, Done is green» -> fact:None [is] «Done is green»
- sm2-0586 [shared span reverted]: fact:None [is] «Eli is a square, Eva is a circle» -> fact:None [is] «Eli is a square»
- sm2-0586 [shared span reverted]: fact:None [is] «Eli is a square, Eva is a circle» -> fact:None [is] «Eva is a circle»
- sm2-0593 [shared span reverted]: command:set [Paint] «Paint Sea blue, Cloud gray» -> command:set [Paint] «Paint Sea blue»
- sm2-0593 [shared span reverted]: command:set [Paint] «Paint Sea blue, Cloud gray» -> command:set [Cloud] «Cloud gray»
- sm2-0597 [shared span reverted]: fact:None [is] «Big is huge, Small is tiny, Mid is medium» -> fact:None [is] «Big is huge»
- sm2-0597 [shared span reverted]: fact:None [is] «Big is huge, Small is tiny, Mid is medium» -> fact:None [is] «Small is tiny»
- sm2-0597 [shared span reverted]: fact:None [is] «Big is huge, Small is tiny, Mid is medium» -> fact:None [is] «Mid is medium»

## Decided without a change (the legend cannot express the request, so no wire; checked against logic.js and the legend)
- sm2-0132 "put the leftmost one in front" and sm2-0365 "make the winner huge": a target given by a superlative has no mention form.
- sm2-0113: "Tie Lan and Wan together directly as well? Hmm, no, don't" is taken back; "Vpn links Lan to Wan" is left unwired (see owner list).
- sm2-0383 "Everything gray should be small, from now on": a rule has no colour condition (rule: shape optional, new colour or size).
- sm2-0378 "Col3 is not gold": a negated fact is not in the legend.
- sm2-0386 "Make the links dashed. Delete the dotted ones.": restyle / delete by link style, not expressible. sm2-0396 "Draw the first as dashed": same.
- sm2-0468 "How many tiny shapes are there?", sm2-0334 "How many shapes are small?", sm2-0194 "Is there anything huge?": count / exists have no size filter.
- sm2-0189 "show every shape that is not a rectangle", sm2-0349 "Which shapes are not circles?": no negated shape filter (only notColor).
- sm2-0392 "Is the Ship nearer to Port than to Reef", sm2-0400 "Is the Cb nearer to Gk or Fwd?": no two-anchor comparison.
- sm2-0273 "What colours are in play?": no question lists colours.
- sm2-0086 "Is there anything bigger than Panel2?": check needs a named target.
- Restyle sentences on an existing link carry no wire: connect on an existing pair only reports "already exists" (docs/js/logic.js connect run()). Folded into the create only where the restyle covers the whole wire (see owner list).
- sm2-0162: "Raw,$new,$new,Gold" and `anchor=$new,Gold` are scorable (bench-canon.js turns every reference to a create into $new, arrays joined with ","). Kept as written.
- sm2-0196: count=2 create with two names is NOT scorable (refs.set(name) only for a create with a name and no count); wire kept as written, listed below.
- sm2-0188 "old gray star" -> mention(color=gray,recency=oldest,shape=star): "old / oldest" -> recency=oldest is 7/7 in the existing data; kept.
- sm2-0237 "Slide Zoe off to the right": position=right is the majority for a move to a side without distance (161 position against 0 direction without distance; direction appears only with a distance, 23); kept.
- Questions: next to -> neighbors 7/7 (5 fixed here), near -> list near 3/3 (kept), touch / linked / connected between two shapes -> connected, "which shapes are linked to X" -> neighbors 7/7, how many links -> degree, "is X the leftmost" -> extreme with superlative only (28/30), most / fewest -> extreme (101). All other sm2 questions already follow these.

## Owner list (not decided: fewer than 5 existing cases, a majority under 2/3, or a conflict with the owner's stated rule)
1. (Resolved by the coordinator, see "Unshared spans" below: the shared-span instruction was wrong; every shared span was reverted to the existing majority of one span per request.)
2. Fold of a restyle into the create-connect: existing 2 cases (sm-0389, sm-0234) -> too few. Applied only where the restyle covers the whole wire: sm2-0375 (folded), sm2-0472 (folded as a self-correction, the final value rule), spans widened only in sm2-0152 and sm2-0247 (the wire already carried the style). Removed without folding, because the restyle covers only part of a wire or an older link: 0040, 0059, 0079, 0128, 0178, 0218, 0238, 0342, 0533.
3. Closing link of a loop as a separate connect after the chain: existing 4/4 (sm-0140, sm-0322, sm-0489, sm-0585), under 5. Applied to 13 wires because a chain with a repeated name is not executable (chain sorts shapes by creation order and has no dedupe, so a repeated name is a self-loop); 0056, 0133, 0252, 0262, 0311, 0394, 0445, 0491, 0538, 0545, 0561, 0582, 0593 (0149 and 0166 already had it).
4. Canvas-position statements without a command verb ("Img goes on top, Txt in the middle, Btn at the bottom" 0189; "Hero sits in the center" 0408; "P1 left of the Flag, P2 right" 0587): existing statements of this kind are move in 4/4 (among them sm-0496 "Church top, Hall middle, Hotel bottom" and sm-0582 "Start left, Finish right"), under 5, so NO wire was added. Anchor statements with "sits" (0447 "Img sits between Title and Caption", 0535 "Img sits above the Txt", 0434 "Chair sits above the other three"): existing fact in 4/4, under 5, so no wire was added; 0206 stays as the fact wires the writer gave.
5. List anchor "A,B,C" for "above all three" (0487): existing list anchors 2/2 (sm-0044, sm-0280). Applied because LABEL_CONVENTIONS says several shapes in one key are comma-joined and logic.js move/check accept an anchor list.
6. "later" in a request with no wire or a wire: sm2-0171 "Remove the link between Mgr and T3 later" has no wire; existing sm-0377 (no wire) against sm-0470 (wire), 1 against 1.
7. sm2-0396 "drop the second link if Ext touches Lan": the link is given as "the second link" (a description of a link, not a name), no wire written.
8. sm2-0113 "Vpn links Lan to Wan": unclear whether the connect is Vpn->Lan, Vpn->Wan or Lan->Wan through Vpn; no comparable existing case; left unwired.
9. Undo then re-create in another style (sm2-0128 "undo the plain lines, then redo them as dashed", 0443 "Undo the thin line, make it an arrow", 0458 "undo and redo with arrows reversed"): no existing case of this construction; the wires for the re-created link were removed or left as written (0128 w3 removed; 0443 and 0458 unchanged, 0458 has no wire for the reversed chain). Note that the editor undoes the LAST command, which may not be the link.
10. Multi-property questions "what colour and shape" (sm2-0051, 0257, 0455 describe; sm2-0376 two property wires): no comparable existing case (0 found).
11. Wires whose target is a renamed shape use the new name as written (16/17 existing). The structure checker will flag names not in `names` in 17 wires (e.g. 0240 w4 Anchor, 0372 Rho); this is the existing convention, not an error.
12. Count-plus-names create (sm2-0196 "two purple circles ... called Svc1 and Svc2", connect to=$new): not scorable by llm_score.mjs. Existing count-plus-names creates: not counted. Left as written; the writer should rewrite or the owner may accept it as unscorable.
13. sm2-0091 "call it a standby" (copy renamed to a lowercase word): no wire; sm2-0070 "pop a yellow star on the Exit" (position near); sm2-0096 "put Bundle on top of Unit" and sm2-0390 "Header on top of everything" (toFront); sm2-0560 "just redo the label on Nav" (redo wire added): existing "on top of / in front of" cases are 2 (move near 1, move above 1, no toFront), so no majority. Left as written.
