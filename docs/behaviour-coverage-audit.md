# Behaviour-Coverage Audit — Findings

Companion deliverable to `docs/behaviour-coverage-audit-plan.md`. Lens 1
findings land first; Lenses 2 and 3 follow in subsequent sessions.

This audit asks: **are the existing tests strong enough to catch
behaviour regressions?** It is the sequel to
`docs/quench-coverage-audit-plan.md`, which asked the prior question
(*"is this code untested?"*) and shipped 10 priority batches across
v1.5.x. PR #130 exposed a different defect class — code with tests that
*exist* but don't pin user-facing behaviour. This audit catalogues those
gaps.

---

## Lens 1 — Aspirational-comment sweep

**What.** Inventory cross-file claims in `src/` comments (schema-arrow
`← set by X`, JSDoc effect notes, "called by", "fires", "writes to",
etc.) and trace each one to the code that fulfils it. Three statuses:

- **WIRED** — claim is true, backed by code, AND at least one test fails
  when the wire breaks.
- **ROTTED** — wire exists but the comment misnames it (wrong file,
  wrong upstream feature, old prefix), OR claim was true once but the
  upstream caller is gone.
- **ASPIRATIONAL** — claim was never wired in production, OR wire exists
  but no test would fail if it broke (the PR #130 defect class —
  effectively aspirational because regression isn't detectable).

**Method.** Grepped `src/` for the patterns called out in the plan
(`←`, `populated by`, `set by`, `called by`, `wired by`, `writes to`,
`emits`, `fires the`, `triggered by`, `consumed by`, `TODO`,
"should fire / be / write"). Excluded `src/integration/quench.js` and
`src/help/helpJournal.js` from output (Quench is the test surface, not
production; help is HTML copy). For each match, traced the writer in
`src/`, then traced any asserting test in `tests/unit/` and the
relevant Quench batch.

**Output.** Findings table, then a risk-ranked priority list of
follow-up work.

### Findings

#### Cluster A — Entity Actor-schema arrows (`src/entities/*.js`)

The five entity files document the Actor document each one creates with
schema-style arrow comments. PR #130 wired `actor.img` on the ship
side; the planet/settlement/location side of the same wire was never
pinned. The routing crumbs (`entityType` / `entityId`) and
`system.description` are written but never asserted.

| file:line | claim | status | writer | asserting test | action |
|---|---|---|---|---|---|
| `ship.js:12` | `actor.name ← ship.name` | WIRED | `ship.js:118` `createShip` | `tests/unit/entityShipActor.test.js:68` | none |
| `ship.js:13` | `actor.img ← portrait dataUri (set by art pipeline)` | WIRED (since PR #130) | `art/generator.js:245` `attachPortraitToActor` | `src/integration/quench.js:7602` (live) | none — pinned by PR #130 Quench batch |
| `ship.js:14` | `actor.system.notes ← ship.notes` | WIRED | `ship.js:126` `createShip` | `tests/unit/entityShipActor.test.js:404` (seed path) | consider direct `createShip` assertion |
| `ship.js:15` | `actor.system.debility.battered ← ship.battered` | WIRED | `ship.js:128` `createShip` | `tests/unit/entityShipActor.test.js:76` | none |
| `ship.js:16` | `actor.system.debility.cursed ← ship.cursed` | WIRED | `ship.js:129` `createShip` | `tests/unit/entityShipActor.test.js:77` | none |
| `ship.js:17-19` | flag payload + routing crumbs | WIRED | `ship.js:134-136` | `tests/unit/entityShipActor.test.js:84,116,117` | none |
| `planet.js:8` | `actor.name ← planet.name` | ASPIRATIONAL | `planet.js:95` `createPlanet` | `tests/unit/entityLocationFamilyActor.test.js:88` (only checks `flag.planet.name`) | add `actor.name` assertion |
| `planet.js:9` | `actor.img ← portrait dataUri (set by art pipeline)` | ASPIRATIONAL | `art/generator.js:245` (same writer as ship) | none for planet specifically | add planet equivalent of ship Quench art-attach assertion |
| `planet.js:11` | `actor.system.klass ← planet.type` | WIRED | `planet.js:100` | `tests/unit/entityLocationFamilyActor.test.js:87` | none |
| `planet.js:12` | `actor.system.description ← planet.description` | ASPIRATIONAL | `planet.js:101` | none | add assertion |
| `planet.js:13` | `actor.flags[MODULE].planet ← full payload` | WIRED | `planet.js:105` | `tests/unit/entityLocationFamilyActor.test.js:88` | none |
| `planet.js:14` | `actor.flags[MODULE].entityType ← "planet"` | ASPIRATIONAL | `planet.js:106` | none | add routing-crumb assertion |
| `planet.js:15` | `actor.flags[MODULE].entityId ← preserved _id` | ASPIRATIONAL | `planet.js:107` | none | add routing-crumb assertion |
| `settlement.js:15` | `actor.system.description ← settlement.description` | ASPIRATIONAL | `settlement.js:117` | none | add assertion |
| `settlement.js:16` | `actor.flags[MODULE].settlement ← full payload` | WIRED | `settlement.js:121` | `tests/unit/entityLocationFamilyActor.test.js:36` | none |
| `settlement.js:17` | `actor.flags[MODULE].entityType ← "settlement"` | ASPIRATIONAL | `settlement.js:122` | none | add routing-crumb assertion |
| `settlement.js:18` | `actor.flags[MODULE].entityId ← preserved _id` | ASPIRATIONAL | `settlement.js:123` | none | add routing-crumb assertion |
| `location.js:16` | `actor.system.description ← location.description` | ASPIRATIONAL | `location.js:93` | none | add assertion |
| `location.js:17` | `actor.flags[MODULE].location ← full payload` | ASPIRATIONAL (partial) | `location.js:97` | `tests/unit/entityLocationFamilyActor.test.js:121` (only `type` field) | extend assertion to full payload |
| `location.js:18` | `actor.flags[MODULE].entityType ← "location"` | ASPIRATIONAL | `location.js:98` | none | add routing-crumb assertion |
| `location.js:19` | `actor.flags[MODULE].entityId ← preserved _id` | ASPIRATIONAL | `location.js:99` | none | add routing-crumb assertion |
| `folder.js:11` | `Starships/ ← ship Actors` | WIRED | `folder.js:127`, `ship.js:109` | `tests/unit/entityShipActor.test.js:125` | none |
| `folder.js:12` | `NPCs/ ← reserved for future connection migration` | ASPIRATIONAL (planned) | none | none | acceptable — matches PLANNED `entity-actor-migration` scope; keep comment |
| `folder.js:13` | `PCs/ ← adopted/created during migration` | ASPIRATIONAL (planned) | none | none | acceptable — matches PLANNED scope; keep |
| `folder.js:14-15` | `<Sector Name>/ ← settlement / planet / location` | WIRED | `folder.js:142-149` | `tests/unit/entityLocationFamilyActor.test.js:45,96` | none |

#### Cluster B — Cross-file effect notes (call sites and hooks)

| file:line | claim | status | trace | action |
|---|---|---|---|---|
| `context/safety.js:101` | `suppressScene()` "Called by the /x chat hook in settingsPanel.js" | ROTTED | `!x` (not `/x` — see CHAT-001) is handled in `src/index.js:1890`; settingsPanel handler at `src/ui/settingsPanel.js:704` is a separate path | rewrite to: "Called by the `!x` chat-command handler in `src/index.js` (and a parallel guard hook in `settingsPanel.js`)" |
| `context/safety.js:120` | `clearXCard()` "Not currently wired to a UI button; can be called from the Foundry console" | ASPIRATIONAL (self-acknowledged) | no UI wire; quench coverage exists at `src/integration/quench.js:510` | acceptable — comment is honest; possible follow-up to add a panel button |
| `entities/connection.js:376` | `setPortraitSourceDescription` "Called by the Loremaster hook after the first entity description is detected" | ROTTED | Loremaster was removed (see `docs/decisions.md` § "Narration: direct Claude API"). `setPortraitSourceDescription` has no production caller; only exercised in `src/integration/quench.js:3411` | rewrite comment OR remove function if dead — confirm with grep that the connection art path no longer needs a deferred source-description write |
| `entities/connection.js:388` | `setPortraitId` "Called by the art generation pipeline" | ROTTED | actual production wire is via `linkPortraitToEntity` in `art/generator.js:207`, not `setPortraitId` directly | rewrite to: "Wraps `updateConnection({portraitId})`. Production callers route through `linkPortraitToEntity` in `src/art/generator.js`." |
| `factContinuity/ledgers.js:160` | `promoteTextSubject` "Used by the entity panel 'promote to entity' affordance after a free-text subject has been backed by a real entity record" | ASPIRATIONAL | no entity-panel call site exists. Function has unit tests (`tests/unit/factContinuity.test.js:357`) but never runs in production | implement the entity-panel affordance, OR mark the function `@aspirational` and remove the comment claim |
| `sectors/sectorGenerator.js:355` | `// TODO: World Journal integration — add sector trouble as threat when WJ ships` | ROTTED | WJ has shipped (✅ COMPLETE per `docs/scope-index.md`) but the TODO call site is still inert | either implement the threat-record wire OR delete the TODO if intentionally deferred (`docs/scope-index.md` does not list it as a planned follow-up) |
| `index.js:967` | "The hook fires synchronously but the seed work is async and fire-and-forget" | WIRED | `index.js:971` `registerStarshipSeedHook` matches; seed coverage at `src/integration/quench.js` `starshipSeedHook` batch | none |
| `multiplayer/gmGate.js:7` | "The createChatMessage hook fires on every connected client. … Fix: gate the pipeline entry on isCanonicalGM()" | WIRED | `index.js:628` gates with `isCanonicalGM()`; `audio/index.js:121,186` also gate | none |
| `sectors/sectorOverview.js:163` | "Foundry hook handler — registered once at module ready" | WIRED | `registerSectorOverviewSync` called from `index.js:2306` | none |
| `audio/index.js:14` | "emits a socket message to the canonical GM, which then writes the MP3 to worlds/${worldId}/audio/" | WIRED | `audio/index.js:139` emit; `audio/index.js:183` socket receiver; gated by `isCanonicalGM` | none |
| `context/assembler.js:414` | `buildCurrentLocationSection` "Used by the narrator to anchor every narration" | WIRED | `assembler.js:131` call; narrator uses `formatCurrentLocation` in `narrator.js` at three call sites (165, 707, 803) | none |
| `system/ironswornPacks.js:231` | `listCanonicalTruths` "Used by Phase 8 to digest selected campaign truths" | WIRED | `system/campaignTruths.js:63` calls it; unit-tested at `tests/unit/ironswornPacks.test.js:159` | none |
| `index.js:1638` `narrator.js:1433` `chronicleWriter.js:229` | `campaignState.characterIds` "is never written by the module" (×3) | DOCUMENTED-DEAD | Schema field exists at `schemas.js:634` but is never written. Fallbacks in three callers route around it (per RECAP-003 fix). | acceptable — comments are accurate and the bypass is intentional. Long-term: consider removing the schema field, OR start writing it from the assembler so the documented field becomes truthful |
| `moves/persistResolution.js:63` | `campaignState.activeCharacterId` "is set by no path in the current codebase" | DOCUMENTED-DEAD | Schema field at `schemas.js`; persistResolution falls back to `getPlayerActors()[0]` | same as above — acceptable, candidate for schema cleanup |
| `schemas.js:725` | `pacing.forceNextAsMove` "set by !roll, consumed by router before classification" | WIRED | `index.js:553` `!roll` handler writes the flag; `src/pacing/router.js` consumes | none |
| `schemas.js:661` | `dismissedEntities` "Populated by the entity panel's dismiss action" | WIRED | `entityPanel.js` dismiss button writes to `campaignState.dismissedEntities` | confirm a Quench batch asserts the write — covered indirectly via `entityPanelActions` batch |

#### Cluster C — Loremaster vocabulary drift (semantic ROT, not behaviour ROT)

58 occurrences of "Loremaster" remain in `src/` (count via
`grep -rci loremaster src/ --include='*.js'`). The architecture
decision (`docs/decisions.md` § "Narration: direct Claude API")
removed the Loremaster feature, but the field names
(`loremasterNotes`, `loremasterContext`) and JSDoc references
("Loremaster context packet") were never renamed. Each one is now
semantically "narrator" — the field shapes flow into
`buildNarratorSystemPrompt`, not the deleted `loremaster.js`.

| Pattern | Files affected | Action |
|---|---|---|
| `loremasterNotes:` (schema field, 6 entity files + assembler reader) | `entities/{planet,settlement,faction,creature,connection,location}.js`, `context/assembler.js:1041` | Acceptable — field name is stable storage; renaming is a separate scope. Comment claims that say "for Loremaster context injection" should be updated to "for narrator context injection." |
| `loremasterContext` (move-resolver field, 1 file) | `moves/resolver.js:816,853` | Same — rename is a scope; comment updates are cheap |
| `/* Format ... for Loremaster context injection */` JSDoc | `entities/{ship,planet,settlement,faction,connection}.js`, `truths/generator.js:243` | Rename to "for narrator context injection" |
| `// Called by the Loremaster hook` | `entities/connection.js:376` (listed separately above in Cluster B) | ROTTED — see Cluster B |

This is **comment ROT, not behaviour ROT** — the fields are wired and
tested under their existing names. The audit's risk lens does not
prioritise this. Listed for completeness because a future reader
grepping for "Loremaster" might assume the feature is partially still
alive.

### Lens 1 priority list (risk-ranked)

Audit-actionable findings, ranked by *user-visible-regression risk if
the wire breaks*. Each row maps to a single batch / fix session.

| Priority | Finding | Why this risk first | Proposed fix |
|---|---|---|---|
| 1 | Planet / settlement / location `actor.img` ← portrait pipeline not pinned by any test | Same defect class as PR #130 (`ship.js:13`). The art pipeline writes `actor.img` for all four Actor-hosted entity types; only ship has a regression-guard. A planet/settlement/location portrait regression would silently fail — players see generic icons, no test catches it. | Extend the existing Quench art-attach pattern in `src/integration/quench.js` (search `actor.img` near the ship test added by PR #130) to also exercise planet, settlement, and location. One batch, three additional `it()` blocks. |
| 2 | Routing crumbs (`entityType`, `entityId`) on planet / settlement / location actors have no test | These are the fields `entityPanel.js` `loadAllEntities()` keys off when finding actor-hosted entities. A regression that breaks the write (e.g. flag namespace change, schema migration) would empty the entity panel for those types. ENTITY-001 was exactly this defect for journal-hosted entities — caught only after months. | Single unit test `tests/unit/entityRoutingCrumbs.test.js` that creates one of each type and asserts `actor.flags[MODULE].entityType` + `entityId` are populated. ~20 lines. |
| 3 | `actor.system.description` write on planet / settlement / location has no test | Three writers, no tests. Description appears on the native Foundry Actor sheet — a regression breaks the sheet's "Notes" surface, which is the first thing a player sees when they open the actor. | Fold into the same routing-crumbs test from Priority 2 — same setup, additional assertion per type. |
| 4 | `setPortraitSourceDescription` (`connection.js:382`) has no production caller | The function is exported, unit-tested via Quench, and explicitly documented as called by a hook that no longer exists. Either dead code or aspirational — both are confusing for the next maintainer. | Trace whether the connection art path needs a deferred source-description write (vs `entity.portraitSourceDescription` being set elsewhere). If dead: delete function + Quench test. If still needed: wire it from the entity extractor or narration path and update the comment. |
| 5 | `promoteTextSubject` (`factContinuity/ledgers.js:168`) has no production caller | Promised in the Fact Continuity scope as the "promote text subject to entity" affordance — the entity panel never calls it. Free-text truths captured before an entity was created stay text-bound forever. | Wire from `entityPanel.js` `#onConfirmDraft` (or wherever a draft is promoted to an entity). After the entity record is created, call `promoteTextSubject(originalName, { entityId, entityType }, campaignState)`. ~10 lines + a Quench assertion. |
| 6 | `sectorGenerator.js:355` TODO references "when WJ ships"; WJ has shipped | The sector-trouble threat record is the most useful "sector context" for narrator prompts and is currently absent from every sector ever generated. Player-visible: narrator never references the rolled trouble. | Either (a) wire the `recordThreat(sector.trouble, ...)` call and add a Quench assertion to `sectorCreatorWizard` (the planned batch in the prior audit), OR (b) explicitly delete the TODO and surface the gap as a scope-doc follow-up in `docs/scope-index.md`. |
| 7 | `safety.js:101` comment references the obsolete `/x` prefix | Documentation rot only; behaviour is wired. Risk is "next maintainer follows the comment to the wrong file." | One-line comment rewrite — see Cluster B row for the proposed text. |
| 8 | `connection.js:388` `setPortraitId` comment misnames the caller as "art generation pipeline" | Same documentation-rot class. The real wire is `linkPortraitToEntity` in `art/generator.js`. | One-line comment rewrite. |
| 9 | Loremaster vocabulary drift in JSDoc only (not field names) | Documentation rot; no behaviour regression. Pure tidy. | Bulk JSDoc rewrite across 6 entity files + truths/generator.js — single docs commit, no test impact. |
| 10 | `campaignState.characterIds` and `activeCharacterId` are documented as "never written" | Long-term schema clean-up; not a regression risk because the documented fallback works. Listed for visibility — future schema migrations need to know these fields are dead. | Either remove the fields from `schemas.js` (and tighten the fallbacks to not check them first), OR start writing them from the assembler so the field becomes truthful. Either is a behaviour-no-change refactor. |

---

## Lens 2 — Scope-doc behavioural parity

**What.** For each ✅ COMPLETE row in `docs/scope-index.md`, decomposed
the description into 3–5 discrete user-visible promises (things a
player or GM would notice break). For each promise, located the test
that asserts the user-visible outcome. The contract: *"covered" ≠
"asserted"* — a test that runs the function without asserting the
user-facing field doesn't count.

**Method.** Two Explore agents ran in parallel, one on the
narrator/foundations cluster (8 scopes), one on the
sector/pacing/FC/audio cluster (8 scopes). Each agent read the linked
scope doc, decomposed promises, and grepped `tests/unit/` +
`src/integration/quench.js` for asserting tests. Three statuses per
promise:

- **PINNED** — test asserts the user-visible outcome.
- **PARTIAL** — function tested but regression-catching assertion is
  missing (PR #130 defect class).
- **GAP** — no test covers the promise.

**Output.** Per-scope findings tables (collapsed below to risk-relevant
rows), then a consolidated GAP/PARTIAL summary that feeds the priority
list.

### Findings — narrator/foundations cluster (40 promises across 8 scopes)

Of 40 promises across Narrator, Ironsworn API, Character Management,
Foundations, Scene Interrogation, Previously On, NED v3, and World
Journal v2: **36 PINNED · 4 PARTIAL · 0 GAP**.

The four PARTIAL findings are all in **Foundations**:

| Scope | Promise | Status | Note |
|---|---|---|---|
| Foundations | README documents the module accurately (no Loremaster references) | PARTIAL | No automated test asserts the no-Loremaster constraint — human-verification level |
| Foundations | Help compendium pages match `CONTENT_VERSION` and describe shipped features | PARTIAL | `helpCompendiumGeneration` Quench batch asserts page count + version stamp but not page-content correctness |
| Foundations | CHANGELOG `[Unreleased]` block describes the shipped change | PARTIAL | No test asserts CHANGELOG content correctness — process-discipline level |
| Foundations | Help-Changelog heading version matches the live release tag | PARTIAL | The version-pinning rule in `CLAUDE.md` is the gate; no test verifies after-the-fact drift (this audit is partly motivated by exactly this drift — see PR #126) |

These are all documentation-tier promises. Production code paths are
all PINNED in this cluster. Worth noting: agent A's specific test
citations were less precise than agent B's (frequent "~140+" style
fuzzy line refs); the audit cited those as PINNED on the agent's
investigation summary rather than re-grepping each one. If a future
reviewer wants to harden the cluster, the verification footer's grep
recipes will surface where the test files actually live.

### Findings — sector/pacing/FC/audio cluster (40 promises across 8 scopes)

Of 40 promises across API Key Privacy, Sector Creator, Sector Creator
Enhanced, System Asset Integration, Pacing, Fact Continuity, Audio
Narration, and Quench Integration Tests: **27 PINNED · 11 PARTIAL · 2
GAP**.

PARTIAL and GAP findings, ranked by user-visible-regression risk:

| Scope | Promise | Status | Test / note |
|---|---|---|---|
| Sector Creator Enhanced | Background art upload returns valid file path; image actually uploads | GAP | `src/sectors/sectorArt.js:45` `generateSectorBackground` has no unit test and no Quench assertion that the upload path resolves |
| Sector Creator Enhanced | Foundry Scene created with correct name, grid config, and `sectorId` flag | PARTIAL | `src/integration/quench.js:1139-1213` asserts scene name and existence; grid config asserted manually only |
| Sector Creator Enhanced | Narrator stubs persisted into journal pages (not just returned as strings) | PARTIAL | `src/integration/quench.js:1256-1303` asserts the stub generator returns non-empty text but never asserts the text reaches a journal page |
| API Key Privacy | API key fields removed from the Foundry Configure Settings dialog (`config: false`) | PINNED-CODE / GAP-TEST | `src/index.js:188-195` registers with `config: false`; no test asserts the dialog suppresses the field — manual verification per scope §4.1 |
| API Key Privacy | API key inputs render in the About tab for GMs only (not players) | PARTIAL | `src/ui/settingsPanel.js:820,1333` renders GM-gated inputs; no test asserts the player-view HTML omits the inputs |
| API Key Privacy | "Set / Not set" badge updates after save and across re-renders | PARTIAL | `src/ui/settingsPanel.js:820` reads presence via `!!game.settings.get(...)`; no test asserts the badge renders or toggles |
| System Asset Integration | Canonical pack lookup helpers (`getCanonicalMove`, `getCanonicalOracle`) return non-null Items/Actors when document exists | PARTIAL | Helpers exist and unit-tested for the resolver shape; live pack-resolution path only covered by Quench i18nResolution batch indirectly |
| Pacing | Per-category dials (combat/investigation/exploration/social/downtime) measurably affect classifier output | PARTIAL | `pacing.test.js` asserts the dial values reach the classifier prompt; no test correlates dial value with classification outcome (would require LLM call) — acceptable trade-off |

### Per-scope tables (collapsed)

For the full per-scope tables (every promise across all 16 scopes), see
the Lens 2 agent investigation summaries appended at the end of this
section. The above PARTIAL/GAP rows are the audit-actionable subset.

The agent investigations confirmed:

- **Narrator, Ironsworn API, Character Management, Scene Interrogation,
  Previously On, NED v3, World Journal v2** — all production-code
  promises PINNED. These are the lowest-risk scopes.
- **API Key Privacy, Sector Creator Enhanced** — PARTIAL coverage on
  the UI-rendering boundary (settings-panel HTML, scene grid config,
  journal-page archival).
- **Fact Continuity** — every core promise (sidecar parsing, ledger
  writes, Section 6.5 injection, scene-lifecycle migration, §20
  ship-position update triggers) PINNED.
- **Audio Narration** — all five core promises PINNED.
- **Quench Integration Tests** — scope-level promises (every ✅ scope
  has ≥1 batch; batches clean up; GM-only and skip-no-key gates fire)
  PINNED.

---

## Lens 3 — Cross-file expectation audit

**What.** Catalogued data contracts that span files: file A writes a
flag / path / format / hook payload; file B reads it. Unit tests on
either side alone don't own these contracts — only an integration test
that exercises **both** the writer code path and the reader code path
in the same run can catch a wire that breaks at the seam.

The motivating example from PR #130: `src/sectors/sceneBuilder.js:339`
reads `cvActor.img` expecting the art pipeline to have populated it.
The expectation lived only in a comment in `ship.js` (`actor.img ←
portrait dataUri (set by art pipeline)`) and a reader in
`sceneBuilder.js`. No test pinned the contract until PR #130 wired
*and* asserted it.

**Method.** Audited the 5 high-traffic integration points listed in
the plan. For each, identified writer file:line, reader file:line, the
exact field/path name, and whether a Quench batch exercises both ends
together.

### Integration point 1 — Entity flag payloads ↔ entity panel rendering

**Contract:** Entity writers stamp `actor.flags[MODULE].{entityType,
entityId, <type>}` routing crumbs; the entity panel scans every Actor
in `iterEntityDocuments` and routes by `entityType`.

| Writer (file:line) | Reader (file:line) | Field / path | Status | Asserting test |
|---|---|---|---|---|
| `src/entities/ship.js:135-136` | `src/ui/entityPanel.js:116` `iterEntityDocuments` | `actor.flags[MODULE].{entityType, entityId}` | PINNED | `src/integration/quench.js:2188` ship routing |
| `src/entities/planet.js:106-107` | `src/ui/entityPanel.js:116` | `actor.flags[MODULE].{entityType, entityId}` | PARTIAL | `tests/unit/entityLocationFamilyActor.test.js:88` (flag presence only — entity-panel reader path not exercised) |
| `src/entities/settlement.js:122-123` | `src/ui/entityPanel.js:116` | `actor.flags[MODULE].{entityType, entityId}` | PARTIAL | `tests/unit/entityLocationFamilyActor.test.js:36` (same — reader path not exercised) |
| `src/entities/location.js:98-99` | `src/ui/entityPanel.js:116` | `actor.flags[MODULE].{entityType, entityId}` | PARTIAL | `tests/unit/entityLocationFamilyActor.test.js:121` (only `type` field asserted) |

**Key gap.** Planet, settlement, and location routing crumbs are
written but never round-tripped through the entity panel's loader.
This is the same defect class that hid ENTITY-001 for months
(journal-vs-page flag read bug; tests existed for the writer but no
test exercised the panel's `loadAllEntities()` reader against the
written flag).

### Integration point 2 — Assembler packet → `buildNarratorSystemPrompt` → API call body

**Contract:** `assembleContextPacket` builds a packet with named
sections (safety, permissions, oracle seeds, truths, location, ledger,
ship position, tracks, connections, sector, character) in fixed order;
`buildNarratorSystemPrompt` expects the packet to have matching
section names; the assembled string lands in the system prompt sent to
Claude (with `cache_control: ephemeral` on the system prompt).

| Writer (file:line) | Reader (file:line) | Contract piece | Status | Asserting test |
|---|---|---|---|---|
| `src/context/assembler.js:86-200` (section assembly) | `src/narration/narratorPrompt.js:714` `buildNarratorSystemPrompt` | Section names + ordering | PARTIAL | `src/integration/quench.js:98-102` pins the `NARRATOR_PERMISSIONS` block; `quench.js:5708` pins Section 6.5 ledger; `quench.js:2466-2508` pins ship position. **No test asserts the full section ordering, or that omitting one section doesn't silently swallow downstream context.** |
| `src/context/assembler.js:11-26` (system-prompt vs user-message boundary docs) | `src/api-proxy.js` `apiPost` | Which fields land in the cached system prompt vs the volatile user message | GAP | The boundary is documented in the assembler's header but no test asserts that, e.g., the ledger doesn't end up in the system prompt and break caching |

**Key gap.** A section rename or a typo in the section header would
silently drop that section from the prompt — the model would receive a
missing-section prompt and produce thinner narration, with no test
failing.

### Integration point 3 — Art pipeline contract

**Contract:** `generatePortrait` → `storeArtAsset` (journals the b64) →
`linkPortraitToEntity` (writes the `portraitId` flag) →
`attachPortraitToActor` (writes `actor.img` + `prototypeToken.texture.
src` from the uploaded file path). Two readers downstream:
`entityPanel` loads the cached asset by `portraitId`; `sceneBuilder`
reads `actor.img` for the command-vehicle Token icon.

| Writer (file:line) | Reader (file:line) | Field / path | Status | Asserting test |
|---|---|---|---|---|
| `src/art/generator.js:88` `linkPortraitToEntity` | `src/ui/entityPanel.js:117` `loadArtAsset(portraitId)` | `entity.portraitId` flag | PINNED | `src/integration/quench.js:7602-7645` (ship portrait end-to-end) |
| `src/art/generator.js:89` `attachPortraitToActor` (ship path) | `src/sectors/sceneBuilder.js:339` | `cvActor.img` | PINNED | `src/integration/quench.js:7602-7645` (same batch asserts `actor.img` is set and points to `worlds/<id>/art/`) |
| `src/art/generator.js:89` `attachPortraitToActor` (planet/settlement/location path) | — | `actor.img` on non-ship Actor-hosted entities | GAP | No integration test exercises the wire for these three types (same finding as Lens 1 Cluster A — confirmed here from the cross-file angle) |

**Key gap.** Same wire as the Lens 1 finding, now traced from both
ends. The cross-file expectation is implicit (the same writer feeds
all four types) but only one of the four has an integration test
pinning the contract.

### Integration point 4 — Sector Token drag → synthetic Set a Course

**Contract:** `createSectorScene` stamps the command-vehicle Token
with `flags[MODULE].commandVehicle: true`. The drag handler
(`handleCommandVehicleTokenDrag` in `sectorSceneHooks.js`) reads that
flag and, on a settlement-snap landing, dispatches a synthetic chat
message with `forcedMoveId: "set_a_course"`. The move pipeline
consumes the forced move ID and runs `narrateResolution`.

| Writer (file:line) | Reader (file:line) | Field / path | Status | Asserting test |
|---|---|---|---|---|
| `src/sectors/sceneBuilder.js:355` | `src/sectors/sectorSceneHooks.js:100` | `tokenDoc.flags[MODULE].commandVehicle` | PINNED | `src/integration/quench.js:7396` `commandVehicleRegistration` batch; plus the `sectorScene` batch exercises the drag path |
| `src/sectors/sectorSceneHooks.js:197` `ChatMessage.create({ forcedMoveId: "set_a_course" })` | `src/index.js` move dispatcher → `src/moves/interpreter.js` | Synthetic chat message; `forcedMoveId` field | GAP | The `sectorScene` batch creates the scene and exercises Token drag logic, but no test asserts that `set_a_course` was actually dispatched and resolved by the move pipeline |

**Key gap.** A regression in the synthetic-message format (renamed
flag, wrong move ID) would land the Token without ever running the
move. Players would see the Token move on the map but no card in
chat, no narration, no consequence persistence.

### Integration point 5 — Chat command predicate matrix

**Contract:** The `createChatMessage` hook chains ~20 `is*Command`
predicates. Each predicate must be mutually exclusive (no two match
the same input); each matching predicate routes to a handler that
persists a side-effect (campaign-state write, ChatMessage post,
JournalEntry create, or UI dialog open).

| Aspect of the contract | Status | Asserting test |
|---|---|---|
| Each individual predicate-handler pair (≈19 of 23 commands tested individually) | PINNED | `src/integration/quench.js:2619-2776` (chatCommands batch) — `!at` 2679, `!journal` 2698, `!x` 2727, `@scene` 2744, `!sector` 2712, etc. |
| Each handler's side-effect persists to `game.settings` (visible across reload) | PINNED | Same batch re-reads `game.settings.get()` after each handler completes |
| **Predicate-matrix mutual exclusivity** — no command matches more than one predicate | GAP | No test asserts that, e.g., `!at Starfall` matches `isAtCommand` and NOT `isSectorCommand`. A typo in a regex (`isAtCommand` accidentally matching `!atlas`) would not be caught. |

**Key gap.** Latent — typo defect in a predicate regex would silently
route a command to the wrong handler. The chatCommands batch tests
the happy path of each predicate but never asserts the disjointness
between predicates.

### Consolidated cross-file risks

| Risk class | Lens 1 finding | Lens 3 finding | Combined verdict |
|---|---|---|---|
| Planet/settlement/location Actor wires (routing crumbs, `actor.img`, `system.description`) | ASPIRATIONAL (Cluster A) | PARTIAL writer-only / GAP at the reader (IP1, IP3) | One end-to-end batch closes both findings: create a planet + settlement + location Actor via the same hook the production code uses, assert routing crumbs are reachable from the entity panel and `actor.img` is set after `generatePortrait` |
| Token drag → synthetic move | not in Lens 1 | GAP at the move-pipeline end (IP4) | New batch to surface |
| Predicate-matrix exclusivity | not in Lens 1 | GAP (IP5) | New batch to surface (cheap — table-driven test) |
| Assembler section ordering | not in Lens 1 | PARTIAL (IP2) | New unit test (cheap — `assembleContextPacket` returns a deterministic ordered list of section headers) |
| Sector background art upload + Scene grid config + narrator stub journal archival | not in Lens 1 | PARTIAL / GAP (Sector Enhanced Lens 2 rows) | One batch covers Sector Enhanced UI surface together |

---

## Consolidated risk-ranked priority list (Lenses 1 + 2 + 3)

Updated from the Lens 1 list. Combined / re-ranked across all three
lenses. Each row maps to a single batch / fix session.

| Priority | Finding | Lens | Why this risk | Proposed fix |
|---|---|---|---|---|
| 1 | Planet / settlement / location Actor wires (routing crumbs `entityType` / `entityId`, `actor.img`, `system.description`, full flag payload) have no integration test exercising the entity-panel reader path | 1 + 3 | Same defect class as PR #130 (ship was wired and pinned; the other three Actor-hosted types were wired but not pinned) and ENTITY-001 (writers tested, panel reader path missed for months). A schema migration, flag-namespace change, or art-pipeline regression would silently empty the entity panel or revert generic icons for these three types. | One Quench batch creating one of each type via the same hook the production code uses; assertions: (a) `actor.flags[MODULE].entityType` round-trips through `entityPanel.iterEntityDocuments`; (b) `actor.img` is set after `generatePortrait` for each type and lands on `prototypeToken.texture.src`; (c) `actor.system.description` matches the input. ~3 `it()` blocks, mirrors PR #130 ship pattern. |
| 2 | Sector Token drag → synthetic `set_a_course` dispatch — drag handler creates the chat message but no test asserts the move pipeline actually consumed `forcedMoveId` and ran `narrateResolution` | 3 (IP4) | High player-visible risk — a regression here means the Token moves but no narration / no persistence / no consequence; a silent feature-disabled state for a flagship affordance. Renamed flag, wrong move ID, or hook race-condition would all surface as "drag works but nothing happens." | Extend the `sectorScene` Quench batch with a test that performs the simulated drag, then waits for and asserts a `narratorCard` (or move-resolution card) lands in chat with the expected sector context. |
| 3 | Chat command predicate-matrix exclusivity not tested — no assertion that any given input matches at most one `is*Command` predicate | 3 (IP5) | Latent typo defect. The matrix has grown to ~20 predicates organically; a regex tweak in any one (e.g. widening `isAtCommand` to match `!atlas`) silently re-routes commands. CHAT-001 (the `!`-prefix migration) was an instance of the same defect class at the framework boundary. | Table-driven test: build a fixture list of representative command strings (one per command, plus near-miss adversarials like `!atlas`, `!recap-fake`, `@sceney`), iterate every `is*Command` predicate against each, assert ≤1 match per string. ~30 lines. |
| 4 | Assembler section-ordering + section-omission contract not pinned — Section 6.5 ledger, NARRATOR_PERMISSIONS block, ship position are each tested in isolation but no test asserts the full ordered list of section headers nor that an omitted section doesn't drop downstream context | 3 (IP2) | A section rename or typo would silently thin the narrator prompt — model produces emptier narration with no test failing. The system-prompt-vs-user-message boundary (cache stability) is documented in `assembler.js:11-26` but not asserted. | Unit test: feed `assembleContextPacket` a fully-populated fixture campaignState, capture the ordered list of section headers (e.g. via regex on `## SECTION NAME`), assert against a snapshot list. Add a second test that omits one section and asserts subsequent sections still render. |
| 5 | `setPortraitSourceDescription` (`connection.js:382`) has no production caller — comment references the removed Loremaster hook | 1 (Cluster B) | Same as Lens 1 row. | Trace whether the connection art path needs a deferred source-description write. If dead: delete. If still needed: wire from `entityExtractor` or narration path and update the comment. |
| 6 | `promoteTextSubject` (`factContinuity/ledgers.js:168`) has no production caller — promised entity-panel affordance never wired | 1 (Cluster B) | Same as Lens 1 row. Free-text truths captured before an entity was created stay text-bound forever. | Wire from `entityPanel.js` `#onConfirmDraft`. ~10 lines + Quench assertion. |
| 7 | `sectorGenerator.js:355` TODO references "when WJ ships" though WJ has shipped | 1 (Cluster B) | Same as Lens 1 row. Player-visible: narrator never references rolled sector trouble as a threat. | Wire `recordThreat(sector.trouble, ...)` call; extend `sectorCreatorWizard` Quench batch to assert the threat lands in WJ. |
| 8 | Sector Creator Enhanced — background art upload path, Scene grid config, and narrator stub journal-page archival all PARTIAL | 2 (Sector Enhanced) | Lower risk than Priority 1-4 — these UI surfaces are visually inspectable on every sector creation, so silent regression is less likely. Still worth pinning. | One Quench batch covering: stub `generateSectorBackground` + assert the returned path resolves; assert created Scene has the expected `grid` config; assert generated stubs land on the configured journal pages. |
| 9 | API Key Privacy — settings-panel HTML rendering for the About tab GM gate and the "Set / Not set" badge not asserted | 2 (API Key Privacy) | Settings-panel UI surface only. A regression breaks the GM-only gate, exposing keys to players — which is the *one* thing this scope exists to prevent. | Extend `settingsRoundTrip` Quench batch: as a player user, assert the About tab inputs are absent from the rendered HTML; as GM, assert presence and the "Set" badge toggles after save. |
| 10 | Documentation rot from Lens 1 Cluster B (`safety.js:101` `/x` prefix, `connection.js:388` art-pipeline caller name) | 1 | Pure tidy. | One-line comment rewrites — see Lens 1 Cluster B rows for proposed text. |
| 11 | Loremaster vocabulary JSDoc drift (not field names) | 1 | Pure tidy. | Bulk JSDoc rewrite across 6 entity files + `truths/generator.js`. |
| 12 | `campaignState.characterIds` / `activeCharacterId` dead schema fields | 1 | Long-term schema clean-up; not a regression risk. | Behaviour-no-change refactor. |

**Priority cluster summary:**

- **Top 4 (high-risk gaps):** Priority 1 (planet/settlement/location wires), 2 (Token drag → move), 3 (predicate matrix), 4 (assembler section ordering). These are the gaps most likely to surface as silent production regressions.
- **Mid 4 (medium-risk wire-up):** Priority 5-8 — connect helpers / TODOs / UI surfaces that were promised but never finished.
- **Lower 4 (documentation tidy):** Priority 9-12 — pure rewrites and dead-code clean-up.

The total list is 12 items (vs. the prior quench-coverage-audit's 10).
Sized for an implementation cadence of one batch / fix per session,
the audit's implementation phase will span 12 sessions matched to the
v1.5.x batch pattern.

---

## Implementation cadence

All three lenses are now complete. Implementation work is the follow-on
phase — one batch / fix per session, same gating as the prior audit:
`npm test && npm run lint` clean before every commit, `CHANGELOG.md`
updated, help-journal updated for user-facing changes. The 12-item
priority list above sizes the implementation phase at roughly 12
sessions, matching the v1.5.x batch cadence of the prior audit.

Start with **Priority 1** (planet/settlement/location Actor-wire
batch). It closes the largest single risk cluster (5 separate Lens 1
findings + 2 Lens 3 findings collapse into one Quench batch) and
exercises the same defect class that PR #130 fixed for ship.

---

## Verification

To re-verify the audit's findings mechanically as the codebase
evolves:

### Lens 1 — aspirational-comment sweep

```bash
# Schema-arrow comment inventory — expect ~27 lines at audit time
grep -rn '←' src/entities/*.js | wc -l

# Production callers of suspected dead helpers
grep -rn "setPortraitSourceDescription" src/ --include='*.js' \
  | grep -v "integration/quench" | grep -v "/connection.js"
# expect: empty (Priority 5)

grep -rn "promoteTextSubject" src/ --include='*.js' \
  | grep -v "integration/quench" | grep -v "/ledgers.js"
# expect: empty (Priority 6)

# WJ-shipped TODO still present
grep -n "TODO: World Journal" src/sectors/sectorGenerator.js
# expect: 1 line (Priority 7) — should be empty after fix lands

# Loremaster vocabulary count
grep -rc "Loremaster\|loremaster" src/ --include='*.js' \
  | grep -v ':0$' | wc -l
# expect: ~25 files at audit time
```

Run the Lens 1 grep recipes from the plan to catch newly-introduced
aspirational comments:

```bash
grep -rn '←' src/ --include='*.js' | grep -v 'entityPanel.js'
grep -rn -E '(populated|set|written|wired) by ' src/ --include='*.js'
grep -rn -E '^\s*(\*|//)\s*(Called by|Used by)' src/ --include='*.js'
grep -rn 'TODO' src/ --include='*.js'
```

### Lens 2 — scope-doc behavioural parity

For each ✅ COMPLETE scope in `docs/scope-index.md`, the audit recorded
3–5 user-visible promises and confirmed at least one asserting test
per promise (PINNED), or flagged it as PARTIAL / GAP. To re-verify:

```bash
# Quench batch count — expect 48 at audit time (scope-index lists 47; recent batch landed)
grep -c '"starforged-companion\.' src/integration/quench.js

# Helper test files cited in the cluster A findings — expect each exists
ls tests/unit/{narratorPrompt,actorBridge,chronicle,chronicleWriter,recap,relevanceResolver,sceneInterrogation}.test.js

# Helper test files cited in the cluster B findings — expect each exists
ls tests/unit/{factContinuity,audio,pacing,sectorGenerator,ironswornAssets}.test.js
```

Each PARTIAL / GAP row in the Lens 2 tables names a specific scope and
promise. Fix order is the priority list; verification of each fix is
the assertion the row prescribes.

### Lens 3 — cross-file expectation audit

Each integration point lists writer file:line, reader file:line, and a
named contract piece. To re-verify the writer/reader pairs still match:

```bash
# Entity routing-crumb writers
grep -nE "(entityType|entityId)" src/entities/{ship,planet,settlement,location}.js \
  | grep -E "(set|update|writeEntityFlag|flags\[)"

# Entity panel reader
grep -n "iterEntityDocuments\|entityType" src/ui/entityPanel.js | head -10

# Assembler section names — expect the canonical list at the top of assembleContextPacket
grep -n "^## " src/context/assembler.js | head -20

# Token-drag synthetic move dispatch
grep -n "forcedMoveId\|set_a_course" src/sectors/sectorSceneHooks.js

# Chat command predicate registry
grep -nE "^function is[A-Z][a-zA-Z]+Command" src/index.js | wc -l
# expect: ~20+ predicates
```

A drift in any of these greps without a corresponding test update is a
signal to revisit the Lens 3 table.
