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
     then fetch live source from the ironsworn repo before writing any code

---

## Third-party schema references

The foundry-ironsworn system source is available at `vendor/foundry-ironsworn/`.
This is a git submodule pinned to the currently installed system version.

**Before writing any code that reads from or writes to a foundry-ironsworn
Actor, Item, or other document**, read the DataModel definitions in:
```
vendor/foundry-ironsworn/src/module/model/actor/
vendor/foundry-ironsworn/src/module/model/item/
```

Never assume field paths for third-party documents. Always verify against
the vendor source. If the vendor folder is empty (submodule not initialised),
run:
```bash
git submodule update --init --recursive
```

When the ironsworn system is updated in Foundry, update the submodule:
```bash
cd vendor/foundry-ironsworn && git pull origin main && cd ../..
git add vendor/foundry-ironsworn
git commit -m "chore: update ironsworn vendor to v{new version}"
```

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

## External system reference — foundry-ironsworn

The foundry-ironsworn system source is public and attached to this project.
Before writing ANY code that reads or writes Actor documents, Item documents,
or any `actor.system.*` field, you MUST read the relevant source file first.
Never guess at schema paths — they have changed between versions and cost
significant debugging time when wrong.

**Repository:** https://github.com/ben/foundry-ironsworn  
**Confirmed schema doc:** `docs/ironsworn-api-scope.md` — read this first,
then verify against live source if the version may have changed.

**Key source files — read from vendor submodule (preferred) or fetch:**

```bash
# If vendor submodule is initialised (preferred — no network required):
cat vendor/foundry-ironsworn/src/module/actor/subtypes/character.ts
cat vendor/foundry-ironsworn/src/module/fields/MeterField.ts
cat vendor/foundry-ironsworn/src/module/actor/subtypes/starship.ts
cat vendor/foundry-ironsworn/src/module/actor/config.ts

# If vendor submodule is not initialised, fetch from GitHub:
# Character schema — all stat, meter, debility, legacy field paths
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/subtypes/character.ts

# Momentum field — MAX, MIN, INITIAL, RESET_MIN constants, burnMomentum()
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/fields/MeterField.ts

# Starship schema — debility.battered, debility.cursed
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/subtypes/starship.ts

# All actor types — character, shared, treasury, foe, site, starship, location
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/config.ts
```

**Rules for ironsworn actor work — non-negotiable:**

1. Read `docs/ironsworn-api-scope.md` before touching `actorBridge.js`
2. If the system version may have changed, fetch the source files above
3. Never assume field paths from memory or documentation — verify from source
4. Use computed getters on the system model when available:
   - `actor.system.momentumMax` — not manual calculation
   - `actor.system.momentumReset` — not manual calculation
   - `actor.system.burnMomentum()` — not `actor.update({ momentum.value: x })`
5. All debilities are under `system.debility` (singular) — never `system.debilities`
6. Stats are flat on system: `system.edge`, not `system.stats.edge`
7. XP is a flat number: `system.xp`, not `system.xp.value`
8. Starship is a separate Actor (`type: "starship"`), not an embedded item

**When updating `tests/setup.js` actor mock:**
The `makeTestActor` factory must match the real schema exactly.
After any schema correction, run `npm test` and confirm the mock
produces the same paths that live Foundry does.

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
- Modify `proxy/claude-proxy.mjs` routing logic without confirming
- Rename exported functions (breaks callers across the codebase)
- Update `vendor/foundry-ironsworn` without explicit instruction

---

## Architecture constraints

These are deliberate decisions — do not change without reading
`docs/decisions.md` and confirming with the user:

- All external API calls must go through `src/api-proxy.js`. Never add direct
  `fetch()` calls to `api.anthropic.com` or `api.openai.com` in module source.
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

## Project context

**What this is:** A Foundry VTT companion module for Ironsworn: Starforged
supporting solo and multiplayer campaigns. Handles move interpretation via
Claude API, dice resolution, narrator (Claude Sonnet), oracle integration,
progress tracking, entity management, art generation, and safety configuration.

**Target:** Foundry v13 (v12 minimum). ES modules throughout. Vitest for
unit tests. Quench for integration tests (require live Foundry).

**Proxy:** Foundry Electron renderer enforces CORS. All external API calls
route through `src/api-proxy.js` → local Node proxy (desktop) or Forge
server-side proxy. Start `npm run proxy` before testing in Foundry.

**System dependency:** foundry-ironsworn v1.27.0. Actor schema confirmed:
stats flat on `system` (not nested), meters at `system.health.value` etc,
debilities at `system.debility` (singular), xp flat at `system.xp`.
See `vendor/foundry-ironsworn/` for authoritative source.

**Current work in progress:** See `docs/known-issues.md` for open items.
Check `docs/` for scope documents before starting any feature work.
