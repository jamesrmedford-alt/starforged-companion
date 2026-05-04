/**
 * STARFORGED COMPANION
 * src/integration/quench.js — Live Foundry integration tests via Quench
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

const MODULE_PATH = "/modules/starforged-companion/src";

// Registering Quench if it is ready to go
// quenchReady only fires when Quench is installed and active
// no guard needed here
Hooks.on("quenchReady", (quench) => {
  registerSafetyTests(quench);
  registerActorBridgeTests(quench);
  registerProgressTrackTests(quench);
  registerAssemblerTests(quench);
  registerNarratorTests(quench);
  registerPipelineTests(quench);
  registerSectorCreatorTests(quench);
});


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
          const { clearXCard } = await import(`${MODULE_PATH}/context/safety.js`);
          await clearXCard().catch(() => {});
        });

        it("suppressScene sets campaignState.xCardActive to true", async function () {
          const { suppressScene } = await import(`${MODULE_PATH}/context/safety.js`);
          await suppressScene();
          const state = game.settings.get("starforged-companion", "campaignState");
          assert.isTrue(state.xCardActive, "xCardActive should be true after suppressScene");
        });

        it("clearXCard sets campaignState.xCardActive to false", async function () {
          const { suppressScene, clearXCard } = await import(`${MODULE_PATH}/context/safety.js`);
          await suppressScene();
          await clearXCard();
          const state = game.settings.get("starforged-companion", "campaignState");
          assert.isFalse(state.xCardActive, "xCardActive should be false after clearXCard");
        });
      });

      describe("formatSafetyContext", function () {
        it("returns a non-empty string", async function () {
          const { formatSafetyContext } = await import(`${MODULE_PATH}/context/safety.js`);
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const result = formatSafetyContext(campaignState);
          assert.isString(result);
          assert.isAbove(result.length, 0);
        });

        it("includes SAFETY CONFIGURATION header", async function () {
          const { formatSafetyContext } = await import(`${MODULE_PATH}/context/safety.js`);
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
          const { readCharacterSnapshot } = await import(`${MODULE_PATH}/character/actorBridge.js`);
          const snap = readCharacterSnapshot(actor);

          assert.isNumber(snap.stats.edge,   "edge should be a number");
          assert.isNumber(snap.stats.heart,  "heart should be a number");
          assert.isNumber(snap.stats.iron,   "iron should be a number");
          assert.isNumber(snap.stats.shadow, "shadow should be a number");
          assert.isNumber(snap.stats.wits,   "wits should be a number");
        });

        it("returns meters from correct nested paths (not system.meters.health)", async function () {
          if (!actor) { this.skip(); return; }
          const { readCharacterSnapshot } = await import(`${MODULE_PATH}/character/actorBridge.js`);
          const snap = readCharacterSnapshot(actor);

          assert.isNumber(snap.meters.health,   "health should be a number");
          assert.isNumber(snap.meters.spirit,   "spirit should be a number");
          assert.isNumber(snap.meters.supply,   "supply should be a number");
          assert.isNumber(snap.meters.momentum, "momentum should be a number");
        });

        it("uses computed momentumMax and momentumReset getters", async function () {
          if (!actor) { this.skip(); return; }
          const { readCharacterSnapshot } = await import(`${MODULE_PATH}/character/actorBridge.js`);
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
          const { applyMeterChanges } = await import(`${MODULE_PATH}/character/actorBridge.js`);
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
          const { applyMeterChanges } = await import(`${MODULE_PATH}/character/actorBridge.js`);
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
          const { applyMeterChanges } = await import(`${MODULE_PATH}/character/actorBridge.js`);

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
          const { readDebilities } = await import(`${MODULE_PATH}/character/actorBridge.js`);
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
        const tracks = (journal.getFlag("starforged-companion", "tracks") ?? [])
          .filter(t => t.id !== testTrackId);
        await journal.setFlag("starforged-companion", "tracks", tracks);
      });

      describe("Progress track journal storage", function () {
        it("'Starforged Progress Tracks' journal exists after first track is created", async function () {
          const { addProgressTrack } = await import(`${MODULE_PATH}/ui/progressTracks.js`);

          await addProgressTrack({
            label: "Quench Test Vow — delete me",
            type:  "vow",
            rank:  "dangerous",
          });

          const journal = game.journal.getName("Starforged Progress Tracks");
          assert.isObject(journal, "Progress tracks journal should exist");

          const tracks = journal.getFlag("starforged-companion", "tracks") ?? [];
          assert.isArray(tracks, "Tracks should be an array");
          const track  = tracks.find(t => t.label === "Quench Test Vow — delete me");
          assert.isObject(track, "Test track should be in the journal");
          testTrackId = track?.id;
        });

        it("tracks array contains the newly created track", async function () {
          if (!testTrackId) { this.skip(); return; }
          const journal = game.journal.getName("Starforged Progress Tracks");
          const tracks  = journal.getFlag("starforged-companion", "tracks") ?? [];
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
          const { assembleContextPacket } = await import(`${MODULE_PATH}/context/assembler.js`);
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          const packet = await assembleContextPacket({}, campaignState);

          assert.isObject(packet, "packet should be an object");
          assert.isString(packet.assembled, "assembled should be a string");
          assert.isAbove(packet.assembled.length, 0, "assembled should not be empty");
        });

        it("safety section is always first", async function () {
          const { assembleContextPacket } = await import(`${MODULE_PATH}/context/assembler.js`);
          const campaignState = game.settings.get("starforged-companion", "campaignState");

          const packet = await assembleContextPacket({}, campaignState);
          const safetyIdx = packet.assembled.indexOf("SAFETY CONFIGURATION");

          assert.isAbove(safetyIdx, -1, "SAFETY CONFIGURATION header should be present");
          assert.equal(safetyIdx, packet.assembled.search(/\S/),
            "SAFETY CONFIGURATION should be the first non-whitespace content");
        });

        it("X-Card suppresses the packet when campaignState.xCardActive is true", async function () {
          const { assembleContextPacket } = await import(`${MODULE_PATH}/context/assembler.js`);
          const { suppressScene, clearXCard } = await import(`${MODULE_PATH}/context/safety.js`);

          await suppressScene();
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const packet = await assembleContextPacket({}, campaignState);
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
        narration:     "I scan the anomaly with my sensors, trying to make sense of the gravitational distortion.",
        consequences:  { momentumChange: -1, otherEffect: "Success with a cost." },
        loremasterContext: "[MOVE: Face Danger +wits] [OUTCOME: Weak Hit] [CONSEQUENCE: Success with a cost. Take -1 momentum.]",
      };

      describe("narrateResolution — live API call", function () {
        it("posts a narrator card to chat", async function () {
          this.timeout(30000);
          const apiKey = game.settings.get("starforged-companion", "claudeApiKey");
          if (!apiKey) { this.skip(); return; }

          const { narrateResolution } = await import(`${MODULE_PATH}/narration/narrator.js`);
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const before = game.messages.size;

          await narrateResolution(sampleResolution, {}, campaignState);

          assert.isAbove(game.messages.size, before,
            "A narration card should have been posted to chat");

          const last = game.messages.contents.at(-1);
          assert.isTrue(
            !!last.flags?.["starforged-companion"]?.narratorCard,
            "Narrator card should have narratorCard flag"
          );
          // Accept both real narration and fallback cards — the test
          // validates the pipeline, not the Claude output quality.
        });

        it("narrator card has sessionId flag", async function () {
          this.timeout(30000);
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
          this.timeout(30000);
          if (!game.user.isGM) { this.skip(); return; }
          // Temporarily clear the API key
          const realKey = game.settings.get("starforged-companion", "claudeApiKey");
          await game.settings.set("starforged-companion", "claudeApiKey", "");

          const { narrateResolution } = await import(`${MODULE_PATH}/narration/narrator.js`);
          const campaignState = game.settings.get("starforged-companion", "campaignState");
          const before = game.messages.size;

          await narrateResolution(sampleResolution, {}, campaignState);

          // Restore key
          await game.settings.set("starforged-companion", "claudeApiKey", realKey);

          assert.isAbove(game.messages.size, before,
            "A fallback card should still be posted even without an API key");
        });
      });
    },
    { displayName: "STARFORGED: Narrator", timeout: 30000 }
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

          const { interpretMove } = await import(`${MODULE_PATH}/moves/interpreter.js`);
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
          const { resolveMove } = await import(`${MODULE_PATH}/moves/resolver.js`);
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


// ─────────────────────────────────────────────────────────────────────────────
// SECTOR CREATOR
// ─────────────────────────────────────────────────────────────────────────────

function registerSectorCreatorTests(quench) {
  quench.registerBatch(
    "starforged-companion.sectorCreator",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("storeSector — live journal", function () {
        let createdSectorId     = null;
        let createdSettlementIds = [];
        let createdConnectionId  = null;

        after(async function () {
          // Clean up: remove sector and entity IDs from campaignState
          const state = game.settings.get("starforged-companion", "campaignState");
          if (createdSectorId) {
            state.sectors = (state.sectors ?? []).filter(s => s.id !== createdSectorId);
            if (state.activeSectorId === createdSectorId) state.activeSectorId = null;
          }
          if (createdSettlementIds.length) {
            state.settlementIds = (state.settlementIds ?? [])
              .filter(id => !createdSettlementIds.includes(id));
          }
          if (createdConnectionId) {
            state.connectionIds = (state.connectionIds ?? [])
              .filter(id => id !== createdConnectionId);
          }
          if (createdSectorId || createdSettlementIds.length || createdConnectionId) {
            await game.settings.set("starforged-companion", "campaignState", state);
          }
        });

        it("creates a 'Starforged Sectors' journal if none exists", async function () {
          const { generateSector, storeSector, createEntityJournals } = await import(
            `${MODULE_PATH}/sectors/sectorGenerator.js`
          );
          const state  = game.settings.get("starforged-companion", "campaignState");
          const sector = generateSector("expanse");
          createdSectorId = sector.id;
          const entityData = await createEntityJournals(sector, state);
          createdSettlementIds = Object.values(entityData.settlements)
            .filter(Boolean).map(j => j.id);
          createdConnectionId = entityData.connectionJournalId ?? null;
          await storeSector(sector, {
            settlements:         entityData.settlements,
            connectionJournalId: entityData.connectionJournalId,
          }, state);
          const journal = game.journal.getName("Starforged Sectors");
          assert.isNotNull(journal, "Starforged Sectors journal should exist");
        });

        it("stores sector data in journal flags", async function () {
          const journal = game.journal.getName("Starforged Sectors");
          if (!journal || !createdSectorId) { this.skip(); return; }
          const stored = journal.getFlag("starforged-companion", createdSectorId);
          assert.isObject(stored,        "sector flag should be an object");
          assert.isString(stored.name,   "sector should have a name");
          assert.isString(stored.trouble,"sector should have a trouble string");
        });

        it("sets activeSectorId in campaignState", async function () {
          const state = game.settings.get("starforged-companion", "campaignState");
          if (!createdSectorId) { this.skip(); return; }
          assert.equal(state.activeSectorId, createdSectorId,
            "activeSectorId should match the created sector");
        });

        it("creates settlement entity journals", async function () {
          const state = game.settings.get("starforged-companion", "campaignState");
          if (!createdSectorId) { this.skip(); return; }
          const sector = (state.sectors ?? []).find(s => s.id === createdSectorId);
          assert.isArray(sector?.settlementIds, "settlementIds should be an array");
          assert.isAbove(sector.settlementIds.length, 0, "should have at least one settlement");
        });

        it("creates connection entity journal", async function () {
          const state = game.settings.get("starforged-companion", "campaignState");
          if (!createdSectorId) { this.skip(); return; }
          const sector = (state.sectors ?? []).find(s => s.id === createdSectorId);
          assert.isString(sector?.connectionId, "connectionId should be a string");
          assert.isNotEmpty(sector.connectionId, "connectionId should not be empty");
        });
      });

      describe("assembler includes sector context", function () {
        it("assembled packet contains 'ACTIVE SECTOR' when a sector is active", async function () {
          const { assembleContextPacket } = await import(`${MODULE_PATH}/context/assembler.js`);
          const state = game.settings.get("starforged-companion", "campaignState");
          if (!state.activeSectorId) { this.skip(); return; }

          const packet = await assembleContextPacket(null, state);
          assert.include(packet.assembled, "ACTIVE SECTOR",
            "assembled packet should contain ACTIVE SECTOR section");
        });

        it("assembled packet omits sector section when no active sector", async function () {
          const { assembleContextPacket } = await import(`${MODULE_PATH}/context/assembler.js`);
          const state = game.settings.get("starforged-companion", "campaignState");
          const savedId = state.activeSectorId;
          state.activeSectorId = null;

          const packet = await assembleContextPacket(null, state);
          assert.notInclude(packet.assembled, "ACTIVE SECTOR",
            "assembled packet should not contain ACTIVE SECTOR when no sector is active");

          state.activeSectorId = savedId;
        });
      });

      describe("createSectorScene", function () {
        let testScene = null;

        after(async function () {
          if (testScene) {
            await testScene.delete().catch(() => {});
            testScene = null;
          }
        });

        it("creates a Foundry Scene with the sector name", async function () {
          const { generateSector } = await import(`${MODULE_PATH}/sectors/sectorGenerator.js`);
          const { createSectorScene } = await import(`${MODULE_PATH}/sectors/sceneBuilder.js`);
          const sector = generateSector("expanse");
          testScene = await createSectorScene(sector, null, {});
          assert.isObject(testScene,               "scene should be an object");
          assert.equal(testScene.name, sector.name, "scene name should match sector name");
        });

        it("scene has the correct number of notes — one per settlement", async function () {
          if (!testScene) { this.skip(); return; }
          const notes = testScene.notes?.size ?? testScene.notes?.contents?.length ?? 0;
          // expanse has 2 settlements → 2 notes
          assert.equal(notes, 2, "should have one note per settlement");
        });

        it("scene has the correct number of drawings — one per passage", async function () {
          if (!testScene) { this.skip(); return; }
          const drawings = testScene.drawings?.size ?? testScene.drawings?.contents?.length ?? 0;
          // expanse has 1 passage → 1 drawing
          assert.equal(drawings, 1, "should have one drawing per passage");
        });

        it("scene is NOT activated after creation", async function () {
          if (!testScene) { this.skip(); return; }
          // The currently active scene should NOT be our freshly-created sector scene
          const activeScene = game.scenes?.active;
          if (!activeScene) { this.skip(); return; }
          assert.notEqual(activeScene.id, testScene.id,
            "sector scene should not be auto-activated");
        });
      });

      describe("createSectorJournal", function () {
        let testJournal = null;

        after(async function () {
          if (testJournal) {
            await testJournal.delete().catch(() => {});
            testJournal = null;
          }
        });

        it("creates a JournalEntry with the sector record name", async function () {
          const { generateSector, createSectorJournal } = await import(
            `${MODULE_PATH}/sectors/sectorGenerator.js`
          );
          const sector = generateSector("terminus");
          testJournal  = await createSectorJournal(sector, {
            sector:      "Test sector stub.",
            settlements: {},
          });
          assert.isObject(testJournal,                      "journal should be an object");
          assert.include(testJournal.name, sector.name,      "journal name should include sector name");
        });

        it("journal has pages for sector overview and each settlement", async function () {
          if (!testJournal) { this.skip(); return; }
          // Confirm page count > 1 (overview + at least one settlement page)
          const pages = testJournal.pages?.size ?? testJournal.pages?.contents?.length ?? 0;
          assert.isAbove(pages, 1, "journal should have more than one page");
        });

        it("narrator stub text appears in the sector overview page", async function () {
          if (!testJournal) { this.skip(); return; }
          const overviewPage = testJournal.pages?.contents?.[0];
          if (!overviewPage) { this.skip(); return; }
          assert.include(overviewPage.text?.content ?? "", "Test sector stub.",
            "sector overview page should contain the stub text");
        });
      });

      describe("generateNarratorStubs (requires Claude API key)", function () {
        it("returns a sector stub string when API key is configured", async function () {
          this.timeout(30000);
          const apiKey = (() => {
            try { return game.settings.get("starforged-companion", "claudeApiKey"); }
            catch { return null; }
          })();
          if (!apiKey) { this.skip(); return; }

          const { generateSector, generateNarratorStubs } = await import(
            `${MODULE_PATH}/sectors/sectorGenerator.js`
          );
          const sector = generateSector("expanse");
          const stubs  = await generateNarratorStubs(sector, { perspective: "second" });

          assert.isString(stubs.sector,              "sector stub should be a string");
          assert.isNotEmpty(stubs.sector,             "sector stub should not be empty");
          assert.isObject(stubs.settlements,          "settlements stubs should be an object");
          for (const s of sector.settlements) {
            assert.isString(stubs.settlements[s.id],  `stub for ${s.name} should be a string`);
          }
        });
      });
    },
    { displayName: "STARFORGED: Sector Creator" }
  );
}
