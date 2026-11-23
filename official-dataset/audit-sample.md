# Audit sample

100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.

1. [avatar · data-drop-v1 · train · compound] “My avatar should be a woman with glasses, and also change the avatar's shirt to green.”  — context: My avatar, Man, Woman, Old man, Old woman, Robot
  - span “My avatar should be a woman with glasses”: **change**/do trigger=“should”; target figure existing possessive fill=context
  - span “change the avatar's shirt to green”: **change**/do trigger=“change”; target figure existing possessive fill=context

2. [avatar · data-drop-v1 · train · None] “What did we settle on for my chosen avatar?”  — context: My avatar, Man, Woman, Old man, Old woman, Robot
  - span “What did we settle on for my chosen avatar?”: **answer**/ask trigger=“What”; target figure existing possessive fill=context description_span=“my chosen avatar”
    - question {"ask": "what"}

3. [avatar · demo-tool-profile · train · avatar.part.change] “set the "hat" part to the top hat variant”  — context: Avatar, hair back, shoulders, neck, ears, head
  - span “set the "hat" part to the top hat variant”: **change**/do trigger=“set”; target part existing definite fill=written
    - part.ids = "hat" from “"hat"” [eq, result]
    - part.variant = "top hat" from “top hat” [eq, result]

4. [avatar · main-synthetic · train · avatar.part.add] “add a salor collar back hair”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “add a salor collar back hair”: **make**/do trigger=“add”; target part new indefinite
    - part.id = "hair_back" from “back hair” [eq, result]
    - part.variant = "sailor collar" from “salor collar” [eq, result]

5. [avatar · main-synthetic · train · avatar.face.preset] “change an old man face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “change an old man face”: **change**/do trigger=“change”; target face existing definite fill=written name_span=“face”
    - face.preset = "old man" from “old man” [eq, result]
    - face.id = "face" from “face” [eq, selector]

6. [avatar · main-synthetic · train · avatar.part.change] “update a small ear”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “update a small ear”: **change**/do trigger=“update”; target part existing definite fill=description kind=ear kind_span=“ear”
    - part.variant = "small" from “small” [eq, result]

7. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “please make the mouth a lot tinier”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “please make the mouth a lot tinier”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.size = "(unlabelled)" from “tinier” [delta, result]

8. [avatar · ui-coverage-v2 · train · avatar.face.resize] “scale the character up”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “scale the character up”: **change**/do trigger=“scale”; target face existing definite fill=context
    - face.scale = "(unlabelled)" from “up” [delta, result]

9. [avatar · ui-coverage-v2 · train · avatar.part.change] “in the photo her eyes look brownish, so change them to brown here too”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “in the photo her eyes look brownish, so change them to brown here too”: **change**/do trigger=“change”; target part existing definite fill=description kind=eyes kind_span=“eyes”
    - part.colour = "brown" from “brown” [eq, result]

10. [avatar · ui-features-v1 · train · avatar.part.change] “longer hair”  — context: Avatar, fringe, pigtails, eyes, brows, nose
  - span “longer hair”: **change**/do (no trigger); target part existing definite fill=description kind=hair kind_span=“hair”
    - part.length = "(unlabelled)" from “longer” [delta, result]

11. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.scale = "1.1" from “1.1” [eq, result]

12. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=description kind=avatar kind_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]

13. [avatar · ui-systematic-v1 · train · avatar.figure.describe] “set the preset of the avatar to baby and the about to solar energy”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “set the preset of the avatar to baby and the about to solar energy”: **change**/do trigger=“set”; target figure existing definite fill=context
    - figure.preset = "baby" from “baby” [eq, result]
    - figure.about = "solar energy" from “solar energy” [eq, result]

14. [calendar · demo-tool-profile · train · None] “Let us which events are on Work 8 on 2026-12-08?. That would help.”  — context: Work 8, Room 8, Review
  - span “which events are on Work 8 on 2026-12-08?”: **answer**/ask trigger=“which”; target meeting existing definite fill=description
    - question {"ask": "list"}
    - meeting.calendar = "Work 8" from “Work 8” [eq, selector]
    - meeting.day = "2026-12-08" from “2026-12-08” [eq, selector]

15. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

16. [calendar · main-synthetic · train · calendar.meeting.change] “Room Main is the new home for the Intro meeting, which also takes the name Second”  — context: Intro, Review, Calendar
  - span “Room Main is the new home for the Intro meeting, which also takes the name Second”: **change**/do trigger=“name”; target meeting existing definite fill=written name_span=“Intro”
    - meeting.id = "Intro" from “Intro” [eq, selector]
    - meeting.title = "Second" from “Second” [eq, result]

17. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “I want it shorter”  — context: Review, Planning, Calendar
  - span “I want it shorter”: **change**/do trigger=“want”; target meeting existing definite fill=context
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

18. [calendar · ui-coverage-v2 · train · calendar.person.add] “new person: Dana”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “new person: Dana”: **make**/do (no trigger); target person new indefinite kind=person kind_span=“person”
    - person.name = "Dana" from “Dana” [eq, result]

19. [calendar · ui-human-v1 · dev · calendar.meeting.change] “set review as Weekly review”  — context: Review, Calendar
  - span “set review as Weekly review”: **change**/do trigger=“set”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Weekly review" from “Weekly review” [eq, result]

20. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

21. [calendar · ui-systematic-v1 · train · calendar.meeting.add] “add a meeting for 30 minutes on Monday at 10:00 with notes bring the slides and title Quarterly plan and participants Ana and Lee and room Cedar room”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “add a meeting for 30 minutes on Monday at 10:00 with notes bring the slides and title Quarterly plan and participants Ana and Lee and room Cedar room”: **make**/do trigger=“add”; target meeting new indefinite kind=meeting kind_span=“meeting”
    - meeting.length = "30" from “30” [eq, result]
    - meeting.notes = "bring the slides" from “bring the slides” [eq, result]
    - meeting.title = "Quarterly plan" from “Quarterly plan” [eq, result]
    - meeting.day = "Monday" from “Monday” [eq, result]
    - meeting.time = "10:00" from “10:00” [eq, result]
    - meeting.people = "Ana and Lee" from “Ana and Lee” [eq, result]
    - meeting.room = "Cedar room" from “Cedar room” [eq, result]

22. [calendar · ui-tiers-v1 · train · calendar.meeting.add] “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”: **make**/do trigger=“add”; target meeting new indefinite kind=dentist appointment kind_span=“dentist appointment”
    - meeting.calendar = "Family" from “Family” [eq, result]
    - meeting.day = "Wednesday" from “Wednesday” [eq, result]
    - meeting.time = "4:30" from “4:30” [eq, result]

23. [diagram · data-drop-v1 · train · None] “enter Rider, Tool nad Miles into the frist row of a table”  — context: Log, Strip, n3, n4, Fixed?, Ride
  - span “enter Rider, Tool nad Miles into the frist row of a table”: **make**/do trigger=“enter”; target node new indefinite kind=table kind_span=“table”

24. [diagram · data-drop-v1 · train · None] “the missing piece: callout arrow heads ouline only on the profit chart”  — context: Monthly profit
  - span “the missing piece: callout arrow heads ouline only on the profit chart”: **change**/do (no trigger); target chart existing definite fill=context

25. [diagram · data-drop-v1 · train · None] “when you have a minute, add a circle on the Draft box sized 0.5 inch and coloured red so the annotation reads clearly”  — context: Draft, Review, n3, n4, Publish?, Launch
  - span “when you have a minute, add a circle on the Draft box sized 0.5 inch and coloured red so the annotation reads clearly”: **make**/do trigger=“have”; target node new indefinite kind=circle kind_span=“circle”
    - node.position = "next to" from “on the Draft box” [relation, result]
    - node.size = "0.5 inch" from “0.5 inch” [eq, result]
    - node.colour = "red" from “red” [eq, result]
    - node.anchor = "the Draft box" from “the Draft box” [relation, selector]

26. [diagram · data-drop-v1 · train · None] “axes both upright again”  — context: Revenue trend
  - span “axes both upright again”: **change**/do (no trigger); target chart existing definite fill=context
    - chart.invert = "both off" from “both upright again” [eq, result]

27. [diagram · data-drop-v1 · train · None] “how do I draw a Sankey diagram with real widths?”  — context: Receive, Inspect, Store, Scrap, e1, e2
  - span “how do I draw a Sankey diagram with real widths?”: **make**/do trigger=“do”; target diagram new indefinite
    - diagram.kind = "Sankey diagram" from “Sankey diagram” [eq, result]
    - link.width = "proportional" from “width” [eq, result]

28. [diagram · data-drop-v1 · train · compound] “keep the marker faces purple, also drop the legend on the right”  — context: Order value by quantity
  - span “keep the marker faces purple”: **change**/do trigger=“keep”; target chart existing definite fill=context
  - span “drop the legend on the right”: **change**/do trigger=“drop”; target chart existing definite fill=context
    - chart.legend = "right" from “on the right” [eq, result]

29. [diagram · data-drop-v1 · train · None] “Can you spot the steepest revenue climb for me?”  — context: Monthly revenue
  - span “Can you spot the steepest revenue climb for me”: **answer**/ask trigger=“Can”; target chart existing definite fill=context
    - question {"ask": "max"}

30. [diagram · data-drop-v1 · train · None] “set the node labels with a line break after the first word, please”  — context: Receive, Inspect, Store, e1, e2
  - span “set the node labels with a line break after the first word, please”: **change**/do trigger=“set”; target node existing quantified fill=all

31. [diagram · data-drop-v1 · train · None] “how do I get the arrow labels 0.5cm off the line?”  — context: Input, Output, e1
  - span “how do I get the arrow labels 0.5cm off the line?”: **change**/do trigger=“do”; target link existing quantified fill=all

32. [diagram · data-drop-v1 · train · None] “let's make the arrow labels 0.5cm off the line now”  — context: Input, Output, e1
  - span “let's make the arrow labels 0.5cm off the line now”: **change**/do trigger=“let's”; target link existing quantified fill=all

33. [diagram · data-drop-v1 · train · None] “So, give me a line chart of revenue by category, one named series per category for the client call, please”  — context: (empty)
  - span “give me a line chart of revenue by category, one named series per category for the client call”: **make**/do trigger=“give”; target chart new indefinite
    - chart.type = "line" from “line chart” [eq, result]

34. [diagram · data-drop-v1 · train · compound] “plot one line per plan, then move the legend to the right”  — context: (empty)
  - span “plot one line per plan”: **make**/do trigger=“plot”; target chart new indefinite kind=line chart kind_span=“line”
  - span “then move the legend to the right”: **arrange**/do trigger=“move”; target chart existing definite fill=context
    - chart.legend = "right" from “move the legend to the right” [eq, result]

35. [diagram · data-drop-v1 · train · compound] “rotate the first half clockwize and the second half counterclockwise”  — context: Plan, Build, Test, Fix, Ship, Release
  - span “rotate the first half clockwize”: **change**/do trigger=“rotate”; target node existing definite fill=context
    - node.position = "clockwize" from “clockwize” [eq, result]
  - span “the second half counterclockwise”: **change**/do trigger=“the”; target node existing definite fill=context
    - node.position = "counterclockwise" from “counterclockwise” [eq, result]

36. [diagram · data-drop-v1 · train · None] “place the biggest next to the second tiniest and leave every one of the other figures in the row exactly where it is so the arrangement stays clear and readable”  — context: Tiny, Little, Middle, Big, Giant
  - span “place the biggest next to the second tiniest”: **place**/do trigger=“place”; target node existing definite fill=context
    - node.size = "huge" from “biggest” [degree, selector]
    - node.position = "next to the second tiniest" from “next to the second tiniest” [eq, result]

37. [diagram · data-drop-v1 · test · None] “did we get all the way back to the beginning”  — context: Hold, Clean, Fill, Seal, Label
  - span “did we get all the way back to the beginning”: **answer**/ask trigger=“the”; target diagram existing definite fill=context
    - question {"ask": "exists"}

38. [diagram · data-drop-v1 · train · None] “I'd rather see spend by category in a pie chart than in the spreadsheet, because the regional leads want to know which category leads”  — context: Revenue by region, Store revenue, Utilisation by team
  - span “I'd rather see spend by category in a pie chart than in the spreadsheet, because the regional leads want to know which category leads”: **make**/do trigger=“see”; target chart new indefinite kind=chart kind_span=“chart”
    - chart.type = "pie" from “pie chart” [eq, result]
    - chart.dimension = "category" from “category” [eq, result]
    - chart.measure = "spend" from “spend” [eq, result]

39. [diagram · data-drop-v1 · train · None] “the space between Flag and Inbox needs to grow”  — context: Inbox, Queue, Sort, Send, Bounce, Reply
  - span “the space between Flag and Inbox needs to grow”: **arrange**/do trigger=“needs”; target node existing definite fill=written name_span=“Flag”
    - node.ids = "Flag" from “Flag” [eq, selector]
    - node.ids = "Inbox" from “Inbox” [eq, selector]

40. [diagram · demo-tool-profile · train · diagram.node.change] “Could you make Pie A purple. I appreciate it.”  — context: Pie A, Slice 1
  - span “make Pie A purple”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Pie A”
    - node.colour = "purple" from “purple” [eq, result]

41. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

42. [diagram · human-adapted-v1-diagram · train · None] “Insert a line chart with following data, 2016 6.7%, 2017 6.9%, 2018 6.6%, 2019 6.1%, 2020 2.3%, 2021 8.1%”  — context: (empty)
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

43. [diagram · main-synthetic · train · diagram.group.layout] “place a layyers Backup”  — context: Backup, link, Sales, Process
  - span “place a layyers Backup”: **arrange**/do trigger=“place”; target group existing definite fill=written name_span=“Backup”
    - group.id = "Backup" from “Backup” [eq, selector]

44. [diagram · ui-comparatives-v1 · train · diagram.node.size.delta] “make Decision much bigger”  — context: Start, Finish, Decision
  - span “make Decision much bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Decision”
    - node.ids = "Decision" from “Decision” [eq, selector]
    - node.size = "(unlabelled)" from “bigger” [delta, result]

45. [diagram · ui-composition-v1 · train · diagram.compose] “could you a line chart with plausible values”  — context: Begin, Ready?, Ship
  - span “could you a line chart with plausible values”: **make**/do trigger=“chart”; target composition new indefinite kind=chart kind_span=“line chart”
    - chart.values = "plausible" from “plausible values” [eq, result]
    - chart.type = "line" from “line chart” [eq, result]

46. [diagram · ui-coverage-v2 · train · diagram.node.make] “small yellow star”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “small yellow star”: **make**/do (no trigger); target node new indefinite kind=star kind_span=“star”
    - node.size = "small" from “small” [degree, result]
    - node.colour = "yellow" from “yellow” [eq, result]

47. [diagram · ui-diagram-v2 · train · diagram.node.remove] “the Build step away”  — context: Database, Payment, Build, e1
  - span “the Build step away”: **remove**/do trigger=“away”; target node existing definite fill=written name_span=“Build”
    - node.ids = "Build" from “Build” [eq, selector]

48. [diagram · ui-diagram-v2 · train · diagram.ids.show] “hide IDs”  — context: Sales, Customer, Settings, e1, e2, Backend services
  - span “hide IDs”: **change**/do trigger=“hide”; target page existing definite fill=context

49. [diagram · ui-diagram-v2 · train · diagram.series.make] “could you draw Costs as a second series: 8, 15, 120”  — context: Onboarding, Research, Deploy, Valid?, Quarterly revenue, 2022
  - span “could you draw Costs as a second series: 8, 15, 120”: **make**/do trigger=“draw”; target series new indefinite
    - series.label = "Costs" from “Costs” [eq, result]
    - series.values = "8" from “8” [eq, result]
    - series.values = "15" from “15” [eq, result]
    - series.values = "120" from “120” [eq, result]

50. [diagram · ui-diagram-v2 · train · diagram.chart.make] “just draw a polar area chart of sales by month”  — context: Settings, Done, Marketing, Draft, e1, e2
  - span “just draw a polar area chart of sales by month”: **make**/do trigger=“draw”; target chart new indefinite
    - chart.type = "polarArea" from “polar area chart” [eq, result]

51. [diagram · ui-diagram-v2-voice · train · compound] “delete Dashboard and connect Valid? to End”  — context: Start, Login, Valid?, Dashboard, End, n6
  - span “delete Dashboard”: **remove**/do trigger=“delete”; target node existing definite fill=written name_span=“Dashboard”
    - node.ids = "Dashboard" from “Dashboard” [eq, selector]
  - span “connect Valid? to End”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Valid?" from “Valid?” [eq, result]
    - link.to = "End" from “End” [eq, result]

52. [diagram · ui-human-v1 · train · diagram.group.change] “turn the members of g1 blue and large and label it Updated process”  — context: Process, link, Sales
  - span “turn the members of g1 blue and large and label it Updated process”: **change**/do trigger=“turn”; target group existing definite fill=written name_span=“g1”
    - group.id = "g1" from “g1” [eq, selector]
    - group.label = "Updated process" from “Updated process” [eq, result]
    - group.colour = "blue" from “blue” [eq, result]
    - group.size = "large" from “large” [degree, result]

53. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **arrange**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

54. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **arrange**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

55. [diagram · ui-quantities-v1 · train · compound] “create a box and 2 diamonds”  — context: Box, Circle
  - span “create a box”: **make**/do trigger=“create”; target node new indefinite kind=box kind_span=“box”
  - span “2 diamonds”: **make**/do (no trigger); target node new indefinite kind=diamond kind_span=“diamonds”
    - node.n = "2" from “2” [eq, result]

56. [diagram · ui-systematic-v1 · train · diagram.link.make] “connect a link from Start to Review with colour green”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “connect a link from Start to Review with colour green”: **connect**/do trigger=“connect”; target link new indefinite kind=link kind_span=“link”
    - link.colour = "green" from “green” [eq, result]
    - link.from = "Start" from “Start” [eq, result]
    - link.to = "Review" from “Review” [eq, result]

57. [diagram · ui-systematic-v1 · train · diagram.link.make] “connect a link from Start to Review with style dashed”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “connect a link from Start to Review with style dashed”: **connect**/do trigger=“connect”; target link new indefinite kind=link kind_span=“link”
    - link.style = "dashed" from “dashed” [eq, result]
    - link.from = "Start" from “Start” [eq, result]
    - link.to = "Review" from “Review” [eq, result]

58. [diagram · ui-systematic-v1 · train · diagram.link.make] “connect a link from Start to Review with head arrow”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “connect a link from Start to Review with head arrow”: **connect**/do trigger=“connect”; target link new indefinite kind=link kind_span=“link”
    - link.head = "arrow" from “arrow” [eq, result]
    - link.from = "Start" from “Start” [eq, result]
    - link.to = "Review" from “Review” [eq, result]

59. [diagram · ui-tiers-v1 · train · diagram.group.resize] “Survey results: a little smaller”  — context: Sales by region, Monthly visitors, Quarterly revenue, Survey results, North, South
  - span “Survey results: a little smaller”: **change**/do (no trigger); target group existing definite fill=written name_span=“Survey results”
    - group.id = "Survey results" from “Survey results” [eq, selector]
    - group.scale = "(unlabelled)" from “smaller” [delta, result]

60. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

61. [document · demo-tool-profile · train · document.block.change] “Could you replace Meeting recap with "The room is available after lunch.". Thanks!”  — context: Draft, Meeting recap, Summary points
  - span “replace Meeting recap with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Meeting recap”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

62. [document · main-synthetic · train · document.block.select] “pick the blcok Intro plus 2 and 3”  — context: Intro, 3, 2, Intro, Notes
  - span “pick the blcok Intro plus 2 and 3”: **select**/do trigger=“pick”; target block existing definite fill=written name_span=“Intro”
    - block.id = "Intro" from “Intro” [eq, selector]
    - block.id = "Intro" from “Intro” [eq, selector]

63. [document · ui-coverage-v2 · train · document.compose] “a quick note for the neighbours about the party, 60 words max”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “a quick note for the neighbours about the party, 60 words max”: **make**/do (no trigger); target text new indefinite
    - text.genre = "note" from “note” [eq, result]
    - text.about = "about the party" from “about the party” [eq, result]
    - text.words = "60" from “60 words max” [eq, result]

64. [document · ui-human-v1 · train · compound] “change the chapter heading to Overview and tidy the first paragraph”  — context: paragraph, paragraph, Notes
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=description kind=chapter kind_span=“chapter”
    - section.text = "Overview" from “Overview” [eq, result]
  - span “tidy”: **change**/do trigger=“tidy”; target block existing definite fill=context

65. [document · ui-natural-v1 · train · document.section.change] “give b1 the heading Overview at level 1”  — context: Notes
  - span “give b1 the heading Overview at level 1”: **change**/do trigger=“give”; target section existing definite fill=written name_span=“b1”
    - section.id = "b1" from “b1” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]
    - section.level = "1" from “level 1” [eq, result]

66. [document · ui-systematic-v1 · dev · document.write] “write a document with title Quarterly plan and genre letter and topic solar energy and blocks one paragraph”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “write a document with title Quarterly plan and genre letter and topic solar energy and blocks one paragraph”: **make**/do trigger=“write”; target text new indefinite kind=document kind_span=“document”
    - text.title = "Quarterly plan" from “Quarterly plan” [eq, result]
    - text.genre = "letter" from “letter” [eq, result]
    - text.about = "solar energy" from “solar energy” [eq, result]
    - text.content = "one paragraph" from “one paragraph” [eq, result]

67. [document · ui-tiers-v1 · train · document.block.mark] “link "pricing" to example.com/prices”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “link "pricing" to example.com/prices”: **change**/do trigger=“link”; target block existing definite fill=context
    - block.mark = "link" from “link” [eq, result]
    - block.text = "pricing" from “pricing” [eq, selector]
    - block.attrs = "example.com/prices" from “example.com/prices” [eq, result]

68. [drawing · data-drop-v1 · train · None] “swap the cloud for a little grey rain cloud”  — context: Fish, Bird, Bird 2, Boat, Cat, Tree
  - span “swap the cloud for a little grey rain cloud”: **change**/do trigger=“swap”; target drawn existing definite fill=description kind=cloud kind_span=“cloud”
    - drawn.colour = "grey" from “grey” [eq, result]
    - drawn.variant = "rain cloud" from “a little grey rain cloud” [eq, result]

69. [drawing · data-drop-v1 · train · None] “let the house front be stone”  — context: House, Tree, Sun, Cloud
  - span “let the house front be stone”: **change**/do trigger=“let”; target part existing definite fill=description kind=front kind_span=“house front”
    - drawn.material = "stone" from “stone” [eq, result]

70. [drawing · data-drop-v1 · train · None] “which of the boats is the tiniest?”  — context: Boat, Boat 2, Boat 3, Lake, Tree
  - span “which of the boats is the tiniest?”: **answer**/ask trigger=“which”; target drawn existing definite fill=all kind=boat kind_span=“boats”
    - question {"ask": "min"}

71. [drawing · data-drop-v1 · train · None] “the bench by the tree should be over on the right side”  — context: Bench, Tree, House, Sun, Girl
  - span “the bench by the tree should be over on the right side”: **change**/do trigger=“should”; target drawn existing definite fill=description kind=bench kind_span=“bench” description_span=“the bench by the tree”
    - drawn.at = "right" from “the right side” [region, result]

72. [drawing · data-drop-v1 · train · compound] “could you put a medium red stall over on the left side, a medium vendor facing right standing just behind the stall, a small boy standing right in front of the stall, and a small white apron on the vendor”  — context: Street, Tree
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
    - part.colour = "white" from “white” [eq, result]

73. [drawing · data-drop-v1 · train · None] “turn the scene into a wet and windy evening”  — context: House, Tree, Sun, Lake, Cloud, Boat
  - span “turn the scene into a wet and windy evening”: **change**/do trigger=“turn”; target page existing definite fill=context

74. [drawing · data-drop-v1 · train · None] “put the owrd 'CAFE' in white along the bottom edge”  — context: House, Tree, Sun, Lake, Cloud, Boat
  - span “put the owrd 'CAFE' in white along the bottom edge”: **make**/do trigger=“put”; target drawn new indefinite
    - drawn.at = "bottom" from “along the bottom edge” [region, result]
    - drawn.text = "the owrd 'CAFE' in white" from “the owrd 'CAFE' in white” [eq, result]

75. [drawing · data-drop-v1 · train · None] “hey — make the big man in the blue cap face left”  — context: House, Tree, Sun, Cloud, Lake, Bench
  - span “make the big man in the blue cap face left”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=man kind_span=“man” description_span=“the big man in the blue cap”
    - drawn.size = "big" from “big” [degree, selector]
    - drawn.facing = "left" from “left” [eq, result]
    - drawn.wear = "the blue cap" from “the blue cap” [eq, result]

76. [drawing · data-drop-v1 · train · compound] “show me a flowerbed, a boy, a watering can, and an owl”  — context: Tree, Fence
  - span “show me a flowerbed”: **make**/do trigger=“show”; target drawn new indefinite kind=flowerbed kind_span=“flowerbed”
  - span “a boy”: **make**/do (no trigger); target drawn new indefinite kind=boy kind_span=“boy”
  - span “a watering can”: **make**/do (no trigger); target drawn new indefinite kind=watering can kind_span=“watering can”
  - span “an owl”: **make**/do (no trigger); target drawn new indefinite kind=owl kind_span=“owl”

77. [drawing · data-drop-v1 · train · compound] “a huge bear in the woods facing left, then i want the bear in the woods looking at the pond”  — context: House, Tree, Sun, Cloud, Lake, Bench
  - span “a huge bear in the woods facing left”: **make**/do (no trigger); target drawn new indefinite kind=bear kind_span=“bear”
    - drawn.size = "huge" from “huge” [degree, result]
    - drawn.relation = "in" from “in the woods” [relation, result]
    - drawn.facing = "left" from “left” [eq, result]
    - drawn.anchor = "the woods" from “the woods” [relation, selector]
  - span “i want the bear in the woods looking at the pond”: **change**/do trigger=“want”; target drawn existing definite fill=description kind=bear kind_span=“bear” description_span=“the bear in the woods”
    - drawn.relation = "in" from “in the woods” [relation, selector]
    - drawn.facing = "pond" from “the pond” [eq, result]
    - drawn.anchor = "the woods" from “the woods” [relation, selector]

78. [drawing · data-drop-v1 · train · compound] “a library in the afternoon with a medium storyteller sitting right on the rug, four small red cushions in a row right on the rug, three small children sitting around the storyteller, and a small white rabbit right next to the storyteller, and keep the people in the foreground from now on”  — context: Rug, Shelf
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
    - preference.scope = "from now on" from “from now on” [eq, result]

79. [drawing · data-drop-v1 · train · compound] “put a dog on the lawn facing right, and put a cat on the bench facing left”  — context: House, Tree, Sun, Cloud, Lake, Bench
  - span “put a dog on the lawn facing right”: **make**/do trigger=“put”; target drawn new indefinite kind=dog kind_span=“dog”
    - drawn.relation = "on" from “on the lawn” [relation, result]
    - drawn.facing = "right" from “right” [eq, result]
    - drawn.anchor = "the lawn" from “the lawn” [relation, selector]
  - span “put a cat on the bench facing left”: **make**/do trigger=“put”; target drawn new indefinite kind=cat kind_span=“cat”
    - drawn.relation = "on" from “on the bench” [relation, result]
    - drawn.facing = "left" from “left” [eq, result]
    - drawn.anchor = "the bench" from “the bench” [relation, selector]

80. [drawing · data-drop-v1 · train · compound] “next, a rooftop terrace in the evening breeze at sunset with a woman, three lanterns, two chairs, and a cat”  — context: Parapet, Door
  - span “next, a rooftop terrace in the evening breeze”: **change**/do (no trigger); target page existing definite fill=context
  - span “at sunset”: **change**/do (no trigger); target page existing definite fill=context
  - span “a woman”: **make**/do (no trigger); target drawn new indefinite kind=woman kind_span=“woman”
  - span “three lanterns”: **make**/do (no trigger); target drawn new quantified kind=lantern kind_span=“lanterns”
    - drawn.count = "(unlabelled)" from “three” [eq, result]
  - span “two chairs”: **make**/do (no trigger); target drawn new quantified kind=chair kind_span=“chairs”
    - drawn.count = "(unlabelled)" from “two” [eq, result]
  - span “a cat”: **make**/do (no trigger); target drawn new indefinite kind=cat kind_span=“cat”

81. [drawing · data-drop-v1 · train · None] “fill the rug with one flat colour”  — context: Shirt, Wall, Rug, Banner, Plate
  - span “fill the rug with one flat colour”: **make**/do trigger=“fill”; target drawn existing definite fill=context kind=rug kind_span=“rug”
    - drawn.fill = "one flat colour" from “one flat colour” [eq, result]

82. [drawing · data-drop-v1 · train · None] “maybe a little cat could go near the tree, but not so close that the door is blocked.”  — context: House, Tree, Bench, Barn, Well, Fence
  - span “maybe a little cat could go near the tree, but not so close that the door is blocked.”: **make**/do (no trigger); target drawn new indefinite kind=cat kind_span=“cat”
    - drawn.relation = "near" from “near” [relation, result]
    - drawn.anchor = "the tree" from “the tree” [relation, selector]

83. [drawing · data-drop-v1 · dev · None] “Would it be possible to use dashed lines by default?”  — context: My avatar, Man, Woman, Old man, Old woman, Robot
  - span “Would it be possible to use dashed lines by default?”: **change**/do trigger=“Would”; target page existing definite fill=context

84. [drawing · demo-tool-profile · train · drawing.object.change] “Let us make Mo red. That would help.”  — context: Mo, Pip
  - span “make Mo red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Mo”
    - drawn.colour = "red" from “red” [eq, result]

85. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

86. [drawing · human-adapted-v1-drawing · train · None] “is the boy large?”  — context: Boy
  - span “is the boy large?”: **answer**/check trigger=“is”; target drawn existing definite fill=description kind=boy kind_span=“boy”
    - question {"ask": "describe"}

87. [drawing · human-adapted-v1-drawing · train · None] “Have there be a measuring cup by the fruit”  — context: Clear bowl, Fruit
  - span “Have there be a measuring cup by the fruit”: **make**/do trigger=“Have there be”; target drawn new indefinite kind=measuring cup kind_span=“measuring cup”
    - drawn.relation = "near" from “by” [relation, result]
    - drawn.anchor = "the fruit" from “the fruit” [relation, selector]

88. [drawing · main-synthetic · train · drawing.object.make] “I could use a masts here”  — context: House, Box, Circle
  - span “I could use a masts here”: **make**/do trigger=“use”; target drawn new indefinite kind=masts kind_span=“masts”

89. [drawing · main-synthetic · train · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

90. [drawing · ui-comparatives-v1 · train · drawing.drawn.size.delta] “make the lake a bit larger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “make the lake a bit larger”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.size = "(unlabelled)" from “larger” [delta, result]

91. [drawing · ui-composition-v1 · train · drawing.compose] “can you draw a random picture with three sheep in it!”  — context: House, Old oak
  - span “can you draw a random picture with three sheep in it!”: **make**/do trigger=“draw”; target composition new indefinite
    - composition.source = "random" from “random” [eq, result]
    - composition.with = "sheep" from “three sheep” [eq, result]

92. [drawing · ui-coverage-v2 · train · drawing.object.make] “white cloud, size 50”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “white cloud, size 50”: **make**/do (no trigger); target drawn new indefinite kind=cloud kind_span=“cloud”
    - drawn.colour = "white" from “white” [eq, result]
    - drawn.size = "50" from “size 50” [eq, result]

93. [drawing · ui-coverage-v2 · train · drawing.part.place] “the front wheel of the red car slipped; move it back to x 320, y 430”  — context: House, roof of the house, door of the house, window of the house, chimney of the house, Red car
  - span “the front wheel of the red car slipped; move it back to x 320, y 430”: **place**/do trigger=“move”; target part existing definite fill=written name_span=“front wheel”
    - part.id = "the red car" from “the red car” [eq, selector]
    - part.x = "320" from “x 320” [eq, result]
    - part.y = "430" from “y 430” [eq, result]

94. [drawing · ui-drawing-style-v1 · train · drawing.object.change] “it fadint to navy”  — context: Dog, Fish, Flower, Cat, Title, tail of the dog
  - span “it fadint to navy”: **change**/do (no trigger); target drawn existing definite fill=context
    - drawn.gradient = "navy" from “navy” [eq, result]

95. [drawing · ui-human-v1 · train · drawing.part.change] “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”  — context: Box, Circle, House
  - span “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“o1”
    - part.id = "o1" from “o1” [eq, selector]
    - part.index = "0" from “part 0” [eq, result]
    - part.colour = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

96. [drawing · ui-natural-v1 · train · drawing.catalog.make] “draw me a chair”  — context: Box, Circle, House
  - span “draw me a chair”: **make**/do trigger=“draw”; target drawn new indefinite kind=chair kind_span=“chair”

97. [drawing · ui-quantities-v1 · train · None] “make some flowers left of the house”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “make some flowers left of the house”: **make**/do trigger=“make”; target drawn new indefinite kind=flower kind_span=“flowers”
    - drawn.relation = "left_of" from “left of” [relation, result]
    - drawn.anchor = "the house" from “the house” [relation, selector]

98. [drawing · ui-relations-v1 · train · drawing.object.make] “please put a freighter in the lake there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put a freighter in the lake there”: **make**/do trigger=“put”; target drawn new indefinite kind=freighter kind_span=“freighter”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake there" from “the lake there” [relation, selector]

99. [drawing · ui-systematic-v1 · test · drawing.catalog.make] “add a giraffe with edge left and behind the house”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “add a giraffe with edge left and behind the house”: **make**/do trigger=“add”; target drawn new indefinite kind=giraffe kind_span=“giraffe”
    - drawn.edge = "left" from “left” [eq, result]
    - drawn.behind = "the house" from “the house” [eq, result]

100. [drawing · ui-tiers-v1 · test · drawing.ids.show] “quick flash of the IDs”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “quick flash of the IDs”: **change**/do (no trigger); target page existing definite fill=context
    - page.mode = "temporary" from “quick flash” [eq, result]
