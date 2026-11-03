/**
 * STARFORGED COMPANION
 * tests/unit/vowDeepenOnce.test.js
 *
 * A vow sworn for a connection deepens it once (issue #326 D1).
 *
 * The won-fight card's "🤝 Deepen your bond" (scaled by the vow's rank) and
 * the vow's fulfilment payoff (payFulfilledVowCopies, the same marks) each
 * deepened the connection: one vow, two deepens — Sable's track jumped twice.
 * Decided: one reward. Whichever deepen lands first pays, and is recorded on
 * the vow's payoff ledger (`fulfilPayoff.deepen`); the other finds it there
 * and deepens nothing (decisions.md → "A vow deepens its connection once").
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, sable, vow, kira;

function makeVow(id, name, vowId, connectionName = "Sable") {
  const item = {
    id, name, type: "progress",
    system: { subtype: "vow", rank: "formidable", current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId, linkedConnectionName: connectionName } },
    update: async (changes) => { if ("system.completed" in changes) item.system.completed = changes["system.completed"]; },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2, connectionIds: ["conn-sable"] },
  } } });
  vow = makeVow("v-crew", "Free Sable's crew", "vid-crew");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [vow] } });
  sable = table.addActor({
    id: "conn-sable", name: "Sable", type: "character",
    flags: { [MODULE_ID]: { entityType: "connection", connection: {
      _id: "rec-sable", name: "Sable", rank: "dangerous", role: "Pilot",
      relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  scriptClaude(table);
  silenceConsoleErrors();
});

const ticks = () => sable.flags[MODULE_ID].connection.relationshipTicks;
const ONE_DEEPEN = 16;   // a Formidable vow → 2 marks × 8 ticks (Sable is Dangerous)

async function postVictoryCard(vowName = "Free Sable's crew") {
  const gm = table.client("gm-1");
  const { postFightVowMilestoneCard } = await gm.import("../../src/index.js");
  await gm.run(() => postFightVowMilestoneCard(vowName, 2, "pc-kira"));
  await table.settle();
  return table.cards(f => f.fightVowCard && f.vowName === vowName).at(-1);
}

async function pressDeepen(card) {
  table.client("pl-1").click(card._id, '[data-action="sf-deepen-bond"]');
  await table.settle(); await table.drain();
}

async function fulfil(vowName = "Free Sable's crew") {
  const gm = table.client("gm-1");
  const { payFulfilledVowNative } = await gm.import("../../src/index.js");
  await gm.run(() => payFulfilledVowNative(vowName, "strong_hit", { actorId: "pc-kira" }));
  await table.settle(); await table.drain();
}

describe("a vow deepens its connection once (issue #326 D1)", () => {
  it("the victory card's deepen, then the fulfilment: Sable deepens once", async () => {
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID]).toMatchObject({ connectionName: "Sable", vowId: "vid-crew" });
    await pressDeepen(card);
    expect(ticks()).toBe(ONE_DEEPEN);
    expect(vow.flags[MODULE_ID].fulfilPayoff).toMatchObject({ deepen: true });   // the press is recorded on the vow

    await fulfil();
    expect(ticks()).toBe(ONE_DEEPEN);
    expect(vow.flags[MODULE_ID].fulfilPaid).toBe(true);                           // the rest of the payoff still ran
  }, 30_000);

  it("the fulfilment first, then the card's press: deepened once, and the card says so", async () => {
    const card = await postVictoryCard();
    await fulfil();
    expect(ticks()).toBe(ONE_DEEPEN);

    await pressDeepen(card);
    expect(ticks()).toBe(ONE_DEEPEN);
    const notes = table.cards(f => f.deepenBondCard).map(c => c.content);
    expect(notes.at(-1)).toMatch(/already deepened for &ldquo;Free Sable&#39;s crew&rdquo;|already deepened for &ldquo;Free Sable's crew&rdquo;/);
    expect(table.world.message(card._id).flags[MODULE_ID].resolvedActions?.deepenBond).toBe(true);   // its button retires
  }, 30_000);

  it("control: a fulfilment with no press deepens once", async () => {
    await fulfil();
    expect(ticks()).toBe(ONE_DEEPEN);
  }, 30_000);

  it("control: a second press of the same card deepens nothing more", async () => {
    const card = await postVictoryCard();
    await pressDeepen(card);
    await pressDeepen(card);
    expect(ticks()).toBe(ONE_DEEPEN);
  }, 30_000);

  it("control: another vow sworn for the same connection deepens it on its own", async () => {
    const other = makeVow("v-ship", "Recover Sable's ship", "vid-ship");
    kira.items.contents.push(other);
    await pressDeepen(await postVictoryCard());
    await pressDeepen(await postVictoryCard("Recover Sable's ship"));
    expect(ticks()).toBe(2 * ONE_DEEPEN);
  }, 30_000);
});
