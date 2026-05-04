/**
 * STARFORGED COMPANION
 * src/api-proxy.js — Unified external API proxy routing
 *
 * Handles CORS-safe external API calls for both the Claude API (interpreter.js)
 * and DALL-E API (art/generator.js) by routing through:
 *
 *   • The Forge  — ForgeAPI.call("proxy", ...) when running on forge-vtt.com
 *                  Server-side proxy; no CORS restriction; no local setup needed.
 *
 *   • Local proxy — http://127.0.0.1:3001 when running Foundry desktop
 *                   Run: npm run proxy (proxy/claude-proxy.mjs must be running)
 *                   The proxy relays to api.anthropic.com and api.openai.com
 *                   from Node.js where CORS does not apply.
 *
 * Both paths present the same interface to callers:
 *   const responseText = await apiPost(url, headers, body);
 *
 * Output path: modules/starforged-companion/src/api-proxy.js
 */

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether we are running inside The Forge.
 * ForgeVTT is a global injected by The Forge's client-side script.
 */
function isForge() {
  return typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge === true;
}

/**
 * Get the local proxy base URL from module settings.
 * Falls back to the default port if settings are unavailable (test context).
 */
function getLocalProxyBase() {
  try {
    const url = game.settings.get(MODULE_ID, "claudeProxyUrl");
    return url?.trim().replace(/\/$/, "") || "http://127.0.0.1:3001";
  } catch {
    return "http://127.0.0.1:3001";
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Make an external API POST request through the appropriate proxy.
 *
 * @param {string} url       — Full target URL (e.g. https://api.anthropic.com/v1/messages)
 * @param {Object} headers   — Request headers (x-api-key, Content-Type, etc.)
 * @param {Object} body      — Request body (will be JSON-serialised)
 * @returns {Promise<Object>} — Parsed JSON response body
 * @throws {Error}            — On non-2xx responses or network failures
 */
export async function apiPost(url, headers, body) {
  if (isForge()) {
    return forgePost(url, headers, body);
  }
  return localProxyPost(url, headers, body);
}

/**
 * Check whether the local proxy is reachable.
 * Used by the ready hook to surface a warning when the proxy isn't running.
 * Returns true if reachable, false otherwise. Never throws.
 *
 * @returns {Promise<boolean>}
 */
export async function isLocalProxyReachable() {
  if (isForge()) return true;   // Forge doesn't need the local proxy
  try {
    const base = getLocalProxyBase();
    const res  = await fetch(`${base}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`starforged-companion | api-proxy: local proxy health check failed:`, err);
    return false;
  }
}

/**
 * Return a human-readable description of the current proxy mode.
 * Used in the About pane and notifications.
 *
 * @returns {string}
 */
export function proxyModeDescription() {
  if (isForge()) return "The Forge server-side proxy";
  return `Local proxy (${getLocalProxyBase()})`;
}


// ─────────────────────────────────────────────────────────────────────────────
// The Forge path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route an API call through The Forge's built-in server-side proxy.
 *
 * The Forge provides ForgeAPI.call("proxy", options) which makes the HTTP
 * request from their Node.js server, bypassing CORS entirely.
 *
 * ForgeAPI.call("proxy", { url, method, headers, body }) returns:
 *   { success: true, response: <json-parsed body> }  on success
 *   { success: false, error: <string> }               on failure
 *
 * Ref: https://forge-vtt.com/api-docs (Proxy endpoint)
 */
async function forgePost(url, headers, body) {
  if (typeof ForgeAPI === "undefined") {
    throw new Error("ForgeAPI is not available. Is The Forge client script loaded?");
  }

  const result = await ForgeAPI.call("proxy", {
    url,
    method:  "POST",
    headers,
    body:    JSON.stringify(body),
  });

  if (!result?.success) {
    throw new Error(
      `The Forge proxy error: ${result?.error ?? "unknown error"}`
    );
  }

  // ForgeAPI.call returns the parsed response body in result.response
  return result.response;
}


// ─────────────────────────────────────────────────────────────────────────────
// Local proxy path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route an API call through the local Node.js proxy (proxy/claude-proxy.mjs).
 *
 * The proxy listens on localhost and forwards requests to external APIs
 * from Node.js, which has no CORS restriction.
 *
 * URL rewriting:
 *   https://api.anthropic.com/v1/messages     → <proxyBase>/v1/messages
 *   https://api.openai.com/v1/images/generations → <proxyBase>/openai/v1/images/generations
 *
 * The proxy uses path prefix to determine the upstream host.
 */
async function localProxyPost(url, headers, body) {
  const proxyUrl = rewriteForLocalProxy(url);

  const res = await fetch(proxyUrl, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  return res.json();
}

/**
 * Rewrite an external API URL to route through the local proxy.
 *
 * Proxy path conventions (must match claude-proxy.mjs routing):
 *   api.anthropic.com  → <base>/v1/... (no prefix change — Anthropic is the default)
 *   api.openai.com     → <base>/openai/v1/...
 */
function rewriteForLocalProxy(originalUrl) {
  const base = getLocalProxyBase();

  if (originalUrl.includes("api.anthropic.com")) {
    const path = originalUrl.replace("https://api.anthropic.com", "");
    return `${base}${path}`;
  }

  if (originalUrl.includes("api.openai.com")) {
    const path = originalUrl.replace("https://api.openai.com", "");
    return `${base}/openai${path}`;
  }

  // Unknown host — pass through as-is (will likely fail CORS, but don't swallow)
  console.warn(`${MODULE_ID} | api-proxy: unknown host in URL: ${originalUrl}`);
  return originalUrl;
}
