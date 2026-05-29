# Design Memo — Group C: Paced-path detection wire-up

**Target:** starforged-companion v1.2.x → next minor
**Status:** AWAITING SIGN-OFF before implementation (C2) begins
**Based on:** narrator-suggestion-loop-remediation brief §C, suggestion-loop-investigation report

---

## Purpose

The narrator may name an NPC, location, or faction inside a paced-narrative turn — the classifier sends the input to `narratePacedInput`, the model writes prose that introduces "Maren leans against the bulkhead, scanning the bay," and nothing further happens. Today the detection pipeline (`runCombinedDetectionPass` → `routeEntityDrafts` → `routeWorldJournalResults`) only fires from `runPostNarrationPasses`, which is only called from `narrateResolution`. The paced path posts a chat card and returns. Result: named entities in paced narration vanish from the campaign record.

Group A removed the prompt-level incentive to *propose* in prose. Group B retuned the classifier so depicted-intent inputs route to the move pipeline (and thus to the existing detection path). What's left is the gap when the classifier correctly decides NARRATIVE *and* the narrator nonetheless names something canonical-feeling — that should still be captured.

This memo answers the four C1 questions verbatim from the brief.

---

## Q1 — What detection runs on paced-narrative narration?

**Decision: a paced-flavored subset of `runCombinedDetectionPass`.**

Run:
- **Entity extraction.** This is the entire point of Group C — surface the NPC the narrator just named.
- **World-Journal lore + threat + faction + location detection.** Yes. The narrator can drop a lore beat or threat in paced prose just as easily as in move-resolution prose; the WJ branch already filters on confidence and dedupes, so the routing rule at `routeWorldJournalResults` ([src/entities/entityExtractor.js:324](../src/entities/entityExtractor.js)) handles this cleanly.

Skip:
- **`appendGenerativeTierUpdates`** ([src/entities/entityExtractor.js:423](../src/entities/entityExtractor.js)). This is the interaction-class branch — it requires `entityRefs` from the relevance resolver. There is no relevance resolution upstream of `narratePacedInput` today, so we have no matched-entity list to update against, and the brief explicitly flagged this branch as not appropriate here. The implementation should simply not pass interaction-class refs; `runPostNarrationPasses`' existing `if (cls === 'interaction' && ...)` guard at [src/narration/narrator.js:251](../src/narration/narrator.js) already skips this branch when called with `discovery` class.

Skip:
- **The `make_a_connection` auto-create branch.** See below.

### Path 1 vs Path 2 — what "skip auto-create" actually means

The codebase has three paths by which an NPC / connection / faction record gets created today:

| # | Trigger | Where it fires | Net result |
|---|---|---|---|
| **1** | Move pipeline, `make_a_connection` move + strong/weak hit | `runDiscoveryDetection` called with `autoCreateConnection: true` (see [src/narration/narrator.js:236](../src/narration/narrator.js)) | **Auto-creates** a `connection` journal entry. No GM review. Lands silently in the player's character chronicle and entities list. |
| **2** | Move pipeline, any other discovery-class move (e.g. `gather_information`, `face_danger` strong-hit narration that names someone) | `runDiscoveryDetection` called with `autoCreateConnection: false` (async, ~2 s after narration) | **Drafts** posted to a GM-only whispered chat card via `postDraftEntityCard`. GM opens the Entities panel and clicks Confirm per entity, filling in canonical fields (role, motivation, disposition) before the journal entry is created. |
| **3** | Player-declared — typed `!journal` chat commands, Entities-panel "New connection…" button, or the Sector Creator wizard | Settings panel / chat-command paths | **Explicit** creation by user action. No model in the loop. |

Path 1 is the special case. The gate at [src/entities/entityExtractor.js:282](../src/entities/entityExtractor.js) reads:

```js
if (options.autoCreateConnection && entity.type === "connection" && !created.length) {
  // calls createConnection() immediately — full journal entry, page flags, the works
}
```

The `&& !created.length` clause caps it at one auto-create per call so the model can't go wide on a single `make_a_connection` roll. The whole branch exists because `make_a_connection` is the one move whose *purpose* is to establish a relationship with an NPC — when the player rolled it and hit, the system has unambiguous consent to commit. That's the spec'd, validated behaviour and Group C does not touch it.

### Why Group C does not pass `autoCreateConnection: true`

In a paced-narrative turn there is no move and no roll. The player typed something like *"I lean against the bulkhead and watch the bay"*, the classifier said NARRATIVE, the narrator wrote prose that named "Maren." There is no `make_a_connection` happening, the precondition for Path 1 was never met, and the player did not explicitly choose to commit a relationship.

So the named NPC takes **Path 2**: the detection pass extracts it, `routeEntityDrafts` skips the auto-create branch (because we explicitly do not set `autoCreateConnection: true`), and the entity falls through to `queued.push(entity)` → `postDraftEntityCard`. The GM sees a whispered card:

> ◈ **New Entities Detected**
> - [👤 Connection] **Maren** — Wiry, watchful, leans against the bulkhead
>
> *Open the Entities panel to confirm or dismiss.*

The GM opens the Entities panel, fills in the canonical fields the model can't reliably invent (role, rank, disposition, motivation), and clicks Confirm. *Then* the connection journal entry is created. If the GM dismisses, the name goes into `campaignState.dismissedEntities` so the same model doesn't keep proposing it next turn.

This is identical to how Path 2 already works for non-`make_a_connection` discovery moves — Group C adds paced-narrative as one more source feeding into the same GM review surface, with the same affordances and the same dedup behaviour. **No new UI. No new commands. The `make_a_connection` auto-create wiring is unchanged.**

### Could paced detection ever auto-create?

In principle, yes — e.g. on Chaotic + high model confidence + a name that doesn't collide with anything dismissed — but it's not what the brief asked for and it's the wrong default. The Path 1 design rests on the player *explicitly choosing* `make_a_connection` and the dice saying yes. In paced narration there is no equivalent consent signal. The closest analogue — "the narrator wrote a compelling NPC name and the GM didn't `!roll` the previous input" — is not consent; the player may have been describing atmosphere and the narrator riffed. Defaulting to GM review preserves the spec invariant that *only deliberate, dice-backed creation skips review*.

If a future change wants softer behaviour, the surface for it already exists (the `options` bag on `routeEntityDrafts`) and the test pattern already exists (the connection-pipeline Quench batch). Out of scope here.

### What `runPostNarrationPasses` does not do for paced detection

`runPostNarrationPasses` ([src/narration/narrator.js:216](../src/narration/narrator.js)) is the move-pipeline orchestrator — it dispatches by `relevance.resolvedClass` (`discovery` / `interaction` / `embellishment`) and decides synchronous vs async based on `moveId === "make_a_connection"`. Paced detection has no resolvedClass and no moveId, so it bypasses this orchestrator entirely and calls `runCombinedDetectionPass` + `routeWorldJournalResults` + `routeEntityDrafts` directly — same code, simpler dispatch.

This also means the interaction-class `appendGenerativeTierUpdates` branch can't accidentally fire from the paced path (it requires `cls === 'interaction'` and an `entityIds` array, neither of which exist when calling the routers directly).

---

## Q2 — How is the synthetic move context constructed?

**Decision: sentinel for now, refactor as follow-up.**

`runCombinedDetectionPass` accepts `(narrationText, moveId, outcome, campaignState, options)` ([src/entities/entityExtractor.js:93](../src/entities/entityExtractor.js)). The only place `moveId` and `outcome` are consumed is inside `buildCombinedDetectionPrompt` at lines 130–132:

```
`Move: ${moveId}.`,
`Outcome: ${outcome}.`,
```

Two prompt lines, no downstream branching, no parser dependency. The function is already tolerant of arbitrary string values — we just need to pick a sentinel that's legible to the model and doesn't break the prompt's structure.

**Proposal:**
- `moveId = "paced_narrative"`
- `outcome = "n/a"`

Then update `buildCombinedDetectionPrompt` to render these two lines conditionally so the model isn't confused by `Outcome: n/a` masquerading as a real outcome:

```js
const moveLine    = moveId    && moveId    !== "paced_narrative" ? `Move: ${moveId}.`       : `Move: (paced narration — no move was rolled).`;
const outcomeLine = outcome   && outcome   !== "n/a"             ? `Outcome: ${outcome}.`   : null;  // omit entirely
```

The conditional path keeps the existing move-pipeline prompt identical (cache-friendly — same string bytes for the same inputs) and gives the paced path a clearer framing.

**Why sentinel over refactor:** the brief's read is correct — sentinel is faster, refactor is cleaner. The refactor would be to accept a discriminated input shape (`{ kind: "move", moveId, outcome } | { kind: "paced" }`) and branch the prompt builder. Worth doing eventually for tidiness, but it touches every test that constructs a detection call and offers no behaviour gain over the sentinel. Mark it as a follow-up in `docs/known-issues.md` if we want to track it.

**`routeEntityDrafts` and `routeWorldJournalResults`** do not see `moveId`/`outcome` at all — no changes needed downstream.

---

## Q3 — Is detection gated by mischief dial?

**Decision: yes — gate it. Lawful skips; Balanced and Chaotic run it.**

Rationale per the brief: Haiku cost per paced turn is non-trivial, and false-positive detection on atmospheric prose ("the dust motes catch the failing light" should not spawn a "Dust Motes" creature draft) is the most likely failure mode.

The Lawful posture in Group B already declines to classify as MOVE without explicit verbal markers — i.e. Lawful tables value strictness over inference. Skipping paced detection on Lawful matches that posture: if the player wanted the NPC captured, they would have rolled the move. The mischief dial is the *one* knob doing double duty already (classifier posture + interpretation posture); adding paced-detection gating to the same knob keeps the surface area consistent and avoids inventing a fourth setting.

Mapping:

| Mischief dial | Paced-path detection | Justification |
|---|---|---|
| Lawful | **Skip** | Matches strict-classifier posture; preserves zero-cost paced narration |
| Balanced (default) | Run | Most opening-scene play; matches "infer commitment from depicted action" |
| Chaotic | Run | Aggressive inference posture; players already opted in to more catches |

Implementation: `narratePacedInput` reads `getMischiefDial()` (or accepts it via the options object — see Q4 implementation note), normalises via `normalizeMischiefForClassifier`, and bails before the detection call when posture === `"lawful"`.

**No new settings.** No new UI. This is the durable answer the maintainer flagged in the brief — the mischief dial absorbs classifier sensitivity *and* paced detection.

---

## Q4 — What happens to detected entities?

**Decision: same review surface as move-pipeline drafts. No special-casing.**

Tracing the existing path from `runPostNarrationPasses` → `runDiscoveryDetection` ([src/narration/narrator.js:271](../src/narration/narrator.js)) → `routeEntityDrafts` ([src/entities/entityExtractor.js:273](../src/entities/entityExtractor.js)):

- `entityExistsForName` dedupes against established entities (same as move path).
- The `autoCreateConnection` branch is gated on `options.autoCreateConnection === true` (which we explicitly do not set for paced detection — see Q1).
- Everything else falls into `queued.push(entity)` → `postDraftEntityCard(queued, campaignState)`.

`postDraftEntityCard` is the GM-only chat card with Accept / Dismiss buttons that already serves the move-pipeline discovery branch. Paced-path drafts land in exactly the same card with exactly the same affordances. The GM sees one card, clicks Accept on the ones that should be captured, the rest are dismissed via `dismissedEntities`.

**Routing-rule observance.** `routeWorldJournalResults` ([src/entities/entityExtractor.js:324](../src/entities/entityExtractor.js)) already applies the §4 routing rule from the World Journal scope — faction/location detections only land in the WJ when no entity record with that name exists; lore and threats always land. That rule applies identically to paced-path detection.

**Telemetry.** Add a flag on the draft card / WJ entry payload to indicate the source (`source: "paced_narrative"` vs the default `"move_resolution"`) so we can audit how often paced detection is firing and what the GM does with those drafts. This is optional but cheap — one additional flag set in the entity draft and WJ entry creation paths, exposed through the existing GM-only review surface.

---

## Implementation sketch (C2 preview — not part of this memo's ask)

```js
// src/narration/narrator.js — narratePacedInput, after postPacedNarrativeCard

import { getMischiefDial } from "../ui/settingsPanel.js";
import { normalizeMischiefForClassifier } from "../pacing/classifier.js";

// ... inside narratePacedInput, after the card is posted ...

await postPacedNarrativeCard(text, playerText, sessionId, suggestedMove);

// Group C — paced-path detection. Gated on mischief dial: Lawful skips.
const posture = normalizeMischiefForClassifier(getMischiefDial());
if (posture !== "lawful") {
  // Fire and forget — same ASYNC_DETECTION_DELAY_MS pattern as the
  // existing discovery-class async branch (~2 s) so the chat card
  // settles before the draft card appears.
  setTimeout(() => {
    runPacedDetection(text, playerText, campaignState)
      .catch(err => console.error(`${MODULE_ID} | paced detection failed:`, err));
  }, ASYNC_DETECTION_DELAY_MS);
}

return text;
```

```js
// New helper, sibling of runDiscoveryDetection.
async function runPacedDetection(narrationText, playerText, campaignState) {
  const detection = await runCombinedDetectionPass(
    narrationText,
    "paced_narrative",   // sentinel
    "n/a",               // sentinel
    campaignState,
  );
  await routeWorldJournalResults(detection.worldJournal, campaignState);
  await routeEntityDrafts(detection.entities, campaignState, {
    autoCreateConnection: false,        // never for paced
    sessionId:            campaignState?.currentSessionId ?? "",
    source:               "paced_narrative",   // telemetry only
  });
}
```

```js
// src/entities/entityExtractor.js — buildCombinedDetectionPrompt
// Conditional rendering of the move/outcome lines so paced calls don't
// produce confusing "Outcome: n/a" prose in the prompt.
const moveLine    = (moveId && moveId !== "paced_narrative")
  ? `Move: ${moveId}.`
  : `Move: (paced narration — no move was rolled).`;
const outcomeLine = (outcome && outcome !== "n/a")
  ? `Outcome: ${outcome}.`
  : null;

return [
  `You are analysing an Ironsworn: Starforged narration.`,
  moveLine,
  ...(outcomeLine ? [outcomeLine] : []),
  // ... rest unchanged ...
].join("\n");
```

LOC estimate: ~40 lines in `narrator.js`, ~6 lines in `entityExtractor.js`, plus tests.

---

## Tests + acceptance per §C3

**New unit tests (tests/unit/):**
- `narratePacedInput` calls detection on Balanced + Chaotic; skips on Lawful. Mock `runCombinedDetectionPass`, assert call count.
- `buildCombinedDetectionPrompt` renders the paced framing line when `moveId === "paced_narrative"`; renders the legacy `Move: ${moveId}.` line otherwise. Pin both strings.
- `buildCombinedDetectionPrompt` omits the `Outcome:` line when `outcome === "n/a"`; renders it otherwise.

**New Quench batches (or extensions to existing narrator batches):**
- Paced-narrative turn introducing a named NPC produces an entity draft on Balanced and Chaotic; produces no draft on Lawful.
- Paced-narrative turn that names a faction routes through the §4 rule (faction-only WJ entry, no entity record duplication).
- No regression in the move-pipeline detection batches.

**Manual smoke (per §C3):**
- Replay the dry-run turn from the live test where the narrator introduced an unnamed NPC in prose. Confirm the NPC draft lands on Balanced.
- Same input on Lawful: confirm no draft.
- Atmospheric input that doesn't name anything: confirm no draft on any posture (the detection pass returns empty arrays, not false positives).

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Cost per paced turn doubles (narrator call + detection call). | Async detection (`setTimeout` 2 s, fire-and-forget) so it doesn't block the player; gated by mischief dial so Lawful tables pay zero. Cost per detection ≈ same as move-pipeline detection (~$0.0006 with caching). |
| False-positive drafts from atmospheric prose. | The detection prompt already filters on `confidence !== "low"` and dedupes against established + dismissed names. Drafts go through GM-only review, never auto-commit. The "dust motes" failure mode requires the model to assign `confidence: "high"` to atmosphere, which the existing prompt and filter discourage. |
| Paced detection fires for `@scene` / X-Card / interrogation paths. | These paths do not call `narratePacedInput` — they go through `interrogateScene` or short-circuit earlier in `routePacedInput`. The gate naturally inherits from the existing routing. |
| Sentinel string `"paced_narrative"` collides with a real move id later. | foundry-ironsworn move ids are snake_case derivatives of canonical moves — `paced_narrative` is not in the catalog and is not a valid move name. Low risk. Documented in the sentinel constant. |
| `appendGenerativeTierUpdates` accidentally fires from paced path. | Guarded by `cls === 'interaction' && entityIds.length` at `narrator.js:251`. Paced detection does not go through `runPostNarrationPasses` at all — it calls `runCombinedDetectionPass` + routers directly. |

---

## Open questions for sign-off

1. **Sentinel string preference.** `"paced_narrative"` for `moveId` and `"n/a"` for `outcome` — acceptable, or prefer something else (`null`, `""`, a distinct underscore-prefixed string like `"__paced__"`)? The conditional render makes any choice work; just want the maintainer's preference baked in before I implement.
2. **Telemetry source flag.** Add `source: "paced_narrative"` to the draft card / WJ entry payload? Costs nothing; surfaces "how often is paced detection firing" without instrumentation later.
3. **Async vs sync detection.** Brief is silent — I'm proposing async (2 s delay, fire-and-forget) to match the existing non-make_a_connection discovery branch. Move pipeline awaits its detection on `make_a_connection` because the auto-create has to land before the move is considered complete; paced has no such constraint. Confirm async is the right shape.
4. **Mischief dial accessor.** `narratePacedInput` currently does not import `getMischiefDial()`. Two options:
   - **(a)** Import it in `narrator.js`. Adds a UI-layer dependency to the narrator module.
   - **(b)** Thread `mischiefDial` through the existing options bag (already passed `{ suggestedMove }`). Caller in `src/pacing/router.js` already has the dial in `routePacedInput` (added in Group B).
   - My recommendation: **(b)** — keeps `narrator.js` posture-agnostic, mirrors how Group B threaded the dial through `routePacedInput` → `classifyInput`. Confirm preference.
5. **Quench scope.** New dedicated batch (`starforged-companion.pacedDetection`) or extend an existing narrator batch? Brief is silent. I'd go new batch — same pattern as the existing `connectionPipeline` batch.

---

## Out of scope

- No UI for tuning paced-detection sensitivity. The mischief dial is the surface.
- No automatic confirmation of drafts. GM review stays mandatory.
- No retrofit of scene-interrogation (`interrogateScene`) — by design, per the original "the narrator is a camera here, not a writer" framing in Group A's `scene_interrogation` role description.
- No new chat command. Recovery (`!roll`) is for the opposite case; paced detection doesn't need a recovery affordance because drafts already need GM accept.

---

## Sign-off

If the answers to the five open questions above are acceptable as proposed (sentinel = `"paced_narrative"`/`"n/a"`, source flag added, async detection, threaded dial via options bag, new Quench batch), I can proceed to C2 implementation. Otherwise tell me what to change and I'll revise this memo before writing any code.
