# Starforged Companion — Architecture Decisions

Key decisions made during development. Read this before making changes to understand
why things are the way they are. Each decision includes the reason and what was
rejected.

---

## Issue #309 audit: a consequence changes what its move was about; claims before effects; a session ends once (2026-10)

**Decision:** (issue #309. The maintainer asked for every verified finding to
be fixed on 2026-10-29. Each finding's ID in brackets.)
- **XP has no ceiling** [N01]. `awardXP` adds: the vendor's `system.xp` is a
  non-negative integer with no maximum. The 30 was the classic Ironsworn
  sheet's track, never a Starforged rule.
- **A move's consequence card carries what the move was about** [N02, N03,
  N04]. Stat enrichment stamps the vehicle an integrity roll read
  (`vehicleActorId`) and the companion a `companion_health` roll read
  (`companionItemId`); the pipeline adds the move's fight (`moveFight` →
  `combatTrackId`). `persistResolution`'s `targets` puts them on the suffer
  card's `executorOpts`, and its choices change exactly those: integrity on
  the ship record (`updateShip`; a raise refused while the ship's native
  impact says battered), companion health on the asset's track
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
  holder and fight reward — passes the roller.
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
  `actorBridge.js`), never a value past the maximum [F03].
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
  the GM are chained, so two at once cannot both pass the check.
- **A narration in flight when the X-Card is played is discarded** [F13] —
  every narrator entry point re-checks the live X-Card after its Claude call
  returns, before the sidecar or any card (see "X-Card: anyone plays it").
- **Shared-supply mirror writes carry a marker** [F05]. The mirror update
  passes `{ "starforged-companion": { sharedSupplyMirror: true } }` in its
  options and the hook skips marked updates, instead of a global in-flight
  flag that also dropped real edits; a change during a sync is coalesced and
  synced after it.
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
- **Write.** A reflection the player publishes is canon. Its card carries the
  narrator flag family, so the ring and the rolling summary hold it, and the
  canonical GM runs the tier pass for the recorded entities it names
  (`registerPublishedReflectionHook`), as for vow scenes and vignettes. Only
  the published text: the player's own private lines are never published.
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
  run the tier pass for the recorded entities they name. New entities still
  go to the GM's draft card; only make_a_connection auto-creates.

**Rejected:**
- *Detection after embellishment moves.* That class adds texture, not facts.
- *Running detection after vignettes and vow scenes.* They run under
  embellishment and introduce no one new: the vow target is created by Swear
  an Iron Vow.
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
  four hours with no chat message. The canonical GM refreshes
  `lastSessionTimestamp` on chat activity, at most every 10 minutes, and never
  for a session that is already over. The next world load or Begin a Session,
  whichever comes first, starts the new one (`rollSessionIfDue`,
  `src/session/lifecycle.js`): a session nobody ended first gets its rolling
  summary brought up to date, its scene closes under its own id, then the mint.
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
  lore titled with the frame's location.
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
  fact are removed (word-overlap match, `factsOverlap`; pinned details stay);
- the session's World Journal lore that states it goes `retracted` and
  unconfirmed — kept for history, out of ESTABLISHED LORE and the pending
  queue; the detection pass's "lore confirmed" transition cannot re-confirm
  it, and `!journal lore "<title>" confirmed` restores it;
- the rolling summary regenerates on its next refresh, with a leave-out list.

`endScene` keeps the scene's bare strikes on `campaignState.sessionRetractions`
(cap 20, session-keyed), so the CORRECTED block (still capped at 5) and the
summary's leave-out list hold for the rest of the session.

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
- *Propagating into the chronicle.* Its lines feed only the campaign recap;
  left for a follow-up (known-issues.md).

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
hours") and `closeWorld`. Pacing's move-density window still
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
  and no handler writes back a snapshot held across an await (next entry).
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
  can do to what the UI could have produced.

Kinds today: `xcard.activate`, `safety.setFlag`, `session.takeBreak`,
`safety.syncPrivateLines`, `session.begin`, `session.end`, `bond.apply`,
`factContinuity.command`, `oracle.narrate`, `repair.apply`,
`payThePrice.advanceClocks`, `move.burnMomentum`, `move.improveResult`,
`milestone.pick`, `connection.pick`, `fightVow.markMilestone`,
`fightVow.deepenBond`, `suffer.pick` (issue #302), `chronicle.edit` (issue #306 — every Chronicle
write, the automatic writer's included), `payoff.retry` (issue #306 R04 — a payoff failure card's
Retry, GM only). Four older world-writing socket relays predate it
(`expedition.recommit`, `combat.enterFray`, `vow.setReward`,
`vow.linkConnection`) — fold them in when next touched (known-issues
RELAY-LEGACY-KINDS).

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
  write (no await between read and set) and merges (`mergeWithLatestState`):
  **store-owned** fields always take the store's value (`xCardActive`,
  `xCardPlays`, `safety`, `safetyFlags`, `nextMoveAdd`, `questFocus` / `connectionFocus`, the
  session-active and session-id fields (`sessionStartedId` included),
  `customOracles`, `recentOracles`,
  `clocks`, `pacing`, `campaignRecapCache`, `dismissedEntities`, `pendingMove`,
  `activeSectorId`, `incitingIncident`, the `worldTruths*` fields); entity id
  lists are an ordered union; `artAssetIds` (a map) keeps both sides' entries,
  the store's winning a clash; `sessionLogs` come from the store plus this
  resolution's entry; `sessionSummary` by newer `updatedAt`; `legacyTracks`
  take the per-track max (`cleared` sticks); scene ledgers — if the store is
  on a different scene its scene wins wholesale, otherwise `sceneTruths` is
  unioned by id (a retraction on either side sticks) and `sceneState` /
  `sceneFrame` / `spotlight` keep the working copy. Every other field keeps the
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
- Single-field consumers re-read the store: Take a Break's +1 is cleared on
  the store (`clearPersistedNextMoveAdd`), and every narrator X-Card gate reads
  the live setting as well as the caller's snapshot.
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
to the roll's adds and deleting it from the working copy and the store
(`takeNextMoveAdd` + `clearPersistedNextMoveAdd`, `src/moves/nextMoveAdd.js`).
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
  goes through) starts a scene on the canonical GM only (SCENE-START-OFF-GM); a keyless
  author gets the usual "Claude API key not configured" fallback. Since issue
  #286 D2 the narrator side-data is the exception: it is relayed to the
  canonical GM, which starts a scene to hold it (see "Narrator side-data,
  draft confirm and detection").

This is `RUN_ON.CLAUDE` for `@scene`, `!recap`, `!ship envision` / `history`
and `!incite`, and the same ladder in `requestOracleNarration`
(`src/oracles/oracleFollowup.js`, relay `oracle.narrate`) for the follow-up
after `!oracle yes`, `!oracle <table-id>`, `!pay-the-price` and Face Defeat —
where "no key anywhere" skips with a debug line, since the raw card already
carries the result. The move pipeline itself stays canonical-GM-only (single
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
- **The Private Channel** is unchanged: its player's own lines only.

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
`seedFactionRecord`, idempotent). The narrator's FACTION LANDSCAPE renders
records first, WJ-only factions after (`mergeFactionLandscape`).

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
don't name the subject).

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
moves, waypoint match-oracle buttons, expedition recommit, `!sever`, targeted
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
path.)*

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
map; `continue_a_legacy` / `overcome_destruction` are deliberate no-ops (the
module doesn't store legacy tracks per-player).

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
track doesn't exist yet (either click order works).

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
single-word move names in the prose body cannot false-match.

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
  flowing; the confirm dialog still lets the player override.
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

**Files:** `src/index.js` (`releasePendingMoveLock`, the release sites in the
pipeline), `src/moves/riderDialog.js`. Tests: `tests/unit/pipeline.test.js`.

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
active non-GM users. Can be overridden to a fixed value per campaign.

**Why auto rather than a fixed default:** Second person creates intimacy in solo
play — the narrator is addressing the player directly, which suits the journaling
nature of Ironsworn solo. Third person is more natural for multiplayer where
multiple characters are present and "you" becomes ambiguous.

**Both are configurable** in the Narrator tab of module settings. The auto
logic lives in `resolveNarrationPerspective()` in `src/narration/narrator.js`.

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
the rest of the World Journal / Chronicle capture family (none of which the
custom panel renders yet) and are documented in the in-game Settings Reference.
Surfacing the whole capture family as panel rows is a clean later improvement.

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
  to correct).
- **Make a Discovery / Confront Chaos** mark the **discoveries** legacy track
  (2 ticks / 1 tick-per-aspect) via a `legacyMark` consequence.
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
through to author-based resolution rather than being attributed.

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
guard line into the narrator prompt rather than silence.

**Reporter's framing (verbatim):** *"The token was positioned on the sector.
In that instance, it's position should be known. It sounds like there is a
missing hook for placing it on the sector, that then populates the value. If
it isn't on the sector, then the above fallbacks sound great."*

**This refines (does not reverse) Cluster C's "the map follows the fiction":**
both directions now write, disambiguated by provenance — fiction-side writes
sync the token (existing), token-side writes record position
(`updatedBy: "scene_token"`), and every programmatic token move carries the
`POSITION_SYNC_OPTION` update option so the hooks never mistake the module's
own syncs for player statements (without it, the sync's own update would
re-enter the drag handler and dispatch a duplicate set_a_course).

**Boundary kept deliberately:** dropping the token ON a pin (snap radius)
still routes through the Set a Course move — travel under stakes costs a
roll; an off-pin drop is a position note with no move mechanics. The radius
split is the predictable rule for which is which.

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
`endCombat: true`. The "+1 on your next move" option in Gain Ground posts a
reminder card — not auto-applied, no campaignState field, player applies it.

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
A *bonded* connection instead marks the bonds legacy track by the rolled outcome
— **strong hit 2 ticks, weak hit 1, miss 0** — and a **match on a hit raises the
connection's rank by one** (play kit §3.3.5). Orchestration is a pure module
`src/moves/developRelationship.js` (`selectConnection` + `planDevelopRelationship`,
mirroring `expedition.js`/`combat.js`); the resolver emits a `developRelationship`
consequence flag and the GM-gated pipeline handler resolves the target connection
and applies the writes.

- **Weak-hit = 1 tick is a deliberate fill-in.** The play kit text in
  `playkit-rules-and-coverage.md` §3.3.5 only specifies the strong-hit value (2).
  We chose strong 2 / weak 1 / miss 0 — "diminished but present" on a weak hit,
  consistent with the game's general outcome philosophy — rather than leave weak
  undefined. Recorded here so it isn't re-litigated.
- **Target resolution.** The connection is resolved from `interpretation.moveTarget`
  (the named connection) with the same exact→substring→sole-fallback ladder as
  expeditions/combat, except the fallback prefers the **sole bonded** connection,
  then the sole active one. Ambiguous (multiple, no match) → no-op; the move card
  still tells the player to develop a relationship.
- **The old `progressMarked: 1` on this move was a dead no-op** — persistence only
  marks when `progressTrackId` is set, which no resolver populates. Removed.
  *(2026-10: that persistence path is itself removed — see known-issues
  AUDIT-DEAD-SURFACE.)*

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
pilot + gunner each hold their own position). The rulebook is explicit that "there
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
array in `parseDetectionResponse` so it can never be both renamed and recreated.
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
  added as `narratorSpotlightRotation` (world, default on), surfaced under Narrator
  settings.

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

2. **The inciting vow is the crew's shared founding vow.** "⚔ Swear this vow" now creates the vow on
   **every** player character (each copy tagged `flags[MODULE].sharedVow` + the inciting message id),
   and an `updateItem` hook (`registerSharedVowSyncHook`, canonical-GM single-writer, vowId-keyed
   re-entrancy guard) keeps `system.current` / `system.clockTicks` in lockstep across all copies — so
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
