/**
 * Probe UI-04 — PANEL-TEXT-UNESCAPED (WRONG-DETAIL)
 *
 * What the user does: opens the Entities panel (every user's toolbar) on a
 * world where an NPC card's name or a record field holds angle brackets or
 * markup — an Actor renamed in the sidebar, a narrator-detected name, a role
 * or goal the narrator wrote — or the Companion Settings Safety tab, where the
 * GM's Lines and Veils are listed for every player.
 *
 * What happens: the Entities list row puts `entity.name` raw into an `alt`
 * attribute and the row text, and the row subtitle (role · goal, type · status,
 * …) raw into innerHTML (entityPanel.js:331-337, 340-352); the detail view's
 * field values go in raw too (`<dd class="detail-value">${val}</dd>`,
 * entityPanel.js:520). The detail header escapes the same name
 * (`escapeHtml(entity.name)`, :552), so one name renders two ways. The Safety
 * tab renders each Line / Veil / Private Line raw
 * (`<span class="safety-item-text">${item}</span>`, settingsPanel.js:1077).
 * "Kade <the Ghost>" lists as "Kade "; a Line "No graphic <gore>" lists as
 * "No graphic "; an `<img onerror>` name runs script in the viewer's client.
 *
 * What should happen: text is escaped where it is put into HTML, as the detail
 * header, the tier rows and the history list already do.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";

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

describe("UI-04 entity and safety text renders as text", () => {
  it("the Entities list row shows the NPC's name and subtitle whole", async () => {
    addNpc({ id: "npc-1", name: "Kade <the Ghost>", role: "Fixer <retired>", goal: "Pay off a debt" });
    const { EntityPanelApp } = await import("../../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});

    const row = root.querySelector(".entity-row");
    // FAILS today: "Kade " and "Fixer  · Pay off a debt" — the bracketed text is parsed as tags.
    expect({
      name: row.querySelector(".entity-row-name").textContent,
      subtitle: row.querySelector(".entity-row-subtitle").textContent,
    }).toEqual({ name: "Kade <the Ghost>", subtitle: "Fixer <retired> · Pay off a debt" });
  });

  it("the Entities list row injects no element from a name", async () => {
    addNpc({ id: "npc-2", name: '<img src=x onerror="alert(1)">Vex', role: "", goal: "" });
    const { EntityPanelApp } = await import("../../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    // FAILS today: the name's <img onerror> is a live element in the list.
    expect(root.querySelector(".entity-row-name").querySelectorAll("img").length).toBe(0);
  });

  it("the detail view's field values show whole (the header beside them already escapes)", async () => {
    addNpc({ id: "npc-3", name: "Kade <the Ghost>", role: "Fixer <retired>", goal: "Pay off a debt" });
    const { EntityPanelApp } = await import("../../../src/ui/entityPanel.js");
    const app = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(
      Object.assign(app, { render() {} }), {}, { dataset: { journalId: "npc-3" } });
    const root = await app._renderHTML(await app._prepareContext({}), {});
    const role = [...root.querySelectorAll(".detail-field")]
      .find(f => f.querySelector(".detail-label").textContent === "Role");
    expect(root.querySelector(".detail-name").textContent).toBe("Kade <the Ghost>");   // control: escaped
    // FAILS today: "Fixer ".
    expect(role.querySelector(".detail-value").textContent).toBe("Fixer <retired>");
  });

  it("the Safety tab lists a GM Line whole", async () => {
    const { SettingsPanelApp, registerSettings } = await import("../../../src/ui/settingsPanel.js");
    registerSettings();
    game.settings._store.set(`${MODULE_ID}.globalSafetyLines`, ["No graphic <gore> on screen"]);
    const panel = new SettingsPanelApp();
    const root = await panel._renderHTML(await panel._prepareContext({}), {});
    // FAILS today: "No graphic  on screen".
    expect(root.querySelector(".safety-item-text").textContent).toBe("No graphic <gore> on screen");
  });
});
