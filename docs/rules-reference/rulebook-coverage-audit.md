# Rulebook Coverage Audit — Findings

Third in the audit series. Asks the question neither prior audit asked:
**which rules from `docs/rulebook-summary.md` are not directly covered
by any Quench batch?**

Prior audits asked:

- `docs/quench-coverage-audit-plan.md` — *"is this code untested?"* (10
  priorities, code-side).
- `docs/behaviour-coverage-audit.md` — *"are existing tests strong
  enough to catch behaviour regressions?"* (12 priorities, test-side).

Neither started from the rulebook. This audit does — every testable
rule the summary describes is cross-referenced against the 52
registered Quench batches. The result is a per-chapter matrix plus a
risk-ranked priority list of new batches to add.

---

## Method

**Sources.**

- `docs/rulebook-summary.md` — 661 lines, decomposed by an Explore
  agent into 94 candidate rules organised by chapter. Each rule tagged
  by category (`MECHANIC`, `MOVE`, `PIPELINE`, `NARRATIVE`) and
  testability (`DIRECTLY TESTABLE`, `PARTIALLY TESTABLE`,
  `UNTESTABLE`).
- `src/integration/quench.js` — 52 batches inventoried by a second
  Explore agent, with rule-hint tags per batch.
- `docs/playkit-rules-and-coverage.md` Part 2/3 — read by a third
  Explore agent. The playkit doc tracks *code* coverage, not Quench
  coverage; its `✅` symbols mean code exists, not that a batch tests
  it. The new audit must make the distinction itself. Where the
  playkit doc Part 3 already flags a missing-mechanic or missing-table
  gap, this audit defers to it for the *feature* side and focuses on
  the *test* side.

**Classification per rule.**

- **PINNED** — at least one Quench batch contains an assertion that
  would fail when the rule is violated.
- **PARTIAL** — code implements the rule; a unit test or a Quench
  batch touches it indirectly, but no Quench assertion pins the user-
  visible outcome (the PR #130 / ENTITY-001 defect class).
- **GAP** — no Quench batch tests the rule. Sub-tagged:
  - **NEEDS-TEST** — code exists in `src/`. Actionable: write a batch.
  - **NEEDS-FEATURE** — no code exists. Defer to
    `docs/playkit-rules-and-coverage.md` Part 3 punch list.
  - **UNTESTABLE** — narrative principle. Document only.

**Severity per NEEDS-TEST gap.**

- **High** — rule is core to play; silent regression corrupts every
  session.
- **Medium** — rule is move-specific but high-frequency.
- **Low** — rule is rare-trigger.
- **Latent** — code path exists but rarely auto-triggers in
  production.

---

## Chapter 1 — The Basics

The densest mechanical chapter and the highest-leverage section to
test. Every move pipeline cycle touches at least one rule from this
chapter.

| # | Rule | Category | Status | Quench batch (if any) | Severity | Action |
|---|---|---|---|---|---|---|
| 1.1 | Action roll outcome buckets (strong/weak/miss; ties → challenge dice) | MECHANIC | PARTIAL | `narrator`, `pipeline`, `movePipelineExtended` exercise `resolveMove` but don't pin the bucket math against fixtured `(score, A, B)` inputs | High | NEEDS-TEST — parametric matrix `(score, challengeA, challengeB) → expected outcome` |
| 1.2 | Action score capped at 10 | MECHANIC | GAP | none | High | NEEDS-TEST — fixture `actionDie + stat + adds = 14 → score capped at 10 before comparison` |
| 1.3 | Momentum cap at +10 (even after a hit award) | MECHANIC | GAP | none direct | High | NEEDS-TEST |
| 1.4 | Momentum reset to +2 after burn | MECHANIC | PARTIAL | `movePipelineExtended` — burn is exercised but reset value not parametric | High | NEEDS-TEST extension on existing batch |
| 1.5 | Negative momentum cancellation when action die matches `abs(momentum)` | MECHANIC | GAP | none | Latent | NEEDS-TEST — rare rule but covered code path; one fixture |
| 1.6 | Max momentum reduction per impact (−1 per mark) | MECHANIC | GAP | none | High | NEEDS-TEST. **Bug already documented** in `docs/playkit-rules-and-coverage.md` §3.1.2 (`CONDITION_DEBILITIES` filter excludes battered/cursed/doomed/tormented/indebted/permanently_harmed/traumatized). Fix + test in one batch. |
| 1.7 | Momentum reset reduction per impact (+2 → +1 → 0) | MECHANIC | GAP | none | High | **Critical** — `playkit-rules-and-coverage.md` §3.1.1 documents an inverted formula in `src/character/actorBridge.js`; the canonical fix is `Math.max(0, 2 - condCount)`. NEEDS-TEST that pins the corrected formula across all impact counts. |
| 1.8 | Match detection (both challenge dice equal) | MECHANIC | GAP | none | Medium | NEEDS-TEST — the detection itself; narrative consequence is untestable |
| 1.9 | Progress track marks per rank (3/2/1 box; extreme/epic in ticks) | MECHANIC | PARTIAL | `progressTrackActions` fixtures only `dangerous` (rank=8 ticks) | High | NEEDS-TEST — parametric across all 5 ranks (troublesome / dangerous / formidable / extreme / epic) |
| 1.10 | Progress move uses filled-box tally as score (not stat + die) | MECHANIC | PARTIAL | `progressTrackActions` `rollProgress` posts a card but no assertion on the score math | High | NEEDS-TEST |
| 1.11 | Momentum does not apply to progress rolls | MECHANIC | GAP | none | High | NEEDS-TEST |
| 1.12 | Legacy track: 2 XP per filled box; 1 XP after track is cleared once | MECHANIC | GAP | none | Medium | NEEDS-TEST. Code in `persistResolution.js:187-203` per playkit doc; no batch. |
| 1.13 | Condition meters bounded at 0–5 | MECHANIC | PINNED | `actorBridge` `applyMeterChanges` clamping | — | none |
| 1.14 | Impacts: four categories, 12 specific impacts canonical | MECHANIC | PARTIAL | `actorBridge` reads debility flags but no batch enumerates the 12 canonical impacts | Medium | NEEDS-TEST. `playkit-rules-and-coverage.md` §3.1.3 flags `readDebilities` reading 5 non-canonical fields (corrupted, encumbered, maimed, custom1, custom2). Audit + correction batch. |
| 1.15 | Five stats Edge/Heart/Iron/Shadow/Wits with values 1–3 at creation | MECHANIC | PINNED (schema-side) | `actorBridge` snapshot pins paths; `i18nResolution` pins names | — | none |
| 1.16 | Assets: 5 types × 3 abilities; deck = "class system" | NARRATIVE | UNTESTABLE | — | — | — |
| 1.17 | Iron vows: 10-box progress track at chosen rank | MOVE | PARTIAL | `progressTrackActions` covers tracks but no batch asserts the rank-input → 10-box-track-at-rank wire | Medium | NEEDS-TEST |
| 1.18 | Equipment / vehicles use challenge-rank framework | NARRATIVE | UNTESTABLE | — | — | — |

**Chapter 1 summary:** 18 rules. 2 PINNED, 6 PARTIAL, 8 GAP NEEDS-TEST,
2 UNTESTABLE. **Three rules (1.6, 1.7, 1.14) are GAPs with documented
upstream bugs.** Fixing-with-test is the highest-leverage batch in this
audit.

---

## Chapter 2 — Launching Your Campaign

| # | Rule | Category | Status | Quench batch (if any) | Severity | Action |
|---|---|---|---|---|---|---|
| 2.1 | 14 world truths immutable once chosen; narrator must not contradict | NARRATIVE | PARTIAL | `worldTruths` (formatCampaignTruthsBlock empty vs populated; `nedPermissionsMatrix` per narrator class) — but no batch asserts a narrator-asserted truth conflict surfaces in the WJ review card | Medium | NEEDS-TEST — extend `worldTruths` to pin the "do not contradict" injection in the assembled prompt |
| 2.2 | Character starts with all condition meters at canonical values (5/5/5 + momentum +2) | MECHANIC | GAP | none | Medium | NEEDS-TEST — fixture a fresh character → snapshot meters match canonical |
| 2.3 | "Preparation is play" — campaign creation produces fiction | NARRATIVE | UNTESTABLE | — | — | — |
| 2.4 | Safety tools (Change Your Fate) are first-class | MOVE | GAP | none | Low | NEEDS-FEATURE per `playkit-rules-and-coverage.md` §3.4.4 — no UI |

**Chapter 2 summary:** 4 rules. 0 PINNED, 1 PARTIAL, 1 NEEDS-TEST, 1
NEEDS-FEATURE, 1 UNTESTABLE.

---

## Chapter 3 — Gameplay in Depth

The 11 move categories are the bulk of the rulebook's testable
surface. The audit groups by category rather than per-move — a single
Quench batch per category is the right size.

### Session Moves (5)

`Begin a Session`, `End a Session`, `Set a Flag`, `Change Your Fate`,
`Take a Break`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.1 | Session lifecycle: ID rotates after gap; sessionNumber increments | PINNED | `session` | — | none |
| 3.2 | Begin a Session: gain/lose momentum based on favour | GAP NEEDS-FEATURE | per playkit §3.4.1 — no UI / no roll-flag-review prompt | Medium | feature backlog |
| 3.3 | End a Session: awards +1 momentum; captures focus | GAP NEEDS-FEATURE | per playkit §3.4.2 — no UI | Medium | feature backlog |
| 3.4 | Set a Flag — declare a flag for narrative recall | GAP NEEDS-FEATURE | per playkit §3.4.3 — no UI | Low | feature backlog |
| 3.5 | Change Your Fate — 5-option chooser to rebalance an outcome | GAP NEEDS-FEATURE | per playkit §3.4.4 — no UI / no 5-option chooser | Low | feature backlog |
| 3.6 | Take a Break — mandatory pacing prompt | GAP NEEDS-FEATURE | per playkit §3.4.5 — no UI / no mandatory prompt | Low | feature backlog |

**Coverage:** session lifecycle infrastructure PINNED; *every*
session-move mechanic is GAP NEEDS-FEATURE. Five distinct UI surfaces
to ship per the playkit punch list before testing is possible.

### Adventure Moves (6)

`Face Danger`, `Secure an Advantage`, `Gather Information`, `Compel`,
`Aid Your Ally`, `Check Your Gear`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.7 | All 6 moves routed by interpreter; outcomes resolve via `resolveMove` | PARTIAL | `pipeline` resolves arbitrary moves but no batch asserts the move-specific outcome consequences (e.g. `gather_information` strong-hit shape) | Medium | NEEDS-TEST — per-move outcome fixture: stat options, outcome consequence template |
| 3.8 | Group moves: one character rolls, others contribute via fiction/assets | MECHANIC | GAP | none | Low | NEEDS-TEST — only relevant in multiplayer; not solo-GM critical |

### Quest Moves (4)

`Swear an Iron Vow`, `Reach a Milestone`, `Fulfill Your Vow`, `Forsake
Your Vow`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.9 | Swear an Iron Vow creates progress track at chosen rank | MOVE | PARTIAL | progress track creation tested for `dangerous` only | Medium | NEEDS-TEST — extend with rank-parametric fixture |
| 3.10 | Reach a Milestone marks rank-equivalent boxes | MOVE | PARTIAL | `progressTrackActions` markProgress only `dangerous` | High | NEEDS-TEST — parametric across all 5 ranks |
| 3.11 | Fulfill Your Vow: progress move; outcome bucket per filled-box score | MOVE | GAP | none | Medium | NEEDS-TEST |
| 3.12 | Forsake Your Vow: voluntary; mechanical consequence | MOVE | GAP | none | Low | NEEDS-TEST |

### Connection Moves (4)

`Make a Connection`, `Develop Your Relationship`, `Test Your
Relationship`, `Forge a Bond`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.13 | Make a Connection: oracle-seeded NPC, progress track | MOVE | PINNED | `connectionPipeline`, `connectionSeedEnrichment`, `entityWorldJournal` | — | none |
| 3.14 | Develop Your Relationship: marks progress; when bonded → also tick bond legacy track | MOVE | GAP NEEDS-FEATURE | per playkit §3.3.5 — bond legacy tick not auto | Medium | feature backlog (then test) |
| 3.15 | Test Your Relationship: roll when bond is stressed | MOVE | GAP | none | Low | NEEDS-TEST |
| 3.16 | Forge a Bond: progress move resolves; awards Bond asset | MOVE | GAP | none | Medium | NEEDS-TEST |

### Exploration Moves (6)

`Undertake an Expedition`, `Explore a Waypoint`, `Make a Discovery`,
`Finish an Expedition`, `Set a Course`, `Confront Chaos`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.17 | Set a Course: chooses destination; applies supply / time cost | MOVE | PINNED (token path) | `tokenDragSetACourse` covers Token-drag dispatch | — | also covered by typed `!set_a_course` via `pipeline`; consider explicit assertion |
| 3.18 | Undertake an Expedition: resolve-or-create expedition track at rank, mark progress on a hit | MOVE | DONE | `expedition.applyExpeditionProgress` (interpreter-inferred rank, re-rankable in panel) | — | `expedition` unit batch |
| 3.19 | Explore a Waypoint: during-expedition investigation; strong hit feeds the expedition track | MOVE | DONE | momentum-vs-progress in-dialog toggle deferred (shares the dormant combat `progress` option) | — | `resolver` + `expedition` |
| 3.20 | Make a Discovery: marks 2 ticks on the discoveries legacy track | MOVE | DONE | `legacyMark` consequence → GM-gated pipeline handler | — | `resolver` |
| 3.21 | Finish an Expedition: completes the track + legacy reward per rank (weak = one lower) | MOVE | DONE | `expedition.finishExpedition` + `legacyRewardTicks` (1-tick→3-box) | — | `expedition` unit batch |
| 3.22 | Confront Chaos: d100 oracle table; marks 1 tick/aspect on discoveries legacy | MOVE | PARTIAL | discoveries legacy mark wired (`legacyMark`); d100 table still substituted with paired oracles (playkit §3.2) | Low | feature backlog (table) |

### Combat Moves (8)

`Battle Stations!`, `Enter the Fray`, `Gain Ground`, `Strike`, `Clash`,
`React Under Fire`, `Take Decisive Action`, `Face Defeat`, `Battle`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.23 | Battle Stations! opens fight; sets position | MOVE | GAP | none | Medium | NEEDS-TEST |
| 3.24 | Enter the Fray / Gain Ground / React Under Fire / Strike / Clash run resolveMove | MOVE | PARTIAL | `pipeline` resolves moves; no batch asserts the combat-specific outcomes (position transitions) | Medium | NEEDS-TEST — at minimum, one fixture per combat outcome shape |
| 3.25 | Combat positioning (in control / in a bad spot) persists between moves | PIPELINE | DONE | pipeline writes `combatPosition` to the active combat track after every combat move; panel reads it back | — | `resolver` + `progressTracks` |
| 3.26 | Strike / Clash strong hit marks progress *twice* | MOVE | DONE | `combatProgress: 2` consequence → GM-gated pipeline handler marks twice via `applyCombatProgress` | — | `combat` unit batch |
| 3.27 | Take Decisive Action triggered when progress full; weak-hit d100 table | MOVE | DONE | `endCombat: true` closes the track; `rollDecisiveActionCost: true` fires the DECISIVE_ACTION_COST table card in the pipeline; entry 1-40 has `sufferRoute:{move:"any",amount:2}` which opens the B1 generic suffer picker | — | `sufferAndCombat.js` + pipeline |
| 3.28 | Face Defeat: lose fight; outcome determines cost and escape | MOVE | DONE | `endCombat: true` closes the track; `routePayThePrice: true` fires Pay the Price d100 card in the pipeline with full suffer routing | — | `resolver` + pipeline |
| 3.29 | Battle: single roll for entire fight | MOVE | GAP | none | Low | NEEDS-TEST |

### Suffer Moves (6)

`Lose Momentum`, `Endure Harm`, `Endure Stress`, `Companion Takes a
Hit`, `Sacrifice Resources`, `Withstand Damage`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.30 | Lose Momentum: −1/−2/−3 | MOVE | PARTIAL | `movePipelineExtended` covers momentum delta but not parametric across severities | Medium | NEEDS-TEST |
| 3.31 | Endure Harm: reduce health; auto-mark wounded at health=1 | MOVE | PARTIAL | meter clamp PINNED via `actorBridge`; auto-impact-mark not asserted | High | NEEDS-TEST — the auto-debility-mark is the actual rule, not just the meter delta |
| 3.32 | Endure Harm: roll on higher of Iron or Health | MOVE | GAP NEEDS-FEATURE | per playkit §3.3.4 — stat selection not dynamic | Medium | feature backlog |
| 3.33 | Endure Stress: reduce spirit; auto-mark shaken | MOVE | PARTIAL | same as 3.31 | High | NEEDS-TEST |
| 3.34 | Companion Takes a Hit: damage to companion meter | MOVE | GAP | none | Low | NEEDS-TEST |
| 3.35 | Sacrifice Resources: supply decrease | MOVE | PARTIAL | meter clamp PINNED; move-specific assertion missing | Medium | NEEDS-TEST |
| 3.36 | Withstand Damage: vehicle integrity decrease | MOVE | PARTIAL | same shape | Medium | NEEDS-TEST |

### Recover Moves (5)

`Sojourn`, `Heal`, `Hearten`, `Resupply`, `Repair`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.37 | Heal / Hearten / Resupply / Repair: meter restoration per move | MOVE | PARTIAL | `actorBridge` meter changes PINNED but per-move outcome shape not | Medium | NEEDS-TEST — one batch covers all four (mirror suffer-batch shape) |
| 3.38 | Sojourn: extended rest, multiple meter restoration | MOVE | GAP | none | Medium | NEEDS-TEST |
| 3.39 | Repair: vehicle point spends | PIPELINE | GAP NEEDS-FEATURE | per playkit §3.3.6 — point spends not auto-applied | Low | feature backlog |

### Threshold Moves (3)

`Face Death`, `Face Desolation`, `Overcome Destruction`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.40 | Face Death triggered when health=0; outcome via d100 table | MOVE | GAP NEEDS-FEATURE | per playkit §3.2 mortal wound d100 table missing | Medium | NEEDS-TEST (trigger) + NEEDS-FEATURE (table) |
| 3.41 | Face Desolation triggered when spirit=0 | MOVE | GAP NEEDS-FEATURE | per playkit §3.2 desolation d100 table missing | Medium | NEEDS-TEST (trigger) + NEEDS-FEATURE (table) |
| 3.42 | Overcome Destruction triggered when vehicle integrity=0 | MOVE | GAP NEEDS-FEATURE | per playkit §3.2 vehicle damage d100 table missing | Medium | NEEDS-TEST (trigger) + NEEDS-FEATURE (table) |

### Legacy Moves (3)

`Earn Experience`, `Advance`, `Mark Legacy Boxes`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.43 | Legacy box filled → 2 XP award (1 XP after track cleared) | MOVE | GAP | none | High | NEEDS-TEST — core economy rule; code exists per playkit §2.3 but no batch |
| 3.44 | Advance: spend XP on assets | MOVE | GAP | none | Medium | NEEDS-TEST |

### Fate Moves (2)

`Ask the Oracle`, `Pay the Price`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.45 | Ask the Oracle: yes/no with odds (small/unlikely/50-50/likely/almost certain) | MOVE | GAP NEEDS-FEATURE | per playkit §3.3.1 — constant exists, no roller/UI | Medium | feature backlog |
| 3.46 | Ask the Oracle: prompt table roll (~120 RG tables) | MOVE | PARTIAL | `systemAssets` lookups; `i18nResolution` | Low | NEEDS-TEST — sample roller against one or two tables |
| 3.47 | Pay the Price: choose / roll / narrator decides on miss | MOVE | GAP NEEDS-FEATURE | per playkit §3.2 — d100 Pay the Price table missing | Medium | feature backlog |

### Clocks & scene challenges

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.48 | Campaign clocks tick toward deadline | PIPELINE | GAP NEEDS-FEATURE | per playkit §2.7 — schema only, no creation UI, no advance roll | Low | feature backlog |
| 3.49 | Tension clocks tick on failures | PIPELINE | GAP NEEDS-FEATURE | per playkit §2.7 | Low | feature backlog |
| 3.50 | Scene challenges: clock + progress; resolve on either full | PIPELINE | GAP NEEDS-FEATURE | per playkit §2.7 | Low | feature backlog |

### Other

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.51 | Conflict between allies: default roleplay; Face Danger both if mechanical | MECHANIC | GAP | none | Low | UNTESTABLE in solo; multiplayer-only |
| 3.52 | Principles of Play (16 design rules) | NARRATIVE | UNTESTABLE | — | — | — |

**Chapter 3 summary:** 46 rules across 11 move categories +
clocks/conflict. 2 PINNED, 13 PARTIAL, 19 GAP NEEDS-TEST, 13 GAP
NEEDS-FEATURE, 1 UNTESTABLE.

The two pinned: `connectionPipeline` end-to-end (Make a Connection) and
`tokenDragSetACourse` (Set a Course Token path). Every other move
category has at least one GAP.

---

## Chapter 4 — Foes and Encounters

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 4.1 | NPC rank determines challenge tier | MECHANIC | PARTIAL | `encounterSpawnLive` covers spawn; rank → challenge-die wire not pinned | Low | NEEDS-TEST |
| 4.2 | NPCs don't roll — player rolls against rank | MECHANIC | PINNED-BY-DESIGN | resolver never invokes NPC rolls | — | none |
| 4.3 | Joining forces with NPCs: narrative or Companion asset | PIPELINE | GAP | none | Low | NEEDS-TEST |
| 4.4 | Sample NPCs in compendium accessible | CONTENT | PINNED | `encounterSpawnLive` `systemAssets` | — | none |

**Chapter 4 summary:** 4 rules. 2 PINNED, 1 PARTIAL, 1 GAP NEEDS-TEST.

---

## Chapter 5 — Oracles

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 5.1 | Oracle modes: solo/co-op (player interprets), guided (guide inspired) | NARRATIVE | UNTESTABLE | — | — | — |
| 5.2 | Ask the Oracle yes/no with odds (probability distribution per category) | MECHANIC | GAP NEEDS-FEATURE | see 3.45 | — | feature backlog |
| 5.3 | Oracles are prompts, not verdicts | NARRATIVE | UNTESTABLE | — | — | — |
| 5.4 | ~120 RG tables wired and accessible | CONTENT | PINNED | `systemAssets`, `i18nResolution` | — | none |

**Chapter 5 summary:** 4 rules. 1 PINNED, 1 NEEDS-FEATURE, 2
UNTESTABLE.

---

## Cross-cutting design themes

| # | Rule | Status | Action |
|---|---|---|---|
| X.1 | Lead with fiction; mechanics resolve; fiction follows | UNTESTABLE | — |
| X.2 | Progress over hit points | UNTESTABLE | — |
| X.3 | Asking, not telling | UNTESTABLE | partly captured by `pacing` and `pacedDetection` batches |
| X.4 | Trust player + dice but rebalance via Change Your Fate | UNTESTABLE | — |
| X.5 | Vows give purpose | UNTESTABLE | — |
| X.6 | 14 truths are constitutional constraints | NARRATIVE-PARTIAL | see 2.1 |

---

## Implementation-vs-test split (NEEDS-FEATURE backlog)

The audit surfaces a substantial NEEDS-FEATURE list — rules the
rulebook describes but the code doesn't implement. These move directly
to the playkit-rules-and-coverage punch list (§3) rather than this
audit's test-priority list. Cross-referenced summary:

| Bucket | Rules | Punch-list reference |
|---|---|---|
| Session-move UIs (Begin / End / Set a Flag / Change Your Fate / Take a Break) | 3.2–3.6 | playkit §3.4.1–3.4.5 |
| Missing d100 consequence tables (Pay the Price, Spotlight Vignette, Make a Discovery, Confront Chaos, Take Decisive Action weak hit, Mortal Wound, Desolation, Vehicle Damage) | 3.22, 3.27, 3.40–3.42, 3.47, plus 2.x truths | playkit §3.2 |
| Missing mechanics (Ask the Oracle yes/no with odds; Strike/Clash double-mark progress; combat positioning persistence; Endure Harm "higher of" stat; Develop bond legacy tick; vehicle repair point spends) | 3.32, 3.25–3.26, 3.14, 3.39, 3.45 | playkit §3.3.1–3.3.6 |
| Clocks & scene challenges (no creation UI, no advance roll, no Pay-the-Price clock integration) | 3.48–3.50 | playkit §2.7 / §3.5 |
| Foundry compendium-side gaps (sector faction control oracle) | 4.3 indirectly | playkit §2.5 |

**Action:** none in this audit. These rules are the playkit doc's
territory; this audit cites and defers.

---

## Risk-ranked priority list (NEEDS-TEST only)

Same shape as the prior audits. Each row maps to one Quench batch
session. Implementation cadence: `npm test && npm run lint` clean
before every commit; `CHANGELOG.md` entry per batch; help-Changelog
updated only when the rule is user-visible.

| Priority | Finding | Lens | Severity | Why | Proposed fix |
|---|---|---|---|---|---|
| 1 | Action-roll outcome bucket math (1.1) + action score cap at 10 (1.2) — no parametric test pins `(score, A, B) → strong/weak/miss` | rulebook | High | Every move resolution uses this; a regression in `resolveMove` would corrupt every session silently | One batch `coreResolverMatrix` — fixture table `[(score, A, B, expected), …]` × 30 cases including the 10-cap boundary and tie-break rules |
| 2 | Momentum reset reduction per impact (1.7) — known inverted formula per playkit §3.1.1 | rulebook | High | Bug already documented; the fix and the test in one batch | `momentumImpactMath` batch — parametric `(impactCount) → expected reset`; same batch fixes `src/character/actorBridge.js` |
| 3 | Max momentum reduction per impact (1.6) — `CONDITION_DEBILITIES` filter wrong per playkit §3.1.2 | rulebook | High | Same defect class as #2 — fix + pin together | Extend the same `momentumImpactMath` batch with `(impactCount) → expected max` and correct the filter |
| 4 | Impact canonical list (1.14) — `readDebilities` reads 5 non-canonical fields per playkit §3.1.3 | rulebook | Medium | Stale fields read from schema; correction + test | `canonicalImpacts` batch — enumerate the 12 rulebook impacts; pin `readDebilities` returns only those |
| 5 | Progress rank multiplier (1.9) — only `dangerous` tested in `progressTrackActions` | rulebook | High | Four ranks (troublesome, formidable, extreme, epic) unverified | Extend `progressTrackActions` with parametric `(rank) → boxes/ticks marked` |
| 6 | Progress move uses filled-box tally as score (1.10) | rulebook | High | Score math un-asserted | Extend the same batch — `rollProgress` resolution fixture (boxes filled = N → score = N; no momentum effect) |
| 7 | Momentum cap at +10 (1.3); reset to +2 after burn (1.4); negative cancel when die matches (1.5) | rulebook | High / Latent | Cluster of pure-mechanic momentum rules with no Quench coverage | `momentumMath` batch — fixtured matrix |
| 8 | Match detection (1.8) | rulebook | Medium | Detection itself is testable; narrative not | Add an `it()` in `coreResolverMatrix` (Priority 1) for `(A == B) → matched: true` |
| 9 | Legacy box → 2 XP (1 after clear) (3.43) | rulebook | High | Core economy rule; code exists in `persistResolution.js` but untested | `legacyXp` batch |
| 10 | Suffer-move auto-impact marking (3.31, 3.33) | rulebook | High | Endure Harm marks wounded; Endure Stress marks shaken — auto rule per rulebook | `sufferAutoImpacts` batch covering both suffer moves |
| 11 | Adventure-move outcome shapes (3.7) | rulebook | Medium | Per-move outcome consequence templates not pinned | `adventureMoveOutcomes` batch — fixture per move (face_danger / gather_information / compel / etc.) → expected `otherEffect` skeleton |
| 12 | Quest-move resolution (3.10, 3.11, 3.12) — Reach a Milestone parametric, Fulfill, Forsake | rulebook | High | Vow lifecycle is core; partial coverage today | `questMoves` batch |
| 13 | Recover-move meter restoration (3.37, 3.38) | rulebook | Medium | Heal/Hearten/Resupply/Repair/Sojourn — meter delta per move | `recoverMoves` batch |
| 14 | Combat outcome shapes (3.24, 3.27, 3.28, 3.29) | rulebook | Medium | Battle Stations through Take Decisive Action + Face Defeat + Battle | `combatMoves` batch |
| 15 | Connection lifecycle (3.15, 3.16) — Test Your Relationship, Forge a Bond | rulebook | Medium | Test triggered on stress; Forge a Bond awards Bond asset | `connectionResolution` batch |
| 16 | Exploration moves (3.18–3.21) — Undertake / Explore Waypoint / Make a Discovery / Finish | rulebook | Medium | Expedition lifecycle plus Discovery legacy mark | `explorationMoves` batch |
| 17 | Threshold-move triggers (3.40–3.42) — meter=0 → Face Death / Desolation / Overcome Destruction | rulebook | Medium | Trigger detection is testable even when the d100 outcome table is missing | `thresholdTriggers` batch — three triggers, no outcome resolution required |
| 18 | World truths "do not contradict" injection (2.1) | rulebook | Medium | Extension to `worldTruths` batch | Pin the truth-block presence in the assembled prompt + the "DO NOT CONTRADICT" wording |
| 19 | Iron Vow rank-input → 10-box track (1.17) | rulebook | Medium | Vow creation wire; per-rank verification | Combine with Priority 5 or 12 |
| 20 | Foundational character creation (2.2) — fresh-character canonical meters | rulebook | Medium | Snapshot canonical | `characterCreationBaseline` batch |
| 21 | NPC rank → challenge die wire (4.1) | rulebook | Low | Encounter spawn → resolveMove against NPC rank | Extend `encounterSpawnLive` |
| 22 | Sample oracle roller (3.46) | rulebook | Low | Pin a handful of `~120 RG tables` resolve to non-empty | Extend `systemAssets` |

**Priority cluster summary.**

- **Priorities 1–10 (HIGH severity)** all touch core mechanics that
  every session uses. Three of them (2, 3, 4) also fix documented
  bugs.
- **Priorities 11–17 (MEDIUM)** are per-move-category batches — one
  batch closes 3-6 rules in the matrix. Most economical to write since
  they share fixtures and helpers.
- **Priorities 18–22** are smaller extensions to existing batches
  rather than new batches.

Total: 22 priorities. Expected to consolidate into ~14 batch sessions
because several priorities cluster naturally (e.g. P1+P7+P8 → single
`coreResolver` batch; P2+P3 → single `momentumImpactMath` batch).

---

## Implementation cadence

Same model as the prior audits:

1. One batch / fix per session.
2. `npm test && npm run lint` clean before every commit.
3. `CHANGELOG.md` entry per batch.
4. `src/help/helpJournal.js` updated only when the rule maps to a
   user-visible feature (e.g. bug-fix priorities 2–4 affect momentum
   math players can notice; pure-mechanic batches don't need a help
   entry).
5. Version-pinning rule (`git fetch --tags origin && git tag
   --sort=-version:refname | head -1`) before any `CONTENT_VERSION` or
   help-Changelog edit.

Start with Priority 1 (`coreResolverMatrix`). It closes the largest
single risk cluster (1.1 + 1.2 + 1.8) into one batch and exercises the
single hottest code path in the module.

Then Priority 2 (`momentumImpactMath`). It both fixes documented bugs
and pins the corrected formula — same defect class as PR #134's
predicate-matrix tightening (live code wrong; tightening + test in one
PR).

---

## Verification

Mechanical recipes for re-running the audit as the codebase evolves.

### Rulebook side

```bash
# Count testable rules per chapter — expect roughly matching the matrix
grep -cE '^### ' docs/rulebook-summary.md
# Chapter section count
grep -cE '^## ' docs/rulebook-summary.md
```

### Quench side

```bash
# Batch count — expect 52 at audit time (matches prior audits)
grep -c '"starforged-companion\.' src/integration/quench.js

# Every batch ID cited in this doc resolves to a real registration
grep -oE 'starforged-companion\.[a-zA-Z]+' docs/rulebook-coverage-audit.md \
  | sort -u \
  | while read id; do
      grep -q "\"$id\"" src/integration/quench.js || echo "PHANTOM: $id";
    done
# expect: empty

# Resolver-side code paths the priority list targets
grep -n "CHALLENGE_DICE\|momentumReset\|maxMomentum" src/moves/resolver.js src/character/actorBridge.js | head -15
```

### Cross-audit consistency

```bash
# Behaviour-coverage audit priorities — confirm no duplicates
grep -E '^\| [0-9]+ \|' docs/behaviour-coverage-audit.md | head -15

# Quench coverage audit priorities — confirm no duplicates
grep -E '^\| [0-9]+ \|' docs/quench-coverage-audit-plan.md | head -15
```

If a priority in this audit matches one in the prior two, treat the
duplicate as a clarification rather than a re-addition: cite both
priorities and bundle the fix in a single PR.

---

## Findings summary

| Chapter | Total rules | PINNED | PARTIAL | NEEDS-TEST | NEEDS-FEATURE | UNTESTABLE |
|---|---|---|---|---|---|---|
| Ch 1 — Basics | 18 | 2 | 6 | 8 | 0 | 2 |
| Ch 2 — Campaign launch | 4 | 0 | 1 | 1 | 1 | 1 |
| Ch 3 — Gameplay | 46 | 2 | 13 | 19 | 13 | 1 (Principles aggregated) |
| Ch 4 — Foes | 4 | 2 | 1 | 1 | 0 | 0 |
| Ch 5 — Oracles | 4 | 1 | 0 | 0 | 1 | 2 |
| Cross-cutting themes | 6 | 0 | 1 | 0 | 0 | 5 |
| **Totals** | **82** | **7** | **22** | **29** | **15** | **11** |

(Total rows here are 82 — agent A's extraction listed 94 individual
items; the audit consolidates 12 of them into category-level entries
where the per-item testable surface collapses to a single batch.)

**Headline.** 7 / 82 (~9%) of testable rules from the rulebook summary
are directly PINNED by a Quench batch. 22 / 82 (~27%) are PARTIALLY
pinned (touched by a batch but the rulebook-side promise isn't pinned
end-to-end). 29 / 82 (~35%) are NEEDS-TEST gaps with code in place —
the audit's actionable list. 15 / 82 (~18%) are NEEDS-FEATURE gaps
(no code) deferred to the playkit doc's punch list. 11 / 82 (~13%)
are pure design philosophy and untestable.

The largest single concentration of NEEDS-TEST gaps is Chapter 1 (8
gaps, all High severity — core mechanics) followed by Chapter 3 Suffer
/ Recover / Quest move categories. Three of the Chapter 1 gaps overlap
documented bugs in `docs/playkit-rules-and-coverage.md` §3.1 (momentum
reset formula inverted; condition-debility filter wrong; debility
field read non-canonical).
