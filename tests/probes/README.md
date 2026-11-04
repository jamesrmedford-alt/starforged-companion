# Bug-audit probes — the ninth audit (2026-11-04)

Probe tests from the ninth bug audit of `8715172`
(`docs/testing/bug-audit-9-2026-11-04.md`: 61 findings X01–X61 and 15
decisions D1–D15).

Filed as GitHub issues [#329](https://github.com/jamesrmedford-alt/starforged-companion/issues/329) (X01–X14),
[#331](https://github.com/jamesrmedford-alt/starforged-companion/issues/331) (X15–X61) and
[#330](https://github.com/jamesrmedford-alt/starforged-companion/issues/330) (D1–D15, the excluded rows and the refuter pass).

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
| `cards/cardRepostAsClicker.probe.js` | X05 |
| `cards/connectionPickPclessPlayer.probe.js` | X19 |
| `cards/milestonePickCompletedVow.probe.js` | X20 |
| `cards/nativeForgeWrongConnection.probe.js` | D5 |
| `cards/playerVowLinkQuotedName.probe.js` | X21 |
| `cards/rewardLinkRefusedWrite.probe.js` | X07 |
| `cards/thresholdCardNoClaim.probe.js` | X06 |
| `continuity/archivedTruthStaysRetracted.probe.js` | X31 |
| `continuity/consistencyCheckStaleLedger.probe.js` | X02 |
| `continuity/consistencyCheckStaleLedgerPipeline.probe.js` | X02 |
| `continuity/loreRumourReconfirmed.probe.js` | D9 |
| `continuity/sceneCommandCachedWrite.probe.js` | X10 |
| `continuity/worldJournalPageBodyStale.probe.js` | X30 |
| `continuity/xcardCaptureNoNarrationId.probe.js` | X01 |
| `entities/createIdCachedMutate.probe.js` | X35 |
| `entities/factionDetectTwoEncounters.probe.js` | X33 |
| `entities/notesSheetNotMirrored.probe.js` | X12 |
| `entities/severBondItemStays.probe.js` | D10 |
| `entities/shipFinaliseReseedsAutoSeeded.probe.js` | X34 |
| `entities/shipSeedStaleRecordWrite.probe.js` | X32 |
| `lead/fileStructureDrift.probe.js` | X61 |
| `multiplayer/audioCacheWriteUnchecked.probe.js` | D11 |
| `multiplayer/audioSynthSpecUnbounded.probe.js` | X51 |
| `multiplayer/errorLogRelayRawHtml.probe.js` | X53 |
| `multiplayer/moveLockReleasedByStalePipeline.probe.js` | X08 |
| `multiplayer/sharedSupplyRefusedWriteAbortsPass.probe.js` | X52 |
| `narration/activeConnectionsCount.probe.js` | X29 |
| `narration/campaignRecapCardUnescaped.probe.js` | X24 |
| `narration/clockVignetteNpcMarkup.probe.js` | X27 |
| `narration/narrationCachedStoreWrites.probe.js` | X09, X10 |
| `narration/narratorPersistsCachedStore.probe.js` | X25, X26 |
| `narration/oracleFollowupLength.probe.js` | X28 |
| `narration/spotlightNamesTheRoller.probe.js` | D8 |
| `pipeline/battleGoneEatsNextMoveAdds.probe.js` | X17 |
| `pipeline/cardButtonsClickerRoller.probe.js` | X05 |
| `pipeline/refusedPersistLosesLegacyMark.probe.js` | X18 |
| `rules/assetAddsCostMention.probe.js` | X04 |
| `rules/assetStatSubstitution.probe.js` | X23 |
| `rules/legacyProgressScore.probe.js` | D6 |
| `rules/planetSampleNames.probe.js` | X48 |
| `sectors/oracleMemoryLostUpdate.probe.js` | X44 |
| `sectors/oracleRefNotFollowed.probe.js` | D13 |
| `sectors/sectorNamesakeFolders.probe.js` | D14 |
| `sectors/sectorStoreCachedMutation.probe.js` | X11 |
| `sectors/siteDiscoveredCardEscaping.probe.js` | X45 |
| `sectors/sitePinRenameStale.probe.js` | X46 |
| `sectors/truthDescriptionsAbridged.probe.js` | X47 |
| `session/beginSessionRefusedSilent.probe.js` | X13 |
| `session/campaignStartCachedBegin.probe.js` | X36 |
| `session/endSessionGateOpenWindow.probe.js` | X41 |
| `session/incitingPremiseCachedMutate.probe.js` | X38 |
| `session/pacingTelemetryJournalRace.probe.js` | X39 |
| `session/readyMintCachedMutate.probe.js` | X40 |
| `session/rollForceConsumedByRefusedLine.probe.js` | X37 |
| `session/sessionGateSilentDrop.probe.js` | X14 |
| `session/sessionNumberPrepLoad.probe.js` | D12 |
| `sweep/cachedFlagMutatedBeforeWrite.probe.js` | X42 |
| `sweep/claimBeforeRefusedWrite.probe.js` | X07 |
| `sweep/oracleNarrateUnchecked.probe.js` | X49 |
| `sweep/playerPathGmGated.probe.js` | X22, X58 |
| `sweep/producedButDead.probe.js` | X55 |
| `sweep/recapCardUnescaped.probe.js` | X24 |
| `sweep/setupCardWhisperAllGms.probe.js` | X54 |
| `sweep/takeBreakDialogClose.probe.js` | X43 |
| `ui/entityPanelStaleOnState.probe.js` | X56 |
| `ui/entityPortraitAltUnescaped.probe.js` | X57 |
| `ui/helpRoleClaimsDrift.probe.js` | X59 |
| `ui/sessionPanelEnvisionPlayer.probe.js` | D15 |
| `ui/settingsReferenceCoverage.probe.js` | X60 |
| `upgrades/endureAtZeroMarkAndRoll.probe.js` | X03, D3 |
| `upgrades/loseMomentumAtMinFree.probe.js` | Excluded — the known MOMENTUM-MIN-REDIRECT-MANUAL item (kept as its control) |
| `upgrades/redirectPickerSurvivesBurn.probe.js` | X15 |
| `upgrades/riderSupplyZeroUnprepared.probe.js` | X16 |
| `upgrades/upgradeClosedByOwnSuggestion.probe.js` | D2 |

## Refuter verdicts

Thirty rows whose status turned on intent, a rules reading or overlap with a known item were each handed to one of two independent adversarial refuters with four refutation routes (a documented decision, an open known item, the rules text, a misread of the code); every probe on their lists was run singly and failed on its own assertion. **Twenty-six stand as filed; four were partly refuted and one was refuted**, and this document reflects it:

- Refuted — **LOSE-MOMENTUM-AT-MIN-FREE** is the known MOMENTUM-MIN-REDIRECT-MANUAL item, parked by the issue #314 decision's rejection, and its "nothing else asks for the cost" is a misread (the executor's own card says the remainder is owed); it is listed under "Excluded — already tracked" with the one line that survives, and its probe is kept as a control of that item.
- Partly refuted — **NATIVE-FORGE-SOLE-ACTIVE-FALLBACK** coincides with the decided Forge a Bond fallback (issue #301 B01) and the recorded BOND-COMMAND-FALLBACK family; what survives is the one-line question whether a sheet roll's exact Item name should resolve strictly, so it moved from the findings to **D5**. **UPGRADE-CLOSED-BY-OWN-SUGGESTION (D2)** is the letter of issue #326 D4; what survives is the UX trap (no ordering hint on the ⚑ / 🤝 buttons), and the refuter recommends option B. **THRESHOLD-CARD-NO-CLAIM (X06)**'s relay half is the known RELAY-LEGACY-KINDS item; the no-claim half and the second-fight consequence stand. **SESSION-NUMBER-BURNED-BY-PREP-LOAD (D12)** is the letter of the recorded "next load or Begin starts the session" rule; what survives is whether a session nobody Began should hold a number, and the refuter recommends a narrowed option A.
- The refuters' recommendations on the decision rows: D1 A, D2 B, D3 A, D4 A, D5 (the maintainer's one-liner), D8 A, D9 A, D10 A with B's reader change (a module `lost` flag, not the vendor's `completed`), D11 A, D12 A narrowed, D13 A, D14 B (a re-roll at creation); X03 is resolved by D3's option A.

The verdicts, with their citations, follow (and are repeated in `tests/probes/README.md`).

### Refuter A — moves, rules, cards and sectors (15 entries)

- **X03 ENDURE-AT-ZERO-MARK-AND-ROLL — stands.** The vendored Endure Harm miss reads "If your health is 0, you must also mark wounded or permanently harmed, *or* roll on the table below" — one of three; the executor marks wounded whenever health reaches 0 and rolls the table when the trigger was a miss (`sufferExecutor.js:211-221`, `:254-263`). The double is documented only in the file header (issue #214 §5.4) and the coverage table, never in decisions.md; the play kit's own row says "mark … or roll". D3's option A resolves it; under option B the "or" still needs a choice.
- **D3 ENDURE-HARM-STEP-ESCALATION — stands, genuinely undecided; the refuter would take A.** The vendored text makes the resist roll at 0 mandatory and puts the mark / table on *its* miss; every Pay the Price route runs the executor with `isMiss: true` (`index.js:6049`). A "Resist the harm — roll Endure Harm" prompt at 0 whose miss card offers mark wounded / mark permanently harmed / roll the table is the rules' shape and closes X03 too; B freezes a path that skips a mandatory roll and lands Face Death on a Face Danger miss.
- **X15 REDIRECT-PICKER-SURVIVES-UPGRADE — stands.** Issue #311 P03 is the rule the picker escapes, not an exception: choice cards carry their move's `resolutionId` and an upgrade retires the superseded outcome's pending card; the W16 redirect picker is posted without the id (`sufferExecutor.js:357-364`; the dispatcher passes only `{ amount, itemId, isMiss }`), so `outcomeChoiceCards` never matches it. Low.
- **X16 RIDER-SUPPLY-ZERO-NO-UNPREPARED — stands.** "When you lose or consume resources, suffer -1 supply … If your supply is exhausted (reduced to 0), mark unprepared"; #315 S04 made `markUnprepared` the one writer for the zero-supply impact, and at HEAD it has two callers (the executor and Repair's trade) — the riders' `applyMeterRiders` → `applyMeterChanges` is a third supply writer outside it. The S07 rejection argues against mirroring through the sync hook, not against a rules-defined loss. Low.
- **D2 UPGRADE-CLOSED-BY-OWN-SUGGESTION — partly refuted; the refuter would take B.** Issue #326 D4 has no exemption by roll kind or origin, and the ⚑ press *is* the roller's next pipeline move (`applyMilestoneSuggestion` posts a forced `reach_a_milestone` as the roller); D4's rationale applies in miniature — a burn after the milestone card re-narrates the Face Danger as the latest beat. What survives is the UX trap: ⚑ / 🤝 sit beside 🔥 with no ordering hint and the help says nothing. B (keep D4; the buttons and the help say "burn or improve first") is the recommendation; A's narrow form (exempt only a no-roll move posted from the same card) is the smallest deviation if the maintainer values the upgrade more.
- **X17 BATTLE-GONE-EATS-NEXT-MOVE-ADDS — stands.** Both decisions tie the +1 to an action roll that is made (decisions.md "the next action roll"; V02 "a refused claim adds nothing and leaves it pending"); the adds are consumed at `index.js:1151-1162`, before the fight-over and track-gone guards return (`:1182-1199`). Progress moves never take the adds, so Battle is the one move the gap reaches. Low.
- **D4 HEAL-SELF-LOWER-STAT — stands, genuinely undecided; the refuter would take A.** The vendored Heal's self-mend option is encoded `"Method": "Lowest", "Using": ["Iron","Wits"]` — the data carries the rule; the code has only `PICK_HIGHER_OF`, and no decision or known item records a Heal stat approximation (W19 holds a typed move to its listed stats, which iron is). A: ask the interpreter for the Heal situation and add a lower-of rule for "self"; B documents rolling the wrong stat by up to the stat spread.
- **D1 VOW-BOND-MISS-RECOMMIT-ADVISORY — stands; the refuter would take A.** "Flow-audit soft spots" reaffirms four advisory choices and states the principle "implemented every gap where a faithful Starforged mechanic exists (… expedition recommit …)"; the vow and bond recommits are not among the four, and their vendored miss text is the expedition's mechanic verbatim. `performRecommit` already holds the rule; mind the Item's numeric rank (`rankName`, W01).
- **D5 NATIVE-FORGE-NAME-STRICT (filed as NATIVE-FORGE-SOLE-ACTIVE-FALLBACK) — partly refuted (mostly); moved to the decisions as D5.** The probe's expectation (a Forge a Bond whose name matches nothing forges nothing) contradicts the decided Forge a Bond fallback, issue #301 B01: "with no id and no matching name it takes the sole un-bonded connection, else nothing". The native path uses the plain ladder without `unbonded: true`, but in the row's scenario its effect coincides with B01 (the sole-bonded rung is a no-op because `payForgedBondNative` returns on a bonded target; the sole-active rung reaches the one unbonded connection), and the mechanism is recorded under BOND-COMMAND-FALLBACK / DEEPEN-LINK-FALLBACK and the stale-name case under BOND-ITEM-NAME-STALE. What survives: the native path omits `unbonded: true` (harmless today), the scenario needs a hand-made bond Item the module never mirrors, and whether a sheet roll's exact Item name should resolve strictly (as U14 made `!sever`) is a one-line question for the maintainer. Low.
- **X06 THRESHOLD-CARD-NO-CLAIM — partly refuted.** The relay half is RELAY-LEGACY-KINDS verbatim ("`combat.enterFray` … fold them into GM_ACTIONS when next touched") and the row's fix is that fold. What is new: no item records that this card has no claim (CARD-STAMP-NONOWNER and the two LOCAL-DISABLE items name other buttons), and the fight-over consequence — a stale Enter the Fray after the fight ended creates a second track — is a sharper harm than a repeated nudge. Medium holds for the Enter-the-Fray double; the way-out double alone is low.
- **X22 TRACKER-BADGE-PLAYER-SILENT — stands (the cards and sweep rows are one item, merged).** No decision makes the badges GM-only: "Combat position is per character" names the badge as a mirror and the soft-spots entry makes the *range* badge advisory — neither says who may click; U19 made the panel toggle relay for players, while the badges are built on every client with "Click to toggle" titles and a bare `isGM` return without even the `console.debug` "No silent failures" asks of a deliberate no-op. Low.
- **X47 TRUTH-DESCRIPTIONS-ABRIDGED — stands.** The only "condensed" decision is about titles (V34's rejection: "the module's option titles are condensed from the book's"); the W76 commit regenerated the quest starters because nine "stopped before their closing question" — the same shape as these five descriptions, each verified against the vendored page. Low.
- **D13 ORACLE-REF-NOT-FOLLOWED — stands; the refuter would take A.** U68 decided only the directives ("Roll three times", "roll twice", Ultra-scale); the other refs are left by a code comment ("a label its caller may follow via `refTableId`") that nothing outside `roller.js` reads — produced-but-dead as the row says. The vendor encodes such a row as a link to the next oracle, i.e. the data names the table to roll; `rollAndResolve` already follows Ultra-scale in place.
- **D14 SECTOR-NAMESAKE-FOLDERS — stands, not genuinely undecided; the refuter would take B.** Not recorded (SECTOR-DUPLICATE-NAMES is settlements within a sector; FOLDER-001 assumed unique names), and the code is as the row says — but a sector name is never typed: `generateSectorName` rolls prefix + suffix from two 50-row tables (2,500 names), so a namesake needs the same pair twice (≈0.4 % across five sectors). A re-roll at creation when the rolled name is already stored is one check at the source and makes every name-keyed consumer correct at once. Low.
- **LOSE-MOMENTUM-AT-MIN-FREE — refuted (a known item, and a misread).** It is MOMENTUM-MIN-REDIRECT-MANUAL ("Lose Momentum at -6 — its own, or a harm's overflow (Q02) — says on its card that the remainder must be redirected … but no card offers the choice"), which the maintainer parked in the #314 decision's rejection ("Lose Momentum's own at-min has no card either … Recorded as MOMENTUM-MIN-REDIRECT-MANUAL, for both at once"). The row's "nothing else asks for the cost" is a misread: the pick runs `loseMomentum` with no `skipCard`, which posts its own card "Momentum: -6 → -6 (at minimum; pick a redirect or clear progress)" (`sufferExecutor.js:131-135`); the probe counts only cards carrying a `sufferPrompt`. The known item's proposed fix resolves the scenario. One line survives under the known item: the choice card's resolved text reads "Applied: Lose Momentum (-2)" beside the executor card that says the remainder is owed. The probe (`upgrades/loseMomentumAtMinFree`) is kept as a control of that item, not a finding.
### Refuter B — narrator memory, safety, entities, multiplayer and sessions (16 entries)

- **X02 CONSISTENCY-CHECK-STALE-LEDGER — stands.** The strongest counter is scope: W05's decision reads "A narration reads the scene ledgers … from the live store when it is written", and its regression tests cover the prompt only. That does not hold: the audit is defined by its own decisions as a check against the retractions as they stand ("Retraction is enforced, not cosmetic … the consistency check audits prose against retractions"; "Consistency check defaults on, audits the full ledger block", default true), and the flow map promises RETRACTED FACTS are "never a truth the X-Card retracted … so the removed content is not handed back". At HEAD `narrator.js:3499` passes the caller's snapshot to `runConsistencyCheck`, and `consistencyCheck.js:65-69` builds the audit's ledger block from it, so an X-carded truth is handed back as a BINDING truth and a struck one is audited as active. W05 is an incomplete fix, not a cover; 6b applies. Medium: the setting defaults on and a high-confidence hit posts a GM review card that can name the removed content.
- **X01 XCARD-CAPTURE-NO-NARRATION-ID — stands; materially distinct from XCARD-LATE-CAPTURE.** That item is the race *after* the card, and its parenthetical asserts that copies already written are reached. This finding is the opposite case — the capture completed before the card — and shows the parenthetical holds only for copies that restate a sidecar truth about its subject (`retractions.js:104-132`, U39's subject rule): a capture's lore entry, Session Log beat or threat carries no `narrationId` (`entityExtractor.js:1036-1109` passes none) and nothing links it to the narration. U07 chose full exclusion and 6b says "Anything a narration writes outside the ledgers carries its `narrationId`" — a gap in U07's implementation, not a choice. The known item's parenthetical should be corrected when this is fixed.
- **X31 ARCHIVED-TRUTH-STAYS-RETRACTED — stands.** W60 covers the ledger only ("the set lifts the strike (`correctedTo`)", `ledgers.js:593-621`); nothing restores the lore copies the strike's `propagateRetraction` retracted, and B6's recorded restore path is `!journal lore "<title>" confirmed`. But W60 made `!truth set` a GM ruling that lifts the strike so "the two never render together" (6b): the live truth is migrated at scene end and its archive is a retracted page `getConfirmedLore` drops — the fact the GM ruled canon is in no store the narrator reads. Low. Prefer the row's second fix (the lift at `setTruth` un-retracts the copies the strike retracted) over `archiveSceneTruth` passing `retracted: false`, which could un-retract a page an X-Card retracted by fact overlap from another narration.
- **D9 LORE-RUMOUR-RECONFIRMED — stands, genuinely undecided; the refuter would take A.** B6 / U40 ("`rumour` clears the strike but keeps the entry out of canon and the review queue") is a statement about the ruling's moment; the only re-detection protection recorded is for a struck entry. "World lore auto-confirms" predates rulings and was about the pending queue being friction — it says nothing about a fact the GM has already reviewed and ruled. The command's own contract is "The GM's ruling on an entry: confirmed or rumour" and the consistency-check principle is "nothing auto-corrects (GM stays the authority)"; a ruling the narrator overturns by repeating itself is not a ruling. Note for the fixer: a rumour ruling and a manual `!journal lore "x" — text` are the same stored shape, so A also keeps a GM's manual rumour a rumour after the narrator mentions it, with `!journal lore "<title>" confirmed` as the documented promotion.
- **D8 SPOTLIGHT-NAMES-THE-ROLLER — stands (a decision row); the refuter would take A.** "Multiplayer spotlight is implied by narration" defines a per-scene round-robin pointer "computed deterministically in code" whose purpose is "keeping the spotlight moving toward quieter players"; first-beat → first-by-id is the letter of that pure pointer, but the decision neither includes nor excludes the roller, and its stated purpose argues against naming the PC who just acted. `maybeAdvanceSpotlight` passes no roller and `selectSpotlight` has no roller parameter, so at a two-PC table every new scene has a coin-flip chance of naming the first mover. A stays within the decision and serves its purpose; B only documents the wart.
- **X28 ORACLE-FOLLOWUP-LENGTH-CONFLICT — stands.** W40's wording and the help ("Companion Settings' Length now applies to move and paced narration only, and says so") make the Length setting not govern the oracle follow-up by design — yet `narrator.js:2008` reads it into the user message while the role says 2–3 sentences. The row's first fix (the role's count) is the one consistent with W40 and the help. Low.
- **X29 ACTIVE-CONNECTIONS-COUNTS-LOST — stands (low).** `buildConnectionsSummary` is live in every prose path's system prompt (called at `narratorPrompt.js:1632`); `loseConnection` writes `active: false` only, and W37 chose that the roster "lists a lost connection apart", so one prompt says both. No decision covers the count block (commented "legacy"); dropping it is the cleaner fix.
- **X12 NOTES-SHEET-NOT-MIRRORED — stands.** W39's own wording treats the sheet's Notes (the portrait block and envisioned headings live in `system.notes`) as what reaches the card, and the help says "An NPC's or a ship's notes reach the narrator as text"; decisions elsewhere name `system.notes` as the notes store ("Text goes where the Starforged sheet puts it … The narrator already reads both"); none names the record flag canonical. The refuter would name the sheet canonical and have the card read `system.notes` for Actor-hosted types (one store, no second mirror to drift).
- **X34 SHIP-FINALISE-RESEEDS-AUTOSEEDED — stands (low).** By P07's letter a ship with no `finalizedAt` is re-seeded — but P07's harm statement is exactly this press ("A ship's Finalise re-ran its seed on every press — a fresh introduction written over Notes the GM had edited"), the creation-hook case was handled for connections (`seeded` → stamp only) and not for ships, whose auto-seed stamps nothing; `starshipHasSeedDetail` is the predicate the connection rule needs. The help's walkthrough still says "click ✦ Finalise" after creating the ship, so the documented path hits it with Auto-Seed on (off by default).
- **D10 SEVER-BOND-ITEM-STAYS — stands (a decision row); the refuter would take A with B's reader change.** Decisions on `!sever` cover target selection only; the consumers of `active: false` were fixed one by one (W37 the roster, U61 the end vignette) and the bond Item — the record's write-through mirror for ticks and rank (BOND-ITEM-MIRROR, Q04) — is the next. A reader-only filter leaves the vendor Connections tab, which the module cannot filter, listing a severed bond as live; but write a module flag (`flags[MODULE].lost`) on the Items rather than the vendor's `completed`, which the sheet renders as "Completed" (forged), and have `readConnections` and the name selectors report `lost`. Whether the Item should be deleted instead is the maintainer's call.
- **X08 MOVE-LOCK-RELEASED-BY-STALE-PIPELINE — stands.** W25 ("the lock records its claimant") and its rejection "*Expire the move lock by age* — a long narration would lose its lock mid-flight; the claimant's departure is the event that matters" record the intent that a live pipeline keeps its lock; the finding is the symmetric breach — `releasePendingMoveLock` clears the lock whoever claimed it. S01 fixed only the same pipeline's double release; no open handover item covers a cross-claimant release. On the blip model: the API reference has no `userConnected` entry, and the module's own W25 comment lists "dropped mid-move" beside crashed / closed — a socket drop with the page alive is W25's own trigger, and the narration's HTTP call is not cancelled by it. Medium is fair: two GMs and a blip, but the consequence is the concurrent pipeline the lock exists to prevent.
- **D11 AUDIO-CACHE-WRITE-UNCHECKED — stands (a decision row); the refuter would take A.** W81's rule was applied to `audio.synth.request` and left unapplied to its sibling: `handleCacheWrite` files `payload.hash` unchecked and `cache.write` uploads with no existence check; the path is reachable since W79 (a keyed non-canonical client whose cache ask misses synthesises and relays the bytes). AUDIO-KEYED-NONCANONICAL-DUP is two clients synthesising one clip, not the GM overwriting a cached file. B would strand the configuration the relay serves — a keyed player at a keyless GM's table, whose synthesis the GM then serves to keyless players — so bound the write as W81 bounds the request (the sender passes the segment's spec; the GM accepts only when `cacheKey(spec) === hash` and no file exists). The attacker must hold a key, which bounds the exposure.
- **X14 SESSION-GATE-SILENT-DROP — stands.** Dropping pre-session narration is deliberate (the gate exists "without burning Claude credit on every chat message during setup") — but "No silent failures" requires a deliberate no-op to `console.debug` on the deciding client, and `index.js:780-791` logs nothing; no decision says the author may be told nothing, and the help has no troubleshooting entry for it. Part (b) is the real loss: the inciting card's ⚔ press disables its button for good, the forced post lands and the gate drops it before the forced-move handling — no roll, no vow, no notice — while W02 ("a press that meets the move lock is held, not dropped") is the repo's standard for a press meeting a guard, and the Progress Tracks panel already checks the gate. Medium for (b); (a) alone would be low.
- **X41 END-SESSION-GATE-OPEN-WINDOW — stands (low); distinct from END-SESSION-STALE-ENDSCENE.** That item is a stale-snapshot write of the scene; this is the gate still reading open in the store through the same awaits, so a new move is rolled and narrated into the session being ended. N08 is about a second End; END-SESSION-CLOBBER fixed the write's merge, not its timing, and persisting End's owned gate fields first is compatible with `mergeOwnedFields` and also narrows the known item's window for new writes.
- **D12 SESSION-NUMBER-BURNED-BY-PREP-LOAD — partly refuted; the refuter would take A, narrowed.** The behaviour is the direct consequence of two recorded rules: "The next world load or Begin a Session, whichever comes first, starts the new one (`rollSessionIfDue`)" (with "*Mint at End a Session*" and "*Re-mint on the first message after an idle gap*" rejected), and the help says the same under "When a session starts" — so a prep-only load starts a session by definition and `mintSession` numbers every session it mints; "burned" is not a defect against any decision. What survives is the question no decision answers: whether a session nobody Began should hold a number. A narrowed to a pure criterion — a closing session that was never Begun (`sessionStartedId !== closing`) does not advance `sessionNumber` at the next mint (the id still changes) — since `mintSession` already treats an empty session as not-a-session for LAST SESSION, and the Session Log, `!recap session N` and every narrator card use the number as the table's count.
- **X43 TAKE-BREAK-X-CLOSE-REJECTS — stands.** The only counter is the repo's own API reference, whose `DialogV2.wait` example ends "`null (if closed)`" and documents no `rejectClose` — wrong for `wait`: Foundry's `DialogV2.wait({ rejectClose = true, … })` rejects a dismissed dialog with "Dialog was dismissed without pressing a button." (the exact text the probe reproduces), while `confirm` / `prompt` default it to false, which is why the reference's other examples are fine. The repo's own code already treats `wait` as rejecting (`riderDialog.js:103-115` try/catch; `correctionDialog.js:80` passes `rejectClose: false`); `sessionDialogs.js:210-228` has neither, and its `if (choice === "cancel" \|\| !choice) return;` shows a null was expected. No Foundry source is available offline, so the default rests on the probe's verbatim message and the riderDialog precedent; the fix is correct under both readings, and the reference's `wait` comment should be corrected with it.

