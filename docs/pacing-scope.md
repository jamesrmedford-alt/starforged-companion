# Starforged Companion — Pacing Scope
## Pre-classifier for move-vs-narrative routing — "not everything is a roll"

**Status:** 📋 PLANNED
**Priority:** High — addresses pacing/exhaustion observed in playtesting
**Estimated Claude Code sessions:** 2
**Dependencies:** Move interpreter (✅), narrator (✅), settings infrastructure (✅)
**Related:** Mischief dial (existing — distinct concept, colocated UI)

---

## 1. Overview

The Starforged rulebook states explicitly that not every action is a move.
Moves trigger from fiction *plus* uncertainty, not from any character action.
The current module pipeline routes every undecorated chat input through the
move interpreter, which forces a roll for almost every input. Playtesting has
shown this produces pacing fatigue and undermines drama by mechanizing
moments that should be pure fiction.

`@scene` exists as a deliberate bypass but is too stark — using it feels like
asserting your way out of a situation rather than letting the fiction breathe.

The Pacing feature inserts a **pre-classifier** between input and the move
interpreter. The classifier is a small Haiku call that decides whether an
input warrants a move at all, returns one of three states, and routes
accordingly:

| State | Routing |
|---|---|
| `MOVE` | Existing move interpreter pipeline runs unchanged |
| `NARRATIVE` | Narrator responds in fiction; no roll, no move resolution |
| `NARRATIVE_WITH_MOVE_AVAILABLE` | Narrator responds in fiction with an inline hint that a specific move is available if the player wants to push |

The classifier reads the current scene context, addressee identity (notably:
is this a connection?), recent move density, and per-category pacing dials.
`@scene` is preserved unchanged as the player-asserted hard override.

---

## 2. User experience

### 2.1 Default flow (no change visible to player)

Player types undecorated chat input. The classifier runs. One of three things
happens:

**MOVE.** Existing pipeline. Move card with roll, outcome, narration. No
visible difference from current behaviour.

**NARRATIVE.** Narrator responds in fiction without a move card. Reads as a
direct continuation of the scene. No dice. No mechanical state change.

**NARRATIVE_WITH_MOVE_AVAILABLE.** Narrator responds in fiction, with a final
italic line nominating a move:

```
The diplomat's smile thins. He sets down his glass with deliberate care
and watches you across the table — the silence between you stretching
just long enough to be uncomfortable.

*If you want to press him on the shipment, this could be a Compel.*
```

The player can ignore the hint and continue narratively, or reply with intent
to push (e.g., "I'll push him on the shipment") — that next input will
classify as `MOVE`, run the interpreter, and resolve as Compel.

### 2.2 `@scene` unchanged

`@scene` remains the player-asserted hard override. Classifier is bypassed
entirely. Use case: the player wants narrative continuation regardless of
what the classifier would have decided.

### 2.3 Scene override (`!pace`)

The GM can shift pacing for the current scene mid-play:

```
!pace hot          # +3 across all categories for this scene
!pace quiet        # -3 across all categories for this scene
!pace clear        # remove scene override, return to dial defaults
!pace status       # show current effective dial values
```

Scene override is a modifier, not a replacement. Combat at dial 9 with
`!pace hot` becomes effective 10 (capped). Social at dial 3 becomes 6 — still
narrative-leaning, but markedly more move-prone.

The override persists until cleared, the scene changes (next `@scene`), or
the session ends.

### 2.4 Recovery from misclassification

**False negative** (classifier said NARRATIVE, player wanted a roll): player
rephrases with intent ("I attempt to..."), or types `!roll` to force the move
interpreter on their last input.

**False positive** (classifier said MOVE, roll happened, player didn't want
it): no recovery in v1. The roll has happened; live with it. `@scene` exists
for the next input. Telemetry captures the correction so dials can be tuned.

---

## 3. New file: `src/pacing/classifier.js`

```js
/**
 * Pacing pre-classifier.
 * Decides whether an input warrants a move (MOVE), should be pure
 * narration (NARRATIVE), or is narration with a move available
 * (NARRATIVE_WITH_MOVE_AVAILABLE).
 */

export const PACING_DECISION = Object.freeze({
  MOVE:                            "MOVE",
  NARRATIVE:                       "NARRATIVE",
  NARRATIVE_WITH_MOVE_AVAILABLE:   "NARRATIVE_WITH_MOVE_AVAILABLE",
});

export const PACING_CATEGORIES = Object.freeze([
  "combat", "investigation", "exploration", "social", "downtime",
]);

/**
 * Classify a player input.
 *
 * @param {object} args
 * @param {string} args.playerText            — raw chat input
 * @param {object} args.campaignState         — full state (for scene/character)
 * @param {object} args.character             — speaker's character
 * @param {object} args.recentMoveDensity     — { count, window, scene }
 * @param {object} args.pacingConfig          — { dials, sceneOverride }
 * @returns {Promise<{
 *   decision: keyof typeof PACING_DECISION,
 *   suggestedMove: string|null,
 *   category: string,
 *   confidence: number,
 *   reasoning: string,
 * }>}
 */
export async function classifyInput({
  playerText, campaignState, character, recentMoveDensity, pacingConfig,
}) { /* ... */ }

/**
 * Build the classifier context packet (cacheable prefix + volatile tail).
 */
export function buildClassifierContext(args) { /* ... */ }

/**
 * Effective dial value after scene override is applied.
 */
export function effectiveDial(category, pacingConfig) { /* ... */ }
```

### Key methods

**`classifyInput`** — assembles the context packet, calls Haiku, parses the
JSON response, returns the decision object.

**`buildClassifierContext`** — splits into a cacheable prefix (move catalog
summary, dial config, character static facts) and a volatile tail (current
scene snapshot, recent move density, player input). Designed for prompt
caching — see §13.

**`effectiveDial`** — applies scene override modifier (`+3`, `-3`, etc.) and
clamps to `[0, 10]`.

---

## 4. Classifier context packet

```
## PACING CLASSIFIER — ROLE

You decide whether a player's input should trigger an Ironsworn: Starforged
move, be handled as pure narration, or be handled as narration with a move
available if the player wants to push.

You return JSON only — no preamble, no explanation outside the JSON. Schema:
{
  "decision": "MOVE" | "NARRATIVE" | "NARRATIVE_WITH_MOVE_AVAILABLE",
  "suggestedMove": "<move name>" | null,
  "category": "combat" | "investigation" | "exploration" | "social" | "downtime",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence>"
}

## DECISION GUIDANCE

A move triggers from fiction PLUS uncertainty. If the outcome is not in
doubt, or the action is too small to matter mechanically, prefer NARRATIVE.

The pacing dials below indicate, per category, how move-leaning the table
wants this scene type to be. 10 means almost always a move. 0 means almost
never. Treat the dial as a strong prior, not an absolute.

If the action *could* warrant a move but the player has not signalled
intent to push (no "I try to", "I attempt", "I want to"), prefer
NARRATIVE_WITH_MOVE_AVAILABLE and nominate the most likely move.

Return MOVE only when uncertainty is real and the player's intent is
clearly to act mechanically.

## PACING DIALS (effective values)

combat:        {effective.combat}/10
investigation: {effective.investigation}/10
exploration:   {effective.exploration}/10
social:        {effective.social}/10
downtime:      {effective.downtime}/10

Scene override: {sceneOverride.label or "none"}

## RECENT MOVE DENSITY

Last {window} inputs in current scene: {moveCount} were moves.
If density is high, lean toward NARRATIVE to allow pacing recovery.

## MOVE CATALOG (shallow)

{moveName}: {one-line trigger}
{moveName}: {one-line trigger}
...

## CHARACTER

Name: {name}
Connections: {[connection names with relationship status]}

## CURRENT SCENE

{scene tone, location, last 2-3 narrator beats}

## PLAYER INPUT

{playerText}

## ADDRESSEE INFERENCE HINT

If the input addresses or affects an entity, identify whether that entity is
a connection. Conversing with a connection bias significantly toward MOVE,
especially in the social category. Random NPCs do not carry this bias.
```

**Model:** `claude-haiku-4-5-20251001` — speed and cost matter; classification
is a structured low-prose task.

**Max tokens:** 250 — JSON output is small. Allow headroom for reasoning
field.

**Prompt caching:** the prefix through MOVE CATALOG is stable across all
classifier calls within a session. The CHARACTER, SCENE, INPUT tail changes.
Cache breakpoint sits between MOVE CATALOG and CHARACTER. See §13.

---

## 5. Trinary output handling

In `src/pacing/router.js`:

```js
export async function routePacedInput(message, campaignState) {
  const result = await classifyInput({ /* ... */ });
  await logPacingDecision(result, message);  // telemetry

  switch (result.decision) {
    case PACING_DECISION.MOVE:
      return runMovePipeline(message, campaignState);

    case PACING_DECISION.NARRATIVE:
      return runNarrativeOnlyResponse(message, campaignState);

    case PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE:
      return runNarrativeOnlyResponse(message, campaignState, {
        suggestedMove: result.suggestedMove,
      });
  }
}
```

**`runNarrativeOnlyResponse`** — calls the narrator with the standard scene
context but instructs the narrator to respond in-fiction without invoking
move resolution, no roll card, no mechanical state change. If
`suggestedMove` is provided, the narrator is instructed to end with an
italicized hint nominating that move.

The narrator response is posted as a standard narrator card, not a move
card. Distinguishable in main chat by the absence of the move/roll header.

---

## 6. Pipeline integration

Insertion point in `src/index.js`, after existing intercepts but before
move interpretation:

```js
// existing intercepts: !lore, !truths, !sector, !recap, @scene, etc.

// Pacing classifier — only for undecorated player narration
if (isPlayerNarration(message) && !isSceneAssertion(message)) {
  return routePacedInput(message, campaignState);
}

// fallback to existing pipeline (should now be unreachable for player input)
```

`@scene` is checked before the classifier and remains the hard override.
All `!`-prefixed admin commands are unaffected.

---

## 7. Pacing dial settings

New settings group: **Pacing**, colocated with the existing mischief dial in
Companion Settings.

### Per-category dials

Five dials, each `0–10`, default values:

| Category | Default |
|---|---|
| Combat | 9 |
| Investigation | 6 |
| Exploration | 5 |
| Social | 3 |
| Downtime | 1 |

```js
game.settings.register(MODULE_ID, "pacing.dial.combat", {
  scope: "world", config: false, type: Number,
  default: 9, range: { min: 0, max: 10, step: 1 },
});
// ... investigation, exploration, social, downtime
```

`config: false` — dials are exposed via the Companion Settings panel, not
the Foundry settings menu, to colocate with mischief.

### Master toggle

```js
game.settings.register(MODULE_ID, "pacing.enabled", {
  scope: "world", config: false, type: Boolean, default: true,
});
```

When disabled, all undecorated input routes to the move interpreter as before.
Provides a clean rollback if the classifier proves problematic in play.

### Recent move density window

```js
game.settings.register(MODULE_ID, "pacing.densityWindow", {
  scope: "world", config: false, type: Number, default: 5,
  range: { min: 3, max: 10, step: 1 },
});
```

Window size for the rolling move-density signal. Default 5 inputs.

---

## 8. Scene override mechanism

State:

```js
campaignState.pacing = {
  sceneOverride: null  // or { modifier: +3, label: "hot" }
};
```

Modifiers:

| Command | Modifier | Label |
|---|---|---|
| `!pace hot` | +3 | "hot" |
| `!pace quiet` | -3 | "quiet" |
| `!pace clear` | null | — |

Scene override is GM-gated. In a GM-less Starforged campaign the GM is a
player but retains Foundry permissions, and pacing-shift declarations are a
table-coordination action that benefits from a single source. Future option:
allow any player to propose a shift, GM confirms.

Override clears automatically on:
- Next `@scene` (new scene)
- `!pace clear`
- Session end

---

## 9. Connection awareness

The classifier prompt explicitly weights conversing with a connection toward
MOVE in the social category. This is per the "context, not probability"
principle — no hard mathematical bias is applied. The classifier sees:

```
Connections: Vex (bond), Kael (loyal), The Magnate (testing)
```

…in the CHARACTER block. Combined with the addressee inference hint in the
prompt, the model decides.

`campaignState.character.connections` is the source of truth. Each connection
includes name and relationship status. The classifier context builder reads
this and includes the list verbatim.

---

## 10. Recent move density signal

State:

```js
campaignState.pacing.recentDecisions = [
  { decision: "MOVE", timestamp, sceneId },
  { decision: "NARRATIVE", timestamp, sceneId },
  // ...
];
```

Capped at the density window size (default 5), oldest dropped. Reset when
the scene changes (`@scene`).

The classifier receives:

```
Last 5 inputs in current scene: 4 were moves.
```

A high recent move count nudges the classifier toward NARRATIVE to recover
pacing. This is a soft signal — the classifier weighs it against the dial
and the input itself.

---

## 11. Inline move suggestion in narrator prose

When `runNarrativeOnlyResponse` is called with a `suggestedMove`, the
narrator context packet adds:

```
## SUGGESTED MOVE

The pacing classifier nominated {suggestedMove} as a move the player could
make if they want to push this moment. End your narration with one italicized
sentence inviting this move, in the narrator's voice. Do not announce it
mechanically. Examples:

  *If you want to read him for tells, this could be a Gather Information.*
  *Pressing further here would be a Compel.*

Do not include this hint if your narration would naturally close the moment
or if the moment doesn't actually warrant pressing.
```

The narrator may decline to surface the hint if the fiction wouldn't carry
it. This is intentional — gives the narrator latitude to override the
classifier's nomination when it would feel forced.

---

## 12. CSS

Minimal additions. Narrator-only response cards reuse existing narrator card
styling. The italicized move hint is an inline `<em>` within the narration —
no new class needed.

Optional accent on cards that include a move suggestion:

```css
.sf-card--narrative-with-suggestion {
  border-left: 2px solid var(--sf-suggestion-colour, #B5985A);
}
```

A subtle gold left border distinguishes "this could become a move" cards
from pure narrative cards. Off by default — settings toggle if players want
the visual cue.

---

## 13. Cost estimate

Classifier uses Haiku with prompt caching. The cacheable prefix is large
relative to the volatile tail.

Approximate per-call breakdown:

| Component | Tokens | Cached? |
|---|---|---|
| Role + decision guidance | ~250 | yes |
| Move catalog (shallow) | ~600 | yes |
| Pacing dials + density window | ~80 | yes |
| Character connections | ~50 | partial (changes occasionally) |
| Current scene | ~150 | no |
| Player input | ~30 | no |
| **Total input** | **~1160** | |
| Output (JSON) | ~80 | — |

With caching:
- Cached prefix: ~880 tokens at $0.08/MTok cache read = ~$0.00007
- Volatile input: ~280 tokens at $0.80/MTok = ~$0.00022
- Output: ~80 tokens at $4.00/MTok = ~$0.00032

**Per classification: ~$0.0006.**

A typical session might see 30–50 classifier calls. Per-session cost:
**~$0.02–0.03.** Below the noise floor of the existing main pipeline cost.

The cache write happens once per session at first call (~$0.00088), then
reads dominate. Cache TTL is sufficient for a session of normal length.

---

## 14. Testing

### Unit tests — `tests/unit/pacing.test.js`

```
classifyInput()
  ✓ returns MOVE for clear physical-action input in combat scene
  ✓ returns NARRATIVE for casual conversation in social scene
  ✓ returns NARRATIVE_WITH_MOVE_AVAILABLE when uncertainty exists but no intent signalled
  ✓ biases toward MOVE when addressee is a connection
  ✓ biases toward NARRATIVE when recent move density is high
  ✓ respects scene override modifier
  ✓ never returns MOVE when pacing.enabled is false (short-circuits)

effectiveDial()
  ✓ returns base dial when no override
  ✓ applies +3 for hot, -3 for quiet
  ✓ clamps to [0, 10]

buildClassifierContext()
  ✓ includes all five dials
  ✓ includes connection list
  ✓ includes recent move density
  ✓ separates cacheable prefix from volatile tail

routePacedInput()
  ✓ calls move pipeline on MOVE
  ✓ calls narrator-only response on NARRATIVE
  ✓ calls narrator-only response with suggestedMove on NARRATIVE_WITH_MOVE_AVAILABLE
  ✓ logs decision to telemetry regardless of outcome
```

### Quench integration — `starforged-companion.pacing`

```
Pacing classifier — live Foundry
  ✓ undecorated input in social scene with no connection → narrative card, no roll
  ✓ undecorated input addressing connection → move card with roll
  ✓ !pace hot shifts subsequent classifications toward MOVE
  ✓ !pace clear restores dial defaults
  ✓ @scene bypasses classifier entirely
  ✓ !roll forces move interpreter on last input regardless of classifier
  ✓ classifier disabled via setting → all input routes to move interpreter
  ✓ NARRATIVE_WITH_MOVE_AVAILABLE card shows italicized move hint
```

---

## 15. Implementation order

1. Write `src/pacing/classifier.js` — `classifyInput`, `buildClassifierContext`,
   `effectiveDial`, `PACING_DECISION` and `PACING_CATEGORIES` exports
2. Write `tests/unit/pacing.test.js` covering the above
3. Write `src/pacing/router.js` — `routePacedInput`, `runNarrativeOnlyResponse`
4. Register pacing settings (dials, master toggle, density window)
5. Add Pacing panel to Companion Settings UI (colocated with mischief)
6. Wire pacing dials into the existing settings panel rendering
7. Implement `!pace` command handlers (hot, quiet, clear, status)
8. Add scene override state to `campaignState.pacing`
9. Add recent move density tracking — push on every classifier decision,
   reset on `@scene`
10. Wire `routePacedInput` into `src/index.js` after `@scene` check
11. Update narrator context builder to handle `suggestedMove` parameter
12. Add classifier decision telemetry — log to a dedicated journal page
    for post-hoc dial tuning
13. Add Quench integration batch
14. Update `packs/help.json` — add `!pace` to chat commands table, add
    Pacing section explaining the trinary behaviour
15. Update `docs/scope-index.md`

---

## 16. Design decisions

**Pre-classifier rather than integrated into move interpreter.** A separate
Haiku call adds latency but keeps "should this be a move?" and "which move
is this?" as independently tunable decisions. The mischief dial governs
interpretation latitude *when* a move is invoked. The pacing dials govern
*whether* a move is invoked at all. Conflating them in one prompt would muddy
both. Worth the extra round trip.

**Trinary output, not binary.** `NARRATIVE_WITH_MOVE_AVAILABLE` matches how a
good GM actually runs Ironsworn — describing the situation and inviting the
move when the player seems to be reaching for it. Binary forces the system
to either escalate or punt; trinary lets it suggest.

**No confirmation gate on uncertain classifications.** Confirmation trades
one form of friction (occasional unwanted rolls) for another (extra clicks
on every borderline input). Playtesting will tell us how often false
positives actually occur. Telemetry captures corrections; dials are tunable.
Add the gate later if needed.

**Scene override modifies, doesn't replace.** A `!pace hot` scene shifts
everything up but preserves the relative shape — combat still rolls more than
social. Replacement-style overrides would flatten the feel of different
scene types.

**Connection awareness through classifier context, not hard modifiers.** The
classifier sees the connection list and weights its decision in context.
This is more flexible than a hard +N bias and matches the "context, not
probability" principle established for the feature. If a player is having a
quiet moment with a connection, the classifier can still say NARRATIVE —
which is correct, even though the connection bias exists.

**Inline italicized hint, not button.** A button concretizes "make this a
move" as a UI action — a stronger nudge toward mechanizing every interaction,
which is the opposite of what this feature is for. An italicized line in
narrator voice preserves the conversational feel and the player can reply
naturally.

**`!pace` is GM-gated.** In a GM-less campaign, pacing-shift declarations
benefit from a single source to avoid table churn. The GM remains a player
in all other respects per the session 5 architectural decision; this is one
of the few admin functions that genuinely needs single-source coordination.

**Telemetry from day one.** Every classifier decision is logged with input,
context summary, and outcome. After a few sessions of play, the data informs
dial tuning. Without this, the dials are guesswork.

---

## 17. Follow-on / future work

**Per-player or per-character dial overrides.** Some players prefer more
mechanical play, some prefer narrative. v1 dials are world-level. Future:
let individual players bias their own classifications.

**Adaptive dials.** After enough telemetry, dials could auto-tune based on
how often the player corrects classifier decisions. Out of scope for v1.

**Confidence-based confirmation.** If false positives turn out to be common
in play, add a low-confidence gate: classifier returns confidence < 0.5,
ask the player "make this a move?" before committing to the roll.

**Player-proposed scene override.** Allow non-GM players to suggest `!pace
hot` mid-scene; GM confirms or declines. Out of scope for v1 — keep the
override single-sourced until play data shows it's a bottleneck.

**Move suggestion enrichment.** v1 nominates a single move name. Future
could nominate 2-3 with one-line rationales, letting the player choose. Risks
adding cognitive load — defer until v1 ships and we see how single
nominations feel.
