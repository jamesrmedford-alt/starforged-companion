# Investigation Report: Narrator Suggestion-Loop Behavior

**Target:** starforged-companion v1.2.1
**Mode:** investigation only — no code changes
**Date:** 2026-05-12

---

## TL;DR

The "asterisk brackets" suggestion-loop is not an emergent model behavior. It's **explicitly prompted** by `buildPacedNarrativeUserMessage` and structurally guaranteed by a one-way pipeline that (a) classifies most inputs as NARRATIVE under the default dials, (b) instructs the narrator to end with an italicized "*if you want to…*" line, then (c) returns control to the player with no mechanism to detect, route, or act on that suggestion. Narration-driven entity creation exists in code but is wired **only** to the move branch — the paced-narrative branch posts prose and stops.

---

## 1. Root cause hypothesis (ranked)

### H1 — The paced-narrative user prompt commands the suggestion behavior (HIGH likelihood, primary cause)

`src/narration/narratorPrompt.js:469-500` (`buildPacedNarrativeUserMessage`) is the smoking gun. When the pacing classifier returns `NARRATIVE_WITH_MOVE_AVAILABLE`, the user message contains:

> "End your narration with ONE italicized sentence inviting this move, in the narrator's voice. Do not announce it mechanically. Examples:
> *If you want to read him for tells, this could be a Gather Information.*
> *Pressing further here would be a Compel.*"

This is the literal source of the observed `*you could make her a connection*` / `*you could push through*` prose. The model is doing exactly what the prompt asks for. Every NARRATIVE_WITH_MOVE_AVAILABLE turn appends a "soft offer" sentence by design.

### H2 — Default pacing dials push almost everything into the NARRATIVE branches (HIGH likelihood, structural amplifier)

`src/pacing/classifier.js:127` defaults: combat 9, investigation 6, **exploration 5, social 3**, downtime 1. For an opening scene that's social/exploratory, the classifier prior is 30–50%. Combined with the explicit guidance at `classifier.js:84-88` — "If the player's input could warrant a move but they have not signalled intent to push (no 'I try to'…), prefer NARRATIVE_WITH_MOVE_AVAILABLE" — most conversational play resolves to that branch. The player has to use a specific verb pattern to trip MOVE.

This is the loop substrate. H1 generates the prose; H2 keeps the player there.

### H3 — `narratePacedInput` does not run any post-narration detection pass (HIGH likelihood, the entity-creation gap)

`src/narration/narrator.js:648-706`. The paced-narrative path posts a chat card and returns. It never calls `runPostNarrationPasses`, `runCombinedDetectionPass`, or `routeEntityDrafts`. Those exist (and work) only inside `narrateResolution` at `narrator.js:165`, which is only reachable through the move pipeline.

Consequence: when the narrator says "Maren leans against the bulkhead, scanning the bay" inside a paced-narrative turn, no detection scan runs. No NPC draft card. No connection record. The character is named in prose, then forgotten.

### H4 — The role/style block frames the narrator as a *consequence-of-moves* narrator (MEDIUM likelihood, contributing prompt drift)

`narratorPrompt.js:313-321`: "Your role is to narrate **the mechanical consequences of move outcomes** as vivid, atmospheric prose…" This is correct for `narrateResolution` but is reused verbatim in `narratePacedInput` (and `interrogateScene`). In the paced path there *is* no move outcome — yet the system prompt still claims that's the role. The model is given a job description that doesn't match the call site, so it falls back to "describe and offer" instead of "depict and commit."

### H5 — Tone strings nudge but do not cause (LOW likelihood)

`wry` ("notices the irony…does not pretend not to notice") and `noir` ("the city has seen it all") could *mildly* license commenting on possibility rather than enacting it, but `grim_and_grounded` and `matter_of_fact` produce the same loop given H1+H2+H3. The brief is right to suspect the tone, but it's a co-factor at most. Removing H1 would eliminate the symptom in every tone; changing tone without removing H1 wouldn't.

### H6 — Bracketed prose in observed examples may be the model overgeneralizing the italic hint (MEDIUM)

The prompt only mandates an italic *closing* sentence for `NARRATIVE_WITH_MOVE_AVAILABLE`. If the narrator is producing **inline** bracketed suggestions mid-prose ("describes a character and adds `*you could make her a connection*`"), the model has generalized the pattern beyond the explicit instruction. That suggests the role block and the closing-hint instruction together teach a "suggest don't depict" stance that bleeds into the body. Plausible model-behavior contributor; rests on H1 as the seed.

---

## 2. Pipeline gap analysis

| Spec'd capability | Status in code | Reference |
|---|---|---|
| Three creation triggers (oracle-driven, player-declared, narration-driven) | **Partial.** Narration-driven detection exists at `src/entities/entityExtractor.js:93` (`runCombinedDetectionPass`) and is invoked from `src/narration/narrator.js:216` (`runPostNarrationPasses`). | scope-index "Narrator Entity Discovery" ✅ |
| Narration-driven trigger fires for **move-pipeline** narration | Wired and works. `narrateResolution` → `runPostNarrationPasses` → routing by `resolvedClass`. | `narrator.js:164-165`, `:216-269` |
| Narration-driven trigger fires for **paced-narrative** narration | **Not wired.** `narratePacedInput` does not call detection. | `narrator.js:648-706` (no call to `runPostNarrationPasses`) |
| Narration-driven trigger fires for **scene-interrogation** narration | Not wired (by design — scene queries are "camera, not writer"). | `narrator.js:566-633` |
| Italic move-hint at end of paced narration → player can act on it | **One-way only.** Hint is generated (`narratorPrompt.js:478-489`); no return path. After narration is posted, `routePacedInput` returns `runMove:false` and `index.js:448` bails. The hint is decorative — there is no mechanism for the player's *next* message to pick it up. | `router.js:212-228`, `index.js:427-448` |
| Narrator-suggested move routed back into move interpretation | **Does not exist.** Pipeline is strictly forward: player → classifier → (move OR narrate-and-stop). | `index.js:316-569` |

---

## 3. Proposed intervention surface area (low-risk → high-risk)

### Level 0 — Prompt surgery (lowest risk, hours)
**Files:** `src/narration/narratorPrompt.js` only.

- **0a.** Remove or rewrite the "End your narration with ONE italicized sentence inviting this move" block in `buildPacedNarrativeUserMessage` (lines 478-489). Replace with depict-don't-offer guidance: "Continue the fiction as if the player has already committed to the next obvious beat; let the scene press on them."
- **0b.** Add an explicit anti-suggestion clause to the role/style block at `narratorPrompt.js:313-321` and/or the `embellishment` and (new) paced-narrative permission block: "Do not propose actions to the player. Do not surface mechanical options in prose. Depict; do not offer."
- **0c.** Decouple the role description in `narratePacedInput`. Today it reuses `buildNarratorSystemPrompt` verbatim, which claims the narrator's job is to narrate move outcomes. In paced-narrative mode the system prompt should say "continue the fiction" instead, and should not inherit the embellishment/discovery/interaction permission blocks (none of which are passed in the paced call, but the role block still references "move outcomes").
- **0d.** Audit the `wry` tone string for "comment on possibility" connotation; consider tightening to "knowing but committed — the narrator depicts what happens, doesn't editorialize about what could."

**Effort:** half a day. **Risk:** none — pure string changes; covered by Quench narrator batches.

### Level 1 — Wire post-narration detection into the paced-narrative path (medium risk, ~1 day)
**Files:** `src/narration/narrator.js`, `src/pacing/router.js` (or the index hookup).

Have `narratePacedInput` run a narration-only flavor of `runCombinedDetectionPass` — extracting entities and WJ candidates but skipping the "interaction-class generative tier" branch since there's no relevance resolution upstream. This makes named entities in paced narration actually land in the chronicle.

Caveats:
- Need to define what "narrator class" applies. Default to `discovery`-like routing (entity drafts + WJ lore), gated by mischief or a new setting so it can be disabled.
- No move outcome to pair the detection with — pass a synthetic `paced_narrative` moveId + `null` outcome and update `runCombinedDetectionPass` to tolerate it.

**Effort:** 1 day. **Risk:** medium — adds a Haiku call per paced turn (cost), and detection-pass false positives become visible. Quench coverage exists.

### Level 2 — Move the move-hint surface from the narrator's prose into the chat UI (medium risk, ~1–2 days)
**Files:** `src/narration/narrator.js` (`postPacedNarrativeCard`), narrator card CSS/template, possibly `src/index.js` to register a click handler.

Stop asking the model to write the italic hint. Instead, when `suggestedMove` is set, render an actionable affordance on the narration card itself — e.g. a small "Try this as: Gather Information" pill. Clicking it stuffs the player's most recent narration back into the move pipeline with `forceNextAsMove` semantics so the existing `interpretMove` → `confirmInterpretation` → `resolveMove` chain runs.

This satisfies the spec constraint better than the current italic hint: the player still narrated freely, and the system commits when they're willing — without forcing them to retype with magic words like "I try to."

**Effort:** 1–2 days. **Risk:** medium — touches UI render and pipeline entry. Need to handle: hint goes stale once the player types again; multi-client semantics; ensuring the move runs with the right narration context (the original player text that produced the hint).

### Level 3 — Bidirectional narrator → move-interpreter loop (highest risk, ~2–4 days)
**Files:** `src/index.js`, `src/narration/narrator.js`, new detection pass.

Post-narration scan reads the narrator's prose for "depicted" actionable moments (per H6, the model already wants to write them) and *automatically* runs the move pipeline for them on the player's behalf. This is the "narrator that commits" version.

Strongly recommend **against** Level 3 unless Level 0 + Level 2 prove insufficient. It re-introduces friction in a different shape (the system rolls things the player didn't ask for) and is the kind of feedback loop that's hard to reason about. Per the brief's own guidance — *fix the source, not add a downstream catcher.*

---

## 4. Open questions for the maintainer

1. **Is the italic-hint behavior in `buildPacedNarrativeUserMessage` working as intended in any scenario?** It's recent (Pacing scope ✅ COMPLETE) and the live test shows it failing. Was there a successful internal demo of it triggering action? If so, what made that work that's missing now?
2. **Should paced-narrative narration run an entity-detection pass at all?** Pro: matches spec's third creation trigger and would have captured the NPC the narrator named. Con: cost (extra Haiku call per turn) and false-positive risk on atmospheric prose where the narrator drops a name in passing.
3. **What's the right default for the social/exploration dials?** Current defaults (3 and 5) appear to bias hard toward NARRATIVE for the kind of opening-scene play described. Is the dial setting itself a contributing cause that needs retuning, independent of any prompt change?
4. **For Level 2 — what should the click-the-hint affordance feel like?** A pill button on the card? An inline link in the italic sentence? A confirmation dialog vs. immediate roll? Each is conversation-native to a different degree.
5. **Scope question:** the brief calls the runtime custom-instructions patch a "stopgap." Is the durable fix expected to land before the next live session, or is this an investigate-now-implement-next-sprint thing? That affects whether to recommend Level 0 alone (ships fast) or Level 0 + Level 1 together.
6. **Tone string audit:** does the maintainer want all five tone descriptions rewritten for a "depict, don't offer" stance, or just `wry`?

---

## Recommendation in one line

Land Level 0 immediately (it removes the proximate cause and is reversible in a single commit), then evaluate Level 1 and Level 2 separately against a fresh live test — don't bundle them.
