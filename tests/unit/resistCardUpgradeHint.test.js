/**
 * Issue #336 Y18 RESIST-CARD-CLOSES-BURN-UNHINTED — the resist card says to
 * burn or improve first while the move whose price it is still offers one.
 *
 * Kira (momentum 8, health 1) rolls Face Danger: a weak hit her card offers
 * to 🔥 Burn. Its price harms her to 0 and posts the "🛡 Resist the harm —
 * roll Endure Harm" card (issue #330 D3), the executor card saying "at 0
 * health you must resist". Following it, the resist roll is her next move,
 * and it closes the Face Danger's burn (issue #326 D4) — the burn that would
 * have undone the harm is refused. Issue #330 D2's rule for every follow-up
 * that is the roller's next move — "Burn momentum or improve the result
 * first …" — never reached the resist card, a follow-up built after it. The
 * card and the executor's line now carry it while the move still offers a
 * burn or an improvement: on a miss's Pay the Price, paid before the move
 * card posts, the pipeline says whether it will.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/pipeline/resistCardClosesBurnUnhinted.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => (
    expectedMoveSlug
      ? { moveId: expectedMoveSlug, moveName: expectedMoveSlug, statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat" }
      : { ...control.interpretation, playerNarration: text, inputMethod: "chat" }
  )),
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
// The Pay the Price d100, scripted (78: "You are harmed" → Endure Harm -1).
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

const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it to a strong hit
const MISS = [0.45, 0.65, 0.2];   // challenge 5, 7; die 2 — edge 2 → 4 (iron 1 → 3): a miss
const HINT = /Burn momentum or improve the result first — resisting is your next move, and closes them/i;

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

async function kiraFacesDanger(dice = WEAK) {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("Kira forces the hatch and dives through.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** The weak hit's price harms Kira (the harm step, bound to the Face Danger's resolution): health 1 → 0, the resist card. */
async function theHarmStep(card, opts = {}) {
  const { endureHarm } = await table.client("gm-1").import("../../src/moves/sufferExecutor.js");
  const resolutionId = card ? card.flags[MODULE_ID].resolutionId : null;
  const step = await table.client("gm-1").run(() => endureHarm(kira, 1, { ...(resolutionId ? { resolutionId } : {}), ...opts }));
  await table.settle(); await table.drain();
  expect(step).toMatchObject({ after: 0, resistOwed: true });
  const resist = resistCards().at(-1);
  expect(resist, "the resist card").toBeTruthy();
  return resist;
}

async function click(user, card, selector) {
  table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset({ momentum = 8 } = {}) {
  control.ptp = [78];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rc-s1", sessionNumber: 1,
      currentSceneId: "rc-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: momentum }, health: { value: 1 }, iron: 1, edge: 2 }, items: { contents: [makeVow()] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

beforeEach(async () => { await reset(); });

describe("issue #336 Y18 — the resist card says to burn or improve first", () => {
  it("a weak hit's harm: the resist card and the executor line carry the hint while the move offers a burn", async () => {
    const card   = await kiraFacesDanger();
    expect(flags(card._id).burn?.canBurn, "the card offers a burn").toBe(true);
    const resist = await theHarmStep(card);
    expect(resist.flags[MODULE_ID].resolutionId).toBe(card.flags[MODULE_ID].resolutionId);

    expect(table.world.message(resist._id).content).toMatch(HINT);
    expect(sufferCards().at(-1).content).toMatch(/you must resist: roll Endure Harm on the card below \(burn momentum or improve the result first/i);
  }, 30_000);

  it("a miss's Pay the Price, paid before the move card posts: the pipeline's offer puts the hint on the resist card", async () => {
    await reset({ momentum: 9 });                    // momentum 9 beats both challenge dice (5, 7)
    const card = await kiraFacesDanger(MISS);
    expect(flags(card._id).burn?.canBurn, "the miss offers a burn").toBe(true);
    expect(kira.system.health.value).toBe(0);
    const resist = resistCards().at(-1);
    expect(resist.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);

    expect(table.world.message(resist._id).content).toMatch(HINT);
    expect(sufferCards().at(-1).content).toMatch(/burn momentum or improve the result first/i);
  }, 30_000);

  it("control: a miss whose card offers no burn (momentum 0) posts the resist card without the hint", async () => {
    await reset({ momentum: 0 });
    const card = await kiraFacesDanger(MISS);
    expect(flags(card._id).burn, "no burn offered").toBeFalsy();
    const resist = resistCards().at(-1);
    expect(resist).toBeTruthy();
    expect(table.world.message(resist._id).content).not.toMatch(/burn momentum/i);
    expect(sufferCards().at(-1).content).not.toMatch(/burn momentum/i);
  }, 30_000);

  it("control: a harm bound to no move (a typed Pay the Price) carries no hint", async () => {
    const resist = await theHarmStep(null);
    expect(resist.flags[MODULE_ID].resolutionId ?? null).toBeNull();
    expect(table.world.message(resist._id).content).not.toMatch(/burn momentum/i);
  }, 30_000);

  it("control: once the move's burn is spent, a later harm step's resist card carries no hint", async () => {
    const card = await kiraFacesDanger();
    await table.client("gm-1").run(() => globalThis.game.messages.get(card._id).update({ [`flags.${MODULE_ID}.burn.laterMove`]: true }));
    await table.settle();
    const resist = await theHarmStep(card, { upgradeOffered: true });   // a stale offer: the card says it is closed
    expect(table.world.message(resist._id).content).not.toMatch(/burn momentum/i);
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
