# Consequence Riders — auto-applying asset resource effects

**Status:** ✅ COMPLETE (v1.7.12). Requested in the v1.7.11 playtest follow-up:
*"Consequence riders should be wired to avoid manual implementation … the user
shouldn't have to manipulate stats or resources."*

## Problem

Many Starforged assets layer resource effects onto a move's outcome — "take +1
momentum on a strong hit", "suffer -1 supply", "mark progress on a hit", "on a
strong hit with a match, +1 health **or** +1 momentum". The Foundry asset model
stores these only as free-text ability descriptions (no structured effect
data — confirmed: `system.abilities[].description` is HTML prose; the `effects`
array is unused). Historically the player applied them by hand. The module
already handled the three *unambiguous* hooks (pre-roll `+N` adds, stat
substitution, and the post-roll improve-to-strong-hit affordance) but surfaced
everything else as text.

## Design

- **Extraction (LLM).** The phrasings are too compound/conditional for regex
  ("on a strong hit with a match", "you may", "choose one"), so a single Haiku
  pass extracts structured riders from the *applicable* abilities (the same set
  the ability scanner already matched to the move). Runs pre-roll during the
  confirm-dialog wait so riders are ready the instant the outcome is known.
  Contract per rider: `{ condition, resource, amount, optional, choiceGroup,
  label }`. `src/moves/consequenceRiders.js → extractRiders`.
- **Condition matching.** `collectFiringRiders` keeps only riders whose
  `condition` (`any`/`hit`/`strong_hit`/`weak_hit`/`miss`/`match`/
  `strong_hit_match`) fires for the rolled outcome + match.
- **Apply vs prompt.** `partitionRiders` routes optional ("you may"), "choose
  one" (choiceGroup), and progress riders to a prompt; the rest apply silently.
  Meters (`momentum`/`health`/`spirit`/`supply`) go through
  `applyMeterChanges`; `integrity` updates the command ship; `progress` marks a
  track (`markProgressById`). Progress auto-marks the sole track when
  unambiguous, else the picker. `src/moves/riderDialog.js` renders the prompt.
- **Surface.** A "✦ Asset effects applied" chat card lists what landed.

## Safety (non-negotiable)

A wrong auto-apply silently corrupts game state — worse than the manual status
quo. So:
- Extraction is conservative; every rider is validated (known resource, small
  integer amount, known condition) and malformed ones are dropped.
- No key / parse failure / transport error → the pass yields nothing and the
  ability text is surfaced as before. **Never apply a guess.**
- Meter/progress writes are world-scoped → **GM-gated** at the pipeline site
  (PERSIST-001). A `riders.autoApply` world setting (default on, GM-only) can
  disable the whole feature.
- **Routing: GM-only, no per-player key.** Both the extraction call and the
  application run inside the move pipeline, which is gated on `isCanonicalGM()`
  (`src/index.js`, the `createChatMessage` handler — covered by
  `chatHookGmGate.test.js`). So extraction uses the **GM's** client-scoped
  `claudeApiKey` (the same key narration/interpretation use); non-GM players
  never run it and never need a key. `extractRiders` has a single call site
  inside that gated handler.

## Scope boundaries (deferred)

- Asset-local resources (ammo), rerolls, and roll-adds stay as they were
  (surfaced / handled by the pre-roll scanner) — not riders.
- Progress-track binding by move type (combat track, the vow being worked) is a
  refinement; v1 auto-marks only the unambiguous single-track case and prompts
  otherwise.

## Files

- `src/moves/consequenceRiders.js` — extraction, condition matching,
  partition, meter application (pure logic + the Haiku call).
- `src/moves/riderDialog.js` — the optional/choice/progress prompt.
- `src/ui/progressTracks.js` — `listProgressTracks()` for the picker.
- `src/index.js` — pre-roll extraction + post-roll `applyMoveConsequenceRiders`
  orchestration; `riders.autoApply` setting.
- Tests: `tests/unit/consequenceRiders.test.js`.
