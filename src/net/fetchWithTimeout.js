/**
 * STARFORGED COMPANION
 * src/net/fetchWithTimeout.js — fetch() with a hard timeout.
 *
 * Every external network call in the module must be bounded. An unbounded
 * fetch that *stalls* — the connection opens but no response ever arrives —
 * neither resolves nor rejects, so the surrounding try/catch and .catch()
 * handlers never fire. That silently wedges any pipeline awaiting it. The
 * v1.7.23 sector-creator hang was exactly this: the per-entity portrait pass
 * stalled on an unbounded OpenRouter fetch, so the actors were created but the
 * Scene was never built and nothing was ever logged (a stall is not a throw).
 *
 * Bounding the fetch with an AbortController converts that hang into an
 * ordinary rejection, so the existing graceful-degradation paths run and the
 * failure surfaces in the console / error-log journal instead of disappearing.
 *
 * The deadline covers the response body as well. fetch() resolves once the
 * headers arrive — even for our non-streaming calls — and the body can stall
 * after them; the helper used to clear its timer at that point, so a stalled
 * body left `res.json()` / `res.text()` / `res.arrayBuffer()` waiting forever
 * (issue #300 F06). Each body reader on the returned Response now races the
 * same deadline (and stops the timer when it settles); a caller that reads
 * `res.body` itself is bounded too — the deadline aborts the request.
 */

const MODULE_ID = "starforged-companion";

// 120s — generous enough that a slow-but-valid narration or image generation
// completes, short enough that a genuinely dead request fails loudly rather
// than hanging the pipeline forever.
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * fetch() that aborts after `timeoutMs`, throwing a clear, labelled error
 * instead of hanging indefinitely.
 *
 * @param {string} url
 * @param {RequestInit} [init]              — passed through to fetch (a `signal` is added)
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs]         — abort threshold (default 120s)
 * @param {string} [opts.label]             — request name used in the timeout message
 * @returns {Promise<Response>}
 * @throws {Error} `<label> timed out after <n>s` on timeout; the original error otherwise
 */
export async function fetchWithTimeout(
  url,
  init = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, label = "Request" } = {},
) {
  // No AbortController (very old runtime) — fall back to a plain fetch rather
  // than crash. Every supported Foundry platform (Electron, modern browsers,
  // Node 16+ for tests) provides it, so this is belt-and-suspenders only.
  // Referenced via globalThis so ESLint's globals list need not declare it.
  if (typeof globalThis.AbortController === "undefined") {
    return fetch(url, init);
  }

  const controller = new globalThis.AbortController();
  const seconds    = Math.round(timeoutMs / 1000);
  const deadline   = {
    expired: false,
    reject:  null,
    timeoutError() {
      console.warn(`${MODULE_ID} | fetchWithTimeout: ${label} timed out after ${seconds}s (${url})`);
      return new Error(`${label} timed out after ${seconds}s`);
    },
  };
  // Rejects at the deadline; raced by the fetch and by every body reader.
  deadline.promise = new Promise((_resolve, reject) => { deadline.reject = reject; });
  deadline.promise.catch(() => {});   // observed only through those races
  deadline.timer = setTimeout(() => {
    deadline.expired = true;
    controller.abort();
    deadline.reject(new Error("deadline"));
  }, timeoutMs);

  let res;
  try {
    res = await Promise.race([fetch(url, { ...init, signal: controller.signal }), deadline.promise]);
  } catch (err) {
    clearTimeout(deadline.timer);
    if (deadline.expired || err?.name === "AbortError") throw deadline.timeoutError();
    throw err;
  }
  return bindBodyToDeadline(res, deadline);
}

/** Wrap the Response's body readers so each races the request deadline. */
function bindBodyToDeadline(res, deadline) {
  if (!res || typeof res !== "object") {
    clearTimeout(deadline.timer);
    return res;
  }
  for (const method of ["json", "text", "arrayBuffer", "blob"]) {
    const read = res[method];
    if (typeof read !== "function") continue;
    res[method] = async () => {
      try {
        return await Promise.race([read.call(res), deadline.promise]);
      } catch (err) {
        if (deadline.expired || err?.name === "AbortError") throw deadline.timeoutError();
        throw err;
      } finally {
        clearTimeout(deadline.timer);
      }
    };
  }
  return res;
}
