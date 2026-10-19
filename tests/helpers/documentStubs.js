/**
 * STARFORGED COMPANION
 * tests/helpers/documentStubs.js
 *
 * Shared pieces of the Foundry document stubs: Foundry-style update merging
 * (dot-notation keys, nested objects, `-=key` deletions) and the
 * permission-faithful ChatMessage document that `ChatMessage.create` returns
 * in tests/setup.js. The multi-client harness (tests/helpers/multiClient.js)
 * builds its per-client message replicas on the same merge.
 */

import { assertCanModifyMessage } from "./foundryPermissions.js";

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Document ids come from a counter, never Math.random: tests that script dice
// with vi.spyOn(Math, "random") must not have a card creation consume a value
// (or be counted as a roll). 16 characters, like Foundry's ids.
let _idCounter = 0;
export function nextDocumentId(prefix = "tdoc") {
  _idCounter += 1;
  return `${prefix}${String(_idCounter).padStart(16 - prefix.length, "0")}`;
}

/**
 * `{ "flags.mod.burn.consumed": true }` → `{ flags: { mod: { burn: { consumed: true } } } }`.
 * Keys without dots are kept; nested objects are expanded recursively.
 *
 * @param {Object} changes
 * @returns {Object}
 */
export function expandUpdate(changes) {
  const out = {};
  for (const [path, value] of Object.entries(changes ?? {})) {
    const parts = path.split(".");
    let target = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isPlainObject(target[parts[i]])) target[parts[i]] = {};
      target = target[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    const expanded = isPlainObject(value) ? expandUpdate(value) : value;
    if (isPlainObject(expanded) && isPlainObject(target[leaf])) {
      mergeInto(target[leaf], expanded);
    } else {
      target[leaf] = expanded;
    }
  }
  return out;
}

/**
 * Merge an expanded update into `target` the way Foundry's document update
 * does: objects merge key by key, arrays and primitives replace, and a
 * `-=key` entry deletes `key`.
 *
 * @param {Object} target   mutated in place
 * @param {Object} update   already expanded (see expandUpdate)
 * @returns {Object} target
 */
export function mergeInto(target, update) {
  for (const [key, value] of Object.entries(update ?? {})) {
    if (key.startsWith("-=")) {
      delete target[key.slice(2)];
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value);
    } else if (isPlainObject(value)) {
      target[key] = mergeInto({}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** Apply a Foundry-style update (dot-notation or nested) to `target`. */
export function applyUpdate(target, changes) {
  return mergeInto(target, expandUpdate(changes));
}

/** Read a dotted path from an object (foundry.utils.getProperty). */
export function getProperty(obj, path) {
  let cur = obj;
  for (const part of String(path).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Turn the data passed to `ChatMessage.create` into a permission-faithful
 * ChatMessage document, IN PLACE: the object keeps every data field (so tests
 * that read `ChatMessage._created[n].content` / `.flags` are unaffected) and
 * gains non-enumerable `id`, `_id`, `_source.author` and the document methods
 * `update`, `delete`, `getFlag`, `setFlag`, `unsetFlag`. `update` and `delete`
 * refuse a user who is neither a GM nor the author (foundryPermissions.js).
 *
 * The author is the id in `data.author` / `data.user` (a string or a User),
 * else the creating user.
 *
 * @param {Object} data
 * @param {{ authorId?: string|null, onDelete?: (doc: Object) => void }} [opts]
 * @returns {Object} the same object, now a document
 */
export function makeChatMessageDoc(data, { authorId = null, onDelete = null } = {}) {
  const doc = data ?? {};
  const id = doc.id ?? doc._id ?? nextDocumentId("tmsg");
  const author = authorId
    ?? (typeof doc.author === "string" ? doc.author : doc.author?.id)
    ?? (typeof doc.user === "string" ? doc.user : doc.user?.id)
    ?? globalThis.game?.user?.id
    ?? null;

  const hidden = (value) => ({ value, enumerable: false, writable: true, configurable: true });
  const props = {
    id:      hidden(id),
    _id:     hidden(id),
    _source: hidden({ author }),
    update:  hidden(async (changes = {}) => {
      assertCanModifyMessage("update", doc);
      applyUpdate(doc, changes);
      return doc;
    }),
    delete:  hidden(async () => {
      assertCanModifyMessage("delete", doc);
      Object.defineProperty(doc, "_deleted", hidden(true));
      onDelete?.(doc);
      return doc;
    }),
    getFlag: hidden((scope, key) => getProperty(doc.flags?.[scope], key)),
    setFlag: hidden((scope, key, value) => doc.update({ [`flags.${scope}.${key}`]: value })),
    unsetFlag: hidden((scope, key) => {
      const parts = String(key).split(".");
      const leaf = parts.pop();
      const prefix = [`flags.${scope}`, ...parts].join(".");
      return doc.update({ [`${prefix}.-=${leaf}`]: null });
    }),
  };
  if (!("author" in doc)) {
    props.author = hidden(globalThis.game?.users?.get?.(author) ?? (author ? { id: author } : null));
  }
  Object.defineProperties(doc, props);
  return doc;
}
