/**
 * STARFORGED COMPANION
 * tests/unit/xcardIncitingPremise.test.js
 *
 * XCARD-INCITING-PREMISE — X-carding the inciting card takes the campaign
 * premise with it.
 *
 * runIncitingIncident saves the opening fiction as `campaignState
 * .incitingIncident`, which every narrator prompt renders as CAMPAIGN PREMISE
 * — canon. The X-Card on the inciting card took its ledger entries, lore and
 * capture (issue #329 X01) but left the premise, so the removed beat was
 * restated as canon in every later narration. The premise now carries its
 * narration's id, and the X-Card's pause write drops it
 * (applyXCardToNarratorMemory → dropXCardedPremise).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/narration/narrator.js', () => ({
  narrateIncitingIncident: vi.fn(),
  runPacedDetection:       vi.fn(async () => {}),
  runNarrationTierUpdate:  vi.fn(async () => {}),
}));
vi.mock('../../src/world/worldJournal.js', () => ({
  recordLoreDiscovery: vi.fn(async () => {}),
}));

import { narrateIncitingIncident } from '../../src/narration/narrator.js';
import { runIncitingIncident } from '../../src/session/incitingIncident.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const TEXT = [
  'The beacon at Paradox Station screams a distress code no one has used in a century.',
  '',
  'Suggested vow: Find who silenced the beacon (dangerous)',
  'Situation: Paradox Station has gone dark and its beacon is screaming.',
].join('\n');

const cached = () => game.settings.get(MODULE_ID, 'campaignState');
const actual = () => vi.importActual('../../src/narration/narrator.js');
const premiseBlock = async (cs) => {
  const { buildNarratorSystemPrompt } = await vi.importActual('../../src/narration/narratorPrompt.js');
  return buildNarratorSystemPrompt(cs, {}, null, '', {});
};

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, { currentSessionId: 'ssn-1', currentSceneId: null, sceneTruths: [], safetyFlags: [] });
  game.user.isGM = true;
  global.game.messages = { contents: [] };
  vi.mocked(narrateIncitingIncident).mockReset();
  vi.mocked(narrateIncitingIncident).mockResolvedValue(TEXT);
});

describe('XCARD-INCITING-PREMISE — the X-Card on the inciting card drops the campaign premise', () => {
  it('the premise carries the narration id its card carries', async () => {
    await runIncitingIncident(cached());
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    expect(card.flags[MODULE_ID].narrationId).toBeTruthy();
    expect(cached().incitingIncident.narrationId).toBe(card.flags[MODULE_ID].narrationId);
  });

  it('an X-Card answering the inciting card takes the premise out of every prompt', async () => {
    await runIncitingIncident(cached());
    global.game.messages = { contents: ChatMessage._created.slice() };
    const cs = { ...cached() };
    expect(await premiseBlock(cs)).toMatch(/CAMPAIGN PREMISE[\s\S]*Paradox Station/);

    const { applyXCardToNarratorMemory } = await actual();
    const removal = applyXCardToNarratorMemory(cs);
    expect(removal.cards.length).toBe(1);
    expect(cs.incitingIncident).toBeNull();
    expect(await premiseBlock(cs)).not.toMatch(/CAMPAIGN PREMISE/);
  });

  it('a premise saved before it carried an id goes with an X-carded inciting card of its session', async () => {
    await runIncitingIncident(cached());
    global.game.messages = { contents: ChatMessage._created.slice() };
    const cs = { ...cached(), incitingIncident: { ...cached().incitingIncident, narrationId: undefined } };
    const { applyXCardToNarratorMemory } = await actual();
    applyXCardToNarratorMemory(cs);
    expect(cs.incitingIncident).toBeNull();
  });

  it('control: an X-Card on a later narration leaves the premise', async () => {
    await runIncitingIncident(cached());
    await ChatMessage.create({ content: 'I head for the station.' });   // a player's line: a new beat
    await ChatMessage.create({ content: '<p>Later.</p>', flags: { [MODULE_ID]: {
      narratorCard: true, narrationText: 'The station lights flicker back on.', sessionId: 'ssn-1', narrationId: 'nar-later',
    } } });
    global.game.messages = { contents: ChatMessage._created.slice() };
    const cs = { ...cached() };
    const { applyXCardToNarratorMemory } = await actual();
    const removal = applyXCardToNarratorMemory(cs);
    expect(removal.cards.map(c => c.flags[MODULE_ID].narrationId)).toEqual(['nar-later']);
    expect(cs.incitingIncident?.prose).toMatch(/Paradox Station/);
  });
});
