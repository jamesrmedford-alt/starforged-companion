/**
 * STARFORGED COMPANION
 * tests/helpers/liveDocuments.js — embedded Items, journals and actor deletion
 * as live documents on a simulated table
 *
 * Issue #302 slice C, step 1. tests/helpers/multiClient.js models chat
 * messages, world settings and actor updates the way Foundry delivers them;
 * it does not model the documents a vow, a bond or a Chronicle lives in. The
 * global `Item.create` stub (tests/setup.js) returns an object with no
 * `update`, `setFlag` or `delete`, and no Item or journal hook ever fires —
 * so on a table a vow the module creates can never be marked, a bond Item's
 * mirror write throws into its own catch, the shared-vow sync never runs, and
 * every test that needs one hand-builds a stand-in. A generated sequence
 * cannot hand-build: it has to create, rename, mark and delete documents
 * through the calls the module makes.
 *
 *   const table = withLiveDocuments(await simulateTable({ users: [GM, P1] }));
 *   const kira  = table.addActor({ id: 'pc-kira', ownership: { 'pl-1': 3 } });
 *   const vow   = await table.client('pl-1').run(() =>
 *     Item.create({ name: 'Find Kade', type: 'progress', system: { subtype: 'vow', rank: 'dangerous' } }, { parent: kira }));
 *   await table.settle();                        // createItem fired on every client
 *   await table.client('pl-1').run(() => vow.update({ 'system.current': 8 }));
 *
 * Opt-in. A table that is not wrapped behaves exactly as before, and a
 * wrapped table changes nothing for code that runs outside its clients.
 *
 * What a wrapped table models
 * ---------------------------
 *   Items (embedded on an Actor)
 *     - `Item.create(data, { parent })`, `actor.createEmbeddedDocuments("Item",
 *       [...])`, `item.update`, `item.setFlag` / `unsetFlag`, `item.delete`,
 *       `actor.updateEmbeddedDocuments` / `deleteEmbeddedDocuments`.
 *     - `actor.items` is a collection (get, getName, find, filter, map, some,
 *       every, forEach, reduce, has, contents, size, iteration). `find` returns
 *       undefined when nothing matches and `contents` is a fresh array each
 *       read, as Foundry's Collection does.
 *     - Needs OWNER on the parent actor (or a GM).
 *   Journals
 *     - `JournalEntry.create(data)` (with `pages`), `journal.update`, flags,
 *       `journal.delete`, `journal.createEmbeddedDocuments("JournalEntryPage",
 *       [...])`, `page.update`, flags, `page.delete`. Entries live in
 *       `game.journal` (the table's collection).
 *     - Creating one needs a GM: a player-role user has no JOURNAL_CREATE in a
 *       default world. Changing one needs OWNER on the entry (or a GM).
 *   Actors
 *     - `actor.delete()` (OWNER or GM): gone from `game.actors`, with its
 *       Items, and `deleteActor` on every client.
 *
 * Foundry semantics reproduced, for every document above
 *   - create / update / delete hooks fire on EVERY connected client:
 *     synchronously on the client that made the change, on a later macrotask
 *     on the others — `(document, options, userId)`, and for an update
 *     `(document, change, options, userId)` with the change expanded.
 *   - `preUpdate*` runs on the requesting client only; returning false cancels.
 *   - An update that changes nothing is not sent: no write, no hook. A module
 *     that mirrors one copy to another relies on this to stop.
 *   - Documents created inside their parent's creation (an entry's `pages`,
 *     an actor seeded with items) fire no hook of their own, and neither do
 *     the Items of a deleted actor.
 *   - The update's options reach every client's hook — a module marks its own
 *     writes with one.
 *   - A write from a page `table.reload` replaced is refused.
 *
 * Fault boundaries: `table.interceptWrites` sees these writes too, with kind
 * "item.create" | "item.update" | "item.delete" | "actor.delete" |
 * "journal.create" | "journal.update" | "journal.delete" | "page.create" |
 * "page.update" | "page.delete"; `table.onEvent` reports them applied or
 * rejected (tests/helpers/faults.js `traceTable` prints them).
 *
 * Seeding (no hooks, no permission check — the world as it was before play)
 *   - `table.addActor({ items: [data, …] })` or `{ items: { contents: [...] } }`
 *   - `table.addItem(actorOrId, data)`
 *   - `table.addJournal(data)`
 *
 * Limits
 *   - One live table at a time owns the `Item` / `JournalEntry` globals; a
 *     call made outside any client of a live table falls through to the
 *     tests/setup.js stubs.
 *   - A call made from the test body (no client) applies with no hook and no
 *     permission check, as the harness's actor updates do. Act through
 *     `client.run`.
 *   - The vendor system's own Item behaviour (its chat alerts, its DataModel
 *     defaults and validation) is not modelled: an Item holds what it was
 *     given.
 */

import { currentClient } from "./multiClient.js";
import { expandUpdate, mergeInto, nextDocumentId } from "./documentStubs.js";
import { permissionChecksEnforced, permissionError, userOwnsDocument } from "./foundryPermissions.js";

const LIVE = Symbol.for("liveDocuments.table");
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const jsonClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ─────────────────────────────────────────────────────────────────────────────
// Collection — the part of Foundry's Collection the module reads
// ─────────────────────────────────────────────────────────────────────────────

export class LiveCollection {
  #docs = [];
  get contents() { return [...this.#docs]; }
  get size() { return this.#docs.length; }
  get(id) { return this.#docs.find(d => d.id === id); }
  getName(name) { return this.#docs.find(d => d.name === name); }
  has(id) { return this.#docs.some(d => d.id === id); }
  find(fn) { return this.#docs.find(fn); }
  filter(fn) { return this.#docs.filter(fn); }
  map(fn) { return this.#docs.map(fn); }
  some(fn) { return this.#docs.some(fn); }
  every(fn) { return this.#docs.every(fn); }
  forEach(fn) { this.#docs.forEach(fn); }
  reduce(fn, init) { return this.#docs.reduce(fn, init); }
  values() { return this.#docs[Symbol.iterator](); }
  keys() { return this.#docs.map(d => d.id)[Symbol.iterator](); }
  entries() { return this.#docs.map(d => [d.id, d])[Symbol.iterator](); }
  [Symbol.iterator]() { return this.#docs[Symbol.iterator](); }
  /** @internal */ _add(doc) { this.#docs.push(doc); }
  /** @internal */ _remove(doc) { const i = this.#docs.indexOf(doc); if (i >= 0) this.#docs.splice(i, 1); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared document behaviour
// ─────────────────────────────────────────────────────────────────────────────

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
}

/** What `update` would change in `original` — Foundry sends only this, and nothing when it is empty. */
export function diffUpdate(original, update) {
  const out = {};
  for (const [key, value] of Object.entries(update ?? {})) {
    if (key.startsWith("-=")) {
      if (isPlainObject(original) && key.slice(2) in original) out[key] = value;
      continue;
    }
    const current = original?.[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      const inner = diffUpdate(current, value);
      if (Object.keys(inner).length) out[key] = inner;
    } else if (!deepEqual(current, value)) {
      out[key] = value;
    }
  }
  return out;
}

const flatKeys = (obj, prefix = "") => Object.entries(obj ?? {}).flatMap(([k, v]) =>
  isPlainObject(v) && Object.keys(v).length ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

function refuseFromUnloadedPage(client, what) {
  if (client?.unloaded) throw new Error(`liveDocuments: ${what} from ${client.id}'s unloaded page — refused (the page was reloaded)`);
}

function assertOwner(client, action, documentName, doc, owned, why) {
  if (!client || !permissionChecksEnforced()) return;
  if (userOwnsDocument(client.user, owned)) return;
  throw permissionError(client.user, action, documentName, doc?.id ?? "?", why);
}

function fire(table, hook, args) {
  const caller = currentClient();
  if (!caller) return;
  const withUser = [...args, caller.id];
  caller.run(() => caller.hooks.call(hook, withUser, false));
  for (const other of table.connectedClients) {
    if (other !== caller) table._deliverLater(other, () => { other.hooks.call(hook, withUser, false); }, `${other.id} ${hook}`);
  }
}

async function intercept(table, write) {
  if (table._writeInterceptors.length) await table._interceptWrite({ client: currentClient()?.id ?? null, ...write });
}

const applied = (table, write) => table._emitEvent({ type: "write", outcome: "applied", client: currentClient()?.id ?? null, ...write });

/** getFlag / setFlag / unsetFlag over `doc.flags`, written through `doc.update`. */
function flagMethods(doc) {
  doc.getFlag = (scope, key) => {
    let cur = doc.flags?.[scope];
    for (const part of String(key).split(".")) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[part];
    }
    return cur;
  };
  doc.setFlag = (scope, key, value) => doc.update({ [`flags.${scope}.${key}`]: value });
  doc.unsetFlag = (scope, key) => {
    const parts = String(key).split(".");
    const leaf = parts.pop();
    return doc.update({ [[`flags.${scope}`, ...parts].join(".") + `.-=${leaf}`]: null });
  };
}

/**
 * The update every live document shares: permission, the diff, preUpdate on
 * the caller, the fault boundary, the write, the hook on every client.
 */
async function updateDocument(table, doc, { documentName, kind, owned, why, extra = {} }, changes, options) {
  const caller = currentClient();
  refuseFromUnloadedPage(caller, `${documentName} ${doc.id} update`);
  assertOwner(caller, "update", documentName, doc, owned(), why());
  const diff = diffUpdate(doc, expandUpdate(jsonClone(changes ?? {})));
  if (!Object.keys(diff).length) return doc;
  if (caller) {
    const go = caller.run(() => caller.hooks.call(`preUpdate${documentName}`, [doc, jsonClone(diff), options, caller.id], true));
    if (go === false) return undefined;
  }
  await intercept(table, { kind, id: doc.id, name: doc.name, changes: jsonClone(changes), ...extra });
  mergeInto(doc, jsonClone(diff));
  applied(table, { kind, id: doc.id, name: doc.name, changes: flatKeys(diff), ...extra });
  fire(table, `update${documentName}`, [doc, diff, jsonClone(options)]);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

const actorOwnerWhy = (actor) => () =>
  `needs OWNER permission on "${actor?.name ?? actor?.id}" (ownership ${JSON.stringify(actor?.ownership ?? {})})`;

function makeItem(table, actor, data = {}) {
  const item = {
    id:     data.id ?? data._id ?? nextDocumentId("sitm"),
    name:   data.name ?? "Unknown Item",
    type:   data.type ?? "progress",
    img:    data.img ?? null,
    system: jsonClone(data.system ?? {}),
    flags:  jsonClone(data.flags ?? {}),
    documentName: "Item",
    isEmbedded: true,
  };
  Object.defineProperties(item, {
    _id:    { get: () => item.id },
    parent: { get: () => actor, enumerable: false },
    actor:  { get: () => actor, enumerable: false },
    uuid:   { get: () => `Actor.${actor.id}.Item.${item.id}` },
    isOwner: { get: () => userOwnsDocument(currentClient()?.user ?? null, actor) },
  });
  const spec = { documentName: "Item", kind: "item.update", owned: () => actor, why: actorOwnerWhy(actor), extra: { actorId: actor.id } };
  item.update = (changes = {}, options = {}) => updateDocument(table, item, spec, changes, options);
  flagMethods(item);
  item.delete = (options = {}) => deleteItem(table, item, options);
  item.toObject = () => ({ _id: item.id, name: item.name, type: item.type, img: item.img, system: jsonClone(item.system), flags: jsonClone(item.flags) });
  item.testUserPermission = (user, level) => (level === "OWNER" || level === 3 ? userOwnsDocument(user, actor) : true);
  return item;
}

async function createItem(table, actor, data, options = {}) {
  const caller = currentClient();
  refuseFromUnloadedPage(caller, `Item create on ${actor.id}`);
  assertOwner(caller, "create", "Item", { id: `in ${actor.id}` }, actor, actorOwnerWhy(actor)());
  await intercept(table, { kind: "item.create", actorId: actor.id, name: data?.name ?? "Unknown Item", data: jsonClone(data) });
  const item = makeItem(table, actor, data);
  item.__createOptions = { ...options, parent: undefined };
  actor.items._add(item);
  applied(table, { kind: "item.create", id: item.id, actorId: actor.id, name: item.name });
  fire(table, "createItem", [item, jsonClone({ ...options, parent: undefined })]);
  return item;
}

async function deleteItem(table, item, options = {}) {
  const caller = currentClient();
  const actor = item.parent;
  refuseFromUnloadedPage(caller, `Item ${item.id} delete`);
  assertOwner(caller, "delete", "Item", item, actor, actorOwnerWhy(actor)());
  if (!actor.items.has(item.id)) return item;   // already gone: a second delete finds nothing to delete
  await intercept(table, { kind: "item.delete", id: item.id, actorId: actor.id, name: item.name });
  actor.items._remove(item);
  applied(table, { kind: "item.delete", id: item.id, actorId: actor.id, name: item.name });
  fire(table, "deleteItem", [item, jsonClone(options)]);
  return item;
}

function seedItems(overrideItems) {
  if (Array.isArray(overrideItems)) return overrideItems;
  if (Array.isArray(overrideItems?.contents)) return overrideItems.contents;
  return [];
}

function wireActor(table, actor, seed) {
  if (actor[LIVE]) return actor;
  Object.defineProperty(actor, LIVE, { value: true });
  const items = new LiveCollection();
  actor.items = items;
  for (const data of seed) items._add(makeItem(table, actor, data));

  const only = (type) => {
    if (type !== "Item") throw new Error(`liveDocuments: actor.*EmbeddedDocuments("${type}") is not modelled (only "Item")`);
  };
  actor.createEmbeddedDocuments = async (type, list = [], options = {}) => {
    only(type);
    const out = [];
    for (const data of list) out.push(await createItem(table, actor, data, options));
    return out;
  };
  actor.updateEmbeddedDocuments = async (type, updates = [], options = {}) => {
    only(type);
    const out = [];
    for (const { _id, id, ...changes } of updates) {
      const item = items.get(_id ?? id);
      if (!item) throw new Error(`liveDocuments: Item "${_id ?? id}" does not exist on Actor ${actor.id}`);
      out.push(await item.update(changes, options));
    }
    return out;
  };
  actor.deleteEmbeddedDocuments = async (type, ids = [], options = {}) => {
    only(type);
    const out = [];
    for (const id of ids) {
      const item = items.get(id);
      if (!item) throw new Error(`liveDocuments: Item "${id}" does not exist on Actor ${actor.id}`);
      out.push(await item.delete(options));
    }
    return out;
  };
  actor.delete = async (options = {}) => {
    const caller = currentClient();
    refuseFromUnloadedPage(caller, `Actor ${actor.id} delete`);
    assertOwner(caller, "delete", "Actor", actor, actor, actorOwnerWhy(actor)());
    if (table.actors.get(actor.id) !== actor) return actor;
    await intercept(table, { kind: "actor.delete", id: actor.id, name: actor.name });
    table.actors.delete(actor.id);
    applied(table, { kind: "actor.delete", id: actor.id, name: actor.name });
    fire(table, "deleteActor", [actor, jsonClone(options)]);
    return actor;
  };
  return actor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Journals
// ─────────────────────────────────────────────────────────────────────────────

const journalOwnerWhy = (journal) => () =>
  `needs OWNER permission on journal "${journal?.name ?? journal?.id}" (ownership ${JSON.stringify(journal?.ownership ?? {})})`;

function makePage(table, journal, data = {}) {
  const page = {
    id:    data.id ?? data._id ?? nextDocumentId("spag"),
    name:  data.name ?? "Unknown Page",
    type:  data.type ?? "text",
    title: jsonClone(data.title ?? { show: true, level: 1 }),
    text:  { content: "", format: 1, ...jsonClone(data.text ?? {}) },
    sort:  data.sort ?? 0,
    flags: jsonClone(data.flags ?? {}),
    documentName: "JournalEntryPage",
    isEmbedded: true,
  };
  Object.defineProperties(page, {
    _id:    { get: () => page.id },
    parent: { get: () => journal, enumerable: false },
    uuid:   { get: () => `JournalEntry.${journal.id}.JournalEntryPage.${page.id}` },
  });
  const spec = { documentName: "JournalEntryPage", kind: "page.update", owned: () => journal, why: journalOwnerWhy(journal), extra: { journalId: journal.id } };
  page.update = (changes = {}, options = {}) => updateDocument(table, page, spec, changes, options);
  flagMethods(page);
  page.delete = async (options = {}) => {
    const caller = currentClient();
    refuseFromUnloadedPage(caller, `JournalEntryPage ${page.id} delete`);
    assertOwner(caller, "delete", "JournalEntryPage", page, journal, journalOwnerWhy(journal)());
    if (!journal.pages.has(page.id)) return page;
    await intercept(table, { kind: "page.delete", id: page.id, journalId: journal.id, name: page.name });
    journal.pages._remove(page);
    applied(table, { kind: "page.delete", id: page.id, journalId: journal.id, name: page.name });
    fire(table, "deleteJournalEntryPage", [page, jsonClone(options)]);
    return page;
  };
  return page;
}

function makeJournal(table, data = {}) {
  const journal = {
    id:        data.id ?? data._id ?? nextDocumentId("sjnl"),
    name:      data.name ?? "Unknown Journal",
    folder:    data.folder ?? null,
    flags:     jsonClone(data.flags ?? {}),
    ownership: { default: 0, ...jsonClone(data.ownership ?? {}) },
    documentName: "JournalEntry",
    pages:     new LiveCollection(),
    sheet:     { render() {}, close() {} },
  };
  Object.defineProperties(journal, {
    _id:     { get: () => journal.id },
    uuid:    { get: () => `JournalEntry.${journal.id}` },
    isOwner: { get: () => userOwnsDocument(currentClient()?.user ?? null, journal) },
  });
  for (const pageData of data.pages ?? []) journal.pages._add(makePage(table, journal, pageData));
  const spec = { documentName: "JournalEntry", kind: "journal.update", owned: () => journal, why: journalOwnerWhy(journal) };
  journal.update = (changes = {}, options = {}) => updateDocument(table, journal, spec, changes, options);
  flagMethods(journal);
  journal.testUserPermission = (user, level) => (level === "OWNER" || level === 3 ? userOwnsDocument(user, journal) : true);
  journal.delete = async (options = {}) => {
    const caller = currentClient();
    refuseFromUnloadedPage(caller, `JournalEntry ${journal.id} delete`);
    assertOwner(caller, "delete", "JournalEntry", journal, journal, journalOwnerWhy(journal)());
    if (table.journal.get(journal.id) !== journal) return journal;
    await intercept(table, { kind: "journal.delete", id: journal.id, name: journal.name });
    table.journal.delete(journal.id);
    applied(table, { kind: "journal.delete", id: journal.id, name: journal.name });
    fire(table, "deleteJournalEntry", [journal, jsonClone(options)]);
    return journal;
  };
  const only = (type) => {
    if (type !== "JournalEntryPage") throw new Error(`liveDocuments: journal.*EmbeddedDocuments("${type}") is not modelled (only "JournalEntryPage")`);
  };
  journal.createEmbeddedDocuments = async (type, list = [], options = {}) => {
    only(type);
    const caller = currentClient();
    refuseFromUnloadedPage(caller, `JournalEntryPage create in ${journal.id}`);
    assertOwner(caller, "create", "JournalEntryPage", { id: `in ${journal.id}` }, journal, journalOwnerWhy(journal)());
    const out = [];
    for (const data of list) {
      await intercept(table, { kind: "page.create", journalId: journal.id, name: data?.name ?? "Unknown Page", data: jsonClone(data) });
      const page = makePage(table, journal, data);
      journal.pages._add(page);
      applied(table, { kind: "page.create", id: page.id, journalId: journal.id, name: page.name });
      fire(table, "createJournalEntryPage", [page, jsonClone(options)]);
      out.push(page);
    }
    return out;
  };
  journal.updateEmbeddedDocuments = async (type, updates = [], options = {}) => {
    only(type);
    const out = [];
    for (const { _id, id, ...changes } of updates) {
      const page = journal.pages.get(_id ?? id);
      if (!page) throw new Error(`liveDocuments: JournalEntryPage "${_id ?? id}" does not exist in JournalEntry ${journal.id}`);
      out.push(await page.update(changes, options));
    }
    return out;
  };
  journal.deleteEmbeddedDocuments = async (type, ids = [], options = {}) => {
    only(type);
    const out = [];
    for (const id of ids) {
      const page = journal.pages.get(id);
      if (!page) throw new Error(`liveDocuments: JournalEntryPage "${id}" does not exist in JournalEntry ${journal.id}`);
      out.push(await page.delete(options));
    }
    return out;
  };
  return journal;
}

async function createJournal(table, data, options = {}) {
  const caller = currentClient();
  refuseFromUnloadedPage(caller, "JournalEntry create");
  if (caller && permissionChecksEnforced() && !caller.user.isGM) {
    throw permissionError(caller.user, "create", "JournalEntry", data?.name ?? "?",
      "a player-role user has no JOURNAL_CREATE permission in a default world");
  }
  await intercept(table, { kind: "journal.create", name: data?.name ?? "Unknown Journal", data: jsonClone(data) });
  const journal = makeJournal(table, data);
  table.journal._set(journal.id, journal);
  applied(table, { kind: "journal.create", id: journal.id, name: journal.name });
  fire(table, "createJournalEntry", [journal, jsonClone(options)]);
  return journal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

let _live = null;   // { table, Item, JournalEntry } — the table that owns the globals, and what they were

const liveTableOf = (client) => (client?.table?.[LIVE] ? client.table : null);

function installGlobals(table) {
  if (_live) throw new Error("liveDocuments: another live table is still up — tear it down first (one at a time owns Item / JournalEntry)");
  const base = { Item: globalThis.Item, JournalEntry: globalThis.JournalEntry };
  _live = { table, ...base };
  globalThis.Item = {
    ...base.Item,
    async create(data, options = {}) {
      const live = liveTableOf(currentClient());
      const parent = options?.parent ?? null;
      if (!live || !parent?.[LIVE]) return base.Item.create(data, options);
      return createItem(live, parent, data ?? {}, options);
    },
  };
  globalThis.JournalEntry = {
    ...base.JournalEntry,
    async create(data, options = {}) {
      const live = liveTableOf(currentClient());
      if (!live) return base.JournalEntry.create(data, options);
      return createJournal(live, data ?? {}, options);
    },
  };
}

function uninstallGlobals(table) {
  if (_live?.table !== table) return;
  globalThis.Item = _live.Item;
  globalThis.JournalEntry = _live.JournalEntry;
  _live = null;
}

/**
 * Make `table`'s Items, journals and actor deletion live documents.
 *
 * @param {Object} table  a table from simulateTable()
 * @returns {Object} the same table, with `addItem` and `addJournal`
 */
export function withLiveDocuments(table) {
  if (table[LIVE]) return table;
  Object.defineProperty(table, LIVE, { value: true });
  installGlobals(table);

  const rawAddActor = table.addActor.bind(table);
  table.addActor = (data = {}) => {
    const { items, ...rest } = data;
    return wireActor(table, rawAddActor(rest), seedItems(items));
  };
  for (const actor of table.actors.contents) wireActor(table, actor, actor.items?.contents ?? []);

  /** Seed an Item on an actor: no hook, no permission check. */
  table.addItem = (actorOrId, data = {}) => {
    const actor = typeof actorOrId === "string" ? table.actors.get(actorOrId) : actorOrId;
    if (!actor?.[LIVE]) throw new Error(`liveDocuments: addItem needs an actor of this table (got ${actorOrId?.id ?? actorOrId})`);
    const item = makeItem(table, actor, data);
    actor.items._add(item);
    return item;
  };
  /** Seed a journal entry (with `pages`): no hook, no permission check. */
  table.addJournal = (data = {}) => {
    const journal = makeJournal(table, data);
    table.journal._set(journal.id, journal);
    return journal;
  };

  const rawTeardown = table.teardown.bind(table);
  table.teardown = async () => {
    uninstallGlobals(table);
    return rawTeardown();
  };
  return table;
}
