# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```

## Q5 (task R2 games, 2026-11-08)
Question: In a game tab, should "new game" / "hint" / "give up" be labelled with the game's own action (`ttt.new`, `hm.giveup`, …) or with the shell form (`ui.newGame`, `ui.hint`, `ui.giveUp`)?
Context: The paraphrase gold is inconsistent: held-out has "new game" as `ttt.new` in the tic-tac-toe tab and "new game pls" as `ui.newGame` in the hangman tab. Routed, the shell already executes these as the active game's action. Letting game patterns outbid the shell would steal these commands outside the game tab.
Blocking: no. Choice meanwhile: keep the shell form (rules unchanged); these records count as failures in rules-only restricted numbers. Proposed engine change: the shell emits the active tab's own game action, and the dataset is relabelled to it.
