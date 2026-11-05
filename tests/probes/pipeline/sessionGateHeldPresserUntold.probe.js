/**
 * PROBE — PIPE-03 SESSION-GATE-HELD-PRESSER-UNTOLD (tenth audit, area pipeline)
 *
 * What the user does: the session has ended (End a Session, or it went idle
 * and the world was reopened) and a player presses a claimed card button
 * from the last session — Kira's player presses "🏁 Attempt to Fulfill Vow"
 * on her Gather Information card. The press relays to the canonical GM
 * (fulfilVow.attempt), which claims the card and posts the forced Fulfill
 * Your Vow as Kira, flagged deferWhileBusy.
 *
 * What happens: the GM's pipeline meets the session gate, holds the move
 * until a session begins (issue #329 X14) and whispers the "No session has
 * begun" notice to the message's AUTHOR and the GMs (postSessionGateNotice,
 * src/index.js:1953–1983) — but the author of a relayed forced move is the
 * GM who posted it, and the held-move notification (deferForcedMove, :1927–1938)
 * is a ui.notifications.info on the GM's own screen. The player who pressed
 * sees the button grey out as taken and nothing else: no card, no notice.
 *
 * What should happen: "No silent no-op on a player's action" (issue #329
 * X13/X14's decision: "the session gate whispers the author why nothing
 * ran"): the presser is told their move is held until Begin a Session —
 * the card's roller's player (the PC's owner, `speaker.actor`), as the
 * typed-line path tells its typist.
 *
 * Control: the GM pressing the same button is told (they are the author);
 * once a session begins the held move is rolled, once.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/sessionGateHeldPresserUntold.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => ({
    moveId: expectedMoveSlug ?? "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0,
    rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat",
  })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const STRONG_ACTION   = [0.0, 0.15, 0.99];   // challenge 1, 2; action die 6
const MISS_PROGRESS   = [0.95, 0.95];        // challenge 10, 10 against 2 boxes

function makeVow() {
  const item = {
    id: "vow-kira", type: "progress", name: "Find Chen", flags: { [MODULE_ID]: { vowId: "vid-kira" } },
    system: { subtype: "vow", rank: "dangerous", current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        if (k === "system.current") item.system.current = v;
        if (k === "system.completed") item.system.completed = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

let table;
const world = () => table.world.campaignState();
const moveCards = () => table.cards(f => f.moveResolution);

/** A whisper / card addressed to the user, or a notification on their client, about the session not having begun. */
function told(userId) {
  const said = /session (has not|hasn't|has not yet) begun|begin a session|no session/i;
  const card = table.world.messages().some(m =>
    said.test(m.content ?? "") && (!Array.isArray(m.whisper) || !m.whisper.length || m.whisper.includes(userId)));
  const notice = table.client(userId).notifications.some(n => said.test(n.message));
  return card || notice;
}

async function kiraGathersInformation() {
  control.dice = STRONG_ACTION;
  await table.client("pl-1").chat("I comb the archive for word of Chen.", { speaker: { actor: "pc-kira", alias: "Kira" } });
  await table.settle(); await table.drain();
  const card = moveCards().at(-1);
  expect(card.flags[MODULE_ID].milestoneSuggestion?.eligible, "the 🏁 row is offered").toBe(true);
  return card;
}

async function sessionActive(active) {
  await table.client("gm-1").setSetting("campaignState", { ...world(), sessionActive: active });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "hp-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "hp-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [makeVow()] } });
  scriptClaude(table, { fallback: () => 'Dust and silence.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("PIPE-03 — a player's press on a claimed button before Begin a Session", () => {
  it("the player who pressed 🏁 is told the move is held until a session begins", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);

    control.dice = MISS_PROGRESS;
    table.client("pl-1").click(card._id, '[data-action="sf-attempt-fulfill-vow"]');
    await table.settle(); await table.drain();

    // Sanity: the card is claimed on the GM, the forced move was posted (as Kira) and held — nothing rolled.
    expect(table.world.message(card._id).flags[MODULE_ID].fulfilAttempted).toBe(true);
    const forced = table.cards(f => f.forcedMoveId === "fulfill_your_vow");
    expect(forced).toHaveLength(1);
    expect(forced[0].speaker?.actor).toBe("pc-kira");
    expect(moveCards()).toHaveLength(1);
    expect(told("gm-1"), "the GM — the forced move's author — is told").toBe(true);

    // Expected: the presser is told too. Actual: the notice is whispered to the GM alone,
    // the held-move notification shows on the GM's screen, and pl-1's button just reads taken.
    expect(told("pl-1")).toBe(true);
  }, 30_000);

  it("control: the GM pressing 🏁 is told (they are the forced move's author)", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);

    control.dice = MISS_PROGRESS;
    table.client("gm-1").click(card._id, '[data-action="sf-attempt-fulfill-vow"]');
    await table.settle(); await table.drain();

    expect(moveCards()).toHaveLength(1);
    expect(told("gm-1")).toBe(true);
  }, 30_000);

  it("control: once a session begins the held fulfilment is rolled, once, as Kira", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);
    control.dice = MISS_PROGRESS;
    table.client("pl-1").click(card._id, '[data-action="sf-attempt-fulfill-vow"]');
    await table.settle(); await table.drain();
    expect(moveCards()).toHaveLength(1);

    await sessionActive(true);

    expect(moveCards()).toHaveLength(2);
    expect(moveCards().at(-1).flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(moveCards().at(-1).content).toMatch(/Fulfill Your Vow/);
  }, 30_000);
});
