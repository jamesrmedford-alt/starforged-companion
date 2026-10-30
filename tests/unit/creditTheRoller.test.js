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
 *
 * The pipeline, `!ptp` and journal-hook cases run on a booted multi-client
 * table (tests/helpers/multiClient.js, issue #282): the player types on their
 * own client, the canonical GM's pipeline runs, and the journal hooks fire on
 * every client — so "on whose client, for whose PC" is observed, not set up.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const seen = vi.hoisted(() => ({ suffer: [] }));

vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
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
    isRef: false, sufferRoutes: [{ move: 'endure_harm', amount: 1 }],
  })),
}));
vi.mock('../../src/moves/sufferExecutor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  executeSuffer: vi.fn(async (move, actor) => {
    seen.suffer.push({ on: globalThis.game?.user?.id, move, actor: actor?.id });
    return { ok: true };
  }),
}));

import { resolveVowHolderActor } from '../../src/index.js';
import { scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function vowItem(id, name, flags = {}) {
  return { id, name, type: 'progress', system: { subtype: 'vow', rank: 'dangerous', current: 0 }, flags: { [MODULE_ID]: flags } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Across a booted table
// ─────────────────────────────────────────────────────────────────────────────

describe('across a booted table', () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2],
      i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': 'Setting Truths' },
    });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      campaignState: { ...CampaignStateSchema, pendingMove: false, sessionActive: true, worldTruthsSet: false },
    } } });
    table.addActor({ id: 'pc-a', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-b', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [vowItem('v-b', 'Find the Archive')] } });
    scanForApplicableAbilities.mockClear();
    seen.suffer.length = 0;
  });

  it('the move pipeline scans the roller\'s PC — the speaker — not the first PC in the world', async () => {
    await table.client('pl-1').chat('I brace against the hull breach and hold.', { speaker: { actor: 'pc-b' } });
    await table.settle();
    expect(scanForApplicableAbilities).toHaveBeenCalledTimes(1);
    expect(scanForApplicableAbilities.mock.calls[0][0].characterActor.id).toBe('pc-b');
  });

  it('with no token selected the scan reads the PC the typist owns', async () => {
    await table.client('pl-2').chat('I scramble up the ladder before it gives.', { speaker: { actor: null } });
    await table.settle();
    expect(scanForApplicableAbilities.mock.calls[0][0].characterActor.id).toBe('pc-a');
  });

  it('!pay-the-price: the routed suffer lands on the typist\'s PC — once, on the typist\'s client', async () => {
    await table.client('pl-1').chat('!ptp', { speaker: { actor: 'pc-b' } });
    await table.settle();
    expect(seen.suffer).toEqual([{ on: 'pl-1', move: 'endure_harm', actor: 'pc-b' }]);
  });

  describe('world-truths journal hooks — one writer however many GMs see the journal', () => {
    const truthsPage = () => ({
      type: 'text', flags: {}, text: { content: '<h2>Cataclysm</h2><h2>Exodus</h2>' },
      parent: { id: 'j-truths', name: 'Setting Truths', flags: {} },
    });

    function campaignStateWriters() {
      const writers = [];
      table.client('pl-1').listen('updateSetting', (setting, _c, _o, userId) => {
        if (setting.key === `${MODULE_ID}.campaignState`) writers.push(userId);
      });
      return writers;
    }

    it('a truths page — created on the second GM\'s client — is recorded once, by the canonical GM', async () => {
      const writers = campaignStateWriters();
      table.fireDocumentHook('gm-2', 'createJournalEntryPage', truthsPage());
      await table.settle();
      expect(table.world.campaignState()).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: 'j-truths' });
      expect(writers).toEqual(['gm-1']);
    });

    it('the truths journal itself is linked once, by the canonical GM', async () => {
      const writers = campaignStateWriters();
      table.fireDocumentHook('gm-2', 'createJournalEntry', { id: 'j-truths', name: 'Setting Truths', flags: {} });
      await table.settle();
      expect(table.world.campaignState().worldTruthsJournalId).toBe('j-truths');
      expect(writers).toEqual(['gm-1']);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveVowHolderActor — unit
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveVowHolderActor — the PC that actually holds the vow', () => {
  let pcA, pcB;

  beforeEach(() => {
    pcA = makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [] } });
    pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [vowItem('v-b', 'Find the Archive')] } });
    game.actors._setAll([pcA, pcB]);
  });

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
