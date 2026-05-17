# External system reference — Quench (integration testing)

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
