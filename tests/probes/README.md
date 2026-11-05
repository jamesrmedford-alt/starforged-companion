# Bug-audit probes — the tenth audit (2026-11-05)

Probe tests from the tenth bug audit of `8fb7bfa` (the report is
`docs/testing/bug-audit-10-2026-11-05.md`, its per-area notes
`docs/testing/bug-audit-10-2026-11-05-area-notes.md`): 49 findings Y01–Y49
and 10 decisions D1–D10.

Filed as GitHub issues [#335](https://github.com/jamesrmedford-alt/starforged-companion/issues/335) (Y01–Y14),
[#336](https://github.com/jamesrmedford-alt/starforged-companion/issues/336) (Y15–Y33),
[#337](https://github.com/jamesrmedford-alt/starforged-companion/issues/337) (Y34–Y49) and
[#338](https://github.com/jamesrmedford-alt/starforged-companion/issues/338) (D1–D10, the excluded rows and the refuter pass).

Each probe asserts the **correct** behaviour, so it fails while its finding is
open and passes once the finding is fixed. Tests named `control: …` pass today
by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (64 files; 101
tests fail as designed, 83 controls pass). Several probes read the vendored
system data (the move, asset, oracle and truths packs); check out the
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

A finding two auditors reached from different sides keeps both probes (Y02,
Y03, Y04, Y15, Y28, D6). `entities/finaliseRewritesHandNotes` also carries
D4's ship case. Y48 (a flow-doc claim) is traced, with no probe.

| Probe | Finding |
|---|---|
| `cards/claimAfterEffectRefusedStamp.probe.js` | Y24 |
| `cards/recommitEpicRankText.probe.js` | Y26 |
| `cards/rewardPickVowGoneNotice.probe.js` | Y27 |
| `cards/sheetRollNpcCardPaysPcVow.probe.js` | Y23 |
| `cards/unrelayedFollowupNonOwner.probe.js` | D1 |
| `cards/vowRecommitAfterFulfilment.probe.js` | Y10 |
| `cards/vowRecommitJournalSoleOpen.probe.js` | Y25 |
| `cards/wayOutPressedByGmFirstPc.probe.js` | Y11 |
| `continuity/factionPageNameVariants.probe.js` | Y31 |
| `continuity/liftRestoresDoubleStruckLore.probe.js` | Y32 |
| `continuity/replaceAfterXCard.probe.js` | Y30 |
| `continuity/xcardAfterSceneEnd.probe.js` | Y01 |
| `continuity/xcardDraftCardPending.probe.js` | D6 |
| `continuity/xcardFactionSurfaceUnstamped.probe.js` | Y02 |
| `continuity/xcardPromotedDetailNotes.probe.js` | D7 |
| `continuity/xcardPublishedReflectionCapture.probe.js` | Y03 |
| `entities/finaliseRewritesHandNotes.probe.js` | Y12 (and D4) |
| `entities/npcPronounsSheetEdit.probe.js` | Y13 |
| `entities/refusedRegistrationOrphan.probe.js` | Y34 |
| `multiplayer/advertiseRefusedSilent.probe.js` | Y40 |
| `multiplayer/audioCachePrefillKeyedGm.probe.js` | D10 |
| `multiplayer/audioDonePathUnbounded.probe.js` | Y42 |
| `multiplayer/privateTranscriptNoGmSilent.probe.js` | Y41 |
| `multiplayer/ptpPclessPlayerSilent.probe.js` | Y43 |
| `multiplayer/pttOverwritesDraft.probe.js` | D9 |
| `narration/beginSessionTwoScenes.probe.js` | Y05 |
| `narration/draftFactionSurfaceUndo.probe.js` | Y02 |
| `narration/galleyVignetteCachedMutate.probe.js` | Y04 |
| `narration/publishedReflectionCaptureUndo.probe.js` | Y03 |
| `narration/sessionRecapNpcMarkup.probe.js` | Y29 |
| `narration/xcardAutoCreatedConnection.probe.js` | D6 |
| `pipeline/combatBotClashAdd.probe.js` | Y15 |
| `pipeline/pacedRollDroppedAtLock.probe.js` | Y08 |
| `pipeline/refusedMeterWriteLosesRecord.probe.js` | Y16 |
| `pipeline/resistCardClosesBurnUnhinted.probe.js` | Y18 |
| `pipeline/sessionGateHeldPresserUntold.probe.js` | Y17 |
| `rules/combatBotClashAdd.probe.js` | Y15 |
| `rules/nonNumericAbilityAdds.probe.js` | Y22 |
| `rules/playkitPunchListStale.probe.js` | Y49 |
| `rules/sacrificeWhileUnpreparedAboveZero.probe.js` | D3 |
| `rules/sceneChallengeVariantMoves.probe.js` | D2 |
| `rules/sufferMissTableSeeds.probe.js` | Y21 |
| `sectors/atCardUnescapedName.probe.js` | Y28 |
| `sectors/fleetMissionRegion.probe.js` | D5 |
| `sectors/loreRepairCachedMutation.probe.js` | Y38 |
| `sectors/sitePinsNotPositionAnchors.probe.js` | Y14 |
| `sectors/truthsPageEditNotReparsed.probe.js` | Y39 |
| `session/burnRewindFiredClockVignette.probe.js` | D8 |
| `session/clockFullCheckStale.probe.js` | Y37 |
| `session/endSessionRefusedRelayedSilent.probe.js` | Y06 |
| `session/incitingSwearRearmAfterGate.probe.js` | Y36 |
| `session/readyResetReleasesLiveLock.probe.js` | Y07 |
| `sweep/inciteCachedStoreWrites.probe.js` | Y04 |
| `sweep/incitingPremiseRefusedSilent.probe.js` | Y33 |
| `sweep/thresholdTrackIdDead.probe.js` | Y44 |
| `ui/helpFirstSessionAboutGmOnly.probe.js` | Y47 |
| `ui/inciteNarratesOnCache.probe.js` | Y04 |
| `ui/panelRerenderWipesInput.probe.js` | Y45 |
| `ui/promoteRaceDropsCapture.probe.js` | Y35 |
| `ui/readmeCommandsDrift.probe.js` | Y46 |
| `upgrades/priceStandsRetiresResistCard.probe.js` | Y09 |
| `upgrades/riderSupplyLossWhileUnprepared.probe.js` | Y19 |
| `upgrades/sufferCardCompanionNameUnescaped.probe.js` | Y28 |
| `upgrades/sufferPickGonePcFirstPc.probe.js` | Y20 |
