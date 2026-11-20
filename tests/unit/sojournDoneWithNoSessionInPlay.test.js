/**
 * STARFORGED COMPANION
 * tests/unit/sojournDoneWithNoSessionInPlay.test.js
 *
 * Issue #364 — "✔ It is done" with no session in play: pinned as consistent
 * with an upgrade's re-narration, not changed.
 *
 * The chat gate (index.js onMessage — lifecycle.js sessionInPlay) keeps a
 * typed line or a card's move from being narrated once the session is over.
 * A press on a card that is already on the table is not a line: Burn
 * Momentum and Improve Result have no such gate, and re-narrate the upgraded
 * result into the session that was ended. The community's need card's
 * ✔ It is done (src/moves/sojournNeed.js) does the same: it resolves the
 * Sojourn as a strong hit and narrates the refuge.
 *
 * Both are shown here on one booted GM / two-player table
 * (tests/helpers/multiClient.js), the session ended the way End a Session
 * marks it (`sessionEndedId`), and the gate shown closed for a typed line.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "sojourn", moveName: "Sojourn", statUsed: "heart", adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
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
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { sessionInPlay } from "../../src/session/lifecycle.js";

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NEED = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const DONE = '[data-action="sf-sojourn-need-done"]';
const BURN = '[data-action="sf-burn-momentum"]';

let table, pc;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const moveCards  = () => table.cards(f => f.moveResolution).filter(m => m.content.includes('<div class="sf-move-name">Sojourn</div>'));
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const sojournCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /MOVE: Sojourn/i.test(c.userText ?? ""));
const narrationCards = () => table.cards(f => f.narratorCard);

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
async function sojourn() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
}
/** The session is ended, as End a Session marks it; the chat gate is shown closed for a typed line. */
async function sessionOver() {
  const state = table.world.getSetting("campaignState");
  await table.client("gm-1").setSetting("campaignState", { ...state, sessionEndedId: state.currentSessionId });
  await settled();
  expect(sessionInPlay(table.world.getSetting("campaignState")), "setup: no session is in play").toBe(false);
  const told = sojournCalls().length;
  const cards = moveCards().length;
  await sojourn();
  expect(moveCards(), "setup: the gate rolls no typed line").toHaveLength(cards);
  expect(sojournCalls(), "setup: the gate narrates no typed line").toHaveLength(told);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    // The result is narrated at its roll, so a later burn is a re-narration.
    holdResultForUpgrade: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "sjo-s1", currentSessionId: "sjo-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjo-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, spirit: { value: 5 } } });
  scriptClaude(table, { fallback: () => REPLY });
  globalThis.silenceConsoleErrors?.();
});
afterEach(async () => {
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("with no session in play, a press on a card already on the table still narrates (issue #364 — pinned, consistent)", () => {
  it("✔ It is done resolves the Sojourn and narrates the refuge", async () => {
    await sojourn();
    await click(choice(), NEED);
    const need = needCard();
    await sessionOver();
    const cards = narrationCards().length;

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    const refuges = sojournCalls().filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));
    expect(refuges, "the refuge is narrated though the session is over").toHaveLength(1);
    expect(narrationCards()).toHaveLength(cards + 1);
    expect(table.world.message(moveCards()[0]._id).content).toContain("✦ Resolved as a strong hit");
  }, 60_000);

  it("Burn Momentum re-narrates the burned result just the same", async () => {
    // Momentum 9 beats both dice: the miss's card offers Burn Momentum.
    pc.system.momentum.value = 9;
    await sojourn();
    const [card] = moveCards();
    expect(sojournCalls(), "setup: the miss was narrated at its roll").toHaveLength(1);
    await sessionOver();
    const cards = narrationCards().length;

    await click(card, BURN);

    expect(flagsOf(card).burn).toMatchObject({ consumed: true });
    const burned = sojournCalls().filter(c => /Momentum burned/.test(c.userText ?? ""));
    expect(burned, "the burned result is narrated though the session is over").toHaveLength(1);
    expect(narrationCards()).toHaveLength(cards + 1);
  }, 60_000);
});
