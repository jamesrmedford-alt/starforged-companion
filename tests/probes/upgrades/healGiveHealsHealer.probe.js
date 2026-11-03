/**
 * PROBE (moves-upgrade-suffer audit) — MU: HEAL-GIVE-HEALS-HEALER
 *
 * Rule (vendored Heal text): "If you … Provide care: Roll +wits … On a strong
 * hit, the care is helpful. If you (or the ally under your care) are wounded,
 * clear the impact and take or give +2 health. Otherwise, take or give +3
 * health." The interpreter is told Heal is "receiving or providing medical
 * care" (interpreter.js), and the choice card's options read "Take/give …".
 *
 * What the user does: Ash's player types "I patch up Kira's wounds" — Kira is
 * wounded at 1 health — and rolls a strong hit.
 *
 * What happens: the Heal choice card belongs to the ROLLER: persistResolution
 * posts it for the speaker's actor with no patient (targets carry only the
 * vehicle, companion and fight), its `requires` ("wounded" / "!wounded")
 * read Ash's impacts, and the pick's clear-impact / health calls write Ash
 * (sufferDialog.js runSufferCall, `actor` = the card's PC). Kira stays
 * wounded at 1; the only option offered is "Take/give +3 health", which heals
 * the healer (and had Ash been wounded, "Clear wounded + take/give +2
 * health" would clear Ash's wound). "Obtain treatment for a companion" heals
 * the PC, not the companion.
 *
 * What should happen: the care lands on the patient the move names — its
 * impact checked and cleared, its health raised.
 *
 * Driven end to end on a booted table (interpretation and dice scripted at
 * their boundaries); Ash's player clicks the GM's choice card.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { parseHTML } from "../../helpers/cardDom.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

describe("HEAL-GIVE-HEALS-HEALER", () => {
  it("control: Ash's strong-hit Heal posts the recovery choice", async () => {
    const card = await ashHealsKira();
    expect(card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(["Clear wounded + take/give +2 health", "Take/give +3 health"]);
  });

  it("the card checks the patient's wound: 'Clear wounded + take/give +2 health' is offered for wounded Kira", async () => {
    const card = await ashHealsKira();
    const root = parseHTML(table.world.message(card._id).content);
    const clearWounded = root.querySelector('[data-option-index="0"]');
    expect(clearWounded.disabled).toBe(false);          // today: disabled — it read Ash, who is not wounded
  });

  it("the care reaches Kira, not the healer: her wound is cleared and her health rises", async () => {
    ash.system.health.value = 2;
    const card = await ashHealsKira();
    // Ash's player takes the option the card leaves open today ("Take/give +3 health").
    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
    await table.settle(); await table.drain();

    expect(ash.system.health.value).toBe(2);             // today: 5 — the healer took the +3
    expect(kira.system.health.value).toBeGreaterThan(1); // today: 1, still wounded
  });
});
