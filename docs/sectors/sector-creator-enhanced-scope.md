# Starforged Companion — Sector Creator Enhanced Scope
## DALL-E background art, Foundry Scene generation, and narrator journal stubs

**Priority:** Implement alongside sector-creator-scope.md (Session 2 of 2)  
**Dependency:** sector-creator-scope.md must be complete first  
**Estimated Claude Code session:** 1.5 hours  

---

## 1. Overview

Three enhancements to the base sector creator:

1. **DALL-E background art** — each sector gets a generated space scene image
   with visual character matching the region (Terminus/Outlands/Expanse/Void)

2. **Foundry Scene creation** — the sector becomes a live Foundry scene with
   the generated image as background, Journal Note pins for each settlement,
   and Drawing lines for passages

3. **Narrator journal stubs** — Claude generates atmospheric one-paragraph
   descriptions for the sector and each settlement, stored as Foundry journal
   pages that the GM and players can annotate

All three are optional — if the art API key is missing, the scene is created
without a background; if the Claude API key is missing, journals are created
without narrator text.

---

## 2. DALL-E sector background art

### 2.1 New file: `src/sectors/sectorArt.js`

```js
/**
 * Generate a DALL-E 3 background image for a sector.
 * Unlike entity portraits, sector backgrounds:
 *   - Use 1792x1024 (landscape) format
 *   - Have no lock policy — can be regenerated freely
 *   - Are uploaded to Foundry's data folder (required for Scene backgrounds)
 *   - Are referenced by file path, not stored as base64 flags
 *
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<string|null>}  — file path within Foundry data, or null
 */
export async function generateSectorBackground(sector, campaignState)

/**
 * Build the DALL-E prompt for a sector based on region and notable details.
 * @param {SectorResult} sector
 * @returns {{ prompt: string, size: string }}
 */
export function buildSectorBackgroundPrompt(sector)
```

### 2.2 Region visual profiles

Each region has a distinct visual palette and mood. These are injected into
the DALL-E prompt to differentiate sectors immediately.

**Terminus** — warm, dense, inhabited:
```
Dense star field, warm amber and gold hues, colorful nebulae in the 
background, distant station and settlement lights visible, active space 
lanes, inhabited and settled feeling, cinematic science fiction space art, 
1792x1024 wide landscape orientation, no text or labels
```

**Outlands** — cool, sparse, frontier:
```
Sparse star field, cool blue and white tones, one or two distant nebulae, 
scattered isolated settlement lights, frontier space feeling, recent 
expansion into the unknown, cinematic science fiction space art, 
1792x1024 wide landscape orientation, no text or labels
```

**Expanse** — dark, lonely, vast:
```
Very sparse star field, deep cold blues and blacks, vast emptiness, a 
single distant galaxy smear or lone nebula as the only color, almost no 
settlement lights, desolate and beautiful, pioneer space at the edge of 
the known, cinematic science fiction space art, 1792x1024 wide landscape 
orientation, no text or labels
```

**Void** — near-total darkness, forbidding:
```
Near-total darkness, isolated stars barely visible, vast empty void, 
no settlements, hostile and forbidding, the space beyond the Forge where 
travel is impossible, cinematic science fiction space art, 1792x1024 wide 
landscape orientation, no text or labels
```

### 2.3 Sector trouble modifiers

Certain sector troubles add visual elements to the prompt:

```js
const TROUBLE_VISUAL_MODIFIERS = {
  "Energy storms are rampant":                    "with visible crackling energy storms and lightning",
  "Magnetic disturbances disrupt communication":  "with aurora-like magnetic disturbances visible",
  "Supernova is imminent":                        "with a bright dying star dominating the background",
  "Chaotic breaches in spacetime spread":         "with strange spatial distortions and rifts visible",
  "Dense nebula cloud":                           "with a vast colorful nebula filling the background",
  "Fiery energy storm":                           "with billowing plasma storms and solar flares",
};
```

These are appended to the base region prompt if the sector trouble matches.

### 2.4 Image upload to Foundry

DALL-E returns base64. Foundry Scenes require a file path. The image must be
uploaded to Foundry's data folder before creating the scene.

```js
async function uploadSectorImage(b64, sectorId) {
  // Ensure the upload directory exists before uploading
  const uploadDir = "modules/starforged-companion/art";
  try {
    await FilePicker.createDirectory("data", uploadDir, {});
  } catch (e) {
    // Directory already exists — ignore the error
  }

  // Convert base64 to Blob
  const byteString = atob(b64);
  const bytes      = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const file = new File([blob], `sector-${sectorId}.png`, { type: "image/png" });

  await FilePicker.upload("data", uploadDir, file, {});

  return `${uploadDir}/sector-${sectorId}.png`;
}
```

**Important:** `FilePicker.upload()` requires GM permissions. This is already
gated since sector creation is GM-only.

**Fallback:** If upload fails or art API key is absent, `generateSectorBackground`
returns `null` and the scene is created without a background image.

---

## 3. Foundry Scene creation

### 3.1 New file: `src/sectors/sceneBuilder.js`

```js
/**
 * Create a Foundry Scene for the sector.
 * Places settlement markers as Journal Notes and passages as Drawing lines.
 * Uses the generated background image if available.
 *
 * @param {SectorResult} sector
 * @param {string|null} backgroundPath  — Foundry data file path, or null
 * @param {Object} entityJournals        — { settlementId: JournalEntry }
 * @returns {Promise<Scene>}
 */
export async function createSectorScene(sector, backgroundPath, entityJournals)
```

### 3.2 Scene dimensions and grid

```js
const SCENE_CONFIG = {
  gridCellSize:  100,    // pixels per grid cell
  gridWidth:     14,     // cells wide
  gridHeight:    10,     // cells tall
  sceneWidth:   1400,    // gridWidth * gridCellSize
  sceneHeight:  1000,    // gridHeight * gridCellSize
  padding:        0.1,   // 10% padding
};
```

Settlement positions are assigned by the sector creator wizard (manual drag)
or auto-placed in a readable layout if no manual placement was done.

**Auto-layout for N settlements:**
```js
// Place settlements evenly distributed across the grid
// avoiding the edges (padding of 1 cell)
function autoLayoutSettlements(settlements, gridWidth, gridHeight) {
  // Spread across the grid with variation
  // e.g. 4 settlements: roughly quadrant-placed with small random offset
}
```

### 3.3 Scene creation

```js
const scene = await Scene.create({
  name:        sector.name,
  img:         backgroundPath ?? null,
  width:       SCENE_CONFIG.sceneWidth,
  height:      SCENE_CONFIG.sceneHeight,
  grid:        { type: 1, size: SCENE_CONFIG.gridCellSize },
  padding:     SCENE_CONFIG.padding,
  flags: {
    "starforged-companion": { sectorId: sector.id, sectorScene: true },
  },
});
```

**Note on scene activation:** Scene creation does NOT automatically activate
the scene (i.e., does not call `scene.activate()`). This prevents disrupting
a GM who is mid-session. The progress card notifies the GM the scene is ready;
they can navigate to it manually. See Section 11 for the integration test
correction on this point.

---

## 4. Narrator journal stubs

### 4.1 New function in `src/sectors/sectorGenerator.js`

```js
/**
 * Generate atmospheric narrator stubs for a sector and all its settlements.
 * Uses Haiku — brief, fast, uncached.
 *
 * @param {SectorResult} sector
 * @param {Object} narratorSettings  — { perspective, tone }
 * @returns {Promise<{ sector: string, settlements: { [id]: string } }>}
 */
export async function generateNarratorStubs(sector, narratorSettings)
```

### 4.2 Sector stub prompt

```
You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this sector of space.
Be atmospheric and evocative. {perspective instruction}. Wry tone.
Do not introduce plot elements not present in the description.

Sector: {sector.name}
Region: {region label — "Terminus (the settled core)", "Outlands (the frontier)", 
         "Expanse (the far reaches)", or "Void (beyond the Forge)"}
Stellar character: {sector region visual description — e.g. "dense warm starfield"}
Current trouble: {sector.trouble}
{if faction: "Controlling power: {sector.faction}"}
Settlements: {comma-separated settlement names with type}

Write the paragraph now. No preamble.
```

**Model:** `claude-haiku-4-5-20251001`  
**Max tokens:** 150  
**No caching** — each sector is unique.

### 4.3 Settlement stub prompt

```
You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this settlement.
Be atmospheric. {perspective instruction}. Wry tone.
Do not introduce plot elements not present in the description.

Settlement: {settlement.name}
Type: {locationType — "orbital station", "planetside settlement", "deep space facility"}
Population: {settlement.population}
Authority: {settlement.authority}
Projects: {settlement.projects.join(", ")}
{if trouble: "Current trouble: {settlement.trouble}"}
{if firstLook: "First impression: {settlement.firstLook.join(", ")}"}
{if planet: "Planet: {planet.type} ({planet.name}) — {planet.atmosphere} atmosphere"}
Sector: {sector.name} ({region label})

Write the paragraph now. No preamble.
```

**Model:** `claude-haiku-4-5-20251001`  
**Max tokens:** 100

### 4.4 Journal creation

One JournalEntry per sector, with multiple pages:

```js
const sectorJournal = await JournalEntry.create({
  name: `${sector.name} — Sector Record`,
  flags: {
    "starforged-companion": {
      sectorRecord: true,
      sectorId:     sector.id,
    },
  },
});

// Page 1: Sector overview (narrator stub)
await sectorJournal.createEmbeddedDocuments("JournalEntryPage", [{
  name:  sector.name,
  type:  "text",
  text: {
    content: `
      <h2>${sector.name}</h2>
      <p><strong>Region:</strong> ${regionLabel}</p>
      <p><strong>Trouble:</strong> ${sector.trouble}</p>
      ${sector.faction
        ? `<p><strong>Control:</strong> ${sector.faction}</p>` : ""}
      <hr>
      <p class="narrator-stub">${stubs.sector || "<em>No narrator text generated.</em>"}</p>
      <hr>
      <h3>Settlements</h3>
      <ul>
        ${sector.settlements.map(s =>
          `<li>${s.name} — ${s.locationType}, Pop: ${s.population}, 
           Authority: ${s.authority}</li>`
        ).join("")}
      </ul>
      <h3>Passages</h3>
      <p>${passageSummary(sector)}</p>
    `.trim(),
    format: 1,
  },
}]);

// One page per settlement
for (const settlement of sector.settlements) {
  await sectorJournal.createEmbeddedDocuments("JournalEntryPage", [{
    name:  settlement.name,
    type:  "text",
    text: {
      content: `
        <h2>${settlement.name}</h2>
        <p><strong>Type:</strong> ${settlement.locationType}</p>
        <p><strong>Population:</strong> ${settlement.population}</p>
        <p><strong>Authority:</strong> ${settlement.authority}</p>
        <p><strong>Projects:</strong> ${settlement.projects.join(", ")}</p>
        ${settlement.trouble
          ? `<p><strong>Trouble:</strong> ${settlement.trouble}</p>` : ""}
        ${settlement.planet
          ? `<p><strong>Planet:</strong> ${settlement.planet.name} 
             (${settlement.planet.type})</p>` : ""}
        <hr>
        <p class="narrator-stub">${stubs.settlements[settlement.id] || 
          "<em>No narrator text generated.</em>"}</p>
        <hr>
        <h3>Notes</h3>
        <p><em>Record discoveries and plot threads here.</em></p>
      `.trim(),
      format: 1,
    },
  }]);
}
```

---

## 5. Full pipeline in `sectorPanel.js`

The sector creator wizard gains a final "Generating..." step that runs
all three enhancements in parallel where possible:

```js
async function finalizeSector(sector, campaignState) {
  const progressCard = postProgressCard("Finalizing sector...");

  // Run in parallel: art generation and narrator stubs
  // Entity journal creation can also run in parallel with these
  // Scene creation must wait for art path
  const [backgroundPath, stubs, entityJournals] = await Promise.all([
    generateSectorBackground(sector, campaignState).catch(() => null),
    generateNarratorStubs(sector, narratorSettings).catch(() => ({})),
    createEntityJournals(sector, campaignState),   // settlements + connection entity records
  ]);

  // Create narrator journal (needs stub text)
  const sectorJournal = await createSectorJournal(sector, stubs);

  // Create Foundry scene (needs background path and entity journals for Note pins)
  const scene = await createSectorScene(sector, backgroundPath, entityJournals);

  // Store sector to campaign state with all IDs
  await storeSector(sector, {
    backgroundPath,
    sectorJournalId: sectorJournal.id,
    sceneId:         scene.id,
    entityJournalIds: Object.fromEntries(
      Object.entries(entityJournals).map(([id, j]) => [id, j.id])
    ),
  }, campaignState);

  updateProgressCard(progressCard, "Sector ready.");
  return { scene, sectorJournal };
}
```

**Note:** `createEntityJournals` has no `.catch()` in the `Promise.all`. If it
fails, the entire pipeline rejects. This is intentional — entity creation is
structural and non-optional. Art and stubs fail gracefully; entity records do not.

---

## 6. Progress feedback during generation

Art generation and narrator calls take 5–15 seconds. The wizard should
post a progress chat card showing status:

```
◈ Sector Creator
Generating background art...  [spinner]
Writing narrator descriptions...  [spinner]
Creating Foundry scene...  [spinner]
Done — Devil's Maw is ready.  ✓
```

Use the same card-posting pattern as `postNarrationCard()`.

---

## 7. Cost estimates

Per sector creation:

| Component | Model/Service | Tokens/Size | Cost |
|-----------|--------------|-------------|------|
| Sector background | DALL-E 3, 1792x1024 | — | $0.08 |
| Sector stub | Haiku | ~200 in, 150 out | ~$0.001 |
| Settlement stubs (4) | Haiku × 4 | ~150 in, 100 out × 4 | ~$0.002 |
| **Total per sector** | | | **~$0.083** |

A campaign might create 3–5 sectors total. Total art cost: ~$0.25–$0.42.
Negligible.

---

## 8. Schema additions

Add to the `StoredSector` record in `src/schemas.js`:

```js
{
  // ...existing fields from sector-creator-scope.md...
  backgroundPath:    null,  // Foundry data file path for scene background
  sceneId:           null,  // Foundry Scene document ID
  sectorJournalId:   null,  // Sector record journal ID
  entityJournalIds:  {},    // { settlementId: journalId, connectionId: journalId }
  backgroundGenerated: false,
  stubs: {
    sector:      null,   // Generated narrator text
    settlements: {},     // { settlementId: narratorText }
  },
}
```

---

## 9. Settings additions

```js
game.settings.register(MODULE_ID, "sectorArtEnabled", {
  name:    "Generate Sector Background Art",
  hint:    "Generate a DALL-E 3 background image for each new sector. Requires Art API Key.",
  scope:   "world",
  config:  true,
  type:    Boolean,
  default: true,
});

game.settings.register(MODULE_ID, "sectorNarratorStubsEnabled", {
  name:    "Generate Sector Narrator Stubs",
  hint:    "Generate atmospheric descriptions for new sectors and settlements. Requires Claude API Key.",
  scope:   "world",
  config:  true,
  type:    Boolean,
  default: true,
});
```

---

## 10. Foundry API requirements — verify before implementing

**Before writing Scene creation code**, read:
```bash
grep -A 40 "^## Documents" docs/foundry-api-reference.md
```

**First**, verify the Scene/Note/Drawing/FilePicker sections are present and
committed — they were added after session 3 but may not have been committed
(see session handoff). If they are missing from the committed reference, fetch
them fresh before writing any Scene code:

```bash
# Verify what's committed
git log --oneline -5 docs/foundry-api-reference.md
grep "FilePicker" docs/foundry-api-reference.md | head -5
```

If the sections are absent, fetch from the Foundry API docs:
```
https://foundryvtt.com/api/v13/classes/Scene.html
https://foundryvtt.com/api/v13/classes/NoteDocument.html
https://foundryvtt.com/api/v13/classes/DrawingDocument.html
https://foundryvtt.com/api/v13/classes/FilePicker.html
```

Add findings to `docs/foundry-api-reference.md` and commit before
writing `sceneBuilder.js`.

---

## 11. Testing

### Unit tests — add to `tests/unit/sectorGenerator.test.js`

```
buildSectorBackgroundPrompt("terminus")
  ✓ includes warm/amber/dense in prompt
  ✓ includes 1792x1024 size

buildSectorBackgroundPrompt("expanse")
  ✓ includes dark/sparse/lonely in prompt

buildSectorBackgroundPrompt with energy storm trouble
  ✓ includes storm visual modifier in prompt

buildSectorBackgroundPrompt with supernova trouble
  ✓ includes dying star visual modifier

generateNarratorStubs — prompt construction
  ✓ sector prompt includes region label
  ✓ sector prompt includes sector trouble
  ✓ settlement prompt includes population and authority
  ✓ settlement prompt includes projects
```

### Integration tests — add to Quench batch `starforged-companion.sectorCreator`

```
generateSectorBackground (requires art API key)
  ✓ returns a non-null file path
  ✓ path starts with "modules/starforged-companion/art/"

createSectorScene
  ✓ creates a scene with the sector name
  ✓ scene has the correct number of notes (one per settlement)
  ✓ scene has the correct number of drawings (one per passage)
  ✓ scene is NOT activated after creation (GM navigates manually)

generateNarratorStubs (requires Claude API key)
  ✓ returns a non-empty sector stub string
  ✓ returns a stub for each settlement

createSectorJournal
  ✓ creates a journal with the sector name
  ✓ journal has pages for sector overview and each settlement
  ✓ narrator stub text appears in sector page
```

---

## 12. Implementation order

1. Verify `docs/foundry-api-reference.md` contains Scene/Note/Drawing/FilePicker
   sections — commit them if missing (see Section 10)
2. Write `src/sectors/sectorArt.js` — prompt builder + `uploadSectorImage` with
   directory creation guard
3. Add region visual profiles and trouble modifiers
4. Write `src/sectors/sceneBuilder.js` — scene + notes + drawings, no auto-activate
5. Add narrator stub generation to `src/sectors/sectorGenerator.js`
6. Add `createSectorJournal()` to `src/sectors/sectorGenerator.js`
7. Wire all three into `finalizeSector()` in `src/sectors/sectorPanel.js`
8. Add progress chat card feedback
9. Add `sectorArtEnabled` and `sectorNarratorStubsEnabled` settings
10. Add schema fields to `src/schemas.js`
11. Write unit tests
12. Add Quench integration batch entries
13. Update `packs/help.json` — add art/scene/journal notes to Sector Creator page
14. Update changelog and scope-index

---

## 13. Pre-implementation review notes (Session 4, v0.1.39)

These issues were identified in a scope review before implementation.

### 🔴 CRITICAL — Upload directory not guaranteed to exist

The original `uploadSectorImage` called `FilePicker.upload()` directly without
ensuring the upload directory exists. `FilePicker.upload()` will fail silently
or throw if `modules/starforged-companion/art` does not exist in Foundry's data
folder — this directory is not created by the module install.

**Fix applied in Section 2.4:** `FilePicker.createDirectory("data", uploadDir, {})`
is called before upload, wrapped in a try/catch to ignore the "already exists"
error. Verify the exact error string Foundry returns for an existing directory and
adjust the catch guard if needed.

### 🔴 CRITICAL — Scene auto-activation removed

The original integration test included:
```
✓ scene is activated after creation
```

Automatically activating a Foundry scene during `finalizeSector()` would navigate
all connected clients to the new scene immediately — including mid-session. This
is disruptive. **The auto-activate behavior has been removed.** The scene is
created but the GM navigates to it manually. The integration test has been
updated to assert the scene is NOT activated.

If intentional activation is desired for a specific workflow (e.g., always open
sector at campaign start), this should be an explicit setting, not a default.

### 🟡 AMBIGUITY — `createEntityJournals` vs entity system records

The `finalizeSector` pipeline calls `createEntityJournals(sector, campaignState)`,
which returns `{ settlementId: JournalEntry }`. However, Section 5 of the base
scope (`sector-creator-scope.md`) uses `createSettlement()` and `createConnection()`
from the entity system, which also create JournalEntry records.

These appear to be the same operation. Claude Code should clarify:
- Does `createEntityJournals` call `createSettlement()` / `createConnection()` internally?
- Or is this a separate set of journals distinct from the entity records?

**Recommended resolution:** `createEntityJournals` is simply a wrapper that calls
the existing entity creation functions and returns the resulting journal references.
It is not a second pass of journal creation. Confirm this interpretation before
implementing.

### 🟡 OPEN — Foundry API reference commit status

The session handoff notes the Scene/Note/Drawing/FilePicker sections "were added
to the output file but may not be committed." Implementation order step 1 now
explicitly requires verifying commit status before writing any Scene code.
Do not rely on memory for these APIs — verify against the reference or fetch fresh.

### 🟢 MINOR — Art directory persistence across module updates

Images uploaded to `modules/starforged-companion/art/` are stored in Foundry's
data folder alongside the module files. A clean module reinstall would delete
this directory. Consider documenting this limitation in the help page, or use a
world-scoped path (`worlds/{worldName}/starforged/art/`) for better durability.
Not a blocking issue for initial implementation.
