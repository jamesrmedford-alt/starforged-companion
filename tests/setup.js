// tests/setup.js
// Shared Vitest setup — stubs the Foundry globals that module code imports
// from the global scope. Loaded via vitest.config.js `setupFiles`.
// Does NOT attempt to mock the Foundry canvas, pixi, or socket layers —
// those require a live Foundry instance (integration tests only).

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

global.makeTestActor = (overrides = {}) => {
  const updateHistory = [];
  const actor = {
    id: overrides.id ?? foundry.utils.randomID(),
    name: overrides.name ?? 'Test Character',
    type: overrides.type ?? 'character',
    hasPlayerOwner: overrides.hasPlayerOwner ?? true,
    system: {
      stats: {
        edge: 2, heart: 2, iron: 3, shadow: 1, wits: 2,
        ...(overrides.system?.stats ?? {}),
      },
      meters: {
        health:   { value: 5, max: 5,  ...(overrides.system?.meters?.health   ?? {}) },
        spirit:   { value: 5, max: 5,  ...(overrides.system?.meters?.spirit   ?? {}) },
        supply:   { value: 3, max: 5,  ...(overrides.system?.meters?.supply   ?? {}) },
        momentum: { value: 2, max: 10, reset: 2, ...(overrides.system?.meters?.momentum ?? {}) },
      },
      debilities: {
        corrupted: false, cursed: false, tormented: false,
        wounded: false, shaken: false, unprepared: false,
        encumbered: false, maimed: false, haunted: false,
        ...(overrides.system?.debilities ?? {}),
      },
      xp: { value: 0, max: 30, ...(overrides.system?.xp ?? {}) },
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
