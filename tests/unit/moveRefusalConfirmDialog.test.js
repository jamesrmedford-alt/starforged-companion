/**
 * STARFORGED COMPANION
 * tests/unit/moveRefusalConfirmDialog.test.js
 *
 * Overhaul 4, "moves as contracts" (D2) — a soft refusal (the sheet says the
 * move would change nothing: a Heal with nothing to heal) of a forced move or
 * a roll that was asked for reaches the GM's confirm dialog with its reason;
 * the GM's Accept rolls it anyway — the roll's gate passes it (`gateOverride`)
 * and the move card says so. The real MoveConfirmDialog (ui/settingsPanel.js).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

let MoveConfirmDialog, registerSettings;
const SOFT = { moveId: "heal", code: "recoverable-health", hard: false, why: "nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked",
  premise: { claim: "a wound to treat", never: null }, offer: null };

beforeAll(async () => {
  ({ MoveConfirmDialog, registerSettings } = await import("../../src/ui/settingsPanel.js"));
});
beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set("starforged-companion.campaignState", {});
  registerSettings();
});
afterEach(() => {
  delete globalThis.document;
  game.settings._store.delete("starforged-companion.campaignState");
});

async function open(interpretation) {
  const answer = MoveConfirmDialog.prompt(interpretation, { forced: true });
  const dialog = MoveConfirmDialog.pending;
  const root = await dialog._renderHTML(await dialog._prepareContext({}), {});
  return { answer, dialog, root };
}

describe("the confirm dialog shows a soft refusal, and its Accept is the GM's word", () => {
  it("shows what the sheet says, in the card's words", async () => {
    const { dialog, root } = await open({ moveId: "heal", statUsed: "iron", rationale: "", softRefusal: SOFT });
    expect(root.querySelector(".confirm-cannot-make-text").textContent)
      .toBe("No Heal — nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked.");
    expect(root.querySelector(".confirm-cannot-make").textContent).toMatch(/Accept rolls it anyway, at the GM's word/);
    dialog.close();
  });

  it("Accept rolls it at the GM's word: the interpretation carries the override the roll's gate passes", async () => {
    const interpretation = { moveId: "heal", statUsed: "iron", rationale: "", softRefusal: SOFT };
    const { answer, dialog } = await open(interpretation);
    await MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog);
    expect(await answer).toBe(true);
    expect(interpretation.gateOverride).toBe(true);
  });

  it("control: no refusal — nothing shown, and Accept overrides nothing", async () => {
    const interpretation = { moveId: "heal", statUsed: "iron", rationale: "" };
    const { answer, dialog, root } = await open(interpretation);
    expect(root.querySelector(".confirm-cannot-make")).toBeNull();
    await MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog);
    expect(await answer).toBe(true);
    expect(interpretation.gateOverride).toBeUndefined();
  });

  it("Cancel rolls nothing and overrides nothing", async () => {
    const interpretation = { moveId: "heal", statUsed: "iron", rationale: "", softRefusal: SOFT };
    const { answer, dialog } = await open(interpretation);
    await MoveConfirmDialog.DEFAULT_OPTIONS.actions.reject.call(dialog);
    expect(await answer).toBe(false);
    expect(interpretation.gateOverride).toBeUndefined();
  });
});
