/**
 * STARFORGED COMPANION
 * tests/unit/batchIncitingSwornOnce.test.js
 *
 * Issue #342 Z30 (BATCH-INCITING-SWORN-PER-PRESSER; the session auditor's
 * probe, option A — already decided). The inciting card's ⚔ Swear this vow
 * is the crew's one swear (decisions.md, the shared founding vow), and the
 * card is not claimed: any client may press it. In free-flow only the first
 * press rolls (a later one meets the move lock, or a card already rewritten
 * "Vow sworn"), and before Begin a Session the gate drops a press and
 * re-arms its button — the tenth audit's Y36 rejected holding the post
 * because "a held post per press would roll the swear once per press at
 * Begin". Batch Mode held a participant's card move per press, or made each
 * press its presser's entry: two players' presses rolled two Swear an Iron
 * Vows. Now a press is not rolled when the card is sworn, or its swear is
 * already an entry, an offer or held for the next round; its presser is told,
 * and their button is live again.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
  const button = table.client(userId).click(card._id, '[data-action="sf-swear-vow"]');
  await table.settle();
  return button;
}
const dropped = (userId) => table.cards(f => f.swearPressDropped).filter(c => c.whisper?.includes(userId)).map(c => c.content).join(' ');

async function relay(userId, kind, payload) {
  const gmRelay = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  await table.client(userId).run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
}

describe('two participants press the inciting ⚔ in Batch Mode (issue #342 Z30)', () => {
  it('before Begin a Session: the crew swears the inciting vow once — one Swear an Iron Vow roll at Begin', async () => {
    const card = await postIncitingCard();
    await press('pl-1', card);
    const quinnsButton = await press('pl-2', card);
    // Pat's press is held for the next round (no session yet); Quinn's is not
    // rolled — he is told, and his button is live again.
    expect(table.cards(f => f.batchHeldMoveNotice)).toHaveLength(1);
    expect(dropped('pl-2')).toMatch(/already swearing this vow for the crew/);
    expect(quinnsButton.disabled).toBe(false);

    await relay('gm-1', 'session.begin', { vignetteRolled: false, includeGalley: false });
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { moveId: 'swear_an_iron_vow' } });
    expect(round().entries['pl-2']).toMatchObject({ status: 'waiting' });
    for (const id of ['pl-1', 'pl-2']) {
      const r = round();
      if (r.entries[id]?.status === 'read') {
        await relay(id, 'batch.confirm', { roundId: r.id, submissionId: r.entries[id].submissionId, choices: {} });
      } else {
        await relay(id, 'batch.pass', { roundId: r.id });
      }
    }
    await table.drain();

    // Sanity: the vow was created once (one copy per PC), whoever rolled.
    const copies = ['pc-kira', 'pc-ren'].map(id => (table.actors.get(id).items?.contents ?? [])
      .filter(i => i?.flags?.[MODULE_ID]?.vowId === card._id).length);
    expect(copies).toEqual([1, 1]);
    // One roll: Pat's, the first press.
    expect(swearCards().map(m => m.flags[MODULE_ID].roundNumber)).toEqual(swearCards().map(() => 1));
    expect(swearCards()).toHaveLength(1);
    expect(swearCards()[0].flags[MODULE_ID].roundUserId).toBe('pl-1');
  }, 30_000);

  it('during a round (the card posted in session, as the First Session page orders it): the second press is not rolled', async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, vowSwearingNarration: false,
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
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });

    const card = await postIncitingCard();
    await press('pl-1', card);
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { moveId: 'swear_an_iron_vow' } });
    await press('pl-2', card);
    await table.drain();
    expect(round().entries['pl-2']).toMatchObject({ status: 'waiting' });            // not his entry
    expect(dropped('pl-2')).toMatch(/Kira is already swearing this vow for the crew this round/);

    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: r.id });
    await table.drain();
    expect(swearCards()).toHaveLength(1);
    expect(table.world.message(card._id).flags[MODULE_ID].vowSworn).toBe(true);

    // A stale render's press after it was sworn: not rolled either.
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: 'Swear an iron vow: I will free the relay crew.',
      speaker: { actor: 'pc-ren' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'swear_an_iron_vow', incitingSwearMessageId: card._id } },
    }));
    await table.settle();
    await table.drain();
    expect(round().entries['pl-2']).toMatchObject({ status: 'waiting' });
    expect(table.cards(f => f.swearPressDropped).map(c => c.content).join(' ')).toMatch(/This vow has already been sworn/);
    expect(swearCards()).toHaveLength(1);
  }, 30_000);
});

describe('control — free-flow', () => {
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
