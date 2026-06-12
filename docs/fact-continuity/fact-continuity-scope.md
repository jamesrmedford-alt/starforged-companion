# Starforged Companion — Fact Continuity Scope
## Two-ledger persistent memory for in-scene narrator consistency

**Status:** ✅ COMPLETE — core shipped (Phases A–G, including §20 ship positioning); Entity Panel "Active truths" collapsible and WJ Panel scene-truth filter row (§17 items 26–27) deferred to panel-polish work
**Priority:** Medium — addresses narrator drift observed in playtesting after NED + WJ shipped
**Dependencies:** Narrator (✅), Narrator Entity Discovery (✅), World Journal v2 (✅), Pacing (✅)
**Related:** World Truths (constitutional axioms — distinct concept; see §1.2)

> **2026-06-10 addendum (narrator memory, Cluster A).** After the v1.7.8
> playtest drift findings (F7/F8), the sidecar contract in §7 gained
> **required-emission rules** (NPC location/vessel/condition stateChanges;
> intent/stakes newTruths; an inciting-incident premise addendum) and an
> optional **`sceneFrame` key**; ledger scoping (§6) gained frame-`present`
> subjects; sidecar subjects now resolve against the full entity roster; and
> the paced/@scene paths run lexical relevance for entity cards. The
> **current authority** for the memory system is
> `docs/narrator/narrator-memory-architecture.md` (invariants:
> `rules/narrator-memory.md`); this scope remains the design record for the
> ledger/correction core.
>
> **Cluster C (same date):** §20 gained the position→token sync for
> fiction-side movement (`syncCommandVehicleTokenToPosition`), a REQUIRED
> sidecar emission when prose moves the ship, `finish_an_expedition`
> arrival wiring (with the new `expedition` provenance value), and
> tolerant destination-name matching in `inferShipPosition`.

> **Pre-drafting verification (surfaced per packet instructions).** The
> conceptual model in the source packet referenced `docs/private-channel-scope.md`
> as a structural template. That file does not exist in this repository; the
> scope structure below follows `docs/pacing-scope.md` alone. The packet's
> five pre-drafting assumptions resolve as follows:
>
> 1. ✅ The narrator emits prose only. `narrateResolution` /
>    `narratePacedInput` / `interrogateScene` in `src/narration/narrator.js`
>    do no structured parsing; only the move interpreter
>    (`parseInterpretation` in `src/moves/interpreter.js`) parses JSON.
> 2. ✅ `CampaignStateSchema` in `src/schemas.js` is the home for transient
>    runtime state and the right place for the State ledger. It already
>    holds `currentLocationId`, `pendingClarification`, `pacing.*`,
>    `dismissedEntities`, and similar scene/session-scoped fields.
> 3. ⚠️ **Partial.** The Lore Journal page schema
>    (`page.flags[MODULE_ID].loreEntry` — see `src/world/worldJournal.js`)
>    has `title`, `category`, `text`, `sessionId`, `moveId`, `confirmed`,
>    `narratorAsserted`, `annotations`, `promotedAt`. It does NOT have
>    explicit `subject` or `fact` fields. The scope adds them in §4 as a
>    backwards-compatible page-flag extension — no migration breakage.
> 4. ✅ NED entity IDs are stable Foundry document IDs, referenceable from
>    external storage. After PR #100 (Entity → Actor Migration, Phases 2–3),
>    `connection` / `faction` / `creature` IDs are `JournalEntry` IDs and
>    `ship` / `planet` / `settlement` / `location` IDs are `Actor` IDs. The
>    `src/entities/registry.js` dispatch shim hides the distinction from
>    every caller (see §4.2 and §13.1 for fact-continuity usage).
> 5. ✅ The contradiction surface exists: `applyStateTransition` in
>    `worldJournal.js` consumes `{ entryType, name, change, newValue }` and
>    posts a GM-only chat card on `change === "contradicted"`. The
>    consistency-check pass (§11) writes to the same surface.
>
> **One additional gap surfaced during verification.** The codebase has no
> formal scene-ID or scene-boundary signal. `@scene` resets the pacing
> density window (`resetRecentDensity()` in `src/pacing/router.js`) but no
> persistent `currentSceneId` field exists. The State ledger needs one;
> §5.2 defines it.

---

## 1. Overview

### 1.1 The problem

After NED and WJ shipped, the narrator stays consistent at two timescales:

- **Campaign timescale** — confirmed lore in WJ Section 3 cannot be
  contradicted; canonical entity fields in entity cards (Section 7) cannot
  be contradicted; faction attitudes and active threats are constrained
  by WJ Sections 4 and 9.
- **Cross-session timescale** — generative tier on entity records preserves
  narrator-asserted detail across sessions and feeds back into the prompt.

The remaining drift band is **within a scene**. Across three or four
exchanges in the same scene the narrator can:

- Re-describe an NPC's posture or affect inconsistently ("Vance leans on
  the rail" → two turns later "Vance is pacing").
- Forget a fact it asserted two turns ago that has not yet been promoted
  to canonical lore ("the cargo crates are unmarked" → next narration
  describes their stencilled markings).
- Resolve sensory state that should have persisted (the lights flickered
  red — three exchanges later they are described as steady without any
  cause given).

None of these reach the threshold for a WJ lore entry, so WJ does not
catch them. None of them are about entity-canonical facts, so the
entity-card pipeline does not catch them. They are **granular case law
accumulated during a scene** — and we have no representation for it.

### 1.2 The two ledgers

This scope introduces two new structures **on top of** existing systems —
no replacement, no parallel pipelines for facts that WJ already owns.

| Ledger | Mutability | Scope | Examples |
|---|---|---|---|
| **Truths** | Immutable, append-only | Persists; entity-scoped truths migrate to the entity record; scene-scoped truths archive | "Vance walks with a slight limp." "Kira's mother died in the Founding." |
| **State** | Mutable, supersede-on-update | Scene-scoped; discarded on scene end | "The lights are flickering red." "Vance is sitting." "The cargo bay door is closed." |

**World Truths** (the 14 setting axioms generated at world creation,
viewed via `!truths`, summarised in the narrator system prompt by
`buildCampaignTruthsBlock`) are a **distinct concept**. They are
constitutional axioms about the campaign universe. The truths ledger is
granular case law accumulated during play. Both coexist. Both are pasted
into the narrator context. They never merge.

### 1.3 The mechanism, end to end

1. The narrator emits prose **plus a fenced JSON sidecar** at the end of
   the response (§7). The sidecar declares newly-asserted truths and any
   state changes about the scene.
2. The companion module parses the sidecar and writes to the two ledgers
   (§8). Updates are derived from the sidecar, not from re-parsing prose.
3. On the next narrator call, the assembler pastes the relevant ledger
   contents **verbatim** into the context packet as new Section 6.5
   (between current location and entity cards). The narrator is told
   that prior truths are binding.
4. A correction affordance (button on narrator cards, §10) lets the
   player or GM strike a wrong truth or override a state value without
   waiting for end-of-scene editorial.
5. An optional consistency-check Haiku pass (§11) runs after narration,
   off by default, and writes auto-detected contradictions to the
   existing WJ contradiction surface.

### 1.4 Drift-prevention layers in order of cost

| Layer | Cost | Default |
|---|---|---|
| Ledger pasted verbatim into context | Free (tokens only) | On |
| Structured-output sidecar discipline | Marginal (output tokens) | On |
| Player/GM correction button on cards | UI-only | On |
| Optional consistency-check Haiku pass | One extra Haiku call/turn | **Off** |

---

## 2. User experience

### 2.1 Default flow — invisible to the player

Player narrates as normal. The narrator responds in prose. Nothing
visually changes; the sidecar is parsed and stripped before the chat
card is posted. On the next turn the narrator reads the ledger and
honours it. Players notice only that the narrator stops contradicting
itself.

### 2.2 Correction affordance

Every narrator card grows a small footer:

```
   📋 Correct a fact
```

Clicking opens a DialogV2 listing the truths and state values currently
on the ledger for entities present in this scene plus the scene itself:

```
   Which fact is wrong?

   [ ] Vance — Walks with a slight limp                 (truth, session 5)
   [ ] Vance — currently sitting                        (state)
   [ ] scene.lighting — flickering red                  (state)
   [ ] cargo bay — Door is closed                       (state)

   Correction (optional):
   _________________________________________________

   [Strike]   [Replace with correction]   [Cancel]
```

- **Strike** — removes the entry. If it is a truth, marks the truth as
  retracted (kept in history with a strike-through label, not deleted —
  audit trail).
- **Replace with correction** — strikes the original entry and appends
  the correction as a new ledger entry attributed to the corrector.

The button surfaces on **every narrator card** (move-resolution
narration, paced narrative, scene interrogation responses). It does not
appear on move-confirmation cards, scene-response cards posted by the
GM directly, or system cards.

### 2.3 Scene end

A scene ends when:
- `@scene` is used (next call is a new scene moment).
- The session ends.
- The GM uses `!scene end` (new — see §13).

On scene end:
- State ledger is **discarded** (always transient).
- Entity-scoped truths **migrate** to the relevant entity's generative
  tier (existing NED structure — same flag, same UI).
- Free-text-subject and scene-scoped truths **archive** to the WJ Lore
  journal with `narratorAsserted: true` and a synthetic title (`"Scene
  truth: <fact>"`) plus a scene-ID tag in the entry annotations.

The player sees this only if a GM-only summary card is enabled
(`factContinuityShowSceneEndSummary` setting, default off).

### 2.4 GM panel

The Entity Panel grows a new collapsible "Active truths" section per
entity that lists the entity's generative-tier entries **plus** any
in-scene truths currently asserted about that entity but not yet
migrated. Strike/promote/pin actions reuse the existing generative-tier
UI from NED §3.

The WJ panel grows a row in the Lore tab for archived scene truths,
filterable by scene ID.

---

## 3. New file(s) — code structure

```
src/factContinuity/
  ledgers.js              — Truths and State ledger CRUD; subject resolution
  sidecarParser.js        — Extract and validate the JSON sidecar from narrator text
  sidecarPrompt.js        — Sidecar block injected into narrator system prompt
  correctionDialog.js     — DialogV2 for the correction affordance
  consistencyCheck.js     — Optional Haiku pass; writes to WJ contradiction surface
  sceneLifecycle.js       — Scene start/end transitions; migration to entity records / WJ archive
```

**Modified files:**

```
src/schemas.js            — CampaignStateSchema gains currentSceneId, sceneTruths,
                            sceneState; LoreEntry page-flag schema gains optional
                            subject/fact/sceneId fields
src/narration/narratorPrompt.js
                          — buildLedgerBlock(); appendSidecarInstruction();
                            wired into buildNarratorSystemPrompt /
                            buildNarratorUserMessage
src/narration/narrator.js — strip sidecar from posted text; route parsed sidecar
                            to ledgers; render correction button on the card
src/context/assembler.js  — new Section 6.5 (active ledger for scene subjects)
src/index.js              — !scene end, !truth, !state commands; correction handler;
                            wire scene lifecycle into @scene and session end
src/ui/entityPanel.js     — "Active truths" section per entity
src/world/worldJournalPanel.js
                          — archived-scene-truth row in Lore tab
src/help/helpJournal.js   — new commands documented in CONTENT_VERSION bump
packs/help/*              — auto-rebuilt from helpJournal.js
```

No new file replaces or shadows an existing one. `src/world/worldJournal.js`
gains one new helper (`archiveSceneTruth`) and is not otherwise touched.

---

## 4. Truths ledger — schema and storage

### 4.1 In-memory shape

```js
campaignState.sceneTruths = [
  {
    id:        "tr-3f9c…",            // crypto.randomUUID()
    subject:   { kind: "entity", entityId: "JournalEntry.x7…", entityType: "connection" }
                || { kind: "text",   text: "Covenant officer" }
                || { kind: "scene",  sceneId: "sc-…" },
    fact:      "Walks with a slight limp",
    sessionId: "ssn-…",
    sceneId:   "sc-…",
    moveId:    "compel",               // null when fact came from @scene or paced narrative
    source:    "narrator_sidecar"      // | "manual_truth_cmd" | "promoted_state"
    asserter:  "narrator",             // | "gm" | "player"
    createdAt: 1738201200000,
    retracted: false,                   // strike-through; entry kept for audit
    retractedBy: null,
    retractedAt: null,
    correctedTo: null,                  // ID of replacement entry, when applicable
    migratedTo:  null,                  // populated on scene end:
                                        //   { kind: "entityGenerativeTier", entityId, tierEntryId }
                                        //   { kind: "worldJournalLore",     loreEntryId }
  },
  …
]
```

`sceneTruths` is append-only **for the active scene**. Entries are not
deleted from the array on retraction or migration — they are flagged.
The array is cleared on scene end **after migration completes**.

### 4.2 Persisted storage on migration

| Subject kind | On scene end | Storage |
|---|---|---|
| `entity` | Append to that entity's `generativeTier` array | Existing NED structure on the entity's host-document flags — `JournalEntryPage` for connection/faction/creature; native `Actor` for ship/planet/settlement/location post-PR #100. The Phase C `appendMigratedTruthToTier` helper in `src/entities/entityExtractor.js` dispatches via `src/entities/registry.js` so the same call works for either host. |
| `text` (free-text subject) | Archive to WJ Lore | `recordLoreDiscovery` with synthetic title `"<subject>: <fact>"`, `narratorAsserted: true`, the scene ID tagged in annotations |
| `scene` (scene-scoped) | Archive to WJ Lore | Same as `text`, prefix title with `"Scene <sceneId>: "` |

Entity-scoped tier entries migrated from a truth carry `source:
"scene_truth_migration"` so the entity panel can show provenance.

### 4.3 Subject resolution

`resolveSubject(subjectRef, campaignState)` in `ledgers.js`:

- If `subjectRef` is a string matching an existing entity by name (full
  or first-word, case-insensitive, reusing the `relevanceResolver.js`
  `buildNameIndex` machinery) → returns `{ kind: "entity", entityId,
  entityType }`.
- Else if string starts with `scene.` → `{ kind: "scene", sceneId:
  campaignState.currentSceneId }` (the part after `scene.` is the
  attribute name on the scene subject, stored in the fact text).
- Else → `{ kind: "text", text: subjectRef }`.

A separate `promoteTextSubject(textValue, entityId)` is exposed so the
GM (via Entity Panel) can promote a free-text subject to an entity ID
after the entity has been created. All ledger entries with the matching
text subject have their `subject` rewritten in-place.

### 4.4 LoreEntry schema extension (back-compatible)

`page.flags[MODULE_ID].loreEntry` gains three optional fields:

```js
subject:   string | null,    // e.g. "Vance", "Covenant officer", "scene"
fact:      string | null,    // the fact text, when distinct from title
sceneId:   string | null,    // the originating scene ID for archived scene truths
```

Existing entries leave these `null`. No migration runs. The assembler's
existing `getConfirmedLore` / `getNarratorAssertedLore` continue to
return entries unchanged; archived scene truths surface there
identically to manual entries.

---

## 5. State ledger — schema and storage

### 5.1 In-memory shape

```js
campaignState.sceneState = {
  bySubject: {
    // key: stable subject key (entity ID or normalised text)
    "JournalEntry.x7…": [
      { attribute: "posture",  value: "sitting", updatedAt: 1738… },
      { attribute: "location", value: "the bar at Bleakhold", updatedAt: 1738… },
    ],
    "scene": [
      { attribute: "lighting", value: "flickering red", updatedAt: 1738… },
      { attribute: "weather",  value: "still",          updatedAt: 1738… },
    ],
    "cargo bay": [
      { attribute: "door",     value: "closed",         updatedAt: 1738… },
    ],
  },
  sceneId: "sc-…",   // mirrors campaignState.currentSceneId; sanity tag
}
```

Updates are **supersede-on-attribute** — a sidecar that says `{ subject:
"scene", attribute: "lighting", value: "stable" }` overwrites the prior
`lighting` value for that subject. The ledger does **not** retain
previous state values — that is the point of being a state ledger, not
a state log.

State values are scoped to the active scene by definition; subjects do
not carry state across scene boundaries even if they persist (an NPC's
posture from the previous scene does not bleed forward — only their
truths do).

### 5.2 Scene ID

`campaignState.currentSceneId` is added (string, nullable). Lifecycle:

- Cleared on session start.
- Assigned a fresh `sc-<crypto.randomUUID().slice(0,8)>` on every
  `@scene` intercept (existing `isSceneQuery` path in `index.js`) AND
  on the first narrator call of a session if still null AND on
  `!scene start`.
- Used to tag every sidecar-derived ledger entry.
- Cleared by `!scene end`. The next narrator call assigns a new one.

The pacing density buffer continues to reset on `@scene` via the
existing `resetRecentDensity()` call. No coupling between the two.

---

## 6. Narrator context packet — ledger inclusion

The full assembler section order, with the new section inserted:

```
Section 0:    Safety                            (exempt, always first)
Section 1:    Narrator permissions              (exempt, always second)
Section 2:    Oracle seeds                      (when present, uncached)
Section 3:    Confirmed lore                    (WJ — never dropped)
Section 4:    Active threats                    (WJ — immediate never dropped)
Section 5:    World Truths                      (constitutional)
Section 6:    Current location card             (when set)
Section 6.5:  ACTIVE SCENE LEDGER               ← NEW (this scope)
Section 7:    Matched entity cards
Section 8:    Progress tracks
Section 9:    Faction landscape
Section 10:   Recent WJ discoveries
Section 11:   Oracle history
Section 12:   Session notes                     (dropped first)
Section 13:   Move outcome                      (exempt, always last)
```

Section 6.5 is built by `buildLedgerBlock(campaignState, matchedEntityIds)`
in `narratorPrompt.js`:

```
## ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE

You established the following facts during this scene. They are
binding. Subsequent narration must honour them and may add to them,
but must not contradict them.

SHIP POSITION (the command vehicle Solace):       ← when set; see §20
  Sector:          Bleakhold (Outlands)
  Near planet:     Vesta IV
  Near settlement: Bleakhold Station

TRUTHS:
  Vance — Walks with a slight limp
  Vance — Was a Covenant marine before the Founding
  Covenant officer — Speaks with a Bleakhold accent
  scene — The wind has died down outside

CURRENT STATE (right now in this scene):
  Vance — posture: sitting at the corner table
  scene — lighting: flickering red
  scene — weather: still
  cargo bay — door: closed
```

**Filtering.** Only truths and state for subjects in scope this turn are
included. Scope is the union of:
- The current location's subject (always).
- Matched entity IDs from the relevance resolver (always).
- Scene-scoped (`subject.kind === "scene"`) entries (always).
- Free-text subjects mentioned in the player's narration this turn
  (string-matched against the ledger's text-subject keys).

This keeps the block focused — a 12-NPC campaign does not flood the
prompt with state for NPCs not in this scene.

**Budget.** Section 6.5 sits between the lore/threats high-priority
band and the entity cards. It is **never dropped** for entity-scoped
truths but **may truncate free-text and scene state** under budget
pressure. The drop order under pressure is appended to the existing
assembler tier:

```
12 → 10 → 9 → 11 → 8 → 7(partial) → 6.5(state only) → 4(looming) → 3(asserted) → 6.5(truths) → 6.5(ship position) — never dropped
```

Truths are treated with the same priority as confirmed lore: never
dropped. State is treated as faction landscape priority. Ship position
(§20) is treated as confirmed-lore tier: never dropped.

**Token estimate.** Typical scene: ~10–20 truths and ~5–10 state
values across all subjects. ~250–400 tokens. Well within the 1,200
budget given existing slack.

---

## 7. Narrator output — structured sidecar format

The narrator system prompt grows a new section (`appendSidecarInstruction`
in `narratorPrompt.js`):

```
## RESPONSE FORMAT — MANDATORY SIDECAR

Respond with prose followed by a single fenced JSON code block, in this
exact shape:

   <your prose narration here, no JSON inside the prose>

   ```json
   {
     "newTruths": [
       { "subject": "Vance", "fact": "Walks with a slight limp" }
     ],
     "stateChanges": [
       { "subject": "scene",    "attribute": "lighting", "value": "stable" },
       { "subject": "cargo bay","attribute": "door",     "value": "open" }
     ]
   }
   ```

The JSON block MUST be present. Both arrays MAY be empty.

Rules:
- A "newTruth" is something binding — a fact that, if asserted again
  later, must not change. Use it for established physical traits, named
  history, declared backstory.
- A "stateChange" is what's true right now. Use it for posture, mood,
  visible state, door positions, lighting, weather. These supersede
  prior state for the same subject + attribute.
- A subject is the name as it appears in the scene. If the subject is
  the scene itself (lighting, weather, ambient sound) use "scene".
- The "ship" subject is reserved for the player's command vehicle. A
  stateChange like `{ "subject": "ship", "attribute": "position",
  "value": "Vesta IV" }` is recognised and updates the ship's
  persistent position (see §20). Use it only when narration actually
  moves the ship.
- Do not declare a truth that contradicts the ACTIVE SCENE block. If you
  must walk one back, the player or GM will retract it via the
  correction affordance.
```

### 7.1 Why a fenced JSON block, not inline tags

The move interpreter already uses raw JSON output (`parseInterpretation`)
without an inline-tag detour. Reusing the same pattern keeps parsing
consistent across modules and avoids coupling the prose itself to
ledger updates. See §18 Q6 for the alternative considered.

### 7.2 Failure modes

| Symptom | Handling |
|---|---|
| No sidecar block found | Post narration verbatim; log a warning; do not update ledgers. |
| Sidecar block present but JSON malformed | Same as above; log the raw block for debugging. |
| Sidecar references subjects with no scope match | Truths still recorded — the player named someone we don't have a card for, which is the point of free-text subjects. |
| Sidecar declares a truth that contradicts an existing truth | Recorded as-is; the consistency-check pass (§11), if enabled, flags it. Manual override remains the GM's call. |
| Sidecar arrives without prose | Treat as failure; post fallback card; do not record. |
| Sidecar truncated mid-JSON by `maxTokens` (opening `` ```json `` fence but no closing `` ``` ``) | Strip from the opening fence forward in `extractSidecar` so the partial JSON does not bleed into the chat card. Log a parseError with "truncated by maxTokens" hint; do not apply partial data to the ledger. The narrator caller adds `SIDECAR_TOKEN_HEADROOM = 300` to every `maxTokens` budget when fact-continuity is enabled, so this should be rare — the defensive strip is the safety net for unusually long narrations. (Bug observed on Forge with v1.3.0; fix in `src/factContinuity/sidecarParser.js` + `narrator.js maxTokensWithSidecar`.) |

Failure must not block the move pipeline. The narrator's prose is the
contract with the player; ledger updates are best-effort downstream of
posting.

---

## 8. Ledger update pipeline (from sidecar → storage)

```
Narrator API response arrives
   ↓
sidecarParser.extractSidecar(rawText)
   → { prose, sidecar | null, parseError | null }
   ↓
narrator.js posts prose to chat
   ↓
   (asynchronous, non-blocking)
   ↓
ledgers.applySidecar(sidecar, {
  campaignState, sessionId, sceneId, moveId, asserter: "narrator",
})
   ↓
   for each newTruth:
     subject = resolveSubject(t.subject, campaignState)
     campaignState.sceneTruths.push({ ... })
   for each stateChange:
     key = subjectKey(resolveSubject(c.subject, campaignState))
     campaignState.sceneState.bySubject[key] ??= []
     replace-or-append on attribute
   ↓
write campaignState back via game.settings.set (GM-gated as today)
```

**GM gating.** Persisted writes go through the same GM-gate pattern as
the existing WJ pipeline. On a player client the sidecar parse runs and
the result is forwarded via Foundry socket to the GM client, which
performs the actual `game.settings.set`. The pattern mirrors how
`recordLoreDiscovery` is invoked today via the combined detection pass
(`runCombinedDetectionPass` in `entityExtractor.js`).

**Idempotency.** A sidecar parsed twice (e.g. on rehydration after a
client reconnect) must not double-write. The narrator card's
`flags[MODULE_ID].factContinuity = { sidecarApplied: true, ledgerEntryIds:
[…] }` is set after first apply; subsequent applies short-circuit.

---

## 9. Scene-transition behaviour

`sceneLifecycle.js` exposes:

```js
export async function startScene(campaignState, { reason })
export async function endScene(campaignState, { reason })
```

### 9.1 startScene

Called by:
- The `@scene` intercept in `index.js` (after the existing
  `resetRecentDensity()` call).
- The first narration of a session, if `currentSceneId` is null.
- `!scene start` (GM-only manual control).

Effects:
- Assigns `currentSceneId = "sc-" + crypto.randomUUID().slice(0,8)`.
- Truths and state ledgers MUST be empty at this point — if they are
  not, that indicates an aborted prior scene; `endScene` is invoked
  with `{ reason: "implicit_due_to_new_scene" }` first to flush.

### 9.2 endScene

Called by:
- `!scene end` (GM-only).
- `startScene` when the previous scene wasn't cleanly ended.
- Session end (the existing close-session hook in `index.js`).

Effects, in order:

1. **Migrate entity-scoped truths** to entity generative tiers. For each
   `subject.kind === "entity"` truth not already retracted: append a
   generativeTier entry to that entity's record with `source:
   "scene_truth_migration"`, `pinned: false`, `promoted: false`, and
   the original `sessionId` / `sessionNum`. Mark the ledger entry's
   `migratedTo`.
2. **Archive free-text and scene-scoped truths** to the WJ Lore journal
   via a new `archiveSceneTruth(entry, campaignState)` helper. The
   helper composes:
   ```js
   recordLoreDiscovery(syntheticTitle, {
     category:         "other",
     text:             entry.fact,
     subject:          entry.subject.kind === "scene" ? "scene" : entry.subject.text,
     fact:             entry.fact,
     sceneId:          entry.sceneId,
     narratorAsserted: true,
     confirmed:        false,
     sessionId:        entry.sessionId,
     moveId:           entry.moveId,
   }, campaignState);
   ```
3. **Discard state** — `campaignState.sceneState = { bySubject: {},
   sceneId: null }`.
4. **Discard active truths array** — `campaignState.sceneTruths = []`.
5. **Clear** `campaignState.currentSceneId = null`.
6. Optionally post the GM-only scene-end summary card (setting-gated).

### 9.3 New-scene pre-population

On the next narrator call after a scene end, the assembler reads the
generative tier from any in-scope entity record — which is the existing
NED behaviour. No new code path is needed for entity-scoped truths to
"pre-populate" the next scene: they are already there, in the entity
card via the NED pipeline.

Free-text and scene-scoped truths archived to WJ remain accessible
through normal WJ surfaces (Recent Discoveries section if same session,
narrator-asserted lore Section 3b otherwise), but are no longer in the
active scene ledger. That is the intended behaviour — they are no
longer "in scope right now" — they are part of campaign memory.

---

## 10. Correction affordance

`src/factContinuity/correctionDialog.js` exposes:

```js
export async function openCorrectionDialog(message)
```

`message` is the narrator card. The dialog uses `DialogV2` (CLAUDE.md
requires this in v13). It reads the active scene ledger filtered to
subjects relevant to the card's `flags[MODULE_ID].matchedEntityIds` plus
all scene-scoped entries.

### 10.1 Permissions

| Actor | Strike | Replace | Strike state | Replace state |
|---|---|---|---|---|
| GM | ✓ | ✓ | ✓ | ✓ |
| Player (any) | ✓ on facts where `asserter !== "gm"` | ✓ same condition | ✓ | ✓ |

A truth asserted by the GM (via `!truth` or the panel) cannot be
silently struck by a player. This is the only permission asymmetry.

### 10.2 The button

Added to the narrator card template in `narrator.js` (around the
existing card-footer assembly). HTML structure:

```html
<div class="sf-narrator-card__footer">
  <button class="sf-correct-fact" data-message-id="…" aria-label="Correct a fact">
    <i class="fas fa-list-check"></i> Correct a fact
  </button>
</div>
```

Listener attached via the existing two-hook pattern (see CLAUDE.md
"renderSceneControls" template — same pattern applies for chat-message
re-renders via `renderChatMessage` / `renderChatMessageHTML`). Click →
`openCorrectionDialog(message)`.

### 10.3 Backing commands

The dialog is the primary affordance. Two text commands are added for
parity and accessibility (see §18 Q4):

```
!truth strike <id-prefix>
!truth set <subject> <fact>
!state strike <subject> <attribute>
!state set <subject> <attribute>=<value>
```

`!truth set` is the explicit-GM-assertion path — bypasses the narrator
entirely. `<id-prefix>` is the first 6 chars of a truth ID, dispayed in
the dialog list when uniqueness ambiguity would otherwise force exact
matching.

---

## 11. Optional consistency-check pass

`src/factContinuity/consistencyCheck.js` runs **after** narration is
posted and **after** the sidecar ledger update has completed.
Off by default (`factContinuityConsistencyCheck` setting, see §12).

### 11.1 Prompt

Haiku, ~250-token output cap, no caching (one-shot per call):

```
You are auditing an Ironsworn: Starforged narrator response for
internal consistency against the binding truths and current state of
the active scene. Return JSON only.

ACTIVE SCENE TRUTHS:
{verbatim Section 6.5 truths list}

ACTIVE SCENE STATE:
{verbatim Section 6.5 state list}

NARRATION:
{prose only — sidecar already stripped}

Return:
{
  "contradictions": [
    { "subject": string, "violated": string, "evidence": string,
      "kind": "truth" | "state", "confidence": "high" | "medium" | "low" }
  ]
}

Return an empty array if the narration honours the scene ledger.
Do NOT return contradictions for facts not in the ledger above — your
job is consistency with prior assertions, not plausibility judgement.
```

### 11.2 Routing — uses the existing contradiction surface

For each `confidence: "high"` contradiction, the pass calls:

```js
applyStateTransition({
  entryType: "factContinuity",         // new value accepted by applyStateTransition
  name:     <subject>,
  change:   "contradicted",
  newValue: <evidence excerpt>,
}, campaignState);
```

`applyStateTransition` already posts the GM-only "◈ Narrative Review"
card on `change === "contradicted"`. The card grows a third button
"Retract the offending fact" which, when clicked, opens the correction
dialog pre-filled with the relevant ledger entry. No new surface, no
new card layout — only one extra button on the existing one.

`medium` and `low` confidence results are logged but not surfaced.
Telemetry can be used to tune the threshold after playtesting.

### 11.3 Why an option, not mandatory

A Haiku consistency call per narration is roughly +$0.0004/call and
adds 200–500ms of latency. For a campaign that is not seeing drift, it
is unnecessary overhead. For one that is, it surfaces violations
without requiring the player or GM to spot them.

The setting is exposed in the Companion Settings panel as
"Consistency check (experimental)" with a one-line explainer that
points to telemetry.

---

## 12. Settings

```js
"factContinuityEnabled"                 Boolean  true
"factContinuityLedgerInContext"         Boolean  true    // §6.5 in assembler
"factContinuitySidecarRequired"         Boolean  true    // strict-fail on missing sidecar
"factContinuityConsistencyCheck"        Boolean  false   // optional Haiku pass (§11)
"factContinuityShowSceneEndSummary"     Boolean  false   // GM-only summary card on scene end
"factContinuityCorrectionButton"        Boolean  true    // button on narrator cards
"factContinuityMaxLedgerTokens"         Number   400     // soft cap for Section 6.5
"factContinuityShipPositioning"         Boolean  true    // §20 master toggle
"factContinuityShipAutoMoveOnCourse"    Boolean  true    // §20.4 set_a_course updates ship.position
"factContinuityShipTokenEnabled"        Boolean  true    // §20.4b scene-Token drag trigger
"factContinuityShipTokenSnapRadius"     Number   1       // §20.4b snap radius (grid cells)
```

All world-scoped. `factContinuitySidecarRequired = false` allows
fallback when the model intermittently omits the sidecar (rare in
practice but easy escape hatch).

The Companion Settings panel grows a "Fact continuity" section
colocated with the Pacing and World Journal sections.

---

## 13. Integration points with existing systems

### 13.1 Narrator Entity Discovery
- **Subject resolution** reuses `relevanceResolver.buildNameIndex` and
  dismissed-entities filtering. No duplication.
- **Migration target** for entity-scoped truths is the existing
  `generativeTier` array on the entity's host-document flags. For
  connection/faction/creature this is the `JournalEntryPage` flag; for
  ship/planet/settlement/location it is the native `Actor` flag after
  PR #100. No new field on the entity schema. The
  `appendMigratedTruthToTier` helper in `src/entities/entityExtractor.js`
  dispatches through `src/entities/registry.js` (`getEntityDocument` /
  `readEntityFlag` / `writeEntityFlag`) so callers stay correct
  regardless of host.
- **Entity panel** gains an "Active truths" collapsible per entity. UI
  reuses the existing generativeTier list components.

### 13.2 World Journal
- **Archived scene truths** route through `recordLoreDiscovery` with
  the new `subject` / `fact` / `sceneId` fields. They appear in the
  Lore tab as narrator-asserted entries, sortable/filterable by scene.
- **Contradiction surface** is `applyStateTransition` with `change:
  "contradicted"`. No new surface, no new card type.
- **Manual entry** via `!journal lore` is unchanged. The new
  `!truth set` and `!state set` commands write to the active ledger,
  not to WJ.

### 13.3 `@scene` / scene interrogation
- `@scene` already calls `resetRecentDensity()`. It now also calls
  `startScene(campaignState, { reason: "scene_command" })`. If a
  scene was active, this implicitly ends it first.
- Scene interrogation responses (`interrogateScene` in `narrator.js`)
  emit the sidecar — they assert truths and state the same as any
  narrator call. The card grows the correction button.

### 13.4 `!lore`, `!truths`
- `!truths` (foundry-ironsworn World Truths dialog) is untouched. The
  14 axioms remain a distinct constitutional concept (§1.2).
- `!lore` (campaign lore recap card) is untouched.

### 13.5 Pacing
- The classifier doesn't read the ledger. Pacing decisions are made on
  the player's input + scene tone, not on prior asserted truths.
- `runNarrativeOnlyResponse` (paced NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE)
  emits the sidecar and updates the ledger the same as any other
  narrator call.

### 13.6 World Truths (constitutional)
- `buildCampaignTruthsBlock` from `src/system/campaignTruths.js` injects
  the 14 axioms into the system prompt today. That block is unchanged.
- Section 6.5 is a different block at a different injection point with
  different semantics (granular vs constitutional). The narrator
  prompt distinguishes them by their headings ("WORLD TRUTHS" vs
  "ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE").

### 13.7 `packs/help.json`
- New commands added: `!scene start`, `!scene end`, `!truth set`,
  `!truth strike`, `!state set`, `!state strike`. All GM-only except
  `!truth strike` and `!state strike` which mirror dialog permissions.
- New settings added to the Settings Reference table.
- New "Fact continuity" page covers the conceptual model in plain
  language for in-game readers. `CONTENT_VERSION` bumps; pack
  rebuilds automatically.

---

## 14. CSS

Minimal. Two additions to `styles/companion.css`:

```css
.sf-narrator-card__footer {
  margin-top: 0.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.sf-correct-fact {
  background: transparent;
  border: 1px solid var(--sf-rule-colour, #4a4a4a);
  border-radius: 3px;
  font-size: 0.75rem;
  opacity: 0.7;
  padding: 0.2rem 0.5rem;
}
.sf-correct-fact:hover { opacity: 1.0; }

.sf-correction-dialog__retracted {
  text-decoration: line-through;
  opacity: 0.6;
}
```

The "Active truths" collapsible on the Entity Panel reuses the existing
generativeTier accordion styling. The WJ Lore tab's archived-scene-truth
filter reuses the existing tab-filter pattern.

---

## 15. Cost estimate

Per narration call, additional cost beyond existing pipeline:

| Step | When | Model | Tokens | Cost |
|---|---|---|---|---|
| Section 6.5 in context | Every call | — (input tokens only) | ~250–400 in | ~$0.001 input (Sonnet) |
| Sidecar in output | Every call | — | ~50–150 out | ~$0.0004 output (Sonnet) |
| Consistency-check pass | When enabled | Haiku | ~600 in / 100 out | ~$0.0004/call |

Per session (20 narrations):
- Default (no consistency check): ~$0.03 additional input + ~$0.01
  additional output ≈ **$0.04 / session**.
- With consistency check: + ~$0.008 ≈ **$0.05 / session**.

Negligible against the existing per-session pipeline cost. The Section
6.5 input is **not** prompt-cacheable — it changes every turn — but it
is small.

If the ledger grows past `factContinuityMaxLedgerTokens` for a long
scene, the assembler truncates state values (oldest dropped first)
before touching truths. Truths-only mode keeps the section under 300
tokens in observed playtest scenes.

---

## 16. Testing — unit + Quench

### 16.1 Unit — `tests/unit/factContinuity.test.js`

```
sidecarParser
  ✓ extracts JSON from a fenced ```json block at end of prose
  ✓ returns prose unchanged when no sidecar present
  ✓ surfaces parseError on malformed JSON without throwing
  ✓ ignores nested ``` fences inside prose

ledgers.applySidecar
  ✓ appends one entry to sceneTruths per newTruth
  ✓ replaces-on-attribute in sceneState.bySubject
  ✓ creates the bySubject bucket when subject is first seen
  ✓ resolves entity subject by name match (full name)
  ✓ resolves entity subject by first-word match
  ✓ falls back to text subject when no name match
  ✓ resolves "scene" subject to currentSceneId scope
  ✓ idempotent on repeat call with same sidecar (no double-write)
  ✓ ignores dismissed-entity names per relevanceResolver

resolveSubject
  ✓ case-insensitive entity matching
  ✓ "scene" string → kind: "scene"
  ✓ unknown name → kind: "text"

sceneLifecycle.endScene
  ✓ migrates entity-scoped truths to generativeTier
  ✓ archives free-text truths via recordLoreDiscovery
  ✓ archives scene-scoped truths via recordLoreDiscovery
  ✓ discards state ledger
  ✓ clears currentSceneId
  ✓ retracted truths are not migrated
  ✓ migratedTo is stamped on each migrated entry

sceneLifecycle.startScene
  ✓ assigns a new currentSceneId
  ✓ calls endScene first if a scene was active
  ✓ no-op when truths and state already empty and id null

buildLedgerBlock
  ✓ includes truths for matched entity IDs
  ✓ includes scene-scoped truths and state regardless of match
  ✓ includes free-text subjects mentioned in playerNarration this turn
  ✓ excludes truths for entities not in scope this turn
  ✓ never exceeds factContinuityMaxLedgerTokens

correctionDialog.applyCorrection
  ✓ strike marks retracted: true, retains entry
  ✓ replace appends correctedTo and a new entry pointing back
  ✓ player cannot strike GM-asserted truth
  ✓ GM can strike any entry

consistencyCheck.parse
  ✓ extracts contradictions array
  ✓ filters to high-confidence only
  ✓ routes each via applyStateTransition with change: "contradicted"

shipPosition.inferShipPosition (§20)
  ✓ resolves a settlement name to {sector, planet, settlement} triple
  ✓ resolves a planet name to {sector, planet, null}
  ✓ resolves an unmapped string to freeText with all IDs null
  ✓ honours sector hierarchy via PlanetSchema.settlementIds linkage
  ✓ falls back to campaignState.activeSectorId when entity has no sectorId

shipPosition.update triggers (§20.4)
  ✓ !at <settlement> updates command vehicle position
  ✓ set_a_course strong_hit with moveTarget updates position
  ✓ set_a_course weak_hit with moveTarget updates position
  ✓ set_a_course miss leaves position unchanged
  ✓ sidecar { subject: "ship", attribute: "position" } writes to ship
    entity, not to sceneState
  ✓ no command vehicle present → all triggers no-op silently

shipTokenTrigger (§20.4b)
  ✓ token drag within snap radius of a Note resolves to that Note's
    settlement and enqueues a set_a_course interpretation
  ✓ drag outside snap radius sets position.freeText only, no roll fires
  ✓ miss outcome snaps token back to preDragXY
  ✓ player decline of confirmation card snaps token back
  ✓ pendingMove lock rejects concurrent drag with UI toast + snap-back
  ✓ no command vehicle / non-sector-Scene / non-flagged Token → no-op
  ✓ snap radius respects factContinuityShipTokenSnapRadius setting
```

### 16.2 Quench — `starforged-companion.factContinuity`

```
Sidecar round-trip — live Foundry
  ✓ narrator response with sidecar populates sceneTruths in campaignState
  ✓ stateChange supersedes prior state value for same subject+attribute
  ✓ ACTIVE SCENE block appears in assembled context on second narration
  ✓ entity-scoped truth migrates to generativeTier on !scene end
  ✓ free-text truth archives to WJ Lore on !scene end with scene tag

Correction dialog
  ✓ button appears on narrator cards
  ✓ strike removes truth from active context block
  ✓ replace adds correction; original retains audit trail
  ✓ struck truth does not migrate to entity record

Scene lifecycle
  ✓ @scene starts a new scene and clears prior state
  ✓ !scene end migrates and archives in correct routing
  ✓ session end flushes active scene

Consistency-check pass (setting enabled)
  ✓ contradiction in narration produces GM-only Narrative Review card
  ✓ Review card's "Retract the offending fact" opens correction dialog

Integration with existing pipeline
  ✓ paced NARRATIVE response emits sidecar and updates ledger
  ✓ @scene interrogation emits sidecar and updates ledger
  ✓ World Truths digest and Section 6.5 both appear in prompt (distinct headings)

Ship positioning — live Foundry (§20)
  ✓ set_a_course resolution updates ship.position.nearestSettlementId
  ✓ Section 6.5 SHIP POSITION block appears on next narration
  ✓ disabling factContinuityShipAutoMoveOnCourse falls back to manual

Ship-token drag — live Foundry (§20.4b)
  ✓ sceneBuilder places a flagged command-vehicle Token on a new sector Scene
  ✓ dragging the Token onto a settlement Note opens the move
    confirmation card with set_a_course + correct destination
  ✓ rolling a miss after a drag snaps the Token back to its prior
    coordinates
  ✓ dragging beyond the snap radius produces no roll and sets
    position.freeText only
```

### 16.3 Fixtures

`tests/helpers/factContinuityFixture.js` builds a campaignState with:
- One `currentSceneId` set.
- Two `sceneTruths` (one entity-scoped, one free-text).
- Two `sceneState.bySubject` entries.
- A backing entity record matching the entity-scoped truth's subject.

Used by both unit tests and Quench integration.

---

## 17. Implementation order

This scope slots **after** NED v3 and WJ v2 (both ✅ in scope-index)
and **after** Pacing (✅). It does not require any further work on those
scopes first. No revision to `docs/implementation-ordering.md` is
necessary — that document covers NED + WJ phasing and is unaffected by
this addition. The slot recommendation is recorded here.

**Phase A — Schema and sidecar plumbing (no UI, no ledger context yet)**

1. Add `currentSceneId`, `sceneTruths`, `sceneState` to
   `CampaignStateSchema`.
2. Extend `loreEntry` page-flag schema with optional `subject`, `fact`,
   `sceneId` fields. No migration.
3. Write `src/factContinuity/sidecarParser.js`.
4. Write `src/factContinuity/ledgers.js` — `applySidecar`,
   `resolveSubject`, `promoteTextSubject`, `subjectKey`.
5. Add `appendSidecarInstruction` to `narratorPrompt.js`.
6. Wire sidecar emission into `buildNarratorSystemPrompt`.
7. Wire post-narration sidecar parse + ledger apply into `narrator.js`
   (narrateResolution, narratePacedInput, interrogateScene).
8. Write `tests/unit/factContinuity.test.js` — sections marked above
   for sidecarParser, ledgers, resolveSubject.
9. `npm test && npm run lint` — all green.

**Phase B — Ledger in narrator context (Section 6.5)**

10. Add `buildLedgerBlock` to `narratorPrompt.js`.
11. Update `assembler.js` — insert Section 6.5; add budget pressure
    rules.
12. Add `factContinuityEnabled`, `factContinuityLedgerInContext`,
    `factContinuitySidecarRequired`, `factContinuityMaxLedgerTokens`
    settings.
13. Settings panel — new "Fact continuity" section.
14. Unit tests for `buildLedgerBlock`.
15. Quench batch — round-trip narration → ledger → next-call prompt.

**Phase G — Ship positioning (see §20)**

G1. Extend `ShipSchema.position` in `src/entities/ship.js`.
G2. Write `src/factContinuity/shipPosition.js` — `inferShipPosition`.
G3. Wire the three persistent triggers: `!at` (post-write hook in
    `handleAtCommand`), `set_a_course` non-miss outcome (in
    `resolver.js` / outcome consumer), narrator sidecar special-case
    on `subject: "ship"` in `ledgers.applySidecar`.
G4. Extend the move interpreter prompt and parser with `moveTarget`.
G5. Add the SHIP POSITION line to `buildLedgerBlock`; update the
    drop-order in §6.5 (already documented as never-dropped).
G6. Add `factContinuityShipPositioning` and
    `factContinuityShipAutoMoveOnCourse` settings.
G7. Place the command-vehicle Token in `sceneBuilder.js` and flag the
    Note pins with `flags[MODULE_ID].settlementId`.
G8. Write `src/factContinuity/shipTokenTrigger.js` — `preUpdateToken`
    hook, nearest-Note resolution, snap-back on miss / decline,
    `pendingMove` guard.
G9. Add `factContinuityShipTokenEnabled` and
    `factContinuityShipTokenSnapRadius` settings.
G10. Unit tests for `inferShipPosition`, the three update triggers,
     and `shipTokenTrigger`. Quench batches for both live paths.
G11. `npm test && npm run lint` — all green.

**Phase C — Scene lifecycle and migration**

16. Write `src/factContinuity/sceneLifecycle.js`.
17. Hook `startScene` into `@scene` intercept and first-narration-of-
    session path.
18. Add `!scene start` and `!scene end` commands.
19. Hook `endScene` into session close.
20. `archiveSceneTruth` helper in `worldJournal.js`.
21. Unit tests for startScene / endScene / migration.
22. Quench tests for migration and archival.

**Phase D — Correction affordance**

23. Write `src/factContinuity/correctionDialog.js` (DialogV2).
24. Render correction button on narrator cards.
25. Wire `!truth set / strike` and `!state set / strike` commands.
26. Entity panel — "Active truths" collapsible.
27. WJ panel — scene-truth filter row.
28. Unit + Quench tests for correction paths.

**Phase E — Optional consistency check**

29. Write `src/factContinuity/consistencyCheck.js`.
30. Add `applyStateTransition` acceptance of `entryType:
    "factContinuity"` (one-line extension in `worldJournal.js`).
31. Extend the existing "◈ Narrative Review" card with the
    "Retract the offending fact" button.
32. Setting + telemetry log to a new page on the Pacing Telemetry
    journal (reuses existing journal — does not create a new one).
33. Quench tests with the setting enabled.

**Phase F — Help and docs**

34. Update `src/help/helpJournal.js` — new commands, settings, and a
    Fact Continuity page. Bump `CONTENT_VERSION`.
35. Update `CHANGELOG.md` under `[Unreleased]`.
36. Update `docs/scope-index.md` — add a row.
37. Full test suite green + lint zero errors.

---

## 18. Design decisions — Q1–Q7 positions

All seven positions below were confirmed by the user on 2026-05-12 and
are LOCKED. Subsequent revisions require explicit user agreement and a
note in `docs/decisions.md`.

### Q1. Truths ledger ↔ unconfirmed-lore queue relationship

**Decision: two pipelines.** LOCKED 2026-05-12.

The truths ledger captures every narrator-asserted fact during a scene
without GM gating. The existing WJ unconfirmed-lore queue
(`narratorAsserted: true, confirmed: false` entries in WJ Lore)
captures only facts with cross-scene consequence — those archived from
the ledger on scene end (free-text / scene-scoped truths) and any
manual `!journal lore … unconfirmed`.

Ironsworn play asserts a lot of small fictional detail per scene
("Vance is sitting", "the wind has died"). Gating every assertion
behind GM action defeats the conversation-native design goal and
overloads the existing unconfirmed-lore queue with noise. The
unconfirmed-lore queue is reserved for facts that have already
demonstrated cross-scene significance by virtue of surviving scene end.

A single-pipeline alternative — every truth → unconfirmed-lore queue
immediately — would force the GM into editorial work mid-scene. That
trades drift for friction without obvious net gain.

### Q2. Auto-detected contradictions vs. existing contradiction-flag surface

**Decision: feed the existing surface.** LOCKED 2026-05-12.

`applyStateTransition` with `change: "contradicted"` already posts the
"◈ Narrative Review" card. The consistency-check pass calls into the
same path with a new `entryType: "factContinuity"` value. The card
template grows one button — no new surface, no new layout. The data
shape (`{ entryType, name, change, newValue }`) is unchanged for
existing call sites.

### Q3. Scene-scoped truths on scene end — archive or discard

**Decision: archive to the existing WJ Lore journal with scene-ID
tagging.** LOCKED 2026-05-12.

The lore journal's page-flag schema (`loreEntry`) accommodates the
extension (`subject`, `fact`, `sceneId` as nullable fields) with no
migration breakage. A separate "Scene History" journal would mean two
journal documents to surface in the WJ panel and two read paths in the
assembler. Existing-journal-with-tagging is one less moving part.

The Lore tab's existing tab-filter pattern picks up a scene-ID filter
cheaply.

### Q4. Correction affordance — button vs. command vs. both

**Decision: button is primary, commands secondary.** LOCKED 2026-05-12.

The button is discoverable and doesn't require recall — that's the
right default. Commands (`!truth strike`, `!state set`, …) exist for
keyboard-fluent GMs and for accessibility (screen-reader-friendly,
chat-history-greppable). The button's dialog uses the same
`applyCorrection` function under the hood, so behaviour is identical.

### Q5. Consistency-check pass — opt-in, opt-out, or mandatory

**Decision: opt-in, default off.** LOCKED 2026-05-12.

The cheaper layers (ledger in context, sidecar discipline, correction
affordance) handle the bulk of observed drift. Auto-detection adds
latency and a small per-call cost that's only worth paying if those
layers prove insufficient in a given campaign. The setting is exposed
and one toggle away.

If playtesting after this scope ships shows that auto-detection catches
material drift not caught by the cheaper layers, default flips to on
in a subsequent release.

### Q6. Sidecar format — pure JSON or markup tags

**Decision: fenced JSON block.** LOCKED 2026-05-12.

The move interpreter already uses raw JSON (`parseInterpretation` in
`src/moves/interpreter.js`). Reusing that pattern keeps two parsers
across the module instead of three, and keeps prose decoupled from
ledger updates — the narrator can revise prose without re-jigging
inline tags, and the parser does not need to handle nested
emphasis/anchor cases.

Markup tags (`<truth subject="…">…</truth>`) would couple narration to
ledger updates more tightly. That's an explicit feature for some
applications (rendering narration with hover-popovers on every truth)
and a bug here, where the chat card should read as plain prose.

### Q7. Where in the implementation ordering does this slot

**Decision: a new scope after Pacing in `scope-index.md`. No revision
to `implementation-ordering.md` required.** LOCKED 2026-05-12.

That document covers NED and WJ phasing only and is unaffected by
this addition.

Dependencies: NED Phase 1 (entity IDs and generative tier), WJ Phase 3
(`recordLoreDiscovery` and the contradiction surface), and Pacing
(uses `runNarrativeOnlyResponse` as one of the narrator call sites
whose sidecar must be wired). All three are ✅ COMPLETE per
scope-index.

Slot recommendation in scope-index: insert as a new row between Pacing
and the "What to work on next" section, marked 📋 PLANNED.

---

## 19. Follow-on / future work

**Scene art.** Out of scope for this document. Note the explicit
constraint: **scene art is ambience, not canon**. If a future scope
generates per-scene background art, the art prompt should be derived
from current state ledger values (lighting, weather) and treated as a
visual mood-setter only; the ledger does not record what the art
depicts as a binding truth, and the narrator does not read the image
as a constraint. Generative-tier consistency must always supersede
visual implication.

**Truth provenance display in chat.** On hover, a truth in the
correction dialog could show "asserted Session 4, turn 3, by the
narrator after `compel` on Vance". The data is present in each ledger
entry; only the UI is missing. Worth doing once enough scenes have
accumulated to make provenance actually useful.

**Cross-scene truth propagation for free-text subjects.** A free-text
subject ("Covenant officer") that recurs across scenes currently
archives to WJ Lore each time and is read from WJ on the next scene.
There is no mechanism to detect that the recurring subject is "the
same Covenant officer" — that is what entity promotion is for, and the
existing `promoteTextSubject(textValue, entityId)` helper supports it.
A future scope could surface a GM prompt suggesting promotion when the
same text-subject is asserted across N scenes.

**Adaptive sidecar pruning.** If a long-running scene accumulates 40+
truths, the assembler currently truncates state values first. A more
sophisticated future scope could rank truths by recency of last
reference and drop the least-referenced first, with telemetry to tune
the heuristic.

**Player-facing scene summary.** On scene end, an optional
player-visible card could summarise what was established. Currently
gated behind a GM-only setting; opening it to players is a follow-on
that needs design work on tone — the summary must read as fiction, not
a system log.

**Move-interpreter sidecar reuse.** The move interpreter already emits
structured JSON; it could emit truths/state alongside its existing
fields. Out of scope here because the interpreter's job is move
classification, not narration. Folding both into one call would muddy
two prompts. Worth revisiting if interpreter→narrator latency becomes
a complaint.

---

## 20. Ship positioning

This section gives the narrator spatial awareness of the player's
command vehicle. The narrator today has no notion of where the ship
is — it relies on `campaignState.currentLocationId` set manually via
`!at`. The `ShipSchema` (`src/entities/ship.js`) has no position field
at all. As a result, narration about "the ship" can drift away from
the established sector, `set_a_course` resolves with consequences text
but no side effect on any tracked location, and the narrator cannot
ground travel descriptions in nearby canon.

This addition gives the command vehicle a persistent position record
and ties it into Section 6.5 (§6). It is gated behind the
`factContinuityShipPositioning` setting (§12) so it can be disabled
wholesale.

### 20.1 Command vehicle resolution

The "ship character" is the command vehicle — the ship in
`campaignState.shipIds` with `isCommandVehicle: true`. The helper
already exists:

```js
// src/entities/ship.js:118
export function getCommandVehicle(campaignState) { … }
```

No new resolution logic. If `getCommandVehicle()` returns `null`, the
ship-positioning data block is omitted from narrator context — the
same fallback shape the assembler uses for missing optional sections.

### 20.2 Ship position fields (persistent, on the Ship entity)

`ShipSchema` gains a `position` sub-object:

```js
position: {
  sectorId:            null,   // campaignState.sectors[*].id
  nearestPlanetId:     null,   // Actor ID of nearest planet (Actor-backed post-PR #100)
  nearestSettlementId: null,   // Actor ID of nearest settlement (Actor-backed post-PR #100)
  freeText:            "",     // free-text fallback when no canonical
                               //   entity exists (e.g. "drifting in
                               //   the outer Bleakhold expanse")
  updatedAt:           null,
  updatedBy:           null,   // "at_command" | "set_a_course" |
                               //   "narrator_sidecar" | "scene_token" |
                               //   "manual"
}
```

Storage: persists on the Ship Actor flag (post-PR #100) alongside the
rest of `ShipSchema`. `updateShip(id, { position })` already handles
arbitrary field extension — no new persistence wiring needed. Back-
compatible: existing ships without a `position` block read as all-null
and skip injection.

**Why persistent, not scene-scoped.** A starship's position doesn't
reset when the scene changes. All three ID slots can be null
simultaneously — a ship adrift in unmapped space is valid; `freeText`
covers it.

### 20.3 Position inference — `inferShipPosition(seedRef, campaignState)`

New helper in `src/factContinuity/shipPosition.js`. Given a seed
reference (a name string, an entity ID, or a `currentLocationId`),
returns the populated position record by:

1. Resolving the seed to a settlement, planet, or location entity via
   the existing `relevanceResolver.buildNameIndex` machinery (already
   cited in §4.3 — no new index).
2. If a settlement is matched: `nearestSettlementId = its ID`,
   `nearestPlanetId =` its parent planet (settlements link via
   `PlanetSchema.settlementIds`; reverse-resolve by scanning
   `campaignState.planetIds`), `sectorId =` the parent sector from
   `LocationSchema.sectorId` if sector-creator-authored, else
   `campaignState.activeSectorId`.
3. If a planet is matched: `nearestPlanetId = its ID`, `sectorId =
   activeSectorId`, settlement left `null`.
4. If a location (derelict, station, anomaly) is matched: `sectorId =
   location.sectorId`, planet/settlement left `null`, `freeText`
   mirrors the location name.
5. If no match: `freeText = seedRef`, all IDs `null`.

The helper is pure (no Foundry write). All writes go through
`updateShip(commandVehicleId, { position })`.

### 20.4 Update triggers

Three persistent triggers update `position`. Each marks `updatedBy`
so the narrator block can show provenance during early playtesting.

| Trigger | Source | Behaviour |
|---|---|---|
| `!at <name>` | `handleAtCommand` in `src/index.js` | After setting `currentLocationId`, call `inferShipPosition(name, …)` and `updateShip(cv.id, { position })`. The GM's `!at` is treated as "the party (and their ship) is here." |
| `set_a_course` resolution, non-miss outcome | `src/moves/resolver.js:436` `set_a_course` entry | On `strong_hit` or `weak_hit`, destination comes from the interpretation's new `moveTarget` field (§20.6) and is inferred. On `miss`, position is unchanged (the ship was waylaid). |
| Narrator sidecar | `ledgers.applySidecar` in §8 | A `stateChange` with `{ subject: "ship", attribute: "position", value: <destination> }` calls `inferShipPosition` and writes to the ship entity, **not** to `sceneState`. The "ship" subject is special-cased — position is persistent. |

A fourth parallel trigger — **ship-token manipulation on the sector
Scene** — is specified in §20.4b.

Trigger ordering: `set_a_course` resolution writes before the
narrator call assembles its next context packet, so the new position
appears in Section 6.5 on the very next turn. The narrator sidecar
trigger is a backstop — if the player describes movement without
rolling `set_a_course`, the narrator can still update position via
sidecar.

### 20.4b Ship-token trigger on the sector Scene

A Token representing the command vehicle is placed on the sector
Scene. When the GM or a player drags it within snap radius of a
settlement Note pin, the drop fires a `set_a_course` roll targeting
that settlement — the same pipeline a chat-typed move follows, with
the standard confirmation card. This gives a spatial UI in parallel
to text input.

**Token placement.** `src/sectors/sceneBuilder.js` already builds the
sector Scene with Note pins per settlement. It is extended to also
place a single Token for the command vehicle, flagged
`flags[MODULE_ID].commandVehicle = true` and using the ironsworn
starship icon from `src/system/ironswornAssets.js`. The Token's
`actorId` references the command vehicle's underlying Actor if one
exists (foundry-ironsworn `type: "starship"`); otherwise it's a free-
standing Token with the ship's name. Initial position: on the Note
pin matching `position.nearestSettlementId`, or the sector centre if
none.

If a sector Scene already exists without a command-vehicle Token
(pre-existing sectors), the trigger handler no-ops cleanly and a one-
time GM dialog offers to place a Token.

**Drag detection.** Hook into Foundry's `preUpdateToken` hook
(read-only inspection — confirm signature against
`docs/foundry-api-reference.md` before implementation; v13 hook
parameters can change between minor versions). On the update, check:

1. The Token is flagged as the command vehicle.
2. The Scene is the active sector Scene.
3. The new `(x, y)` differs from the previous `(x, y)`.
4. The dragger is a GM or the command-vehicle owner (player drag
   allowed — preserves the existing player-driven move pipeline
   model).

On positive match, run **nearest-Note resolution**:

- Iterate `scene.notes`.
- Compute Euclidean distance from the Token's new centre to each
  Note's centre in scene-pixel space.
- The closest Note within `factContinuityShipTokenSnapRadius`
  (default one grid cell = `scene.grid.size` pixels) is the
  candidate.
- If no Note is within radius, the drop is treated as a free-text
  reposition — `position.freeText` is set to a deterministic
  synthetic string (e.g. "drifting in <sector name>") and **no roll
  fires**. The GM can still re-drag onto a Note.

The candidate Note's `flags[MODULE_ID].settlementId` (set by
`sceneBuilder.js` when it places the pin) gives the destination
entity. Fall back to name-matching the Note's text against
`buildNameIndex` if the flag is absent.

**Roll pipeline.** Candidate in hand, the handler enqueues the same
path the chat pipeline takes:

1. Build a synthetic interpretation `{ moveId: "set_a_course",
   moveTarget: <settlement name>, playerNarration: "<ship name> sets
   a course for <settlement name>", inputMethod: "scene_drag",
   statUsed: "supply", confidence: "high", … }`.
2. Surface the standard move-confirmation card (existing UI path).
   Player presses Roll; resolver runs.
3. On non-miss outcome, the existing §20.4 `set_a_course` trigger
   updates `position`. On miss, the Token is **snapped back** to its
   previous coordinates — the ship was waylaid and didn't arrive.

**Snap-back on miss / decline.** If the player declines the
confirmation card or rolls a miss, the Token reverts to its pre-drag
coordinates via `token.update({ x: prevX, y: prevY })`. This avoids
the visual lie where the Token sits at the destination but the
persistent `position` says otherwise. Pre-drag coords are stashed in
`flags[MODULE_ID].preDragXY` at the start of the `preUpdateToken`
handler and cleared on resolution.

**Race avoidance.** Two simultaneous drags by different clients are
not a real concern (Foundry serialises Token updates), but the
existing `campaignState.pendingMove` lock (`src/schemas.js:659`)
guards against the player rolling chat-`set_a_course` while a token
drag is mid-resolution. If `pendingMove === true`, the drag is
rejected with a UI toast and the Token snaps back.

**Cross-sector drags** (Token moved across sector Scenes) are out of
scope for v1 — flagged for follow-up. Cross-sector travel should
probably fire `undertake_an_expedition` instead of `set_a_course`.

### 20.5 Narrator context — Section 6.5 ship line

`buildLedgerBlock` grows a leading "SHIP POSITION" line whenever a
command vehicle exists with a non-empty position. See the updated
example in §6.5. The block is included regardless of whether
`sceneTruths` / `sceneState` are empty. It is **never dropped** under
budget pressure (confirmed-lore tier — see updated drop order in §6).
Estimated token cost: ~30–50 tokens.

The narrator sidecar instruction (§7) gains the "ship" subject rule —
already documented inline in §7.

### 20.6 Move interpreter — `moveTarget` field

The interpreter prompt (`buildMovePrompt` in
`src/moves/interpreter.js`) grows an optional output field:

```
moveTarget: string | null   — for movement moves (set_a_course,
                              undertake_an_expedition,
                              finish_an_expedition), the named
                              destination the player stated.
                              null when not a movement move or no
                              destination is implied.
```

`parseInterpretation` reads the field; the resolver and the §20.4b
token handler consume it. No breakage for other moves — field
defaults to `null`.

### 20.7 Settings

See §12 for the full settings table. The four new entries are:

- `factContinuityShipPositioning` (Boolean, default `true`) — master
  toggle for §20.
- `factContinuityShipAutoMoveOnCourse` (Boolean, default `true`) —
  off forces manual `!at` after `set_a_course` (current behaviour).
- `factContinuityShipTokenEnabled` (Boolean, default `true`) —
  master toggle for §20.4b; off = no Token placement, no drag hook.
- `factContinuityShipTokenSnapRadius` (Number, default `1`) — grid
  cells; `0` = exact-cell overlap; `2` = forgiving.

When `factContinuityShipTokenEnabled = true` and
`factContinuityShipAutoMoveOnCourse = false`, Token drag still fires
the move pipeline; the second setting only suppresses the position-
update side effect on resolution.

### 20.8 Help and changelog

`packs/help.json` gains rows in the Settings Reference table for the
four new settings. The Fact Continuity help page (added in §13.7)
grows a "Ship positioning" subsection covering the command-vehicle
requirement, the auto-update behaviour on `set_a_course`, and the
sector-Scene Token drag affordance (incl. miss-snap-back).
`CHANGELOG.md` gets a `[Unreleased]` line.

### 20.9 Tests

Unit and Quench tests are listed inline in §16.1 and §16.2 under the
`shipPosition.*` and `shipTokenTrigger` headings.

### 20.10 Implementation phasing

This section's work is **Phase G** in §17, slotted after Phase B and
before Phase C. It does not depend on Phases C/D/E, and they do not
read or write the new fields — positions persist by design across
scene boundaries.

---

## Final note

If during implementation a concrete scene reveals that the two-ledger
distinction is academic — e.g. all observed "state" entries end up
being promoted to truths within the same scene anyway — collapse to a
single ledger with a mutability flag rather than maintaining two
parallel structures. The conceptual model in this scope is a starting
point; the codebase's actual shape after Phase A + B should be
re-evaluated before Phase C ships.
