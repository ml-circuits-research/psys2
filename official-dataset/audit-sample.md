# Audit sample

100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.

1. [avatar · demo-tool-profile · train · avatar.part.change] “please set the "mouth" part using the pressed variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “please set the "mouth" part using the pressed variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "mouth" from “"mouth"” [eq, result]
    - part.variant = "pressed" from “pressed” [eq, result]

2. [avatar · demo-tool-profile · dev · avatar.part.change] “please set the "nose" part using the wide variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “please set the "nose" part using the wide variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "nose" from “"nose"” [eq, result]
    - part.variant = "wide" from “wide” [eq, result]

3. [avatar · demo-tool-profile · train · avatar.part.change] “make the neck and ears and head and cheeks and nose tan”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “make the neck and ears and head and cheeks and nose tan”: **change**/do trigger=“make”; target part existing definite fill=written
    - part.ids = "neck and ears and head and cheeks and nose" from “neck and ears and head and cheeks and nose” [eq, result]
    - part.colour = "tan" from “tan” [eq, result]

4. [avatar · demo-tool-profile · train · avatar.part.change] “set the "hat" part to the top hat variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “set the "hat" part to the top hat variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "hat" from “"hat"” [eq, result]
    - part.variant = "top hat" from “top hat” [eq, result]

5. [avatar · main-synthetic · train · avatar.face.preset] “fix a gril face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “fix a gril face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "girl" from “gril” [eq, result]
    - face.id = "face" from “face” [eq, selector]

6. [avatar · main-synthetic · train · avatar.face.preset] “can you change a woman face?”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “can you change a woman face?”: **change**/do trigger=“change”; target face existing definite fill=written name_span=“face”
    - face.preset = "woman" from “woman” [eq, result]
    - face.id = "face" from “face” [eq, selector]

7. [avatar · main-synthetic · dev · avatar.face.preset] “a man for me, face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “a man for me, face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "man" from “man” [eq, result]
    - face.id = "face" from “face” [eq, selector]

8. [avatar · main-synthetic · train · avatar.part.add] “add a hadlebar moustache”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “add a hadlebar moustache”: **make**/do trigger=“add”; target part new indefinite
    - part.id = "moustache" from “moustache” [eq, result]
    - part.variant = "handlebar" from “hadlebar” [eq, result]

9. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “could you make the ears larger”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “could you make the ears larger”: **change**/do trigger=“make”; target part existing definite fill=description kind=ears kind_span=“ears”
    - part.size = "(unlabelled)" from “larger” [delta, result]

10. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “could you make the head a lot larger”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “could you make the head a lot larger”: **change**/do trigger=“make”; target part existing definite fill=description kind=head kind_span=“head”
    - part.size = "(unlabelled)" from “larger” [delta, result]

11. [avatar · ui-comparatives-v1 · dev · avatar.part.size.delta] “make the ears a lot smaller”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “make the ears a lot smaller”: **change**/do trigger=“make”; target part existing definite fill=description kind=ears kind_span=“ears”
    - part.size = "(unlabelled)" from “smaller” [delta, result]

12. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “please make the mouth a lot tinier”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “please make the mouth a lot tinier”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.size = "(unlabelled)" from “tinier” [delta, result]

13. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.scale = "1.1" from “1.1” [eq, result]

14. [avatar · ui-human-v1 · train · avatar.part.add] “put on a cap”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “put on a cap”: **make**/do trigger=“put”; target part new indefinite
    - part.variant = "cap" from “cap” [eq, result]

15. [avatar · ui-human-v1 · test · avatar.face.compose] “would be nice to have a human avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “would be nice to have a human avatar”: **change**/do trigger=“have”; target face existing definite fill=written name_span=“avatar”
    - face.characterKind = "human" from “human” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

16. [avatar · ui-human-v1 · train · world-informed-completion] “can you make the avatar look happier?”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “can you make the avatar look happier?”: **change**/do trigger=“make”; target face existing definite fill=context
    - face.expression = "happy" from “happier” [delta, result]

17. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=written name_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

18. [avatar · ui-natural-v1 · train · avatar.part.add] “give the avatar closed eyes”  — context: Avatar, earrings, hair front, eyebrows, nose, mouth
  - span “give the avatar closed eyes”: **make**/do trigger=“give”; target part new indefinite
    - part.id = "eyes" from “eyes” [eq, result]
    - part.variant = "closed" from “closed” [eq, result]

19. [avatar · ui-natural-v1 · test · avatar.part.add] “use visor for the glasses”  — context: earrings, hair front, eyebrows, eyes, nose, mouth
  - span “use visor for the glasses”: **make**/do trigger=“use”; target part new indefinite
    - part.id = "glasses" from “glasses” [eq, result]
    - part.variant = "visor" from “visor” [eq, result]

20. [avatar · ui-natural-v1 · train · avatar.face.expression] “give the avatar a happy look”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “give the avatar a happy look”: **change**/do trigger=“give”; target face existing definite fill=written name_span=“avatar”
    - face.expression = "happy" from “happy” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

21. [calendar · demo-tool-profile · train · calendar.meeting.move] “Please, place Review to 2026-12-09 at 13:00 UTC. Thanks!”  — context: Work 5, Focus room, Review
  - span “place Review to 2026-12-09 at 13:00 UTC”: **place**/do trigger=“place”; target meeting existing definite fill=written name_span=“Review”
    - meeting.day = "2026-12-09" from “2026-12-09” [eq, result]
    - meeting.time = "13:00" from “13:00” [eq, result]

22. [calendar · demo-tool-profile · train · calendar.meeting.add] “Please, put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes. Thanks!”  — context: Work 6, Living room
  - span “put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes”: **make**/do trigger=“put”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 6" from “Work 6” [eq, result]
    - meeting.day = "2026-12-10" from “2026-12-10” [eq, result]
    - meeting.time = "14:00" from “14:00” [eq, result]
    - meeting.length = "30" from “30 minutes” [eq, result]

23. [calendar · demo-tool-profile · train · None] “Please, which events are on Work 5 on 2026-12-01?. Thanks!”  — context: Work 5, Study, Review
  - span “which events are on Work 5 on 2026-12-01?”: **answer**/ask trigger=“which”; target meeting existing definite fill=description
    - question {"ask": "list"}
    - meeting.calendar = "Work 5" from “Work 5” [eq, selector]
    - meeting.day = "2026-12-01" from “2026-12-01” [eq, selector]

24. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

25. [calendar · main-synthetic · train · meeting.observe] “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”  — context: Review, Calendar
  - span “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”: **answer**/ask trigger=“how many”; target calendar existing definite fill=all kind=calendars kind_span=“calendars”
    - question {"ask": "count"}

26. [calendar · main-synthetic · train · meeting.observe] “Mind telling me whether there's a calender anywhere in here?”  — context: Review, Calendar
  - span “Mind telling me whether there's a calender anywhere in here?”: **answer**/check trigger=“whether there's”; target calendar existing definite fill=all kind=calender kind_span=“calender”
    - question {"ask": "exists"}

27. [calendar · main-synthetic · train · meeting.observe] “Do we have any schedule-thingies set up over here at all?”  — context: Review, Calendar
  - span “Do we have any schedule-thingies set up over here at all?”: **answer**/check trigger=“Do we have any”; target calendar existing definite fill=all kind=schedule-thingies kind_span=“schedule-thingies”
    - question {"ask": "exists"}

28. [calendar · main-synthetic · train · meeting.observe] “How many meetings are there?”  — context: Review, Calendar
  - span “How many meetings are there?”: **answer**/ask trigger=“How many”; target meeting existing definite fill=all kind=meeting kind_span=“meeting”
    - question {"ask": "count"}

29. [calendar · ui-comparatives-v1 · dev · calendar.meeting.length.delta] “please make the event a little longer”  — context: Review, Planning, Calendar
  - span “please make the event a little longer”: **change**/do trigger=“make”; target meeting existing definite fill=description kind=event kind_span=“event”
    - meeting.length = "(unlabelled)" from “longer” [delta, result]

30. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “Make Review a bit longer.”  — context: Review, Planning, Calendar
  - span “Make Review a bit longer.”: **change**/do trigger=“Make”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]
    - meeting.length = "(unlabelled)" from “longer” [delta, result]

31. [calendar · ui-comparatives-v1 · dev · calendar.meeting.length.delta] “can the meeting be way shorter”  — context: Review, Planning, Calendar
  - span “can the meeting be way shorter”: **change**/do trigger=“be”; target meeting existing definite fill=description kind=meeting kind_span=“meeting”
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

32. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “I want it shorter”  — context: Review, Planning, Calendar
  - span “I want it shorter”: **change**/do trigger=“want”; target meeting existing definite fill=context
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

33. [calendar · ui-human-v1 · train · calendar.event.select] “open Review”  — context: Review, Calendar
  - span “open Review”: **select**/do trigger=“open”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

34. [calendar · ui-human-v1 · train · calendar.meeting.change] “set review as Weekly review”  — context: Review, Calendar
  - span “set review as Weekly review”: **change**/do trigger=“set”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Weekly review" from “Weekly review” [eq, result]

35. [calendar · ui-human-v1 · train · calendar.meeting.remove] “please delete the Review meeting”  — context: Review, Calendar
  - span “please delete the Review meeting”: **remove**/do trigger=“delete”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

36. [calendar · ui-human-v1 · train · world-informed-completion] “um, extend the event so it's twice as long”  — context: Review, Calendar
  - span “um, extend the event so it's twice as long”: **change**/do trigger=“extend”; target meeting existing definite fill=context
    - meeting.length = "2" from “twice” [factor, result]

37. [calendar · ui-natural-v1 · train · calendar.meeting.remove] “cancel the Review event”  — context: Review, Calendar
  - span “cancel the Review event”: **remove**/do trigger=“cancel”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

38. [calendar · ui-natural-v1 · train · calendar.meeting.change] “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”  — context: Review, Calendar
  - span “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”: **change**/do trigger=“None”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Team review" from “Team review” [eq, result]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]
    - meeting.duration = "1" from “one hour” [eq, result]
    - meeting.notes = "Bring draft" from “Bring draft” [eq, result]

39. [calendar · ui-natural-v1 · train · calendar.meeting.move] “shift Review to 2026-11-18 at 10:00 UTC”  — context: Review, Calendar
  - span “shift Review to 2026-11-18 at 10:00 UTC”: **place**/do trigger=“shift”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]

40. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

41. [diagram · demo-tool-profile · train · chart.make] “Hey, make a line chart called Cook 1 with values 28, 26 for Cook 2 and Sample. That would help.”  — context: (empty)
  - span “make a line chart called Cook 1 with values 28, 26 for Cook 2 and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=line kind_span=“line”
    - chart.title = "Cook 1" from “Cook 1” [eq, result]
    - chart.labels = "Cook 2 and Sample" from “Cook 2 and Sample” [eq, result]
    - chart.values = "28, 26" from “28, 26” [eq, result]

42. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

43. [diagram · demo-tool-profile · train · None] “Could you add a hexagon labelled Study groups; then connect Study groups to maths; then make Study groups blue. I appreciate it.”  — context: maths
  - span “add a hexagon labelled Study groups”: **make**/do trigger=“add”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.label = "Study groups" from “Study groups” [eq, result]
  - span “connect Study groups to maths”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Study groups" from “Study groups” [eq, result]
    - link.to = "maths" from “maths” [eq, result]
  - span “make Study groups blue”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Study groups”
    - node.colour = "blue" from “blue” [eq, result]

44. [diagram · demo-tool-profile · train · chart.make] “I need you to make a scatter chart called Votes with values 16, 19 for Party A and Sample. I appreciate it.”  — context: (empty)
  - span “make a scatter chart called Votes with values 16, 19 for Party A and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=scatter kind_span=“scatter”
    - chart.title = "Votes" from “Votes” [eq, result]
    - chart.labels = "Party A and Sample" from “Party A and Sample” [eq, result]
    - chart.values = "16, 19" from “16, 19” [eq, result]

45. [diagram · main-synthetic · train · diagram.node.make] “diamond too”  — context: link, Sales, Process
  - span “diamond too”: **make**/do (no trigger); target node new indefinite kind=diamond kind_span=“diamond”

46. [diagram · main-synthetic · train · diagram.node.make] “Open Items 260, 240 — add a triangle, please”  — context: link, Sales, Process
  - span “Open Items 260, 240 — add a triangle, please”: **make**/do trigger=“add”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.label = "Open Items" from “Open Items” [eq, result]
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

47. [diagram · main-synthetic · train · diagram.node.make] “add a square tiny”  — context: link, Sales, Process
  - span “add a square tiny”: **make**/do trigger=“add”; target node new indefinite kind=square kind_span=“square”
    - node.size = "tiny" from “tiny” [degree, result]

48. [diagram · main-synthetic · dev · diagram.node.make] “give me a hexagon 260, 240”  — context: link, Sales, Process
  - span “give me a hexagon 260, 240”: **make**/do trigger=“give”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

49. [diagram · ui-comparatives-v1 · train · diagram.node.size.delta] “make Decision much bigger”  — context: Start, Finish, Decision
  - span “make Decision much bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Decision”
    - node.ids = "Decision" from “Decision” [eq, selector]
    - node.size = "(unlabelled)" from “bigger” [delta, result]

50. [diagram · ui-comparatives-v1 · dev · diagram.node.width.delta] “can you make it a little bit wider”  — context: Start, Finish, Decision
  - span “can you make it a little bit wider”: **change**/do trigger=“make”; target node existing definite fill=context
    - node.width = "(unlabelled)" from “wider” [delta, result]

51. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “make the shape way narrower”  — context: Start, Finish, Decision
  - span “make the shape way narrower”: **change**/do trigger=“make”; target node existing definite fill=description kind=shape kind_span=“shape”
    - node.width = "(unlabelled)" from “narrower” [delta, result]

52. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “please make Finish a little narrower”  — context: Start, Finish, Decision
  - span “please make Finish a little narrower”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Finish”
    - node.ids = "Finish" from “Finish” [eq, selector]
    - node.width = "(unlabelled)" from “narrower” [delta, result]

53. [diagram · ui-human-v1 · train · diagram.observe] “hmm, I can't remember what I drew, what's in this diagram?”  — context: link, Sales, Process
  - span “hmm, I can't remember what I drew, what's in this diagram?”: **answer**/ask trigger=“what's”; target sketch existing definite fill=context
    - question {"ask": "describe"}

54. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **place**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

55. [diagram · ui-human-v1 · train · diagram.group.chart.make] “let's graph Sales: A comes to 3, B comes to 7”  — context: Sales, B, A, link, Process
  - span “let's graph Sales: A comes to 3, B comes to 7”: **make**/do trigger=“graph”; target group new indefinite
    - group.label = "Sales" from “Sales” [eq, result]
    - group.labels = "A" from “A” [eq, result]
    - group.labels = "B" from “B” [eq, result]
    - group.values = "3" from “3” [eq, result]
    - group.values = "7" from “7” [eq, result]

56. [diagram · ui-human-v1 · train · compound] “move r1 near the top left, then make the Start box bigger”  — context: Start, link, Sales, Process
  - span “move r1 near the top left”: **place**/do trigger=“move”; target node existing definite fill=written name_span=“r1”
    - node.ids = "r1" from “r1” [eq, selector]
    - node.x = "(unlabelled)" from “near the top left” [eq, result]
    - node.y = "(unlabelled)" from “near the top left” [eq, result]
  - span “make the Start box bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.width = "(unlabelled)" from “bigger” [delta, result]
    - node.height = "(unlabelled)" from “bigger” [delta, result]

57. [diagram · ui-natural-v1 · train · diagram.group.layout] “stack the Process group vertically”  — context: Process, link, Sales
  - span “stack the Process group vertically”: **place**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

58. [diagram · ui-natural-v1 · train · diagram.node.make] “create a square node named Step”  — context: A, link, Sales, Process
  - span “create a square node named Step”: **make**/do trigger=“create”; target node new indefinite kind=square kind_span=“square”
    - node.label = "Step" from “Step” [eq, result]

59. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **place**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

60. [diagram · ui-natural-v1 · dev · diagram.node.change] “update the Start box, labelled Approval, with value 12”  — context: Start, link, Sales, Process
  - span “update the Start box, labelled Approval, with value 12”: **change**/do trigger=“update”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.label = "Approval" from “Approval” [eq, result]
    - node.value = "12" from “12” [eq, result]

61. [document · demo-tool-profile · train · None] “I need you to add a heading called Delivered wrongly; then create a paragraph saying "Please check the final figures.". I appreciate it.”  — context: Draft, Delivered wrongly, Tracking log
  - span “add a heading called Delivered wrongly”: **make**/do trigger=“add”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Delivered wrongly" from “Delivered wrongly” [eq, result]
  - span “create a paragraph saying "Please check the final figures."”: **make**/do trigger=“create”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "Please check the final figures." from “Please check the final figures.” [eq, result]

62. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

63. [document · demo-tool-profile · train · None] “Could you make a heading called Report; then add a paragraph saying "The delivery arrived this morning.". I appreciate it.”  — context: Draft, Report, Summary
  - span “make a heading called Report”: **make**/do trigger=“make”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Report" from “Report” [eq, result]
  - span “add a paragraph saying "The delivery arrived this morning."”: **make**/do trigger=“add”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

64. [document · demo-tool-profile · train · None] “I need you to move Intro after List. I appreciate it.”  — context: Draft, Intro, List
  - span “move Intro after List”: **place**/do trigger=“move”; target section existing definite fill=written name_span=“Intro”
    - section.order = "after" from “after” [relation, result]

65. [document · main-synthetic · train · document.section.change] “Name Main, level 2, justify — apply that to heading Intro”  — context: Intro, Notes
  - span “Name Main, level 2, justify — apply that to heading Intro”: **change**/do trigger=“Name”; target section existing definite fill=written name_span=“Intro”
    - section.id = "Intro" from “Intro” [eq, selector]
    - section.name = "Main" from “Main” [eq, result]
    - section.level = "2" from “2” [eq, result]
    - section.align = "justify" from “justify” [eq, result]

66. [document · main-synthetic · train · block.observe] “Any top-of-page title pieces at all in this one?”  — context: Notes
  - span “Any top-of-page title pieces at all in this one?”: **answer**/check trigger=“Any”; target block existing definite fill=all kind=top-of-page title pieces kind_span=“top-of-page title pieces”
    - question {"ask": "exists"}

67. [document · main-synthetic · train · block.observe] “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”  — context: Notes
  - span “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”: **answer**/ask trigger=“how many”; target block existing definite fill=all kind=quote kind_span=“quote”
    - question {"ask": "count"}

68. [document · main-synthetic · test · block.observe] “Tell me the number of paragraphs.”  — context: Notes
  - span “Tell me the number of paragraphs.”: **answer**/ask trigger=“number”; target block existing definite fill=all kind=paragraph kind_span=“paragraph”
    - question {"ask": "count"}

69. [document · ui-human-v1 · train · document.block.mark] “I want the first word of paragraph b2 set in bold”  — context: paragraph, paragraph, Notes
  - span “I want the first word of paragraph b2 set in bold”: **change**/do trigger=“set”; target block existing definite fill=written name_span=“b2”
    - block.id = "b2" from “b2” [eq, selector]
    - block.mark = "bold" from “bold” [eq, result]

70. [document · ui-human-v1 · train · document.block.make] “ok, the customer needs to know, so write a paragraph that says The delivery is late.”  — context: paragraph, paragraph, Notes
  - span “ok, the customer needs to know, so write a paragraph that says The delivery is late.”: **make**/do trigger=“write”; target block new indefinite kind=paragraph kind_span=“paragraph”
    - block.text = "The delivery is late." from “The delivery is late.” [eq, result]

71. [document · ui-human-v1 · train · compound] “change the chapter heading to Overview and tidy the first paragraph”  — context: paragraph, paragraph, Notes
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=description kind=chapter kind_span=“chapter”
    - section.text = "Overview" from “Overview” [eq, result]
  - span “tidy”: **change**/do trigger=“tidy”; target block existing definite fill=context

72. [document · ui-human-v1 · train · document.list.change] “edit the Tasks list”  — context: Tasks, Notes
  - span “edit the Tasks list”: **change**/do trigger=“edit”; target block existing definite fill=written name_span=“Tasks”
    - block.id = "Tasks" from “Tasks” [eq, selector]

73. [document · ui-natural-v1 · train · document.section.change] “give b1 the heading Overview at level 1”  — context: Notes
  - span “give b1 the heading Overview at level 1”: **change**/do trigger=“give”; target section existing definite fill=written name_span=“b1”
    - section.id = "b1" from “b1” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]
    - section.level = "1" from “level 1” [eq, result]

74. [document · ui-natural-v1 · test · document.table.make] “Budget table: header Item,Cost; row Paper,12”  — context: Budget, Notes
  - span “Budget table: header Item,Cost; row Paper,12”: **make**/do trigger=“None”; target block new indefinite
    - block.name = "Budget" from “Budget” [eq, result]
    - block.rows = "Item" from “Item” [eq, result]
    - block.rows = "Cost" from “Cost” [eq, result]
    - block.rows = "Paper" from “Paper” [eq, result]
    - block.rows = "12" from “12” [eq, result]
    - block.header = "true" from “header Item” [eq, result]

75. [document · ui-natural-v1 · train · document.block.change] “set the first paragraph to Revised paragraph with object name Summary and justified alignment”  — context: paragraph, paragraph, Notes
  - span “set the first paragraph to Revised paragraph with object name Summary and justified alignment”: **change**/do trigger=“set”; target block existing definite fill=context
    - block.text = "Revised paragraph" from “Revised paragraph” [eq, result]
    - block.name = "Summary" from “Summary” [eq, result]
    - block.align = "justify" from “justified” [eq, result]

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

79. [drawing · demo-tool-profile · test · drawing.object.change] “Could you make sun red. Thanks!”  — context: sun, sea
  - span “make sun red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“sun”
    - drawn.colour = "red" from “red” [eq, result]

80. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

81. [drawing · main-synthetic · train · drawing.object.make] “can you add a napkin?”  — context: House, Box, Circle
  - span “can you add a napkin?”: **make**/do trigger=“add”; target drawn new indefinite kind=napkin kind_span=“napkin”

82. [drawing · main-synthetic · train · drawing.catalog.make] “I'd like a salmon”  — context: House, Box, Circle
  - span “I'd like a salmon”: **make**/do (no trigger); target drawn new indefinite kind=salmon kind_span=“salmon”

83. [drawing · main-synthetic · test · drawing.object.make] “rounding this off with a cradle”  — context: House, Box, Circle
  - span “rounding this off with a cradle”: **make**/do (no trigger); target drawn new indefinite kind=cradle kind_span=“cradle”

84. [drawing · main-synthetic · dev · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

85. [drawing · ui-comparatives-v1 · train · drawing.drawn.size.delta] “The box should be bigger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “The box should be bigger”: **change**/do trigger=“should be”; target drawn existing definite fill=description kind=box kind_span=“box”
    - drawn.size = "(unlabelled)" from “bigger” [delta, result]

86. [drawing · ui-comparatives-v1 · test · drawing.drawn.size.delta] “make the lake a bit larger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “make the lake a bit larger”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.size = "(unlabelled)" from “larger” [delta, result]

87. [drawing · ui-comparatives-v1 · train · drawing.drawn.width.delta] “I want the lake a little narrower”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “I want the lake a little narrower”: **change**/do trigger=“want”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.width = "(unlabelled)" from “narrower” [delta, result]

88. [drawing · ui-comparatives-v1 · train · drawing.drawn.height.delta] “can you make Circle a little bit shorter”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “can you make Circle a little bit shorter”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Circle”
    - drawn.ids = "Circle" from “Circle” [eq, selector]
    - drawn.height = "(unlabelled)" from “shorter” [delta, result]

89. [drawing · ui-human-v1 · train · drawing.object.change] “recolor the house”  — context: House, Box, Circle
  - span “recolor the house”: **change**/do trigger=“recolor”; target drawn existing definite fill=description kind=house kind_span=“house”

90. [drawing · ui-human-v1 · train · drawing.object.remove] “get rid of circle”  — context: Circle, Box, House
  - span “get rid of circle”: **remove**/do trigger=“get rid of”; target drawn existing definite fill=written name_span=“circle”
    - drawn.ids = "the circle" from “circle” [eq, selector]

91. [drawing · ui-human-v1 · train · drawing.part.change] “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”  — context: Box, Circle, House
  - span “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“o1”
    - part.id = "o1" from “o1” [eq, selector]
    - part.index = "0" from “part 0” [eq, result]
    - part.color = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

92. [drawing · ui-human-v1 · test · world-informed-completion] “I need a tree next to the house”  — context: House, Box, Circle
  - span “I need a tree next to the house”: **make**/do trigger=“need”; target drawn new indefinite kind=tree kind_span=“tree”
    - drawn.relation = "next_to" from “next to” [relation, result]
    - drawn.anchor = "the house" from “the house” [relation, selector]

93. [drawing · ui-natural-v1 · train · drawing.catalog.make] “draw me a chair”  — context: Box, Circle, House
  - span “draw me a chair”: **make**/do trigger=“draw”; target drawn new indefinite kind=chair kind_span=“chair”

94. [drawing · ui-natural-v1 · train · drawing.part.change] “give the first house component a red colour and dimensions of 90 by 45”  — context: House, Box, Circle
  - span “give the first house component a red colour and dimensions of 90 by 45”: **change**/do trigger=“give”; target part existing definite fill=written name_span=“house” ordinal=first
    - part.id = "house" from “house” [eq, selector]
    - part.color = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

95. [drawing · ui-natural-v1 · train · drawing.object.make] “draw a house, at x 120, 100 high, size 80”  — context: House, Box, Circle
  - span “draw a house, at x 120, 100 high, size 80”: **make**/do trigger=“draw”; target drawn new indefinite kind=house kind_span=“house”
    - drawn.x = "120" from “120” [eq, result]
    - drawn.height = "100" from “100” [eq, result]
    - drawn.size = "80" from “80” [eq, result]

96. [drawing · ui-natural-v1 · train · drawing.object.make] “draw a house, 160 wide, size 80, labelled Home”  — context: House, Box, Circle
  - span “draw a house, 160 wide, size 80, labelled Home”: **make**/do trigger=“draw”; target drawn new indefinite kind=house kind_span=“house”
    - drawn.width = "160" from “160” [eq, result]
    - drawn.size = "80" from “80” [eq, result]
    - drawn.label = "Home" from “Home” [eq, result]

97. [drawing · ui-relations-v1 · train · drawing.object.make] “Please put a large mount fuji beside the tree.”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “Please put a large mount fuji beside the tree.”: **make**/do trigger=“put”; target drawn new indefinite kind=mount fuji kind_span=“mount fuji”
    - drawn.size = "big" from “large” [degree, result]
    - drawn.relation = "near" from “beside” [relation, result]
    - drawn.anchor = "the tree" from “the tree” [relation, selector]

98. [drawing · ui-relations-v1 · test · drawing.object.make] “give me a stump under that tree”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “give me a stump under that tree”: **make**/do trigger=“me”; target drawn new indefinite kind=stump kind_span=“stump”
    - drawn.relation = "below" from “under” [relation, result]
    - drawn.anchor = "that tree" from “that tree” [relation, selector]

99. [drawing · ui-relations-v1 · test · drawing.object.make] “please put an angelfish inside the lake, please”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put an angelfish inside the lake, please”: **make**/do trigger=“put”; target drawn new indefinite kind=angelfish kind_span=“angelfish”
    - drawn.relation = "in" from “inside” [relation, result]
    - drawn.anchor = "the lake" from “the lake” [relation, selector]

100. [drawing · ui-relations-v1 · test · drawing.object.make] “please put a freighter in the lake there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put a freighter in the lake there”: **make**/do trigger=“put”; target drawn new indefinite kind=freighter kind_span=“freighter”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake there" from “the lake there” [relation, selector]
