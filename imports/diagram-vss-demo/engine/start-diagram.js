/* The drawing the page opens with (and every reload): three levels, written as SOP Lang wires that the engine runs like any message.
     level 0, background: Backdrop, a faint navy panel under everything (layer=background: never an obstacle when placing new shapes)
     level 1, zones:      IntakeZone and ReviewZone, light panels (layer=zone) that hold the items
     level 2, items:      Start, Process, Check, Done (the shapes the help pages' examples use) and their arrows
     level 3, texts:      the title "Order flow" and one caption per zone (free text items, shape=text)
   The zones and their items form two groups, Intake and Review, so a group moves, copies and changes z-order as one block. The order of
   the wires is the z-order (back to front), which the z-order tests check: training/sketch/test_start_diagram.mjs.
   A re-layout of the whole drawing ("tidy up", "arrange all in a circle") lays the four shapes out as one set, across the zones; the texts
   stay put or move aside, and the reply names the shapes taken off their zone (logic.js alRun; HIGH_LEVEL_OPS.md section 2, "Zones and
   free texts"). The zones and the background draw no name tag and a group's name goes where nothing else is (ui.js, logic.js
   groupLabels), so nothing drawn overlaps (test_start_diagram.mjs section 7).
   Design: training/sketch/legend_ext/LEGEND_EXT.md section 5. */
(function (root) {
'use strict';
const WIRES = [
  '@bg command action=create shape=rectangle name=Backdrop color=navy fill=faint layer=background width=780 height=464 at=400,258',
  '@z1 command action=create shape=rectangle name=IntakeZone color=blue fill=light layer=zone width=330 height=330 at=200,290',
  '@z2 command action=create shape=rectangle name=ReviewZone color=green fill=light layer=zone width=370 height=330 at=575,290',
  '@s1 command action=create shape=circle name=Start color=blue size=large at=110,245',
  '@s2 command action=create shape=rectangle name=Process label="Validate" at=280,245',
  '@s3 command action=create shape=diamond name=Check color=yellow label="ok?" at=480,245',
  '@s4 command action=create shape=circle name=Done color=green at=480,375',
  '@t1 command action=create shape=text name=MainTitle label="Order flow" size=large color=navy at=400,58',
  '@t2 command action=create shape=text name=IntakeCaption label="1 · receive" size=small color=blue at=200,152',
  '@t3 command action=create shape=text name=ReviewCaption label="2 · review" size=small color=green at=575,152',
  '@e1 command action=connect from=Start to=Process',
  '@e2 command action=connect from=Process to=Check',
  '@e3 command action=connect from=Check to=Done style=dashed label="yes"',
  '@g1 command action=group target=IntakeZone,Start,Process,IntakeCaption name=Intake',
  '@g2 command action=group target=ReviewZone,Check,Done,ReviewCaption name=Review'
];
/* the level of each item (0 background, 1 zone, 2 item, 3 text): the z-order must not decrease along the wires */
const LEVELS = { Backdrop: 0, IntakeZone: 1, ReviewZone: 1, Start: 2, Process: 2, Check: 2, Done: 2, MainTitle: 3, IntakeCaption: 3, ReviewCaption: 3 };
/* sent after the drawing, as the first message of the conversation (read by every reader) */
const MESSAGES = ['Is there a path from Start to Done?'];
const StartDiagram = { WIRES, SOP: WIRES.join('\n'), LEVELS, MESSAGES, GROUPS: { Intake: ['IntakeZone', 'Start', 'Process', 'IntakeCaption'], Review: ['ReviewZone', 'Check', 'Done', 'ReviewCaption'] } };
if (typeof module !== 'undefined') module.exports = StartDiagram; else root.StartDiagram = StartDiagram;
})(typeof window !== 'undefined' ? window : this);
