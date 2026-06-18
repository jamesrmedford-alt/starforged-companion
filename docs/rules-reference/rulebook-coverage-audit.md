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

## Status reconciliation — 2026-06-17

**This audit was written 2026-05-29 and was substantially overtaken within
hours of being committed, then again over the following weeks. The matrix and
priority list below have now been reconciled against the tree.**

What changed since the original pass:

- **The entire risk-ranked priority list (P1–P22) is essentially closed.**
  Commits `03070a4` (P1, `coreResolverMatrix`) and `943265e` (P2–P17, P19,
  P20 — six batches: `momentumImpactMath`, `momentumMath`, `moveOutcomeMatrix`,
  `progressMechanics`, `xpEconomy`, `characterStateInvariants`) landed the same
  night this audit was written. Only P18/P21/P22 (all Low) were deferred, and
  P18 (`worldTruths` "do not contradict") has since been pinned too. The Quench
  batch count went **51 → 66**.
- **The three documented momentum bugs (1.6/1.7/1.14) are fixed**, verified in
  `src/character/actorBridge.js` (`momentumReset = Math.max(0, 2 - impactCount)`,
  `momentumMax = Math.max(0, 10 - impactCount)`) and pinned by `momentumImpactMath`.
- **Many Chapter-3 NEEDS-FEATURE items shipped:** Pay the Price d100
  (`payThePrice.js`), the threshold d100 tables (Mortal Wound / Desolation /
  Vehicle Damage in `sufferAndCombat.js`), Ask the Oracle yes/no odds
  (`roller.js`), the Spotlight Vignette table, suffer executors (F16), the full
  exploration lifecycle (3.18–3.21) and combat lifecycle (3.24–3.28), Develop
  Your Relationship bond legacy (3.14), Battle (3.29), and clocks (3.48/3.49,
  shipped COMPLETE per scope-index).
- **"Battle Stations!" is a real rulebook section, not a move** (corrected
  2026-06-18; an earlier pass wrongly struck it as a phantom — that strike is
  reversed). It is the shipboard-combat framework of Chapter 3 (pp. 184–187): 11
  example crew roles resolved through the existing combat/suffer/recover moves,
  with per-character position and Aid Your Ally transferring control. It has no
  roll/stat/outcome, so it correctly has no `schemas.js` entry; row 3.23 is
  reclassified below as a narration/reference feature (DONE), not a move gap.

Rows updated in place. Genuinely-open items remain flagged GAP/PARTIAL with the
reason. See `decisions.md` → "Audit reconciliation 2026-06-17".

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
| 1.1 | Action roll outcome buckets (strong/weak/miss; ties → challenge dice) | MECHANIC | PINNED | `coreResolverMatrix` — parametric `(score, A, B) → outcome` (commit `03070a4`) | — | done |
| 1.2 | Action score capped at 10 | MECHANIC | PINNED | `coreResolverMatrix` — 10-cap boundary fixtured | — | done |
| 1.3 | Momentum cap at +10 (even after a hit award) | MECHANIC | PINNED | `momentumMath` batch (commit `943265e`) | — | done |
| 1.4 | Momentum reset to +2 after burn | MECHANIC | PINNED | `momentumMath` + `movePipelineExtended` | — | done |
| 1.5 | Negative momentum cancellation when action die matches `abs(momentum)` | MECHANIC | PINNED | `momentumMath` batch | — | done |
| 1.6 | Max momentum reduction per impact (−1 per mark) | MECHANIC | PINNED + FIXED | `momentumImpactMath` pins `momentumMax = Math.max(0, 10 - impactCount)`; the §3.1.2 filter bug is fixed (verified `actorBridge.js`) | — | done |
| 1.7 | Momentum reset reduction per impact (+2 → +1 → 0) | MECHANIC | PINNED + FIXED | `momentumImpactMath` pins `momentumReset = Math.max(0, 2 - impactCount)`; the §3.1.1 inverted formula is fixed (verified `actorBridge.js:103`) | — | done |
| 1.8 | Match detection (both challenge dice equal) | MECHANIC | PINNED | `coreResolverMatrix` — `(A == B) → isMatch` | — | done |
| 1.9 | Progress track marks per rank (3/2/1 box; extreme/epic in ticks) | MECHANIC | PINNED | `progressMechanics` — parametric across all 5 ranks (commit `943265e`) | — | done |
| 1.10 | Progress move uses filled-box tally as score (not stat + die) | MECHANIC | PINNED | `progressMechanics` — score-from-boxes fixture | — | done |
| 1.11 | Momentum does not apply to progress rolls | MECHANIC | PINNED | `progressMechanics` batch | — | done |
| 1.12 | Legacy track: 2 XP per filled box; 1 XP after track is cleared once | MECHANIC | PINNED | `xpEconomy` batch (commit `943265e`) | — | done |
| 1.13 | Condition meters bounded at 0–5 | MECHANIC | PINNED | `actorBridge` `applyMeterChanges` clamping | — | none |
| 1.14 | Impacts: four categories, 12 specific impacts canonical | MECHANIC | PINNED + FIXED | `momentumImpactMath` enumerates the canonical impacts; `readDebilities` legacy-field bug (§3.1.3) fixed | — | done |
| 1.15 | Five stats Edge/Heart/Iron/Shadow/Wits with values 1–3 at creation | MECHANIC | PINNED (schema-side) | `actorBridge` snapshot pins paths; `i18nResolution` pins names | — | none |
| 1.16 | Assets: 5 types × 3 abilities; deck = "class system" | NARRATIVE | UNTESTABLE | — | — | — |
| 1.17 | Iron vows: 10-box progress track at chosen rank | MOVE | PINNED | `progressMechanics` (P19) pins rank-input → track-at-rank | — | done |
| 1.18 | Equipment / vehicles use challenge-rank framework | NARRATIVE | UNTESTABLE | — | — | — |

**Chapter 1 summary (reconciled 2026-06-17):** 18 rules. **14 PINNED** (all the
mechanics rules — closed by `coreResolverMatrix`, `momentumMath`,
`momentumImpactMath`, `progressMechanics`, `xpEconomy`), 2 UNTESTABLE (1.16,
1.18), and 1.15/1.17 PINNED schema-side. **The three documented upstream bugs
(1.6, 1.7, 1.14) are fixed and pinned.** Chapter 1 is effectively complete.

---

## Chapter 2 — Launching Your Campaign

| # | Rule | Category | Status | Quench batch (if any) | Severity | Action |
|---|---|---|---|---|---|---|
| 2.1 | 14 world truths immutable once chosen; narrator must not contradict | NARRATIVE | PINNED | `worldTruths` (P18) pins the "DO NOT CONTRADICT" lore block in the assembled prompt (`assembler.js:511`) | — | done |
| 2.2 | Character starts with all condition meters at canonical values (5/5/5 + momentum +2) | MECHANIC | PINNED | `characterStateInvariants` (P20) — fresh-character baseline snapshot | — | done |
| 2.3 | "Preparation is play" — campaign creation produces fiction | NARRATIVE | UNTESTABLE | — | — | — |
| 2.4 | Safety tools (Change Your Fate) are first-class | MOVE | GAP | none | Low | NEEDS-FEATURE per `playkit-rules-and-coverage.md` §3.4.4 — no UI |

**Chapter 2 summary (reconciled 2026-06-17):** 4 rules. 2 PINNED (2.1, 2.2),
1 NEEDS-FEATURE (2.4 Change Your Fate UI), 1 UNTESTABLE (2.3).

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
| 3.2 | Begin a Session: gain/lose momentum based on favour | PARTIAL | Session Panel + `!begin-session` shipped (Session Lifecycle scope; `sessionPanel` batch); Spotlight Vignette d100 (`SPOTLIGHT_VIGNETTE`) exists. Favour-momentum faithfulness not separately pinned | Low | NEEDS-TEST (mechanic) |
| 3.3 | End a Session: awards +1 momentum; captures focus | PARTIAL | Session Panel + `!end-session` shipped; closing vignette + session-log write. +1-momentum/focus-capture faithfulness not separately pinned | Low | NEEDS-TEST (mechanic) |
| 3.4 | Set a Flag — declare a flag for narrative recall | PARTIAL | `!flag` command shipped (Session Lifecycle scope) | Low | NEEDS-TEST |
| 3.5 | Change Your Fate — 5-option chooser to rebalance an outcome | PARTIAL | `!fate` opens the Change Your Fate dialog (`index.js`) | Low | NEEDS-TEST (5-option faithfulness) |
| 3.6 | Take a Break — pacing prompt | PARTIAL | `!break` opens the Take a Break dialog (`index.js`) | Low | NEEDS-TEST |

**Coverage (reconciled 2026-06-17):** session lifecycle PINNED; all five
session-move surfaces have since **shipped** (Session Panel + chat aliases
`!begin-session` / `!end-session` / `!flag` / `!fate` / `!break`; Spotlight
Vignette d100 table). They are now PARTIAL — UI exists, but the per-move
*mechanics* (favour-based momentum on Begin, +1 on End, the 5-option Change
Your Fate chooser faithfulness) are not yet individually pinned by a batch.

### Adventure Moves (6)

`Face Danger`, `Secure an Advantage`, `Gather Information`, `Compel`,
`Aid Your Ally`, `Check Your Gear`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.7 | All 6 moves routed by interpreter; outcomes resolve via `resolveMove` | PARTIAL | `moveOutcomeMatrix` (P11) pins outcome shapes for face_danger / gather_information / secure_an_advantage; compel / aid_your_ally / check_your_gear not yet asserted | Low | NEEDS-TEST (remaining 3) |
| 3.8 | Group moves: one character rolls, others contribute via fiction/assets | MECHANIC | GAP | none | Low | NEEDS-TEST — only relevant in multiplayer; not solo-GM critical |

### Quest Moves (4)

`Swear an Iron Vow`, `Reach a Milestone`, `Fulfill Your Vow`, `Forsake
Your Vow`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.9 | Swear an Iron Vow creates progress track at chosen rank | MOVE | PINNED | `progressMechanics` — rank-parametric track creation across all 5 ranks | — | done |
| 3.10 | Reach a Milestone marks rank-equivalent boxes | MOVE | PINNED | `progressMechanics` — rank-parametric box marking (all 5 ranks) | — | done |
| 3.11 | Fulfill Your Vow: progress move; outcome bucket per filled-box score | MOVE | GAP | none — *not* covered by `moveOutcomeMatrix` (the `943265e` "P12 closed" claim does not hold against the tree) | Medium | NEEDS-TEST |
| 3.12 | Forsake Your Vow: voluntary; mechanical consequence | MOVE | GAP | none | Low | NEEDS-TEST |

### Connection Moves (4)

`Make a Connection`, `Develop Your Relationship`, `Test Your
Relationship`, `Forge a Bond`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.13 | Make a Connection: oracle-seeded NPC, progress track | MOVE | PINNED | `connectionPipeline`, `connectionSeedEnrichment`, `entityWorldJournal` | — | none |
| 3.14 | Develop Your Relationship: marks progress; when bonded → also tick bond legacy track | MOVE | DONE | `developRelationship.js` + GM-gated pipeline: un-bonded marks the connection track; bonded marks bonds legacy (strong 2 / weak 1 / miss 0) and a match raises rank (§3.3.5). `developRelationship` unit batch | — | done (2026-06-17) |
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

`Enter the Fray`, `Gain Ground`, `React Under Fire`, `Strike`, `Clash`,
`Take Decisive Action`, `Face Defeat`, `Battle` (eight moves).

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.23 | Battle Stations! — shipboard-combat framework (11 crew roles; rulebook pp. 184–187) | DOC/NARRATION | DONE | **Not a move** (no roll/stat/outcome → no `schemas.js` entry). Resolves via the existing combat/suffer/recover moves with per-character position + Aid Your Ally control hand-off. Module surfaces the 11 roles to the narrator (conditional shipboard-combat guidance) and players (`!stations` + help page). Ship-map mini-game planned (`docs/combat/shipboard-combat-minigame.md`). | Low | `battleStations.js` |
| 3.24 | Enter the Fray / Gain Ground / React Under Fire / Strike / Clash run resolveMove | MOVE | PINNED | `moveOutcomeMatrix` pins enter_the_fray / gain_ground outcome shapes (incl. in_control / bad_spot position); combat-lifecycle wiring done (3.25/3.26). React Under Fire / Clash shapes not separately fixtured | — | mostly done |
| 3.25 | Combat positioning (in control / in a bad spot) persists between moves | PIPELINE | DONE | pipeline writes `combatPosition` to the active combat track after every combat move; panel reads it back | — | `resolver` + `progressTracks` |
| 3.26 | Strike / Clash strong hit marks progress *twice* | MOVE | DONE | `combatProgress: 2` consequence → GM-gated pipeline handler marks twice via `applyCombatProgress` | — | `combat` unit batch |
| 3.27 | Take Decisive Action triggered when progress full; weak-hit d100 table | MOVE | DONE | `endCombat: true` closes the track; `rollDecisiveActionCost: true` fires the DECISIVE_ACTION_COST table card in the pipeline; entry 1-40 has `sufferRoute:{move:"any",amount:2}` which opens the B1 generic suffer picker | — | `sufferAndCombat.js` + pipeline |
| 3.28 | Face Defeat: lose fight; outcome determines cost and escape | MOVE | DONE | `endCombat: true` closes the track; `routePayThePrice: true` fires Pay the Price d100 card in the pipeline with full suffer routing | — | `resolver` + pipeline |
| 3.29 | Battle: single roll for entire fight | MOVE | DONE | resolver: every outcome sets `endCombat` (closes any open combat track, no-op when none); weak/miss set `routePayThePrice`; strong +2 momentum. `resolver` unit batch | — | done (2026-06-17) |

### Suffer Moves (6)

`Lose Momentum`, `Endure Harm`, `Endure Stress`, `Companion Takes a
Hit`, `Sacrifice Resources`, `Withstand Damage`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.30 | Lose Momentum: −1/−2/−3 | MOVE | PINNED | F16 suffer pipeline (`sufferExecutor.js`); `sufferExecutor.test.js` + `momentumMath` | — | done |
| 3.31 | Endure Harm: reduce health; auto-mark wounded at health=1 | MOVE | PINNED | F16 executor auto-marks wounded; `sufferExecutor.test.js` + quench wounded assertions | — | done |
| 3.32 | Endure Harm: roll on higher of Iron or Health | MOVE | GAP NEEDS-FEATURE | per playkit §3.3.4 — dynamic stat selection still not implemented | Medium | feature backlog |
| 3.33 | Endure Stress: reduce spirit; auto-mark shaken | MOVE | PINNED | F16 executor auto-marks shaken; `sufferExecutor.test.js` | — | done |
| 3.34 | Companion Takes a Hit: damage to companion meter | MOVE | PINNED | F16 executor (`companion_takes_a_hit`); `sufferExecutor.test.js` | — | done |
| 3.35 | Sacrifice Resources: supply decrease | MOVE | PINNED | F16 executor; `sufferExecutor.test.js` | — | done |
| 3.36 | Withstand Damage: vehicle integrity decrease | MOVE | PINNED | F16 executor + Vehicle Damage d100 (`sufferAndCombat.js`); `sufferExecutor.test.js` | — | done |

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
| 3.40 | Face Death triggered when health=0; outcome via d100 table | MOVE | DONE | Mortal Wound d100 (`sufferAndCombat.js`) + resolver handler (`resolver.js:914`); trigger pinned by `characterStateInvariants` | — | done |
| 3.41 | Face Desolation triggered when spirit=0 | MOVE | DONE | Desolation d100 + resolver handler (`resolver.js:933`); trigger pinned | — | done |
| 3.42 | Overcome Destruction triggered when vehicle integrity=0 | MOVE | DONE | Vehicle Damage d100 + resolver handler (`resolver.js:951`, rolls vs bonds legacy); trigger pinned | — | done |

### Legacy Moves (3)

`Earn Experience`, `Advance`, `Mark Legacy Boxes`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.43 | Legacy box filled → 2 XP award (1 XP after track cleared) | MOVE | PINNED | `xpEconomy` batch — 2-XP/1-XP-after-clear fixtured | — | done |
| 3.44 | Advance: spend XP on assets | MOVE | GAP | none — `xpEconomy` covers the award side, not the spend side | Medium | NEEDS-TEST |

### Fate Moves (2)

`Ask the Oracle`, `Pay the Price`.

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.45 | Ask the Oracle: yes/no with odds (small/unlikely/50-50/likely/almost certain) | MOVE | PINNED | `rollAskTheOracle` (`roller.js:343`, `ORACLE_ODDS`) + `fateMoves` batch | — | done |
| 3.46 | Ask the Oracle: prompt table roll (~120 RG tables) | MOVE | PARTIAL | `systemAssets` lookups; `i18nResolution` | Low | NEEDS-TEST — sample roller against one or two tables |
| 3.47 | Pay the Price: choose / roll / narrator decides on miss | MOVE | DONE | Pay the Price d100 (`payThePrice.js`) + `!pay-the-price` + suffer routing; `fateMoves` batch | — | done |

### Clocks & scene challenges

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.48 | Campaign clocks tick toward deadline | PIPELINE | DONE | Clocks scope shipped — `!clock new\|advance\|fill\|reset\|remove\|list` + ApplicationV2 panel (`src/clocks/`); campaign clocks auto-roll advanceOdds | — | done |
| 3.49 | Tension clocks tick on failures | PIPELINE | DONE | Clocks scope — tension clocks advance against Ask-the-Oracle odds | — | done |
| 3.50 | Scene challenges: clock + progress; resolve on either full | PIPELINE | GAP NEEDS-FEATURE | per playkit §2.7 — not part of the shipped Clocks scope | Low | feature backlog |

### Other

| # | Rule | Status | Batch | Severity | Action |
|---|---|---|---|---|---|
| 3.51 | Conflict between allies: default roleplay; Face Danger both if mechanical | MECHANIC | GAP | none | Low | UNTESTABLE in solo; multiplayer-only |
| 3.52 | Principles of Play (16 design rules) | NARRATIVE | UNTESTABLE | — | — | — |

**Chapter 3 summary (reconciled 2026-06-17):** the picture has inverted since
the original pass. Roughly **30 rows are now PINNED/DONE** (the full
exploration and combat lifecycles, the F16 suffer pipeline, threshold moves +
their d100 tables, both fate moves, legacy XP, clocks, Develop Your
Relationship). The phantom 3.23 is struck. **Still genuinely open:**

- **GAP NEEDS-TEST:** 3.7 (compel / aid_your_ally / check_your_gear), 3.8
  (group moves — multiplayer), 3.11 Fulfill Your Vow, 3.12 Forsake Your Vow,
  3.15 Test Your Relationship, 3.16 Forge a Bond, 3.44 Advance (XP spend).
- **GAP NEEDS-FEATURE:** 3.32 Endure Harm "higher of" stat, 3.39 Repair point
  spends, 3.50 scene challenges.
- **PARTIAL:** the five session moves (3.2–3.6, UI shipped, mechanics not
  individually pinned), 3.22 Confront Chaos (legacy mark wired; d100
  substituted by paired oracles, by design), 3.46 oracle prompt-table roller.
- **UNTESTABLE:** 3.51, 3.52.

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

> **Mostly shipped (2026-06-17).** The bulk of this backlog has since been
> implemented: all the d100 consequence tables except the by-design Make a
> Discovery / Confront Chaos substitutions; Ask the Oracle yes/no odds;
> Strike/Clash double-mark + combat positioning persistence; Develop bond
> legacy tick; and clocks (creation UI + advance roll). **Still NEEDS-FEATURE:**
> 3.32 (Endure Harm "higher of" stat), 3.39 (vehicle repair point spends),
> 3.50 (scene challenges), and the session-move mechanic faithfulness
> (3.2/3.3). The original cross-reference follows.

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

> **CLOSED (2026-06-17).** This entire list (P1–P22) was implemented within
> hours of the audit and over the following weeks — see the Status
> reconciliation banner at the top. The mapping:
>
> - **P1** → `coreResolverMatrix` (1.1/1.2/1.8) ✅
> - **P2–P4** → `momentumImpactMath` (1.6/1.7/1.14, incl. the bug fixes) ✅
> - **P5/P6** → `progressMechanics` (1.9/1.10/1.11, all 5 ranks) ✅
> - **P7/P8** → `momentumMath` + `coreResolverMatrix` (1.3/1.4/1.5/1.8) ✅
> - **P9** → `xpEconomy` (3.43) ✅
> - **P10** → F16 suffer pipeline + `sufferExecutor.test.js` (3.31/3.33) ✅
> - **P11** → `moveOutcomeMatrix` (3.7 — 3 of 6 moves) 🔄
> - **P12** → quest moves: 3.10 ✅ via `progressMechanics`; **3.11/3.12 still open**
>   (the closure claim did not hold against the tree) ⚠️
> - **P13** → recover moves still open (3.37/3.38) ⚠️
> - **P14** → combat outcomes (`moveOutcomeMatrix` + lifecycle) ✅; Battle 3.29 ✅
> - **P15** → connection lifecycle: 3.14 ✅; **3.15/3.16 still open** ⚠️
> - **P16** → exploration (3.18–3.21) ✅
> - **P17** → threshold triggers (`characterStateInvariants`) ✅
> - **P18** → `worldTruths` "do not contradict" ✅
> - **P19** → Iron Vow rank track (`progressMechanics`) ✅
> - **P20** → `characterStateInvariants` baseline ✅
> - **P21/P22** → deferred (Low): NPC rank→challenge die, sample oracle roller.
>
> **Remaining NEEDS-TEST:** P11 remainder (compel/aid/check_your_gear), P12
> (Fulfill/Forsake Your Vow), P13 (recover moves), P15 (Test Your Relationship /
> Forge a Bond), 3.44 (Advance XP spend). The original (now historical) table
> follows.

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
| 14 | Combat outcome shapes (3.24, 3.27, 3.28, 3.29) | rulebook | Medium | Enter the Fray through Take Decisive Action + Face Defeat + Battle | `combatMoves` batch |
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
