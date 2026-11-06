/**
 * STARFORGED COMPANION
 * src/multiplayer/campaignStateChain.js — one campaignState write chain per client
 *
 * campaignState is one world setting, written whole, and a client's cached
 * value changes only when the server answers a write (rules/reachability.md
 * §9: "a store can lag the world by a delivery"). Two read-modify-writes on
 * one client inside one round trip each read the cache before the other's
 * write landed, so the second, applied after the first, put the first's
 * fields back. Each writer kind had a queue of its own — two oracle captures
 * (issue #331 X44), two clock writes (issue #326 W53) — and nothing ordered
 * one kind against another: an oracle result the canonical GM had just
 * recorded was erased by the Pay the Price's clock advance that followed its
 * card, or by the scene start of the `!oracle`'s own follow-up (issue #342
 * Z17).
 *
 * `serialiseCampaignStateWrite(task)` runs a read-modify-write only once the
 * one ahead of it on this client has landed (or failed), so it reads the store
 * as that write left it. The writers that fire without waiting on anything
 * run through it: the oracle capture (index.js `captureOracleResult`), every
 * clock write (clocks/clocks.js — `serialiseClockWrite`), and the scene
 * lifecycle's and the narrator sidecar's field persists
 * (factContinuity/sceneLifecycle.js `persistCampaignStateFields`,
 * `persistSceneLedgerFields`).
 *
 * A task reads the stored campaignState itself, inside its turn, and must not
 * wait on another task of this chain — it would wait for itself. A
 * predecessor that never settles (a write the server never answers) is waited
 * on for at most CAMPAIGN_STATE_WRITE_WAIT_MS from when it started; then the
 * next one goes, warned, so one hung write cannot hold every later one.
 */

const MODULE_ID = "starforged-companion";

/** How long a chained write waits for the one ahead of it, counted from when that one started. */
const CAMPAIGN_STATE_WRITE_WAIT_MS = 10_000;

// The last write queued on this client, or null when the chain is idle. Its
// `started` and `done` only ever resolve, so a failed write never poisons the
// chain.
let _tail = null;

/**
 * Run `task` — one campaignState read-modify-write — after the one queued
 * ahead of it on this client has settled. The caller gets the task's own
 * result or rejection; a task that fails does not hold up the next.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @param {string} [label] — for the wait warning
 * @returns {Promise<T>}
 */
export function serialiseCampaignStateWrite(task, label = "campaignState write") {
  const prev = _tail;
  let markStarted, release;
  const entry = {
    label,
    startedAt: null,
    settled:   false,
    started:   new Promise(resolve => { markStarted = resolve; }),
    done:      new Promise(resolve => { release = resolve; }),
  };
  _tail = entry;
  return (async () => {
    try {
      if (prev) await waitForWriteAhead(prev, label);
      entry.startedAt = Date.now();
      markStarted();
      return await task();
    } finally {
      if (entry.startedAt == null) entry.startedAt = Date.now();
      markStarted();   // no-op once started
      entry.settled = true;
      release();
      if (_tail === entry) _tail = null;
    }
  })();
}

/** Wait for the write ahead to settle — at most CAMPAIGN_STATE_WRITE_WAIT_MS from its start. */
async function waitForWriteAhead(prev, label) {
  await prev.started;
  if (prev.settled) return;
  const remaining = Math.max(0, prev.startedAt + CAMPAIGN_STATE_WRITE_WAIT_MS - Date.now());
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(true), remaining); });
  try {
    if (await Promise.race([prev.done.then(() => false), timedOut])) {
      console.warn(`${MODULE_ID} | ${label}: the campaignState write ahead of it (${prev.label}) has not landed after ${CAMPAIGN_STATE_WRITE_WAIT_MS}ms — writing anyway.`);
    }
  } finally {
    clearTimeout(timer);
  }
}
