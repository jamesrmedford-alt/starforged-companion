# Bug-audit probes — the ninth audit (2026-11-04)

Probe tests from the ninth bug audit of `8715172`
(`docs/testing/bug-audit-9-2026-11-04.md`: 63 findings X01–X63 and 14
decisions D1–D14).

Filed as GitHub issues [#NNN](https://github.com/jamesrmedford-alt/starforged-companion/issues/NNN)
(X01–X16) and [#NNN](https://github.com/jamesrmedford-alt/starforged-companion/issues/NNN)
(X17–X63 and D1–D14).

Each probe asserts the **correct** behaviour, so it fails while its finding is
open and passes once the finding is fixed. Tests named `control: …` pass today
by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (74 files;
123 tests fail as designed, 103 controls pass). Several probes read the
vendored system data (the move, asset, oracle and truths packs); check out the
submodule first:

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
decision.

## Probe → finding

| Probe | Finding |
|---|---|
| `cards/cardRepostAsClicker.probe.js` | X06 |
| `cards/connectionPickPclessPlayer.probe.js` | X21 |
| `cards/milestonePickCompletedVow.probe.js` | X22 |
| `cards/nativeForgeWrongConnection.probe.js` | X08 |
| `cards/playerVowLinkQuotedName.probe.js` | X23 |
| `cards/rewardLinkRefusedWrite.probe.js` | X09 |
| `cards/thresholdCardNoClaim.probe.js` | X07 |
| `continuity/archivedTruthStaysRetracted.probe.js` | X33 |
| `continuity/consistencyCheckStaleLedger.probe.js` | X02 |
| `continuity/consistencyCheckStaleLedgerPipeline.probe.js` | X02 |
| `continuity/loreRumourReconfirmed.probe.js` | D8 |
| `continuity/sceneCommandCachedWrite.probe.js` | X12 |
| `continuity/worldJournalPageBodyStale.probe.js` | X32 |
| `continuity/xcardCaptureNoNarrationId.probe.js` | X01 |
| `entities/createIdCachedMutate.probe.js` | X37 |
| `entities/factionDetectTwoEncounters.probe.js` | X35 |
| `entities/notesSheetNotMirrored.probe.js` | X14 |
| `entities/severBondItemStays.probe.js` | D9 |
| `entities/shipFinaliseReseedsAutoSeeded.probe.js` | X36 |
| `entities/shipSeedStaleRecordWrite.probe.js` | X34 |
| `lead/fileStructureDrift.probe.js` | X63 |
| `multiplayer/audioCacheWriteUnchecked.probe.js` | D10 |
| `multiplayer/audioSynthSpecUnbounded.probe.js` | X53 |
| `multiplayer/errorLogRelayRawHtml.probe.js` | X55 |
| `multiplayer/moveLockReleasedByStalePipeline.probe.js` | X10 |
| `multiplayer/sharedSupplyRefusedWriteAbortsPass.probe.js` | X54 |
| `narration/activeConnectionsCount.probe.js` | X31 |
| `narration/campaignRecapCardUnescaped.probe.js` | X26 |
| `narration/clockVignetteNpcMarkup.probe.js` | X29 |
| `narration/narrationCachedStoreWrites.probe.js` | X11, X12 |
| `narration/narratorPersistsCachedStore.probe.js` | X27, X28 |
| `narration/oracleFollowupLength.probe.js` | X30 |
| `narration/spotlightNamesTheRoller.probe.js` | D7 |
| `pipeline/battleGoneEatsNextMoveAdds.probe.js` | X19 |
| `pipeline/cardButtonsClickerRoller.probe.js` | X06 |
| `pipeline/refusedPersistLosesLegacyMark.probe.js` | X20 |
| `rules/assetAddsCostMention.probe.js` | X05 |
| `rules/assetStatSubstitution.probe.js` | X25 |
| `rules/legacyProgressScore.probe.js` | D5 |
| `rules/planetSampleNames.probe.js` | X50 |
| `sectors/oracleMemoryLostUpdate.probe.js` | X46 |
| `sectors/oracleRefNotFollowed.probe.js` | D12 |
| `sectors/sectorNamesakeFolders.probe.js` | D13 |
| `sectors/sectorStoreCachedMutation.probe.js` | X13 |
| `sectors/siteDiscoveredCardEscaping.probe.js` | X47 |
| `sectors/sitePinRenameStale.probe.js` | X48 |
| `sectors/truthDescriptionsAbridged.probe.js` | X49 |
| `session/beginSessionRefusedSilent.probe.js` | X15 |
| `session/campaignStartCachedBegin.probe.js` | X38 |
| `session/endSessionGateOpenWindow.probe.js` | X43 |
| `session/incitingPremiseCachedMutate.probe.js` | X40 |
| `session/pacingTelemetryJournalRace.probe.js` | X41 |
| `session/readyMintCachedMutate.probe.js` | X42 |
| `session/rollForceConsumedByRefusedLine.probe.js` | X39 |
| `session/sessionGateSilentDrop.probe.js` | X16 |
| `session/sessionNumberPrepLoad.probe.js` | D11 |
| `sweep/cachedFlagMutatedBeforeWrite.probe.js` | X44 |
| `sweep/claimBeforeRefusedWrite.probe.js` | X09 |
| `sweep/oracleNarrateUnchecked.probe.js` | X51 |
| `sweep/playerPathGmGated.probe.js` | X24, X60 |
| `sweep/producedButDead.probe.js` | X57 |
| `sweep/recapCardUnescaped.probe.js` | X26 |
| `sweep/setupCardWhisperAllGms.probe.js` | X56 |
| `sweep/takeBreakDialogClose.probe.js` | X45 |
| `ui/entityPanelStaleOnState.probe.js` | X58 |
| `ui/entityPortraitAltUnescaped.probe.js` | X59 |
| `ui/helpRoleClaimsDrift.probe.js` | X61 |
| `ui/sessionPanelEnvisionPlayer.probe.js` | D14 |
| `ui/settingsReferenceCoverage.probe.js` | X62 |
| `upgrades/endureAtZeroMarkAndRoll.probe.js` | X03, D3 |
| `upgrades/loseMomentumAtMinFree.probe.js` | X04 |
| `upgrades/redirectPickerSurvivesBurn.probe.js` | X17 |
| `upgrades/riderSupplyZeroUnprepared.probe.js` | X18 |
| `upgrades/upgradeClosedByOwnSuggestion.probe.js` | D2 |

## Refuter verdicts

_(the refuter pass is summarised here once its verdicts are in)_

