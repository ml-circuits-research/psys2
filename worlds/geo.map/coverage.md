# geo.map coverage catalogue (R2)

For every operation of the map world, the request shapes a user may use. `supported` lines are matched by general patterns in `patterns.sop` (the generated block `pat.geo.map.w.*` plus the base patterns) and have a test in `tests.sop` (`t.geo.map.r2nNNN`, text = start of the reply). `unsupported` lines say why.

Shape classes considered: imperative, question, wish, indirect, statement-as-command, elliptic, voice style (fillers, run-ons), typos and abbreviations (u, r, pls, thx, whats), word-order variants, synonyms, pronouns and references, quantities/units/number words, negation and undo, coordination, politeness, questions about state, questions about options.

Cross-cutting support (all operations): sentence-initial and trailing fillers and chat words (uh, um, hmm, like, hey so, pls, plz, thx, lol, real quick, buddy), polite and wish frames (can u, could you, I wanna, I need to know, do you know, tell me, quick question), commas, number words (digits after normalisation), `whats`, `r`/`u`, `n` for "and", `'s` and bare possessives (japans, romanias), demonym adjectives (japanese, brazilian, romanian ... via `lex.geo.map.demonyms`, resolved to the country in ops.mjs), typo correction by the engine (when a unique known word is within distance), and sequential coordination ("show Paris, then zoom in") through clause splitting.

## geo.show: show a place (country, city, region) and fit the view

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Show me Bucharest. | supported (test) |
| imperative | Take me to Tokyo. | supported (test) |
| synonym | Pull up Bucharest for me. | supported (test) |
| synonym | Zoom me over to Tokyo. | supported (test) |
| wish | I wanna see Kyoto. | supported (test) |
| wish | I would like to see Paris. | supported (test) |
| question | Can you show me Paris? | supported (test) |
| question | Could you pull up Madrid please? | supported (test) |
| indirect | I want to look at Rome. | supported (test) |
| elliptic | Bucharest pls | supported (test) |
| elliptic | map kyoto | supported (test) |
| voice | uh show me bucharest lol | supported (test) |
| voice | hey so like can u show me berlin real quick | supported (test) |
| typo | show me bucarest | supported by pattern, but the sentence is claimed by data.charts (pat.data.charts.r2.val.q2); not testable here |
| word-order | Paris on the map | supported (test) |
| coordination | Show Paris and Rome. | supported (test) |
| coordination | Fly to Madrid, Lisbon and Paris. | supported (test) |
| coordination | Show Paris, then zoom in. | supported (test) |
| reference | Show it again please. | unsupported: pronouns and "that/it" references are not resolved by the map rules (no recent-place slot); say the place name |

## geo.where: where is a place (shows it)

| Shape | Example | Status |
| --- | --- | --- |
| question | Where is Kyoto? | supported (test) |
| question | wher is Kyoto | supported (test) |
| question | Do you know where Nairobi is? | supported (test) |
| question | Where can I find Kyoto? | supported (test) |
| wish | I need to know where Kyoto is on the map. | supported (test) |
| elliptic | kyoto location? | supported (test) |
| voice | yo where's Kyoto | supported (test) |
| politeness | Could you tell me where Nairobi is situated? | supported (test) |
| word-order | Nairobi, where is it exactly? | unsupported: free-form noun-first question; say "where is X" |

## geo.coords: go to coordinates

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Go to coordinates 45.5 25.3. | supported (test) |
| synonym | Take the map to 47.2 and 21.9. | supported (test) |
| elliptic | lat 47.2 lng 21.9 | supported (test) |
| word-order | latitude 47.2 longitude 21.9 please | supported (test) |
| voice | lets go to 45.5 25.3 lol | supported (test) |
| quantities | jump to lat 47.2 and long 21.9 | supported (test) |

## geo.zoom: zoom in or out (steps, amounts)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Zoom in. | supported (test) |
| imperative | Zoom out a bit. | supported (test) |
| quantities | Zoom in 3 clicks. | supported (test) |
| quantities | Zoom out 2 levels. | supported (test) |
| synonym | Get closer to it. | supported (test) |
| synonym | Magnify the map quite a bit. | supported (test) |
| elliptic | closer please | supported (test) |
| elliptic | further out | supported (test) |
| typo | zoom in alot | supported (test) |
| voice | can u zoom in a whole lot | supported (test) |
| wish | I want to see it bigger | unsupported: no operation supports it |
| indirect | Pull back a bit. | supported (test) |
| politeness | Could you please zoom out a lot? | supported (test) |
| reference | Zoom in on that one. | unsupported: pronouns and "that/it" references are not resolved by the map rules (no recent-place slot); say the place name |
| state | What is the zoom level? | unsupported: no operation reads this state back (zoom level / last move) |

## geo.zoomTo: set the zoom level

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Set zoom level 3. | supported (test) |
| elliptic | zoom 6 | supported (test) |
| typo | zoom lvl 4 | supported (test) |
| word-order | level 5 zoom pls | supported (test) |
| synonym | Change the zoom to 4. | supported (test) |
| voice | go to zoom 5 | supported (test) |
| quantities | zoom u to level five | supported (test) |

## geo.pan: move the view in a direction (amount, km)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Pan east. | supported (test) |
| imperative | Go north a bit. | supported (test) |
| synonym | Slide the view north. | supported (test) |
| synonym | Move the view to the right. | supported (test) |
| elliptic | north a little | supported (test) |
| elliptic | east pls | supported (test) |
| word-order | map east | supported (test) |
| voice | head north for a bit | supported (test) |
| quantities | Slide the view 100 km east. | supported (test) |
| quantities | Go 50 miles south. | supported (test) |
| wish | I wanna go west a bit | supported (test) |
| politeness | Could you move the map a little to the west? | supported (test) |
| state | Where did the map move to? | unsupported: no operation reads this state back (zoom level / last move) |

## geo.world: whole world view

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Show the whole world. | supported (test) |
| synonym | The whole planet on the map. | supported (test) |
| elliptic | world view | supported (test) |
| indirect | Zoom out to see everything. | supported (test) |
| synonym | Back to whole world. | supported (test) |
| wish | I want to see the entire globe. | supported (test) |

## geo.reset: reset the view (zoom and pan)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Reset the map. | supported (test) |
| imperative | Reset the view. | supported (test) |
| synonym | Recenter the map. | supported (test) |
| synonym | Put the view back to normal. | supported (test) |
| negation | Undo my zoom and pan. | supported (test) |
| typo | re-center the map please | supported (test) |

## geo.clearAll: clear markers, highlights, lines (reset the map content)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Clear the map. | supported (test) |
| synonym | Wipe everything off the map. | supported (test) |
| synonym | Clear the whole thing. | supported (test) |
| synonym | Clean the map up. | supported (test) |
| indirect | Start from scratch. | supported (test) |
| voice | blank the map out | supported (test) |
| negation | Undo that and start over. | unsupported: the map has no undo operation (only explicit clears and resets) |

## geo.mark: markers on named places

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Put a marker on Cluj. | supported (test) |
| imperative | Mark Paris and Rome. | supported (test) |
| elliptic | cluj marker | supported (test) |
| word-order | marker on Cluj please | supported (test) |
| synonym | Drop a pin on Madrid. | supported (test) |
| wish | I want a flag on Berlin. | supported (test) |
| synonym | Put Cluj on the map with a marker. | supported (test) |
| coordination | Pin Paris, Rome and Madrid. | supported (test) |
| option-question | What can I do with markers? | unsupported: questions about options belong to ui.help; the map world has no operation that lists its own options |

## geo.markHere: marker at the centre of the view

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Put a marker here. | supported (test) |
| elliptic | marker here pls | supported (test) |
| synonym | Stick a flag right here. | supported (test) |
| synonym | Drop a marker at the center of the view. | supported (test) |
| indirect | Can you mark where I am looking? | supported (test) |

## geo.markSet: markers on all capitals or biggest cities of a region

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Mark the capitals of Europe. | supported (test) |
| synonym | Put markers on all the capitals in Africa. | supported (test) |
| wish | I want the capitals of Europe marked. | supported (test) |
| word-order | Europe capitals markers | supported (test) |
| synonym | Pin every capital in Europe. | supported (test) |
| possessive | Mark Europe's capitals. | supported (test) |
| imperative | Mark the 5 biggest cities of Japan. | supported (test) |

## geo.clearMarkers: remove markers (all, last, one place)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Remove the markers. | supported (test) |
| negation | No more markers. | supported (test) |
| synonym | Take all the pins off the map. | supported (test) |
| reference | Remove the last marker. | supported (test) |
| reference | Remove the most recent pin. | supported (test) |
| reference | Take the last pin away. | supported (test) |
| reference | Erase the last one I placed. | supported (test) |
| place | Remove the marker on Rome. | supported (test) |
| place | Take the pin off Rome. | supported (test) |

## geo.highlight: highlight countries

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Highlight Italy. | supported (test) |
| coordination | Highlight Italy and Portugal. | supported (test) |
| synonym | Make Italy and Portugal stand out. | supported (test) |
| word-order | Italy and Portugal highlighted | supported (test) |
| synonym | Show Italy and Portugal in color. | supported (test) |
| wish | I want France and Spain highlighted. | supported (test) |
| politeness | Could you highlight both France and Spain? | supported (test) |
| typo | france n spain highlight | supported (test) |
| relation | Highlight France and its neighbours. | supported (test) |

## geo.clearHighlight: remove highlights

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Remove the highlights. | supported (test) |
| synonym | Unhighlight everything. | supported (test) |
| synonym | Take the highlights off. | supported (test) |
| synonym | Turn off all the highlighting on the map. | supported (test) |
| synonym | Get rid of the coloured countries. | supported (test) |
| negation | No more highlighted countries. | supported (test) |

## geo.clearLines: remove measurement lines

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Remove the lines. | supported (test) |
| synonym | Delete the measurement line. | supported (test) |
| synonym | Wipe the distance lines off the map. | supported (test) |
| synonym | Take off the rulers. | supported (test) |
| synonym | Erase the line I drew. | supported (test) |

## geo.layer: switch the base map (street, simple, offline ...)

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Switch to the street map. | supported (test) |
| synonym | Use the plain map pls. | supported (test) |
| word-order | Map style simple please. | supported (test) |
| wish | I want the offline version of the map. | supported (test) |
| reference | Go back to the simple one. | supported (test) |
| question | Can you change the map to street? | supported (test) |
| elliptic | Street map pls | supported (test) |
| indirect | Show the street map instead. | supported (test) |
| option-question | What map styles can I use? | unsupported: questions about options belong to ui.help; the map world has no operation that lists its own options |

## geo.capital: capital of a country

| Shape | Example | Status |
| --- | --- | --- |
| question | What is the capital of Japan? | supported (test) |
| voice | whats the capital of japan | supported (test) |
| word-order | Japan capital city? | supported (test) |
| possessive | Tell me Japan's capital city. | supported (test) |
| synonym | Which city is Japan's capital? | supported (test) |
| politeness | Can u tell me the capital of japan? | supported (test) |
| wish | I wanna know the capital of japan | supported (test) |
| elliptic | Capital of Japan? | supported (test) |

## geo.capitalOfWhich: which country has this capital

| Shape | Example | Status |
| --- | --- | --- |
| question | Which country has Lima as its capital? | supported (test) |
| word-order | Madrid is capital of which country? | supported (test) |
| possessive | Which country's capital is Ottawa? | supported (test) |
| imperative | Name the country where Ottawa is capital. | supported (test) |
| elliptic | Madrid capital of what country? | supported (test) |

## geo.isCapital: is X the capital of Y

| Shape | Example | Status |
| --- | --- | --- |
| question | Is Paris the capital of France? | supported (test) |
| elliptic | Paris capital of France? | supported (test) |
| negation | Isn't Rome the capital of Italy? | supported (test) |
| statement-as-question | True that Berlin is capital of Germany? | supported (test) |
| elliptic | Rome capital of Italy yes or no | supported (test) |

## geo.population: population

| Shape | Example | Status |
| --- | --- | --- |
| question | How many people live in Tokyo? | supported (test) |
| voice | how many ppl live in Tokyo | supported (test) |
| word-order | Tokyo has how many people? | supported (test) |
| elliptic | tokyo population? | supported (test) |
| quantities | Roughly how many people are in Tokyo? | supported (test) |
| synonym | What is the population of Tokyo? | supported (test) |
| synonym | How populous is Tokyo? | supported (test) |

## geo.area: area / size

| Shape | Example | Status |
| --- | --- | --- |
| question | How big is France? | supported (test) |
| word-order | How large is France in size? | supported (test) |
| question | How much land does France cover? | supported (test) |
| elliptic | france size? | supported (test) |
| units | france area in km2 | supported (test) |
| synonym | What is the area of France? | supported (test) |

## geo.compare: which is bigger / more populous (open question)

| Shape | Example | Status |
| --- | --- | --- |
| question | Which is bigger, Brazil or Canada? | supported (test) |
| word-order | Brazil or Canada, which is bigger? | supported (test) |
| elliptic | spain vs italy | supported (test) |
| imperative | Compare Italy and Spain. | supported (test) |
| question | What's the difference between Spain and Italy? | supported (test) |
| question | How do Spain and Italy stack up? | supported (test) |
| word-order | Spain Italy comparison | supported (test) |
| state | Which city has more people, Paris or Rome? | supported (test) |

## geo.compareYN: is X bigger than Y (yes/no)

| Shape | Example | Status |
| --- | --- | --- |
| question | Is Canada bigger than Brazil? | supported (test) |
| typo | Brazil bigger then Canada? | supported (test) |
| statement-as-question | True or false, Brazil is bigger than Canada. | supported (test) |
| indirect | Does Brazil beat Canada in size? | supported (test) |
| question | Does India have more people than China? | supported (test) |
| question | Would Brazil be bigger than Canada? | supported (test) |

## geo.borders: neighbouring countries

| Shape | Example | Status |
| --- | --- | --- |
| question | Which countries border Hungary? | supported (test) |
| synonym | What borders Hungary? | supported (test) |
| synonym | Countries next to Romania? | supported (test) |
| word-order | Austria borders what countries? | supported (test) |
| possessive | Who are Austria's land neighbours? | supported (test) |
| elliptic | Hungary neighbours | supported (test) |
| imperative | List countries touching Austria. | supported (test) |

## geo.neighbourCount: number of neighbours

| Shape | Example | Status |
| --- | --- | --- |
| question | How many countries border Austria? | supported (test) |
| word-order | Germany borders how many? | supported (test) |
| elliptic | Hungary neighbour count | supported (test) |
| imperative | Count the neighbours of Spain. | supported (test) |
| voice | u know how many neighbours hungary has? | supported (test) |
| synonym | Number of neighbours of Germany. | supported (test) |

## geo.borderYN: do X and Y border each other

| Shape | Example | Status |
| --- | --- | --- |
| question | Does France border Spain? | supported (test) |
| word-order | France and Spain share a border? | supported (test) |
| synonym | Is Spain next door to France? | supported (test) |
| elliptic | France touches Spain? | supported (test) |
| politeness | Can you tell me if France borders Spain? | supported (test) |

## geo.landlocked: landlocked / coast

| Shape | Example | Status |
| --- | --- | --- |
| question | Is Bolivia landlocked? | supported (test) |
| synonym | Does Bolivia have a sea border? | supported (test) |
| elliptic | Bolivia no coast? | supported (test) |
| elliptic | Bolivia landlocked or not? | supported (test) |
| synonym | Does Bolivia touch the sea? | supported (test) |
| politeness | Can you tell me if Bolivia is landlocked? | supported (test) |
| negation | No ocean for Bolivia? | supported (test) |

## geo.continent: continent of a place

| Shape | Example | Status |
| --- | --- | --- |
| question | What continent is Egypt in? | supported (test) |
| word-order | Egypt is in which continent? | supported (test) |
| elliptic | Egypt continent? | supported (test) |
| word-order | Continent of Egypt? | supported (test) |
| politeness | Can you say what continent Egypt is in? | supported (test) |
| possessive | Egypt's continent pls | supported (test) |

## geo.isIn: is X in Y

| Shape | Example | Status |
| --- | --- | --- |
| question | Is Egypt in Europe? | supported (test) |
| elliptic | Osaka in Japan? | supported (test) |
| word-order | Munich in Germany true or false? | supported (test) |
| synonym | Is Kyoto located in Japan? | supported (test) |

## geo.country: country of a city

| Shape | Example | Status |
| --- | --- | --- |
| question | Which country is Cluj in? | supported (test) |
| word-order | Cluj is in what country? | supported (test) |
| elliptic | Cluj country? | supported (test) |
| word-order | Country of Cluj? | supported (test) |

## geo.superlative: largest/smallest/most populous city or country (optionally top N)

| Shape | Example | Status |
| --- | --- | --- |
| question | Which is the largest city in Romania? | supported (test) |
| word-order | Romania's biggest city? | supported (test) |
| elliptic | Europe smallest country pls | supported (test) |
| synonym | Tiniest european country. | supported (test) |
| synonym | Which european country is the least big? | supported (test) |
| question | Whats the smallest country in europe? | supported (test) |
| quantities | Top 3 biggest cities in Japan. | supported (test) |
| quantities | Japan's 3 biggest cities. | supported (test) |
| demonym | List 3 biggest japanese cities. | supported (test) |
| word-order | Which country in Europe has the smallest area? | supported (test) |

## geo.listOp: list countries or cities of a region

| Shape | Example | Status |
| --- | --- | --- |
| imperative | List the countries in South America. | supported (test) |
| question | Which countries are in Africa? | supported (test) |
| synonym | Name the cities in Romania. | supported (test) |

## geo.count: count countries or cities of a region

| Shape | Example | Status |
| --- | --- | --- |
| question | How many countries are in Europe? | supported (test) |
| synonym | Number of countries in Europe. | supported (test) |
| elliptic | Europe country count. | supported (test) |
| word-order | Countries in Europe how many? | supported (test) |
| imperative | Count the countries in Europe. | supported (test) |

## geo.currency: currency

| Shape | Example | Status |
| --- | --- | --- |
| question | What currency does Japan use? | supported (test) |
| elliptic | Japan currency? | supported (test) |
| voice | what do they pay with in japan | supported (test) |
| possessive | What's Japan's money called? | supported (test) |
| demonym | Which currency do Japanese people use? | supported (test) |

## geo.languages: languages

| Shape | Example | Status |
| --- | --- | --- |
| question | What languages are spoken in Brazil? | supported (test) |
| elliptic | Brazil language? | supported (test) |
| demonym | What do Brazilians speak? | supported (test) |
| voice | what do people speak in brazil | supported (test) |

## geo.info: facts about a place

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Tell me about Romania. | supported (test) |
| elliptic | Romania facts pls | supported (test) |
| synonym | Give me info about Romania. | supported (test) |
| question | What's Romania like? | supported (test) |
| synonym | Brief me on Romania. | supported (test) |
| elliptic | romania overview | supported (test) |
| pronoun | Tell me more about it. | unsupported: pronouns and "that/it" references are not resolved by the map rules (no recent-place slot); say the place name |

## geo.distance: distance between two places (draws a line)

| Shape | Example | Status |
| --- | --- | --- |
| question | How far is Paris from Rome? | supported (test) |
| question | How far away is Rome from Paris? | supported (test) |
| word-order | Madrid to Lisbon distance | supported (test) |
| elliptic | Madrid Lisbon km? | supported (test) |
| word-order | Gap between Paris and Rome in km | supported (test) |
| quantities | Paris to Rome how many km? | supported (test) |
| imperative | Measure the distance from Paris to Rome. | supported (test) |
| politeness | Can you tell me how far Madrid is from Lisbon? | supported (test) |
| voice | how far apart r paris and rome | supported (test) |
| reference | How far is that from here? | unsupported: pronouns and "that/it" references are not resolved by the map rules (no recent-place slot); say the place name |

## geo.distanceFrom: distance from my location

| Shape | Example | Status |
| --- | --- | --- |
| question | How far is Tokyo from my spot? | supported (test) |
| word-order | Distance from my location to Rome | supported (test) |
| word-order | Distance to Rome from me? | supported (test) |
| question | Am I far from Rome? | supported (test) |
| question | How far is Lima from where I'm standing? | supported (test) |

## geo.locate: find my location

| Shape | Example | Status |
| --- | --- | --- |
| question | Where am I? | supported (test) |
| question | Where am I on the map? | supported (test) |
| elliptic | my location please | supported (test) |
| voice | where r we | supported (test) |
| indirect | Can u find where i am? | supported (test) |
| imperative | Locate me. | supported (test) |

## geo.here: what is at the centre of the view

| Shape | Example | Status |
| --- | --- | --- |
| question | What is here? | supported (test) |
| voice | whats here | supported (test) |
| question | What's at this spot? | supported (test) |
| indirect | Tell me what's around me. | supported (test) |
| question | Which place am I looking at? | supported (test) |
| question | What am I looking at right now? | supported (test) |

## geo.describe: describe the map state

| Shape | Example | Status |
| --- | --- | --- |
| question | What is on the map? | supported (test) |
| imperative | Describe the map. | supported (test) |

## geo.markers: list / count markers

| Shape | Example | Status |
| --- | --- | --- |
| question | What markers do I have? | supported (test) |
| state | How many markers r there? | supported (test) |
| state | Count the pins on the map. | supported (test) |
| elliptic | Markers count pls | supported (test) |
| imperative | List the markers. | supported (test) |

## geo.highlights: list highlighted countries

| Shape | Example | Status |
| --- | --- | --- |
| state | Which countries are highlighted? | supported (test) |
| state | Which ones are lit up on the map? | supported (test) |
| state | What is highlighted right now? | supported (test) |
| state | Which nations did I highlight? | supported (test) |
| imperative | List the highlighted countries. | supported (test) |

## Not an operation of this world (by design)

Routing, driving directions, travel time, weather, time zones, elevation, population density rankings, saving the map as an image, sharing a link, "undo the last map action". Each would need a new operation in operations.sop and ops.mjs.


Totals: 304 catalogue lines; 293 supported with tests; 11 unsupported (listed above).

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 75 repeated lists are macros). Five `ask.value` shapes with the possessive form (`poss=true`) cover the one-place questions: `geo.map.capital`, `.population`, `.currency`, `.continent`, `.country` (40 generated patterns): "what is the capital of Japan", "i want to know the capital of Japan", "can you tell me the population of Brazil", "do you know the currency of Japan", "what is Peru's continent", "name the capital city of Italy" (tests sh01 to sh05). Twelve hand patterns whose examples a shape covered completely were deleted. Superlatives, zoom, compare, markers, distances, borders, counts and highlights have several slots or special wording and stay hand-written.
