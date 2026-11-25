/**
 * STARFORGED COMPANION
 * tests/unit/refusalToldComposition.test.js
 *
 * Overhaul 4, "moves as contracts", slice 1 — a move that cannot be made is
 * told (known-issues NOTHING-TO-RECOVER-UNTOLD; design §13.2 composition
 * tests 1 and 2). The fourth live run's eight recovery lines at health 5/5
 * were rightly given no move — and nothing told the player, and the
 * narrator, told only that "a line that sets about one of those has begun
 * it", wrote "the cuts", "the gash".
 *
 * On a booted GM + player table, the player's own typed line and card
 * presses through the chat hook — the real pacing router, classifier,
 * interpreter, move gate, pipeline and paced narrator, Claude answered at the
 * fetch boundary (rules/reachability.md §3: the composition, not the units):
 *
 *   producer (client)                        → consumer (client)
 *   the player's typed line (player)         → the GM's paced narration request: NOT SO [premise] (GM)
 *   the gate's refusal (GM pipeline)         → the paced card's one line + `cannotMake` (the player's replica)
 *   a forced move the gate refuses (player)  → the not-rolled notice with its reason (the player's replica)
 *   a soft refusal on a forced move (player) → the GM's confirm dialog; its Accept → the move card's note
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: () => true, confirmed: [], dice: null }));
// Scripted dice inside the REAL resolveMove (challenge, challenge, action), when a test sets them.
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      if (!control.dice) return original.resolveMove(...args);
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // The GM's confirm dialog, answered by the test. Its Accept of a soft
  // refusal is the GM's override, as MoveConfirmDialog's Accept sets it
  // (moveRefusalConfirmDialog.test.js drives the real dialog).
  confirmInterpretation: vi.fn(async (interpretation, opts) => {
    control.confirmed.push({ moveId: interpretation?.moveId ?? null, forced: !!opts?.forced, softRefusal: interpretation?.softRefusal ?? null });
    const answer = control.confirm(interpretation, opts);
    if (answer === true && interpretation?.softRefusal) interpretation.gateOverride = true;
    return answer;
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MEDKIT    = "I sit in the galley and treat my wounds with the ship's medkit.";
const NARRATION = 'Isaac turns the kit over in his hands and finds nothing that needs it.';
const isClassifier  = (call) => /pacing pre-classifier/.test(call?.system ?? '');
const isInterpreter = (call) => /move interpreter/.test(call?.system ?? '');
const isNarration   = (call) => /NARRATOR ROLE|SIDECAR/.test(call?.system ?? '') && !isClassifier(call) && !isInterpreter(call);

let table, replies;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = () => true;
  control.confirmed = [];
  control.dice = null;
  replies = {
    classifier:  { decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'heal', category: 'downtime', confidence: 0.8, reasoning: 'Treating wounds sets about healing.' },
    interpreter: { moveId: 'heal', statUsed: 'iron', healSituation: 'self', rationale: 'He tends his own wounds.', confidence: 'high' },
  };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false, 'riders.autoApply': false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null },
  } } });
  // Isaac at full health, spirit and supply, nothing marked — the run's sheet.
  table.addActor({ id: 'pc-isaac', name: 'Isaac Sutton', ownership: { 'pl-1': 3 }, system: { supply: { value: 5 } }, items: { contents: [] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, {
    fallback: (call) => {
      if (isClassifier(call))  return JSON.stringify(replies.classifier);
      if (isInterpreter(call)) return JSON.stringify(replies.interpreter);
      if (/NARRATOR ROLE|SIDECAR/.test(call?.system ?? '')) return `${NARRATION}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
      return '{}';
    },
  });
  silenceConsoleErrors();
});

const ISAAC = { actor: 'pc-isaac', alias: 'Isaac Sutton' };
const say = async (text = MEDKIT, data = {}) => {
  await table.client('pl-1').chat(text, { speaker: ISAAC, ...data });
  await table.settle(); await table.drain();
};
// A card's Roll button: its forced move, posted with the line it was for.
const press = (moveId, extra = {}) => say(`Isaac makes the move the card offers: ${moveId}.`, { flags: { [MODULE_ID]: { forcedMoveId: moveId, bypassPacing: true, ...extra } } });
const pacedCards  = () => table.cards(f => f.pacedNarrative);
const moveCards   = () => table.cards(f => f.moveResolution);
const notices     = () => table.cards(f => !!f.moveNotRolledNotice);
const narrations  = () => table.claude.calls.filter(isNarration);

describe('a typed recovery line at full health — refused by the gate, and told', () => {
  it('no dice; the GM\'s narration is told the wound is not so; the card on the player\'s client says why', async () => {
    await say();

    expect(moveCards(), 'nothing was rolled').toHaveLength(0);
    expect(control.confirmed, 'no roll dialog').toEqual([]);
    const [card, ...more] = pacedCards();
    expect(more).toHaveLength(0);
    // The narration request, made on the GM's client, holds the premise.
    const [request] = narrations();
    expect(request.client).toBe('gm-1');
    expect(request.userText).toContain('## WHAT THIS NARRATION MUST TELL, AND MUST NOT');
    expect(request.userText).toContain("- [premise] A wound to treat is not so — nothing to heal: Isaac Sutton's health is 5 of 5 and no wound is marked.");
    expect(request.userText).toMatch(/never the premise as real: never a cut, a gash, blood or a dressing on them/);
    expect(request.userText).toContain('- [sheet] No move was rolled for this line, and none will be.');
    // The card says why — on the player's own client too.
    const mine = table.client('pl-1').message(card._id);
    expect(mine.flags[MODULE_ID].cannotMake).toEqual({ moveId: 'heal', code: 'recoverable-health', hard: false,
      why: "nothing to heal: Isaac Sutton's health is 5 of 5 and no wound is marked" });
    expect(String(mine.content)).toContain("No Heal — nothing to heal: Isaac Sutton's health is 5 of 5 and no wound is marked.");
    expect(String(mine.content)).not.toMatch(/data-action="sf-paced-roll"/);
    expect(table.world.campaignState().pendingMove, 'the move lock is free').toBe(false);
  }, 60_000);

  it('control: with a wound to treat, the Heal is offered as before, and nothing is said against it', async () => {
    table.actors.get('pc-isaac').system.health.value = 3;
    await say();
    const [card] = pacedCards();
    expect(card.flags[MODULE_ID].cannotMake).toBeUndefined();
    expect(String(card.content)).toMatch(/data-action="sf-paced-roll"[^>]*>Roll Heal</);
    expect(narrations()[0].userText).not.toContain('[premise]');
  }, 60_000);
});

describe('a typed Strike with no fight under way (D6)', () => {
  beforeEach(() => {
    replies.classifier = { decision: 'MOVE', suggestedMove: 'strike', category: 'combat', confidence: 0.9, reasoning: 'An attack.' };
    replies.interpreter = { moveId: 'strike', statUsed: 'edge', rationale: 'He opens fire.', confidence: 'high' };
  });

  it('is narrated, told why, with Enter the Fray on its card — and no fight is made', async () => {
    await say('I open fire on the raider.');
    expect(moveCards()).toHaveLength(0);
    const [card] = pacedCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: 'enter_the_fray', cannotMake: { moveId: 'strike', code: 'open-fight', hard: true } });
    expect(String(card.content)).toContain('No Strike — no fight is under way.');
    expect(String(card.content)).toMatch(/data-action="sf-paced-roll"[^>]*>Roll Enter the Fray</);
    expect(narrations()[0].userText).toContain('- [premise] A fight under way is not so — no fight is under way.');
    expect(narrations()[0].userText).toContain('- [offer] Enter the Fray is only offered. It has not been made');
  }, 60_000);

  it('a forced Strike with no fight is not rolled and goes to no dialog: the not-rolled notice says why, on the player\'s client', async () => {
    await press('strike');
    expect(control.confirmed).toEqual([]);
    expect(moveCards()).toHaveLength(0);
    const [notice] = notices();
    expect(notice.flags[MODULE_ID]).toMatchObject({ moveNotRolledNotice: 'cannot', cannotMake: { moveId: 'strike', code: 'open-fight', hard: true } });
    const mine = table.client('pl-1').message(notice._id);
    expect(String(mine.content)).toContain('No Strike — no fight is under way. Nothing was rolled. Enter the Fray can be made instead.');
    expect(String(mine.content), 'a hard refusal offers no Roll anyway').not.toMatch(/sf-roll-anyway/);
  }, 60_000);
});

describe('a forced Heal at full health — a soft refusal reaches the GM\'s dialog (D2)', () => {
  it('the dialog is shown the reason; the GM\'s Accept rolls it at the GM\'s word, and the move card says so', async () => {
    await press('heal');
    expect(control.confirmed).toEqual([{ moveId: 'heal', forced: true,
      softRefusal: expect.objectContaining({ moveId: 'heal', code: 'recoverable-health', hard: false }) }]);
    const [card] = moveCards();
    expect(card, 'rolled').toBeTruthy();
    expect(String(card.content)).toContain("⚖ Rolled at the GM's word: nothing to heal: Isaac Sutton's health is 5 of 5 and no wound is marked.");
    // Its narration is told it was rolled at the GM's word.
    expect(narrations().at(-1).userText).toMatch(/- \[overridden\] The roll was made at the GM's word; the sheet says nothing to heal/);
  }, 60_000);

  it('the GM\'s Cancel: nothing rolled, and the player is told', async () => {
    control.confirm = () => false;
    await press('heal');
    expect(moveCards()).toHaveLength(0);
    const [notice] = notices();
    expect(notice.flags[MODULE_ID].moveNotRolledNotice).toBe('cancelled');
    expect(table.client('pl-1').message(notice._id)).toBeTruthy();
  }, 60_000);
});

describe('Explore a Waypoint at a site with no expedition (D6)', () => {
  it('is made — and its strong hit offers no expedition progress, which would land on nothing', async () => {
    const wreck = table.addActor({ id: 'loc-wreck', name: 'The Hollow Wreck', type: 'location', system: { subtype: 'derelict' },
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-wreck', name: 'The Hollow Wreck', type: 'derelict', active: true } } } });
    const gm = table.client('gm-1');
    await gm.run(() => game.settings.set(MODULE_ID, 'campaignState', { ...game.settings.get(MODULE_ID, 'campaignState'),
      currentLocationType: 'location', currentLocationId: wreck.id, locationIds: [wreck.id] }));
    replies.classifier = { decision: 'MOVE', suggestedMove: 'explore_a_waypoint', category: 'exploration', confidence: 0.9, reasoning: 'Explores the wreck.' };
    replies.interpreter = { moveId: 'explore_a_waypoint', statUsed: 'wits', rationale: 'He searches the hold.', confidence: 'high' };
    control.dice = [0.25, 0.35, 0.9];   // challenge 3, 4; action 6 + wits — a strong hit, no match
    await say('I search the flooded hold of the wreck.');
    expect(moveCards(), 'rolled').toHaveLength(1);
    const choice = table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
    expect(choice.flags[MODULE_ID].sufferPrompt.options.map(o => o.label)).toEqual(['+2 momentum']);
    const store = await gm.import('../../src/ui/progressTracks.js');
    expect((await gm.run(() => store.listProgressTracks())).filter(t => t.type === 'expedition'), 'no expedition begun').toEqual([]);
  }, 60_000);
});
