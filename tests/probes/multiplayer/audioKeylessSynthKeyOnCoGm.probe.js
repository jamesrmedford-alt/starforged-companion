/**
 * Eleventh audit — multiplayer probe (MP-6).
 *
 * "Only the GM needs an ElevenLabs key — players hear the GM-generated audio
 * without configuring a key of their own" (help, Audio Narration). A keyless
 * player's Play asks for the clip over the socket (`audio.synth.request`,
 * src/audio/index.js requestGmSynthesis); only the CANONICAL GM answers it
 * (handleSynthRequest: `if (!isCanonicalGM()) return`), and the canonical GM
 * is chosen by the Claude-key registry and the lowest id — not by who holds
 * an ElevenLabs key. At a two-GM table where the co-GM holds the ElevenLabs
 * key and the canonical GM does not, the canonical GM answers "no clip"
 * (`apiKey` empty → signalDone(null)) and the co-GM, who could make it,
 * stands down: every keyless player's Play is "Narrator audio isn't ready yet
 * — ask the GM to play this card once", and the help's Troubleshooting says
 * that means "no GM with a key is online" — one is. (The audio twin of the
 * open AUTOSEED-KEYLESS-CANONICAL, which is the OpenRouter key's.)
 *
 * Correct: a GM who holds the key makes the clip, and the player gets its path.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';
import { cacheKey } from '../../../src/audio/cache.js';

const SOCKET = `module.${MODULE_ID}`;
const PROSE = 'The hull groans and holds.';
const SPEC = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', speed: 1.0, text: PROSE };

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    'audio.enabled': true, 'audio.narratorVoiceId': 'voice-narrator', 'audio.npcVoiceId': 'voice-npc',
    'audio.modelId': 'eleven_flash_v2_5', 'audio.speed': 1.0,
    chronicleAutoEntry: false, narratorSessionSummary: false,
  } } });
  foundry.applications.apps.FilePicker.implementation._reset();
  synthesise.mockClear();
  for (const id of ['gm-1', 'gm-2', 'pl-1']) await table.client(id).setSetting('elevenLabsApiKey', '');
  // The narrator card everyone holds — posted by the canonical GM (Gina, the lower id).
  await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-narration-card"><div class="sf-narration-prose">${PROSE}</div></div>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE, sessionId: 's1' } },
  }));
  await table.settle();
});

/** Pat (keyless) asks for the card's clip, as his Play does; the GM's answer, or none. */
async function patAsksForTheClip() {
  const hash = await cacheKey(SPEC);
  const answers = [];
  const pat = table.client('pl-1');
  pat.listenSocket(SOCKET, (payload) => { if (payload?.kind === 'audio.synth.done' && payload.hash === hash) answers.push(payload); });
  pat.run(() => game.socket.emit(SOCKET, { kind: 'audio.synth.request', hash, spec: SPEC }));
  await table.settle();
  await table.drain();
  return answers;
}

describe('MP-6 — a keyless player\'s clip when the ElevenLabs key is a co-GM\'s', () => {
  it('control: with the key on the canonical GM (Gina) the clip is made and its path sent', async () => {
    await table.client('gm-1').setSetting('elevenLabsApiKey', 'sk_el_gina');
    const answers = await patAsksForTheClip();
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(answers.at(-1)?.path).toMatch(/\.mp3$/);
  }, 30_000);

  it('with the key on the co-GM (Gus) only, the clip is still made for Pat', async () => {
    await table.client('gm-2').setSetting('elevenLabsApiKey', 'sk_el_gus');
    const answers = await patAsksForTheClip();
    // Correct: Gus's key makes it. Today Gina (canonical, keyless) answers
    // `path: null` and Gus stands down: nothing synthesised.
    expect(synthesise.mock.calls.length).toBe(1);
    expect(answers.at(-1)?.path ?? null).not.toBeNull();
  }, 30_000);
});
