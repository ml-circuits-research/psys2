# drawing tab: sources (256 items; built by scripts/drawing_spec.py + scripts/drawing_build.py)
## Corpora (licence verified; every item records its real licence)
- CoDraw (Kim et al. 2019), 100 items. Licence CC BY-NC 4.0 (LICENSE in https://github.com/facebookresearch/CoDraw).
  The official JSON on Google Drive needs a sign-in (HTTP 401), so codraw-models/transcripts-eval-v1.json was used.
  Its teller_nn_a and teller_pragmaticnn_a turns are human CoDraw training utterances, retrieved verbatim (the code
  does no normalisation). Pool: 4,668 distinct utterances, all turns that added exactly one clipart, so compound turns
  are rare.
- MagicBrush (2023), 126 items in 26 sessions of 2-3 turns. Licence CC BY 4.0, https://huggingface.co/datasets/osunlp/MagicBrush.
  Only the instruction column of the dev and test parquet files was read, by range requests (no images).
  Pool: 1,505 instructions over 762 images.
- BLOCKS (Bisk et al. 2016), 30 items, https://groundedlanguage.github.io/. No licence is stated, so it is recorded
  as unknown. Pool: 2,532 dev directions (MNIST and Random).
- redistributable=true on all items, per the owner update relayed during the task.
## Sampling (seeded random)
- CoDraw: 170 drawn uniformly, 146 relevant (86%), uniform random 100 kept. Dropped turns had unseedable landmarks
  (table, slide, grill) or were empty fragments.
- MagicBrush: 110 images (214 turns) drawn, 126 relevant (59%). Dropped turns had no clipart counterpart (toilet lid,
  faucet, screen contents). Consecutive turns on one image form a `session`.
- BLOCKS: 60 drawn, 35 relevant (58%), random 30 kept. Dropped: unnamed blocks referenced only by board position, and
  20-block plans.
## Adaptation rules
- Phrasing is verbatim, including typos, fragments and run-ons. For CoDraw only, corpus tokenisation was undone
  (" ," -> ",", "it 's" -> "it's", "1 2 inch" -> "1/2 inch").
- Mike -> boy, Jenny -> girl. Unseedable landmarks were swapped for seedable kinds (bear -> dog, bee -> bird,
  slide/tent -> house, beach ball -> balloon). Nouns of created objects are kept (owl, kite, helicopter).
- MagicBrush photo nouns -> clipart nouns (plane/bus/van/train -> car, zebra/cow/horse/sheep -> dog). Objects with no
  clipart kind are seeded as named shapes (sign -> rectangle, plate/orange -> circle).
- BLOCKS: numbered blocks are squares named "block N", text unchanged. Logo blocks -> clipart (Mercedes -> car, ...),
  dropping the word "block" and adding "the".
- Effects: 177 create, 53 change, 39 move, 16 remove, 3 no_change. 99 items are relation-tagged, 76 part-tagged,
  5 multi-request.
