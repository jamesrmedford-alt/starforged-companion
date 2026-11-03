/**
 * PROBE — FC-07 CHRONICLE-WRITER-THINKING-CAP
 * (src/character/chronicleWriter.js callChronicleAPI / readModel)
 *
 * What the user does: picks "Sonnet 5 (latest, most capable)" as the
 * Narration Model in Companion Settings (one of the three offered —
 * settingsPanel.js NARRATION_MODELS) and plays with automatic chronicle
 * entries on (the default).
 *
 * What happens: the chronicle scribe is not pinned to Haiku — readModel()
 * returns the narration model whenever it is set (DEFAULT_MODEL Haiku is only
 * a fallback for an unset setting, which never happens: the setting has a
 * default). Its request carries `max_tokens: 200` and no `thinking` field.
 * The repo's own narrator rule says why that fails on this model:
 * "Sonnet 5 runs ADAPTIVE THINKING BY DEFAULT when the `thinking` param is
 * omitted — … lets thinking consume the max_tokens cap, truncating the
 * prose" (narrator.js narrationDisablesThinking; decisions.md "Narrator
 * latency: … thinking-off by exact model id"; the Claude API model table:
 * Sonnet 5, omitting `thinking` → runs adaptive; `{type: "disabled"}`
 * accepted). With 200 tokens shared between thinking and the JSON, the reply
 * comes back with no text block or a cut-off object: callChronicleAPI returns
 * null / parseEntry fails, and the beat is silently not chronicled. Same
 * narration-model-without-thinking-off pattern in entities/finalize.js,
 * shipEnvision.js, connection.js, ship.js and moves/shipMapVision.js (other
 * areas).
 *
 * What should happen: the scribe's short structured call either runs on the
 * fixed Haiku model its header and DEFAULT_MODEL describe, or sends
 * `thinking: { type: "disabled" }` on a model narrationDisablesThinking()
 * names, as callNarratorAPI does.
 *
 * Asserts the CORRECT request shape; fails today.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/character/chronicle.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestChronicleEdit: vi.fn(async () => ({ ok: true, relayed: false, result: { applied: true } })),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { writeChronicleEntry } from '../../../src/character/chronicleWriter.js';
import { narrationDisablesThinking } from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: '{"type":"scar","salience":"significant","text":"Kira took a blade across the ribs."}' }] });
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.user.isGM = true;
});

describe('the chronicle scribe on the Sonnet 5 narration model', () => {
  it('control: the narrator itself turns thinking off for this model', () => {
    expect(narrationDisablesThinking('claude-sonnet-5')).toBe(true);
  });

  it('runs on Haiku, or turns thinking off, for its 200-token JSON reply', async () => {
    game.settings._store.set(`${MODULE_ID}.narrationModel`, 'claude-sonnet-5');
    await writeChronicleEntry({
      narrationText: 'The blade opens a line across Kira\'s ribs.',
      campaignState: { currentSessionId: 's1', characterIds: ['actor-1'] },
      moveId: 'clash', outcome: 'miss', kind: 'move',
    });

    const body = apiPost.mock.calls[0][2];
    expect(body.max_tokens).toBe(200);
    // Today: { model: 'claude-sonnet-5', max_tokens: 200 } and no `thinking` field.
    const safe = /haiku/.test(body.model) || body.thinking?.type === 'disabled';
    expect({ model: body.model, thinking: body.thinking ?? null, safe }).toMatchObject({ safe: true });
  });
});
