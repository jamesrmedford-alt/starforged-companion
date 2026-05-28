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

*Not yet run. Phase 2 (next session.)*

Per the plan: for each ✅ COMPLETE row in `docs/scope-index.md` (and its
linked scope doc), decompose the description into discrete user-visible
promises. For each promise, find the test that fails when the promise
breaks. The contract: *"covered" ≠ "asserted"*.

---

## Lens 3 — Cross-file expectation audit

*Not yet run. Phase 3 (session after Lens 2.)*

Per the plan: catalogue data contracts that span files — file A writes
a flag / path / format / hook payload, file B reads it — and assert
both ends are wired together via an integration test. The PR #130
example: `src/sectors/sceneBuilder.js:339` reads `cvActor.img`
expecting the art pipeline to have populated it; no test pinned the
contract.

---

## Implementation cadence (after the audit deliverable is complete)

Same model as `docs/quench-coverage-audit-plan.md`: one batch / fix per
session, `npm test && npm run lint` clean before every commit,
`CHANGELOG.md` and help-journal updates per `CLAUDE.md`. The prior
audit produced 10 priorities across v1.5.x; this one is expected to be
similar in size once Lenses 2 and 3 add their findings.

---

## Verification

This is the Lens 1 deliverable. To re-verify the Lens 1 findings
mechanically as the codebase evolves:

```bash
# Schema-arrow comment inventory — expect ~28 lines
grep -rn '←' src/entities/*.js | wc -l

# Production callers of suspected dead helpers
grep -rn "setPortraitSourceDescription" src/ --include='*.js' \
  | grep -v "integration/quench" | grep -v "/connection.js"
# expect: empty (Priority 4)

grep -rn "promoteTextSubject" src/ --include='*.js' \
  | grep -v "integration/quench" | grep -v "/ledgers.js"
# expect: empty (Priority 5)

# WJ-shipped TODO still present
grep -n "TODO: World Journal" src/sectors/sectorGenerator.js
# expect: 1 line (Priority 6) — should be empty after fix lands

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
