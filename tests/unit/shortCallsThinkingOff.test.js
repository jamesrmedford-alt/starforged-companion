/**
 * The short structured Claude calls that run on the narration model turn
 * extended thinking off where narration does (issue #325 W27).
 *
 * narrator.js turns thinking off for Sonnet 5 (offered as a Narration Model),
 * which runs adaptive thinking by default when a request omits `thinking` —
 * and thinking shares the `max_tokens` cap. The chronicle scribe
 * (`max_tokens: 200`, on the narration model: its Haiku default only covers
 * an unset setting), the entity flavour (finalize.js), the ship envisioning,
 * the NPC and ship seeds (220 tokens) and the deck-plan vision sent no
 * `thinking`: their replies could come back with no text block or a cut-off
 * object, and the entry, seed or notes were silently not written. They now
 * share narration's rule (narration/thinking.js).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/character/chronicle.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestChronicleEdit: vi.fn(async () => ({ ok: true, relayed: false, result: { applied: true } })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { createConnection, seedConnectionActor } from '../../src/entities/connection.js';
import { narrationDisablesThinking, thinkingOffFor } from '../../src/narration/thinking.js';
import { narrationDisablesThinking as narratorRule } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: '{"type":"scar","salience":"significant","text":"Kira took a blade across the ribs."}' }] });
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.user.isGM = true;
});

describe('the rule', () => {
  it('Sonnet 5 turns thinking off; Sonnet 4.5 is left alone; Sonnet 5.5 is never sent "disabled"', () => {
    expect(thinkingOffFor('claude-sonnet-5')).toEqual({ thinking: { type: 'disabled' } });
    expect(thinkingOffFor('claude-sonnet-4-5-20250929')).toEqual({});
    expect(thinkingOffFor('claude-sonnet-5-5')).toEqual({});
  });

  it('control: narrator.js re-exports the same rule', () => {
    expect(narratorRule).toBe(narrationDisablesThinking);
  });
});

describe('the calls on the Sonnet 5 narration model', () => {
  it('the chronicle scribe turns thinking off for its 200-token JSON reply', async () => {
    game.settings._store.set(`${MODULE_ID}.narrationModel`, 'claude-sonnet-5');
    await writeChronicleEntry({
      narrationText: 'The blade opens a line across Kira\'s ribs.',
      campaignState: { currentSessionId: 's1', characterIds: ['actor-1'] },
      moveId: 'clash', outcome: 'miss', kind: 'move',
    });
    const body = apiPost.mock.calls[0][2];
    expect(body).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 200, thinking: { type: 'disabled' } });
  });

  it("an NPC seed's introduction turns thinking off", async () => {
    game.settings._store.set(`${MODULE_ID}.narrationModel`, 'claude-sonnet-5');
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: 'Mira Kade keeps her burned hand gloved.' }] });
    global.game.actors._reset();
    const state = { ...CampaignStateSchema, connectionIds: [], sectors: [] };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);
    await createConnection({ name: 'Mira Kade', role: 'Courier', goal: 'Pay a debt', firstLook: ['Burned hand'] }, state, { persist: false });
    await seedConnectionActor(global.game.actors.get(state.connectionIds[0]), state, { force: true });

    const seedCall = apiPost.mock.calls.find(([, , body]) => body?.max_tokens === 220);
    expect(seedCall).toBeDefined();
    expect(seedCall[2].thinking).toEqual({ type: 'disabled' });
  });

  it('control: on Sonnet 4.5 the scribe sends no thinking field', async () => {
    game.settings._store.set(`${MODULE_ID}.narrationModel`, 'claude-sonnet-4-5-20250929');
    await writeChronicleEntry({
      narrationText: 'The blade opens a line across Kira\'s ribs.',
      campaignState: { currentSessionId: 's1', characterIds: ['actor-1'] },
      moveId: 'clash', outcome: 'miss', kind: 'move',
    });
    expect(apiPost.mock.calls[0][2].thinking).toBeUndefined();
  });
});
