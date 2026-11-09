# Label fixes (haiku_msg)

One line per change: id, [kind of problem], what was wrong, before -> after. Files msg_01..msg_12 edited in place (600 messages read).
Chain merges: two `connect` wires of one sequence in the same sentence ("connect A to B, then connect B to C") were merged into one
`connect` from "A,B,C" with pairing "chain" (convention: continuing sequence). Two-sentence cases and cases with style/arrow differences were kept as separate wires.

- hm-0048 [extra key (count)]: "Duplicate Sleeve so we have two of them" (count not stated in the command): {"action": "duplicate", "target": "Sleeve", "count": "2"} -> count removed
- hm-0128 [extra key (count)]: "Duplicate Code" (count is only in chatter): {"action": "duplicate", "target": "Code", "count": "2"} -> count removed
- hm-0103 [chain (two connects of one sequence)]: "Connect Reception to Waiting, then connect Waiting to Exam with arrows": connect Reception->Waiting + connect Waiting->Exam -> one connect from "Reception,Waiting,Exam" pairing=chain
- hm-0163 [chain (two connects of one sequence)]: "Connect Chop to Simmer, then connect Simmer to Plate": connect Chop->Simmer + connect Simmer->Plate -> one connect from "Chop,Simmer,Plate" pairing=chain
- hm-0170 [chain (two connects of one sequence)]: "Connect Grandpa to Father, then link Father to Son": connect Grandpa->Father + connect Father->Son -> one connect from "Grandpa,Father,Son" pairing=chain
- hm-0192 [chain (two connects of one sequence)]: "Connect Floor1 to Floor2 with an arrow, then connect Floor2 to Lobby2 with an arrow": connect Floor1->Floor2 + connect Floor2->Lobby2 -> one connect from "Floor1,Floor2,Lobby2" pairing=chain
- hm-0207 [chain (two connects of one sequence)]: "Connect Level2 to Ramp3, then link Ramp3 to Level1": connect Level2->Ramp3 + connect Ramp3->Level1 -> one connect from "Level2,Ramp3,Level1" pairing=chain
- hm-0220 [chain (two connects of one sequence)]: "Connect Start4 to Score2, then connect Score2 to Quit": connect Start4->Score2 + connect Score2->Quit -> one connect from "Start4,Score2,Quit" pairing=chain
- hm-0222 [chain (two connects of one sequence)]: "Connect Boat to Buoy1, then connect Buoy1 to Buoy2": connect Boat->Buoy1 + connect Buoy1->Buoy2 -> one connect from "Boat,Buoy1,Buoy2" pairing=chain
- hm-0232 [chain (two connects of one sequence)]: "Connect Inbox to Sorter with a solid arrow, then connect Sorter to Outbox": connect Inbox->Sorter + connect Sorter->Outbox -> one connect from "Inbox,Sorter,Outbox" pairing=chain
- hm-0243 [chain (two connects of one sequence)]: "Connect Dock2 to Room1, then connect Room1 to Room2": connect Dock2->Room1 + connect Room1->Room2 -> one connect from "Dock2,Room1,Room2" pairing=chain
- hm-0245 [chain (two connects of one sequence)]: "Connect Raw1 to Staging, then connect Staging to Warehouse": connect Raw1->Staging + connect Staging->Warehouse -> one connect from "Raw1,Staging,Warehouse" pairing=chain
- hm-0258 [chain (two connects of one sequence)]: "Connect Intro2 to Theme, then link Theme to Coda": connect Intro2->Theme + connect Theme->Coda -> one connect from "Intro2,Theme,Coda" pairing=chain
- hm-0259 [chain (two connects of one sequence)]: "Connect Well to Tower2, then connect Tower2 to Houses": connect Well->Tower2 + connect Tower2->Houses -> one connect from "Well,Tower2,Houses" pairing=chain
- hm-0263 [chain (two connects of one sequence)]: "Connect Login3 to Accounts, then connect Accounts to Transfer": connect Login3->Accounts + connect Accounts->Transfer -> one connect from "Login3,Accounts,Transfer" pairing=chain
- hm-0266 [chain (two connects of one sequence)]: "Connect Hypothesis to Experiment, then connect Experiment to Result": connect Hypothesis->Experiment + connect Experiment->Result -> one connect from "Hypothesis,Experiment,Result" pairing=chain
- hm-0271 [chain (two connects of one sequence)]: "Connect Battery2 to Resistor with a solid line, then connect Resistor to Bulb": connect Battery2->Resistor + connect Resistor->Bulb -> one connect from "Battery2,Resistor,Bulb" pairing=chain
- hm-0272 [chain (two connects of one sequence)]: "Connect Gallery1 to Gallery2, then connect Gallery2 to Cafe2": connect Gallery1->Gallery2 + connect Gallery2->Cafe2 -> one connect from "Gallery1,Gallery2,Cafe2" pairing=chain
- hm-0280 [chain (two connects of one sequence)]: "Connect Research to Slides, then connect Slides to Presenter": connect Research->Slides + connect Slides->Presenter -> one connect from "Research,Slides,Presenter" pairing=chain
- hm-0293 [chain (two connects of one sequence)]: "Connect Entry2 to Ghost, then connect Ghost to Exit4": connect Entry2->Ghost + connect Ghost->Exit4 -> one connect from "Entry2,Ghost,Exit4" pairing=chain
- hm-0298 [chain (two connects of one sequence)]: "Connect Ladder2 to Platform, then connect Platform to Rope": connect Ladder2->Platform + connect Platform->Rope -> one connect from "Ladder2,Platform,Rope" pairing=chain
- hm-0332 [extra key (count)]: "Duplicate Prep once": {"action": "duplicate", "target": "Prep", "count": "1"} -> count removed
- hm-0334 [wrong ask (spatial "near" question)]: "Which shapes are near Chair2": neighbors target=Chair2 -> list position=near anchor=Chair2
- hm-0336 [trigger]: question trigger "the shapes that are not blue" (a value) -> "tell me the shapes"
- hm-0350 [wrong action (resize with explicit size)]: "just resize it to large": resize target,size=large -> set target,size=large
- hm-0304 [chain (two connects of one sequence)]: "Connect Sales2 to Region, then connect Region to Chart": connect Sales2->Region + connect Region->Chart -> one connect from "Sales2,Region,Chart" pairing=chain
- hm-0306 [chain (two connects of one sequence)]: "Connect Robot1 to Charger, then connect Charger to Battery3": connect Robot1->Charger + connect Charger->Battery3 -> one connect from "Robot1,Charger,Battery3" pairing=chain
- hm-0310 [chain (two connects of one sequence)]: "Connect Thread to Needle with a solid line, then connect Needle to Bobbin": connect Thread->Needle + connect Needle->Bobbin -> one connect from "Thread,Needle,Bobbin" pairing=chain
- hm-0329 [chain (two connects of one sequence)]: "Connect Backlog2 to Sprint, then connect Sprint to Shipped": connect Backlog2->Sprint + connect Sprint->Shipped -> one connect from "Backlog2,Sprint,Shipped" pairing=chain
- hm-0343 [chain (two connects of one sequence)]: "Connect Hypothesis to Results and Results to Poster": connect Hypothesis->Results + connect Results->Poster -> one connect from "Hypothesis,Results,Poster" pairing=chain
- hm-0356 [trigger]: "put a tiny" -> "put"
- hm-0378 [trigger]: "put a tiny" -> "put"
- hm-0386 [wrong action (resize with explicit size)]: "resize the Fiddle to small": resize target,size=small -> set target,size=small
- hm-0387 [extra key (count)]: "Duplicate Bow once": {"action": "duplicate", "target": "Bow", "count": "1"} -> count removed
- hm-0391 [wrong action (resize with explicit size)]: "Resize Welcome to medium": resize target,size=medium -> set target,size=medium
- hm-0399 [extra key (count)]: "Duplicate Cones once": {"action": "duplicate", "target": "Cones", "count": "1"} -> count removed
- hm-0355 [chain (two connects of one sequence)]: "Connect Reception to Triage, then connect Triage to Doctor": connect Reception->Triage + connect Triage->Doctor -> one connect from "Reception,Triage,Doctor" pairing=chain
- hm-0423 [wrong ask (spatial "near" question)]: "Which shapes are near Room1": neighbors target=Room1 -> list position=near anchor=Room1
- hm-0428 [extra key (count)]: "Duplicate Shelf once": {"action": "duplicate", "target": "Shelf", "count": "1"} -> count removed
- hm-0434 [span (does not cover the correction)]: "Put the Beetle on the Leaf" -> "Put the Beetle on the Leaf, uh, I mean near the Leaf"
- hm-0439 [extra key (count)]: "Duplicate Defender once": {"action": "duplicate", "target": "Defender", "count": "1"} -> count removed
- hm-0444 [wrong ask (spatial "near" question)]: "Which shapes are near Crane": neighbors target=Crane -> list position=near anchor=Crane
- hm-0449 [wrong action (resize with explicit size)]: "resize the Warrior to large": resize target,size=large -> set target,size=large
- hm-0433 [chain (two connects of one sequence)]: "Connect Intake to Filter, then connect Filter to Tank": connect Intake->Filter + connect Filter->Tank -> one connect from "Intake,Filter,Tank" pairing=chain
- hm-0469 [extra key (count)]: "duplicate Rower once": {"action": "duplicate", "target": "Rower", "count": "1"} -> count removed
- hm-0486 [wrong action (resize with explicit size)]: "resize the Valve2 to small": resize target,size=small -> set target,size=small
- hm-0489 [extra key (count)]: "Duplicate Chair once": {"action": "duplicate", "target": "Chair", "count": "1"} -> count removed
- hm-0502 [extra key (count)]: "Duplicate Recap once": {"action": "duplicate", "target": "Recap", "count": "1"} -> count removed
- hm-0536 [missing wire]: question "Which shape is the closest to Queen" had no wire -> added nearest anchor=Queen superlative=closest
- hm-0560 [span (does not cover the correction)]: "Put Label2 on the Bottle" -> "Put Label2 on the Bottle, uh, I mean near it"
- hm-0562 [extra key (count)]: "duplicate the Mini once": {"action": "duplicate", "target": "Mini", "count": "1"} -> count removed
- hm-0577 [span (does not cover the correction)]: "Arrange Steps, Calories and Goal in a row" -> "Arrange Steps, Calories and Goal in a row, from the top to the bottom, uh, a column is better"
- hm-0578 [extra key (count)]: "Duplicate Middle once": {"action": "duplicate", "target": "Middle", "count": "1"} -> count removed
- hm-0596 [extra key (count)]: "Duplicate Flute once": {"action": "duplicate", "target": "Flute", "count": "1"} -> count removed
- hm-0598 [span (does not cover the correction)]: "Put the Cup on the Mat" -> "Put the Cup on the Mat, uh, near the Mat"

## Convention added later: several sources to one target -> one connect per source (no pairing)

- hm-0075 [several-to-one connect]: "Connect Exit1 and Exit2 to Hall": one connect from "Exit1,Exit2" to "Hall" -> 2 connects, one per source (each keeps the full span)
- hm-0097 [several-to-one connect]: "Connect Soup and Salad to Pizza": one connect from "Soup,Salad" to "Pizza" -> 2 connects, one per source (each keeps the full span)
- hm-0121 [several-to-one connect]: "Connect Engine and Ladder to it with solid lines": one connect from "Engine,Ladder" to "$new" -> 2 connects, one per source (each keeps the full span)
- hm-0122 [several-to-one connect]: "Connect Goal1 and Goal2 to Metric with arrows": one connect from "Goal1,Goal2" to "Metric" -> 2 connects, one per source (each keeps the full span)
- hm-0129 [several-to-one connect]: "Connect Quarter1 and Quarter2 to Semi": one connect from "Quarter1,Quarter2" to "Semi" -> 2 connects, one per source (each keeps the full span)
- hm-0130 [several-to-one connect]: "Connect Art and Science to Renaissance with dotted lines": one connect from "Art,Science" to "Renaissance" -> 2 connects, one per source (each keeps the full span)
- hm-0140 [several-to-one connect]: "Connect Desk1 and Desk2 to Board with dotted lines": one connect from "Desk1,Desk2" to "Board" -> 2 connects, one per source (each keeps the full span)
- hm-0147 [several-to-one connect]: "Connect Sensor1 and Sensor2 to Hub with solid lines": one connect from "Sensor1,Sensor2" to "Hub" -> 2 connects, one per source (each keeps the full span)
- hm-0160 [several-to-one connect]: "Connect Bike1 and Bike2 to Park with dashed lines": one connect from "Bike1,Bike2" to "Park" -> 2 connects, one per source (each keeps the full span)
- hm-0162 [several-to-one connect]: "Connect Deposit and Withdraw to Balance with solid arrows": one connect from "Deposit,Withdraw" to "Balance" -> 2 connects, one per source (each keeps the full span)
- hm-0169 [several-to-one connect]: "Connect Rent and Food to Savings with dotted lines": one connect from "Rent,Food" to "Savings" -> 2 connects, one per source (each keeps the full span)
- hm-0197 [several-to-one connect]: "Connect Candidate1 and Candidate2 to Ballot with plain lines": one connect from "Candidate1,Candidate2" to "$new" -> 2 connects, one per source (each keeps the full span)
- hm-0227 [several-to-one connect]: "Connect Vote1 and Vote2 to Winner with solid arrows": one connect from "Vote1,Vote2" to "Winner" -> 2 connects, one per source (each keeps the full span)
- hm-0236 [several-to-one connect]: "Connect Persona1 and Persona2 to Goal with solid arrows": one connect from "Persona1,Persona2" to "Goal" -> 2 connects, one per source (each keeps the full span)
- hm-0239 [several-to-one connect]: "Connect Calc and Physics to Chem with dotted lines": one connect from "Calc,Physics" to "Chem" -> 2 connects, one per source (each keeps the full span)
- hm-0240 [several-to-one connect]: "Connect Push and Email to Inbox2 with arrows": one connect from "Push,Email" to "Inbox2" -> 2 connects, one per source (each keeps the full span)
- hm-0251 [several-to-one connect]: "Connect Kiosk1 and Kiosk2 to Queue3 with solid lines": one connect from "Kiosk1,Kiosk2" to "Queue3" -> 2 connects, one per source (each keeps the full span)
- hm-0257 [several-to-one connect]: "Connect Compute and Storage to Bill with dotted lines": one connect from "Compute,Storage" to "Bill" -> 2 connects, one per source (each keeps the full span)
- hm-0303 [several-to-one connect]: "Connect Gate1 and Gate2 to Stage6 with solid arrows": one connect from "Gate1,Gate2" to "Stage6" -> 2 connects, one per source (each keeps the full span)
- hm-0344 [several-to-one connect]: "Link Warrior and Mage to Quest": one connect from "Warrior,Mage" to "Quest" -> 2 connects, one per source (each keeps the full span)
- hm-0389 [several-to-one connect]: "Connect Teller1 and Teller2 to Vault with solid lines": one connect from "Teller1,Teller2" to "Vault" -> 2 connects, one per source (each keeps the full span)
- hm-0429 [several-to-one connect]: "Connect Key to Subject and Fill to Subject": one connect from "Key,Fill" to "Subject" -> 2 connects, one per source (Connect Key to Subject; Fill to Subject)
- hm-0450 [several-to-one connect]: "Connect Booth1 to Stage3 and Booth2 to Stage3 with arrows": one connect from "Booth1,Booth2" to "Stage3" -> 2 connects, one per source (Connect Booth1 to Stage3; Booth2 to Stage3 with arrows)
- hm-0485 [several-to-one connect]: "Connect Platform1 to Stairs2 and Platform2 to Stairs2": one connect from "Platform1,Platform2" to "Stairs2" -> 2 connects, one per source (Connect Platform1 to Stairs2; Platform2 to Stairs2)
- hm-0487 [several-to-one connect]: "Connect Merchant to Well and Guard to Well": one connect from "Merchant,Guard" to "Well" -> 2 connects, one per source (Connect Merchant to Well; Guard to Well)
- hm-0496 [several-to-one connect]: "Connect Patient1 to Notes and Patient2 to Notes": one connect from "Patient1,Patient2" to "Notes" -> 2 connects, one per source (Connect Patient1 to Notes; Patient2 to Notes)
- hm-0508 [several-to-one connect]: "Connect Boat1 to Mark and Boat2 to Mark": one connect from "Boat1,Boat2" to "Mark" -> 2 connects, one per source (Connect Boat1 to Mark; Boat2 to Mark)
- hm-0512 [several-to-one connect]: "Connect Pier3 to Deck and Cable to Deck": one connect from "Pier3,Cable" to "Deck" -> 2 connects, one per source (Connect Pier3 to Deck; Cable to Deck)
- hm-0537 [several-to-one connect]: "Connect Lane1 to Bar2 and Lane2 to Bar2": one connect from "Lane1,Lane2" to "Bar2" -> 2 connects, one per source (Connect Lane1 to Bar2; Lane2 to Bar2)
- hm-0550 [several-to-one connect]: "Connect Judge1 to Routine and Judge2 to Routine": one connect from "Judge1,Judge2" to "Routine" -> 2 connects, one per source (Connect Judge1 to Routine; Judge2 to Routine)
- hm-0559 [several-to-one connect]: "Connect Glider to Target and Dart to Target with dotted lines": one connect from "Glider,Dart" to "Target" -> 2 connects, one per source (Connect Glider to Target; Dart to Target with dotted lines)
- hm-0575 [several-to-one connect]: "Connect Stall1 to Stage4 and Stall2 to Stage4": one connect from "Stall1,Stall2" to "Stage4" -> 2 connects, one per source (Connect Stall1 to Stage4; Stall2 to Stage4)
- hm-0600 [several-to-one connect]: "Connect Pylon to Girder and Crane3 to Girder": one connect from "Pylon,Crane3" to "Girder" -> 2 connects, one per source (Connect Pylon to Girder; Crane3 to Girder)

## Reversal of the several-to-one split (convention changed: ONE connect, from "X,Y", to "Z", no pairing)

All 33 splits listed in the section above were undone: each pair is again one connect with from "X,Y", to "Z" (other keys unchanged), the original full span and the original first trigger. Other fixes untouched.
