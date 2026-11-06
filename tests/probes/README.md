# Bug-audit probes — the eleventh audit (2026-11-06)

Probe tests from the eleventh bug audit of `8a4ae3b` (the report is
`docs/testing/bug-audit-11-2026-11-06.md`; its per-area notes
`docs/testing/bug-audit-11-2026-11-06-area-notes.md` and the refuter pass
`docs/testing/bug-audit-11-2026-11-06-refuter-pass.md`): 74 findings Z01–Z74
and 8 decisions D1–D8.

Filed as GitHub issue [#342](https://github.com/jamesrmedford-alt/starforged-companion/issues/342).

Each probe asserts the **correct** behaviour, so it fails while its finding is
open and passes once the finding is fixed. Tests named `control: …` pass today
by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (103 files;
137 tests fail as designed, 117 controls pass). Several probes read
the vendored system data (the move, asset, oracle and truths packs); check out
the submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

## When a finding is fixed

Turn its probe into a regression test: move it to `tests/unit/` as a
`*.test.js` (fixing its relative imports), or fold its assertions into that
module's existing test, then delete the probe here. The test should fail with
the fix reverted (`docs/testing/fix-sensitivity.md`). A decision row's probe
asserts the option the audit recommends (or what both options share); if the
maintainer takes the other option, the probe is rewritten or dropped with the
decision. Z43's probe asserts one of its two fixes (see its row) and is
rewritten with whichever the maintainer takes.

## Probe → finding

Rows several auditors reached keep every auditor's probe (the "auditor row"
column names who filed each). The refuted row's two probes were dropped.

| Probe | Finding | Auditor row |
|---|---|---|
| `batch/closeRefusedRidersTwice.probe.js` | Z20 | BATCH-15 |
| `batch/deletedPcRolledAsFirstPc.probe.js` | Z35 | BATCH-4 |
| `batch/failedReadingEmptiesBox.probe.js` | Z31 | BATCH-5 |
| `batch/handoverNextRoundNeverOpens.probe.js` | Z22 | BATCH-6 |
| `batch/heldCardMoveLostOnModeOff.probe.js` | Z29 | BATCH-12 |
| `batch/leftOutEntryTextLost.probe.js` | Z31 | BATCH-5 |
| `batch/lockReleaseRefusedWedgesRound.probe.js` | Z19 | BATCH-10 |
| `batch/modeOffWhileUpgradingKeeps.probe.js` | Z04 | BATCH-9 |
| `batch/riderPromptHoldsNextRound.probe.js` | Z03 | BATCH-2 |
| `batch/roundCaptureSkippedByConnectionMiss.probe.js` | Z08 | BATCH-3 |
| `batch/roundDraftCreditedToFirstEntry.probe.js` | D3 | BATCH-D1 |
| `batch/roundNarrationRefusedSilent.probe.js` | Z21 | BATCH-7 |
| `batch/roundRollMoveDropsChallengeTarget.probe.js` | Z38 | BATCH-13 |
| `batch/roundWriteRefusedMidRoll.probe.js` | Z18 | BATCH-1 |
| `batch/sessionEndedResolvingRoundDropped.probe.js` | Z23 | BATCH-8 |
| `batch/upgradeOfferedAfterChoiceMade.probe.js` | Z27 | BATCH-14 |
| `batch/upgradeWaitsOnDepartedRoller.probe.js` | Z26 | BATCH-11 |
| `cards/batchOfferDroppedCardClaimed.probe.js` | Z05 | CARD-2 |
| `cards/connectionSuggestionNotRollers.probe.js` | Z56 | CARD-3 |
| `cards/fightCardFulfilAsWinner.probe.js` | D5 | CARD-D1 |
| `cards/forgedBondItemNotCompleted.probe.js` | Z57 | CARD-4 |
| `cards/recommitRefusedUntold.probe.js` | Z58 | CARD-5 |
| `cards/rewardGrantedTwiceNoVowIdFlag.probe.js` | Z54 | CARD-6 |
| `cards/rewardPickVowNoFlagNamespace.probe.js` | Z55 | CARD-1 |
| `cards/vowlessNamesakeCopies.probe.js` | Z59 | CARD-7 |
| `continuity/roundConnectionWrongNpc.probe.js` | Z09 | CONT-6 |
| `continuity/strikeLeavesPromotedNote.probe.js` | Z43 | CONT-4 |
| `continuity/strikeReassertedNextScene.probe.js` | Z42 | CONT-3 |
| `continuity/xcardAfterEndLosesLastSession.probe.js` | Z41 | CONT-2 |
| `continuity/xcardUndoneByActivityStamp.probe.js` | Z01 | CONT-1 |
| `entities/chronicleJournalWithoutPage.probe.js` | Z62 | ENT-6 |
| `entities/connectionFlowSidebarPathDrift.probe.js` | Z73 | ENT-7 |
| `entities/factionLandscapeOldestFirst.probe.js` | Z13 | ENT-8 |
| `entities/relistedFactionConfirmUnseeded.probe.js` | Z60 | ENT-1 |
| `entities/taintedWorldGenericIcon.probe.js` | Z61 | ENT-5 |
| `entities/vowIdNeverLandedRewardRegranted.probe.js` | Z54 | ENT-2 |
| `entities/vowRewardStatusNoModuleFlags.probe.js` | Z55 | ENT-3 |
| `entities/xcardDuringPromoteLeaksNotes.probe.js` | Z44 | ENT-4 |
| `multiplayer/audioKeylessSynthKeyOnCoGm.probe.js` | Z67 | MP-6 |
| `multiplayer/audioSynthPlayerPostedCard.probe.js` | D8 | MP-D1 |
| `multiplayer/batchNextRoundAfterCanonicityMoves.probe.js` | Z22 | MP-1 |
| `multiplayer/batchToggleOffForcesKeep.probe.js` | Z04 | MP-3 |
| `multiplayer/batchUpgradeWaitsForDepartedRoller.probe.js` | Z26 | MP-5 |
| `multiplayer/keyedGmRegistryLostUpdate.probe.js` | Z68 | MP-7 |
| `multiplayer/privateChannelUnsavedLineStale.probe.js` | Z66 | MP-2 |
| `multiplayer/roundWindowGmPresenceStale.probe.js` | Z33 | MP-4 |
| `narration/pacedNarratesOnCache.probe.js` | Z02 | NARR-1 |
| `narration/pclessPacedNarratedAsFirstPc.probe.js` | Z50 | NARR-D2 |
| `narration/roundConnectionBondHolder.probe.js` | D3, Z09 | NARR-3, NARR-D1 |
| `narration/roundPerspectiveSecondPerson.probe.js` | Z40 | NARR-5 |
| `narration/roundTierPassNarrativeEntries.probe.js` | Z10 | NARR-4 |
| `narration/sessionGapSettingNotBoundary.probe.js` | D6 | NARR-D3 |
| `narration/swearVowSceneOnCache.probe.js` | Z02 | NARR-2 |
| `pipeline/breakAddRefusedClearTwice.probe.js` | Z52 | PIPE-5 |
| `pipeline/finishSceneGoneTrackRolled.probe.js` | Z07 | PIPE-6 |
| `pipeline/pacedNarrationCachedStore.probe.js` | Z02 | PIPE-1 |
| `pipeline/roundClaimRacesFreeFlow.probe.js` | Z25 | PIPE-4 |
| `pipeline/roundLockReleaseRefused.probe.js` | Z19 | PIPE-3 |
| `rules/batchCardMoveOfferDropped.probe.js` | Z05 | RULE-1 |
| `rules/batchFinishSceneTwice.probe.js` | Z07 | RULE-4 |
| `rules/batchSceneVariantAfterFinish.probe.js` | Z39 | RULE-2 |
| `rules/burnPriceStandsMomentumRefunded.probe.js` | Z51 | RULE-3 |
| `rules/unpreparedEnumeratedSacrificeGreyed.probe.js` | D1 | RULE-D1 |
| `rules/withstandDamageSupportVehicle.probe.js` | Z53 | RULE-5 |
| `sectors/atNamesakeOtherSector.probe.js` | Z15 | SECT-3 |
| `sectors/bareAtDocDrift.probe.js` | Z74 | SECT-4 |
| `sectors/expeditionArrivalAtSite.probe.js` | Z14 | SECT-1 |
| `sectors/finishUnrelatedExpeditionRevealsSite.probe.js` | D7 | SECT-D1 |
| `sectors/sharedTroubleThreat.probe.js` | Z65 | SECT-6 |
| `sectors/truthsEditAfterRename.probe.js` | Z16 | SECT-5 |
| `sectors/xcardRestoreTokenStays.probe.js` | Z12 | SECT-2 |
| `session/activityStampRevertsRelayedWrite.probe.js` | Z01 | SESS-1 |
| `session/batchDraftLostWhenAuthorAway.probe.js` | Z31 | SESS-4 |
| `session/batchIdleRoundReadAtLoad.probe.js` | Z24 | SESS-5 |
| `session/batchIncitingSwornPerPresser.probe.js` | Z30 | SESS-D1 |
| `session/beginClockTriggerRetryNeverNarrated.probe.js` | Z63 | SESS-2 |
| `session/endSessionMomentumLostToGmLeaving.probe.js` | Z64 | SESS-3 |
| `session/ptpOracleMemoryVsClockAdvance.probe.js` | Z17 | SESS-6 |
| `sweep/pipelinePriceOracleMemoryLost.probe.js` | Z17 | SWP-1 |
| `sweep/ptpOracleMemoryLostToClockWrite.probe.js` | Z17 | SWP-1 |
| `sweep/roundFieldsWriteOnly.probe.js` | Z37 | SWP-3 |
| `sweep/roundNamesFrozenAtOpen.probe.js` | Z36 | SWP-2 |
| `ui/batchModeOffDuringUpgradeForcesKeep.probe.js` | Z04 | UI-2 |
| `ui/entityPanelSheetNotesStale.probe.js` | Z45 | UI-11 |
| `ui/fileStructureToggleMirrorStale.probe.js` | Z72 | UI-9 |
| `ui/i18nDebilityKeysUnresolved.probe.js` | Z70 | UI-7 |
| `ui/roundWindowNoGmBannerPromise.probe.js` | Z33 | UI-4 |
| `ui/roundWindowReadFailedEmptyBox.probe.js` | Z31 | UI-10 |
| `ui/roundWindowRerenderWipesPicks.probe.js` | Z06 | UI-1 |
| `ui/roundWindowSendAgainStaleRound.probe.js` | Z34 | UI-5 |
| `ui/roundWindowShowsXCardedNarration.probe.js` | Z32 | UI-3 |
| `ui/scopeIndexPhonePlayStale.probe.js` | Z71 | UI-8 |
| `ui/settingsReferenceBatchModeMissing.probe.js` | Z69 | UI-6 |
| `upgrades/burnGoneRollerBurnsFirstPc.probe.js` | Z48 | UPG-6 |
| `upgrades/burnRefundLeavesCrewUnprepared.probe.js` | D4 | UPG-D2 |
| `upgrades/burnRewindsClockAnotherPriceFired.probe.js` | Z46 | UPG-1 |
| `upgrades/keptPriceFollowUpCardSuperseded.probe.js` | Z47 | UPG-8 |
| `upgrades/ptpPclessNarrativePriceNarrated.probe.js` | Z49 | UPG-5 |
| `upgrades/roundDropsOwedResistRoll.probe.js` | D2 | UPG-D1 |
| `upgrades/roundOffersClosedUpgrade.probe.js` | Z27 | UPG-4 |
| `upgrades/roundRiderPromptHoldsNextRound.probe.js` | Z03 | UPG-7 |
| `upgrades/roundUpgradeRiderPickerRefused.probe.js` | Z28 | UPG-3 |
| `upgrades/upgradeKeepsRevertedPriceInOracleMemory.probe.js` | Z11 | UPG-2 |
