# media.music: request-shape coverage (R2)

Every shape a user may use for each operation of the music world, with the test that proves it (`tests.sop`, ids `t.media.music.rNNN`). `supported` lines have a test; `unsupported` lines say why. Shape names: imp = imperative, q = question/request form ("can you ..."), wish = "I want ...", ind = indirect or statement-as-command ("it should be", "too slow"), el = very short/elliptic, voice = fillers, run-ons, typos and chat abbreviations (u, pls, thx, whats), order = word-order variants, syn = synonyms, ref = pronouns and references to the last thing, num = quantities, units and number words, neg = negation, undo = going back, state = questions about the state, opts = questions about the options, coord = coordination.

Shared by every pattern: polite and filler prefixes (can u, could you maybe, hey, um, like, i want, i would like to), trailing fillers (pls, plz, thx, thanks, for me, now, asap, would be nice), number words and digits, and the typo tolerance of the formalizer (spec 03 1b). Songs are recognised by title or nickname (`lex.media.music.songtitles`, `songstarts`).

## music.playAny

| shape | example | status | test |
| --- | --- | --- | --- |
| setup | Play Ode to Joy. | supported | r001 |
| imp | Play Twinkle Twinkle. | supported | r042 |
| q | Can you sing Ode to Joy? | supported | r043 |
| wish | I wanna hear jingle bells. | supported | r044 |
| el | happy birthday pls | supported | r045 |
| order | Bells version of Happy Birthday. | supported | r046 |
| syn | Put on Frere Jacques. | supported | r047 |
| voice | how about some jingle bells | supported | r048 |
| num | Play Twinkle Twinkle at 80 bpm. | supported | r049 |
| ref | Play twinkle twinkle little star on the flute. | supported | r050 |
| setup | Play Twinkle Twinkle. | supported | r072 |
| setup | Play Twinkle Twinkle. | supported | r088 |
| setup | Play Twinkle Twinkle. | supported | r138 |

## music.playNote

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play middle C. | supported | r002 |
| q | Can you play an E? | supported | r003 |
| wish | I want to hear a high C on the bells. | supported | r004 |
| ind | How does middle C sound? | supported | r005 |
| el | E note pls | supported | r006 |
| voice | um so like could you maybe play an F for me | supported | r007 |
| order | Note E. | supported | r008 |
| syn | Ding a C on the bells. | supported | r009 |
| num | Play F sharp 4. | supported | r010 |
| ref | Play just one E note. | supported | r011 |
| coord | Play C and then play G. | supported | r012 |
| neg | - | unsupported: no negated form of a note request ("don't play C" is a stop, see music.stop) | - |
| opts | - | unsupported: the list of notes is answered by "what notes are in C major?" (music.scaleNotes) | - |
| ind | - | unsupported: solfege names (do re mi) are not note names in the lexicon | - |
| ind | - | unsupported: "the A above middle C" (register relative to another note) is not parsed; say "play a high A" or "A 4" | - |

## music.playChord

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play a C major chord. | supported | r013 |
| q | Could you play an F major chord on the organ please? | supported | r014 |
| wish | I want to hear a D minor chord. | supported | r015 |
| ind | A g minor chord would be nice. | supported | r016 |
| el | c major chord pls | supported | r017 |
| voice | hit a G7 | supported | r018 |
| order | Play a chord, A minor, on the organ. | supported | r019 |
| syn | Strum an A minor 7 on the strings. | supported | r020 |
| num | Play a dominant seventh chord in C. | supported | r021 |
| state | What does a G major chord sound like? | supported | r022 |
| imp | Play a diminished B chord. | supported | r023 |
| imp | Arpeggiate G minor. | supported | r024 |
| ind | G major chord but one note after another. | supported | r025 |
| el | an a minor arpeggio pls | supported | r026 |
| syn | Spread the G chord out. | supported | r027 |
| order | Play C E G together. | supported | r028 |
| voice | make the g chord into single notes | supported | r029 |

## music.playScale

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play the D major scale. | supported | r030 |
| q | Can you play a blues scale? | supported | r031 |
| wish | I wanna hear the mixolydian scale in G. | supported | r032 |
| el | d major scale pls | supported | r033 |
| order | Scale of F major please. | supported | r034 |
| syn | Run up the C major scale. | supported | r035 |
| voice | e min pentatonic | supported | r036 |
| num | Play the C major scale at 100 bpm. | supported | r037 |
| state | What does the d major scale sound like? | supported | r038 |
| ind | Could you go through the scale of G major? | supported | r039 |
| imp | Play the whole tone scale. | supported | r040 |
| el | Scale please. | supported | r041 |

## music.random

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play something. | supported | r051 |
| q | Can you play a random song? | supported | r052 |
| wish | I want to hear some music. | supported | r053 |
| el | Surprise me. | supported | r054 |
| voice | i dont care, play something | supported | r055 |
| syn | Pick a song for me. | supported | r056 |
| ref | Play another tune. | supported | r057 |

## music.listSongs

| shape | example | status | test |
| --- | --- | --- | --- |
| opts | Which songs do you know? | supported | r058 |
| el | songs? | supported | r059 |
| q | Do you know any songs? | supported | r060 |
| order | Whats in your song library? | supported | r061 |
| imp | List the songs. | supported | r062 |

## music.listInstruments

| shape | example | status | test |
| --- | --- | --- | --- |
| opts | Which instruments do you have? | supported | r063 |
| el | instruments? | supported | r064 |
| imp | List the instruments. | supported | r065 |
| q | What instruments can i use? | supported | r066 |

## music.listTypes

| shape | example | status | test |
| --- | --- | --- | --- |
| opts | Which scale types exist? | supported | r067 |
| imp | List the chord types. | supported | r068 |
| el | chord kinds pls | supported | r069 |
| q | What kinds of chords can you play? | supported | r070 |
| order | Show me the list of scale types. | supported | r071 |

## music.replay

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play it again. | supported | r073 |
| el | again | supported | r074 |
| q | Can you run that once more? | supported | r075 |
| wish | I want to hear it again. | supported | r076 |
| voice | one more go | supported | r077 |
| syn | Encore. | supported | r078 |
| ref | Say it again. | supported | r079 |

## music.stop

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Stop the music. | supported | r080 |
| el | stop | supported | r081 |
| q | Can you stop? | supported | r082 |
| wish | I want it to stop. | supported | r083 |
| voice | okay be quiet | supported | r084 |
| syn | Cut it out. | supported | r085 |
| ref | Stop that noise. | supported | r086 |
| neg | Turn the music off. | supported | r087 |
| voice | - | unsupported: misspellings that are further than the typo tolerance (stahp) are not corrected | - |

## music.loop

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Loop it. | supported | r089 |
| q | Can you put it on repeat? | supported | r090 |
| wish | I want it to loop. | supported | r091 |
| el | keep looping that | supported | r092 |
| syn | Play it over and over. | supported | r093 |
| voice | turn on looping | supported | r094 |
| neg | Dont loop it. | supported | r095 |
| neg | Stop looping. | supported | r096 |
| imp | Play it just once. | supported | r097 |

## music.status

**Shape.** `media.music.status.tempo`, `.key`, `.instrument`, `.volume` (ask.value family, noun-only) generate the question, imperative (`tell me the tempo`), wish, indirect (`do you know the volume`) and short forms (tests sh06 to sh09); the key shape excludes `it` so that `what key is it in` stays the song-info question.

| shape | example | status | test |
| --- | --- | --- | --- |
| state | Is it looping? | supported | r098 |
| state | What key are we in? | supported | r160 |
| state | What tempo is it? | supported | r161 |
| state | What is the volume? | supported | r162 |
| state | Which instrument are you using? | supported | r163 |
| state | What is playing? | supported | r164 |
| state | Is the music playing? | supported | r165 |
| opts | Whats playing now? | supported | r166 |

## music.tempo

**Shape.** `media.music.tempo` (set family, noun-only) generates imperative, wish, indirect, question, state and short forms of "set the tempo to N": `could you maybe set the tempo to 100`, `can the tempo be 90`, `the tempo should be 90`, `I want the tempo 90` (tests sh01, sh05). The hand-written faster/slower/factor patterns stay (comparatives and factors are not a value slot).

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Speed it up. | supported | r099 |
| q | Can you slow it down a bit? | supported | r100 |
| wish | I want it faster. | supported | r101 |
| ind | The tempo is too slow. | supported | r102 |
| el | Quicker. | supported | r103 |
| voice | a bit quicker plz | supported | r104 |
| order | tempo 90 | supported | r105 |
| syn | Hurry up. | supported | r106 |
| num | Set the speed to 90 bpm. | supported | r107 |
| num | Make it 90 beats per minute. | supported | r108 |
| num | Play it at half speed. | supported | r109 |
| num | Double speed. | supported | r110 |
| neg | Not so fast. | supported | r111 |
| undo | Back to normal speed. | supported | r113 |
| ind | Its too fast. | supported | r114 |

## music.volume

**Shape.** `media.music.volume` (set family, noun-only, extra `percent`) generates the same forms for "set the volume to N" (test sh02); loud/quiet comparatives, too-loud statements and max/min words stay hand-written.

| shape | example | status | test |
| --- | --- | --- | --- |
| coord | Make it louder and then stop. | supported | r112 |
| imp | Turn it up. | supported | r115 |
| q | Can you make it a bit louder? | supported | r116 |
| wish | I want it quieter. | supported | r117 |
| ind | The volume is too low. | supported | r118 |
| el | Quieter. | supported | r119 |
| voice | i cant hear anything | supported | r120 |
| order | volume max pls | supported | r121 |
| syn | Crank it up a little. | supported | r122 |
| num | Set the volume to 30. | supported | r123 |
| num | Volume at 80 percent. | supported | r124 |
| num | Full volume. | supported | r125 |
| neg | Not so loud. | supported | r126 |
| ind | Too loud. | supported | r127 |
| num | Mute the volume. | supported | r128 |

## music.instrument

**Shape.** `media.music.instrument` (set family, noun-only) generates "change/switch/set the instrument|sound|voice to X" in all forms (test sh04); `use X`, `make it sound like X`, `flute pls` and `can it be X` stay hand-written.

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Use the flute. | supported | r129 |
| q | Can it be the organ instead? | supported | r130 |
| wish | I want a violin sound. | supported | r131 |
| ind | The sound should be piano. | supported | r132 |
| el | piano | supported | r133 |
| order | Instrument flute pls. | supported | r134 |
| syn | Make it sound like a marimba. | supported | r135 |
| undo | Go back to piano. | supported | r136 |
| voice | what about the cello | supported | r137 |

## music.octave

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play it an octave higher. | supported | r139 |
| q | Could you play it an octave lower? | supported | r140 |
| el | octave up | supported | r141 |
| order | Down 2 octaves pls. | supported | r142 |
| num | Two octaves down. | supported | r143 |
| ind | Too high. | supported | r144 |
| voice | an octave lower twice | supported | r145 |

## music.transpose

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Transpose it up a fifth. | supported | r146 |
| q | Can you move it up a semitone? | supported | r147 |
| el | up a whole tone pls | supported | r148 |
| num | Transpose down 3 semitones. | supported | r149 |
| syn | Raise it by a minor third. | supported | r150 |
| order | A half step lower. | supported | r151 |

## music.transposeTo

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Transpose it to G major. | supported | r152 |
| q | Can you put it in the key of E? | supported | r153 |
| el | in G please | supported | r154 |
| order | Shift the whole thing to D major. | supported | r155 |

## music.key

**Shape.** `media.music.key` (set family, noun-only, extra slot for major/minor) generates "set the key to D major" in all forms (test sh03); `we are in G`, `key = D` stay hand-written.

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Set the key to A minor. | supported | r156 |
| ind | The key is G major. | supported | r157 |
| wish | I want the key of C. | supported | r158 |
| order | Key of D. | supported | r159 |

## music.melodySet

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Write a melody C D E F G. | supported | r167 |
| wish | I want to write a melody: A B C | supported | r169 |
| el | melody: A A B A | supported | r170 |
| order | Here is my tune: E E E | supported | r171 |
| voice | start a new melody with E E F G | supported | r172 |
| syn | Compose C D E C. | supported | r173 |
| ref | C D E F G as my melody. | supported | r174 |

## music.melodyShow

| shape | example | status | test |
| --- | --- | --- | --- |
| q | What is my melody? | supported | r168 |
| imp | Show my melody. | supported | r186 |
| q | What have i written so far? | supported | r187 |
| num | How many notes are in my melody? | supported | r188 |
| order | List the notes of my melody. | supported | r189 |

## music.melodyAdd

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Add the notes E D C. | supported | r175 |
| el | add C | supported | r176 |
| ref | Next note G. | supported | r177 |
| syn | Keep going with D C. | supported | r178 |
| voice | More notes: C D. | supported | r179 |
| imp | Add a rest. | supported | r180 |
| syn | Put a rest at the end. | supported | r181 |
| el | - | unsupported: a sentence-initial "then"/"after that" is dropped by the formalizer (spec 03 1.5), so "then E F" reads as bare notes; "add E F" or "next E F" works | - |

## music.melodyUndo

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Remove the last note. | supported | r182 |
| voice | oops undo that note | supported | r183 |
| syn | Take the last note away. | supported | r184 |
| neg | Delete the last note please. | supported | r185 |
| ind | - | unsupported: bare "undo"/"oops" is claimed by the other worlds (chess undo, art undo) unless the music tab or a recent music reading is active | - |

## music.playMelody

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Play my melody. | supported | r190 |
| ref | Play my tune i made. | supported | r191 |
| voice | hear my notes back | supported | r192 |
| ref | Play back my notes on the flute. | supported | r193 |

## music.showScore

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Show the sheet music. | supported | r194 |
| q | Can i see the score? | supported | r195 |
| wish | I want to read the music of this tune. | supported | r196 |
| order | Where is the sheet music for this? | supported | r197 |
| el | score please | supported | r198 |
| syn | Write it out as notation. | supported | r199 |

## music.showNotes

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Show the notes. | supported | r200 |
| q | What notes is this? | supported | r201 |
| el | notes pls | supported | r202 |
| ref | Tell me what notes it plays. | supported | r203 |

## music.melodyClear

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Clear my melody. | supported | r204 |
| syn | Erase the tune. | supported | r205 |
| order | New melody. | supported | r206 |
| neg | Start the melody over. | supported | r207 |
| opts | - | unsupported: bare "start over" is a game command (games.*), so it only clears the melody when a melody noun is named | - |

## music.scaleNotes

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Spell the D major scale. | supported | r208 |
| q | What notes are in G major? | supported | r209 |
| order | G major scale notes. | supported | r210 |
| wish | List the notes of a minor scale starting on A. | supported | r211 |
| voice | whats in the pentatonic scale of G | supported | r212 |
| syn | Which tones does the A harmonic minor scale have? | supported | r213 |

## music.chordNotes

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What notes are in a D minor chord? | supported | r214 |
| order | C major chord notes. | supported | r215 |
| voice | what pitches are in an Am | supported | r216 |
| q | Which notes make a C major chord? | supported | r217 |

## music.chordName

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What chord is C E G? | supported | r218 |
| order | C E G is what chord? | supported | r219 |
| voice | is C E G a chord, which one | supported | r220 |
| syn | Name this chord: C Eb G Bb. | supported | r221 |
| q | What chord has notes G B D? | supported | r222 |

## music.keySig

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | How many sharps are in D major? | supported | r223 |
| q | Which sharps are in D major? | supported | r224 |
| order | D major key signature. | supported | r225 |
| voice | sharps count for E major? | supported | r226 |

## music.keyWith

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Which key has 2 sharps? | supported | r227 |
| q | What major key has no sharps or flats? | supported | r228 |
| num | Key with 5 sharps pls. | supported | r229 |

## music.interval

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What is the interval between C and G? | supported | r230 |
| q | How far apart are C and G? | supported | r231 |
| num | How many half steps from A to C? | supported | r232 |
| order | Interval C to E pls. | supported | r233 |

## music.above

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What note is a fifth above C? | supported | r234 |
| order | E flat plus a major third? | supported | r235 |
| num | Whats 2 semitones above B? | supported | r236 |
| syn | Down a fourth from G, what note? | supported | r237 |

## music.relative

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What is the relative minor of C major? | supported | r238 |
| q | Which minor goes with C major? | supported | r239 |
| order | C major's relative minor is what? | supported | r240 |
| voice | whats the relative of G major, minor? | supported | r241 |

## music.keyChords

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What chords are in G major? | supported | r242 |
| q | What can i play in G major, chords? | supported | r243 |
| el | chords of A minor | supported | r244 |

## music.frequency

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What is the frequency of A4? | supported | r245 |
| voice | tell me the frequency of concert A | supported | r246 |
| order | Middle C hertz? | supported | r247 |
| syn | Could u tell me the freq of A 4 | supported | r248 |

## music.enharmonic

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | What is the enharmonic of F sharp? | supported | r249 |
| q | Is C sharp the same as D flat? | supported | r250 |
| voice | C# is also what? | supported | r251 |
| syn | Whats C sharp called in flats? | supported | r252 |

## music.songInfo

| shape | example | status | test |
| --- | --- | --- | --- |
| imp | Who wrote Jingle Bells? | supported | r253 |
| voice | whos the composer of Ode to Joy? | supported | r254 |
| q | Tell me who wrote Ode to Joy. | supported | r255 |
| q | What key is Ode to Joy in? | supported | r256 |
| num | How fast is Twinkle Twinkle? | supported | r257 |
| imp | Tell me about Frere Jacques. | supported | r258 |

## music.*

| shape | example | status | test |
| --- | --- | --- | --- |
| coord | - | unsupported: three or more commands in one run-on message are cut into pieces by the dispatcher (DistilBERT); the rules take one clause level at a time (spec 03 section 4.3), each piece is covered above | - |

## Unsupported across the world

- coord: three or more commands in one run-on message are cut into pieces by the dispatcher (DistilBERT); the rules take one clause level at a time (spec 03 section 4.3), each piece is covered above

Totals: 258 supported lines (each with a test), 9 unsupported lines (with the reason).

**L7 (macros, extends, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 80 repeated lists are macros) and the degree lexicon extends `lex.lang.degree`. Eight shapes (tempo, volume, key, instrument and four status asks; 48 generated patterns) cover the operations named above; nine hand patterns whose examples a shape covered completely were deleted (`tempo.set volume.set inst.change key.set s.tempo s.inst s.key s.key2 r2.status.key`). The unguarded `{notes:rest}` captures now use `rest(notes)`: the migrated lead-ins are wider than the copied lists and a bare `rest` read "show my lists" as notes.
