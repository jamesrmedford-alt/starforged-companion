/**
 * STARFORGED COMPANION
 * tests/unit/valueAddIntegrity.test.js
 *
 * VALUE-ADD-INTEGRITY (found while fixing issue #336 Y22). Y22 resolved an
 * add that names a value the module holds — "add +heart" from the roller's
 * sheet, "add +its health" from the companion asset's own track — but not the
 * Hoverbike's: "When you fire the bike's afterburner and make a move to
 * perform a risky maneuver, you may add +integrity and take +2 momentum on a
 * strong hit." The bike's integrity is its asset's own condition track, as a
 * companion's health is, yet the add stayed text — no number on the confirm
 * dialog, and nowhere to type one (issue #322 V02). It is resolved from the
 * asset's Integrity track now and offered as its number. The ability names no
 * move, so the scanner's Haiku pass finds it (stubbed here: it answers that
 * the bike's ability applies); its add counts for the move it was found for —
 * Y22's general-clause rule.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

// The Haiku fallback: every enabled ability in the prompt applies.
vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const prompt = String(body?.messages?.[0]?.content ?? "");
    const keys = [...prompt.matchAll(/key="([^"]+)"/g)].map(m => m[1]);
    return { content: [{ type: "text", text: JSON.stringify({ matches: keys.map(key => ({ key, summary: "afterburner", statReplacement: null })) }) }] };
  }),
}));

import { scanForApplicableAbilities, extractAdds } from "../../src/moves/abilityScanner.js";
import { StubElement } from "../helpers/cardDom.js";

// The vendored texts (HTML stripped, links kept — collectEnabledAbilities' form).
const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
const HOVERBIKE = "When you fire the bike's afterburner and make a move to perform a risky maneuver, you may add +integrity and take +2 momentum on a strong hit. If you do, count a weak hit as a miss.";
const TECH      = `When you ${link("Withstand Damage")} and score a miss, you may attempt to reroute power or reboot critical systems. If you do, first ${link("Lose Momentum")} (-2). Then, reroll all dice, add +wits instead of +integrity, and count a weak hit as a miss.`;

let n = 0;
function kira({ assetName = "Hoverbike", category = "Support Vehicle", text = HOVERBIKE, track = { enabled: true, name: "Integrity", value: 3, max: 3, min: 0 } } = {}) {
  const item = { id: "a1", name: assetName, type: "asset",
    system: { category, abilities: [{ enabled: true, description: `<p>${text}</p>` }], ...(track ? { track } : {}) } };
  // A distinct id each time: readCharacterSnapshot caches by actor id.
  return { id: `pc-kira-${++n}`, name: "Kira", type: "character",
    system: { edge: 2, heart: 1, iron: 1, shadow: 1, wits: 2 },
    items: { contents: [item], get: (id) => (id === item.id ? item : undefined) } };
}
const scan = (actor, moveId = "face_danger", moveName = "Face Danger") =>
  scanForApplicableAbilities({ moveId, moveName, narration: "I punch the afterburner and thread the canyon.", apiKey: "sk-test", commandShipActor: null, characterActor: actor });

describe("the Hoverbike's 'add +integrity' is the bike's integrity (VALUE-ADD-INTEGRITY)", () => {
  it("offered as its number, from the asset's own track (3)", async () => {
    const offers = await scan(kira());
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ assetName: "Hoverbike", adds: 3, addsFrom: "integrity", detection: "haiku" });
  });

  it("a damaged bike adds what it has left; a wrecked one adds nothing", async () => {
    expect((await scan(kira({ track: { enabled: true, name: "Integrity", value: 1, max: 3, min: 0 } })))[0].adds).toBe(1);
    expect((await scan(kira({ track: { enabled: true, name: "Integrity", value: 0, max: 3, min: 0 } })))[0].adds).toBe(0);
  });

  it("for the move it was found for — any risky maneuver (the ability names no move)", async () => {
    expect((await scan(kira(), "react_under_fire", "React Under Fire"))[0].adds).toBe(3);
    expect((await scan(kira(), "undertake_an_expedition", "Undertake an Expedition"))[0].adds).toBe(3);
  });

  it("control: an asset with no Integrity track holds no integrity to add", async () => {
    expect((await scan(kira({ track: { enabled: true, name: "Health", value: 3, max: 3, min: 0 } })))[0].adds).toBe(0);
    expect((await scan(kira({ track: { enabled: false, name: "Integrity", value: 3, max: 3, min: 0 } })))[0].adds).toBe(0);
  });

  it("control: Tech's 'add +wits instead of +integrity' swaps a stat on a reroll — no add (Y22)", async () => {
    expect((await scan(kira({ assetName: "Tech", category: "Path", text: TECH, track: null }), "withstand_damage", "Withstand Damage"))
      .map(a => a.adds)).toEqual([0]);
  });

  it("extractAdds reads '+integrity' from the values it is given — none given, no add", () => {
    expect(extractAdds(HOVERBIKE, "Face Danger")).toBe(0);
    expect(extractAdds(HOVERBIKE, "Face Danger", { ownIntegrity: 2 })).toBe(2);
  });
});

describe("the confirm dialog shows the bike's number and says what it is", () => {
  let MoveConfirmDialog, registerSettings;
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

  it("a '+3 (integrity)' row whose add the roll takes", async () => {
    const applicableAbilities = await scan(kira());
    void MoveConfirmDialog.prompt({ moveId: "face_danger", statUsed: "edge", rationale: "", applicableAbilities });
    const dialog = MoveConfirmDialog.pending;
    const root = await dialog._renderHTML(await dialog._prepareContext({}), {});
    const cb = root.querySelector(".sf-applicable-ability-cb");
    expect(cb.getAttribute("data-adds")).toBe("3");
    expect(root.querySelector(".sf-ability-adds").textContent).toContain("+3 (integrity)");
    dialog.close();
  });
});
