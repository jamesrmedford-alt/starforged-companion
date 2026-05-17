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
   - Character/actor work: always read `docs/ironsworn-api-scope.md` first,
     then `rules/foundry-ironsworn.md` for the full schema-rules contract
     before fetching live source and writing any code
6. When the task touches narrator behaviour, move interpretation, pacing
   classification, scene mechanics, oracles, or any new game-side feature —
   read `docs/rulebook-summary.md` (design intent) and
   `docs/playkit-rules-and-coverage.md` Part 1 (verbatim rules) before
   writing code. See `rules/game-rules.md` for when to reach for which.
7. Before writing any Foundry API code — read `rules/foundry-api.md` and
   the relevant section of `docs/foundry-api-reference.md` to confirm current
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

**Help file changelog format** (in `packs/help.json`, "Changelog" page):
```html
<h3>v{version}</h3>
<ul>
  <li>Added: ...</li>
  <li>Fixed: ...</li>
</ul>
```

User-facing language only — no file names or internal architecture references.

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

---

## Detailed rules

Topic-specific rules are split out under `rules/`. Read on demand:

- `rules/foundry-api.md` — Foundry VTT API rules (Hooks, ApplicationV2,
  ChatMessage, the two-hook toolbar-button pattern, v12 → v13 changes)
- `rules/foundry-ironsworn.md` — foundry-ironsworn submodule, Actor / Item
  schema rules, vendor-source workflow
- `rules/quench.md` — Quench integration testing API and patterns
- `rules/game-rules.md` — Ironsworn: Starforged rules references (play-kit
  doc and rulebook summary)
- `rules/project-context.md` — module overview, transport, system dependency
