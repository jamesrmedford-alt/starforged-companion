// tests/setup.js
// Shared Vitest setup — stubs the Foundry globals that module code imports
// from the global scope. Loaded via vitest.config.js `setupFiles`.
// Does NOT attempt to mock the Foundry canvas, pixi, or socket layers —
// those require a live Foundry instance (integration tests only).
//
// Console-error guard: this file installs a per-test spy on console.error and
// console.warn (see bottom). By default a test fails if module code emits
// console.error during the test body. A test that legitimately exercises an
// error-handling path can opt in via `expectConsoleError(/pattern/?)` or
// `silenceConsoleErrors()`. The goal is to surface the silent-failure tier-1
// findings (see plan on branch claude/audit-silent-failures-LABiI) so that a
// swallowed error in production code causes the corresponding test to fail
// loudly rather than passing with a default-shaped result.

import { vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// game.*
// ---------------------------------------------------------------------------

global.game = {
  settings: (() => {
    const store = new Map();
    return {
      register: () => {},
      get: (mod, key) => store.get(`${mod}.${key}`),
      set: async (mod, key, val) => { store.set(`${mod}.${key}`, val); return val; },
      _store: store,   // test access
    };
  })(),
  user: { isGM: true, id: 'test-user-gm' },
  journal: {
    find: () => null,
    get: () => null,
    getName: () => null,
    [Symbol.iterator]: function* () {},
  },
  modules: { get: () => null },
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

global.Hooks = {
  _handlers: new Map(),
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(fn);
  },
  once(event, fn) { this.on(event, fn); },
  call(event, ...args) {
    (this._handlers.get(event) ?? []).forEach(fn => fn(...args));
  },
};

// ---------------------------------------------------------------------------
// foundry.utils
// ---------------------------------------------------------------------------

global.foundry = {
  utils: {
    randomID: () => Math.random().toString(36).slice(2, 10),
    hasProperty: (obj, key) => {
      const parts = key.split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur == null || !Object.prototype.hasOwnProperty.call(cur, p)) return false;
        cur = cur[p];
      }
      return true;
    },
    mergeObject: (original, other, opts = {}) => Object.assign({}, original, other),
  },
  applications: {
    api: {
      ApplicationV2: class ApplicationV2 {
        constructor() { this.rendered = false; this.element = null; }
        render() {}
        close() {}
      },
    },
  },
};

// ---------------------------------------------------------------------------
// CONST
// ---------------------------------------------------------------------------

global.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
};

// ---------------------------------------------------------------------------
// Dialog (confirm stub — tests override per-case as needed)
// ---------------------------------------------------------------------------

global.Dialog = {
  confirm: async ({ title, content } = {}) => true,
};

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

global.ChatMessage = {
  _created: [],
  create: async (data) => { ChatMessage._created.push(data); return data; },
  _reset: () => { ChatMessage._created = []; },
};

// ---------------------------------------------------------------------------
// JournalEntry stub (created via JournalEntry.create)
// ---------------------------------------------------------------------------

global.JournalEntry = {
  create: async (data) => {
    const flags = {};
    return {
      id: foundry.utils.randomID(),
      name: data.name,
      getFlag: (mod, key) => flags[`${mod}.${key}`],
      setFlag: async (mod, key, val) => { flags[`${mod}.${key}`] = val; },
      createEmbeddedDocuments: async () => [],
      pages: { contents: [] },
    };
  },
};

// ---------------------------------------------------------------------------
// ui.notifications (suppress in tests unless asserting)
// ---------------------------------------------------------------------------

global.ui = {
  notifications: {
    info:  () => {},
    warn:  () => {},
    error: () => {},
  },
};

// ---------------------------------------------------------------------------
// ForgeVTT / ForgeAPI — stub as undefined to simulate desktop (non-Forge) context.
// api-proxy.js checks typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge.
// Setting to undefined means the local proxy path is always taken in tests.
// ---------------------------------------------------------------------------

global.ForgeVTT = undefined;
global.ForgeAPI = undefined;

// ---------------------------------------------------------------------------
// foundry.utils.deepClone — used in persistResolution.js and actorBridge.js
// ---------------------------------------------------------------------------

global.foundry.utils.deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// ---------------------------------------------------------------------------
// game.actors — Ironsworn Actor collection stub
//
// Tests that exercise actorBridge.js should set up their own mock actors via
// game.actors._set(id, actor) or game.actors._setAll(actorArray).
// ---------------------------------------------------------------------------

global.game.actors = (() => {
  let _actors = [];
  return {
    get: (id) => _actors.find(a => a.id === id) ?? null,
    find: (fn) => _actors.find(fn) ?? null,
    filter: (fn) => _actors.filter(fn),
    contents: _actors,
    // Test helpers — not part of the Foundry API
    _set: (id, actor) => {
      const idx = _actors.findIndex(a => a.id === id);
      if (idx >= 0) _actors[idx] = actor;
      else _actors.push(actor);
    },
    _setAll: (actors) => { _actors = actors; },
    _reset: () => { _actors = []; },
  };
})();

// game.user.character — the actor owned by the current user
global.game.user.character = null;

// ---------------------------------------------------------------------------
// makeTestActor — factory for mock Ironsworn Actor documents
//
// Usage in tests:
//   const actor = makeTestActor({ id: 'a1', name: 'Kira', system: { ... } });
//   game.actors._set('a1', actor);
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Console error/warn guard
//
// Captures every console.error and console.warn call during a test. After the
// test, asserts that none fired unless the test opted in via
// expectConsoleError() or silenceConsoleErrors(). This is the cross-cutting
// half of the silent-failure mitigation: production code is now expected to
// log via console.error/warn when it hits an unexpected branch, and tests
// must explicitly acknowledge those branches.
// ---------------------------------------------------------------------------

let _expectedErrorPatterns = null;     // null = strict (no errors allowed); array of RegExp = matched-only allowed
let _silenceConsoleErrors  = false;    // true = no assertions, capture only

const _capturedErrors = [];
const _capturedWarns  = [];

global.expectConsoleError = (pattern = null) => {
  if (_expectedErrorPatterns === null) _expectedErrorPatterns = [];
  if (pattern) _expectedErrorPatterns.push(pattern instanceof RegExp ? pattern : new RegExp(pattern));
  // pattern === null → just allow any errors during this test
  else _expectedErrorPatterns.push(/.*/);
};

global.silenceConsoleErrors = () => { _silenceConsoleErrors = true; };

global.getCapturedErrors = () => _capturedErrors.slice();
global.getCapturedWarns  = () => _capturedWarns.slice();

const _formatArgs = (args) => args.map(a => {
  if (a instanceof Error) return a.message;
  if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
  return String(a);
}).join(' ');

beforeEach(() => {
  _expectedErrorPatterns = null;
  _silenceConsoleErrors  = false;
  _capturedErrors.length = 0;
  _capturedWarns.length  = 0;
  vi.spyOn(console, 'error').mockImplementation((...args) => { _capturedErrors.push(_formatArgs(args)); });
  vi.spyOn(console, 'warn' ).mockImplementation((...args) => { _capturedWarns .push(_formatArgs(args)); });
});

afterEach(() => {
  vi.restoreAllMocks();

  if (_silenceConsoleErrors) return;

  if (_capturedErrors.length === 0) return;

  if (_expectedErrorPatterns === null) {
    // Strict: any unexpected console.error fails the test.
    throw new Error(
      `Unexpected console.error during test (silent-failure guard):\n  ${_capturedErrors.join('\n  ')}\n` +
      `If this error is intentional, call expectConsoleError(/pattern/) inside the test, or silenceConsoleErrors() to disable the guard.`
    );
  }

  const unmatched = _capturedErrors.filter(msg =>
    !_expectedErrorPatterns.some(pat => pat.test(msg))
  );
  if (unmatched.length > 0) {
    throw new Error(
      `Unexpected console.error not covered by expectConsoleError patterns:\n  ${unmatched.join('\n  ')}`
    );
  }
});

global.makeTestActor = (overrides = {}) => {
  const updateHistory = [];
  const sys = overrides.system ?? {};
  const actor = {
    id: overrides.id ?? foundry.utils.randomID(),
    name: overrides.name ?? 'Test Character',
    type: overrides.type ?? 'character',
    hasPlayerOwner: overrides.hasPlayerOwner ?? true,
    system: {
      edge:   sys.edge   ?? 2,
      heart:  sys.heart  ?? 2,
      iron:   sys.iron   ?? 3,
      shadow: sys.shadow ?? 1,
      wits:   sys.wits   ?? 2,
      health:   { value: 5, max: 5,  min: 0,  ...(sys.health   ?? {}) },
      spirit:   { value: 5, max: 5,  min: 0,  ...(sys.spirit   ?? {}) },
      supply:   { value: 3, max: 5,  min: 0,  ...(sys.supply   ?? {}) },
      momentum: { value: 2, max: 10, min: -6, resetValue: 2, ...(sys.momentum ?? {}) },
      debility: {
        corrupted: false, cursed: false, tormented: false,
        wounded: false, shaken: false, unprepared: false,
        encumbered: false, maimed: false,
        permanentlyharmed: false, traumatized: false,
        doomed: false, indebted: false, battered: false,
        custom1: false, custom2: false,
        ...(sys.debility ?? {}),
      },
      xp: sys.xp ?? 0,
    },
    items: {
      find: (fn) => null,
      contents: [],
      ...(overrides.items ?? {}),
    },
    update: async (changes) => {
      updateHistory.push(changes);
      // Apply flat dot-notation changes to actor.system for test assertions
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.');
        let target = actor;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = val;
      }
    },
    _updateHistory: updateHistory,
  };
  return actor;
};
