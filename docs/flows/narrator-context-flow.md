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
paced_narrative, scene_interrogation, oracle_followup, session_vignette
(galley and end-session vignettes), clock_advance (a clock's advance or
trigger — its own role and the interaction latitude since issue #322 V23; it
used the vignette's "calm before / after"), vow_swearing (embellishment
latitude — it had none, V23), inciting_incident, campaign_recap (meta — no
sidecar/latitude), round_resolution (a Batch Mode round, issue #340 — see
below). The `!ship
envision/history` and `!lore`/truths generators are separate world-building
prompts outside the memory surfaces (they write Notes/journal canon but don't
read the ledger).

**Where each call runs (multiplayer).** The Claude key is per browser
(issue #209), and the narrator side-data can only be applied on the canonical
GM (§2), so every narrator call runs exactly once, on one chosen client:
- **Move narration** (`narrateResolution`) runs inside the move pipeline, on
  the canonical GM — which `isCanonicalGM()` prefers to be a GM that
  advertised a Claude key (world setting `keyedGmUserIds`,
  `src/multiplayer/gmGate.js`).
- **A Batch Mode round's narration** (`narrateRound`, mode
  `round_resolution`, issue #340) runs once per round in the round driver
  (`src/batch/driver.js`) on the canonical GM, under the move lock, after
  every acting entry is rolled and recorded and its upgrade decided. Context
  goes through the same seam: the entries' text joined for lexical relevance
  and lore; each move entry's own relevance (resolved when it rolled — the
  GM's clarification dialog included) unioned, at the widest class (an entry
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
  stat, outcome, outcome text and price, oracle seeds, the player's sanitised
  line and a latitude line — and the instruction to act for no one else and
  remark on no one who didn't act. Who sat the round out is never sent.
  Perspective "auto" is third person whenever two or more PCs act, whoever is
  connected (`resolveNarrationPerspective`'s `actingCharacters`, from the
  CHARACTER blocks; issue #342 Z40 — a GM's PC beside one player's was
  second person). Its
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
  `!ship history`, `!incite` — route `RUN_ON.CLAUDE` (`CHAT_COMMAND_ROUTES`,
  `src/index.js`; policy in `src/multiplayer/commandRouting.js`): the keyed canonical GM when `hasKeyedActiveGM()`, else the
  author's client with its own key (a keyed player at a keyless-GM table;
  keyless → the usual "key not configured" fallback). Every client reads the
  same setting and user list, so they agree on the runner.
- **Oracle follow-ups** (after `!oracle yes`, `!oracle <tableId>` and
  `!pay-the-price`; a move's routed Pay the Price has none — its price seeds
  the move's own narration, issue #325 W03 — nor does a routed `!ptp` price
  nobody pays, a PC-less player's at a table of several: its card says it was
  not applied and carries no `oracleNarration` or `oracleMemory`,
  PTP-PCLESS-NARRATED-AS-FIRST-PC) go through
  `requestOracleNarration` (`src/oracles/oracleFollowup.js`) with the same
  rule: a keyed GM is connected → `requestGmAction("oracle.narrate")` runs it
  on the keyed canonical GM; else a keyed author narrates locally; else it is
  skipped with a debug line (the raw card already carries the result).
- **Session vignettes** (galley, closing) run in the Begin / End a Session
  relay handlers on the canonical GM (`applyBeginSession` /
  `applyEndSession`), so they need a keyed GM; at a keyless-GM table they are
  skipped.
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
discarded. With no GM connected nothing can be recorded (debug-logged). The
post-narration capture (§2) does not run off the canonical GM: an `@scene`
answered on a player's client used to run the detection and tier passes,
whose World Journal, draft-card and NPC-card writes were refused there
(issue #321 U36).

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
early on player clients, so only the GM's own lines were ever stored. [1] is
built by `formatNarratorSafetyContext`, which scopes Private Lines to the
building client: on a GM's client every player's lines (deduplicated); on a
player's client — narrating only with no keyed GM online — that player's own,
read from their client setting, never another player's. Before 2026-10 the
shared prompt passed no user id and carried no Private Line at all
(SAFETY-PRIVATE-LINES-SHARED). The Private Channel passes its player's id
(`src/private-channel/context.js` `buildPrivateContext`).

**The Private Channel** (issue #286 D1) builds its own Haiku prompt but reads
what the main narrator knows, rendered by the same section formatters
(`buildPrivateChannelStory` → `buildSharedStorySections`): world truths and the
campaign premise in its cached prefix; LAST SESSION, STORY SO FAR, the cards of
the recorded entities the message or the scene frame names (lexical, plus
`addSceneFrameCast`) and the scene ledger in the per-turn message. Its
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
reflection is canon) — against the caller's
campaignState **and** the live stored setting (`isXCardActive`,
`narrator.js`, exported with `watchXCard` for the Private Channel; recaps carry no gate): the move pipeline narrates from a
snapshot taken before its confirm dialog and Claude calls, so a card played
meanwhile is only visible in the store. Each gate runs twice — on entry and
again the moment the Claude reply arrives (`watchXCard(…).interrupted`), before the
sidecar is applied: a card played while the reply was generated discards it
(no card, no audio, no ledger facts, no post-narration passes — issue #300
F13), and the entry point stands down as it would have on entry. The watch
starts on entry with the live `campaignState.xCardPlays` count (each
`suppressScene` adds one; resuming never lowers it), so a card played **and
resumed** before the reply arrives still discards it (issue #306 R01) —
`persistResolution` keeps the store's count (store-owned). A move resolved under the X-Card still
posts its result card, then a short "narration paused" notice
(`narrationPaused` flag, outside the flag family) instead of narration — the
move-path gate had been lost with the retired assembler (ASSEMBLER-003). When
the card was played and resumed mid-call, the notice (and `@scene`'s card)
says the narration was discarded instead.

**The X-Card removes the narration it answers** (issue #321 U07 — full
exclusion, a maintainer decision). In the same write as the pause,
`suppressScene` (`src/context/safety.js`, on the canonical GM) calls
`applyXCardToNarratorMemory` (`narrator.js`), which picks the cards with
`xCardedNarrationCards`: the newest narrator card of the session still in
narrator memory, with the narrator cards of the same beat — those after the
last message someone sent (a forced move's post — the Roll button's re-post
of the player's line, a button's forced move — counts as one, issue #326 W42)
and at most two minutes older; an earlier X-Card's
card, its "X-Card cleared" card or a card an earlier X-Card removed bounds
the beat, so a repeat play removes nothing more (fallback, burn-superseded
and whispered cards are never chosen). It retracts what their sidecars wrote
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
narration truth it closes on `sessionRetractions.narrated`, unnamed, which an
X-Card on that narration — the session's newest, its scene since ended —
moves to the blocks: the ledger it retracts holds none of them, and nothing
stopped the narrator re-asserting them (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED) — state
values removed — each gives way to the value it superseded, kept on the entry
as a bounded `previous` chain, so an earlier kept narration's value stands
again (issue #326 W41) — a frame they wrote cleared), appends their `narrationId`s to
`xCardedNarrationIds` (cap 50), drops a rolling summary that covered them
(text emptied, a regen due — stamped with a fresh `updatedAt` and
`xCardedAt`, so a move in flight cannot merge its working copy's older
summary back over it, and a regen whose Haiku call was out when the card was
played discards its reply; issue #325 W06) and sets `xCardRedirect` — on
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
versions before as `previous`, newest first, up to three), Session Log beat,
tier detail and placeholder rename (`renamedBy` on the card — the X-Card puts
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
threat, faction or place page, takes the beats off the Session Log page and
drops the tier details — a detail the GM had promoted takes the line its ⤴
Promote appended with it (the entry keeps `promotedText` beside its
`narrationId`): off the sheet's Notes tab for an NPC card or a ship, else out
of the record's notes (issue #338 D7); a Promote never promotes an X-carded
narration's detail, and one whose Notes write the X-Card overtook takes its
own line back off the tab (issue #342 Z44) — most of these restate no sidecar truth, so
`propagateRetraction` never reached them. A capture still running when the
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
scene's). A state transition the capture
applies to an entry it did not make — a threat resolved or escalated
(`updateThreatSeverity`), lore confirmed (`promoteLoreToConfirmed`), a
faction's attitude (`recordFactionIntelligence`) — is stamped the same way and
put back with it; the stance an attitude moved on the faction's record (the
canonical stance, `recordStance` before → after) is put back too, where the
record still holds what the narration set (known-issues
XCARD-CAPTURE-TRANSITIONS). If that part fails the pause is still written. After the write the cards are flagged
`xCarded` (`flagXCardedCards`) and each retracted truth runs
`propagateRetraction`. Readers: the ring and the rolling summary skip
`xCarded` cards (`sessionNarratorCards`), the session recap keeps the move
but quotes none of its prose, the audio hook shows no Play button, the
CORRECTED block and the summary's leave-out list never name an X-Card
retraction (it still blocks re-assertion in the ledger),
`mergeSceneLedgers` strips an X-carded narration's entries from a stale
working copy (its frame yields to the store's), and a relayed sidecar of an
X-carded narration is dropped. **[1b] X-CARD — REDIRECT**: while
`xCardRedirect` is set for the session (read from the store,
`extras.xCardRedirect`), every prose mode carries a block telling the
narrator to take the story elsewhere without naming the removed beat;
`registerXCardRedirectHook` (canonical GM) clears it when the first narrator
card posts with the X-Card lifted — not a fallback, a published reflection or
an X-carded card.

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
leaves both out of the ring, the rolling summary's source and the recap.
Their ledger entries are
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

**System prompt section map** (`buildNarratorSystemPrompt`,
`src/narration/narratorPrompt.js`): [0] role/style per mode · [0b]
campaign recap (a session's first narration in any prose mode, from
`campaignRecapCache` while it matches the chronicle — issue #286 C3, #301
B04) · [1] safety (the stored Lines / Veils / Private Lines — issue #321
U08) · **[1b] X-Card redirect** (prose modes, until the first narration after
a GM resumes has posted — issue #321 U07, above) · [2] permission-class latitude · [2.5]
Battle Stations · [3] oracle seeds (move-provided only; a routed Pay the
Price is the one its card rolled — `withPayThePriceSeed`, issue #321 U03) · **[3b] recent
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
SESSION (`previousSessionSummary`, kept at the mint — issue #286 C3), then the
rolling session summary, each prefixed with a **ledger-wins caveat** — a
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
Issue #290: only the retired assembler had rendered them, TRACKS-UNPORTED)
· [5] current location card · [5b]
active-sector anchor (each settlement with its planet and stellar object, as
its card shows them — `formatSettlementPlanet`, issue #321 U51; the sector's
connections as reuse-first cast, and a lost one apart, its line saying how it
was lost — issue #325 W37) · [6] matched entity cards (a connection's card also
shows its goal, a lost or forged bond and its last three `history` events —
C5) · [6.5] active-scene ledger
(SCENE FRAME → TRUTHS → **CORRECTED** → STATE → SHIP POSITION;
`maxLedgerTokens` sheds state only, line by line with location / vessel /
condition last — frame/truths/corrections/ship are
never dropped) · ([7], a legacy count of `connectionIds` that counted a
lost connection as active, is retired — issue #331 X29) · [8]
CHARACTER STATE (vows and bonds with progress and their rank by name — issue
#321 U62 — granted rewards — C5) · [8b]
party roster · [8c] spotlight nudge · [9] sidecar
instruction (last; includes the record-anchors-once and never-re-assert-
CORRECTED rules) · [10] audio markup.

**Relevance** (`src/context/relevanceResolver.js`): Phase 1 is a lexical name
index (full name + first/last word of multi-word names, lowercased,
dismissed-list filtered; since issue #286 a name part is never an article,
title or other noise word, never a word two entities share, and never
shadows another entity's full name); Phase 2 (Haiku) fires only for hybrid *moves*.
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
`narratorContextCards`). Each entry leads with the player's line that
prompted it (`PLAYER — <name> wrote: "…"`, B5): move and paced cards store
`playerText` + `playerName`, @scene answers `sceneQuestion` + `playerName`. A
paced line from a player with no character of their own at a table of several
is narrated with no character — no CHARACTER block, no speaker, `playerName`
null ("Player") — never as the campaign's first PC (issue #342 Z50).
The rolling summary reads the same entries (`ringEntryText`), so what a
player wrote reaches it too. Both read the session's cards through
`sessionNarratorCards`, which leaves out a "narration unavailable" card
(`narrationFallback` — it keeps the flag family so the session recap still
counts the move, but was fed back as story and counted as the session's first
narration, cancelling the campaign recap; issue #321 U35) and a card the
X-Card removed (`xCarded`, U07). Its regen runs after a narrator card posts, on
the canonical GM (`registerRollingSummaryRefreshHook`, B7); prompts read the
cached text.

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
an unended session's summary is brought up to date
(`finalizeSessionSummary`) — an ended one's too when it has no text: End a
Session finalises its own, but an X-Card on End's closing vignette empties a
summary that covered the beat it removed, and nothing regenerated it (issue
#342 Z41) — its scene closes under its own id, then
`mintSession` keeps that summary as `previousSessionSummary` — a session
nobody began (no Begin stamped it, its gate shut, End a Session did not close
it) hands its number on (issue #330 D12; one End a Session closed counts as
begun, issue #331 X64) and adds its summary to the one before it, which stays
LAST SESSION under its own number (it replaced it — issue #331 X65) — mints
the next id and closes the session-active gate (`sessionActive` / `sessionActiveStartedAt`
joined `SESSION_MINT_FIELDS`): the new session is begun by Begin a Session —
a session nobody ended handed its open gate to the next, so Begin did nothing
(issue #321 U12). Begin a Session's start effects (Spotlight momentum, campaign clocks, the
galley vignette) run once per session id: `applyBeginSession` stamps
`sessionStartedId`, and a second Begin on that session posts a note instead
(the dialog does not open for it) — issue #300 F11. Begin works on a copy of
the stored value, so a refused save leaves the GM's cache unbegun and a retry
starts the session (issue #309 N09) — and the table is told: the GM posts "The
session was not started … No momentum was applied … Try Begin a Session
again" where the Begin card is (issue #329 X13). End a Session's effects (scene close,
summary, Session Log, the focus momentum, the closing vignette) run once per
session id too: `applyEndSession` runs one End at a time on the canonical GM,
and an End on a session already ended only replaces the focus for next
session and posts a note — its momentum is paid for the first focus noted,
once (issue #309 N08). What carries over to the new session's prompts: LAST SESSION ([4c], every
prose mode), the campaign recap ([0b], the session's first narration — no
narrator card of the session yet — read from its cache, which End a Session
and a new session's world load refresh), entity cards with their tiers and
LAST KNOWN, established lore and the campaign premise. The recap cache stores
the chronicle it was made from (`chronicleLength` + `chronicleHash`, over
each entry's text, timestamp and session number — `campaignRecapCacheKey`);
`getCampaignRecap` and the session-opening read use it only while that still
matches, so a corrected entry is never recapped in its old form, and with no
key to regenerate there is no recap rather than a stale one (issue #301 B04 —
the check was the entry count alone, and the session-opening read had none).

**Ledger scope** ([6.5]): scene subjects and free-text subjects (unrecorded
figures and places — the ledger holds only this scene) are always in scope
(B4: they used to need their exact phrase in the player text or the frame);
recorded entities are in scope when matched, at the current location, or in
the frame's cast. The ledger is read from the store when the narration is
built — the scene, its truths, state and frame, and the session's strikes
(`narratorPrompt.SCENE_LEDGER_FIELDS`, carried as `extras.sceneLedger` by
`buildNarratorExtras`, which also reads the frame's cast, the lore query and
the spotlight from it): the move pipeline narrates from a snapshot taken
before its confirm dialog, and an X-Card played (and resumed) meanwhile had
retracted the beat's truths, removed its state and cleared its frame only in
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

Prose + fenced JSON sidecar → `extractSidecar`
(`src/factContinuity/sidecarParser.js`: the sidecar's fence is ```` ```json ````,
```` ``` json ```` or a bare ```` ``` ```` whose body opens with `{` — a bare
fence used to post the raw JSON on the card and lose the turn's facts, issue
#321 U41; the last such block wins and every one is stripped from the prose;
unknown keys dropped; an unclosed fence's tail is stripped and parsed — a
complete object applies, a truncated one is a parseError and is discarded; a response with
**no fence at all now warns** in `applyNarratorSidecar` — the sidecar is
mandatory, so a missing fence is a lost frame update, not a quiet no-op) →
`applyNarratorSidecar` (canonical-GM only): truths append **with dedup**
(subject + normalised fact; a match against a *retracted* truth blocks the
append — the correction stands) / state supersede per subject+attribute
(`ledgers.js`), subjects resolved against `collectAllEntities` (passed
through in its own shape — `entityId` is the host document id; entity state
keys are `entity:<id>`; issue #286 A1), ship
`position` stateChanges routed to the §20 ship record, `applySceneFrame`
full-replacement snapshot — each truth, state value and the frame stamped
with the narration's `narrationId` (`newNarrationId`; issue #321 U07, for the
X-Card) — the consistency check (on by default), then the
card posts with the flag family (`narratorCard`/`narrationText`/`sessionId`,
and the same `narrationId`) for the ring. Off the canonical GM the sidecar is still stripped from the
prose and no audit runs; the side-data is relayed to the canonical GM
(`narrator.sidecar`, issue #286 D2 — see "Where each call runs").

**Post-narration capture** (the combined detection pass — World Journal lore,
threats, new-entity drafts — and the generative-tier pass): discovery-class
moves run detection (make_a_connection auto-creates on a hit); interaction-
class moves run the tier pass and, since issue #286 D4, detection too, as
paced narration (the same class) always has; embellishment moves run
neither. Oracle follow-ups run detection and the tier pass; session
vignettes and vow scenes run the tier pass for the recorded entities they
name (`scheduleNarrationCapture`). `@scene` answers run detection and the
tier pass too, on the canonical GM only (`scheduleSceneAnswerCapture`, issue
#321 U36). A Batch Mode round runs one detection, at the widest class among
the entries it captures, and a tier pass whatever that class is, over what
each interaction-class entry was about, by that entry's free-flow rule — an
unrolled action the prompt's matched set (paced), a rolled interaction move
its own relevance (`roundTierRefs`; issue #342 Z10 — it ran over the rolled
moves' entities only, and not at all beside a discovery roll). New entities from any of these queue on
the GM's draft card — only make_a_connection auto-creates; the card carries
the PC the narration was for (`actorId`, every path that knows it), whose
sheet a confirmed connection's bond Item goes on (issue #321 U23) — a
round's card every acting PC (`actorIds`), its connection rows' Confirm asking
which of them, or no one (issue #342 D3). The
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
and a frame it wrote yields to the store's, issue #321 U07). The registrations that run inside those long
callers write only their own key onto the latest store, never the caller's
copy: an entity creator's id (`registerEntityIdInStore`, `entities/registry.js`
— the Make a Connection auto-create used to write the pipeline's snapshot whole
and clear a mid-narration X-Card, issue #300 F14), a portrait's art-index entry
(`storeArtAsset`), and a new sector (`storeSector`). Since issue #321 U06 so
do the other writers that hold a snapshot across an await: `!lore` writes only
`loreRecap` (`mergeOwnedFields`; store-owned in `persistResolution`'s merge,
U06a/g); `!truth` / `!state` and the correction dialog work on a fresh copy
and persist only the ledger field they changed through
`persistSceneLedgerFields`, a Strike's or Replace's regen mark on the stored
rolling summary riding the same write (`opts.onto` → `markSummaryForRegen`,
U06b/e); the inciting premise is written with its scene ledgers the same way
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
the strong hit's re-narration the undone price was established) — for section [3b]
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
the answer without the frame, truths, state or CORRECTED list.
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
the scene id).
It keeps each recorded character's location / vessel / condition on their
record as `lastKnown` (C1, rendered as LAST KNOWN on the card) — each value
with the `narrationId` that set it and the values it superseded (`previous`,
newest first, up to four; issue #335 Y01) — and every migrated tier detail and
archived Lore page carries its truth's `narrationId`, for an X-Card played
after the scene ended (above). It discards state and clears the frame.
Before that final write it re-reads the store and, while the store is
still this scene, migrates the truths and keeps the whereabouts that a
narration persisted during its awaits (`migrateLateSceneFacts`, a few
passes) — the final write used to clear them unmigrated (issue #325 W24).
Both persist only their scene fields
(`currentSceneId`, `sceneTruths`, `sceneState`, `sceneFrame`, `spotlight`)
onto the latest stored campaignState (`persistCampaignStateFields`;
`endScene`'s own `persistEndedScene`, on the same write chain) — when
`ensureSceneStarted` runs inside `narrateResolution` the object it holds is the
pipeline's stale snapshot. `endScene`'s write also keeps the scene's strikes,
X-Card retractions and live narration truths for the session (B6;
`sessionRetractions` — below), added at that write's turn onto the session's
list as the store has it then, the scene's truths seen through the store's
`xCardedNarrationIds` (`endedSceneRetractions` → `retractNarrations`): it
wrote its copy's list whole, so an X-Card played during its awaits lost what
it wrote there — a strike it took over was named again, and the scene's
truths it retracted were kept live (XCARD-DURING-SCENE-END-RACE). Triggers for `endScene`: the two
commands, the implicit path, **End Session**
(`session_close`), and the close-out before a new session is minted
(`rollSessionIfDue`: `session_gap_remint` for a session that went idle,
`session_close` for one that was ended — which closes the scene End a
Session's closing vignette opens after End closed its own, issue #321 U34) —
session boundaries no longer leak scene truths into the next session's empty
ring, and the closing scene's truths keep the closing session's number.

**Corrections & defenses:**
- The ledger block's binding wording, plus the **CORRECTED block**: a bare
  Strike renders as "retracted by the table — do NOT re-assert" (capped at
  the 5 most recent, never dropped under budget; Replace-corrections are
  exempt — the replacement truth stands; an X-Card retraction is never named
  there, issue #321 U07). The write layer refuses narrator
  re-assertions of retracted facts; GM `!truth set` bypasses (GM authority) —
  and lifts the strike it re-establishes, linking it as a Replace does, so
  the fact is not binding and CORRECTED at once; a player's set over a GM's
  strike is refused (issue #326 W60); the lore the lifted strike retracted
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
  label, other lore must name the text subject or the entity as whole words,
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
  rolling summary regenerates on the next refresh with a "RETRACTED BY THE
  TABLE — leave these out" list. `endScene` keeps the scene's bare strikes on
  `campaignState.sessionRetractions`, so CORRECTED and that list hold for the
  rest of the session — the ring and the summary's source prose still state
  the fact after the scene closes. Strikes are told apart by subject and
  fact together, so two characters' identical struck facts are both kept
  (U39). A kept strike keeps its truth's id, subject key and who struck it,
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
  end cleared (XCARD-RETRACTION-SCENE-SCOPED). Its live narration truths are
  kept too (`sessionRetractions.narrated`, unnamed, read only by the X-Card's
  `retractNarrations`), so an X-Card on a narration whose scene has ended
  blocks what it recorded (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED).
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
- **Scene-end tier migration dedups** with the same containment check as
  live capture — a dedupe hit still marks the truth migrated (the fact IS in
  the tier).

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
