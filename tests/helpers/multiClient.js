/**
 * STARFORGED COMPANION
 * tests/helpers/multiClient.js — simulate a multi-client Foundry table
 *
 * Issue #282, item 2. The 2026-10 audit's defects only appear with more than
 * one connected client: every `!command` ran once per client (Foundry fires
 * createChatMessage on every client), GM-only commands ran on the GM's
 * client for players, dialogs opened on every screen, player writes were
 * refused or skipped. A unit test that fires a hook once, as one user,
 * cannot see any of that. This harness runs the module the way a table does:
 *
 *   const table = await simulateTable({ users: [GM, GM2, P1, P2] });
 *   await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
 *   await table.settle();
 *   expect(table.world.messages().filter(isOracleCard)).toHaveLength(1);
 *
 * Model
 * -----
 *   - One CLIENT per user. Each has its own `game` (game.user, a settings
 *     facade, a socket, its own game.messages replicas), its own `Hooks`
 *     registry, its own `ui.notifications` log, and its OWN COPY OF EVERY
 *     MODULE (src/index.js and everything it imports, statically or lazily,
 *     evaluated afresh for that client) — so install guards, in-flight sets
 *     and the GM relay queue are per client, as in separate browsers.
 *   - A shared SERVER: world settings (stored as JSON, like Setting
 *     documents), chat messages, actors, the user list, the socket bus.
 *   - Booting a client imports src/index.js in that client's context and
 *     fires `init` → `setup` → `ready` on its Hooks, so every hook the module
 *     registers in production is registered here — a register* call missing
 *     from `ready` is missing in the harness too.
 *
 * Foundry semantics reproduced
 *   - Creating / updating / deleting a ChatMessage fires create / update /
 *     delete hooks on EVERY connected client: synchronously on the client
 *     that made the change (before its promise resolves), and later (a real
 *     macrotask) on the others. Each client holds its own replica; a local
 *     mutation that skips `update` never reaches the others.
 *   - A world-setting write fires updateSetting / createSetting and the
 *     setting's onChange on every client; `get` returns that client's cached
 *     parse (the same object until the next update), or a fresh copy of the
 *     default. Client-scoped settings are per client (claudeApiKey,
 *     privateLines…).
 *   - `game.socket.emit` reaches every OTHER connected client, JSON-cloned,
 *     on a later macrotask. A disconnected client receives nothing.
 *   - Permission-faithful (tests/helpers/foundryPermissions.js): a player's
 *     world-setting write rejects, a non-author's ChatMessage update /
 *     delete rejects, an Actor update without OWNER rejects.
 *   - Dialogs (foundry.applications.api.DialogV2) record which client opened
 *     them; each client answers through `client.answerDialogs(fn)`.
 *   - Claude: `fetch` to api.anthropic.com is answered by `table.claude`,
 *     which records the calling client and the API key it used. A reply may
 *     be a fault (tests/helpers/faults.js `claudeFault`: an HTTP error, a
 *     malformed body, a body that stalls, a request that never answers).
 *
 * Fault boundaries (issue #302 slice B)
 *   `table.interceptWrites(fn)` runs fn(write) before each world-setting
 *   write, Actor create / update and ChatMessage create / update applies
 *   (write = { kind, key | id, client, … }); returning an Error rejects the
 *   write (nothing applies, the caller's promise rejects) and returning a
 *   promise holds it until the promise settles. `table.onEvent(fn)` sees, in
 *   order, every Claude call and reply, applied or rejected write, card,
 *   notification, dialog and socket emit — the event order a failure report
 *   prints (faults.js `traceTable`). Both are cleared by reset(), and a table
 *   with neither installed behaves exactly as before.
 *
 * Async work
 *   Hook handlers are fire-and-forget in Foundry. The harness tracks every
 *   promise a hook handler, socket handler or DOM listener returns, and every
 *   pending delivery; `await table.settle()` runs until the table is quiet
 *   (it does not wait forever on a handler blocked on an unanswered dialog or
 *   a test-held promise — `table.drain()` does, with a timeout). A rejected
 *   handler promise is logged with console.error, as the browser would
 *   ("Uncaught (in promise)"), so tests/setup.js's console guard fails the
 *   test unless it expects the error.
 *
 * How the per-client split works
 *   `game`, `Hooks` and `ui` become accessor properties on globalThis that
 *   resolve through an AsyncLocalStorage context: code running "on" a client
 *   (client.run, and every hook / socket / listener the harness dispatches)
 *   sees that client's objects, including across awaits and timers: the
 *   timer globals are routed too, so a module's setTimeout / setInterval /
 *   setImmediate callback runs on the client that scheduled it — under real
 *   and fake timers alike.
 *   Per-client module copies route vitest's module cache through the same
 *   context. That is vitest-internal (vitest 3's vite-node runner,
 *   `__vitest_worker__.moduleCache`); simulateTable() throws a clear error if
 *   it is missing, so a vitest upgrade that changes it fails loudly here.
 *
 * Limits — read before relying on the harness
 *   - vi.mock factories are evaluated ONCE per test file and shared by every
 *     client (vitest caches a factory's result). Mock stateless leaves, or
 *     stub at the network boundary (table.claude) instead.
 *   - settle() waits for short (≤ 50 ms) real-clock client timers only.
 *     Under vi.useFakeTimers the test advances the clock itself
 *     (vi.advanceTimersByTimeAsync) — harness deliveries use the real
 *     setImmediate captured at import, so sockets still flow
 *     (multiplayerConcurrency.test.js's relay-timeout case is the model).
 *   - Whispers are delivered to every client (Foundry restricts them to the
 *     recipients and GMs); actors are one shared object per actor (updates
 *     still fire updateActor on every client); journals, scenes and folders
 *     are plain shared collections.
 *   - Outside a client context `game` / `Hooks` / `ui` are tests/setup.js's
 *     single-client stubs. Assert on `table.world` and the clients, or wrap
 *     the code in `client.run(…)`.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { parseHTML, StubElement, setListenerResultSink } from "./cardDom.js";
import { applyUpdate, getProperty, nextDocumentId } from "./documentStubs.js";
import {
  assertCanModifyMessage,
  assertCanSetSetting,
  permissionChecksEnforced,
  permissionError,
  userCanModifyMessage,
  userOwnsDocument,
} from "./foundryPermissions.js";
import { staticSettingScope } from "./settingScopes.js";

export const MODULE_ID = "starforged-companion";

/**
 * A Claude reply carrying this key is a fault, not a reply: `handle` returns
 * what reply[CLAUDE_FAULT](call) returns — a Response-like object, a rejected
 * promise (a network error) or one that never settles. Built by faults.js.
 */
export const CLAUDE_FAULT = Symbol.for("multiClient.claudeFault");

// Captured at import, before any test can install fake timers: deliveries and
// settle() must keep flowing under vi.useFakeTimers().
const realSetImmediate = globalThis.setImmediate.bind(globalThis);
const realSetTimeout   = globalThis.setTimeout.bind(globalThis);
const REAL_TIMERS = {
  setTimeout:   globalThis.setTimeout,
  setInterval:  globalThis.setInterval,
  setImmediate: globalThis.setImmediate,
};

const als = new AsyncLocalStorage();

/** The simulated client whose code is running now, or null (test body). */
export function currentClient() {
  return als.getStore()?.client ?? null;
}

const jsonClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function formatLogArg(a) {
  if (a instanceof Error) return a.message;
  if (typeof a === "string") return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global routing — what a simulated client sees
// ─────────────────────────────────────────────────────────────────────────────

// Per client (client.globals): game, Hooks, ui. Per table (table.globals): the
// document classes, fetch, the DOM element class and DialogV2. Outside any
// client context every name resolves to the base value — tests/setup.js's
// single-client stubs — so unit tests in the same file are unaffected while a
// table is alive.
const ROUTED_GLOBALS = ["game", "Hooks", "ui", "ChatMessage", "Actor", "HTMLElement", "fetch"];
let _routing = null;   // { base, hadOwn, api, refs }

function resolveRouted(name, base) {
  const client = currentClient();
  if (!client) return base[name];
  if (Object.prototype.hasOwnProperty.call(client.globals, name)) return client.globals[name];
  if (Object.prototype.hasOwnProperty.call(client.table.globals, name)) return client.table.globals[name];
  return base[name];
}

function installGlobalRouting() {
  if (_routing) { _routing.refs += 1; return; }
  const base = {};
  const hadOwn = {};
  for (const name of ROUTED_GLOBALS) {
    hadOwn[name] = Object.prototype.hasOwnProperty.call(globalThis, name);
    base[name] = globalThis[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable:   true,
      get() { return resolveRouted(name, base); },
      set(value) {
        const client = currentClient();
        if (client) client.globals[name] = value;
        else base[name] = value;
      },
    });
  }
  // DialogV2 is a property of foundry.applications.api, not a global.
  const api = globalThis.foundry?.applications?.api ?? null;
  if (api) {
    hadOwn.DialogV2 = Object.prototype.hasOwnProperty.call(api, "DialogV2");
    base.DialogV2 = api.DialogV2;
    Object.defineProperty(api, "DialogV2", {
      configurable: true,
      enumerable:   true,
      get() { return resolveRouted("DialogV2", base); },
      set(value) {
        const client = currentClient();
        if (client) client.globals.DialogV2 = value;
        else base.DialogV2 = value;
      },
    });
  }
  installTimerRouting();
  _routing = { base, hadOwn, api, refs: 1 };
}

// Timers: a callback a client schedules must run in that client's context.
// Real timers carry AsyncLocalStorage on their own; vitest's fake timers do
// not — the fake clock fires callbacks from vi.advanceTimersByTime(), in the
// test body — so a module's setTimeout(…) under fake timers would run against
// the base stubs. globalThis.setTimeout / setInterval / setImmediate become
// accessors whose getter returns a wrapper bound to the CURRENT
// implementation (real or fake) that re-enters the scheduling client around
// the callback. Assigning a plain function (vi.useFakeTimers, vitest's RPC
// safe-timer swap) makes it the implementation; assigning a wrapper back (fake
// timers uninstalling, the RPC swap restoring) restores the implementation
// that wrapper was bound to.
const ROUTED_TIMERS = ["setTimeout", "setInterval", "setImmediate"];
const ROUTED_TIMER = Symbol("multiClient.routedTimer");   // wrapper → its implementation
const PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");
const _timers = {};   // name → { base, underlying, wrappers }

// A client timer this short, on the real clock, is work in flight: settle()
// waits for it (a module's setTimeout(…, 0) hop — the oracle follow-up relay —
// can outlast a few idle setImmediate turns). Longer timers and timers on
// vitest's fake clock are future events a test advances explicitly.
const SETTLE_TIMER_MAX_MS = 50;

function timerState(name) {
  _timers[name] ??= { name, base: REAL_TIMERS[name], underlying: REAL_TIMERS[name], wrappers: new WeakMap() };
  return _timers[name];
}

function routedWrapper(state, impl) {
  let wrapper = state.wrappers.get(impl);
  if (wrapper) return wrapper;
  wrapper = function routedTimer(callback, ...rest) {
    const store = als.getStore();
    if (!store?.client || typeof callback !== "function") return impl.call(globalThis, callback, ...rest);
    const table = store.client.table;
    const delay = state.name === "setImmediate" ? 0 : (Number(rest[0]) || 0);
    let pending = null;
    if (state.name !== "setInterval" && impl === state.base && delay <= SETTLE_TIMER_MAX_MS) {
      pending = { due: Date.now() + delay };
      table._shortTimers.add(pending);
    }
    return impl.call(globalThis, function clientTimer(...args) {
      if (pending) {
        table._shortTimers.delete(pending);
        table._progress += 1;
      }
      return als.run(store, () => callback.apply(this, args));
    }, ...rest);
  };
  wrapper[ROUTED_TIMER] = impl;
  if (impl?.[PROMISIFY_CUSTOM]) wrapper[PROMISIFY_CUSTOM] = impl[PROMISIFY_CUSTOM];
  state.wrappers.set(impl, wrapper);
  return wrapper;
}

function asImplementation(state, value) {
  if (typeof value !== "function") return state.base;
  return value[ROUTED_TIMER] ?? value;
}

function installTimerRouting() {
  for (const name of ROUTED_TIMERS) {
    const state = timerState(name);
    state.underlying = asImplementation(state, globalThis[name]);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable:   true,
      get() { return routedWrapper(state, state.underlying); },
      set(value) { state.underlying = asImplementation(state, value); },
    });
  }
}

function uninstallTimerRouting() {
  for (const name of ROUTED_TIMERS) {
    const state = _timers[name];
    Object.defineProperty(globalThis, name, { configurable: true, enumerable: true, writable: true, value: state.underlying });
  }
}

function uninstallGlobalRouting() {
  if (!_routing) return;
  _routing.refs -= 1;
  if (_routing.refs > 0) return;
  uninstallTimerRouting();
  const { base, hadOwn, api } = _routing;
  for (const name of ROUTED_GLOBALS) {
    if (hadOwn[name]) {
      Object.defineProperty(globalThis, name, { configurable: true, enumerable: true, writable: true, value: base[name] });
    } else {
      delete globalThis[name];
    }
  }
  if (api) {
    if (hadOwn.DialogV2 || base.DialogV2 !== undefined) {
      Object.defineProperty(api, "DialogV2", { configurable: true, enumerable: true, writable: true, value: base.DialogV2 });
    } else {
      delete api.DialogV2;
    }
  }
  _routing = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-cache routing — one copy of every module per client (vitest internals)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_METHODS = ["get", "getByModuleId", "set", "setByModuleId", "update", "delete", "deleteByModuleId", "has"];
let _cacheRouting = null;   // { base, saved, Ctor, refs }

function installModuleCacheRouting() {
  if (_cacheRouting) { _cacheRouting.refs += 1; return; }
  const base = globalThis.__vitest_worker__?.moduleCache;
  const proto = base ? Object.getPrototypeOf(base) : null;
  if (!base || typeof proto?.getByModuleId !== "function") {
    throw new Error(
      "multiClient: vitest's module cache (__vitest_worker__.moduleCache, vitest 3 / vite-node) was not " +
      "found, so simulated clients cannot get their own module copies. A vitest upgrade probably changed " +
      "the runner — update installModuleCacheRouting() in tests/helpers/multiClient.js.",
    );
  }
  const saved = {};
  for (const name of CACHE_METHODS) {
    saved[name] = Object.prototype.hasOwnProperty.call(base, name) ? base[name] : undefined;
    const impl = proto[name] ?? Map.prototype[name];
    base[name] = function routedModuleCache(...args) {
      const cache = currentClient()?.moduleCache;
      return impl.apply(cache ?? this, args);
    };
  }
  _cacheRouting = { base, saved, Ctor: proto.constructor, refs: 1 };
}

function uninstallModuleCacheRouting() {
  if (!_cacheRouting) return;
  _cacheRouting.refs -= 1;
  if (_cacheRouting.refs > 0) return;
  const { base, saved } = _cacheRouting;
  for (const name of CACHE_METHODS) {
    if (saved[name] === undefined) delete base[name];
    else base[name] = saved[name];
  }
  _cacheRouting = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collections
// ─────────────────────────────────────────────────────────────────────────────

/** A Foundry-ish Collection over a Map (insertion order). */
class SimCollection {
  constructor(entries = []) {
    this._map = new Map(entries);
  }
  get(id) { return this._map.get(id) ?? null; }
  has(id) { return this._map.has(id); }
  get contents() { return [...this._map.values()]; }
  get size() { return this._map.size; }
  values() { return this._map.values(); }
  keys() { return this._map.keys(); }
  entries() { return this._map.entries(); }
  [Symbol.iterator]() { return this._map.values(); }
  find(fn) { return this.contents.find(fn) ?? null; }
  filter(fn) { return this.contents.filter(fn); }
  map(fn) { return this.contents.map(fn); }
  some(fn) { return this.contents.some(fn); }
  every(fn) { return this.contents.every(fn); }
  forEach(fn) { this.contents.forEach(fn); }
  reduce(fn, init) { return this.contents.reduce(fn, init); }
  getName(name) { return this.contents.find(d => d?.name === name) ?? null; }
  // tests/setup.js-compatible helpers: _set(id, doc) (actors) or _set(doc) (folders)
  _set(idOrDoc, doc) {
    if (doc === undefined && idOrDoc && typeof idOrDoc === "object") this._map.set(idOrDoc.id, idOrDoc);
    else this._map.set(idOrDoc, doc);
  }
  _setAll(docs) { this._map.clear(); for (const d of docs) this._map.set(d.id, d); }
  _reset() { this._map.clear(); }
  set(id, doc) { this._map.set(id, doc); return this; }
  delete(id) { return this._map.delete(id); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks — one registry per client
// ─────────────────────────────────────────────────────────────────────────────

class SimHooks {
  constructor(client) {
    this.client = client;
    this._handlers = new Map();
    this._nextId = 1;
    const self = this;
    this.api = {
      on: (name, fn) => self.on(name, fn, false),
      once: (name, fn) => self.on(name, fn, true),
      off: (name, fnOrId) => self.off(name, fnOrId),
      call: (name, ...args) => self.call(name, args, true),
      callAll: (name, ...args) => self.call(name, args, false),
      get events() { return Object.fromEntries([...self._handlers].map(([k, v]) => [k, v.map(h => h.fn)])); },
      // tests/setup.js compatibility: name → array of functions.
      _handlers: {
        get: (name) => (self._handlers.get(name) ?? []).map(h => h.fn),
        has: (name) => self._handlers.has(name),
        keys: () => self._handlers.keys(),
        clear: () => self._handlers.clear(),
      },
    };
  }

  on(name, fn, once) {
    if (typeof fn !== "function") throw new TypeError(`Hooks.on("${name}"): handler must be a function`);
    if (!this._handlers.has(name)) this._handlers.set(name, []);
    const id = this._nextId++;
    this._handlers.get(name).push({ id, fn, once });
    return id;
  }

  off(name, fnOrId) {
    const list = this._handlers.get(name);
    if (!list) return;
    const i = list.findIndex(h => h.id === fnOrId || h.fn === fnOrId);
    if (i >= 0) list.splice(i, 1);
  }

  count(name) {
    return (this._handlers.get(name) ?? []).length;
  }

  /** Foundry's Hooks.call / callAll. Must run inside the client's context. */
  call(name, args, stopOnFalse) {
    const list = [...(this._handlers.get(name) ?? [])];
    for (const h of list) {
      if (h.once) this.off(name, h.id);
      let out;
      try {
        out = h.fn(...args);
      } catch (err) {
        // Foundry: Hooks.onError → console.error, and the next handler runs.
        console.error(`[${this.client.id}] Error thrown in hooked function '${h.fn.name || "anonymous"}' for hook '${name}'.`, err);
        continue;
      }
      if (out && typeof out.then === "function") this.client.table._track(out, `${this.client.id} hook ${name}`);
      if (stopOnFalse && out === false) return false;
    }
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

function makeUser(spec) {
  if (!spec?.id) throw new Error("simulateTable: every user needs an id");
  const user = {
    id: spec.id,
    _id: spec.id,
    name: spec.name ?? spec.id,
    isGM: !!spec.isGM,
    active: spec.active !== false,
    role: spec.role ?? (spec.isGM ? 4 : 1),
    character: spec.character ?? null,
    color: spec.color ?? "#999999",
    flags: spec.flags ?? {},
    get isSelf() { return currentClient()?.id === this.id; },
    hasRole(role) { return this.role >= (typeof role === "number" ? role : 1); },
    can() { return this.isGM; },
    getFlag(scope, key) { return getProperty(this.flags?.[scope], key); },
  };
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat messages — per-client replicas over a server source
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGE_FIELDS = ["content", "flags", "whisper", "speaker", "style", "type", "rolls", "timestamp", "blind", "sound", "emote", "title"];

class SimChatMessageReplica {
  constructor(client, source) {
    Object.defineProperty(this, "_client", { value: client, enumerable: false });
    Object.defineProperty(this, "_source", { value: null, enumerable: false, writable: true });
    this._applySource(source);
  }

  _applySource(source) {
    this._source = jsonClone(source);
    const data = jsonClone(source);
    for (const key of MESSAGE_FIELDS) this[key] = data[key];
  }

  get id() { return this._source._id; }
  get _id() { return this._source._id; }
  get author() { return this._client.users.get(this._source.author); }
  get user() { return this.author; }
  get isAuthor() { return this._source.author === currentClient()?.id; }
  get visible() { return true; }
  get isContentVisible() { return true; }
  get alias() { return this.speaker?.alias ?? this.author?.name ?? ""; }

  getFlag(scope, key) { return getProperty(this.flags?.[scope], key); }
  setFlag(scope, key, value) { return this.update({ [`flags.${scope}.${key}`]: value }); }
  unsetFlag(scope, key) {
    const parts = String(key).split(".");
    const leaf = parts.pop();
    return this.update({ [[`flags.${scope}`, ...parts].join(".") + `.-=${leaf}`]: null });
  }

  testUserPermission(user) { return userCanModifyMessage(user, this._source.author); }
  canUserModify(user) { return userCanModifyMessage(user, this._source.author); }

  async update(changes = {}, options = {}) {
    const client = requireClient("ChatMessage#update");
    assertCanModifyMessage("update", this);
    return client.table._updateMessage(client, this.id, changes, options);
  }

  async delete(options = {}) {
    const client = requireClient("ChatMessage#delete");
    assertCanModifyMessage("delete", this);
    return client.table._deleteMessage(client, this.id, options);
  }

  toObject() { return jsonClone(this._source); }
}

function requireClient(what) {
  const client = currentClient();
  if (!client) {
    throw new Error(`multiClient: ${what} was called outside any simulated client — wrap it in client.run(…)`);
  }
  return client;
}

function makeChatMessageClass() {
  return class SimChatMessage {
    static get implementation() { return SimChatMessage; }

    static async create(data = {}, options = {}) {
      const client = requireClient("ChatMessage.create");
      return client.table._createMessage(client, data, options);
    }

    static async createDocuments(list = [], options = {}) {
      const out = [];
      for (const data of list) out.push(await SimChatMessage.create(data, options));
      return out;
    }

    static getSpeaker({ scene = null, actor = null, token = null, alias = null } = {}) {
      const user = currentClient()?.user ?? null;
      const actorDoc = actor ?? user?.character ?? null;
      return {
        scene: scene?.id ?? null,
        actor: actorDoc?.id ?? null,
        token: token?.id ?? null,
        alias: alias ?? token?.name ?? actorDoc?.name ?? user?.name ?? "",
      };
    }

    static getWhisperRecipients(name) {
      const client = currentClient();
      const users = client ? client.users.contents : [];
      if (/^gm$/i.test(name ?? "")) return users.filter(u => u.isGM);
      return users.filter(u => u.name === name);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────────────────────────────────────────

function makeDialogV2(table) {
  const open = (api) => (options = {}) => table._openDialog(api, options);
  return {
    prompt:  open("DialogV2.prompt"),
    wait:    open("DialogV2.wait"),
    confirm: open("DialogV2.confirm"),
    input:   open("DialogV2.input"),
    query:   open("DialogV2.query"),
  };
}

/**
 * One dialog shown on one client. A responder (client.answerDialogs) calls
 * one of submit / choose / close, or returns a value directly.
 */
class SimDialog {
  constructor(client, api, options) {
    this.client  = client.id;
    this.api     = api;
    this.options = options;
    this.title   = options?.window?.title ?? options?.title ?? "";
    this.content = typeof options?.content === "string" ? options.content : "";
    this.form    = parseHTML(this.content, { tag: "form" });
    this.buttons = Array.isArray(options?.buttons) ? options.buttons : [];
  }

  /** Fill named fields: { 'textarea[name="text"]': "spiders", … } (selector → value / boolean). */
  fill(values = {}) {
    for (const [selector, value] of Object.entries(values)) {
      const el = this.form.querySelector(selector);
      if (!el) throw new Error(`multiClient: dialog "${this.title}" has no field matching ${selector}`);
      if (typeof value === "boolean") el.checked = value;
      else el.value = value;
    }
    return this;
  }

  /** Press OK (prompt / input) with the form as filled. */
  submit(values = {}) {
    this.fill(values);
    const ok = this.options?.ok ?? this.buttons.find(b => b.default) ?? this.buttons[0];
    return this.#press(ok, ok?.action ?? "ok");
  }

  /** Press the button whose action is `action` (wait / confirm). */
  choose(action, values = {}) {
    this.fill(values);
    if (this.api === "DialogV2.confirm" && (action === "yes" || action === "no")) {
      const btn = action === "yes" ? this.options?.yes : this.options?.no;
      if (btn?.callback) return this.#press(btn, action);
      return action === "yes";
    }
    const btn = this.buttons.find(b => b.action === action);
    if (!btn) throw new Error(`multiClient: dialog "${this.title}" has no "${action}" button (has ${this.buttons.map(b => b.action).join(", ") || "none"})`);
    return this.#press(btn, action);
  }

  /** Dismiss without choosing (DialogV2 resolves null). */
  close() { return null; }

  #press(button, action) {
    const btnEl = new StubElement("button", [["data-action", String(action)]]);
    Object.defineProperty(btnEl, "form", { value: this.form });
    if (typeof button?.callback === "function") return button.callback(null, btnEl, { element: this.form });
    return action;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude (api.anthropic.com) — answered by the table, recorded per client
// ─────────────────────────────────────────────────────────────────────────────

class SimClaude {
  /**
   * The default reply: a line of prose plus the empty fact-continuity sidecar
   * fence the narrator's prompt requires (narration calls warn without one).
   * Calls that expect JSON only (pacing classifier, interpreter, detection)
   * need a test-provided responder.
   */
  static DEFAULT_REPLY = 'The station hums. Nothing moves.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

  constructor(table = null) {
    this.table = table;
    this.calls = [];
    this._responder = null;
  }

  /**
   * fn(call) → string (reply text) | object (raw response JSON) | Promise of
   * either. `call` = { client, apiKey, model, system, userText, messages, body }.
   */
  respond(fn) { this._responder = fn; }

  reset() { this.calls.length = 0; this._responder = null; }

  /** Calls made by one client. */
  by(clientId) { return this.calls.filter(c => c.client === clientId); }

  async handle(client, url, init) {
    let body = {};
    try {
      body = JSON.parse(init?.body ?? "{}");
    } catch (err) {
      console.warn(`multiClient: Claude request body is not JSON (${err.message}) — recorded with an empty body.`);
    }
    const headers = init?.headers ?? {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const textOf = (content) => (typeof content === "string"
      ? content
      : Array.isArray(content) ? content.map(p => p?.text ?? "").join("\n") : "");
    const call = {
      client: client?.id ?? null,
      url,
      apiKey: headers["x-api-key"] ?? null,
      model: body.model ?? null,
      system: typeof body.system === "string" ? body.system : textOf(body.system),
      userText: messages.filter(m => m?.role === "user").map(m => textOf(m.content)).join("\n"),
      messages,
      body,
    };
    this.calls.push(call);
    const n = this.calls.length;
    this.table?._emitEvent({ type: "claude.call", n, client: call.client, model: call.model, userText: call.userText });
    const out = this._responder ? await this._responder(call) : SimClaude.DEFAULT_REPLY;
    if (out && typeof out[CLAUDE_FAULT] === "function") {
      this.table?._emitEvent({ type: "claude.reply", n, client: call.client, outcome: out.label ?? "fault" });
      return out[CLAUDE_FAULT](call);
    }
    this.table?._emitEvent({ type: "claude.reply", n, client: call.client, outcome: "reply" });
    const json = typeof out === "string"
      ? {
          id: `msg_${this.calls.length}`, type: "message", role: "assistant", model: call.model,
          content: [{ type: "text", text: out }], stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 10 },
        }
      : out;
    const text = JSON.stringify(json);
    return {
      ok: true, status: 200, statusText: "OK",
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

class SimClient {
  constructor(table, user) {
    this.table = table;
    this.user = user;
    this.id = user.id;
    this.connected = user.active;
    this.booted = false;
    this.moduleCache = new _cacheRouting.Ctor();
    this.hooks = new SimHooks(this);
    this.socketHandlers = new Map();
    this.socketEmits = [];
    this.clientSettings = new Map();    // "ns.key" → JSON string
    this.settingConfigs = new Map();    // "ns.key" → config (this client's register calls)
    this.worldCache = new Map();        // "ns.key" → parsed world value
    this.messages = new SimCollection();
    this.rendered = new Map();          // message id → rendered root
    this.notifications = [];            // { level, message }
    this.dialogs = [];
    this._dialogResponder = null;
    this._testListeners = [];
    this.moduleRecords = new Map([[MODULE_ID, { id: MODULE_ID, active: true, api: {} }]]);
    this.globals = { game: this.#makeGame(), Hooks: this.hooks.api, ui: this.#makeUi() };
  }

  get users() { return this.table.users; }
  get game() { return this.globals.game; }
  get isGM() { return this.user.isGM; }

  /** Run fn on this client (its game / Hooks / ui / module copies). */
  run(fn) {
    return als.run({ client: this }, fn);
  }

  /** Import a module from THIS client's module graph (path relative to tests/helpers/). */
  import(specifier) {
    return this.run(() => import(/* @vite-ignore */ specifier));
  }

  /** The module copy of src/index.js this client booted. */
  get index() { return this._index; }

  /**
   * A page load: import src/index.js into this client's module graph, then
   * fire init → i18nInit → setup → ready on its Hooks and let the table
   * settle. Boot chatter (console log / info / debug / warn — "Ready", the
   * stub world's missing Macro / Note classes) goes to `table.bootLog`
   * instead of the test output; console.error is left alone.
   */
  async boot() {
    if (this.booted) return;
    const restore = this.table._bufferConsole(this.id);
    try {
      this._index = await this.run(() => import("../../src/index.js"));
      this.run(() => {
        this.hooks.call("init", [], false);
        this.hooks.call("i18nInit", [], false);
        this.hooks.call("setup", [], false);
      });
      this.game.ready = true;
      this.run(() => this.hooks.call("ready", [], false));
      this.booted = true;
      await this.table.settle();
    } finally {
      restore();
    }
  }

  /** Answer every dialog this client opens: fn(dialog) → value (see SimDialog). */
  answerDialogs(fn) { this._dialogResponder = fn; }

  /**
   * A test-only hook handler on this client — removed by table.reset(), so a
   * table shared across tests does not accumulate them.
   *
   * @returns {() => void} remove it now
   */
  listen(hook, fn) {
    const id = this.hooks.on(hook, fn, false);
    this._testListeners.push(() => this.hooks.off(hook, id));
    return () => this.hooks.off(hook, id);
  }

  /** A test-only socket listener on this client (removed by table.reset()). */
  listenSocket(event, fn) {
    this.game.socket.on(event, fn);
    const off = () => this.game.socket.off(event, fn);
    this._testListeners.push(off);
    return off;
  }

  /** Set a setting AS THIS CLIENT (permission-checked, hooks fire). */
  setSetting(key, value, namespace = MODULE_ID) {
    return this.run(() => this.game.settings.set(namespace, key, value));
  }

  getSetting(key, namespace = MODULE_ID) {
    return this.run(() => this.game.settings.get(namespace, key));
  }

  /**
   * Type into the chat box: fires the `chatMessage` hook on this client (a
   * handler returning false cancels, as the module's `!x` interception does),
   * then creates the message authored by this user.
   *
   * @returns {Promise<Object|undefined>} this client's replica, or undefined when cancelled
   */
  async chat(content, data = {}) {
    return this.run(async () => {
      const chatData = {
        content,
        author: this.id,
        speaker: data.speaker ?? globalThis.ChatMessage.getSpeaker(),
        ...data,
      };
      const proceed = this.hooks.call("chatMessage", [{ id: "chat" }, content, chatData], true);
      if (proceed === false) return undefined;
      const style = chatData.style ?? (chatData.speaker?.token
        ? globalThis.CONST?.CHAT_MESSAGE_STYLES?.IC ?? 2
        : globalThis.CONST?.CHAT_MESSAGE_STYLES?.OOC ?? 1);
      return globalThis.ChatMessage.create({ type: "base", style, ...chatData });
    });
  }

  /** This client's replica of a message (by id or replica from any client). */
  message(idOrMessage) {
    const id = typeof idOrMessage === "string" ? idOrMessage : idOrMessage?.id;
    return this.messages.get(id);
  }

  /**
   * Render a message on this client the way the chat log does — a fresh
   * <li data-message-id> root, then renderChatMessageHTML on this client's
   * Hooks — and return the root. Re-rendered automatically when the message
   * is updated.
   */
  render(idOrMessage) {
    const message = this.message(idOrMessage);
    if (!message) throw new Error(`multiClient: ${this.id} has no message ${typeof idOrMessage === "string" ? idOrMessage : idOrMessage?.id}`);
    const root = parseHTML(
      `<header class="message-header flexrow"><h4 class="message-sender">${message.alias}</h4></header>` +
      `<div class="message-content">${message.content ?? ""}</div>`,
      { tag: "li", attrs: { class: "chat-message message flexcol", "data-message-id": message.id } },
    );
    this.rendered.set(message.id, root);
    this.run(() => this.hooks.call("renderChatMessageHTML", [message, root, { message: message.toObject() }], false));
    return root;
  }

  /**
   * Click the element matching `selector` on the rendered message (rendering
   * it first if this client has not). A disabled element swallows the click.
   *
   * @returns {StubElement} the element clicked
   */
  click(idOrMessage, selector, { index = 0 } = {}) {
    const message = this.message(idOrMessage);
    const id = message?.id ?? (typeof idOrMessage === "string" ? idOrMessage : idOrMessage?.id);
    const root = this.rendered.get(id) ?? this.render(id);
    const matches = root.querySelectorAll(selector);
    const el = matches[index];
    if (!el) {
      const actions = root.querySelectorAll("[data-action]").map(e => e.dataset.action);
      throw new Error(`multiClient: ${this.id} sees no "${selector}" on message ${id} (data-actions: ${actions.join(", ") || "none"})`);
    }
    this.run(() => el.click());
    return el;
  }

  // ── game ──────────────────────────────────────────────────────────────────
  #makeGame() {
    const client = this;
    const table = this.table;
    return {
      get user() { return client.user; },
      get userId() { return client.id; },
      users: table.users,
      settings: this.#makeSettings(),
      socket: this.#makeSocket(),
      messages: this.messages,
      actors: table.actors,
      journal: table.journal,
      folders: table.folders,
      scenes: table.scenes,
      combats: table.combats,
      macros: table.macros,
      items: table.items,
      tables: table.rollTables,
      packs: new SimCollection(),
      modules: { get: (id) => client.moduleRecords.get(id) ?? null },
      i18n: {
        lang: "en",
        localize: (key) => table.i18n[key] ?? key,
        format: (key, data = {}) => String(table.i18n[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m)),
        has: (key) => key in table.i18n,
      },
      world: { id: "test-world", title: "Test World" },
      system: { id: "foundry-ironsworn", version: "1.27.0" },
      version: "13.351",
      release: { generation: 13 },
      ready: false,
      paused: false,
      time: { worldTime: 0 },
    };
  }

  #makeUi() {
    const client = this;
    const note = (level) => (message, options) => {
      client.notifications.push({ level, message: String(message), options });
      client.table._emitEvent({ type: "notify", client: client.id, level, message: String(message) });
      return { id: client.notifications.length };
    };
    return {
      notifications: { info: note("info"), warn: note("warn"), error: note("error"), notify: note("notify"), remove() {} },
      chat: { scrollBottom() {}, updateMessage() {}, postOne() {}, render() {} },
      sidebar: { activateTab() {}, changeTab() {} },
      windows: {},
      controls: { render() {} },
    };
  }

  #makeSettings() {
    const client = this;
    const table = this.table;
    const configs = this.settingConfigs;
    const scopeOf = (k) => configs.get(k)?.scope ?? table._settingConfig(k)?.scope ?? staticSettingScope(...splitKey(k)) ?? "world";
    const configOf = (k) => configs.get(k) ?? table._settingConfig(k) ?? null;
    return {
      settings: configs,
      register(namespace, key, config = {}) {
        configs.set(`${namespace}.${key}`, { ...config, namespace, key });
      },
      registerMenu() {},
      get(namespace, key) {
        const k = `${namespace}.${key}`;
        const config = configOf(k);
        if (scopeOf(k) === "client") {
          const json = client.clientSettings.get(k);
          return json !== undefined ? JSON.parse(json) : jsonClone(config?.default);
        }
        if (client.worldCache.has(k)) return client.worldCache.get(k);
        const json = table._worldSettings.get(k);
        if (json === undefined) return jsonClone(config?.default);
        const value = JSON.parse(json);
        client.worldCache.set(k, value);
        return value;
      },
      async set(namespace, key, value, options = {}) {
        const k = `${namespace}.${key}`;
        const scope = scopeOf(k);
        assertCanSetSetting(namespace, key, scope);
        if (scope === "client") {
          client.clientSettings.set(k, JSON.stringify(value ?? null));
          const parsed = JSON.parse(client.clientSettings.get(k));
          configOf(k)?.onChange?.(parsed, options, client.id);
          client.hooks.call("clientSettingChanged", [k, parsed, options], false);
          return value;
        }
        await table._setWorldSetting(client, k, value, options);
        return value;
      },
    };
  }

  #makeSocket() {
    const client = this;
    return {
      on(event, fn) {
        if (!client.socketHandlers.has(event)) client.socketHandlers.set(event, []);
        client.socketHandlers.get(event).push(fn);
      },
      off(event, fn) {
        const list = client.socketHandlers.get(event);
        if (!list) return;
        if (!fn) { client.socketHandlers.delete(event); return; }
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      emit(event, ...args) {
        if (typeof args[args.length - 1] === "function") args.pop();   // ack callbacks are not modelled
        client.table._emitSocket(client, event, args);
      },
      get connected() { return client.connected; },
      // tests/setup.js compatibility
      get _handlers() { return client.socketHandlers; },
      get _emitted() { return client.socketEmits; },
    };
  }
}

function splitKey(k) {
  const i = k.indexOf(".");
  return [k.slice(0, i), k.slice(i + 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────────────────────

class SimTable {
  constructor(userSpecs) {
    this.users = new SimCollection(userSpecs.map(makeUser).map(u => [u.id, u]));
    this.actors = new SimCollection();
    this.journal = new SimCollection();
    this.folders = new SimCollection();
    this.scenes = new SimCollection();
    this.combats = new SimCollection();
    this.macros = new SimCollection();
    this.items = new SimCollection();
    this.rollTables = new SimCollection();
    this.claude = new SimClaude(this);
    this.clients = [];
    this.dialogs = [];
    this.socketLog = [];
    this.errors = [];
    this.bootLog = [];   // { client, level, message } — console chatter during boot()
    this.globals = {};   // per-table globals (set in _start) — see resolveRouted()
    this.i18n = {};      // localization strings (simulateTable({ i18n })) — unknown keys localize to themselves
    this._worldSettings = new Map();       // "ns.key" → JSON
    this._serverMessages = new Map();      // id → source
    this._pending = new Set();
    this._shortTimers = new Set();   // { due } — short real-clock client timers not yet fired (routedWrapper)
    this._progress = 0;
    this._initialUsers = userSpecs.map(u => ({ ...u }));
    this._tornDown = false;
    this._writeInterceptors = [];   // interceptWrites() — fault boundaries
    this._eventSinks = [];          // onEvent() — the event order

    const t = this;
    this.world = {
      /** World setting value (fresh parse), or undefined when never written. */
      getSetting(key, namespace = MODULE_ID) {
        const json = t._worldSettings.get(`${namespace}.${key}`);
        return json === undefined ? undefined : JSON.parse(json);
      },
      /** Raw write (no permission check, no hooks) — for seeding. */
      setSetting(key, value, namespace = MODULE_ID) {
        const k = `${namespace}.${key}`;
        t._worldSettings.set(k, JSON.stringify(value));
        for (const c of t.clients) c.worldCache.delete(k);
      },
      campaignState() { return this.getSetting("campaignState"); },
      /** Server-side message sources, in creation order. */
      messages() { return [...t._serverMessages.values()].map(jsonClone); },
      message(id) { return jsonClone(t._serverMessages.get(id)); },
    };
  }

  client(id) {
    const c = this.clients.find(x => x.id === id);
    if (!c) throw new Error(`multiClient: no client "${id}" (have ${this.clients.map(x => x.id).join(", ")})`);
    return c;
  }

  get connectedClients() { return this.clients.filter(c => c.connected); }

  /** Messages whose module flags satisfy `pred(flags, source)`. */
  cards(pred = () => true) {
    return this.world.messages().filter(m => pred(m.flags?.[MODULE_ID] ?? {}, m));
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async _start({ boot, world, clientSettings, bootOrder }) {
    installGlobalRouting();
    installModuleCacheRouting();
    const table = this;
    this.globals = {
      ChatMessage: makeChatMessageClass(),
      Actor: this.#makeActorClass(),
      HTMLElement: StubElement,
      DialogV2: makeDialogV2(this),
      fetch: function simFetch(url) {
        const init = arguments[1];
        if (String(url).includes("api.anthropic.com")) return table.claude.handle(currentClient(), String(url), init);
        return Promise.reject(new Error(`multiClient: no network for ${url} (only api.anthropic.com is simulated)`));
      },
    };
    // DOM listener promises (async click handlers) are tracked by the table of
    // the client that dispatched the event.
    setListenerResultSink((p) => {
      const c = currentClient();
      if (c) c.table._track(p, `${c.id} DOM listener`);
    });

    for (const [key, value] of Object.entries(world?.settings ?? {})) this.world.setSetting(key, value);
    this._seedWorld = jsonClone(world?.settings ?? {});

    this.clients = this.users.contents.map(u => new SimClient(this, u));
    this._clientSettingSeeds = clientSettings ?? {};
    for (const c of this.clients) this.#seedClientSettings(c);

    if (boot) {
      const order = bootOrder
        ?? [...this.clients.filter(c => c.user.isGM), ...this.clients.filter(c => !c.user.isGM)].map(c => c.id);
      for (const id of order) {
        const c = this.client(id);
        if (c.connected) await c.boot();
      }
    }
    await this.settle();
  }

  #seedClientSettings(client) {
    // Push-to-talk needs the browser's Web Speech API; off for simulated clients.
    const seeds = { speechInputEnabled: false, ...(this._clientSettingSeeds[client.id] ?? {}) };
    client.clientSettings.clear();
    for (const [key, value] of Object.entries(seeds)) {
      client.clientSettings.set(`${MODULE_ID}.${key}`, JSON.stringify(value));
    }
  }

  /**
   * Back to the seeded world between tests, keeping the booted clients (and
   * so their module state: hook registrations, install guards — and anything
   * a test left in a module-level cache).
   */
  async reset({ world = null } = {}) {
    await this.settle();
    this._worldSettings.clear();
    const seed = world?.settings ?? this._seedWorld;
    for (const [key, value] of Object.entries(seed ?? {})) this.world.setSetting(key, value);
    this._serverMessages.clear();
    this.actors._reset();
    this.journal._reset();
    this.folders._reset();
    this.claude.reset();
    this._writeInterceptors.length = 0;
    this._eventSinks.length = 0;
    this.dialogs.length = 0;
    this.socketLog.length = 0;
    this.errors.length = 0;
    for (const spec of this._initialUsers) {
      const u = this.users.get(spec.id);
      if (u) u.active = spec.active !== false;
    }
    for (const c of this.clients) {
      c.connected = c.user.active;
      c.worldCache.clear();
      c.messages._reset();
      c.rendered.clear();
      c.notifications.length = 0;
      c.dialogs.length = 0;
      c.socketEmits.length = 0;
      c._dialogResponder = null;
      for (const off of c._testListeners.splice(0)) off();
      this.#seedClientSettings(c);
    }
  }

  /**
   * listen() on every client: fn(client, ...hookArgs). Removed by reset().
   *
   * @returns {() => void} remove them all now
   */
  listen(hook, fn) {
    const offs = this.clients.map(c => c.listen(hook, (...args) => fn(c, ...args)));
    return () => offs.forEach(off => off());
  }

  /**
   * A test boundary on world writes: fn(write) runs before each one applies.
   * write = { kind: "setting", key, client, value } | { kind: "actor.create",
   * name, client } | { kind: "actor.update", id, name, client, changes } |
   * { kind: "message.create", client, data } | { kind: "message.update", id,
   * client, changes }. Return an Error (or a promise of one) to reject the
   * write; return a promise to hold it. Removed by reset().
   *
   * @returns {() => void} remove it now
   */
  interceptWrites(fn) {
    this._writeInterceptors.push(fn);
    return () => {
      const i = this._writeInterceptors.indexOf(fn);
      if (i >= 0) this._writeInterceptors.splice(i, 1);
    };
  }

  /**
   * fn(event) for every Claude call / reply, write, card, notification, dialog
   * and socket emit, in the order they happen. Removed by reset().
   *
   * @returns {() => void} remove it now
   */
  onEvent(fn) {
    this._eventSinks.push(fn);
    return () => {
      const i = this._eventSinks.indexOf(fn);
      if (i >= 0) this._eventSinks.splice(i, 1);
    };
  }

  _emitEvent(event) {
    for (const fn of this._eventSinks) fn(event);
  }

  /** Run the write interceptors; throws the Error one returns (the write is refused). */
  async _interceptWrite(write) {
    for (const fn of [...this._writeInterceptors]) {
      const out = await fn(write);
      if (out instanceof Error) {
        this._emitEvent({ type: "write", outcome: "rejected", ...write, error: out.message });
        throw out;
      }
    }
  }

  async teardown() {
    if (this._tornDown) return;
    this._tornDown = true;
    for (const c of this.clients) { c.connected = false; c.socketHandlers.clear(); }
    uninstallModuleCacheRouting();
    uninstallGlobalRouting();
  }

  /**
   * A user joins: marked active everywhere, `userConnected` fires on the
   * other clients, then their client boots (a fresh page load).
   */
  async join(userId) {
    const c = this.client(userId);
    c.user.active = true;
    c.connected = true;
    for (const other of this.connectedClients) {
      if (other !== c) other.run(() => other.hooks.call("userConnected", [c.user, true], false));
    }
    await c.boot();
  }

  /** A user leaves: no further deliveries; `userConnected(user, false)` elsewhere. */
  async leave(userId) {
    const c = this.client(userId);
    c.user.active = false;
    c.connected = false;
    for (const other of this.connectedClients) {
      other.run(() => other.hooks.call("userConnected", [c.user, false], false));
    }
    await this.settle();
  }

  /**
   * Fan a document hook out the way Foundry does for a document type the
   * harness does not model (journal entries / pages, items, tokens…):
   * synchronously on `fromUserId`'s client, on a later macrotask on every
   * other connected client — each in its own context. The userId argument
   * Foundry appends is added for you: fireDocumentHook("gm-2",
   * "createJournalEntryPage", page, {}) calls handlers with (page, {}, "gm-2").
   */
  fireDocumentHook(fromUserId, hook, document, options = {}) {
    const from = this.client(fromUserId);
    from.run(() => from.hooks.call(hook, [document, options, from.id], false));
    for (const other of this.connectedClients) {
      if (other !== from) this._deliverLater(other, () => { other.hooks.call(hook, [document, options, from.id], false); }, `${other.id} ${hook}`);
    }
  }

  /** Advertise / clear a Claude key on a client (client setting + keyed-GM registry via the module). */
  async setClaudeKey(userId, key) {
    await this.client(userId).setSetting("claudeApiKey", key ?? "");
    await this.settle();
  }

  /** Route console log / info / debug / warn into bootLog until the returned restore() is called. */
  _bufferConsole(clientId) {
    const levels = ["log", "info", "debug", "warn"];
    const saved = Object.fromEntries(levels.map(l => [l, console[l]]));
    for (const level of levels) {
      console[level] = (...args) => {
        this.bootLog.push({
          client: currentClient()?.id ?? clientId,
          level,
          message: args.map(formatLogArg).join(" "),
        });
      };
    }
    return () => { for (const level of levels) console[level] = saved[level]; };
  }

  // ── async tracking ────────────────────────────────────────────────────────

  _track(promise, label) {
    const entry = Promise.resolve(promise).then(
      () => {},
      (err) => {
        this.errors.push({ label, error: err });
        console.error(`[multiClient] ${label} rejected:`, err);
      },
    ).finally(() => {
      this._pending.delete(entry);
      this._progress += 1;
    });
    this._pending.add(entry);
    return entry;
  }

  _deliverLater(client, fn, label) {
    const task = new Promise((resolve) => {
      realSetImmediate(() => {
        if (!client.connected) { resolve(); return; }
        try {
          resolve(client.run(fn));
        } catch (err) {
          resolve(Promise.reject(err));
        }
      });
    });
    this._track(task, label);
  }

  /**
   * Run until the table is quiet: no delivery queued and nothing settled for
   * a few macrotask turns. Does not wait on handlers blocked on an
   * unanswered dialog or a test-held promise — see drain().
   *
   * @returns {Promise<{ pending: number }>}
   */
  async settle({ quietTurns = 4, maxTurns = 5000 } = {}) {
    let quiet = 0;
    let last = -1;
    for (let turn = 0; turn < maxTurns; turn++) {
      await new Promise(r => realSetImmediate(r));
      // A lazy import() that a client has not loaded yet waits on vitest's
      // module-loader RPC, which can outlast several quiet turns — and is
      // invisible to _track (it hides inside a fire-and-forget .then()).
      // Wait for every in-flight module load, as vitest's own
      // waitForImportsToResolve does for the base cache.
      const loads = this.#moduleLoadsInFlight();
      if (loads.promises.length || loads.resolving) {
        if (loads.promises.length) await Promise.allSettled(loads.promises);
        this._progress += 1;
        continue;
      }
      // Short client timers still to fire (a cleared one is dropped once
      // well past due, so it cannot hold settle() forever).
      const now = Date.now();
      for (const t of this._shortTimers) if (now > t.due + 250) this._shortTimers.delete(t);
      if (this._shortTimers.size) {
        await new Promise(r => realSetTimeout(r, 1));
        quiet = 0;
        continue;
      }
      if (this._progress !== last) { last = this._progress; quiet = 0; continue; }
      quiet += 1;
      if (quiet >= quietTurns) return { pending: this._pending.size };
    }
    throw new Error(`multiClient: settle() — the table kept making progress for ${maxTurns} turns (a loop?)`);
  }

  #moduleLoadsInFlight() {
    const promises = [];
    let resolving = 0;
    for (const client of this.clients) {
      for (const mod of Map.prototype.values.call(client.moduleCache)) {
        if (mod?.promise && !mod.evaluated) promises.push(mod.promise);
        if (mod?.resolving) resolving += 1;
      }
    }
    return { promises, resolving };
  }

  /** Wait for EVERY tracked promise (fails after timeoutMs, naming what is still pending). */
  async drain(timeoutMs = 2000) {
    const start = Date.now();
    while (this._pending.size) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`multiClient: drain() timed out with ${this._pending.size} pending handler(s)`);
      }
      await Promise.race([
        Promise.allSettled([...this._pending]),
        new Promise(r => realSetTimeout(r, 20)),
      ]);
    }
    await this.settle();
  }

  // ── settings ──────────────────────────────────────────────────────────────

  _settingConfig(k) {
    for (const c of this.clients) {
      const cfg = c.settingConfigs.get(k);
      if (cfg) return cfg;
    }
    return null;
  }

  async _setWorldSetting(writer, k, value, options) {
    const json = JSON.stringify(value ?? null);
    const existed = this._worldSettings.has(k);
    if (existed && this._worldSettings.get(k) === json) return;   // Foundry: unchanged → no update
    if (this._writeInterceptors.length) {
      await this._interceptWrite({ kind: "setting", key: k, client: writer.id, value: JSON.parse(json) });
    }
    this._worldSettings.set(k, json);
    this._emitEvent({ type: "write", outcome: "applied", kind: "setting", key: k, client: writer.id });
    const hook = existed ? "updateSetting" : "createSetting";
    const apply = (client) => {
      client.worldCache.delete(k);
      const parsed = client.globals.game.settings.get(...splitKey(k));
      const setting = { id: `setting-${k}`, _id: `setting-${k}`, key: k, value: parsed };
      client.settingConfigs.get(k)?.onChange?.(parsed, options, writer.id);
      client.hooks.call(hook, [setting, { value: json }, options, writer.id], false);
    };
    writer.run(() => apply(writer));
    for (const other of this.connectedClients) {
      if (other !== writer) this._deliverLater(other, () => apply(other), `${other.id} ${hook} ${k}`);
    }
  }

  // ── messages ──────────────────────────────────────────────────────────────

  async _createMessage(creator, data, options) {
    const user = creator.user;
    const named = typeof data.author === "string" ? data.author
      : (data.author?.id ?? (typeof data.user === "string" ? data.user : data.user?.id) ?? null);
    if (named && named !== user.id && !user.isGM && permissionChecksEnforced()) {
      throw permissionError(user, "create", "ChatMessage", "new", "a player may only post as themselves");
    }
    const source = jsonClone({ ...data, author: named ?? user.id }) ?? {};
    delete source.user;
    source._id = typeof data._id === "string" ? data._id : nextDocumentId("smsg");
    source.flags ??= {};
    source.content ??= "";
    source.whisper ??= [];
    source.timestamp ??= Date.now();
    source.type ??= "base";

    const preview = new SimChatMessageReplica(creator, source);
    if (creator.hooks.call("preCreateChatMessage", [preview, data, options, user.id], true) === false) return undefined;

    if (this._writeInterceptors.length) {
      await this._interceptWrite({ kind: "message.create", client: user.id, data: jsonClone(source) });
    }
    this._serverMessages.set(source._id, source);
    this._emitEvent({ type: "write", outcome: "applied", kind: "message.create", id: source._id, client: user.id, flags: Object.keys(source.flags?.[MODULE_ID] ?? {}) });
    const replica = this.#applyCreate(creator, source, options, user.id);
    for (const other of this.connectedClients) {
      if (other !== creator) this._deliverLater(other, () => { this.#applyCreate(other, source, options, user.id); }, `${other.id} createChatMessage`);
    }
    return replica;
  }

  #applyCreate(client, source, options, userId) {
    const replica = new SimChatMessageReplica(client, source);
    client.messages._set(replica.id, replica);
    client.hooks.call("createChatMessage", [replica, options, userId], false);
    return replica;
  }

  async _updateMessage(caller, id, changes, options) {
    if (!this._serverMessages.get(id)) throw new Error(`ChatMessage ${id} does not exist (deleted?)`);
    if (this._writeInterceptors.length) {
      await this._interceptWrite({ kind: "message.update", id, client: caller.user.id, changes: jsonClone(changes) });
    }
    const source = this._serverMessages.get(id);
    if (!source) throw new Error(`ChatMessage ${id} does not exist (deleted?)`);
    applyUpdate(source, jsonClone(changes));
    this._emitEvent({ type: "write", outcome: "applied", kind: "message.update", id, client: caller.user.id, changes: Object.keys(changes ?? {}) });
    const userId = caller.user.id;
    const apply = (client) => {
      const replica = client.messages.get(id);
      if (!replica) return;
      replica._applySource(source);
      client.hooks.call("updateChatMessage", [replica, jsonClone(changes), options, userId], false);
      if (client.rendered.has(id)) client.render(id);
    };
    caller.run(() => apply(caller));
    for (const other of this.connectedClients) {
      if (other !== caller) this._deliverLater(other, () => apply(other), `${other.id} updateChatMessage`);
    }
    return caller.messages.get(id);
  }

  async _deleteMessage(caller, id, options) {
    if (!this._serverMessages.has(id)) return undefined;
    this._serverMessages.delete(id);
    const userId = caller.user.id;
    const apply = (client) => {
      const replica = client.messages.get(id);
      if (!replica) return;
      client.messages.delete(id);
      client.rendered.delete(id);
      client.hooks.call("deleteChatMessage", [replica, options, userId], false);
    };
    const mine = caller.messages.get(id);
    caller.run(() => apply(caller));
    for (const other of this.connectedClients) {
      if (other !== caller) this._deliverLater(other, () => apply(other), `${other.id} deleteChatMessage`);
    }
    return mine;
  }

  // ── socket ────────────────────────────────────────────────────────────────

  _emitSocket(sender, event, args) {
    const payload = jsonClone(args);
    sender.socketEmits.push({ event, payload: payload[0] });
    this.socketLog.push({ from: sender.id, event, payload: payload[0] });
    this._emitEvent({
      type: "socket", client: sender.id, event, kind: payload[0]?.kind ?? null,
      to: sender.connected ? this.connectedClients.filter(c => c !== sender).map(c => c.id) : [],
    });
    if (!sender.connected) return;
    for (const other of this.connectedClients) {
      if (other === sender) continue;
      this._deliverLater(other, () => {
        const handlers = [...(other.socketHandlers.get(event) ?? [])];
        const results = [];
        for (const fn of handlers) {
          try {
            const out = fn(...jsonClone(payload));
            if (out && typeof out.then === "function") results.push(out);
          } catch (err) {
            console.error(`[${other.id}] socket handler for ${event} threw:`, err);
          }
        }
        return Promise.all(results);
      }, `${other.id} socket ${event}`);
    }
  }

  // ── dialogs ───────────────────────────────────────────────────────────────

  _openDialog(api, options) {
    const client = requireClient(api);
    const dialog = new SimDialog(client, api, options);
    this.dialogs.push(dialog);
    client.dialogs.push(dialog);
    this._emitEvent({ type: "dialog", client: client.id, title: dialog.title });
    const responder = client._dialogResponder;
    if (!responder) return Promise.resolve(null);
    return Promise.resolve().then(() => client.run(() => responder(dialog)));
  }

  // ── actors ────────────────────────────────────────────────────────────────

  /**
   * Add a shared actor (tests/setup.js makeTestActor shape). update / setFlag
   * keep makeTestActor's permission check (OWNER or GM, read against the
   * calling client's user) and fire updateActor on every client.
   */
  addActor(data = {}) {
    const actor = globalThis.makeTestActor(data);
    this.#wireActor(actor);
    this.actors._set(actor.id, actor);
    return actor;
  }

  #wireActor(actor) {
    const table = this;
    const rawUpdate = actor.update;
    const rawSetFlag = actor.setFlag;
    actor.testUserPermission = (user, level) => (level === "OWNER" || level === 3 ? userOwnsDocument(user, actor) : true);
    Object.defineProperty(actor, "isOwner", { get: () => userOwnsDocument(currentClient()?.user ?? null, actor), configurable: true });
    // The update's options reach every client's hook, as Foundry's do — a
    // module marks its own writes with one (sharedSupply's mirror writes).
    const broadcast = (changes, options = {}) => {
      const caller = currentClient();
      if (!caller) return;
      const fire = (client) => client.hooks.call("updateActor", [actor, jsonClone(changes), jsonClone(options), caller.id], false);
      caller.run(() => fire(caller));
      for (const other of table.connectedClients) {
        if (other !== caller) table._deliverLater(other, () => fire(other), `${other.id} updateActor`);
      }
    };
    const intercept = async (changes) => {
      if (table._writeInterceptors.length) {
        await table._interceptWrite({ kind: "actor.update", id: actor.id, name: actor.name, client: currentClient()?.id ?? null, changes: jsonClone(changes) });
      }
    };
    const applied = (changes) => table._emitEvent({
      type: "write", outcome: "applied", kind: "actor.update", id: actor.id, name: actor.name,
      client: currentClient()?.id ?? null, changes: Object.keys(changes ?? {}),
    });
    actor.update = async (changes = {}, options = {}) => {
      await intercept(changes);
      await rawUpdate(changes, options);
      applied(changes);
      broadcast(changes, options);
      return actor;
    };
    actor.setFlag = async (scope, key, value) => {
      const changes = { [`flags.${scope}.${key}`]: value };
      await intercept(changes);
      await rawSetFlag(scope, key, value);
      applied(changes);
      broadcast(changes);
      return actor;
    };
  }

  #makeActorClass() {
    const table = this;
    return {
      async create(data = {}) {
        if (table._writeInterceptors.length) {
          await table._interceptWrite({ kind: "actor.create", name: data?.name ?? "Unknown Actor", client: currentClient()?.id ?? null, data: jsonClone(data) });
        }
        const actor = table.addActor({
          id: data?.id ?? data?._id ?? nextDocumentId("sact"),
          name: data?.name ?? "Unknown Actor",
          type: data?.type ?? "character",
          img: data?.img ?? null,
          folder: data?.folder ?? null,
          flags: data?.flags ?? {},
          system: data?.system ?? {},
          ownership: data?.ownership ?? {},
        });
        table._emitEvent({ type: "write", outcome: "applied", kind: "actor.create", id: actor.id, name: actor.name, client: currentClient()?.id ?? null });
        const caller = currentClient();
        if (caller) {
          caller.run(() => caller.hooks.call("createActor", [actor, {}, caller.id], false));
          for (const other of table.connectedClients) {
            if (other !== caller) table._deliverLater(other, () => other.hooks.call("createActor", [actor, {}, caller.id], false), `${other.id} createActor`);
          }
        }
        return actor;
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and (by default) boot a simulated table.
 *
 * @param {Object}   opts
 * @param {Array<{ id: string, name?: string, isGM?: boolean, active?: boolean }>} opts.users
 * @param {boolean}  [opts.boot=true]        import src/index.js on every connected client and fire init / setup / ready
 * @param {string[]} [opts.bootOrder]        client ids in boot order (default: GMs first, then players)
 * @param {{ settings?: Object }} [opts.world] world settings to seed (key → value, module namespace)
 * @param {Object<string, Object>} [opts.clientSettings] per user id: client settings to seed
 * @param {Object<string, string>} [opts.i18n] localization strings (game.i18n.localize / format)
 * @returns {Promise<SimTable>}
 */
export async function simulateTable({ users, boot = true, bootOrder = null, world = {}, clientSettings = {}, i18n = {} } = {}) {
  if (!Array.isArray(users) || users.length === 0) throw new Error("simulateTable: pass at least one user");
  installModuleCacheRouting();   // fail fast, before building clients
  const table = new SimTable(users);
  table.i18n = { ...i18n };
  try {
    await table._start({ boot, world, clientSettings, bootOrder });
  } catch (err) {
    await table.teardown();
    throw err;
  } finally {
    uninstallModuleCacheRouting();   // balance the fail-fast install (_start holds its own)
  }
  return table;
}

/** Canonical cast for tests: lowest-id GM is canonical. */
export const USERS = Object.freeze({
  GM:  Object.freeze({ id: "gm-1", name: "Gina",  isGM: true }),
  GM2: Object.freeze({ id: "gm-2", name: "Gus",   isGM: true }),
  P1:  Object.freeze({ id: "pl-1", name: "Pat",   isGM: false }),
  P2:  Object.freeze({ id: "pl-2", name: "Quinn", isGM: false }),
});
