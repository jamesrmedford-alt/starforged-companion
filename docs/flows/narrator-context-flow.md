# Narrator context flow — as implemented

Where every byte of narrator context comes from, how narrator output becomes
memory, and what defends against contradictions — verified against source
(v1.7.30 cycle; where narration runs, the X-Card gate, Private Lines and the
stale-snapshot persists updated for the 2026-10 audit). Companion to
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
(galley, end-session, clock/trigger vignettes), vow_swearing,
inciting_incident, campaign_recap (meta — no sidecar/latitude). The `!ship
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
- **Claude-calling chat commands** — `@scene`, `!recap`, `!ship envision`,
  `!ship history`, `!incite` — route `RUN_ON.CLAUDE` (`CHAT_COMMAND_ROUTES`,
  `src/index.js`; policy in `src/multiplayer/commandRouting.js`): the keyed canonical GM when `hasKeyedActiveGM()`, else the
  author's client with its own key (a keyed player at a keyless-GM table;
  keyless → the usual "key not configured" fallback). Every client reads the
  same setting and user list, so they agree on the runner.
- **Oracle follow-ups** (after `!oracle yes`, `!oracle <tableId>`,
  `!pay-the-price` and the pipeline's Face Defeat roll) go through
  `requestOracleNarration` (`src/oracles/oracleFollowup.js`) with the same
  rule: a keyed GM is connected → `requestGmAction("oracle.narrate")` runs it
  on the keyed canonical GM; else a keyed author narrates locally; else it is
  skipped with a debug line (the raw card already carries the result).
- **Session vignettes** (galley, closing) run in the Begin / End a Session
  relay handlers on the canonical GM (`applyBeginSession` /
  `applyEndSession`), so they need a keyed GM; at a keyless-GM table they are
  skipped.

When a call runs off the canonical GM (the author fallbacks above), its prose
posts normally and `applyNarratorSidecar` relays its side-data to the canonical
GM (GM relay `narrator.sidecar` → `applyRelayedNarratorSidecar`, issue #286
D2), tagged with the scene it was written in: the GM drops it if that scene
has ended and starts one if none is active. It used to be discarded. With no
GM connected nothing can be recorded (debug-logged).

**Safety [1] and the X-Card.** [1] renders `campaignState.safety` global
Lines / Veils. Each player's Private Lines now reach
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
`addSceneFrameCast`) and the scene ledger in the per-turn message. It writes
nothing during a conversation. A reflection the player publishes is canon:
its card carries the flag family (ring, rolling summary), and the canonical
GM runs the tier pass for the entities it names
(`registerPublishedReflectionHook`). No ledger facts — the private narrator
emits no sidecar. The X-Card
(`xCardActive`, set by the `xcard.activate` relay) is checked by every
narrator X-Card gate — move, paced, `@scene`, oracle follow-up, session and
clock vignettes, vow swearing, inciting incident — against the caller's
campaignState **and** the live stored setting (internal `isXCardActive`,
`narrator.js`; recaps carry no gate): the move pipeline narrates from a
snapshot taken before its confirm dialog and Claude calls, so a card played
meanwhile is only visible in the store. Each gate runs twice — on entry and
again the moment the Claude reply arrives (`xCardPlayedDuringCall`), before the
sidecar is applied: a card played while the reply was generated discards it
(no card, no audio, no ledger facts, no post-narration passes — issue #300
F13), and the entry point stands down as it would have on entry. A move resolved under the X-Card still
posts its result card, then a short "narration paused" notice
(`narrationPaused` flag, outside the flag family) instead of narration — the
move-path gate had been lost with the retired assembler (ASSEMBLER-003).

**System prompt section map** (`buildNarratorSystemPrompt`,
`src/narration/narratorPrompt.js`): [0] role/style per mode · [0b]
campaign recap (a session's first narration in any prose mode, from
`campaignRecapCache` while it matches the chronicle — issue #286 C3, #301
B04) · [1] safety · [2] permission-class latitude · [2.5]
Battle Stations · [3] oracle seeds (move-provided only) · **[3b] recent
oracle results** (`campaignState.recentOracles` — raw `!oracle` (incl.
`!oracle <tableId>` and custom-table rolls) / `!ptp` outcomes, last 5 this
session, "the dice established these"; skipped for meta modes) · [4] world
truths · [4a] campaign truths digest · [4b] campaign premise
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
active-sector anchor · [6] matched entity cards (a connection's card also
shows its goal, a lost or forged bond and its last three `history` events —
C5) · [6.5] active-scene ledger
(SCENE FRAME → TRUTHS → **CORRECTED** → STATE → SHIP POSITION;
`maxLedgerTokens` sheds state only, line by line with location / vessel /
condition last — frame/truths/corrections/ship are
never dropped) · [7] legacy connections summary (count only) · [8]
CHARACTER STATE (vows and bonds with progress, granted rewards — C5) · [8b]
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
`playerText` + `playerName`, @scene answers `sceneQuestion` + `playerName`.
The rolling summary reads the same entries (`ringEntryText`), so what a
player wrote reaches it too. Its regen runs after a narrator card posts, on
the canonical GM (`registerRollingSummaryRefreshHook`, B7); prompts read the
cached text.

**Across sessions** (issue #286 C3, C4, `src/session/lifecycle.js`). The ring,
the rolling summary and recent oracles are scoped to `currentSessionId`. A
session is over once End a Session marks it (`sessionEndedId`) or after four
hours with no chat message — the canonical GM refreshes `lastSessionTimestamp`
on chat activity, at most every 10 minutes, and never for a session already
over (`registerSessionActivityHook`). The next world load (`initSessionId`,
ready hook) or Begin a Session, whichever comes first, runs `rollSessionIfDue`:
an unended session's summary is brought up to date
(`finalizeSessionSummary`), its scene closes under its own id, then
`mintSession` keeps that summary as `previousSessionSummary` and mints the next
id. Begin a Session's start effects (Spotlight momentum, campaign clocks, the
galley vignette) run once per session id: `applyBeginSession` stamps
`sessionStartedId`, and a second Begin on that session posts a note instead
(the dialog does not open for it) — issue #300 F11. What carries over to the new session's prompts: LAST SESSION ([4c], every
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
the frame's cast.

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
(`src/factContinuity/sidecarParser.js`; last fence wins, unknown keys
dropped, unclosed fence → parseError + sidecar discarded; a response with
**no fence at all now warns** in `applyNarratorSidecar` — the sidecar is
mandatory, so a missing fence is a lost frame update, not a quiet no-op) →
`applyNarratorSidecar` (canonical-GM only): truths append **with dedup**
(subject + normalised fact; a match against a *retracted* truth blocks the
append — the correction stands) / state supersede per subject+attribute
(`ledgers.js`), subjects resolved against `collectAllEntities` (passed
through in its own shape — `entityId` is the host document id; entity state
keys are `entity:<id>`; issue #286 A1), ship
`position` stateChanges routed to the §20 ship record, `applySceneFrame`
full-replacement snapshot, the consistency check (on by default), then the
card posts with the flag family (`narratorCard`/`narrationText`/`sessionId`)
for the ring. Off the canonical GM the sidecar is still stripped from the
prose and no audit runs; the side-data is relayed to the canonical GM
(`narrator.sidecar`, issue #286 D2 — see "Where each call runs").

**Post-narration capture** (the combined detection pass — World Journal lore,
threats, new-entity drafts — and the generative-tier pass): discovery-class
moves run detection (make_a_connection auto-creates on a hit); interaction-
class moves run the tier pass and, since issue #286 D4, detection too, as
paced narration (the same class) always has; embellishment moves run
neither. Oracle follow-ups run detection and the tier pass; session
vignettes and vow scenes run the tier pass for the recorded entities they
name (`scheduleNarrationCapture`). New entities from any of these queue on
the GM's draft card — only make_a_connection auto-creates. Lore about a
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
`nextMoveAdd`, `clocks`, `recentOracles` take the stored value; same-scene
`sceneTruths` union by id with retractions sticky; a scene change mid-move
keeps the stored scene ledgers). The registrations that run inside those long
callers write only their own key onto the latest store, never the caller's
copy: an entity creator's id (`registerEntityIdInStore`, `entities/registry.js`
— the Make a Connection auto-create used to write the pipeline's snapshot whole
and clear a mid-narration X-Card, issue #300 F14), a portrait's art-index entry
(`storeArtAsset`), and a new sector (`storeSector`).

**The flag family covers every fiction card** (2026-07): move narration,
paced, @scene, inciting incident, galley/end-session vignettes, **vow-swearing
scenes**, **clock vignettes (all three post sites: Pay the Price, Begin
Session, manual advance)**, and **oracle follow-up narrations**. Raw oracle
*results* additionally carry a structured `oracleMemory` flag; the canonical
GM's capture hook (`registerOracleMemoryCaptureHook`, `src/index.js`) ledgers
them into `campaignState.recentOracles` (`src/oracles/oracleMemory.js`,
cap 8) for section [3b] (the retired assembler's RECENT ORACLES section
went with the module, 2026-07 — issue #271).

**Scene lifecycle** (`src/factContinuity/sceneLifecycle.js`): scenes start on
`!scene start`, `ensureSceneStarted` on the first move/@scene/paced
narration, **or the inciting incident** (so the premise sidecar writes into a
real scene the first move then *continues* — the opening NPC state and frame
survive). `@scene` **continues** the scene in progress (issue #286 A4): it
used to call `startScene`, which ended the scene it was asked about and wrote
the answer without the frame, truths, state or CORRECTED list.
`ensureSceneStarted` starts a scene on the **canonical GM only** — a scene
boundary is a world write, so a keyed player's client narrating `@scene` /
`!incite` with no keyed GM online leaves it to the GM (debug-logged). `startScene` implicitly ends a prior
scene when truths/state exist. `endScene` migrates entity-kind truths →
generative tiers (deduped against existing tier details — live capture +
migration no longer double-lands); scene-kind truths → the tier of the
scene's recorded place (issue #286 C2, `resolveScenePlace`: the frame's
location when it names or mentions exactly one recorded place, else the
current location when the frame names no place); text truths and place-less
scene truths → WJ Lore (titled with the frame's location, not the scene id).
It keeps each recorded character's location / vessel / condition on their
record as `lastKnown` (C1, rendered as LAST KNOWN on the card), keeps the
scene's strikes for the session (B6), then discards state and clears the
frame. Both persist only their scene fields
(`currentSceneId`, `sceneTruths`, `sceneState`, `sceneFrame`, `spotlight`)
onto the latest stored campaignState (`persistCampaignStateFields`) — when
`ensureSceneStarted` runs inside `narrateResolution` the object it holds is the
pipeline's stale snapshot. Triggers for `endScene`: the two
commands, the implicit path, `closeWorld`, **End Session**
(`session_close`), and the close-out before a new session is minted
(`rollSessionIfDue`: `session_gap_remint` for a session that went idle) —
session boundaries no longer leak scene truths into the next session's empty
ring, and the closing scene's truths keep the closing session's number.

**Corrections & defenses:**
- The ledger block's binding wording, plus the **CORRECTED block**: a bare
  Strike renders as "retracted by the table — do NOT re-assert" (capped at
  the 5 most recent, never dropped under budget; Replace-corrections are
  exempt — the replacement truth stands). The write layer refuses narrator
  re-assertions of retracted facts; GM `!truth set` bypasses (GM authority).
- **A Strike reaches every copy** (issue #286 B6): `!truth strike` and the
  correction dialog's Strike / Replace call `propagateRetraction` — the
  subject entity's same-session tier details that state the fact are dropped,
  matching same-session lore goes `retracted` + unconfirmed (out of [4f] and
  the pending queue; the detection pass cannot re-confirm it), and the
  rolling summary regenerates on the next refresh with a "RETRACTED BY THE
  TABLE — leave these out" list. `endScene` keeps the scene's bare strikes on
  `campaignState.sessionRetractions`, so CORRECTED and that list hold for the
  rest of the session — the ring and the summary's source prose still state
  the fact after the scene closes.
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
