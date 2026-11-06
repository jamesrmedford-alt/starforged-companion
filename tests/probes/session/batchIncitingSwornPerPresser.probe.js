/**
 * SESS-D1 BATCH-INCITING-SWORN-PER-PRESSER (eleventh audit, session — a
 * decision row; this probe asserts the recommended option A).
 *
 * The inciting card's ⚔ Swear this vow is not claimed: any client may press
 * it, and in free-flow only the first press rolls (a later one meets the move
 * lock, or a card already rewritten "Vow sworn"). Before Begin a Session the
 * gate drops a press and re-arms its button (issue #337 Y36), and the decision
 * rejected holding the post instead because "a held post per press would roll
 * the swear once per press at Begin" (decisions.md, the tenth audit's Y36).
 *
 * In Batch Mode the round holds a participant's card-button move "for the next
 * round" (driver.js holdForNextRound) — a post per press — and at Begin each
 * held press joins its presser's entry: Pat's and Quinn's presses become two
 * Swear an Iron Vow rolls, each with its own momentum or complication; the
 * second's vow is already sworn ("This vow has already been sworn.").
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? [0.25, 0.35, 0.9]) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The oath is sworn on cold iron.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
const round = () => table.world.getSetting('batchMode.round');
const swearCards = () => table.world.messages().filter(m => /Swear an Iron Vow/.test(m.content ?? '') && m.flags?.[MODULE_ID]?.moveResolution);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, vowSwearingNarration: false,
    'batchMode.enabled': true,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'iv-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function postIncitingCard() {
  const mod = await table.client('gm-1').import('../../src/session/incitingIncident.js');
  await table.client('gm-1').run(() => mod.postIncitingIncidentCard({
    spark: { action: 'Rescue', theme: 'Captive' },
    text: 'The beacon dies mid-word as the raiders take the relay.\nSuggested vow: I will free the relay crew (dangerous)',
    fallback: false, sessionId: 'iv-s1', narrationId: 'nar-incite',
  }));
  await table.settle();
  return table.cards(f => f.incitingIncidentCard)[0];
}

async function press(userId, card) {
  table.client(userId).click(card._id, '[data-action="sf-swear-vow"]');
  await table.settle();
}

async function relay(userId, kind, payload) {
  const gmRelay = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  await table.client(userId).run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
}

describe('SESS-D1 — two participants press the inciting ⚔ before Begin a Session, in Batch Mode', () => {
  it('option A: the crew swears the inciting vow once — one Swear an Iron Vow roll at Begin', async () => {
    const card = await postIncitingCard();
    await press('pl-1', card);
    await press('pl-2', card);
    // Sanity: each press was held for the next round (no session yet).
    expect(table.cards(f => f.batchHeldMoveNotice)).toHaveLength(2);

    await relay('gm-1', 'session.begin', { vignetteRolled: false, includeGalley: false });
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    for (const id of ['pl-1', 'pl-2']) {
      const r = round();
      if (r.entries[id]?.status === 'read') {
        await relay(id, 'batch.confirm', { roundId: r.id, submissionId: r.entries[id].submissionId, choices: {} });
      }
    }
    await table.drain();

    // Sanity: the vow was created once (one copy per PC), whoever rolled.
    const copies = ['pc-kira', 'pc-ren'].map(id => (table.actors.get(id).items?.contents ?? [])
      .filter(i => i?.flags?.[MODULE_ID]?.vowId === card._id).length);
    expect(copies).toEqual([1, 1]);
    // Each press was rolled for its own presser's PC.
    // Both rolled today: Kira's (pl-1) and Ren's (pl-2), each its own result card.
    expect(swearCards().map(m => m.flags[MODULE_ID].roundNumber)).toEqual(swearCards().map(() => 1));
    expect(swearCards()).toHaveLength(1);
  }, 30_000);
});

describe('SESS-D1 control — free-flow', () => {
  it('control: the first press swears it, and the card then offers no ⚔ — one roll', async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, vowSwearingNarration: false,
      'batchMode.enabled': false,
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'iv-s1', currentSessionId: 'iv-s1', sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], clocks: [],
      },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
    scriptClaude(table, { fallback: () => REPLY });
    silenceConsoleErrors();

    const card = await postIncitingCard();
    await press('pl-1', card);
    await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].vowSworn).toBe(true);
    // Quinn's client re-renders the rewritten card: no ⚔ left to press.
    const root = table.client('pl-2').render(card._id);
    expect(root.querySelectorAll('[data-action="sf-swear-vow"]')).toHaveLength(0);
    expect(swearCards()).toHaveLength(1);
  }, 30_000);
});
