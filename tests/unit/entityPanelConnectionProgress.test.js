/**
 * STARFORGED COMPANION
 * tests/unit/entityPanelConnectionProgress.test.js
 *
 * Issue #322 V11 (the audit's entityPanelConnectionProgress probe,
 * PANEL-CONN-PROGRESS-DEAD): the Entities panel's connection detail rendered
 * a "Progress: N / 10 boxes (rank)" row from `entity.data.progress.ticks`.
 * Nothing writes `connection.progress` — the relationship track is
 * `relationshipTicks` (schemas.js ConnectionSchema; written by
 * markRelationshipProgress, scored by Forge a Bond) — so the row never
 * rendered. It renders from `relationshipTicks` and the rank now.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

let EntityPanelApp;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
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

describe("Entity Panel — connection detail shows its relationship track (PANEL-CONN-PROGRESS-DEAD)", () => {
  it("shows the connection's relationship progress (16 ticks → 4 / 10 boxes)", async () => {
    const panel = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: "npc-vex" } });
    const context = await panel._prepareContext({});
    expect(context.view).toBe("detail");
    expect(context.entity?.data?.relationshipTicks).toBe(16);   // the canonical store has it

    const root = await panel._renderHTML(context, {});
    const text = root.textContent.replace(/\s+/g, " ");
    expect(text).toContain("Vex");                               // the detail rendered
    // The row used to read data.progress.ticks, which nothing writes.
    expect(text).toMatch(/Progress\s*4 \/ 10 boxes \(dangerous\)/);
  });

  it("a bonded connection at a full track says so", async () => {
    const npc = game.actors.get("npc-vex");
    Object.assign(npc.flags[MODULE_ID].connection, { relationshipTicks: 40, bonded: true });
    const panel = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: "npc-vex" } });
    const root = await panel._renderHTML(await panel._prepareContext({}), {});
    expect(root.textContent.replace(/\s+/g, " ")).toMatch(/Progress\s*10 \/ 10 boxes \(dangerous, bonded\)/);
  });
});
