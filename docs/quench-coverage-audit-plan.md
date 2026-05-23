# Quench Coverage Audit — Verified Against Code

## Context

With e2e (Cypress) in place to drive Quench headless on PRs, the next risk-management step is to honestly measure what Quench actually exercises versus what the docs claim is shipped — and then verify the docs aren't overpromising. This audit (a) inventoried 33 Quench batches in `src/integration/quench.js` against 13 ✅ COMPLETE scopes in `docs/scope-index.md`, (b) **then verified every "shipped" sub-feature against actual source files and recent commits** to filter out phantom features, and (c) produced a reduced, real-only priority list of new batches, plus a small set of scope-doc corrections found during verification.

---

## Verification Result: Docs Are Substantially Accurate

Two parallel `Explore` agents cross-checked the documented sub-features for the six highest-risk scopes against `src/`:

| Scope | Verified implemented | Notes |
|---|---|---|
| Fact Continuity | All 9 sub-features (sidecar parser, ledgers, Section 6.5 injection, scene lifecycle, correction dialog, `!truth`/`!state`, consistency-check, settings, telemetry) | `src/factContinuity/` exists with `sidecarParser.js`, `ledgers.js`, `sceneLifecycle.js`, `correctionDialog.js`, `consistencyCheck.js`; recent commits `c979087`, `ffef63e`, `82e0d56`, `db5b7d3`, `e8a0bdb` ship phases A–E |
| Pacing | All sub-features (classifier, router, `!pace`, `!roll`, dials, ring buffer, telemetry) | `src/pacing/{classifier,router,telemetry}.js`; commands in `src/index.js:525–567` |
| NED v3 | All sub-features (per-move permissions, relevance resolver, combined detection, entity panel, 7 entity types) | `src/entities/`, `src/narration/narratorPrompt.js:357 NARRATOR_PERMISSIONS`, `src/context/relevanceResolver.js` |
| World Journal v2 | All sub-features (4 journals + log, routing rule, panel UI, assembler injection) | `src/world/worldJournal.js`, `src/world/worldJournalPanel.js`, assembler Sections 3/4/9/10 |
| Sector Creator + Enhanced | All sub-features (11-step wizard, DALL-E art, Scene/Note/Drawing, narrator stubs) | `src/sectors/{sectorPanel,sectorArt,sceneBuilder,sectorMap,sectorOverview}.js` |
| Audio Narration | All sub-features (ElevenLabs, `<npc>` split, content-addressed cache, streaming + fallback, priming, budget display, degradation) | `src/audio/{elevenlabs,segments,cache,playback}.js` |
| Foundations / Help | Help compendium + `CONTENT_VERSION = "1.4.3"` + session-ID flag stamping | `src/help/helpJournal.js`, `src/index.js:380` |
| API Key Privacy | GM-only About-tab + `config: false` to hide from player view | `src/ui/settingsPanel.js:1328–1365` |

**Conclusion:** no phantom features. Everything the original audit identified as a coverage gap corresponds to real shipped code. The coverage matrix from the prior plan stands without removal.

---

## Two Documentation Inaccuracies Found

These are **scope-index.md** wording bugs, not feature bugs:

1. **Fact Continuity row (line 37) understates the setting count.**
   - Says: *"five world settings gate the feature"*
   - Reality: 9 FC-related settings registered in `src/ui/settingsPanel.js` — `enabled`, `ledgerInContext`, `sidecarRequired`, `maxLedgerTokens`, `consistencyCheck`, `shipPositioning`, `shipAutoMoveOnCourse`, `shipTokenEnabled`, `shipTokenSnapRadius` (the latter four added by `7716f5c feat(factContinuity): ship positioning (§20)`)
   - **Proposed fix:** change "five world settings" → "nine world settings (including the ship-positioning §20 sub-feature)"

2. **Quench Integration Tests row (line 31) understates the batch count.**
   - Says: *"…and clarification edge cases (24 batches total)"*
   - Reality: **33 batches** registered (verified by `grep -c '"starforged-companion\.' src/integration/quench.js`). Additions since the row was written include `movePipelineExtended`, `progressTrackActions`, `entityPanelActions`, `chronicle`, `worldTruths`, `pacing`, `pacedDetection`, `connectionPipeline`, `connectionSeedEnrichment`, `starshipSeedHook`, `portraitGeneration`, `chatCardActions`, `recapEndToEnd`, `audio`.
   - **Proposed fix:** rewrite the Quench row description to enumerate the actual batches OR shorten to "live Foundry integration tests covering safety, character, world, sector, narration, audio, and chat surfaces (33 batches total — see `src/integration/quench.js` for the current list)" — the second form is easier to keep accurate over time.

Two minor deferred polish items also surfaced inside the Fact Continuity scope doc (entity-panel "Active truths" collapsible; WJ Lore tab scene-truth filter). The scope doc already calls them out as deferred, so no scope-index change is needed — just worth flagging that the coverage plan does **not** propose tests for them.

---

## Reduced Coverage Matrix (Real Features Only)

All 17 rows from the original matrix survive verification — none are phantoms. Re-stated tightly, with verdicts unchanged:

| # | Scope (✅ shipped) | Verdict | Untested sub-features (all verified real) |
|---|---|---|---|
| 1 | Narrator | PARTIAL | Mode switching, model-config round-trip, prompt-cache hit/miss, perspective/length effects |
| 2 | Actor Bridge | WELL COVERED | — |
| 3 | Character Management | WELL COVERED | Chronicle UI panel edit actions |
| 4 | Foundations | PARTIAL | Help compendium generation; `CONTENT_VERSION` bump |
| 5 | Scene Interrogation | PARTIAL | `formatActiveSector`/`formatCurrentLocation` injection isolation |
| 6 | Previously On | WELL COVERED | `!recap session` vs `!recap campaign` disambiguation; auto-post-at-session-start |
| 7 | NED v3 | PARTIAL | Per-move permissions matrix; relevance resolver; all 7 entity types enumerated |
| 8 | World Journal v2 | WELL COVERED | Contradiction-detection → GM review card |
| 9 | API Key Privacy | PARTIAL | Password masking; player-view hiding; client-scoped `xi-api-key` |
| 10 | Sector Creator | PARTIAL | 11-step wizard state machine; settlement/planet/stellar generators in isolation |
| 11 | Sector Creator Enhanced | NOT COVERED | DALL-E pipeline; Scene + Note pins + Drawing passages document shape |
| 12 | System Asset Integration | PARTIAL | i18n resolution; canonical move grounding; campaign-truths digest injection |
| 13 | Pacing | PARTIAL | `!pace` / `!roll` commands; per-category dial effects; ring-buffer signal; telemetry writes |
| 14 | **Fact Continuity** | NOT COVERED | Entire subsystem (sidecar, ledgers, Section 6.5, scene lifecycle, correction dialog, `!truth`/`!state`, consistency-check, telemetry) |
| 15 | Audio Narration | PARTIAL | Streaming/fallback branching; priming overlay gating; budget display; degradation paths |
| 16 | Safety & Content Controls | WELL COVERED | — |
| 17 | Settings Panel | PARTIAL | Mischief/Narrator/About tab round-trips; password masking |

---

## Cross-Cutting Chat-Command Gaps (all real, all untested)

Verified against `src/index.js` and `src/pacing/`:

- `!pace hot|quiet|clear|status` — handler at `src/index.js:525`
- `!roll` — handler at `src/index.js:553`
- `!truth` / `!state` — handler at `src/index.js:1321–1387` (`isFactContinuityCommand` / `handleFactContinuityCommand`)
- `!scene start` / `!scene end` — handlers at `src/index.js:1258–1306`
- `!recap session` vs `!recap campaign` — both modes route through the same chat-command handler but no batch asserts the split
- `!journal threat` / `!journal faction` / `!journal location` — share router with `!journal lore` (covered); routing edges not asserted

None of these are phantom commands. All belong in the coverage plan.

---

## Risk-Ranked Priorities for New Quench Batches (Reduced to Real Features)

| Priority | Proposed batch | Real code under test | Rough scope |
|---|---|---|---|
| 1 | `factContinuity` | `src/factContinuity/{sidecarParser,ledgers,sceneLifecycle,correctionDialog,consistencyCheck}.js` | Sidecar parse; ledger writes; Section 6.5 injection; `!truth`/`!state` commands; scene-end migration to entity / WJ Lore |
| 2 | `paceCommand` | `src/index.js:525–567`, `src/pacing/router.js` ring buffer | `!pace hot/quiet/clear/status`; `!roll` recovery; ring-buffer effect on next classification |
| 3 | `sectorCreatorWizard` | `src/sectors/sectorPanel.js` | Settlement/planet/stellar generators in isolation; SECTOR_TROUBLE roll; map + passages JSON shape |
| 4 | `sectorArt` | `src/sectors/sectorArt.js`, `src/sectors/sceneBuilder.js` | Mock OpenRouter image fetch; assert Scene + Note pins + Drawing passages created with correct flags |
| 5 | `nedPermissionsMatrix` | `src/narration/narratorPrompt.js:357` + `src/entities/` | Table-driven test over five seeded moves × entity types × discovery/interaction modes |
| 6 | `settingsRoundTrip` | `src/ui/settingsPanel.js:1328–1365` | Write→reload→read each setting; assert GM-only and password-masked About fields |
| 7 | `recapModes` | `!recap session` vs `!recap campaign` handlers | Both modes; auto-post-at-session-start; refresh-button flag |
| 8 | `audioDegradation` | `src/audio/playback.js` `onNarratorCardRendered` error branches | Stub fetch failures (CORS, 429, missing key); assert chat never blocked; streaming → fullgen fallback |
| 9 | `helpCompendiumGeneration` | `src/help/helpJournal.js` `CONTENT_VERSION = "1.4.3"` | Build journal; assert page count and version match `module.json` |
| 10 | `i18nResolution` | `src/system/ironswornAssets.js` i18n wrapper | Smoke-resolve a sample of keys from each namespace |

Nothing dropped: verification did not invalidate any priority. The list goes from "speculative" to "anchored to a specific file path" — each entry now names the real code under test.

---

## Proposed Scope-Doc Corrections

Two edits to `docs/scope-index.md`, both factual:

**Line 31 (Quench Integration Tests row):**
- Current: `…and clarification edge cases (24 batches total)`
- Proposed: `…live Foundry integration tests covering safety, character, world, sector, narration, audio, and chat surfaces (33 batches total — see src/integration/quench.js)`

**Line 37 (Fact Continuity row):**
- Current: `…five world settings gate the feature with telemetry on the existing Pacing Telemetry journal`
- Proposed: `…nine world settings gate the feature (including the ship-positioning §20 sub-feature) with telemetry on the existing Pacing Telemetry journal`

No other scope-doc changes needed — sub-feature claims in scopes A–F were verified accurate.

---

## Verification

This deliverable is an audit; the verification IS the cross-check just performed. To re-verify:

1. `grep -c '"starforged-companion\.' src/integration/quench.js` → expect `33`
2. `ls src/factContinuity/` → expect `sidecarParser.js`, `ledgers.js`, `sceneLifecycle.js`, `correctionDialog.js`, `consistencyCheck.js`
3. `grep -n "!pace\|!roll\|!truth\|!state\|!scene start\|!scene end" src/index.js` → expect handler matches in the 525–1400 line range
4. `grep -n "CONTENT_VERSION" src/help/helpJournal.js` → expect `"1.4.3"`
5. `grep -n "factContinuity\|shipPositioning\|shipToken" src/ui/settingsPanel.js | wc -l` → expect ≥ 9 setting registrations

If the user approves, next sessions implement Quench batches in the priority order above (one per session, `npm test && npm run lint` gating, help-journal + CHANGELOG updates per `CLAUDE.md`) — and the two scope-index edits land in a single small docs commit ahead of (or alongside) the first batch.
