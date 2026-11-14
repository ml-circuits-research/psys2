# SOURCE: public-domain tales (Grimm, Andersen, Aesop), 369 stories

- Fetched: 2026-11-14 from Project Gutenberg plain-text ebooks (`https://www.gutenberg.org/cache/epub/<n>/pg<n>.txt`), User-Agent `psys2-data-fetch/1.0`:
  - 2591 Grimms' Fairy Tales (Jacob and Wilhelm Grimm; translations by Edgar Taylor and Marian Edwardes), https://www.gutenberg.org/ebooks/2591
  - 1597 Andersen's Fairy Tales (Hans Christian Andersen, English translation), https://www.gutenberg.org/ebooks/1597
  - 11339 Aesop's Fables, a new translation (V. S. Vernon Jones, 1912, with an introduction by G. K. Chesterton), https://www.gutenberg.org/ebooks/11339 (used instead of ebook 21)
- Licence: public domain in the United States (19th and early 20th century texts). Outside the US, check local rules before redistributing. Human-written text, unlike the synthetic TinyStories.
- Gutenberg header and footer removed as the Project Gutenberg licence requires for redistribution without the trademark: everything up to and including the `*** START OF THE PROJECT GUTENBERG EBOOK ...` line and everything from the `*** END OF ...` line on. The `source` ids (`gutenberg:<n>`) only identify the origin.
- File `tales.jsonl`: one story per line, `{source, title, text}`; `title` is the story heading as printed (upper case), `text` the story body with the original line wrapping and paragraph breaks (blank line between paragraphs), `[Illustration ...]` lines removed.
- Split: story headings are the unindented all-capitals lines that follow the table of contents and have two blank lines before and a blank line after; the text runs to the next heading. Headings with no body (book title, "THE ADVENTURES OF CHANTICLEER AND PARTLET", "THE WEDDING OF MRS FOX", the Aesop illustration lists) are dropped; their numbered or "FIRST/SECOND STORY" children are kept with the parent title as a prefix.
- Counts: 369 records = Grimm 65 (including 3 Chanticleer and 2 Mrs Fox sub-stories), Andersen 18, Aesop 286. About 1.07 MB.
- Not edited otherwise (spelling, quotes and the Aesop morals are as in the source).
