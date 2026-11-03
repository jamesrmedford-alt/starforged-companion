/**
 * Names and labels are text in the Entities panel and the Safety tab (issue
 * #325 W26). The Entities list row put `entity.name` raw into an `alt` and the
 * row text and the role · goal subtitle raw into innerHTML; the detail view's
 * field values were raw (the header beside them escapes); the Safety tab
 * listed each Line / Veil / Private Line raw. "Kade <the Ghost>" rendered as
 * "Kade ", and a name holding an element ran it in every client that opened
 * the panel — the GM's included, where the client-scoped keys live.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  game.actors._reset();
});

afterEach(() => {
  delete globalThis.document;
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  game.settings._store.delete(`${MODULE_ID}.globalSafetyLines`);
});

function addNpc({ id, name, role, goal }) {
  game.actors._set(id, makeTestActor({
    id, name,
    flags: { [MODULE_ID]: { entityType: "connection", connection: { name, role, goal } } },
  }));
}

describe("entity and safety text renders as text", () => {
  it("the Entities list row shows the NPC's name and subtitle whole", async () => {
    addNpc({ id: "npc-1", name: "Kade <the Ghost>", role: "Fixer <retired>", goal: "Pay off a debt" });
    const { EntityPanelApp } = await import("../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});

    const row = root.querySelector(".entity-row");
    expect({
      name: row.querySelector(".entity-row-name").textContent,
      subtitle: row.querySelector(".entity-row-subtitle").textContent,
    }).toEqual({ name: "Kade <the Ghost>", subtitle: "Fixer <retired> · Pay off a debt" });
  });

  it("the Entities list row injects no element from a name", async () => {
    addNpc({ id: "npc-2", name: '<img src=x onerror="alert(1)">Vex', role: "", goal: "" });
    const { EntityPanelApp } = await import("../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    expect(root.querySelector(".entity-row-name").querySelectorAll("img").length).toBe(0);
  });

  it("the detail view's field values show whole (the header beside them already escapes)", async () => {
    addNpc({ id: "npc-3", name: "Kade <the Ghost>", role: "Fixer <retired>", goal: "Pay off a debt" });
    const { EntityPanelApp } = await import("../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(
      Object.assign(app, { render() {} }), {}, { dataset: { journalId: "npc-3" } });
    const root = await app._renderHTML(await app._prepareContext({}), {});
    const role = [...root.querySelectorAll(".detail-field")]
      .find(f => f.querySelector(".detail-label").textContent === "Role");
    expect(root.querySelector(".detail-name").textContent).toBe("Kade <the Ghost>");   // control: escaped
    expect(role.querySelector(".detail-value").textContent).toBe("Fixer <retired>");
  });

  it("the Safety tab lists a GM Line whole", async () => {
    const { SettingsPanelApp, registerSettings } = await import("../../src/ui/settingsPanel.js");
    registerSettings();
    game.settings._store.set(`${MODULE_ID}.globalSafetyLines`, ["No graphic <gore> on screen"]);
    const panel = new SettingsPanelApp();
    const root = await panel._renderHTML(await panel._prepareContext({}), {});
    expect(root.querySelector(".safety-item-text").textContent).toBe("No graphic <gore> on screen");
  });
});
