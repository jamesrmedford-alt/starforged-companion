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
