/**
 * PROBE — RULES-01 ASSET-ADD-ON-COST-MENTION
 * (src/moves/abilityScanner.js structuredMatches:137-154 + extractAdds:427-439;
 *  shown pre-checked by src/ui/settingsPanel.js renderApplicableAbilitiesBlock:2300-2310)
 *
 * What the user does: a Firebrand rolls Endure Harm; a Haunted character rolls
 * Endure Stress; an Augmented character rolls Repair.
 *
 * What happens: structuredMatches treats every `@Compendium{Move}` mention in
 * an ability as "this ability is keyed to that move", but the vendored texts
 * name these moves only as a COST of some other trigger — Firebrand: "On a
 * miss, take +2 fire but Endure Harm (-2) … When you make moves aided by this
 * energy to attack or overcome obstacles, add +2 and suffer -1 fire"; Haunted:
 * "When you make a move to call upon their insight, add +1. On a weak hit,
 * also Endure Stress (-1)"; Augmented: "When you make a move directly aided by
 * the augment … add +1. On a miss with a match, the augment is broken; you
 * must Repair and spend 3 repair points". extractAdds then takes the add from
 * the general-trigger sentence, so the confirm dialog offers Firebrand "+2"
 * on Endure Harm, Haunted "+1" on Endure Stress and Augmented "+1" on Repair —
 * PRE-CHECKED (adds > 0 pre-checks the box), so the roll takes the add unless
 * the player notices. Scavenger's second ability names Secure an Advantage as
 * its trigger but its add is for LATER moves ("On a hit, you may add +1 when
 * making a move aided by the item"), and is offered on the Secure an Advantage
 * itself; Service Pod's "Careful: Add +2 and Lose Momentum (-1)" is missed
 * (0) for Face Danger because that sentence names Lose Momentum.
 *
 * What should happen: an ability adds what its text gives THE MOVE BEING MADE
 * (issue #325 W12, decisions.md "The move text, not a shortcut"): a move named
 * as a cost of another trigger gets no add; an add granted "On a hit … when
 * making a move aided by the item" is for later moves, not this one.
 *
 * Controls: Glowcat's "When you Endure Stress in the company of the glowcat,
 * add +1" and Gunner's "When you Enter the Fray or Endure Stress while
 * wielding it, add +1" name the suffer move as a trigger and keep their +1;
 * Reinforced Hull's Withstand Damage +1 and Workshop's Repair +1 stand.
 *
 * The sweep reads the vendored assets, so the probe IS the diff.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAdds, scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";
import { moveRollKind, toMoveId } from "../../../src/schemas.js";

const DIR = fileURLToPath(new URL("../../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const LINK = /@Compendium\[[^\]]*\]\{([^}]+)\}/g;

/** Every vendored asset: { name, category, abilities: [{ text (links kept), enabled }] }. */
function loadAssets() {
  return fs.readdirSync(DIR).sort().map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
    .filter(d => d.type === "asset")
    .map(d => ({ name: d.name, category: d.system.category,
      abilities: (d.system.abilities ?? []).map(ab => ({ text: strip(ab.description), enabled: !!ab.enabled })) }));
}

/** A link is a cost mention when it reads "<Move> (-N)" or "must/also <Move>". */
function costMentions(text) {
  const out = new Set();
  for (const m of text.matchAll(LINK)) {
    const after  = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/^\s*\(-\d/.test(after) || /\b(must|also)\s+$/.test(before)) out.add(m[1]);
  }
  return [...out];
}

/** A sentence that names the move as its trigger ("When you <Move> …, add +N"). */
function namedAsTrigger(text, moveName) {
  return text.split(/(?<=[.!?])\s+/).some(s => /^(when|if) you\b/i.test(s)
    && [...s.matchAll(LINK)].some(m => m[1] === moveName) && /\badds?\s+\+?\d/i.test(s));
}

const pc = (asset, text) => ({ id: "pc-1", name: "Kira",
  items: { contents: [{ id: `asset-${asset}`, name: asset, type: "asset",
    system: { category: "Path", abilities: [{ enabled: true, description: `<p>${text}</p>` }] } }] } });

async function offered(asset, text, moveName) {
  const found = await scanForApplicableAbilities({ moveId: toMoveId(moveName), moveName, narration: "test",
    characterActor: pc(asset, text), commandShipActor: null, apiKey: "" });
  return found.reduce((n, a) => n + (a.adds ?? 0), 0);
}

describe.skipIf(!HAVE_VENDOR)("RULES-01 an ability adds nothing to a move it names only as a cost", () => {
  const byName = Object.fromEntries(loadAssets().map(a => [a.name, a]));
  const text = (asset, i) => byName[asset].abilities[i].text;

  it("control: a suffer move named as the trigger keeps its add (Glowcat, Gunner); Reinforced Hull, Workshop", async () => {
    expect(await offered("Glowcat", text("Glowcat", 2), "Endure Stress")).toBe(1);
    expect(await offered("Gunner",  text("Gunner", 2),  "Endure Stress")).toBe(1);
    expect(await offered("Reinforced Hull", text("Reinforced Hull", 0), "Withstand Damage")).toBe(1);
    expect(await offered("Workshop", text("Workshop", 0), "Repair")).toBe(1);
  });

  it("Firebrand on Endure Harm, Haunted on Endure Stress, Augmented on Repair: no add is offered", async () => {
    expect.soft(await offered("Firebrand", text("Firebrand", 0), "Endure Harm"),  "Firebrand +2 is for attack moves").toBe(0);     // actual: 2
    expect.soft(await offered("Haunted",   text("Haunted", 0),   "Endure Stress"), "Haunted +1 is for the insight move").toBe(0); // actual: 1
    expect.soft(await offered("Augmented", text("Augmented", 0), "Repair"),        "Augmented +1 is for moves aided by the augment").toBe(0); // actual: 1
  });

  it("sweep: every vendored ability × every action move it names only as a cost offers 0", async () => {
    const problems = [];
    for (const asset of loadAssets()) {
      for (const ab of asset.abilities) {
        for (const moveName of costMentions(ab.text)) {
          const moveId = toMoveId(moveName);
          if (!moveId || moveRollKind(moveId) !== "action") continue;   // a no-roll move is never scanned
          if (namedAsTrigger(ab.text, moveName)) continue;               // a trigger elsewhere in the text keeps its add
          const adds = await offered(asset.name, ab.text, moveName);
          if (adds !== 0) problems.push(`${asset.name}: ${moveName} offered +${adds} — "${ab.text.replace(LINK, "[$1]").slice(0, 110)}…"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("an add granted for LATER moves is not this move's: Scavenger's Secure an Advantage; Service Pod's Careful +2 reaches Face Danger", () => {
    expect.soft(extractAdds(text("Scavenger", 1), "Secure an Advantage"), "'On a hit, you may add +1 when making a move aided by the item' is for later moves").toBe(0); // actual: 1
    expect.soft(extractAdds(text("Service Pod", 1), "Face Danger"), "'Careful: Add +2 and Lose Momentum (-1)' is this move's add").toBe(2);                          // actual: 0
  });
});
