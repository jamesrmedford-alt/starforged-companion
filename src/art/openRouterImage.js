/**
 * STARFORGED COMPANION
 * src/art/openRouterImage.js — OpenRouter image generation
 *
 * OpenRouter exposes image generation through its chat-completions endpoint
 * with `modalities: ["image"]`. The endpoint sends `Access-Control-Allow-Origin`,
 * so it works directly from a browser — including Foundry running on The Forge,
 * where the legacy DALL-E path is blocked by CORS.
 *
 * Reference: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 *
 * The user supplies their own OpenRouter API key (BYOK). It is sent from the
 * browser in `Authorization: Bearer ...` and never leaves the user's machine
 * for any host other than openrouter.ai itself.
 */

const MODULE_ID         = "starforged-companion";
const OPENROUTER_URL    = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL     = "black-forest-labs/flux.2-pro";

/**
 * Generate one image via OpenRouter and return the raw base64 payload.
 *
 * Returns the base64 PNG (no data URL prefix) so callers can persist it in
 * the same shape they already use for DALL-E b64_json responses. Callers that
 * want a data URL can prefix `data:image/png;base64,` themselves.
 *
 * @param {Object} params
 * @param {string} params.apiKey  — OpenRouter API key (sk-or-v1-...)
 * @param {string} params.prompt  — Free-form prompt text
 * @param {string} [params.model] — OpenRouter model id; defaults to FLUX.2 Pro
 * @param {string} [params.title] — Sent as X-Title header (OpenRouter analytics)
 * @returns {Promise<string|null>} Base64-encoded image bytes, or null on failure
 */
export async function generateOpenRouterImage({ apiKey, prompt, model, title } = {}) {
  if (!apiKey)  throw new Error("OpenRouter API key is required.");
  if (!prompt)  throw new Error("Prompt is required.");

  const headers = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer":  resolveReferer(),
    "X-Title":       title || "Starforged Companion",
  };

  const body = {
    model:      model || DEFAULT_MODEL,
    messages:   [{ role: "user", content: prompt }],
    modalities: ["image"],
  };

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`OpenRouter network error: ${err?.message ?? err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  const data    = await res.json();
  const message = data?.choices?.[0]?.message;
  const b64     = extractBase64(message);

  if (!b64) {
    console.warn(`${MODULE_ID} | openRouterImage: no image bytes in response`,
      JSON.stringify(message ?? data).slice(0, 400));
    return null;
  }

  return b64;
}

/**
 * Pull the base64 image bytes out of an OpenRouter chat-completions message.
 *
 * Three known shapes from OpenRouter image models:
 *   1. message.images[0].image_url.url — "data:image/png;base64,AAAA..."
 *   2. message.images[0].image_url.url — "AAAA..." (already-stripped base64)
 *   3. message.content[].type === "image_url" with .image_url.url — same encodings
 *
 * Returns the raw base64 (no data: prefix), or null if nothing matched.
 */
function extractBase64(message) {
  if (!message) return null;

  // Shape 1/2: top-level images array (most common for FLUX/Imagen via OpenRouter)
  const fromImages = message.images?.[0]?.image_url?.url ?? message.images?.[0]?.url;
  const stripped   = stripDataUrl(fromImages);
  if (stripped) return stripped;

  // Shape 3: parts inside message.content
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      const partUrl = part?.image_url?.url ?? part?.url;
      const partB64 = stripDataUrl(partUrl);
      if (partB64) return partB64;

      // Gemini-style inlineData fallback
      if (part?.inlineData?.data) return part.inlineData.data;
    }
  }

  return null;
}

function stripDataUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const match = value.match(/^data:image\/[^;]+;base64,(.*)$/);
  if (match) return match[1];
  // Bare base64 (no data: prefix) — assume the model already stripped it.
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100) return value.replace(/\s+/g, "");
  return null;
}

function resolveReferer() {
  // OpenRouter recommends an HTTP-Referer header for analytics. Foundry's
  // window.location is typically the world URL; that is fine to send.
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | openRouterImage: window.location lookup failed:`, err);
  }
  return "https://github.com/jamesrmedford-alt/starforged-companion";
}
