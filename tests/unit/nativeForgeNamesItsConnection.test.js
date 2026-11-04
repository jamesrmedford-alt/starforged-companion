/* global makeTestActor, structuredClone */
/**
 * Issue #330 D5 — a Forge a Bond rolled on the sheet forges the connection
 * its bond Item names, or nobody.
 *
 * A sheet Forge a Bond on a connection the player added by hand on the
 * Connections tab (no module record) was paid by payForgedBondNative(name),
 * which resolved the name through the develop ladder's full fallback (exact →
 * whole words → sole bonded → sole active): the name matched nothing, so the
 * crew's one module connection was forged instead — `bonded: true`, "Bond
 * forged." in her history, the Bonds legacy paid and "⚑ Bond Forged: Sable"
 * posted for a roll about someone else. Decided (option A): the sheet roll's
 * Item names its connection exactly — by the record id it carries, else the
 * exact name — with no fallback.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { payForgedBondNative } from "../../src/index.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const legacy = (track) => game.settings.get(MODULE_ID, "campaignState").legacyTracks?.[track]?.ticks ?? 0;
const forgeCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forgeABondCard);

/** A connection card Actor with a record the stubs can update. */
function connectionActor(id, name) {
  const actor = makeTestActor({ id, name, type: "character" });
  const flags = { [MODULE_ID]: { entityType: "connection", connection: {
    _id: id, name, rank: "dangerous", relationshipTicks: 8, bonded: false, active: true, history: [],
  } } };
  actor.flags = flags;
  actor.getFlag = (mod, key) => flags[mod]?.[key];
  actor.setFlag = async (mod, key, value) => { (flags[mod] ??= {})[key] = value; };
  game.actors._set(id, actor);
  return actor;
}

/** The roller, holding bond Items of the given names (and record keys). */
function roller(bonds) {
  const contents = bonds.map(([name, connectionId], i) => ({
    id: `bond-${i}`, name, type: "progress", system: { subtype: "bond", rank: 2, current: 8 },
    flags: connectionId ? { [MODULE_ID]: { connectionId } } : {},
  }));
  const pc = makeTestActor({ id: "pc-kira", name: "Kira", type: "character", items: { contents } });
  game.actors._set(pc.id, pc);
  return pc;
}

let sable;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.user = { id: "gm-1", isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === "gm-1" ? game.user : null) });
  game.settings._store.clear();
  sable = connectionActor("npc-sable", "Sable");
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone({ ...CampaignStateSchema, currentSessionId: "s1", connectionIds: ["npc-sable"] }));
});

describe("issue #330 D5 — a sheet Forge a Bond forges the connection its Item names, or nobody", () => {
  it("a hand-made bond the module does not know forges nobody — not the crew's one connection", async () => {
    roller([["Old Mentor", null]]);
    await payForgedBondNative("Old Mentor", { actorId: "pc-kira" });
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(false);
    expect(legacy("bonds")).toBe(0);
    expect(forgeCards()).toHaveLength(0);
  });

  it("with no roller known, a name matching no connection forges nobody", async () => {
    await payForgedBondNative("Old Mentor");
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(false);
    expect(forgeCards()).toHaveLength(0);
  });

  it("a part of a name is not the name", async () => {
    await payForgedBondNative("Sab");
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(false);
  });

  it("the Item's record key finds a connection renamed since (its Item kept the old name)", async () => {
    sable.flags[MODULE_ID].connection.name = "Sable Varn";
    roller([["Sable", "npc-sable"]]);
    await payForgedBondNative("Sable", { actorId: "pc-kira" });
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(forgeCards()).toHaveLength(1);
  });

  it("the Item's record key wins over another connection's exact name", async () => {
    const other = connectionActor("npc-sable-2", "Rook");
    const cs = game.settings.get(MODULE_ID, "campaignState");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...cs, connectionIds: ["npc-sable", "npc-sable-2"] });
    roller([["Rook", "npc-sable"]]);                 // the Item is Sable's, renamed on the sheet
    await payForgedBondNative("Rook", { actorId: "pc-kira" });
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(other.flags[MODULE_ID].connection.bonded).toBe(false);
  });

  it("control: a sheet Forge a Bond on Sable forges Sable and pays the Bonds legacy", async () => {
    roller([["Sable", "npc-sable"]]);
    await payForgedBondNative("Sable", { actorId: "pc-kira" });
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(legacy("bonds")).toBe(2);
    expect(forgeCards()).toHaveLength(1);
  });

  it("control: an exact name forges its connection with no roller known", async () => {
    await payForgedBondNative("sable");
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
  });
});
