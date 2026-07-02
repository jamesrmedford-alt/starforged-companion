# Combat flow — as implemented

A stage-by-stage map of the combat lifecycle as the code actually implements it,
verified against source. File references name the owning function; line numbers
drift, so search by symbol. Sibling docs: `vow-flow.md`, `connection-flow.md`,
`exploration-flow.md` (same treatment for the other lifecycles).

Two cross-cutting facts to hold onto:

- **The move pipeline runs only on the canonical GM client** (`isCanonicalGM()`
  gate at the top of the narration handler in `src/index.js`); the inner
  `game.user.isGM` checks on each consequence branch are belt-and-suspenders.
  Card-button world writes gate on `isCanonicalGM()` with a relay over the
  `module.starforged-companion` socket for player clients.
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
(stakes line, **Battle instead** button on fresh tracks) and the Foundry Combat
doc opens with position/range badges.

**Find another way** is advisory: it posts the `WAY_OUT_PROMPT` nudge naming
Face Danger / Compel / Secure an Advantage but arms no move.

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
to the actor + combatant badge (`applyCombatPositionToTrack`). It constrains
which combat moves the interpreter proposes (`constrainMoveToPosition`,
`src/moves/interpreter.js`) and drives the play-kit Take Decisive Action
bad-spot downgrade in the resolver. The weak-hit Enter-the-Fray choice ("You
are in control") is a `combat-position` suffer call (`src/moves/sufferDialog.js`)
that writes the open track — or stashes onto the pending threshold card when
clicked before Enter the Fray.

**Narrator awareness:** the context assembler appends an `### ACTIVE FIGHT`
block under CHARACTER STATE (label, objective, linked vow) for every open
combat track; shipboard fights additionally inject Battle Stations guidance
(`src/moves/battleStations.js`). The fight block does not currently include
the position.

## 3. Ending a fight

`endCombat` fires on Take Decisive Action strong/weak, any `battle` outcome,
or Face Defeat (always). The branch completes the track, posts the finish
card, and deletes the Combat doc.

**Take Decisive Action** is a progress move: `enrichProgressTicks`
(`src/moves/statEnrichment.js`) copies the resolved combat track's live ticks
into the roll (score = floor(ticks / 4) vs 2d10), preferring the enriched
track's own `combatState` for the bad-spot downgrade. Entry points: the
"⚔ Attempt to Finish the Fight" button on combat move cards, typed narration,
and the Progress Tracks panel's Roll button (§5). A TDA **weak hit** also rolls
the `decisive_action_cost` oracle (a d100 card whose 1–40 band routes a suffer
pick). A TDA **miss** does not end the fight — it routes Pay the Price.

**Battle** (the "⚔ Battle instead" button) is the one-roll alternative: an
action move that ends the fight on every outcome.

**Face Defeat** closes the track as a loss (no payoff) and routes Pay the Price.

## 4. The win payoff (linked fights)

On a won fight (`strong_hit`/`weak_hit`, not Face Defeat) whose track has
`linkedVowName`, the pipeline posts the **victory card**
(`postFightVowMilestoneCard`): **⚑ Mark milestone (×N)** — N scales with the
*fight's* rank (`marksForSourceRank`: troublesome/dangerous 1, formidable/
extreme 2, epic 3; weak-hit win −1, min 1), each mark adding ticks by the
*vow's* rank (`milestoneTicks`) to the vow **Item** (`applyReachMilestone` →
`markVowProgress`) — plus **🏁 Attempt to Fulfill** (a forced
`fulfill_your_vow` bridge, which scores the vow's real item ticks) and
**🤝 Deepen your bond** when the vow links a connection. It then grants the
linked vow's promised reward (`grantLinkedVowReward`), outcome-scaled
(strong = full, weak = reduced/with-a-string, miss = lost) and one-time
(`reward.status` flips from "promised").

Fulfilling the vow (via the move or the native sheet) completes it everywhere
it lives — journal track *and* actor items (`completeVowItemByName` /
`completeVowItem`) — and pays quests legacy + connection deepen + reward
exactly once (`fulfilPaid` item flag; the pipeline path passes
`skipLegacy: true` to `payFulfilledVowNative` and pays legacy on its own
campaignState object so the pipeline's single persist can't clobber it).

Winning a fight grants **no direct XP or legacy** — quests-legacy ticks come
only from vow fulfilment. That's the by-the-book bridge: fight → milestone →
vow → legacy.

## 5. The Progress Tracks panel Roll button

For `combat` and `expedition` rows (`TRACK_TYPE_TO_MOVE`,
`src/ui/progressTracks.js`), the panel's Roll button posts the standard
forced-move bridge (`bypassPacing` + `forcedMoveId` + `forcedMoveTarget` =
the row's label) so the pipeline rolls, narrates, and applies consequences.
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

## Known soft spots (deliberate or unshipped, not bugs)

- The **way-out button is advisory only** — it names the off-ramp moves but
  does not arm one (the original design sketch wanted a prompted move).
- **Range badges are display-only**; no mechanic consumes close/far.
- The narrator's ACTIVE FIGHT block **omits the current position**.
- **Combat rewards** are deliberately not proposed per-fight — the linked
  vow's promised reward is the payoff carrier.
