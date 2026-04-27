# Starforged Companion — Character Management Scope Document
## Priority: After narrator implementation

**Dependency:** Narrator feature must be complete before this work begins.
**System assumption:** `foundry-ironsworn` system by Ben Straub is always present.
The module reads from and writes to Ironsworn Actor documents rather than
maintaining parallel character state.

---

## 1. Design principles

**Single source of truth:** The Ironsworn Actor is authoritative for all
mechanical character data (stats, meters, assets, vows, debilities). The module
never duplicates this data in `campaignState` — it reads from the Actor on demand.

**Automatic persistence:** All mechanical consequences of move resolution write
directly to the Actor via `actor.update()` without requiring GM confirmation.
The player sees their sheet update immediately after accepting a move.

**Player narrative authority:** The CharacterChronicle is player-editable.
Players may add, annotate, and reorder entries freely. The module adds entries
automatically; players may modify or dispute them. This is their character's story.

**Reactive context:** The assembler reads character state fresh on each context
packet build. No sync required between moves — the Actor is always current.

**Multi-character support:** The module must handle parties of multiple player
characters, each with their own Actor, Chronicle, and companion assets (ships,
pets, companions). The assembler includes all active PCs in the context packet.

---

## 2. Ironsworn Actor structure

The `foundry-ironsworn` system stores character data in Actor documents.
Key paths (confirmed from system source):

```
actor.system.stats.edge        // stat values (1–4)
actor.system.stats.heart
actor.system.stats.iron
actor.system.stats.shadow
actor.system.stats.wits

actor.system.meters.health     // { value, max }
actor.system.meters.spirit
actor.system.meters.supply
actor.system.meters.momentum   // { value, max, reset }

actor.system.debilities        // object of boolean flags
  .corrupted / .cursed / .tormented  (spirit debilities)
  .wounded / .shaken / .unprepared   (condition debilities)
  .encumbered                        (battered)
  .maimed / .haunted                 (permanent)

actor.system.xp                // { value, max }
```

**Companion assets** (ships, pets, companions) are embedded items on the Actor:
```
actor.items.find(i => i.type === "starship")
actor.items.find(i => i.type === "companion")
```

Ship integrity and condition are tracked on the starship item.

**Before implementation:** Claude Code must read the foundry-ironsworn system
source to confirm exact field paths. These paths were current as of the system's
v2.x releases but may have changed. Run:
```js
// In Foundry console — inspect live Actor structure
game.actors.find(a => a.type === "character")?.system
```

---

## 3. New file: `src/character/actorBridge.js`

Single module responsible for all Actor reads and writes. No other module
accesses the Actor directly — everything goes through this bridge. This
isolates the foundry-ironsworn API surface so changes to the system only
require updates in one place.

### Exports

```js
// ── READ ──────────────────────────────────────────────────────────────────

/**
 * Get the active player character Actor(s) for the current scene.
 * Returns all player-owned actors of type "character".
 * @returns {Actor[]}
 */
getPlayerActors()

/**
 * Get a single Actor by user or by explicit actorId.
 * @param {string} [actorId]
 * @returns {Actor|null}
 */
getActor(actorId)

/**
 * Read a character's current stat and meter values.
 * Returns a flat object safe to pass to interpreter and assembler.
 * @param {Actor} actor
 * @returns {CharacterSnapshot}
 */
readCharacterSnapshot(actor)

/**
 * Read active debilities as a flat boolean map.
 * @param {Actor} actor
 * @returns {Object}
 */
readDebilities(actor)

// ── WRITE ─────────────────────────────────────────────────────────────────

/**
 * Apply meter changes from a move resolution to the Actor.
 * Clamps all values to valid ranges per Ironsworn rules.
 * Recalculates momentumMax and momentumReset from active debilities.
 * @param {Actor} actor
 * @param {Object} meterChanges  — { health, spirit, supply, momentum }
 * @returns {Promise<void>}
 */
applyMeterChanges(actor, meterChanges)

/**
 * Apply a debility to the Actor (e.g. wounded, shaken).
 * @param {Actor} actor
 * @param {string} debilityKey
 * @param {boolean} value
 * @returns {Promise<void>}
 */
setDebility(actor, debilityKey, value)

/**
 * Award XP and apply it to the Actor.
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<void>}
 */
awardXP(actor, amount)

/**
 * Apply companion/ship condition changes.
 * @param {Actor} actor
 * @param {string} assetType  — "starship" | "companion"
 * @param {Object} changes
 * @returns {Promise<void>}
 */
applyAssetChanges(actor, assetType, changes)

/**
 * Write a progress track mark to an embedded vow item on the Actor.
 * @param {Actor} actor
 * @param {string} vowItemId
 * @param {number} ticks
 * @returns {Promise<void>}
 */
markVowProgress(actor, vowItemId, ticks)
```

### Rules enforcement in `applyMeterChanges`

```
health:   clamp 0–5 (or 0–4 if wounded debility active — max reduced)
spirit:   clamp 0–5 (or 0–3 if shaken)
supply:   clamp 0–5
momentum: clamp momentumReset–10
          momentumMax = 10 − (count of condition debilities)
          momentumReset = 0 − (count of condition debilities) min −2
          if momentum > momentumMax after clamp: set to momentumMax
          if action die result = momentum: momentum resets to momentumReset (Ironsworn rule)
```

---

## 4. New file: `src/character/chronicle.js`

The CharacterChronicle is a narrative record of significant character moments.
Stored as a dedicated JournalEntry per character, named
`"Chronicle — {character.name}"`.

Unlike entity journals (which store structured data in flags), the Chronicle
stores an array of narrative entries — human-readable text that can be edited
freely by the player.

### Chronicle entry shape

```js
{
  id:        string,     // random ID
  timestamp: ISO string,
  sessionId: string,
  type:      "revelation" | "relationship" | "vow" | "scar" | "legacy" | "annotation",
  text:      string,     // narrative text — player-editable
  moveId:    string|null,  // move that triggered this entry, if any
  automated: boolean,    // true if module-generated, false if player-written
}
```

### Exports

```js
/**
 * Add an entry to a character's chronicle.
 * @param {string} actorId
 * @param {Object} entry
 * @returns {Promise<void>}
 */
addChronicleEntry(actorId, entry)

/**
 * Get all chronicle entries for a character.
 * @param {string} actorId
 * @returns {Promise<ChronicleEntry[]>}
 */
getChronicleEntries(actorId)

/**
 * Get a condensed summary + recent entries for context injection.
 * Returns: { summary: string, recent: ChronicleEntry[] }
 * Summary: first 3 entries condensed to one paragraph (stable, cached)
 * Recent: last 5 entries in full (changes frequently, uncached)
 * @param {string} actorId
 * @returns {Promise<{ summary: string, recent: ChronicleEntry[] }>}
 */
getChronicleForContext(actorId)

/**
 * Update an existing entry (player annotation / correction).
 * @param {string} actorId
 * @param {string} entryId
 * @param {string} newText
 * @returns {Promise<void>}
 */
updateChronicleEntry(actorId, entryId, newText)
```

### Automatic chronicle entries

The narrator generates a one-sentence chronicle entry after each narration
call. The entry captures the dramatic moment — not the mechanical outcome,
which is already on the move card. Examples:

- (revelation) "The autodoc identified Ascendancy vault radiation on the courier's
  iron panel — the relic is not salvage, it was delivered deliberately."
- (relationship) "Sable confirmed the courier was a courier, not a refugee.
  Something shifted in the dynamic between them."
- (scar) "Took a strike to the hull threading the debris field. The ship will
  carry that mark."

The narrator is prompted to produce this entry as part of its response (as a
structured JSON field alongside the prose narration). The chronicle entry is
extracted and stored automatically; the prose narration is what appears in chat.

---

## 5. Assembler changes: character context section

Add a new section 3a between the move result and connections sections:

```
## CHARACTER STATE

[For each active PC:]
Name: {actor.name}
Stats: Edge {e} | Heart {h} | Iron {i} | Shadow {s} | Wits {w}
Meters: Health {h}/5 | Spirit {s}/5 | Supply {sup}/5 | Momentum {m}/10
Debilities: {list of active debilities, or "None"}
Assets: {key assets — 3 most narrative-relevant}

Chronicle summary: {condensed summary paragraph}
Recent: {last 3 chronicle entries, most recent first}
```

Token budget allocation: ~150 tokens per character. For a party of 3,
this is ~450 tokens — significant but justified since character state
is high-value context for narration.

---

## 6. `persistResolution` changes

`persistResolution()` currently writes to `campaignState`. Replace with
Actor writes via `actorBridge.js`:

```js
// Current (remove):
campaignState.characters[characterId].health -= 1;
await game.settings.set(MODULE_ID, "campaignState", campaignState);

// New:
const actor = getActor(characterId);
await applyMeterChanges(actor, resolution.consequences.meterChanges);
```

The GM-only gate on `persistResolution()` remains — world-scoped settings
still require GM permissions. However, Actor updates from the GM client
will propagate to all connected clients via Foundry's document sync.

For multiplayer: the socket relay needed for PERSIST-001 (player-triggered
persistence) is still required. The actor writes go through the same relay.

---

## 7. `updateActor` hook

Register a hook in `index.js` to react when a player manually edits their
character sheet:

```js
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!actor.hasPlayerOwner) return;
  if (userId === game.user.id) return; // our own write — ignore

  // Invalidate any cached character snapshot for this actor
  actorSnapshotCache.delete(actor.id);

  // If the change touches debilities, recalculate momentum bounds
  if (foundry.utils.hasProperty(changes, "system.debilities")) {
    recalculateMomentumBounds(actor);
  }
});
```

No immediate action needed — the next context packet build will read fresh
state from the Actor. The cache invalidation ensures stale snapshots aren't
used.

---

## 8. Chronicle UI

A fifth ApplicationV2 panel: `src/character/chroniclePanel.js`

Timeline view — entries in reverse chronological order. Each entry shows:
- Type badge (revelation / relationship / vow / scar / legacy / annotation)
- Session and timestamp
- Full text (editable inline for player annotations)
- Move card link (if triggered by a move)

Player can:
- Edit any entry text (both automated and their own)
- Add a new annotation at any point in the timeline
- Pin entries (pinned entries always appear in context)

GM can additionally:
- Delete entries
- Change entry type
- Mark entries as canon/non-canon

---

## 9. Settings additions

| Setting | Key | Scope | Default |
|---------|-----|-------|---------|
| Active character actor ID | `activeCharacterId` | world | `""` |
| Chronicle auto-entry enabled | `chronicleAutoEntry` | world | `true` |
| Chronicle entries in context | `chronicleContextCount` | world | `5` |
| Character context in packet | `characterContextEnabled` | world | `true` |

---

## 10. Testing structure

### Unit tests — `tests/unit/actorBridge.test.js`

The Actor must be fully mocked. `tests/setup.js` will need an Actor mock
with the Ironsworn system structure. Key test groups:

```
readCharacterSnapshot
  ✓ returns all stats and meters
  ✓ returns debilities as flat map
  ✓ handles missing system fields gracefully (incomplete actor)

applyMeterChanges
  ✓ clamps health to 0–5
  ✓ clamps momentum to momentumReset–momentumMax
  ✓ reduces momentumMax by 1 per active condition debility
  ✓ sets momentumReset correctly (0 − debility count, min −2)
  ✓ does not apply changes if actor not found
  ✓ calls actor.update() with correct delta

setDebility
  ✓ sets debility flag on actor
  ✓ triggers momentum recalculation

awardXP
  ✓ increments xp.value on actor
  ✓ does not exceed xp.max
```

### Unit tests — `tests/unit/chronicle.test.js`

Chronicle operates on JournalEntry flags — fully mockable.

```
addChronicleEntry
  ✓ creates chronicle journal if none exists
  ✓ appends entry to existing chronicle
  ✓ assigns unique ID to each entry
  ✓ stores timestamp and sessionId

getChronicleForContext
  ✓ returns summary and recent entries
  ✓ recent entries are last N (configurable)
  ✓ returns empty summary for new characters
  ✓ pinned entries always appear in recent

updateChronicleEntry
  ✓ updates text of existing entry
  ✓ marks entry as player-edited
  ✓ does not change type or timestamp
```

### Integration tests — `tests/integration/character.test.js`

Requires live Foundry with foundry-ironsworn system active.

```
Actor bridge (live)
  ✓ readCharacterSnapshot returns live Actor data
  ✓ applyMeterChanges updates Actor document
  ✓ change is visible in character sheet after update

Chronicle (live)
  ✓ addChronicleEntry creates or updates journal
  ✓ getChronicleEntries returns stored entries
  ✓ player can edit entry via updateChronicleEntry

Full pipeline (live)
  ✓ move resolution updates Actor meters automatically
  ✓ narrator generates chronicle entry after narration
  ✓ character state appears in next context packet
```

---

## 11. Implementation order

1. Confirm Ironsworn Actor field paths in live Foundry console
2. Write `src/character/actorBridge.js`
3. Write `tests/unit/actorBridge.test.js` + Actor mock in `setup.js`
4. Update `persistResolution.js` to use `actorBridge.js`
5. Write `src/character/chronicle.js`
6. Write `tests/unit/chronicle.test.js`
7. Update `context/assembler.js` — add character context section
8. Update narrator system prompt to request chronicle entry as structured output
9. Write `src/character/chroniclePanel.js`
10. Register `updateActor` hook in `index.js`
11. Add settings to `settingsPanel.js`
12. Write integration tests
13. Update `docs/file-structure.md` and `docs/known-issues.md`

Estimated Claude Code sessions: 2–3 (actorBridge + chronicle, assembler +
narrator changes, UI panel + integration tests).

---

## 12. Design decisions

- **Which actor triggers the move:** Use `game.user.character` — the actor
  assigned to the user in Foundry's user configuration. Standard Foundry pattern,
  zero friction, no extra UI required.

- **Ship and companion damage routing:** If the actor has exactly one starship,
  use it automatically. If multiple assets of the same type exist, show a quick
  picker in the move confirmation dialog alongside the move acceptance. Common
  case (one ship) stays zero-friction; edge cases are handled without blocking.

- **Chronicle summary generation:** Pre-generate via Claude (Haiku, ~50 tokens)
  when entries are added. Cache the summary until new entries arrive. The summary
  call runs asynchronously after the narration card posts — the context packet
  never waits for it mid-session. Summaries are invalidated and regenerated
  whenever a new chronicle entry is added or an existing entry is edited.
