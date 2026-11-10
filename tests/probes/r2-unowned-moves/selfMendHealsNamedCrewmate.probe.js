/**
 * PROBE R2U-5 — SELF-MEND-HEALS-NAMED-CREWMATE (WRONG-TARGET)
 * Sibling-path gap between issue #330 D4 (Heal's situation) and issue #325
 * W04 (Heal's patient).
 *
 * Vendored Heal: "Mend your own wounds: Roll +iron or +wits, whichever is
 * lower … Provide care: Roll +wits … If you (or the ally under your care) are
 * wounded, clear the impact and take or give +2 health. Otherwise, take or give
 * +3 health."
 *
 * The interpreter names the situation (`healSituation: "self"`); the pipeline
 * then, in this order:
 *   src/moves/movePipeline.js:705   enrichInterpretationStatValue →
 *     statEnrichment.js:122-131 PICK_LOWER_OF: a self-mend's statUsed becomes
 *     the LOWER of iron / wits — "wits" when wits < iron
 *   src/moves/movePipeline.js:802   resolveHealPatient →
 *     statEnrichment.js:237-255: never reads healSituation; with no target it
 *     takes "the only other PC the narration names while the roll is +wits
 *     (the move's 'Provide care')" as the patient
 *   src/moves/movePipeline.js:1316  patientActorId rides the recovery card;
 *     sufferDialog.js:318-323 / :364-366 heal and un-wound THAT PC.
 * So a self-mend rolled +wits (wits lower than iron) whose line mentions a
 * crewmate is read as care for the crewmate: the crewmate is healed, the
 * roller's wound stays.
 *
 * Scenario (booted GM + two players; interpretation and dice scripted at their
 * boundaries, as tests/unit/healPatient.test.js drives Heal):
 *   1. Ash (iron 3, wits 1, health 2, wounded) types "While Kira keeps watch at
 *      the hatch, I stitch the gash on my own arm." → Heal, healSituation
 *      "self" (no target).
 *   2. The self-mend rolls +wits 1 (the lower) — a strong hit.
 *   3. The recovery card carries patientActorId = Kira, so it offers unwounded
 *      Kira's "Take/give +3 health" (Ash's "Clear wounded + +2" is greyed);
 *      Ash's player presses the one offered.
 *   Expected: no patient — Ash's wound is cleared and his health rises to 4.
 *   Actual: the card names Kira; Kira (health 1) gets the +3, Ash stays at 2,
 *   wounded.
 *
 * Control: the same line from a PC whose iron is the lower stat (the self-mend
 * rolls +iron) heals the roller.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { parseHTML } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, ash, kira;
let seq = 0;   // a fresh PC id per test: the actor snapshot cache is keyed by id
// challenge 3, 5; action die 6 — +1 → 7: a strong hit at either stat used here
const STRONG = [0.25, 0.45, 0.9];
const LINE = 'While Kira keeps watch at the hatch, I stitch the gash on my own arm.';

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'probe-s1', sessionNumber: 1,
      currentSceneId: 'probe-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 },
    system: { health: { value: 1 }, debility: { wounded: false } } });
  scriptClaude(table, { fallback: () => 'The stitches hold.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function ashSelfMends(stats) {
  ash = table.addActor({ id: `pc-ash-${++seq}`, name: 'Ash', ownership: { 'pl-1': 3 },
    system: { ...stats, health: { value: 2 }, debility: { wounded: true } } });
  control.interpretation = { moveId: 'heal', moveName: 'Heal', statUsed: 'iron', adds: 0, moveTarget: null,
    healSituation: 'self', rationale: 'Ash mends his own wound', mischiefApplied: false };
  control.dice = STRONG;
  await table.client('pl-1').chat(LINE, { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

/** The recovery card's options as its player sees them: which are pressable. */
function enabledOptions(card) {
  const root = parseHTML(table.world.message(card._id).content);
  return [0, 1].map(i => root.querySelector(`[data-option-index="${i}"]`)?.disabled === false);
}

/** Ash's player presses the one recovery the card lets him press. */
async function pickTheOfferedRecovery(card) {
  const index = enabledOptions(card).findIndex(Boolean);
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}

const state = () => ({ ash: [ash.system.health.value, ash.system.debility.wounded], kira: kira.system.health.value });

describe('R2U-5 SELF-MEND-HEALS-NAMED-CREWMATE — a +wits self-mend that mentions a crewmate heals the crewmate', () => {
  it('Ash mends his own wound (wits the lower stat): the card names no patient', async () => {
    const card = await ashSelfMends({ iron: 3, wits: 1 });
    expect(card, 'a recovery card was posted').toBeTruthy();
    expect(card.flags[MODULE_ID].executorOpts?.patientActorId ?? null).toBeNull();
  }, 60_000);

  it("the card offers wounded Ash's recovery ('Clear wounded + +2'), not unwounded Kira's ('+3')", async () => {
    const card = await ashSelfMends({ iron: 3, wits: 1 });
    expect(card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(['Clear wounded + take/give +2 health', 'Take/give +3 health']);
    expect(enabledOptions(card)).toEqual([true, false]);
  }, 60_000);

  it("the care is Ash's: his wound clears and his health rises; Kira's is untouched", async () => {
    const card = await ashSelfMends({ iron: 3, wits: 1 });
    await pickTheOfferedRecovery(card);
    expect(state()).toEqual({ ash: [4, false], kira: 1 });
  }, 60_000);

  it('control: the same self-mend from a PC whose iron is the lower stat heals the roller', async () => {
    const card = await ashSelfMends({ iron: 1, wits: 3 });
    expect(card.flags[MODULE_ID].executorOpts?.patientActorId ?? null).toBeNull();
    expect(enabledOptions(card)).toEqual([true, false]);
    await pickTheOfferedRecovery(card);
    expect(state()).toEqual({ ash: [4, false], kira: 1 });
  }, 60_000);
});
