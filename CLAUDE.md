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
6. When the task touches narrator behaviour, move interpretation, pacing
   classification, scene mechanics, oracles, or any new game-side feature —
   read the relevant section of `docs/rulebook-summary.md` (design intent)
   and `docs/playkit-rules-and-coverage.md` Part 1 (verbatim rules) before
   writing code. See the "Game rules reference" section below for when to
   reach for which.
7. Before writing any Foundry API code — read the relevant section of
   `docs/foundry-api-reference.md` to confirm current method signatures,
   valid values, and deprecation status. Never rely on memory for Foundry APIs.
   - Any Foundry API usage: fetch the relevant page from
     https://foundryvtt.com/api/v13/ before writing code (see External API
     reference section below)

---

## External system reference — foundry-ironsworn

The foundry-ironsworn system source is public and attached to this project
as a git submodule at `vendor/foundry-ironsworn/`, pinned to the currently
installed system version. Before writing ANY code that reads or writes
Actor documents, Item documents, or any `actor.system.*` field, you MUST
read the relevant source file first. Never guess at schema paths — they
have changed between versions and cost significant debugging time when
wrong.

**Repository:** https://github.com/ben/foundry-ironsworn  
**Confirmed schema doc:** `docs/ironsworn-api-scope.md` — read this first,
then verify against live source if the version may have changed.

**Submodule mechanics.** If the vendor folder is empty (submodule not
initialised), run:
```bash
git submodule update --init --recursive
```

When the ironsworn system is updated in Foundry, update the submodule:
```bash
cd vendor/foundry-ironsworn && git pull origin main && cd ../..
git add vendor/foundry-ironsworn
git commit -m "chore: update ironsworn vendor to v{new version}"
```

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

The DataModel definitions for Actor / Item documents also live at:
```
vendor/foundry-ironsworn/src/module/model/actor/
vendor/foundry-ironsworn/src/module/model/item/
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

## Game rules reference — Ironsworn: Starforged

Two authoritative game-rules docs live in `docs/`. They exist so the
narrator, the move pipeline, the classifier, and any new mechanic you
design behave the way the published game says they should — not the way
a quick read of a single move's text suggested.

| Doc | What it covers | When to read |
|-----|---------------|--------------|
| [`docs/playkit-rules-and-coverage.md`](docs/playkit-rules-and-coverage.md) | Verbatim summary of every move (all 51), table (the 8 d100 tables), and resolution rule from the *Starforged Playkit* (Tomkin 2022, Jan 2023 update). Part 1 is the rules; Part 2 maps each rule onto file:line in the source tree; Part 3 is a punch list of bugs and gaps. | Before implementing or fixing a specific move, table, oracle, or mechanic. Quote rule wording in commit messages where useful. Part 2 is also the fastest way to find which file owns a given rule. |
| [`docs/rulebook-summary.md`](docs/rulebook-summary.md) | Section-by-section paraphrased summary of the full rulebook (Tomkin 2022). Covers the conceptual model, mechanical structure, design principles, principles of play, and how the game's systems interrelate. Omits oracle tables and NPC stat blocks (foundry-ironsworn data) and verbatim move text (use the play kit doc for that). | Before designing narrator behaviour, classifier prompts, move-interpreter logic, scene-design features, or any cross-cutting feature that needs to fit the game's intent. The "Cross-cutting design themes" and "Implications for module design" sections at the end are especially useful for narrator / pacing / classifier work. |

**Rule:** Whenever a task touches narrator behaviour, move interpretation,
pacing classification, scene mechanics, or oracle usage — read the
relevant section of these docs before writing code. They are short,
indexed, and answer "what does the game say should happen here?"
without the noise of the full rulebook prose.

These docs are about **the game**; they are not a substitute for reading
the foundry-ironsworn source when touching Actor / Item schemas (see
the foundry-ironsworn section above), or for fetching Foundry API docs
when calling Foundry methods (see the Foundry API section below). The
play-kit doc tells you *what* a move should do; the foundry-ironsworn
schema tells you *where* on the document the result lands.

When the play kit / rulebook is reissued, update both docs and bump
their "Document maintenance" footers. The play-kit doc's Part 3 punch
list should be re-audited after any meaningful rules change.

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
| `Application` (v1) | valid | deprecated → `ApplicationV2` (removed v16) | ✅ Fixed in our code |

**Before implementing any new Foundry hook or API:**
1. Fetch the relevant docs page above
2. Confirm the method/hook/class exists in v13
3. Check the method signature — argument order and types change between versions
4. Check for deprecation notices — if deprecated, use the replacement
5. Note whether the API is available in both renderer and server contexts

**When the docs are insufficient:** the Foundry source is on GitHub at
https://github.com/foundryvtt/foundryvtt but the core codebase is not
public. Use the API docs + the error messages in the Foundry console as
your source of truth.

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

## Project context

**What this is:** A Foundry VTT companion module for Ironsworn: Starforged
supporting solo and multiplayer campaigns. Handles move interpretation via
Claude API, dice resolution, narrator (Claude Sonnet), oracle integration,
progress tracking, entity management, art generation, and safety configuration.

**Target:** Foundry v13 (v12 minimum). ES modules throughout. Vitest for
unit tests. Quench for integration tests (require live Foundry).

**Transport:** No proxy. Claude calls go directly from the browser using
Anthropic's `anthropic-dangerous-direct-browser-access: true` opt-in (see
`src/api-proxy.js`). Image generation goes directly to OpenRouter, which
supports browser CORS natively (see `src/art/openRouterImage.js`). The same
code runs on Foundry desktop and on The Forge — no setup difference, no
local Node process required.

**System dependency:** foundry-ironsworn v1.27.0. Actor schema confirmed:
stats flat on `system` (not nested), meters at `system.health.value` etc,
debilities at `system.debility` (singular), xp flat at `system.xp`.
See `vendor/foundry-ironsworn/` for authoritative source.

**Current work in progress:** See `docs/known-issues.md` for open items.
Check `docs/` for scope documents before starting any feature work.
