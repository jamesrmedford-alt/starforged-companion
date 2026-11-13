# Starforged Companion — Architecture Decisions

Key decisions made during development. Read this before making changes to understand
why things are the way they are. Each decision includes the reason and what was
rejected.

---

## Issue #354 (alpha 23 playtest part 2): dialogue is not a move, the spotlight is opt-in, a reverted price is whole (2026-11)

**Decision:** ([#354](https://github.com/jamesrmedford-alt/starforged-companion/issues/354); the maintainer's answers of 2026-11-13 to its six open questions.) The guiding principle is issue #348's: corrections, not reversals — "depict, do not offer", the optional closing move hint and the classifier → interpreter → resolver pipeline all stay.

The six answers:
- **P2-02 — Balanced Mischief stays in kind.** A Balanced misread may change the stat or pick a neighbouring move; it never turns a line of dialogue into a travel, fate or suffer move. The framing says so, and `interpreter.js` `keepMischiefInKind` holds it in code: a reading the model marked as a misread (`mischiefApplied`), of a line the classifier placed in a social scene, that lands on an exploration, fate or suffer move is put back to the move the classifier named. Chaotic keeps its freedom. A reading that is not a misread is untouched, so issue #348 PT06's reroute (a journey through uncharted space is an expedition) stands.
- **P2-04 — both narrowings of the Connection rule.** The classifier leans toward MOVE only for a line that presses someone for something they are reluctant to give, or tests or deepens the relationship, *and* only when that someone is one of the speaker's own connections — the bond Items on that character's sheet (`actorBridge.readConnections`), not every NPC card. Under FOLDER-002 every named individual is a connection-type card, so "the addressee is a Connection" had come to mean every tracked NPC. Plain conversation and an everyday action with nothing at risk are narration, whoever they are with.
- **P2-05 — the minimum line length stays, and says so.** A line under ten characters is still read as table talk (short out-of-fiction chatter must not be narrated). Its author is told, on their own client, and the line goes back in their chat box. Not accepted: narrating any line with a word in it, or giving the classifier a "not part of the fiction" answer.
- **P2-07 — Rotating Spotlight defaults off, with a one-time switch-off.** Saving the Narrator tab stores every field, so a default flip alone would reach almost no existing world: the canonical GM switches a stored "on" off once at world load, whispers the GMs why, and marks the world (`narratorSpotlightDefaultOffApplied`). A GM who ticks it again keeps it. This amends "Multiplayer spotlight is implied by narration", which recorded "(world, default on)". The rotation still counts characters, not players — it was not gated on connected users.
- **P2-10 — free-flow asks Burn / Improve / Keep before a result's price and narration**, as a Batch Mode round asks before its narration. A result whose card offers Burn Momentum or Improve Result is *held* (`rollMove`'s `holdForUpgrade`; `moves/heldResult.js`): the card posts with **Keep the result**, the move is recorded so the buttons are live, and nothing is paid or narrated. Keep pays the price and narrates; a burn or an improvement finds nothing paid — nothing to undo, nothing struck — and its narration is the move's one narration, told the player's own line, after paying the held price if the upgraded result pays one too. The roller going on keeps it: their next line or move ("burn momentum before applying any other effects of the move"), or a consequence chosen on the outcome's choice card. What the wait needs is on the card (`flags.awaitingUpgrade`), so it survives a reload and any GM can press Keep. This goes further than a round, which pays the price at the roll and holds only the narration — the round was not changed. Results that offer no upgrade are paid and narrated at once, as before. **A world setting, "Ask before paying and narrating" (`holdResultForUpgrade`, default on), switches it off** — not asked for in the decision; added because the flow could not be played in Foundry before it shipped, and because off keeps the earlier pay-then-undo flow (which a round's rolls still use) reachable from free-flow and its tests on it. Remove the setting once the held flow has been played, if the table has no use for the old one. Known limit: a held result whose roller never acts again, and whose card nobody presses, stays held — End a Session does not settle it.
- **P2-16 — a "No one" choice beside Confirm on free-flow New Entities cards.** Amends issue #342 D3, which kept one Confirm on free-flow cards: a person's row now asks whose connection they are on every card — the narration's PC by name, and **No one**, which records the person with no bond Item on anybody's sheet (the `noBond` path a round's card already had). A Confirm that always bonded put a hostile stranger on a PC's sheet as a relationship.

What the fixes established:
- **A line can make no move (P2-01).** The interpreter may answer `"moveId": null`; `readMove` returns that — or a low-confidence reading outside a fight — as `noMove`, and the line is narrated as a paced line with the classifier's move offered on its card. Not when a roll was asked for (`!roll`, a round's "Roll a move instead") or with pacing switched off, where every line is a move as before. A reply that names no move at all, or cannot be parsed, is a failed reading: it goes to the confirm dialog, never to narration. The confirm dialog's **No move — narrate** and the "Not rolled" notice's **Narrate it — no move** narrate a typed line as it stands. A confidence threshold on the classifier was considered and withdrawn (P2-03): four of the seven unwanted rolls scored 75–80%.
- **The classifier's reading is the interpreter's context (P2-02).** On a MOVE decision the router hands on the move the classifier named (`nominatedMove`), its category and its reasoning; the interpreter takes them as a hint, not a ruling. Disagreement between the two is not treated as "not a move" — one of the playtest's five disagreements was a correct refinement.
- **The interpreter is told who is speaking (P2-06)**, in the narrator's words. And "inter-PC tension is roleplay, not a roll" holds on a MOVE decision too: a social move read into a line that names another PC and no tracked NPC is narrated.
- **"You" is one character for a whole card (P2-08).** In second person the acting character is "you" and is named only in dialogue; every other PC is named. The SPOTLIGHT block takes the narration's resolved perspective, ends on whoever the last line of dialogue is spoken to, and asks only what a character does.
- **A reverted price is reverted whole (P2-09).** Update to "Burn Momentum reverses Pay-the-Price side effects", which left Withstand Damage and Companion Takes a Hit out "until a playtest shows it matters": the price's receipts now include the vehicle integrity or companion health its route took (`ptpReversals.assetDeltas`), a burn or an improvement puts it back — as a restore, which the battered rule does not refuse — and the price's own cards are struck as its narration is. The at-0 results a hit posted (the Vehicle Damage table's text, "companion destroyed") are advisory text on a card that is struck with it; nothing else was applied for them. A burned result that pays the price too keeps it.

- **One thing has one record, whatever it is called (P2-15 – P2-17, P2-30).** Names are compared by one shared, pure module (`entities/nameMatch.js`), and each caller keeps the decision about what a match means. A *person* matches under part of their name or a near spelling (the dedupe gate treats any such match as "already known"); a *place or thing* when one name is inside the other as whole words (lore routing takes it only when exactly one record answers — two is nobody's, and the fact stays world lore); a *threat* or a *plan's subject* when one name is the other with more said, or its start or end. Names with no word in common never match in code: only someone who read the scene knows "the second presence" is the escort. This sits beside "Placeholder figures are renamed in place; genuinely-named entities are never auto-merged": nothing here merges two existing entity records — it stops a second one being started. The one merge is of duplicate *threat pages*, and only when a GM asks: the others are closed as resolved and marked `mergedInto`, never deleted.
- **A threat's severity is one of four words (P2-15).** `immediate | active | looming | resolved`. Anything else given as a severity is read as the one it means ("high" → immediate) or, when it is a sentence, kept as the threat's summary and a history line. The detector is shown names and severities apart, and names a threat by its name alone.
- **A contradiction's card shows the fact, not a pointer to it (P2-19)**: the recorded value read from the ledger the audit was given, and the narration's own words.
- **Narration length is a word budget (P2-20).** The Length setting keeps its 1–6 range and its meaning as "about that many sentences of ordinary length", but the narrator is given words: 22 a step, never more than 28, in at most 1.5 sentences a step, none over about 30 words (18 with audio narration on). At the default 3 that is about 65 words, at most 85, in at most 5 sentences — roughly half what the playtest's beats ran to. The constants are in `narration/proseVariety.js`; they are the tuning point.
- **The narrator writes plainly, and the module varies the beat (P2-21, P2-22, P2-27).** "Vivid, atmospheric prose" is gone from every role; a standing PROSE rule allows at most one comparison a narration. What a rule cannot hold — not repeating an image, not building every beat the same way — the module does: it lists the comparisons the session's last six narrations made (a regex over the cards, nothing stored) and picks one of five shapes for each beat by its place in the session, so two in a row never share one. Levity's permission is restated with the beat, where the miss is. Not accepted: storing used images or the last shape in campaign state — both follow from the narrator cards, the ring's own source, so there is no second store to drift.
- **The narrator's system prompt is ordered by how often each part changes, and cached in parts (P2-23).** `standing` (voice rules, safety, truths, premise, the sidecar format, NPC markup — the same for every prose mode), `mode` (role, perspective, length, permission class) and `beat` (everything else); the request caches the first two, each on its own breakpoint, for one hour — a table's beats are often more than five minutes apart, and a read restarts the hour. This **reverses "the sidecar instruction is appended last so it is the most recent guidance the model sees"**: the instruction is now in the cached standing block and the context closes on RESPOND NOW, a pointer to it that names no key. The issue's lower-risk variant (role first, one cached block per mode, no reordering) was not taken: the two modes that alternate all session would share nothing. `rules/narrator-memory.md` invariant 7b holds the layout; `narratorPromptBlocks.test.js` fails when a per-beat value reaches a cached block. **Not verified against the live API** — neither that reads now happen nor that the sidecar is still returned on every reply; the Narrator Usage page's Cache read column and the sidecar-missing warnings are the checks, on the next played session. If compliance drops, the fallback is the variant above, not moving the instruction back into an uncached block.
- **"Delayed or put at a disadvantage" is a routed price (P2-12).** The Pay the Price table leaves purely fictional results unrouted on purpose; this row is not one — it names Lose Momentum's own trigger. It costs −1, as the table's other routes do.
- **A change the module reports on its own card is not also posted as the system's note (P2-13).** Issue #348 PT14 re-spoke the ironsworn system's change notes as Gamemaster notes; where a suffer card (or a burn's move card) already says the change, the note's create is cancelled instead (`actorBridge.withoutSystemNotes`). Every other module write keeps its note — a move's own momentum, a session focus — because no card of the module's says it. The Resist button the issue's first draft asked for was withdrawn there: the optional resist above 0 stays a typed move (#330 D3).
- **The narrator may open a plan for an enemy it introduces (P2-29).** A sidecar key, `newThreats`, as `openQuestions` is for a posed question: the module rolls Character Role, Goal and Disposition once and files the plan undecided; the next narration decides it. The narrator names it — the module does not guess enemies from prose. At most two a narration; never for a subject already planned under any name, or a player character.
- **Which names are one enemy is the narrator's to say when the names share nothing (P2-30).** Code matches names that share a word (`nameMatch.sameSubject`); for the rest, a narration deciding a being is shown the beings already planned and may answer `sameAs`. The existing plan wins: it keeps its truth and takes the other name as an alias; the waiting plan is retired, not deleted, and both writes carry the narration so the X-Card undoes them. `sameAs` is honoured only for a plan not yet decided — two decided plans hold two truths, and choosing between them is a GM's (Retire).
- **A player's oracle question gets its odds from the GM, not its roll (P2-31).** The roll, the card and the dice stay on the player's client; only the odds are asked for, over the module socket, and only the odds word comes back — the plan, its truth and its id never leave the GM's client. This is the first request/answer exchange on the module socket (gmRelay actions return nothing to the requester); it lives in `oracleConsult.js`, not in the relay table. Rejected: moving the whole roll to the GM (the card would be the GM's, and every yes/no would wait on the GM even with no plan to consult). Fail-open after eight seconds.
- **Every Claude call says what made it (P2-24).** `apiPost` takes a `label`, and each caller passes one; the API Log prints it. The Narrator Usage page splits a reply's output between prose and the fact block by character share — an estimate, not a token count.

**Reason:** the alpha 23 playtest part 2 (v1.8.1, one user running two characters): six of eight lines of dialogue went to the roll dialog; seven of eleven narrations ended on a prompt to a named character; "I cannot" was ignored for six minutes; a burned miss kept the ship damage its price dealt.

**Rejected:** *"when the classifier and the interpreter disagree, don't roll"* — it would have blocked the correct expedition reroute and switched Mischief off. *A classifier confidence threshold* (P2-03) — see above. *Gating the spotlight on connected players* — optional in the issue; the setting is off by default and says what it counts.

---

## The narrative skeleton, Phase 4: NPC agendas, vows and discoveries planned; the GM's "has a plan" markers (2026-11)

**Decision:** (issue #353 Phase 4, "When a skeleton is made" and "What the
GM sees".)
- **A connection made gets an agenda plan** — Make a Connection's
  auto-create, a named NPC the GM confirmed from the draft card, the inciting
  vow's target (`planNpcAgenda`): an `npcAgenda` plan about the NPC's card
  by its id, its rolls their goal and role (the seed's), a Character
  Disposition and an Action + Theme for what they hide. Its truth is left to
  the next narration they are in (DECIDE NOW), not decided at creation — the
  capture that made them has no narration left to write it. One plan an NPC
  (by card id, or by name); the canonical GM's; stamped with the capture's
  narration, so the X-Card that takes the card away takes the plan too.
- **A vow sworn is asked what is really behind it** (`vowPlanRequest`: an
  Action + Theme): its swearing scene decides the `vow` plan, about the vow
  by its stable `vowId`. No scene (switched off, no key, a failure): the
  request is filed with its roll alone (`fileRequestedPlan`) for a later
  narration to decide. A vow's plan is in play while its vow is **the one
  this scene serves** (R3's ladder, `openThreads.readSceneVow`: an open
  track's linked vow, the session's quest focus, or the only vow in play —
  matched by the vow's id across its copies, or its name), when the fiction
  names it, and in the narration of the **Fulfill Your Vow** that scores it
  (its `vowId` among the tracks the beat ends — `endingTrackIds`, as Finish
  an Expedition's track) — never every open vow every beat (with three vows
  open they would crowd out the scene's plans).
- **Make a Discovery and Confront Chaos keep what their find means**: their
  oracle rolls (less any price) ask the narration for a `discovery` plan,
  decided with the beat that shows the find.
- **"Has a plan" markers** (decided: plans hidden from players; the GM sees
  they exist): an NPC card's row in the Entities panel, an expedition's row
  in the Progress Tracks panel and a threat's row in the World Journal panel
  show a small ◆ on a GM's client only — no content (`plannedSubjects`:
  ids and names, never truths). A player's client never builds them.
- **A subject's name with filler inside** ("Free the Kessan miners") is
  found in its own words — the matcher dropped filler from the name but not
  from the passage, so such a name never matched its own text.

**Reason:** the issue's triggers name a connection made, a vow sworn and a
discovery made; without a plan, an NPC's motive, a vow's real stakes and a
find's meaning are improvised fresh each beat — the drift this issue exists
to stop.

**Rejected:** *deciding an NPC's agenda at creation with a Claude call of
its own* — the decided design is the narrator's sidecar first, a planning
call only if that proves too thin. *Every open vow's plan in every beat* —
the token cap would drop the scene's own plans. *Markers that show the
plan's kind or a hint* — any content on a shared screen leaks it.

---

## The narrative skeleton, Phase 3: plans paced by clocks, countdowns made real, expeditions planned (2026-11)

**Decision:** (issue #353 Phase 3, "Tie-ins to existing mechanics".)
- **Threat ↔ clock.** A decided threat plan with an escalation step gets a
  clock it owns (`planId` on the clock, `clockId` on the plan): a threat the
  fiction revealed is the scene's — a 4-segment **tension** clock, turned by
  each Pay the Price; a significant World Journal threat is the campaign's —
  a 6-segment **campaign** clock, rolled at Begin a Session. At most
  `MAX_PLAN_CLOCKS` (4) plan clocks run at once (every tension clock turns
  on each price). When the clock fills, its trigger vignette plays the plan's
  next step — **marked played by code** (the vignette's `reveals`, added
  whatever its sidecar says), not left to the model — and the clock goes back
  to empty for the step after, or retires when none is left. A countdown's
  mystery with no step left plays its answer coming out.
- **A countdown the prose starts is a real clock** (the sidecar's
  `countdown` — the trigger table's "a countdown introduced in the
  fiction"): tied to the plan its `about` names (by id, or its subject's
  name), else a new mystery — "What happens when <it> runs out?", its answer
  rolled and decided by the next narration. One clock a plan; a countdown of
  a running clock's name is not made again.
- **The standoff ↔ scene challenge.** A countdown made in a scene with no
  scene challenge open offers the GMs one (`sceneChallengeOffer.js`): a
  whispered card whose **Begin the scene challenge** makes the track with
  the countdown's clock as its tension clock (`addProgressTrack`'s
  `tensionClockId` — no second clock). A GM's press, claimed once on the
  card, run on the canonical GM (gmRelay `sceneChallenge.begin`). Scenes stay
  manual (R2, decided): the module offers the challenge, never ends a scene.
- **A narration's clocks and plans leave with it.** A clock a narration
  started carries its `narrationId`: the X-Card's pause write drops it, and a
  narration a **Burn Momentum or Improve Result supersedes** takes back its
  plan writes and its clocks too (`retractSupersededNarrations` →
  `undoNarrationEntries(ids, { categories: ["secrets"] })` and
  `removeClocksMadeBy`) — the price that revealed a new enemy, or the trigger
  a rewind undid, did not happen. (Before this, a burned narration's plan
  stayed in play.)
- **Expedition ↔ progress track.** An expedition an Undertake an Expedition
  begins asks its narration to plan it (`expeditionPlanRequest`: two Space
  Sightings of the region for waypoint ideas, an Action + Theme for the
  end), about the track by id: its truth is what waits at the end, its clues
  the waypoints in order, its escalation the danger along the way. It is in
  play while the track is open, and in the narration of the Finish an
  Expedition that completes it (`endingTrackIds`), told to reveal the end.
- **A chosen complication** plays the in-scene plan's next escalation step —
  a waypoint's peril the open expedition's — so it has something concrete to
  be; marked played with the complication's beat.
- **Ask the Oracle consults the plan** (decided, every Mischief setting): a
  yes/no whose question names a decided plan's subject is rolled at odds one
  Haiku call sets from the plan's truth (`oracleConsult.js`), so the answer
  cannot contradict it. Only a GM's roll: `!oracle yes` is rolled on the
  typing client, and the plans are the GM's (known-issues
  ORACLE-CONSULT-PLAYER-ROLL). Fail-open: the player's odds stand.
  *Amended by issue #354 P2-31:* a player's roll asks the canonical GM for
  the odds; see that entry.

**Reason:** the playtest's count and pulse ran ten beats with no clock
behind them, and its hour-long standoff never became the structure
Starforged has for it. A plan that escalates only when the narrator
remembers to does not escalate.

**Rejected:** *every tension clock for every plan* — each price turns them
all; capped, and a campaign-level threat paces on the campaign clock.
*Leaving a played step to the model's sidecar* — a vignette written to play
the step is the step. *Moving every player's yes/no to the GM* — a routing
change beyond this issue; recorded as the residual.

---

## The narrative skeleton, Phase 2: reveals follow move outcomes; a revealed truth is a stated fact; significant threats are planned (2026-11)

**Decision:** (issue #353 Phase 2.)
- **The sidecar's `reveals`** records what a beat showed of a plan, by the
  ids UNREVEALED lists (`[c1]` a clue, `[e1]` an escalation step): clues
  shown, the truth revealed (`"truth"`), the step it played, and
  `resolved` when the subject's story ends. Only what the beat actually
  showed — a beat that does not touch a subject leaves it alone. Applied on
  the canonical GM, stamped with the narration's id; the X-Card restores the
  plan to its version before (`undoNarrationEntries`).
- **A revealed truth becomes a stated fact**: a truth of the narration's own
  in the scene ledger (`revealedTruthsOf`, added to its `newTruths` before
  `applySidecar`) and confirmed lore, both stamped with its id, so the X-Card
  retracts them with the reveal. The oracle rolls behind it are then shown to
  the table (decided: hidden until revealed) — a card the X-Card leaves
  (known-issues SECRET-ROLLS-CARD-XCARD).
- **A resolved plan leaves play** (`status: "resolved"`): it is no longer
  shown to the narrator, and stays in the journal.
- **A threat recorded at significant salience or above gets a plan**
  (`planSignificantThreat`, from the detection pass's
  `routeWorldJournalResults`): its subject is the threat page, by id; its
  agenda is rolled on Action + Theme and its truth decided by the next
  narration it is in play for. Rated explicitly — the capture gate lets an
  unrated threat through, the plan does not. A plan already filed under its
  name (a new enemy the narration named) is linked to the page instead of a
  second one.
- **An immediate threat's plan is in play every beat** (relevance, by the
  World Journal threat's name); any other plan only when its subject is.
- **The planning call is still not built** (decided: only if the sidecar
  proves too thin; nothing has shown that yet).

**Reason:** issue #353's "Reveals follow move outcomes" and "Reveal
tracking": a plan that is never marked revealed is replayed as a fresh
mystery, and a reveal that is not a stated fact can be contradicted the next
beat.

**Rejected:** *reveal one clue per beat* — the issue's own revision: a reveal
on every beat would spend the plan in a few turns; reveals follow the
outcomes of moves that touch the subject. *A rolls card the X-Card deletes*
— a new X-Card path for a card that names no removed content.

---

## The narrative skeleton: hidden plans in a GM-only Secrets journal, decided by the narrator, played toward (2026-11)

**Decision:** (issue #353 Phase 1; every question in the issue was settled by
the maintainer on 2026-11-13.) When the fiction introduces something that
carries a mystery, a threat or an arc, what is true about it is decided at
that moment, kept where players don't see it, and handed to the narrator as
unrevealed:
- **The store** is the World Journal — Secrets journal: one page per plan,
  its record in the page's `secretEntry` flag (`src/world/skeletons.js` the
  shape, `src/world/secrets.js` the store). The journal is made with **no
  player permission** (`worldJournal.js` `GM_ONLY_CATEGORIES`). A plan links
  to its subject **by id** where it has one (a scene, an entity, a track, a
  vow), its name being the fiction's.
- **Writes from narration run on the canonical GM** (`applyPlanSideData`,
  called from the sidecar apply — a relayed sidecar's too, with the plan
  requests it was given) and are **stamped with the narration's id**, so the
  X-Card takes a plan back with the narration that made it, and restores the
  version before a narration that changed it (`undoNarrationEntries` covers
  the Secrets journal). The GM's Secrets panel writes on any GM, and the GM
  then owns the plan.
- **Who decides a plan: the narrator, in its own sidecar** (decided). The
  sidecar gains `plans` (a decision, by the id it was shown) and
  `openQuestions` (a question the prose poses that the characters are meant
  to answer). A narration is asked to decide (UNREVEALED → DECIDE NOW) the
  plans its seeds introduced — a price that revealed a new enemy, by ref, with
  its Character Role / Goal / Disposition — and any plan whose rolls are in
  but whose truth is not. If it decides none, the plan is filed with its rolls
  alone and the next narration where it is in play is asked ("keep the raw
  rolls as the skeleton"). **The planning call is not built**: it is built
  only if the sidecar proves too thin (decided).
- **A posed question is a mystery**: its hidden answer is rolled once (Action
  + Theme and Descriptor + Focus) and decided by the next narration it is in
  play for. The same question posed again in the scene is the same mystery.
- **The narrator sees** [6.6] UNREVEALED: the active plans whose subject is
  in play (made in this scene; its entity matched or in the frame's cast; its
  name in the frame or the player's line — at most four, capped at
  `UNREVEALED_MAX_TOKENS`), with the rule: never state one outright; reveals
  follow move outcomes (a hit shows a clue or moves it toward an ending, a
  weak hit a clue with a complication, a miss its next escalation step); a
  beat that does not touch a subject leaves it alone; a refusal made twice is
  answered on the third beat by a reveal, a trade or an escalation.
- **How binding a plan is: guidance** (decided). A narrated fact wins: the
  narrator records the change in `plans`, and the plan is updated to match. A
  plan is never the source of a contradiction card.
- **Which plans are made: automatically, when a trigger fires** (decided).
  Phase 1's triggers are a new enemy and a posed question. There is no "Plan
  this" button, command, or Regenerate (deferred); a plan can be edited by
  hand in the Secrets panel.
- **Plan visibility** (decided): the World Journal panel's Secrets section
  lists each plan collapsed until clicked — in solo play the GM is the only
  player — with Open, Edit, Reveal now and Retire.
- **Hidden oracle rolls** (decided): GM-only until the plan's truth is
  revealed, then shown ("the oracle said: …" on the GM's Reveal now card). The
  world setting **Show hidden oracle rolls** (`narrativeSkeletonsShowRolls`,
  default off) posts them when a plan is made. No hidden roll is on a
  player-visible card or a card's flags otherwise
  (`tests/unit/secretsStayHidden.test.js`).
- **The Private Channel reads plans** (decided), under the same
  never-state-outright rule and with no instruction to write (it emits no
  sidecar).
- **The world setting Narrative skeletons** (`narrativeSkeletons`, default
  on): off, nothing is planned and no plan is shown to any narrator.

**Supersedes CONN-BACKGROUND-UNWRITTEN for secrets.** That entry retired a
connection's `secrets` field because nothing wrote or read it. What an NPC
hides now has a writer and a reader — a plan in the Secrets journal, linked to
the NPC by id (its agenda plans arrive with Phase 4) — not a field on the
connection record, which stays retired.

**Reason:** the alpha 23 playtest's hour of circular dialogue — a new enemy
with no nature or goal, an escort asking an unanswerable question three
times, a count with no clock behind it. Every beat re-improvised its mysteries
because nothing held what was true but not yet revealed; the stores that
existed (the ledger, the summary, lore) hold only what was stated.

**Rejected:** *campaignState as the store* — it is sent whole to every
client and written by many writers; a GM-only journal keeps plans out of
players' journal directory and off the write chain. *A planning call first*
— the maintainer chose the narrator's own sidecar; one call both narrates and
plans, and the call is built only if that proves too thin. *Asking the
narrator to plan anything it likes* — plans are made when a trigger fires.

---

## Oracles behind the scenes: the "envision" outcomes roll their table once (2026-11)

**Decision:** (issue #353 Phase 0, "Where to roll".) Where a move's outcome
says to envision something, the resolver rolls the matching table once and
the narration is given the result as an oracle seed, as the eight seeded moves
already were:
- **Gather Information**: a hit → Story Clue (what you learn); a weak hit also
  → Story Complication (how it complicates the quest); a miss → Story
  Complication (the unwelcome truth). The miss's Pay the Price stays the
  pipeline's card.
- **Compel**, weak hit → Action + Theme (their counteroffer).
- **Undertake an Expedition**, hit → the active sector's region's Space
  Sighting (the waypoint reached); Terminus with no active sector.
- **A Pay the Price that reveals a new enemy** (the 45–50 row, or a leaf of a
  "Roll twice") → Character Role + Goal + Disposition, wherever the price is
  narrated: the move's own price seed (`withPayThePriceSeed`, so the
  pipeline's routed price and Sojourn's choice price both), the advisory price
  of a miss that routes none, the Pay the Price move, and a `!ptp` / `!oracle
  pay_the_price` follow-up — rolled there, on the narrating client, and never
  put on the raw card the table reads.
- **A chosen complication is played as its own beat.** A weak hit's
  complication option ("Peril at the waypoint", "Complication at
  destination", Forsake Your Vow's "Narrative cost") posts its card as the
  module's own oracle card (`oracleCommandCard`, `oracleNarration` kind
  `complication`) and asks for the oracle follow-up, which the keyed canonical
  GM narrates once and the X-Card can take back (its card names the raw card,
  `oracleCardId`). A waypoint's peril is rolled on Spaceborne Peril first; its
  roll is on the card and in RECENT ORACLE RESULTS. The other scopes roll
  nothing.

No other outcome rolls one: a beat that is not one of these plays what the
story holds.

**Reason:** in the alpha 23 playtest's corridor scene the narrator filled
every "envision" from its own defaults, so the same images recurred for an
hour, "A new enemy is revealed" became a voice with no nature or goal, and a
chosen "Peril at the waypoint" never arrived — its card only promised that the
narrator would "surface" it, and nothing read it (produced-but-dead,
rules/reachability.md §1). Starforged's own answer to "what does this mean?"
is to ask an oracle.

**Rejected:** *a roll on every beat* — unrelated random results each turn
make the story less coherent, not more; *a pending complication on
campaignState for the next narration* — a new store and its X-Card undo, where
the follow-up beat already delivers at once and is X-Card aware; *rolling the
enemy's tables on the `!ptp` card* — the card is the table's to read, and the
rolls create the enemy's hidden truth (Phase 1).

---

## The narrative skeleton: one re-roll when a roll contradicts the story (2026-11)

**Decision:** (issue #353 "Rules for these rolls": "one re-roll when the
interpretation step says a result contradicts established facts".) The
narrator is the interpretation step (decided: its own sidecar first, no
planning call), so the re-roll is rolled in code ahead of it: every plan
awaiting its decision carries one — a request gets it when its narration's
extras are built (`narrator.js` → `secrets.rollReroll`), a plan filed with
rolls and no truth gets it when it is filed (`createSkeleton`). DECIDE NOW
shows it beside the plan's rolls with the rule; a deciding plan that uses it
names the result it replaced (`"rerolled"`), and `applyPlanToSkeleton` keeps
"Re-rolled in place of …" with the plan's rolls and spends it. One at most:
an unused re-roll is dropped once the plan is decided, and a correction to a
decided plan re-rolls nothing. Like every hidden roll, it is shown with the
plan's rolls when its truth comes out.

**Reason:** a stored truth is binding; a roll that contradicts what the
table has already seen must not be forced into it, and one fresh roll —
not an unlimited reroll until it fits — keeps the oracle honest.

**Rejected:** *a second model call to re-interpret* — the sidecar-first
decision. *Re-rolling the same table* — a request's seeds are lines of
several tables; an Action + Theme is Starforged's general "what does it
mean?" oracle and fits any subject.

---

## Issue #353 R2: each scene has a question; scenes stay manual (2026-11)

**Decision:** (issue #353 R2; decided, maintainer 2026-11-13: scenes stay
manual — a scene ends only at `!scene end` or with the session; the module
does not end one and does not offer to; a narrator-proposed end is deferred.)
- **The scene frame carries the scene's question** — what is being decided
  here, in a few words (`sceneFrame.question`). The narrator sets it on the
  scene's first beat; the module keeps it (`ledgers.applySceneFrame`): a later
  snapshot cannot reword it, so a beat cannot quietly move the scene's goal.
- **An answer cuts forward.** The beat that answers it marks it
  (`questionAnswered`) and is told to end on a cut forward — to the
  consequence, the next place or a later hour — not another exchange in the
  same room. The next beat sets the question the scene turns on now; until
  then SCENE FRAME shows the answered one, marked.
- **It lives and dies with the frame**: rendered in SCENE FRAME, restored by
  the X-Card through the frame's superseded chain, cleared at scene end.
  The sidecar is told plainly never to end the scene.

**Reason:** the playtest's hour was one scene circling one exchange; the
frame recorded where and who, not what the scene was for, so the narrator
never knew when to stop.

**Rejected:** *ending or offering to end the scene on an answer* — decided
against (deferred, revisit once the question has been played with). *A
question the narrator may reword every beat* — it would drift with the
conversation it is meant to bound.

---

## Issue #353 R1: the stakes are stated before the roll, and a miss pays them (2026-11)

**Decision:** (issue #353 R1; decided, maintainer 2026-11-13: the outcome
stated before the roll is a miss's default price, the Pay the Price table
the alternative.)
- **The interpreter states the stakes** (`moves/stakes.js`): for a move that
  rolls a stat, one line for what a hit gets and one for what a miss costs —
  its most obvious negative outcome (Pay the Price's first choice), drawn
  from the RECENT SCENE and the player's line — and, beside a miss, at most
  one suffer move it costs (`missSuffer`, 1–3): the routes Pay the Price's
  table annotates (Endure Harm, Endure Stress, Sacrifice Resources, Withstand
  Damage, Companion Takes a Hit — Endure Harm with no companion) and Lose
  Momentum (the move for "delayed or put at a disadvantage", which the table
  leaves narrative). A progress move, or a move with no roll, has none.
  Whether a miss pays the stated miss (`priceStated`) is fixed when the
  interpretation is read, so the dialog shows what the roll then pays.
- **Shown before the roll**: the Confirm Move dialog and a Batch Mode round
  reading show "On a hit" and — only when it is the price — "On a miss" with
  its cost. Wrong stakes are fixed the existing way: Cancel and re-word.
- **A miss pays them**: a routed miss (`routePayThePrice`) posts its Pay the
  Price card with the stated miss and rolls nothing ("As stated before the
  roll"); its suffer move runs through the same dispatcher and executors as a
  rolled route, so its receipts are the ones a burn or an improvement undoes,
  and the Pay the Price clock advance is unchanged. An unrouted miss whose
  text says to pay the price is seeded with the stated miss instead of an
  advisory table roll. The table is rolled only when no miss was stated, or
  with the world setting **Miss Pays the Stated Stakes**
  (`missPaysStatedStakes`, default on) off.
- **The narrator delivers them**: a STAKES block after MOVE OUTCOME (a round
  entry's too) names what was shown and which line the outcome delivers; a
  burn's or an improvement's re-narration carries the stakes and delivers the
  upgraded outcome's line.
- **Never from a hidden plan.** The issue proposed a miss's stake be the
  subject's next escalation step. The stakes are shown on the roller's screen
  before the roll — a player's, or a solo GM's who should not see the plan —
  so they are drawn from the scene only; the narrator still plays a planned
  subject's next escalation step on a miss, under UNREVEALED.

**Reason:** in the alpha 23 playtest a scan's miss came back "You are delayed
or put at a disadvantage", unrelated to the scan, with nothing behind it. A
player who knows what a roll is for has a reason to make it, and the
consequence follows from the action.

**Rejected:** *the plan's escalation step as the miss stake* — it shows the
plan before the roll (above). *A per-roll "roll the table instead" box* — the
issue names two alternatives, no stated miss and the world setting.
*Editable stakes in the dialog* — Cancel and re-word already re-reads the
line. *Withstand Damage and Companion Takes a Hit excluded* — they are table
routes, and a burn treats them exactly as it treats the table's.

---

## Issue #353 R3 and R4: the vow is the spine; what is open is shown (2026-11)

**Decision:** (issue #353 "Related changes" R3 and R4. R4's home — the
Session panel — and the definitions of its two skeleton rows were decided by
the maintainer.)
- **A quest is in play** when some character holds an open vow besides a
  background vow. A character's background vow, for this question, is their
  first vow on the sheet that is not the shared inciting vow (the
  foundry-ironsworn convention `readVows`' fallback follows); the shared
  inciting vow is always a quest — `readVows` now reports `shared`
  (`session/openThreads.js` `questVows`). The narrator's "Background vow"
  label (`isBackground`, the shared vow first — "Collaborative character
  creation" above) is unchanged.
- **Begin a Session says when none is** — on its dialog and its card — and
  offers Swear an Iron Vow for the user's own character
  (`resolveUserActorId`): a vow and a rank, optional. It is written on that
  character's sheet once the session's start is requested
  (`actorBridge.createCharacterVowItem`); the canonical GM's createItem hook
  then posts its "🆕 New vow recorded" card — ⚔ Swear it (roll), the reward
  offer, the connection link — the path a vow written on the sheet already
  takes. The Begin card does not claim the vow; a refused write is said to the
  user.
- **The vow a scene serves heads the per-beat context** — [2.6] THE VOW THIS
  SCENE SERVES, in the beat modes (move, paced, round, @scene, oracle
  follow-up) — chosen by a bounded ladder: an open track's linked vow (a
  fight, then a scene challenge, then an expedition; the newest of a kind),
  else the session's quest focus when it names one open vow, else the only
  quest in play, else the only open vow; nothing is guessed past that. It
  names the vow, its rank, progress and holders and why it is the scene's,
  with one instruction: when a beat achieves something toward it, show that
  in the fiction, and never name its track, its progress or a milestone —
  marking it is the player's (the move card's ⚑ Mark Progress on Vow).
- **An expedition or a scene challenge serves a vow** when the Progress Tracks
  panel links it: the add form's vow select (any track it creates — a fight
  added by hand too, which then pays off as a threshold fight does) and an
  open expedition's or scene challenge's row (🔗 — an expedition the move
  pipeline began has no creation card to link it on). **The link's canonical
  half is the vow's id across its copies** (`linkedVowId`: its `vowId`, else
  its Item id — a renamed vow keeps its link); `linkedVowName` is the name it
  was linked under, which [4j] and a fight's threshold link (a name only)
  carry. The canonical GM checks the vow is open as the sheets stand
  (`resolveVowChoice`), and the presser's client checks first, since a
  relayed refusal reaches no player. A fight's link stays its threshold
  card's or the add form's and is not changed mid-fight; finishing a linked
  expedition or scene challenge marks nothing by itself.
- **What's open lives in the Session panel** (decided): the open vows and
  their progress, the open tracks with the vow each serves, the running
  clocks (active and not full; a scene challenge's own clock on its row), and
  from the narrative skeleton — `listSkeletons()`, only while
  `skeletonsEnabled()` — the **unanswered questions** (active `mystery` plans
  whose `truthRevealed` is false: their `question` only) and the **standing
  demands** (active `threat` / `npcAgenda` plans whose `truthRevealed` is
  true: the subject's name and its `wants`). No other plan field is read —
  never `truth`, `knows`, `clues`, `escalation`, `resolutions` or
  `oracleSeeds` — and a player's list is the GM's (the store is read alike on
  every client). It is not a chat card and makes no model call; it re-renders
  when a vow, the tracks journal or a plan's page changes.
- **End a Session offers one-click focus choices**: the open vows (one per
  vow) for the quest focus and the characters' connections (a severed one
  left out) for the connection focus, beside the free text, which stays
  editable. The quest focus chosen there is the next session's
  `sessionFocus.quest` — the scene's vow, rung 2.

**Reason:** issue #353 R3 and R4. In the alpha 23 playtest no hit card offered
Reach a Milestone because no vow was open, and nothing said so; the narrator
was told the vows in three places but asked to play toward none; an
expedition could not say which vow it served; and End a Session's two blank
boxes were left empty, the +1 momentum with them. What was still open was
spread over the sheet, two panels and the World Journal.

**Rejected:**
- *`isBackground` as the background vow for the check* — it is the shared
  inciting vow, so a table pursuing its inciting vow alone would be told no
  vow is in play.
- *Swearing from Begin a Session through a forced swear move* — the vow must
  be on the sheet first, and its "🆕 New vow recorded" card already offers the
  roll, claimed once; a second path would roll it twice.
- *A vow link on the expedition's progress card* — a new card button and relay
  in the move pipeline; the panel's `progressTrack.edit` relay already checks
  every panel edit, and a row serves both creation paths.
- *Linking a new expedition to the roller's only vow by itself* — #241
  rejected auto-detecting which vow a fight serves; the link stays the
  player's choice.
- *Showing a revealed plan's truth in What's open* — the maintainer's
  definition shows a revealed plan's subject and wants; the truth is lore once
  revealed, in the World Journal.

---

## The v1.8.1 open-item sweep: issue #348 and the earlier audits' open items (2026-11)

**Decision:** (the maintainer's request, 2026-11-12: close out issue #348 and every item the earlier audits left open.) The maintainer chose: Perspective "Auto" is decided once per session (#348 PT03); a Set a Course to an uncharted place is read as Undertake an Expedition on every Mischief setting, saying why (#348 PT06); an unnamed destination is recorded as a location with a working label (#348 PT07); each open item's written proposal is applied, including the "maintainer's call" ones; and by-design / cosmetic / not-reproduced items are re-checked, fixed when real and cheap, else closed with the reason. What each fix established (known-issues.md, "The v1.8.1 open-item sweep", has every row):
- **PT01** (narrator): Correction to paced narration, not a reversal (issue #348 PT01): a paced turn may advance time and make small developments the player's line implies. It still never decides what a move would decide (no risky action succeeds or fails, no fight is won, no danger is escaped). "Depict, do not offer" and the optional closing italic move-hint are unchanged.
- **PT02** (narrator): Beat-ending rule (issue #348 PT02): the move_resolution, paced_narrative and round_resolution modes end each beat on something unresolved inside the story and change something every beat. A recurring motif must change or be dropped. This sits alongside "depict, do not offer": the hook is something that happens in the story, never a menu.
- **PT03** (narrator): Perspective "Auto" is decided once per session, at Begin a Session, from the connected non-GM users at that moment. It is stored as campaignState.sessionPerspective and kept until the next session is minted (issue #348 PT03). It amends "Narrator tone and perspective", which said Auto is resolved at narration time. A narration speaking for two or more PCs is still third person (issue #342 Z40). A session that was never begun counts users per call.
- **TRUTHS-CUSTOM-PARSE** (narrator): World Truths dialog saves are parsed using the dialog's known shape (vendor truth-category.vue appends each category's inspiration text). The inspiration text is recognised by its opening (TRUTH_TABLES[id].inspiration), never by position, so a GM's own last paragraph is kept. A save holding every category is keyed by position (TRUTH_CATEGORIES order, which is Datasworn's) when its headings are not English.
- **PT05** (travel): Issue #348 PT05: the classifier is told the charted places and treats travel toward anywhere else (uncharted, unknown, unnamed) as at least NARRATIVE_WITH_MOVE_AVAILABLE with undertake_an_expedition, hazard or not. A time skip across a journey not yet made is travel, never downtime. This is enforced in the prompt only, with no deterministic router floor; the pipeline-side reroute (PT06) holds the line for the move itself.
- **PT06** (travel): Issue #348 PT06 (maintainer decision, applied): a Set a Course whose destination is not a charted, known place is read as Undertake an Expedition on EVERY Mischief setting, Lawful included. Known means a tracked settlement, planet or location by the arrival's name resolver; charted means not an unexplored site. The confirm dialog and the move card say why, and Cancel lets the player re-word. A course named by its pin's Actor (a token drag), or one naming no destination at all, stays Set a Course.
- **PT07** (travel): Issue #348 PT07 (maintainer decision, applied): a destination the story refers to without a name is recorded in the existing location and site stores, never a parallel store. That means a location Actor plus a sector discovery record (type 'uncharted', workingLabel: true) plus its map pin, under the working label. It is recorded when an Undertake an Expedition begins a track toward it (the label names no site and no tracked place), and it is charted, named and docked at through the normal reveal flow. With no active sector nothing is recorded.
- **OLD-SCENE-TOKEN-DOCKED** (travel): OLD-SCENE-TOKEN-DOCKED: a `scene_token` position record that carries both a settlement id and non-empty free text is treated as a pre-U53 token placement and read as "near". Arrivals (inferShipPositionFromEntityId / inferShipPosition) never write a settlement's free text. This is a read-time rule; no migration rewrites old records.
- **SECTOR-CREATE-PARTIAL** (travel): SECTOR-CREATE-PARTIAL: a sector creation that throws (a refused campaignState write included) deletes what that run made — its Actors (and their unmarked bond Items), Sector Record and Scene — so the world is as it was before the run. Adoption of unlisted Actors still covers a run cut short by a closed page.
- **PT12** (audio-art): Narrator audio is still made only when Play is pressed: there is no pre-synthesis. Play prepares the first segment, then the rest one at a time while it plays. The audio GM plays a clip's bytes while its cache upload continues behind it.
- **PT14** (audio-art): When the module itself changes a character, the ironsworn system's chat change note for that change is shown as a note, not as the character speaking: it has no actor speaker and the character's name leads the line. A player's own sheet edits keep their speaker. A player's line that the module posts again keeps the speaker it was typed under.
- **AUDIO-KEYED-NONCANONICAL-DUP** (audio-art): Narrator audio follows "calls run where a key lives, exactly once" for the ElevenLabs key. While a GM with a key is connected, the audio GM makes every client's missing clip once and caches it. A keyed player's own key is used only when no keyed GM is connected, or when the GM gives no clip. This narrows W79/D10 (keyed players paying for their own clips) to tables with no keyed GM.
- **AUDIO-FORGE-ORIGIN-SHARED** (audio-art): Correction to "A clip URL's layout is not guessed": the Assets Library branch, and so this residual, now applies only in a world running on The Forge (AUDIO-FORGE-ANY-WORLD).
- **AUDIO-FORGE-ANY-WORLD** (audio-art): The Forge is detected by ForgeVTT.usingTheForge, or by a page served from a forge-vtt.com host. isCachePathFor's Assets Library branch applies only there.
- **PORTRAIT-TWO-GM-FIRST-GENERATION** (audio-art): A first portrait is claimed on the entity's record (portraitClaim) before its image is bought. The claim stands while its GM is in the game and for at most five minutes, which covers the bounded image request and download.
- **AUTOSEED-KEYLESS-CANONICAL** (audio-art): Automatic portraits (Auto-Seed, and a new entity's enrichment) are made where an OpenRouter key lives. Each GM advertises the key in artKeyedGmUserIds (user ids only), and a keyless canonical GM asks the lowest-id keyed GM (isArtGM), as issue #342 Z67 does for the ElevenLabs key.
- **FINALISE-PLAYER-KEY** (audio-art): FINALISE-PLAYER-KEY: Finalise and Regenerate flavour are GM-only buttons, following the portrait buttons' U33 precedent, rather than being routed to the keyed GM. Envision and History stay as they are.
- **XCARD-ORACLE-FOLLOWUP-UNWRITTEN** (xcard): An X-Card played while an oracle follow-up is being written also drops that oracle card's result from RECENT ORACLE RESULTS (the follow-up's card would have named it). A raw oracle answer with no follow-up at all stands: it is the roll, not narration.
- **SESSION-LOG-STORY-NOT-REBUILT** (xcard): SESSION-LOG-STORY-NOT-REBUILT: the maintainer's proposal is applied — the next mint's summary catch-up rebuilds the Session Log story an X-Card emptied (rather than accepting a page without its story).
- **XCARD-POST-RACE** (xcard): A narration card posted while the X-Card is active is removed as the X-Card removes one (every narrator path stands down while it is active, so such a card is one generated just before the play — the #300 F13 rule extended to the card's own post round trip).
- **STRIKE-CHRONICLE** (xcard): A strike deletes the session's automatic Chronicle entries that state the struck fact (lore's word-overlap match on subject and fact); pinned or player-edited entries stay, matching the tier-detail rule. Like tier details, a later !truth set lift does not restore them.
- **ACTIVE-SCENE-STRIKE-PLACE-BLIND** (ledger): AA28's place rule now covers the active scene too: a struck or replaced scene fact counts only at the place it was asserted at, for the re-assertion block, the `!truth set` lift and the CORRECTED lines. The X-Card's retractions still apply everywhere (ACTIVE-SCENE-STRIKE-PLACE-BLIND).
- **TIER-DETAIL-NEGATION-WORDS** (ledger): NPC detail duplicate check: one detail counts as a repeat of another only if the extra words in front are the entity's own name or role words, a pronoun or filler. Any other leading word keeps it as a new detail (keeping a duplicate is the safer mistake). The reversing-word list still covers words after the fact (TIER-DETAIL-NEGATION-WORDS).
- **SUMMARY-KEYLESS-GM** (ledger): Rolling summary at a table whose GMs hold no Claude key: the keyed client that wrote the narrator card generates it and relays it (`narrator.summary`) to the canonical GM. The GM stores it only if it is this session's, covers more cards than the stored one, and none of its narrations was X-Carded since. A keyed GM still generates its own (SUMMARY-KEYLESS-GM).
- **CLOCK-VIGNETTE-NO-DETECTION** (ledger): Clock vignettes run the detection pass as well as the tier pass (they use interaction latitude since V23). Session vignettes and vow scenes are unchanged: tier pass only (CLOCK-VIGNETTE-NO-DETECTION).
- **CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE** (ledger): AA34's capture gate (the capture runs on the GM whose client narrated, not on whoever is canonical when the reply lands) also covers @scene answers, oracle follow-ups and session, clock and vow vignettes (CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE).
- **CREATED-ONTO-DISMISSED-NAME** (ledger): Every record registration (registry.registerEntityId) takes the new record's name off the dismissed list, and the world load sweeps listed records the same way (CREATED-ONTO-DISMISSED-NAME).
- **CONN-BACKGROUND-UNWRITTEN** (ledger): A connection's `background` and `secrets` fields are retired (no writer, no reader). History lives in `history` and the NPC's narrator-added details, and GM-only notes go in the sheet's Notes (CONN-BACKGROUND-UNWRITTEN, issue #287). *Update (issue #353):* superseded for secrets by "The narrative skeleton" above — what an NPC hides lives in its plan in the GM-only Secrets journal, which has a writer and a reader; the record's `secrets` field stays retired.
- **DRAFT-CONFIRM-TWO-GMS** (ledger): Draft card Confirm and Dismiss run on the canonical GM through the GM relay (`draft.confirm` / `draft.dismiss`), one press at a time; only GM presses are accepted (DRAFT-CONFIRM-TWO-GMS).
- **STALE-PAGE-ACTOR-WRITES** (multigm): A stale page (its connection dropped and it has not reloaded) writes no actor either: actorBridge refuses every actor and item write there, the same way campaignState, rounds and Lines/Veils were already refused (issue #347 AB19-STALE-CACHE-WRITES).
- **STALE-PAGE-CLAUDE-COMMANDS** (multigm): hasKeyedActiveGM counts only GMs whose page can act. A keyed GM whose page stood down is not 'keyed' for routing until it reloads.
- **STALE-PLAYER-PAGE** (multigm): A player's page whose connection dropped is stale too. It is asked to reload, writes no actor, and any narration it starts on the player's own key (Private Channel, commands or follow-ups at a table with no keyed GM) is refused or discarded. Standing down from running the table (canonical GM, relays) still applies only to a GM's page.
- **BATCH-OFF-DIALOG-HANDOVER-WINDOW** (multigm): The toolbar's 'Discard the round' is decided by the canonical GM on its own round chain (batch.discardThenOff), not from the toggling GM's cached round.
- **ROUND-ONE-OFFER-SLOT** (multigm): A Batch Mode entry keeps card moves beyond its one offer slot in a `parked` list. They are handed back for the next round with the offer (takeCardMoves) and are never dropped.
- **SHEET-ROLL-KEYLESS-ROUND** (multigm): In Batch Mode, a sheet roll joins the round only while a keyed GM is connected. With none, it is narrated at once where a key lives.
- **HELD-MOVE-RETRIES-SPENT** (multigm): HELD-MOVE-RETRIES-SPENT accepted (maintainer's proposal): a held move whose claim the world keeps refusing is retried five times, then rolled on the next campaignState write that lands.
- **TRACK-SAVE-ANSWERED-LATE** (multigm): TRACK-SAVE-ANSWERED-LATE accepted (maintainer's proposal; AB05's bounded writes share the window).
- **LOCK-LOST-BY-COGM-STALE-WRITE** (multigm): A move-lock claim is live from its claim until its release is asked for. A store that comes back with the lock free while a claim is live lost it to a co-GM's stale write, and the claimant puts it back.
- **LOCK-RESURRECTED-DEPARTED-CLAIMANT** (multigm): The canonical GM frees, on any campaignState update, a move lock whose claimant is gone (not connected, or page stood down).
- **SESSION-MINT-RACE** (multigm): Begin a Session (and the Campaign Start's begin) waits for the world load's session mint on that client before reading campaignState.
- **FORGE-NAMED-BONDED-SCORED** (moves-a): A Forge a Bond that names a bonded connection, by picker id or by name, is not rolled. The not-rolled card and a round's refusal say it is already bonded.
- **LEGACY-SHEET-DECREASE** (moves-a): persistResolution's legacyTracks merge now applies the working copy's own recorded marks to the stored track. It no longer keeps the record further along (this supersedes the issue #316 T02 merge-by-progress rule; cleared cycles are still counted). Tracks the copy did not mark are taken from the store as they stand.
- **AID-ALLY-UPGRADE** (moves-a): Aid Your Ally's ally is carried on the move's targets on every outcome; each reader still checks the outcome's `beneficiary`. Upgrades split momentum by beneficiary.
- **TEST-RELATIONSHIP-DEVELOP-ROLL** (moves-a): A Test Your Relationship hit with a bonded connection makes a separate Develop Your Relationship roll +rank and pays that roll's outcome. The test's own roll is no longer used for the development.
- **BOND-COMMAND-FALLBACK** (moves-a): `!bond`'s typed name and a vow's linked connection use selectConnection's strict ladder. Neither falls back to the sole bonded or active connection.
- **FRAY-SOLE-FIGHT-FALLBACK** (moves-a): A named Undertake an Expedition matches an open expedition by name only; there is no fallback to the sole open expedition.
- **ENTER-FRAY-SOLE-FIGHT** (moves-a): Enter the Fray matches its foe against open fights by name only, with no sole-open-fight fallback. A loosely named foe therefore opens a second fight (maintainer's proposal applied).
- **DELAYED-CHOICE-IDENTITY** (moves-a): Delayed choice cards carry what their move was about. Enter the Fray's card names its threshold card by resolution id, and the threshold card records the fight it began (`frayTrackId`). Explore a Waypoint's card names its expedition (`expeditionTrackId`).
- **VOW-CLOCK-REWIND-PER-COPY** (moves-a): A burn's vow-clock rewind uses the same per-vow lockstep as the advance. A refused copy's Retry sets the value it is owed instead of rewinding again.
- **SUPPLY-TWO-PC-TIE** (moves-b): The crew's shared supply is recorded on campaignState (`crewSupply`) by each canonical-GM sync pass. It only breaks a tie between disagreeing sheets, and only while some sheet still holds it; a majority of sheets still decides. Chosen over "accept" (SUPPLY-TWO-PC-TIE).
- **COMPANION-TRIGGER-SWAP-UNCUED** (moves-b): A companion's general trigger ("make a move by sending/commanding <it>") applies to an action move whose line names that companion. When two of the character's assets offer the same asset-meter swap, the confirm form shows a radio per asset rather than rolling the healthiest.
- **STARSHIP-ASSET-CONDITIONS-UNSYNCED** (moves-b): Update to "Starship battered: the native sheet field is canonical": the STARSHIP asset's Battered/Cursed conditions are a second write-through mirror of the native impacts. The asset card's box is a second UI for the same fact, so the canonical GM writes it to the native impact (and from there to every mirror).
- **SOJOURN-PTP-ADVISORY** (moves-b): A miss whose Pay the Price is one of its choices (Sojourn) rolls its price once, at resolution. The narration is seeded with that roll, and picking the option pays that same price.
- **MOMENTUM-BASE-DRIFTED** (moves-b): Momentum bases lowered by the old write-back are repaired only by an explicit command (`!reset-momentum`), never automatically, because a lowered base cannot be told apart from one a GM set on purpose. The owner of a character or any GM may run it.
- **MOMENTUM-MIN-REDIRECT-MANUAL** (moves-b): Lose Momentum at its -6 minimum: the remainder goes to the "make a suffer move" picker (Lose Momentum excluded), which also offers clearing one rank's mark on any open journal progress track. Vows (actor items) are not offered as tracks to clear.
- **RIDERS-IGNORE-UNCHECKED** (moves-b): On the move confirmation, an ability's checkbox means "this ability applies this turn", including its effects on the outcome. Abilities that carry such effects are pre-checked. A "choose one (before rolling)" ability stays in play whatever its box (issue #345 AA12).
- **PTP-PCLESS-CLOCKS-ADVANCE** (moves-b): A Pay the Price nobody pays (a player with no character at a table of several) turns no countdown clock; it is not part of the story (extends issue #342 Z49's rule).
- **JOURNAL-MERGE-DIFFERING-ENTRY** (panels-docs): Split-journal merge card: Keep separate is a choice beside Merge. It retires the other copies without touching them. It stamps journalMerged { keptSeparate: true }; that is the same flag a merge sets, so every 'retired copy' check covers both. A journalMerged copy is never the live journal for any lookup. Entries both copies hold with different text are listed but not merged: the live journal's version wins, and the other version stays in the copy. An entry counts as differing only when its copy is newer than the live entry, or its age is unknown. The live journal took every write since the split, so an older copy is not a change.
- **POSITION-BADGE-GM-FIRST-PC** (panels-docs): The Progress Tracks panel shows one combat-position badge per character the viewer plays: every PC for a GM, their own for a player. Each badge names the character it cycles (data-actor-id), and the canonical GM keeps the ownership check. This applies the POSITION-BADGE-GM-FIRST-PC proposal and extends issue #345 AA64, which showed the viewer's own position on a single badge.
- **CHRONICLE-FIRST-PC** (panels-docs): Automatic Chronicle entries credit the narration's PC: the roller (move), the speaker (paced), or the round's acting character the scribe names. The campaign's first PC is only the fallback for a narration with no PC. This applies CLAUDE.md's 'credit the roller' rule to the Chronicle writer.

**Reason:** the items were open defects or residuals from audits #306–#347 and the alpha 23 playtest; each fix has a regression test that fails without it.

**Rejected / left open:** *FORCED-MOVE-HOLD-RELOAD* (persist every in-memory hold queue across a reload — a cross-area refactor), *CLARIFY-ON-GM* (ask the mover, not the GM — needs a GM-to-player prompt protocol) and *INDEX-EXTRACTION* (move the pipeline out of index.js — would conflict with every other change); each stays open in known-issues.md. *PT04*'s "nothing happened" checker is folded into issue #290.

---

## Issue #347 audit: no wait on a write of our own is unbounded, the election skips a loading GM, a press not rolled is handed back (2026-11)

**Decision:** (issue #347, the thirteenth audit's 24 findings AB01–AB24 —
serious bugs, stalls and locks — fixed at the maintainer's request in the
v1.8.1 cycle. What the fixes established, each row's ID in brackets. The
three decision rows, all option A, have their own entries: D1 "Who are you
interacting with? is asked before the roll" (after the move-lock record),
D2 beside #338 D8 in the issue #338 audit ("An X-Card on an upgraded beat
takes what the upgrade struck"), D3 "Batch Mode: a keyless GM's takeover
waits for a keyed GM to narrate the round". Most rows add an *Update* note to
the entry they change.)
- **No wait on a write of the module's own is unbounded** [AB05, AB02]: a
  document or setting write lost with its connection never settles, so every
  caller that awaits one — or a link of a chain that waits on the one before
  it — waits through `multiplayer/settleWithin.js` and goes on, warned: the
  move lock's claim and release (30 s), Begin / End a Session (five minutes),
  the rolling summary, a Private Channel page write; every FilePicker request
  through `withFilePickerDeadline` (120 s); U57's Progress Tracks queue (30 s,
  TRACK-QUEUE-UNBOUNDED-IN-LOCK) and this client's Safety-list edits (30 s,
  SAFETY-LIST-EDITS-ONE-ROUND-TRIP). The Chronicle queue stays as accepted.
- **The canonical GM is elected among GMs whose page is ready** [AB03]: a GM
  whose connect a client saw is passed over until it announces its page
  (`registerGmReadiness`); a GM connected before the client loaded is
  presumed ready. Recorded as an update on "Claude calls run where a key
  lives".
- **A client's own earlier page's lock is its to free** [AB04], and a ready
  reset that frees a lock tells the GMs [AB14] — updates on Y07 and W25.
- **A press the pipeline does not roll is handed back** [AB06]: a claimed
  card's forced move carries its claim (`sourceCard` — the path main's issue
  #348 PT11 fix built for the same case, merged into one) and gets it back,
  with a "Not rolled" whisper, when its confirm is cancelled, the lock or the
  world refuses its start, or it fails before its dice; a held move follows the canonical GM
  (`forcedMove.hold`); its order holds through a refused claim [AB24]. The
  inciting ⚔ is still not held (Y36) — it re-arms from the notice.
- **A shared track moves by what a sheet edit changed** [AB07] — an update
  on #326 D3.
- **A session closed out short is caught up** [AB15] — `unsummarisedSession`,
  an update on AA21.
- **A GM page whose connection dropped stands down until it reloads**
  [AB19, AB19-STALE-CACHE-WRITES; the maintainer's choice, 2026-11-12]. A
  world write that lands while a socket is down never reaches that client's
  cache, and a reconnect replays nothing. Its narration in flight is
  discarded (`multiplayer/connectionWatch.js` counts the drops); from the
  drop until the page reloads it is never the canonical GM and writes no
  campaignState, Batch Mode round, Lines or Veils; once its connection is
  back it tells the table (`GM_PAGE_STALE_KIND`) and asks its GM to reload —
  a permanent notice and a Reload button. Another GM takes over what it held
  (its move lock, its round — `noteGmStoodDown`), also for a drop the server
  never saw; with no other GM the table waits for the reload, and relays say
  so: a player's X-Card says it was not recorded. A round narrated beside a
  keyless co-GM therefore waits for the keyed GM's reload
  (ROUND-DROP-CHECK-KEYLESS-COGM), not counting keyed co-GMs only, which
  would post a reply from the stale cache. *Not chosen:* reloading the page by
  itself on reconnect; re-reading the world's settings before the next write.
  Its sheet and chat-card writes are not refused yet (known-issues
  STALE-PAGE-ACTOR-WRITES).
- **Batch Mode** [AB13, AB17, AB18, AB20]: an upgrade in flight is waited for
  (Send now keeps it after 60 s — after five minutes while its handler still runs on the resolving GM's page, UPGRADE-IN-FLIGHT-GRACE); a late reply of a narration taken over posts
  and closes nothing; a takeover names its resolver; an entry stamped rolling
  before its effects is never rolled again.
- **Smaller:** a Make a Connection's portrait is not awaited [AB01]; the
  stored entity lists gate a capture's dedup [AB09]; the player's line names
  the connection (a round's hit, its own line), and none is guessed among
  several [AB10]; a detail matches
  whole words and a negation never dedupes [AB11]; a Safety ✕ removes by text
  [AB12]; the default-named journal wins among flagged ones [AB16]; a failed
  paced narration says so [AB21]; the X-Card reads chat as it was, deleted
  narrations included [AB22]; a token-drag payload is checked against what a
  drop can produce [AB23]; an old ship record reads the lower of record and
  sheet [AB08].

## Haiku 5.5 and Sonnet 5.5 are the defaults; a line is read with its scene (2026-11)

**Decision:** (the maintainer's request after the alpha 23 playtest.)
- **The default models are `claude-haiku-5-5` and `claude-sonnet-5-5`.**
  Every quick call runs on Haiku 5.5. Narration defaults to Sonnet 5.5,
  Haiku 5.5 is offered beside it, and Sonnet 5, Sonnet 4.5 and Haiku 4.5
  stay offered: a world that chose a narration model keeps it (a stored
  choice is the GM's, not migrated).
- **The interpreter's and classifier's model is their own constant.** A
  world stored `campaignState.api.model` (and `maxTokens`, `fallbackModel`)
  at creation; nothing wrote them again, and the interpreter and classifier
  read the stored model before their own, so a newer default never reached
  an existing world. Those three schema fields are gone and any stored copy
  is ignored; `api.promptCachingEnabled` stays.
- **No call asks for extended thinking, and `api-proxy.js` is the one place
  that says so.** A body that sets no `thinking` is sent with its model's
  thinking-off form (`narration/thinking.js`): `disabled` for Haiku 5.5
  (accepted at its default effort, `medium`), Sonnet 5 and Opus 4.7/4.8;
  `between_tools` for Sonnet 5.5, which rejects `disabled`; nothing for the
  4.5 models. The per-call spreads (W27) are gone — the Haiku calls never
  had one, and Haiku 5.5 thinks by default.
- **The Haiku calls' small caps are about a third larger** (Haiku 5.5 counts
  the same text as about 30% more tokens): relevance 110, classifier 330,
  truths 400, rewards 520, ability scan 800, riders 920, Private Channel 800,
  detection 2000 / tier 800, consistency 1300, interpreter 1300, rolling
  summary 420; the chronicle (260) and the entity flavour (310), which run on
  the narration model, too.
- **A refusal is logged** (`stop_reason: "refusal"`, with its category) in
  `apiPost`; every caller already treats a reply with no text as a failure.
- **The interpreter and the classifier read the recent scene**
  (`narrator.getRecentSceneForReading`: the last 3 ring entries, newest
  2,400 characters), as context before the player's line. The interpreter
  names a target the line only refers to ("her coordinates", "there") from
  it; the classifier reads a short line ("we're on our way") as what it
  follows.

**Reason:** the 5.5 models are the current generation. Haiku 5.5 and Sonnet
5.5 think by default, and thinking shares `max_tokens`: the short structured
replies would come back empty (the W27 failure, on every Haiku call). In the
alpha 23 playtest "We're on our way" after an NPC sent coordinates was read
with no destination — the interpreter saw the line alone.

**Rejected:**
- *Adaptive thinking at `low` effort* (the migration guide's first choice) —
  it can still think on a request, and every call here is a short reply
  parsed as text or JSON under a small cap; it would need measuring per
  call. Thinking off keeps today's behaviour.
- *Server-side refusal fallback* (`fallbacks: "default"`) — it retries only
  `cyber` and `frontier_llm` declines; a game narrator's would be
  `general_harms`, and Haiku 5.5 has none.
- *Migrate a world's stored narration model to Sonnet 5.5* — the setting is
  the GM's choice.
- *Pass the whole ring (`narratorContextCards`, default 20)* to the
  interpreter and classifier — they run on every line and are uncached
  there; three entries carry the set-up a short line refers to.

---

## A move the pipeline does not roll is told, and its card handed back (2026-11)

**Decision:** (alpha 23 playtest, issue #348 PT11; the thirteenth audit's
AB06 in issue #347.) The confirm dialog's cancel still cancels — nothing is
rolled, and the player re-words their line ("Re-interpret cancels the move so
the player can re-word it", U04, stands) — but a move the free-flow pipeline
does not roll is no longer dropped in silence:
- **The cancel is named for what it does.** "Cancel — re-word" for a typed
  line, "Cancel" for a forced move (a card button's), which has no line to
  re-word. Closing the dialog is the same cancel.
- **The table is told.** A cancelled confirm, a reading that failed before the
  roll, and a line or non-held forced post refused at the move lock whisper a
  "Not rolled" notice (`moveNotRolledNotice`: `cancelled` / `failed` /
  `busy`) to the line's author, the roller's players and the GMs — the
  pipeline runs on the canonical GM, so its toasts told only that screen
  (known-issues MOVE-BUSY-NOTICE, proposed fix taken).
- **A typed line goes back in its author's chat box** (`restoreLineFor` /
  `restoreLine`, applied on the author's client only, and only into an empty
  box — a draft is theirs).
- **A card button's forced move names the card it claimed** (`sourceCard`:
  `{ messageId, claim, release }`, built by `cardActions.sourceCardFlag` at
  every claim-then-post site and in `applyCardRollerFollowup`). Not rolled,
  the claim is written back to the value the button's own failed-post path
  writes (`releaseSourceCard`), so the button is pressable again. A resist
  roll a suffer card owes names that card (`kind: "suffer"`) and re-opens it
  (`reopenSufferCard`). Only a post a GM made is trusted (every card button's
  move is posted by the canonical GM's relay handler).
- **A forced post is named on the notice** (`gatedMessageId`), so the inciting
  ⚔ — not claimed, re-armed by its presser's client — re-arms as it does for
  the session gate's notice (issue #337 Y36).

**Reason:** "Re-interpret" did nothing visible in play, and the same silent
drop left card buttons reading "Rolled" for a move never made and an owed
resist roll's card saying it was rolled. Handing back with the value each
site's failed-post path already writes reuses a release that site already
trusts.

**Rejected:**
- *Make Re-interpret re-read the line* (excluding the rejected move, or
  offering a short list) — a change to U04's decision; left for the
  maintainer.
- *Hide the cancel on an owed roll* — the ✕ still closes the dialog; the
  card re-opens instead, as Batch Mode keeps an owed roll the roller's.
- *Re-post an owed roll after a cancel* — it re-opens the dialog at once,
  and a dialog that cannot render would loop.
- *Hand back on a GM handover* (a held move lost when the canonical GM
  changes, #347 AB06's fourth case) — the in-memory hold is issue #344's.

*Update (issue #347 AB06, merged onto this path):* issue #347's own AB06 fix
built the same hand-back beside this one (`cardClaim`, a "Move not rolled"
whisper); the merge keeps this path and these names, with what AB06 added.
`sourceCard` also carries the value the press set — the claim is written back
only while the card still holds it — and, on a waypoint alternative, the
ordinary reward's cards it retired, which come back with it (`reopenRetired`).
The notice gains `refused` (the world did not save the move's start). The
boundary is the dice (`rollMove`'s `onDiceRolled`), not the confirm: a
failure after the confirm but before the dice hands the card back too. A
handed-back resist roll also re-opens its move's Burn Momentum / Improve
Result (RESIST-BURN-STAYS-CLOSED). And the GM-handover case is no longer
rejected: a held move follows the canonical GM (`forcedMove.hold`, AB06).

---

## Issue #345 audit: one canonical store per fact, a name is its host's, a journal is found by its flag, a capture follows its narration (2026-11)

**Decision:** (issue #345, the twelfth audit's 70 findings AA01–AA70, fixed
at the maintainer's request in the v1.8.1 cycle. What the fixes established
beyond each row; each row's ID in brackets. The seven decision rows have
their own entries: D1 in "Batch Mode: opt-in rounds" ("A roll made on the
character sheet is narrated with the round"), D2 in the issue #342 audit's
"A round credits each roller, and asks when it cannot tell", D3–D7 the five
entries below this one.)
- **The command vehicle's integrity is its STARSHIP asset's track** [AA20]:
  on a starship carrying the vendor STARSHIP (Command Vehicle) asset, that
  asset's Integrity `system.track` is canonical — what the sheet shows, the
  player marks and the system's own Withstand Damage rolls — and the ship
  record's `flags.ship.integrity` / `integrityMax` is its write-through
  mirror: `updateShip` writes the track first (within its min..max) and
  brings the record to it on every write. Readers read the track
  (`actorBridge.readCommandVehicleIntegrity`; `registry.withSheetNotes`
  overlays it for `getShip`, the Entities panel, repair and the narrator's
  COMMAND VEHICLE line; the +integrity roll). A starship with no STARSHIP
  asset keeps its integrity on the record. *Rejected:* an `updateItem` hook
  syncing the sheet into the flag — the battered decision's rejected option,
  a second write path for a mirror no reader needs. The asset's own Battered
  / Cursed conditions stay a further store (known-issues
  STARSHIP-ASSET-CONDITIONS-UNSYNCED).
  **Update (issue #347 AB08): a record from before this is reconciled to the
  lower value.** Up to v1.8.0 the module's losses went to the record alone,
  so a world played then holds, say, record 2 beside an untouched sheet 5,
  and mirroring the sheet erased the damage from both stores. A record
  without `integritySheetReconciled` (every record written since carries it;
  `ShipSchema` sets it on a new one) reads the lower of the two
  (`actorBridge.unreconciledRecordIntegrity`, in `withSheetNotes` and the
  +integrity roll), and its first `updateShip` writes that lower value to
  both stores, stamps the record and whispers the GMs both values where they
  differed; the canonical GM's world load makes that write first
  (`migrator.reconcileCommandVehicleIntegrity`). *Rejected:* the sheet's
  value (it never saw the module's damage) and the record's (a player may
  have marked the sheet alone) — which was right cannot be known, so the
  lower is taken and the GM told.
- **An entity's name is its host document's** [AA18]: an Actor's name for
  the Actor-hosted types, as before, and a faction's or creature's host
  JournalEntry's name: a sidebar rename is written through to the record
  (its page flag, the body re-rendered — V31's mirror) and to a faction's
  World Journal Factions page (found by its `entityId` backlink), live on the
  canonical GM (`updateJournalEntry`) and at world load
  (`syncEntityRecordNames`); the renamed record's `updatedAt` is stamped. A
  Factions page that already holds the new name is left alone, with a
  console warning — no merge by a guess. `sector.faction` (the Sector
  Creator's bare control-faction name) is a separate name-only store and is
  not renamed. *Rejected:* naming the journal from the record — nothing
  renames a record; the sidebar is where a GM renames.
- **A name a record takes comes off the Dismissed list** [AA19, AA55]: the
  name index still leaves out a record whose name is dismissed (unit-pinned),
  so every hop that gives a record a name un-dismisses it
  (`undismissRecordName`, on the GM's write chain): the identity reveal's
  rename, the Actor and journal sidebar renames and the load-time repair —
  and a Make a Connection hit with a known NPC: a dismissed connection row is
  confirmed as the roller's, and a listed NPC whose name is dismissed gets the
  bond and is un-dismissed. A hit whose narration names several NPCs the
  table knows makes none, and the GMs are told. *Rejected:* indexing
  dismissed names, and a load-time sweep un-dismissing every name a record
  holds — both reverse the pinned index rule (a world already in that state
  stays hidden until the GM's Undismiss).
  **Update (issue #347 AB10): the player's line says which NPC.** Pending
  draft rows (W23), listed NPCs and dismissed rows are one set of
  candidates (`connectNamedFigure`): the one the player's line names, else —
  the line naming none — the one the narration names; several, none is
  guessed and the GMs are told which. The first pending row named anywhere
  in the line or the narration used to be confirmed before any known NPC was
  looked at, so a bystander the narration mentioned was bonded to the
  roller, silently. "Several" now covers pending rows too, and a line naming
  exactly one of several the narration names settles it.
  *Update (issue #347 residual ROUND-CONNECTION-LINE-JOINED):* in a Batch
  Mode round the player's line is the hit's own entry's
  (`connectionRollers[].lineText`), not the round's lines joined: with two
  players playing one character, the other player's line naming an NPC
  bonded that NPC to the hit's roller, or made a line naming one NPC read as
  naming several.
- **Journals are found by their flag; the name is a fallback** [AA62, AA63]:
  the Progress Tracks journal is the one carrying the `tracks` flag
  (`findTracksJournal`; the interpreter reads it the same way), and each
  World Journal journal the one flagged with its `worldJournalCategory`
  (`findJournal`, `findWorldJournal`). The name finds only a journal no track
  was saved to yet, or one with no category flag — never one flagged as
  another category — and such a journal is flagged by the GM's next write (a
  World Journal one also by the canonical GM's load). Renaming them is fine
  (rules/reachability.md §6, resolve by stable id). *Rejected:* a new id flag
  — the flags these journals already carry are marks a rename leaves alone.
  **Update (issue #347 AB16):** a world the old name lookup already split
  holds two journals carrying the same flag — the renamed one and the
  default-named one the next load or write made, which every session since
  read and wrote. Among several flagged journals, the one still carrying the
  default name wins, as v1.8.0 read it; the first in collection order was the
  older renamed one, so the upgrade flipped every reader and writer onto stale
  entries. The same rule holds for `findTracksJournal`, the interpreter's
  track read and `findJournal`. The two journals are not merged
  (TRACKS-JOURNAL-SPLIT-NOT-MERGED); a sidebar Duplicate is the same case.
  **Update (issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED; the maintainer's choice: a
  GM-confirmed merge at load):** they are merged when a GM says so. At the
  canonical GM's world load, each World Journal category and the Progress
  Tracks journal with more than one flagged copy gets one card whispered to
  the GMs, listing what the other copies hold that the live one lacks (by the
  writers' identity: a page's name — a faction's entity id or name key too —
  a track's id); a copy with nothing extra gets none. Its Merge — a GM's
  press, relayed to the canonical GM and claimed once on the card — copies
  those pages with their flags (tracks through the tracks write queue) into
  the live journal, then renames each other copy "<name> (merged)" and stamps
  it `journalMerged`, which no lookup or later check offers again. Nothing is
  deleted; a failed merge frees the card, and a second press copies only what
  is still missing. A later load retires an unpressed card and posts a fresh
  one while the split stands (`src/world/journalSplitMerge.js`).
  *Rejected:* merging without asking — the copies may hold entries the GM
  set aside on purpose; and deleting the merged copy.
- **A retired setting leaves whole** [AA65]: the "Require a sidecar on every
  narrator response" box (`factContinuity.sidecarRequired`) is retired as
  issue #342 D6 retired the Session gap setting — its key, registration,
  getter, panel box and help row go, and a world's stored value stays,
  unread. A narrator reply with no fact block is always warned about in the
  console (NARR-SIDECAR-SILENT: the turn's scene frame and required emissions
  are lost — "No silent failures"); "Enable fact continuity" is the switch
  for the sidecar. *Rejected:* wiring the box to silence that warning — it
  would hide a genuine failure.
- **LAST SESSION is caught up at every mint** [AA21, AA57]: the mint
  (`rollSessionIfDue`) brings every closing session's rolling summary up to
  date (`finalizeSessionSummary`) — not only an ended one with no text (Z41)
  — and makes no call when every card past the summary's coverage is End's
  own closing vignette (Z41's trade-off, now judged by which cards are past
  the coverage rather than a count). A regeneration is discarded when the
  X-Card was played during its call or a card it was made from is one an
  X-Card removed (W06's rule as written), no longer merely while an earlier
  X-Card stands paused. *Update (issue #347 AB15):* the mint's finalise is
  fail-open, so AA21 moved the single point of failure to the mint — a
  session closed out on a client with no key yet, or while its one call
  failed, never got LAST SESSION. The mint now marks such a session
  (`unsummarisedSession`, one of `SESSION_MINT_FIELDS`; a session nobody
  began is not marked — X65 folds it into the one before), and the canonical
  GM summarises its cards for LAST SESSION once it has a key
  (`catchUpUnsummarisedSession`: after each narrator card, at the world load,
  when its key is set). The next mint replaces the mark.
- **A kept strike of a scene fact stands at its place; a Replace stays
  replaced** [AA05, AA28]: a scene end keeps a Replace's original on the
  session's unnamed blocks (never named, never lifted), beside the X-Card's.
  A kept strike of a scene fact — and a Replace original on the blocks —
  keeps the place it was asserted at, and the write block, the `!truth set`
  lift and the CORRECTED block stand it only there (`keptStrikeStandsAt`:
  either place unknown, or one's words naming the other, articles dropped),
  so the three always agree. The X-Card's blocks keep no place — a removed
  fact stays blocked anywhere. This narrows the 2026-07 rejection of
  "scope-filtering the CORRECTED block" for earlier scenes' scene-fact
  strikes only: the summary's leave-out list still names every strike, and
  the active scene's own strikes stay place-blind.
- **A capture runs where its narration ran** [AA34]: a move's or a Batch
  Mode round's post-narration capture runs on the GM whose client narrated
  (`game.user.isGM`) instead of re-checking `isCanonicalGM` when the reply
  lands. The single emitter is the narration: the pipeline's lock claim chose
  that GM and every `narrateResolution` caller narrates once, so after a
  handover the capture's writes run on the GM no longer canonical, as the
  pipeline's own persist already did; a player's client runs none. The
  `@scene`, oracle and vignette captures keep their canonical check
  (known-issues CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE). *Rejected:* handing
  the capture to the new canonical GM — a relay for work the narrating GM
  can run.
- **Pinned Chronicle entries reach the narrator** [AA07]: `buildNarratorExtras`
  reads each PC's pinned entries — the newest five, each on one line,
  clipped at 300 characters — and every CHARACTER block ends with its own
  PC's (a round's and the galley's too; not the campaign recap, which reads
  the whole Chronicle). *Rejected:* retiring the pin (the help promised it,
  and both refuters kept the finding), and bringing back the retired
  recent-entries window — the ring and the summary already carry recent
  play. The cap is a budget call (the old window's default was five).
- **Forsake Your Vow acts only on the roller's own vows** [AA16, AA49]:
  `selectForsakeVow` reads the roller's vows alone — the one their words name
  (exact, then whole words, as Fulfill reads them) or, naming none, their only
  open one (a shared vow counted once); several, or a name none of theirs
  answers to, post "Forsake Your Vow — which vow?"; a crewmate's vow is never
  forsaken, even named outright. The journal twin closes by the forsaken
  vow's own name only. *Rejected:* Fulfill's fallback to the roller's sole
  vow for an unmatched name — a forsake cannot be undone, so it asks.
- **A victory card's buttons find their vow by id** [AA17]: ⚑ and 🏁 resolve
  the card's `vowId` across every PC (`fightCardVow`) — the holder's open
  copy, the winner's when they hold one; fulfilled by anyone or gone from
  every sheet, both retire, titled why, and a stale press marks or rolls
  nothing. A card with no vow id keeps the name path.
- **Undoing a price gives back what its unprepared mark held down** [AA46]:
  `markUnprepared` records the momentum each mark's clamp took
  (`momentumClamped` on the price's supply receipt); `revertPayThePrice`
  gives it back once the marks are cleared (not to a burn's burner, whose
  reset replaces their momentum), the burnable momentum adds the burner's
  back, capped at the maximum from before the mark, and Improve Result
  reverts the price before its meter write, as a burn has since issue #342
  D4.
- **A held move refused again stays held** [AA48]: a handed-back held move
  whose own claim is refused is held again at the front, the GMs are told,
  and the held moves wait for the next campaignState write that lands — the
  refused claim's immediate drain is suppressed meanwhile, as it would only
  be refused again. A forced move's first refused claim keeps
  LOCK-CLAIM-WEDGE's "could not start … Try again". *Update (issue #347
  AB24):* the drain made inside that held move's own refusal is suppressed
  too (`claimPendingMoveLock({ heldMove })`): it handed the move held behind
  it to the pipeline before the older one was held again, so they rolled
  youngest-first.
- Smaller: the X-Card drops the oracle answers its narrations told from
  RECENT ORACLE RESULTS, by card id and by a move's `resolutionId` [AA01];
  a move's sidecar checks its re-assertions against the store's ledgers as
  well as its own copy [AA04]; the narrator's roster leads a shared name
  with the active sector's place [AA06]; a burn's or improve's supersede
  empties a summary made from the replaced card [AA24]; the summary's
  chained write re-checks the X-Card's play count [AA25]; clock vignettes run
  the tier pass [AA33]; the Private Channel reads its player's Private Lines
  from their client setting [AA03], and every client re-syncs its own entry
  when a write misstates it [AA35]; a support vehicle is the one the move's
  target names, a null target the command starship [AA14]; a Heal's patient
  follows the interpreter's situation [AA13]; a companion roll reads the
  companion the target or the line names [AA45]; an Aid Your Ally is
  scanned as the move it is made as [AA11].

**Reason:** each row's probe reproduced its defect, and most were the
repo's standing families (rules/reachability.md): one fact in two stores
with no canonical named (AA20's integrity, AA18's names), identity by a
mutable name (AA16 / AA49, AA17, AA62, AA63), and a producer nothing read
(AA07's pin, AA44's move text, AA63's category flag, AA65's setting).

**Trade-offs accepted:** after a handover a capture writes from a GM that is
no longer canonical (AA34); a support vehicle takes a hit only when the
interpreter names it (AA14 — known-issues SUPPORT-VEHICLES-UNLISTED); the
place match for a kept strike is loose by design (AA28); pinned entries are
capped (AA07).

---

## A help heading that a newer tag passed is renamed to the tag that shipped it (2026-11)

**Decision:** when the in-game help Changelog's newest `<h3>v…</h3>` is below
the latest release tag — its notes shipped under a tag that jumped past it —
the repair renames that heading to the tag that shipped them (`vCURRENT`) and
files the new work under a new `vCURRENT + 1` heading, `CONTENT_VERSION`
matching it (CLAUDE.md's version-pinning rule; issue #345 D7,
VERSION-PIN-RULE-MINOR-BUMP — the maintainer chose option A). Applied once:
the v1.8.0 release's notes were headed v1.7.37 (`CONTENT_VERSION` "1.7.37");
they are v1.8.0 now, `CHANGELOG.md`'s shipped `[Unreleased]` is promoted to
`[1.8.0]`, and issue #345's work is v1.8.1. `tests/unit/helpChangelogVersionPin.test.js`
fails while the newest heading is below the newest tag merged into `HEAD`
(it skips where no tags are fetched, as in CI's shallow checkout).

**Reason:** the old repair — rename the stale heading to `vCURRENT + 1` —
files a release's notes under the version after the one that shipped them
whenever that release jumped past the heading: v1.8.0's Batch Mode notes
would have read v1.8.1, while `CHANGELOG.md`'s promotion gives the same notes
`[1.8.0]`, so the two changelogs would disagree for good.

**Rejected:** *Keep the rule and accept the mislabel* (option B), as
`CHANGELOG.md` once did for a skipped release — a table reading the help
would see the wrong version for its newest notes.

---

## The Session panel's ✦ Envision Inciting Incident is `!incite` for a GM too (2026-11)

**Decision:** every press of the Session panel's ✦ Envision Inciting
Incident — a player's or a GM's — posts the presser's `!incite` line
(`src/ui/sessionPanel.js`), which the chat-command router runs where a
Claude key lives, exactly as typing it does: RUN_ON.CLAUDE — the keyed
canonical GM when one is connected, else the presser's own client and key
(decisions "Chat commands run once"). It reverses issue #330 D15's "a GM's
press runs it on the GM's client as before" (issue #345 D6,
SESSION-PANEL-INCITE-SKIPS-KEYED-GM — the maintainer chose option A).

**Reason:** a keyless co-GM's press ran `runIncitingIncident` on their own
client, where the narrator has no key: it posted the spark-only card — no
opening narration, no suggested vow, no premise canon — with no word why,
while the same GM typing `!incite` got the keyed GM's narrated incident.
The help presents the button and `!incite` as one thing, and "Claude calls
run where a key lives, exactly once" already routes the command. D15
weighed only players. The same routing also covers a keyed GM who is not
the canonical one: their press no longer saves the premise from a
non-canonical client.

**Rejected:** *keep D15's local run, and tell a keyless GM why the card has
no narration* (option B) — the button would still do less than the
command it stands for.

**Trade-offs accepted:** a GM's press now posts the `!incite` line in chat,
as a player's press and a typed command do.

---

## A player's `!truth set` cannot set back what the X-Card removed (2026-11)

**Decision:** `setTruth` (`src/factContinuity/ledgers.js`) refuses a
non-GM `!truth set` whose subject and fact match a retraction the table
cannot lift — the active scene's X-Card retraction, or one of the session's
unnamed blocks an earlier scene end kept (`sessionRetractions.blocked`) —
found by `findSessionBlock`, the fact compared as the narrator's re-assertion
guard compares it (case, spacing, a trailing full stop aside — issue #345
AA26). The card says "that fact was taken out of the story this session;
only a GM can set it again", naming neither the fact nor who removed it.
Since issue #345 AA05 the blocks hold a GM's Replace originals too, so a
player's set of the wording the GM replaced is refused as well — in its own
scene too (`isReplacedOriginal`), as a set over a GM's strike is (W60). A
GM's own `!truth set` of the fact is still recorded (the GM's authority; it
lifts nothing), and the next session may state it (issue #345 D4,
PLAYER-TRUTH-SET-OVER-XCARD — the maintainer chose option A).

**Reason:** a player's set of the fact the X-Card removed was recorded as a
live binding truth — in its scene (`findBareStrike` passes over the X-Card's
retraction) and in a later one (the lift reads no block) — so every prompt
named it under TRUTHS again ("they are never named to it", help → Safety
System), while a player's set over a GM's mere strike was refused. No player
has that authority anywhere else in the correction model.

**Rejected:** *allow it as a deliberate, visible act, and say so in the help*
(option B) — one chat line undid the X-Card's promise for the table.

**Trade-offs accepted:** a player cannot set back a fact even when the
fiction has since made it true again; they ask the GM, whose set is
recorded. A Replace made by a player (the correction dialog is reached from
GM-only cards) is treated as the GM's.

---

## The X-Card restores the scene frame its narration replaced (2026-11)

**Decision:** a scene frame keeps the frames of its scene it replaced — a
bounded `previous` chain, newest first, the one state entries keep since
issue #326 W41 (`applySceneFrame`, `src/factContinuity/ledgers.js`) — and
`retractNarrations` puts back the newest frame in the chain that no removed
narration wrote, pruning the removed ones from the chain of a frame that
stays (issue #345 D3, XCARD-CLEARS-KEPT-FRAME — the maintainer chose
option A). So after an X-Card the kept narration's "Where / Present / Now" is
the scene's again, and the redirect narration is built with it. It reaches a
Burn Momentum / Improve Result's supersede too (the same `retractNarrations`,
`by: "superseded"`; `resultUpgrade.js` `ledgersHold` walks the frame chain).
Nothing renders the chain; a frame of another scene is never chained (a scene
start or end still clears the frame). **Amends** U07's recorded choice ("its
state and frame removed", "a frame they wrote cleared" — the X-Card entries
below, and the pin in `tests/unit/xcardNarratorMemory.test.js`), which W41
had already reversed for state values.

**Reason:** the narrator emits a frame on nearly every response, so clearing
the X-carded narration's left almost every X-Card with no frame at all — a
never-dropped tier (rules/narrator-memory.md invariant 4) whose `present`
cast keeps the conversation partner's card in scope (`addSceneFrameCast`) —
for the one narration that most needs grounding: the redirect.

**Rejected:** *keep clearing it* (option B, U07 as recorded) — the next
sidecar re-emits a frame, but the redirect narration itself was built
frameless, and resolveScenePlace's fallback at a scene end found no location.

**Trade-offs accepted:** the restored frame is the kept narration's as it was
written: a change since that no narration recorded (a GM's `!at`, a token
move) is not in it — the redirect narration's sidecar writes a fresh frame,
as every narration's does. The chain adds at most four frames to the stored
setting.

---

## The Private Lines sync runs unqueued, like the X-Card (2026-11)

**Decision:** `safety.syncPrivateLines` — a player's Private Lines relayed to
the canonical GM — runs the moment it arrives, outside the serialised GM relay
queue, as `xcard.activate` does (`UNQUEUED_ACTIONS`,
`src/multiplayer/gmRelay.js`; issue #345 D5, PRIVATE-LINES-QUEUED — the
maintainer chose option A). Its handler, `applyPrivateLinesSync`, is one
read-and-set at its turn on the GM's campaignState write chain, with no await
between the read and the write, so two syncs — or a sync and any other write
on that client — still never interleave: the chain orders them, each reading
the store as the write ahead left it.

**Reason:** queued behind a Claude-calling handler (an oracle follow-up, a
Burn / Improve re-narration, Begin / End a Session), a Private Line a player
had just added waited seconds — up to the 270 s run budget if the handler
hung — while the move pipeline, which is not queued, narrated straight through
it with the line missing from the safety block it reads from the store (issue
#321 U08). That is XCARD-QUEUED's shape for the other safety write. Running it
unqueued rests on the X-Card's own premise, re-checked for this write: no
relay handler writes back a campaignState snapshot held across an await —
every write a handler reaches reads the store at its turn on the chain or
merges only its own fields onto it, and the move pipeline's record takes
`safety` from the store (`persistResolution`'s store-owned fields).

**Rejected:** *Keep it queued and name Private Lines in the "One serialised GM
queue" accepted limitation* (option B) — a hard limit that waits behind a slow
narration is missing from the very narrations that run meanwhile.

**Trade-offs accepted:** none new. The load-time entity migration still writes
a snapshot held across its awaits (known-issues MIGRATE-STALE-WRITE, open); it
is no relay handler, so the queue never ordered a sync against it either.

---

## The eleventh audit's open items: every read-and-set campaignState write is on the chain, the X-Card's pause jumps it, what it removed stays blocked, a portrait is bought once (2026-11)

**Decision:** (the fifteen items found while fixing issue #342, and the
fourteen found while fixing those — fixed at the maintainer's request on
2026-11-06. Each item's code in brackets; known-issues.md has every row.)
- **Every read-and-set campaignState write is on the client's write chain**
  [CAMPSTATE-CHAIN-PARTIAL, CAMPSTATE-CHAIN-REST, ART-INDEX-WRITE-OFF-CHAIN,
  CACHE-MUTATED-BEFORE-WRITE]: `serialiseCampaignStateWrite` now also carries
  the move lock's claim (one path, `claimPendingMoveLock`, for free-flow too),
  release, put-back and ready reset; the X-Card's resume and redirect clear;
  the relay handlers (Set a Flag, Take a Break, Begin / End a Session,
  `!bond`, Private Lines); `persistResolution`; `writeOwnedFields`' callers
  (the world truths, `!lore`, Campaign Start); the next-move claims and grant;
  the spotlight; the commands (`!at`, `!sector`, `!pace`, `!roll`, custom
  oracles, site reveal / clear); entity registration and the migrator; the
  art index; the recap cache; the rolling summary and a draft's Dismiss —
  each a copy of the store as it is at its turn. `campaignStateChainSweep.test.js`
  fails on a production campaignState write outside a chain call (its
  `OFF_CHAIN` allow-list is empty). *Rejected:* field merges per writer alone
  — a writer off the chain still read inside another's round trip and put
  its fields back (the X-Card's pause, an oracle answer).
- **The X-Card's pause jumps the chain** [CAMPSTATE-CHAIN-PARTIAL]:
  `runCampaignStateWriteNow` writes it at once, and chained writes not yet
  started wait for it (at most 10 s). A chained write already sent when the
  pause is played lands first and the pause takes back its change; a lock
  release it carries back is put back (`restoreLockOverCarriedBackClaim`).
  *Rejected:* queuing the pause — "the X-Card is the exception": it must not
  wait behind a stuck write.
- **What the X-Card removed stays blocked for the session, and is never
  named** [XCARD-RETRACTION-SCENE-SCOPED, XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED]:
  a scene end keeps the scene's X-Card retractions on
  `sessionRetractions.blocked` and every live narration truth it closes on
  `sessionRetractions.narrated` (each the newest 50 — superseded narration
  truths too, issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END); an X-Card on a narration
  whose scene has ended moves its truths onto `blocked`; `applySidecar`
  refuses a blocked fact's re-assertion (`findSessionStrike(…, { blocked:
  true })`), while CORRECTED, the summary's leave-out list and `!truth set`'s
  lift never read it. A GM's own `!truth set` of the fact is still recorded,
  and the next session may state it; a player's is refused (issue #345 D4 —
  "A player's `!truth set` cannot set back what the X-Card removed").
- **A scene end merges at its turn and checks before each migration write**
  [XCARD-DURING-SCENE-END-RACE, XCARD-DURING-SCENE-END-MIGRATES,
  STRIKE-DURING-SCENE-END-LOST]: `endScene`'s own chained write
  (`persistEndedScene`) adds the scene's strikes, X-Card retractions and
  narration truths onto the store's `sessionRetractions`; every migration
  write (tier detail, lore archive, LAST KNOWN) first re-reads the store's
  X-Card and strike state and takes back a copy that landed as one was made —
  so a slow scene end, End a Session's included, no longer files a removed or
  struck fact as canon (closes known-issues END-SESSION-STALE-ENDSCENE).
- **A portrait is bought once** [REGEN-LINK-REFUSED-SECOND-REGEN,
  PORTRAIT-LATE-FIRST-GENERATION, FIRST-PORTRAIT-LINK-REFUSED]: a
  regeneration is claimed (`regenerationUsed`) before its image is bought and
  given back only when the image could not be made; a refused save keeps the
  earlier portrait, locked. A first generation holds a per-entity slot (a
  second waits for it and gets its portrait) and keeps a portrait linked
  meanwhile; a link the world refuses attaches nothing, tells the GM, and the
  next call links the stored image (`findEntityPortrait`) instead of buying
  another. Left: two GMs within one image call (PORTRAIT-TWO-GM-FIRST-GENERATION).
- **An arrival's two stores agree** [ARRIVAL-LOCATION-PHRASE-SPLIT,
  ARRIVAL-FRAGMENT-SHIP-FREE-TEXT, EXPEDITION-STAMP-SITE-NAME]: the
  current-location pick (the destination's id, else its name) is made first
  and the ship docks by its id, as `!at` does; when neither names a place, the
  current location is the one the ship's new position names. An expedition's
  site link goes through `selectExpeditionSite`, the finish's own ladder, so a
  renamed site is the one linked.
- **A page-less journal is completed, not duplicated** [FACTION-PAGELESS-JOURNAL,
  CREATURE-PAGELESS-JOURNAL]: adoption gives an unlisted page-less faction or
  creature journal the creator's page before registration, as Z62's Chronicle
  is completed by its next write.
- **A refused move-lock step is said, and frees what waits on it**
  [FREE-FLOW-RELEASE-REFUSED-TWICE, FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM,
  ROUND-WAIT-AFTER-REFUSED-CLAIM, ROUND-LOCK-WAIT-MARKED-LATE]: a release
  refused twice whispers the GMs (Z19's rule, free-flow too); a refused claim
  drains the held card moves and wakes a waiting round (`noteMoveLockFreed`);
  a round re-checks the lock after marking its wait (`moveLockFree`, the
  driver's host). *(Since issue #345 AA48 a handed-back held move whose own
  claim is refused is held again, the GMs told, and the held moves wait for
  the next write that lands — the drain is not repeated into a claim the
  world still refuses.)*
- Smaller: a round's CHARACTER blocks are only for PCs that still exist
  [ROUND-CHARACTER-BLOCK-GONE-PC]; an unrolled round's detection reads as
  free narration [ROUND-DETECTION-NULL-MOVE]; a scene-challenge variant whose
  own challenge ended is the ordinary move, in a round and from a paced Roll
  [ROUND-VARIANT-TWO-CHALLENGES, PACED-VARIANT-ROLL-ENDED-CHALLENGE]; an
  upgrade step's Retry supersedes the trigger its rewind takes back
  [UPGRADE-RETRY-REWIND-NO-SUPERSEDE]; a won fight's and a payoff's cards
  carry `vowCopyId` [FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY].

---

## Issue #342 decisions: D1–D8 (2026-11)

**Decision:** (issue #342 — the eleventh audit's eight rows that needed the
maintainer. The maintainer asked for the issue to be addressed on 2026-11-06
and took the recommended option on every row: D1, D2, D3, D5, D7 and D8
option A; D4 option A, narrowly; D6 option B. Each row's ID in brackets.)
- **While unprepared, a choice card's Sacrifice Resources option stays open
  and sends its cost elsewhere** [D1; option A]: Check Your Gear's weak hit
  and Heal's costs offer it; picked, the executor posts the existing "make a
  suffer move (-N)" picker without Sacrifice Resources (issue #325 W16's
  redirect) — the cost at its own size, to the move the player chooses. The
  "any" picker still greys Sacrifice Resources (picking another move there is
  the redirect). Amends issue #338 D3's "the card's greyed option".
  *Rejected:* keeping it greyed (option B) — being unprepared then cost Check
  Your Gear's roller a point of momentum the rules never charge ("apply the
  cost to a different suffer move").
- **In a round, an owed resist roll is the roller's next move** [D2; option
  A]: the 🛡 resist post is flagged `owedMove`; `offerForcedMove` makes it the
  entry even beside one already written — the written text kept in
  `entry.setAside` and restored as the author's draft for the next round (not
  auto-submitted), a displaced card move or a second owed roll held for the
  next round — and submit / withdraw / pass / reread refuse it ("owed"); the
  window shows Confirm only. *Rejected:* running it outside the round (option
  B — a second narration) and keeping it droppable with its card re-armed
  (option C — the rules' "must" would not hold).
- **A round's New Entities card asks whose connection a new NPC is** [D3;
  option A]: the card carries every acting PC (`flags.actorIds`); a connection
  row's Confirm is a button per acting PC plus **No one**, the pick checked
  against `actorIds` (`draftConfirmPick`), the bond filed on the pick or on
  nobody (`draftBondHolder`); the "NPC already exists" branch honours the pick.
  Free-flow cards and a one-PC round's card keep their one Confirm. With Z09,
  each Make a Connection hit auto-creates the NPC its own roller met, and an
  NPC two PCs could own waits on this card. *Rejected:* the first entry's PC
  (option B — a wrong bond one click away in every multi-PC round), no PC
  (option C — it changes free-flow parity), and the discovery move's roller
  (the Batch Mode auditor's variant — it still gives the second roller's NPC
  to the first).
- **A reversal clears the unprepared its reverted price made** [D4; option A,
  narrowly]: the price route's receipt carries the marks it made
  (`unpreparedMarked`, and `alliesMarked` from `markUnprepared`), and
  `revertPayThePrice` clears exactly those once the refunded supply is above
  0 — an `unprepared` upgrade step with a GMs' Retry; a mark made before the
  price stays. A burn reverts the price before its meter write, so its
  momentum reset is computed without the cleared impact (the reversal card now
  posts before the burn's momentum write). Amends issue #313's trade-off
  ("impacts a suffer executor marked are still not reversed") for unprepared
  alone. *(Since issue #345 AA46 Improve Result reverts the price before its
  meter write too, and the reversal gives back the momentum each mark's
  clamp took — `momentumClamped` on the supply receipt.)* *Rejected:* keeping the trade-off and naming the crew on the reversal
  card (option B) — since #338 D3 a stale mark redirects every supply loss
  the crew makes.
- **A victory card's 🏁 is the vow holder's** [D5; option A]: Attempt to
  Fulfill rolls as `resolveVowHolderActor(vowName, actorId)` — the winner when
  they hold a copy (every case issue #329 X05's tests pin), else the PC who
  does — that PC's player or a GM may press it, and the miss's 🔁 recommit
  offer follows; a vow found nowhere keeps the card's roller (no first-PC
  fallback). The card's three buttons now agree. *(Since issue #345 AA17 the
  card's ⚑ and 🏁 find its vow by the card's vow id, not its name: a vow
  fulfilled by anyone or on no sheet rolls and marks nothing, and both
  buttons retire; a card with no vow id keeps the name path.)* *Rejected:* letting the
  winner fulfil a crewmate's vow from the card (option B) — #338 D1 exists to
  stop another player rolling a character's move.
- **"Previously On" introduces the session the load minted; the gap setting
  is retired** [D6; option B]: the session boundary stays #286 C4's (End a
  Session, or four idle hours). The ready recap posts when the load started a
  new session after an earlier one — the store's `currentSessionId` differs
  from the one before the load, so a refused mint posts none; a world's first
  session posts none; a Begin a Session that mints without a reload posts no
  auto-recap. The "Session gap (hours)" setting is retired with its panel
  field and hint, `isNewSessionStart` and its help row; a stored value is
  left unread. *Rejected:* making the setting the session boundary (option A
  — C4 decided the boundary, and the session's memory resets with it).
- **Finishing an expedition charts only the site it was for** [D7; option A]:
  the finish's reveal runs with `requireLabelMatch` — the track's `siteId`, or
  a site its label names (exact, whole words or the type keyword); under that
  rule the pin's own "Unexplored Site" names the active sector's one
  unexplored site, at the Undertake's stamp and at the finish alike (so an
  unlinked track made before this version still charts it). `!reveal-site`
  with no name keeps the sole-site guess. A target is what was named, or
  nothing [U14, U16, U48]. *Rejected:* skipping the guess only when the label
  names a known non-site place (option B — a trailblaze "across the Rift"
  still charted the site) and keeping it documented (option C — an unchosen,
  irreversible plot event).
- **A narrator card is a GM's while a keyed GM is connected** [D8; option A,
  applied where a narrator card is recognised]: `countsAsNarratorCard` gates
  the Play button, auto-play, the relayed synthesis's clip-key bound and the
  cache write. With a keyed GM connected (`hasKeyedActiveGM()`) only a
  GM-authored message counts; with none, a player-authored one counts while
  its text is at most the narration's max tokens × 4 characters (one over the
  cap does not count at all). An honest card a player's own game narrated
  loses its Play button once a keyed GM connects. *Rejected:* recording it as
  a trusted-table limitation (option B) — issue #331 X51 was fixed to stop
  exactly this billing of the GM's key.

---

## Issue #342 audit: a write a relay can race is its own, a round credits each roller and keeps every action, a card's button is its character's (2026-11)

**Decision:** (issue #342, the eleventh audit's 74 findings Z01–Z74, fixed at
the maintainer's request on 2026-11-06. What the fixes established beyond
each row; each row's ID in brackets.)
- **The session's activity stamp is its own setting** [Z01]: `sessionActivity
  { sessionId, at }`, written by the canonical GM on chat activity at most
  every 10 minutes; the idle limit reads the later of it and the mint's
  `lastSessionTimestamp` (`sessionLastSeenAt`), and a stamp counts only for
  the session it names. The stamp used to write the whole cached
  campaignState, landing after — and undoing — a relayed X-Card pause, Set a
  Flag, Take a Break or End a Session. *Rejected:* one write chain for every
  campaignState writer — the relay handlers' writes were not on it then (they
  are since the open items, CAMPSTATE-CHAIN-PARTIAL), and a stamp of its own
  touches no other writer's fields whatever the chain holds.
- **Read-and-set campaignState writes share one chain per client** [Z17]:
  `serialiseCampaignStateWrite` (`src/multiplayer/campaignStateChain.js`)
  carries the oracle capture, every clock write, `persistCampaignStateFields`
  and `persistSceneLedgerFields`; a write ahead that never settles is waited
  on for at most 10 s from its start (`serialiseClockWrite` delegates to it,
  gaining that bound). Since the open items every read-and-set campaignState
  write is on it, and a sweep test keeps it so (CAMPSTATE-CHAIN-PARTIAL /
  -REST, "The eleventh audit's open items").
- **Every narration hand-off gets a working copy** [Z02]: the paced path
  (cloned before `narratePacedInput`) and the inciting swear (cloned at its
  read) join issue #331 X09 / #335 Y04's deepClone rule.
- **A reversal takes back what it reverted from memory too** [Z11, Z46]: a
  reverted price's RECENT ORACLE RESULTS entry is dropped by its
  `resolutionId`; a burn supersedes the trigger vignette of every clock its
  rewind takes out of full — another player's price's included, vow clocks
  too — not only the burned receipt's own trigger (amends #338 D8's basis).
- **A round credits each roller, and asks when it cannot tell** [Z08, Z09,
  Z10, Z35, Z36, Z40, D3; amended by issue #345 D2]: a Make a Connection miss
  takes no part in the round's capture; each hit auto-creates the NPC its own
  roller met (`roundFigureOwner`: their own line; else the detected
  description and the narration's clause, when together they name that
  roller alone) or nothing — a figure two PCs could own, or whose description
  names one acting PC and the narration's clause another, waits on D3's card.
  (#345 D2, the maintainer's ruling B, 2026-11: the description was read
  first, so "once crewed with Ren" made the NPC Kira found Ren's connection —
  the detection never says who met a figure. *Rejected:* keeping that order,
  A; reading the clause first, C — a clause naming both PCs fell back to the
  description, the same confident wrong owner. A description still places a
  figure no clause places.) The tier pass covers unrolled entries; an entry
  whose PC is gone is refused, never rolled as another PC; names and the
  PARTY roster follow actor ids, not the names copied at open; two or more
  acting characters are narrated in the third person ("Narrator tone and
  perspective").
- **A Batch Mode action is never silently dropped** [Z05, Z29, Z31, Z34, D2]:
  an untaken offer or an unrolled card-move entry is held for the next round;
  held moves run as free-flow when the mode turns off; a submitted action
  stays its author's draft until the round takes it (restored after a failed
  reading, a round resolved or closed without it, and at load); a stale Send
  again is dropped, the text left in the box. Amends the Batch Mode decision:
  Withdraw / Edit / Pass leave an offer standing (only Keep mine drops one),
  and a table-talk line typed while an entry is submitted no longer becomes
  the draft.
- **Turning the mode off is not Send now** [Z04, Z26, Z27]: switching Batch
  Mode off during the upgrade step only marks the round to turn the mode off
  once it finishes — it decides nothing for a roller still choosing; Keep for
  everyone stays a GM's own Send now. A roller who has left, or whose choice
  card closed the upgrades, is kept silently, and the window offers only an
  upgrade the card still takes.
- **A round's bookkeeping never gates a move's record, and a stopped round
  is said** [Z03, Z18–Z25]: a move records even when the round's own write
  is refused; a stopped pass is whispered to the GMs and Send now re-enters
  it; riders run off the advance pass (a GM's open rider prompt holds no
  later round), only from the close that ends the round; a refused lock
  release is retried once, then told; the round's in-flight lock claim is
  visible to free-flow (`_moveLockClaimInFlight`); a closed round heard on a
  new canonical GM opens the next; a resolving round of an ended session
  finishes unless its resolver is gone; the session a load is replacing is
  over at once (no round reads, resolves or opens in it).
- **A card's suggestion button is its character's** [Z56, D5]: 🤝 Develop
  Relationship / 🔗 Forge a Bond on a move card speak as the card's roller
  (`cardRollerPc`) and are their player's or a GM's to press, as ⚑ is; a card
  with no roller stays the presser's. Extends #329 X05 / #338 D1. A crewmate
  develops their own connection by typing the move.
- **A vow's copies are its id's** [Z54, Z55, Z59]: `vowCopyId` (the `vowId`
  flag, else the Item id) keys a reward's claim and a Forsake's loss;
  `collectVowCopies` takes `isVowCopy(vowCopyId(primary))` only, so a vow with
  no flag is its own only copy and two crewmates' namesakes stay two vows.
- **A bond's forged state is mirrored** [Z57]: the connection record stays
  canonical; `setBondItemForged` writes `system.completed` onto every PC's
  bond Item through `bondItemsFor`, and CHARACTER STATE names it "bonded".
- **An arrival is by the place's id, the active sector's first** [Z12, Z14,
  Z15]: a charting expedition arrives at its site's location Actor
  (`selectExpeditionSite` — the track's `siteId`, else the unexplored site its
  label names, never a guess); every name resolver prefers the active
  sector's namesake; `!at` docks the ship by the resolved id; a narration's
  ship-position record keeps the token's spot before it (`tokenBefore`), and
  the X-Card puts the token back there.
- **Audio is served where its key lives** [Z67, Z68]: GMs advertise an
  ElevenLabs key in `audioKeyedGmUserIds` (ids only); `isAudioGM` — the
  lowest-id active GM listed, else the canonical GM — serves keyless
  players' requests and relayed clips; every GM re-advertises its own entry
  on each write of either key registry, so two GMs loading at once converge.
- **A retired surface leaves whole** [D6, Z37]: a setting or stored field
  goes with every reader, writer and help row; `batchRoundFields.test.js`
  requires a production reader for every field a round stores.
- Smaller: a Finish the Scene on an ended challenge is refused, not rolled at
  0 [Z07]; a variant rolled after its scene ended is the ordinary move [Z39];
  "Roll ⟨move⟩" carries the reading's target [Z38]; the Round window keeps its
  picks across a re-render [Z06], drops an X-carded narration [Z32] and
  follows a GM's coming and going [Z33]; the inciting swear in a round is the
  crew's one swear [Z30]; Take a Break's +1 is claimed on the store before it
  is added [Z52]; a burn's kept price keeps its momentum loss [Z51] and its
  follow-up resist card is the upgraded outcome's [Z47]; a gone roller's burn
  burns nobody [Z48]; a PC-less narrative line or price is narrated as no one
  [Z49, Z50]; a strike made before `!scene start` blocks re-assertion and
  `!truth set` lifts it [Z42]; a strike keeps a promoted tier detail [Z43]; a
  Promote racing the X-Card takes its line back [Z44]; the Entities panel
  follows a sheet's Notes and pronouns [Z45]; the next session's mint
  finalises an ended session whose summary the X-Card emptied [Z41] (since
  issue #345 AA21, every closing session whose summary is behind, End's own
  closing vignette aside);
  FACTION LANDSCAPE ranks by recency [Z13]; a relisted faction's Confirm
  completes it [Z60]; a refused Begin clock trigger is narrated by its Retry
  [Z63]; End a Session pays the focus momentum before the summary call
  [Z64]; a renamed truths journal keeps its id link [Z16]; a sector's trouble
  threat is named per sector [Z65]; a Withstand Damage names its vehicle
  [Z53] (by the move's target alone since issue #345 AA14 — a null target is
  the command starship).

---

## Batch Mode: opt-in rounds, read in the player's window, narrated once (2026-11)

**Decision:** ([#340](https://github.com/jamesrmedford-alt/starforged-companion/issues/340);
the maintainer's answers of 2026-11-05 and 2026-11-06.) A GM can switch the
table into **Batch Mode** from the Companion toolbar: each round, every
participant writes one action (or passes) in a Round window
(`src/ui/roundWindow.js`), and once every connected participant is ready or
has passed — or a GM presses **Send now** — the canonical GM rolls every move
for its own roller and the narrator tells the round as one scene, on one card.
Free-flow play stays the default and is unchanged while the mode is off.
- **The player confirms the reading in their own window.** On Submit the
  canonical GM reads the action in the background (`readAction`: pacing, the
  interpretation, asset abilities, which-track choices); the window shows it
  with the confirm dialog's own ability form (`renderMoveAbilitiesForm` /
  `readMoveAbilitiesForm`, shared, not copied). No confirm dialog opens on the
  GM's screen during a round.
- **Upgrades are decided before the narration.** A roller offered Burn
  Momentum or Improve Result chooses Burn / Improve / Keep in the window (the
  card's own relays: one action, one claim); the round waits for them, Send
  now counts as Keep, and the one narration tells the final outcomes — a round
  card is never struck through. The round's result cards' Burn / Improve close
  (`roundClosed`) when it is narrated. *Update (issue #347 AB13):* a Burn or
  Improve pressed on a recorded entry's card while the round still rolls, its
  GM handler still on its way to the round when the rolls end, is an upgrade
  in flight: the upgrade step waits for it (no buttons — "Burning
  momentum…"), its roller's Keep is refused, and Send now keeps it only after
  a minute (`UPGRADE_IN_FLIGHT_GRACE_MS` — a handler that died with its page).
  The step skipped it, and the round told the result as rolled while the card
  said burned. *Update (issue #347 residual UPGRADE-IN-FLIGHT-GRACE):* the
  minute is for a handler no page is running. While the upgrade's handler
  still runs on the resolving GM's page (the in-flight claim burnMomentum.js
  shares with Improve Result — `resultUpgradeRunningHere`), Send now waits for
  it, bounded at five minutes (`UPGRADE_IN_FLIGHT_MAX_MS`): a slow world held
  a live burn past the minute, and the round then told the rolled result while
  the card said burned.
- **Players see who is ready, and what they submitted;** the GM sees every
  reading. Entries stay editable until the round resolves.
- **Chat is table talk while the mode is on.** A typed line is not narrated;
  its author is told once per round and the line becomes their window's draft
  when the box is empty. Commands run as usual; a card button's move becomes
  its roller's entry.
- **A roll made on the character sheet is narrated with the round** (issue
  #345 D1, the maintainer's option A, 2026-11): a participant's vow or bond
  progress roll on the system sheet (Fulfill Your Vow, Forge a Bond) is rolled
  by the system and paid by the payoff hook at once, as before — fulfilment,
  legacy, a miss's 🔁 Recommit offer — and only its narration moves: the
  canonical GM makes it the roller's entry, ready, carrying the parsed outcome
  (`takeSheetRoll` → `enterSheetRoll`), never rolled again and its riders not
  run (the sheet's own narration ran none). Like an owed roll it is the
  roller's action as it stands — an action already written is set aside as
  their draft for the next round, a card move it displaces joins the next
  round, and it can't be withdrawn, passed or edited. With no round collecting
  (one resolving, none open before a session), or beside an owed roll or
  another sheet roll already the entry, it is held for the next round, as a
  card's move is (in memory, as those are); with the mode turned off before
  that round opens, it is narrated on its own, as before. A non-participant's
  sheet roll is narrated at once, as a non-participant's card move runs as
  free-flow. *Rejected:* keeping its own narration, at once, and recording it
  (option B) — the one move narrated outside "one round, one narration".
- **Opting out is silent** (2026-11-06): a player who passes or doesn't act
  is not marked, named or told — not in the windows, on the card, in the
  narration request, or when a GM sends the round.
- Defaults while scoping (#340 lists them all): a GM toggles it and it stays on
  (world setting `batchMode.enabled`, default off); rounds open by themselves
  while a session is active; participants are connected users with a PC of
  their own, a GM only with an assigned PC; one action per player per round;
  entries roll and are narrated in confirm order; a forced move whose roller
  isn't a participant runs as free-flow; the X-Card stops a round resolving;
  End a Session closes a collecting round and keeps the authors' drafts.
- Amended by issue #342 (see "Issue #342 decisions" and "Issue #342 audit"):
  an owed resist roll is the roller's entry and can only be confirmed (D2); a
  round's New Entities card asks whose connection a new NPC is (D3); an
  untaken offer or unrolled card move is held for the next round, and only
  Keep mine drops an offer (Z05); a submitted action stays its author's draft
  until the round takes it, so a table-talk line typed meanwhile is not made
  the draft (Z31); turning the mode off mid-upgrade decides nothing for the
  rollers (Z04).

How it is built:
- **One pipeline, split into stages** (`src/moves/movePipeline.js`: `readMove`
  / `readAction`, `rollMove`, `recordMove`, `finishMove`), shared by free-flow
  (`onMessage`) and the round driver — not a second copy. Free-flow narrates
  then records; a round records before it narrates.
- **The round is its own world setting** (`batchMode.round`), not a
  `campaignState` field — the move pipeline's merge would need a policy for it,
  and it has one writer: the canonical GM, through pure transitions
  (`src/batch/round.js`) applied to the latest stored value on one write chain
  (`queueRoundWrite`), on copies.
- **The move lock is claimed for the rolls and again for the narration**, each
  released in a `finally` through the lock's own paths; it is free while a
  roller decides an upgrade (an interactive wait never holds it).
- **Session handling reads the state as it is** (`onCampaignStateChanged`):
  a collecting round that belongs to no active session is closed, and a round
  opens when none is. A remembered "last session" was stale on a GM who became
  canonical later, and closed a live round.
- **The driver hears a setting's first write too** (`createSetting` as well as
  `updateSetting`): the keyed-GM registry's first write is a create, and a
  keyless GM's submissions were never read once a keyed GM joined.
- **No spotlight nudge in a round:** `round_resolution` is not in
  `SPOTLIGHT_MODES`; the narration closes on a beat the whole party can answer.

**Reason:** The request (2026-11-05): "a mode, toggleable from the top level
ui, that batches up all player moves before sending them to the narrator
together … a separate window pops up for each player soliciting their input.
They can opt to send nothing. The GM should have an override button to send
now, in case someone is afk." A table that wants rounds gets them without
changing free-flow play, which the spotlight decision below keeps
unstructured.

**Rejected:**
- *The confirm dialog on the GM's screen during a round* — the GM would
  confirm every player's reading; the player knows what they meant.
- *Narrating first, then offering upgrades* — the round card would be struck
  through by a burn, as a free-flow card is.
- *Marking who didn't act* (an "away" status, a skip control, naming them on
  the card or to the narrator) — opting out needs no comment.
- *A round timer / automatic send* — Send now is how a GM stops waiting.
- *Per-player narrations posted together* — one narration per round is the
  request.
- *Hiding entries from other players* — decided against; world settings are
  readable on every client, and the module assumes a trusted table.
- *The Private Channel's `THREAD` mode* — reserved for a side conversation
  (#226 §15); Batch Mode is the main table's turn structure.

---

## Batch Mode: a keyless GM's takeover waits for a keyed GM to narrate the round (2026-11)

**Decision:** ([#347](https://github.com/jamesrmedford-alt/starforged-companion/issues/347)
D3, the maintainer's option A, 2026-11-11.) A Batch Mode round is narrated
on a Claude key. A GM with none — a keyless assistant GM canonical for the
seconds the keyed GM's page reloads — leaves a narrating round alone while
the keyed-GM registry (`keyedGmUserIds`) lists a GM with a key, connected or
not (`narrationWaitsForKey`, `src/batch/driver.js`):
- it does not take the narration over: no `resolverId` stamp (issue #347
  AB18's takeover stamp), and a round naming it as its resolver — a keyless
  GM that took over the rolls — is handed back (`handBackResolution` clears
  `resolverId`), so the keyed GM's own recovery resumes it;
- the GMs are told once ("the round waits for a GM with a Claude key"), the
  Round windows' banner says the round can't be narrated yet, and that GM's
  Send now is refused, saying why (`narration-no-key`);
- the keyed GM's recovery — their page's `ready`, or a keyed GM joining (the
  registry's write) — narrates it on their key.
The rolls, the records and the upgrade step still run on a keyless GM; only
the narration waits, as the readings already did (`startReading`) and Send
now did ("no-key"). A table with no keyed GM at all keeps the "narration
unavailable" fallback (issue #345 D1); otherwise the fallback is the exit of
a narration call that failed. Issue #340's round lifecycle listed the
fallback among the narrating phase's exits without telling a missing key
from a failed call; `src/batch/round.js`'s lifecycle now says which.
*Update (issue #347 residual ROUND-WAITS-FOR-ABSENT-KEYED-GM):* the round
waits only while its session lasts. End a Session closes a round still
waiting for a keyed GM as a table with no keyed GM closes one — the
"narration unavailable" card listing each result, the round closed, its
riders run — and the GMs are told why; a Send now after the session ended
runs that close again (its key refusal holds only during the session). It
stayed narrating until the next load's recovery closed it unseen.

**Reason:** the keyless takeover posted "narration unavailable" and closed
the round — its narration gone for good, though the keyed GM was back
within a page load.

**Rejected:** *(B) accepting the fallback on any keyless canonical GM* —
the round's narration lost to a reload; *waiting only while a keyed GM is
connected* — the reloading GM is not connected for those seconds, which is
the case at issue.

**Files:** `src/batch/driver.js`, `src/batch/round.js`, `src/batch/relay.js`,
`src/batch/roundView.js`. Tests: `tests/unit/roundNarrationWaitsForKeyedGm.test.js`.

---

## The tenth audit's open items: a capture checks the X-Card before each write, the move lock is its own paths', a card button is its roller's, a taken add carries its cost (2026-11)

**Decision:** (the items recorded as open while fixing issues #335–#338; the
maintainer asked for them to be fixed on 2026-11-05. Each code in brackets.)
- **A capture writes nothing for a narration the X-Card removed**
  [XCARD-LATE-CAPTURE]: every capture write checks the stored
  `xCardedNarrationIds` right before it (`isNarrationXCarded`), and each pass
  checks on entry (no Claude call) and when its reply returns. *Rejected:* one
  guard at each pass's write phase — an X-Card during the routing left the
  later writes standing; an undo after the pass — it cannot reopen a row a
  late Confirm marked confirmed again.
- **The X-Card takes over the table's strike of what its narration wrote**
  [XCARD-AFTER-STRIKE-STILL-NAMED]: relabelled `xcard` and its kept session
  entry dropped, so it is never named and never lifted; a superseded
  narration's truth (D8) keeps the table's strike. `!truth set` restores X31's
  lore only after a persisted lift.
- **A pending row a Make a Connection confirms is that narration's
  connection** [MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED]: the X-Card removes
  it while unused (D6 (ii)'s rules) and the row goes back to pending — the NPC
  came from the earlier, kept narration; a deleted card's promoted ledger
  facts go back to its name, and its portrait leaves with it
  [XCARD-CONNECTION-PORTRAIT-ORPHAN].
- **Ship position records are written whole** [SHIP-POSITION-FLAG-MERGE]:
  `narrationId` and `previous` null unless a narration set them, because
  `setFlag` merges key by key.
- **The move lock is its own paths' to write** [LOCK-RESURRECTED-BY-COGM-STALE-WRITE]:
  every other writer takes it from the store, and — since a store can lag the
  world by one delivery — the claimant puts back a released claim a write
  carries back (or its later move's claim). *Rejected:* store-ownership alone
  (it cannot see a co-GM's lagging cache); moving the lock to its own setting
  (every reader, about thirty tests and a load migration).
- **A trigger vignette is narrated only while its clock is still full when its
  reply comes in** [TRIGGER-VIGNETTE-LATE-POST], checked before its sidecar
  applies. *Rejected:* retracting at post time — the persist is in flight, a
  co-GM's relay cannot be retracted locally, and a ship move or an audit is no
  ledger entry.
- **A price nobody pays is not part of the story**
  [PTP-PCLESS-NARRATED-AS-FIRST-PC]: no follow-up narration, no oracle memory.
  *Rejected:* narrating it with no character.
- **A refused choice card is a step of the move's record**
  [ERROR-TEXT-BLAMES-KEY's remainder], like Y16's meters: the GM told by cause,
  the GMs' Retry posts it (refused once the move is upgraded).
- **A paced Roll and a "Which fight?" pick are their roller's to press**
  [PACED-ROLL-OPEN-PRESS; closes WHICH-FIGHT-LOCAL-DISABLE] — D1's shape
  (`paced.roll`, `whichFight.pick`), the pick checked against the card's
  fights. **A press refused for whose the card is is told, once, by the relay
  dispatch** [RELAY-REFUSED-PRESS-UNTOLD] (`refusePress`; the presser and the
  GMs). *Rejected:* a whisper in each handler (helper-in-helper would post
  twice).
- **A vow nobody holds refuses ⚔ Swear it as it refuses a reward or a link**
  [SWEAR-ROLL-VOW-GONE]; **a vow's copy is its `vowId` flag or its own Item
  id** [VOW-ID-NEVER-LANDED].
- **A journal-hosted creation is get-or-create after a refused registration
  too** [JOURNAL-ORPHAN-ON-REFUSAL] — Y34's rule for factions (by
  `factionNameKey`) and creatures. **A Confirm of a connection that already
  exists still bonds the card's PC** [BOND-ITEM-AFTER-RELIST]. **`!lore` reads
  the Quickstart journal's flag** [LORE-READS-QUICKSTART-PRINTOUT] — Y39's
  rule: nothing reads the printout back.
- **Repair's supply trade needs a prepared payer** [REPAIR-TRADE-WHILE-UNPREPARED]
  — the trade is Sacrifice Resources (D3's rule). *Rejected:* sending its cost
  to another suffer move — the trade exchanges supply.
- **The classifier knows an open scene challenge as it knows a fight**
  [PACING-ROLL-NO-SCENE-CHALLENGE], and a paced scene-challenge Roll names its
  challenge by id [PACED-VARIANT-NO-TARGET]. **A scene-challenge variant is its
  ordinary move for asset matching** [SCENE-VARIANT-ABILITIES-UNKEYED], through
  one mapping. **A move's display name is its title, everywhere**
  [SCENE-CHALLENGE-MOVE-NAME].
- **A taken add's cost belongs to the roll** [VALUE-ADD-INTEGRITY,
  HOVERBIKE-WEAK-AS-MISS-UNAPPLIED]: the Hoverbike's "add +integrity" is the
  bike's own Integrity track, and taking it counts a weak hit as a miss, as the
  bad-spot downgrade is applied. *Rejected:* leaving the add unchecked —
  checking it would still be free.
- **The momentum bounds count every impact the vendor counts**
  [READDEBILITIES-CUSTOM-COMMENT] (`custom1` / `custom2`), while CHARACTER
  STATE names only the thirteen.
- **A refused panel add gives its form back** [TRACK-ADD-REFUSED-LOSES-NAME].
- **A clip URL's layout is not guessed** [AUDIO-FORGE-ORIGIN-SHARED]: the Forge
  branch stays "an Assets Library URL ending in the clip's file" until a live
  Forge world shows the layout. **Y40's "reload" remedy stands** — v13 runs no
  client setting's `onChange` for an unchanged value (Foundry issue #9051).

**Reason:** each item's regression test fails with its fix taken out
(`docs/testing/fix-sensitivity.md`).

---

## Issues #335–#337 audit: what outlives a scene keeps its narration's id, a refused write is said where it was asked, the sheet holds an NPC's own facts, a queued write decides on what it reads (2026-11)

**Decision:** (issues #335, #336 and #337, parts 1–3 of the tenth audit —
Y01–Y49. The maintainer asked for the issues to be addressed on 2026-11-05.
Each finding's ID in brackets.)
- **What a scene end keeps from a narration carries the narration's id**
  [Y01]: the tier detail it migrates, the archived Lore page and LAST KNOWN
  (with the values it superseded), so an X-Card played after the scene ended
  still undoes them (U07, X01). A faction the capture surfaced, a placeholder
  it renamed (`renamedBy` — reverted unless renamed since) [Y02] and a
  published reflection's capture [Y03] are stamped too: every capture writer
  takes the id from its caller (X01's rule), the published reflection no
  longer excepted.
- **An X-Card retraction is never corrected over** [Y30]: Strike and Replace
  refuse an already-retracted entry, and the merge keeps the X-Card's mark
  over a stale copy's correction. **A lifted strike restores only lore no
  other standing retraction states** [Y32]; held by another strike, the
  entry is handed to it. *Rejected:* a `retractedByTruths` list — it changes
  X31's stored shape and needs a read path for single-id worlds.
- **A narration works on a copy at every entry handler** [Y04] — X09
  extended to the session vignettes, the inciting incident's three callers
  and the native sheet-roll hook. *Rejected:* cloning inside
  `runIncitingIncident`, which would break X38's "the caller's object takes
  the premise once it lands".
- **Scene starts run one at a time on the GM** [Y05]: a start waits (≤10 s)
  for the one in flight, then adopts its scene; Begin's galley vignette
  follows its clock vignettes and `!ptp`'s follow-up its trigger vignette
  (≤60 s). *Rejected:* adopting a `_pendingSceneId` — the second narration
  would continue a scene the store did not yet hold.
- **No silent no-op on a player's action, relayed or not** [Y06, Y17, Y33,
  Y40, Y41, Y43] — X13 / X14 at the paths they did not reach: a relayed End a
  Session, Set a Flag or Take a Break the world refused posts the GM's note
  where the player's card is; the session gate's notice for a held button
  move reaches the roller's players and the held move's line says so; a
  premise not saved, a Claude key not registered, a Private Channel
  conversation not being saved and a price nobody can pay are each said to
  whoever asked (the last refused where it is rolled, so the card is honest).
- **The ready reset releases only a lock whose claimant is gone** [Y07] —
  held by nobody named, by this client's earlier page, or by a user who is
  not connected: W25's "the claimant's departure is the event that matters"
  at load. *Rejected:* releasing unconditionally at ready. *Update (issue #347
  AB04):* "this client's earlier page" is released by that client's own
  `ready` whether or not it is canonical (`releaseOwnStaleLockAtReady`): a
  co-GM who loads alongside the canonical GM reads as connected to it, so
  neither reset freed the co-GM's earlier page's lock, and every move was
  refused until the co-GM left again.
- **A forced move from a card is held, not dropped** [Y08] — the paced Roll
  and the "Which fight?" pick join W02 / X14's `deferWhileBusy`. **An
  unclaimed button the session gate drops is re-armed, not held** [Y36]: the
  inciting card is not claimed, and a held post per press would roll the
  swear once per press at Begin. *Rejected:* `deferWhileBusy` on the ⚔ post.
- **A price that stands keeps its cards** [Y09]: a burn to a weak hit that
  still pays the price keeps the price's resist card and redirect picker
  (`priceCard`); X15 holds for a price the upgrade undoes.
- **A recommit refuses a vow fulfilled since, and writes only the vow its
  miss scored** [Y10, Y25] (X20's rule; no sole-open rung — reachability §6,
  W44). It needs no upgrade sweep: its move is a progress roll, never burned
  or improved. *Rejected:* stamping the offer's `resolutionId` for
  `retireOutcomeChoiceCards` — nothing could reach it. An epic rank "stays
  epic" [Y26].
- **The threshold card's follow-ups are its roller's** [Y11]: the way-out and
  combat-track cards carry its `actorId`, and their off-ramps and Battle
  follow D1's rule; the threshold choice stays the crew's (X06).
- **One refused write does not stop the move's record** [Y16] — X52's rule
  onto X18's card: the refused meters are a Retry step on the GMs' persist
  card, and the notice names the cause. *Rejected:* tagging the rejection so
  the pipeline reports everything — it still loses a record the world would
  have taken.
- **The resist card carries #330 D2's hint** [Y18] while its move can still
  be upgraded. *Rejected:* exempting the forced resist roll from closing the
  upgrades (D2's rejected option A).
- **A suffer card applies to its own character or to nobody** [Y20]: a
  player's press on a card whose PC is gone is refused; a GM's press retires
  it, saying so.
- **The native sheet-roll hooks act only on a player character's roll**
  [Y23] — an NPC card's sheet roll pays, recommits and narrates nothing
  (CLAUDE.md: never `type === 'character'` alone).
- **A won-fight button that keeps its effect first records it on the vow's
  payoff ledger** [Y24] (`milestone:<card id>`), so a refused stamp never lets
  a re-press apply it twice; the pickers claim before their effect (#309).
- **A writer that finds no copy says so, apart from a refusal** [Y27]: a
  reward or link for a vow nobody holds closes its card and says why.
- **Every card sink escapes a document's name, and strips the narrator's
  markup** [Y28, Y29] (V18 / X45 / X27).
- **A faction's name identity is its key** [Y31]: every faction lookup by
  name matches on `factionNameKey` (case, spacing, a leading article), an
  exact name first; the other World Journal categories keep exact titles.
  *Rejected:* `resolveEntityName`'s ladder over the journal titles — looser
  than an exact key needs.
- **An NPC card's pronouns are its sheet's Pronouns field** [Y13] once it
  holds a value — X12's reason applied to pronouns: the getters overlay it,
  the seed prefers it and writes it through. *Rejected:* mirroring the sheet
  into the record from the rename hooks — a second write path for a mirror
  the getter makes unnecessary.
- **A creation is get-or-create after a refused registration** [Y34]:
  creators adopt the unlisted Actor of their type, name and sector, the GM is
  told, and the canonical GM's load lists flagged entity Actors their list
  misses (not copies, not a never-stored sector's leftovers). *Rejected:*
  deleting the Actor on refusal — it may be seeded and its portrait billed,
  and the delete can be refused too.
- **A promote re-reads the record after its await** [Y35].
- **A charted site's pin anchors the ship's position both ways** [Y14]: the
  token on it records the site ("near"), and a record naming a location
  moves the token onto its pin — a site still unexplored too, because the
  Finish an Expedition that charts it records its arrival before its reveal;
  an undiscovered pin names no place from the token side. A drop on a site
  pin is not a Set a Course (sites are reached by expedition). *Rejected:* a
  charted-only sync.
- **A queued write decides on what it reads** [Y37]: whether a clock is
  already full is judged inside `serialiseClockWrite`; a full clock is not
  written.
- **An edit of the campaign's saved Setting Truths page counts as a save**
  [Y39]; the Playtest Quickstart's World Truths page is a printout of its
  flag and is not read back. *Rejected:* re-parsing the printout (lossy),
  and a read-only page with the reconcile re-run on `!lore`.
- **The bound covers what comes back from the GM** [Y42]: a clip path in
  `audio.synth.done` / `audio.cache.found` plays only when the GM's cache
  could name it (the W81 / D11 / X51 rule). *Not taken:* the audit's looser
  `[0-9a-f]{2}` folder — the slot is the hash's own.
- **A field nothing reads is retired** [Y44] (`thresholdTrackId`).
- **A panel's re-render keeps what the user is typing** [Y45]
  (`replaceKeepingInput`). *Rejected:* skipping the re-render while a field
  has focus — the panel would go stale.
- **README and the help are checked against the code** [Y46, Y47]:
  `readmeCommandsCoverage` compares README with the routes and their gates;
  `helpRoleClaims` reads every page.
- **An ability adds its clause for the move** [Y15, sharpening W12 / X04]: a
  sentence splits at ";" and before a mid-sentence "if you <Move>", and an
  add belongs to the clause whose move link names the move (a clause naming
  none continues the one before) — Combat Bot's Strike +1 is no Clash add.
- **An add that names a value the module holds is that value** [Y22]: "+<stat>"
  from the roller's snapshot, "+its health" from the companion asset's track,
  offered on the confirm dialog as its number; a value from a general clause
  counts only when the ability names the move nowhere. "+cargo" / "add that
  amount" stay text. The manual adds input (issue #322 V02) stays rejected.
- **An at-0 table is rolled once, on its choice card, and the narrator is
  told that roll** [Y21]: no seed pre-rolls the mortal-wound, desolation or
  vehicle-damage table on a miss; the card's roll reaches RECENT ORACLE
  RESULTS through its `oracleMemory` (U03's rule for a roll made after the
  narration).
- **A rider's supply loss while unprepared is another suffer move's** [Y19]:
  the W16 picker, bound to the move, and the rider reported not applied (D3's
  rule: at any supply).
- **The play-kit coverage doc's punch list is re-audited** [Y49]: each item
  says FIXED with where, and 3.1.3 is the vendor's own impact rule.

**Reason:** the tenth audit's findings, each with a probe that failed before
its fix (Y48 traced by hand); the tests that replace them fail with the fix
taken out (`docs/testing/fix-sensitivity.md`).

---

## Issue #338 decisions: D1–D10 (2026-11)

**Decision:** (issue #338, part 4 of the tenth audit — the ten rows that
needed the maintainer. The maintainer asked for the issue to be addressed on
2026-11-05 and took the recommended option on every row: D1, D2, D4, D5,
D6 (i), D7, D8 and D10 option A; D3 option A with the crew-wide clear; D6
(ii) option A narrowed; D9 option B. Each row's ID in brackets.)
- **A card's forced follow-up is its roller's player's or a GM's to press**
  [D1; option A]: ⚔ Attempt to Finish the Fight, 🗺 Finish the Expedition and
  a new vow's ⚔ Swear it (roll) relay through `GM_ACTIONS` on the
  `fulfilVow.attempt` shape (`tda.attempt`, `expedition.finish`,
  `vow.swearRoll`) — claimed once, a non-owner refused, posted as the roller;
  a card with no roller rolls the presser's own PC. *Rejected:* keeping
  "whoever presses" and documenting it (option B) — another player could
  spend a character's momentum or bring a Pay the Price down on them.
- **Within a scene challenge, Face Danger and Secure an Advantage are its own
  moves** [D2; option A, in issue #326 D6's shape]: two interpreter-typable
  ids (`face_danger_scene_challenge`, `secure_an_advantage_scene_challenge`)
  scored against the open challenge (`scoreSceneChallenge`) by the vendored
  outcomes — progress on a hit (twice on a strong-hit match), a segment on a
  weak hit, one or two on a miss with its Pay the Price, which then skips the
  challenge's clock (one fill); a card says what was marked and filled. A
  Burn or Improve leaves the clock as its outcome would have, from the
  original's receipt (`targets.sceneChallenge`); a variant typed with no
  challenge open is the ordinary move. Begin the Scene stays the Progress
  Tracks panel's Add (the coverage doc names it). *Rejected:* documenting the
  gap only (option B); re-keying the ordinary move while a challenge is open
  — a fight in the middle of a challenge would be misfiled.
- **A loss of resources while unprepared goes to another suffer move, at any
  supply; Resupply's clear is the crew's** [D3; option A with the crew-wide
  clear]. The vendored Sacrifice Resources keys the redirect on the impact
  ("while unprepared"), which issue #325 W16 had narrowed to 0;
  `isUnprepared` is now the one predicate (the executor, the "any" picker's
  greyed option, the rider — since issue #342 D1 an enumerated choice card's
  Sacrifice Resources stays open and its cost is redirected), and
  `clearUnprepared` clears whoever `markUnprepared` marks (`supplyAllies` —
  known-issues UNPREPARED-CLEAR-ONE-PC).
  `unpreparedAtZeroSupply` is retired. *Rejected:* keeping "at 0" and
  recording it (option B); A alone — one crewmate's Resupply would have
  redirected every ally's loss until their own.
- **A seed writes its own marked introduction and keeps the rest of the
  Notes tab** [D4; option A; closes Y12]. Each element of a seed's
  introduction carries the class `sf-seed-intro` (the sheet's editor keeps
  classes; one per element, so the paragraph the GM starts after it is the
  GM's), and a re-seed replaces only those; an unmarked tab gets one
  prepended. Characteristics keep every line the seed did not write. X34's
  stamp-only Finalise now covers only a ship the Auto-Seed populated, so a
  hand-made ship's Finalise seeds it, keeping its Notes. *Rejected:* option B
  — the whole rewrite behind a confirm, with X34 extended to connections,
  which leaves the loss one click away; a wrapper div (Enter after the
  introduction lands inside it) and an HTML-comment marker (the editor drops
  comments).
- **A mission cross-reference rolls the active sector's region's table** [D5;
  option A]: `!oracle` passes the active sector's region and Fleet's
  "Starship Mission" / Starship Type's "Multipurpose" rows (#330 D13) roll
  `starship_mission_<region>` (the Terminus table with no sector), as the
  Sector Creator picks its tables by region. *Rejected:* keeping the Terminus
  table and saying so in the help (option B).
- **The X-Card withdraws the draft rows its narration queued** [D6 (i);
  option A]: the ◈ New Entities card carries its narration's id, and the
  X-Card marks its still-pending rows `xCarded` — no Confirm / Dismiss, out of
  PENDING DRAFTS and the re-detection skip — without adding the names to
  `dismissedEntities`, so a later genuine mention proposes them again.
  *Rejected:* leaving them pending for the GM (option B) — Confirm would mint
  an NPC from removed content.
- **The X-Card takes back an unused connection its narration created** [D6
  (ii); option A, narrowed]: a Make a Connection auto-create carries
  `createdFromNarrationId`. While the record holds nothing beyond its
  creation, its sheet nothing the table wrote (Notes text outside the seed's
  marked introduction and the portrait, a Characteristics line the seed did
  not write) and no bond Item a mark, the X-Card deletes the NPC card, its
  bond Items and its id-list entry; otherwise it keeps it and whispers the
  GMs once, naming it without a pronoun. *Rejected:* B alone, always keeping
  the NPC — the removed prose stays on every roster.
- **The X-Card takes a promoted detail out of the notes** [D7; option A]: a
  ⤴ Promote keeps `{ narrationId, promotedText }` on its tier entry, and the
  X-Card strips that paragraph from the Notes tab (or the record's notes)
  when it drops the entry. *Rejected:* treating the Promote as the GM's
  authorship that stands (option B) — it predates the card, and the Notes row
  is a narrator surface (U07).
- **A burn or improvement that rewinds a fired clock supersedes its trigger
  vignette, and the narrations it supersedes leave the scene ledgers** [D8;
  option A]: trigger vignettes carry their `clockId`; the reversal strikes
  the clock's newest trigger vignette of the session (`burnSuperseded`), and
  its narration's and the superseded move narration's entries are retracted
  by `narrationId` as `retractedBy: "superseded"` — rendered nowhere, never
  named under CORRECTED, and not blocking a restatement (an X-Card's
  retraction would block the re-narration's own). The superseded narration's
  World Journal and tier records stand. Since issue #342 Z46 the supersede
  covers every clock the rewind takes out of full — one another player's
  price filled included, vow clocks too — not only the burned receipt's own
  trigger. *Rejected:* keeping both as fiction that stands (option B).
  **Update (issue #347 D2):** the records stand beside the re-narration only
  while the beat does: an X-Card on the re-narration takes them too (next
  entry).
- **An X-Card on an upgraded beat takes what the upgrade struck** [issue #347
  D2; the maintainer's option A]: a Burn Momentum or Improve Result
  re-narration names the resolution it upgraded (`upgradeOf`, from the
  upgraded resolution — burnMomentum.js / improveResult.js), and a trigger
  vignette its reversal struck names it too (`supersededFor`, also carried by
  a refused rewind's Retry step). The X-Card's pick adds to the beat it
  removes the `burnSuperseded` narrations of that resolution — the move's
  first narration and the rewound clocks' vignettes (narrator.js
  `withStruckByUpgrade`) — so their World Journal and tier records are undone
  by narration id like the beat's own, and their truths, retracted as
  superseded, become the X-Card's (`retractNarrations` relabels them): blocked
  for the session, where a superseded truth was no bar to a later narration
  restating it. The struck cards are flagged `xCarded` too. An X-Card on a
  later beat leaves them alone. *Rejected:* D8 standing for the X-Card
  (option B) — the table removed the beat it saw, the struck version
  included, and the struck narration's lore and NPC details went on reaching
  every later prompt.
  **Update (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END):** also
  after the scene has ended. A scene end keeps the scene's superseded
  narration truths, unnamed, on `sessionRetractions.narrated` beside its live
  ones (retractions.js `rememberNarratedTruths`); it dropped them, so an
  X-Card after the scene ended undid the struck narration's capture but
  blocked none of its facts. Kept there, a superseded truth still blocks
  nothing until an X-Card takes its narration.
- **Push-to-talk into a drafted chat box adds and waits** [D9; option B]: the
  transcript goes after the draft and the player presses Enter; an empty box
  auto-submits. *Rejected:* append and submit (option A) — it guesses whether
  the speech continues or replaces the draft, and a submission is a move roll
  that cannot be undone.
- **A keyed canonical GM files no relayed audio clip** [D10; option A]: it
  makes its own, so `audio.cache.write` is filed only at a keyless GM's
  table, the case D11 kept the relay for — where the GM still cannot check
  bytes filed under a real card's key in an empty slot (the accepted
  limitation). *Rejected:* recording that any user can pre-fill a card's
  audio (option B).

**Reason:** each row's probe failed at the audited commit (D1–D10 assert the
recommended option; D6's and D9's were rewritten to the option taken); the
tests that replace them fail with the change taken out
(`docs/testing/fix-sensitivity.md`).

---

## Issue #331 audit: a refusable write changes a copy, a relayed value is what the UI sends, one write's refusal is its own, the help says who may (2026-11)

**Decision:** (issue #331, part 2 of the ninth audit — X15–X61, and X62–X66
found while building #330. The maintainer asked for the issue to be
addressed on 2026-11-05. Each finding's ID in brackets.)
- **A refusable write changes a copy, and only the canonical GM makes it**
  [X25, X26, X35, X38, X40, X42]: the campaign recap cache, the spotlight
  pointer, a new entity's id, the inciting premise, the load-time mint and a
  telemetry page's entries are written onto a copy of the stored value
  (`game.settings.get` and `getFlag` return the cached object by reference,
  rules/foundry-api.md) and land on the caller's object only once the world
  has them.
- **A relayed value is bounded to what the UI sends** [X49, X51, X53]
  (rules/reachability.md §8, the W81 rule): an oracle narration relay names
  its posted card, and the GM narrates what that card carries; a synthesis
  request is served only for a narrator card's line in the world's voices; a
  relayed error-log entry is filed only as `formatEntry` writes one.
  *Rejected (X53):* re-escaping a non-conforming entry — no honest client
  sends one, and a refusal keeps the log to what the UI wrote.
- **One write's refusal is its own** [X52]: the crew-shared supply sync goes
  on to the other PCs and to a queued change, and the GM is told whose
  supply to set. The shared-vow and legacy-sheet syncs do the same (known-
  issues SUPPLY-SYNC-TWINS, found while fixing it); a legacy track the world
  refused is mirrored to the sheets as the world kept it — the sheet is the
  mirror, the shared track canonical (rules/reachability.md §5).
- **A card bound to a move leaves with the move's result** [X15]; **a roll
  that is not made takes nothing** [X17, X37]; **a refused move record goes
  to the GMs' failure card with a Retry** [X18].
- **A player's click on a combat tracker badge relays their own PC's
  position, and every other badge says whose it is** [X22] — the Progress
  Tracks panel's toggle, through the GM. *Rejected:* relaying the range
  badge — it is advisory and the GM's to set ("Range badges are advisory").
- **An asset substitutes a stat only where its text says so for the move
  being made** [X23], read per sentence.
- **The count-only "active connections" block is retired** [X29] — the
  audit's second option (its refuter's): the roster and CHARACTER STATE name
  every connection, a lost one apart. *Rejected:* counting active records in
  the prompt builder, which would read actors.
- **A strike remembers the lore it retracted, and lifting it restores
  exactly that** [X31] — the refuter's preferred fix; an X-Card's retraction
  is never undone by it.
- **Finalise on a ship whose Notes hold text only stamps it** [X34].
  *Rejected:* the audit's `starshipHasSeedDetail` predicate — it also
  matches a ship with a rolled type and empty Notes, whose first Finalise
  must still write its introduction (issue #311 P07).
- **A planet is named from its class's Sample Names** [X48]: the eleven
  d20 tables are kept on the d100 at five numbers a name, so every oracle
  table keeps the d100 domain the integrity test holds.
- **The help marks a GM-only command in its row or its section's heading**
  [X58, X59]. The Pacing and World Journal rows are left as they are: their
  headings read "(GM only)" and every command in them is the GM's, as the
  Recap, Lore, Debug and Migration sections are marked. The Location &
  Sector heading lost its "(GM only)" — `!sector list` is anyone's — so its
  GM-only rows say so in the row. *Rejected:* marking every row of an
  all-GM section, the audit's suggestion — its probe read rows alone.
- **A sheet roll's miss offers what the pipeline's does** [X62]: the
  recommit (issue #330 D1), for the roller's vow Item or the connection the
  roller's bond Item names (issue #330 D5's lookup — a bond made by hand
  gets none).
- **A Continue a Legacy that names no track asks which** [X63] — the
  issue's first option. The move rolls every legacy track, so the card keeps
  a button per track, each claimed once on the GM (`legacy.pick`,
  `legacyRolled.<track>`). *Rejected:* a card that names no track and rolls
  nothing (the second option) — the player would type the move again for
  each track.
- **A session End a Session closed counts as begun** [X64], so a session
  ended before the stamp keeps its number. A typed `!end-session` on a
  session nobody began counts it too, as every session did before D12.
- **A session nobody began adds its summary to LAST SESSION, never
  replaces it** [X65]. The issue left it to the maintainer: keep the begun
  session's summary, then append the prep summary or drop it. Appended —
  D12's record carries the unbegun session's summary, and the same
  narration would be in the summary had the table begun play within four
  hours of the prep; it reads "Narrated between sessions, while no session
  was begun: …". *Not taken:* dropping it — one branch of `mintSession`, if
  the maintainer prefers.
- **A field nothing reads is retired, not kept** [X50, X55, X66]:
  `shipMapSceneId`, `computeSharedVowSyncUpdates`, a sector's `namePrefix` /
  `nameSuffix` (rules/reachability.md §1, §2).

**Reason:** the ninth audit's findings, each with a probe that failed before
its fix (X62–X66 traced by hand); the tests that replace them fail with the
fix taken out (`docs/testing/fix-sensitivity.md`).

---

## Issue #330 decisions: D1–D15 (2026-11)

**Decision:** (issue #330, part 3 of the ninth audit — the fifteen rows that
needed the maintainer. The maintainer asked for the issue to be addressed on
2026-11-04 and took the recommended option on every row. Each row's ID in
brackets.)
- **A vow's or a bond's miss offers the recommit as a click** [D1; option
  A]. Finish an Expedition's miss offered "🔁 Recommit" (claimed per card
  since issue #321 U20); Fulfill Your Vow's miss and Forge a Bond's — the
  same mechanic in the vendored text — were advisory, the GM clearing boxes
  and raising the rank by hand on the vow's copies, or on the connection's
  record and its bond Items. Each miss now posts a claimed offer:
  `performVowRecommit` rolls the challenge dice once and writes every open
  copy of the roller's vow (by its vowId) and its journal twin, the rank
  stepped once as the Item holds it (`setVowItemTrack`);
  `performBondRecommit` writes the record and mirrors it to the bond Items.
  The roller's player or a GM may press it (gmRelay `vow.recommit` /
  `bond.recommit`). *Rejected:* keeping both advisory (option B) — "Flow-
  audit soft spots" implements every gap a faithful mechanic exists for, and
  the expedition's already holds the rule.
- **A card's own follow-up closes its upgrades, and the card says so first**
  [D2; option B]. A weak Face Danger's card offers 🔥 Burn Momentum and ⚑
  Mark Progress on Vow (🤝 / 🔗 too); taking ⚑ first posts a forced Reach a
  Milestone as the roller, and issue #326 D4 then closes the card's burn — by
  its letter, since the follow-up is the roller's next move, but with no
  hint. D4 stands: a burn after the milestone card would re-narrate the Face
  Danger as the latest beat. A card that offers a burn or an improvement now
  says "Burn momentum or improve the result first — a follow-up below is
  your next move, and closes them" beside its follow-ups and in their
  titles; the help's Troubleshooting entry says the same. *Rejected:*
  exempting a no-roll follow-up posted from the card itself (option A) —
  the smallest deviation from D4, but still an upgrade applied after other
  effects of the move.
- **A harm or stress step at 0 owes the resist roll** [D3; option A]. Every
  Pay the Price "You are harmed / stressed" route ran the Endure Harm /
  Stress executor as a miss ("Pay the Price always implies a miss context"),
  and a weak hit's pick ran it without: at 0 the step offered the resist
  roll's miss escalation (the mark-or-table choice, issue #329 X03) or
  marked wounded / shaken — with no Endure Harm ever rolled. The vendored
  move puts both on the resist roll: "Then, if your health is 0 … roll
  +health or +iron … On a miss … If your health is 0, you must also mark
  wounded or permanently harmed, or roll on the table". The step now takes
  only the meter and the overflow; at 0 it posts a card whose press rolls
  Endure Harm (Endure Stress) as the PC through the pipeline
  (`resistRollPrompt`, the choice card's `resist` call), bound to the move
  its price came from, so an upgrade retires it. The choice is offered only
  for that roll's own miss (`resistMiss` — persistResolution sets it on
  Endure Harm / Stress's miss card). The optional resist above 0 ("or you
  choose to resist the harm") stays a typed move. *Rejected:* keeping the
  approximation (option B) — it skipped a roll the move makes mandatory and
  could land Face Death on a Face Danger miss.
- **A Heal that mends your own wounds rolls the lower of iron and wits**
  [D4; option A]. The vendored Heal's self-mend reads "Roll +iron or +wits,
  whichever is lower" (`"Method": "Lowest"`); the pipeline had only
  PICK_HIGHER_OF and could not tell a self-mend from "Receive treatment from
  someone (not an ally): Roll +iron", so it rolled whichever stat the
  interpreter named — +3 where the rule says +1. The interpreter now names
  the situation (`healSituation`: self / treated / companion / ally — a
  forced Heal reads it with its stat), and statEnrichment's PICK_LOWER_OF
  rolls a self-mend's lower stat, the card reading "+wits (1), lower of iron
  / wits" (`statRule`). An asset's stat substitution stands. *Rejected:*
  accepting the approximation (option B) — the vendored data carries the
  rule, and the interpreter already reads the narration.
- **A sheet Forge a Bond forges the connection its bond Item names, or
  nobody** [D5; option A]. The native consequence hook resolved the roll's
  Item name through the develop ladder's full fallback, so a bond the player
  made by hand on the Connections tab (no module record) forged the crew's
  one connection — bonded, history, Bonds legacy, a forge card for a roll
  about someone else. It now resolves the roller's bond Item by the record
  id it carries (`flags[MODULE].connectionId` — a renamed connection's Item
  still finds it), else the one active connection of exactly that name, and
  otherwise forges nothing (`findSheetBondConnection`). The decided Forge a
  Bond fallback (issue #301 B01) stays the pipeline's, whose target the
  narration may only half name. *Rejected:* keeping the fallback on the
  native path with `unbonded: true` (option B) — a sheet roll names its Item
  exactly, so a fallback can only reach the wrong connection.
- **Overcome Destruction and Continue a Legacy score the shared legacy
  tracks** [D6; option A]. Both were progress moves with no tick source
  ("roll against the player's own legacy tracks, which the module doesn't
  store"), so every roll scored 0 — a certain miss. The shared tracks are
  stored (`campaignState.legacyTracks`) and mirrored to every sheet since
  issue #326 D3: Overcome Destruction now scores the bonds track ("compare to
  the progress on your bonds legacy track") and Continue a Legacy the track
  its target names (the interpreter names it), each at 10 progress once the
  track has been cleared ("resolve the outcome as if at 10 progress"). A
  Continue a Legacy naming no track still scores 0, with a console warning.
  *Rejected:* keeping the no-op and saying so on the card (option B) — the
  data the rule needs is the module's own.
- **Forsake Your Vow's Endure Stress is sized in the fiction** [D7; option
  A]. Its cost option was "Endure Stress (-2)", but the vendored move says
  only "You are demoralized or dispirited: Endure Stress" — the amount is the
  suffer move's own minor / serious / major (-1 / -2 / -3). The option now
  carries `amountPick: [1, 2, 3]` and no amount: picking it posts a "Minor
  stress (-1) / Serious stress (-2) / Major stress (-3)" card
  (`needs-amount`, `amountPickPrompt`), as an "any" cost posts its picker.
  *Rejected:* keeping -2 as a house default (option B) — the book leaves the
  size to the fiction, and the card already asks the player for the costs.
- **The spotlight nudge never names the PC who just acted** [D8; option A].
  `selectSpotlight` picked the PC after the per-scene pointer by actor-id
  order and was never told whose beat it was: the first beat of a scene, or
  a beat made out of turn, could end "By the rotation, Kira is next" on
  Kira's own beat. The narration's CHARACTER (`actingActorId`) is now
  skipped when another candidate is in the scene, and the pointer records
  whom it named, so it moves on past both. The rest of "Multiplayer
  spotlight is implied by narration" stands — a per-scene round-robin by
  actor id, a nudge, never a gate. *Rejected:* keeping the pure pointer and
  documenting that the roller may be named (option B) — the nudge exists to
  move the spotlight toward quieter players.
- **A GM's lore ruling stands until a GM changes it** [D9; option A]. The
  detection pass re-recorded a title the GM had ruled a rumour as
  `confirmed: true, narratorAsserted: true` — only a stored `retracted` mark
  survived a re-record — so the narrator mentioning it again made it canon
  again; the panel's Dismiss was overturned the same way. A narrator write
  (`recordLoreDiscovery` with `narratorAsserted: true`; the capture's "lore
  confirmed" transition, `promoteLoreToConfirmed(…, { byNarrator: true })`)
  now leaves an entry the GM ruled — not canon, not the narrator's, not
  struck — as the GM left it; `!journal lore "<title>" confirmed` or the
  panel's Confirm promotes it. "World lore auto-confirms" still holds for
  everything the GM has not ruled. *Rejected:* letting the narrator's
  re-assertion re-confirm it (option B) — a ruling the narrator overturns by
  repeating itself is not a ruling ("nothing auto-corrects — the GM stays
  the authority").
- **`!sever` marks the bond Items lost** [D10; option A with B's reader
  change]. `loseConnection` wrote the record's `active: false` only; the
  PCs' bond Items — its write-through mirror for ticks and rank — kept
  "Vex (dangerous, 3/10)" a live bond in CHARACTER STATE. The loss is now
  written through to every bond Item `bondItemsFor` finds as
  `flags[MODULE].lost` (`setBondItemLost`, rules/reachability.md §5), and
  `readConnections` reports it, so CHARACTER STATE lists a severed bond
  under "Connections lost". A module flag, not the vendor's
  `system.completed`, which the sheet renders as a forged bond. The record
  name selectors already skip an inactive connection. *Rejected:* deleting
  the Items — the sheet's Connections tab keeps them as history (a GM may
  delete one there); the vendor tab cannot read the flag, so it still lists
  the Item.
- **A relayed audio clip is filed only for a real card, never over a cached
  one** [D11; option A]. A keyed client that is not the canonical GM relays
  its synthesis as `audio.cache.write { hash, b64 }`; the GM wrote it as
  `<hash>.mp3` unchecked, and `FilePicker.upload` overwrites — a forged write
  under a real narration's hash replaced the audio every client plays for
  that card (the risk issue #326 W81 closed for `audio.synth.request` only).
  The GM cannot check bytes against a text's hash, so it now files a relayed
  clip only under the clip key of a segment of a narrator card in chat under
  the world's voice, model and speed (an X-carded card keys nothing), and
  never over a clip that is cached or that it is making. *Rejected:*
  retiring the relay (option B) — it serves a keyed player at a keyless
  GM's table, whose clip the GM then serves to the keyless players.
- **The session number counts the sessions a table began** [D12; option A,
  narrowed]. Every world load after End a Session (or four idle hours) mints
  a session, and `mintSession` always bumped `sessionNumber`: a GM who opened
  the world only to prepare burned a number, so Saturday's play read
  "Session #5" after Tuesday's session 3 on the panel, the Session Log,
  `!recap session N` and every narrator card. A closing session nobody began
  (no `sessionStartedId` stamp, its gate shut, and not closed by End a
  Session — a session ended before the stamp existed counts as begun, issue
  #331 X64) now hands its number on to the next; the id still changes, and its summary is carried: added to the
  summary of the session before it, which stays LAST SESSION under its own
  number (it replaced that summary, so the narrator lost what the table last
  played — issue #331 X65), or, when there is none, carried as LAST SESSION
  with no number of its own. The Campaign Start's Begin Session stamps
  `sessionStartedId` too — it did not, so its session would have read as
  unbegun — and an open gate counts as begun for a world from before the
  stamp (issue #300 F11). The load-time mint itself stands ("A
  session ends at End Session or after four idle hours"). *Rejected:*
  keeping the mint count and documenting it (option B) — the table reads
  the number as its own count of sessions played.
- **`!oracle` follows a cross-reference row in place** [D13; option A]. A
  row whose word is a heading the rulebook links onward — Space Sighting's
  "Stellar Object", "Planet", "Settlement", "Starship", "Derelict",
  "Precursor Vault", "Creature"; Starship Type's "Multipurpose" and "Fleet";
  Fleet's "Starship Mission"; Initial Contact's "Derelict" — is rolled on the
  table its `ref` names, under the heading ("Stellar Object: Red star"), as
  issue #321 U68 did for Ultra-scale alone. The unread `isRef` /
  `refTableId` return fields are retired. The Sector Creator's own roller
  (`rollTableResult`) is unchanged: a settlement's Initial Contact
  "Derelict" says the settlement itself is the derelict. *Rejected:* keeping
  the heading and naming the next table on the card (option B) — the data
  names the table, and the roller already follows Ultra-scale the same way.
- **A new sector never repeats a stored sector's name** [D14; option B]. Two
  sectors of one rolled name shared their Actor, NPC and Journal folders
  (keyed by name) and `!sector <name>` reached only the older one.
  `generateSectorName` rolls again while the name is a stored sector's
  (case-blind) and numbers the last roll ("Vega Reach II") after fifty taken
  pairs. *Rejected:* keying the folders by sector id and disambiguating
  `!sector` (option A) — a sector name is rolled, never typed, so one check
  where it is minted makes every name-keyed reader right at once. A GM's
  rename of a Scene or record to another sector's name is the GM's own call.
- **Envision Inciting Incident is anyone's, on the panel as by command**
  [D15; option A]. `!incite` is RUN_ON.CLAUDE with no role check (see "Chat
  commands run once"), so a player could type it, while the Session panel
  disabled its button for every non-GM — the shape issue #326 W85 fixed for
  Begin / End. A player's press now posts their
  `!incite` line, which the router runs where a Claude key lives, exactly
  as typing it does; a GM's press runs it on the GM's client as before
  (*superseded by issue #345 D6: a GM's press posts the `!incite` line too —
  see "The Session panel's ✦ Envision Inciting Incident is `!incite` for a
  GM too"*). The help's Toolbar row drops "(GM)". *Rejected:* gating `!incite` to GMs like
  `!at` (option B) — the inciting incident founds the crew's shared vow, and
  the command was already open to players.

**Reason:** each row's probe failed at the audited commit; the tests that
replace them fail with the change taken out
(`docs/testing/fix-sensitivity.md`).

## Issue #329 audit: what a narration wrote leaves with it, the scene as it stands, the player's choice at 0, the card's own roller, the sheet's notes (2026-11)

**Decision:** (issue #329, part 1 of the ninth audit — X01–X14. The
maintainer asked for the issue to be addressed on 2026-11-04. Each finding's
ID in brackets.)
- **Everything a narration's capture records carries its narration id**
  [X01]. The detection and tier passes stamp the narration's id on every
  World Journal entry (an entry they rewrite keeps the versions before),
  Session Log beat and tier detail; the X-Card undoes them by that id
  (`retractNarrationCapture`) — restored, retracted (lore) or deleted (a
  threat, faction or place it made). A new capture writer takes the id from
  its caller (rules/narrator-memory.md 6b). The transitions it applies to
  entries it did not make (a threat resolved or escalated, lore confirmed, a
  faction's attitude) are stamped and undone the same way, the faction's
  stance on its record included unless it changed since (known-issues
  XCARD-CAPTURE-TRANSITIONS, found while fixing X01).
- **The consistency check audits the ledger the persist leaves in the store**
  [X02], not the caller's snapshot — the W05 rule for the prompt, applied to
  the audit.
- **At 0 health or spirit on a miss the player chooses** [X03]: mark the
  impact, mark the lasting one, or roll the table — a follow-up card, never an
  impact and the table both. *Rejected:* marking when unmarked and rolling
  otherwise (the audit's fallback) — the book gives the player the choice.
  Since issue #330 D3 the choice is the resist roll's own miss's: a harm
  step at 0 owes that roll instead.
- **An ability adds what its text gives the move being made** [X04]: a move
  named only as a cost keys nothing; on the ability's own trigger, an outcome
  sentence's add is for later moves (#325 W12's rule, extended).
- **A card's forced follow-up is the card's roller's move** [X05], whoever
  presses it (decisions "Multiplayer attribution"); a threshold card takes one
  choice, claimed on the GM [X06]; a claimed card's forced move is held, not
  dropped, before a session begins as while the lock is held [X14].
- **A claim is released when its effect does not land** [X07]; a pipeline
  releases only its own claim of the move lock [X08].
- **A narration or a command works on a copy of the stored campaignState**
  [X09, X10, X11] — the narrator and the scene lifecycle change the object
  they are handed (rules/foundry-api.md).
- **An NPC card's or ship's notes are its sheet's Notes tab** [X12] — see the
  section of that name.
- **No silent no-op on a player's action** [X13, X14]: a refused Begin a
  Session says the session was not started; the session gate whispers the
  author why nothing ran.

**Reason:** the ninth audit's findings, each with a probe that failed before
its fix; the tests that replace them fail with the fix taken out
(`docs/testing/fix-sensitivity.md`).

## Issue #326 audit: decisions D1–D8, and writes on copies, one emitter, checked relays (2026-11)

**Decision:** (issue #326, part 2 of the eighth audit. The maintainer asked
for the issue to be addressed on 2026-11-03 and decided D1–D8 that day, each
the recommended option. Each finding's ID in brackets.)
- **A refusable write changes a copy** [W51, W69]. A writer sets its change on
  a copy of the cached setting (or writes only its own fields onto the record
  as it then is), so a refused write leaves the GM's copy as it was —
  rules/foundry-api.md's cached-by-reference rule, at the nine sites the audit
  found; the commands say when the world did not take the write.
- **What a mark earns is paid once its save lands** [W52]. A legacy box's XP
  — since D3, the sheet mirror — is owed by the working copy it was marked on
  and paid after that copy's write (`deferLegacyXp`).
- **One emitter for world-creating work; one queue for a whole-array store**
  [W53, W54]. The ready-time creators and migrations gate on the canonical
  GM; every clock read-modify-write runs through one per-client queue.
- **A relayed payload is checked against what the UI could send** [W81]. The
  GM synthesises only a clip whose hash is its spec's key (rules/reachability.md
  §8); a keyed Player asks the GM for a cached clip before paying for it
  [W79], and a keyless canonical GM never relays to itself [W80].
- **A string mention is not a consumer** [W82]. The dead-code scan blanks
  string text except a whole-identifier string dispatch.
- **The module's text is hard-coded English** [W84]. `lang/en.json` is kept
  declared and empty; a key added there must be read.
- **A vow deepens its connection once** [D1; maintainer]. A vow sworn for a
  connection was deepened twice: by the won-fight card's 🤝 Deepen (the vow's
  rank marks) and again by its fulfilment's payoff (the same marks). One
  reward: whichever lands first pays and is recorded on the vow's payoff
  ledger (`fulfilPayoff.deepen`, every copy); the other — the fulfilment, its
  Retry, or a press after the fulfilment — finds it there and deepens
  nothing. A second vow for the same connection deepens it on its own.
  *Rejected:* two rewards (a won fight and the fulfilment each deepening) —
  #241 frames the fulfilment's deepen as *the* vow→connection reward and the
  card as its one-click prompt.
- **The shared legacy tracks are mirrored to every sheet** [D3; maintainer].
  The ticks lived in `campaignState.legacyTracks` and the XP in each PC's
  `system.xp`, but the Starforged sheet shows neither: its Legacies tab draws
  each legacy from `system.legacies.<track>` (ticks ever marked) and derives
  the XP earned from it, and it has no `system.xp`. The shared track stays
  canonical and is written through to every PC's sheet after each saved mark
  (a mark that fills no box too); a sheet edit (the tab's ▸ / ◂) flows back
  the way the shared supply does — the canonical GM sets the shared track to
  it and mirrors it to the other PCs; at ready the canonical GM backfills the
  sheets, raising the shared track to any sheet further along so no mark is
  lost. Each PC's XP spent stays their own. `system.xp` is no longer written
  (`awardXP` deleted); the earned-XP card stays and points at the Legacies
  tab. *Rejected:* a module panel showing the legacy and XP — the sheet is
  where XP is spent, so a second display would drift from it.
  *Update (issue #347 AB07):* a sheet edit moves the shared track by what it
  changed on that sheet, not to the sheet's value. The vendor ▸ / ◂ writes
  the sheet's own value ± 1, so a sheet behind the crew's track — a PC made
  since the GM's load, an imported export, a refused mirror write — set the
  crew's 24 ticks to its own 1 on every sheet, for good. The client that
  makes the edit stamps the sheet's values before it into the update's
  options (`preUpdateActor`); an edit without the stamp still sets the track
  to its value. A PC created mid-session is brought to the shared tracks at
  once (the ready backfill, run at its creation).
- **An upgrade closes after the roller's next move** [D4; maintainer]. A
  move card's Burn Momentum / Improve Result stayed live until used or its
  choice was picked: an old card's 🔥 burned momentum at its current value,
  swapped the old outcome's effects in after the fact and re-narrated a past
  beat as the scene's latest — against "you must burn momentum before
  applying any other effects of the move". Once the same roller's next move
  has resolved (the pipeline, after its persist), their earlier cards' open
  upgrades are stamped `laterMove` — the buttons read "closed by a later
  move" — and the GM handlers refuse an upgrade on a card a later move by its
  roller follows, stamped or not. Another character's move closes nothing.
  *Rejected:* accepting late burns as a feature.
- **A sector's passages are the book's** [D5; maintainer]. The Sector
  Creator drew one passage per settlement (Terminus 4, Outlands 3, Expanse
  2) so that one would run off the map edge — commit 160bc9b, no decision
  recorded. The rulebook's region table gives one fewer: 4 / 3, 3 / 2,
  2 / 1. The book's counts are back, the edge passage one of them: each
  passage links a settlement to the next and the last leads off the map
  edge (an Expanse's one passage is its edge passage). *Rejected:* keeping
  the extra edge passage.
- **A scene challenge ends with Finish the Scene** [D6; maintainer]. Its ⬡
  Progress Roll was a bespoke display card: no price on a weak hit or miss,
  no Pay the Price routed, no match flagged, and the challenge stayed open
  with its clock advancing on every later Pay the Price. Finish the Scene
  (Starforged p. 241) is now a progress move through the pipeline, like
  Finish an Expedition (`finish_the_scene`, interpreter-typable too):
  narrated, scored from the challenge's own track, a weak hit or miss routes
  Pay the Price, a match flagged on the card, and every outcome ends the
  challenge — its clock retired before the price is routed, then the track
  completed. *Rejected:* a card that only asks for the price and ends the
  challenge — the move belongs in the pipeline like its two siblings.
- **No `closeWorld` hook** [D7; maintainer]. `Hooks.once("closeWorld")`
  ended the active scene and stamped `lastSessionTimestamp` on world close,
  but Foundry documents no such hook (the API reference listed it from a
  community source) and nothing exercised it — dead code, and a stale
  whole-state write had it ever run (CLOSEWORLD-STALE-WRITE, now moot). The
  handler and its mentions are deleted; a scene left open at a reload closes
  at End Session or the idle re-mint, which rules/narrator-memory.md §6
  already treats as intended.
- **A PC-less player is not rolled as another player's character** [D8;
  maintainer]. `resolveSpeakerActorId` gives no PC to a player who owns
  none at a table of two or more (issue #321 U23), but the pipeline fell
  back to the first PC anyway — the move rolled with that PC's stats, its
  meters landed on it and its card named it the roller. The pipeline now
  follows U23: a GM's narration, or any at a one-PC table, still falls back
  to the first PC; a PC-less player at a table of several is whispered that
  they need a character (`noCharacterNotice`), and nothing is rolled — the
  check runs before the move lock and the interpreter's Claude call.
  Narration that is not a move is not refused. `persistResolution`'s
  first-PC fallback stays for its other callers (a GM's, a one-PC table's).
- **A scene truth is filed where it was asserted** [D2; maintainer]. Scene
  end filed every scene-subject truth on the frame's location at the end of
  the scene, but a scene spans travel (it ends only at `!scene end`, End a
  Session and the re-mint): "the bar is called the Rusty
  Lantern", recorded at Bleakhold, landed on Ironway's card. Each truth now
  records the frame's location when it is asserted (`sceneLocation`: the
  asserting narration's own frame, else the frame in place; a Replace keeps
  its original's), and scene end files it on the recorded place that names —
  or archives it as lore titled with that place. A truth with no stamp
  (recorded before this, or asserted before any frame stood) falls back to
  the end-of-scene place. *Rejected:* filing travelled-past truths as lore —
  it loses the place a fact belongs to whenever the scene moved at all.

---

## Issue #325 audit: an X-Card reaches every store its beat wrote, a held press is rolled later, the system's numbers read as names, effects land on whom the move is for (2026-11)

**Decision:** (issue #325, part 1 of the eighth audit. The maintainer asked
for the issue to be addressed on 2026-11-03 and decided W19 that day. Each
finding's ID in brackets.)
- **A typed move rolls a stat it lists** [W19; maintainer] — except under the
  Chaotic dial: "A typed move rolls a stat it lists — except under the
  Chaotic dial", below.
- **An X-Card reaches every store the removed beat wrote** [W05–W07]. A
  narration reads the scene ledgers (truths, state, frame, retractions) from
  the live store when it is written, as safety and oracles have since issue
  #321 U08; the emptied rolling summary is stamped newer than any working
  copy in flight, and a regeneration that spans an X-Card play is discarded;
  the ship position a narration writes carries its `narrationId`, and the
  X-Card restores the position before it.
- **A press that meets the move lock is held, not dropped** [W02]. A claimed
  one-shot button's forced move (`deferWhileBusy`) waits on the canonical GM
  and is replayed when the lock frees; a typed line that meets the lock is
  still refused. The hold is in memory (FORCED-MOVE-HOLD-RELOAD).
  *Update (issue #347 AB06):* a held move follows the canonical GM — the GM
  holding it hands it over (`forcedMove.hold`) when another GM becomes
  canonical, which rolls it when the lock frees; it stopped draining and was
  rolled out of the blue once the first GM was canonical again. And a claimed
  button's forced move the pipeline does not roll — its confirm closed, the
  lock busy for a move not held, its start refused, a failure before its dice
  — hands the card its press back (`sourceCard`, released while the card
  still holds the press's value; a resist card, and the ordinary reward cards
  a waypoint alternative retired, put back live) and whispers the roller's
  players and the GMs ("Not rolled" — the issue #348 PT11 path, merged into
  one); the inciting ⚔, unclaimed (Y36), re-arms on its presser's client from
  that notice.
- **The system's numbers are read as names** [W01]: a progress Item's
  ChallengeRank number goes through `rankName` wherever a rank is read or
  paid.
- **A move's effects land on whom the move is for** [W04, W09, W10, W17,
  W18]. Heal's patient and Aid Your Ally's ally are resolved before the dice
  (whole-word names, as `enrichBondedDevelop` resolves a connection) and ride
  the move's targets; a paced card's Roll speaks as the PC who narrated; a
  player's `!ptp` suffer runs on the canonical GM for the typist; a bond's add
  is rolled with the move it belongs to.
- **Every shared button acts once, on the GM** [W11]: the issue #321 U20
  shape — relayed, the GM-authored card claimed before the move is posted —
  for Battle, the way-out moves, the Develop / Forge suggestions, the reward
  picks and Link. A Battle naming a finished fight is not rolled; a reward
  pick on a granted or lost reward is refused.
- **The move text, not a shortcut** [W12–W17]: an ability adds its clause for
  the move; "count a weak hit as a strong hit" improves only a weak hit; a
  resist miss at 0 overflows to momentum; "two suffer moves" are two picks; a
  loss while unprepared at 0 goes to another suffer move; Compel, Resupply,
  Aid Your Ally and Companion Takes a Hit follow their text.
- **A name matches as whole words in every selection ladder** [W30]
  (`wholeWordsFit`, either way); an irreversible `!sever` takes the exact
  name, else the one connection whose name holds the typed fragment — two
  fits sever nobody.
- **What the narration established wins** [W22, W31, W37]: the NPC card shows
  the recorded disposition; the seed keeps the narrated goal (on `goal`) and
  rolls no first look for a described NPC; the sector roster lists a lost
  connection apart, saying how it was lost.
- **A GM who leaves releases their own lock** [W25]: the lock records its
  claimant (`pendingMoveBy`); the canonical GM releases a departed GM's lock
  and whispers the GMs. *Update (issue #347 AB14):* the ready resets whisper
  the same card when they clear a lock — a sole GM's reload mid-move was
  reset in silence, its move's record and Burn / Improve never landing.
- **Short calls follow narration's thinking rule** [W27]:
  `narration/thinking.js` is the one rule, for narration and every short
  structured call on the narration model. (Since the 5.5 upgrade,
  `api-proxy.js` applies it to every call, the Haiku ones included.)
- **A save holds truths when one category does** [W35]; **a fact-continuity
  catch keeps its remedy** [W34] (Correct… in the World Journal panel, never
  the lore actions); **the Roll button is the move the hint invites, guarded
  like the nomination** [W36]; **a bold label is a label** [W33].

**Reason:** issue #325 reproduced each defect with a probe on `39331b4`;
each fix's regression tests fail with it taken out
(`docs/testing/fix-sensitivity.md`; W27 by injecting its defect). W05–W07
complete the X-Card's reach (rules/narrator-memory.md invariant 6: anything
a narration writes outside the ledgers carries its `narrationId` so the
X-Card can undo it, and a narration is built from the ledgers as they stand
in the store); W11 and W25 are the multiplayer family CLAUDE.md names
(single emitter, claims before effects, locks released).

**Rejected:**
- *Release the claim when the pipeline refuses the forced move* [W02] — the
  press is lost and the player must press again after a "move is already
  being resolved" notice; holding it rolls it as soon as it can be.
- *Pin the short structured calls to Haiku* [W27] — they run on the
  narration model the GM chose; turning thinking off where narration does
  fixes the cap without changing the model.
- *Strike the contradicted truth on Override* [W34] — a catch often carries
  no truth id, and a strike found by subject text could hit the wrong fact;
  the correction dialog lets the GM choose.
- *Expire the move lock by age* [W25] — a long narration would lose its lock
  mid-flight; the claimant's departure is the event that matters.

## Issue #322 audit: the rules text over fill-ins, the roller's own position and bonus, one truths store, numbers and paths the module checks (2026-11)

**Decision:** (issue #322, part 2 of the seventh audit. The maintainer asked
for the issue to be addressed on 2026-11-01 and decided V01–V04 that day;
V34 was decided in the issue. Each finding's ID in brackets.)
- **The four decisions** [V01–V04; maintainer], each recorded in its own
  section: a bonded Develop Your Relationship pays the move's text on both
  paths ("Develop Your Relationship bond legacy", below); the +1 on the next
  move is applied to the roller's next action roll ("The roller's +1 on the
  next move is applied automatically"); combat position is per character
  ("Combat position is per character"); a burn spends the pre-outcome
  momentum ("A burn spends the momentum from before the move").
- **One truths store, written through on every save** [V34; maintainer] —
  "Truths saved in the World Truths dialog reach the narrator".
- **The model's numbers are never the roll's** [V08]. The interpreter's
  `adds`, `statValue` and `progressTicks` are dropped at the parse: the sheet,
  the live tracks, the confirm dialog and the pending +1s supply every number;
  an unresolved progress move scores 0, as its warning says.
- **`!recap session N` names a session, and counts moves** [V05]. N resolves
  through the narrator cards' `sessionNumber` (else last session's summary),
  the recap reads the cards as the narrator does
  (`sessionNarratorCards(…, { forRecap })` keeps fallback and X-carded cards,
  whose moves happened, quoting neither), and "moves resolved" counts cards
  with a `moveId`.
- **The help's settings are reachable** [V06]: every setting the Settings
  Reference places in the Companion Settings panel has a row there, clamped on
  save; the Audio Cache Max setting is removed instead [V16], because Foundry
  v13's client FilePicker cannot delete a file, so no automatic trim is
  possible — a GM empties the world's `audio/` folder by hand.
- **Card text is escaped; names match as Unicode words** [V18, V19]. Narrator
  prose, paced prose and `@scene` text go into card HTML through
  `escapeHtml(stripMarkup(…))`; name matching uses `wholeWordPattern` (no
  letter, digit or underscore either side, `u` flag) everywhere relevance and
  the PC-name check match names. A scene frame names a PC by its full name or
  by a first or last name no other PC shares [V20].
- **A pacing override is the scene's** [V21]: `endScene` clears
  `pacing.sceneOverride`, as does `startScene` replacing an empty scene; an
  override set before any scene is the next scene's.
- **Narrator audio claims only what this client saw posted** [V15], and every
  Play is cancellable [V14]: auto-play takes a card stamped after this
  client's start (server time, a minute's margin); Stop bumps the card's load
  generation, and a segment loaded during a pause waits for Resume or Stop.
- **A clock's beat is its own narrator mode** [V23] (`clock_advance`, the
  interaction latitude); the oath scene's latitude is embellishment.
- **An upload's path is the server's** [V26]: `net/uploadResult.js`
  `uploadedPath` — the response's path, the built path only on a reported
  success, else no file; every upload site uses it.
- **Nothing is half-saved or deleted first** [V28, V29]: a custom oracle table
  with a line that does not read is refused, its lines listed; the connection
  migration saves its id swap before it deletes the old journals.
- **A journal-hosted faction's or creature's page body is a rendered mirror
  of its record** [V31], re-rendered on every record write, as the World
  Journal's pages are.
- **A shared vow's sync queues the newest change per field** [V32], as the
  shared supply's does: a pass writes only differing fields, marks its writes,
  and gives way to a newer change.
- **The Chronicle's type list is every type an entry can have** [V33] — the
  automatic writer's five and the hand-set three.

**Reason:** issue #322 reproduced each defect with a probe on `6455e01` or
traced it by hand; each fix's regression tests fail with it taken out
(`docs/testing/fix-sensitivity.md`). Rules/reachability.md §5 (one canonical
store, written through) decided V34's shape; §1 (nothing ships without a
consumer) covers V02, V11, V16 and V22.

**Rejected:**
- *A manual adds input on the confirm dialog* [V02] — it asks the player to
  remember a bonus the module already holds.
- *Keep the sweep and document that it never evicts* [V16] — it cost a
  full-tree scan per ten minutes of synthesis for nothing.
- *Save a custom table's readable lines and warn* [V28] — the die is the
  highest surviving row, so a dropped top row changes every roll.

**Trade-offs accepted:** the +1 on the next move reaches only pipeline rolls
[V02]; an old world keeps its unused stored Audio Cache Max value [V16]; a
custom truth reaches the narrator as its first paragraph [V34]; the items
found while fixing (`known-issues.md`, issue #322 section) stay open.

## Issue #321 audit: owned-field writes, an X-Card that forgets, panels and buttons through the GM, the roller's own character, oracles from the system's data (2026-10)

**Decision:** (issue #321, part 1 of the seventh audit. The maintainer asked
for the issue to be addressed on 2026-10-31 and decided U07 and U09 that day.
Each finding's ID in brackets.)
- **A long-running writer writes only what it owns, onto the store as it is
  then** [U06, U58]. `!lore` (`loreRecap`), `!truth` / `!state` and the
  correction dialog (their ledger field, through `persistSceneLedgerFields`,
  whose new `opts.onto` makes a further owned change — `markSummaryForRegen`,
  the inciting premise — in the same write), `!reveal-site` / `!clear-site`
  (`persistSiteFlag`) and the inciting incident re-read the store after their
  awaits. `loreRecap`, `xCardRedirect` and `xCardedNarrationIds` are
  store-owned in the move pipeline's merge. `startScene` adopts the store's
  active scene when its caller holds none, so a narration from an older
  snapshot continues the scene in progress. A handler never mutates the
  cached setting before its write lands: it writes a copy.
- **The X-Card forgets what it answered** [U07; maintainer: full exclusion].
  Every narration carries an id (`newNarrationId`) on its card
  (`narrationId`) and on the ledger entries its sidecar wrote. The pause write
  (`suppressScene` → `applyXCardToNarratorMemory`) takes "the narration on
  screen": the newest narrator card still in memory, plus the narrator cards
  of the same beat — posted after the last message someone sent, within two
  minutes of the newest; an earlier X-Card's card bounds the beat, so a second
  play removes nothing more. Its truths are retracted (`retractedBy: "xcard"`,
  never named under CORRECTED, re-assertion still blocked), its state
  removed and its frame with it — since issue #345 D3 the frame it replaced
  stands again ("The X-Card restores the scene frame its narration
  replaced"), the summary reset when it covered them, the cards flagged
  `xCarded` (out of the ring, the summary, the recap's prose and audio), and
  `xCardRedirect` set: the first narration after Resume renders "X-CARD —
  REDIRECT" without naming the beat, and `registerXCardRedirectHook` clears it
  once that narration posts. A failure in the forgetting never blocks the
  pause.
  **Update (issue #347 AB22):** "the narration on screen" is read from the
  chat as it was, not as it is: each client remembers the chat messages
  deleted since its page loaded, and the pick puts them back by time. A
  narration whose card a GM deleted is still the newest narration, and the
  X-Card removes it — its truths, state, frame and capture — never the kept
  beat before it, which the walk reached across the player's line. A deletion
  alone removes nothing: tidying chat (Clear Chat Log deletes every card)
  must not rewrite the story. *Rejected:* undoing a narration's capture when
  its card is deleted — for that reason. The record lives in the page: after
  a reload the pick is chat-only again.
  **Update (issue #347 residual DELETED-NARRATION-MEMORY-PAGE-ONLY):** the
  record survives a reload: the canonical GM keeps the newest twenty deleted
  messages the pick reads on campaignState (`deletedChatMessages`) —
  narration and X-Card cards with the flags the pick and the removal read,
  and the lines that end a beat, none with its text — and the pick reads them
  beside the page's record. A deleted card an X-Card removed is marked
  `xCarded` there, as a removed card in chat is.
- **The Private Channel is a narrator entry point** [U09; maintainer]. While
  the live `xCardActive` is set its narrator refuses on entry (and discards a
  reply the card overtook) and Publish refuses; the window says why.
- **Safety and recent oracles are read live at narration** [U08]
  (`buildNarratorExtras`: `extras.safety`, `extras.recentOracles`).
- **A player's world write goes to the canonical GM, and a once-only press is
  claimed on the GM-authored card** [U02, U05, U10, U20]. New GM_ACTIONS kinds:
  `progressTrack.edit` and `entity.edit` (one kind per panel with an `op`, as
  `chronicle.edit`; any user, values checked against what the panel offers),
  `privateChannel.createJournal` (the requester's own journal, the player its
  OWNER), `fulfilVow.pick` (the "Which vow?" card), `milestone.suggestion`
  and `expedition.recommit` (which retires that legacy socket relay). Track
  writes run one at a time per client, each on a fresh read (`writeTracks`)
  [U57].
- **Generation that costs the GM's key stays the GM's** [U33, U29, U36].
  Generate / Regenerate portrait is GM-only (a relay was rejected: the key, the
  stored image and the single regeneration are the GM's); with Auto-Seed NPC
  on, the seed hook owns a new card's portrait; an `@scene` answer's
  detection and tier passes run on the canonical GM only.
- **Claude calls run where a key lives** [U11, U04]. A sheet-rolled vow or
  bond is narrated by a keyed GM when one is connected, else by the roller,
  decided in the hook every client runs; a forced move with several stats
  reads its stat from a stat-only interpretation (`interpretMove`'s
  `expectedMoveSlug`) on the canonical GM's key, else keeps the first stat.
- **Effects follow the roller or the user's own character** [U23, U24, U02].
  `speaker.resolveUserActorId`: `User#character` when it is a PC, else a PC the
  user owns, else the first PC only for a GM or a single-PC world. The
  narration's PC rides to the draft card (`actorId`); a shared vow's target is
  a connection of every PC who swore it; an unnamed Fulfill Your Vow scores
  the roller's vow (a shared vow once, by `vowId`) or asks which.
- **A target is what was named, or nothing** [U14, U16, U48]. `!sever` matches
  strictly (`selectConnection(…, { strict: true })`); a Strike, Clash or
  Undertake with several open tracks asks which, and a track is created only
  when none is open (an expedition also for a newly named destination); a site
  named exactly, or linked, is that site or null, the active sector first.
- **A place is resolved by id when the caller knows it** [U52, U56, U37, U44,
  U13]. One path, `inferShipPositionFromEntityId`, serves the token drop and
  the Entities panel's "Set as current location" (which now moves the ship as
  `!at` does); connections are read through their host Actor id; the Sector
  Record's list is built from the map and each settlement's current Actor.
- **Ship position wording follows its source** [U53, U47, U54]. A token near a
  pin or auto-placed is `token_placement` ("near"); a new sector's token is a
  position statement only for a ship with no position; the drag pipeline runs
  only with Ship Positioning and Auto-Move on.
- **Oracle tables are transcribed from the vendored Dataforged data** [U63,
  U68]. `oracleTableFidelity.test.js` compares every built-in table roll for
  roll with `vendor/foundry-ironsworn/json-packs/starforged-oracles`; the
  name and callsign lists are not deliberate substitutes (one commit ever,
  headed as a transcription). Directives ("Roll three times", "… (roll
  twice)", Ultra-scale) are rolled out; `creature_ultra_scale` is registered.
- **A Pay the Price is rolled once per result** [U03, U17]; the narration is
  seeded with the card's roll. An Explore a Waypoint miss routes Pay the Price
  unless it is a match, whose Confront Chaos stays the player's choice.
- **The campaign's truths are its newest saved truths journal, found by the
  module's flag, never by name** [U65, U67]. Each newly saved system truths
  page re-points `worldTruthsJournalId`, and the Quickstart records
  `worldTruthsSet` / `worldTruthsJournalId` and finds its own journal by id or
  flag, so a GM's own "World Truths" journal is never written. Since issue
  #322 V34 the dialog's save is parsed into `worldTruths` too (below, "Truths
  saved in the World Truths dialog reach the narrator").
- **The players' ship is never an NPC ship** [U26]: the draft Confirm creates
  detected ships `npcShip: true`, and every lone-ship fallback skips them
  (`isLoneShipCandidate`). The marker is set at the Confirm, not in
  `createShip`, which the migrator also uses for the players' own ship.

**Reason:** issue #321 reproduced each defect with a probe on `6455e01`; every
#321 probe failed on `15f157d`, and each fix's regression tests fail with it
taken out (`docs/testing/fix-sensitivity.md`). Rules/reachability.md §9 (no
snapshot written back across an await) and §8 (relay a GM-gated write) were
the repo's own rules at most of the sites; the X-Card decision record already
said "every narrator entry point stands down".

**Rejected:**
- *Redirect only, or exclusion without retracting the facts* [U07] — the
  maintainer chose the full exclusion: a ledger fact or summary line the
  removed narration wrote would bring the beat back.
- *Leave the Private Channel out of the pause* [U09] — Publish posts canon
  narrator cards that the main narrator remembers.
- *Relay portrait generation* [U33] — it would spend the GM's art budget and
  single regeneration on any player's click, and fail silently at a keyless
  GM.
- *Relay the `@scene` capture* [U36] — the keyed client would run the Haiku
  half and a new kind apply its writes; gated like `scheduleNarrationCapture`
  instead.
- *Salvage a cut-off detection reply* [U15] — needs a JSON-repair parser; the
  cap is raised to 1500 and an unreadable reply warns and tells the GM.
- *Merge the role titles into `HONORIFIC_PREFIXES`* [U30] — it would widen the
  name index's noise words and make the relevance resolver depend on
  connection.js at load.
- *Move the token on a hit with Auto-Move off* [U54] — the map and the
  narrator would disagree.
- *A relay for the native-roll narration* [U11] — every client runs the hook
  and reaches the same answer; a relay adds a round trip and a kind.

**Trade-offs accepted:** a forced move with several stats costs one Haiku call
[U04]; a player's panel edit needs a GM online [U05]; the track write queue
has no timeout, as the Chronicle's has none [U57]; at a keyless-GM table an
`@scene` answer's world detail is not captured [U36]; existing Actors with the
old broken starship image are not migrated [U31]; the items found while
fixing (`known-issues.md`, issue #321 section) stay open.

## Issue #316 audit: the sheet owns the momentum bases; a legacy track clears; a scene challenge ends with its clock; a start effect is recoverable; a move rolls by its data; a matched waypoint has one reward (2026-10)

**Decision:** (issue #316. The maintainer asked for the issue to be addressed
on 2026-10-31. Each finding's ID in brackets.)
- **The momentum bases are the sheet's** [T01]. `system.momentum.max` /
  `resetValue` are the base values foundry-ironsworn's `momentumMax` /
  `momentumReset` getters deduct the impacts from. The module reads the
  effective bounds (`actorBridge.momentumBounds`: the getters, else the
  vendor's formula over the sheet's bases) for the meter clamp, the snapshot
  and the burn preview, and never writes the bases;
  `recalculateMomentumBounds` only clamps momentum to the new maximum, with
  no write when it is already within it.
- **A legacy track clears at its tenth box** [T02] (`moves/legacyTracks.js`).
  The record is `{ ticks, cleared, cycles }`: the ticks of the current cycle,
  the cleared cycles counted, `cleared` written through for its readers. A
  mark pays each box at the rate of the cycle it filled in — 2 XP, then 1
  once cleared — several boxes and more than one clear in one mark included;
  two copies of a track merge by progress (`cycles × 40 + ticks`), never by
  raw ticks. `addLegacyTicks` stays the one writer and returns
  `{ boxes, xp, cleared }`; the XP note says when the track cleared.
- **A scene challenge's clock ends with the challenge** [T03]. Completion
  retires the paired clock (`clocks.retireClock` — `active: false`, kept and
  shown as retired; every automatic advance skips an inactive clock);
  removal removes it (`removeClock`, which `!clock remove` and the panel's ✕
  share). Both run before the track write and are idempotent, so a refused
  clock write changes nothing and the press is the retry.
- **A session's start effects are stamped once; a failed one is a step**
  [T04]. `sessionStartedId` still blocks a second Begin. A campaign clock
  advance the world refused keeps its roll (`saved: false`, the fill rolled
  to, on the result) and goes on the GMs' payoff failure card as a `clocks`
  step (source `sessionClocks`), whose Retry saves each clock to at least its
  rolled fill (`applyClockAdvances`) — nothing is rolled again, nothing is
  advanced twice after a GM moved it by hand. The already-begun note names a
  clock still owed.
- **A move resolves by its data** [T05]. `schemas.js moveRollKind` reads
  MOVES into "action" (a stat list), "progress" (`progressMove`) or "none"
  (neither): the one classification the resolver, Take a Break's add
  (`isActionRollMove`), the card, the dice animation and the Burn / Improve
  offers read. A "none" resolution draws no dice and has `outcome: null`
  ("No roll"); its consequences apply as written. A stat the interpreter
  names on a no-roll move is ignored; a bonded Develop Your Relationship,
  the one no-stat move that rolls, is marked `rollKind: "action"` by its
  enrichment.
- **A matched waypoint has one reward, claimed on its card** [T06].
  `waypointRewardClaimed` ("alternative" | "ordinary") lives on the
  GM-authored move card: written by the relay handler (gmRelay
  `waypoint.oracle` → `cardActions.applyWaypointOraclePick`) when the
  alternative is taken, and by the ordinary choice card's pick
  (`resultUpgrade.closeUpgradesForChoice`). The move card carries the roller
  (`actorId`), who alone — or a GM — may take the alternative, posted as
  that PC; taking it retires the pending ordinary choice card
  (`retireOutcomeChoiceCards`). The card is claimed before the post; a post
  that fails releases the claim.

**Reason:** issue #316 reproduced each defect (eight probes with their
controls) on `40cabee`, and again on `6455e01` (the merge of PR #319); after
the fixes the six defect probes fail — their assertions pin the broken
behaviour — and the two controls pass, and each fix's tests fail with it
taken out (`docs/testing/fix-sensitivity.md`). The rules: Earn Experience
pays 2 XP a box and 1 once the track is cleared; a scene challenge ends when
its track or its clock fills; Make a Discovery has no action roll; Explore a
Waypoint's match offers its discovery "instead" of the ordinary result.

**Rejected:**
- *Repair drifted bases on every Actor at load* [T01] — nothing
  distinguishes a base the write-back lowered from one a GM set, and the
  issue asked for the bases to be preserved, not rewritten. Recorded as
  MOMENTUM-BASE-DRIFTED for the maintainer's call.
- *Keep `{ ticks, cleared }` and let the merge prefer `cleared`* [T02] — a
  second clear would compare a cleared 38 against a cleared 2 by ticks
  again; counting the cycles makes progress monotonic.
- *Remove the clock on completion too* [T03] — a completed challenge is kept
  for the record, and its clock with it, retired; removal is the GM saying
  the whole thing goes.
- *Let a second Begin retry the clock effect* [T04] — the stamp exists so the
  momentum and the opening scene never repeat; the failed effect is retried
  on its own, as a PC's session momentum already is (issue #311 P08).
- *A `noRoll: true` flag on each MOVES entry* [T05] — the data already says
  it (no stat, not a progress move); a second field would drift from the
  first.
- *Claim the alternative on the clicking client* [T06] — the move card is
  GM-authored; a player cannot write its flags, which is why the DOM-only
  disable was the bug.

**Trade-offs accepted:** a drifted momentum base stays drifted until repaired
by hand; a waypoint card posted before the roller was stamped offers its
alternative to a GM only; a Confront Chaos button on a miss later burned to
a hit stays live until taken (WAYPOINT-ALT-AFTER-UPGRADE).

## Issue #315 audit: a move releases only its own lock; an asset effect keeps its choice, amount and target, and is applied once it lands; the crew is unprepared together (2026-10)

**Decision:** (issue #315. The maintainer asked for the issue to be addressed
on 2026-10-30. Each finding's ID in brackets.)
- **A move releases only its own lock** [S01]. The pipeline still releases
  `pendingMove` before the rider prompt (below, "Move-concurrency lock…"), so
  a later move may hold the lock by the time the prompt closes: the
  pipeline records that its own release landed (`lockReleased`), and its
  `finally` releases only when it has not. `releasePendingMoveLock` returns
  whether the lock is free — false when its write was refused, which the
  `finally` retries.
- **An asset effect is applied once its write lands** [S08].
  `applyMeterRiders` returns one outcome per rider from the write it rode
  (the character's meters are one write, the ship's integrity another);
  progress marks report theirs (`applyProgressRider`). The summary lists what
  landed and, apart, what did not and why; a write the world refused is a
  `rider` step on the GMs' payoff failure card, whose Retry applies that
  effect alone — the effects that landed are not replayed. The progress
  store hands its writers a copy (`loadTracks`), so a refused save leaves
  nothing in the client's cache.
- **One open track settles where a mark goes, not whether it is taken**
  [S02]. The single-track shortcut marks only a mark that is the outcome's
  own; an optional ("you may") or "choose one" mark is offered, with the
  lone track preselected, and a progress option stays in its choice group
  with its own track picker.
- **A progress effect's amount is signed marks** [S03], as the extractor's
  contract says: `adjustProgressById` changes a track by them within 0..40
  ticks (`markProgressById`, always at least one mark, delegates to it).
- **A finished track is never a target** [S06]: the rider path counts and
  offers open tracks only, and re-reads the chosen track as the mark is
  written; with none open the summary says so.
- **One writer for a consequence's integrity change** [S05]:
  `changeIntegrity` (entities/ship.js) — a rise refused while the canonical
  native impact says battered, a loss always landing. Withstand Damage's
  choices and asset effects both go through it. No effect carries an
  override of the battered rule.
- **One writer for the zero-supply impact, and it is the crew's** [S04, S07].
  `markUnprepared` (sufferExecutor.js) marks the PC whose supply reached 0
  and every ally sharing it (`supplyAllies`, sharedSupply.js — the one
  definition of the crew, which the sync reads too): from Sacrifice
  Resources, Repair's supply trade (once the payment is whole) and a move's
  own supply loss (`persistResolution`). An ally's refused write is said on
  the card, never thrown — the supply loss has landed.

**Reason:** issue #315 reproduced each defect (thirteen probes with their
controls) on `40cabee`, and again on `b23d193`; the probes pass inverted after
the fixes, and each fix's tests fail with it taken out
(`docs/testing/fix-sensitivity.md`). The rules: "unprepared is marked when
you Sacrifice Resources and are reduced to 0 supply … because you and your
allies share the same supply value, you mark unprepared together"; for
battered, "until you successfully Repair, you cannot raise the vehicle's
integrity".

**Rejected:**
- *An owner token in `pendingMove` instead of a boolean* [S01] — every reader
  checks truthiness and the tests pin `true`; the move that holds the lock
  only has to know whether it has let go of it.
- *Reject negative progress at validation* [S03] — the extractor's contract
  allows a loss, and taking marks back is a faithful reading of it; turning
  it into a gain was the bug.
- *Guard finished tracks inside `markProgressById`* [S06] — it has other
  callers, each selecting an open track already; the rider path re-reads the
  track itself.
- *Mirror the impact through the supply sync hook* [S07] — the hook sees
  every supply change, sheet edits included, and the impact belongs to
  Sacrifice Resources, not to any 0; a second mirror store invites drift.
- *Clear the crew's unprepared when any PC raises the supply* [S07] — a
  recovery move clears it, not a number. Who a Resupply clears is
  UNPREPARED-CLEAR-ONE-PC, left for the maintainer's call.

**Trade-offs accepted:** a rider refused by a rule (battered, no open track,
a finished track) is listed as not applied with no Retry — retrying would
not help. A trade's or an ally's refused impact is said on the card, to be
marked by hand.

## Issue #314 audit: a loss lands whole; a mirror follows its id; a retry owes only what failed (2026-10)

**Decision:** (issue #314. The maintainer asked for the issue to be addressed
on 2026-10-30. Each finding's ID in brackets.)
- **Resupply's supply is conditional, as Heal's health is** [Q01]:
  unprepared, clear it and take +1; otherwise take +2 — each branch gated on
  the impact (`requires: "unprepared"` / `"!unprepared"`), on the weak hit
  too (its amounts were right; its +2 was open to an unprepared PC).
- **Harm or stress past the meter is momentum** [Q02]. The executor splits
  the loss (`splitOverflow`), writes the meter, then takes the remainder
  through `loseMomentum` with no card of its own — the Endure card shows
  both meters — and reports what the momentum minimum refused for the player
  to redirect (`momentumLoss` on the result). The Pay the Price receipt is a
  list (`ptpMeterReceipts` → `sufferMeterDeltas`), the overflow a receipt of
  its own: an improvement refunds it, a burn's reset replaces it.
- **A directive's leaves keep their annotations** [Q03]. `resolveDirective`
  returns the text and the terminal entries it landed on; `rollOracle` lists
  every leaf's route as `sufferRoutes` (`sufferRoute` is gone — a "first of
  several" field is the bug's shape), and the three Pay the Price sites
  dispatch each, in order, once (`dispatchPayThePriceSufferRoutes`). A
  narrative leaf stays narrative; a chain that hits the depth cap ends with
  the directive's own text and no leaves.
- **A bond Item mirrors one connection, by the record's `_id`** [Q04]
  (`actorBridge.bondItemsFor`): a keyed Item matches its id alone; the name
  reaches only an unkeyed Item, and only the PC's one of that name. Every
  writer passes the record's `_id` — `markRelationshipProgress` always did;
  the develop branch and `!bond` passed the host Actor id, which no Item
  carries. `!bond` reads the record's id and name on the GM; the client's
  `targetName` left the relay payload.
- **A step that lands in part owes only what failed** [Q05]. A `vowClocks`
  upgrade step fails with the entries still owed; the GMs' card carries
  those alone, and its Retry — or a second refusal, on a fresh card — the
  same. The reversal card lists the rewinds that landed.
- **A bonded Develop Your Relationship rolls +rank in the pipeline** [Q06].
  `enrichBondedDevelop` (statEnrichment.js) runs before the dice: it
  resolves the connection (a picker's host id, else the name —
  `selectConnection`'s ladder, sole-bonded fallback included), stamps its id
  and name on the interpretation so the branch after the roll marks the same
  one, and makes its rank the stat, worth `BOND_ROLL_ADDS` (moved to
  developRelationship.js, shared with `!bond`); the card reads "+epic (5)".
  An un-bonded connection stays no roll's worth. The interpreter's prompt
  says so, and the move is a no-stat move for enrichment's warning.

**Reason:** issue #314 reproduced each defect (twelve probes with their
controls) on `40cabee`; the probes pass inverted after the fixes, and each
fix's tests fail with it taken out (`docs/testing/fix-sensitivity.md`).

**Rejected:**
- *Post the "any" suffer picker for an overflow the momentum minimum
  refuses* [Q02] — Lose Momentum's own at-min has no card either (a note on
  its card); giving the overflow one would make the two differ. Recorded
  as MOMENTUM-MIN-REDIRECT-MANUAL, for both at once.
- *Keep `sufferRoute` beside `sufferRoutes`* [Q03] — every consumer takes
  the list; a single-route field invites the same bug back.
- *Drop the name fallback entirely* [Q04] — Items seeded before the key
  existed would never update again; it stays for an unkeyed Item alone.
- *Rename the bond Item when the connection is renamed* [Q04] — a
  write-through the audit did not ask for; the mirror now reaches a renamed
  connection's Item by id, and the stale name is BOND-ITEM-NAME-STALE.
- *A separate upgrade step per vow Item* [Q05] — one card line per clock
  either way; the entries-owed list keeps one step and one Retry.
- *Put the rank in `adds`* [Q06] — the card would read "+null (0) + 5"; the
  rule rolls +rank, so the rank is the stat.
- *Resolve the bonded develop inside `enrichInterpretationStatValue`*
  [Q06] — it is synchronous and has no connections; the lookup is the async
  step beside `enrichProgressTicks`.

**Trade-offs accepted:** a Pay the Price card from before this change
carries a single `sufferMeterDelta`, which the reversal still reads. The
overflow's momentum loss has no card of its own (the Endure card says it).
An un-bonded Develop Your Relationship still rolls dice the rules don't ask
for, and its card still reads "+null (0)" (NO-STAT-CARD-NULL).

## Issue #313: an upgraded result applies its outcome's other effects; a weak Secure an Advantage's momentum rides its choice (2026-10)

**Decision:** (issue #313 — the two defects found while fixing #311. The
maintainer asked for the issue to be addressed on 2026-10-30.)
- **One applier for an outcome's effects beyond its meters and choice card**
  [UPGRADE-PIPELINE-EFFECTS]. The pipeline's consequence branches — an
  arrival (Set a Course), the expedition's progress, a legacy mark, the
  companion's health, a fight's threshold card, progress, position and end
  with a won fight's payoff — are `applyOutcomeEffects` (index.js). The
  pipeline runs it for the rolled outcome; Burn Momentum and Improve Result
  run it (injected as their hooks' `applyEffects`) for the upgraded outcome
  against the recorded original: only what the upgrade adds — progress marks
  beyond the original's, a changed position, an expedition's progress or a
  legacy the original did not mark, the companion's health difference, an
  arrival the miss never made, the payoff of a fight the miss lost. An
  effect the original produced is never repeated. The move card carries the
  move's target and ranks (`move`) beside its targets for it, and lists what
  was applied and what was not.
- **An upgrade acts on the fight its card named** — `targets.combatTrackId`,
  the pipeline's `moveFight` — never a fight selected at click time (issue
  #309 N04's rule): over by then, nothing is marked and the card says so.
  With no fight named, the upgrade resolves-or-creates on the move's target
  as the pipeline does. An Enter the Fray upgraded while its threshold card
  waits puts the new opening position on that card
  (`stashPositionOnThresholdCard`, by the card's `resolutionId`), as the
  weak hit's "You are in control" choice does; Enter the Fray then creates
  the fight in that position.
- **A weak hit that pays the price too keeps the miss's Pay the Price.**
  Clash's miss and weak hit both route it: a burn from one to the other
  keeps the price already rolled instead of reverting it and rolling again;
  the card says so.
- **An upgrade saves its own legacy mark and arrival location**
  (`writeLegacyTicks`, `persistCampaignStateFields`): no persistResolution
  follows with its working copy, as one does in the pipeline. Both upgrades
  re-narrate and log through one `renarrateUpgrade`, against a deep copy of
  the stored campaign, never the cached setting (rules/foundry-api.md).
- **Secure an Advantage's weak hit applies no momentum itself**
  [SAA-WEAK-DOUBLE-MOMENTUM]: its choice carries "+2 momentum" or "+1 on
  your next move", as Enter the Fray's and Gain Ground's do. The direct
  delta had been kept for pre-F16 delta-based fixtures.

**Reason:** issue #313, the two items left open by the #311 audit: the first
found by reading the upgrade handlers (only the meters, the reversal and the
choice card used the upgraded consequences), the second reproduced on a
booted table (momentum 2 → 4 on the roll, 6 after the pick). Each fix's
tests fail with the fix taken out (`docs/testing/fix-sensitivity.md`).

**Rejected:**
- *A second applier for upgrades beside the pipeline's branches* — two
  implementations of one effect drift (rules/reachability.md §5); the
  branches moved into the one function the pipeline calls.
- *Re-select the fight at upgrade time* — with two fights open it marks
  nothing, and an old card marks a fight opened since (issue #309 N04).
- *Revert the miss's Pay the Price and roll the weak hit's* — the same price
  twice over; the one rolled is the weak hit's.
- *Pay a Battle's win again when a weak-hit win is improved to a strong one*
  — the reward was granted once (its status flipped) and a second victory
  card's buttons would act twice; the weak hit's payoff stands.
- *Apply the upgraded outcome's asset consequence riders* — riders are
  extracted per roll and prompt the GM; outside this fix.

**Trade-offs accepted:** a Battle won on a weak hit and improved to a strong
one keeps the weak hit's milestone count and reward. The upgraded outcome's
asset consequence riders (`applyMoveConsequenceRiders`) still run only for
the rolled outcome. A threshold card posted before cards carried their
`resolutionId` cannot take an upgraded position (the card reports it not
written). Impacts a suffer executor marked are still not reversed, as before
— except unprepared: since issue #342 D4 the reversal clears the unprepared
marks the reverted price itself made, once the refunded supply is above 0.

## Issue #311 audit: a weak recovery is the strong one plus its cost; an upgrade owns what its outcome set off; completions are stamped (2026-10)

**Decision:** (issue #311. The maintainer asked for the issue to be tackled
on 2026-10-29. Each finding's ID in brackets.)
- **Negative momentum cancels a matching action die** [P01]. The roller's
  momentum is read as the dice are rolled — the pipeline passes
  `readMomentumState(rollerActor).value` to `resolveMove`, and `!bond` reads
  its roller's — and `cancelsActionDie` cancels the die when the momentum is
  negative and equals it: the score is the stat plus adds. The die stays on
  the record (`actionDieCancelled`), struck through on the card. A burn never
  meets this (it needs positive momentum); progress rolls have no die.
- **A weak recovery is the strong hit's plus its cost** [P02]. Heal's and
  Hearten's recovery is written once (`healRecovery` / `heartenRecovery`);
  a weak hit chains each recovery option with each cost (`withCost`). The
  cost rides the choice: Hearten's Lose Momentum (-1) is no longer a direct
  delta, so it lands with the recovery it pays for.
- **An upgrade is claimed before its effects** [P06], as a suffer pick is
  (#309 N07): Burn Momentum and Improve Result save the card's `consumed`
  first, and a refused claim applies nothing. Every write after the claim —
  the meter swap, the Pay the Price refund and clock rewinds, the upgraded
  choice card — runs through `applyUpgradeStep`; a refused one goes on the
  GMs' payoff failure card as an `upgrade` step, its Retry applying it once.
- **Both upgrades undo the superseded miss's Pay the Price, from what
  landed** [P04, P05]. The dispatcher returns the move it ran and the
  meter's before / after; the receipt (`ptpMeterReceipt`) is the landed
  loss, nothing when it was clamped. `revertPayThePrice` (resultUpgrade.js)
  rewinds the clocks and refunds the receipt for either upgrade. A burn
  refunds no momentum — its reset already replaces it.
- **An upgrade reconciles its move's choice cards** [P03]. Choice cards
  carry their move's `resolutionId`. After its claim an upgrade retires the
  superseded outcome's pending card and posts the upgraded outcome's choice
  once, for the move's vehicle, companion and fight (`targets` on both
  upgrades' card state). A pick on a superseded card is refused whether or
  not the retirement landed — the move card's claimed upgrade is the check.
- **A chosen consequence closes both upgrades** [P03]. The rules burn
  momentum "before applying any other effects of the move", and what a
  choice applied is not undone: upgrading after it would stack two
  outcomes' choices (a weak Heal's recovery, then the strong hit's again). A
  claimed pick stamps the move card `choiceMade`, whose buttons say why; the
  GM handlers check the choice cards themselves (`consequenceChosen`).
- **A seed-based Finalise keeps the completion contract** [P07]. Ships and
  connections finalize through their seed, which now runs only when the
  record has no `finalizedAt` or `force` is set, and stamps it in the
  payload it writes. A connection the creation hook already seeded gets the
  stamp as its only write. Regenerate flavour (force) still rewrites a
  ship's introduction in its Notes, as decided for the T1 lifecycle (D2).
- **Each PC's session momentum is its own step** [P08]. A refused award
  goes on the GMs' payoff card as a `momentum` step (with its session), whose
  Retry gives that PC alone the momentum; the session still ends once. An End
  on the ended session names the PCs still owed instead of "it was taken".
  Begin a Session's vignette momentum shares the helper.

**Reason:** issue #311 reproduced each defect (eleven probes and a control)
on `62bc92d`; the probes pass inverted after the fixes, and the regression
tests that came with the fixes fail with each fix taken out
(`docs/testing/fix-sensitivity.md`).

**Rejected:**
- *Post the upgraded outcome's choice even after the original's was chosen*
  (P03) — a weak Heal's recovery would be given twice; *skip it then* — a
  miss's cost card resolved before a burn would lose the strong hit's
  benefit; *reverse the chosen card's effects* — its impacts and at-0
  escalations (a mortal wound roll, a marked impact) are not invertible.
  Closing both upgrades once a consequence is chosen is the rules' order.
- *Retire the old card only* (P03) — a refused retirement would leave it
  live; the pick-time check doesn't depend on that write.
- *Re-apply Hearten's -1 directly and offer only the recovery* (P02) — the
  cost would land whether or not the recovery was ever taken.
- *Let a repeat End a Session pay a missing award* (P08) — a second retry
  route beside the GMs' card, which could pay it twice; as for every payoff
  step, the card's Retry is the one.
- *Re-check the stamp after the effects, as before, and retry the whole
  upgrade on refusal* (P06) — a partly applied upgrade would apply its
  landed writes again; claiming first is #309 N07's rule.

**Trade-offs accepted:** a player who chooses the consequence before
upgrading can no longer upgrade. A choice card posted before this change
carries no `resolutionId` and is not reconciled. An upgraded outcome's other
pipeline effects — combat or expedition progress, a combat position, legacy
marks — did not run until issue #313 (above).

## Issue #309 audit: a consequence changes what its move was about; claims before effects; a session ends once (2026-10)

**Decision:** (issue #309. The maintainer asked for every verified finding to
be fixed on 2026-10-29. Each finding's ID in brackets.)
- **XP has no ceiling** [N01]. `awardXP` adds: the vendor's `system.xp` is a
  non-negative integer with no maximum. The 30 was the classic Ironsworn
  sheet's track, never a Starforged rule. *(Issue #326 D3: `awardXP` is
  deleted — the XP is derived on the sheet from its mirrored legacies.)*
- **A move's consequence card carries what the move was about** [N02, N03,
  N04]. Stat enrichment stamps the vehicle an integrity roll read
  (`vehicleActorId`) and the companion a `companion_health` roll read
  (`companionItemId`); the pipeline adds the move's fight (`moveFight` →
  `combatTrackId`). `persistResolution`'s `targets` puts them on the suffer
  card's `executorOpts`, and its choices change exactly those: integrity on
  the ship record (`updateShip`; a raise refused while the ship's native
  impact says battered — since issue #345 AA20 `updateShip` writes the
  STARSHIP asset's Integrity track, the record its mirror), companion health on the asset's track
  (`actorBridge.applyCompanionHealthChange`), progress on that fight — gone or
  finished by click time, nothing. A card without the vehicle or companion
  falls back to the command vehicle / the PC's only companion; a card
  without a fight (posted before this) to the sole open fight.
- **Availability reads the card's targets** [N02, N03]: "not battered" is the
  vehicle's impact (null with no vehicle — the raise is unavailable), and
  "companion health > 0" the companion's live track.
- **A card says what landed** [N02]. Its resolved text lists the calls whose
  writes landed and, apart, each that did not and why (`ok: false` results).
- **A suffer pick is claimed before its effects** [N07]: the card resolved,
  or the option marked picked, is saved first; refused, nothing applies and
  the buttons re-arm. A write refused after the claim goes on the GMs'
  payoff failure card as a `suffer` step (`isRetryableSufferCall` checks what
  it re-applies), with the #306 Retry.
- **A one-time payoff's claim must land** [N05]. The native fulfilment pays
  nothing until `fulfilPaid` has landed on a copy; refused on every copy, its
  steps go unapplied onto the GMs' card (`unclaimed`). The native path, like
  a Retry, skips steps the `fulfilPayoff` ledger records.
- **Each PC's legacy XP is its own step** [N06]. `awardLegacyBoxXP` returns
  the awards that did not land; they go on the GMs' card as `xp` steps
  (outside the ledger — only that card's Retry gives them), and a box filled
  inside the move pipeline posts a `legacyXp` card of its own. "XP earned"
  follows the awards that landed, naming the PCs when not everyone was given
  it. This refines "Legacy XP pays at the tick write": failures no longer
  only warn.
- **A session ends once** [N08]. End a Session runs one at a time on the
  canonical GM, keyed by `currentSessionId` / `sessionEndedId`. An End on a
  session already ended is a focus correction: it replaces the noted focus,
  repeats nothing else, posts a note, and pays the momentum only when no
  focus had been noted — the momentum is for the session's first focus.
  *Update (issue #347 AB05):* "one at a time" waits for the End (or Begin)
  ahead of it for at most five minutes — past the relay queue's own cap — so
  one whose write the server never answered no longer holds every later one
  for the rest of the page load. Every wait on a write of the module's own is
  bounded the same way (`multiplayer/settleWithin.js`): the move lock's claim
  and release (30 s; a claim that lands later is released at once), the
  rolling summary's write and refresh, and a Private Channel page write (its
  turns kept for a retry, the player told). *Trade-off accepted:* an End or
  Begin that resumes after its five minutes runs beside the one that went
  ahead; the Progress Tracks write queue, awaited inside the move lock, stays
  unbounded (U57).
- **Session lifecycle writes go on a copy** [N09, and End's twin]: Begin and
  End read `game.settings.get`'s value through `deepClone` before changing
  it (rules/foundry-api.md).

**Reason:** issue #309 reproduced each defect (fourteen failing probes) on
`6e56de4`; the regression tests that came with the fixes fail with each fix
taken out (`docs/testing/fix-sensitivity.md`).

**Rejected:**
- *Re-arm the suffer card for a refused write, the press being the retry*
  (N07) — a chained choice whose first write landed would charge that one
  again, unless the card kept per-call state; the GMs' Retry already exists
  and shows the value as it stands.
- *Run a refused-claim payoff anyway and rely on the ledger* (N05) — the
  issue's direction, and #306's "`fulfilPaid` means payoff started": an
  unclaimed payoff is one a duplicate can still pay.
- *Refuse a second End a Session outright* (N08) — correcting the focus after
  ending is legitimate; *a separate "bonus paid" field* — between End and the
  next Begin, a noted focus already records it.
- *Mark the sole open fight when the card's fight is gone* (N04) — as #306
  R06 decided for track rows: another fight is not this one.
- *Wire `sufferDamage` for "-1 integrity"* (N02) — it is #216 Phase D's
  pre-built API; `updateShip` is the live writer and already clamps.
- *Fix the suffer-move executors' asset schema in the same change* — outside
  the audited paths; recorded as SUFFER-EXECUTOR-ASSET-SCHEMA.

**Trade-offs accepted:** a suffer pick's refused write is re-applied by a
GM's Retry, not by the player pressing again. A Gain Ground card posted
before this change keeps the sole-open-fight reading. Between End a Session
and the next Begin, the first focus noted pays the momentum once, whichever
End noted it.

## Issue #306 post-fix audit: one Chronicle writer, rows by id, claims before awaits (2026-10)

**Decision:** (issue #306. The maintainer asked for every finding to be
addressed on 2026-10-28, after a review that recommended the approaches
below — the Chronicle relay over granting journal ownership among them.
Each finding's ID in brackets. The last two bullets settle the two
follow-ups the fixes left open: the maintainer chose "1A + 1B" for the
first and "option 2, failure reporting extended to the won-fight buttons,
GMs only" for the second, the same day.)
- **A narration the X-Card interrupted stays discarded after a resume**
  [R01]. `suppressScene` counts each play in `campaignState.xCardPlays`,
  which nothing lowers. Every narrator entry point starts a watch on entry
  (`watchXCard`, after the entry gate) with the live count and discards its
  reply when the card is active or the count has moved. The count is
  store-owned in `persistResolution`'s merge. Resuming lets new narrations
  run; it never revives an interrupted one.
- **The Chronicle has one writer: the canonical GM** [R11, R02]. Every write
  — the panel's add, text, pin, re-type and delete, and the automatic
  writer's entries — is a `chronicle.edit` relay applied by
  `applyChronicleEditFromRelay`. The requester must be a GM or own the PC; a
  player adds only an annotation; re-type and delete are a GM's, as the
  panel shows them. An actor's writes run one at a time on that client
  (`writeChronicle`). The panel changes one entry by id on the stored
  entries — it never saves its own copy [R02] — and re-renders when its
  chronicle's page changes, since a relay has no ack.
- **A track row names its track by id** [R06]. The Progress Tracks panel's
  Roll and an expedition card's Finish carry the track's id as
  `forcedMoveTargetId` (→ `interpretation.moveTargetId`, as issue #301 B01's
  connection picker does). Selection, scoring, the fight's position, its
  completion and the recommit offer take that track or nothing. A track
  deleted or finished before the roll resolves rolls nothing, and a card
  says so. A combat move's position is written to the fight the move was
  about — the track its progress marked, else its target, else the sole open
  fight [R05] — and `listProgressTracks` carries each fight's `combatState`.
- **A one-time payoff claims its key before its first await** [R04]. The
  native vow-fulfilment payoff claims the vow (its `vowId`), the native
  Forge a Bond payoff the connection; the `fulfilPaid` / `bonded` flags stay
  the record. Their legacy writes go on a copy of the cached setting value.
- **A mirrored value is the one its change set** [R03]. A shared-supply pass
  syncs to the value captured with its change and stops writing once a newer
  change is queued; the newer pass also resets a PC an older write
  overwrote.
- **A Private Channel journal is its player's by the `privateChannelOwner`
  flag** [R08], as a Chronicle is its actor's (`rules/reachability.md` §6).
  The name is a label kept current on write; a history a rename split reads
  merged.
- **0 is a volume** [R09]; **a client setting takes effect when it changes**
  [R10] — Push-to-Talk off destroys the controller and removes the 🎙
  button; **an encounter token's Actor is a world Actor** [R12], imported
  from the compendium or reused when that entry was imported before.
- **A fight-ending roll names its fight** [TDA-BUTTON-NO-TARGET]. The
  pipeline resolves a combat move's fight once (`moveFight`: the track its
  progress marked, else its target, else the sole open fight) for both its
  position and its card, which stamps `combatTrackId` / `combatTrackLabel`;
  the Enter the Fray card stamps its track. Their "Attempt to Finish the
  Fight" and "Battle instead" buttons forward the id like a track row [R06].
  A Take Decisive Action that still names no fight while two or more are
  open is not rolled: a "Which fight?" card lists them, and a pick posts the
  move again with that fight's id, spoken as the original roller. Nothing is
  written, so the pick needs no relay; one pick per card (local disable,
  the GM's pick stamped). Battle and Face Defeat typed with no fight named
  keep closing none — they can be about a fight with no track.
- **A payoff step that does not land is told to the GMs, with a one-press
  Retry** [R04, option 2]. The native fulfilment's steps (Quests legacy,
  connection deepen, promised reward), the native forge's bonds legacy, a
  won fight's reward and the victory card's two buttons each report
  `{ ok }`. Failures go on one card whispered to the GMs only, showing each
  value as it stands now; its Retry relays `payoff.retry` (GM only, the card
  GM-authored), claims the card before re-running anything, and posts a
  fresh card for any step that fails again. A legacy box's XP is awarded
  after the legacy write lands; a reward is claimed (status flipped) before
  it is given, and "Reward earned" follows the grant. A fulfilment records
  each landed step on the vow's copies (`fulfilPayoff`), which a Retry
  consults. `fulfilPaid` still means "payoff started": a duplicate roll pays
  nothing. A won-fight button that fails stays unapplied — re-pressing it is
  the retry — and its report has no Retry of its own.

**Reason:** issue #306 reproduced each defect (fifteen failing probes) on
the code after the #300 and #301 fixes; the regression tests that came with
the fixes fail with each fix reverted, or with its defect injected
(`docs/testing/fix-sensitivity.md`).

**Rejected:**
- *Give players ownership of their PC's Chronicle journal* (R11) — it needs
  an ownership sync whenever a PC changes hands and a migration for every
  existing journal, and writes from several clients would still race; the
  relay needs neither.
- *A resume timestamp instead of a play count* (R01) — clients' clocks
  differ; a counter compares exactly.
- *Fall back to the label when a row's id no longer matches* (R06) — as B01
  decided for connections: a same-named track is a different fight.
- *A pop-up fight picker on the clicker's screen* (TDA-BUTTON-NO-TARGET) —
  it covers only the button, not a typed Take Decisive Action, and the table
  doesn't see it.
- *Report only, without a Retry* (R04 option 1) — the GM would re-apply each
  step by hand; *retry automatically* (option 3, e.g. on the next load) —
  it acts with nobody watching, and a write the world applied but reported
  as failed would be applied twice. The card's current values are option
  2's guard against that same case; no ledger can detect it.
- *Show the failure card to everyone* (R04) — the maintainer chose GMs only:
  the players see the effects that did land, and "Reward earned" only when
  it did.
- *Roll a vanished track at a score of 0* (R06) — a certain miss with its
  consequences, for a track the player can no longer see.
- *Fold a rename-split Private Channel history into one journal* (R08) — it
  would move or delete a player's private pages; reads merge them instead.

**Trade-offs accepted:** Chronicle edits need a connected GM, like every
card button: with none, the relay warns and nothing is saved. A native
payoff step that fails after its paid flag is stamped is still only logged
(known-issues NATIVE-PAYOFF-NO-RETRY). Importing an encounter adds the foe to
the world's Actors, once per compendium entry.

---

## Strict replay for critical playthroughs; regression tests proven sensitive (2026-10)

**Decision:** (issue #302 slices A and B. The maintainer asked for both on
2026-10-27; the choices below were made while building them.)
- **A strict scenario fails replay drift; a permissive one reports it.**
  `"strict": true` makes a scenario name every step and declare, per step,
  the Claude calls it makes — `calls` (each required once, with an optional
  prompt contract) and `optionalCalls`. A required call that never happened
  (`MISSING`), that only the stub answered (`UNRECORDED`) or whose prompt
  breaks its contract (`CONTRACT`), and any call nothing declared
  (`UNEXPECTED`), fail the step, before its checks run. first-session is
  strict. This narrows "Drift is reported, not failed" (Scripted
  playthroughs, below) for strict scenarios only.
- **Calls belong to steps.** The harness files each call under the step it
  started in, and a recording run stores the step on every exchange. A call
  takes its own step's recording of its kind before any word matching, so a
  prompt edit no longer costs its reply; cross-step matching (permissive
  only) keeps the half-the-words floor. Timing is not assumed: before a
  strict step is checked, the runner waits (up to 20 s) for its required
  calls, and the optional ones its recording made there, to start — the
  first strict CI runs passed on one runner and failed on a slower one that
  fired the passes' 2 s timers after the 4 s quiet window.
- **Contracts, not fingerprints, are the gate.** A contract fails even when
  a recorded reply answered the call, so data the prompt lost can't hide
  behind a canned reply. A change in a recording's prompt sections (its
  normalised fingerprint: entity ids and numbers ignored) stays a `STALE`
  warning, so a prompt change still merges without a key unless it breaks
  a contract. The `request` check became these contracts and was removed.
- **A failed recording run never becomes the baseline.** It writes its
  capture to `artifacts/recordings/<scenario>.rejected.json` and leaves
  `recordings/` alone; a recording marked `"passed": false` is refused. A
  recording carries its provenance: the scenario revision (a hash of the
  seed, settings and steps), the commit, the models, and per exchange its
  step and prompt fingerprint.
- **A result keeps replay validity, integration and narrator quality
  apart** (`verdict`), and classes a failure as infrastructure, replay or
  integration.
- **Regression tests are shown to fail without their fix.**
  `scripts/fix-sensitivity.mjs` reverts a fix commit's `src/` changes in a
  temporary worktree and runs the commit's tests, or applies a defect patch
  (`scripts/defects/*.patch`) to HEAD. A test that fails only because the
  fix's export is missing doesn't count; injecting the specific defect is
  how such a test is shown sensitive (B04's recap cache). The results are
  kept in `docs/testing/fix-sensitivity.md`.
- **Fault boundaries live in the multi-client harness** (slice B):
  `table.interceptWrites` refuses or holds world writes, a Claude reply can
  be a fault (`tests/helpers/faults.js` `claudeFault`), and
  `table.onEvent` records the order things happened in, which a failing
  test prints. Rows assert after `table.drain()`, never before deferred work
  has settled, so a negative check can't pass ahead of a late effect. The
  matrix is `tests/unit/faultMatrix.test.js`.
- **A known, open defect is a keyed check, not a skip.** `expectKnownIssue`
  asserts the correct behaviour, passes while that check fails with the
  recorded signature, fails on any other error, and fails when the defect no
  longer reproduces (MOVE-BUSY-NOTICE).
- **Never set a field on a cached setting value before a write that can
  fail.** `game.settings.get` returns an object setting by reference: write
  a copy, or undo the field when the write rejects (rules/foundry-api.md).
  The move lock's claim and release and the X-Card's pause and clear did
  it, and a refused write left a client disagreeing with the world.
- **A suffer card's pick is applied on the canonical GM** (`suffer.pick`),
  once per card, like the other one-shot card buttons. Draft Confirm keeps
  running on the clicking GM, behind a per-client in-flight guard; two GMs
  confirming at once is an accepted, recorded limitation
  (DRAFT-CONFIRM-TWO-GMS).

**Reason:** the #301 audit found four defects while 90 related tests
passed: coverage stopped short of workflow and identity boundaries. The
first-session recording is hand-written, so a permissive replay that
stubbed a required call, or a prompt that lost a section, could pass. The
#300 fixes were tested where each defect was found, not against the
interruptions a table produces (refused writes, failed calls, repeat
clicks, a dropped connection); the matrix found six defects there.

**Rejected:**
- *Fail on STALE*: every prompt edit would need a key to re-record — the
  reason drift was made a warning in the first place.
- *Match calls in call order*: background passes interleave; the step plus
  the kind is the stable key.
- *Keep the `request` check beside the contracts*: two ways to say one
  thing, and the check's `nth` counted across the whole run.
- *`it.fails` for known defects*: it passes on any failure, so it would hide
  an unrelated regression in the same test.
- *Relay draft Confirm through the canonical GM now*: the realistic case is
  one GM's double-click, which the in-flight guard covers; the relay is the
  recorded follow-up.

**Trade-offs accepted:** a new Claude call in a strict scenario fails CI
until a scenario edit declares it (no key needed). The first-session
replies are still hand-written; real ones need a recording run with a key.
A suffer pick needs a connected GM, like every other card button.

---

## Issue #301 follow-up audit: identity by stable id, caches by content (2026-10)

**Decision:** the four fixes in issue #301 settle these rules (each
finding's ID in brackets) — all instances of `rules/reachability.md` §6,
"resolve identity by stable id, not by mutable display name":

- **A card that forces a move names its target by id** [B01]. The
  connection picker posts `forcedMoveTargetId` (the connection's host Actor
  id) beside `forcedMoveTarget` (its name); the pipeline carries the id as
  `interpretation.moveTargetId`, and `selectConnection` resolves it before
  any name. An id that matches no active connection resolves **nothing** —
  never a namesake. Forge a Bond never falls back to a bonded connection
  (`unbonded`): with no id and no matching name it takes the sole un-bonded
  connection, else nothing.
- **A vow payoff acts on the roller's own vow** [B02]. `resolveVowItemCopies`
  takes the Item the roll scored (`itemId`), then the roller's own
  exact-name vow (open before completed), and only then the global name
  ladder; shared copies are collected by `vowId` after that. Every caller —
  fulfil (native and pipeline), Forsake, the won-fight card, milestone
  holder and fight reward — passes the roller. *(Forsake no longer takes this
  ladder — issue #345 AA16 / AA49: it reads the roller's own vows alone, by
  name as Fulfill does, or their only open one, and asks which when that is
  not one vow; a crewmate's vow is never forsaken. The won-fight card finds
  its vow by id since AA17.)*
- **A Chronicle is its actor's by the `chronicleActorId` flag** [B03]. The
  "Chronicle — {name}" title is a label, set on write to the actor's
  current name. Several journals flagged for one actor (a rename before the
  fix split them) read merged and fold into one on the next write. An
  unflagged journal under the actor's name is adopted only when exactly one
  character has that name; a journal flagged for another actor never is.
- **A derived cache is valid for the content it was made from, not its
  count** [B04]. The campaign recap cache stores `chronicleLength` and
  `chronicleHash` (each entry's text, timestamp and session number — what the
  recap prompt reads; `campaignRecapCacheKey`) and is used — by
  `getCampaignRecap` and the session's first narration alike — only while
  both match. A stale cache with no key to regenerate gives no recap, never
  the stale one. A cache from before the hash regenerates once.

**Reason:** issue #301 reproduced each defect (five failing probes); the
regression tests that came with the fixes fail with each fix reverted.

**Rejected:**
- *Fall back to the name when a picker's id no longer matches* (B01) — the
  connection was deleted or lost; a same-named connection is a different
  record.
- *A `linkedVowId` on combat tracks* (B02) — a schema change, and the
  roller preference already resolves the fight's vow; a renamed vow still
  resolves through the ladder.
- *Rename the Chronicle journal from an `updateActor` hook* (B03) — a new
  hook with its own single-emitter question; relabelling on the next write
  needs neither.
- *Clear the recap cache on every Chronicle write* (B04) — players edit
  entries but cannot write world settings, and the session-opening read
  would still need a check; a content key is validated where it is read.

**Trade-offs accepted:** each world regenerates its campaign recap once
after the update (one Claude call). Entries that two same-named characters
already shared cannot be separated — entries carry no actor. A write by a
user who cannot edit an old split journal leaves it unemptied; reads still
merge it.

---

## Issue #300 bug audit: outcomes apply once, payments are whole, waits are bounded (2026-10)

**Decision:** the sixteen fixes in issue #300 settle these rules (each
finding's ID in brackets):

- **Burn Momentum and Improve Result open only after the original outcome is
  recorded, and are exclusive** [F02]. The pipeline stamps `originalApplied`
  on the card when `persistResolution` lands (one combined update with the
  `recorded` flag), and the buttons are disabled until then
  (`resultUpgradeBlocker`: "original-pending", or "already-upgraded" once the
  other button consumed the card). The upgrade always swaps the original's
  effects for the new outcome's — there is no "original not applied yet"
  path left. One claim set (`claimResultUpgrade`) covers both buttons.
  Burn previews use the actor's live momentum and its bounds (`readMomentumState`,
  `actorBridge.js`), never a value past the maximum [F03]. *(Revised
  2026-11-01, issue #322 V04: the momentum burned is the momentum from before
  the move's effects — see "A burn spends the momentum from before the move".)*
- **Repair is pay-in-full or nothing** [F04]. The supply trade for extra
  repair points is paid before any benefit (`paySupplyTrade`); a missing or
  unowned payer or too little supply applies no repairs, and a partial debit
  is refunded. The card says so.
- **Site matching runs across sectors, strongest rung first** [F07]: an exact
  id anywhere, then an exact name, then the scoped guesses (the active sector
  first) — `selectSectorSite`, shared by reveal, clear and the expedition
  stamp. An earlier sector's weak match never beats a later exact one.
- **A session's start effects apply once** [F11]. Begin a Session stamps
  `sessionStartedId` (store-owned) before granting anything; a second Begin
  for the same session posts "already begun" and repeats nothing. Begins on
  the GM are chained, so two at once cannot both pass the check. A start
  effect the world refuses is retried on its own, never by a second Begin
  (issue #316 T04 — the `clocks` step; see "Issue #316 audit").
- **A narration in flight when the X-Card is played is discarded** [F13] —
  every narrator entry point re-checks the live X-Card after its Claude call
  returns, before the sidecar or any card (see "X-Card: anyone plays it").
- **Shared-supply mirror writes carry a marker** [F05]. The mirror update
  passes `{ "starforged-companion": { sharedSupplyMirror: true } }` in its
  options and the hook skips marked updates, instead of a global in-flight
  flag that also dropped real edits; a change during a sync is coalesced and
  synced after it. *Update (issue #347 SUPPLY-LAGGING-SHEET):* a sheet edit
  moves the crew's supply by what it changed on that sheet, as a legacy edit
  moves the shared track (AB07) — the editing client stamps the sheet's
  supply before the edit into the update's options (`preUpdateActor`). There
  is no canonical store for supply, so the change is applied to the supply
  the GM's last pass set when the sheet was in step with that pass (two
  players spending one at once spend two), else to the value most of the
  crew's sheets hold, a tie going to the edited sheet's. An edit without the
  stamp still sets the crew to its value. A PC created mid-session starts at
  the crew's supply.
- **Private Channel turns stay buffered until their write succeeds** [F01];
  writes per player are chained, and a failed batch goes back to the front
  and is retried (5 s × attempt, three automatic retries).
- **Request deadlines cover the body** [F06] (`fetchWithTimeout`), **audio
  playback has one sequencing loop per run and a generation stop() ends**
  [F08, F09], **push-to-talk tracks "held" apart from the engine** [F10] —
  and a press made while the last run winds down from its release captures
  when that run ends, while a hold that outlasts its utterance still gets one
  utterance (PTT-QUICK-REPRESS) — and **the Entity Panel listens to Actor
  hooks** [F12].
- **GM queue budgets are per kind, counted from when the predecessor starts**
  [F15] — see "Player-invoked world writes go through the GM relay".
- **The help describes Private Lines' real privacy** [F16]: never shown in
  another player's interface or sent in another player's request; seen by the
  GM; readable from shared world data (see "Private Lines in shared
  narration", Boundary).

**Reason:** issue #300 (two audit passes and the validity review of #299)
reproduced each defect; the regression tests that came with the fixes fail
with each fix reverted.

**Rejected:**
- *Let an early burn cancel the pending original* (F02's other option) — the
  pipeline would need a cancellation point between narration and persist on
  every path; gating the buttons on the recorded original is one check.
- *Revalidate an affordable smaller repair when the supply falls short*
  (F04) — guesses which repairs the player wanted; rejecting and asking for a
  new trade keeps the player's choice.
- *A flat, longer queue cap* (F15) — every hung non-Claude handler would then
  block relays for minutes too.

**Trade-offs accepted:** a Claude-calling relay that truly hangs now holds
later relays for up to 270 s, not 60 s (the X-Card is still unqueued); a
Burn / Improve button stays disabled for the whole narration.

---

## Scripted playthroughs: Claude answered at the fetch boundary from recordings (2026-10)

**Decision:** (issue #290 part 2. The maintainer settled where the
recordings live — "no opinion … as long as it is in the repo" — and the
budget, under 5 extra minutes of CI to start; the rest was decided while
building it, on 2026-10-25.)
- **Played in the Playwright GM + player suite, after the multiplayer one**
  (`test/ci/playwright/playthrough.mjs`). The player types and answers the
  session dialogs, the GM's client runs the real pipeline, and the GM clicks
  the confirm dialog and the draft card, as at a table.
- **Claude is answered by the Playwright process** (`lib/claude.mjs`): an
  init script wraps `window.fetch`, and a call to `api.anthropic.com` goes,
  with the JS stack at the call, to a function exposed from Node. No module
  code changes, no CORS (the page never reaches the network for Claude), and
  a recording run's key never enters the world.
- **A call's kind is its caller** — the two named module frames above
  `apiPost` — not its prompt text, which is what changes. A request takes the
  unused recording of its kind that its user message contains the most words
  of, and only one it contains at least half of: order can vary (background
  passes), and a call nothing was recorded for (the tier pass a vignette
  schedules) must not take another call's reply. The first CI run hit
  exactly that before the floor existed.
- **Drift is reported, not failed.** A call with no matching recording gets a
  neutral stub and an `UNRECORDED` line; a recording whose prompt sections no
  longer match logs `STALE`. Failing either would block every prompt change
  on a re-record that needs a key. The checks still fail when the behaviour
  breaks. (Narrowed for strict scenarios by "Strict replay for critical
  playthroughs", above: an undeclared or unanswered required call fails
  there; STALE is still a warning.)
- **Recordings live in `test/ci/playwright/recordings/`**, next to the
  scenarios, not `tests/fixtures/`. They are recorded outside CI
  (`e2e.sh --record-playthroughs`, the key in `ANTHROPIC_API_KEY`), with the
  entity ids the model echoes stored as names, since ids differ per world.
  The first scenario starts on hand-written placeholders in each parser's
  format (`"source": "hand-written"`) until it is recorded.
- **Scenarios are data** (`playthroughs/*.json`: seed, pinned settings,
  steps, checks), so part 3's playtester can reuse and extend them. Each
  starts from a fresh world: the suites before it leave actors, journals,
  chat and campaign state behind.
- **Dice are scripted at `rollDie`:** the GM page answers `Math.random`
  calls made directly from the resolver's `rollDie` from the step's queue,
  and leaves every other caller random (ids, oracle tables).
- **The ship's moves are pinned by the request they precede.** The
  playthrough moves the ship by a typed Set a Course and by a drag of its
  token on a seeded sector map. A recorded narration may report the ship's
  position itself and rewrite the record after the move did, so the position
  checks look only at where the ship ends up; each move's own write is
  checked in the narration request it precedes, which must carry the new
  SHIP POSITION line (v1.7.10 F5: the write never ran).
- **The Private Channel question #289 left open is answered in the player's
  browser:** a player's client holds NPC cards it has no permission on, and
  the private prompt carries the card of an NPC the player names. The
  scenario now asserts it.

**Reason:** part 1 checks each request alone; the playtest bugs part 2
targets live between steps — a confirmed page left empty, a Session Log
never written, a lock never released, a PC drafted as a connection, `<npc>`
markup on a card — and only show when the real pipeline runs a session with
two clients and real permissions.

**Rejected:**
- *`page.route` on `api.anthropic.com`*: the request then crosses CORS, with
  preflights to answer and headers to fake, and still carries no caller.
- *Matching by prompt hash*: every prompt edit would break every replay.
- *Matching in call order*: background passes (detection, tier updates,
  summaries, chronicle) fire on timers and interleave.
- *A test seam in `resolver.js` for dice*: production code for a test; the
  stack check needs none.
- *Failing CI on a stale or missing recording*: a prompt change would then
  need a key to merge.

## Prompt contracts and `!narrator debug`: check the request the narrator is sent (2026-10)

**Decision:** (issue #290 part 1. The issue set the scope; the choices below
were made while building it, on 2026-10-25.)
- **The capture is this browser's, in memory.** `callNarratorAPI` records
  each request (system prompt, user message, model, cap, the narrator
  function) and its response; `applyNarratorSidecar` adds the fact block it
  parsed (`src/narration/narratorDebug.js`). The last 10 are kept, a reload
  clears them, and nothing is written to the world.
- **`!narrator debug` is GM-only and runs where it is typed**
  (`RUN_ON.AUTHOR`), because the capture it shows is that browser's. It
  whispers the typist a card of the last narration (the background summary
  regen is listed, not detailed): each section, the fact block, the raw
  response. The card says that a narration run in another browser isn't in it.
- **Private Lines are counted, not shown**, on the card. A GM's client sends
  every player's lines to the narrator (the Private Lines entry below), but
  the card is not a place to read them. **The Private Channel is not
  captured**: it is one player's conversation, and it calls the API itself.
- **The contract is checked in Quench, every PR, with no key**
  (`starforged-companion.promptContracts`). The Anthropic endpoint is stubbed
  for the whole batch, so the background passes a narration schedules land on
  the stub too. Every narrator mode runs against real documents built with
  the module's own writers, and each section is checked by its heading:
  present when its data exists, absent when it doesn't. The card and the
  batch read sections with the same `splitPromptSections`. A section added to
  the prompt, or a new mode, gets a check there.
- **The bugs the checks found ship with them:** the open progress tracks
  [4j] (TRACKS-UNPORTED, restoring #241 P1's active-fight awareness) and the
  ship description's modules (SHIP-FLAVOR-MODULES, v1.6.1 F7).

**Reason:** ten of the 58 playtest bugs from v1.6.1 to v1.7.17 were data
that existed in the world but never reached the prompt (the issue's
classification), and nothing tested the request itself: the Quench narrator
batches check the card, and CI has no key. A playtest report of "the
narrator forgot X" needs to show whether X was in the prompt.

**Rejected:**
- *Showing the canonical GM's capture to whoever types it*: the prompt would
  have to be relayed between browsers, and the GM who types it is usually
  the one narrating.
- *A dialog instead of a chat card*: the card stays in the log for the report.
- *A table of section ids*: a second copy of the builders' headings to keep
  in step. The tests and the card read the headings the prompt has.
- *A fetch stub per test*: a background pass scheduled by one narration
  fired after its test had restored the real fetch.

## Phone layout: adapt to what the device can do, with a per-device override (2026-10)

**Decision:** (issue #293, the maintainer's choice on 2026-10-24, before any
code) The module's UI switches to a compact, touch-friendly layout by itself,
by detecting what the device can do: a coarse pointer (a finger), a small
width or height. It doesn't try to decide whether the device is a phone. A
client-scoped setting (Automatic, Phone, Desktop) overrides the guess. Only
the module's UI adapts, with one exception for Foundry's map on a phone
(below). The
phone user is the GM, debugging alone, in portrait and in landscape: no
multiplayer session runs with the GM on a phone. A dedicated phone view
comes only if the compact layout isn't enough, judged after a test pass on
the phone.

**As built (v1.7.34 cycle, `src/ui/layoutMode.js`):**
- **One decision, two readers.** JavaScript decides once, from
  `matchMedia("(pointer: coarse)")`, the viewport, the screen size and the
  setting, and mirrors the result as `sf-compact` and `sf-touch` on `<body>`.
  The CSS keys on those classes rather than on raw media queries, so the
  override changes the looks too. Resizes, rotations and pointer changes
  re-check it.
- **Compact** = a viewport under 600 × 480 px (Material's compact window size
  classes), or a touch screen whose shorter side is under 600 px. The second
  covers a phone drawing a desktop-width page: its viewport reports about
  980 px, but its screen reports the phone's size. **Touch** = a coarse
  pointer.
- **The toolbar** is always kept inside the viewport. When compact, it folds
  behind one launcher: a tap opens a labelled tool list, a drag moves it.
- **Module windows** carry the `sf-window` class. When compact, the CSS pins
  them to the top, at the screen's full width, no taller than the screen,
  scrolling inside. Dragging and resizing are moot on a phone.
- **Touch** grows tap targets: 48 px on the toolbar, 44 px for buttons in
  module windows and module chat cards.
- **The exception: Foundry's map on a phone** (the maintainer's request,
  2026-10-24, after the first phone test, v1.7.35). Foundry's map takes
  every touch: PIXI sets `touch-action: none` inline on `#board`, so a pinch
  that started on the map drew an orange drag-select box instead of zooming
  the page. When the layout is both compact and touch (a phone), the CSS sets
  `touch-action: pinch-zoom !important` on `#board`: two fingers pinch-zoom
  and pan the page, and one finger still works the map. Tablets and desktops
  keep Foundry's handling.

**Why:** on a Pixel joined to a Forge game (2026-10-23), the windows were too
big for the screen, panning and zooming back out were finicky, and toolbar
bottoms were cut off. Detecting capabilities also gives a small tablet or a
narrow desktop window the right layout, and it follows rotation. The setting
covers a wrong guess.

**Rejected:**
- *User-agent sniffing*: brittle. `navigator.userAgentData.mobile` is
  Chromium-only, so it is at most a hint.
- *A manual switch only*: the maintainer asked for the layout to adapt by
  itself. The switch stays, as the override.
- *A screen wake lock during sessions*: proposed while the GM's phone looked
  like the table's engine. It isn't needed: only solo debug sessions run on a
  phone, and Android's screen-timeout setting covers a long one.

## Collaborative character creation: an in-character interview on the GM's key, filling the Starforged sheet (2026-10)

**Decision:** (issue #291, the maintainer's choices on 2026-10-22 and 23,
before any code)
- **It is an interview.** The narrator plays an interviewer in character,
  draws the backstory and paths out of the player, and proposes the whole
  character. The player can change any of it at the end, before Finish.
- **The interviewer becomes the character's first connection,** at
  troublesome (the lowest rank), set automatically. It is an existing sector
  NPC when one fits ("Reuse before you invent"), otherwise a new NPC scoped
  to the sector.
- **The interviewer asks gender, height and weight, and offers to take the
  character's picture.** The existing portrait pipeline generates it on the
  GM's OpenRouter key, with one retake ("Portrait generation: generate once,
  one regeneration, then locked").
- **Campaign Start doesn't use it.** Campaign Start stays the fast, random
  setup; character creation is the player's route.
- **Finish offers an introduction card, and a posted one is canon,** as a
  published reflection is (the entry below): the narrator flag family, the
  GM's tier pass, no sidecar facts. The player can edit, post or skip it.
- **The narrator's leanings show live** in the side panel, and the narrator
  answers the player's questions about what a path is or does.
- **It runs on the GM's key only**, on the canonical GM's client, with the
  world narrator model (`narrationModel`): never the player's key, and not
  the Private Channel's fixed Haiku.
- **It opens from the Companion toolbar.** A Create Character button that
  players can use, shown whether or not the Private Channel is enabled. There
  is no chat command.
- **The background vow is an ordinary vow.** `readVows` keeps labelling the
  shared inciting vow "Background vow" in CHARACTER STATE. Until an inciting
  vow exists, the first-vow fallback shows the character's own vow there.
- **Text goes where the Starforged sheet puts it.** Look and manner, with
  gender, height and weight, go in the header's Characteristics box
  (`system.biography`). The backstory and starting
  gear go in the Notes tab (`system.notes`). The narrator already reads both.

**Why:** most players don't know the 46 paths, so the narrator asks about the
character and matches the paths to the answers, and the review at the end
keeps the player in control. On the GM's key, a player needs no key of their
own, and every turn runs on the client that writes the character at Finish.
Players have to be able to start it themselves, and #226 §16 had
already dropped chat commands for the Private Channel: duplicate windows across
clients, deletion permissions, and the open event leaking to the table. The
Private Channel uses Haiku because its exchanges are short and frequent. A
character is made once, and its backstory feeds the whole campaign. Keeping the
inciting vow as "Background vow" leaves `isBackground` and its readers as they
are. The Starforged sheet has no gear section (checked against the vendored
`sf-charactersheet.vue` and upstream main), so gear goes in a sheet field the
player sees and the narrator already reads.

**Rejected:**
- *Choosing step by step*: the first draft. The maintainer chose the interview
  with a review at the end.
- *The "Claude calls run where a key lives" ladder*, which falls back to a
  keyed player's own key when no keyed GM is on: the maintainer chose the GM's
  key only.
- *Keeping the leanings for the reveal*: the maintainer chose to show them
  live.
- *Picking the first connection's rank at the review*: the maintainer chose
  the lowest rank, set automatically.
- *Character creation inside Campaign Start*: Campaign Start is for throwing a
  world together fast.
- *`!character new`*: the name #226 used. A chat trigger has the problems #226
  §16 lists.
- *Relabelling the creation vow as the background vow*: it would change what
  `isBackground` means for every reader, for little gain.
- *The Characteristics box for gear*: offered. The maintainer chose the Notes
  tab, so the header holds look and manner only.
- *The `grantedRewards` flag for gear*: it prints as "Rewards received".

## The Private Channel reads the shared story; a published reflection is canon (2026-10)

**Decision:** (issue #286 D1, decided in #287 — the maintainer chose "read
and write")
- **Read.** The private narrator is told what the main narrator knows, rendered
  by the same section formatters (`buildPrivateChannelStory` →
  `buildSharedStorySections`): world truths and the campaign premise in its
  cached prefix; last session's and this session's summaries, the cards of the
  recorded entities the player's message or the scene frame names, and the
  scene ledger in the per-turn message. It is told never to contradict them.
  Its character is the player's own PC (`resolveUserActorId`, issue #321
  U23), and it is sent the session's whole private transcript — the saved
  turns read back when the window reopens, then the window's own (issue #321
  U42).
- **Write.** A reflection the player publishes is canon. Its card carries the
  narrator flag family, so the ring and the rolling summary hold it, and the
  canonical GM runs the tier pass for the recorded entities it names
  (`registerPublishedReflectionHook`), as for vow scenes and vignettes. Only
  the published text: the player's own private lines are never published.
  Publishing is refused while the X-Card is in play (issue #321 U09).
- **No ledger facts.** The private narrator emits no sidecar; nothing said in
  the private window is recorded until it is published.
- **Verified in Foundry (issue #290 part 2, 2026-10-25):** a player's client
  holds every NPC card, including ones it has no permission on (ownership 0:
  the sheet stays closed to them), so the private prompt carries the card of
  an NPC the player names. The `first-session` playthrough checks it in the
  player's browser.

**Why:** the private narrator remembered only the open window's turns, the
location and three ring cards, so a private aside could contradict the
table's established facts; and a reflection the table saw was forgotten by the
main narrator at once (its card had no flag family).

**Rejected:**
- *A sidecar on private turns* — the private conversation is exploratory;
  only what the player publishes should bind the story.
- *Publishing the player's prompting line with the reply* — the publish
  dialog shows only the narrator's text, so that is all that goes out.

## Narrator latency: measure first; thinking-off by exact model id (2026-10)

**Decision:** (issue #286 F6 step 1, F7)
- Every narrator call logs its token usage — uncached input, cache reads,
  cache writes, output — and elapsed time to the Pacing Telemetry journal's
  "Narrator Usage" page, labelled with the narrator function that made it
  (`logNarratorUsage`). The proposed re-layout of the request into cached
  tiers (issue #286 §F2–F5, carried to #287) waits for these numbers and a playtest. Moving
  mode instructions out of the top of the system prompt may shift the
  narrator's voice, so it needs that playtest.
- `narrationDisablesThinking` matches exact model ids (optionally
  date-stamped), not prefixes. The prefix `claude-sonnet-5` also matched
  `claude-sonnet-5-5`, which rejects `thinking: {type: "disabled"}` with a
  400; its thinking-off form is `between_tools`. Neither it nor the Fable
  tier or Opus 5.5 (which also reject "disabled") is offered for narration.
  (Since the 5.5 upgrade, Sonnet 5.5 is offered and is sent `between_tools`
  — see "Haiku 5.5 and Sonnet 5.5 are the defaults".)

**Rejected:** a byte-stability test for the cached tiers now. It belongs with
the layout split, since today's prompt changes on every turn by design.

## Narrator side-data, draft confirm and detection: nothing the narration said is lost or contradicted (2026-10)

**Decision:** (issue #286 D2–D4)
- **D2.** Narration that runs on a player's own key (no keyed GM online)
  relays its side-data to the canonical GM — GM relay `narrator.sidecar` →
  `applyRelayedNarratorSidecar` — tagged with the scene it was written in.
  The GM drops it if that scene has ended, and starts a scene when none is
  active. It used to be discarded. The content is the player's client's, the
  same trust as its prose.
- **D3.** The detection pass reads the role and goal the prose gave a new
  connection. Confirm on a draft card uses them over its oracle rolls, and adds
  a rolled first look only when the narration did not describe them: the
  rolls come after the narration, and the card lists them as ESTABLISHED
  FACTS.
- **D4.** Lore about a recorded entity goes to its card at the tier pass's
  floor (`notable`) before the world-lore floor applies, which used to send a
  notable NPC fact to the Session Log. Interaction-class moves run the
  detection pass, as paced narration (the same class) always has. Oracle
  follow-ups run detection and the tier pass. Session vignettes and vow scenes
  run the tier pass for the recorded entities they name, and so do clock
  vignettes since issue #345 AA33. New entities still
  go to the GM's draft card; only make_a_connection auto-creates.

**Rejected:**
- *Detection after embellishment moves.* That class adds texture, not facts.
- *Running detection after vignettes and vow scenes.* They run under
  embellishment and introduce no one new: the vow target is created by Swear
  an Iron Vow. (A clock vignette runs at interaction latitude since issue
  #322 V23, so whether it should run detection is open — known-issues
  CLOCK-VIGNETTE-NO-DETECTION.)
- *Keeping oracle rolls over narrated values on a draft.* The narration is
  what the table read.

## Clocks, vow progress, rewards, connection standing and the session focus reach the narrator (2026-10)

**Decision:** (issue #286 C5) each was in no prompt, and each now renders
compactly on every prose call:
- **[4h] CLOCKS** — the active campaign and tension clocks, at most eight,
  read from the store (a move narrates from a snapshot taken before its own
  Pay the Price advanced one). The narrator is told to show them as pressure
  in the fiction and never mention a clock or its count.
- **CHARACTER [8]** — each vow and bond with its progress (and a vow's
  countdown clock), and the rewards `recordGrantedReward` keeps on the sheet
  (`grantedRewards`, which nothing read). The cached actor snapshot is now
  dropped when one of the actor's Items changes, so progress marked on the
  native sheet reaches the next narration.
- **Connection cards** — the rolled `goal` beside the `motivation` (the card
  showed only the motivation, labelled "Goal"), a lost or forged bond, and the
  last three `history` events.
- **[4i] THE TABLE'S FOCUS THIS SESSION** — the End a Session foci, kept as
  `sessionFocus` when Begin a Session surfaces and clears them.
- *(Issue #290 adds **[4j] OPEN PROGRESS TRACKS** beside them: the open
  fights, expeditions and scene challenges — see the prompt-contracts entry
  above.)*

**Rejected:** rendering a connection's `background` and `secrets` — no
production code writes either (known-issues.md); cards for everything in the
sector roster (the relevance and frame-cast rules choose cards, unchanged).

## A session ends at End Session or after four idle hours; the next is told about the last (2026-10)

**Decision:** (issue #286 C3, C4)
- A session is over once End a Session marks it (`sessionEndedId`) or after
  four hours with no chat message. The canonical GM refreshes the session's
  activity stamp on chat activity, at most every 10 minutes, and never for a
  session that is already over — since issue #342 Z01 its own world setting,
  `sessionActivity { sessionId, at }` (the idle limit reads the later of it
  and the mint's `lastSessionTimestamp`): written into `campaignState` from
  the cached copy, it undid a relayed X-Card, flag, break or End landing
  meanwhile. Since issue #342 D6 the "Previously On" recap posts when a load
  starts the new session, and the separate Session gap setting is gone. The next world load or Begin a Session,
  whichever comes first, starts the new one (`rollSessionIfDue`,
  `src/session/lifecycle.js`): a session nobody ended first gets its rolling
  summary brought up to date, its scene closes under its own id, then the mint.
  The new session starts with its session-active gate closed and Begin a
  Session opens it (issue #321 U12 — the mint left the gate as it was, so a
  session that went idle handed its open gate to the next: "active" since last
  week, Begin a Session disabled, its clocks, vignette and foci skipped).
- The mint keeps the closing session's rolling summary as
  `previousSessionSummary`. Every prose mode renders it as LAST SESSION in
  [4c], before STORY SO FAR and under the same ledger-wins caveat. The
  canonical record stays `sessionSummary`; nothing else writes the copy.
- The campaign recap reaches a session's first narration in any prose mode.
  "First" means no narrator card of the session exists yet, so a reload does
  not repeat it. It is read from `campaignRecapCache`, which the closing work
  after End a Session and a new session's world load refresh; the narration
  generates one only when none was ever made.

**Why:** the session boundary was any reload four hours after the mint. A
reload in hour five of a long session re-minted mid-play: the ring, summary
and oracles reset, and the scene closed. End → Begin without a reload kept the
same session. The only prose that crossed sessions was the recap, on the
first move narration per page load, after a fresh Claude call whenever the
chronicle had grown; paced narration, `@scene` and vignettes never saw it,
and the summary End a Session archives to the Session Log had no reader.

**Rejected:**
- *Read the Session Log's archived summary.* Only End a Session writes it,
  and only with `sessionLogAutoWrite` on; a session that ends by going idle
  has none.
- *Mint at End a Session.* The closing vignette posts after End, under the
  session it closes; whatever the table says before Begin stays there too.
- *Re-mint on the first message after an idle gap.* That would mint inside a
  move pipeline run; the next world load or Begin does it.
- *The last two or three sessions' summaries* (F3). That waits for the F
  layout, where they are cached input; until then each is uncached on every
  call.

## Scene end keeps whereabouts and place details; lore is chosen per turn (2026-10)

**Decision:** (issue #286 C1, C2)

- **Last known whereabouts.** `endScene` keeps each recorded character's
  location / vessel / condition (`WHEREABOUTS_ATTRIBUTES`) on their record as
  `lastKnown`, attribute by attribute (a value this scene did not mention
  keeps its old one). The card renders it as LAST KNOWN; the active scene's
  CURRENT STATE wins over it.
- **Place details go to the place.** A scene-subject truth migrates to the
  scene's recorded place: the frame's location when it names, or mentions by
  full name, exactly one recorded settlement / planet / location / ship; else
  the current location when the frame names no place. Otherwise it is WJ
  lore titled with the frame's location. *(Issue #326 D2, 2026-11-03: the
  place is the one the truth was asserted at — each truth records the
  frame's location then, `sceneLocation` — not the one the scene ended at; a
  scene spans travel. An unstamped truth falls back to the end-of-scene
  place. See "Issue #326 audit" → "A scene truth is filed where it was
  asserted".)*
- **Lore per turn.** ESTABLISHED LORE holds up to 5 entries that share the
  most words with the player text, the frame and the entities in play, then
  the most recent, 8 in all; the Locations journal's places join the pool.
  Lexical, no API call.

**Why:** scene state — including the REQUIRED NPC location and condition —
was discarded at scene end with no afterlife. Place details became lore
titled "Scene sc-…", tied to no place, and the narrator saw only the five
most recently updated lore entries, so one busy scene end pushed out
everything older.

**Rejected:**
- *Writing `lastKnown` on every state change.* The ledger is authoritative
  inside the scene; one write per entity at scene end is enough.
- *Falling back to the current location when the frame names an unrecorded
  place.* The scene may be somewhere else ("the derelict's spine corridor"
  while docked at Bleakhold); a wrong card is worse than lore.
- *Haiku-ranked lore.* Non-move relevance stays lexical (invariant 5).

## A strike reaches every copy of the fact (2026-10)

**Decision:** (issue #286 B6) `!truth strike` and the correction dialog's
Strike / Replace call `propagateRetraction` (`src/factContinuity/retractions.js`):

- the subject entity's tier details from the **same session** that state the
  fact are removed (word-overlap match, `factsOverlap`; pinned details stay;
  containment counts only whole words — "is dead" is not in "this deadline",
  issue #321 U39);
- the session's World Journal lore that states it **about the struck
  subject** goes `retracted` and
  unconfirmed — kept for history, out of ESTABLISHED LORE and the pending
  queue; the detection pass's "lore confirmed" transition cannot re-confirm
  it, and `!journal lore "<title>" confirmed` restores it — with its text
  (unless the command gives new text), category, session and move provenance
  and its narrator provenance; `rumour` clears the strike but keeps the entry
  out of canon and the review queue (issue #321 U40: a restore left
  `retracted` set, since `setFlag` merges key by key, and blanked the entry).
  The subject rule (issue #321 U39 — sidecar facts are subject-less phrases,
  so striking "Vance — Is dead" took another character's death out of
  canon): an archived scene truth must carry the struck subject's label;
  other lore must name the text subject or the entity as whole words in its
  title or text; a scene truth's fact alone decides;
- the rolling summary regenerates on its next refresh, with a leave-out list.

`endScene` keeps the scene's bare strikes on `campaignState.sessionRetractions`
(cap 20, session-keyed), so the CORRECTED block (still capped at 5) and the
summary's leave-out list hold for the rest of the session. A strike there is
its subject label and fact together, so two characters' identical struck facts
are both kept (issue #321 U39). The X-Card calls `propagateRetraction` for
each truth it retracts, but its retractions (`retractedBy: "xcard"`) are never
named under CORRECTED or in the leave-out list (issue #321 U07).

**Why:** the prose that made a truth also fed the tier pass, the auto-confirmed
lore and the summary. A Strike marked only the scene ledger, and CORRECTED
ended with the scene, so a struck fact came back from those afterwards — the
mirror-drift family (rules/reachability.md §5).

**Rejected:**
- *Deleting matching lore pages.* A retraction is a ruling, not an erasure;
  the GM can restore one.
- *Matching across sessions.* An earlier session's detail is not this prose's
  copy.
- *Scene-scoped CORRECTED only.* The ring and the summary's source outlive
  the scene.
- *Propagating into the chronicle.* Its lines fed only the campaign recap
  then — since issue #345 AA07 a pinned entry also reaches its PC's
  CHARACTER block in every narration; left for a follow-up (known-issues
  STRIKE-CHRONICLE).

## What every narration is told about the turn before (2026-10)

**Decision:** (issue #286 B1–B5, B7)

- **Concrete specifics are REQUIRED** in the sidecar (B2): an object handed
  over, a price or debt, a code, a count, a deal or promise, a name said in
  passing, a mark or injury — at most five per response, so the sidecar does
  not grow. The rolling-summary prompt keeps the same specifics exact.
- **Move narration reads the ring** (B1): the last `MOVE_RING_CARDS` (4)
  entries, bounded by `narratorContextCards`. No new setting.
- **A ring entry is the player's line, then the prose** (B5): move and paced
  cards store `playerText` / `playerName`, @scene answers
  `sceneQuestion` / `playerName`. The rolling summary reads the same entries.
- **The scene frame's recorded cast joins the matched set on every path**
  (B3, `addSceneFrameCast`): cards, ledger scope, consistency-check context.
  It runs after relevance resolves, so a move's permission class and its tier
  pass still come from the player's text alone (architecture §8.2).
- **Free-text ledger subjects are always in scope** (B4). The ledger holds
  only the current scene, so its unrecorded figures and places are
  scene-local by construction.
- **The rolling summary regenerates after a card posts** (B7,
  `registerRollingSummaryRefreshHook`, canonical GM, single-flight). Prompts
  read the cached text.

**Why:** in the first 30 cards of a session a move was narrated with no
earlier prose at all; what a player wrote survived only if the narrator
repeated it; "I convince him" lost the partner's card and facts; "dock
master" or "her" lost "the dockmaster"; and a due summary regen — a Haiku
call over the whole session — ran inside the narration it delayed.

**Rejected:**
- *The full paced ring on moves.* Uncached input every move pays for; four
  entries carry the immediate scene. Section F of the issue proposes a cached
  scene transcript instead.
- *Frame-unioning the move path's relevance call.* It would move the hybrid
  permission class (§8.2).
- *Fuzzy matching for text subjects* ("dock master" ~ "dockmaster"). Every
  text subject is this scene's, so scope is unconditional.

## Ledger state sheds by priority; entity cards show the newest details (2026-10)

**Decision:** (issue #286 A6 / A7)

- **State sheds line by line.** When the §6.5 block is over
  `factContinuity.maxLedgerTokens`, state lines drop one at a time: every
  other attribute before a character's location / vessel / condition (the
  REQUIRED emissions; `STATE_KEPT_LONGEST`, `narratorPrompt.js`), the oldest
  first within each. The tier order is unchanged: frame, truths, CORRECTED
  and ship position are never dropped.
- **Truths carry `sessionNum`** (and keep `createdAt`), and the scene-end
  migration copies both onto the tier entry, so a migrated truth reads
  "Session N:" like every other tier detail.
- **The entity card shows up to 10 tier details**: pinned first, then the
  newest (a tier is append-only, so append order is recency). Up to 4 lines
  go to the newest binding traits (`scene_truth_migration`,
  `wj_lore_entity_route`) before newer developments fill the rest.

**Why:** the whole state block used to drop at once. With a command vehicle
on record it dropped at the 7th in-scope truth, REQUIRED NPC location and
condition included, and stayed dropped for the rest of the scene because
truths only grow. The card sorted by `sessionNum`, which migrated truths never
had, so they sorted last, and its stable sort kept a session's oldest five
details and cut the newest. Once entity truths migrate (A1), a scar recorded
three scenes ago would otherwise hide behind any five newer developments.

**Rejected:**
- *Drop truths to keep state.* Truths are binding; state is "right now".
- *A setting for the card window.* "Don't add knobs before using the existing
  ones" (rules/narrator-memory.md); 10 lines is about 150–300 tokens a card.
- *Sort by `createdAt`.* Older tier entries have none; append order is the
  same ordering and needs no migration.

## `@scene` continues the scene in progress (2026-10)

**Decision:** (issue #286 A4) `@scene` asks about the scene in progress, so it
continues that scene. The intercept no longer calls `startScene`;
`interrogateScene`'s `ensureSceneStarted` starts a scene only when none is
active, on the canonical GM. Scenes end at `!scene end`, End Session
(`session_close`), the close-out before a new session is minted
(`session_gap_remint` — see "A session ends at End Session or after four idle
hours"). *(Issue #326 D7: the `closeWorld` handler that also ended a scene is
deleted — Foundry documents no such hook.)* Pacing's move-density window still
resets on `@scene`: that is a pacing heuristic, not a scene boundary.

**Why:** scope #227 §2.3 / §9.1 made every `@scene` a scene boundary when it
was the only boundary signal the module had. The scene frame and the REQUIRED
NPC location and condition state (2026-06-10) arrived later, and both are
scene-scoped. So `@scene` ended the scene it was asked about: `startScene`
migrated the truths, discarded the state and cleared the frame on the same
object `interrogateScene` then built its prompt from. The answer was written
without the frame, truths, state or CORRECTED list, and the frame-present
relevance union was empty.

**Rejected:**
- *Keep `@scene` as a boundary and carry only the frame across.* The truths
  and state would still migrate out from under the question.
- *A separate `@scene new` verb.* `!scene start` already exists.

Supersedes scope #227 §2.3 / §9.1 ("every `@scene` begins a new scene").

## Tests run on Foundry's permission model and a simulated multi-client table (2026-10)

**Decision:** (issue #282) By default, the unit suite's Foundry stubs enforce
Foundry's permission model. A non-GM's world-setting write, a non-author's
`ChatMessage` update or delete, and an `Actor` update without OWNER all
reject, with Foundry's wording. Behaviour that depends on which client runs
it is tested on `simulateTable` (`tests/helpers/multiClient.js`), which boots
`src/index.js` once per client over a shared world. That covers command
routing, GM relays, card buttons clicked on another client, and writes that
land while the move pipeline runs. Where a real producer exists, fixture
state comes from it (`rules/reachability.md` §3).

**Why:** every defect the 2026-10 audit found passed a green suite. The stubs
let any user write anything, and each unit test fired a hook once, as one
user (usually a GM). So the suite could not see a player's refused write, a
command running once per client, or a relayed write reverted by the
pipeline's stale snapshot. With each fix reverted locally, the harness now
fails on the four bugs the issue names (known-issues.md → "Multiplayer test
infrastructure"). Without the permission stubs, the reverted X-Card passes.

**Rejected:**
- *Opt-in permission checks.* The default user would stay a GM, and the next
  GM-gated write would pass by accident. The checks are on;
  `withoutPermissionChecks(fn)` is only for seeding fixtures.
- *A second browser in E2E as the only multi-client coverage.* It is slow
  and runs only in CI. It is the complement instead: the second-client
  suite (`test/ci/playwright/multiplayer.mjs`, issue item 6) checks five
  scenarios against real Foundry permissions and sockets after Quench.
- *Mocking module boundaries per client.* `vi.mock` factories run once per
  file and are shared by every client. Instead, each client gets its own
  module graph (vitest's module cache, routed per client through
  AsyncLocalStorage), and the network boundary is stubbed (`table.claude`).

**Cost:** the harness depends on a vitest internal
(`__vitest_worker__.moduleCache`, vitest 3's vite-node runner).
`simulateTable()` throws a clear error if it is missing, so a vitest upgrade
that changes it fails loudly. The remaining limits are in the harness header.

## Chat commands run once: author / canonical-GM / keyed-runner routing (2026-10)

**Decision:** Every chat command is declared in `CHAT_COMMAND_ROUTES`
(`src/index.js`) with a run-on policy; `dispatchChatCommand`
(`src/multiplayer/commandRouting.js`) enforces it. Every client *recognises* every command (so
a command never falls through into the move pipeline), but exactly one client
*executes* it:

- **`RUN_ON.AUTHOR`** — the client that typed the message (`isAuthoringClient`
  / `messageAuthorId`, `src/multiplayer/speaker.js`). The default: dice roll
  once, dialogs open on the typist's screen, and a GM-only command's
  `game.user.isGM` check runs on the author's own client, so it means what it
  says. World writes a player needs go through the GM relay (next entry).
- **`RUN_ON.CANONICAL_GM`** — only the canonical GM (`isCanonicalGM`), for
  commands that write world state on someone's behalf and need no Claude key
  (today: a programmatic `!x`). With no GM connected the author is warned.
- **`RUN_ON.CLAUDE`** — commands whose job is a Claude call (`@scene`,
  `!recap`, `!ship envision`, `!ship history`, `!incite`): the canonical GM
  when a keyed GM is active, otherwise the author with their own key (see
  "Claude calls run where a key lives, exactly once").

Clients that stand down leave a `console.debug` breadcrumb ("No silent
failures"). Routes keep the old if-chain's predicate order, since some
predicates overlap textually. A message with no resolvable author (a
programmatic / legacy shape) counts as authored on every client — the
pre-routing behaviour for those shapes.

**Reason:** Foundry fires `createChatMessage` on every connected client, and
only three handlers checked their author (2026-10 audit — known-issues
CMD-PER-CLIENT, CMD-GM-ONLY-LEAK, DIALOG-EVERY-SCREEN). Every command ran once
per browser: duplicate `!oracle` / `!ptp` / `!bond` cards with independent
dice, one Claude call per keyed client, dialogs on every screen, and GM-only
commands that warned the player and then executed anyway on the GM's client.
Several player features only "worked" through that accident (the GM's client
re-ran the player's command with GM authority), which is why routing shipped
together with the relay. One declarative table makes the policy greppable and
testable per command (`tests/unit/chatCommandRouting.test.js`).

**Rejected:**
- *Per-handler author checks* — the three that existed proved it: easy to
  forget on the next command; one routing check can't be skipped.
- *Run every command on the canonical GM* — dialogs would open on the GM's
  screen, `game.user` would be the GM (wrong speaker, wrong permission check),
  and keyed players at keyless-GM tables would lose Claude commands
  (CLAUDE-CMD-KEYLESS-GM).
- *Keep per-client execution and dedupe the cards* — still N dice rolls and N
  Claude bills, and still N writers.

## Player-invoked world writes go through the GM relay (2026-10)

**Decision:** A world write a player's action needs — world settings
(`campaignState`), other users' documents, GM-authored chat cards — is
requested with `requestGmAction(kind, payload)` (`src/multiplayer/gmRelay.js`)
and performed by a handler on the canonical GM:

- On the canonical GM it runs locally; elsewhere it is emitted on the module
  socket as `gmRelay.<kind>`; with no active GM the requester is warned (log +
  toast) and gets `{ ok: false, reason: "no-gm" }`, so the card can say the
  change was not saved.
- Every kind is declared in one table, `GM_ACTIONS` (kind → lazy module import
  + handler export name): a grep for a handler finds its consumer, and the GM
  can serve a relay for a module its client hasn't loaded yet.
- Handlers are `(payload, ctx)` with `ctx = { requesterId, requester,
  requesterIsGM, local }`. Permission checks use `ctx.requesterIsGM` /
  `requesterOwnsActor(actor, ctx)` — never `game.user.isGM`, which is the GM on
  the relay path. Payloads are plain JSON; handlers re-validate and clamp them
  and take effect values from the GM-authored card, not the payload.
- Every action runs through **one serialised queue** on the GM, released in a
  `finally`; a predecessor that never settles is waited on for at most its run
  budget (warned), counted from when it started running: `GM_ACTION_TIMEOUT_MS`
  (60 s), or `GM_CLAUDE_ACTION_TIMEOUT_MS` (two bounded Claude requests, 270 s)
  for a kind marked `claude: true` — issue #300 F15: the flat 60 s cap was
  shorter than one Claude request, so an ordinary slow narration let the
  action behind it run alongside it, and a backlog behind one slow action
  timed out together. Handlers' campaignState read-modify-writes therefore
  never interleave. A handler must not call `requestGmAction` itself — it
  would queue behind its own caller. **The
  X-Card is the exception:** `xcard.activate` runs the moment it arrives —
  queued behind a Claude-calling handler (an oracle follow-up, a burn
  re-narration, End a Session's summary) it waited up to 60 s while the
  unqueued move pipeline narrated through it (XCARD-QUEUED). That is safe
  because `suppressScene` reads and writes the store with no await between,
  and no handler writes back a snapshot held across an await (next entry; the
  session activity stamp did, until issue #342 Z01 gave it a setting of its
  own). Since the eleventh audit's open items the pause also jumps the
  client's campaignState write chain (`runCampaignStateWriteNow`): every other
  read-and-set write waits behind it, and it waits for none. **A player's
  Private Lines sync is the second exception** (issue #345 D5):
  `safety.syncPrivateLines` runs the moment it arrives too, though its write
  still waits its turn on the chain — see "The Private Lines sync runs
  unqueued, like the X-Card".
- Relays are fire-and-forget (no ack). Once its listener is installed, the
  canonical GM broadcasts `gmRelay.ready` (`announceGmRelayReady`); state a
  player must hand the GM is **pulled** on that signal (`onGmRelayReady` —
  Private Lines), never pushed on `userConnected`, which fires before the GM's
  `ready` hook installs the listener. One-shot card buttons re-arm when a
  relayed click isn't confirmed (`relayCardAction` / `relayCardButtonClick`,
  15 s).
- **Accepted limitation:** Foundry's module socket doesn't identify the
  sender, so `requesterId` is client-asserted. Permission checks protect
  honest clients and the module's own UI; they don't stop a hand-crafted emit
  from a console or macro. Value validation bounds what even a forged request
  can do to what the UI could have produced. **Update (issue #347 AB23):** the
  same bound holds for a chat message's flags, which any user can write too —
  a ship-token drop's `tokenDragSetCourse` payload is checked against what
  the drop produces (a sector Scene, the command vehicle's token, a
  settlement pin's coordinates; `checkedTokenDragCourse`) before the GM's
  client moves a token by it.

Kinds today: `xcard.activate`, `safety.setFlag`, `session.takeBreak`,
`safety.syncPrivateLines`, `session.begin`, `session.end`, `bond.apply`,
`factContinuity.command`, `oracle.narrate`, `repair.apply`,
`payThePrice.advanceClocks`, `move.burnMomentum`, `move.improveResult`,
`milestone.pick`, `connection.pick`, `fightVow.markMilestone`,
`fightVow.deepenBond`, `suffer.pick` (issue #302), `chronicle.edit` (issue #306 — every Chronicle
write, the automatic writer's included), `payoff.retry` (issue #306 R04 — a payoff failure card's
Retry, GM only), `narrator.sidecar` (issue #286 D2), `waypoint.oracle` (issue #316 T06),
`fulfilVow.pick` (issue #321 U02 — a "Which vow?" pick), `milestone.suggestion` and
`expedition.recommit` (issue #321 U20 — a move card's "⚑ Mark Progress on Vow" and a
finish-miss card's "🔁 Recommit", each claimed once on its card), `progressTrack.edit` and
`entity.edit` (issue #321 U05 — every Progress Tracks and Entities panel edit, from any user, as
an `op` the handler validates), `privateChannel.createJournal` (issue #321 U10 — the GM creates a
player's Private Channel journal with the player as OWNER). The older world-writing socket
relays that predated it are all folded in: `expedition.recommit` (issue #321 U20),
`vow.setReward` / `vow.linkConnection` as `vow.reward` / `vow.link` (issue #325 W11) and
`combat.enterFray` as `combat.threshold` (issue #329 X06). `fulfilVow.attempt` is a move
card's or won-fight card's "🏁 Attempt to Fulfill", claimed once on its card (known-issues
FULFIL-BUTTON-LOCAL-DISABLE).

**Reason:** world settings and other users' documents are GM-write only, so
player-invoked flows (Set a Flag, Take a Break, Begin / End a Session, the
X-Card, `!bond`, `!truth` / `!state`, `!repair`, Burn / Improve, the pickers)
skipped their writes behind `if (isGM)` while their cards said the change had
landed (SESSION-WRITES-DROPPED, XCARD-PLAYER-NOOP). One contract — one no-GM
warning, one requester context, one queue — replaces a family of ad-hoc
relays with as many failure modes. The post-merge review hardened it
(RELAY-LOAD-WINDOW, RELAY-PAYLOAD-UNCHECKED).

**Rejected:**
- *Per-feature card-payload hooks* (each card with its own socket kind and GM
  listener — the pre-audit pattern) — no shared no-GM warning, requester
  context, serialisation or validation. The won-fight buttons' raw relays were
  exactly this, and they double-fired (FIGHT-VOW-BUTTONS-REFIRE).
- *Letting player writes fail silently* — "No silent failures": the cards
  claimed effects that never happened.
- *A socketlib dependency* — a runtime dependency every world must install
  (and a new-dependency discussion per CLAUDE.md) for what one ~400-line
  module does; it would still need the queue, the no-GM warning and the value
  validation.

## Long-running pipeline writes merge relay-owned fields (2026-10)

**Decision:** Code that holds a campaignState snapshot across long awaits
never writes the whole snapshot back.

- `persistResolution` re-reads the stored campaignState immediately before its
  write (no await between read and set) — since the eleventh audit's open
  items at its turn on the client's write chain, and `writeOwnedFields` is the
  rejecting twin of `persistCampaignStateFields` for callers that report a
  refusal — and merges (`mergeWithLatestState`):
  **store-owned** fields always take the store's value (`xCardActive`,
  `xCardPlays`, `safety`, `safetyFlags`, `nextMoveAdd`, `questFocus` / `connectionFocus`, the
  session-active and session-id fields (`sessionStartedId` included),
  `customOracles`, `recentOracles`,
  `clocks`, `pacing`, `campaignRecapCache`, `dismissedEntities`, `pendingMove`,
  `activeSectorId`, `incitingIncident`, the `worldTruths*` fields; since issue
  #321 `xCardRedirect` and `xCardedNarrationIds` (U07) and `loreRecap` (U06g —
  a move resolved during `!lore` reverted the new recap)); entity id
  lists are an ordered union; `artAssetIds` (a map) keeps both sides' entries,
  the store's winning a clash; (`sessionLogs` came from the store plus this
  resolution's entry — the log is retired, issue #326 W58); `sessionSummary` by newer `updatedAt`; `legacyTracks`
  take the per-track max (`cleared` sticks); scene ledgers — if the store is
  on a different scene its scene wins wholesale, otherwise `sceneTruths` is
  unioned by id (a retraction on either side sticks) and `sceneState` /
  `sceneFrame` / `spotlight` keep the working copy — except what a narration
  the X-Card removed wrote (the store's `xCardedNarrationIds`), which is
  retracted from the working copy first, a frame it wrote yielding to the
  store's (issue #321 U07). Every other field keeps the
  working copy (the pipeline's own writes: arrival location, site reveals …).
- Scene start / end write only the fields they own onto the latest stored
  state (`persistCampaignStateFields` / `mergeOwnedFields`,
  `src/factContinuity/sceneLifecycle.js`): `currentSceneId`, `sceneTruths`,
  `sceneState`, `sceneFrame`, `spotlight`. So does End a Session —
  `questFocus`, `connectionFocus`, `sessionActive`, `sessionActiveStartedAt` —
  which holds its snapshot across `endScene` and the summary's Claude call
  (END-SESSION-CLOBBER: it reverted a move persisted meanwhile, even its
  released `pendingMove` lock).
- The narrator-sidecar persist (`persistSceneLedgerFields`) writes
  `sceneTruths`, `sceneState`, `sceneFrame` with the same scene-ledger policy
  as `persistResolution` (`mergeSceneLedgers`, shared): nothing when the store
  has moved to another scene, `sceneTruths` unioned by id otherwise
  (SIDECAR-LEDGER-CLOBBER: replacing them dropped a mid-narration `!truth`
  strike or oracle truth and resurrected a scene End a Session had closed).
- *(Issue #321 U06.)* The other writers that hold a snapshot across an await
  write the same way. `!truth` / `!state` and the correction dialog correct a
  fresh copy and persist only the ledger field they changed through
  `persistSceneLedgerFields`, a Strike's or Replace's regen mark on the rolling
  summary made on the latest store in the same write (`opts.onto` →
  `markSummaryForRegen`; U06b, U06e); the inciting premise rides it too
  (`onto` sets `incitingIncident`, U06d); `!lore` writes only `loreRecap`
  (`mergeOwnedFields`, U06a); `!reveal-site` / `!clear-site` save the site's
  flag onto the state as it is after their awaits (`persistSiteFlag`, U06c);
  and a narration whose snapshot holds no scene adopts the store's active one
  instead of starting a second (`startScene`, U06f). Each used to write its
  whole read back, reverting an X-Card, a Take a Break, a narration's truths
  or a released move lock that landed meanwhile.
- Single-field consumers re-read the store: Take a Break's +1 is claimed on
  the store before it is added (`consumeNextMoveAdd`, issue #342 Z52 — it was
  added from the working copy and cleared after), every narrator X-Card gate reads
  the live setting as well as the caller's snapshot, and the narrator's safety
  block and recent oracle results are read from the store (issue #321 U08 —
  Lines, Veils and oracle answers added while a move waited were missed).
- Registrations write only their own key onto the latest store (issue #300
  F14, CREATE-PERSIST-WHOLE): an entity creator unions its new id into its id
  list (`registerEntityIdInStore`, `src/entities/registry.js`), a portrait its
  art-asset entry (`registerArtAssetInStore`), and the sector store its sector
  (`persistSectorOntoStore`). Each still updates the caller's copy, so the
  caller's own later persist keeps the id. Creators used to write the caller's
  whole object — the Make a Connection auto-create wrote the move pipeline's
  snapshot and could clear an X-Card played mid-narration.

**Reason:** STALE-SNAPSHOT-CLOBBER — the move pipeline reads campaignState
before its confirm dialog and Claude calls (seconds to minutes) and wrote it
back wholesale, undoing everything the GM relay applied meanwhile: an X-Card
played mid-narration, a Take a Break, a flag, Private Lines, `!bond` ticks,
oracle memory, clocks. The relay makes mid-pipeline writes normal, so the
long-running writer is the one that has to yield.

**Rejected:**
- *Serialise the pipeline's persist behind the relay queue* — the snapshot is
  already stale by the time the write is queued; holding the queue for the
  whole move instead would block the X-Card for as long as a player sits in
  the confirm dialog.
- *Re-read only `xCardActive`* — fixes the headline case and leaves every
  other relayed field to be reverted.
- *A three-way merge against a baseline captured when the move lock is taken*
  — more precise for fields both sides write; deferred until a playtest shows
  the static policy losing data.

**Trade-offs accepted (no baseline):** two concurrent adds to the same legacy
track keep the larger tick count; `sceneState` / `sceneFrame` / `spotlight` /
`currentLocation*` / `sectors` changed by a relay mid-pipeline are overwritten
by the pipeline's copy; an entity id removed from the store mid-pipeline can
return via the id-list union (readers filter missing documents).

## X-Card: anyone plays it, a GM resumes it (2026-10)

**Decision:** Any user can play the X-Card. A typed `!x` is cancelled before
the message is created (the settings panel's `chatMessage` hook) and handled by
`playXCard`, which relays `xcard.activate` to the canonical GM
(`suppressScene` sets `campaignState.xCardActive`, no permission check) and
posts the X-Card card. A programmatic `!x` message (a macro) is routed
`RUN_ON.CANONICAL_GM`. With no GM connected the card says the pause could not
be recorded and carries no resume button; when the GM's write of the pause
fails, the card says it could not be saved — the GM's own card on a relayed
play, whose player's card (no ack) already says paused (issue #302). Only a GM resumes: the card's
**Resume narration** button (removed for non-GM viewers), `!x clear` (a player
is warned), or `game.modules.get("starforged-companion").api.clearXCard()`.
Resuming clears the flag, marks every open X-Card card resolved and posts an
"X-Card cleared" card. While the flag is set every narrator entry point stands
down — checking the live setting as well as the caller's snapshot, on entry
and again when each Claude call returns, so a narration in flight when the card
is played is discarded unposted (issue #300 F13) — even when a GM resumes before
its reply arrives: each play counts in `xCardPlays`, and a narration whose
count moved stays discarded (issue #306 R01); the relayed activation runs
the moment it reaches the GM, never queued behind other relayed actions — and a
move resolved meanwhile posts its result card plus a short "narration paused"
notice (not a narrator card, so it stays out of the recent-narration ring and
the rolling summary).

*(Issue #321, maintainer decisions.)* The Private Channel's narrator and its
Publish are narrator entry points too: `requestPrivateNarration` stands down
on entry and discards a reply that returns after a play, and Publish is
refused with a warning — a published reflection is canon (U09). The narration
the card answers **leaves narrator memory — full exclusion** (U07). In the
same write as the pause, `suppressScene` → `applyXCardToNarratorMemory`
(`narrator.js`) takes the newest narration of the session still in memory,
with the narrator cards of the same beat (posted after the last message
someone sent, at most two minutes older; an earlier X-Card's card, its
"cleared" card or a card it removed bounds the beat, so a repeat play removes
nothing more), retracts what their sidecars wrote (truths `retractedBy:
"xcard"`, state values removed, a frame they wrote giving way to the frame
it replaced — issue #345 D3; it was cleared — by the
`narrationId` each card and ledger entry carries), records their ids on
`xCardedNarrationIds`, empties a rolling summary that covered them and sets
`xCardRedirect`; the pause is written even if that part fails. After the
write the cards are flagged `xCarded` — out of the ring, the rolling summary
and the session recap's prose, with no Play button — and each retracted
truth runs `propagateRetraction`; the retractions block re-assertion but are
never named under CORRECTED. The first narration after a GM resumes carries
the X-CARD — REDIRECT block (prompt section [1b]), which never names the
removed content; `registerXCardRedirectHook` clears `xCardRedirect` once a
narration has posted with the X-Card lifted.

**Reason:** the X-Card is the safety tool a player reaches for without
explanation, and for players it recorded nothing (XCARD-PLAYER-NOOP); move
narration also had no gate of its own — its only one lived in the retired
context assembler (XCARD-MOVE-NARRATION). There was no in-module way to
resume — the help told GMs to run a console snippet.

**Rejected:**
- *GM-only X-Card* — defeats its purpose: any participant must be able to stop
  the scene.
- *Anyone resumes* — the person who played the card shouldn't have it lifted by
  someone else; one resume authority (the GM, who runs the redirect) keeps the
  table's pause deliberate.
- *Auto-clear on the next scene or after N turns* — resuming is a table
  conversation, not a timer.

## Custom oracle tables roll their own die (2026-10)

**Decision:** A custom table (`!oracle-add`, GM-only) rolls 1..(the highest
`max` among its entries): `dieSizeForTable`, stamped as `die` by
`registerOracleTable`, returned by `rollOracle` (through "Roll twice" re-rolls
too) and shown on cards ("d6 = 4"; Dice So Nice animates only d100 rolls).
Entries must tile 1..max exactly — start at 1, contiguous, no overlaps
(`validateCustomOracleEntries` names the problem) — and ids are
`[A-Za-z0-9_]+` so `!oracle <table-id>` can parse them. Re-saving a custom id
overwrites it; built-in ids can never be redefined or unregistered. **Built-in
tables stay d100** (locked by `oracleTableIntegrity.test.js`).

Storage: `campaignState.customOracles` is canonical. The `ORACLE_TABLES`
entries with `category: "custom"` are a per-client in-memory mirror, rebuilt
at ready (`rehydrateCustomOracles`) and kept in step on every `updateSetting` /
`createSetting` of campaignState (`syncCustomOraclesFromState`: registers new
or changed tables, unregisters removed ones — custom only, idempotent).

**Reason:** CUSTOM-ORACLE-D100 — the play kit's blank oracle worksheets are
d4 / d6 / d8 / d10 tables; rolling a d100 against a 1–6 table missed 94% of
the time. New tables reached other clients only after a reload, and deletions
never did — a mirror with no write-through (rules/reachability.md §5).

**Rejected:**
- *Scale custom entries onto 1–100* — distorts the author's odds, and the card
  no longer shows the worksheet's die.
- *A separate die field* — the highest entry already says it; a second field
  invites a die the entries don't cover.
- *Accept gapped tables (gaps roll "—")* — new tables are refused with the
  reason. Tables stored before validation existed still register (no data
  loss) with a warning to re-define them.

## Take a Break's +1 applies to the next action roll (2026-10)

**Decision:** Take a Break → "Move on" records a single-use
`campaignState.nextMoveAdd` (`{ value: 1, source: "take_a_break", setAt }`) on
the canonical GM (`applyTakeBreak`, relay `session.takeBreak`). The move
pipeline applies it automatically to the next **action roll** — a move rolled
with a stat (`isActionRollMove`: not a progress move, has a stat) — adding it
to the roll's adds once it is claimed — deleted from the store first, so a
refused claim adds nothing and the next roll cannot take it again
(`consumeNextMoveAdd`, `src/moves/nextMoveAdd.js`; issue #342 Z52).
Progress moves and no-roll moves (Reach a Milestone, session moves …) leave it
pending. It is table-wide: the next action roll gets it, whoever makes it.

**Reason:** TAKE-BREAK-NEXTMOVEADD — the flag was written and never read; the
card promised a +1 nobody received. The play kit's "+1 on the next
non-progress move" is not optional, so the pipeline adds it to the roll's
adds itself, alongside the confirm dialog's asset adds.

**Rejected:**
- *Prompt whether to spend it* — the bonus isn't optional; a prompt adds a
  dialog to every roll while it's pending.
- *Apply to the next move of any kind* — the rule excludes progress moves, and
  a no-roll move has nothing to add to.
- *Let the table choose the recipient* — the rule allows "you or an ally";
  the next action roll is the common case and needs no extra prompt.

## A typed move rolls a stat it lists — except under the Chaotic dial (2026-11-03)

**Decision (maintainer, issue #325 W19):** the move interpreter holds a typed
move to the stats the move lists (`interpreter.js` `parseInterpretation`): a
stat the move does not list gives way to its first — Gather Information is
always +wits, Check Your Gear +supply. Under the **Chaotic** Mischief dial the
Trickster may roll an unlisted stat: its framing ("Consider unusual stats",
"Find the stat that seems least relevant", `mischief.js`) is kept, a
deliberate departure from the move text for comic, high-chaos play. A move
already chosen before the interpretation (a forced move's stat-only reading,
issue #321 U04) is held to its list on every dial.

**Reason:** under Lawful and Balanced nothing invites an unlisted stat, yet
the parse checked the model's stat only against every stat name the module
knows, and the confirm dialog shows the stat as text with no picker — so a
model slip was rolled with that stat's sheet value.

**Rejected:** *drop the "unusual stats" framing and clamp under Chaotic too*
(the recommended option) — the maintainer kept the Trickster's latitude; on
the Chaotic dial an unlisted stat is the dial working as designed.

## Combat position is per character (2026-11-01)

**Decision (maintainer, issue #322 V03):** each player character holds their
own combat position in a fight. The fight's progress track stays the
canonical store: it holds each PC's position (`positions[actorId]`) beside the
fight's last-set one (`combatState`); the actor's `system.combatPosition` and
the combat tracker's badge mirror it (`applyCombatPositionToTrack`, the one
writer — a foe's badge sets the fight's alone). The **roller's own** position
drives the interpreter's position directive (`getActiveCombatPosition(actorId)`)
and Take Decisive Action's bad-spot downgrade (`combatPositionFor` on the
scored fight); the fight's last-set position is the fallback for a PC with
none of their own. The narrator's [4j] line names each PC's position.

**Reason:** one value per fight remapped a PC in control's Strike to Clash and
downgraded their Take Decisive Action because another PC was in a bad spot —
the rulebook (Battle Stations!, the p. 187 pilot-and-gunner example) and this
file track position per character. The sheet field that was written was read
only by the badge.

**Rejected:** *reading the sheet field as the store* — it outlives the fight
(nothing clears it), so a stale position would steer the next fight; on the
track, a PC's position ends with its fight.

## The roller's +1 on the next move is applied automatically (2026-11-01)

**Decision (maintainer, issue #322 V02):** "+1 on your next move (not a
progress move)" — Secure an Advantage's strong hit (beside its +2 momentum),
its weak-hit pick and Gain Ground's pick — is recorded for the **roller** as
`campaignState.nextMoveBonuses[actorId]` (`{ value, sources, setAt }`) and the
move pipeline adds it to **that character's** next action roll
(`src/moves/nextMoveAdd.js`). The pick's executor (sufferDialog `next-bonus`)
grants it on the canonical GM, where a choice card's pick runs; the strong
hit's rides its consequences (`nextMoveBonus: 1`), granted by
`applyOutcomeEffects` — so a Burn or Improve Result that upgrades a weak hit
to the strong hit grants it too. The pipeline takes it with
`consumeNextMoveBonus`, after Take a Break's add, claiming it on the store
first: a refused claim adds nothing and leaves it pending, so it is never
added twice. Progress and no-roll moves leave it pending; two pending grants
add up. The field is store-owned in `persistResolution`'s merge. A grant the
world refuses is reported on the choice card, with the GMs' Retry
(`isRetryableSufferCall` accepts `next-bonus`).

**Reason:** NEXT-MOVE-BONUS-DEAD — the pick posted "Remember to add +1 to your
action die result on the next roll" with a `nextBonus` flag nothing read, the
pipeline rolls the next move itself and the confirm dialog has no adds input,
and the strong hit's +1 was the card's text alone. Take a Break's identical
+1 had the same defect, fixed the same way (above).

**Rejected:**
- *Table-wide, like Take a Break* — the move says "your next move"; Take a
  Break's "you or an ally" is the table's.
- *A manual adds input on the confirm dialog* — it asks the player to remember
  a bonus the module already knows, on every roll.

Like Take a Break's, the +1 reaches the move pipeline's rolls only: `!bond`
and a roll made on the system's character sheet do not take it.

## Truths saved in the World Truths dialog reach the narrator (2026-11-01)

**Decision (maintainer, issue #322 V34):** revised World Truths propagate to
the narrator. `campaignState.worldTruths` is the one store the narrator reads
— the WORLD TRUTHS block and `getTruth` (the vow scene's Iron truth) — and it
is written through on **every** save of the truths, always together with
`worldTruthsJournalId`, the journal `!lore` summarises:

- the Playtest Quickstart's, as before (`storeWorldTruths`);
- each save of the system's dialog (`!truths`, the toolbar button, the setup
  card): the `createJournalEntryPage` hook parses the new "Setting Truths"
  page into `worldTruths` as it links the journal (`recordSystemTruths`) —
  each category's chosen option, its sub-table result and the line that
  introduces it, its text and quest starter; a custom truth's first
  paragraph. A save with no truth that reads (the dialog's empty save) moves
  nothing;
- at world load (`reconcileSystemTruths`, canonical GM): a world whose truths
  were saved in the dialog before this holds none of them in `worldTruths`,
  and one that saved twice before #321 U65 may link its first save — each is
  brought up to the newest save; the Quickstart's own journal, when linked,
  is left alone;
- `!lore`'s repair of a stale link links the journal it found with that
  journal's truths, not the id alone.

The newest save wins, as #321 U65 made it for `!lore`. Each write is the
`worldTruths*` fields alone, merged onto the latest stored campaignState.

**Reason:** TRUTHS-TWO-STORES — a dialog save was recorded as
`worldTruthsSet` / `worldTruthsJournalId` only, which `!lore` alone read: a
world set up in the dialog gave the narrator no WORLD TRUTHS, and one that
revised the Quickstart's truths in the dialog kept the Quickstart's while a
`!lore` recap of the revision said otherwise (rules/reachability.md §5, one
canonical store written through on every change).

**Rejected:** *every reader takes the linked journal* — the WORLD TRUTHS block
is built for every narration, so it would parse a journal page per call, and
the module's own journal holds its truths as a flag beside its page, so the
readers would need both paths; parsing once per save keeps one shape for both
sources. *Matching the dialog's options to the module's truth tables* — the
module's option titles are condensed from the book's (24 of the system's 42
differ), so the page's own text is what is parsed.

## Claude calls run where a key lives, exactly once (2026-10)

**Decision:** The Claude key is per browser (issue #209), so work whose job is
a Claude call picks its runner from data every client shares — the
world-scoped keyed-GM registry (`keyedGmUserIds`, kept by
`advertiseClaudeKeyPresence`) and the active-user list — so all clients agree
and exactly one runs it:

- a keyed GM is active (`hasKeyedActiveGM()`) → the canonical GM runs it. It
  is keyed by construction (`isCanonicalGM` picks among keyed active GMs
  first), so the call succeeds **and** its world writes and narrator
  side-data apply;
- otherwise → the author's client runs it with its own key (a keyed player at
  a keyless-GM table). GM-only writes are then skipped and debug-logged — the
  scene start included: the narrators' `ensureSceneStarted` (which `@scene`
  goes through) starts a scene on the canonical GM only (SCENE-START-OFF-GM),
  and so does an `@scene` answer's post-narration capture, the detection and
  tier passes (`scheduleSceneAnswerCapture`, issue #321 U36); a keyless
  author gets the usual "Claude API key not configured" fallback. Since issue
  #286 D2 the narrator side-data is the exception: it is relayed to the
  canonical GM, which starts a scene to hold it (see "Narrator side-data,
  draft confirm and detection").

This is `RUN_ON.CLAUDE` for `@scene`, `!recap`, `!ship envision` / `history`
and `!incite`, and the same ladder in `requestOracleNarration`
(`src/oracles/oracleFollowup.js`, relay `oracle.narrate`) for the follow-up
after `!oracle yes`, `!oracle <table-id>`, `!pay-the-price` and Face Defeat —
where "no key anywhere" skips with a debug line, since the raw card already
carries the result. A vow or bond progress roll made on the vendor sheet is
narrated by the same ladder (`nativeRollNarratesHere`, issue #321 U11), decided
by its `createChatMessage` hook on every client — no relay; it used to be
narrated on the roller's client always, so a keyless player got "Narration
unavailable" at a table whose GM holds the key. The move pipeline itself stays canonical-GM-only (single
emitter). Exception: the Begin / End a Session vignettes run inside the
canonical-GM relay handlers, so they need a keyed GM (known-issues, 2026-10
accepted limitations).

**Reason:** ORACLE-SIDECAR-OFF-GM, CLAUDE-CMD-KEYLESS-GM, INCITE-ROUTING.
Running on the author whenever it held a key silently dropped the narrator
sidecar (applied only on the canonical GM); running only on the canonical GM
broke keyed players at keyless-GM tables; per-client execution (pre-audit)
made one call per keyed client. The transport is unchanged — every call is
still a direct browser fetch ("CORS strategy"); the relay only decides *which*
client makes it, with the author's own key as the no-keyed-GM fallback.

**Rejected:**
- *Always the author* — side-data and GM-only writes lost whenever a keyed
  player typed.
- *Always the canonical GM* — a keyless-GM table loses every Claude command.
- *Send the key to the GM* — violates #209 (keys never leave the browser).

**Update (issue #347 AB03):** the election passes over a GM whose page is
still loading. A user is `active` from its socket's connect — the start of its
page load — but this module's handlers exist on that client only from its
`ready`; electing it stood the connected, ready GM down for the whole load (a
player's X-Card, typed moves and card presses reached no handler, and nobody
was told). Each client marks a GM whose connect it saw as loading and counts
it again from its page-ready announcement
(`gmRelay.js` `registerGmReadiness`, first thing in `ready`); a GM already
connected when the client loaded is presumed ready, as before. When every
active GM is loading, the election runs over all of them. `hasKeyedActiveGM`
and `isAudioGM` pass over a loading GM the same way. *Trade-off accepted:* at
the moment a lower-id GM's page reaches `ready` it counts itself canonical one
socket hop before the GM it replaces stands down; and two GMs whose loads
overlap each presume the other ready. The maintainer left that window as it
is (GM-ELECTION-HOP-WINDOW, 2026-11-12). *Update (issue #347
AB19-STALE-CACHE-WRITES):* a GM whose socket came back on a loaded page used
to answer an "is your page ready?" question at once; such a page is stale now
and stands down until it reloads, so the question is gone — its page passed
over (`noteGmStoodDown`) until the reload announces ready.

## An NPC card's or ship's notes are its sheet's Notes tab (2026-11)

**Decision:** For the two entity types whose host Actor has a Notes tab — an
NPC / connection card (an ironsworn `character`) and a ship (`starship`) —
the sheet's `system.notes` is the entity's notes, the one store. The record
getters read it (`getConnection` / `getShip` → `registry.withSheetNotes`), so
the narrator's ENTITIES IN SCENE Notes row (`notesAsCardText`), the tier pass
and the Entities panel's Notes field all show what the tab holds; the panel's
⤴ Promote appends the detail to the tab; `updateShip({ notes })` (an `!ship
envision` / `!ship history` append) writes the tab. The record's own `notes`
field is not read for these types (an empty tab is no notes, whatever the
record still holds); the other types, which have no Notes tab, keep theirs on
the record.

**Reason:** issue #329 X12 (NOTES-SHEET-NOT-MIRRORED) — the Auto-Seed writes
the introduction and portrait into the tab, and the GM edits the tab, but the
card read the record's `notes`, a second store only an envision and Promote
wrote: the narrator's Notes row was empty for every seeded NPC and ship and
never saw the GM's edits. One fact, two stores, no canonical one named
(rules/reachability.md §5); the sheet is what the GM edits and what the seed
writes, as for a starship's battered impact below. A detail promoted before
this change sat in the record's old `notes`, no longer shown: the canonical
GM's world load moves each such paragraph the tab does not already hold into
the tab and clears the record's copy (`migrator.moveRecordNotesToSheets`), and
`updateShip({ notes })` writes the tab alone (known-issues
NOTES-PROMOTED-BEFORE).

## Starship battered: the native sheet field is canonical (2026-10)

**Decision:** For a starship's impacts, the foundry-ironsworn native
`system.debility.battered` (and `cursed`) is canonical; the module ship flag's
`battered` is a write-through mirror. `isShipBattered(actorOrId)`
(`src/entities/ship.js`) reads the native boolean and falls back to the flag
only on a host with no native debility field. Every reader goes through it or
the native field — `repairIntegrity` (refuses to raise integrity while
battered), `!repair`'s `applyRepairSpends` (clears battered first via
`clearBattered`, then integrity), the entity panel's Battered / Cursed fields,
the narrator's COMMAND VEHICLE line, the suffer dialog's `!battered`
requirement. Writes go through `updateShip`, which sets both stores.

**Reason:** REPAIR-BATTERED-FLAG — the sheet's Battered toggle and the suffer
dialog write only the native field, and nothing in production set the flag
true, so a flag-only read missed every sheet-marked impact: an unclearable
battered vehicle that still gained integrity, and a panel and narrator that
said "not battered". rules/reachability.md §5: name the canonical store and
write through to the mirror.

**Update (issue #315 S05):** a consequence's or an asset effect's integrity
change goes through `changeIntegrity` (entities/ship.js), which reads
`isShipBattered` — the asset path wrote integrity directly and raised a
battered ship's.

**Update (issue #345 AA20):** the same rule for integrity — the STARSHIP
asset's Integrity track is canonical and the ship flag's `integrity` /
`integrityMax` its write-through mirror ("Issue #345 audit").

**Rejected:**
- *Battered if either store says so* — a stale flag would override a sheet
  un-tick.
- *A native → flag sync hook* — a second write path for a mirror no reader
  needs once readers use the native field.

## Private Lines in shared narration: a GM-built prompt carries every player's (2026-10)

**Decision:** The shared narrator prompt (`buildNarratorSystemPrompt` →
`formatNarratorSafetyContext`, `src/context/safety.js`) scopes Private Lines to
the client that builds it:

- **A GM's client** — the normal case: the move pipeline, and every
  `RUN_ON.CLAUDE` command while a keyed GM is active — carries **every
  player's** Private Lines, deduplicated, from `campaignState.safety.privateLines`
  (kept by the `safety.syncPrivateLines` relay). Players never see the prompt.
- **A player's client** — which narrates only when no keyed GM is online —
  carries **that player's own** lines, read from their client setting (the
  canonical store; the campaignState copy is stale or missing when no GM was
  online to relay it to). One player's lines never go into another player's
  request.
- **The Private Channel** carries its player's own lines only, read from
  their client setting as a player's client narration does (issue #345 AA03
  — it read the campaignState copy, so a line added while no GM was online
  was missing there).

The section heading tells the narrator never to cross them and never to
mention or hint at them — shared narration is read by the whole table.

**Reason:** SAFETY-PRIVATE-LINES-SHARED — the shared prompt passed no user id,
so no Private Line (not even the GM's) reached shared narration, and a
player's personal hard limit held only in their Private Channel. The privacy
model was the maintainer's call (2026-10).

**Boundary:** "private" means never shown in another player's UI and never
sent in another player's request. The lines sit in the world-scoped
`campaignState`, which every client receives, so they are not hidden from
another client's console (known-issues → accepted limitations).

**Rejected:**
- *Every client carries every player's lines* — a keyed player's request would
  send the others' private limits from their browser, on their key.
- *Only the acting player's lines* — narration is shared; a limit someone else
  at the table set must hold in a scene they are reading.
- *No Private Lines in shared narration* (the old behaviour) — a hard limit the
  main scene ignores is not a hard limit.

---

## Site exploration is oracle-seed-driven, not a delve track (2026-07)

**Decision:** The vault/derelict fix cycle made exploration work through the
existing move + oracle-seed pipeline rather than adding a delve/zone-position
mechanic. `explore_a_waypoint` becomes site-aware: when the crew's current
location is a vault or derelict (`getCurrentSiteKind`), `buildOracleSeeds`
rolls that site's canonical interior tables — vault Interior
Feature/Peril/Opportunity, or the derelict Access Area/Feature/Peril/
Opportunity suite. All 13 previously-dead derelict tables are registered so
they also answer `!oracle` (the per-zone AREA tables when the fiction names a
specific zone). Site status closes a real lifecycle (unexplored → visited →
cleared) via `!clear-site`; discovered sites anchor the ACTIVE SECTOR block
so the narrator can't reinvent them.

**Reason:** Starforged has no delve track — exploration depth is fictional.
Seeding the canonical tables into the move that already means "examine this
place" honours the rules without inventing position state the game doesn't
have.

**Rejected:** a per-site zone-position tracker (no rules basis); a staged
outer/inner description reveal (the narrator paces revelation, and the
waypoint seeds are the live reveal); auto-clearing on the expedition finish
(discovery ≠ fully explored — clearing stays a deliberate GM beat).

## The context packet is retired; narrator context has ONE seam (2026-07)

**Decision:** `assembleContextPacket` is no longer called anywhere in
production. Its packet parameter on `narrateResolution` was never read — a
Loremaster-era conduit orphaned when narration moved to
`buildNarratorSystemPrompt` — so the narrator never saw the packet's
faction landscape, threats, or World Journal lore (FACTION-PACKET-DEAD),
and burn/improve re-narrations silently ABORTED whenever the dead assembly
failed. The load-bearing sections now flow through `buildNarratorExtras`
like every other context: [4d] ACTIVE THREATS (top 4), [4e] FACTION
LANDSCAPE (merged, records canonical), [4f] ESTABLISHED LORE (recent 5,
clipped), gated on the existing `threatsInContext` /
`factionLandscapeInContext` / `loreInContext` settings. `narrateResolution`
keeps its (now null) second parameter for signature stability. The
assembler module is retained for its tests and budgeting reference —
**deleting it needs explicit approval**.

**Reason:** buildNarratorExtras is the single seam (narrator-memory
architecture §1); resurrecting a second assembly path would reintroduce
the drift the seam exists to prevent. The composition-test lesson
(CHAR-PC-BLOCK-STARVED) applies: elaborate builders disconnected from
consumers survive because only the builder is tested.

**Rejected:** wiring the packet back into narrateResolution (two assembly
paths); deleting assembler.js outright (file deletions need explicit
instruction).

**Update (2026-07-07 — issue #271, explicitly approved):** `assembler.js` and
`tests/unit/assembler.test.js` are **deleted**. The global priority-ordered
token budget is declared **obsolete** — narration models run 200K–1M context
and the one genuinely unbounded surface (the scene ledger) is already locally
capped (`maxLedgerTokens`, `narratorPrompt.js`); no whole-prompt budgeter was
ported. `narrateResolution` dropped its never-read `contextPacket` parameter
(the signature-stability retention above is superseded), `ContextPacketSchema`
was deleted with it, and the packet-based Quench batches were rewritten against
the live seam (`buildNarratorExtras` / `buildNarratorSystemPrompt`) — including
the NED permissions matrix and the Section 6.5 surfacing test. Sequencing per
the maintainer: the `!lore` recap injection (#269) and the session-notes stub
(#270 — removed; `sessionState.notes` never had a writer and the pipeline never
passed `sessionState` at all) were resolved out of the assembler first.
*(2026-10: two callers were missed — Burn Momentum / Improve Result
re-narration still passed the dropped slot (`narrate(res, null, campaignState,
{})`), so `narrateResolution` received a null campaignState; fixed, known-issues
RENARRATE-ATTRIBUTION. Move narration's only X-Card gate had lived in the
assembler too; `narrateResolution` now has its own — XCARD-MOVE-NARRATION.)*

## Coverage gate: ratchet + core bar, not a flat 95% (2026-07-07)

**Decision:** `vitest.config.js` coverage now measures everything the unit
suite can structurally reach (all of `src/` minus Quench, `index.js` wiring,
ApplicationV2/DialogV2 render layers, browser Speech, and static help
content) with a two-tier threshold: a **floor** calibrated ~2 pts under
measured actuals (70 lines / 68 branches / 60 functions vs 82.4 / 73.4 / 77.6
at adoption) that fails on regression, and a **95-class core bar** (95 lines /
95 functions / 80 branches) over the pure-logic spine — `schemas.js`,
`resolver.js`, `mischief.js`, `narratorPrompt.js`, `chronicle.js`,
`context/safety.js`, `truths/tables.js` (98.7% lines aggregate at adoption).
Both tiers verified live: the core glob fails the gate at a 99 bar and passes
at 95.

**A flat "95% across the board" was considered and rejected.** Coverage
measures execution, not consumption: the retired assembler carried ~1,400
lines of passing tests (excellent coverage, dead in production), and none of
the 2026-07 audit's ~46 defects — produced-but-dead code, mirror drift,
GM-gating, composition starvation — would have been caught by more line
coverage. Chasing 95% on render layers and wiring would have manufactured
assertion-free execution tests: false confidence, the exact disease the audit
diagnosed. Detection for those families lives in `scripts/deadscan.mjs`, the
reachability rules, the flow docs, and Quench/e2e.

**Recalibration protocol:** when real coverage rises, raise the floor toward
it (keep ~2 pts of headroom) in a dedicated commit. Never lower a threshold to
make a feature land — that is the regression the gate exists to catch.

**Amended 2026-10 (issue #282 item 7):** `src/index.js` is no longer
excluded. The multi-client harness boots it on every simulated client, so its
coverage is now real execution (62% lines at inclusion), not import-only
inflation. It counts toward the floor with no per-file bar; including it
moved the totals from 86.8 / 73.9 / 85.8 to 84.1 / 73.0 / 83.2, still far
above the floor. Logic that deserves a bar moves out of `index.js` into a
module: the chat-command run-on policy now lives in
`src/multiplayer/commandRouting.js`, at 100% and on the core bar. The move
pipeline and the chat-card button wiring are the next candidates. `src/ui/**`
stays excluded: the harness renders chat cards, not ApplicationV2 panels.

## Location background art never shipped its consumer — surface removed (2026-07-07)

**Decision:** the `locationArtSource` setting (a visible config promising
system-vs-OpenRouter location background art) and `resolveLocationArt` (the
ironswornAssets Phase-4 resolver that implemented the kirin/rains/auto
preference) are **removed** (issue #276). Both halves of the feature shipped —
the setting and the resolver — but the third piece, an actual art-choosing
call site (a location Scene or backdrop), never did: the setting was never
read and the resolver never called outside its own tests. A user could set
the option today and nothing would change.

**Reason:** wiring it means building the missing location-backdrop feature,
which is new scope, not cleanup; a `config: true` no-op setting is a standing
user-facing lie. If location background art is wanted later, open a scope
issue — the deleted resolver is one `git log` away.

## Faction stance: the entity record is canonical (2026-07)

**Decision:** a faction's stance lives on the entity record
(`relationship`, the 8-value Starforged vocabulary). The World Journal
entry is the pre-record intelligence layer: every WJ attitude write
(detection `attitudeShift`, `!journal faction`, auto-surface) maps onto the
record via `ATTITUDE_TO_RELATIONSHIP` (hostile→antagonistic,
neutral→apathetic, allied→open_alliance; unknown never overwrites) and
backlinks the record through the WJ entry's `entityId`. Draft-confirm
reconciles at birth (inherits the WJ attitude, seeds the faction oracles —
`seedFactionRecord`, idempotent). The narrator's FACTION LANDSCAPE lists the
four factions most recently in play — records and World Journal factions
ranked together by the later of the record's and the entry's `updatedAt`, a
record winning its shared name, and a record still at "unknown" showing the
stance its World Journal attitude maps to (`mergeFactionLandscape`; issue
#342 Z13, Z60 — "records first" let a campaign's first four records hold the
block for good).

**Rejected:** unifying the two vocabularies (they mean different things —
coarse intelligence vs played stance); retiring the WJ entry on confirm
(it is the encounter/history log); auto-flipping `active` (no dissolution
mechanic exists to drive it).

## Consistency-check dispositions (2026-07)

**Decision:** medium/low-confidence audit results stay telemetry-only —
high confidence is the GM-interrupt bar; the Pacing Telemetry journal's
Consistency Check page is the review surface for the rest. High-confidence
review cards post once per (scene, subject, violated fact) — the in-memory
dedup clears on scene change, so a reload re-arms each reminder at most
once. Review cards raised against pre-burn prose are not retracted on a
momentum-burn supersede (the flagged fact usually still matters
post-upgrade). Revisit any of these on playtest evidence, not speculation.

**Rejected:** a medium-confidence chat surface (GM noise without evidence);
burn-supersede card retraction (machinery without observed need).

## Character identity is established once and propagated everywhere (2026-07)

**Decision:** The character-detail fix cycle completed the pronoun-propagation
cluster (v1.7.10/11 findings E/R) along four rules:

1. **The narrator always sees the full character.** `getActiveCharacter`
   passes the complete `readCharacterSnapshot` (pronouns, callsign,
   biography, stats, impacts, assets, vows, connections) to every narrator
   path; `narratorNotes` is flag-only (the old biography fallback would
   double-render now that biography is its own block line). Never re-narrow
   this seam — `tests/unit/characterDetail.test.js` exercises the live
   composition precisely because the original defect hid in an untested
   narrowing between a correct reader and a correct renderer.
2. **Recorded pronouns are binding, for everyone in the party.** The PARTY
   roster carries `{name, pronouns, callsign}` per member; both perspective
   instructions forbid inferring gender from a name.
3. **Established beats rolled.** An NPC's pronouns are captured where the
   fiction establishes them — the detection pass (sanitised by
   `normalisePronounSet`), the draft card, and the inciting `Vow target:
   <Name> (<pronouns>)` line — and `seedConnectionActor`'s finding-E random
   roll fires ONLY when nothing upstream set a value. The roll stays (an
   ungendered NPC still needs one anchor for portrait/card/audio); it just
   lost precedence over the fiction.
4. **Misgendering is auditable.** The consistency check's RECORDED
   IDENTITIES section carries every PC's and matched NPC's pronouns (kind
   `identity`), because pronouns live outside every ledger tier and were
   otherwise invisible to the audit.

**Rejected:** a PC appearance/description field (no vendor schema home —
biography is the anchor, and it now actually reaches the narrator);
inferring NPC pronouns from names anywhere (the detection prompt explicitly
forbids it — report what the text used or null).

## Narrator context: the ledger actively defends, and every fiction card remembers (2026-07)

**Decision:** The narrator-context fix cycle ("Fix all gaps") hardened the
memory architecture in four directions, all now load-bearing:

1. **Every narrator fiction card carries the flag family.** Vow-swearing
   scenes, all three clock-vignette post sites, and oracle follow-up
   narrations now post `narratorCard`/`narrationText`/`sessionId` like move,
   paced, @scene, inciting, and galley/end-session cards before them. If a
   new card type posts narrator fiction, it joins the family and its
   consumers get audited (rules/narrator-memory.md invariant 1) — "mood
   piece" is not an exemption; recap-worthiness is decided by the reader,
   not by withholding the flags.
2. **Retraction is enforced, not cosmetic.** A bare Strike renders as a
   CORRECTED do-not-re-assert block (never dropped under budget, capped at
   the 5 most recent), `applySidecar` refuses to re-ledger a fact equivalent
   to a retracted one (GM `!truth set` bypasses — GM authority), and the
   consistency check audits prose against retractions. Replace-corrections
   are exempt from the CORRECTED block: the replacement truth stands for
   them.
3. **Truths dedup at the write.** Subject + normalised fact (case,
   whitespace, trailing punctuation) — required identity anchors land once;
   marathon scenes stop growing the prompt with duplicates.
4. **Scenes close when their fiction closes.** End Session ends the scene
   (`session_close`), the 4h re-mint closes a stale scene before minting
   (`session_gap_remint`), and the inciting incident starts a real scene so
   its premise state survives the first move. Scene-scoped facts migrate at
   those boundaries instead of leaking across sessions.

**Rejected:** inference machinery for missing sidecar emissions (invariant 3
still holds — fix instruction wording first); auto-correcting prose on a
consistency-check hit (GM stays the authority); scope-filtering the
CORRECTED block (retractions are rare and must hold even on turns that
don't name the subject). *(Narrowed by issue #345 AA28: an earlier scene's
kept strike of a scene fact is about the place it was struck, so it is
told — and blocks — only there; no other strike is filtered. "Issue #345
audit".)*

## Consistency check defaults on, audits the full ledger block (2026-07)

**Decision:** `factContinuity.consistencyCheck` now defaults **true** and the
Haiku audit compares prose against everything the ledger block holds — scene
frame, binding truths, retracted facts, current state, and ship position
(previously truths+state only, default off). It stays fire-and-forget
(no latency on the narration post), whisper-only (a high-confidence hit
posts the GM review card; nothing auto-corrects), and ~$0.0004/narration.
The frame audit is the §8.3 staleness mitigation the architecture doc
sketched. The unregistered-settings fallback inside `runConsistencyCheck`
stays `false` so unit tests and early init never fire an API call.

**Reason:** it was the only active contradiction defense and it shipped
dark; every playtest drift complaint post-dates a narration the check would
have flagged. Cost is negligible against the narration call it rides.

**Rejected:** auto-retraction on detection; auditing entity cards / world
truths (they are durable context, not scene assertions — false-positive
surface without a correction affordance).

## Raw oracle results are memory, not just chat (2026-07)

**Decision:** `!oracle yes` and `!pay-the-price` outcomes are ledgered into
a small `campaignState.recentOracles` ring (cap 8, session-scoped read) via
a structured `oracleMemory` flag on the result card + a canonical-GM capture
hook — the command itself may run on a player client that cannot write
world settings. Injected two ways: narrator system-prompt section [3b]
(RECENT ORACLE RESULTS, last 5, "the dice established these") and the
assembler's RECENT ORACLES packet section (last 3, replacing the
`oracleResultIds` count that no code ever wrote). Oracle follow-up
narration cards also joined the flag family, so the interpreted prose
lands in the ring alongside the raw answer.

**Rejected:** parsing card HTML on the GM side (flags carry structure);
scene-scoping the ring (oracle answers outlive scenes; the cap bounds it).

## Narrator-context reaffirmations: what stays deliberate (2026-07)

**Decision:** Three audit exposures were reaffirmed rather than changed:

1. **The scene frame applies as an unvalidated full replacement.** The
   idempotence↔staleness trade stands (omitted frame keeps the previous
   one); the broadened consistency check now audits prose against the frame,
   which was the designed mitigation. Cross-validating frame against truths
   at apply time would need entity resolution machinery for marginal gain.
2. **Non-move relevance stays lexical** (invariant 5). Pronoun-only
   references still ride the frame-present union; a Haiku pass per paced
   turn buys little over it and re-opens the hybrid permission-class
   question (§8.2).
3. **World Journal threat/faction transitions ride the salience-gated Haiku
   read.** They write visible journal entries with manual `!journal`
   correction affordances; the lore-contradiction card stays notify-only.
   A confirm-card per transition is GM fatigue for a low-error surface
   (detector tightened in v1.7.28).

**Rejected:** frame validation layer; Haiku relevance for paced/@scene;
per-transition confirmation cards.

## Flow-audit soft spots: what stays deliberate (2026-07)

**Decision:** The soft-spot cleanup that followed the flow audits implemented
every gap where a faithful Starforged mechanic exists (way-out one-click
moves, waypoint match-oracle buttons, expedition recommit (and, since issue
#330 D1, the vow and bond recommits), `!sever`, targeted
`!bond`, the expedition→site link, shared-vow rank sync, the no-reward
fulfilment note, dead-code removal). Four observations were **reaffirmed as
deliberate** rather than changed:

1. **Combat range badges are advisory.** Starforged has no range mechanic —
   close/far is fictional positioning; wiring a roll modifier would invent
   rules. The badge tooltip now says so.
2. **Combat tracks carry no promised reward of their own.** The linked vow's
   promised reward is the payoff carrier (#241 Phase 2 design); per-fight
   rewards would double-pay the same fiction.
3. **Expedition rank is player-re-ranked, not auto-re-inferred.** The rank is
   inferred once at creation (forced interpretations default dangerous) and
   the progress card points at the panel to adjust — re-inferring on later
   marks would fight the player's correction.
4. **Arrival inference degrades to freeText for unknown destinations.** A
   narrator-invented place that isn't yet an entity still renders a position
   line without planet/sector scoping — graceful fallback, not a defect; the
   entity-discovery flow catches the place on its own schedule.

**Rejected:** inventing a range modifier; per-combat reward proposals;
re-ranking expeditions on every mark; blocking position writes on unknown
destinations.

## Legacy XP pays at the tick write, to every player character

**Decision:** `addLegacyTicks` (src/index.js) is the single legacy-tick
entrance and now awards XP itself: 2 XP per newly filled box (1 once the track
is `cleared`, play kit rule 1.12), granted to **every player character**, with
an earned-XP chat card. The award is fire-and-forget (call sites stay
synchronous; failures warn — and, since issue #309 N06, go on the GMs'
payoff card with a Retry for that PC's XP). `!bond`'s formerly inline tick
bump routes through it too.

**Reason:** LEGACY-XP-DEAD (2026-07 flow audit) — legacy ticks accrued but no
XP was ever awarded: the awarding path (`persistResolution.markLegacyProgress`)
required `consequences.progressTrackId`, which no resolver sets, so the whole
legacy → XP → assets economy was disconnected in play. Awarding to all PCs
matches the module's shared-crew legacy model (one `campaignState.legacyTracks`
set for the table, like the shared supply). *(2026-10: removed — see
known-issues AUDIT-DEAD-SURFACE. `markLegacyProgress` and the whole
`progressTrackId` / `progressMarked` persist route were deleted with the other
unreachable `persistResolution` steps; `addLegacyTicks` is the only legacy
path.)* *(2026-10, issue #316 T02: the track clears at its tenth box and
counts its cycles — `moves/legacyTracks.js`; `addLegacyTicks` returns
`{ boxes, xp, cleared }`. See "Issue #316 audit".)* *(Issue #326 D3,
2026-11-03: the XP is no longer written to `system.xp` — a field the
Starforged sheet does not have. The shared track stays canonical and is
written through to every PC's `system.legacies.<track>`, where the sheet's
Legacies tab shows the boxes and derives the XP; a sheet edit flows back.
See "Issue #326 audit" → "The shared legacy tracks are mirrored to every
sheet".)*

**Rejected:**
- *Per-character legacy tracks* (RAW-strict) — a data-model migration far
  beyond the defect; the shared model is an established module decision.
- *Wire `progressTrackId` through the resolvers instead* — every legacy write
  site would need consequence plumbing; paying at the single entrance can't
  be bypassed by a future call site.

## Vow payoffs resolve vowId-first; forsaking completes with a `forsaken` flag

**Decision:** Fulfilment/forsake completion and payoff resolve the target vow
via `resolveVowItemCopies` (src/index.js): name ladder (exact → substring →
sole open vow, mirroring `selectMilestoneVow`), then **every copy collected by
the shared `vowId` flag** (name only as fallback). Forsake Your Vow's new
`forsakeVow` consequence marks all copies `completed` + a `forsaken` module
flag — audit-preserving, nothing deleted — closes the journal twin, and flips
a still-promised reward to `lost`.

*(2026-10 refinement: the sole-open-vow rung is for a name that matches
nothing — it never fires when the name matches a vow that is already
completed (exact or substring), because fulfilling vow A completes A first and
the rung then paid the one other open vow B. Likewise an exact name for a
completed vow skips the substring rung, which otherwise resolved an open vow
whose name contains A's (FULFIL-SUBSTRING-RUNG). After completion the fulfil
payoff collects every PC's copy and prefers the roller's, so a shared vow's
reward reaches the player who fulfilled it — known-issues FULFIL-REWARD-NEVER,
FULFIL-REWARD-FIRST-PC. The rung is kept, not dropped: renamed vows still pay
out.)*

**Reason:** VOW-RENAME-PAYOFF — payoffs matched by exact lowercased name while
creation/sync/rewards key `vowId`, so a renamed vow (or a stale
`linkedVowName` snapshot on a combat track / victory card) rolled hits that
completed nothing and paid nothing. VOW-FORSAKE-COSMETIC — forsaking presented
costs but never cleared the vow.

**Rejected:**
- *Deleting the forsaken item* — destructive; violates the module's
  audit-preserving norm (cf. `!truth strike` retracting, not deleting).
- *Completing without a marker* — mislabels an abandoned vow as achieved.

---

## Progress-move scores come from module data, never the AI

**Decision:** A progress move's score (Take Decisive Action, Fulfill Your Vow,
Forge a Bond, Finish an Expedition) is filled by `enrichProgressTicks`
(`src/moves/statEnrichment.js`) from the live module data — combat/expedition
journal tracks, actor vow **Items** (the live store; journal `vow` tracks are
creation-time mirrors that are never tick-synced), connection records
(`relationshipTicks`). The interpreter is instructed to leave `statValue` and
`progressTicks` at 0 and only name the `moveTarget`; the resolver reads
`statValue` as the tick carrier. `PROGRESS_TICK_SOURCES` is the move→source
map; `overcome_destruction` scores the crew's shared bonds legacy track and
`continue_a_legacy` the legacy track it names (`campaignState.legacyTracks`,
40 once the track has been cleared — issue #330 D6; they were deliberate
no-ops while the module "did not store" legacy tracks, which it has since
issue #326 D3).

**Reason:** Before this, *nothing* filled the tick carrier, so every pipeline
progress roll scored 0 — a guaranteed miss. Take Decisive Action could never
win a fight and the victory card's "Attempt to Fulfill" always failed, while
the consequence wiring above it (milestones, rewards) was fully built and
unreachable. Asking the AI to estimate tick counts was rejected: the model
doesn't reliably know track state, and the module is the source of truth.

**Rejected:**
- *Have the interpreter fill `progressTicks` from prompt context* — the value
  must be exact; a hallucinated count corrupts a core roll.
- *Read ticks inside `resolveMove`* — the resolver is pure and
  dependency-free; enrichment stays a pipeline step like
  `enrichInterpretationStatValue`.

## Enter the Fray's position rides the threshold card

**Decision:** `enter_the_fray`'s outcome position (strong hit → in control,
miss → bad spot) is carried in the combat-threshold card's flags
(`position`/`actorId`) and applied by `createCombatTrackFromThreshold` when the
player commits — via the shared `applyCombatPositionToTrack` (track
`combatState` + actor sheet + combatant badge). The weak-hit choose-one's "You
are in control" maps to a `combat-position` suffer call whose executor writes
an open track, or stashes onto the newest pending threshold card when the
track doesn't exist yet (either click order works). *(Issue #321: the weak
hit's "+2 momentum" option begins the fight in a bad spot through the same
call (U18); the combat tracker's position badge and the Progress Tracks
panel's toggle write through `applyCombatPositionToTrack` too, which writes
the track first and rejects, mirrors untouched, when that write is refused
(U19).)*

**Reason:** The combat track is created only when the player clicks Enter the
Fray, but the `combatPosition` consequence fires at resolution time — before
the track exists — so the opening position was silently discarded (and the
weak-hit choice produced zero writes: its string value fell through the
numeric meter loop, with the card reporting "Applied: no change").

---

## Scope documents live as GitHub issues, not files

**Decision:** Feature scope documents are **GitHub issues**, not `*-scope.md`
files in `docs/`. On 2026-06-24 the 26 existing scope docs were migrated
verbatim into issues #203–#228 — each issue holds the full scope text plus a
table of its implementing commits — and removed from the repo. `scope-index.md`
stays as the dashboard, now mapping each scope to its issue. New feature scopes
are opened as issues; no new `*-scope.md` files are added. See the "Scope
documents are GitHub issues" section in `CLAUDE.md`.

**Reason:** The checked-in scope docs duplicated, and drifted from, the shipped
code — six still read "PLANNED" months after the feature shipped (scene
interrogation, entity-discovery v3, world-journal v2, suffer pipeline, audio,
private channel). Issue state (open / closed-completed / closed-not-planned)
tracks status next to the work, and closing an issue when a feature ships is one
action that can't silently rot the way a prose status line does. Migrating
verbatim (not summarising) preserved the design history in the closed issues.

**Rejected:**
- *Keep the docs and just fix the stale status lines* — rejected; the drift
  recurs every release. Status belongs on the work item, not in prose a
  contributor must remember to update.
- *Delete the scope docs without migrating* — rejected; the design rationale
  (alternatives, phase plans, cost estimates) is worth keeping. The issues hold
  it verbatim.
- *Drop `scope-index.md` too in favour of an issue label* — rejected for now;
  the hand-maintained index gives a single-glance status table and dependency
  graph the raw issue list doesn't, and it is the durable scope→issue map that
  keeps older `docs/…-scope.md §N` references resolvable.

---

## No silent failures

**Decision:** No code path may swallow a failure without leaving a trace. Every
`catch` that returns/continues, every guard that declines to act, and every
"fail-safe" early return logs why:
- **Genuine failures / unexpected conditions** (a parse that failed, a missing
  API key where one was expected, an awaited promise that threw, a lookup that
  found nothing it needed) → `console.warn` / `console.error`.
- **Deliberate "not applicable" no-ops** (a chat message that isn't ours, a
  non-canonical client correctly standing down, a setting that's off) →
  `console.debug`, so they're discoverable when debugging without spamming
  normal play.
- The test is: **any path that was *supposed* to act and didn't must log on the
  client that made that decision.** Pure modules (which take no `console`
  dependency) surface a reason to their caller, and the caller logs.

**Reason:** A playtester rolled Fulfill Your Vow on the native foundry-ironsworn
sheet and got no narration and no trace anywhere (#248 Theme D). The
native-progress-roll bridge could bail at three points — unparseable card,
unclassifiable roll, or `narrateResolution` with no key — and only the last
logged, and it logged on the *GM's* console while the player watched their own.
"It silently did nothing" is indistinguishable from "it worked" and "it
crashed", which turns every playtest report into a guessing game. A breadcrumb
on the deciding client turns "nothing happened" into "here's why".

**Rejected:**
- *Warn on every no-op* — rejected; standing down on the 90% of chat messages
  that aren't progress rolls would bury real warnings. Not-applicable no-ops use
  `console.debug` (off by default); genuine failures use `warn` / `error`.
- *Leave fail-safe returns silent because "it's expected"* — rejected; expected
  by the author is not the same as visible to the playtester. The whole point is
  that the unexpected-in-practice case (a vendor card-shape change, a key on the
  wrong client) reads as expected-and-silent today.

---

## `.claude/` and local tooling dirs are never added to `.gitignore` or test config

**Decision:** The `.claude/` directory — and any other directory created by the
Claude Code harness or its worktree isolation — is left untracked by convention
and is **not** listed in `.gitignore`, the `vitest.config.js` `exclude`, or any
other repo/build config. More generally, repo/build/tooling config (`.gitignore`,
`vitest.config.js`, ESLint config, `package.json` scripts, CI workflows) is
edited only when that edit is itself the requested task, never bundled into an
unrelated feature commit. See the matching bullets under "Never do without
explicit instruction" and the pre-commit scope check in `CLAUDE.md`.

**Reason:** A clocks/vignettes feature commit silently carried two unprompted
changes — a `chore: ignore .claude/ worktree directory` commit adding `.claude/`
to `.gitignore`, and a `vitest.config.js` hunk adding `.claude/**` to the test
`exclude`. Both had to be reverted (rebase-drop the chore commit, strip the
config hunk, force-push). Git already leaves untracked dirs out of a feature
diff, so the ignore entries bought nothing and only added unreviewed config
drift. Keeping harness/worktree dirs out of committed config means the repo never
has to care how any one contributor's tooling lays out its working directory.

**Rejected:**
- *Add `.claude/` to `.gitignore` so it never shows up in `git status`* —
  rejected; it is harness/worktree-managed and ephemeral, contributors' layouts
  differ, and committing one contributor's ignore preference is config drift the
  repo shouldn't carry. A personal, local-only ignore belongs in
  `.git/info/exclude`.
- *Let incidental config tidy-ups ride along inside feature commits* — rejected;
  it buries reviewable config changes inside an unrelated diff. Config changes
  get their own approval and their own commit.

---

## The Roll button reflects the narrator's prose, not the classifier's nomination

**Decision:** On a paced-narrative card, the move wired to the Roll button (its
label *and* the `suggestedMove` flag the click forces) is reconciled against the
move the narrator names in its closing italic hint —
`reconcileSuggestedMove(text, classifierMove)` in `src/narration/narrator.js`.
When the hint names a recognised move, it wins; the pacing classifier's
nomination is only the fallback (no hint, or the hint names no recognised move).

**Reason:** The two were computed independently and could diverge (finding J).
The classifier picks `suggestedMove` at pipeline entry, *before* the narrator
runs; the narrator is then asked to write a hint about it but has explicit
creative latitude to invite a different move. The player acts on the prose they
read, so the prose is the source of truth — and because the button re-posts with
`forcedMoveId: suggestedMove`, reconciling the flag (not just the label) means
the *rolled* move matches too. Only the final italic span is scanned, so
single-word move names in the prose body cannot false-match. *(Issue #321: the
classifier's `suggestedMove` is always a MOVES key or null — `toMoveId` maps a
display name, so the button no longer fails with "Unknown move" (U45); and the
forced move rolls the stat its narration fits, read by a stat-only
interpretation, not the move's first listed stat (`enrichForcedMoveStat`, U04).)*
*(Issue #325 W36: when the hint names several move-shaped words, the move it
invites is the one written as a move — capitalised, and not only because it
opens the sentence — else the last one named; the longest name used to win, so
"before the battle could be a Heal" rolled Battle. And the hint's move passes
the same finding-G guard as the nomination: a social move against a fellow PC
is never the button, and the guarded nomination stands.)*

**Rejected:**
- *Make the classifier authoritative and forbid the narrator from deviating* —
  rejected; the narrator sees the assembled scene the classifier never did, so
  its choice is usually the better one. Constraining it would trade a cosmetic
  mismatch for worse move suggestions.
- *Suppress the button whenever the prose names no recognised move* — rejected
  as scope creep beyond finding J; the narrator may invite a move via paraphrase
  we don't lexically match, and dropping the button there would lose a valid
  affordance. Keeping the classifier fallback is the safe default.

---

## Combat cards carry move buttons: TDA on blow-by-blow cards, Battle only at fight start

**Decision:** Two chat-card affordances, both built on the existing forced-move
bridge (`flags[MODULE].forcedMoveId` + `bypassPacing` → `buildForcedInterpretation`,
the same path as the NWMA "Roll <move>" button and the token-drag Set a Course):

1. **Take Decisive Action button** appears on the result cards of the four
   blow-by-blow combat moves only — `TDA_OFFER_MOVES = {strike, clash,
   gain_ground, react_under_fire}` in `src/index.js`. Deliberately **not** on
   Enter the Fray (the fight just started — zero progress, so a TDA roll is
   almost always a trap), nor on Take Decisive Action / Face Defeat / Battle
   (the fight is already ending). Posting still routes through
   `confirmInterpretation`, so it is never fired silently.
2. **Battle button** appears on the Enter the Fray combat-track card **only when
   the track is freshly created** (`created === true`), never on a resumed
   track. Battle replaces the whole blow-by-blow minigame with a single roll;
   once progress is on the track the player has committed to the track, so the
   bypass is offered only at the moment the objective is established (the
   reporter's framing: "when establishing a combat progress meter and objective,
   there should be a separate option to battle instead"). `battle`'s resolver
   already sets `endCombat` on every outcome (`resolver.test.js`), so clicking it
   cleanly completes the track Enter the Fray just opened — no orphan track.

The two render handlers (`wireTakeDecisiveActionButton`,
`wireCombatTrackCardButtons`) are exported from `src/index.js` so Quench can
drive them with a synthetic message + detached root (same approach as the audio
card handlers); behaviour is covered by the `combatCardButtons` Quench batch.

**Rejected:**
- *Show the TDA button on every combat card (incl. Enter the Fray)* — rejected;
  it would invite a 0-progress TDA the instant a fight starts.
- *Offer Battle on resumed/in-progress tracks too* — rejected; Battle discards
  the track's accumulated progress, so offering it mid-fight is a trap and
  contradicts the "when establishing" framing.
- *Open a free-text dialog so the player narrates the TDA/Battle* — rejected as
  scope creep; the canned narration + the existing confirm dialog are enough,
  and match how the NWMA button already re-posts.

---

## The interpreter is fed the combat position and forced to a position-legal move

**Decision:** When a single combat track is active, `getActiveCombatPosition()`
(`src/ui/progressTracks.js`) is resolved once at the top of the chat pipeline
(`src/index.js`) and passed to `interpretMove(... { combatPosition })`. The
interpreter applies it two ways:

1. **Soft steer** — `buildCombatPositionDirective(position)` adds a `COMBAT
   POSITION` block to the *user* message (the cached system prompt stays
   position-agnostic) naming the moves available for the position and forbidding
   the others.
2. **Hard guarantee** — `constrainMoveToPosition(moveId, position)` in
   `parseInterpretation` deterministically remaps a wrong-position
   attack/maneuver to its same-position counterpart via `POSITION_MOVE_REMAP`:
   in control ⇒ Clash→Strike, React Under Fire→Gain Ground; in a bad spot ⇒
   Strike→Clash, Gain Ground→React Under Fire. The same value is reused for the
   Take Decisive Action bad-spot downgrade (it was already fetched only for TDA
   before — now fetched once and shared).

`combatPosition` is `null` out of combat *and* when there are 0 or multiple
active combat tracks, so behaviour is unchanged in every non-combat path.

**Reason:** the interpreter knew the *concept* of position (move descriptions +
interpretation rule 1) but was never told the *current* position, so it could
return Strike while the character was in a bad spot — a move the rules don't
allow there. Stat options are identical within each remap pair (`schemas.js`:
Strike/Clash `[iron,edge]`; Gain Ground/React Under Fire
`[edge,heart,iron,shadow,wits]`), so the model's chosen stat survives the remap
untouched.

**Rejected:**
- *Prompt steering alone* — the model can still ignore the directive; the
  deterministic remap is what makes the result actually legal.
- *Reject/error on a wrong-position move* — remapping preserves intent (an
  attack stays an attack, just the correct variant) and keeps the pipeline
  flowing; the confirm dialog shows the move and stat (with any ability's
  stat swap), and its cancel (once "Re-interpret", now "Cancel — re-word")
  cancels the move so the player can re-word it (issue #321 U04 — it offers
  no override of the move); the cancel is told and hands a card's button
  back (see "A move the pipeline does not roll is told, and its card handed
  back").
- *Force every move to be a combat move while in combat* — rejected; non-combat
  moves (Ask the Oracle, Face Danger for the environment, etc.) remain valid
  mid-fight, so only the four position-locked combat moves are remapped.

---

## A title in an NPC name is its role; don't roll a contradictory one

**Decision (finding D):** `seedConnectionActor` resolves an NPC's Role with the
precedence *explicit role → title parsed from the name
(`roleTitleFromName`) → Character Role oracle*. A leading honorific that doubles
as a role (Administrator, Captain, Doctor/Dr, Councilor, Governor, …) is used
verbatim; the oracle only rolls when the name carries no such title.

**Reason:** a vow target created as "Administrator Lyssa Chen" then rolled
ROLE = "Shipwright", so the card contradicted its own name. The name is the
authored, load-bearing fact; the oracle is the fallback for when we have nothing.

**Rejected:** *blank the role on conflict* — leaves an obviously-incomplete
card; using the title is strictly more informative. *Strip the title from the
name instead* — the title is part of how the players refer to the NPC; keep it.

---

## The narrator and entity detector are player-character aware

**Decision:** Two narrator-adjacent paths now consult the player-character
roster (`getPlayerActors()`, which excludes entityType-flagged NPC cards):

- **Entity detection (finding F):** `collectEstablishedEntityNames`
  (`src/entities/entityExtractor.js`) lists PC names as ESTABLISHED in the
  detection prompt, so the model never proposes a fellow PC as a new
  Connection. This is *in addition to* the routing gate `entityExistsAnyType`,
  which already checked PC names but only by **exact** normalized match — and so
  missed first-name mentions ("Kylar" vs the actor "Kylar Nazari"). Telling the
  model upfront resolves the variant the exact gate cannot.
- **Move suggestion (finding G):** `narratePacedInput` drops a *social* move
  nomination (`compel`, `develop_your_relationship`, `test_your_relationship`)
  when the player's input names a fellow PC. Inter-PC tension is roleplay, not
  a roll. Combat moves are deliberately **not** suppressed — PvP via
  Clash/Strike is rules-valid.

**Reason:** in multiplayer with two PCs, both paths misfired — the detector
re-proposed the co-op partner as an NPC, and the narrator offered "Roll Compel"
against a fellow player. Both stem from the same root: narrator-side logic that
didn't distinguish a player character from an NPC.

**Rejected:**
- *Strengthen the exact gate to fuzzy/substring-match PC names* (for F) —
  rejected as the primary fix: substring matching risks suppressing a
  legitimate NPC who happens to share a first name with a PC. Listing PCs in the
  prompt lets the model disambiguate from context instead.
- *Suppress all interaction-class moves against a PC* (for G) — rejected;
  combat between PCs is permitted by the rules, so only the social/relationship
  moves are gated.

---

## Narrator context is assembled in one place; every mode gets the same packet

**Decision:** All narrator calls build their system-prompt context through a
single function, `buildNarratorExtras(mode, campaignState, opts)`
(`src/narration/narrator.js`). The seven call sites (move resolution, paced,
`@scene`, oracle follow-up, session vignette, inciting incident, campaign recap)
no longer hand-assemble their own `extras`. The context packet is **uniform
across modes**; the only per-mode variation is (a) the role description (the
mode's job) and (b) data that physically only exists after a move — the oracle
seeds and the dynamically-classified permission class.

The **creative-latitude permission block is uniform too**: `move_resolution`'s
class is resolved dynamically from the move outcome and passed in; every other
mode falls back to a per-mode default (`DEFAULT_PERMISSION_CLASS_BY_MODE` in
`narratorPrompt.js` — paced→interaction, scene/oracle/vignette→embellishment,
inciting→discovery). The permission-block opening lines were reworded to stop
assuming a move happened ("This turn…" not "This move…") since they now render
outside the move path.

**Reason:** Before this, context reached modes inconsistently — campaign truths
were move-only, entity cards reached three paths, the party roster three, and
the recap call passed *no* extras (so it silently used the move-resolution role
and got no sector/location/character). Adding any new context meant editing up
to seven call sites and risking another asymmetry. One assembly point makes "add
context to the narrator" a one-line change that reaches every path.

**Rejected:**
- *Keep latitude in role descriptions for non-move modes* (no permission block
  off the move path) — considered, but it leaves "what may the narrator invent"
  living in two mechanisms that can drift. A single uniform permission class is
  the one source of truth; role descriptions were trimmed of the now-duplicated
  latitude language (and the inciting role's "do not invent proper nouns" was
  reconciled with the discovery block's reuse-first rule).
- *Make `campaign_recap` a full prose mode* — it is a meta mode: its output is
  used verbatim and never parsed, so it must NOT receive the sidecar instruction
  (a stray JSON block would leak into the recap) nor audio markup nor a latitude
  block. `META_MODES` gates all three.

**Trade-off accepted:** non-move modes now run a (cheap, API-free) lexical
relevance pass and carry a permission block + campaign-truths digest they did
not before — a few hundred input tokens per call, far below any context-window
concern, in exchange for uniformity and the recap/oracle/vignette gaining
context they were missing.

## Reuse before you invent — no throwaway characters

**Decision:** When the fiction needs a character to fill a functional role (an
official, a vendor, a pilot, a witness, a voice on the comm), the narrator must
first try an established character — the active-sector NPC roster, a player
character, or an entity already in the scene — and introduce a brand-new named
character **only when none can plausibly fill the role**. Any genuinely new
character is scoped to the **current sector**, consistent with its authority and
troubles, with enough substance to recur. This is enforced two ways: a CAST
DISCIPLINE directive in the active-sector block (`formatActiveSector`, every
prose path, even when the roster is empty) and a reuse-first rule in the
DISCOVERY permission block (`narratorPrompt.js`).

**Reason:** v1.7.12 playtest drift (findings D/F and the general O case): the
narrator minted one-off named NPCs to fill momentary roles — and, worse,
invented officials for settlements whose Authority is "lawless" — accumulating
contradictory throwaways that never recurred and had no entity home. Anchoring
new cast to the established roster and the current sector keeps the world small,
consistent, and recurring.

**Rejected:** *Forbid new named NPCs off the discovery path entirely* — too
strict; the discovery move (e.g. `make_a_connection`) legitimately introduces
people. The rule is reuse-*first*, not reuse-only.

## Move-concurrency lock covers narration + persistence, not post-roll prompts

**Decision:** The `campaignState.pendingMove` lock (the one-move-at-a-time guard
in the `createChatMessage` pipeline, `src/index.js`) is released on the success
path **before** the interactive consequence-rider prompt (`promptRiders`,
`src/moves/riderDialog.js`), through the `releasePendingMoveLock()` helper. The
pipeline's `finally` re-releases idempotently for the throw / cancelled-confirm
paths.

**Reason:** The lock exists to stop two pipelines racing on `campaignState`
writes and posting duplicate narration. Both of those — `persistResolution` and
the narration call — are finished before the rider step runs. v1.7.12 added
`applyMoveConsequenceRiders` *inside* the locked region; its GM dialog held the
world-scoped lock open while waiting for input, so a missed or unanswered popup
blocked every other player with "a move is already being resolved", recoverable
only by a reload (which fires the `ready`-hook stale-lock reset). This bricked
the v1.7.12 multiplayer playtest (known-issues PLAYTEST-1712 M/N); v1.7.11 had
no post-roll dialog and never wedged.

**Rejected:**
- *Timeout / auto-dismiss the rider dialog* — silently skipping a GM decision
  contradicts the consequence-riders scope doc's "never apply a guess, surface
  what you can't resolve" intent, and is poor UX.
- *Keep the lock across the prompt with a watchdog* — papers over the real
  issue: an interactive prompt must never hold a cross-client concurrency lock.

**Trade-off accepted:** after the early release a second move can begin while the
GM is still resolving the previous move's rider prompt. The rider application
writes actor meters / progress (not the narration path the lock guards) and
re-reads fresh state, so the residual race is narrow and strictly better than
wedging the session. Pre-roll dialogs (`confirmInterpretation`,
`ClarificationDialog`) still hold the lock by design — they are the move's own
expected confirm step, at the start, where a cancel releases the lock immediately.

**Update (issue #315 S01):** the `finally` re-releases only when this move's
own release has not landed (`lockReleased`) — once it has, the lock may be
a later move's, which the second release cleared. `releasePendingMoveLock`
returns whether the lock is free; a refused early release is still retried.

**Update (issue #347 D1):** the record above called `ClarificationDialog` a
pre-roll dialog; it was not. It now is — see the next entry, on "Who are
you interacting with?".

## "Who are you interacting with?" is asked before the roll

**Decision (issue #347 D1, option A; maintainer):** the clarification prompt
a hybrid move opens when its line implies someone it does not name ("I slip
past him") is asked in `rollMove` before the dice — after the "not rolled"
guards, before any add is claimed or die rolled. The line's relevance is read
there with the outcome unknown, so a hybrid line naming nobody is classified
(one Haiku call) on every such move, a miss included; the classification is
kept and the read after the roll uses it (`resolveRelevance`'s
`classificationCache`), so a hit makes one call, as before. The GM's pick
stands whatever the outcome: "Someone new" on a miss is narrated as a
discovery, a picked connection as an interaction. Closing the prompt is "No
specific entity", and the move goes on. Nothing waits on a prompt after the
roll.

**Reason:** the prompt was awaited after `resolveMove`, `applyOutcomeEffects`
and the Pay the Price card, with the move lock held and no result card,
narration or record until it was answered — every other move at the table
was refused meanwhile, the v1.7.12 shape, and a reload left the move
half-applied (issue #347 AB14). The lock record above accepts a dialog that
holds the lock only at the move's start, where nothing has been applied;
asked there, an unanswered prompt holds the table as the move's own confirm
dialog does, and nothing is half-done.

**Rejected:** (B) keeping it after the roll with a timeout that answers "No
specific entity" — the rider-prompt record above rejected a watchdog on a
held lock; (C) reaffirming the post-roll hold and correcting the record.

**Trade-off accepted:** a hybrid line that names nobody costs one Haiku call
on a miss too, and the GM can be asked about a move that then misses.

**Files:** `src/moves/movePipeline.js` (`rollMove`),
`src/context/relevanceResolver.js` (`classificationCache`, a `null`
outcome). Test: `tests/unit/clarificationAskedBeforeRoll.test.js`.

**Files:** `src/index.js` (`releasePendingMoveLock`, the release sites in the
pipeline), `src/moves/riderDialog.js`. Tests: `tests/unit/pipeline.test.js`,
`tests/unit/assetEffects.test.js`.

---

## Chat command prefix: `!` not `/`

**Decision:** All module commands use `!` prefix (`!x`, `!recap`, `!journal`, `!sector`).

**Reason:** Foundry v13 validates all `/`-prefixed chat messages against `MESSAGE_PATTERNS`
before `createChatMessage` fires. Any unrecognised `/word` matches the invalid pattern
`/^(\/\S+)/` and is rejected with an error — the message is never created and the
module hook never sees it. Native Foundry commands (`/roll`, `/ooc`, `/whisper`, etc.)
still use `/`; module commands must not conflict with this validation.

**What changed:** `registerXCardHook()` checks for `!x`. `isRecapCommand()` checks for
`!recap`. Regexes in `registerChatHook()` updated to `!recap`. `isPlayerNarration()`
excludes messages starting with `!`. All user-facing help text updated.

---

## Testing framework: Vitest (not Jest)

**Decision:** Replace Jest with Vitest.

**Reason:** Jest requires CommonJS-compatible transforms for ESM modules. The module
uses native ES modules throughout (`type: "module"` in package.json). Vitest handles
ESM natively without babel or transform configuration.

**What changed:** `jest.config.js` deleted, `vitest.config.js` added, `tests/setup.js`
rewritten with `global.*` assignments (no Jest globals shim), all test files updated
to import `describe, it, expect, vi` from `vitest` explicitly. `globals: true` in
vitest config makes Jest-style implicit globals available for older test files.

---

## Foundry version: v13 target (not v12)

**Decision:** Write for Foundry v13 with v12 backward compat where trivial.

**What this affects:**

- **ApplicationV2** — all UI panels use `foundry.applications.api.ApplicationV2`.
  v1 Application is deprecated in v13, removed in v16.
- **jQuery removed** — Foundry v13 no longer provides jQuery globally. All DOM
  manipulation uses the standard DOM API (`querySelector`, `createElement`, etc.).
- **`getSceneControlButtons` hook** — in v12, `controls` is an Array. In v13 it is
  an Object keyed by group name. Handler uses `Array.isArray(controls)` check.
- **`ChatMessage.type`** — v13 removed `"other"` as a valid type. Use no type field
  (defaults to `"base"`) or string literals `"ooc"`, `"roll"`, `"whisper"`.
- **`message.author`** — the correct property in both v12 and v13. `message.user`
  was the old name; accessing it in v13 logs a deprecation warning.
- **`CONST.CHAT_MESSAGE_TYPES`** — restructured in v13. All type checks use string
  literals instead.

---

## CORS strategy: direct browser fetch for everything

**Decision:** All external API calls go directly from the Foundry renderer
to the upstream provider. There is no proxy, no relay, and no environment
branching. The same code runs on Foundry desktop and on The Forge.

**Anthropic — direct browser fetch.** Anthropic supports browser CORS when
the request carries `anthropic-dangerous-direct-browser-access: true`. The
Foundry renderer (Electron on desktop, browser on The Forge) is just a
browser, so direct `fetch` to `api.anthropic.com` works on every platform.
`apiPost()` in `src/api-proxy.js` injects the header centrally so every
Anthropic caller gets it automatically.

**Image generation — direct browser fetch via OpenRouter.** OpenAI does not
allow browser CORS for `images/generations`, but OpenRouter does — its
`chat/completions` endpoint sends `Access-Control-Allow-Origin` and accepts
`modalities: ["image"]` for image generation. The user supplies their own
OpenRouter API key (`openRouterApiKey`) and the model id is configurable
via `openRouterImageModel` (default `black-forest-labs/flux.2-pro`). The
helper `src/art/openRouterImage.js` handles the request and decodes the
inline base64 response; both `src/art/generator.js` (entity portraits) and
`src/sectors/sectorArt.js` (sector backgrounds) call it directly.

**No local proxy.** Earlier versions of this module shipped a Node proxy at
`proxy/claude-proxy.mjs` (started with `npm run proxy`) to bypass desktop
Foundry's CORS enforcement before Anthropic's browser opt-in existed. That
proxy has been removed; the same direct-fetch transport now works on both
desktop and Forge.

**Earlier rescinded claim.** A very early version of this doc claimed The
Forge exposed a server-side HTTP relay via `ForgeAPI.call("proxy", …)`.
Inspecting the public Forge module source (`ForgeVTT/fvtt-module-forge-vtt`,
`ForgeAPI.mjs`) showed `ForgeAPI.call(verb, …)` simply appends `verb` to
`https://forge-vtt.com/api/`; `/api/proxy` is not a real Forge endpoint.
The Forge branch in `api-proxy.js` was therefore non-functional and surfaced
as failing Quench live-API tests, which led to the direct-CORS architecture
in use today.

**Reference precedent:** The `loremaster-foundry` module makes Anthropic
requests with the same direct-CORS header from the same Foundry renderer
context (`scripts/api-client.mjs`, lines 41–50).

**Rejected:** Foundry socket relay (player → GM client → API). Unreliable in
single-browser sessions where accounts share a socket connection. Also adds
account-dependency (GM must be connected) which breaks headless/automated use.
*(2026-10: still true of the transport — every call is a direct browser fetch.
The GM relay now decides *which* client makes some calls (oracle follow-ups,
`RUN_ON.CLAUDE` commands), always falling back to the author's own key when no
keyed GM is connected — see "Claude calls run where a key lives, exactly
once".)*

---

## Narration: direct Claude API (not Loremaster)

**Decision:** Remove Loremaster dependency. Implement narration directly via Claude.

**Reason:** Loremaster only responds to messages sent by the GM account. Player
clients cannot trigger narration without a socket relay, which is unreliable in
single-browser sessions and adds account-dependency for multiplayer. Additionally:
no control over narrative style, voice, or prompt; Loremaster uses v1 Application
framework (deprecated in v13); dependency on Patreon-gated external service.

**What replaced it:** `src/narration/narrator.js` + `src/narration/narratorPrompt.js`.
Direct Claude API call via `api-proxy.js`. Configurable model (Haiku/Sonnet),
perspective, tone, length, and custom instructions per campaign. Narration runs
on whichever client triggered the move — no GM dependency. *(Superseded in
part: the move pipeline runs only on the canonical GM (`gmGate.js`, single
emitter), and since 2026-10 other Claude calls follow "Claude calls run where a
key lives, exactly once" — the keyed canonical GM when one is active, else the
author's own key.)*

**Files removed:** `src/loremaster.js`. Loremaster settings removed from
`settingsPanel.js`. Socket relay removed from `index.js`.

---

## Mischief dial naming: `normalizeDial()` bridge

**Decision:** `settingsPanel.js` stores `"lawful"/"balanced"/"chaotic"`.
`mischief.js` uses `"serious"/"balanced"/"chaotic"` internally. `normalizeDial()`
maps `"lawful"` → `"serious"` at all three consumption points.

**Reason:** The two files were written independently with different assumptions about
the dial value names. Rather than changing one file's naming convention (which would
require touching all tests and UI labels), a bridge function was added.

**Where it lives:** Top of `src/moves/mischief.js`. Called at the start of
`buildMischiefFraming()`, `shouldApplyMischief()`, and `buildMischiefAside()`.
*(2026-10: `shouldApplyMischief` is removed — it had no production caller;
`buildMischiefFraming` already gives the model the dial.)*

---

## Safety config storage: sync bridge

**Decision:** `settingsPanel.js` writes Lines/Veils to `game.settings`. The assembler
reads from `campaignState.safety`. `syncSafetyToCampaignState()` bridges them.

**Reason:** The two systems were written independently. `game.settings` is the natural
storage for UI-managed configuration. `campaignState` is the natural source of truth
for the context assembler. Rather than refactor one to use the other's storage,
a sync function runs on every write and on the `ready` hook.

**Private Lines:** Stored client-scoped in `game.settings`. In `campaignState.safety.
privateLines`, they are stored as `[{ playerId, lines }]` objects so each player's
Lines are preserved when any one player's client syncs.

*(2026-10: the assembler is gone — the narrator reads `campaignState.safety`
through `formatSafetyContext`. A player's client can't write campaignState, so it
relays its Private Lines to the canonical GM (`safety.syncPrivateLines`, keyed on
the relay requester) and re-sends them when the GM's relay announces it is ready —
see "Player-invoked world writes go through the GM relay". Shared narration
carries them too — every player's on a GM's client, the building player's own
on a player's — see "Private Lines in shared narration".)*

---

## Progress tracks: single dedicated journal

**Decision:** All progress tracks stored in ONE JournalEntry named "Starforged
Progress Tracks", as a flag directly on the JournalEntry (not on a page).
*(Since issue #345 AA62 the journal is found by that `tracks` flag; the name
only finds — and is given to — a journal no track was saved to yet, so a GM
may rename it.)*

**Confirmed storage (from live testing and progressTracks.js source):**
```js
// Write
await journal.setFlag("starforged-companion", "tracks", tracksArray);

// Read
const tracks = journal.getFlag("starforged-companion", "tracks") ?? [];
```

**Not:** `journal.pages.contents[0].getFlag(...)` — the journal has no pages.
This distinction matters: JournalEntry flags and JournalEntryPage flags are
completely separate. The tracks journal creates no pages.

**Who writes (issue #321).** The journal is created `ownership: NONE` for
players, so every Progress Tracks panel edit — any user's — is written by the
canonical GM (gmRelay `progressTrack.edit`, validated per `op`), and reading
the tracks never creates the journal; only a write does (U05 — a player's
click was refused and did nothing). Every track write on a client runs one at
a time through `writeTracks`, each on a fresh read once the previous write has
landed: the array is saved whole, and two writes that read during each other's
round trip lost one change (U57).

**Reason:** Initially designed with per-track journal entries. Changed because
individual journal entries created UI clutter and made bulk operations require
scanning the entire journal collection. Single journal with a flag array is
simpler and faster.

**Impact:** `assembler.js` `buildProgressTracksSection()` must call
`journal.getFlag(MODULE_ID, "tracks")` directly — NOT read from a page.
`campaignState.progressTrackIds` is unused for this purpose. *(2026-10:
removed — `progressTrackIds` had no writer and was deleted from
`CampaignStateSchema`; the move interpreter, its last reader, now reads the
journal's tracks and the vow Items — known-issues INTERP-TRACKS-BLIND. The
assembler itself was deleted in 2026-07.)*

---

## Portrait generation: generate once, one regeneration, then locked

**Decision:** Portraits follow a three-state lifecycle: none → unlocked → locked.
One regeneration is permitted. After that the portrait is permanently locked.

**Reason:** Art generation is expensive and the campaign wants visual consistency.
Locking after regeneration prevents iterating endlessly on a portrait and ensures
entities have a stable visual identity across sessions.

**State stored on:** `ArtAsset.regenerationUsed` (boolean) and `ArtAsset.locked`
(boolean). The superseded asset gets `ArtAsset.superseded = true` and is retained
for the session log.

**Who generates (issue #321).** A portrait is generated on a GM's client only:
`generatePortrait` / `regeneratePortrait` return null elsewhere before anything is
billed (`canKeepPortrait`), and the Entities panel shows its Generate / Regenerate
buttons to GMs only (U33). Storing, linking and attaching a portrait are GM writes,
so a player's click paid for an image the store then refused. A GM relay was
rejected: the OpenRouter key lives in the GM's browser, a player's relayed click
would spend the GM's art budget and could burn the one regeneration, and a
fire-and-forget relay to a keyless GM fails silently. One portrait per new NPC
card (U29): with Auto-Seed NPC on, the `createActor` seed hook owns it (drawn
from the creator's `portraitSourceDescription`) and the creator skips it; with it
off, the creator generates it — both used to, billing OpenRouter twice.

**Update (issue #347 AB01): the creator starts the portrait and does not wait
for it.** A Make a Connection hit's capture runs inside its narration call,
inside the table's move lock, and waited on the image, its download and its
upload before the bond, the move's record and the lock's release — minutes,
and for good behind a stalled upload. `postCreationEnrichment` now starts
`generatePortrait` and returns, and the capture starts it after the bond; the
draft Confirm and the inciting vow's target share the function. A portrait
that finishes late is safe: `generatePortrait` stores nothing for an entity
deleted meanwhile, keeps one linked meanwhile, and makes one image at a time
per entity.

---

## `foundry-shim.js`: deleted

**Decision:** `src/foundry-shim.js` was deleted. Entity files had their import
statements removed via `scripts/remove-shim-imports.js`.

**Reason:** The shim was created to make Foundry globals available in Jest tests.
Switching to Vitest with `tests/setup.js` providing stubs via `global.*` assignments
made the shim unnecessary. The shim also caused 404 errors in the Foundry renderer
when module files tried to import it at runtime.

---

## CI release: update `module.json` before building zip

**Decision:** The CI release job updates `module.json` (version, download URL,
manifest URL) BEFORE building the zip.

**Reason:** The zip was originally built first, then `module.json` was updated as a
separate step. This meant the zip contained an old `module.json` with empty download
and manifest URLs. Foundry reads the manifest from inside the installed zip to check
for updates — an empty manifest URL means Foundry can never find an update. Swapping
the order fixed both the update detection and the version display.

---

## Claude API model selection

**Interpretation (move identification):** `claude-haiku-4-5-20251001` — fast, cheap,
structured JSON output. System prompt cached with `cache_control: ephemeral`.
Prompt caching makes interpretation nearly free per call.

**Narration:** `claude-sonnet-4-5-20250929` default, `claude-haiku-4-5-20251001`
available. Sonnet produces noticeably richer prose. System prompt cached. Cost per
session at Sonnet: ~$0.05. Configurable per campaign in module settings.

**Why not Opus:** Overkill for both tasks. Haiku handles structured output well.
Sonnet handles atmospheric prose well. Opus is for complex reasoning tasks neither
of these require.

---

## Sector background art storage: worlds/{worldId}/scenes/

**Decision:** Sector background images are uploaded to `worlds/{worldId}/scenes/`
using `foundry.applications.apps.FilePicker.implementation.upload()`. The path
is constructed at upload time from `game.world.id`.

**Reason:** The previous path (`modules/starforged-companion/art/`) lives inside
the module folder. Foundry's module installer wipes that folder on every module
update or reinstall, destroying all generated backgrounds. The world's own
`worlds/{worldId}/scenes/` directory is created by Foundry when the world is
created, persists across module updates and reinstalls, and is included in
Foundry's world export/backup. No custom folder needs to be created.

**Side-effects:**
- Foundry no longer shows the "unsafe module folder" warning for uploaded art.
- Sector backgrounds are backed up with the world via Foundry's world export.
- Entity portraits are unaffected — they continue to use base64 flag storage.

**FilePicker namespace:** `foundry.applications.apps.FilePicker.implementation`
(the v13 non-deprecated form). The bare global `FilePicker` is deprecated in v13.

---

## Narrator tone and perspective

**Tone: wry** — knowing and slightly sardonic, aware of consequence without
wallowing in it. The narrator has seen this before. It notices the irony. It
does not editorialize, but it does not pretend not to notice. This is the
default and the recommended setting for Ironsworn: Starforged, which has an
existing tradition of spare, consequential prose with occasional dark wit.

**Perspective: auto** — second person ("you") for solo campaigns, third person
(character names) for multiplayer. Resolved at narration time from the count of
active non-GM users — and, since issue #342 Z40, third person whenever two or
more characters act in the one narration (a Batch Mode round's CHARACTER
blocks: a GM's PC acting beside one player's). Can be overridden to a fixed
value per campaign.

**Why auto rather than a fixed default:** Second person creates intimacy in solo
play — the narrator is addressing the player directly, which suits the journaling
nature of Ironsworn solo. Third person is more natural for multiplayer where
multiple characters are present and "you" becomes ambiguous.

**Both are configurable** in the Narrator tab of module settings. The auto
logic lives in `resolveNarrationPerspective()` in `src/narration/narratorPrompt.js`.

---

## Auto-capture salience gate

**Decision:** The combined detection pass and the chronicle writer rate every
candidate beat on a five-tier salience scale (`trivial` < `scene` < `notable` <
`significant` < `defining`), and each capture channel — World Journal Lore,
World Journal Threats, and the character Chronicle — drops anything below its
own configurable floor. Floors default conservatively to `significant`. The
shared logic lives in `src/world/salience.js`; the gate sits in
`routeWorldJournalResults` (lore/threats) and `writeChronicleEntry` (chronicle).

**Reason:** v1.6.1 playtest (findings F15 / F17 / F20 / F21) showed auto-capture
was over-eager — transient scene beats (a sensor blip, scorch marks, an airlock
cycling) became permanent Lore pages, scene-level complications became world
Threats, and the Chronicle filled with moment-to-moment minutiae. Salience is
distinct from the existing detector `confidence` field (how sure the model is a
thing exists) — it measures how *durable* the thing is — so it is a new field,
not an overload of `confidence`.

**Per-channel, not a single dial (D4):** each channel owns its floor so the GM
can, e.g., keep Threats strict while loosening the Chronicle. Matches the
existing per-feature world-settings style.

**Conservative default (D5):** the floor is `significant`, so only durable
world/character facts are recorded and the GM promotes scene texture up. Under-
capturing is cheap to correct (the WJ panel has a Confirm step; the Chronicle
has manual + Add Note); over-capturing creates cleanup. Findings explicitly
flagged over-capture, so the default errs toward recording less.

**Fail-open — the load-bearing safety choice:** `passesSalience` treats an
absent or unrecognised item salience as a *pass*. If the model stops emitting
the field (format drift), capture degrades to the pre-salience "record
everything" baseline rather than a silent blackout where nothing is captured.
This is the RECAP-003 lesson — never let a parse miss silently disable a whole
subsystem. The salience path is also kept free of `console.warn` so the
fail-open route does not trip the test-harness warn guard.

**What was rejected:**
- *A numeric 1–5 score.* An ordered enum is more self-documenting in the JSON
  and the per-channel setting becomes a meaningful choice list rather than an
  opaque number; it also mirrors the `SEVERITY_ORDER` idiom already in
  `worldJournal.js`.
- *Fail-closed (drop unrated items).* Safer-looking but it risks the exact
  silent-disable failure mode RECAP-003 warned about.
- *Retroactive sweep of existing over-captured entries (D6).* Out of scope —
  go-forward behaviour only.

**Running session log (D7, append-during-play):** below-threshold lore/threat
beats are not dropped — they append to one running session-log page per session
(`appendSessionLogBeat`), a live scene-by-scene log. `writeSessionLog` was
refactored to fill the End-Session summary as a section on that *same* page
(matched by `sessionId`, one page per session) rather than spawning a new page
each End Session, so the F18 wrap-up and the live log coexist. Reserve Lore and
Threats for durable facts; the Session Log holds the session's texture (F18).
The chronicle is **not** rerouted — it is the PC's personal record, not a scene
log, so below-floor chronicle beats are skipped. The empty-body defect (T3) is a
separate confirm/persist concern, not a salience question.

**Settings surface:** the three thresholds are registered `config: false` like
the rest of the World Journal / Chronicle capture family and are documented in
the in-game Settings Reference. *(2026-11-01, issue #322 V06: the panel now
renders them — the Narrator tab's Character Management and World Journal
sections, with Narration Max Tokens, the Scene Interrogation trio and the
Private Channel switch; the four Ship Positioning settings join the Mischief
tab's Fact Continuity section. Every setting the Settings Reference places in
the panel has a control there; nothing could set them before.)*

---

## Entity finalize lifecycle (T1)

**Decision:** Entity flavour (a grounded narrator description) and a first-time
portrait are generated by an explicit **finalize** step, not at creation.
`finalizeEntity(typeKey, hostId, campaignState, { force })` in
`src/entities/finalize.js` reads the entity's stored Actor record, generates a
2–4 sentence description grounded only in its fields, writes it
(`system.description` + flag + `portraitSourceDescription`), stamps
`finalizedAt`, and triggers a portrait only when the entity has none. The Entity
Panel exposes it as **✦ Finalise** → **↻ Regenerate flavour**.

**Why an explicit step, not auto-at-creation (D1):** the v1.6.1 playtest framed
T1 as "defer generation out of creation," but the code already deferred it — the
creators (`createShip`/`createSettlement`/…) are pure. The real gaps were a
silently-dropped sector stub (fixed separately) and the absence of a
*grounded, on-demand* generation a GM can invoke once the entity's details are
settled. An explicit trigger also avoids spending image-generation budget
automatically on every detected entity.

**Idempotent + manual regen (D2):** a finalized record is left untouched unless
`force` is set, so a later narrator pass or re-finalize never clobbers GM-facing
flavour. The regenerate path passes `force`. Art is **generate-once/locked** per
the art pipeline: finalize triggers a portrait only when there is none, and a
flavour regen never re-bills or replaces an existing portrait — the panel's
separate one-time portrait regen owns that.

**Scope:** the four Actor-backed types (ship / settlement / planet / location).
`connection` is seeded richly at creation (oracle role/goal/first-look) and
`faction`/`creature` are journal-backed and sparse; none are in the affordance.
Extending to them later is just adding entries to the `GETTERS`/`UPDATERS` maps.

**Update (FOLDER-002, issue #311 P07):** ship and connection Finalise run their
seed (oracles, modules, Notes, art) instead of the flavour pass, under the same
contract: finalized and not forced is left as it is, and a successful seed
stamps `finalizedAt`. The seed path skipped both, so a ship's repeat Finalise
rewrote its Notes.

**Fail-safe:** with no Claude key, `finalizeEntity` returns `{ ok:false,
reason:"no-flavor" }` and writes nothing; the panel surfaces a notification.
Generation is grounded strictly in stored fields with an explicit "do not invent
proper nouns" instruction, so finalize can't fabricate new entities/factions.

## Companion launcher: floating toolbar, NOT scene-controls (v1.7.5)

**Decision:** The Companion's panel launcher is a **floating, draggable,
frameless `ApplicationV2`** (`src/ui/companionToolbar.js`), opened at `ready` and
pinned to the viewport — independent of the canvas. It is **not** a Foundry
scene-control group.

**Why (the bug that forced it):** F16 (v1.7.0) gave the Companion its own
top-level scene-control group, backed by an empty `InteractionLayer`. A
scene-control group can only be *activated* when the canvas is ready, because
selecting a group activates its canvas layer. With **no active scene**
(`canvas.ready === false` — the normal state for theater-of-the-mind play, and
what a Forge "no default scene" launch setting produces) the entire
scene-controls bar is inert: clicking **any** group icon, Foundry's own included
(Walls, Lighting), fails to switch, with no error. The Companion buttons were one
casualty among all groups. This was misdiagnosed twice as a problem with *our*
group's config — first the v1.7.1 `activeTool` band-aid, then a v1.7.4
`primary`→`interface` canvas-group change (released, but still broken for
mapless play) — but neither could work, because the
surface itself is dead without a canvas. Live tracing (clicking Walls also froze
on `tokens`; `canvas.ready`/`hasScene` both `false`) confirmed it was global, not
ours.

**Consequence:** scene-controls is the wrong home for a launcher that must work
during mapless play. The floating toolbar works with or without a scene. The
old `getSceneControlButtons`/`renderSceneControls` hooks, `buildCompanionTools`,
and the fake `StarforgedCompanionLayer` / `CONFIG.Canvas.layers.starforgedCompanion`
registration are removed. Per-user position persists via a client-scoped
`companionToolbarPosition` setting. Visibility (GM-gating, Private Channel gate)
is a pure function in `companionToolbarTools.js`, unit-tested.

**Note on foundry-ironsworn:** the vendor system registers its `ironsworn`
control group the same way (`group: "primary"`, a 2022 value) and its group is
broken identically with no scene — confirmed with our module disabled. That is
an upstream bug, not ours; do not treat ironsworn's `sceneButtons.ts` as a
template here.

## NPCs and connections: native ironsworn `character` Actors, per-sector NPC folder

**Decision (2026-06-03):** NPCs are represented as foundry-ironsworn
**`character`-type Actors** (the full "character card", same sheet PCs use).
**Connections** — the bond NPCs, including the local connection the sector
wizard generates — are **also** created as `character` Actors, converting off
their legacy `JournalEntry` storage. NPCs and connections for a sector live in a
**per-sector NPC Actor folder** (`Sectors / <Sector Name> / NPCs/` in the
**Actor** sidebar), alongside the top-level `PCs/` and `Starships/` Actor folders
that are created on Companion module activation.

**Why:** the Actor sidebar is the right home for entities with sheets, and the
ironsworn system **does** ship native `character` / `npc` / `foe` actor types —
so there is no reason to keep relationship NPCs as journal pages. The
`character` card is the richest and matches how PCs are already handled by
`actorBridge.js`.

**Corrects a stale premise:** `issue #228 (Entity → Actor Migration)` §8 previously
deferred connection migration claiming *"No native NPC actor type."* That was
factually wrong (the system exposes `character`/`npc`/`foe`), and the error is
why this structure repeatedly got lost between sessions. This decision
supersedes that out-of-scope note.

**Consequence (implementation, tracked under FOLDER-002 — not yet built):**
- `src/entities/registry.js` — `connection` routes to `'actor'` (`type:
  'character'`), no longer `'journal'`.
- `src/entities/connection.js` — create path builds a `character` Actor instead
  of a `JournalEntry` + page; readers/updaters follow the actor host.
- `src/sectors/sectorGenerator.js` — the local connection is created into the
  sector's NPC Actor folder.
- `src/entities/folder.js` — add a per-sector NPC Actor-folder helper and
  activation-time scaffolding for `PCs/` (adopt-or-create) and `Starships/`.
- A migration for any existing journal-backed connections in live worlds.

**NPC/connection card population (decided 2026-06-03):** when an NPC/connection
`character` card is created, roll the Character oracles — **First Look**,
**Initial Disposition**, **Character Role**, **Character Goal** (name handled
separately) — and:
- write the oracle results into the card's **Characteristics** field;
- route them through the **narrator** (initial flavor text) and through **art
  generation** (portrait → token image);
- place the initial flavor text **and a large version of the token image** in the
  card's **Notes** tab.

This mirrors the existing **starship auto-envision** behaviour (the `index.js`
setting that rolls a new starship's oracles into its Notes and fires a silent
portrait generation) and reuses the oracle rolls `generateConnection()` in
`sectorGenerator.js` already performs (role / goal / disposition / first look /
name). The missing work is persisting those onto the ironsworn `character` actor
(map to the Characteristics and Notes sheet fields via `actorBridge.js`) and
wiring the narrator + art passes for NPCs the way settlements/ships already do.

---

## Narrator memory: unified prose feed + deterministic sidecar + scene frame (2026-06-10)

**Decision:** narrator continuity is owned by a four-surface memory
architecture — (1) a unified recent-narration ring fed by the
`narratorCard`/`narrationText`/`sessionId` flag family on **every**
narrator-prose card (move, paced, @scene, inciting incident); (2) the
active-scene ledger with **required** sidecar emission for NPC
location/vessel/condition (stateChanges) and intent/stakes (newTruths),
subjects resolved against the full entity roster; (3) a narrator-maintained
**scene frame** (`sceneFrame` sidecar key: location / present / situation,
full-replacement snapshot every response, scene-scoped, never dropped from
the prompt) whose `present` list extends ledger scoping and paced/@scene
relevance matching; (4) entity records injected via the **lexical** relevance
resolver on the paced and @scene paths (zero API cost — `moveId: null` never
reaches the Haiku classifier).

**Reason:** v1.7.8 playtest (findings F6/F7/F8) — the campaign premise
drifted across location, motivation, and stakes within ~30 minutes because
the inciting incident and @scene answers were invisible to every subsequent
narrator call (wrong flags), sidecar emission was discretionary (it kept the
backstory, dropped the stakes), and the non-move paths injected no entity
records at all. The one ledgered fact held firm all session: facts with homes
get defended; facts without homes get rewritten.

**Rejected:**
- *A separate feed flag* instead of extending `narratorCard` — would have
  left session recaps still missing the opening fiction and split the flag
  vocabulary; consumers were audited instead (correction/audio hooks no-op
  without their button markup; burn-supersede requires `resolutionId`).
- *Haiku-based scene summarisation **per turn*** — rejected at Cluster A for
  cost/latency per narration. The §8.6 escalation has since been **taken** as a
  *debounced* rolling session summary (regenerated once per ~1.5×N cards, not
  per turn), which answers the original cost objection. See "Rolling session
  summary: a debounced trailing memory tier" below.
- *Code-side inference of NPC state from prose* — emission is prompt-enforced
  (REQUIRED rules in `appendSidecarInstruction`); inference machinery only if
  the model demonstrably ignores the contract.
- *Frame-unioning the move path's relevance call* — deferred; it would change
  hybrid-move permission classification (architecture doc §8.2).

**Where:** invariants in `rules/narrator-memory.md`; full architecture,
tuning guide (symptom → knob), and refinement backlog in
`docs/narrator/narrator-memory-architecture.md`. Settings:
`narratorContextCards` (ring depth — 1–10, default 3 when this was written;
now 1–50, default 20) and `factContinuity.sceneFrame` (default on).

---

## Rolling session summary: a debounced trailing memory tier (2026-06-15)

**Decision:** the narrator gains a fifth memory surface — a **rolling,
session-scoped prose "story so far"** that complements the verbatim
recent-narration ring rather than replacing it (the §8.6 escalation, promoted
to a build). Mechanics:

- **Summarised from source, never from itself.** Each regeneration reads the
  full feed of the session's narrator cards (`sessionNarratorCards`) and
  produces a fresh summary via one cheap Haiku call. No incremental
  summary-of-summary, so it cannot drift by compounding.
- **Debounced at K = round(1.5 × N)** where N is `narratorContextCards`. The
  summary regenerates only once K new cards have accrued since the last regen;
  every other turn is a free cached read. Because 1.5 × N > N, a summary only
  ever appears once there is a tail of cards beyond the verbatim ring.
- **Runs the whole session** (not scene-scoped). Stored on
  `campaignState.sessionSummary = { text, coveredCount, sessionId, updatedAt }`,
  keyed by `sessionId` so a new session ignores the stale prior summary.
- **Written to the Session Log at End Session.** The End Session flow does a
  final `forceRefresh` regen, then `writeSessionLog` records the prose under
  the page's "Session summary → Story so far" heading for subsequent use.
- **GM-gated, fail-open.** Non-GM clients use the cached text but leave the
  durable write to the GM; any generation error returns the previous text, so
  a summary hiccup never blocks a narration. Gated by the world setting
  `narratorSessionSummary` (default on).
- **Rendered** as system-prompt section `[4c] STORY SO FAR (THIS SESSION)`,
  between the campaign premise `[4b]` and the current location `[5]`; never
  rendered for meta modes (`campaign_recap`).

**Drop priority (the explicit ordering — lowest = shed first under budget
pressure, highest = never dropped):**

1. Scene state (existing — sheds first inside the §6.5 ledger)
2. Recent-narration ring depth (trim toward fewer verbatim cards)
3. **Rolling session summary** ← this tier sheds here
4. Entity cards · current location · active sector · world/campaign truths ·
   inciting premise
5. **Never dropped:** scene frame · binding truths · ship position

**Hard invariant:** the session summary is a *droppable continuity
convenience, not a fact store*. It must never be retained at the expense of any
§6.5 ledger tier or the never-dropped facts. This is satisfied structurally
today — it is a single, bounded (~≤320-token Haiku-capped), self-contained
prose block that is appended only when present and is always safe to omit; it
does not participate in or compete with the §6.5 `maxLedgerTokens` budget.
Load-bearing facts still live in the ledger / entity tiers / WJ Lore, which
defend them; the summary only carries narrative *texture* the ring would
otherwise drop.

**Reason:** after the first card of a session the ring shows only the last N
cards, so the narrative arc of everything older survived solely as discrete
ledger facts — tone, dramatic through-line, and unresolved tension were lost
mid-session, and the campaign recap (the cross-session summariser) is injected
only at session start. The rolling summary fills that middle band cheaply.

**Rejected / deferred:**
- *Scene-scoped instead of session-scoped* — the felt gap spans scene
  boundaries within a sitting; the §6.5 ledger already covers the current scene.
- *Replacing the ring (per §8.6's original sketch)* — the verbatim ring carries
  phrasing the summary necessarily flattens; they are complementary.
- *A ledger-duplication guard* — the summary may restate facts already in the
  ledger. Deliberately **waived** until it demonstrably causes a problem
  (contradiction or token bloat); revisit by biasing the summariser prompt away
  from facts if a playtest shows it.

**Where:** `getRollingSessionSummary` /
`rollingSummaryThreshold` in `src/narration/narrator.js`; rendering in
`buildNarratorSystemPrompt` (`src/narration/narratorPrompt.js`); End Session
persistence in `src/safety/sessionLifecycleDialogs.js` + `writeSessionLog`
(`src/world/worldJournal.js`). Architecture doc §8.6.

---

## Named-NPC continuity: paced-path generative tier, salience-gated, + cast hygiene (2026-06-15)

**Decision:** strengthen per-entity memory along three axes, all keyed on the
existing named/unnamed split (a confirmed record = named; no record = ephemeral):

1. **The generative tier now updates on the paced/free-narration path**, not
   only on interaction-class move resolution. `narratePacedInput` schedules
   `appendGenerativeTierUpdates` for the in-scene matched entities
   (`schedulePacedTierUpdate`), mirroring the move path's post-narration pass.
   Conversation/roleplay scenes are where an NPC's character is most
   established, and they were previously writing nothing to the card.
2. **Tier capture is salience-gated and biased toward actions/developments.**
   The tier-update prompt now asks for *significant* developments — what the
   character did, decided, revealed; shifts in disposition/allegiance/relationship
   to the PC — and rates each with a salience. `appendGenerativeTierUpdates`
   drops anything below a fixed `TIER_SALIENCE_FLOOR = "notable"` (more
   permissive than the chronicle/lore floors, because an NPC's card should hold
   character-relevant beats even if they aren't campaign-defining). Fail-open:
   an unrated update still lands, so model drift degrades to the prior
   capture-all behaviour rather than emptying the tier.
3. **The narrator is nudged away from naming minor characters.** A "name
   sparingly" rule sits in the discovery permission block *and*, paired with the
   Finding-O anchor, in `appendSidecarInstruction` (universal, non-meta): leave
   one-off functionaries generic ("a guard", "the comms officer"); spend a
   proper name only on a character meant to recur. This is the chosen
   alternative to a graded-importance data model — instead of grading named
   NPCs, reduce the population of named-but-minor ones, so the cast that gets
   tracked is the cast that matters.

**Reason:** the narrator's structured memory of an NPC (motivation, disposition,
faction relationship) exists only as entity-card fields surfaced when the entity
is confirmed AND matched. For invented/unmatched figures it improvises, and
un-homed facts drift. (1)+(2) give in-scene named NPCs a durable, low-noise
behavioural record on every narration path; (3) keeps the un-homed population
small so improvisation drift is confined to genuinely disposable figures.

**Rejected / deferred:**
- *Graded importance flag on named NPCs (minor vs central)* — replaced by the
  prose nudge in (3); revisit only if naming discipline proves insufficient.
- *Appending to the user-facing `notes` field* (the original sketch) — the
  generative tier is the right home: capped on the card (5; 10 with trait
  slots since issue #286 — see "Ledger state sheds by priority…"), deduped, pinned,
  and auto-promoted to WJ Lore at scene end. `notes` would bloat unboundedly.
- *A scene-end per-NPC rollup* (one summary entry per scene instead of per-turn
  details) — a clean follow-up, not built yet.
- *A new salience setting for the tier* — used a fixed floor instead, per the
  "don't add knobs before using the existing ones" rule.

**Where:** `schedulePacedTierUpdate` (`src/narration/narrator.js`);
`TIER_SALIENCE_FLOOR` + `buildTierUpdatePrompt` + salience gate in
`appendGenerativeTierUpdates` (`src/entities/entityExtractor.js`); cast nudge in
`NARRATOR_PERMISSIONS.discovery` + `appendSidecarInstruction`
(`src/narration/narratorPrompt.js`). Architecture doc §5.

---

## Exploration lifecycle: expedition + waypoint moves wired to the live track (2026-06-15)

**Decision:** the exploration cluster now applies its mechanical effects instead
of leaving them as instructional text (closes audit 3.18–3.21):

- **Undertake an Expedition** and **Explore a Waypoint** mark progress on a
  shared **expedition** progress track via `expedition.applyExpeditionProgress`
  + a GM-gated pipeline handler. The track is resolved by destination
  (`moveTarget`), else the single open expedition, else **auto-created** at an
  **interpreter-inferred rank** (`expeditionRank`; validated, `dangerous`
  default, re-rankable in the panel — the inference is a best guess, kept cheap
  to correct). *(Issue #321 U16: auto-created only when no expedition is open
  or the move names a destination none of the open ones matches; naming none
  among several open, the pipeline asks "Which expedition?" before rolling, and
  a track named by id that is over marks nothing — it used to begin a phantom
  "Expedition".)*
- **Make a Discovery / Confront Chaos** mark the **discoveries** legacy track
  (2 ticks / 1 tick-per-aspect) via a `legacyMark` consequence. *(2026-10,
  issue #316: neither has an action roll — the resolver draws no dice for
  them (T05) — and a waypoint match offers them instead of its ordinary
  result, one claim per card (T06). See "Issue #316 audit".)*
- **Finish an Expedition** completes the open expedition track and pays its
  rank's **legacy reward** onto discoveries (`legacyRewardTicks`, the play-kit
  1-tick→3-box table; weak hit one rank lower, troublesome→none; a miss leaves
  the track open).

**Integrate via the live track store.** The canonical progress-track store is
the flag-array model behind the panel (`ui/progressTracks.js`). The
`persistResolution.progressTrackId` path (and `campaignState.progressTrackIds`)
is **vestigial — never written from a resolution** (combat's `progress` suffer
option is dormant for the same reason) *(2026-10: removed — see known-issues
AUDIT-DEAD-SURFACE)*, so the move→track wiring lives in
`src/moves/expedition.js` (dependency-injected, Foundry-free, unit-tested) and a
GM-gated handler in `index.js`. Legacy/finish writes mutate `campaignState` in
place; the GM's `persistResolution` deep-clones and persists it (no race).

**Rejected / deferred:**
- *Activating the `progressMarked + progressTrackId` persist path* — it targets
  the vestigial store; the panel store is the real one.
- *A true in-dialog momentum-vs-progress choice for Explore a Waypoint* — the
  strong hit auto-marks progress (dropping the contradictory baked-in
  `momentumChange:2`), with +2 momentum offered in the card text. A real toggle
  shares the **dormant combat `progress` suffer option**, so wiring it properly
  is a cross-cutting suffer-dialog change beyond this cluster.
- *Populating `currentWaypoint`* — redundant with the progress-track context the
  assembler already injects (the track's label is the destination); the field's
  semantics are underspecified, so it stays unused until a concrete consumer
  defines them.
- *One-click "Make a Discovery / Confront Chaos" buttons on the Explore result*
  — the chained moves already work when typed/suggested; a button needs a
  programmatic move-dispatch path (its own piece of work).
- *XP-on-box-completion for the legacy marks* — mirrors the existing `!bond`
  handler (raw tick add, capped 40); the Earn Experience box accounting is a
  pre-existing gap shared with bonds, not introduced here.

**Where:** `src/moves/expedition.js` (`applyExpeditionProgress`,
`finishExpedition`, `selectExpeditionTrack`, `legacyRewardTicks`); resolver
consequence flags (`expeditionProgress` / `legacyMark` / `finishExpedition`);
`interpreter.expeditionRank`; pipeline handlers + feedback cards in `index.js`;
`progressTracks.completeProgressTrack`. Tests: `tests/unit/expedition.test.js`.

---

## Speaker resolution: token selection first, PC-validated (2026-06-10)

**Decision:** `resolveSpeakerActorId` honours Foundry's native "speaking as"
mechanism as the top-priority signal — `message.speaker.actor` (v13
`ChatSpeakerData`, stamped from the user's controlled token by
`ChatMessage.getSpeaker`) wins **when it resolves to a player character** —
before the author's bound `User.character`, the ownership scan, and the
campaignState fallback. Non-PC speakers (a selected starship, an NPC card —
`character` actors carrying the module `entityType` flag, FOLDER-002) fall
through to author-based resolution rather than being attributed. *(Issue
#321: the bound `User.character` is PC-validated the same way — a user who
assigned the starship or an NPC card as their character spoke as it (U24);
the author steps are `resolveUserActorId`, and the campaignState fallback
applies only to a GM author or in solo play (one PC), so a player with no PC
of their own resolves to none, never another player's (U23).)*

The resolved speaker reaches every narrator path (move, paced, `@scene` —
which previously discarded its options entirely), the user message labels
the input with the speaker's name plus an attribution rule, and a PARTY
section (rendered only with 2+ PCs) lists the roster with the current
speaker marked.

**Reason:** first multiplayer playtest — the narrator couldn't tell who was
speaking. Token selection is the explicit, per-message statement of intent
Foundry players already use, and the maintainer requested it as the signal.
The original `speaker.js` docstring framed token-selection as a player
workaround and went author-based only; this supersedes that framing.

**Rejected:**
- *Trusting `message.speaker` unconditionally* — live playtest showed chat
  attributed to "Ship" when the ship token was selected; unvalidated
  speakers would attribute narration to vessels and NPC cards.
- *Alias-based matching* (`speaker.alias` → name lookup) — the actor id is
  authoritative and already present; alias is display-only.
- *Per-user setting* — Foundry's existing token/character binding already
  expresses the preference; no new configuration surface.

**Verification:** v13 `speaker` shape documented in
`docs/foundry-reference/foundry-api-reference.md` (ChatMessage section) with
provenance from the pinned foundry-ironsworn source; live Quench assertions
pin `getSpeaker({actor})` round-tripping the id and the non-PC fall-through.

---

## Ship position: a sector-map token is authoritative when present (2026-06-12)

**Decision (maintainer, v1.7.10 playtest):** when a command-vehicle token
sits on a sector Scene, the map IS the position statement — placement and
off-pin repositions write the §20 position record from the token's actual
coordinates (`createToken`/`updateToken` hooks in `sectorSceneHooks.js`:
nearest settlement pin within 3× snap radius → "near <settlement>", else
"deep space"). When no token exists, fiction-side fallbacks apply: the
inciting incident must emit a starting `ship/position` sidecar change, and
an empty record injects an explicit "not yet established — do not invent"
guard line into the narrator prompt rather than silence. *(Issue #321 U47:
the token the sector creator places on a new map is a position statement
only for a ship with no position yet — for one that has a position it is
created with `POSITION_SYNC_OPTION`, so creating another sector no longer
moves the ship onto its map.)*

**Reporter's framing (verbatim):** *"The token was positioned on the sector.
In that instance, it's position should be known. It sounds like there is a
missing hook for placing it on the sector, that then populates the value. If
it isn't on the sector, then the above fallbacks sound great."*

**This refines (does not reverse) Cluster C's "the map follows the fiction":**
both directions now write, disambiguated by provenance — fiction-side writes
sync the token (existing), token-side writes record position
(`updatedBy: "token_placement"`, read "near" its pin — issue #321 U53: they
were `scene_token`, so a ship parked near a settlement or auto-placed read
"docked at"; `scene_token` is now the Set a Course arrival a drop on a pin
starts, read "docked at"), and every programmatic token move carries the
`POSITION_SYNC_OPTION` update option so the hooks never mistake the module's
own syncs for player statements (without it, the sync's own update would
re-enter the drag handler and dispatch a duplicate set_a_course).

**Boundary kept deliberately:** dropping the token ON a pin (snap radius)
still routes through the Set a Course move — travel under stakes costs a
roll; an off-pin drop is a position note with no move mechanics. The radius
split is the predictable rule for which is which. *(Issue #321: the drop
names the pin's settlement Actor — its current name and its id — and the
arrival records that settlement by id (U52); it routes through the move only
while Ship Positioning and Auto-Move Ship on Set a Course are both on, since
the arrival needs both — with either off it is a plain token move, where it
used to roll the move and leave the ship in place (U54).)*

**Rejected:**
- *Snap-back on off-pin drags* — punishes the common "park the ship near X"
  gesture and leaves the record empty.
- *Treating the token as a pure mirror (status quo)* — guaranteed the
  narrator and the map could both be confidently wrong in different
  directions, which is exactly the playtest failure.

---

## NPC cards pin the Starforged character sheet (2026-06-12)

**Decision:** every NPC-card Actor the module creates carries
`flags.core.sheetClass = 'ironsworn.StarforgedCharacterSheet'`
(`STARFORGED_CHARACTER_SHEET` in `connection.js`), and a ready-time repair
pins existing cards that have no explicit override. foundry-ironsworn's
default sheet for `character` actors is the **classic Ironsworn** sheet
(`makeDefault: true` in vendor `src/index.ts`); the system's own Starforged
create-dialog pins the override per actor, and we must do the same. This is
not cosmetic: the classic sheet's Notes tab binds `system.biography`, so the
seeded portrait + narrator intro (written to `system.notes`) render nowhere
on an unpinned card (v1.7.10 findings F1/F4). Cards a GM deliberately
re-sheeted are left alone; PCs are never touched (entityType flag gate).

---

## NPC identity is established once and propagated (pronouns) (2026-06-13)

**Decision (v1.7.11 playtest E/F):** an NPC card establishes its **pronouns**
once, at seed time (`pickConnectionPronouns` → record `pronouns` + the sheet's
`system.pronouns`), and that single value drives every downstream surface: the
portrait prompt (`pronounsToPortraitDescriptor` → "a woman/man/person" leads the
art description), the seeded Notes prose, the narrator entity card
(`CANONICAL_FIELDS_BY_TYPE.connection` now lists `Pronouns`), and the audio NPC
voice (`pronounsToVoiceKey` → the feminine/masculine/neutral voice settings).

**Reason:** without an established gender, the art model, the narrator, and the
audio layer each invented one independently and disagreed (male-presenting
portrait, "her" in prose, a male voice). The fix is one source of truth, not
three coincidentally-aligned guesses — the same "facts with homes get defended"
principle as the narrator-memory work.

**v1.7.13 follow-up (playtest I/R — two propagation gaps closed):**
- *Art (I):* leading the portrait *source description* with the descriptor was
  not enough — a single mid-prompt mention was diluted by strongly-gendered
  "first look" oracle text. `buildEntityContext` (`src/art/promptBuilder.js`)
  now **reinforces** the descriptor at the end of the prompt for connections,
  reusing the same `pronounsToPortraitDescriptor` so both mentions stay in sync.
- *Vignettes (R + sibling):* the `session_vignette` narrator mode injects no
  entity cards, so pronouns must ride in the user-message hint. The end-session
  NPC hint (`composeConnectionHint`) and the begin-session absent-crew summary
  (`summariseAbsent`) now lead with `Pronouns: …`. Leading guarantees survival
  of the hint's length truncation.

**Rejected:**
- *Per-segment speaker identity in audio* — the `<npc>` markup carries no
  identity, and audio is applied per-card. The focal-connection heuristic
  (single matched connection → its voice; ambiguous → default) covers the
  common case without a narrator-prompt change; multi-NPC-per-card remains a
  documented limitation.
- *Forcing androgynous art for they/them* — "a person" lets the model choose;
  only she/he bias the render.

---

## Post-roll "improve the result" affordance (2026-06-13)

**Decision (v1.7.11 playtest G):** assets that improve a result *after* the roll
at a cost (Fugitive: "improve the result to a strong hit, then fill a clock")
get a post-roll button on the move-result card, modelled exactly on Burn
Momentum (`src/moves/improveResult.js`). The pre-roll ability scanner stays
pre-roll (it folds `+N` adds before the dice); this is its post-roll
counterpart. The cost is the ability's own per-ability clock
(foundry-ironsworn `AssetAbilityField` `hasClock`/`clockTicks`/`clockMax`),
advanced one segment on use.

**Reason:** the scanner correctly *highlighted* Fugitive pre-roll but there was
no way to act on the dice afterward — the reporter could see the ability but not
adjust the result. Burn Momentum already proved the post-roll pattern
(re-resolve → re-narrate → supersede → re-persist); reusing it keeps one mental
model for "change the result after the roll."

**Scope (kept bounded, matching burn):** non-progress moves only; only an
explicit "improve … to a strong hit" phrasing triggers it (never adds/reroll
abilities); offered only when the rolled outcome is below a strong hit. The
asset clock is advanced mechanically when present; a non-clock cost is surfaced
as a card note for the player to apply.

**Update (issue #311):** an improvement does what a burn does to the
superseded outcome — reverts its miss's Pay the Price (P05), retires its
pending choice card and posts the strong hit's (P03) — and both claim the
card before any effect (P06). See "Issue #311 audit".

---

## Sector scene padding: never zero (2026-06-13)

**Decision (v1.7.11 playtest D):** sector scenes set `padding: 0.1`, never `0`.
Padding is the camera's pan/zoom slack; `0` traps the camera at the image edge
(zoom in works, but no pan and no zoom-back-out to the full map). The scene also
captures an `initial` view (centred, fit-scale ≤ 1) so loading or resetting
returns to the whole-map overview. The black padding buffer is invisible
against the starfield background, so the "edge to edge" aesthetic the `0` was
chosen for costs nothing to drop.

**Refinement — placeables MUST be offset by the scene-rect inset (2026-06-15,
v1.7.14, PLAYTEST-1712 A):** turning padding on has a non-obvious consequence
that bit two releases. With `padding > 0` Foundry centres the background (the
"scene rectangle") inside a *larger* canvas at `(sceneX, sceneY)`, but
embedded-document coordinates (Notes, Drawings, Tokens) are absolute from the
**padded-canvas top-left** — so a pin placed at raw `gridX*size` lands
`(sceneX, sceneY)` px up-and-left of the background, out in the black void.
`createSectorScene` therefore reads `scene.dimensions` (Foundry's authoritative
`BaseGrid#calculateDimensions` result, via the `sceneRectOffset` helper) and
adds `(sceneX, sceneY)` to **every** placeable coordinate. The initial-view
centre is then set **explicitly** to `(sceneX + sceneWidth/2, sceneY +
sceneHeight/2)` from the same offset — we do **not** rely on Foundry's default
centring (the camera-geometry note flags it as unverifiable, and a stale API
doc describes the default as the scene *top-left*, not its centre).

This is the correct fix for finding A. The v1.7.13 attempt mis-diagnosed it as
a pure camera bug: padding was never the regression, and the placeables were
never offset — v1.7.13 only moved the camera to the true scene-rect centre,
which *de-aligned* the view from the still-cornered content and made it look
**worse** ("completely off the map"). When changing padding or any sector-scene
geometry, keep the placeable offset and the camera centre derived from the same
`sceneRectOffset(scene, …)` so they cannot drift apart again.

---

## Asset consequence riders are auto-applied (LLM-extracted) (2026-06-13)

**Decision (v1.7.11 playtest follow-up):** asset effects that change a player's
resources as a result of a move's outcome — "take +1 momentum on a strong hit",
"suffer -1 supply", "mark progress on a hit", "choose one: +1 health or +1
momentum" — are applied automatically so the player never manipulates meters by
hand. The effects are read out of the free-text ability descriptions by a
single Haiku extraction pass (the Foundry asset model has no structured effect
data, and the phrasings are too compound/conditional for regex). Optional
("you may"), "choose one", and ambiguous-progress riders prompt first;
everything else applies silently. Full design: `issue #217 (Consequence Riders)`.

**Reason:** the maintainer's directive — "the user shouldn't have to manipulate
stats or resources." The module already auto-applied the unambiguous hooks
(pre-roll adds, stat substitution, post-roll improve); riders were the
remaining manual surface. ~146 of the 93 assets' ability blocks carry a rider
phrase, so manual application was a constant tax.

**Safety stance (load-bearing):** a wrong auto-apply silently corrupts game
state, which is worse than the manual status quo. Extraction is conservative
and every rider is validated (known resource, small integer amount, known
condition); on a missing key, parse failure, or transport error the pass yields
nothing and the ability text is surfaced as before — the module never applies a
guess. Writes are GM-gated (PERSIST-001); a `riders.autoApply` world setting
(default on) disables the feature.

**Rejected:**
- *Regex extraction* — the phrasings ("on a strong hit with a match", "you
  may", "choose one", compound "add +1 and take +1 momentum on a hit") are an
  NLP problem; regex would misparse and silently misapply. The user chose LLM
  extraction.
- *Auto-marking progress without a picker* — which track is genuinely
  ambiguous for most moves, so progress auto-marks only the single-track case
  and prompts otherwise (the user's choice).
- *A full per-asset rules engine for every effect (rerolls, ammo, roll-adds)* —
  out of scope; those stay surfaced or handled by the existing pre-roll
  scanner. The module assists; it isn't a complete automation engine.

**Update (issue #315):** the single-track auto-mark is for a mark that is the
outcome's own — an optional or "choose one" mark is offered, the lone track
preselected (S02); progress is signed marks (S03); only open tracks are
targets (S06); integrity goes through `changeIntegrity`, refused while
battered (S05); and the summary reports what landed — a refused write goes
to the GMs' payoff card with a Retry for that effect alone (S08). See
"Issue #315 audit".

---

### Combat lifecycle (audit 3.24–3.27) — 2026-06-16

**Decision:** Mirror the expedition lifecycle for combat. Enter the Fray
resolve-or-creates a combat progress track (rank LLM-inferred from narration,
defaulting to `dangerous`, re-rankable in the Progress Tracks panel). Strike
and Clash mark progress the correct number of times via the GM-gated pipeline
handler (`combatProgress: N` consequence → `applyCombatProgress`). Gain
Ground's "mark progress" dialog choice now emits a `combat-progress` call kind
that marks the active combat track. Explore a Waypoint's "gain expedition
progress OR +2 momentum" choice is now a real dialog picker (the
`expedition-progress` call kind). Combat position is written to the track after
every combat move. Take Decisive Action and Face Defeat close the track with
`endCombat: true`. ~~The "+1 on your next move" option in Gain Ground posts a
reminder card — not auto-applied, no campaignState field, player applies it.~~
*Superseded 2026-11-01 (issue #322 V02):* the pipeline rolls every move
itself and the confirm dialog has no adds input, so "player applies it" left
the +1 applied by nobody — see "The roller's +1 on the next move is applied
automatically".

**Reason:** the maintainer asked to "plan and execute" the combat progress +
in-dialogue momentum-vs-progress gap, with full lifecycle mirror and
LLM-inferred rank (matching the expedition rank pattern already shipped in
v1.7.14).

**Architecture:** `src/moves/combat.js` (new, mirrors `expedition.js`); new
exports `getActiveCombatTrack` + `setCombatTrackPosition` on
`progressTracks.js`; new call kinds `combat-progress`, `expedition-progress`,
`next-bonus` in `sufferDialog.js`; `combatRank` field added to interpreter
response schema alongside `expeditionRank`.

**`progressTrackId` path:** unchanged — still dead for combat (guards require a
non-null `progressTrackId` that no resolver ever sets). All new combat writes go
through the injected-deps orchestration module (testable without Foundry).
*(2026-10: removed — the path, `applyCombatPosition` and the
`progressTrackId` consequence field are deleted; see known-issues
AUDIT-DEAD-SURFACE. `consequences.combatPosition` stays — the pipeline reads
it.)*

---

### Develop Your Relationship bond legacy + Battle + audit reconciliation — 2026-06-17

**Develop Your Relationship (audit 3.14).** An un-bonded connection marks its
own relationship track ("no roll, mark progress", via `markRelationshipProgress`).
A *bonded* connection instead rolls +rank and pays the move's text — **strong
hit 2 bonds-legacy ticks, weak hit +2 momentum, miss nothing** — and a **strong
hit with a match raises the connection's rank by one** (play kit §3.3.5; revised
2026-11-01, issue #322 V01 — below). Orchestration is a pure module
`src/moves/developRelationship.js` (`selectConnection` + `planDevelopRelationship`,
mirroring `expedition.js`/`combat.js`); the resolver emits a `developRelationship`
consequence flag and the GM-gated pipeline handler resolves the target connection
and applies the writes.

- ~~**Weak-hit = 1 tick is a deliberate fill-in.**~~ *Superseded 2026-11-01
  (maintainer decision, issue #322 V01).* The fill-in rested on the play kit
  summary naming only the strong-hit value; the move's own text (the vendored
  system's `starforged-moves` data, and `!bond` since it was written) says
  "On a weak hit, take +2 momentum", and the rank raise is "on a strong hit
  with a match". The pipeline paid a weak hit 1 bonds tick while `!bond` paid
  +2 momentum. **Decision: both pay the text, from one table** —
  `BONDED_DEVELOP_OUTCOMES` / `bondedDevelopOutcome` in
  `developRelationship.js`: strong `{ ticks: 2 }`, weak `{ momentum: 2 }`, miss
  nothing, `raiseRank` on a strong hit with a match. The pipeline's weak-hit
  momentum is the roll's own (the resolver's `momentumChange`, credited to the
  roller with the move's meters, as every move's is); a Test Your Relationship
  hit develops through the plan with the test's roll, so its branch adds the
  plan's momentum to that move's consequences. `!bond` relays the roll's
  result (`outcome`, `isMatch`) and the canonical GM pays it from the table —
  the old effect-carrying payload and its clamp (which turned any tick count
  into 2) are gone. A weak hit cannot carry a match (a match is two equal
  challenge dice), so the weak-hit raise both paths coded was never reachable;
  the plan now says what the text says. *Rejected:* keeping 1 tick and changing
  `!bond` — a house rule the move's text contradicts.
- **Target resolution.** The connection is resolved from `interpretation.moveTarget`
  (the named connection) with the same exact→substring→sole-fallback ladder as
  expeditions/combat, except the fallback prefers the **sole bonded** connection,
  then the sole active one. Ambiguous (multiple, no match) → no-op; the move card
  still tells the player to develop a relationship.
- **The old `progressMarked: 1` on this move was a dead no-op** — persistence only
  marks when `progressTrackId` is set, which no resolver populates. Removed.
  *(2026-10: that persistence path is itself removed — see known-issues
  AUDIT-DEAD-SURFACE.)*
- **Update (issue #314 Q06):** the bonded roll is +rank in the pipeline too.
  `enrichBondedDevelop` (statEnrichment.js) resolves the connection before the
  dice and makes its rank the stat (`BOND_ROLL_ADDS`, shared with `!bond`),
  stamping the connection's id on the interpretation for the branch here.
  **Q04:** the rank raise's bond-Item mirror is keyed by the record's `_id`,
  as `markRelationshipProgress`'s ticks mirror always was.

**Battle (audit 3.29).** Battle resolves an entire fight in one roll, so every
outcome sets `endCombat: true` (closes any open combat track — a safe no-op when
none exists, since Battle is typically used *instead* of a move-by-move track).
Weak hit and miss set `routePayThePrice: true` (visible PtP card + suffer
dispatch, same as Face Defeat); strong hit keeps +2 momentum.

**"Battle Stations!" is a real rulebook section, but not a move (corrected
2026-06-18).** An earlier pass struck it as a "phantom" — that was wrong, and the
strike is reversed. Battle Stations! is a named section of Chapter 3 "Gameplay in
Depth" (rulebook pp. 184–187): a framework for running shipboard/starship combat
with a crew. It is *not* a move — no roll, no stat, no strong/weak/miss outcome —
so it correctly has no `schemas.js` entry. Mechanically it resolves through the
existing combat moves (Gain Ground, Strike, React Under Fire, Clash, Aid Your
Ally) plus suffer/recover moves, with **position tracked per character** and **Aid
Your Ally transferring control** between crew (see the p. 187 worked example:
pilot + gunner each hold their own position — until 2026-11-01 the module kept
one position per fight for every roller; see "Combat position is per character",
issue #322 V03). The rulebook is explicit that "there
are no strict shipboard combat roles," but offers 11 example crew tasks: Command,
Countermeasures, Damage Control, Engineering, Escort, Gunnery, Infantry, Medical,
Piloting, Sensors, Systems. The original `rulebook-summary.md` bullet ("open the
fight, set position") *was* a mis-extraction — but the fix is to describe Battle
Stations! correctly, not delete it. The module now surfaces the 11 roles to the
narrator (a conditional shipboard-combat guidance block, gated on an active combat
track + a command vehicle) and to players (`!stations` command + a help page). A
richer ship-map "battle stations" mini-game is planned —
see `issue #216 (Shipboard Combat (Battle Stations!))`.

**Ship-map deck-plan Scene (Battle Stations! mini-game Phase A, 2026-06-18).**
The first slice of the mini-game ships: a Foundry Scene that is a deck plan of the
command vehicle, pinned with three kinds of "deck feature" — the 11 combat
**stations**, the **galley** (crew mess/common area), and the ship's installed
**modules** (the `asset`/Module Items actually on the starship Actor — Medbay,
Heavy Cannons, …) so the map reflects the real vessel.
`src/moves/shipMapScene.js` mirrors `src/sectors/sceneBuilder.js` (same scene
dimensions, the PLAYTEST-1712 A scene-rect inset, independent Note/Drawing
try/catch, no auto-activation). Decisions:
- **Galley + modules are deck features, not stations.** The galley and modules
  are NOT in `SHIPBOARD_ROLES` (which must stay the rulebook's 11 combat tasks).
  A unified deck-feature model (`buildDeckFeatures`: stations + amenities +
  modules) shares the same placement/vision logic; each pin carries
  `deckFeatureKind` (`station|amenity|module`) and stations additionally keep
  the back-compat `shipStationNote`/`stationId` flags. Modules are placed at a
  per-slug deck hint near their related station (Medbay by Medical, etc.), with
  a fallback "module bay" band for custom/over-many modules. Module slug is
  derived from the Item name (`"Heavy Cannons"` → `heavy_cannons`).
- **Fixed layout is the spine; vision placement is layered on top.** `STATION_LAYOUT`
  gives every station deterministic grid coordinates so pins are always placeable.
  When deck-plan art is generated, a vision pass (`src/moves/shipMapVision.js`,
  Claude vision via `api-proxy.js`) returns normalized per-station coordinates and
  the pins move onto the compartments the art drew. The vision result must pass
  `validateVisionCoords` (all 11 present, in range, not collapsed); on any miss —
  no key, bad JSON, degenerate layout, call failure — placement falls back to the
  fixed layout per station. The fixed layout is never discarded. This resolves the
  scope doc's "pinning onto AI geometry" open question by treating vision as an
  enhancement over a guaranteed baseline, not a replacement.
- **Art + schematic fallback.** Deck-plan art (`src/moves/shipMapArt.js`, OpenRouter)
  is the backdrop when `shipMapArtEnabled` + a key; otherwise `createShipMapScene`
  draws a schematic hull-outline Drawing so the bare Scene still reads as a ship.
- **Three gated settings.** `shipMapEnabled` (master), `shipMapArtEnabled` (art
  vs schematic, default on), `shipMapVisionEnabled` (vision placement vs fixed,
  default on). The manual `!shipmap` command works regardless of the master gate
  — it is the explicit opt-in.
  - **`shipMapEnabled` default flipped OFF → ON (2026-06-21).** It originally
    shipped OFF so the fast quickstart loop was never slowed, but a v1.7.17
    playtester ran the quickstart and was surprised there was no ship-map Scene
    — the feature was invisible to anyone who didn't go hunting in settings. The
    deck-plan is now part of the default new-command-vehicle experience (with AI
    art on via `shipMapArtEnabled`'s existing default). Players who want the
    leaner loop can still turn it off. The generation is idempotent and runs off
    the `seedStarshipActor` convergence point, so the cost is one Scene build at
    ship creation, not on every session.
- **Auto-generation hooks `seedStarshipActor`**, the single convergence point for
  command-vehicle creation (quickstart, ✦ Finalise, sidebar auto-seed). Gated to
  the command vehicle, idempotent (skips when a deck-plan Scene already exists).
- Phases B–D (man-the-stations token placement, station-aware move suggestions,
  lifecycle integration) remain planned — see the scope doc.

**Audit reconciliation.** `rulebook-coverage-audit.md` was written 2026-05-29 and
overtaken within hours (P1–P20 closed the same night by `03070a4` + `943265e`),
then further by weeks of feature work, without the matrix being updated. The
matrix, summaries, and priority list have now been reconciled against the tree.
Verified-closed rows were flipped to PINNED/DONE with batch/file evidence;
genuinely-open rows kept their GAP/PARTIAL status. Two commit-message closure
claims did **not** hold against the tree and are flagged: 3.11/3.12 (Fulfill /
Forsake Your Vow are not in `moveOutcomeMatrix`) and P13 recover moves (no batch).

---

## v1.7.16 — Combat pacing, Pay-the-Price clocks, and progress-track surfacing

**Active combat forces moves (playtest finding).** A player could end a fight by
asserting an outcome against nameless NPCs as narration ("I gun them down"); the
pacing classifier let it through as NARRATIVE and the narrator confirmed it, so
combat resolved with no dice. Decision: when an open combat track exists, the
player's words are a *suggested outcome*, not an established fact. The pacing
router detects active combat and the classifier applies a "COMBAT IS ACTIVE"
rule — any character action in any category is a MOVE; outcomes against
adversaries are never free narration. Only pure observation / internal monologue
/ questions stay NARRATIVE. A router backstop converts NWMA→MOVE during combat.
Detection fails open to "no combat" so a storage hiccup never blocks narration.

**Pay the Price advances countdown clocks (#10).** The clock contract
(`clocks.js` header; `issue #203 (Clocks)`) always said tension clocks
advance when you Pay the Price — but the wiring was never built, and the
inciting incident's "Dani's captivity" clock lives on the *vow item*
(`system.hasClock/clockTicks/clockMax`), a second clock model nothing advanced
either. Decision: on a Pay the Price (miss → routePayThePrice / Face Defeat, and
`!ptp`), advance BOTH — every active `campaignState` tension clock AND each PC's
active vow-item countdown clock — by one segment, GM-gated, with a summary card.
Campaign clocks are untouched (they advance at Begin a Session). In the common
single-clock game this advances exactly the inciting captivity clock. Advancing
*all* active countdown clocks (rather than one "relevant" clock) is the
deliberate v1 behaviour, matching the documented "tension clocks advance on Pay
the Price" contract and the user's automation preference; per-clock relevance is
a possible future refinement.

**Portrait moderation (#3).** Entity portrait prompts carry the narrator scene
prose, which for a kidnapping/raid scene tripped the image provider's Violence
filter. Decision: expand the policy sanitiser (captivity/raider/violence terms)
and add a moderation-detect-and-retry that falls back to a neutral, card-only
portrait prompt (style + gender/role, no scene description). The narration stays
authoritative; the portrait just succeeds instead of failing.

**ASSEMBLER-002 flag-location follow-up (#9).** The "resolved" progress-tracks
context section was still always empty: it read page-level flags while
`progressTracks.js` writes a document-level flag. Fixed to read
`journal.getFlag` (document-level); the masking unit test was corrected in
lockstep. This is why the narrator could mention a combat track it had no
context for. The combat-track chat card also now carries an "Open Progress
Tracks" button so the fight's progress is one click away.

---

## Dice So Nice integration is display-only; the resolver stays pure

**Decision:** 3D dice animations are produced by a thin Foundry-only bridge,
`src/dice/diceAnimation.js`, that builds an *already-evaluated* Foundry `Roll`
carrying the values the resolver/roller already produced, then hands it to
`game.dice3d.showForRoll`. The pure dice logic in `src/moves/resolver.js`
(`rollDie`/`rollActionDie`/`rollChallengeDice`) and `src/oracles/roller.js`
(`rollOracle`/`rollYesNo`, `rollD100`) is left untouched — it still rolls with
`Math.random()` and creates no Foundry objects. The bridge is wired at the
display seams (move-result card, `!bond`, Ask the Oracle, Pay the Price, the
decisive-action cost card, custom-oracle rolls) as fire-and-forget (`void`), and
fails open: when Dice So Nice is absent or the Foundry dice classes aren't where
expected, every entry point returns false without throwing.

**Reason:** Players reported that none of the module's rolls triggered Dice So
Nice. The cause: Dice So Nice only animates dice that pass through Foundry's dice
pipeline (a `Roll` shown via `game.dice3d`, or a `ChatMessage` carrying `rolls`),
and the module created neither — every die came from `Math.random()`. The
resolver and roller are deliberately pure, synchronous, Foundry-free, and the
foundation of ~2500 unit tests (their file headers state this). Threading real
`await new Roll().evaluate()` calls through them would make them async and
Foundry-coupled, breaking that contract for a purely cosmetic feature. Feeding
the predetermined results into a synthetic evaluated `Roll` keeps the logic pure
**and** guarantees the animated dice match the numbers printed on the card.

**Rejected:**
- *Replace `Math.random()` with real Foundry `Roll`s in the resolver/roller* —
  rejected; makes the pure logic async + Foundry-dependent, breaks the
  unit-test contract, and is a large invasive refactor for a cosmetic gain.
- *Let Dice So Nice roll its own (fresh, random) dice for the animation* —
  rejected; the tumbling dice would land on different numbers than the result
  card, which is worse than no animation.
- *Gate behind a Companion setting* — rejected (for now); Dice So Nice is itself
  opt-in, so "animate when it's installed, no-op when it isn't" matches how game
  systems integrate it and needs no setting to discover.

---

## Placeholder figures are renamed in place; genuinely-named entities are never auto-merged

**Decision:** When the entity detector sees a narration that reveals a proper
name for a figure already recorded under a placeholder name ("Unknown Suited
Figure" → "Vex"), it emits a `renames: [{ from, to }]` entry instead of a new
entity, and `applyEntityRenames` (in `src/entities/entityExtractor.js`) renames
the existing connection in place. The detection prompt is given a "PLACEHOLDER
FIGURES" list (`collectPlaceholderConnectionNames`) so the model knows which
established entities may be named later. The rename is **bounded to placeholder
connections** — `isPlaceholderName` must be true for the `from` record, the
target name must not already belong to another entity, and the whole path is
GM-gated. A renamed figure is also defensively stripped from the `entities`
array in `parseDetectionResponse` so it can never be both renamed and recreated
— only when the rename's `from` names a recorded placeholder connection
(`findPlaceholderConnection`, shared with `applyEntityRenames`); any other
rename is skipped, so its newly named figure is drafted as a new entity (issue
#321 U27 — it was dropped, and the NPC vanished).
A GM-visible "Identity revealed" card records the link.

**Reason:** Detection dedups by name only (the prompt's ESTABLISHED ENTITIES
list + `entityExistsAnyType`). A newly-revealed name matches nothing on those
lists, so an introduced-then-named figure produced a *second* connection card —
the playtest "Vex" duplicate, where the suited figure the crew met became a
separate "Vex" connection with a re-rolled role and a different portrait. Only
the detection model, which sees the dialogue, can connect "Vex" to "the suited
figure", so the reconciliation has to be model-driven via a dedicated `renames`
output rather than a code-side string heuristic.

**Rejected:**
- *Auto-merge any detected rename, including of properly-named entities* —
  rejected; a model hiccup would silently collapse two distinct characters,
  which is hard to undo. The placeholder bound keeps the blast radius to
  figures that were never properly named in the first place; a missed rename
  just falls back to the old "treat as new" behaviour, which the GM can dismiss.
- *Surface every potential rename as a GM confirm dialog* — rejected for the
  placeholder case; it reintroduces the confirm-ceremony the maintainer called
  out as friction (see the lore-confirmation discussion). The placeholder bound
  makes auto-apply safe enough, and the "Identity revealed" card keeps it
  visible. (Renames of genuinely-named entities are simply not attempted — if
  that case ever needs handling, a confirm affordance is the place to add it.)
- *Stop auto-creating a connection for an unnamed figure in the first place* —
  rejected as the fix here; unnamed figures still deserve a card so they can be
  referenced and developed. Renaming in place preserves that card (and its
  accumulated notes/portrait) across the naming.

---

## Suffer choices are a non-blocking chat card, not a blocking dialog

**Decision:** A move outcome that requires the player to choose a cost (a
`sufferPrompt` — "make a suffer move (-1)", "lose −1 health OR lose momentum
−2", etc.) is surfaced as a **non-blocking chat card with buttons**
(`src/moves/sufferCard.js`), not the modal `SufferChoiceDialog`. The move
pipeline posts the card and continues; the move-concurrency lock
(`pendingMove`) is released normally. The player taps a button to apply the
choice, which runs the same `resolveSufferSelection` + `runSufferResolution`
path and the same `requires`-filtering the dialog used — so meters stay exactly
as correct; nothing is auto-applied or guessed. The pick is applied on the
canonical GM (`suffer.pick`), once per card (issue #302: the clicker's client
applied it, so two taps applied two costs, and a player could not mark the
GM's card resolved).

**Reason:** The dialog was `await`ed *inside* the move lock (in
`persistResolution`). The v1.7.16 settle-on-close fix only helps if the dialog
actually renders — in a playtest it failed to render amid other errors, the
`await` never settled, and `pendingMove` stayed `true`, so every later move
reported "a move is already being resolved." Taking the interactive step out of
the locked section removes the entire failure class: a chat card always renders
(it's just chat HTML) and, even if a player ignores it, nothing can hang the
pipeline. This reverses the F16 scope decision ("Q1: blocking … No auto-timeout
default") — that decision optimised for "never apply a silent default," which
this design also satisfies (the player still chooses), while fixing the
lock-up the blocking approach caused.

**Rejected:**
- *Auto-apply a default and drop the choice entirely* — rejected; tracing every
  `sufferPrompt` showed blind auto-pick would double-apply meters (Secure an
  Advantage weak hit bakes +2 momentum *and* lists it as option 0 → +4),
  ignore `requires` gates ("+1 health if not wounded" applied while wounded),
  and default Face Death to "noble sacrifice (PC dies)". A wrong silent meter
  change is worse than a tap.
- *Keep the dialog but release the lock before opening it* — rejected; the
  pipeline writes `campaignState` *after* the suffer step, so releasing earlier
  reintroduces the write race the lock exists to prevent. Moving the choice
  out of the critical path entirely (the card) is cleaner.
- *Keep the dialog, just open it non-blocking* — rejected; a modal that fails to
  render still leaves the player with no way to resolve the cost. A chat card is
  strictly more robust.

The `SufferChoiceDialog` code (`promptSufferChoice` in `sufferDialog.js`)
remained exported and unit-tested but unused. **Update (2026-07-07, test-suite
review):** the dialog entry point and its whole rendering layer (dialog class,
meter preview, pickers) are deleted — the card flow is the only path. The
pure resolution helpers (`resolveSufferSelection`, `runSufferResolution`,
`isOptionAvailable`) live on; they are what the card flow executes.

## A burn spends the momentum from before the move (2026-11-01)

*Update (issue #354 P2-10, 2026-11):* in free-flow play a result that offers a burn is now held — its price is not paid until the roller keeps the result — so a burn there finds no price to add back; this entry's arithmetic is unchanged and still applies to a Batch Mode round's entries and with "Ask before paying and narrating" off.

**Decision (maintainer, issue #322 V04):** Burn Momentum is offered, previewed
and applied at the momentum the PC held **before the move's effects** — the
rule quoted at the top of `burnMomentum.js`: "You must burn momentum before
applying any other effects of the move." `buildBurnState` runs after a miss's
Pay the Price has landed and before the persist, so it burns the actor's value
plus what the price took (its momentum receipts), and records
`outcomeMomentum` — the outcome's momentum change as it will land, clamped to
the bounds. The click (`handleBurnClick`) burns the live value less
`outcomeMomentum` (a card from before this records none: the outcome's
nominal change), plus what the price took (`burnableMomentum`). Momentum
changed by anything else since — another move, a sheet edit — still counts.
The burn's write is unchanged: momentum goes to the reset plus the upgraded
outcome's change. *(Since issue #345 AA46 "what the price took" includes the
momentum its unprepared mark's clamp held down — `momentumClamped` on the
supply receipt — and the burnable momentum is capped at the maximum from
before that mark.)*

**Reason:** BURN-COUNTS-OUTCOME-MOMENTUM — the burn compared the live value,
after the outcome: at momentum 5 against 3 and 5 a weak hit's +1 made the
card offer "6 → Strong Hit", spending momentum the move itself gave to
replace that very result.

**Rejected:** *keep the post-outcome value as a house rule* — the rule is
explicit, and `tests/unit/burnMomentum.test.js` pinned the deviation.

## Burn Momentum reverses Pay-the-Price side effects (2026-06-22)

**Decision:** Clicking 🔥 Burn Momentum on a move that resolved as a miss now
reverses the Pay-the-Price side effects the miss triggered — not just the meter
fields on the move card. Specifically: clocks advanced by
`advanceClocksOnPayThePrice` (tension clocks + vow countdown clocks) are
decremented by one segment, and a simple PC-meter loss from the PtP table's
suffer route (Endure Harm / Endure Stress / Sacrifice Resources / Lose
Momentum) is refunded. `postFaceDefeatPayThePriceCard` returns
`{ clocksAdvanced, sufferMeterDelta }`; `buildBurnState` stashes it as
`burn.ptpReversals`; `handleBurnClick` calls `revertPtpEffects` after the
meter-delta reapply. New helpers: `revertTensionClocksForBurn` (clocks.js),
`revertVowClocksForBurn` (actorBridge.js).

**Reason:** Playtest: "burning momentum did not wind back the clock that ticked
on the miss, nor did it refund the meter lost." A burn upgrades the outcome to a
hit, so the price was never actually paid — leaving the clock advanced and the
meter docked double-charges the player for an outcome that didn't happen.

**Rejected:** Reversing `withstand_damage` / `companion_takes_a_hit` routes —
those touch vehicle/companion stats and at-zero escalations (vehicle-damage
d100, companion destruction) that are not cleanly invertible. Consistent with
the pre-existing policy of not rolling back auto-debility flips on burn; if a
playtest shows it matters we extend.

**Update (issue #311 P04, P05):** the refund is what the route landed — the
move the dispatcher ran and the meter's before / after — not the table's
annotation, and the reversal (`revertPayThePrice`, `src/moves/resultUpgrade.js`)
is shared with Improve Result. A burn refunds no momentum: its reset
replaces it.

**Update (issue #314 Q02, Q03, Q05):** the receipt is a list
(`sufferMeterDeltas`) — every route a "Roll twice" landed, and a harm's
overflow into momentum as a receipt of its own (an improvement refunds it,
a burn's reset replaces it); the refunds are one write per PC. A vow-clock
rewind that lands in part leaves only the refused Items for the GMs' Retry.

## Reach a Milestone marks the vow; result cards suggest it (2026-06-22)

**Decision:** Reach a Milestone (a no-roll quest move) now actually marks
progress on the target vow per its rank. The resolver sets
`consequences.reachMilestone: true` (replacing the dead `progressMarked: 1`,
which never fired because persistence only marks when `progressTrackId` is set
and no resolver populates that for embedded vow Items — *2026-10: that
persistence path is removed, see known-issues AUDIT-DEAD-SURFACE*). A GM-gated pipeline
handler runs `planReachMilestone` (`src/moves/milestone.js`): the sole open vow
is auto-marked; when several are open and none is named, a picker card is
posted. Additionally, successful quest-advancing moves (adventure / exploration
categories, on a strong or weak hit, when the PC has an open vow) carry a
one-click "⚑ Reach a Milestone" suggestion button on the result card — clicking
marks vow progress without retyping the move, via the same path.

**Reason:** Playtest: "successes are not granting progress on this Vow, even
though misses are advancing the clock." The vow-progress half of the loop was a
no-op. Mirrors the `develop_your_relationship` fix (audit 3.14), which removed
the same dead `progressMarked` path in favour of a typed flag + GM-gated
handler.

**Rejected:**
- *Showing the suggestion on every hit* — too noisy; gated to adventure /
  exploration categories (the moves you make in pursuit of a quest) and
  excludes combat / suffer / connection / fate / session / recovery. The player
  is the fictional judge — the button is optional, never auto-applied.
- *Re-entering the pipeline via `forcedMoveId` for the suggestion button* (the
  Take Decisive Action pattern) — rejected; Reach a Milestone is a no-roll
  move, so re-entry would roll spurious dice and open a confirm dialog. The
  button marks directly via the shared `planReachMilestone` logic instead.

## World lore auto-confirms; entity-specific lore routes to entity tier (2026-06-22)

**Decision (C): Narrator-detected lore is auto-confirmed** — `routeWorldJournalResults` now
writes `confirmed: true` for every lore entry that clears the salience gate, and
`archiveSceneTruth` (scene-end migration) does the same. Lore no longer sits in the
"Pending Lore" queue waiting for GM approval; it immediately joins `getConfirmedLore()`
and feeds the narrator context on the next call. The audit trail remains: each entry
carries `narratorAsserted: true`, `promotedAt: <timestamp>`, and the `sessionId` of
when it was confirmed, so the history is reconstructable from the journal flags.

**Decision (D): Entity-specific lore bypasses the WJ lore journal** — when the
detector sets `entityName` to a known entity's name, `routeWorldJournalResults` routes
the lore to that entity's generative tier (`appendMigratedTruthToTier`) instead of
`recordLoreDiscovery`. If the named entity doesn't have a record yet, the lore falls
back to the WJ journal. This keeps per-character detail (posture, speech habits, scars)
on the entity card rather than polluting the world-level canon list.

The detection prompt now includes `"entityName": string|null` in the lore schema and
an `entityName rules` block explaining when to set it.

**Reason:** The pending-lore queue was a friction point: lore the narrator stated
plainly sat unconfirmed until the GM actively clicked "Confirm" in the WJ panel —
often never, because there was no in-session reminder. Since narrator-detected lore
clears the salience gate (≥ significant), it has already been reviewed by the salience
model and is worth keeping; GM review of routine campaign facts was pure overhead.

Entity-specific lore in the WJ lore list confused the world-canon record with
per-character notes. "Maren speaks in clipped tones" is not a world truth — it belongs
on Maren's entity card, where the narrator can find it in her generative tier.

**Rejected:**
- *Keep the confirm gate but add an auto-confirm setting* — adds a settings surface for
  a problem whose solution (auto-confirm) is clearly better than the default (never
  confirmed). Simpler to just do it.
- *Route all lore to entity tier when an entity name appears anywhere in the title/text*
  — title-scanning is fragile (a faction name can appear in a world-lore fact without
  the fact being about that faction). The explicit `entityName` field from the detector
  is the reliable signal.

## Multiplayer spotlight is implied by narration, not mechanically enforced (2026-06-26)

**Decision:** Fair spotlight distribution in multiplayer GM-less play is handled by a
**narrator-driven rotating spotlight** ([#232](https://github.com/jamesrmedford-alt/starforged-companion/issues/232)),
not by any mechanical turn-order, input lock, or submit gate. When an eligible beat
(`move_resolution`, `paced_narrative`) ends by inviting action, the narrator addresses
its prompting question to a specific PC, and a per-scene round-robin pointer
(`campaignState.spotlight = { lastActorId, sceneId }`) rotates which PC that is from
beat to beat. The rotation is computed deterministically in code
(`src/narration/spotlight.js`, pure) and advanced inside the `buildNarratorExtras`
funnel; the GM client persists the pointer (mirroring the rolling-summary write).

The nudge is a **suggestion only**, enforced nowhere:
- Any player may act or speak at any time, prompted or not — no lock, no queue, no gate.
- If the fiction clearly centres a different character, the narrator follows the fiction.
- Rotation candidates are the PCs the scene frame (`sceneFrame.present`) says are present;
  absent PCs are skipped. Rotation applies only when ≥2 PCs are in the scene.
- The GM is a full player in the rotation — `isGM` is not a reason to skip a PC
  (consistent with the multiplayer-coordination stance).
- The pointer resets on every scene change (cleared in `startScene`/`endScene`, and the
  read is guarded by `sceneId` so a stale pointer never carries across scenes).

**Reason:** In a 3-player playtest, unstructured input led to players talking over each
other to the narrator while the `pendingMove` lock serialised them invisibly. Full
initiative-style enforcement would kill the conversational flow that makes GM-less
Ironsworn work, and Starforged is explicitly not round-based outside combat. A social
nudge implied entirely through narration keeps the spotlight moving toward quieter
players without taking agency away from anyone.

**Rejected:**
- *Hard turn enforcement / initiative order / submit gating / "raise hand" queues* —
  out of scope by design; they impose structure the system deliberately avoids.
- *Let the narrator track the rotation itself from prose* — non-deterministic and
  unauditable; a code-owned pointer round-robins correctly and survives a mid-scene
  rename (it keys on actor id, not name).
- *No setting* — a GM whose table dislikes being called on by name needs an off switch;
  added as `narratorSpotlightRotation` (world, default on — *off since issue #354 P2-07, with a one-time switch-off of a stored "on"*), surfaced under Narrator
  settings.

*Update (2026-11, issue #340):* this holds for free-flow play. Batch Mode is an
opt-in round structure a table chooses (off by default) — see "Batch Mode:
opt-in rounds, read in the player's window, narrated once" — and its
`round_resolution` narration is not a spotlight mode.

---

## Vow ↔ combat ↔ bond stakes & rewards: surface the interlock, scale by difficulty (2026-06-29)

**Decision:** Scope [#241](https://github.com/jamesrmedford-alt/starforged-companion/issues/241)
(PLANNED). A vow that leads into a fight is tied together explicitly, with stakes + concrete rewards
stated **up front** at the three creation moments (Swear a Vow, Enter the Fray, Forge a Bond) and the
fight's outcome surfaced against the vow on a win. Specifics:
- **Combat track ≠ vow track (the rules finding).** In Starforged the two are deliberately separate; a
  move marks only one. The bridge is the **milestone**: winning a fight that achieves the vow's
  objective *is* a vow milestone. The **per-mark** amount is fixed by the *vow's* rank (troublesome +3
  boxes … epic +1 tick); fulfilment still needs a Fulfill Your Vow roll. This is why a playtest fight
  felt disconnected — nothing surfaced the milestone link. Builds on "Reach a Milestone marks the vow"
  (above).
- **"Scale by combat difficulty" = number of marks, not ticks-per-mark.** A won linked fight marks the
  vow **N times** where N derives from the *combat's* rank (troublesome/dangerous 1, formidable/extreme
  2, epic 3; weak-hit win N−1, min 1). Net jump scales by both the fight (mark count) and the vow
  (ticks/mark) — the rules-legal "mark 2–3× for a major milestone" lever. Numbers tunable.
- **Combat is offered, not forced.** An Enter-the-Fray-vs-way-out threshold card; the narrator suggests
  the combat rank (adjustable); the fight is explicitly linked to a vow + objective there; the track is
  created only on Enter the Fray.
- **On a won linked fight:** a one-click Mark milestone / Attempt to Fulfill the linked vow — no
  auto-mark, so the milestone judgement and the Fulfill roll stay with the player.
- **Concrete promised rewards:** the narrator offers two, or the player writes their own and the narrator
  maps it to a form (asset / gear / supply / momentum / contact / knowledge); granted on success, scaled
  by outcome (strong = full / weak = with a string / miss = lost). These three (form, how-offered,
  outcome-scaling) are **defaulted pending revisit** — the planning question tool errored during design.
- **Vow → connection deepening (same logic generalised).** Fulfilling a vow undertaken *for* a connection
  deepens that connection — a milestone on its relationship track — surfaced as a one-click "Deepen your
  bond with [Connection]" on the Fulfill Your Vow card (not auto-marked, mirroring the won-fight prompt).
  The link is auto-populated from the vow's target NPC at swear time (`swearVow.js:143` already creates
  that connection) and is adjustable. Scaling mirrors combat→vow — the **source** challenge's rank sets the
  mark count, the **target** track's rank sets ticks/mark: combat→vow = (fight rank → marks, vow rank →
  ticks); vow→connection = (vow rank → marks, connection rank → ticks). Rounds the scope into a trio:
  combat→vow, vow→connection, and the existing forge→Bonds-legacy.

**Reason:** Playtest — a rescue vow led into combat with "no clear goals or tie-in to the vow"; the fight
should have wildly advanced or fulfilled the vow. An interplay audit found the mechanics largely already
exist; the gap is **legibility**, not missing rules. Verified already-implemented and *not* rebuilt by
this scope: burn-momentum (`burnMomentum.js`/`improveResult.js`), legacy→XP→assets (`persistResolution.js`,
2 XP/box, 1 after clear), matched dice (`resolver.calcOutcome` `isMatch`), the suffer system
(Endure Harm/Stress, Face Death/Desolation, Pay the Price, out-of-supply), combat position → Take Decisive
Action downgrade, and debilities → momentum max/reset. They fire silently, so the scope surfaces the
vow↔combat seam in-the-moment and adds a help page explaining the whole web, rather than re-implementing
mechanics.

**Rejected:**
- *Ticks-per-mark scales with combat rank* — breaks the core "vow rank sets progress" rule and trivialises
  epic vows; scale the **mark count** instead.
- *Auto-mark the milestone / auto-fulfil on a win* — removes the milestone judgement and the Fulfill roll;
  use a one-click prompt.
- *Auto-detect which vow a fight serves* — ambiguous; the player links it explicitly at Enter the Fray.
- *Force combat when the fiction presents a fight* — Starforged combat is always a choice; always offer a
  way out.
- *Auto-deepen the connection on a vow's fulfilment* — same reasoning as auto-marking the vow; use a
  one-click "Deepen your bond" prompt so the deepening stays a player choice.

*(Issue #326 D1, 2026-11-03: as built, the won-fight card's 🤝 Deepen and the fulfilment's payoff each
deepened the connection by the vow's marks. Decided: one deepen per vow — whichever lands first pays,
recorded on the vow's payoff ledger. See "Issue #326 audit" → "A vow deepens its connection once".)*

---

## Multiplayer attribution: roll effects credit the roller; the inciting vow is shared (2026-06-29)

**Decision:** Two multiplayer playtest fixes (ship under v1.7.29):

1. **Roll effects go to the rolling player's actor, not a GM-local default.** The move pipeline runs
   GM-gated on the canonical GM's client, applying meters/progress on behalf of every player.
   `persistResolution` and the move card's `burnActor` previously fell back to `getPlayerActors()[0]`
   — the GM's own PC — so a non-GM's momentum / health / spirit / supply / debility / progress landed
   on the GM. The resolved `speakerActorId` (from `resolveSpeakerActorId`) is now threaded into
   `persistResolution` and used for the card's burn/improve/milestone actor. The fallbacks
   (`activeCharacterId`, then `getPlayerActors()[0]`) apply only when no speaker is resolved (solo-GM).
   *(2026-10: the `activeCharacterId` fallback is removed — `campaignState.activeCharacterId` was
   never written, so it was really `getActor(null)`, the GM's own bound PC; with no speaker,
   `persistResolution` now uses the first PC. The same audit extended roller credit to the ability
   scan, Reach a Milestone, the won-fight vow mark and reward, `!ptp` harm and `!bond` momentum —
   known-issues CREDIT-ROLLER-SWEEP, RENARRATE-ATTRIBUTION, FULFIL-REWARD-FIRST-PC.)*
   *(Issue #321 U23: one resolver answers "whose PC is this user?" — `resolveUserActorId`
   (`src/multiplayer/speaker.js`): `User.character` when it is a PC, else the first PC the user
   owns, else the campaign's first PC only for a GM or in solo play. A new connection's bond Item
   goes on the roller's PC (Make a Connection) or the PC a draft card carries (`actorId`, stamped
   by every detection path that knows its narration's PC); the shared vow's target becomes a
   connection of every PC who swore it; the oath scene is written for the PC who swore; the
   Private Channel and the toolbar's Chronicle use the user's own PC.)*
   *(Issue #326 D8, 2026-11-03: the move pipeline's own fallback follows U23 too. A GM's
   narration, or any narration at a one-PC table, still rolls the first PC; a player with no PC
   of their own at a table of several is whispered that they need a character, and nothing is
   rolled — the pipeline rolled them as the first PC, landing the move's effects on another
   player's character. See "Issue #326 audit" → "A PC-less player is not rolled as another
   player's character".)*

2. **The inciting vow is the crew's shared founding vow.** "⚔ Swear this vow" now creates the vow on
   **every** player character (each copy tagged `flags[MODULE].sharedVow` + the inciting message id),
   and an `updateItem` hook (`registerSharedVowSyncHook`, canonical-GM single-writer; since issue
   #322 V32 a per-vow queue of the newest value per field and marked mirror writes, as the shared
   supply's — the vowId-keyed re-entrancy guard dropped a change made mid-pass) keeps
   `system.current` / `system.clockTicks` in lockstep across all copies — so
   marking or fulfilling it (the module's vow flow OR a native sheet edit) advances it for the whole
   crew. Any player can click it; non-canonical clients relay to the GM over the module socket
   (`kind: "vow.swearShared"`), who performs the privileged multi-actor writes.

**Reason:** Playtest — the GM "gained the momentum regardless of which player earned it", and the
inciting vow only landed for the clicker. Both are multiplayer-attribution defects from GM-local
fallbacks: the pipeline knew the speaker but didn't use it for persistence, and the vow flow targeted a
single actor. Vows display only on the per-actor character sheet (the Progress Tracks panel excludes
them), so a *shared* vow needs a copy on every sheet plus a sync mechanism — the `updateItem` hook
covers every progress path with one writer.

**Rejected:**
- *Per-PC vow copies with no sync (Option A)* — copies drift; "shared" must mean lockstep, which is
  what the user asked for.
- *One world-scoped vow track shown only in the Progress panel* — vows live on the character sheet;
  players expect the founding vow there, so copies are required for visibility.
- *Fan out progress only through the module's own vow flows* — would miss a native sheet edit; the
  `updateItem` hook catches every change regardless of origin.
- *Let any client write the sync* — multi-writer races + permission failures; gate to the canonical GM.

---

## Crew-shared supply track in multiplayer (2026-06-29)

**Decision:** In co-op / guided play the whole crew shares ONE supply track (the
Starforged rule); health, spirit, and momentum stay per-character. Supply is stored
per-actor (`system.supply.value`), so an `updateActor` hook
(`src/multiplayer/sharedSupply.js`, `registerSharedSupplyHook`) keeps every player
character's supply in lockstep: when one changes — from a move, a suffer outcome,
Resupply, or a manual sheet edit — the canonical GM writes the new value to the
others. Single-writer via `isCanonicalGM`; a re-entrancy flag stops the
sibling-writes from cascading. Always on (no setting); solo play is a natural no-op
(no sibling PCs). Mirrors the shared-vow updateItem sync.

**Reason:** The rulebook specifies a shared supply track for multiplayer; the module
stored it per-actor, so crews drifted out of sync. A reactive `updateActor` hook
catches every supply change regardless of source (the move pipeline, suffer
executors, or a hand-edit on the sheet) and reconciles in one place — the same shape
as the shared-vow sync. Syncing per-actor values, rather than relocating supply to a
single `campaignState` field, keeps the character sheets and every existing supply
read/write working unchanged.

**Rejected:**
- *Relocate supply to one `campaignState` field* — would rewire every supply
  read/write and the sheet display; the per-actor sync is far less invasive.
- *A toggle / opt-in* — the maintainer chose always-on; solo is a no-op anyway, and
  a table wanting per-PC supply is a non-RAW variant that can be added later if asked.
- *Sync only the module's own writes* — would miss a manual sheet edit; the
  `updateActor` hook catches every change.
- *Let any client write the sync* — multi-writer races + permission failures; gate to
  the canonical GM.

**Update (issue #315 S07):** the impact that comes with a shared 0 is the
crew's too — "you mark unprepared together". `supplyAllies` is the one
definition of who shares a PC's supply (the sync reads it), and
`markUnprepared` (sufferExecutor.js), the zero-supply impact's one writer,
marks them with the PC who paid. The sync still mirrors the number alone; a
supply raised on a sheet clears no impact.
