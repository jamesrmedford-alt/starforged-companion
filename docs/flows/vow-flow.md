# Vow flow — as implemented

A stage-by-stage map of the vow lifecycle as the code actually implements it,
verified against source (post-PR #257). File references name the owning
function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `connection-flow.md`, `exploration-flow.md`.

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
  matching was the VOW-RENAME-PAYOFF defect, fixed this cycle.)

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

- **Reach a Milestone** (no-roll): pipeline branch → `applyReachMilestone` —
  sole open vow auto-marks, several → picker card (note: the picker buttons
  write directly and are GM-gated; on a player client they no-op).
- **Move-card suggestion buttons** ("⚑ Mark Progress on Vow" / "🏁 Attempt to
  Fulfill Vow") on eligible adventure/exploration hits — these post forced
  moves so the GM-side pipeline does the work.
- **Won-fight milestone** (see `combat-flow.md` §4): marks scale by the
  fight's rank, ticks-per-mark by the vow's rank.
- **Shared-vow lockstep**: `registerSharedVowSyncHook` copies changed fields
  to sibling copies by `vowId` — `["current","clockTicks","completed"]`
  (`SHARED_VOW_SYNC_FIELDS`; `completed` joined in the VOW-FULFIL-SIBLINGS
  fix, so a native-sheet fulfil closes every crewmate's copy). `rank` is
  still deliberately unsynced (see gaps).
- **Vow deadline clocks**: `advanceVowClocks` bumps `clockTicks` on Pay the
  Price ("⏳ The clock turns" card); burn-momentum undo reverts via
  `revertVowClocksForBurn`.

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
closes **every open item copy** across PCs; payoff via `payFulfilledVowNative`
with `skipLegacy:true` (quests legacy is paid on the pipeline's own
campaignState object so its single persist can't be clobbered) — connection
deepen (`deepenLinkedConnection`, scaled by `marksForSourceRank(rank)`) +
promised reward (`grantLinkedVowReward` → `planRewardGrant`: strong = full,
weak = reduced/with-a-string, miss = lost; one-time via `reward.status`).
No journal track and no item matched → `console.warn`, nothing completes.

**Native-sheet path**: the roller's client narrates the vendor progress-roll
card (`registerNativeProgressRollHook`); the canonical GM applies consequences
(`registerNativeFulfilConsequenceHook` → `shouldPayFulfilledVow` → full
`payFulfilledVowNative`, which here also pays quests legacy). Idempotency:
the `fulfilPaid` flag on the first-matched copy pays once per vow across both
paths.

**Forsake Your Vow** now actually clears the vow (VOW-FORSAKE-COSMETIC fix):
the `forsakeVow` consequence drives a GM-gated pipeline branch that marks
every copy completed + `forsaken` (audit-preserving — nothing is deleted),
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

## Softer gaps (recorded, not yet bugs-with-consequences)

- `fulfilPaid`/reward bookkeeping lives on the **first-matched copy**; deleting
  that copy could allow a re-pay (the independent `reward.status` guard still
  blocks reward double-grants).
- **Rank isn't synced** across shared copies — a sheet-side re-rank diverges
  siblings, and whichever copy fulfil matches sets the legacy/deepen scaling.
- **Panel can't create vow tracks**: `addProgressTrack(type:"vow")` and its
  one-shot item mirror are unreachable from the UI and uncalled — dormant
  branch; journal vow ticks are frozen at creation by design.
- **Ignored reward card = silent no-reward**: no `reward` flag is ever
  written, so fulfilment deepens and pays legacy but grants nothing, without
  notice.
- Dead socket kind `vow.swearShared` (handler retained, nothing emits it);
  stale "first vow item" comment in the assembler's background-vow block.
