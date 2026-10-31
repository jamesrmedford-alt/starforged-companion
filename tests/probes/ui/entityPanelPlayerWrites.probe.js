/**
 * PROBE (ui audit) — PROGRESS-PANEL-PLAYER-REFUSED (Entities panel twin)
 *
 * The Entities panel is on every user's toolbar ("Everyone"). Its detail
 * view offers every viewer the canonical-lock toggle and the narrator-detail
 * Pin / Promote / Remove buttons; each writes the entity's host Actor
 * directly (registry.writeEntityFlag → actor.setFlag). An NPC card is a
 * GM-created Actor a player does not own, so Foundry refuses the player's
 * write; nothing relays it to the GM. (Pin / Remove swallow the error into
 * console.error — the click silently does nothing.)
 *
 * Asserts the CORRECT behaviour (a player's click lands on the NPC, via the
 * GM, or is at least relayed to the GM), so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let EntityPanelApp;
let restoreUser;
let savedUsers;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../../src/ui/entityPanel.js"));
});

beforeEach(() => {
  game.actors._reset();
  game.socket._reset();
  const npc = makeTestActor({
    id: "npc-vex", type: "character", name: "Vex",
    ownership: { default: 0 },   // a GM-created NPC card: the player is not an owner
    flags: { [MODULE_ID]: { entityType: "connection", connection: {
      _id: "rec-vex", name: "Vex", canonicalLocked: false,
      generativeTier: [{ detail: "Has a scar over one eye", pinned: false }],
    } } },
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

const relayed = () => (game.socket._emitted ?? []).some(e => String(e?.payload?.kind ?? "").startsWith("gmRelay."));
const record  = () => game.actors.get("npc-vex").getFlag(MODULE_ID, "connection");

describe("Entities panel — a player's edits (PROGRESS-PANEL-PLAYER-REFUSED, Entities twin)", () => {
  it("a player's canonical-lock toggle lands (or is relayed to the GM)", async () => {
    silenceConsoleErrors();
    const app = { render() {}, element: null };
    let error = null;
    await EntityPanelApp.DEFAULT_OPTIONS.actions.toggleCanonicalLock
      .call(app, {}, { dataset: { journalId: "npc-vex" } })
      .catch(err => { error = err; });
    // Today: "User test-user-player lacks permission to update Actor [npc-vex]".
    expect({ landed: record().canonicalLocked === true, relayed: relayed(), error: error?.message ?? null })
      .toMatchObject({ error: null });
    expect(record().canonicalLocked === true || relayed()).toBe(true);
  });

  it("a player's Pin on a narrator-added detail lands (or is relayed to the GM)", async () => {
    silenceConsoleErrors();
    const app = { render() {}, element: null };
    await EntityPanelApp.DEFAULT_OPTIONS.actions.pinTier
      .call(app, {}, { dataset: { journalId: "npc-vex", detail: "Has a scar over one eye" } });
    // Today: the refusal is swallowed (console.error) — no pin, no relay, no notice.
    expect(record().generativeTier[0].pinned === true || relayed()).toBe(true);
  });
});
