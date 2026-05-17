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
  const _actors = [];
  const coll = {
    get: (id) => _actors.find(a => a.id === id) ?? null,
    find: (fn) => _actors.find(fn) ?? null,
    filter: (fn) => _actors.filter(fn),
    contents: _actors,
    // Iterator so `for (const a of game.actors)` works (Foundry's collection
    // is iterable; entity-registry uses it).
    [Symbol.iterator]: () => _actors[Symbol.iterator](),
    // Test helpers — not part of the Foundry API
    _set: (id, actor) => {
      const idx = _actors.findIndex(a => a.id === id);
      if (idx >= 0) _actors[idx] = actor;
      else _actors.push(actor);
    },
    _setAll: (actors) => { _actors.length = 0; _actors.push(...actors); },
    _reset:  () => { _actors.length = 0; },
  };
  return coll;
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
  const flags = { ...(overrides.flags ?? {}) };
  const sys = overrides.system ?? {};
  const type = overrides.type ?? 'character';

  // Per-type default system shape. character matches the ironsworn v1.27 schema;
  // starship matches vendor/foundry-ironsworn/src/module/actor/subtypes/starship.ts;
  // location matches subtypes/location.ts.
  let defaultSystem;
  if (type === 'starship') {
    defaultSystem = {
      notes: sys.notes ?? '',
      debility: {
        battered: false,
        cursed:   false,
        ...(sys.debility ?? {}),
      },
    };
  } else if (type === 'location') {
    defaultSystem = {
      subtype:     sys.subtype     ?? 'star',
      klass:       sys.klass       ?? null,
      description: sys.description ?? '',
    };
  } else {
    defaultSystem = {
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
        wounded: false, shaken: false, unprepared: false,
        permanentlyharmed: false, traumatized: false,
        doomed: false, tormented: false, indebted: false,
        battered: false, cursed: false,
        corrupted: false, encumbered: false, maimed: false,
        ...(sys.debility ?? {}),
      },
      xp: sys.xp ?? 0,
      // Vendor system computed getters — tests may override these to simulate
      // foundry-ironsworn's #impactCount-driven momentumMax / momentumReset.
      ...(sys.momentumMax   !== undefined ? { momentumMax:   sys.momentumMax   } : {}),
      ...(sys.momentumReset !== undefined ? { momentumReset: sys.momentumReset } : {}),
    };
  }

  const actor = {
    id: overrides.id ?? foundry.utils.randomID(),
    name: overrides.name ?? (type === 'starship' ? 'Test Starship'
                              : type === 'location' ? 'Test Location'
                              : 'Test Character'),
    type,
    img: overrides.img ?? null,
    folder: overrides.folder ?? null,
    hasPlayerOwner: overrides.hasPlayerOwner ?? (type === 'character'),
    system: defaultSystem,
    flags,
    items: (() => {
      const overrideItems = overrides.items ?? {};
      const seedContents = Array.isArray(overrideItems.contents) ? overrideItems.contents : [];
      const contents = [...seedContents];
      return {
        contents,
        get size() { return contents.length; },
        find:   (fn) => contents.find(fn) ?? null,
        filter: (fn) => contents.filter(fn),
        [Symbol.iterator]: () => contents[Symbol.iterator](),
        ...overrideItems,
        // overrides above can replace find/contents wholesale if needed
      };
    })(),
    update: async (changes) => {
      updateHistory.push(changes);
      // Apply flat dot-notation changes to the actor for test assertions.
      // Auto-create intermediate objects so callers writing to e.g.
      // "flags.starforged-companion.ship" on an actor with no flag scope
      // succeed (matches Foundry V13 actor.update semantics).
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.');
        let target = actor;
        for (let i = 0; i < parts.length - 1; i++) {
          if (target[parts[i]] == null || typeof target[parts[i]] !== 'object') {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = val;
      }
    },
    getFlag: (mod, key) => {
      const scope = flags[mod];
      if (!scope) return undefined;
      // Allow dotted-key reads e.g. getFlag(MODULE, 'ship.foo') if any caller wants
      const parts = key.split('.');
      let cur = scope;
      for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
      }
      return cur;
    },
    setFlag: async (mod, key, val) => {
      if (!flags[mod]) flags[mod] = {};
      const parts = key.split('.');
      let cur = flags[mod];
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = val;
    },
    _updateHistory: updateHistory,
  };
  return actor;
};

// ---------------------------------------------------------------------------
// Actor.create — global stub that mirrors JournalEntry.create. Tests that
// exercise Actor creation paths (ship/starship migration, etc.) use this.
// The stub builds the mock via makeTestActor() and registers it in
// game.actors so subsequent .get() lookups resolve.
// ---------------------------------------------------------------------------

global.Actor = {
  create: async (data) => {
    const actor = global.makeTestActor({
      id:     data?.id     ?? foundry.utils.randomID(),
      name:   data?.name   ?? 'Unknown Actor',
      type:   data?.type   ?? 'character',
      img:    data?.img    ?? null,
      folder: data?.folder ?? null,
      flags:  data?.flags  ?? {},
      system: data?.system ?? {},
    });
    global.game.actors._set(actor.id, actor);
    return actor;
  },
};

// ---------------------------------------------------------------------------
// Folder.create — stub for folder helpers in src/entities/folder.js.
// Tracks created folders so `game.folders.find` resolves them.
// ---------------------------------------------------------------------------

global.game.folders = (() => {
  const _folders = [];
  return {
    get:    (id) => _folders.find(f => f.id === id) ?? null,
    find:   (fn) => _folders.find(fn) ?? null,
    filter: (fn) => _folders.filter(fn),
    contents: _folders,
    [Symbol.iterator]: () => _folders[Symbol.iterator](),
    _set:    (folder) => { _folders.push(folder); },
    _reset:  () => { _folders.length = 0; },
  };
})();

// ---------------------------------------------------------------------------
// Item.create — minimal global stub. Tests that exercise character-item
// registration (bonds, vows) read from actor.items.contents to verify the
// new Item was attached. Tracks the second-arg options (e.g. suppressLog)
// on the returned Item via __createOptions so tests can assert that flows
// silence the ironsworn chat-alert hook.
// ---------------------------------------------------------------------------

global.Item = {
  create: async (data, options = {}) => {
    const item = {
      id:     data?.id     ?? foundry.utils.randomID(),
      name:   data?.name   ?? 'Unknown Item',
      type:   data?.type   ?? 'progress',
      system: data?.system ?? {},
      flags:  data?.flags  ?? {},
      parent: options?.parent ?? null,
      __createOptions: { ...options },
    };
    if (options?.parent?.items?.contents) {
      options.parent.items.contents.push(item);
    }
    return item;
  },
};

global.Folder = {
  create: async (data) => {
    const folder = {
      id:     foundry.utils.randomID(),
      name:   data?.name ?? 'Folder',
      type:   data?.type ?? 'JournalEntry',
      color:  data?.color ?? null,
      folder: data?.folder ?? null,
    };
    global.game.folders._set(folder);
    return folder;
  },
};
