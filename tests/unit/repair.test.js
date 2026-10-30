/**
 * STARFORGED COMPANION
 * tests/unit/repair.test.js
 *
 * Unit coverage for `!repair`:
 *   - the points matrix / spend costs match the play kit (p. 7);
 *   - normaliseAllocation (shared by the dialog and the GM handler);
 *   - applyRepairSpends — the "repair.apply" gmRelay handler — writes through
 *     the canonical ship record (clearBattered before repairIntegrity,
 *     integrityMax clamp, battered blocks integrity) and debits supply from
 *     the repairing player's PC (never the GM's game.user.character);
 *   - resolveRepairActorId — the authoring-client PC resolution.
 * The DialogV2 body itself is exercised only in live Foundry.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  _internal,
  normaliseAllocation,
  applyRepairSpends,
  resolveRepairActorId,
} from "../../src/moves/repair.js";
import { getShip } from "../../src/entities/ship.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";


describe("Repair points table (play kit p. 7)", () => {
  it("facility yields 5 / 3 by outcome", () => {
    expect(_internal.POINTS_TABLE.facility).toEqual({ strong: 5, weak: 3 });
  });
  it("field yields 3 / 1 by outcome", () => {
    expect(_internal.POINTS_TABLE.field).toEqual({ strong: 3, weak: 1 });
  });
  it("under fire yields 2 / 0 by outcome", () => {
    expect(_internal.POINTS_TABLE.under_fire).toEqual({ strong: 2, weak: 0 });
  });
});

describe("Repair spend costs (play kit p. 7)", () => {
  it("clear battered = 2 points", () => {
    expect(_internal.SPEND_COST.clear_battered).toBe(2);
  });
  it("fix one broken module = 2 points", () => {
    expect(_internal.SPEND_COST.fix_module).toBe(2);
  });
  it("+1 integrity = 1 point", () => {
    expect(_internal.SPEND_COST.integrity).toBe(1);
  });
  it("+1 mechanical companion health = 1 point", () => {
    expect(_internal.SPEND_COST.companion_health).toBe(1);
  });
  it("other device clean = 3 points", () => {
    expect(_internal.SPEND_COST.other_device).toBe(3);
  });
  it("other device with complication = 2 points", () => {
    expect(_internal.SPEND_COST.other_device_cx).toBe(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// normaliseAllocation
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseAllocation", () => {
  it("re-derives earned points and accepts an in-budget allocation", () => {
    const a = normaliseAllocation({ situation: "field", outcome: "strong", extra: 1, spends: { integrity: 2, clear_battered: 1 } });
    expect(a.ok).toBe(true);
    expect(a.earned).toBe(4);       // 3 + 1 traded
    expect(a.totalCost).toBe(4);    // 2×1 + 1×2
    expect(a.spends.fix_module).toBe(0);
  });

  it("rejects an over-budget allocation", () => {
    const a = normaliseAllocation({ situation: "under_fire", outcome: "weak", extra: 0, spends: { integrity: 1 } });
    expect(a.ok).toBe(false);
    expect(a.reason).toMatch(/only 0 earned/);
  });

  it("rejects an unknown situation/outcome", () => {
    expect(normaliseAllocation({ situation: "orbit", outcome: "strong" }).ok).toBe(false);
  });

  it("clamps counts to the per-row maxima and extra to 3", () => {
    const a = normaliseAllocation({ situation: "facility", outcome: "strong", extra: 9, spends: { clear_battered: 5 } });
    expect(a.extra).toBe(3);
    expect(a.spends.clear_battered).toBe(_internal.SPEND_MAX.clear_battered);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyRepairSpends — the "repair.apply" GM handler
// ─────────────────────────────────────────────────────────────────────────────

function installShip({ integrity = 2, battered = false, integrityMax = 5 } = {}) {
  const ship = makeTestActor({
    id: "ship-1", type: "starship", name: "Wayfarer",
    system: { debility: { battered } },
    flags: {
      [MODULE_ID]: {
        entityType: "ship",
        ship: { _id: "ship-guid", name: "Wayfarer", integrity, integrityMax, battered, isCommandVehicle: true },
      },
    },
  });
  game.actors._set("ship-1", ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ["ship-1"], characterIds: [] });
  return ship;
}

function installPc(id, { supply = 3, ownership = {} } = {}) {
  const pc = makeTestActor({ id, type: "character", name: id.toUpperCase(), system: { supply: { value: supply } } });
  pc.ownership = ownership;
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

function lastCard() {
  return ChatMessage._created.at(-1)?.content ?? "";
}

const GM_CTX     = { requesterId: "gm-1", requester: { id: "gm-1", isGM: true }, requesterIsGM: true, local: true };
const PLAYER_CTX = { requesterId: "pl-1", requester: { id: "pl-1", isGM: false }, requesterIsGM: false, local: false };

function payload(overrides = {}) {
  return {
    situation: "facility", outcome: "strong", earned: 5, extra: 0,
    spends: { integrity: 0, clear_battered: 0, companion_health: 0, fix_module: 0, other_device: 0, other_device_cx: 0 },
    actorId: null,
    ...overrides,
  };
}

describe("applyRepairSpends", () => {
  let savedCharacter;
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
    ChatMessage._reset();
    savedCharacter = game.user.character;
  });
  afterEach(() => { game.user.character = savedCharacter; });

  it("raises integrity on the canonical ship record (not a raw flag write)", async () => {
    installShip({ integrity: 2 });
    await applyRepairSpends(payload({ spends: { integrity: 2 } }), GM_CTX);

    const rec = getShip("ship-1");
    expect(rec.integrity).toBe(4);
    expect(rec.updatedAt).toBeTruthy();                 // went through updateShip
    expect(lastCard()).toMatch(/\+2 integrity on <strong>Wayfarer<\/strong> \(now 4\/5\)/);
  });

  it("clamps integrity at integrityMax and says so on the card", async () => {
    installShip({ integrity: 4 });
    await applyRepairSpends(payload({ spends: { integrity: 3 } }), GM_CTX);

    expect(getShip("ship-1").integrity).toBe(5);
    expect(lastCard()).toMatch(/integrity capped at 5/);
  });

  it("does not raise integrity while battered, and reports it", async () => {
    installShip({ integrity: 1, battered: true });
    await applyRepairSpends(payload({ spends: { integrity: 2 } }), GM_CTX);

    expect(getShip("ship-1").integrity).toBe(1);
    expect(lastCard()).toMatch(/battered — integrity not raised/);
  });

  it("clears battered on the canonical record AND the native debility, BEFORE raising integrity", async () => {
    const ship = installShip({ integrity: 1, battered: true });
    await applyRepairSpends(payload({ spends: { clear_battered: 1, integrity: 3 } }), GM_CTX);

    const rec = getShip("ship-1");
    expect(rec.battered).toBe(false);                     // source of truth
    expect(ship.system.debility.battered).toBe(false);    // sheet mirror
    expect(rec.integrity).toBe(4);                        // raised after the clear
    expect(lastCard()).toMatch(/Cleared <strong>battered<\/strong>/);
  });

  it("reports when there is no command vehicle instead of claiming the spend", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [] });
    await applyRepairSpends(payload({ spends: { integrity: 1 } }), GM_CTX);
    expect(lastCard()).toMatch(/No command vehicle found — \+1 integrity not applied/);
  });

  it("debits supply from the repairing player's PC (payload.actorId), not the GM's bound character", async () => {
    installShip();
    const gmPc     = installPc("gm-pc", { supply: 4 });
    const playerPc = installPc("player-pc", { supply: 3, ownership: { "pl-1": 3 } });
    game.user.character = gmPc;

    await applyRepairSpends(payload({ situation: "field", outcome: "weak", extra: 2, spends: { integrity: 3 }, actorId: "player-pc" }), PLAYER_CTX);

    expect(playerPc.system.supply.value).toBe(1);
    expect(gmPc.system.supply.value).toBe(4);
    expect(lastCard()).toMatch(/Sacrificed 2 supply from <strong>PLAYER-PC<\/strong> \(supply now 1\)/);
  });

  // Issue #300 F04: the traded points were granted whatever the payment did —
  // the card warned, and the vehicle was repaired anyway. These assert the
  // ship, not only the card: no unpaid repair lands.
  it("refuses to debit a PC the requester does not own — and repairs nothing", async () => {
    installShip({ integrity: 1 });
    const other = installPc("other-pc", { supply: 3, ownership: { "someone-else": 3 } });

    await applyRepairSpends(payload({ situation: "under_fire", outcome: "weak", extra: 2, spends: { integrity: 2 }, actorId: "other-pc" }), PLAYER_CTX);

    expect(other.system.supply.value).toBe(3);
    expect(getShip("ship-1").integrity).toBe(1);
    expect(lastCard()).toMatch(/not debited/);
    expect(lastCard()).toMatch(/No repairs were applied/);
    expect(getCapturedWarns().some(w => /does not own/.test(w))).toBe(true);
  });

  it("spends nothing and repairs nothing when the PC has less supply than traded", async () => {
    installShip({ integrity: 0 });
    const pc = installPc("poor-pc", { supply: 1, ownership: { "pl-1": 3 } });

    await applyRepairSpends(payload({ situation: "under_fire", outcome: "weak", extra: 3, spends: { integrity: 3 }, actorId: "poor-pc" }), PLAYER_CTX);

    expect(pc.system.supply.value).toBe(1);
    expect(getShip("ship-1").integrity).toBe(0);
    expect(lastCard()).toMatch(/has only 1 supply — the \+3 repair points traded need 3; nothing was spent/);
    expect(lastCard()).toMatch(/No repairs were applied/);
  });

  it("repairs nothing when no character resolved to pay", async () => {
    installShip({ integrity: 0 });
    await applyRepairSpends(payload({ situation: "under_fire", outcome: "weak", extra: 1, spends: { integrity: 1 }, actorId: null }), GM_CTX);
    expect(getShip("ship-1").integrity).toBe(0);
    expect(lastCard()).toMatch(/No character found to pay 1 supply/);
    expect(lastCard()).toMatch(/No repairs were applied/);
  });

  it("repairs nothing when the supply write is rejected", async () => {
    expectConsoleError(/supply trade failed/);
    installShip({ integrity: 0 });
    const pc = installPc("pc-x", { supply: 3, ownership: { "pl-1": 3 } });
    pc.update = async () => { throw new Error("write rejected"); };

    await applyRepairSpends(payload({ situation: "under_fire", outcome: "weak", extra: 2, spends: { integrity: 2 }, actorId: "pc-x" }), PLAYER_CTX);

    expect(getShip("ship-1").integrity).toBe(0);
    expect(lastCard()).toMatch(/Supply trade failed .* nothing was spent/);
    expect(lastCard()).toMatch(/No repairs were applied/);
  });

  // Issue #315 S04: the trade is Sacrifice Resources, but it debited the meter
  // alone — the last supply left the PC at 0 and prepared, while the card
  // said it was sacrificed. Unprepared is marked once the payment is whole.
  describe("the trade's last supply marks unprepared (issue #315 S04)", () => {
    const trade = (actorId, extra = 1) => payload({ situation: "field", outcome: "weak", extra, spends: { integrity: 1 + extra }, actorId });

    it("supply 1, one traded: supply 0, unprepared, the repair lands, and the card says both", async () => {
      installShip({ integrity: 1 });
      const pc = installPc("pc-k", { supply: 1, ownership: { "pl-1": 3 } });

      await applyRepairSpends(trade("pc-k"), PLAYER_CTX);

      expect(pc.system.supply.value).toBe(0);
      expect(pc.system.debility.unprepared).toBe(true);
      expect(getShip("ship-1").integrity).toBe(3);
      expect(lastCard()).toMatch(/Sacrificed 1 supply from <strong>PC-K<\/strong> \(supply now 0\) → \+1 repair point\. Out of supply — marked <strong>unprepared<\/strong>\./);
    });

    it("control: supply left over marks nothing", async () => {
      installShip({ integrity: 1 });
      const pc = installPc("pc-k", { supply: 3, ownership: { "pl-1": 3 } });

      await applyRepairSpends(trade("pc-k", 2), PLAYER_CTX);

      expect(pc.system.supply.value).toBe(1);
      expect(pc.system.debility.unprepared).toBe(false);
      expect(lastCard()).not.toMatch(/unprepared/);
    });

    it("already unprepared: it stays marked, and the card does not claim a new mark", async () => {
      installShip({ integrity: 1 });
      const pc = installPc("pc-k", { supply: 1, ownership: { "pl-1": 3 } });
      pc.system.debility.unprepared = true;

      await applyRepairSpends(trade("pc-k"), PLAYER_CTX);

      expect(pc.system.supply.value).toBe(0);
      expect(pc.system.debility.unprepared).toBe(true);
      expect(lastCard()).not.toMatch(/marked <strong>unprepared/);
    });

    it("too little supply: nothing is spent, nothing is marked, nothing is repaired", async () => {
      installShip({ integrity: 1 });
      const pc = installPc("pc-k", { supply: 1, ownership: { "pl-1": 3 } });

      await applyRepairSpends(trade("pc-k", 2), PLAYER_CTX);

      expect(pc.system.supply.value).toBe(1);
      expect(pc.system.debility.unprepared).toBe(false);
      expect(getShip("ship-1").integrity).toBe(1);
    });

    it("the impact's write is refused: the payment and the repair stand, and the card says to mark it", async () => {
      installShip({ integrity: 1 });
      const pc = installPc("pc-k", { supply: 1, ownership: { "pl-1": 3 } });
      const write = pc.update;
      pc.update = async (changes, ...rest) => {
        if ("system.debility.unprepared" in changes) throw new Error("write rejected");
        return write(changes, ...rest);
      };

      await applyRepairSpends(trade("pc-k"), PLAYER_CTX);

      expect(pc.system.supply.value).toBe(0);
      expect(pc.system.debility.unprepared).toBe(false);
      expect(getShip("ship-1").integrity).toBe(3);
      expect(lastCard()).toMatch(/Out of supply, but unprepared could not be marked — mark it on the sheet/);
    });
  });

  it("applies the base points with no trade at all", async () => {
    installShip({ integrity: 1 });
    await applyRepairSpends(payload({ situation: "field", outcome: "weak", spends: { integrity: 1 } }), PLAYER_CTX);
    expect(getShip("ship-1").integrity).toBe(2);
  });

  it("rejects an over-budget relayed allocation without posting a card", async () => {
    installShip({ integrity: 1 });
    await applyRepairSpends(payload({ situation: "under_fire", outcome: "weak", spends: { integrity: 4 } }), GM_CTX);
    expect(ChatMessage._created).toHaveLength(0);
    expect(getShip("ship-1").integrity).toBe(1);
    expect(getCapturedWarns().some(w => /rejected relayed allocation/.test(w))).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveRepairActorId — runs on the authoring (typing) client
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveRepairActorId", () => {
  let restoreUser;
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
  });
  afterEach(() => restoreUser?.());

  it("uses the invoking user's bound character", () => {
    const pc = installPc("bound-pc");
    restoreUser = withUser({ id: "pl-1", isGM: false, character: pc });
    expect(resolveRepairActorId({ content: "!repair" })).toBe("bound-pc");
  });

  it("falls back to a PC the invoking user owns", () => {
    installPc("someone-pc", { ownership: { "pl-9": 3 } });
    installPc("my-pc",      { ownership: { "pl-1": 3 } });
    restoreUser = withUser({ id: "pl-1", isGM: false, character: null });
    expect(resolveRepairActorId(null)).toBe("my-pc");
  });

  it("honours a selected PC token on the !repair message", () => {
    const bound = installPc("bound-pc");
    installPc("token-pc");
    restoreUser = withUser({ id: "pl-1", isGM: false, character: bound });
    expect(resolveRepairActorId({ speaker: { actor: "token-pc" } })).toBe("token-pc");
  });
});
