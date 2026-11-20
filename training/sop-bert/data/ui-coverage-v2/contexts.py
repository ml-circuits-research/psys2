"""Named model contexts (context.existing) for the authored seeds: the objects a tab shows, with the human names people use.
No slot ids: the avatar's parts carry their w.face words; diagram nodes, links and groups carry their visible labels."""

CONTEXTS = {
    # ------------------------------------------------------------------ Drawing
    'drawing.scene': [
        {'kind': 'house', 'name': 'House'}, {'kind': 'tree', 'name': 'Old oak'}, {'kind': 'lake', 'name': 'Lake'},
        {'kind': 'sun', 'name': 'Sun'}, {'kind': 'car', 'name': 'Red car'}, {'kind': 'cloud', 'name': 'Cloud'},
        {'kind': 'road', 'name': 'Road'}, {'kind': 'boat', 'name': 'Sailboat'}, {'kind': 'mountain', 'name': 'Mountain'},
    ],
    'drawing.empty': [],
    'drawing.shapes': [
        {'kind': 'circle', 'name': 'Circle'}, {'kind': 'square', 'name': 'Square'}, {'kind': 'triangle', 'name': 'Triangle'},
        {'kind': 'star', 'name': 'Gold star'}, {'kind': 'heart', 'name': 'Heart'},
    ],
    'drawing.groups': [
        {'kind': 'group', 'name': 'Farm'}, {'kind': 'house', 'name': 'Farmhouse'}, {'kind': 'house', 'name': 'Barn'},
        {'kind': 'tree', 'name': 'Apple tree'}, {'kind': 'field', 'name': 'Wheat field'}, {'kind': 'dog', 'name': 'Dog'},
    ],
    'drawing.parts': [
        {'kind': 'house', 'name': 'House'}, {'kind': 'roof', 'name': 'roof of the house'}, {'kind': 'door', 'name': 'door of the house'},
        {'kind': 'window', 'name': 'window of the house'}, {'kind': 'chimney', 'name': 'chimney of the house'},
        {'kind': 'car', 'name': 'Red car'}, {'kind': 'wheel', 'name': 'front wheel of the car'}, {'kind': 'tree', 'name': 'Old oak'},
        {'kind': 'trunk', 'name': 'trunk of the tree'}, {'kind': 'crown', 'name': 'leaves of the tree'},
    ],
    # ------------------------------------------------------------------ Diagram
    'diagram.flow': [
        {'kind': 'rectangle', 'name': 'Start'}, {'kind': 'diamond', 'name': 'Approved?'}, {'kind': 'rectangle', 'name': 'Review'},
        {'kind': 'rectangle', 'name': 'Publish'}, {'kind': 'circle', 'name': 'Done'}, {'kind': 'text', 'name': 'Note'},
        {'kind': 'arrow', 'name': 'arrow from Start to Review'}, {'kind': 'arrow', 'name': 'arrow from Review to Approved?'},
        {'kind': 'arrow', 'name': 'arrow from Approved? to Publish'}, {'kind': 'arrow', 'name': 'arrow from Publish to Done'},
        {'kind': 'group', 'name': 'Approval steps'},
    ],
    'diagram.org': [
        {'kind': 'rectangle', 'name': 'CEO'}, {'kind': 'rectangle', 'name': 'Sales'}, {'kind': 'rectangle', 'name': 'Marketing'},
        {'kind': 'rectangle', 'name': 'Engineering'}, {'kind': 'ellipse', 'name': 'Support'},
        {'kind': 'arrow', 'name': 'arrow from CEO to Sales'}, {'kind': 'arrow', 'name': 'arrow from CEO to Engineering'},
        {'kind': 'group', 'name': 'Departments'}, {'kind': 'group', 'name': 'Leadership'},
    ],
    'diagram.charts': [
        {'kind': 'chart', 'name': 'Sales by region'}, {'kind': 'chart', 'name': 'Monthly visitors'},
        {'kind': 'group', 'name': 'Quarterly revenue'}, {'kind': 'group', 'name': 'Survey results'},
        {'kind': 'rectangle', 'name': 'North'}, {'kind': 'rectangle', 'name': 'South'},
    ],
    'diagram.empty': [],
    # ------------------------------------------------------------------ Calendar
    'calendar.week': [
        {'kind': 'calendar', 'name': 'Work'}, {'kind': 'calendar', 'name': 'Family'}, {'kind': 'calendar', 'name': 'Gym'},
        {'kind': 'person', 'name': 'Ana'}, {'kind': 'person', 'name': 'Mihai'}, {'kind': 'person', 'name': 'Lee'}, {'kind': 'person', 'name': 'Priya'},
        {'kind': 'room', 'name': 'Cedar room'}, {'kind': 'room', 'name': 'Board room'}, {'kind': 'room', 'name': 'Focus pod'},
        {'kind': 'meeting', 'name': 'Weekly review'}, {'kind': 'meeting', 'name': 'Budget sync'}, {'kind': 'meeting', 'name': 'Design critique'},
        {'kind': 'event', 'name': 'Dentist'}, {'kind': 'event', 'name': 'Lunch with Sam'}, {'kind': 'event', 'name': 'Yoga'},
    ],
    'calendar.empty': [{'kind': 'calendar', 'name': 'Work'}],
    # ------------------------------------------------------------------ Documents
    'document.notes': [
        {'kind': 'document', 'name': 'Project notes'}, {'kind': 'chapter', 'name': 'Introduction'}, {'kind': 'subchapter', 'name': 'Goals'},
        {'kind': 'paragraph', 'name': 'Intro'}, {'kind': 'paragraph', 'name': 'Background'}, {'kind': 'quote', 'name': 'Customer quote'},
        {'kind': 'chapter', 'name': 'Plan'}, {'kind': 'subchapter', 'name': 'Timeline'}, {'kind': 'list', 'name': 'To-do list'},
        {'kind': 'list', 'name': 'Shopping list'}, {'kind': 'table', 'name': 'Budget'}, {'kind': 'heading', 'name': 'Risks'},
        {'kind': 'chapter', 'name': 'Conclusion'}, {'kind': 'paragraph', 'name': 'Summary'},
    ],
    'document.empty': [],
    # ------------------------------------------------------------------ Avatar
    'avatar.face': [
        {'kind': 'avatar', 'name': 'Avatar'}, {'kind': 'hair', 'name': 'fringe'}, {'kind': 'back hair', 'name': 'ponytail'},
        {'kind': 'eyes', 'name': 'eyes'}, {'kind': 'eyebrows', 'name': 'brows'}, {'kind': 'nose', 'name': 'nose'},
        {'kind': 'mouth', 'name': 'lips'}, {'kind': 'ears', 'name': 'ears'}, {'kind': 'glasses', 'name': 'round glasses'},
        {'kind': 'hat', 'name': 'cap'}, {'kind': 'earrings', 'name': 'hoop earrings'}, {'kind': 'cheeks', 'name': 'freckles'},
        {'kind': 'beard', 'name': 'stubble'}, {'kind': 'moustache', 'name': 'moustache'}, {'kind': 'head', 'name': 'head'},
        {'kind': 'neck', 'name': 'neck'}, {'kind': 'shoulders', 'name': 'shirt'},
    ],
}

DEFAULT = {'drawing': 'drawing.scene', 'diagram': 'diagram.flow', 'calendar': 'calendar.week', 'document': 'document.notes', 'avatar': 'avatar.face'}
