/**
 * STARFORGED COMPANION
 * tests/unit/truthsCustomParse.test.js
 *
 * Saves of the system's World Truths dialog, parsed into
 * campaignState.worldTruths (recordSystemTruths), and the vow scene's Iron
 * truth line (buildVowSwearingUserMessage):
 *
 *   TRUTHS-CUSTOM-PARSE — a custom truth (the GM's own text, then the
 *     category's inspiration text, as vendor truth-category.vue writes it)
 *     reached the narrator as its first paragraph only; one left empty was
 *     read from the inspiration text ("Have you experienced any supernatural
 *     encounters?" as the Horrors truth); a dialog in another language keyed
 *     its truths by their own category names, so the vow scene's Iron truth
 *     was not found. A custom truth keeps every paragraph and drops the
 *     inspiration text; an empty one holds no truth; a save that holds every
 *     category is keyed by place (the dialog writes Datasworn's order).
 *   IRON-TRUTH-COLON — the truth line joined a title and its description with
 *     ": " after the title's full stop ("…to the Forge.: Many …").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { recordSystemTruths, getTruth } from "../../src/truths/generator.js";
import { TRUTH_CATEGORIES } from "../../src/truths/tables.js";
import { buildVowSwearingUserMessage } from "../../src/narration/narrator.js";

const MODULE_ID = "starforged-companion";
const truths = () => game.settings.get(MODULE_ID, "campaignState")?.worldTruths ?? {};

beforeEach(() => {
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1", worldTruths: {} });
});

describe("TRUTHS-CUSTOM-PARSE", () => {
  it("a custom truth of several paragraphs keeps them all, without the inspiration text", async () => {
    await recordSystemTruths("j1", `<h2>Horrors</h2>
<p>The dead walk the derelicts of the Rift.</p><p>The Soulbinders hunt them for coin, and sell what they find.</p><p>Have you experienced any supernatural encounters? If you specialize in battling undead or other horrors, you might be a Soulbinder.</p>`);
    const horrors = truths().horrors;
    expect(horrors.title).toBe("The dead walk the derelicts of the Rift.");
    expect(horrors.description).toBe("The Soulbinders hunt them for coin, and sell what they find.");
    expect(JSON.stringify(horrors)).not.toMatch(/supernatural encounters/);
  });

  it("a custom truth left empty — only the inspiration text — is no truth", async () => {
    await recordSystemTruths("j1", `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon? Why is this object meaningful to you?</p>

<h2>Horrors</h2>
<p>Have you experienced any supernatural encounters? If you specialize in battling undead or other horrors, you might be a Soulbinder.</p>`);
    expect(truths().iron?.title).toMatch(/^Iron vows are sworn/);
    expect(truths().horrors).toBeUndefined();
  });

  it("control: a one-paragraph truth with no inspiration text (a GM's edit) is kept", async () => {
    await recordSystemTruths("j1", "<h2>Exodus</h2><p>Ironhomes.</p>");
    expect(truths().exodus?.title).toBe("Ironhomes.");
  });

  it("a dialog in another language: a save of every category is keyed by place — the Iron truth is found", async () => {
    const foreign = TRUTH_CATEGORIES.map((id, i) =>
      `<h2>Kategorie ${i + 1}</h2>\n<p><strong>Wahrheit ${i + 1}.</strong></p>\n<p>Beschreibung ${id}.</p>`).join("\n\n");
    await recordSystemTruths("j1", foreign);
    expect(Object.keys(truths()).sort()).toEqual([...TRUTH_CATEGORIES].sort());
    const iron = getTruth(game.settings.get(MODULE_ID, "campaignState"), "iron");
    expect(iron?.title).toBe("Wahrheit 4.");
    expect(iron?.categoryName).toBe("Kategorie 4");
  });
});

describe("IRON-TRUTH-COLON", () => {
  it("a title that ends its sentence is followed by the description, not ': '", () => {
    const msg = buildVowSwearingUserMessage({ name: "Find the beacon" }, {
      title: "Iron vows are sworn upon the remnants of ships that carried our people to the Forge.",
      description: "Many of our outposts were built from the iron bones of the Exodus ships.",
    });
    expect(msg).toContain("to the Forge. Many of our outposts");
    expect(msg).not.toContain(".:");
  });

  it("control: a label-like title still takes ': '", () => {
    const msg = buildVowSwearingUserMessage({ name: "Find the beacon" }, { title: "Oath-blades", description: "Vows are sworn on a drawn blade." });
    expect(msg).toContain("Oath-blades: Vows are sworn on a drawn blade.");
  });
});
