# Avatar tab: sources (220 items, built by scripts/avatar_items.py)

Corpora (all human-written; licences checked on the official HF dataset cards; all items redistributable:true per owner update)
- RealEdit, 92 items. Real r/PhotoshopRequest post titles and bodies, licence CC BY 4.0,
  https://huggingface.co/datasets/peter-sushko/RealEdit. Only the human `title`/`selftext` was used; the LLM `instruction` column was ignored.
- MagicBrush, 79 items. Crowd-written multi-turn edit instructions, licence CC BY 4.0, https://huggingface.co/datasets/osunlp/MagicBrush
- Emu Edit test set, 49 items. Crowd-written instructions, licence CC BY-NC 4.0, https://huggingface.co/datasets/facebook/emu_edit_test_set
- Not used: CelebA-Dialog. Its captions and requests are template-generated (Talk-to-Edit paper) and its terms forbid redistribution.
  Also not used: InstructPix2Pix and HQ-Edit (LLM-generated), and GIER (global photo adjustments, no licence or download found).

Pools and sampling
- RealEdit: 50,672 PhotoshopRequest posts. 7,245 matched face/hair/accessory keywords. I drew a seeded random sample of 400 (seed 7)
  and reviewed items 0-229 in order, plus a keyword scan of 230-330. About 25% were usable avatar edits. The rest were face swaps,
  backgrounds, restoration, glare/lighting, animals and photo blemishes. In addition, 9 items come from a targeted keyword pass over all 7,245 posts
  (move, raise, straighten + face part), because move/position requests were rare in the random sample.
- MagicBrush: text rows were fetched through the HF rows API. Only the first 897 train turns arrived before rate limiting (out of 10,388).
  170 matched person/face keywords. I kept every turn that is about head, face, hair, expression, headwear or upper clothing (about 45%),
  skipping body actions, pants and shoes.
- Emu Edit: 2,022 validation rows were fetched (the test split was partial and not used). About 200 were person-related,
  excluding the background/global/style/text tasks. I kept the face/hair/headwear/clothing ones, both add and remove.
- I removed 9 near-duplicates (repeated blonde/red/bald/Santa/cap requests) to stay within 220. Sessions: 28 sessions covering 60 items.
  These are MagicBrush multi-turn sequences, or an add followed by a later edit/remove of the same accessory from the same corpus.

Adaptation rules
- Person references were mapped to the single avatar: the man/woman/boy/person/my mom/"the dude on the right"/celebrity names became her/the girl/the child.
  Animal subjects (cat, horse, snowman, frog) also became her. Possessive gender was changed to "her".
- Dropped: Reddit tags ([Specific], [Paid] $10), backstory sentences, and sub-requests about the photo (background, glare, caption, other people).
- Kept: politeness, hedges, typos ("while" for white, "there face", "possibile"), fragments, meme and celebrity references,
  and requests that presuppose absent things or are already true (e.g. "make her hair red").
- One reversal: "change the man into a girl" became "change the girl into a man", because the avatar already is a girl.
Coverage: hair 57+, clothes 34, hats 30, preset/expression/size 30, eyes 18, mouth/teeth 16, glasses/sunglasses 14, beard/moustache 9, skin 3, move 7 effects.
