/**
 * PROBE — MP-D2 AUDIO-CACHE-PREFILL-KEYED-GM (tenth audit, area multiplayer; a decision row)
 *
 * What the user does: the canonical GM holds an ElevenLabs key — the usual
 * table, where the GM's client synthesises every clip and the players only
 * play. A narrator card posts. Before anyone presses Play, a logged-in user
 * emits from the console `{ kind: "audio.cache.write", hash, b64 }` with the
 * card segment's clip key (computable by anyone from the card text and the
 * world's voice settings) and bytes of their own — no ElevenLabs key needed
 * to emit it.
 *
 * What happens: `handleCacheWrite` (src/audio/index.js:437-454, issue #330
 * D11) files the bytes: the slot is empty and the GM is not making the clip,
 * and the hash is a real card segment's key, so the write passes every
 * check. From then on the GM's own Play, and every player's, finds the clip
 * cached (:264-265, :520-521) and plays the forger's audio as the narration;
 * the GM's key is never used for that line. D11 bounded the relay to a
 * card's segment and "never over a clip that is cached or that this client
 * is making" — the empty slot before the first play is the case it left,
 * and the refuter's note that "the attacker must hold a key" is not so: the
 * honest sender holds one; the emit needs none.
 *
 * What should happen — a decision: (A) a canonical GM that holds an
 * ElevenLabs key never files a relayed clip — it makes its own (the relay
 * serves "a keyed player at a keyless GM's table", D11's stated reason), and
 * a keyed non-canonical client still plays its own blob; or (B) accept the
 * residual and record it: at a keyed-GM table any user can pre-fill the
 * audio of any narration not yet played. Recommended: A — it costs nothing
 * at the configuration the relay exists for, and removes the hole at every
 * other. (A keyed non-canonical client's clip then stays uncached until the
 * GM plays it — the known AUDIO-KEYED-NONCANONICAL-DUP shape, which D11 did
 * not close either.)
 *
 * Control: at a keyless canonical GM the honest relayed write is filed (the
 * configuration the relay serves).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/audioCachePrefillKeyedGm.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';

const MODULE_ID = 'starforged-companion';
const FP = () => foundry.applications.apps.FilePicker.implementation;

const WORLD = { narratorVoiceId: 'voice-narrator', npcVoiceId: 'voice-npc', modelId: 'eleven_flash_v2_5', speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const CARD_PROSE = 'The hull groans and holds.';

let savedEmit, savedMessages;

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, WORLD.narratorVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.npcVoiceId`, WORLD.npcVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.modelId`, WORLD.modelId);
  game.settings._store.set(`${MODULE_ID}.audio.speed`, WORLD.speed);
  savedMessages = game.messages;
  // The one narrator card in chat — posted, not yet played by anyone.
  game.messages = { contents: [{ id: 'card-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: CARD_PROSE, sessionId: 's1' } } }] };
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = () => {};
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

describe('MP-D2 a relayed clip for a card nobody has played yet', () => {
  it('control: a keyless canonical GM files the honest relayed clip', async () => {
    game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('the player\'s clip') });
    expect(uploadsOf(hash)).toHaveLength(1);
  });

  it('a keyed canonical GM does not file a relayed clip it will make itself', async () => {
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_gm_key');   // this GM synthesises its own clips
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('not the narration') });

    // Expected (A): nothing filed — the GM's own Play will synthesise the line on its key.
    // Actual: the relayed bytes are filed as <hash>.mp3, and every later Play serves them.
    expect(uploadsOf(hash)).toHaveLength(0);
  });
});
