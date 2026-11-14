> KNOWLEDGE-OUT step 5: this world no longer answers questions or holds a knowledge base. The text below describes the coverage before that change (the questions it lists are now the Talk tab's frames over the knowledge catalog); only the teaching and pet statements remain here.

# kids.shapes: request-shape catalogue (R2)

Status: **S** = supported by general patterns, with tests in `tests.sop` (`t.shapes.*`; `s###` come from the rule sweep); **U** = unsupported, with the reason.
Operations: sides and corners of a shape (ask, yes/no, search by count), describe a shape, shape families (is a square a rectangle), the shape of a thing and the things of a shape, the colour of a thing (ask, yes/no, search by colour), colour kinds (primary, secondary), colour mixing (result, recipe), and teaching facts.

Shared shape rules: politeness and lead-ins (`can you tell me`, `can u say`, `would you say`, `do you think`, `is it true`, `pls confirm`, `i dont get`), tails (`pls`, `thanks`, `lol`, `right`, `isnt it`, `true?`), `a/an/the`, number words, spelling variants of shapes (`sqaure`, `tri`, `rect`, `hexagone` ... in `lexicon.sop`), `color/colour`.

## sides and corners
| Shape | Examples | Status |
| --- | --- | --- |
| question | how many sides does a hexagon have / has / on a hexagon, how many corners does a square have | S |
| elliptic / noun first | hexagon sides?, hexagon sides how many, triangle corners how many, sides of a hexagon, sides of a hexagon: how many?, count hexagon sides | S |
| fillers inside | um how many sides does like a hexagon have | S |
| imperative / wish | tell me the number of sides of a pentagon, can you say how many sides a hexagon has | S |
| yes/no | does a triangle have 3 sides, a hexagon has 6 sides right, is a hexagon with 6 sides | S |
| search by count | which shape has 4 sides, shapes with 5 corners, three sided shapes, name a shape with 3 sides, a shape with 3 sides is which one, i need the shape that has 3 sides, 3 sides which shape is that, which shapes have no corners | S |
| "which one has 3 sides" | | U: the word "one" is read as the number 1 by the tokenizer |
| teaching | a triangle has 3 sides, remember a hexagon has six sides, hexagon 6 sides | S |

## describe a shape
| Shape | Examples | Status |
| --- | --- | --- |
| question | what is a triangle, whats a rhombus, what is an oval like | S |
| imperative | tell me about squares, describe a circle, explain the circle shape, teach me about pentagons, give me a pentagon summary, show me circle facts | S |
| elliptic / noun first | pentagon?, pentagon info, pentagon description pls, hexagon what is it, circles what are they like, a hexagon is what exactly | S |
| confused wording | i dont get what a hexagon is whats one | S |
| comparison ("how is a circle different") | | U: no operation compares shapes |

## shape families
| Shape | Examples | Status |
| --- | --- | --- |
| aux question | is a square a rectangle, are squares rectangles, does a square count as a rectangle | S |
| elliptic / tag | triangle a polygon?, triangle polygon?, a hexagon is a triangle right, hexagons triangles same?, polygon or not a circle | S |
| lead-ins | would you call a circle a polygon, pls tell me is a square a rectangle | S |
| it-forms | a circle, is it a polygon; is it a polygon, a circle | S |
| round | is a circle round, circle round?, does a circle have a round shape, round is a circle | S |
| abbreviations | is a hexagon a tri, tri is square | S |
| descriptive shapes ("a three-sided shape", "a round shape") as subject | | U: the subject slot takes one noun |

## shape of a thing, things of a shape
| Shape | Examples | Status |
| --- | --- | --- |
| shape of a thing | what shape is a ball, what shape does a ball have, whats the shape of a plate, shape of a clock, plate shape? | S |
| things of a shape | what is shaped like a circle, what looks like a circle, name things shaped like a circle, where do we see a triangle, where can i spot a circle | S |
| teaching | a ball is a circle, a ball looks like a circle | S |

## colours of things
| Shape | Examples | Status |
| --- | --- | --- |
| ask the colour | what color is the sky, what colour is grass, colour of a banana, sky color?, banana colour pls, tell me the carrot color, tomatoes are what color, what colour is a ripe tomato, u know what color a banana is | S |
| yes/no | is the sky blue, is grass green, are bananas yellow, sky blue?, can a banana be blue, a leaf could be blue right, is a blue leaf possible, is the sky supposed to be green, do bananas tend to be yellow | S |
| lead-ins and tags | would you say a banana is yellow, is it true a banana is yellow, pls confirm a banana is yellow, a banana is yellow isnt it, is it blue the sky | S |
| search by colour | which things are red, name something yellow, red things, list objects in red | S |
| teaching | a banana is yellow, bananas are yellow, banana color is yellow, remember that grass is green | S |

## colour kinds
| Shape | Examples | Status |
| --- | --- | --- |
| aux question | is green a primary color, is red primary, is orange a secondary color | S |
| elliptic | secondary orange?, primary black?, secondary: green?, secondary color green right?, green a secondary one? | S |
| alternatives | is green secondary or primary | S (answers for the first kind named) |
| lead-ins | would you call red a primary color, u think red is a primary color, do u think orange is primary | S |
| list the colours of a kind | which colors are primary, what are the secondary colors, name the primary colours, how many primary colors are there | S |
| "primary colors include orange?" | S |
| "primary color: is red one?" | U: "one" is read as the number 1 |

## mixing colours
| Shape | Examples | Status |
| --- | --- | --- |
| result | what do red and blue make, red and blue make what, red plus blue?, whats blue plus yellow, mix red and yellow, what happens when you mix red and white | S |
| lead-ins with "if" | if u mix red and yellow what color u get, if i mix red and yellow what color do i get, color from mixing red and yellow? | S |
| elliptic | blue yellow mix?, red yellow mix result, what does red yellow mixing give, whats red yellow | S |
| recipe | how do i make green, how to make purple, which colors make orange, which two colors make brown, how can i make brown paint, orange how made?, what mixes into orange, get orange by mixing what, make orange how, recipe for purple, green is made of what | S |
| wish with "it" | i want purple how do i make it, purple how do i make it | S |
| teaching | red and blue make purple, mixing red and blue gives purple, remember red plus blue is purple | S |
| shades beyond the 12 listed colours, three-colour mixes | | U: only the listed colours and pairs exist in the KB |

## Cross-cutting
| Shape | Status |
| --- | --- |
| very short / elliptic | S |
| voice fillers and run-ons (`um`, `like`, `so`, `wait`) | S |
| typos and abbreviations (u, ur, pls, whats, wat, sqaure, tri, rect) | S |
| pronouns and references ("it", "that one") | S only in the "is it ...?" forms that repeat the noun; U for pure pronoun questions (no shape coreference in the rule formalizer) |
| negation | "a banana is not red" is not a fact to teach (negative tests in `datagen.mjs`) |
| coordination | "a banana is yellow and green" S (two facts) |
| questions about the options | answered by `ui.help` |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 29 repeated lists are macros). One shape, `kids.shapes.thingcolor` (ask.value with `poss=true`, 8 generated patterns), covers the colour of a thing ("can you tell me the color of a banana", "do you know the colour of a carrot", "banana's color"; tests sh01 to sh03) and replaced three hand patterns (`col1`, `col2`, `x.tcol.c`); `w.thingcolor.f2` ("tomatoes are what color usually") stays because it reads the trailing "usually". Mixes, families, side counts, shape summaries and the colour-kind questions combine two slots or lists and stay hand-written.
