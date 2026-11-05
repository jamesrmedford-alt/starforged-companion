/**
 * STARFORGED COMPANION
 * tests/unit/sessionGateHeldPresserTold.test.js
 *
 * Issue #336 Y17 (SESSION-GATE-HELD-PRESSER-UNTOLD) — a player who presses a
 * claimed card button before a session has begun is told the move is held.
 *
 * Kira's player presses "🏁 Attempt to Fulfill Vow" on her last-session card
 * after End a Session. The press relays to the canonical GM, which claims the
 * card and posts the forced Fulfill Your Vow as Kira (`deferWhileBusy`); the
 * pipeline's session gate holds it until a session begins (issue #329 X14)
 * and whispered "No session has begun" to the message's author — the GM, who
 * posted the relayed move — and the GMs, with the held-move notification on
 * the GM's own screen. The player saw the button grey out and nothing else.
 * Now the notice also goes to the roller's players (the non-GM owners of the
 * forced move's speaking PC), and the held move's own line says it is held
 * until a session begins — on every client, until it is handed back.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/pipeline/sessionGateHeldPresserUntold.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => ({
    moveId: expectedMoveSlug ?? "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0,
    rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat",
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

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
const forcedFulfils = () => table.cards(f => f.forcedMoveId === "fulfill_your_vow");
const gateNotices = () => table.cards(f => f.sessionGateNotice);
const HELD_NOTE = /Held — no session has begun/;

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

async function pressFulfil(userId, card) {
  control.dice = MISS_PROGRESS;
  table.client(userId).click(card._id, '[data-action="sf-attempt-fulfill-vow"]');
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

describe("issue #336 Y17 — a player's press on a claimed button before Begin a Session", () => {
  it("the player who pressed 🏁 is whispered that the move is held until a session begins", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);
    await pressFulfil("pl-1", card);

    // The card is claimed on the GM, the forced move was posted (as Kira) and held — nothing rolled.
    expect(table.world.message(card._id).flags[MODULE_ID].fulfilAttempted).toBe(true);
    expect(forcedFulfils()).toHaveLength(1);
    expect(forcedFulfils()[0].speaker?.actor).toBe("pc-kira");
    expect(forcedFulfils()[0].author).toBe("gm-1");           // a relayed press: the GM posted it
    expect(moveCards()).toHaveLength(1);

    expect(told("gm-1"), "the GM — the forced move's author — is told").toBe(true);
    expect(told("pl-1"), "the presser — Kira's player — is told").toBe(true);
    const notice = gateNotices().at(-1);
    expect(notice.whisper).toEqual(expect.arrayContaining(["gm-1", "pl-1"]));
    expect(notice.content).toMatch(/will be rolled once/);
  }, 30_000);

  it("the held move's line says it is held, on the presser's client and the GM's", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);
    await pressFulfil("pl-1", card);

    const forced = forcedFulfils()[0];
    expect(forced.flags[MODULE_ID].heldUntilSession).toBe(true);
    for (const id of ["pl-1", "gm-1"]) {
      expect(table.client(id).render(forced._id).innerHTML, `${id}'s render`).toMatch(HELD_NOTE);
    }
    expect(table.client("pl-1").render(card._id).innerHTML).not.toMatch(HELD_NOTE);   // only the held line
  }, 30_000);

  it("once a session begins the held fulfilment is rolled, once, as Kira — and its line no longer says held", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);
    await pressFulfil("pl-1", card);
    expect(moveCards()).toHaveLength(1);

    await sessionActive(true);

    expect(moveCards()).toHaveLength(2);
    expect(moveCards().at(-1).flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(moveCards().at(-1).content).toMatch(/Fulfill Your Vow/);
    const forced = forcedFulfils()[0];
    expect(forced.flags[MODULE_ID].heldUntilSession).toBe(false);
    expect(table.client("pl-1").render(forced._id).innerHTML).not.toMatch(HELD_NOTE);
  }, 30_000);

  it("control: the GM pressing 🏁 is told (the forced move's author), and so is Kira's player", async () => {
    const card = await kiraGathersInformation();
    await sessionActive(false);
    await pressFulfil("gm-1", card);

    expect(moveCards()).toHaveLength(1);
    expect(told("gm-1")).toBe(true);
    expect(gateNotices().at(-1).whisper).toContain("pl-1");
  }, 30_000);

  it("control: a typed line before Begin still tells only its author and the GMs", async () => {
    await sessionActive(false);
    await table.client("pl-1").chat("I check the airlock seals.", { speaker: { actor: "pc-kira", alias: "Kira" } });
    await table.settle(); await table.drain();

    const notice = gateNotices().at(-1);
    expect([...notice.whisper].sort()).toEqual(["gm-1", "pl-1"]);
    expect(notice.content).toMatch(/was not narrated/);
  }, 30_000);
});
