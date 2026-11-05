/**
 * Issue #338 D10 AUDIO-CACHE-PREFILL-KEYED-GM (option A) — a canonical GM
 * that holds an ElevenLabs key files no relayed clip; it makes its own.
 *
 * The usual table: the GM's client synthesises every clip, the players only
 * play. A narrator card posts; before anyone presses Play, a logged-in user
 * emits `{ kind: "audio.cache.write", hash, b64 }` with the card segment's
 * clip key (computable from the card text and the world's voices) and bytes
 * of their own — the emit needs no key. handleCacheWrite (issue #330 D11)
 * filed them: the slot was empty, the GM was not making the clip, and the
 * hash was a real card segment's key. Every later Play, the GM's own
 * included, then found the clip cached and played the forger's audio.
 *
 * Decided (A): the relay serves a keyed player at a keyless GM's table (D11's
 * stated reason); a GM with a key never files a relayed clip. Rejected (B):
 * recording the residual (any user pre-fills the audio of an unplayed card).
 * A keyed non-canonical client still plays its own blob; its clip stays
 * uncached until the GM makes it (the known AUDIO-KEYED-NONCANONICAL-DUP).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';

const MODULE_ID = 'starforged-companion';
const FP = () => foundry.applications.apps.FilePicker.implementation;

const WORLD = { narratorVoiceId: 'voice-narrator', npcVoiceId: 'voice-npc', modelId: 'eleven_flash_v2_5', speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const CARD_PROSE = 'The hull groans and holds.';

let savedEmit, savedMessages;
const emitted = [];

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  emitted.length = 0;
  game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, WORLD.narratorVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.npcVoiceId`, WORLD.npcVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.modelId`, WORLD.modelId);
  game.settings._store.set(`${MODULE_ID}.audio.speed`, WORLD.speed);
  savedMessages = game.messages;
  // The one narrator card in chat — posted, not yet played by anyone.
  game.messages = { contents: [{ id: 'card-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: CARD_PROSE, sessionId: 's1' } } }] };
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => { if (event === AUDIO_SOCKET_NAME) emitted.push(payload); };
  registerAudioSocket();
});

afterEach(() => {
  game.socket.emit = savedEmit;
  game.socket._reset();
  game.messages = savedMessages;
  for (const k of ['elevenLabsApiKey', 'audio.narratorVoiceId', 'audio.npcVoiceId', 'audio.modelId', 'audio.speed']) {
    game.settings._store.delete(`${MODULE_ID}.${k}`);
  }
});

/** Deliver a payload to the GM's socket handlers, as another client's emit would. */
async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

const uploadsOf = (hash) => FP()._uploads.filter(u => u.file.name === `${hash}.mp3`);
const uploadedText = async (upload) => new TextDecoder().decode(await upload.file.arrayBuffer());

describe('a relayed clip for a card nobody has played yet (issue #338 D10)', () => {
  it('control: a keyless canonical GM files the honest relayed clip — the table the relay serves', async () => {
    game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('the player\'s clip') });
    expect(uploadsOf(hash)).toHaveLength(1);
  });

  it('a keyed canonical GM does not file a relayed clip it will make itself', async () => {
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_gm_key');
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('not the narration') });
    expect(uploadsOf(hash)).toHaveLength(0);
  });

  it('and the line is then made on the GM\'s own key: the clip every Play serves is the GM\'s', async () => {
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_gm_key');
    const spec = { ...SPEC, text: CARD_PROSE };
    const hash = await cacheKey(spec);
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('not the narration') });
    // A keyless player's Play asks the GM for the clip.
    await deliver({ kind: 'audio.synth.request', hash, spec });

    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(synthesise.mock.calls[0][0].apiKey).toBe('sk_gm_key');
    const uploads = uploadsOf(hash);
    expect(uploads).toHaveLength(1);
    expect(await uploadedText(uploads[0])).toBe(CARD_PROSE);     // the mock synthesises the text as its bytes
    expect(emitted.find(p => p.kind === 'audio.synth.done')?.path).toMatch(new RegExp(`/${hash}\\.mp3$`));
  });
});
