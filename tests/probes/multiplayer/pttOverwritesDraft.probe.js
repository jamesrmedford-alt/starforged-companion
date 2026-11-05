/**
 * PROBE — MP-D1 PTT-OVERWRITES-DRAFT (tenth audit, area multiplayer; a decision row)
 *
 * What the user does: a player has typed half a line into the chat box —
 * "I open the" — then holds the 🎙 push-to-talk button and says "hatch
 * carefully", meaning to finish the line by voice (or merely pressed the
 * button while a draft sat in the box).
 *
 * What happens: `injectTranscription` (src/input/speechInput.js:296-322)
 * does `chatInput.value = transcript` and dispatches Enter: the draft is
 * discarded without a trace and "hatch carefully" alone is submitted — and
 * run through the move pipeline as the player's whole line. The player
 * loses what they typed and the narrator gets a fragment.
 *
 * What should happen — a decision: (A) a transcription is appended to the
 * draft and the whole line submitted ("I open the hatch carefully"); or (B)
 * when a draft is in the box the transcription is placed into it without
 * submitting, so the player reviews before sending. Either way the typed
 * text is not thrown away (the header's own promise: "The chat input
 * remains available as a fallback"). Recommended: A — push-to-talk stays
 * frictionless ("Frictionless experience takes priority over error
 * prevention", :291) and nothing typed is lost. The probe asserts what both
 * share: the draft survives, in the box or in what was submitted.
 *
 * Control: with an empty box the transcription is injected and submitted.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/pttOverwritesDraft.probe.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSpeechInput } from '../../../src/input/speechInput.js';

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
  // The Foundry chat box (#chat-message): its value, and the events the injector dispatches on it.
  input = { value: '', dispatchEvent(e) { events.push({ type: e.type, key: e.key, value: input.value }); return true; } };
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

describe('MP-D1 push-to-talk with a draft already in the chat box', () => {
  it('control: with an empty box the transcription is injected and submitted', () => {
    dictate('hatch carefully');
    expect(submitted()?.value).toBe('hatch carefully');
  });

  it('the typed draft is not discarded — it is in the box, or in what was submitted', () => {
    input.value = 'I open the';
    dictate('hatch carefully');

    // Expected (A or B): "I open the" survives — submitted with the transcription, or left in the box.
    // Actual: the box is overwritten with "hatch carefully" and submitted; "I open the" is gone.
    const kept = input.value.includes('I open the') || (submitted()?.value ?? '').includes('I open the');
    expect(kept, `box: "${input.value}", submitted: "${submitted()?.value ?? '(nothing)'}"`).toBe(true);
  });
});
