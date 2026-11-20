/**
 * STARFORGED COMPANION
 * tests/unit/sojournHeldSwearBurnedWaitNotClosed.test.js
 *
 * Issue #364 SOJOURN-HELD-SWEAR-CLOSEWAIT-REFUSED.
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow has been told (src/moves/sojournNeed.js). A swear
 * held for Burn Momentum / Keep is told by its keep, or by the narration of
 * its burned result (heldResult.js narrateHeldUpgrade), and the Sojourn
 * follows that narration.
 *
 * narrateHeldUpgrade first closes the held card's wait. When the world
 * refused that write it handed the narration back to its caller, which
 * narrated the burned swear plainly — with nothing after it: the pipeline's
 * finishMove had left the swear alone because it was held, so the Sojourn
 * was never resolved (✔ It is done still worked).
 *
 * The burned swear is now narrated by narrateHeldUpgrade either way, and the
 * Sojourn its vow answers follows that narration.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js):
 * the moves go through the GM's real pipeline with the interpretation and
 * the dice scripted at their boundaries; every press goes through the real
 * cards on a player's client and relays to the canonical GM; the refused
 * write is a fault at the world's boundary (table.interceptWrites). The
 * vow's Item is made by a stand-in `Item.create` that fires the createItem
 * hook, as the system does.
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
const BURN     = '[data-action="sf-burn-momentum"]';
const BY_VOW   = "an iron vow was sworn to see the community's need done";
// The write that closes a held card's wait (heldResult.js closeWait).
const WAIT_OPEN = `flags.${MODULE_ID}.awaitingUpgrade.open`;

let table, pc, savedItem;
const flagsOf     = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf   = (card) => table.world.message(card._id).content;
const named       = (move) => table.cards(f => f.moveResolution).find(m => m.content.includes(`<div class="sf-move-name">${move}</div>`)) ?? null;
const sojournCard = () => named("Sojourn");
const swearCard   = () => named("Swear an Iron Vow");
const choice      = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCards   = () => table.cards(f => f.sojournNeedCard);
const vowCards    = () => table.cards(f => f.playerVowCard);
const swearCalls  = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /MOVE: Swear an Iron Vow/i.test(c.userText ?? ""));
const refuges     = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const at          = (call) => table.claude.calls.indexOf(call);

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
  const need = needCards().at(-1);
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
  const swear = swearCard();
  expect(swear && flagsOf(swear).awaitingUpgrade, "setup: the swear is held").toMatchObject({ open: true });
  expect(swearCalls(), "setup: a held swear is not narrated").toHaveLength(0);
  return swear;
}
/** The world refuses the write that closes `card`'s wait; every other write of the card lands. */
function refuseWaitClose(card) {
  const refused = [];
  table.interceptWrites((w) => {
    if (w.kind !== "message.update" || w.id !== card._id || !(WAIT_OPEN in (w.changes ?? {}))) return undefined;
    refused.push(w);
    return new Error("The server refused the card's write (test fault)");
  });
  return refused;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjc-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjc-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2 beats neither of the Sojourn's dice: its miss is narrated at once.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
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

describe("a held swear burned while its card's wait cannot be closed (issue #364 SOJOURN-HELD-SWEAR-CLOSEWAIT-REFUSED)", () => {
  it("the burned swear is told once, and the Sojourn its vow answers is resolved after it — once", async () => {
    const need = await vowWrittenForNeed();
    const swear = await swearHeld();
    const refused = refuseWaitClose(swear);

    await click(swear, BURN);

    expect(refused.length, "setup: the wait's close was refused").toBeGreaterThan(0);
    expect(flagsOf(swear).awaitingUpgrade, "setup: the card's wait is still open").toMatchObject({ open: true });
    expect(flagsOf(swear).burn, "setup: the burn itself landed").toMatchObject({ consumed: true });
    expect(swearCalls(), "the burned swear is narrated once").toHaveLength(1);
    const [swearTold] = swearCalls();
    expect(swearTold.userText).toContain("Momentum burned");

    expect(flagsOf(need), "the Sojourn the vow answers is resolved").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(need)).not.toContain("data-action");
    expect(refuges()).toHaveLength(1);
    expect(refuges()[0].userText).toContain(BY_VOW);
    expect(at(refuges()[0]), "the refuge follows the burned oath").toBeGreaterThan(at(swearTold));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
    expect(pc.items.contents[0].flags[MODULE_ID], "the vow says its swear is told").toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });

    // The roller goes on: the burned swear is not told again, and nothing resolves the Sojourn a second time.
    control.dice = MISS;
    await table.client("pl-1").chat("I ask the next settlement for shelter.", { speaker: { actor: pc.id } });
    await settled();
    expect(swearCalls()).toHaveLength(1);
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("control: a held swear of a vow written for no need card, burned the same way, is told once and resolves nothing", async () => {
    const bridge = await table.client("gm-1").import("../../src/character/actorBridge.js");
    await table.client("gm-1").run(() => bridge.createCharacterVowItem(pc, { name: "Find Chen", rank: "dangerous" }));
    await settled();
    expect(vowCards(), "setup: the vow's own card is on the table").toHaveLength(1);
    const swear = await swearHeld();
    const refused = refuseWaitClose(swear);

    await click(swear, BURN);

    expect(refused.length, "setup: the wait's close was refused").toBeGreaterThan(0);
    expect(flagsOf(swear).burn).toMatchObject({ consumed: true });
    expect(swearCalls(), "the burned swear is narrated once").toHaveLength(1);
    expect(swearCalls()[0].userText).toContain("Momentum burned");
    expect(needCards()).toHaveLength(0);
    expect(refuges()).toHaveLength(0);
    expect(pc.items.contents[0].flags?.[MODULE_ID] ?? {}).not.toHaveProperty("sojournSwearTold");
  }, 120_000);
});
