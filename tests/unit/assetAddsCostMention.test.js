/**
 * STARFORGED COMPANION
 * tests/unit/assetAddsCostMention.test.js
 *
 * Issue #329 X04 (ASSET-ADD-ON-COST-MENTION) — an ability adds nothing to a
 * move it names only as a cost, and an outcome's add is for later moves.
 *
 * A Firebrand rolls Endure Harm (a Haunted PC Endure Stress, an Augmented PC
 * Repair). structuredMatches treated every `@Compendium{Move}` mention as
 * "keyed to this move", but these texts name the move only as a COST of
 * another trigger ("take +2 fire but Endure Harm (-2)", "also Endure Stress
 * (-1)", "you must Repair"), and extractAdds took the general trigger's add:
 * the confirm dialog offered +2 / +1 / +1 PRE-CHECKED. Scavenger's "On a hit,
 * you may add +1 when making a move aided by the item" was offered on the
 * Secure an Advantage itself, and Service Pod's "Careful: Add +2 and Lose
 * Momentum (-1)" was missed on Face Danger. Now a cost mention keys nothing,
 * an outcome sentence's add is not the trigger move's, and a cost mention
 * does not make a sentence another move's. A "must" in a trigger's own
 * condition ("When you must Endure Harm, …") still names the trigger.
 *
 * The sweep reads the vendored assets, so it covers every ability.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/rules/assetAddsCostMention.probe.js.)
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAdds, scanForApplicableAbilities, structuredMatches } from "../../src/moves/abilityScanner.js";
import { moveRollKind, toMoveId } from "../../src/schemas.js";

const DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const LINK = /@Compendium\[[^\]]*\]\{([^}]+)\}/g;

/**
 * Every vendored asset: { name, category, abilities: [{ text (links kept), enabled }] }.
 * None without the vendored data — the suite below is then skipped, and its
 * body (which describe.skipIf still collects) must not read a missing folder.
 */
function loadAssets() {
  if (!HAVE_VENDOR) return [];
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

describe.skipIf(!HAVE_VENDOR)("issue #329 X04 — an ability adds nothing to a move it names only as a cost", () => {
  const byName = Object.fromEntries(loadAssets().map(a => [a.name, a]));
  const text = (asset, i) => byName[asset].abilities[i].text;

  it("control: a suffer move named as the trigger keeps its add (Glowcat, Gunner); Reinforced Hull, Workshop", async () => {
    expect(await offered("Glowcat", text("Glowcat", 2), "Endure Stress")).toBe(1);
    expect(await offered("Gunner",  text("Gunner", 2),  "Endure Stress")).toBe(1);
    expect(await offered("Reinforced Hull", text("Reinforced Hull", 0), "Withstand Damage")).toBe(1);
    expect(await offered("Workshop", text("Workshop", 0), "Repair")).toBe(1);
  });

  it("Firebrand on Endure Harm, Haunted on Endure Stress, Augmented on Repair: no add is offered", async () => {
    expect(await offered("Firebrand", text("Firebrand", 0), "Endure Harm"),  "Firebrand +2 is for attack moves").toBe(0);
    expect(await offered("Haunted",   text("Haunted", 0),   "Endure Stress"), "Haunted +1 is for the insight move").toBe(0);
    expect(await offered("Augmented", text("Augmented", 0), "Repair"),        "Augmented +1 is for moves aided by the augment").toBe(0);
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
    expect(extractAdds(text("Scavenger", 1), "Secure an Advantage"), "'On a hit, you may add +1 when making a move aided by the item' is for later moves").toBe(0);
    expect(extractAdds(text("Service Pod", 1), "Face Danger"), "'Careful: Add +2 and Lose Momentum (-1)' is this move's add").toBe(2);
  });

  it("…and reaches a later move the ability aids: Scavenger's item on a Strike, Vanguard's haven on a Sojourn", () => {
    expect(extractAdds(text("Scavenger", 1), "Strike")).toBe(1);
    expect(extractAdds(text("Vanguard", 0), "Sojourn")).toBe(2);
  });

  it("a 'must' in a trigger's own condition names the trigger: Armored, Augmented and Ace on the move they answer", async () => {
    const keyed = (asset, i, moveName) => structuredMatches([{ text: text(asset, i) }], moveName).length;
    expect(keyed("Armored", 2, "Endure Harm")).toBe(1);   // "When you must Endure Harm, you may instead let your armor take the hit"
    expect(keyed("Augmented", 2, "Endure Harm")).toBe(1); // "When you must Endure Harm or Face Death, you may instead …"
    expect(keyed("Ace", 2, "Endure Stress")).toBe(1);     // "When you must Endure Stress while piloting a vehicle, you may roll +integrity"
    expect(keyed("Armored", 2, "Repair")).toBe(0);        // "…your armor is now broken; you must Repair and spend 5 repair points"
  });
});
