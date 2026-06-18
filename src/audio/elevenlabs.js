/**
 * STARFORGED COMPANION
 * src/audio/elevenlabs.js — direct browser fetch to ElevenLabs TTS
 *
 * The user supplies their own ElevenLabs API key in Companion Settings
 * → About; the same BYOK model as Anthropic and OpenRouter. Auth header
 * is `xi-api-key` (NOT `x-api-key`). The api-proxy helper in
 * `src/api-proxy.js` is Anthropic-only by design (decision:
 * `docs/decisions.md` "CORS strategy"); this file is the ElevenLabs
 * equivalent with its own headers and error surfacing.
 *
 * Endpoints used:
 *   POST /v1/text-to-speech/{voice_id}              — full MP3 response
 *   POST /v1/text-to-speech/{voice_id}/stream       — chunked audio
 *   GET  /v1/user/subscription                      — usage / limit
 *
 * Output content type is audio/mpeg (MP3). All requests are
 * Content-Type: application/json on the input side.
 *
 * Output path: modules/starforged-companion/src/audio/elevenlabs.js
 */

const MODULE_ID = "starforged-companion";
const ENDPOINT  = "https://api.elevenlabs.io/v1";

/**
 * Curated model list surfaced in the Audio settings tab. Updates to
 * this list are deliberately code changes (not setting changes) so that
 * a stale model id fails visibly at review time.
 *
 * `creditMultiplier` is per the ElevenLabs pricing structure as of May
 * 2026: Flash v2.5 and Turbo v2.5 = 0.5 credits/char; Multilingual v2
 * and Eleven v3 = 1.0 credit/char.
 */
export const ELEVENLABS_MODELS = Object.freeze([
  { id: "eleven_flash_v2_5",      label: "Flash v2.5 — fastest, lowest cost",  creditMultiplier: 0.5 },
  { id: "eleven_turbo_v2_5",      label: "Turbo v2.5 — balanced",               creditMultiplier: 0.5 },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — long-form quality", creditMultiplier: 1.0 },
  { id: "eleven_v3",              label: "Eleven v3 — highest expressiveness",  creditMultiplier: 1.0 },
]);

/**
 * Default voice IDs from ElevenLabs' public sample library — used as
 * settings defaults so the feature works on first open without forcing
 * the GM to pick voices before testing.
 *   Narrator default = `fNmw8sukfGuvWVOp33Ge`.
 *   Feminine NPC default (she/her) = Rachel `21m00Tcm4TlvDq8ikWAM`.
 *   Generic NPC fallback = Adam `pNInz6obpgDQGcFmaJgB`.
 */
export const DEFAULT_NARRATOR_VOICE_ID      = "fNmw8sukfGuvWVOp33Ge";
export const DEFAULT_NPC_VOICE_ID           = "pNInz6obpgDQGcFmaJgB";
export const DEFAULT_NPC_FEMININE_VOICE_ID  = "21m00Tcm4TlvDq8ikWAM";

function trimKey(apiKey) {
  return typeof apiKey === "string" ? apiKey.trim() : "";
}

function clampSpeed(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return 1.0;
  if (n < 0.7) return 0.7;
  if (n > 1.5) return 1.5;
  return Math.round(n * 100) / 100;
}

/**
 * Synthesise a single text segment to audio bytes.
 *
 * The response body is MP3 (audio/mpeg). When `stream` is false (the
 * default) the full body is read into an ArrayBuffer and returned.
 * When `stream` is true the Response object itself is returned so the
 * caller can read chunks incrementally via `response.body.getReader()`.
 *
 * @param {Object} args
 * @param {string} args.apiKey
 * @param {string} args.voiceId
 * @param {string} args.modelId
 * @param {string} args.text
 * @param {number} [args.speed=1.0]   — clamped to 0.7-1.5
 * @param {boolean} [args.stream=false]
 * @returns {Promise<ArrayBuffer|Response>}
 * @throws {Error} on network failure or non-2xx response
 */
export async function synthesise({ apiKey, voiceId, modelId, text, speed = 1.0, stream = false }) {
  const key = trimKey(apiKey);
  if (!key) throw new Error("ElevenLabs API key missing");
  if (!voiceId) throw new Error("voiceId required");
  if (!modelId) throw new Error("modelId required");
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("text required");
  }

  const path = stream
    ? `${ENDPOINT}/text-to-speech/${encodeURIComponent(voiceId)}/stream`
    : `${ENDPOINT}/text-to-speech/${encodeURIComponent(voiceId)}`;

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      speed: clampSpeed(speed),
    },
  };

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "xi-api-key":   key,
      "Content-Type": "application/json",
      "Accept":       "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    if (res.status === 401) {
      const prefix = key ? `${key.slice(0, 6)}…` : "(empty)";
      console.warn(
        `${MODULE_ID} | elevenlabs: 401 (key prefix: ${prefix}). ` +
        `Verify the ElevenLabs key in Companion Settings → About. ` +
        `ElevenLabs keys typically start with "sk_"; Anthropic keys ("sk-ant-") and ` +
        `OpenRouter keys ("sk-or-v1-") will not authenticate here.`,
      );
    }
    throw new Error(`ElevenLabs API error ${res.status}: ${errText}`);
  }

  return stream ? res : res.arrayBuffer();
}

/**
 * Read current ElevenLabs subscription character usage for the Audio
 * tab budget display.
 *
 * @param {string} apiKey
 * @returns {Promise<{ used: number, limit: number, resetUnix: number|null }>}
 * @throws {Error} on network failure or non-2xx response
 */
export async function fetchSubscription(apiKey) {
  const key = trimKey(apiKey);
  if (!key) throw new Error("ElevenLabs API key missing");

  const res = await fetch(`${ENDPOINT}/user/subscription`, {
    method:  "GET",
    headers: { "xi-api-key": key },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`ElevenLabs subscription error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  return {
    used:      Number(json.character_count ?? 0),
    limit:     Number(json.character_limit ?? 0),
    resetUnix: json.next_character_count_reset_unix
      ? Number(json.next_character_count_reset_unix)
      : null,
  };
}
