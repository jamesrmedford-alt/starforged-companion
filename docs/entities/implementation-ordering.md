# Starforged Companion — Implementation Ordering
## Narrator Entity Discovery + World Journal
## Including unit test evolution for cross-dependencies

**Covers:** narrator-entity-discovery-scope-v2.md + world-journal-scope-v2.md  
**These two scopes share:** the combined detection pass, the assembler section order, and token budget  
**Total estimated Claude Code sessions:** 5  

---

## Overview

These two scopes cannot be implemented entirely independently. Their
intersection is the combined detection pass — one Haiku call that serves both
entity extraction and World Journal detection. Implementing them in sequence
with a clear handoff point avoids writing the detection pass twice.

**The handoff point:** Entity Discovery Phases 1–3 (schema, permissions,
relevance resolver) can be fully implemented and tested before World Journal
begins. Phase 4 (combined detection pass) is written once to serve both
systems simultaneously.

---

## Full assembler section order (both scopes complete)

This is the target state. Implemented incrementally across phases.

```
Section 0:  Safety                    (exempt, always first)
Section 1:  Narrator permissions      (exempt, always second)
Section 2:  Oracle seeds              (when present, uncached)
Section 3:  Confirmed lore            (high priority — never dropped)
Section 4:  Active threats            (high priority — immediate never dropped)
Section 5:  World Truths
Section 6:  Current location card     (always injected when set)
Section 7:  Matched entity cards      (up to maxEntityCardsInContext)
Section 8:  Progress tracks
Section 9:  Faction landscape         (up to 3 factions, most recent)
Section 10: Recent WJ discoveries     (current session unconfirmed lore)
Section 11: Oracle history            (last 3 rolls)
Section 12: Session notes             (dropped first under budget pressure)
Section 13: Move outcome              (exempt, always last)
```

Token budget: 1,200 tokens across all variable sections (Sections 3–12).
Sections 0, 1, 2, 13 are exempt and do not count against the budget.

---

## Phase 1 — Schema foundations
**Scope:** Entity Discovery  
**Claude Code sessions:** 0.5  
**Blocks:** All subsequent phases  

### What gets built

1. Add `narratorClass` to all 40 moves in `src/schemas.js`
2. Add `canonicalLocked`, `generativeTier` to all existing entity schemas
3. Add `locationIds`, `creatureIds`, `currentLocationId`, `currentLocationType`,
   `dismissedEntities`, `pendingClarification` to `CampaignStateSchema`
4. Write `src/entities/location.js` (same pattern as `planet.js`)
5. Write `src/entities/creature.js` (same pattern as `planet.js`)
6. Add `location` and `creature` to `ENTITY_TYPES` in `entityPanel.js`
7. Add `TYPE_STYLE` entries for location and creature in `promptBuilder.js`
8. Update `lang/en.json` — new entity type labels
9. Raise token budget to 1,200 in `schemas.js` and `assembler.js`
10. Add "Cost and API usage" section to `README.md`

### Tests at end of Phase 1

**New unit tests — `tests/unit/schemas.test.js` (additions)**
```
MOVES narratorClass
  ✓ all 40 moves have a narratorClass field
  ✓ narratorClass values are only "discovery" | "interaction" | "embellishment" | "hybrid"
  ✓ make_a_connection is "discovery"
  ✓ enter_the_fray is "interaction"
  ✓ endure_harm is "embellishment"
  ✓ face_danger is "hybrid"

Entity schema extensions
  ✓ ConnectionSchema has canonicalLocked field
  ✓ ConnectionSchema has generativeTier array
  ✓ LocationSchema has all required fields
  ✓ CreatureSchema has all required fields

CampaignStateSchema
  ✓ has locationIds array
  ✓ has creatureIds array
  ✓ has currentLocationId null
  ✓ has dismissedEntities array
  ✓ has pendingClarification null

Token budget
  ✓ ContextPacketSchema.tokenBudget is 1200
```

**No integration tests in Phase 1** — schema only, no Foundry document operations.

**All existing tests must still pass.** Phase 1 is additive — no existing fields removed.

---

## Phase 2 — Narrator permissions and relevance resolver
**Scope:** Entity Discovery  
**Claude Code sessions:** 1  
**Depends on:** Phase 1  
**Blocks:** Phase 4  

### What gets built

11. Add `NARRATOR_PERMISSIONS` to `narratorPrompt.js`
12. Add `formatEntityCard()` to `narratorPrompt.js`
13. Write `src/context/relevanceResolver.js` — string matching + Haiku classification
14. Update `assembler.js` — add Sections 0–2 (permissions, oracle seeds);
    entity cards replace connections count; budget raised to 1,200;
    section order matches Phase 2 target (Sections 0–2, 5, 7, 8, 11–13 only —
    WJ sections 3, 4, 9, 10 are stubs returning empty strings until Phase 5)
15. Update `narrator.js` — call resolver; inject permission block; pass oracle seeds
16. Add oracle seeding for applicable moves in `resolver.js`
17. Add `currentLocationId` / `currentLocationType` to `CampaignStateSchema`
18. Add `!at` command to `createChatMessage` handler in `index.js`

### Tests at end of Phase 2

**New unit tests — `tests/unit/relevanceResolver.test.js`**
```
String matching
  ✓ returns matched entity ID when full name in narration
  ✓ case-insensitive matching
  ✓ returns empty when no name match
  ✓ hybrid + name match → "interaction"
  ✓ hybrid + no match + hit → classification call fires
  ✓ hybrid + no match + miss → "embellishment", no classification call
  ✓ dismissed entity names are not matched

buildNameIndex
  ✓ indexes by full name
  ✓ indexes by first word
  ✓ single-word names indexed correctly
```

**New additions — `tests/unit/narratorPrompt.test.js`**
```
NARRATOR_PERMISSIONS
  ✓ discovery block contains "You MAY introduce"
  ✓ interaction block contains "do not contradict"
  ✓ embellishment block contains "no new named entity"
  ✓ permissions appear after safety, before section 3

formatEntityCard
  ✓ includes entity name and type label
  ✓ includes canonical fields
  ✓ includes generative tier entries (up to 5)
  ✓ pinned entries appear before unpinned
  ✓ canonicalLocked: true → "do not contradict" label
  ✓ canonicalLocked: false → "established — prefer consistency" label
  ✓ empty generative tier → tier section omitted

Assembler — token budget
  ✓ assembled packet does not exceed 1200 tokens
  ✓ session notes dropped before entity cards under pressure
  ✓ safety and permissions never dropped
  ✓ WJ stub sections (3,4,9,10) return empty string and consume 0 tokens
```

**Quench integration — additions to existing narrator batch**
```
  ✓ discovery permission block appears in narrator system prompt
  ✓ interaction permission block appears when entity matched by relevance resolver
  ✓ entity card appears in prompt when entity name in player narration
  ✓ !at [name] sets currentLocationId in campaignState
  ✓ current location card appears in narrator prompt when set
```

---

## Phase 3 — World Journal foundation (no detection pass yet)
**Scope:** World Journal  
**Claude Code sessions:** 1  
**Depends on:** Phase 1  
**Blocks:** Phase 4  

World Journal CRUD operations and manual entry. No auto-detection — the
combined detection pass hasn't been written yet. The WJ panel and !journal
commands are fully functional; entries are created only via manual command
or future auto-detection.

### What gets built

19. Create `src/world/` folder
20. Write `src/world/worldJournal.js` — all CRUD functions, read functions for assembler
21. Add `initWorldJournals()` to ready hook in `index.js`
22. Add !journal command parsing to `createChatMessage` in `index.js`
23. Write `src/world/worldJournalPanel.js` — ApplicationV2, four tabs, read-only for now
24. Add WJ toolbar button using two-hook pattern in `index.js`
25. Add WJ settings to `settingsPanel.js`
26. Add CSS for WJ panel and badges
27. Write `tests/unit/worldJournal.test.js`

### Tests at end of Phase 3

**New unit tests — `tests/unit/worldJournal.test.js`**
```
recordLoreDiscovery
  ✓ creates new lore entry with narratorAsserted: false for manual entry
  ✓ confirmed: true when created via !journal lore ... confirmed
  ✓ preserves existing entries when adding new one
  ✓ rejects entry with empty title

recordThreat
  ✓ creates new threat entry
  ✓ default severity is "looming" if not specified
  ✓ appends to history when severity changes

recordFactionIntelligence
  ✓ creates new faction entry
  ✓ appends encounter to existing faction entry
  ✓ updates attitude when changed
  ✓ stores entityId link when provided

updateThreatSeverity
  ✓ updates severity on named threat
  ✓ appends to history array
  ✓ does not create new entry if threat not found (warns instead)

promoteLoreToConfirmed
  ✓ sets confirmed: true
  ✓ sets promotedAt timestamp
  ✓ does not change narratorAsserted flag

applyStateTransition — threat
  ✓ resolved transition sets severity "resolved"
  ✓ escalated transition updates severity upward

applyStateTransition — lore contradiction
  ✓ does NOT modify the lore entry
  ✓ posts GM-only notification card

parseJournalCommand
  ✓ !journal faction "Name" hostile — summary
  ✓ !journal lore "Title" confirmed — text
  ✓ !journal threat "Name" immediate — summary
  ✓ !journal location "Name" derelict — description
  ✓ rejects unknown journal types
  ✓ handles quoted names with spaces

getConfirmedLore / getActiveThreats / getFactionLandscape / getRecentDiscoveries
  ✓ getConfirmedLore returns only confirmed: true entries
  ✓ getActiveThreats returns severity !== "resolved", sorted by severity
  ✓ getFactionLandscape returns up to 3 factions, most recent first
  ✓ getRecentDiscoveries returns current session entries only
```

**Cross-dependency note:** Phase 3 tests use no mocks of Entity Discovery —
the two systems are independent at this phase. The WJ functions receive
`campaignState` and operate on journal entries only.

---

## Phase 4 — Combined detection pass
**Scope:** Shared (Entity Discovery + World Journal)  
**Claude Code sessions:** 1  
**Depends on:** Phase 2 AND Phase 3  
**This is the integration point of both scopes**

The combined detection pass is written once, in `src/entities/entityExtractor.js`,
and routes results to both the entity extraction pipeline and the World Journal.
Writing it requires both Phase 2 (entity extraction pipeline ready to receive
results) and Phase 3 (World Journal write functions ready to receive results).

### What gets built

28. Write `src/entities/entityExtractor.js`:
    - `runCombinedDetectionPass()` — main entry point
    - Combined detection prompt including WJ state sections
    - `routeEntityDrafts()` — entity results → draft cards
    - `routeWorldJournalResults()` — WJ results → worldJournal.js functions
    - `entityExistsForName()` — checks entity records before creating WJ entry
    - `appendGenerativeTierUpdates()` — post-narration tier update pass
29. Update `narrator.js` — wire combined pass after narration for
    discovery/interaction class; synchronous for `make_a_connection`
30. Add clarification card and pipeline state (`pendingClarification`) to `index.js`
31. Wire `make_a_connection` oracle seeding and auto-creation

### Tests at end of Phase 4

**New unit tests — `tests/unit/entityExtractor.test.js`**
```
parseDetectionResponse — entity section
  ✓ parses valid entity JSON
  ✓ returns empty array for empty entities
  ✓ filters low-confidence results
  ✓ does not return names in established entity list
  ✓ does not return names in dismissedEntities

parseDetectionResponse — WJ section
  ✓ extracts lore entries correctly
  ✓ extracts threats correctly
  ✓ extracts factionUpdates with isNew flag
  ✓ extracts stateTransitions correctly
  ✓ handles missing worldJournal section gracefully (returns empty)

routeWorldJournalResults
  ✓ routes lore to recordLoreDiscovery regardless of entity records
  ✓ routes threats to recordThreat regardless of entity records
  ✓ routes faction to WJ when no entity record exists
  ✓ suppresses faction WJ entry when entity record exists
  ✓ routes location to WJ when no entity record exists
  ✓ suppresses location WJ entry when entity record exists

entityExistsForName
  ✓ returns true when faction name matches entity record
  ✓ returns false when name not found
  ✓ case-insensitive matching

appendGenerativeTierUpdates
  ✓ appends new detail to entity generativeTier
  ✓ does not append if detail already present (deduplication check)
  ✓ pinned entries persist past display limit

oracle seeding
  ✓ make_a_connection includes oracleSeeds in resolution
  ✓ gather_information does not include oracleSeeds
```

**Cross-dependency tests — this is where the two scopes first interact**

These tests require BOTH entity records AND WJ journal entries to exist in the
same test context. Use a shared test fixture that creates both:

```js
// In quench.js — new batch: "starforged-companion.entityWorldJournal"
// Shared setup: create a faction entity record AND a WJ faction entry

beforeEach(async () => {
  // Create entity record for "The Covenant"
  await createFaction({ name: "The Covenant", ... }, campaignState);
  // Create WJ entry for "The Iron Compact" (no entity record)
  await recordFactionIntelligence("The Iron Compact", { attitude: "neutral", ... }, campaignState);
});
```

**New Quench integration batch — `starforged-companion.entityWorldJournal`**
```
Combined detection routing
  ✓ faction with entity record → entity generative tier updated, no WJ entry created
  ✓ faction without entity record → WJ entry created, entity draft card posted
  ✓ lore always routes to WJ regardless of entity records
  ✓ threat always routes to WJ regardless of entity records
  ✓ creature routes to entity only, not WJ

Clarification card
  ✓ hybrid move + implicit reference → clarification card posted
  ✓ selecting known entity → move resolves as interaction
  ✓ selecting "Someone new" → move resolves as discovery
  ✓ pendingClarification cleared after selection

make_a_connection pipeline
  ✓ oracle seeds appear in narrator prompt
  ✓ connection record created from narration text after strong hit
  ✓ no connection record created on miss
```

---

## Phase 5 — Full assembler integration
**Scope:** Both  
**Claude Code sessions:** 0.5  
**Depends on:** Phase 4  

WJ sections (3, 4, 9, 10) move from stubs to real content. The assembler now
reads from both entity records (Phase 2) and World Journal (Phase 3).

### What gets built

32. Update `assembler.js` — implement Sections 3, 4, 9, 10 using WJ read functions
33. Implement drop-under-pressure logic for the new sections:
    - Confirmed lore (Section 3): never dropped
    - Immediate threats (Section 4): never dropped; active threats dropped before looming
    - Faction landscape (Section 9): dropped before entity cards
    - Recent discoveries (Section 10): dropped first after session notes

### Tests at end of Phase 5

**Cross-dependency unit tests — `tests/unit/assembler.test.js` (additions)**

These tests require a mock that provides BOTH entity records and WJ entries.
Create a shared test fixture helper `tests/helpers/fullStateFixture.js`:

```js
// tests/helpers/fullStateFixture.js
export function buildFullCampaignState() {
  return {
    ...defaultCampaignState(),
    // Entity records
    connectionIds: ["conn-sable"],
    factionIds:    ["faction-covenant"],
    locationIds:   ["loc-kovash"],
    // WJ entries (stored in mock journal flags)
    loreEntries: [
      { title: "The iron panel navigates to Ascendancy space",
        confirmed: true, narratorAsserted: false, ... }
    ],
    threatEntries: [
      { name: "Ascendancy AI fragment", severity: "immediate", ... }
    ],
    factionEntries: [
      // Only Iron Compact — Covenant has entity record, suppressed from WJ
      { factionName: "The Iron Compact", attitude: "neutral", entityId: null, ... }
    ],
  };
}
```

```
Assembler — full section order with WJ content
  ✓ Section 3 contains confirmed lore title
  ✓ Section 3 omits narrator-asserted lore when budget tight
  ✓ Section 3 never omits confirmed lore regardless of budget
  ✓ Section 4 contains immediate threat
  ✓ Section 4 never omits immediate threat
  ✓ Section 4 omits looming threats when budget tight
  ✓ Section 7 contains entity card for matched entity
  ✓ Section 9 contains faction landscape (Iron Compact, not Covenant)
  ✓ Section 9 does NOT contain factions with entity records
  ✓ Section 10 contains current-session unconfirmed lore
  ✓ Section 10 omitted when no current-session discoveries
  ✓ total assembled packet does not exceed 1200 tokens
  ✓ drop order under pressure: 12 → 10 → 9 → 11 → 8 → 7(partial) → 4(looming) → 3(asserted)
```

---

## Phase 6 — Entity Panel and WJ Panel full UI
**Scope:** Both  
**Claude Code sessions:** 1  
**Depends on:** Phase 5  

### What gets built

34. Entity Panel: generative tier UI (collapsible, pin/promote/remove)
35. Entity Panel: `canonicalLocked` toggle
36. Entity Panel: "Set as current location" button for settlement/location types
37. Entity Panel: dismissed entities management tab
38. WJ Panel: lore tab with Confirm button, contradiction flag
39. WJ Panel: threat tab with severity update, history accordion
40. WJ Panel: faction and location tabs with entity record links
41. WJ Panel: contradiction notification card (GM only)
42. Add `postContradictionNotification()` to `worldJournal.js`

### Tests at end of Phase 6

**Quench integration additions — `starforged-companion.worldJournal`**
```
WJ CRUD — live Foundry
  ✓ initWorldJournals() creates folder and all category journals
  ✓ !journal faction creates WJ entry
  ✓ !journal lore confirmed creates entry with confirmed: true
  ✓ promoteLoreToConfirmed() sets confirmed: true and promotedAt
  ✓ applyStateTransition resolved → threat severity updated to resolved
  ✓ applyStateTransition contradicted → GM notification card posted, lore not changed
  ✓ annotation is visible after annotateEntry()
  ✓ writeSessionLog() produces a readable session page

Full pipeline — entity + WJ together
  ✓ discovery move narration → combined detection fires → entity draft + WJ lore created
  ✓ faction entity exists → WJ suppressed → entity generative tier updated
  ✓ confirmed lore appears in assembled context packet (Section 3)
  ✓ immediate threat appears in assembled context packet (Section 4)
  ✓ faction landscape appears in Section 9 for non-entity factions only
```

---

## Phase 7 — Final wiring and help content
**Scope:** Both  
**Claude Code sessions:** 0.5  

### What gets built

43. Update `packs/help.json` — entity panel section (new types, generative tier,
    current location, dismissal), WJ section
44. Update `docs/scope-index.md` — mark both scopes complete
45. Update `docs/architecture.html` — add combined detection pass, WJ panel,
    generative tier to the entity records node
46. Full test suite run — all 36 existing + new tests green

---

## Summary: test fixture evolution and cross-dependency strategy

### Phase 1–2: Isolated entity tests
Tests use entity-only fixtures. No WJ. Mocking not needed — the two systems
don't touch yet.

### Phase 3: Isolated WJ tests
Tests use WJ-only fixtures. No entity records. `campaignState` has empty
entity ID arrays.

### Phase 4: First integration point
Tests for the combined detection pass need BOTH systems present. The shared
fixture helper (`tests/helpers/fullStateFixture.js`) is introduced here.
This is the first test that must be written with both scopes' data in the
mock state. The key assertion: routing suppresses WJ faction entry when
entity record exists.

### Phase 5: Assembler cross-dependency tests
The assembler tests now require the full state fixture. The new drop-under-pressure
tests verify that WJ sections and entity card sections compete correctly for budget
— this is the first test that validates the *interaction* between the two scopes'
assembler contributions.

### Phase 6–7: Full pipeline Quench tests
Live Foundry tests that exercise the complete pipeline: player narration →
resolver → permissions → narrator → combined detection → entity update +
WJ update → assembler reads back both → next narration is constrained
correctly. These tests are slow (multiple API calls) and use extended timeouts
following the established pattern in quench.js.

### Mocking strategy for cross-dependency unit tests

Unit tests mock the *other system's functions* rather than the underlying
Foundry APIs. When testing entity extraction routing, mock `recordLoreDiscovery`
and `recordThreat` from worldJournal.js and verify they are called with the
right arguments. When testing assembler section ordering, mock
`getConfirmedLore` and `getActiveThreats` from worldJournal.js to return
controlled fixtures.

This keeps unit tests fast and focused while Quench integration tests cover
the live interaction.

```js
// Example: testing routeWorldJournalResults in entityExtractor.test.js
import { vi } from "vitest";
import * as wj from "../../src/world/worldJournal.js";

vi.spyOn(wj, "recordLoreDiscovery").mockResolvedValue(undefined);
vi.spyOn(wj, "recordThreat").mockResolvedValue(undefined);
vi.spyOn(wj, "recordFactionIntelligence").mockResolvedValue(undefined);

// ... run routeWorldJournalResults with test data ...

expect(wj.recordLoreDiscovery).toHaveBeenCalledWith(
  "The iron panel navigates to Ascendancy space",
  expect.objectContaining({ narratorAsserted: true }),
  expect.any(Object)
);
expect(wj.recordFactionIntelligence).not.toHaveBeenCalledWith(
  "The Covenant",  // has entity record — should be suppressed
  expect.anything(),
  expect.anything()
);
```

---

## Handoff checklist for Claude Code

Before starting Phase 4, verify:
- [ ] All Phase 2 unit tests passing (`npm test`)
- [ ] All Phase 3 unit tests passing (`npm test`)
- [ ] Phase 2 Quench tests green (narrator permissions, relevance resolver)
- [ ] Phase 3 Quench tests green (WJ CRUD, !journal commands)
- [ ] `tests/helpers/fullStateFixture.js` written and reviewed
- [ ] `docs/foundry-api-reference.md` — no new API needed for Phase 4
- [ ] Both scope documents present in `docs/`

Before starting Phase 5, verify:
- [ ] Phase 4 unit tests passing
- [ ] Phase 4 Quench batch `starforged-companion.entityWorldJournal` green
- [ ] Combined detection prompt returns correct shape (verified against live API)
