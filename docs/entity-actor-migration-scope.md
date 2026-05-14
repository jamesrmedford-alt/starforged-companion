# Starforged Companion — Entity → Actor Migration Scope
## Move four custom entity types onto native foundry-ironsworn Actor documents

**Status:** 📋 PLANNED
**Priority:** TBD (no current blocker; opportunistic structural cleanup)
**Estimated Claude Code sessions:** 3
**Dependencies:** Character Management (✅), Ironsworn API (✅), Narrator Entity Discovery (✅), World Journal (✅), Quench Integration Tests (✅)
**Pre-requisite:** None — entity reads/writes are concentrated in a small surface (`src/entities/*.js`, `src/ui/entityPanel.js`, `src/context/{assembler,relevanceResolver}.js`)

---

## 1. Context

The narrator's entity-discovery pipeline (Phase 1) creates entity records as JournalEntries with the data stored on the embedded `JournalEntryPage`'s `flags["starforged-companion"][type]`. This worked but was always at odds with the project's stated intent of integrating with the foundry-ironsworn system: ships, planets, locations, and settlements are first-class **Actor** documents in that system, and using them would give us:

- Tokens placeable on scenes (Settlements as scene markers; ships as travel tokens)
- The system's native sheet UI for ship debilities (battered/cursed render correctly with the `ImpactField` widget)
- Compendium and sidebar integration (entities appear in the standard Actors tab grouped by type)
- A canonical `actor.img` field that Foundry knows how to render in chat, sidebars, and token wildcards — removes the `data.portraitId → loadArtAsset()` indirection for display

A field-by-field review (`docs/foundry-api-reference.md` plus `vendor/foundry-ironsworn/src/module/actor/subtypes/`) shows four of the seven custom types have native Actor analogues strong enough to migrate:

| Custom type | Native Actor | Match quality | Storage shape |
|---|---|---|---|
| `ship` | `starship` | Strong | `system.notes` + `system.debility.{battered,cursed}` + flags |
| `planet` | `location` (subtype) | Strong (semantic fit) | `system.subtype='planet'` + `system.description` + flags |
| `location` (POI) | `location` (subtype) | Shape OK; name collision | `system.subtype='derelict'\|'vault'\|...` + flags |
| `settlement` | `location` (subtype) | Shape OK; type meaning stretched | `system.subtype='settlement'` + flags |

The three remaining types (`connection`, `faction`, `creature`) **stay journal-backed** — they have no clean Ironsworn analogue, and migrating them onto `foe`/`shared` would force misleading sidebar categorisation. They are explicitly out of scope here.

---

## 2. Goal

After this migration:

- `createShip` / `createPlanet` / `createLocation` / `createSettlement` produce **Actor documents** (not JournalEntries).
- The entity panel renders the same four sections by reading from `game.actors.filter(a => a.type === ...)`, with our subtype discriminator (`system.subtype`) deciding which custom-typeKey a `location` belongs to.
- Existing campaigns with JournalEntry-backed entities are migrated by a one-time GM-triggered command (`!migrate-entities`) that creates the equivalent Actor for each entry, copies the flag payload, and deletes the journal.
- Connection, faction, and creature continue to work exactly as they do today.

---

## 3. Storage layout

### 3.1 Field placement rule

For each migrated type:
- **Native `system.*` fields** carry the values that have a direct Ironsworn-schema analogue.
- **Module flags** at `actor.flags["starforged-companion"][type]` carry every Starforged-specific field. Same flag shape as today, just hosted on a different document.
- **`actor.img`** holds the portrait — replaces the read-side use of `data.portraitId`. The `ArtAsset` record still persists in `src/art/storage.js` (prompt history, regeneration count, b64 source) but display goes through `actor.img`. The asset record's `_id` is stored at `flags[MODULE][type].portraitId` so regenerate-and-lock continues to function.

### 3.2 Per-type mapping

**Ship → starship**
```
actor.type             = "starship"
actor.name             = ship.name
actor.img              = (data URI from linked ArtAsset)
system.notes           = ship.notes  (HTML)
system.debility.battered = ship.battered
system.debility.cursed   = ship.cursed
flags[MODULE].ship = {
  _id, type, firstLook, mission, integrity, integrityMax,
  isCommandVehicle, ownerCharacterId, supportVehicleIds,
  description, history, portraitId, portraitSourceDescription,
  canonicalLocked, generativeTier, sceneRelevant,
  createdAt, updatedAt,
}
```

**Planet → location** (`subtype='planet'`)
```
actor.type             = "location"
actor.name             = planet.name
actor.img              = (portrait)
system.subtype         = "planet"
system.klass           = planet.type  (Desert World / Vital World / ...)
system.description     = planet.description  (HTML)
flags[MODULE].planet = {
  _id, atmosphere, life, observedFromSpace,
  features, biomes, diversity, peril, opportunity,
  settlementIds, portraitId, portraitSourceDescription,
  sceneRelevant, loremasterNotes, canonicalLocked, generativeTier,
  notes, createdAt, updatedAt,
}
```

**Location (POI) → location** (`subtype` = our `type`)
```
actor.type             = "location"
actor.name             = location.name
actor.img              = (portrait)
system.subtype         = location.type  (derelict | vault | station | anomaly | ruin | other)
system.klass           = null
system.description     = location.description  (HTML)
flags[MODULE].location = {
  _id, region, status,
  firstLook, feature, peril, opportunity,
  history, notes, narratorNotes,
  portraitId, portraitSourceDescription, sceneRelevant,
  sectorId, settlementId,
  canonicalLocked, generativeTier,
  createdAt, updatedAt,
}
```

**Settlement → location** (`subtype='settlement'`)
```
actor.type             = "location"
actor.name             = settlement.name
actor.img              = (portrait)
system.subtype         = "settlement"
system.klass           = settlement.location  (Planetside | Orbital | Deep Space)
system.description     = settlement.description  (HTML)
flags[MODULE].settlement = {
  _id, population, firstLook, initialContact, authority,
  projects, trouble,
  history, notes,
  portraitId, portraitSourceDescription,
  sceneRelevant, loremasterNotes, connectionIds,
  canonicalLocked, generativeTier,
  createdAt, updatedAt,
}
```

### 3.3 Type disambiguation for `location`-backed Actors

Three of our type-keys (`planet`, `location`, `settlement`) all map to `actor.type === 'location'`. The entity panel and assembler need to distinguish them. Single-source resolution:

```js
function resolveTypeKey(actor) {
  if (actor.type === 'starship') return 'ship';
  if (actor.type !== 'location') return null;
  const sub = actor.system?.subtype;
  if (sub === 'planet' || sub === 'settlement') return sub;
  // Anything else under 'location' (derelict/vault/station/anomaly/ruin/other
  // and the system's default 'star') is treated as our 'location' typeKey.
  return 'location';
}
```

The subtype values live in `flags[MODULE_ID][typeKey]` *also* (already there in `data.type` for ship/planet/location and `data.location` for settlement); `system.subtype` becomes the authoritative source. The flag duplicates are kept readable so the migrator and the existing entity records share field names — single subsequent cleanup removes the legacy field once the migrator has shipped.

---

## 4. Surface changes

Files that need to know about the new storage:

### 4.1 Entity creators — full rewrite

- `src/entities/ship.js`, `planet.js`, `location.js`, `settlement.js`

For each: change `JournalEntry.create({ folder, flags })` + `createEmbeddedDocuments("JournalEntryPage", ...)` into:

```js
const folder = await getOrCreateActorsFolder();
const actor  = await Actor.create({
  name:   entity.name || "Unknown <Type>",
  type:   <native type>,
  img:    "<placeholder image>",
  folder: folder.id,
  system: { /* native fields */ },
  flags:  { [MODULE_ID]: {
    [TYPE_KEY]: entity,           // full custom shape
    entityType: <type>,           // routing crumb for cross-type lookups
    entityId:   entity._id,
  } },
});
campaignState[<typeKey>Ids].push(actor.id);
```

Reads (`getShip`, `getPlanet`, etc.) replace `game.journal.get(id) → page.flags...` with `game.actors.get(id) → actor.flags...`. Update helpers (`updateShip`, `sufferDamage`, `repairIntegrity`, etc.) call `actor.update({ system: {...}, flags: {...} })` and split native-side fields (battered/cursed) from flag-side fields.

### 4.2 Folder helper

`src/entities/folders.js` (or wherever `getOrCreateEntitiesFolder` currently lives — confirm in the read-pass) gains a sibling `getOrCreateActorsFolder()` that scoped under the existing Companion-managed folder structure but for Actors. The entity folder for connection/faction/creature is kept; they remain JournalEntries.

### 4.3 Entity panel

`src/ui/entityPanel.js`:
- `ENTITY_TYPES` stays — typeKey labels and icons are unchanged.
- `loadAllEntities()` and `findEntity()` are split into two paths:
  - For `connection`/`faction`/`creature` — current `game.journal` iteration + page flag read.
  - For `ship`/`planet`/`location`/`settlement` — `game.actors` iteration + flag read, dispatched by `actor.type` and `actor.system.subtype` via `resolveTypeKey()`.
- All mutation handlers (`#onPromoteTier`, `#onToggleCanonicalLock`, `#onSetCurrentLocation`, etc.) get the same split. The page-flag write path stays for journal-backed types; an `actor.setFlag` path is added for actor-backed types.
- Hooks: `updateJournalEntryPage` / `createJournalEntryPage` stay for the three remaining journal types; add `updateActor` / `createActor` / `deleteActor` for the four migrated types so the panel re-renders when actor state changes.

### 4.4 Entity extractor / draft cards

`src/entities/entityExtractor.js`:
- `ENTITY_CREATORS` map keeps the same keys; the imported functions are the new actor-based creators.
- `ENTITY_GETTERS` / `ENTITY_ID_FIELDS` unchanged on the surface; the underlying getters return the same shape but read from Actors for the four migrated types.
- `entityExistsAnyType` and `entityExistsForName` need a small update: the cross-type ID enumeration now hits both `game.journal` and `game.actors`.

### 4.5 Context assembly

`src/context/assembler.js` and `src/context/relevanceResolver.js`:
- The `[typeKey, getter, idList]` table in `relevanceResolver.js:224` is unchanged — the getters are the new actor-backed versions.
- `buildActiveConnectionsSection` and the active-sector/current-location blocks just need to know the new document type when they format facts; if the formatter receives the flag payload (which is the same shape), no change is needed. Confirm during implementation.
- `getActiveCharacter`, `getChronicleEntries` — unchanged (already Actor-based).

### 4.6 Portrait pipeline

`src/art/generator.js`:
- `linkPortraitToEntity` currently does `page.setFlag(MODULE_ID, entityType, { ...existing, portraitId })`. Split by type:
  - Journal types: existing path.
  - Actor types: `actor.update({ img: dataUri })` *plus* `actor.setFlag(MODULE_ID, entityType, { ...existing, portraitId })`.
- `findEntity`-equivalent inside the art pipeline (which currently looks up the journal) needs to also resolve actors. A shared `getEntityDocument(typeKey, id)` helper in `src/entities/registry.js` (new file) is the cleanest place for this.

### 4.7 Sector generator

`src/sectors/sectorGenerator.js` calls `createSettlement` (line 230). Once `createSettlement` returns an Actor instead of a JournalEntry, the call site only needs `entry.id` → `actor.id` rename. Confirm during implementation.

### 4.8 Campaign state

`shipIds`, `planetIds`, `settlementIds`, `locationIds` keep their position in `campaignState`. After the migration, the IDs reference Actor documents instead of JournalEntry documents — every reader already passes the ID through a typed getter, so callers don't see the change. We could derive these from `game.actors.filter(...)` but keeping the explicit list is cheaper (the assembler already iterates them frequently) and preserves "what belongs to this campaign" semantics for future multi-campaign worlds.

`currentLocationId` / `currentLocationType` — same. After migration `currentLocationId` is an Actor ID for `currentLocationType === 'settlement'`. Reader at `src/context/assembler.js:378` resolves via `game.actors.get(id)` instead of `game.journal.get(id)`.

---

## 5. One-time migrator

`!migrate-entities` chat command, GM-only. Steps:

1. Enumerate every JournalEntry under the existing entities folder.
2. For each, read `page.flags[MODULE_ID][type]`. If `type ∈ {ship, planet, location, settlement}`:
   1. Create the equivalent Actor (per §3.2 mapping). Preserve `flags[MODULE_ID].<type>._id` (the existing custom GUID) so context-card cross-references survive.
   2. Replace the campaignState ID list entry (`shipIds[]`, etc.) with the new actor ID. Replace `currentLocationId` if it points at this entry.
   3. Mark the source JournalEntry with `flags[MODULE_ID].migrated = { toActorId, at }`. **Do not delete** in this pass — a deferred reaper command (`!migrate-entities --cleanup`) deletes documents that have been marked for >7 days, giving users time to bail out if anything is wrong.
3. Report a summary chat card: counts per type, IDs migrated, IDs skipped (e.g. corrupt payloads), and any unresolved cross-references (`currentLocationId` pointing at a settlement that wasn't migrated).
4. Idempotent — re-running skips entries already flagged `migrated`.

Migrator lives at `src/entities/migrator.js` and is registered as a chat command in `src/index.js` alongside the existing `!recap` / `!pace` etc. handlers.

---

## 6. Test plan

### 6.1 Unit tests (Vitest)

Mirror the four entity-source files in `tests/unit/`:
- `tests/unit/entityShipActor.test.js` — covers `createShip` writing the right `system.debility` shape and the right flag payload; `sufferDamage` clamping integrity; `clearBattered` flipping the native field.
- `tests/unit/entityPlanetActor.test.js` — `createPlanet` writes `system.subtype='planet'`; `addFeature` appends to the flag-side `features[]`.
- `tests/unit/entityLocationActor.test.js` — `createLocation` writes `system.subtype` equal to the input `type`; `system.klass = null`.
- `tests/unit/entitySettlementActor.test.js` — `createSettlement` writes `system.subtype='settlement'`; `system.klass` carries the location-class enum; connection-link flag payload preserved.

`tests/setup.js` factory `makeTestActor` needs a `type` parameter and the four matching system shapes. The existing `makeTestActor` already mocks `ConditionMeterField` and `MomentumField`; extend with `ImpactField` (boolean) and the location/starship type literals.

`tests/unit/entityExtractor.test.js`, `tests/unit/narratorPaced.test.js` and `tests/unit/recap.test.js` need only mock adjustments (getter targets `actors` not `journal`) — the assertions on payload shape are unchanged.

### 6.2 Quench batches (live Foundry)

Existing batch `starforged-companion.entityPanelActions` already seeds a Connection and a Settlement. After this scope ships, the Settlement seed creates an Actor; rest of the batch (toggleCanonicalLock, setCurrentLocation) tests on the Actor; Connection seed stays journal-backed. Adds:

- New batch `starforged-companion.entityActorMigration`:
  - `createShip` → returns an Actor with `actor.type === 'starship'` and the debility flag flipped on `sufferDamage`.
  - `createPlanet` → Actor with `system.subtype === 'planet'`.
  - `createLocation` → Actor with `system.subtype === 'derelict'`.
  - `createSettlement` → Actor with `system.subtype === 'settlement'`.
  - `!migrate-entities` migrator → seed a legacy JournalEntry for a settlement, run the migrator, assert the Actor was created with preserved `_id`, that the journal is flagged `migrated`, and that `campaignState.settlementIds` was updated.
  - Idempotency — run the migrator twice; second invocation should report "0 new" and not touch the marked entries.
  - Cleanup mode — flip the `migrated.at` timestamp to >7 days ago, re-run with `--cleanup`, assert the journal is deleted.

### 6.3 Manual / browser verification

After implementing in a Foundry session:
1. Create one of each migrated type via the existing draft-card Confirm flow. Confirm each appears in the sidebar **Actors** tab (not Journal).
2. Open the Entity Panel — confirm rows render for each, with portraits.
3. Generate / regenerate a portrait — confirm `actor.img` updates and chat-side renders show the portrait.
4. Run `!migrate-entities` against a world seeded from a pre-migration backup. Confirm the chat summary card shows correct counts.

---

## 7. Phasing

**Phase 1 — Storage shim (1 session)**
- Introduce `src/entities/registry.js` with `getEntityDocument(typeKey, id)` that hides journal-vs-actor dispatch. Update entity panel, art pipeline, assembler, relevanceResolver to use it.
- No behaviour change; all entities still on journal. Confirm `npm test` and Quench batches green.

**Phase 2 — Ship migration (1 session)**
- Rewrite `src/entities/ship.js` to create starship Actors. Migrator handles existing ships.
- Quench `entityActorMigration` batch lands with just the ship cases.
- Confirm full test suite green; manual verification of one created ship and one migrated ship.

**Phase 3 — Location-family migration (1 session)**
- Rewrite `planet.js`, `location.js`, `settlement.js` together (same target Actor type — natural batch).
- Migrator extended to cover all three subtypes.
- Quench batch extended; subtype disambiguation tested.
- `!migrate-entities --cleanup` shipped.

If any phase blows out, drop the last phase and ship the prior. Each phase leaves the module fully working.

---

## 8. Out of scope

- **Connection migration.** No native NPC actor type. `foe` is a Dataforged-ID pointer that would mis-categorise relationships in the sidebar.
- **Faction migration.** No native faction type. `shared` is for multiplayer resource pools.
- **Creature migration.** `foe` is too thin (single `dfid` field); benefit is marginal vs migration cost.
- **Reworking `ArtAsset` storage.** Portrait b64 / regeneration history stays in `src/art/storage.js`. Only the **display** path is simplified by `actor.img`.
- **Cross-system compendium export.** Out of scope; the migration only changes in-world storage.
- **Renaming the custom typeKey `location` to avoid name collision with `actor.type='location'`.** Renaming a public typeKey would churn every chat card, every test, and every existing campaign's data. The collision is contained — `resolveTypeKey()` is the only place that cares.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Migrator data loss on an existing campaign | Deferred deletion (`--cleanup` only after 7 days, idempotent first pass); chat card summary; full backup recommended in the changelog entry |
| `actor.type` validation by the ironsworn system rejects extra `system` fields | Schema we write only contains fields the ironsworn DataModel defines (verified in §3.2 against `vendor/foundry-ironsworn/src/module/actor/subtypes/*.ts`). Everything else lives in flags, which Foundry never validates |
| `actor.system.subtype` constrained values | `vendor/foundry-ironsworn/src/module/actor/subtypes/location.ts:14` shows `subtype` as a plain `StringField` with `initial: 'star'` — no enum constraint. Safe |
| Cross-references from journal-backed entities (e.g. `connection.history` referencing a settlement name) | All cross-references are by name or by the custom GUID `_id` (not by Foundry document ID). Migrator preserves `_id`, so these references resolve unchanged |
| Quench tests that currently seed entities via `JournalEntry.create` directly (bypassing the creator) | Audit `src/integration/quench.js` during Phase 1; ensure all entity seeds route through the creators, not raw `JournalEntry.create` |
| Folder organisation — Actors and JournalEntries don't share folders | Add `getOrCreateActorsFolder` under the Companion-managed folder; sidebar will show two folders ("Starforged Companion / Entities" for journal-backed, "Starforged Companion / Entities (Actors)" for actor-backed). Same prefix groups them visually |
| Sector generator (`src/sectors/sectorGenerator.js`) calls `createSettlement` inside `storeSector`'s batched-write block | Confirm the batched-write flag (`persist: false`) still works when the underlying create is an Actor. The existing `persist` short-circuit in `createSettlement` only governs the campaign-state write, not the entity create — should port unchanged |

---

## 10. Critical files (for the implementer)

Modify:
- `src/entities/ship.js` (rewrite)
- `src/entities/planet.js` (rewrite)
- `src/entities/location.js` (rewrite)
- `src/entities/settlement.js` (rewrite)
- `src/entities/migrator.js` (new)
- `src/entities/registry.js` (new — `getEntityDocument` helper)
- `src/entities/entityExtractor.js` (`entityExistsAnyType` cross-search, plus folder helper import)
- `src/ui/entityPanel.js` (split `loadAllEntities`, `findEntity`, mutation handlers, hook registration)
- `src/art/generator.js` (`linkPortraitToEntity` — actor path)
- `src/index.js` (register `!migrate-entities`)
- `src/integration/quench.js` (new `entityActorMigration` batch, audit existing seeds)
- `tests/setup.js` (extend `makeTestActor` for `starship` and `location` types)
- `tests/unit/entityShipActor.test.js` (new), `entityPlanetActor.test.js`, `entityLocationActor.test.js`, `entitySettlementActor.test.js`
- `packs/help.json` (add `!migrate-entities` to Chat Commands table; brief Changelog entry)
- `CHANGELOG.md` (Unreleased entry)
- `docs/scope-index.md` (register this scope)
- `docs/known-issues.md` (close any items the migration resolves; flag any remaining)

Read-only reference (no edits):
- `vendor/foundry-ironsworn/src/module/actor/subtypes/starship.ts`
- `vendor/foundry-ironsworn/src/module/actor/subtypes/location.ts`
- `docs/foundry-api-reference.md` (Actor section before any Actor write)

---

## 11. Verification

End-of-scope acceptance:

```bash
# Unit tests — all green
npm test

# Lint — no errors
npm run lint
```

Plus a live Foundry session:

1. Fresh world. Run draft-card Confirm for a ship, a planet, a location, and a settlement. Each appears in the Actors sidebar tab. Entity Panel renders all four.
2. For the ship: open the system sheet, set Battered. Confirm the entity panel reflects it. Run `sufferDamage` via the Foundry console (or a relevant chat command if one exists). Integrity decrement persists.
3. Generate a portrait for each. Confirm `actor.img` is the new data URI; the sidebar token preview shows it.
4. Seed a JournalEntry-backed settlement (`createSettlement` *pre-migration code path*, simulated by direct `JournalEntry.create` with the legacy flag shape). Run `!migrate-entities`. Confirm chat summary card; confirm new Actor with preserved `_id`; confirm the journal is flagged `migrated` but not deleted.
5. Run `!migrate-entities` a second time. Chat card shows 0 new.
6. Fast-forward `migrated.at` 8 days; run `!migrate-entities --cleanup`. Confirm the original journal is deleted.
7. Connection / faction / creature flows untouched — create one of each and confirm they still go to JournalEntry as before.

All seven manual steps pass = scope complete. Move scope-index entry to ✅ COMPLETE.
