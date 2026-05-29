# Starforged Companion — System Asset Integration Scope
## Reusing foundry-ironsworn art, content, localisation, and pre-built actors

**Priority:** Incremental — each phase is independently shippable
**Dependency:** `foundry-ironsworn` v1.27.0 installed (already declared in `module.json` `relationships.recommends`)
**Estimated effort:** ~3 Claude Code sessions across 9 phases

---

## 1. Overview

The companion module already references the `foundry-ironsworn` system at runtime
in two places:

- `src/sectors/sceneBuilder.js:30-31` — planet and stellar-object art for sector
  scene Note pins
- `src/character/actorBridge.js` — actor schema reads/writes for stats, meters,
  debilities, XP, vows, and embedded items

Beyond those two integration points, the installed system ships ~300 image
assets, ~1,700 compendium documents across 26 packs, six language files, and
a set of canonical move/oracle/asset/encounter definitions that we currently
either re-coin in our own UI or ask the LLM to recall.

This scope inventories what is reusable and stages the integration in nine
phases ordered by leverage and risk. Every phase degrades cleanly when the
system is absent (the relationship is `recommends`, not `requires`).

### 1.1 Authoritative path mapping

The vendor source layout is `vendor/foundry-ironsworn/system/...`. At install
time the `system/` source folder becomes the package root, so all runtime paths
strip that segment:

| Source (in vendor/) | Runtime (in Foundry) |
|---|---|
| `vendor/foundry-ironsworn/system/assets/X` | `systems/foundry-ironsworn/assets/X` |
| `vendor/foundry-ironsworn/system/templates/X` | `systems/foundry-ironsworn/templates/X` |
| `vendor/foundry-ironsworn/system/lang/X.json` | `systems/foundry-ironsworn/lang/X.json` |

Compendium IDs use the form `foundry-ironsworn.<pack-id>` (e.g.
`foundry-ironsworn.starforged-oracles`).

### 1.2 Out of scope

- Modifying the system's own UI templates, sheets, or chat messages
- Bundling system assets into the companion module
- Writing translations of the system's localisation strings
- Replacing the existing `actorBridge.js` schema layer (Phases here only
  *read* from system packs; actor writes still go through the bridge)
- Schema work on third-party documents — covered separately in
  `ironsworn-api-scope.md`

---

## 2. Phase 1 — Centralise system constants

**Status:** Refactor only, no behaviour change.
**Effort:** 30 min.

Today the system path prefix is hardcoded in `sceneBuilder.js:30-31`. Every
later phase needs the same prefix. Pull both the asset base and the
compendium ID prefix into one module so subsequent phases extend it instead
of duplicating strings.

### 2.1 New file: `src/system/ironswornAssets.js`

```js
/**
 * Runtime path constants for foundry-ironsworn system assets.
 * All consumers of system assets MUST go through this module — never inline
 * the prefix elsewhere. This is the single point of update if the system
 * relocates assets in a future version.
 */

export const IS_SYSTEM_ID = "foundry-ironsworn";
export const IS_BASE      = `systems/${IS_SYSTEM_ID}/assets`;

export const IS_PATHS = {
  PLANETS:    `${IS_BASE}/planets`,
  STELLAR:    `${IS_BASE}/stellar-objects`,
  STARSHIPS:  `${IS_BASE}/starships`,
  LOCATIONS:  `${IS_BASE}/locations`,
  ASSETS:     `${IS_BASE}/assets`,         // asset card icons
  ORACLES:    `${IS_BASE}/oracles`,
  SECTORS:    `${IS_BASE}/sectors`,
  ICONS:      `${IS_BASE}/icons`,
  DICE:       `${IS_BASE}/dice`,
  MISC:       `${IS_BASE}/misc`,
};

/**
 * Probe whether the system is installed and its assets are reachable.
 * Cached after first call. Used by every consumer to decide whether to
 * use a system asset or fall back to module-bundled placeholders.
 *
 * @returns {Promise<boolean>}
 */
export async function isIronswornAvailable()
```

### 2.2 Migrate `sceneBuilder.js`

Replace the local `PLANET_BASE` / `STELLAR_BASE` constants with imports
from `ironswornAssets.js`. Existing planet/stellar maps stay in
`sceneBuilder.js` (they are scene-builder concerns) but reference the
shared bases.

### 2.3 Test

- Vitest unit test asserting `IS_PATHS.PLANETS` === existing string used today
- Quench integration test (added in `tests/integration/system-assets.test.js`):
  fetch one known asset URL via `Image.onload` and assert the load resolves

---

## 3. Phase 2 — Localisation wrapper

**Status:** New file, low-risk consumer pattern.
**Effort:** 1 hr.

The system ships `lang/en.json` with ~1,900 keys defining canonical English
wording for every move, stat, meter, debility, asset, oracle, and UI label.
We currently re-coin many of these in our own UI and prompts. Reading from
the system's i18n keeps terminology consistent and gives us free localisation
for `cs/de/es/fr/pl` whenever Foundry's language is switched.

### 3.1 New file: `src/system/i18n.js`

```js
/**
 * Localisation wrapper for foundry-ironsworn strings.
 * Maps our internal slugs to the system's i18n keys.
 * Logs a warning (does not throw) when a key is missing, so missing
 * mappings degrade to slug rendering instead of crashing the UI.
 */

const STAT_KEYS = {
  edge:   "IRONSWORN.Edge",
  heart:  "IRONSWORN.Heart",
  iron:   "IRONSWORN.Iron",
  shadow: "IRONSWORN.Shadow",
  wits:   "IRONSWORN.Wits",
};

const METER_KEYS = {
  health:   "IRONSWORN.Health",
  spirit:   "IRONSWORN.Spirit",
  supply:   "IRONSWORN.Supply",
  momentum: "IRONSWORN.Momentum",
};

const DEBILITY_KEYS = { /* wounded, shaken, etc. */ };

export function localizeStat(slug)      // → "Edge"
export function localizeMeter(slug)     // → "Health"
export function localizeDebility(slug)  // → "Wounded"
export function localizeMove(slug)      // → "Pay the Price"
```

### 3.2 Confirm key paths against vendor source

Before implementation, confirm key paths exist:

```bash
grep -E '"IRONSWORN\.(Edge|Heart|Iron|Shadow|Wits|Health|Spirit|Supply|Momentum)"' \
  vendor/foundry-ironsworn/system/lang/en.json
```

If a key does not exist, fall back to a hardcoded English string in the
mapping table and note the missing key in `docs/known-issues.md`.

### 3.3 Where to apply

- Entity panel labels (currently hardcoded English)
- Chat card headings and section labels in narrator output
- Move name rendering in the move interpreter UI

Do **not** apply to LLM prompts on this pass — LLM output language is
controlled separately by narrator settings.

### 3.4 Test

- Vitest unit test: each helper returns a non-empty string for every known slug
- Vitest unit test: passing an unknown slug logs a warning and returns the slug

---

## 4. Phase 3 — Starship token art

**Status:** Visual-only addition, mirrors Phase 1 planet pattern.
**Effort:** 45 min.

The system ships 15 numbered starship `.webp` tokens at
`systems/foundry-ironsworn/assets/starships/`. Useful for default token art
when the narrator describes a ship or when a player creates a starship Actor
via the companion's encounter/scene flow.

### 4.1 Add to `ironswornAssets.js`

```js
/**
 * Pick a deterministic starship token from the 15 available designs.
 * Uses a hash of the supplied seed so the same ship name always picks
 * the same icon — keeps tokens stable across sessions.
 *
 * @param {string} seed  — typically the ship name or actor ID
 * @returns {string}     — runtime path to the .webp
 */
export function pickStarshipIcon(seed)
```

### 4.2 Wire points

- `sceneBuilder.js` — when a sector contains a notable ship, drop a
  Note pin with the chosen starship icon
- Future starship actor creation (out of scope here, but the helper is
  in place for it)

### 4.3 Test

- Vitest unit test: `pickStarshipIcon("Wayfinder")` is deterministic and
  returns a path under `IS_PATHS.STARSHIPS`

---

## 5. Phase 4 — Location scene backgrounds

**Status:** Cost reduction — replaces some DALL-E calls.
**Effort:** 1.5 hr.

The system ships ~30 location backgrounds at
`systems/foundry-ironsworn/assets/locations/`:

- **Kirin/** — 12 SVG illustrations, three categories × three environments
- **Rains/** — 9 WEBP photorealistic, three categories × three environments
- **Root/** — 9 WEBP generic fallbacks per category/environment

Categories: Settlement / Vault / Derelict.
Environments: Deep Space / Orbital / Planetside.

When the narrator generates a location scene, we currently call DALL-E (~$0.08
per image). For the common case where the location matches one of these 27
combinations, we can use the bundled art at zero cost.

### 5.1 Add to `ironswornAssets.js`

```js
/**
 * Resolve a system-bundled location background for a category × environment.
 * Honours the user's preferred art set: "kirin" (illustration), "rains"
 * (photorealistic), or "auto" (kirin first, fall back to rains, then root).
 *
 * @param {"settlement"|"vault"|"derelict"} category
 * @param {"deep-space"|"orbital"|"planetside"} environment
 * @param {"kirin"|"rains"|"auto"} [preference]
 * @returns {string|null}
 */
export function resolveLocationArt(category, environment, preference)
```

### 5.2 Add setting

```js
game.settings.register(MODULE_ID, "locationArtSource", {
  name:    "Location Background Art Source",
  hint:    "Choose system-bundled location art (free) or DALL-E generation (paid). Auto prefers system art when available.",
  scope:   "world",
  config:  true,
  type:    String,
  choices: {
    "auto":       "Auto (system art first, DALL-E fallback)",
    "kirin":      "System — illustrated (Kirin)",
    "rains":      "System — photorealistic (Rains)",
    "dalle":      "Always generate via DALL-E",
  },
  default: "auto",
});
```

### 5.3 Wire points

In whatever flow calls `generateSectorBackground` or future location-scene
art (find the existing call sites in `src/sectors/sectorArt.js` and any
narrator-driven location creation), prepend a `resolveLocationArt()` check.
If non-null, use it; otherwise fall back to existing DALL-E flow.

### 5.4 Test

- Vitest unit test: every category × environment combination resolves to
  a non-null path under `IS_PATHS.LOCATIONS`
- Quench integration test: at least one `Image.onload` succeeds for each
  preference variant

---

## 6. Phase 5 — Canonical pack lookup

**Status:** New module, foundation for Phases 6–8.
**Effort:** 1 hr.

The system installs ~1,700 documents across compendium packs that we
currently either re-coin or ask the LLM to recall. Phases 6–8 read from
these packs; this phase provides the lookup primitives.

### 6.1 New file: `src/system/ironswornPacks.js`

```js
/**
 * Canonical pack lookup for foundry-ironsworn compendiums.
 * Caches resolved documents per session — packs do not change at runtime.
 * All callers MUST handle the null return path; no pack resolution is
 * ever a hard error.
 */

export const IS_PACKS = {
  STARFORGED_MOVES:      "foundry-ironsworn.starforged-moves",
  STARFORGED_ORACLES:    "foundry-ironsworn.starforged-oracles",
  STARFORGED_TRUTHS:     "foundry-ironsworn.starforged-truths",
  STARFORGED_ENCOUNTERS: "foundry-ironsworn.starforged-encounters",
  STARFORGED_ASSETS:     "foundry-ironsworn.starforged-assets",
  FOE_ACTORS_SF:         "foundry-ironsworn.foe-actors-sf",
  // (full list in implementation)
};

/**
 * Find a move by slug across the SF / IS / Delve / SI move packs.
 * Searches in the configured ruleset preference order.
 *
 * @param {string} slug          — e.g. "pay-the-price"
 * @param {string[]} [packIds]   — defaults to all move packs
 * @returns {Promise<Item|null>}
 */
export async function getCanonicalMove(slug, packIds)

/**
 * Find a RollTable by slug across the oracle packs.
 * @returns {Promise<RollTable|null>}
 */
export async function getCanonicalOracle(slug, packIds)

/**
 * Find an encounter Actor by name (encounters are best searched by name
 * since slugs vary across editions).
 * @returns {Promise<Actor|null>}
 */
export async function getCanonicalEncounterActor(name)
```

### 6.2 Test

- Quench integration test: each helper resolves a known document
  (e.g. `getCanonicalMove("pay-the-price")` returns a non-null Item)
- Vitest unit test for the cache: a second lookup hits the cache, not
  the pack

---

## 7. Phase 6 — Move interpreter grounding

**Status:** Quality + cost — reduces tokens spent on baked summaries.
**Effort:** 1 hr.
**Depends on:** Phase 5.

The move interpreter currently relies on prompt-baked move text. When a
canonical Item exists in `starforged-moves`, inject its real description
into the system prompt as `<canonical_move>...</canonical_move>` so
interpretation tracks the source-of-truth wording.

### 7.1 Wire point

Find the move-interpreter prompt assembler (likely `src/moves/` —
confirm with a search before implementing). Add a pre-prompt step:

```js
const canonical = await getCanonicalMove(moveSlug);
const canonicalBlock = canonical
  ? `<canonical_move>${canonical.system.description}</canonical_move>`
  : "";
```

Insert `canonicalBlock` before the existing instructions block. When
null, the prompt behaves exactly as today — no regression risk.

### 7.2 Test

- Vitest unit test: prompt includes `<canonical_move>` tag when a move
  is found, omits it cleanly when null
- Quench integration test: end-to-end move resolution still passes
  with canonical injection enabled

---

## 8. Phase 7 — Encounter spawn command

**Status:** New chat command + narrator tool.
**Effort:** 1.5 hr.
**Depends on:** Phase 5.

`foe-actors-sf` ships 56 fully statted encounter Actors. Today, when the
narrator references an encounter, we either write a stub or generate
freeform stats. This phase lets the GM (or the narrator via tool use)
import the canonical Actor.

### 8.1 New chat command

```
/sfc encounter <name>   — find encounter Actor by name; either drop a
                          token on the active scene (GM) or post a
                          stat-summary chat card (player)
```

Find the chat-command dispatcher (likely `src/index.js` near the
`!journal` handler — confirm) and add a new branch.

### 8.2 Narrator tool action

Add `spawn_encounter` to the narrator's tool-use schema. When invoked,
the narrator can request that the system place a specific encounter on
the scene. Gate behind `game.user.isGM` per existing pattern.

### 8.3 Test

- Vitest unit test: command parser correctly extracts the encounter name
- Quench integration test: invoking `/sfc encounter Iron Wraith` (or
  another canonical name) creates a token on the active scene

---

## 9. Phase 8 — Campaign truths in narrator context

**Status:** Narrator quality improvement.
**Effort:** 45 min.
**Depends on:** Phase 5.

`starforged-truths` ships 14 canonical setting truth journals. If the
campaign has selected truth variants (a vanilla Starforged worldbuilding
step), the narrator should know about them.

### 9.1 Wire point

At session start, read the world's selected truths (mechanism TBD —
confirm whether the system stores this on the world or per-player), build
a one-paragraph digest, and cache it into the narrator's system prompt
under a `<campaign_truths>` block.

If no truths are selected, omit the block entirely.

### 9.2 Test

- Vitest unit test: digest builder produces expected output for a fixture
  set of truth selections
- Quench integration test: narrator prompt contains `<campaign_truths>`
  when truths are configured

---

## 10. Phase 9 — Asset, oracle, and stat icon polish

**Status:** Visual polish across panels and chat.
**Effort:** 1 hr.
**Depends on:** Phase 1.

With constants in place from Phase 1, decorate existing UI surfaces with
appropriate system icons:

- **Asset card icons** (`IS_PATHS.ASSETS`, 82 SVGs) — entity panel and
  chat output when a player asset is referenced
- **Oracle result icons** (`IS_PATHS.ORACLES`, ~46 SVGs) — narrator chat
  cards and entity panel headers when an oracle of a known category drives
  the result
- **Stat icons** (Edge/Heart/Iron/Wits/Shadow under `IS_PATHS.ICONS`) —
  next to stat labels in the entity panel and chat

This phase is pure CSS + template work; no new modules.

### 10.1 Test

- Vitest snapshot test: rendered chat card includes expected icon `src`
  attributes
- Manual verification in Foundry browser (per CLAUDE.md UI rule — type
  check is not enough)

---

## 11. Implementation order

1. **Phase 1** — `ironswornAssets.js` + migrate `sceneBuilder.js`
2. **Phase 2** — `i18n.js` wrapper
3. **Phase 5** — `ironswornPacks.js` (foundation for 6–8)
4. **Phase 3** — Starship icons
5. **Phase 4** — Location backgrounds (real cost reduction)
6. **Phase 6** — Move interpreter grounding
7. **Phase 7** — Encounter spawn command
8. **Phase 8** — Campaign truths
9. **Phase 9** — Icon polish

Phases 1, 2, and 5 are foundational and should ship together as one PR.
Each subsequent phase is independent and can ship on its own.

---

## 12. Schema additions

No schema changes to actor or item documents.
No new flags on existing documents.

New `game.settings`:
- `locationArtSource` (Phase 4)

---

## 13. Risk register

| Risk | Mitigation |
|---|---|
| System is uninstalled | All consumers wrap in `isIronswornAvailable()` check; fall back to existing behaviour |
| Asset paths change in a future system version | Single point of update in `ironswornAssets.js`; bump `vendor/foundry-ironsworn` submodule and re-test before changing constants |
| Compendium IDs change | Single point of update in `IS_PACKS`; lookups already null-safe |
| Pack contents drift between system versions | Every consumer tolerates a null lookup result; document the dependency on a specific system version in `docs/decisions.md` if a phase grows version-sensitive |
| i18n key rename | `localizeX()` helpers log a warning instead of throwing; user sees the slug, not a crash |
| New phase couples to schema fields not in `actorBridge.js` | Add to `actorBridge.js` first; never bypass the bridge |

---

## 14. Foundry / system API reference — verify before implementing

Before each phase, confirm the relevant APIs:

```bash
# Phase 1, 3, 4, 9 — image asset paths
ls vendor/foundry-ironsworn/system/assets/

# Phase 2 — localisation keys
cat vendor/foundry-ironsworn/system/lang/en.json | jq 'keys | length'

# Phase 5 — compendium pack IDs
grep -A 3 '"id":' vendor/foundry-ironsworn/system/system.json | grep -B 1 'name'

# Phase 6, 7, 8 — document schemas (move, oracle, actor, journal)
ls vendor/foundry-ironsworn/src/module/model/
```

For Foundry core APIs (Image, FilePicker, JournalEntry, Scene, RollTable),
read `docs/foundry-api-reference.md` per CLAUDE.md.

---

## 15. Verification

End-to-end verification per phase:

- **Phase 1**: existing planet pin rendering on a freshly created sector scene
  is unchanged from the pre-refactor baseline
- **Phase 2**: switch Foundry locale to `fr` and confirm entity panel labels
  render in French (assuming the keys exist in `fr.json`)
- **Phase 3**: create a starship Actor and confirm its token uses a system art file
- **Phase 4**: create a settlement scene and confirm the background uses a
  system asset; switch `locationArtSource` to `dalle` and confirm DALL-E
  is invoked instead
- **Phase 5**: from the Foundry console, call
  `getCanonicalMove("pay-the-price")` and confirm a non-null Item is returned
- **Phase 6**: trigger a `pay the price` move and confirm `<canonical_move>`
  appears in the assembled prompt (via debug logging)
- **Phase 7**: run `/sfc encounter Iron Wraith` and confirm a token is placed
- **Phase 8**: configure campaign truths and confirm `<campaign_truths>`
  appears in the next narrator system prompt
- **Phase 9**: visual diff in Foundry — entity panel and a sample chat card
  render the expected icons

After every phase: `npm test` and `npm run lint` must pass per CLAUDE.md
pre-commit gate.
