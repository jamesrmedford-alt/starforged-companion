/**
 * Issue #338 D9 PTT-OVERWRITES-DRAFT (option B) — push-to-talk into a chat
 * box that holds a draft adds to the draft and does not submit.
 *
 * A player has typed half a line ("I open the"), then holds 🎙 and says
 * "hatch carefully". injectTranscription set `chatInput.value = transcript`
 * and dispatched Enter: the draft was discarded without a trace, and
 * "hatch carefully" alone was submitted — run through the move pipeline as
 * the player's whole line. Decided (B): with a draft in the box the
 * transcript goes after it and nothing is submitted; the player reviews the
 * line and presses Enter. An empty box still auto-submits. Rejected (A):
 * appending and submitting — it guesses whether the speech continues the
 * draft or replaces it, and a submission is a move roll that cannot be
 * taken back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSpeechInput } from '../../src/input/speechInput.js';

class FakeRecognition {
  static last = null;
  constructor() { this.calls = []; FakeRecognition.last = this; }
  start() { this.calls.push('start'); }
  stop()  { this.calls.push('stop'); }
  abort() { this.calls.push('abort'); }
}

let saved, input, events;

beforeEach(() => {
  saved = { window: globalThis.window, document: globalThis.document, KeyboardEvent: globalThis.KeyboardEvent };
  events = [];
  // The Foundry chat box (#chat-message): its value, focus, and the events the injector dispatches on it.
  input = {
    value: '',
    focused: false,
    focus() { input.focused = true; },
    dispatchEvent(e) { events.push({ type: e.type, key: e.key, value: input.value }); return true; },
  };
  globalThis.window   = { SpeechRecognition: FakeRecognition };
  globalThis.document = { querySelector: (sel) => (sel === '#chat-message' ? input : null) };
  // Node has Event but no KeyboardEvent: a plain stand-in carrying the init fields.
  if (typeof globalThis.KeyboardEvent === 'undefined') {
    globalThis.KeyboardEvent = class KeyboardEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
  }
  initSpeechInput();
});

afterEach(() => {
  globalThis.window        = saved.window;
  globalThis.document      = saved.document;
  globalThis.KeyboardEvent = saved.KeyboardEvent;
});

const ptt    = () => globalThis.window._sfSpeechInput;
const engine = () => FakeRecognition.last;

/** A hold-and-release that the engine answers with `transcript`. */
function dictate(transcript) {
  ptt().start();
  engine().onstart();
  ptt().stop();
  engine().onresult({ results: [[{ transcript }]] });
  engine().onend();
}

const submitted = () => events.find(e => e.type === 'keydown' && e.key === 'Enter');
const inputEvents = () => events.filter(e => e.type === 'input');

describe('push-to-talk with a draft already in the chat box (issue #338 D9)', () => {
  it('control: with an empty box the transcription is injected and submitted', () => {
    dictate('hatch carefully');
    expect(submitted()?.value).toBe('hatch carefully');
  });

  it('control: a box holding only whitespace is empty — the transcription alone is submitted', () => {
    input.value = '  \n ';
    dictate('hatch carefully');
    expect(submitted()?.value).toBe('hatch carefully');
  });

  it('the transcript is added after the draft, and nothing is submitted', () => {
    input.value = 'I open the';
    dictate('hatch carefully');

    expect(input.value).toBe('I open the hatch carefully');
    expect(submitted()).toBeUndefined();
    // Foundry's listeners hear the change, and the box has focus for the player's Enter.
    expect(inputEvents().map(e => e.value)).toEqual(['I open the hatch carefully']);
    expect(input.focused).toBe(true);
  });

  it('a draft ending in a space is joined with one space', () => {
    input.value = 'I open the ';
    dictate('hatch carefully');
    expect(input.value).toBe('I open the hatch carefully');
    expect(submitted()).toBeUndefined();
  });

  it('a second dictation adds to the line again, still unsent', () => {
    input.value = 'I open the';
    dictate('hatch');
    dictate('carefully');
    expect(input.value).toBe('I open the hatch carefully');
    expect(submitted()).toBeUndefined();
  });
});
