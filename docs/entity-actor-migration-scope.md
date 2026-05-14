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

### 3.4 Folder layout

Folders in Foundry are typed (Actor folders hold Actors, JournalEntry folders hold JournalEntries) — parallel trees per sidebar are required. The migration creates these structures on demand:

**Actors sidebar:**
```
Starships/                  ← all migrated ships (cross-sector — ships travel)
NPCs/                       ← reserved for future connection migration; created empty
PCs/                        ← player characters (foundry-ironsworn manages these;
                              we adopt the folder if one exists, otherwise create it
                              and tag it with flags[MODULE].pcRoot so the system
                              and the module don't fight over it)
Sectors/
  <Sector Name>/
    Settlements/            ← settlements scoped to this sector (Actors)
    Locations/              ← points-of-interest scoped to this sector (Actors)
    Planets/                ← planets scoped to this sector (Actors)
```

**JournalEntry sidebar (unchanged top-level "Sectors", but newly hierarchical):**
```
Sectors/
  <Sector Name>/
    Sector Record           ← the existing sector-wrapper JournalEntry
                              (moved from the flat Sectors folder during migration)
Starforged Entities/        ← existing flat folder; continues to hold the three
                              types that remain journal-backed (connection,
                              faction, creature)
```

The Actor-side `Sectors / <Sector Name> /` tree is created lazily — `getOrCreateSectorActorFolder(sectorId)` walks the tree and creates only the missing nodes. Same for the type-plural subfolders (`Settlements`, `Locations`, `Planets`) — they're created when the first entity of that type lands in the sector.

For entities with no `sectorId` (the entity was created via the narrator without a sector context, e.g. an early-campaign "ghost ship" with no charted home), the Actor lands directly under the top-level `Starships/` / `NPCs/` / etc. — no per-sector subfolder is forced. A later `!migrate-entities --regroup` pass (post-MVP) can move orphans into the right sector once the GM tags them.

**Folder helpers** — replace the single `src/entities/folder.js` with:

| Helper | Returns | Used by |
|---|---|---|
| `getOrCreateJournalEntitiesFolder()` | id of `Starforged Entities` (existing) | connection/faction/creature creators |
| `getOrCreateActorFolder('Starships')` | id of top-level `Starships` | ship creator |
| `getOrCreateActorFolder('NPCs')` | id (created empty for future migration) | none yet |
| `getOrCreateActorFolder('PCs')` | id (adopt or create) | not needed at runtime; one-shot during migrator |
| `getOrCreateSectorActorFolder(sectorId, typePlural)` | id of `Sectors / <name> / <typePlural>` | planet/location/settlement creators |
| `getOrCreateSectorJournalFolder(sectorId)` | id of `Sectors / <name>` (Journal type) | `createSectorJournal` and the migrator |

All helpers cache their results in a `Map<key, folderId>` and re-resolve if the cached id is no longer a valid folder (the user might delete a folder by hand).

### 3.5 Single source of truth for settlement / planet / location data

Pre-migration, settlement (and to a lesser extent planet/location) data is duplicated across four storage layers — only one of which is mutable. This scope collapses that to two: the Actor (mutable) and the sector flag (structural / spatial). The four layers today, with their post-migration disposition:

| # | Storage | Current contents | Post-migration |
|---|---|---|---|
| 1 | `actor.system + actor.flags[MODULE].<type>` | (doesn't exist yet) | **Source of truth.** Holds every mutable field. |
| 2 | Embedded `JournalEntryPage` inside the sector-record `JournalEntry` (`src/sectors/sectorGenerator.js:494-515`) | One static HTML page per settlement (type / population / authority / projects / trouble / narrator stub) | **Removed.** The sector-record journal keeps the sector overview page only. Per-settlement detail is replaced by `@UUID[Actor.<id>]{Name}` links in the overview's settlement list. Same treatment applied if/when the sector record gains planet or POI pages. |
| 3 | `campaignState.sectors[]` array on the world settings blob (`src/sectors/sectorGenerator.js:340`, read by `src/index.js:1024`, `src/context/assembler.js:792`, `src/narration/narrator.js:929`) | The entire generation result, including full settlement objects | **Slimmed.** Each `sector.settlements[]` entry becomes `{ id, actorId, locationType, planetActorId?, mapCoords? }` — only the structural/spatial fields needed for sector-map rendering and for the assembler's "what's in this sector" lookup. `id` is retained for backward compatibility with sector-art and map code that already references it. The other fields (`population`, `authority`, `projects`, `trouble`, `description`, etc.) are removed from the array entry and resolved at read time via `game.actors.get(actorId)`. |
| 4 | `Starforged Sectors` JournalEntry flag (`saveSectorToJournal`, `src/sectors/sectorGenerator.js:529`) | The entire generation result, again | **Removed.** No production code reads this — only `tests/integration/quench.js:776/781`. Quench tests are updated to read from `campaignState.sectors[]` instead. The orphan `Starforged Sectors` JournalEntry itself is deleted by the migrator. |

**Field ownership rule** — for every field, exactly one of (1) and (3) owns it:

- Settlement-instance fields → **(1) Actor only.** Includes: name, population, authority, projects, trouble, firstLook, initialContact, description, history, notes, portraitId, sceneRelevant, loremasterNotes, connectionIds, canonicalLocked, generativeTier, createdAt, updatedAt, and `locationType` (orbital/planetside/deep-space — currently lives in (3); migrates to `flags[MODULE].settlement.locationType` on the Actor).
- Sector-structural / spatial fields → **(3) sector flag only.** Includes: sector id, sector name, region, regionLabel, trouble, faction, passages[], the spatial map layout, plus the slim settlement reference array `{ id, actorId, planetActorId?, mapCoords? }`.

Same rule applies to planets and POI locations when they're created via the sector generator. The Actor owns their mutable data; the sector flag owns only the position-on-the-map reference.

### 3.6 Sector-record JournalEntry — overview only

`createSectorJournal` (`src/sectors/sectorGenerator.js:444`) post-migration emits **one** JournalEntryPage — the sector overview. The overview's "Settlements" list switches from inline HTML pages to a UL of Foundry document links:

```html
<h3>Settlements</h3>
<ul>
  <li>@UUID[Actor.<actorId>]{<Settlement Name>} — Planetside, Pop: Thousands, Authority: Notorious</li>
  ...
</ul>
```

The structural fields (locationType, population, authority) are pulled from the Actor at render time, so the overview stays current if the GM edits the settlement. The per-settlement pages embedded by the current code are not regenerated.

A "Refresh sector overview" action lands on the sector-record journal as a header button — re-renders the overview from current Actor data. Implementation note: `createSectorJournal` is the natural call site for the initial render; a hook on `updateActor` (only for actors in this sector) re-renders the overview, debounced ~500 ms.

The hook fires on **every** `updateActor` for a sector-resident Actor, regardless of source — Foundry sidebar drag-rename, system sheet edit, entity-panel mutation handlers, the migrator's writes, world import, or a third-party module's `actor.update()`. The debounce coalesces bursts (e.g. the migrator's bulk pass), and a key-diff guard inside the hook short-circuits when none of the rendered fields actually changed:

```js
const RENDERED_KEYS = new Set([
  "name",
  "system.subtype",
  `flags.${MODULE}.settlement.locationType`,
  `flags.${MODULE}.settlement.population`,
  `flags.${MODULE}.settlement.authority`,
]);
function diffTouchesOverview(changes) {
  return [...RENDERED_KEYS].some(k => foundry.utils.hasProperty(changes, k));
}
```

`updateActor`'s second argument is the `changes` diff Foundry actually applied, so meter ticks, debility flips, and the dozens of other fields the sheet writes never trigger a re-render. Only edits that affect what the overview displays will.

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

### 4.2 Folder helpers

`src/entities/folder.js` is extended (or split — implementer's call) to expose the six helpers from §3.4. Internally the file maintains a typed cache:

```js
const _cache = new Map();   // key: `${type}:${path-joined-by-/}`

async function ensurePath(type, segments) {
  let parentId = null;
  for (const name of segments) {
    const key = `${type}:${segments.slice(0, i+1).join('/')}`;
    let folder = _cache.get(key) && game.folders?.get(_cache.get(key));
    if (!folder) {
      folder = game.folders?.find(f => f.type === type && f.name === name && f.folder === parentId);
    }
    if (!folder) {
      folder = await Folder.create({ name, type, folder: parentId });
    }
    _cache.set(key, folder.id);
    parentId = folder.id;
  }
  return parentId;
}
```

The sector-name segment is looked up at call time via `game.actors.get(...).name` (for `getOrCreateSectorJournalFolder`) or from the matching sector entry in `campaignState.sectors[]`. If the sector hasn't been generated yet (rare — most flows create sectors first), the helper falls back to the legacy flat top-level folder for that type and emits a single console warning.

The current `getOrCreateEntitiesFolder` export is preserved under the new name `getOrCreateJournalEntitiesFolder` so connection/faction/creature creators don't churn their imports beyond a rename.

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

`src/sectors/sectorGenerator.js`:

- `createSectorJournal` (line 444) — three changes:
  1. Switch the `folder:` argument to `await getOrCreateSectorJournalFolder(sector.id)` so each sector lands in its own per-sector journal subfolder (per §3.4).
  2. Stop generating per-settlement embedded pages. The loop at lines 494-515 is deleted. Only the sector-overview page (lines 475-492) remains.
  3. Rewrite the overview page's "Settlements" list to emit `@UUID[Actor.<id>]{Name}` document links per §3.6. The locationType / population / authority text after each link is resolved at render time by calling `game.actors.get(actorId)` and reading the flag payload.
- `createSettlement` / `createPlanet` / `createLocation` gain an optional `{ sectorId }` parameter (default: `campaignState.activeSectorId`) and stash it on `flags[MODULE].<type>.sectorId` for future folder regroups. The call site for `createSettlement` (line 230) and `createConnection` (line 256) thread `state.activeSectorId` explicitly.
- `saveSectorToJournal` (line 529) is **removed**. No production code reads the `Starforged Sectors` JournalEntry flag; the migrator deletes the orphan journal.
- `storeSector` (the function around line 338 that pushes onto `campaignState.sectors[]`) — the entry it pushes is now slimmed per §3.5: settlement entries become `{ id, actorId, locationType, planetActorId?, mapCoords? }`. Same for planet/location entries when those land on the sector flag.
- `entry.id` → `actor.id` references where the code captures returned documents (around lines 230 and 256) are renamed.

The migrator (§5) is responsible for moving existing sector-record JournalEntries from the flat `Sectors` folder into per-sector subfolders, deleting the embedded per-settlement pages, slimming `campaignState.sectors[]`, and deleting the orphan `Starforged Sectors` journal.

### 4.8 Readers of `campaignState.sectors[]`

The settlement-instance fields are being removed from the sector-flag entries. Three readers consume this data today:

- `src/index.js:1024-1033` — `!sector list` command. Currently reads `s.name` and `s.regionLabel`. Both are sector-level fields kept in the slim entry. **No change.**
- `src/context/assembler.js:792` — active-sector context block. Audit during implementation: any read of `sector.settlements[i].population` (etc.) must switch to `game.actors.get(actorId).flags[MODULE].settlement.population`. The slim entry's `actorId` is the lookup key.
- `src/narration/narrator.js:929` — same audit. Likely reads sector name and trouble (both kept), but verify before merging.

The Quench test at `tests/integration/quench.js:776/781` reads the `Starforged Sectors` flag — rewrite to read `campaignState.sectors[]`.

### 4.8 Campaign state

`shipIds`, `planetIds`, `settlementIds`, `locationIds` keep their position in `campaignState`. After the migration, the IDs reference Actor documents instead of JournalEntry documents — every reader already passes the ID through a typed getter, so callers don't see the change. We could derive these from `game.actors.filter(...)` but keeping the explicit list is cheaper (the assembler already iterates them frequently) and preserves "what belongs to this campaign" semantics for future multi-campaign worlds.

`currentLocationId` / `currentLocationType` — same. After migration `currentLocationId` is an Actor ID for `currentLocationType === 'settlement'`. Reader at `src/context/assembler.js:378` resolves via `game.actors.get(id)` instead of `game.journal.get(id)`.

---

## 5. One-time migrator

`!migrate-entities` chat command, GM-only. Steps:

1. **Folder scaffolding.** Ensure the top-level Actor folders exist (`Starships`, `NPCs`, `PCs`, `Sectors`) and the per-sector subfolder for every sector in `campaignState.sectors[]`. Lazy — only sectors that will receive at least one migrated entity get their subfolders created in this pass.
2. **Move existing sector-record JournalEntries** into per-sector journal subfolders. Each `JournalEntry` with `flags[MODULE].sectorRecord === true` is reparented from the flat `Sectors` folder to `Sectors / <sector name> /`. The journal name keeps its existing `"<Sector name> — Sector Record"` form so chat-card links don't break.
3. **Migrate each entity record.** Enumerate every JournalEntry under the `Starforged Entities` folder. For each, read `page.flags[MODULE_ID][type]`. If `type ∈ {ship, planet, location, settlement}`:
   1. Determine the target folder via the `sectorId` field on the flag payload (or `campaignState.activeSectorId` if absent). Ship is always top-level `Starships`; planet/settlement/location use `Sectors / <sector name> / <type-plural>`.
   2. Create the equivalent Actor (per §3.2 mapping). Preserve `flags[MODULE_ID].<type>._id` (the existing custom GUID) so context-card cross-references survive. Place under the resolved folder.
   3. Replace the campaignState ID list entry (`shipIds[]`, etc.) with the new actor ID. Replace `currentLocationId` if it points at this entry.
   4. Mark the source JournalEntry with `flags[MODULE_ID].migrated = { toActorId, at }`. **Do not delete** in this pass — a deferred reaper command (`!migrate-entities --cleanup`) deletes documents that have been marked for >7 days, giving users time to bail out if anything is wrong.
4. **Slim `campaignState.sectors[]`** (per §3.5). For every sector in the array, replace each settlement entry with `{ id, actorId, locationType, planetActorId?, mapCoords? }`. Settlement-instance fields (`population`, `authority`, `projects`, `trouble`, `firstLook`, `initialContact`, `description`, etc.) are first **copied onto the matching Actor's `flags[MODULE].settlement` payload** (if not already there from step 3) and then stripped from the array entry. The settlement entry's pre-existing `id` field is preserved as a backward-compat key for sector-art / sector-map code; the new `actorId` field is the canonical lookup. Apply the same slim treatment to planet and location entries if/when the sector flag ever stores them embedded.
5. **Rewrite each sector-record JournalEntry** (per §3.6). Delete every embedded JournalEntryPage *except* the sector overview, then rewrite the overview's "Settlements" UL to `@UUID[Actor.<id>]{Name}` links resolved against the just-migrated Actors. Preserve any embedded narrator-stub text on the overview page — only the per-settlement page deletions and the settlements-list rewrite are mechanical.
6. **Delete the orphan `Starforged Sectors` JournalEntry** (the `sectorsJournal` flag carrier from `saveSectorToJournal`). Production never reads it post-migration; safe to remove immediately rather than waiting on the 7-day cleanup window. Quench tests that referenced it are updated in §6.2.
7. **Adopt the PCs folder.** If `Actors / PCs` doesn't exist, create it and move every `actor.type === 'character'` Actor into it. If a different folder already groups characters (e.g. the ironsworn system has its own), leave them — only act if there's no existing grouping.
8. **Report** a summary chat card: counts per type, IDs migrated, IDs skipped (e.g. corrupt payloads), sectors with folders created, slim conversions performed on the sectors array, embedded settlement pages removed, and any unresolved cross-references (`currentLocationId` pointing at a settlement that wasn't migrated).
9. **Idempotent** — re-running skips entries already flagged `migrated`, skips folders that already exist, skips journal reparenting if the journal is already inside a per-sector subfolder, skips slim operations on sector entries that already have an `actorId`, and skips page deletions on sector-record journals that no longer have non-overview embedded pages.

`!migrate-entities --cleanup` runs after the 7-day window: it walks JournalEntries with `flags[MODULE].migrated.at` older than 7 days and deletes them. The flat `Sectors` folder is auto-deleted only if empty after the cleanup pass. The orphan `Starforged Sectors` journal is already deleted in step 6, so cleanup doesn't need to touch it.

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

**Phase 3 — Location-family migration + sector-flag dedup (1 session)**
- Rewrite `planet.js`, `location.js`, `settlement.js` together (same target Actor type — natural batch).
- `sectorGenerator.js`: drop the per-settlement embedded pages from `createSectorJournal`; rewrite the overview's settlements list as `@UUID[...]` document links; delete `saveSectorToJournal`.
- `storeSector` (the `campaignState.sectors[]` push) emits slim settlement entries per §3.5.
- Audit and update `src/context/assembler.js` and `src/narration/narrator.js` active-sector reads (§4.8).
- Quench tests at `tests/integration/quench.js:776/781` switch to reading `campaignState.sectors[]`.
- Migrator covers all three subtypes plus the steps 4–6 dedup work (slim sector array, rewrite sector-record overview, delete orphan `Starforged Sectors` journal).
- The `updateActor` debounced hook for overview re-render lands here.
- Quench `entityActorMigration` batch is extended with subtype-disambiguation tests, "fresh sector emits slim settlement entries", and "migrator slims a legacy sector and rewrites its overview".
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
| Folder organisation — Actors and JournalEntries don't share folders (Foundry folders are typed) | Parallel trees per sidebar per §3.4: Journal-side keeps `Sectors / <name> /` for sector records and `Starforged Entities /` for the three remaining journal-backed types; Actor-side adds top-level `Starships / NPCs / PCs / Sectors /` with per-sector subfolders for migrated entities |
| Sector folder name drift — GM renames a sector after generation | Folder names are looked up by sector id, not name, via `campaignState.sectors[]`. If the sector entry was renamed the folder is renamed via `folder.update({ name })` lazily on next entity creation. A `!migrate-entities --regroup` mode is reserved for post-MVP to consolidate orphans |
| Two `Sectors` folders in two sidebars look confusing to users | Documented in the in-game help page (Settings Reference → Folder Layout). They're typed differently and Foundry shows them in different tabs, so no actual collision |
| Slimming `campaignState.sectors[]` could break a reader that pulls settlement-instance fields from the array entry | §4.8 lists the three known readers (`!sector list`, assembler active-sector block, narrator active-sector block). Audit pass during Phase 3; add a unit test that imports each and asserts it only touches sector-level keys |
| Sector overview re-render hook (debounced `updateActor`) could fire on every meter tick if a settlement Actor has meters | The hook listens to every `updateActor` regardless of source (sidebar drag-rename, sheet edit, entity-panel handler, migrator, third-party `actor.update()`) — but a `RENDERED_KEYS` diff guard short-circuits unless the diff touches `name`, `system.subtype`, or one of the displayed flag fields. See §3.6 for the guard. ~500 ms debounce coalesces migrator bursts |
| Migrator step 4 (slim sectors array) could lose data if step 3 (Actor creation) silently skipped an entity | Step 4 runs only over sector entries whose corresponding settlement has a successful Actor (matched by `_id`). Entries without a matching Actor are left unmodified and reported in the summary card under "skipped — orphan sector entry" |
| Document links in the sector overview break if a settlement Actor is later deleted by the GM | This is acceptable — Foundry's UUID renderer handles broken links gracefully (renders as "Unknown Document"). A future polish pass could add a hook to auto-prune dead links during the debounced re-render |
| Sector generator (`src/sectors/sectorGenerator.js`) calls `createSettlement` inside `storeSector`'s batched-write block | Confirm the batched-write flag (`persist: false`) still works when the underlying create is an Actor. The existing `persist` short-circuit in `createSettlement` only governs the campaign-state write, not the entity create — should port unchanged |

---

## 10. Critical files (for the implementer)

Modify:
- `src/entities/ship.js` (rewrite)
- `src/entities/planet.js` (rewrite)
- `src/entities/location.js` (rewrite)
- `src/entities/settlement.js` (rewrite)
- `src/entities/folder.js` (extend with the six helpers in §3.4; rename existing export to `getOrCreateJournalEntitiesFolder`)
- `src/entities/migrator.js` (new)
- `src/entities/registry.js` (new — `getEntityDocument` helper)
- `src/entities/entityExtractor.js` (`entityExistsAnyType` cross-search, plus folder helper import)
- `src/sectors/sectorGenerator.js` — folder helper + slim sector-flag entries + drop embedded settlement pages + delete `saveSectorToJournal`; rewrite the sector-overview "Settlements" list as UUID links
- `src/context/assembler.js` (line ~792) — active-sector block reads settlement fields via Actor lookup, not from the sector flag entry
- `src/narration/narrator.js` (line ~929) — same audit as assembler
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

1. Fresh world with a generated sector. Run draft-card Confirm for a ship, a planet, a location, and a settlement.
   - Ship lands under `Actors / Starships /`.
   - Planet under `Actors / Sectors / <sector name> / Planets /`.
   - Location under `Actors / Sectors / <sector name> / Locations /`.
   - Settlement under `Actors / Sectors / <sector name> / Settlements /`.
   - Entity Panel renders all four.
2. **Single source of truth, fresh world.** Open the sector-record JournalEntry under `Journals / Sectors / <sector name> /`. Confirm it has exactly **one** embedded page (the sector overview). The "Settlements" list inside that page renders as Foundry document links (`@UUID[Actor...]`). Open `campaignState.sectors[<index>].settlements[0]` via the Foundry console — confirm it has `actorId`, `locationType`, and no inline `population`/`authority`/`projects`/`trouble` payload. Confirm there is no `Starforged Sectors` JournalEntry in the world.
3. **Edit a settlement, observe drift-free overview.** From the entity panel, rename a seeded settlement. The settlement's link in the sector-record overview should resolve to the new name immediately (or after the debounced re-render fires). The sector flag's `actorId` entry still resolves correctly.
4. For the ship: open the system sheet, set Battered. Confirm the entity panel reflects it. Run `sufferDamage` via the Foundry console (or a relevant chat command if one exists). Integrity decrement persists.
5. Generate a portrait for each migrated type. Confirm `actor.img` is the new data URI; the sidebar token preview shows it. Drag the settlement Actor onto a Scene — a token appears with the portrait.
6. **Migrator dry run on legacy data.** Seed a JournalEntry-backed settlement (`createSettlement` *pre-migration code path*, simulated by direct `JournalEntry.create` with the legacy flag shape) AND a legacy `campaignState.sectors[]` entry with the full embedded settlement payload AND a `Starforged Sectors` journal flag. Run `!migrate-entities`. Confirm chat summary card; confirm new Actor with preserved `_id` in the right per-sector subfolder; confirm the journal is flagged `migrated` but not deleted; confirm the sectors array entry is slimmed; confirm the `Starforged Sectors` journal is gone; confirm the sector-record journal has only the overview page with the settlement list rewritten as document links.
7. Run `!migrate-entities` a second time. Chat card shows 0 new across every counter.
8. Fast-forward `migrated.at` 8 days; run `!migrate-entities --cleanup`. Confirm the original journal is deleted. Confirm the flat `Sectors` Journal folder is empty (or already gone, since the cleanup auto-removes empty residue).
9. Connection / faction / creature flows untouched — create one of each and confirm they still go to JournalEntry under `Starforged Entities /`.

All seven manual steps pass = scope complete. Move scope-index entry to ✅ COMPLETE.
