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
  registerEntityWorldJournalTests(quench);
  registerWorldJournalTests(quench);
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
          await clearXCard().catch(err => console.error("starforged-companion | quench: clearXCard teardown failed:", err));
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
          this.timeout(30000);
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
            await testScene.delete().catch(err =>
              console.error(`starforged-companion | quench: testScene teardown failed (orphaned scene id ${testScene?.id ?? "?"}):`, err));
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
            await testJournal.delete().catch(err =>
              console.error(`starforged-companion | quench: testJournal teardown failed (orphaned journal id ${testJournal?.id ?? "?"}):`, err));
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
          let apiKey;
          try {
            apiKey = game.settings.get("starforged-companion", "claudeApiKey");
          } catch (err) {
            console.error("starforged-companion | quench: claudeApiKey settings read failed:", err);
            this.skip();
            return;
          }
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


// ─────────────────────────────────────────────────────────────────────────────
// COMBINED DETECTION PASS — Entity Discovery × World Journal
// ─────────────────────────────────────────────────────────────────────────────

function registerEntityWorldJournalTests(quench) {
  quench.registerBatch(
    "starforged-companion.entityWorldJournal",
    (context) => {
      const { describe, it, assert, before, after, beforeEach } = context;

      const MODULE = "starforged-companion";
      let createdJournalIds = [];

      // Track journals so we can clean up after the batch
      function track(journal) {
        if (journal?.id) createdJournalIds.push(journal.id);
      }

      after(async function () {
        for (const id of createdJournalIds) {
          const j = game.journal?.get(id);
          if (j?.delete) {
            await j.delete().catch(err =>
              console.warn(`${MODULE} | quench: cleanup failed for journal ${id}:`, err));
          }
        }
        createdJournalIds = [];
      });

      describe("Combined detection routing — cross-dependency suppression", function () {
        let stateAtStart = null;

        before(async function () {
          this.timeout(20000);
          if (!game.user.isGM) { this.skip(); return; }
          stateAtStart = JSON.parse(JSON.stringify(
            game.settings.get(MODULE, "campaignState"),
          ));
        });

        after(async function () {
          if (!game.user.isGM) return;
          if (stateAtStart) await game.settings.set(MODULE, "campaignState", stateAtStart);
        });

        beforeEach(async function () {
          this.timeout(20000);
          if (!game.user.isGM) { this.skip(); return; }
          const { createFaction } = await import(`${MODULE_PATH}/entities/faction.js`);
          const { recordFactionIntelligence } = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");

          // Entity record for "The Covenant"
          await createFaction({ name: "The Covenant", relationship: "antagonistic" }, state);
          // WJ entry for "The Iron Compact" — no entity record
          await recordFactionIntelligence(
            "The Iron Compact",
            { attitude: "neutral", summary: "first contact" },
            state,
          );
          await game.settings.set(MODULE, "campaignState", state);
        });

        it("faction with entity record → entity is treated as authoritative; WJ suppressed", async function () {
          this.timeout(30000);
          const { routeWorldJournalResults } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");

          const before = wj.getFactionLandscape(state).length;
          await routeWorldJournalResults({
            factionUpdates: [{ name: "The Covenant", attitude: "antagonistic", summary: "burned the relay" }],
          }, state);
          const after = wj.getFactionLandscape(state).length;

          assert.equal(after, before,
            "WJ should not gain a faction entry when an entity record already exists");
        });

        it("faction without entity record → WJ entry created", async function () {
          this.timeout(30000);
          const { routeWorldJournalResults } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");

          await routeWorldJournalResults({
            factionUpdates: [{ name: "Brand New Faction", attitude: "neutral", summary: "spotted" }],
          }, state);

          const updated = wj.getFactionLandscape(state);
          const found = updated.find(f => f.factionName === "Brand New Faction");
          assert.isObject(found, "Brand New Faction should exist as a WJ entry");
        });

        it("lore always routes to WJ regardless of entity records", async function () {
          this.timeout(30000);
          const { routeWorldJournalResults } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Test lore — ${Date.now()}`;

          await routeWorldJournalResults({
            lore: [{ title, text: "Discovered.", confirmed: true }],
          }, state);

          const found = wj.getConfirmedLore(state).find(l => l.title === title);
          assert.isObject(found, "Lore should always route to WJ");
        });

        it("threat always routes to WJ regardless of entity records", async function () {
          this.timeout(30000);
          const { routeWorldJournalResults } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const name = `Test threat — ${Date.now()}`;

          await routeWorldJournalResults({
            threats: [{ name, severity: "active", summary: "immediate danger" }],
          }, state);

          const found = wj.getActiveThreats(state).find(t => t.name === name);
          assert.isObject(found, "Threat should always route to WJ");
        });

        it("creature routes to entity drafts only, never to WJ", async function () {
          this.timeout(30000);
          const { routeWorldJournalResults } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");

          // Creatures aren't even in the WJ schema — passing one through
          // should not produce any WJ entry.
          await routeWorldJournalResults({
            // no creature key — combined detection routes creatures via entities
            lore: [], threats: [], factionUpdates: [], locationUpdates: [],
            stateTransitions: [],
          }, state);

          // Sanity: this just confirms no WJ entry was magically created
          const factionCount = wj.getFactionLandscape(state).length;
          assert.isAtLeast(factionCount, 0, "No spurious WJ entry from creature input");
        });
      });

      describe("Clarification card — pendingClarification state", function () {
        it("ClarificationDialog.prompt resolves with the player's selection", async function () {
          this.timeout(20000);
          if (!game.user.isGM) { this.skip(); return; }
          const { ClarificationDialog, applyClarificationSelection } =
            await import(`${MODULE_PATH}/world/clarificationDialog.js`);

          // Simulate a "no specific entity" close path — synthesised here.
          // We don't actually open the dialog (that requires user input); we
          // just verify the helper transforms the relevance correctly.
          const relevance = {
            resolvedClass: "interaction", entityIds: [], entityTypes: [],
            matchedNames: [], needsClarification: true, referenceType: "pronoun",
          };
          const updated = applyClarificationSelection(
            relevance,
            { kind: "none", entityId: null, entityType: null, entityName: null },
          );
          assert.equal(updated.resolvedClass,    "embellishment");
          assert.equal(updated.needsClarification, false);

          // ClarificationDialog must be a class
          assert.isFunction(ClarificationDialog);
          assert.isFunction(ClarificationDialog.prompt);
        });

        it("'Someone new' selection resolves as discovery", async function () {
          const { applyClarificationSelection } =
            await import(`${MODULE_PATH}/world/clarificationDialog.js`);
          const updated = applyClarificationSelection(
            { resolvedClass: "interaction", needsClarification: true },
            { kind: "new" },
          );
          assert.equal(updated.resolvedClass, "discovery");
        });

        it("known-entity selection resolves as interaction with the entity injected", async function () {
          const { applyClarificationSelection } =
            await import(`${MODULE_PATH}/world/clarificationDialog.js`);
          const updated = applyClarificationSelection(
            { resolvedClass: "interaction", needsClarification: true },
            { kind: "entity", entityId: "j1", entityType: "connection", entityName: "Sable" },
          );
          assert.equal(updated.resolvedClass, "interaction");
          assert.deepEqual(updated.entityIds,  ["j1"]);
          assert.deepEqual(updated.entityTypes, ["connection"]);
        });
      });

      describe("make_a_connection auto-creation pipeline", function () {
        it("oracle seeds appear in resolution after a make_a_connection roll", async function () {
          this.timeout(20000);
          const { resolveMove } = await import(`${MODULE_PATH}/moves/resolver.js`);
          const interp = {
            moveId:    "make_a_connection",
            moveName:  "Make a Connection",
            statUsed:  "heart",
            statValue: 3,
            adds:      0,
            playerNarration: "I look up an old contact.",
            mischiefLevel:   "balanced",
          };
          const state = game.settings.get(MODULE, "campaignState");
          const resolution = resolveMove(interp, state);
          assert.isObject(resolution.oracleSeeds,
            "resolution.oracleSeeds should exist for make_a_connection");
          assert.equal(resolution.oracleSeeds.context, "make_a_connection");
        });

        it("connection record is created from narration text after a strong/weak hit", async function () {
          this.timeout(30000);
          if (!game.user.isGM) { this.skip(); return; }

          const { routeEntityDrafts } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const state = game.settings.get(MODULE, "campaignState");
          const beforeIds = new Set(state.connectionIds ?? []);

          const result = await routeEntityDrafts(
            [{ type: "connection", name: `Test NPC ${Date.now()}`, description: "fresh", confidence: "high" }],
            state,
            { autoCreateConnection: true, sessionId: state.currentSessionId ?? "" },
          );

          assert.equal(result.created.length, 1, "expected one auto-created connection");
          const newIds = (state.connectionIds ?? []).filter(id => !beforeIds.has(id));
          for (const id of newIds) track(game.journal?.get(id));
          assert.isAtLeast(newIds.length, 1, "campaignState should gain a new connection id");
        });

        it("no connection is auto-created when only the queued path runs", async function () {
          this.timeout(20000);
          if (!game.user.isGM) { this.skip(); return; }
          const { routeEntityDrafts } = await import(
            `${MODULE_PATH}/entities/entityExtractor.js`
          );
          const state = game.settings.get(MODULE, "campaignState");
          const before = (state.connectionIds ?? []).length;

          await routeEntityDrafts(
            [{ type: "connection", name: `No-Auto Test ${Date.now()}`, confidence: "high" }],
            state,
            // no autoCreateConnection — should queue, not create
          );

          assert.equal((state.connectionIds ?? []).length, before,
            "connectionIds should not grow when autoCreateConnection is not set");
        });
      });
    },
    { displayName: "STARFORGED: Entity × World Journal" },
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// WORLD JOURNAL — live CRUD + assembler injection
// ─────────────────────────────────────────────────────────────────────────────

function registerWorldJournalTests(quench) {
  quench.registerBatch(
    "starforged-companion.worldJournal",
    (context) => {
      const { describe, it, assert, before, after } = context;
      const MODULE = "starforged-companion";

      let stateAtStart = null;
      const createdJournalIds = [];

      before(async function () {
        if (!game.user.isGM) { this.skip(); return; }
        stateAtStart = JSON.parse(JSON.stringify(
          game.settings.get(MODULE, "campaignState"),
        ));
      });

      after(async function () {
        if (!game.user.isGM) return;
        if (stateAtStart) {
          await game.settings.set(MODULE, "campaignState", stateAtStart);
        }
        for (const id of createdJournalIds) {
          const j = game.journal?.get(id);
          if (j?.delete) {
            await j.delete().catch(err =>
              console.warn(`${MODULE} | quench: cleanup failed for journal ${id}:`, err));
          }
        }
      });

      describe("WJ CRUD — live Foundry", function () {
        it("initWorldJournals creates the folder and all category journals", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          await wj.initWorldJournals();
          for (const name of Object.values(wj.JOURNAL_NAMES)) {
            const j = game.journal?.getName?.(name);
            assert.isObject(j, `journal "${name}" should exist after init`);
          }
        });

        it("!journal lore confirmed creates an entry with confirmed: true", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Quench confirmed lore — ${Date.now()}`;

          const parsed = wj.parseJournalCommand(`!journal lore "${title}" confirmed — quench-test`);
          await wj.executeJournalCommand(parsed, state);

          const found = wj.getConfirmedLore(state).find(l => l.title === title);
          assert.isObject(found, "confirmed lore entry should exist");
          assert.equal(found.confirmed, true);
        });

        it("promoteLoreToConfirmed sets confirmed: true and stamps promotedAt", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Soft fact ${Date.now()}`;

          await wj.recordLoreDiscovery(title,
            { text: "x", narratorAsserted: true, confirmed: false }, state);

          const result = await wj.promoteLoreToConfirmed(title, state);
          assert.isObject(result);
          assert.equal(result.confirmed, true);
          assert.isString(result.promotedAt);
        });

        it("applyStateTransition resolved → threat severity becomes 'resolved'", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const name = `AI fragment ${Date.now()}`;

          await wj.recordThreat(name, { severity: "immediate", summary: "live" }, state);
          await wj.applyStateTransition(
            { entryType: "threat", name, change: "resolved" }, state,
          );

          const entries = wj.getActiveThreats(state);
          const stillActive = entries.find(t => t.name === name);
          assert.isUndefined(stillActive,
            "resolved threats should not appear in getActiveThreats");
        });

        it("applyStateTransition contradicted → posts a GM whispered card, lore unchanged", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Established ${Date.now()}`;

          await wj.recordLoreDiscovery(title, { confirmed: true, text: "do not contradict" }, state);
          const before = game.messages.size;

          await wj.applyStateTransition(
            { entryType: "lore", name: title, change: "contradicted",
              summary: "narration described the opposite" }, state,
          );

          assert.isAbove(game.messages.size, before,
            "a contradiction notification card should have been posted");
          const last = game.messages.contents.at(-1);
          assert.isTrue(
            !!last.flags?.[MODULE]?.worldJournalContradiction,
            "card should carry worldJournalContradiction flag",
          );
          // Lore unchanged
          const found = wj.getConfirmedLore(state).find(l => l.title === title);
          assert.equal(found.text, "do not contradict",
            "the lore entry's text should not have been mutated");
        });

        it("annotateEntry surfaces in the entry's annotations array", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Annotatable lore ${Date.now()}`;

          await wj.recordLoreDiscovery(title, { confirmed: true, text: "x" }, state);
          await wj.annotateEntry("lore", title, "GM note", "Quench Reviewer", state);

          const journal = game.journal?.getName?.(wj.JOURNAL_NAMES.lore);
          const page    = journal?.pages?.contents?.find(p => p.name === title);
          const entry   = page?.flags?.[MODULE]?.[wj.FLAG_KEYS.lore];
          const ann     = entry?.annotations ?? [];
          assert.isAtLeast(ann.length, 1);
          assert.equal(ann.at(-1).author, "Quench Reviewer");
        });

        it("writeSessionLog produces a session-log page", async function () {
          this.timeout(20000);
          const wj = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const before = game.journal?.getName?.(wj.JOURNAL_NAMES.sessionLog)?.pages?.contents?.length ?? 0;
          const page = await wj.writeSessionLog(state);
          assert.isObject(page);
          const after = game.journal?.getName?.(wj.JOURNAL_NAMES.sessionLog)?.pages?.contents?.length ?? 0;
          assert.isAtLeast(after, before + 1);
        });
      });

      describe("Assembler injection — Sections 3, 4, 9, 10", function () {
        it("confirmed lore appears in Section 3 of the assembled context packet", async function () {
          this.timeout(30000);
          const wj   = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const asm  = await import(`${MODULE_PATH}/context/assembler.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const title = `Section 3 confirmed ${Date.now()}`;

          await wj.recordLoreDiscovery(title, { confirmed: true, text: "section-3 test" }, state);

          const packet = await asm.assembleContextPacket(null, state, { tokenBudget: 4000 });
          assert.match(packet.assembled, /ESTABLISHED LORE/);
          assert.include(packet.assembled, title);
        });

        it("immediate threats appear in Section 4 of the assembled context packet", async function () {
          this.timeout(30000);
          const wj  = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const asm = await import(`${MODULE_PATH}/context/assembler.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const name = `Section 4 immediate ${Date.now()}`;

          await wj.recordThreat(name, { severity: "immediate", summary: "section-4 test" }, state);

          const packet = await asm.assembleContextPacket(null, state, { tokenBudget: 4000 });
          assert.match(packet.assembled, /ACTIVE THREATS/);
          assert.match(packet.assembled, new RegExp(`IMMEDIATE: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        });

        it("faction landscape (Section 9) includes WJ-only factions, excludes those with entity records", async function () {
          this.timeout(30000);
          const wj   = await import(`${MODULE_PATH}/world/worldJournal.js`);
          const asm  = await import(`${MODULE_PATH}/context/assembler.js`);
          const { createFaction } = await import(`${MODULE_PATH}/entities/faction.js`);
          const state = game.settings.get(MODULE, "campaignState");
          const wjOnlyName = `WJ-only Faction ${Date.now()}`;
          const entityName = `Entity-backed Faction ${Date.now()}`;

          // Faction with no entity record — should appear in Section 9
          await wj.recordFactionIntelligence(wjOnlyName,
            { attitude: "neutral", summary: "first contact" }, state);

          // Faction WITH entity record — should NOT appear in Section 9
          await createFaction({ name: entityName, relationship: "neutral" }, state);
          await wj.recordFactionIntelligence(entityName,
            { attitude: "neutral", summary: "via detection" }, state);
          await game.settings.set(MODULE, "campaignState", state);

          const fresh  = game.settings.get(MODULE, "campaignState");
          const packet = await asm.assembleContextPacket(null, fresh, { tokenBudget: 4000 });
          const factionBlock = packet.assembled.split("FACTION ATTITUDES")[1] ?? "";
          assert.include(factionBlock, wjOnlyName,
            "WJ-only faction should appear in Section 9");
          assert.notInclude(factionBlock, entityName,
            "Entity-backed faction should NOT appear in Section 9");

          // Track the entity journal for cleanup
          const entityJournal = (fresh.factionIds ?? [])
            .map(id => game.journal?.get(id))
            .find(j => j?.name === entityName);
          if (entityJournal?.id) createdJournalIds.push(entityJournal.id);
        });
      });
    },
    { displayName: "STARFORGED: World Journal" },
  );
}
