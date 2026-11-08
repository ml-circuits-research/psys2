# docs.reader: request-shape coverage (R2)

Status: S = supported by rules, with a test (`tests.sop`, ids `t.docs.reader.s###` for the sweep, `nNN` for the original ones) and a generator family (`datagen.mjs`); U = unsupported, with the reason.
All patterns are `pat.docs.reader.*` (original) or `pat.docs.reader.sw.*` (sweep). Every wh-question pattern also exists with an indirect lead-in (`pat.docs.reader.ind.*`: "tell me / I want to know / I wonder / could you tell me / let me know ..." + the question).
Run-on and politeness handling: `can u / could you / hey / pls / thx / I want to / let me`, trailing `pls / now / for me / thanks`; `please/ok/well/um` are removed by the tokenizer.

Operations (docr.*): describe, summary, characters, mainCharacter, places, keywords, outline, stats, who, did, happened, where, whoV, didV, said, saying, part, sentence, count, search, searchStep, clearSearch, across, relation, isRelated, read, list, open, close, loadSample, ask.

## Shapes common to every operation

| Shape | Status | Example |
| --- | --- | --- |
| imperative | S | "Summarize the story." |
| question | S | "What is the story about?" |
| wish / indirect request | S | "I want a summary of the story." (summary, stats, outline, read, search); "I want to know how it ends." (all wh-questions via `ind.*`) |
| statement-as-command | U | "The story is too long, shorten it": no operation expresses intent from a statement |
| very short / elliptic | S | "tldr", "nxt", "prev", "word count", "Characters?", "Outline pls", "Unhighlight" |
| fillers, run-ons, abbreviations (u, pls, thx, whats, hw) | S | "hey can u search for oven pls", "whats sentence 5", "hw many times is hansel said" |
| typos | S/U | one-word typos are corrected by the engine (`sumarize the story`); a typo plus a lead-in ("hey can u sumarize") is not (engine retry, see report) |
| word-order variants (noun first, fragment) | S | "Section 2 summary pls", "Oven search pls", "Witch mentions count", "Start of the story?", "Hansel sister who" |
| synonyms | S | begin/start/open/opening/intro, end/finish/conclude/close, summary/recap/gist/tldr/synopsis/plot, find/search/look for/locate, story/tale/text/file/doc/book/article... |
| pronouns and references | S/U | "who is she" after a name, "the witch, who is that" S; "how are they related" U (isRelated needs two named entities) |
| numbers, ordinals, number words | S | "section two", "the second section", "sentence 5", "Summarize the story in three sentences", "one more result" |
| negation and undo | S | "no more highlights", "get rid of the highlighting", "unhighlight"; "undo the last search" U (no history of searches) |
| coordination | S | multi-command messages are split by the dispatcher/segmenter; one sentence with two intents is U ("summarize it and list the characters" goes to two segments) |
| politeness and chit-chat | S | "could you please...", "hey ...", "I'd like to..." |
| questions about state | S | "which documents do I have", "how many files do I have", "how long is it", "is there a search yet" (step with no search answers honestly) |
| questions about options | U | "what can I ask about the story?" belongs to ui.help |

## Per operation

| Operation | Shapes covered (S) | Unsupported (U) |
| --- | --- | --- |
| describe | "describe/introduce/analyse/explain/inspect the file", "what is this file", "tell me about this document", "give me an overview / info / details of the file", "what is in the file", "have a look at the file" | none known |
| summary (document) | "summarize/recap/sum up/condense/tldr", "sum it up", "summary of the story", "the gist", "short version", "what is the plot", "what is it about / whats this about", "what happens in the story", "story summary pls", "tell me the story in a nutshell", "tell me what the story is about" | "make it shorter" (not a reading operation) |
| summary k | "summarize in three sentences", "sum up the story in two lines" | k for sections ("section 2 in 2 sentences") U: the op takes n or k, not both |
| summary section | "summarize/sum up/tldr section N", "section N summary pls", "short summary of chapter N", "what is section N about / in short", "what does section N cover", "tell me about section N", ordinal forms ("the last section", "the second chapter", "the first one in short") | "page N": a document has no pages. "part N" is read as section N. Ordinals produce `arg.ord`, digits `arg.n` (a held-out label that expects `n=2` for "second" differs only in form) |
| characters | "who are / list / name / show the characters", "cast of the story", "who is in it / who appears in it", "who all is in the story", "which people appear", "characters in the story?", "I wanna know who the characters are" | "how many characters" is stats |
| mainCharacter | "who is the main character / hero / protagonist / lead", "who is the story about", "who does the story follow", "who is it about", "who is mentioned the most", "main character?" | none |
| places | "which places are mentioned", "places in the story?", "places mentioned pls", "what towns/villages/cities appear", "where does the story take place / happen", "where does the story happen, list places", "list the locations" | map display (geo.map) |
| keywords | "key words / keywords / key terms", "top/main/most common words", "what words are used the most", "what are the themes / topics" | none |
| outline | "outline", "table of contents", "headings", "chapter titles", "what are the headings", "what sections does it have", "how is it structured / laid out" | "go to the outline" (navigation) |
| stats | "word/sentence/paragraph/section count", "how many words / sentences does it have", "how long is the story (in words)", "words in the story?", "count the sentences", "number of sentences", "length in words", "show me the stats" | "reading time" as a separate question (answered inside stats) |
| sentence | "sentence 5", "line 5 please", "whats sentence 5", "sentence number 5", "show me sentence 5 pls", "read me number 5 sentence", "what is the fifth sentence" (read ord) | ranges ("sentences 5 to 8") U |
| who | "who is X / whos X / who is that X / the old X", "tell me about X", "tell me who X is", "X, who is that", "what is X like", "what kind of person is X", "what is the role of X", "what do you know about X" | none |
| did / happened / where | "what did X do", "what does X get up to", "what role does X play", "what happens to X (finally)", "what became of X", "X's fate", "how does X end up", "where does X live / go", "where X lives" | none |
| whoV / didV / saying / said | all original forms; "who said Q", "whose line is Q", "speaker of Q", "who was it that said Q", "find who said Q" (with or without quotes and "in the story") | none |
| part | beginning/start/opening/intro, end/ending/conclusion, middle: "what is the beginning like", "start of the story?", "how does the tale open", "what happens first / last", "how did it finish", "tell me how it ends", "what is the first thing that happens"; section forms "what is going on in section N", "what happens in the second chapter" | none |
| count | "how many times is X mentioned / does X appear / often does X come up", "count X", "how many mentions of X", "X mentions count", "number of X mentions", "times X is named", "X how many times", "how many times does the name X appear", typo "hw" | counting non-cast words ("how many times is the oven mentioned") has a low-priority generic pattern; "count" of a phrase with more than four words U |
| search | "find/search/look for/look up/locate/highlight X (in the story)", "find the word X", "search for the word X", "X search pls", "where does X appear", "where is X in the text", "show me where it says X", "is the word X in the story, search it", "any mentions of X in the story" | a bare "find X" without "the word"/"in the story" is U on purpose (it would claim "find the cat" of other worlds) |
| searchStep | "next result / match / hit / one", "next one please", "one more result", "nxt", "skip to the next match", "go back one result", "previous one", "jump to the first hit", "go to the last match" | "next oven" (the search word repeated) U; routed to other worlds |
| clearSearch | "clear/remove/hide/reset the highlights/marks/search", "unhighlight", "get rid of the highlighting", "turn off the search marks", "no more highlights", "remove the yellow marks", "stop highlighting" | none |
| across | "which documents mention X", "what files talk about X", "which doc has X", "is X in any of my documents", "X across documents", "docs that mention X", "in what documents is X", "can you check which documents mention X" | none |
| relation / isRelated | "who is X's sister", "who is the sister of X", "whos hansel's younger sister", "what do you know about X's sister", "how are X and Y related / connected", "what is the connection between X and Y", "are X and Y related" | possessive without apostrophe ("hansels sister") only through the original typo path; "who is the sister" (no owner) U; pronoun pairs U |
| read | "read the first paragraph", "read section 2 (aloud)", "read out the second paragraph", "show me the third paragraph", "go to section 2", "read the story / it / this to me", "read aloud", "narrate the story", "read from the start", "read out the beginning of the story" | page-based reading U |
| list | "which documents do I have", "list my docs pls", "documents list", "what files do I have here", "how many files do I have", "my docs?" | none |
| open / close / loadSample | original forms ("load the sample story", "open the example document", "close the file") | closing "all documents" U |
| ask (passage fallback) | "does the story say X", "what does the story say about X", "according to the text X", "is there a X in the story", "is a X mentioned", "does the tale have a X", "check if there is a X", "could you tell me if the story mentions a X", "does it mention X" | "X in the story?" with nothing else U on purpose (too open, collides with the editor) |

## Notes for the dialog layer

`interceptInput` in `ops.mjs` answers wh-questions of an open document before the formalizer sees them (modal input). The final passage fallback there now leaves the shapes the pattern file reads itself (`STRUCTURED_Q`) to the formalizer. Because of the interceptor, the routed evaluation (`scripts/eval-rules.mjs`) counts those texts as not parsed although the dialog answers them.
