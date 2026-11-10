# Bug-audit probes — the twelfth audit (2026-11-10)

Probe tests from the twelfth bug audit of `22bdbeb` (the report is `docs/testing/bug-audit-12-2026-11-10.md`; its area notes `docs/testing/bug-audit-12-2026-11-10-area-notes.md` and the refuter pass `docs/testing/bug-audit-12-2026-11-10-refuter-pass.md`): 70 findings AA01–AA70 and 7 decisions D1–D7.

Filed as GitHub issue ISSUE_LINK.

Each probe asserts the **correct** behaviour, so it fails while its finding is open and passes once the finding is fixed. Tests named `control: …` pass today by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (83 files; 139 tests fail as designed, 115 controls pass). Several probes read the vendored system data (the move, asset, oracle and truths packs); check out the submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

`ui/helpChangelogVersion.probe.js` reads the local git tags (`git fetch --tags origin`).

## When a finding is fixed

Turn its probe into a regression test: move it to `tests/unit/` as a `*.test.js` (fixing its relative imports), or fold its assertions into that module's existing test, then delete the probe here. The test should fail with the fix reverted (`docs/testing/fix-sensitivity.md`). A decision row's probe asserts the option the audit recommends (D2's asserts option C); if the maintainer takes another, the probe is rewritten or dropped with the decision.

## Probe → finding

Rows several auditors reached keep every auditor's probe (the "filed as" column names who filed each). The refuted row's probe (UPG-3) was dropped.

| Probe | Finding | Filed as | Fails / controls |
|---|---|---|---|
| `batch/cardMoveEntryPassDropped.probe.js` | AA37 | BATCH-2 | 2 / 2 |
| `batch/narrationClaimRefusedSilent.probe.js` | AA40 | BATCH-5 | 1 / 3 |
| `batch/readingFieldsWriteOnly.probe.js` | AA41 | BATCH-7 | 1 / 2 |
| `batch/sendThenOffRefusedLeavesMark.probe.js` | AA39 | BATCH-4 | 1 / 2 |
| `batch/sheetRollNarratedOutsideRound.probe.js` | D1 | BATCH-6 | 1 / 2 |
| `batch/staleSendNowResolvesNextRound.probe.js` | AA38 | BATCH-3 | 2 / 2 |
| `batch/toggleDiscardAfterResolve.probe.js` | AA36 | BATCH-1 | 2 / 2 |
| `cards/fightCardAfterHolderFulfils.probe.js` | AA17 | CARD-3 | 6 / 3 |
| `cards/forgePickConnectionGone.probe.js` | AA50 | CARD-4 | 2 / 1 |
| `cards/forsakeTarget.probe.js` | AA16, AA49 | CARD-1, CARD-2 | 3 / 2 |
| `cards/milestonePickDeletedVow.probe.js` | AA53 | CARD-7 | 1 / 1 |
| `cards/recommitAfterForsake.probe.js` | AA51 | CARD-5 | 1 / 1 |
| `cards/rewardPickAfterFulfil.probe.js` | AA52 | CARD-6 | 1 / 1 |
| `continuity/playerTruthSetOverXCard.probe.js` | D4 | CONT-7 | 2 / 2 |
| `continuity/truthSetStrikeExactText.probe.js` | AA26 | CONT-2 | 3 / 3 |
| `continuity/xcardAfterEndSessionLog.probe.js` | AA27 | CONT-6 | 1 / 0 |
| `continuity/xcardFrameNotRestored.probe.js` | D3 | CONT-5 | 1 / 1 |
| `continuity/xcardOracleResultStays.probe.js` | AA01 | CONT-4 | 1 / 1 |
| `continuity/xcardReplacedTruthUnblocked.probe.js` | AA05 | CONT-3 | 2 / 2 |
| `continuity/xcardStaleSnapshotBlock.probe.js` | AA04 | CONT-1 | 3 / 2 |
| `entities/artCachePagelessEntry.probe.js` | AA54 | ENT-4 | 1 / 1 |
| `entities/commandVehicleIntegritySheet.probe.js` | AA20 | ENT-3 | 2 / 1 |
| `entities/factionJournalRename.probe.js` | AA18 | ENT-1 | 2 / 1 |
| `entities/makeConnectionDismissedName.probe.js` | AA19 | ENT-2 | 1 / 1 |
| `entities/makeConnectionExistingNpc.probe.js` | AA19 | ENT-2 | 1 / 1 |
| `multiplayer/privateChannelOwnLines.probe.js` | AA03 | MP-1 | 1 / 2 |
| `multiplayer/privateLinesQueued.probe.js` | D5 | MP-2 | 1 / 1 |
| `multiplayer/summaryAfterPauseOnChain.probe.js` | AA25 | MP-3 | 1 / 1 |
| `narration/burnSupersedeSummaryKept.probe.js` | AA24 | NARR-5 | 1 / 1 |
| `narration/galleyCharacterAbsentPc.probe.js` | AA31 | NARR-3 | 1 / 1 |
| `narration/scenePclessAskedAsFirstPc.probe.js` | AA30 | NARR-1 | 2 / 2 |
| `narration/xcardActiveAtMintLastSession.probe.js` | AA57 | NARR-4 | 1 / 1 |
| `narration/xcardOracleMemoryKept.probe.js` | AA01 | NARR-2 | 1 / 1 |
| `r2-compose/captureLostWhenCanonicalChanges.probe.js` | AA34 | R2C-4 | 2 / 2 |
| `r2-compose/endSessionDuringRoundLastSession.probe.js` | AA21 | R2C-1 | 2 / 2 |
| `r2-compose/reflectionCancelsSessionRecap.probe.js` | AA32 | R2C-3 | 1 / 1 |
| `r2-compose/xcardDuringUpgradeStepClosesRound.probe.js` | AA43 | R2C-2 | 1 / 1 |
| `r2-followup/clockVignetteNoTierPass.probe.js` | AA33 | R2F-4 | 1 / 1 |
| `r2-followup/dismissedNameHidesRenamedRecord.probe.js` | AA55 | R2F-1 | 1 / 1 |
| `r2-followup/finishSceneRollBlockedAtZero.probe.js` | AA68 | R2F-3 | 1 / 1 |
| `r2-followup/pacedLineUnderXCardSilent.probe.js` | AA29 | R2F-2 | 1 / 2 |
| `r2-regress-memory/keptSceneStrikeBlocksOtherPlace.probe.js` | AA28 | R2M-3 | 2 / 2 |
| `r2-regress-memory/replacedFactUnblockedNextScene.probe.js` | AA05 | R2M-1 | 2 / 2 |
| `r2-regress-memory/roundFigureOwnerDescriptionRung.probe.js` | D2 | R2M-5 | 1 / 1 |
| `r2-regress-memory/roundPendingConnectionAnyRow.probe.js` | AA09 | R2M-2 | 3 / 2 |
| `r2-regress-memory/sidecarSubjectOlderSectorNamesake.probe.js` | AA06 | R2M-4 | 2 / 1 |
| `r2-regress-pipeline/arrivalInsideWordDocksShip.probe.js` | AA23 | R2P-3 | 1 / 2 |
| `r2-regress-pipeline/refusedClaimDrainDropsHeldMove.probe.js` | AA48 | R2P-2 | 1 / 1 |
| `r2-regress-pipeline/withstandStarshipProseVehicle.probe.js` | AA14 | R2P-1 | 2 / 1 |
| `r2-regress-table/owedPairHeldLoops.probe.js` | AA08 | R2T-4 | 2 / 1 |
| `r2-regress-table/privateChannelRefreshWipesTyping.probe.js` | AA02 | R2T-2 | 1 / 1 |
| `r2-regress-table/readingLostOnCanonicalLeave.probe.js` | AA42 | R2T-3 | 1 / 1 |
| `r2-regress-table/roundNarratedAfterEnd.probe.js` | AA21 | R2T-1 | 2 / 1 |
| `r2-unowned-infra/audioUploadFailRebills.probe.js` | AA61 | R2I-3 | 1 / 1 |
| `r2-unowned-infra/canonicalMoveTextUnread.probe.js` | AA44 | R2I-1 | 1 / 1 |
| `r2-unowned-infra/modulePinDescriptionEmpty.probe.js` | AA56 | R2I-2 | 2 / 1 |
| `r2-unowned-moves/aidYourAllyAbilitiesUnkeyed.probe.js` | AA11 | R2U-2 | 3 / 1 |
| `r2-unowned-moves/canonicalMoveBlockReadsNoField.probe.js` | AA44 | R2U-3 | 2 / 1 |
| `r2-unowned-moves/chooseBeforeRollingBothOptions.probe.js` | AA12 | R2U-6 | 2 / 1 |
| `r2-unowned-moves/companionHitIgnoresNamedCompanion.probe.js` | AA45 | R2U-4 | 2 / 2 |
| `r2-unowned-moves/meterStatSubstitutionDropped.probe.js` | AA10 | R2U-1 | 4 / 1 |
| `r2-unowned-moves/selfMendHealsNamedCrewmate.probe.js` | AA13 | R2U-5 | 3 / 1 |
| `session/beginDialogPrivateFlagCount.probe.js` | AA60 | SESS-6 | 1 / 1 |
| `session/expeditionArrivalByLabel.probe.js` | AA22 | SESS-3 | 2 / 1 |
| `session/lastSessionAtMint.probe.js` | AA21, AA57 | SESS-1, SESS-2 | 2 / 2 |
| `session/lineDuringLoadMint.probe.js` | AA58 | SESS-4 | 1 / 1 |
| `session/panelBeginAfterIdle.probe.js` | AA59 | SESS-5 | 1 / 1 |
| `sweep/privateChannelNoReplaceHtml.probe.js` | AA02 | SWP-3 | 2 / 1 |
| `sweep/progressTracksJournalByName.probe.js` | AA62 | SWP-1 | 2 / 1 |
| `sweep/worldJournalByName.probe.js` | AA63 | SWP-2 | 2 / 1 |
| `ui/chroniclePinUnread.probe.js` | AA07 | UI-9 | 1 / 1 |
| `ui/clocksPanelOddsDefault.probe.js` | AA67 | UI-7 | 1 / 1 |
| `ui/helpChangelogVersion.probe.js` | D7 | UI-8 | 1 / 1 |
| `ui/positionBadgeShowsLastSet.probe.js` | AA64 | UI-1 | 2 / 1 |
| `ui/privateLinesTwoGmLostUpdate.probe.js` | AA35 | UI-2 | 3 / 2 |
| `ui/readmeStaleClaims.probe.js` | AA70 | UI-6 | 3 / 1 |
| `ui/sessionPanelInciteKeylessGm.probe.js` | D6 | UI-D1 | 1 / 1 |
| `ui/sidecarRequiredSettingDead.probe.js` | AA65 | UI-3 | 2 / 1 |
| `ui/worldJournalHelpAnnotations.probe.js` | AA69 | UI-5 | 2 / 2 |
| `ui/worldJournalPanelStale.probe.js` | AA66 | UI-4 | 1 / 1 |
| `upgrades/redirectPickerClosesBurnUnhinted.probe.js` | AA47 | UPG-4 | 1 / 2 |
| `upgrades/upgradeUnpreparedClampMomentum.probe.js` | AA46 | UPG-2 | 3 / 3 |
| `upgrades/vehicleCompanionMissFreeAtZero.probe.js` | AA15 | UPG-1 | 2 / 2 |
