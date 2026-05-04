# Starforged Companion — World Journal Scope
## Campaign narrative memory — serving both players and the narrator

**Status:** 📋 PLANNED  
**Priority:** After Narrator Entity Discovery Phases 1–3 (shared detection pass)  
**Estimated Claude Code sessions:** 2  
**Dependencies:** Character Management (✅), Previously On (✅), Entity Discovery Phases 1–3 (📋)  
**Shared infrastructure:** Combined detection pass lives in `src/entities/entityExtractor.js`

---

## 1. Overview

### What the World Journal is

The World Journal is the campaign's **narrative working memory**. It serves two audiences simultaneously:

**The narrator** reads from it to stay consistent. The narrator has no memory between calls. The World Journal is the mechanism by which it remembers what it previously established — facts it asserted, factions it described, threats it introduced. Confirmed lore and active threats are high-priority narrator constraints injected near the top of every context packet.

**Players** read from it as an intelligence file. What do the characters know about the Iron Compact? What threats are active? What was revealed about the Ascendancy? The World Journal answers these in plain language, in the voice the characters would use.

### What the World Journal is not

- **Not the entity system.** Entity records serve the narrator's scene-specific context (who is here now, what are their established details). The World Journal serves campaign-wide narrative constraints (what is the standing truth of this world). Both feed the narrator — they are complementary layers.
- **Not the Character Chronicle.** The chronicle records the character's story arc. The World Journal records what the world revealed to them.
- **Not a replacement for progress tracks.** Vow and expedition status belongs in progress tracks.

### The feedback loop

```
WJ state → narrator context (Sections 3, 4, 9, 10 of assembler)
                    ↓
               Narrator called
                    ↓
            Narration posted
                    ↓
  Combined detection pass (shared with Entity Discovery)
                    ↓
     ┌──────────────┴──────────────┐
     ▼                             ▼
Entity records updated        WJ entries created/updated
(draft cards, generative tier) (lore, threats, faction attitudes)
                    ↓
     Next call reads updated WJ → narrator stays consistent
```

The narrator asserts something → detection captures it → it becomes a WJ constraint → narrator reads it next call and cannot contradict it. This is how narrative consistency accumulates over a campaign without the narrator having literal memory.

---

## 2. Entry types

### Confirmed lore

A narrative fact established in the fiction. May have been asserted by the narrator (`narratorAsserted: true`) or explicitly confirmed by the GM (`confirmed: true`).

**Narrator constraint:**
- `confirmed: true` → labelled "ESTABLISHED FACT — DO NOT CONTRADICT"
- `narratorAsserted: true, confirmed: false` → labelled "NARRATOR-ASSERTED — treat as established unless move outcome explicitly changes it"

```js
flags[MODULE_ID].loreEntry: {
  title:             string,
  category:          "ascendancy" | "ai" | "essentia" | "truthConnection" | "precursor" | "other",
  text:              string,
  sessionId:         string,
  moveId:            string | null,
  confirmed:         boolean,   // GM explicitly confirmed — hard constraint
  narratorAsserted:  boolean,   // narrator stated it — soft constraint
  annotations:       [{ author, text, date }],
  promotedAt:        null,      // ISO timestamp when GM confirmed
}
```

### Active threats

A named danger with current severity. Updated as the campaign progresses via state transition detection.

**Narrator constraint:** Active and immediate threats are always injected into context. Resolved threats are archived.

```js
flags[MODULE_ID].threatEntry: {
  name:        string,
  type:        "faction" | "creature" | "environmental" | "personal" | "other",
  severity:    "looming" | "active" | "immediate" | "resolved",
  summary:     string,
  firstSeen:   sessionId,
  lastUpdated: sessionId,
  history:     [{ sessionId, severity, summary }],  // transition record
  annotations: [{ author, text, date }],
}
```

### Faction intelligence

What the characters have learned about a faction. Links to a faction entity record if one exists.

```js
flags[MODULE_ID].factionEntry: {
  factionName: string,
  entityId:    string | null,   // linked entity journal ID, if it exists
  knownGoal:   string,
  attitude:    "hostile" | "neutral" | "allied" | "unknown",
  encounters:  [{ sessionId, summary, attitudeAtTime }],
  annotations: [{ author, text, date }],
}
```

### Location intelligence

What the characters have learned about a location. Links to a location entity record if one exists.

```js
flags[MODULE_ID].locationEntry: {
  locationName: string,
  entityId:     string | null,
  type:         "settlement" | "derelict" | "vault" | "planet" | "ship" | "other",
  description:  string,
  firstVisited: sessionId,
  lastVisited:  sessionId,
  status:       "current" | "departed" | "destroyed" | "unknown",
  visits:       [{ sessionId, summary }],
  annotations:  [{ author, text, date }],
}
```

### Session log

Auto-written at session end. Human-readable text page, no structured flags.

---

## 3. Entries the World Journal does NOT track

- **Named NPCs, ships, creatures** — entity records only. No WJ entries for people or vessels.
- **Mechanical state** — health, momentum, progress. Actor and progress tracks.
- **Character story arc** — Character Chronicle.

---

## 4. Relationship to Entity Discovery — routing rule

The combined detection pass returns both entity candidates and WJ candidates. Routing:

| What was detected | Entity record exists? | Routing |
|-------------------|-----------------------|---------|
| Faction | Yes | Generative tier update only. No WJ entry. |
| Faction | No | Both: entity draft card + WJ faction entry |
| Location | Yes | Generative tier update only. No WJ entry. |
| Location | No | Both: entity draft card + WJ location entry |
| Lore revelation | — | WJ only, always |
| Active threat | — | WJ only, always |
| NPC / ship / creature | — | Entity only, always |

**Why:** Factions/locations with entity records already have the generative tier for narrator detail. The entity record is the richer, more authoritative source. Creating a parallel WJ entry would be redundant duplication. The WJ faction and location tabs naturally thin out as the campaign matures — which is correct. A fully-developed campaign primarily uses WJ for lore and threats.

---

## 5. Combined detection pass

Defined in `src/entities/entityExtractor.js` (Entity Discovery scope). The World Journal scope adds the `worldJournal` section to the prompt and the routing logic.

### Prompt additions (WJ sections added to entity detection prompt)

The base entity detection prompt is extended with:

```
CURRENT WORLD JOURNAL STATE (for state transition detection):
Confirmed lore: {titles only}
Narrator-asserted lore: {titles only}
Active threats: {name: severity pairs}
Faction attitudes: {name: attitude pairs}

Additionally return:

"worldJournal": {
  "lore": [
    { "title": string, "category": string, "text": string,
      "narratorAsserted": true, "confirmed": false }
  ],
  "threats": [
    { "name": string, "type": string, "severity": string, "summary": string }
  ],
  "factionUpdates": [
    { "name": string, "attitude": string, "summary": string, "isNew": boolean }
  ],
  "locationUpdates": [
    { "name": string, "type": string, "summary": string, "isNew": boolean }
  ],
  "stateTransitions": [
    { "entryType": "threat" | "lore" | "faction",
      "name": string,
      "change": "resolved" | "escalated" | "contradicted" | "attitudeShift",
      "newValue": string }
  ]
}

Lore rules: only extract concrete narrative facts, not atmosphere.
Threat rules: only named or distinctly typed dangers with narrative weight.
State transitions: compare narration against CURRENT WORLD JOURNAL STATE above.
  - Threat resolved/escalated → record transition
  - Confirmed lore contradicted → record as "contradicted" (GM notification only)
  - Faction attitude changed → record transition
Return empty arrays for any section with nothing to report.
```

### Routing (added to `routeWorldJournalResults` in `entityExtractor.js`)

```js
async function routeWorldJournalResults(wj, campaignState) {
  // Lore — always WJ
  for (const lore of wj.lore ?? []) {
    await recordLoreDiscovery(lore.title, lore, campaignState);
  }

  // Threats — always WJ
  for (const threat of wj.threats ?? []) {
    await recordThreat(threat.name, threat, campaignState);
  }

  // Factions — WJ only if no entity record exists
  for (const faction of wj.factionUpdates ?? []) {
    if (!entityExistsForName(faction.name, "faction", campaignState)) {
      await recordFactionIntelligence(faction.name, faction, campaignState);
    }
  }

  // Locations — same rule
  for (const location of wj.locationUpdates ?? []) {
    if (!entityExistsForName(location.name, "location", campaignState)) {
      await recordLocation(location.name, location, campaignState);
    }
  }

  // State transitions
  for (const transition of wj.stateTransitions ?? []) {
    await applyStateTransition(transition, campaignState);
  }
}
```

---

## 6. Assembler injection

WJ sections appear in two priority bands. See `implementation-ordering.md` for the full assembler section order.

### High priority — narrative constraints (Sections 3–4)

**Section 3: Confirmed lore** (~100 tokens, never dropped)

```
## ESTABLISHED LORE — DO NOT CONTRADICT

"The iron panel navigates to Ascendancy space"
"The Covenant's AI prohibition extends to navigation cores"

NARRATOR-ASSERTED (treat as established):
"Bleakhold's administrator reports to a silent handler off-world"
```

Confirmed entries always present. Narrator-asserted entries dropped if budget tight.

**Section 4: Active threats** (~60 tokens, immediate never dropped)

```
## ACTIVE THREATS

IMMEDIATE: Ascendancy AI fragment — actively pursuing the characters
ACTIVE: Raider clan Ashborn — controls the Kovash approaches
```

Immediate threats always present. Active threats may truncate. Looming dropped first.

### Lower priority — campaign colour (Sections 9–10)

**Section 9: Faction landscape** (~50 tokens, up to 3 factions, most recent first)

```
## FACTION ATTITUDES

The Covenant: hostile — burned the relay station last session
The Iron Compact: neutral — cautious, watching
```

**Section 10: Recent discoveries** (~50 tokens, current session unconfirmed lore only)

```
## THIS SESSION — UNCONFIRMED

"The handler may be operating out of sector"
```

---

## 7. Two-tier lore

Mirrors the entity canonical/generative tier pattern exactly:

- `confirmed: true` = canonical. GM-owned. Never to be contradicted by the narrator.
- `narratorAsserted: true, confirmed: false` = generative. Narrator-stated. Soft constraint.

**Promotion:** GM views the Lore tab in the WJ panel. Sees narrator-asserted entries with session stamps. Clicks "Confirm" → `confirmed: true`, `promotedAt` stamped. Entry moves to the confirmed section in the panel and in the assembler prompt.

**Contradiction notification:** If `stateTransitions` contains a contradiction of a confirmed entry, the module posts a GM-only chat card:

```
◈ Narrative Review
The narrator may have contradicted an established fact.

  "The iron panel navigates to Ascendancy space" (confirmed, Session 3)
  The narration described the panel navigating to Terminus space.

[Review narration]   [Override — treat as new fact]   [Dismiss]
```

No automatic correction. The GM adjudicates.

---

## 8. State transition detection

**Threat resolution:** A narration describes a threat being defeated → `severity: "resolved"` → archived in threat history. Chat notification: "◈ Threat resolved: [name]."

**Threat escalation:** A narration describes a looming threat becoming active, or an active threat becoming immediate → severity updated upward, history entry appended.

**Faction attitude shift:** An encounter changes a faction's known attitude → new attitude recorded, encounter appended to history.

**Lore contradiction:** Narrator may have contradicted a confirmed entry → GM-only notification posted (see Section 7). No automatic state change.

State transitions are applied immediately without GM confirmation — they are narrative observations, not editorial decisions.

---

## 9. Manual entry

```
!journal faction "The Keeper's Covenant" hostile — they burned the relay station
!journal location "Derelict Station Kovash" derelict — abandoned, radiation warning
!journal lore "The iron panel navigates to Ascendancy space" confirmed
!journal threat "Ascendancy AI fragment" immediate — pursuing the panel
```

Manual entries bypass the detection pass entirely. `!journal lore ... confirmed` creates the entry with `confirmed: true` and `narratorAsserted: false` — a direct GM editorial decision.

---

## 10. New file: `src/world/worldJournal.js`

```js
// INIT
export async function initWorldJournals()

// WRITE
export async function recordLoreDiscovery(title, entry, campaignState)
export async function recordThreat(name, entry, campaignState)
export async function recordFactionIntelligence(name, entry, campaignState)
export async function recordLocation(name, entry, campaignState)
export async function updateThreatSeverity(name, severity, campaignState)
export async function promoteLoreToConfirmed(title, campaignState)
export async function applyStateTransition(transition, campaignState)
export async function annotateEntry(journalType, entryName, text, authorName, campaignState)
export async function writeSessionLog(campaignState)

// READ (for assembler)
export function getConfirmedLore(campaignState)
export function getNarratorAssertedLore(campaignState)
export function getActiveThreats(campaignState)
export function getFactionLandscape(campaignState)
export function getRecentDiscoveries(campaignState)
```

---

## 11. World Journal panel

`src/world/worldJournalPanel.js` — ApplicationV2, four tabs.

**Lore tab:** Confirmed entries (lock badge, session stamp). Narrator-asserted entries (session stamp, Confirm button, Flag button). Sorted by session, most recent first.

**Threats tab:** Sorted by severity (immediate → active → looming → resolved, archived). Each entry: severity badge, summary, history accordion, Update Severity dropdown, annotate.

**Factions tab:** Attitude badge, encounter history, link to entity record if one exists. Attitude filter.

**Locations tab:** Status badge, visit history, link to entity record if one exists. Status filter.

Footer: "Session Log →" opens the session log JournalEntry in the Foundry journal viewer.

Toolbar button using the two-hook pattern (see CLAUDE.md). GM only.

---

## 12. Settings

```js
"worldJournalEnabled"          Boolean  true
"worldJournalAutoDetect"       Boolean  true   // combined detection pass
"loreInContext"                Boolean  true   // confirmed lore in assembler
"threatsInContext"             Boolean  true   // active threats in assembler
"factionLandscapeInContext"    Boolean  true   // faction attitudes in assembler
"contradictionNotifications"   Boolean  true   // GM contradiction alerts
"sessionLogAutoWrite"          Boolean  true
```

---

## 13. Cost

The combined detection pass (one call per narration, shared with Entity Discovery) replaces two separate calls. Cost is marginally higher than entity-only due to the larger prompt carrying WJ state, but lower than running two passes.

| Step | When | Model | Tokens | Cost |
|------|------|-------|--------|------|
| Combined detection pass | Discovery/interaction (~70% of moves) | Haiku | ~450 in / 200 out | ~$0.00035/call |
| Per session (20 moves) | | | | ~$0.005 |
