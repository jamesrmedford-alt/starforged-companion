# Bug-audit probes — issues #321 and #322

Probe tests from the seventh bug audit (2026-10-31, at commit `6455e01`):

- [issue #321](https://github.com/jamesrmedford-alt/starforged-companion/issues/321): 68 findings, U01–U68
- [issue #322](https://github.com/jamesrmedford-alt/starforged-companion/issues/322): 33 findings, V01–V33

Each probe asserts the **correct** behaviour, so it fails while its finding is
open and passes once the finding is fixed. Tests named `control: …` pass today
by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them.

Three probes read the vendored system data: `oracles/oracleTableFidelity`,
`infra/starshipIconPath` and `infra/encounterCardVendorFoe`. Check out the
submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

## When a finding is fixed

Turn its probe into a regression test. Either move it to `tests/unit/` as a
`*.test.js` (fixing its relative imports), or fold its assertions into that
module's existing test. Then delete the probe here. The test should fail with
the fix reverted (`docs/testing/fix-sensitivity.md`).

## Probe → finding

| Probe | Finding |
|---|---|
| `continuity/clarificationPick.probe.js` | #321 U37 |
| `continuity/correctionDialogStaleWrite.probe.js` | #321 U06 |
| `continuity/factCommandStaleWrite.probe.js` | #321 U06 |
| `continuity/loreRestore.probe.js` | #321 U40 |
| `continuity/privateChannelDuplicateTurns.probe.js` | #321 U42 |
| `continuity/privateChannelFirstPc.probe.js` | #321 U23 |
| `continuity/privateChannelPlayerJournal.probe.js` | #321 U10 |
| `continuity/privateChannelReopen.probe.js` | #321 U42 |
| `continuity/privateChannelXCard.probe.js` | #321 U09 |
| `continuity/retractionDedup.probe.js` | #321 U39 |
| `continuity/retractionLoreOverreach.probe.js` | #321 U39 |
| `continuity/shipPositionWordScan.probe.js` | #321 U43 |
| `continuity/sidecarBareFence.probe.js` | #321 U41 |
| `continuity/startSceneStaleSnapshot.probe.js` | #321 U06 |
| `entities/autoSeedDoublePortrait.probe.js` | #321 U29 |
| `entities/connectionMigrationDeleteFirst.probe.js` | #322 V29 |
| `entities/dedupTitleNotStripped.probe.js` | #321 U30 |
| `entities/detectionTruncationSilent.probe.js` | #321 U15 |
| `entities/draftCardConcurrentConfirm.probe.js` | #321 U25 |
| `entities/factionConfirmAttitudeReset.probe.js` | #321 U28 |
| `entities/factionPageBodyStale.probe.js` | #322 V31 |
| `entities/loneShipNpcDraft.probe.js` | #321 U26 |
| `entities/makeConnectionBondFirstPC.probe.js` | #321 U23 |
| `entities/regenerateStripsNotesPortrait.probe.js` | #322 V30 |
| `entities/renameUnmatchedDropsEntity.probe.js` | #321 U27 |
| `entities/severNameMissFallback.probe.js` | #321 U14 |
| `index/atCommandRevertedByMove.probe.js` | the accepted no-baseline merge limitation (#321, Excluded) |
| `index/commandVehicleReadyScan.probe.js` | #321 U22 |
| `index/legacyTrackNeverClears.probe.js` | #316 T02 (left out of #321 as a duplicate) |
| `index/milestoneSuggestionRepeat.probe.js` | #321 U20 |
| `index/narrationCardRefusedSkipsPersist.probe.js` | #322 V09 |
| `index/nativeBondRollNarration.probe.js` | #321 U21 |
| `index/nativeRollKeylessRoller.probe.js` | #321 U11 |
| `index/recapSessionNumber.probe.js` | #322 V05 |
| `index/recommitRepeat.probe.js` | #321 U20 |
| `index/sectorSwitchKeywordName.probe.js` | #322 V10 |
| `index/soloSheetEditStaleSnapshot.probe.js` | #321 U01 |
| `infra/artAssetLookupByName.probe.js` | #322 V25 |
| `infra/audioAutoplayHistoricalCard.probe.js` | #322 V15 |
| `infra/audioCacheCapNeverEnforced.probe.js` | #322 V16 |
| `infra/audioDoubleSynthesis.probe.js` | #321 U59 |
| `infra/audioErrorNoRetry.probe.js` | #322 V13 |
| `infra/audioKeylessBrowseRefused.probe.js` | #321 U60 |
| `infra/audioPauseBetweenSegments.probe.js` | #322 V14 |
| `infra/audioStopWhileLoading.probe.js` | #322 V14 |
| `infra/encounterCardVendorFoe.probe.js` | #321 U32 |
| `infra/encounterTokenCentre.probe.js` | #322 V24 |
| `infra/portraitPlayerClick.probe.js` | #321 U33 |
| `infra/segmentsUnclosedTag.probe.js` | #322 V17 |
| `infra/starshipIconPath.probe.js` | #321 U31 |
| `moves/bondWeakHit.probe.js` | #322 V01 |
| `moves/burnEligibility.probe.js` | #322 V04; also #316 T05 (Burn on no-roll moves) |
| `moves/combatBadgeDrift.probe.js` | #321 U19 |
| `moves/fulfilVowTarget.probe.js` | #321 U02 |
| `moves/interpreterNumbers.probe.js` | #322 V08 |
| `moves/nextMoveBonus.probe.js` | #322 V02 |
| `moves/resolverRules.probe.js` | #321 U03, #321 U17, #321 U18 |
| `moves/trackSelection.probe.js` | #321 U16 |
| `narration/classifierConnections.probe.js` | #321 U44 |
| `narration/classifierSuggestedMoveId.probe.js` | #321 U45 |
| `narration/fallbackCardFlagFamily.probe.js` | #321 U35 |
| `narration/moveNarrationStaleSnapshot.probe.js` | #321 U08 |
| `narration/narrationCardHtml.probe.js` | #322 V18 |
| `narration/payThePriceDoubleRoll.probe.js` | #321 U03 |
| `narration/recapSessionNumber.probe.js` | #322 V05 |
| `narration/relevanceUnicodeNames.probe.js` | #322 V19 |
| `narration/sceneQueryCaptureGate.probe.js` | #321 U36 |
| `narration/sessionRecapCounts.probe.js` | #322 V05 |
| `narration/sidecarWithoutScene.probe.js` | #321 U34 |
| `narration/spotlightFrameNames.probe.js` | #322 V20 |
| `narration/vowSceneAttribution.probe.js` | #321 U23 |
| `narration/xcardContentRefed.probe.js` | #321 U07 |
| `oracles/customOracleParse.probe.js` | #322 V28 |
| `oracles/directiveResolution.probe.js` | #321 U68 |
| `oracles/loreRecapRevertedByMove.probe.js` | #321 U06 |
| `oracles/loreRecapStaleWrite.probe.js` | #321 U06 |
| `oracles/oracleOddsParsing.probe.js` | #321 U64 |
| `oracles/oracleTableFidelity.probe.js` | #321 U63 |
| `oracles/revisedTruthsLoreStale.probe.js` | #321 U65 |
| `oracles/storeWorldTruthsByName.probe.js` | #321 U67 |
| `oracles/storeWorldTruthsFlags.probe.js` | #321 U67 |
| `oracles/waypointOracleButtonRepeat.probe.js` | #316 T06 (left out of #321 as a duplicate) |
| `oracles/worldTruthSubResult.probe.js` | #321 U66 |
| `sectors/artUploadFailureSilent.probe.js` | #322 V26 |
| `sectors/cleanupDeletesGmPages.probe.js` | #321 U49 |
| `sectors/newSectorMovesShip.probe.js` | #321 U47 |
| `sectors/offPinTokenReadsDocked.probe.js` | #321 U53 |
| `sectors/overviewRewriteWipesList.probe.js` | #321 U13 |
| `sectors/revealSiteStaleWrite.probe.js` | #321 U06 |
| `sectors/sectorCreateDoubleClick.probe.js` | #321 U46 |
| `sectors/sectorNpcRollsDropped.probe.js` | #322 V27 |
| `sectors/sectorPlanetsNarratorDark.probe.js` | #321 U51 |
| `sectors/siteLadderWrongSite.probe.js` | #321 U48 |
| `sectors/tokenDragStalePinName.probe.js` | #321 U52 |
| `sectors/zoomInStepMissing.probe.js` | #321 U50 |
| `session/endVignetteSeveredBond.probe.js` | #321 U61 |
| `session/incitingPremiseStaleWrite.probe.js` | #321 U06 |
| `session/momentumBoundsDoubleCount.probe.js` | #316 T01 (left out of #321 as a duplicate) |
| `session/sessionGateCarriesOver.probe.js` | #321 U12 |
| `session/sharedVowSyncLostUpdate.probe.js` | #322 V32 |
| `session/soloSnapshotCacheStale.probe.js` | #321 U01 |
| `session/speakerBoundNonPc.probe.js` | #321 U24 |
| `session/swearTargetBondFirstPc.probe.js` | #321 U23 |
| `session/vowRankNumeric.probe.js` | #321 U62 |
| `ui/entityPanelConnectionProgress.probe.js` | #322 V11 |
| `ui/entityPanelCurrentLocation.probe.js` | #321 U56 |
| `ui/entityPanelPlayerWrites.probe.js` | #321 U05 |
| `ui/helpJournalAccuracy.probe.js` | #322 V06, #322 V07 |
| `ui/progressPanelLostUpdate.probe.js` | #321 U57 |
| `ui/progressPanelPlayer.probe.js` | #321 U05 |
| `ui/recapSessionNumber.probe.js` | #322 V05 |
| `ui/safetyHandlersCacheMutation.probe.js` | #321 U58 |
| `ui/sceneChallengeClockOrphan.probe.js` | #316 T03 (left out of #321 as a duplicate) |
| `ui/sharedVowClockDuplicate.probe.js` | #321 U55 |
