// tests/probes/infra/audioPauseBetweenSegments.probe.test.js
//
// PROBE (infra audit) — AUDIO-PAUSE-GAP-IGNORED.
//
// PlaybackSession stays in PLAYING while the sequencing loop loads the next
// segment (_playFromCurrent never leaves PLAYING between segments). A Pause in
// that gap sets PAUSED and pauses the segment that already ended (a no-op);
// when the next Sound finishes loading the loop sets PLAYING again and plays
// it — the user's Pause is silently undone and the card's button flips back to
// "Pause". On a multi-voice card (narrator / NPC alternate) every boundary is
// such a gap, and on a hosted world each Sound.load() is a network fetch.
//
// Asserts a Pause pressed while the next segment loads keeps the session
// paused. FAILS today.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PlaybackSession,
  PLAYBACK_STATE,
  _resetActivePlaybackForTests,
} from '../../../src/audio/playback.js';

let savedSound, gates, instances;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  _resetActivePlaybackForTests();
  savedSound = foundry.audio.Sound;
  gates = [];
  instances = [];
  // A Sound whose load() waits until the test releases it (a network fetch).
  foundry.audio.Sound = class GatedSound {
    constructor(src) { this.src = src; this._listeners = {}; this._state = 'idle'; instances.push(this); }
    load() { return new Promise(r => gates.push(r)); }
    async play() { this._state = 'playing'; }
    async pause() { this._state = 'paused'; }
    async stop() { this._state = 'stopped'; this._fire('stop'); }
    addEventListener(event, cb) { (this._listeners[event] ??= []).push(cb); }
    _fire(event) { (this._listeners[event] ?? []).forEach(cb => cb()); }
  };
});

afterEach(() => {
  foundry.audio.Sound = savedSound;
  _resetActivePlaybackForTests();
});

describe('PROBE AUDIO-PAUSE-GAP-IGNORED — Pause between two segments', () => {
  it('a Pause while the next segment is loading is not undone when it loads', async () => {
    const session = new PlaybackSession({
      cardId: 'card-gap',
      segments: [
        { voice: 'narrator', src: 'worlds/w/audio/aa/one.mp3', text: 'Vance pauses.' },
        { voice: 'npc',      src: 'worlds/w/audio/bb/two.mp3', text: '"You cannot be serious."' },
      ],
    });
    const run = session.play();

    gates.shift()();  await flush();                // segment 1 loads and plays
    expect(instances[0]._state).toBe('playing');

    instances[0]._fire('end');  await flush();      // segment 1 ends; segment 2 starts loading
    expect(instances).toHaveLength(2);

    await session.pause();                          // the user presses Pause in the gap
    expect(session.state).toBe(PLAYBACK_STATE.PAUSED);

    gates.shift()();  await flush();                // segment 2 finishes loading

    // Actual today: state "playing" and segment 2 is sounding.
    expect(session.state).toBe(PLAYBACK_STATE.PAUSED);
    expect(instances[1]._state).not.toBe('playing');

    await session.stop();
    await run;
  });
});
