// STARFORGED COMPANION
// tests/unit/audioKeylessPlayback.test.js
//
// A keyless player without the File Browser permission plays the narrator clip
// the GM synthesised and cached for it (issue #321 U60).
//
// Keyless playback: the player asks the canonical GM to synthesise + cache a
// clip; the GM writes it and broadcasts `audio.synth.done`. That signal used
// to carry ONLY the hash, and the player then found the file itself with
// cache.lookup(), i.e. FilePicker.browse("data", "worlds/<id>/audio/<hh>").
// Browsing needs Foundry's "Use File Browser" (FILES_BROWSE) permission, which
// by default only Trusted Players and above hold — a plain Player's browse was
// refused, lookup() swallowed the refusal as a miss, and the player got
// "Narrator audio isn't ready yet — ask the GM to play this card once" every
// time, even right after the GM cached the clip. The GM now sends the path it
// wrote (on The Forge, only the upload's response names the file), and the
// player plays it directly.
//
// One process plays both clients: the player's socket request runs the REAL
// GM handler under the GM's identity (with the GM's ElevenLabs key), and the
// GM's done signal is delivered back to the player — the producer and the
// consumer of the path both run. The FilePicker refuses browse to a non-GM
// user without the permission, as Foundry does.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.elevenLabsApiKey`;
const PROSE = 'The hull groans and holds.';
const GM = { isGM: true, id: 'test-user-gm' };

let savedHTMLElement, savedEmit, savedBrowse, restoreUser;
let browseAllowed = false;                    // a Trusted Player may browse
let tamper = null;                            // rewrite the GM's done payload in flight
const doneSent = [];

/** Deliver a socket payload to this process's handlers, as another client would. */
function deliver(payload) {
  setTimeout(() => (game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []).forEach(h => h(payload)), 0);
}

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  vi.mocked(synthesise).mockReset();
  vi.mocked(synthesise).mockResolvedValue(new ArrayBuffer(16));
  browseAllowed = false;
  tamper = null;
  doneSent.length = 0;
  const fp = foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  savedBrowse = fp.browse;
  fp.browse = async (source, path) => {
    // Foundry refuses FilePicker.browse to a user without FILES_BROWSE
    // (default role: Trusted Player) — a plain player here.
    if (!game.user.isGM && !browseAllowed) throw new Error('You do not have permission to browse files');
    return savedBrowse(source, path);
  };
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(KEY);           // the player's client holds no key
  restoreUser = asPlayer();

  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => {
    if (event !== AUDIO_SOCKET_NAME) return;
    if (payload?.kind === 'audio.synth.request') {
      // The canonical GM's client receives it: its real handler runs with the
      // GM's identity and key.
      setTimeout(async () => {
        const asTheGm = withUser(GM);
        game.settings._store.set(KEY, 'sk_gm_key');
        try {
          for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
        } finally {
          game.settings._store.delete(KEY);
          asTheGm();
        }
      }, 0);
    } else if (payload?.kind === 'audio.synth.done') {
      doneSent.push(payload);
      deliver(tamper ? tamper(payload) : payload);
    }
  };
  registerAudioSocket();
});

afterEach(async () => {
  await stopActivePlayback();
  foundry.applications.apps.FilePicker.implementation.browse = savedBrowse;
  game.socket.emit = savedEmit;
  game.socket._reset();
  restoreUser();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

async function playCard(id, text = PROSE) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: text } } };
  const root = parseHTML(`<div class="sf-narration-prose">${text}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.waitFor(() => expect(['playing', 'error']).toContain(play.getAttribute('data-state')));
  return play;
}

const cachedPath = async (text) => {
  const hash = await cacheKey({ voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text, speed: 1 });
  return `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
};

describe('a keyless player without File Browser permission (issue #321 U60)', () => {
  it('plays the clip the GM just synthesised and cached for it', async () => {
    const play = await playCard('msg-keyless');
    const path = await cachedPath(PROSE);

    expect(synthesise).toHaveBeenCalledTimes(1);              // made once, by the GM, with the GM's key
    expect(vi.mocked(synthesise).mock.calls[0][0].apiKey).toBe('sk_gm_key');
    expect(doneSent).toEqual([{ kind: 'audio.synth.done', hash: expect.any(String), path }]);
    expect(play.getAttribute('data-state')).toBe('playing');
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(path);
  });

  it('control — a Trusted Player, who may browse, plays it too', async () => {
    browseAllowed = true;
    const text = 'Control prose for a trusted player.';
    const play = await playCard('msg-trusted', text);
    expect(play.getAttribute('data-state')).toBe('playing');
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(await cachedPath(text));
  });

  it('a done signal naming some other file is not played', async () => {
    expectConsoleError(/audio toggle failed: Narrator audio isn't ready yet/);
    tamper = (payload) => ({ ...payload, path: 'https://elsewhere.example/track.mp3' });
    const play = await playCard('msg-tampered');
    expect(play.getAttribute('data-state')).toBe('error');
    expect(foundry.audio.Sound._instances).toHaveLength(0);
  });
});
