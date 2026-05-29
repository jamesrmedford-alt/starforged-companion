# Starforged Companion — Narrator Entity Discovery Scope
## Contextual narrator permissions, entity capture from narration, and relevance-based context selection

**Status:** 📋 PLANNED  
**Priority:** After Sector Creator (✅ complete)  
**Estimated Claude Code sessions:** 3  
**Dependencies:** Entity system (✅), Narrator (✅), Assembler (✅), Sector Creator (✅)  
**Pre-requisite fixes:** Sector creator entity fixes committed (canonicalLocked, single
settlementIds source, stub text to entity description) — these must be in place before Phase 1.

---

## 1. Overview

This scope addresses three interrelated problems:

**Problem 1 — The narrator invents freely and inconsistently.** Every narration
call is stateless with respect to previously established entity details. The
narrator can introduce a character in session 3 and describe them differently in
session 5. Nothing captures or constrains what has been established.

**Problem 2 — Entities are created manually and therefore incompletely.** The
GM creates entity records by hand in the Entity Panel. NPCs, locations, factions,
and creatures introduced organically through narration never get records unless
the GM does so manually. The most narratively significant entities — the ones
that emerged from play — are the least well-documented.

**Problem 3 — Context is selected by priority, not relevance.** The assembler
injects connections and world truths by token priority. A combat with a specific
known enemy gets the same context packet as a recovery move in an unrelated
location. The narrator receives either too little (the enemy's established
details are absent) or too much (unrelated factions consuming the budget).

### Solution overview

- **Move-class-based narrator permissions** — what the narrator may and may not
  create per move type
- **Hybrid clarification step** — a blocking dialog resolves ambiguous entity
  references before narration is called
- **Oracle seeds as narrator inspiration** — oracle results inform the narrator;
  entity records are built from narration text, not from oracle outputs directly
- **Post-narration entity extraction** — synchronous for explicit creation moves,
  async for other discovery moves
- **Two-tier entity schema** — canonical (GM-owned) and generative (narrator-added)
- **Relevance resolver** — scene-aware context selection, current location always
  injected
- **Tripled token budget** — 1,200 tokens to accommodate entity cards

### Known limitations (document honestly)

**Permission mode is advisory, not enforced.** The module cannot prevent the
narrator from violating the permission rules — it can only instruct. If the
narrator invents something in embellishment mode, the extraction pass will surface
it anyway and the GM can confirm or dismiss. Violations produce draft cards, not
errors.

**Bootstrapping.** Campaigns in progress when this feature ships have no entity
records for organically-introduced entities. The system captures forward from
the install date. There is no automated backfill. A future batch-extraction tool
over session history is noted as a possible follow-on.

---

## 2. Entity taxonomy extension

### Existing types (structure unchanged, schema extended in Section 3)
- `connection` — NPC with a relationship track
- `ship` — vessel (PC ship or notable NPC vessel)
- `settlement` — community or station
- `faction` — organisation or power
- `planet` — world or moon

### New types

**`location`** — a named specific place that is not a settlement or planet.
Covers: derelicts, precursor vaults, named structures, battlefields, relay
stations, anomalies.

```js
export const LocationSchema = {
  _id:    "",
  name:   "",
  active: true,

  type:    "",  // "derelict" | "vault" | "station" | "anomaly" | "ruin" | "other"
  region:  "",  // sector/region
  status:  "",  // "unexplored" | "visited" | "cleared" | "destroyed" | "unknown"

  firstLook:   "",   // Derelict First Look / initial description
  feature:     "",   // Most recent significant feature
  peril:       "",   // Most recent peril
  opportunity: "",   // Most recent opportunity

  description: "",
  history:     "",
  notes:       "",

  portraitId:               null,
  portraitSourceDescription: "",

  sceneRelevant:  false,
  narratorNotes:  "",

  sectorId:     null,
  settlementId: null,

  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};
```

**`creature`** — a named or typed creature. Covers: Starforged creature types,
AI fragments, unique named beasts.

```js
export const CreatureSchema = {
  _id:    "",
  name:   "",
  active: true,

  environment: "",  // "space" | "interior" | "land" | "liquid" | "air" | "any"
  scale:       "",  // "creature" | "monster" | "horror" | "colossus"
  form:        "",  // Oracle result or freeform

  firstLook:    [],
  aspect:       [],
  behavior:     "",
  encounter:    "",

  rank:          "",  // combat rank if used as opponent
  attackPattern: "",

  description: "",
  notes:       "",

  portraitId:               null,
  portraitSourceDescription: "",

  // DALL-E style: "creature profile, full form visible, alien biology,
  //                dark science fiction concept art"

  sceneRelevant:  false,
  narratorNotes:  "",

  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};
```

### ENTITY_TYPES update

```js
const ENTITY_TYPES = {
  connection: { label: "Connections", flag: "connection", icon: "⬡" },
  ship:       { label: "Ships",       flag: "ship",       icon: "◈" },
  settlement: { label: "Settlements", flag: "settlement", icon: "⬟" },
  faction:    { label: "Factions",    flag: "faction",    icon: "⬢" },
  planet:     { label: "Planets",     flag: "planet",     icon: "◉" },
  location:   { label: "Locations",   flag: "location",   icon: "◧" },  // NEW
  creature:   { label: "Creatures",   flag: "creature",   icon: "⬣" },  // NEW
};
```

### campaignState additions

```js
locationIds:        [],     // JournalEntry IDs for location records
creatureIds:        [],     // JournalEntry IDs for creature records
currentLocationId:  null,   // JournalEntry ID of current settlement/location
currentLocationType: null,  // "settlement" | "location" | "planet"
dismissedEntities:  [],     // Entity names suppressed from extraction
```

---

## 3. Two-tier entity schema

Every entity type gains two fields. The existing `description`, `notes`, and
`narratorNotes` fields form the canonical tier. A new `generativeTier` array
captures narrator-added details with session attribution.

```js
// Added to ALL entity schemas:

canonicalLocked: false,
// false → canonical fields labelled "established — prefer consistency"
// true  → canonical fields labelled "do not contradict" (hard constraint)
// Sector-creator-generated entities arrive with canonicalLocked: true.
// GM-created entities default to false and can be locked via the Entity Panel.

generativeTier: [
  {
    sessionId:  string,   // campaignState.currentSessionId
    sessionNum: number,   // campaignState.sessionNumber
    detail:     string,   // One sentence — the narrator-added detail
    source:     string,   // "narrator_extraction" | "gm_manual"
    pinned:     boolean,  // GM-pinned: always included in narrator prompt
                          // regardless of recency
    promoted:   boolean,  // GM-promoted to canonical tier
    promotedAt: null,     // ISO timestamp
  }
]
```

**Canonical tier:** All existing schema fields plus GM-promoted generative
entries. Instructor to narrator: never contradict.

**Generative tier:** Narrator-added details, session-stamped. The narrator
builds on these but should not contradict them. The GM may:

- **Pin** an entry — always included in the narrator prompt regardless of age.
  Resolves the recency-only problem: "pauses before answering questions about her
  past" is more important than "was wearing grey last session" and survives
  indefinitely.
- **Promote** an entry to the canonical `notes` field (appended) — marks
  `promoted: true`, removes from active generative display.
- **Remove** an entry — deleted from the tier entirely.

**Narrator prompt injection:** Up to 5 generative entries per entity, ordered by:
pinned first, then recency. If there are more than 5, pinned entries are always
kept; recency determines which unpinned entries are dropped.

**Example in narrator prompt:**
```
## SABLE — Connection

CANONICAL (established — do not contradict):
  Role: AI navigator aboard the Ironfold
  Disposition: Neutral-wary — considers herself crew, not cargo
  Goal: Unknown — has not disclosed it
  Notes: Legally ambiguous under Covenant AI law

NARRATOR-ADDED (honour and build on these):
  📌 Session 3: "Pauses before answering questions about her past"
  Session 4: "Speaks in clipped, precise sentences under pressure"
  Session 5: "Has a visible hesitation scar on her vocal processor"
```

---

## 4. Context budget — tripled to 1,200 tokens

The existing 400-token budget for variable context sections is insufficient to
accommodate entity cards alongside world truths, progress tracks, and session
notes. The budget is raised to **1,200 tokens** across all variable sections.

**Update in:**
- `src/schemas.js` — `ContextPacketSchema.tokenBudget: 1200`
- `src/context/assembler.js` — default budget parameter: `1200`
- `README.md` — add explicit documentation (see Section 4.1)

### 4.1 README documentation

Add to `README.md` under a "Cost and API usage" section:

```markdown
## Context packet size

Each narration call sends approximately **1,200 tokens** of context to the
Claude API, regardless of move type. This covers safety configuration, narrator
permissions, world truths, entity cards for entities present in the scene,
active progress tracks, and character state.

At current Sonnet pricing this is ~$0.004 per narration input. Output
(the narration itself) adds ~$0.003–$0.006 depending on length setting.
Total per move: ~$0.007–$0.010 on Sonnet. Haiku is approximately 10× cheaper.

The budget is defined in `src/schemas.js` (`ContextPacketSchema.tokenBudget`).
```

---

## 5. Move class taxonomy

Each move gets a `narratorClass` field in `MOVES` in `schemas.js`.

```
"discovery"     — narrator may introduce new named entities
"interaction"   — narrator must use established entities; may add generative detail
"embellishment" — sensory/atmospheric only; no entity introduction permitted
"hybrid"        — class resolved at runtime (see Section 6)
```

```js
export const MOVES = {
  // SESSION
  begin_a_session:           { ..., narratorClass: "discovery"     },
  set_a_flag:                { ..., narratorClass: "embellishment"  },
  change_your_fate:          { ..., narratorClass: "embellishment"  },
  take_a_break:              { ..., narratorClass: "embellishment"  },
  end_a_session:             { ..., narratorClass: "embellishment"  },

  // ADVENTURE
  face_danger:               { ..., narratorClass: "hybrid"         },
  secure_an_advantage:       { ..., narratorClass: "hybrid"         },
  gather_information:        { ..., narratorClass: "discovery"      },
  compel:                    { ..., narratorClass: "interaction"     },
  aid_your_ally:             { ..., narratorClass: "embellishment"  },
  check_your_gear:           { ..., narratorClass: "embellishment"  },

  // QUEST
  swear_an_iron_vow:         { ..., narratorClass: "hybrid"         },
  reach_a_milestone:         { ..., narratorClass: "embellishment"  },
  fulfill_your_vow:          { ..., narratorClass: "hybrid"         },
  forsake_your_vow:          { ..., narratorClass: "hybrid"         },

  // CONNECTION
  make_a_connection:         { ..., narratorClass: "discovery"      },
  develop_your_relationship: { ..., narratorClass: "interaction"     },
  test_your_relationship:    { ..., narratorClass: "interaction"     },
  forge_a_bond:              { ..., narratorClass: "interaction"     },

  // EXPLORATION
  undertake_an_expedition:   { ..., narratorClass: "hybrid"         },
  explore_a_waypoint:        { ..., narratorClass: "discovery"      },
  finish_an_expedition:      { ..., narratorClass: "hybrid"         },
  set_a_course:              { ..., narratorClass: "embellishment"  },
  make_a_discovery:          { ..., narratorClass: "discovery"      },
  confront_chaos:            { ..., narratorClass: "discovery"      },

  // COMBAT
  enter_the_fray:            { ..., narratorClass: "interaction"     },
  gain_ground:               { ..., narratorClass: "interaction"     },
  strike:                    { ..., narratorClass: "interaction"     },
  clash:                     { ..., narratorClass: "interaction"     },
  react_under_fire:          { ..., narratorClass: "interaction"     },
  take_decisive_action:      { ..., narratorClass: "interaction"     },
  battle:                    { ..., narratorClass: "hybrid"          },

  // SUFFER
  endure_harm:               { ..., narratorClass: "embellishment"  },
  endure_stress:             { ..., narratorClass: "embellishment"  },
  withstand_damage:          { ..., narratorClass: "embellishment"  },
  companion_takes_a_hit:     { ..., narratorClass: "embellishment"  },
  lose_momentum:             { ..., narratorClass: "embellishment"  },
  sacrifice_resources:       { ..., narratorClass: "embellishment"  },

  // RECOVER
  sojourn:                   { ..., narratorClass: "discovery"      },
  heal:                      { ..., narratorClass: "embellishment"  },
  hearten:                   { ..., narratorClass: "embellishment"  },
  resupply:                  { ..., narratorClass: "hybrid"         },
  repair:                    { ..., narratorClass: "embellishment"  },

  // THRESHOLD
  face_death:                { ..., narratorClass: "interaction"     },
  face_desolation:           { ..., narratorClass: "interaction"     },
  overcome_destruction:      { ..., narratorClass: "interaction"     },

  // LEGACY
  earn_experience:           { ..., narratorClass: "embellishment"  },
  advance:                   { ..., narratorClass: "embellishment"  },
  continue_a_legacy:         { ..., narratorClass: "embellishment"  },

  // FATE
  ask_the_oracle:            { ..., narratorClass: "discovery"      },
  pay_the_price:             { ..., narratorClass: "hybrid"         },
};
```

---

## 6. Hybrid resolution and clarification step

### Phase 1 — String matching

The relevance resolver scans player narration for entity names from the campaign
record. If a match is found on a hybrid move, the move resolves as `interaction`.
If no match and outcome is a hit, it resolves as `discovery`. On a miss, it
resolves as `embellishment` — misses are rarely the moment to introduce new
permanent entities.

String matching indexes: full entity name, first word, last word. Case-insensitive.

### Phase 2 — Implicit reference classification (when no name match)

When a hybrid move produces no name match, a lightweight Haiku classification
call determines whether the player narration implies a specific known entity
without naming them:

```
Given this player narration for a {moveId} move, does the text imply
interaction with a specific known individual, place, or entity — even
without naming them? Pronouns ("her", "him", "it"), roles ("the captain",
"the navigator", "the station"), and possessives ("her ship", "the old
contact") all count as implicit references.

Narration: {playerNarration}

Return JSON: { "impliedEntity": true | false, "referenceType": "pronoun" |
"role" | "possessive" | "none" }
```

**If `impliedEntity: true` →** the pipeline pauses and posts a blocking
clarification card before calling the narrator.

**If `impliedEntity: false` →** resolve as `discovery` (hit) or `embellishment`
(miss) with no pause.

### Clarification card

A blocking dialog posted to the active player's client (solo: the single player;
multiplayer: the player who triggered the move):

```
◈ Who are you interacting with?

[⬡ Sable — AI navigator]
[⬡ Kael — the enforcer from last session]
[Someone new]
[No specific entity — continue]
```

Options are drawn from:
- All `connection` entities in the campaign record (always shown if any exist)
- The current location's associated entities (if `currentLocationId` is set)
- "Someone new" — resolves as discovery mode
- "No specific entity" — resolves as embellishment mode

**Pipeline state:** `campaignState.pendingClarification` is set while the card
is waiting. The narrator call does not proceed until a selection is made. This
is the same pattern as `MoveConfirmDialog`.

**Selection outcomes:**
- **Known entity selected** → move resolves as `interaction`, entity card injected
- **"Someone new"** → move resolves as `discovery`, narrator has full creation
  permission
- **"No specific entity"** → move resolves as `embellishment`

---

## 7. Oracle seeds as narrator inspiration

Whenever the module rolls oracles to inform a scene — on `make_a_connection`,
`explore_a_waypoint` with a match, `make_a_discovery`, `confront_chaos`,
`ask_the_oracle` — the oracle results are injected into the **narrator prompt**
as seeds, not used to pre-populate entity records directly.

The narrator's output becomes the source of truth. Entity records are built
from the narration text by the extraction pass (Section 9). This ensures the
record and the narration are always consistent.

```js
// In resolver.js, after rolling oracles for applicable moves:
resolution.oracleSeeds = {
  results:  ["First Look: Lean and battle-scarred", "Goal: Protect a secret"],
  names:    ["Kael"],     // suggested name — narrator may adapt
  context:  "make_a_connection",
};
```

These seeds are passed through to the narrator prompt as a block:

```
## ORACLE SEEDS (use as inspiration — you may develop or adapt)

Character first look: Lean and battle-scarred; Cold and calculating
Character goal: Protect a secret
Name suggestion: Kael

Introduce this character now. The seeds define their starting outline.
Add voice, specific detail, and atmosphere. The record will be built
from your narration.
```

Oracle seeds appear **after** the permission block and **before** world truths.
They are not cached (they change every call). They are only present when the
move type warrants them.

---

## 8. Narrator permission blocks

New section in `narratorPrompt.js`. Injected as **Section 1** of the system
prompt — immediately after Section 0 (Safety). Safety is always first and
this invariant is not disturbed.

Injection order:
```
Section 0: Safety              (exempt, always first)
Section 1: Narrator permissions (exempt, always second)
Section 2: Oracle seeds         (when present, uncached)
Section 3: World Truths
Section 4: Current location card (always injected when set)
Section 5: Matched entity cards  (relevance resolver results)
Section 6: Progress tracks
Section 7: Recent oracles
Section 8: Session notes         (dropped first under budget pressure)
Section 9: Move outcome          (exempt, always last)
```

```js
export const NARRATOR_PERMISSIONS = {

  discovery: `
## NARRATOR PERMISSIONS — DISCOVERY MODE

This move reveals something new. You have expanded creative latitude.

You MAY introduce:
- One named NPC, creature, or entity (keep initial details spare — leave
  room to develop across sessions)
- One named location or structure (atmosphere and first impression only)
- One factual revelation about the world or setting

You MUST:
- Keep new entities consistent with established world truths
- Keep new factions consistent with the established political landscape
- Keep new locations consistent with the active sector's character

You may NOT:
- Contradict any established canonical entity detail
- Introduce more than one major new named entity per narration
- Name an entity and immediately resolve their arc in the same narration

Any entity you name will be captured for the campaign record.
`.trim(),

  interaction: `
## NARRATOR PERMISSIONS — INTERACTION MODE

This move involves established entities. Consistency is required.

Use the entity cards provided. Canonical details are fixed. Generative
details are soft-established and should be honoured unless a strong
narrative reason requires divergence.

You MAY:
- Add new detail to the generative tier of established entities
- Deepen relationships and develop implied history
- Add sensory and atmospheric texture freely

You may NOT:
- Rename, reassign motivation, or change the disposition of established
  entities without an explicit story reason
- Introduce new named entities
- Contradict canonical details
- State that an NPC "always" or "never" does something not already
  established
`.trim(),

  embellishment: `
## NARRATOR PERMISSIONS — EMBELLISHMENT MODE

This move has a mechanical consequence. Narrate its texture.

You MUST:
- Focus on sensory, atmospheric, and emotional detail
- Stay grounded in the current scene

You may NOT:
- Introduce any named entity (person, ship, location, faction, creature)
- Introduce any new plot element or revelation
- Advance any story thread beyond the immediate consequence of this move

The narrator is a camera here, not a writer.
`.trim(),

};
```

---

## 9. Entity creation pipeline

Narration and entity record creation are **not fully independent or asynchronous**
for creation events. The coupling model depends on move type:

### Explicit creation moves (`make_a_connection`, strong/weak hit)

The dedicated NPC creation move has oracle seeding before narration (Section 7).
After narration is posted, extraction runs **synchronously** before the pipeline
continues. The draft card and the narration appear in chat at the same moment.
The GM confirms, edits, or dismisses before doing anything else.

On `make_a_connection` specifically, the entity is auto-created from the
narration without a confirmation step — this is the one unambiguous case where
creation was the explicit intent of the move. On a miss, no entity is created.

```
Oracle rolls → seeds injected → narrator called → narration posted
                                                        ↓ (synchronous)
                                               Extraction runs
                                                        ↓
                                          Draft card posted immediately
                                          (GM sees narration + draft together)
                                                        ↓ make_a_connection only
                                          Entity auto-created from narration text
```

### Other discovery-class moves

Extraction runs **asynchronously** after narration posts (~2 seconds). Draft
cards arrive shortly after. The GM is not blocked, but the card appears in the
same session context.

```
Narrator called → narration posted → pipeline continues
                        ↓ (async, ~2s)
               Extraction runs
                        ↓
              Draft card posted when complete
```

### Extraction prompt (Haiku, uncached)

```
You are analysing an Ironsworn: Starforged narration. Identify any NEW
named entities introduced that are not in the established entity list below.

ESTABLISHED ENTITIES (do not return these):
{comma-separated entity names from campaignState}

ENTITY TYPES TO DETECT:
- connection: named individual (NPC, person, AI)
- ship: named vessel or craft
- settlement: named community, station, outpost
- faction: named organisation, order, or power
- location: named specific place (derelict, vault, structure, site)
- creature: named or distinctly described creature type

Return:
{
  "entities": [
    {
      "type": string,
      "name": string,
      "description": string,   // 1-2 sentences from the narration
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Only return entities that are clearly named or distinctly typed.
Do NOT return generic references ("a guard", "the station", "some raiders").
Return an empty array if nothing new was introduced.

Narration:
{narrationText}
```

`low` confidence results are logged but do not generate draft cards. `medium`
and `high` generate draft cards.

### Draft entity card (GM-only)

```
◈ New Entities Detected

  [⬡ Connection] Kael — lean and battle-scarred, cold and calculating
  [⬢ Faction] The Iron Compact — referenced as "the salvagers' guild"

  [Create Selected ▾]   [Dismiss All]
```

`flags[MODULE_ID].draftEntityCard: true` — excluded from `isPlayerNarration()`.

Per entity:
- **Create** — entity record created from extracted description (canonical tier)
- **Edit** — lightweight inline form before creation
- **Dismiss** — adds name to `campaignState.dismissedEntities[]` (see Section 10)

---

## 10. dismissedEntities management

`campaignState.dismissedEntities` is a plain array of name strings. Names added
here are excluded from future extraction passes.

**Undo mechanism:** The Entity Panel settings tab (or a `!undismiss [name]`
chat command) displays the dismissed list and allows any entry to be removed.
This prevents a misclick permanently suppressing a significant entity.

```js
// Dismissal
campaignState.dismissedEntities.push(entityName);

// Undo (from Entity Panel settings tab or !undismiss command)
campaignState.dismissedEntities = campaignState.dismissedEntities
  .filter(n => n !== entityName);
```

---

## 11. Current location injection

The assembler always injects the current location entity card regardless of
relevance resolver results. This ensures the narrator has location context for
arrival narrations where the player hasn't named the settlement explicitly.

```js
// campaignState additions:
currentLocationId:   null,   // JournalEntry ID
currentLocationType: null,   // "settlement" | "location" | "planet"
```

**Setting the current location:**

```
!at Bleakhold           — set current location by name (matches entity records)
!at                     — clear current location
```

Also settable from the Entity Panel — each settlement/location has a "Set as
current location" button in its detail view.

**In the assembler:** Section 4 (current location) loads the entity record for
`currentLocationId` and formats it as an entity card. It is injected above the
relevance-matched entity cards. It counts against the entity card budget
(`maxEntityCardsInContext`).

---

## 12. Generative tier update (post-narration)

After interaction-class narration is posted, a second Haiku pass identifies
narrator-added details about known entities present in the scene and appends
them to those entities' generative tiers.

```js
/**
 * Identify narrator-added details about known entities in this narration
 * and append them to those entities' generative tiers.
 *
 * Runs for interaction-class moves with matched entities only.
 * Does NOT run for embellishment-class moves.
 * Runs asynchronously — does not block the pipeline.
 *
 * @param {string}   narrationText
 * @param {string[]} entityIds      — JournalEntry IDs of entities in this scene
 * @param {string}   sessionId
 * @param {number}   sessionNum
 * @returns {Promise<void>}
 */
export async function appendGenerativeTierUpdates(
  narrationText, entityIds, sessionId, sessionNum
)
```

### Tier update prompt (Haiku)

```
Given this narration and the following entity records, identify any new
detail the narrator added about each entity that is NOT already in the
record below. Only return genuinely new observations, not restatements.

{formatted entity records}

Return:
{
  "updates": [
    { "entityId": string, "detail": string }  // one sentence per detail
  ]
}

Narration: {narrationText}
```

---

## 13. Relevance resolver

### `src/context/relevanceResolver.js`

```js
/**
 * Identify which entity records are scene-relevant based on player narration,
 * and resolve hybrid move class.
 *
 * Phase 1: string matching against entity names (no API call).
 * Phase 2: Haiku classification for implicit references when no name match.
 *
 * @param {string} playerNarration
 * @param {string} moveId
 * @param {string} outcome
 * @param {Object} campaignState
 * @returns {Promise<RelevanceResult>}
 */
export async function resolveRelevance(playerNarration, moveId, outcome, campaignState)

/**
 * @typedef {Object} RelevanceResult
 * @property {string}   resolvedClass   — "discovery" | "interaction" | "embellishment"
 * @property {string[]} entityIds       — JournalEntry IDs of matched entities
 * @property {string[]} entityTypes     — corresponding types
 * @property {string[]} matchedNames    — names that triggered the match
 * @property {boolean}  needsClarification — true if implicit reference detected
 * @property {string}   referenceType   — "pronoun" | "role" | "possessive" | "none"
 */
```

---

## 14. Full narration pipeline (revised)

```
1.  Move resolved (resolver.js)
2.  Oracle rolls if applicable → resolution.oracleSeeds populated
3.  Relevance resolver runs:
      a. String matching against entity names
      b. If hybrid + no name match: Haiku classification call
4.  If needsClarification:
      → Clarification card posted (blocking)
      → campaignState.pendingClarification set
      → Pipeline pauses until player responds
      → On response: resolvedClass and entityIds updated
5.  Narrator class confirmed
6.  Assembler builds context packet:
      Section 0: Safety (exempt)
      Section 1: Narrator permissions (exempt)
      Section 2: Oracle seeds (when present)
      Section 3: World Truths
      Section 4: Current location card (when set)
      Section 5: Matched entity cards (up to maxEntityCardsInContext)
      Section 6: Progress tracks
      Section 7: Recent oracles
      Section 8: Session notes (dropped first)
      Section 9: Move outcome (exempt)
7.  Narrator called (Claude API)
8.  Narration posted to chat

9.  Post-narration passes:

    For explicit creation moves (make_a_connection hit, and others where
    discovery is unambiguous):
      → Extraction runs SYNCHRONOUSLY
      → Draft card posted at same time as narration
      → make_a_connection: entity auto-created from narration text

    For other discovery-class moves:
      → Extraction runs ASYNCHRONOUSLY (~2s)
      → Draft card posted when complete

    For interaction-class moves with matched entities:
      → Generative tier update runs ASYNCHRONOUSLY
      → Entity records updated silently, no chat card

    For embellishment-class moves:
      → No post-narration passes
```

---

## 15. New and modified files

### New files

```
src/context/relevanceResolver.js    — entity matching + hybrid class resolution
src/entities/entityExtractor.js     — extraction, tier update, draft card posting
src/entities/location.js            — location entity CRUD (same pattern as planet.js)
src/entities/creature.js            — creature entity CRUD (same pattern as planet.js)
```

### Modified files

```
src/schemas.js            — MOVES gains narratorClass; new entity schemas;
                            campaignState gains locationIds, creatureIds,
                            currentLocationId, currentLocationType,
                            dismissedEntities, pendingClarification
src/context/assembler.js  — revised section order; current location card;
                            entity cards replace connections count; token
                            budget raised to 1200
src/narration/narratorPrompt.js
                          — NARRATOR_PERMISSIONS; formatEntityCard();
                            oracle seeds injection; entity card injection
src/narration/narrator.js — relevance resolver call; clarification gate;
                            oracle seeds passthrough; post-narration passes
src/moves/resolver.js     — oracle seeding for applicable moves
src/ui/entityPanel.js     — generative tier UI; pin/promote/remove;
                            canonicalLocked toggle; "Set as current location"
                            button; location + creature types; dismissed
                            entities management tab
src/art/promptBuilder.js  — TYPE_STYLE additions for location + creature
lang/en.json              — labels for new entity types + generative tier UI
packs/help.json           — entity panel section (new types, generative tier,
                            current location, dismissal)
README.md                 — "Cost and API usage" section with token budget
                            documentation
```

---

## 16. Settings

```js
// World-scoped
"entityDiscoveryEnabled"        Boolean  true   // extraction after discovery moves
"generativeTierEnabled"         Boolean  true   // tier update after interaction moves
"draftEntityNotifications"      Boolean  true   // post GM-only draft entity cards
"relevanceResolverEnabled"      Boolean  true   // use relevance resolver
"hybridClarificationEnabled"    Boolean  true   // show clarification card for implicit refs
"maxEntityCardsInContext"        Number   3      // cap on entity cards per call
```

---

## 17. Cost estimate

Per narration call, additional costs beyond existing:

| Step | When | Model | Tokens | Cost |
|------|------|-------|--------|------|
| Relevance resolver (string match) | Every call | — | — | $0 |
| Hybrid classification | Hybrid moves, no name match (~25%) | Haiku | ~100 in / 20 out | ~$0.00006/call |
| Entity extraction | Discovery-class (~30%) | Haiku | ~200 in / 100 out | ~$0.00015/call |
| Generative tier update | Interaction with matches (~40%) | Haiku | ~300 in / 80 out | ~$0.00018/call |

Per session (20 moves): ~$0.004 additional. Negligible.

Increased input token budget (1,200 vs 400) adds ~$0.003/call on Sonnet.
This is documented in README.md.

---

## 18. Testing structure

### Unit tests — `tests/unit/relevanceResolver.test.js`

```
resolveRelevance — name matching
  ✓ returns matched entity ID when full name in narration
  ✓ matching is case-insensitive
  ✓ returns empty when no entity name match
  ✓ hybrid + name match → "interaction"
  ✓ hybrid + no match + hit → classification call fires
  ✓ hybrid + no match + miss → "embellishment" (no classification call)

buildNameIndex
  ✓ indexes by full name
  ✓ indexes by first word
  ✓ handles single-word names
  ✓ does not index dismissed entities

parseClassificationResponse
  ✓ impliedEntity true → needsClarification true
  ✓ impliedEntity false → needsClarification false
```

### Unit tests — `tests/unit/entityExtractor.test.js`

```
parseExtractionResponse
  ✓ parses valid JSON
  ✓ returns empty array for empty entities
  ✓ filters low-confidence results
  ✓ does not return names in established entity list
  ✓ does not return names in dismissedEntities

appendGenerativeTierUpdates
  ✓ appends new detail to entity generativeTier
  ✓ does not append if detail already present (deduplication)
  ✓ pinned entries persist past the 5-entry display limit

oracle seeding
  ✓ make_a_connection includes oracleSeeds in resolution
  ✓ gather_information does not include oracleSeeds
  ✓ explore_a_waypoint includes seeds only on strong hit with match
```

### Unit tests — `tests/unit/narratorPrompt.test.js` (additions)

```
NARRATOR_PERMISSIONS
  ✓ discovery block present and contains "You MAY introduce"
  ✓ interaction block present and contains "do not contradict"
  ✓ embellishment block present and contains "no new named entity"
  ✓ permissions appear after safety section, before world truths

formatEntityCard
  ✓ includes entity name and type label
  ✓ includes canonical fields
  ✓ includes generative tier entries (up to 5)
  ✓ pinned entries appear first
  ✓ omits generative tier section when tier is empty
  ✓ canonicalLocked: true → "do not contradict" label
  ✓ canonicalLocked: false → "established — prefer consistency" label

assembler — token budget
  ✓ assembled packet does not exceed 1200 tokens
  ✓ session notes are dropped before entity cards under budget pressure
  ✓ safety and permissions are never dropped
```

### Integration tests (Quench)

```
Narrator permissions — live Foundry
  ✓ discovery permission block appears in narrator system prompt
  ✓ interaction permission block appears when entity matched
  ✓ entity card appears in prompt when entity name in player narration

Clarification card
  ✓ hybrid move + implicit reference → clarification card posted
  ✓ selecting known entity → move resolves as interaction
  ✓ selecting "Someone new" → move resolves as discovery
  ✓ pendingClarification cleared after selection

Entity discovery pipeline
  ✓ make_a_connection strong hit → connection record created after narration
  ✓ oracle seeds appear in narrator prompt for make_a_connection
  ✓ discovery move extraction → draft card posted
  ✓ confirmed draft entity appears in entity panel
  ✓ dismissed entity name added to campaignState.dismissedEntities
  ✓ dismissed entity removed via Entity Panel undismiss

Current location
  ✓ !at [name] sets currentLocationId in campaignState
  ✓ current location card appears in narrator prompt when set
  ✓ !at (no args) clears currentLocationId

Generative tier — live entity
  ✓ appendGenerativeTierUpdates adds entry to generativeTier flag
  ✓ pinned entry appears first in narrator card
  ✓ promoted entry appears in entity description field
  ✓ removed entry absent from panel and prompt
```

---

## 19. Implementation order

**Phase 1 — Schema, new entity types, budget (no pipeline changes)**

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
11. Run `npm test` — all existing tests must pass

**Phase 2 — Narrator permissions and relevance resolver (no extraction yet)**

12. Add `NARRATOR_PERMISSIONS` to `narratorPrompt.js`
13. Add `formatEntityCard()` to `narratorPrompt.js`
14. Write `src/context/relevanceResolver.js` — string matching + Haiku classification
15. Update `assembler.js` — revised section order (Safety → Permissions → Seeds →
    World Truths → Current Location → Entity Cards → ...); entity cards replace
    connections count section; raise budget to 1,200
16. Update `narrator.js` — call resolver; inject permission block; pass oracle seeds
17. Add oracle seeding for applicable moves in `resolver.js`
18. Write `tests/unit/relevanceResolver.test.js`
19. Write additions to `tests/unit/narratorPrompt.test.js`
20. Run `npm test`, `npm run lint`
21. Confirm in live Foundry: permission block in prompt; entity cards for known
    entities; oracle seeds present for `make_a_connection`

**Phase 3 — Extraction, clarification, and generative tier**

22. Write `src/entities/entityExtractor.js` — extraction, tier update, draft card
23. Update `narrator.js` — clarification gate; synchronous extraction for creation
    moves; async extraction and tier update for others
24. Add clarification card posting and response handler to `index.js`
25. Add `make_a_connection` auto-creation from narration text
26. Add Entity Panel generative tier UI — collapsible, pin/promote/remove
27. Add `canonicalLocked` toggle to Entity Panel detail view
28. Add "Set as current location" button to settlement/location entity detail view
29. Add `!at` command to `createChatMessage` handler in `index.js`
30. Add dismissed entities management tab to Entity Panel
31. Write `tests/unit/entityExtractor.test.js`
32. Add Quench integration batch `starforged-companion.entityDiscovery`
33. Update `packs/help.json`
34. Update `docs/scope-index.md`
35. Run full test suite and lint

---

## 20. Design decisions

**Oracle seeds as narrator inspiration, not record seeds.** Oracle results
tell the narrator what to invent. They do not pre-populate entity records. The
narration is the source of truth. This ensures records and narration are always
consistent.

**Synchronous extraction only for unambiguous creation events.** Synchronous
extraction blocks pipeline continuation. It is reserved for moves where entity
creation was the explicit intent — `make_a_connection` on a hit. All other
discovery extraction is async. The GM is never blocked waiting for a Haiku call
unless the move was specifically about meeting someone new.

**`make_a_connection` auto-creates without confirmation.** The move explicitly
creates an NPC. Requiring confirmation would add friction to the one move
designed for this purpose. On a miss, no entity is created — the encounter did
not result in a connection.

**Blocking clarification for hybrid moves.** The clarification dialog pauses
the pipeline. This is the same UX as move confirmation, which players already
accept. The alternative — letting the narrator guess — produces the exact
consistency problem this scope is designed to solve.

**String matching before semantic matching.** The Haiku classification call only
fires for hybrid moves where no name match was found. It is a refinement, not the
primary mechanism. Most clear interactions involve named entities in the narration
("I confront Sable"). The classification handles pronouns and role references.

**Sector-creator entities arrive canonical.** Settlements, connections, and factions
created by the sector creator already arrive with `canonicalLocked: true` (fixed
in the pre-requisite commit). They are the most authoritatively defined entities
in the campaign and should never drift.

**Two tiers are not versioned history.** The generative tier is a flat list with
session attribution and pin support. It is readable and actionable, not an audit
log. Promoted entries are marked but retained so the GM can see the provenance
of canonical details.

**Pinning solves the recency problem.** Without pinning, the 5-entry display
limit means old-but-significant details drop off the narrator prompt over time.
Pinned entries are always included. The GM decides what is narratively invariant.
