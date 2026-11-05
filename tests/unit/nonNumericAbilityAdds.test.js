/**
 * STARFORGED COMPANION
 * tests/unit/nonNumericAbilityAdds.test.js
 *
 * Issue #336 Y22 (NON-NUMERIC-ABILITY-ADDS-LOST). Kira (heart 2) has the
 * Bonded deed — "When you Set a Course back to your bond-mate's location, add
 * +heart" — and Sets a Course home; her Glowcat (health 3): "When you Secure
 * an Advantage by studying the glowcat's reactions …, add +its health." The
 * scanner keyed both abilities to the move but read numeric adds only, so
 * each surfaced unchecked with no add and the roll was made without the
 * bonus — with nowhere to type it (issue #322 V02 rejected a manual adds
 * input "because it asks the player to remember a bonus the module already
 * holds"). The add is now resolved from the sheet: "+<stat>" from the roller's
 * snapshot, "+its health" from the ability's own companion asset; "+cargo" and
 * "add that amount" stay text.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { scanForApplicableAbilities, extractAdds } from "../../src/moves/abilityScanner.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { StubElement } from "../helpers/cardDom.js";

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
// The vendored texts (HTML stripped, links kept — collectEnabledAbilities' form).
const TEXT = {
  bonded:      `When you ${link("Set a Course")} back to your bond-mate's location, add +heart. On a strong hit with a match, envision a special reunion and mark two ticks on your bonds legacy track.`,
  glowcat:     `Your glowcat companion perceives the inner emotions and intentions of people and creatures in its vicinity, and embodies those impressions through the colors and intensity of its luminescent fur. When you ${link("Secure an Advantage")} by studying the glowcat’s reactions in a charged interaction, add +its health.`,
  sprite1:     `You are attuned to the resonance of the sprite's crystalline structure, and can communicate with it at a distance and perceive through its senses. When you ${link("Secure an Advantage")} by observing a situation from its perspective, or remotely ${link("Gather Information")}, add +its health.`,
  symbiote:    `You are physically bound to a being with 2 health. When you make aggressive moves while giving yourself to the symbiote's power, add +its health. If you face physical harm, choose either the ${link("Endure Harm")} or ${link("Companion Takes a Hit")} move. To restore the symbiote's health, you must ${link("Endure Stress")} and give the symbiote +health equal to the -spirit you face.`,
  tech1:       `When you ${link("Withstand Damage")} and score a miss, you may attempt to reroute power or reboot critical systems. If you do, first ${link("Lose Momentum")} (-2). Then, reroll all dice, add +wits instead of +integrity, and count a weak hit as a miss.`,
  expanded:    `Your vehicle carries up to 3 cargo. When you gain +supply, you may convert it to +cargo. When you make a move +supply, you may add +cargo. When you ${link("Sacrifice Resources")}, you may instead suffer -cargo for any portion of the cost.`,
  sniper2:     `When you ${link("Secure an Advantage")} by studying a distant situation through your rifle scope, or ${link("Gain Ground")} by taking careful aim, you may sacrifice time for greater certainty. If you do (decide before rolling), ${link("Lose Momentum")} (-1, -2, or -3) and add that amount. Then, take +1 momentum on a strong hit.`,
  blademaster: `When you ${link("Clash")} or ${link("Strike")} in close quarters, add +1. On a strong hit with a match, you are unstoppable; mark progress.`,
  shuttle:     `When you ${link("Face Danger")} or ${link("React Under Fire")} to navigate through hazardous skies, avoid obstacles, or evade an attack, add +1 and take +1 momentum on a hit.`,
};

let n = 0;
function kira({ assetName, category, text, track = null }) {
  const item = { id: "a1", name: assetName, type: "asset",
    system: { category, abilities: [{ enabled: true, description: `<p>${text}</p>` }], ...(track ? { track } : {}) } };
  // A distinct id each time: readCharacterSnapshot caches by actor id.
  return { id: `pc-kira-${++n}`, name: "Kira", type: "character",
    system: { edge: 1, heart: 2, iron: 1, shadow: 1, wits: 2 },
    items: { contents: [item], get: (id) => (id === item.id ? item : undefined) } };
}

async function scan(actor, moveId, moveName) {
  return scanForApplicableAbilities({ moveId, moveName, narration: "test", apiKey: "", commandShipActor: null, characterActor: actor });
}
const adds = async (actor, moveId, moveName) => (await scan(actor, moveId, moveName)).map(a => a.adds);

describe("an ability's add the module holds is offered as its number (issue #336 Y22)", () => {
  it("Bonded's 'add +heart' on Set a Course is the roller's heart (2)", async () => {
    const offers = await scan(kira({ assetName: "Bonded", category: "Deed", text: TEXT.bonded }), "set_a_course", "Set a Course");
    expect(offers.map(a => a.adds)).toEqual([2]);
    expect(offers[0].addsFrom).toBe("heart");
  });

  it("the roller's heart, read as it stands now — not a stale snapshot", async () => {
    const actor = kira({ assetName: "Bonded", category: "Deed", text: TEXT.bonded });
    expect(await adds(actor, "set_a_course", "Set a Course")).toEqual([2]);
    actor.system.heart = 3;
    invalidateActorCache(actor.id);              // the updateActor hook's invalidation
    expect(await adds(actor, "set_a_course", "Set a Course")).toEqual([3]);
  });

  it("Glowcat's 'add +its health' on Secure an Advantage is the companion's health (3)", async () => {
    const actor = kira({ assetName: "Glowcat", category: "Companion", text: TEXT.glowcat, track: { value: 3, max: 3, min: 0 } });
    const offers = await scan(actor, "secure_an_advantage", "Secure an Advantage");
    expect(offers.map(a => a.adds)).toEqual([3]);
    expect(offers[0].addsFrom).toBe("its health");
  });

  it("Sprite's '+its health' on Gather Information is the sprite's health; a hurt companion adds what it has left", async () => {
    expect(await adds(kira({ assetName: "Sprite", category: "Companion", text: TEXT.sprite1, track: { value: 2, max: 2, min: 0 } }),
      "gather_information", "Gather Information")).toEqual([2]);
    expect(await adds(kira({ assetName: "Sprite", category: "Companion", text: TEXT.sprite1, track: { value: 1, max: 2, min: 0 } }),
      "gather_information", "Gather Information")).toEqual([1]);
    // Out of action at 0 health: nothing to add.
    expect(await adds(kira({ assetName: "Sprite", category: "Companion", text: TEXT.sprite1, track: { value: 0, max: 2, min: 0 } }),
      "gather_information", "Gather Information")).toEqual([0]);
  });

  it("Symbiote's '+its health' is its aggressive moves' — not the Endure Harm its text names as a choice", async () => {
    const actor = kira({ assetName: "Symbiote", category: "Companion", text: TEXT.symbiote, track: { value: 2, max: 2, min: 0 } });
    expect(await adds(actor, "endure_harm", "Endure Harm")).toEqual([0]);
    // An aggressive move the fallback pass matched (the text names it nowhere) takes it.
    expect(extractAdds(TEXT.symbiote, "Strike", { ownHealth: 2 })).toBe(2);
  });

  it("'add +wits instead of +integrity' swaps a stat on a reroll — no add", async () => {
    expect(await adds(kira({ assetName: "Tech", category: "Path", text: TEXT.tech1 }), "withstand_damage", "Withstand Damage")).toEqual([0]);
  });

  it("'+cargo' and 'add that amount' stay text (no add)", async () => {
    expect(extractAdds(TEXT.expanded, "Check Your Gear", { stats: { heart: 2 }, ownHealth: 3 })).toBe(0);
    expect(await adds(kira({ assetName: "Sniper", category: "Path", text: TEXT.sniper2 }), "secure_an_advantage", "Secure an Advantage")).toEqual([0]);
  });

  it("control: with no values given, a value add is no add (extractAdds' old contract)", () => {
    expect(extractAdds(TEXT.bonded, "Set a Course")).toBe(0);
    expect(extractAdds(TEXT.glowcat, "Secure an Advantage")).toBe(0);
  });

  it("control: numeric adds are offered — Blademaster's Clash +1, Shuttle's Face Danger +1", async () => {
    const blade = await scan(kira({ assetName: "Blademaster", category: "Path", text: TEXT.blademaster }), "clash", "Clash");
    expect(blade.map(a => a.adds)).toEqual([1]);
    expect(blade[0].addsFrom ?? null).toBeNull();   // a number names no value
    expect(await adds(kira({ assetName: "Shuttle", category: "Support Vehicle", text: TEXT.shuttle }), "face_danger", "Face Danger")).toEqual([1]);
  });
});

describe("the confirm dialog offers the number, pre-checked, and says what it is (issue #336 Y22)", () => {
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

  it("Bonded's +heart is a checked '+2 (heart)' row whose add the roll takes", async () => {
    const applicableAbilities = await scan(kira({ assetName: "Bonded", category: "Deed", text: TEXT.bonded }), "set_a_course", "Set a Course");
    void MoveConfirmDialog.prompt({ moveId: "set_a_course", statUsed: "supply", rationale: "", applicableAbilities });
    const dialog = MoveConfirmDialog.pending;
    const root = await dialog._renderHTML(await dialog._prepareContext({}), {});
    const cb = root.querySelector(".sf-applicable-ability-cb");
    expect(cb.getAttribute("data-adds")).toBe("2");
    expect(cb.hasAttribute("checked")).toBe(true);
    expect(root.querySelector(".sf-ability-adds").textContent).toContain("+2 (heart)");
    // No adds input to type a bonus into (issue #322 V02).
    expect(root.querySelectorAll("input[type=number]").length).toBe(0);
    dialog.close();
  });
});
