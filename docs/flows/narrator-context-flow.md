# Narrator context flow — as implemented

Where every byte of narrator context comes from, how narrator output becomes
memory, and what defends against contradictions — verified against source
(v1.7.30 cycle; where narration runs, the X-Card gate, Private Lines and the
stale-snapshot persists updated for the 2026-10 audit; the X-Card's removal of
a narration, the live safety read, sidecar fences, retraction subjects and the
stale-snapshot writers updated for issue #321). Companion to
`docs/narrator/narrator-memory-architecture.md` (the design reference); this
doc records what the code does **today**.
Sibling docs: `combat-flow.md`, `vow-flow.md`, `connection-flow.md`,
`exploration-flow.md`.

The 2026-07 audit of this flow surfaced nine verified defects and a
design-level exposure list; **all were fixed or explicitly reaffirmed in the
same cycle** ("Fix all gaps"). §3 is the resolved ledger; §4 records the
design decisions. Failure classes used below: **LOSE-PLOT** (facts fall out
of context), **WRONG-DETAIL** (stale/wrong data injected), **INVENT-RISK**
(nothing stops a contradiction).

## 1. Injection side — what the narrator is told

**Single seam holds.** Every narrator call builds context through
`buildNarratorExtras(mode, …)` (`src/narration/narrator.js`): move_resolution,
paced_narrative, scene_interrogation (an `@scene` question — answered, not
narrated: see "An `@scene` answer" below), oracle_followup, session_vignette
(the session's set-pieces: its opening, its closing cutaway and the spotlight vignette), clock_advance (a clock's advance or
trigger — its own role and the interaction latitude since issue #322 V23; it
used the vignette's "calm before / after"), vow_swearing (embellishment
latitude — it had none, V23), inciting_incident, campaign_recap (meta — no
sidecar/latitude, and of the scene ledger [6.5] the ship's position alone —
issue #374 A1; its source — the session record, and how things stand read
live — is its user message, below), round_resolution (a Batch Mode round, issue
#340 — see below). The `!ship
envision/history` and `!lore`/truths generators are separate world-building
prompts outside the memory surfaces (they write Notes/journal canon but don't
read the ledger).

**Where each call runs (multiplayer).** The Claude key is per browser
(issue #209), and the narrator side-data can only be applied on the canonical
GM (§2), so every narrator call runs exactly once, on one chosen client:
- **Move narration** (`narrateResolution`) runs inside the move pipeline, on
  the canonical GM — which `isCanonicalGM()` prefers to be a GM that
  advertised a Claude key (world setting `keyedGmUserIds`,
  `src/multiplayer/gmGate.js`). Its user message (`buildNarratorUserMessage`)
  is RECENT SCENE, MOVE OUTCOME, the player's line, then **one block of what
  the result obliges its telling to** — WHAT THIS NARRATION MUST TELL, AND
  MUST NOT (`moves/contracts/obligations.js` `obligationsFor` /
  `formatObligationsBlock`, overhaul 4 slice 2; three lists — TELL, NOT YET,
  NOT SO — a tag a line; it replaced the STAKES, PRICE, COST, FIGHT and VOW
  blocks and the match line, their words kept) — and the instruction, which
  says to keep to it. Its lines: [outcome]; [stakes] — the interpreter's hit
  and miss lines the Confirm dialog showed (`resolution.stakes`,
  `moves/stakes.js` `stakesShown`) and which one this outcome delivers
  (issue #353 R1; a burn's or an improvement's re-narration carries them).
  The miss line is
  shown, and narrated as "what this miss costs", only when it is the price:
  `priceStated`, false for a move whose miss pays no price — Enter the
  Fray's, Swear an Iron Vow's, the resist rolls' (`resolver.missPaysPrice`,
  issue #362 AC02). A price that is one of the player's choices
  (`resolution.priceChoice` — Explore a Waypoint's miss with a match: Pay
  the Price, or Confront Chaos instead; Sojourn's miss: "No relief — Pay
  the Price", or the community's need taken on, issue #364
  SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE — once that need is answered,
  the help done or a vow sworn, the Sojourn is narrated again as the strong
  hit it resolves as, a second beat whose MOVE OUTCOME says "A miss,
  resolved as a strong hit": `moves/sojournNeed.js`,
  SOJOURN-VOW-OPTION-REMINDER-ONLY) is settled when the
  narration is written (`resultUpgrade.priceChoiceStatus`, read from the
  table's cards — the waypoint's claim, and the option the choice card was
  resolved by, `chosenIndex` → `resolver.settlePriceChoice`): paid, it is delivered as
  above; still open, or declined, the stakes point at the [price] line (NOT
  YET "THE PRICE IS THE PLAYER'S CHOICE." / NOT SO "THE PRICE WAS NOT
  PAID."), and a declined price's seed lines are dropped (issue #364
  EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY; a round's entry too).
  **What the table has answered, and has still to answer,** is read the same
  way, from the table's cards, beside that settle
  (`obligations.unansweredCardsFor`, moved from `resultUpgrade.js`, through
  `narrator.js` `withCardsAnswered` in `movePlanRequests` and for each of a
  round's move entries; the long haul's third live run): a **cost that is
  the player's choice and not chosen yet** (`openChoice` — the outcome's own
  choice card has no pick, or is not posted yet: a free-flow result is
  narrated before its card; the choice is `consequences.sufferPrompt` or the
  card's, and counts only when an option costs something — a suffer move, a
  loss, a price, a complication) gets NOT YET [cost] "THE COST IS THE
  PLAYER'S CHOICE." (what every option has in common is narrated, the cost
  is not — a Heal weak hit's narration had spent the supplies before the
  card asked "Lose Momentum, or Sacrifice Resources?", known-issues
  COST-NARRATED-BEFORE-IT-IS-CHOSEN), and the stakes' weak-hit line points
  at it instead of asking for "the cost … the move outcome names"; **a cost
  picked before the narration** (a held result kept by its pick, a round
  whose entry's card was answered first — `chosen`, the option's label from
  the card's `chosenIndex` / `pickedIndices` / `pickedSuffers`) gets TELL
  [chosen] "‹PC› chose ‹option›. Tell what it cost them." An **Enter the
  Fray whose fight no one has begun** (`fightOffer` — its threshold card,
  found by the resolution's id, is unanswered, or the way out was taken)
  gets [fight] — NOT YET "THE FIGHT IS STILL ONLY OFFERED." / NOT SO "THE
  FIGHT WAS NOT BEGUN." (`combat-flow.md` §1). A **Fulfill Your Vow hit**
  carries TELL [vow] "THE VOW IS FULFILLED." (never claim an answer the
  narration does not state — `vow-flow.md` §3); a **progress move's miss**
  with a recommit card (Fulfill Your Vow, Finish an Expedition, Forge a
  Bond) NOT YET [recommit]; **Reach a Milestone** TELL [milestone]; a roll
  **with a match** TELL [match] — tell the twist and never write the word;
  a soft refusal **rolled at the GM's word** TELL [overridden]. Which of
  these a move's result carries beyond the generic ones is its contract
  row's `obliges` (`moves/contracts/table.js`). NOT SO [state] says what the
  sheet holds of a person or a fight the beat touches — a connection the
  line, the move's target or the scene frame's cast names, whose
  relationship is full and unbonded ("‹person› is ‹PC›'s connection, not a
  bond: their relationship is full and no bond is forged."), or that is
  lost; "No fight is under way." for a line that reads as fighting with
  none open (`narrator.js` `beatSituation` reads the speaker's situation for
  it — TRACK-TOLD-AS-A-BOND); NOT SO [sheet] and [apparatus] close every
  block. The
  move and round roles name the outcome's own words — strong hit, weak hit,
  miss, match — as never to appear as such (known-issues
  NARRATION-NAMES-THE-OUTCOME).
- **A Batch Mode round's narration** (`narrateRound`, mode
  `round_resolution`, issue #340) runs once per round in the round driver
  (`src/batch/driver.js`) on the canonical GM, under the move lock, after
  every acting entry is rolled and recorded and its upgrade decided. Its
  reply is posted only while the narration is still the round's (the
  driver's `narrationStillOurs`): a co-GM's takeover, card or close since —
  or a drop off the server while the call was out, with another GM
  connected — and the reply is dropped, nothing applied (issue #347 AB17). Context
  goes through the same seam: the entries' text joined for lexical relevance
  and lore; each move entry's own relevance (resolved when it rolled — the
  GM's clarification dialog, asked before its dice, included — issue #347
  D1) unioned, at the widest class (an entry
  with no roll counts as interaction); a CHARACTER block per acting PC
  still in the game (`extras.roundCharacters`, by the entry's actor id — an
  entry whose PC was deleted since the round opened gets none:
  `getActiveCharacter`'s fallback brought a PC who sat the round out into
  it, ROUND-CHARACTER-BLOCK-GONE-PC); PARTY naming only the PCs who act
  (`actingActorIds` — the roster filtered by actor id, each named as the
  sheet names it now, marked "acting this round"; the round's own copy of a
  name, taken when it opened, names only a PC since deleted — issue #342
  Z36); no SPOTLIGHT (`round_resolution` is not in
  `SPOTLIGHT_MODES`). The user message (`buildRoundUserMessage`) is RECENT
  SCENE, then THIS ROUND — each acting entry in confirm order with its move,
  stat, outcome, outcome text and price, the stakes shown before its roll
  (`narrationInputFrom`'s `stakes`, issue #353 R1), oracle seeds (the
  round — a world setting every client holds — keeps no hidden plan roll: a
  new enemy's role, goal and disposition and an expedition plan's rolls are
  rolled as the round is narrated, on the GM — `withHiddenRolls`, issue #362
  AC15), the player's sanitised line and a latitude line — and the instruction to act for no one else and
  remark on no one who didn't act. Who sat the round out is never sent.
  Perspective "auto" is third person whenever two or more PCs act, whoever is
  connected (`resolveNarrationPerspective`'s `actingCharacters`, from the
  CHARACTER blocks; issue #342 Z40 — a GM's PC beside one player's was
  second person). Otherwise "auto" is the perspective the session recorded
  when it began (`campaignState.sessionPerspective`, written by
  `beginSession`, cleared by `mintSession`; read by `sessionPerspectiveOf`
  for every mode — issue #348 PT03 — and by the Sector Creator's stubs,
  `sectorGenerator.generateNarratorStubs`, issue #362 AC70), not a per-call
  count of connected users; a session not begun counts them per call. Its
  sidecar, X-Card gate, rate-limit retry, `!narrator debug` capture and
  fallback are every narration's; its capture (`runRoundNarrationPasses`) is
  one detection call, at the widest class among the entries it captures — a
  Make a Connection miss creates no one (scope §9) and takes no part, so the
  rest of the round is captured whatever the confirm order (issue #342 Z08: a
  round led by a miss skipped its whole capture). Its prompt names one lead
  move — the first Make a Connection hit, else the first rolled move; a
  round with neither (actions with no roll, moves the roll stage refused) is
  told no move was rolled, as paced narration's is (`PACED_NARRATIVE_MOVE_ID`
  — it read "Move: null.", ROUND-DETECTION-NULL-MOVE) — and its results are
  routed per entry: each Make a Connection hit creates the figure its own
  character met, with its own seed and bond, synchronously (Z09 —
  `connection-flow.md` §1),
  and the rest wait on a draft card carrying every acting PC, whose
  connection rows ask which of them, or no one (D3); the tier pass runs
  whatever the class, each entry by its free-flow rule (Z10 — "Post-narration
  capture" below).
- **Claude-calling chat commands** — `@scene`, `!recap`, `!ship envision`,
  `!ship history`, `!incite` (the Session panel's ✦ Envision Inciting Incident
  posts the presser's `!incite`, a GM's press too — issue #345 D6) — route `RUN_ON.CLAUDE` (`CHAT_COMMAND_ROUTES`,
  `src/index.js`; policy in `src/multiplayer/commandRouting.js`): the keyed canonical GM when `hasKeyedActiveGM()`, else the
  author's client with its own key (a keyed player at a keyless-GM table;
  keyless → the usual "key not configured" fallback). Every client reads the
  same setting and user list, so they agree on the runner.
- **Oracle follow-ups** (after `!oracle yes`, `!oracle <tableId>` and
  `!pay-the-price` — a price that reveals a new enemy is told its Character
  Role + Goal + Disposition, rolled where it is narrated and never put on the
  raw card — and after a weak hit's chosen complication, whose card
  (`sufferDialog.js` `postChosenComplication`, kind `complication`; a
  waypoint's peril rolled on Spaceborne Peril) the narrator plays at once as
  its own beat, issue #353 Phase 0; a move's routed Pay the Price has none — its price seeds
  the move's own narration, issue #325 W03 — nor does a routed `!ptp` price
  nobody pays, a PC-less player's at a table of several: its card says it was
  not applied and carries no `oracleNarration` or `oracleMemory`,
  PTP-PCLESS-NARRATED-AS-FIRST-PC) go through
  `requestOracleNarration` (`src/oracles/oracleFollowup.js`) with the same
  rule: a keyed GM is connected → `requestGmAction("oracle.narrate")` runs it
  on the keyed canonical GM; else a keyed author narrates locally; else it is
  skipped with a debug line (the raw card already carries the result).
  **An oracle's answer binds the narration that tells it** (known-issues
  ORACLE-NO-NARRATED-AS-YES — "Is anyone left alive aboard the wreck?" rolled
  NO, and the follow-up wrote "which means someone is aboard", keeping the
  voice it had made over three beats): the `oracle_followup` role says the
  answer is the table's — never narrated as its opposite, as doubtful or as
  still to be found out — and that where the scene so far said otherwise the
  scene gives way (what was heard was a recording, a relay, a mistake, or has
  stopped); the user message says a yes/no answer back in plain words with its
  question, after the recent scene and before the ask
  (its obligations block — TELL [oracle] the answer, NOT SO [oracle] its
  opposite — `obligationsFor({ mode: "oracle" })`, read by `buildOracleUserMessage`;
  nothing for a table roll, a price or a complication); and RECENT ORACLE
  RESULTS ([3b]) tells every later narration that the answer stands over
  earlier narration. A table's result keeps its latitude, and is never turned
  into its reverse.
- **Session vignettes** (galley, closing) run in the Begin / End a Session
  relay handlers on the canonical GM (`applyBeginSession` /
  `applyEndSession`), so they need a keyed GM; at a keyless-GM table they are
  skipped. The galley's CHARACTER blocks are the PCs at the table — the
  present split its user message lists (`collectGalleyParticipants`), each
  its block as a round's acting PCs have, third person for two or more, none
  when no PC is there; it took the first PC, so with that PC's player away
  its "you" was the crewmate it called absent (issue #345 AA31). The closing
  vignette, about an NPC, takes the PCs at the table the same way — it took
  the first PC, whoever was there (CLOSING-VIGNETTE-FIRST-PC). So do a clock
  vignette (every post site) and the inciting incident, which no one PC's
  line or roll starts (`partyBlocksAtTable` → `partyBlocksFor`, the galley's
  rule — issue #362 AC75).
  The opening's user message (`buildGalleyVignetteUserMessage` — the file and
  the card kind `galley_begin` keep their names; the scene is no longer set in
  the galley) sends no stat
  line, and with no other PC registered says nobody else is aboard — no crew is
  invented, present or absent (issue #377 item 4: told to "invent generic
  absurd crew", it gave a solo pilot three crewmates, and a helper recorded her
  as a crew member of her own ship). Each bookend's message lists the earlier
  ones of its kind as already used — the newest three, read from the chat's
  cards (`vignetteHistory.js earlierVignettes`; a closing's card names whom it
  featured, `vignetteNpc`) — issue #377 item 5 — each one **whole**: shown its
  first 700 characters, a fourth opening ended on the first one's own last
  sentence, which the cut had taken out of the list (the long haul's third
  live run, a78 against a2), and both rules now name how a scene ends as used.
  **The opening is set where the last session stopped** (issue #381 D1/D2) —
  WHERE THE LAST SESSION STOPPED: the summary of the session before
  (LAST SESSION, read from the session record — `lifecycle.lastSessionToTell`,
  issue #382) and the last narration the table read, word
  for word (`narrator.getLastStoryNarration`: the newest story card's session,
  its newest two story cards by the ring's own rule — no session or clock
  vignette — so it adds no store). Both are read in one call,
  `galleyVignette.whereLastSessionStopped`, made once, by
  `composeOpeningScene`; nothing is said with neither (a campaign's first
  session, a world whose chat is gone and whose summary is off). It picks the
  story up there: the scene is set where that leaves them, aboard or not —
  nobody is moved "back aboard" — nothing still going on is over or behind
  them, and no more time has passed than it allows (the third opening soaked
  apricots "for the third time this week" beside a raider's open boarding
  lock; the fourth wrote "since the Wren" of a ship still grappled
  alongside). The table's own word — Begin a Session's "Where and when do we
  pick up?" (D8: the `pickUp` payload, cleaned on both clients, shown on the
  Begin card) — is told above it and outranks it. **The opening is built from
  rolled material** (`session/sceneSeeds.js`, the one draw site, `drawDie`):
  Action + Theme for what the characters are doing in this lull, Descriptor +
  Focus for what the scene's eye rests on, each with a second result drawn at
  once; a place aboard (Derelict Zone (Starship), then that zone's area table —
  an instruction row drawn again, up to three times) only when nothing says
  where the scene is set; and each absent crewmate's business (Action + Theme,
  three at most). The MATERIAL block (`formatMaterial`) numbers them, says
  each is in the scene and that the scene has no business of its own, and asks
  for the fact block's `builtFrom` (§2). Rolled on the canonical GM, after the
  clock vignettes, and only when the scene will be narrated
  (`sessionVignetteWillRun` — narration on, the X-Card down, a key here); per
  call, so in the user message, never in a cached block. The role
  (`ROLE_DESCRIPTIONS.session_vignette`) names no place, food, talking ship or
  example scene: the fixed stock that made two separate campaigns' openings
  one scene is deleted (the galley, "pick a specific food or drink", the ship
  as the joke, "a line of dialogue, a question, or a small interruption",
  "the calm before / the calm after").
  **The closing cutaway shows someone the campaign has, never the same
  twice running** (issue #381 D6; `endSessionVignette.composeClosingScene`,
  on the canonical GM, only when the scene will be narrated): End a
  Session's connection focus when it names a connection in play; else a die
  among the connections in play and the named threats (`sceneRecords.js`;
  weighted bonded 3, rank dangerous or above 2, a threat 2, else 1) — not
  the one the last closing card's `builtFrom` subject names (by its stable
  `ref`; a card from before it by `vignetteNpc`), and not one the frame of
  the scene the session ended in had Present, each while there is another;
  with nobody, a die among the active sector's settlements (their records,
  else the sector's own list) other than the one the characters are at; with
  none, no closing — no call, no card, no dice. The frame is kept before End
  closes the scene (`endedFrame`), and its Where is told as where the
  characters are. Its material (`sceneSeeds.rollClosingSeeds`): their card's
  LAST KNOWN location (else a settlement zone and its area — rolled too when
  the ended scene had them with the characters), Action + Theme for what they
  are busy with, Descriptor + Focus for the thing in hand. Its user message
  names whom it shows as "Subject (<kind>): <name>." (the runner's scene
  counts read that line). Deleted: the "architect of" the sector's trouble
  and "familiar adversary" tiers, the list of mundane tasks, the list of
  gestures, the role's three example closings, `selectEndSessionNPC`. Kept
  (D4): EARLIER CLOSINGS and `vignetteNpc`.
  **How a set-piece ends is its material's** (known-issues
  SET-PIECES-SHAPED-BY-THEIR-PROMPT): no shape is given. Told "It stops when
  the small thing is done, or put down", every closing of the fourth live run
  ended on a thing put down; told "Its last sentence returns to what that
  leaves open … Nothing new happens", and given "for the third time this week"
  as the time not to let pass, every opening handled a counted object and
  ended still. Both now end where the scene reaches its last result ("How it
  ends is the material's"); the opening — and the role's OPENING — holds back
  only the plot ("No turn of the plot happens in it: the first move is the
  players'"). The MATERIAL says a result's words are the oracle's, never the
  prose's (a record's name or place is written as it is): told "Never the
  words themselves", six results were written as their own word.
  **The Spotlight Vignette is narrated** (issue #381 D3): where Begin was
  pressed the d100 is rolled for the Begin card as before, and — when a
  narration will follow (`narrationEnabled`, a keyed GM connected, the
  X-Card down — `spotlightWillBeNarrated`) — sent to the canonical GM as a
  number alone (`spotlightRoll`); otherwise the card says the result is the
  table's to envision. The GM reads the result off `spotlight_vignette`
  itself and writes a short cutaway (`spotlightVignette.composeSpotlightScene`
  → `narrateSessionVignette` → `postSpotlightVignetteCard`, kind
  `spotlight_begin`) first of Begin's narrations — after the clock card,
  before the clock vignettes and the opening, each of which waits for it,
  bounded. Its material: the card's result (never rolled again), a die among
  the records its row names (the PCs at the table, connections, settlements,
  factions, open quest vows, named threats, the table's clocks — no hidden
  plan's — `sceneRecords.js`; two of them for a row that connects two
  situations; none for "peril lies ahead"), Action + Theme, Descriptor +
  Focus. It runs at the interaction latitude (`narratorClass`), discovery
  when its row introduces someone and nobody is on record; its capture runs
  detection (`detect`, as a clock vignette's). Its scene is its own: ended
  with its card (`spotlight_vignette`), unless the table already had one
  open. In the ring and the summary's source its entry is headed as a
  cutaway the characters did not see (`ringEntryText`); it is no part of the
  last narration the next opening is told. A narration due and not written
  leaves one line, no narrator card. The move narration's unshown spotlight
  seed for a line read as Begin a Session (`buildOracleSeeds`
  `begin_a_session`) is removed.
  A vignette is a bookend, not a
  beat of play: its mode block says its fact block sets no scene question (`A
  VIGNETTE IS NOT THE SCENE`), and its sidecar is applied with `bookend: true`
  — the frame's where / present / now are written, the question never (§2;
  known-issues NARRATOR-REFRAINS: the galley's closing hook was its session's
  question in every prompt).
- **Native sheet rolls** (a vow or bond progress roll on the vendor sheet,
  `registerNativeProgressRollHook`) take the same ladder, decided by the
  `createChatMessage` hook on every client (`nativeRollNarratesHere`): the
  keyed canonical GM when a keyed GM is connected, else the roller's own
  client — it used to be the roller's client always (issue #321 U11).

When a call runs off the canonical GM (the author fallbacks above), its prose
posts normally and `applyNarratorSidecar` relays its side-data to the canonical
GM (GM relay `narrator.sidecar` → `applyRelayedNarratorSidecar`, issue #286
D2), tagged with the scene it was written in: the GM drops it if that scene
has ended, or if the X-Card has since removed the narration it came with (its
`narrationId`, issue #321 U07), and starts a scene if none is active. It used to be
discarded. With no GM connected nothing can be recorded (debug-logged). An
`@scene` answer is the exception: it has no side-data — nothing of it is
recorded, on the GM or relayed (known-issues SCENE-ANSWER-NOT-A-CAMERA). The
post-narration capture (§2) does not run off the canonical GM (an `@scene`
answered on a player's client used to run the detection and tier passes
there, issue #321 U36; an answer now runs neither, anywhere). A move's or a Batch Mode round's capture runs on the GM
that narrated it (`runPostNarrationPasses` / `runRoundNarrationPasses` — a
GM's client, never a player's), canonical when it claimed the move: they
re-checked canonicity when the narration landed, so a lower-id keyed GM
joining meanwhile left the capture running nowhere — a Make a Connection hit
made no one, untold (issue #345 AA34).

**Safety [1] and the X-Card.** [1] renders `campaignState.safety` global
Lines / Veils, read from the stored setting (`buildNarratorExtras` →
`extras.safety`, the caller's copy only as a fallback): the move pipeline
narrates from a snapshot taken before its confirm dialog, so Lines, Veils and
Private Lines added meanwhile were missed (issue #321 U08 — [3b]'s recent
oracles are read from the store the same way). Each player's Private Lines now reach
`campaignState.safety.privateLines` too: a player's client relays them
(`safety.syncPrivateLines` → `applyPrivateLinesSync`, keyed on the relay
requester) on load and again whenever the canonical GM announces its relay is
ready (`onGmRelayReady`) — previously `syncSafetyToCampaignState` returned
early on player clients, so only the GM's own lines were ever stored. Every
client, GM or player, also puts its own entry back when a campaignState write
leaves it wrong (`registerPrivateLinesHealing`): two writes of the list inside
one round trip — two GMs loading at once — dropped one user's lines from every
GM-built prompt until their next load (issue #345 AA35). The global Lines /
Veils copy is healed the same way by the canonical GM, from the world
settings (`onSafetyListsWritten`, SAFETY-GLOBAL-LISTS-CROSS-WRITE). [1] is
built by `formatNarratorSafetyContext`, which scopes Private Lines to the
building client: on a GM's client every player's lines (deduplicated, listed
by their users' ids — the stored entries are in the order of the last sync,
every client re-syncs at `ready`, and a reload reordered the lines and
rewrote the cached standing block, issue #362 AC67); on a
player's client — narrating only with no keyed GM online — that player's own,
read from their client setting, never another player's. Before 2026-10 the
shared prompt passed no user id and carried no Private Line at all
(SAFETY-PRIVATE-LINES-SHARED). The Private Channel builds its player's block
the way a player's client does (`formatOwnSafetyContext`, from
`src/private-channel/context.js` `buildPrivateContext`): their own lines,
read from their client setting. It read the campaignState copy, so a line
added while no GM was online was missing from the player's own Private
Channel (issue #345 AA03).

**The Private Channel** (issue #286 D1) builds its own Haiku prompt but reads
what the main narrator knows, rendered by the same section formatters
(`buildPrivateChannelStory` → `buildSharedStorySections`): world truths and the
campaign premise in its cached prefix; LAST SESSION, STORY SO FAR, the cards of
the recorded entities the message or the scene frame names (lexical, plus
`addSceneFrameCast`), the scene ledger and the hidden plans in play (the
narrative skeleton's UNREVEALED, decided plans only and no instruction to
write — issue #353, decided) in the per-turn message. A player's client reads
no plan (issue #362 D1, `secrets.secretPages`): its turn asks the canonical GM
for the decided plans its message and the scene bring into play
(`requestPlansInPlay` → the `plansInPlay.ask` / `.answer` socket kinds, as the
oracle consult's; projected without rolls, re-roll, clock or provenance;
bounded at `PLANS_WAIT_MS`) — none with no GM connected or no answer in time;
a GM's client reads them itself, as before. Its
character is the player's own PC (`resolveUserActorId` — never another
player's; with none of their own in a multi-PC game the window says "Set up
your character first", issue #321 U23), and the transcript it sends is the
one the window shows: the session's saved private turns, read back once when
the window opens (`parseTurnsHtml`), then this window's — a reopened window
showed the earlier turns but sent the narrator none of them (issue #321 U42).
It writes nothing during a conversation. A reflection the player publishes is canon:
its card carries the flag family (ring, rolling summary), and the canonical
GM runs the tier pass for the entities it names
(`registerPublishedReflectionHook`), stamped with the `narrationId` the card
carries, so an X-Card on the reflection drops those details (issue #335
Y03). No ledger facts — the private narrator emits no sidecar. The X-Card
(`xCardActive`, set by the `xcard.activate` relay — a write that fails is
reported on a card, not assumed, issue #302) is checked by every
narrator X-Card gate — move, paced, `@scene`, oracle follow-up, session and
clock vignettes, vow swearing, inciting incident, and since issue #321 U09
the Private Channel's narrator (`requestPrivateNarration`: on entry and when
its reply returns, a reply written meanwhile discarded unshown) and its
Publish (`publishToMainChat` refuses and tells the player — a published
reflection is canon; the canonical GM, which posts it, checks the live flag
again, before and after its Private Lines check — issue #362 D13 — and
answers the publisher's client, which says a refusal in the Private Channel
window's banner, never as a whisper in the main chat — issue #364
PRIVATE-REFLECTION-REFUSAL-IN-CHAT) — against the caller's
campaignState **and** the live stored setting (`isXCardActive`,
`narrator.js`, exported with `watchXCard` for the Private Channel; recaps carry no gate): the move pipeline narrates from a
snapshot taken before its confirm dialog and Claude calls, so a card played
meanwhile is only visible in the store. Each gate runs twice — on entry and
again the moment the Claude reply arrives (`watchXCard(…).interrupted`), before the
sidecar is applied: a card played while the reply was generated discards it
(no card, no audio, no ledger facts, no post-narration passes — issue #300
F13), and the entry point stands down as it would have on entry. So does a
narration whose client's connection to the server dropped while it was
written (`connectionWatch.js` counts the drops): a pause recorded meanwhile
never reached that client's cache, so the watch cannot see it — the paused
notice says the connection dropped (issue #347 AB19). The page itself is
stale from the drop until it reloads, and stands down: it is never the
canonical GM and writes no campaignState or Batch Mode round, so the move's
own record and lock release — written from that cache afterwards — are
refused instead of lifting such a pause, and so are its actor writes
(`actorBridge.js`, STALE-PAGE-ACTOR-WRITES); another GM takes over what it held
(issue #347 AB19-STALE-CACHE-WRITES). A narration started on a page already
stale — a player's, narrating on the player's own key — is discarded by the
same watch, and the Private Channel refuses a turn there (STALE-PLAYER-PAGE). The watch
starts on entry with the live `campaignState.xCardPlays` count (each
`suppressScene` adds one; resuming never lowers it), so a card played **and
resumed** before the reply arrives still discards it (issue #306 R01) —
`persistResolution` keeps the store's count (store-owned). A move resolved under the X-Card still
posts its result card, then a short "narration paused" notice
(`narrationPaused` flag, outside the flag family) instead of narration — the
move-path gate had been lost with the retired assembler (ASSEMBLER-003). A
typed line the pacing classifier reads as narrative (the classifier still
runs — it is how a typed move is found) gets the same notice from
`narratePacedInput` when the card is in play on entry: it posted nothing and
told nobody, and the line was never narrated after the resume (issue #345
AA29). When
the card was played and resumed mid-call, the notice (and `@scene`'s card)
says the narration was discarded instead. A paced line whose narration call
fails — overloaded, a server error, a timeout, a rate limit on the retry
too — or whose reply has no prose, or whose prompt could not be built (a
throw before the call, issue #347 residual PACED-NARRATION-THROW-BEFORE-CALL)
— gets a "That line was not narrated" notice
the same way (`postPacedNarrationFailedCard`, issue #347 AB21): it logged to
the GM's console only, and the line sat in chat with no answer. Neither
notice is a narrator card, so neither reaches the ring, the summary or the
chronicle.

**The X-Card removes the narration it answers** (issue #321 U07 — full
exclusion, a maintainer decision). In the same write as the pause,
`suppressScene` (`src/context/safety.js`, on the canonical GM) calls
`applyXCardToNarratorMemory` (`narrator.js`), which picks the cards with
`xCardedNarrationCards`: the newest narrator card of the session still in
narrator memory — or one posted since the session was minted and filed under
the session before it, a Batch Mode round narrated late, which is on screen
like any other (`narratedLateIntoEarlierSession`, issue #364
XCARD-MISSES-LATE-ROUND-CARD; a beat is one session's, and the guard for a
card that posts during the pause and the Round window's newest narration
read it the same way) — with the narrator cards of the same beat — those after the
last message someone sent (a forced move's post — the Roll button's re-post
of the player's line, a button's forced move — counts as one, issue #326 W42)
and at most two minutes older; an earlier X-Card's
card, its "X-Card cleared" card or a card an earlier X-Card removed bounds
the beat, so a repeat play removes nothing more (fallback, burn-superseded
and whispered cards are never chosen). The walk reads the chat as it was:
every client remembers the chat messages deleted since its page loaded
(`registerDeletedChatHook`, `deleteChatMessage`) and the pick puts them back
in their place by time (`chatAsItWas`) — so a narration whose card a GM
deleted is still the newest one, and is what the X-Card removes, never the
kept beat before it; a deleted person's line still ends a beat (issue #347
AB22). A deletion alone changes nothing in narrator memory (Clear Chat Log
deletes every card). The canonical GM also keeps the newest twenty deleted
messages the pick reads — narration and X-Card cards with the flags the pick
and the removal read, and the lines that end a beat, none with its text — on
campaignState `deletedChatMessages` (`persistDeletedRecord`, one write per
bulk deletion), which `chatAsItWas` reads too, so the pick survives a reload;
a deleted card an X-Card removed is marked `xCarded` there, as a removed
card in chat is (issue #347 residual
DELETED-NARRATION-MEMORY-PAGE-ONLY). A Burn Momentum / Improve
Result re-narration in the beat names the resolution it upgraded
(`upgradeOf`): the narrations that upgrade struck — the move's first
narration and the trigger vignette of a clock it rewound (`supersededFor`) —
join the cards removed (`withStruckByUpgrade`), so their capture is undone
and their superseded truths become the X-Card's, blocked (issue #347 D2 — the
maintainer's option A; #338 D8 had left them standing). It retracts what their sidecars wrote
(`retractNarrations`, `ledgers.js`: truths `retractedBy: "xcard"` — a truth
the table had struck is relabelled so, and the strike a scene end kept for
the session (`sessionRetractions.facts`, with its truth's `narrationId`)
moved to the session's unnamed X-Card blocks (`sessionRetractions.blocked`):
named under CORRECTED it handed the narrator the removed content, and
`!truth set` could lift it (XCARD-AFTER-STRIKE-STILL-NAMED); dropped, it
blocked nothing (XCARD-RETRACTION-SCENE-SCOPED). A scene end keeps the
scene's X-Card retractions there too, so each blocks the narrator's
re-assertion for the rest of the session — `findSessionStrike`'s write half
reads them, the lift does not, and nothing renders them — and each live
narration truth it closes — live, or superseded by a Burn Momentum / Improve
Result (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END) — on `sessionRetractions.narrated`, unnamed, which an
X-Card on that narration — the session's newest, its scene since ended —
moves to the blocks: the ledger it retracts holds none of them, and nothing
stopped the narrator re-asserting them (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED) — state
values removed — each gives way to the value it superseded, kept on the entry
as a bounded `previous` chain, so an earlier kept narration's value stands
again (issue #326 W41) — and a frame they wrote giving way to the frame it
replaced, the same bounded `previous` chain on the frame (issue #345 D3,
the maintainer's option A: it was cleared, and the redirect narration was
built with no SCENE FRAME)), appends their `narrationId`s to
`xCardedNarrationIds` (cap 50), takes the oracle results they told out of
`recentOracles` (`dropOracleResultsFor`: an oracle follow-up's card names
the result card it narrated, `oracleCardId`, and each ring entry carries
its card's id; a move narration's — or a round card's entries' —
`resolutionId` names its Pay the Price; RECENT ORACLE RESULTS told every
later narration the removed answer was established — issue #345 AA01),
leaves every session summary to the session record — its
`narration.removed` (recorded first, `finishXCardRemoval`) makes a summary
that told them stale, never shown and made again from what remains, and a
summary whose call was out when it landed is discarded at its reply (issue
#382 slice 3; issue #325 W06, #345 AA25 / AA57) — and sets
`xCardRedirect` — on
every play. A ship move the narration made is undone too: the sidecar's
`ship / position` change is written to the command vehicle stamped with the
narration's `narrationId` and the position before it (`previous`, up to
three deep), and the X-Card's finish (`restoreShipPositionAfterXCard`) puts
back the latest position no removed narration wrote — an empty one when
there is none — and moves the sector token with it; SHIP POSITION kept
naming the removed destination (issue #325 W07). The token goes back where
the removed narration's sync took it from — the record's `tokenBefore`
(`{ sceneId, tokenId, x, y }`, `commandVehicleTokenSpotBeforeSync`), the
oldest removed one's when several moved it — a spot no pin need anchor: the
sync moves a token only onto a pin, so a ship parked in deep space kept its
token on the removed destination (issue #342 Z12); a record with no spot
falls back to the restored position's pin. Every other position
writer — `!at`, Set a Course, an expedition's arrival, the Entities panel, a
token move, the restore itself — writes `narrationId: null, previous: null,
tokenBefore: null` (`emptyPosition`, `computeTokenPositionRecord`): the record goes through
`setFlag`, which merges key by key, so a narrator move's id and chain
survived a later GM move and the X-Card then put the ship back over it
(SHIP-POSITION-FLAG-MERGE). So is what the narration's
**capture** recorded (issue #329 X01): every capture entry point
(`runPostNarrationPasses`, `schedulePacedDetection` /
`schedulePacedTierUpdate`, `scheduleNarrationCapture` /
`runNarrationTierUpdate` — the published reflection's hook included, with
the id its card carries since issue #335 Y03 — the inciting capture) hands the narration's id to
`routeWorldJournalResults`, the tier pass, `routeEntityDrafts` (its faction
auto-surface) and `applyEntityRenames` (issue #335 Y02), which stamp it on
each Lore / Threat / Faction / Location entry (an entry it rewrote keeps the
versions before as `previous`, newest first, up to three), tier detail and
placeholder rename (`renamedBy` on the card — the X-Card puts
the placeholder name back unless the card was renamed since), and on the
◈ New Entities card it queues (its rows still pending are withdrawn —
`xCarded`, no Confirm / Dismiss, out of PENDING DRAFTS and the
re-detection skip, not added to `dismissedEntities`: issue #338 D6(i),
`withdrawNarrationDrafts`), and on a connection a Make a Connection hit's
capture auto-creates (`createdFromNarrationId` — after the capture undo the
X-Card's finish deletes it with its bond Items and its portrait (the "Art:"
journal entry and its index entry — XCARD-CONNECTION-PORTRAIT-ORPHAN) while nobody has used it,
else keeps it and whispers the GMs once, naming it: D6(ii),
`retractNarrationConnections` — so, stamped with the row it confirmed, does a
connection the hit confirmed from an earlier narration's pending draft row,
whose row then goes back to pending, and the ledger facts promoted to a
deleted card go back to its name: MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED); the X-Card's
finish (`retractNarrationCapture`, `retractions.js` →
`undoNarrationEntries`, `worldJournal.js`) puts a rewritten entry back,
retracts a new lore entry (out of ESTABLISHED LORE and the pending queue), deletes a new
threat, faction or place page and drops the tier details — a detail the GM had promoted takes the line its ⤴
Promote appended with it (the entry keeps `promotedText` beside its
`narrationId`): off the sheet's Notes tab for an NPC card or a ship, else out
of the record's notes (issue #338 D7); a Promote never promotes an X-carded
narration's detail, and one whose Notes write the X-Card overtook takes its
own line back off the tab (issue #342 Z44) — most of these restate no sidecar truth, so
`propagateRetraction` never reached them. First of all, the finish puts the
removal on the session record (`recordNarrationsRemoved`, issue #382 —
docs/flows/session-record-flow.md), awaited: the removed narration's prose
and what it established are blanked in the stored record (decision D3), and
every view of the record — the Session Log page among them — reads without
them. The session's Session Log page is the record's view: its "Session
summary" is the summary view, stale with the removal and rendered again
without it (issue #345 AA27). A capture still running when the
card is played writes nothing more (XCARD-LATE-CAPTURE — the undo reaches only
what was written before it): every capture write checks the STORED
`xCardedNarrationIds` first (`safety.js` `isNarrationXCarded`, never a
caller's copy) — the detection passes (`runDiscoveryDetection`,
`runPacedDetection`) and the tier pass (`appendGenerativeTierUpdates`) on
entry, so a timer that fires after the card makes no Claude call, and again
when their reply returns; the routers before each write
(`routeWorldJournalResults`, `applyEntityRenames` and its notice,
`routeEntityDrafts` — its draft card, faction surface and pending confirm —
and the tier details); a Make a Connection's card between the steps that
make it (its bond, its portrait, its promoted facts, a pending row's
"confirmed" — `confirmDraft`), the inciting capture's own Lore entry; and a
portrait whose entity is gone when the image returns is not stored
(`generatePortrait`). The card may be played after the
scene ended, when the ledger is empty (the pick is session-scoped): what the
scene end migrated carries the truth's id too (issue #335 Y01) — the tier
detail, the archived Lore page (a page it rewrote is restored) and the LAST
KNOWN value, which falls back to the newest value in its `previous` chain no
removed narration set (a kept narration of the scene, then the earlier
scene's). A card played while the scene end is still migrating is met the
same way: each migration write checks the stored `xCardedNarrationIds`
right before it writes — a LAST KNOWN value a removed narration set gives way
to the one it superseded — and a copy written as the card landed is taken
back by the narration's id (`takeBackXCarded` → `retractNarrationCapture`;
XCARD-DURING-SCENE-END-MIGRATES: the scene end's copy still held the beat
live, and its writes after the card's own undo left the removed fact as a
detail, as confirmed lore and as LAST KNOWN). A state transition the capture
applies to an entry it did not make — a threat resolved or escalated
(`updateThreatSeverity`; a detected threat is the recorded one when its name
is a variant of it — `resolveThreatName`; a Sector Trouble two sectors share is
the active sector's, issue #362 AC43 — and its severity one of four
words, a sentence given for one kept as the summary, so one threat is one
page: issue #354 P2-15; an escalation never leaves it less urgent — issue
#362 AC42 — nor does the capture listing a recorded threat again as
"escalating" or "rising" (`recordThreat`, issue #364
THREAT-REDETECTED-ESCALATING); a GM's **Merge duplicates** folds earlier ones,
`mergeDuplicateThreats`, and a later detection naming a folded page lands on
the page it was merged into — issue #362 AC21), lore confirmed (`promoteLoreToConfirmed`), a
faction's attitude (`recordFactionIntelligence`) — is stamped the same way and
put back with it; the stance an attitude moved on the faction's record (the
canonical stance, `recordStance` before → after) is put back too, where the
record still holds what the narration set (known-issues
XCARD-CAPTURE-TRANSITIONS). If that part fails the pause is still written. After the write the cards are flagged
`xCarded` (`flagXCardedCards`) and each retracted truth runs
`propagateRetraction`. Readers: the ring skips
`xCarded` cards (`sessionNarratorCards`); the session summary reads the
record, where the removal applies (issue #382); the `!recap session` card,
a view of the record too (issue #382 slice 5), keeps the move and shows no
telling at all, the audio hook shows no Play button and
stops the card's narration where it is playing or loading (XCARD-AUDIO-PLAYING), the
CORRECTED block and the summary's STRUCK list never name an X-Card
retraction (it still blocks re-assertion in the ledger),
`mergeSceneLedgers` strips an X-carded narration's entries from a stale
working copy (its frame yields to the store's), and a relayed sidecar of an
X-carded narration is dropped. **[1b] X-CARD — REDIRECT**: while
`xCardRedirect` is set for the session (read from the store,
`extras.xCardRedirect`), every prose mode carries a block telling the
narrator to take the story elsewhere without naming the removed beat;
`registerXCardRedirectHook` (canonical GM) clears it when the first narrator
card posts with the X-Card lifted — not a fallback, a published reflection or
an X-carded card — on the GM's campaignState write chain, so the Batch Mode
round's lock release right after its card reads the store once the clear has
landed (it wrote the redirect back, and every later round carried it:
CAMPSTATE-CHAIN-PARTIAL).

**A Burn Momentum or Improve Result** supersedes what narrated the outcome it
replaced (issue #338 D8): the move's narration card is flagged
`burnSuperseded` and struck (`supersedeOriginalNarration`), and so is the
trigger vignette of a clock its reversal rewinds out of its triggered state —
judged on the clock as the rewind reads it (`revertTensionClocksForBurn` /
`revertVowClocksForBurn` report it), whoever's price filled it (issue #342
Z46) — the clock's newest live trigger vignette of the session, found by the
`clockId` every trigger vignette carries (`resultUpgrade.js`
`supersedeTriggerVignettes`) — at the reversal, and at the GMs' Retry of a
rewind the world refused (`retryUpgradeStep`: the step keeps the upgrade's
kind and each vow copy's vow id; its vignette stayed live beside a clock no
longer full, UPGRADE-RETRY-REWIND-NO-SUPERSEDE); `sessionNarratorCards`
leaves both out of the ring, and the record's supersede
(`narration.removed` by `superseded`) leaves them out of the session summary
and the `!recap session` card (the move once, at its upgraded outcome):
a summary made from the replaced telling is stale and made again with the
re-narration — STORY SO FAR told the replaced outcome for up to
round(1.5 × Context Cards) narrations (issue #345 AA24). Their ledger entries are
retracted by `narrationId` through the X-Card's `retractNarrations`, with
`{ by: "superseded" }` (`retractSupersededNarrations` — the store and the
upgrade's working copy): rendered nowhere, never named under CORRECTED, and,
unlike an X-Card's, no bar to the re-narration — or the clock's next
trigger — stating the same fact. A trigger vignette still being written when
the reversal lands has no card to strike: it is narrated only while its clock
is still full when its reply comes in (`narrateClockAdvancement`'s
`stillTriggered`, `payThePriceClocks.js` `clockStillTriggered`, all three
post sites), so it posts nothing and its sidecar is never applied — and the
reversal strikes no earlier trigger's card of that clock in its place
(`triggerVignetteInFlight`; TRIGGER-VIGNETTE-LATE-POST). A trigger the world
refused to save at Begin a Session is owed, not rewound: Begin narrates none
for it, and the GMs' Retry narrates it when its fill lands
(`clocks.applyClockAdvances`, issue #342 Z63 — Begin's vignette was dropped as
rewound and the Retry's fill narrated nothing).

**System prompt section map** (`buildNarratorSystemBlocks` →
`buildNarratorSystemPrompt`, `src/narration/narratorPrompt.js`). Since issue
#354 P2-23 the sections are ordered into blocks by how often each changes,
and the request carries them as separate `system` blocks
(`splitNarratorSystemPrompt` → `narrator.js` `narratorSystemBlocks`, in
`callNarratorAPI`):
- **standing** — [0] the voice rules (depict-do-not-offer, PROSE, tone,
  levity, dialogue), [1], [4], [4a], [4b], [9] and [10]. The same for every
  prose mode, call after call; cached for an hour.
- **world snapshot** (`## WORLD SNAPSHOT`, issue #357 — "The world snapshot",
  below) — when the narration has one: the whole world state as it stood when
  the snapshot was taken, stored text sent byte for byte. The same for every
  prose mode until a new one is taken; cached for an hour.
- **this narration** (`## THIS NARRATION`) — [0m] the mode's role
  description, HOW A BEAT ENDS, perspective and length; [2]; the opening
  scene's sidecar addendum (`sidecarModeAddendum`). The same for one mode at
  one permission class; cached for an hour.
- **context** (`## CONTEXT FOR THIS NARRATION`) — every other section, in the
  order listed below, then [8d] and [9b]. Different every call; never cached.
  With a snapshot it leaves out the sections the snapshot holds and has
  IN PLAY NOW and CHANGED SINCE THE SNAPSHOT in their place.

The whole prompt used to go as one cached block that opened with the mode's
role and changed every beat, so the cache was written on every call and never
read (27 calls, 0% read, alpha 23 playtest). The ordering rule: nothing that
can differ between two calls sits in `standing`, and nothing that can differ
between two calls of one mode in `this narration` — `tests/unit/
narratorPromptBlocks.test.js` holds both. A meta mode (the campaign recap) and
the rolling summary's own prompt go as one uncached block; a world with
`campaignState.api.promptCachingEnabled` off sends the blocks with no
breakpoint. The section numbers below are names, not the order in the prompt.

**The world snapshot** (issue #357; decisions.md → "The world snapshot").
`buildNarratorExtras` ends by asking the store for the snapshot this
narration sends (`worldSnapshotStore.js` `resolveWorldSnapshot` →
`extras.worldSnapshot` `{ text, changesText }`, and `extras.inPlay`,
`narrator.js` `inPlayFor`). Every prose mode; never the campaign recap.
- **Built from units** (`worldSnapshot.js` `collectWorldUnits`): one per
  durable record, each `{ key, section, text }`, read from the stores that
  hold them — every sector of `campaignState.sectors` with its roster by name
  (the entity lists' records, `collectAllEntities`) and, after them, the
  people recorded with no sector of their own — an NPC a confirmed draft or
  Make a Connection's auto-create made has no `sectorId`, and [5b]'s roster
  counted them in the active sector's cast; the reuse rule names both (issue
  #362 AC29) — every recorded entity's
  card (`formatEntityCard`; an uncharted site — a discovery record not yet
  `discovered` — left out), the whole faction landscape
  (`mergeFactionLandscape`, uncapped), every World Journal threat not
  resolved, all confirmed lore with the Locations journal's places and
  `campaignState.loreRecap`, the newest three earlier sessions' summaries
  (read from the session record — `summaryView.js` `earlierSessionStories`:
  each begun session's summary view, or the story its page held, LAST
  SESSION's with what a session nobody began played after it; one with no
  number reads "An earlier session", not "Session 0", and the session that
  closed last is the newest numbered or not, issue #362 AC71) with the open
  vows and tracks by name, and every active plan of the Secrets journal
  (`listSkeletons` → `formatSnapshotPlan`). The World Journal's per-section
  context settings and the rolling summary's setting leave their sections
  out, as they left out the per-beat ones. Read from the stored campaignState.
- **Rendered once** (`renderWorldSnapshot`): sections in a fixed order, units
  by their stable key, no timestamp and no count — the same records give the
  same text in any order. A unit's text holds no section rule and no `## `
  heading, so the snapshot is one section of the prompt whatever a record
  says. The record kept is the text and a **manifest** (each unit's key and a
  hash of its text).
- **Stored** on one page of the GM-only World Journal — Secrets journal (flag
  `worldSnapshot`: session, time taken, causes, text, manifest, and a log of
  new snapshots, shown on the page). The canonical GM writes it; a GM's
  client reads it; a reload sends it unchanged. A player's client has none —
  narration on a player's own key is sent the per-beat sections, as before,
  and no hidden plan in them: a player's client reads no plan (issue #362
  D1), so its UNREVEALED is empty and only the plans its own rolls ask it to
  decide (DECIDE NOW) go with it.
- **Sent as stored**, with the world compared against the manifest at each
  call (`diffWorldUnits`): the units made or changed since go to the context
  in full, under **CHANGED SINCE THE SNAPSHOT** (`renderUnitSections`), which
  the prompt says wins; a key the manifest holds that the world no longer has
  takes a new snapshot.
- **In the context, in place of what the snapshot holds** — [4c]'s LAST
  SESSION, [4d]–[4g], [5], [5b], [6] and the plan entries of [6.6]:
  **IN PLAY NOW** (`formatInPlayBlock`) names the active sector, the current
  location, the matched entities (relevance and the frame's cast, as before)
  and the four most urgent threats, each by name and id; an entity in play
  the snapshot holds no unit for keeps its card (ENTITIES IN SCENE / CURRENT
  LOCATION); UNREVEALED keeps its rules and DECIDE NOW and names the plans in
  play by heading and id (`coveredIds`), a plan the snapshot does not hold
  printed as before. The ledger [6.5], CHARACTER, PARTY, clocks, tracks,
  recent oracles and STORY SO FAR are unchanged. The rules name none of the
  sections one layout lacks — the sidecar's identity anchor is for "a
  character or faction who has no card of their own in this prompt", the
  third-person pronouns are "in the CHARACTER and PARTY sections and on their
  card", DISCOVERY's reuse is of "the people and places recorded for the
  active sector", the inciting incident's of an NPC "recorded for the
  sector" — so the standing and mode blocks
  read true, and are the same bytes, with a snapshot or without (issue #362
  AC66: they named ENTITIES IN SCENE and ACTIVE SECTOR).
- **A new snapshot is taken** at a narrator call when an event reported since
  the last one takes a snapshot, or the store finds none for the session, a
  record gone, the changes past 2,000 tokens or a quarter of the snapshot, or
  no request for an hour (the session's newest narrator card stands in for
  this client's memory after a reload). `snapshotEvents.js` `SNAPSHOT_EVENTS`
  is the one list; every trigger site reports its event by id
  (`reportSnapshotEvent`) and the table decides. The world setting
  `worldSnapshotEvents` holds one opaque mark and its time — never which
  event set it (issue #362 D3: named marks told a player at the console a
  hidden plan was just made or decided) — so any GM's client reports and the
  narrating GM reads it; the ids stay on the reporting client (its pending
  marks, and the snapshot page's log — `namedSnapshotCauses`, which names
  the events after the replaced snapshot's own cut when this client took it
  (`markSnapshotTaken`, by order, not by the clock — issue #364
  SNAPSHOT-EVENT-SAME-MS); another GM's mark logs as `out_of_date`). Several between two calls take one snapshot,
  and the mark it answered is cleared with it; an event reported while a mark
  stands writes nothing (the next snapshot covers it), and one reported once
  the mark is answered writes a newer one.

  | Event | Snapshot | Reported by |
  |---|---|---|
  | `session_begin` | yes | `applyBeginSession` |
  | `no_snapshot` | yes | the store, at the call |
  | `scene_started`, `scene_ended` | yes | `handleSceneCommand` (`!scene`) |
  | `plan_made` | yes | `secrets.js` `createSkeleton` |
  | `plan_decided`, `plan_revealed`, `plan_resolved` | yes | `applyPlanSideData`; the GM's Reveal now; `closePlansAbout` (a track completed, a vow closed — issue #362 D4) |
  | `discovery_rolled`, `new_enemy_revealed` | yes | `reportNarratedMove` / `reportNarratedOracle`, once the narration has posted |
  | `sector_created`, `sector_details_written` | yes | `storeSector`, `applyStubsToSettlementEntities` |
  | `entity_recorded` | yes | `registry.js` `registerEntityId` |
  | `threat_recorded` | yes | `routeWorldJournalResults` (significant salience or above) |
  | `xcard_played`, `fact_retracted` | yes | `suppressScene`, `propagateRetraction` |
  | `plan_edited`, `plan_retired` | yes | `editSkeleton`, `retireSkeleton`; `closePlansAbout` (a track removed, a vow deleted), `retireSceneMysteries` (an ended scene's unanswered mysteries) — issue #362 D4 |
  | `entity_detail_removed` | yes | `entityPanel.js` `applyEntityEditFromRelay` — the Entities panel's Remove of a narrator-added detail, a rewrite that takes content back (issue #362 AC65); `registry.js` `registerSheetNotesRemovalHook` — a paragraph deleted or reworded on an NPC card's or ship's Notes tab (their notes, X12): every client compares the notes with its own edit in `preUpdateActor` and stamps the update's options, and the canonical GM reports when the stamped `updateActor` lands (issue #364 SNAPSHOT-NOTES-TAB-DELETE) |
  | `record_removed`, `changes_large`, `cache_expired` | yes | the store, at the call |
  | `oracle_seed_envisioned`, `oracle_yes_no`, `oracle_table_rolled`, `price_paid`, `plan_progressed`, `sector_switched` | no | their sites — rows, so one can be switched on |

- **Pre-warm** (`prewarmNarratorCache`): Begin a Session with no opening
  narration sends the standing block and the snapshot with `max_tokens: 0`,
  built as a narration's request is.
- **Off** (world setting `worldSnapshot`): no snapshot is taken or sent, no
  event is marked, and the request is the three blocks above.

Sections: [0] role/style per mode (the role in `this narration`, the voice
rules in `standing`) · [0b]
campaign recap (a session's first narration in any prose mode, from
`campaignRecapCache` while it matches its source — issue #286 C3, #301
B04, #382; only for a session with one before it — the record holds an
earlier session with a beat, or one from before the record, or the session
is numbered past the first: a campaign's first session is given no recap of
its own Begin beats, known-issues RECAP-AT-THE-FIRST-BEGIN; the session-start
recap — `sessionStart`: the session under way left out of its source, so the
last session before it is the one given in full) · [1] safety (the stored Lines / Veils / Private Lines — issue #321
U08) · **[1b] X-Card redirect** (prose modes, until the first narration after
a GM resumes has posted — issue #321 U07, above) · [2] permission-class latitude · [2.5]
Battle Stations · **[2.6] THE VOW THIS SCENE SERVES** (issue #353 R3 — the
beat modes only: move, paced, round, @scene, oracle follow-up;
`buildNarratorExtras` → `extras.sceneVow`, `session/openThreads.js`
`readSceneVow` over every PC's vows (actorBridge), the open tracks [4j] reads
and the session's focus [4i]: an open track's linked vow — a fight, then a
scene challenge, then an expedition; a `linkedVowId` names the vow whatever
it is called now — else a quest focus naming one open vow, else the only
quest in play, else the only open vow; nothing else is guessed. The vow, its
rank, progress and holders and why it is the scene's, and one instruction:
show what a beat achieves toward it, never its track, progress or a
milestone — `formatSceneVowBlock`; `vow-flow.md` §3) · [3] oracle seeds (move-provided only; a routed Pay the
Price is the one its card rolled — `withPayThePriceSeed`, issue #321 U03; the
"envision" outcomes roll theirs once in `buildOracleSeeds` — Gather
Information's Story Clue / Story Complication, a Compel weak hit's Action +
Theme counteroffer, an Undertake an Expedition hit's region Space Sighting,
and a price that reveals a new enemy its Character Role + Goal + Disposition,
`priceSeedLines` — issue #353 Phase 0; an outcome a Burn Momentum or Improve
Result reached rolls its own, with the price it keeps — `upgradedOracleSeeds`,
issue #362 AC05) · **[3b] recent
oracle results** (`campaignState.recentOracles`, read from the store — raw `!oracle` (incl.
`!oracle <tableId>` and custom-table rolls) / `!ptp` outcomes, and the at-0
choice card's mortal-wound / desolation roll — the table's one roll, no move
seeds it (issue #336 Y21) — last 5 this session, "the dice established
these"; skipped for meta modes) · [4] world
truths (`campaignState.worldTruths` — the Quickstart's rolled truths or the
World Truths dialog's newest save, parsed from its "Setting Truths" page as
it is linked, and again on each edit of that page — the linked journal by its
id, renamed or not, and kept at load unless a save found by title is newer
(issue #342 Z16) (issue #337 Y39 — the
Quickstart's own journal page is a printout of its flag, not re-read, and
`!lore` summarises the flag, not the printout: known-issues
LORE-READS-QUICKSTART-PRINTOUT), so the block, the vow scene's Iron truth
and `!lore` read one
save: issue #322 V34; each truth's rolled sub-table detail after its title —
who the war was against — as the journal prints it, issue #321 U66) · [4a] campaign truths digest · [4b] campaign premise
(`campaignState.incitingIncident` — durable canon, every call) · [4c] LAST
SESSION (the session record's — `lifecycle.lastSessionToTell`, issue #382;
issue #286 C3), then the session summary (STORY SO FAR — the current
session's summary view), each prefixed with a **ledger-wins caveat** — a
summary is texture, not a fact store · **[4d] active threats · [4e]
faction landscape · [4f] established lore** (chosen per turn since issue
#286 C2 — `selectLoreForContext`: up to 5 confirmed lore / recorded-location
entries sharing the most words with the player text, the frame and the
entities in play, then the most recent, 8 in all; it was the 5 most recent)
(World Journal state — rode the
dead assembler packet until 2026-07; see `faction-flow.md`) · **[4h] clocks**
(`campaignState.clocks`, active campaign / tension clocks, read from the
store — issue #286 C5) · **[4i] the table's focus this session** (the End
Session foci, kept as `sessionFocus` at Begin Session — C5) · **[4j] open
progress tracks** (the open fights, expeditions and scene challenges in the
Progress Tracks journal, `listOpenProgressTracks` — a fight with its
objective, position and linked vow, at most six; skipped for the recap.
Issue #290: only the retired assembler had rendered them, TRACKS-UNPORTED;
an expedition or a scene challenge linked to a vow, issue #353 R3, says it
serves the vow — "seeing it through is a step toward" it, a fight's win "a
milestone on" it)
· [5] current location card · [5b]
active-sector anchor (each settlement with its planet and stellar object, as
its card shows them — `formatSettlementPlanet`, issue #321 U51; the sector's
connections as reuse-first cast, and a lost one apart, its line saying how it
was lost — issue #325 W37) · [6] matched entity cards (a connection's card also
shows its goal, a lost or forged bond and its last three `history` events —
C5) · **[6.4] NAMES THE TABLE CHANGED** (issue #377 item 1: the changes on
`campaignState.nameChanges` — a GM's rename of a card, a table's correction of a
name by `!truth` strike + set or a Replace (`factContinuity/nameChanges.js`) —
each told while it is this session's or while its old name, whole, the part
the new one does not share, or cut short to one word of it used on its own
("the Wake" for the Ashen Wake), is in what the call sends: the cached blocks,
the context, a recap's Chronicle (`extras.nameChangeTexts`) — never as part
of a name as it stands now: "Tamsin Okoro" holds no "Tamsin" (known-issues
NEW-NAME-WRITTEN-TWICE). Every mode, the
recap's included; per-beat. Its line names each such short form the call's text
uses and what to write for it — never a word the new name keeps or another
name in play holds (known-issues CORRECTED-NAME-SHORT-FORM;
`narrator-consistency-flow.md` §2). It says the old name is no alias, and that the change is
the table's correction, not something that happened in the story (the long
haul's second run made it a story of a crossed-out name — known-issues
NAME-CHANGE-TOLD-AS-A-STORY). Nothing in the stores is rewritten — the note is what says
which name is current; the session summary's source is the session record's read, which writes
every changed name as the new one (issue #382 slice 3); and every change a call's user message names —
a player's line, the recent scene, a bookend's EARLIER list, the opening's
last narration quoted word for word — that this note does not tell, or whose
short form there its line does not name, is added at that message's end,
`narrator.js callNarratorAPI` → `withNameChangesNoted` (known-issues
NAME-NOTE-MISSES-THE-USER-MESSAGE: it added nothing once this note was
there at all)) · [6.5] active-scene ledger
(SCENE FRAME — with the scene's question, shown while it stands, marked
when answered (issue #353 R2), released when play has left it unanswered for
`SCENE_QUESTION_BEATS` beats, and — with none — a line asking this beat for
the one the scene turns on now, from the player's latest line
(`askSceneQuestion`; never in a vignette's, an `@scene` answer's or the
recap's prompt — known-issues NARRATOR-REFRAINS) → TRUTHS → **CORRECTED** → STATE → SHIP POSITION;
`maxLedgerTokens` sheds state only, line by line with location / vessel /
condition last — frame/truths/corrections/ship are
never dropped) · **[6.6] UNREVEALED** (the narrative skeleton, issue #353:
`buildNarratorExtras` → `extras.unrevealed`, the active plans of the GM-only
Secrets journal whose subject is in play — made in this scene, its entity
matched or in the frame's cast, its name in the frame or the player's line,
`skeletons.js` `selectRelevantSkeletons` — an immediate World Journal threat's
plan every beat, Phase 2; an open expedition's plan, a finished one's in the
narration that finishes it, and the plan a clock vignette or a chosen
complication plays, Phase 3 — a vignette of a plan's own clock has its plan
in play whether the clock filled or only advanced (a step is played on a fill
alone, issue #362 AC38) — and a plan the end of its subject resolved in the
beat that ends it (`skeletons.planInPlay` by `endingTrackIds`: the code
closes an expedition's plan with its track, a vow's with its vow, and an
ended scene's unanswered mysteries with their clocks — `closePlansAbout`,
`retireSceneMysteries`, issue #362 D4); the plan of the vow the scene serves
(`extras.sceneVow`, R3), and a vow's in the Fulfill Your Vow that scores it
(its `vowId` on `endingTrackIds`), Phase 4 — for that plan the block adds
THIS BEAT ENDS A VOW (`extras.endingTrackIds` → `formatUnrevealedBlock`'s
`endingSubjectIds`): the standing rule "Never state one outright" is lifted
for it, its truth is stated in the prose, and nothing the truth does not hold
is claimed (known-issues VOW-FULFILLED-WITH-NOBODY-NAMED; `vow-flow.md` §3) —
at most four, trimmed to `UNREVEALED_MAX_TOKENS` — and `extras.planRequests`,
the plans this narration's seeds ask it to decide: a price that revealed a
new enemy, an expedition begun, a Make a Discovery's or Confront Chaos's find,
a vow's swearing scene (Phase 4) — each with its one re-roll (`reroll`, for
a result that contradicts the story; decisions.md "one re-roll"). Every
request rides with the narration (up to `PLAN_REQUESTS_PER_NARRATION`); it is
asked to decide the first four, all one sidecar answers
(`extras.decideNowRequests`), and the rest — a Batch Mode round's entries can
bring more — are filed with their rolls alone by the same apply
(`applyPlanSideData`), for the next narration they are in play for (issue #364
ROUND-PLAN-REQUEST-CAP: the fifth onward was dropped, unfiled). Decided plans read
as truths never to state outright, with the reveal rule; undecided ones and the
asked requests list under DECIDE NOW with their oracle rolls, only when the sidecar
is on; every prose mode, never a meta one; `formatUnrevealedBlock`. Outside
the prompt, the plans are read by one player-facing surface: the Session
panel's What's open — a mystery's question while its truth is hidden, a
revealed threat's or NPC agenda's subject and wants, no other field;
`ui/sessionPanel.js`, issue #353 R4) · ([7], a legacy count of `connectionIds` that counted a
lost connection as active, is retired — issue #331 X29) · [8]
CHARACTER STATE (vows and bonds with progress and their rank by name — issue
#321 U62 — granted rewards — C5 — and the PC's newest five pinned Chronicle
entries, each clipped, `extras.pinnedChronicle`: the Chronicle panel's pin
was saved onto a flag nothing read, issue #345 AA07) · [8b]
party roster · [8c] spotlight nudge · **[8d] THIS BEAT'S PROSE** (issue #354
P2-21, P2-22, P2-27 — the move, paced and round modes only; its shape is
said as the narrator's instruction about the narration, under `BEAT_SHAPE_LABEL`,
never as a director's "Open on…", which came back as prose — issue #377 item 2:
`buildNarratorExtras` → `beatVariety` reads the session's narrator cards, the
ring's own source, and sets `extras.beatShape` — a way to build the beat,
the one after the newest written beat's so two in a row never share one.
Each beat's card carries the shape it was written in (`beatShape`, stamped by
`postNarrationCard` / `postRoundNarrationCard` / `postPacedNarrativeCard`),
and `lastBeatShapeId` reads it from the chat as it was (`chatAsItWas` — a
beat card a GM deleted, or a Clear Chat Log took, is still the beat before;
the canonical GM's stored record of a deleted card keeps the stamp across a
reload): the count of beat cards alone gave the next beat the last one's
shape once an earlier card was deleted (issue #364
BEAT-SHAPE-AFTER-DELETED-CARD). A session with no stamped card — its first
beat, or cards from before the stamp — is shaped by the count of its beat
cards (a move's, a paced line's, a round's — `isSessionBeatCard`), struck,
X-Carded and unnarrated ones included, never the @scene answers, oracle
follow-ups or vignettes between them, which brought the cycle round to the
same shape (issue #362 AC72). A card is posted only once its narration is
written, so two beats narrated at the same moment read the same last card:
each of the three narrations that post a beat's card (`narrateResolution`,
`narrateRound`, `narratePacedInput`) runs under a claim on its shape
(`narrateWithBeatClaim` → `opts.beatClaim` → `beatVariety`), held in memory
on the narrating client while it is written and released in a `finally`,
and `beatVariety` steps past the shapes claimed at that moment
(`shapeNotBeingWritten`). No store: with no narration in flight the shape is
read from the cards alone (issue #364 BEAT-SHAPE-SIMULTANEOUS) — and `extras.usedImages`, the comparisons the last six cards made,
listed as images not to reuse; with them the levity permission, said again
where the outcome is. `proseVariety.js`, `formatBeatProseBlock`) · [9] sidecar
instruction (in `standing`; includes the record-anchors-once and
never-re-assert-CORRECTED rules) · **[9b] RESPOND NOW** (last in the context:
the pointer back to [9], naming none of its keys) · [10] audio markup (in
`standing`).

**Length** (issue #354 P2-20): the Length setting is a word budget with a
sentence cap, in short sentences (`proseVariety.js` `lengthBudget` — 22 words
a step, 28 at most, 1.5 sentences a step, no sentence over about 30 words, 18
with audio narration on). It is stated in `this narration` and again in the
move, paced and round user messages, which used to say "in N sentences".

**Relevance** (`src/context/relevanceResolver.js`): Phase 1 is a lexical name
index (full name + first/last word of multi-word names, lowercased,
dismissed-list filtered — a name a record takes by a rename comes off that
list, issue #345 AA55; since issue #286 a name part is never an article,
title or other noise word, never a word two entities share, and never
shadows another entity's full name; a one-word key — a name part, or a name
of one word — is a hit only written as a name, capitalised as typed or in
address position, `namesOneWordName`, issue #362 D6: "an echo on the scanner"
brought in Echo Vega); Phase 2 (Haiku) fires only for hybrid *moves*.
Paced/@scene union the scene frame's `present` names into the match text; the
move path's relevance call deliberately does not (architecture §8.2,
reaffirmed 2026-07). Since issue #286 (B3) every path then adds the frame's
recorded cast to the matched set (`addSceneFrameCast`, `buildNarratorExtras`
— `resolveEntityName` per present name): their cards, ledger scope, the
consistency check's context and the narrator card's `matchedEntityIds`. The
permission class and the move's tier pass still follow the relevance call. A
match miss means no entity card for that entity.

**Recent prose.** The user message of paced, oracle follow-up and @scene
calls carries the ring (`getRecentNarrationContext`); since issue #286 (B1)
move narration does too — the last 4 entries (`MOVE_RING_CARDS`, bounded by
`narratorContextCards`). The move interpreter and the pacing classifier read
it as well — the last 3 entries, the newest 2,400 characters
(`getRecentSceneForReading`, passed by `movePipeline.readMove` and
`router.decidePacing`) — so a line is read with the scene it follows (alpha 23
playtest). Both are told the speaker's **situation**, in one block built once
(`moves/situation.js buildSituationBlock` — the classifier's CHARACTER
section, `buildContextSummary` for the interpreter): the sheet's health,
spirit and supply, each beside the impact its recovery move clears (wounded,
shaken, unprepared — `readCharacterSnapshot`); the command vehicle's
integrity and whether it is battered (`entities/ship.js getCommandVehicle`:
the STARSHIP asset's track, the starship's native impact); each open vow
with its rank, its progress in boxes and the connection it is sworn to
(`readVows`, its `linkedConnectionName`); each live connection with its rank
and relationship track — "full, no bond forged yet" or "bonded"
(`readConnections`). The same words to both, so the two cannot be told
different things of one sheet; a speaker with no character of their own is
told as "no character sheet is known". Until the long haul's third live run
neither was told a meter and the classifier was told no vow: Heal was offered
and rolled at 5 health of 5, and a step toward a vow said in the fiction was
narrated with nothing offered (known-issues HEAL-ROLLED-AT-FULL-HEALTH,
VOW-STEP-SAID-IN-FICTION-NOT-READ). The interpreter is also told who is
speaking (`buildContextSummary`'s speaker line, in the narrator's words), the
other characters' open vows by name at a table of several, the open progress
tracks, the roller's support vehicles and companions, and what the classifier
made of the line
(`readMove`'s `classifier` → a PACING READ hint — only for a MOVE decision the
classifier made, `router.classifierReadingOf`: never for pacing switched off,
a `!roll`, the classifier's fallback for a failed call or an unreadable reply,
or a router that failed, which carry a placeholder scene kind and a status
string — issue #362 AC64), and may answer that no move
is being made: that line — or a low-confidence reading outside a fight — is
narrated as a paced line, the move it might be offered on its card
(`index.js` `narrateLineWithoutMove`; issue #354 P2-01, P2-02, P2-06) —
never when a roll was asked for or pacing is switched off, in free-flow or
a Batch Mode round's reading (`movePipeline.readAction`, issue #362 AC68).
Each entry leads with the player's line that
prompted it (`PLAYER — <name> wrote: "…"`, B5): move and paced cards store
`playerText` + `playerName`, @scene answers `sceneQuestion` + `playerName`. A
paced line from a player with no character of their own at a table of several
is narrated with no character — no CHARACTER block, no speaker, `playerName`
null ("Player") — never as the campaign's first PC (issue #342 Z50); so are
their `@scene` question and their `!oracle` follow-up, whose captures carry no
PC either (issue #345 AA30 — `interrogateScene` and `narrateOracleFollowup`
took `getActiveCharacter`'s first-PC fallback).
The session summary reads the session record (issue #382 slice 3 —
`summaryView.js` `summarySource`): each beat's facts, the player's own words
among them, and TOLD AS its narration; a beat that changed something for good
— a vow sworn, fulfilled or forsaken, an expedition finished, a fight decided —
is marked LASTING (read.js, `chronicleKeeps.lastingChangeOf`). Its prompt says
every LASTING beat is told and nothing found only in TOLD AS is an event: the
prose of a vow's fulfilment said "the weight of the vow lifts off you", one passage of
twenty-three, and that session's summary left the fulfilment out (the long
haul's third live run, a76). Both read the session's cards through
`sessionNarratorCards`, which leaves out a "narration unavailable" card
(`narrationFallback` — it keeps the flag family, kept so the session recap
counted the move before that card read the session record, where the move is
its roll's (issue #382 slice 5); it was fed back as story and counted as the
session's first narration, cancelling the campaign recap; issue #321 U35) and a card the
X-Card removed (`xCarded`, U07). Its regen runs after a narrator card posts, on
the canonical GM (`registerRollingSummaryRefreshHook`, B7) — at a table whose
GMs hold no Claude key, on the keyed client that wrote the card, which relays
the summary to the canonical GM to store (`narrator.summary` →
`applyRelayedSessionSummary`: this session's, covering more than the stored
one, none of its narrations X-Carded since — SUMMARY-KEYLESS-GM); prompts read
the cached text.

**What a typed line is read as** (decisions.md → "A player is never made to
name a move"). Both readers run on Sonnet 5.5, thinking off (their own
constants; `api-proxy.js` sends the model's form). The classifier's rules hold
one block for what narration can never do — WHAT ONLY A MOVE CHANGES IS ALWAYS
OFFERED: a line that sets about it is never plain NARRATIVE, at any dial, but
at least NARRATIVE_WITH_MOVE_AVAILABLE with the move on the card's Roll. It
names recovery (heal, resupply, repair, hearten, sojourn — issue #377 item 3),
a step toward one of the speaker's open vows said in the fiction
(reach_a_milestone — `vow-flow.md` §2 has the hops to the vow's track) and
something done for one of the speaker's connections — a gift of value, a risk
taken for them, a favour that costs time or standing, bringing them what they
need (develop_your_relationship — `connection-flow.md` §2; small talk, news
traded and plain questions stay narration). The
interpreter's rules 7 and 10 say the same of a line it is handed. What the
classifier reads the line against is the SITUATION above.

The block's one exception is **a recovery move with nothing to recover**
(known-issues HEAL-ROLLED-AT-FULL-HEALTH — a Heal offered, pressed and rolled
at 5 health of 5, "0 health (now 5)" for 2 supply, twice in live play): heal
with health full and not wounded, hearten with spirit full and not shaken,
resupply with supply full and not unprepared, repair with the command
vehicle's integrity full and it not battered are plain NARRATIVE with nothing
offered, and the interpreter's rule 10 answers NO MOVE for them — each unless
the line is plainly about something the meters do not show (care for an ally
or a companion; one particular item; a support vehicle, a module, a companion
or a device).

**What the sheet settles, the move gate decides** (overhaul 4, "moves as
contracts"). Every move has a row (`moves/contracts/table.js`
`MOVE_CONTRACTS`: its trigger, its target, its preconditions —
`moves/contracts/predicates.js`), and one gate (`moves/contracts/gate.js`
`checkMove`) runs them over the situation read live
(`moves/situation.js readMoveSituation`: the roller's sheet, the other PCs,
the recorded people, the open tracks, the scene's site), where a move is
offered and where it is made — the roll is the authority:
- `router.decidePacing` asks it of the classifier's MOVE or offer: a move that
  cannot be made — a recovery move with nothing to recover (`RECOVERABLE`,
  `PARTY_HAS_SOMETHING_TO_RECOVER`), a social move spoken to a fellow player
  character (`NOT_AT_A_PC`), a combat move with no fight (`OPEN_FIGHT`), a
  connection's move with someone who is no connection of the speaker's
  (`THEIR_CONNECTION`) — is NARRATIVE, or an offer of the move the refusal
  names (Enter the Fray for a Strike with no fight; Make a Connection for a
  Develop with a stranger); its reasoning says why (`[cannot be made: <code>
  — <why>]`, in the Pacing Telemetry journal), and the decision carries the
  refusal to the narration (`refused` → `narratePacedInput`'s `refusal`);
- `movePipeline.readMove` asks it of the line's reading: a typed line whose
  move cannot be made is narrated as a paced line, told why (`noMove.refused`
  → `index.js narrateLineWithoutMove`), and nothing the gate refuses is offered
  on that card; a forced move's or an asked-for roll's hard refusal is not
  rolled (`refused` → the not-rolled notice, "No Strike — no fight is under
  way. Nothing was rolled.", flag `cannotMake`), and a soft one goes to the
  confirm dialog with the sheet's words (`interpretation.softRefusal`), whose
  Accept rolls it at the GM's word;
- `rollAndApply` asks it again before the dice (the forced moves, a card's
  button, a Batch Mode round's entry — `driver.refusalFor` at resolution):
  refused, nothing is rolled and the notice says why — a soft refusal of a
  forced move with a **Roll anyway (GM)** button (`notRolled.rollAnyway` →
  `cardActions.applyNotRolledRollAnyway`, the move re-posted with
  `gateOverride`); rolled at the GM's word, the move card says "⚖ rolled at
  the GM's word: …" and its narration is told so (`resolution.gateNote`).
A hard refusal (nothing for the move to act on — no fight, no vow, no
connection) is never overridden; a soft one (the sheet says the move would
change nothing) is told on a typed line and rolled at a GM's word on a
pressed one. Soft ones are not applied in a fight — there the dice decide —
and the ones the sheet cannot see whole (Resupply's one particular item,
Repair's device: `readerSettled`) only where no reader read the line as the
move. An unknown is never a refusal: a meter or a list not read holds. Sojourn
is held to the party as a whole, not one meter.

**A cost chosen after its narration is told by the next beat** (overhaul 4,
slice 5; D10 — CHOSEN-COST-NEVER-TOLD: two Endure Stress costs chosen after
the roll's narration were never told). The pick stamps its choice card
`pickedAfterNarration` when its result's narration card is on the table
(`sufferCard.js`); the next narration that is a beat of play — a move's, a
paced line's, a round's — carries TELL [chosen-since] for each such pick no
narration has told (`obligations.choicesChosenSince`, any roller's, never
its own result's), and once its card posts the canonical GM stamps the
card `toldBy` (`markChosenCostsTold`) — told once; a refused stamp is told
again, a player's own key cannot stamp, an X-Carded card is not carried.

**The narration is checked against its block before it posts** (overhaul 4,
slice 4 — `moves/contracts/checks.js`, D9): `narrateKeepingObligations`
wraps every beat's narrator call — the move's (`narrateResolution` — so a
held result's and an upgrade's re-narration too), the paced line's
(`narratePacedInput`), the round's (`narrateRound` — every entry's block and
the round's own, `roundObligationsFor`) and the oracle follow-up's
(`narrateOracleFollowup` — its answer's TELL / NOT SO [oracle],
`oracleObligationsFor`), each rate-limit retry too. For the scripted
playthroughs' strict replay (a call's kind is the two named module frames
above apiPost) the harness looks through the check and a local `ask`
(`lib/claude.mjs` `PASS_THROUGH`), so the narration and its re-ask keep the
narrator function's kind (`callNarratorAPI>narrateRound`, …) and the judge is
`judgeNarration>` the narration it judges; the round's and the oracle's call
is a named `ask` (an inline arrow takes a name V8 infers from the statement
around it). `first-session.json` / `batch-round.json` declare each narrating
step's own kind optional, for a re-ask. A re-ask that throws keeps the first
draft.
The reply's prose is read (`sidecarParser.extractSidecar`, before any fact
block is applied) and held to its lines by class: **certain** —
[apparatus] (an outcome's name, a sheet number, a two-word move's name
outside the closing offer line) and [match] (the word); **floor** — [vow]
(a word of the vow's name, or what is still not known) and [chosen]
(logged); **tripwire → judge** — a NOT YET / NOT SO line whose words appear
in the prose ([premise] by its refusal's code — "starts on the cuts" under
a refused Heal; [fight] — "your first salvo"; [cost], [price], [offer],
[oracle], [state]) sends one Haiku call (`api-proxy.js`, label
`obligationJudge`, 4 s, fail-open; only on a GM, with fact continuity's
consistency check on). A failure is asked once more — the same prompt plus
YOUR DRAFT — NOT POSTED and the line it broke (labels
`narrateResolution:reask`, `narratePacedInput:reask`, `narrateRound:reask`,
`narrateOracleFollowup:reask`); the second reply is
held to the certain checks only and posted whatever it says. At most one
judge call and one re-ask a narration. Each verdict is a row on the
Consistency Check telemetry page (`kind: "obligation"`, mode `move` /
`paced` / `round` / `oracle`). The lines the check does not hold a narration
to ([outcome], [stakes], [sheet], …) go to the post-narration audit with it
(`applyNarratorSidecar` ctx `obligations` → `runConsistencyCheck`, kind
`obligation`).

**The refusal is told** — in the user message, never the system prompt
(`rules/narrator-memory.md` invariant 7b): the paced message ends with a
**WHAT THIS NARRATION MUST TELL, AND MUST NOT** block
(`moves/contracts/obligations.js` `obligationsFor` /
`formatObligationsBlock`) before its instruction — NOT SO `[premise]`: what
the line took for granted is not so, with the refusal's reason ("A fight under
way is not so — no fight is under way. The line sets about it: narrate the
attempt meeting the facts, never the premise as real: never a blow struck, a
shot fired or a foe engaged in a fight."); NOT YET `[offer]`: the move offered
is only offered (SUGGESTED MOVE's "It has not been made…" half, moved here);
NOT SO `[sheet]`: no sheet changes in narration (the instruction's "Nor does
anything…" sentence, moved here — for a refused line, "No move was rolled for
this line, and none will be"); NOT SO `[apparatus]`: no dice, no sheet number,
no outcome's or move's name. A move rolled at the GM's word carries TELL
`[overridden]` in its move message; a
round's entry refused at the roll carries its `[premise]` block in the
round's message (`####`, under the entry). The paced card says it too
(`<p class="sf-cannot-make">`, flag `cannotMake` — the runner's check reads
it), and a round's window shows the refused entry's note
(`roundView.cannotMake`).

**Across sessions** (issue #286 C3, C4, `src/session/lifecycle.js`). The ring,
the rolling summary and recent oracles are scoped to `currentSessionId`. A
session is over once End a Session marks it (`sessionEndedId`) or after four
hours with no chat message — measured from the later of the mint's
`lastSessionTimestamp` and the session's activity stamp, which the canonical GM
refreshes on chat activity, at most every 10 minutes, and never for a session
already over (`registerSessionActivityHook`). The stamp is its own world setting
(`sessionActivity`, `{ sessionId, at }`), never a campaignState write: built
from the GM's cache while a relayed X-Card's, flag's or End a Session's write
was still in flight, it carried the old campaignState back over it (issue #342
Z01). The next world load (`initSessionId`,
ready hook) or Begin a Session, whichever comes first, runs `rollSessionIfDue`:
every result still held for Burn / Improve / Keep is kept first — paid and
narrated under the closing session's id, as End a Session does, which a
session over by idleness never got (`keepEveryHeldResult`; the mint's working
copy then takes the store's value for each field the keep changed — issue
#364 HELD-RESULT-IDLE-SESSION) —
the closing session's summary is brought up to date from its record (issue
#382 slice 3: `getRollingSessionSummary`, forced, for a begun session; no call
when it tells every beat — End's closing vignette is a cutaway, no beat): End
a Session makes its own, but that call can fail, and a Batch Mode round
resolving at End or a move narrated while End runs lands in the ended session
after it (issue #345 AA21) — a scene left open closes under its own id, and
`mintSession` carries nothing of a summary. LAST SESSION is read from the
session record (`lifecycle.js` `lastSessionToTell` → `summaryView.js`
`lastSessionStory`): the newest earlier begun session's summary view while it
stands — a correction since (an X-Card after End, a strike, a changed name)
makes it stale: not told until made again (issue #342 Z41, #345 AA57) — else
the story its page held before slice 3, followed, as facts, by what was
played in any session nobody began since (issue #331 X65). A summary owed — a
session closed on a browser with no key, a call that failed, a round narrated
after its session closed (issue #347 AB15, #364 LATE-ROUND-*) — is not a mark:
the record says it is owed (`summariesOwed`), and the keyed canonical GM makes
it again after each narrator card, at the load and when its key is set
(`refreshStaleSummaries`); the Session Log page's "Session summary" is that
view, re-rendered when it is stored — a session nobody began (no Begin stamped it, its gate shut, End a Session did not close
it) hands its number on (issue #330 D12; one End a Session closed counts as
begun, issue #331 X64) and adds its summary to the one before it, which stays
LAST SESSION under its own number (it replaced it — issue #331 X65), a LAST
SESSION still owed its summary (its mark names it) even with no text of its
own, so it keeps its place and its mark (issue #364
EMPTIED-LAST-SESSION-PREP-ONLY-MINT) — mints
the next id and closes the session-active gate (`sessionActive` / `sessionActiveStartedAt`
joined `SESSION_MINT_FIELDS`): the new session is begun by Begin a Session —
a session nobody ended handed its open gate to the next, so Begin did nothing
(issue #321 U12). Until a load's mint lands the stored session reads live
(gate open, id current), so the canonical GM notes it at `ready`
(`noteSessionBeingReplaced`) and it is over at once — no Batch Mode round
reads, resolves or opens in it (issue #342 Z24), and the chat gate tells a
line's author no session has begun: narrated, it went into the closing
session after its summary was taken, under its old id (issue #345 AA58).
`rollSessionIfDue` notes it too, so Begin a Session's own mint has the same
rule (BEGIN-MINT-LINE-WINDOW); and mints run one at a time on a client
(`serialiseSessionMint`), so a Begin landing during the load's summary call
begins the session the load minted (SESSION-MINT-RACE).
Begin a Session's start effects (Spotlight momentum, campaign clocks, the
galley vignette) run once per session id: `applyBeginSession` stamps
`sessionStartedId`, and a second Begin on that session posts a note instead
(the dialog does not open for it) — issue #300 F11. Begin works on a copy of
the stored value, so a refused save leaves the GM's cache unbegun and a retry
starts the session (issue #309 N09) — and the table is told: the GM posts "The
session was not started … No momentum was applied … Try Begin a Session
again" where the Begin card is (issue #329 X13). End a Session's effects (scene close,
summary, the focus momentum, the closing vignette) run once per
session id too: `applyEndSession` runs one End at a time on the canonical GM,
and an End on a session already ended only replaces the focus for next
session and posts a note — its momentum is paid for the first focus noted,
once (issue #309 N08). What carries over to the new session's prompts: LAST SESSION ([4c], every
prose mode), the campaign recap ([0b], the session's first narration — no
narrator card of the session yet, and a session before it (`recapSource`'s
`before`, or a session number past the first), a reflection published from the Private
Channel aside: it is canon, not a narration, and published first it took the
narration's recap (issue #345 AA32) — read from its cache, which End a Session
and a new session's world load refresh), entity cards with their tiers and
LAST KNOWN, established lore and the campaign premise. The recap cache stores
the hash of the source it was made from (`sourceHash` — `campaignRecapCacheKey`,
issue #382; it was the Chronicle's text, issue #301 B04); `getCampaignRecap`
and the session-opening read use it only while that still matches, so a
correction anywhere in the record, or a change to where things stand, makes it
again, and with no key to regenerate there is no recap rather than a stale
one. With nothing to retell — no beat on the record, no player's note, no
session from before the record — there is no recap at all.

**What a recap is told** (known-issues RECAP-STATES-WHAT-DID-NOT-HAPPEN — the
long haul's third live run's four recaps held fourteen sentences the story
does not support; issue #382 slice 2 — docs/flows/session-record-flow.md). Its
source is the session record (`record/recapView.js`, read through
`readRecord` with the table's corrections), in the user message
(`buildCampaignRecapUserMessage`): THE RECORD — each session's turning points
(its lasting beats: a move's lasting change, `chronicleKeeps.lastingChangeOf`,
or what play did — a vow sworn, fulfilled or forsaken, a bond forged, an
arrival…) and the latest session in full, each beat a line with an id: who
acted and the words their player wrote, the move and its outcome, what changed
on a sheet, what play did, what was established and stands, and what the table
struck. Facts only — no narration (decision D4). Which session is the latest
depends on who asks: End a Session's, `!recap`'s and its Refresh's recap tell
the session under way in full; the recap a session's start is told — the
session's first narration (`sessionStartRecap`) and the world load's "Previously
On" with its cache refresh (`getCampaignRecap(…, { sessionStart: true })`) —
leaves the session under way out, so the session just played is the one in
full. Its own first beats (Begin's vow, a clock, the spotlight's momentum)
were "the latest session", and the session just played was cut to its
turning points: its lines of play, a sister's compass or a promise made at
the dock among them, reached no session's opening. End's recap, made while
the session it ends is under way, is the same source, so its cache opens the
next session when nothing else has changed. Then WHERE THINGS STAND, read
live from the sheets and tracks (`standingLines`: each PC's meters and impacts,
the vows and their progress, the connections, the open tracks, the current
place, the open scene's state and its question, answered or not); THE PLAYERS'
OWN NOTES (their Chronicle entries — written, edited or pinned by a player);
and EARLIER SESSIONS, a session from before the record as its Session Log story
and Chronicle entries had it, labelled. The role says a recap says only what
its sources say: nothing inferred, nothing filled in between two lines (a beat
may be missing because the table took it out), what a player wrote is the
character's claim, whose things are whose, how a thing stands is WHERE THINGS
STAND's word, one name for everyone — and what happened is told, never the
dice or the numbers: "strong hit", "weak hit", "miss" and "match" never as
such, no number from a sheet or a track, a rank as how hard a vow, a tie or a
fight is, never a word for someone (`RECAP_SOURCES_RULE`, the move
narration's outcome-word rule worded for a recap; its user message ends on
it — known-issues RECAP-TELLS-THE-DICE: 13 of the fourth live run's 64 recap
sentences named an outcome; the record's lines keep theirs, which the
sentences cite). The reply is cited sentences (decision
D11): `citedRecap` drops a sentence citing nothing it was sent, a lasting beat
no sentence cites sends it back once, a reply that is not the JSON is asked
for once more before the recap that stood stays, and the text kept has every
changed name written as the new one (`recapText`). Nothing of the open scene
is in the recap's system prompt — no binding ACTIVE SCENE block (issue #374
A1), and no section built from the session summary (the WHERE THINGS STAND NOW
section, `formatStandsNowBlock` / `recapSummaryFor`, is retired).

**Ledger scope** ([6.5]; a meta mode — the campaign recap — gets the ship's
position line alone of this block, never the frame, truths, corrections or
state as binding: it retells the Chronicle, whatever scene is open — issue
#374 A1; what it is told of the scene is [6.5m], above): scene
subjects and free-text subjects (unrecorded
figures and places — the ledger holds only this scene) are always in scope
(B4: they used to need their exact phrase in the player text or the frame);
recorded entities are in scope when matched, at the current location, or in
the frame's cast. The ledger is read from the store when the narration is
built — the scene, its truths, state and frame, and the session's strikes
(`narratorPrompt.SCENE_LEDGER_FIELDS`, carried as `extras.sceneLedger` by
`buildNarratorExtras`, which also reads the frame's cast, the lore query and
the spotlight from it): the move pipeline narrates from a snapshot taken
before its confirm dialog, and an X-Card played (and resumed) meanwhile had
retracted the beat's truths, removed its state and taken its frame back only in
the store — the narration rendered them as binding beside the X-CARD —
REDIRECT block; a `!truth strike` made during the dialog rendered as binding
the same way (issue #325 W05). A store holding another session than the
snapshot's keeps the snapshot's ledger.

**Budgets.** `SIDECAR_TOKEN_HEADROOM = 500`; move/paced use
`narrationMaxTokens + 500`; every other mode passes
`maxTokensWithSidecar(16000)` — generous caps, so truncation is rare, and
`callNarratorAPI` now **warns on `stop_reason: "max_tokens"`** so the
remaining cases are visible (the pre-fence truncation that used to parse as
"clean prose, no sidecar" is caught here).

**What was sent — `!narrator debug`** (issue #290 part 1). `callNarratorAPI`
records each request in this browser (`src/narration/narratorDebug.js`: the
system prompt, the user message, model, cap, the narrator function, then the
response's text, stop reason and usage, or its error; the last 10), and
`applyNarratorSidecar` adds the fact block it parsed. `!narrator debug` (GM
only, `RUN_ON.AUTHOR`) whispers the typist a card of the last narration's
request — the background summary regen is listed, not detailed — split into
sections by `splitPromptSections` (at the `---` rules and `## ` headings),
with Private Lines counted, not shown. The Private Channel calls the API
itself and is not captured. The Quench batch `starforged-companion.promptContracts`
reads requests with the same splitter: it runs every mode above against a
stubbed endpoint in a live world and checks each section against the data it
reads, present and absent. **A section added to the prompt, or a new mode,
gets a check there.**

## 2. Write-back side — how output becomes memory

What happened at the table — lines, moves, sheet changes, narrations, truths
set and struck, names changed, removals — is also kept as one record a
session on the session's Session Log page, read with the table's corrections
(issue #382): `docs/flows/session-record-flow.md`. The Session Log page is its
view; the summaries below do not read it yet.

Prose + fenced JSON sidecar → `extractSidecar`
(`src/factContinuity/sidecarParser.js`: the sidecar's fence is ```` ```json ````,
```` ``` json ```` or a bare ```` ``` ```` whose body opens with `{` — a bare
fence used to post the raw JSON on the card and lose the turn's facts, issue
#321 U41; the last such block wins and every one is stripped from the prose;
unknown keys dropped; an unclosed fence's tail is stripped and parsed — a
complete object applies, a truncated one is a parseError and is discarded; a response with
**no fence at all now warns** in `applyNarratorSidecar` — the sidecar is
mandatory, so a missing fence is a lost frame update, not a quiet no-op; and a
reply that is its fence alone, with no prose, is no narration: its caller
posts a fallback card (no `narrationId`) or nothing, so nothing of the block
is applied or relayed — written, it was stamped with an id no card carries,
out of every X-Card's reach, issue #362 AC39) →
`applyNarratorSidecar` (canonical-GM only; the narrative skeleton's keys —
`plans` and `openQuestions`, normalised by `src/world/skeletons.js` — go to
`secrets.js` `applyPlanSideData`, which files the narration's requested plans
— as decided, or with their rolls alone: also when its fact block is cut off,
unreadable or missing (the requests alone make the apply run), and, unstamped,
when the narration is never written — an empty reply, a failed call — from the
exits of `narrateResolution`, `narrateRound` and the oracle follow-up
(`fileUnansweredPlanRequests`, relayed off the canonical GM; issue #362 AC07;
so do a move's and a round's narration the X-Card pauses, on entry or once the
reply is in — the move stands, a paused narration is never narrated again, and
its paused notice closes a round: `filePausedPlanRequests`, issue #364
XCARD-PAUSED-NARRATION-PLAN-REQUESTS; each request names the resolution it is
made for, and the plan it files keeps it — `createdFrom.resolutionId`, with a
narration's stamp or without — so a later narration of the same move, a Burn
Momentum / Improve Result re-narration that keeps the price, asks for no plan
already filed for that resolution: `movePlanRequests` puts it that plan by id
and tells the price's new enemy by that plan's rolls, issue #364
KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE;
the vow scene's own fallback is `fileRequestedPlan`); and with fact continuity
switched off — no fact block read, no ledger written, no DECIDE NOW shown — a
narration with prose still files its requests with their rolls alone, stamped
with its id, and still marks the step it was made to play
(`applyOwedPlanSideData`; the relay handler applies only those two then; issue
#364 PLAN-REQUESTS-FACT-CONTINUITY-OFF) — decides or corrects the plans it was
shown by id, turns a posed question into a mystery whose answer it rolls,
and marks what the beat showed — `reveals`: a clue, a step played, an ending,
the truth itself (only once decided — a "truth" reveal of a plan still waiting
for its decision changes nothing, issue #362 AC16 — and only when the prose
told it: `secrets.withoutUntoldTruths`, run in `applyNarratorSidecar` on the
narration's own reveals before the ledger and the plans read them, takes
"truth" off a reveal whose prose has none of the truth's own words
(`skeletons.proseTellsTruth`, the plan's subject and question left out; the
reveal's clues, step and ending stand, and the GM's console names the plan).
A fulfilment that said "both are named now" recorded its vow's truth as
revealed, and the truth became a binding scene fact and confirmed lore with
none of it told — known-issues VOW-FULFILLED-WITH-NOBODY-NAMED. A floor, not
a judgement: whether a truth is stated is asked of the narrator in UNREVEALED;
a step the code forced is not checked), which becomes a ledger truth of the narration's own
(`revealedTruthsOf` — the truth the sidecar leaves on the plan: a `plans`
correction or decision of the same id is laid on first, so a truth changed or
decided and revealed in one beat is the one the ledger and Lore both state,
issue #362 AC13) and confirmed lore — the plan's truth mirrored into the Lore
journal, the entry naming its plan (`revealOf`) and stamped with the
narration: an X-Card on the narration retracts it, and a Burn / Improve
supersede, which takes back the narration's plans alone, takes this entry
back with the truth it mirrors (`undoSupersededPlans` →
`undoRevealedTruthLore`: deleted, or put back as it was before the reveal;
the narration's other World Journal records stand — issue #364
SUPERSEDED-REVEAL-LORE-STANDS; and of the narration's plans the supersede
keeps one it filed with its rolls alone about a card that is still there —
the agenda of the NPC a Make a Connection hit created, as filed and still
stamped with that narration, so the X-Card that removes her card takes it:
`plansKeptThroughSupersede` → `undoNarrationEntries`' `keepPlanAbout`, issue
#364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA — and the plan its capture filed
for a threat it recorded as significant, about the Threats page, which
stands with those records (`threatPageStands`): issue #364
BURN-DROPS-RECORDED-THREAT-PLAN; and a plan filed about a name that its
capture linked to such a card or page keeps the link while it stands — the
link's own mark, `subjectLinkedBy`, which an undo that keeps nothing (the
X-Card on the upgraded beat, deleting the card) undoes, the plan about the
name again: issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN) — its oracle rolls
then shown — Phase 2;
a decided threat plan gets its escalation clock (at most `MAX_PLAN_CLOCKS`
running, not full, of active plans — `livePlanClocks`; a plan that leaves play,
by a GM's Retire or retired as another, takes its clock with it —
`retirePlanClock`, issue #362 AC10 — and so does a plan whose page a GM deletes
in the journal sidebar, or whose journal is deleted: the canonical GM's
`deleteJournalEntryPage` / `deleteJournalEntry` hooks retire its clocks,
`retireClocksOfDeletedPlans`, issue #364 PLAN-PAGE-DELETE-LEAVES-CLOCK — and the same hooks withdraw the
table's cards of its oracle rolls, whatever deleted the page (an X-Card's or a
supersede's undo, a reverted price, a GM): struck, with a line saying why,
flagged `rollsWithdrawn` — `withdrawRollsCardsOfDeletedPlans`, issue #364
TAKEN-BACK-PLAN-ROLLS-CARD-STAYS), a `countdown` becomes a clock
tied to its plan (or a new mystery) and offers the GMs a scene challenge —
once a challenge holds it as its tension clock it is the challenge's, and the
plan's pacing neither rewinds nor retires it (`heldBySceneChallenge`, issue
#362 AC09) — and
what a clock vignette or a chosen complication was made to play (`ctx.reveals`)
is marked played whatever the sidecar says (put first, so the four-reveal cap
never cuts it, issue #362 AC08) — and a plan clock whose trigger
vignette is not written (the X-Card, no key, a failed call, an empty reply)
goes back one short of full, its step still owed for the next price
(`narrateClockAdvancement`'s `finally` → `secrets.rearmUnplayedPlanClock`,
issue #362 AC08) — Phase 3; an enemy or danger the
prose introduced — `newThreats`, issue #354 P2-29 — gets a `threat` plan
(`planNarratedThreat`: Character Role, Goal and Disposition rolled once, no
truth, so the next narration decides it), unless one of its names is already
planned or it names a PC (a person's titles aside, and a title alone only ever
the same title: "the Captain" is neither Captain Reyes's agenda nor the PC
Captain Ryn — `secrets.planIsAbout`, issue #362 AC12); and a plan answered `sameAs` — the narrator's say
that a subject it was asked to decide is one already planned, shown to it
under DECIDE NOW → ALREADY PLANNED (`skeletons.plannedBeings` →
`extras.plannedSubjects`), issue #354 P2-30 — joins that plan, which keeps
the other name in `aliases` (read by `secrets.subjectNames` and
`selectRelevantSkeletons`), the waiting plan retired (`planAsAnother`); so
does a waiting plan decided by its id under the name of a subject another plan
already has (`joinedByName`, issue #362 AC36 — it became a second plan, with a
truth and a clock of its own); a narration a burn or
improvement supersedes takes back its plan writes and clocks with its ledger
entries (`retractSupersededNarrations`) — and a plan clock it paced: the pacing
is stamped with the narration (`pacedBy`, `clocks.pacePlanClock`), and taking
the narration back — a supersede, or the X-Card's pause write — runs the clock
again at its fill from before plus the segments turned since, at most one short
of full, the step it played owed again (`planClockPacing.js`: the clock is that
narration's by its stamp, `pacedByOneOf`, wherever a later price has turned it —
issue #364 PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE; and only while the clock's plan
is in play once the narration is taken back, `planInPlayFor`, told the plans by
`worldJournal.hiddenPlansInPlayWithout` — a clock retired after a last step
keeps its stamp when the plan is then retired, deleted or ended by a later
narration, and is left retired, issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES; a burned price's plan clock is put back one
short of full and its vignette struck by that id, issue #362 AC33 — the price's
receipt names its own trigger vignette, `vignetteNarrationId`, minted with the
advance in `advanceClocksOnPayThePrice`, so the burn finds the pacing that
narration did even after a later price turned the emptied clock on, and never
takes a later trigger's for its own, issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE;
when the clock triggered again before the first price is burned its stamp is
the later trigger's, so the burned price's own vignette — a live card under the
id its receipt names, `clocksWithVignetteWritten` — is struck by that id and the
clock left as the later trigger and the prices after it left it, no segment
given back, issue #364 PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN — and the reversal
card says of each clock what the rewind did to it, from the `fates` the rewind
reports: rewound a segment, put back one short of full with its TRIGGERED
scene taken back, or left as it stands with only this price's scene taken
back, issue #364 PLAN-CLOCK-REWOUND-WORDING);
each write stamped with the narration's id, which the X-Card's
`undoNarrationEntries` takes back — and a step a narration played carries that
narration on the step itself (`playedBy`, `applyRevealToSkeleton`), so taking
the narration back un-plays the step in every version of the plan that stays,
also under a version another narration or a GM wrote since (a clue shown
between a trigger vignette and the burn of its price left the step played with
its vignette struck and its clock re-armed); a clock a later trigger retired
after the plan's last step then runs again, empty (`rerunRetiredPlanClock`;
issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN); a clue a narration showed and a
truth it revealed carry it the same way (`revealedBy` on the clue,
`truthRevealedBy` and `rollsShownBy` on the record) and go back unshown with
it under a later writer's version too, that writer's own writes standing —
the truth's scene fact and Lore entry go by the narration's stamp, as always
(issue #364 PLAN-CLUE-TRUTH-NO-MARK), and the rolls card that reveal posted is
withdrawn in chat with it (`withdrawRollsCardsOfReveals`), so a reveal made
again leaves one rolls card standing (issue #364
TAKEN-BACK-PLAN-ROLLS-CARD-STAYS) — and the X-Card's take-back of a truth
withholds it: the plan is marked `truthWithheldBy` (the revealing narration;
`undoNarrationEntries`' `withholdTruths`, passed by `retractNarrationCapture`
and `secrets.takenBackForXCard`, never by a supersede, whose re-narration may
reveal it again — the supersede names the reveal it took back instead,
`truthTakenBackBy`, and the X-Card that later removes that narration with
the beat its upgrade wrote, issue #347 D2, withholds the truth by that mark,
issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL), so UNREVEALED and the
world snapshot show the plan without
its truth, nothing offers it (DECIDE NOW, a countdown's `revealsTruth`, an
expedition's or vow's ending line, an oracle question's odds, the Private
Channel's relay), and a narration's reveal of it is not recorded — no plan
mark, ledger fact, Lore entry or rolls card — while its clues, steps and clock
stay in play; the GMs are whispered once which plan and how to lift it
(`safety.postWithheldTruthsNotice`): a GM's edit of the truth's text lifts it,
and Reveal now still reveals it, each later reveal confirming again the Lore
entry the X-carded one filed, by the plan's id (`recordLoreDiscovery`'s
`revealOf`) — issue #364 XCARD-REVEAL-REREVEAL-NO-LORE; a reveal whose
write the X-Card overtook (refused for the removed narration by
`updateSkeleton`, so there was no reveal for the undo to take back) still
marks the truth withheld, as bookkeeping, the GMs told once
(`applyPlanSideData` → `withholdXCardedReveal`, issue #364
XCARD-BEFORE-REVEAL-WRITE); an ending the
narration gave the plan's
story goes back by its mark too (`resolvedBy`), the plan in play again and its
clock with it (issue #364 PLAN-RESOLVED-NO-MARK) — a plan keeps one version a narration,
however often that narration writes it (decision, clock link, each reveal, its
capture's link), so the version before it is never pushed off the three-deep
history (`updateSkeleton`, issue #362 AC34); a plan filed with its rolls alone
by a narration that was never written carries no narration's id, so a Burn
Momentum / Improve Result that reverts its move's price entirely takes the
price's new enemy back by the resolution it was filed for instead
(`createdFrom.resolutionId`) — while it still waits to be decided; one decided
since stays (`revertPayThePrice` → `worldJournal.undoPlansFiledFor`, issue
#364 REVERTED-PRICE-PLAN-STAYS-WAITING); a relayed sidecar carries its plan requests,
issue #353 Phase 1): truths append **with dedup**
(subject + normalised fact; a match against a *retracted* truth blocks the
append — the correction stands) / state supersede per subject+attribute
(`ledgers.js`), subjects resolved against `collectAllEntities` (passed
through in its own shape — `entityId` is the host document id; entity state
keys are `entity:<id>`; issue #286 A1 — a name several entities share led by
the active sector's, as `!at` resolves it: the older sector's "Derelict
Starship" took the facts, the scene's place and relevance, issue #345 AA06), ship
`position` stateChanges routed to the §20 ship record, `applySceneFrame`
full-replacement snapshot — a session vignette's with its question taken off
(`narrator.js` `bookendFrame`, `ctx.bookend`: a bookend is no beat of
play — it sets no question and changes none), every other beat's then counted
against the question the frame keeps (`countSceneQuestionBeat` →
`sceneFrame.questionBeats`; at `SCENE_QUESTION_BEATS` the frame keeps none —
known-issues NARRATOR-REFRAINS: an opening vignette's hook was its session's
question in 22 prompts) — each truth, state value and the frame stamped
with the narration's `narrationId` (`newNarrationId`; issue #321 U07, for the
X-Card) — the consistency check (on by default), then the
card posts with the flag family (`narratorCard`/`narrationText`/`sessionId`,
and the same `narrationId`) for the ring. Off the canonical GM the sidecar is still stripped from the
prose and no audit runs; the side-data is relayed to the canonical GM
(`narrator.sidecar`, issue #286 D2 — see "Where each call runs"), which takes
no plan write by id from it (issue #362 D2, the maintainer's answer A — plan
ids are public, so a hand-made relay could reveal or rewrite a plan): its
`reveals`, and its `plans` but the answers to its own plan requests (their
`sameAs` taken off), are dropped; `openQuestions`, `newThreats` and
`countdown` stand — the countdown about what its `about` names, never the plan
of that id (`applyPlanSideData`'s `relayed` → `applyCountdown`'s `byId: false`;
an `about` that is a plan's id is no name, and the countdown gets its own
mystery — issue #364 RELAYED-COUNTDOWN-ABOUT-BY-ID: by id it hung a new clock
on a plan that had none); the step a clock vignette or a chosen complication was made
to play rides apart (`forced`, with its `clockId` or complication scope) and
stands only as the canonical GM would force it for that cause
(`standingForcedReveals` — the clock still full, its plan's next step; the
scene's complication step), so a co-GM's vignette still paces its clock.

**A session set-piece's account of its material** (issue #381): `builtFrom`,
the one key the `session_vignette` mode adds to the fact block
(`sidecarModeAddendum`, in the cached mode block — the material itself is
per call, in the user message). `[{ n, words, second }]`: for each numbered
MATERIAL result, the words of the prose that are it, and whether the second
result was taken — normalised by `sidecarParser.normaliseBuiltFrom` (garbage
is no account; twelve entries at most), and applied by
`applyNarratorSidecar` with the scene's seeds in `ctx.seeds`
(`sceneSeeds.markSeedsUsed`): each seed is marked `used` with its words when
the prose holds them, `false` (with what was `claimed`) when it does not, and
left `null` when no fact block was read. Nothing is retried on it; the card
keeps the marked seeds in its `builtFrom` flag — the one store of the
scene's rolls, which "Rolled for this scene" is rendered from at every
render (`renderSceneRolls`, the chat render hook, every client) — and shows
a seed the narration did not account for as "not used". The rolls never
enter `campaignState.recentOracles`: that ring tells every later narration
to build on what it holds, which is how one scene's prop becomes the
session's refrain.

**An `@scene` answer is not written back** (known-issues
SCENE-ANSWER-NOT-A-CAMERA; `narrator.js interrogateScene` → `sceneAnswerText`).
The long haul's third live run asked sixteen questions through `@scene`: each
answer was right, each added scenery that invented (the mode's system text
said "do not invent", its user message asked for "2–3 sentences of
atmospheric description", and its permission block for sensory detail), and
each was then applied to the scene's record — the frame's situation rewritten,
the scenery filed as lore and a draft location. Now:

- **What it is asked.** Its role (`ROLE_DESCRIPTIONS.scene_interrogation`) is
  an answer, not narration: the fact asked for, from what the prompt holds —
  "the story has not established it" when the prompt does not hold it — with
  no scenery and nothing happening. It has no latitude block
  (`DEFAULT_PERMISSION_CLASS_BY_MODE.scene_interrogation` is null), and its
  user message (`buildSceneUserMessage`) asks for at most Scene Response
  Length plain sentences (`sceneResponseLength`, default 2 — "one, if one
  answers it"). Its context closes on ANSWER NOW — "write no JSON block" — in
  RESPOND NOW's place; the standing block, the response format in it, is
  every mode's. UNREVEALED is shown without the lines that ask for a record,
  and nothing is put under DECIDE NOW.
- **What is recorded: nothing.** `sceneAnswerText` takes any fact block off
  the reply and drops it — no frame, truth, state or plan, applied or relayed
  — and no capture runs (no detection, no tier pass). There was never a
  Chronicle entry. It still starts a scene when none is open, and is still
  read against the ledger (the consistency check: it writes no fact).
- **What it still feeds, deliberately** — the A1 decision kept: its card
  carries the narrator flag family, so the **recent-narration ring** holds
  the question and what was said in reply (`PLAYER — Kira asked: "…"`), and
  the session summary's source lists it under QUESTIONS (the record's
  `question`, issue #382); a later beat must not contradict an answer
  the table has just read. It is **no narration** where one is meant: the
  session's first-narration campaign recap (`sessionStartRecap` — a question
  asked first took the first beat's recap) and the X-Card's redirect
  (`registerXCardRedirectHook` — an answer steers nothing away, so it does
  not use the redirect up); it already counted for no beat shape.

**Post-narration capture** (the combined detection pass — World Journal lore,
threats, new-entity drafts — and the generative-tier pass): discovery-class
moves run detection (make_a_connection auto-creates on a hit); interaction-
class moves run the tier pass and, since issue #286 D4, detection too, as
paced narration (the same class) always has; embellishment moves run
neither. Oracle follow-ups and clock vignettes run detection and the tier
pass; session vignettes and vow scenes run the tier pass for the recorded
entities they name (`scheduleNarrationCapture`; a clock vignette's from
`narrateClockAdvancement` itself, so all three post sites, and only once its
"still triggered" check stands — issue #345 AA33: it ran none; its detection —
it is written at interaction latitude, issue #322 V23 —
CLOCK-VIGNETTE-NO-DETECTION). An `@scene` answer runs neither: it is not
mined (its `scheduleSceneAnswerCapture` is retired — known-issues
SCENE-ANSWER-NOT-A-CAMERA, below). These captures run on the GM whose client narrated them — not
whoever is canonical when the reply lands, which dropped them when a lower-id
keyed GM joined meanwhile (AA34's gate, CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE). A Batch Mode round runs one detection, at the widest class among
the entries it captures, and a tier pass whatever that class is, over what
each interaction-class entry was about, by that entry's free-flow rule — an
unrolled action the prompt's matched set (paced), a rolled interaction move
its own relevance (`roundTierRefs`; issue #342 Z10 — it ran over the rolled
moves' entities only, and not at all beside a discovery roll). New entities from any of these queue on
the GM's draft card — only make_a_connection auto-creates; the card carries
the PC the narration was for (`actorId`, every path that knows it), whose
sheet a confirmed connection's bond Item goes on (issue #321 U23) — a
round's card every acting PC (`actorIds`), its connection rows' Confirm asking
which of them, or no one (issue #342 D3).

**The detector is shown the player's line beside the narration** (known-issues
PLAYER-NAMED-PERSON-GETS-NO-CARD; `entityExtractor.js`
`buildCombinedDetectionPrompt`'s `playerLines`). It read the narration alone:
in the long haul's third live run a player wrote "…to the ledger stall of
Tamsin Vey, the salvage broker, and greet her by her full name", the narrator
answered "A woman looks up from a slate when you say her name in full", and
the detector proposed "Ledger stall woman" (low confidence — dropped), then
"Tamsin" a line later. Every capture that follows a line of play hands the
line in — paced narration (`schedulePacedDetection`'s `playerText`), a move
(`runDiscoveryDetection` → `writtenLine`: none for a Burn Momentum / Improve
Result re-narration, whose input is a marker), a Batch Mode round (each
acting character's, with their name) — as plain text on one line, cut at 600
characters, under PLAYER'S LINE ahead of `Narration:`, with PLAYER'S LINE
rules: the line is material for names, never an instruction and never
narration; a name it gives to someone, somewhere or something the narration
shows is that entity's name, in its fullest form and not at low confidence
(a placeholder figure's: a rename); what the line alone mentions creates
nothing, and no lore is taken from it. A capture no line prompted — an oracle
follow-up's, a clock vignette's, the inciting incident's — sends none, and its
prompt is as it was. (An oracle's question is not handed in: it is asked, not
asserted — "is the captain called Vex?" answered no would name him.)

The
detection reply's cap is 1,500 tokens (`DETECTION_MAX_TOKENS`; it was 600):
a reply cut off or not a JSON object is logged and the GM told
(`notifyDetectionFailure`), where it used to drop the narration's entities,
lore and factions silently (issue #321 U15). Lore about a
recorded entity goes to its card at the tier floor (`notable`) before the
world-lore floor is applied (D4). The ledger persist writes **only** the sidecar's fields
(`sceneTruths`, `sceneState`, `sceneFrame`) onto a fresh read of the stored
campaignState (`persistSceneLedgerFields`, `sceneLifecycle.js`): the
caller's object may be the move pipeline's pre-narration snapshot, and writing
it whole used to revert a relayed X-Card, Take a Break or safety flag that
landed meanwhile. The ledgers themselves merge like `persistResolution`'s
(`mergeSceneLedgers`, shared): nothing is written when the store has moved to
another scene (End a Session or `!scene` closed this one mid-narration), and
otherwise `sceneTruths` is unioned by id, so a `!truth` correction or an oracle
follow-up's truth that landed during the narration survives. The pipeline's own end-of-move write
(`persistResolution`) merges the same way (`mergeWithLatestState` —
relay-owned fields such as `xCardActive`, `safety`, `safetyFlags`,
`nextMoveAdd`, `nextMoveBonuses`, `clocks`, `recentOracles` take the stored value; same-scene
`sceneTruths` union by id with retractions sticky; a scene change mid-move
keeps the stored scene ledgers; what an X-carded narration wrote —
the store's `xCardedNarrationIds` — is retracted from the working copy first,
and a frame it wrote yields to the store's, issue #321 U07) — read at its
turn on the GM's campaignState write chain, once the write ahead (an X-Card
pause still on its way among them) has landed: read inside the pause's round
trip, its store-owned `xCardActive` came from the cache and lifted the pause
(CAMPSTATE-CHAIN-PARTIAL). The registrations that run inside those long
callers write only their own key onto the latest store, never the caller's
copy: an entity creator's id (`registerEntityIdInStore`, `entities/registry.js`
— the Make a Connection auto-create used to write the pipeline's snapshot whole
and clear a mid-narration X-Card, issue #300 F14), a portrait's art-index entry
(`storeArtAsset`), and a new sector (`storeSector`). Since issue #321 U06 so
do the other writers that hold a snapshot across an await: `!lore` writes only
`loreRecap` (`writeOwnedFields`, on the write chain; store-owned in
`persistResolution`'s merge, U06a/g); `!truth` / `!state` and the correction dialog work on a fresh copy
and persist only the ledger field they changed through
`persistSceneLedgerFields`, a Replace's name change riding the same write
(`opts.onto`, U06b/e — a strike reaches the session summary through the
record's `truth.struck`, issue #382); the inciting premise is written with its scene ledgers the same way
(`onto` sets `incitingIncident`, U06d) — one the world refused is told on a
whispered "Premise not saved" card to its asker and the GMs, since nothing
else would carry [4b] (issue #336 Y33); a site reveal or clear saves its
flag onto the state as it is then (`persistSiteFlag`, U06c).

**The flag family covers every fiction card** (2026-07): move narration,
paced, @scene, inciting incident, galley/end-session vignettes, **vow-swearing
scenes**, **clock vignettes (all three post sites: Pay the Price, Begin
Session, manual advance)**, and **oracle follow-up narrations**. Each also
carries its narration's `narrationId` (issue #321 U07); a caller that posts
the card itself — the galley and End a Session vignettes, the three
clock-vignette sites, the inciting card — makes the id (`newNarrationId`) and
passes it to the narration too. Raw oracle
*results* — and the at-0 choice card's mortal-wound / desolation roll
(`rollImpactTable`, issue #336 Y21) — additionally carry a structured
`oracleMemory` flag (not a `!ptp` price nobody pays — the dice established
nothing a character took, PTP-PCLESS-NARRATED-AS-FIRST-PC; any price a
player with no character of their own rolls, routed or narrative, issue #342
Z49); the canonical
GM's capture hook (`registerOracleMemoryCaptureHook`, `src/index.js`) ledgers
them into `campaignState.recentOracles` (`src/oracles/oracleMemory.js`,
cap 8) — on the GM's campaignState write chain
(`src/multiplayer/campaignStateChain.js`), each capture reading the ring as
the write ahead of it left it, so two results inside one write round trip are
both kept (issue #331 X44), and so is a result followed at once by a write of
another kind — the Pay the Price's clock advance, the `!oracle` follow-up's
scene start, which run on the same chain (issue #342 Z17); a move's own price
carries the move's `resolutionId`, and a Burn Momentum or Improve Result that
reverts the price drops it (`dropOracleResultsOf`, issue #342 Z11 — it told
the strong hit's re-narration the undone price was established); every entry
carries the id of its result card (`cardId`, the hook's own message id), so
an X-Card on the narration that told it drops it too (issue #345 AA01) — for section [3b]
(the retired assembler's RECENT ORACLES section went with the module, 2026-07
— issue #271).

**Scene lifecycle** (`src/factContinuity/sceneLifecycle.js`): scenes start on
`!scene start`, `ensureSceneStarted` on the first move/@scene/paced
narration, **or the inciting incident** (so the premise sidecar writes into a
real scene the first move then *continues* — the opening NPC state and frame
survive), and since issue #321 U34 on an oracle follow-up, a session or clock
vignette and a vow scene too — their facts used to land under no scene; since
issue #326 W59 a `!truth set` / `!state set` typed with no scene open starts
one too (the next narration's scene start ended the phantom scene and
discarded what the GM set). A
caller whose snapshot holds no scene while the store has one adopts it
(`startScene` → `adoptStoredScene`: the scene's id, truths, state, frame and
spotlight cloned in, nothing written) instead of minting a second scene over
its ledgers (issue #321 U06f); `!scene start`, holding the active scene,
still ends it and starts another. Scene starts run one at a time on the
canonical GM: a start waits for the one in flight (at most 10 s) and only
then looks for the store's scene, so two narrations one command fires — each
on its own working copy — share one scene; they each minted one inside the
first start's write round trip, and the narration on the losing scene lost
its facts (issue #335 Y05). Begin's galley vignette also runs after its clock
vignettes, and `!pay-the-price`'s oracle follow-up after its trigger vignette
(`triggerVignettesSettled`), each reading its copy once the one ahead is done
(bounded, 60 s), so the second continues the first's scene with its beat in
it. `@scene` **continues** the scene in progress (issue #286 A4): it
used to call `startScene`, which ended the scene it was asked about and wrote
the answer without the frame, truths, state or CORRECTED list. It still
starts one when none is open, so the question is asked of a scene; the answer
adds nothing to it.
`ensureSceneStarted` starts a scene on the **canonical GM only** — a scene
boundary is a world write, so a keyed player's client narrating `@scene` /
`!incite` with no keyed GM online leaves it to the GM (debug-logged). `startScene` implicitly ends a prior
scene when truths/state exist. `endScene` migrates entity-kind truths →
generative tiers (deduped against existing tier details — live capture +
migration no longer double-lands); scene-kind truths → the tier of the
recorded place the truth was asserted at (issue #286 C2; issue #326 D2:
each truth's `sceneLocation` — the frame's location when it was asserted —
names or mentions exactly one recorded place, `placeNamedBy`; a truth with
no stamp falls back to the end-of-scene place, `resolveScenePlace`: the
frame's location by the same ladder, else the current location when the
frame names no place); text truths and place-less scene truths → WJ Lore
(titled with where the truth was asserted, else the frame's location, not
the scene id) — save a hidden plan's revealed truth, marked `revealOf` (its
plan's id) by the sidecar apply: the reveal filed it as Lore already
("Threat: the escort"), and archived again it was two entries (issue #362
AC37).
It keeps each recorded character's location / vessel / condition on their
record as `lastKnown` (C1, rendered as LAST KNOWN on the card) — each value
with the `narrationId` that set it and the values it superseded (`previous`,
newest first, up to four; issue #335 Y01) — and every migrated tier detail and
archived Lore page carries its truth's `narrationId`, for an X-Card played
after the scene ended (above) — or while it runs: each of those writes checks
the X-Card first and takes its copy back when the card landed meanwhile
(XCARD-DURING-SCENE-END-MIGRATES). A strike or Replace that lands while it
runs sticks the same way: each truth's migration re-reads its entry in the
store (while the store still holds the scene) before and after its write — a
truth corrected by then is not migrated, and a copy written as the correction
landed is taken back by the correction's own `propagateRetraction`, re-run
on where it was filed (a superseded narration's records stand, issue #338
D8) — and the write that ends the scene keeps the scene's truths as the store
holds them, so the strike is kept and named for the session
(STRIKE-DURING-SCENE-END-LOST: the struck fact was archived as confirmed lore
and kept as a live truth). The whereabouts it keeps are the store's while the
store still holds the scene, and a record is written again — from its LAST
KNOWN as the end found it — when they changed while it was written, so a
`!state strike` / `!state set` made meanwhile sticks too
(STATE-CORRECTION-DURING-SCENE-END-LOST: a struck location stayed LAST
KNOWN). It discards state and clears the frame.
Before that final write it re-reads the store and, while the store is
still this scene, migrates the truths and keeps the whereabouts that a
narration persisted during its awaits (`migrateLateSceneFacts`, a few
passes) — the final write used to clear them unmigrated (issue #325 W24).
Both persist only their scene fields
(`currentSceneId`, `sceneTruths`, `sceneState`, `sceneFrame`, `spotlight`)
onto the latest stored campaignState (`persistCampaignStateFields`;
`endScene`'s own `persistEndedScene`, on the same write chain; a scene the
store holds that is not the one ended — started on another client during its
awaits — is left open, its fields and pacing standing: END-SCENE-NEXT-SCENE) — when
`ensureSceneStarted` runs inside `narrateResolution` the object it holds is the
pipeline's stale snapshot. `endScene`'s write also keeps the scene's strikes,
X-Card retractions, Replace originals and live narration truths for the session (B6;
`sessionRetractions` — below), added at that write's turn onto the session's
list as the store has it then, the scene's truths seen through the store's
`xCardedNarrationIds` (`endedSceneRetractions` → `retractNarrations`): it
wrote its copy's list whole, so an X-Card played during its awaits lost what
it wrote there — a strike it took over was named again, and the scene's
truths it retracted were kept live (XCARD-DURING-SCENE-END-RACE). Triggers for `endScene`: the two
commands, the implicit path, **End Session**
(`session_close`), **End a Session's closing vignette once its card is
posted** (`closing_vignette` — the vignette is a cutaway, and the scene it
opens for its fact block after End closed the session's own, issue #321 U34,
is ended before the campaign recap is refreshed, its facts filed as any
scene's end files them, also when the narration failed after opening it;
left open until the next mint, it was the campaign's active scene between
sessions and the recap was told the campaign stood there — issue #374 A1),
and the close-out before a new session is minted
(`rollSessionIfDue`: `session_gap_remint` for a session that went idle,
`session_close` for one that was ended and still holds a scene) —
session boundaries no longer leak scene truths into the next session's empty
ring, and the closing scene's truths keep the closing session's number.

**Corrections & defenses:**
- The ledger block's binding wording, plus the **CORRECTED block**: a bare
  Strike renders as "retracted by the table — do NOT re-assert" (capped at
  the 5 most recent, never dropped under budget; Replace-corrections are
  exempt — the replacement truth stands; an X-Card retraction is never named
  there, issue #321 U07). The write layer refuses narrator
  re-assertions of retracted facts — checked against the store's ledgers as
  well as the narration's copy (`applySidecar`'s `storedLedger`, read by
  `liveSceneLedger` when the sidecar is applied): the move pipeline's copy
  predates its confirm dialog, so a fact the X-Card or a strike removed while
  the move waited — and an ended scene's truth the X-Card moved to the
  session's blocks, in the store alone — was recorded live again by the
  move's narration (issue #345 AA04); GM `!truth set` bypasses (GM authority) —
  and lifts the strike it re-establishes, linking it as a Replace does, so
  the fact is not binding and CORRECTED at once; a player's set over a GM's
  strike is refused (issue #326 W60), and so is a player's set of what the
  X-Card removed or a Replace corrected — the active scene's retraction or a
  kept block (`findSessionBlock`; issue #345 D4, the maintainer's option A:
  it was recorded binding, named under TRUTHS again) — while a GM's is
  recorded; the lore the lifted strike retracted
  is restored after the persist, only for a lift the store kept — a strike
  the X-Card took over is never lifted (XCARD-AFTER-STRIKE-STILL-NAMED). A truth already retracted — struck,
  replaced, or the X-Card's — is struck or replaced no further
  (`!truth strike` says "already retracted"), and no correction made on a
  copy older than the X-Card relabels its retraction or files a replacement
  (issue #336 Y30).
- **A Strike reaches every copy** (issue #286 B6): `!truth strike` and the
  correction dialog's Strike / Replace — and, since issue #321 U07, the
  X-Card for each truth it retracts — call `propagateRetraction` — the
  subject entity's same-session tier details that state the fact are dropped
  (save a pinned one, and a promoted one — its Notes line is the GM's, and
  the entry is the link the X-Card's D7 undo follows to take that line off:
  issue #342 Z43), same-session lore that states it **about the struck subject** goes
  `retracted` + unconfirmed (an archived scene truth must carry the subject's
  label, other lore must name the text subject or the entity as whole words
  — not as a possessive, "Mira's husband", unless the struck fact is about
  something of the subject's, RETRACTION-POSSESSIVE —
  a scene truth's fact alone decides; issue #321 U39 — sidecar facts are
  subject-less phrases, so striking "Vance — Is dead" took another
  character's death out of canon; `factsOverlap` containment now counts only
  whole words) (out of [4f] and
  the pending queue; the detection pass cannot re-confirm it — `!journal lore
  "<title>" confirmed` restores it with its text, category and provenance,
  issue #321 U40; a `!truth set` that lifts the strike restores it —
  `restoreStruckLore`, issue #331 X31 — unless another standing retraction
  of the session still states it: another strike, to which it is handed so
  lifting that one restores it, an X-Card retraction — the active scene's or
  an earlier scene's kept block — or an earlier scene's kept strike, issue
  #336 Y32), and the
  session summary that told it is stale by the record's `truth.struck`, and
  is made again with it under "STRUCK BY THE TABLE — did not happen" (issue
  #382). `endScene` keeps the scene's bare strikes on
  `campaignState.sessionRetractions`, so CORRECTED holds for the rest of the
  session — the ring's prose still states the fact after the scene closes. Strikes are told apart by subject and
  fact together, so two characters' identical struck facts are both kept
  (U39). A kept strike keeps its truth's id, subject key and who struck it —
  and, for a scene fact, the place it was asserted at (`place`, the truth's
  `sceneLocation`): its block, its lift and its CORRECTED line stand only at
  that place, or where either place is unknown (`keptStrikeStandsAt`; issue
  #345 AA28 — struck at Bleakhold, it blocked Vantage Station's own fact of
  the same words, and a set there lifted Bleakhold's strike; the summary's
  leave-out list still names it, and the X-Card's blocks keep no place; the
  active scene's own strikes and Replace originals stand at their place the
  same way — a scene travels — ACTIVE-SCENE-STRIKE-PLACE-BLIND) —
  and stays a strike, not just text: `applySidecar` blocks a later scene's
  re-assertion of it (`findSessionStrike` — by subject key, else name), and a
  GM's `!truth set` lifts it (a player's is refused over a GM's, W60) —
  dropped from the stored list in the command's write, its lore restored by
  that id (issue #342 Z42: it was recorded live beside CORRECTED and archived
  as canon, and a set rendered beside the strike it should have lifted). The
  scene's X-Card retractions are kept beside them, unnamed
  (`sessionRetractions.blocked`): `applySidecar` blocks their re-assertion
  the same way (`findSessionStrike(…, { blocked: true })`), a lift's lore
  restore counts them (`loreRetractionHolder`), and nothing names them or
  lifts them — their block was the scene's retracted entry, which the scene
  end cleared (XCARD-RETRACTION-SCENE-SCOPED). So are its Replace originals
  (a retracted truth whose `correctedTo` says something else — a strike a
  `!truth set` lifted points at a truth restating it, and is not one): the
  replacement stands, so they are named nowhere, and the next scene's
  narration restating the old wording was recorded live and archived as
  canon beside the replacement (issue #345 AA05). Its live narration truths are
  kept too (`sessionRetractions.narrated`, unnamed, read only by the X-Card's
  `retractNarrations`), so an X-Card on a narration whose scene has ended
  blocks what it recorded (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED) — and so are
  its superseded truths (`retractedBy: "superseded"`, a Burn Momentum /
  Improve Result struck their narration), so an X-Card on the upgraded beat
  after the scene ended still blocks the struck narration's facts (D2's
  pick takes that narration); until then a kept superseded truth is no bar
  to a later narration restating it (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END).
- `!truth` / `!state` resolve subjects **against the full entity roster**,
  so entity-keyed entries are addressable by name from the commands (the
  correction dialog always could). The commands are checked on the typist's
  client and applied on the canonical GM
  (`src/factContinuity/chatCommands.js` — gmRelay `factContinuity.command` →
  `applyFactContinuityCommand`), with permissions from the requester
  (`ctx.requesterIsGM`): a player's correction now lands, and a player still
  cannot strike a GM-asserted truth.
- The **consistency check** (`factContinuity.consistencyCheck`, default
  **ON** since 2026-07): a fire-and-forget Haiku audit of prose vs the full
  ledger block — frame, truths, retracted facts, state, ship position.
  High-confidence hits post the GM-whispered review card with a retract
  button; nothing auto-corrects (deliberate — GM authority).
- The ship "not yet established — do NOT invent" guard line.
- The rolling summary's [4c] caveat tells the model the ledger wins on
  conflict; the summary persist is canonical-GM gated.
- CHARACTER STATE's connection ranks stay live: `setBondItemRank` mirrors
  record rank raises (develop-match, `!bond`-match) onto the bond Items.

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| NARR-RING-VOWSCENE | LOSE-PLOT | Vow-swearing card had no flag family → `narrateAndPostVowSwearing` posts the full family; the oath scene feeds ring/summary/recap |
| NARR-RING-CLOCKVIG | LOSE-PLOT | Clock vignettes posted without the family → all three post sites carry it |
| NARR-SIDECAR-SILENT | LOSE-PLOT | Fence-less responses and pre-fence truncation were invisible → missing-fence warn in `applyNarratorSidecar`; `stop_reason: "max_tokens"` warn in `callNarratorAPI` |
| NARR-INCITING-SCENE | LOSE-PLOT | Premise wrote under a null scene; first move's implicit endScene discarded opening state/frame → inciting starts the scene; the first move continues it |
| NARR-SESSION-SCENE | LOSE-PLOT | End Session / 4h re-mint never ended the scene → `session_close` on End Session; `session_gap_remint` stale-scene close on the ready hook |
| NARR-TRUTH-DUP | WRONG-DETAIL | Identity anchors accreted duplicate truths unboundedly → write-layer dedup (subject + normalised fact) + record-anchors-once instruction rule |
| NARR-RETRACT-PASSIVE | INVENT-RISK | Bare Strike was render-skip only → CORRECTED block + write-layer re-assertion block + retraction section in the consistency-check audit |
| NARR-CMD-SUBJECT | WRONG-DETAIL | Commands resolved subjects rosterless → `collectAllEntities` passed at all three `fcResolveSubject` callsites |
| NARR-BOND-RANK-STALE | WRONG-DETAIL | Bond-Item rank never followed record raises → `setBondItemRank` mirror at both raise sites |

## 4. Design-level exposure — dispositions (2026-07)

Addressed:
- **Consistency check defaults ON and audits the full ledger block** (frame,
  truths, retractions, state, ship). Still whisper-only and fire-and-forget.
  Decision: decisions.md → "Consistency check defaults on".
- **Rolling summary** carries the ledger-wins caveat every turn; persist gate
  is `isCanonicalGM` (was plain `isGM` — multi-GM last-writer race).
- **Raw oracle results have a memory home** — `recentOracles` ring → [3b]
  (the assembler variant died with the module — it had rendered a count from
  `oracleResultIds`, a field no code ever wrote). Oracle follow-up prose
  joined the flag family. Decision: decisions.md → "Raw oracle results are
  memory, not just chat".
- **Scene-end tier migration dedups** with the same check as live capture —
  a dedupe hit still marks the truth migrated (the fact IS in the tier). The
  check (`tierHasDetail`) is whole-word containment with no negating or
  reversing word around the shared words: raw substring containment let
  "Distrusts the crew" swallow the scene's "Trusts the crew" (and "Is
  deadly…" swallow "Is dead"), so the new truth was counted migrated and
  written nowhere (issue #347 AB11). The reversing words are a list
  (quit / stopped / ceased, lost, broke, betrayed, abandoned, refused …), two-word
  reversals ("gave up", "turned against", "fell out") and a dis- / un- /
  mis- / non- form of one of the detail's own words around them ("Trusted
  the crew, then distrusted them"); an exact restatement still dedupes
  (issue #347 residual TIER-DETAIL-NEGATION-LIST). A new detail that holds a
  card line's words and says more after them is kept: it repeats the line
  only when all it adds is neutral (the entity's name or role, a pronoun,
  "still", "yet") — "Owes the Syndicate a debt she means to settle by
  selling out the crew" was taken for a repeat of "Owes the Syndicate a
  debt", written nowhere and, at scene end, marked migrated (issue #362
  AC20). A shorter detail the card line already holds is still a repeat.

Reaffirmed as deliberate (decisions.md → "Narrator-context reaffirmations"):
- **Frame applies as an unvalidated full replacement** — the broadened
  consistency check is the staleness/contradiction mitigation (§8.3's fix
  direction, now shipped).
- **Non-move relevance stays lexical** (invariant 5; frame-present union
  carries short turns).
- **WJ threat/faction transitions ride the salience-gated Haiku read**,
  notify-only for lore contradictions; manual `!journal` affordances remain
  the correction path.

## 5. What held up under audit

The single-assembly seam (`buildNarratorExtras`) is honored by every mode;
never-dropped ledger tiers hold in code exactly as documented; state
supersedes cleanly per subject+attribute; the ship-position "do NOT invent"
guard exists; the premise block makes the opening canon durable; parse
tolerance never blocks a narration post; and all ledger writes are
canonical-GM gated.
