# Claude Code — Working Instructions

This file is read automatically by Claude Code at the start of every session.
These instructions apply throughout the session unless the user explicitly
overrides them for a specific task.

---

## Autonomy boundaries

### GitHub Issues
Do not act on GitHub Issues autonomously. Issues are tracked for visibility
and prioritisation but require explicit direction before any work begins.

At session start you may read Issues for context. You may not implement, close,
comment on, or reference Issues in commits unless the user has explicitly asked
you to address a specific one in the current session conversation.

### General scope
- **Read freely:** files, git log, test output, lint output, GitHub Issues
- **Propose before acting:** describe what you would change and why, then wait
  for confirmation before making the change
- **Implement only when asked:** a user describing a problem is not the same as
  a user asking you to fix it
- **Audit consumers when meaning changes:** when changing what a document type,
  flag, or setting default *means* (e.g. a new use of an actor type, flipping a
  default), grep for **every consumer** of that type/flag/setting — `src/`,
  `tests/`, and `src/integration/quench.js` — and update them in the same
  commit. Three of the four v1.7.6 playtest bugs came from one unaudited
  type-meaning change (NPCs becoming `character` actors).
- **Verify reachability when adding; keep mirrors write-through.** A producer
  with zero consumers is a bug, not a feature — before committing a new exported
  function, registered oracle table, oracle id, setting, chat command, card
  flag, or schema field, grep for what consumes it and confirm the wiring hop
  exists (authoring a table is not registering it; writing a builder is not
  calling it). Zero consumers → delete it, wire it, or mark `// UNWIRED:
  <who/when>` + a `known-issues.md` line. When a refactor supersedes an old
  path, delete the old path in the same commit — inert-but-present is a latent
  bug (`FACTION-PACKET-DEAD`'s dead `packet` param silently aborted
  re-narration). And when one fact lives in two stores, name the canonical one
  and write through to the mirror on **every** change — never leave two stores
  independently writable (`BOND-ITEM-MIRROR`, `LOCATION-DUAL-STORE`,
  `FACTION-DUAL-STORE`). This produced-but-dead / mirror-drift family is the
  repo's most persistent bug class — full rules in `rules/reachability.md`.
- **Verify reachability when adding:** a producer with zero consumers is a bug,
  not a feature. Before committing a new exported function, registered oracle
  table, oracle id, setting, chat command, card flag, or schema field, grep for
  what consumes it and confirm the wiring hop exists — authoring a table is not
  registering it; writing a builder is not calling it. Zero consumers → delete
  it, wire it in the same commit, or mark it `// UNWIRED: <who/when>` **and** add
  a `known-issues.md` line. When a refactor supersedes an old path, delete the
  old path in the same commit (inert-but-present is a latent bug, not a
  courtesy). Six v1.7.30 audits each found a shipped-but-dead feature that passed
  tests and lint — see `rules/reachability.md`.
- **Settled decisions: search, don't re-derive.** If the user says a decision
  was already made, find it (`decisions.md`, the scope **issue** on GitHub,
  `docs/testing/*playtest-findings*`) before re-opening it. If a doc or issue
  contradicts the user, it is stale — correct it **and** record the decision in
  `decisions.md` in the same commit. Decisions that live only in a scope issue
  get lost between sessions; `decisions.md` is the durable home (the FOLDER-002
  "no native NPC actor type" loop is the cautionary example).

When in doubt about whether something is in scope for the current session,
ask rather than proceed.

---

## Scope documents are GitHub issues

Feature scopes live as **GitHub issues**, not files in `docs/`. The historical
`docs/**/*-scope.md` documents were migrated verbatim into issues #203–#228 and
removed on 2026-06-24 (see `decisions.md` → "Scope documents live as GitHub
issues").

- **Finding a scope:** `docs/scope-index.md` maps every scope to its issue.
  Open the issue for the full scope text and its implementing-commit table.
- **Writing a new scope:** open a GitHub issue — do **not** add a `*-scope.md`
  file — and add a row to `scope-index.md` pointing at it. The autonomy
  boundary above still applies: opening a scope issue when asked to spec a
  feature is fine; implementing it still needs explicit direction.
- **Status from issue state:** open = planned / in progress; closed-completed =
  shipped; closed-not-planned = superseded or dropped.

---

## Session startup checklist

Before doing any work, read these files in order:

1. `docs/scope-index.md` — single-glance status of all features and the map
   from each scope to its **GitHub issue** (scopes live as issues, not files).
   Start here every session to orient quickly; open the linked issue for a
   feature's full scope text.
2. `docs/decisions.md` — why things are the way they are; prevents re-introducing
   resolved issues or reversing deliberate choices
3. `docs/known-issues.md` — open bugs and their status; don't duplicate work
   or re-open closed issues
4. `docs/file-structure.md` — what each file exports and does
5. The relevant scope for the current task — now a **GitHub issue**, found via
   `scope-index.md` (scope → issue map):
   - Character/actor work: always read the Ironsworn API scope (issue #212)
     first, then `rules/foundry-ironsworn.md` for the full schema-rules contract
     before fetching live source and writing any code
6. When the task touches narrator behaviour, move interpretation, pacing
   classification, scene mechanics, oracles, or any new game-side feature —
   read `docs/rules-reference/rulebook-summary.md` (design intent) and
   `docs/rules-reference/playkit-rules-and-coverage.md` Part 1 (verbatim rules) before
   writing code. See `rules/game-rules.md` for when to reach for which.
7. When the task touches narrator **context, memory, or continuity** — the
   sidecar contract, scene truths/state ledgers, the scene frame, the
   recent-narration ring, narrator-card flags, relevance/entity-card
   injection, or drift complaints from playtests — read
   `rules/narrator-memory.md` (invariants) and
   `docs/narrator/narrator-memory-architecture.md` (full architecture,
   tuning guide, refinement backlog) before writing code.
8. Before writing any Foundry API code — read `rules/foundry-api.md` and
   the relevant section of `docs/foundry-reference/foundry-api-reference.md` to confirm current
   method signatures, valid values, and deprecation status. Never rely on
   memory for Foundry APIs.

---

## Before every commit

Run these in order and confirm they pass:

```bash
npm test           # all tests must pass
npm run lint       # errors must be zero; warnings are acceptable
```

Never commit with failing tests. Never commit with lint errors.

**Scope check.** Before staging, run `git diff --stat` (and `git diff --cached
--stat` once staged) and confirm every changed file serves the task you were
asked to do. Drop anything that crept in — `.gitignore` / `vitest.config.js`
edits, other config tidy-ups, reformatting, stray debug logging. "While I'm
here" config changes need their own explicit go-ahead and never ride along
inside a feature commit (a `.claude/`-ignore edit bundled into the
clocks/vignettes commit had to be unwound exactly this way).

**Reachability check.** For any new producer in the diff (exported function,
registered table, oracle id, setting, command, card flag, schema field), grep
its consumer and confirm the wiring hop exists; for any write to a mirrored
fact, confirm every store is updated. Tests and lint are blind to both — see
`rules/reachability.md`. A zero-consumer add or an unmirrored write is a defect
even with a green gate.

Commit message format:
```
type: short description

Longer explanation if needed. Reference the decision or known issue
this addresses if applicable.
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

## Pull request descriptions

Every PR you open must include the verbatim user prompt that initiated the
work, under a heading `## Initiating prompt` near the top of the description.
Quote the prompt as written — do not paraphrase. If the prompt referenced an
attached screenshot, log excerpt, or other artefact that cannot be embedded,
note the attachment and briefly describe its content (e.g. "screenshot of
Foundry browser console showing three DrawingDocument validation errors").

This gives reviewers — and future Claude Code sessions investigating the same
area — the original framing without having to hunt through chat history.
Skipping this section is treated the same as skipping the test/lint gate:
do not open the PR until it is included.

**Closing keywords.** When a PR fully resolves a GitHub issue you were
explicitly asked to address, add a `Closes #N` line to the description (or
`Fixes #N` / `Resolves #N`) — one per issue resolved — so merging the PR
auto-closes the issue. Use a bare `#N` reference (no keyword) when the PR only
partially addresses an issue or merely relates to one. This is the *only*
sanctioned way to close an issue: the close happens on merge, via a PR you were
authorised to open. Never close or edit issues directly without instruction
(see the GitHub Issues autonomy boundary above and the "Never do" list). When a
PR carries more than one change, `Closes #N` is still correct as long as
merging it delivers that issue in full.

---

## Help file and changelog maintenance

After completing any feature implementation or bug fix, always update both:

1. **`src/help/helpJournal.js`** — the single source of truth for the
   Foundry in-game help journal (the `PAGES` export; `scripts/build-help-site.mjs`
   and the in-world journal both consume it — there is no `packs/help.json`):
   - Add new commands to the "Chat Commands" page table
   - Add new settings to the "Settings Reference" page table
   - Add new features to the relevant page (or create a new page if substantial)
   - Update the "Troubleshooting" page if the fix changes error behaviour
   - Update the "Changelog" page with the new version entry, and bump
     `CONTENT_VERSION` to match (see the Version pinning rule below)

2. **`CHANGELOG.md`** — the GitHub changelog:
   - Add an entry under `[Unreleased]` for the change
   - **Promote on the next change after a release:** once a release is tagged,
     the now-shipped `[Unreleased]` content still sits under that heading. The
     next change's docs commit promotes it to its own `## [x.y.z] — date`
     section (per the fetched latest tag) and starts a fresh `[Unreleased]`
     for the new work. Don't open a PR just for the promotion.

**Help file changelog format** (in `src/help/helpJournal.js`, "Changelog" page):
```html
<h3>v{version}</h3>
<ul>
  <li>Added: ...</li>
  <li>Fixed: ...</li>
</ul>
```

User-facing language only — no file names or internal architecture references.

### Version pinning rule (read before editing the help Changelog)

`module.json` is the only source of truth for the release version — CI
rewrites it at release time, so the in-repo value typically lags the live
release. The **release tags** in `origin` are the durable ground truth.
Tags are assigned by the user (the maintainer triggers each release);
the assistant never tags.

**Step 0 — always confirm the latest tag before touching `CONTENT_VERSION`
or the help-Changelog block.** Local state lies. CHANGELOG.md lags. The
in-tree `CONTENT_VERSION` and the latest `<h3>v…</h3>` block in
`src/help/helpJournal.js` are both routinely stale (this drift has
been confirmed in PR #126 — in-tree was v1.4.3 while the live release
was v1.5.1). Run:

```bash
git fetch --tags origin
git tag --sort=-version:refname | head -1
```

That output is the live release. Anything else in the working tree
(CONTENT_VERSION, the latest help-Changelog heading) must be reconciled
to it before any version-related edit.

To decide which `<h3>v…</h3>` heading to add or merge into:

1. **Fetched** the latest tag per Step 0. Call that `vCURRENT`.
2. The work in `CHANGELOG.md`'s `[Unreleased]` section ships under the
   **next** version after `vCURRENT` — e.g. fetched-tag v1.5.1 → next is
   v1.5.2.
3. **Only one `<h3>v…</h3>` block in `src/help/helpJournal.js` may correspond
   to `[Unreleased]`**, and `CONTENT_VERSION` must equal that heading. If
   prior unreleased work already has its own `<h3>v…</h3>` block (or
   blocks), merge your bullets into that block — do **not** create a new
   heading.
4. Never invent a "next" version by incrementing the latest help heading.
   The latest help heading is itself unreleased work; incrementing it
   compounds the drift. Always cross-check against the fetched latest
   tag before picking the version string.

If the latest help heading is BELOW the fetched latest tag (i.e. it
represents work that already shipped under a higher tag without the
heading being updated), the correct repair is to rename that heading to
`vCURRENT + 1` and bump `CONTENT_VERSION` to match — do not invent
back-dated headings for the skipped releases unless explicitly asked.
Surface the gap to the user.

**When in doubt, ask the user what the next release version should be.**
The fetch is the default, but if the situation is ambiguous (e.g. a
tagged but unpushed release sitting locally, an interrupted release
cycle, a pre-release decision that hasn't been documented yet, or the
fetched tag conflicts with what the user just told you), the user is
the authoritative source — they assign tags. A one-line
AskUserQuestion is cheap; silently picking the wrong version compounds
into another round of help-Changelog drift.

---

## Never do without explicit instruction

- Push tags or trigger CI releases
- Close, comment on, or modify GitHub Issues
- Delete any file not explicitly listed in the current task
- Change `module.json` compatibility range (`minimum`, `verified`)
- Modify `tests/fixtures/` files without discussing the impact first
- Change `vitest.config.js` — coverage thresholds, `include`/`exclude` globs, or
  any other setting (an unprompted `exclude` edit to hide `.claude/` had to be
  reverted; config changes get their own approval, never a ride-along in a
  feature commit)
- Edit repo/build/tooling config that isn't itself the requested task —
  `.gitignore`, ESLint/Prettier config, `package.json` scripts, CI workflows.
  Above all, **never add `.claude/` (or any other harness/worktree-managed
  directory) to `.gitignore` or a test-runner exclude** — the harness manages
  those, not the repo. For a personal, local-only ignore use `.git/info/exclude`.
- Add new npm dependencies without discussing the choice first
- Rename exported functions (breaks callers across the codebase)
- Update `vendor/foundry-ironsworn` without explicit instruction

---

## PR monitoring and autonomous iteration

**Standing instruction (2026-06-12): whenever you open a PR in this repo,
immediately subscribe to it and follow through — without being asked.**
Auto-fix CI failures, handle review comments, report green status, and
stand down when it merges or closes. The maintainer should never need to
say "subscribe" again.

When following through on a PR — or when the work involves an iterative
CI loop where the loop body is "push, wait for CI, read failure, push
again":

- Subscribe via `mcp__github__subscribe_pr_activity(owner, repo, pullNumber)`
  and end the turn. PR webhook events arrive as `<github-webhook-activity>`
  messages that wake the session. **Don't poll** — no `gh pr checks` in a
  loop, no `sleep` waiting for runs.
- Pull CI diagnostic via `mcp__github__pull_request_read` with
  `method=get_comments` and find the sticky-comment marker (we use
  `<!-- e2e-log:sticky -->` in this repo's e2e workflow). The response
  is often large enough to exceed the token budget — slice via
  `python3 -c "print(open(file).read()[A:B])"` if so.
- WebFetch cannot read GitHub Actions step logs (auth-gated) or
  workflow artifact zips. Don't try; use the PR-comment bridge instead.
- When delegating research to a sub-agent, verify its **"no changes needed" /
  no-op claims** against the source before relying on them — a blast-radius
  report once claimed `connection.js` needed no changes when its create path
  explicitly built the old document type.
- See `rules/ci-e2e.md` for the full pattern, including how the workflow
  populates the sticky comment.

---

## Architecture constraints

These are deliberate decisions — do not change without reading
`docs/decisions.md` and confirming with the user:

- All Anthropic API calls must go through `src/api-proxy.js` (which injects the
  `anthropic-dangerous-direct-browser-access` header). Never add ad-hoc direct
  `fetch()` calls to `api.anthropic.com` in module source.
- All image generation goes through `src/art/openRouterImage.js`. Do not add
  alternative image-provider call sites — if a new model is needed, expose it
  via the `openRouterImageModel` setting and let OpenRouter route to it.
- All UI panels must use `foundry.applications.api.ApplicationV2`. Do not use
  the v1 `Application` class.
- No jQuery. DOM API only (`querySelector`, `createElement`, `addEventListener`).
- `game.settings` world-scoped writes require GM permissions. Player-triggered
  actions that need to persist state must use a GM-check gate. Two sharper
  distinctions the repo has had to fix repeatedly (multiplayer/GM handling is
  its third-most-common bug family):
  - **Single-emitter writes gate on `isCanonicalGM()`, not `game.user.isGM`.**
    Anything that posts a shared document or persists world state from the
    pipeline (ledger writes, the rolling-summary persist, contradiction cards)
    must be canonical-GM-gated so a two-GM table doesn't double-emit or race.
    Plain `isGM` is only for a local, idempotent read.
  - **Credit the roller, not the GM.** Move effects (momentum, meter changes,
    XP) apply to the player who rolled — resolve the acting actor from the chat
    speaker, never `game.user.character` or "first PC in campaignState." The
    inciting/founding vow is the one shared exception (see decisions.md →
    "Multiplayer attribution").
- Concurrency guards and pipeline locks (e.g. `campaignState.pendingMove`, an
  ApplicationV2's `busy` flag) must be released in a `finally`, never on the
  happy path alone. An exception — or an awaited promise that never settles —
  between claiming and releasing the guard wedges it permanently: every later
  action then no-ops or shows "a move is already being resolved". Blocking
  dialogs awaited inside a guarded section must themselves settle on close
  (see `rules/foundry-api.md`), or the `finally` never runs. Both v1.7.16
  lock-ups — the suffer dialog and the private-channel `busy` flag — were this.
- `src/foundry-shim.js` does not exist and must not be recreated.
- Chat message type must not be `"other"` — not valid in Foundry v13.
- All actor reads and writes go through `src/character/actorBridge.js`.
  Never access Actor fields directly from other modules.
- NPC/connection cards are `character`-type Actors tagged with
  `flags[MODULE].entityType` (FOLDER-002). **Never use `type === 'character'`
  alone to mean "player character"** — use `isPlayerCharacterActor()` /
  `getPlayerActors()` from `actorBridge.js`, or replicate the entityType-flag
  exclusion where importing actorBridge isn't possible. An unfiltered check
  leaks NPC cards into PC-only logic (momentum grants, chat-speaker
  attribution, narrator CHARACTER STATE).

---

## Detailed rules

Topic-specific rules are split out under `rules/`. Read on demand:

- `rules/foundry-api.md` — Foundry VTT API rules (Hooks, ApplicationV2,
  ChatMessage, the two-hook toolbar-button pattern, v12 → v13 changes)
- `rules/foundry-ironsworn.md` — foundry-ironsworn submodule, Actor / Item
  schema rules, vendor-source workflow
- `rules/quench.md` — Quench integration testing API and patterns
- `rules/ci-e2e.md` — Docker stack, Cypress spec patterns, GitHub Actions
  PR-gating, and the subscribe-to-PR / sticky-comment iteration loop
- `rules/game-rules.md` — Ironsworn: Starforged rules references (play-kit
  doc and rulebook summary)
- `rules/narrator-memory.md` — narrator memory invariants (flag-family
  contract, sidecar contract, never-dropped tiers); full architecture +
  tuning guide in `docs/narrator/narrator-memory-architecture.md`
- `rules/reachability.md` — the invisible-invariant bug families that pass
  tests + lint: produced-but-dead features, mirror-store drift,
  identity-by-mutable-name, and reload/reconnect state loss. The reachability
  gate, teardown rule, composition test, no-speculative-surface,
  single-source-of-truth write-through, resolve-by-stable-id, and
  survive-reload rules
- `rules/project-context.md` — module overview, transport, system dependency
