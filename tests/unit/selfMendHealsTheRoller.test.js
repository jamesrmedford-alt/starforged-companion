/**
 * STARFORGED COMPANION
 * tests/unit/selfMendHealsTheRoller.test.js
 *
 * Issue #345 AA13 (SELF-MEND-HEALS-NAMED-CREWMATE) — issue #330 D4 (Heal's
 * situation) and issue #325 W04 (Heal's patient) composed badly.
 *
 * Vendored Heal: "Mend your own wounds: Roll +iron or +wits, whichever is
 * lower … Provide care: Roll +wits … If you (or the ally under your care) are
 * wounded, clear the impact and take or give +2 health. Otherwise, take or give
 * +3 health."
 *
 * The interpreter names the situation (`healSituation: "self"`); the pipeline
 * then rolls a self-mend's lower stat — "wits" when wits < iron
 * (statEnrichment PICK_LOWER_OF) — and resolveHealPatient read the patient
 * from the stat alone: "+wits with no target" was Provide care for the one
 * other PC the narration names. So "While Kira keeps watch at the hatch, I
 * stitch the gash on my own arm" from Ash (iron 3, wits 1, wounded) healed
 * unwounded Kira and left Ash wounded. The patient now comes from the
 * situation read — none for "self" / "treated", a companion for
 * "companion", another PC for "ally" — and from the stat only when none was.
 *
 * Booted GM + two players; interpretation and dice scripted at their
 * boundaries, as tests/unit/healPatient.test.js drives Heal.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveHealPatient } from '../../src/moves/statEnrichment.js';

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

describe('issue #345 AA13 — a +wits self-mend that mentions a crewmate heals the roller, not the crewmate', () => {
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

describe('issue #345 AA13 — resolveHealPatient reads the situation', () => {
  const pc = (id, name) => ({ id, name, type: 'character', system: {} });
  const companion = (id, name, value) => ({ id, name, type: 'asset', system: { category: 'Companion', track: { enabled: true, value, max: 5 } } });
  const ash = { ...pc('a', 'Ash'), items: [companion('c1', 'Vex', 2)] };
  const kira = pc('k', 'Kira');
  const heal = (over) => ({ moveId: 'heal', moveTarget: null, playerNarration: 'Kira holds the lamp while I work.', ...over });
  const patient = (over) => resolveHealPatient(heal(over), ash, { players: [ash, kira] });

  it('a self-mend or a treatment received names no patient, whatever its stat and whoever the line mentions', () => {
    expect(patient({ healSituation: 'self', statUsed: 'wits' })).toEqual({ patientActorId: null, patientCompanionItemId: null });
    expect(patient({ healSituation: 'treated', statUsed: 'iron', moveTarget: 'Kira' }))
      .toEqual({ patientActorId: null, patientCompanionItemId: null });
  });

  it("care for an ally finds the PC the line names, whatever the stat (an asset's swap)", () => {
    expect(patient({ healSituation: 'ally', statUsed: 'heart' }).patientActorId).toBe('k');
  });

  it("a companion's treatment is the companion's, whatever the stat", () => {
    expect(patient({ healSituation: 'companion', statUsed: 'wits', playerNarration: 'I get Vex to a vet.' }))
      .toEqual({ patientActorId: null, patientCompanionItemId: 'c1' });
  });

  it('control: with no situation read, the stat stands in — +wits is care for the PC the line names, +iron the roller\'s own', () => {
    expect(patient({ statUsed: 'wits' }).patientActorId).toBe('k');
    expect(patient({ statUsed: 'iron' }).patientActorId).toBeNull();
  });
});
