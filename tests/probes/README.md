# Bug-audit probes — the fourteenth audit (2026-11-16)

Probe tests from the fourteenth bug audit of `cf250fb` — a holistic search after the hidden plans (#353), the held result and the other alpha 23 fixes (#354) and the world snapshot (#357). The report is `docs/testing/bug-audit-14-2026-11-16.md`: 83 findings AC01–AC83 and 14 decisions D1–D14.

Filed as GitHub issue [#362](https://github.com/jamesrmedford-alt/starforged-companion/issues/362).

Each probe asserts the **correct** behaviour, so it fails while its finding is open and passes once the finding is fixed. Tests named `control: …` pass today by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (107 files; 178 tests fail as designed, 157 controls pass; every file fails on its finding's own assertion). Several probes read the vendored system data; check out the submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

`nara/_skeletonTable.js` and `pipe/_heldTable.js` are shared setup, not probes.

## When a finding is fixed

Turn its probe into a regression test: move it to `tests/unit/` as a `*.test.js` (fixing its relative imports), or fold its assertions into that module's existing test, then delete the probe here. The test should fail with the fix reverted (`docs/testing/fix-sensitivity.md`). A finding found from several areas has several probes; one fix should turn all of them green — keep the most thorough and drop the rest.

## Probe → finding

| Probe | Finding | Fails / controls |
|---|---|---|
| `pipe/statedMissChargedOnWeakHit.probe.js` | AC01 STATED-MISS-PAID-ON-WEAK-HIT | 1 / 1 |
| `idxc/statedMissPaidOnWeakHit.probe.js` | AC01 STATED-MISS-PAID-ON-WEAK-HIT | 1 / 1 |
| `mova/statedMissPaidOnWeakHit.probe.js` | AC01 STATED-MISS-PAID-ON-WEAK-HIT | 1 / 1 |
| `mova/statedMissPromisedForUnpricedMiss.probe.js` | AC02 STATED-MISS-PROMISED-FOR-UNPRICED-MISS | 2 / 1 |
| `pipe/statedMissCostShownButNeverPaid.probe.js` | AC02 STATED-MISS-PROMISED-FOR-UNPRICED-MISS | 2 / 1 |
| `mova/sojournStatedMissPaysTable.probe.js` | AC03 SOJOURN-STATED-MISS-PAYS-TABLE | 2 / 1 |
| `idxa/expeditionPlanLostWhenResultUpgraded.probe.js` | AC04 EXPEDITION-PLAN-LOST-ON-UPGRADE | 2 / 2 |
| `idxb/expeditionPlanRequestLostOnUpgrade.probe.js` | AC04 EXPEDITION-PLAN-LOST-ON-UPGRADE | 4 / 2 |
| `nara/upgradeDropsExpeditionPlan.probe.js` | AC04 EXPEDITION-PLAN-LOST-ON-UPGRADE | 2 / 2 |
| `pipe/heldUpgradeNarrationLosesRollContext.probe.js` | AC04 EXPEDITION-PLAN-LOST-ON-UPGRADE | 2 / 2 |
| `mova/upgradedOutcomeUnseeded.probe.js` | AC05 UPGRADED-OUTCOME-UNSEEDED | 2 / 2 |
| `idxb/arrivalLineLostOnWeakToStrongUpgrade.probe.js` | AC06 ARRIVAL-LINE-LOST-ON-UPGRADE | 2 / 2 |
| `idxa/heldBurnedCourseNotToldArrival.probe.js` | AC06 ARRIVAL-LINE-LOST-ON-UPGRADE | 1 / 2 |
| `pipe/heldUpgradeNarrationLosesRollContext.probe.js` | AC06 ARRIVAL-LINE-LOST-ON-UPGRADE | 2 / 2 |
| `nara/planRequestLostWithoutSidecar.probe.js` | AC07 PLAN-REQUEST-LOST-WITHOUT-SIDECAR | 3 / 1 |
| `narb/planRequestDroppedWithoutFactBlock.probe.js` | AC07 PLAN-REQUEST-LOST-WITHOUT-SIDECAR | 3 / 1 |
| `fc/planRequestLostOnUnreadSidecar.probe.js` | AC07 PLAN-REQUEST-LOST-WITHOUT-SIDECAR | 2 / 1 |
| `fc/planClockStallsWhenVignetteNotNarrated.probe.js` | AC08 PLAN-CLOCK-STUCK-FULL | 2 / 1 |
| `narb/planClockStuckFullAfterFailedVignette.probe.js` | AC08 PLAN-CLOCK-STUCK-FULL | 1 / 1 |
| `narb/sceneChallengeClockRewoundByPlanStep.probe.js` | AC09 SCENE-CHALLENGE-CLOCK-REWOUND-BY-PLAN-STEP | 1 / 1 |
| `skel/retiredPlanClockKeepsRunning.probe.js` | AC10 PLAN-RETIRE-LEAVES-CLOCK | 2 / 1 |
| `narb/waypointPerilWrongExpedition.probe.js` | AC11 WAYPOINT-PERIL-WRONG-EXPEDITION | 1 / 1 |
| `skel/titledNpcAgendaTakesEnemyPlan.probe.js` | AC12 PLAN-TITLE-FALSE-MERGE | 1 / 2 |
| `skel/revealedTruthLedgerStale.probe.js` | AC13 REVEAL-LEDGER-STALE-TRUTH | 2 / 1 |
| `sess/playerVowPlanHasNoVowId.probe.js` | AC14 PLAYER-VOW-PLAN-NO-VOW-ID | 3 / 1 |
| `mova/hiddenPlanRollsOnHeldCard.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 1 / 1 |
| `mova/hiddenPlanRollsInRoundSetting.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 2 / 1 |
| `batch/roundSettingHoldsHiddenRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 3 / 1 |
| `batch/heldCardFlagsHoldHiddenRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 1 / 1 |
| `idxa/heldCardCarriesHiddenPlanRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 2 / 1 |
| `idxb/heldCardFlagsCarryHiddenPlanRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 2 / 1 |
| `skel/heldCardCarriesPlanRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 1 / 1 |
| `pipe/heldCardFlagsCarryPlanRolls.probe.js` | AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND | 2 / 1 |
| `skel/truthRevealedBeforeDecided.probe.js` | AC16 REVEAL-TRUTH-BEFORE-DECIDED | 1 / 1 |
| `ent/nearSpellingMergesDistinctNames.probe.js` | AC17 NEAR-SPELLING-MERGES-DISTINCT-NAMES | 4 / 2 |
| `ent/makeConnectionPartNameNothingMade.probe.js` | AC18 MAKE-CONNECTION-PART-NAME-NOTHING-MADE | 4 / 2 |
| `ent/makeConnectionFirstDetectedNotTheLines.probe.js` | AC19 MAKE-CONNECTION-FIRST-DETECTED | 2 / 3 |
| `ent/tierDetailExtensionDropped.probe.js` | AC20 TIER-DETAIL-EXTENSION-COUNTED-AS-REPEAT | 2 / 2 |
| `wj/mergedThreatReopenedByDetection.probe.js` | AC21 THREAT-MERGED-PAGE-REOPENED | 3 / 1 |
| `wj/loreRoutedToOlderSectorNamesake.probe.js` | AC22 LORE-ROUTE-OLDER-SECTOR-NAMESAKE | 2 / 1 |
| `sess/playerVowSwearUsesCardNameSnapshot.probe.js` | AC23 PLAYER-VOW-CARD-NAME-SNAPSHOT | 2 / 1 |
| `uisec/expeditionArrivalDropsSiteLink.probe.js` | AC24 EXPEDITION-ARRIVAL-SITE-LINK-DROPPED | 4 / 2 |
| `char/shipIntegrityLostWhenStarshipAssetAdded.probe.js` | AC25 SHIP-INTEGRITY-LOST-WHEN-ASSET-ADDED | 2 / 2 |
| `uisec/sectorRollbackAfterStore.probe.js` | AC26 SECTOR-ROLLBACK-AFTER-STORE | 2 / 2 |
| `char/strikeChronicleQueuesBehindItself.probe.js` | AC27 STRIKE-CHRONICLE-NESTED-RELAY | 2 / 2 |
| `movb/sufferPickerNoTargetFree.probe.js` | AC28 SUFFER-PICKER-NO-TARGET-FREE | 2 / 1 |
| `narp/snapshotSectorRosterDropsPlayMadeNpcs.probe.js` | AC29 SNAPSHOT-SECTORLESS-NPCS-OFF-ROSTER | 1 / 3 |
| `idxc/sojournRollTwicePrice.probe.js` | AC30 SOJOURN-PRICE-ROLL-TWICE-REROLLED | 1 / 2 |
| `wj/chosenPriceRollTwiceRerolled.probe.js` | AC30 SOJOURN-PRICE-ROLL-TWICE-REROLLED | 1 / 1 |
| `idxc/matchLineAfterBurn.probe.js` | AC31 MATCH-LINE-STALE-AFTER-UPGRADE | 1 / 2 |
| `batch/heldResultWhenBatchModeTurnsOn.probe.js` | AC32 HELD-RESULT-OUTLIVES-ROUND-ENTRY | 2 / 2 |
| `skel/burnAfterPlanClockResetKeepsStep.probe.js` | AC33 BURN-KEEPS-PLAN-CLOCK-TRIGGER | 1 / 1 |
| `nara/planHistoryOverflowDeletesPlan.probe.js` | AC34 PLAN-HISTORY-OVERFLOW-DELETES-PLAN | 1 / 1 |
| `fc/xcardDeletesPlanWrittenFourTimes.probe.js` | AC34 PLAN-HISTORY-OVERFLOW-DELETES-PLAN | 1 / 1 |
| `skel/xCardDeletesPlanItShouldRestore.probe.js` | AC34 PLAN-HISTORY-OVERFLOW-DELETES-PLAN | 1 / 1 |
| `nara/planWriteAfterXCard.probe.js` | AC35 XCARD-LATE-PLAN-WRITE | 1 / 1 |
| `fc/xcardLateCaptureFilesPlan.probe.js` | AC35 XCARD-LATE-PLAN-WRITE | 1 / 2 |
| `skel/waitingPlanDecidedUnderPlannedName.probe.js` | AC36 WAITING-PLAN-DECIDED-ONTO-PLANNED-NAME | 1 / 1 |
| `fc/revealedTruthArchivedTwice.probe.js` | AC37 REVEALED-TRUTH-ARCHIVED-TWICE | 1 / 1 |
| `narb/planClockAdvanceVignetteWithoutItsPlan.probe.js` | AC38 PLAN-CLOCK-ADVANCE-VIGNETTE-WITHOUT-ITS-PLAN | 1 / 1 |
| `fc/sidecarAppliedForUnpostedNarration.probe.js` | AC39 UNPOSTED-REPLY-FACT-BLOCK-APPLIED | 2 / 1 |
| `nara/emptyReplyAppliesFactBlock.probe.js` | AC39 UNPOSTED-REPLY-FACT-BLOCK-APPLIED | 1 / 1 |
| `ent/renameOntoKnownPartName.probe.js` | AC40 RENAME-ONTO-KNOWN-PART-NAME | 2 / 3 |
| `ent/loreAboutNpcFiledAsPlayerCharacters.probe.js` | AC41 LORE-NPC-RECORD-LOSES-TO-PC-PART-NAME | 1 / 2 |
| `wj/escalatedTransitionLowersThreat.probe.js` | AC42 THREAT-ESCALATED-WORD-LOWERS-SEVERITY | 2 / 2 |
| `wj/sectorTroubleVariantOtherSector.probe.js` | AC43 THREAT-VARIANT-OTHER-SECTOR-TROUBLE | 1 / 1 |
| `ent/detectedSiteTypeFromPassingWords.probe.js` | AC44 SITE-TYPE-FROM-PASSING-WORDS | 2 / 2 |
| `ent/loreWithEmptyTextBlankCardDetail.probe.js` | AC45 ENTITY-LORE-EMPTY-TEXT-BLANK-DETAIL | 1 / 1 |
| `uisec/panelFightVowLinkPaidByName.probe.js` | AC46 PANEL-FIGHT-VOW-LINK-PAID-BY-NAME | 1 / 1 |
| `mova/telemetryJournalFoundByName.probe.js` | AC47 TELEMETRY-JOURNAL-BY-NAME | 1 / 1 |
| `wj/renamedFolderRecreatedAtLoad.probe.js` | AC48 WJ-FOLDER-BY-NAME-RECREATED | 1 / 2 |
| `idxb/unchartedRecordLostOnRefusedPersist.probe.js` | AC49 UNCHARTED-DESTINATION-NOT-ON-RETRY-CARD | 2 / 1 |
| `uisec/chartedSiteRenamedThenDuplicated.probe.js` | AC50 UNCHARTED-SITE-DUPLICATED-AFTER-RENAME | 1 / 1 |
| `uisec/unchartedPinsShareACell.probe.js` | AC51 SITE-SLOTS-WRAP-ONTO-EXISTING-PIN | 2 / 1 |
| `idxb/clearSiteCallsUnchartedPlaceDerelict.probe.js` | AC52 CLEAR-SITE-UNCHARTED-CALLED-DERELICT | 1 / 1 |
| `uisec/unchartedSiteClearedAsDerelict.probe.js` | AC52 CLEAR-SITE-UNCHARTED-CALLED-DERELICT | 1 / 1 |
| `idxb/courseCardBlamesMissingPin.probe.js` | AC53 COURSE-CARD-BLAMES-A-MISSING-PIN | 1 / 1 |
| `char/starshipCursedUntickLeavesAssetOutOfStep.probe.js` | AC54 STARSHIP-CURSED-UNTICK-DRIFT | 1 / 2 |
| `pipe/moveRecordRevertsStoreWrittenFields.probe.js` | AC55 MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS | 2 / 1 |
| `batch/crewSupplyRevertedByMoveRecord.probe.js` | AC55 MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS | 2 / 2 |
| `char/regenerationSpentByReloadMidCall.probe.js` | AC56 REGEN-CLAIM-STRANDED-BY-RELOAD | 1 / 1 |
| `batch/roundHeldByXCardAtUpgradeStepSessionEnd.probe.js` | AC57 ROUND-HELD-AT-UPGRADE-STEP-LEFT-OPEN-AT-SESSION-END | 1 / 1 |
| `idxc/setupCardEveryLoad.probe.js` | AC58 SETUP-CARD-STACKS-PER-LOAD | 1 / 1 |
| `movb/ptpRouteRefusedNoRetry.probe.js` | AC59 PTP-ROUTE-REFUSED-NO-RETRY | 2 / 2 |
| `movb/resistPostRefusedCardDead.probe.js` | AC60 RESIST-POST-REFUSED-CARD-DEAD | 1 / 1 |
| `batch/roundConfirmDropsPickedCompanion.probe.js` | AC61 ROUND-CONFIRM-DROPS-PICKED-ASSET | 1 / 2 |
| `batch/roundTokenDragPayloadUnchecked.probe.js` | AC62 ROUND-TOKEN-DRAG-PAYLOAD-UNCHECKED | 1 / 1 |
| `uisec/trackRowVowChoiceWiped.probe.js` | AC63 TRACK-ROW-VOW-CHOICE-WIPED | 2 / 2 |
| `mova/pacingReadFabricated.probe.js` | AC64 PACING-READ-FABRICATED | 3 / 1 |
| `narp/snapshotKeepsRemovedEntityDetail.probe.js` | AC65 SNAPSHOT-ENTITY-DETAIL-REMOVE-NO-EVENT | 2 / 2 |
| `narp/snapshotRulesNameMissingSections.probe.js` | AC66 SNAPSHOT-RULES-NAME-MISSING-SECTIONS | 2 / 2 |
| `narp/privateLinesOrderRewritesRules.probe.js` | AC67 STANDING-BLOCK-PRIVATE-LINES-ORDER | 2 / 3 |
| `batch/roundReadingNoMoveWithPacingOff.probe.js` | AC68 ROUND-READING-NO-MOVE-WITH-PACING-OFF | 2 / 2 |
| `mova/riderExtractionMultiObject.probe.js` | AC69 RIDER-EXTRACT-MULTI-OBJECT | 2 / 2 |
| `narp/sectorStubIgnoresSessionPerspective.probe.js` | AC70 SECTOR-STUB-PERSPECTIVE-PER-CALL | 1 / 3 |
| `narp/snapshotSessionZeroLabel.probe.js` | AC71 SNAPSHOT-SESSION-ZERO | 1 / 3 |
| `narp/beatShapeRepeatsAfterOtherNarratorCards.probe.js` | AC72 BEAT-SHAPE-REPEATS | 2 / 2 |
| `narb/vowSceneCardLiteralAsterisks.probe.js` | AC73 VOW-SCENE-CARD-LITERAL-ASTERISKS | 1 / 1 |
| `movb/pacedRollGmPressSpeaker.probe.js` | AC74 PACED-ROLL-GM-PRESS-SPEAKS-AS-FIRST-PC | 1 / 2 |
| `narb/clockVignetteAbsentFirstPc.probe.js` | AC75 CLOCK-VIGNETTE-ABSENT-FIRST-PC | 1 / 1 |
| `char/bondItemDeleteNoteSpokenByPc.probe.js` | AC76 BOND-DELETE-NOTE-AS-PC | 1 / 1 |
| `idxc/crewSupplyMirrorNote.probe.js` | AC77 CREW-SUPPLY-MIRROR-NOTE-SPOKEN-BY-ALLY | 1 / 2 |
| `idxb/oracleConsultKeylessCoGm.probe.js` | AC78 ORACLE-CONSULT-KEYLESS-GM | 1 / 2 |
| `sess/privateChannelReopenDropsUnsavedTurns.probe.js` | AC79 PRIVATE-REOPEN-DROPS-UNSAVED-TURNS | 2 / 1 |
| `sess/privateChannelFailedSendLosesLine.probe.js` | AC80 PRIVATE-FAILED-SEND-LINE-NOT-RETRIABLE | 2 / 1 |
| `uisec/connectionSchemaDeadFields.probe.js` | AC81 CONNECTION-SCHEMA-DEAD-FIELDS | 4 / 2 |
| `pipe/heldResolvedByNeverRead.probe.js` | AC82 HELD-RESOLVED-BY-NEVER-READ | 1 / 2 |
| `pipe/reversalCardUnescapedClockName.probe.js` | AC83 REVERSAL-CARD-NAMES-UNESCAPED | 2 / 1 |
