# Narrator context flow — as implemented

Where every byte of narrator context comes from, how narrator output becomes
memory, and what defends against contradictions — verified against source
(v1.7.30 cycle). Companion to `docs/narrator/narrator-memory-architecture.md`
(the design reference); this doc records what the code does **today**.
Sibling docs: `combat-flow.md`, `vow-flow.md`, `connection-flow.md`,
`exploration-flow.md`.

The 2026-07 audit of this flow surfaced nine verified defects and a
design-level exposure list; **all were fixed or explicitly reaffirmed in the
same cycle** ("Fix all gaps"). §3 is the resolved ledger; §4 records the
design decisions. Failure classes used below: **LOSE-PLOT** (facts fall out
of context), **WRONG-DETAIL** (stale/wrong data injected), **INVENT-RISK**
(nothing stops a contradiction).

## 1. Injection side — what the narrator is told

**Single seam holds.** Every narrator call builds context through
`buildNarratorExtras(mode, …)` (`src/narration/narrator.js`): move_resolution,
paced_narrative, scene_interrogation, oracle_followup, session_vignette
(galley, end-session, clock/trigger vignettes), vow_swearing,
inciting_incident, campaign_recap (meta — no sidecar/latitude). The `!ship
envision/history` and `!lore`/truths generators are separate world-building
prompts outside the memory surfaces (they write Notes/journal canon but don't
read the ledger).

**System prompt section map** (`buildNarratorSystemPrompt`,
`src/narration/narratorPrompt.js`): [0] role/style per mode · [0b]
session-start recap · [1] safety · [2] permission-class latitude · [2.5]
Battle Stations · [3] oracle seeds (move-provided only) · **[3b] recent
oracle results** (`campaignState.recentOracles` — raw `!oracle`/`!ptp`
outcomes, last 5 this session, "the dice established these"; skipped for
meta modes) · [4] world truths · [4a] campaign truths digest · [4b] campaign
premise (`campaignState.incitingIncident` — durable canon, every call) ·
[4c] rolling session summary (prefixed with a **ledger-wins caveat** — the
summary is texture, not a fact store) · [5] current location card · [5b]
active-sector anchor · [6] matched entity cards · [6.5] active-scene ledger
(SCENE FRAME → TRUTHS → **CORRECTED** → STATE → SHIP POSITION;
`maxLedgerTokens` sheds state only — frame/truths/corrections/ship are
never dropped) · [7] legacy connections summary (count only) · [8]
CHARACTER STATE · [8b] party roster · [8c] spotlight nudge · [9] sidecar
instruction (last; includes the record-anchors-once and never-re-assert-
CORRECTED rules) · [10] audio markup.

**Relevance** (`src/context/relevanceResolver.js`): Phase 1 is a lexical name
index (full name + first/last word of multi-word names, lowercased,
dismissed-list filtered); Phase 2 (Haiku) fires only for hybrid *moves*.
Paced/@scene union the scene frame's `present` names into the match text; the
move path deliberately does not (architecture §8.2, reaffirmed 2026-07). A
match miss means no entity card for that entity — mitigated on paced/@scene
by the frame union.

**Budgets.** `SIDECAR_TOKEN_HEADROOM = 500`; move/paced use
`narrationMaxTokens + 500`; every other mode passes
`maxTokensWithSidecar(16000)` — generous caps, so truncation is rare, and
`callNarratorAPI` now **warns on `stop_reason: "max_tokens"`** so the
remaining cases are visible (the pre-fence truncation that used to parse as
"clean prose, no sidecar" is caught here).

## 2. Write-back side — how output becomes memory

Prose + fenced JSON sidecar → `extractSidecar`
(`src/factContinuity/sidecarParser.js`; last fence wins, unknown keys
dropped, unclosed fence → parseError + sidecar discarded; a response with
**no fence at all now warns** in `applyNarratorSidecar` — the sidecar is
mandatory, so a missing fence is a lost frame update, not a quiet no-op) →
`applyNarratorSidecar` (canonical-GM only): truths append **with dedup**
(subject + normalised fact; a match against a *retracted* truth blocks the
append — the correction stands) / state supersede per subject+attribute
(`ledgers.js`), subjects resolved against `collectAllEntities`, ship
`position` stateChanges routed to the §20 ship record, `applySceneFrame`
full-replacement snapshot, the consistency check (on by default), then the
card posts with the flag family (`narratorCard`/`narrationText`/`sessionId`)
for the ring.

**The flag family covers every fiction card** (2026-07): move narration,
paced, @scene, inciting incident, galley/end-session vignettes, **vow-swearing
scenes**, **clock vignettes (all three post sites: Pay the Price, Begin
Session, manual advance)**, and **oracle follow-up narrations**. Raw oracle
*results* additionally carry a structured `oracleMemory` flag; the canonical
GM's capture hook (`registerOracleMemoryCaptureHook`, `src/index.js`) ledgers
them into `campaignState.recentOracles` (`src/oracles/oracleMemory.js`,
cap 8) for section [3b] and the assembler's RECENT ORACLES section.

**Scene lifecycle** (`src/factContinuity/sceneLifecycle.js`): scenes start on
`!scene start`, an `@scene` intercept, `ensureSceneStarted` on the first
move/@scene/paced narration, **or the inciting incident** (so the premise
sidecar writes into a real scene the first move then *continues* — the
opening NPC state and frame survive). `startScene` implicitly ends a prior
scene when truths/state exist. `endScene` migrates entity-kind truths →
generative tiers (deduped against existing tier details — live capture +
migration no longer double-lands), text/scene truths → WJ Lore, then
discards state and clears the frame. Triggers for `endScene`: the two
commands, the implicit path, `closeWorld`, **End Session**
(`session_close`), and the ready-hook's stale-scene close before a 4h-gap
session re-mint (`session_gap_remint`) — session boundaries no longer leak
scene truths into the next session's empty ring.

**Corrections & defenses:**
- The ledger block's binding wording, plus the **CORRECTED block**: a bare
  Strike renders as "retracted by the table — do NOT re-assert" (capped at
  the 5 most recent, never dropped under budget; Replace-corrections are
  exempt — the replacement truth stands). The write layer refuses narrator
  re-assertions of retracted facts; GM `!truth set` bypasses (GM authority).
- `!truth` / `!state` resolve subjects **against the full entity roster**,
  so entity-keyed entries are addressable by name from the commands (the
  correction dialog always could).
- The **consistency check** (`factContinuity.consistencyCheck`, default
  **ON** since 2026-07): a fire-and-forget Haiku audit of prose vs the full
  ledger block — frame, truths, retracted facts, state, ship position.
  High-confidence hits post the GM-whispered review card with a retract
  button; nothing auto-corrects (deliberate — GM authority).
- The ship "not yet established — do NOT invent" guard line.
- The rolling summary's [4c] caveat tells the model the ledger wins on
  conflict; the summary persist is canonical-GM gated.
- CHARACTER STATE's connection ranks stay live: `setBondItemRank` mirrors
  record rank raises (develop-match, `!bond`-match) onto the bond Items.

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| NARR-RING-VOWSCENE | LOSE-PLOT | Vow-swearing card had no flag family → `narrateAndPostVowSwearing` posts the full family; the oath scene feeds ring/summary/recap |
| NARR-RING-CLOCKVIG | LOSE-PLOT | Clock vignettes posted without the family → all three post sites carry it |
| NARR-SIDECAR-SILENT | LOSE-PLOT | Fence-less responses and pre-fence truncation were invisible → missing-fence warn in `applyNarratorSidecar`; `stop_reason: "max_tokens"` warn in `callNarratorAPI` |
| NARR-INCITING-SCENE | LOSE-PLOT | Premise wrote under a null scene; first move's implicit endScene discarded opening state/frame → inciting starts the scene; the first move continues it |
| NARR-SESSION-SCENE | LOSE-PLOT | End Session / 4h re-mint never ended the scene → `session_close` on End Session; `session_gap_remint` stale-scene close on the ready hook |
| NARR-TRUTH-DUP | WRONG-DETAIL | Identity anchors accreted duplicate truths unboundedly → write-layer dedup (subject + normalised fact) + record-anchors-once instruction rule |
| NARR-RETRACT-PASSIVE | INVENT-RISK | Bare Strike was render-skip only → CORRECTED block + write-layer re-assertion block + retraction section in the consistency-check audit |
| NARR-CMD-SUBJECT | WRONG-DETAIL | Commands resolved subjects rosterless → `collectAllEntities` passed at all three `fcResolveSubject` callsites |
| NARR-BOND-RANK-STALE | WRONG-DETAIL | Bond-Item rank never followed record raises → `setBondItemRank` mirror at both raise sites |

## 4. Design-level exposure — dispositions (2026-07)

Addressed:
- **Consistency check defaults ON and audits the full ledger block** (frame,
  truths, retractions, state, ship). Still whisper-only and fire-and-forget.
  Decision: decisions.md → "Consistency check defaults on".
- **Rolling summary** carries the ledger-wins caveat every turn; persist gate
  is `isCanonicalGM` (was plain `isGM` — multi-GM last-writer race).
- **Raw oracle results have a memory home** — `recentOracles` ring → [3b] +
  the assembler section (which previously rendered a count from
  `oracleResultIds`, a field no code ever wrote). Oracle follow-up prose
  joined the flag family. Decision: decisions.md → "Raw oracle results are
  memory, not just chat".
- **Scene-end tier migration dedups** with the same containment check as
  live capture — a dedupe hit still marks the truth migrated (the fact IS in
  the tier).

Reaffirmed as deliberate (decisions.md → "Narrator-context reaffirmations"):
- **Frame applies as an unvalidated full replacement** — the broadened
  consistency check is the staleness/contradiction mitigation (§8.3's fix
  direction, now shipped).
- **Non-move relevance stays lexical** (invariant 5; frame-present union
  carries short turns).
- **WJ threat/faction transitions ride the salience-gated Haiku read**,
  notify-only for lore contradictions; manual `!journal` affordances remain
  the correction path.

## 5. What held up under audit

The single-assembly seam (`buildNarratorExtras`) is honored by every mode;
never-dropped ledger tiers hold in code exactly as documented; state
supersedes cleanly per subject+attribute; the ship-position "do NOT invent"
guard exists; the premise block makes the opening canon durable; parse
tolerance never blocks a narration post; and all ledger writes are
canonical-GM gated.
