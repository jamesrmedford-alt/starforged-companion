/**
 * STARFORGED COMPANION
 * src/api-proxy.js — External API request routing
 *
 * Two transport paths, selected per-call:
 *
 *   • Direct browser fetch — used on The Forge (and for any host that supports
 *     browser CORS). Anthropic supports this with the
 *     `anthropic-dangerous-direct-browser-access: true` opt-in header. OpenRouter
 *     supports it natively. Direct fetch needs no relay.
 *
 *   • Local Node proxy — used on Foundry desktop for hosts that do not allow
 *     browser CORS (currently only api.openai.com — the legacy DALL-E path).
 *     Run `npm run proxy` before launching Foundry.
 *
 * Phase 1 ("make"): both paths coexist. On Forge the Anthropic header carries
 * the call; on desktop the existing local proxy still handles everything.
 * Image generation on Forge goes through OpenRouter (see src/art/generator.js
 * and src/sectors/sectorArt.js), not through this proxy.
 *
 * Phase 2 ("break"): once Forge is verified, the local proxy can be removed
 * and all Anthropic traffic moved to direct fetch on every platform.
 *
 * Output path: modules/starforged-companion/src/api-proxy.js
 */

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────────────────────

/** Detect whether the renderer is loaded inside The Forge. */
function isForge() {
  return typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge === true;
}

/** Local proxy base URL (read from settings; safe default for tests). */
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
 * POST to an external API and return the parsed JSON response.
 *
 * Routes by host + environment:
 *   • api.anthropic.com on Forge → direct fetch with the dangerous-direct
 *     browser-access header (Anthropic's documented opt-in for client-side use).
 *   • api.anthropic.com on desktop → local Node proxy.
 *   • Any other host → local Node proxy (still required for OpenAI on desktop).
 *
 * @param {string} url
 * @param {Object} headers
 * @param {Object} body
 * @returns {Promise<Object>}
 */
export async function apiPost(url, headers, body) {
  const targetIsAnthropic = url.includes("api.anthropic.com");

  if (targetIsAnthropic && isForge()) {
    return directAnthropicPost(url, headers, body);
  }

  return localProxyPost(url, headers, body);
}

/**
 * Health-check the local proxy. Returns true on Forge (no proxy needed for
 * Anthropic; OpenAI image gen is handled separately via OpenRouter).
 */
export async function isLocalProxyReachable() {
  if (isForge()) return true;
  try {
    const base = getLocalProxyBase();
    const res  = await fetch(`${base}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`${MODULE_ID} | api-proxy: local proxy health check failed:`, err);
    return false;
  }
}

/** Human-readable description of the active transport. */
export function proxyModeDescription() {
  if (isForge()) return "Direct browser CORS (Anthropic) + OpenRouter (images)";
  return `Local proxy (${getLocalProxyBase()})`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Direct fetch — Anthropic on Forge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST directly to Anthropic from the browser.
 *
 * Adds `anthropic-dangerous-direct-browser-access: true` — Anthropic's documented
 * opt-in that makes their API send `Access-Control-Allow-Origin`. The "dangerous"
 * naming is a warning about embedding keys in shared client code; it does not
 * apply here, where the user enters their own key in module settings (BYOK).
 *
 * Reference: https://docs.anthropic.com/en/api/client-sdks#direct-browser-access
 */
async function directAnthropicPost(url, headers, body) {
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":                              "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  return res.json();
}


// ─────────────────────────────────────────────────────────────────────────────
// Local proxy path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST through the local Node proxy (proxy/claude-proxy.mjs).
 *
 * URL rewriting:
 *   https://api.anthropic.com/v1/messages           → <proxyBase>/v1/messages
 *   https://api.openai.com/v1/images/generations    → <proxyBase>/openai/v1/images/generations
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

  console.warn(`${MODULE_ID} | api-proxy: unknown host in URL: ${originalUrl}`);
  return originalUrl;
}
