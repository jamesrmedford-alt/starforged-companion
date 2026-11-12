/**
 * The suffer cards show a companion's or vehicle's name as text
 * (issue #336 Y28, CARD-NAME-UNESCAPED).
 *
 * A player renames their Companion asset on their own sheet (an embedded Item
 * they own) — a name with markup, a typo'd "<3", or on purpose. A miss's Pay
 * the Price lands 51–56 "A friend, companion, or ally is in harm's way", and
 * companionTakesAHit's card body was `${item.name}: ${before} → ${after}`: the
 * Item's name went into the GM-posted card's HTML raw, rendering as markup on
 * every client (an `<img onerror>` runs). withstandDamage's card is the same
 * shape. Every other name the executors print is escaped (crewUnpreparedNote,
 * repair.js, the choice card's labels).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { companionTakesAHit, withstandDamage, crewUnpreparedNote } from "../../src/moves/sufferExecutor.js";

const MODULE_ID = "starforged-companion";
const NAME = 'Rover <img src=x onerror="alert(1)">';

// The vendor's asset: its condition track (`system.track`) — a companion's
// health, a support vehicle's Integrity (SUFFER-EXECUTOR-ASSET-SCHEMA).
function asset(id, category, trackName) {
  const item = { id, name: NAME, type: "asset",
    system: { category, track: { enabled: true, name: trackName, value: 3, min: 0, max: 5 }, conditions: [] },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.track.value") item.system.track.value = v; return item; } };
  return item;
}

let pc;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  pc = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    items: { contents: [asset("comp-1", "Companion", "Health"), asset("veh-1", "Support Vehicle", "Integrity")] } });
  game.actors._set(pc.id, pc);
});

const lastCard = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sufferCard).at(-1);

describe("the companion's and the vehicle's names on the suffer card", () => {
  it("Companion Takes a Hit shows the asset's name as text", async () => {
    const res = await companionTakesAHit(pc, "comp-1", 1, {});
    expect(res).toMatchObject({ before: 3, after: 2 });
    const content = lastCard().content;
    // The <img> tag was in the card's HTML.
    expect(content).not.toContain("<img");
    expect(content).toContain("Rover &lt;img");
    expect(content).toContain(": 3 → 2");
  });

  it("Withstand Damage shows the vehicle's name as text", async () => {
    await withstandDamage(pc, "veh-1", 1, {});
    const content = lastCard().content;
    expect(content).not.toContain("<img");
    expect(content).toContain("Rover &lt;img");
    expect(content).toContain(": 3 → 2");
  });

  it("control: the crew line escapes a crewmate's name", () => {
    const line = crewUnpreparedNote({ alliesMarked: [NAME] });
    expect(line).not.toContain("<img");
    expect(line).toContain("Rover &lt;img");
  });
});
