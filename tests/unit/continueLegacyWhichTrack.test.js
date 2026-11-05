/**
 * Issue #331 X63 — a Continue a Legacy that names no legacy track asks which.
 *
 * Continue a Legacy rolls each legacy track by name (issue #330 D6). One
 * that named none — "I continue the legacy" — found no track in its target,
 * so `enrichProgressTicks` logged a console warning and scored 0: the card
 * read "progress (0 ticks)" and "Progress: 0", a certain miss, and nothing on
 * it said no track was found. The pipeline now asks which track instead of
 * rolling: a card offers the three, each with its score, and each can be
 * rolled once from it (the move rolls every track). A pick relays to the
 * canonical GM, which claims that track on the card and posts the move for
 * it, as the roller.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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

let table, kira;
const pickCards = () => table.cards(f => f.whichLegacyCard);
const moveCards = () => table.cards(f => f.moveResolution);
const flags     = (id) => table.world.message(id).flags[MODULE_ID];
const DICE = [0.15, 0.35];   // challenge d10s 2 and 4

async function continueLegacy(target) {
  control.interpretation = { moveId: "continue_a_legacy", moveName: "Continue a Legacy", statUsed: null, adds: 0,
    isProgressMove: true, moveTarget: target, rationale: "test", mischiefApplied: false };
  control.dice = DICE;
  await table.client("pl-1").chat("Kira hangs up the blaster and passes on what she built.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
}

async function pick(card, track) {
  control.dice = DICE;
  await table.client("pl-1").click(card._id, `[data-action="sf-which-legacy"][data-track="${track}"]`);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "cl-s1", sessionNumber: 1,
      currentSceneId: "cl-scene", sceneTruths: [], clocks: [],
      legacyTracks: {
        quests:      { ticks: 12, cleared: false, cycles: 0 },
        bonds:       { ticks: 30, cleared: false, cycles: 0 },
        discoveries: { ticks: 4,  cleared: true,  cycles: 1 },
      } },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, hasPlayerOwner: true,
    system: { momentum: { value: 0 } }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("issue #331 X63 — Continue a Legacy naming no track asks which, and rolls nothing", () => {
  it("posts the three tracks with their scores in place of the roll", async () => {
    await continueLegacy(null);
    expect(moveCards()).toHaveLength(0);                     // nothing rolled
    const [card] = pickCards();
    expect(card).toBeTruthy();
    const html = table.world.message(card._id).content;
    expect(html).toMatch(/Quests legacy — 3\/10 boxes/);
    expect(html).toMatch(/Bonds legacy — 7\/10 boxes/);
    expect(html).toMatch(/Discoveries legacy — 10\/10 boxes \(cleared\)/);
    expect(flags(card._id)).toMatchObject({ actorId: "pc-kira" });
  }, 30_000);

  it("a pick rolls that track as the roller; each track once, the others still open", async () => {
    await continueLegacy(null);
    const [card] = pickCards();

    await pick(card, "quests");
    expect(moveCards()).toHaveLength(1);
    expect(table.world.message(moveCards()[0]._id).content).toMatch(/progress \(12 ticks\)/);
    expect(flags(card._id).legacyRolled).toMatchObject({ quests: true });

    await pick(card, "quests");                              // once per track
    expect(moveCards()).toHaveLength(1);

    await pick(card, "bonds");                               // the move rolls each track
    expect(moveCards()).toHaveLength(2);
    expect(table.world.message(moveCards()[1]._id).content).toMatch(/progress \(30 ticks\)/);
    expect(pickCards()).toHaveLength(1);                     // no second picker
  }, 30_000);

  it("the GM claims each track: a press relayed past the disabled button rolls nothing more, and an unoffered track is refused", async () => {
    await continueLegacy(null);
    const [card] = pickCards();
    await pick(card, "discoveries");
    expect(moveCards()).toHaveLength(1);
    expect(table.world.message(moveCards()[0]._id).content).toMatch(/progress \(40 ticks\)/);   // cleared: as if at 10

    const player = table.client("pl-1");
    const relay  = await player.import("../../src/multiplayer/gmRelay.js");
    await player.run(() => relay.requestGmAction("legacy.pick", { messageId: card._id, track: "discoveries" }));
    await player.run(() => relay.requestGmAction("legacy.pick", { messageId: card._id, track: "glory" }));
    await table.settle(); await table.drain();
    expect(moveCards()).toHaveLength(1);
  }, 30_000);

  it("control: a Continue a Legacy that names its track rolls at once", async () => {
    await continueLegacy("bonds");
    expect(pickCards()).toHaveLength(0);
    expect(moveCards()).toHaveLength(1);
    expect(table.world.message(moveCards()[0]._id).content).toMatch(/progress \(30 ticks\)/);
  }, 30_000);
});
