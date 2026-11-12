/**
 * STARFORGED COMPANION
 * src/multiplayer/settleWithin.js — a bounded wait on a promise that may never settle
 *
 * A document or setting write has no timeout of its own: when the connection
 * drops between a write's emit and its answer, the promise never settles, and
 * a reconnect does not reload the page. The module's own queues already bound
 * that — the campaignState chain (10 s), the GM relay queue (60 / 270 s), the
 * scene start and the vignette waits — but a caller that awaits its own write,
 * or a link of a chain that waits on the one before it, waited forever: the
 * move lock's claim and release, Begin / End a Session, the rolling summary
 * and a player's Private Channel transcript stayed wedged until the page
 * reloaded, with nobody told (issue #347 AB05). Each now waits through
 * `settledWithin`, and goes on — warned — when the wait runs out.
 */

const MODULE_ID = "starforged-companion";

/**
 * Settle once `promise` has, or after `ms` — whichever is first, with a
 * warning when the wait ran out. Never rejects: the caller reads `promise`
 * itself when it settled in time.
 *
 * @param {Promise|*} promise
 * @param {number} ms
 * @param {string} label — for the warning
 * @returns {Promise<boolean>} true when `promise` settled within `ms`
 */
export async function settledWithin(promise, ms, label) {
  const settled = Promise.resolve(promise).then(() => false, () => false);
  // Already settled (the usual case for a chain's last link): no timer.
  const SOON = Symbol("soon");
  if (await Promise.race([settled, Promise.resolve().then(() => Promise.resolve(SOON))]) !== SOON) return true;
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(true), ms); });
  try {
    const late = await Promise.race([settled, timedOut]);
    if (late) console.warn(`${MODULE_ID} | ${label}: still waiting after ${ms}ms — going ahead.`);
    return !late;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How long a caller waits for one world write of its own — its round trip is
 * normally well under a second; a write that has not answered in this long was
 * lost with its connection.
 */
export const WORLD_WRITE_WAIT_MS = 30_000;
