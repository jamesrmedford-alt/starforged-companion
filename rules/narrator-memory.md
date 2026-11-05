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
   exemption. Since issue #286 D1 a reflection a player publishes from the
   Private Channel carries it too: published text is canon. One exception
   (issue #321 U35): the move narration's "narration unavailable" card keeps
   the family so the session recap counts the move, and every narrator-memory
   read leaves it out by its `narrationFallback` flag (`sessionNarratorCards`)
   — it was fed back as story and counted as the session's first narration. A
   card the X-Card removed is flagged `xCarded` and left out the same way
   (U07), and each narration's card carries its `narrationId`, which its
   sidecar stamps on what it writes (U07; a fallback card or a published
   reflection carries none). When adding a new card type or co-marking an existing one,
   audit every `narratorCard` consumer (ring, rolling summary, session
   recap, correction hook, audio hook, burn-supersede, the X-Card's card
   pick and redirect hook) in the same commit — the consumer list lives in
   architecture doc §2.

2. **The sidecar JSON contract** (`appendSidecarInstruction` ↔
   `extractSidecar` ↔ `applySidecar`/`applySceneFrame`) is a matched pair.
   Any key added to the instruction must be normalised in
   `sidecarParser.js` and applied in `narrator.js applyNarratorSidecar` in
   the same commit, with parser tests for garbage shapes. Parsing is
   tolerant; never let a malformed sidecar block a narration post, and never
   let raw sidecar JSON reach the prose — a ```` ```json ````, ```` ``` json ````
   or bare ```` ``` ```` fence holding an object is the sidecar, stripped
   every time (issue #321 U41).

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
   also files scene-subject truths on the recorded place each was asserted
   at (the truth's `sceneLocation` stamp, issue #326 D2 — a scene spans
   travel; an unstamped truth falls back to `resolveScenePlace`, the place
   the scene ended at) and keeps each recorded character's whereabouts —
   location / vessel / condition — on their record as `lastKnown` (rendered
   on the card as LAST KNOWN). Scenes close at their fiction's
   boundaries (2026-07): End Session (`session_close`), the close-out before
   a new session is minted (`rollSessionIfDue` — `session_gap_remint` for a
   session that went idle) — do not add a session boundary
   that leaves a scene open. A session is over at End Session or after four
   hours without a chat message (issue #286 C4); only world load and Begin a
   Session mint, and the mint keeps the closing session's summary as
   `previousSessionSummary` (LAST SESSION) — the one prose surface that
   crosses sessions besides the campaign recap. A scene is never minted over
   a live one: a caller whose snapshot holds no scene while the store has one
   adopts it (`startScene` → `adoptStoredScene`, issue #321 U06f), scene
   starts run one at a time on the canonical GM — a start waits for the one
   in flight before it looks, so two narrations on their own copies share one
   scene (issue #335 Y05) — and every
   sidecar-applying narration — oracle follow-ups, session and clock
   vignettes and vow scenes included — starts a scene when none is active
   (`ensureSceneStarted`, canonical GM, issue #321 U34).

6b. **Retraction is enforced.** A bare Strike renders in the CORRECTED
   ledger block AND blocks narrator re-assertion at `applySidecar` (GM
   `!truth set` bypasses, and lifts the strike — `correctedTo`, as a Replace
   — so the two never render together; a player's set over a GM's strike is
   refused, issue #326 W60; the lift also restores the lore that strike
   retracted, `restoreStruckLore` by the lore entry's `retractedByTruth`, so
   the re-set fact is archived as canon — issue #331 X31 — save an entry
   another standing retraction still states: it stays out of canon, handed to
   that strike when it is one the GM can lift, `loreRetractionHolder` — issue
   #336 Y32). Do not "simplify" either half away — the render
   defense and the write defense cover different failure paths (model
   ignores instructions vs. model re-emits the fact). Since issue #286 (B6)
   a Strike also reaches the stores that copied the fact
   (`propagateRetraction`, `src/factContinuity/retractions.js` — same-session
   tier details on the subject, same-session auto-confirmed lore that states
   it about the struck subject (issue #321 U39 — sidecar facts are
   subject-less phrases, so a bare fact match retracted another character's
   lore), a summary regen), and the scene's strikes outlive it for the
   session (`campaignState.sessionRetractions` → CORRECTED + the summary's
   leave-out list; a strike is its subject and fact together, U39). Any new
   correction path calls `propagateRetraction` — the X-Card does, for each
   truth it retracts (issue #321 U07). An X-Card retraction
   (`retractedBy: "xcard"`) blocks re-assertion like a strike but is never
   named under CORRECTED or in the leave-out list: naming it would hand the
   narrator the content the table removed. Anything a narration writes
   outside the ledgers carries its `narrationId` so the X-Card can undo it
   too — the command vehicle's position does (issue #325 W07), and so does
   everything its capture records: World Journal entries (with the versions
   they replaced), Session Log beats and tier details (issue #329 X01 — a new
   capture writer takes the id from its caller), and the state transitions
   it applies to existing entries, a faction's record stance included
   (XCARD-CAPTURE-TRANSITIONS); so does what a scene end migrates from its
   ledger entries — the tier detail, the archived Lore page and the LAST
   KNOWN value with the values it superseded — since the card may be played
   after the scene ended (issue #335 Y01); a narration
   is built from the ledgers as they stand in the store, never a pre-dialog
   snapshot (W05), and a summary the X-Card emptied is stamped newer than any
   working copy's (W06).

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
