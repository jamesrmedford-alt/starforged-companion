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
   state truncates. Do not reorder the drop sequence without a decision.

5. **Non-move relevance stays lexical.** `resolvePathRelevance`
   (paced/@scene) must never reach an API call — `resolveRelevance` with
   `moveId: null` guarantees this today. The move path's relevance call is
   not frame-unioned on purpose (hybrid permission classification); see
   architecture doc §8.2 before changing.

6. **Scene-scoped lifetimes.** `sceneFrame`, `sceneTruths`, `sceneState`
   are cleared/migrated by `startScene`/`endScene` only. Anything that must
   outlive the scene belongs in entity tiers or WJ Lore via the existing
   migration, not in a lifecycle exemption. Scenes close at their fiction's
   boundaries (2026-07): End Session (`session_close`), the ready-hook's
   stale-scene close before a 4h-gap re-mint (`session_gap_remint`), and
   `closeWorld` — do not add a session boundary that leaves a scene open.

6b. **Retraction is enforced.** A bare Strike renders in the CORRECTED
   ledger block AND blocks narrator re-assertion at `applySidecar` (GM
   `!truth set` bypasses). Do not "simplify" either half away — the render
   defense and the write defense cover different failure paths (model
   ignores instructions vs. model re-emits the fact).

7. **Sidecar subjects resolve against the full roster.**
   `applyNarratorSidecar` passes `collectAllEntities(campaignState)` so
   confirmed NPCs ledger entity-keyed. Don't remove that argument; text
   subjects are the fallback, not the norm.

8. **The rolling session summary is a droppable convenience, not a fact
   store.** It is summarised *from source* (never summary-of-summary),
   debounced at `round(1.5 × narratorContextCards)`, and must never be retained
   at the expense of any §6.5 ledger tier or the never-dropped facts (frame /
   binding truths / ship position) — those defend load-bearing facts; the
   summary only carries narrative texture. Keep it GM-gated + fail-open: a
   summary error returns the prior text and never blocks a narration. Full drop
   priority in `decisions.md` → "Rolling session summary".

## Tuning knobs (don't add new ones before using these)

`narratorContextCards` (ring depth) · `sceneContextCards` ·
`narratorSessionSummary` (rolling session summary on/off) ·
`factContinuity.sceneFrame` · `factContinuity.maxLedgerTokens` ·
`factContinuity.consistencyCheck`. Symptom → knob table: architecture doc §7.
