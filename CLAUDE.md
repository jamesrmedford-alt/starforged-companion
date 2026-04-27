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

1. `docs/decisions.md` — why things are the way they are; prevents re-introducing
   resolved issues or reversing deliberate choices
2. `docs/known-issues.md` — open bugs and their status; don't duplicate work
   or re-open closed issues
3. `docs/file-structure.md` — what each file exports and does
4. The relevant scope document if working on a specific feature:
   - Narrator: `docs/narrator-scope.md`
   - Any new feature: check `docs/` for an existing scope document first

---

## Before every commit

Run these in order and confirm they pass:

```bash
npm test           # all 165 tests must pass
npm run lint       # errors must be zero; warnings are acceptable
```

Never commit with failing tests. Never commit with lint errors.

Describe what changed and why before committing. Commit messages should follow
the pattern:

```
type: short description

Longer explanation if needed. Reference the decision or known issue
this addresses if applicable.
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

## Never do without explicit instruction

These actions require the user to explicitly ask for them in the current session:

- Push tags or trigger CI releases
- Close, comment on, or modify GitHub Issues
- Delete any file not explicitly listed in the current task
- Change `module.json` compatibility range (`minimum`, `verified`)
- Modify `tests/fixtures/` files without discussing the impact on existing tests
- Change coverage thresholds in `vitest.config.js`
- Add new npm dependencies without discussing the choice first
- Modify `proxy/claude-proxy.mjs` routing logic without confirming the change
- Rename exported functions (breaks callers across the codebase)

---

## Architecture constraints

These are deliberate decisions — do not change them without reading
`docs/decisions.md` and confirming with the user:

- All external API calls must go through `src/api-proxy.js`. Never add direct
  `fetch()` calls to `api.anthropic.com` or `api.openai.com` in module source.
- All UI panels must use `foundry.applications.api.ApplicationV2`. Do not use
  the v1 `Application` class.
- No jQuery. DOM API only (`querySelector`, `createElement`, `addEventListener`).
- `game.settings` world-scoped writes require GM permissions. Player-triggered
  actions that need to persist state must go through the GM client (socket or
  GM-check gate). See `decisions.md` — PERSIST-001.
- `src/foundry-shim.js` does not exist and must not be recreated. Foundry
  globals are stubbed in `tests/setup.js` for tests.
- Chat message type must not be `"other"` — not valid in Foundry v13. Use no
  type field (defaults to `"base"`) or a valid string literal.

---

## Project context

**What this is:** A Foundry VTT companion module for Ironsworn: Starforged
supporting solo and multiplayer campaigns. Handles move interpretation via
Claude API, dice resolution, oracle integration, progress tracking, entity
management, art generation, and narrative continuation.

**Target:** Foundry v13 (v12 minimum). ES modules throughout. Vitest for
unit tests. Quench for integration tests (require live Foundry).

**Proxy:** Foundry Electron renderer enforces CORS. All external API calls
route through `src/api-proxy.js` → local Node proxy (desktop) or Forge
server-side proxy. Start `npm run proxy` before testing in Foundry.

**Example campaign:** `docs/session-01.md` records one illustrative run of
the full pipeline. This is not hardcoded campaign state — each campaign rolls
its own World Truths via `src/truths/generator.js`.

**Current work in progress:** Narrator feature — removing Loremaster dependency
and implementing direct Claude narration. Full spec in `docs/narrator-scope.md`.
Do not start narrator work without reading that document first.
