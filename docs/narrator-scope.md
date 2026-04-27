# Starforged Companion — Narrator Scope Document
## Remove Loremaster, implement direct Claude narration

**Status:** Successful Completion  
**Supersedes:** Loremaster integration approach  
**Reason:** Loremaster responds only to GM-account messages; cannot be triggered 
from player clients without a socket relay that is unreliable in single-browser 
solo play. Direct Claude narration removes the dependency entirely and provides 
full control over narrative voice, style, and context injection.

---

## 1. Overview of changes

### Remove
| Item | Location | Notes |
|------|----------|-------|
| `loremaster.js` | `src/loremaster.js` | Entire file deleted |
| Loremaster settings | `settingsPanel.js` | Module ID and flag path settings removed |
| Loremaster tab | `settingsPanel.js` | Replaced with Narrator tab |
| `checkLoremaster()` | `index.js` | Removed from ready hook |
| `registerLoremasterSettings()` | `index.js` | Removed from init hook |
| `attachLoremasterContext` import | `index.js` | Removed |
| `triggerLoremaster()` | `index.js` | Replaced by `narrateResolution()` |
| Socket relay | `index.js` | Removed — no longer needed |
| `game.socket.on` handler | `index.js` | Removed |
| `loremasterNotes` | `schemas.js` → `CharacterSchema` | Renamed `narratorNotes` |
| `relationships.recommends` | `module.json` | Remove foundry-ironsworn recommendation |

### Add
| Item | Location | Notes |
|------|----------|-------|
| `src/narration/narrator.js` | New file | Core narration module |
| `src/narration/narratorPrompt.js` | New file | System prompt builder |
| Narrator settings | `settingsPanel.js` | Model, style, length, custom instructions |
| Narration chat card CSS | `styles/starforged-companion.css` | Distinct from move result card |
| `narrateResolution()` | `index.js` | Replaces `triggerLoremaster()` |
| `narrationModel` setting | `index.js` / `settingsPanel.js` | Haiku vs Sonnet |

### Modify
| File | Change |
|------|--------|
| `index.js` | Remove Loremaster imports/hooks; add narrator import; replace pipeline step 7 |
| `settingsPanel.js` | Replace Loremaster tab with Narrator tab; add narrator settings |
| `schemas.js` | Rename `loremasterNotes` → `narratorNotes` in CharacterSchema |
| `context/assembler.js` | Rename section header "LOREMASTER CONTEXT" → "NARRATOR CONTEXT" if present |
| `file-structure.md` | Update to reflect new structure |
| `tests/unit/assembler.test.js` | Update any loremaster-specific assertions |

---

## 2. New files in detail

### `src/narration/narrator.js`

**Responsibility:** Call Claude API with the narration system prompt and return 
prose. Posts the narration as a styled chat card.

**Exports:**
```js
narrateResolution(resolution, contextPacket, campaignState, options)
  → Promise<string>    // the narration text

postNarrationCard(narrationText, resolution)
  → Promise<ChatMessage>
```

**API call structure:**
```
Model:      configurable (Haiku default, Sonnet option)
Max tokens: 300 (configurable 100–600)
Caching:    system prompt cached with cache_control: ephemeral

System prompt (cached — changes only when campaign state changes):
  [1] Narrative style instructions (tone, perspective, length, custom)
  [2] Safety configuration (from campaignState.safety)
  [3] World Truths summary (from campaignState.worldTruths)
  [4] Active connections summary (from campaignState.connectionIds)
  [5] Character description and notes (from active character)

User message (uncached — changes every call):
  [6] Move outcome (from resolution.loremasterContext)
  [7] Original player narration (from resolution.narration)
  [8] Instruction: "Narrate the consequence in {N} sentences..."
```

**Cache invalidation strategy:**
- System prompt is rebuilt and re-cached when world truths, connections, or 
  character notes change (these are session-stable)
- User message always uncached — changes every call
- Cache TTL is 5 minutes; moves within a session will stay warm

**Error handling:**
- API failure → post a fallback card showing the move outcome only, with a 
  note that narration failed; never block the move result
- Rate limit → retry once after 5s; then fallback card
- Empty response → fallback card

---

### `src/narration/narratorPrompt.js`

**Responsibility:** Build the complete system prompt from campaign state and 
narrator settings. Separate file keeps `narrator.js` focused on the API call.

**Exports:**
```js
buildNarratorSystemPrompt(campaignState, narratorSettings, character)
  → string

buildNarratorUserMessage(resolution, playerNarration, sentenceTarget)
  → string
```

**System prompt structure:**

```
## NARRATOR ROLE AND VOICE

You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to 
narrate the mechanical consequences of move outcomes as vivid, atmospheric prose 
that serves the story.

[STYLE BLOCK — from narratorSettings]
  Perspective: {resolved perspective — "you" for solo, character names for multiplayer}
  Tone: wry — knowing and slightly sardonic, aware of consequence without
        wallowing in it. The narrator has seen this before. It notices the
        irony. It does not editorialize, but it does not pretend not to notice.
  Length: {sentenceTarget} sentences
  Custom instructions: {GM text}

## SAFETY CONFIGURATION
[from formatSafetyContext()]

## WORLD TRUTHS
[from buildWorldTruthsSection()]

## ACTIVE CONNECTIONS
[from buildConnectionsSection()]

## CHARACTER
Name: {character.name}
Description: {character.description}
Notes for narrator: {character.narratorNotes}
Current state: Health {h}/5, Spirit {s}/5, Supply {sup}/5, Momentum {m}
```

---

## 3. Settings added to `settingsPanel.js`

### Narrator tab (replaces Loremaster tab)

| Setting | Key | Scope | Type | Default |
|---------|-----|-------|------|---------|
| Narration Model | `narrationModel` | world | String (choices) | `claude-sonnet-4-5-20250929` |
| Perspective | `narrationPerspective` | world | String (choices) | `auto` |
| Tone | `narrationTone` | world | String (choices) | `wry` |
| Length (sentences) | `narrationLength` | world | Number (1–6) | `3` |
| Custom instructions | `narrationInstructions` | world | String | `""` |
| Narration enabled | `narrationEnabled` | world | Boolean | `true` |
| Max tokens | `narrationMaxTokens` | world | Number | `300` |

**Model choices:**
```js
{
  "claude-haiku-4-5-20251001":   "Haiku 4.5 (fast, economical)",
  "claude-sonnet-4-5-20250929":  "Sonnet 4.5 (richer narration, recommended)",
}
```

**Perspective choices:**
```js
{
  "auto":         "Auto — second person for solo, third person for multiplayer (recommended)",
  "second_person": "Second person — always 'you' regardless of party size",
  "third_person":  "Third person — always character names regardless of party size",
}
```

**Tone choices:**
```js
{
  "wry":            "Wry — knowing, slightly sardonic, aware of the fiction's weight (default)",
  "grim_and_grounded": "Grim and grounded — sparse, consequential, Ironsworn-canonical",
  "operatic":       "Operatic — heightened stakes, vivid imagery",
  "noir":           "Noir — world-weary, shadowed, dry",
  "matter_of_fact": "Matter of fact — mechanical, precise, minimal flourish",
}
```

**Auto perspective logic:**
```js
// Resolved at narration time, not stored — always reflects current party size
function resolveNarrationPerspective(setting) {
  if (setting !== "auto") return setting;
  const playerCount = game.users.filter(u => u.active && !u.isGM).length;
  return playerCount === 1 ? "second_person" : "third_person";
}
```

---

## 4. Pipeline change in `index.js`

**Current step 7 (to remove):**
```js
await postMoveResult(resolution, interpretation._mischiefAside ?? null);
if (game.user.isGM) {
  await triggerLoremaster(packet.assembled);
} else {
  game.socket.emit(`module.${MODULE_ID}`, { type: "loremasterTrigger", ... });
}
```

**New step 7:**
```js
await postMoveResult(resolution, interpretation._mischiefAside ?? null);
await narrateResolution(resolution, packet, campaignState);
```

`narrateResolution()` calls Claude directly via `api-proxy.js` and posts the 
narration card. It runs on whichever client triggered the move — no GM account 
dependency, no socket relay.

---

## 5. Narration chat card

A new CSS class `.sf-narration-card` in `starforged-companion.css` distinct from 
`.sf-move-result`. Visual design:

- Background slightly lighter than the move result card
- Italic prose text
- Small "◈ Narrator" label in top-left
- No dice or mechanical information — prose only
- Falls below the move result card in chat order

---

## 6. Testing structure

### Unit tests — `tests/unit/narrator.test.js` (new file)

```
buildNarratorSystemPrompt
  ✓ returns a non-empty string
  ✓ includes NARRATOR ROLE section
  ✓ includes SAFETY CONFIGURATION
  ✓ includes world truths when present
  ✓ includes character name when present
  ✓ custom instructions appear in output
  ✓ wry tone description appears in style block
  ✓ second_person perspective uses "you" in style block
  ✓ third_person perspective uses character name in style block
  ✓ does not call fetch (pure string building)

resolveNarrationPerspective
  ✓ returns "second_person" for auto with 1 active player
  ✓ returns "third_person" for auto with 2+ active players
  ✓ returns "second_person" when explicitly set regardless of player count
  ✓ returns "third_person" when explicitly set regardless of player count

buildNarratorUserMessage
  ✓ includes move name
  ✓ includes outcome label
  ✓ includes player narration
  ✓ sentence target appears in instruction
  ✓ returns non-empty string for all outcome types (strong_hit, weak_hit, miss)

narratorSettings defaults
  ✓ all required settings have valid defaults
  ✓ model default is Sonnet
  ✓ length default is 3
```

### Unit tests — `tests/unit/assembler.test.js` (update)

- Remove any assertions that reference `loremasterContext` header text
- The assembler still builds the same packet; the packet is consumed by 
  `narratorPrompt.js` instead of being sent to Loremaster

### Integration tests — `tests/integration/narration.test.js` (new file, Quench)

```
Narration pipeline (live Foundry)
  ✓ narrateResolution() completes without error on a valid resolution
  ✓ a narration chat card appears in the chat log after narrateResolution()
  ✓ narration card does not appear if narrationEnabled is false
  ✓ fallback card appears when API key is invalid
  ✓ X-Card suppression prevents narration card from posting
```

### Existing tests unchanged
- `resolver.test.js` — no changes
- `truths.test.js` — no changes  
- `mischief.test.js` — no changes
- `assembler.test.js` — minor: remove loremaster header reference if present

---

## 7. Cost estimates

### Assumptions
- Session length: 3 hours
- Moves per session: ~20 (mix of adventure, suffer, quest)
- System prompt size: ~800 tokens (safety + truths + connections + character)
- User message size: ~150 tokens per call
- Narration response: ~120 tokens (3 sentences ≈ 300 characters)
- Cache hit rate: ~90% within a session (moves within 5-minute cache window)

### Per-call breakdown (with caching)

**Haiku 4.5:**
| Token type | Tokens | Rate | Cost |
|-----------|--------|------|------|
| System prompt — cache write (first call only) | 800 | $0.25/MTok | $0.0002 |
| System prompt — cache read (subsequent calls) | 800 | $0.03/MTok | $0.000024 |
| User message — uncached input | 150 | $0.80/MTok | $0.00012 |
| Output | 120 | $4.00/MTok | $0.00048 |
| **Per call (cached)** | | | **~$0.00062** |
| **Per call (cold)** | | | **~$0.00080** |

**Sonnet 4.5:**
| Token type | Tokens | Rate | Cost |
|-----------|--------|------|------|
| System prompt — cache write (first call only) | 800 | $3.75/MTok | $0.003 |
| System prompt — cache read (subsequent calls) | 800 | $0.30/MTok | $0.00024 |
| User message — uncached input | 150 | $3.00/MTok | $0.00045 |
| Output | 120 | $15.00/MTok | $0.0018 |
| **Per call (cached)** | | | **~$0.0025** |
| **Per call (cold)** | | | **~$0.0055** |

### Per-session cost (20 moves, 90% cache hit rate)

| Model | Cost |
|-------|------|
| Haiku 4.5 | ~$0.013 |
| Sonnet 4.5 | ~$0.051 |

### Per-session combined cost (interpretation + narration)

Interpretation already uses Haiku with caching. Adding Sonnet narration:

| Component | Model | Per session |
|-----------|-------|-------------|
| Move interpretation (existing) | Haiku 4.5 | ~$0.010 |
| Narration | Haiku 4.5 | ~$0.013 |
| Narration | Sonnet 4.5 | ~$0.051 |
| **Total with Haiku narration** | | **~$0.023** |
| **Total with Sonnet narration** | | **~$0.061** |

### Annual estimate (50 sessions/year)

| Configuration | Annual cost |
|---------------|-------------|
| Haiku interpretation + Haiku narration | ~$1.15 |
| Haiku interpretation + Sonnet narration | ~$3.05 |

Both are well within practical limits for solo and multiplayer campaigns alike.
Sonnet is the recommended default given the quality difference and negligible cost.

---

## 8. Implementation order

1. **Delete** `loremaster.js`
2. **Create** `src/narration/narratorPrompt.js`
3. **Create** `src/narration/narrator.js`
4. **Update** `settingsPanel.js` — replace Loremaster tab with Narrator tab, 
   add narrator setting registrations
5. **Update** `index.js` — remove Loremaster imports/hooks/socket; add 
   narrator import; replace pipeline step 7
6. **Update** `schemas.js` — rename `loremasterNotes` → `narratorNotes`
7. **Update** `styles/starforged-companion.css` — add narration card styles
8. **Update** `module.json` — remove recommends relationship
9. **Write** `tests/unit/narrator.test.js`
10. **Update** `tests/unit/assembler.test.js` — remove loremaster header assertion
11. **Update** `file-structure.md`
12. **Verify** CI passes
13. **Integration test** in live Foundry via Quench

Estimated Claude Code session: 1 focused session (~2 hours).
