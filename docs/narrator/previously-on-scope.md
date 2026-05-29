# Starforged Companion — "Previously On" Scope Document

✅ **COMPLETE** — session recap, campaign recap, auto-recap, and session-start context injection all implemented

## Session and campaign recap features

**Priority:** After scene interrogation  
**Dependency:** narrator.js, chronicle.js (from character management scope)  
**Sequence:** Session recap can be implemented before character management;
campaign recap depends on the chronicle being available.

---

## 1. Overview

Two distinct recap modes, both triggered via chat command or UI button:

**Session recap** — what happened in this session. Reads narration cards and
move results from the current session. Generated on demand. Useful at session
end or if a player joins mid-session and needs to catch up.

**Campaign recap** — the full story arc compressed. Reads the CharacterChronicle
(from the character management scope). Generated via Claude and cached. Useful
at the start of a new session to reorient everyone, and as a context injection
into the narrator's system prompt.

Both recaps post as styled chat cards and are optionally saveable to a journal.

---

## 2. Session recap

### Trigger

```
/recap session          — recap of the current session
/recap session 3        — recap of a specific session number
```

Or via a "Session Recap" button in the narrator panel.

### Data source

`game.messages.contents` filtered by `flags[MODULE_ID].sessionId`. This gives:
- All move result cards (move name, outcome, consequence)
- All narration cards (prose text)
- All scene query cards (question + response)

No Claude API call required for session recap — the data is already in structured
chat history. The recap is assembled by formatting the session's move/narration
pairs into a readable summary.

### Format

```
◈ Session Recap — Session {N}

{N} moves resolved:
• {moveName} → {outcome}: {oneLineSummary from narration}
• {moveName} → {outcome}: {oneLineSummary from narration}
...

{If strong hits: "Highlights: {count} strong hits."}
{If match: "A match was rolled — {moveContext}."}
```

The one-line summary is extracted from the narration card text — the first
sentence of the narrator's response. No Claude call needed.

### New function in `narrator.js`

```js
/**
 * Generate and post a session recap card.
 * @param {string|null} sessionId  — null = current session
 * @returns {Promise<void>}
 */
export async function postSessionRecap(sessionId = null)
```

---

## 3. Campaign recap

### Trigger

```
/recap campaign         — full campaign arc summary
/recap                  — same as /recap campaign
```

Or via a "Campaign Recap" button in the narrator panel.

### Data source

The CharacterChronicle (from `chronicle.js` in character management scope).
If the chronicle is not yet available (character management not implemented),
falls back to reading all narration cards across all sessions.

### Generation

Claude API call (Sonnet) — the chronicle is too large to format mechanically.

```
System prompt (minimal — this is a summarisation task, not narration):
  You are summarising a campaign journal for Ironsworn: Starforged.
  Write in second person for solo campaigns, third person for multiplayer.
  Be wry but respectful of what the players have accomplished.

User message:
  Here are the chronicle entries for this campaign:
  {all chronicle entries, oldest first}

  Write a campaign recap of 3–5 paragraphs covering:
  - How the campaign began and what the inciting situation was
  - The key relationships that have developed
  - The vows sworn and their current status
  - The most significant revelations
  - Where things stand now
```

### Caching

Campaign recap is cached in `campaignState.campaignRecapCache`:
```js
{
  text:        string,     // the generated recap prose
  generatedAt: ISO string,
  chronicleLength: number, // number of entries at generation time
}
```

Cache is invalidated when `chronicleLength` changes (new entries added).
On cache hit, the cached recap is posted immediately — no API call.
On cache miss, Claude generates it asynchronously and caches the result.

### Use as session opener

When a new session begins (detected via the `ready` hook on a fresh world
load after a gap), the campaign recap is automatically posted to chat as a
styled card if the setting is enabled. This orients players at the start
of each session without anyone needing to ask.

```js
// In index.js ready hook:
if (isNewSessionStart(campaignState)) {
  await postCampaignRecap(campaignState, { silent: false });
}

function isNewSessionStart(campaignState) {
  const lastSession = campaignState.lastSessionTimestamp;
  if (!lastSession) return false;
  const hoursSince = (Date.now() - new Date(lastSession)) / 3_600_000;
  return hoursSince > 4;  // gap of more than 4 hours = new session
}
```

---

## 4. New functions in `narrator.js`

```js
/**
 * Generate and post a session recap card.
 * No API call — assembled from structured chat history.
 * @param {string|null} sessionId
 * @returns {Promise<void>}
 */
export async function postSessionRecap(sessionId = null)

/**
 * Generate and post a campaign recap card.
 * Claude API call (Sonnet, cached). Posts immediately from cache if available.
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]  — ignore cache
 * @param {boolean} [options.silent]        — post without notifying
 * @returns {Promise<string>}               — the recap text
 */
export async function postCampaignRecap(campaignState, options = {})

/**
 * Get the current campaign recap text (from cache or generate).
 * Used by narratorPrompt.js to inject recap into session-start context.
 * @param {Object} campaignState
 * @returns {Promise<string>}
 */
export async function getCampaignRecap(campaignState)
```

---

## 5. Session context injection

The campaign recap becomes a new section in the narrator's system prompt
for the **first narration of a session**. After the first narration, the
standard context packet applies (the recap is already in the cache and the
Forge knows the background).

```
[CAMPAIGN RECAP — injected at session start only]
{getCampaignRecap(campaignState)}
```

This is injected between the World Truths section and the character state
section. It gives the narrator full campaign context at session start without
requiring the full chronicle in every packet.

---

## 6. Chat commands

Add to `isPlayerNarration()` exclusions and to the `createChatMessage` handler:

```
/recap              → postCampaignRecap()
/recap session      → postSessionRecap(currentSession)
/recap session N    → postSessionRecap(session N)
/recap campaign     → postCampaignRecap()
```

These are GM-only commands — players can read recaps but only the GM can
generate them (to prevent API call spam in multiplayer).

---

## 7. Chat card styles

**Session recap:** `.sf-recap-session-card`
```
◈ Session Recap
Session {N} — {date}
{formatted move list}
```

**Campaign recap:** `.sf-recap-campaign-card`
```
◈ Campaign Recap
{prose paragraphs}
[Refresh] button if GM
```

---

## 8. Settings

| Setting | Key | Scope | Default |
|---------|-----|-------|---------|
| Auto recap at session start | `autoRecapEnabled` | world | `true` |
| Session gap threshold (hours) | `sessionGapHours` | world | `4` |
| Recap on demand GM-only | `recapGmOnly` | world | `true` |

---

## 9. New `campaignState` fields

```js
{
  lastSessionTimestamp: ISO string,  // updated on world unload
  currentSessionId:     string,      // already present
  campaignRecapCache: {
    text:            string,
    generatedAt:     ISO string,
    chronicleLength: number,
  },
}
```

---

## 10. Testing structure

### Unit tests — `tests/unit/recap.test.js`

```
postSessionRecap — data assembly
  ✓ returns empty recap when no messages in session
  ✓ formats move cards correctly (name, outcome)
  ✓ extracts first sentence from narration cards
  ✓ counts strong hits, weak hits, misses correctly
  ✓ notes match rolls when present

isNewSessionStart()
  ✓ returns false when no previous session
  ✓ returns false when last session was < 4 hours ago
  ✓ returns true when gap exceeds threshold
  ✓ threshold is configurable

campaignRecapCache
  ✓ returns cached text when chronicle unchanged
  ✓ invalidates cache when chronicle grows
  ✓ forceRefresh bypasses cache
```

### Integration tests

```
Recap (live Foundry)
  ✓ /recap posts a campaign recap card to chat
  ✓ /recap session posts a session recap card
  ✓ Auto recap fires on session start when enabled
  ✓ Auto recap does not fire if last session < threshold
  ✓ Recap is posted as GM user
```

---

## 11. Implementation order

1. Add `lastSessionTimestamp` update to world unload hook in `index.js`
2. Add `sessionId` stamping to all narrator cards in `postNarrationCard()`
   (also needed by scene interrogation — coordinate with that scope)
3. Implement `postSessionRecap()` in `narrator.js`
4. Implement `postCampaignRecap()` and `getCampaignRecap()` in `narrator.js`
5. Add campaign recap cache to `CampaignStateSchema` in `schemas.js`
6. Add `isNewSessionStart()` and auto-recap to `index.js` ready hook
7. Add `/recap` command handling to `createChatMessage` hook
8. Add campaign recap injection to `narratorPrompt.js` for session-start calls
9. Add card CSS to `starforged-companion.css`
10. Add settings to `settingsPanel.js`
11. Write `tests/unit/recap.test.js`
12. Integration test in live Foundry
