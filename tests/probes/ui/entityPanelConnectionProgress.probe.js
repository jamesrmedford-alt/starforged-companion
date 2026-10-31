/**
 * PROBE (ui audit) — PANEL-CONN-PROGRESS-DEAD
 *
 * The Entity Panel's connection detail view renders a "Progress: N / 10 boxes
 * (rank)" row from `entity.data.progress.ticks` (entityPanel.js #renderDetail).
 * Nothing writes `connection.progress`: the connection's relationship track is
 * `relationshipTicks` (schemas.js ConnectionSchema; written by
 * markRelationshipProgress, scored by Forge a Bond). So the row never renders
 * — a connection at 4 boxes shows no progress at all in the panel.
 *
 * Asserts the CORRECT behaviour (the detail view shows the connection's
 * relationship progress), so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

let EntityPanelApp;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../../src/ui/entityPanel.js"));
});

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.actors._reset();
  // A connection whose relationship track has 16 ticks (4 boxes) — the shape
  // createConnection + markRelationshipProgress produce.
  const npc = makeTestActor({
    id: "npc-vex", type: "character", name: "Vex",
    flags: { [MODULE_ID]: { entityType: "connection", entityId: "rec-vex", connection: {
      _id: "rec-vex", name: "Vex", role: "Smuggler", rank: "dangerous",
      relationshipTicks: 16, bonded: false, active: true, history: [],
    } } },
  });
  game.actors._set(npc.id, npc);
  game.settings._store.set(CS_KEY, { connectionIds: ["npc-vex"] });
});

afterEach(() => {
  delete globalThis.document;
  game.actors._reset();
  game.settings._store.delete(CS_KEY);
});

describe("Entity Panel — connection detail (PANEL-CONN-PROGRESS-DEAD)", () => {
  it("shows the connection's relationship progress (16 ticks → 4 / 10 boxes)", async () => {
    const panel = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: "npc-vex" } });
    const context = await panel._prepareContext({});
    expect(context.view).toBe("detail");
    expect(context.entity?.data?.relationshipTicks).toBe(16);   // the canonical store has it

    const root = await panel._renderHTML(context, {});
    const text = root.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Vex");                               // the detail rendered
    // Today: no Progress row — the view reads data.progress.ticks, which nothing writes.
    expect(text).toMatch(/Progress\s*4 \/ 10 boxes/);
  });
});
