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

const MODULE_ID = "starforged-companion";

/**
 * POST to Anthropic and return the parsed JSON response.
 *
 * @param {string} url     — Full Anthropic URL (e.g. https://api.anthropic.com/v1/messages)
 * @param {Object} headers — Caller-supplied headers (x-api-key, anthropic-version, …)
 * @param {Object} body    — Request body (will be JSON-serialised)
 * @returns {Promise<Object>}
 * @throws {Error} on network failure or non-2xx response
 */
export async function apiPost(url, headers, body) {
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

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":                              "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      ...normalisedHeaders,
    },
    body: JSON.stringify(body),
  });

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

  return res.json();
}
