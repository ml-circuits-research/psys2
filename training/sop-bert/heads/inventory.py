# Per-(wire type, key) inventory for the four areas plus the request and conversation structure.
# head: class (closed values / legend regions), step (more/less on the key's axis), span (BIO tags on the user's words),
#       fill (how a reference is given: written/context/description/all/new), number (digits span + value), candidate (open atom scored against declared candidates).
# concept: the legend concept the key means; keys with the same concept share one head (the wire type is given to the head as context).
import json
R = {}
def t(world, typ, doc, keys): R.setdefault(world, {})[typ] = {"doc": doc, "keys": keys}
def k(head, concept, values=None, many=False, src=""):
    d = {"head": head, "concept": concept}
    if values: d["values"] = values
    if many: d["many"] = True
    if src: d["src"] = src
    return d
SIZE = ["tiny", "small", "default", "big", "huge"]
REGION = ["corner", "top", "bottom", "left", "right", "center", "top_left", "top_right", "bottom_left", "bottom_right", "middle", "background", "foreground"]
SPREL = ["in", "on", "under", "above", "below", "next_to", "left_of", "right_of", "between", "behind", "in_front_of", "near", "around", "inside", "outside", "along"]
# ---- request structure (std.request, library 0.192): what the reader predicts per request
t("request", "request", "one request", {
  "mood": k("class", "mood", ["do", "propose", "check", "ask"], src="std.request.mood"),
  "act": k("candidate", "act", ["make", "place", "change", "remove", "connect", "disconnect", "group", "ungroup", "copy", "select", "send", "save", "show", "arrange", "undo", "redo", "repeat", "answer", "object", "compute"], src="std.request.act (open atom; candidates from w.legend.act)"),
})
t("request", "target", "the thing acted on or asked about", {
  "mode": k("class", "target.mode", ["new", "existing", "bound"], src="std.request.target.mode"),
  "fill": k("class", "target.fill", ["written", "context", "description", "all", "previous_reply", "journal_step"], src="how an existing target is given"),
  "determiner": k("class", "determiner", ["definite", "indefinite"], src="std.request.target.determiner"),
  "kind": k("candidate", "kind", src="std.request.target.kind (candidates: kinds of the area + knowledge kind tree)"),
  "name": k("span", "name", src="std.request.target.name"),
  "description": k("span", "description", src="selector words, e.g. 'the red one'"),
  "ordinal": k("class", "ordinal", ["first", "second", "third", "fourth", "fifth", "last", "second_last", "next", "previous", "newest", "oldest", "biggest", "smallest", "top", "bottom", "leftmost", "rightmost"], src="selector by order or extreme"),
  "count": k("number", "count", src="how many new things / how many selected"),
})
t("request", "constraint", "one condition on a target (selector or desired result)", {
  "concept": k("candidate", "concept", src="std.request.constraint.concept: which (type,key) of the area"),
  "operator": k("class", "operator", ["eq", "less.equal", "greater.equal", "degree", "region", "relation", "same", "occurred", "delta", "factor"], src="std.request.constraint.operator"),
  "phase": k("class", "phase", ["selector", "result"], src="std.request.constraint.phase / selector vs result"),
  "polarity": k("class", "polarity", ["positive", "negative"], src="std.request.constraint.polarity"),
  "character": k("class", "character", ["requirement", "preference", "assumption"], src="std.request.constraint.character"),
  "scope": k("class", "scope", ["each", "group"], src="std.request.constraint.scope"),
  "step": k("step", "step", ["more", "much_more", "less", "much_less"], src="degree words: bigger, a bit warmer, much later"),
  "measure": k("number", "measure", src="std.request.constraint.measure (a number with unit)"),
  "unit": k("candidate", "unit", src="std.request.constraint.unit (candidates from k.units)"),
  "variety": k("class", "variety", ["same", "different", "random", "matching", "alternating"], src="constraint across members (two different houses, random colours)"),
})
t("request", "logic", "logical structure", {
  "quantifier": k("class", "quant.kind", ["all", "any", "each", "none", "both", "some", "other", "every_except"], src="std.request.quant.kind"),
  "group": k("class", "group.operator", ["and", "or"], src="std.request.group.operator"),
  "negated": k("span", "not", src="std.request.not: words of the negated condition"),
})
t("request", "question", "what is asked (pending contract: question projection)", {
  "ask": k("class", "ask", ["what", "which", "count", "exists", "where", "when", "who", "list", "describe", "why", "how", "how_much", "compare", "total", "average", "max", "min", "difference", "percent"], src="answer projection; chart computations included"),
  "asked_key": k("candidate", "concept", src="which key is asked: 'what colour is it' -> colour"),
})
t("conversation", "turn", "relation to the conversation", {
  "fragment": k("class", "fragment", ["adds", "replaces", "repeats", "more", "less", "confirms", "rejects"], src="book 6.4: fragments complete the previous request"),
  "repeat_count": k("number", "count", src="undo twice, again 3 times"),
  "objection": k("class", "objection", ["wrong_target", "wrong_value", "too_much", "too_little", "missing_part", "unexpected", "general"], src="book 6.11.1 objections about the previous reply"),
  "area": k("class", "area", ["drawing", "diagram", "document", "calendar"], src="which area a cross-area request points to (send a chart to the document)"),
})
# ---- drawing (book 7.1 + old art.draw / ui.avatar capabilities)
t("drawing", "page", "the drawing as a whole", {
  "background": k("class", "colour", src="paintSky / background colour"),
  "scene": k("candidate", "kind", src="whole scene asked: landscape, farm, beach (k.expect parts)"),
  "parts_named": k("span", "parts_list", many=True, src="parts the user names for a whole (book 6.7)"),
  "mood": k("class", "mood_region", ["happy", "calm", "gloomy", "festive", "spooky", "natural"], src="old art.draw state mood"),
})
t("drawing", "drawn", "a drawn thing (book 7.1 t.drawn)", {
  "kind": k("candidate", "kind", src="s.drawn.kind (knowledge kind tree with images)"),
  "at": k("class", "region", REGION, src="s.drawn.at means=place space=page (regions)"),
  "relation": k("class", "spatial_relation", SPREL, src="s.drawn.in/on + moveThings relation"),
  "anchor": k("fill+span", "reference", src="the other thing of the relation"),
  "direction": k("class", "direction", ["up", "down", "left", "right", "closer", "apart", "forward", "backward"], src="a move step"),
  "distance": k("number", "measure", src="move by N"),
  "size": k("class+step", "size", SIZE, src="s.drawn.size space=size"),
  "colour": k("candidate+step", "colour", src="s.drawn.colour space=colour (k.colours; step darker/lighter)"),
  "fill": k("class", "fill", ["solid", "none", "striped", "dotted", "gradient"], src="old typed fill"),
  "rotation": k("class", "rotation", ["rotate_left", "rotate_right", "upside_down", "tilt"], src="old object rotation"),
  "flip": k("class", "flip", ["horizontal", "vertical"], src="old object flip"),
  "layer": k("class", "layer", ["front", "back", "forward", "backward"], src="old z order"),
  "count": k("number", "count", src="addThings n"),
  "name": k("span", "name", src="label given by the user"),
})
t("drawing", "part", "a part of a drawn thing (petal, roof, window, wheel)", {
  "part": k("candidate", "part_kind", src="k.expect.part / putPart part"),
  "colour": k("candidate+step", "colour", src="part colour"),
  "size": k("class+step", "size", SIZE, src="part size"),
  "count": k("number", "count", src="three windows"),
  "variant": k("candidate", "variant", src="putPart variant (curly, round, open)"),
})
t("drawing", "face", "an avatar / face (a kind of drawn thing; old ui.avatar)", {
  "feature": k("candidate", "part_kind", src="hair, eyes, mouth, nose, ears, beard, glasses, hat, skin"),
  "hair_style": k("candidate", "variant", src="curly, straight, short, long, bun, bald"),
  "colour": k("candidate+step", "colour", src="hair/eye/skin colour"),
  "expression": k("class+step", "expression", ["happy", "sad", "angry", "surprised", "neutral", "sleepy", "laughing", "winking", "thinking", "scared"], src="wearPreset expression"),
  "preset": k("candidate", "style", src="wearPreset preset"),
  "name": k("span", "name", src="avatar setName"),
  "animation": k("class", "animation", ["wave", "nod", "blink", "smile", "dance", "none"], src="avatar.animate"),
})
# ---- diagram (book 7.2 + old diagram.sketch / data.charts)
t("diagram", "diagram", "a diagram as a whole", {
  "kind": k("candidate", "diagram_kind", ["flowchart", "tree", "org_chart", "mind_map", "network", "sequence", "timeline", "venn", "state_machine", "bar_chart", "line_chart", "pie_chart", "doughnut_chart", "scatter_chart", "radar_chart", "area_chart", "table"], src="startDiagram kind; charts are a kind of diagram"),
  "layout": k("class", "layout", ["tidy", "left_to_right", "top_to_bottom", "radial", "grid", "row", "column", "circle", "layers", "compact", "spread", "fewer_crossings", "align"], src="arrangeShapes / startDiagram layout"),
  "title": k("span", "name", src="diagram title"),
  "size": k("number", "count", src="six steps"),
  "links": k("number", "count", src="startDiagram links"),
})
t("diagram", "node", "a node / box / bar / slice (book 7.2 t.node)", {
  "label": k("span", "name", src="s.node.label"),
  "shape": k("class+step", "shape", ["box", "rounded_box", "circle", "ellipse", "diamond", "hexagon", "triangle", "star", "cylinder", "parallelogram", "cloud", "note", "square", "rectangle"], src="s.node.shape space=shape (step rounder)"),
  "colour": k("candidate+step", "colour", src="s.node.colour"),
  "size": k("class+step", "size", SIZE, src="setShapes size"),
  "position": k("class", "spatial_relation", SPREL, src="moveShapes place/anchor"),
  "anchor": k("fill+span", "reference", src="the anchor node"),
  "at": k("class", "region", REGION, src="s.node.at"),
  "value": k("number+step", "quantity", src="s.node.value (bars, points, slices)"),
  "group": k("fill+span", "reference", src="member of a group"),
})
t("diagram", "link", "an arrow between nodes (book 7.2 t.link)", {
  "from": k("fill+span", "reference", src="s.link.from role=source"),
  "to": k("fill+span", "reference", src="s.link.to role=goal"),
  "style": k("class", "line_style", ["solid", "dashed", "dotted", "thick", "thin", "curved", "straight"], src="link style"),
  "arrow": k("class", "arrow", ["none", "forward", "backward", "both"], src="link arrow"),
  "label": k("span", "name", src="label on the arrow"),
  "colour": k("candidate", "colour", src="link colour"),
})
t("diagram", "group", "a group / cluster / lane of nodes", {
  "label": k("span", "name", src="group name"),
  "members": k("fill+span", "reference", many=True, src="diagram.sketch.group"),
  "colour": k("candidate", "colour", src="group colour"),
})
t("diagram", "chart", "chart data and display (old data.charts)", {
  "series": k("span", "name", many=True, src="series names"),
  "labels": k("span", "name", many=True, src="bar/slice/point labels"),
  "values": k("span", "quantity", many=True, src="chart.setValues"),
  "axis": k("span", "name", src="axis title / range"),
  "legend": k("class", "toggle", ["show", "hide"], src="chart options legend"),
  "show_values": k("class", "toggle", ["show", "hide"], src="showValues"),
  "stacked": k("class", "toggle", ["on", "off"], src="stacked"),
  "horizontal": k("class", "toggle", ["on", "off"], src="horizontal"),
  "sort": k("class", "sort", ["desc", "asc", "alpha", "given"], src="sort"),
  "palette": k("candidate", "colour", src="palette"),
  "source": k("class+span", "data_source", ["calendar", "document", "list", "prices", "holdings", "typed"], src="chart.fromList/fromHoldings/...; book: meetings per person from the calendar"),
})
# ---- document (book 7.3 + old docs.editor)
t("document", "text", "a document as a whole (book 7.3 t.text)", {
  "genre": k("candidate", "kind", ["letter", "email", "report", "story", "note", "memo", "essay", "summary", "article", "invitation", "announcement", "speech", "cover_letter", "complaint", "review", "recipe", "list", "minutes", "proposal", "poem", "press_release", "newsletter", "itinerary", "lab_report", "cv"], src="s.text.genre (k.genres)"),
  "about": k("span", "topic", src="s.text.about"),
  "title": k("span", "name", src="s.text.title"),
  "tone": k("class+step", "tone", ["formal", "informal", "friendly", "warm", "cold", "polite", "firm", "neutral", "enthusiastic", "apologetic", "humorous", "serious", "persuasive", "simple"], src="s.text.tone space=tone"),
  "length": k("class+step", "length", ["very_short", "short", "medium", "long", "very_long"], src="writeText words (region)"),
  "words": k("number", "measure", src="writeText words"),
  "recipient": k("span", "person", src="who it is for"),
  "chapters": k("number", "count", src="writeText chapters / keepChapters"),
})
t("document", "section", "a part of a document (book 7.3 t.section)", {
  "role": k("candidate", "part_kind", ["greeting", "introduction", "body", "conclusion", "signature", "chapter", "paragraph", "heading", "list", "table", "apology", "explanation", "summary", "closing", "subject", "abstract", "methods", "results", "references", "item"], src="s.sec.role"),
  "order": k("class", "order_relation", ["before", "after", "first", "last", "top", "bottom", "swap"], src="s.sec.order"),
  "order_anchor": k("fill+span", "reference", src="the other section"),
  "length": k("class+step", "length", ["very_short", "short", "medium", "long", "very_long"], src="s.sec.length"),
  "words": k("number", "measure", src="s.sec.length unit=word"),
  "content": k("span", "literal_text", src="text the user dictates to insert/replace (doc.addParagraph, doc.dictate)"),
  "level": k("class", "heading_level", ["1", "2", "3"], src="old heading level"),
  "count": k("number", "count", src="three paragraphs"),
})
t("document", "inline", "formatting, lists, tasks, tables (old docs.editor)", {
  "format": k("class", "format", ["bold", "italic", "underline", "highlight", "strike", "link", "code"], src="old style/highlight/link"),
  "list_kind": k("class", "list_kind", ["bullets", "numbered", "checklist"], src="doc.addList"),
  "align": k("class", "align", ["left", "center", "right", "justify"], src="old align"),
  "task": k("span", "literal_text", src="doc.checkTask / listTasks item"),
  "checked": k("class", "toggle", ["on", "off"], src="old checked"),
  "table_size": k("span", "measure", src="doc.fillTable rows x cols"),
  "link_target": k("span", "literal_text", src="old link"),
})
# ---- calendar (book 7.4 + spec 29 calendar host)
t("calendar", "meeting", "a meeting (book 7.4 t.meeting)", {
  "title": k("span", "name", src="s.meet.title"),
  "day": k("candidate+span", "day", src="s.meet.start part=start (day): today, tomorrow, weekday, date, next week"),
  "time": k("candidate+span+step", "time", src="s.meet.start (clock or region morning/afternoon; step earlier/later)"),
  "length": k("number+class+step", "duration", ["short", "long"], src="s.meet.length part=duration"),
  "end": k("span", "time", src="until 5"),
  "room": k("fill+span", "reference", src="s.meet.room relation=in"),
  "people": k("fill+span", "person", many=True, src="s.meet.people role=participant many=true"),
  "recurrence": k("class", "recurrence", ["daily", "weekly", "every_weekday", "biweekly", "monthly", "yearly"], src="repetition"),
  "shift": k("number+class", "delta", ["earlier", "later"], src="move by an amount"),
  "relation": k("class", "time_relation", ["before", "after", "same_time", "during", "between", "not_overlapping"], src="relative to another meeting"),
  "relation_anchor": k("fill+span", "reference", src="the other meeting"),
  "free": k("class", "free_search", ["nearest_free", "first_free", "common_free"], src="book 6.8 / 7.4: nearest free time"),
  "agenda": k("span", "literal_text", src="notes / agenda"),
})
t("calendar", "room", "a room (book 7.4 t.room)", {
  "name": k("span", "name", src="room name"),
  "seats": k("number", "quantity", src="s.room.seats counts=w.person"),
  "quality": k("class", "room_quality", ["big", "small", "quiet", "free", "any"], src="'big room' judged against the rooms"),
})
t("calendar", "person", "a participant (w.person)", {
  "name": k("span", "person", src="person name"),
  "role": k("candidate", "role", src="the hiring lead, my manager"),
})
json.dump(R, open("inventory.json", "w"), indent=1)
# counts
types = sum(len(v) for v in R.values()); keys = sum(len(x["keys"]) for v in R.values() for x in v.values())
concepts = {}
for w, v in R.items():
    for typ, x in v.items():
        for key, d in x["keys"].items(): concepts.setdefault(d["concept"], []).append(f"{w}.{typ}.{key}")
print("worlds", len(R), "types", types, "keys", keys, "concept heads", len(concepts))
for w, v in R.items(): print(" ", w, {typ: len(x["keys"]) for typ, x in v.items()})
shared = {c: m for c, m in concepts.items() if len(m) > 1}
print("shared concepts", len(shared)); [print("  ", c, len(m), m[:6]) for c, m in sorted(shared.items(), key=lambda x: -len(x[1]))[:14]]
