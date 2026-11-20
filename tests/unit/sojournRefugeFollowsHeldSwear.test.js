/**
 * STARFORGED COMPANION
 * tests/unit/sojournRefugeFollowsHeldSwear.test.js
 *
 * Issue #364 SOJOURN-HELD-SWEAR-ORDER.
 *
 * A Sojourn miss whose "Community needs help" was answered with a vow is
 * resolved as a strong hit once that vow is sworn, and the refuge is narrated
 * after the oath (src/moves/sojournNeed.js). The pipeline resolved it from
 * finishMove — which also runs for a swear whose result is still held for
 * Burn Momentum / Keep (heldResult.js): nothing had told that swear yet, so
 * the refuge was narrated before the oath it answers.
 *
 * A held swear now leaves the Sojourn alone until it is told: its Keep, or
 * the narration of its burned result, resolves the Sojourn — once.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js):
 * the Sojourn goes through the GM's real pipeline with the interpretation and
 * the dice scripted at their boundaries; every press goes through the real
 * cards on a player's client and relays to the canonical GM. The vow's Item
 * is made by a stand-in `Item.create` that fires the createItem hook, as the
 * system does.
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

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// challenge 3 and 8; action die 3 — no strong hit; momentum 9 beats both dice, so Burn Momentum is offered and the result is held.
const HELD = [0.25, 0.75, 0.4];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const KEEP     = '[data-action="sf-keep-result"]';
const BURN     = '[data-action="sf-burn-momentum"]';

let table, pc, savedItem;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const named       = (move) => table.cards(f => f.moveResolution).find(m => m.content.includes(`<div class="sf-move-name">${move}</div>`)) ?? null;
const sojournCard = () => named("Sojourn");
const swearCard   = () => named("Swear an Iron Vow");
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards   = () => table.cards(f => f.playerVowCard);
const moveCalls  = (move) => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && new RegExp(`MOVE: ${move}`, "i").test(c.userText ?? ""));
const refuges    = () => moveCalls("Sojourn").filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
/** The Sojourn missed, "Community needs help" picked, and ⚔ Swear an Iron Vow pressed: the vow is on the sheet. */
async function vowWrittenForNeed() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  const need = needCard();
  table.client("pl-1").render(need._id).querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
  table.client("pl-1").click(need._id, SWEAR);
  await settled(); await settled();
  return need;
}
/** ⚔ Swear it (roll) on the vow's own card, rolled so that Burn Momentum is offered: the result is held. */
async function swearHeld() {
  pc.system.momentum.value = 9;
  control.dice = HELD;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(vowCards()[0]._id, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjh-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjh-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2 beats neither of the Sojourn's dice: its miss is narrated at once.
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
});
afterEach(async () => {
  globalThis.Item = savedItem;
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("a vow sworn for a Sojourn's need, its swear held for Burn / Keep (issue #364 SOJOURN-HELD-SWEAR-ORDER)", () => {
  it("while the swear waits for its roller's choice, nothing is told of it and the Sojourn is not resolved", async () => {
    const need = await vowWrittenForNeed();

    await swearHeld();

    const swear = swearCard();
    expect(swear, "the swear's result card is on the table").toBeTruthy();
    expect(flagsOf(swear).awaitingUpgrade).toMatchObject({ open: true, swornVowId: pc.items.contents[0].id });
    expect(contentOf(swear)).toContain('data-action="sf-keep-result"');
    expect(moveCalls("Swear an Iron Vow"), "a held swear is not narrated").toHaveLength(0);
    expect(refuges(), "the refuge is not narrated before the oath it answers").toHaveLength(0);
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(contentOf(sojournCard())).not.toContain("sf-sojourn-resolved");
  }, 90_000);

  it("Keep the result tells the swear, then resolves the Sojourn and narrates the refuge — once", async () => {
    const need = await vowWrittenForNeed();
    await swearHeld();

    await click(swearCard(), KEEP);

    const calls = table.claude.calls;
    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold, "the kept swear is narrated").toBeTruthy();
    expect(moveCalls("Swear an Iron Vow")).toHaveLength(1);
    expect(refuges()).toHaveLength(1);
    expect(calls.indexOf(refuges()[0]), "the refuge follows the oath").toBeGreaterThan(calls.indexOf(swearTold));
    expect(refuges()[0].userText).toContain("an iron vow was sworn to see the community's need done");
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
    expect(flagsOf(swearCard()).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });

    // The kept swear's Burn is closed; a later move of the roller's resolves nothing twice.
    control.dice = MISS;
    await table.client("pl-1").chat("I ask the next settlement for shelter.", { speaker: { actor: pc.id } });
    await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("Burn Momentum tells the burned swear as its one narration, then resolves the Sojourn — once", async () => {
    const need = await vowWrittenForNeed();
    await swearHeld();

    await click(swearCard(), BURN);

    const calls = table.claude.calls;
    expect(moveCalls("Swear an Iron Vow")).toHaveLength(1);
    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold.userText).toContain("Momentum burned");
    expect(refuges()).toHaveLength(1);
    expect(calls.indexOf(refuges()[0]), "the refuge follows the burned oath").toBeGreaterThan(calls.indexOf(swearTold));
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
    expect(flagsOf(swearCard()).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "burn" });
  }, 120_000);

  it("the roller's next line keeps the held swear: the oath, then the refuge, then the line", async () => {
    const need = await vowWrittenForNeed();
    await swearHeld();

    control.dice = MISS;
    await table.client("pl-1").chat("I ask the next settlement for shelter.", { speaker: { actor: pc.id } });
    await settled();

    const calls = table.claude.calls;
    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold).toBeTruthy();
    expect(refuges()).toHaveLength(1);
    expect(calls.indexOf(refuges()[0])).toBeGreaterThan(calls.indexOf(swearTold));
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(flagsOf(swearCard()).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
  }, 120_000);
});
