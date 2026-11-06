/**
 * A keyless player's narrator audio is made by a GM who holds the ElevenLabs
 * key, whichever GM that is (issue #342 Z67,
 * AUDIO-KEYLESS-SYNTH-ON-KEYLESS-CANONICAL).
 *
 * "Only the GM needs an ElevenLabs key — players hear the GM-generated audio
 * without configuring a key of their own" (help, Audio Narration). A keyless
 * player's Play asks for the clip over the socket (`audio.synth.request`,
 * src/audio/index.js requestGmSynthesis), and only the CANONICAL GM answered
 * it — chosen by the Claude-key registry and the lowest id, not by who holds
 * an ElevenLabs key. At a two-GM table where the co-GM held the ElevenLabs key
 * and the canonical GM did not, the canonical GM answered "no clip" and the
 * co-GM, who could make it, stood down: every keyless player's Play said
 * "Narrator audio isn't ready yet", which the help's Troubleshooting reads as
 * "no GM with a key is online" — one was. Each GM's client now advertises its
 * ElevenLabs key into a registry of GM ids (`audioKeyedGmUserIds`, as the
 * Claude key's `keyedGmUserIds`), and the lowest-id active GM in it answers
 * (gmGate.isAudioGM), the canonical GM when none holds one.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { cacheKey } from '../../src/audio/cache.js';

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
  await table.settle();
  // The narrator card everyone holds — posted by the canonical GM (Gina, the lower id).
  await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-narration-card"><div class="sf-narration-prose">${PROSE}</div></div>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE, sessionId: 's1' } },
  }));
  await table.settle();
});

async function setElevenLabsKey(id, key) {
  await table.client(id).setSetting('elevenLabsApiKey', key);
  await table.settle();
}

/** Pat (keyless) asks for the card's clip, as his Play does; the GMs' answers. */
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

const registry = () => table.world.getSetting('audioKeyedGmUserIds') ?? [];

describe('a keyless player\'s clip is made by the GM holding the ElevenLabs key', () => {
  it('control: with the key on the canonical GM (Gina) the clip is made and its path sent', async () => {
    await setElevenLabsKey('gm-1', 'sk_el_gina');
    const answers = await patAsksForTheClip();
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(answers.at(-1)?.path).toMatch(/\.mp3$/);
  }, 30_000);

  it('with the key on the co-GM (Gus) only, the clip is still made for Pat', async () => {
    await setElevenLabsKey('gm-2', 'sk_el_gus');
    const answers = await patAsksForTheClip();
    // Gina (canonical, keyless) answered `path: null` and Gus stood down: nothing synthesised.
    expect(synthesise.mock.calls.length).toBe(1);
    expect(answers).toHaveLength(1);        // one GM answers, not two
    expect(answers[0].path).toMatch(/\.mp3$/);
    expect(registry()).toEqual(['gm-2']);   // Gus's game told the table it holds the key
  }, 30_000);

  it('with a key on both GMs the clip is made once, by the GM with the lower id', async () => {
    await setElevenLabsKey('gm-2', 'sk_el_gus');
    await setElevenLabsKey('gm-1', 'sk_el_gina');
    const answers = await patAsksForTheClip();
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(synthesise.mock.calls[0][0].apiKey).toBe('sk_el_gina');
    expect(answers).toHaveLength(1);
    expect([...registry()].sort()).toEqual(['gm-1', 'gm-2']);
  }, 30_000);

  it('a GM who clears the key leaves the registry, and the table falls back to the canonical GM', async () => {
    await setElevenLabsKey('gm-2', 'sk_el_gus');
    await setElevenLabsKey('gm-2', '');
    expect(registry()).toEqual([]);
    const answers = await patAsksForTheClip();
    // No GM holds a key: the canonical GM answers "no clip", as before.
    expect(synthesise).not.toHaveBeenCalled();
    expect(answers.at(-1)?.path ?? null).toBeNull();
  }, 30_000);

  it('control: a player\'s key is never advertised — the registry names GMs only', async () => {
    await setElevenLabsKey('pl-1', 'sk_el_pat');
    expect(registry()).toEqual([]);
  }, 30_000);
});
