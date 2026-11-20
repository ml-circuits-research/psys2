"""Case catalogue of ui-diagram-v2: operation x parameter x reference form x UI control, each with frames in three tiers.
The frame slots are defined in frames.py ({add}, {nref}, {from}, ...); see that module for the forms each slot produces."""
from engine import Scene
from frames import F, fr, op
from vocab import scene_with


def S(**kw):
    return lambda rng: scene_with(rng, **kw)


EMPTY = lambda rng: Scene.empty() if rng.random() < 0.5 else Scene(rng, size=rng.randint(2, 4))
LINKS = S(need_links=True)
GROUP = S(need_group=True)
PLURAL = S(need_plural_kind=True)
UNIQUE = S(need_unique_kind=True)
MK = op('diagram.node.make')
CH = op('diagram.node.change')
LK = op('diagram.link.make')

CASES = {}


def case(cid, what, equivalent, complex_, simplified, scene=None, n=None):
    CASES[cid] = {'what': what, 'equivalent': equivalent, 'complex': complex_, 'simplified': simplified}
    if scene:
        CASES[cid]['scene'] = scene
    if n:
        CASES[cid]['n'] = n


# ============================================================ diagram as a whole
# A diagram is the page the nodes are made in (container): "add a diagram" makes a new member named by its container's kind
# (target type node, kind "diagram"); with members named ("a diagram with five boxes") the member kind and count are labelled
# and the container word stays unlabelled, as in "add three boxes to the diagram".
case('diagram.make:new', 'start a diagram (container word as the kind of a new member; members with count)',
     fr(['{pol}{add} {adkind}{post}', '{pol}{add} a new [k:diagram|diagram]', '[t:start] {adkind}', "let's {add} {adkind}", 'I [t:want] {adkind}',
         '{pol}{add} {adkind} here', 'new [k:diagram|diagram] please', '[t:begin] {adkind}', '[t:set up] {adkind}',
         '{pol}{add} a diagram with {n} {kinds}', '{pol}{add} a flowchart with {n} {gkinds}', '{pol}{add} a diagram of {n} {kinds}',
         '{pol}[t:start] a diagram with {n} {kinds} {layout}'], MK),
     fr(['I need to explain our process to the team, so {add} {adkind} for me', 'for the onboarding doc {add} {adkind} {why}',
         'we are planning the release, could you {add} {adkind} to start with', 'ok so first thing, {add} {adkind} and we will fill it in later',
         'to sketch the idea {add} a diagram with {n} {kinds}'], MK),
     fr(['{adkind}', '{add} {adkind}', 'new {dkind}', '{dkind} please', '{add} [k:diagram|diagram]', '[t:ad] a new [k:diagram|diagram]', 'a [k:diagram|diagram] pls',
         '[t:ad] a [k:diagramm|diagram]', '[t:add] a [k:diagam|diagram]', 'diagram with {n} {kinds}', '[t:make] a [k:diagrma|diagram]', '[t:ad] [k:diagram|diagram]'], MK),
     scene=EMPTY)

case('diagram.improve:layout', 'vague aesthetic/layout improvement of the whole diagram (declared improvement intent)',
     fr(['{pol}improve the layout{post}', '{pol}make it look better{post}', '{pol}tidy up the diagram{post}', '{pol}clean up the layout{post}',
         '{pol}make the diagram look nicer{post}', '{pol}make the diagram neater', '{pol}fix the layout', '{pol}rearrange everything so it looks good',
         '{pol}make it prettier', '{pol}organise the diagram better', '{pol}optimise the layout', '{pol}make the diagram more readable',
         '{pol}space things out nicely', '{pol}make this look professional', '{pol}untangle the arrows', '{pol}make it less cluttered'],
        op('diagram.improve')),
     fr(['the whole thing looks messy, {pol}improve the layout {why}', 'I am presenting this in an hour, make it look better',
         'can you clean this up a bit, the arrows cross everywhere', 'it is hard to follow, {pol}tidy up the diagram',
         'make the diagram look more polished {why}', 'my manager says it looks chaotic, could you fix the layout'], op('diagram.improve')),
     fr(['improve layout', 'look better', 'tidy up', 'clean up', 'nicer please', 'make it pretty', 'fix layout', 'better layout', 'neater',
         'beautify', 'make it nice', 'tidy', 'improve it', 'layout better pls', 'imporve the layout', 'make it look beter'], op('diagram.improve')),
     scene=LINKS)

# ============================================================ node.make
case('diagram.node.make:kind', 'add one node of a kind (all native kinds and synonyms)',
     fr(['{pol}{add} {akind}{post}', '{pol}{add} {akind} to the diagram', '{pol}{add} another {kind}', 'I need {akind}', 'can I get {akind}',
         '{pol}{add} {akind} on the canvas', 'we need {akind} here', '{pol}{add} one {kind}', '{pol}{add} {akind} somewhere'], MK),
     fr(['the flow is missing a step, so {add} {akind}', 'to show the decision {pol}{add} {akind}', 'before we connect anything, {add} {akind}',
         'I think we still need {akind}, {pol}{add} it'], MK),
     fr(['{akind}', '{kind}', '{add} {kind}', '{akind} please', 'one more {kind}', 'another {kind}', '{kind} pls', 'and {akind}'], MK))

case('diagram.node.make:generic', 'add a node named only by a generic word (node, shape, element, step)',
     fr(['{pol}{add} {agkind}{post}', '{pol}{add} a new {gkind}', '{pol}{add} one more {gkind}', 'I want another {gkind}'], MK),
     fr(['the process has one more stage, {add} {agkind} for it', 'we forgot something, {pol}{add} {agkind} at the end'], MK),
     fr(['{agkind}', 'new {gkind}', 'another {gkind}', '{add} {gkind}'], MK))

case('diagram.node.make:label', 'add a labelled node',
     fr(['{pol}{add} {akind} labelled {label}', '{pol}{add} {akind} called {label}', '{pol}{add} {akind} that says {qlabel}',
         '{pol}{add} {akind} with the text {qlabel}', '{pol}{add} {akind} named {label}', '{pol}{add} a {label} {kind}',
         '{pol}{add} {agkind} called {label}', '{pol}{add} {akind} with label {label}', '{pol}{add} a step {qlabel}'], MK),
     fr(['next in the process comes {label}, so {add} {akind} for it labelled {label2}', 'we need a step for approvals: {add} {akind} called {label}',
         'after login there is a check, {add} {akind} saying {qlabel}'], MK),
     fr(['{akind} {label}', '{kind} called {label}', '{label} {kind}', '{kind} labelled {label}', '{qlabel} box', 'new step {qlabel}'], MK))

case('diagram.node.make:count', 'add several nodes (node.n)',
     fr(['{pol}{add} {n} {kinds}{post}', '{pol}{add} {n} more {kinds}', '{pol}{add} {n} {kinds} to the diagram', 'I need {n} {kinds}',
         '{pol}{add} {n} new {gkinds}', '{pol}{add} {n} {gkinds}'], MK),
     fr(['there are several reviewers, so {add} {n} {kinds} for them', 'we have a few parallel tasks, {pol}{add} {n} {kinds} side by side'
         .replace('side by side', ''), 'to show the options {add} {n} {kinds}'], MK),
     fr(['{n} {kinds}', '{n} {kinds} please', '{add} {n} {kinds}', '{n} more {kinds}', '{n} {gkinds}'], MK))

case('diagram.node.make:colour', 'add a coloured node',
     fr(['{pol}{add} {colour_a} {kind}', '{pol}{add} {akind} in {colour}', '{pol}{add} {akind} coloured {colour}', '{pol}{add} {akind} and make it {colour}'
         .replace(' and make it {colour}', ' that is {colour}')], MK),
     fr(['errors should stand out, {add} {colour_a} {kind} for them', 'to match the brand {pol}{add} {colour_a} {kind}'], MK),
     fr(['{colour_a} {kind}', '{colour} {kind}', '{colour} {kind} pls', '{add} {colour} {kind}'], MK))

case('diagram.node.make:size', 'add a node of a size',
     fr(['{pol}{add} {size_a} {kind}', '{pol}{add} {akind}, {size}', '{pol}{add} {size_a} {gkind}', '{pol}{add} {akind} that is {size}'], MK),
     fr(['the main idea should dominate, {add} {size_a} {kind} for it', 'for a footnote {pol}{add} {size_a} {kind}'], MK),
     fr(['{size_a} {kind}', '{size} {kind}', '{add} {size} {kind}'], MK))

case('diagram.node.make:layout', 'add several nodes in a layout',
     fr(['{pol}{add} {n} {kinds} {layout}', '{pol}{add} {n} {kinds} arranged {layout}', '{pol}{add} {n} {gkinds} {layout}'], MK),
     fr(['the steps run in sequence, so {add} {n} {kinds} {layout}', 'for the team structure {add} {n} {kinds} {layout}'], MK),
     fr(['{n} {kinds} {layout}', '{add} {n} {kinds} {layout}'], MK))

case('diagram.node.make:position', 'add a node at coordinates, a page region or relative to another node',
     fr(['{pol}{add} {akind} at {xy}', '{pol}{add} {akind} in {region}', '{pol}{add} {akind} {rel} {anchor}', '{pol}{add} {akind} at position {xy}',
         '{pol}{add} {akind} in {region} of the page', '{pol}put {akind} {rel} {anchor}'.replace('put', '[t:put]')], MK),
     fr(['there is empty space on the right, {add} {akind} in {region}', 'right after the first step {add} {akind} {rel} {anchor}'], MK),
     fr(['{akind} at {xy}', '{kind} in {region}', '{kind} {rel} {anchor}', '{akind} {rel} {anchor}'], MK))

case('diagram.node.make:multi', 'add a node with several properties',
     fr(['{pol}{add} {size_a} {colour} {kind} labelled {label}', '{pol}{add} {colour_a} {kind} called {label}',
         '{pol}{add} {n} {colour} {kinds} {layout}', '{pol}{add} {size_a} {kind} named {label} in {region}', '{pol}{add} {colour_a} {kind} with the text {qlabel}'], MK),
     fr(['for the final state {add} {size_a} {colour} {kind} labelled {label}', 'to show the parallel jobs {add} {n} {colour} {kinds} {layout}'], MK),
     fr(['{colour} {kind} {label}', '{size} {colour} {kind}', '{n} {colour} {kinds}'], MK))

# ============================================================ node.change
case('diagram.node.change:colour', 'recolour one node (all reference forms)',
     fr(['{pol}{make} {nref} {colour}{post}', '{pol}{paint} {nref} {colour}', '{pol}{make} {nref} {colour} please', '{pol}change the colour of {nref} to {colour}'
         .replace('change', '[t:change]'), '{pol}{paint} {nref} in {colour}', '{pol}give {nref} a {colour} fill'.replace('give', '[t:give]'),
         '{pol}{make} the colour of {nref} {colour}', '{pol}set {nref} to {colour}'.replace('set', '[t:set]')], CH),
     fr(['{nref} is the error state, so {make} it {colour}'.replace('it', 'it'), 'to highlight the decision {make} {nref} {colour}',
         'I can barely see {nref}, {pol}{make} it {colour}'.replace('{nref}, ', '{nref}, '), '{intro}{make} {nref} {colour} {why}'], CH),
     fr(['{nref} {colour}', '{colour} {nref}', '{nref} in {colour}', '{make} {nref} {colour}', '{nref} -> {colour}'], CH))

case('diagram.node.change:colour-population', 'recolour a population (the circles, all elements, every box)',
     fr(['{pol}{make} {npop} {colour}{post}', '{pol}{paint} {npop} {colour}', '{pol}change the colour of {npop} to {colour}'.replace('change', '[t:change]'),
         '{pol}{make} {npop} {colour} please', '{pol}turn {npop} {colour}'.replace('turn', '[t:turn]')], CH),
     fr(['for consistency {make} {npop} {colour}', 'the boss likes {colour}, so {paint} {npop} that colour'.replace('{colour}, so', 'it, so'),
         '{intro}{make} {npop} {colour} {why}'], CH),
     fr(['{npop} {colour}', '{colour} for {npop}', '{make} {npop} {colour}'], CH), scene=PLURAL)

case('diagram.node.change:shape', 'change the shape of a node',
     fr(['{pol}{make} {nref} a {shape}', '{pol}turn {nref} into a {shape}'.replace('turn', '[t:turn]'), '{pol}change {nref} to a {shape}'.replace('change', '[t:change]'),
         '{pol}{make} {nref} {shape}-shaped', '{pol}change the shape of {nref} to {shape}'.replace('change', '[t:change]'), '{pol}use a {shape} for {nref}'.replace('use', '[t:use]')], CH),
     fr(['decisions are diamonds in our notation, so {make} {nref} a {shape}', '{nref} is a data store, {pol}turn it into a {shape}'.replace('turn', '[t:turn]')], CH),
     fr(['{nref} as {shape}', '{nref} -> {shape}', '{shape} for {nref}'], CH))

case('diagram.node.change:size', 'set the size of a node',
     fr(['{pol}{make} {nref} {size}', '{pol}{make} {nref} {size} please', '{pol}set the size of {nref} to {size}'.replace('set', '[t:set]'),
         '{pol}resize {nref} to {size}'.replace('resize', '[t:resize]')], CH),
     fr(['{nref} is the main step, {make} it {size}', 'it is only a note, so {make} {nref} {size}'], CH),
     fr(['{nref} {size}', '{size} {nref}', '{make} {nref} {size}'], CH))

case('diagram.node.change:size-relative', 'make a node or population bigger/smaller (comparative)',
     fr(['{pol}{make} {nany} {bigger}', '{pol}{make} {nany} {bigger} please', 
         '{pol}scale {nany} up'.replace('scale', '[t:scale]').replace(' up', ' [c:node.size|up||delta:more]')], CH),
     fr(['I can hardly read {nany}, {make} it {bigger}'.replace('{nany}, {make} it', '{nany}, {make} it'), '{nany} takes too much room, {make} it {bigger}'
         .replace('{nany} takes', '{nany} takes'), '{intro}{make} {nany} {bigger}'], CH),
     fr(['{nany} {bigger}', '{bigger} {nany}', '{make} {nany} {bigger}', '{bigger} please'.replace('{bigger}', '{bigger}')], CH))

case('diagram.node.change:label', 'rename a node',
     fr(['{pol}{rename} {nref} to {label}', '{pol}change the label of {nref} to {label}'.replace('change', '[t:change]'),
         '{pol}{rename} {nref} {qlabel}', '{pol}call {nref} {label}'.replace('call', '[t:call]'), '{pol}make {nref} say {qlabel}'.replace('make', '[t:make]'),
         '{pol}change the text of {nref} to {qlabel}'.replace('change', '[t:change]'), '{pol}set the label of {nref} to {label}'.replace('set', '[t:set]')], CH),
     fr(['that step is really about shipping, so {rename} {nref} to {label}', 'the client wants different wording: {rename} {nref} to {qlabel}',
         '{intro}{rename} {nref} to {label}, {why}'], CH),
     fr(['{nref} -> {label}', '{rename} {nref} {label}', '{nref} should say {qlabel}', 'label {nref} {label}'.replace('label', '[t:label]', 1)], CH))

case('diagram.node.change:value', 'set the value of a node (charts as shapes)',
     fr(['{pol}set the value of {nref} to [c:node.value|{num}]'.replace('set', '[t:set]'), '{pol}change {nref} to [c:node.value|{num}]'.replace('change', '[t:change]'),
         '{pol}give {nref} the value [c:node.value|{num}]'.replace('give', '[t:give]'), '{pol}update {nref} to [c:node.value|{num}]'.replace('update', '[t:update]')], CH),
     fr(['the numbers came in: {pol}set {nref} to [c:node.value|{num}]'.replace('set', '[t:set]')], CH),
     fr(['{nref} = [c:node.value|{num}]', '{nref} [c:node.value|{num}]', 'value of {nref} [c:node.value|{num}]'], CH))

case('diagram.node.change:selected', 'change the selected node (UI: Label field, Colour options, Size options)',
     fr(['{pol}{make} {nctx} {colour}', '{pol}{make} {nctx} {size}', '{pol}{rename} {nctx} to {label}', '{pol}{paint} {nctx} {colour}',
         '{pol}set the label field to {qlabel}'.replace('set', '[t:set]'), '{pol}pick {colour} in the colour options'.replace('pick', '[t:pick]'),
         '{pol}choose {size} in the size options'.replace('choose', '[t:choose]'), '{pol}type {qlabel} into the label box'.replace('type', '[t:type]')],
        op('diagram.node.change', fill='context')),
     fr(['now that it is selected, {make} it {colour}', 'with that one selected, {rename} it to {label}'], op('diagram.node.change', fill='context')),
     fr(['{colour}', '{size}', '{colour} please', '[t:label] {qlabel}', '{colour} one', 'size {size}'],
        op('diagram.node.change', fill='context')))

# ============================================================ node.select / remove
case('diagram.node.select:core', 'select one or several nodes (UI: Selection)',
     fr(['{pol}{select} {nref}', '{pol}{select} {nmany}', '{pol}{select} {npop}', '{pol}{select} {nref} please', '{pol}{select} {nmany} for me',
         '{pol}add {nref} to the selection'.replace('add', '[t:add]')], op('diagram.node.select')),
     fr(['I want to edit {nref} next, so {select} it', 'before grouping, {select} {nmany}'], op('diagram.node.select')),
     fr(['{nref}', '{select} {nref}', '{nmany}', '{select} {npop}', 'just {nref}'], op('diagram.node.select')))

case('diagram.node.select:with-links', 'select a node with its links',
     fr(['{pol}{select} {nref} with its [c:node.edges|arrows|-]', '{pol}{select} {nref} and all its [c:node.edges|connections|-]',
         '{pol}{select} {nref} together with its [c:node.edges|links|-]', '{pol}{select} {nref} including its [c:node.edges|edges|-]'], op('diagram.node.select')),
     fr(['I am going to move it, so {select} {nref} along with its [c:node.edges|lines|-]'], op('diagram.node.select')),
     fr(['{nref} plus [c:node.edges|arrows|-]', '{select} {nref} and [c:node.edges|links|-]'], op('diagram.node.select')))

case('diagram.node.remove:core', 'delete nodes (all reference forms, populations)',
     fr(['{pol}{delete} {nany}{post}', '{pol}{delete} {nref}', '{pol}{delete} {nmany}', '{pol}{delete} {npop}', '{pol}{delete} {nref} from the diagram',
         '{pol}{delete} {nref} please'], op('diagram.node.remove')),
     fr(['we dropped that step, so {delete} {nref}', '{nany} is not needed anymore, {delete} it'.replace('{nany}', '{nref}'), '{intro}{delete} {nany} {why}'],
        op('diagram.node.remove')),
     fr(['{delete} {nany}', 'no {nref}'.replace('no ', '[t:no] '), '{nref} away'.replace('away', '[t:away]'), 'bin {nref}'.replace('bin', '[t:bin]'), '{delete} {npop}'],
        op('diagram.node.remove')))

case('diagram.node.remove:selected', 'delete the selection (UI: Delete)',
     fr(['{pol}{delete} the selected [k:node|node]', '{pol}{delete} the selection', '{pol}{delete} {nctx}', '{pol}{delete} what I selected',
         '{pol}press delete'.replace('delete', '[t:delete]'), '{pol}{delete} the highlighted [k:shape|shape]'], op('diagram.node.remove', fill='context')),
     fr(['that was a mistake, {delete} {nctx}', 'I selected the wrong thing earlier, just {delete} the selection'], op('diagram.node.remove', fill='context')),
     fr(['{delete} it', '{delete} this', '{delete} that', '{delete} selected', '{delete}'], op('diagram.node.remove', fill='context')))

# ============================================================ node.place / resize / layout
case('diagram.node.place:position', 'move a node to coordinates',
     fr(['{pol}{move} {nref} to {xy}', '{pol}{move} {nref} to position {xy}', '{pol}{move} {nref} over to {xy}'], op('diagram.node.place')),
     fr(['{nref} overlaps the title, {move} it to {xy}'.replace('{nref} overlaps', '{nref} overlaps')], op('diagram.node.place')),
     fr(['{nref} to {xy}', '{nref} at {xy}', '{move} {nref} {xy}'], op('diagram.node.place')))

case('diagram.node.place:region', 'move a node to a page region',
     fr(['{pol}{move} {nref} to {region}', '{pol}{move} {nref} into {region}', '{pol}{move} {nref} over to {region}', '{pol}{move} {npop} to {region}'],
        op('diagram.node.place')),
     fr(['the legend belongs in a corner, {move} {nref} to {region}', '{intro}{move} {nref} to {region} {why}'], op('diagram.node.place')),
     fr(['{nref} to {region}', '{nref} {region}', '{move} {nref} {region}'], op('diagram.node.place')))

case('diagram.node.place:relation', 'move a node relative to another node',
     fr(['{pol}{move} {nref} {rel} {anchor}', '{pol}{move} {nref} so it is {rel} {anchor}', '{pol}{move} {nref} right {rel} {anchor}'.replace('right ', ''),
         '{pol}{move} {nref} just {rel} {anchor}'], op('diagram.node.place')),
     fr(['it should come after the review, so {move} {nref} {rel} {anchor}', '{intro}{move} {nref} {rel} {anchor} {why}'], op('diagram.node.place')),
     fr(['{nref} {rel} {anchor}', '{move} {nref} {rel} {anchor}'], op('diagram.node.place')))

case('diagram.node.resize:dimensions', 'set width/height of a node',
     fr(['{pol}{resize} {nref} to {wh}'.replace('{resize}', '[t:resize]'), '{pol}make {nref} {wh}'.replace('make', '[t:make]'),
         '{pol}make {nref} {width}'.replace('make', '[t:make]'), '{pol}make {nref} {height}'.replace('make', '[t:make]'),
         '{pol}set {nref} to {wh}'.replace('set', '[t:set]')], op('diagram.node.resize')),
     fr(['the label does not fit, make {nref} {width}'.replace('make', '[t:make]'), 'all boxes should match, so set {nref} to {wh}'.replace('set', '[t:set]')],
        op('diagram.node.resize')),
     fr(['{nref} {wh}', '{nref} {width}', 'resize {nref} {wh}'.replace('resize', '[t:resize]')], op('diagram.node.resize')))

case('diagram.node.layout:layout', 'arrange nodes or populations in a layout',
     fr(['{pol}{arrange} {npop} {layout}', '{pol}{arrange} {nmany} {layout}', '{pol}{arrange} the nodes {layout}'.replace('the nodes', '[d:the nodes]'),
         '{pol}{arrange} {npop} {layout} please'], op('diagram.node.layout')),
     fr(['it reads top-down, so {arrange} {npop} {layout}', '{intro}{arrange} {nmany} {layout} {why}'], op('diagram.node.layout')),
     fr(['{npop} {layout}', '{layout}', '{arrange} {layout}', '{nmany} {layout}'], op('diagram.node.layout')), scene=PLURAL)

# ============================================================ link.make
case('diagram.link.make:core', 'connect two nodes (link.from/link.to spans; label, code, kind endpoints)',
     fr(['{pol}{connect} {from} to {to}{post}', '{pol}{connect} {from} and {to}', '{pol}{connect} {from} with {to}', '{pol}draw {alnoun} from {from} to {to}'
         .replace('draw', '[t:draw]'), '{pol}add {alnoun} from {from} to {to}'.replace('add', '[t:add]'), '{pol}{connect} {from} to {to} with {alnoun}',
         '{pol}link {from} to {to}'.replace('link', '[t:link]', 1), '{pol}make {from} point to {to}'.replace('make', '[t:make]'),
         '{pol}put {alnoun} between {from} and {to}'.replace('put', '[t:put]'), '{pol}{connect} {from} → {to}', '{pol}run {alnoun} from {from} to {to}'
         .replace('run', '[t:run]')], LK),
     fr(['after review comes publishing, so {connect} {from} to {to}', 'the request goes from {from} to {to}, {pol}draw {alnoun} for that'.replace('draw', '[t:draw]'),
         '{intro}{connect} {from} to {to} {why}'], LK),
     fr(['{from} to {to}', '{from} -> {to}', '{connect} {from} {to}', '{alnoun} {from} to {to}', '{from} → {to}', '{from} then {to}'
         .replace('then', 'then'), 'conect {from} to {to}'.replace('conect', '[t:conect]')], LK), scene=S(min_nodes=3))

case('diagram.link.make:from-selection', 'connect the selected node to another (UI: Connect to)',
     fr(['{pol}{connect} it to {to}', '{pol}{connect} this to {to}', '{pol}{connect} the selected [k:node|node] to {to}'.replace('[k:node|node]', 'node'),
         '{pol}use connect to with {to}'.replace('use', '[t:use]'), '{pol}draw {alnoun} from here to {to}'.replace('draw', '[t:draw]'),
         '{pol}{connect} that one to {to}'], LK),
     fr(['now that it is selected, {connect} it to {to}', 'with this one picked, {pol}{connect} it to {to}'], LK),
     fr(['to {to}', '{connect} to {to}', 'then {to}', 'and on to {to}', 'arrow to {to}'.replace('arrow', '[t:arrow]')], LK), scene=S(min_nodes=3))

case('diagram.link.make:labelled', 'connect two nodes with a labelled/styled link',
     fr(['{pol}{connect} {from} to {to} and label it {llabel}', '{pol}{connect} {from} to {to} with {alnoun} labelled {llabel}',
         '{pol}draw a {style} {plainlnoun} from {from} to {to}'.replace('draw', '[t:draw]'), '{pol}{connect} {from} to {to} with a {lcolour} {plainlnoun}',
         '{pol}add a {arrowhead} {plainlnoun} between {from} and {to}'.replace('add', '[t:add]')], LK),
     fr(['if the check passes it goes on, so {connect} {from} to {to} with the label {llabel}'], LK),
     fr(['{from} to {to} labelled {llabel}', '{style} {plainlnoun} {from} to {to}'], LK), scene=S(min_nodes=3))

case('diagram.link.make:population', 'connect a population (all elements, the circles, them in order)',
     fr(['{pol}{connect} {lpopfrom}{post}', '{pol}{connect} {lpopfrom} in order', '{pol}{connect} {lpopfrom} to each other', '{pol}{connect} {lpopfrom} one after another',
         '{pol}link up {lpopfrom}'.replace('link up', '[t:link up]'), '{pol}chain {lpopfrom} together'.replace('chain', '[t:chain]'),
         '{pol}draw arrows between {lpopfrom}'.replace('draw', '[t:draw]'), '{pol}{connect} each node to the next one'.replace('each node', '[c:link.from|each node]')], LK),
     fr(['they are all steps of one process, so {connect} {lpopfrom} in order', 'everything should be linked, {pol}{connect} {lpopfrom}'], LK),
     fr(['{connect} {lpopfrom}', 'conect {lpopfrom}'.replace('conect', '[t:conect]'), '{connect} everything'.replace('everything', '[c:link.from|everything]'),
         'connect alle lements'.replace('connect', '[t:connect]').replace('alle lements', '[c:link.from|alle lements]'), '{connect} all'.replace('all', '[c:link.from|all]')], LK),
     scene=PLURAL)

case('diagram.link.make:to-all', 'connect one node to a population (Start to all the boxes)',
     fr(['{pol}{connect} {from} to {lpopto}', '{pol}draw arrows from {from} to {lpopto}'.replace('draw', '[t:draw]'), '{pol}{connect} {from} with {lpopto}',
         '{pol}{connect} {lpopfrom} to {to}'], LK),
     fr(['{from} feeds all of them, so {connect} it to {lpopto}'.replace('{from} feeds', 'that one feeds').replace('it to', '{from} to'), 'the hub talks to everyone: {connect} {from} to {lpopto}'], LK),
     fr(['{from} to {lpopto}', '{lpopfrom} to {to}'], LK), scene=PLURAL)

# ============================================================ link.select / change / remove
LS, LC, LR = op('diagram.link.select'), op('diagram.link.change'), op('diagram.link.remove')
case('diagram.link.select:core', 'select a link (code, endpoints, context, ordinal)',
     fr(['{pol}{select} {lref}', '{pol}{select} {lref} please', '{pol}{select} {lends}', '{pol}{select} {lcode}'], LS),
     fr(['I want to restyle it, so {select} {lref}'], LS),
     fr(['{lref}', '{select} {lcode}', '{select} {lref}'], LS), scene=LINKS)

case('diagram.link.change:label', 'label a link',
     fr(['{pol}label {lref} {llabel}'.replace('label', '[t:label]', 1), '{pol}put the label {llabel} on {lref}'.replace('put', '[t:put]'),
         '{pol}give {lref} the label {llabel}'.replace('give', '[t:give]'), '{pol}write {llabel} on {lref}'.replace('write', '[t:write]'),
         '{pol}change the label of {lref} to {llabel}'.replace('change', '[t:change]'), '{pol}{rename} {lref} to {llabel}'], LC),
     fr(['that path is taken when the check fails, so label {lref} {llabel}'.replace('label', '[t:label]', 1)], LC),
     fr(['{lref} {llabel}', 'label {lref} {llabel}'.replace('label', '[t:label]', 1), '{llabel} on {lref}'], LC), scene=LINKS)

case('diagram.link.change:colour', 'recolour a link (incl. populations)',
     fr(['{pol}{make} {lref} {lcolour}', '{pol}{paint} {lref} {lcolour}', '{pol}{make} {lpop} {lcolour}', '{pol}change the colour of {lref} to {lcolour}'
         .replace('change', '[t:change]')], LC),
     fr(['the error path should be visible, {make} {lref} {lcolour}'], LC),
     fr(['{lref} {lcolour}', '{lpop} {lcolour}', '{lcolour} {lref}'], LC), scene=LINKS)

case('diagram.link.change:style', 'dash/dot a link',
     fr(['{pol}{make} {lref} {style}', '{pol}{make} {lpop} {style}', '{pol}change {lref} to {style}'.replace('change', '[t:change]'),
         '{pol}draw {lref} as {style}'.replace('draw', '[t:draw]'), '{pol}use {style} for {lref}'.replace('use', '[t:use]')], LC),
     fr(['optional paths are dashed in our notation, so {make} {lref} {style}'], LC),
     fr(['{lref} {style}', '{style} {lref}', '{make} {lref} {style}'], LC), scene=LINKS)

case('diagram.link.change:arrow', 'arrowheads of a link',
     fr(['{pol}{make} {lref} {arrowhead}', '{pol}{make} {lpop} {arrowhead}', '{pol}change {lref} to {arrowhead}'.replace('change', '[t:change]')], LC),
     fr(['data flows both ways there, so {make} {lref} {arrowhead}'], LC),
     fr(['{lref} {arrowhead}', '{make} {lref} {arrowhead}'], LC), scene=LINKS)

case('diagram.link.change:width', 'line width of a link (number or comparative)',
     fr(['{pol}{make} {lref} {thicker}', '{pol}{make} {lpop} {thicker}', '{pol}set the width of {lref} to {lwidth}'.replace('set', '[t:set]'),
         '{pol}{make} {lref} {lwidth} wide', '{pol}{make} {lref} {lwidth}'], LC),
     fr(['the main path should stand out, {make} {lref} {thicker}'], LC),
     fr(['{lref} {thicker}', '{thicker} {lref}', '{lpop} {thicker}', '{lref} {lwidth}'], LC), scene=LINKS)

case('diagram.link.change:reconnect', 'reconnect a link to another node',
     fr(['{pol}point {lfromonly} at {to} instead'.replace('point', '[t:point]'), '{pol}reconnect {lref} to {to}'.replace('reconnect', '[t:reconnect]'),
         '{pol}{move} the end of {lref} to {to}', '{pol}make {lref} go to {to}'.replace('make', '[t:make]')], LC),
     fr(['the flow changed, so {pol}reconnect {lref} to {to}'.replace('reconnect', '[t:reconnect]')], LC),
     fr(['{lref} to {to} instead', 'reconnect {lref} to {to}'.replace('reconnect', '[t:reconnect]')], LC), scene=LINKS)

case('diagram.link.remove:core', 'delete links (code "line e1", endpoints, populations)',
     fr(['{pol}{delete} {lref}', '{pol}{delete} {lcode}', '{pol}{delete} {lends}', '{pol}{delete} {lpop}', '{pol}{delete} {lref} please',
         '{pol}disconnect {lendsplain}'.replace('disconnect', '[t:disconnect]')], LR),
     fr(['that connection is wrong, {delete} {lref}', '{intro}{delete} {lref} {why}'], LR),
     fr(['{delete} {lcode}', '{delete} {lref}', 'no {lref}'.replace('no', '[t:no]', 1), '{lcode} away'.replace('away', '[t:away]')], LR), scene=LINKS)

# ============================================================ selection.remove / clear / ids / undo
case('diagram.selection.remove:core', 'delete nodes and links together',
     fr(['{pol}{delete} [c:sketch.nodes|{nn}] and [c:sketch.links|{lc}]', '{pol}{delete} [c:sketch.nodes|{nn}] together with [c:sketch.links|{lc}]'],
        op('diagram.selection.remove')),
     fr(['both are obsolete, {delete} [c:sketch.nodes|{nn}] and [c:sketch.links|{lc}]'], op('diagram.selection.remove')),
     fr(['{delete} [c:sketch.nodes|{nn}] and [c:sketch.links|{lc}]', '[c:sketch.nodes|{nn}] and [c:sketch.links|{lc}] away'.replace('away', '[t:away]')],
        op('diagram.selection.remove')), scene=LINKS)

case('diagram.page.clear:core', 'clear the whole diagram (UI: Clear diagram)',
     fr(['{pol}{clear} the diagram', '{pol}{clear} the canvas', '{pol}{clear} everything', '{pol}{delete} everything', '{pol}{clear} the whole diagram',
         '{pol}start over'.replace('start over', '[t:start over]'), '{pol}press clear diagram'.replace('press', '[t:press]'), '{pol}{delete} all of it',
         '{pol}wipe the board'.replace('wipe', '[t:wipe]'), '{pol}remove all nodes and arrows'.replace('remove', '[t:remove]')], op('diagram.page.clear')),
     fr(['this is a mess, {clear} the diagram and we start again', 'the client changed everything, so {pol}{clear} the canvas'], op('diagram.page.clear')),
     fr(['{clear}', '{clear} all', 'start over'.replace('start over', '[t:start over]'), 'fresh start'.replace('fresh start', '[t:fresh start]'),
         'clean slate'.replace('clean slate', '[t:clean slate]'), 'clear diagram'.replace('clear', '[t:clear]'), 'nuke it'.replace('nuke', '[t:nuke]')],
        op('diagram.page.clear')))

case('diagram.ids.show:modes', 'show/hide the visible codes (n1, e1)',
     fr(['{pol}{show} the IDs [c:page.mode|briefly|temporary]', '{pol}[t:keep] the IDs [c:page.mode|on|always]', '{pol}{hide} the IDs'
         .replace('{hide} the IDs', '[t:hide] the IDs [c:page.mode|off|off]').replace('[c:page.mode|off|off]', ''),
         '{pol}{show} the node codes [c:page.mode|for a moment|temporary]', '{pol}[t:turn] the IDs [c:page.mode|off|off]', '{pol}{show} the IDs {secs}',
         '{pol}[t:always show] the codes'.replace('[t:always show]', '[t:show] the codes [c:page.mode|always|always]').replace(' the codes the codes', ' the codes'),
         '{pol}[t:show] me the numbers on the shapes [c:page.mode|for a second|temporary]', '{pol}[t:switch] [c:page.mode|off|off] the IDs'],
        op('diagram.ids.show')),
     fr(['I need to refer to them by number, so [t:show] the IDs [c:page.mode|permanently|always]', 'which one is n3? [t:flash] the IDs [c:page.mode|quickly|temporary]'
         .replace('which one is n3? ', 'which one is which? ')], op('diagram.ids.show')),
     fr(['IDs [c:page.mode|on|always]', 'IDs [c:page.mode|off|off]', '[t:show] IDs', '[t:show] codes', 'codes [c:page.mode|off|off]', '[t:show] ids {secs}',
         '[t:show] the numbers', '[t:show] me the codes', '[t:hide] the codes', '[t:hide] IDs', '[t:identify] the shapes', '[t:show] the node numbers',
         '[t:which] one is which', '[t:label] everything with its code', 'IDs [c:page.mode|please|temporary]'.replace('[c:page.mode|please|temporary]', 'please')],
        op('diagram.ids.show')))

case('diagram.undo:core', 'undo', fr(['{pol}{undo}', '{pol}{undo} that', '{pol}{undo} the last change', '{pol}{undo} the last step', '{pol}{undo} what I just did'],
                                     op('diagram.undo')),
     fr(['oops, that was wrong, {undo} it', 'no wait, {pol}{undo} that'], op('diagram.undo')),
     fr(['{undo}', '{undo} pls', '[t:oops]', '[t:back]', '[t:scratch that]', '[t:never mind], {undo}'.replace('[t:never mind], ', 'never mind, '), 'ctrl z'.replace('ctrl z', '[t:ctrl z]')],
        op('diagram.undo')))

case('diagram.redo:core', 'redo', fr(['{pol}{redo}', '{pol}{redo} that', '{pol}{redo} the last change', '{pol}{redo} what I undid'], op('diagram.redo')),
     fr(['actually it was fine, {redo} it', 'I undid too much, {pol}{redo} that'], op('diagram.redo')),
     fr(['{redo}', '{redo} pls', '[t:redo] it', '[t:put it back]'], op('diagram.redo')))

# ============================================================ groups
G = lambda name, **kw: op('diagram.group.' + name, **kw)
case('diagram.group.make:core', 'group nodes (optionally named/captioned)',
     fr(['{pol}{group} {members}', '{pol}{group} {members} together', '{pol}{group} {members} as {gname}', '{pol}{group} {members} and call it {gname}',
         '{pol}{group} {members} with the caption {glabel}', '{pol}make a group of {members}'.replace('make', '[t:make]'),
         '{pol}put {members} in a group'.replace('put', '[t:put]')], G('make')),
     fr(['these always move together, so {group} {members}', 'they belong to the same team: {group} {members} as {gname}'], G('make')),
     fr(['{group} {members}', '{members} as a group', '{group} {members} {gname}', '{group} {gsel}', '{group} {gsel} as {gname}'], G('make')), scene=S(min_nodes=4))

case('diagram.group.make:selection', 'group the selection or a population',
     fr(['{pol}{group} {gsel}', '{pol}{group} {gsel} together', '{pol}{group} {gsel} as {gname}', '{pol}put {gsel} in a group'.replace('put', '[t:put]'),
         '{pol}make a group out of {gsel}'.replace('make', '[t:make]'), '{pol}{group} {gsel} and label it {glabel}'], G('make')),
     fr(['they belong together, so {group} {gsel}', 'to move them as one, {pol}{group} {gsel}'], G('make')),
     fr(['{group} {gsel}', '{group} these', '{gsel} as a group', '{group} em'.replace('em', '[c:group.ids|em]')], G('make')), scene=PLURAL)

case('diagram.group.change:props', 'recolour/resize/re-caption a group',
     fr(['{pol}{make} {gref} {gcolour}', '{pol}{make} {gref} {gsize}', '{pol}change the caption of {gref} to {glabel}'.replace('change', '[t:change]'),
         '{pol}{paint} {gref} {gcolour}', '{pol}{rename} {gref} to {glabel}'], G('change')),
     fr(['to separate it from the rest, {make} {gref} {gcolour}'], G('change')),
     fr(['{gref} {gcolour}', '{gref} {gsize}', '{gref} -> {glabel}'], G('change')), scene=GROUP)

for name, what, eq, cx, sm, attrs in [
        ('select', 'select a group', ['{pol}{select} {gref}', '{pol}{select} {gref} please', '{pol}{select} the whole {gref}'.replace('the whole {gref}', '{gref}')],
         ['I want to move it, so {select} {gref} first'], ['{select} {gref}', '{gref}'], G('select')),
        ('layout', 'lay out a group', ['{pol}{arrange} {gref} {glayout}', '{pol}{arrange} the members of {gref} {glayout}'], ['it reads better, so {arrange} {gref} {glayout}'],
         ['{gref} {glayout}', '{arrange} {gref} {glayout}'], G('layout')),
        ('resize', 'scale a group', ['{pol}scale {gref} to {scale}'.replace('scale', '[t:scale]', 1), '{pol}make {gref} {scale}'.replace('make', '[t:make]', 1)],
         ['it is too small to read, [t:scale] {gref} to {scale}'], ['[t:scale] {gref} {scale}', '{gref} {scale}'], G('resize')),
        ('place', 'move a group', ['{pol}{move} {gref} to {gxy}', '{pol}{move} {gref} over to {gxy}'], ['the group is in the way, {move} {gref} to {gxy}'],
         ['{gref} to {gxy}', '{move} {gref} {gxy}'], G('place')),
        ('remove', 'delete a group', ['{pol}{delete} {gref}', '{pol}{delete} {gref} and everything in it'], ['we do not need that part, {delete} {gref}'],
         ['{delete} {gref}', 'no more {gref}'.replace('no more', '[t:no more]')], G('remove')),
        ('ungroup', 'ungroup', ['{pol}{ungroup} {gref}', '{pol}{ungroup} {gref} but keep the nodes'], ['we do not need that grouping anymore, {ungroup} {gref}'],
         ['{ungroup} {gref}', '{ungroup} it'.replace('it', 'it')], G('ungroup'))]:
    case(f'diagram.group.{name}:core', what, fr(eq, attrs), fr(cx, attrs), fr(sm, attrs), scene=GROUP, n=22)

case('diagram.group.chart.adopt:core', 'turn a chart into editable shapes',
     fr(['{pol}turn {gid} into editable shapes'.replace('turn', '[t:turn]'), '{pol}convert {gid} to shapes'.replace('convert', '[t:convert]'),
         '{pol}break {gid} into shapes I can edit'.replace('break', '[t:break]')], G('chart.adopt')),
     fr(['I want to tweak the bars by hand, so [t:convert] {gid} to shapes'], G('chart.adopt')),
     fr(['[t:explode] {gid}', '{gid} as shapes'], G('chart.adopt')), scene=EMPTY, n=22)

# ============================================================ charts
case('diagram.group.chart.make:core', 'make a chart from typed values',
     fr(['{pol}make a [c:group.layout|bar|bar] chart of {chartdata}'.replace('make', '[t:make]'), '{pol}make a [c:group.layout|pie|pie] chart with {chartdata}'
         .replace('make', '[t:make]'), '{pol}make a [c:group.layout|bar|bar] chart titled {charttitle} with {chartdata}'.replace('make', '[t:make]'),
         '{pol}{add} a [c:group.layout|line|line] chart showing {chartdata}'], G('chart.make')),
     fr(['for the report I need a [c:group.layout|bar|bar] chart, {chartdata}'.replace('I need', 'I [t:need]')], G('chart.make')),
     fr(['[c:group.layout|bar|bar] chart {chartdata}', '[c:group.layout|pie|pie] chart: {chartdata}'], G('chart.make')), scene=EMPTY)

case('diagram.group.chart:from-group', 'make a chart of an existing group/chart',
     fr(['{pol}make a {charttype} chart from {chartsrc}'.replace('make', '[t:make]'), '{pol}turn {chartsrc} into a {charttype} chart'.replace('turn', '[t:turn]'),
         '{pol}show {chartsrc} as a {charttype} chart'.replace('show', '[t:show]')], op('diagram.group.chart', nosel=True)),
     fr(['the numbers are clearer as a picture, {pol}make a {charttype} chart from {chartsrc}'.replace('make', '[t:make]')], op('diagram.group.chart', nosel=True)),
     fr(['{charttype} chart of {chartsrc}', '{chartsrc} as {charttype}'], op('diagram.group.chart', nosel=True)), scene=EMPTY)

# ============================================================ questions about the diagram
ON, OL, CN, CL, OS = op('diagram.observe.node'), op('diagram.observe.link'), op('diagram.check.node'), op('diagram.check.link'), op('diagram.observe')
case('diagram.observe:describe', 'describe the whole diagram',
     fr(["what's in the diagram?", 'what is on the canvas right now?', 'describe the diagram', 'can you describe this diagram for me?', 'tell me what the diagram shows',
         'summarise the diagram', 'give me an overview of the diagram', 'what does this flowchart say?', 'walk me through the diagram', 'explain the diagram'],
        op('diagram.observe', q='describe')),
     fr(['I just joined the meeting, what does the diagram show?', 'before I present it, describe what is on the canvas', 'my screen reader cannot see it, tell me what is in the diagram'],
        op('diagram.observe', q='describe')),
     fr(['what is there?', 'describe it', 'summary?', "what's here", 'overview', 'what do we have', 'what did I draw', 'read it to me', 'what is on screen',
         'describe the canvas', 'what have we got so far', 'status of the diagram', 'tell me about the diagram'], op('diagram.observe', q='describe')))
for cid, what, eq, cx, sm, attrs in [
    ('count-kind', 'count nodes of a kind / all nodes',
     ['how many {kinds} are there?'.replace('{kinds}', '{kinds}'), 'how many {gkinds} does the diagram have?', 'count the {kinds}', 'how many {kinds} do we have?',
      'what is the number of {kinds}?', 'how many {kinds} are in the diagram?'],
     ['the slide fits six boxes, so how many {gkinds} are in this flow?', 'just checking, how many {kinds} did I add?'],
     ['how many {kinds}?', 'number of {gkinds}?', 'count {kinds}', '{kinds} count?'], op('diagram.observe.node', q='count', fill='all')),
    ('count-links', 'count links',
     ['how many {lnouns} are there?', 'how many {lnouns} does the diagram have?', 'count the {lnouns}', 'how many {lnouns} leave {sfrom}?'],
     ['to check nothing is missing, how many {lnouns} are in the diagram?'], ['how many {lnouns}?', '{lnouns} count?'], op('diagram.observe.link', q='count', fill='all')),
    ('exists-kind', 'is there a node of a kind',
     ['is there {akind} in the diagram?', 'do we have any {kinds}?', 'is there {akind}?', 'are there any {kinds} on the canvas?', 'does the diagram have {akind}?'],
     ['I might have deleted it by mistake, is there still {akind}?'], ['any {kinds}?', '{akind}?', 'got any {kinds}?'], op('diagram.check.node', q='exists', fill='all')),
    ('list-kind', 'list nodes of a kind / all nodes',
     ['which {kinds} are there?', 'list all the {kinds}', 'what {gkinds} are in the diagram?', 'show me the list of {kinds}', 'name all the {gkinds}'],
     ['I lost track, list all the {gkinds} please'], ['list {kinds}', 'which {gkinds}?', 'all {kinds}?'], op('diagram.observe.node', q='list', fill='all')),
    ('colour-of', 'what colour is a node',
     ['what colour is {nref}?', 'which colour does {nref} have?', 'what is the colour of {nref}?', 'what color is {nref}?'],
     ['I am colour blind, what colour is {nref}?'], ['colour of {nref}?', '{nref} colour?'], op('diagram.observe.node', q='what', asked_key='node.colour')),
    ('label-of', 'what does a node say',
     ['what does {ncode} say?', 'what is the label of {ncode}?', 'what is written in {nref}?', 'what text is on {ncode}?'],
     ['I cannot read it from here, what does {ncode} say?'], ['label of {ncode}?', '{ncode} says what?'], op('diagram.observe.node', q='what', asked_key='node.label')),
    ('size-of', 'how big is a node', ['how big is {nref}?', 'what size is {nref}?', 'how large is {nref}?'], ['compared to the rest, how big is {nref}?'],
     ['size of {nref}?', '{nref} size?'], op('diagram.observe.node', q='what', asked_key='node.size')),
    ('where', 'where is a node', ['where is {nref}?', 'where did {nref} go?', 'where is {nref} on the canvas?', 'can you tell me where {nref} is?'],
     ['I cannot find it, where is {nref}?'], ['where is {nref}', '{nref} where?'], op('diagram.observe.node', q='where')),
    ('neighbours', 'what is a node connected to',
     ['what is {nref} connected to?', 'what does {nref} connect to?', 'which nodes are linked to {nref}?', 'what comes after {nref}?', 'what points to {nref}?'],
     ['to understand the flow, what is {nref} connected to?'], ['{nref} connects to?', 'after {nref}?'], op('diagram.observe.node', q='which', asked_key='node.edges')),
    ('link-ends', 'what does a link connect', ['what does {lcode} connect?', 'which nodes does {lcode} join?', 'where does {lcode} go?', 'what is {lcode} between?'],
     ['I see an arrow labelled e-something, what does {lcode} connect?'.replace('e-something', 'with a code')], ['{lcode} connects what?', 'ends of {lcode}?'],
     op('diagram.observe.link', q='what', asked_key='link.nodes')),
    ('is-connected', 'are two nodes connected',
     ['is {sfrom} connected to {sto}?', 'is there an arrow from {sfrom} to {sto}?', 'does {sfrom} link to {sto}?', 'are {sfrom} and {sto} connected?'],
     ['before I add it again, is {sfrom} already connected to {sto}?'], ['{sfrom} to {sto}?', '{sfrom} linked to {sto}?'],
     op('diagram.check.link', q='exists', fill='description')),
    ('is-colour', 'does a node have a colour', ['is {nref} {colour_sel}?', 'is {nref} coloured {colour_sel}?', 'is {nref} still {colour_sel}?'],
     ['did the change work, is {nref} {colour_sel} now?'], ['{nref} {colour_sel}?'], op('diagram.check.node', q='exists')),
]:
    case(f'diagram.observe:{cid}', what, fr(eq, attrs), fr(cx, attrs), fr(sm, attrs), scene=S(need_links=True, need_plural_kind=True), n=24)

# ============================================================ styles, themes, colour-by (specs/diagram-capabilities.md)
case('diagram.style.apply:theme', 'apply a theme to the whole diagram (vague colour-style requests with a theme word)',
     fr(['{pol}make it {theme}{post}', '{pol}use the {theme} theme', '{pol}switch to a {theme} style', '{pol}apply the {theme} theme to the diagram',
         '{pol}give the diagram a {theme} look', '{pol}style the diagram {theme}', '{pol}change the theme to {theme}', '{pol}go {theme}', '{pol}make the whole diagram {theme}',
         '{pol}restyle everything in {theme}', '{pol}I want the {theme} colour scheme']
        , op('diagram.style.apply')),
     fr(['it will be printed in the handout, so make it {theme}', 'the presentation has a dark background, {pol}use the {theme} theme', '{intro}switch the diagram to {theme} {why}'],
        op('diagram.style.apply')),
     fr(['{theme}', '{theme} theme', '{theme} style please', '{theme} look', 'go {theme}', 'theme {theme}'], op('diagram.style.apply')))
for c in ['diagram.style.apply:theme']:
    for t in ('equivalent', 'complex', 'simplified'):
        for f in CASES[c][t]:
            f.template = f.template.replace('{pol}make it', '{pol}[t:make] it').replace('{pol}use', '{pol}[t:use]').replace('{pol}switch', '{pol}[t:switch]') \
                .replace('{pol}apply', '{pol}[t:apply]').replace('{pol}give', '{pol}[t:give]').replace('{pol}style', '{pol}[t:style]').replace('{pol}change', '{pol}[t:change]') \
                .replace('{pol}go', '{pol}[t:go]').replace('{pol}make the', '{pol}[t:make] the').replace('{pol}restyle', '{pol}[t:restyle]').replace("{pol}I want", '{pol}I [t:want]') \
                .replace('so make it', 'so [t:make] it').replace('{intro}switch', '{intro}[t:switch]').replace("['go {theme}'", "['[t:go] {theme}'")

case('diagram.style.nodes:highlight', 'a theme or highlight on some nodes (a role, a shape, named nodes)',
     fr(['{pol}[t:highlight] {nany}', '{pol}[t:highlight] {npop}', '{pol}[t:make] {npop} {theme}', '{pol}[t:colour] {nany} like the {theme} theme',
         '{pol}[t:apply] the {theme} style to {nany}', '{pol}[t:use] the {theme} theme on {npop}'], op('diagram.style.nodes')),
     fr(['people keep missing it, so [t:highlight] {nany}', 'for the review meeting [t:highlight] {npop}'], op('diagram.style.nodes')),
     fr(['[t:highlight] {nany}', '{npop} {theme}', '[t:highlight] {npop}'], op('diagram.style.nodes')), scene=PLURAL)
for c in ['diagram.style.nodes:highlight']:
    for t in ('equivalent', 'complex', 'simplified'):
        for f in CASES[c][t]:
            if '[t:highlight]' in f.template:
                f.template = f.template.replace('[t:highlight]', '[c:diagram.theme|highlight|highlight]')

case('diagram.colour.by:by', 'colour nodes by level, shape, role or group',
     fr(['{pol}[t:colour] the nodes by {by}', '{pol}[t:colour] each {by} differently', '{pol}[t:give] every {by} its own colour', '{pol}[t:colour] by {by}',
         '{pol}[t:use] a different colour for each {by}', '{pol}[t:colour-code] the nodes by {by}', '{pol}[t:paint] everything by {by} in {theme} colours'],
        op('diagram.colour.by')),
     fr(['to see the hierarchy at a glance, [t:colour] each {by} differently', 'so people can tell them apart, [t:colour] the nodes by {by}'], op('diagram.colour.by')),
     fr(['[t:colour] by {by}', '{by} colours', 'different colour per {by}', '[t:color] by {by}'], op('diagram.colour.by')))

case('diagram.node.change:outline-text', 'outline colour, text colour, font size and weight of nodes',
     fr(['{pol}[t:give] {nany} a {outline} border', '{pol}[t:make] the outline of {nany} {outline}', '{pol}[t:outline] {nany} in {outline}',
         '{pol}[t:make] the text of {nany} {textcolour}', '{pol}[t:use] {textcolour} text on {nany}', '{pol}[t:make] the labels of {nany} {fontbigger}',
         '{pol}[t:set] the font size of {nany} to {fontsize}', '{pol}[t:make] the label of {nany} {bold}', '{pol}[t:make] {nany} {bold}',
         '{pol}[t:put] the text of {nany} {bold}'], CH),
     fr(['the labels are unreadable on the projector, [t:make] the text of {nany} {fontbigger}', 'on a dark fill you need {textcolour} text, so [t:change] {nany} to that'
         .replace('{textcolour} text, so [t:change] {nany} to that', 'light text, so [t:make] the text of {nany} {textcolour}')], CH),
     fr(['{outline} border on {nany}', '{textcolour} text on {nany}', 'font {fontsize} for {nany}', '{bold} label on {nany}', 'labels {fontbigger}'
         .replace('labels {fontbigger}', '[d:labels] {fontbigger}')], CH), scene=PLURAL)

case('diagram.node.change:role-shape', 'mark a node with a flowchart role or a new shape',
     fr(['{pol}[t:mark] {nref} as the {role}', '{pol}[t:make] {nref} a {role} node', '{pol}[t:turn] {nref} into a {newshape}', '{pol}[t:make] {nref} a {newshape}',
         '{pol}[t:change] {nref} to a {newshape}', '{pol}[t:show] {nref} as a {newshape}'], CH),
     fr(['it stores the orders, so [t:make] {nref} a {newshape}', 'in flowchart terms it is the {role}, [t:mark] {nref} that way'.replace('{role}, [t:mark] {nref} that way', 'end, [t:mark] {nref} as the {role}')],
        CH),
     fr(['{nref} {newshape}', '{nref} is the {role}', '{nref} as {role}'], CH))

case('diagram.node.make:role', 'add a node by its flowchart role or a new shape',
     fr(['{pol}{add} a {role} node', '{pol}{add} a {role} node called {label}', '{pol}{add} a {newshape} called {label}', '{pol}{add} a {newshape}',
         '{pol}{add} a {role} step', '{pol}{add} a {newshape} labelled {label}'], MK),
     fr(['every flow needs an entry, so {add} a {role} node', 'the data lives somewhere, {pol}{add} a {newshape} called {label}'], MK),
     fr(['{role} node', '{newshape} {label}', '{add} {role}', 'a {newshape}'], MK))

# ============================================================ whole-diagram layout
case('diagram.layout:layout', 'lay out the whole diagram (layout, direction, spacing, routes)',
     fr(['{pol}[t:lay out] the diagram {dlayout}', '{pol}[t:arrange] everything {dlayout}', '{pol}[t:make] it flow {direction}', '{pol}[t:lay] it out {direction}',
         '{pol}[t:make] the layout {spacing}', '{pol}[t:use] {route} lines', '{pol}[t:make] the connectors {route}', '{pol}[t:switch] to a {dlayout} layout'
         .replace('{dlayout} layout', '{dlayout}'), '{pol}[t:arrange] the whole diagram {dlayout} {direction}', '{pol}[t:put] more space between the nodes'
         .replace('more space', '[c:diagram.spacing|more space|loose]'), '{pol}[t:make] it more compact'.replace('more compact', '[c:diagram.spacing|more compact|compact]'),
         '{pol}[t:stop] the automatic layout'.replace('the automatic layout', '[c:diagram.layout|the automatic layout|free|neg]')],
        op('diagram.layout')),
     fr(['it is a hierarchy, so [t:lay out] the diagram {dlayout}', 'the slide is wide, [t:make] it flow {direction}', 'everything is cramped, [t:make] the layout {spacing}'],
        op('diagram.layout')),
     fr(['{dlayout}', '{direction}', '{spacing} please', '{route} lines', '{dlayout} layout', '[t:layout] {dlayout}'], op('diagram.layout')))

case('diagram.nodes.align:edge', 'align nodes',
     fr(['{pol}[t:align] {nsome} {edge}', '{pol}[t:align] {nsome} to the {edge}'.replace('to the {edge}', '{edge}'), '{pol}[t:line up] {nsome} {edge}',
         '{pol}[t:centre] {nsome}'.replace('[t:centre] {nsome}', '[t:align] {nsome} [c:node.edge|centred|centre]')], op('diagram.nodes.align')),
     fr(['they look ragged, [t:align] {nsome} {edge}'], op('diagram.nodes.align')),
     fr(['[t:align] {edge}', '[t:align] {nsome} {edge}', '{nsome} {edge} aligned'.replace(' aligned', '')], op('diagram.nodes.align')), scene=PLURAL)

case('diagram.nodes.distribute:axis', 'space nodes evenly',
     fr(['{pol}[t:space] {nsome} evenly', '{pol}[t:distribute] {nsome} {axis}', '{pol}[t:spread] {nsome} out evenly {axis}', '{pol}[t:space] {nsome} out {axis}'],
        op('diagram.nodes.distribute')),
     fr(['the gaps are uneven, [t:distribute] {nsome} {axis}'], op('diagram.nodes.distribute')),
     fr(['[t:distribute] {axis}', '[t:space] evenly', '[t:even out] the gaps'], op('diagram.nodes.distribute')), scene=PLURAL)

case('diagram.steps.number:mode', 'number the steps / hide the numbers',
     fr(['{pol}[t:number] the steps', '{pol}[t:show] step numbers'.replace('step numbers', '[c:diagram.steps|step numbers|on]'), '{pol}[t:hide] the step numbers'
         .replace('the step numbers', 'the step numbers [c:diagram.steps|_|off]').replace(' [c:diagram.steps|_|off]', ''), '{pol}[t:add] numbers to the steps',
         '{pol}[t:turn] [c:diagram.steps|off|off] the step numbers', '{pol}[t:turn] [c:diagram.steps|on|on] numbering'], op('diagram.steps.number')),
     fr(['so I can refer to them in the call, [t:number] the steps'], op('diagram.steps.number')),
     fr(['[t:number] steps', 'numbers [c:diagram.steps|off|off]', 'step numbers [c:diagram.steps|on|on]', '[t:number] them', '[t:number] the nodes in order',
         '[t:add] step numbers', '[t:remove] the numbers', '[t:put] numbers on the steps', '[t:enumerate] the steps', '[t:number] each step', '[t:hide] numbering',
         '[t:show] the step order', '[t:numbering] [c:diagram.steps|on|on]', 'no more [t:numbers]'], op('diagram.steps.number')))

# ============================================================ new node/link operations
case('diagram.node.duplicate:core', 'duplicate nodes',
     fr(['{pol}[t:duplicate] {nany}', '{pol}[t:copy] {nany}', '{pol}[t:make] a copy of {nany}', '{pol}[t:clone] {nany}', '{pol}[t:duplicate] {nsome}'],
        op('diagram.node.duplicate')),
     fr(['I need another one just like it, [t:duplicate] {nany}'], op('diagram.node.duplicate')),
     fr(['[t:duplicate] {nany}', '[t:copy] {nany}', '[t:copy] that'.replace('that', 'that')], op('diagram.node.duplicate')), scene=PLURAL)

case('diagram.node.insert:link', 'insert a node into a link',
     fr(['{pol}[t:insert] a step {label} between [c:node.anchor|{nn}|{nn}|relation,sel] and [c:node.anchor|{nn2}|{nn2}|relation,sel]'
         .replace('between', '[c:node.position|between|between|relation]'), '{pol}[t:put] {akind} in the middle of [c:node.anchor|{lc}|{lc}|relation,sel]'
         .replace('in the middle of', '[c:node.position|in the middle of|in|relation]'), '{pol}[t:add] {akind} called {label} [c:node.position|on|on|relation] [c:node.anchor|{lc}|{lc}|relation,sel]'],
        MK),
     fr(['we forgot validation, so [t:insert] a step {label} [c:node.position|between|between|relation] [c:node.anchor|{nn}|{nn}|relation,sel] and [c:node.anchor|{nn2}|{nn2}|relation,sel]'], MK),
     fr(['{akind} [c:node.position|between|between|relation] [c:node.anchor|{nn}|{nn}|relation,sel] and [c:node.anchor|{nn2}|{nn2}|relation,sel]'], MK), scene=LINKS)

case('diagram.node.merge:core', 'merge nodes',
     fr(['{pol}[t:merge] {nsome}', '{pol}[t:merge] {nsome} into one', '{pol}[t:combine] {nsome} into one node called {label}', '{pol}[t:merge] {nmany} and call it {label}'],
        op('diagram.node.merge')),
     fr(['they are really the same service, [t:merge] {nmany}'], op('diagram.node.merge')),
     fr(['[t:merge] {nmany}', '[t:merge] these', '{nmany} into one'.replace('into one', '[t:into one]')], op('diagram.node.merge')), scene=PLURAL)

case('diagram.node.split:core', 'split a node in two',
     fr(['{pol}[t:split] {nref} into two steps', '{pol}[t:split] {nref} and call the second part {label}', '{pol}[t:break] {nref} into two', '{pol}[t:split] {nref} in half'],
        op('diagram.node.split')),
     fr(['that step does two things, [t:split] {nref} into two'], op('diagram.node.split')),
     fr(['[t:split] {nref}', '[t:split] it'], op('diagram.node.split')))

case('diagram.link.reverse:core', 'reverse a link',
     fr(['{pol}[t:reverse] {lref}', '{pol}[t:flip] the direction of {lref}', '{pol}[t:turn] {lref} around', '{pol}[t:switch] the direction of {lref}',
         '{pol}[t:point] {lref} the other way', '{pol}[t:reverse] {lpop}'], op('diagram.link.reverse')),
     fr(['it goes the wrong way, [t:reverse] {lref}'], op('diagram.link.reverse')),
     fr(['[t:reverse] {lref}', '[t:flip] {lref}', '[t:reverse] it'], op('diagram.link.reverse')), scene=LINKS)

case('diagram.link.change:route', 'route of links (curved, straight, orthogonal)',
     fr(['{pol}[t:curve] {lref}'.replace('[t:curve] {lref}', '[t:make] {lref} {lroute}'), '{pol}[t:make] {lpop} {lroute}', '{pol}[t:use] {lroute} lines for {lpop}',
         '{pol}[t:draw] {lref} {lroute}'], LC),
     fr(['it overlaps a box, [t:make] {lref} {lroute}'], LC),
     fr(['{lref} {lroute}', '{lroute} {lpop}'], LC), scene=LINKS)

case('diagram.links.connect:pattern', 'connect many nodes at once (in order, in a loop, all to all, to a hub)',
     fr(['{pol}{connect} {lpopfrom} {pattern}', '{pol}{connect} {nsomefrom} {pattern}', '{pol}[t:chain] {lpopfrom} together', '{pol}{connect} {lpopfrom} to {to}',
         '{pol}{connect} every node to every other'.replace('every node', '[c:link.from|every node]').replace('to every other', '[c:link.pattern|to every other|all]'),
         '{pol}{connect} {lpopfrom}'], op('diagram.links.connect')),
     fr(['they are steps of one process, so {connect} {lpopfrom} {pattern}', 'it is a cycle, {pol}{connect} {lpopfrom} {pattern}'], op('diagram.links.connect')),
     fr(['{connect} {lpopfrom} {pattern}', '{connect} them {pattern}'.replace('them', '[c:link.from|them]'), '{lpopfrom} {pattern}',
         '[t:connect] alle lements'.replace('alle lements', '[c:link.from|alle lements]'), '{connect} all'.replace(' all', ' [c:link.from|all]')],
        op('diagram.links.connect')), scene=PLURAL)

# ============================================================ compound requests (several requests in one message)
CN_ = op('diagram.links.connect')
IMP = op('diagram.improve')


def C(template, *attrs):
    return F(template, *attrs)


case('compound:make-connect', 'add nodes and connect them (owner: "add three boxes and connect them in order", "two circles with an arrow")',
     [C('<<{pol}{add} {n} {kinds}>> and <<{connect} [c:link.from|them] {pattern}>>', MK, CN_),
      C('<<{pol}{add} {n} {kinds}>> and <<{connect} [c:link.from|them]>>', MK, CN_),
      C('<<{pol}{add} {n} {kinds}>>, then <<{connect} [c:link.from|them] {pattern}>>', MK, CN_),
      C('<<{pol}{add} [c:node.n|two|2] {kinds}>> <<with {alnoun} between [c:link.from|them]>>', MK, CN_),
      C('<<{pol}{add} [c:node.n|two|2] {kinds}>> and <<{connect} [c:link.from|them] with {alnoun}>>', MK, CN_),
      C('<<{pol}{add} {akind} called {label}>> and <<{connect} [c:link.from|it] to {to@1}>>', MK, LK),
      C('<<{pol}{add} {akind}>> and <<{connect} {from@1} to [c:link.to|it]>>', MK, LK),
      C('<<{pol}{add} {akind} labelled {label}>> and <<{add2} {akind2} labelled {label2}>>, then <<{connect} [c:link.from|them]>>', MK, MK, CN_)],
     [C('we need a pipeline: <<{add} {n} {kinds} {layout}>> and <<{connect} [c:link.from|them] {pattern}>>', MK, CN_),
      C('<<{pol}{add} {n} {colour} {kinds}>> and then <<{connect} [c:link.from|each one to the next]>>', MK, CN_),
      C('first <<{add} {akind} called {label}>>, after that <<{connect} [c:link.from|it] to {to@1}>> {why}', MK, LK)],
     [C('<<{n} {kinds}>> <<{pattern}>>'.replace('<<{pattern}>>', '<<[t:connected] {pattern}>>'), MK, CN_),
      C('<<[c:node.n|two|2] {kinds}>> <<with {alnoun}>>', MK, CN_),
      C('<<{add} {n} {kinds}>> + <<{connect}>>', MK, CN_),
      C('<<[c:node.n|two|2] cirles>> <<with an arraw>>'.replace('cirles', '[k:cirles|circle]').replace('an arraw', 'an [k:arraw|arrow]'), MK, CN_),
      C('<<ad [c:node.n|three|3] [k:boxs|box]>> and <<[t:conect] [c:link.from|them] [c:link.pattern|in order|chain]>>'.replace('ad ', '[t:ad] '), MK, CN_)],
     scene=EMPTY, n=30)

case('compound:change-change', 'two changes in one message',
     [C('<<{pol}{make} {nref} {colour}>> and <<{move} {nref2@1} to {region}>>', CH, op('diagram.node.place')),
      C('<<{pol}{rename} {nref} to {label}>> and <<{paint} [k:it|it] {colour}>>'.replace('[k:it|it]', 'it'), CH, op('diagram.node.change', fill='context')),
      C('<<{pol}{make} {npop} {colour}>> and <<{make2} {lpop@1} {style}>>', CH, LC),
      C('<<{pol}{delete} {nref}>> and <<{connect} {from@1} to {to@1}>>', op('diagram.node.remove'), LK),
      C('<<{pol}{make} {nref} {size}>>, <<{paint2} it {colour}>>', CH, op('diagram.node.change', fill='context')),
      C('<<{pol}{undo}>> and <<{make} {nref@1} {colour} instead>>', op('diagram.undo'), CH),
      C('<<{pol}{add} {n} {kinds}>> and <<improve the layout>>'.replace('improve', '[t:improve]'), MK, IMP),
      C('<<{pol}{make} {nref} {colour}>> and <<[t:make] it look nicer>>', CH, IMP)],
     [C('<<{delete} {nref}>>, it is obsolete, and <<{connect} {from@1} to {to@1}>> instead', op('diagram.node.remove'), LK),
      C('for the review <<{make} {npop} {colour}>> and also <<{make2} {lref@1} {style}>>', CH, LC)],
     [C('<<{nref} {colour}>>, <<{nref2@1} {size}>>', CH, CH), C('<<{delete} {nref}>> + <<{undo}>>'.replace('<<{undo}>>', '<<{undo} that>>'), op('diagram.node.remove'), op('diagram.undo'))],
     scene=S(need_links=True, need_plural_kind=True), n=30)

case('compound:question-command', 'a question followed by a command',
     [C('<<how many {kinds} are there?>> <<{delete} {npop@1}>>', op('diagram.observe.node', q='count', fill='all'), op('diagram.node.remove')),
      C('<<is {sfrom} connected to {sto}?>> if not <<{connect} {from@1} to {to@1}>>', op('diagram.check.link', q='exists', fill='description'), LK),
      C("<<what's in the diagram?>> then <<improve the layout>>".replace('improve', '[t:improve]'), op('diagram.observe', q='describe'), IMP),
      C('<<what colour is {nref}?>> <<{make} it {colour}>>', op('diagram.observe.node', q='what', asked_key='node.colour'), op('diagram.node.change', fill='context'))],
     [C('<<where is {nref}?>> I cannot see it, <<{move} it to {region}>>', op('diagram.observe.node', q='where'), op('diagram.node.place', fill='context'))],
     [C('<<{nref}?>> <<{delete} it>>', op('diagram.observe.node', q='where'), op('diagram.node.remove', fill='context'))],
     scene=S(need_links=True, need_plural_kind=True), n=24)

case('compound:make-style', 'add nodes then style or lay out the diagram',
     [C('<<{pol}{add} {n} {kinds}>> and <<[t:make] [c:link.from|them]>>'.replace('<<[t:make] [c:link.from|them]>>', '<<{connect} [c:link.from|them] {pattern}>>'), MK, CN_),
      C('<<{pol}{add} {akind} called {label}>> and <<[t:make] it {colour}>>', MK, op('diagram.node.change', fill='context')),
      C('<<{pol}{add} {n} {kinds}>> and <<[t:arrange] [c:node.layout|them|-]>>'.replace('<<[t:arrange] [c:node.layout|them|-]>>', '<<[t:arrange] them {layout}>>'),
        MK, op('diagram.node.layout', fill='context')),
      C('<<{pol}{add} {akind} labelled {label}>>, <<[t:switch] to the {theme} theme>>', MK, op('diagram.style.apply')),
      C('<<{pol}[t:lay out] the diagram {dlayout}>> and <<[t:make] it {theme}>>', op('diagram.layout'), op('diagram.style.apply')),
      C('<<{pol}{connect} {from} to {to}>> and <<[t:make] that {plainlnoun} {style}>>'.replace('that {plainlnoun}', 'that [k:arrow|arrow]'), LK, op('diagram.link.change', fill='context')),
      C('<<{pol}{delete} {nref}>> and <<[t:tidy up] the rest>>', op('diagram.node.remove'), IMP),
      C('<<{pol}{add} {akind}>> <<{rel} {anchor}>>'.replace('<<{rel} {anchor}>>', 'and <<[t:connect] {from@1} to [c:link.to|it]>>'), MK, LK)],
     [C('first <<{add} {n} {kinds} {layout}>>, then <<{connect} [c:link.from|them] {pattern}>>, and finally <<[t:make] it {theme}>>', MK, CN_, op('diagram.style.apply')),
      C('for the slides <<{add} {akind} called {label}>> and <<[t:make] the whole thing {theme}>>', MK, op('diagram.style.apply'))],
     [C('<<{n} {kinds}>>, <<{pattern}>>'.replace('<<{pattern}>>', '<<[t:linked] {pattern}>>'), MK, CN_),
      C('<<{add} {akind}>> <<and {akind2}>>', MK, MK)],
     scene=S(min_nodes=3, need_links=True), n=30)
