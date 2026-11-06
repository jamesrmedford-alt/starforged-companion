# Vow flow — as implemented

A stage-by-stage map of the vow lifecycle as the code actually implements it,
verified against source (post-PR #257; multiplayer attribution and the GM
relay updated for the 2026-10 audit). File references name the owning
function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `connection-flow.md`, `exploration-flow.md`.

Multiplayer, up front: module-side vow Item writes run on the **canonical
GM** — the move pipeline (gated on `isCanonicalGM()`), a card click relayed
through `requestGmAction` (`src/multiplayer/gmRelay.js` `GM_ACTIONS`:
`milestone.pick`, `fightVow.markMilestone`, `payThePrice.advanceClocks`; and,
since issue #321, `fulfilVow.pick` and `milestone.suggestion` — and
`fulfilVow.attempt`, a card's 🏁 — which claim
their card and post the forced move once for the pipeline — flagged
`deferWhileBusy`, so one that meets the move lock is held on the canonical
GM and rolled when the lock frees, never dropped with its card claimed:
issue #325 W02; since issue #338 D1 also a new vow's ⚔ Swear it (roll),
`vow.swearRoll`), and since issue #325 W11 the swear cards' reward pick
and link (`vow.reward`, `vow.link` — `src/session/swearVow.js`
`applyRewardPickFromRelay` / `applyPlayerVowLinkFromRelay`, each claiming its
card once; they were the ad-hoc `vow.setReward` / `vow.linkConnection`
socket relays). Only the vendor sheet writes a vow from the owner's own
client. A press refused for whose the card is (another player's character,
or one gone) whispers the presser and the GMs whose button it is
(`gmRelay.refusePress`, known-issues RELAY-REFUSED-PRESS-UNTOLD).
Effects credit the **roller**: the pipeline's `rollerActor` is the speaker
resolved from the message, first PC only as a fallback — a GM's, or at a
one-PC table; a PC-less player at a table of several rolls nothing (issue
#326 D8; decisions.md → "Multiplayer attribution").

Terminology up front, because it drives every gap below:

- **Item vow** — a foundry-ironsworn Item (`type:"progress"`,
  `system.subtype:"vow"`) embedded on a PC Actor; ticks live in
  `system.current` (0–40). **This is the live store** for inciting, shared,
  and hand-made vows.
- **Journal vow track** — a `type:"vow"` object in the Starforged Progress
  Tracks journal flag. Only `addProgressTrack` creates one, and the panel
  can't (see gaps) — effectively dormant.
- **Matching:** creation, shared-sync, reward-set, and connection-link key
  on the **`vowId` flag** — reward-set, connection-link and the reward's
  granted-or-lost check also take the Item whose own id is the `vowId`
  (`actorBridge.isVowCopy`): a sheet-made vow's cards name it by its Item id,
  and the createItem hook's stamp of that id as the flag can fail
  (known-issues VOW-ID-NEVER-LANDED). A writer that starts from an Item names
  its copies the same way (`actorBridge.vowCopyId`: the flag, else the Item's
  own id) — the reward grant's claim, Forsake's lost flip and the payoff
  Retry's copies: keyed on the flag alone, such a vow's reward stayed
  "promised" after it was granted and was granted again by the fulfilment and
  every later linked win, and a forsaken vow's reward was never lost (issue
  #342 Z54); fulfilment completion and payoff resolve through
  `resolveVowItemCopies` — a name ladder (exact → whole-word substring → sole-open) that
  then collects every copy by the vow's id (`collectVowCopies`: `isVowCopy`
  of `vowCopyId` — the `vowId` flag, else the Item's own id). A vow with no
  `vowId` flag (written on a sheet while no GM was connected, or its stamp
  refused) is only itself: copies used to fall back to every PC's vow of the
  same exact name, so two crewmates' "Background Vow"s fulfilled, paid,
  recommitted and forsook each other (issue #342 Z59). (The old exact-name-only payoff
  matching was the VOW-RENAME-PAYOFF defect, fixed this cycle.) The
  sole-open rung is only for a name that matches nothing: it never applies
  when the name matches (exactly or by substring) a vow that is already
  completed (fulfilling A used to resolve the one other open vow B and pay
  B's payoff). Likewise an exact name for a completed vow skips the substring
  rung, so fulfilling "Find the ship" can't resolve the open "Find the ship's
  captain". The milestone and fulfil ladders honour it too
  (`selectMilestoneVow` / `planReachMilestone`, `selectFulfilVow` —
  `namesCompletedVow`): a name matching only a completed vow marks nothing,
  and a Fulfill Your Vow naming it is not rolled (the "not rolled" card) —
  a won fight's card for a fulfilled vow marked, or scored and paid, the
  PC's other vow (issue #325 W29). **The roller's own vow comes first** (issue #301 B02): given the
  roll's `itemId` (the Item it scored) and/or `actorId` (the roller), the
  resolver takes that Item, else the roller's own exact-name vow (open, then
  completed), before the global ladder — two PCs' *independent* vows can
  share a name (both "Background Vow", different `vowId`s), and the ladder
  used to take whichever PC came first.

## 1. Creation

**Inciting shared vow.** `runIncitingIncident` (`src/session/incitingIncident.js`)
parses the narrator's `Suggested vow / Suggested clock / Immediate crisis /
Vow target` lines into structured `incitingMeta` flags on the card — a label
in Markdown ("**Suggested vow:** …") is a label, and emphasis is stripped from
the value (`matchLabelLine`; the closing `**` leaked into the vow, the clock
and the target's name, which then matched no established NPC — issue #325
W33). The card's
**⚔ Swear this vow** button posts a forced `swear_an_iron_vow` ChatMessage
carrying `incitingSwearMessageId` — the post itself is the relay (the card is
not claimed: in Batch Mode the round driver rolls one press per card — a
press while the card is sworn, or while its swear is already an entry, an
offer or held for the next round, is not rolled and its presser is told,
the `swearPressDropped` notice re-arming their button, issue #342 Z30); the
canonical GM's pipeline swear branch calls `swearSharedVowForAll`
(`src/session/swearVow.js`), which: creates the vow **item on every PC**
(`createCharacterVowItem` — idempotent by `vowId`, carries
`sharedVow`/`linkedConnectionName`/optional deadline clock), creates the
immediate-crisis **tension clock** when the meta has one, creates the **target
NPC connection** — a bond Item on every PC the vow was sworn on
(`registerConnectionOnActiveCharacter(…, { actors })`), not the first PC's
alone; only for a **person** target: the target line carries its kind
(`[person|creature|faction|vessel]`, read from the description's head when it
has none — `vowTargetKind`), and a faction, creature or vessel is neither made
a connection nor linked to the vow (`linkedConnectionName`, `swearToConnection`
— issue #326 W70) — posts the sworn-confirmation card (rank→milestone/legacy
stakes lines), narrates the vow-swearing scene for the PC who rolled the
swear (`swearSharedVowForAll(message, { speakerActorId })` →
`narrateAndPostVowSwearing`; issue #321 U23), and proposes two concrete
**rewards** (`proposeRewards`) + a write-your-own on the reward-choice card.
Chosen rewards land as `flags.reward = {status:"promised", description, form}`
on every copy (`setSharedVowReward`), on the canonical GM (`vow.reward`): the
card is claimed once (`rewardChosen`), and a vow whose reward was already
granted or lost is never promised again — an old card's pick re-promised a
granted reward, so the next linked win or the fulfilment granted a second
(issue #325 W11). A write that does not land posts no "🎁 Reward set", and
the presser and the GMs are whispered why (issue #329 X07):
`setSharedVowReward` reports `{ ok, reason }` — `refused` releases the claim
for another pick ("could not be saved … choose it again"); `no-copy`, a vow
no character holds any more (its Item deleted; a sheet-made vow whose `vowId`
flag never landed is still found by its Item id — known-issues
VOW-ID-NEVER-LANDED — even one with no module flags at all, both its
createItem stamps refused: the granted-or-lost check read that scope
unguarded and threw, so every pick failed unsaid, issue #342 Z55), closes the card (`rewardChosen: "no-vow"`) — "choose
it again" asked for a retry that could never land (issue #336 Y27).

**Player-authored vows.** `registerPlayerVowHook` (createItem hook, GM-side)
catches sheet-made vows (no `vowId` yet), stamps `vowId = item.id`, and posts
the "🆕 New vow recorded" card: stakes line, **⚔ Swear it (roll)** (forced
`swear_an_iron_vow` without the inciting id — narrates + momentum, creates
nothing twice; spoken as the vow's holder, the card's `actorId` or the PC
holding its `vowId` — issue #329 X05; relayed `vow.swearRoll`:
`applyPlayerVowSwearFromRelay` on the canonical GM claims the card once,
`swearRolled`, and only the holder's player or a GM may press it — it
posted from the presser's client, so a crewmate swore another player's vow,
their momentum and oath scene, issue #338 D1; a vow no character holds any
more is not sworn: the card closes, `vowGone`, and the presser and the GMs
are told — it rolled the momentum and oath scene for a deleted vow,
known-issues SWEAR-ROLL-VOW-GONE), a **connection
picker** when connections exist
(`setVowLinkedConnection`, relayed `vow.link`: the canonical GM checks the
connection exists and claims the card once, `linkedConnection`; a link the
vow did not take releases the claim and whispers the presser, with no
"🤝 Linked" card — issue #329 X07 — and a vow no character holds closes the
Link instead, `vowGone`, saying why — issue #336 Y27), and the same reward offer.

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
  `flags.choices` record the offered (vowId, actorId) pairs and the marks
  the pick applies (a won fight's ×N falls here when its vow was renamed —
  issue #326 W43; a plain Reach a Milestone's picker marks once). Any user's click
  relays `milestone.pick` to the canonical GM → `applyMilestonePick`, which
  checks the pick is one of the card's choices and that the requester owns
  that PC (or is a GM), claims the card (`resolved`) and then marks the vow
  (idempotent, in-flight guarded): a refused claim marks nothing and a
  refused mark releases the claim — it marked first, and a stamp the world
  refused left the picker live for a second mark (issue #336 Y24). A vow fulfilled since the picker posted
  is refused (`vow-completed`, a short card; the picker stays open for its
  other vows), and `markVowProgress` never marks a fulfilled vow (issue
  #331 X20). A click with no GM connected, a refusal,
  or a card still unresolved after `RELAY_RECOVERY_MS` (15 s) re-arms the
  buttons (`relayCardAction`, `src/moves/cardActions.js`). The move card's
  "⚑ Mark Progress on Vow" suggestion button leads to a forced
  `reach_a_milestone` move instead (next bullet).
- **Move-card suggestion buttons** ("⚑ Mark Progress on Vow" / "🏁 Attempt to
  Fulfill Vow") on eligible adventure/exploration hits — these post forced
  moves so the GM-side pipeline does the work. "⚑ Mark Progress on Vow"
  relays `milestone.suggestion` (`wireMilestoneSuggestionButton` →
  `cardActions.applyMilestoneSuggestion`): the canonical GM claims the
  GM-authored move card (`milestoneMarked` — read but never written before)
  and posts the forced Reach a Milestone once, as the card's roller; only the
  roller's player or a GM may press it (a card from before the roller was
  stamped marks the clicker's own PC), and a failed post releases the claim
  (issue #321 U20 — every client's press, or a re-render, marked the vow
  again). "🏁 Attempt to Fulfill Vow" relays `fulfilVow.attempt`
  (`wireAttemptFulfillVowButton` → `cardActions.applyAttemptFulfilVow`, the
  same rules: claim `fulfilAttempted`) and posts the forced fulfil once, as
  the card's roller, naming their sole open vow by its Item id
  (`milestoneSuggestion.vowItemId`; with several, the pipeline asks which): a
  GM's press scored and paid the first PC's vow (issue #329 X05), and it was
  disabled only on the clicker's screen, so each client's press rolled again
  (known-issues FULFIL-BUTTON-LOCAL-DISABLE).
- **Won-fight milestone** (see `combat-flow.md` §4): marks scale by the
  fight's rank, ticks-per-mark by the vow's rank. Marked on the vow's
  **holder** — the card's roller (`actorId`) when they hold the vow, else
  whichever PC does (`resolveVowHolderActor`) — once per card (relayed
  `fightVow.markMilestone`; the mark is recorded per card on the vow's
  payoff ledger, `fulfilPayoff["milestone:<card id>"]` — `markFightVowMilestoneOnce`
  — so a re-press after a stamp the world refused marks nothing, issue #336
  Y24). Its 🏁 Attempt to Fulfill rolls as the same holder (issue #342 D5 —
  it was the card's roller's, so a crewmate who won the fight rolled another
  PC's vow as themselves), and so the miss's 🔁 recommit offer is theirs. The
  card's rank and 🤝 Deepen connection come
  from the same roller-first resolution (`postFightVowMilestoneCard`), not
  the first PC holding a vow of that name.
- **Shared-vow lockstep**: `registerSharedVowSyncHook` copies changed fields
  to sibling copies by `vowId` — `["current","clockTicks","completed","rank"]`
  (`SHARED_VOW_SYNC_FIELDS`; `completed` joined in the VOW-FULFIL-SIBLINGS
  fix, so a native-sheet fulfil closes every crewmate's copy, and `rank` in
  the 2026-07 cleanup — see gaps). Changes queue per vow, the newest value
  per field; a pass writes each copy only the fields that differ, marks its
  writes (`sharedVowMirror`) so they do not cascade, and gives way to a newer
  change mid-pass — an in-flight guard used to drop a change made during a
  pass, and the pass's all-fields write reverted it (issue #322 V32, the
  shared supply's F05 / R03 race). Each copy's write stands alone: a refused
  one is warned and named to the GM, and the pass goes on to the other copies
  and to a queued change — it threw out of the pass (known-issues
  SUPPLY-SYNC-TWINS, the shape issue #331 X52 fixed for the supply).
- **Vow deadline clocks**: `advanceVowClocks` bumps `clockTicks` on Pay the
  Price ("⏳ The clock turns" card) via `advanceClocksOnPayThePrice`
  (`src/clocks/payThePriceClocks.js`) — called directly by the pipeline on
  the canonical GM; a player-typed `!ptp` relays `payThePrice.advanceClocks`
  so the clocks advance once, on the GM — and its suffer routes relay
  `payThePrice.suffer` (`applyPayThePriceSufferFromRelay`, the typist's PC as
  the roller), so the allies a Sacrifice Resources marks unprepared are
  written where that is allowed (issue #325 W10). A player with no PC of
  their own at a table of several relays no route: the card says the price
  was not applied and the typist is whispered why (issue #337 Y43). A shared vow's copies are one clock
  (issue #321 U55): one `lockstep` map rides every PC's call of an advance,
  so the first copy advances and each later copy is set to the value it
  reached (advancing each copy raced the sync hook, which had already moved
  it); the card lists the vow once and fires one trigger vignette
  (`onePerClock`, by `vowId`). The returned entries keep every copy, each
  with its `vowId`, for the reversal below. A Burn Momentum or Improve Result
  that upgrades the miss reverts them via `revertVowClocksForBurn`
  (`resultUpgrade.js` `revertPayThePrice` — issue #311 P05). A rewind that
  lands in part leaves only the refused Items on the GMs' payoff card; its
  Retry rewinds those alone (issue #314 Q05 — the whole step was queued and
  the landed clocks were rewound again).

## 3. Narrator awareness

Vows reach the narrator through the CHARACTER STATE block (Background Vow +
other vows; `isBackground` follows the **shared** vow, not merely the
first-created one; each vow's rank by name — `readVows` maps the vendor's
numeric rank through `rankName`, which rendered "(3, progress 2/10)" before
issue #321 U62) and the CAMPAIGN PREMISE block
(`campaignState.incitingIncident`: prose, central figure, first vow, deadline,
immediate crisis — injected into every call). The optional vow-swearing scene
(`narrateVowSwearing`, `vowSwearingNarration` setting) fires from both swear
paths, written for the PC who swore (`speakerActorId`, issue #321 U23), and
records its facts in a scene (`ensureSceneStarted`, issue #321 U34). Vows are
**not** part of the scene frame or relevance-injected entity cards.

## 4. Fulfilment

Scoring: `fulfill_your_vow` is a progress move; `enrichProgressTicks` fills
the roll from the **item's live ticks** (items first, speaker's copies first;
journal track only as fallback) — see `decisions.md` "Progress-move scores
come from module data". The vow scored is `selectFulfilVow`'s
(`src/moves/milestone.js`; issue #321 U02): a picked copy by id (that open
copy, else nothing); else a name — the roller's own vow first, then anyone's,
exact then whole words ("Kade is avenged" never scores "Ade" — issue #325 W30); else one vow per `vowId`, the roller's own open vows
first (a shared vow counts once, scored on the roller's copy). `readVows`
carries each copy's `vowId`, and enrichment takes the roller
(`rollerActorId`). A Fulfill Your Vow that names no vow while several
distinct vows are open is not rolled — it used to score 0, a certain miss:
the pipeline posts a **Which vow?** card (`postWhichVowCard`, flagged
`whichVowCard` with `narration`, the roller's `actorId`, `choices`
`[{ itemId, name }]` and `resolved`). A pick (`wireWhichVowButtons`) relays
`fulfilVow.pick` → `cardActions.applyFulfilVowPick` on the canonical GM,
which checks the pick is one of the card's choices and that the requester
owns the roller's PC (or is a GM), claims the card (`resolved`) and posts the
forced fulfil with the copy as `forcedMoveTargetId`, spoken as the roller; a
failed post releases the claim. A picked vow fulfilled or deleted before the
roll resolves gets the "not rolled" card (`postTrackGoneCard`).

**Pipeline path** (typed, victory-card button, suggestion button, or a
"Which vow?" pick):
`finishVow` closes the journal twin if one exists — by the name of the vow
the roll scored (`tickInfo.label`), else the move's target, and by name only:
a name no journal track carries closes none (issue #326 W44 — the sole-open
rung completed another vow's twin); `completeVowItemByName`
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
exact → whole-word substring ladder, preferring the roller's, then collects **every**
PC's copy (by its id, as above) — so the reward lands on the **roller's
copy** when they hold one, else on the PC holding the promised reward (it
used to collect only the first PC's copy, so a shared vow's reward went to
the first PC). No journal track and no item matched → `console.warn`,
nothing completes.

On a **miss** the pipeline posts a recommit offer on the vow it scored
(`postVowRecommitOfferCard`, issue #330 D1 — it was advisory text): **🔁
Recommit to the Vow** relays `vow.recommit` to the canonical GM
(`cardActions.applyVowRecommitOffer`), which checks the presser is the
roller's player or a GM and claims the card (`recommitted`) before
`performVowRecommit` rolls the challenge dice once (`planRecommit`) and
writes every open copy of the roller's vow (`resolveVowItemCopies` with
`ownOnly`: the Item the miss scored, else the roller's exact-name vow —
never another by a looser name or the sole open one; the roller's first —
refused, nothing changed and the claim released) and its journal twin (by
its id or the vow's name only — `selectVowTrack`'s `byNameOnly`, W44's rule;
the sole open journal vow, or the crew's one open Item vow, was rewritten
beside a vow that had no twin — issue #336 Y25; with no Item, the journal
vow recommits from its own ticks): the lowest die's boxes cleared and the rank stepped once, as
the Item holds it (a vendor number or a name — `setVowItemTrack`). A vow
fulfilled since the miss (a later roll, a crewmate's fulfilment, the sheet)
is refused with a short card and the offer stays closed — a fulfilled vow's
track never moves, and the press lowered it and raised its rank on every
copy (issue #335 Y10); a completed copy is never written. A press that
changes nothing else is said too (`cardActions.tellRecommitOutcome`, issue
#342 Z58 — a console line on the GM's): a refused write is whispered to the
presser and the GMs ("could not be saved … press it again", X07's shape —
the claim released), and a vow deleted since (`no-vow`) gets the short card,
the offer closed; a roller no longer one of the table's PCs is refused as
gone, to a player or a GM (`refusePress` "not-a-pc" — known-issues
RECOMMIT-GONE-ROLLER-WORDING: a GM's press did nothing). The miss is a
progress roll, never burned or improved, so no upgrade retires the offer. A miss
rolled on the sheet gets the same offer, for the roller's vow Item of the
roll's name (`registerNativeFulfilConsequenceHook` → `offerSheetMissRecommit`,
issue #331 X62 — the hook acted on hits only, so the player recommitted by
hand on every copy).

**Native-sheet path**: the vendor progress-roll card is narrated where a Claude
key lives (`registerNativeProgressRollHook` → `nativeRollNarratesHere`, the
`RUN_ON.CLAUDE` ladder decided on every client from shared data): the keyed
canonical GM when a keyed GM is connected, else the roller's own client with
its own key — as the roller's PC (`resolveSpeakerActorId` on the roll card).
Narrating only on the roller's client gave a keyless player "Narration
unavailable" at a table whose GM holds the key (issue #321 U11). The canonical
GM applies consequences
(`registerNativeFulfilConsequenceHook` → `shouldPayFulfilledVow` → full
`payFulfilledVowNative` with `actorId` = the roll card's speaker, which here
also pays quests legacy — from the roller's vow's rank). Both hooks act only
on a player character's roll (`rolledByPlayerCharacter`; a debug line
otherwise): an NPC or connection card carries the full sheet (FOLDER-002),
and a GM's roll of an NPC's own vow there paid the crew's sole open vow
(stamped `fulfilPaid`, so its real fulfilment paid nothing), offered a
recommit for the NPC card and was narrated as the GM's first PC fulfilling a
vow (issue #336 Y23). Idempotency:
the `fulfilPaid` flag, checked and stamped on every copy, pays once per vow
across both paths — the pipeline's own Quests legacy write checks it too, for
a vow fulfilled on the sheet (which leaves the Item open) and then through the
pipeline (issue #325 W28: it paid the legacy a second time) — and a claim on
the vow (its `vowId`), taken before the
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
filled box's XP awarded only once the write lands — since issue #326 D3 by
writing the shared track to each PC's sheet (`payLegacyMark` →
`sharedLegacies.mirrorLegacyToSheets`, where the sheet derives the XP), each
PC's sheet on its own; one that is refused is an `xp` step of its own,
for that PC alone, since re-running the legacy would add its ticks again,
issue #309 N06; the pipeline's own fulfil marks its working copy, whose box
XP is paid once `persistResolution`'s write lands — issue #326 W52), the connection deepen
(`deepenLinkedConnection`), the reward (`grantLinkedVowReward`: the status
flip is the claim, written first; then the grant — `giveReward`; "🎁 Reward
earned" only once it lands). Each returns `{ ok }`; each that lands is
recorded on every copy (`flags.fulfilPayoff.<legacy|deepen|reward>`) — the
won-fight card's 🤝 Deepen records `deepen` there too, so a vow deepens its
connection once, whichever lands first (`deepenVowConnectionOnce`, issue
#326 D1) — and
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
