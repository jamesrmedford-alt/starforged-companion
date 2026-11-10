/* global silenceConsoleErrors */
/**
 * Twelfth audit — CARD area probe.
 *
 * CARD-1 FORSAKE-UNNAMED-CLEARS-NOTHING (RULES / UX)
 * CARD-2 FORSAKE-CREWMATE-EXACT-BEATS-OWN (WRONG-TARGET)
 *
 * Forsake Your Vow's pipeline branch (src/moves/movePipeline.js ~1191-1231)
 * resolves its target with resolveVowItemCopies(moveTarget, { actorId })
 * (src/index.js ~4832) — the roller rung is the roller's EXACT-name vow only,
 * then the table-wide ladder (exact → whole-word substring → the sole open
 * vow ACROSS EVERY PC, counted by copies, not by vow). Fulfill Your Vow, for
 * the same words, goes through selectFulfilVow (src/moves/milestone.js ~118):
 * the roller's own vows first by exact OR whole-word name, and with no name
 * the roller's own open vows, a shared vow counted once (issue #321 U02).
 *
 *   CARD-1: Kira types "I forsake my vow" (the interpreter names no vow). She
 *   holds one open vow; so does Ren. Two open vows table-wide → no sole-open
 *   rung → `primary` null → "forsake: no vow matched … nothing cleared" on the
 *   GM's console only. Her vow stays open, while the move card she gets says
 *   "Vow cleared." (resolver.js forsake_your_vow otherEffect) and offers the
 *   forsake's costs. The same happens at a table whose ONLY vow is the shared
 *   inciting vow: its two copies count as two open vows.
 *
 *   CARD-2: Kira's vow is "Protect Ember Station"; Ren's is "Protect Ember".
 *   Kira types that she forsakes her vow to protect Ember (moveTarget
 *   "Protect Ember"). The roller rung needs an exact name, so the global exact
 *   rung takes REN's vow: Ren's vow is completed and flagged forsaken, its
 *   promised reward lost; Kira's stays open. (A Fulfill Your Vow naming the
 *   same words scores Kira's own — selectFulfilVow's roller-first whole-word
 *   rung.) Issue #336 Y25 made the recommit `ownOnly` for exactly this
 *   "costly guess" reason; Forsake — irreversible, every copy — was not.
 *
 * Driven on a booted table: Kira's player types the line, the real pipeline
 * (interpreter stub, scripted Claude) runs it on the GM.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null }));
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('CARD-1 — an unnamed Forsake Your Vow', () => {
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

describe('CARD-2 — a Forsake whose words name the roller\'s vow by whole words and a crewmate\'s exactly', () => {
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
