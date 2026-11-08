# kids.animals: request-shape catalogue (R2)

Status: **S** = supported by general patterns, with tests in `tests.sop` (`t.animals.*`; `s###` come from the rule sweep); **U** = unsupported, with the reason.
Operations: questions on one animal (legs, food, class, abilities, sound, baby, covering, habitat, summary, yes/no on class or diet), searches over the KB (by legs, habitat, class, diet, ability, food, sound, covering), the reverse baby question (what is a calf), pets (tell a pet and its name, ask for it), and teaching facts.

Shared shape rules (apply to every question below): politeness and lead-ins (`can you tell me`, `can u say`, `remind me`, `pls`, `hey`, `quick question`, `i wonder`), tails (`pls`, `thanks`, `lol`, `btw`, `real quick`), plurals and `a/an/the/every/any/all`, number words for numbers, kid typos of animal names (`pengiun`, `rabit`, `elefant`, ... in `lexicon.sop`) and of abilities (`flyy`, `swimm`), synonyms `kitty`, `doggy`, `mallard`.

## legs of one animal
| Shape | Examples | Status |
| --- | --- | --- |
| question | how many legs does a spider have / has a spider got / do spiders have, how many feet does a dog have | S |
| prepositional | how many legs on a spider, legs on a spider, number of legs of a dog, tell me the legs of a spider | S |
| noun first / elliptic | spider legs?, spider leg number, spiders how many legs pls, dog legs how many, count spider legs | S |
| imperative / wish | tell me how many legs a spider has, can you say how many legs a spider has | S |
| yes/no with a number | does a dog have 4 legs, is it true that a spider has eight legs, a spider has 8 legs right | S |
| statement as teaching | a spider has 8 legs, remember a zebra has 4 legs, fyi zebra 4 legs, a zebra got 4 legs | S |

## food of one animal
| Shape | Examples | Status |
| --- | --- | --- |
| question | what does a rabbit eat, what do rabbits eat, what food does a rabbit need | S |
| synonyms of "eat" | like to eat, munch on, live on, feed on, dine on, usually eat, is eating | S |
| noun first / elliptic | rabbit food?, rabbit diet pls, rabbits eat what | S |
| about the diet | what is the diet of a cow, what is a lion's favorite food | S |
| yes/no | does a rabbit eat carrots, cows eat meat right? | S |
| plant / meat eater yes/no | does a cow eat plants, is a cow a plant eater, is a lion a meat eater, does a bear eat both meat and plants | S (read as the diet class: herbivore, carnivore, omnivore) |
| teaching | rabbits eat carrots, a rabbit eats carrots and grass | S |

## class, diet and kind (yes/no)
| Shape | Examples | Status |
| --- | --- | --- |
| aux question | is a whale a fish, are bats mammals | S |
| tag question | a bat is a bird right?, whales are fish true? | S |
| lead-ins | is it true a whale is a fish, would a dolphin count as a mammal, u think a dolphin's a mammal, would you call a cow a carnivore | S |
| adjectives | is a cow carnivorous / herbivorous / vegetarian | S |
| one-or-the-other | is a whale a fish or a mammal | S (answers for the first kind named) |
| what kind of animal | what kind of animal is a whale, what type of animal is a frog | S |
| teaching | a whale is a mammal, a lion is a carnivore | S |

## abilities (fly, swim)
| Shape | Examples | Status |
| --- | --- | --- |
| question | can a penguin fly, do penguins fly, is a whale able to swim | S |
| synonyms | take off, flap, soar, glide; go in water, float, paddle, dive; good at swimming, good swimmers | S |
| noun first / elliptic | penguin fly?, bunny swim or no | S |
| lead-ins | can u tell me if a cat can swim, is it possible for a penguin to fly, is it true a bat can fly, do you think a dolphin can swim | S |
| typos | can pengiun fly, can penguins flyy | S |
| teaching | a duck can swim, a penguin cannot fly, zebras dont swim, a zebra cant swim, a zebra is not able to swim | S |
| other abilities (run, climb, jump) | | U: the legend has only `can_fly` and `can_swim` |

## sound, baby, covering, habitat, summary
| Shape | Examples | Status |
| --- | --- | --- |
| sound | what sound does a cow make, what does a cow say, cow sound?, cow say?, tell me the sound a cow makes, cows say what | S |
| baby | what is a baby cow called, baby cow name?, cow baby?, what do you call the baby of a cow, whats a baby sheep called | S |
| baby reverse | what is a calf, whats a calf, calf?, calf meaning, tell me about calves, who is a calf, puppy is the baby of what | S |
| covering | what is a duck covered in, what covers a cow's body, whats a cow covered in, cow skin is covered in what, what is the covering of a cow, what kind of skin or fur does a cow have, covering of a duck? | S |
| habitat | where does a camel live, where can i find a camel, where is a camel's home, camel home?, camels where pls, where would i meet a camel | S |
| summary | tell me about the lion, what is a lion like, whats a dolphin like, dolphins tell me, dolphin info pls, give me the basics on dolphins, whats the deal with dolphins | S |
| questions about a trait not in the KB (friendly, smart, how big, how old) | are dolphins friendly | U: no key in the legend |

## searches
| Shape | Examples | Status |
| --- | --- | --- |
| by legs | animals with six legs, 6 legs animals, six legged animals?, which animals got 6 legs, animals with no legs, animals without legs | S |
| by habitat (with synonyms) | which animals live in the sea / ocean, sea animals, what lives in the ocean, name the sea animals, what creatures live in the sea, animals of the ocean pls, jungle/rainforest, polar/arctic, woods, farm/barn, garden/backyard ... | S |
| by class / diet | name a bird, list all reptiles, give me some mammals, which animals are carnivores | S |
| by ability, with class | which animals can fly, animals that cannot swim, which animals cant swim, flying animals, swimming bird please, a bird that swims name one, name a bird which swims well, tell me a bird that is good at swimming | S |
| by food / sound / covering | which animals eat grass, which animals say moo, which animals have feathers | S |

## pets
| Shape | Examples | Status |
| --- | --- | --- |
| tell | my dog is called Rex, the dog is named rex, my dogs name is rex, rex is my dog, rex is the name of my dog, name of my dog: rex, i have a dog called rex, i named my dog Rex, my doggy is rex, my pet cat is called tom, i have a cat and its called tom | S (lowercase names work for the typical pet names in `lexicon.sop`; any capitalized word is a name) |
| ask for the name | what is my dog called, whats my pets name, my pet name?, what did i call my pet, name of my pet?, remind me my pets name, can you tell me what my pet is called | S (a specific kind keeps `where.kind`, "pet" asks without kind) |
| ask what pets | which pets do i have, do i have a dog, who is Rex, what pet is Rex, is Rex a dog | S |
| two clauses with a comma ("ive got a cat, her name is tom", "meet tom, hes my cat") | | U: a clause cut at the comma has no animal in the second half |

## Cross-cutting
| Shape | Status |
| --- | --- |
| wish ("i want to know ...") and indirect forms | S (lead-ins) |
| voice fillers, run-ons | S (`um`, `like`, `so`, `ok`, double lead-ins) |
| pronouns ("it", "they" for the animal just asked about) | U: the rule formalizer has no animal coreference; only pets read the session |
| negation | `a snake has no legs`, `dogs dont eat pizza` are not facts to teach (negative tests in `datagen.mjs`) |
| coordination | "a rabbit eats carrots and grass" S |
| questions about the state ("what do you know") / options | answered by `ui.help` |
| spelling of the animal | S for the listed typos; unknown typos are read as a new animal name |
