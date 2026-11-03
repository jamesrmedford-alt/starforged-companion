/**
 * STARFORGED COMPANION
 * tests/unit/speechInputSetting.test.js
 *
 * Issue #306 R10 — the Push-to-Talk setting (speechInputEnabled, client
 * scope) registered an onChange that handled only `true`. Switching it off
 * left a capture in progress running and the 🎙 button live until a reload.
 * The setting's real onChange, registered by src/index.js's init hook, drives
 * the controller here: off stops and removes it all, on brings back one fresh
 * controller and the button.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/logging/errorLog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  installConsoleInterceptor: vi.fn(),
}));

import '../../src/index.js';
import { initSpeechInput } from '../../src/input/speechInput.js';
import { parseHTML, StubElement, StubEvent } from '../helpers/cardDom.js';

const KEY = 'starforged-companion.speechInputEnabled';

class FakeRecognition {
  static all = [];
  constructor() { this.calls = []; FakeRecognition.all.push(this); }
  start() { this.calls.push('start'); }
  stop()  { this.calls.push('stop'); }
  abort() { this.calls.push('abort'); }
}

let saved, chat;

beforeEach(async () => {
  saved = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, chat: ui.chat };
  FakeRecognition.all = [];
  chat = parseHTML('<section class="chat-controls"><button id="sf-ptt-button" class="sf-ptt-button">🎙</button></section>');
  globalThis.HTMLElement = StubElement;
  globalThis.window = { SpeechRecognition: FakeRecognition };
  globalThis.document = {
    body: chat,
    createElement: (tag) => new StubElement(tag),
    querySelector: (sel) => chat.querySelector(sel),
    querySelectorAll: (sel) => chat.querySelectorAll(sel),
  };
  ui.chat = { element: chat };
  if (!game.settings._registry.has(KEY)) {
    for (const init of Hooks._handlers.get('init') ?? []) await init();
  }
  game.settings._store.set(KEY, true);
  initSpeechInput();                       // the ready hook, with the setting on
});

afterEach(() => {
  Object.assign(globalThis, { window: saved.window, document: saved.document, HTMLElement: saved.HTMLElement });
  ui.chat = saved.chat;
});

/** The setting changed in Configure Settings: Foundry stores it, then calls onChange. */
function setPushToTalk(value) {
  game.settings._store.set(KEY, value);
  game.settings._registry.get(KEY).onChange(value);
}

describe('the Push-to-Talk setting takes effect at once', () => {
  it('off: a capture in progress stops, the button goes, and a stale press starts nothing', () => {
    window._sfSpeechInput.start();
    const engine = FakeRecognition.all.at(-1);
    engine.onstart();

    setPushToTalk(false);
    expect(engine.calls).toEqual(['start', 'abort']);
    expect(chat.querySelectorAll('.sf-ptt-button')).toHaveLength(0);

    engine.onend();
    window._sfSpeechInput.start();           // a press on a stale reference
    expect(engine.calls).toEqual(['start', 'abort']);
    expect(FakeRecognition.all).toHaveLength(1);
  });

  it('on again: one fresh controller, and the button is back', () => {
    setPushToTalk(false);
    setPushToTalk(true);
    expect(FakeRecognition.all).toHaveLength(2);
    expect(chat.querySelectorAll('.sf-ptt-button')).toHaveLength(1);

    chat.querySelector('#sf-ptt-button').dispatchEvent(new StubEvent('mousedown'));
    expect(FakeRecognition.all.at(-1).calls).toEqual(['start']);
    expect(FakeRecognition.all[0].calls).not.toContain('start');
  });
});

/**
 * Issue #326 W87 — a changed Speech Input Language was ignored until a
 * reload: the setting had no onChange or requiresReload, and the language is
 * read once, when the controller is built. Its onChange now rebuilds the
 * controller (when push-to-talk is on), as the Push-to-Talk switch does.
 */
describe('the Speech Input Language setting takes effect at once', () => {
  const LANGUAGE = 'starforged-companion.speechLanguage';

  /** Configure Settings stores the new value, then calls onChange. */
  function setLanguage(value) {
    game.settings._store.set(LANGUAGE, value);
    game.settings._registry.get(LANGUAGE).onChange?.(value);
  }

  beforeEach(() => {
    game.settings._store.set(LANGUAGE, 'en-US');
    initSpeechInput();
  });
  afterEach(() => { game.settings._store.delete(LANGUAGE); });

  it('the next capture uses the new language', () => {
    expect(FakeRecognition.all.at(-1).lang).toBe('en-US');
    setLanguage('de-DE');
    window._sfSpeechInput.start();
    const capturing = FakeRecognition.all.at(-1);
    expect(capturing.lang).toBe('de-DE');
    expect(capturing.calls).toEqual(['start']);
  });

  it('one controller: the old one is torn down, and a capture in progress stops', () => {
    window._sfSpeechInput.start();
    const old = FakeRecognition.all.at(-1);
    old.onstart();
    setLanguage('fr-FR');
    expect(old.calls).toEqual(['start', 'abort']);
    window._sfSpeechInput.start();
    expect(old.calls).toEqual(['start', 'abort']);
    expect(FakeRecognition.all.at(-1).calls).toEqual(['start']);
  });

  it('control: with push-to-talk off, a language change leaves it off', () => {
    setPushToTalk(false);
    const built = FakeRecognition.all.length;
    setLanguage('de-DE');
    expect(FakeRecognition.all).toHaveLength(built);
    window._sfSpeechInput.start();
    expect(FakeRecognition.all.every(r => !r.calls.includes('start'))).toBe(true);
  });
});
