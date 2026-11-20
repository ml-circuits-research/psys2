# Audit sample

100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.

1. [avatar · demo-tool-profile · train · avatar.part.change] “please set the "mouth" part using the pressed variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “please set the "mouth" part using the pressed variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "mouth" from “"mouth"” [eq, result]
    - part.variant = "pressed" from “pressed” [eq, result]

2. [avatar · demo-tool-profile · train · avatar.part.change] “set the "hat" part to the top hat variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “set the "hat" part to the top hat variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "hat" from “"hat"” [eq, result]
    - part.variant = "top hat" from “top hat” [eq, result]

3. [avatar · main-synthetic · train · avatar.part.add] “add a salor collar back hair”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “add a salor collar back hair”: **make**/do trigger=“add”; target part new indefinite
    - part.id = "hair_back" from “back hair” [eq, result]
    - part.variant = "sailor collar" from “salor collar” [eq, result]

4. [avatar · main-synthetic · train · avatar.part.change] “a monocle for me, glasses red”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “a monocle for me, glasses red”: **change**/do (no trigger); target part existing definite fill=description kind=glasses kind_span=“glasses”
    - part.variant = "monocle" from “monocle” [eq, result]
    - part.colour = "red" from “red” [eq, result]

5. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “could you make the head a lot larger”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “could you make the head a lot larger”: **change**/do trigger=“make”; target part existing definite fill=description kind=head kind_span=“head”
    - part.size = "(unlabelled)" from “larger” [delta, result]

6. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “please make the mouth a lot tinier”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “please make the mouth a lot tinier”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.size = "(unlabelled)" from “tinier” [delta, result]

7. [avatar · ui-coverage-v2 · train · avatar.face.resize] “scale the character up”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “scale the character up”: **change**/do trigger=“scale”; target face existing definite fill=context
    - face.scale = "(unlabelled)" from “up” [delta, result]

8. [avatar · ui-coverage-v2 · train · avatar.part.change] “big lips”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “big lips”: **change**/do (no trigger); target part existing definite fill=written name_span=“lips”
    - part.ids = "lips" from “lips” [eq, selector]
    - part.size = "big" from “big” [degree, result]

9. [avatar · ui-features-v1 · train · avatar.part.change] “longer hair”  — context: Avatar, fringe, pigtails, eyes, brows, nose
  - span “longer hair”: **change**/do (no trigger); target part existing definite fill=description kind=hair kind_span=“hair”
    - part.length = "(unlabelled)" from “longer” [delta, result]

10. [avatar · ui-features-v1 · train · avatar.part.change] “switch her to short hair”  — context: Avatar, fringe, pigtails, eyes, brows, nose
  - span “switch her to short hair”: **change**/do trigger=“switch”; target part existing definite fill=description kind=hair kind_span=“hair”
    - part.length = "short" from “short” [degree, result]

11. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.scale = "1.1" from “1.1” [eq, result]

12. [avatar · ui-human-v1 · train · avatar.part.add] “put on a cap”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “put on a cap”: **make**/do trigger=“put”; target part new indefinite
    - part.variant = "cap" from “cap” [eq, result]

13. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=description kind=avatar kind_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]

14. [avatar · ui-natural-v1 · train · avatar.face.expression] “give the avatar a happy look”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “give the avatar a happy look”: **change**/do trigger=“give”; target face existing definite fill=description kind=avatar kind_span=“avatar”
    - face.expression = "happy" from “happy” [eq, result]

15. [calendar · demo-tool-profile · train · None] “Let us which events are on Work 8 on 2026-12-08?. That would help.”  — context: Work 8, Room 8, Review
  - span “which events are on Work 8 on 2026-12-08?”: **answer**/ask trigger=“which”; target meeting existing definite fill=description
    - question {"ask": "list"}
    - meeting.calendar = "Work 8" from “Work 8” [eq, selector]
    - meeting.day = "2026-12-08" from “2026-12-08” [eq, selector]

16. [calendar · demo-tool-profile · train · calendar.meeting.move] “Please, move Review to 2026-12-11 at 11:00 UTC. Thanks!”  — context: Work 3, Library room B, Review
  - span “move Review to 2026-12-11 at 11:00 UTC”: **place**/do trigger=“move”; target meeting existing definite fill=written name_span=“Review”
    - meeting.day = "2026-12-11" from “2026-12-11” [eq, result]
    - meeting.time = "11:00" from “11:00” [eq, result]

17. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

18. [calendar · main-synthetic · train · calendar.meeting.change] “Room Main is the new home for the Intro meeting, which also takes the name Second”  — context: Intro, Review, Calendar
  - span “Room Main is the new home for the Intro meeting, which also takes the name Second”: **change**/do trigger=“name”; target meeting existing definite fill=written name_span=“Intro”
    - meeting.id = "Intro" from “Intro” [eq, selector]
    - meeting.title = "Second" from “Second” [eq, result]

19. [calendar · main-synthetic · train · calendar.meeting.change] “Update the Intro meeting to start at 2, run for 3, and list the whole gang as participants.”  — context: Intro, Review, Calendar
  - span “Update the Intro meeting to start at 2, run for 3, and list the whole gang as participants.”: **change**/do trigger=“Update”; target meeting existing definite fill=written name_span=“Intro”
    - meeting.id = "Intro" from “Intro” [eq, selector]
    - meeting.start = "2" from “2” [eq, result]
    - meeting.length = "3" from “3” [eq, result]

20. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “Make Review a bit longer.”  — context: Review, Planning, Calendar
  - span “Make Review a bit longer.”: **change**/do trigger=“Make”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]
    - meeting.length = "(unlabelled)" from “longer” [delta, result]

21. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “I want it shorter”  — context: Review, Planning, Calendar
  - span “I want it shorter”: **change**/do trigger=“want”; target meeting existing definite fill=context
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

22. [calendar · ui-coverage-v2 · train · calendar.person.add] “new person: Dana”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “new person: Dana”: **make**/do (no trigger); target person new indefinite kind=person kind_span=“person”
    - person.name = "Dana" from “Dana” [eq, result]

23. [calendar · ui-coverage-v2 · train · calendar.meeting.add] “book a two hour workshop with Lee and Priya on Friday at 1pm”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “book a two hour workshop with Lee and Priya on Friday at 1pm”: **make**/do trigger=“book”; target meeting new indefinite kind=workshop kind_span=“workshop”
    - meeting.length = "2" from “two hour” [eq, result]
    - meeting.people = "Lee" from “Lee” [eq, result]
    - meeting.people = "Priya" from “Priya” [eq, result]
    - meeting.day = "Friday" from “Friday” [eq, result]
    - meeting.time = "1pm" from “1pm” [eq, result]

24. [calendar · ui-human-v1 · dev · calendar.meeting.change] “set review as Weekly review”  — context: Review, Calendar
  - span “set review as Weekly review”: **change**/do trigger=“set”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Weekly review" from “Weekly review” [eq, result]

25. [calendar · ui-human-v1 · train · world-informed-completion] “um, extend the event so it's twice as long”  — context: Review, Calendar
  - span “um, extend the event so it's twice as long”: **change**/do trigger=“extend”; target meeting existing definite fill=context
    - meeting.length = "2" from “twice” [factor, result]

26. [calendar · ui-natural-v1 · train · calendar.meeting.remove] “cancel the Review event”  — context: Review, Calendar
  - span “cancel the Review event”: **remove**/do trigger=“cancel”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

27. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

28. [calendar · ui-tiers-v1 · train · calendar.meeting.add] “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”: **make**/do trigger=“add”; target meeting new indefinite kind=dentist appointment kind_span=“dentist appointment”
    - meeting.calendar = "Family" from “Family” [eq, result]
    - meeting.day = "Wednesday" from “Wednesday” [eq, result]
    - meeting.time = "4:30" from “4:30” [eq, result]

29. [calendar · ui-tiers-v1 · train · calendar.meeting.add] “Lee asked to sync on the roadmap - would Monday at 2 suit? If so, put a meeting with him on my Work calendar.”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “Lee asked to sync on the roadmap - would Monday at 2 suit? If so, put a meeting with him on my Work calendar.”: **make**/do trigger=“put”; target meeting new indefinite kind=meeting kind_span=“meeting”
    - meeting.day = "Monday" from “Monday” [eq, result]
    - meeting.time = "2" from “2” [eq, result]
    - meeting.people = "Lee" from “him” [eq, result]
    - meeting.calendar = "Work" from “Work” [eq, result]

30. [diagram · data-drop-v1 · dev · None] “I want the x axis numbers to the nth on the sensor contour”  — context: Sensor readings by depth
  - span “I want the x axis numbers to the nth on the sensor contour”: **change**/do trigger=“want”; target chart existing definite fill=context
    - chart.tickFormat = "nth power x" from “to the nth” [eq, result]

31. [diagram · data-drop-v1 · train · None] “how do I get the arrow labels 0.5cm off the line?”  — context: Input, Output, e1
  - span “how do I get the arrow labels 0.5cm off the line?”: **change**/do trigger=“do”; target link existing quantified fill=all

32. [diagram · data-drop-v1 · test · None] “did we get all the way back to the beginning”  — context: Hold, Clean, Fill, Seal, Label
  - span “did we get all the way back to the beginning”: **answer**/ask trigger=“the”; target diagram existing definite fill=context
    - question {"ask": "exists"}

33. [diagram · demo-tool-profile · train · diagram.node.change] “Could you make Pie A purple. I appreciate it.”  — context: Pie A, Slice 1
  - span “make Pie A purple”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Pie A”
    - node.colour = "purple" from “purple” [eq, result]

34. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

35. [diagram · demo-tool-profile · train · None] “Could you add a hexagon labelled Study groups; then connect Study groups to maths; then make Study groups blue. I appreciate it.”  — context: maths
  - span “add a hexagon labelled Study groups”: **make**/do trigger=“add”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.label = "Study groups" from “Study groups” [eq, result]
  - span “connect Study groups to maths”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Study groups" from “Study groups” [eq, result]
    - link.to = "maths" from “maths” [eq, result]
  - span “make Study groups blue”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Study groups”
    - node.colour = "blue" from “blue” [eq, result]

36. [diagram · human-adapted-v1-diagram · train · None] “Insert a line chart with following data, 2016 6.7%, 2017 6.9%, 2018 6.6%, 2019 6.1%, 2020 2.3%, 2021 8.1%”  — context: (empty)
  - span “Insert a line chart with following data, 2016 6.7%, 2017 6.9%, 2018 6.6%, 2019 6.1%, 2020 2.3%, 2021 8.1%”: **make**/do trigger=“Insert”; target chart new indefinite
    - chart.type = "line" from “line chart” [eq, result]
    - chart.labels = "2016" from “2016” [eq, result]
    - chart.values = "6.7" from “6.7” [eq, result]
    - chart.labels = "2017" from “2017” [eq, result]
    - chart.values = "6.9" from “6.9” [eq, result]
    - chart.labels = "2018" from “2018” [eq, result]
    - chart.values = "6.6" from “6.6” [eq, result]
    - chart.labels = "2019" from “2019” [eq, result]
    - chart.values = "6.1" from “6.1” [eq, result]
    - chart.labels = "2020" from “2020” [eq, result]
    - chart.values = "2.3" from “2.3” [eq, result]
    - chart.labels = "2021" from “2021” [eq, result]
    - chart.values = "8.1" from “8.1” [eq, result]

37. [diagram · human-adapted-v1-diagram · train · None] “call it Score”  — context: Revenue trend, 2016, 2017, 2018, 2019, Revenue
  - span “call it Score”: **change**/do trigger=“call”; target chart existing definite fill=context
    - chart.title = "Score" from “Score” [eq, result]

38. [diagram · main-synthetic · train · diagram.group.layout] “place a layyers Backup”  — context: Backup, link, Sales, Process
  - span “place a layyers Backup”: **arrange**/do trigger=“place”; target group existing definite fill=written name_span=“Backup”
    - group.id = "Backup" from “Backup” [eq, selector]

39. [diagram · main-synthetic · train · diagram.group.place] “place a grooup Review 260, 240”  — context: Review, link, Sales, Process
  - span “place a grooup Review 260, 240”: **place**/do trigger=“place”; target group existing definite fill=written name_span=“Review”
    - group.id = "Review" from “Review” [eq, selector]
    - group.x = "260" from “260” [eq, result]
    - group.y = "240" from “240” [eq, result]

40. [diagram · ui-comparatives-v1 · train · diagram.node.size.delta] “make Decision much bigger”  — context: Start, Finish, Decision
  - span “make Decision much bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Decision”
    - node.ids = "Decision" from “Decision” [eq, selector]
    - node.size = "(unlabelled)" from “bigger” [delta, result]

41. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “make the shape way narrower”  — context: Start, Finish, Decision
  - span “make the shape way narrower”: **change**/do trigger=“make”; target node existing definite fill=description kind=shape kind_span=“shape”
    - node.width = "(unlabelled)" from “narrower” [delta, result]

42. [diagram · ui-coverage-v2 · train · diagram.node.make] “small yellow star”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “small yellow star”: **make**/do (no trigger); target node new indefinite kind=star kind_span=“star”
    - node.size = "small" from “small” [degree, result]
    - node.colour = "yellow" from “yellow” [eq, result]

43. [diagram · ui-coverage-v2 · train · diagram.group.layout] “arrange the Approval steps group in a column”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “arrange the Approval steps group in a column”: **arrange**/do trigger=“arrange”; target group existing definite fill=written name_span=“Approval steps”
    - group.id = "Approval steps" from “Approval steps” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

44. [diagram · ui-diagram-v2 · train · diagram.node.remove] “the Build step away”  — context: Database, Payment, Build, e1
  - span “the Build step away”: **remove**/do trigger=“away”; target node existing definite fill=written name_span=“Build”
    - node.ids = "Build" from “Build” [eq, selector]

45. [diagram · ui-diagram-v2 · train · diagram.link.make] “with this onep icked, I need you to connect it to CEO”  — context: n1, Retry, n3, Draft, CEO, e1
  - span “with this onep icked, I need you to connect it to CEO”: **connect**/do trigger=“connect”; target link new indefinite
    - link.to = "CEO" from “CEO” [eq, result]

46. [diagram · ui-diagram-v2 · train · diagram.series.make] “could you draw Costs as a second series: 8, 15, 120”  — context: Onboarding, Research, Deploy, Valid?, Quarterly revenue, 2022
  - span “could you draw Costs as a second series: 8, 15, 120”: **make**/do trigger=“draw”; target series new indefinite
    - series.label = "Costs" from “Costs” [eq, result]
    - series.values = "8" from “8” [eq, result]
    - series.values = "15" from “15” [eq, result]
    - series.values = "120" from “120” [eq, result]

47. [diagram · ui-diagram-v2 · train · diagram.chart.make] “just draw a polar area chart of sales by month”  — context: Settings, Done, Marketing, Draft, e1, e2
  - span “just draw a polar area chart of sales by month”: **make**/do trigger=“draw”; target chart new indefinite
    - chart.type = "polarArea" from “polar area chart” [eq, result]

48. [diagram · ui-diagram-v2-voice · train · diagram.style.apply] “make it black and white for printing”  — context: Start, Login, Valid?, Dashboard, End, n6
  - span “make it black and white for printing”: **change**/do trigger=“make”; target diagram existing definite fill=context
    - diagram.theme = "monochrome" from “black and white” [eq, result]

49. [diagram · ui-diagram-v2-voice · train · compound] “delete Dashboard and connect Valid? to End”  — context: Start, Login, Valid?, Dashboard, End, n6
  - span “delete Dashboard”: **remove**/do trigger=“delete”; target node existing definite fill=written name_span=“Dashboard”
    - node.ids = "Dashboard" from “Dashboard” [eq, selector]
  - span “connect Valid? to End”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Valid?" from “Valid?” [eq, result]
    - link.to = "End" from “End” [eq, result]

50. [diagram · ui-human-v1 · train · diagram.observe] “hmm, I can't remember what I drew, what's in this diagram?”  — context: link, Sales, Process
  - span “hmm, I can't remember what I drew, what's in this diagram?”: **answer**/ask trigger=“what's”; target sketch existing definite fill=context
    - question {"ask": "describe"}

51. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **arrange**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

52. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **arrange**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

53. [diagram · ui-natural-v1 · train · diagram.node.change] “update the Start box, labelled Approval, with value 12”  — context: Start, link, Sales, Process
  - span “update the Start box, labelled Approval, with value 12”: **change**/do trigger=“update”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.label = "Approval" from “Approval” [eq, result]
    - node.value = "12" from “12” [eq, result]

54. [diagram · ui-quantities-v1 · train · compound] “add two circles and a box”  — context: Box, Circle
  - span “add two circles”: **make**/do trigger=“add”; target node new indefinite kind=circle kind_span=“circles”
    - node.n = "2" from “two” [eq, result]
  - span “a box”: **make**/do (no trigger); target node new indefinite kind=box kind_span=“box”

55. [diagram · ui-quantities-v1 · train · compound] “create a box and 2 diamonds”  — context: Box, Circle
  - span “create a box”: **make**/do trigger=“create”; target node new indefinite kind=box kind_span=“box”
  - span “2 diamonds”: **make**/do (no trigger); target node new indefinite kind=diamond kind_span=“diamonds”
    - node.n = "2" from “2” [eq, result]

56. [diagram · ui-tiers-v1 · train · diagram.group.chart] “We're presenting the survey tomorrow and the slide needs a heading, so could you turn Survey results into a doughnut chart called "How customers rated us"?”  — context: Sales by region, Monthly visitors, Quarterly revenue, Survey results, North, South
  - span “We're presenting the survey tomorrow and the slide needs a heading, so could you turn Survey results into a doughnut chart called "How customers rated us"?”: **make**/do trigger=“turn”; target chart new indefinite kind=chart kind_span=“chart”
    - chart.source = "(unlabelled)" from “Survey results” [eq, result]
    - chart.type = "doughnut" from “doughnut chart” [eq, result]
    - chart.title = "How customers rated us" from “How customers rated us” [eq, result]

57. [diagram · ui-tiers-v1 · train · diagram.group.resize] “Survey results: a little smaller”  — context: Sales by region, Monthly visitors, Quarterly revenue, Survey results, North, South
  - span “Survey results: a little smaller”: **change**/do (no trigger); target group existing definite fill=written name_span=“Survey results”
    - group.id = "Survey results" from “Survey results” [eq, selector]
    - group.scale = "(unlabelled)" from “smaller” [delta, result]

58. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

59. [document · demo-tool-profile · train · None] “Could you make a heading called Report; then add a paragraph saying "The delivery arrived this morning.". I appreciate it.”  — context: Draft, Report, Summary
  - span “make a heading called Report”: **make**/do trigger=“make”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Report" from “Report” [eq, result]
  - span “add a paragraph saying "The delivery arrived this morning."”: **make**/do trigger=“add”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

60. [document · demo-tool-profile · train · document.block.change] “Could you replace Meeting recap with "The room is available after lunch.". Thanks!”  — context: Draft, Meeting recap, Summary points
  - span “replace Meeting recap with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Meeting recap”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

61. [document · main-synthetic · train · document.block.select] “pick the blcok Intro plus 2 and 3”  — context: Intro, 3, 2, Intro, Notes
  - span “pick the blcok Intro plus 2 and 3”: **select**/do trigger=“pick”; target block existing definite fill=written name_span=“Intro”
    - block.id = "Intro" from “Intro” [eq, selector]
    - block.id = "Intro" from “Intro” [eq, selector]

62. [document · main-synthetic · train · document.section.make] “add a setion Core”  — context: Notes
  - span “add a setion Core”: **make**/do trigger=“add”; target section existing definite fill=context
    - section.parent = "Core" from “Core” [eq, result]

63. [document · ui-coverage-v2 · train · document.observe] “what does the Budget table contain?”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “what does the Budget table contain?”: **answer**/ask trigger=“what”; target document existing definite fill=written name_span=“Budget”
    - question {"ask": "describe"}

64. [document · ui-coverage-v2 · train · document.compose] “a quick note for the neighbours about the party, 60 words max”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “a quick note for the neighbours about the party, 60 words max”: **make**/do (no trigger); target text new indefinite
    - text.genre = "note" from “note” [eq, result]
    - text.about = "about the party" from “about the party” [eq, result]
    - text.words = "60" from “60 words max” [eq, result]

65. [document · ui-human-v1 · train · compound] “change the chapter heading to Overview and tidy the first paragraph”  — context: paragraph, paragraph, Notes
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=description kind=chapter kind_span=“chapter”
    - section.text = "Overview" from “Overview” [eq, result]
  - span “tidy”: **change**/do trigger=“tidy”; target block existing definite fill=context

66. [document · ui-human-v1 · train · document.list.change] “edit the Tasks list”  — context: Tasks, Notes
  - span “edit the Tasks list”: **change**/do trigger=“edit”; target block existing definite fill=written name_span=“Tasks”
    - block.id = "Tasks" from “Tasks” [eq, selector]

67. [document · ui-natural-v1 · train · document.section.change] “give b1 the heading Overview at level 1”  — context: Notes
  - span “give b1 the heading Overview at level 1”: **change**/do trigger=“give”; target section existing definite fill=written name_span=“b1”
    - section.id = "b1" from “b1” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]
    - section.level = "1" from “level 1” [eq, result]

68. [document · ui-natural-v1 · train · document.table.make] “Budget table: header Item,Cost; row Paper,12”  — context: Budget, Notes
  - span “Budget table: header Item,Cost; row Paper,12”: **make**/do trigger=“None”; target block new indefinite
    - block.name = "Budget" from “Budget” [eq, result]
    - block.rows = "Item" from “Item” [eq, result]
    - block.rows = "Cost" from “Cost” [eq, result]
    - block.rows = "Paper" from “Paper” [eq, result]
    - block.rows = "12" from “12” [eq, result]
    - block.header = "true" from “header Item” [eq, result]

69. [document · ui-tiers-v1 · train · document.block.mark] “readers can't find the sources, so in the Background paragraph please link "the original study" to https://journal.example.org/study-17”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “in the Background paragraph please link "the original study" to https://journal.example.org/study-17”: **change**/do trigger=“link”; target block existing definite fill=written name_span=“Background”
    - block.id = "Background" from “Background” [eq, selector]
    - block.mark = "link" from “link” [eq, result]
    - block.text = "the original study" from “the original study” [eq, selector]
    - block.attrs = "https://journal.example.org/study-17" from “https://journal.example.org/study-17” [eq, result]

70. [document · ui-tiers-v1 · train · document.block.mark] “link "pricing" to example.com/prices”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “link "pricing" to example.com/prices”: **change**/do trigger=“link”; target block existing definite fill=context
    - block.mark = "link" from “link” [eq, result]
    - block.text = "pricing" from “pricing” [eq, selector]
    - block.attrs = "example.com/prices" from “example.com/prices” [eq, result]

71. [drawing · data-drop-v1 · train · None] “swap the cloud for a little grey rain cloud”  — context: Fish, Bird, Bird 2, Boat, Cat, Tree
  - span “swap the cloud for a little grey rain cloud”: **change**/do trigger=“swap”; target drawn existing definite fill=description kind=cloud kind_span=“cloud”
    - drawn.colour = "grey" from “grey” [eq, result]
    - drawn.variant = "rain cloud" from “a little grey rain cloud” [eq, result]

72. [drawing · data-drop-v1 · train · None] “let the house front be stone”  — context: House, Tree, Sun, Cloud
  - span “let the house front be stone”: **change**/do trigger=“let”; target part existing definite fill=description kind=front kind_span=“house front”
    - drawn.material = "stone" from “stone” [eq, result]

73. [drawing · data-drop-v1 · train · None] “the bench by the tree should be over on the right side”  — context: Bench, Tree, House, Sun, Girl
  - span “the bench by the tree should be over on the right side”: **change**/do trigger=“should”; target drawn existing definite fill=description kind=bench kind_span=“bench” description_span=“the bench by the tree”
    - drawn.at = "right" from “the right side” [region, result]

74. [drawing · data-drop-v1 · train · compound] “could you put a medium red stall over on the left side, a medium vendor facing right standing just behind the stall, a small boy standing right in front of the stall, and a small white apron on the vendor”  — context: Street, Tree
  - span “could you put a medium red stall over on the left side”: **make**/do trigger=“could”; target drawn new indefinite kind=stall kind_span=“stall”
    - drawn.size = "medium" from “medium” [degree, result]
    - drawn.colour = "red" from “red” [eq, result]
    - drawn.at = "left" from “the left” [region, result]
  - span “a medium vendor facing right standing just behind the stall”: **make**/do (no trigger); target drawn new indefinite kind=vendor kind_span=“vendor”
    - drawn.size = "medium" from “medium” [degree, result]
    - drawn.facing = "right" from “right” [eq, result]
    - drawn.relation = "behind" from “behind the stall” [relation, result]
    - drawn.pose = "standing" from “standing” [eq, result]
    - drawn.anchor = "the stall" from “the stall” [relation, selector]
  - span “a small boy standing right in front of the stall”: **make**/do (no trigger); target drawn new indefinite kind=boy kind_span=“boy”
    - drawn.size = "small" from “small” [degree, result]
    - drawn.relation = "in front of" from “in front of the stall” [relation, result]
    - drawn.pose = "standing" from “standing” [eq, result]
    - drawn.anchor = "the stall" from “the stall” [relation, selector]
  - span “a small white apron on the vendor”: **change**/do (no trigger); target part new indefinite kind=apron kind_span=“apron”
    - part.owner = "vendor" from “the vendor” [eq, result]

75. [drawing · data-drop-v1 · train · None] “turn the scene into a wet and windy evening”  — context: House, Tree, Sun, Lake, Cloud, Boat
  - span “turn the scene into a wet and windy evening”: **change**/do trigger=“turn”; target page existing definite fill=context

76. [drawing · data-drop-v1 · train · compound] “a library in the afternoon with a medium storyteller sitting right on the rug, four small red cushions in a row right on the rug, three small children sitting around the storyteller, and a small white rabbit right next to the storyteller, and keep the people in the foreground from now on”  — context: Rug, Shelf
  - span “a library in the afternoon”: **change**/do (no trigger); target page existing definite fill=context
  - span “a medium storyteller sitting right on the rug”: **make**/do (no trigger); target drawn new indefinite kind=storyteller kind_span=“storyteller”
    - drawn.size = "medium" from “medium” [degree, result]
    - drawn.relation = "on" from “on the rug” [relation, result]
    - drawn.pose = "sitting" from “sitting” [eq, result]
    - drawn.anchor = "the rug" from “the rug” [relation, selector]
  - span “four small red cushions in a row right on the rug”: **make**/do (no trigger); target drawn new quantified kind=cushion kind_span=“cushions”
    - drawn.count = "(unlabelled)" from “four” [eq, result]
    - drawn.size = "small" from “small” [degree, result]
    - drawn.colour = "red" from “red” [eq, result]
    - drawn.relation = "on" from “on the rug” [relation, result]
    - drawn.anchor = "the rug" from “the rug” [relation, selector]
  - span “three small children sitting around the storyteller”: **make**/do (no trigger); target drawn new quantified kind=child kind_span=“children”
    - drawn.count = "(unlabelled)" from “three” [eq, result]
    - drawn.size = "small" from “small” [degree, result]
    - drawn.relation = "around" from “around the storyteller” [relation, result]
    - drawn.pose = "sitting" from “sitting” [eq, result]
    - drawn.anchor = "the storyteller" from “the storyteller” [relation, selector]
  - span “a small white rabbit right next to the storyteller”: **make**/do (no trigger); target drawn new indefinite kind=rabbit kind_span=“rabbit”
    - drawn.size = "small" from “small” [degree, result]
    - drawn.colour = "white" from “white” [eq, result]
    - drawn.relation = "next to" from “next to the storyteller” [relation, result]
    - drawn.anchor = "the storyteller" from “the storyteller” [relation, selector]
  - span “keep the people in the foreground from now on”: **place**/do trigger=“keep”; target group existing definite fill=context
    - drawn.at = "foreground" from “in the foreground” [region, result]

77. [drawing · data-drop-v1 · train · compound] “make the little car by the gate deep cobalt blue, and give the surface a pearlescent paint look”  — context: House, Tree, Sun, Cloud, Lake, Boat
  - span “make the little car by the gate deep cobalt blue”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=car kind_span=“car” description_span=“the little car by the gate”
    - drawn.colour = "cobalt" from “deep cobalt blue” [eq, result]
  - span “give the surface a pearlescent paint look”: **change**/do trigger=“give”; target drawn existing definite fill=description kind=surface kind_span=“surface” description_span=“surface”

78. [drawing · demo-tool-profile · train · None] “place duck pond to the left of barn.”  — context: duck pond, barn
  - span “place duck pond to the left of barn”: **place**/do trigger=“place”; target drawn existing definite fill=written name_span=“duck pond”
    - drawn.relation = "left_of" from “to the left of” [relation, result]
    - drawn.anchor = "barn" from “barn” [relation, selector]

79. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

80. [drawing · human-adapted-v1-drawing · train · None] “the man in the blue shirt disappears”  — context: Man in blue shirt, Man in red shirt
  - span “the man in the blue shirt disappears”: **remove**/do trigger=“disappears”; target drawn existing definite fill=description kind=man kind_span=“man” description_span=“in the blue shirt”

81. [drawing · human-adapted-v1-drawing · train · None] “is the boy large?”  — context: Boy
  - span “is the boy large?”: **answer**/check trigger=“is”; target drawn existing definite fill=description kind=boy kind_span=“boy”
    - question {"ask": "describe"}

82. [drawing · main-synthetic · train · drawing.object.make] “my current project needs a bean curd”  — context: House, Box, Circle
  - span “my current project needs a bean curd”: **make**/do trigger=“needs”; target drawn new indefinite kind=bean curd kind_span=“bean curd”

83. [drawing · main-synthetic · train · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

84. [drawing · ui-comparatives-v1 · train · drawing.drawn.size.delta] “make the lake a bit larger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “make the lake a bit larger”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.size = "(unlabelled)" from “larger” [delta, result]

85. [drawing · ui-comparatives-v1 · train · drawing.drawn.width.delta] “I want the lake a little narrower”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “I want the lake a little narrower”: **change**/do trigger=“want”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.width = "(unlabelled)" from “narrower” [delta, result]

86. [drawing · ui-coverage-v2 · train · drawing.object.make] “white cloud, size 50”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “white cloud, size 50”: **make**/do (no trigger); target drawn new indefinite kind=cloud kind_span=“cloud”
    - drawn.colour = "white" from “white” [eq, result]
    - drawn.size = "50" from “size 50” [eq, result]

87. [drawing · ui-coverage-v2 · train · drawing.objects.select] “I want to move these together, so select the red car and the road”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “I want to move these together, so select the red car and the road”: **select**/do trigger=“select”; target drawn existing definite fill=written name_span=“red car”
    - drawn.ids = "red car" from “red car” [eq, selector]
    - drawn.ids = "road" from “road” [eq, selector]

88. [drawing · ui-coverage-v2 · train · drawing.part.place] “the front wheel of the red car slipped; move it back to x 320, y 430”  — context: House, roof of the house, door of the house, window of the house, chimney of the house, Red car
  - span “the front wheel of the red car slipped; move it back to x 320, y 430”: **place**/do trigger=“move”; target part existing definite fill=written name_span=“front wheel”
    - part.id = "the red car" from “the red car” [eq, selector]
    - part.x = "320" from “x 320” [eq, result]
    - part.y = "430" from “y 430” [eq, result]

89. [drawing · ui-drawing-style-v1 · train · drawing.object.change] “for a sunset look, set all da objects fade into white”  — context: Heart, Dog, Arrow, Sun, Bird, tail of the dog
  - span “for a sunset look, set all da objects fade into white”: **change**/do trigger=“set”; target drawn existing definite fill=all description_span=“all da objects”
    - drawn.gradient = "white" from “white” [eq, result]

90. [drawing · ui-drawing-style-v1 · train · drawing.object.change] “it fadint to navy”  — context: Dog, Fish, Flower, Cat, Title, tail of the dog
  - span “it fadint to navy”: **change**/do (no trigger); target drawn existing definite fill=context
    - drawn.gradient = "navy" from “navy” [eq, result]

91. [drawing · ui-human-v1 · train · drawing.part.change] “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”  — context: Box, Circle, House
  - span “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“o1”
    - part.id = "o1" from “o1” [eq, selector]
    - part.index = "0" from “part 0” [eq, result]
    - part.colour = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

92. [drawing · ui-human-v1 · train · world-informed-completion] “I need a tree next to the house”  — context: House, Box, Circle
  - span “I need a tree next to the house”: **make**/do trigger=“need”; target drawn new indefinite kind=tree kind_span=“tree”
    - drawn.relation = "next_to" from “next to” [relation, result]
    - drawn.anchor = "the house" from “the house” [relation, selector]

93. [drawing · ui-natural-v1 · train · drawing.catalog.make] “draw me a chair”  — context: Box, Circle, House
  - span “draw me a chair”: **make**/do trigger=“draw”; target drawn new indefinite kind=chair kind_span=“chair”

94. [drawing · ui-natural-v1 · train · drawing.object.make] “draw a house, 160 wide, size 80, labelled Home”  — context: House, Box, Circle
  - span “draw a house, 160 wide, size 80, labelled Home”: **make**/do trigger=“draw”; target drawn new indefinite kind=house kind_span=“house”
    - drawn.width = "160" from “160” [eq, result]
    - drawn.size = "80" from “80” [eq, result]
    - drawn.label = "Home" from “Home” [eq, result]

95. [drawing · ui-quantities-v1 · train · None] “make some flowers left of the house”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “make some flowers left of the house”: **make**/do trigger=“make”; target drawn new indefinite kind=flower kind_span=“flowers”
    - drawn.relation = "left_of" from “left of” [relation, result]
    - drawn.anchor = "the house" from “the house” [relation, selector]

96. [drawing · ui-quantities-v1 · train · None] “put many fish in the lake”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “put many fish in the lake”: **make**/do trigger=“put”; target drawn new indefinite kind=fish kind_span=“fish”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake" from “the lake” [relation, selector]

97. [drawing · ui-relations-v1 · train · drawing.object.make] “give me a stump under that tree”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “give me a stump under that tree”: **make**/do trigger=“me”; target drawn new indefinite kind=stump kind_span=“stump”
    - drawn.relation = "below" from “under” [relation, result]
    - drawn.anchor = "that tree" from “that tree” [relation, selector]

98. [drawing · ui-relations-v1 · train · drawing.object.make] “please put a freighter in the lake there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put a freighter in the lake there”: **make**/do trigger=“put”; target drawn new indefinite kind=freighter kind_span=“freighter”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake there" from “the lake there” [relation, selector]

99. [drawing · ui-tiers-v1 · train · drawing.ids.show] “IDs, just briefly”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “IDs, just briefly”: **change**/do (no trigger); target page existing definite fill=context
    - page.mode = "temporary" from “briefly” [eq, result]

100. [drawing · ui-tiers-v1 · test · drawing.ids.show] “quick flash of the IDs”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “quick flash of the IDs”: **change**/do (no trigger); target page existing definite fill=context
    - page.mode = "temporary" from “quick flash” [eq, result]
