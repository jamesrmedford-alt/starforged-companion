/**
 * STARFORGED COMPANION
 * tests/unit/vowDeepenBondedOffersRoll.test.js
 *
 * A vow sworn to a connection whose bond is already forged marks nothing on
 * that connection's relationship track: it offers the bonded Develop Your
 * Relationship roll, once per vow (issue #373 decision 4; known-issues
 * VOW-DEEPEN-BONDED-MARKS-TRACK; decisions.md → "A vow fulfilled for a bonded
 * connection marks no progress: it offers the bonded roll").
 *
 * The move's own text: "completing a quest to their benefit" is one of
 * Develop Your Relationship's triggers, and "If you already share a bond with
 * the connection, do not mark progress. Instead, roll +their rank to learn the
 * impact on your legacy." The pipeline's Develop Your Relationship already
 * takes that path; the vow's payoff did not — a fulfilment (and the won-fight
 * card's 🤝 Deepen, and a payoff card's Retry) marked the forged bond's track
 * and posted "+N milestones of relationship progress".
 *
 * Composition on a booted table (tests/helpers/multiClient.js): the payoff on
 * the canonical GM → the offer card (a connection picker with one choice,
 * naming the roller) → the roller's pick on their own client → the relay →
 * the forced move → the real pipeline's bonded roll (scripted dice).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Challenge dice 3 and 4, then an action die of 7.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  // A forced move must never reach the interpreter.
  interpretMove: vi.fn(async () => { throw new Error("interpreter called for a forced move"); }),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, "random");
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { bondItemFor } from '../helpers/fullStateFixture.js';
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { resolveMove } from "../../src/moves/resolver.js";

let table, sable, vow;

function makeVow(id, name, vowId, link = { linkedConnectionName: "Sable" }) {
  const item = {
    id, name, type: "progress",
    system: { subtype: "vow", rank: "formidable", current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId, ...link } },
    update: async (changes) => { if ("system.completed" in changes) item.system.completed = changes["system.completed"]; },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const BOND_TICKS = 24;   // six boxes: the track as a forge on a good roll left it — room for a mark to show

/** Kira (pl-1's PC) holds a Formidable vow sworn to Sable, a Dangerous connection — `bonded` or not. */
async function seed({ bonded = true, link } = {}) {
  control.dice = [0.25, 0.35, 0.65];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2, connectionIds: ["conn-sable"] },
  } } });
  vow = makeVow("v-crew", "Free Sable's crew", "vid-crew", link);
  // Sable is Kira's connection: the bond Item on her sheet, keyed to the record (overhaul 4).
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [vow,
    bondItemFor({ _id: "rec-sable", name: "Sable", rank: "dangerous", relationshipTicks: bonded ? BOND_TICKS : 0, bonded })] } });
  sable = table.addActor({
    id: "conn-sable", name: "Sable", type: "character",
    flags: { [MODULE_ID]: { entityType: "connection", connection: {
      _id: "rec-sable", name: "Sable", rank: "dangerous", role: "Pilot",
      relationshipTicks: bonded ? BOND_TICKS : 0, bonded, active: true, history: [],
    } } },
  });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  scriptClaude(table);
  resolveMove.mockClear();
  silenceConsoleErrors();
}

beforeEach(() => seed());

const record     = () => sable.flags[MODULE_ID].connection;
const ticks      = () => record().relationshipTicks;
const bondsTicks = () => table.world.campaignState().legacyTracks?.bonds?.ticks ?? 0;
const offers     = () => table.cards(f => f.connectionPicker);
const marked     = () => table.cards(f => f.deepenBondCard).filter(c => /relationship progress/.test(c.content));
const failCards  = () => table.cards(f => f.payoffFailureCard);
const ledger     = () => vow.flags[MODULE_ID].fulfilPayoff ?? {};

async function fulfil(vowName = "Free Sable's crew") {
  const gm = table.client("gm-1");
  const { payFulfilledVowNative } = await gm.import("../../src/index.js");
  await gm.run(() => payFulfilledVowNative(vowName, "strong_hit", { actorId: "pc-kira" }));
  await table.settle(); await table.drain();
}

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

/** Refuse the next chat card `match` selects — once. */
function refuseNextCard(match) {
  let spent = false;
  return table.interceptWrites((w) => {
    if (spent || w.kind !== "message.create" || !match(w.data?.flags?.[MODULE_ID] ?? {})) return undefined;
    spent = true;
    return new Error("refused by the test");
  });
}

describe("a vow fulfilled for a connection already bonded (issue #373 decision 4)", () => {
  it("marks nothing on the relationship track, and offers the roller one bonded Develop Your Relationship roll", async () => {
    await fulfil();

    expect(ticks(), "the forged bond's track is not marked").toBe(BOND_TICKS);
    expect(marked(), "no card says a milestone of relationship progress was marked").toHaveLength(0);

    const cards = offers();
    expect(cards, "one offer card").toHaveLength(1);
    expect(cards[0].flags[MODULE_ID]).toMatchObject({
      connectionPicker: true, pickAction: "develop", resolved: false, actorId: "pc-kira",
      choices: [{ hostId: "conn-sable", name: "Sable" }],
    });
    expect(cards[0].content).toContain("Sable");
    expect(cards[0].content).toMatch(/already share a bond/i);
    expect(cards[0].content).toMatch(/no progress is marked/i);

    expect(ledger(), "once per vow: the offer is the vow's deepen step").toMatchObject({ deepen: true });
    expect(failCards(), "nothing went to the GMs").toHaveLength(0);
  }, 30_000);

  it("the link by the connection's card id takes the same path, under the card's name now", async () => {
    await seed({ link: { linkedConnectionName: "Sable Vance", linkedConnectionId: "conn-sable" } });
    await fulfil();

    expect(ticks()).toBe(BOND_TICKS);
    expect(offers()).toHaveLength(1);
    expect(offers()[0].flags[MODULE_ID].choices).toEqual([{ hostId: "conn-sable", name: "Sable" }]);
  }, 30_000);

  it("the roller's pick rolls +their rank: a strong hit marks 2 ticks on the bonds legacy and no progress", async () => {
    await fulfil();
    const [offer] = offers();

    table.client("pl-1").click(offer._id, '[data-action="sf-connection-pick"][data-host-id="conn-sable"]');
    await table.settle(); await table.drain();

    expect(resolveMove).toHaveBeenCalledTimes(1);
    const [interpretation] = resolveMove.mock.calls[0];
    expect(interpretation).toMatchObject({
      moveId: "develop_your_relationship", moveTargetId: "conn-sable", statUsed: "dangerous", statValue: 2,
    });
    expect(resolveMove.mock.results[0].value.outcome).toBe("strong_hit");   // 7 + 2 beats 3 and 4
    expect(bondsTicks()).toBe(2);
    expect(ticks()).toBe(BOND_TICKS);
    expect(table.world.message(offer._id).flags[MODULE_ID].resolved, "the offer is spent").toBe(true);
  }, 30_000);

  it("once per vow: the won-fight card's 🤝 after the fulfilment offers no second roll", async () => {
    const card = await postVictoryCard();
    await fulfil();
    expect(offers()).toHaveLength(1);

    await pressDeepen(card);
    expect(offers(), "no second offer").toHaveLength(1);
    expect(ticks()).toBe(BOND_TICKS);
    expect(marked()).toHaveLength(0);
    expect(table.world.message(card._id).flags[MODULE_ID].resolvedActions?.deepenBond).toBe(true);
  }, 30_000);

  it("once per vow: the won-fight card's 🤝 first offers the roll, and the fulfilment offers none", async () => {
    const card = await postVictoryCard();
    await pressDeepen(card);

    expect(ticks(), "the press marks nothing on a forged bond").toBe(BOND_TICKS);
    expect(offers()).toHaveLength(1);
    expect(offers()[0].flags[MODULE_ID]).toMatchObject({ actorId: "pc-kira", choices: [{ hostId: "conn-sable", name: "Sable" }] });
    expect(ledger()).toMatchObject({ deepen: true });

    await fulfil();
    expect(offers(), "no second offer").toHaveLength(1);
    expect(ticks()).toBe(BOND_TICKS);
    expect(vow.flags[MODULE_ID].fulfilPaid).toBe(true);   // the rest of the payoff still ran
  }, 30_000);

  it("an offer card the world refuses is not recorded as given: it goes to the GMs, and their Retry offers it once", async () => {
    refuseNextCard(f => f.connectionPicker === true);
    await fulfil();

    expect(offers(), "the offer did not post").toHaveLength(0);
    expect(ticks()).toBe(BOND_TICKS);
    expect(ledger().deepen, "not on the vow's ledger").toBeUndefined();
    const [report] = failCards();
    expect(report, "the GMs are told").toBeTruthy();
    expect(report.flags[MODULE_ID].steps).toEqual([{ step: "deepen", connectionName: "Sable", marks: 2 }]);
    expect(report.content).toMatch(/Develop Your Relationship/);
    expect(report.content, "the report promises no progress").not.toMatch(/of relationship progress/);

    table.client("gm-1").click(report._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();

    expect(offers(), "the Retry posts the offer").toHaveLength(1);
    expect(offers()[0].flags[MODULE_ID]).toMatchObject({ actorId: "pc-kira", choices: [{ hostId: "conn-sable", name: "Sable" }] });
    expect(ledger()).toMatchObject({ deepen: true });
    expect(ticks()).toBe(BOND_TICKS);
    expect(failCards(), "no second report").toHaveLength(1);
  }, 30_000);
});

describe("control: a connection not yet bonded is deepened as before", () => {
  const ONE_DEEPEN = 16;   // a Formidable vow → 2 marks × 8 ticks (Sable is Dangerous)

  it("the fulfilment marks the vow's rank in milestones on the relationship track, and offers no roll", async () => {
    await seed({ bonded: false });
    await fulfil();

    expect(ticks()).toBe(ONE_DEEPEN);
    expect(marked()).toHaveLength(1);
    expect(offers()).toHaveLength(0);
    expect(ledger()).toMatchObject({ deepen: true });
  }, 30_000);

  it("the won-fight card's 🤝 marks it too, once", async () => {
    await seed({ bonded: false });
    await pressDeepen(await postVictoryCard());
    await fulfil();

    expect(ticks()).toBe(ONE_DEEPEN);
    expect(offers()).toHaveLength(0);
  }, 30_000);
});
