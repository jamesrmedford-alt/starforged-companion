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
 * If the model returns an https:// image URL instead of inline base64
 * (which BFL/FLUX is documented to do — URLs expire after 10 minutes), the
 * URL is fetched and converted to base64 inline so callers see a uniform
 * shape regardless of provider.
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
    // FLUX-class image-only models reject ["image","text"]; image-only is
    // the documented modalities value for those models.
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
  const found   = extractImagePayload(message);

  if (!found) {
    // Log a substantial slice of the response so the actual shape is
    // diagnosable in the console without needing a network capture.
    const dump = safeStringify(message ?? data, 1500);
    console.warn(`${MODULE_ID} | openRouterImage: no image bytes in response\n` +
      `Full message snapshot (truncated to 1500 chars):\n${dump}`);
    return null;
  }

  if (found.kind === "base64") return found.value;

  // The model returned an https:// URL — fetch and convert to base64.
  try {
    return await fetchUrlAsBase64(found.value);
  } catch (err) {
    console.warn(`${MODULE_ID} | openRouterImage: failed to fetch image URL ${found.value}:`,
      err?.message ?? err);
    return null;
  }
}

/**
 * Pull the image payload out of an OpenRouter chat-completions message.
 *
 * Returns one of:
 *   { kind: "base64", value: "<raw base64>" }
 *   { kind: "url",    value: "https://..." }
 *   null  — nothing recognisable
 *
 * Known shapes (verified or plausible):
 *   • message.images[0].image_url.url
 *   • message.images[0].url
 *   • message.images[0].b64_json
 *   • message.content (array) parts with .image_url.url, .url, .inlineData.data,
 *     .image, or part.type === "output_image" / "image" / "image_url"
 *   • message.content (string) — markdown image like ![alt](data:image/...) — fallback
 */
function extractImagePayload(message) {
  if (!message) return null;

  // 1) message.images[]
  const img0 = message.images?.[0];
  if (img0) {
    const candidate =
      coerceToPayload(img0.image_url?.url) ??
      coerceToPayload(img0.url) ??
      coerceToPayload(img0.b64_json) ??
      coerceToPayload(img0.image_url);
    if (candidate) return candidate;
  }

  // 2) message.content as array of parts
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const candidate =
        coerceToPayload(part.image_url?.url) ??
        coerceToPayload(part.image_url) ??
        coerceToPayload(part.url) ??
        coerceToPayload(part.image) ??
        (part.inlineData?.data ? { kind: "base64", value: part.inlineData.data } : null) ??
        (part.b64_json ? { kind: "base64", value: part.b64_json } : null);
      if (candidate) return candidate;
    }
  }

  // 3) message.content as string — last-resort markdown image extraction.
  if (typeof message.content === "string") {
    const md = message.content.match(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/);
    if (md) return coerceToPayload(md[1]);
  }

  return null;
}

/**
 * Best-effort: decide whether `value` represents an image as base64 or a URL.
 * Returns null if `value` is not a recognisable image reference.
 */
function coerceToPayload(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  // data:image/...;base64,...
  const dataMatch = value.match(/^data:image\/[^;]+;base64,(.*)$/);
  if (dataMatch) return { kind: "base64", value: dataMatch[1].replace(/\s+/g, "") };

  // https:// or http:// URL
  if (/^https?:\/\//i.test(value)) return { kind: "url", value };

  // Bare base64 (no prefix) — heuristic: long string of base64 characters.
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100) {
    return { kind: "base64", value: value.replace(/\s+/g, "") };
  }

  return null;
}

/**
 * Fetch an image URL and return its bytes as base64.
 * Throws on network failure or non-2xx response.
 */
async function fetchUrlAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return arrayBufferToBase64(buf);
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // Process in chunks to avoid call-stack overflow on large images.
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function safeStringify(value, maxLen = 1500) {
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…[truncated]` : s;
  } catch {
    return String(value).slice(0, maxLen);
  }
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
