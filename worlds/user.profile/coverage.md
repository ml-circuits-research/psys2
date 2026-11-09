# user.profile coverage


**L7 (macros).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs`: only 6,328 bytes of match text, so the gain is small (5 world-local phrases; 4 % of the file). No shape: the profile statements ("my name is X", "I live in X", "I am N years old", forgetting) capture free text or numbers and have one phrasing per fact.
