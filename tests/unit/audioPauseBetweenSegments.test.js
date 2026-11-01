/**
 * STARFORGED COMPANION
 * tests/unit/audioPauseBetweenSegments.test.js
 *
 * Issue #322 V14 (the audit's audioPauseBetweenSegments probe,
 * AUDIO-PAUSE-GAP-IGNORED): PlaybackSession stayed PLAYING while its loop
 * loaded the next segment, so a Pause in that gap paused the segment that had
 * ended (a no-op) and the next one played the moment it loaded — the Pause
 * undone, the card's button back to "Pause". On a multi-voice card every
 * narrator / NPC boundary is such a gap, and on a hosted world each load is a
 * network fetch. A segment that loads during a pause now waits, unplayed,
 * until Resume or Stop; a Resume before it loads plays it when it lands,
 * without replaying the one that ended.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PlaybackSession,
  PLAYBACK_STATE,
  _resetActivePlaybackForTests,
} from '../../src/audio/playback.js';

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

describe('Pause between two segments (AUDIO-PAUSE-GAP-IGNORED)', () => {
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

    // It was "playing", with segment 2 sounding.
    expect(session.state).toBe(PLAYBACK_STATE.PAUSED);
    expect(instances[1]._state).not.toBe('playing');

    // Resume plays the waiting segment, and the session ends when it does.
    const resumed = session.play();
    await flush();
    expect(session.state).toBe(PLAYBACK_STATE.PLAYING);
    expect(instances[1]._state).toBe('playing');
    instances[1]._fire('end');  await flush();
    await Promise.all([run, resumed]);
    expect(session.state).toBe(PLAYBACK_STATE.IDLE);
  });

  it('a Resume before the next segment loads plays it when it lands, without replaying the ended one', async () => {
    const session = new PlaybackSession({
      cardId: 'card-gap-2',
      segments: [
        { voice: 'narrator', src: 'worlds/w/audio/aa/one.mp3', text: 'Vance pauses.' },
        { voice: 'npc',      src: 'worlds/w/audio/bb/two.mp3', text: '"You cannot be serious."' },
      ],
    });
    const run = session.play();
    gates.shift()();  await flush();
    instances[0]._fire('end');  await flush();      // segment 2 loading
    instances[0]._state = 'ended';
    await session.pause();
    void session.play();                            // Resume while it still loads
    await flush();
    expect(instances[0]._state).toBe('ended');      // the ended one is not replayed
    gates.shift()();  await flush();                // segment 2 lands
    expect(instances[1]._state).toBe('playing');
    expect(session.state).toBe(PLAYBACK_STATE.PLAYING);
    instances[1]._fire('end');  await flush();
    await run;
  });

  it('a Stop while a loaded segment waits out a pause ends the session silently', async () => {
    const session = new PlaybackSession({
      cardId: 'card-gap-3',
      segments: [
        { voice: 'narrator', src: 'worlds/w/audio/aa/one.mp3', text: 'Vance pauses.' },
        { voice: 'npc',      src: 'worlds/w/audio/bb/two.mp3', text: '"You cannot be serious."' },
      ],
    });
    const run = session.play();
    gates.shift()();  await flush();
    instances[0]._fire('end');  await flush();
    await session.pause();
    gates.shift()();  await flush();                // segment 2 loaded, waiting
    await session.stop();
    await run;
    expect(session.state).toBe(PLAYBACK_STATE.STOPPED);
    expect(instances[1]._state).not.toBe('playing');
  });
});
