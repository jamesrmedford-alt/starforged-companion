// src/multiplayer/connectionWatch.js
//
// How many times this client's connection to the server has dropped since its
// page loaded (issue #347 AB19). A world write that lands while a client's
// socket is down never reaches that client's cached settings: Foundry replays
// nothing on a reconnect, and reloads the page only after a long drop. So a
// GM narrating a move whose connection drops for a moment, while a player
// plays the X-Card and the other GM records the pause, came back on the same
// page with a cache that never saw it: its narration's X-Card check read "not
// active" and posted, and its sidecar persist wrote the pause away for the
// table. A narration that started before a drop cannot trust what its client
// holds of the X-Card — narrator.js watchXCard discards it.
//
// A page whose connection dropped is stale until it reloads (issue #347
// AB19-STALE-CACHE-WRITES): the move it was resolving still saved its record
// and freed the lock from that cache, which could undo a pause it missed — and
// any other change it missed. So a GM's stale page stands down: it is never
// the canonical GM (gmGate.js), answers no page-ready question (gmRelay.js),
// and writes no campaignState (campaignStateChain.js refuses it); when its
// connection comes back it tells the table it is stale, so the other clients
// pass it over too, and asks its GM to reload, with a persistent notice and a
// Reload button. Another GM runs the table meanwhile; with none, the table
// waits for the reload.
//
// `disconnect` and `connect` are the socket.io client's own events
// (`game.socket` is its Socket): `disconnect` fires on every drop, `connect`
// on the reconnect after it.

const MODULE_ID = "starforged-companion";

let _drops = 0;
let _registered = false;
let _stale = false;
let _toldStale = false;

// What else must hear a GM page go stale (gmRelay.js announces it to the
// table) — registered by the module that owns the socket, so this file
// imports nothing.
const _staleListeners = new Set();

/** Times this client's connection to the server dropped since its page loaded. */
export function connectionDrops() { return _drops; }

/**
 * Whether this page's connection to the server has dropped since it loaded:
 * its cached world settings may lack writes made meanwhile. Stays true until
 * the page reloads.
 *
 * @returns {boolean}
 */
export function pageIsStale() { return _stale; }

/**
 * Run `fn()` each time this stale page's connection comes back — the moment
 * the table can be told. A listener that throws is logged.
 *
 * @param {() => void} fn
 */
export function onPageStale(fn) {
  if (typeof fn === "function") _staleListeners.add(fn);
}

/** Test seam — a fresh page: no drops, not stale. */
export function _resetConnectionWatchForTests() {
  _drops = 0;
  _stale = false;
  _toldStale = false;
}

/** Count this client's connection drops and stand a stale GM page down (ready, every client). */
export function registerConnectionWatch() {
  if (_registered) return;
  const socket = globalThis.game?.socket;
  if (typeof socket?.on !== "function") return;
  _registered = true;
  socket.on("disconnect", (reason) => {
    _drops += 1;
    _stale = true;
    console.warn(`${MODULE_ID} | the connection to the server dropped (${reason ?? "no reason given"}) — a narration in flight is discarded, and this page stops writing world data until it reloads, as what changed meanwhile may not reach it.`);
  });
  socket.on("connect", () => {
    if (!_stale) return;
    // Told on every reconnect while stale: a drop the other clients saw makes
    // the page's next connect read to them as a fresh load.
    for (const fn of _staleListeners) {
      try { fn(); }
      catch (err) { console.warn(`${MODULE_ID} | a stale-page listener failed:`, err?.message ?? err); }
    }
    if (_toldStale) return;
    _toldStale = true;
    if (globalThis.game?.user?.isGM) askToReload();
  });
}

/**
 * The stood-down GM is asked to reload: a persistent notification, and a
 * dialog with a Reload button. Not awaited by anything; closing it changes
 * nothing — the page stays stood down until it reloads.
 */
function askToReload() {
  const why = "Your connection to the server dropped. This page may have missed what changed meanwhile — "
    + "an X-Card, a move, a GM's edit — so it no longer runs the table or saves world data. Reload it (F5).";
  globalThis.ui?.notifications?.error?.(`Starforged Companion: ${why}`, { permanent: true });
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.prompt !== "function") return;
  Promise.resolve(DialogV2.prompt({
    window:  { title: "Reload this page" },
    content: `<p>${why}</p><p>Another GM runs the table meanwhile; with none, the table waits for your reload.</p>`,
    ok: {
      label:    "Reload",
      callback: () => { globalThis.location?.reload?.(); },
    },
    rejectClose: false,
  })).catch(err => console.warn(`${MODULE_ID} | the reload prompt failed:`, err?.message ?? err));
}
