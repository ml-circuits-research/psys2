# diagram tab: sources (252 scored items + 18 setup items; 130 node/edge diagram, 122 chart)

Corpora (licence checked on the official page or repository; per the later owner update every adapted item is marked redistributable:true, and the real licence is recorded on each item):
- PPTC (Guo et al. 2023). MIT (github.com/gydpku/PPTC). Instructions written by crowd workers who use PowerPoint (paper, Sec. data collection). Pool: 105 unique shape-insertion turns and 119 chart turns in the test split. Sampled 30 shapes and 16 chart-creation turns at random (seed 3), plus their chart follow-up turns as sessions. Kept 33 shape + 28 chart items, then dropped 4 near-duplicate shape items. 57 items.
- WildChat-1M (allenai). ODC-BY 1.0 (HF card). Streamed 5 of the 14 parquet shards and kept only English conversations that matched diagram or chart keywords (1,674). From those I listed every conversation with a diagram request (78) and kept every turn that asks to create or change a node/link diagram, with its follow-ups (48). For charts: 437 keyword candidates were shuffled (seed 42) and the relevant chart requests kept (11). Relevance was about 20%; most hits were code, story plots or Node.js. 59 items.
- ChartDialog (Shao & Nakashole, ACL 2020). No licence is stated in github.com/sythello/ChartDialog or its data zip. Pool: 3,284 dialogues with 15,753 describer turns. Stratified random sample by plot type (seed 20261120): 27 dialogues, 4 later dropped to stay within the size target. First 2 turns per dialogue, plus a 3rd turn in 5 dialogues. Sessions keep the dialogue order. 51 items.
- NLVCorpus (Srinivasan et al. CHI 2021). MIT (nlvcorpus.github.io). Pool: 814 utterance sets for 30 chart specs. Stratified by visId: up to 4 per type, shuffled (seed 11), first 30 kept. Sequential sets became sessions. Effects come from the Vega-Lite spec the participant saw; the aggregate is taken from the utterance when it states one. 32 items.
- TeX.StackExchange question titles. CC BY-SA 3.0/4.0. Top-voted 787 questions in the tags flow-charts, tikz-arrows, tikz-trees and diagrams. Random order (seed 7): 150 inspected, about 37% express a diagram edit, and the first 28 relevant titles were kept. 28 items.
- SCONE Tangrams (Long et al. 2016). CC BY-SA 4.0 (nlp.stanford.edu/projects/scone; zip fetched via the Wayback Machine because the site refused connections). 5 random test sessions (seed 5) of 5 utterances each. Effects are computed from the world-state diffs. 25 items.

Adaptation rules:
- slide -> page. picture/image/title/content landmarks -> seeded nodes "Image" (rectangle), "Title" and "Content" (text).
- Tool names dropped (TikZ, LaTeX, mermaid, plantUML, Power BI, vis.js, "write code").
- Tangram "figure/object/piece" -> "shape", using five seeded nodes (circle, square, triangle, diamond, hexagon) in a left-to-right row.
- NLV field names: mpg -> mileage, displacement -> engine size, IMDB -> audience rating, Rotten Tomatoes -> critic rating, production budget -> budget, worldwide gross -> earnings, creative type -> story type, major genre -> genre, content/MPAA rating -> age rating.
- Typos, hedges, greetings and fragments kept. Line breaks and full-width colons normalised. Non-English turns skipped.
- Edges and charts that cannot be seeded come from setup items (setup:true, author-written, not scored): flowchart, tree and mind-map link sets, plus one bar chart.

Known gaps:
- No public human corpus of node/edge editing commands was found (searched for diagram-edit, flowchart, graph-editor and mind-map corpora; the KG-editing study by Shahriari et al. 2025 released no utterances).
- Diagram connect/label/style coverage therefore relies on TeX.SE titles (how-to phrasing, often a question or fragment) and WildChat creation requests. Few explicit "connect A to B" utterances exist.
- ChartDialog and NLV utterances give no data values: effects check chart type and encodings or style only.
