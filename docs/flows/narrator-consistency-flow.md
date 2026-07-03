# Narrator consistency flow — as implemented

The consistency-check pipeline end to end: what triggers the audit, what it
compares prose against, how a catch reaches the GM, and what the remedy
affordances actually do — verified against source (v1.7.30 cycle). Sibling
docs: `narrator-context-flow.md` (the ledger the audit defends),
`character-detail-flow.md` (the RECORDED IDENTITIES section).

Prompted by: "the same treatment applied to … narrator consistency" —
scoped as the fact-continuity consistency-check pipeline (detection →
review card → correction), plus the adjacent WJ lore-contradiction path.
All three audit defects and the actionable exposures were **fixed in the
same cycle** ("Please address all identified issues") — §3 is the resolved
ledger, §4 the dispositions.

## 1. Trigger and audit scope

`applyNarratorSidecar` fires `runConsistencyCheck(prose, campaignState,
{matchedEntityIds, currentLocationId, playerNarration})` on the **canonical
GM only**, fire-and-forget (never blocks or delays the narration post), for
every mode that applies a sidecar — all nine narrator paths. Gated on
`factContinuity.consistencyCheck` (**default ON** since 2026-07; the
unregistered-settings fallback stays false so unit tests never fire API
calls).

The audit prompt (`buildAuditPrompt`) compares prose against the FULL
ledger block (`buildLedgerBlock` at `maxTokens: Infinity`) — SCENE FRAME,
RECORDED IDENTITIES (PC + matched-NPC pronouns, 2026-07), TRUTHS, RETRACTED
FACTS, STATE, SHIP POSITION — via one Haiku call (`claude-haiku-4-5`,
`max_tokens: 1000` since 2026-07, with a `stop_reason` truncation warning,
through `api-proxy.js`). Response kinds: `truth | state
| frame | ship | retraction | identity`, each with confidence high/medium/
low; parsing is fence-and-preamble tolerant and never throws.

**Who passes matched entities:** the move path, `@scene`, and paced all
pass `relevance/extras.matchedEntityIds` into the apply ctx, so the audit's
entity-scoped ledger entries and matched-NPC identities are in scope on the
three main prose paths. Since 2026-07 **every** apply site passes
`extras.matchedEntityIds` uniformly — oracle follow-ups included (the
vignette / vow / inciting modes still match nothing, but the plumbing no
longer special-cases them).

## 2. From catch to correction

- **High-confidence** contradictions dispatch
  `applyStateTransition({entryType: "factContinuity", change:
  "contradicted", kind, …})` → `postContradictionNotification`: a
  GM-whispered **◈ Narrative Review** card naming the subject and violated
  fact. Truth/state kinds carry the "Retract the offending fact" button;
  frame / ship / identity / retraction kinds carry a **targeted remedy
  hint** instead (the dialog cannot address them — NARRCHK-REMEDY-MISMATCH
  fix). A standing contradiction posts **once per scene** (in-memory dedup
  on scene + subject + violated fact; telemetry still logs every audit). The card carries
  `contradictedTruthId` + `matchedEntityIds` flags and co-marks
  `narratorCard` purely to surface the render hook — the ring's defensive
  excludes (`worldJournalContradiction`) keep it out of narrator memory.
- The button opens the **Correct Active Scene Facts dialog**
  (`openCorrectionDialog`), scoped to the card's matched entities + current
  location: in-scope truths get Strike / Replace, state entries get Strike
  / Set. Strikes now feed the CORRECTED do-not-re-assert block and the
  write-layer re-assertion guard (2026-07).
- **Medium/low-confidence** results are telemetry-only — logged to the
  Pacing Telemetry journal's Consistency Check page
  (`logConsistencyDecision`, GM-gated, fail-open) and never shown to the GM.
- **`contradictionNotifications`** (default on) gates the card itself; off
  means even high-confidence catches are telemetry-only.
- The **WJ lore-contradiction path** (detection pass, `entryType: "lore"`)
  posts the same card WITHOUT the retract button — WJ lore's correction
  affordance is the `!journal` command family (reaffirmed 2026-07).

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| NARRCHK-TRUNC-SILENT | LOSE-DETECTION | 250-token cap, silent truncation → `max_tokens: 1000` (~15 contradiction objects) and `callHaiku` warns on `stop_reason: "max_tokens"` |
| NARRCHK-CTX-DROPPED | WRONG-DETAIL | Oracle follow-ups (and the no-text modes) omitted matched entities from the apply ctx → all twelve `applyNarratorSidecar` sites pass `extras.matchedEntityIds` uniformly |
| NARRCHK-REMEDY-MISMATCH | design defect | One-size retract button → kind-aware review card: truth/state keep the correction-dialog button; frame / ship / identity / retraction get targeted remedy hints (frame re-emit via `@scene`, `!ship`/token move, sheet/record pronouns, already-blocked note) |

## 4. Design-level exposure — dispositions (2026-07)

- **Cross-turn dedup — addressed.** One review card per (scene, subject,
  violated fact); the in-memory set clears on scene change, so a reload
  re-arms the reminder once. Telemetry keeps the full stream.
- **Medium-confidence catches stay telemetry-only — reaffirmed** and now
  recorded (decisions.md → consistency reaffirmations): high-confidence is
  the GM-interrupt bar; the Pacing Telemetry journal's Consistency Check
  page is the review surface for the rest. Revisit if playtests show real
  drift arriving as "medium".
- **Pre-burn review cards may linger after a supersede — accepted.** The
  card names the subject and fact, which usually still matter post-upgrade;
  wiring card retraction to burn supersede is machinery without evidence of
  need.
- **The silent mode ("check on, notifications off") is now labelled** — the
  Contradiction Notifications setting hint says catches land only in
  telemetry when it is off.

## 5. What held up under audit

Fire-and-forget dispatch (zero latency on the narration post) with
canonical-GM single-emitter gating; the audit compares against the full
ledger block including every 2026-07 addition (frame, retractions, ship,
identities); parsing is tolerant and never blocks; every audit — including
clean ones — lands in telemetry with elapsed-ms for tuning; the review card
stays out of narrator memory despite co-marking `narratorCard`; the
correction dialog scopes to the card's matched entities and re-renders in
place; and all API traffic rides `api-proxy.js` per the architecture
constraint.
