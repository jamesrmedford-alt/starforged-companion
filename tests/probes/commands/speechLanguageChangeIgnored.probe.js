/**
 * PROBE — SPEECH-LANGUAGE-CHANGE-IGNORED (eighth audit, area index-commands-hooks)
 *
 * What the user does: a player with push-to-talk on changes "Speech Input
 * Language" from en-US to de-DE in Configure Settings (the setting is
 * `config: true`, client scope), then holds 🎙 and speaks German.
 *
 * What happens: registerCoreSettings (src/index.js ~404) registers
 * `speechLanguage` with no `onChange` and no `requiresReload`. The language is
 * read once, when the controller is built (initSpeechInput → createSpeechController
 * sets `recognition.lang`, src/input/speechInput.js ~114) — at `ready`, or when
 * Push-to-Talk is toggled on. Foundry saves the new value and the dialog
 * closes without asking for a reload, so recognition keeps transcribing as
 * en-US until the page reloads (the sibling Push-to-Talk setting was fixed to
 * take effect at once, issue #306 R10).
 *
 * What should happen: the next capture uses the new language — the setting
 * re-initialises the controller on change (or at least declares
 * `requiresReload` so Foundry prompts for the reload).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/speechLanguageChangeIgnored.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/logging/errorLog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  installConsoleInterceptor: vi.fn(),
}));

import '../../../src/index.js';
import { initSpeechInput } from '../../../src/input/speechInput.js';

const ENABLED  = 'starforged-companion.speechInputEnabled';
const LANGUAGE = 'starforged-companion.speechLanguage';

class FakeRecognition {
  static all = [];
  constructor() { this.calls = []; FakeRecognition.all.push(this); }
  start() { this.calls.push('start'); }
  stop()  { this.calls.push('stop'); }
  abort() { this.calls.push('abort'); }
}

let saved;

beforeEach(async () => {
  saved = { window: globalThis.window, document: globalThis.document };
  FakeRecognition.all = [];
  globalThis.window   = { SpeechRecognition: FakeRecognition };
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
  if (!game.settings._registry.has(LANGUAGE)) {
    for (const init of Hooks._handlers.get('init') ?? []) await init();
  }
  game.settings._store.set(ENABLED, true);
  game.settings._store.set(LANGUAGE, 'en-US');
  initSpeechInput();                       // the ready hook, push-to-talk on
});

afterEach(() => {
  globalThis.window   = saved.window;
  globalThis.document = saved.document;
});

describe('PROBE SPEECH-LANGUAGE-CHANGE-IGNORED', () => {
  it('a new Speech Input Language is used by the next capture (or the setting asks for a reload)', () => {
    expect(FakeRecognition.all.at(-1).lang).toBe('en-US');

    // Configure Settings saves the value, then calls the setting's onChange.
    const config = game.settings._registry.get(LANGUAGE);
    game.settings._store.set(LANGUAGE, 'de-DE');
    config.onChange?.('de-DE');

    window._sfSpeechInput.start();
    const capturing = FakeRecognition.all.at(-1);
    // Expected: "de-DE" (or requiresReload declared). Today: still "en-US", no reload asked.
    expect({ lang: capturing.lang, reloadAsked: config.requiresReload === true })
      .toSatisfy(({ lang, reloadAsked }) => lang === 'de-DE' || reloadAsked);
  });
});
