# Bug-audit probes — the thirteenth audit (2026-11-11)

Probe tests from the thirteenth bug audit of `53b4150` — serious bugs, stalls and locks. The report is `docs/testing/bug-audit-13-2026-11-11.md`: 24 findings AB01–AB24 and 3 decisions D1–D3.

Filed as GitHub issue [#347](https://github.com/jamesrmedford-alt/starforged-companion/issues/347).

Each probe asserts the **correct** behaviour, so it fails while its finding is open and passes once the finding is fixed. Tests named `control: …` pass today by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them (35 files; 54 tests fail as designed, 43 controls pass; every file fails on its finding's own assertion). Several probes read the vendored system data; check out the submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

## When a finding is fixed

Turn its probe into a regression test: move it to `tests/unit/` as a `*.test.js` (fixing its relative imports), or fold its assertions into that module's existing test, then delete the probe here. The test should fail with the fix reverted (`docs/testing/fix-sensitivity.md`). A decision row's probe asserts one option (named below); if the maintainer takes another, the probe is rewritten or dropped with the decision.

## Probe → finding

| Probe | Finding | Fails / controls |
|---|---|---|
| `ent/makeConnectionHoldsMoveLockForPortrait.probe.js` | AB01 | 1 / 1 |
| `ui/sectorCreateUploadStall.probe.js` | AB02 | 2 / 1 |
| `sess/audioSynthInFlightWedged.probe.js` | AB02 | 1 / 1 |
| `idxa/readyGmStandsDownForLoadingGm.probe.js` | AB03 | 2 / 1 |
| `idxa/staleLockHolderReloadsNonCanonical.probe.js` | AB04 | 3 / 3 |
| `idxb/reloadedLockHolderNotCanonical.probe.js` | AB04 | 1 / 2 |
| `idxa/lockClaimWriteNeverAnswered.probe.js` | AB05 | 1 / 1 |
| `sess/beginEndChainWedged.probe.js` | AB05 | 2 / 2 |
| `narr/summaryRefreshWedgedByHungWrite.probe.js` | AB05 | 3 / 1 |
| `sess/transcriptChainWedged.probe.js` | AB05 | 1 / 2 |
| `movesa/claimedCardConfirmClosed.probe.js` | AB06 | 1 / 1 |
| `movesb/owedResistRollLostAtConfirm.probe.js` | AB06 | 2 / 2 |
| `sess/incitingSwearDroppedAtLock.probe.js` | AB06 | 1 / 1 |
| `idxa/heldForcedMoveStrandedOnHandover.probe.js` | AB06 | 3 / 2 |
| `idxb/newPcLegacyClickResetsCrewTrack.probe.js` | AB07 | 1 / 1 |
| `regr2/commandVehicleIntegrityUpgradeLoss.probe.js` | AB08 | 2 / 1 |
| `ent/makeConnectionDuplicateAfterMidMoveConfirm.probe.js` | AB09 | 1 / 1 |
| `ent/makeConnectionWrongPendingRow.probe.js` | AB10 | 2 / 1 |
| `cont/sceneEndDropsFactInsideOlderDetail.probe.js` | AB11 | 2 / 1 |
| `ui/safetyLineRemovedByIndex.probe.js` | AB12 | 2 / 1 |
| `batch/earlyBurnStraddlesRollEnd.probe.js` | AB13 | 2 / 1 |
| `idxa/readyResetInterruptedMoveSilent.probe.js` | AB14 | 1 / 1 |
| `sess/keylessMintLosesLastSession.probe.js` | AB15 | 2 / 1 |
| `regr2/worldJournalSplitWorldFlip.probe.js` | AB16 | 2 / 1 |
| `narr/roundNarratedTwiceAfterTakeover.probe.js` | AB17 | 2 / 1 |
| `batch/returningResolverResumesBesideCoGm.probe.js` | AB18 | 1 / 1 |
| `narr/xcardMissedByReturningGmNarration.probe.js` | AB19 | 1 / 1 |
| `batch/rolledWithoutCardRolledAgain.probe.js` | AB20 | 2 / 1 |
| `narr/pacedNarrationFailureUntold.probe.js` | AB21 | 1 / 1 |
| `cont/xcardAfterNarrationCardDeleted.probe.js` | AB22 | 1 / 1 |
| `ui/tokenDragPayloadUnchecked.probe.js` | AB23 | 1 / 1 |
| `regr1/heldMovesRolledOutOfOrderAfterRefusedClaims.probe.js` | AB24 | 1 / 1 |
| `movesa/clarificationHoldsLockAfterRoll.probe.js` | D1 (asserts A / B: the lock is free while the prompt is open) | 1 / 1 |
| `cont/xcardAfterUpgradeSupersede.probe.js` | D2 (asserts A) | 1 / 2 |
| `batch/keylessCoGmTakeoverNarratesFallback.probe.js` | D3 (asserts A) | 1 / 1 |

The folders name the reviewer that wrote each probe: `idxa` / `idxb` (the two halves of `src/index.js`), `batch`, `movesa` (the pipeline and upgrades), `movesb` (suffer moves, riders, dialogs), `narr`, `cont` (fact continuity, the X-Card, the World Journal), `ent`, `sess` (sessions, clocks, Private Channel, audio), `ui` (panels, sectors, oracles), `regr1` / `regr2` (the two regression reads of the fix diffs since the twelfth audit).

One reviewer finding was dropped with its probe: the Chronicle's per-character write chain has no timeout, which `decisions.md` records as an accepted trade-off (U57).
