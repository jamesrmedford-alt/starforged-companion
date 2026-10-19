/**
 * STARFORGED COMPANION
 * tests/helpers/foundryPermissions.js
 *
 * Foundry's document permission rules, enforced by the unit-test stubs
 * (tests/setup.js) and the multi-client harness (tests/helpers/multiClient.js)
 * — issue #282, item 1.
 *
 * The old stubs let every write succeed, so a player-side write that Foundry
 * rejects passed in tests: the player X-Card's world-setting write, a
 * player's click updating a GM-authored chat card (the Burn / Improve
 * double-apply). The rules enforced here:
 *
 *   - a world-scoped `game.settings.set` needs a GM (client- and user-scoped
 *     settings are the user's own);
 *   - `ChatMessage#update` / `#delete` need a GM or the message's author;
 *   - `Actor#update` (and setFlag / unsetFlag) needs a GM or OWNER permission
 *     (`ownership[userId]` or `ownership.default` ≥ 3).
 *
 * A refused write rejects with Foundry's wording ("User X lacks permission to
 * update Setting [key]"), so a test that silently relied on it fails loudly.
 *
 * Every rule reads the CURRENT `game.user` at call time — under the
 * multi-client harness that is the user of whichever simulated client is
 * running, so the same stubs give per-client answers.
 *
 * Opt-out, for the few tests that need raw access (seeding fixtures through
 * the API as a player, exercising a stub itself):
 *   withoutPermissionChecks(fn)  — run fn (sync or async) with checks off;
 *   disablePermissionChecks()    — checks off for the rest of the test
 *                                  (re-enabled before every test).
 * Prefer seeding through `game.settings._store` / fixture fields instead.
 */

export const OWNER_LEVEL = 3;

let _testDisabled = false;   // disablePermissionChecks() — reset per test
let _scopeDepth   = 0;       // nesting depth of withoutPermissionChecks()

/** @returns {boolean} true while the permission rules are enforced. */
export function permissionChecksEnforced() {
  return !_testDisabled && _scopeDepth === 0;
}

/** Turn the rules off for the rest of the current test. */
export function disablePermissionChecks() {
  _testDisabled = true;
}

/** Re-enable the rules (tests/setup.js calls this before every test). */
export function resetPermissionChecks() {
  _testDisabled = false;
  _scopeDepth   = 0;
}

/**
 * Run `fn` with the rules off. Async functions keep them off until they
 * settle — for every caller, since the checks are global — so keep the scope
 * to fixture setup, not to the behaviour under test.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withoutPermissionChecks(fn) {
  _scopeDepth += 1;
  let out;
  try {
    out = fn();
  } catch (err) {
    _scopeDepth -= 1;
    throw err;
  }
  if (out && typeof out.then === "function") {
    return out.finally(() => { _scopeDepth -= 1; });
  }
  _scopeDepth -= 1;
  return out;
}

function currentUser() {
  return globalThis.game?.user ?? null;
}

function userLabel(user) {
  return user?.name ?? user?.id ?? "(no user)";
}

/**
 * Foundry's wording for a refused document write, plus a pointer back here.
 *
 * @returns {Error}
 */
export function permissionError(user, action, documentName, id, why) {
  return new Error(
    `User ${userLabel(user)} lacks permission to ${action} ${documentName} [${id}] — ${why} ` +
    `(permission-faithful test stub, tests/helpers/foundryPermissions.js)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Throw when the current user may not write this setting. `scope` is the
 * registered scope, or null when the setting is not registered anywhere —
 * Foundry refuses those for everyone; the stub only for players, since
 * plenty of GM-side tests write ad-hoc keys.
 *
 * @param {string} namespace
 * @param {string} key
 * @param {"world"|"client"|"user"|null} scope
 */
export function assertCanSetSetting(namespace, key, scope) {
  if (!permissionChecksEnforced()) return;
  const user = currentUser();
  if (user?.isGM) return;
  if (scope === "client" || scope === "user") return;
  if (scope === "world") {
    throw permissionError(user, "update", "Setting", `${namespace}.${key}`,
      "world-scoped settings are GM-write only");
  }
  throw new Error(
    `"${namespace}.${key}" is not a registered game setting, so the permission-faithful stub cannot ` +
    `tell whether ${userLabel(user)} may write it. Register it in the test (game.settings.register) ` +
    `or seed it through game.settings._store.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatMessage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Foundry's ChatMessage update / delete rule: a GM, or the message's author.
 *
 * @param {Object|null} user
 * @param {string|null} authorId
 * @returns {boolean}
 */
export function userCanModifyMessage(user, authorId) {
  if (user?.isGM) return true;
  return !!user?.id && user.id === authorId;
}

/**
 * @param {string} action   "update" | "delete"
 * @param {{ id?: string, _source?: { author?: string } }} message
 */
export function assertCanModifyMessage(action, message) {
  if (!permissionChecksEnforced()) return;
  const user = currentUser();
  const authorId = message?._source?.author ?? null;
  if (userCanModifyMessage(user, authorId)) return;
  throw permissionError(user, action, "ChatMessage", message?.id ?? "?",
    `only a GM or the message's author (${authorId ?? "unknown"}) may ${action} it`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Actor ownership
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Foundry's OWNER test: GMs own everything; otherwise the user's own level
 * or the document's default level must be OWNER.
 *
 * @param {Object|null} user
 * @param {{ ownership?: Object }} doc
 * @returns {boolean}
 */
export function userOwnsDocument(user, doc) {
  if (user?.isGM) return true;
  const ownership = doc?.ownership ?? {};
  const level = Math.max(Number(ownership[user?.id] ?? 0), Number(ownership.default ?? 0));
  return level >= OWNER_LEVEL;
}

/**
 * @param {string} action  e.g. "update"
 * @param {{ id?: string, name?: string, ownership?: Object }} actor
 */
export function assertCanUpdateActor(action, actor) {
  if (!permissionChecksEnforced()) return;
  const user = currentUser();
  if (userOwnsDocument(user, actor)) return;
  throw permissionError(user, action, "Actor", actor?.id ?? "?",
    `needs OWNER permission on "${actor?.name ?? actor?.id}" (ownership ${JSON.stringify(actor?.ownership ?? {})})`);
}
