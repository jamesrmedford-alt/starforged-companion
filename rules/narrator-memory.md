# Narrator memory — operational rules

Full architecture, tuning guide, and refinement backlog:
**`docs/narrator/narrator-memory-architecture.md`** — read it before changing
anything in the narrator-context, sidecar, fact-continuity, or scene-frame
layers. This file is the never-break list.

## Invariants

1. **The flag-family contract.** Every chat card whose prose is fiction the
   narrator should remember MUST carry `narratorCard: true`,
   `narrationText: <prose>`, and `sessionId`. Error/fallback cards must NOT.
   As of 2026-07 this covers move, paced, @scene, inciting, galley /
   end-session vignettes, vow-swearing scenes, all three clock-vignette post
   sites, and oracle follow-up narrations — "mood piece" is not an
   exemption. When adding a new card type or co-marking an existing one,
   audit every `narratorCard` consumer (ring, rolling summary, session
   recap, correction hook, audio hook, burn-supersede) in the same commit —
   the consumer list lives in architecture doc §2.

2. **The sidecar JSON contract** (`appendSidecarInstruction` ↔
   `extractSidecar` ↔ `applySidecar`/`applySceneFrame`) is a matched pair.
   Any key added to the instruction must be normalised in
   `sidecarParser.js` and applied in `narrator.js applyNarratorSidecar` in
   the same commit, with parser tests for garbage shapes. Parsing is
   tolerant; never let a malformed sidecar block a narration post.

3. **Required emissions are prompt-enforced, not code-enforced.** NPC
   location/vessel/condition (stateChanges) and intent/stakes (newTruths)
   are REQUIRED in the instruction text. If they stop arriving, fix the
   instruction wording first — do not silently add inference machinery.

4. **Never-dropped tiers.** Scene frame, binding truths, and ship position
   are never dropped from the ledger block under budget pressure; only
   state truncates — line by line, every other attribute before a
   character's location / vessel / condition, the oldest first within each
   (issue #286 A6; the block used to drop whole). Do not reorder the drop
   sequence without a decision.

5. **Non-move relevance stays lexical.** `resolvePathRelevance`
   (paced/@scene) must never reach an API call — `resolveRelevance` with
   `moveId: null` guarantees this today. The move path's relevance call is
   not frame-unioned on purpose (hybrid permission classification); see
   architecture doc §8.2 before changing. The frame's recorded cast joins the
   matched set after relevance resolves (`addSceneFrameCast`, every path —
   issue #286 B3), which brings back their cards and facts without moving the
   permission class.

6. **Scene-scoped lifetimes.** `sceneFrame`, `sceneTruths`, `sceneState`
   are cleared/migrated by `startScene`/`endScene` only. Anything that must
   outlive the scene belongs in entity tiers or WJ Lore via the existing
   migration, not in a lifecycle exemption. Since issue #286 that migration
   also files scene-subject truths on the scene's recorded place
   (`resolveScenePlace`) and keeps each recorded character's whereabouts —
   location / vessel / condition — on their record as `lastKnown` (rendered
   on the card as LAST KNOWN). Scenes close at their fiction's
   boundaries (2026-07): End Session (`session_close`), the ready-hook's
   stale-scene close before a 4h-gap re-mint (`session_gap_remint`), and
   `closeWorld` — do not add a session boundary that leaves a scene open.

6b. **Retraction is enforced.** A bare Strike renders in the CORRECTED
   ledger block AND blocks narrator re-assertion at `applySidecar` (GM
   `!truth set` bypasses). Do not "simplify" either half away — the render
   defense and the write defense cover different failure paths (model
   ignores instructions vs. model re-emits the fact). Since issue #286 (B6)
   a Strike also reaches the stores that copied the fact
   (`propagateRetraction`, `src/factContinuity/retractions.js` — same-session
   tier details on the subject, same-session auto-confirmed lore, a summary
   regen), and the scene's strikes outlive it for the session
   (`campaignState.sessionRetractions` → CORRECTED + the summary's leave-out
   list). Any new correction path calls `propagateRetraction`.

7. **Sidecar subjects resolve against the full roster, in its own shape.**
   `applyNarratorSidecar` passes `collectAllEntities(campaignState)` so
   confirmed NPCs ledger entity-keyed. Don't remove that argument; text
   subjects are the fallback, not the norm. Pass the roster through
   unchanged: an entity subject's `entityId` is the roster's `journalId`
   (the HOST document id — an Actor id for an NPC), the id relevance
   matches, entity cards and scene-end migration use. Never re-map it into
   another shape or promote with a record's own `_id` (issue #286 A1/A3 —
   both silently dropped every recorded entity's facts). Names resolve
   through `resolveEntityName`'s bounded ladder, which never files a fact
   under an entity on an article, a title, a shared name part or a
   lowercase common noun. Entity state keys are `entity:<id>`
   (`subjectKey` / `subjectFromStateKey`).

8. **The rolling session summary is a droppable convenience, not a fact
   store.** It is summarised *from source* (never summary-of-summary),
   debounced at `round(1.5 × narratorContextCards)`, and must never be retained
   at the expense of any §6.5 ledger tier or the never-dropped facts (frame /
   binding truths / ship position) — those defend load-bearing facts; the
   summary only carries narrative texture. Keep it GM-gated + fail-open: a
   summary error returns the prior text and never blocks a narration. Regen
   runs after a narrator card posts (`registerRollingSummaryRefreshHook`),
   never inside `buildNarratorExtras`, which only reads the cached text — a
   regen is a Haiku call over the whole session (issue #286 B7). Full drop
   priority in `decisions.md` → "Rolling session summary".

## Tuning knobs (don't add new ones before using these)

`narratorContextCards` (ring depth) · `sceneContextCards` ·
`narratorSessionSummary` (rolling session summary on/off) ·
`factContinuity.sceneFrame` · `factContinuity.maxLedgerTokens` ·
`factContinuity.consistencyCheck`. Symptom → knob table: architecture doc §7.
