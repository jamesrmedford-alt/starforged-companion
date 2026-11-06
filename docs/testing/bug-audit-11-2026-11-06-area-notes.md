# Eleventh bug audit — area notes (2026-11-06)

Companion to `bug-audit-11-2026-11-06.md`. The thirteen auditors' own "checked and
not a bug", "known items confirmed in passing" and "not probed" sections, by
area; the multiplayer auditor's table of every `GM_ACTIONS` kind at `8a4ae3b`;
and the rows merged into another (or refuted), in their own words. Auditor row
ids (`BATCH-10`, `CARD-2`, …) are followed by the report id they became.

## Checked and not a bug (by area)

### Checked and not a bug — batch

- **Relay ownership:** every `batch.*` handler acts on `ctx.requesterId`'s own entry; Send now / Discard
  check `ctx.requesterIsGM` (`src/batch/relay.js:78-110`, `:204-210`). `requesterId` itself is
  client-asserted — the documented gmRelay trust model, not a finding.
- **Forged values:** text bounded (`cleanSubmissionText`, 2000), ids ≤ 64 chars, confirm choices checked
  against the reading (`validateChoices`: only offered abilities, a stat among `statOptions` and dropped
  unless its ability is checked, a target among the options and none when there are none), `reread`'s
  move must be the reading's `suggestedMove`, `useOffer` needs an offer (`round.js:410-432`, `:479-507`).
- **Escaping:** the Round window escapes every interpolation, attributes included (`roundWindow.js:53-54`);
  the GM view; the round card (`roundEntryHtml` — actor, move, sanitised line); the fallback and paused
  cards (escaped lines; `xCardDiscardReason` is static); the whispers (static bodies or escaped actor
  names); `tellRequester`; the shared ability form (`renderMoveAbilitiesForm` → `escapeAttr`).
- **Silent opt-out:** the narration request (PARTY filtered to `actingNames`, `buildRoundUserMessage`
  lists acting entries only), `roundEntries`, `closeCollectingRound` (authors only), Send now (names no
  one). The GM window's "Waiting for:" lists unready *connected* players while collecting — designed
  (`roundView.js` header), and never a passer.
- **Credit the roller:** each entry rolls and persists with its own `entry.actorId`; momentum read at
  roll time; Pay the Price per roller; Burn / Improve from the window go through the card's own relay
  with its ownership check (`burnMomentum.js:489-527`); a player owning two PCs acts as one, and a card
  move for the other runs free-flow (decided).
- **Move lock:** claimed for the rolls and again for the narration, released in `finally`, free across
  the upgrade wait (batchModeTable); a stalled narration is bounded by the request deadline (faultMatrix);
  Send now's wait for in-flight readings holds it only across bounded Claude calls.
- **Narrator memory:** the round card carries the flag family + `narrationId` + `roundId` /
  `roundEntries`; the fallback keeps the family with `narrationFallback`; the paused card is not a
  narrator card; the capture pass and the sidecar carry the `narrationId`; ring, rolling summary, recap,
  burn-supersede and the X-Card's pick are covered by `roundNarrationCard.test.js`. The consistency check
  runs inside `applyNarratorSidecar` for both paths. No spotlight in a round (decided).
- **X-Card:** a collecting round cannot start (`advanceOnce` gate; Send now refused "x-card"); during the
  narration the reply is discarded and the paused notice posts; a round already rolling / upgrading
  rolls on and posts the paused notice — the moves stand, as a free-flow move's do.
- **The GM's clarification dialog** can open during a round's rolls (`rollMove` → `ClarificationDialog`)
  under the lock — as free-flow's does; `buildNarratorExtras` documents each entry keeping that
  relevance. Not the confirm dialog the decision rejected.
- **Two GMs:** one reading per submission (`startReading` canonical-gated, keyed by `submissionId`), one
  narration per round (`_narratingRoundId`; `claimNarration` after the posted-card check) — batchModeLifecycle.
- **Upgrades:** one claim per card (`consumed` + in-flight set); Send now during the step keeps and closes
  the undecided cards; every round card's Burn / Improve closed (`roundClosed`) at narration start; an
  early burn while rolling is recorded as decided (`decideUpgrade` early path).
- **A track ended mid-round** is refused with a card and narrated as a no-roll action (`refusalFor`,
  `markRefused`) — batchModeTable.
- **Card moves:** a participant's becomes their entry (or an offer beside it) while collecting, is held
  while resolving; a non-participant's runs free-flow now (collecting) or after the close (resolving).
  Forced-move flags carried into the reading: target / target id, `swearToConnection`,
  `tokenDragSetCourse`, `incitingSwearMessageId` (`forcedFromFlags` → `readAction` → `rollEntry`).
- **Typed chat is table talk** on every client; commands still dispatch first (`index.js:822`); `!roll`
  points at "Roll a move instead" (`index.js:6244-6247`).
- **Session handling:** End a Session closes a collecting round and restores drafts (batchModeLifecycle);
  no session → no round, windows say why; the four-hour re-mint happens only at world load / Begin
  (`rollSessionIfDue`), so a collecting round is closed then with its authors told.
- **Listeners:** `createSetting` and `updateSetting` both handled; every branch that writes is
  canonical-gated; only the per-client X-Card memory runs everywhere.
- `round.sceneId` and several timestamps are written and never read — bookkeeping on a stored object,
  no behaviour; not filed.

### Checked and not a bug — pipeline

- **The Phase 0 split (334bb4e) is behaviour-equivalent for free-flow.** Normalised line diff of the pre-split `onMessage` (`334bb4e^:src/index.js:780-1927`) against `onMessage` + `readMove` / `postTargetChoiceCard` / `rollMove` / `recordMove` / `finishMove` (`src/index.js:818-1103`, `src/moves/movePipeline.js:140-1457`): the roll stage is verbatim but for the relative import paths, `readAllVows` as a function of `speakerActorId` (was a closure over it), the inciting-swear id passed in (was `message.flags…`), the two "not rolled" `return`s becoming `{ refused: "track-gone" }`, and `cardFlags` (null in free-flow — `postMoveResult`'s `...(extraFlags && typeof extraFlags === "object" ? extraFlags : {})` adds nothing). Every `await` kept; one `try` / `catch` / `finally` around the same stages with the same three early returns inside it (target-choice card, confirm cancelled, track gone), so the `finally` releases the lock on each; the success-path release before the riders and `lockReleased` (#315 S01) unchanged; the claim, its refusal undo and `_heldMoveLockClaim` unchanged; the session gate, D8 notice, `!roll` spend (X37) and `deferWhileBusy` hold run before the `try` exactly as before. The which-fight / which-vow / which-legacy / vow-gone cards: readMove sets `targetChoice` instead of posting and returning, but the later checks are keyed on other move ids, so the first choice stands, and `postTargetChoiceCard` posts the same card with the same `actorId` (`speakerActorId` for the fight card, `rollerActor.id` for the others — as before).
- **`rollerFor` is resolved twice (readMove, rollMove) where it was once** — identical unless the speaker's Actor is deleted while the confirm dialog is open (then the first PC; before, the deleted object). Not filed for free-flow (see Not probed for the round).
- **`hookOptions`** (`onMessage(message, hookOptions = {})`): Foundry calls `createChatMessage` hooks with `(document, options, userId)`; `batchReleased` is set only by the driver's runner (`setBatchFreeFlowRunner`). `drainDeferredForcedMoves` calls `onMessage(message)` with no options, so a held move drained while Batch Mode is on goes through the batch gate again — joins the round or runs as free-flow, as a fresh press would.
- **8228a49 left the free-flow path unchanged** apart from the batch gate in `onMessage` (before the canonical-GM and session gates — decided: "Chat is table talk while the mode is on … a card button's move becomes its roller's entry") and the `narrate` wrapper for upgrades: `narrateUpgradedResolution` passes `{ speakerActorId }` to `narrateResolution` as `renarrateUpgrade` did before (`src/moves/resultUpgrade.js:809`), and `acceptRoundUpgrade` returns false for a free-flow card (`isResolving` / no round entry has its `resolutionId`).
- **`routePacedInput` = `decidePacing` + `narratePacedInput`** (`src/pacing/router.js:169-304`): the pacing switch, the `!roll` force (`forced: true`, spent by the pipeline after the claim), the combat backstop, the density window and the telemetry are where they were; the returned shapes for MOVE / NARRATIVE / NWMA are the old ones; `suggestedTargetId` reaches `narratePacedInput` (both the first try and the 429 retry, `src/narration/narrator.js:3004`, `:3029`) and the card's `suggestedMoveTargetId` only for a scene-challenge variant (`:3247`). `ignoreForceMove` is passed only by `readAction`.
- **PACED-ROLL-OPEN-PRESS / Y08** (`src/moves/cardActions.js:744-958`): the paced Roll and the which-fight pick relay to the canonical GM, check the card (`isCard`, the pick against the card's own `fights`), the roller's owner or a GM (`requesterOwnsActor`), claim the GM-authored card before the post behind `_inFlight`, release the claim when the post fails, and post `bypassPacing` + `deferWhileBusy` — held at the lock and the session gate (`pacedRollHeldAtLock.test.js` shape). The client re-arms on a press not delivered (`relayCardAction`, `src/index.js:7637-7657`). PACED-VARIANT-NO-TARGET: the card's `suggestedMoveTargetId` rides as `forcedMoveTargetId`; a challenge that ended meanwhile scores "gone" (`scoreSceneChallenge`), never another.
- **Y07** (`staleMoveLockAtReady`, `src/index.js:1166-1174`; the ready reset `:7142-7183`): a connected co-GM's lock is left; the clear is written only while the store still holds the claim found; nothing is written when there is nothing to clear or mint. A Batch Mode round left resolving by this client's own earlier page is stale at its ready and is cleared before `recoverRound`'s claim is retried (`_waitingForLock` → the reset's write).
- **LOCK-RESURRECTED-BY-COGM-STALE-WRITE** (`restoreLockOverCarriedBackClaim`, `src/index.js:1214-1225`): gated on the lock naming this user and a claim this client released; puts back `_heldMoveLockClaim` when a later move of its own holds the lock, else releases under the spent token. The batch claims set `_heldMoveLockClaim` too, and only one claim holds at a time on a client in every path but PIPE-4 (Z25)'s. The other writers I checked take the lock from the store with no await between read and write: `claimPendingMoveLock`, `consumeForceMove` (`{ ...latest, pacing }`), `markForceNextAsMove` / `applyPaceCommand` (`!roll` / `!pace` read the cache then write), `clearPersistedNextMoveAdd`, `grantNextMoveBonus`, `consumeNextMoveBonus`, `persistResolution` (store-owned), `persistCampaignStateFields` / `persistSceneLedgerFields` (`{ ...latest }`).
- **Y16 / ERROR-TEXT-BLAMES-KEY's `choiceCard` step** (`src/moves/persistResolution.js:93-137`, `:162-184`, `:420-425`; `src/index.js:4085-4108`, `:5451-5486`): the actor write is one `actor.update` (`applyMeterChanges`), so a refusal is all or nothing and its noted steps are exactly the deltas not applied; the ally's momentum rides `opts.allyActorId` and the Retry applies it to the ally (`runSufferCall` → `aidedAllyActor`); every move delta is within `isRetryableSufferCall`'s ±6; `postSufferChoiceCard` catches and returns null, so a refused card is a step, never a throw; the record is still written after refused meters; the persist card is GM-authored and its Retry is claimed first.
- **Y17** (`postSessionGateNotice` + `speakerOwnerIds` + `markHeldUntilSession`, `src/index.js:1278-1336`): the roller's non-GM owners are whispered beside the author and the GMs; the held line is stamped `heldUntilSession` and cleared when the drain hands it back.
- **The session gate and `deferWhileBusy` queue**: a move drained into the session gate is re-held at the front (`_drainedForcedMoves`); a drained move that stops before its claim re-drains in `.finally`; two drained moves cannot both claim (the in-place claim on the cache, which the second reads a microtask later). Typed lines never reach the gate in Batch Mode (table talk).
- **Confirm dialog cancel / close**: `MoveConfirmDialog.close` settles `false` (`src/ui/settingsPanel.js:2244-2249`), Re-interpret settles `false` (the decided "cancels the move so the player can re-word it", decisions.md :3875); the pipeline returns inside its `try`, the `finally` releases. `ClarificationDialog.close` settles `{ kind: 'none' }` (`src/world/clarificationDialog.js:125-130`).
- **Claude faults per stage**: the classifier falls back to MOVE (`fallbackDecision`), `routePacedInput` throwing falls through to the pipeline; `interpretMove` throws → the pipeline's catch (the known ERROR-TEXT-BLAMES-KEY wording) → `finally`; `enrichForcedMoveStat` catches and keeps the listed stat; the ability scan, rider extraction and relevance resolver each fall back; `narrateResolution`'s rejection still records (#322 V09).
- **`!roll`** (`src/index.js:6243-6263`, AUTHOR-routed, GM-only): in Batch Mode it sets nothing and says to use "Roll a move instead" (decided: readings ignore `!roll`); otherwise a copy is written and a refused write is said.
- **`\` bypass and commands** (`isPlayerNarration`, `src/index.js:2654-2659`; `dispatchChatCommand`): unchanged; commands are consumed on every client before the batch gate.
- **Free-flow pre-roll dialogs holding the lock** — decided (decisions.md "Move-concurrency lock covers narration + persistence, not post-roll prompts"); PIPE-2 (refuted) is the round's case only.
- **The record / narrate order**: free-flow narrates then records (the narration card is up before the meters change; Burn / Improve stay closed until `originalApplied`), a round records before it narrates — both decided (decisions.md Batch Mode). Nothing the record writes needs the narration's id or card (the suffer card and the PtP card carry `resolution._id`, set in `rollMove` before either); `noteUnsavedOnCopy` is keyed by the working copy, which each round entry gets fresh.
- **Batch `finishRound`'s rider prompts after the narration** with the lock free — documented in `finishRound`'s header and the stage table; RIDERS-IGNORE-UNCHECKED applies to round entries as to free-flow (known).

### Checked and not a bug — cards

- **Y10** — `performVowRecommit` refuses a completed primary with the short card and skips completed copies (`src/index.js:3883-3888`, `:3912`); the claim stays (offer closed). Correct per the decision.
- **Y11** — the way-out card carries the threshold's `actorId` (`src/moves/cardActions.js:1303-1305`) and so does the combat-track card (`src/index.js:4333`, `:5694`); `applyWayOutPick` / `applyCombatTrackBattle` speak as it through `cardRollerPc` (`cardActions.js:1379`, `:1191`), the clicker only on a card with none; the threshold choice stays the crew's (X06).
- **Y20** — a suffer pick on a card whose PC is gone: a player is refused (`refusePress(ctx, "no-actor")`), a GM's press retires the card saying so; no first-PC fallback left (`src/moves/sufferCard.js:434-449`, `cardActor` `:468-470`).
- **Y23** — both native hooks act only on a player character's roll (`rolledByPlayerCharacter`, `src/index.js:2330-2333`; the payoff hook `:5018-5021`, the narration hook after its plan); an NPC card's sheet roll pays, recommits and narrates nothing.
- **Y24** — `applyConnectionPick` and `applyMilestonePick` claim before the effect and release on a failed effect (`cardActions.js:213-230`; `milestonePicker.js:128-149`); the won-fight ⚑ records `milestone:<card id>` on the vow's ledger after the mark and a re-press finds it (`src/index.js:4593-4602`).
- **Y25** — the recommit resolves the Item by id / the roller's exact name only (`ownOnly`) and the journal twin by id or exact name (`byNameOnly`) (`src/index.js:3882`, `:3890-3895`).
- **Y26** — `recommitRankStays` for the vow, bond and expedition cards (`src/index.js:3832-3834`, `:3793-3795`).
- **Y27** — reward pick / Link on a vow nobody holds close their card and say why (`src/session/swearVow.js:607-613`, `:1038-1044`).
- **D1** — `tda.attempt`, `expedition.finish`, `vow.swearRoll` on `applyCardRollerFollowup`: one claim per card before the post, released on a failed post, the card's roller (their player or a GM), `refusePress` on a non-owner, `deferWhileBusy` on the post (`cardActions.js:761-828`); the client passes its own PC only as the no-roller fallback (`src/index.js:7637-7656`). Relay retry / two presses / a re-render: the claim and the live-flag render (`liveCardFlags`) hold.
- **SWEAR-ROLL-VOW-GONE** — the vow-gone check runs before the claim, closes the card (`vowGone`) and posts one "Not sworn" notice (no `refusePress`, so no second whisper) (`swearVow.js:939-948`).
- **VOW-ID-NEVER-LANDED — can `isVowCopy` now match the wrong item?** No realistic case: a shared vow's `vowId` is its inciting card's *message* id (`swearVow.js:220`), never an Item id; a sheet vow's is its own Item id; embedded ids are unique per actor; a dragged or duplicated vow carries the copied flag, which matched before the fix as well. (Its two real gaps are CARD-1 (Z55) and CARD-6 (Z54).)
- **RELAY-REFUSED-PRESS-UNTOLD** — `refusePress` records on the dispatch's own ctx (WeakMap) and `runGmAction` tells once after the handler (`src/multiplayer/gmRelay.js:357-358`, `:389-417`); every card handler that refuses for whose the card is calls it (cardActions' twelve sites, `milestonePicker.js:100`, `sufferCard.js:440`, `:458`, burn / improve); a helper's and its caller's record are one; names are escaped.
- **PACED-ROLL-OPEN-PRESS** — `paced.roll` / `whichFight.pick` on the same shape; the pick is checked against `f.fights` before the roller (`offers`), its stamp is the fight's id, and the render disables on the live flag (`src/index.js:7674-7703`, `:8050-8061`); the paced card carries its narrating PC (`narrator.js` `postPacedNarrativeCard` `actorId`).
- **Batch Mode: the round card's own Burn / Improve** — closed when its narration begins (`closeCardUpgrades(round, null)`, `src/batch/driver.js:835-849`, `:935`), and on a Keep (`keepUpgrade`); `resultUpgradeBlocker` refuses `round-closed` (`src/moves/burnMomentum.js:148-155`). Between `beginNarration` and the close no card is pressable: every offered roller has already decided (Keep / burn / improve) before the phase moves.
- **Batch Mode: a card's forced move's flags** — `forcedFromFlags` carries the move, target, target id, `swearToConnection`, `tokenDragSetCourse`, `incitingSwearMessageId` (`driver.js:1072-1081`) and the reading forwards them to `rollMove` (`src/moves/movePipeline.js:484`, `:519-520`); a non-participant's runs as free-flow.
- **A completed vow is never written** — `markVowProgress` refuses one (`src/character/actorBridge.js:625-628`), `advanceVowClocks` skips one (`:1098-1103`), the recommit skips completed copies; the payoff ledger's flags on a completed copy are bookkeeping.
- **Reward scaling** — `planRewardGrant`: strong full (+2 supply / momentum), weak +1 or "with a string", miss lost (`src/moves/rewards.js:149-158`); a won fight's reward lands on the holder's copy when the winner holds none (`grantLinkedVowReward`'s `rewardHolder`).
- **Every forced card post passes `isPlayerNarration`'s ≥ 10-character floor** — the way-out narrations, "Mark progress on your vow.", "Attempt to fulfill your vow.", the picks' and the paced Roll's re-posted lines (already ≥ 10 to have reached the pipeline).
- **HTML sinks** — `postVowRecommitFulfilledCard`, `tellRefusedPress`, `postVowWriteRefusedNotice`, `holdForNextRound`'s whisper and the round window's offer row escape their names and text.

### Checked and not a bug — upgrades

- **Y09's main path** — a burn to a weak hit whose price stands (Battle /
  Clash) keeps the cards present at the burn: `keepPriceCard` stamps
  `upgraded`, drops the spent hint and re-renders (`src/moves/resultUpgrade.js:657-704`),
  and a pick on them is not refused (`src/moves/sufferCard.js:426`); a price
  that does not stand retires them (X15). The second-generation gap is UPG-8 (Z47).
- **Y15's clause split** — re-swept every vendored Starforged asset × every
  move its text links, the 8fb7bfa scanner against HEAD (values: stats,
  companion health, vehicle integrity): the only changes are the intended
  ones — Combat Bot's Clash 1 → 0; Bonded's Set a Course +heart; Glowcat /
  Sprite +its health on Secure an Advantage / Gather Information — plus
  Symbiote on Endure Stress, a cost-mention link the structured pass never
  keys (see Not probed). Tech's "add +wits instead of +integrity" stays no add.
- **Y18's hint** — before the move card posts, `upgradeOpenFor` is null and
  the pipeline's `upgradeOffered` (read before the price lands) decides
  (`src/moves/sufferExecutor.js:320-330`); a redirect picker's pick closes
  the move's upgrades before its executor runs (`src/moves/sufferCard.js:581-603`),
  so a resist card its pick posts carries no stale hint.
- **Y19 in free-flow** — riders run right after the record
  (`src/moves/movePipeline.js` recordMove → finishMove), their picker bound
  to the move; an upgrade pressed later retires it with the rolled outcome's
  cards (X15). Only the round runs them after its upgrades (UPG-3 (Z28)).
- **Y21** — no Endure Harm / Stress / Withstand Damage miss seed; the at-0
  card's own roll carries `oracleMemory` with the PC's name
  (`src/moves/sufferExecutor.js:408-422`, `src/moves/sufferDialog.js:383-388`).
- **Y22 / VALUE-ADD-INTEGRITY** — a value add resolves from the roller's
  snapshot stats or the ability's own asset track; a command-vehicle module
  gets none; a 0 value adds nothing; a general clause's value is not taken
  when the ability links the move elsewhere (`src/moves/abilityScanner.js:380-387, :585-604, :663-683`).
- **HOVERBIKE-WEAK-AS-MISS-UNAPPLIED** — `canBurnMomentum` counts a burn
  landing on a weak hit as a miss when the taken add costs it
  (`src/moves/resolver.js:148-160`); the press re-checks with the card's
  `weakHitAsMiss` (`src/moves/burnMomentum.js:560`), so the burned outcome
  can only be a strong hit; the dialog shows the cost beside the add.
- **D2's scoring** — the module's variants match the vendored texts (Face
  Danger (Scene Challenge): no strong-hit momentum, weak hit progress +
  segment; Secure an Advantage (Scene Challenge): the weak hit's choose-one);
  an upgrade's clock arithmetic from the receipt (`src/moves/sceneChallenge.js:166-170`):
  miss → strong takes back what it filled, miss → weak 0, a full clock 0; the
  miss's price skips the challenge clock (`skipClockIds`) and the reversal
  never touches it; a challenge finished since scores nothing ("gone").
- **SCENE-VARIANT-ABILITIES-UNKEYED** — every asset matcher maps the variant
  to its twin: `structuredMatches`, `extractStatReplacement` and `addFor`
  through `moveTarget`, the Haiku pass and `annotate` through `assetMatchMove`
  (`src/moves/abilityScanner.js:210-212, :357-364`), `extractRiders`' prompt
  (`src/moves/consequenceRiders.js:351`); Improve Result reads the same
  scan; Take a Break's +1 keys on `moveRollKind` (action); mischief's
  category map has both variants. No matcher missed.
- **D3** — `isUnprepared` is the one predicate: the executor, the "any"
  card's buttons and the GM's re-check, enumerated options (chains
  included), the rider, Repair's dialog field, Apply and the GM's payment;
  `clearUnprepared` clears the crew and names an ally's refused clear on a
  card; Resupply's branches are gated on the roller's impact.
- **D8's own case** — the burned price's own triggered clock: its newest live
  vignette of the session is struck and `burnSuperseded`, its ledger entries
  retracted on a copy (`ledgersHold` skips a no-op write), the superseded move
  narration retracted in the store and on the working copy the re-narration
  reads (cloned after the reversal); a vignette still being written is
  skipped and drops itself (`triggerVignetteInFlight`, `clockStillTriggered`).
- **Burn / Improve in Batch Mode** — the round card carries `resolutionId:
  ''`, so `supersedeOriginalNarration` never strikes it; the re-narration is
  handed to `acceptRoundUpgrade` (keyed by the original resolution), an early
  burn while the round still rolls is recorded (`decideUpgrade` `early`), the
  window's Burn is the card's own relay (one claim, `_upgradeInFlight`), and
  `roundClosed` closes every result card once the narration is claimed.
- **Claims and single application** — both upgrades claim `consumed` before
  any effect and share one in-flight set; a suffer pick is claimed before its
  effects and released in `finally`; Repair pays in full before any repair.
- **W16-CHOOSE-BELOW, READDEBILITIES-CUSTOM-COMMENT,
  REPAIR-TRADE-WHILE-UNPREPARED** — as fixed: picker first and "(choose it on
  its card)"; `custom1` / `custom2` in `IMPACT_KEYS` for the bounds and the
  burn's reset; the trade refused at all three gates, names escaped.
- **A waypoint alternative's retirement** (`retireOutcomeChoiceCards` without
  `keepPriceCards`) never meets a price card: a matched waypoint miss routes
  no price (Confront Chaos is the choice).
- **New HTML sinks** — `supersededVignetteContent` (static notes),
  `keepPriceCard` (renderSufferCard escapes), `effectsNoteHtml`,
  `crewClearedNote`, Repair's unprepared lines: all escaped or static.

### Checked and not a bug — narration

- **The round prompt's silent opt-out** (decisions.md Batch Mode, 2026-11-06): `roundNarrationEntries` takes `round.acting` only (`narrator.js:903-915`; `actingOrder` in `round.js:569-579` holds only ready / Send-now readings); the PARTY roster is filtered to the acting names (`buildPartyContext` `:4391-4409`, a single actor renders no PARTY block), one CHARACTER block per acting PC (`extras.roundCharacters`, `narratorPrompt.js` [8]), THIS ROUND lists the acting entries alone, `round_resolution` is not a `SPOTLIGHT_MODES` mode (`maybeAdvanceSpotlight` `:4337`), the RECENT SCENE ring's earlier round cards carry only their own acting entries (`ringEntryText` `:1465-1474`), the paused / fallback cards list acting entries only. No passer is named anywhere in the request.
- **Every roller's final outcome:** the narration reads `entry.rolled.narrationInput` from the round `claimNarration` returned (the latest store, `driver.js:927-937`); `decideUpgrade` replaces it with the upgraded outcome's (`round.js:671-689`), `markRecorded` without `narrationInput` keeps an early upgrade's (`driver.js:770`); a burned resolution carries `oracleSeeds: null` (`burnMomentum.js:677`), so a miss's price does not reach the round prompt after a burn.
- **The round's memory writes carry its `narrationId`:** the sidecar (`applyNarratorSidecar(…, { narrationId })` `:1009`), the card (`postRoundNarrationCard` flags), the detection / Make a Connection auto-create and the tier pass when it runs (`runPostNarrationPasses(…, { narrationId })` `:1051-1053`), the ship position (`applySidecarSideData` → `applyShipPositionChanges`); the X-Card's pick stops at another round's card (`:1598`); `registerXCardRedirectHook` clears on a round card; the rolling-summary refresh hook fires on it. The Chronicle entry is XCARD-CHRONICLE (known).
- **The round's sinks:** the round card is `escapeHtml(stripMarkup(…))` (`:1106`), each entry line escaped (`roundEntryHtml`); the fallback and paused cards escape their move lines; the session recap's round branch strips markup and escapes the quoted sentence (`:1806-1820`); the Round window's "Latest narration" strips `<npc>`, excludes fallback / X-carded / superseded / whispered cards and escapes (`roundWindow.js:62-73`, `:186`).
- **The round on a working copy:** `narrateRound({ campaignState: workingCopy() })` (`driver.js:936`, `workingCopy` = deepClone `:253`); `rollEntry` and `finishRound` copy too (`:745`, `:973`).
- **Y04's listed sites hold:** galley (`sessionLifecycleDialogs.js:366`) and closing vignettes (`:669`), the clock vignettes (`:301`, `clocks.js:856`, `payThePriceClocks.js:133`), `!incite` (`index.js:2898`), the Session panel and Campaign Start (Y04 tests), the native sheet roll (`index.js:2393`), `@scene` (`:685`), the oracle follow-up (`oracleFollowup.js:137`), Burn / Improve re-narration (`burnMomentum.js:610`), the relayed sidecar. (NARR-1 (Z02) / NARR-2 (Z02) are the two handlers not on the list.)
- **Y05 holds:** `startScene` chains starts on `_sceneStartTail` with a 10 s bound and re-looks for the store's scene after the wait (`sceneLifecycle.js:44-104`); Begin's galley waits for its clock vignettes (`sessionLifecycleDialogs.js:358`, bounded); `!ptp`'s follow-up waits for its trigger vignettes (`oracleFollowup.js:132` → `payThePriceClocks.js:232-240`, 60 s bound). A round's narration and a trigger vignette one of its entries' prices fired share a scene through the same chain.
- **XCARD-LATE-CAPTURE:** every capture writer checks `isNarrationXCarded` before it writes — `runDiscoveryDetection` / `runPacedDetection` on entry and after the reply (`narrator.js:1325`, `:1333`, `:3116`, `:3124`), `routeEntityDrafts` before each entity and after each auto-create step (`entityExtractor.js:552`, `:585-590`), `applyEntityRenames` (`:689`, `:720`), `routeWorldJournalResults` (`:1099`), `appendGenerativeTierUpdates` before the call and each detail (`:1437`, `:1466`), `confirmDraft` (`:1928`, `:2024`), the inciting capture's lore (`incitingIncident.js:535`). The round path reaches them through `runPostNarrationPasses`.
- **PTP-PCLESS-NARRATED-AS-FIRST-PC:** a no-payer `!ptp` card carries no `oracleNarration` / `oracleMemory` and asks for no follow-up (`index.js` `handlePayThePriceCommand`); a relay naming it is refused (`oracleFollowup.js:93-100`). (Its clock advance is the open PTP-PCLESS-CLOCKS-ADVANCE.)
- **Y29:** `postSessionRecap` strips the markup before the sentence split, both branches (`narrator.js:1808`, `:1829`).
- **Thinking-off exact ids:** `THINKING_DISABLED_MODELS` (`thinking.js:18`) matches `claude-sonnet-5` (and `opus-4-7/4-8`), optionally date-stamped, never `claude-sonnet-5-5`; the offered narration models are Haiku 4.5, Sonnet 4.5 and `claude-sonnet-5` (`settingsPanel.js:131-135`).
- **`api-proxy.js` / `net/`:** every call is bounded by `fetchWithTimeout` (120 s, `fetchWithTimeout.js:31`), its body readers race the same deadline (a stalled 2xx or error body rejects); a non-2xx throws `Anthropic API error <status>: <body>` (a 401 adds the key-prefix hint); `isRateLimit` keys on "429" — one retry after 5 s on every narration path, the round's included (`narrator.js:1000-1024`); `callNarratorAPI` warns on `stop_reason: max_tokens` and records the error for `!narrator debug`.
- **Budget shedding:** `buildLedgerBlock` sheds state only, line by line, whereabouts last; frame, truths, CORRECTED and ship position count toward the cap but are never dropped (`narratorPrompt.js:326-415`).
- **LAST SESSION:** `previousSessionSummaryFor` drops a summary of the current session, numbers the heading, `isLast` false when sessions between left none (`narrator.js:534-547`); rendered for every prose mode, the round's included.
- **`@scene` continues the scene:** `interrogateScene` calls `ensureSceneStarted` (starts one only when none is open, canonical GM) and never `startScene` / `endScene` (`narrator.js:2293`).
- **`!narrator debug`:** GM-only, typist's client, whispered; Private Lines counted not shown (`redactPrivateLines` `narratorDebug.js:280` — a Private Line is a single-line text input, `settingsPanel.js` `newPrivateLine`, so no line escapes the redaction); every captured string escaped.
- **The CHARACTER block's "Notes for narrator"** reads the actor flag `narratorNotes`, which no production code writes — decisions.md "Character identity is established once…" keeps it flag-only on purpose (a GM may set it by macro); not filed.
- **The X-Card's kept-connections notice** (new, `safety.js` `postKeptConnectionsNotice`) escapes names and is not a narrator card, so it neither bounds nor joins a beat.

### Checked and not a bug — continuity

- **A Batch Mode round card is an X-Card target, and its capture carries its id.** The round card carries the flag family and `narrationId` (`postRoundNarrationCard`, `src/narration/narrator.js:1099-1145`), so `sessionNarratorCards` / `xCardedNarrationCards` pick it; the beat walk stops at another round's card and at a forced-move post (`:1595-1612`), and a trigger vignette posted during the round's rolls (no `roundId`, inside two minutes) joins the round's beat as a free-flow move's vignette does. Its sidecar is applied under the same id before the card posts (`:1009-1015`), and `runRoundNarrationPasses` → `runPostNarrationPasses` hands the id to the detection, tier and auto-create writers (`:1041-1056`, `:1239-1330`). The fallback card carries no id (no sidecar) and is out of memory; the paused notice is not a narrator card.
- **"The X-Card stops a round resolving."** A collecting round waits (`advanceOnce` `src/batch/driver.js:543-560`; `requestSendNow` refuses `x-card`, `:590`), and the lift advances it again (`_xCardWas`, `:1189-1225`). A round already rolling keeps its rolls and riders and posts the paused notice in place of its narration with no sidecar applied (`narrateRound` `narrator.js:937-1027`, both X-Card gates) — the decision's "the moves stand", the free-flow behaviour of a move made under a pause. Nothing half-written: no sidecar, no capture, no Chronicle entry for a paused round.
- **XCARD-LATE-CAPTURE (fixed).** Every capture writer checks the stored `xCardedNarrationIds` before each write — `routeWorldJournalResults` per item (`src/entities/entityExtractor.js:1095-1179`), `applyEntityRenames` per rename and before its notice (`:689`, `:720`), `routeEntityDrafts` per entity, around the auto-create's awaits and before the draft card (`:544-640`), `appendGenerativeTierUpdates` on entry and per detail (`:1437`, `:1466`), the detection passes on entry and after the Haiku reply (`narrator.js:1325-1333`, `:3116-3124`), the inciting incident's situation lore (`src/session/incitingIncident.js:535`), `confirmDraft` after the creation and before marking (`entityExtractor.js:1928`, `:2024`). Every capture scheduler passes the narration's id (`narrator.js:815`, `:847`, `:1051`, `:2142`, `:2391-2392`, `:2488`, `:2504`, `:2616`, `:2631`, `:2864`, `:3005-3006`, `:3030-3031`).
- **XCARD-AFTER-STRIKE-STILL-NAMED (fixed).** `retractNarrations` relabels only a bare table strike (`isBareTableStrike`), keeps its `retractedAt`, and drops the strike's `sessionRetractions` entry by `narrationId` (`src/factContinuity/ledgers.js:307-327`); a superseded narration's (D8) leaves the table's strike; a Replace's struck original (`correctedTo`) is left and the GM's replacement — GM-authored, no narration id — stands; `mergeSceneLedgers` re-applies it to a stale copy. `!truth set` restores lore only after the lift is in the store (`src/factContinuity/chatCommands.js:289-296`). `rememberSessionRetractions`' dedup by label + fact keeps the first narration's id; a later X-Card on the second narration that asserted the same struck fact leaves the first (kept) narration's strike named — correct.
- **Y30 (fixed).** `strikeTruth` / `replaceTruth` refuse an already-retracted entry (`ledgers.js:614-618`, `:641-645`); `mergeSceneLedgers` keeps an `xcard` store truth over a working-copy correction and files no replacement (`src/factContinuity/sceneLifecycle.js:675-727`); the dialog reads the store after its prompt and writes nothing for a row that no longer matches (`src/factContinuity/correctionDialog.js:214-235`). A `!truth set` cannot hit the `refiled` drop: it has no await between its read and its persist.
- **Y32 (fixed).** `loreRetractionHolder` hands an entry to another active bare strike, and holds it for an X-Card retraction or an earlier scene's strike (`src/factContinuity/retractions.js:185-205`); `restoreStruckLore` rewrites `retractedByTruth` to the holder or skips (`src/world/worldJournal.js:632-660`).
- **Y01 (fixed).** The migrated tier entry, the archived lore page and LAST KNOWN carry the truth's / state value's id (`sceneLifecycle.js:379-399`, `:424-427`, `:533-604`; `worldJournal.js:283-290`); `lastKnownWithout` falls back through the chain to the newest value no removed narration set, a GM's later `!state set` value (no id) heading the chain and standing (`retractions.js:429-446`); `retractNarrationCapture` runs over every tier type.
- **Y02 / D6 (i) / D6 (ii) / MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED / XCARD-CONNECTION-PORTRAIT-ORPHAN (fixed).** The faction surface and the draft card are stamped; a rename carries `renamedBy` and is reverted only while the card still has the narration's name (`retractions.js:348-375`); `withdrawNarrationDrafts` marks only pending rows of stamped cards — a row the GM confirmed or dismissed stands, as D6 (i) decided (`entityExtractor.js:2152-2175`); `retractNarrationConnections` deletes only an unused, unmarked, sheet-untouched stamped connection, with its bonds, id, portrait, and reopens its source row (`src/entities/connection.js:368-395`) — a GM-confirmed connection carries no stamp and is never touched.
- **SHIP-POSITION-FLAG-MERGE (fixed).** Every position record starts from `emptyPosition()` (`narrationId` / `previous` null, `src/factContinuity/shipPosition.js:48-63`), so a later `!at` / Set a Course / token move carries no removed narration's stamp; the X-Card's restore writes the record whole (`narrator.js:4745-4775`).
- **Y31 (fixed) and the X-Card.** `recordFactionIntelligence` updates the page a name variant matches by `factionNameKey`, under the page's own name (`worldJournal.js:368-430`); `undoNarrationEntries` restores or deletes by the stamp whatever name the narration used (`:903-968`).
- **A relayed sidecar** from a player's client is dropped for an X-carded narration and for an ended scene (`narrator.js:4084-4091`).
- **The X-Card's propagation removes the fact wherever stated** — same-session tier details and lore stating the X-carded truth, even ones a kept narration or the GM wrote (`propagateRetraction` `retractions.js:110-139` from `safety.js:276-285`): by design (U07 full exclusion; decisions.md "A strike reaches every copy of the fact": "The X-Card calls `propagateRetraction` for each truth it retracts").
- **The clarification dialog** settles once, resolves "none" on close, offers connections by host id and skips inactive ones (`src/world/clarificationDialog.js:70-160`, `:205-245`).
- **The World Journal panel**: every action is GM-gated; a GM Confirm / severity change clears the narration stamp (the GM owns the entry — the tenth audit's note); a fact-continuity catch gets Correct… only (`src/world/worldJournalPanel.js:96-215`).
- **The consistency check** posts GM-whispered review cards deduped per scene and stays out of narrator memory (`src/factContinuity/consistencyCheck.js:110-150`; the defensive excludes in `sessionNarratorCards`).
- **The sidecar parser** strips every fenced object, takes the last, and never throws (`src/factContinuity/sidecarParser.js:56-110`); a relayed sidecar is re-normalised and bounded (`narrator.js:4070-4076`).

### Checked and not a bug — entities

- **D4 / Y12 — the seed's marked introduction** (`src/entities/seedIntro.js`): `markedElements` takes the outermost marked element per match with depth counting for nested same-name tags, a void or self-closing tag, and an unclosed one (only its opening tag is taken); `markSeedIntro` marks only bare `<p>` / `<ul>`, and both seeds compose nothing else (`connection.js:822-841`, `ship.js:796-831`) from escaped prose, so no model-written tag is marked; a re-seed replaces the marked elements in place and keeps the GM's paragraphs, `!ship envision` / `!ship history` sections, promoted lines and the portrait block; an unmarked tab gets the intro below the portrait (D4's stated rule — a pre-D4 introduction is kept, as decided). Regenerate keeps every rolled field (`existing.role || …`, `existing.type || rolledType`), so it rewrites only the intro.
- **D4 — Characteristics**: `withSeedCharacteristics` replaces a seed-form line that reads the record's previous value or this seed's, keeps every other line below; a GM-edited seed line stays (D4's "a seed line they changed — stays"); after a GM's sheet-pronoun fix the old "Pronouns:" line matches the record's prior value and is replaced.
- **Y13 — the sheet's pronouns**: every NPC-pronoun reader goes through `getConnection` / `listConnections` (`formatEntityCard`, `formatSectorNpcProfile`, `endSessionVignette.composeConnectionHint`, `audio.resolveNpcVoiceForCard`, `consistencyCheck.buildRecordedIdentitiesBlock`) or `withSheetNotes` (the panel's `loadAllEntities` / `findEntity`, so its portrait prompt); every writer reads the raw flag (`updateConnection`, retractions, the seeds), so the overlay is never baked into the record; the seed takes the sheet first and writes both; `withCurrentGenderLead` swaps only a leading "a woman/man/person" and `buildEntityContext` repeats the current descriptor.
- **Y34 adoption — collisions with a distinct entity**: settlement / planet / location adoption keys the sector as their creation does (`data.sectorId ?? activeSectorId` both sides), a connection `data.sectorId ?? null` both sides; same-type sites are deduped within a sector ("Derelict Starship II", `precursorSites.dedupeNames`) and differ by sector across sectors; sector creation's `persist: false` copy lists an earlier same-named sibling, so it is never adopted; the detection pass's `entityExistsAnyType → actorNameMatches` sees every starship / location Actor by name, so a narrator ship never adopts the players' unlisted ship; `adoptUnlistedEntityJournal` prefers an exact name over a `factionNameKey` match (Y31 makes "The X" and "X" one faction by decision).
- **`registerUnlistedEntityActors`** (`migrator.js:844-886`): canonical GM at ready, after the connection migration; copies of a listed record are skipped by record id (listed journal-hosted and legacy ids resolve the record id from the page flags); never-stored sectors' leftovers skipped; World Journal pages, art and sector journals carry no `faction` / `creature` page flag, so they are never listed; one write onto the latest store, id lists only.
- **BOND-ITEM-AFTER-RELIST** (`entityExtractor.js:1887-1897`): `listedConnectionNamed` uses `entityExistsForName`'s own rule (exact, then title-stripped), and `registerConnectionOnActiveCharacter` is idempotent per PC and record id — U25's lost-card-write retry makes no second Item (its unit test). A "Captain Vex" row bonding the card's PC to the existing "Vex" is the decided identity rule.
- **JOURNAL-ORPHAN-ON-REFUSAL without a reload**: the retry adopts and seeds (ENT-1 (Z60)'s control). A refused page creation inside `createFaction` leaves a page-less journal that neither adoption nor the load lists (both read the page flag) — a partial create of the same rarity as ENT-6 (Z62), not separately filed.
- **NOTES-CARD-ENTITY-UNDECODED** (`narratorPrompt.js:744-776`): one pass — `&amp;lt;` stays the text `&lt;`; tags are stripped before decoding, so an escaped `&lt;b&gt;` the GM typed reaches the card as text.
- **SHIP-SEED-MISSION-REGION**: both the seed (`ship.js:572`) and a detected ship's Confirm (`entityExtractor.js:892-898`) roll the type with `{ region }`; `refForRegion` resolves the mission cross-reference (`oracles/roller.js:438-470`).
- **VOW-ID-NEVER-LANDED's Item-id rung** adds no match for a duplicated PC: a sidebar Duplicate copies the `vowId` flag with the Item id, so the flag rung already matched it; `vowHolderActorId` already matched the id (beyond ENT-2 (Z54) / ENT-3 (Z55)).
- **READDEBILITIES-CUSTOM-COMMENT**: `countImpacts(sys.debility)` counts the same fifteen booleans the vendor's `#impactCount` does (`Object.values(debility).filter(v => v === true)`, vendor `character.ts:41-44`).
- **VALUE-ADD-INTEGRITY** `readAssetIntegrity`: the vendor `AssetConditionMeter` is `{ enabled, name, value, min, max }`; the vendored Hoverbike's track is `{ name: "Integrity", value: 3, max: 3 }`.
- **XCARD-CONNECTION-PORTRAIT-ORPHAN** `deleteEntityArtAssets`: canonical-GM gated, matches an asset by its own `entityType` / `entityId` (the record `_id` `callOpenRouter` stamps) or the record's `portraitId`, drops only the index entries of entries it deleted, one write onto the latest store; the X-Card finish runs it after the capture undo (`safety.js:259-270`), so `connectionUsed` reads the undone record.
- **encounterSpawn / ironswornPacks**: the card's raw HTML is the vendor compendium's own `progress.system.description`, looked up only in `foundry-ironsworn.foeactorssf`; the name is escaped; a player's `!sfc encounter` posts the card (no token); a GM reuses an imported world Actor by `compendiumSource`.
- **ironswornAssets**: the fifteen `Ship-NNs.webp` and twelve stellar tokens exist in the vendor; the stellar map's keys equal the Stellar Object table's text (the artificial star has no token).
- **Sinks escape**: the ◈ New Entities card, the rename notice, the migrator's summary card, the Chronicle panel and the Entities panel escape every document-derived string.
- **PC predicates**: every `type === "character"` test in the area pairs with the `entityType` exclusion (`actorBridge.js:73`, `migrator.js:590-591`, `entityExtractor.js:1382-1385`); the connection seeds require the connection flag.

### Checked and not a bug — session

- **Y05 (Begin's two narrations serialised)** — `startScene` runs behind `_sceneStartTail` (≤10 s) and adopts the store's scene after the wait (`src/factContinuity/sceneLifecycle.js:79-120`); Begin's galley awaits `clockVignettes` (`settledWithin`, ≤60 s) and reads its copy afterwards (`src/safety/sessionLifecycleDialogs.js:296-336`, `:353-378`); `!ptp`'s follow-up waits `triggerVignettesSettled` on the GM, and the GM's relay queue runs `payThePrice.advanceClocks` (which sets `_triggerVignettes` before it returns) ahead of `oracle.narrate` (`src/index.js:3496-3512`, `src/oracles/oracleFollowup.js:124-133`). No regression found.
- **Y06 (a relayed End / Flag / Take a Break refused → the GM's note)** — `endSessionOnce` / `correctEndedSession` post the not-ended note only for `ctx.local === false` and rethrow (`sessionLifecycleDialogs.js:604-611`, `:712-722`); `applySafetyFlag` whispers a private flag's note to the requester + GMs without its text, `applyTakeBreak` posts publicly (`src/safety/sessionDialogs.js:124-136`, `:283-292`); the local path's card is worded by `requestGmActionSafely`'s `ok: false`. `gmRelay.runGmAction` builds `local: false` for every socket relay (`src/multiplayer/gmRelay.js:487-497`).
- **END-ON-ENDED-SESSION-WORDING** — `postEndSessionCard` (`:464-510`): a failed End on a session already ended says "nothing was ended … the focus … was not recorded, and no momentum was given"; any failed End lists the foci with no "+1 momentum"; a relayed End on an ended session posts no player card (the GM's correction note is the word). Correct for the local, relayed and no-GM paths.
- **Y07 (the ready reset)** — `staleMoveLockAtReady` keeps a lock whose claimant is another connected user and resets one held by nobody named, this client's earlier page or a departed user; the ready write carries the lock fields only while the store still holds the stale claim, and writes nothing when neither the lock nor a mint changed (`src/index.js:1155-1172`, `:7141-7186`).
- **Y36 (the inciting ⚔ re-armed after the gate)** — the wait is registered before the post (`swearVow.js:383-399`); the gate's notice names the dropped post (`gatedMessageId`, `src/index.js:1295-1301`) and is whispered to the post's author; `rearmSwearOnGateRefusal` re-arms only on the author's client, by the post's `incitingSwearMessageId` (`:411-442`), bounded at 20 cards. A post that fails re-arms at once. In Batch Mode the press is held for the round instead (no gate notice) — see SESS-D1 (Z30) for what that does with two pressers.
- **Y37 (the full check inside the queued clock write)** — `fillOneSegment` decides `wasFull` from `mutateClock`'s queued read (`src/clocks/clocks.js:665-675`, `:787-798`); `advanceClock` / `fillClock` post "already triggered" and fire no vignette on it (`:602-652`); a campaign clock's odds are rolled before the queue but the fill is decided inside it; the panel's ↻ / + share both.
- **TRIGGER-VIGNETTE-LATE-POST at all three sites** — `stillTriggered: () => clockStillTriggered(…)` at `clocks.js:860-861`, `payThePriceClocks.js:143-144`, `sessionLifecycleDialogs.js:306-307`; `narrateClockAdvancement` awaits it after the reply and before the sidecar (`src/narration/narrator.js:2689-2700`, `:2710`, `:2724`); `clockStillTriggered` reads a tension / campaign clock from the store and a vow clock from its own copy (`payThePriceClocks.js:210-219`). The one new gap is a refused (owed) Begin fill — SESS-2 (Z63).
- **Y33 (the premise refused → told)** — `runIncitingIncident` checks the store's `establishedAt` after `persistSceneLedgerFields` (which still writes the premise via `onto` when the scene moved) and whispers the asker and the GMs (`src/session/incitingIncident.js:454-506`, `:566-581`); `!incite` passes the line's author (`src/index.js:2893-2903`).
- **Y38** — `callLoreRecapNarrator` sets `worldTruthsJournalId` on the caller only after `writeTruthsLink` resolves (`src/truths/generator.js:613-630`).
- **D2's clock helpers** — `adjustClockSegments` clamps within 0..segments on a copy in the clock queue and leaves a retired clock alone (`clocks.js:373-388`); `advanceTensionClocksForPayThePrice` skips `skipIds` (`:340-358`); a full scene-challenge clock posts "due to end — Finish the Scene", no trigger vignette, by D2's design (`src/index.js:4241-4247`).
- **Batch Mode at the session boundaries (decisions lines 9–95)** — End a Session's gate write closes a collecting round via `onCampaignStateChanged` and whispers its authors; a connected author's window restores the draft (`src/ui/roundWindow.js:696-702`); a resolving round is left to finish and the next round opens only while a session is active (`driver.js:963-972`, `openRoundIfDue` `:352-376`); Begin opens round 1 get-or-create and re-reads the stored round; a resolving round of the old session is not replaced (`:360`). A claimed card's forced move the X14 hold drains at Begin is held for the round (`takeForcedMove` sees no round yet) and joins it by `joinHeldMoves` once the open lands.
- **Numbering and boundaries (D12 / X64 / X65)** — `mintSession` / `rollSessionIfDue` unchanged since the tenth audit's trace (`src/session/lifecycle.js:197-281`); Campaign Start's Begin mints first and stamps `sessionStartedId` with `SESSION_MINT_FIELDS` merged (`src/session/campaignStart.js:153-183`).
- **Escaping** — every session, clock and inciting card escapes names, foci, flags, clock names and vow text (`sessionLifecycleDialogs.js` `escapeHtml` at every sink; `clocks.js:893-899`; `payThePriceClocks.js:272-278`; `endSessionVignette.js` / `galleyVignette.js` with `stripMarkup`).
- **Change Your Fate / Take a Break dialogs** — `rejectClose: false` on Take a Break (X43); `DialogV2.prompt` defaults it false (foundry-api-reference); Change Your Fate's labels are constants; no dialog is awaited inside `_beginChain` / `_endChain` / the clock queue (the dialogs run on the invoking client before the relay).
- **`touchSessionActivity` gating** — canonical GM only, at most every 10 minutes, never for an ended or idle session (`lifecycle.js:290-323`); the race it does have is SESS-1 (Z01).
- **The auto-recap's Session Gap Threshold vs `SESSION_IDLE_HOURS`** — `isNewSessionStart` (the setting, for the "Previously On" card) and `sessionNeedsMint` (fixed 4 h, for the mint) are separate, as the setting's own hint says ("for auto-recap purposes"); not refiled here — the narration auditor's `tests/probes/narration/sessionGapSettingNotBoundary.probe.js` (NARR-D3 (D6)) asks the maintainer whether they should agree.

### Checked and not a bug — sectors

- **The 54 commits in my area** (`git diff 8fb7bfa 8a4ae3b` — the clone is shallow, so `git log -p` shows whole files for `19082e9`): `shipPosition.js` +11 (SHIP-POSITION-FLAG-MERGE), `oracleFollowup.js` +8 (Y05's trigger-vignette wait), `roller.js` +64 (D5), `sectorSceneHooks.js` +72 (Y14, SHIP-POSITION-FLAG-MERGE), `truths/generator.js` +24 (Y38, LORE-READS-QUICKSTART-PRINTOUT). Each read line by line; the defects found are SECT-1 (Z14)/2/3/5 and D1 above.
- **Y14's anchor itself** (`sectorSceneHooks.js:226-262`, `:373-400`, `:549-596`): `isSettlementPin` still excludes planet/stellar pins and site pins (no `settlementId`); `isChartedSitePin` reads the pin's own `discovered` flag, which `restyleSiteOnScene` sets (`sceneBuilder.js:528-533`); `findSettlementNoteById` matches a site pin by `actorId` (`:327-336`); a record off a site writes `nearestLocationId: null` and the change check compares it (`:418-424`); an undiscovered pin stays "deep space" and leaks no name; a charted site pin renamed by X46 (`:95-117`) feeds its new label as `freeText`. The sync following a record that names a still-unexplored site is the decision's choice (Y14, "Rejected: a charted-only sync").
- **SHIP-POSITION-FLAG-MERGE** (`5d20896`): every writer of the position flag writes `narrationId` / `previous` — `computeTokenPositionRecord` (`:397-398`), `inferShipPosition` / `inferShipPositionFromEntityId` (`emptyPosition()`), the X-Card restore (`{ ...emptyPosition(), ...position }`, `narrator.js:4760-4761`), the sidecar (`:4809-4815`). The token write's no-change early return keeps a narration's id only when the token's record equals the narration's (a site record with the pin's label) — the GM's nudge then states nothing new; not filed.
- **D5** (`roller.js:433-498`, `index.js:3357-3364`): `!oracle` passes the active sector's stored `region` ("terminus"/"outlands"/"expanse"; `storeSector` keeps the id); `refForRegion` maps only `starship_mission_terminus` and only to a registered `starship_mission_<region>`; `ctx` rides through every recursion (action/theme, descriptor/focus, refs, roll-twice). Every other `rollOracle` caller that can reach the mission chain passes a region: the ship seed and the draft Confirm (SHIP-SEED-MISSION-REGION, `ship.js:565-574`, `entityExtractor.js:894`); no other caller rolls `starship_type` / `fleet` / a Space Sighting table (resolver seeds, ship envision facets, faction / connection / inciting rollers checked). Residual, not filed: `!oracle space_sighting_expanse` in a Terminus active sector rolls a chained mission on the Terminus table (the decision chose the active sector; ~0.3% of those rolls).
- **Oracle wiring** (script over `ORACLE_TABLES`): all 143 exported tables of `src/oracles/tables/*` are registered; every `ref` resolves to a registered table (plus the two pair refs); no table registered twice; every built-in tiles 1–100 exactly; every literal table id passed to `rollOracle` / `safeRoll` / `safeOracleRoll` / `rollPaired` and every ship-envision facet id is registered; the help and README name no unregistered id. `resolveOracleTableId` exact-then-case-insensitive.
- **Y38** (`generator.js:615-631`): the repaired link reaches the caller's object only in the write's `then`; the recap's own write is `mergeOwnedFields`; `handleLoreCommand` passes the cached state but nothing is set on it before a write lands.
- **Y39 for the un-renamed journal** (`index.js:8174-8198`): canonical-GM gated, text edits only (`hasProperty(changed, "text.content")`), linked journal only, module journals skipped; `!lore`'s "The Story So Far" page is created and updated without flags but holds no `<h2>`, so neither page hook parses it (`holdsTruths` false). The renamed-journal case is SECT-5 (Z16).
- **LORE-READS-QUICKSTART-PRINTOUT** (`generator.js:633-641`): the module journal's recap input is its page flag, printed through `formatTruthsAsHtml` then `htmlText`; a missing flag page falls back to `campaignState.worldTruths`.
- **Y28 sinks in my area**: `!at` (`index.js:6385`), `!sector list` / switch (`:6488`, `:6514`), `!clear-site`, the ◈ Site Discovered card, the custom-oracle cards, `!oracle`'s cards and usage line all escape names. The Sector Creator's progress and "Sector Created" cards (`sectorPanel.js:369`, `:435`, `:432-446`) print names unescaped, but only at creation, when every name is oracle-rolled — no reachable markup. The token drag's player line (`sectorSceneHooks.js:289`) embeds the settlement's name raw, as every forced-move line does (track labels, vow names — `progressTracks.js:296`, `cardActions.js:431`, `:885`): it is the player's narration line, not an informational card — left for a sweep (Not probed).
- **Custom oracles** (`customOracles.js`): the save writes a copy and registers only after it lands; remove likewise; the mirror re-syncs on every `updateSetting` / `createSetting` of campaignState on every client and unregisters tables no longer stored; a stored table colliding with a built-in is warned once; "Roll twice" rows in a custom table roll the table's own die. The panel roll's card carries `oracleMemory` (captured) but no `oracleNarration` (audit 10's noted UX inconsistency, unchanged).
- **The oracle memory capture** accepts any card's `oracleMemory` flag (`index.js:3529-3538`), so a player's hand-made card plants a "result"; the trust model treats a player client's content as the player's own speech (the relayed-sidecar comment, `narrator.js:4058-4063`; X49 bounded billing the GM's key, not player content) — not filed.
- **Token-drag hooks** (`sectorSceneHooks.js:163-212`, `:464-518`): the Set a Course drop fires on the dragging client only (preUpdate) and posts one line from it — a player's drag rolls their own PC; the off-pin position write runs on the canonical GM alone (`tokenPositionWriteApplies`); a programmatic sync carries `POSITION_SYNC_OPTION` and is skipped by both hooks; the flag stamp on a sidebar-dropped token is canonical-GM and marked. Two GMs: one drag, one dispatch; one write.
- **`!reveal-site` / `!clear-site` / the finish's reveal** (`siteDiscovery.js`): selection by the shared ladder with the location Actor's display name; the flag set on a copy after the Actor/scene awaits; the pipeline's reveal folds into the working copy (`movePipeline.js:986-994`) and notes a Retry step. The finish's sole-site guess for an unrelated label is SECT-D1 (D7).
- **Flow-audit soft spot (4)** ("Arrival inference degrades to freeText for unknown destinations", decisions.md 2026-07): a free-text arrival for a place that is no entity is decided — SECT-1 (Z14) is the case where the destination IS an entity the pipeline holds by id.
- **Truths parser / reconcile** for the un-renamed case: one-category saves read (W35); a custom truth reads as its first paragraph (known TRUTHS-CUSTOM-PARSE); newest save wins by `_stats.createdTime`; the Quickstart's linked journal is left alone at load.
- **Ship map / Battle Stations / Dice So Nice**: `!shipmap` GM-only, escapes the ship and scene names, finds the deck plan by `shipActorId`; deck pins read flags only; vision through `api-proxy.js`, art through `openRouterImage.js`; `!stations` is a static escaped card; Dice So Nice entries are display-only and fail open.
- **`oracleTableId`** card flag (`index.js:3392`, `customOracles.js:430`): read only by Quench (`quench.js:10709`) — a QUENCH-ONLY marker, no production consumer, no harm; not filed.

### Checked and not a bug — multiplayer

- **`gmRelay.js` since the tenth audit** — only the table grew and
  `refusePress` was added (`:389-414`); the queue, budgets, unqueued X-Card,
  `requestGmAction`'s no-GM warning and the receipt-time `isCanonicalGM()`
  check (`:479`) are as the tenth audit left them. `refusePress` is keyed by
  the dispatch's own ctx (a WeakMap), told once after the handler returns;
  every handler is reached only through `runGmAction` (grep of each handler
  name: no direct callers) and none copies ctx, so no refusal is recorded on
  a ctx nobody reads. The whisper escapes both names (`:396-414`).
- **The D1 / PACED-ROLL-OPEN-PRESS kinds** (`tda.attempt`,
  `expedition.finish`, `vow.swearRoll`, `paced.roll`, `whichFight.pick` →
  `applyCardRollerFollowup`, `cardActions.js:761-829`): "already pressed" is
  checked before ownership; the roller is the card's (`f.actorId`, or the
  vow's holder), the payload's `actorId` only when the card names none and
  then owned (`clickerActorId` sends only an owned PC, `index.js:8017-8032`);
  a pick must be one of the card's `fights`; claim before post, released on a
  failed post; `deferWhileBusy` on the forced move. A forged card (a
  player-authored message carrying the flags) only lets the presser roll
  their own PC's move — no more than typing it.
- **Batch Mode's eight kinds** (`batch/relay.js`): the entry is
  `ctx.requesterId`'s, never a payload user id (`batchRelay.test.js` pins
  it); Send now / Discard check `ctx.requesterIsGM`; every field is bounded
  (round id; text 1–2000 `cleanSubmissionText`; ids ≤64 `idOf`;
  `validateChoices` — offered abilities ≤24, an offered stat whose ability is
  checked, a target among the reading's options; `rereadEntry`'s `moveId`
  must be the reading's suggestion; `useOffer` needs the GM-set offer); the
  transitions are pure and idempotent (same submission, ready, passed,
  waiting, decided); a refusal is whispered (relayed) or toasted (local)
  (`tellRequester`); the `after` work (`startReading`, `advanceRound`) is not
  awaited, so no handler holds the relay queue across a Claude call or calls
  `requestGmAction` from inside it.
- **Batch Mode, GM-less / two GMs / non-canonical GM** — with no GM a
  relay returns `no-gm`, the window says it wasn't saved and keeps the draft
  (`roundWindow.js:424-461`); two GMs read each submission once and narrate
  once (`batchModeLifecycle.test.js`); a non-canonical GM's controls relay
  (`ctx.requesterIsGM`), and the switch is a world setting any GM writes and
  the canonical GM acts on (`onBatchModeSwitched`). A keyless canonical GM
  leaves submissions to a keyed one (`startReading`), which reads them on
  the registry's first write (`createSetting`, decisions "Batch Mode").
- **Batch Mode, a reconnecting player** — nothing needs re-sending: the
  round is a world setting the window re-reads (`registerRoundWindowHooks`
  reopens it at ready), the draft is a client setting flushed before a send
  and cleared only when the round shows the submission, and a submission
  lost in the GM's load window shows "not received" after 15 s with Send
  again — the same `submissionId`, a no-op if the first landed.
- **Y40** — `claudeApiKey`'s onChange catches a refused registry write with
  `warnKeyAdvertiseRefused` (`index.js:269-277`): console warn plus a toast
  naming the reload (v13 runs no onChange for an unchanged value — decided).
  The ready-time advertise warns too.
- **Y42** — `relayedClipPath` (`audio/index.js:593-598`) bounds both answers
  to `isCachePathFor` (`cache.js:100-104`: the world's exact slot, or an
  Assets Library URL ending in the clip's file); a forged path is "no
  answer" (the waiter keeps waiting, `:563-570`, `:618-625`), `null` is the
  GM's honest "no clip". The GM's own answers are `cacheLookup` / `write`
  paths, which pass (`audioDonePathBounded.test.js`).
- **D10** — `handleCacheWrite` returns before any filing on a GM holding an
  ElevenLabs key (`audio/index.js:444-448`); a keyless GM keeps D11's checks
  (narrator-card key, not cached, not in flight).
- **D9** — `injectTranscription` (`input/speechInput.js:308-345`) adds a
  transcript after a non-blank draft and does not submit; a blank box still
  auto-submits. Under Batch Mode the auto-submitted line is table talk and
  becomes the Round window's draft when that box is empty (decided).
- **Y43** — a PC-less player's `!ptp` is refused on the typist's client
  before the card (`index.js:3454-3497`); the GM-side `payThePrice.suffer`
  refusal stays console-only but no honest client reaches it.
- **Y06's relayed-refusal notes** (`safety/sessionDialogs.js:106-138`,
  `:275-294`, `:317-330`) post where the player's card is (whispered as a
  private flag's card was).
- **No new raw socket kinds** — `grep socket.emit / socket.on src/` shows
  only gmRelay, `errorLog.append` and the audio family (the tenth audit's
  set).
- **Logging** (`errorLog.js`, `apiTransactionLog.js`) — unchanged since the
  tenth audit; an honest relayed entry passes X53's `ENTRY_RE`.
- **Batch Mode cards and windows escape player text** — the round card
  (`narrator.js:1057-1067`, `roundEntryHtml`: name, move, outcome and the
  sanitised line escaped) and every other player's entry in the Round window
  (`roundWindow.js` `escapeHtml` on `t.text`, `t.actorName`, the GM view's
  readings).
- **`speaker.js`, `gmGate.js`, `commandRouting.js`, `sharedSupply.js`,
  `sharedLegacies.js`** — no change since `8fb7bfa`
  (`git diff 8fb7bfa 8a4ae3b` empty for them; no `runOn:` change in
  `index.js`); the tenth audit's checks stand.

### Checked and not a bug — ui

- **Round window escaping** (`src/ui/roundWindow.js:54-55` `escapeHtml` escapes `&<>"'`): every variable sink — header number/phase, banners, failure line, latest narration, own actor name/status/text/error, the card offer's text and move, the reading (move, stat, rationale, mischief, target prompt/labels/details, `data-move-id`), the upgrade (move, outcome, momentum, label, `data-card-id`), the Ready table (other players' names, lines, moves), the GM list (names, statuses, lines, errors, readings), Send now's label and `title` — is escaped; the shared ability form escapes through `settingsPanel.escapeAttr` (`:2432-2438`, `&<>"`), and `data-adds` is a Number.
- **Round window draft across re-renders** — the action box's value comes from `this.#draft`, updated on every `input` (`:210-219`), and `_replaceHTML` puts focus and the caret back (`:223-237`); the client setting is written after a 400 ms pause and on close (`#flushDraft`, `_onClose`), and `batchMode.draft` has no `onChange`, so a flush never re-renders the window (`driver.js:164-171`, `setRoundDraft` notifies only `fromOutside`).
- **Round window lifecycle** — closing flushes the draft, clears the pending timer and drops the singleton (`:239-244`); `close()` does not await `_onClose`, so its flush cannot re-render a closing window; a reload mid-round reopens it for a participant or GM (`:726-731`); Batch Mode off closes it on every client (`:708-712`); a round closed by End a Session / Discard / the mode off restores a submitted author's text as the draft only when the box is empty (`:696-703`). The window carries `sf-window` (compact layout) and its CSS adds 44 px target rows under `sf-touch` (`styles/starforged-companion.css:2726-2799`).
- **Repeat presses in the window** — Submit is guarded by `#busy` (released in `finally`, `:441-447`); a double Confirm is idempotent (`round.js:391` READY → unchanged), a double Edit / Withdraw re-withdraws a waiting entry (no-op, `:319`), a double Burn / Improve is the card's one claim (`relayCardButtonClick` + the GM's per-card claim; a re-render re-arms the button but the second press changes nothing, `batchModeTable.test.js`), a double Send now is one resolution (issue #340 test 25).
- **Batch Mode switch** — GM-only both in the toolbar (`companionToolbarTools.js:37`, `visible: !!isGM`) and in `toggleBatchMode` (`roundWindow.js:627-629`); on/off is a world-setting write any GM may make (the GM's own click, not a single-emitter write), refused writes say so (`:632-635`, `:665-668`); the pressed state is read from the world setting on every client and re-rendered by its `onChange` (`companionToolbar.js:307-311`); a player sees no switch, and the Round tool only with an entry in the round (`companionToolbar.js:91-97`). The mode-off dialog is `DialogV2.wait` with `rejectClose: false` (× / Escape = Cancel).
- **`keepTypedInput.js`** — fields are matched by `name`, a field missing from the new render is skipped, focus comes back to the field that had it; the Progress Tracks and Clocks add forms hold only text inputs and selects (no checkbox whose `.value` would be carried instead of `checked`), and no hook ever changes those forms' values, so a kept value never overwrites a fresher stored one; the Chronicle's inline edit keeps its text only when the user changed it (`_renderedText`), otherwise the stored text the render brings shows; the Chronicle panel has no free-text add field (Add Annotation is a button).
- **TRACK-ADD-REFUSED-LOSES-NAME fix** (`progressTracks.js:756-798`) — the name is cleared at the press, restored to the live form only when the add was not made and the box is still empty; the restore and the async re-render agree in either order (replaceKeepingInput reads the live form at replace time). A player's relayed add counts as made (its answer never comes back) — the docstring's deliberate limit (commit 4f88d78).
- **Clocks add** (`clocks.js:133-152`) — a thrown `createClock` keeps the typed name; the live field is cleared only after the write.
- **i18n `moveDisplayName`** (`i18n.js:177-181`) — the two scene-challenge variants get their titles; an id with no title is title-cased; the Round window labels moves and stats through it and `localizeStat`.
- **Help ↔ routes (mechanical)** — all 35 `CHAT_COMMAND_ROUTES` entries have a Chat Commands row (script over `src/index.js` and `PAGES`); `!roll`'s row says what it does in Batch Mode (`index.js:6245-6248`). README covers every route (`readmeCommandsCoverage.test.js`, Y46 — still checks the routes and gates as written); `helpRoleClaims.test.js` (Y47) now reads every page; `factionFlowStanceEdit.test.js` (Y48) checks the map against `ENTITY_EDIT_OPS` and `!journal faction`; `playkitPunchListStale.test.js` (Y49) pins each code fact beside the doc's claim.
- **Toolbar Buttons page** — the Round row (Everyone*, "to the players with a character in the round and to GMs") and the Batch Mode row (GM) match `companionToolbarTools`; the Batch Mode page's claims match the code: Just narrate / Roll ⟨move⟩ labels (`roundWindow.js:284-288`), others' entries shown once Ready (`roundView.js:179-190`), "Opting out is silent — not in the other players' windows" (the GM's "Waiting for" list is in issue #340's scope), the X-Card disabling Send now with the reason (`roundView.js:214-221`), the help's Safety and Troubleshooting Batch Mode entries.
- **Changelog / version** — latest tag v1.7.36 (`d137bd1`, local and `gh api …/tags`); `CONTENT_VERSION` 1.7.37 = the one unreleased `<h3>v1.7.37</h3>`; CHANGELOG `[Unreleased]` holds exactly the post-v1.7.36 work (Batch Mode, the pipeline split — `git log v1.7.36..8a4ae3b`), `[1.7.36] — 2026-11-05` was promoted; the tenth audit's fix codes are in `[1.7.36]` (READDEBILITIES-CUSTOM-COMMENT changes only the bridge's fallback, FINISH-SCENE-CLOCKID-DEAD is a refactor — no user-facing bullet needed; the Hoverbike's cost is in the VALUE-ADD-INTEGRITY bullet).
- **`docs/file-structure.md`** — every production module has a row (`fileStructureMirrorsTree.test.js`); the new rows (`batch/round.js`, `roundView.js`, `relay.js`, `driver.js`, `moves/movePipeline.js`, `ui/roundWindow.js`, `ui/keepTypedInput.js`, `entities/seedIntro.js`, the toolbar rows) describe their files' exports as written (identifiers checked by script).
- **Flow maps' Batch Mode sections** (`combat-flow.md:79-92`, `narrator-context-flow.md` round_resolution) — `rollMove` / `recordMove`, `{ refused: "track-gone" }` (`movePipeline.js:738`), `narrateRound`, `extras.roundCharacters`, `actingNames`, `buildRoundUserMessage`, `runRoundNarrationPasses`, `SPOTLIGHT_MODES` without `round_resolution` all exist as described.
- **`docs/scope-index.md`** — every row's badge matches its issue's state (all rows compared with `gh api …/issues?state=all`) except #293 (UI-8 (Z71)); #340 is closed-completed and ✅; "Latest release tag: v1.7.36" is right.
- **The Settings Reference's scope** — it documents the Configure Settings dialog and the 🛡 panel; the Batch Mode settings' placement is UI-6 (Z69), the other `config: false` settings it omits (`campaignState`, the keyed-GM registry, the toolbar / Private Channel window positions, `batchMode.round`) are internal state.
- **`lang/en.json`** is `{}` by decision (W84, `langStringsConsumed.test.js`); no `game.i18n` call reads a `STARFORGED.*` key; `module.json` unchanged since the tenth audit (paths exist, `socket: true`, compatibility untouched).
- **`chatHooks.js`** unchanged (both render-hook names, deduped by element).
- **Session panel** — ✦ Envision now hands `runIncitingIncident` a deep clone (`sessionPanel.js:239-241`, Y04) as `!incite` does.
- **Entities panel Promote (Y35)** — the record is re-read after the Notes write and the tier entry re-found by its text before the mark (`entityPanel.js:1323-1340`); an entry removed meanwhile is simply not marked.
- **The help's Hoverbike cost label** — the add is pre-checked with "— a weak hit counts as a miss" by decision ("A taken add's cost belongs to the roll … *Rejected:* leaving the add unchecked").

### Checked and not a bug — sweep

Family counts over the diff `8fb7bfa..8a4ae3b -- src` (82 files) and, where mechanical, the whole production tree (sites / clean / known / found elsewhere this audit / new here):

| Family | Sites | Clean | Known | Others' rows | New |
|---|---|---|---|---|---|
| 1 cached mutation before a refusable write | 31 added campaignState reads; 35 narrator / scene entry call sites traced to their object's provenance | every added read is a copy, a read-only use, or a merge onto the latest store; of the 35 entry sites all hand over a copy (`deepClone` / `workingCopy` / the pipeline's own detached object), or the cache to a callee that copies before it changes anything (`!lore` → `generateLoreRecap`, `!recap` → `getCampaignRecap`), but the three named at the right (`narrator.js:2181` and the two others found) | SUMMARY-PERSIST-CACHED (`narrator.js:2181`), PROMOTE-SUBJECTS-CACHED-MUTATE | NARR-1 (Z02)/PIPE-1 (Z02) (paced, `router.js:299`), NARR-2 (Z02) (inciting swear, `swearVow.js:285`) | 0 |
| 2 stale whole-object write after an await (same path) | whole tree, mechanical: 3 bind→await→set hits | 2 (`!at`, `!sector` — the awaits are in returning branches) | MIGRATE-STALE-WRITE (`migrator.js:81→159`) | — | 0 |
| 2b a second whole-object write inside one delivery (no I/O between) | 58 campaignState writers; the fire-and-forget ones (oracle capture, activity stamp, redirect clear, spotlight, sidecar persist) paired with what follows them | the redirect clear, spotlight and sidecar persists are followed by a server or Claude round trip | — | SESS-1 (Z01) (the stamp) | SWP-1 (Z17) (two pairs) |
| 3 `isGM` vs canonical | 25 added `isGM` lines | all (participants / views / UI checks; movePipeline's moved stage gates run on the canonical GM; `registerUnlistedEntityActors` is called from the `isCanonicalGM()` ready block `index.js:7273`) | — | — | 0 |
| 4 player path, GM-gated silent write | the Round window's 15 actions, the toolbar's two tools, `!roll` in Batch Mode | all relay or say why | — | UI-4 (Z33) (banner) | 0 |
| 5 relayed-payload trust | 52 `GM_ACTIONS` kinds (13 new) | every kind has a requester, no requester names an unknown kind (mechanical); the 8 `batch.*` handlers take the entry from `ctx.requesterId`, the GM controls from `ctx.requesterIsGM`, choices through `validateChoices`, text ≤ 2000, ids ≤ 64 | — | — | 0 |
| 6 guards, locks, dialogs | 3 lock claim/release pairs, 4 in-memory guards, 1 new `DialogV2.wait`, 6 hand-rolled promises | all release in `finally`; the dialog passes `rejectClose: false`; the vignette promise resolves in `finally`; the waits are bounded | — | PIPE-3 (Z19) (a refused release not retried), BATCH-2 (Z03) (rider prompt holds the pass) | 0 |
| 7 hooks on every client | 6 new registrations | driver `createSetting`/`updateSetting`/`userConnected` canonical-gated; Round window `updateSetting` local (LOCAL_ONLY); `rearmSwearOnGateRefusal` author-gated; `restoreLockOverCarriedBackClaim` claimant-gated; each LOCAL_ONLY handler's closure calls no imported writer (checked by hand — the test follows same-file calls only); `hookGates.test.js` + `campaignStateFields.test.js` pass at HEAD (12 tests) | — | — | 0 |
| 8 HTML sinks | ~45 added template lines with interpolation, 5 added `innerHTML`/`insertAdjacentHTML` | all escaped, numbers, or module constants | — | — | 0 |
| 9 identity by name | Batch Mode's entry names, `noteReadTrack`'s label ladder, `adoptUnlistedEntity*` | ladder is a fallback after the id; adopt-by-name+sector is Y34's decided get-or-create | — | — | SWP-2 (Z36) |
| 10 producers / consumers | 91 write-only flag keys (whole tree, mechanical), 3 new settings, 52 relay kinds, 2,516 function declarations, round fields | card markers and pre-existing data flags only; deadscan `--strict` clean; 0 dead internal functions; private members dead only as test seams | QUENCH-ONLY / TEST-ONLY as recorded | — | SWP-3 (Z37) |
| 11 attribution | 13 first-PC fallbacks | all pre-existing; the round credits `entry.actorId` (rollMove, finishMove) | CHRONICLE-FIRST-PC, AID-ALLY-UPGRADE | NARR-3 (Z09) (round capture) | 0 |
| 12 reload / reconnect | 28 new module-level mutables | the lock bookkeeping is the claimant's memory by design; `_swearAwaitingGate` re-arms a local button; `_refusedPresses` is a per-dispatch WeakMap | FORCED-MOVE-HOLD-RELOAD (sharpened below) | BATCH-6 (Z22)/8 | 0 |
| 15 document validity | 16 added `ChatMessage.create` | no `type: "other"`; every whisper an id array; no jQuery, v1 `Application`, v1 `Dialog`, `message.user` or raw `fetch` in the diff | — | — | 0 |

- **`hookGates.test.js`'s blind spots, checked by hand for the new code:** a gate anywhere in the closure counts (the new handlers put theirs first); same-file calls only (the LOCAL_ONLY handlers — Round window, Session / Entity / Progress Tracks panels, clocks, custom oracles — call only render / registry code); `userConnected` and settings `onChange` are not scanned (the new ones — `batchMode.enabled` → `onBatchModeSwitched`, `batchMode.round` → this client's listeners, the driver's `userConnected` — gate on `isCanonicalGM()` or touch only this client).
- **The move pipeline split (issue #340 Phase 0):** no function is defined in both `src/index.js` and `src/moves/movePipeline.js`; the 25 `HOST_HELPERS` are each passed by `configureMovePipeline` (it throws at load on a missing one); free-flow still claims the lock before any async work and releases it on the success path and again in `finally` (`index.js:982-1101`).
- **Batch Mode `roundClosed`:** written by `closeCardUpgrades` (`driver.js:835-849`), read by `resultUpgradeBlocker` (`burnMomentum.js:150`), which both upgrade handlers call (`burnMomentum.js:352/507`, `improveResult.js:199/286`).
- **Opting out is silent vs the GM's "Waiting for:" list** (`roundView.js:207-211`): documented — the help's "The GM's window shows every reading, the players the round still waits for" and the view's header; the decision's rejected list names an away status, a skip control, the card and the narrator, none of which this is.
- **The X-Card and a round:** the rolls go on and the narration is paused (`narrateRound` checks on entry and on the reply), as a free-flow move under the X-Card resolves and posts "Narration paused" — the same rule, not a gap.
- **Flow docs:** every camel-case identifier the flow maps name exists in `src/` except ones in their "removed" / "retired" notes (`buildConnectionsSummary`, `setAllyFlag`, `setSceneRelevant`, `clearAllSceneFlags`, `fcResolveSubject`, `oracleResultIds`) and faction-flow's historical v1.7.30 table (`addRumor` / `setProject`, deleted by #274 — the table records that cycle's state; pre-existing, left).
- **Tenth-audit sweep rows:** Y28 (names escaped at `index.js:6385`, `sufferExecutor.js:769/829`, `!sector` lists), Y33 (`incitingIncident.js:573-577` posts "Premise not saved"), Y44 (`thresholdTrackId` gone) — fixed at HEAD, no regression.
- **`!roll` in Batch Mode** (`index.js:6243-6249`): says why and sets nothing; a `!roll` set before the mode came on waits for the next free-flow line — the next undecorated input, as `!roll` promises.
- **`drainDeferredForcedMoves` re-running `onMessage` without `batchReleased`** (`index.js:1382`): a free-flow hold drained after the mode came on becomes a round entry — the mode's rule for a card's move.

### Checked and not a bug — rules

- **D2 — the scene-challenge moves against the vendored text**
  (`Starforged/Moves/Scene_Challenge/Face_Danger`, `…/Secure_an_Advantage`,
  `…/Finish_the_Scene`, `…/Begin_the_Scene`): Face Danger (SC) strong hit marks
  progress (twice on a match) and takes **no** momentum, weak hit marks progress
  and fills a segment with no suffer, miss fills one segment (two on a match)
  and Pays the Price; Secure an Advantage (SC) strong hit takes both (+2
  momentum, +1 next move) and marks progress only on a match, weak hit is the
  ordinary choice, miss as Face Danger's (`src/moves/resolver.js:700-730`). The
  price's clock advance skips the challenge's clock the move filled (one fill —
  `src/moves/movePipeline.js:1222-1227`, `src/clocks/payThePriceClocks.js:81-90`).
  The upgrade receipt (`src/moves/sceneChallenge.js:166-170`): miss → weak hit
  leaves the clock (+1 −1), miss with a match → weak hit rewinds one, miss →
  strong hit rewinds what the miss filled, a full clock filled nothing and
  rewinds nothing; a burn keeps the dice, so a match stays a match. Finish the
  Scene ends the challenge on every outcome, price on weak hit / miss
  (`resolver.js:732-745`). The variants are scanned as their twins
  (`assetMatchMove`); a variant with no challenge open is the ordinary move in
  `readMove` (free-flow reads right before the roll, under the lock — RULE-2 (Z39) is
  the round's gap only).
- **D3 — unprepared**: `isUnprepared` keys the redirect on the impact at any
  supply — the executor posts the "make a suffer move" picker excluding
  Sacrifice Resources (`src/moves/sufferExecutor.js:659-697`), an asset rider's
  supply loss posts the same picker and reports "redirected", never applied
  (`src/moves/consequenceRiders.js:209-246`, Y19), the "any" picker greys
  Sacrifice Resources (right: another move is the redirect — the enumerated
  cards are RULE-D1 (D1)); Resupply's "clear unprepared + 1 supply" clears the roller
  and every PC sharing the supply (`src/moves/sufferDialog.js:346-353` →
  `clearUnprepared`), then +1 supply mirrored by sharedSupply. Repair's trade is
  unavailable while unprepared — decided (REPAIR-TRADE-WHILE-UNPREPARED: "the
  trade exchanges supply"); the GM's handler refuses a relayed trade too
  (`src/moves/repair.js`).
- **Y15 / Y22 / VALUE-ADD-INTEGRITY — every vendored asset ability through
  `extractAdds`** (all 93 `starforged-assets`, each linked move plus a general
  match, stats {edge 2, heart 3, iron 1, shadow 2, wits 3}, own health 4,
  own integrity 3): Combat Bot gives Strike +1 and Clash 0 (Y15); Sidekick's
  Clash +1, Enter the Fray 0; Bonded's Set a Course home +heart (3); Glowcat's
  Secure an Advantage +its health (4) and Endure Stress +1; Sprite's +its
  health; the Hoverbike afterburner's +integrity (3) on a general match only;
  Tech's "add +wits instead of +integrity" is no add; Scavenger's / Stealth
  Tech's "on your next …" adds are not counted; "+cargo" / "add that amount"
  stay 0. No wrong structured offer found beyond those the tenth audit listed.
- **Y21**: no mortal-wound / desolation / vehicle-damage seed on any miss
  (`src/moves/resolver.js:1602-1609`); the at-0 choice card's roll is the one,
  carried by `oracleMemory`.
- **HOVERBIKE-WEAK-AS-MISS-UNAPPLIED**: applied after Take Decisive Action's
  downgrade, only on an action roll and only when the afterburner's box was
  taken (`resolver.js:1340-1350`, `weakHitAsMissSource` `:1425-1430`); a burn landing on a
  weak hit is no improvement, offered or pressed (`canBurnMomentum`
  `weakHitAsMiss`, `burnMomentum.js:258-262`, `:560`). A weak hit can never
  carry a match (matching dice are beaten both or neither), so no "miss with a
  match" is fabricated; a Batch Mode Send now uses the dialog's default checks
  (the add pre-checked, as the confirm dialog pre-checks it).
- **READDEBILITIES-CUSTOM-COMMENT / momentum bounds**: `IMPACT_KEYS` are the
  vendor's fifteen boolean `debility` ImpactFields (custom1 / custom2 included,
  the `custom*name` strings not); `momentumBounds` matches the vendor getters
  `momentumReset = clamp(resetValue − impacts, 0, max)` and `momentumMax =
  clamp(max − impacts, −6, 10)` (`vendor/…/actor/subtypes/character.ts:41-61`;
  `src/character/actorBridge.js:1236-1242`); `setDebility` re-clamps momentum
  on an impact (`:424-433`); the burn resets to `momentum.reset`.
- **Momentum burn eligibility**: never on a progress roll or a no-roll move
  (`buildBurnState`), positive momentum and a strict improvement only
  (`canBurnMomentum`), the momentum before the move's effects is the one
  burned (`burnableMomentum`, V04); the dice are kept, so the match stands.
- **D5 / SHIP-SEED-MISSION-REGION**: `refForRegion` maps the one regional ref
  (`starship_mission_terminus`) to the active region's table, through the
  whole directive chain; `!oracle`, the ship seed and the draft Confirm pass the
  region; no other roller reaches a regional ref (`shipEnvision` contact,
  `precursorSites`, `connection`, `faction`, `incitingIncident` roll other
  tables). Oracle tables and truths are unchanged since the tenth audit's
  strict comparison (`git diff 8fb7bfa..8a4ae3b -- src/oracles/tables
  src/truths/tables.js` is empty).
- **Batch Mode — each move by its own rules for its own roller**:
  `rollEntry` rolls with the entry's PC (`speakerActorId: entry.actorId`), a
  fresh working copy per entry, so Take a Break's single +1 is taken once and a
  roller's "+1 on your next move" is that roller's (`consumeNextMoveBonus`); a
  progress move's track is read at the roll (`enrichProgressTicks`), a fight or
  expedition another entry ended is refused and narrated as "not rolled"; Take
  Decisive Action's bad spot is read at the roll; a Pay the Price posts, routes
  and advances clocks per entry as in free-flow. An upgrade decided before the
  narration replaces the entry's `narrationInput` (`decideUpgrade`), so the
  round card and the narrator tell the burned / improved outcome
  (`narrationInputFrom(upgraded)`), and the round's riders (`finishMove` via
  `rolledFor`) fire for that final outcome. A resist card pressed while the
  round waits for its move's upgrade closes that upgrade (`choiceMade`), so a
  held resist roll can never outlive a burn that undid its harm.
- **A burned weak hit whose price stands is told its price**: the burned
  resolution carries no oracle seed (`buildBurnedResolution` `oracleSeeds:
  null`), but the price card's `oracleMemory` reaches the re-narration's
  RECENT ORACLE RESULTS ("The dice established these outcomes. Your narration
  must not contradict them") — probed on a table: the re-narration's system
  prompt holds `- Pay the Price: "Battle" → You are harmed`. Not filed.
- **Suffer moves vs vendored text** (Endure Harm / Stress, Withstand Damage,
  Companion Takes a Hit, Sacrifice Resources, Lose Momentum): the resolver's
  strong / weak / miss choices and their `requires` gates match
  (`resolver.js:914-1064`); `resistMiss` is set only on Endure Harm / Stress's
  own miss (`persistResolution.js:393-399`); harm / stress past 0 is momentum.

## Known items confirmed in passing (by area)

### Known items confirmed in passing — batch

- **CHRONICLE-FIRST-PC** (open): a round's Chronicle entry (`kind: "round"`) goes to
  `campaignState.characterIds[0]` / the first PC (`chronicleWriter.resolveActorId`), as free-flow's do.
- **XCARD-CHRONICLE** (open): `scheduleChronicleEntry` carries no `narrationId` for a round either, so an
  X-carded round's Chronicle beat stays.
- **FORCED-MOVE-HOLD-RELOAD** (open): `_heldForRound` / `_heldForFreeFlow` live in the canonical GM's
  memory like W02's queue — a reload, and also a canonical-GM handover, loses them with their cards
  claimed (BATCH-12 (Z29) is the no-reload variant).
- **MOVE-BUSY-NOTICE**'s note "in Batch Mode … a round drops no action" — contradicted by BATCH-1 (Z18),
  BATCH-5 (Z31) and BATCH-12 (Z29) (the item itself, free-flow's notice, still open).

### Known items confirmed in passing — pipeline

- **MOVE-BUSY-NOTICE** — unchanged; also reaches the Progress Tracks panel's progress roll and the token-drag Set a Course, which post forced moves without `deferWhileBusy` (`src/ui/progressTracks.js:301`, `src/sectors/sectorSceneHooks.js:296`): dropped at the lock with the notice on the canonical GM.
- **ERROR-TEXT-BLAMES-KEY** (the generic "Move interpretation failed. Check your API key" on any pipeline exception) — still the catch at `src/index.js:1089-1095`, shown on the canonical GM only.
- **CLARIFY-ON-GM** — unchanged in free-flow (PIPE-2 (refuted) is its round form).
- **LOCK-LOST-BY-COGM-STALE-WRITE**, **LOCK-RESURRECTED-DEPARTED-CLAIMANT** — the ready reset clears a stale lock without noting its claim as released (`src/index.js:7176-7183`), so a stale co-GM write carrying it back is not undone (the second item's case).
- **FORCED-MOVE-HOLD-RELOAD** — `_deferredForcedMoves` (free-flow) and the driver's `_heldForRound` / `_heldForFreeFlow` are all per-client memory.
- **RIDERS-IGNORE-UNCHECKED** — `interpretationForRoll` sets `appliedAbilityKeys`, but `applyMoveConsequenceRiders` still fires every extracted rider.
- **INDEX-EXTRACTION** — the pipeline's stages moved out (Phase 0); the cards and appliers they call stay in `src/index.js` behind `configureMovePipeline` (25 helpers).

### Known items confirmed in passing — cards

- **RECOMMIT-GONE-ROLLER-WORDING** — `applyRollerRecommit` still has no `not-a-pc` refusal (`src/moves/cardActions.js:1061-1067`).
- **MOVE-BUSY-NOTICE** — the Progress Tracks panel's Roll posts its forced move with no `deferWhileBusy` and no claim (`src/ui/progressTracks.js:292-302`): met by the move lock it is dropped with the notice on the GM's screen.
- **FORCED-MOVE-HOLD-RELOAD** — Batch Mode's own holds (`_heldForRound`, `_heldForFreeFlow`, `src/batch/driver.js:1006-1007`) are in memory too; a GM reload loses a held card move whose card stays claimed.
- **BOND-ITEM-NAME-STALE**, **DEEPEN-LINK-FALLBACK** (`findOpenConnection`, `src/index.js:4617-4624`) — unchanged.

### Known items confirmed in passing — upgrades

- **SUFFER-EXECUTOR-ASSET-SCHEMA** — the "any" pickers' Withstand Damage /
  Companion Takes a Hit buttons pass no item id (`src/moves/sufferDialog.js:64`,
  executors `:734-844`); the W16 / Y19 redirect pickers inherit it.
- **RIDERS-IGNORE-UNCHECKED** — `applyMoveConsequenceRiders`
  (`src/index.js:6605`) still filters nothing by `appliedAbilityKeys`, in
  Batch Mode's `finishMove` too.
- **PTP-PCLESS-CLOCKS-ADVANCE** — `handlePayThePriceCommand` relays the clock
  advance whatever `noPayer` says (`src/index.js:3503`).
- **PTP-ANY-ROUTE-PICKER-REFUSED-SILENT** — the "any" route's
  `postSufferChoiceCard` result is ignored (`src/index.js:6159-6168`).
- **TRIGGER-VIGNETTE-POST-WINDOW** — the still-full check precedes the
  vignette card's create (`src/clocks/payThePriceClocks.js:143-165`).
- **VOW-CLOCK-REWIND-PER-COPY**, **MOMENTUM-MIN-REDIRECT-MANUAL** (the
  overflow's "not taken — redirect it" is text only, `src/moves/sufferExecutor.js:185-192`)
  — present, not re-traced. **SCENE-CHALLENGE-ADD-ORPHAN-CLOCK** — not
  re-traced.

### Known items confirmed in passing — narration

- **SUMMARY-PERSIST-CACHED** — unchanged: `getRollingSessionSummary` sets `stored.sessionSummary = record` on the cached value before its write (`narrator.js:2077`); `refreshRollingSessionSummary` hands it the cache (`:2181`).
- **CHRONICLE-FIRST-PC** — unchanged (`chronicleWriter.js:263-271` `resolveActorId` → `characterIds[0]` / the first PC); a Batch Mode round's chronicle entry (kind `round`) lands in the first PC's chronicle too.
- **XCARD-CHRONICLE** — the round's `scheduleChronicleEntry` takes no `narrationId`, as every other path's.
- **XCARD-POST-RACE** — the round path has the same window (sidecar persisted, card not yet posted, `narrator.js:1009-1015`).
- **PTP-PCLESS-CLOCKS-ADVANCE** — unchanged: a no-payer `!ptp` still relays `payThePrice.advanceClocks` (`index.js:3503`), which can fire a trigger vignette.
- **The accepted no-baseline merge (issue #299)** — a round's narration and a trigger vignette fired by one of its entries' prices, both with a scene open, each overwrite the other's `sceneState` / `sceneFrame`; not refiled.
- **XCARD-LATE-REVIEW**, **SUMMARY-KEYLESS-GM**, **CHARACTER-STATE-ENTITY-UNDECODED** — as the brief lists; not refiled.

### Known items confirmed in passing — continuity

- **XCARD-LATE-REVIEW** — still open: `runConsistencyCheck` posts the ◈ Narrative Review card with no `isNarrationXCarded` check after its Haiku call (`src/factContinuity/consistencyCheck.js:110-138`).
- **XCARD-STRIKE-ENDSCENE-RACE** — still open: `endScene` runs `rememberSessionRetractions` on its copy after its migration awaits and persists `sessionRetractions` through `mergeOwnedFields` (`src/factContinuity/sceneLifecycle.js:175`, `:200-203`).
- **END-SESSION-STALE-ENDSCENE** — still open: End a Session hands its deep clone, taken before its awaits, to `endScene` (`src/safety/sessionLifecycleDialogs.js:580`, `:620-623`).
- **XCARD-CHRONICLE** — still open, and a round's narration schedules one too (`narrator.js:1017`).
- **XCARD-INCITING-PREMISE**, **XCARD-POST-RACE** — unchanged.
- **CLARIFY-ON-GM** — still open (`src/moves/movePipeline.js:1252-1256`); CONT-5 (refuted) is its Batch Mode instance.
- **PROMOTE-SUBJECTS-CACHED-MUTATE** — still open: `promoteNewEntityLedgerSubjects` promotes on the cached `latest` before writing it (`entityExtractor.js:1004-1007`).
- **BOND-ITEM-NAME-STALE** — `revertNarrationRenames` goes through `updateConnection({ name })` as the rename did, so the bond Item keeps whichever name it had.
- **RETRACTION-POSSESSIVE**, **LORE-JOURNAL-BY-NAME**, **SCENE-CAPTURE-KEYLESS**, **STRIKE-CHRONICLE** — not re-examined beyond the paths above; unchanged.

### Known items confirmed in passing — entities

- **CHRONICLE-FIRST-PC** — `chronicleWriter.resolveActorId` (`:262-270`) still picks the first PC; Batch Mode's `kind: "round"` entry (`narrator.js:1017`) goes there too.
- **XCARD-CHRONICLE** — `scheduleChronicleEntry` still carries no `narrationId` and checks no X-Card.
- **REGENERATE-PORTRAIT-ORPHAN** — `regeneratePortrait` (`generator.js:119-163`) still has no host-gone check.
- **CHARACTER-STATE-ENTITY-UNDECODED** — `actorBridge.stripHtml` (`:187-189`) decodes nothing.
- **DRAFT-CONFIRM-TWO-GMS** — the Confirm's in-flight guard is per client (`entityExtractor.js:1838-1849`).
- **PROMOTE-SUBJECTS-CACHED-MUTATE** — `promoteNewEntityLedgerSubjects` promotes on the cached `latest` before writing it.
- **MIGRATE-STALE-WRITE** — `runMigration` still writes its pre-await snapshot whole (only the three lock fields now come from the store, `migrator.js:151-169`); `handleDraftDismiss` mutates the cached state before its write (the U58 note in that group).
- **FINALISE-PLAYER-KEY**, **BOND-ITEM-NAME-STALE**, **DEEPEN-LINK-FALLBACK** — unchanged.
- **QUENCH-ONLY-HELPERS** — deadscan still lists `isIronswornAvailable` / `listCanonicalEncounters`; `sufferDamage` is the deliberate UNWIRED export.
- The momentum recalc's `hasPlayerOwner` gate (`index.js:2151`) — the tenth audit's sharpened note, unchanged.
- **Other auditors' overlaps, seen while checking**: cards **CARD-1 (Z55)** is ENT-3 (Z55) (keep one); cards **CARD-4 (Z57)** (a forged bond is never written to the bond Item's `completed`) and narration **NARR-3 (Z09)** (a round's capture credits its first entry's PC, so a second Make a Connection's NPC is bonded to the wrong player) are in this area's flows and not refiled here.

### Known items confirmed in passing — session

- **END-SESSION-STALE-ENDSCENE** — still open: `endSessionOnce` runs `endScene(state)` on the copy taken before its awaits (`sessionLifecycleDialogs.js:580`, `:622`).
- **XCARD-STRIKE-ENDSCENE-RACE** — its instance of the above, unchanged.
- **SAFETY-001** (residual) — a player's Private Lines reach `campaignState` only once their client and a GM have been online together; unchanged.
- **TRIGGER-VIGNETTE-POST-WINDOW** — the post's own round trip is still unguarded (`payThePriceClocks.js:149-165` posts, then nothing re-checks).
- **MOVE-BUSY-NOTICE** — the inciting ⚔ at the move lock in free-flow still drops with the notice on the GM's screen only; Batch Mode is exempt by its note.
- **FORCED-MOVE-HOLD-RELOAD** — `_deferredForcedMoves` is memory-only (`src/index.js:1232-1257`); a reload loses the X14 hold.
- **SESSION-MINT-RACE** — the load-time mint and a Begin landing during its summary call can still both mint.
- **SUMMARY-PERSIST-CACHED**, **XCARD-INCITING-PREMISE**, **PTP-PCLESS-CLOCKS-ADVANCE** (a refused `!ptp` still relays the clock advance), **SCENE-CHALLENGE-ADD-ORPHAN-CLOCK**, **VOW-CLOCK-REWIND-PER-COPY** — seen in passing, unchanged.
- The "No ack channel" limitation (known-issues ~1370) — a relayed End / Begin / Flag sent while the GM's client loads is dropped; unchanged.

### Known items confirmed in passing — sectors

- **AT-PARTIAL-NAME-SHIP** — still open: `!at` re-infers the ship position from the typed `arg` (`index.js:6379`), not `match.id` (SECT-3 (Z15) adds the namesake case it does not cover).
- **TOKEN-ANCHOR-GENERATOR-IDS** — still open: `placeCommandVehicleTokenIfPresent` matches `position.nearestSettlementId` against generator ids (`sceneBuilder.js:453-456`), and since Y14 it also ignores `nearestLocationId` (the new map's token is created with `POSITION_SYNC_OPTION`, so nothing is recorded — same known row).
- **SECTOR-CREATE-PARTIAL**, **SECTOR-DUPLICATE-NAMES**, **CUSTOM-ORACLE-TO-RANGES**, **LORE-JOURNAL-BY-NAME** (`generator.js:742-751`), **TRUTHS-CUSTOM-PARSE**, **CAMPAIGN-TRUTHS-UNWIRED** (`campaignTruths.js:56-58`, the UNWIRED marker), **SHIP-INTEGRITY-API-UNWIRED** — seen, unchanged.

### Known items confirmed in passing — multiplayer

- **AUDIO-FORGE-ORIGIN-SHARED**, **AUDIO-FORGE-ANY-WORLD** — `isCachePathFor`
  as documented (`cache.js:74-104`).
- **KEYS-NOT-CLEARABLE** — Y40's "cleared key" branch is still reachable
  only from the console.
- **SAFETY-001** (residual) — Private Lines reach `campaignState` only once
  a player and a GM were online together; the `gmRelay.ready` pull is the
  canonical GM's only (`announceGmRelayReady`).
- **AUDIO-KEYED-NONCANONICAL-DUP** — and its D10 consequence the D10 test
  header records: at a keyed GM's table a keyed non-canonical client's clip
  is never filed, so its replays synthesise again until the GM plays the
  card.
- **RECOMMIT-GONE-ROLLER-WORDING** — `applyRollerRecommit`
  (`cardActions.js:1061-1067`) still words a deleted roller "names no
  character of yours" (and checks ownership before "already taken").
- **FORCED-MOVE-HOLD-RELOAD** — Batch Mode adds two more in-memory holds on
  the canonical GM (`_heldForRound`, `_heldForFreeFlow`, `driver.js`
  `holdForNextRound` / `takeForcedMove`): a reload or a handover drops the
  held card move while its card stays claimed — the same family.
- **PTP-PCLESS-CLOCKS-ADVANCE** — the refused `!ptp` still relays
  `payThePrice.advanceClocks` (`index.js:3503-3504`).
- **No ack channel**, **Relay requester ids are client-asserted** — as
  recorded; Batch Mode's window answers the former for submissions only.
- **PRIVATE-WINDOW-SESSION-CHANGE** — not re-examined beyond MP-2 (Z66)'s code.

### Known items confirmed in passing — ui

- **KEYS-NOT-CLEARABLE** — still open: `#onSaveApiKeys` writes a key only when its field is non-empty (`settingsPanel.js:2026-2040`), so a key cannot be cleared from the About tab.
- **COVERAGE-001** — listed open (known-issues "COVERAGE-001 — Function coverage below the historical 65% threshold"); not re-measured (the whole suite is not run in this audit).
- **FINALISE-PLAYER-KEY / CLARIFY-ON-GM / SESSION-MINT-RACE / XCARD-*** — the tenth audit's ui list; nothing in the 54 commits touched those paths in my files.
- **The Configure Settings table's two `config: false` key rows** and the inert `packs/help/` LevelDB skeleton (tenth-audit ui notes) — unchanged.
- **Relayed Progress Tracks edits are fire-and-forget** — a player's add/mark the canonical GM refuses (`refusedEdit`, `progressTracks.js:1297-1300`) or whose journal write throws is logged on the GM's console only; `#requestEdit`'s docstring and commit 4f88d78 record it as the relay's limit ("a relayed edit's answer never comes back"). `docs/flows/combat-flow.md:463-466` says "a refusal or a write that throws is reported, never swallowed" — true for the canonical GM's own click. Not refiled.

### Known items confirmed in passing — sweep

- **FORCED-MOVE-HOLD-RELOAD** — sharpened again: Batch Mode adds two more holds in the canonical GM's memory, `_heldForRound` and `_heldForFreeFlow` (`src/batch/driver.js:1006-1007`), filled by `holdForNextRound` (whose whisper says the move "joins the next round") and drained only on the GM that filled them; a reload, or a keyed GM joining and becoming canonical, strands them while the card's button reads taken.
- **SUMMARY-PERSIST-CACHED** — still open: `refreshRollingSessionSummary` hands `getRollingSessionSummary` the cached value (`src/narration/narrator.js:2181`).
- **CHRONICLE-FIRST-PC / XCARD-CHRONICLE** — a round's one Chronicle entry (`narrator.js:1017`) goes to the first PC (`chronicleWriter.js:263-271`) and carries no `narrationId`, as every other narration's does.
- **MIGRATE-STALE-WRITE** — unchanged (`migrator.js:81→159`, 5 awaits).
- **QUENCH-ONLY-HELPERS / TEST-ONLY** — deadscan as recorded (3 QUENCH-ONLY, 2 TEST-ONLY).

### Known items confirmed in passing — rules

- **SUFFER-EXECUTOR-ASSET-SCHEMA** — also reached by Pay the Price's "Your
  vehicle suffers damage" route: `dispatchPayThePriceSufferRoute` passes no
  item id to `withstandDamage`, which posts "Vehicle not found (id null)"
  (`src/index.js:6172-6193`); the companion route reads `system.condition` /
  `system.health` (0 → 0). RULE-5 (Z53) is the move roll's own vehicle, a separate
  path.
- **RIDERS-IGNORE-UNCHECKED** — the costs and benefits that come with a taken
  add (Kinetic's "Lose Momentum (-2)", Service Pod's "Careful: … Lose Momentum
  (-1)", the Hoverbike afterburner's "+2 momentum on a strong hit") reach the
  roll only as Haiku-extracted riders, which fire checked or not.
- **TDA-COST-DOUBLE-ROLL** — `buildOracleSeeds` still seeds a Take Decisive
  Action weak hit's cost (`resolver.js:1594-1600`) while the card rolls its own.
- **FRAY-SOLE-FIGHT-FALLBACK**'s shape in `selectSceneChallengeTrack`
  (`sceneChallenge.js:43-55`): a variant naming a finished challenge while
  another is open scores the sole open one.
- **FORCED-MOVE-HOLD-RELOAD** — Batch Mode's `_heldForRound` /
  `_heldForFreeFlow` (`src/batch/driver.js:1006-1007`) are per-client lists of
  the same shape: a canonical-GM reload drops a card move held for the next
  round, its card claimed.
- **AID-ALLY-UPGRADE**, **MOMENTUM-MIN-REDIRECT-MANUAL**,
  **TEST-RELATIONSHIP-DEVELOP-ROLL** — unchanged at HEAD.

## Not probed (by area)

### Not probed — batch

- **Two live GMs both finishing one round** (gm-1 reloads while gm-2 narrates and rejoins before gm-2's
  close): both reach `finishRound` → riders twice — BATCH-15 (Z20)'s second trigger; a narrow race, traced only
  (`driver.js:923-926`, `:963-980`).
- **A reading in flight on a GM that stops being canonical** (keyed GM joins): the new GM restarts it
  (`recoverRound` → `startReading`), two Claude readings run; the old GM's `recordReading` still writes
  (`queueRoundWrite` has no canonical check) — `readingMayLand` keeps the same submission idempotent; a
  cross-entry clobber needs a lagging cache. Traced only.
- **A card move offered beside a READY entry** is silently dropped (card claimed) when the round resolves
  before the player answers "Use the card's move / Keep mine" — whether a pending offer should hold
  readiness is a design question.
- **The resist roll at 0 health** (`sufferDialog.js` "resist" — a mandatory Endure Harm / Stress roll)
  becomes a round entry or an offer that "Keep mine" discards — a rules question (possible decision row).
- **A PC renamed mid-round:** entries keep `actorName` from the round's open; PARTY filters by name
  (`narrator.js:4407-4409`, `actingNames.includes(m.name)`), so a renamed acting PC would drop out of
  PARTY and the entry headers keep the old name — identity by mutable name, rare.
- **A GM assigned another player's PC** gets an entry for the same actor as that player
  (`participantsFrom` doesn't dedupe by actor) — one PC acts twice; rare.
- **"Send again"** after the round moved on re-sends the stale `roundId` and is refused ("That round has
  ended"); Submit works — cosmetic.
- **Value adds read at reading time** (an "add +integrity" ability) are not re-read at roll time, so an
  earlier entry of the same round changing the vehicle's integrity is missed — edge.
- **Live Foundry:** whether a world setting's `onChange` fires on its first `createSetting`
  (`batchMode.enabled` / `batchMode.round`) — the harness fires it; not verifiable offline (Foundry).
- **Typed chat from a GM or a player with no PC** while the mode is on is told "Write your action in your
  Round window — it has this line as a draft" though they have no action box — cosmetic.

### Not probed — pipeline

- **A round entry whose PC is deleted before the round resolves rolls as the first PC.** `rollMove` re-resolves the roller (`rollerFor`, `src/moves/movePipeline.js:148-152`) and falls back to `getPlayerActors()[0]`; `persistResolution` does the same (`:79-81`). A participant's PC deleted between Submit and resolution would have Kira's action rolled with another PC's stats and credited to them (decisions.md D8: a PC-less player is not rolled as another's). Rare (a GM deleting a PC mid-round); traced only — the batch auditor probed it as BATCH-4 (Z35) ROUND-ENTRY-PC-GONE-FIRST-PC. Fix: rollMove refuses when a `speakerActorId` is given but no longer resolves.
- **A free-flow claim refused while a paced narration's copy is in flight**: the claim sets the lock on the cache in place; a concurrent `persistSceneLedgerFields(preState)` whose `latest === campaignState` writes `{ ...cache }` carrying the claim the pipeline then undoes locally — the world would hold a lock no pipeline runs (no claimant remembers it). Needs PIPE-1 (Z02)'s cache sharing and a refused claim at once; not probed. PIPE-1 (Z02)'s fix (a working copy for the pacing path) removes the overlap.
- **A `!roll` set before Batch Mode is switched on** stays pending through the mode (readings ignore it, a non-participant's forced move bypasses pacing) and forces the first free-flow line after the mode is switched off. Edge; not filed.
- **Batch `acceptRoundUpgrade` when its round write is refused** returns true (the upgrade's narration skipped, the round never told the upgraded outcome) — `src/batch/driver.js:900-905`; left to the batch area.

### Not probed — cards

- `applyMilestonePick` (`src/moves/milestonePicker.js:128-139`): a vow deleted since the picker posted is claimed before the `no-vow` check, so the press closes the picker for its *other* vows with only a console line — the completed-vow path just above keeps it open ("resolved only once every vow it offers is fulfilled or gone"). And a card actor deleted since falls back to the first PC (`:94-96`, `?? getPlayerActors()[0]`), so a player's press is refused naming the wrong PC (Y20's shape; no wrong vow can be marked — the vow id must be on that PC). Rare; low.
- `applyReachMilestone` returns `"pick"` even when `postMilestonePickerCard`'s post fails (`src/index.js:5775-5779`, `:5809-5811` swallow it), so the won-fight ⚑ that falls to the picker records `milestone:<card id>` and stamps itself applied with nothing marked — needs a renamed vow and a refused card post together.
- A written-your-own reward is always form `gear` (`src/session/swearVow.js:597-598`) while the card promises "the narrator will work it in" and the 2026-06-29 decision has the narrator map it to a form ("defaulted pending revisit") — a "+2 supply" written by the player is granted as a gear record. Older than the tenth audit; not filed.
- The player-vow card's ⚔ Swear it (roll) is not closed by a swear typed in chat, or by the vow's fulfilment (`applyPlayerVowSwearFromRelay` checks only that the vow is held), so a late press rolls a second swear (momentum, oath scene). Not probed.
- Batch Mode + the inciting card's ⚔ before a session: the forced swear is held for the next round (`takeForcedMove` → `holdForNextRound`), but the presser's button waits for a session-gate notice that never comes in Batch Mode (`swearVow.js` `awaitSessionGate` / `rearmSwearOnGateRefusal`) and stays disabled until a reload — cosmetic; the move is not lost.
- `applyPlayerVowLinkFromRelay` returns `no-such-connection` silently when the connection was renamed since the card listed it (`src/session/swearVow.js:1025`) — the button re-arms after 15 s with no word.

### Not probed — upgrades

- **Symbiote's "+its health" on an Endure Stress** — its Endure Stress link
  is a cost mention ("you must Endure Stress"), so the structured pass never
  keys it, but a Haiku-fallback match would be offered the general clause's
  "+its health" (3) pre-checked, though that add is for "aggressive moves"
  (`addFor`'s `!(c.from && ownTrigger)` — `ownTrigger` excludes cost
  mentions). Depends on a Haiku decision; `src/moves/abilityScanner.js:585-604`.
- **The milestone suggestion and the variants** — `MOVES` files the variants
  under `scene_challenge`, which `MILESTONE_SUGGEST_CATEGORIES`
  (`src/moves/milestone.js:42`) omits, so a Face Danger (Scene Challenge) hit
  offers no ⚑ Reach a Milestone where an ordinary Face Danger hit does. A
  deliberately loose proxy — a design call for the cards area.
- **A refused `keepPriceCard` write** leaves the kept card unstamped, so its
  press is refused as superseded (best effort by design; rare).
- **A refused Keep stamp** (`closeCardUpgrades`) leaves a live 🔥 whose burn
  applies after the round recorded Keep; `acceptRoundUpgrade` then keeps the
  round's narration of the kept result (rare; `src/batch/driver.js:835-849, :890-908`).
- **Stale hints** — a resist card posted with the Y18 hint keeps it after a
  round's Keep closes the upgrade (the card is not re-rendered); cosmetic.
- **The round's progress view** shows the rolled outcome after an upgrade
  (`src/batch/roundView.js:226-237` reads `rolled.outcome`, not the upgraded
  `narrationInput`) — cosmetic, the batch area's.
- **Hoverbike ability 2** ("burn momentum … roll your action die; on a 5 or 6,
  do not reset momentum") is text only — not implemented, not a regression.

### Not probed — narration

- **A Batch Mode round's names are captured when the round opens** (`participantsFrom` → `actorName`): a PC renamed mid-round is THIS ROUND's old name beside a CHARACTER block with the new one, and the PARTY filter (`actingNames.includes(m.name)`) drops them — identity by mutable name (rules/reachability.md), rare; not probed.
- **`getActiveCharacter(campaignState, e.actorId)` in `narrateRound`** falls back to the first PC when an entry's actor was deleted mid-round — a CHARACTER block for a PC who did not act; needs a deletion inside the round's resolution window.
- **A round whose model reply is sidecar-only** (`!narration?.trim()` → `break` → the fallback card, `narrator.js:1012`): the sidecar was already applied under a `narrationId` no card carries, so an X-Card cannot remove those facts — the same shape as `narrateResolution`'s empty-prose fallback; model-dependent.
- **Doc nits, not filed:** `docs/flows/narrator-consistency-flow.md` §1 says `runConsistencyCheck` receives `playerNarration` (the call passes `{ matchedEntityIds, currentLocationId }`, `narrator.js:4019-4022`) and counts "all nine narrator paths" (ten with `round_resolution`); the narrator-context flow's "The flag family covers every fiction card (2026-07)" list omits the round card and the published reflection (both are listed elsewhere in the doc).
- **The paced narration's spotlight write** (`maybeAdvanceSpotlight`): at a 2+-PC table the fire-and-forget `{ ...stored, spotlight }` write lands during the Claude call and detaches the cached object, so NARR-1 (Z02)'s sidecar half then needs a second refused write; the probe refuses all of the GM's writes (Y04's premise).

### Not probed — continuity

- **Promote racing the X-Card's finish.** The relayed Promote appends the detail to the Notes tab, then re-reads the record (Y35) and marks the entry (`src/ui/entityPanel.js:1328-1342`). Both run on the canonical GM (the X-Card unqueued): if the X-Card's `retractNarrationCapture` drops the not-yet-promoted entry inside the Notes write's round trip, the re-read finds no entry (`at = -1`) and the paragraph from the removed narration stays on the Notes tab. Fix: after the re-read, take the appended paragraph off when the entry is gone. Sub-second; not probed.
- **A capture write in flight past the X-Card's finish.** An auto-created connection's `Actor.create`, a rename's update or a tier write already sent when the finish iterates the documents lands after it and is never undone (the writers' "the stamp above deletes it" comments rely on the finish running after the write). Sub-second; the XCARD-POST-RACE shape.
- **The lagging cache beyond the activity stamp.** CONT-1 (Z01)'s root reaches any campaignState writer built on the canonical GM while its pause write is in flight (a relay handler, a narration's persist), and a co-GM's correction-dialog persist (`persistSceneLedgerFields` writes `{ ...latest }` from that GM's cache) the same way — only the stamp is triggered by the X-Card itself.
- **Session Log read-modify-writes.** `appendSessionLogBeat` and `undoNarrationEntries`' beat removal read and rewrite the page flag with no queue (`src/world/worldJournal.js:835-883`, `:953-960`): two captures, or a capture and the X-Card, interleaving lose one write. Journal-only (no narrator reader); not probed.
- **CONT-6 (Z09)'s no-Make-a-Connection facet** (the draft card's `actorId` is the round's first entry's PC) — traced; the round capture's 2 s detection timer needs fake timers on the table harness.
- **`NARRATION_HISTORY` overflow** (the tenth audit's not-probed lead, `worldJournal.js:66-84`) — not re-examined.
- **Doc nit:** `docs/flows/narrator-consistency-flow.md` §1 names a `playerNarration` option `runConsistencyCheck` neither takes nor is passed (`narrator.js:4019-4025`) — not filed.

### Not probed — entities

- **D4 and the fallback bullet list**: the no-key introductions (`buildConnectionDetailsHtml`, `buildStarshipNotesHtml`) are a marked `<ul>`; in ProseMirror, Enter after the last bullet adds an `<li>` inside it (prosemirror-schema-list `splitListItem`), so a bullet the GM adds there is the seed's to the next ↻ Regenerate (erased) and to the X-Card's `sheetWrittenByTable` (not a "use") — the wrapper D4 rejected for a div. Foundry-editor behaviour, keyless tables only; `writeSeedIntro` on that HTML would show it.
- **`shipAlreadySeeded` misreads a confirmed NPC ship** (`finalize.js:129-132`, `:162`): a draft-confirmed ship has a rolled identity from the Confirm and is skipped by the starship Auto-Seed (`starshipHasSeedDetail`); if the GM types into its Notes before ✦ Finalise, the Finalise only stamps it — no introduction, modules or portrait, though D4 says a ship the Auto-Seed did not populate is seeded. Recoverable with ↻ Regenerate.
- **The Entities panel does not follow a sheet Notes edit** (`entityPanel.js:1210-1219` re-renders on a record flag, the name or a debility) while its detail view shows the sheet's Notes since X12 — cosmetic, local.
- **A Dismiss after a refused Confirm**: the next load lists the orphan anyway (`registerUnlistedEntityActors` never consults `dismissedEntities`), so a faction or NPC the GM dismissed goes live. Rare; not driven.
- **`sheetWrittenByTable`** (`connection.js:438-447`) counts the Notes and Characteristics only: a GM's sidebar rename or Pronouns fix of an auto-created card is not a "use", so the X-Card deletes the card (D6(ii)'s narrowed rule — a decision question at most).
- **`moveRecordNotesToSheets`** writes `{ ...data, notes: "" }` from the record read before its Notes await (`migrator.js:921-933`) — the X32 shape, at ready on the canonical GM, with no concurrent writer in practice.
- ENT-2 (Z54)'s Forsake Your Vow site (`movePipeline.js:1180-1185`) is traced, not probed (driving a forsake needs the interpreter through the pipeline).

### Not probed — session

- **End a Session during a round's resolution, then a resolver handover.** `recoverRound` closes a *resolving* round of an ended session without narrating it (`driver.js:1167-1169`): its rolled and recorded entries are never narrated, `finishMove` never runs for them and their cards' Burn / Improve are not `roundClosed`. The help's Batch Mode page says "A round already resolving finishes first" — true on the resolving GM's own client, not after it leaves or reloads. Needs End + the resolver going within one narration; not probed here — the batch auditor's `tests/probes/batch/sessionEndedResolvingRoundDropped.probe.js` covers it.
- **`_beginChain` / `_endChain` / `serialiseClockWrite` are unbounded** (`sessionLifecycleDialogs.js:153`, `:536`; `clocks.js:757-761`): a step that never settles (a document write whose answer never comes after a socket drop) wedges every later Begin / End / clock write on that client until a reload — the relay queue's run budget cannot pass it, since the next handler awaits the chain. `_sceneStartTail` has a 10 s bound (Y05); these do not. Not probed (no realistic offline fault short of a hung write).
- **The second clock of one price.** `advanceClocksOnPayThePrice` narrates triggered clocks one after another and marks each "in flight" only when its own call starts (`payThePriceClocks.js:134-170`): a burn that rewinds the second of two clocks one price triggered, while the first's vignette is being written, finds `triggerVignetteInFlight(B)` false and strikes an earlier trigger vignette of B this session (`resultUpgrade.js:440-457`) — the case TRIGGER-VIGNETTE-LATE-POST's guard exists for, for the first clock only. Needs two triggered clocks and a reset-and-refilled second; not probed.
- **A claimed card's forced move that joined a collecting round when End a Session closes it.** The entry's text goes back as a draft, but its forced identity (`readAs.forced`: target ids, `incitingSwearMessageId`, `swearToConnection`, a token drag's course) is lost and the card's claim stands, so the move is never rolled as pressed — the shape X14 / W02 hold in free-flow ("held, not dropped"). Not probed (the cards auditor's `tests/probes/cards/batchOfferDroppedCardClaimed.probe.js` is the sibling case: an offer the round's resolution outran).
- **A co-GM of lower id joining during End a Session's summary call** becomes canonical and mints the next session at her load while the first GM's End is still running; that End then writes the Session Log from `game.settings.get` (`sessionLifecycleDialogs.js:639`) — the new session's id and number. Not probed (two-GM timing).
- **The SESS-1 (Z01) lag class at other canonical-GM writers.** `captureOracleResult` (`src/index.js:3543-3559`) writes `{ ...cached, recentOracles }` on a player's oracle card; a relayed handler of the same player emitted before the card (none found in this area besides `!ptp`, SESS-6 (Z17)) would be undone the same way. The systemic fix for SESS-1 (Z01) / SESS-6 (Z17) is one per-client write chain for every whole-object campaignState writer on the canonical GM.
- **Session panel for an idle-but-open session** (audit10's lead): Begin stays disabled ("Session already active") while `!begin-session` would mint; End-then-Begin works. Unchanged, not refiled.

### Not probed — sectors

- **Forced-move narration lines embed document names raw** (the token drag's "I set a course for ${name}." `sectorSceneHooks.js:289`, the panel's progress-roll lines, the Which-vow / Finish-expedition reposts in `cardActions.js`): rendered as chat HTML on every client. A sweep question (are these "card sinks" under the Y28 decision?) across files outside this area.
- **Batch Mode and the token drag**: a GM's drag-onto-pin line has no speaker, so `takeForcedMove` resolves the GM's first owned PC and may offer it to that player's round entry (`batch/driver.js:1046-1065`, `takeForcedMove`) — for the batch / multiplayer auditors.
- **`!lore` on a keyless co-GM** is `RUN_ON.AUTHOR` (`index.js:629`), not `RUN_ON.CLAUDE`, so it warns "Claude API key required" though the canonical GM holds one — a routing inconsistency with the decision's ladder; UX, said where asked; not filed.
- **A nudge of the token on its current pin** (within the snap radius) rolls a Set a Course to the place the ship already is (`sectorSceneHooks.js:206-211`); the confirm dialog can cancel it. Long-standing UX.
- **A site revealed while the token already sits near its pin**: the token's record stays "deep space" until the token moves (the token→record direction fires on token movement only). Edge.
- **A site Actor visible to players** (a world whose default Actor ownership is Observer): double-clicking the "Unexplored Site" pin opens the site's sheet — name and interior prep (`sectorSceneHooks.js:123-145`). Depends on world configuration; Foundry-only.
- Foundry-only: whether v13's token movement API still honours `preUpdateToken` returning `false` for a drag (Quench covers it).

### Not probed — multiplayer

- **(Foundry) A GM-authored re-post of a player's raw line.** Since
  PACED-ROLL-OPEN-PRESS the paced Roll posts `f.playerText` (and the
  which-fight pick `f.narration`) as the forced move's `content` from the
  canonical GM (`cardActions.js:909-929`, `:939-967`): the player's typed
  HTML, now authored by a GM. If Foundry's chat-content cleaning differs by
  author role, this is an escalation; a live world would show it.
- **A relay queued on a GM that stops being canonical before it runs** —
  e.g. `batch.submit` behind a 120 s `oracle.narrate`: the round write
  lands, `startReading` returns (not canonical), and the new canonical GM's
  recovery ran before the entry existed, so it sits "Reading…" until a Send
  now restarts the readings. `requestSendNow`'s `not-canonical` reason has
  no `SEND_NOW_REFUSALS` text either (silent). Rare handover window.
- **Upgrade blockers from the Round window are console-only** — a Burn
  pressed in the window as a GM's Send now closes the card (`round-closed`)
  is refused in `applyBurnFromRelay` with a GM console line
  (`burnMomentum.js:507-512`); `refusePress` covers whose-button only
  (decided scope). The window re-renders onward, so nothing claims it
  applied.
- **Batch Mode's move-lock release ignores a refused release** —
  `startResolution` / `rollRound` / `narrateTheRound` release once in
  `finally` and drop the `false`; the free-flow pipeline retries
  (`releasePendingMoveLock`'s contract). Filed by the batch auditor
  (`batch.md` BATCH-10 (Z19)); not probed here.
- **The Round window's Edit racing a resolution** — Edit writes the entry's
  text into the draft before the withdraw, which a now-resolving round
  refuses ("…your action is kept, for the next round"); the resolved action
  then reappears as the next round's draft.

### Not probed — ui

- **The toolbar mid-drag when a round write lands** — `onRoundChanged` re-renders every client's toolbar on every round write; `_onRender` → `#restorePosition()` snaps it to the saved position for one frame while a drag is in progress (`companionToolbar.js:178-181`, `:307-311`). Cosmetic; needs a browser.
- **Enter in the Round window during IME composition** — the keydown handler submits on `Enter` without checking `isComposing` (`roundWindow.js:213-218`); a CJK input method's commit Enter could submit mid-word. Browser behaviour; not probed.
- **A window closed within the submit round-trip** — `_onClose` drops `#pending`; a reopened window never clears the acknowledged draft, so the submitted text can reappear in the next round's box (`roundWindow.js:239-244`, `:367-376`). Narrow; not probed.
- **The table-talk notice for a GM without an assigned PC** — `TABLE_TALK_NOTICE` ("Write your action in your Round window — it has this line as a draft") is shown to every typist, including a GM whose window has no action box (`driver.js:101-102`, `:1035-1044`); the batch auditor's file.
- **`requestSendNow` marks `modeOffAfter` before its X-Card / no-key refusal** (`driver.js:582-591`): the mode-off dialog's "Send now, then turn off" refused by the X-Card leaves the round marked, so the mode turns itself off after the next resolved round. Arguably what the GM asked; the batch auditor's function — left as a lead.
- **Lowercase stat labels in an English world** — `localizeStat` returns the vendor's "edge" / "iron" (lowercase in `IRONSWORN.Edge`), so the live confirm dialog and Round window read "Stat: edge" where unit tests (no `game.i18n`) see "Edge". Cosmetic and consistent with "+edge"; not filed.
- **CSS for the Round window under the compact layout** — read, not rendered (`styles/starforged-companion.css:2730-2799`); the Quench batch `starforged-companion.batchMode` checks the window in the compact layout live.
- **The flow maps outside Batch Mode** — the narration-, pipeline- and entity-specific claims added by the tenth audit's fixes (combat, vow, connection, exploration, faction, character-detail, narrator-consistency) were spot-checked for identifiers, not traced end to end; their areas' auditors own the behaviour.

### Not probed — sweep

- **SWP-1 (Z17)'s other pairs.** Any fire-and-forget whole-object campaignState write followed on the same client, with no server I/O between, by another whole-object write loses the first. Traced and found I/O between (so not deterministic): the X-Card redirect clear (`narrator.js:1703-1716`) before `persistResolution` (meter writes come first), the sidecar persist before the card post, the spotlight persist before the Claude call. A player's `!ptp` (the card the player's, the clock relay the player's) races the same way but depends on the relay outrunning the capture's echo — not deterministic; the probe covers the GM's own.
- **SWP-1 (Z17)'s shape at the X-Card redirect, in a Batch Mode round** (traced): when the first narration after a GM resumes the X-Card is a round's, its card's create fires `clearXCardRedirect` on the canonical GM (`{ ...latest, xCardRedirect: null }`, `narrator.js:1703-1717`); `narrateRound` then returns with no server I/O (`runRoundNarrationPasses` schedules its passes; `scheduleChronicleEntry` is a timer) and `narrateTheRound`'s `finally` releases the move lock (`driver.js:938-940` → `releasePendingMoveLock`, `{ ...latest, pendingMove: false }` from the cache before the clear's echo), which puts the redirect back: the next narration is told to steer away from what the X-Card answered a second time. Mild (one extra redirect) and needs a FIFO model of message creates beside setting writes to probe faithfully (the sidecar persist sent before the card would read as lost under a settings-only model); same fix as SWP-1 (Z17). Free-flow is usually not exposed: when the move changes a meter, `persistResolution`'s actor write (`persistResolution.js:111`) puts a round trip between the card and its campaignState write (`:136`); a move with no meter change and no suffer prompt may have none — not traced further.
- **A burn racing a Send now / a departing roller in the upgrade step** (`keepUndecidedUpgrades` while a `move.burnMomentum` relay is past its blocker check): the round narrates the kept outcome while the sheet takes the burn. Needs a relay held mid-handler; a sub-second window.
- **A round recovery re-rolling an entry whose outcome effects landed but whose result card did not** (a GM reload inside `rollMove` between `applyOutcomeEffects` and `postMoveResult`): `recoveryPlan` sees no card and no `rolled`, so it rolls again. A crash inside one pipeline step; not reproducible offline.
- **The round's write-only timestamps** (`openedAt`, `resolvingAt`, `narrationAt`, `closedAt`, `readyAt`, `decidedAt`, `recordedAt`, `upgradedBy`, `offer.at`) — listed under SWP-3 (Z37), not asserted (bookkeeping a refuter may prefer to keep).

### Not probed — rules

- Two Fulfill Your Vows of one shared vow in a Batch Mode round: the first
  fulfils every copy; the second has no `moveTargetId` (a sole vow), so
  rollMove's track-gone guard does not apply and its score is 0 — a certain
  miss ("Vow undone … Forsake or recommit") whose recommit offer then refuses
  the fulfilled vow (Y10). RULE-4 (Z07)'s shape without the price; the round's
  `noteReadTrack` / `refusalFor` would need the vow too.
- Symbiote's "add +its health" is offered on Endure Stress when the Haiku pass
  matches it: its "you must Endure Stress" link is a cost mention
  (`isCostMention`), so `ownTrigger` is false and Y22's guard lets the general
  clause's value through (`abilityScanner.js:585-603`). Model-dependent.
- Kinetic's second ability "add +2 (after you roll)" is offered pre-roll,
  pre-checked, on a Haiku match — a post-roll add read as a pre-roll one.
- Withstand Damage's at-0 vehicle-type costs (command: battered / cursed /
  broken module / table; support: battered / table, destroyed → discard) stay
  card text — the known SUFFER-EXECUTOR-ASSET-SCHEMA family; not re-probed.
- The Haiku passes (ability fallback, rider extraction, the interpreter's
  stat / `healSituation`) — model-dependent, as the tenth audit noted.

## Appendix — `GM_ACTIONS` at 8a4ae3b, diffed against the tenth audit's table (the multiplayer auditor's table)

52 kinds (the tenth audit's table at `8fb7bfa` had 39; +13: the three D1
roller follow-ups, `paced.roll` / `whichFight.pick`, eight `batch.*`). The
queue, the budgets (`GM_ACTION_TIMEOUT_MS` 60 s; 270 s for the five
`claude: true` kinds — `session.begin`, `session.end`, `oracle.narrate`,
`move.burnMomentum`, `move.improveResult`), the trust model
(`requesterId` client-asserted — accepted) and `registerGmRelaySocket` are
unchanged. New in `gmRelay.js`: `refusePress(ctx, reason, actor)` + the
dispatch's whisper (`runGmAction` `:356-358`, `tellRefusedPress` `:396-414`),
keyed by the dispatch's own ctx (no handler copies ctx — grep `...ctx` finds
none; every handler is reached only through `runGmAction`).

"Refusal told" = how a press refused for whose it is reaches the presser:
**RP** = `refusePress` (presser + GMs whispered once by the dispatch).
"Claimed" = idempotent on the GM (card stamp / in-flight guard / transition).

**New or changed since the tenth audit**

| Kind | Handler (file:line at HEAD) | Who may send | Validates | Claimed once | Refusal told |
|---|---|---|---|---|---|
| tda.attempt (D1) | `moves/cardActions.js:843` → `applyCardRollerFollowup` `:761` | the card's roller's player or a GM (card names none: payload `actorId`, owned) | card `combatMoveCard`; roller from `f.actorId`; PC check; track id/label from the card | `decisiveActionAttempted` + `_inFlight`; released on a failed post | RP (not-a-pc / not-owner) |
| expedition.finish (D1) | `cardActions.js:875` → `:761` | same | `expeditionProgressCard`; track from the card | `expeditionFinishAttempted` | RP |
| vow.swearRoll (D1) | `session/swearVow.js:935` → `:761` | the vow's holder (card `actorId`, else the PC holding `vowId`) or a GM | `playerVowCard`; vow gone → card closed `vowGone`, presser + GMs told | `swearRolled` | RP; vow-gone notice |
| paced.roll (new) | `cardActions.js:909` → `:761` | the narrating PC's player or a GM | `pacedNarrative` + `suggestedMove` + `playerText` from the card; scene-challenge target id from the card | `rolled` | RP |
| whichFight.pick (new) | `cardActions.js:939` → `:761` | the roller's player or a GM | `trackId` must be one of the card's `fights` (`offers`); move id from the card | `whichFightPicked` (the fight's id) | RP |
| batch.submit | `batch/relay.js:124` | the requester's own entry (`ctx.requesterId`) | open round id; text 1–2000 (`cleanSubmissionText`); `submissionId` ≤64; collecting; a participant | same `submissionId` is a no-op | whisper / toast (`tellRequester`) |
| batch.withdraw | `relay.js:132` | own entry | round id; collecting | idempotent (waiting) | same |
| batch.pass | `relay.js:137` | own entry | round id; collecting | idempotent | same |
| batch.confirm | `relay.js:149` | own entry | `submissionId` current; read; `validateChoices` (offered abilities ≤24, offered stat, target among options) | idempotent (ready) | same |
| batch.reread | `relay.js:163` | own entry | `submissionId` current; `moveId` = the reading's suggestion; `useOffer` needs the GM-set offer | new submission | same |
| batch.keep | `relay.js:179` | own entry | round id; an undecided upgrade, recorded | `decideUpgrade` idempotent | same |
| batch.sendNow | `relay.js:227` | GMs (`ctx.requesterIsGM`) | round id; X-Card / no-key refusals | `_sendNowRequested`, one `beginResolution` | same (MP-3 (Z04): `modeOffAfter` from the switch is a Send now in the upgrade step) |
| batch.discard | `relay.js:246` | GMs | round id; collecting | close idempotent; stale id refused | same |
| move.burnMomentum | `moves/burnMomentum.js:490` | card actor's owner or GM | `canBurn`; consumed / in flight; blockers (incl. `round-closed`); owner | `claimResultUpgrade` + `consumed` | RP (not-owner, no-actor); blockers console-only (pre-existing) |
| move.improveResult | `moves/improveResult.js:269` | same | same | same | RP |
| milestone.pick | `moves/milestonePicker.js:72` | card's actor owner or GM | (vowId, actorId) a card choice; fulfilled vow refused | `resolved` before the mark | RP |
| suffer.pick | `moves/sufferCard.js:410` | owner of the card's PC | pick offered; superseded; gone PC (Y20) | `resolved` before effects | RP (no-actor, not-owner) |
| connection.pick / combatTrack.battle / wayOut.pick | `cardActions.js:157` / `:1174` / `:1356` | `relayedClickerPc` / `cardRollerPc` (`:1110`, `:1138`) | as the tenth audit | as before | RP (new) |
| waypoint.oracle / fulfilVow.pick / legacy.pick / milestone.suggestion / fulfilVow.attempt | `cardActions.js:291` / `:383` / `:474` / `:565` / `:649` | card `actorId` owner or GM | as before | as before | RP (new) |
| vow.recommit / bond.recommit | `cardActions.js:1032` / `:1042` → `applyRollerRecommit` `:1049` | card `actorId` owner or GM | as before | `recommitted`; released on `write-refused` | RP (not-owner; a gone roller is still worded "names no character of yours" — RECOMMIT-GONE-ROLLER-WORDING, open) |
| safety.setFlag / session.takeBreak | `safety/sessionDialogs.js:106` / `:275` | anyone | as before | — | a refused write posts the not-recorded note where the card is (Y06) |
| session.begin / session.end | `safety/sessionLifecycleDialogs.js:195` / `:563` | anyone (W85) | as before | own chains | Y06 notes |
| repair.apply | `moves/repair.js:278` | supply only from an owned PC | + unprepared payer refused (REPAIR-TRADE-WHILE-UNPREPARED) | — | card line |
| payThePrice.advanceClocks | `clocks/payThePriceClocks.js:250` | anyone | — | Y37's queued full-check | — |

**Unchanged** (handler moved only): `xcard.activate` `context/safety.js:159`
(unqueued); `safety.syncPrivateLines` `ui/settingsPanel.js:831`;
`bond.apply` `moves/bondCommand.js:162`; `factContinuity.command`
`factContinuity/chatCommands.js:169`; `oracle.narrate`
`oracles/oracleFollowup.js:92`; `payThePrice.suffer` `index.js:6092`
(not-owner still console-only — Y43 refuses the honest PC-less case on the
typist first); `narrator.sidecar` `narration/narrator.js:4070`;
`combat.threshold` `cardActions.js:1266`; `connection.suggest` `:1423`;
`vow.reward` `session/swearVow.js:567`; `vow.link` `:1009`;
`fightVow.markMilestone` / `fightVow.deepenBond` `cardActions.js:1483` /
`:1509`; `payoff.retry` `:1591`; `expedition.recommit` `:980`;
`chronicle.edit` `character/chronicle.js:174`; `progressTrack.edit`
`ui/progressTracks.js:1172`; `entity.edit` `ui/entityPanel.js:1297`;
`privateChannel.createJournal` `private-channel/transcript.js:248`.

**Legacy (non-`gmRelay.`) relays on the socket** — unchanged set (grep of
`socket.emit` / `socket.on` in `src/`): `errorLog.append`
(`logging/errorLog.js:124-176`, X53's `ENTRY_RE`); `audio.cache.write`
(D11, + D10: not filed by a GM holding an ElevenLabs key, `audio/index.js:444-466`),
`audio.synth.request` (W81 / X51 — see MP-D1 (D8)), `audio.cache.ask`, and the two
answers `audio.synth.done` / `audio.cache.found` (Y42: `relayedClipPath` →
`cache.isCachePathFor`, `audio/index.js:563-625`, `cache.js:100-104`).

## Merged rows as filed

Where several auditors filed one defect, the report row carries one auditor's text and cites the others. The others' rows, in their own words, with the report ID each became:

#### BATCH-D1 ROUND-CAPTURE-ACTOR → D3
- **Class / severity:** ATTRIBUTION / low
- **Finding:** A move narration's capture pass is handed the roller's PC (`actorId`, issue #321 U23): a detected NPC's draft card carries it, and its Confirm files the new connection (and its bond Item) on that PC's sheet. A round's single capture pass is handed `lead.actorId` — the Make a Connection hit's roller, else **the first entry to confirm**. In a round where Kira (confirmed first) only keeps watch and Ren's Gather Information strong hit turns up the smuggler Vess, Vess's draft is Kira's: Confirm files the connection on Kira's sheet. Which PC a round's discovered NPC belongs to is not decided anywhere (decisions.md speaks only of two Make a Connection hits).
- **Where:** `src/narration/narrator.js:1041-1053` (`actorId: lead?.actorId`), `:1338-1345` (`routeEntityDrafts(…, { actorId })`).
- **Reproduced:** `tests/probes/batch/roundDraftCreditedToFirstEntry.probe.js` — Kira first: "expected 'pc-kira' to be 'pc-ren'" (the draft's `actorId`). Control (Ren first: Ren's) passes. The probe asserts option B.
- **Options:** A — keep the first entry's PC (simple; whoever confirmed first "owns" the round's finds). B — the roller of the round's discovery-class move (the entry whose move set the widest class; for several, the first of them); a round with none credits no PC (the GM's Confirm then asks or files it on no sheet). C — the draft names no PC and the GM's Confirm offers the acting PCs to pick from.
- **Recommendation:** B — it keeps U23's "credit the roller" for the move that let something new into the fiction, costs one line in `runRoundNarrationPasses` (the same lead choice BATCH-3 needs fixed), and needs no new UI; C if the maintainer wants the table to choose.

#### PIPE-1 PACED-NARRATION-CACHED-STORE → Z02
- **Class / severity:** LOSE-STATE / medium (Y04's rating for the same shape)
- **Finding:** Every line the pacing classifier calls NARRATIVE or NARRATIVE_WITH_MOVE_AVAILABLE — the commonest narration in play — is narrated on the canonical GM's *cached* campaignState. `onMessage` reads `preState = game.settings.get(MODULE_ID, "campaignState")` (the cached setting, by reference — rules/foundry-api.md) and hands it to `routePacedInput` → `narratePacedInput(playerText, campaignState)`, which mints a scene on it (`ensureSceneStarted` → `startScene` → `openScene` sets `currentSceneId` / `sceneState` / `sceneFrame` / `spotlight` on the object) and applies the sidecar onto it (`applyNarratorSidecar` → `applySidecarSideData` pushes truths / state / frame) before each refusable write, whose refusal is logged and swallowed. Scenario: a two-player table, keyed GM; Kira's player types "Kira asks the dockmaster how the berth fees are this cycle"; the classifier says NARRATIVE; the narrator's sidecar files "the dockmaster — Owes the crew a favour"; the world refuses the GM's campaignState write (a server error / dropped socket). → The GM's client alone holds the truth (and, with no scene open, a scene the world never minted): its next narration renders it as binding (`liveSceneLedger` reads that cache), the consistency check audits against it, and the next move carries it into the world after all: its lock claim writes the cached object whole (`game.settings.set(MODULE_ID, "campaignState", campaignState)`, `src/index.js:991`), and its record then merges that working copy's truths into the store (`mergeSceneLedgers` unions them). Should: narrate from a working copy, as decisions.md (#335 Y04) requires — "A narration works on a copy at every entry handler"; X09 gave six callers a copy and Y04 four more; the paced path (`routePacedInput`) is an entry handler neither reached.
- **Where:** `src/index.js:931-944` (`preState` = the cache, handed to `routePacedInput` at `:936`); `src/pacing/router.js:294-300` (`routePacedInput` passes it to `narratePacedInput`); `src/narration/narrator.js:2944-3006` (`ensureSceneStarted(campaignState, …)` at `:2964`, `applyNarratorSidecar(raw, campaignState, …)` at `:2997`); `src/factContinuity/sceneLifecycle.js:105-137` (`openScene` mutates then persists), `:755-800` (`persistSceneLedgerFields` writes a copy but the caller's object already holds the push); the carry-back: `src/index.js:984-991` (the claim writes the cached object).
- **Reproduced:** `tests/probes/pipeline/pacedNarrationCachedStore.probe.js` — (1) with the GM's campaignState writes refused, after Kira's NARRATIVE line: `expect(facts(gmCache())).toEqual([])` → "expected [ 'Owes the crew a favour' ] to deeply equal []" (sanity: the paced card posted, `world().sceneTruths` empty); (2) writes allowed again, Kira's next line rolls a move: `expect(facts(world())).not.toContain('Owes the crew a favour')` → "expected [ 'Owes the crew a favour' ] to not include 'Owes the crew a favour'" (the refused truth reached the world on the next whole-object write); (3) with no scene open: `expect(gmCache().currentSceneId ?? null).toBeNull()` → "expected 'sc-68bc3773' to be null". Controls pass: with the write accepted the truth lands in the world and the cache agrees; `@scene` (X09's site) leaves the cache as the world on the same refusal.
- **Fix:** In `onMessage`, hand the pacing router a working copy — `const preState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {})` (pacing only reads it; the narration then mints / applies on the copy, as `@scene` does since X09) — or deep-clone inside `routePacedInput` before `narratePacedInput`. Add the paced path to `narrationWorkingCopy.test.js` and the rules/foundry-api.md list.
- **Overlap checked:** decisions.md "Issues #335–#337 audit" Y04 bullet and #329 X09 (tests `narrationWorkingCopy.test.js`, `narrationCachedStoreWrites.test.js` pin the six + four sites; neither has the paced path); known-issues has no paced-narration cache item. An incomplete fix of Y04 / X09, not a regression of the split (the pre-split `onMessage` passed the same `preState`). **Same row as the narration auditor's NARR-1 PACED-NARRATES-ON-CACHED-STORE** (found independently; NARR-1 also names the in-place `campaignState.spotlight = record`) — merge.

#### PIPE-3 ROUND-LOCK-RELEASE-NOT-RETRIED → Z19
- **Class / severity:** LOSE-STATE (lock-up) / low (needs one refused write; its consequence is a silent table-wide lock-up)
- **Finding:** `releasePendingMoveLock` returns `false` when the world refuses the release, so the caller can retry it — the free-flow pipeline does (its early release before the riders, then its `finally`: issue #302, #315 S01 "a refused early release is still retried"). The Batch Mode round releases its claims through the same function in three `finally` blocks and ignores the result. Scenario: Batch Mode on; Kira submits and confirms, Ren passes; the round claims the lock, rolls and records Kira's move; the release in `startResolution`'s `finally` is refused once (a server error, a dropped socket). → The lock stays `pendingMove: true, pendingMoveBy: gm-1`; the advance pass moves the round to `narrating`, whose own claim finds the lock busy (`_waitingForLock`) and waits for a campaignState write that frees it — none comes. The round never narrates, every window shows it resolving, every free-flow move (a non-participant's card move) is held for a release that never comes or refused "A move is already being resolved", and nobody is told (no notice on any client). Only a GM reload (the ready reset treats this client's own earlier claim as stale) or the GM leaving (W25) frees it. Should: a refused release is retried and, failing that, said — as free-flow does — CLAUDE.md "Concurrency guards and pipeline locks … must be released in a `finally` … [or] it wedges permanently"; decisions.md Batch Mode "each released in a `finally` through the lock's own paths"; rules/foundry-api.md / issue #302 (the release's `false` exists for its retry).
- **Where:** `src/batch/driver.js:642-644` (`startResolution`'s `finally`: `await host().releaseMoveLock(lock.claim)` — result ignored), `:692-694` (`rollRound`'s own claim), `:938-941` (`narrateTheRound`); the contract: `src/index.js:2057-2112` (`releasePendingMoveLock`, `:2091`, → `false` on a refused write, "the caller retries it"); the free-flow retry it skips: `src/index.js:1081`, `:1100`; the wait that never ends: `src/batch/driver.js:927-931` (busy → `_waitingForLock`), `:1223-1226` (resumed only by a write with the lock free).
- **Reproduced:** `tests/probes/pipeline/roundLockReleaseRefused.probe.js` — the first campaignState write from gm-1 that frees the lock after a claim is refused once: `expect(world().pendingMove).toBe(false)` → "expected true to be false" (sanity: Kira's move card posted, exactly one write refused; traced state: round `narrating`, `pendingMoveBy: 'gm-1'`, no notification on any client). Controls pass: the same single refusal in free-flow is retried by the pipeline's `finally` and the lock frees; with no refusal the round narrates once and frees the lock.
- **Fix:** In the driver, retry a release that returned `false` (once, as free-flow's `finally` does) and, still refused, tell the GMs ("the move lock could not be released — reload to free it") and keep `_waitingForLock` from waiting on its own claim — e.g. a `releaseOwnClaim(claim)` helper in the driver that loops `releaseMoveLock` up to twice and whispers on failure; or have narrateTheRound treat a lock held by its own released-but-refused claim as its own (re-use it rather than wait).
- **Overlap checked:** decisions.md Batch Mode (claimed / released in a `finally` — satisfied in letter, the refused case unhandled); "Move-concurrency lock covers narration + persistence" S01 update (the retry this skips); known-issues LOCK-LOST-BY-COGM-STALE-WRITE / LOCK-RESURRECTED-DEPARTED-CLAIMANT are other-client stale writes, not a refused own release. New with Batch Mode (8228a49). **Same row as the batch auditor's BATCH-10 ROUND-LOCK-RELEASE-NO-RETRY** (found independently) — merge.

#### PIPE-6 FINISH-SCENE-GONE-TRACK-ROLLED → Z07
- **Class / severity:** RULES (WRONG-DETAIL) / low (needs a stale row)
- **Finding:** A Finish the Scene started from a scene challenge's row on the Progress Tracks panel names the challenge by id (`rollProgress` → `forcedMoveTargetId: track.id`). When that challenge was finished or deleted meanwhile — Ren's Finish the Scene, or the GM's ✓ Complete, landing a moment before Kira's panel re-renders, or her press while the update is still on its way — `enrichProgressTicks` finds no open challenge by that id and scores 0, and `rollMove`'s "not rolled" guard does not cover the `scene_challenge` tick source, so the move is rolled: "Finish the Scene — progress (0 ticks) — Progress: 0 | Challenge: 4, 7 — Miss — Pay the Price. Make it hurt.", and a Pay the Price card ("A trusted individual or community acts against you") is paid by Kira for a scene that is already over; `finishSceneChallenge` then finds nothing to finish. The same press on an expedition's row is refused with the track-gone card. Should: nothing rolled and the card says so — the guard's own rule (issue #306 R06, #321 U02): "A roll started from a track (a Progress Tracks row …) names it by id. When that track was deleted or finished meanwhile, nothing is rolled — and it says so: … a score of 0 would be a certain miss with its consequences"; decisions.md (#326 D6) made Finish the Scene a progress move "like Finish an Expedition" with its own tick source, and the guard was not extended. (The panel's own handler checks only `!track || track.ticks === 0`, not `completed`, so it does not stop the press either.)
- **Where:** `src/moves/movePipeline.js:733-739` (the guard: `tickInfo?.source === "combat" || … "expedition" || … "vow"` — no `"scene_challenge"`); `src/moves/statEnrichment.js:592-609` (`scene_challenge` resolves only an open challenge by the id; none → score 0 with a warning, `:666-676`); `src/moves/resolver.js:732-744` (`finish_the_scene` miss → `routePayThePrice`); the press: `src/ui/progressTracks.js:680-690` (`#onRollProgress`, no `completed` check), `:292-303` (`rollProgress` posts the row's id).
- **Reproduced:** `tests/probes/pipeline/finishSceneGoneTrackRolled.probe.js` — with "Escape the Collapse" completed, Kira's row press: `expect(moveCards()).toEqual([])` → "expected [ { …(7) } ] to deeply equal []" (the traced card: progress 0, Miss, "Pay the Price. Make it hurt.", plus the Pay the Price card). Control passes: the same press on a completed expedition's row (Finish an Expedition) posts the track-gone card and rolls nothing.
- **Fix:** Add `"scene_challenge"` to the guard's sources (`src/moves/movePipeline.js:734`), so a Finish the Scene naming a gone challenge posts `postTrackGoneCard` and returns `{ refused: "track-gone" }` before any add is taken; optionally have `#onRollProgress` refuse a completed row as well. (The `connection` source has the same gap, rarer: a connection picker's Forge a Bond held at the lock or the session gate, its connection severed meanwhile, rolls at 0 — a certain miss, no price; traced, not probed.)
- **Overlap checked:** issue #306 R06 / #321 U02 (the guard), #331 X17 (the guard runs before the adds), #326 D6 (Finish the Scene as a pipeline move — the port missed the guard); FINISH-SCENE-CLOCKID-DEAD (de328bf) touched only the clock retirement. Not in known-issues. **Same root cause and fix as the rules auditor's RULE-4 BATCH-FINISH-SCENE-TWICE** (its trigger: two Finish the Scene entries in one round — deterministic, rated medium there); this row is the free-flow trigger (a stale panel row) — merge as one row with both triggers.

#### CARD-2 BATCH-OFFER-DROPPED-CARD-CLAIMED → Z05
- **Class / severity:** LOSE-STATE / low
- **Finding:** Batch Mode (issue #340). Kira has submitted and confirmed her action for the round; Ren and Ash are still deciding. Kira's player presses a follow-up on one of her earlier cards — "⚔ Attempt to Finish the Fight" on her Strike card (likewise ⚑ Mark Progress on Vow, 🏁 Attempt to Fulfill, 🗺 Finish the Expedition, a pick…). The canonical GM claims the card (`decisiveActionAttempted`, `applyCardRollerFollowup`) and posts the forced move; the round records it as an **offer** beside her READY entry ("the window asks which to keep"). Ren and Ash pass (or confirm, or a GM presses Send now): `readyToResolve` counts a READY entry with an offer as ready, so the round resolves before Kira chooses. The offer is a field of round 1's entry; round 2 opens with fresh entries (`createRound` → `newEntry`, `offer: null`) and nothing holds the offered move — it is gone, while its card stays claimed on every client (the button reads pressed for good) and nobody is told. Expected: a card's move is never dropped without its roller's choice — the decided model is "a card button's move becomes its roller's entry, or waits for the next round while one resolves" (decisions "Batch Mode"; `driver.js` header and `takeForcedMove`: the press made while a round resolves is held for the next one, `holdForNextRound`). An offer the round outran should wait for the next round the same way, or its card's claim be released so the button re-arms. ("Keep mine" drops it by the player's choice — but the card stays claimed there too, so the follow-up can't be taken next round either.) Sharper for an Explore a Waypoint match (traced): `applyWaypointOraclePick` claims the card (`waypointRewardClaimed: "alternative"`) **and retires the ordinary choice card** (`retireOutcomeChoiceCards`) once the forced 🔭 Make a Discovery / 🌀 Confront Chaos is posted — so a dropped offer loses the waypoint's reward both ways: no discovery, and the +2 momentum / progress pick is gone.
- **Where:** `src/batch/round.js:445-462` (`offerForcedMove` — the offer on an own entry, no message id kept), `:523-529` (`readyToResolve` ignores an offer), `:190` (`createRound` — fresh entries, the offer not carried); `src/batch/driver.js:1054-1072` (`takeForcedMove`), `:1084-1103` (`joinRound`), `:1105-1112` (`holdForNextRound` — the path an offer never reaches), `:963-981` (`finishRound` closes and opens the next round, nothing re-homes offers); the claim the card keeps `src/moves/cardActions.js:806-807`; the window's offer row and Keep mine `src/ui/roundWindow.js:265-269`, `:550-552`.
- **Reproduced:** `tests/probes/cards/batchOfferDroppedCardClaimed.probe.js` (simulated table, the real `tda.attempt` relay from Kira's player): after the round resolves, `round 2 Kira entry waiting text=null offer=null; card decisiveActionAttempted=true: expected false to be true`. Setup asserts pass (the card claimed, round 1 offering "Take decisive action…" beside Kira's ready entry). Control (passes): the same press before Kira acts becomes her entry.
- **Fix:** keep the forced message's id on the offer (`offerForcedMove` from `joinRound`) and, when a round leaves collecting with an untaken offer, hand that message to `holdForNextRound` (it joins round N+1 as the entry or an offer, as a press during resolution does); for "Keep mine", the same hold or a decision (see below).
- **Overlap checked:** decisions "Batch Mode" (lines 9–95) decide the offer and the hold during resolution, not an offer outrun by the round; FORCED-MOVE-HOLD-RELOAD (open) is the hold's reload loss — distinct (no reload here). Not a tenth-audit row (Batch Mode post-dates it).

#### UPG-4 ROUND-OFFERS-CLOSED-UPGRADE → Z27
- **Class / severity:** UX / low (Batch Mode)
- **Finding:** Batch Mode. Kira's Face Danger rolls a weak hit; its record posts the move card (🔥 Burn, momentum 9 → strong hit) and the weak hit's choice card ("Make a suffer move (-1)"); the round enters its upgrade step and Kira's window asks "Decide before the round is narrated" — Burn / Keep. She resolves the consequence first (the card is in chat; nothing says the choice closes the burn): Lose Momentum (-1). A chosen consequence closes both upgrades (issue #311 P03; the card's 🔥 now reads "the consequence was already chosen"). But the round's offer was built from `burn.canBurn` alone at `beginUpgrades` (`upgradeOffers` checks `consumed` only — not `choiceMade`, `laterMove`, `consequenceChosen`, `laterMoveFollows`) and is never revisited: the round keeps waiting on Kira, her window keeps offering Burn, and the Burn it relays is refused on the GM with a console line only (`applyBurnFromRelay` → "choice-made") — the button re-arms after 15 s and nothing tells Kira why, or that only Keep (or a GM's Send now) moves the round on. Same for the resist roll a price owes (its card says "burn or improve first", Y18) and for a choice made before the upgrade step began. "No silent no-op on a player's action, relayed or not" (decisions.md 211-219); "Upgrades are decided before the narration … the round waits for them" (decisions.md 25-31) — for an upgrade that can still be made.
- **Where:** `src/batch/driver.js:813-825` (`upgradeOffers`); `src/moves/resultUpgrade.js:551-562` (`closeUpgradesForChoice` stamps the card, tells no round); `src/moves/burnMomentum.js:507-513` / `src/moves/improveResult.js:286-292` (refused with a console warning); `src/batch/roundView.js:162-172` (the window's offer is the round's).
- **Reproduced:** `tests/probes/upgrades/roundOffersClosedUpgrade.probe.js` (Batch Mode table): after the pick, "the round no longer waits on it" — `expected true to be false` (phase `upgrading`, `decided: null`); "the window's Burn … is not refused in silence" — `expected false to be true` (no whisper, no notification to pl-1). Controls pass: the pick closes the card's Burn (`choiceMade`, momentum 9 → 8); a Burn from the window before any choice applies and the round narrates the strong hit.
- **Fix:** in `upgradeOffers`, skip a card whose upgrade is closed (`resultUpgradeBlocker`, `consequenceChosen`, `laterMoveFollows`); and when `closeUpgradesForChoice` closes a round entry's card during the upgrade step, decide it Keep (`keepUpgrade`, canonical GM) — the choice is the roller's answer. A refused window Burn whispers its reason (`UPGRADE_REFUSALS`) to the presser, as `refusePress` does for ownership.
- **Overlap checked:** Batch Mode decisions (decisions.md 9-95) say the round waits for each roller's decision and Send now counts as Keep — nothing on a closed offer. No known-issues row; distinct from UPG-3 (riders) and from the batch rounds' X-Card / recovery rows. **Duplicate, found independently:** the batch area's BATCH-14 UPGRADE-OFFER-IGNORES-CHOICE (`tests/probes/batch/upgradeOfferedAfterChoiceMade.probe.js`) is this row — merge; this one adds the silent window refusal.

#### UPG-7 ROUND-RIDER-PROMPT-HOLDS-NEXT-ROUND → Z03
- **Class / severity:** RACE / UX / medium (Batch Mode × the asset-effects prompt)
- **Finding:** Batch Mode. Kira's asset has an optional effect on her move — "you may take +1 momentum" (or a "choose one", or a progress mark with two tracks open): the extractor marks it prompted, and `applyMoveConsequenceRiders` awaits the GM's "✦ Apply asset effects" `DialogV2.wait`. In a round that await runs inside `finishRound`'s per-entry loop — inside the driver's one-pass-at-a-time advance loop (`advanceRound`'s `_advancing`). Round 1 narrates and round 2 opens (`openRoundIfDue` runs first), but while the GM has not answered round 1's dialog every later advance only sets `_advanceAgain`: round 2's players submit and confirm, the window shows them Ready, and the round never resolves — a GM's Send now too only queues another pass behind the held one — and nobody is told why, until the GM answers a dialog about round 1 (non-participants' held forced moves, `runHeldFreeFlowMoves`, wait behind it too). Free-flow runs the same prompt after the move lock is released, so it holds nothing ("That prompt no longer holds the move lock", movePipeline.js finishMove — PLAYTEST-1712 M/N); Batch Mode's own rule: "an interactive wait never holds it" (decisions.md 58-60) — the advance loop is the round's lock in all but name.
- **Where:** `src/batch/driver.js:522-541` (`advanceRound` — one pass at a time, a second call only flags `_advanceAgain`), `:963-980` (`finishRound` awaits each `finishMove`), reached from `:919-946` (`narrateTheRound`) in `advanceOnce`; the wait `src/index.js:6646-6648` → `src/moves/riderDialog.js:104` (`DialogV2.wait`).
- **Reproduced:** `tests/probes/upgrades/roundRiderPromptHoldsNextRound.probe.js` (Batch Mode table, the GM's dialog held open): round 2's entry is `ready` (asserted) and `expected 2 to be 3` (`round().number`). Control passes: once the GM answers the dialog, round 2 resolves.
- **Fix:** run the round's `finishMove`s off the advance pass — fire them after `finishRound` returns (each caught, as `finishMove`'s own `.catch`), or queue them on a separate chain — so `advanceRound` is free while a GM answers a prompt; the riders' writes are their own (`applyMeterRiders` re-reads the actor), so nothing needs the round's pass.
- **Overlap checked:** the Batch Mode decision (decisions.md 9-95) and PLAYTEST-1712 M/N (the free-flow lock) — the round's driver re-introduced the hold on another guard; no known-issues row. Distinct from UPG-3 (what the riders bind to). **Duplicate, found independently:** the batch area's BATCH-2 RIDER-PROMPT-HOLDS-NEXT-ROUND (`tests/probes/batch/riderPromptHoldsNextRound.probe.js`) — merge.

#### NARR-2 SWEAR-VOW-SCENE-NARRATES-ON-CACHED-STORE → Z02
- **Class / severity:** LOSE-STATE / low (NARR-1's shape at a once-a-campaign site; the lead may fold it into NARR-1 — one fix pattern, two entry handlers Y04 did not list)
- **Finding:** A player presses ⚔ Swear this vow on the inciting card. The forced Swear an Iron Vow rolls on the canonical GM and `rollMove` calls `swearSharedVowForAll(incitingMsg, …)` (`src/moves/movePipeline.js:915`), which reads `campaignState = game.settings.get(MODULE_ID, "campaignState")` — the cached value by reference — and, after the vow Items (no campaignState write), hands it to `narrateAndPostVowSwearing` → `narrateVowSwearing`: `ensureSceneStarted` mints a scene on it when none is open, and `applyNarratorSidecar` applies the oath scene's truths, state and frame onto it, each before a refusable write. A crisis clock or a new target writes campaignState first (`createClock`, `createConnection`), and an accepted write detaches the local — but under Y04's premise (the server refusing the GM's writes) those are refused too, so the narration still runs on the cache. A refused write leaves the GM's cache holding the oath scene's facts (or a scene) the world lacks, with Y04's consequences (rendered as binding next prompt, carried into the world by the GM's next whole-object write). The free-flow Swear an Iron Vow narrates on the pipeline's own detached object (`movePipeline.js:918`); only the inciting path reads the cache. decisions.md [Y04]: "A narration works on a copy at every entry handler".
- **Where:** `src/session/swearVow.js:187` (the by-reference read), `:285` (`narrateAndPostVowSwearing({ vow, campaignState, … })`); `src/narration/narrator.js:2794` (`ensureSceneStarted`), `:2810` (`applyNarratorSidecar` on the object given); caller `src/moves/movePipeline.js:915`.
- **Reproduced:** `tests/probes/narration/swearVowSceneOnCache.probe.js` (booted table, keyed GM; the inciting card in chat; the GM's campaignState writes refused; the GM's client runs `swearSharedVowForAll` as the pipeline does). Scene open: "expected [ 'Swore on the cold iron of the airlock' ] to deeply equal []" (the GM cache's `sceneTruths`; the world's is `[]`, the oath card posted). No scene: "expected 'sc-0816bdb7' to be null". Control passes: with writes accepted the oath's truth lands in the world and the cache agrees.
- **Fix:** `foundry.utils.deepClone(game.settings.get(…))` at `swearVow.js:187` (the X09/Y04 pattern); add the site to `narrationCachedStoreWrites.test.js` and rules/foundry-api.md's list.
- **Overlap checked:** Y04 (listed `!incite`, the Session panel and Campaign Start — the inciting *narration* — not the inciting *swear*); X35 (creators push ids after the write — unrelated to the narration's ledger mutation); NARR-1 (same fix family).

#### CONT-1 XCARD-UNDONE-BY-ACTIVITY-STAMP → Z01
- **Class / severity:** SAFETY (RACE) / high — a safety-tool leak with no word to anyone; it needs the stamp to be due (the X-Card's card is the first chat message of a 10-minute period — every lull in chat, and a fraction of busy-play X-Cards), and then the overlap is the relayed play's normal timing, not chance.
- **Finding:** A player types `!x`. Their client relays `xcard.activate` to the canonical GM and, without waiting (a relay has no ack), posts the X-Card card. Both reach the GM in the same moment: the relay runs `suppressScene`, whose pause write (`xCardActive`, `xCardPlays`, the ledger retraction, `xCardedNarrationIds`, the emptied summary, `xCardRedirect`) is a server round trip — Foundry updates the setting's local document only when the server answers (`#setWorld` → `current.update`, `docs/foundry-reference/foundry-api-reference.md` "Not verified: world scope" note; rules/reachability.md §9 "a store can lag the world by a delivery"). The X-Card card's `createChatMessage` runs the GM's session-activity hook, and when the last activity stamp is 10+ minutes old — the first chat message of every 10-minute period — `touchSessionActivity` writes `{ ...latest, lastSessionTimestamp }`, the WHOLE campaignState as the GM's cache holds it, i.e. without the pause. The server applies the pause, then the stamp: `xCardActive` goes back to false, the removed beat's truth is live again (not retracted), `xCardedNarrationIds` loses the id (so a stale writer's merge and a late relayed sidecar are no longer stopped), the summary's text comes back. The finish still flags the card `xCarded`, and the player's card reads "Scene paused. Current content is suppressed." with a Resume button — nobody is told. The narrator keeps going, with the removed beat binding in the ledger. What should happen: the pause and its removal stand (decisions.md "X-Card: anyone plays it, a GM resumes it"; U07 full exclusion; rules §9 "A safety-critical flag is read live" — reading live does not help when the store itself was overwritten). The same stamp reverts any campaignState write the GM has in flight when a message lands on a due stamp (a move's persist, a relay handler), but for the X-Card the stamp is triggered by the X-Card's own card, so the overlap is not chance: it is the relayed play's normal timing whenever the stamp is due.
- **Where:** `src/session/lifecycle.js:290-296` (`registerSessionActivityHook` — every message, canonical GM), `:308-323` (`touchSessionActivity` — `{ ...latest, lastSessionTimestamp }` whole-object from the cache, at most every `ACTIVITY_STAMP_MINUTES` = 10, `:129`); the pause write it reverts `src/context/safety.js:167-174` (`suppressScene`), the card posted without waiting `src/context/safety.js:368-381` (`playXCard` → `postXCardCard`) and `src/multiplayer/gmRelay.js:450-455` (a player's relay returns at the emit); registered at `src/index.js:7378`.
- **Reproduced:** `tests/probes/continuity/xcardUndoneByActivityStamp.probe.js` (multi-client table; a real move narration with a sidecar truth, then `pl-2` types `!x`; the GM's two campaignState writes are held and released in the order sent — the round trip the harness does not otherwise model; the held values show the race: `[pause xCardActive true, stamp xCardActive false]`). Fails: `the X-Card pause: expected undefined to be true`; soft: `the removed beat's truth: expected null to be 'xcard'`, `xCardedNarrationIds: expected +0 to be 1`; the player's card still says recorded (`xcardRecorded: true`). Control (passes): the same held round trip with the stamp written a minute ago — only the pause is written, and it stands with its removal.
- **Fix:** Keep the activity stamp out of campaignState's whole-object writes: its own world setting (`sessionActivity`, read by `sessionNeedsMint` / `idleMs` / `mintSession`), so a chat message never writes campaignState. Narrowest: the activity hook counts only a person's message (no module flags), so the X-Card's card — and every other module card — no longer triggers a whole-object write (it removes the X-Card's own trigger, not the general hazard). In the LOCK-RESURRECTED-BY-COGM-STALE-WRITE pattern: the canonical GM remembers the X-Card plays it recorded (`xCardPlays`) and, on a campaignState update that carries a lower count or `xCardActive` false with no resume, re-applies the pause and `retractNarrations` from the `xCardedNarrationIds` it remembers.
- **Overlap checked:** not in known-issues (no entry names `touchSessionActivity`, the activity stamp or an X-Card reverted by a write); XCARD-UNSAVED-RELAYED (#302) is a refused write, not an overwritten one; LOCK-RESURRECTED-BY-COGM-STALE-WRITE / LOCK-LOST-BY-COGM-STALE-WRITE are the lock's version of the lagging-cache shape from a co-GM — here it is the canonical GM's own two writes, and the X-Card has no claimant-side repair. The tenth audit excluded two-GM journal read-modify-writes only. The session auditor may file the general "stamp reverts any in-flight write" case; this row is its safety-tool instance, triggered by the X-Card itself.

#### CONT-6 ROUND-CONNECTION-WRONG-NPC → Z09
- **Class / severity:** ATTRIBUTION (WRONG-TARGET) / medium
- **Finding:** A Batch Mode round: Ren writes "I threaten the smuggler Kade until he talks." (Compel), Kira "I win over Ilsa Marr, the dockmaster, with a share of the cargo." (Make a Connection); both hit. The round is narrated once, in confirm order, and captured once: `runRoundNarrationPasses` hands the whole round narration to `runPostNarrationPasses` with the Make a Connection hit's roller (Kira) and seed, and `routeEntityDrafts` auto-creates "the first connection-typed draft" of the detection reply. In a round that is whichever NPC the prose names first — here Ren's smuggler: Kade becomes Kira's connection, seeded with her Make a Connection's role / goal, stamped with the round's narration, with the bond Item on Kira's sheet; Ilsa Marr, the NPC Kira actually made a connection with, goes to the GM's draft card. The pending-draft fallback has the same widening: its `namingText` is every entry's line plus the round narration, so a pending draft row another player named is confirmed as the roller's connection (`confirmNamedPendingConnection`, newest card first). In free-flow the narration and the naming text are the roller's move alone, so the first NPC is the move's. The comment on `runRoundNarrationPasses` covers two Make a Connection hits in one round, not another entry's NPC. (Traced, not in the probe — the round's capture runs on a 2 s timer when no Make a Connection hit is in it: with none, `lead` is the round's first entry, so the ◈ New Entities card carries the first acting PC as `actorId`, and a GM's Confirm bonds an NPC another player's action introduced to that PC — issue #321 U23's "not the first PC's", lost in a round.) What should happen: the connection a Make a Connection creates is the one its roll made — credit the roller, and the move's target (CLAUDE.md "credit the roller"; rules/reachability.md §6, a name match must "never fan a write to the wrong record"; issue #325 W23's "the pending connection row the move's narration names").
- **Where:** `src/narration/narrator.js:1041-1056` (`runRoundNarrationPasses` — the whole round's narration, all entries' text as `playerNarration`, the roller as `actorId`), `:1338-1350` (`runDiscoveryDetection` → `namingText`); `src/entities/entityExtractor.js:567-596` (`routeEntityDrafts` — `!created.length`: the first connection entity of the reply), `:628-637` → `:2046-2063` (`confirmNamedPendingConnection` over `namingText`).
- **Reproduced:** `tests/probes/continuity/roundConnectionWrongNpc.probe.js` (the multi-client table; real relays, readings, rolls, round narration and capture, `createConnection` and the bond Item; the detection reply scripted with both NPCs in the prose's order). Fails: `Ren's smuggler as Kira's connection: expected [ 'Kade' ] to not include 'Kade'`; soft `the bond on Kira's sheet: expected [ 'Kade' ] to not include 'Kade'`, `Kira's Make a Connection made Ilsa Marr: expected [ 'Kade' ] to include 'Ilsa Marr'`. Control (passes): with only Kira's NPC detected, the round creates Ilsa Marr.
- **Fix:** For a round, pass the Make a Connection entry's own line as the naming text and auto-create only a connection entity that line (or the entity's own description) names; with none named and more than one connection detected, auto-create nothing and queue them all on the draft card with the roller's `actorId` (a GM Confirm then bonds Kira). The free-flow path keeps "the first" (its narration is one move's).
- **Overlap checked:** W23 MAKE-CONNECTION-PENDING-DRAFT and MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED are free-flow; issue #340's decision and `runRoundNarrationPasses`' comment cover two Make a Connection hits in one round only. The batch auditor may meet the same capture from the round side. Not in known-issues.

#### ENT-2 VOW-REWARD-UNCLAIMED-BY-ITEM-ID → Z54
- **Class / severity:** RULES (an outcome applied more than once) / low
- **Finding:** a new bug the VOW-ID-NEVER-LANDED fix opened. Kira writes a vow on her sheet; the canonical GM's createItem hook stamps `vowSetupOffered`, then `vowId` (each `.catch(() => {})` — the known issue's premise is that the `vowId` stamp can fail) and posts the reward-choice card naming the vow by its Item id. Since the fix, the pick lands: `setSharedVowReward` finds the Item by `isVowCopy`'s `item.id === vowId` rung, and "Fuel cells" is promised on it. But the grant that pays it keeps its one-time claim on the *flag*: `grantLinkedVowReward` reads `vowId = item.flags[MODULE_ID].vowId` (undefined) and flips the reward to "granted" only `if (vowId && …)`. The status is never flipped, so the reward stays "promised" and is granted again by every later trigger: a won fight linked to the vow grants it (+2 supply, "🎁 Reward earned"), and the vow's fulfilment grants it a second time (and so would every further linked win). The function's own contract — "one-time — the status flips so a re-win can't re-grant" (`index.js:1970-1972`) — and decisions.md's "a vow whose reward was already granted … is never re-promised" are broken for exactly the vows the fix was written for; before the fix such a vow could not hold a reward at all, so nothing was granted twice.
- **Where:** `src/index.js:4774` (the claim's id read from the flag only), `:4789` (`if (vowId && …)` skips the claim); the fix's matcher `src/character/actorBridge.js:714-717`; the hook's stamps `src/session/swearVow.js:837-838`; callers `src/index.js:1984` (won fight) and `:4966` (fulfilment). The same shape, traced (not probed): Forsake Your Vow marks the reward lost with `setSharedVowReward(f.vowId, { …, status: "lost" })` where `f` is the Item's flags (`src/moves/movePipeline.js:1180-1185`) — `undefined` for this vow, so `setSharedVowReward` returns at its `!vowId` guard and the forsaken vow's reward stays "promised" (decisions: "a vow whose reward was already granted or lost (… a forsaken vow) is never re-promised").
- **Reproduced:** `tests/probes/entities/vowIdNeverLandedRewardRegranted.probe.js` (table; the reward promised through the real `setSharedVowReward('v-archive', …)`; a combat track linked to the vow won on a strong hit from the Progress Tracks panel, as `payoffFailure.test.js` drives it; then `payFulfilledVowNative`) — the reward's status after the won fight expected `'granted'`, actual `'promised'`; "Reward earned" cards expected 1, actual 2; Kira's supply expected 3, actual 5. Control passes: the same vow carrying its `vowId` flag is granted once (status `'granted'`, one card, supply 3).
- **Fix:** take the vow's id by `isVowCopy`'s rule wherever an Item's own flags name it — `item.flags?.[MODULE_ID]?.vowId ?? item.id` — at the grant's claim (`index.js:4774`) and the forsake (`movePipeline.js:1183`), so `setSharedVowReward(vowId, { status })` flips the Item the fix found; or have both write the status on the copies they already hold.
- **Overlap checked:** VOW-ID-NEVER-LANDED (known-issues, fixed in e32ff63 — its writers and `vowRewardStatuses` were switched to `isVowCopy`, this reader was not); X07 / Y27 (the no-copy close) and the #301 B02 roller-copy rule are unrelated; the payoff ledger (`fulfilPayoff.reward`) guards a fulfilment's own retry, not a grant made earlier by a won fight.

#### ENT-3 VOW-REWARD-STATUS-NO-SCOPE-THROWS → Z55
- **Class / severity:** UX (a silent no-op on a player's press) / low
- **Finding:** the VOW-ID-NEVER-LANDED fix's other reader. When *neither* createItem stamp landed — the Item then carries no `starforged-companion` flag scope at all, the state two refused `setFlag`s leave on a sheet-made vow — `vowRewardStatuses` matches the Item by its id (`isVowCopy`) and reads `item.flags[MODULE_ID].reward?.status` unguarded: a TypeError ("Cannot read properties of undefined (reading 'reward')") thrown out of `applyRewardPickFromRelay` before the card is claimed. On the relay that is a `console.error` on the GM's console only (`gmRelay`'s socket listener), so every reward pick on the card does nothing and says nothing ("No silent failures"; RELAY-REFUSED-PRESS-UNTOLD's rule) — before the fix the card was at least closed with a notice. The fix's own test models the missing stamp as an empty scope `{}` (vowSetupOffered landed, vowId did not), the one case that works.
- **Where:** `src/session/swearVow.js:659` (the unguarded read), reached from `:587`; the matcher `src/character/actorBridge.js:714-717`; the relay's catch `src/multiplayer/gmRelay.js:497-499`.
- **Reproduced:** `tests/probes/entities/vowRewardStatusNoModuleFlags.probe.js` (unit, `vowIdNeverLanded.test.js`'s setup) — `applyRewardPickFromRelay` expected `{ applied: true }`, actual `{ threw: "Cannot read properties of undefined (reading 'reward')" }`. Control passes: an empty module scope (the fix's case) sets the reward.
- **Fix:** `item.flags?.[MODULE_ID]?.reward?.status` at `:659`.
- **Overlap checked:** VOW-ID-NEVER-LANDED (fixed; incomplete here), RELAY-REFUSED-PRESS-UNTOLD (that is a refusal by ownership; this is a throw). **Same defect as the cards auditor's CARD-1** (`tests/probes/cards/rewardPickVowNoFlagNamespace.probe.js`, found independently) — keep one row; ENT-2 is the distinct sibling (the grant's claim).

#### SESS-4 BATCH-DRAFT-LOST-AUTHOR-AWAY → Z31
- **Class / severity:** LOSE-STATE / low
- **Finding:** Batch Mode. Pat submits "I slip through the maintenance shaft…" and his window, once the round shows it, clears his draft ("Sent (its draft goes)"); the action now lives only on the round entry. His browser closes (or the table simply stops for the night without End a Session). The round is then closed unresolved while he is away — a GM's End a Session, or the next world load's idle re-mint (`onCampaignStateChanged` / `recoverRound` close a collecting round of a session that is over). He is whispered "The session ended before the round was resolved, so your action wasn't rolled. Your Round window keeps it as a draft." It does not: the draft is restored only by the round setting's change hook on a client connected at the close (`registerRoundWindowHooks` → `onRoundChanged`); his page load reads a closed round's entry back nowhere, and the next round (Begin a Session) overwrites the stored one. decisions "Batch Mode" → "End a Session closes a collecting round and keeps the authors' drafts"; the help's Batch Mode page: "each window keeps the text as a draft." In the idle case every author is away when the load's mint closes the round, so every submission is lost while each is told it was kept.
- **Where:** `src/ui/roundWindow.js:688-733` (`registerRoundWindowHooks`: the draft restored only inside the `onRoundChanged` listener `:696-702`; the ready branch `:725-731` handles a collecting round only), `:367-376` (`onRoundUpdate` clears the draft on submission); the close and its whisper: `src/batch/driver.js:387-410` (`closeCollectingRound`), `:1201-1227` / `:1159-1169` (the session-ended closes).
- **Reproduced:** `tests/probes/session/batchDraftLostWhenAuthorAway.probe.js` (GM + Pat, who is not connected; the stored round holds his submitted entry; the GM's End a Session) — sanity: the round closes `session-ended` and Pat is whispered "…keeps it as a draft"; Pat opens Foundry: `expected '' to be 'I slip through the maintenance shaft …'` on his `batchMode.draft`. Control passes: Pat connected at the close — his draft comes back.
- **Fix:** restore at load too — in `registerRoundWindowHooks`' ready branch, a stored round CLOSED with `session-ended` / `discarded` / `mode-off` whose entry for this user is submitted / read / ready, with an empty draft, sets the draft (the listener's own code, factored out). Optionally have the next round's `createRound` carry nothing over, so the restore is from the closed round only.
- **Overlap checked:** batchModeLifecycle.test.js covers the connected author only; not in known-issues (Batch Mode has no open items there besides MOVE-BUSY-NOTICE's note).

#### SESS-6 PTP-CLOCK-ADVANCE-DROPS-ORACLE-MEMORY → Z17
- **Class / severity:** LOSE-PLOT (RACE) / low
- **Finding:** A Pay the Price rolls a narrative price — "A surprising development complicates your quest" (about two thirds of the table has no suffer route) — while a tension clock is running (a scene challenge's, or one the GM set). The price's card carries `oracleMemory`; on the canonical GM its `createChatMessage` queues the capture (`captureOracleResult`), which writes `{ ...cached, recentOracles: [...] }` — the whole campaignState. With no suffer route to await, the clock advance follows at once: `advanceTensionClocksForPayThePrice` writes `deepClone(readState())` plus the fill — the whole campaignState, built from the cache, which the capture's write (one round trip out) has not reached. The server applies the capture, then the advance: the clock moves and the price is gone from RECENT ORACLE RESULTS, the block that tells every later narration "the dice established these outcomes". It happens on the GM's own `!ptp`, on a player's (relayed advance), and on a move's miss (`postMovePayThePriceCard`: card, routes — none — then `advanceClocksOnPayThePrice`). The two writers each have a queue — X44's for oracle captures, W53's for clock writes — and nothing orders one against the other; rules/reachability.md §9: "Writers that must not interleave run through one queue", and "a store can lag the world by a delivery".
- **Where:** `src/clocks/clocks.js:340-358` (`advanceTensionClocksForPayThePrice` — a whole-state write from `readState()` inside `serialiseClockWrite`, `:757-761`); `src/clocks/payThePriceClocks.js:81-95`; the capture: `src/index.js:3530-3559` (`registerOracleMemoryCaptureHook` / `captureOracleResult`, its own `_oracleMemoryWrites` chain); the two callers: `src/index.js:3418-3512` (`handlePayThePriceCommand`: card `:3478`, then the relays `:3496-3504`) and `:5921-5966` (`postMovePayThePriceCard`: card `:5934`, routes `:5951`, clocks `:5958`).
- **Reproduced:** `tests/probes/session/ptpOracleMemoryVsClockAdvance.probe.js` (GM + player; every campaignState write and Actor update held and applied in the order sent; the price's d100 fixed) — for the GM's own and a player's `!ptp` on a narrative price with "Hull breach" at 1/6: sanity — the writes sent are [capture (`recentOracles` 1, clock 1), advance (`recentOracles` 0, clock 2)], the clock ends at 2; then `expected [] to have a length of 1 but got +0` on the stored Pay the Price memories. Controls pass: no tension clock (the capture stands); a routed price ("You are harmed" — its Actor write's answer lands between, and both stand).
- **Fix:** one write chain for the canonical GM's campaignState writers that read the cache: run the oracle capture through the clock queue (export `serialiseClockWrite`, or a shared `serialiseCampaignStateWrite` both use), so the advance reads the store after the capture has landed; at least have the clock writers write only `clocks` onto a fresh read (`mergeOwnedFields(state, ["clocks"])`) once the capture queue is idle.
- **Overlap checked:** X44 ORACLE-MEMORY-LOST-UPDATE (fixed) serialised two captures; W53 CLOCK-LOST-UPDATE (fixed) two clock writes; this is the pair across the two queues. persistResolution treats both fields as store-owned, so the pipeline's later write keeps the loss. Same lag class as SESS-1; distinct writer pair. **Cross-auditor:** the sweep auditor's `tests/probes/sweep/ptpOracleMemoryLostToClockWrite.probe.js` and `pipelinePriceOracleMemoryLost.probe.js` (seen in the shared tree at the end of this audit) look like the same defect — merge.

#### MP-1 BATCH-NEXT-ROUND-NOT-OPENED-AFTER-CANONICITY-MOVES → Z22
- **Class / severity:** LOSE-STATE (stall) / low
- **Finding:** Two GMs, Gina (`gm-1`, the lower id) and Gus (`gm-2`); only Gus holds a Claude key, so the keyed-GM registry makes him canonical and he runs Batch Mode. A round resolves on Gus (`resolverId: gm-2`). While he narrates it, Gina enters her Claude key (or joins already keyed): the registry now names her, so she is canonical. Her `recoverRound("keyed-gm")` leaves the round alone — "that GM is resolving it" (`resolver?.active`). Gus finishes: posts the round card, releases the lock, closes the round, and calls `openRoundIfDue("next-round")` — which returns at once because he is no longer canonical. Gina hears only the round's close, a `batchMode.round` write, which `onBatchSettingWrite` ignores (it reacts to `keyedGmUserIds` and `campaignState` only). No round opens: every Round window says "No round is open yet" and, chat being table talk, nothing in play writes campaignState to wake her — until a GM turns Batch Mode off and on, or a user (re)joins. Decision "Batch Mode" says rounds "open by themselves while a session is active … the next when a round's narration posts" (help, Batch Mode page) and that the canonical GM drives the round through "the keyed-GM registry's first write" (the createSetting rule); the canonical-GM gate in `openRoundIfDue` is right (single writer), but nothing hands the "open the next one" step to the GM who now holds it. The scope (issue #340, "The round driver") says the driver "Opens rounds when the mode turns on, when a session begins, after a round closes, and on `ready`". (Same handover also skips the round narration's capture passes on Gus — `runPostNarrationPasses` returns early off the canonical GM — but that is the free-flow pipeline's pre-existing exposure too; noted, not filed.)
- **Where:** `src/batch/driver.js:963-972` (finishRound → openRoundIfDue, gated `:352-353`), `:1170-1172` (recoverRound leaves a round its resolver holds), `:1237-1245` (onBatchSettingWrite ignores `batchMode.round` writes); the round setting's `onChange` (`:162`) only notifies window listeners.
- **Reproduced:** `tests/probes/multiplayer/batchNextRoundAfterCanonicityMoves.probe.js` — "Gina adds her Claude key while Gus narrates round 1: round 2 still opens" fails on its last assertion: expected `{ number: 2, phase: 'collecting' }`, received `{ number: 1, phase: 'closed' }` (the round card posted once, the round closed). Control "with no handover the resolving GM opens round 2" passes.
- **Fix:** in `onBatchSettingWrite`, on a `batchMode.round` write heard on the canonical GM with Batch Mode on, call `openRoundIfDue("round-closed")` when the stored round is not open (get-or-create, so the resolver's own open — when it is canonical — makes this a no-op).
- **Overlap checked:** decisions "Batch Mode" (the driver hears the registry's first write — a different hop: a keyless GM's submissions), the recovery tests (`batchModeRecovery.test.js` covers the resolver *leaving*, where the survivor becomes resolver and canonical at once); LOCK-RESURRECTED-DEPARTED-CLAIMANT / LOCK-LOST-BY-COGM-STALE-WRITE (the move lock, not the round); FORCED-MOVE-HOLD-RELOAD (held moves). Distinct.

#### MP-3 BATCH-SWITCH-OFF-KEEPS-UPGRADES → Z04
- **Class / severity:** LOSE-STATE (a roller's choice taken) / medium
- **Finding:** Kira rolls a weak hit in a round; her momentum (9) can burn it to a strong hit, so the round waits in the upgrade step for her Burn / Improve / Keep (decision "Batch Mode": "A roller offered Burn Momentum or Improve Result chooses Burn / Improve / Keep in the window"). Meanwhile the GM presses the toolbar's Batch Mode switch to stop Batch Mode after this round. `toggleBatchMode` sees a resolving round and relays `batch.sendNow` with `modeOffAfter: true`, telling the GM "the round is being resolved — Batch Mode turns off when it finishes" (help: "A round already resolving finishes, then the mode turns off"). On the canonical GM that relay is a Send now: in the upgrade step `requestSendNow` calls `keepUpgrades(null)`, so Kira's pending choice is decided "keep" for her, the card's Burn closes (`roundClosed`), the round is narrated as a weak hit and the mode turns off. Nobody is told — her window's Burn vanishes. `requestSendNow`'s own contract says "While the round resolves it only records `modeOffAfter`"; that holds while it rolls or narrates (it returns `reason: "resolving"`), not in the upgrade step, where the switch takes a player's Burn Momentum decision. The scope (issue #340 defaults) is explicit: "Turning the mode off mid-round … While resolving, the round finishes, then the mode turns off", and the lifecycle ends the upgrade step only when "each offered roller has chosen, or Send now (Keep), or the roller left (Keep)" — the switch is none of these.
- **Where:** `src/ui/roundWindow.js:639-643` (the switch on a resolving round relays Send now with `modeOffAfter`), `src/batch/driver.js:579-590` (`requestSendNow`: `modeOffAfter` recorded, then the UPGRADING branch keeps every undecided upgrade), doc `:566-573`; `src/batch/relay.js:227-237` (`applyBatchSendNow` forwards the flag, no distinction).
- **Reproduced:** `tests/probes/multiplayer/batchToggleOffForcesKeep.probe.js` — "Kira still chooses: the switch records mode-off-after and the round waits for her": `expected 'keep' to be null` (the round's entry decided "keep" by the switch). Control "the GM's notice says only that the mode turns off when the round finishes" passes.
- **Fix:** the switch's relay for a resolving round asks only for mode-off-after (e.g. `batch.sendNow` with `modeOffAfter: true, keepWaiting: true`, or a `batch.modeOffAfter` kind): `requestSendNow` records the flag and returns without `keepUpgrades` unless the GM pressed Send now itself (the window's "Send now (keep the rest)", or the collecting-round dialog's "Send now, then turn off").
- **Overlap checked:** decisions "Batch Mode" (Send now counts as Keep — the GM's explicit Send now, not the switch), `batchModeLifecycle.test.js` "turning Batch Mode off mid-round" (collecting rounds only), the `batchModeTable.test.js` upgrade tests (Send now pressed in the window). Round logic is the batch auditor's; filed here as the relay's payload semantics (`batch.sendNow` carrying two intents) — dedupe if both found it.

#### MP-4 ROUND-WINDOW-GM-BANNER-STALE → Z33
- **Class / severity:** UX / low
- **Finding:** The Round window's banners say whether a GM — and a GM with a Claude key — is connected (`roundView.js:37-38`), read live at render (`roundWindow.js:152-153`). The window re-renders only on a round change, the switch, the draft, or a `campaignState` write (`registerRoundWindowHooks`, `:689-731`; `onCampaignStateForWindow` `:736`) — never on `userConnected` or a `keyedGmUserIds` write. (a) The GM's browser drops mid-collect: no player's open window says "No GM is connected"; a player who submits learns it only from the refusal. (b) The GM reloads and comes back: a GM's ready writes campaignState only for a stale lock or a new session (`index.js` "With nothing to write … nothing is written"), so every window that showed it keeps "No GM is connected — your action is kept here, and is sent once a GM joins" while the GM is there. That banner's promise is false besides: an action submitted while the GM was away was refused (`requestGmAction` "no-gm"; the window's own failure line says "try again once a GM has joined"; the scope, issue #340 "Relay kinds": "With no GM connected, `requestGmAction` warns and the window says the action wasn't saved"), and nothing re-sends it when a GM joins — a player who trusts the banner waits, and the round goes on without them (silently — "opting out is silent").
- **Where:** `src/ui/roundWindow.js:689-740` (no presence / registry hook), `:58` vs `src/batch/roundView.js:37` (the two contradicting lines).
- **Reproduced:** `tests/probes/multiplayer/roundWindowGmPresenceStale.probe.js` (the harness; Pat's window opened by the round, its renders recorded) — "the GM leaves: Pat's open window says no GM is connected": `expected [] to include 'No GM is connected — …'` (no render followed); "the GM comes back: the banner goes": `expected [ Array(1) ] to not include 'No GM is connected — …'` (no render after the join). Control "rendered now, with no GM connected, the window says so" passes.
- **Fix:** in `registerRoundWindowHooks`, refresh the window on `userConnected` and on a `keyedGmUserIds` `createSetting` / `updateSetting`; and say what is true in `noGm` — "No GM is connected — your draft is kept here; submit it once a GM joins" (or re-send a pending submission on `onGmRelayReady`, the Private Lines' pull).
- **Overlap checked:** the batch view tests pin the banner text for a given context (`batchRoundView.test.js:111`), not that the window follows the table; MP-2 is the same "a state shown only at render" shape in the Private Channel; "No ack channel" (accepted) is the relay drop, not the banner.

#### MP-5 BATCH-UPGRADE-WAITS-FOR-DEPARTED-ROLLER → Z26
- **Class / severity:** LOSE-STATE (stall) / low
- **Finding:** Pat confirms Kira's action, then his browser closes before the round resolves. The round does not wait for him — `readyToResolve` counts only connected participants (`round.js:523-529`: "it doesn't wait for one who disconnected") — so Quinn's confirm resolves it, and Kira's confirmed move is rolled (her entry is in `round.order`). Her weak hit offers a burn: `upgradeOffers` / `beginUpgrades` (`driver.js:813`, `round.js:652`) offer it to every acting roller, connected or not, and the round waits in the upgrade step for Pat. The round's lifecycle says the step ends when "each offered roller chose; Send now = Keep; **the roller left = Keep**" (`round.js:18`), but the driver keeps a leaver's upgrade only when they leave *during* the step (`onUserConnected` → `keepUpgrades([user.id])`, `driver.js:1263-1265`); Pat left before it, so nothing keeps it. (Issue #340's lifecycle table says the same: the upgrade step is left when "each offered roller has chosen, or Send now (Keep), or the roller left (Keep)", and a round "doesn't wait for a participant who has disconnected".) The round sits "Deciding upgrade" — every window says "The round is being resolved…" — until a GM presses Send now (the GM's window does list "Waiting for: Kira", so it is recoverable) or Pat returns.
- **Where:** `src/batch/driver.js:556-559` (UPGRADING waits on `upgradesSettled` only), `:813-826` (offers to disconnected rollers), `:1249-1271` (Keep only for a leave during the step).
- **Reproduced:** `tests/probes/multiplayer/batchUpgradeWaitsForDepartedRoller.probe.js` — "Pat confirms, then drops before the round resolves: the round does not wait for his Burn": `expected 'upgrading' not to be 'upgrading'` (Kira's weak hit rolled, the round waiting for the absent roller). Control "Pat leaves DURING the upgrade step — his Burn is kept for him and the round is narrated" passes.
- **Fix:** when the upgrade step begins (`beginUpgrades`, or the advance pass's UPGRADING case), keep the upgrade of every offered roller who is not connected (`keepUndecidedUpgrades(r, { userIds: disconnected })`) — the same Keep a leave during the step gets.
- **Overlap checked:** decisions "Batch Mode" (opting out is silent; Send now counts as Keep), `batchModeRecovery.test.js` (the *GM* leaving), the `batchModeTable.test.js` upgrade tests (a connected roller). Round logic is the batch auditor's too; filed here as the disconnect handling.

#### UI-2 BATCH-OFF-DURING-UPGRADE-FORCES-KEEP → Z04
- **Class / severity:** RULES (a player's Burn/Improve choice taken) / medium
- **Finding:** A round's roller has a weak hit with momentum 9 to burn; the round is in the upgrade step, waiting for their Burn / Improve / Keep in the Round window. A GM presses the toolbar's Batch Mode switch to turn the mode off. `toggleBatchMode` sees a resolving round and, with no dialog, relays `batch.sendNow` with `modeOffAfter` for every resolving phase — and during the upgrade step Send now "counts as Keep" (`requestSendNow` → `keepUpgrades(null)`). The roller's decision is recorded as Keep, the result card's Burn is closed (`roundClosed`), the round is narrated as the weak hit, and the mode turns off. The GM was told only "the round is being resolved — Batch Mode turns off when it finishes." Should: the switch only records `modeOffAfter` while the round resolves and the round finishes as it would — issue #340: "While resolving, the round finishes, then the mode turns off"; its state table leaves `upgrading` only when "each offered roller has chosen, or Send now (Keep), or the roller left (Keep)"; the help: "A round already resolving finishes, then the mode turns off" and, of upgrades, "The round waits for them"; `toggleBatchMode`'s own comment: "Off while a round resolves: it finishes, then the mode turns off". Send now is the GM's explicit choice elsewhere; here the GM never chose it. (`requestSendNow`'s comment: "While the round resolves it only records `modeOffAfter`" — true for rolling/narrating, not upgrading.)
- **Where:** `src/ui/roundWindow.js:638-642` (`toggleBatchMode`: `isResolving(round)` → `requestGmAction("batch.sendNow", { …, modeOffAfter: true })`), `src/batch/driver.js:579-589` (`requestSendNow`: marks `modeOffAfter`, then UPGRADING → `keepUpgrades(null)` + advance); help `src/help/helpJournal.js:51` (Batch Mode page, "Turning it off").
- **Reproduced:** `tests/probes/ui/batchModeOffDuringUpgradeForcesKeep.probe.js` (simulated table, GM + 2 players; the GM's real `toggleBatchMode` on their client) — `round().entries['pl-1'].upgrade.decided`: "expected 'keep' to be null" (the switch was heard: `modeOffAfter` is true). Control passes: before the switch the round is `upgrading`, the upgrade undecided with a strong-hit burn preview, no narration.
- **Fix:** while resolving, the switch marks `modeOffAfter` without sending — a separate relay (e.g. `batch.modeOffAfter`, GM-only, `queueRoundWrite(markModeOffAfter)`) or `requestSendNow({ modeOffAfter, sendNow: false })` that skips `keepUpgrades` / `advanceRound`; the round closes and the mode turns off when the last roller decides (or leaves, or a GM presses Send now).
- **Overlap checked:** decisions.md #340 ("the round waits for them, Send now counts as Keep"; no word on the switch during upgrades); issue #340 §"Turning the mode off mid-round" and the phase table; `batchModeLifecycle.test.js` covers the switch only while collecting (send / discard / cancel), `batchModeTable.test.js` Send now during the upgrade step. No known-issues row. Not a tenth-audit row (new code). **Same finding as BATCH-9 MODE-OFF-FORCES-KEEP and MP-3** (the lead's ledger merges them).

#### UI-10 ROUND-READ-FAILED-EMPTY-BOX → Z31
- **Class / severity:** LOSE-STATE (UX) / low
- **Finding:** A player submits an action in the Round window; the round shows it ("Sent") and the window clears the draft by design (`onRoundUpdate`: the pending submission is acknowledged → `#setDraft("")`). The canonical GM's reading then fails — a Claude error, an overloaded or rate-limited key (a round fires one interpreter call per player at once, on one key) — and the driver records `readingFailed`: the entry keeps its text and status, plus `error`. The window shows "Couldn't read your action — try again." and switches back to the action box (`writing` is true for an entry with an error) — but the box holds the cleared draft: empty. The submitted text is not shown (the quote renders only for a non-writing entry), no Edit is offered in writing mode, and Submit with an empty box does nothing. "Try again" means retyping the action from memory; the round still holds it (`entry.text`). Should: the box offers the submitted text back (decisions.md #340: the window is where the player confirms or edits their action; the help: "Text you haven't submitted stays in your browser as a draft" — here the window drops text it was given).
- **Where:** `src/ui/roundWindow.js:367-376` (`onRoundUpdate` clears the draft on acknowledgement), `:259` (`writing` includes `own.error`), `:263` (the submitted text quoted only when not writing), `:266-272` (the box renders `context.draft`); `src/batch/driver.js:464` (`readingFailed`), `src/batch/round.js:366-369`; `src/batch/roundView.js:41` (`readFailed`).
- **Reproduced:** `tests/probes/ui/roundWindowReadFailedEmptyBox.probe.js` — after the reading fails, the box: `expected '' to be 'I splice the lift controls and ride i…'`. Controls pass: the draft is cleared on acknowledgement and "Reading your action…" shows; after the failure the window says "Couldn't read your action — try again." and the round's entry still holds the text.
- **Fix:** when the viewer's entry has an error and the draft is empty, put `own.text` in the box (render `context.draft || own.text`, or `#setDraft(entry.text)` in `onRoundUpdate` when the entry gains `error`); the same submission id then re-submits as a new one through Submit.
- **Overlap checked:** issue #340 test 23 ("A reading fails: the entry says … try again, and the round isn't wedged") — the window's text is not covered; `roundWindow.test.js` has no failed-reading case. New code. **Same finding as BATCH-5 (a) UNROLLED-ACTION-TEXT-LOST** (the batch auditor's row also covers (b), an entry the round resolved without) — merge into BATCH-5.

## Refuted rows as filed

The one row the refuter pass refuted (see the report's "Excluded"); its probes were dropped.

#### PIPE-2 ROUND-ROLL-CLARIFY-DIALOG → refuted
- **Class / severity:** UX (lock held across an interactive wait) / medium
- **Finding:** A Batch Mode round rolls its entries through the shared `rollMove`, which — after the dice, the outcome's effects and the Pay the Price card — resolves the narrator's relevance and, for a hybrid move's hit with an implicit reference, awaits `ClarificationDialog.prompt` ("Who are you interacting with?") on the client running it. Face Danger and Secure an Advantage (and their scene-challenge variants, Swear an Iron Vow, the vow and expedition moves) are hybrid (`src/schemas.js:113-147`), so any such hit that refers to someone without a name — "I talk him down before he raises the alarm" — does it. Scenario: Batch Mode on; Kira submits that line, confirms it in her Round window, Ren passes; the round resolves on the canonical GM: `startResolution` claims the move lock, `rollRound` → `rollEntry` → `rollMove` → the dialog opens **on the GM's screen**, mid-round, with the move lock held and the round in `rolling`. Until the GM notices and answers it, nothing narrates, every window shows the round resolving, and every free-flow move (in Batch Mode, a non-participant's card move) is held or refused at the lock. Should: no GM dialog during a round, and no interactive wait under the round's lock — decisions.md, Batch Mode: "The player confirms the reading in their own window … No confirm dialog opens on the GM's screen during a round" and "The move lock is claimed for the rolls and again for the narration … (an interactive wait never holds it)". The round moved every other pre-roll question (target pick, abilities, stat swap) into the player's window; this one was missed because it lives inside `rollMove`.
- **Where:** `src/moves/movePipeline.js:1239-1257` (`resolveRelevance` → `if (relevance.needsClarification)` → `await ClarificationDialog.prompt(...)` inside `rollMove`); the round's caller under its claim: `src/batch/driver.js:607-645` (`startResolution` claims, `rollRound(lock.claim)` at `:630`, the release in its `finally`), `:656-696` (`rollRound` → `rollEntry` at `:685`), `:747-753` (`rollEntry` → `rollMove`); `src/context/relevanceResolver.js:295-322` (a hybrid hit with no name match → `needsClarification: true`).
- **Reproduced:** `tests/probes/pipeline/roundRollClarifyDialog.probe.js` (batch setup copied from `batchModeTable.test.js`; `resolveRelevance` mocked to the implied-entity answer, `ClarificationDialog.prompt` mocked to record its client and hold) — (1) `expect(control.prompts).toEqual([])` → "expected [ { client: 'gm-1' } ] to deeply equal []" (sanity: `round().phase === 'rolling'`, `world().pendingMove === true` while it waits); (2) with the GM not answering: `expect(narrations()).toHaveLength(1)` → "expected [] to have a length of 1 but got +0" (the round never narrates). Controls pass: answered, the round narrates once, frees the lock and opens round 2; with the mode off, the typed move asks on the GM (the decided free-flow pre-narration step).
- **Fix:** Give `rollMove` a `clarify` option (default the dialog) and have the round pass none — resolve the reference without asking (the dialog's own close path: `{ kind: 'none' }` → embellishment) — or ask it at reading time in the player's window as the round's other choices are (`readMove` with `gatherChoices` can run `resolveRelevance` on a hit's assumption, or the reading stores "needs clarification" and the window offers the entity pick).
- **Overlap checked:** known-issues CLARIFY-ON-GM ("the GM answers it, not the player who moved" — free-flow; open) — this is that dialog in the round, where the batch decision forbids a GM dialog and an interactive wait under the lock; decisions.md "Move-concurrency lock covers narration + persistence, not post-roll prompts" accepts pre-roll dialogs holding the lock **in free-flow** ("the move's own expected confirm step, at the start, where a cancel releases the lock immediately") — in a round the wait comes after other entries rolled and recorded, and its cancel does not release the lock. No batch test or doc mentions the clarification. **Same row as the continuity auditor's CONT-5 ROUND-CLARIFY-ON-GM** (found independently) — merge.

#### CONT-5 ROUND-CLARIFY-ON-GM → refuted
- **Class / severity:** UX (RACE) / low
- **Finding:** Batch Mode is on. Kira submits "I talk him down before he fires." in her Round window; it reads as Face Danger (a hybrid move), she confirms, Ren passes, the round resolves. The reading (`readAction`) never resolves the narrator's relevance — the roll stage does: `rollEntry` → `rollMove` on the canonical GM, under the round's move lock. On a hit with no recorded name in the line, `resolveRelevance` asks the Haiku classifier; an implied reference ("him") sets `needsClarification`, and `rollMove` awaits `ClarificationDialog.prompt` — the "Who are you interacting with?" dialog opens on the GM's screen, mid-round, about a player's line, with the move lock held; the round stays "resolving" for every player until the GM answers it, and a round with several such entries asks once per entry. Face Danger and Secure an Advantage are the commonest moves and both are hybrid. What should happen: decisions.md "Batch Mode" — "The player confirms the reading in their own window … No confirm dialog opens on the GM's screen during a round" (rejected: "The confirm dialog on the GM's screen during a round — the GM would confirm every player's reading; the player knows what they meant"), and the move lock "is free while a roller decides … (an interactive wait never holds it)". The round's narration already unions each entry's relevance at the widest class (`narrateRound`), so a round can roll without the question.
- **Where:** `src/moves/movePipeline.js:1239-1256` (`rollMove`'s relevance step — `:1252-1256` the dialog), reached from `src/batch/driver.js:685` → `:747` (`rollEntry` → `rollMove`) inside `startResolution` / `rollRound`'s lock claim (`:608`, `:659`); `readAction` `src/moves/movePipeline.js:457-487` reads no relevance; the dialog `src/world/clarificationDialog.js:70-80`.
- **Reproduced:** `tests/probes/continuity/roundClarifyOnGm.probe.js` (the multi-client table; the real round driver, relays, `rollMove` and `resolveRelevance`, the classifier answered at the fetch boundary; the dialog itself replaced by a recorder that answers "No specific entity" at once and notes the client and the stored lock). Fails: `clarification dialogs opened during the round: expected [ 'gm-1' ] to deeply equal []`; soft `the move lock held while the GM was asked: expected [ true ] to deeply equal []`. Control (passes): the classifier finds no implied reference — the round rolls and narrates with no dialog.
- **Fix:** In a round (`cardFlags.roundId` set), skip the clarification and keep the resolved class (the round narrates every entry's relevance at the widest class anyway); or, in the decision's own shape, resolve relevance in `readAction` and show the question in the player's window with the reading, storing the pick on the reading. The first is one condition at `movePipeline.js:1252`.
- **Overlap checked:** CLARIFY-ON-GM (known-issues, open: the dialog is answered by the GM, not the mover — free-flow) is the same dialog; this row is its Batch Mode instance, which the 2026-11 Batch Mode decision rules out in so many words, and which also holds the round's move lock across the wait (the decision's "an interactive wait never holds it"). If the lead folds it into CLARIFY-ON-GM, the decision text is the new part.
