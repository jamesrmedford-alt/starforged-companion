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
import { initSpeechInput } from '../../src/input/speechInput.js';

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
