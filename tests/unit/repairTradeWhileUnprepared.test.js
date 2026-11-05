/**
 * STARFORGED COMPANION
 * tests/unit/repairTradeWhileUnprepared.test.js
 *
 * REPAIR-TRADE-WHILE-UNPREPARED (found while building issue #338 D3).
 * Repair's "you may Sacrifice Resources and exchange each -1 of supply for 1
 * extra repair point" is a loss of resources, and "when you suffer a loss of
 * resources while unprepared, envision how this causes you hardship and apply
 * the cost to a different suffer move" (vendored Sacrifice Resources). D3 keyed
 * that redirect on the impact (sufferExecutor.isUnprepared) for the executor,
 * the choice card and an asset's supply cost, but `!repair`'s trade still paid
 * from the supply while the PC was unprepared above 0: Kira, unprepared at 3
 * supply, traded 2 and was left at 1 with the repair made. Now the dialog
 * greys the trade and says why, an Apply that trades anyway is refused on the
 * typist's client, and the GM's handler refuses a relayed trade from an
 * unprepared payer and repairs nothing — the traded points exist only once
 * their supply is paid (issue #300 F04).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { applyRepairSpends } from "../../src/moves/repair.js";
import { getShip } from "../../src/entities/ship.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

// ─────────────────────────────────────────────────────────────────────────────
// The GM's handler (gmRelay "repair.apply")
// ─────────────────────────────────────────────────────────────────────────────

const PLAYER_CTX = { requesterId: "pl-1", requester: { id: "pl-1", isGM: false }, requesterIsGM: false, local: false };

function installShip(integrity = 1) {
  game.actors._set("ship-1", makeTestActor({
    id: "ship-1", type: "starship", name: "Wayfarer",
    system: { debility: { battered: false } },
    flags: { [MODULE_ID]: { entityType: "ship",
      ship: { _id: "ship-guid", name: "Wayfarer", integrity, integrityMax: 5, battered: false, isCommandVehicle: true } } },
  }));
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ["ship-1"], characterIds: [] });
}

function installPc({ supply, unprepared }) {
  const pc = makeTestActor({ id: "pc-kira", type: "character", name: "Kira",
    system: { supply: { value: supply }, debility: { unprepared } } });
  pc.ownership = { "pl-1": 3 };
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return pc;
}

// In the field, weak hit: 1 point, plus the trade's.
const trade = (extra) => ({
  situation: "field", outcome: "weak", earned: 1 + extra, extra, actorId: "pc-kira",
  spends: { integrity: 1 + extra, clear_battered: 0, companion_health: 0, fix_module: 0, other_device: 0, other_device_cx: 0 },
});
const lastCard = () => ChatMessage._created.at(-1)?.content ?? "";

describe("the GM's handler refuses a trade from an unprepared PC", () => {
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
    ChatMessage._reset();
  });

  it("unprepared at 3 supply, trading 2: nothing is spent, nothing is repaired, and the card says why", async () => {
    installShip(1);
    const kira = installPc({ supply: 3, unprepared: true });

    await applyRepairSpends(trade(2), PLAYER_CTX);

    expect(kira.system.supply.value).toBe(3);
    expect(getShip("ship-1").integrity).toBe(1);
    expect(lastCard()).toMatch(/<strong>Kira<\/strong> is <strong>unprepared<\/strong> — a loss of resources goes to another suffer move/);
    expect(lastCard()).toMatch(/No repairs were applied — Repair again without the trade/);
  });

  it("unprepared at 0 supply: the reason given is the impact, not the empty supply", async () => {
    installShip(1);
    installPc({ supply: 0, unprepared: true });

    await applyRepairSpends(trade(1), PLAYER_CTX);

    expect(getShip("ship-1").integrity).toBe(1);
    expect(lastCard()).toMatch(/is <strong>unprepared<\/strong>/);
    expect(lastCard()).not.toMatch(/has only 0 supply/);
  });

  it("control: a PC who is not unprepared pays the trade, and the repair lands", async () => {
    installShip(1);
    const kira = installPc({ supply: 3, unprepared: false });

    await applyRepairSpends(trade(2), PLAYER_CTX);

    expect(kira.system.supply.value).toBe(1);
    expect(getShip("ship-1").integrity).toBe(4);
    expect(lastCard()).toMatch(/Sacrificed 2 supply from <strong>Kira<\/strong> \(supply now 1\)/);
  });

  it("control: an unprepared PC's repair with no trade lands", async () => {
    installShip(1);
    const kira = installPc({ supply: 3, unprepared: true });

    await applyRepairSpends(trade(0), PLAYER_CTX);

    expect(kira.system.supply.value).toBe(3);
    expect(getShip("ship-1").integrity).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The dialog, on the typist's client
// ─────────────────────────────────────────────────────────────────────────────

describe("the !repair dialog greys the trade while the repairing PC is unprepared", () => {
  let table, kira;
  const player = () => table.client("pl-1");
  const repairCards = () => table.cards(f => f.repairCard);

  /** Type `!repair` as Kira; the responder answers the dialog. Returns the dialog shown. */
  async function repair(answer) {
    let shown = null;
    player().answerDialogs(d => { shown = d; return answer(d); });
    await player().chat("!repair", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    return shown;
  }
  // At a facility, strong hit (5 points): fix a module (2) and trade 1.
  const tradeOne = (d) => d.submit({ 'select[name="situation"]': "facility", 'select[name="outcome"]': "strong",
    'input[name="fix_module"]': "1", 'input[name="extra"]': "1" });

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "rp-s1", sessionNumber: 1, currentSceneId: "rp-scene", sceneTruths: [],
    } } } });
    kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { supply: { value: 3 }, debility: { unprepared: true } } });
  });

  it("the trade field is disabled and the dialog says why", async () => {
    const dialog = await repair(d => d.close());
    expect(dialog, "the Repair dialog opened on the typist's client").toBeTruthy();
    expect(dialog.form.querySelector('input[name="extra"]').disabled).toBe(true);
    expect(dialog.content).toMatch(/Kira is unprepared — a loss of resources goes to another suffer move/);
  }, 30_000);

  it("an Apply that trades anyway is refused on the typist's client: nothing is relayed, the supply stays", async () => {
    await repair(tradeOne);
    expect(player().notifications).toContainEqual(expect.objectContaining({
      message: expect.stringMatching(/Repair: Kira is unprepared — a loss of resources goes to another suffer move/),
    }));
    expect(repairCards()).toHaveLength(0);
    expect(kira.system.supply.value).toBe(3);
  }, 30_000);

  it("control: a prepared PC's dialog offers the trade, and the trade is paid", async () => {
    kira.system.debility.unprepared = false;
    const dialog = await repair(tradeOne);
    expect(dialog.form.querySelector('input[name="extra"]').disabled).toBe(false);
    expect(dialog.content).not.toMatch(/is unprepared/);
    expect(repairCards()).toHaveLength(1);
    expect(repairCards()[0].content).toMatch(/Sacrificed 1 supply from <strong>Kira<\/strong> \(supply now 2\)/);
  }, 30_000);
});
