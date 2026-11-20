"""Surface vocabularies for ui-diagram-v2: verbs, kinds, values (surface -> normalised value) and reference forms."""
import random

from engine import Scene

V = {
    'add': ['add', 'create', 'make', 'draw', 'put', 'insert', 'place', 'drop in', 'throw in', 'stick in', 'pop in', 'add in', 'sketch', 'build'],
    'connect': ['connect', 'link', 'join', 'wire', 'hook up', 'attach', 'tie'],
    'delete': ['delete', 'remove', 'erase', 'get rid of', 'drop', 'take out', 'trash', 'scrap', 'kill', 'clear away', 'lose'],
    'make': ['make', 'turn', 'set', 'change', 'switch'],
    'paint': ['colour', 'color', 'paint', 'fill', 'recolour', 'recolor', 'shade', 'tint'],
    'move': ['move', 'put', 'drag', 'shift', 'place', 'slide', 'push', 'bring', 'take'],
    'select': ['select', 'pick', 'choose', 'click', 'focus on', 'grab', 'mark'],
    'rename': ['rename', 'relabel', 'retitle', 'label', 'call', 'name'],
    'arrange': ['arrange', 'lay out', 'organise', 'organize', 'line up', 'put', 'order', 'set out', 'place', 'align', 'rearrange', 'sort'],
    'group': ['group', 'bundle', 'put together', 'combine', 'cluster', 'wrap', 'box up'],
    'ungroup': ['ungroup', 'split up', 'break apart', 'dissolve', 'separate', 'break up', 'unbundle'],
    'resize': ['resize', 'make', 'set', 'scale', 'size'],
    'undo': ['undo', 'take back', 'revert', 'go back', 'reverse', 'roll back', 'cancel'],
    'redo': ['redo', 'do again', 'repeat', 'reapply', 'bring back', 'put back'],
    'show': ['show', 'display', 'reveal', 'turn on', 'flash', 'let me see'],
    'hide': ['hide', 'turn off', 'switch off', 'remove', 'get rid of'],
    'clear': ['clear', 'wipe', 'empty', 'reset', 'erase', 'delete', 'start over with'],
}
POLITE = ['please ', 'can you ', 'could you ', "let's ", 'I want to ', 'I need you to ', 'go ahead and ', 'now ', 'ok ', 'just ', '', '', '', '', '']
POLITE_POST = ['', '', '', '', '', ' please', ' for me', ' now', ', thanks', ' quickly']

KINDS = {  # native kind -> (singular surfaces, plural surfaces)
    'circle': (['circle', 'round node', 'bubble'], ['circles', 'round nodes', 'bubbles']),
    'rectangle': (['rectangle', 'box', 'rect'], ['rectangles', 'boxes', 'rectangles']),
    'square': (['square'], ['squares']),
    'diamond': (['diamond', 'rhombus', 'decision box'], ['diamonds', 'diamonds', 'decision boxes']),
    'ellipse': (['ellipse', 'oval'], ['ellipses', 'ovals']),
    'triangle': (['triangle'], ['triangles']),
    'hexagon': (['hexagon'], ['hexagons']),
    'star': (['star'], ['stars']),
    'text': (['text label', 'text box', 'label'], ['text labels', 'text boxes', 'labels']),
}
LEMMA = {'circle': 'circle', 'round node': 'circle', 'bubble': 'circle', 'circles': 'circle', 'round nodes': 'circle', 'bubbles': 'circle',
         'rectangle': 'rectangle', 'rect': 'rectangle', 'rectangles': 'rectangle', 'box': 'box', 'boxes': 'box', 'square': 'square', 'squares': 'square',
         'diamond': 'diamond', 'rhombus': 'diamond', 'decision box': 'diamond', 'diamonds': 'diamond', 'decision boxes': 'diamond',
         'ellipse': 'ellipse', 'oval': 'ellipse', 'ellipses': 'ellipse', 'ovals': 'ellipse', 'triangle': 'triangle', 'triangles': 'triangle',
         'hexagon': 'hexagon', 'hexagons': 'hexagon', 'star': 'star', 'stars': 'star', 'text label': 'text', 'text box': 'text', 'label': 'text',
         'text labels': 'text', 'text boxes': 'text', 'labels': 'text', 'node': 'node', 'nodes': 'node', 'shape': 'shape', 'shapes': 'shape',
         'element': 'element', 'elements': 'element', 'step': 'step', 'steps': 'step', 'item': 'item', 'items': 'item', 'thing': 'thing',
         'things': 'thing', 'object': 'object', 'objects': 'object', 'block': 'box', 'blocks': 'box'}
GENERIC = (['node', 'shape', 'element', 'step', 'item', 'block', 'thing'], ['nodes', 'shapes', 'elements', 'steps', 'items', 'blocks', 'things', 'objects'])
LINK_NOUNS = (['arrow', 'line', 'link', 'connection', 'connector', 'edge', 'connecting line'], ['arrows', 'lines', 'links', 'connections', 'connectors', 'edges'])
LINK_LEMMA = {'arrow': 'arrow', 'arrows': 'arrow', 'line': 'line', 'lines': 'line', 'link': 'link', 'links': 'link', 'connection': 'connection',
              'connections': 'connection', 'connector': 'connector', 'connectors': 'connector', 'edge': 'edge', 'edges': 'edge', 'connecting line': 'line'}
COLOURS = [('red', 'red'), ('orange', 'orange'), ('yellow', 'yellow'), ('gold', 'gold'), ('lime', 'lime'), ('green', 'green'), ('teal', 'teal'),
           ('cyan', 'cyan'), ('blue', 'blue'), ('navy', 'navy'), ('indigo', 'indigo'), ('purple', 'purple'), ('magenta', 'magenta'), ('pink', 'pink'),
           ('brown', 'brown'), ('gray', 'gray'), ('grey', 'gray'), ('black', 'black'), ('white', 'white'), ('violet', 'purple'), ('navy blue', 'navy')]
SIZES = [('tiny', 'tiny'), ('small', 'small'), ('little', 'small'), ('medium', 'default'), ('normal', 'default'), ('regular', 'default'),
         ('default', 'default'), ('big', 'big'), ('large', 'big'), ('huge', 'huge'), ('giant', 'huge'), ('massive', 'huge'), ('enormous', 'huge')]
GROUP_SIZES = [('tiny', 'tiny'), ('small', 'small'), ('medium', 'medium'), ('large', 'large'), ('big', 'large'), ('huge', 'huge')]
SHAPES = [('circle', 'circle'), ('box', 'box'), ('rounded box', 'rounded_box'), ('rounded rectangle', 'rounded_box'), ('oval', 'ellipse'),
          ('ellipse', 'ellipse'), ('diamond', 'diamond'), ('hexagon', 'hexagon'), ('triangle', 'triangle'), ('star', 'star'), ('cylinder', 'cylinder'),
          ('parallelogram', 'parallelogram'), ('cloud', 'cloud'), ('note', 'note'), ('square', 'square'), ('rectangle', 'rectangle')]
LAYOUTS = [('in a row', 'row'), ('in a line', 'row'), ('side by side', 'row'), ('horizontally', 'row'), ('in one row', 'row'), ('left to right', 'row'),
           ('in a column', 'column'), ('vertically', 'column'), ('stacked', 'column'), ('on top of each other', 'column'), ('top to bottom', 'column'),
           ('in a grid', 'grid'), ('as a grid', 'grid'), ('in rows and columns', 'grid'), ('as a tree', 'tree'), ('like a tree', 'tree'),
           ('as a hierarchy', 'tree'), ('in a circle', 'circle'), ('in a ring', 'circle'), ('around a circle', 'circle'), ('radially', 'radial'),
           ('in a radial layout', 'radial'), ('like a star around the middle', 'radial'), ('in layers', 'layers'), ('in levels', 'layers'),
           ('as layers', 'layers')]
GROUP_LAYOUTS = LAYOUTS + [('as a bar chart', 'bar'), ('as a pie chart', 'pie'), ('as a line chart', 'line'), ('as a doughnut', 'doughnut'),
                           ('freely', 'free'), ('free-form', 'free')]
REGIONS = [('the top left', 'top_left'), ('the top-left corner', 'top_left'), ('the top right', 'top_right'), ('the upper right corner', 'top_right'),
           ('the bottom left', 'bottom_left'), ('the lower left', 'bottom_left'), ('the bottom right', 'bottom_right'), ('the bottom-right corner', 'bottom_right'),
           ('the middle', 'middle'), ('the centre', 'center'), ('the center', 'center'), ('the top', 'top'), ('the bottom', 'bottom'),
           ('the left side', 'left'), ('the right side', 'right'), ('the left', 'left'), ('the right', 'right'), ('a corner', 'corner')]
RELATIONS = [('below', 'below'), ('under', 'below'), ('underneath', 'below'), ('above', 'above'), ('over', 'above'), ('on top of', 'above'),
             ('left of', 'left_of'), ('to the left of', 'left_of'), ('right of', 'right_of'), ('to the right of', 'right_of'), ('next to', 'next_to'),
             ('beside', 'next_to'), ('near', 'near'), ('close to', 'near')]
STYLES = [('dashed', 'dashed'), ('dotted', 'dotted'), ('solid', 'solid'), ('a dashed line', 'dashed'), ('dots', 'dotted'), ('a solid line', 'solid')]
ARROWS = [('one-way', 'forward'), ('pointing forward', 'forward'), ('with one arrowhead', 'forward'), ('two-way', 'both'), ('double-headed', 'both'),
          ('bidirectional', 'both'), ('with arrowheads at both ends', 'both'), ('arrows on both ends', 'both'), ('without arrowheads', 'none'),
          ('a plain line', 'none'), ('no arrowheads', 'none'), ('headless', 'none')]
CHART_TYPES = [('bar', 'bar'), ('line', 'line'), ('pie', 'pie'), ('doughnut', 'doughnut'), ('donut', 'doughnut'), ('radar', 'radar'),
               ('scatter', 'scatter'), ('polar area', 'polarArea')]
DIAGRAM_KINDS = [('diagram', 'diagram'), ('flowchart', 'flowchart'), ('flow chart', 'flowchart'), ('org chart', 'org_chart'), ('mind map', 'mind_map'),
                 ('process diagram', 'flowchart'), ('tree diagram', 'tree'), ('network diagram', 'network'), ('timeline', 'timeline'),
                 ('state machine', 'state_machine'), ('venn diagram', 'venn')]
NUMS = [('two', '2'), ('three', '3'), ('four', '4'), ('five', '5'), ('six', '6'), ('2', '2'), ('3', '3'), ('4', '4'), ('5', '5'), ('seven', '7'),
        ('eight', '8'), ('a couple of', '2'), ('a pair of', '2'), ('10', '10'), ('twelve', '12')]
NEW_LABELS = ['Intake', 'Validate input', 'Send email', 'Approved', 'Rejected', 'Ship order', 'Wait', 'Notify user', 'Log in', 'Store data',
              'Check stock', 'Pay', 'Retry later', 'Escalate', 'Close ticket', 'Analyse', 'Plan', 'Prototype', 'Ship it', 'Goal', 'Risk',
              'Customer', 'Order placed', 'Is it valid?', 'Yes', 'No', 'Maybe', 'Phase 2', 'Q3 target', 'Mobile app', 'Web app', 'Gateway']
LINK_LABELS = ['yes', 'no', 'next', 'on error', 'calls', 'uses', 'reads', 'writes', 'approved', 'rejected', 'retry', 'reports to', 'owns', 'then', 'later']
CHART_ROWS = [('North', 12), ('South', 30), ('East', 18), ('West', 9), ('Q1', 40), ('Q2', 55), ('Q3', 61), ('Q4', 48), ('Apples', 5), ('Pears', 8),
              ('Plums', 3), ('Mon', 4), ('Tue', 7), ('Wed', 6), ('Thu', 9), ('Fri', 2)]
CHART_NAMES = ['Sales by region', 'Monthly visitors', 'Quarterly revenue', 'Survey results', 'Team sizes', 'Fruit stock', 'Weekly tickets']


def article(word):
    return 'an' if word[:1].lower() in 'aeiou' else 'a'


def scene_with(rng, min_nodes=3, need_links=False, need_group=False, need_unique_kind=False, need_plural_kind=False, labelled=0.75):
    for _ in range(50):
        s = Scene(rng, size=rng.randint(max(min_nodes, 3), 6), labelled=labelled)
        if need_links and not s.links:
            continue
        if need_group and not s.groups:
            members = rng.sample([x['code'] for x in s.nodes], 2)
            s.groups.append({'code': 'g1', 'label': rng.choice(['Approval steps', 'Backend services', 'Team', 'Phase 1', 'Departments',
                                                                  'Checkout flow', 'Data layer', 'Leadership', 'Sprint', 'Core']), 'members': members})
        if need_unique_kind and not s.kinds_unique():
            continue
        if need_plural_kind and not s.kinds_plural():
            continue
        return s
    return s

THEMES = [('pastel', 'pastel'), ('dark', 'dark'), ('blueprint', 'blueprint'), ('monochrome', 'monochrome'), ('black and white', 'monochrome'),
          ('vivid', 'vivid'), ('ocean', 'ocean'), ('forest', 'forest'), ('sunset', 'sunset'), ('print', 'print'), ('printer-friendly', 'print'),
          ('flowchart', 'flowchart'), ('classic flowchart', 'flowchart'), ('night', 'dark'), ('colourful', 'vivid'), ('greyscale', 'monochrome')]
BY = [('level', 'level'), ('depth', 'level'), ('shape', 'shape'), ('type', 'shape'), ('role', 'role'), ('group', 'group'), ('cluster', 'group')]
DIRECTIONS = [('left to right', 'right'), ('from left to right', 'right'), ('rightwards', 'right'), ('top to bottom', 'down'), ('downwards', 'down'),
              ('top down', 'down'), ('bottom to top', 'up'), ('upwards', 'up'), ('bottom up', 'up'), ('right to left', 'left'), ('leftwards', 'left')]
SPACINGS = [('compact', 'compact'), ('tighter', 'compact'), ('closer together', 'compact'), ('dense', 'compact'), ('loose', 'loose'),
            ('more spread out', 'loose'), ('with more space', 'loose'), ('roomier', 'loose'), ('normal spacing', 'normal'), ('regular spacing', 'normal')]
ROUTES = [('straight', 'straight'), ('curved', 'curved'), ('curvy', 'curved'), ('orthogonal', 'orthogonal'), ('right-angled', 'orthogonal'),
          ('elbow', 'orthogonal'), ('angular', 'orthogonal'), ('rounded', 'curved')]
ROLES = [('start', 'start'), ('end', 'end'), ('decision', 'decision'), ('process', 'process'), ('data', 'data'), ('document', 'document'),
         ('subprocess', 'subprocess'), ('database', 'database'), ('input', 'input'), ('output', 'output'), ('finish', 'end'), ('terminal', 'end')]
EDGES = [('left', 'left'), ('to the left', 'left'), ('right', 'right'), ('on the right', 'right'), ('at the top', 'top'), ('top', 'top'),
         ('at the bottom', 'bottom'), ('bottom', 'bottom'), ('centre', 'centre'), ('center', 'centre'), ('in the middle', 'middle'),
         ('vertically centred', 'middle'), ('horizontally centred', 'centre')]
AXES = [('horizontally', 'horizontal'), ('vertically', 'vertical'), ('across', 'horizontal'), ('up and down', 'vertical'),
        ('along the width', 'horizontal'), ('from top to bottom', 'vertical')]
PATTERNS = [('in order', 'chain'), ('one after another', 'chain'), ('in a chain', 'chain'), ('in sequence', 'chain'), ('one by one', 'chain'),
            ('each to the next', 'chain'), ('in a loop', 'cycle'), ('in a circle', 'cycle'), ('in a cycle', 'cycle'), ('round in a ring', 'cycle'),
            ('to every other one', 'all'), ('all to all', 'all'), ('each with each other', 'all'), ('to each other', 'all'), ('like a star', 'star')]
NEW_SHAPES = [('rounded rectangle', 'rounded_rectangle'), ('pill', 'oval'), ('stadium', 'oval'), ('parallelogram', 'parallelogram'),
              ('cylinder', 'cylinder'), ('database', 'cylinder'), ('document', 'document'), ('cloud', 'cloud'), ('person', 'actor'), ('stick figure', 'actor'),
              ('actor', 'actor'), ('sticky note', 'note'), ('note', 'note'), ('chevron', 'chevron'), ('double rectangle', 'double_rectangle'), ('dot', 'dot')]
FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32']

CATEGORY_SETS = [['Q1', 'Q2', 'Q3', 'Q4'], ['North', 'South', 'East', 'West'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['Jan', 'Feb', 'Mar', 'Apr'],
                 ['Apples', 'Pears', 'Plums', 'Cherries'], ['Email', 'Phone', 'Chat'], ['Red team', 'Blue team', 'Green team'], ['2022', '2023', '2024']]
SERIES_NAMES = ['2024', '2025', 'Revenue', 'Costs', 'Target', 'Actual', 'Online', 'In store', 'Plan', 'Forecast']
CHART_TYPE_WORDS = [('bar chart', 'bar'), ('bars', 'bar'), ('pie chart', 'pie'), ('pie', 'pie'), ('line chart', 'line'), ('line graph', 'line'),
                    ('doughnut chart', 'doughnut'), ('donut', 'doughnut'), ('radar chart', 'radar'), ('scatter plot', 'scatter'), ('column chart', 'bar'),
                    ('polar area chart', 'polarArea')]
EFFECTS = [('a shadow', 'shadow'), ('drop shadows', 'shadow'), ('a gradient', 'gradient'), ('gradients', 'gradient'), ('a glow', 'glow'),
           ('rounded corners', 'rounded'), ('an animation', 'animation'), ('animated', 'animation'), ('some transparency', 'transparent'),
           ('see-through', 'transparent'), ('a 3D look', '3d'), ('3D', '3d'), ('an outline', 'outline'), ('a soft shadow', 'shadow')]
PALETTES = ['pastel', 'vivid', 'ocean', 'forest', 'sunset', 'monochrome', 'dark', 'warm', 'cool', 'rainbow']
