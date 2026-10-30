# Vow flow — as implemented

A stage-by-stage map of the vow lifecycle as the code actually implements it,
verified against source (post-PR #257; multiplayer attribution and the GM
relay updated for the 2026-10 audit). File references name the owning
function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `connection-flow.md`, `exploration-flow.md`.

Multiplayer, up front: module-side vow Item writes run on the **canonical
GM** — the move pipeline (gated on `isCanonicalGM()`), a card click relayed
through `requestGmAction` (`src/multiplayer/gmRelay.js` `GM_ACTIONS`:
`milestone.pick`, `fightVow.markMilestone`, `payThePrice.advanceClocks`), or
one of the two older ad-hoc socket relays from the swear cards
(`vow.setReward`, `vow.linkConnection` in `src/session/swearVow.js`, not yet
folded into `GM_ACTIONS`). Only the vendor sheet writes a vow from the
owner's own client.
Effects credit the **roller**: the pipeline's `rollerActor` is the speaker
resolved from the message, first PC only as a fallback (decisions.md →
"Multiplayer attribution").

Terminology up front, because it drives every gap below:

- **Item vow** — a foundry-ironsworn Item (`type:"progress"`,
  `system.subtype:"vow"`) embedded on a PC Actor; ticks live in
  `system.current` (0–40). **This is the live store** for inciting, shared,
  and hand-made vows.
- **Journal vow track** — a `type:"vow"` object in the Starforged Progress
  Tracks journal flag. Only `addProgressTrack` creates one, and the panel
  can't (see gaps) — effectively dormant.
- **Matching:** creation, shared-sync, reward-set, and connection-link key
  on the **`vowId` flag**; fulfilment completion and payoff resolve through
  `resolveVowItemCopies` — a name ladder (exact → substring → sole-open) that
  then collects every copy by `vowId`. (The old exact-name-only payoff
  matching was the VOW-RENAME-PAYOFF defect, fixed this cycle.) The
  sole-open rung is only for a name that matches nothing: it never applies
  when the name matches (exactly or by substring) a vow that is already
  completed (fulfilling A used to resolve the one other open vow B and pay
  B's payoff). Likewise an exact name for a completed vow skips the substring
  rung, so fulfilling "Find the ship" can't resolve the open "Find the ship's
  captain". **The roller's own vow comes first** (issue #301 B02): given the
  roll's `itemId` (the Item it scored) and/or `actorId` (the roller), the
  resolver takes that Item, else the roller's own exact-name vow (open, then
  completed), before the global ladder — two PCs' *independent* vows can
  share a name (both "Background Vow", different `vowId`s), and the ladder
  used to take whichever PC came first.

## 1. Creation

**Inciting shared vow.** `runIncitingIncident` (`src/session/incitingIncident.js`)
parses the narrator's `Suggested vow / Suggested clock / Immediate crisis /
Vow target` lines into structured `incitingMeta` flags on the card. The card's
**⚔ Swear this vow** button posts a forced `swear_an_iron_vow` ChatMessage
carrying `incitingSwearMessageId` — the post itself is the relay; the
canonical GM's pipeline swear branch calls `swearSharedVowForAll`
(`src/session/swearVow.js`), which: creates the vow **item on every PC**
(`createCharacterVowItem` — idempotent by `vowId`, carries
`sharedVow`/`linkedConnectionName`/optional deadline clock), creates the
immediate-crisis **tension clock** when the meta has one, creates the **target
NPC connection**, posts the sworn-confirmation card (rank→milestone/legacy
stakes lines), narrates the vow-swearing scene, and proposes two concrete
**rewards** (`proposeRewards`) + a write-your-own on the reward-choice card.
Chosen rewards land as `flags.reward = {status:"promised", description, form}`
on every copy (`setSharedVowReward`, socket `vow.setReward` for players).

**Player-authored vows.** `registerPlayerVowHook` (createItem hook, GM-side)
catches sheet-made vows (no `vowId` yet), stamps `vowId = item.id`, and posts
the "🆕 New vow recorded" card: stakes line, **⚔ Swear it (roll)** (forced
`swear_an_iron_vow` without the inciting id — narrates + momentum, creates
nothing twice), a **connection picker** when connections exist
(`setVowLinkedConnection`, socket `vow.linkConnection`), and the same reward
offer.

**The swear roll itself.** `swear_an_iron_vow` outcomes: strong +2 momentum,
weak +1, miss none (`src/moves/resolver.js`) — the vow is sworn regardless;
the roll shapes momentum and the narration.

## 2. Progress

All real progress lands on **item ticks** (`system.current`) via
`markVowProgress`:

- **Reach a Milestone** (no-roll): pipeline branch →
  `applyReachMilestone(rollerActor, moveTarget)` on the **roller's** vows —
  a named or sole open vow auto-marks (`postReachMilestoneCard`,
  `src/moves/milestonePicker.js`); several → a picker card whose
  `flags.choices` record the offered (vowId, actorId) pairs. Any user's click
  relays `milestone.pick` to the canonical GM → `applyMilestonePick`, which
  checks the pick is one of the card's choices and that the requester owns
  that PC (or is a GM), marks the vow, and stamps the card `resolved`
  (idempotent, in-flight guarded). A click with no GM connected, a refusal,
  or a card still unresolved after `RELAY_RECOVERY_MS` (15 s) re-arms the
  buttons (`relayCardAction`, `src/moves/cardActions.js`). The move card's
  "⚑ Reach a Milestone" suggestion button posts a forced
  `reach_a_milestone` move instead.
- **Move-card suggestion buttons** ("⚑ Mark Progress on Vow" / "🏁 Attempt to
  Fulfill Vow") on eligible adventure/exploration hits — these post forced
  moves so the GM-side pipeline does the work.
- **Won-fight milestone** (see `combat-flow.md` §4): marks scale by the
  fight's rank, ticks-per-mark by the vow's rank. Marked on the vow's
  **holder** — the card's roller (`actorId`) when they hold the vow, else
  whichever PC does (`resolveVowHolderActor`) — once per card (relayed
  `fightVow.markMilestone`). The card's rank and 🤝 Deepen connection come
  from the same roller-first resolution (`postFightVowMilestoneCard`), not
  the first PC holding a vow of that name.
- **Shared-vow lockstep**: `registerSharedVowSyncHook` copies changed fields
  to sibling copies by `vowId` — `["current","clockTicks","completed"]`
  (`SHARED_VOW_SYNC_FIELDS`; `completed` joined in the VOW-FULFIL-SIBLINGS
  fix, so a native-sheet fulfil closes every crewmate's copy). `rank` is
  still deliberately unsynced (see gaps).
- **Vow deadline clocks**: `advanceVowClocks` bumps `clockTicks` on Pay the
  Price ("⏳ The clock turns" card) via `advanceClocksOnPayThePrice`
  (`src/clocks/payThePriceClocks.js`) — called directly by the pipeline on
  the canonical GM; a player-typed `!ptp` relays `payThePrice.advanceClocks`
  so the clocks advance once, on the GM. A Burn Momentum or Improve Result
  that upgrades the miss reverts them via `revertVowClocksForBurn`
  (`resultUpgrade.js` `revertPayThePrice` — issue #311 P05). A rewind that
  lands in part leaves only the refused Items on the GMs' payoff card; its
  Retry rewinds those alone (issue #314 Q05 — the whole step was queued and
  the landed clocks were rewound again).

## 3. Narrator awareness

Vows reach the narrator through the CHARACTER STATE block (Background Vow +
other vows; `isBackground` follows the **shared** vow, not merely the
first-created one) and the CAMPAIGN PREMISE block
(`campaignState.incitingIncident`: prose, central figure, first vow, deadline,
immediate crisis — injected into every call). The optional vow-swearing scene
(`narrateVowSwearing`, `vowSwearingNarration` setting) fires from both swear
paths. Vows are **not** part of the scene frame or relevance-injected entity
cards.

## 4. Fulfilment

Scoring: `fulfill_your_vow` is a progress move; `enrichProgressTicks` fills
the roll from the **item's live ticks** (items first, speaker's copies first;
journal track only as fallback) — see `decisions.md` "Progress-move scores
come from module data".

**Pipeline path** (typed, victory-card button, or suggestion button):
`finishVow` closes the journal twin if one exists; `completeVowItemByName`
closes **every open item copy** across PCs of the roller's vow — the Item
the roll scored (`tickInfo.trackId`), else the roller's exact-name vow;
payoff via `payFulfilledVowNative` with `skipLegacy:true`, `actorId` = the
roller and the same `itemId` (quests legacy is paid on
the pipeline's own campaignState object, which `persistResolution` merges
onto the stored state keeping the higher tick count) — connection
deepen (`deepenLinkedConnection`, scaled by `marksForSourceRank(rank)`) +
promised reward (`grantLinkedVowReward` → `planRewardGrant`: strong = full,
weak = reduced/with-a-string, miss = lost; one-time via `reward.status`).
Because the copies are already completed when the payoff runs,
`payFulfilledVowNative` falls back to searching **all** copies with the same
exact → substring ladder, preferring the roller's, then collects **every**
PC's copy (by `vowId`, else name) — so the reward lands on the **roller's
copy** when they hold one, else on the PC holding the promised reward (it
used to collect only the first PC's copy, so a shared vow's reward went to
the first PC). No journal track and no item matched → `console.warn`,
nothing completes.

**Native-sheet path**: the roller's client narrates the vendor progress-roll
card (`registerNativeProgressRollHook`); the canonical GM applies consequences
(`registerNativeFulfilConsequenceHook` → `shouldPayFulfilledVow` → full
`payFulfilledVowNative` with `actorId` = the roll card's speaker, which here
also pays quests legacy — from the roller's vow's rank). Idempotency:
the `fulfilPaid` flag, checked and stamped on every copy, pays once per vow
across both paths — and a claim on the vow (its `vowId`), taken before the
first await, keeps two fulfilments that arrive together (a duplicate sheet
roll) from both passing the check before the flag lands (issue #306 R04). The
flag is also the durable claim: nothing is paid until it has landed on a copy
— refused on every copy, the steps go unapplied onto the GMs' failure card
(reason `unclaimed`), whose Retry pays them once (issue #309 N05: a refusal
was swallowed and the steps ran anyway, so a later duplicate, finding no paid
flag, paid again). The native path, like a Retry, skips any step the vow's
`fulfilPayoff` ledger records as landed. The native Forge a Bond payoff
(`payForgedBondNative`) claims its connection the same way.

**A payoff step that does not land** (issue #306 R04, option 2):
`payFulfilledVowCopies` runs three steps after the `fulfilPaid` stamp — the
Quests legacy (`runLegacyStep` → `writeLegacyTicks`: written on a copy, the
filled box's XP awarded only once the write lands — each PC's award on its
own, `awardLegacyBoxXP`; one that is refused is an `xp` step of its own,
for that PC alone, since re-running the legacy would add its ticks again,
issue #309 N06), the connection deepen
(`deepenLinkedConnection`), the reward (`grantLinkedVowReward`: the status
flip is the claim, written first; then the grant — `giveReward`; "🎁 Reward
earned" only once it lands). Each returns `{ ok }`; each that lands is
recorded on every copy (`flags.fulfilPayoff.<legacy|deepen|reward>`), and
those that do not go on one card whispered to the GMs
(`postPayoffFailureCard`, flagged `payoffFailureCard` with the steps a retry
needs) showing each value as it stands now. Its "↻ Retry these steps"
(`wirePayoffRetryButton` → relay `payoff.retry` →
`cardActions.applyPayoffRetry`, GM only, the card GM-authored) claims the
card (`resolved`) before anything runs, then `retryPayoffSteps` re-runs each
step the ledger does not mark landed; any that fail again go on a fresh card.
A refused claim of the reward is step `reward` (nothing given); a refused
grant after it is step `rewardGrant`, carrying the PC and amount. Each step
used to log to the console only — a refused legacy still paid its XP, a
refused grant still said "Reward earned", a deleted connection was skipped
without a word. The forge's bonds legacy and a won fight's reward report the
same way (sources `forge`, `fight`).

**Forsake Your Vow** now actually clears the vow (VOW-FORSAKE-COSMETIC fix):
the `forsakeVow` consequence drives a GM-gated pipeline branch that marks
every copy of the roller's vow completed + `forsaken` (audit-preserving —
nothing is deleted),
closes the journal twin, flips a still-promised reward to **lost**, and posts
the "⛓ Vow Forsaken" card. The costs suffer-prompt (Endure Stress −2 / Test
Your Relationship / discard an asset / narrative cost) rides alongside as
before. No legacy pays — the vow was abandoned, not achieved.

## Verified defects (all FIXED in the v1.7.30 cycle — resolved ledger in `known-issues.md`)

Each entry below describes the pre-fix behaviour the audit verified; the fix
summary lives in the `known-issues.md` table and the code.

1. **Native-sheet fulfil never completes shared-vow siblings**
   (VOW-FULFIL-SIBLINGS): `SHARED_VOW_SYNC_FIELDS` omits `completed`, and
   `payFulfilledVowNative` pays but never completes items — the vendor sheet
   closes only the rolled copy, so other PCs keep an open (and
   narrator-visible, since it's the Background Vow) copy of a fulfilled vow.
   The pipeline path is unaffected (`completeVowItemByName` loops all PCs).
2. **Renaming a vow breaks its payoff** (VOW-RENAME-PAYOFF): completion and
   payoff match by lowercased name while everything else keys `vowId`. A
   renamed vow can still *roll* a hit (scoring substring-matches) yet complete
   nothing and pay nothing — console-only warnings.
3. **Forsake is cosmetic** (VOW-FORSAKE-COSMETIC): costs are presented; the
   vow is never cleared.

## Softer gaps — resolved in the 2026-07 cleanup

- ~~`fulfilPaid` lived on the first-matched copy~~ — **addressed**: checked
  and stamped across every copy (survives a deleted/renamed copy).
- ~~Rank wasn't synced across shared copies~~ — **addressed**: `rank` joined
  `SHARED_VOW_SYNC_FIELDS` (a shared vow has one rank for the crew).
- ~~Dormant vow item-mirror in `addProgressTrack`~~ — **removed**: journal
  vow tracks no longer mint a second, never-synced item copy.
- ~~Ignored reward card = silent no-reward~~ — **addressed**: fulfilment now
  posts an "ℹ no reward was chosen" note (`grantLinkedVowReward
  noteIfAbsent`) when the reward-choice card was never answered.
- ~~Dead `vow.swearShared` socket branch / stale assembler comment~~ —
  **removed / corrected**.

## Multiplayer gaps — resolved in the 2026-10 audit

- ~~A player's click on the Reach a Milestone picker did nothing~~ (the vow
  write was GM-gated) — **relayed** (`milestone.pick` →
  `applyMilestonePick`, one-shot per card, validated against the card's
  choices and the requester's ownership).
- ~~Reach a Milestone and the won-fight milestone marked the first PC~~ —
  the roller's vows / the vow holder (`rollerActor`,
  `resolveVowHolderActor`).
- ~~The pipeline fulfil payoff never granted the promised reward~~ (the
  copies were already completed, and the reward lookup searched open vows
  only) — `grantLinkedVowReward` now takes the already-resolved copies; and
  ~~a shared vow's reward went to the first PC~~ — every PC's copy is
  collected, so the roller's copy is found.
- ~~Fulfilling vow A with exactly one other open vow B paid B~~ — the
  sole-open rung no longer applies to a name that matches a completed vow;
  ~~nor could an open vow whose name contains A's~~ — an exact name for a
  completed vow skips the substring rung (FULFIL-SUBSTRING-RUNG).
- ~~The won-fight "Mark milestone" button could apply twice (raw socket
  relay, no resolved stamp) and silently did nothing with no GM~~ — relayed
  `fightVow.markMilestone`, one-shot via `resolvedActions.markMilestone`
  (`combat-flow.md` §4).
- ~~Two PCs' independent vows with the same name paid, completed and forsook
  each other~~ (issue #301 B02): the first PC's open copy won the name
  ladder, so it was stamped `fulfilPaid`, granted the reward, set the legacy
  rank and had its connection deepened — and its own later fulfilment paid
  nothing — while the roller's vow stayed unpaid (and, on the pipeline path,
  open). Every resolver caller now passes the roller (and the scored Item
  where known): the fulfil payoff, pipeline completion, Forsake, the
  won-fight card, milestone holder and fight reward.
