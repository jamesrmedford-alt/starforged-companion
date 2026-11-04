/**
 * Issue #330 D1 — a Fulfill Your Vow's or Forge a Bond's miss offers the
 * recommit as a click.
 *
 * Finish an Expedition's miss offered the play kit's recommit as "🔁
 * Recommit" (claimed per card since issue #321 U20), but Fulfill Your Vow's
 * miss ("Recommit to the quest: roll both challenge dice, take the lowest
 * value, clear that number of progress boxes, raise the vow's rank by one")
 * and Forge a Bond's (the same on the connection's track) were text-only:
 * the GM changed the vow Item's copies or the connection's record and its
 * bond Items by hand. Decided (option A): both offer a claimed 🔁 Recommit —
 * every copy of the roller's vow, by its vowId, or the record and its bond
 * Items.
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

let table, kira, vow;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it to a strong hit

function makeVow() {
  const item = {
    id: "vow-1", type: "progress", name: "Find Chen", flags: {},
    system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.current") item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`Kira attempts ${moveId}.`, { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
let orin, vowCopy, sable, bondItem;

function makeBondItem() {
  const item = {
    id: "bond-sable", type: "progress", name: "Sable",
    flags: { [MODULE_ID]: { connectionId: "conn-sable" } },
    system: { subtype: "bond", rank: "dangerous", current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split("."); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
  };
  return item;
}

function sharedVow(id) {
  const item = makeVow();
  item.id = id;
  item.flags = { [MODULE_ID]: { vowId: "vow-shared" } };
  item.system.current = 12;
  item.update = async (changes) => {
    for (const [k, v] of Object.entries(changes)) {
      const parts = k.split("."); let t = item;
      for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
      t[parts.at(-1)] = v;
    }
    return item;
  };
  return item;
}

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rc-s1", sessionNumber: 1,
      currentSceneId: "rc-scene", sceneTruths: [], clocks: [], connectionIds: ["npc-sable"] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  vow      = sharedVow("vow-kira");
  vowCopy  = sharedVow("vow-orin");
  bondItem = makeBondItem();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 0 } }, items: { contents: [vow, bondItem] } });
  orin = table.addActor({ id: "pc-orin", name: "Orin", ownership: {}, system: {}, items: { contents: [vowCopy] } });
  sable = table.addActor({ id: "npc-sable", name: "Sable", type: "character", flags: { [MODULE_ID]: {
    entityType: "connection", connection: {
      _id: "conn-sable", name: "Sable", rank: "dangerous", relationshipTicks: 8, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

// Progress rolls: the two challenge dice. A 3-box vow against 5 and 7 — a miss.
const MISS = [0.45, 0.65];

/** A Fulfill Your Vow, as the interpreter returns it (a progress move). */
async function rollFulfil(dice) {
  control.interpretation = { moveId: "fulfill_your_vow", moveName: "Fulfill Your Vow", statUsed: null, adds: 0,
    isProgressMove: true, moveTarget: null, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("Kira sees the vow through.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
}
const sheet = (actorId) => table.actors.get(actorId);
const offers = (flag) => table.cards(f => f[flag]);

/** Press `selector` on `card` as Kira's player, with the recommit's d10s scripted. */
async function recommit(card, selector, dice) {
  const rng = vi.spyOn(Math, "random");
  for (const v of dice) rng.mockReturnValueOnce(v);
  try { await click(card, selector); } finally { rng.mockRestore(); }
}

describe("issue #330 D1 — Fulfill Your Vow's miss offers 🔁 Recommit to the Vow", () => {
  it("the miss posts the offer; a press clears the lowest die's boxes on every copy and raises the rank once", async () => {
    await rollFulfil(MISS);
    const [offer] = offers("vowRecommitOfferCard");
    expect(offer).toBeTruthy();
    expect(table.world.message(offer._id).content).toContain("🔁 Recommit to the Vow");

    await recommit(offer, '[data-action="sf-vow-recommit"]', [0.15, 0.55]);   // d10s 2 and 6 → lowest 2
    expect(vow.system.current).toBe(4);           // 3 boxes - 2
    expect(vowCopy.system.current).toBe(4);       // the shared copy too
    expect(vow.system.rank).toBe("formidable");
    expect(vowCopy.system.rank).toBe("formidable");
    expect(flags(offer._id).recommitted).toBe(true);
    expect(table.cards(f => f.recommitCard)).toHaveLength(1);

    await click(offer, '[data-action="sf-vow-recommit"]');                    // once per card
    expect(vow.system.current).toBe(4);
    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
  }, 30_000);

  it("a vow the vendor ranks by number keeps a number, stepped once", async () => {
    vow.system.rank = 2; vowCopy.system.rank = 2;
    await rollFulfil(MISS);
    await recommit(offers("vowRecommitOfferCard")[0], '[data-action="sf-vow-recommit"]', [0.05, 0.95]);   // 1 and 10
    expect(vow.system.rank).toBe(3);
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it("control: a hit posts no offer", async () => {
    await rollFulfil([0.05, 0.15]);   // 1 and 2 against 3 boxes — a strong hit
    expect(offers("vowRecommitOfferCard")).toHaveLength(0);
  }, 30_000);
});

describe("issue #330 D1 — Forge a Bond's miss offers 🔁 Recommit to the Bond", () => {
  it("a press clears the relationship track's boxes, raises the rank, and mirrors both to the bond Item", async () => {
    control.interpretation = { moveId: "forge_a_bond", moveName: "Forge a Bond", statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: "Sable", rationale: "test", mischiefApplied: false };
    control.dice = MISS;                                   // 2 boxes against 5 and 7
    await table.client("pl-1").chat("Kira tries to forge a bond with Sable.", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    const [offer] = offers("bondRecommitOfferCard");
    expect(offer).toBeTruthy();

    await recommit(offer, '[data-action="sf-bond-recommit"]', [0.05, 0.75]);   // 1 and 8 → lowest 1
    const record = sheet("npc-sable").flags[MODULE_ID].connection;
    expect(record).toMatchObject({ relationshipTicks: 4, rank: "formidable", bonded: false });
    expect(record.history.at(-1)?.entry).toMatch(/Recommitted/);
    expect(bondItem.system).toMatchObject({ current: 4, rank: "formidable" });
  }, 30_000);
});
