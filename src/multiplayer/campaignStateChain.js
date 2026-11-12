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
 * A task reads the stored campaignState itself, inside its turn — at its
 * start, with no await before the read or between the read and its write —
 * and must not wait on another task of this chain: it would wait for itself.
 * A predecessor that never settles (a write the server never answers) is
 * waited on for at most CAMPAIGN_STATE_WRITE_WAIT_MS from when it started;
 * then the next one goes, warned, so one hung write cannot hold every later
 * one.
 *
 * The X-Card's pause is the one write that does not wait its turn
 * (`runCampaignStateWriteNow`): a safety write must not wait behind a write
 * that never settles (decisions.md → "X-Card: anyone plays it, a GM resumes
 * it"). It is written at once, from the store as this client has it, and
 * every chained write that has not yet read the store waits for it to land —
 * one that read the cache inside the pause's round trip carried
 * `xCardActive: false` back (CAMPSTATE-CHAIN-PARTIAL: an oracle card the GM
 * captured meanwhile). A chained write already sent when the pause is played
 * was built without it and lands first; the pause, built without that write,
 * lands after it and keeps the X-Card's fields — and takes back that write's
 * own change, the price of not waiting.
 */

import { pageIsStale } from "./connectionWatch.js";

const MODULE_ID = "starforged-companion";

/**
 * A page whose connection dropped writes no campaignState until it reloads
 * (issue #347 AB19-STALE-CACHE-WRITES): campaignState is written whole, from
 * this client's cache, and a stale cache carries back — over the table — what
 * it missed: an X-Card's pause, another GM's move. Thrown at the write's turn,
 * so every caller's refused-write path takes it.
 */
function refuseIfStale(label) {
  if (!pageIsStale()) return;
  throw new Error(`${label}: not written — this page lost its connection to the server and may have missed what changed meanwhile; reload it to save changes`);
}

/** How long a chained write waits for the one ahead of it, counted from when that one started. */
const CAMPAIGN_STATE_WRITE_WAIT_MS = 10_000;

// The last write queued on this client, or null when the chain is idle. Its
// `started` and `done` only ever resolve, so a failed write never poisons the
// chain.
let _tail = null;

// Writes that jumped the chain (runCampaignStateWriteNow) and have not landed:
// every chained write waits for them before it reads the store.
const _jumped = new Set();

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
      // A write that jumped the chain meanwhile (the X-Card's pause) lands
      // first; checked again after each wait, and never with an await between
      // the last check and the task's read.
      const waited = new Set();
      for (let jumped = nextJumped(waited); jumped; jumped = nextJumped(waited)) {
        waited.add(jumped);
        await waitForWriteAhead(jumped, label);
        // Not landed within its bound: no later write waits for it either.
        if (!jumped.settled) _jumped.delete(jumped);
      }
      entry.startedAt = Date.now();
      markStarted();
      refuseIfStale(label);
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

/**
 * Run `task` — the X-Card's pause — at once, ahead of the chain: it waits for
 * no write, and every chained write that has not yet read the store waits for
 * it to land (at most CAMPAIGN_STATE_WRITE_WAIT_MS from its start), so none
 * carries the pause back. `task` reads the store itself and writes with no
 * await between. The caller gets the task's own result or rejection.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @param {string} [label] — for the wait warning of the writes behind it
 * @returns {Promise<T>}
 */
export function runCampaignStateWriteNow(task, label = "campaignState write") {
  let release;
  const entry = {
    label,
    startedAt: Date.now(),
    settled:   false,
    started:   Promise.resolve(),
    done:      new Promise(resolve => { release = resolve; }),
  };
  _jumped.add(entry);
  return (async () => {
    try {
      refuseIfStale(label);
      return await task();
    } finally {
      entry.settled = true;
      release();
      _jumped.delete(entry);
    }
  })();
}

/** A write that jumped the chain, not landed and not yet waited for. */
function nextJumped(waited) {
  for (const entry of _jumped) if (!waited.has(entry)) return entry;
  return null;
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
