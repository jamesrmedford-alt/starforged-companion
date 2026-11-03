# Bug-audit probes — the eighth audit (2026-11-03)

Probe tests from the eighth bug audit of `39331b4`
(`docs/testing/bug-audit-8-2026-11-03.md`: 87 findings W01–W87 and 8
decisions D1–D8).

Filed as GitHub issues [#325](https://github.com/jamesrmedford-alt/starforged-companion/issues/325)
(W01–W37) and [#326](https://github.com/jamesrmedford-alt/starforged-companion/issues/326)
(W38–W87 and D1–D8).

Each probe asserts the **correct** behaviour, so it fails while its finding is
open and passes once the finding is fixed. Tests named `control: …` pass today
by design. The files are named `*.probe.js` so `npm test` never collects them.

## Running

All probes:

```bash
npx vitest run --config tests/probes/vitest.probes.config.js
```

Add `tests/probes/<area>/`, or one file, to run part of them. Several probes
read the vendored system data (the asset and move JSON, the truths pack, the
`ChallengeRank` field); check out the submodule first:

```bash
git submodule update --init vendor/foundry-ironsworn
```

## When a finding is fixed

Turn its probe into a regression test: move it to `tests/unit/` as a
`*.test.js` (fixing its relative imports), or fold its assertions into that
module's existing test, then delete the probe here. The test should fail with
the fix reverted (`docs/testing/fix-sensitivity.md`).

## Probe → finding

| Probe | Finding |
|---|---|
| `cards/battleButtonAfterFightOver.probe.js` | W11 |
| `cards/claimedPickDroppedWhileBusy.probe.js` | W02 |
| `cards/connectionSuggestionRepeat.probe.js` | W11 |
| `cards/nativeThenPipelineFulfilLegacy.probe.js` | W28 |
| `cards/ptpCrewUnpreparedPlayer.probe.js` | W10 |
| `cards/vowDeepenTwice.probe.js` | D1 |
| `cards/vowRankNumericLegacy.probe.js` | W01 |
| `cards/vowRankNumericPipeline.probe.js` | W01 |
| `cards/wonFightCardAfterFulfil.probe.js` | W29 |
| `cards/wonFightMilestonePickerMarks.probe.js` | W43 |
| `commands/cachedStateCommandWrites.probe.js` | W51 |
| `commands/pacedRollButtonClicker.probe.js` | W09 |
| `commands/ptpCrewUnpreparedPlayer.probe.js` | W10 |
| `commands/severWrongTarget.probe.js` | W30 |
| `commands/speechLanguageChangeIgnored.probe.js` | W87 |
| `commands/vendorMoveCardNarrated.probe.js` | W08 |
| `continuity/chronicleWriterThinking.probe.js` | W27 |
| `continuity/contradictedTruthIdDead.probe.js` | W63 |
| `continuity/correctAFactHelp.probe.js` | W67 |
| `continuity/endSceneDropsConcurrentFacts.probe.js` | W24 |
| `continuity/journalQualifierUnchecked.probe.js` | W62 |
| `continuity/ledgerCommandNoScene.probe.js` | W59 |
| `continuity/reviewCardShipHint.probe.js` | W66 |
| `continuity/scenePlaceAtEnd.probe.js` | D2 |
| `continuity/sessionLogRetractedLore.probe.js` | W64 |
| `continuity/shipPositionLocationLine.probe.js` | W65 |
| `continuity/stateAttributeCase.probe.js` | W61 |
| `continuity/truthSetOverStrike.probe.js` | W60 |
| `continuity/wjPanelFactOverride.probe.js` | W34 |
| `continuity/xcardLosesEarlierState.probe.js` | W41 |
| `continuity/xcardShipPosition.probe.js` | W07 |
| `entities/autoSeedStaleRecordWrite.probe.js` | W69 |
| `entities/connectionDispositionNeutral.probe.js` | W22 |
| `entities/makeConnectionPendingDraft.probe.js` | W23 |
| `entities/renameFactsStayTextBound.probe.js` | W68 |
| `entities/seedRerollsNarratedIdentity.probe.js` | W31 |
| `lead/cachedStateMutatedBeforeWrite.probe.js` | W51 |
| `lead/clockLostUpdate.probe.js` | W53 |
| `lead/lockStuckOnGmHandover.probe.js` | W25 |
| `moves/abilityAddsSummed.probe.js` | W12 |
| `moves/aidYourAllyOutcome.probe.js` | W17 |
| `moves/bondedDevelopSkipsNextMoveAdd.probe.js` | W48 |
| `moves/bondedTestRelationshipAdd.probe.js` | W18 |
| `moves/companionMatchDeathText.probe.js` | W17 |
| `moves/compelWeakHitMomentum.probe.js` | W17 |
| `moves/endureSubstitutionDiscarded.probe.js` | W49 |
| `moves/finishVowSoleTwin.probe.js` | W44 |
| `moves/fulfilLegacyNumericRank.probe.js` | W01 |
| `moves/fulfilLegacyNumericRankNative.probe.js` | W01 |
| `moves/improveCountWeakAsStrong.probe.js` | W13 |
| `moves/interpreterMoveDisplayName.probe.js` | W38 |
| `moves/interpreterStatOffList.probe.js` | W19 |
| `moves/legacyXpBeforePersist.probe.js` | W52 |
| `moves/mischiefAsideReadsRationale.probe.js` | W50 |
| `moves/nextMoveAddCachedClear.probe.js` | W51 |
| `moves/resupplyWeakItemOption.probe.js` | W17 |
| `moves/selectorSubstringInsideWord.probe.js` | W30 |
| `moves/waypointDiscoveryDoubleRoll.probe.js` | W47 |
| `narration/hintCommonNounMove.probe.js` | W36 |
| `narration/modeLengthConflict.probe.js` | W40 |
| `narration/nativeRollOutcomeMissing.probe.js` | W20 |
| `narration/paceRefusedWriteClaimsSet.probe.js` | W51 |
| `narration/pacedHintPcSocialMove.probe.js` | W36 |
| `narration/perspectiveAutoCountsGm.probe.js` | W21 |
| `narration/renarrationOutcomeMissing.probe.js` | W20 |
| `narration/sectorRosterLostConnection.probe.js` | W37 |
| `narration/shipNotesHtmlInPrompt.probe.js` | W39 |
| `narration/xcardBeatPastRollRepost.probe.js` | W42 |
| `narration/xcardShipPositionStays.probe.js` | W07 |
| `narration/xcardStaleLedgerMoveNarration.probe.js` | W05 |
| `narration/xcardSummaryResurrected.probe.js` | W06 |
| `pipeline/battleButtonRearms.probe.js` | W11 |
| `pipeline/finishExpeditionCourseCard.probe.js` | W46 |
| `pipeline/fulfilVowNumericRank.probe.js` | W01 |
| `pipeline/payThePriceNarratedTwice.probe.js` | W03 |
| `pipeline/pclessPlayerRollsFirstPc.probe.js` | D8 |
| `pipeline/positionTwoFightsDropped.probe.js` | W45 |
| `sectors/cachedStateMutatedBeforeWrite.probe.js` | W51 |
| `sectors/loreCardUnescaped.probe.js` | W71 |
| `sectors/populationTablesUnreachable.probe.js` | W72 |
| `sectors/sectorPassageCount.probe.js` | D5 |
| `sectors/sectorStubPerspective.probe.js` | W73 |
| `sectors/sectorsRevertedByMove.probe.js` | Excluded — the accepted no-baseline merge limitation (issue #299) |
| `sectors/siteKlassDropped.probe.js` | W74 |
| `sectors/siteRenameStale.probe.js` | W75 |
| `sectors/truthQuestStarterFidelity.probe.js` | W76 |
| `sectors/truthsSingleCategorySave.probe.js` | W35 |
| `session/apiLogPlayerBufferGrows.probe.js` | W77 |
| `session/galleySoloGmAbsent.probe.js` | W32 |
| `session/incitingBoldLabels.probe.js` | W33 |
| `session/legacyXpNotOnSheet.probe.js` | D3 |
| `session/playerVowCardNumericRank.probe.js` | W01 |
| `session/rewardRepromisedAfterGrant.probe.js` | W11 |
| `session/swearToConnectionNoAdd.probe.js` | W18 |
| `session/vowTargetFactionConnection.probe.js` | W70 |
| `ui/apiLogSettingReachable.probe.js` | W78 |
| `ui/audioKeyedPlayerCache.probe.js` | W79 |
| `ui/audioKeylessCanonicalGm.probe.js` | W80 |
| `ui/audioSynthRequestValidation.probe.js` | W81 |
| `ui/combatPositionToggle.probe.js` | W56 |
| `ui/deadscanStringMentions.probe.js` | W82 |
| `ui/helpDocDrift.probe.js` | W83 |
| `ui/helpJournalTwoGms.probe.js` | W54 |
| `ui/langStringsConsumed.probe.js` | W84 |
| `ui/panelTextEscaping.probe.js` | W26 |
| `ui/sceneChallengeProgressRoll.probe.js` | D6 |
| `ui/sessionPanelPlayerBegin.probe.js` | W85 |
| `ui/toolbarPrivateChannelToggle.probe.js` | W86 |
| `ui/trackLabelEscaping.probe.js` | W26 |
| `upgrades/bondApplyXpBeforeSave.probe.js` | W51, W52 |
| `upgrades/combatTrackerViewedCombat.probe.js` | W55 |
| `upgrades/healGiveHealsHealer.probe.js` | W04 |
| `upgrades/improveCountWeakOnMiss.probe.js` | W13 |
| `upgrades/persistResolutionDeadSteps.probe.js` | W58 |
| `upgrades/resistMissLossAtZero.probe.js` | W14 |
| `upgrades/sacrificeWhileUnpreparedFree.probe.js` | W16 |
| `upgrades/twoSufferMovesSameMove.probe.js` | W15 |
| `upgrades/upgradeCardText.probe.js` | W57 |
| `upgrades/upgradeOldMoveCard.probe.js` | D4 |

## Refuter verdicts

Seventeen candidates were each handed to an independent adversarial refuter
(four routes: a documented decision, an open known item, the rules text, a
misread of the code). Verdict, severity and the decisive citation:

| Candidate | Finding | Verdict | Citation |
|---|---|---|---|
| R01 Pay the Price narrated twice / "Face Defeat" | W03 | stands (medium) | `index.js:1468-1476`, `:5282-5329`; decisions.md U03 "rolled once per result; the narration is seeded with the card's roll" |
| R02 vendor move card narrated | W08 | stands (medium) | `sf-move-chat-message.ts:22-25` (no flags); `index.js:2645-2703`; the confirm dialog still gates a roll |
| R03 Heal heals the healer | W04 | stands (**high**) | `resolver.js:281-284` (`requires` read on the roller); vendor Heal "take or give" |
| R04 "-1 health" free at 0 | W14 | stands (medium) | `sufferDialog.js:301-302`; decisions.md #314 Q02 "Harm or stress past the meter is momentum" |
| R05 two suffer moves = one move twice | W15 | stands (medium) | `sufferDialog.js:63-72`, `sufferCard.js:65-66`; vendor Set a Course / Undertake text |
| R06 Sacrifice at 0 while unprepared | W16 | stands (medium) | `sufferExecutor.js:341-371` (the "Phase D" dialog no longer exists); MOMENTUM-MIN-REDIRECT-MANUAL names momentum only |
| R07 ability adds summed | W12 | stands (medium) | `abilityScanner.js:408-420`; `settingsPanel.js:2293-2297` (all-or-nothing checkbox) |
| R08 count-as on a miss | W13 | stands (medium) | decisions.md "Post-roll 'improve the result'": only explicit "improve … to a strong hit"; Heavy Cannons "On a miss, you must suffer a dire outcome" |
| R09 Compel / Resupply / Aid Your Ally / companion text | W17 | stands (medium; the companion part is card text — the executor is gated) | `resolver.js:433-434`, `:1019-1024`, `:440-443`, `:935-936`; `sufferExecutor.js:419` |
| R10 bond / swear adds | W18 | stands (medium) | `index.js:1028`, `:1036`, `:1042-1044` (the only adds); vendor Test Your Relationship / Swear an Iron Vow |
| R11 unlisted stat rolled | W19 | **partly refuted** (low): the Chaotic framing deliberately asks for unusual stats (`mischief.js:97`, `:132`); the clamp is missing under Lawful and Balanced too | `interpreter.js:524-535` |
| R12 Auto perspective counts the GM | W21 | stands (medium) | decisions.md "Narrator tone and perspective": "active non-GM users"; `narratorPrompt.js:1184-1190` |
| R13 Make a Connection on a pending draft | W23 | stands (medium) | `entityExtractor.js:477`, `:549`; decisions.md D4 "only make_a_connection auto-creates" |
| R14 endScene drops concurrent facts | W24 | stands (medium) | `sceneLifecycle.js:119-189`; distinct from END-SESSION-STALE-ENDSCENE (a pre-await snapshot) |
| R15 chronicle scribe without thinking-off | W27 | stands (medium, **API** premise) | `chronicleWriter.js:180-181`, `:245-249`; `narrator.js:3558-3579`; the five other callers pin nothing |
| R16 X-Card: stale ledger / summary / ship position | W05–W07 | stands (medium) | decisions.md U07 "full exclusion … its state and frame removed, the summary reset"; `narrator.js:1176-1183`; `persistResolution.js:173` |
| R17 Roll button credits the clicker / PC-less player rolls PC1 | W09 / D8 | **partly refuted**: (a) stands; (b) the pipeline's first-PC fallback is recorded in decisions.md "Multiplayer attribution" (moved to D8) | `index.js:7258-7264` (no speaker); decisions.md:4637-4656 |
