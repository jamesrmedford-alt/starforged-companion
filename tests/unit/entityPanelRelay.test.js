/**
 * STARFORGED COMPANION
 * tests/unit/entityPanelRelay.test.js
 *
 * Issue #321 U05 (the Entities panel half). The panel is on every user's
 * toolbar, and its detail view offers everyone the canonical-lock toggle and
 * the narrator-detail Pin / Promote / Remove buttons. Each wrote the entity's
 * host document directly (registry.writeEntityFlag → actor.setFlag); an NPC
 * card is a GM-created Actor a player does not own, so Foundry refused the
 * player's write and nothing relayed it — and Pin / Remove swallowed the
 * refusal into console.error, so the click silently did nothing. Each edit is
 * now asked of the canonical GM ("entity.edit" → applyEntityEditFromRelay).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";

const MODULE_ID = "starforged-companion";

const vexRecord = () => ({
  _id: "rec-vex", name: "Vex", canonicalLocked: false, notes: "A smuggler.",
  generativeTier: [
    { detail: "Has a scar over one eye", pinned: false },
    { detail: "Owes the Syndicate", pinned: false },
    { detail: "Flies a stolen courier", pinned: false, promoted: true },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// A player's click, on one client: it is relayed, never refused
// ─────────────────────────────────────────────────────────────────────────────

describe("Entities panel — a player's edit is relayed to the GM, not refused (issue #321 U05)", () => {
  let EntityPanelApp;
  let restoreUser;
  let savedUsers;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
  });

  beforeEach(() => {
    game.actors._reset();
    game.socket._reset();
    const npc = makeTestActor({
      id: "npc-vex", type: "character", name: "Vex",
      ownership: { default: 0 },   // a GM-created NPC card: the player is not an owner
      flags: { [MODULE_ID]: { entityType: "connection", connection: vexRecord() } },
    });
    game.actors._set(npc.id, npc);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ["npc-vex"] });
    savedUsers = game.users;
    game.users = Object.assign(
      [{ id: "test-user-gm", isGM: true, active: true }, { id: "test-user-player", isGM: false, active: true }],
      { get: (id) => game.users.find(u => u.id === id) ?? null },
    );
    restoreUser = asPlayer();
  });

  afterEach(() => {
    restoreUser();
    game.users = savedUsers;
    game.actors._reset();
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
  });

  const relays = () => (game.socket._emitted ?? []).filter(e => e?.payload?.kind === "gmRelay.entity.edit").map(e => e.payload.payload);

  it("the canonical-lock toggle is relayed — no permission error on the player's client", async () => {
    let error = null;
    await EntityPanelApp.DEFAULT_OPTIONS.actions.toggleCanonicalLock
      .call({ render() {}, element: null }, {}, { dataset: { journalId: "npc-vex" } })
      .catch(err => { error = err; });
    expect(error).toBeNull();
    expect(relays()).toEqual([{ op: "lock", entityId: "npc-vex" }]);
  });

  it("Pin, Promote and Remove are relayed with the detail they act on", async () => {
    const app = { render() {}, element: null };
    const dataset = { journalId: "npc-vex", detail: "Has a scar over one eye" };
    for (const action of ["pinTier", "promoteTier", "removeTier"]) {
      await EntityPanelApp.DEFAULT_OPTIONS.actions[action].call(app, {}, { dataset });
    }
    expect(relays().map(r => r.op)).toEqual(["pin", "promote", "remove"]);
    expect(relays().every(r => r.entityId === "npc-vex" && r.detail === "Has a scar over one eye")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On a table: the player's edit lands on the NPC card through the GM
// ─────────────────────────────────────────────────────────────────────────────

describe("Entities panel — a player's edits land on the NPC card (issue #321 U05)", () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: true, connectionIds: ["npc-vex"] } } } });
    table.addActor({
      id: "npc-vex", type: "character", name: "Vex",
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { entityType: "connection", connection: vexRecord() } },
    });
  });

  const record = () => table.actors.get("npc-vex").getFlag(MODULE_ID, "connection");
  const tierEntry = (detail) => record().generativeTier.find(e => e.detail === detail);

  async function click(userId, action, dataset) {
    const client = table.client(userId);
    const { EntityPanelApp } = await client.import("../../src/ui/entityPanel.js");
    await client.run(() => EntityPanelApp.DEFAULT_OPTIONS.actions[action].call({ render() {}, element: null }, {}, { dataset }));
    await table.settle();
  }

  it("the canonical-lock toggle locks, and a second click unlocks", async () => {
    await click("pl-1", "toggleCanonicalLock", { journalId: "npc-vex" });
    expect(record().canonicalLocked).toBe(true);
    await click("pl-1", "toggleCanonicalLock", { journalId: "npc-vex" });
    expect(record().canonicalLocked).toBe(false);
  });

  it("Pin pins the detail (and a second click unpins it)", async () => {
    await click("pl-1", "pinTier", { journalId: "npc-vex", detail: "Has a scar over one eye" });
    expect(tierEntry("Has a scar over one eye").pinned).toBe(true);
    await click("pl-1", "pinTier", { journalId: "npc-vex", detail: "Has a scar over one eye" });
    expect(tierEntry("Has a scar over one eye").pinned).toBe(false);
  });

  it("Promote, once the player confirms on their own screen, appends the detail to the notes", async () => {
    table.client("pl-1").answerDialogs(d => d.choose("yes"));
    await click("pl-1", "promoteTier", { journalId: "npc-vex", detail: "Owes the Syndicate" });
    expect(record().notes).toBe("A smuggler.\n\nOwes the Syndicate");
    expect(tierEntry("Owes the Syndicate")).toMatchObject({ promoted: true });
    expect(table.client("gm-1").dialogs).toHaveLength(0);
  });

  it("Remove removes the detail and keeps the others", async () => {
    await click("pl-1", "removeTier", { journalId: "npc-vex", detail: "Has a scar over one eye" });
    expect(record().generativeTier.map(e => e.detail)).toEqual(["Owes the Syndicate", "Flies a stolen courier"]);
  });

  it("with no GM connected, Pin warns the player and changes nothing", async () => {
    await table.leave("gm-1");
    await click("pl-1", "pinTier", { journalId: "npc-vex", detail: "Has a scar over one eye" });
    expect(tierEntry("Has a scar over one eye").pinned).toBe(false);
    expect(table.client("pl-1").notifications.map(n => n.message))
      .toContainEqual(expect.stringMatching(/no GM is connected/));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The GM-side handler: only what the panel can produce
// ─────────────────────────────────────────────────────────────────────────────

describe("applyEntityEditFromRelay — validation (issue #321 U05)", () => {
  let applyEntityEditFromRelay;

  beforeAll(async () => {
    ({ applyEntityEditFromRelay } = await import("../../src/ui/entityPanel.js"));
  });

  beforeEach(() => {
    game.actors._reset();
    game.actors._set("npc-vex", makeTestActor({
      id: "npc-vex", type: "character", name: "Vex",
      flags: { [MODULE_ID]: { entityType: "connection", connection: vexRecord() } },
    }));
  });
  afterEach(() => game.actors._reset());

  const record = () => game.actors.get("npc-vex").getFlag(MODULE_ID, "connection");

  it("refuses an unknown op, an unknown entity, and a detail the panel does not show", async () => {
    expect(await applyEntityEditFromRelay({ op: "rename", entityId: "npc-vex" })).toEqual({ applied: false, reason: "invalid" });
    expect(await applyEntityEditFromRelay({ op: "lock", entityId: "npc-nobody" })).toEqual({ applied: false, reason: "no-entity" });
    expect(await applyEntityEditFromRelay({ op: "pin", entityId: "npc-vex", detail: "Is secretly a Precursor" }))
      .toEqual({ applied: false, reason: "no-detail" });
    // A promoted detail is no longer shown: promoting it again would append it to the notes twice.
    expect(await applyEntityEditFromRelay({ op: "promote", entityId: "npc-vex", detail: "Flies a stolen courier" }))
      .toEqual({ applied: false, reason: "no-detail" });
    expect(record()).toEqual(vexRecord());
  });

  it("Remove leaves a promoted entry with the same text alone (the panel never showed it)", async () => {
    const flags = game.actors.get("npc-vex").flags[MODULE_ID].connection;
    flags.generativeTier.push({ detail: "Flies a stolen courier", pinned: false });
    expect(await applyEntityEditFromRelay({ op: "remove", entityId: "npc-vex", detail: "Flies a stolen courier" }))
      .toEqual({ applied: true });
    expect(record().generativeTier.filter(e => e.detail === "Flies a stolen courier")).toEqual([
      { detail: "Flies a stolen courier", pinned: false, promoted: true },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pin / Remove no longer fail silently
// ─────────────────────────────────────────────────────────────────────────────

describe("Entities panel — a refused Pin or Remove is reported, not swallowed (issue #321 U05)", () => {
  let EntityPanelApp;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
  });

  beforeEach(() => {
    game.actors._reset();
    game.actors._set("npc-vex", makeTestActor({
      id: "npc-vex", type: "character", name: "Vex",
      flags: { [MODULE_ID]: { entityType: "connection", connection: vexRecord() } },
    }));
  });
  afterEach(() => game.actors._reset());

  for (const action of ["pinTier", "removeTier"]) {
    it(`${action}: the GM's refused write shows an error notification`, async () => {
      expectConsoleError(/entity panel/);
      const npc = game.actors.get("npc-vex");
      vi.spyOn(npc, "setFlag").mockRejectedValue(new Error("the server refused the update"));
      const error = vi.spyOn(ui.notifications, "error");
      await EntityPanelApp.DEFAULT_OPTIONS.actions[action]
        .call({ render() {}, element: null }, {}, { dataset: { journalId: "npc-vex", detail: "Has a scar over one eye" } });
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/could not be saved/));
      expect(npc.getFlag(MODULE_ID, "connection")).toEqual(vexRecord());
    });
  }
});
