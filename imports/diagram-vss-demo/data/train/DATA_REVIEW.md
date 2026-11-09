# Review of the training messages

1200 messages (Counter({'haiku_msg': 600, 'sonnet_msg': 600})).

| problem | source | n |
|---|---|---|
| anchor name not in the span | sonnet_msg | 55 |
| color=brown not expressed in the span | sonnet_msg | 1 |
| color=indigo not expressed in the span | sonnet_msg | 1 |
| color=red not expressed in the span | sonnet_msg | 1 |
| fluff sentence (no wire): usable as a 'not a request' example | haiku_msg | 602 |
| fluff sentence (no wire): usable as a 'not a request' example | sonnet_msg | 875 |
| from name not in the span | sonnet_msg | 46 |
| resize: bigger and smaller are the same label | haiku_msg | 13 |
| resize: bigger and smaller are the same label | sonnet_msg | 50 |
| shape=circle not expressed in the span | sonnet_msg | 4 |
| shape=diamond not expressed in the span | sonnet_msg | 2 |
| shape=ellipse not expressed in the span | sonnet_msg | 3 |
| shape=rectangle not expressed in the span | sonnet_msg | 2 |
| shape=square not expressed in the span | sonnet_msg | 1 |
| shape=triangle not expressed in the span | sonnet_msg | 2 |
| target name not in the span | haiku_msg | 1 |
| target name not in the span | sonnet_msg | 150 |
| to name not in the span | sonnet_msg | 16 |
| trigger contains a shape name | haiku_msg | 28 |
| trigger contains a shape name | sonnet_msg | 181 |
| trigger marks a value (colour, place, layout...), not the action | haiku_msg | 129 |
| trigger marks a value (colour, place, layout...), not the action | sonnet_msg | 925 |

## trigger marks a value (colour, place, layout...), not the action

- 'Which shape is the biggest on the map' trigger='the biggest' -> {'ask': 'extreme', 'superlative': 'biggest'}
- 'Which shape is the leftmost right now' trigger='the leftmost' -> {'ask': 'extreme', 'superlative': 'leftmost'}
- 'Which node has the most connections right now' trigger='the most connections' -> {'ask': 'extreme', 'superlative': 'mostConnected'}
- 'Which shape is the closest to Output' trigger='the closest to' -> {'ask': 'nearest', 'anchor': 'Output', 'superlative': 'closest'}
- 'What is the biggest shape on the map' trigger='biggest' -> {'ask': 'extreme', 'superlative': 'biggest'}

## trigger contains a shape name

- 'Is Paused a circle' trigger='Is Paused a'
- 'Is the Tenor a square' trigger='Is the Tenor a'
- 'Is the Desk a diamond' trigger='Is the Desk a'
- 'Is the Adopt a circle' trigger='Is the Adopt a'
- 'Is the Soup a circle' trigger='Is the Soup a'

## resize: bigger and smaller are the same label

- Resize the Mine
- Resize the Rack
- Resize the Rowing
- Resize the Stairs
- Resize the Boss

## target name not in the span

- "Set the Bride's table to a large gold circle" -> target=Bride
- 'bigger please' -> target=Start
- 'Distribute the three vertically' -> target=Math,Art,Gym
- 'Distribute the three vertically' -> target=Math,Art,Gym
- 'Distribute the three vertically' -> target=Math,Art,Gym

## shape=circle not expressed in the span

- 'Earth a small blue one' -> {'action': 'set', 'target': 'Earth', 'shape': 'circle', 'color': 'blue', 'size': 'small'}
- 'a large brown one called Jupiter at the right' -> {'action': 'create', 'shape': 'circle', 'color': 'brown', 'size': 'large', 'name': 'Jupiter', 'position': 'right'}
- 'Check the Head' -> {'ask': 'check', 'target': 'Head', 'shape': 'circle'}
- 'Count them too' -> {'ask': 'count', 'shape': 'circle'}

## color=indigo not expressed in the span

- 'a blue one named Team right of it' -> {'action': 'create', 'shape': 'diamond', 'color': 'indigo', 'name': 'Team', 'position': 'rightOf', 'anchor': 'Budget'}

## shape=diamond not expressed in the span

- 'a blue one named Team right of it' -> {'action': 'create', 'shape': 'diamond', 'color': 'indigo', 'name': 'Team', 'position': 'rightOf', 'anchor': 'Budget'}
- 'a lime one named Truck on its right' -> {'action': 'create', 'shape': 'diamond', 'color': 'lime', 'name': 'Truck', 'position': 'rightOf', 'anchor': 'Boxes'}

## from name not in the span

- 'chain those three together' -> from=Dough,Oven,Counter
- 'chain those three together' -> from=Dough,Oven,Counter
- 'chain those three together' -> from=Dough,Oven,Counter
- 'label the second arrow "jobs"' -> from=Api
- 'connect those' -> from=Lens

## to name not in the span

- 'label the second arrow "jobs"' -> to=Worker
- 'connect those' -> to=Sensor
- 'label the first arrow "scan"' -> to=Approval
- 'connect Order to those three' -> to=Stock,Ship,Notify
- 'connect Order to those three' -> to=Stock,Ship,Notify

## anchor name not in the span

- 'slide Lunch right of that column' -> anchor=Art
- 'Create a green circle named Health' -> anchor=Goals
- 'Is Offer the rightmost' -> anchor=Apply
- 'No on the right' -> anchor=Yes
- 'Beam above' -> anchor=Tower

## shape=ellipse not expressed in the span

- 'a pink one called Pie above Dessert' -> {'action': 'create', 'shape': 'ellipse', 'color': 'pink', 'name': 'Pie', 'position': 'above', 'anchor': 'Dessert'}
- 'another called Network below it' -> {'action': 'create', 'shape': 'ellipse', 'name': 'Network', 'position': 'below', 'anchor': 'Skills'}
- 'a large pink one called Characters to its right' -> {'action': 'create', 'shape': 'ellipse', 'color': 'pink', 'size': 'large', 'name': 'Characters', 'position': 'rightOf', 'anchor': 'Novel'}

## color=red not expressed in the span

- 'List them' -> {'ask': 'list', 'color': 'red'}

## shape=triangle not expressed in the span

- 'Count them' -> {'ask': 'count', 'shape': 'triangle'}
- 'Make it one' -> {'action': 'set', 'target': 'Pencil', 'shape': 'triangle'}

## shape=rectangle not expressed in the span

- 'a navy one called Methods on the right' -> {'action': 'create', 'shape': 'rectangle', 'color': 'navy', 'name': 'Methods', 'position': 'rightOf', 'anchor': 'Thesis'}
- 'Count the boards' -> {'ask': 'count', 'shape': 'rectangle'}

## shape=square not expressed in the span

- 'the Amp a huge black one' -> {'action': 'set', 'target': 'Amp', 'size': 'huge', 'color': 'black', 'shape': 'square'}

## color=brown not expressed in the span

- 'How many' -> {'ask': 'count', 'color': 'brown'}
