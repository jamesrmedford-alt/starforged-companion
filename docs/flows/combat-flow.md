# Combat flow — as implemented

A stage-by-stage map of the combat lifecycle as the code actually implements it,
verified against source. File references name the owning function; line numbers
drift, so search by symbol. Sibling docs: `vow-flow.md`, `connection-flow.md`,
`exploration-flow.md` (same treatment for the other lifecycles).

Two cross-cutting facts to hold onto:

- **The move pipeline runs only on the canonical GM client** (`isCanonicalGM()`
  gate at the top of the narration handler in `src/index.js`); the inner
  `game.user.isGM` checks on each consequence branch are belt-and-suspenders.
  Its effects credit the **roller**: one `rollerActor` (the message's speaker,
  first PC only as a fallback) drives the stat enrichment, the decisive-action
  cost and Face Defeat Pay the Price routes, and the won-fight card and reward
  (decisions.md → "Multiplayer attribution").
- **Card-button world writes run on the canonical GM.** The won-fight buttons
  (§4), Burn Momentum and Improve Result relay through `requestGmAction`
  (`src/multiplayer/gmRelay.js` `GM_ACTIONS` — serialised, one-shot per card,
  a no-GM warning and a re-armed button when the click is not delivered).
  Burn and Improve open only once the pipeline has persisted the original
  outcome and stamped the card `originalApplied` (until then the button is
  disabled and the GM handler refuses — issue #300 F02); each swaps that
  recorded original for the upgraded outcome, burns the PC's live momentum
  (bounds from `actorBridge.readMomentumState`), and spends the other, so one
  card is upgraded at most once. The pipeline gives each resolution an `_id`
  so the upgrade can strike the original narration card. The
  threshold card's **Enter the Fray** still uses its older ad-hoc relay
  (socket kind `combat.enterFray` on `module.starforged-companion`, handled on
  the canonical GM — no no-GM warning).
- **Combat state lives on a journal progress track** (`type: 'combat'` in the
  Starforged Progress Tracks journal flag), not on the Foundry Combat document.
  The Combat document (combat tracker) is a UI mirror, created/deleted
  alongside the track when `combatTrackerEnabled` is on.

## 1. A fight is offered, not forced

`enter_the_fray` is an action move; **all three outcomes** set `enterCombat`
(`src/moves/resolver.js`), differing in the opening position: strong hit → +2
momentum and `in_control`; weak hit → a choose-one (+2 momentum OR in control);
miss → `bad_spot`.

The pipeline's `enterCombat` branch (`src/index.js`) does **not** create a
track. If no matching open combat track exists (`selectCombatTrack`,
`src/moves/combat.js`), it posts the **threshold decision card**
(`buildCombatThresholdHtml`, `src/moves/combatThreshold.js`):

- header "⚔ A fight looms — <foe>" with the foe from `interpretation.moveTarget`;
- a **rank select** pre-set from the AI interpreter's `combatRank`
  (default "dangerous") — the player can re-rank before committing;
- a **"This fight serves" vow picker** listing the speaker's open vows;
- a free-text **objective**;
- the carried **opening position line** ("⚑ If you enter this fight, you begin
  in control / in a bad spot") when Enter the Fray's own outcome set one;
- **⚔ Enter the Fray** and **🚪 Find another way** buttons.

**Enter the Fray** reads rank/vow/objective (+ the carried position) from the
card and creates the track on the canonical GM (socket kind `combat.enterFray`
relays player clicks). `createCombatTrackFromThreshold` → `applyCombatProgress`
→ `addProgressTrack`; the track carries `label`, `rank`, `ticks`, `objective`,
`linkedVowName`, and gets its `combatState` set from the carried position via
`applyCombatPositionToTrack` (`src/moves/combatTracker.js` — writes the track,
the actor's sheet field, and the combatant badge). A combat-track card posts
(stakes line, **Battle instead** button on fresh tracks; flagged with the
track's `trackId` / `trackLabel`, which Battle forwards) and the Foundry Combat
doc opens with position/range badges.

**Find another way** posts the way-out card: the `WAY_OUT_PROMPT` nudge plus
one-click **Face Danger / Compel / Secure an Advantage** buttons
(`WAY_OUT_MOVES` / `buildWayOutHtml`), each posting the forced move so
choosing an exit rolls it (2026-07 soft-spot cleanup — it used to be
advisory text only).

Combat tracks carry **no promised reward** of their own — `proposeRewards` runs
only for vows; a fight's payoff rides the *linked vow's* promised reward (see
§4). Combat tracks also get no clock (only scene challenges auto-clock).

## 2. During the fight

Progress marks come only from move consequences (`combatProgress` in
`mapConsequences`): Strike hits mark 2; Clash marks 2 (strong) / 1 (weak); Gain
Ground marks only when the player picks that option in its choose-one; React
Under Fire marks none. Marks are rank-aware (`markProgressById` — dangerous = 8
ticks/mark). Misses mark nothing and route Pay the Price; the fight stays open.

**Position** (`in_control` / `bad_spot`) is written to the track and mirrored
to the actor + combatant badge (`applyCombatPositionToTrack`). The pipeline
writes it to the move's own fight (`moveFight`): the track its progress marked
(or created), else `selectCombatTrack` on the move's target, else the sole
open fight — with several fights open it used to be written only while
exactly one was open (issue #306 R05). The same `moveFight` is stamped on the
move card for its Finish the Fight button (§3). It constrains
which combat moves the interpreter proposes (`constrainMoveToPosition`,
`src/moves/interpreter.js`) and drives the play-kit Take Decisive Action
bad-spot downgrade in the resolver. The weak-hit Enter-the-Fray choice ("You
are in control") is a `combat-position` suffer call (`src/moves/sufferDialog.js`)
that writes the open track — or stashes onto the pending threshold card when
clicked before Enter the Fray.

**Narrator awareness:** every prose narration carries [4j] OPEN PROGRESS
TRACKS (`buildNarratorExtras` → `listOpenProgressTracks`,
`src/ui/progressTracks.js`): each open fight's label, rank, filled boxes,
objective, position (in control / in a bad spot) and the vow it serves, with
open expeditions and scene challenges. Until issue #290 this was the
assembler's ACTIVE FIGHT block, which no narration read, and #271 deleted it
unported (TRACKS-UNPORTED). Shipboard fights additionally inject Battle
Stations guidance (`src/moves/battleStations.js`).

## 3. Ending a fight

`endCombat` fires on Take Decisive Action strong/weak, any `battle` outcome,
or Face Defeat (always). The branch completes the track, posts the finish
card, and deletes the Combat doc.

**Take Decisive Action** is a progress move: `enrichProgressTicks`
(`src/moves/statEnrichment.js`) copies the resolved combat track's live ticks
into the roll (score = floor(ticks / 4) vs 2d10), preferring the enriched
track's own `combatState` for the bad-spot downgrade — `listProgressTracks`
carries each fight's `combatState` (it dropped it until issue #306 R05, so
with two fights open no downgrade applied). Entry points: the
"⚔ Attempt to Finish the Fight" button on Strike / Clash / Gain Ground / React
Under Fire cards, typed narration, and the Progress Tracks panel's Roll button
(§5). The button names the move's own fight: `postMoveResult` stamps the
pipeline's `moveFight` as `combatTrackId` / `combatTrackLabel`, and
`wireTakeDecisiveActionButton` forwards them as `forcedMoveTargetId` /
`forcedMoveTarget`, so with two fights open the roll scores that fight — it
posted no target, scored nothing and was a certain miss
(TDA-BUTTON-NO-TARGET). A card whose fight nothing named (or one posted
before the stamp) posts no target and resolves the sole open fight. A TDA
that names no fight while two or more are open — typed narration, or such a
card — is not rolled: the pipeline posts a **Which fight?** card instead
(`postWhichFightCard`, flagged `whichFightCard` with the open fights' ids and
names, the narration and the roller's `actorId`), and a pick
(`wireWhichFightButtons`) posts the move again with that fight's id, spoken
as the original roller. One pick per card: every button disables, and the
GM's pick is stamped `whichFightPicked`. A TDA
**weak hit** also rolls
the `decisive_action_cost` oracle (a d100 card whose 1–40 band routes a suffer
pick). A TDA **miss** does not end the fight — it routes Pay the Price.

**Battle** (the "⚔ Battle instead" button) is the one-roll alternative: an
action move that ends the fight on every outcome. The button forwards its
card's `trackId` / `trackLabel`, so Battle ends that fight while another is
open — without them, two open fights left it ending neither.

**Face Defeat** closes the track as a loss (no payoff) and routes Pay the Price.

## 4. The win payoff (linked fights)

On a won fight (`strong_hit`/`weak_hit`, not Face Defeat) whose track has
`linkedVowName`, the pipeline posts the **victory card**
(`postFightVowMilestoneCard`, flagged `fightVowCard` with the card's `vowName`,
`marks`, `connectionName`, `vowRank` and the roller's `actorId`):
**⚑ Mark milestone (×N)** — N scales with the *fight's* rank
(`marksForSourceRank`: troublesome/dangerous 1, formidable/extreme 2, epic 3;
weak-hit win −1, min 1), each mark adding ticks by the *vow's* rank
(`milestoneTicks`) to the vow **Item** (`markLinkedVowMilestone` →
`applyReachMilestone` → `markVowProgress`) on the vow's **holder** — the
card's roller when they hold a copy, else the PC holding the resolved vow
(`resolveVowHolderActor`) — plus **🏁 Attempt to Fulfill** (a forced
`fulfill_your_vow` bridge, which scores the vow's real item ticks) and
**🤝 Deepen your bond** when the vow links a connection
(`deepenLinkedConnection`, scaled by the vow's rank). It then grants the
linked vow's promised reward (`grantLinkedVowReward`, `actorId` = the roller),
outcome-scaled (strong = full, weak = reduced/with-a-string, miss = lost) and
one-time (`reward.status` flips from "promised" — written first, as the
grant's claim); it lands on the roller's copy when they hold one, else on the
PC holding the promised reward. A grant that does not land is not swallowed:
the GMs get a payoff failure card (`postPayoffFailureCard`, source `fight`)
with a one-press Retry, and "🎁 Reward earned" is posted only once the grant
lands (issue #306 R04 — see `vow-flow.md` §4).

Mark milestone and Deepen your bond are one-shot GM writes:
`wireFightVowButtons` relays a click via `relayCardAction`
(`src/moves/cardActions.js`) as `fightVow.markMilestone` /
`fightVow.deepenBond` → `applyFightVowMarkMilestone` /
`applyFightVowDeepenBond` on the canonical GM. The handler takes every value
from the GM-authored card (never the payload), skips an action already in
flight or stamped, and stamps `flags.resolvedActions.<action>` once applied —
only when the step reports it landed (`markLinkedVowMilestone` /
`deepenLinkedConnection` return `{ ok }`): a refused mark, no open vow to
mark, or a connection no longer open leaves the action unstamped and
whispers the GMs a report without a Retry (source `fightButton`) — the
re-armed button is the retry (issue #306 R04; the stamp used to land
whatever happened). An applied action renders disabled for everyone, and a
click that is not
delivered (no GM connected — `requestGmAction` warns), or a card still
unstamped after `RELAY_RECOVERY_MS` (15 s), re-arms the button. (They used to
emit raw `vow.markMilestone` / `connection.deepen` socket messages with no
resolved stamp, so a second click — or a re-render on another client —
applied the milestone twice, and with no GM the click silently did nothing.)

Fulfilling the vow (via the move or the native sheet) completes it everywhere
it lives — journal track *and* actor items (`completeVowItemByName` /
`completeVowItem`) — and pays quests legacy + connection deepen + reward
exactly once (`fulfilPaid` item flag; the pipeline path passes
`skipLegacy: true` to `payFulfilledVowNative` and pays legacy on its own
campaignState object, which `persistResolution` merges onto the stored state
keeping the higher legacy tick count). See `vow-flow.md` §4 for how the
reward finds the roller's copy once every copy is already completed.

Winning a fight grants **no direct XP or legacy** — quests-legacy ticks come
only from vow fulfilment. That's the by-the-book bridge: fight → milestone →
vow → legacy.

## 5. The Progress Tracks panel Roll button

For `combat` and `expedition` rows (`TRACK_TYPE_TO_MOVE`,
`src/ui/progressTracks.js`), the panel's Roll button posts the standard
forced-move bridge (`bypassPacing` + `forcedMoveId` + `forcedMoveTarget` =
the row's label + `forcedMoveTargetId` = the row's id) so the pipeline rolls,
narrates, and applies consequences. The id rides as
`interpretation.moveTargetId`: tick enrichment, the position, the completion
and the recommit offer all take that track (`selectCombatTrack` /
`selectExpeditionTrack` `{ trackId }`), never a same-named sibling, and a row
deleted or finished before the roll resolves rolls nothing — a "not rolled"
card (`trackGoneCard`) instead (issue #306 R06).
Pre-session (the pipeline's session gate would ignore the bridge) and for
`scene_challenge` rows (no mapped move), it keeps the bespoke instant display
roll (`type: 'progressRoll'` card — display-only by design).

## 6. Settings, gating, coverage

- `combatTrackerEnabled` (world, default true) is the only combat-specific
  setting — it governs the Combat doc + badges only; the track lifecycle runs
  regardless. Range badges (close/far, "+edge"/"+iron") are UI-only — the
  resolver never reads range.
- Quench batches: **Combat Mechanics** (consequence mapping, live track
  lifecycle, tick-enrichment round-trip, threshold position carry), **Combat
  Card Buttons** (TDA/Battle/panel-roll bridges), **Progress Mechanics**
  (score math + the resolver statValue-carry seam), **Core Resolver Matrix**.
  Unit suites: `resolver.test.js` (incl. the enrich→resolve regression chain),
  `statEnrichment.test.js`, `sufferDialog.test.js`, `combatThreshold.test.js`,
  `combatTracker.test.js`, `progressRollBridge.test.js`.

## Defect history (fixed in the v1.7.30 cycle)

Two defects shipped with the original #241 implementation and were fixed
together (see `decisions.md` → "Progress-move scores come from module data"
and "Enter the Fray's position rides the threshold card"):

1. **Pipeline progress rolls always scored 0.** Nothing copied a track's ticks
   into the resolver's carrier (`statValue`), so TDA, the victory card's
   Attempt to Fulfill, forge-a-bond and finish-expedition buttons all resolved
   as guaranteed misses; the panel's Roll card was display-only with no
   consumer. The whole §4 payoff was unreachable except via `battle`.
2. **Enter the Fray's opening position was discarded** (track didn't exist yet
   at consequence time) and the weak-hit "You are in control" pick applied
   nothing (no `combatPosition` handling in the suffer option mapper).

## Soft spots — resolved in the 2026-07 cleanup

- ~~The way-out button was advisory only~~ — **addressed**: the way-out card
  now carries one-click Face Danger / Compel / Secure an Advantage buttons
  (`WAY_OUT_MOVES` / `buildWayOutHtml`, wired by `registerWayOutHook`), each
  posting the forced move so choosing an exit rolls it.
- ~~The ACTIVE FIGHT block omitted the position~~ — **addressed**: the
  assembler's fight lines now include in-control / bad-spot. *(Issue #290:
  that block never reached a narration — see "Narrator awareness" above; the
  position renders in [4j] OPEN PROGRESS TRACKS.)*
- **Range badges are advisory — reaffirmed deliberate** (no RAW range
  mechanic; the tooltip says so). See `decisions.md` → "Flow-audit soft
  spots".
- **Combat rewards ride the linked vow — reaffirmed deliberate** (same
  decision entry).
