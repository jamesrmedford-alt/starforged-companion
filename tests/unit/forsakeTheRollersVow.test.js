/* global silenceConsoleErrors */
/**
 * Forsake Your Vow clears the roller's own vow (issue #345 AA16, AA49 — the
 * twelfth audit's CARD-1 and CARD-2 probes).
 *
 * Forsake's pipeline branch resolved its target through the item-copy ladder
 * (index.js resolveVowItemCopies): the roller's EXACT-name vow only, then the
 * table-wide ladder (exact → whole words → the sole open vow ACROSS EVERY PC,
 * counted by copies, not by vow). Fulfill Your Vow picks its vow through
 * selectFulfilVow: the roller's own first, by exact or whole-word name; with
 * no name the roller's own open vows, a shared vow once (issue #321 U02).
 *
 *   AA16: "I forsake my vow" (the interpreter names none) while Kira and Ren
 *   each hold an open vow — or the table's only vow is the crew's shared
 *   vow, its two copies — found no sole open vow: nothing was forsaken, the
 *   miss on the GM's console only, while the move card said "Vow cleared."
 *   and offered the forsake's costs.
 *   AA49: Kira forsaking "Protect Ember" (her vow "Protect Ember Station")
 *   forsook Ren's exact-name "Protect Ember" — completed, flagged forsaken,
 *   its promised reward lost.
 *
 * The vow is now chosen in the read (movePipeline readMove →
 * milestone.selectForsakeVow): the roller's own vows alone — by name as
 * Fulfill's, unnamed their one open vow; among several, or for a name none of
 * theirs answers to, a "Which vow?" card, nothing cleared; with none, the move
 * card says so and offers no costs. The branch clears the chosen copy
 * (`moveTargetId`, `ownOnly`).
 *
 * Driven on a booted table: Kira's player types the line, the real pipeline
 * (interpreter stub, scripted Claude) runs it on the GM.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null }));
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { selectForsakeVow } from '../../src/moves/milestone.js';

let table;

function vowItem(id, name, flags = {}) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { ...flags } },
    system: { subtype: 'vow', rank: 'dangerous', current: 12, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function setUp(kiraItems, renItems) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'fs-s1', sessionNumber: 1,
      currentSceneId: 'fs-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: kiraItems } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: renItems } });
  scriptClaude(table, { fallback: () => 'She lets the oath go.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

/** Kira's player types a Forsake Your Vow; `moveTarget` is what the interpreter named. */
async function kiraForsakes(line, moveTarget) {
  control.interpretation = { moveId: 'forsake_your_vow', moveName: 'Forsake Your Vow', statUsed: null, adds: 0,
    isProgressMove: false, moveTarget, rationale: 'test', mischiefApplied: false };
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

const state = (item) => ({ completed: item.system.completed === true, forsaken: item.flags[MODULE_ID]?.forsaken === true });
const moveCard = () => table.cards(f => f.moveResolution === true || f.resolutionId != null)
  .find(m => /Forsake Your Vow/.test(String(m.content ?? '')));

describe('issue #345 AA16 — an unnamed Forsake Your Vow', () => {
  it('control: naming her vow, Kira forsakes hers and only hers', async () => {
    const kiras = vowItem('v-kira', 'Find Chen', { vowId: 'v-kira' });
    const rens  = vowItem('v-ren',  'Repay the Syndicate', { vowId: 'v-ren' });
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira turns her back on finding Chen.', 'Find Chen');
    expect(state(kiras)).toEqual({ completed: true, forsaken: true });
    expect(state(rens)).toEqual({ completed: false, forsaken: false });
  }, 30_000);

  it('naming none, Kira — whose one open vow is "Find Chen" — forsakes it (Ren holds another)', async () => {
    const kiras = vowItem('v-kira', 'Find Chen', { vowId: 'v-kira' });
    const rens  = vowItem('v-ren',  'Repay the Syndicate', { vowId: 'v-ren' });
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira forsakes her vow.', null);
    const card = moveCard();
    expect(card?.content ?? '', 'the move card claims the vow is cleared (setup)').toContain('Vow cleared');
    expect(table.cards(f => f.sufferCard).length, 'and offers the forsake\'s costs (setup)').toBeGreaterThan(0);
    expect(state(rens), 'Ren\'s vow is untouched').toEqual({ completed: false, forsaken: false });
    expect(state(kiras), 'Kira\'s own (sole open) vow is forsaken, as the card says').toEqual({ completed: true, forsaken: true });
  }, 30_000);

  it('naming none at a table whose only vow is the crew\'s shared vow, it is forsaken on every copy', async () => {
    const shared = { vowId: 'msg-inciting', sharedVow: true };
    const kiras = vowItem('v-kira-shared', 'Break the Blockade', shared);
    const rens  = vowItem('v-ren-shared',  'Break the Blockade', shared);
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira forsakes the vow.', null);
    expect([state(kiras), state(rens)]).toEqual([
      { completed: true, forsaken: true }, { completed: true, forsaken: true },
    ]);
  }, 30_000);
});

describe('issue #345 AA49 — a Forsake whose words name the roller\'s vow by whole words and a crewmate\'s exactly', () => {
  it('control: with no crewmate namesake, "Protect Ember" forsakes Kira\'s "Protect Ember Station"', async () => {
    const kiras = vowItem('v-kira', 'Protect Ember Station', { vowId: 'v-kira' });
    const rens  = vowItem('v-ren',  'Repay the Syndicate', { vowId: 'v-ren' });
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira gives up on protecting Ember.', 'Protect Ember');
    expect(state(kiras)).toEqual({ completed: true, forsaken: true });
    expect(state(rens)).toEqual({ completed: false, forsaken: false });
  }, 30_000);

  it('Kira forsaking "Protect Ember" leaves Ren\'s exact-name vow "Protect Ember" alone', async () => {
    const kiras = vowItem('v-kira', 'Protect Ember Station', { vowId: 'v-kira' });
    const rens  = vowItem('v-ren',  'Protect Ember', { vowId: 'v-ren', reward: { status: 'promised', description: 'a berth on Ember', form: 'gear' } });
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira gives up on protecting Ember.', 'Protect Ember');
    expect({ ...state(rens), reward: rens.flags[MODULE_ID].reward?.status },
      'Ren\'s vow — another player\'s — is not forsaken, nor its reward lost')
      .toEqual({ completed: false, forsaken: false, reward: 'promised' });
    expect(state(kiras), 'Kira\'s own vow is the one forsaken').toEqual({ completed: true, forsaken: true });
  }, 30_000);
});

const whichVowCards = () => table.cards(f => f.whichVowCard);

describe('issue #345 AA16 — a Forsake Your Vow that finds no single vow of the roller\'s', () => {
  it('naming none among two of Kira\'s vows, it asks which — nothing cleared — and the pick forsakes that one', async () => {
    const first  = vowItem('v-kira-1', 'Find Chen', { vowId: 'v-kira-1' });
    const second = vowItem('v-kira-2', 'Chart the Rift', { vowId: 'v-kira-2' });
    const rens   = vowItem('v-ren',  'Repay the Syndicate', { vowId: 'v-ren' });
    await setUp([first, second], [rens]);
    await kiraForsakes('Kira forsakes her vow.', null);
    const [card] = whichVowCards();
    expect(card?.content ?? '').toMatch(/Forsake Your Vow — which vow\?/);
    expect(card.flags[MODULE_ID].choices.map(c => c.itemId)).toEqual(['v-kira-1', 'v-kira-2']);
    expect([state(first), state(second), state(rens)]).toEqual([
      { completed: false, forsaken: false }, { completed: false, forsaken: false }, { completed: false, forsaken: false },
    ]);
    expect(moveCard(), 'nothing is made yet').toBeUndefined();

    await table.client('pl-1').click(card._id, '[data-action="sf-which-vow"][data-item-id="v-kira-2"]');
    await table.settle(); await table.drain();
    expect([state(first), state(second), state(rens)]).toEqual([
      { completed: false, forsaken: false }, { completed: true, forsaken: true }, { completed: false, forsaken: false },
    ]);
  }, 30_000);

  it('Kira holding no open vow: Ren\'s is untouched, and the move card says nothing was cleared and offers no cost', async () => {
    const rens = vowItem('v-ren', 'Repay the Syndicate', { vowId: 'v-ren' });
    await setUp([], [rens]);
    await kiraForsakes('Kira forsakes her vow.', null);
    expect(state(rens)).toEqual({ completed: false, forsaken: false });
    const card = moveCard();
    expect(card?.content ?? '').not.toContain('Vow cleared');
    expect(card?.content ?? '').toMatch(/No open vow of Kira.s to forsake/);
    expect(table.cards(f => f.sufferCard), 'no forsake costs').toHaveLength(0);
    expect(table.cards(f => f.forsakeVowCard), 'no "Vow Forsaken" card').toHaveLength(0);
  }, 30_000);
});

describe('issue #345 AA49 — a crewmate\'s vow is theirs to forsake', () => {
  it('Kira naming Ren\'s vow outright forsakes nothing: she is asked about her own', async () => {
    const kiras = vowItem('v-kira', 'Find Chen', { vowId: 'v-kira' });
    const rens  = vowItem('v-ren',  'Repay the Syndicate', { vowId: 'v-ren', reward: { status: 'promised', description: 'a clean slate', form: 'gear' } });
    await setUp([kiras], [rens]);
    await kiraForsakes('Kira gives up on repaying the Syndicate.', 'Repay the Syndicate');
    expect({ ...state(rens), reward: rens.flags[MODULE_ID].reward?.status }).toEqual({ completed: false, forsaken: false, reward: 'promised' });
    expect(state(kiras)).toEqual({ completed: false, forsaken: false });
    const [card] = whichVowCards();
    expect(card.flags[MODULE_ID].choices.map(c => c.itemId)).toEqual(['v-kira']);
  }, 30_000);
});

describe('issue #345 AA16 / AA49 — selectForsakeVow', () => {
  const v = (id, name, actorId, extra = {}) => ({ id, name, actorId, rank: 'dangerous', ticks: 0, completed: false, vowId: id, ...extra });

  it('a name that answers to the roller\'s fulfilled vow clears nothing — not their other vow', () => {
    const vows = [v('a', 'Find Chen', 'kira', { completed: true }), v('b', 'Chart the Rift', 'kira')];
    expect(selectForsakeVow(vows, 'Find Chen', { rollerActorId: 'kira' })).toEqual({ vow: null, choices: [], completed: true });
  });

  it('a shared vow is one vow: unnamed, the roller\'s copy', () => {
    const vows = [v('k', 'Break the Blockade', 'kira', { vowId: 'shared' }), v('r', 'Break the Blockade', 'ren', { vowId: 'shared' })];
    expect(selectForsakeVow(vows, null, { rollerActorId: 'ren' }).vow?.id).toBe('r');
  });

  it('control: no roller, no vow — never another PC\'s', () => {
    expect(selectForsakeVow([v('r', 'Repay the Syndicate', 'ren')], null, { rollerActorId: null })).toEqual({ vow: null, choices: [] });
  });
});
