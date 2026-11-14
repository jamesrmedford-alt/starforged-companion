/**
 * STARFORGED COMPANION
 * src/api-proxy.js — Direct browser fetch to Anthropic
 *
 * Anthropic supports browser CORS when the request includes
 * `anthropic-dangerous-direct-browser-access: true`. The Foundry renderer
 * (Electron on desktop, browser on The Forge) is just a browser, so a direct
 * fetch works on every platform. No local proxy, no Forge-side relay.
 *
 * The "dangerous" naming is a warning about embedding keys in shared client
 * code; it does not apply here, where the user enters their own key in
 * Companion Settings → About (BYOK) and the key is stored only in their
 * client-scoped settings.
 *
 * Reference: https://docs.anthropic.com/en/api/client-sdks#direct-browser-access
 *
 * Image generation goes through OpenRouter (see src/art/openRouterImage.js),
 * not this helper — OpenRouter has its own auth header (Authorization: Bearer)
 * and its endpoint is different.
 *
 * Output path: modules/starforged-companion/src/api-proxy.js
 */

import { logApiTransaction } from "./logging/apiTransactionLog.js";
import { fetchWithTimeout } from "./net/fetchWithTimeout.js";
import { thinkingOffFor } from "./narration/thinking.js";

const MODULE_ID = "starforged-companion";

/**
 * POST to Anthropic and return the parsed JSON response.
 *
 * @param {string} url     — Full Anthropic URL (e.g. https://api.anthropic.com/v1/messages)
 * @param {Object} headers — Caller-supplied headers (x-api-key, anthropic-version, …)
 * @param {Object} body    — Request body (will be JSON-serialised). A body that
 *   sets no `thinking` is sent with its model's thinking-off form
 *   (narration/thinking.js): every call here is a short reply or a narration
 *   sized by `max_tokens`, and Haiku 5.5 / Sonnet 5.5 think by default.
 * @param {{ label?: string|null }} [opts] — `label`: what made the call, for
 *   the API Log ("pacingClassifier", "narrator:narrateResolution", …). The log
 *   named the model alone, so the ability scanner's call could not be told
 *   from the classifier's (issue #354 P2-24).
 * @returns {Promise<Object>}
 * @throws {Error} on network failure or non-2xx response
 */
export async function apiPost(url, headers, body, { label = null } = {}) {
  if (!url.includes("api.anthropic.com")) {
    // Defensive: this helper is Anthropic-only by design. Image generation
    // has its own helper (src/art/openRouterImage.js). Catching unknown hosts
    // here surfaces accidental misuse instead of silently failing CORS.
    console.warn(`${MODULE_ID} | api-proxy: unexpected host in URL: ${url}`);
  }

  // Defensive trim on the API key header. The save flow in settingsPanel.js
  // already trims at write time, but a stored key from an older save (or one
  // set via a chat command / direct settings.set) can carry trailing
  // whitespace or a stray newline that turns into an opaque 401 from
  // Anthropic. Trimming here normalises every call site cheaply.
  const normalisedHeaders = { ...headers };
  if (typeof normalisedHeaders["x-api-key"] === "string") {
    normalisedHeaders["x-api-key"] = normalisedHeaders["x-api-key"].trim();
  }

  // Time the round-trip so the transaction log can surface per-call latency
  // (the model column distinguishes narration from the Haiku helper calls).
  // High-res monotonic clock when available; Date.now() is a fine fallback.
  const startedAt = globalThis.performance?.now?.() ?? Date.now();

  // Bounded fetch — an unbounded request that stalls (connection opens, no
  // response) would hang every caller's await forever without throwing. A
  // timeout turns that into a normal rejection the callers already handle.
  const res = await fetchWithTimeout(url, {
    method:  "POST",
    headers: {
      "Content-Type":                              "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      ...normalisedHeaders,
    },
    body: JSON.stringify(body && body.thinking === undefined ? { ...body, ...thinkingOffFor(body.model) } : body),
  }, { label: "Anthropic request" });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    // 401 specifically usually means a bad / wrong-provider key. Surface a
    // one-line hint so the caller's error log makes the cause obvious.
    if (res.status === 401) {
      const key = normalisedHeaders["x-api-key"] ?? "";
      const prefix = key ? `${key.slice(0, 7)}…` : "(empty)";
      console.warn(
        `${MODULE_ID} | api-proxy: 401 from Anthropic (key prefix: ${prefix}). ` +
        `Verify the key in Companion Settings → About. Anthropic keys start with "sk-ant-"; ` +
        `OpenRouter keys start with "sk-or-v1-" and will not authenticate here.`,
      );
    }
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // Haiku 5.5 / Sonnet 5.5 can decline a request (HTTP 200, no text). Every
  // caller already treats a reply with no text as a failure; this says why.
  if (data?.stop_reason === "refusal") {
    const category = data?.stop_details?.category;
    console.warn(`${MODULE_ID} | api-proxy: ${body?.model ?? "the model"} declined the request (refusal${category ? `: ${category}` : ""}) — no text returned.`);
  }
  const durationMs = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);

  // Log the transaction (fire-and-forget — never blocks the response path).
  if (data?.usage) {
    logApiTransaction({
      model:            body?.model            ?? "unknown",
      label,
      inputTokens:      data.usage.input_tokens                  ?? 0,
      cacheWriteTokens: data.usage.cache_creation_input_tokens   ?? 0,
      cacheReadTokens:  data.usage.cache_read_input_tokens       ?? 0,
      outputTokens:     data.usage.output_tokens                 ?? 0,
      durationMs,
    });
  }

  return data;
}
