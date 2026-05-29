# Behaviour-Coverage Audit — Plan

## Context

The prior `docs/quench-coverage-audit-plan.md` cross-checked Quench batches
against ✅ COMPLETE scopes — *"is this code untested?"* — and produced
10 priority batches that landed across v1.5.x. It used file-presence
(verified by `Explore` agents) as the proxy for implementation.

PR #130 exposed a different defect class: code with tests that
**don't pin user-facing behaviour**. Three of the four merged fixes lived
in areas the prior audit listed as covered:

- **Command-vehicle registration.** `getCommandVehicle` /
  `getCommandVehicleActor` / `buildShipPositionLine` all had tests, always
  against fixtures with `isCommandVehicle: true` pre-set. The
  missing-write path — nothing in production code ever set the flag — was
  invisible to a coverage check.

- **Art-to-actor attach.** `linkPortraitToEntity` was tested and asserted
  `portraitId` was written. No test asserted `actor.img` changed. The
  aspirational schema comment in `src/entities/ship.js:13`
  (`actor.img ← portrait dataUri (set by art pipeline)`) and the
  cross-file expectation in `src/sectors/sceneBuilder.js:339` (which
  reads `cvActor.img` and falls back to a generic icon when it's the
  default) were the only evidence the wire was supposed to exist —
  nothing connected them.

- **Character context in the narrator prompt.**
  `buildNarratorSystemPrompt`'s test asserted `prompt.toContain("Kira")`
  and `"Health 4/5"`. Both passed. Nothing asserted paths, vows,
  connections, biography, or impacts — and the renderer silently ignored
  those snapshot fields.

This audit asks the question the prior one didn't: **are the existing
tests strong enough to catch behaviour regressions?**

---

## Methodology — three lenses

The three lenses run in sequence; each feeds the next. Cheapest first.

### Lens 1 — Aspirational-comment sweep

**What.** Inventory comments in `src/` that promise behaviour at another
call site, then trace each claim to the code that fulfils it.

Patterns to grep:

- Schema-style arrow comments (`← set by X`, `← populated by Y`).
- JSDoc effect notes (`@side-effect`, "writes back to", "wired by").
- Inline assertions of upstream behaviour ("X is populated by Y at module
  load", "Z fires this hook").

Three outcomes per claim:

- **WIRED** — claim is true, backed by code, AND a test fails when the
  wire breaks. ✓
- **ROTTED** — claim was true once, no longer is. Either restore the wire
  or update / remove the comment.
- **ASPIRATIONAL** — claim was never wired. Either implement it or
  delete the comment.

**Output.** Table of `(file:line, claim, status, action)`.

**Sample from PR #130.** `src/entities/ship.js:13`
*"actor.img ← portrait dataUri (set by art pipeline)"* — aspirational
since the file was authored. The same comment lives in
`src/entities/planet.js:9` — PR #130 wired the ship side but left the
planet comment unverified. Already a Lens 1 candidate.

**Effort estimate.** 1 session. Mechanical; each candidate is a
30-second trace.

### Lens 2 — Scope-doc behavioural parity

**What.** For each row in `docs/scope-index.md` (and the full linked
scope doc), decompose the description into discrete user-visible
promises. For each promise, find the test that fails when the promise
breaks.

The contract: *"covered" ≠ "asserted"*. A test that exercises a function
without asserting the user-facing outcome doesn't count.

**Output.** Matrix of `(scope row, promise, asserting test path | GAP)`.
GAPs become new Quench batches or unit tests.

**Sample frame.** "Section 6.5 of the narrator prompt surfaces a
SHIP POSITION line" — passes only if at least one test stages a
registered command vehicle, runs the narrator prompt assembly, and
asserts the line appears in the assembled output. The unit tests on
`formatShipPositionLine` that asserted its rendering *given a populated
position record* did not satisfy that promise; only an end-to-end-shaped
test would have caught the empty-position suppression that hid the ship
identity entirely.

**Effort estimate.** 2 sessions. ~20 scope rows × ~3–5 promises each.

### Lens 3 — Cross-file expectation audit

**What.** Catalogue data contracts that span files: file A writes a flag
/ path / format / hook payload, file B reads it. Unit tests don't own
these contracts; only an integration test asserts both ends are wired
together.

Start with the high-traffic integration points:

- **Entity flag payloads** ↔ narrator context assembly, entity panel
  rendering, art pipeline storage.
- **Assembler context packet** → `buildNarratorSystemPrompt` shape →
  narrator API call body.
- **Art pipeline** — generator output → `storeArtAsset` journal page →
  entity flag `portraitId` → entity panel render → `actor.img` /
  `prototypeToken.texture.src`.
- **Sector Token affordances** — `sceneBuilder` Token placement flags ↔
  `sectorSceneHooks` drag handler ↔ synthetic move pipeline dispatch.
- **Chat command routing** — `isXCommand` predicate matrix ↔ handler
  dispatch ↔ side-effect persistence.

**Output.** Table of `(writer file:line, reader file:line, contract,
asserting integration test | GAP)`.

**Sample from PR #130.** `src/sectors/sceneBuilder.js:339` reads
`cvActor.img` expecting the art pipeline to have populated it. The
expectation lived only in a comment in `ship.js` and a reader in
`sceneBuilder.js`; no test pinned the contract.

**Effort estimate.** 2–3 sessions. Hardest; highest value because these
are the gaps that don't show up under any single file's coverage.

---

## Deliverable

A single tracked file `docs/behaviour-coverage-audit.md` — sibling to
the prior audit's findings doc — containing:

1. Each lens's findings in a structured table.
2. A risk-ranked priority list of follow-up work (test additions, comment
   fixes, missing wires, scope-doc corrections).
3. A verification footer with grep recipes and expected counts, so the
   audit can be re-run mechanically as the codebase evolves.

Implementation work is its own follow-on, paced one batch / fix per
session, the same `npm test && npm run lint` + `CHANGELOG.md` +
help-journal gating as the prior audit's batches.

---

## Out of scope

- New feature requests — this audit surfaces gaps in *shipped* behaviour
  only.
- Coverage thresholds — `vitest.config.js` is settled at 50% (see
  `COVERAGE-001` in `docs/known-issues.md`).
- Cypress E2E scenario design — the audit may *propose* scenarios;
  implementing them is a separate scope.
- `tests/fixtures/` edits — `CLAUDE.md` gates these on discussion first.
- The two deferred panel surfaces flagged by the prior audit
  (Fact Continuity §17 items 26–27).

---

## Sequencing recommendation

| Phase | Lens | Sessions | Why this order |
|---|---|---|---|
| 1 | Aspirational comments  | 1   | Cheap, mechanical, immediately actionable findings. |
| 2 | Scope-doc parity       | 2   | Builds the structured matrix; informs Phase 3's prioritisation. |
| 3 | Cross-file contracts   | 2–3 | Hardest, highest value — saved for after the lower-cost lenses surface easy wins. |
| 4 | Implementation         | var | Same cadence as the prior audit's batch rollout. Sized by what the audit surfaces. |

**Total for the audit deliverable: ~5–6 sessions.** Implementation is
sized by findings (the prior audit produced 10 priorities; this one
could be similar or larger).

---

## Reference

- Prior audit: `docs/quench-coverage-audit-plan.md`.
- PR #130 (the gap-class motivating example):
  https://github.com/jamesrmedford-alt/starforged-companion/pull/130
- Related: `docs/known-issues.md` entries `ENTITY-001` and `RECAP-003` —
  both are earlier instances of the same under-assertion pattern (tests
  passed against fixtures that didn't match the live-world shape).
