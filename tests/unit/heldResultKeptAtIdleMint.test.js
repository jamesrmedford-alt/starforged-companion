/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldResultKeptAtIdleMint.test.js
 *
 * Issue #364 HELD-RESULT-IDLE-SESSION (found while fixing issue #362 D5).
 *
 * A free-flow result held for Burn / Improve / Keep is kept — paid and
 * narrated — when its session ends (issue #362 D5: End a Session keeps every
 * held result). But a session also ends by four idle hours (issue #362 D14),
 * and that session never gets End a Session: the boundary is taken by the
 * canonical GM's next world load or by Begin a Session, which mints the next
 * session (lifecycle.js rollSessionIfDue). Its held results stayed held across
 * the mint, and the roller's first line of the next session paid last
 * session's price and narrated last session's roll into the new session's
 * story.
 *
 * The mint now keeps every held result first, before the closing session's
 * summary is finalised and its scene closed — so the narration carries the
 * session it was rolled in, and the scene it opens closes with that session.
 *
 * On a booted table (tests/helpers/multiClient.js), as
 * tests/unit/heldResultWhoKeepsIt.test.js: the real roll holds the result, the
 * real Begin a Session relay / world load mints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss momentum 9 burns to a strong hit: held
const FACE_DANGER = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "risky", mischiefApplied: false };
const SESSION = "idle-held-s1";

let table, kira;
const world      = () => table.world.campaignState();
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && !f.narrationFallback);
const priceCards = () => table.cards(f => f.payThePriceCard);

/** Kira's player rolls a burnable miss in the live session: held, nothing paid or narrated. */
async function kirasHeldMiss() {
  control.interpretation = { ...FACE_DANGER };
  control.dice = MISS;
  await table.client("pl-1").chat("I slip through the vent before the drones turn.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).awaitingUpgrade, "setup: the miss is held").toMatchObject({ open: true });
  expect(priceCards(), "setup: nothing paid yet").toEqual([]);
  expect(narrations(), "setup: nothing narrated yet").toEqual([]);
  return card;
}

/** Everyone leaves without End a Session: nothing is posted to chat for five hours. */
function fiveIdleHours() {
  table.world.setSetting("campaignState", { ...world(), lastSessionTimestamp: ago(5 * HOUR) });
  table.world.setSetting("sessionActivity", { sessionId: SESSION, at: ago(5 * HOUR) });
}

async function beginSession() {
  const gm = table.client("gm-1");
  const gmRelay = await gm.import("../../src/multiplayer/gmRelay.js");
  await gm.run(() => gmRelay.requestGmAction("session.begin", { vignetteRolled: false, includeGalley: false }));
  await table.settle(); await table.drain();
}

async function reset({ sceneId = "idle-held-scene" } = {}) {
  control.ptp = [78];   // Pay the Price 78: "You are harmed" — Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: ago(HOUR), currentSessionId: SESSION,
      sessionStartedId: SESSION, sessionNumber: 3, lastSessionTimestamp: ago(HOUR),
      currentSceneId: sceneId, sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());

describe("issue #364 HELD-RESULT-IDLE-SESSION — a result held in a session nobody ended is kept as that session is closed out", () => {
  it("Begin a Session after four idle hours keeps it first — paid and narrated into the session it was rolled in", async () => {
    await reset();
    const card = await kirasHeldMiss();
    fiveIdleHours();
    await beginSession();

    expect(world().currentSessionId, "setup: Begin minted the next session").not.toBe(SESSION);
    expect(world().sessionActive).toBe(true);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "session-end" });
    expect(priceCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);
    const [told] = narrations();
    expect(told?.flags[MODULE_ID]).toMatchObject({ outcome: "miss", sessionId: SESSION });
    // Its card says what kept it (issue #362 AC82's line).
    expect(table.client("pl-1").render(card._id).querySelector(".sf-keep-result-settled")?.textContent).toBe("Kept as the session ended.");
  }, 60_000);

  it("the canonical GM's world load after four idle hours keeps it first, too", async () => {
    await reset();
    const card = await kirasHeldMiss();
    fiveIdleHours();
    await table.reload("gm-1");
    await table.settle(); await table.drain();

    expect(world().currentSessionId, "setup: the load minted the next session").not.toBe(SESSION);
    expect(world().sessionActive).toBe(false);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "session-end" });
    expect(kira.system.health.value).toBe(4);
    expect(narrations().map(c => c.flags[MODULE_ID].sessionId)).toEqual([SESSION]);
  }, 60_000);

  it("the scene its narration opens is closed with its session, not carried into the next", async () => {
    // No scene was open when the miss was rolled: a held result is not narrated, so it opened none.
    await reset({ sceneId: null });
    const card = await kirasHeldMiss();
    expect(world().currentSceneId, "setup: no scene yet").toBeNull();
    fiveIdleHours();
    await beginSession();

    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "session-end" });
    expect(narrations(), "setup: the kept miss was narrated").toHaveLength(1);
    expect(world().currentSessionId).not.toBe(SESSION);
    expect(world().currentSceneId, "the closing session's scene is closed by its mint").toBeNull();
  }, 60_000);

  it("the load still clears a stale move lock it found — the keep's re-read does not put it back", async () => {
    await reset();
    const card = await kirasHeldMiss();
    fiveIdleHours();
    // The GM's browser closed mid-move last night: its lock is still in the store.
    table.world.setSetting("campaignState", { ...world(), pendingMove: true, pendingMoveBy: "gm-1", pendingMoveClaim: "claim-last-night" });
    await table.reload("gm-1");
    await table.settle(); await table.drain();

    expect(flags(card._id).awaitingUpgrade, "setup: the held miss was kept by the load").toMatchObject({ open: false, resolvedBy: "session-end" });
    expect(world().currentSessionId).not.toBe(SESSION);
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null });
  }, 60_000);

  it("control: a result held in a live session stays held through its GM's reload", async () => {
    await reset();
    const card = await kirasHeldMiss();
    await table.reload("gm-1");
    await table.settle(); await table.drain();

    expect(world().currentSessionId).toBe(SESSION);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: true });
    expect(priceCards()).toEqual([]);
    expect(narrations()).toEqual([]);
  }, 60_000);
});
