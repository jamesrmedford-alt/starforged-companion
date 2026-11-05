/**
 * PROBE — UPGRADES-03 SUFFER-CARD-ITEM-NAME-UNESCAPED (tenth audit, area upgrades)
 *
 * What the user does: a player renames their Companion asset on their own
 * sheet (an embedded Item they own) — a name with markup in it, a typo'd
 * "<3", or on purpose. Later a miss Pays the Price and the d100 lands "A
 * friend, companion, or ally is in harm's way" (51–56), whose route runs
 * companionTakesAHit for that asset (src/index.js dispatchPayThePriceSufferRoute
 * finds the Companion by category).
 *
 * What happens: the executor's card body is
 *   `${item.name}: ${before} → ${after}`      (src/moves/sufferExecutor.js:643)
 * — the Item's name goes into the GM-posted card's HTML raw. Markup in the
 * name renders as markup on every client (an `<img onerror>` runs); a "<3"
 * swallows the rest of the line. withstandDamage's card (:703) is the same
 * shape (reachable once SUFFER-EXECUTOR-ASSET-SCHEMA's missing item id is
 * fixed). Every other name the executors print is escaped
 * (crewUnpreparedNote, repair.js, the choice card's labels); the ninth audit
 * fixed the same sink on the site card (X45), the recap card (X24) and the
 * portrait alt (X57).
 *
 * What should happen: the name is shown as text — escaped, as
 * crewUnpreparedNote escapes the allies' names.
 *
 * Control: crewUnpreparedNote escapes a crewmate's name.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/sufferCardCompanionNameUnescaped.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { companionTakesAHit, withstandDamage, crewUnpreparedNote } from "../../../src/moves/sufferExecutor.js";

const MODULE_ID = "starforged-companion";
const NAME = 'Rover <img src=x onerror="alert(1)">';

function asset(id, category) {
  const item = { id, name: NAME, type: "asset", system: { category, condition: { value: 3 } },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.condition.value") item.system.condition.value = v; return item; } };
  return item;
}

let pc;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  pc = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    items: { contents: [asset("comp-1", "Companion"), asset("veh-1", "Vehicle")] } });
  game.actors._set(pc.id, pc);
});

const lastCard = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sufferCard).at(-1);

describe("UPGRADES-03 the companion's and the vehicle's names reach the suffer card raw", () => {
  it("Companion Takes a Hit shows the asset's name as text", async () => {
    const res = await companionTakesAHit(pc, "comp-1", 1, {});
    expect(res).toMatchObject({ before: 3, after: 2 });
    const content = lastCard().content;
    // Expected: "Rover &lt;img …" — Actual: the <img> tag is in the card's HTML.
    expect(content).not.toContain("<img");
    expect(content).toContain("Rover &lt;img");
  });

  it("same shape: Withstand Damage shows the vehicle's name as text", async () => {
    await withstandDamage(pc, "veh-1", 1, {});
    const content = lastCard().content;
    expect(content).not.toContain("<img");
    expect(content).toContain("Rover &lt;img");
  });

  it("control: the crew line escapes a crewmate's name", () => {
    const line = crewUnpreparedNote({ alliesMarked: [NAME] });
    expect(line).not.toContain("<img");
    expect(line).toContain("Rover &lt;img");
  });
});
