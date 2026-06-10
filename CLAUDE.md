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
- **Settled decisions: search, don't re-derive.** If the user says a decision
  was already made, find it (`decisions.md`, scope docs,
  `docs/testing/*playtest-findings*`) before re-opening it. If a doc
  contradicts the user, the doc is stale — correct it **and** record the
  decision in `decisions.md` in the same commit. Decisions that live only in
  scope docs get lost between sessions; `decisions.md` is the durable home
  (the FOLDER-002 "no native NPC actor type" loop is the cautionary example).

When in doubt about whether something is in scope for the current session,
ask rather than proceed.

---

## Session startup checklist

Before doing any work, read these files in order:

1. `docs/scope-index.md` — single-glance status of all features; what is done,
   in progress, and planned. Start here every session to orient quickly.
2. `docs/decisions.md` — why things are the way they are; prevents re-introducing
   resolved issues or reversing deliberate choices
3. `docs/known-issues.md` — open bugs and their status; don't duplicate work
   or re-open closed issues
4. `docs/file-structure.md` — what each file exports and does
5. The relevant scope document for the current task — find it via scope-index.md:
   - Character/actor work: always read `docs/character/ironsworn-api-scope.md` first,
     then `rules/foundry-ironsworn.md` for the full schema-rules contract
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

---

## Help file and changelog maintenance

After completing any feature implementation or bug fix, always update both:

1. **`packs/help.json`** — the Foundry in-game help journal:
   - Add new commands to the "Chat Commands" page table
   - Add new settings to the "Settings Reference" page table
   - Add new features to the relevant page (or create a new page if substantial)
   - Update the "Troubleshooting" page if the fix changes error behaviour
   - Update the "Changelog" page with the new version entry

2. **`CHANGELOG.md`** — the GitHub changelog:
   - Add an entry under `[Unreleased]` for the change
   - **Promote on the next change after a release:** once a release is tagged,
     the now-shipped `[Unreleased]` content still sits under that heading. The
     next change's docs commit promotes it to its own `## [x.y.z] — date`
     section (per the fetched latest tag) and starts a fresh `[Unreleased]`
     for the new work. Don't open a PR just for the promotion.

**Help file changelog format** (in `packs/help.json`, "Changelog" page):
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
- Change coverage thresholds in `vitest.config.js`
- Add new npm dependencies without discussing the choice first
- Rename exported functions (breaks callers across the codebase)
- Update `vendor/foundry-ironsworn` without explicit instruction

---

## PR monitoring and autonomous iteration

When the user asks you to monitor, watch, babysit, or autofix a PR — or
when the work involves an iterative CI loop where the loop body is
"push, wait for CI, read failure, push again":

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
  actions that need to persist state must use a GM-check gate.
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
- `rules/project-context.md` — module overview, transport, system dependency
