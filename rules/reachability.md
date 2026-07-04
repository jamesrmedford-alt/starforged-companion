# Wiring & data integrity — the dead-feature & drift never-break list

A commit-history review (462 commits, 52 `fix:`) found two bug families that
recur across the *entire* project life — from the earliest F-series playtests
through the T1/T3 entity→Actor migration to the v1.7.30 flow audits — and that
**pass both `npm test` and `npm run lint` every time**. They are two halves of
one concern: a write or a value that never reaches where it needs to.

- **Reachability (read side):** something is produced but nothing consumes it.
  `SITE-ZONE-TABLES-DEAD` (13 tables authored, never registered),
  `FACTION-PACKET-DEAD` (a 17-section packet passed to a parameter nothing
  read), `writeSessionLog` (implemented, never called — F18),
  `CHAR-PC-BLOCK-STARVED` (correct producer + consumer, narrowing adapter
  between), the "surface X to the World Journal / narrator" fixes (Soulbinders
  gap, PROGRESS TRACKS empty, faction descriptions), `FACTION-RECORD-WRITE-ONCE`
  (exported helpers, zero callers).
- **Data integrity (write side):** one fact lives in two stores and a write
  updates only one. `BOND-ITEM-MIRROR`, `NARR-BOND-RANK-STALE`,
  `LOCATION-DUAL-STORE`, `FACTION-DUAL-STORE` / `FACTION-ATTITUDE-SPLIT-BRAIN`,
  `VOW-FULFIL-SIBLINGS`, and the T1/F3 "write to the Actor, not a dead journal
  page" migration.

Root cause: **reachability and mirror-consistency are invisible properties no
gate checks.** A producer verifies locally; whether anything consumes it — or
whether its mirror still agrees — needs a whole-codebase sweep that
turn-scoped edits skip. These rules make both visible and gateable.

## 1. Reachability gate — nothing ships without a consumer

Before committing a **new** exported function, registered oracle table, oracle
id, world setting, chat command, card flag, or schema field: grep for what
consumes it and confirm the hop that makes it reachable exists.

- **A producer with zero consumers is a bug, not a feature.** Delete it, wire
  it in the same commit, or — if it is a deliberate public API or future hook
  — mark it `// UNWIRED: <who wires it, when>` **and** add a `known-issues.md`
  line. No silent zero-consumer additions.
- The last hop is a *different act* in a *different file*: authoring a table is
  not registering it (`oracles/roller.js`), writing a builder is not calling
  it, adding a setting is not reading it. The prompt's named artifact is done
  when it is **reachable**, not when it **exists**.
- Creation-side twin of CLAUDE.md's "audit consumers when meaning changes" —
  same grep, same same-commit discipline, extended from *on change* to *on
  create*.

## 2. Teardown — a superseded path is deleted, not left inert

When a refactor introduces a path that supersedes an old one, remove the old
path in the **same commit**. A green suite after deletion is the proof it was
dead; leaving it is not neutral.

- `FACTION-PACKET-DEAD` left `narrateResolution`'s `packet` parameter and its
  callsite assembly after narration moved to `buildNarratorExtras`; the inert
  `if (!packet) return` guard then silently aborted burn/improve re-narration.
  The safe-looking choice (leave the old path) *was* the bug.
- Additive-only refactors are how you get two paths where one is dead —
  deletion anxiety is the enemy here, not the safeguard.

## 3. Test the composition, not just the units

For any producer → adapter → consumer chain where the adapter transforms or
narrows, at least one test must exercise the **live composition** — the real
`getActiveCharacter → buildNarratorSystemPrompt`, not
`buildCharacterBlock(handBuiltObject)`.

- `CHAR-PC-BLOCK-STARVED` survived for months *because* `buildCharacterBlock`
  had thorough unit tests fed hand-built full objects. The starving happened in
  the seam nothing exercised. A green unit test proves "this unit works in
  isolation" — it is structurally blind to whether the unit is wired.

## 4. No speculative API surface

Write the caller and the callee in the same change, or don't write the callee.

- `updateFaction` / `addRumor` / `setProject` / `setSceneRelevant` were all
  exported, all zero-caller — a "complete-looking" entity API written ahead of
  callers that never came.
- A genuinely-wanted API ahead of its callers is a decision → `decisions.md` +
  an `// UNWIRED:` marker, not a silent export.

## 5. Single source of truth — mirrors are write-through, never independent

When one fact lives in two places (a vendor-sheet Item mirroring an entity
record; a World Journal entry beside an entity record; a journal page beside an
Actor flag), declare **one** canonical store and make the other a write-through
mirror updated on **every** change to the canonical value. Two independently
writable stores of one fact will drift — the repo has re-learned this at least
six times.

- The failure is always identical: a *new* write path updates canon and forgets
  the mirror (`BOND-ITEM-MIRROR`, `NARR-BOND-RANK-STALE`), or updates a mirror
  the reader doesn't consult (`LOCATION-DUAL-STORE` — travel-by-move set the
  ship position but not `currentLocationId`), or updates one copy of a fanned
  fact (`VOW-FULFIL-SIBLINGS` — paid one vow copy, not its shared siblings).
- When you add a write to a mirrored fact, grep for **every** store of that
  fact and update all of them, or route the write through the one function that
  fans out (`setBondItemTicks` / `setBondItemRank`; `recordFactionIntelligence`
  syncs `record.relationship` from the WJ attitude).
- `decisions.md` must name the canonical store per fact ("Faction stance: the
  entity record is canonical"; "Progress tracks: single dedicated journal"). A
  fact mirrored with no decision naming the winner is a drift bug waiting to
  happen — record the decision first.

## The through-line

`npm test` and `npm run lint` both signal "done" and both are blind to
reachability and to mirror drift. A **flow trace** — following a value from
source until it reaches a sink (or dangles), and following a fact's writes to
every store (or misses one) — is the one verification act that catches this
class, which is why the `docs/flows/*-flow.md` audits found every instance.
When you add a feature to a flow, update that flow doc's injection/consumption
map in the same commit: naming the consumer (and every store) *is* the gate.
