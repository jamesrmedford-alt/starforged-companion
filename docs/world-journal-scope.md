# Starforged Companion — World Journal Scope Document

📋 **PLANNED** — specified, not yet started

## Automatic documentation of world state in Foundry journals

**Priority:** After character management  
**Dependency:** character management (chronicle.js), narrator.js  
**Sequence:** This is the last of the narrator-adjacent features. Implement
after character management is stable.

---

## 1. Overview

The World Journal automatically documents things discovered during play:
faction intelligence, location descriptions, NPC relationships, lore reveals,
and significant scene events. It produces living Foundry journal entries that
grow as the campaign develops.

Players and the GM can annotate entries freely. The module populates them;
the players own them.

This is distinct from:
- **CharacterChronicle** (character management scope) — records the *character's*
  story arc and significant personal moments
- **Entity journals** (connection.js, faction.js, etc.) — structured records
  for tracked entities with specific schema fields
- **Progress Tracks** — mechanical vow/expedition/combat tracking

The World Journal records *learned information* — what the characters now know
about the world that they didn't know before. It is the campaign's intelligence
file, not its story record.

---

## 2. Journal structure

A dedicated Foundry JournalEntry per category, named and organised under a
"Starforged Companion" folder in the Journals sidebar.

```
📁 Starforged Companion
  📄 Factions — Intelligence
  📄 Locations — Known Sites
  📄 Lore — Discoveries
  📄 Threats — Active Dangers
  📄 Session Log
```

Each journal has multiple pages — one page per entry. Pages use Foundry's
`JournalEntryPage` with `type: "text"` for human-readable content and
`flags[MODULE_ID]` for structured metadata.

---

## 3. Entry types and triggers

### Faction intelligence
**Trigger:** Move resolution or narration mentions a faction by name  
**Content:** What was learned — goals, resources, relationships, reliability  
**Structure:**
```
flags[MODULE_ID].factionEntry: {
  factionName: string,
  knownGoal:   string,
  attitude:    "hostile" | "neutral" | "allied" | "unknown",
  encounters:  [{ sessionId, summary, date }],
  annotations: [{ author, text, date }],
}
```

### Location descriptions
**Trigger:** Player uses `@scene` to query a location, or narration introduces
a new named location  
**Content:** Atmospheric description, notable features, current status  
**Structure:**
```
flags[MODULE_ID].locationEntry: {
  locationName: string,
  type:         "settlement" | "derelict" | "vault" | "planet" | "ship" | "other",
  description:  string,
  firstVisited: sessionId,
  status:       "current" | "departed" | "destroyed" | "unknown",
  annotations:  [{ author, text, date }],
}
```

### Lore discoveries
**Trigger:** Narration reveals a world truth connection, precursor mystery,
or significant piece of setting lore  
**Content:** The revelation in plain language  
**Structure:**
```
flags[MODULE_ID].loreEntry: {
  title:     string,
  category:  "ascendancy" | "ai" | "essentia" | "truthConnection" | "other",
  text:      string,
  sessionId: string,
  moveId:    string | null,
  confirmed: boolean,  // false = rumour/speculation
  annotations: [{ author, text, date }],
}
```

### Active threats
**Trigger:** Move resolution produces a Miss or a Weak Hit with a named threat  
**Content:** What the threat is, its current status, what is known about it  
**Structure:**
```
flags[MODULE_ID].threatEntry: {
  name:      string,
  type:      "faction" | "creature" | "environmental" | "personal" | "other",
  severity:  "looming" | "active" | "immediate" | "resolved",
  summary:   string,
  firstSeen: sessionId,
  annotations: [{ author, text, date }],
}
```

### Session log
**Trigger:** Automatic — one entry per session, written at session end  
**Content:** Date, moves resolved, key outcomes, open threads  
**Structure:** Human-readable text page, no structured flags  
Generated from session recap data (see previously-on-scope.md) — no extra
API call if the campaign recap cache is warm.

---

## 4. New module: `src/world/worldJournal.js`

```js
// ── SETUP ────────────────────────────────────────────────────────────────────

/**
 * Ensure the Starforged Companion journal folder and category journals exist.
 * Called from the ready hook. Creates missing journals, leaves existing ones.
 * @returns {Promise<void>}
 */
export async function initWorldJournals()

// ── FACTION INTELLIGENCE ──────────────────────────────────────────────────────

/**
 * Add or update a faction intelligence entry.
 * Creates a new page if the faction hasn't been seen before.
 * Appends an encounter record to existing entries.
 * @param {string} factionName
 * @param {Object} intelligence  — { goal, attitude, summary, sessionId }
 * @returns {Promise<void>}
 */
export async function recordFactionIntelligence(factionName, intelligence)

// ── LOCATIONS ─────────────────────────────────────────────────────────────────

/**
 * Add or update a location description.
 * @param {string} locationName
 * @param {Object} description  — { type, text, sessionId, status }
 * @returns {Promise<void>}
 */
export async function recordLocation(locationName, description)

// ── LORE ──────────────────────────────────────────────────────────────────────

/**
 * Record a lore discovery.
 * @param {string} title
 * @param {Object} discovery  — { category, text, sessionId, moveId, confirmed }
 * @returns {Promise<void>}
 */
export async function recordLoreDiscovery(title, discovery)

// ── THREATS ───────────────────────────────────────────────────────────────────

/**
 * Add or update an active threat.
 * @param {string} name
 * @param {Object} threat  — { type, severity, summary, sessionId }
 * @returns {Promise<void>}
 */
export async function recordThreat(name, threat)

/**
 * Update a threat's severity (e.g. resolved after a vow is fulfilled).
 * @param {string} name
 * @param {string} severity
 * @returns {Promise<void>}
 */
export async function updateThreatSeverity(name, severity)

// ── SESSION LOG ───────────────────────────────────────────────────────────────

/**
 * Write the session log entry for the completed session.
 * Called from the beforeunload / closeWorld hook.
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
export async function writeSessionLog(campaignState)

// ── ANNOTATIONS ───────────────────────────────────────────────────────────────

/**
 * Add a player annotation to any world journal entry.
 * @param {string} journalType  — "faction" | "location" | "lore" | "threat"
 * @param {string} entryName
 * @param {string} text
 * @param {string} authorName
 * @returns {Promise<void>}
 */
export async function annotateEntry(journalType, entryName, text, authorName)
```

---

## 5. Narrator integration — automatic detection

The narrator's response is analyzed after generation to detect world journal
triggers. This uses a lightweight Claude call (Haiku, ~100 tokens) that runs
asynchronously after the narration card posts — it does not block the player.

```js
// In narrator.js, after postNarrationCard():
if (campaignState.worldJournalEnabled) {
  detectAndRecordWorldEvents(narrationText, resolution, campaignState)
    .catch(err => console.warn(`${MODULE_ID} | World journal detection failed:`, err));
}
```

### Detection prompt (Haiku, uncached)

```
Given this narration from an Ironsworn: Starforged session, identify any
world-significant events to record. Return JSON only:

{
  "factions": [{ "name": string, "attitude": string, "summary": string }],
  "locations": [{ "name": string, "type": string, "description": string }],
  "lore": [{ "title": string, "category": string, "text": string, "confirmed": boolean }],
  "threats": [{ "name": string, "type": string, "severity": string, "summary": string }]
}

Return empty arrays if nothing significant was revealed. Only include entries
where a name is clearly identifiable. Do not fabricate details not present in
the narration.

Narration: {narrationText}
Move context: {resolution.loremasterContext}
```

The "do not fabricate" constraint is essential — the detection pass should only
extract what is explicitly in the narration, not infer or embellish.

---

## 6. Manual entry from chat

Players and GM can add world journal entries directly:

```
!journal faction "The Keeper's Covenant" hostile — they burned the relay station
!journal location "Derelict Station Kovash" derelict — abandoned, radiation warning
!journal lore "The iron panel navigates to Ascendancy space" confirmed
!journal threat "Ascendancy AI fragment" immediate — pursuing the panel
```

These are parsed in the `createChatMessage` handler, validated, and passed
to `worldJournal.js`. They bypass the narrator entirely — the player is making
a direct editorial decision about the world record.

---

## 7. World journal panel

A new ApplicationV2 panel `src/world/worldJournalPanel.js` providing a
browsable view of all world journal entries, distinct from Foundry's built-in
journal sidebar.

**Tab structure:**
- Factions (sorted by attitude: hostile → unknown → neutral → allied)
- Locations (sorted by status: current → departed → destroyed)
- Lore (sorted by session, most recent first)
- Threats (sorted by severity: immediate → active → looming → resolved)

Each entry shows:
- Name and type badge
- Summary text
- Session first seen
- Annotation count
- Click to expand: full text + encounters/visits + annotations + annotation input

---

## 8. Context injection

The assembler gains a new section 8 (lowest priority, dropped first under budget
pressure):

```
## WORLD KNOWLEDGE

FACTIONS:
{top 3 most-relevant factions — hostile and active first}

ACTIVE THREATS:
{all immediate and active threats}

RECENT DISCOVERIES:
{lore entries from the current session}
```

Relevance is determined by recency and severity — the assembler doesn't do
semantic matching. Factions seen this session rank above factions seen in
previous sessions.

---

## 9. Settings

| Setting | Key | Scope | Default |
|---------|-----|-------|---------|
| World journal enabled | `worldJournalEnabled` | world | `true` |
| Auto-detect from narration | `worldJournalAutoDetect` | world | `true` |
| Session log auto-write | `sessionLogAutoWrite` | world | `true` |
| World knowledge in context | `worldKnowledgeInContext` | world | `true` |
| World knowledge token budget | `worldKnowledgeBudget` | world | `80` |

---

## 10. Testing structure

### Unit tests — `tests/unit/worldJournal.test.js`

```
recordFactionIntelligence
  ✓ creates new page when faction not previously recorded
  ✓ appends encounter to existing faction entry
  ✓ updates attitude when changed
  ✓ preserves existing annotations

recordLocation
  ✓ creates new page for new location
  ✓ updates status of existing location

detectAndRecordWorldEvents — detection prompt parsing
  ✓ correctly extracts faction from detection response
  ✓ handles empty arrays gracefully
  ✓ does not record entries with missing names
  ✓ confirmed=false entries are marked as rumour

parseJournalCommand
  ✓ parses !journal faction correctly
  ✓ parses !journal threat with severity
  ✓ rejects unknown journal types
  ✓ handles quoted names with spaces

isNewSessionStart (shared with recap)
  ✓ covered in recap tests
```

### Integration tests

```
World journal (live Foundry)
  ✓ initWorldJournals() creates folder and category journals
  ✓ narration detection creates faction entry in journal
  ✓ !journal command creates entry immediately
  ✓ annotation is visible after annotateEntry()
  ✓ writeSessionLog() produces a readable session page
  ✓ world knowledge section appears in context packet
```

---

## 11. Cost estimate

### Auto-detection calls (Haiku)

Each narration generates one detection call:
- Input: ~300 tokens (narration + move context + prompt)
- Output: ~100 tokens (JSON with detected events)
- Cost: ~$0.0004 per call (Haiku rates)
- Per session (20 moves): ~$0.008

This is negligible. The detection call is Haiku and very short.

### Campaign recap (Sonnet, cached after first call)

- Already accounted for in narrator scope

### Total world journal cost per session: ~$0.008

---

## 12. Implementation order

1. Create `src/world/` folder
2. Write `src/world/worldJournal.js` (initWorldJournals, faction, location, lore, threat, annotation)
3. Add `initWorldJournals()` to ready hook in `index.js`
4. Write detection prompt and `detectAndRecordWorldEvents()` in `narrator.js`
5. Wire detection call after `postNarrationCard()` in `narrateResolution()`
6. Add `!journal` command parsing to `createChatMessage` hook in `index.js`
7. Write `src/world/worldJournalPanel.js` (ApplicationV2, tabbed) — use two-hook pattern for toolbar button (see architectural notes in CLAUDE.md)
8. Add world knowledge section to `assembler.js`
9. Add settings to `settingsPanel.js`
10. Add CSS for world journal panel and threat/faction badges
11. Write `tests/unit/worldJournal.test.js`
12. Integration test in live Foundry
13. Update `docs/file-structure.md`

---

## 13. Pre-implementation review notes (Session 4, v0.1.39)

These issues were identified in a scope review before implementation. Resolve
before handing to Claude Code.

### 🔴 CRITICAL — Command prefix conflict

The scope originally specified `/journal` commands. Foundry v13 intercepts
all `/word` commands via `MESSAGE_PATTERNS.invalid`. The correct prefix is `!`.

**Required changes throughout this document (now applied above):**
- Section 6: all example commands updated from `/journal` to `!journal`
- Section 10: `parseJournalCommand` test cases updated to `!journal`
- Section 12 step 6: updated to reference `!journal`
- The `packs/help.json` World Journal page also references `/journal` — Claude
  Code must update it to `!journal` when implementing

### 🟡 OPEN QUESTION — Overlap with entity tracking

The entity panel (`entityPanel.js`) already tracks Factions, Connections,
Settlements, and Planets as structured records with DALL-E portraits. The World
Journal faction and location entries would be parallel structures covering the
same real-world objects with different schemas and different storage (entity
journals vs. world journal pages).

**Decision needed before implementation:** When a faction or location is already
tracked as an entity, should World Journal:

A. **Create a parallel entry** — two separate records, different purposes
   (entity = structured operational record; world journal = narrative intelligence
   file). Simpler to implement, no coupling.

B. **Link to the existing entity** — world journal faction entry stores the
   entity ID and renders inline with it. More coherent UX, significantly more
   complex.

C. **Skip auto-detection for tracked entities** — if a faction is already in
   the entity panel, suppress the world journal detection for it and rely on the
   entity record instead.

Current scope text is silent on this. **Option A is the path of least resistance**
and consistent with the scope's stated distinction ("entity journals = structured
records; world journal = learned information"). Flag for owner decision.

### 🟡 OPEN QUESTION — Session log write reliability

`writeSessionLog()` is triggered from `beforeunload` / `closeWorld`. Async
Foundry document writes (`JournalEntry.create`, `page.update`) in a `beforeunload`
handler may not complete before the browser tears down the page.

**Claude Code must verify** whether `closeWorld` in v13 provides a reliable
async context for Foundry document writes, or whether a different trigger is
needed (e.g., writing the session log when a new session starts, using the
previous session's recap data).

Check `docs/decisions.md` for any existing note on this pattern before
implementing.

### 🟡 IMPLEMENTATION NOTE — Toolbar button two-hook pattern

Section 12 step 7 says "write `worldJournalPanel.js` (ApplicationV2, tabbed)"
without mentioning the toolbar button registration pattern. The world journal
panel will need a toolbar button. Claude Code must use the two-hook pattern
(see CLAUDE.md architectural notes):

- Hook 1: `getSceneControlButtons` — register metadata
- Hook 2: `renderSceneControls` — attach click handler

This is not stated in the current implementation order. Add it explicitly when
handing off to Claude Code.

### 🟢 MINOR — `packs/help.json` stub already exists

A World Journal page stub already exists in `packs/help.json` (page ID
`page-world-journal`). Claude Code should **update** the existing page, not
create a new one. The stub currently references `/journal` commands — this must
be corrected to `!journal`.

### 🟢 MINOR — Auto-detection opt-in consideration

The `worldJournalAutoDetect` setting defaults to `true`, running a Haiku
detection call after every narration. At ~$0.008/session this is negligible,
but some GMs may find background API calls during narration undesirable.
The default is acceptable; no change required. Document it clearly in the
settings panel hint text so GMs know it's happening.
