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
6. Before writing any Foundry API code — read the relevant section of
   `docs/foundry-api-reference.md` to confirm current method signatures,
   valid values, and deprecation status. Never rely on memory for Foundry APIs.
   - Any Foundry API usage: fetch the relevant page from
     https://foundryvtt.com/api/v13/ before writing code (see External API
     reference section below)

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

## External API reference — Foundry VTT

Before writing any code that uses Foundry VTT APIs, check the live API
documentation for the target Foundry version (currently v13). Never rely
on memory or training data for Foundry API signatures — they change between
versions and have been the source of multiple bugs in this project.

**Base URL:** https://foundryvtt.com/api/v13/

**Rule:** If you are about to write a Hooks.on(), ChatMessage.create(),
actor.update(), game.settings.register(), or any ApplicationV2 method —
fetch the relevant docs page first. This takes seconds and prevents hours
of debugging.

**Key pages to fetch before common tasks:**

```bash
# ApplicationV2 — before ANY UI panel work
# Covers: _prepareContext, _renderHTML, _replaceHTML, DEFAULT_OPTIONS,
#         actions, lifecycle hooks, render/close
curl https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html

# ChatMessage — before creating or reading chat messages
# Covers: type values, flags, create(), speaker, content
curl https://foundryvtt.com/api/v13/classes/ChatMessage.html

# Hooks — before registering any hook
# Covers: on(), once(), off(), callAll(), hook names and signatures
curl https://foundryvtt.com/api/v13/classes/Hooks.html

# Actor — before any actor read/write (supplement with ironsworn source)
# Covers: update(), getFlag(), setFlag(), items, effects
curl https://foundryvtt.com/api/v13/classes/Actor.html

# ClientSettings — before registering or reading settings
# Covers: register(), get(), set(), scope, config, type
curl https://foundryvtt.com/api/v13/classes/ClientSettings.html

# JournalEntry / JournalEntryPage — before journal operations
curl https://foundryvtt.com/api/v13/classes/JournalEntry.html
curl https://foundryvtt.com/api/v13/classes/JournalEntryPage.html

# SceneControls — before toolbar button registration
curl https://foundryvtt.com/api/v13/classes/SceneControls.html

# DialogV2 — for confirmation dialogs (Dialog is deprecated in v13)
curl https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
```

**Known v12 → v13 breaking changes (already fixed in this codebase):**
- `Application` → `ApplicationV2` (v1 deprecated, removed v16)
- `Dialog` → `DialogV2` (deprecated, DIALOG-001 still open in entityPanel.js)
- `message.user` → `message.author`
- `CONST.CHAT_MESSAGE_TYPES` → string literals (`"ooc"`, `"roll"` etc)
- `ChatMessage.type = "other"` → removed, use `"base"` or omit
- `getSceneControlButtons` hook: `controls` is now Object not Array
- jQuery (`$`) removed — use DOM API throughout

**When the docs are insufficient:**
The Foundry source is on GitHub at https://github.com/foundryvtt/foundryvtt
but it is not public for the core codebase. Use the API docs + the error
messages in the Foundry console as your source of truth.

---

## External API reference — Foundry VTT

The Foundry VTT API documentation is the authoritative source for all Foundry
classes, hooks, methods, and properties. Before writing ANY code that uses
Foundry APIs, fetch the relevant documentation page first.

**Local reference:** `docs/foundry-api-reference.md`

This file contains compiled API documentation for all Foundry classes used
in this module, sourced from the community wiki (verified v13). Claude Code's
network access does not include foundryvtt.com, so this local file is the
authoritative reference.

**Rule:** Before writing ANY code that calls a Foundry method, registers a hook,
creates a document, or uses any Foundry class — read the relevant section of
`docs/foundry-api-reference.md` first. Do not rely on training data for Foundry
API details.

```bash
# Read the local API reference
cat docs/foundry-api-reference.md

# Or search for a specific section
grep -A 30 "^## ChatMessage" docs/foundry-api-reference.md
grep -A 30 "^## Hooks" docs/foundry-api-reference.md
grep -A 50 "^## ApplicationV2" docs/foundry-api-reference.md
```

If the required API is not covered in the local reference, note it in your
findings report so the file can be updated before you implement.

**Two-hook pattern for toolbar buttons — confirmed v13 requirement:**

```js
// Hook 1: getSceneControlButtons — register metadata ONLY
// Controls.tokens.tools is populated AFTER this hook fires.
// onChange is NEVER called for button:true tools in v13.
// This hook makes buttons appear — nothing more.
Hooks.on("getSceneControlButtons", (controls) => {
  controls.tokens.tools ??= {};
  controls.tokens.tools.myTool = {
    name:    "myTool",
    title:   "My Tool",
    icon:    "fas fa-wrench",
    button:  true,
    onChange: () => {},  // required to exist but never called for button tools
  };
});

// Hook 2: renderSceneControls — attach click handlers via DOM
// Fires after controls are fully rendered with real buttons in the DOM.
// Use replaceWith(cloneNode) to prevent duplicate listeners on re-renders.
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const btn = root.querySelector('[data-tool="myTool"]');
  if (!btn) return;

  // Clone to remove any previously attached listeners
  btn.replaceWith(btn.cloneNode(true));
  const freshBtn = root.querySelector('[data-tool="myTool"]');
  freshBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    myHandler();
  });
});
```

**Never** rely on `onChange` for `button: true` tools.
**Never** use `onClick` — not a valid v13 SceneControlTool property.
**Never** use `Array.isArray(controls)` — controls is always an Object in v13.
**Never** use `.push()` on `tools` — tools is an Object, not an Array.

**`Hooks._hooks` does not exist in v13:**
Cannot introspect registered hooks via `Hooks._hooks` — undefined in v13.
Use `CONFIG.debug.hooks = true` in the console to trace hook firing.

**Specific things confirmed to have changed in v13 — always verify:**

| API | v12 | v13 | Status in this codebase |
|-----|-----|-----|------------------------|
| `message.user` | valid | deprecated → use `message.author` | ✅ Fixed |
| `message.type = "other"` | valid | invalid — use no type or `"base"` | ✅ Fixed |
| `CONST.CHAT_MESSAGE_TYPES` | valid | restructured — use string literals | ✅ Fixed |
| `getSceneControlButtons` | Array | Object keyed by group name | ✅ Fixed |
| `Dialog.confirm()` | valid | deprecated → use `DialogV2.confirm()` | ⚠️ Not yet fixed |
| jQuery `$` / `.find()` | available | removed — use DOM API | ✅ Fixed |
| `Application` (v1) | valid | deprecated → use `ApplicationV2` | ✅ Fixed in our code |

**Before implementing any new Foundry hook or API:**
1. Fetch the relevant docs page above
2. Confirm the method/hook/class exists in v13
3. Check the method signature — argument order and types change between versions
4. Check for deprecation notices — if deprecated, use the replacement
5. Note whether the API is available in both renderer and server contexts

---

## External system reference — Quench (integration testing)

**Repository:** https://github.com/Ethaks/FVTT-Quench
**Local path:** `vendor/fvtt-quench/`
**Current version:** v0.10.0 (April 2025) — verified Foundry v13, uses ApplicationV2
**npm types:** `@ethaks/fvtt-quench`

Before writing any integration tests, read the Quench source to confirm
the current API. The API shown below is confirmed from v0.10.0.

**Key source files:**
```bash
cat vendor/fvtt-quench/src/module/quench.ts          # Quench class, registerBatch, runBatches
cat vendor/fvtt-quench/src/module/quench-tests/nonsense-tests.ts  # example tests
```

**Confirmed Quench API (v0.10.0):**

```js
// Registration — use the quenchReady hook, not init or ready
Hooks.on("quenchReady", (quench) => {

  quench.registerBatch(
    "starforged-companion.batchName",  // unique key — prefix with module ID
    (context) => {
      // Destructure from context — do NOT use globals
      const { describe, it, assert, expect, before, after, beforeEach, afterEach } = context;

      describe("Suite name", function () {
        it("test name", async function () {
          // Use assert (Chai assert) or expect (Chai expect)
          assert.isTrue(true);
          expect(1).to.equal(1);

          // Skip a test conditionally
          if (!game.user.character) { this.skip(); return; }
        });
      });
    },
    {
      displayName: "STARFORGED: Batch Display Name",  // shown in UI
    }
  );
});

// Running tests programmatically (from Foundry console)
quench.runBatches("**");                                    // all batches
quench.runBatches("starforged-companion.**");               // all module batches
quench.runBatches(["starforged-companion.actorBridge"]);    // specific batch
```

**Critical differences from Vitest:**
- `describe`, `it`, `assert`, `expect` come from `context`, NOT from imports
- Tests are async-friendly but Hooks are synchronous — use `async function`
- `this.skip()` skips the test (Mocha pattern) — Vitest uses different API
- Chai assert/expect, NOT Vitest's expect — different assertion API
- No `vi.spyOn` — use vanilla JS patterns for spying if needed
- No `beforeAll`/`afterAll` — use `before`/`after` (Mocha naming)

**Guard pattern — confirmed correct approach (from live testing):**
```js
// WRONG — game.modules.get("quench")?.active is unreliable at module load time
if (!game.modules.get("quench")?.active) return;
Hooks.on("quenchReady", (quench) => { ... });

// CORRECT — quenchReady only fires when Quench is active; no guard needed
Hooks.on("quenchReady", (quench) => {
  // register batches here — this hook only fires if Quench is installed and active
  registerMyTests(quench);
});
```

**Dynamic import paths — CRITICAL (confirmed by live testing):**
```js
// WRONG — relative paths resolve from document root, not the file location
await import("./context/safety.js")      // 404
await import("../src/context/safety.js") // 404

// CORRECT — use absolute paths from the server root
const MODULE_PATH = "/modules/starforged-companion/src";
await import(`${MODULE_PATH}/context/safety.js`)  // works
```
Static imports at file top resolve correctly. Only dynamic import() has this behaviour.

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
