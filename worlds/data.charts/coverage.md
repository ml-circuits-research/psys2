# data.charts: request-shape coverage

Every operation, every way of asking that the rules support, and the test that proves it (`tests.sop`; ids `nNN` are the original suite, `r2NNN` the R2 sweep). Examples after the first are checked by the rule probes of the sweep (see `datagen.mjs` families `chart.*` for the generated forms). Lines starting with "unsupported" say why.

## chart.fromText

Builds a chart from numbers typed in the message.

| shape | examples | status |
| --- | --- | --- |
| imperative | Make a chart: apples 5, pears 3, plums 8 | supported, test n01 |
| imperative, type named | Make a pie chart of cats 4, dogs 6 and fish 2 | supported, test n94 |
| noun-first, "new chart:" | New chart: cats 2, dogs 7; New chart bikes 4 scooters 9 kites 2 | supported, test r2110 |
| trailing noun | bikes 4 scooters 9 kites 2 as a graph; plot x 1 y 2 z 3 as a pie chart | supported, test r2113 |
| number words | Make a chart: apples five, pears three | supported, test n100 |
| no commas, run-on pairs | chart bikes 4 scooters 9 kites 2 (split into label/number pairs by the operation) | supported, test r2113 |
| missing numbers | Make a chart: apples, pears (the operation says what is missing) | supported, test n101 |
| voice filler, politeness | hey could you chart cats 3 dogs 5 pls | supported, test r2112 |
| unsupported: multi-series typed input | chart apples 5 3, pears 3 4 (two numbers per label) | unsupported: a typed chart has one series; several series come from "what everyone has" |

## chart.new

Starts an empty chart.

| shape | examples | status |
| --- | --- | --- |
| imperative | New chart; Start a new chart | supported, test n53 |
| wish / give me | Give me a blank chart; I want an empty bar chart | supported, test r2109 |
| from scratch | Create a chart from scratch | supported, test r2111 |

## chart.refresh

Reads the source of the chart again.

| shape | examples | status |
| --- | --- | --- |
| imperative | Update the chart | supported, test n64 |
| indirect statement | Chart needs an update; re-draw the chart | supported, test r2114 |
| hyphenated verb | re-draw the chart | supported, test r2115 |

## chart.duplicate

Copies the chart.

| shape | examples | status |
| --- | --- | --- |
| imperative | Duplicate the chart | supported, test n55 |
| question / pronoun | can you duplicate this one; clone this graph pls | supported, test r2100 |

## chart.fromHoldings

Chart of what people have (kids.arith).

| shape | examples | status |
| --- | --- | --- |
| imperative | Make a bar chart of what everyone has | supported, test n62 |
| noun-first with type | Pie chart of what everybody has; Bar chart everyone | supported, test r2117 |
| word-order, possessive | show everyones stuff as bars; everyone's things as a pie | supported, test r2118 |
| by item | Chart the apples; Graph the apples everyone has | supported, test r2119 |
| named people | Chart what Tom has | supported, test r2120 |
| unknown person (state question) | Chart what Zed has | supported, test n69 |

## chart.fromPrices

Chart of the kids.shop price list.

| shape | examples | status |
| --- | --- | --- |
| imperative | Chart the prices of the toys | supported, test n70 |
| named items | Chart the prices of a ball, a book and a doll | supported, test n72 |
| question form | Chart how much the fruit costs; how much does the fruit cost, chart it | supported, test r2123 |
| noun-first / what-clause | toy prices as a chart; chart what the toys cost | supported, test r2121 |
| trailing chart word | toy prices as a chart | supported, test r2122 |
| unknown group | Chart the prices of the dragons | supported, test n76 |

## chart.fromLegs

Chart of the legs of animals (kids.animals).

| shape | examples | status |
| --- | --- | --- |
| group | Compare the legs of the sea animals | supported, test n77 |
| named animals | Chart the legs of a dog, a spider and a bee | supported, test n78 |
| how-many form | Chart how many legs the farm animals have; how many legs do a dog and a bee have, chart it | supported, test r2125 |
| noun-first | make a legs chart for spiders and cows; spiders and cows legs chart | supported, test r2124 |
| type named | Make a pie chart of the legs of the birds | supported, test n80 |
| unknown group | Compare the legs of the unicorns | supported, test n81 |

## chart.fromList

Chart of a kids.tasks list.

| shape | examples | status |
| --- | --- | --- |
| imperative | Show my shopping list as a chart | supported, test n82 |
| into / turn | turn my shopping list into a chart; chart my shopping list | supported, test r2128 |
| type named | show my groceries list in a pie | supported, test r2129 |
| all lists | Chart my lists | supported, test n88 |

## chart.addPoint

Adds a bar.

| shape | examples | status |
| --- | --- | --- |
| label then number | Add bananas 4 | supported, test n02 |
| number then label | Add 4 bananas to the chart; could you add 6 grapes | supported, test n95 |
| filler between label and number | add bananas at 4; put grapes in with 7; stick bananas on there with 4 | supported, test r2070 |
| several at once | Add kiwis 2 and figs 7 to the chart | supported, test n96 |
| quantity word in the chart | include 6 grapes in the chart | supported, test r2071 |
| elliptic (label number) | bananas 4; new item bananas 4 | supported, test r2072 |
| wish / politeness | I want to add grapes, 7; can you add bananas with 4 to it | supported, test r2071 |

## chart.removePoint

Removes a bar.

| shape | examples | status |
| --- | --- | --- |
| imperative | Remove plums; Remove plums from the chart | supported, test n98 |
| particle verb | take the plums out; take plums off pls | supported, test r2084 |
| noun-first | plums off the chart | supported, test r2089 |
| negation | no more plums; I do not need the plums anymore; i dont want plums anymore | supported, test r2085 |
| "from it" | drop plums from it | supported, test r2086 |
| synonyms | scrap / ditch / get rid of / delete plums | supported, test n99 |

## chart.setPoint

Sets a number.

| shape | examples | status |
| --- | --- | --- |
| imperative | Change pears to 6 | supported, test n04 |
| make | make plums 9 | supported, test r2073 |
| indirect | the pears are 4 now; pears should be 6 | supported, test r2074 |
| elliptic with verb | update pears, 6; edit pears to six | supported, test n97 |
| number words | Change cats to six | supported, test n97 |

## chart.adjustPoint

Adds, subtracts, multiplies or halves a number.

| shape | examples | status |
| --- | --- | --- |
| increase by | Increase apples by 2 | supported, test n05 |
| plus / minus | apples plus 2; apples minus 2 | supported, test r2075 |
| "n more / fewer" | 2 more apples please; 2 fewer apples | supported, test r2076 |
| double / triple | Double the bananas; Triple the pears | supported, test n06 |
| halve, half, "in half" | halve plums; cut the plums by half; plums in half | supported, test r2078 |
| multiply / divide | multiply kiwis by 3; divide kiwis by two | supported, test r2079 |
| "cut by half" | cut the plums by half | supported, test r2081 |
| unsupported: percentage change | raise apples by 10 percent | unsupported: only absolute amounts and factors |

## chart.renamePoint

Renames a label.

| shape | examples | status |
| --- | --- | --- |
| imperative | Rename bananas to kiwis | supported, test n07 |
| with "pears to cherries" | rename pears to cherries | supported, test r2082 |
| swap / replace | swap pears for cherries; replace pears with cherries | supported, test r2083 |
| indirect | pears are cherries now; cherries not pears | supported, test r2083 |

## chart.clearData

Empties the chart.

| shape | examples | status |
| --- | --- | --- |
| imperative | Clear the chart | supported, test n59 |
| all the bars | remove all the bars; delete all the data | supported, test r2087 |
| start over | start the data over; wipe it clean | supported, test r2087 |

## chart.setType

Chart type.

| shape | examples | status |
| --- | --- | --- |
| imperative | Make it a pie chart | supported, test n08 |
| "as a" | Show it as a line | supported, test n09 |
| elliptic | pie please; line graph instead; bars again | supported, test r2034 |
| preference / wish | i prefer a bar chart; how about a line | supported, test r2037 |
| doughnut, radar, polar, scatter | Turn it into a doughnut chart; Plot it as a scatter plot | supported, test n10 |
| "donut" | make it a donut | supported, test r2036 |

## chart.setStacked

Stacking.

| shape | examples | status |
| --- | --- | --- |
| imperative | Make it stacked | supported, test n65 |
| elliptic | stacked please | supported, test r2054 |
| negation | no stacking; unstack the bars | supported, test r2055 |
| type and stacking | Make it a stacked bar chart | supported, test n34 |

## chart.setTitle

Chart title.

| shape | examples | status |
| --- | --- | --- |
| imperative | Call it Fruit | supported, test n15 |
| change | Change the chart title to Fruit stand | supported, test n16 |
| word-order | title: My fruit; chart title: Fruit | supported, test r2064 |
| indirect | the title should be Snacks | supported, test r2065 |
| "use X as" | use Zoo as the title; put My fruit as the heading | supported, test r2066 |
| wish | I want the title to be Fruit | supported, test r2065 |

## chart.removeTitle

Removes the title.

| shape | examples | status |
| --- | --- | --- |
| imperative | drop the title; take the title off | supported, test r2067 |
| negation | chart without a title; no title please | supported, test r2069 |

## chart.setColor

Colour of the bars or of one bar.

| shape | examples | status |
| --- | --- | --- |
| imperative | Make the bars green | supported, test n17 |
| shade | Color it light blue | supported, test n18 |
| one bar | Make the pears bar red; Make Tom light green | supported, test n20 |
| filler, politeness | paint the bars a nice green; make em purple thx | supported, test r2038 |
| indirect | the bars should be dark blue; pink would be nicer | supported, test r2040 |
| statement | the bars are teal now | supported, test r2043 |
| elliptic | bars in orange pls | supported, test r2041 |

## chart.setPalette

Palettes.

| shape | examples | status |
| --- | --- | --- |
| imperative | Use rainbow colors | supported, test n19 |
| like a | colour it like a rainbow; all the colours of the rainbow | supported, test r2044 |
| each bar different | Color each bar differently | supported, test n21 |
| reset | Reset the chart colors; go back to the default colors | supported, test r2046 |
| politeness | pastel colours please | supported, test r2045 |

## chart.setSort

Order of the bars.

| shape | examples | status |
| --- | --- | --- |
| from-to | Sort from biggest to smallest | supported, test n23 |
| ascending | Sort from smallest to biggest; order them from small to big | supported, test r2048 |
| elliptic | biggest first; put the biggest on the left; lowest to highest | supported, test r2047 |
| alphabetical | Sort alphabetically; in alphabetical order | supported, test r2049 |
| negation | Stop sorting; do not sort it | supported, test r2050 |

## chart.setOrientation

Horizontal or vertical bars.

| shape | examples | status |
| --- | --- | --- |
| imperative | Make it horizontal | supported, test n27 |
| noun-first | sideways bars; horizontal bars pls | supported, test r2051 |
| "lie down" | make it lie down; lay it on its side | supported, test r2053 |
| back | vertical bars again | supported, test r2052 |

## chart.setValues

Numbers on the bars.

| shape | examples | status |
| --- | --- | --- |
| imperative | Show the values | supported, test n29 |
| percentages | Show the percentages | supported, test n30 |
| negation | Hide the numbers; numbers off; no numbers on the bars | supported, test r2057 |
| wish | i want to see the figures; label the bars with their numbers | supported, test r2056 |

## chart.setLegend

Legend.

| shape | examples | status |
| --- | --- | --- |
| imperative | Hide the legend; Show the legend | supported, test n33 |
| elliptic | legend off; legend on; legend away pls | supported, test r2059 |
| particle verb | take the legend off; bring the legend back | supported, test r2061 |
| negation / wish | i do not need the legend | supported, test r2062 |

## chart.extreme

Biggest or smallest item.

| shape | examples | status |
| --- | --- | --- |
| question | Which is the biggest?; Which has the least? | supported, test n36 |
| elliptic | biggest?; which one wins; whats on top | supported, test r2010 |
| "which one's" | which one's the biggest bar | supported, test r2009 |
| imperative | tell me the smallest | supported, test r2011 |

## chart.total

Sum of the bars.

| shape | examples | status |
| --- | --- | --- |
| question | What is the total? | supported, test n38 |
| casual | whats the sum; grand total; total? | supported, test r2002 |
| "add up" | add them all up; what do they add up to | supported, test r2005 |
| "all together" | how much is it all together; all together how many | supported, test r2006 |

## chart.average

Average of the bars.

| shape | examples | status |
| --- | --- | --- |
| question | What is the average? | supported, test n39 |
| casual | average please; whats the typical value; on average? | supported, test r2007 |
| unsupported: median, mode, range | what is the median | unsupported: only the mean is computed |

## chart.difference

Difference of two bars.

| shape | examples | status |
| --- | --- | --- |
| how many more | How many more kiwis than pears? | supported, test n40 |
| how much bigger | how much bigger are plums than pears | supported, test r2014 |
| minus / gap | apples minus pears; gap between apples and kiwis | supported, test r2015 |
| reversed | pears how many less than apples | supported, test r2017 |
| unsupported: "by how many are apples ahead" (second item implicit) | by how many are apples ahead | unsupported: needs two named items |

## chart.compare

Which of two is bigger or smaller.

| shape | examples | status |
| --- | --- | --- |
| question | Which is bigger, apples or pears? | supported, test n44 |
| yes/no | is plums bigger than pears | supported, test r2018 |
| smaller | kiwis or apples, which is smaller | supported, test r2019 |
| "more" | more apples or more pears | supported, test r2020 |
| "who wins" | apples vs pears who wins | supported, test r2021 |

## chart.percent

Share of the total.

| shape | examples | status |
| --- | --- | --- |
| question | What percentage are apples? | supported, test n41 |
| noun-first | apples as a percent; percent apples | supported, test r2023 |
| "how much of" | how much of the chart is kiwis | supported, test r2024 |
| unsupported: "%" sign (the tokenizer drops it) | what % is apples | unsupported: needs the tokenizer to keep "%" (src) |

## chart.valueOf

Value of one bar.

| shape | examples | status |
| --- | --- | --- |
| question | What is the value of pears?; What is Kiwis? | supported, test n42 |
| "how many" | how many apples | supported, test r2025 |
| "what number" | what number is plums | supported, test r2026 |
| noun-first | apples value?; tell me the pears number | supported, test r2027 |

## chart.countItems

Number of bars.

| shape | examples | status |
| --- | --- | --- |
| question | How many bars are there? | supported, test n45 |
| elliptic | how many bars | supported, test r2028 |

## chart.describe

Describes the chart.

| shape | examples | status |
| --- | --- | --- |
| imperative | Describe the chart | supported, test n46 |
| question | whats this chart about; what does this graph show me | supported, test r2029 |
| "tell me what" | tell me what the chart looks like | supported, test r2030 |

## chart.read

Reads the chart aloud.

| shape | examples | status |
| --- | --- | --- |
| imperative | Read the chart aloud | supported, test n47 |
| "say it out loud" | say it out loud; read me the values | supported, test r2032 |
| "read me" | read me the values | supported, test r2031 |

## chart.switchChart

Switch between charts.

| shape | examples | status |
| --- | --- | --- |
| ordinal | Go back to the first chart | supported, test n54 |
| "2nd" | go to the 2nd chart | supported, test r2094 |
| number | Go to chart 1; chart number 1 | supported, test r2097 |
| next / previous | Show the next chart; the previous one | supported, test r2095 |
| last | Show the last chart | supported, test n108 |

## chart.deleteChart

Deletes charts.

| shape | examples | status |
| --- | --- | --- |
| this | Delete this chart | supported, test n58 |
| ordinal | Delete the second chart; get rid of the second one | supported, test r2105 |
| "3rd" | delete the 3rd chart; take out the 2nd chart | supported, test r2104 |
| all | Delete all the charts | supported, test n60 |

## chart.listCharts

Lists the charts.

| shape | examples | status |
| --- | --- | --- |
| question | What charts do I have? | supported, test n56 |
| imperative | list my charts; give me the list of graphs | supported, test r2098 |
| count and names | how many charts and what are they | supported, test r2099 |

## chart.download

Saves a picture.

| shape | examples | status |
| --- | --- | --- |
| imperative | Download the chart as an image | supported, test n48 |
| "download it as a picture" | download it as a picture; png please; give me a picture of the chart | supported, test r2101 |

## chart.downloadData

Saves the numbers as a file.

| shape | examples | status |
| --- | --- | --- |
| imperative | Download the chart data as a spreadsheet | supported, test n49 |
| short | export the data; chart data to excel please; csv please | supported, test r2102 |

## chart.copyData

Copies the numbers.

| shape | examples | status |
| --- | --- | --- |
| imperative | Copy the chart data | supported, test n50 |
| clipboard | copy the numbers to the clipboard; put the numbers on my clipboard; clipboard the figures | supported, test r2103 |

## chart.toDocument

Puts the chart in the document.

| shape | examples | status |
| --- | --- | --- |
| imperative | Put the chart in the document | supported, test n51 |
| pronoun | put it in the doc; send the chart to my document | supported, test r2132 |

## chart.toDocumentData

Puts the numbers in the document.

| shape | examples | status |
| --- | --- | --- |
| imperative | Put the chart data in the document | supported, test n52 |
| short | add the numbers to the document; numbers into the document please | supported, test r2133 |

## chart.options

What the Charts tab can do (types, colours, palettes, settings).

| shape | examples | status |
| --- | --- | --- |
| question about options | what chart types can i use; what options are there | supported, test r2106 |
| what can you do | what can you do with charts | supported, test r2107 |
| colours | which colours can i use | supported, test r2108 |

## Not supported (whole world)

| shape | examples | reason |
| --- | --- | --- |
| undo of a chart edit | undo; go back; not that, the other one | there is no undo operation for chart edits (a state-wide undo would be a new operation) |
| axis titles, grid lines, fonts, sizes, log scale | rename the x axis | the chart view has no such settings |
| filter or top-N | show only the top 3 | no operation filters bars |
| dates and time series | chart the sales by month | the data has labels and numbers only |
| export as SVG or PDF | download as pdf | only PNG and CSV are produced |
| "what %" with the percent sign | what % is apples | the tokenizer drops "%" (src) |

Shapes common to all operations (politeness `could you maybe`, `pls`, `thx`, `u`, `em`, number words, typos within edit distance 1-2, coordination with `and`/`then`/commas) are handled by the shared filler lists of the patterns and the engine; the sweep tests include them (`r2*` ids).
