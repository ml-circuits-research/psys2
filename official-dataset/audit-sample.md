# Audit sample

100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.

1. [avatar · demo-tool-profile · train · avatar.part.change] “please set the "mouth" part using the pressed variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “please set the "mouth" part using the pressed variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "mouth" from “"mouth"” [eq, result]
    - part.variant = "pressed" from “pressed” [eq, result]

2. [avatar · demo-tool-profile · train · avatar.part.change] “make the neck and ears and head and cheeks and nose tan”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “make the neck and ears and head and cheeks and nose tan”: **change**/do trigger=“make”; target part existing definite fill=written
    - part.ids = "neck and ears and head and cheeks and nose" from “neck and ears and head and cheeks and nose” [eq, result]
    - part.colour = "tan" from “tan” [eq, result]

3. [avatar · demo-tool-profile · train · avatar.part.change] “set the "hat" part to the top hat variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “set the "hat" part to the top hat variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "hat" from “"hat"” [eq, result]
    - part.variant = "top hat" from “top hat” [eq, result]

4. [avatar · main-synthetic · train · avatar.face.preset] “fix a gril face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “fix a gril face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "girl" from “gril” [eq, result]
    - face.id = "face" from “face” [eq, selector]

5. [avatar · main-synthetic · train · avatar.face.preset] “can you change a woman face?”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “can you change a woman face?”: **change**/do trigger=“change”; target face existing definite fill=written name_span=“face”
    - face.preset = "woman" from “woman” [eq, result]
    - face.id = "face" from “face” [eq, selector]

6. [avatar · main-synthetic · train · avatar.face.preset] “a man for me, face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “a man for me, face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "man" from “man” [eq, result]
    - face.id = "face" from “face” [eq, selector]

7. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “could you make the head a lot larger”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “could you make the head a lot larger”: **change**/do trigger=“make”; target part existing definite fill=description kind=head kind_span=“head”
    - part.size = "(unlabelled)" from “larger” [delta, result]

8. [avatar · ui-comparatives-v1 · dev · avatar.part.size.delta] “make the ears a lot smaller”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “make the ears a lot smaller”: **change**/do trigger=“make”; target part existing definite fill=description kind=ears kind_span=“ears”
    - part.size = "(unlabelled)" from “smaller” [delta, result]

9. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “please make the mouth a lot tinier”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “please make the mouth a lot tinier”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.size = "(unlabelled)" from “tinier” [delta, result]

10. [avatar · ui-coverage-v2 · train · avatar.face.resize] “scale the character up”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “scale the character up”: **change**/do trigger=“scale”; target face existing definite fill=context
    - face.scale = "(unlabelled)" from “up” [delta, result]

11. [avatar · ui-coverage-v2 · train · avatar.part.resize] “shrink the nose a step”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “shrink the nose a step”: **change**/do trigger=“shrink”; target part existing definite fill=description kind=nose kind_span=“nose”
    - part.scale = "(unlabelled)" from “a step” [delta, result]

12. [avatar · ui-coverage-v2 · train · avatar.part.change] “in the photo her eyes look brownish, so change them to brown here too”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “in the photo her eyes look brownish, so change them to brown here too”: **change**/do trigger=“change”; target part existing definite fill=written name_span=“her eyes”
    - part.ids = "her eyes" from “her eyes” [eq, selector]
    - part.colour = "brown" from “brown” [eq, result]

13. [avatar · ui-coverage-v2 · test · avatar.part.change] “big lips”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “big lips”: **change**/do (no trigger); target part existing definite fill=written name_span=“lips”
    - part.ids = "lips" from “lips” [eq, selector]
    - part.size = "big" from “big” [degree, result]

14. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.scale = "1.1" from “1.1” [eq, result]

15. [avatar · ui-human-v1 · train · avatar.part.add] “put on a cap”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “put on a cap”: **make**/do trigger=“put”; target part new indefinite
    - part.variant = "cap" from “cap” [eq, result]

16. [avatar · ui-human-v1 · train · avatar.face.compose] “would be nice to have a human avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “would be nice to have a human avatar”: **change**/do trigger=“have”; target face existing definite fill=written name_span=“avatar”
    - face.characterKind = "human" from “human” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

17. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=written name_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

18. [avatar · ui-natural-v1 · train · avatar.part.add] “give the avatar closed eyes”  — context: Avatar, earrings, hair front, eyebrows, nose, mouth
  - span “give the avatar closed eyes”: **make**/do trigger=“give”; target part new indefinite
    - part.id = "eyes" from “eyes” [eq, result]
    - part.variant = "closed" from “closed” [eq, result]

19. [avatar · ui-natural-v1 · train · avatar.face.expression] “give the avatar a happy look”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “give the avatar a happy look”: **change**/do trigger=“give”; target face existing definite fill=written name_span=“avatar”
    - face.expression = "happy" from “happy” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

20. [calendar · demo-tool-profile · train · calendar.meeting.move] “Please, place Review to 2026-12-09 at 13:00 UTC. Thanks!”  — context: Work 5, Focus room, Review
  - span “place Review to 2026-12-09 at 13:00 UTC”: **place**/do trigger=“place”; target meeting existing definite fill=written name_span=“Review”
    - meeting.day = "2026-12-09" from “2026-12-09” [eq, result]
    - meeting.time = "13:00" from “13:00” [eq, result]

21. [calendar · demo-tool-profile · train · calendar.meeting.add] “Please, put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes. Thanks!”  — context: Work 6, Living room
  - span “put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes”: **make**/do trigger=“put”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 6" from “Work 6” [eq, result]
    - meeting.day = "2026-12-10" from “2026-12-10” [eq, result]
    - meeting.time = "14:00" from “14:00” [eq, result]
    - meeting.length = "30" from “30 minutes” [eq, result]

22. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

23. [calendar · main-synthetic · train · meeting.observe] “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”  — context: Review, Calendar
  - span “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”: **answer**/ask trigger=“how many”; target calendar existing definite fill=all kind=calendars kind_span=“calendars”
    - question {"ask": "count"}

24. [calendar · main-synthetic · train · meeting.observe] “Mind telling me whether there's a calender anywhere in here?”  — context: Review, Calendar
  - span “Mind telling me whether there's a calender anywhere in here?”: **answer**/check trigger=“whether there's”; target calendar existing definite fill=all kind=calender kind_span=“calender”
    - question {"ask": "exists"}

25. [calendar · main-synthetic · train · meeting.observe] “Do we have any schedule-thingies set up over here at all?”  — context: Review, Calendar
  - span “Do we have any schedule-thingies set up over here at all?”: **answer**/check trigger=“Do we have any”; target calendar existing definite fill=all kind=schedule-thingies kind_span=“schedule-thingies”
    - question {"ask": "exists"}

26. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “Make Review a bit longer.”  — context: Review, Planning, Calendar
  - span “Make Review a bit longer.”: **change**/do trigger=“Make”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]
    - meeting.length = "(unlabelled)" from “longer” [delta, result]

27. [calendar · ui-comparatives-v1 · test · calendar.meeting.length.delta] “can the meeting be way shorter”  — context: Review, Planning, Calendar
  - span “can the meeting be way shorter”: **change**/do trigger=“be”; target meeting existing definite fill=description kind=meeting kind_span=“meeting”
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

28. [calendar · ui-comparatives-v1 · dev · calendar.meeting.length.delta] “I want it shorter”  — context: Review, Planning, Calendar
  - span “I want it shorter”: **change**/do trigger=“want”; target meeting existing definite fill=context
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

29. [calendar · ui-coverage-v2 · train · calendar.person.add] “new person: Dana”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “new person: Dana”: **make**/do (no trigger); target person new indefinite kind=person kind_span=“person”
    - person.name = "Dana" from “Dana” [eq, result]

30. [calendar · ui-coverage-v2 · train · calendar.room.change] “Board room is in the annex now”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “Board room is in the annex now”: **change**/do trigger=“is”; target room existing definite fill=written name_span=“Board room”
    - room.id = "Board room" from “Board room” [eq, selector]
    - room.location = "in the annex" from “in the annex” [eq, result]

31. [calendar · ui-coverage-v2 · train · calendar.meeting.add] “book a two hour workshop with Lee and Priya on Friday at 1pm”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “book a two hour workshop with Lee and Priya on Friday at 1pm”: **make**/do trigger=“book”; target meeting new indefinite kind=workshop kind_span=“workshop”
    - meeting.length = "2" from “two hour” [eq, result]
    - meeting.people = "Lee" from “Lee” [eq, result]
    - meeting.people = "Priya" from “Priya” [eq, result]
    - meeting.day = "Friday" from “Friday” [eq, result]
    - meeting.time = "1pm" from “1pm” [eq, result]

32. [calendar · ui-human-v1 · train · calendar.meeting.change] “set review as Weekly review”  — context: Review, Calendar
  - span “set review as Weekly review”: **change**/do trigger=“set”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Weekly review" from “Weekly review” [eq, result]

33. [calendar · ui-human-v1 · test · calendar.meeting.remove] “please delete the Review meeting”  — context: Review, Calendar
  - span “please delete the Review meeting”: **remove**/do trigger=“delete”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

34. [calendar · ui-human-v1 · train · world-informed-completion] “um, extend the event so it's twice as long”  — context: Review, Calendar
  - span “um, extend the event so it's twice as long”: **change**/do trigger=“extend”; target meeting existing definite fill=context
    - meeting.length = "2" from “twice” [factor, result]

35. [calendar · ui-natural-v1 · test · calendar.meeting.remove] “cancel the Review event”  — context: Review, Calendar
  - span “cancel the Review event”: **remove**/do trigger=“cancel”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

36. [calendar · ui-natural-v1 · train · calendar.meeting.change] “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”  — context: Review, Calendar
  - span “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”: **change**/do trigger=“None”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Team review" from “Team review” [eq, result]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]
    - meeting.length = "1" from “one hour” [eq, result]
    - meeting.notes = "Bring draft" from “Bring draft” [eq, result]

37. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

38. [diagram · demo-tool-profile · train · diagram.node.change] “Could you make Pie A purple. I appreciate it.”  — context: Pie A, Slice 1
  - span “make Pie A purple”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Pie A”
    - node.colour = "purple" from “purple” [eq, result]

39. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

40. [diagram · demo-tool-profile · train · None] “Could you add a hexagon labelled Study groups; then connect Study groups to maths; then make Study groups blue. I appreciate it.”  — context: maths
  - span “add a hexagon labelled Study groups”: **make**/do trigger=“add”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.label = "Study groups" from “Study groups” [eq, result]
  - span “connect Study groups to maths”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Study groups" from “Study groups” [eq, result]
    - link.to = "maths" from “maths” [eq, result]
  - span “make Study groups blue”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Study groups”
    - node.colour = "blue" from “blue” [eq, result]

41. [diagram · demo-tool-profile · train · chart.make] “I need you to make a scatter chart called Votes with values 16, 19 for Party A and Sample. I appreciate it.”  — context: (empty)
  - span “make a scatter chart called Votes with values 16, 19 for Party A and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=scatter kind_span=“scatter”
    - chart.title = "Votes" from “Votes” [eq, result]
    - chart.labels = "Party A and Sample" from “Party A and Sample” [eq, result]
    - chart.values = "16, 19" from “16, 19” [eq, result]

42. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Budget split with values 15, 25 for Food and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Budget split with values 15, 25 for Food and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Budget split" from “Budget split” [eq, result]
    - chart.labels = "Food and Sample" from “Food and Sample” [eq, result]
    - chart.values = "15, 25" from “15, 25” [eq, result]

43. [diagram · main-synthetic · train · diagram.node.make] “Open Items 260, 240 — add a triangle, please”  — context: link, Sales, Process
  - span “Open Items 260, 240 — add a triangle, please”: **make**/do trigger=“add”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.label = "Open Items" from “Open Items” [eq, result]
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

44. [diagram · main-synthetic · train · diagram.node.make] “add a square tiny”  — context: link, Sales, Process
  - span “add a square tiny”: **make**/do trigger=“add”; target node new indefinite kind=square kind_span=“square”
    - node.size = "tiny" from “tiny” [degree, result]

45. [diagram · main-synthetic · train · diagram.node.make] “give me a hexagon 260, 240”  — context: link, Sales, Process
  - span “give me a hexagon 260, 240”: **make**/do trigger=“give”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

46. [diagram · ui-comparatives-v1 · train · diagram.node.size.delta] “make Decision much bigger”  — context: Start, Finish, Decision
  - span “make Decision much bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Decision”
    - node.ids = "Decision" from “Decision” [eq, selector]
    - node.size = "(unlabelled)" from “bigger” [delta, result]

47. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “make the shape way narrower”  — context: Start, Finish, Decision
  - span “make the shape way narrower”: **change**/do trigger=“make”; target node existing definite fill=description kind=shape kind_span=“shape”
    - node.width = "(unlabelled)" from “narrower” [delta, result]

48. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “please make Finish a little narrower”  — context: Start, Finish, Decision
  - span “please make Finish a little narrower”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Finish”
    - node.ids = "Finish" from “Finish” [eq, selector]
    - node.width = "(unlabelled)" from “narrower” [delta, result]

49. [diagram · ui-coverage-v2 · train · diagram.node.make] “add a green circle”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “add a green circle”: **make**/do trigger=“add”; target node new indefinite kind=circle kind_span=“circle”
    - node.colour = "green" from “green” [eq, result]

50. [diagram · ui-coverage-v2 · train · diagram.node.make] “small yellow star”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “small yellow star”: **make**/do (no trigger); target node new indefinite kind=star kind_span=“star”
    - node.size = "small" from “small” [degree, result]
    - node.colour = "yellow" from “yellow” [eq, result]

51. [diagram · ui-coverage-v2 · train · diagram.group.layout] “arrange the Approval steps group in a column”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “arrange the Approval steps group in a column”: **arrange**/do trigger=“arrange”; target group existing definite fill=written name_span=“Approval steps”
    - group.id = "Approval steps" from “Approval steps” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

52. [diagram · ui-human-v1 · train · diagram.observe] “hmm, I can't remember what I drew, what's in this diagram?”  — context: link, Sales, Process
  - span “hmm, I can't remember what I drew, what's in this diagram?”: **answer**/ask trigger=“what's”; target sketch existing definite fill=context
    - question {"ask": "describe"}

53. [diagram · ui-human-v1 · train · diagram.group.change] “turn the members of g1 blue and large and label it Updated process”  — context: Process, link, Sales
  - span “turn the members of g1 blue and large and label it Updated process”: **change**/do trigger=“turn”; target group existing definite fill=written name_span=“g1”
    - group.id = "g1" from “g1” [eq, selector]
    - group.label = "Updated process" from “Updated process” [eq, result]
    - group.colour = "blue" from “blue” [eq, result]
    - group.size = "large" from “large” [degree, result]

54. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **arrange**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

55. [diagram · ui-human-v1 · train · diagram.group.chart.make] “let's graph Sales: A comes to 3, B comes to 7”  — context: Sales, B, A, link, Process
  - span “let's graph Sales: A comes to 3, B comes to 7”: **make**/do trigger=“graph”; target group new indefinite
    - group.label = "Sales" from “Sales” [eq, result]
    - group.labels = "A" from “A” [eq, result]
    - group.labels = "B" from “B” [eq, result]
    - group.values = "3" from “3” [eq, result]
    - group.values = "7" from “7” [eq, result]

56. [diagram · ui-natural-v1 · train · diagram.group.layout] “stack the Process group vertically”  — context: Process, link, Sales
  - span “stack the Process group vertically”: **arrange**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

57. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **arrange**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

58. [diagram · ui-natural-v1 · dev · diagram.node.change] “update the Start box, labelled Approval, with value 12”  — context: Start, link, Sales, Process
  - span “update the Start box, labelled Approval, with value 12”: **change**/do trigger=“update”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.label = "Approval" from “Approval” [eq, result]
    - node.value = "12" from “12” [eq, result]

59. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

60. [document · demo-tool-profile · train · None] “Could you make a heading called Report; then add a paragraph saying "The delivery arrived this morning.". I appreciate it.”  — context: Draft, Report, Summary
  - span “make a heading called Report”: **make**/do trigger=“make”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Report" from “Report” [eq, result]
  - span “add a paragraph saying "The delivery arrived this morning."”: **make**/do trigger=“add”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

61. [document · demo-tool-profile · train · document.block.change] “Could you replace Meeting recap with "The room is available after lunch.". Thanks!”  — context: Draft, Meeting recap, Summary points
  - span “replace Meeting recap with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Meeting recap”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

62. [document · demo-tool-profile · train · None] “Hey, compose a report about Deposit in approximately 13 words. That would help.”  — context: Draft, Deposit, Lease
  - span “compose a report about Deposit in approximately 13 words”: **make**/do trigger=“compose”; target text new indefinite kind=report kind_span=“report”
    - text.about = "Deposit" from “Deposit” [eq, result]
    - text.words = "13" from “approximately 13 words” [eq, result]

63. [document · demo-tool-profile · train · None] “I need you to move Intro after List. I appreciate it.”  — context: Draft, Intro, List
  - span “move Intro after List”: **place**/do trigger=“move”; target section existing definite fill=written name_span=“Intro”
    - section.order = "after" from “after” [relation, result]

64. [document · main-synthetic · train · block.observe] “Any top-of-page title pieces at all in this one?”  — context: Notes
  - span “Any top-of-page title pieces at all in this one?”: **answer**/check trigger=“Any”; target block existing definite fill=all kind=top-of-page title pieces kind_span=“top-of-page title pieces”
    - question {"ask": "exists"}

65. [document · main-synthetic · train · block.observe] “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”  — context: Notes
  - span “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”: **answer**/ask trigger=“how many”; target block existing definite fill=all kind=quote kind_span=“quote”
    - question {"ask": "count"}

66. [document · main-synthetic · test · block.observe] “Tell me the number of paragraphs.”  — context: Notes
  - span “Tell me the number of paragraphs.”: **answer**/ask trigger=“number”; target block existing definite fill=all kind=paragraph kind_span=“paragraph”
    - question {"ask": "count"}

67. [document · ui-coverage-v2 · train · document.observe] “what does the Budget table contain?”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “what does the Budget table contain?”: **answer**/ask trigger=“what”; target document existing definite fill=written name_span=“Budget”
    - question {"ask": "describe"}

68. [document · ui-coverage-v2 · test · document.undo] “the new heading looks worse than before, so take back that last step”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “take back that last step”: **undo**/do trigger=“take back”; target document existing definite fill=journal_step

69. [document · ui-coverage-v2 · dev · document.compose] “a quick note for the neighbours about the party, 60 words max”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “a quick note for the neighbours about the party, 60 words max”: **make**/do (no trigger); target text new indefinite
    - text.genre = "note" from “note” [eq, result]
    - text.about = "about the party" from “about the party” [eq, result]
    - text.words = "60" from “60 words max” [eq, result]

70. [document · ui-human-v1 · train · document.block.mark] “turn the start of b2 bold”  — context: paragraph, paragraph, Notes
  - span “turn the start of b2 bold”: **change**/do trigger=“turn”; target block existing definite fill=written name_span=“b2”
    - block.id = "b2" from “b2” [eq, selector]
    - block.mark = "bold" from “bold” [eq, result]

71. [document · ui-human-v1 · train · document.block.make] “ok, the customer needs to know, so write a paragraph that says The delivery is late.”  — context: paragraph, paragraph, Notes
  - span “ok, the customer needs to know, so write a paragraph that says The delivery is late.”: **make**/do trigger=“write”; target block new indefinite kind=paragraph kind_span=“paragraph”
    - block.text = "The delivery is late." from “The delivery is late.” [eq, result]

72. [document · ui-human-v1 · train · compound] “change the chapter heading to Overview and tidy the first paragraph”  — context: paragraph, paragraph, Notes
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=description kind=chapter kind_span=“chapter”
    - section.text = "Overview" from “Overview” [eq, result]
  - span “tidy”: **change**/do trigger=“tidy”; target block existing definite fill=context

73. [document · ui-human-v1 · train · document.list.change] “edit the Tasks list”  — context: Tasks, Notes
  - span “edit the Tasks list”: **change**/do trigger=“edit”; target block existing definite fill=written name_span=“Tasks”
    - block.id = "Tasks" from “Tasks” [eq, selector]

74. [document · ui-natural-v1 · train · document.section.change] “give b1 the heading Overview at level 1”  — context: Notes
  - span “give b1 the heading Overview at level 1”: **change**/do trigger=“give”; target section existing definite fill=written name_span=“b1”
    - section.id = "b1" from “b1” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]
    - section.level = "1" from “level 1” [eq, result]

75. [document · ui-natural-v1 · dev · document.table.make] “Budget table: header Item,Cost; row Paper,12”  — context: Budget, Notes
  - span “Budget table: header Item,Cost; row Paper,12”: **make**/do trigger=“None”; target block new indefinite
    - block.name = "Budget" from “Budget” [eq, result]
    - block.rows = "Item" from “Item” [eq, result]
    - block.rows = "Cost" from “Cost” [eq, result]
    - block.rows = "Paper" from “Paper” [eq, result]
    - block.rows = "12" from “12” [eq, result]
    - block.header = "true" from “header Item” [eq, result]

76. [document · ui-natural-v1 · train · document.section.change] “update the Chapter heading, with text Overview”  — context: Budget 1:1, Budget 1:0, Budget 0:1, Budget 0:0, Tasks 1, Tasks 0
  - span “update the Chapter heading, with text Overview”: **change**/do trigger=“update”; target section existing definite fill=written name_span=“Chapter”
    - section.id = "Chapter" from “Chapter” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]

77. [drawing · demo-tool-profile · train · drawing.object.make] “Let us create a orange fish and call it cyclist. That would help.”  — context: traffic light
  - span “create a orange fish and call it cyclist”: **make**/do trigger=“create”; target drawn new indefinite kind=fish kind_span=“fish”
    - drawn.colour = "orange" from “orange” [eq, result]
    - drawn.name = "cyclist" from “cyclist” [eq, result]

78. [drawing · demo-tool-profile · dev · None] “place duck pond to the left of barn.”  — context: duck pond, barn
  - span “place duck pond to the left of barn”: **place**/do trigger=“place”; target drawn existing definite fill=written name_span=“duck pond”
    - drawn.relation = "left_of" from “to the left of” [relation, result]
    - drawn.anchor = "barn" from “barn” [relation, selector]

79. [drawing · demo-tool-profile · dev · drawing.object.change] “Let us make Mo red. That would help.”  — context: Mo, Pip
  - span “make Mo red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Mo”
    - drawn.colour = "red" from “red” [eq, result]

80. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

81. [drawing · main-synthetic · train · drawing.object.make] “can you add a napkin?”  — context: House, Box, Circle
  - span “can you add a napkin?”: **make**/do trigger=“add”; target drawn new indefinite kind=napkin kind_span=“napkin”

82. [drawing · main-synthetic · train · drawing.catalog.make] “I'd like a salmon”  — context: House, Box, Circle
  - span “I'd like a salmon”: **make**/do (no trigger); target drawn new indefinite kind=salmon kind_span=“salmon”

83. [drawing · main-synthetic · dev · drawing.object.make] “I could use a masts here”  — context: House, Box, Circle
  - span “I could use a masts here”: **make**/do trigger=“use”; target drawn new indefinite kind=masts kind_span=“masts”

84. [drawing · main-synthetic · train · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

85. [drawing · ui-comparatives-v1 · train · drawing.drawn.size.delta] “The box should be bigger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “The box should be bigger”: **change**/do trigger=“should be”; target drawn existing definite fill=description kind=box kind_span=“box”
    - drawn.size = "(unlabelled)" from “bigger” [delta, result]

86. [drawing · ui-comparatives-v1 · dev · drawing.drawn.size.delta] “make the lake a bit larger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “make the lake a bit larger”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.size = "(unlabelled)" from “larger” [delta, result]

87. [drawing · ui-comparatives-v1 · train · drawing.drawn.width.delta] “I want the lake a little narrower”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “I want the lake a little narrower”: **change**/do trigger=“want”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.width = "(unlabelled)" from “narrower” [delta, result]

88. [drawing · ui-coverage-v2 · train · drawing.object.make] “white cloud, size 50”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “white cloud, size 50”: **make**/do (no trigger); target drawn new indefinite kind=cloud kind_span=“cloud”
    - drawn.colour = "white" from “white” [eq, result]
    - drawn.size = "50" from “size 50” [eq, result]

89. [drawing · ui-coverage-v2 · train · drawing.object.change] “rename it something fun”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “rename it something fun”: **change**/do trigger=“rename”; target drawn existing definite fill=context
    - drawn.name = "(unlabelled)" from “something fun” [eq, result]

90. [drawing · ui-coverage-v2 · dev · drawing.objects.select] “I want to move these together, so select the red car and the road”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “I want to move these together, so select the red car and the road”: **select**/do trigger=“select”; target drawn existing definite fill=written name_span=“red car”
    - drawn.ids = "red car" from “red car” [eq, selector]
    - drawn.ids = "road" from “road” [eq, selector]

91. [drawing · ui-coverage-v2 · train · drawing.part.place] “the front wheel of the red car slipped; move it back to x 320, y 430”  — context: House, roof of the house, door of the house, window of the house, chimney of the house, Red car
  - span “the front wheel of the red car slipped; move it back to x 320, y 430”: **place**/do trigger=“move”; target part existing definite fill=written name_span=“front wheel”
    - part.id = "the red car" from “the red car” [eq, selector]
    - part.x = "320" from “x 320” [eq, result]
    - part.y = "430" from “y 430” [eq, result]

92. [drawing · ui-human-v1 · train · drawing.object.change] “recolor the house”  — context: House, Box, Circle
  - span “recolor the house”: **change**/do trigger=“recolor”; target drawn existing definite fill=description kind=house kind_span=“house”

93. [drawing · ui-human-v1 · train · drawing.part.change] “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”  — context: Box, Circle, House
  - span “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“o1”
    - part.id = "o1" from “o1” [eq, selector]
    - part.index = "0" from “part 0” [eq, result]
    - part.colour = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

94. [drawing · ui-human-v1 · test · world-informed-completion] “I need a tree next to the house”  — context: House, Box, Circle
  - span “I need a tree next to the house”: **make**/do trigger=“need”; target drawn new indefinite kind=tree kind_span=“tree”
    - drawn.relation = "next_to" from “next to” [relation, result]
    - drawn.anchor = "the house" from “the house” [relation, selector]

95. [drawing · ui-natural-v1 · train · drawing.catalog.make] “draw me a chair”  — context: Box, Circle, House
  - span “draw me a chair”: **make**/do trigger=“draw”; target drawn new indefinite kind=chair kind_span=“chair”

96. [drawing · ui-natural-v1 · train · drawing.part.change] “give the first house component a red colour and dimensions of 90 by 45”  — context: House, Box, Circle
  - span “give the first house component a red colour and dimensions of 90 by 45”: **change**/do trigger=“give”; target part existing definite fill=written name_span=“house” ordinal=first
    - part.id = "house" from “house” [eq, selector]
    - part.colour = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

97. [drawing · ui-natural-v1 · train · drawing.object.make] “draw a house, 160 wide, size 80, labelled Home”  — context: House, Box, Circle
  - span “draw a house, 160 wide, size 80, labelled Home”: **make**/do trigger=“draw”; target drawn new indefinite kind=house kind_span=“house”
    - drawn.width = "160" from “160” [eq, result]
    - drawn.size = "80" from “80” [eq, result]
    - drawn.label = "Home" from “Home” [eq, result]

98. [drawing · ui-relations-v1 · train · drawing.object.make] “give me a stump under that tree”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “give me a stump under that tree”: **make**/do trigger=“me”; target drawn new indefinite kind=stump kind_span=“stump”
    - drawn.relation = "below" from “under” [relation, result]
    - drawn.anchor = "that tree" from “that tree” [relation, selector]

99. [drawing · ui-relations-v1 · dev · drawing.object.make] “please put an angelfish inside the lake, please”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put an angelfish inside the lake, please”: **make**/do trigger=“put”; target drawn new indefinite kind=angelfish kind_span=“angelfish”
    - drawn.relation = "in" from “inside” [relation, result]
    - drawn.anchor = "the lake" from “the lake” [relation, selector]

100. [drawing · ui-relations-v1 · test · drawing.object.make] “please put a freighter in the lake there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put a freighter in the lake there”: **make**/do trigger=“put”; target drawn new indefinite kind=freighter kind_span=“freighter”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake there" from “the lake there” [relation, selector]
