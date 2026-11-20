# Audit sample

100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.

1. [avatar · demo-tool-profile · train · avatar.part.change] “please set the "mouth" part using the pressed variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “please set the "mouth" part using the pressed variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "mouth" from “"mouth"” [eq, result]
    - part.variant = "pressed" from “pressed” [eq, result]

2. [avatar · demo-tool-profile · test · avatar.part.change] “please set the "nose" part using the wide variant”  — context: Avatar, hair back, shoulders, neck, ears, head
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

6. [avatar · main-synthetic · train · avatar.face.preset] “a man for me, face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “a man for me, face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "man" from “man” [eq, result]
    - face.id = "face" from “face” [eq, selector]

7. [avatar · main-synthetic · test · avatar.part.add] “add a smlie mouth”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “add a smlie mouth”: **make**/do trigger=“add”; target part new indefinite
    - part.id = "mouth" from “mouth” [eq, result]
    - part.variant = "smile" from “smlie” [eq, result]

8. [avatar · main-synthetic · train · avatar.part.add] “add a hadlebar moustache”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “add a hadlebar moustache”: **make**/do trigger=“add”; target part new indefinite
    - part.id = "moustache" from “moustache” [eq, result]
    - part.variant = "handlebar" from “hadlebar” [eq, result]

9. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“mouth”
    - part.ids = "mouth" from “mouth” [eq, selector]
    - part.scale = "1.1" from “1.1” [eq, result]

10. [avatar · ui-human-v1 · train · avatar.face.compose] “would be nice to have a human avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “would be nice to have a human avatar”: **change**/do trigger=“have”; target face existing definite fill=written name_span=“avatar”
    - face.characterKind = "human" from “human” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

11. [avatar · ui-human-v1 · train · world-informed-completion] “can you make the avatar look happier?”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “can you make the avatar look happier?”: **change**/do trigger=“make”; target face existing definite fill=context
    - face.expression = "happy" from “happier” [delta, result]

12. [avatar · ui-human-v1 · train · world-informed-completion] “would be nice to have bigger eyes, without moving the rest of the face”  — context: eyes, Avatar, earrings, hair front, eyebrows, nose
  - span “would be nice to have bigger eyes, without moving the rest of the face”: **change**/do trigger=“would be nice to have”; target part existing definite fill=context
    - part.size = "big" from “bigger” [delta, result]

13. [avatar · ui-human-v1 · train · avatar.part.change] “switch the mouth to the smile variant, kind of large”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “switch the mouth to the smile variant, kind of large”: **change**/do trigger=“switch”; target part existing definite fill=written name_span=“mouth”
    - part.ids = "mouth" from “mouth” [eq, selector]
    - part.variant = "smile" from “smile” [eq, result]
    - part.size = "(unlabelled)" from “kind of large” [eq, result]

14. [avatar · ui-natural-v1 · train · avatar.undo] “undo the last avatar change”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “undo the last avatar change”: **undo**/do trigger=“undo”; target face existing definite fill=journal_step

15. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=written name_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]
    - face.id = "(unlabelled)" from “avatar” [eq, selector]

16. [avatar · ui-natural-v1 · train · avatar.part.add] “use oval for the head”  — context: earrings, hair front, eyebrows, eyes, nose, mouth
  - span “use oval for the head”: **make**/do trigger=“use”; target part new indefinite
    - part.id = "head" from “head” [eq, result]
    - part.variant = "oval" from “oval” [eq, result]

17. [avatar · ui-natural-v1 · train · avatar.part.add] “use curly for the front hair”  — context: earrings, eyebrows, eyes, nose, mouth, head
  - span “use curly for the front hair”: **make**/do trigger=“use”; target part new indefinite
    - part.variant = "curly" from “curly” [eq, result]

18. [calendar · demo-tool-profile · train · calendar.meeting.move] “Please, place Review to 2026-12-09 at 13:00 UTC. Thanks!”  — context: Work 5, Focus room, Review
  - span “place Review to 2026-12-09 at 13:00 UTC”: **place**/do trigger=“place”; target meeting existing definite fill=written name_span=“Review”
    - meeting.day = "2026-12-09" from “2026-12-09” [eq, result]
    - meeting.time = "13:00" from “13:00” [eq, result]

19. [calendar · demo-tool-profile · train · calendar.meeting.add] “Please, put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes. Thanks!”  — context: Work 6, Living room
  - span “put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes”: **make**/do trigger=“put”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 6" from “Work 6” [eq, result]
    - meeting.day = "2026-12-10" from “2026-12-10” [eq, result]
    - meeting.time = "14:00" from “14:00” [eq, result]
    - meeting.length = "30" from “30 minutes” [eq, result]

20. [calendar · demo-tool-profile · train · None] “Please, which events are on Work 5 on 2026-12-01?. Thanks!”  — context: Work 5, Study, Review
  - span “which events are on Work 5 on 2026-12-01?”: **answer**/ask trigger=“which”; target meeting existing definite fill=description
    - question {"ask": "list"}
    - meeting.calendar = "Work 5" from “Work 5” [eq, selector]
    - meeting.day = "2026-12-01" from “2026-12-01” [eq, selector]

21. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

22. [calendar · main-synthetic · train · meeting.observe] “Mind telling me whether there's a calender anywhere in here?”  — context: Review, Calendar
  - span “Mind telling me whether there's a calender anywhere in here?”: **answer**/check trigger=“whether there's”; target calendar existing definite fill=all kind=calender kind_span=“calender”
    - question {"ask": "exists"}

23. [calendar · main-synthetic · train · meeting.observe] “Do we have any schedule-thingies set up over here at all?”  — context: Review, Calendar
  - span “Do we have any schedule-thingies set up over here at all?”: **answer**/check trigger=“Do we have any”; target calendar existing definite fill=all kind=schedule-thingies kind_span=“schedule-thingies”
    - question {"ask": "exists"}

24. [calendar · main-synthetic · train · meeting.observe] “Show me every person.”  — context: Review, Calendar
  - span “Show me every person.”: **answer**/ask trigger=“Show”; target person existing definite fill=all kind=person kind_span=“person”
    - question {"ask": "list"}

25. [calendar · main-synthetic · dev · meeting.observe] “Is there a room?”  — context: Review, Calendar
  - span “Is there a room?”: **answer**/check trigger=“Is there”; target room existing definite fill=all kind=room kind_span=“room”
    - question {"ask": "exists"}

26. [calendar · ui-human-v1 · train · calendar.event.select] “open Review”  — context: Review, Calendar
  - span “open Review”: **select**/do trigger=“open”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

27. [calendar · ui-human-v1 · train · calendar.meeting.move] “right, I'd like to put Review on 2026-11-18 at 10:00 UTC, thanks”  — context: Review, Calendar
  - span “right, I'd like to put Review on 2026-11-18 at 10:00 UTC, thanks”: **place**/do trigger=“put”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]

28. [calendar · ui-human-v1 · train · calendar.meeting.move] “2026-11-18 10:00 UTC for Review, reschedule it”  — context: Review, Calendar
  - span “2026-11-18 10:00 UTC for Review, reschedule it”: **place**/do trigger=“reschedule”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]

29. [calendar · ui-human-v1 · train · world-informed-completion] “um, extend the event so it's twice as long”  — context: Review, Calendar
  - span “um, extend the event so it's twice as long”: **change**/do trigger=“extend”; target meeting existing definite fill=context
    - meeting.length = "2" from “twice” [factor, result]

30. [calendar · ui-natural-v1 · train · calendar.meeting.remove] “cancel the Review event”  — context: Review, Calendar
  - span “cancel the Review event”: **remove**/do trigger=“cancel”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

31. [calendar · ui-natural-v1 · train · calendar.meeting.change] “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”  — context: Review, Calendar
  - span “Review: title Team review, 2026-11-18 10:00 UTC, one hour, notes Bring draft”: **change**/do trigger=“None”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Team review" from “Team review” [eq, result]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]
    - meeting.duration = "1" from “one hour” [eq, result]
    - meeting.notes = "Bring draft" from “Bring draft” [eq, result]

32. [calendar · ui-natural-v1 · train · calendar.meeting.move] “shift Review to 2026-11-18 at 10:00 UTC”  — context: Review, Calendar
  - span “shift Review to 2026-11-18 at 10:00 UTC”: **place**/do trigger=“shift”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]
    - meeting.day = "2026-11-18" from “2026-11-18” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.timezone = "UTC" from “UTC” [eq, result]

33. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

34. [diagram · demo-tool-profile · train · chart.make] “Hey, make a line chart called Cook 1 with values 28, 26 for Cook 2 and Sample. That would help.”  — context: (empty)
  - span “make a line chart called Cook 1 with values 28, 26 for Cook 2 and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=line kind_span=“line”
    - chart.title = "Cook 1" from “Cook 1” [eq, result]
    - chart.labels = "Cook 2 and Sample" from “Cook 2 and Sample” [eq, result]
    - chart.values = "28, 26" from “28, 26” [eq, result]

35. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Visits with values 19, 38 for Notes and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Visits with values 19, 38 for Notes and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Visits" from “Visits” [eq, result]
    - chart.labels = "Notes and Sample" from “Notes and Sample” [eq, result]
    - chart.values = "19, 38" from “19, 38” [eq, result]

36. [diagram · demo-tool-profile · train · diagram.node.change] “Could you make Pie A purple. I appreciate it.”  — context: Pie A, Slice 1
  - span “make Pie A purple”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Pie A”
    - node.colour = "purple" from “purple” [eq, result]

37. [diagram · demo-tool-profile · train · diagram.node.change] “Please, make Vendor onboarding green. Thanks!”  — context: Vendor onboarding, Invoice
  - span “make Vendor onboarding green”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Vendor onboarding”
    - node.colour = "green" from “green” [eq, result]

38. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

39. [diagram · demo-tool-profile · train · None] “Could you add a hexagon labelled Study groups; then connect Study groups to maths; then make Study groups blue. I appreciate it.”  — context: maths
  - span “add a hexagon labelled Study groups”: **make**/do trigger=“add”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.label = "Study groups" from “Study groups” [eq, result]
  - span “connect Study groups to maths”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Study groups" from “Study groups” [eq, result]
    - link.to = "maths" from “maths” [eq, result]
  - span “make Study groups blue”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Study groups”
    - node.colour = "blue" from “blue” [eq, result]

40. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Produce with values 15, 31 for Apples and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Produce with values 15, 31 for Apples and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Produce" from “Produce” [eq, result]
    - chart.labels = "Apples and Sample" from “Apples and Sample” [eq, result]
    - chart.values = "15, 31" from “15, 31” [eq, result]

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

43. [diagram · main-synthetic · train · node.observe] “I know the side panel got deleted in the shuffle, but settle something for me: is there a circle left in it anywhere?”  — context: link, Sales, Process
  - span “I know the side panel got deleted in the shuffle, but settle something for me: is there a circle left in it anywhere?”: **answer**/check trigger=“is there”; target node existing definite fill=all kind=circle kind_span=“circle”
    - question {"ask": "exists"}

44. [diagram · main-synthetic · train · diagram.node.make] “small — add a circle, please”  — context: link, Sales, Process
  - span “small — add a circle, please”: **make**/do trigger=“add”; target node new indefinite kind=circle kind_span=“circle”
    - node.size = "small" from “small” [eq, result]

45. [diagram · main-synthetic · dev · node.observe] “Colour of the star, please.”  — context: link, Sales, Process
  - span “Colour of the star, please.”: **answer**/ask trigger=“Colour”; target node existing definite fill=written name_span=“star”
    - question {"ask": "what", "asked_key": "node.colour"}

46. [diagram · main-synthetic · dev · diagram.node.make] “give me a hexagon 260, 240”  — context: link, Sales, Process
  - span “give me a hexagon 260, 240”: **make**/do trigger=“give”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

47. [diagram · ui-human-v1 · train · diagram.observe] “hmm, I can't remember what I drew, what's in this diagram?”  — context: link, Sales, Process
  - span “hmm, I can't remember what I drew, what's in this diagram?”: **answer**/ask trigger=“what's”; target sketch existing definite fill=context
    - question {"ask": "describe"}

48. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **place**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

49. [diagram · ui-human-v1 · train · diagram.group.chart.make] “let's graph Sales: A comes to 3, B comes to 7”  — context: Sales, B, A, link, Process
  - span “let's graph Sales: A comes to 3, B comes to 7”: **make**/do trigger=“graph”; target group new indefinite
    - group.label = "Sales" from “Sales” [eq, result]
    - group.labels = "A" from “A” [eq, result]
    - group.labels = "B" from “B” [eq, result]
    - group.values = "3" from “3” [eq, result]
    - group.values = "7" from “7” [eq, result]

50. [diagram · ui-human-v1 · train · compound] “move r1 near the top left, then make the Start box bigger”  — context: Start, link, Sales, Process
  - span “move r1 near the top left”: **place**/do trigger=“move”; target node existing definite fill=written name_span=“r1”
    - node.ids = "r1" from “r1” [eq, selector]
    - node.x = "(unlabelled)" from “near the top left” [eq, result]
    - node.y = "(unlabelled)" from “near the top left” [eq, result]
  - span “make the Start box bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.width = "(unlabelled)" from “bigger” [eq, result]
    - node.height = "(unlabelled)" from “bigger” [eq, result]

51. [diagram · ui-natural-v1 · train · diagram.link.remove] “delete the connection between the two boxes”  — context: link, Sales, Process
  - span “delete the connection between the two boxes”: **remove**/do trigger=“delete”; target link existing definite fill=context

52. [diagram · ui-natural-v1 · train · diagram.group.layout] “stack the Process group vertically”  — context: Process, link, Sales
  - span “stack the Process group vertically”: **place**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

53. [diagram · ui-natural-v1 · train · diagram.node.make] “create a square node named Step”  — context: A, link, Sales, Process
  - span “create a square node named Step”: **make**/do trigger=“create”; target node new indefinite kind=square kind_span=“square”
    - node.label = "Step" from “Step” [eq, result]

54. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **place**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

55. [document · demo-tool-profile · train · None] “I need you to add a heading called Delivered wrongly; then create a paragraph saying "Please check the final figures.". I appreciate it.”  — context: Draft, Delivered wrongly, Tracking log
  - span “add a heading called Delivered wrongly”: **make**/do trigger=“add”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Delivered wrongly" from “Delivered wrongly” [eq, result]
  - span “create a paragraph saying "Please check the final figures."”: **make**/do trigger=“create”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "Please check the final figures." from “Please check the final figures.” [eq, result]

56. [document · demo-tool-profile · train · document.block.change] “Hey, replace Shoe review with "The delivery arrived this morning.". That would help.”  — context: Draft, Shoe review, Reference
  - span “replace Shoe review with "The delivery arrived this morning."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Shoe review”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

57. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

58. [document · demo-tool-profile · train · document.block.change] “Hey, replace Itinerary with "Bring the revised notes to the meeting.". That would help.”  — context: Draft, Itinerary, Day 1
  - span “replace Itinerary with "Bring the revised notes to the meeting."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Itinerary”
    - section.content = "Bring the revised notes to the meeting." from “Bring the revised notes to the meeting.” [eq, result]

59. [document · demo-tool-profile · train · None] “Could you make a heading called Report; then add a paragraph saying "The delivery arrived this morning.". I appreciate it.”  — context: Draft, Report, Summary
  - span “make a heading called Report”: **make**/do trigger=“make”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Report" from “Report” [eq, result]
  - span “add a paragraph saying "The delivery arrived this morning."”: **make**/do trigger=“add”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

60. [document · demo-tool-profile · train · document.block.change] “Could you replace Meeting recap with "The room is available after lunch.". Thanks!”  — context: Draft, Meeting recap, Summary points
  - span “replace Meeting recap with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Meeting recap”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

61. [document · demo-tool-profile · train · document.block.change] “replace Membership form with "Bring the revised notes to the meeting.".”  — context: Draft, Membership form, Fees
  - span “replace Membership form with "Bring the revised notes to the meeting."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Membership form”
    - section.content = "Bring the revised notes to the meeting." from “Bring the revised notes to the meeting.” [eq, result]

62. [document · demo-tool-profile · train · None] “Hey, compose a report about Deposit in approximately 13 words. That would help.”  — context: Draft, Deposit, Lease
  - span “compose a report about Deposit in approximately 13 words”: **make**/do trigger=“compose”; target text new indefinite kind=report kind_span=“report”
    - text.about = "Deposit" from “Deposit” [eq, result]
    - text.words = "13" from “approximately 13 words” [eq, result]

63. [document · demo-tool-profile · train · None] “I need you to move Intro after List. I appreciate it.”  — context: Draft, Intro, List
  - span “move Intro after List”: **place**/do trigger=“move”; target section existing definite fill=written name_span=“Intro”
    - section.order = "after" from “after” [relation, result]

64. [document · demo-tool-profile · test · None] “Could you compose a report about Choir programme in approximately 87 words. I appreciate it.”  — context: Draft, Choir programme, Concert date
  - span “compose a report about Choir programme in approximately 87 words”: **make**/do trigger=“compose”; target text new indefinite kind=report kind_span=“report”
    - text.about = "Choir programme" from “Choir programme” [eq, result]
    - text.words = "87" from “approximately 87 words” [eq, result]

65. [document · main-synthetic · train · block.observe] “Any top-of-page title pieces at all in this one?”  — context: Notes
  - span “Any top-of-page title pieces at all in this one?”: **answer**/check trigger=“Any”; target block existing definite fill=all kind=top-of-page title pieces kind_span=“top-of-page title pieces”
    - question {"ask": "exists"}

66. [document · main-synthetic · train · block.observe] “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”  — context: Notes
  - span “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”: **answer**/ask trigger=“how many”; target block existing definite fill=all kind=quote kind_span=“quote”
    - question {"ask": "count"}

67. [document · main-synthetic · train · block.observe] “Count the sayings boxes for me, would you?”  — context: Notes
  - span “Count the sayings boxes for me, would you?”: **answer**/ask trigger=“Count”; target block existing definite fill=all kind=sayings boxes kind_span=“sayings boxes”
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
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=written name_span=“chapter”
    - section.id = "chapter" from “chapter” [eq, selector]
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

79. [drawing · demo-tool-profile · dev · drawing.object.change] “Could you make sun red. Thanks!”  — context: sun, sea
  - span “make sun red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“sun”
    - drawn.colour = "red" from “red” [eq, result]

80. [drawing · demo-tool-profile · train · drawing.object.change] “Hey, make sandpit yellow. That would help.”  — context: sandpit, slide
  - span “make sandpit yellow”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“sandpit”
    - drawn.colour = "yellow" from “yellow” [eq, result]

81. [drawing · demo-tool-profile · train · drawing.object.change] “Let us make Mo red. That would help.”  — context: Mo, Pip
  - span “make Mo red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Mo”
    - drawn.colour = "red" from “red” [eq, result]

82. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

83. [drawing · main-synthetic · train · drawing.catalog.make] “I'd like a salmon”  — context: House, Box, Circle
  - span “I'd like a salmon”: **make**/do (no trigger); target drawn new indefinite kind=salmon kind_span=“salmon”

84. [drawing · main-synthetic · test · drawing.object.make] “I could use a masts here”  — context: House, Box, Circle
  - span “I could use a masts here”: **make**/do trigger=“use”; target drawn new indefinite kind=masts kind_span=“masts”

85. [drawing · main-synthetic · train · drawing.object.make] “rounding this off with a cradle”  — context: House, Box, Circle
  - span “rounding this off with a cradle”: **make**/do (no trigger); target drawn new indefinite kind=cradle kind_span=“cradle”

86. [drawing · main-synthetic · test · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

87. [drawing · main-synthetic · train · drawing.object.make] “can I get a theatre masks?”  — context: House, Box, Circle
  - span “can I get a theatre masks?”: **make**/do (no trigger); target drawn new indefinite kind=theatre masks kind_span=“theatre masks”

88. [drawing · main-synthetic · train · drawing.object.make] “the next thing on my list is a tequila”  — context: House, Box, Circle
  - span “the next thing on my list is a tequila”: **make**/do (no trigger); target drawn new indefinite kind=tequila kind_span=“tequila”

89. [drawing · ui-human-v1 · train · drawing.object.change] “recolor the house”  — context: House, Box, Circle
  - span “recolor the house”: **change**/do trigger=“recolor”; target drawn existing definite fill=written name_span=“the house”
    - drawn.ids = "the house" from “the house” [eq, selector]

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

97. [drawing · ui-relations-v1 · train · drawing.object.make] “can you add a lake next to that house”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “can you add a lake next to that house”: **make**/do trigger=“add”; target drawn new indefinite kind=lake kind_span=“lake”
    - drawn.relation = "near" from “next to” [relation, result]
    - drawn.anchor = "that house" from “that house” [relation, selector]

98. [drawing · ui-relations-v1 · train · drawing.object.make] “could you draw a flower by the lake”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “could you draw a flower by the lake”: **make**/do trigger=“draw”; target drawn new indefinite kind=flower kind_span=“flower”
    - drawn.relation = "near" from “by” [relation, result]
    - drawn.anchor = "the lake" from “the lake” [relation, selector]

99. [drawing · ui-relations-v1 · train · drawing.object.make] “put a mountain on the right of the tree”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “put a mountain on the right of the tree”: **make**/do trigger=“put”; target drawn new indefinite kind=mountain kind_span=“mountain”
    - drawn.relation = "right_of" from “on the right of” [relation, result]
    - drawn.anchor = "the tree" from “the tree” [relation, selector]

100. [drawing · ui-relations-v1 · train · drawing.object.make] “draw a rocket over the mountain there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “draw a rocket over the mountain there”: **make**/do trigger=“draw”; target drawn new indefinite kind=rocket kind_span=“rocket”
    - drawn.relation = "above" from “over” [relation, result]
    - drawn.anchor = "the mountain there" from “the mountain there” [relation, selector]
