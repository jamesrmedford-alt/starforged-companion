// tests/probes/uisec/panelFightVowLinkPaidByName.probe.js
//
// UISEC-08 · PANEL-FIGHT-VOW-LINK-PAID-BY-NAME (IDENTITY-BY-NAME where an id exists)
//
// Scenario: issue #353 R3 lets the Progress Tracks panel's add form link ANY
// new track — a fight too — to the vow it serves, and stores the link's
// canonical half, the vow's id (`linkedVowId`), beside the name it was linked
// under (`linkedVowName`). decisions.md: "The link's canonical half is the
// vow's id across its copies … a renamed vow keeps its link", and a fight
// added by hand "then pays off as a threshold fight does". The readers that
// name the vow were moved to the id (the scene's vow line, both panels). The
// reader that PAYS the vow was not: a won linked fight's payoff
// (index.js applyWonFightPayoff → postFightVowMilestoneCard /
// grantLinkedVowReward) is handed `track.linkedVowName` alone.
//
// So when the vow is renamed on its sheet while the fight is open, the
// Progress Tracks panel still shows the fight serving the vow (by id, under
// its new name), and the win posts "a milestone toward your vow" for a name
// no vow carries: the card resolves no vow (`vowId` null, no rank), and its
// ⚑ Mark milestone has nothing to mark — the VOW-RENAME-PAYOFF shape
// (rules/reachability.md §6), for the link R3 gave an id.
//
// Correct: the victory card is for the linked vow — found by `linkedVowId` —
// under its current name.
// Today: flags { vowName: "<the old name>", vowId: null, vowRank: null }.
//
// Production wiring: the player's Take Decisive Action through the GM's real
// pipeline on a booted table; the fight is one the panel's Add made
// (`linkedVowId` + `linkedVowName`, as applyProgressTrackEditFromRelay stores).

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const OLD_NAME = 'Find the lost beacon';
const NEW_NAME = 'Bring the beacon home';

let table, kira, tracksStore;

const vowItem = (id, name) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
  flags: { [MODULE_ID]: { vowId: id } },
});

async function winTheFight() {
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null,
    isProgressMove: true, moveTarget: 'Corsairs', moveTargetId: 'fight-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('I end it — one clean shot through their drive.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

const fightCard = () => table.cards(f => f.fightVowCard)[0] ?? null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } },
    items: { contents: [vowItem('v-hollow', 'Avenge the Iron Hollow'), vowItem('v-beacon', OLD_NAME)] } });
  // The fight as the panel's Add stores it with a vow chosen (applyProgressTrackEditFromRelay "add" →
  // resolveVowChoice → { linkedVowId, linkedVowName }), in control and one mark from done.
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: 'fight-1', label: 'Corsairs', type: 'combat', rank: 'dangerous', ticks: 40, completed: false,
      combatState: 'in_control', positions: { 'pc-kira': 'in_control' },
      linkedVowId: 'v-beacon', linkedVowName: OLD_NAME, createdAt: 1 },
  ] };
  table.journal._set({
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

describe('UISEC-08: a fight the panel linked to a vow by id pays that vow', () => {
  it('control: the vow still under the name it was linked by — the victory card is that vow\'s', async () => {
    await winTheFight();
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed).toBe(true);
    const card = fightCard();
    expect(card).toBeTruthy();
    expect(card.flags[MODULE_ID]).toMatchObject({ vowName: OLD_NAME, vowId: 'v-beacon', actorId: 'pc-kira' });
  }, 30_000);

  it('the vow renamed on its sheet while the fight was open: the victory card is still that vow\'s', async () => {
    kira.items.contents.find(i => i.id === 'v-beacon').name = NEW_NAME;

    await winTheFight();
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed).toBe(true);
    const card = fightCard();
    expect(card).toBeTruthy();                                    // a linked fight was won
    // Today: { vowName: "Find the lost beacon", vowId: null, vowRank: null } — a vow nobody holds.
    expect(card.flags[MODULE_ID].vowId).toBe('v-beacon');
    expect(card.flags[MODULE_ID].vowName).toBe(NEW_NAME);
  }, 30_000);
});
