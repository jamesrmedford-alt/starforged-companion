# Narrator context flow — as implemented

Where every byte of narrator context comes from, how narrator output becomes
memory, and what defends against contradictions — verified against source
(v1.7.30 cycle). Companion to `docs/narrator/narrator-memory-architecture.md`
(the design reference); this doc records what the code does **today**,
including where it diverges from that design. Sibling docs: `combat-flow.md`,
`vow-flow.md`, `connection-flow.md`, `exploration-flow.md`.

Findings are tagged by failure class: **LOSE-PLOT** (facts fall out of
context), **WRONG-DETAIL** (stale/wrong data injected), **INVENT-RISK**
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
`src/narration/narratorPrompt.js` — comments at ~1051-1206): [0] role/style
per mode · [0b] session-start recap · [1] safety · [2] permission-class
latitude · [2.5] Battle Stations · [3] oracle seeds (move-provided only) ·
[4] world truths · [4a] campaign truths digest · [4b] campaign premise
(`campaignState.incitingIncident` — durable canon, every call) · [4c] rolling
session summary · [5] current location card · [5b] active-sector anchor ·
[6] matched entity cards · [6.5] active-scene ledger (SCENE FRAME → TRUTHS →
STATE → SHIP POSITION; `maxLedgerTokens` sheds state only — never-dropped
tiers verified in code) · [7] legacy connections summary (count only) ·
[8] CHARACTER STATE · [8b] party roster · [8c] spotlight nudge · [9] sidecar
instruction (last) · [10] audio markup.

**Relevance** (`src/context/relevanceResolver.js`): Phase 1 is a lexical name
index (full name + first/last word of multi-word names, lowercased,
dismissed-list filtered); Phase 2 (Haiku) fires only for hybrid *moves*.
Paced/@scene union the scene frame's `present` names into the match text; the
move path deliberately does not (architecture §8.2). A match miss means **no
entity card** — pronoun-only or nickname references inject nothing for that
entity (mitigated on paced/@scene by the frame union).

**Budgets.** `SIDECAR_TOKEN_HEADROOM = 500`; move/paced use
`narrationMaxTokens + 500`; every other mode passes
`maxTokensWithSidecar(16000)` (narrator.js:733/1042/1070/1148/1163/1262/1273/
1321/1399/1475) — generous caps, so output truncation is rare; **the
architecture doc's §6.5 per-site table (700/720/880/980) is stale.**

## 2. Write-back side — how output becomes memory

Prose + fenced JSON sidecar → `extractSidecar`
(`src/factContinuity/sidecarParser.js`; last fence wins, unknown keys
dropped, unclosed fence → parseError + sidecar discarded) →
`applyNarratorSidecar` (canonical-GM only): truths append / state supersede
per subject+attribute (`ledgers.js`), subjects resolved against
`collectAllEntities`, ship `position` stateChanges routed to the §20 ship
record, `applySceneFrame` full-replacement snapshot, optional consistency
check, then the card posts with the flag family
(`narratorCard`/`narrationText`/`sessionId`) for the ring.

**Scene lifecycle** (`src/factContinuity/sceneLifecycle.js`): scenes start on
`!scene start`, an `@scene` intercept, or `ensureSceneStarted` on the first
move/@scene/paced narration; `startScene` implicitly ends a prior scene when
truths/state exist. `endScene` migrates entity-kind truths → generative
tiers, text/scene truths → WJ Lore, then **discards state** (state never
migrates), clears truths, nulls the frame. Triggers for `endScene`: the two
commands, the implicit path, and `closeWorld` — **nothing else** (see
findings).

**Defenses:** the ledger block's "binding … must not diverge" wording; the
sidecar's required emissions (prompt-enforced by design — invariant 3); the
opt-in consistency check (`factContinuity.consistencyCheck`, default OFF —
Haiku audit of prose vs **truths+state only**, high-confidence hits post a
GM-whispered review card with a retract button; nothing auto-corrects);
corrections (dialog + `!truth`/`!state`, active-scene ledger only); the ship
"not yet established — do NOT invent" guard line.

## 3. Verified defects (open — awaiting direction; see `known-issues.md`)

1. **NARR-RING-VOWSCENE** (LOSE-PLOT): the vow-swearing scene card posts
   fiction with no flag family (`narrateAndPostVowSwearing`,
   narrator.js:1436-1437 — `vowSceneCard` only). The campaign's oath scene
   never enters the ring, the rolling summary, or the session recap — the
   narrator can contradict its own swearing scene on the next turn. (The
   galley/end-session vignettes gained the family at some point — the
   architecture doc's §8.1 backlog entry is stale in the *other* direction.)
2. **NARR-RING-CLOCKVIG** (LOSE-PLOT): clock-advancement/trigger vignettes
   post prose with only `clockCard`/`clockVignetteCard` flags
   (index.js:~3993) — threat-advance fiction is forgotten immediately.
3. **NARR-SIDECAR-SILENT** (LOSE-PLOT + no-silent-failures violation): a
   response with **no sidecar fence at all** returns
   `{sidecar:null, parseError:null}` (sidecarParser.js:68) and the apply step
   silently skips — the turn loses its frame update and required emissions
   with zero logging. Truncation is only detected heuristically via an
   unclosed fence; `callNarratorAPI` never checks `stop_reason`
   (narrator.js/api-proxy.js: no occurrences), so prose cut before the fence
   opens is also silent. The doc's "watch for truncated-by-maxTokens
   warnings" overstates what exists.
4. **NARR-INCITING-SCENE** (LOSE-PLOT): `narrateIncitingIncident` never calls
   `ensureSceneStarted`, so the premise sidecar writes truths/state/frame
   under `currentSceneId: null`; the first real turn's `ensureSceneStarted`
   → `startScene` sees non-empty ledgers → **implicit endScene**: truths
   migrate out of the active scene, the target NPC's opening
   location/condition **state is discarded** (state never migrates), and the
   opening frame is cleared. Partially mitigated by the always-injected
   premise block [4b] and entity-keyed truth migration — but the
   architecture's §9 checklist is violated the moment play proceeds.
5. **NARR-SESSION-SCENE** (LOSE-PLOT/WRONG-DETAIL): End Session never ends
   the scene (lifecycle.js:67-79 flips flags only), and `initSessionId`'s
   4-hour-gap re-mint (index.js:534-553) doesn't either — so a new session
   starts with an **empty ring and empty summary but the previous session's
   scene truths still rendering** (buildLedgerBlock has no sessionId
   filter). Cards posted before a session id exists get `sessionId:null`
   and never rejoin any ring.
6. **NARR-TRUTH-DUP** (WRONG-DETAIL/cost): `applySidecar` appends every
   `newTruth` with no fact-equality dedup (ledgers.js:67-83) while the
   sidecar instruction *requires* identity-anchor emissions — a model that
   re-anchors each turn accretes duplicate truths, which are never dropped
   (truths are exempt from `maxLedgerTokens`) and never elided (architecture
   §8.8 unimplemented). Marathon scenes grow the prompt unboundedly.
7. **NARR-RETRACT-PASSIVE** (INVENT-RISK): a bare Strike just skips the truth
   at render (`if (!t || t.retracted) continue;` narratorPrompt.js:254) — no
   "this was corrected; do not re-assert" line is emitted, the originating
   prose stays in the ring/summary, and with the consistency check off
   nothing re-strikes a re-assertion. The architecture doc's "the retraction
   defends against re-assertion" claim is stale; only Replace (which appends
   the corrected truth) actively counters.
8. **NARR-CMD-SUBJECT** (WRONG-DETAIL): `!truth set` / `!state strike|set`
   resolve subjects **without the entity roster**
   (`fcResolveSubject(parsed.subject, campaignState)` — index.js:2513/2524/
   2538, no third arg), so entity-keyed ledger entries can't be addressed by
   name from the commands ("No matching state entry") and command-set truths
   land text-keyed, which don't scope by `matchedEntityIds`. The correction
   dialog is unaffected (it iterates real keys).
9. **NARR-BOND-RANK-STALE** (WRONG-DETAIL, small): CHARACTER STATE's
   connection lines read the bond **Item's** rank
   (`readConnections` → `b.system.rank`, actorBridge.js:243), which is seeded
   at creation and never updated when the record's rank raises
   (develop-match / `!bond`-match raise the record only;
   `setBondItemTicks` mirrors ticks, not rank).

## 4. Design-level exposure (decisions, not plain bugs)

- **The consistency check — the only active contradiction defense — defaults
  OFF** (cost: ~$0.0004 + 200-500ms/narration), and when on it audits prose
  against **truths + state only**: the frame, ship position, entity cards,
  and world truths are unaudited. Detection posts a GM whisper; nothing
  auto-corrects.
- **The rolling session summary is injected every non-meta turn but never
  validated** against the ledger; it re-summarizes raw card prose including
  narration whose facts were later retracted — a stale/hallucinated summary
  line can re-seed a contradiction every turn ("not a fact store" is a
  design note with no enforcement).
- **Raw oracle results have no memory home**: `!oracle` / `!ptp` outcomes are
  neither ledgered nor injected (move-path oracle seeds are), so the narrator
  can contradict an oracle the table just rolled.
- **The scene frame is applied unvalidated** — a full-replacement snapshot
  with no cross-check against truths; an omitted frame silently keeps the
  previous one (documented idempotence ↔ staleness trade, backlog §8.3).
- **World Journal state transitions ride an unvalidated Haiku read** of the
  prose (threat severity / faction attitude / lore contradiction); the
  lore-contradiction card has no retract button (only the fact-continuity
  review card does).
- **Relevance is lexical** — pronouns/nicknames match nothing; move-path
  relevance deliberately doesn't union frame names (documented, with a
  permission-classification reason).
- **Scene-end tier migration can double-capture**: a fact captured live to an
  entity tier during the scene and migrated again at scene end lands twice
  (`appendMigratedTruthToTier` has no dedup, unlike the live path).
- **Summary persistence gates on `game.user.isGM`** rather than
  `isCanonicalGM` (multi-GM last-writer race; low severity).
- **Doc drift** in `narrator-memory-architecture.md`: the §6.5 maxTokens
  table, the truncation-warning implication, the retraction-defense claim,
  the §8.1 vignette backlog entry (since done), and the §9 checklist's
  inciting assumptions all need reconciling with the code.

## 5. What held up under audit

The single-assembly seam (`buildNarratorExtras`) is honored by every mode;
never-dropped ledger tiers hold in code exactly as documented; state
supersedes cleanly per subject+attribute; the ship-position "do NOT invent"
guard exists; the premise block makes the opening canon durable; the
galley/end-session vignettes joined the ring (ahead of the doc); parse
tolerance never blocks a narration post; and all ledger writes are
canonical-GM gated.
