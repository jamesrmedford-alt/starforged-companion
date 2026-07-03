# Narrator consistency flow — as implemented

The consistency-check pipeline end to end: what triggers the audit, what it
compares prose against, how a catch reaches the GM, and what the remedy
affordances actually do — verified against source (v1.7.30 cycle). Sibling
docs: `narrator-context-flow.md` (the ledger the audit defends),
`character-detail-flow.md` (the RECORDED IDENTITIES section).

Prompted by: "the same treatment applied to … narrator consistency" —
scoped as the fact-continuity consistency-check pipeline (detection →
review card → correction), plus the adjacent WJ lore-contradiction path.
§3 is the open defect ledger (fixes await direction).

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
`max_tokens: 250`, through `api-proxy.js`). Response kinds: `truth | state
| frame | ship | retraction | identity`, each with confidence high/medium/
low; parsing is fence-and-preamble tolerant and never throws.

**Who passes matched entities:** the move path, `@scene`, and paced all
pass `relevance/extras.matchedEntityIds` into the apply ctx, so the audit's
entity-scoped ledger entries and matched-NPC identities are in scope on the
three main prose paths. Oracle follow-ups build `extras.matchedEntityIds`
but do **not** pass them (§3 defect 2); vignettes / vow swearing / inciting
pass none (they have no player text and match nothing — harmless).

## 2. From catch to correction

- **High-confidence** contradictions dispatch
  `applyStateTransition({entryType: "factContinuity", change:
  "contradicted", …})` → `postContradictionNotification`: a GM-whispered
  **◈ Narrative Review** card naming the subject and violated fact, with a
  "Retract the offending fact" button. The card carries
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

## 3. Verified defects (open — awaiting direction; see `known-issues.md`)

1. **NARRCHK-TRUNC-SILENT** (LOSE-DETECTION): the Haiku audit call caps
   `max_tokens` at **250** with no `stop_reason` check — a
   contradiction-rich response truncates mid-JSON; `parseAuditResponse`'s
   fallback then salvages a partial object or returns `[]`, silently
   dropping catches. Same failure class as the fixed NARR-SIDECAR-SILENT:
   invisible truncation at the exact moment the check matters most (the
   2026-07 scope broadening — six sections, six kinds — made long responses
   more likely, and 250 tokens is ~3–4 contradiction objects).
2. **NARRCHK-CTX-DROPPED** (WRONG-DETAIL, small): `narrateOracleFollowup`
   resolves lexical relevance into `extras.matchedEntityIds` but its
   `applyNarratorSidecar` ctx omits them — the oracle-follow-up audit
   can't see entity-scoped ledger entries or matched-NPC identities, so a
   follow-up that misgenders or contradicts the NPC the question named goes
   unaudited. (Vignette/vow/inciting sites also omit the field but
   genuinely match nothing; passing it uniformly costs one argument.)
3. **NARRCHK-REMEDY-MISMATCH** (design defect): the review card's only
   affordance is the scene-ledger correction dialog, but four of the six
   audit kinds can't be remedied there — a **frame** contradiction needs a
   frame re-emit, a **ship** contradiction lives on the ship record
   (`!ship` / token move), an **identity** contradiction lives on the actor
   sheet or connection record, and a **retraction** re-assertion is already
   write-blocked (the card is informational). The GM clicks "Retract the
   offending fact" and finds a dialog that cannot address what was flagged.

## 4. Design-level exposure

- **Medium-confidence catches are invisible in play.** Telemetry-only is a
  deliberate noise-control choice, but it has never been recorded as a
  decision; if playtests show real drift arriving as "medium", a
  lower-friction surface (collapsed card, session-end digest) is the
  direction. Needs a decisions.md line either way.
- **No cross-turn dedup.** A standing contradiction (prose keeps asserting
  a struck fact the model refuses to drop) re-posts a review card every
  narration. The write-layer re-assertion block (2026-07) prevents the
  ledger damage; the card spam remains.
- **Superseded-prose review cards linger.** Burn-momentum / improve-result
  re-narrations audit the NEW prose (correct), but a review card raised
  against the pre-burn prose stays in the GM's whispers after the
  supersede — pointing at fiction that no longer stands.
- **The audit is only as visible as its two toggles**:
  `factContinuity.consistencyCheck` (on) × `contradictionNotifications`
  (on). Both default sane; the combination "check on, notifications off" is
  a silent mode worth a settings-panel hint.

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
