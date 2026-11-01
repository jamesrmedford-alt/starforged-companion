/**
 * STARFORGED COMPANION
 * tests/unit/narrationIdCards.test.js
 *
 * Every narrator card carries the id of the narration it shows, the same id
 * the narration's sidecar stamped on its ledger entries — what an X-Card on
 * the card retracts (issue #321 U07). The narrator stamps its own cards (move,
 * paced, @scene, oracle follow-up, vow scene — xcardNarratorMemory tests);
 * these are the callers that post a narration's card themselves: the Begin a
 * Session galley vignette and clock vignettes, `!clock`, Pay the Price's
 * trigger vignette, and the inciting incident. Each makes the id, hands it to
 * the narration, and puts it on the card.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const INCITING = [
  'The beacon at Paradox Station screams a distress code no one has used in a century.',
  '',
  'Suggested vow: Find who silenced the beacon (dangerous)',
].join('\n');

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateSessionVignette:  vi.fn(async () => 'The galley smells of burnt recaf.'),
  narrateClockAdvancement: vi.fn(async () => 'The net tightens.'),
  narrateIncitingIncident: vi.fn(async () => INCITING),
  runPacedDetection:       vi.fn(async () => {}),
  runNarrationTierUpdate:  vi.fn(async () => {}),
}));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => ({
  ...(await importOriginal()),
  recordLoreDiscovery: vi.fn(async () => {}),
}));
vi.mock('../../src/character/actorBridge.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPlayerActors:   vi.fn(() => []),
  applyMeterChanges: vi.fn(async () => {}),
  advanceVowClocks:  vi.fn(async () => []),
}));

import { narrateSessionVignette, narrateClockAdvancement, narrateIncitingIncident } from '../../src/narration/narrator.js';
import { applyBeginSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice } from '../../src/clocks/payThePriceClocks.js';
import { runIncitingIncident } from '../../src/session/incitingIncident.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const flags = (m) => m?.flags?.[MODULE_ID] ?? {};
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

/** The card showing `text` once it has posted, and the id the narration that wrote it was given. */
async function linked(mockFn, text) {
  const find = () => ChatMessage._created.find(m => flags(m).narrationText === text);
  await vi.waitFor(() => expect(find()).toBeDefined(), { timeout: 5000 });
  return { card: flags(find()).narrationId, narration: mockFn.mock.calls.at(-1)?.[0]?.narrationId };
}

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  global.game.messages = { contents: [] };
  Hooks.callAll = vi.fn();     // Begin a Session announces the state change
});
afterEach(() => {
  delete Hooks.callAll;
  game.settings._store.clear();
});

describe('a narrator card posted by its caller carries its narration id', () => {
  it('the Begin a Session galley vignette', async () => {
    game.settings._store.set(KEY, { sessionActive: false, clocks: [] });
    await applyBeginSession({ vignetteRolled: true, includeGalley: true }, {});
    await settle();
    const { card, narration } = await linked(narrateSessionVignette, 'The galley smells of burnt recaf.');
    expect(typeof narration).toBe('string');
    expect(card).toBe(narration);
  });

  it('a `!clock advance` vignette', async () => {
    game.settings._store.set(KEY, { clocks: [{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 1, active: true }] });
    await handleClockCommand({ content: '!clock advance Breach', flags: {} });
    await settle();
    const { card, narration } = await linked(narrateClockAdvancement, 'The net tightens.');
    expect(typeof narration).toBe('string');
    expect(card).toBe(narration);
  });

  it("Pay the Price's trigger vignette", async () => {
    game.settings._store.set(KEY, { clocks: [{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 3, active: true }] });
    await advanceClocksOnPayThePrice();
    await settle();
    const { card, narration } = await linked(narrateClockAdvancement, 'The net tightens.');
    expect(typeof narration).toBe('string');
    expect(card).toBe(narration);
  });

  it('the inciting incident', async () => {
    game.settings._store.set(KEY, { currentSessionId: 'ssn-1' });
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => flags(m).incitingIncidentCard);
    const narration = narrateIncitingIncident.mock.calls.at(-1)[0].narrationId;
    expect(typeof narration).toBe('string');
    expect(flags(card).narrationId).toBe(narration);
  });
});
