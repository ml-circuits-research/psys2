/*SCENARIOS-START*/
const SCENARIOS = [
  { id: 'star', title: 'One star', size: 'short', blurb: 'A single sentence: shape, size, color and a canvas position.', turns: [
    'Draw a huge gold star in the center.'
  ] },
  { id: 'traffic', title: 'Traffic light', size: 'short', blurb: 'Three circles stacked with relative positions, then joined with plain lines.', turns: [
    'Draw a large red circle named Stop at the top.',
    'Put a large yellow circle named Wait below Stop, then put a large green circle named Go below Wait.',
    'Connect Stop to Wait with a plain line. Connect Wait to Go with a plain line.',
    'What color is Go?'
  ] },
  { id: 'zoo', title: 'Shape zoo', size: 'short', blurb: 'One of every shape in one sentence, arranged in a row, then counted.', turns: [
    'Draw a red circle, an orange square, a yellow rectangle, a green triangle, a teal diamond, a blue ellipse, a purple hexagon and a pink star.',
    'Arrange everything in a row.',
    'How many shapes are there?'
  ] },
  { id: 'house', title: 'Little house', size: 'short', blurb: 'A picture composed from shapes, using exact coordinates and relative placement.', turns: [
    'Draw a huge brown square named Walls at 400, 300.',
    'Put a huge red triangle named Roof at 400, 182.',
    'Add a small navy rectangle named Door at 400, 337, labeled "door". Add a tiny cyan square named Window at 365, 280.',
    'Draw a large yellow circle in the top right. Add a white ellipse named Cloud in the top left.',
    'Add a large green circle named Tree at 190, 300. Add a small brown rectangle named Trunk at 190, 365.'
  ] },
  { id: 'login', title: 'Login flowchart', size: 'medium', blurb: 'A flowchart with a decision, labeled yes/no branches and a loop back.', turns: [
    'Draw a blue circle named Begin on the left, labeled "start".',
    'Add a rectangle named Form to the right of Begin labeled "Enter password" and connect Begin to it.',
    'Add a yellow diamond named Valid right of Form labeled "valid?" and connect Form to it.',
    'Put a green rectangle named Home right of Valid labeled "Dashboard". Connect Valid to Home with an arrow labeled "yes".',
    'Put a red rectangle named Error below Valid labeled "Show error". Connect Valid to Error with a dashed arrow labeled "no".',
    'Connect Error to Form with a dotted arrow labeled "retry".',
    'Is there a path from Begin to Home?',
    'Are there any cycles?'
  ] },
  { id: 'org', title: 'Org chart', size: 'medium', blurb: 'A hierarchy built top-down with "below", then queried for neighbours.', turns: [
    'Draw a large navy rectangle named CEO at the top, labeled "CEO".',
    'Add a teal rectangle named CTO below CEO labeled "CTO". Add a teal rectangle named CFO left of CTO labeled "CFO". Add a teal rectangle named COO right of CTO labeled "COO".',
    'Connect CEO to CTO, CFO and COO with plain lines.',
    'Add a small gray rectangle named Dev below CTO labeled "Dev". Add a small gray rectangle named Ops right of Dev labeled "Ops".',
    'Connect CTO to Dev and Ops with plain lines.',
    'What is connected to CTO?',
    'Which shape has the most connections?'
  ] },
  { id: 'solar', title: 'Solar system', size: 'medium', blurb: 'A huge sun, planets placed around it, then spatial questions.', turns: [
    'Draw a huge gold circle named Sun in the center.',
    'Add a tiny gray circle named Mercury right of Sun. Add a small orange circle named Venus left of Sun.',
    'Add a small blue circle named Earth above Sun. Add a small red circle named Mars below Sun.',
    'Add a large brown circle named Jupiter in the top right. Add a large yellow circle named Saturn in the bottom left with a gold outline.',
    'Connect Sun to Mercury, Venus, Earth and Mars with dotted lines.',
    'Which circle is closest to Jupiter?',
    'Which shape is the biggest?',
    'Is Earth above Mars?'
  ] },
  { id: 'states', title: 'Player state machine', size: 'medium', blurb: 'States and transitions with labels; reachability and cycles go through Datalog.', turns: [
    'Draw a gray ellipse named Idle on the left, labeled "idle".',
    'Add a green ellipse named Playing right of Idle labeled "playing". Add a yellow ellipse named Paused below Playing labeled "paused". Add a red ellipse named Ended right of Playing labeled "ended".',
    'Connect Idle to Playing with an arrow labeled "play".',
    'Connect Playing to Paused with an arrow labeled "pause". Connect Paused to Playing with a dashed arrow labeled "resume".',
    'Connect Playing to Ended with an arrow labeled "finish".',
    'What can be reached from Idle?',
    'Are there any cycles?',
    'Is there a path from Ended to Idle?'
  ] },
  { id: 'network', title: 'Office network', size: 'long', blurb: 'A long build: devices, two-way links, a default rule, a fact, then graph questions.', turns: [
    'Draw a large white ellipse named Internet on the left, labeled "Internet".',
    'Add a red hexagon named Firewall right of Internet labeled "FW" and connect Internet to it with a two-way arrow.',
    'Add a purple hexagon named Router right of Firewall labeled "core" and connect Firewall to Router with a two-way arrow.',
    'From now on, rectangles are teal.',
    'Add a rectangle named SwitchA at 520, 150 labeled "switch A". Add a rectangle named SwitchB at 520, 350 labeled "switch B".',
    'Connect Router to SwitchA and SwitchB.',
    'Add a small blue square named Laptop at 690, 90 labeled "laptop". Add a small blue square named Printer below Laptop labeled "printer".',
    'Add a small green square named Server at 690, 300 labeled "db". Add a small green square named Backup at 690, 440 labeled "backup".',
    'Connect SwitchA to Laptop and Printer. Connect SwitchB to Server and Backup.',
    'Connect Server to Backup with a dashed red arrow labeled "nightly".',
    'Make all squares a bit bigger.',
    'Printer is gray.',
    'Move Router up by 30.',
    'Is there a path from Internet to Backup?',
    'Can I get from Laptop to Server?',
    'What can be reached from SwitchB?',
    'Which shape has the most connections?',
    'How many connections are there?',
    'Describe Router.'
  ] },
  { id: 'story', title: 'Edit session', size: 'long', blurb: 'A messy session: build, change your mind, rename, undo, ask, tidy up.', turns: [
    'Draw a blue circle named A and a red square named B right of it.',
    'Add a green triangle named C below A and connect A to it.',
    'Connect B to C with a dashed line.',
    'Actually make A orange and give it a black border.',
    'Rename C to Leaf.',
    'Swap A and B.',
    'Undo.',
    'Duplicate B.',
    'What is connected to Leaf?',
    'Is A left of B?',
    'Add two small pink stars above A.',
    'Delete the pink stars.',
    'Arrange everything in a grid.',
    'Describe the diagram.'
  ] }
];
if (typeof module !== 'undefined') module.exports = SCENARIOS;
/*SCENARIOS-END*/
