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
// `disconnect` is the socket.io client's own event (`game.socket` is its
// Socket); it fires on every drop.

const MODULE_ID = "starforged-companion";

let _drops = 0;
let _registered = false;

/** Times this client's connection to the server dropped since its page loaded. */
export function connectionDrops() { return _drops; }

/** Count this client's connection drops (ready, every client). */
export function registerConnectionWatch() {
  if (_registered) return;
  const socket = globalThis.game?.socket;
  if (typeof socket?.on !== "function") return;
  _registered = true;
  socket.on("disconnect", (reason) => {
    _drops += 1;
    console.warn(`${MODULE_ID} | the connection to the server dropped (${reason ?? "no reason given"}) — a narration in flight is discarded, as an X-Card played meanwhile may not reach this page.`);
  });
}
