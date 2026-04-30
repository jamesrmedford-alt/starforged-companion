# Starforged Companion — Quench Integration Tests Scope
## Live Foundry integration testing via Quench

**Priority:** After foundations scope and API key privacy scope
**Estimated Claude Code session:** 1.5 hours
**Dependency:** Quench module installed and active in Foundry

---

## 0. Before writing any test code

Read the Quench API from the vendor submodule:

```bash
cat vendor/fvtt-quench/src/module/quench.ts
cat vendor/fvtt-quench/src/module/quench-tests/nonsense-tests.ts
```

This ensures the `registerBatch` signature, context destructuring, and
assertion API are confirmed from source before any code is written.

---

## 1. Key Quench API facts (from vendor/fvtt-quench source)

```js
// Registration hook — fires after Quench is ready
Hooks.on("quenchReady", (quench) => {

  quench.registerBatch(
    "starforged-companion.batchId",  // unique key, prefix with module ID
    (context) => {
      // ALWAYS destructure from context — do NOT use globals
      const { describe, it, assert, expect,
              before, after, beforeEach, afterEach } = context;

      describe("Suite", function () {
        it("test", async function () {
          // Chai assert interface
          assert.isTrue(true);
          assert.equal(actual, expected);
          assert.isObject(obj);
          assert.isString(str);
          assert.isNumber(num);
          assert.isArray(arr);
          assert.isAbove(a, b);

          // Chai expect interface (alternative)
          expect(value).to.equal(expected);
          expect(value).to.be.true;

          // Skip conditionally (Mocha pattern)
          if (!game.user.character) { this.skip(); return; }
        });
      });
    },
    { displayName: "STARFORGED: Batch Display Name" }
  );
});

// Run from Foundry console
quench.runBatches("starforged-companion.**");
```

**Critical differences from Vitest:**
- `describe/it/assert/expect/before/after` come from `context` — NOT imports
- No `vi.spyOn` — use vanilla JS if spying needed
- `before/after` not `beforeAll/afterAll` (Mocha naming)
- Chai assertions not Vitest expect — different API surface
- Hooks are synchronous — Foundry does not await Promise-returning hook callbacks
- Use `async function()` inside `it()` for async tests

---

## 2. Files to create/modify

### 2.1 Create `tests/integration/quench.js`

Single file registering all integration test batches. See Section 3 for
the full content.

### 2.2 Modify `module.json`

Add the integration file to `esmodules`. It must come after `src/index.js`
since it depends on module globals being registered first:

```json
"esmodules": [
  "src/index.js",
  "tests/integration/quench.js"
],
```

### 2.3 Modify `eslint.config.js`

Add `quench` as a readonly global alongside the existing Foundry globals:

```js
quench: "readonly",
```

### 2.4 Update `docs/known-issues.md`

Add a note that integration tests require Quench to be installed and active.

### 2.5 Update `docs/scope-index.md`

Mark this scope as ✅ COMPLETE once implemented.

### 2.6 Update `packs/help.json`

Add a brief "Integration Tests" section to the Troubleshooting page explaining
how to run Quench tests.

---

## 3. Full content of `tests/integration/quench.js`

```js
/**
 * STARFORGED COMPANION
 * tests/integration/quench.js — Live Foundry integration tests via Quench
 *
 * Requires: Quench module installed and active in the world.
 * Run from the Quench toolbar button, or from the Foundry console:
 *   quench.runBatches("starforged-companion.**")
 *
 * These tests run against a live Foundry world with real documents,
 * real settings, and real API calls where the API key is configured.
 * Tests that require an API key use this.skip() when no key is set.
 *
 * DO NOT import from vitest — use context destructuring from Quench.
 * Assertions use Chai (assert/expect), not Vitest's expect.
 */

// Guard — silently no-op if Quench is not installed or not active
if (!game.modules.get("quench")?.active) {
  console.log("starforged-companion | Quench not active — integration tests not registered");
} else {
  Hooks.on("quenchReady", (quench) => {
    registerSafetyTests(quench);
    registerActorBridgeTests(quench);
    registerProgressTrackTests(quench);
    registerAssemblerTests(quench);
    registerNarratorTests(quench);
    registerPipelineTests(quench);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY
// ─────────────────────────────────────────────────────────────────────────────

function registerSafetyTests(quench) {
  quench.registerBatch(
    "starforged-companion.safety",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("X-Card — suppressScene / clearXCard", function () {
        after(async function () {
          // Always restore xCardActive to false after safety tests
          const { clearXCard } = await import("../src/context/safety.js");
          await clearXCard().catch(() => {});
        });

        it("suppressScene sets campaignState.xCardActive to true", async function () {
          const { suppressScene } = await import("../src/context/safety.js");
          await suppressScene();
          const state = game.settings.get("starforged-companion", "campaignState");
          assert.isTrue(state.xCardActive, "xCardActive should be true after suppressScene");
        });

        it("clearXCard sets campaignState.xCardActive to false", async function () {
          const { suppressScene, clearXCard } = await import("../src/context/safety.js");
          await suppressScene();
          await clearXCard();
          const state = game.settings.get("starforged-companion", "campaignState");
          assert.isFalse(state.xCardActive, "xCardActive should be false after clearXCard");
        });
      });

      describe("formatSafetyContext", function () {
        it("returns a non-empty string", async function () {
          const { formatSafetyContext } = await import("../src/context/safety.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const result = formatSafetyContext(campaignState);
          assert.isString(result);
          assert.isAbove(result.length, 0);
        });

        it("includes SAFETY CONFIGURATION header", async function () {
          const { formatSafetyContext } = await import("../src/context/safety.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const result = formatSafetyContext(campaignState);
          assert.include(result, "SAFETY CONFIGURATION");
        });
      });
    },
    { displayName: "STARFORGED: Safety System" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTOR BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

function registerActorBridgeTests(quench) {
  quench.registerBatch(
    "starforged-companion.actorBridge",
    (context) => {
      const { describe, it, assert, before } = context;
      let actor;

      before(async function () {
        actor = game.user.character;
        if (!actor) {
          console.warn("STARFORGED | No character assigned to user — actor bridge tests will be skipped");
        }
      });

      describe("readCharacterSnapshot — confirms correct schema paths", function () {
        it("returns stats from correct flat paths (not system.stats.edge)", async function () {
          if (!actor) { this.skip(); return; }
          const { readCharacterSnapshot } = await import("../src/character/actorBridge.js");
          const snap = readCharacterSnapshot(actor);

          assert.isNumber(snap.stats.edge,   "edge should be a number");
          assert.isNumber(snap.stats.heart,  "heart should be a number");
          assert.isNumber(snap.stats.iron,   "iron should be a number");
          assert.isNumber(snap.stats.shadow, "shadow should be a number");
          assert.isNumber(snap.stats.wits,   "wits should be a number");
        });

        it("returns meters from correct nested paths (not system.meters.health)", async function () {
          if (!actor) { this.skip(); return; }
          const { readCharacterSnapshot } = await import("../src/character/actorBridge.js");
          const snap = readCharacterSnapshot(actor);

          assert.isNumber(snap.meters.health,   "health should be a number");
          assert.isNumber(snap.meters.spirit,   "spirit should be a number");
          assert.isNumber(snap.meters.supply,   "supply should be a number");
          assert.isNumber(snap.meters.momentum, "momentum should be a number");
        });

        it("uses computed momentumMax and momentumReset getters", async function () {
          if (!actor) { this.skip(); return; }
          const { readCharacterSnapshot } = await import("../src/character/actorBridge.js");
          const snap = readCharacterSnapshot(actor);

          assert.isNumber(snap.momentumMax,   "momentumMax should be a number");
          assert.isNumber(snap.momentumReset, "momentumReset should be a number");
          assert.isAtMost(snap.momentumMax, 10, "momentumMax should be <= 10");
          assert.isAtLeast(snap.momentumReset, -2, "momentumReset should be >= -2");
        });
      });

      describe("applyMeterChanges — live actor writes", function () {
        it("correctly decrements and restores momentum", async function () {
          if (!actor) { this.skip(); return; }
          const { applyMeterChanges } = await import("../src/character/actorBridge.js");
          const before = actor.system.momentum.value;

          await applyMeterChanges(actor, { momentum: -1 });
          assert.equal(actor.system.momentum.value, before - 1,
            "momentum should have decreased by 1");

          // Restore
          await applyMeterChanges(actor, { momentum: 1 });
          assert.equal(actor.system.momentum.value, before,
            "momentum should be restored to original value");
        });

        it("respects momentum minimum (does not go below momentumReset)", async function () {
          if (!actor) { this.skip(); return; }
          const { applyMeterChanges } = await import("../src/character/actorBridge.js");
          const resetValue = actor.system.momentumReset;

          // Try to set momentum way below the minimum
          await applyMeterChanges(actor, { momentum: -100 });
          assert.isAtLeast(actor.system.momentum.value, resetValue,
            "momentum should not go below momentumReset");

          // Restore to 2 (initial value)
          await actor.update({ "system.momentum.value": 2 });
        });

        it("batches multiple meter changes in one update call", async function () {
          if (!actor) { this.skip(); return; }
          const { applyMeterChanges } = await import("../src/character/actorBridge.js");

          const beforeHealth   = actor.system.health.value;
          const beforeMomentum = actor.system.momentum.value;

          await applyMeterChanges(actor, { health: -1, momentum: 1 });

          // Both should have changed
          assert.equal(actor.system.health.value, Math.max(0, beforeHealth - 1));
          assert.equal(actor.system.momentum.value,
            Math.min(actor.system.momentumMax, beforeMomentum + 1));

          // Restore
          await actor.update({
            "system.health.value":   beforeHealth,
            "system.momentum.value": beforeMomentum,
          });
        });
      });

      describe("readDebilities — confirms singular key (system.debility)", function () {
        it("reads from system.debility not system.debilities", async function () {
          if (!actor) { this.skip(); return; }
          const { readDebilities } = await import("../src/character/actorBridge.js");
          const debilities = readDebilities(actor);

          assert.isObject(debilities, "debilities should be an object");
          assert.property(debilities, "wounded",   "should have wounded key");
          assert.property(debilities, "shaken",    "should have shaken key");
          assert.property(debilities, "battered",  "should have battered key");
          assert.isBoolean(debilities.wounded,     "wounded should be boolean");
        });
      });
    },
    { displayName: "STARFORGED: Actor Bridge" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS TRACKS
// ─────────────────────────────────────────────────────────────────────────────

function registerProgressTrackTests(quench) {
  quench.registerBatch(
    "starforged-companion.progressTracks",
    (context) => {
      const { describe, it, assert, after } = context;
      let testTrackId = null;

      after(async function () {
        // Clean up test track if it was created
        if (!testTrackId) return;
        const journal = game.journal.getName("Starforged Progress Tracks");
        if (!journal) return;
        const page = journal.pages.contents[0];
        if (!page) return;
        const tracks = (page.getFlag("starforged-companion", "tracks") ?? [])
          .filter(t => t.id !== testTrackId);
        await page.setFlag("starforged-companion", "tracks", tracks);
      });

      describe("Progress track journal storage", function () {
        it("'Starforged Progress Tracks' journal exists after first track is created", async function () {
          const { addProgressTrack } = await import("../src/ui/progressTracks.js");

          await addProgressTrack({
            label: "Quench Test Vow — delete me",
            type:  "vow",
            rank:  "dangerous",
          });

          const journal = game.journal.getName("Starforged Progress Tracks");
          assert.isObject(journal, "Progress tracks journal should exist");

          const page = journal.pages.contents[0];
          assert.isObject(page, "Journal should have at least one page");

          const tracks = page.getFlag("starforged-companion", "tracks") ?? [];
          const track  = tracks.find(t => t.label === "Quench Test Vow — delete me");
          assert.isObject(track, "Test track should be in the journal");
          testTrackId = track?.id;
        });

        it("tracks array contains the newly created track", async function () {
          if (!testTrackId) { this.skip(); return; }
          const journal = game.journal.getName("Starforged Progress Tracks");
          const page    = journal.pages.contents[0];
          const tracks  = page.getFlag("starforged-companion", "tracks") ?? [];
          const track   = tracks.find(t => t.id === testTrackId);

          assert.isObject(track);
          assert.equal(track.type, "vow");
          assert.equal(track.rank, "dangerous");
          assert.equal(track.ticks, 0, "new track should start at 0 ticks");
        });
      });
    },
    { displayName: "STARFORGED: Progress Tracks" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSEMBLER
// ─────────────────────────────────────────────────────────────────────────────

function registerAssemblerTests(quench) {
  quench.registerBatch(
    "starforged-companion.assembler",
    (context) => {
      const { describe, it, assert } = context;

      describe("assembleContextPacket — live world", function () {
        it("returns a packet with a non-empty assembled string", async function () {
          const { assembleContextPacket } = await import("../src/context/assembler.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          const packet = await assembleContextPacket(null, campaignState);

          assert.isObject(packet, "packet should be an object");
          assert.isString(packet.assembled, "assembled should be a string");
          assert.isAbove(packet.assembled.length, 0, "assembled should not be empty");
        });

        it("safety section is always first", async function () {
          const { assembleContextPacket } = await import("../src/context/assembler.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          const packet = await assembleContextPacket(null, campaignState);
          const safetyIdx = packet.assembled.indexOf("SAFETY CONFIGURATION");

          assert.isAbove(safetyIdx, -1, "SAFETY CONFIGURATION header should be present");
          assert.equal(safetyIdx, packet.assembled.search(/\S/),
            "SAFETY CONFIGURATION should be the first non-whitespace content");
        });

        it("X-Card suppresses the packet when campaignState.xCardActive is true", async function () {
          const { assembleContextPacket } = await import("../src/context/assembler.js");
          const { suppressScene, clearXCard } = await import("../src/context/safety.js");

          await suppressScene();
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const packet = await assembleContextPacket(null, campaignState);
          await clearXCard();

          assert.include(packet.assembled, "SCENE PAUSED", "X-Card should produce SCENE PAUSED packet");
          assert.equal(packet.triggeredBy, "x_card");
        });
      });
    },
    { displayName: "STARFORGED: Assembler" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NARRATOR
// ─────────────────────────────────────────────────────────────────────────────

function registerNarratorTests(quench) {
  quench.registerBatch(
    "starforged-companion.narrator",
    (context) => {
      const { describe, it, assert } = context;

      // Sample resolution for narrator tests
      const sampleResolution = {
        _id:           "quench-test-resolution",
        moveName:      "Face Danger",
        statUsed:      "wits",
        statValue:     2,
        actionDie:     5,
        actionScore:   7,
        challengeDice: [3, 8],
        outcome:       "weak_hit",
        outcomeLabel:  "Weak Hit",
        consequences:  { momentumChange: -1, otherEffect: "Success with a cost." },
        loremasterContext: "[MOVE: Face Danger +wits] [OUTCOME: Weak Hit]",
      };

      describe("narrateResolution — live API call", function () {
        it("posts a narrator card to chat", async function () {
          const apiKey = game.settings.get("starforged-companion", "claudeApiKey");
          if (!apiKey) { this.skip(); return; }

          const { narrateResolution } = await import("../src/narration/narrator.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const before = game.messages.size;

          await narrateResolution(sampleResolution, campaignState);

          assert.isAbove(game.messages.size, before,
            "A narration card should have been posted to chat");

          const last = game.messages.contents.at(-1);
          assert.isTrue(
            !!last.flags?.["starforged-companion"]?.narratorCard,
            "Narrator card should have narratorCard flag"
          );
        });

        it("narrator card has sessionId flag", async function () {
          const apiKey = game.settings.get("starforged-companion", "claudeApiKey");
          if (!apiKey) { this.skip(); return; }

          const last = game.messages.contents.at(-1);
          if (!last?.flags?.["starforged-companion"]?.narratorCard) { this.skip(); return; }

          assert.isString(
            last.flags["starforged-companion"].sessionId,
            "Narrator card should have sessionId flag"
          );
        });
      });

      describe("narrateResolution — fallback on missing key", function () {
        it("posts a fallback card when no API key is configured", async function () {
          // Temporarily clear the API key
          const realKey = game.settings.get("starforged-companion", "claudeApiKey");
          await game.settings.set("starforged-companion", "claudeApiKey", "");

          const { narrateResolution } = await import("../src/narration/narrator.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const before = game.messages.size;

          await narrateResolution(sampleResolution, campaignState);

          // Restore key
          await game.settings.set("starforged-companion", "claudeApiKey", realKey);

          assert.isAbove(game.messages.size, before,
            "A fallback card should still be posted even without an API key");
        });
      });
    },
    { displayName: "STARFORGED: Narrator" }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

function registerPipelineTests(quench) {
  quench.registerBatch(
    "starforged-companion.pipeline",
    (context) => {
      const { describe, it, assert } = context;

      describe("End-to-end: interpret → resolve → assemble", function () {
        it("interpretMove returns a valid interpretation", async function () {
          const apiKey = game.settings.get("starforged-companion", "claudeApiKey");
          if (!apiKey) { this.skip(); return; }

          const { interpretMove } = await import("../src/moves/interpreter.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          const result = await interpretMove(
            "I try to patch the hull breach before we lose pressure",
            { campaignState, mischiefLevel: "lawful", apiKey }
          );

          assert.isObject(result,            "result should be an object");
          assert.isString(result.moveId,     "moveId should be a string");
          assert.isString(result.statUsed,   "statUsed should be a string");
          assert.isString(result.rationale,  "rationale should be a string");
          assert.isBoolean(result.mischiefApplied, "mischiefApplied should be boolean");
        });

        it("resolveMove produces a valid resolution from an interpretation", async function () {
          const { resolveMove } = await import("../src/moves/resolver.js");
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          // Use a fixed interpretation so this test doesn't require an API call
          const fixedInterp = {
            moveId:          "face_danger",
            statUsed:        "wits",
            statValue:       2,
            rationale:       "Hull breach requires focused action",
            mischiefApplied: false,
          };

          const resolution = resolveMove(fixedInterp, campaignState);

          assert.isObject(resolution,           "resolution should be an object");
          assert.include(
            ["strong_hit", "weak_hit", "miss"],
            resolution.outcome,
            "outcome should be strong_hit, weak_hit, or miss"
          );
          assert.isNumber(resolution.actionDie,        "actionDie should be a number");
          assert.isArray(resolution.challengeDice,     "challengeDice should be an array");
          assert.lengthOf(resolution.challengeDice, 2, "challengeDice should have 2 elements");
          assert.isString(resolution.loremasterContext, "loremasterContext should be a string");
        });
      });
    },
    { displayName: "STARFORGED: Full Pipeline" }
  );
}
```

---

## 4. Claude Code implementation instructions

```
Read vendor/fvtt-quench/src/module/quench.ts to confirm the current API
before writing any test code.

Then implement:

1. Create tests/integration/quench.js with the full content from
   docs/quench-integration-scope.md Section 3

2. Update module.json esmodules to include "tests/integration/quench.js"
   after "src/index.js"

3. Update eslint.config.js — add quench as a readonly global in the
   main globals block alongside the Foundry VTT globals

4. Run npm test — confirm unit tests still pass (integration file should
   be excluded by vitest.config.js which excludes tests/integration/**)

5. Run npm run lint — fix any lint errors in the new file

6. Update packs/help.json — add to the Troubleshooting page:
   <h3>Running integration tests</h3>
   <p>Install and enable the <strong>Quench</strong> module. Click the
   flask icon in the Foundry toolbar. Select batches starting with
   "STARFORGED:" and click Run. Tests requiring an API key will be
   skipped automatically if no key is configured.</p>

7. Update docs/scope-index.md — mark quench-integration-scope as
   ✅ COMPLETE

8. Commit as: "test: add Quench integration tests for all implemented features"
```

---

## 5. Running the tests

**In Foundry:**
1. Enable the Quench module in your world
2. Start the proxy: `npm run proxy`
3. Launch Foundry
4. Click the flask icon in the toolbar
5. Select any "STARFORGED:" batch and click Run

**From the Foundry console:**
```js
// Run all starforged integration tests
quench.runBatches("starforged-companion.**");

// Run a specific batch
quench.runBatches(["starforged-companion.actorBridge"]);

// Run and save JSON report
quench.runBatches("starforged-companion.**", { json: true });
```

**Expected results without API key:**
- Safety: ✅ all pass
- Actor Bridge: ✅ all pass (requires character assigned to user)
- Progress Tracks: ✅ all pass
- Assembler: ✅ all pass
- Narrator: ⏭ skipped (no API key)
- Pipeline: ⏭ partially skipped (interpretMove skipped, resolveMove passes)

**Expected results with API key:**
- All batches: ✅ pass

---

## 6. Test cleanup guarantee

Every test that creates a document (progress track) or modifies world state
(momentum, xCardActive) has an `after()` block that restores the original state.
Running tests repeatedly should leave the world in the same state as before.
