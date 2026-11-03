/**
 * Heal's care lands on the patient the move names (issue #325 W04).
 *
 * Rule (vendored Heal text): "Provide care: Roll +wits … On a strong hit, the
 * care is helpful. If you (or the ally under your care) are wounded, clear the
 * impact and take or give +2 health. Otherwise, take or give +3 health." On a
 * weak hit, "as above, but the recovery costs extra time or resources" — the
 * healer's Lose Momentum or Sacrifice Resources.
 *
 * The recovery card belonged to the ROLLER: persistResolution posted it for
 * the speaker's actor with no patient, its `requires` read the roller's
 * impacts, and the pick wrote the roller. "I patch up Kira's wounds" (Kira
 * wounded at 1) offered "Take/give +3 health", which healed the healer. The
 * patient is now resolved before the dice (statEnrichment.js
 * resolveHealPatient), carried on the card (`patientActorId`), checked by the
 * card's "wounded" options and healed by the pick; a weak hit's cost stays the
 * roller's.
 *
 * Driven end to end on a booted table (interpretation and dice scripted at
 * their boundaries); Ash's player clicks the GM's choice card.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { parseHTML } from "../helpers/cardDom.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { resolveHealPatient } from "../../src/moves/statEnrichment.js";
import { isOptionAvailable } from "../../src/moves/sufferDialog.js";

let table, ash, kira;
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; die 6 — wits 2 → 8: a strong hit

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  ash  = table.addActor({ id: "pc-ash",  name: "Ash",  ownership: { "pl-1": 3 }, system: { wits: 2 } });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-2": 3 },
    system: { health: { value: 1 }, debility: { wounded: true } } });
  scriptClaude(table, { fallback: () => 'The stitches hold.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function ashHealsKira() {
  control.interpretation = { moveId: "heal", moveName: "Heal", statUsed: "wits", adds: 0, moveTarget: "Kira",
    rationale: "Ash provides care to Kira", mischiefApplied: false };
  control.dice = STRONG;
  await table.client("pl-1").chat("I patch up Kira's wounds.", { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

const WEAK = [0.25, 0.75, 0.6];    // challenge 3, 8; die 4 — wits 2 → 6: a weak hit

async function ashHeals(text, interpretation = {}, dice = STRONG) {
  control.interpretation = { moveId: "heal", moveName: "Heal", statUsed: "wits", adds: 0, moveTarget: null,
    rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client("pl-1").chat(text, { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

async function pick(card, index) {
  await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}

describe("Heal on an ally heals the ally (issue #325 W04)", () => {
  it("control: Ash's strong-hit Heal posts the recovery choice, carrying the patient", async () => {
    const card = await ashHealsKira();
    expect(card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(["Clear wounded + take/give +2 health", "Take/give +3 health"]);
    expect(card.flags[MODULE_ID].executorOpts.patientActorId).toBe("pc-kira");
  });

  it("the card checks the patient's wound: 'Clear wounded' is offered for wounded Kira, '+3' is not", async () => {
    const card = await ashHealsKira();
    const root = parseHTML(table.world.message(card._id).content);
    expect(root.querySelector('[data-option-index="0"]').disabled).toBe(false);
    expect(root.querySelector('[data-option-index="1"]').disabled).toBe(true);
  });

  it("the care reaches Kira, not the healer: her wound is cleared and her health rises by 2", async () => {
    ash.system.health.value = 2;
    const card = await ashHealsKira();
    await pick(card, 0);

    expect(ash.system.health.value).toBe(2);
    expect(kira.system.health.value).toBe(3);
    expect(kira.system.debility.wounded).toBe(false);
  });

  it("an unwounded ally takes the +3; the healer's own wound is untouched", async () => {
    kira.system.debility.wounded = false;
    kira.system.health.value = 1;
    ash.system.health.value = 2;
    ash.system.debility = { ...(ash.system.debility ?? {}), wounded: true };
    const card = await ashHeals("I stitch the cut on Kira's arm.", { moveTarget: "Kira" });
    const root = parseHTML(table.world.message(card._id).content);
    expect(root.querySelector('[data-option-index="0"]').disabled).toBe(true);   // Kira is not wounded
    await pick(card, 1);

    expect(kira.system.health.value).toBe(4);
    expect(ash.system.health.value).toBe(2);
    expect(ash.system.debility.wounded).toBe(true);
  });

  it("with no target named, the narration's one other PC is the patient of a +wits care", async () => {
    const card = await ashHeals("I kneel beside Kira and get to work on the wound.");
    expect(card.flags[MODULE_ID].executorOpts.patientActorId).toBe("pc-kira");
  });

  it("a weak hit: the recovery is Kira's, its cost (Lose Momentum) is the healer's", async () => {
    ash.system.momentum = { value: 5 };
    kira.system.momentum = { value: 5 };
    const card = await ashHeals("I patch up Kira's wounds.", { moveTarget: "Kira" }, WEAK);
    const labels = card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label);
    await pick(card, labels.indexOf("Clear wounded + take/give +2 health, then Lose Momentum (-2)"));

    expect(kira.system.health.value).toBe(3);
    expect(kira.system.debility.wounded).toBe(false);
    expect(kira.system.momentum.value).toBe(5);
    expect(ash.system.momentum.value).toBe(3);
  });

  it("control: tending your own wounds names no patient — the card is the roller's", async () => {
    ash.system.health.value = 2;
    const card = await ashHeals("I clean and bind my own wounds.", { statUsed: "iron" });
    expect(card.flags[MODULE_ID].executorOpts.patientActorId).toBeUndefined();
    await pick(card, 1);
    expect(ash.system.health.value).toBe(5);
    expect(kira.system.health.value).toBe(1);
  });
});

describe("resolveHealPatient — who the care is for", () => {
  const pc = (id, name) => ({ id, name, type: "character", system: {} });
  const companion = (id, name, value) => ({ id, name, type: "asset", system: { category: "Companion", track: { enabled: true, value, max: 5 } } });

  it("returns null for any other move", () => {
    expect(resolveHealPatient({ moveId: "hearten", statUsed: "heart" }, pc("a", "Ash"))).toBeNull();
  });

  it("+heart: the companion the narration names, else the only one, else the most hurt", () => {
    const roller = { ...pc("a", "Ash"), items: [companion("c1", "Vex", 4), companion("c2", "Tak", 1)] };
    expect(resolveHealPatient({ moveId: "heal", statUsed: "heart", playerNarration: "I get Vex to the medbay." }, roller))
      .toEqual({ patientActorId: null, patientCompanionItemId: "c1" });
    expect(resolveHealPatient({ moveId: "heal", statUsed: "heart", playerNarration: "I find a vet." }, roller).patientCompanionItemId)
      .toBe("c2");
    const one = { ...pc("a", "Ash"), items: [companion("c1", "Vex", 4)] };
    expect(resolveHealPatient({ moveId: "heal", statUsed: "heart", playerNarration: "I find a vet." }, one).patientCompanionItemId)
      .toBe("c1");
  });

  it("an ally named as the target by full name, or by a first name no other PC shares", () => {
    const ash = pc("a", "Ash"), kira = pc("k", "Kira Vance"), kirb = pc("k2", "Kira Holt");
    expect(resolveHealPatient({ moveId: "heal", statUsed: "wits", moveTarget: "Kira Holt" }, ash, { players: [ash, kira, kirb] })
      .patientActorId).toBe("k2");
    expect(resolveHealPatient({ moveId: "heal", statUsed: "wits", moveTarget: "Kira" }, ash, { players: [ash, kira, kirb] })
      .patientActorId).toBeNull();
    expect(resolveHealPatient({ moveId: "heal", statUsed: "wits", moveTarget: "Vance" }, ash, { players: [ash, kira, kirb] })
      .patientActorId).toBe("k");
  });

  it("the narration's PC counts only for a +wits care with no target, and never the roller", () => {
    const ash = pc("a", "Ash"), kira = pc("k", "Kira");
    expect(resolveHealPatient({ moveId: "heal", statUsed: "iron", playerNarration: "Kira holds me down while I stitch." }, ash, { players: [ash, kira] })
      .patientActorId).toBeNull();
    expect(resolveHealPatient({ moveId: "heal", statUsed: "wits", moveTarget: "Ash" }, ash, { players: [ash, kira] })
      .patientActorId).toBeNull();
  });

  it("a companion patient has no wound: '+3' is offered, 'Clear wounded' is not", () => {
    const wounded = { system: { debility: { wounded: true } } };
    expect(isOptionAvailable({ requires: "wounded" },  { actor: wounded, patientCompanion: true })).toBe(false);
    expect(isOptionAvailable({ requires: "!wounded" }, { actor: wounded, patientCompanion: true })).toBe(true);
    expect(isOptionAvailable({ requires: "wounded" },  { actor: wounded })).toBe(true);           // control: the roller's own
  });
});
