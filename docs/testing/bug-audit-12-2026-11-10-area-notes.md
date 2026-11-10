# Twelfth bug audit — area notes

What each auditor and finder checked and found sound, and what each suspected but could not reproduce ("not probed"), as they filed it — the companion to `bug-audit-12-2026-11-10.md`. A suspicion here is not a finding.

## Round 1

### Batch Mode (BATCH)

**Checked, no defect.** round.js transitions; relay handlers; Z05; Z29; Z30; Z31; Z34; Z06; Z26/Z27; Z19/Z20; ROUND-LOCK-WAIT-MARKED-LATE / ROUND-WAIT-AFTER-REFUSED-CLAIM; Z22; Z23/Z24; canonical-GM change mid-round; D2; D3; Z08/Z09/Z10; ROUND-DETECTION-NULL-MOVE; ROUND-CHARACTER-BLOCK-GONE-PC; buildRoundUserMessage; repeat clicks.

**Not probed.** burned Battle/Clash whose price stands narrated without it (oracleSeeds:null burnMomentum.js:695; also free-flow); roller presses Burn then disconnects mid-handler → keepUpgrades ignores "being burned"; Edit on a card-move entry overwrites unsent draft (sibling of BATCH-2); mode-off held-move whisper says "joins the next round"; beginResolution doesn't re-check readyToResolve (sub-second); progress list shows pre-upgrade outcome until narration (cosmetic); Discard via toolbar dialog says "Batch Mode was turned off" (cosmetic); capture skipped after GM change mid-narration; held moves lost on canonical change (FORCED-MOVE-HOLD-RELOAD).

### The pipeline after the roll, upgrades, suffer moves and rules fidelity (UPG)

**Checked, no defect.** move outcomes vs vendored text (all core + scene-challenge variants); burn eligibility; roll rules (negative momentum cancel, cap 10, TDA bad-spot downgrade); rewards/legacy by rank; cleared legacy track rolls as 10; bonded DYR +rank; Z46, UPGRADE-RETRY-REWIND-NO-SUPERSEDE, Z47, Z48, Z51, Z52, Z53, D1, D4 burner, Z28; move lock fixes; write chain in area.

**Not probed.** Brawler/Heavy Cannons/Demolitionist free post-roll Improve (W13 decided); held forced move on a refused claim dropped (accepted test); refused early lock release with rider prompt open; Companion Takes a Hit uses healthiest companion (documented heuristic); wounded/shaken meter caps (health 4, spirit 3) unconfirmed; applyMomentumBurn().newMomentum dead field; burned Make a Connection re-narration no oracle seed; progress move with no track (deliberate); Fugitive with full clock; Forsake card no "done" control.

### Cards, vows and bonds (CARD)

**Checked, no defect.** Z54, Z55, Z59, D5 (by-name gaps → CARD-3), Z56, Z57, Z58, FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY, Y25, one-shot buttons claim before effect, bond.apply validation, won-fight reward to holder, ranks.

**Not probed.** namesake winner (B02 rejected linkedVowId); 🤝 Deepen race; new bond Items start stale on confirmDraft exists path; refused forgeBond still pays legacy; won-fight ⚑/🤝 documented "any user may click"; simultaneous sheet+pipeline forge pays bonds legacy twice. Harness pitfall: tests/setup.js makeTestActor find/filter/size close over a copy of contents.

### Fact continuity and the X-Card (CONT)

**Checked, no defect.** Z12 token restore; Z41; Z42; Z43/Z44/Z45; scene end during X-Card/strike fixes; list caps (blocked 50 newest, narrated 50, kept strikes 20); Batch rounds (narrateRound fresh workingCopy — CONT-1 n/a); paced narration X-Card during call discards; rolling summary regen spanning an X-Card discarded; relayed side-data of X-carded narration dropped; CORRECTED/leave-out never name X-Card retraction.

**Not probed.** pause landing after a scene end (accepted); X-Card at the start of the next session (session-scoped by design); xCardedAt on emptied summary has no reader (cosmetic); GM deleting an NPC card outside the X-Card; X-Card removes too much (errs safe); "◈ Identity revealed" card stays; location stamp from a removed frame.

### Narration and context (NARR)

**Checked, no defect.** Z02, Z13 (name-keyed dedupe would dup a renamed record; nothing renames), Z40, Z49/Z50, Z36, CACHE-MUTATED-BEFORE-WRITE, RECENT ORACLE RESULTS (store, last 5 per session, ring cap 8), ledger budget never-dropped tiers, sections by mode, recap cache by chronicle hash, X-Card redirect on chain, round capture code, narratorDebug.

**Not probed.** clock vignettes run no capture (intent undocumented); paced line under active X-Card spends the classifier and posts nothing (UX); !recap session N for older sessions misses paced/@scene/oracle/vignette cards (no sessionNumber); refused narration card post after sidecar applied; routePacedInput clones preState read before the classifier await; !truth strike during summary Haiku call overwrites regen mark; !narrator debug shows background campaign-recap refresh as last narration; concurrent narrations overwrite sceneState/spotlight (accepted no-baseline merge).

### Entities, portraits and characters (ENT)

**Checked, no defect.** Z60 completeListedEntity; Z61; Z62; FACTION/CREATURE-PAGELESS adoption; REGEN-LINK-REFUSED; per-client first-portrait slot; findEntityPortrait; ART-INDEX chain; D3 draftConfirmPick/draftBondHolder; Z43/Z44; Z45; NPC filtering; registerUnlistedEntityActors; player panel actions relayed or told.

**Not probed.** regeneration while entity deleted (REGENERATE-PORTRAIT-ORPHAN family widened); cross-type duplicate at Confirm; panel lock/pin toggles cancel out; Dismiss vs Confirm race; updateDraftCard partial write; ConnectionSchema playerVisible no writer/reader (doc drift); dismissed names hide existing entities from relevance index; faction stances only three mapped written.

### Sessions, clocks, sectors and truths (SESS)

**Checked, no defect.** Z01 sessionActivity; Z14/EXPEDITION-STAMP-SITE-NAME; Z15; Z16; Z63; Z64; Z65; D6; D7 and ARRIVAL fixes; Begin/End ordering through the relay queue; clock writers on chain; custom oracles; Campaign Start Phase 4; quickstart re-run documented; a move's write reverting sectors = documented trade-off.

**Not probed.** End interrupted by GM reload never writes the Session Log entry (same root as SESS-1); !truth strike after End marks summary regen but keeps text → mint keeps struck fact in LAST SESSION (same root SESS-1); selectEndSessionNPC step 3 can pick the sector-trouble threat as featured NPC (cosmetic); inferShipPosition active-sector preference only for full-name namesakes; custom oracle id "yes" unrollable (cosmetic); relay during canonical GM's world loading dropped silently.

### Multiplayer and shared state (MP)

**Checked, no defect.** campaignStateChain.js handoff/jumped waits/10 s bound/failure; every chained task returns/awaits its write; ~60 call sites, no chained task awaits another chained writer; literal key so the sweep is complete; reads outside callbacks are owned-field merges by design except MP-3; sectors/currentLocation overwrite documented trade-off; X-Card pause/resume; restoreLockOverCarriedBackClaim; gmGate isCanonicalGM/hasKeyedActiveGM/isAudioGM; registry healing; gmRelay handlers; refusePress per dispatch; claimed handlers idempotent after re-arm; requesterId documented trust model; sharedLegacies/sharedSupply; speaker/commandRouting; Private Channel transcript; audio D8/D10/Z67.

**Not probed.** two GMs loading at once drop each other's privateLines entry; keyed co-GM audio never caches own clips (AUDIO-KEYED-NONCANONICAL-DUP/D10); D8 legit player cards lose Play once a keyed GM connects (judged intended); shared legacy sheet edit during mirror writes; pause built from a stale cache lacking an in-flight sidecar persist; published reflections can cross another player's Private Lines (privacy decision); same queue as MP-2 for !truth strike / !state / Take a Break.

### Panels, settings, help and docs (UI)

**Checked, no defect.** Chat Commands table vs CHAT_COMMAND_ROUTES; Settings Reference vs 88 registrations; every panel-saved key has a reader except UI-3; lang/en.json empty by design (W84); module.json compat; MoveConfirmDialog and ✕ confirm settle on close; player writes relayed or warned; refresh hooks on Clocks/Progress Tracks/Chronicle/Session panel/toolbar; help pages touched by #342 fixes match.

**Not probed.** file-structure.md:310 WJ panel "history accordion, entity links" (nit); open Settings panel doesn't refresh on another GM's change, stale Save writes every field back; custom instructions textarea unescaped (implausible input); GM's Chronicle panel opens only their resolved PC; ⬡ roll disabled at 0 ticks (scene challenge whose clock fills first can't be finished from the panel); First Session tip "re-run ✦ Finalise" vs Regenerate flavour; mid-cycle build keeps stale help; README "request a re-interpretation" decided; wording nits.

### The lead's sweep (SWP)

- SWP-1 PROGRESS-TRACKS-JOURNAL-BY-NAME (LOSE-STATE, low) — tests/probes/sweep/progressTracksJournalByName.probe.js (2 fail, 1 control passes)
- SWP-2 WORLD-JOURNAL-BY-NAME (LOSE-PLOT + PRODUCED-BUT-DEAD, low/medium) — tests/probes/sweep/worldJournalByName.probe.js (2 fail, 1 control passes)
- type === 'character' checks outside actorBridge (index.js:2636 connection seed — connectionNeedsSeed filters PCs; entityExtractor isPlayerCharacterName excludes entityType; migrator.js:594 excludes entityType; migrator.js:748 backfill pins sheet on PCs and NPC cards by design)
- game.user.character uses: progressTracks.js:718 catch-fallback only; speaker.js resolveUserActorId filters to PCs; round.js participantsFrom uses characterId with PC map
- busy flags: roundWindow #send (finally), sectorPanel finalize (finally), private-channel app busy (finally — owned by MP)
- legacyTracks.js arithmetic vs Earn Experience (2 XP/box, 1 after clear; overflow; frozen-40 legacy record) — correct
- sharedSupply.js — canonical-GM single writer, mirror option, newest-wins queue, per-PC refusal told
- nativeProgressRoll.js — progress roll outcome (score must beat each die; ties miss) correct; classification
- combatTracker.js — badges gated (GM / own PC relayed), position canonical on track; createCombatTrackFromThreshold's first-PC fallback for a null actorId is the documented GM / one-PC exception (decisions.md "Multiplayer attribution")
- interpreter.js move reference vs the rules (stats per move, heal situations, Overcome Destruction on bonds legacy) — correct; in_control directive omits Face Defeat but constrainMoveToPosition passes it through (cosmetic, not filed)
- repair.js points table and spend costs vs the vendored Repair move text — match
- campaignStateChain.js — read for verification (MP owns it)
- batch/driver.js queueRoundWrite — its own serialized chain (no 10 s bound; a never-answered write would hold it, not filed)
- system/chatHooks.js render dedupe; system/campaignTruths.js (UNWIRED known: CAMPAIGN-TRUTHS-UNWIRED)
- shipMapScene / !shipmap — GM-only, rebuild deletes the old scene first, idempotent find by flags
- Module card flags written with no production reader (scan: ~60 marker keys like trackGoneCard, narrationKind, sceneText, oracleTableId): informational card markers read by tests / Quench — not filed
- Other journals by name: telemetry, API transaction log, error log, help journal (diagnostic / regenerated — not filed); art storage (V25 fixed with the flag scan fallback); truths (Z16 fixed)

## Round 2

### Fix regressions — the pipeline, upgrades, cards and the move lock (R2P)

**Checked, no defect.**

- Read git diff 8a4ae3b..22bdbeb for src/index.js (all hunks) and every file in src/moves/ (bondCommand, burnMomentum, cardActions, consequenceRiders, improveResult, interpreter, movePipeline, nextMoveAdd, persistResolution, resultUpgrade, sceneChallenge, statEnrichment, sufferCard, sufferDialog, sufferExecutor) against known-issues lines 14-262 and the issue #342 decisions.
- Free-flow lock: onMessage now claims through claimPendingMoveLock on the chain. _moveLockClaimInFlight is set before the chained claim and cleared in its finally on every outcome (claimed, busy-at-turn, refused). isMoveLockFreeHere feeds the driver's moveLockFree. The releaseTried/lockReleased retry logic covers the early release, a stop before it, and the finally. postMoveLockNotReleasedCard fires once, on the canonical GM, and its 'reloading frees it' holds: the ready reset runs as canonical, or the W25 handover runs when that GM disconnects. restoreLockOverCarriedBackClaim re-reads the store at its turn. Concurrent drains are safe: a drained move that meets an in-flight claim is re-held at the front. The working copy read before the claim is detached exactly as before. persistResolution keeps the lock fields store-owned. consumeForceMove is on the chain.
- None of the chained tasks in my lens awaits another chained write: claim, release, put-back, consumeNextMoveAdd/consumeNextMoveBonus/grantNextMoveBonus, persistResolution, forgetRevertedPrice, writeLegacyTicks, applyBondEffects, the payoff arrival Retry, !at, !sector, the ready session start, the truths link and the oracle capture. Each reads the store at its turn with no await between the read and the write.
- Z52 consumeNextMoveAdd: it runs after every rollMove 'not rolled' guard, rollMove has no refusal after it, and the claim is store-first.
- Z11: postMovePayThePriceCard stamps resolutionId, recordOracleResult keeps it, and dropOracleResultsOf drops it. forgetRevertedPrice is gated on the canonical GM, and Burn/Improve relay to the canonical GM (relayCardButtonClick).
- D4: the hop sacrificeResources → markUnprepared alliesMarkedIds → dispatchPayThePriceSufferRoute → ptpMeterReceipts marks → unpreparedMarksToClear is wired. The burn reverts before its meter step; currentMomentum stays valid because a burn refunds no momentum and clearing an impact only raises the maximum.
- Z46 and UPGRADE-RETRY-REWIND-NO-SUPERSEDE: the return shapes of revertTensionClocksForBurn and revertVowClocksForBurn match vignetteClockId; vowClocksUntriggered is correct; upgradeStepRecord carries kind/vowId/pcIds; the 'unprepared' step validates and retries.
- Z47 and Z28: `upgraded` propagates through executorOpts into postSufferChoiceCard, postResistRoll and the sacrificeResources redirect. Cards posted from the upgraded outcome's own choice card are unbound, so no pick is falsely refused as 'superseded'.
- Z48 resolveActor: a burn state always carries actorId. Z51 keptPriceMomentum reads the overflow receipt.
- Z56: cardRollerPc runs in applyConnectionSuggestion; the picker carries actorId into applyConnectionPick; it is the only producer of connection pickers.
- Z58: tellRecommitOutcome's reason/why table matches performRecommit, performVowRecommit and performBondRecommit; there is no second card for vow-completed; it runs once, in the relay handler.
- Z07, Z39 and PACED-VARIANT-ROLL-ENDED-CHALLENGE: moveOutsideSceneChallenge's trackId comes only from scene-challenge ids; suggestedTargetId is produced only for variants.
- Z14 ordering: applyOutcomeEffects runs before the finish completes the track, so expeditionSiteActorId still finds it. selectExpeditionSite and revealSectorSite share selectSectorSite with siteDisplayName.
- Z15: location records carry sectorId, so the active-sector preference works; currentLocationForEntityId and inferShipPositionFromEntityId agree on type.
- Z54 and Z59: vowCopyId and isVowCopy key the reward claim, the forsake loss, setSharedVowReward, payoffVowCopies and the payoff claim key consistently.
- Z57: setBondItemForged is called inside forgeBond, so every caller mirrors.
- D1: isOptionAvailable and anySufferBlocked. D2: owedMove has a single producer (sufferDialog's resist post) and a reader (offerForcedMove).
- Retired names (isNewSessionStart, takeNextMoveAdd, clearPersistedNextMoveAdd, getSessionGapHours, optionSuffers) have no callers left in src, docs, help or rules. Every new flag or field has a reader or is a card marker.

**Not probed.**

- Z28's redirect picker is posted upgraded:true in free-flow when a Burn lands while the GM's rider prompt is open, so the superseded outcome's rider cost is accepted (before Z28 it was refused). This is a narrow race inside an accepted trade-off: decisions #313 says the upgraded outcome's riders still run only for the rolled outcome.
- restoreLockOverCarriedBackClaim is now chained. A later move's release queued ahead of the put-back nulls _heldMoveLockClaim, the put-back no-ops, and the spent claim stays in the store until the next campaignState write re-triggers the restore. It heals itself on that write and needs a co-GM's stale write inside a release's queue wait.
- An X-Card pause built while a free-flow claim is in flight takes the lock back. Documented trade-off: 'a chained write already sent … the pause takes back its change'.
- Held forced moves are stranded on the old canonical GM when a lower-id GM joins, because the drain refuses on a non-canonical client. Same class as FORCED-MOVE-HOLD-RELOAD.
- Waiting on the chain (bounded at 10 s) widens the 'A move is already being resolved' window: MOVE-BUSY-NOTICE, already known.
- A drained held move loses `batchReleased`, so a non-participant's move handed back by a round can be held again by the driver while the next round resolves. It still runs later, so nothing is lost.
- ARRIVAL-LOCATION-PHRASE-SPLIT: a destination phrase that names a known place the crew is not going to ('the void beyond Bleakhold') now also moves CURRENT LOCATION there; the ship's word scan already docked there before the fix. Depends on the model's free text, and decisions.md says 'an arrival's two stores agree'.
- The prefix rung ('port' → Portent) is the decided ARRIVAL-FRAGMENT rule, so not filed.

### Fix regressions — narrator memory, entities and art (R2M)

**Checked, no defect.**

- Z42 lift (chatCommands !truth set): the kept strike is dropped from the store inside persistSceneLedgerFields' onto callback at the write's turn, only while the store holds the same scene. Lore is restored by the kept truthId. A player's set over a GM strike is refused because kept entries now carry retractedBy/asserter. Label matching still finds kept strikes after promoteTextSubject or demoteEntitySubject.
- XCARD-RETRACTION-SCENE-SCOPED and XCARD-AFTER-STRIKE-STILL-NAMED: the blocked list is deduped by subject+fact and capped at the newest 50. Nothing renders it: CORRECTED and the summary's leave-out list read only facts. loreRetractionHolder reads it, and setTruth's lift leaves it out.
- XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED: the narrated list keeps live narration truths only (not GM or player sets, not superseded ones). Its cap of 50 newest keeps the newest beat's truths. retractNarrations moves the X-carded narration's entries to blocked and is idempotent when re-run over the whole xCardedNarrationIds list at scene end.
- XCARD-DURING-SCENE-END-RACE: persistEndedScene computes sessionRetractions from the store inside its chained write, and a session minted meanwhile keeps its own list. endedSceneRetractions overlays the store's retracted entries while the store still holds the scene.
- XCARD-DURING-SCENE-END-MIGRATES and STRIKE-DURING-SCENE-END-LOST: settled() runs before each write, and takeBackXCarded / takeBackCorrected run only for a card or correction that landed during the write. A copy filed on a place is reached through filedOn. Re-running retractNarrationCapture is idempotent (undoNarrationEntries, lastKnownWithout, revertNarrationRenames, withdrawNarrationDrafts). withoutXCardedValues reads the store's xCardedNarrationIds.
- Z12 tokenBefore: every other position writer sets tokenBefore to null (computeTokenPositionRecord; inferShipPosition starts from emptyPosition). The restore walks back to the oldest removed record's spot and falls back to the pin sync.
- Z11: dropOracleResultsOf runs on the canonical GM on the write chain, and burn/improve themselves run on the canonical GM (relayed). The move PtP card carries resolutionId.
- Z13/Z60 mergeFactionLandscape: X-carded faction WJ entries are deleted or restored rather than left in play. WJ updatedAt values are ISO strings. A record at unknown shows its mapped WJ stance.
- Z43/Z44 Promote: the record-notes branch has no await between read and write. The sheet-notes branch re-reads after its Notes write and takes its own line back when the entry is gone, already promoted by a concurrent press, or X-carded.
- Z57 setBondItemForged follows the existing BOND-ITEM-MIRROR model (every PC's bond Item for that connection, as with ticks), so no new defect.
- Z60 completeListedEntity: the exists-path steps are idempotent. FACTION-/CREATURE-PAGELESS adoption touches only unlisted page-less entries of the right type, matched by the entry's own name (creators are the only writers of those flags).
- Art: the _portraitsInFlight slot is released in a finally. findEntityPortrait is consulted only when the record names no loadable portrait. linkFirstPortrait does not blame the world when the host is gone. registerArtAssetInStore and deleteEntityArtAssets decide on the store at their turn. No portrait-clearing path exists that would make re-linking wrong.
- CAMPSTATE-CHAIN writes in src/narration, src/entities, src/art, src/oracles, src/context and src/factContinuity all read the store inside the chained callback. clearXCardRedirect stays correct when queued behind a pause or resume.
- Z36/Z40/Z50/D3: round names and the PARTY roster go by actor id, the perspective counts roundCharacters, PC-less paced narration has no character, and the draft-card whose-connection picks are validated against flags.actorIds.
- Z10: the round tier pass checks isNarrationXCarded before and after its Claude call. Z62's chronicle page completion only creates the missing page.

**Not probed.**

- Strikes, whether active or kept, never block the post-narration capture writes. The tier pass (appendGenerativeTierUpdates) and lore capture (routeWorldJournalResults → recordLoreDiscovery) can re-file a restated struck fact. This is pre-existing and applies equally to active strikes, so it is not a #342 regression.
- The rolling summary's leave-out list (sessionRetractedFacts) omits a Replace's original. A Replace marks the summary for regen, but the regen re-summarises the original card's prose and keeps the replaced wording in STORY SO FAR and LAST SESSION. Same family as R2M-1, but pre-existing (Replace has always been exempt from CORRECTED).
- Since Z42, SESSION_RETRACTION_CAP=20 also ends the oldest kept strike's write block. It needs 21 or more strikes in one session, so it was not probed.
- The X-Card's unnamed scene-subject blocks also cross places, from the same root as R2M-3. This errs on the safe side and is not filed separately.
- Z60's exists path now generates a portrait for an existing record that has none (an OpenRouter cost). Reachable only through U25, Y34 or Z60 relists.
- regeneratePortrait's keepRegenerationSpent says "the world refused it" and locks the earlier portrait when the host was deleted mid-call. This is covered by the known REGENERATE-PORTRAIT-ORPHAN.
- roundFigureOwner's PC-name tokens are case-insensitive, so a PC named after a common noun ("Ash") matches "ash-streaked" in a description. This is a variant of R2M-5's rung 2 and was not probed separately.
- A round's narrative entry pulls the round's whole matched set into the tier pass (roundTierRefs), including entities that only another entry's discovery-class move matched. This is mild over-capture and not filed.
- The completeListedEntity / reconcileConfirmedFaction exists path resets a record's stance to the WJ attitude and appends an empty encounter. No in-game stance editor exists (the panel fields are display-only), so the stores stay in step and I found no reachable divergence.

### Fix regressions — Batch Mode, panels, sessions and multiplayer plumbing (R2T)

**Checked, no defect.**

- roundWindow.js Z31 draftAfterRound / keepDraftWithRound / onRoundCardForDraft: the draft is cleared only when its own text is taken; an unrolled action is restored on close; setAside is restored; owed roll plus kept draft, Edit, Withdraw, Pass, useOffer and the load path all behave. cleanSubmissionText only normalises CRLF and trims, so taken-text matching holds.
- roundWindow.js Z34 (the pending submission is dropped once its round stops collecting; over-long text refused locally), Z06 picks restore, Z32 newestNarration (isNarrationXCarded), Z33 banner, onConnectionChange and the createSetting hook. Re-renders keep the typed draft via #draft and the focus/caret restore.
- driver.js Z22 onRoundWritten: canonical only, closed rounds only, skips modeOffAfter. Get-or-create plus queueRoundWrite's skip of unchanged rounds means no loop and no double round, Discard included.
- driver.js Z23 CLOSES_RESOLVING_ROUND: End during collecting closes the round, during resolving the round finishes. Begin while the old round still resolves opens no round until it finishes, then opens round 1 of the new session.
- driver.js Z24 _sessionBeingReplaced: it is set at registerBatchModeDriver after initSessionId has started its asynchronous mint, and cleared lazily once the id changes; a refused mint is repaired by Begin.
- driver.js Z26/Z27 keepUndecidable, offerAnswerable and onChatCardUpdated: a card being burned stays answerable. closeCardUpgrades → updateChatMessage does not loop, because decided entries are not 'concerned'. laterMoveFollows is per roller.
- driver.js Z29 turnedOff, Z30 incitingSwearTaken (every ⚔ press registers its awaiting-gate entry, so swearPressDropped re-arms the button), Z19 _unreleasedClaims and claimRoundLock, waitForLock / noteMoveLockFreed, the whisper helper (skips an empty recipient list), currentParticipants (getPlayerActors), queueRoundWrite.
- Card-move combinations in joinHeldMoves other than two owed rolls (card + card, card + owed, owed + card) end in an entry plus an offer — no loop.
- session/lifecycle.js Z01: sessionActivity is written only on the canonical GM; idleMs, sessionLastSeenAt and sessionNeedsMint read it; there is no other idle reader of lastSessionTimestamp; every updateSetting handler filters by key. Z41's finalise gate, D6 (sessionGapHours has no remaining reader or writer outside the changelog), Z63 applyClockAdvances (an already-full clock is skipped, so no second vignette), Z64 End momentum ordering and correctEndedSession.
- swearVow.js Z02 working copy: the reference before Z02 was equally stale after the clock and connection writes. campaignStart.js and truths/generator.js writeOwnedFields. Z16 reconcile and the create/update page hooks.
- safety/sessionDialogs.js Set a Flag and Take a Break on the write chain. gmRelay.requestGmAction routes a non-canonical GM's requests to the canonical GM.
- sectors: D7's 'Unexplored Site' rung, Z65 threat naming (only the End vignette's step 3 reads threat names), Z12 planTokenSync and commandVehicleTokenSpotBeforeSync (GM-gated), siteDiscovery persistSiteFlag on the write chain, sectorGenerator persistSectorOntoStore.
- clocks.js Z46 untriggered report and serialiseClockWrite on the shared chain.
- audio Z67 isAudioGM (same pool and lowest-id pick on every client) and D8 countsAsNarratorCard. Published reflections carry no Play button anyway, and there is no narrator card with an explicit player author.
- multiplayer Z68 registry healing: each GM writes only its own entry, only when wrong, so two GMs loading at once converge. Registration of audioKeyedGmUserIds, ready order, sharedLegacies on the chain.
- system Z70: all 13 debility keys match vendored en.json; the lowercase strings are used only in 'marked …' lines. Z61 Tainted World token.
- entityPanel Z45 re-render on system.notes / pronouns (no inputs in the panel, no writes at render time) and Z44's Promote refusal. The chain writers (Set as current location, undismiss) are GM-gated. PrivateChannelApp instances are deleted on close.

**Not probed.**

- PrivateChannelApp implements _renderHTML but no _replaceHTML (the only ApplicationV2 window in src/ without one, at 8a4ae3b too). If Foundry v13's base _replaceHTML is the documented abstract no-op, the window's content never reaches the page and it renders blank in real Foundry. Not checkable here: there is no Foundry source or type declarations in the container, and the test stub's ApplicationV2.render is a no-op. Worth one live check; R2T-2's fix (a replaceKeepingInput _replaceHTML) would cover it either way.
- Z67 with D10: a keyed player at a table whose keyless canonical GM has a co-GM holding an ElevenLabs key no longer gets their synthesised clip filed (the keyed audio GM refuses relayed clips), so each of their Plays bills them again. Before Z67 the keyless canonical GM filed it. Judged covered by D10's stated policy ('a GM that holds an ElevenLabs key files none').
- The X-Card's paused round notice (postRoundPausedCard) carries no roundEntries. A player whose browser was away while their entry was rolled in an X-carded round keeps the rolled text as the next round's draft (onRoundCardForDraft finds no card naming it). Narrow; not probed.
- onRoundCardForDraft at load clears a draft identical to a line the newest round card names, e.g. a repeated 'I attack the drone.' typed for the next round and then a reload. Narrow, and the entry still holds a submitted copy.
- finishRound with modeOffAfter: if the world refuses the batchMode.enabled=false write, the mode stays on and onRoundWritten opens no round (it skips modeOffAfter). Only a console warning is logged, so the table sits in Batch Mode with no round. Refused-write path only.
- After a Z22 handover, the old canonical GM finishes the round, and runHeldMovesSoon replays its _heldForFreeFlow moves through onMessage, whose canonical gate drops them; its _heldForRound moves are never joined by the new canonical GM. This is the FORCED-MOVE-HOLD-RELOAD family (excluded).
- joinHeldMoves pushes a departed roller's move onto _heldForFreeFlow without calling runHeldMovesSoon, so it waits until the round closes instead of running at once. A timing difference only.
- After a keyed GM joins (recoverRound('keyed-gm' or 'user-joined')), the new canonical GM restarts a reading the old one still has in flight: a double Claude call, and the second reading never lands.
- The Z65 threat name '<trouble> — <sector>' can fail to match a detection pass that names only the trouble when resolving the threat. Model-dependent; not probed.

### Modules no round-1 auditor owned — move reading and minor flows (R2U)

**Checked, no defect.**

- interpreter.js: move reference vs the vendored Trigger options for every move's stats (Heal's four situations, Endure Harm/Stress higher-of, Repair wits/supply, Resupply, Gain Ground, React Under Fire, Enter the Fray); parseInterpretation's listed-stat rule, the expected-move path, the Strike/Clash and Gain Ground/React Under Fire remap pairs (their stat lists are identical), moveTarget/rank normalisation; buildContextSummary vows/tracks (its by-name journal read is SWP-1's)
- statEnrichment.js: PICK_HIGHER_OF (W49's substitution kept), PICK_LOWER_OF (D4), enrichBondedDevelop (+rank, no double add), enrichBondAdds (Test +1 bonded, Swear +1/+2), progress tick sources (legacy tracks, a cleared track rolled as 10, Forge unbonded rung), enrichForcedMoveStat, Z53 vehicle naming
- abilityScanner.js run over every vendored starforged asset × every move (scratch script /tmp/claude-0/-home-user-starforged-companion/f8258fa2-4b2b-56ea-ad9d-a61aab0ba7c8/scratchpad/r2-unowned-moves/scan.mjs): structured matches, adds per clause (Y15, X04, Y22), swaps per sentence (X23), Hoverbike weak-hit-as-miss, W13 improvement. Only the gaps above are filed
- repair.js: the point table and spend costs match the vendored Repair; extra points capped at 3 (MAX_EXTRA) on dialog and GM; the budget is re-checked on the GM; pay-in-full or nothing (F04); an unprepared payer is refused; the payer is the repairing player's own PC (owner or GM check); battered is cleared before integrity; the DialogV2 prompt settles on close
- developRelationship.js: BONDED_DEVELOP_OUTCOMES and BOND_ROLL_ADDS match the vendored text; the selectConnection ladder is a recorded decision (sole-bonded fallback; a Test hit develops with the test's own roll)
- milestone.js: selectFulfilVow (by item id, roller first, a completed name refused, shared copies counted once), selectMilestoneVow, marksForSourceRank, buildMilestoneSuggestion
- expedition.js: the legacy reward table (a weak hit pays one rank lower), planRecommit, applyExpeditionProgress (U16)
- combat.js / combatThreshold.js / combatTracker.js: selectCombatTrack and applyCombatProgress (U16, beginsFight); way-out picks relayed as the card's roller; the track is written before the sheet and badge mirrors; badge permissions; tracker combatants are getPlayerActors()
- mischief.js (framing and asides are flavour only; the Chaotic dial keeping an unlisted stat is decided), battleStations.js, encounterSpawn.js (reuses the world actor, centres the token), salience.js (fails open), clarificationDialog.js (settles on close; offers connections by host id)
- incitingIncident.js parsers (the narrator prompt asks for a [kind] tag), endSessionVignette NPC choice, galleyVignette participants (NARR-3 owns the CHARACTER block)
- riderDialog.js settles on close; the rider prompt on the GM is a recorded decision

**Not probed.**

- !repair's outcome is self-reported: the select defaults to Strong hit, and points can be allocated after a miss, with no Repair roll, or twice for one roll. The help documents it as a manual pick ("Pick situation × outcome"), and nothing links the Repair result card to the dialog. It is a design gap with no code-level rule a probe could assert, so it is reported rather than filed.
- !repair repairs only the command vehicle. A support vehicle that Withstand Damage now damages on its own Integrity track and Battered condition (Z53) cannot be repaired through it, and Vehicle Bay's 1-point battered clear is not implemented. Missing feature; the dialog labels say "command vehicle".
- Adds that the text ties to the roll's stat are pre-checked whatever stat is rolled: Survey Bot "Undertake an Expedition (+wits) … add +1" and Gunslinger "(+heart)/(+shadow) … add +1" on a +edge roll; Revenant's "at 0 health" +1 likewise. The scanner is not given statUsed. Low: the player can uncheck it and the hint says to.
- A connection aiding you ("add +1 and take +1 momentum"; Bolster's +2) has no way to be applied, since the manual adds input was rejected in V02. Design gap.
- Blademaster's Gain Ground approaches (a bare "Roll +heart/+edge" in each option sentence) are not offered as swaps. Gain Ground lists both stats anyway.
- vowTargetKind's fallback tests its regex anywhere in the first phrase rather than the head noun, so "captain of the freighter X" reads as a vessel and "head of the Iron Syndicate" as a faction, and neither becomes a connection. It applies only when the narrator leaves out the [kind] tag its prompt asks for.
- healSituation is compared case-sensitively (a model's "Self" would lose the lower-of rule) while ranks are lowercased. Depends on the model's formatting.
- Reach a Milestone naming another PC's unshared vow falls back to the roller's sole open vow. Narrow.
- ENTER-FRAY-SOLE-FIGHT (known open) is still present: Enter the Fray against a new foe while one fight is open posts no threshold card. Excluded as known.
- RIDERS-IGNORE-UNCHECKED (known open) is excluded; R2U-6 is a distinct case on a checked ability.
- A typed Swear an Iron Vow creates no vow Item (it only rolls and narrates). Outside this lens (session/swearVow); the design uses the sheet's ⚔ Swear it (roll) and the inciting card.

### Modules no round-1 auditor owned — infrastructure, media and data (R2I)

**Checked, no defect.**

- Oracle tables: all 143 exported tables in src/oracles/tables/ are registered, and oracleTableFidelity.test.js runs and passes here, comparing roll for roll against vendor/foundry-ironsworn/json-packs/starforged-oracles. Vendored formulas are all 1d100 except the 11 planet Sample Names (1d20, kept 5:1 on d100) and an unused 1d10 name-tags table. A full text diff found only deliberate abridgments (starship/faction-type glosses, the 'Derelict ' prefix, mortal_wound).
- Sector generator rollTableResult call sites: no unresolved directive rows. ROLE/GOAL 'Roll twice' are handled. Settlement INITIAL_CONTACT 96-100 returns the meaningful heading 'Derelict'.
- Truth tables (src/truths/tables.js): option ranges match the vendored truths. The 5 sub-tables match row for row: ranges, results and the options they attach to (Cataclysm x3, Magic 34-67, AI 1-33).
- schemas.js: ORACLE_ODDS thresholds, rollYesNo match logic (100 counts as 00), RANK_TICKS and rankTicks/rankName for numeric ranks. The CampaignStateSchema worldTruths default (including the stale commsAndData key) is harmless: buildWorldTruthsBlock skips empty entries and formatForContext's output is guarded. ConnectionSchema's shared default arrays are never mutated in place.
- net/fetchWithTimeout: the deadline covers fetch and every body reader, and the timer is cleared in finally. api-proxy: the key is trimmed, the 401 warning logs only a 7-character prefix, errors carry no key. OpenRouter/ElevenLabs errors and timeout URLs carry no key. All three keys are client-scoped. No socket payload, flag or chat card carries a key.
- logging/errorLog: entries are escaped, the ENTRY_RE relay check accepts formatEntry output, the attribution name is sanitised, and the write queue is serialised with a reentrancy guard. No journal hook warns on the log's own page writes, so there is no write loop. apiTransactionLog drops a player's entries after ready by design (W77).
- audio: cacheKey covers every synthesis input (text/voice/model/speed — speed is the only voice_setting sent). All voice/model/speed settings are world-scoped, so player and GM clip keys agree. Checked the Z67 isAudioGM routing, D8 countsAsNarratorCard, the request/ask/done/cache-write handlers and their timeouts, the stray-tag handling in segments, the single-active playback guard, and pause/resume/stop generations.
- Uploads: file names are unique — sector-<sectorId>, ship-map-<actorId>, <docId>-<assetId>, and content hashes for audio. V26 uploadedPath is used at every upload site, and Forge absolute URLs are kept by both scene builders.
- sectors: the sectorOverview sync is canonical-GM gated with a diff guard and replaces only the marked section. The SVG map escapes names. sceneBuilder offsets, passages, site pins and command-vehicle token creation (POSITION_SYNC_OPTION only for an established position) are sound. sectorArt trouble modifiers match 4 real troubles; 2 keys are dead but harmless.
- system: ironswornPacks slug/name matching works against a real index (no flags in it), and the pack ids match system.json. All 15 module slugs match the vendored module names. Every icon path exists in the vendor (planets 11/11, stellar 12 plus a fallback for 'Artificial star', starships 1-15). The i18n keys resolve in en.json.
- session: quickstart and campaignStart have GM gates, the confirm dialogs settle on close, the summary cards are escaped, the 3/2/2/1/1 stat array is correct, and campaign state goes through writeOwnedFields chains. Passing the cached campaignState to seed/finalize has no refused-write divergence beyond the known ENTITY-ID-PUSHED-ON-CACHE.
- input/speechInput: the press/release/quick-re-press state machine (held/running/released/isActive), destroy and disable paths, and append-not-submit when the chat box holds a draft (D9).
- moves/shipMapVision validation gates and JSON extraction. shipMapScene module slots, the vision/fixed fallback per feature, and the !shipmap rebuild deleting the old Scene.
- HTML escaping sweep: every interpolated name or label in index.js cards (escapeChatHtml), milestonePicker, repair, swearVow, gmRelay, the worldJournal contradiction card, the lore card and the encounter card is escaped. Oracle tables contain no HTML-special characters.

**Not probed.**

- Landscape art is requested without an aspect ratio. generateOpenRouterImage sends only model/messages/modalities. The 1792x1024 size that buildSectorBackgroundPrompt, buildShipMapBackgroundPrompt and buildPrompt return is never sent, only mentioned in the prompt text. If the provider defaults to 1:1, the image is stretched onto the 1792x1024 sector and deck-plan Scenes. Not verifiable offline: it depends on OpenRouter/FLUX defaults.
- !shipmap rebuild uploads the new deck plan under the same name, ship-map-<actorId>.png. Foundry's texture cache or the browser cache may keep showing the old art on the new Scene while the vision pins are placed for the new art. Needs a live client.
- Error Log and API Log journals are created in two steps (JournalEntry, then page). A refused page create leaves a page-less journal that is found by name from then on, and every later log write is dropped silently (the ENT-4 shape, but for logs only, on a refused write only).
- Two GMs appending to the same Error Log or API Log page at the same time can lose an entry, because text.content is read, modified and written whole. A narrow race, logs only.
- A burned or improved (superseded) narration keeps its Play button and still keys syntheses: isNarratorCardClipKey checks only xCarded. onNarratorCardRendered also rewrites the struck-through prose's inner <s> as plain text, though the inline line-through style remains. Cosmetic/UX.
- ironswornPacks caches a miss (null) for the whole page session. A transient index-load failure leaves that move or asset unresolvable until reload. Not reproducible as an ordinary path.
- diceAnimation writes _evaluated and results directly on Foundry Die/Roll objects. If v13 exposes these as getter-only, showGroup would throw synchronously out of `void showMoveRoll`. Cannot verify without Foundry v13 source.
- A keyed co-GM's or keyed player's clips are never cached at a keyed GM's table, so each replay re-bills. This is the known AUDIO-KEYED-NONCANONICAL-DUP / D10 and was in round-1 multiplayer's not-probed list. Excluded.
- sectorPanel's wizard preview and 'Sector Created' card (formatSectorCard, zoomInLine) interpolate names unescaped. Only GM-typed renames can contain markup, and the file is outside this lens.
- sectorGenerator.composeSettlementDescription inserts narrator prose raw when it starts with '<'. Foundry's server-side HTML cleaning of Actor descriptions limits the impact. Outside this lens.
- PTT `running` could stay true if the browser's SpeechRecognition never fires onend, leaving push-to-talk dead until reload. This depends on browser engine behaviour that can't be reproduced in vitest.

### Cross-feature compositions (R2C)

**Checked, no defect.**

- Burn during a round whose price advanced a clock another player's price then filled: Z46's rewind reads the clock as it stands (resultUpgrade.js:369-450, clocks.js:405-422). supersedeTriggerVignettes (:605-638) strikes the session's vignette, and the struck card leaves the ring (narrator.js:1679). In a round every price lands during rolling and every burn during upgrading, so the ordering is the same as free-flow (code read; not re-probed).
- Scene challenge finished inside a round with a fight open: refusalFor and noteReadTrack refuse a track ended earlier in the round. ROUND_FIGHT_MOVES covers the fight. The variant becomes the ordinary move (rollEntry :962-972). Finishing a challenge only retires its tension clock and does not end the fact-continuity scene. A price skips the challenge clock its own miss filled (movePipeline.js:1259).
- Private Channel reflection published during a round: it is module-flagged, so it is not table talk (isPlayerNarration index.js:2776-2777). roundNarrationPosted needs the roundId. The X-Card beat walk stops at another round's card (narrator.js:1764-1767). The redirect hook skips reflections. The only defect found is R2C-3, which is not round-specific.
- Canonical GM leaving mid-narration, then a burn. Free-flow: the record never ran, so Burn stays 'original-pending' (burnMomentum.js resultUpgradeBlocker) and W25's 'Move lock released … may be incomplete' card tells the GMs. Round: recoverRound('resolver-left') reclaims and re-narrates (claimNarration takeOver), and a later Burn is refused by roundClosed. The reverse case (canonicity gained mid-narration) is R2C-4.
- World reload mid-move: staleMoveLockAtReady clears only a lock nobody connected holds. recoverRound('ready') resumes a round from its stored phase without rolling a recorded entry twice. Held moves lost on reload = FORCED-MOVE-HOLD-RELOAD (known).
- PC renamed mid-session: speaker resolution is by actor id (speaker.js). Round narration and CHARACTER blocks use live names (narrator.js:918 Z36, :984-987). Chronicle is found by actor id (B03). Vows and bonds are Items/records keyed by id. Private Channel journals are keyed by user id. Detection's established-entities list uses live PC names.
- Shared vow fulfilled while one holder is offline: copies sync on the canonical GM (swearVow.js registerSharedVowSyncHook, fields include completed). The payoff stamps every copy, the reward goes to the roller's copy, and the legacy is the crew's. Nothing depends on the absent holder's client.
- Sector switch mid-expedition, then Finish an Expedition: tracks are not sector-filtered. selectExpeditionSite uses siteId first. Position records carry sectorId, so planTokenSync moves the token on the destination sector's scene. !sector writes only activeSectorId, which persistResolution treats as store-owned.
- !at / !sector / Entities panel while a move narrates: UPG-3 was refuted as the accepted no-baseline trade-off (decisions.md:3146). activeSectorId is store-owned. A round records each entry before narrating, and narrateRound persists only the ledgers, so a round's narration does not revert !at.
- End a Session while a Pay the Price picker or choice card is open: the press after End/Begin applies in the next session. An owed resist roll becomes the next round's entry (D2). A forced move after End is held until a session begins (X14).
- Upgraded outcome's asset riders in a round: finishMove runs after the round with the round's final outcome (driver.js rolledFor :1357-1367). In free-flow they run only for the rolled outcome, which is a documented trade-off (decisions.md:1770-1775).
- Take a Break's +1 in a round goes to the first rolled entry ('whoever makes it', nextMoveAdd.js). A !roll force is ignored by round readings by design (router.js ignoreForceMove).
- X-Card beat walk in Batch Mode: round cards bound the beat (narrator.js:1764-1767). Round submissions are not chat messages. Typed table talk ends a beat.

**Not probed.**

- Burn after the scene that narrated the miss has ended: reproduced (the superseded narration's truth, migrated onto the NPC's tier by !scene end, stays on the card after the burn). Not filed because decisions.md:709-716 (#338 D8 option A) says 'The superseded narration's World Journal and tier records stand'. The probe was deleted.
- A free-flow move narrated after End a Session has its sidecar facts dropped ('the scene changed meanwhile', sceneLifecycle.js:1005-1008). This is decided behaviour (decisions.md:3091-3096: nothing is written when the store has moved to another scene). A round narrated after End instead opens a new scene in the ended session, which closes at the mint. Inconsistent but not filed.
- An X-Card played during a round's upgrade step removes the newest narration, which is the previous round's card, not the price shown on this round's PtP card. Which one the player means is ambiguous, so not filed (R2C-2 covers holding the round).
- The round's narration-paused card carries no roundEntries. A player who was away while their round closed under the X-Card keeps that action as their window draft at load (roundWindow.js:865-866, :919-931). Narrow; not probed.
- After a PC rename, Round window headings and the GM's waiting list still show the entry's frozen actorName (roundView.js:126, :207, :230). Cosmetic.
- A PC rename splits text-keyed scene-state subjects ('kira' vs 'kira vance'), since PCs are not entities (ledgers.js resolveSubject). Model-dependent; not probed.
- Burn or Improve on a move card from the previous session, pressed after Begin a Session, is accepted and re-narrated as the new session's first narration, while LAST SESSION keeps the pre-burn outcome. Nothing closes upgrades at a session boundary. This needs a decision, not a probe.
- Sector switch, then a Finish an Expedition whose label is the pin's 'Unexplored Site' with no siteId stamp (the Undertake found it ambiguous): it charts the newly active sector's sole unexplored site (precursorSites.js:349). Needs an unstamped expedition; not probed.
- A GM leaving or reloading while a burn handler runs in the upgrade step: offerAnswerable treats the consumed card as 'being burned' forever (driver.js:1156-1162), so the round waits until Send now. Narrow (handler killed mid-run); not probed.
- A GM clearing their Claude key mid-round keeps running the advance pass, because there is no canonical re-check inside its do-while. The round then narrates keylessly into a fallback card while a keyed GM is canonical. Rare; not probed.
- Enter the Fray and a Strike in the same round: the Strike creates the fight, and the threshold card then resumes it, so the chosen rank and vow link are lost. Known open (ENTER-FRAY-SOLE-FIGHT).

### Round 1's unreproduced suspicions (R2F)

**Checked, no defect.**

- A burned Battle or Clash whose price stands: the re-narration is still told the price. The kept PtP card's oracleMemory (index.js:6120-6125, captured at 3675-3704) is dropped only when the price is reverted (burnMomentum.js:589), so the re-narration's RECENT ORACLE RESULTS lists it. The Batch Mode round_resolution mode is not a meta mode and carries it too.
- Finish the Scene typed at 0 progress: no pipeline guard refuses a 0-tick progress roll, so the typed path works and only the panel is blocked (R2F-3).
- !recap session N: once any move card in a session carries that session number, all its paced, @scene, oracle and vignette cards are recapped by sessionId (recapSessionFor + sessionNarratorCards).
- The X-Card leaves chat content visible (applyXCardToNarratorMemory and flagXCardedCards only set flags), so the '◈ Identity revealed' card staying is consistent with that design.
- Faction attitude → stance mapping: the World Journal vocabulary is hostile, neutral, allied and unknown, and all three non-unknown values are mapped (faction.js:136-140, worldJournal.js:1203).
- Batch Mode held card moves when the mode turns off run as free-flow (driver.js turnedOff, Z29); only the earlier 'joins the next round' whisper wording goes stale.
- payForgedBondNative claims its bond in flight before the first await, so two sheet rolls do not pay twice.
- Settings panel tab saves: every key they write has no other in-play writer (only the panel itself and quench), so a stale save needs two GMs or two tabs.
- Take a Break is a pacing +1, not a narration stop, so queueing it behind the GM relay is not a safety issue.
- !truth strike reaches only the open scene's sceneTruths (ledgers.js strikeTruth, chatCommands.js:225), which bounds the strike-after-End suspicion.
- applyEntityRenames refuses a target that names an existing entity; together with the dismissed filter this forms R2F-1's hop.
- Clock vignette posting: the flag family, sidecar, scene start and trigger-stands checks are all present; only capture is missing (R2F-4).

**Not probed.**

- !truth strike after End kept in LAST SESSION (session report): not reachable as described. `!truth strike` acts only on the open scene's sceneTruths, End's endScene has already closed the scene its summary covers, and the closing vignette's new scene was never in End's summary.
- End a Session interrupted by a GM reload never writes the Session Log summary (session report): recorded as a known gap in decisions.md:2681-2683 ('Only End a Session writes it … a session that ends by going idle has none'). An interrupted End has the same shape.
- Burned Battle or Clash re-narrated without its kept price (batch and upgrades reports): oracleSeeds is null on the burned resolution, but the kept price stays in RECENT ORACLE RESULTS (not dropped unless reverted), so the narrator is told it. No player-visible loss.
- !recap session N misses paced, @scene, oracle and vignette cards (narration report): only true for a session two or more back that had no move card (those cards carry sessionId but no sessionNumber). Any move card makes recapSessionFor find the session, and then all its cards are included. Too narrow.
- A GM's Chronicle panel opens only their resolved PC (ui report): overlaps the known CHRONICLE-FIRST-PC (all automatic entries go to the first PC, which is what the GM sees, and the known item records that the toolbar opener follows the viewer's PC since U23). Low value.
- An open Settings panel's stale Save writes every field back (ui report): none of the panel's keys has another in-play writer, so it needs two GMs (or two tabs) editing settings at once. Skipped as a narrow two-GM case.
- updateDraftCard partial write (entities report): only when the world refuses the write; consequence is modest (card content and flag disagree).
- A refused forgeBond still pays the bonds legacy (cards report): only when the world refuses the GM's own NPC Actor update (movePipeline.js:968-973 catches it, then pays and posts 'Bond forged').
- Two simultaneous forges pay the bonds legacy twice (cards report): needs a sheet roll and a pipeline Forge a Bond on the same bond at the same moment (the native path claims in flight). Sub-second race.
- A roller presses Burn then disconnects mid-handler and is kept (batch report): the window is the burn handler's writes between claim and acceptRoundUpgrade (about 1-2 s). A queued Burn press is refused by roundClosed when the GM keeps it, and is told. Skipped as a sub-second race.
- Edit on a card-move entry overwrites an unsent draft (batch report): dropping the card move is round-1 BATCH-2 (Edit is listed there). Overwriting the box with the submitted text is what Edit is for ('the submitted text back into the box'). UX nit.
- Dismissed names hiding existing entities, via other creation paths (entities report): only reproduced via the identity-reveal rename (R2F-1). Make a Connection is ENT-2; sector-generated or vow-target names would need a coincidence.
- '◈ Identity revealed' card stays after the X-Card (continuity report): the X-Card never hides chat content (flags only), and the rename itself is reverted. Consistent with the design.
- Published reflections can cross another player's Private Lines (multiplayer report): the round-1 auditor judged it a privacy decision; outside this lens.
- wounded/shaken meter caps (health 4, spirit 3) (upgrades report): cannot be checked against the vendored move text, and docs/rules-reference says '(rulebook)'.
- 'Joins the next round' whisper after Batch Mode turns off (batch report): Z29 runs the held move as free-flow; only the earlier whisper's wording is stale. Cosmetic.
- ConnectionSchema.playerVisible has no writer or reader (entities report): a schema default comment only (schemas.js:334); no help, README or file-structure promise. Cosmetic doc drift.

