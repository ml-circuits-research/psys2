# kids.time — request-shape catalogue (rule formalizer)

**S** = supported, with a test (the `doc=` of the `t.time.swNNN` tests names the class); **U** = unsupported, with the reason. Patterns: `patterns.sop`, rule-sweep families `sw.*` last. Abbreviations: day names (mon, tue, tues, wed, weds, thu, thur, thurs, fri, sat, satur; `sun` is not a day abbreviation on purpose: it is the drawing word), month names (feb, febr, apr, jun, jul, aug, sep, sept, oct, nov; jan, mar and dec are not abbreviations on purpose: names and words) in `lexicon.sop`; hr/hrs/min/mins/wk/wks/sec/secs/yr/yrs as literal alternatives of the length patterns.

| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| today / this month / clock statement | "Today is Friday", "It is Friday", "We are on Friday" | older tests | S |
| today | chat forms: "its friday today", "today's friday btw", "fyi its friday today", "hey today is friday", "we are on friday today" | | S: "statement: today is a day" |
| this month | "its May now", "we are in March", "this month is May" | | S |
| clock set | "the clock says 3 oclock", "its 3 oclock now", "the time is 3 o clock" | | S: "statement: it is N o'clock" |
| day/month/season shift | N after: "4 days after Sunday", "whats the day 4 days after sunday", "day that is 4 days later than sunday", "sunday 4 days later is what day", "count forward / skip 4 days from sunday", "if its sunday what day in 4 days", "if i go 4 months past march" | | S: "day shift: N days after", "month shift", "season shift: N after" |
| shift | N before / ago: "count back 5 days from wednesday", "wednesday 5 days ago is what day", "day 5 days before weds", "what day was it 5 days before wednesday" | | S: "day shift: N days before" |
| shift | next / previous: "the day after monday", "next day after monday pls", "after monday which day is it", "before friday what day is it", "u know what day is before friday", "what is the month ahead of may" | | S: "next and previous day", "month shift: before / next", "season shift" |
| shift | today-relative: "what day is tomorrow", "friday today so tomorrow is what" | | S: older tests plus the new "today so tomorrow" pattern |
| shift | sign written as a symbol: "sunday + 4", "march + 4 months = ?", "5 o clock - 30 min" | | U: the tokenizer drops `+`/`-` that follow a word, so plus and minus cannot be told apart (engine) |
| shift | "after spring then two more seasons, which" (the "then ... more" run-on) | | U: counting from a clause |
| month length | how many days in X; "june days?", "days in june?", "whats the length of june", "how long is june in days", "is march 31 days" (answers with the length), abbreviations | | S: "month length ..." |
| span length | "how many hrs in a day", "how many mins in an hr", "in one hour how many minutes are there", "2 wks = how many days", "how many days in a fortnight" | | S: "span lengths ..." |
| span length | bare "24 hours?" / "14 days?" | | U: direction (which unit is the whole) is not given |
| day gap | "days between thursday and sunday", "from thursday how many days until sunday", "how long until sunday if its thursday", "how many more days to sunday when its thursday" | | S: "days between two days", "days until, with today stated" |
| hours gap | "time from 3 oclock to 7 oclock in hours", "3 to 7 hours to go?", "countdown in hours from 3 to 7", "hours from now till 7 if its 3 oclock", "from 9 o clock to noon how many hours" (noon = 12) | | S: "hours between o'clock times", "hours until, with the clock stated" |
| clock arithmetic | + hours: "10 + 4 hours is what time", "ten oclock four hours later?", "in 2 hours from 3 oclock it will be what", "at 3 oclock what time is it 2 hours later" | | S: "clock + hours" |
| clock arithmetic | - hours / minutes: "what was the time 2 hours before 5 oclock", "2 hours ago from 5 oclock what time", "half an hour before 5 o clock", "quarter of an hour after" | | S: "clock - hours / minutes", "clock +- half an hour" |
| reading the clock | "what time r we at", "do u know what time it is", "can u tell me the time", "whats the time", "time pls", "what o'clock is it" | | S: "reading the clock" |
| list weekend / school days | "weekend days?", "which days count as weekend", "name the weekend days pls", "which days are school days" | | S: "weekend / weekday / lists" |
| list days / months / seasons | "name all the days of the week", "list the months of the year pls", "the four seasons?" | | S: "list days of the week", "list months / seasons" |
| season of a month / months of a season | older patterns | | S (older tests) |
| questions about options ("what can you tell me about time?") | | | U: no operation; `ui.help` answers |
| undo / negation | "not Friday" | | U: the world keeps facts, not retractions |
| mixed statement + question in one sentence ("friday is today, just so u know") | | | the statement half works as a separate sentence; run-ons are the dispatcher's job |
