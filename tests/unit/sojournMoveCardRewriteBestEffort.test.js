/**
 * STARFORGED COMPANION
 * tests/unit/sojournMoveCardRewriteBestEffort.test.js
 *
 * Issue #364 SOJOURN-MOVE-CARD-REWRITE-REFUSED — pinned as consistent, not
 * changed.
 *
 * A Sojourn miss whose need is answered is resolved as a strong hit
 * (src/moves/sojournNeed.js resolveSojournNeed): the need card is claimed
 * (`resolved`), the Sojourn's move card is rewritten — "Miss" struck,
 * "✦ Resolved as a strong hit" below — and the refuge is narrated. The move
 * card's rewrite is best effort: refused by the world, a console warning
 * says so, the need card and the narration still say the Sojourn resolved,
 * and nothing offers a Retry.
 *
 * That is how the repo treats every refused rewrite of a move card's text.
 * Burn Momentum and Improve Result rewrite theirs the same way
 * (burnMomentum.js / improveResult.js: `message.update({ content }).catch(
 * console.warn)`); the GMs' "Retry these steps" card (resultUpgrade.js
 * applyUpgradeStep → reportUpgradeFailures) is for an upgrade's effects —
 * meters, clocks, marks, a choice card — never for the card's own text. The
 * first two tests pin the Sojourn's behaviour; the third pins the convention
 * it follows, on a burn of the same move card.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js).
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
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// challenge 1 and 2; action die 6 (+heart 2) — a strong hit, no match.
const STRONG = [0, 0.1, 0.9];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const DONE     = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const BURN     = '[data-action="sf-burn-momentum"]';

let table, pc, savedItem, warn;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const moveCard   = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>'));
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const retryCards = () => table.cards(f => f.payoffFailureCard);
const sojournCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /MOVE: Sojourn/i.test(c.userText ?? ""));
const refuges    = () => sojournCalls().filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const warned     = (text) => warn.mock.calls.some(args => args.some(a => String(a?.message ?? a).includes(text)));
/** Refuse every rewrite of a card's text (its flag writes still land). */
const refuseTextOf = (card) => failWrites(table,
  w => w.kind === "message.update" && w.id === card._id && typeof w.changes?.content === "string", { times: 99 });

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
async function needTakenOn() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  return needCard();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjr-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjr-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, spirit: { value: 5 } } });
  scriptClaude(table, { fallback: () => REPLY });
  savedItem = globalThis.Item;
  let made = 0;
  globalThis.Item = { async create(data, { parent } = {}) {
    made += 1;
    const item = {
      id: `vow-${made}`, type: data.type, name: data.name, parent, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
      system: { ...data.system, completed: false },
      async update(changes) { if (typeof changes?.name === "string") item.name = changes.name; return item; },
      async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    };
    parent.items.contents.push(item);
    for (const c of table.connectedClients) c.run(() => Hooks.callAll("createItem", item, {}, "gm-1"));
    return item;
  } };
  globalThis.silenceConsoleErrors?.();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  warn.mockRestore();
  globalThis.Item = savedItem;
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("the Sojourn's move card rewrite is best effort, as every move card's is (issue #364 SOJOURN-MOVE-CARD-REWRITE-REFUSED)", () => {
  it("✔ It is done with the move card's rewrite refused: the Sojourn is resolved and narrated, the card keeps its text, a warning is logged, no Retry", async () => {
    const need = await needTakenOn();
    const before = contentOf(moveCard());
    const refused = refuseTextOf(moveCard());

    await click(need, DONE);

    expect(refused.refused).toBe(1);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("Resolved as a strong hit</strong> — the community's need was met.");
    expect(refuges(), "the refuge is narrated all the same").toHaveLength(1);
    expect(contentOf(moveCard()), "the move card still reads as the miss").toBe(before);
    expect(warned(`move card ${moveCard()._id} could not be rewritten`)).toBe(true);
    expect(retryCards(), "no Retry is offered for a card's text").toEqual([]);

    // Resolved once: a later press finds nothing to do, and nothing rewrites the card afterwards.
    refused.off();
    const { applySojournNeedFromRelay } = await table.client("gm-1").import("../../src/moves/sojournNeed.js");
    expect(await table.client("gm-1").run(() => applySojournNeedFromRelay({ messageId: need._id, way: "done" }, { requesterIsGM: true })))
      .toEqual({ applied: false, reason: "already-resolved" });
    await settled();
    expect(contentOf(moveCard())).toBe(before);
    expect(refuges()).toHaveLength(1);
  }, 60_000);

  it("the vow sworn with the move card's rewrite refused: resolved by the vow and narrated, the card as it was, no Retry", async () => {
    const need = await needTakenOn();
    table.client("pl-1").render(need._id).querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
    table.client("pl-1").click(need._id, SWEAR);
    await settled(); await settled();
    const before = contentOf(moveCard());
    const refused = refuseTextOf(moveCard());

    control.dice = STRONG;
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      table.client("pl-1").click(table.cards(f => f.playerVowCard)[0]._id, SWEAR_IT);
      for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
      await table.settle();
    } finally {
      vi.useRealTimers();
      await table.drain();
    }

    expect(refused.refused).toBe(1);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    expect(refuges()).toHaveLength(1);
    expect(contentOf(moveCard())).toBe(before);
    expect(warned("could not be rewritten")).toBe(true);
    expect(retryCards()).toEqual([]);
  }, 90_000);

  it("the convention it follows — Burn Momentum with its move card's rewrite refused: the burn stands and is narrated, a warning is logged, no Retry", async () => {
    // Momentum 9 beats both dice: Burn Momentum is offered on the Sojourn's miss.
    pc.system.momentum.value = 9;
    control.dice = MISS;
    await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
    await settled();
    const card = moveCard();
    const refused = refuseTextOf(card);

    await click(card, BURN);

    expect(refused.refused).toBeGreaterThanOrEqual(1);
    expect(flagsOf(card).burn).toMatchObject({ consumed: true });
    expect(contentOf(card), "the card's text was never rewritten").not.toContain("sf-move-burn-result");
    expect(sojournCalls().some(c => /Momentum burned/.test(c.userText ?? "")), "the burned result is narrated").toBe(true);
    expect(warned("burnMomentum: card content update failed")).toBe(true);
    expect(retryCards(), "the GMs' Retry card is for an upgrade's effects, not its card's text").toEqual([]);
  }, 60_000);
});
