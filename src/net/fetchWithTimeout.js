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
 * Our calls are all non-streaming (Anthropic /v1/messages, OpenRouter
 * chat-completions, image-URL download), so the fetch() promise resolves only
 * once the full response is ready — bounding fetch() bounds the whole call.
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
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut || err?.name === "AbortError") {
      const seconds = Math.round(timeoutMs / 1000);
      console.warn(`${MODULE_ID} | fetchWithTimeout: ${label} timed out after ${seconds}s (${url})`);
      throw new Error(`${label} timed out after ${seconds}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
