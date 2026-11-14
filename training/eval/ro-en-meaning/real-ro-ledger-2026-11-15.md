# Failing real Romanian turns, shipped chain in node (Bergamot model + rules + repaired), 2026-11-15

89 failing of 291 Romanian turns of the real set (real: true for all). Rules only: 95 failing; failing in both chains: 78; failing only with the model: 11; fixed by the model: 17.

| cause | turns | also failing with rules only | examples |
| --- | ---: | ---: | --- |
| Romanian turn not read (translation or reader) | 51 | 46 | `she knows what their grandma could trade charcoal `, `fa picioarele corocilului negre`, `muta crocodilii mai jos` |
| translation residue / wrong sense / source typo | 25 | 20 | `muta capra linga rata`, `fii în boi`, `și Angie` |
| continuation / correction / why-question | 7 | 6 | `nu inlocui lacul, deasupra, ai loc`, `cum ai ajuns a deschisi joculd e sah? e ridicol`, `mai jos, sta pe leagan nu pe el` |
| unknown kind (no drawing / stand-in) | 2 | 2 | `deseneaza o minge`, `fa un bunic linga rata` |
| amount / relation / set distribution | 2 | 2 | `muta capra mai jos , si mai in stinga`, `muta vaca si mai jos si mai in dreapta` |
| acted on a partly understood sentence | 1 | 1 | `fă un layout mai frumos` |
| foreign-world reading | 1 | 1 | `an old woman` |
