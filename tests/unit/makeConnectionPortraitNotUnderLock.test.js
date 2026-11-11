/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionPortraitNotUnderLock.test.js
 *
 * Issue #347 AB01 (MAKE-CONNECTION-LOCK-HELD-FOR-PORTRAIT; the audit's
 * makeConnectionHoldsMoveLockForPortrait probe). A Make a Connection hit's
 * capture runs inside its narration call, inside the table's move lock:
 *
 *   src/index.js onMessage (holds `pendingMove`)
 *     → narrateResolution → runPostNarrationPasses → routeEntityDrafts
 *       → createConnection
 *       → postCreationEnrichment → generatePortrait   (the image, its retry,
 *         the download, the Art Cache write, the upload)
 *       → registerConnectionOnActiveCharacter          (the bond — only after)
 *     → recordMove, then the lock's release            (only after)
 *
 * With an OpenRouter key and Auto-Seed NPC off (the defaults), every such hit
 * waited for the portrait: no other move could start, the move's meters and
 * record waited, the roller held no bond — and the upload had no deadline
 * (AB02), so a stalled one held the table until a reload. The same wait sat
 * in a hit that confirms a pending draft row (confirmDraft's enrichment).
 *
 * The portrait is now started and not awaited, after the bond: the capture
 * returns once the card and the bond exist.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const art = vi.hoisted(() => {
  const state = { calls: [], gate: null, called: null };
  state.arm = () => {
    state.calls.length = 0;
    let open, seen;
    state.gate = new Promise(resolve => { open = resolve; });
    state.called = new Promise(resolve => { seen = resolve; });
    state.release = () => open(null);
    state.seen = seen;
  };
  state.arm();
  return state;
});
vi.mock('../../src/art/generator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // The image request: out until the test releases it.
  generatePortrait: vi.fn(async (hostId, typeKey) => {
    art.calls.push({ hostId, typeKey });
    art.seen();
    return art.gate;
  }),
}));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0,
    rationale: 'a new contact', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge dice 3 and 4, action die 6: a strong hit.
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const EMPTY_WJ = { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] };
const LINE = 'I ask Sable Ortiz to vouch for me with the salvage guild.';
const isNarration = (call) => call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');

let table;
const world = () => table.world.campaignState();
const sable = () => table.actors.find(a => a?.name === 'Sable Ortiz' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const narrationPosted = () => table.cards(f => f.narratorCard && !f.narrationFallback).length > 0;
const moveCard = () => table.world.messages().find(m => /Connection made/.test(m.content ?? ''));
const draftCard = () => table.cards(f => f.draftEntityCard)[0];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(async () => { art.release?.(); await table?.teardown(); });

/** A fresh table; `detected` — what the detection pass returns for the move's narration. */
async function resetWith({ openRouterKey, detected = [SABLE] }) {
  art.release?.();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [],
    },
  } } });
  art.arm();
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.client('gm-1').setSetting('openRouterApiKey', openRouterKey);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return JSON.stringify({ entities: detected, renames: [], worldJournal: EMPTY_WJ });
    if (isNarration(call)) return NARRATION;
    return '{}';
  } });
  await table.settle();
}

/** While the image is out: what the table can see, then the image comes back. */
async function whileImageIsOut() {
  await art.called;                 // the image request is out
  await table.settle();             // everything that can run without it has run
  const seen = {
    pendingMove:  world().pendingMove,
    bonds:        bondNames('pc-kira'),
    narration:    narrationPosted(),
    moveCard:     !!moveCard(),
    portraitFor:  art.calls.map(c => c.hostId),
  };
  art.release();                    // the image comes back (none, here)
  await table.settle(); await table.drain();
  return seen;
}

describe('a Make a Connection hit and the new NPC\'s portrait', () => {
  it('control: with no image key the hit resolves — lock released, bond on Kira', async () => {
    await resetWith({ openRouterKey: '' });
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.drain();

    expect(art.calls, 'no image is requested without a key').toHaveLength(0);
    expect(moveCard(), 'the move card').toBeTruthy();
    expect(sable(), "Sable Ortiz's card").toBeTruthy();
    expect(world().pendingMove).toBe(false);
    expect(bondNames('pc-kira')).toEqual(['Sable Ortiz']);
  }, 60_000);

  it('while the new NPC\'s portrait is generated, the move lock is free and Kira holds the bond', async () => {
    await resetWith({ openRouterKey: 'sk-or-test' });
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    const seen = await whileImageIsOut();

    expect(seen.narration, 'the narration card is in chat').toBe(true);
    expect(seen.moveCard, 'the move card says "Connection made"').toBe(true);
    expect(seen.portraitFor, "the portrait is Sable's").toEqual([sable()?.id]);
    expect(seen.pendingMove, 'the move lock is free while the image is generated').toBe(false);
    expect(seen.bonds, 'the roller holds the bond while the image is generated').toEqual(['Sable Ortiz']);

    // And once it is back nothing changed: one card, one bond, the lock free.
    expect(world().pendingMove).toBe(false);
    expect(bondNames('pc-kira')).toEqual(['Sable Ortiz']);
    expect(table.actors.filter(a => a?.name === 'Sable Ortiz')).toHaveLength(1);
  }, 60_000);

  it('a hit that confirms a pending draft row holds the lock no longer than the confirm: the portrait is not awaited', async () => {
    // The detector leaves a pending name out; the hit's narration names her row.
    await resetWith({ openRouterKey: 'sk-or-test', detected: [] });
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts([SABLE], game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false, actorId: 'pc-kira' }));
    await table.settle();
    expect(draftCard()?.flags?.[MODULE_ID]?.drafts?.[0], 'Sable is pending on the GM\'s draft card (setup)')
      .toMatchObject({ name: 'Sable Ortiz', status: 'pending' });

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    const seen = await whileImageIsOut();

    expect(seen.portraitFor, "the portrait is Sable's").toEqual([sable()?.id]);
    expect(seen.pendingMove, 'the move lock is free while the image is generated').toBe(false);
    expect(seen.bonds, 'the roller holds the bond while the image is generated').toEqual(['Sable Ortiz']);
    expect(draftCard().flags[MODULE_ID].drafts[0].status, 'her row is confirmed').toBe('confirmed');
  }, 60_000);
});
