/**
 * STARFORGED COMPANION
 * tests/unit/speechInput.test.js
 *
 * Issue #300 F10 — push-to-talk released before recognition starts. The
 * Web Speech API reports onstart only once capture begins (after a permission
 * prompt, often hundreds of ms after start()); stop() checked that flag, found
 * nothing active and returned, so capture began after the release and the
 * transcript it heard was auto-submitted to chat. A stubbed SpeechRecognition
 * stands in for the browser's.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSpeechInput, disableSpeechInput } from '../../src/input/speechInput.js';

class FakeRecognition {
  static last = null;
  constructor() {
    this.calls = [];
    FakeRecognition.last = this;
  }
  start() { this.calls.push('start'); }
  stop()  { this.calls.push('stop'); }
  abort() { this.calls.push('abort'); }
}

let saved;

beforeEach(() => {
  saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window   = { SpeechRecognition: FakeRecognition };
  globalThis.document = { querySelector: () => null };   // no PTT button rendered
  initSpeechInput();
});

afterEach(() => {
  globalThis.window   = saved.window;
  globalThis.document = saved.document;
});

const ptt    = () => globalThis.window._sfSpeechInput;
const engine = () => FakeRecognition.last;

describe('push-to-talk start / release', () => {
  it('a release before recognition starts cancels it', () => {
    ptt().start();
    ptt().stop();
    expect(engine().calls).toEqual(['start', 'abort']);
  });

  it('a start that arrives after the release is stopped at once', () => {
    ptt().start();
    ptt().stop();
    engine().onstart();          // the browser starts capture anyway
    expect(engine().calls).toEqual(['start', 'abort', 'abort']);
  });

  it('a normal hold and release stops the capture and keeps its transcript', () => {
    ptt().start();
    engine().onstart();
    ptt().stop();
    expect(engine().calls).toEqual(['start', 'stop']);
  });

  it('pressing again while recognition is still starting does not start it twice', () => {
    ptt().start();
    ptt().start();
    expect(engine().calls).toEqual(['start']);
  });

  it('after a cancelled start ends, the next press starts a fresh capture', () => {
    ptt().start();
    ptt().stop();
    engine().onerror({ error: 'aborted' });
    engine().onend();
    ptt().start();
    engine().onstart();
    ptt().stop();
    expect(engine().calls).toEqual(['start', 'abort', 'start', 'stop']);
  });
});

// PTT-QUICK-REPRESS (found while fixing F10): recognition.start() throws until
// the previous run's onend, so a press made while a run wound down from its
// release was dropped — the player held the button and nothing listened.
describe('push-to-talk pressed again before the last run has ended', () => {
  it('a press while a cancelled start winds down captures once the run ends', () => {
    ptt().start();
    ptt().stop();                              // cancels the start
    ptt().start();                             // pressed again at once
    engine().onerror({ error: 'aborted' });
    engine().onend();                          // the cancelled run ends → capture for the new press
    engine().onstart();
    ptt().stop();
    expect(engine().calls).toEqual(['start', 'abort', 'start', 'stop']);
  });

  it('a press while the last utterance is processed captures after it', () => {
    ptt().start();
    engine().onstart();
    ptt().stop();                              // release: the engine finalises the transcript
    ptt().start();                             // pressed again before it has
    engine().onend();
    expect(engine().calls).toEqual(['start', 'stop', 'start']);
  });

  it('a press released again before the run ends starts nothing', () => {
    ptt().start();
    ptt().stop();
    ptt().start();
    ptt().stop();
    engine().onend();
    expect(engine().calls).toEqual(['start', 'abort']);
  });

  it('a hold that outlasts its utterance does not start a second capture', () => {
    ptt().start();
    engine().onstart();
    engine().onend();                          // one utterance per hold: the engine ends by itself
    ptt().stop();
    expect(engine().calls).toEqual(['start']);
  });

  it('a run ending after destroy() starts nothing', () => {
    ptt().start();
    engine().onstart();
    const recognition = engine();
    ptt().destroy();
    recognition.onend();
    expect(recognition.calls).toEqual(['start', 'abort']);
  });
});

// Issue #306 R10: switching the Push-to-Talk setting off did nothing until a
// reload — a capture in progress kept going, and the 🎙 button stayed and
// kept starting new captures.
describe('turning push-to-talk off', () => {
  it('stops a capture in progress, and the existing button can start no other', () => {
    ptt().start();
    engine().onstart();
    const recognition = engine();
    disableSpeechInput();
    expect(recognition.calls).toEqual(['start', 'abort']);

    recognition.onend();                       // the aborted run ends
    ptt().start();                             // the old button's mousedown
    expect(recognition.calls).toEqual(['start', 'abort']);
    expect(engine()).toBe(recognition);        // no new engine either
  });

  it('removes every 🎙 button', () => {
    const buttons = [{ remove() { this.removed = true; } }, { remove() { this.removed = true; } }];
    globalThis.document = { querySelector: () => null, querySelectorAll: (sel) => (sel === '.sf-ptt-button' ? buttons : []) };
    disableSpeechInput();
    expect(buttons.map(b => b.removed)).toEqual([true, true]);
  });

  it('turned on again, a fresh controller captures and the old engine stays stopped', () => {
    ptt().start();
    engine().onstart();
    const old = engine();
    disableSpeechInput();
    initSpeechInput();
    expect(engine()).not.toBe(old);
    ptt().start();
    expect(engine().calls).toEqual(['start']);
    expect(old.calls).toEqual(['start', 'abort']);
  });

  it('initialising again replaces the controller without leaving the old one listening', () => {
    ptt().start();
    engine().onstart();
    const old = engine();
    initSpeechInput();
    expect(old.calls).toEqual(['start', 'abort']);
    expect(engine()).not.toBe(old);
  });
});
