/**
 * PROBE — PIPE-05 RESIST-CARD-CLOSES-BURN-UNHINTED (tenth audit, area pipeline)
 *
 * What the user does: Kira (momentum 8, health 1) rolls Face Danger and
 * scores a weak hit her card offers to 🔥 Burn Momentum on. Its cost harms
 * her: the harm step takes her health to 0 and posts the "🛡 Resist the harm
 * — roll Endure Harm" card (issue #330 D3). The executor card says "at 0
 * health you must resist: roll Endure Harm on the card below". She does.
 *
 * What happens: the resist roll is her next move; once it resolves, the Face
 * Danger's Burn Momentum is closed (closeUpgradesForLaterMove, issue #326
 * D4) — the burn that would have turned the weak hit into a strong one and
 * undone the harm is refused ("the roller has made another move since").
 * Nothing on the resist card or the executor card says to burn first.
 *
 * What should happen: issue #330 D2's rule for every follow-up that is the
 * roller's next move: "a card that offers a burn or an improvement says
 * 'Burn momentum or improve the result first — a follow-up below is your
 * next move, and closes them' beside its follow-ups and in their titles".
 * The resist card (a D3 follow-up, built after D2) is such a follow-up,
 * posted during the move's own resolution, and it says "you must" — it
 * should carry the same hint (or the executor line should), so the burn is
 * not spent by the card telling the player to roll.
 *
 * Control: the move card's own ⚑ / 🏁 carry the D2 hint; pressing the resist
 * card first does close the Face Danger's burn (D4's letter — the consequence
 * the hint exists to warn about).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/resistCardClosesBurnUnhinted.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => (
    expectedMoveSlug
      ? { moveId: expectedMoveSlug, moveName: expectedMoveSlug, statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat" }
      : { ...control.interpretation, playerNarration: text, inputMethod: "chat" }
  )),
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

const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it to a strong hit
const MISS = [0.45, 0.65, 0.2];   // the resist roll: challenge 5, 7; die 2 + iron 1 — a miss

let table, kira;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "health");
const sufferCards = () => table.cards(f => f.suffer === "endure_harm");

function makeVow() {
  const item = {
    id: "vow-1", type: "progress", name: "Find Chen", flags: { [MODULE_ID]: { vowId: "vid-1" } },
    system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.current") item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

async function kiraFacesDanger() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = WEAK;
  await table.client("pl-1").chat("Kira forces the hatch and dives through.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(card.flags[MODULE_ID].burn?.canBurn ?? card.flags[MODULE_ID].burn, "the card offers a burn").toBeTruthy();
  return card;
}

/** The weak hit's price harms Kira (the harm step, bound to the Face Danger's resolution): health 1 → 0, the resist card. */
async function theHarmStep(card) {
  const { endureHarm } = await table.client("gm-1").import("../../src/moves/sufferExecutor.js");
  const resolutionId = card.flags[MODULE_ID].resolutionId;
  const step = await table.client("gm-1").run(() => endureHarm(kira, 1, { resolutionId }));
  await table.settle(); await table.drain();
  expect(step).toMatchObject({ after: 0, resistOwed: true });
  const [resist] = resistCards();
  expect(resist, "the resist card").toBeTruthy();
  expect(resist.flags[MODULE_ID].resolutionId).toBe(resolutionId);
  return resist;
}

async function click(user, card, selector) {
  table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rc-s1", sessionNumber: 1,
      currentSceneId: "rc-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 8 }, health: { value: 1 }, iron: 1, edge: 2 }, items: { contents: [makeVow()] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("PIPE-05 — the resist card is a follow-up that closes the move's burn, and does not say so", () => {
  it("the resist card (or the executor line that points at it) says to burn or improve the move first", async () => {
    const card   = await kiraFacesDanger();
    const resist = await theHarmStep(card);
    const executor = sufferCards().at(-1);
    const texts = [table.world.message(resist._id).content, executor?.content ?? ""].join("\n");
    // Expected: the D2 hint ("burn momentum or improve the result first"). Actual: "you must resist: roll Endure Harm on the card below".
    expect(texts).toMatch(/burn momentum or improve/i);
  }, 30_000);

  it("control: the move card's own follow-ups carry the hint", async () => {
    const card = await kiraFacesDanger();
    expect(card.content).toMatch(/Burn momentum or improve the result first/);
  }, 30_000);

  it("control: pressing the resist card first rolls Endure Harm as Kira and closes the Face Danger's burn (D4)", async () => {
    const card   = await kiraFacesDanger();
    const resist = await theHarmStep(card);

    control.dice = MISS;
    await click("pl-1", resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    const endure = table.cards(f => f.moveResolution).at(-1);
    expect(endure.content).toMatch(/Endure Harm/);
    expect(endure.flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(flags(card._id).burn.laterMove).toBe(true);

    await click("pl-1", card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBeFalsy();     // refused: "the roller has made another move since"
    expect(kira.system.momentum.value).toBe(8);
  }, 30_000);
});
