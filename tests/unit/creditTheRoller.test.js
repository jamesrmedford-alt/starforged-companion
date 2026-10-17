/**
 * STARFORGED COMPANION
 * tests/unit/creditTheRoller.test.js
 *
 * decisions.md → "Multiplayer attribution": move effects land on the player
 * who rolled, resolved from the chat speaker — never "the first PC in the
 * world". Covers the 2026-10 audit fixes in src/index.js:
 *   - the move pipeline's ability scan reads the SPEAKER's assets (and the
 *     same actor's stats), not getPlayerActors()[0];
 *   - a routed Pay the Price suffer lands on the typist's PC;
 *   - a won fight's vow milestone marks the PC that holds the vow.
 * Plus the single-emitter world-truths journal hooks (isCanonicalGM).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/interpreter.js', () => ({
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0,
    rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => false),   // stop right after the scan
}));
vi.mock('../../src/oracles/roller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn((tableId) => ({
    tableId, tableName: 'Pay the Price', roll: 42, result: 'You are harmed',
    isRef: false, sufferRoute: { move: 'endure_harm', amount: 1 },
  })),
}));
vi.mock('../../src/moves/sufferExecutor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  executeSuffer: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../src/oracles/oracleFollowup.js', () => ({
  requestOracleNarration:    vi.fn(),
  narrateOracleFollowupOnGm: vi.fn(async () => null),
}));

import { registerChatHook, resolveVowHolderActor } from '../../src/index.js';
import { scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';
import { executeSuffer } from '../../src/moves/sufferExecutor.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM  = { id: 'gm-1', isGM: true,  active: true };
const GM2 = { id: 'gm-2', isGM: true,  active: true };
const P1  = { id: 'pl-1', isGM: false, active: true };

// Captured at import time — index.js registers these at module load, and the
// tests below clear Hooks._handlers for the chat hook.
const journalPageHook = Hooks._handlers.get('createJournalEntryPage')?.[0];
const journalHook     = Hooks._handlers.get('createJournalEntry')?.[0];

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function vowItem(id, name, flags = {}) {
  return { id, name, type: 'progress', system: { subtype: 'vow', rank: 'dangerous', current: 0 }, flags: { [MODULE_ID]: flags } };
}

let pcA, pcB;

beforeEach(() => {
  Hooks._handlers.delete('createChatMessage');
  ChatMessage._reset();
  scanForApplicableAbilities.mockClear();
  executeSuffer.mockClear();
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [] } });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [vowItem('v-b', 'Find the Archive')] } });
  game.actors._setAll([pcA, pcB]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, pendingMove: false, sessionActive: true, worldTruthsSet: false,
  });
});

describe('move pipeline — the ability scan reads the roller\'s character', () => {
  it('scans the speaker\'s PC, not the first PC in the world', async () => {
    setUsers([GM, P1], 'gm-1');
    registerChatHook();
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
    await handler({
      type: 'ic', content: 'I brace against the hull breach and hold.',
      author: { id: 'pl-1' }, speaker: { actor: 'pc-b' }, flags: {},
    });
    expect(scanForApplicableAbilities).toHaveBeenCalledTimes(1);
    expect(scanForApplicableAbilities.mock.calls[0][0].characterActor).toBe(pcB);
  });
});

describe('!pay-the-price — a routed suffer lands on the typist\'s PC', () => {
  it('endure_harm is dispatched against the speaker\'s actor', async () => {
    setUsers([GM, P1], 'pl-1');
    registerChatHook();
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
    await handler({ content: '!ptp', author: { id: 'pl-1' }, speaker: { actor: 'pc-b' }, flags: {} });
    expect(executeSuffer).toHaveBeenCalledTimes(1);
    expect(executeSuffer.mock.calls[0][0]).toBe('endure_harm');
    expect(executeSuffer.mock.calls[0][1]).toBe(pcB);
  });
});

describe('resolveVowHolderActor — the PC that actually holds the vow', () => {
  it('finds the holder rather than the first PC', () => {
    expect(resolveVowHolderActor('Find the Archive')).toBe(pcB);
  });

  it('ignores a preferred actor that does not hold the vow', () => {
    expect(resolveVowHolderActor('Find the Archive', 'pc-a')).toBe(pcB);
  });

  it('prefers the roller\'s copy of a shared vow', () => {
    pcA.items.contents.push(vowItem('v-a', 'Find the Archive', { vowId: 'shared-1' }));
    pcB.items.contents[0].flags[MODULE_ID].vowId = 'shared-1';
    expect(resolveVowHolderActor('Find the Archive', 'pc-b')).toBe(pcB);
    expect(resolveVowHolderActor('Find the Archive', 'pc-a')).toBe(pcA);
  });

  it('an unmatched name resolves to the sole open vow\'s holder (resolveVowItemCopies ladder)', () => {
    expect(resolveVowHolderActor('Nonexistent')).toBe(pcB);
  });

  it('falls back to the first PC only when no vow resolves', () => {
    pcA.items.contents.push(vowItem('v-a2', 'Repay the Debt'));
    expect(resolveVowHolderActor('Nonexistent')).toBe(pcA);
  });
});

describe('world-truths journal hooks — single emitter (isCanonicalGM)', () => {
  const truthsPage = () => ({
    type: 'text', flags: {}, text: { content: '<h2>Cataclysm</h2><h2>Exodus</h2>' },
    parent: { id: 'j-truths', name: 'Setting Truths', flags: {} },
  });

  beforeEach(() => {
    game.i18n = { localize: () => 'Setting Truths' };
  });

  it('the hooks are registered at module load', () => {
    expect(typeof journalPageHook).toBe('function');
    expect(typeof journalHook).toBe('function');
  });

  it('the canonical GM records the truths', async () => {
    setUsers([GM, GM2], 'gm-1');
    await journalPageHook(truthsPage());
    const cs = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(cs.worldTruthsSet).toBe(true);
    expect(cs.worldTruthsJournalId).toBe('j-truths');
  });

  it('a second (non-canonical) GM does not double-write', async () => {
    setUsers([GM, GM2], 'gm-2');
    const set = vi.spyOn(game.settings, 'set');
    await journalPageHook(truthsPage());
    await journalHook({ id: 'j-truths', name: 'Setting Truths', flags: {} });
    expect(set).not.toHaveBeenCalled();
  });
});
