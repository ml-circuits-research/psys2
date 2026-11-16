/* "How it works inside": the architecture pages of the Help overlay (docs/js/docs.js, #help/<id>) and of the standalone page
   docs/architecture.html, which renders these same pages one after another. This file is the only copy of the text: change a page here and
   both places change. Links between pages are written as href="#help/<id>" (or "#help/<id>/<anchor>"); architecture.html rewrites them to
   its own anchors. Every number names the document or the command that produced it. State described: main at 1f3c806, 2026-11-02. */
(function (root) {
'use strict';
const AS_OF = '2026-11-02 (main at 1f3c806)';
const AH = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ahead" d="M0,0 L10,5 L0,10 z"/></marker></defs>';

const pages = [];
const page = (id, title, html, lead) => pages.push({ id, title, lead, html });

/* ============================================================ overview */
page('architecture', 'Overview', `
<p>A person types a message in English. A spell checker corrects near-miss words. The message is then <b>cut once</b> into requests, by
one of three cutters chosen in Settings, and three independent <b>readers</b> each turn those same requests into the same small language,
<b>SOP Lang</b> (one line per request, called a <i>wire</i>). Each reader has its own copy of the same engine and its own drawing, so the
three results can be compared side by side. The engine carries out the wires through plugins; graph and logic questions are answered by
a small Datalog evaluator inside the engine. Everything runs in the browser: nothing is sent to a server.</p>

<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 560" role="img" aria-labelledby="d1t">
<title id="d1t">Overall flow: message, spell checker, one cut for all readers, three readers, SOP Lang wires, engine with Datalog, one drawing per reader</title>
${AH}
<rect class="box" x="80" y="8" width="240" height="40" rx="8"/>
<text class="t" x="200" y="25" text-anchor="middle">A message in English</text>
<text class="s" x="200" y="40" text-anchor="middle">“draw a red circle and link it to Start”</text>
<path class="ar" d="M200 48 V66"/>
<rect class="box" x="90" y="68" width="220" height="40" rx="8"/>
<text class="t" x="200" y="85" text-anchor="middle">Spell checker (VSA)</text>
<text class="m" x="200" y="100" text-anchor="middle">docs/js/spell.js</text>
<path class="ar" d="M200 108 V126"/>
<rect class="mod" x="30" y="128" width="340" height="56" rx="8"/>
<text class="t" x="200" y="146" text-anchor="middle">Cut into requests, once (a setting)</text>
<text x="200" y="162" text-anchor="middle">Rules segmenter · VSS cutter (default) · BERT cutter</text>
<text class="s" x="200" y="177" text-anchor="middle">every reader reads the same units</text>
<path class="ar" d="M200 184 V198 H68 V214"/>
<path class="ar" d="M200 184 V214"/>
<path class="ar" d="M200 184 V198 H332 V214"/>
<rect class="acc" x="8" y="216" width="120" height="96" rx="8"/>
<text class="t" x="68" y="235" text-anchor="middle">Rules</text>
<text class="m" x="68" y="250" text-anchor="middle">logic.js</text>
<text x="68" y="268" text-anchor="middle">hand-written code</text>
<text x="68" y="283" text-anchor="middle">legend cue words</text>
<text x="68" y="298" text-anchor="middle">no model</text>
<rect class="acc" x="140" y="216" width="120" height="96" rx="8"/>
<text class="t" x="200" y="235" text-anchor="middle">VSS</text>
<text class="m" x="200" y="250" text-anchor="middle">vss-composer.js</text>
<text x="200" y="268" text-anchor="middle">7 micro-worlds</text>
<text x="200" y="283" text-anchor="middle">event hint</text>
<text x="200" y="298" text-anchor="middle">context filler</text>
<rect class="acc" x="272" y="216" width="120" height="96" rx="8"/>
<text class="t" x="332" y="235" text-anchor="middle">Neural</text>
<text class="m" x="332" y="250" text-anchor="middle">neural.js</text>
<text x="332" y="268" text-anchor="middle">SOP-BERT</text>
<text x="332" y="283" text-anchor="middle">one DistilBERT</text>
<text x="332" y="298" text-anchor="middle">with small heads</text>
<path class="ar" d="M68 312 V330 H160 V346"/>
<path class="ar" d="M200 312 V346"/>
<path class="ar" d="M332 312 V330 H240 V346"/>
<rect class="box" x="30" y="348" width="340" height="56" rx="8"/>
<text class="t" x="200" y="366" text-anchor="middle">SOP Lang wires (the same language for all three)</text>
<text class="m" x="200" y="382" text-anchor="middle">@s1 command action=create shape=circle color=red</text>
<text class="m" x="200" y="396" text-anchor="middle">@s2 command action=connect from=$s1 to=Start</text>
<path class="ar" d="M200 404 V422"/>
<rect class="box" x="30" y="424" width="340" height="62" rx="8"/>
<text class="t" x="200" y="442" text-anchor="middle">Engine + plugins (logic.js)</text>
<text x="200" y="459" text-anchor="middle">the legend: the hand-written spec of the language</text>
<text x="200" y="475" text-anchor="middle">mentions resolved on the canvas · Datalog</text>
<path class="ar" d="M200 486 V498 H68 V512"/>
<path class="ar" d="M200 486 V512"/>
<path class="ar" d="M200 486 V498 H332 V512"/>
<rect class="box" x="8" y="514" width="120" height="40" rx="8"/>
<text class="t" x="68" y="531" text-anchor="middle">Rules drawing</text>
<text class="s" x="68" y="546" text-anchor="middle">own world, undo</text>
<rect class="box" x="140" y="514" width="120" height="40" rx="8"/>
<text class="t" x="200" y="531" text-anchor="middle">VSS drawing</text>
<text class="s" x="200" y="546" text-anchor="middle">own world, undo</text>
<rect class="box" x="272" y="514" width="120" height="40" rx="8"/>
<text class="t" x="332" y="531" text-anchor="middle">Neural drawing</text>
<text class="s" x="332" y="546" text-anchor="middle">own world, undo</text>
</svg>
</div>
<figcaption>Figure 1. The whole flow in the browser. Every message goes to every loaded reader (<code>docs/js/ui.js</code>, <code>READERS</code>,
each with <code>K.createSystem()</code>). The cut is described in <a href="#help/cutting">One cut for all readers</a>.</figcaption>
</figure>

<h2 id="judged">How the readers are judged</h2>
<p>The main number of every reader is its <b>precision of execution</b>: of everything it executes, the share done right. Each reader is to
execute a request only when its own confidence clears a threshold chosen on held-out data, and to ask below it, saying why; readers are
compared by the share of requests they do right at equal precision (owner, 2026-11-02; AGENTS.md). In the demo described here no reader has
such a threshold yet: that is in progress. <a href="#help/measurement">Measurement and current numbers</a>,
<a href="#help/research-question">What this project measures</a>.</p>

<h2 id="parts">The parts, their code and their models</h2>
<div class="tw"><table>
<thead><tr><th>Part</th><th>Code</th><th>Models it loads</th><th class="num">Size</th></tr></thead>
<tbody>
<tr><td>Page, tabs, chat, canvas, help</td><td><code>docs/index.html</code>, <code>docs/js/ui.js</code>, <code>docs/js/help.js</code>, <code>docs/js/docs.js</code>, <code>docs/js/docs-concepts.js</code>, <code>docs/js/docs-arch.js</code>, <code>docs/js/scenarios.js</code></td><td>none</td><td class="num">—</td></tr>
<tr><td>Spell checker</td><td><code>docs/js/spell.js</code></td><td><code>docs/model/spell/vocab.json</code></td><td class="num">28.0 KB</td></tr>
<tr><td>Rules reader, SOP Lang, engine, plugins, Datalog</td><td><code>docs/js/logic.js</code></td><td>none</td><td class="num">—</td></tr>
<tr><td>The shared cut</td><td><code>docs/js/vss-composer.js</code> (<code>cutUnits</code>, <code>CUT_STRATEGIES</code>, <code>DEFAULT_CUT</code>), <code>docs/js/vss-formalizer.js</code> (<code>cut</code>)</td><td>the cutter of the strategy chosen</td><td class="num">—</td></tr>
<tr><td>VSS reader (composer)</td><td><code>docs/js/vss-formalizer.js</code>, <code>docs/js/vss-composer.js</code>, <code>docs/js/front.js</code>, <code>docs/js/vss.js</code> + <code>docs/js/vss/</code>, <code>docs/js/vss-context.js</code>, <code>docs/js/vss-adapter.js</code></td><td><code>docs/model/micro/registry.json</code> and what it names: 2 cutters, 7 worlds, <code>docs/model/context/weights.json</code></td><td class="num">38.0 MB</td></tr>
<tr><td>Neural reader</td><td><code>docs/js/neural.js</code> (transformers.js 3.8.1 from jsDelivr)</td><td><code>docs/model/neural/sop-bert/</code> (one DistilBERT, 8-bit)</td><td class="num">68.5 MB</td></tr>
<tr><td>Benchmark (scoring)</td><td><code>docs/js/bench-canon.js</code></td><td><code>docs/bench/</code> (6 sets)</td><td class="num">—</td></tr>
</tbody></table></div>
<p class="note">Sizes: <code>du -sb</code> and <code>versions.json</code> “sizes” on 2026-11-02, MB = 10<sup>6</sup> bytes. The VSS figure is the 7 world folders (35.6 MB), the two
cutters the registry names (2.4 MB), the context weights and the registry.</p>

<h2 id="inside-pages">The pages of this part</h2>
<ul class="pagelist">
<li><a href="#help/engine">The engine and the legend</a>: wires, the legend, the plugins, Datalog.</li>
<li><a href="#help/rules-reader">The Rules reader</a>: hand-written, and what it is good and bad at.</li>
<li><a href="#help/vss-reader">The VSS reader</a>: the composer, its cutters, the 7 worlds, the context filler, the adapter.</li>
<li><a href="#help/neural-reader">The Neural reader</a>: SOP-BERT, one fine-tuned DistilBERT with small heads.</li>
<li><a href="#help/cutting">One cut for all readers</a>: the three cutters and what they cost each reader.</li>
<li><a href="#help/spelling">The spell checker</a>, <a href="#help/models">Models and versions</a>, <a href="#help/data">Data</a>,
<a href="#help/training">Training and the GPU runner</a>, <a href="#help/measurement">Measurement and current numbers</a>,
<a href="#help/repository">Repository map</a>, <a href="#help/planned">In progress</a>.</li>
</ul>
<p class="note">Described: the system as committed on ${AS_OF}. Names in <code>code</code> are file, function and field names you can search for.
Plans are only in <a href="#help/planned">In progress</a>, and are labelled there. The same pages as one long page: <a href="architecture.html">architecture.html</a>.</p>
`, 'How the editor turns a message into a drawing: the parts, where their code and models are, how they are trained and measured.');

/* ============================================================ engine */
page('engine', 'The engine and the legend', `
<p><b>A wire</b> is one line: <code>@id type key=value key=value …</code>. Wires are single-assignment: a wire is defined once and a later
wire refers to it as <code>$id</code> (the parser rejects a reference to a wire not yet defined). A value can be a list
(<code>from=A,B</code>) or a quoted string. Parser and serializer: <code>parse</code> and <code>serialize</code> in <code>docs/js/logic.js</code>
(section 1 of that file). The user’s view of the language: <a href="#help/sop-lang">SOP Lang</a>.</p>
<p>The Rules reader turns <i>“Draw a red circle named Hub below Start and connect Start to it. How many circles are there?”</i> into:</p>
<pre><code>@s1 command action=create shape=circle color=red name=Hub position=below anchor=Start
@s2 command action=connect from=Start to=$s1
@s3 question ask=count shape=circle</code></pre>

<h2 id="wire-types">Wire types (5)</h2>
<div class="tw"><table>
<thead><tr><th>Type</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>command</code></td><td>Something the user wants done (key <code>action</code>: 21 values).</td></tr>
<tr><td><code>question</code></td><td>Something the user wants to know (key <code>ask</code>: 17 values). Never changes the drawing.</td></tr>
<tr><td><code>fact</code></td><td>A statement that should hold in the world (“Start is red”).</td></tr>
<tr><td><code>rule</code></td><td>A default that applies to future shapes (“from now on circles are orange”).</td></tr>
<tr><td><code>mention</code></td><td>A description that must resolve to existing shapes (“the red circle”, “all stars that are not blue”). The engine resolves it against the canvas when it executes; no reader needs the drawing.</td></tr>
</tbody></table></div>

<h2 id="legend">The legend: the single hand-written spec</h2>
<p>The <b>legend</b> is the set of <i>questions</i> a wire can answer (its keys) and, for each, its allowed <i>values</i>. Plugins declare
it with <code>legend.define(plugin, key, spec)</code> (class <code>Legend</code> in <code>docs/js/logic.js</code>): <code>ask</code> (the
question in words), <code>kind</code> (<code>enum</code>, <code>number</code>, <code>text</code>, …) and, for enums, each value with its cue
words (<code>SHAPE_VALUES</code>, <code>COLOR_VALUES</code>, …). <code>action</code> has 21 values (create, delete, move, set, resize, rename,
label, duplicate, swap, group, ungroup, connect, disconnect, align, arrange, distribute, toFront, toBack, undo, redo, forget); <code>ask</code>
has 17 (count, list, exists, property, check, describe, neighbors, connected, degree, nearest, extreme, path, reachable, cycle, members,
groupOf, rules). Counted in node from <code>createSystem()</code> on 2026-11-02.</p>
<p class="callout">AGENTS.md: the legend is the only hand-written input of a learned reader. The VSS worlds and SOP-BERT learn every mapping
from words to the legend (verbs, values, how to cut) from the annotated data; hand-written word tables are allowed only in the Rules reader.</p>
<p>The help pages <a href="#help/sop-lang">SOP Lang</a> and <a href="#help/capabilities">Capabilities</a> (<code>docs/js/help.js</code>) are
generated at run time from this legend and the plugin list, so they cannot drift from the engine.</p>

<h2 id="plugins">Plugins = capabilities (11)</h2>
<p>The <code>Engine</code> holds a list of plugins. Each plugin adds wire types, legend keys and <i>handlers</i>; a wire is executed by the
enabled handler whose type and <code>when</code> pattern match its arguments (higher <code>priority</code> first, then the more specific
pattern). A message’s wires run in order as one undo step (<code>Engine.run</code>); each wire is applied whole or not at all, a wire that
fails is reported and the wires that depend on it are skipped, the others still run. A plugin can be switched off (Settings › Capabilities);
the switch applies to every reader, and a wire that needs that plugin then fails with a message naming it.</p>
<div class="tw"><table>
<thead><tr><th>Plugin (<code>name</code>)</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>core</code> (locked)</td><td>The wire types; the shared keys (target, quantifier, count, name, notColor, recency); the mention resolver that turns “the red circle” into named shapes.</td></tr>
<tr><td><code>history</code></td><td>undo, redo (they step over the last executed action, including one of the same message); the key <code>action</code>.</td></tr>
<tr><td><code>shapes</code></td><td>create, delete, move, set, resize, rename, label, duplicate, swap; shape, colour, outline, size, label, position, anchor, direction, distance.</td></tr>
<tr><td><code>groups</code></td><td>group, ungroup; questions members, groupOf (and list / count / exists of groups); a group moves, copies, aligns and is deleted as one.</td></tr>
<tr><td><code>connections</code></td><td>connect, disconnect; keys from, to, style, arrow, pairing (one-to-many, chain).</td></tr>
<tr><td><code>layout</code></td><td>align, distribute, arrange, toFront, toBack; keys axis, layout.</td></tr>
<tr><td><code>queries</code></td><td>Question handlers in JavaScript: count, list, exists, property, check, describe, neighbors, connected, degree, nearest, extreme.</td></tr>
<tr><td><code>reasoning</code> “Graph reasoning (Datalog)”</td><td>Lowers the connection graph to Datalog facts plus recursive rules: path, reachable, cycle.</td></tr>
<tr><td><code>logic</code> “Logic reasoner (Datalog)”, priority 10</td><td>Lowers the whole drawing to Datalog facts and compiles a question wire (count, list, exists, check, neighbors, connected, path, reachable, cycle) into a query from its legend answers. Switched off, the <code>queries</code> and <code>reasoning</code> handlers answer instead.</td></tr>
<tr><td><code>rules</code> “Default rules”</td><td>rule wires (“from now on circles are orange” fills answers left out at create), forget, and the question <code>ask=rules</code>.</td></tr>
<tr><td><code>facts</code> “Facts as constraints”</td><td>fact wires: already true means no change; otherwise the world is adjusted until the statement holds.</td></tr>
</tbody></table></div>
<p class="note">Datalog: <code>datalog(facts, rules)</code>, a naive fixpoint evaluator, and <code>lowerDatalog</code> (shows the lowering in a
reply’s details), both in <code>docs/js/logic.js</code>.</p>
`, 'SOP Lang wires, the legend that defines them, and the plugins that carry them out.');

/* ============================================================ rules */
page('rules-reader', 'The Rules reader', `
<p>Code: <code>makeFormalizer(engine)</code> in <code>docs/js/logic.js</code> (section 6 of that file). Hand-written, deterministic, instant.</p>
<ol>
  <li><b>Spelling:</b> a word close (OSA edit distance 1, or 2 for words of 7+ letters) to a legend cue word or a canvas name is replaced; names
  introduced by “named / called” and quoted text are left alone. (This runs in addition to the VSA <a href="#help/spelling">spell checker</a>.)</li>
  <li><b>Cut:</b> when the Rules segmenter is the chosen cut: sentences are split at <code>. ! ? ;</code>; a sentence is split again at a comma or
  an “and” that stands right before a verb cue (<code>SPLIT_VERB</code>), coordinated names, one clause per created object. With another cut,
  the Rules reader reads the units it is given (<code>formalize(text, ctx, {units})</code>). See <a href="#help/cutting">One cut for all readers</a>.</li>
  <li><b>Reading:</b> regular expressions over the legend’s cue words (shapes, colours, sizes, actions, positions) and their order. The cue
  words are the hand-written cues of the legend’s values (<code>SHAPE_VALUES</code>, <code>COLOR_VALUES</code>, … in <code>docs/js/logic.js</code>).</li>
</ol>
<p><b>Fair comparison rule</b> (AGENTS.md): Rules and VSS use the same legend and the same cue list
(<code>training/sketch/export_cues.mjs</code> → <code>training/sketch/make_normalizer.py</code>); a cue added for one is added for both, and only from training data.</p>

<h2 id="rules-measured">What it is good and bad at (measured)</h2>
<div class="tw"><table>
<thead><tr><th>Data</th><th>Cut</th><th class="num">Requests</th><th class="num">Right / wrong / not done (%)</th><th class="num">Extra</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Demo short sets, all six</td><td>Rules</td><td class="num">1140</td><td class="num">97.5 / 0.5 / 1.9</td><td class="num">16</td><td><code>CUT_SHARED.md</code></td></tr>
<tr><td>Demo short sets, all six</td><td>VSS</td><td class="num">1140</td><td class="num">87.7 / 1.8 / 10.4</td><td class="num">17</td><td>same</td></tr>
<tr><td>Short sets written by hand (hand, blind, broad)</td><td>Rules</td><td class="num">240</td><td class="num">92.1 / 1.7 / 6.2</td><td class="num">—</td><td><code>SHORT.md</code> §1</td></tr>
<tr><td>Fixed 1000-message sample (long messages)</td><td>Rules</td><td class="num">4858</td><td class="num">67.9 / 16.8 / 15.3</td><td class="num">821</td><td><code>CUT_SHARED.md</code></td></tr>
<tr><td>Fixed 1000-message sample</td><td>VSS (the default)</td><td class="num">4858</td><td class="num">73.6 / 11.9 / 14.5</td><td class="num">406</td><td>same</td></tr>
</tbody></table></div>
<p>Good at: short commands that use its words; the three generated sets come from <code>training/sketch/generate.py</code> templates whose words
the rules were written with, so the fair short-set figure is the 240 hand-written requests. Bad at: long, natural messages. With its own cut
it does about one request in six wrong and makes over 800 requests nobody asked for: its segmenter cuts text that is not a request into units
(1202 extra units on the sample, <code>CUT_SHARED.md</code>). Read through the VSS cut, the same rules make a third fewer wrong requests and half
the extras. Why this matters: <a href="#help/rules-vs-learned">What rules do well, and where they fail</a>.</p>
<p class="note">SHORT.md §1 gives 67.6 / 16.9 / 15.5, extra 806, for the Rules reader on the sample; every later run gives 67.9 / 16.8 / 15.3,
extra 821. The difference is not explained: both Rules commits since then report unchanged scores.</p>
`, 'Hand-written code over the legend’s cue words: instant, exact on short commands, weak on long natural messages.');

/* ============================================================ VSS */
page('vss-reader', 'The VSS reader', `
<p>VSS = vector-symbolic. The VSS reader is not one model: it is a <b>composer</b> of small models, built in
<code>docs/js/vss-composer.js</code> (class <code>Composer</code>, <code>loadComposer</code>) from <code>docs/model/micro/registry.json</code>,
and loaded when the page opens by <code>docs/js/vss-formalizer.js</code> (<code>loadComposerAt</code>, versioned URLs). It has <b>two
cutters</b>: the world cutter cuts and names candidate worlds; the event cutter only gives a hint. The idea behind it, and why it is built
this way: <a href="#help/vss-worlds">What a VSS world is</a>.</p>

<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 676" role="img" aria-labelledby="d2t">
<title id="d2t">The VSS composer: tokenize, world cutter and event cutter, three candidate worlds per unit, H1 re-read, choice by fewest words not understood, context filler, adapter to SOP Lang wires</title>
${AH}
<rect class="box" x="90" y="8" width="220" height="38" rx="8"/>
<text class="t" x="200" y="24" text-anchor="middle">Message + names on the canvas</text>
<text class="m" x="200" y="39" text-anchor="middle">formalize(text, {names, last})</text>
<path class="ar" d="M200 46 V62"/>
<rect class="box" x="90" y="64" width="220" height="38" rx="8"/>
<text class="t" x="200" y="80" text-anchor="middle">Tokenize (mechanical)</text>
<text class="m" x="200" y="95" text-anchor="middle">front.js tokenize</text>
<path class="ar" d="M200 102 V114 H102 V128"/>
<path class="ar" d="M200 102 V114 H298 V128"/>
<rect class="mod" x="8" y="130" width="188" height="104" rx="8"/>
<text class="t" x="102" y="148" text-anchor="middle">(a) World cutter</text>
<text class="m" x="102" y="163" text-anchor="middle">cutter_worlds7s.json</text>
<text x="102" y="181" text-anchor="middle">BIO tagger per token:</text>
<text x="102" y="196" text-anchor="middle">B-&lt;world&gt; (7) · I · O</text>
<text x="102" y="213" text-anchor="middle">→ the units, and each</text>
<text x="102" y="227" text-anchor="middle">unit's top 3 worlds</text>
<rect class="mod" x="204" y="130" width="188" height="104" rx="8"/>
<text class="t" x="298" y="148" text-anchor="middle">(c) Event cutter</text>
<text class="m" x="298" y="163" text-anchor="middle">cutter_events.json</text>
<text x="298" y="181" text-anchor="middle">same tagger, labels</text>
<text x="298" y="196" text-anchor="middle">B-&lt;event&gt; (35) · I · O</text>
<text x="298" y="213" text-anchor="middle">→ hint: the best event</text>
<text x="298" y="227" text-anchor="middle">at the unit's 1st token</text>
<path class="ar" d="M102 234 V256"/>
<path class="ar2" d="M298 234 V256"/>
<rect class="grp" x="8" y="258" width="384" height="148" rx="10"/>
<text class="t" x="200" y="277" text-anchor="middle">(b) Each unit: its 3 candidate worlds read it</text>
<rect class="mod" x="18" y="288" width="114" height="62" rx="7"/>
<text x="75" y="305" text-anchor="middle">own front.json</text>
<text x="75" y="320" text-anchor="middle">→ VSS reader</text>
<text class="s" x="75" y="337" text-anchor="middle">reading + status</text>
<rect class="mod" x="143" y="288" width="114" height="62" rx="7"/>
<text x="200" y="305" text-anchor="middle">own front.json</text>
<text x="200" y="320" text-anchor="middle">→ VSS reader</text>
<text class="s" x="200" y="337" text-anchor="middle">reading + status</text>
<rect class="mod" x="268" y="288" width="114" height="62" rx="7"/>
<text x="325" y="305" text-anchor="middle">own front.json</text>
<text x="325" y="320" text-anchor="middle">→ VSS reader</text>
<text class="s" x="325" y="337" text-anchor="middle">reading + status</text>
<text x="200" y="374" text-anchor="middle">H1: status unknown-event and the hint is one of</text>
<text x="200" y="391" text-anchor="middle">this world's events → read again with that event</text>
<path class="ar" d="M200 406 V424"/>
<rect class="box" x="30" y="426" width="340" height="72" rx="8"/>
<text class="t" x="200" y="444" text-anchor="middle">Choose one reading per unit</text>
<text x="200" y="461" text-anchor="middle">fewest words not understood wins</text>
<text x="200" y="476" text-anchor="middle">tie → the context filler's choice, then cutter order</text>
<text x="200" y="491" text-anchor="middle">no reading → unit ignored (“not understood”)</text>
<path class="ar" d="M200 498 V516"/>
<rect class="mod" x="30" y="518" width="340" height="72" rx="8"/>
<text class="t" x="200" y="536" text-anchor="middle">(d) Context filler</text>
<text class="m" x="200" y="551" text-anchor="middle">vss-context.js + context/weights.json</text>
<text x="200" y="568" text-anchor="middle">fills it / them / “the new one” / empty needed roles</text>
<text x="200" y="583" text-anchor="middle">margin 0: fill if a shape ranks first, else ask</text>
<path class="ar" d="M200 590 V608"/>
<rect class="acc" x="30" y="610" width="340" height="56" rx="8"/>
<text class="t" x="200" y="628" text-anchor="middle">(e) Adapter → SOP Lang wires</text>
<text class="m" x="200" y="643" text-anchor="middle">vss-adapter.js readingFromWires, toNodes</text>
<text class="s" x="200" y="658" text-anchor="middle">command / question / fact / rule (+ mention wires)</text>
</svg>
</div>
<figcaption>Figure 2. The composer for one message, with its own cut (the VSS cutter, the default). Yellow boxes load a model file. The dashed
arrow is the hint: it never cuts and never overrides a readable reading (H1 only).</figcaption>
</figure>

<h2 id="vss-cutter">(a) The world cutter</h2>
<p><code>docs/model/micro/cutter_worlds7s.json</code> (1.14 MB). A token tagger: a greedy averaged-perceptron BIO tagger (the segmenter of
<code>training/sketch/front.py</code>, <code>train_segmenter</code>; JS twin <code>segmentWorlds</code> in <code>docs/js/front.js</code>). Each token gets
<code>B-&lt;world&gt;</code> (the first token of a request, labelled with the world that holds its action), <code>I</code> (inside the request)
or <code>O</code> (outside every request). 9 labels: 7 worlds, I, O. A unit runs from a B to the last I after it.</p>
<p>The unit’s <b>candidates</b> are the 3 worlds with the highest <code>B-&lt;world&gt;</code> score at its first token
(<code>ROUTER_K = 3</code>: the smallest k whose recall of the gold world is at least 97%, measured 97.9% by
<code>training/sketch/cutter_worlds_probe.py</code>).</p>
<p><b>When another cutter cut the message</b> (<a href="#help/cutting">the shared cut</a>), the world cutter still runs once over the message,
and only names worlds: a unit’s candidates are the 3 worlds with the highest summed <code>B-&lt;world&gt;</code> score inside the unit; a unit
with no world signal is read by all 7 worlds, and the fewest words not understood decides (<code>CUT_SHARED.md</code>). With its own cut the
outputs are identical to before the shared cut: 1000 of 1000 sample messages and 1128 of 1128 short ones.</p>
<p>Trained by <code>training/sketch/train_cutter.py --worlds</code> on the annotation spans (the span of each gold request gives its B and I
tokens), <code>seg_epochs</code> 8, on 6640 messages / 224,724 tokens: the 3640 long messages with spans plus the 3000 short one-request
commands (switch <code>SHORT=1</code>). The “s” in the name is that switch (SHORT.md). Training takes about 82 s on CPU.</p>

<h2 id="worlds">(b) The 7 micro-worlds</h2>
<p>A <b>world</b> is one VSS model for a few actions (its <i>events</i>). Its legend lists only its own events. The model is a route book over
<i>stars</i>: every word identity is a vector of D = 1024 unit-modulus complex numbers derived from a hash of its name (portable
<code>star_version</code> 2, <code>docs/js/vss/stars.js</code>); the learned route book (<code>docs/js/vss/routebook.js</code>) gives each token
an address from its path, bigram and position, and the reader (<code>docs/js/vss/reader.js</code>) decodes the frame: the predicate (which
event, from the world’s verb lemmas) and the role fillers (target, colour, landmark, …). The reader returns a status:
<code>ok</code>, <code>abstain</code> (margin under 0.05: uncertain, still executed today), <code>unknown-event</code> (no action word found) or
<code>no-sense</code> (more than half of the tokens could not be placed). Executing <code>abstain</code> readings goes against the main metric
of 2026-11-02 (execute only what it is sure of); the confidence gate that replaces it is in progress (<a href="#help/planned">In progress</a>).
The margin behind <code>abstain</code> is also a poor confidence (AUROC 0.59 on the sample, RISK_COVERAGE.md).</p>
<p>Before the model, the world’s own <b>front end</b> <code>front.json</code> normalizes the tokens: learned value n-grams (“bottom right” →
<code>bottom_right</code>) and trigger rules, learned from the annotated rows of that world’s events only (<code>FRONT_ROWS=world</code>;
thresholds <code>val_min_count</code> 5, <code>val_min_prec</code> 0.8, <code>trig_min_count</code> 2, <code>trig_share</code> 0.75, <code>trig_min_prec</code> 0.6).
Names are never in the lexicon: an unknown word becomes a name token, quoted text a text token.</p>
<div class="tw"><table>
<thead><tr><th>World</th><th>Events (actions and questions)</th><th>Folder</th><th class="num">Size</th><th class="num">Training rows</th><th class="num">Front: values / triggers</th></tr></thead>
<tbody>
<tr><td>shapes</td><td>create, set, resize, fact, rule</td><td><code>micro/shapes7c/</code></td><td class="num">7.3 MB</td><td class="num">6334</td><td class="num">88 / 658</td></tr>
<tr><td>links</td><td>connect, disconnect</td><td><code>micro/links7/</code></td><td class="num">8.1 MB</td><td class="num">3596</td><td class="num">45 / 530</td></tr>
<tr><td>position</td><td>move, swap, arrange, align, distribute, toFront, toBack</td><td><code>micro/position7/</code></td><td class="num">6.6 MB</td><td class="num">4375</td><td class="num">59 / 727</td></tr>
<tr><td>graphq</td><td>check, connected, path, reachable, cycle, exists</td><td><code>micro/graphq7/</code></td><td class="num">5.1 MB</td><td class="num">2729</td><td class="num">31 / 429</td></tr>
<tr><td>questions</td><td>count, list, extreme, nearest, describe, neighbors, degree, property</td><td><code>micro/questions7/</code></td><td class="num">4.2 MB</td><td class="num">3959</td><td class="num">79 / 844</td></tr>
<tr><td>manage</td><td>delete, duplicate, rename, label</td><td><code>micro/manage7/</code></td><td class="num">3.1 MB</td><td class="num">1091</td><td class="num">17 / 138</td></tr>
<tr><td>history</td><td>undo, redo, forget</td><td><code>micro/history7/</code></td><td class="num">1.2 MB</td><td class="num">536</td><td class="num">0 / 50</td></tr>
</tbody></table></div>
<p class="note">Folders under <code>docs/model/</code>. Rows from each folder’s <code>BUILD.json</code>; values / triggers counted in its <code>front.json</code>.
All seven: D 1024, 10 epochs, seed 0, <code>DATA=spans</code>, trained on CPU here; <code>shapes7c</code> is the build with
<code>CREATE_COLOR=role</code> (CREATE_COLOR.md). Each folder holds <code>model.json</code>, <code>routebook.bin</code>, <code>stars.bin</code>,
<code>manifest.json</code> (sha256 of each file, format <code>vss-web-2</code>, 8-bit phases, sparse route book), <code>front.json</code> and
<code>BUILD.json</code> (not loaded). The grouping of events into these 7 worlds is <code>training/sketch/worlds_micro/GROUPS_7.json</code>,
chosen by measured cutter confusion (PLAN_B.md). The events group, ungroup, members and groupOf are in the engine, the Rules reader and the
adapter, and in the round-2 worlds, but in no world of the default registry.</p>
<p><b>Round 2</b> (<code>training/sketch/ROUND2.md</code>): the same 7 worlds retrained once with every measured fix (<code>micro/&lt;world&gt;7r2/</code>,
with the group events in manage and questions), new cutters, and <code>docs/model/micro/registry_r2.json</code>. Trained on the GPU machine
(commit 63274ae), <b>not the default</b>: on the sample 75.3 / 11.1 / 13.6 against 77.2 / 11.4 / 11.4 for the default; on the short sets
62.5 / 11.0 / 26.6 against 61.1 / 11.1 / 27.7. Details in <a href="#help/measurement/round2">Measurement</a>.</p>

<h2 id="event-hint">(c) The event cutter and the event hint H1</h2>
<p><code>docs/model/micro/cutter_events.json</code> (1.24 MB): the same tagger and trainer, with one label per legend event
(<code>B-&lt;event&gt;</code>, 35 events, plus I and O; grouping <code>training/sketch/worlds_micro/GROUPS_EVENTS.json</code>), trained on the
3640 long messages (not on the short commands). It is decoded once over the whole message; it does not cut. A unit’s <b>hint</b> is the
<code>B-&lt;event&gt;</code> label with the largest score at the unit’s first token.</p>
<p>Why: inside a world with several events the reader decides the event only from a verb lemma; a request with no verb (“Post blue”,
“Alpha to Beta”) gets <code>unknown-event</code>. <b>H1</b> (registry <code>"event_hint": "H1"</code>): only when a candidate world’s reading
has status <code>unknown-event</code> and the hint is one of that world’s events, the world reads the unit again with that event given
(<code>opts.event</code> in <code>reader.js</code>). Measured gain on the sample: right 69.6 → 73.2 (EVENT_HINT.md). H2 (overriding readable
readings too) was measured and rejected.</p>

<h2 id="context">(d) The context filler</h2>
<p><code>docs/js/vss-context.js</code> with <code>docs/model/context/weights.json</code> (14.9 KB). It runs after VSS on the chosen reading and
handles reference <b>gaps</b> in the entity roles (target, from, to, anchor): <code>pron</code> (“it”, “them”), <code>vague</code> (“the new
one”), <code>desc</code> (“the blue one”: filled only by a context shape whose known attributes confirm it, otherwise left to the engine as a
mention) and <code>empty</code> (a role the action needs but the reading left empty; the needs are learned from the gold args). Candidates are
a closed set (shapes created or named earlier in the message, shapes on the canvas, names in the text, recent groups); hard filters (one vs
several, description constraints, recency); a linear ranker with 155 features and a learned “nobody” candidate, trained by
<code>training/sketch/train_context.mjs</code> on the gold args of an 80% split. Decision today: fill with the best candidate when it beats the
runner-up by the <code>margin</code>; the margin is <b>0</b>, so it asks only when “nobody” ranks first. A request with a gap it cannot fill
becomes a question to the user, not an execution.</p>
<p class="callout warn">The margin 0 comes from the owner’s rule of 2026-11-01, “ask as little as possible” (in drawing a mistake costs one undo,
a question costs more). It was replaced on 2026-11-02 by the main metric: do only what you are sure of, ask about the rest (AGENTS.md). The
filler keeps ranking the candidates, but whether its filling is executed is to be decided by the reader’s confidence against a threshold
chosen on held-out data (the VSS confidence measured in VSS_CONFIDENCE.md includes the filler’s own margin, <code>ctx_margin</code>). In progress; the demo still
fills at margin 0.</p>

<h2 id="adapter">(e) The adapter to SOP Lang wires</h2>
<p><code>docs/js/vss-adapter.js</code>: <code>readingFromWires</code> turns the reader’s wires into an event with roles; <code>toNodes</code> maps the
roles to SOP Lang keys and values (a description in a role becomes a <code>mention</code> wire). Position values are placed by what they are: a
relation (left_of, below, between, …) is a relation and a region (top_left, center, …) is a region, whichever of <code>relation</code>,
<code>region</code>, <code>relation2</code> holds it (fix 1 of SHORT2.md, 2026-11-02: before, such a value was dropped silently).</p>

<h2 id="decide">How a unit is decided, and ties</h2>
<ol>
  <li>Every candidate world reads the unit with its own front end (after H1 where it applies).</li>
  <li>The reading that leaves the <b>fewest words not understood</b> wins: the unit’s surface words, punctuation excluded, that are not behind
  a role filler, an accepted offer or the action token (the count of <code>training/sketch/words_not_understood.mjs</code>). An unreadable
  status (<code>unknown-event</code>, <code>no-sense</code>) understands no word; a reading that understands no word is not a reading.</li>
  <li>A <b>tie</b> goes to the context layer (<code>chooseReading</code> in <code>vss-context.js</code>: the reading the message context can
  complete); if still tied, the cutter’s order (the higher <code>B-&lt;world&gt;</code> score).</li>
  <li>No reading: the unit is ignored and the reply says what was not understood.</li>
  <li>The context filler then fills or asks (today: fills whenever a candidate ranks first); the adapter writes the wires; the references (names created, <code>last</code>) carry to the next
  unit (<code>nextContext</code>).</li>
</ol>
<p class="callout"><b>No fallback world, no single model.</b> The general fallback model <code>kinds_p80_s0</code> was removed from the composer and
the registry on 2026-11-02: it read 0 of 4643 requests on the sample and 0 of 877 on the short sets, and the numbers were identical without it
(SHORT2.md §7). A unit no candidate world reads is reported as not understood. The single-model VSS path (<code>?vss=single</code>) and the older
token router were removed the same day (the composer accepts only <code>"router": "cutter"</code>). The model folders are in git history (commit a76b4e3).</p>
<p class="note">Also in the code, off by default: <code>need_read</code> (re-read an empty needed role with presence “all”; tested, not adopted,
SHORT2.md §6).</p>
`, 'A composer of seven small vector-symbolic models, two cutters, a context filler and an adapter to SOP Lang.');

/* ============================================================ neural */
page('neural-reader', 'The Neural reader', `
<p>Code: <code>docs/js/neural.js</code> (<code>NeuralKit</code>, strategy <code>finetuned</code>), run by transformers.js 3.8.1 (loaded from
jsDelivr) on the CPU through WebAssembly, with 8-bit files (<code>q8</code>, <code>onnx/model_quantized.onnx</code>). The models are served
from this site and load by themselves when the page opens (from the browser cache after the first time). The demo has <b>one neural model</b>,
SOP-BERT, in <code>docs/model/neural/sop-bert/</code> (owner’s decision, 2026-11-02; the earlier pair of models was removed). Why fine-tune a
transformer at all: <a href="#help/bert">What we do with BERT</a>.</p>

<h2 id="sop-bert">SOP-BERT: one model that cuts and reads</h2>
<p>One DistilBERT encoder (<code>distilbert-base-uncased</code>) fine-tuned on our annotated requests, with small heads on top
(<code>training/neural/finetune_roles.py --name sop-bert</code>, data from <code>training/neural/make_roles.py</code>):</p>
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 300" role="img" aria-labelledby="dbt">
<title id="dbt">SOP-BERT: one DistilBERT encoder with a cut head over the whole message and, per request, an act head, class heads, fill and description heads and a word-tag head</title>
${AH}
<rect class="box" x="60" y="8" width="280" height="36" rx="8"/>
<text class="t" x="200" y="24" text-anchor="middle">Words of the message / of each request</text>
<text class="s" x="200" y="38" text-anchor="middle">word pieces of the DistilBERT tokenizer</text>
<path class="ar" d="M200 44 V60"/>
<rect class="mod" x="60" y="62" width="280" height="44" rx="8"/>
<text class="t" x="200" y="80" text-anchor="middle">DistilBERT encoder (6 layers)</text>
<text class="s" x="200" y="96" text-anchor="middle">pretrained on English, fine-tuned on our requests</text>
<path class="ar" d="M90 106 V128"/><path class="ar" d="M165 106 V128"/><path class="ar" d="M240 106 V128"/><path class="ar" d="M315 106 V128"/>
<rect class="acc" x="8" y="130" width="92" height="84" rx="7"/>
<text class="t" x="54" y="148" text-anchor="middle">cut</text>
<text x="54" y="166" text-anchor="middle">O / B / I</text>
<text x="54" y="181" text-anchor="middle">per word of</text>
<text x="54" y="196" text-anchor="middle">the message</text>
<rect class="acc" x="108" y="130" width="92" height="84" rx="7"/>
<text class="t" x="154" y="148" text-anchor="middle">act</text>
<text x="154" y="166" text-anchor="middle">action, ask,</text>
<text x="154" y="181" text-anchor="middle">fact, rule</text>
<text x="154" y="196" text-anchor="middle">or none</text>
<rect class="acc" x="208" y="130" width="92" height="84" rx="7"/>
<text class="t" x="254" y="148" text-anchor="middle">classes</text>
<text x="254" y="166" text-anchor="middle">a value per key</text>
<text x="254" y="181" text-anchor="middle">fill:&lt;role&gt;</text>
<text x="254" y="196" text-anchor="middle">desc:&lt;key&gt;</text>
<rect class="acc" x="308" y="130" width="84" height="84" rx="7"/>
<text class="t" x="350" y="148" text-anchor="middle">tags</text>
<text x="350" y="166" text-anchor="middle">B / I / O</text>
<text x="350" y="181" text-anchor="middle">names, label,</text>
<text x="350" y="196" text-anchor="middle">numbers</text>
<path class="ar" d="M154 214 V238 H200 V250"/><path class="ar" d="M254 214 V238 H200"/><path class="ar" d="M350 214 V238 H200"/>
<rect class="box" x="60" y="252" width="280" height="40" rx="8"/>
<text class="t" x="200" y="269" text-anchor="middle">Assembled by the legend (no model)</text>
<text class="m" x="200" y="284" text-anchor="middle">@s1 command action=set target=$m1 color=red</text>
</svg>
</div>
<figcaption>Figure 3. SOP-BERT. Two calls per message: the cut head reads the whole message (up to 512 word pieces; the BERT cutter), then the
other heads read all its requests in one batched call.</figcaption>
</figure>
<ul>
  <li><b>cut</b>: O / B / I per word over the whole message (read on each word’s first word piece). It is the <b>BERT cutter</b> of the shared cut.</li>
  <li><b>act</b> (on the [CLS] vector): the action of a command, the ask of a question, <code>fact</code>, <code>rule</code>, or <code>none</code>
  (the unit is not a request, “Thanks”: no wire, listed as “Ignored (not a request)”).</li>
  <li><b>15 class heads, one per legend key with values</b> (arrow, axis, color, comparison, direction, kind, layout, notColor, pairing, position,
  property, shape, size, style, superlative): <code>none</code> or one of the values the key takes in the training gold.</li>
  <li><b>who fills each name-role</b> (<code>fill:&lt;key&gt;</code> for anchor, from, target, to): none / written / context / description;
  and the <b>description’s own keys</b> (<code>desc:&lt;key&gt;</code>: quantifier, color, notColor, shape, recency). So it reads “the red square”
  and “it” itself.</li>
  <li><b>word tags</b> B / I / O for the keys whose answer is written in the request (target, anchor, from, to, name, label, count, distance).</li>
</ul>
<p><b>Assembling the wires</b> is deterministic, by the legend: the wire type follows from the act; the keys read for an act are the keys its
requests have in the training gold (<code>reader.act_keys</code>); a role read as “written” takes the tagged words (a name created earlier in
the message becomes a reference to that wire), “description” becomes a <code>mention</code> wire with the <code>desc:</code> values (resolved by
the engine, as the Rules and VSS mentions), and “context” takes the context rule every reader shares after each request (a copy of
<code>nextContext</code> in <code>vss-composer.js</code>: “it” is the last shape created or named). <b>It never calls the Rules reader</b>
(owner, 2026-11-02).</p>
<p><b>Training</b>: the same data and split as the earlier act classifier (below) (the span-annotated messages minus the fixed 1000-message sample; 10%
of the messages held out by message id, seed 0). Loss: the act plus the mean of the class heads plus the word tags (and the cut tags); AdamW,
fp16 on cuda, early stop on the held-out share of requests read right; the best epoch is kept. Export: ONNX with dynamic 8-bit quantization;
<code>config.json</code> carries the head layout (<code>"reader"</code>); <code>training/neural/check_roles_node.mjs</code> reads 50 held-out
requests through the demo’s decoding code and compares them with torch.</p>
<h2 id="sop-bert-measured">Measured</h2>
<div class="tw"><table>
<thead><tr><th>SOP-BERT</th><th class="num">Value</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Fixed 1000-message sample, its own cut: right / wrong / not done (%)</td><td class="num"><b>80.8 / 16.5 / 2.8</b></td><td>commit 1f3c806</td></tr>
<tr><td>Same run: extra requests; ms per message; calls to the Rules reader</td><td class="num">348; 22.6; 0</td><td>same</td></tr>
<tr><td>For comparison, same sample: VSS (VSS cut) · Rules (Rules cut)</td><td class="num">77.2 / 11.4 / 11.4 · 67.9 / 16.8 / 15.3</td><td>CUT_SHARED.md</td></tr>
<tr><td>Act accuracy: held-out 10% · sample</td><td class="num">0.989 · 0.988</td><td><code>docs/model/neural/sop-bert/README.md</code></td></tr>
<tr><td>Requests whose act, every class key and every role are all read right: held-out · sample</td><td class="num">0.881 · 0.867</td><td>same</td></tr>
<tr><td>Held-out name-roles by filler: written · context · description</td><td class="num">1611/1659 · 83/103 · 4/34</td><td>same</td></tr>
<tr><td>Size of <code>onnx/model_quantized.onnx</code> (q8) · node vs torch on 50 held-out requests</td><td class="num">67.8 MB · tags 49/50, cut 19/20, rest 50/50</td><td>same</td></tr>
</tbody></table></div>
<p>SOP-BERT gets more requests right than VSS on whole messages (80.8 vs 77.2) and also more wrong (16.5 vs 11.4): it almost never leaves a
request undone (2.8%), so what it does not know it guesses. Descriptions in roles (“next to the orange hexagon”) are its weakest part: 4 of 34
held-out. These are the earlier measure, every request executed. Under the main metric (precision of execution, owner 2026-11-02) SOP-BERT
is to execute only when its confidence (the smallest probability among its heads for the request) clears a threshold chosen on held-out data:
measured offline in RISK_COVERAGE.md, in the demo in progress. Why the difference between guessing and stopping matters:
<a href="#help/knowing">Knowing what it does not know</a>.</p>
<p class="note">Trained by <code>training/neural/finetune_roles.py</code> on the GPU machine: epochs ≤ 8, lr 6e-5, batch 32, fp16 on cuda, seed 0; 15,683
request spans. The milliseconds are from the scoring run in node; the time of each message in the demo is in its reply.</p>
<h2 id="pair">Before SOP-BERT: the act classifier and the QA model (removed)</h2>
<p>Until 2026-11-02 the Neural reader was a pair: our classifier <code>act-distilbert</code> (DistilBERT fine-tuned on our requests to name the act:
36 classes) and a ready-made extractive question-answering model, <code>Xenova/distilbert-base-cased-distilled-squad</code>, that answered each
legend question (“Where does the connection start?”) with a span of the request. It ran the Rules reader too and borrowed from it the references
(“it”) and the descriptions (“the red circle”). Both folders were removed when SOP-BERT became the only neural model; they are in git history.</p>
<div class="tw"><table>
<thead><tr><th>The pair, on the fixed 1000-message sample</th><th class="num">Value</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Act accuracy of act-distilbert (4858 requests, never trained on)</td><td class="num">0.987</td><td>act-distilbert README</td></tr>
<tr><td>Act accuracy on blind / hand / broad</td><td class="num">0.983 / 1.000 / 0.949</td><td>same</td></tr>
<tr><td>Whole requests right / wrong / not done (%), Rules cut</td><td class="num" id="pair-score">30.2 / 64.3 / 5.5</td><td>neural_score.mjs, main at af78073</td></tr>
<tr><td>Extra requests; ms per message (busy machine: Rules 23.6, VSS 97.3)</td><td class="num">1387; 714</td><td>same run</td></tr>
</tbody></table></div>
<p>The act was right, the <b>roles</b> were not: the SQuAD model was never trained on our requests and answered “which shape?” with a span that was
often the wrong name, several names or none. Requests with few roles were mostly right (count 122 of 167, undo 44 of 44), requests whose roles carry
the meaning almost never (connect 34 of 747, create 4 of 190, path 1 of 126). It also never asked back: what it did not read was done wrong. That is
what SOP-BERT’s heads, trained on our annotation, replace.</p>
<p class="note">Act classifier: 15,683 training request spans (<code>training/neural/make_data.py</code>), 8 epochs, lr 6e-5, batch 32, fp16 on cuda,
seed 0 (GPU job 011, branch <code>gpu-runs</code>). The whole-request run: <code>ZS=act-distilbert node training/laptop/neural_score.mjs</code> over
the 9 folders of the sample, CPU, q8 files, scoring of <code>training/sketch/llm_score.mjs</code> (<code>PAIR=value</code>).</p>
`, 'SOP-BERT: one fine-tuned DistilBERT that cuts a message and reads every request itself.');

/* ============================================================ cutting */
page('cutting', 'One cut for all readers', `
<p><b>Owner’s decision, 2026-11-02.</b> The three readers read the <b>same units</b> of a message. How the message is cut is one global
setting (Settings › Cutting into requests), so the tabs differ only in how each reader reads a request, never in how the message was split.
<b>details</b> under a reply lists the units and how long the cut took.</p>
<div class="tw"><table>
<thead><tr><th>Cutter</th><th>What it is</th><th>Code / model</th></tr></thead>
<tbody>
<tr><td><b>Rules segmenter</b></td><td>Hand-written: sentences, then a comma or “and” before a verb, coordinated names, one clause per created object.</td><td><code>docs/js/logic.js</code> (<code>rulesCut</code>)</td></tr>
<tr><td><b>VSS cutter</b> (default)</td><td>A learned token tagger <code>B-&lt;world&gt;</code> / I / O trained on the annotated request spans; it also names each unit’s candidate worlds.</td><td><code>docs/model/micro/cutter_worlds7s.json</code></td></tr>
<tr><td><b>BERT cutter</b></td><td>The cut head of SOP-BERT: B / I / O per word over the whole message. Available once the Neural reader has loaded.</td><td><code>NeuralKit.cut</code>, <code>training/neural/finetune_roles.py</code></td></tr>
</tbody></table></div>
<p><b>How.</b> <code>VSSFormalizer.cut(text, ctx, strategy, env)</code> returns <code>[{c0, c1, src}]</code> (character offsets); every reader
reads exactly those units (<code>rules.formalize(t, ctx, {units})</code>, <code>VSSFormalizer.formalize(t, ctx, _, {units})</code>,
<code>neural.formalize(t, ctx, {units})</code>). A cutter that is not available yet (VSS or SOP-BERT still loading) is replaced by the
Rules segmenter for that message, and the details say so. The default is <code>DEFAULT_CUT</code> in <code>docs/js/vss-composer.js</code>.</p>

<h2 id="cut-measured">What each cut costs each reader</h2>
<p>Per gold request, right / wrong / not done (%) and extra; <code>node training/sketch/cut_bench.mjs</code>, <code>PAIR=value</code>
(<code>training/sketch/CUT_SHARED.md</code>).</p>
<div class="tw"><table>
<thead><tr><th>Set, reader</th><th class="num">Rules cut</th><th class="num">VSS cut</th></tr></thead>
<tbody>
<tr><td>Sample (4858), Rules</td><td class="num">67.9 / 16.8 / 15.3 +821</td><td class="num">73.6 / 11.9 / 14.5 +406</td></tr>
<tr><td>Sample, VSS</td><td class="num">69.8 / 15.8 / 14.4 +833</td><td class="num"><b>77.2 / 11.4 / 11.4 +334</b></td></tr>
<tr><td>Short sets (1140), Rules</td><td class="num"><b>97.5 / 0.5 / 1.9 +16</b></td><td class="num">87.7 / 1.8 / 10.4 +17</td></tr>
<tr><td>Short sets, VSS</td><td class="num">58.6 / 13.7 / 27.7 +89</td><td class="num">61.1 / 11.1 / 27.7 +53</td></tr>
</tbody></table></div>
<p>The cut against the gold spans:</p>
<div class="tw"><table>
<thead><tr><th>Set, cut</th><th class="num">Units / gold</th><th class="num">Lost / merged / split / extra units</th><th class="num">ms per message</th></tr></thead>
<tbody>
<tr><td>Sample, Rules</td><td class="num">6051 / 4858</td><td class="num">0 / 191 / 192 / 1202</td><td class="num">8.3</td></tr>
<tr><td>Sample, VSS</td><td class="num">4853 / 4858</td><td class="num">147 / 53 / 56 / 136</td><td class="num">3.3</td></tr>
<tr><td>Short, Rules</td><td class="num">1119 / 1118</td><td class="num">0 / 0 / 1 / 0</td><td class="num">1.1</td></tr>
<tr><td>Short, VSS</td><td class="num">1024 / 1118</td><td class="num">96 / 0 / 2 / 0</td><td class="num">0.6</td></tr>
</tbody></table></div>
<p><b>Reading.</b> On whole messages the VSS cut is better for both readers (wrong 11.9 vs 16.8 for Rules, extras halved): the Rules segmenter
cuts text that is not a request into units (1202 extra units). On short one-line commands the Rules segmenter is better: the VSS cutter makes
no unit for 96 of 1118 commands, so Rules with the VSS cut drops from 97.5 to 87.7 right. The default is the VSS cutter because real messages
are whole messages. With its own cut (the BERT cutter) SOP-BERT reads the sample at 80.8 / 16.5 / 2.8 (commit 1f3c806); the BERT cut read by
the Rules and VSS readers had no committed measurement when this page was written.</p>
<p class="note">The cutter is judged by the errors it causes in the readers (requested actions done wrong or not done, and extras), not by
span-match scores (AGENTS.md).</p>
`, 'One setting decides how every message is cut into requests; all three readers then read the same requests.');

/* ============================================================ spelling */
page('spelling', 'The spell checker', `
<p><code>docs/js/spell.js</code> (<code>SpellKit</code>) runs on the message before the cut and before any reader; every reader reads the
corrected text. It can be switched off in Settings. It is built with VSA, not a dictionary algorithm: every word is a hypervector, the bundle
(sum) of random bipolar vectors of its character n-grams with <code>^</code> and <code>$</code> marking start and end; the cosine of two word
vectors estimates how many n-grams they share. A word that is neither known nor kept is replaced by the nearest known word when the cosine is
at least <code>threshold</code> and at least <code>margin</code> above the second-best.</p>
<dl class="kv">
  <dt>Vocabulary (targets)</dt><dd>477 words in <code>docs/model/spell/vocab.json</code> (the VSS worlds’ lexicon, catalog, value and trigger phrases,
  built by <code>training/sketch/spell/build_spell.mjs</code>), plus at run time the legend’s values and cue words and the names on the active
  reader’s canvas.</dd>
  <dt>Kept words</dt><dd>2384 words that occur in 2+ training messages (“wants”, “flow”, “because”): never corrected and never a target.</dd>
  <dt>Parameters</dt><dd>D 1024, n-grams of 2 and 3 letters, <code>threshold</code> 0.40, <code>margin</code> 0.08, chosen once by the protocol in
  <code>build_spell.mjs</code>: one random typo per message of the 1128 benchmark messages (seed 1), objective right − 3·wrong − 3·false
  corrections; result 560 right, 54 wrong, 457 left, 4 false corrections (the <code>selection</code> field of <code>vocab.json</code>). Stored in <code>vocab.json</code>.</dd>
  <dt>Left alone</dt><dd>Known words, words of 1–2 letters, numbers and words with digits or apostrophes, quoted text, the word after
  named / called / titled / labeled, and capitalised words inside a sentence (names: corrected only toward a name on the canvas, “Strat” → “Start”).</dd>
</dl>
<p class="note"><code>vocab.json</code> names its sources: the 7 worlds of <code>registry.json</code> (lexicon, catalog, value and trigger phrases).</p>
`, 'A VSA spell checker over character n-grams corrects near misses before any reader sees the message.');

/* ============================================================ models */
page('models', 'Models and versions', `
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 560" role="img" aria-labelledby="d4t">
<title id="d4t">The docs/model folder: versions.json; micro with the two registries, four cutters, the seven worlds and their round-2 versions; context; spell; neural with sop-bert</title>
<rect class="chipv" x="10" y="8" width="10" height="10" rx="2"/><text class="s" x="25" y="17">VSS loads</text>
<rect class="chipn" x="98" y="8" width="10" height="10" rx="2"/><text class="s" x="113" y="17">Neural loads</text>
<rect class="chipo" x="196" y="8" width="10" height="10" rx="2"/><text class="s" x="211" y="17">spell, versions</text>
<rect class="chipx" x="300" y="8" width="10" height="10" rx="2"/><text class="s" x="315" y="17">not loaded</text>
<text class="m" x="10" y="46" style="font-weight:600">docs/model/</text><text class="m" x="392" y="46" text-anchor="end">149.9 MB</text>
<path class="tree" d="M16 52 V402 M16 66 H30 M16 88 H30 M16 360 H30 M16 380 H30 M16 402 H30"/>
<rect class="chipo" x="34" y="58" width="9" height="9" rx="2"/><text class="m" x="48" y="66">versions.json</text><text class="m" x="392" y="66" text-anchor="end">1.1 KB</text>
<text class="m" x="34" y="92" style="font-weight:600">micro/</text><text class="m" x="392" y="92" text-anchor="end">81.3 MB</text>
<path class="tree" d="M40 98 V310 M40 114 H54 M40 136 H54 M40 158 H54 M40 180 H54 M40 202 H54 M40 224 H54 M40 246 H54 M40 288 H54"/>
<rect class="chipv" x="58" y="106" width="9" height="9" rx="2"/><text class="m" x="72" y="114">registry.json (the default)</text><text class="m" x="392" y="114" text-anchor="end">1.9 KB</text>
<rect class="chipx" x="58" y="128" width="9" height="9" rx="2"/><text class="m" x="72" y="136">registry_r2.json (round 2)</text><text class="m" x="392" y="136" text-anchor="end">1.9 KB</text>
<rect class="chipv" x="58" y="150" width="9" height="9" rx="2"/><text class="m" x="72" y="158">cutter_worlds7s.json</text><text class="m" x="392" y="158" text-anchor="end">1.14 MB</text>
<rect class="chipv" x="58" y="172" width="9" height="9" rx="2"/><text class="m" x="72" y="180">cutter_events.json</text><text class="m" x="392" y="180" text-anchor="end">1.24 MB</text>
<rect class="chipx" x="58" y="194" width="9" height="9" rx="2"/><text class="m" x="72" y="202">cutter_worlds7r2.json</text><text class="m" x="392" y="202" text-anchor="end">1.24 MB</text>
<rect class="chipx" x="58" y="216" width="9" height="9" rx="2"/><text class="m" x="72" y="224">cutter_events_r2.json</text><text class="m" x="392" y="224" text-anchor="end">1.67 MB</text>
<rect class="chipv" x="58" y="238" width="9" height="9" rx="2"/><text class="m" x="72" y="246">shapes7c/ links7/ position7/</text><text class="m" x="392" y="246" text-anchor="end">35.6 MB</text>
<text class="m" x="72" y="262">graphq7/ questions7/ manage7/ history7/</text>
<rect class="chipx" x="58" y="280" width="9" height="9" rx="2"/><text class="m" x="72" y="288">the same seven, …7r2/</text><text class="m" x="392" y="288" text-anchor="end">40.5 MB</text>
<text class="s" x="72" y="306">each world: model.json routebook.bin stars.bin manifest.json front.json</text>
<text class="s" x="72" y="320">(+ BUILD.json, not loaded)</text>
<rect class="chipv" x="34" y="352" width="9" height="9" rx="2"/><text class="m" x="48" y="360">context/weights.json</text><text class="m" x="392" y="360" text-anchor="end">14.9 KB</text>
<rect class="chipo" x="34" y="372" width="9" height="9" rx="2"/><text class="m" x="48" y="380">spell/vocab.json</text><text class="m" x="392" y="380" text-anchor="end">28.0 KB</text>
<text class="m" x="34" y="406" style="font-weight:600">neural/</text><text class="m" x="392" y="406" text-anchor="end">68.5 MB</text>
<path class="tree" d="M40 412 V428 M40 428 H54"/>
<rect class="chipn" x="58" y="420" width="9" height="9" rx="2"/><text class="m" x="72" y="428">sop-bert/</text><text class="s" x="392" y="428" text-anchor="end">one DistilBERT, 8-bit</text>
<text class="s" x="72" y="448">config.json (with the head layout "reader")</text>
<text class="s" x="72" y="464">tokenizer.json tokenizer_config.json</text>
<text class="s" x="72" y="480">onnx/model_quantized.onnx (q8)</text>
<rect class="box" x="8" y="502" width="384" height="52" rx="8"/>
<text class="s" x="18" y="519">versions.json: "micro/links7": "7bdd38271f" → the loader asks for</text>
<text class="m" x="18" y="534">micro/links7/routebook.bin?v=7bdd38271f</text>
<text class="s" x="18" y="548">new content = new hash = new URL; unchanged = stays cached</text>
</svg>
</div>
<figcaption>Figure 4. The model folder the page loads from (<code>du -sb</code>, 2026-11-02). VSS loads only what <code>registry.json</code> names;
the Neural reader loads <code>sop-bert/</code>; the size of each of its files is also in <code>versions.json</code> (“sizes”) and in Neural › Settings.</figcaption>
</figure>

<h2 id="versions">Versions: the browser never uses a stale model</h2>
<p><code>training/sketch/stamp_models.py</code> computes a content version for every model: the first 10 hex digits of a sha256 over the model’s
files (relative path + content, sorted; <code>BUILD.json</code> left out). Folder models are the VSS folders (with <code>manifest.json</code>) and the
transformers.js folders under <code>neural/</code>; file models are the cutters, <code>context/*.json</code> and <code>spell/*.json</code>. It writes
<code>docs/model/versions.json</code> (one entry per model; plus the file sizes of the neural folder, shown before download) and the same versions into
the registries (<code>version</code> per world, <code>cutter_version</code>, <code>event_cutter_version</code>, <code>context_version</code>).
It is idempotent and is run before every commit that changes a model.</p>
<p>The loader (<code>versioned()</code> in <code>docs/js/vss-formalizer.js</code>) appends <code>?v=&lt;version&gt;</code> of the longest matching folder
or file to every model URL. <code>versions.json</code> and <code>registry.json</code> are fetched with <code>cache: "no-cache"</code> (always
revalidated). The neural files are requested from transformers.js as a Hugging Face URL whose revision is our version, and a custom cache maps
that key to our versioned file; the Hugging Face models (only used by the headless comparisons) are pinned to a commit.</p>
<p class="note">Hosts that cannot serve binary files: the loader can fall back to base64 parts listed in a <code>bin-parts.json</code> inside the model folder
(the manifest’s sha256 still checks them). GitHub Pages serves the <code>.bin</code> files directly.</p>
`, 'What is in docs/model, what each reader loads, and how content versions keep the browser from using an old model.');

/* ============================================================ data */
page('data', 'Data', `
<p>All training data are realistic messages written by LLM agents (Sonnet, Haiku) in the style of real use: whole messages of 1 to 20
sentences, with text that is not a request, self-corrections, typos, many domains and personas, and the requests annotated as spans
(<code>{id, names, text, wires: [{span, trigger, type, args}]}</code>). Specifications: <code>training/sketch/llm_train/TRAIN_MSG_SPEC.md</code>,
<code>training/sketch/llm_bench/SPEC.md</code>, <code>training/sketch/LABEL_CONVENTIONS.md</code>; the writing and checking procedure is the skill
<code>skills/llm-annotated-data/SKILL.md</code>.</p>
<div class="callout"><b>Rules (AGENTS.md).</b> A data writer saves its texts <i>before</i> annotating (one file per batch, ids and texts only);
the coordinator checks that the annotated texts are byte-identical to the saved ones; a text is never edited to fit an annotation (2026-10-31: two
writers did). Realistic examples are never dropped because the pipeline cannot read them. Template sentences (<code>training/sketch/generate.py</code>)
are at most a secondary, labelled variant. <b>There is no hidden test set</b> (owner, 2026-11-01): every annotated message is data and may be
read, analysed and trained on; worlds are measured on the data they are trained on and on similar data.</div>

<div class="tw"><table>
<thead><tr><th>Folder (under <code>training/sketch/</code>)</th><th>What</th><th class="num">Messages</th><th>Used by</th></tr></thead>
<tbody>
<tr><td><code>llm_train/sonnet_msg</code>, <code>haiku_msg</code>, <code>sonnet_msg2</code>, <code>haiku_msg2</code></td><td>long messages with spans</td><td class="num">4 × 600</td><td>worlds, both cutters, context, neural</td></tr>
<tr><td><code>llm_train/sonnet_long</code></td><td>long messages with spans</td><td class="num">240</td><td>same</td></tr>
<tr><td><code>llm_bench/fresh1/sonnet</code>, <code>llm_bench/fresh1/haiku</code></td><td>written 2026-10-31 as a fresh test set, now data</td><td class="num">2 × 500</td><td>same</td></tr>
<tr><td><code>llm_bench/sonnet_spans</code>, <code>llm_bench/haiku_spans</code></td><td>the first bench sets, re-annotated with spans</td><td class="num">2 × 500</td><td>worlds (not the cutters)</td></tr>
<tr><td><code>llm_bench/sonnet</code>, <code>llm_bench/haiku</code></td><td>the same bench texts without spans</td><td class="num">2 × 500</td><td>not read by training</td></tr>
<tr><td><code>llm_train/sonnet</code>, <code>llm_train/haiku</code></td><td>short commands, one request per line (field <code>wire</code>, no span)</td><td class="num">2 × 1500</td><td>source of the next row</td></tr>
<tr><td><code>llm_train/sonnet_short</code>, <code>llm_train/haiku_short</code></td><td>the same 3000 short commands with spans (texts byte-identical)</td><td class="num">2 × 1500</td><td>world cutter (<code>SHORT=1</code>); round 2</td></tr>
<tr><td><code>llm_train/ops_groups</code></td><td>new operations: group, ungroup, members, groupOf (1693 requests)</td><td class="num">480</td><td>round 2 (<code>OPS=1</code>)</td></tr>
<tr><td><code>llm_train/ops_positions</code></td><td>double positions: two relations, region + relation (1022 requests)</td><td class="num">464</td><td>round 2 (<code>OPS=1</code>)</td></tr>
</tbody></table></div>
<p class="note">Totals: the world data (<code>DATA=spans</code>, 9 folders) are 4640 messages with 22,702 requests; the event cutter’s data are 3640
messages; the world cutter adds the 3000 short commands (6640); the round-2 cutters read 7584 messages. Message counts are lines of the
<code>msg_*</code> / <code>batch_*</code> files; the request counts are from SHORT.md and the ops commit. SOP-BERT (and the act classifier before it) uses the span-annotated messages minus the fixed sample (<code>training/neural/make_data.py</code>, <code>make_roles.py</code>).</p>

<h2 id="sets">The sets used for measurement</h2>
<dl class="kv">
  <dt>The fixed 1000-message sample</dt><dd>1000 messages, 4858 gold requests, drawn from the 9 world-data folders (ids:
  <code>training/neural/sample1000_ids.txt</code>; the folder copy that <code>llm_score.mjs</code> reads is <code>data/sampleF/</code> on branch
  <code>gpu-runs</code>). Every composer number since PLAN_A uses it, so they are comparable. It is training data for the worlds (no hidden test
  set); the neural models are the exception: they were never trained on it.</dd>
  <dt>The demo’s short sets</dt><dd><code>docs/bench/*.json</code> (index <code>docs/bench/index.json</code>): hand 40, blind 60, broad 128 rows
  (140 requests), and three sets generated from templates, seen, new_identities and heldout_formulations, 300 each: 1128 rows, 1140 requests,
  median 6 words. Built by <code>training/sketch/make_bench.mjs</code>. The Benchmark in Settings and <code>training/sketch/short_bench/</code> score them.</dd>
  <dt>Per-event gold</dt><dd>One gold file per event (requests read from their annotated span, no cut), used with <code>SEG=gold</code> to measure
  one world alone (PLAN_B.md). These folders are in the coordinator’s scratch, not in the repository.</dd>
</dl>
`, 'Realistic messages written by LLM agents, with every request annotated as a span; the sets every number is measured on.');

/* ============================================================ training */
page('training', 'Training and the GPU runner', `
<div class="tw"><table>
<thead><tr><th>What</th><th>Script</th><th>Where</th><th>Time measured</th></tr></thead>
<tbody>
<tr><td>One VSS world</td><td><code>training/sketch/train_micro.sh &lt;world&gt; &lt;events&gt;</code> → <code>msg_to_world.py</code>, <code>sop check</code>, <code>sop train</code>, <code>sop export-web --bits 8 --sparse</code></td><td>CPU here, or GPU (<code>DEVICE=cuda</code>)</td><td>CPU: 403 s (history7) to 13,554 s (links7) for the training step; GPU: 265–375 s (shapes7c, 3 seeds)</td></tr>
<tr><td>Round 2 (7 worlds)</td><td>the same script with the switches of ROUND2.md §4</td><td>GPU</td><td>—</td></tr>
<tr><td>A cutter</td><td><code>training/sketch/train_cutter.py --worlds &lt;grouping&gt;</code></td><td>CPU</td><td>82 s (cutter_worlds7s)</td></tr>
<tr><td>Context filler weights</td><td><code>training/sketch/train_context.mjs</code></td><td>CPU (node)</td><td>—</td></tr>
<tr><td>Neural act classifier (removed)</td><td><code>training/neural/make_data.py</code>, <code>training/neural/finetune.py</code> (ONNX export + 8-bit quantization, <code>check_node.mjs</code>)</td><td>GPU</td><td>245 s for 8 epochs (DistilBERT); 326 s for 7 epochs (DeBERTa-v3 xsmall, early stop)</td></tr>
<tr><td>SOP-BERT</td><td><code>training/neural/make_roles.py</code>, <code>training/neural/finetune_roles.py --name sop-bert</code>, <code>check_roles_node.mjs</code>, <code>cut_node.mjs</code></td><td>GPU (the owner’s machine)</td><td>—</td></tr>
<tr><td>Spell vocabulary</td><td><code>training/sketch/spell/build_spell.mjs</code></td><td>CPU (node)</td><td>—</td></tr>
<tr><td>Versions</td><td><code>training/sketch/stamp_models.py</code></td><td>CPU</td><td>seconds</td></tr>
</tbody></table></div>
<p class="note">CPU times: the <code>end:</code> line of <code>training/sketch/runs/micro_*.log</code> (training step only; the trainer’s own evaluation and the export
come on top: PLAN_B.md gives 3.77 h for links7 and about 4.2 h for shapes7 in all). GPU times: the run logs of jobs 003–005 and 011 on branch
<code>gpu-runs</code>, a 4 GB card with <code>VSA_MEM_FRACTION=0.45</code>. “—”: no time in a committed document.</p>

<h2 id="switches">The switches of <code>train_micro.sh</code></h2>
<p>Every switch is off by default and the default reproduces the old build byte for byte; every switch is recorded in the world’s
<code>BUILD.json</code>, so a model says how it was built.</p>
<div class="tw"><table>
<thead><tr><th>Switch</th><th>Effect</th><th>Why (document)</th></tr></thead>
<tbody>
<tr><td><code>CREATE_COLOR=role</code></td><td>The colour of a new shape fills the event role <code>color</code>, as for every other colour (<code>llm_to_world.py</code>).</td><td>CREATE_COLOR.md; in <code>shapes7c</code></td></tr>
<tr><td><code>N_CAL=&lt;n&gt;</code></td><td>Training rows sampled to fit the presence thresholds (<code>sop train --n_cal</code>, default 400; 100000 = all rows).</td><td>BETWEEN.md</td></tr>
<tr><td><code>VAL_PREC=event</code></td><td>A value n-gram’s precision counted only over requests of events that carry its kind (“three” → 3 instead of “add three” → 3).</td><td>ROUND2.md fix 4</td></tr>
<tr><td><code>VAL_SUB=value</code></td><td>A longer value n-gram is blocked only by a sub-n-gram that explains it (“bottom left” kept although “left” is kept).</td><td>ROUND2.md fix 3</td></tr>
<tr><td><code>SHORT=1</code></td><td>Also read <code>llm_train/{sonnet,haiku}_short</code>.</td><td>SHORT.md</td></tr>
<tr><td><code>OPS=1</code></td><td>Also read <code>llm_train/ops_groups</code>, <code>ops_positions</code>.</td><td>DIAGRAM_OPS.md §7</td></tr>
<tr><td><code>DIAGRAM_OPS=1</code></td><td>Groups and double positions in the conversion and the legend (events group, ungroup, members, groupOf; roles relation2, landmark3).</td><td>DIAGRAM_OPS.md §4–6</td></tr>
<tr><td><code>DRY=1</code></td><td>Build the world’s data and stop: no training, <code>docs/model</code> untouched.</td><td>ROUND2.md §3</td></tr>
</tbody></table></div>
<p class="note">Other settings: <code>DATA</code> (<code>spans</code> for every world in use), <code>FRONT_ROWS=world</code>, <code>D</code> 1024,
<code>EPOCHS</code> 10, <code>SEED</code>, <code>DEVICE</code>, <code>N_EVAL</code> / <code>EVAL_MODES</code> (the trainer’s own evaluation, does not change
the model), <code>HOLDOUT</code> (experiments), <code>KINDMAP</code>, <code>VSA_MAX_HOURS</code> (watchdog). <code>train_cutter.py</code> has its own
<code>SHORT</code>, <code>OPS</code>, <code>DIAGRAM_OPS</code>. The trainer itself is <code>training/vss/tool/sop/</code>, copied from
ml-circuits-research/vss-demo at commit 9c85649 (<code>training/vss/PROVENANCE.md</code>).</p>

<h2 id="runner">Where it runs: here, or the owner’s GPU through git</h2>
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 500" role="img" aria-labelledby="d3t">
<title id="d3t">The training loop: the coordinator pushes a job to branch gpu-runs, runner.sh on the GPU machine runs it and pushes results, the coordinator scores, stamps and commits to main, GitHub Pages serves it</title>
${AH}
<rect class="box" x="50" y="8" width="342" height="62" rx="8"/>
<text class="t" x="221" y="26" text-anchor="middle">Coordinator session (this repo, CPU)</text>
<text x="221" y="43" text-anchor="middle">data, pre-registration, job script</text>
<text class="s" x="221" y="60" text-anchor="middle">CPU work here: cutters, context, scoring</text>
<path class="ar" d="M100 70 V106"/>
<text class="m" x="110" y="85">git push jobs/&lt;id&gt;.sh</text>
<text class="m" x="110" y="99">→ branch gpu-runs</text>
<rect class="mod" x="50" y="108" width="342" height="78" rx="8"/>
<text class="t" x="221" y="126" text-anchor="middle">runner.sh on the owner's GPU machine</text>
<text x="221" y="143" text-anchor="middle">Fedora, 4 GB NVIDIA card, own account, no Docker</text>
<text x="221" y="159" text-anchor="middle">pulls every 120 s · at most 2 jobs at once</text>
<text class="s" x="221" y="176" text-anchor="middle">train_micro.sh DEVICE=cuda · finetune*.py</text>
<path class="ar" d="M100 186 V222"/>
<text class="m" x="110" y="201">git push results/&lt;id&gt;.log, .exit</text>
<text class="m" x="110" y="215">+ the files on its # PATHS line</text>
<rect class="box" x="50" y="224" width="342" height="62" rx="8"/>
<text class="t" x="221" y="242" text-anchor="middle">Coordinator: fetch, score, decide</text>
<text x="221" y="259" text-anchor="middle">llm_score.mjs · short_bench · error_analysis.mjs</text>
<text class="s" x="221" y="276" text-anchor="middle">against the threshold written before the run</text>
<path class="ar" d="M100 286 V318"/>
<text class="s" x="110" y="306">adopted</text>
<rect class="box" x="50" y="320" width="342" height="56" rx="8"/>
<text class="t" x="221" y="338" text-anchor="middle">stamp_models.py, commit to main</text>
<text class="s" x="221" y="355" text-anchor="middle">versions.json + registry versions;</text>
<text class="s" x="221" y="369" text-anchor="middle">only the coordinator commits</text>
<path class="ar" d="M100 376 V408"/>
<text class="s" x="110" y="396">git push main</text>
<rect class="acc" x="50" y="410" width="342" height="54" rx="8"/>
<text class="t" x="221" y="428" text-anchor="middle">GitHub Pages serves docs/</text>
<text class="s" x="221" y="446" text-anchor="middle">the browser loads each model with ?v=&lt;hash&gt;</text>
<path class="ar2" d="M50 437 H24 V39 H48"/>
<text class="s" x="18" y="480">next round: errors → data or fix → new job</text>
</svg>
</div>
<figcaption>Figure 5. The git runner (<code>training/laptop/runner.sh</code>, <code>training/laptop/README.md</code> “Without a link”). Nothing from
<code>gpu-runs</code> reaches <code>main</code> without the coordinator’s check. A job script may name <code># PATHS:</code> (files to push back when
it ends) and <code># AFTER:</code> (jobs to wait for); CPU threads per job = cores / jobs at once.</figcaption>
</figure>
<p class="note">For a machine that the Claude desktop app can link (Ubuntu/Debian), <code>training/laptop/README.md</code> also describes a Docker
“box” (<code>training/laptop/Dockerfile</code>). Agents do not commit or push (AGENTS.md): they leave changes in the working tree and the coordinator
reviews and commits.</p>
`, 'The scripts that build every model, their switches, and the git runner on the owner’s GPU machine.');

/* ============================================================ measurement */
page('measurement', 'Measurement and current numbers', `
<h2 id="metric">The main metric (owner, 2026-11-02)</h2>
<p><b>Do only what you are sure of, ask about the rest.</b> The research question is a reader that says clearly where it is not sure, not one
that approximates well (<a href="#help/research-question">What this project measures</a>). This replaces “ask as little as possible” of
2026-11-01 (DECISIONS.md).</p>
<div class="tw"><table>
<thead><tr><th>Number</th><th>Definition</th><th>Use</th></tr></thead>
<tbody>
<tr><td><b>Precision of execution</b></td><td>right / everything executed (requested actions executed, right or wrong, plus extras)</td><td>the headline of every reader</td></tr>
<tr><td>Requests done right</td><td>right / gold requests, at that precision</td><td>reported with it</td></tr>
<tr><td>Right at equal precision</td><td>the same, read off each reader’s risk-coverage curve at one precision</td><td>the comparison between readers</td></tr>
<tr><td>AUROC</td><td>how well the reader’s confidence separates its right from its not-right requests</td><td>reported beside</td></tr>
</tbody></table></div>
<p>Each reader executes a request only when its confidence clears a threshold chosen on held-out data by a protocol written before the run;
below it, it asks and says why (which words, which step). <b>Not done / asked</b> is never an error: it is the price paid for precision, and it
is reported. The Rules, which have no confidence, are measured the same way: what they execute and how much of it is right. The context
filler may still rank candidates, but the reader’s confidence decides whether its filling is executed.</p>
<h3 id="metric-requests">Under it: per requested action (owner, 2026-11-01)</h3>
<p>Per <b>requested action</b>, never per message: of the gold requests, the share done <b>right</b>, done <b>wrong</b> (executed with the wrong
action, shape or value), and <b>not done</b> (not understood, or asked); plus <b>extra</b>: the count of requests nobody asked for.
Decisions weigh “done wrong” first. A reference the reader leaves for the context (“it”, a name from an earlier sentence) is not an error.
Every number measured before 2026-11-02, including the table below, is in this form, with every request executed.</p>
<div class="callout" id="precision-measure"><p><b>Precision of execution</b> (<code>training/sketch/PRECISION.md</code>, thresholds fixed on the
held-out split): at 97%, VSS with its combined confidence (threshold 0.893) does 35.5% of the sample’s requests right at 95.8% precision and asks
about 52.2%; the VSS margin (at most 87.3%) and SOP-BERT’s smallest probability (at most 94.9%) reach 95% at no threshold; the Rules execute
everything at 67.1%. Tools: <code>precision.mjs</code>, <code>precision_confidence.mjs</code>, <code>precision_thresholds.json</code>. A fitted
confidence for SOP-BERT, for a fair comparison, is being measured (<code>PRECISION_BERT.md</code>). Summary: <a href="#help/research-question/precision-result">What this project measures</a>.</p></div>
<dl class="kv">
  <dt><code>training/sketch/llm_score.mjs</code></dt><dd>Scores a reader on folders of annotated messages. <code>SEG=composer</code>: the whole
  composer on whole messages; <code>SEG=gold</code> with <code>MODEL=micro/&lt;world&gt;</code>: one world on gold spans (no cut). <code>PAIR=value</code>
  pairs produced and gold requests by their values. Also scores the Rules reader.</dd>
  <dt><code>training/sketch/cut_bench.mjs</code></dt><dd>Every cut with every reader on the same gold (<a href="#help/cutting">One cut for all readers</a>).</dd>
  <dt><code>training/sketch/short_bench/</code></dt><dd><code>short_bench.mjs</code> (the demo’s six sets, called as the demo calls the reader),
  <code>agg.py</code> (per set), <code>classify.py</code> (the cause of each miss: A no unit, B partial unit, C right world not a candidate, D unknown-event,
  E wrong event, F lost to another world, G1/G2 the filler asks, H1/H2 role values).</dd>
  <dt><code>training/sketch/error_analysis.mjs</code></dt><dd>Root causes of one world’s misses on perfectly cut requests: A action word not
  recognized, B wrong action, C reader refuses, D value not reachable, E name not reachable, F role missed, G role wrong.</dd>
  <dt><code>training/laptop/neural_score.mjs</code></dt><dd>Rules, VSS and Neural on the same gold, with the scoring of <code>llm_score.mjs</code>,
  plus milliseconds per message.</dd>
  <dt><code>training/sketch/risk_coverage.mjs</code></dt><dd>Every produced request of VSS and SOP-BERT with its outcome and the reader’s
  confidence; the risk-coverage curves, AUROC, calibration and the thresholds chosen on held-out (RISK_COVERAGE.md).</dd>
  <dt><code>training/sketch/vss_confidence.mjs</code></dt><dd>A VSS confidence from every step of the chain, read from the composer from
  outside, combined by a logistic regression fitted on the held-out split (VSS_CONFIDENCE.md).</dd>
</dl>
<div class="callout"><b>Discipline (AGENTS.md “Experiments”).</b> Before a run: the hypothesis, the measure and the threshold for “it worked”,
written down and shown. No knobs turned on the fly; one change at a time; a miss is reported, not patched. After every evaluation: a
root-cause analysis of the misses, each classified by the first cause that explains it and <i>where</i> it sits (data, front end, our code,
calibration, model); fixes go where the cause is.</div>

<h2 id="confidence-now">How well each confidence knows when it is unsure</h2>
<div class="tw"><table>
<thead><tr><th>Confidence</th><th class="num">AUROC: sample · held-out · short held-out</th><th>Source</th></tr></thead>
<tbody>
<tr><td>VSS margin (the number behind <code>abstain</code>)</td><td class="num">0.59 · 0.58 · 0.57</td><td>RISK_COVERAGE.md</td></tr>
<tr><td>VSS, every step of the chain combined</td><td class="num">0.81 · 0.82 · 0.84</td><td>VSS_CONFIDENCE.md</td></tr>
<tr><td>SOP-BERT, smallest probability of its heads</td><td class="num">0.72 · 0.73 · 0.82</td><td>RISK_COVERAGE.md</td></tr>
</tbody></table></div>
<p class="note">Sample: the fixed 1000 messages (4858 requests); held-out: the 585 messages of SOP-BERT’s held-out split (for the combined VSS
confidence, which is fitted there, the out-of-fold value of 5 folds by message); short held-out: 299 one-line commands. The VSS worlds were trained on the sample, SOP-BERT never saw it (<a href="#help/chain-vs-one/fairness">fairness</a>).
Neither confidence decides anything in the demo yet.</p>

<h2 id="now">Current numbers per reader (earlier measure, every request executed)</h2>
<div class="tw"><table>
<thead><tr><th>Reader</th><th>Data, cut</th><th class="num">Right / wrong / not done (%)</th><th class="num">Extra</th><th>Source</th></tr></thead>
<tbody>
<tr><td>VSS (default registry)</td><td>sample (4858), VSS cut</td><td class="num"><b>77.2 / 11.4 / 11.4</b></td><td class="num">334</td><td>SHORT2.md §6, CUT_SHARED.md</td></tr>
<tr><td>VSS</td><td>short sets (1140), VSS cut</td><td class="num">61.1 / 11.1 / 27.7</td><td class="num">53</td><td>SHORT2.md §6</td></tr>
<tr><td>VSS</td><td>short sets written by hand (240)</td><td class="num">75.0 / 9.6 / 15.4</td><td class="num">—</td><td>SHORT2.md §6</td></tr>
<tr><td>Rules</td><td>sample, VSS cut (the default)</td><td class="num">73.6 / 11.9 / 14.5</td><td class="num">406</td><td>CUT_SHARED.md</td></tr>
<tr><td>Rules</td><td>sample, Rules cut</td><td class="num">67.9 / 16.8 / 15.3</td><td class="num">821</td><td>CUT_SHARED.md</td></tr>
<tr><td>Rules</td><td>short sets, Rules cut / by hand</td><td class="num">97.5 / 0.5 / 1.9 · 92.1 / 1.7 / 6.2</td><td class="num">16 · —</td><td>CUT_SHARED.md, SHORT.md §1</td></tr>
<tr><td>Neural: SOP-BERT</td><td>sample, its own cut (BERT)</td><td class="num"><b>80.8 / 16.5 / 2.8</b></td><td class="num">348</td><td>commit 1f3c806</td></tr>
<tr><td>Neural before SOP-BERT (act + QA pair, removed)</td><td>sample, Rules cut</td><td class="num">30.2 / 64.3 / 5.5</td><td class="num">1387</td><td><a href="#help/neural-reader/pair">The Neural reader</a></td></tr>
</tbody></table></div>
<p class="note">How VSS got there on the sample, 2026-11-01/02: 16 worlds with a shared front end 67.7 / 12.7 / 19.7 → 16 worlds with their own
front ends 72.8 / 11.5 / 15.7 (PLAN_A.md) · 7 worlds G7 69.6 / 14.3 / 16.1 (PLAN_B.md) → event hint H1 73.2 / 14.8 / 12.1 → plus shapes7c 74.9 /
13.1 / 12.0 (COMBINED.md) → cutter_worlds7s 75.5 / 13.1 / 11.3 (SHORT.md) → adapter fix 77.2 / 11.4 / 11.4 (SHORT2.md). The <code>about</code> text
inside <code>registry.json</code> still quotes 75.5 / 13.1 / 11.3, the figure before the adapter fix.</p>

<h2 id="round2">Round 2 of the worlds (trained, not the default)</h2>
<div class="tw"><table>
<thead><tr><th>Measure (ROUND2.md §6)</th><th class="num">Round 2</th><th class="num">Default today</th><th>Threshold “it worked” / regression</th></tr></thead>
<tbody>
<tr><td>B. Composer on the sample</td><td class="num">75.3 / 11.1 / 13.6</td><td class="num">77.2 / 11.4 / 11.4</td><td>right ≥ 76.5 and wrong ≤ 13.1 / right &lt; 75.0 or wrong &gt; 13.6</td></tr>
<tr><td>C. The six short sets</td><td class="num">62.5 / 11.0 / 26.6</td><td class="num">61.1 / 11.1 / 27.7</td><td>right ≥ 61.5 and wrong ≤ 12.4 / right &lt; 60.0 or wrong &gt; 12.9</td></tr>
</tbody></table></div>
<p>From commit 63274ae. On the sample, round 2 is below the “it worked” line (75.3 &lt; 76.5) but not a regression (≥ 75.0, wrong 11.1); on the
short sets it meets it. It is not the demo’s default; the per-component measures (A per event, D new operations) and their analysis were still
running when this page was written. The thresholds in ROUND2.md were set against an older baseline (75.5 / 13.1 / 11.3).</p>
`, 'The main metric (precision of execution, readers compared at equal precision), the per-request counts under it, the scripts that compute them, and every reader’s current numbers with their source.');

/* ============================================================ repository */
page('repository', 'Repository map', `
<div class="tw"><table>
<thead><tr><th>Folder</th><th>What it holds</th></tr></thead>
<tbody>
<tr><td><code>docs/</code></td><td>The site published by GitHub Pages: <code>docs/index.html</code> (the demo), <code>docs/architecture.html</code> (these pages as one page).</td></tr>
<tr><td><code>docs/js/</code></td><td>All the page’s code: engine and Rules (<code>logic.js</code>), VSS composer and its parts, Neural, spell checker, UI, help (<code>help.js</code>, <code>docs.js</code>, <code>docs-concepts.js</code>, <code>docs-arch.js</code>).</td></tr>
<tr><td><code>docs/js/vss/</code></td><td>The VSS reader in the browser: <code>loader.js</code>, <code>stars.js</code>, <code>routebook.js</code>, <code>reader.js</code>, <code>soplang.js</code>.</td></tr>
<tr><td><code>docs/model/</code></td><td>Every model the page loads, with <code>versions.json</code> (<a href="#help/models">Models and versions</a>).</td></tr>
<tr><td><code>docs/bench/</code></td><td>The six short benchmark sets.</td></tr>
<tr><td><code>training/sketch/</code></td><td>Data (<code>llm_train/</code>, <code>llm_bench/</code>), world building (<code>train_micro.sh</code>, <code>msg_to_world.py</code>, <code>llm_to_world.py</code>, <code>front.py</code>), cutters, context, scoring (<code>llm_score.mjs</code>, <code>cut_bench.mjs</code>), result documents, run logs (<code>runs/</code>), groupings (<code>worlds_micro/GROUPS_*.json</code>).</td></tr>
<tr><td><code>training/neural/</code></td><td>The neural models: <code>make_data.py</code>, <code>finetune.py</code>, <code>check_node.mjs</code> (the earlier act classifier); <code>make_roles.py</code>, <code>finetune_roles.py</code>, <code>check_roles_node.mjs</code>, <code>cut_node.mjs</code> (SOP-BERT); the sample ids.</td></tr>
<tr><td><code>training/laptop/</code></td><td>The GPU machine: <code>runner.sh</code> (git runner), <code>README.md</code>, <code>Dockerfile</code>, <code>neural_score.mjs</code>, zero-shot checks (<code>zs_check.mjs</code>, <code>zs_eval.mjs</code>).</td></tr>
<tr><td><code>training/vss/tool/sop/</code></td><td>The VSS trainer and exporter (<code>sop train</code>, <code>sop check</code>, <code>sop export-web</code>), copied from vss-demo.</td></tr>
<tr><td><code>skills/</code></td><td>Agent skills: <code>vss-microworlds</code>, <code>vss-world-design</code>, <code>llm-annotated-data</code>, <code>agent-experiments</code>.</td></tr>
<tr><td><code>research/</code>, <code>reports/</code></td><td>Earlier research notes (<code>research/hier/</code>, <code>research/attention/</code>) and a dated report.</td></tr>
<tr><td>root</td><td><code>AGENTS.md</code> (rules: read first), <code>README.md</code>, <code>DECISIONS.md</code>, <code>future-experiments.md</code>, <code>ISSUES_OTHER_REPOS.md</code>.</td></tr>
</tbody></table></div>

<h2 id="result-docs">Result documents of 2026-11-02 (<code>training/sketch/</code>)</h2>
<div class="tw"><table>
<thead><tr><th>Document</th><th>One line</th></tr></thead>
<tbody>
<tr><td><code>PLAN_B.md</code></td><td>The 7 worlds (GROUPS_7, grouped by cutter confusion) trained with <code>FRONT_ROWS=world</code>; per-event fit vs the 16 one-action worlds; composer G7 on the sample 69.6 / 14.3 / 16.1, extra 321; causes in shapes7 (create colour, verbless set, rule read as set).</td></tr>
<tr><td><code>EVENT_HINT.md</code></td><td>The event cutter and the hint. H1 worked (right 69.6 → 73.2, wrong 14.8, extra 300); H2 did not (70.0, extra 431).</td></tr>
<tr><td><code>CREATE_COLOR.md</code></td><td>shapes7c: a new shape’s colour in the event role. Missed its per-action threshold (create 70.3 &lt; 75.0); the colour error is fixed (507 → 16 wrong colours); in the composer 71.3 / 12.6 / 16.1.</td></tr>
<tr><td><code>COMBINED.md</code></td><td>shapes7c + H1 together: worked, 74.9 / 13.1 / 12.0, extra 302; became the default registry.</td></tr>
<tr><td><code>BETWEEN.md</code></td><td>“between A and B” loses its second anchor: the presence threshold of <code>landmark2</code> is fitted on 9 rows; refit on all rows → <code>N_CAL</code>. Its build (shapes7d) was dropped and the fix moved into round 2.</td></tr>
<tr><td><code>SEEDS_SHAPES7.md</code></td><td>Seed noise of a per-action difference: three cuda seeds of shapes7c trained on the GPU machine (jobs 003–005); the Result section is not written yet.</td></tr>
<tr><td><code>HOLDOUT_PURPLE.md</code></td><td>Can a world read a value it never saw? Mostly yes (100 of 128 purple requests), but a seen colour in the same message wins; missed by one request.</td></tr>
<tr><td><code>SHORT.md</code></td><td>VSS on short commands (51.0 right vs Rules 97.5): the cutter made no unit for 260 of 559 misses; cutter retrained with 3000 short commands → 60.5; narrowly missed its threshold; cutter_worlds7s became the default.</td></tr>
<tr><td><code>SHORT2.md</code></td><td>Causes of the remaining short-command misses; adapter fix (position value by what it is): sample 77.2 / 11.4 / 11.4; need_read and desc-ask tested and not adopted; fallback world removed.</td></tr>
<tr><td><code>DIAGRAM_OPS.md</code></td><td>Groups and double positions: SOP Lang forms, engine, Rules reader and adapter done and tested (<code>test_diagram_ops.mjs</code>); what the VSS worlds need.</td></tr>
<tr><td><code>ROUND2.md</code></td><td>Pre-registration of round 2: every world retrained once with all measured fixes, the 7 commands, thresholds A–D. Trained afterwards (commit 63274ae): not the default.</td></tr>
<tr><td><code>CUT_SHARED.md</code></td><td>One cut for all three readers: the VSS cut is better on whole messages for both readers, the Rules segmenter on one-line commands; default VSS.</td></tr>
<tr><td><code>RISK_COVERAGE.md</code></td><td>Does each reader know when it does not know? AUROC VSS margin 0.59, SOP-BERT 0.72 on the sample; risk-coverage curves; thresholds for SOP-BERT chosen on held-out.</td></tr>
<tr><td><code>VSS_CONFIDENCE.md</code></td><td>A VSS confidence from every step of the chain: AUROC 0.81 on the sample, 0.84 on short held-out commands; each weight named.</td></tr>
<tr><td><code>PRECISION.md</code></td><td>Precision of execution of each reader at a threshold fixed on held-out; at 97% only VSS with its combined confidence qualifies (35.5% done right on the sample, 52.2% asked).</td></tr>
</tbody></table></div>
<p class="note">Older documents in the same folder: <code>VSS_READER_SPEC.md</code> (what is given and learned), <code>ROUTER_V2.md</code> (the router),
<code>CUTTER.md</code>, <code>PLAN_A.md</code> (16 worlds), <code>LABEL_CONVENTIONS.md</code>, <code>ERROR_ANALYSIS.md</code>, <code>COMPOSER_ERRORS.md</code>,
<code>MICRO_ROUND1.md</code>, <code>MICRO_ROUND2.md</code>, <code>RESULTS.md</code> (first single-model runs). Several name model folders removed on 2026-11-02;
each says from which commit to restore them.</p>
`, 'Where everything is in the repository, and the result documents behind the numbers.');

/* ============================================================ planned */
page('planned', 'In progress', `
<p class="callout warn">Everything on this page is work in progress or a plan. None of it is used by the published demo today.</p>
<ul>
  <li><b>The confidence gate for VSS and SOP-BERT in the demo</b> (in progress; owner, 2026-11-02): each reader executes a request only when
  its confidence clears a threshold chosen on held-out data by a protocol written before the run, and below it asks, saying why (which words,
  which step). It replaces, for VSS, executing <code>abstain</code> readings and filling a gap whenever a candidate ranks first. The confidences
  measured so far: for VSS the one from every step of the chain (VSS_CONFIDENCE.md), for SOP-BERT the smallest probability of its heads
  (RISK_COVERAGE.md); the precision of every reader is measured (PRECISION.md): VSS’s threshold is fixed, a fitted confidence for
  SOP-BERT is being measured (PRECISION_BERT.md).</li>
  <li><b>A fresh test set neither reader has seen</b> (planned): realistic messages written and annotated after the models, read by no training.
  Today the sample is VSS training data and SOP-BERT never saw it, so neither the old measure nor precision compares them on equal footing
  (<a href="#help/chain-vs-one/fairness">Is the comparison fair?</a>).</li>
  <li><b>SOP-BERT, further measures</b>: the short sets, the BERT cut read by the other readers (<code>cut_bench.mjs</code>) and the root-cause
  analysis of its misses. The risk-coverage comparison with VSS is done (<a href="#help/knowing/experiment">Knowing what it does not know</a>).</li>
  <li><b>Round 2 of the VSS worlds</b>: trained (<code>registry_r2.json</code>), not the default (<a href="#help/measurement/round2">numbers</a>); the
  per-event and new-operation measures of ROUND2.md §6 and their root-cause analysis decide what is adopted, per world.</li>
  <li><b>Data for descriptions in roles</b> (SHORT2.md §3): annotated messages where descriptions (“the red circle”, “every gray square”, “the last
  star”, “not blue”) fill the entity roles, which today they almost never do (0–3.5% per role).</li>
  <li><b>The shared context rule holds one shape</b>: “them” after a list of names cannot be filled by any reader that uses it
  (<code>make_roles.py</code> counts these context fillers as ones that cannot come out right).</li>
  <li><b><code>future-experiments.md</code></b>: the VSS reader decides the action from the construction, not only from a verb (variant (b) of the
  event hint; needs the owner’s approval); catastrophic forgetting in the fine-tuned BERT readers, and LoRA adapters per family of actions;
  ModernBERT as the base of the neural reader; the same readers on a legend where a wrong action is costly, as the real test of the main metric.</li>
  <li><b>Debt listed in ROUND2.md §7</b>: value n-grams applied longest-first, ambiguous position phrases inside move, chain pairing words in
  links, names that are colour words, “box” as rectangle.</li>
</ul>
`, 'Work that is not in the demo yet.');

const DocsArch = { pages, AS_OF };
if (typeof module !== 'undefined') module.exports = DocsArch; else root.DocsArch = DocsArch;
})(typeof window !== 'undefined' ? window : this);
