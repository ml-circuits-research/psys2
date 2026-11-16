/* "Concepts": the ideas behind the three readers, for a visitor who wants to know why the system is built this way (Help overlay,
   docs/js/docs.js, #help/<id>). Every number names the committed result document it comes from (training/sketch/*.md unless said otherwise).
   Sentences in <button class="say" data-quick> are sent to the editor when clicked; they are written for the drawing the page opens with. */
(function (root) {
'use strict';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const say = t => `<span class="hsay"><button type="button" class="say" data-quick="${esc(t)}" title="Send this message">${esc(t)}</button></span>`;
const says = (...ts) => `<div class="says">${ts.map(say).join('')}</div>`;
const AH = '<defs><marker id="ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ahead" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
const pages = [];
const page = (id, title, lead, html) => pages.push({ id, title, lead, html });

/* ============================================================ the research question and the metric (owner, 2026-11-02) */
page('research-question', 'What this project measures',
'The research question: a reader that says clearly where it is not sure, does only what it is sure of, and asks about the rest. The main number is its precision of execution; readers are compared by how much they get done at equal precision.', `
<h2 id="rq-question">The question</h2>
<p>Three readers turn English into SOP Lang wires (<a href="#help/why-three">Three readers side by side</a>). Which of them gets the most
requests right is not the question this project studies. The question is: <b>can a reader tell, request by request, whether it is sure, do
only what it is sure of, and ask about the rest, saying why?</b></p>
<div class="callout" id="rq-owner">
<p>“Let VSS show what it is good at: tell us clearly where it is not sure. In drawing it is not that important, although in the end
correctness beats everything in general; better that it asks, does only what it is sure of, and this should be the most important metric we
follow; that is how we compare. For approximations there are solutions, we have LLMs, but the important result, and what we pursue in
research, is this. In the diagram world the consequence is not that big, it can be annoying, but if the decisions were of life and death this
matters most. Document this and reposition everything from this perspective. Better more fearful and with questions than making stupid
decisions with confidence that have consequences.”</p>
<p class="note">The owner, 2026-11-02, translated from Romanian. It replaces the rule of 2026-11-01, “ask as little as possible”
(AGENTS.md, “What counts as an error”; DECISIONS.md).</p>
</div>

<h2 id="rq-metric">The metric, in plain words</h2>
<div class="tw"><table>
<thead><tr><th>Number</th><th>What it counts</th><th>Its place</th></tr></thead>
<tbody>
<tr><td><b>Precision of execution</b></td><td>Of everything the reader executes (requested actions and extras nobody asked for), the share done right.</td><td>The headline number of every reader.</td></tr>
<tr><td>Requests done right</td><td>Of the actions that were requested, the share executed and right.</td><td>Reported at that precision.</td></tr>
<tr><td>Requests done right at equal precision</td><td>The same share, with every reader held to the same precision (its risk-coverage curve).</td><td>How two readers are compared.</td></tr>
<tr><td>AUROC of the confidence</td><td>How well the reader’s confidence tells its right readings from its wrong ones: 0.5 says nothing, 1 is perfect.</td><td>Reported beside.</td></tr>
<tr><td>Not done / asked</td><td>Requests the reader asked about instead of executing.</td><td>Never an error: the price paid for precision. Reported.</td></tr>
</tbody></table></div>
<p>Each reader executes a request only when its own confidence clears a <b>threshold</b>. The threshold is chosen once, on held-out data, by a
protocol written before the run, never on the set the result is reported on. Below it the reader asks, and says why: which words it did not
understand, or which step was unsure (the cut, the world, a role, what “it” refers to). A reader without a confidence, the Rules, is measured
the same way: what it executes, and how much of that is right.</p>
<p class="note">An example of the arithmetic, not data: a reader that executes 50 of 100 requests and gets 49 of them right has a precision of
98% and does 49% of the requests right. A reader that executes all 100 and gets 85 right has a precision of 85%. Which of the two is better is
decided at equal precision: held to 98%, does the second still do more than 49% of the requests right?</p>

<h2 id="rq-stakes">Why precision first</h2>
<p>In a drawing a confident mistake costs one undo: it is annoying, and it has to be noticed first. A question costs one more message. If that
were all, asking little would be the better trade, and on 2026-11-01 that was made the rule. But the drawing is the test bench of this project,
not its goal. Where a wrong action has serious consequences (a dose, a safety setting, a payment), a reader that is confidently wrong is the
failure that matters, and a reader that stops and asks is the one that can be used. A reader that is good in that sense shows it already in a
drawing: by what it chooses to execute, and by how often that is right.</p>
<p>So a request <b>done wrong</b> is the error, and a request <b>not done / asked</b> is the honest outcome: better more fearful and with
questions than wrong with confidence.</p>

<h2 id="rq-llm">Why approximators are not the answer</h2>
<p>A large language model, or a fine-tuned transformer such as our SOP-BERT, produces a plausible reading of nearly every message. That is
approximation; it is available and often good. Its output does not tell, by itself, which of its readings are reliable: a fluent answer looks
the same whether it is right or not. Our own transformer shows this at small scale. Its tokenizer gives every word a meaning, so nothing is ever
“unknown”: it leaves 2.8% of the sample’s requests undone and does 16.5% wrong (right / wrong / not done of requested actions, commit 1f3c806).
Its probabilities do rank its readings, but run too high below 0.95 (RISK_COVERAGE.md); a threshold on them is part of the comparison.</p>
<p>The research question is whether a reader can be built whose “I am not sure” is reliable and can be explained: which words, which step.
That is what VSS is meant to show. Its reading is a chain of named steps (<a href="#help/chain-vs-one">One model or a chain</a>), and each step
can say “not sure”.</p>

<h2 id="rq-now">Where it stands (2026-11-02)</h2>
<ul>
  <li><b>Measured</b>: how well each reader’s confidence separates its right readings from its wrong ones. AUROC on the 1000-message sample: the
  VSS margin 0.59 and SOP-BERT 0.72 (RISK_COVERAGE.md); a VSS confidence built from every step of its chain 0.81 (VSS_CONFIDENCE.md).
  <a href="#help/knowing">Knowing what it does not know</a>.</li>
  <li><b>Not in the demo yet</b>: no reader executes only above a threshold. VSS still executes readings with status <code>abstain</code>; its
  context filler fills a gap whenever one candidate ranks first (the 2026-11-01 rule); SOP-BERT executes everything it reads. The confidence
  gate for VSS and SOP-BERT is in progress (<a href="#help/planned">In progress</a>).</li>
  <li><b>Planned</b>: a fresh test set that neither reader has seen. The sample is VSS training data and SOP-BERT never saw it
  (<a href="#help/chain-vs-one/fairness">Is the comparison fair?</a>).</li>
</ul>
<div class="callout" id="precision-result">
<p><b>First result (2026-11-02, <code>training/sketch/PRECISION.md</code>).</b> Each learned reader executes a request only when its confidence
clears a threshold; the threshold is the lowest at which its precision of execution reaches the level on the held-out split, fixed there and
then applied unchanged. Precision of execution counts every executed action, extras included.</p>
<table>
<tr><th>Reader</th><th>Can it reach 97% precision?</th><th>Sample: precision · requests done right · asked</th></tr>
<tr><td>VSS, confidence from every step</td><td>yes (threshold 0.893)</td><td>95.8% · 35.5% · 52.2%</td></tr>
<tr><td>VSS, the old margin</td><td>no: at most 87.3%</td><td>—</td></tr>
<tr><td>SOP-BERT, smallest probability</td><td>no: at most 94.9%</td><td>—</td></tr>
<tr><td>Rules (no confidence: executes all)</td><td>no</td><td>67.1% · 68.0% · 0%</td></tr>
</table>
<p>In plain words: today only VSS, with the confidence built from every step of its chain, can be set to make at most about 1 silent mistake
in 30 executed actions. The price is high: it then does about a third of the requests and asks about half (on the held-out split 97.1% ·
38.7% · 48.4%; at 95% it does about half). SOP-BERT executing everything does the most right (80.8%) at a precision of 77.4%; even its most
confident requests are wrong about 1 in 20. The Rules are precise only on the short template sets written from their own cues (98.9%).</p>
<p class="note">Cautions. The sample is VSS training data and SOP-BERT never saw it. VSS’s confidence was fitted on the same held-out split its
threshold was chosen on, so 97% there is slightly optimistic; on other sets it lands at 95.5–95.8%. SOP-BERT was given only the simplest
confidence (the smallest probability), VSS a fitted one: the same treatment for SOP-BERT is being measured (<code>PRECISION_BERT.md</code>).
The gate is not in the demo yet; it is being built.</p>
</div>
`);

/* ============================================================ why three */
page('why-three', 'Three readers side by side',
'The same message, read three different ways, on the same cut, with the same scoring: a fair test of hand-written rules, small vector-symbolic models and a fine-tuned transformer, judged first by how much of what each executes is right.', `
<p>Each reader has its own copy of the engine and its own drawing. When you send a message, all three read it and you see three lines in the
reply and three drawings under the tabs. That makes their differences visible one message at a time, which totals in a table never do.</p>
<p>Try a message with more than one request and some text that is not a request, then open <b>details</b> under the reply:</p>
${says('Hi, I am sketching a workflow. Draw a red circle named Hub in the center and connect Start to it. Thanks!')}

<h2 id="fair">What makes the comparison fair</h2>
<ul>
  <li><b>One language.</b> Every reader writes SOP Lang wires and nothing else, and one engine carries them out. A difference in the drawing is a
  difference in reading, never in drawing code.</li>
  <li><b>One cut.</b> The message is cut into requests once, and all three read the same requests (<a href="#help/cutting">One cut for all readers</a>).
  Before this rule, a reader that cut badly lost requests no matter how well it read them, and the tabs mixed two questions into one.</li>
  <li><b>One legend, one cue list.</b> Rules and VSS use the same legend and the same cue words, and a word added for one is added for both,
  only from training data (AGENTS.md).</li>
  <li><b>One measure.</b> The headline is the <b>precision of execution</b>: of everything a reader executes, the share done right; readers
  are compared by the share of requests they do right <b>at equal precision</b> (owner, 2026-11-02; <a href="#help/research-question">What this
  project measures</a>). Under it, per requested action: right, wrong (done with the wrong action, shape or value) and not done (not understood,
  or asked), plus extra actions nobody asked for. Not per message: a message with 12 requests is almost never entirely right, and that says nothing.</li>
</ul>

<h2 id="table">The three, in one table</h2>
<div class="tw"><table>
<thead><tr><th></th><th>Rules</th><th>VSS</th><th>Neural</th></tr></thead>
<tbody>
<tr><th>Learns from</th><td>nothing: written by hand</td><td>our annotated requests only</td><td>English text in general (pretraining), then our annotated requests</td></tr>
<tr><th>Size</th><td>code</td><td>38.0 MB, seven worlds of 1.2–8.1 MB</td><td>68.5 MB, one DistilBERT in 8-bit form</td></tr>
<tr><th>Confidence</th><td>none: it executes what its rules match</td><td>a margin per reading (weak); a confidence from every step of its chain, measured, not in the demo</td><td>a probability per head (ranks well, runs high)</td></tr>
<tr><th>When unsure, today</th><td>says it did not understand</td><td>says what it did not understand, or asks which shape; executes readings it is unsure of (status <code>abstain</code>)</td><td>rarely stops (2.8% not done): it reads something</td></tr>
</tbody></table></div>
<p class="note">Sources: RISK_COVERAGE.md and VSS_CONFIDENCE.md (confidence), commit 1f3c806 (SOP-BERT), <code>du -sb</code> and
<code>versions.json</code> (sizes).</p>

<h2 id="numbers">The numbers</h2>
<p>The main number, the precision of execution of each reader at its own threshold, is being measured
(<a href="#help/research-question/precision-result">the placeholder</a>). The numbers measured so far are the earlier measure, every request
executed:</p>
<div class="tw"><table>
<thead><tr><th>Reader</th><th class="num">Sample: right / wrong / not done</th><th class="num">Short sets: right / wrong / not done</th></tr></thead>
<tbody>
<tr><td>Rules</td><td class="num">73.6 / 11.9 / 14.5 (VSS cut)</td><td class="num">97.5 / 0.5 / 1.9 (Rules cut)</td></tr>
<tr><td>VSS</td><td class="num">77.2 / 11.4 / 11.4 (VSS cut)</td><td class="num">61.1 / 11.1 / 27.7 (VSS cut)</td></tr>
<tr><td>Neural (SOP-BERT)</td><td class="num">80.8 / 16.5 / 2.8 (its own cut)</td><td class="num">—</td></tr>
</tbody></table></div>
<p class="note">% of requested actions. Sources: CUT_SHARED.md (Rules, VSS), commit 1f3c806 (SOP-BERT). The sample is 1000 realistic
messages with 4858 requests; the short sets are the demo’s 1140 one-line commands.</p>
<p>On this earlier measure no reader wins everywhere: the rules are nearly perfect on the short commands they were written for and lose on
long, natural messages; VSS does fewer wrong on whole messages and is weak on very short ones; SOP-BERT does the most right on whole messages
and also the most wrong, because it almost never stops. The question that matters here is different: when each reader executes only what it
is sure of, how much of what it executes is right, and how much does it still get done? The first answers, at an equal share of requests done
wrong, are in <a href="#help/knowing">Knowing what it does not know</a>.</p>
`);

/* ============================================================ rules vs learned */
page('rules-vs-learned', 'What rules do well, and where they fail',
'Hand-written rules are exact where their author looked and blind elsewhere. That is why the other two readers learn from data.', `
<h2 id="good">Where rules are excellent</h2>
<p>On the demo’s short one-line commands the Rules reader gets <b>97.5%</b> of the requests right, 0.5% wrong (CUT_SHARED.md). It is instant and
needs no download. These are the sentences its author had in mind:</p>
${says('Make Done red', 'Connect Start to Done with a dashed arrow', 'How many circles are there?')}
<p class="note">A fair caveat: three of the six short sets are generated from templates written by the same author as the rules, so they favour
the rules. On the 240 requests written by hand the figure is 92.1 / 1.7 / 6.2 (SHORT.md §1).</p>

<h2 id="bad">Where they fail</h2>
<p>Real messages are longer: a greeting, a reason, two or three requests, a correction (“no wait, make it blue”). On the fixed sample of 1000
such messages the same rules, with their own cut, get <b>67.9%</b> right and <b>16.8% wrong</b>, and do <b>821</b> actions nobody asked for
(CUT_SHARED.md). Two causes:</p>
<ul>
  <li><b>The cut.</b> The rules’ segmenter splits sentences and clauses; it cannot tell a request from the text around it. On the sample it made
  6051 units for 4858 requests, 1202 of them extra (CUT_SHARED.md). Each extra unit is a chance to do something nobody asked for.</li>
  <li><b>The words.</b> Cue words are a hand-written list. A verb or a phrasing the author did not think of is not understood, and a familiar
  word in an unfamiliar place is read as if it were a command. The list does not generalise; adding words one by one does not end.</li>
</ul>
<p>Given the VSS reader’s cut, the same rules make a third fewer wrong actions (11.9%) and half the extras (406): much of their trouble was the cut,
not the reading (CUT_SHARED.md).</p>
<p>The rules have no confidence: they execute whatever their cue words match, and stop only where nothing matches. Under the main metric
(<a href="#help/research-question">What this project measures</a>) they are measured like the other two: what they execute, and how much of
that is right (AGENTS.md).</p>

<h2 id="learned">What learning from data changes</h2>
<p>VSS and SOP-BERT are not given word lists: every mapping from words to the legend (which verb means which action, which phrase means which
value, where a request starts and ends) is learned from realistic messages annotated by hand (AGENTS.md: “No hand-written equivalences”). A
new way of saying something is fixed by adding annotated examples, not by writing a rule, and the old tests are re-run to show nothing was lost.</p>
<p>The price is honesty work: a learned reader is measured on every change, its misses are classified by cause before anything is changed
(<a href="#help/measurement">Measurement</a>), and its rules of thumb must come from data, never from a table that “helps”.</p>
`);

/* ============================================================ VSS worlds */
page('vss-worlds', 'What a VSS world is',
'A small reader for one family of actions that share the same roles, trained on our annotated requests. Seven of them read better than one large model.', `
<h2 id="idea">The idea</h2>
<p>A request names an action and fills its <b>roles</b>: “make the circle red” is the action <i>set</i> with a target (the circle) and a colour
(red). A <b>world</b> is a small model that knows a few actions whose roles are alike, for example the <i>links</i> world: connect and
disconnect, with a start, an end, a style and an arrow head.</p>
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 300" role="img" aria-labelledby="cw1">
<title id="cw1">A world reads one request: words, front end, route book, a frame with the event and its roles, the SOP Lang wire</title>
${AH}
<rect class="box" x="70" y="8" width="260" height="36" rx="8"/>
<text class="t" x="200" y="24" text-anchor="middle">“connect Start to Done with a dashed arrow”</text>
<text class="s" x="200" y="38" text-anchor="middle">one request, as cut</text>
<path class="ar" d="M200 44 V60" style="marker-end:url(#ahc)"/>
<rect class="box" x="70" y="62" width="260" height="40" rx="8"/>
<text class="t" x="200" y="79" text-anchor="middle">Front end of the world (learned)</text>
<text class="m" x="200" y="94" text-anchor="middle">connect NAME to NAME with a dashed arrow</text>
<path class="ar" d="M200 102 V118" style="marker-end:url(#ahc)"/>
<rect class="mod" x="40" y="120" width="320" height="58" rx="8"/>
<text class="t" x="200" y="138" text-anchor="middle">Route book (VSA): each word gets a vector</text>
<text x="200" y="154" text-anchor="middle">and an address from its position and its neighbours;</text>
<text x="200" y="169" text-anchor="middle">learned from the annotated requests of this world</text>
<path class="ar" d="M200 178 V194" style="marker-end:url(#ahc)"/>
<rect class="acc" x="40" y="196" width="320" height="50" rx="8"/>
<text class="t" x="200" y="214" text-anchor="middle">Frame: event connect</text>
<text class="m" x="200" y="232" text-anchor="middle">source=Start target=Done style=dashed</text>
<path class="ar" d="M200 246 V262" style="marker-end:url(#ahc)"/>
<rect class="box" x="40" y="264" width="320" height="30" rx="8"/>
<text class="m" x="200" y="283" text-anchor="middle">@s1 command action=connect from=Start to=Done style=dashed</text>
</svg>
</div>
<figcaption>One world reading one request. The words are vectors (vector-symbolic: long lists of numbers that can be added and bound together);
the route book is what training learns. Details: <a href="#help/vss-reader/worlds">The VSS reader</a>.</figcaption>
</figure>
${says('Connect Start to Done with a dashed arrow')}
<p>A world reads only its own actions and says so when it cannot: a word it never saw has kind “unknown”, and with no action word it returns
<code>unknown-event</code> instead of guessing (VSS_READER_SPEC.md). It can still read a value it never saw if the value is in the legend:
a world trained without a single “purple” read 100 of 128 purple requests right (HOLDOUT_PURPLE.md).</p>

<h2 id="why-small">Why several small worlds and not one model</h2>
<p>One model for every action has to keep apart roles that look alike but mean different things: the colour of a new shape, the colour that
changes an old one, the colour asked about in a question. The measured path, all on the same 1000-message sample (right / wrong / not done):</p>
<div class="tw"><table>
<thead><tr><th>Step</th><th class="num">Right / wrong / not done</th><th>Document</th></tr></thead>
<tbody>
<tr><td>One general model, as the fallback of the composer: units of actions no world had</td><td class="num">read 0 of 4643 requests in the 7-world composer</td><td>SHORT2.md §7</td></tr>
<tr><td>16 one-action worlds, shared front end</td><td class="num">67.7 / 12.7 / 19.7</td><td>PLAN_B.md (= PLAN_A variant 2)</td></tr>
<tr><td>16 worlds, each with its own front end</td><td class="num">72.8 / 11.5 / 15.7</td><td>PLAN_A.md</td></tr>
<tr><td>7 worlds grouped by cutter confusion (G7)</td><td class="num">69.6 / 14.3 / 16.1</td><td>PLAN_B.md</td></tr>
<tr><td>G7 + event hint + colour fix + short-command cutter + adapter fix (today)</td><td class="num"><b>77.2 / 11.4 / 11.4</b></td><td>COMBINED.md, SHORT.md, SHORT2.md</td></tr>
</tbody></table></div>
<p>Why 7 and not 16: with 16 worlds the cutter has to pick among 16 labels, and most of its confusions were between worlds (only 20.0% of them fell
inside one world); grouping by those confusions put 64.5% of them inside one world (PLAN_B.md). Fewer worlds also mean fewer worlds reading the
same unit and fewer ties decided by order (308 in G7, 450 with 16 own-front worlds). The first G7 was not better than the 16 worlds in every
column; the fixes below, made on G7, brought it to 77.2. The rule we follow: <b>one world per family of actions that use the same roles,
merged or split by measurement, one step at a time.</b></p>
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 196" role="img" aria-labelledby="cw2">
<title id="cw2">The seven worlds and their actions</title>
<rect class="mod" x="8" y="8" width="188" height="52" rx="7"/><text class="t" x="102" y="27" text-anchor="middle">shapes</text><text class="s" x="102" y="45" text-anchor="middle">create set resize fact rule</text>
<rect class="mod" x="204" y="8" width="188" height="52" rx="7"/><text class="t" x="298" y="27" text-anchor="middle">links</text><text class="s" x="298" y="45" text-anchor="middle">connect disconnect</text>
<rect class="mod" x="8" y="68" width="188" height="52" rx="7"/><text class="t" x="102" y="87" text-anchor="middle">position</text><text class="s" x="102" y="105" text-anchor="middle">move swap arrange align …</text>
<rect class="mod" x="204" y="68" width="188" height="52" rx="7"/><text class="t" x="298" y="87" text-anchor="middle">graphq</text><text class="s" x="298" y="105" text-anchor="middle">check connected path cycle …</text>
<rect class="mod" x="8" y="128" width="124" height="60" rx="7"/><text class="t" x="70" y="149" text-anchor="middle">questions</text><text class="s" x="70" y="167" text-anchor="middle">count list extreme …</text>
<rect class="mod" x="138" y="128" width="124" height="60" rx="7"/><text class="t" x="200" y="149" text-anchor="middle">manage</text><text class="s" x="200" y="167" text-anchor="middle">delete copy rename label</text>
<rect class="mod" x="268" y="128" width="124" height="60" rx="7"/><text class="t" x="330" y="149" text-anchor="middle">history</text><text class="s" x="330" y="167" text-anchor="middle">undo redo forget</text>
</svg>
</div>
<figcaption>The seven worlds of <code>training/sketch/worlds_micro/GROUPS_7.json</code>.</figcaption>
</figure>

<h2 id="wrong">What went wrong when grouping, and how it was fixed</h2>
<ul>
  <li><b>The colour of a new shape was in another place than the colour of a change.</b> Once create and set shared the shapes world, “draw a red
  circle” put red where “make it red” puts it differently, and create fell to 28.2% right (PLAN_B.md). Writing a new shape’s colour in the same
  event role as every other colour fixed it: wrong colours in create 507 → 16 (CREATE_COLOR.md).
  ${says('Draw a red circle named Hub in the center', 'Make Done red')}</li>
  <li><b>An action without a verb was lost.</b> Inside a world with several actions, “Hub teal” or “Alpha to Beta” has no verb, so the world
  cannot tell set from create. A second cutter, trained to name the action of each request, gives a hint used only then: right 69.6 → 73.2
  (EVENT_HINT.md).</li>
  <li><b>Thresholds fitted on 400 rows.</b> Whether a role is present is decided by a threshold fitted on a sample of 400 training rows; the second
  anchor of “between A and B” had only 9 rows in it, and was lost. Fitting on all rows (<code>N_CAL</code>) is in round 2 (BETWEEN.md, ROUND2.md).
  ${says('Draw a teal square named Box between Start and Done')}</li>
  <li><b>A fallback world that read nothing.</b> A general model kept “just in case” read 0 of 4643 requests on the sample and 0 of 877 on the short
  sets; removing it changed no number, so it was removed (SHORT2.md §7).</li>
</ul>

<h2 id="watch">What we watch</h2>
<p>First, the <b>precision of execution</b>: of everything the worlds execute, the share done right; then how many of the requests they do
right at that precision (owner, 2026-11-02; <a href="#help/research-question">What this project measures</a>). A request done with the wrong
shape or value is a silent error; “I didn’t understand” or “Which circle?” is honest and costs one more message. Under it we still count, per
requested action, right, wrong, not done and extra, and the cause of every miss.</p>
<p>What changes for VSS: the rule of 2026-11-01 was to ask as little as possible, so the context filler fills a gap whenever one candidate
ranks first and asks only when the learned “nobody” ranks first; that is still how the demo behaves. Now a reading, a filled “it” included, is
to be executed only when the VSS confidence clears a threshold chosen on held-out data; below it, VSS asks and says which word or which step it
is not sure of. The filler keeps ranking the candidates; it no longer decides alone. This gate is in progress
(<a href="#help/planned">In progress</a>).</p>
${says('Make the green circle bigger')}
`);

/* ============================================================ BERT */
page('bert', 'What we do with BERT',
'A pretrained transformer already knows English; fine-tuning teaches it our legend. SOP-BERT is one such model with several small heads.', `
<h2 id="what">The model</h2>
<p>BERT-family models are trained on a large amount of English text to predict missing words. In doing so they learn what words mean and how
sentences are built. <b>DistilBERT</b> is a smaller version (6 layers instead of 12). We do not train it from zero: we take the pretrained
<code>distilbert-base-uncased</code> and <b>fine-tune</b> it on the same annotated requests the VSS worlds learn from.</p>
<p><b>SOP-BERT</b> is one DistilBERT with several small heads, each a single layer on top of the shared encoder: one cuts the message into requests,
one reads the action, one per legend key reads its value, one decides who fills each role (a written name, “it”, or a description such as “the red
circle”), and one tags the words that are names, labels and numbers. The wires are then assembled by the legend, without the Rules reader.
<a href="#help/neural-reader/sop-bert">The details and the diagram</a>.</p>

<h2 id="history">How we got here</h2>
<ol>
  <li><b>Zero-shot.</b> The first Neural reader used ready-made models with no training on our data: a natural-language-inference model asked
  whether “The user wants to create a new shape” follows from the message (<code>training/laptop/zs_check.mjs</code>, <code>zs_eval.mjs</code>).
  Such a model is trained to judge statements against statements, not to recognise commands, and it read the kind of request badly; its scores
  are not in a committed result document, only the scripts that produce them are.</li>
  <li><b>Fine-tuned act.</b> A DistilBERT fine-tuned on our requests to name the act: <b>98.7%</b> right on the 4858 requests of the sample it never
  saw, 98.3% on the blind set, 100% on the hand-written one (act-distilbert README). The details were still answered by a ready-made
  question-answering model, and those were mostly wrong: 30.2% of requests right in all (<a href="#help/neural-reader/pair-score">the run</a>).</li>
  <li><b>SOP-BERT.</b> The details read by heads trained on our annotation, references and descriptions included, and the cut too: on the sample
  <b>80.8%</b> right, 16.5% wrong, 2.8% not done, against VSS 77.2 / 11.4 / 11.4 (commit 1f3c806). The demo’s only neural model since 2026-11-02;
  the pair was removed.</li>
</ol>

<h2 id="tradeoff">What a fine-tuned transformer brings, and what it costs</h2>
<div class="tw"><table>
<thead><tr><th>Brings</th><th>Costs</th></tr></thead>
<tbody>
<tr><td>It knows English words that never occur in our data: a synonym it was not shown still has a meaning to it. A VSS world gives such a word the kind “unknown”.</td><td>Size: 68.5 MB for one DistilBERT in 8-bit form, against 1.2–8.1 MB for a VSS world.</td></tr>
<tr><td>One model reads every action; no grouping into worlds. Two calls per message: 22.6 ms per message in its scoring run (commit 1f3c806).</td><td>It almost never says “I don’t know”: what it cannot read, it guesses (<a href="#help/knowing">Knowing what it does not know</a>).</td></tr>
<tr><td>It learns the cut, the action and the details together.</td><td>One model: a fix for one action means retraining the whole model, and it can forget what it knew (see below).</td></tr>
<tr><td>It reads “it” and “the red circle” with its own heads, so it needs no hand-written reader beside it (the pair borrowed both from the Rules reader).</td><td>Less inspectable: a VSS reading shows which word filled which role and with what margin; a transformer’s heads give a score, not a reason.</td></tr>
</tbody></table></div>

<h2 id="future">Forgetting, and adapters</h2>
<p>Fine-tuning a whole model again on new examples can make it worse on what it read well before (catastrophic forgetting). Two experiments are
written down, not run: measuring that forgetting in our readers, and LoRA adapters (small extra weights per family of actions, the encoder
left unchanged), much like VSS worlds per family (<code>future-experiments.md</code>; also ModernBERT as a newer base model).</p>
`);

/* ============================================================ knowing */
page('knowing', 'Knowing what it does not know: VSS vs SOP-BERT',
'The main number of this project is the precision of execution: a reader should execute only what it is sure of and ask about the rest, so it must know when it is unsure. We expected VSS to know this better. Measured: the VSS margin barely does, SOP-BERT’s probabilities do; a VSS confidence built from every step of its chain does best of the three. This page says how, and why.', `
<h2 id="measured">Every request executed: the earlier measure</h2>
<div class="tw"><table>
<thead><tr><th>Fixed 1000-message sample, 4858 requests, no threshold</th><th class="num">Right</th><th class="num">Wrong</th><th class="num">Not done</th><th class="num">Extra</th></tr></thead>
<tbody>
<tr><th>VSS (7 worlds, VSS cut)</th><td class="num">77.2</td><td class="num"><b>11.4</b></td><td class="num">11.4</td><td class="num">334</td></tr>
<tr><th>SOP-BERT (its own cut)</th><td class="num"><b>80.8</b></td><td class="num">16.5</td><td class="num">2.8</td><td class="num">348</td></tr>
</tbody></table></div>
<p class="note">% of requested actions. Sources: CUT_SHARED.md (VSS), commit 1f3c806 (SOP-BERT).</p>
<p>SOP-BERT does 3.6 more requests in a hundred right, and 5.1 more wrong. It leaves almost nothing undone: when it is unsure, it still reads
<i>something</i>, and that something is executed. VSS leaves 11.4 in a hundred undone, and tells you which part it did not understand.</p>
<p>These totals do not answer the question of this project. A request <b>not done</b> is visible at once (“I didn’t understand …”) and costs
one more message. A request <b>done wrong</b> is silent: the drawing changes in a way you did not ask for, and you have to notice it before you
can undo it; where actions have serious consequences, that is the failure that matters. So the comparison that counts is made after each reader
has turned its unsure requests into questions: of what it then executes, how much is right (its <b>precision of execution</b>), and how many
requests it still does right at the same precision (owner, 2026-11-02; <a href="#help/research-question">What this project measures</a>). For
that a reader needs a confidence that knows when it is unsure; the rest of this page measures exactly that.</p>

<h2 id="vss-knows">How VSS knows that it does not know</h2>
<ul>
  <li><b>Unknown words stay unknown.</b> A word never seen in training gets the kind “unknown”. It is not given a guessed meaning; if it was needed,
  the request is reported: the details say <i>Ignored (not understood): “…”</i>, and the reply says “I didn’t understand …”.</li>
  <li><b>Every reading has a status.</b> <code>ok</code>; <code>abstain</code> (a margin under 0.05: uncertain, still executed today);
  <code>unknown-event</code> (no action word found); <code>no-sense</code> (more than half of the words could not be placed). A reading with an
  unreadable status is not executed. That <code>abstain</code> is still executed is the opposite of the main metric; the confidence gate in
  progress replaces it (<a href="#help/planned">In progress</a>).</li>
  <li><b>Every role has a margin and a threshold.</b> Whether a role is present is decided by a threshold fitted on training rows; below it the
  role stays empty. An empty role the action needs goes to the context filler, which today fills it whenever one candidate ranks first (margin
  0, the 2026-11-01 rule) and otherwise <b>asks</b> (“Which circle? Start or Done”). Under the 2026-11-02 rule, whether such a filling is
  executed is decided by the VSS confidence, not by the ranking alone.</li>
  <li><b>You can follow it word by word.</b> Under <b>details</b>, each request shows the words as the world normalised them, which words it could not
  place, the margins, the status and the <b>residual</b>: how much of the request the reading does not explain.</li>
</ul>
<p>Try a message with an invented verb, then compare the VSS and Neural lines of the reply, and open <b>details</b>:</p>
${says('Make Done red, then frobnicate Check', 'Snorkle Process')}
<p>Run through the VSS composer in node on the opening drawing (2026-11-02): in the first message VSS makes Done red and reports “then frobnicate
Check” as not understood; the second it does not read at all and says so.</p>
<p class="callout warn"><b>VSS is not immune.</b> The same run read “Frobnicate the green circle” as a resize and “Florp Start next to Done” as a
move: when the rest of a request looks like a known action (a shape and a place), the event hint and the world’s roles supply an action the
verb did not give. Unknown words stay unknown, but a request around them can still be guessed. Such a guess is exactly what the precision
of execution counts against a reader. The experiment below compares how often each reader is wrong when it is confident.</p>
<p class="callout warn"><b>What the measurement showed (below).</b> All of the above is true, and it is why VSS leaves more undone. But
<i>among the requests VSS does execute</i>, its margin barely tells the right ones from the wrong ones. The margin compares the best reading with
the runner-up <b>inside the world that was chosen</b>; it does not see whether the cut was right, whether the right world was chosen, or whether
“it” was filled with the right shape. A request sent to the wrong world can still have one clearly best reading there: VSS is then sure of a
wrong answer. Requests read by the links world are right only 54% of the time, and the margin does not show it (RISK_COVERAGE.md).</p>

<h2 id="bert-doesnt">What a fine-tuned transformer knows, and what it does not</h2>
<ul>
  <li><b>No unknown words.</b> Its tokenizer splits any word into word pieces it knows (an invented “zorble” becomes a few such pieces), and
  every piece has a meaning. Nothing is ever “unknown”; an invented verb is read as the nearest thing it resembles. That is why it leaves only
  2.8% undone.</li>
  <li><b>Probabilities that rank well, but run high.</b> The expectation was that after fine-tuning its scores are close to 0 or 1 even when it is
  wrong. Measured on our sample, they still <i>rank</i> its readings well: 89% right when it is at least 0.99 sure, 42% right under 0.5. They are
  too high below 0.95 (a 0.8 is right less than 80% of the time), which a threshold chosen on held-out data takes care of (RISK_COVERAGE.md).</li>
  <li><b>Its confidence covers every step.</b> We take the smallest probability among all its heads for the request: the action and every value
  and every filled role. One head unsure is enough to lower it. The VSS margin covers only one step of a chain (above).</li>
  <li><b>Explanations are approximate.</b> Attention maps and gradient maps show which words weighed in a decision, roughly; they are not the
  reading itself, as a VSS frame is.</li>
</ul>

<h2 id="bert-can">What can be done for BERT</h2>
<ul>
  <li><b>Calibration and a threshold to ask</b>: temperature scaling fitted on held-out examples makes its probabilities honest on average;
  below a threshold, ask instead of executing.</li>
  <li><b>Distance to the training examples</b> in its internal space (out-of-distribution detection): a request far from everything it was trained
  on is flagged.</li>
  <li><b>Several variants voting</b> (an ensemble, or dropout kept on at reading time): disagreement means uncertainty, at several times the cost.</li>
</ul>
<p>The first one, a threshold to ask, is enough to make SOP-BERT about as careful as VSS (measured below), with no training. Under the main
metric every reader gets such a threshold, SOP-BERT included; the comparison is then made at equal precision.</p>

<h2 id="experiment">The experiment: better, or bolder?</h2>
<p>A reader that executes more requests will get more right <i>and</i> more wrong. To compare two readers fairly, let each one sort its own
requests by its own confidence, keep only its most confident share (the <b>coverage</b>), and count the wrong ones in that share (the <b>risk</b>).
A curve of risk against coverage separates a reader that is <b>better</b> (fewer wrong at the same coverage) from one that is only <b>bolder</b>
(it covers more, and pays for it in wrong actions). This curve is how the main metric compares readers: pick one precision, read off how many
requests each reader does right there.</p>
<p class="note">Two ways of counting the risk. In the runs below (RISK_COVERAGE.md, VSS_CONFIDENCE.md) it is the wrong requests in % of
<i>all</i> requested actions, extras counted apart. The main metric counts it among what was <i>executed</i>, extras included: precision of
execution = right / (right + wrong + extra) of the executed. The same curves, a different denominator; the precision version is being measured
(<a href="#help/research-question/precision-result">the placeholder</a>).</p>
<figure>
<div class="fig">
<svg class="dg" viewBox="0 0 400 250" role="img" aria-labelledby="rc1">
<title id="rc1">Illustration of a risk-coverage curve: the share of wrong actions grows as a reader executes more of its requests</title>
<path class="tree" d="M50 20 V210 H380"/>
<text class="s" x="215" y="242" text-anchor="middle">coverage: share of requests executed, most confident first →</text>
<text class="s" x="16" y="115" text-anchor="middle" transform="rotate(-90 16 115)">risk: wrong among them →</text>
<text class="s" x="50" y="224" text-anchor="middle">0%</text><text class="s" x="380" y="224" text-anchor="middle">100%</text>
<path d="M50 206 C150 200 250 185 300 160 S350 110 372 80" fill="none" style="stroke:var(--accent);stroke-width:2.2"/>
<path d="M50 200 C130 185 220 150 290 120 S350 70 380 50" fill="none" style="stroke:var(--rf);stroke-width:2.2;stroke-dasharray:6 4"/>
<circle cx="372" cy="80" r="4" style="fill:var(--accent)"/>
<text x="292" y="184" style="fill:var(--accent)">careful reader</text>
<text x="280" y="96" text-anchor="end" style="fill:var(--rf)">bold reader</text>
<rect x="56" y="22" width="150" height="20" rx="4" style="fill:var(--warn-soft);stroke:var(--frame)"/>
<text class="s" x="131" y="36" text-anchor="middle">illustration, not data</text>
</svg>
</div>
<figcaption>The idea only: the shapes of these curves are drawn by hand. A reader that abstains ends its curve before 100% coverage (the dot).</figcaption>
</figure>
<div class="callout" id="rc-result">
<p><b>Result (2026-11-02, <code>training/sketch/RISK_COVERAGE.md</code>): SOP-BERT knows better than VSS when it does not know.</b>
The confidence of each reader was fixed before the run. For VSS it is the smallest margin of the chosen reading, the same number its
"abstain" comes from. For SOP-BERT it is the smallest probability among the action and every value the request fills.</p>
<p>How well each confidence tells right requests from wrong ones (0.5 = no information, 1 = perfect):</p>
<table>
<tr><th>Data</th><th>VSS</th><th>SOP-BERT</th></tr>
<tr><td>Sample, 1000 messages</td><td>0.59</td><td>0.72</td></tr>
<tr><td>Held-out, 585 messages</td><td>0.58</td><td>0.73</td></tr>
<tr><td>Short commands, 299 held-out</td><td>0.57</td><td>0.82</td></tr>
</table>
<p>Both readers cut back to the same share of wrong requests, on the sample (wrong and right in % of all requested actions, not yet
precision):</p>
<table>
<tr><th>Wrong</th><th>VSS right</th><th>SOP-BERT right</th></tr>
<tr><td>11.4%</td><td>77.2%</td><td>73.8%</td></tr>
<tr><td>6%</td><td>55.5%</td><td>55.0%</td></tr>
<tr><td>4%</td><td>38.5%</td><td>45.9%</td></tr>
<tr><td>2%</td><td>10.1%</td><td>26.8%</td></tr>
</table>
<p>In plain words: VSS says "I don't know" more often (11.4% of requests not done) because there is more it cannot read at all. Among the
requests it does execute, its margin barely separates right from wrong: its most confident readings are right 74% of the time, about as often
as its middling ones. SOP-BERT's probabilities do separate them: 89% right when it is at least 0.99 sure, 42% under 0.5. So with one threshold
on its own probabilities, and no training, SOP-BERT can ask instead of guessing: at 0.36 it goes from 80.8 / 16.5 / 2.8 (right / wrong / not
done) to 79.6 / 14.3 / 6.1; at 0.6 to 75.1 / 12.0 / 12.9, close to VSS's 77.2 / 11.4 / 11.4. This threshold is not in the demo yet; the
confidence gate is in progress.</p>
<p>What it means for VSS: its margin is not a good confidence, because it sees one step of a chain (above).</p>
</div>
<div class="callout" id="vc-result">
<p><b>Second result (2026-11-02, <code>training/sketch/VSS_CONFIDENCE.md</code>): a VSS confidence that sees the whole chain beats SOP-BERT’s.</b>
The plan was written before measuring. For every executed request we took one or more numbers from every step: how sure the cut was, how
clearly the chosen world beat the others, how much of the request the reading leaves unexplained (the residual), how many words it could
not place or did not know, the context filler’s margin, and how often the chosen world is right in general. They were combined by a logistic
regression fitted <b>only on the held-out split</b>, then measured once on the sample and the short commands.</p>
<table>
<tr><th>Confidence</th><th>Sample</th><th>Short, 299 held-out</th></tr>
<tr><td>VSS margin (old)</td><td>0.59</td><td>0.57</td></tr>
<tr><td>VSS, all steps combined</td><td><b>0.81</b></td><td><b>0.84</b></td></tr>
<tr><td>SOP-BERT</td><td>0.72</td><td>0.82</td></tr>
</table>
<p>At an equal share of requests done wrong on the sample (% of all requested actions, not yet precision), VSS with the new confidence keeps far more right: at 4% wrong 60.9% right (old margin 38.5%, SOP-BERT
45.9%); at 2% wrong 49.0% (old 10.1%, SOP-BERT 26.8%). On the short commands SOP-BERT stays ahead down to 6% wrong; VSS leads at 4% and 2%.</p>
<p>Which numbers carry it, by weight: the residual (+1.26), how good the chosen world is in general (+1.26; links is right only 59% of the
time), whether the world was the cutter’s first choice (+0.98), the share of words not understood (+0.85), the words left unplaced (+0.80).
The roles’ own margin, the whole of the old confidence, gets almost no weight (+0.01). Each weight has a name, so a “not sure” can say why:
“the words <i>…</i> were not understood”, or “this was read in the links world, which is often wrong”.</p>
<p>Of VSS’s 552 wrong requests on the sample, 70.5% are flagged by at least one step; 29.5% are read confidently at every step and no number
in the chain can catch them.</p>
<p class="note"><b>Caveat on fairness:</b> VSS was trained on the sample’s messages and SOP-BERT never saw them (<a href="#help/chain-vs-one/fairness">One
model or a chain</a>), so the two confidences are measured on different footing; the held-out split, where both saw similar text, gives the same
order: 0.82 against 0.73. A fresh test set neither reader has seen is planned. Not in the demo yet: using this confidence, with a
threshold chosen on held-out data, to decide when VSS asks instead of executing is in progress.</p>
</div>

<h2 id="both">Why both readers stay in the demo</h2>
<p>Both are measured by the same rule: each executes only above its own threshold, and they are compared at equal precision.
<b>SOP-BERT</b> is the approximator: it gets the most right when everything is executed, and its probabilities, measured, rank its readings.
<b>VSS</b> is the subject of the research question: every reading can be followed word by word, when it errs we can say at which step, and a
confidence built from those steps ranks its readings better than SOP-BERT’s (above; <a href="#help/chain-vs-one">One model or a chain</a>), so
its “not sure” can say why. Side by side, on the same cut, each reply shows what each approach does with the same words.</p>
`);

/* ============================================================ chain vs one model */
page('chain-vs-one', 'One model or a chain',
'VSS reads a message in a chain of separately trained steps; SOP-BERT does all of them in one model trained on the final result. That, and what a pretrained model already knows of English, is why SOP-BERT executes more and gets more right when everything is executed. The chain is also why VSS can say at which step it is not sure, which is what the main metric asks for. The VSS core itself is the one of the paper.', `
<p class="note">The question of this project is not which reader gets more right when everything is executed, but how much each gets right when
it executes only what it is sure of (<a href="#help/research-question">What this project measures</a>). This page explains the difference on
the earlier measure, and what the chain means for knowing when to ask.</p>
<h2 id="steps">The VSS chain</h2>
<ol>
  <li><b>Cut</b> the message into requests (the cutter of worlds).</li>
  <li><b>Choose the world</b> of each piece: shapes, links, position, graph questions, questions, manage, history.</li>
  <li><b>Read</b> the piece in that world: the action and its roles (the VSS reader, with the event hint).</li>
  <li><b>Fill from context</b> what the piece leaves open: “it”, “them”, “the red circle” (the context filler).</li>
  <li><b>Turn</b> the reading into SOP Lang wires for the drawing (the adapter).</li>
</ol>
<p>Each step is trained, or written, on its own goal: the cutter learns to cut, each world to read its own requests, the filler to rank
candidates. None learns to repair the step before it. Errors multiply along the chain: as an illustration, not a measurement, four steps that are
each right 93% of the time give 0.93<sup>4</sup> ≈ 75% for the whole. No step looks weak, the total is. Which step loses most is being measured
(the round-2 analysis per component, ROUND2.md).</p>
<p>The same chain is what lets VSS say where it is not sure. Every step leaves a number behind (how sure the cut was, how clearly the world won,
how much of the request the reading leaves unexplained, which words it did not know), and each number has a name. Combined, they rank right and
wrong readings better than the probabilities of SOP-BERT (VSS_CONFIDENCE.md, <a href="#help/knowing/vc-result">the result</a>), and a
question back can name its reason: “the words <i>…</i> were not understood”, or “this was read in the links world, which is often wrong”.</p>

<h2 id="one">SOP-BERT: one model, trained on the result</h2>
<ul>
  <li><b>All steps at once.</b> One encoder with small heads cuts, names the action, reads the values and decides what each role is filled from, in
  one pass; training corrects it on the final reading, so a head learns what the others need.</li>
  <li><b>English it already knows.</b> It starts from DistilBERT, pretrained on a large amount of English text. A synonym or a phrasing missing
  from our data still has a meaning for it. A VSS world knows only the words of our annotated requests, a few tens of thousands of sentences;
  a new word is “unknown”. Most of the VSS “not done” comes from there.</li>
  <li><b>The whole message in view.</b> When it decides what “it” means, it looks at the whole text; the VSS context filler sees only what the
  steps before it produced.</li>
</ul>

<h2 id="fairness">Is the comparison fair?</h2>
<p>Partly, and the unfairness favours VSS. There is no hidden test set (owner, 2026-11-01): the VSS worlds are trained on every annotated
folder with spans, the sample’s messages included. SOP-BERT never saw any message of the sample: the 1000 sample ids are removed before its
train/held-out split (<code>training/neural/make_data.py</code>). So on the sample, SOP-BERT reads text it never saw and VSS reads text it was
trained on.</p>
<p>A consequence: on the sample’s two benchmark folders (ids h- and s-) SOP-BERT is wrong on 21% and 28% of the requests, VSS on 12.9% and
14.3% (RISK_COVERAGE.md). That is <b>not</b> evidence that VSS generalises better: the VSS worlds were trained on those very messages. The same
holds for the confidences and for the precision of execution: on the sample VSS is judged on text it learned. A fair measure of both needs a
fresh set of messages neither has seen; it is planned (<a href="#help/planned">In progress</a>).</p>

<h2 id="core">Did we change the VSS core?</h2>
<p>The reader comes from the paper’s repository (<code>vsa-semantic-space</code>), through <code>vss-demo</code>, copied here on 2026-10-30
(<code>training/vss/PROVENANCE.md</code>). Its idea is unchanged:</p>
<ul>
  <li>every word has a fixed vector (its star);</li>
  <li>its place in the sentence is a phase rotation, learned per pair of word kinds (the route book);</li>
  <li>the sentence is the sum of its words’ vectors;</li>
  <li>roles are read back by undoing the rotation and comparing with the candidates; calibrated thresholds decide what is present.</li>
</ul>
<p>What we changed inside it, on in the published worlds:</p>
<div class="tw"><table>
<thead><tr><th>Change</th><th>What it does</th><th>Kind of change</th></tr></thead>
<tbody>
<tr><td>Set roles</td><td>a role with several members: “connect A, B and C”</td><td>port: in the original Python, not in its browser reader</td></tr>
<tr><td>Word kinds</td><td>which words share route rows: 106 → 59 kinds, chosen by a measured rule, same reading</td><td>a parameter (KINDS.md)</td></tr>
<tr><td>Calibration</td><td>thresholds fitted on all training rows instead of 400</td><td>a fix (BETWEEN.md, ROUND2.md)</td></tr>
<tr><td>Event hint</td><td>the cutter tells the reader which action to look for, used only when there is no verb</td><td>an input from outside (EVENT_HINT.md)</td></tr>
</tbody></table></div>
<p>Written, measured and left <b>off</b> in the published worlds: the centre reader (it failed its test), the sparse route book, the learned
role exclusion (failed). The large difference from the paper is not inside the reader but around it: the paper reads one sentence, already
isolated, of a known world; here the same reader is one step of the chain above. So 77.2% is the score of the chain, not of the reader alone,
and it does not compare directly with the paper’s numbers.</p>
<p>Whether our changes cost any correctness is being measured: the same world trained with the original <code>vss-demo</code> code and with
ours, on the same data (UPSTREAM_AUDIT.md, running).</p>

<h2 id="next">What follows for VSS</h2>
<ul>
  <li><b>A confidence that sees every step</b>: measured, it separates right from wrong better than SOP-BERT’s (0.81 against 0.72 on the
  sample, 0.82 against 0.73 held-out) and keeps its explanations: every weight has a name (<a href="#help/knowing/vc-result">the result</a>).
  In progress: a threshold on it, chosen on held-out data, decides in the demo when VSS executes and when it asks, saying why; then the
  precision of execution is measured at that threshold (<a href="#help/research-question/precision-result">being measured</a>).</li>
  <li><b>A fresh test set</b> neither VSS nor SOP-BERT has seen, so that precision is compared on equal footing (planned).</li>
  <li><b>Fewer separately trained steps</b>, if the per-component analysis shows that most is lost at the cut or the world choice: that is the
  lesson of SOP-BERT.</li>
</ul>
`);

/* ============================================================ limits today */
page('limits-today', 'Where it is weak today',
'The known weak spots of the readers, with the numbers. The editor’s own limits (what it cannot draw) are in What it cannot do.', `
<p class="note">Measured with the earlier measure unless said otherwise: right / wrong / not done in % of the requested actions, every
request executed. The main number, precision of execution at a threshold, is being measured
(<a href="#help/research-question/precision-result">the placeholder</a>).</p>
<ul class="limits">
  <li><b>No reader in the demo executes only what it is sure of.</b> The main metric asks each reader to execute a request only above a
  confidence threshold chosen on held-out data, and to ask below it (owner, 2026-11-02). Today VSS executes readings with status
  <code>abstain</code> and its context filler fills a gap whenever one candidate ranks first; SOP-BERT executes everything it reads; the Rules
  have no confidence at all. The confidence gate for VSS and SOP-BERT is in progress (<a href="#help/planned">In progress</a>).</li>
  <li><b>The VSS margin is a poor confidence.</b> It separates right from wrong readings barely better than chance (AUROC 0.59 on the sample,
  RISK_COVERAGE.md): its most confident readings are right about as often as its middling ones. A confidence from every step of the chain does
  much better (0.81, VSS_CONFIDENCE.md), and still leaves 29.5% of VSS’s wrong requests on the sample read confidently at every step: no number
  in the chain catches them. See <a href="#help/knowing">Knowing what it does not know</a>.</li>
  <li><b>VSS on very short commands.</b> 61.1% right on the six short sets, against 77.2% on whole messages (SHORT2.md §6). The VSS cutter makes no
  unit for 96 of 1118 one-line commands (CUT_SHARED.md): a message like “Undo” or “Hub teal” can be missed whole. Round 2 reaches 62.5% (commit
  63274ae), not the default yet.
  ${says('Undo', 'Make Process bigger')}</li>
  <li><b>SOP-BERT guesses.</b> With every request executed, 16.5% of the sample’s requests done wrong against 11.4% for VSS, and only 2.8% left
  undone (commit 1f3c806). A threshold on its probabilities, chosen on held-out data, makes it ask instead (RISK_COVERAGE.md); it is not in the
  demo yet. Descriptions in roles are its weakest part: 4 of 34 held-out (its README). See <a href="#help/knowing">Knowing what it does not know</a>.</li>
  <li><b>“Them” after a list.</b> After every request, all readers carry one shape forward as “it” (the shared context rule). “Draw A, B and C,
  then make them red” needs three; no reader that uses the rule can get it right. Listed as a task (<a href="#help/planned">In progress</a>).
  ${says('Add three small squares in a row below Process')}</li>
  <li><b>Descriptions in roles.</b> “Put a star next to the orange hexagon”: in the training annotation, descriptions fill the entity roles in only
  0–3.5% of the requests, so the VSS worlds rarely learned to read them there (SHORT2.md §3). More annotated data is the fix, not a rule.</li>
  <li><b>The rules on long messages.</b> 16.8% of requests done wrong with their own cut, 821 extra actions (CUT_SHARED.md); 11.9% and 406 with the
  VSS cut.</li>
  <li><b>Measured on data the worlds were trained on.</b> There is no hidden test set (owner, 2026-11-01): the sample is training data for the worlds,
  and the goal is that they read such data well. The neural models are the exception: they never saw the sample. So the two are not compared
  on equal footing, for precision as for everything else; a fresh test set neither reader has seen is planned.</li>
</ul>
`);

const DocsConcepts = { pages };
if (typeof module !== 'undefined') module.exports = DocsConcepts; else root.DocsConcepts = DocsConcepts;
})(typeof window !== 'undefined' ? window : this);
