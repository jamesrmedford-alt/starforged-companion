# Starforged Companion — Scene Interrogation Scope Document
## "Tell me more" — Free-form narrator queries

**Priority:** After narrator implementation is stable  
**Dependency:** narrator.js and narratorPrompt.js must be complete  
**Sequence:** Can be implemented in parallel with or before "Previously On"

---

## 1. Overview

Scene interrogation lets players ask the narrator free-form questions about
their surroundings, situation, or any aspect of the fiction without triggering
a move. The narrator responds with atmospheric description grounded in the
established world state and current scene context.

This is not a move. No dice are rolled. No momentum is spent. It is purely
a narration request — the player is asking the Forge to fill in detail.

**Trigger options (both supported):**

```
@scene What does the anomaly look like up close?
@scene Is there anything unusual about the derelict's hull markings?
@scene How does my character feel about what they just discovered?
```

Or via a "Describe scene" button in the narrator panel (see Section 5).

The `@scene` prefix is intercepted by `isPlayerNarration()` before it reaches
the move interpreter — it never goes through move identification. It routes
directly to a new `interrogateScene()` function in `narrator.js`.

---

## 2. How it differs from move narration

| | Move narration | Scene interrogation |
|--|--------------|-------------------|
| Trigger | Accepted move resolution | `@scene` prefix or button |
| Dice | Yes — move resolution | No |
| Context | Full 7-section packet | Full 7-section packet + player question |
| Response length | 3 sentences (configurable) | 2–4 sentences (configurable) |
| Chronicle entry | Yes — automated | Optional — player chooses |
| Chat card | `◈ Narrator` card | `◈ Scene` card (distinct style) |
| Safety | Always applied | Always applied |

---

## 3. New function in `narrator.js`

```js
/**
 * Respond to a free-form scene interrogation from the player.
 *
 * @param {string} question       — the player's question (stripped of @scene prefix)
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string} [options.actorId]      — requesting player's actor
 * @param {number} [options.tokenBudget]  — context packet budget
 * @returns {Promise<void>}               — posts narration card to chat
 */
export async function interrogateScene(question, campaignState, options = {})
```

**API call structure:**

```
Model:      narrationModel setting (Sonnet default)
Max tokens: 200 (scene descriptions should be tighter than move narration)
Caching:    same system prompt as narrateResolution() — shared cache

System prompt (shared with move narration — same cache hit):
  [1] Narrator role and voice
  [2] Safety configuration
  [3] World Truths summary
  [4] Active connections
  [5] Character state

User message (uncached):
  [6] Recent scene context — last 3 narration cards from this session
      (gives the narrator continuity without repeating the full chronicle)
  [7] Player question: "{question}"
  [8] Instruction: "Answer this question with 2–3 sentences of atmospheric
      description. Do not introduce new plot elements. Stay grounded in
      what has already been established."
```

**The constraint in instruction [8] is critical.** Scene interrogation should
illuminate what is already there, not invent new things. "What does the anomaly
look like?" should describe the anomaly established by the move narration. It
should not introduce a second anomaly or a new faction. The narrator is a
camera, not a writer, in this mode.

---

## 4. Chat hook changes in `index.js`

Add `@scene` to the intercept logic before the move interpretation check:

```js
// In isPlayerNarration() — add before the return true:
if (text.startsWith("@scene")) return false;  // handled separately

// New handler in registerChatHook():
Hooks.on("createChatMessage", async (message) => {
  const text = message.content?.trim() ?? "";

  if (isSceneQuery(message)) {
    const question = text.replace(/^@scene\s*/i, "").trim();
    if (!question) return;
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    await interrogateScene(question, campaignState, {
      actorId: message.author?.character?.id,
    });
    return;
  }

  if (!isPlayerNarration(message)) return;
  // ... existing pipeline
});

function isSceneQuery(message) {
  const text = message.content?.trim() ?? "";
  if (!text.startsWith("@scene")) return false;
  if (message.flags?.[MODULE_ID]?.sceneResponse) return false;
  const user = message.author ?? game.users?.get(message.user);
  return !user?.isGM;
}
```

---

## 5. New chat card style

A distinct card class `.sf-scene-card` in `starforged-companion.css`:

```
◈ Scene
[question text in muted italic]
[narrator response in normal prose]
```

Slightly different visual treatment from the move narration card — the question
is visible so players know what prompted the description.

---

## 6. Recent scene context

The user message includes the last 3 narration cards from the current session.
This is retrieved from `ChatMessage` history — not from the chronicle — because
it needs to reflect the immediate scene, not the broader story arc.

```js
function getRecentNarrationContext(sessionId, limit = 3) {
  return game.messages.contents
    .filter(m =>
      m.flags?.[MODULE_ID]?.narratorCard &&
      m.flags?.[MODULE_ID]?.sessionId === sessionId
    )
    .slice(-limit)
    .map(m => m.getFlag(MODULE_ID, "narrationText"))
    .filter(Boolean)
    .join("\n\n");
}
```

This requires `narrator.js` to store `narrationText` and `sessionId` as flags
on each narration card when it posts — a minor addition to the existing
`postNarrationCard()` function.

---

## 7. Settings

| Setting | Key | Scope | Default |
|---------|-----|-------|---------|
| Scene query enabled | `sceneQueryEnabled` | world | `true` |
| Scene response length | `sceneResponseLength` | world | `2` |
| Scene context cards | `sceneContextCards` | world | `3` |

---

## 8. Testing structure

### Unit tests — `tests/unit/sceneInterrogation.test.js`

```
isSceneQuery()
  ✓ returns true for "@scene what do I see?"
  ✓ returns false for regular narration
  ✓ returns false for messages flagged as sceneResponse
  ✓ returns false for GM messages
  ✓ case-insensitive match on @scene prefix

buildSceneUserMessage()
  ✓ strips @scene prefix from question
  ✓ includes recent narration context when present
  ✓ includes constraint instruction
  ✓ handles empty scene context gracefully

getRecentNarrationContext()
  ✓ returns last N narrator cards from current session
  ✓ excludes cards from other sessions
  ✓ returns empty string when no cards present
```

### Integration tests

```
Scene interrogation (live Foundry)
  ✓ "@scene ..." message posts a scene card to chat
  ✓ scene card does not appear when sceneQueryEnabled is false
  ✓ X-Card suppresses scene responses
  ✓ question text appears in the scene card
```

---

## 9. Implementation order

1. Add `narrationText` and `sessionId` flags to `postNarrationCard()` in `narrator.js`
2. Add `getRecentNarrationContext()` to `narrator.js`
3. Add `interrogateScene()` to `narrator.js`
4. Add `buildSceneUserMessage()` to `narratorPrompt.js`
5. Add `isSceneQuery()` to `index.js` and wire into `createChatMessage` hook
6. Add `.sf-scene-card` CSS to `starforged-companion.css`
7. Add settings to `settingsPanel.js`
8. Write `tests/unit/sceneInterrogation.test.js`
9. Integration test in live Foundry
