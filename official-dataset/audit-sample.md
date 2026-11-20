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

3. [avatar · main-synthetic · train · avatar.face.preset] “fix a gril face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “fix a gril face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "girl" from “gril” [eq, result]
    - face.id = "face" from “face” [eq, selector]

4. [avatar · main-synthetic · test · avatar.face.preset] “a man for me, face”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “a man for me, face”: **change**/do (no trigger); target face existing definite fill=written name_span=“face”
    - face.preset = "man" from “man” [eq, result]
    - face.id = "face" from “face” [eq, selector]

5. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “could you make the head a lot larger”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “could you make the head a lot larger”: **change**/do trigger=“make”; target part existing definite fill=description kind=head kind_span=“head”
    - part.size = "(unlabelled)" from “larger” [delta, result]

6. [avatar · ui-comparatives-v1 · train · avatar.part.size.delta] “please make the mouth a lot tinier”  — context: Avatar, eyes, nose, mouth, ears, eyebrows
  - span “please make the mouth a lot tinier”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.size = "(unlabelled)" from “tinier” [delta, result]

7. [avatar · ui-coverage-v2 · train · avatar.face.resize] “scale the character up”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “scale the character up”: **change**/do trigger=“scale”; target face existing definite fill=context
    - face.scale = "(unlabelled)" from “up” [delta, result]

8. [avatar · ui-coverage-v2 · train · avatar.part.change] “in the photo her eyes look brownish, so change them to brown here too”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “in the photo her eyes look brownish, so change them to brown here too”: **change**/do trigger=“change”; target part existing definite fill=description kind=eyes kind_span=“eyes”
    - part.colour = "brown" from “brown” [eq, result]

9. [avatar · ui-coverage-v2 · dev · avatar.part.change] “big lips”  — context: Avatar, fringe, ponytail, eyes, brows, nose
  - span “big lips”: **change**/do (no trigger); target part existing definite fill=written name_span=“lips”
    - part.ids = "lips" from “lips” [eq, selector]
    - part.size = "big" from “big” [degree, result]

10. [avatar · ui-features-v1 · train · avatar.part.change] “longer hair”  — context: Avatar, fringe, pigtails, eyes, brows, nose
  - span “longer hair”: **change**/do (no trigger); target part existing definite fill=description kind=hair kind_span=“hair”
    - part.length = "(unlabelled)" from “longer” [delta, result]

11. [avatar · ui-features-v1 · train · avatar.part.change] “switch her to short hair”  — context: Avatar, fringe, pigtails, eyes, brows, nose
  - span “switch her to short hair”: **change**/do trigger=“switch”; target part existing definite fill=description kind=hair kind_span=“hair”
    - part.length = "short" from “short” [degree, result]

12. [avatar · ui-human-v1 · train · avatar.part.resize] “make the mouth 1.1”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “make the mouth 1.1”: **change**/do trigger=“make”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.scale = "1.1" from “1.1” [eq, result]

13. [avatar · ui-human-v1 · train · avatar.part.add] “put on a cap”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “put on a cap”: **make**/do trigger=“put”; target part new indefinite
    - part.variant = "cap" from “cap” [eq, result]

14. [avatar · ui-human-v1 · train · avatar.part.change] “switch the mouth to the smile variant, kind of large”  — context: mouth, earrings, hair front, eyebrows, eyes, nose
  - span “switch the mouth to the smile variant, kind of large”: **change**/do trigger=“switch”; target part existing definite fill=description kind=mouth kind_span=“mouth”
    - part.variant = "smile" from “smile” [eq, result]
    - part.size = "(unlabelled)" from “kind of large” [eq, result]

15. [avatar · ui-natural-v1 · train · avatar.face.compose] “use the old woman appearance for the avatar”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “use the old woman appearance for the avatar”: **change**/do trigger=“use”; target face existing definite fill=description kind=avatar kind_span=“avatar”
    - face.base = "old woman" from “old woman” [eq, result]

16. [avatar · ui-natural-v1 · train · avatar.face.expression] “give the avatar a happy look”  — context: Avatar, earrings, hair front, eyebrows, eyes, nose
  - span “give the avatar a happy look”: **change**/do trigger=“give”; target face existing definite fill=description kind=avatar kind_span=“avatar”
    - face.expression = "happy" from “happy” [eq, result]

17. [calendar · demo-tool-profile · train · calendar.meeting.add] “Please, put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes. Thanks!”  — context: Work 6, Living room
  - span “put Review on the Work 6 calendar on 2026-12-10 at 14:00 UTC for 30 minutes”: **make**/do trigger=“put”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 6" from “Work 6” [eq, result]
    - meeting.day = "2026-12-10" from “2026-12-10” [eq, result]
    - meeting.time = "14:00" from “14:00” [eq, result]
    - meeting.length = "30" from “30 minutes” [eq, result]

18. [calendar · demo-tool-profile · train · calendar.meeting.move] “Please, put Review to 2026-12-03 at 11:00 UTC. Thanks!”  — context: Work 3, Pool lane 3, Review
  - span “put Review to 2026-12-03 at 11:00 UTC”: **place**/do trigger=“put”; target meeting existing definite fill=written name_span=“Review”
    - meeting.day = "2026-12-03" from “2026-12-03” [eq, result]
    - meeting.time = "11:00" from “11:00” [eq, result]

19. [calendar · demo-tool-profile · train · None] “Let us add a calendar called Work 1; then schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes. That would help.”  — context: Room 1
  - span “add a calendar called Work 1”: **make**/do trigger=“add”; target calendar new indefinite
    - calendar.name = "Work 1" from “Work 1” [eq, result]
  - span “schedule Review on Work 1 on 2026-12-05 at 09:00 UTC for 15 minutes”: **make**/do trigger=“schedule”; target meeting new indefinite
    - meeting.title = "Review" from “Review” [eq, result]
    - meeting.calendar = "Work 1" from “Work 1” [eq, result]
    - meeting.day = "2026-12-05" from “2026-12-05” [eq, result]
    - meeting.time = "09:00" from “09:00” [eq, result]
    - meeting.length = "15" from “15 minutes” [eq, result]

20. [calendar · main-synthetic · train · meeting.observe] “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”  — context: Review, Calendar
  - span “Between the migration mess and three different admins poking at things all week, I genuinely can't tell anymore — when you get a second, how many calendars are actually in there?”: **answer**/ask trigger=“how many”; target calendar existing definite fill=all kind=calendars kind_span=“calendars”
    - question {"ask": "count"}

21. [calendar · main-synthetic · train · meeting.observe] “Mind telling me whether there's a calender anywhere in here?”  — context: Review, Calendar
  - span “Mind telling me whether there's a calender anywhere in here?”: **answer**/check trigger=“whether there's”; target calendar existing definite fill=all kind=calender kind_span=“calender”
    - question {"ask": "exists"}

22. [calendar · ui-comparatives-v1 · train · calendar.meeting.length.delta] “Make Review a bit longer.”  — context: Review, Planning, Calendar
  - span “Make Review a bit longer.”: **change**/do trigger=“Make”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]
    - meeting.length = "(unlabelled)" from “longer” [delta, result]

23. [calendar · ui-comparatives-v1 · dev · calendar.meeting.length.delta] “I want it shorter”  — context: Review, Planning, Calendar
  - span “I want it shorter”: **change**/do trigger=“want”; target meeting existing definite fill=context
    - meeting.length = "(unlabelled)" from “shorter” [delta, result]

24. [calendar · ui-coverage-v2 · test · calendar.person.add] “new person: Dana”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “new person: Dana”: **make**/do (no trigger); target person new indefinite kind=person kind_span=“person”
    - person.name = "Dana" from “Dana” [eq, result]

25. [calendar · ui-coverage-v2 · train · calendar.meeting.add] “book a two hour workshop with Lee and Priya on Friday at 1pm”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “book a two hour workshop with Lee and Priya on Friday at 1pm”: **make**/do trigger=“book”; target meeting new indefinite kind=workshop kind_span=“workshop”
    - meeting.length = "2" from “two hour” [eq, result]
    - meeting.people = "Lee" from “Lee” [eq, result]
    - meeting.people = "Priya" from “Priya” [eq, result]
    - meeting.day = "Friday" from “Friday” [eq, result]
    - meeting.time = "1pm" from “1pm” [eq, result]

26. [calendar · ui-human-v1 · train · calendar.meeting.change] “set review as Weekly review”  — context: Review, Calendar
  - span “set review as Weekly review”: **change**/do trigger=“set”; target meeting existing definite fill=written name_span=“review”
    - meeting.id = "review" from “review” [eq, selector]
    - meeting.title = "Weekly review" from “Weekly review” [eq, result]

27. [calendar · ui-human-v1 · train · world-informed-completion] “um, extend the event so it's twice as long”  — context: Review, Calendar
  - span “um, extend the event so it's twice as long”: **change**/do trigger=“extend”; target meeting existing definite fill=context
    - meeting.length = "2" from “twice” [factor, result]

28. [calendar · ui-natural-v1 · test · calendar.meeting.remove] “cancel the Review event”  — context: Review, Calendar
  - span “cancel the Review event”: **remove**/do trigger=“cancel”; target meeting existing definite fill=written name_span=“Review”
    - meeting.id = "Review" from “Review” [eq, selector]

29. [calendar · ui-natural-v1 · train · calendar.events.remove] “take Review out of this calendar”  — context: Review, Calendar
  - span “take Review out of this calendar”: **remove**/do trigger=“take”; target meeting existing definite fill=written name_span=“Review”
    - meeting.ids = "Review" from “Review” [eq, selector]

30. [calendar · ui-tiers-v1 · train · calendar.meeting.add] “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “please add the kids' dentist appointment to the Family calendar on Wednesday at 4:30 - it's personal, not for the office”: **make**/do trigger=“add”; target meeting new indefinite kind=dentist appointment kind_span=“dentist appointment”
    - meeting.calendar = "Family" from “Family” [eq, result]
    - meeting.day = "Wednesday" from “Wednesday” [eq, result]
    - meeting.time = "4:30" from “4:30” [eq, result]

31. [calendar · ui-tiers-v1 · train · calendar.meeting.add] “Lee asked to sync on the roadmap - would Monday at 2 suit? If so, put a meeting with him on my Work calendar.”  — context: Work, Family, Gym, Ana, Mihai, Lee
  - span “Lee asked to sync on the roadmap - would Monday at 2 suit? If so, put a meeting with him on my Work calendar.”: **make**/do trigger=“put”; target meeting new indefinite kind=meeting kind_span=“meeting”
    - meeting.day = "Monday" from “Monday” [eq, result]
    - meeting.time = "2" from “2” [eq, result]
    - meeting.people = "Lee" from “him” [eq, result]
    - meeting.calendar = "Work" from “Work” [eq, result]

32. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Visits with values 19, 38 for Notes and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Visits with values 19, 38 for Notes and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Visits" from “Visits” [eq, result]
    - chart.labels = "Notes and Sample" from “Notes and Sample” [eq, result]
    - chart.values = "19, 38" from “19, 38” [eq, result]

33. [diagram · demo-tool-profile · train · diagram.node.change] “Could you make Pie A purple. I appreciate it.”  — context: Pie A, Slice 1
  - span “make Pie A purple”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Pie A”
    - node.colour = "purple" from “purple” [eq, result]

34. [diagram · demo-tool-profile · train · None] “Could you make a circle labelled Project plan; then link Project plan to Scope. I appreciate it.”  — context: Scope
  - span “make a circle labelled Project plan”: **make**/do trigger=“make”; target node new indefinite kind=circle kind_span=“circle”
    - node.label = "Project plan" from “Project plan” [eq, result]
  - span “link Project plan to Scope”: **connect**/do trigger=“link”; target link new indefinite
    - link.from = "Project plan" from “Project plan” [eq, result]
    - link.to = "Scope" from “Scope” [eq, result]

35. [diagram · demo-tool-profile · train · diagram.node.change] “Please, make Vendor onboarding green. Thanks!”  — context: Vendor onboarding, Invoice
  - span “make Vendor onboarding green”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Vendor onboarding”
    - node.colour = "green" from “green” [eq, result]

36. [diagram · demo-tool-profile · train · compound] “Could you create a purple triangle labelled Pricing tiers. I appreciate it.”  — context: Starter
  - span “create a purple triangle labelled Pricing tiers”: **make**/do trigger=“create”; target node new indefinite kind=triangle kind_span=“triangle”
    - node.colour = "purple" from “purple” [eq, result]
    - node.label = "Pricing tiers" from “Pricing tiers” [eq, result]

37. [diagram · demo-tool-profile · train · None] “Could you add a hexagon labelled Study groups; then connect Study groups to maths; then make Study groups blue. I appreciate it.”  — context: maths
  - span “add a hexagon labelled Study groups”: **make**/do trigger=“add”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.label = "Study groups" from “Study groups” [eq, result]
  - span “connect Study groups to maths”: **connect**/do trigger=“connect”; target link new indefinite
    - link.from = "Study groups" from “Study groups” [eq, result]
    - link.to = "maths" from “maths” [eq, result]
  - span “make Study groups blue”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Study groups”
    - node.colour = "blue" from “blue” [eq, result]

38. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Produce with values 15, 31 for Apples and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Produce with values 15, 31 for Apples and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Produce" from “Produce” [eq, result]
    - chart.labels = "Apples and Sample" from “Apples and Sample” [eq, result]
    - chart.values = "15, 31" from “15, 31” [eq, result]

39. [diagram · demo-tool-profile · train · chart.make] “Let us make a bar chart called Budget split with values 15, 25 for Food and Sample. That would help.”  — context: (empty)
  - span “make a bar chart called Budget split with values 15, 25 for Food and Sample”: **make**/do trigger=“make”; target chart new indefinite kind=bar kind_span=“bar”
    - chart.title = "Budget split" from “Budget split” [eq, result]
    - chart.labels = "Food and Sample" from “Food and Sample” [eq, result]
    - chart.values = "15, 25" from “15, 25” [eq, result]

40. [diagram · main-synthetic · train · diagram.node.make] “add a square tiny”  — context: link, Sales, Process
  - span “add a square tiny”: **make**/do trigger=“add”; target node new indefinite kind=square kind_span=“square”
    - node.size = "tiny" from “tiny” [degree, result]

41. [diagram · main-synthetic · train · diagram.node.make] “give me a hexagon 260, 240”  — context: link, Sales, Process
  - span “give me a hexagon 260, 240”: **make**/do trigger=“give”; target node new indefinite kind=hexagon kind_span=“hexagon”
    - node.x = "260" from “260” [eq, result]
    - node.y = "240" from “240” [eq, result]

42. [diagram · ui-comparatives-v1 · train · diagram.node.size.delta] “make Decision much bigger”  — context: Start, Finish, Decision
  - span “make Decision much bigger”: **change**/do trigger=“make”; target node existing definite fill=written name_span=“Decision”
    - node.ids = "Decision" from “Decision” [eq, selector]
    - node.size = "(unlabelled)" from “bigger” [delta, result]

43. [diagram · ui-comparatives-v1 · train · diagram.node.width.delta] “make the shape way narrower”  — context: Start, Finish, Decision
  - span “make the shape way narrower”: **change**/do trigger=“make”; target node existing definite fill=description kind=shape kind_span=“shape”
    - node.width = "(unlabelled)" from “narrower” [delta, result]

44. [diagram · ui-coverage-v2 · train · diagram.node.make] “small yellow star”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “small yellow star”: **make**/do (no trigger); target node new indefinite kind=star kind_span=“star”
    - node.size = "small" from “small” [degree, result]
    - node.colour = "yellow" from “yellow” [eq, result]

45. [diagram · ui-coverage-v2 · train · diagram.group.layout] “arrange the Approval steps group in a column”  — context: Start, Approved?, Review, Publish, Done, Note
  - span “arrange the Approval steps group in a column”: **arrange**/do trigger=“arrange”; target group existing definite fill=written name_span=“Approval steps”
    - group.id = "Approval steps" from “Approval steps” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

46. [diagram · ui-human-v1 · train · diagram.observe] “hmm, I can't remember what I drew, what's in this diagram?”  — context: link, Sales, Process
  - span “hmm, I can't remember what I drew, what's in this diagram?”: **answer**/ask trigger=“what's”; target sketch existing definite fill=context
    - question {"ask": "describe"}

47. [diagram · ui-human-v1 · train · diagram.group.change] “turn the members of g1 blue and large and label it Updated process”  — context: Process, link, Sales
  - span “turn the members of g1 blue and large and label it Updated process”: **change**/do trigger=“turn”; target group existing definite fill=written name_span=“g1”
    - group.id = "g1" from “g1” [eq, selector]
    - group.label = "Updated process" from “Updated process” [eq, result]
    - group.colour = "blue" from “blue” [eq, result]
    - group.size = "large" from “large” [degree, result]

48. [diagram · ui-human-v1 · train · diagram.group.layout] “stack Process vertically”  — context: Process, link, Sales
  - span “stack Process vertically”: **arrange**/do trigger=“stack”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “vertically” [eq, result]

49. [diagram · ui-natural-v1 · train · diagram.group.layout] “organise Process as a column”  — context: Process, A, link, Sales
  - span “organise Process as a column”: **arrange**/do trigger=“organise”; target group existing definite fill=written name_span=“Process”
    - group.id = "Process" from “Process” [eq, selector]
    - group.layout = "column" from “column” [eq, result]

50. [diagram · ui-natural-v1 · test · diagram.node.change] “update the Start box, labelled Approval, with value 12”  — context: Start, link, Sales, Process
  - span “update the Start box, labelled Approval, with value 12”: **change**/do trigger=“update”; target node existing definite fill=written name_span=“Start”
    - node.ids = "Start" from “Start” [eq, selector]
    - node.label = "Approval" from “Approval” [eq, result]
    - node.value = "12" from “12” [eq, result]

51. [diagram · ui-tiers-v1 · dev · diagram.group.chart] “We're presenting the survey tomorrow and the slide needs a heading, so could you turn Survey results into a doughnut chart called "How customers rated us"?”  — context: Sales by region, Monthly visitors, Quarterly revenue, Survey results, North, South
  - span “We're presenting the survey tomorrow and the slide needs a heading, so could you turn Survey results into a doughnut chart called "How customers rated us"?”: **make**/do trigger=“turn”; target chart new indefinite kind=chart kind_span=“chart”
    - chart.source = "(unlabelled)" from “Survey results” [eq, result]
    - chart.type = "doughnut" from “doughnut” [eq, result]
    - chart.title = "How customers rated us" from “How customers rated us” [eq, result]

52. [diagram · ui-tiers-v1 · train · diagram.group.resize] “Survey results: a little smaller”  — context: Sales by region, Monthly visitors, Quarterly revenue, Survey results, North, South
  - span “Survey results: a little smaller”: **change**/do (no trigger); target group existing definite fill=written name_span=“Survey results”
    - group.id = "Survey results" from “Survey results” [eq, selector]
    - group.scale = "(unlabelled)" from “smaller” [delta, result]

53. [document · demo-tool-profile · dev · document.block.change] “Hey, replace Oat biscuits recipe with "The room is available after lunch.". That would help.”  — context: Draft, Oat biscuits recipe, Ingredients
  - span “replace Oat biscuits recipe with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Oat biscuits recipe”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

54. [document · demo-tool-profile · train · document.block.change] “Hey, replace Shoe review with "The delivery arrived this morning.". That would help.”  — context: Draft, Shoe review, Reference
  - span “replace Shoe review with "The delivery arrived this morning."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Shoe review”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

55. [document · demo-tool-profile · dev · document.block.change] “Hey, replace Brother Tom letter with "Everyone can read the new summary.".”  — context: Draft, Brother Tom letter, Flight details
  - span “replace Brother Tom letter with "Everyone can read the new summary."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Brother Tom letter”
    - section.content = "Everyone can read the new summary." from “Everyone can read the new summary.” [eq, result]

56. [document · demo-tool-profile · train · document.block.change] “Let us replace Iceland ring road with "The room is available after lunch.". That would help.”  — context: Draft, Iceland ring road, Packing list
  - span “replace Iceland ring road with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Iceland ring road”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

57. [document · demo-tool-profile · train · document.block.change] “Hey, replace Itinerary with "Bring the revised notes to the meeting.". That would help.”  — context: Draft, Itinerary, Day 1
  - span “replace Itinerary with "Bring the revised notes to the meeting."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Itinerary”
    - section.content = "Bring the revised notes to the meeting." from “Bring the revised notes to the meeting.” [eq, result]

58. [document · demo-tool-profile · train · None] “Could you make a heading called Report; then add a paragraph saying "The delivery arrived this morning.". I appreciate it.”  — context: Draft, Report, Summary
  - span “make a heading called Report”: **make**/do trigger=“make”; target section new indefinite kind=heading kind_span=“heading”
    - section.content = "Report" from “Report” [eq, result]
  - span “add a paragraph saying "The delivery arrived this morning."”: **make**/do trigger=“add”; target section new indefinite kind=paragraph kind_span=“paragraph”
    - section.content = "The delivery arrived this morning." from “The delivery arrived this morning.” [eq, result]

59. [document · demo-tool-profile · train · document.block.change] “Could you replace Meeting recap with "The room is available after lunch.". Thanks!”  — context: Draft, Meeting recap, Summary points
  - span “replace Meeting recap with "The room is available after lunch."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Meeting recap”
    - section.content = "The room is available after lunch." from “The room is available after lunch.” [eq, result]

60. [document · demo-tool-profile · train · document.block.change] “replace Membership form with "Bring the revised notes to the meeting.".”  — context: Draft, Membership form, Fees
  - span “replace Membership form with "Bring the revised notes to the meeting."”: **change**/do trigger=“replace”; target section existing definite fill=written name_span=“Membership form”
    - section.content = "Bring the revised notes to the meeting." from “Bring the revised notes to the meeting.” [eq, result]

61. [document · demo-tool-profile · train · None] “Hey, compose a report about Deposit in approximately 13 words. That would help.”  — context: Draft, Deposit, Lease
  - span “compose a report about Deposit in approximately 13 words”: **make**/do trigger=“compose”; target text new indefinite kind=report kind_span=“report”
    - text.about = "Deposit" from “Deposit” [eq, result]
    - text.words = "13" from “approximately 13 words” [eq, result]

62. [document · demo-tool-profile · test · None] “Could you compose a report about Choir programme in approximately 87 words. I appreciate it.”  — context: Draft, Choir programme, Concert date
  - span “compose a report about Choir programme in approximately 87 words”: **make**/do trigger=“compose”; target text new indefinite kind=report kind_span=“report”
    - text.about = "Choir programme" from “Choir programme” [eq, result]
    - text.words = "87" from “approximately 87 words” [eq, result]

63. [document · main-synthetic · train · block.observe] “Any top-of-page title pieces at all in this one?”  — context: Notes
  - span “Any top-of-page title pieces at all in this one?”: **answer**/check trigger=“Any”; target block existing definite fill=all kind=top-of-page title pieces kind_span=“top-of-page title pieces”
    - question {"ask": "exists"}

64. [document · main-synthetic · train · block.observe] “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”  — context: Notes
  - span “Right, after that endless debate in the meeting about citations — which, for the record, I still think was unnecessary — can you save me another hour and just tell me how many quotes have crept into this thing?”: **answer**/ask trigger=“how many”; target block existing definite fill=all kind=quote kind_span=“quote”
    - question {"ask": "count"}

65. [document · ui-coverage-v2 · train · document.observe] “what does the Budget table contain?”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “what does the Budget table contain?”: **answer**/ask trigger=“what”; target document existing definite fill=written name_span=“Budget”
    - question {"ask": "describe"}

66. [document · ui-coverage-v2 · train · document.compose] “a quick note for the neighbours about the party, 60 words max”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “a quick note for the neighbours about the party, 60 words max”: **make**/do (no trigger); target text new indefinite
    - text.genre = "note" from “note” [eq, result]
    - text.about = "about the party" from “about the party” [eq, result]
    - text.words = "60" from “60 words max” [eq, result]

67. [document · ui-human-v1 · train · document.block.mark] “turn the start of b2 bold”  — context: paragraph, paragraph, Notes
  - span “turn the start of b2 bold”: **change**/do trigger=“turn”; target block existing definite fill=written name_span=“b2”
    - block.id = "b2" from “b2” [eq, selector]
    - block.mark = "bold" from “bold” [eq, result]

68. [document · ui-human-v1 · train · ui.history.redo] “can you redo that document edit?”  — context: Notes
  - span “can you redo that document edit?”: **redo**/do trigger=“redo”; target document existing definite fill=journal_step

69. [document · ui-human-v1 · train · compound] “change the chapter heading to Overview and tidy the first paragraph”  — context: paragraph, paragraph, Notes
  - span “change the chapter heading to Overview”: **change**/do trigger=“change”; target section existing definite fill=description kind=chapter kind_span=“chapter”
    - section.text = "Overview" from “Overview” [eq, result]
  - span “tidy”: **change**/do trigger=“tidy”; target block existing definite fill=context

70. [document · ui-human-v1 · train · document.list.change] “edit the Tasks list”  — context: Tasks, Notes
  - span “edit the Tasks list”: **change**/do trigger=“edit”; target block existing definite fill=written name_span=“Tasks”
    - block.id = "Tasks" from “Tasks” [eq, selector]

71. [document · ui-natural-v1 · train · document.section.change] “give b1 the heading Overview at level 1”  — context: Notes
  - span “give b1 the heading Overview at level 1”: **change**/do trigger=“give”; target section existing definite fill=written name_span=“b1”
    - section.id = "b1" from “b1” [eq, selector]
    - section.text = "Overview" from “Overview” [eq, result]
    - section.level = "1" from “level 1” [eq, result]

72. [document · ui-natural-v1 · train · document.table.make] “Budget table: header Item,Cost; row Paper,12”  — context: Budget, Notes
  - span “Budget table: header Item,Cost; row Paper,12”: **make**/do trigger=“None”; target block new indefinite
    - block.name = "Budget" from “Budget” [eq, result]
    - block.rows = "Item" from “Item” [eq, result]
    - block.rows = "Cost" from “Cost” [eq, result]
    - block.rows = "Paper" from “Paper” [eq, result]
    - block.rows = "12" from “12” [eq, result]
    - block.header = "true" from “header Item” [eq, result]

73. [document · ui-tiers-v1 · test · document.block.mark] “readers can't find the sources, so in the Background paragraph please link "the original study" to https://journal.example.org/study-17”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “in the Background paragraph please link "the original study" to https://journal.example.org/study-17”: **change**/do trigger=“link”; target block existing definite fill=written name_span=“Background”
    - block.id = "Background" from “Background” [eq, selector]
    - block.mark = "link" from “link” [eq, result]
    - block.text = "the original study" from “the original study” [eq, selector]
    - block.attrs = "https://journal.example.org/study-17" from “https://journal.example.org/study-17” [eq, result]

74. [document · ui-tiers-v1 · test · document.block.mark] “link "pricing" to example.com/prices”  — context: Project notes, Introduction, Goals, Intro, Background, Customer quote
  - span “link "pricing" to example.com/prices”: **change**/do trigger=“link”; target block existing definite fill=context
    - block.mark = "link" from “link” [eq, result]
    - block.text = "pricing" from “pricing” [eq, selector]
    - block.attrs = "example.com/prices" from “example.com/prices” [eq, result]

75. [drawing · demo-tool-profile · dev · None] “place duck pond to the left of barn.”  — context: duck pond, barn
  - span “place duck pond to the left of barn”: **place**/do trigger=“place”; target drawn existing definite fill=written name_span=“duck pond”
    - drawn.relation = "left_of" from “to the left of” [relation, result]
    - drawn.anchor = "barn" from “barn” [relation, selector]

76. [drawing · demo-tool-profile · train · None] “ok cool thanks”  — context: (empty)

77. [drawing · demo-tool-profile · train · drawing.object.change] “Hey, make sandpit yellow. That would help.”  — context: sandpit, slide
  - span “make sandpit yellow”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“sandpit”
    - drawn.colour = "yellow" from “yellow” [eq, result]

78. [drawing · demo-tool-profile · train · drawing.object.change] “Let us make Mo red. That would help.”  — context: Mo, Pip
  - span “make Mo red”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Mo”
    - drawn.colour = "red" from “red” [eq, result]

79. [drawing · demo-tool-profile · train · None] “Hey, add a tree called Item 9819; then put Item 9819 below Bush.”  — context: Bush
  - span “add a tree called Item 9819”: **make**/do trigger=“add”; target drawn new indefinite kind=tree kind_span=“tree”
    - drawn.name = "Item 9819" from “Item 9819” [eq, result]
  - span “put Item 9819 below Bush”: **place**/do trigger=“put”; target drawn existing definite fill=written name_span=“Item 9819”
    - drawn.relation = "below" from “below” [relation, result]
    - drawn.anchor = "Bush" from “Bush” [relation, selector]

80. [drawing · demo-tool-profile · train · drawing.object.change] “I need you to make meadow green. I appreciate it.”  — context: meadow, bubbles
  - span “make meadow green”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“meadow”
    - drawn.colour = "green" from “green” [eq, result]

81. [drawing · main-synthetic · train · drawing.catalog.make] “I'd like a salmon”  — context: House, Box, Circle
  - span “I'd like a salmon”: **make**/do (no trigger); target drawn new indefinite kind=salmon kind_span=“salmon”

82. [drawing · main-synthetic · dev · drawing.object.make] “I could use a masts here”  — context: House, Box, Circle
  - span “I could use a masts here”: **make**/do trigger=“use”; target drawn new indefinite kind=masts kind_span=“masts”

83. [drawing · main-synthetic · train · drawing.object.make] “my current project needs a hen”  — context: House, Box, Circle
  - span “my current project needs a hen”: **make**/do trigger=“needs”; target drawn new indefinite kind=hen kind_span=“hen”

84. [drawing · main-synthetic · train · drawing.object.make] “the next thing on my list is a tequila”  — context: House, Box, Circle
  - span “the next thing on my list is a tequila”: **make**/do (no trigger); target drawn new indefinite kind=tequila kind_span=“tequila”

85. [drawing · ui-comparatives-v1 · dev · drawing.drawn.size.delta] “make the lake a bit larger”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “make the lake a bit larger”: **change**/do trigger=“make”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.size = "(unlabelled)" from “larger” [delta, result]

86. [drawing · ui-comparatives-v1 · train · drawing.drawn.width.delta] “could you make Box a bit wider”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “could you make Box a bit wider”: **change**/do trigger=“make”; target drawn existing definite fill=written name_span=“Box”
    - drawn.ids = "Box" from “Box” [eq, selector]
    - drawn.width = "(unlabelled)" from “wider” [delta, result]

87. [drawing · ui-comparatives-v1 · train · drawing.drawn.width.delta] “I want the lake a little narrower”  — context: House, Box, Circle, Tree, Sun, Lake
  - span “I want the lake a little narrower”: **change**/do trigger=“want”; target drawn existing definite fill=description kind=lake kind_span=“lake”
    - drawn.width = "(unlabelled)" from “narrower” [delta, result]

88. [drawing · ui-coverage-v2 · train · drawing.object.make] “white cloud, size 50”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “white cloud, size 50”: **make**/do (no trigger); target drawn new indefinite kind=cloud kind_span=“cloud”
    - drawn.colour = "white" from “white” [eq, result]
    - drawn.size = "50" from “size 50” [eq, result]

89. [drawing · ui-coverage-v2 · dev · drawing.objects.select] “I want to move these together, so select the red car and the road”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “I want to move these together, so select the red car and the road”: **select**/do trigger=“select”; target drawn existing definite fill=written name_span=“red car”
    - drawn.ids = "red car" from “red car” [eq, selector]
    - drawn.ids = "road" from “road” [eq, selector]

90. [drawing · ui-coverage-v2 · train · drawing.part.place] “the front wheel of the red car slipped; move it back to x 320, y 430”  — context: House, roof of the house, door of the house, window of the house, chimney of the house, Red car
  - span “the front wheel of the red car slipped; move it back to x 320, y 430”: **place**/do trigger=“move”; target part existing definite fill=written name_span=“front wheel”
    - part.id = "the red car" from “the red car” [eq, selector]
    - part.x = "320" from “x 320” [eq, result]
    - part.y = "430" from “y 430” [eq, result]

91. [drawing · ui-human-v1 · train · drawing.part.change] “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”  — context: Box, Circle, House
  - span “ok, that piece should stand out, so make part 0 of o1 red, 90 wide and 45 high”: **change**/do trigger=“make”; target part existing definite fill=written name_span=“o1”
    - part.id = "o1" from “o1” [eq, selector]
    - part.index = "0" from “part 0” [eq, result]
    - part.colour = "red" from “red” [eq, result]
    - part.width = "90" from “90” [eq, result]
    - part.height = "45" from “45” [eq, result]

92. [drawing · ui-human-v1 · test · world-informed-completion] “I need a tree next to the house”  — context: House, Box, Circle
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

95. [drawing · ui-relations-v1 · train · drawing.object.make] “give me a stump under that tree”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “give me a stump under that tree”: **make**/do trigger=“me”; target drawn new indefinite kind=stump kind_span=“stump”
    - drawn.relation = "below" from “under” [relation, result]
    - drawn.anchor = "that tree" from “that tree” [relation, selector]

96. [drawing · ui-relations-v1 · test · drawing.object.make] “please put a freighter in the lake there”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “please put a freighter in the lake there”: **make**/do trigger=“put”; target drawn new indefinite kind=freighter kind_span=“freighter”
    - drawn.relation = "in" from “in” [relation, result]
    - drawn.anchor = "the lake there" from “the lake there” [relation, selector]

97. [drawing · ui-relations-v1 · train · drawing.object.make] “sketch a minnow inside that lake”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “sketch a minnow inside that lake”: **make**/do trigger=“sketch”; target drawn new indefinite kind=minnow kind_span=“minnow”
    - drawn.relation = "in" from “inside” [relation, result]
    - drawn.anchor = "that lake" from “that lake” [relation, selector]

98. [drawing · ui-relations-v1 · train · drawing.object.make] “make a tanker inside that lake”  — context: Lake, Tree, House, Mountain, Road, Hill
  - span “make a tanker inside that lake”: **make**/do trigger=“make”; target drawn new indefinite kind=tanker kind_span=“tanker”
    - drawn.relation = "in" from “inside” [relation, result]
    - drawn.anchor = "that lake" from “that lake” [relation, selector]

99. [drawing · ui-tiers-v1 · test · drawing.ids.show] “IDs, just briefly”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “IDs, just briefly”: **change**/do (no trigger); target page existing definite fill=context
    - page.mode = "temporary" from “briefly” [eq, result]

100. [drawing · ui-tiers-v1 · train · drawing.ids.show] “quick flash of the IDs”  — context: House, Old oak, Lake, Sun, Red car, Cloud
  - span “quick flash of the IDs”: **change**/do (no trigger); target page existing definite fill=context
    - page.mode = "temporary" from “quick flash” [eq, result]
