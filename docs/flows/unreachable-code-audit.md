# Unreachable-code audit — as found

A whole-tree sweep for code that is produced but never consumed: dead exports,
parallel-dead sibling helpers, dead-in-production modules, unregistered oracle
content, dead parameters/branches, and registered-but-unread settings —
verified against source (v1.7.30 cycle, 2026-07). Companion to
`rules/reachability.md` (the invariant these findings all violate) and the
`docs/flows/*-flow.md` feature audits.

Prompted by: "Please audit the codebase for currently unreachable blocks of
code."

**Status: RESOLVED — all nine issues (#269–#277) fixed in the v1.7.30 cycle**
("Please address the remaining recent issues"). Dispositions: #269 lore-recap
re-homed to `buildNarratorExtras` → the [4g] WORLD LORE block; #270
session-notes stub removed (doubly dead — no writer, and the pipeline never
passed sessionState); #271 assembler + its test file deleted, global token
budget declared obsolete (decisions.md), `contextPacket` param +
`ContextPacketSchema` retired, packet-based Quench batches rewritten to the
live seam; #272 all 14 theme peril/opportunity tables registered; #273 the 7
entity `formatForContext` copies deleted; #274 dead entity API deleted with
the write side completed (allyFlag/sceneRelevant fields retired); #275
planets + non-site locations WIRED into the ACTIVE SECTOR roster (sites
excluded — no leak); #276 windowPosition wired, locationArtSource removed
with a recorded decision, stub + getters deleted; #277 Tier-4 singletons
deleted, the three ElevenLabs voice defaults single-sourced, `listCreatures`
(missed by the issue partitioning) removed. The assembler-deletion
collaterals (safety token/suppression helpers, `formatOracleResultLine`,
`getRecentDiscoveries`) were swept under the bidirectional-teardown rule.
**Post-fix proof: `node scripts/deadscan.mjs` → 0 DEAD exports, 0 DEAD
settings.** The sections below are preserved as the audit record.

Tags: **DEAD-IN-PROD** (runs only under tests), **DEAD-EXPORT** (no consumer),
**DEAD-CONTENT** (authored table never registered), **INCOMPLETE-TEARDOWN**
(superseded path left inert), **DEAD-PARAM**, **DEAD-SETTING**, **DRIFT-RISK**
(dead mirror of a live value).

## Tracked as GitHub issues (#269–#277)

| Issue | Finding code(s) | What it is |
|---|---|---|
| #269 | LORERECAP-INJECT-ORPHANED | fix — re-home the lore-recap injection out of `assembler.js` |
| #270 | SESSION-NOTES-STUB | decide — wire the session-notes stub live, or remove it |
| #271 | ASSEMBLER-DEAD-IN-PROD + CONTEXTPACKET-PARAM-DEAD | retire `assembler.js` (**blocked by #269, #270**) + the global-budget decision |
| #272 | THEME-PERIL-OPP-DEAD | register (or drop) the 14 theme peril/opportunity oracle tables |
| #273 | FORMATFORCONTEXT-DEAD | delete the 7 dead entity `formatForContext` functions |
| #274 | SCENERELEVANT-DEAD, FACTION-API-DEAD, PLANET-ADDFEATURE-DEAD, CONN-LIST-DEAD | entity-record API teardown |
| #275 | LIST-LOC-PLANET-DEAD | surface planets/locations to the narrator, or remove the producers |
| #276 | CHRONICLE-HOOKS-NOOP, SHIPTOKEN-GETTERS-DEAD, SETTING-DEAD | Tier-3 dead-surface teardown |
| #277 | Tier-4 dead singletons (telemetry / roller / schema / enum / misc) | remove, or wire |

Sequencing: **#269 + #270 land first, then #271.** The rest are independent.
Tier 5 (test-only-in-prod) is left documented here, no issue.

## 1. Method

- **Export-reachability scan** over all 979 exported symbols: every
  word-boundary occurrence is counted, so dynamic-import destructuring
  (`const { x } = await import(…)`) and string dispatch (`"x"`) already register
  as consumers — a symbol appearing exactly once genuinely has no consumer in
  any form.
- **Parallel-definition pass**: treat *every* definition as non-consuming, to
  catch symbols masked by a sibling module (or a same-named live function) — the
  blind spot behind `setSceneRelevant` and `formatForContext` below. A naive
  scan sees N identical definitions as mutually "live."
- **Settings pass**: diff `settings.register(MODULE_ID, "key")` against every
  raw-key read (incl. optional-chaining and wrapper reads), then confirm each
  candidate against its raw key.
- **Targeted reads** for dead branches, unread parameters, and the
  `CONSEQUENCE_MAP` dispatch — the seams an export scan cannot see.

The single verification act that finds this class is a **flow trace** — follow a
value from source until it reaches a sink or dangles — which is why
`rules/reachability.md` names it the gate that `npm test` / `npm run lint`
cannot be.

## 2. Tier 1 — dead subsystems / large blocks

| Code | Location | Finding |
|---|---|---|
| ASSEMBLER-DEAD-IN-PROD | `src/context/assembler.js:96` (whole 1175-line file) | Sole export `assembleContextPacket` has **zero production callers** — every reference is in `src/integration/quench.js` or `tests/unit/assembler.test.js`. Narrator context moved to `buildNarratorExtras` (`narrator.js`); the module + its ~1400-line test file are CI-gated but never run live. **Content parity holds** — every load-bearing section flows through `buildNarratorExtras` + `narratorPrompt.js`, often via the same shared helpers — **but one capability was never ported**: global priority-ordered token-budget enforcement (`enforceBudget`/`truncateToTokens`, `:950`/`:986`). Deleting it is a decision, not a clean no-op — see the parity note below. `decisions.md:47` parks it ("budgeting reference; deletion needs explicit approval"). |
| THEME-PERIL-OPP-DEAD | `src/oracles/tables/themes.js:24-287` (14 tables) | The 7 themes' `*_PERIL` / `*_OPPORTUNITY` tables are authored but **never registered** — `roller.js` does `import * as THEMES` and wires only the 7 `*_FEATURE` tables (`roller.js:171-177`). Unreachable via `!oracle`. This is `SITE-ZONE-TABLES-DEAD` repeating, and inconsistent: space/planets/vaults/derelicts *do* register their peril/opportunity (`roller.js:64-168`). |
| FORMATFORCONTEXT-DEAD ×7 | `connection.js:423`, `location.js:194`, `settlement.js:221`, `planet.js:226`, `creature.js:155`, `ship.js:381`, `faction.js:370` | `formatForContext(entity)` defined in **7 entity modules with zero consumers** — no import, no `.member` dispatch, not even the (dead) assembler, which uses `formatEntityCard` from `narratorPrompt.js`. Masked because `truths/generator.js:252` defines a same-named live `formatForContext(truthSet)` whose one call site (`:444`) binds locally. Superseded by `formatEntityCard`, never torn down. |

**Parity note — the assembler is dead-in-prod but its deletion is a decision, not
a no-op.** The live path (`buildNarratorExtras` → `buildNarratorSystemPrompt`)
reproduces every load-bearing *content* section, but two things were never
ported:

- **Global token budgeting.** `enforceBudget` (`assembler.js:950`) capped the
  whole packet at ~8000 tokens and shed whole sections in a fixed priority order
  (session notes → lore recap → recent discoveries → asserted lore → …) under
  pressure, with safety / permissions / ledger exempt. The live path budgets
  only the **ledger sub-block** (`maxLedgerTokens ~400`; drops `state` first —
  `narratorPrompt.js:373`). There is no whole-prompt budget and no cross-section
  shedding anywhere live.
- **Three lowest-priority sections** — but none is a losable capability today,
  and one is a real casualty worth fixing on its own:
  - **session notes** — an unwired stub: `sessionState.notes` has **no writer
    anywhere** in `src/`, so `buildSessionNotesSection` always rendered empty,
    even pre-retirement. Delete freely.
  - **recent discoveries** — already covered live: the site audit surfaces
    charted sites via `mapData.discoveries` (`narrator.js:2188`, the Charted
    Sites block). The assembler's "this session — unconfirmed" variant is a
    separate low-value cut, not a regression.
  - **lore recap** — the real casualty. The `!lore` command
    (`generateLoreRecap`, `truths/generator.js:337`) is fully live and
    independent of the assembler (posts a card + a "The Story So Far" journal
    page), but it also persists `campaignState.loreRecap` *"for context
    injection"* (`schemas.js:809`) — and the assembler's dead
    `buildLoreRecapSection` was the **only** injector. See
    `LORERECAP-INJECT-ORPHANED` below.

So deleting the assembler breaks none of these; the lore-recap injection is
already broken and needs its own decision.

The budget most likely no longer matters — Opus 4.8 / Sonnet run 200K–1M context
and the one genuinely unbounded surface (the ledger) is already locally capped —
so the recommendation is to **declare the global budget obsolete and delete
`assembler.js` + `assembler.test.js`**, recording that decision. But that call
belongs to the maintainer, which is why `decisions.md:47` deferred it. Deleting
it as a *clean* teardown, on the assumption of full parity, would silently drop
the whole-prompt budget guard — so make the obsolete-budget decision explicitly
first.

## 3. Tier 2 — parallel-dead + speculative entity API

No consumer of any kind; invisible to a naive scan because sibling definitions
look mutually live.

| Code | Symbol / location | Note |
|---|---|---|
| SCENERELEVANT-DEAD ×5 | `setSceneRelevant` — `faction.js:352`, `location.js:176`, `settlement.js:202`, `creature.js:137`, `planet.js:208` | **Incomplete teardown.** The 2026-07 cleanup removed it from `connection.js` (tombstone comment `connection.js:342`) but left the 5 sibling copies. Cited in `reachability.md`. |
| FACTION-API-DEAD | `addRumor` (`faction.js:320`), `setProject` (`faction.js:339`) | Zero callers — the reachability-doc's own "speculative API surface" examples, still present. |
| PLANET-ADDFEATURE-DEAD | `addFeature` (`planet.js:200`) | Zero callers. |
| CONN-LIST-DEAD | `listAllyConnections` (`connection.js:153`), `listSceneConnections` (`connection.js:163`) | Zero callers. |
| LIST-LOC-PLANET-DEAD | `listLocations` (`location.js:143`), `listPlanets` (`planet.js:158`) | **Zero production callers** — only quench's string-dispatch harness invokes them. The narrator surfaces settlements + connections but never locations/planets via these. Latent missing-feature *or* dead producers — a design call. |
| LORERECAP-INJECT-ORPHANED | `loreRecap` written at `truths/generator.js:361`, read only at the dead `assembler.js:930` | **Produced-but-dead write — a real regression, not just dead surface.** `!lore` (`generateLoreRecap`) still generates the recap, posts a card, and writes the "The Story So Far" journal page, and persists `campaignState.loreRecap` *"for context injection"* (`schemas.js:809`) — but the assembler's dead `buildLoreRecapSection` was the **only** injector, so since the 2026-07 packet retirement the narrator no longer receives the world-lore recap. Fix = re-home the injection into `buildNarratorExtras`, or drop the now-purposeless `loreRecap`/`loreRecapSessionId` write + schema fields. Independent of the assembler-deletion decision. |

## 4. Tier 3 — dead parameters, stubs, getters, settings

| Code | Location | Finding |
|---|---|---|
| CONTEXTPACKET-PARAM-DEAD | `src/narration/narrator.js:284` (+ JSDoc `:275`) | `narrateResolution(resolution, contextPacket, …)` — `contextPacket` appears only in the signature and a JSDoc line that still points at the dead `assembler.js`. Every caller passes `null`/`{}`; the body never reads it. FACTION-PACKET-DEAD residue — benign (no abort) but dead surface + a doc pointer to a dead module. **Retention is intentional** (`decisions.md:46`, "kept for signature stability") — a recorded choice, not an oversight; still an unread param whose JSDoc points at dead code. |
| CHRONICLE-HOOKS-NOOP | `src/character/chroniclePanel.js:311` | `registerChroniclePanelHooks()` is an **empty stub** (body is one comment) and is never called. Superseded by the floating toolbar. |
| SHIPTOKEN-GETTERS-DEAD | `src/ui/settingsPanel.js:754` / `:757` | `getShipTokenEnabled` / `getShipTokenSnapRadius` — zero callers; the setting is read **directly** via `game.settings.get(…, "factContinuity.shipTokenEnabled")` at `sceneBuilder.js:417` and `sectorSceneHooks.js:137/165/445`. Dead getters **and** DRIFT-RISK (two reads of one setting with potentially different defaults). |
| SETTING-DEAD | `index.js:304` (`locationArtSource`), `private-channel/index.js:25` (`privateChannel.windowPosition`) | Registered, then **never read or written**. `windowPosition` means the private-channel panel position is not actually persisted. |

## 5. Tier 4 — dead singleton exports

Confirmed to appear exactly once (definition only), not on `module.api`:

- **Telemetry never read back:** `readConsistencyTelemetry` (`telemetry.js:152`),
  `readPacingTelemetry` (`telemetry.js:171`) — the logs are written; the readers
  have no consumer.
- **Roller helpers, zero callers:** `rollActionTheme` (`roller.js:348`),
  `rollDescriptorFocus` (`roller.js:355`), `formatOracleResult` (`roller.js:411`),
  `formatOracleContext` (`roller.js:423`).
- **Schema/enum exports never referenced:** `MOVE_CATEGORIES` (`schemas.js:92`),
  `LEGACY_TRACKS` (`:230`), `ProgressTrackSchema` (`:356`), `ClockSchema` (`:488`),
  `OracleResultSchema` (`:614`); `FACTION_ATTITUDES` / `LOCATION_STATUSES` /
  `LORE_CATEGORIES` (`worldJournal.js:45-47`) — the last three are
  single-source-of-truth enums nothing imports (consumers hardcode the strings →
  DRIFT-RISK).
- **Misc singletons:** `getPortraitDataUri` (`art/storage.js:149`),
  `resolveTypeKeyFromDocument` (`registry.js:123`), `addPassage`
  (`sectorMap.js:63`), `DEFAULT_NPC_FEMININE_VOICE_ID` (`elevenlabs.js:54`), and a
  dead test seam `_resetSharedSupplyForTests` (nothing — not even tests — calls
  it).

## 6. Tier 5 — dead-in-production but test-covered (low priority)

~26 exports are referenced *only* by `tests/` (e.g. `sufferDamage` /
`repairIntegrity` / `clearBattered` in `ship.js`, `buildEnvisionPrompt`, several
`*Schema` exports). Not unreachable in the strict sense — exercised by unit
tests but with no live caller. Many are legitimately kept for the test surface;
worth a glance, not a sweep.

## 7. Checked and clean

- **`CONSEQUENCE_MAP`** (`resolver.js:287`) — all 52 keys are real move ids; no
  dead handler.
- **Chat commands** — every `isXCommand` predicate in `index.js` is wired into
  the `createChatMessage` dispatcher; no undispatched command.

## 8. Coverage / caveats

- The **export, settings, and parallel-definition** layers are exhaustive and
  script-verified.
- The **statement-level dead-branch** layer (guards that cannot fire, superseded
  arms *inside* otherwise-live functions) across the four largest files —
  `index.js` (5892), `narrator.js` (2967), `resolver.js` (1413),
  `entityExtractor.js` (1940) — was traced by hand on the high-value seams
  (parameters, mode branches, the consequence map), not swept statement by
  statement. A full dead-branch sweep of those files remains the one open
  extension of this audit.

## 9. The through-line

Most Tier 1–3 findings are a producer whose consumer was removed (or never
arrived) without the producer being torn down in the same change —
`FORMATFORCONTEXT-DEAD` left in seven modules after the live narrator settled on
`formatEntityCard`; the 2026-07 cleanup removing one `setSceneRelevant` and
leaving five; the theme peril/opportunity tables authored a registration hop
short. Two are **deliberate retentions** rather than misses —
`ASSEMBLER-DEAD-IN-PROD` (kept for its budgeting reference) and its now-null
`CONTEXTPACKET-PARAM-DEAD` parameter — both parked in `decisions.md`: dead in
production, but by recorded choice, and the assembler's global token-budget guard
was never re-homed. This is exactly the class `rules/reachability.md` rules 1 (reachability
gate) and 2 (teardown) exist to prevent — and the doc's own cited examples
(`addRumor` / `setProject` / `setSceneRelevant`) are among the findings, which
means the rule was recorded but the teardown was never executed.
