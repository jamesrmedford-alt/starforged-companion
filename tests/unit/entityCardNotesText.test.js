// tests/unit/entityCardNotesText.test.js
// An entity card carries an Actor's Notes as text (issue #326 W39). A ship's
// (and an NPC's) Notes tab is HTML — the art pipeline's embedded portrait
// block, the `<hr><h4>✦ Envisioned details — …</h4>` sections !ship envision
// appends — and appendNotesSection writes that HTML into the ship record
// through updateShip. formatEntityCard printed the record's `notes`
// verbatim into ENTITIES IN SCENE: the narrator was handed `<img src=…>`, the
// portrait's path and the markup (the CHARACTER block strips its notes).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "") };
});

import { buildNarratorExtras } from "../../src/narration/narrator.js";
import { formatEntityCard } from "../../src/narration/narratorPrompt.js";
import { appendNotesSection } from "../../src/entities/shipEnvision.js";

const MODULE_ID = "starforged-companion";
const PORTRAIT = '<div class="sf-ship-portrait" style="text-align:center;margin-bottom:0.5em;"><img src="worlds/w/starforged-companion/art/ship-abc.webp" style="max-width:100%"></div>';

describe("a ship's entity card is text, not its Notes HTML (issue #326 W39)", () => {
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
    global.game.messages = { contents: [] };
    const ship = makeTestActor({
      id: "ship-1", type: "starship", name: "Wayfarer", ownership: { default: 3 },
      system: { notes: `${PORTRAIT}<p>A battered courier with a patched dorsal fin.</p>` },
      flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfarer", type: "Courier", isCommandVehicle: true, notes: "" } } },
    });
    game.actors._set("ship-1", ship);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1", shipIds: ["ship-1"] });
  });

  it("after !ship envision, ENTITIES IN SCENE carries no HTML markup or image path", async () => {
    // The production writer of the ship's notes — its Notes tab (issue #329
    // X12; the record keeps no copy since NOTES-PROMOTED-BEFORE).
    await appendNotesSection(game.actors.get("ship-1"), "Envisioned details", "<p>The galley smells of burnt coffee.</p>");
    expect(game.actors.get("ship-1").system.notes).toContain("<h4>");

    const extras = await buildNarratorExtras("paced_narrative", game.settings.get(MODULE_ID, "campaignState"), {
      playerNarration: "I climb back aboard the Wayfarer and seal the lock.",
    });
    const card = extras.entityCards.find(c => c.includes("WAYFARER"));
    expect(card).toBeDefined();
    expect(card).toContain("burnt coffee");          // control: the notes do reach the card
    expect(card).toContain("patched dorsal fin");
    expect(card).not.toMatch(/<\/?(?:div|img|p|hr|h4)\b/);
    expect(card).not.toContain("ship-abc.webp");
  });
});

describe("formatEntityCard — Notes as text (issue #326 W39)", () => {
  it("an NPC's Notes drop the portrait block and markup, decode entities, keep the prose on one line", () => {
    const card = formatEntityCard({
      name: "Vex",
      notes: `${PORTRAIT}<p>Smuggler &amp; fixer.</p><hr><h4>History</h4><ul><li>Owes the Covenant</li></ul>`,
    }, "connection");
    const line = card.split("\n").find(l => l.startsWith("  Notes:"));
    expect(line).toBe("  Notes: Smuggler & fixer. History Owes the Covenant");
  });

  it("prose in angle brackets is kept as text — only HTML tags are dropped", () => {
    const card = formatEntityCard({ name: "Relay Nine", notes: "<p>Its last log reads <signal lost>.</p>" }, "location");
    expect(card).toContain("Notes: Its last log reads <signal lost>.");
  });

  it("control: plain-text notes are shown as written; notes that are only a portrait are left out", () => {
    expect(formatEntityCard({ name: "Kestrel", notes: "Fast and loud." }, "ship")).toContain("  Notes: Fast and loud.");
    expect(formatEntityCard({ name: "Kestrel", notes: PORTRAIT }, "ship")).not.toContain("Notes:");
  });
});
