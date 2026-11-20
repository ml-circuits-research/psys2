"""Case catalogue of ui-coverage-v2: every operation of the five tabs' native interfaces, the reader labels it maps to,
and the parameter cases (operation x parameter / parameter combination / enum spread / UI control) the corpus covers.

Read by build.py (label templates, completion policies), coverage.py (before/after matrix) and validate.py.
`check_interfaces()` parses worlds/<world>/native-interface.sop and worlds/<world>/area.sop and fails when an
operation, parameter or area control is neither mapped here nor listed in EXCLUDED with a reason.

Case key syntax: `key` (constraint key present), `key@operator`, `key=value`, `@kind` (target kind_span),
`@name` (target name_span), `@ctx` (target from context/selection), `@all` (target fill all), `#sel2` (two or more
selector references), `#multi` (two or more result parameters), `?ask` (question kind).
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]

TABS = {'drawing': 'art.draw', 'diagram': 'diagram.sketch', 'calendar': 'time.calendar', 'document': 'docs.editor', 'avatar': 'ui.avatar'}

# Reader keys that are the same parameter under another historical name (coverage counting only; this corpus writes
# the first-named key).
KEY_EQUIV = {
    'drawn.color': ['drawn.colour'], 'part.color': ['part.colour'], 'meeting.length': ['meeting.duration'],
    'meeting.people': ['meeting.participants'], 'room.seats': ['room.capacity'], 'text.title': ['document.title'], 'document.title': ['text.title'],
    'section.text': ['section.content'], 'block.text': ['text.text', 'section.content'], 'text.about': ['document.topic'],
    'text.genre': ['document.genre'], 'text.words': ['document.words'], 'text.chapters': ['document.chapters'],
    'calendar.name': ['calendar.label'], 'person.name': ['person.label'], 'room.name': ['room.label'],
    'block.mark': ['inline.format'], 'section.mark': ['inline.format'], 'block.items': ['inline.items'],
    'block.rows': ['inline.rows'], 'block.style': ['inline.list_kind'], 'face.mode': [], 'page.mode': [],
}

# Selectors that restrict by a text range, a day, a time or a length rather than naming an object of the context.
NON_OBJECT_SELECTORS = {'block.text', 'section.text', 'block.from', 'block.to', 'section.from', 'section.to', 'meeting.day', 'meeting.time', 'meeting.length'}

# Generic completion policies: what the system is expected to fill from SOP world preferences/constraints when the
# text leaves a value out (never text-extraction gold).
POLICY = {
    'position': 'place at a free spot that suits the kind (k.scenes usual place, e.g. a boat on water), without overlapping peers',
    'size': 'size from the comparison class of the kind and the page (world preference), not a fixed default',
    'relsize': 'relative change from the current value of the referent (one step on the size scale)',
    'colour': 'keep the current or the kind\'s usual colour',
    'label': 'no label unless the world requires one; a generated unique name otherwise',
    'dimensions': 'keep the aspect ratio of the current shape; derive missing width/height from the other',
    'direction': 'target position = current position plus one step in the stated direction, clamped to the page',
    'region': 'resolve the named page region against the page frame and free space',
    'duration': 'default meeting length from the calendar preferences (30 minutes)',
    'slot': 'first free slot of all participants and the room inside working hours on the stated day',
    'day': 'the next working day with a free slot, or today if the time is still ahead',
    'room': 'no room unless the participants need one; a free room with enough seats otherwise',
    'calendar': 'the default calendar of the user',
    'people': 'the user only',
    'ids-duration': 'the default display time of the ID overlay (4 seconds)',
    'ids-mode': 'temporary display',
    'reference': 'resolve the referent from the current selection, the last mentioned object or the only candidate',
    'part-index': 'resolve the part named in the text to its index in the owner object (knowledge of the kind\'s parts)',
    'text-content': 'generate text appropriate to the document context (composer service)',
    'level': 'heading level from the position in the outline (chapter 1, subchapter 2, inner headings 3)',
    'items': 'keep the existing items',
    'style': 'keep the current style',
    'name': 'a generated unique name',
    'meeting-title': 'a title from the purpose and the participants (e.g. "Meeting with Ana")',
    'layout': 'the layout that fits the members (row for a few, grid for many, tree for a hierarchy)',
    'scale': 'one step (about 20 percent) in the stated direction',
    'chart-title': 'title derived from the data labels or the group name',
    'genre': 'genre inferred from the topic and the document context',
    'words': 'a length appropriate to the genre',
    'from': 'the current selection is the source node',
    'endpoint': 'keep the other endpoint unchanged',
    'link-style': 'keep the current link style',
    'tone-value': 'the tone value stated or implied by the request',
    'header': 'first row is a header (table default)',
    'mark-range': 'the current text selection, or the words quoted in the text',
    'order-anchor': 'one step up or down from the current position',
    'variant': 'a variant of the slot that suits the face preset and the request',
    'slot-of-variant': 'the slot that holds this variant (w.face catalog)',
    'property': 'the feature property implied by the value (w.face catalog)',
    'capacity': 'keep the current capacity',
    'location': 'keep the current location',
}

# Key -> policy name used when that key is omitted from a simplified paraphrase of a case that declares it.
KEY_POLICY = {
    'drawn.x': 'position', 'drawn.y': 'position', 'drawn.at': 'region', 'drawn.size': 'size', 'drawn.color': 'colour',
    'drawn.label': 'label', 'drawn.name': 'name', 'drawn.width': 'dimensions', 'drawn.height': 'dimensions',
    'drawn.direction': 'direction', 'drawn.relation': 'position', 'part.index': 'part-index', 'part.x': 'position', 'part.y': 'position',
    'part.color': 'colour', 'part.width': 'dimensions', 'part.height': 'dimensions', 'page.duration': 'ids-duration', 'page.mode': 'ids-mode',
    'node.x': 'position', 'node.y': 'position', 'node.at': 'region', 'node.label': 'label', 'node.colour': 'colour', 'node.size': 'size',
    'node.n': 'layout', 'node.layout': 'layout', 'node.width': 'dimensions', 'node.height': 'dimensions', 'node.value': 'label',
    'link.from': 'from', 'link.to': 'endpoint', 'link.label': 'label', 'link.colour': 'link-style', 'link.style': 'link-style',
    'link.arrow': 'link-style', 'link.width': 'link-style', 'group.name': 'name', 'group.label': 'label', 'group.ids': 'reference',
    'group.colour': 'colour', 'group.size': 'size', 'group.layout': 'layout', 'group.scale': 'scale', 'group.x': 'position',
    'group.y': 'position', 'group.labels': 'chart-title', 'group.values': 'chart-title', 'chart.type': 'layout', 'chart.title': 'chart-title',
    'calendar.name': 'name', 'calendar.colour': 'colour', 'person.name': 'name', 'room.name': 'name', 'room.seats': 'capacity',
    'room.location': 'location', 'meeting.title': 'meeting-title', 'meeting.day': 'day', 'meeting.time': 'slot', 'meeting.length': 'duration',
    'meeting.people': 'people', 'meeting.room': 'room', 'meeting.calendar': 'calendar', 'meeting.notes': 'text-content',
    'meeting.shift': 'slot', 'meeting.free': 'slot', 'text.title': 'name', 'document.title': 'name', 'text.content': 'text-content', 'text.genre': 'genre',
    'text.about': 'text-content', 'text.words': 'words', 'text.chapters': 'words', 'text.tone': 'tone-value', 'text.length': 'words',
    'block.text': 'text-content', 'block.name': 'name', 'block.level': 'level', 'block.align': 'style', 'block.mark': 'style',
    'block.attrs': 'style', 'block.items': 'items', 'block.style': 'style', 'block.checked': 'items', 'block.rows': 'items',
    'block.header': 'header', 'block.from': 'mark-range', 'block.to': 'mark-range', 'section.text': 'text-content',
    'section.name': 'name', 'section.level': 'level', 'section.align': 'style', 'section.mark': 'style', 'section.order': 'order-anchor',
    'section.order_anchor': 'order-anchor', 'section.from': 'mark-range', 'section.to': 'mark-range',
    'face.base': 'variant', 'face.characterKind': 'variant', 'face.preset': 'variant', 'face.expression': 'variant', 'face.name': 'name',
    'face.duration': 'ids-duration', 'face.mode': 'ids-mode', 'face.scale': 'scale', 'part.scale': 'scale', 'part.variant': 'variant',
    'part.id': 'slot-of-variant', 'part.colour': 'colour', 'part.size': 'size', 'part.property': 'property', 'part.value': 'variant',
    'part.place': 'direction', 'sketch.nodes': 'reference', 'sketch.links': 'reference',
}


def op(world, act, ttype, mode, sel=None, params=None, cases=None, mood='do', question=None, ui=None, fill=None):
    return {'world': world, 'act': act, 'type': ttype, 'mode': mode, 'sel': sel, 'params': params or {}, 'cases': cases or [('core', [])],
            'mood': mood, 'question': question, 'ui': ui or [], 'fill': fill}


DRAW_KINDS = ['circle', 'oval', 'square', 'rectangle', 'triangle', 'star', 'heart', 'line', 'arrow', 'lake', 'river', 'road', 'field', 'patch',
              'hill', 'house', 'tree', 'sun', 'cloud', 'car', 'flower', 'cat', 'dog', 'fish', 'bird', 'boat', 'mountain', 'rainbow', 'person',
              'balloon', 'rocket', 'moon']

# operation -> label template, native parameter -> reader keys, cases (suffix, case keys).
OPS = {
    # ------------------------------------------------------------------ Drawing (art.draw)
    'drawing.object.make': op('drawing', 'make', 'drawn', 'new', params={
        'kind': ['@kind'], 'name': ['drawn.name'], 'label': ['drawn.label'], 'width': ['drawn.width'], 'height': ['drawn.height'],
        'x': ['drawn.x'], 'y': ['drawn.y'], 'size': ['drawn.size'], 'color': ['drawn.color']},
        cases=[('kind-only', ['@kind']), ('color', ['@kind', 'drawn.color']), ('size-number', ['@kind', 'drawn.size@eq']),
               ('size-degree', ['@kind', 'drawn.size@degree']), ('position', ['@kind', 'drawn.x', 'drawn.y']),
               ('region', ['@kind', 'drawn.at@region']), ('dimensions', ['@kind', 'drawn.width', 'drawn.height']),
               ('label', ['@kind', 'drawn.label']), ('name', ['@kind', 'drawn.name']), ('relation', ['@kind', 'drawn.relation@relation']),
               ('multi', ['@kind', '#multi'])]),
    'drawing.catalog.make': op('drawing', 'make', 'drawn', 'new', params={'name': ['@kind'], 'x': ['drawn.x'], 'y': ['drawn.y'], 'size': ['drawn.size']},
        cases=[('kind-only', ['@kind']), ('position', ['@kind', 'drawn.x', 'drawn.y']), ('size', ['@kind', 'drawn.size'])]),
    'drawing.object.change': op('drawing', 'change', 'drawn', 'existing', sel='drawn.ids', params={
        'ids': ['@ref'], 'name': ['drawn.name'], 'label': ['drawn.label'], 'width': ['drawn.width'], 'height': ['drawn.height'],
        'x': ['drawn.x'], 'y': ['drawn.y'], 'size': ['drawn.size'], 'color': ['drawn.color']},
        cases=[('color', ['drawn.color']), ('size-number', ['drawn.size@eq']), ('size-relative', ['drawn.size@delta']),
               ('dimensions', ['drawn.width', 'drawn.height']), ('position', ['drawn.x', 'drawn.y']), ('label', ['drawn.label']),
               ('name', ['drawn.name']), ('multi', ['#multi']), ('selected', ['@ctx'])]),
    'drawing.object.select': op('drawing', 'select', 'drawn', 'existing', sel='drawn.id', params={'id': ['@ref']},
        ui=['Selection dropdown (area control drawing.control.select)']),
    'drawing.objects.select': op('drawing', 'select', 'drawn', 'existing', sel='drawn.ids', params={'ids': ['@ref']}, cases=[('core', ['#sel2'])]),
    'drawing.object.place': op('drawing', 'place', 'drawn', 'existing', sel='drawn.ids', params={'ids': ['@ref'], 'x': ['drawn.x'], 'y': ['drawn.y']},
        cases=[('position', ['drawn.x', 'drawn.y']), ('direction', ['drawn.direction']), ('region', ['drawn.at@region']),
               ('relation', ['drawn.relation@relation']), ('selected', ['@ctx'])],
        ui=['Move control with x/y fields (drawing.control.move)']),
    'drawing.objects.transform': op('drawing', 'change', 'drawn', 'existing', sel='drawn.ids', params={
        'ids': ['@ref'], 'x': ['drawn.x'], 'y': ['drawn.y'], 'width': ['drawn.width'], 'height': ['drawn.height']},
        cases=[('core', ['#sel2', 'drawn.width', 'drawn.height'])]),
    'drawing.page.clear': op('drawing', 'remove', 'page', 'existing', fill='context', ui=['Clear drawing button (drawing.control.clear)']),
    'drawing.object.remove': op('drawing', 'remove', 'drawn', 'existing', sel='drawn.ids', params={'ids': ['@ref']},
        cases=[('core', []), ('selected', ['@ctx'])], ui=['Delete button on the selection (drawing.control.remove)']),
    'drawing.ids.show': op('drawing', 'change', 'page', 'existing', fill='context', params={'mode': ['page.mode'], 'duration': ['page.duration']},
        cases=[('temporary', ['page.mode=temporary']), ('duration', ['page.duration']), ('always', ['page.mode=always']), ('off', ['page.mode=off'])]),
    'drawing.observe': op('drawing', 'answer', 'drawn', 'existing', mood='ask', fill='context',
        cases=[('describe', ['?describe']), ('count', ['?count']), ('exists', ['?exists'])]),
    'drawing.undo': op('drawing', 'undo', 'drawn', 'existing', fill='journal_step'),
    'drawing.redo': op('drawing', 'redo', 'drawn', 'existing', fill='journal_step'),
    'drawing.object.parts': op('drawing', 'answer', 'drawn', 'existing', sel='drawn.id', mood='ask', params={'id': ['@ref']}, cases=[('core', ['?describe'])]),
    'drawing.part.select': op('drawing', 'select', 'part', 'existing', sel=None, params={'id': ['part.id'], 'index': ['part.index']},
        cases=[('by-index', ['part.index']), ('by-name', ['@name'])]),
    'drawing.part.change': op('drawing', 'change', 'part', 'existing', sel=None, params={
        'id': ['part.id'], 'index': ['part.index'], 'color': ['part.color'], 'width': ['part.width'], 'height': ['part.height']},
        cases=[('color', ['part.color']), ('dimensions', ['part.width', 'part.height'])]),
    'drawing.part.place': op('drawing', 'place', 'part', 'existing', sel=None, params={'id': ['part.id'], 'index': ['part.index'], 'x': ['part.x'], 'y': ['part.y']},
        cases=[('position', ['part.x', 'part.y'])]),
    'drawing.part.remove': op('drawing', 'remove', 'part', 'existing', sel=None, params={'id': ['part.id'], 'index': ['part.index']}),
    'drawing.part.extract': op('drawing', 'ungroup', 'part', 'existing', sel=None, params={'id': ['part.id'], 'index': ['part.index']}),
    'drawing.object.group': op('drawing', 'group', 'drawn', 'existing', sel='drawn.ids', params={'ids': ['@ref'], 'name': ['drawn.name'], 'label': ['drawn.label']},
        cases=[('core', ['#sel2']), ('name', ['drawn.name']), ('label', ['drawn.label'])]),
    'drawing.object.ungroup': op('drawing', 'ungroup', 'drawn', 'existing', sel='drawn.id', params={'id': ['@ref']}),

    # ------------------------------------------------------------------ Diagram (diagram.sketch)
    'diagram.node.make': op('diagram', 'make', 'node', 'new', params={
        'kind': ['@kind'], 'label': ['node.label'], 'n': ['node.n'], 'colour': ['node.colour'], 'size': ['node.size'],
        'layout': ['node.layout'], 'x': ['node.x'], 'y': ['node.y']},
        cases=[('kind', ['@kind']), ('label', ['node.label']), ('count', ['node.n']), ('colour', ['node.colour']), ('size', ['node.size']),
               ('layout', ['node.layout']), ('position', ['node.x', 'node.y']), ('multi', ['#multi'])]),
    'diagram.node.change': op('diagram', 'change', 'node', 'existing', sel='node.ids', params={
        'ids': ['@ref'], 'colour': ['node.colour'], 'size': ['node.size'], 'label': ['node.label'], 'value': ['node.value']},
        cases=[('colour', ['node.colour']), ('size', ['node.size@eq']), ('size-relative', ['node.size@delta']), ('label', ['node.label']),
               ('value', ['node.value']), ('selected', ['@ctx'])],
        ui=['Label field (diagram.control.label)', 'Colour options (diagram.control.colour)', 'Size options (diagram.control.size)']),
    'diagram.node.select': op('diagram', 'select', 'node', 'existing', sel='node.ids', params={'ids': ['@ref'], 'edges': ['node.edges']},
        cases=[('core', []), ('with-links', ['node.edges'])], ui=['Selection control (diagram.control.select)']),
    'diagram.node.remove': op('diagram', 'remove', 'node', 'existing', sel='node.ids', params={'ids': ['@ref']},
        cases=[('core', []), ('selected', ['@ctx'])], ui=['Delete button (diagram.control.remove)']),
    'diagram.node.place': op('diagram', 'place', 'node', 'existing', sel='node.ids', params={'ids': ['@ref'], 'x': ['node.x'], 'y': ['node.y']},
        cases=[('position', ['node.x', 'node.y']), ('region', ['node.at@region'])]),
    'diagram.node.resize': op('diagram', 'change', 'node', 'existing', sel='node.ids', params={'ids': ['@ref'], 'width': ['node.width'], 'height': ['node.height']},
        cases=[('dimensions', ['node.width', 'node.height'])]),
    'diagram.node.layout': op('diagram', 'arrange', 'node', 'existing', sel='node.ids', params={'ids': ['@ref'], 'layout': ['node.layout']},
        cases=[('layout', ['node.layout'])]),
    'diagram.link.make': op('diagram', 'connect', 'link', 'new', params={'from': ['link.from'], 'to': ['link.to']},
        cases=[('core', ['link.from', 'link.to']), ('from-selection', ['link.to', '!link.from'])], ui=['Connect to control (diagram.control.link)']),
    'diagram.link.select': op('diagram', 'select', 'link', 'existing', sel='link.ids', params={'ids': ['@ref'], 'nodes': ['link.nodes']},
        cases=[('core', [])]),
    'diagram.link.change': op('diagram', 'change', 'link', 'existing', sel='link.ids', params={
        'ids': ['@ref'], 'from': ['link.from'], 'to': ['link.to'], 'label': ['link.label'], 'colour': ['link.colour'],
        'style': ['link.style'], 'arrow': ['link.arrow'], 'width': ['link.width']},
        cases=[('label', ['link.label']), ('colour', ['link.colour']), ('style', ['link.style']), ('arrow', ['link.arrow']),
               ('width', ['link.width']), ('reconnect', ['link.to@result'])]),
    'diagram.link.remove': op('diagram', 'remove', 'link', 'existing', sel='link.ids', params={'ids': ['@ref']}),
    'diagram.selection.remove': op('diagram', 'remove', 'sketch', 'existing', fill='context', params={'nodes': ['sketch.nodes'], 'links': ['sketch.links']},
        cases=[('core', ['sketch.nodes', 'sketch.links'])]),
    'diagram.page.clear': op('diagram', 'remove', 'sketch', 'existing', fill='context', ui=['Clear diagram button (diagram.control.clear)']),
    'diagram.ids.show': op('diagram', 'change', 'page', 'existing', fill='context', params={'mode': ['page.mode'], 'duration': ['page.duration']},
        cases=[('temporary', ['page.mode=temporary']), ('duration', ['page.duration']), ('always', ['page.mode=always']), ('off', ['page.mode=off'])]),
    'diagram.observe': op('diagram', 'answer', 'sketch', 'existing', mood='ask', fill='context',
        cases=[('describe', ['?describe']), ('count', ['?count']), ('exists', ['?exists'])]),
    'diagram.undo': op('diagram', 'undo', 'sketch', 'existing', fill='journal_step'),
    'diagram.redo': op('diagram', 'redo', 'sketch', 'existing', fill='journal_step'),
    'diagram.group.make': op('diagram', 'group', 'group', 'new', params={'name': ['group.name'], 'label': ['group.label'], 'ids': ['group.ids']},
        cases=[('core', ['group.ids']), ('name', ['group.name']), ('label', ['group.label'])]),
    'diagram.group.select': op('diagram', 'select', 'group', 'existing', sel='group.id', params={'id': ['@ref']}),
    'diagram.group.change': op('diagram', 'change', 'group', 'existing', sel='group.id', params={
        'id': ['@ref'], 'label': ['group.label'], 'colour': ['group.colour'], 'size': ['group.size']},
        cases=[('label', ['group.label']), ('colour', ['group.colour']), ('size', ['group.size'])]),
    'diagram.group.layout': op('diagram', 'arrange', 'group', 'existing', sel='group.id', params={'id': ['@ref'], 'layout': ['group.layout']},
        cases=[('layout', ['group.layout'])]),
    'diagram.group.resize': op('diagram', 'change', 'group', 'existing', sel='group.id', params={'id': ['@ref'], 'scale': ['group.scale']},
        cases=[('scale-number', ['group.scale@eq']), ('scale-relative', ['group.scale@delta'])]),
    'diagram.group.place': op('diagram', 'place', 'group', 'existing', sel='group.id', params={'id': ['@ref'], 'x': ['group.x'], 'y': ['group.y']},
        cases=[('position', ['group.x', 'group.y'])]),
    'diagram.group.remove': op('diagram', 'remove', 'group', 'existing', sel='group.id', params={'id': ['@ref']}),
    'diagram.group.ungroup': op('diagram', 'ungroup', 'group', 'existing', sel='group.id', params={'id': ['@ref']}),
    'diagram.group.chart.make': op('diagram', 'make', 'group', 'new', params={
        'label': ['group.label'], 'labels': ['group.labels'], 'values': ['group.values'], 'layout': ['group.layout']},
        cases=[('core', ['group.labels', 'group.values', 'group.layout']), ('title', ['group.label'])]),
    'diagram.group.chart.adopt': op('diagram', 'make', 'group', 'new', params={'id': ['group.id']}, cases=[('core', ['group.id'])]),
    'diagram.group.chart': op('diagram', 'make', 'chart', 'new', params={'id': ['chart.source'], 'type': ['chart.type'], 'title': ['chart.title']},
        cases=[('core', ['chart.type']), ('title', ['chart.title'])]),

    # ------------------------------------------------------------------ Calendar (time.calendar)
    'calendar.calendar.add': op('calendar', 'make', 'calendar', 'new', params={'id': [], 'label': ['calendar.name'], 'colour': ['calendar.colour']},
        cases=[('core', ['calendar.name']), ('colour', ['calendar.colour'])]),
    'calendar.calendar.change': op('calendar', 'change', 'calendar', 'existing', sel='calendar.id', params={'id': ['@ref'], 'label': ['calendar.name'], 'colour': ['calendar.colour']},
        cases=[('rename', ['calendar.name']), ('colour', ['calendar.colour'])]),
    'calendar.calendar.remove': op('calendar', 'remove', 'calendar', 'existing', sel='calendar.id', params={'id': ['@ref']}),
    'calendar.person.add': op('calendar', 'make', 'person', 'new', params={'id': [], 'label': ['person.name']}, cases=[('core', ['person.name'])]),
    'calendar.person.change': op('calendar', 'change', 'person', 'existing', sel='person.id', params={'id': ['@ref'], 'label': ['person.name']},
        cases=[('rename', ['person.name'])]),
    'calendar.person.remove': op('calendar', 'remove', 'person', 'existing', sel='person.id', params={'id': ['@ref']}),
    'calendar.room.add': op('calendar', 'make', 'room', 'new', params={'id': [], 'label': ['room.name'], 'capacity': ['room.seats'], 'location': ['room.location']},
        cases=[('core', ['room.name']), ('capacity', ['room.seats']), ('location', ['room.location'])]),
    'calendar.room.change': op('calendar', 'change', 'room', 'existing', sel='room.id', params={
        'id': ['@ref'], 'label': ['room.name'], 'capacity': ['room.seats'], 'location': ['room.location']},
        cases=[('rename', ['room.name']), ('capacity', ['room.seats']), ('location', ['room.location'])]),
    'calendar.room.remove': op('calendar', 'remove', 'room', 'existing', sel='room.id', params={'id': ['@ref']}),
    'calendar.meeting.add': op('calendar', 'make', 'meeting', 'new', params={
        'id': [], 'title': ['meeting.title'], 'start': ['meeting.day', 'meeting.time'], 'duration': ['meeting.length'],
        'participants': ['meeting.people'], 'room': ['meeting.room'], 'calendar': ['meeting.calendar'], 'notes': ['meeting.notes']},
        cases=[('people', ['meeting.people']), ('start', ['meeting.day', 'meeting.time']), ('duration', ['meeting.length']),
               ('room', ['meeting.room']), ('calendar', ['meeting.calendar']), ('notes', ['meeting.notes']), ('free-slot', ['meeting.free'])]),
    'calendar.event.add': op('calendar', 'make', 'meeting', 'new', params={
        'id': [], 'title': ['meeting.title'], 'start': ['meeting.day', 'meeting.time'], 'duration': ['meeting.length'], 'notes': ['meeting.notes']},
        cases=[('core', ['meeting.title', 'meeting.time']), ('duration', ['meeting.title', 'meeting.length'])],
        ui=['Add event form: Title, Start, Minutes (calendar.control.add)']),
    'calendar.event.select': op('calendar', 'select', 'meeting', 'existing', sel='meeting.id', params={'id': ['@ref']},
        ui=['Selection control (calendar.control.select)']),
    'calendar.meeting.change': op('calendar', 'change', 'meeting', 'existing', sel='meeting.id', params={
        'id': ['@ref'], 'title': ['meeting.title'], 'start': ['meeting.day', 'meeting.time'], 'duration': ['meeting.length'],
        'participants': ['meeting.people'], 'room': ['meeting.room'], 'calendar': ['meeting.calendar'], 'notes': ['meeting.notes']},
        cases=[('rename', ['meeting.title']), ('duration', ['meeting.length']), ('people', ['meeting.people']), ('room', ['meeting.room']),
               ('calendar', ['meeting.calendar']), ('notes', ['meeting.notes'])],
        ui=['Rename control with Title field (calendar.control.rename)']),
    'calendar.meeting.move': op('calendar', 'place', 'meeting', 'existing', sel='meeting.id', params={'id': ['@ref'], 'start': ['meeting.day', 'meeting.time']},
        cases=[('time', ['meeting.time']), ('day', ['meeting.day']), ('shift', ['meeting.shift'])],
        ui=['Move control with Start field (calendar.control.move)']),
    'calendar.events.remove': op('calendar', 'remove', 'meeting', 'existing', sel='meeting.ids', params={'ids': ['@ref']}, cases=[('core', ['#sel2'])]),
    'calendar.meeting.remove': op('calendar', 'remove', 'meeting', 'existing', sel='meeting.id', params={'id': ['@ref']},
        cases=[('core', []), ('selected', ['@ctx'])], ui=['Delete button (calendar.control.remove)']),
    'calendar.observe': op('calendar', 'answer', 'calendar', 'existing', mood='ask', fill='context',
        cases=[('describe', ['?describe']), ('when', ['?when']), ('exists', ['?exists'])]),

    # ------------------------------------------------------------------ Documents (docs.editor)
    'document.title.change': op('document', 'change', 'document', 'existing', fill='context', params={'id': [], 'title': ['document.title']},
        cases=[('core', ['document.title'])], ui=['Document title input']),
    'document.block.select': op('document', 'select', 'block', 'existing', sel='block.id', params={'id': ['@ref'], 'at': [], 'from': ['block.from'], 'to': ['block.to']},
        cases=[('words', ['block.text@selector']), ('characters', ['block.from', 'block.to'])]),
    'document.section.select': op('document', 'select', 'section', 'existing', sel='section.id', params={'id': ['@ref'], 'at': [], 'from': ['section.from'], 'to': ['section.to']},
        cases=[('words', ['section.text@selector']), ('whole', [])], ui=['Outline buttons (go to chapter)']),
    'document.section.change': op('document', 'change', 'section', 'existing', sel='section.id', params={
        'id': ['@ref'], 'text': ['section.text'], 'name': ['section.name'], 'kind': [], 'level': ['section.level'], 'align': ['section.align']},
        cases=[('text', ['section.text']), ('level', ['section.level']), ('name', ['section.name'])],
        ui=['Inspector Label field, Heading level select']),
    'document.block.mark': op('document', 'change', 'block', 'existing', sel='block.id', params={
        'id': ['@ref'], 'at': [], 'from': ['block.text@selector'], 'to': ['block.text@selector'], 'mark': ['block.mark'], 'enabled': ['block.mark@negative'], 'attrs': ['block.attrs']},
        cases=[('mark', ['block.mark']), ('mark-off', ['block.mark@negative']), ('link', ['block.mark=link', 'block.attrs'])],
        ui=['B / I / U / S / Code / Highlight buttons', 'Clear format button']),
    'document.section.mark': op('document', 'change', 'section', 'existing', sel='section.id', params={
        'id': ['@ref'], 'at': [], 'from': ['section.text@selector'], 'to': ['section.text@selector'], 'mark': ['section.mark'], 'enabled': ['section.mark@negative'], 'attrs': []},
        cases=[('mark', ['section.mark']), ('mark-off', ['section.mark@negative'])]),
    'document.block.align': op('document', 'change', 'block', 'existing', sel='block.id', params={'id': ['@ref'], 'align': ['block.align']},
        cases=[('align', ['block.align'])], ui=['Inspector Alignment select']),
    'document.section.align': op('document', 'change', 'section', 'existing', sel='section.id', params={'id': ['@ref'], 'align': ['section.align']},
        cases=[('align', ['section.align'])]),
    'document.block.reorder': op('document', 'place', 'block', 'existing', sel='block.ids', params={'ids': ['@ref']},
        cases=[('core', [])], ui=['Move up / Move down buttons, drag handle, Alt+Up/Down']),
    'document.list.make': op('document', 'make', 'block', 'new', params={'parent': [], 'name': ['block.name'], 'items': ['block.items'], 'style': ['block.style']},
        cases=[('core', ['block.items', 'block.style']), ('name', ['block.name'])], ui=['+ List button']),
    'document.list.change': op('document', 'change', 'block', 'existing', sel='block.id', params={'id': ['@ref'], 'items': ['block.items'], 'style': ['block.style'], 'checked': ['block.checked']},
        cases=[('items', ['block.items']), ('style', ['block.style']), ('checked', ['block.checked'])],
        ui=['List style select', 'Edit list items dialog', 'Task checkbox']),
    'document.table.make': op('document', 'make', 'block', 'new', params={'parent': [], 'name': ['block.name'], 'rows': ['block.rows'], 'header': ['block.header']},
        cases=[('core', ['block.rows']), ('header', ['block.header']), ('name', ['block.name'])], ui=['+ Table button']),
    'document.table.change': op('document', 'change', 'block', 'existing', sel='block.id', params={'id': ['@ref'], 'rows': ['block.rows'], 'header': ['block.header']},
        cases=[('rows', ['block.rows']), ('header', ['block.header'])], ui=['Edit table cells dialog']),
    'document.container.change': op('document', 'change', 'block', 'existing', sel='block.id', params={'id': ['@ref'], 'text': ['block.text']},
        cases=[('core', ['block.text'])], ui=['Inline text editing of a paragraph, list item or table cell']),
    'document.write': op('document', 'make', 'text', 'new', params={'title': ['text.title'], 'blocks': ['text.content'], 'genre': ['text.genre'], 'topic': ['text.about']},
        cases=[('core', ['text.title']), ('content', ['text.content'])]),
    'document.compose': op('document', 'make', 'text', 'new', params={'genre': ['text.genre'], 'topic': ['text.about'], 'words': ['text.words'], 'chapters': ['text.chapters']},
        cases=[('core', ['text.genre', 'text.about']), ('words', ['text.words']), ('chapters', ['text.chapters'])]),
    'document.rewrite': op('document', 'change', 'text', 'existing', fill='context', params={'property': ['text.tone', 'text.length'], 'value': ['text.tone', 'text.length']},
        cases=[('tone', ['text.tone']), ('length', ['text.length'])]),
    'document.block.make': op('document', 'make', 'block', 'new', params={'parent': [], 'kind': ['@kind'], 'text': ['block.text'], 'level': ['block.level'], 'name': ['block.name']},
        cases=[('kind', ['@kind']), ('text', ['block.text']), ('level', ['block.level']), ('name', ['block.name'])],
        ui=['+ Paragraph / + Heading / + Quote buttons']),
    'document.section.make': op('document', 'make', 'section', 'new', params={'parent': [], 'after': ['section.order'], 'text': ['section.text'], 'level': ['section.level', '@kind'], 'name': ['section.name']},
        cases=[('kind', ['@kind']), ('text', ['section.text']), ('after', ['section.order']), ('name', ['section.name'])],
        ui=['+ Chapter / + Subchapter buttons']),
    'document.block.change': op('document', 'change', 'block', 'existing', sel='block.id', params={
        'id': ['@ref'], 'text': ['block.text'], 'name': ['block.name'], 'kind': ['block.kind'], 'level': ['block.level'], 'align': ['block.align']},
        cases=[('text', ['block.text']), ('name', ['block.name']), ('kind', ['block.kind']), ('level', ['block.level'])],
        ui=['Inspector Label field, Block type select, Heading level select, Edit text button']),
    'document.block.remove': op('document', 'remove', 'block', 'existing', sel='block.ids', params={'ids': ['@ref']},
        cases=[('core', []), ('selected', ['@ctx']), ('all', ['@all'])], ui=['Delete block button', 'Clear document button']),
    'document.section.remove': op('document', 'remove', 'section', 'existing', sel='section.ids', params={'ids': ['@ref']}, ui=['Delete section button']),
    'document.section.reorder': op('document', 'place', 'section', 'existing', sel='section.ids', params={'ids': ['@ref']},
        cases=[('order', ['section.order'])]),
    'document.remove': op('document', 'remove', 'document', 'existing', fill='context'),
    'document.observe': op('document', 'answer', 'document', 'existing', mood='ask', fill='context',
        cases=[('describe', ['?describe']), ('count', ['?count'])]),
    'document.undo': op('document', 'undo', 'document', 'existing', fill='journal_step', ui=['Undo button']),
    'document.redo': op('document', 'redo', 'document', 'existing', fill='journal_step', ui=['Redo button']),

    # ------------------------------------------------------------------ Avatar (ui.avatar)
    'avatar.face.compose': op('avatar', 'change', 'face', 'existing', fill='description', params={'id': [], 'characterKind': ['face.characterKind'], 'base': ['face.base']},
        cases=[('base', ['face.base']), ('kind', ['face.characterKind'])]),
    'avatar.face.preset': op('avatar', 'change', 'face', 'existing', fill='description', params={'id': [], 'preset': ['face.preset']},
        cases=[('preset', ['face.preset'])], ui=['Composition dropdown (avatar.control.preset)']),
    'avatar.face.expression': op('avatar', 'change', 'face', 'existing', fill='description', params={'id': [], 'expression': ['face.expression']},
        cases=[('expression', ['face.expression'])], ui=['Emotion dropdown (avatar.control.expression)']),
    'avatar.face.name': op('avatar', 'change', 'face', 'existing', fill='description', params={'id': [], 'name': ['face.name']}, cases=[('core', ['face.name'])]),
    'avatar.face.select': op('avatar', 'select', 'face', 'existing', fill='description', params={'id': []}),
    'avatar.ids.show': op('avatar', 'change', 'face', 'existing', fill='context', params={'mode': ['face.mode'], 'duration': ['face.duration']},
        cases=[('temporary', ['face.mode=temporary']), ('duration', ['face.duration']), ('always', ['face.mode=always']), ('off', ['face.mode=off'])],
        ui=['Object IDs dropdown (avatar.control.ids)']),
    'avatar.part.select': op('avatar', 'select', 'part', 'existing', sel='part.ids', params={'id': ['@ref']}, ui=['Selection dropdown (avatar.control.select)']),
    'avatar.face.resize': op('avatar', 'change', 'face', 'existing', fill='description', params={'id': [], 'scale': ['face.scale']},
        cases=[('scale-number', ['face.scale@eq']), ('scale-relative', ['face.scale@delta'])]),
    'avatar.part.resize': op('avatar', 'change', 'part', 'existing', sel='part.ids', params={'ids': ['@ref'], 'scale': ['part.scale']},
        cases=[('scale-number', ['part.scale@eq']), ('scale-relative', ['part.scale@delta'])]),
    'avatar.part.add': op('avatar', 'make', 'part', 'new', params={'id': ['part.id'], 'variant': ['part.variant']},
        cases=[('variant', ['part.variant']), ('slot', ['part.id', 'part.variant'])], ui=['Add dropdown (avatar.control.add)']),
    'avatar.part.change': op('avatar', 'change', 'part', 'existing', sel='part.ids', params={'ids': ['@ref'], 'variant': ['part.variant'], 'colour': ['part.colour'], 'size': ['part.size']},
        cases=[('variant', ['part.variant']), ('colour', ['part.colour']), ('size', ['part.size'])],
        ui=['Look dropdown (avatar.control.variant)', 'Size dropdown (avatar.control.size)', 'Colour dropdown (avatar.control.colour)']),
    'avatar.part.feature': op('avatar', 'change', 'part', 'existing', sel='part.ids', params={'id': ['@ref'], 'property': ['part.property'], 'value': ['part.value']},
        cases=[('core', ['part.value'])]),
    'avatar.part.move': op('avatar', 'place', 'part', 'existing', sel='part.ids', params={'ids': ['@ref'], 'place': ['part.place']},
        cases=[('place', ['part.place'])], ui=['Move dropdown (avatar.control.move)']),
    'avatar.part.remove': op('avatar', 'remove', 'part', 'existing', sel='part.ids', params={'ids': ['@ref']}),
    'avatar.parts.remove': op('avatar', 'remove', 'part', 'existing', sel='part.ids', params={'ids': ['@ref']}, cases=[('core', ['#sel2'])],
        ui=['Delete button (avatar.control.remove)']),
    'avatar.clear': op('avatar', 'remove', 'part', 'existing', fill='all', params={'ids': ['@all']}, cases=[('core', ['@all'])]),
    'avatar.observe': op('avatar', 'answer', 'face', 'existing', mood='ask', fill='context', cases=[('describe', ['?describe']), ('exists', ['?exists'])]),
    'avatar.undo': op('avatar', 'undo', 'face', 'existing', fill='journal_step'),
    'avatar.redo': op('avatar', 'redo', 'face', 'existing', fill='journal_step'),
}

# Declared operations/parameters that are not separate reader cases, with the reason.
EXCLUDED = {
    'diagram.link.select:nodes': 'secondary selection array of the UI; a reader request selects links by their endpoints (link.from/link.to selectors)',
    'calendar.*:id': 'technical identifier generated by the tool; people name calendars, people, rooms and events by their title',
    'calendar.meeting.add:id': 'technical identifier generated by the tool',
    'calendar.event.add:id': 'technical identifier generated by the tool',
    'document.*:parent': 'the document container; implicit in the Documents tab',
    'document.*:at': 'locator inside a list/table container; expressed by the description of the block',
    'document.title.change:id': 'the open document',
    'document.section.change:kind': 'only value "heading"; a section is always a heading',
    'document.section.mark:attrs': 'link/highlight attributes are covered on document.block.mark',
    'avatar.*:id=face': 'constant face identity (enum "face"); the reader refers to the avatar by description or context',
    'document.block.reorder:destination': 'no block-level order key in the reader inventory (only section.order); the destination phrase is recorded as a completion requirement, see README',
}

# Extra area/tab controls that send commands and are not 1:1 with a parameter case; mapped to their case.
UI_CONTROLS = [
    ('drawing', 'Selection dropdown', 'drawing.object.select:core'),
    ('drawing', 'Move (x, y fields)', 'drawing.object.place:position'),
    ('drawing', 'Delete (selection)', 'drawing.object.remove:selected'),
    ('drawing', 'Clear drawing', 'drawing.page.clear:core'),
    ('diagram', 'Selection (many)', 'diagram.node.select:core'),
    ('diagram', 'Label field', 'diagram.node.change:label'),
    ('diagram', 'Colour options', 'diagram.node.change:colour'),
    ('diagram', 'Size options', 'diagram.node.change:size'),
    ('diagram', 'Connect to', 'diagram.link.make:from-selection'),
    ('diagram', 'Delete (selection)', 'diagram.node.remove:selected'),
    ('diagram', 'Clear diagram', 'diagram.page.clear:core'),
    ('calendar', 'Add event (Title, Start, Minutes)', 'calendar.event.add:duration'),
    ('calendar', 'Selection', 'calendar.event.select:core'),
    ('calendar', 'Rename (Title)', 'calendar.meeting.change:rename'),
    ('calendar', 'Move (Start)', 'calendar.meeting.move:time'),
    ('calendar', 'Delete (selection)', 'calendar.meeting.remove:selected'),
    ('document', '+ Chapter / + Subchapter', 'document.section.make:kind'),
    ('document', '+ Paragraph / + Heading / + Quote', 'document.block.make:kind'),
    ('document', '+ List', 'document.list.make:core'),
    ('document', '+ Table', 'document.table.make:core'),
    ('document', 'B / I / U / S / Code / Highlight', 'document.block.mark:mark'),
    ('document', 'Clear format', 'document.block.mark:mark-off'),
    ('document', 'Clear document', 'document.block.remove:all'),
    ('document', 'Undo / Redo', 'document.undo:core'),
    ('document', 'Title input', 'document.title.change:core'),
    ('document', 'Label field (inspector)', 'document.block.change:name'),
    ('document', 'Block type select', 'document.block.change:kind'),
    ('document', 'Heading level select', 'document.section.change:level'),
    ('document', 'Alignment select', 'document.block.align:align'),
    ('document', 'Move up / Move down / drag', 'document.block.reorder:core'),
    ('document', 'Delete block / Delete section', 'document.block.remove:selected'),
    ('document', 'Edit text (inline editing)', 'document.container.change:core'),
    ('document', 'List style select', 'document.list.change:style'),
    ('document', 'Edit list items', 'document.list.change:items'),
    ('document', 'Task checkbox', 'document.list.change:checked'),
    ('document', 'Edit table cells', 'document.table.change:rows'),
    ('document', 'Outline (go to section)', 'document.section.select:whole'),
    ('avatar', 'Composition', 'avatar.face.preset:preset'),
    ('avatar', 'Emotion', 'avatar.face.expression:expression'),
    ('avatar', 'Object IDs', 'avatar.ids.show:always'),
    ('avatar', 'Selection', 'avatar.part.select:core'),
    ('avatar', 'Look', 'avatar.part.change:variant'),
    ('avatar', 'Add', 'avatar.part.add:variant'),
    ('avatar', 'Size', 'avatar.part.change:size'),
    ('avatar', 'Colour', 'avatar.part.change:colour'),
    ('avatar', 'Move', 'avatar.part.move:place'),
    ('avatar', 'Delete', 'avatar.parts.remove:core'),
]


def all_cases():
    out = []
    for name, spec in OPS.items():
        for suffix, keys in spec['cases']:
            out.append((f'{name}:{suffix}', name, keys))
    return out


CASE_INDEX = {cid: (o, keys) for cid, o, keys in all_cases()}


def parse_interface(world_dir):
    ops = {}
    text = (REPO / 'worlds' / world_dir / 'native-interface.sop').read_text()
    for line in text.splitlines():
        m = re.match(r'@(\S+) std.capability.operation .*name="([^"]+)" act=(\S+)', line)
        if m:
            ops[m.group(1)] = {'name': m.group(2), 'act': m.group(3), 'params': {}}
            continue
        m = re.match(r'@\S+ std.capability.parameter operation=\$(\S+) name="([^"]+)" kind=(\S+)(.*)', line)
        if m and m.group(1) in ops:
            enums = re.findall(r'enum="([^"]*)"', m.group(4))
            ops[m.group(1)]['params'][m.group(2)] = {'kind': m.group(3), 'required': 'required=true' in m.group(4), 'enum': enums}
    return {o['name']: o for o in ops.values()}


def parse_controls(world_dir):
    path = REPO / 'worlds' / world_dir / 'area.sop'
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        m = re.match(r'@(\S+) app.area.control .*label="([^"]+)" operation="([^"]+)"(.*)', line)
        if m:
            p = re.search(r' param=(\S+)', m.group(4))
            out.append({'id': m.group(1), 'label': m.group(2), 'operation': m.group(3), 'param': p.group(1) if p else None})
    return out


def excluded(opname, param):
    for pattern in EXCLUDED:
        o, _, p = pattern.partition(':')
        if p.startswith('id=') and param == 'id':
            p = 'id'
        if (o == opname or (o.endswith('*') and opname.startswith(o[:-1]))) and (p in (param, '*')):
            return True
    return False


def check_interfaces():
    """Every declared operation/parameter of the five tabs is mapped or excluded; every area control maps to a case."""
    problems, inventory = [], {}
    for world, wdir in TABS.items():
        declared = parse_interface(wdir)
        inventory[world] = declared
        for name, o in declared.items():
            if name not in OPS:
                problems.append(f'operation not in catalogue: {name}')
                continue
            for p in o['params']:
                if p not in OPS[name]['params'] and not excluded(name, p):
                    problems.append(f'parameter not mapped: {name}.{p}')
        for name in OPS:
            if OPS[name]['world'] == world and name not in declared:
                problems.append(f'catalogue operation not declared by {wdir}: {name}')
        for c in parse_controls(wdir):
            if c['operation'] not in OPS:
                problems.append(f'area control {c["id"]} -> unknown operation {c["operation"]}')
    for _, _, cid in UI_CONTROLS:
        if cid not in CASE_INDEX:
            problems.append(f'UI control mapped to unknown case {cid}')
    return problems, inventory


if __name__ == '__main__':
    problems, inv = check_interfaces()
    for world, ops in inv.items():
        print(world, len(ops), 'operations,', sum(len(o['params']) for o in ops.values()), 'parameters,',
              sum(1 for c in all_cases() if OPS[c[1]]['world'] == world), 'cases,', len(parse_controls(TABS[world])), 'area controls')
    print('\n'.join(problems) or 'interfaces fully mapped')
