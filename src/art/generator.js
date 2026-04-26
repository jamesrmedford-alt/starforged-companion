/**
 * STARFORGED COMPANION
 * src/art/generator.js — DALL-E 3 image generation pipeline
 *
 * Responsibilities:
 * - Call the DALL-E 3 API with a built prompt
 * - Enforce the one-generation / one-regeneration / locked policy
 * - Store generated assets via art/storage.js
 * - Trigger generation from entity hooks (first Loremaster description)
 * - Handle API errors gracefully — generation failure is silent, not blocking
 *
 * Generation policy (per Brief §2 — Art Generation):
 *   1. Generation fires after Loremaster's first description of an entity —
 *      not on name first appearance
 *   2. One generation, one permitted regeneration, then locked
 *   3. Art is generated once per entity per campaign — not per session
 *   4. API key stored scope: "client" — never sent to server
 *
 * DALL-E 3 API:
 *   POST https://api.openai.com/v1/images/generations
 *   model: dall-e-3
 *   quality: "standard" (default) — "hd" available but doubles cost
 *   style: "vivid" | "natural" — "natural" fits the Starforged aesthetic better
 *   response_format: "url" (default, expires after 1 hour) |
 *                    "b64_json" (preferred — persists via storage.js)
 *
 * Error handling:
 *   content_policy_violation — log and return null; entity portrait stays blank
 *   rate_limit_exceeded      — retry once after 10s; then return null
 *   billing / auth errors    — notify GM via ui.notifications, return null
 *   network errors           — return null silently
 *
 * All errors are non-blocking. A missing portrait is preferable to a broken scene.
 */

import { buildPrompt, buildRegenerationPrompt } from "./promptBuilder.js";
import { storeArtAsset, loadArtAsset }           from "./storage.js";
import { apiPost } from "../api-proxy.js";

const MODULE_ID   = "starforged-companion";
const DALLE_URL   = "https://api.openai.com/v1/images/generations";
const DALLE_MODEL = "dall-e-3";


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a portrait for an entity after Loremaster's first description.
 * This is the primary entry point called from the Loremaster hook.
 *
 * Checks the generation policy before calling the API:
 *   - Has a source description been set? (required)
 *   - Has a portrait already been generated? (if so, is regeneration permitted?)
 *   - Is the portrait locked? (if so, bail silently)
 *
 * @param {string} journalEntryId — Foundry JournalEntry ID of the entity
 * @param {string} entityType     — "connection" | "settlement" | "ship" | "faction" | "planet"
 * @param {Object} entity         — Entity record from the entity management layer
 * @param {Object} campaignState
 * @returns {Promise<ArtAsset|null>}
 */
export async function generatePortrait(journalEntryId, entityType, entity, campaignState) {
  // Policy check
  if (!entity.portraitSourceDescription) {
    console.warn(`${MODULE_ID} | Art: no source description for ${entityType} ${entity._id}`);
    return null;
  }

  if (entity.portraitId) {
    const existing = await loadArtAsset(entity.portraitId);
    if (existing?.locked) {
      console.log(`${MODULE_ID} | Art: portrait locked for ${entity._id} — skipping`);
      return null;
    }
    if (existing && !existing.regenerationUsed) {
      // One regeneration permitted — but caller must explicitly request it
      console.log(`${MODULE_ID} | Art: portrait exists for ${entity._id} — use regeneratePortrait() to replace`);
      return existing;
    }
  }

  const apiKey = readApiKey();
  if (!apiKey) {
    notifyMissingApiKey();
    return null;
  }

  const { prompt, size } = buildPrompt(entityType, entity.portraitSourceDescription, entity);
  const asset = await callDallE(apiKey, prompt, size, entity._id, entityType);

  if (!asset) return null;

  // Store and link
  await storeArtAsset(asset, campaignState);
  await linkPortraitToEntity(journalEntryId, entityType, asset._id);

  console.log(`${MODULE_ID} | Art: generated portrait for ${entityType} ${entity._id}`);
  return asset;
}

/**
 * Regenerate a portrait — the one permitted second attempt.
 * Only callable if: portrait exists, regeneration not yet used, not locked.
 *
 * @param {string} journalEntryId
 * @param {string} entityType
 * @param {Object} entity
 * @param {Object} campaignState
 * @returns {Promise<ArtAsset|null>}
 */
export async function regeneratePortrait(journalEntryId, entityType, entity, campaignState) {
  if (!entity.portraitId) {
    console.warn(`${MODULE_ID} | Art: no existing portrait to regenerate for ${entity._id}`);
    return null;
  }

  const existing = await loadArtAsset(entity.portraitId);

  if (existing?.locked) {
    console.warn(`${MODULE_ID} | Art: portrait locked — regeneration not permitted`);
    if (typeof ui !== "undefined") {
      ui.notifications?.warn("Starforged Companion: This portrait is locked and cannot be regenerated.");
    }
    return null;
  }

  if (existing?.regenerationUsed) {
    console.warn(`${MODULE_ID} | Art: regeneration already used for ${entity._id}`);
    if (typeof ui !== "undefined") {
      ui.notifications?.warn("Starforged Companion: One regeneration has already been used for this portrait. It is now locked.");
    }
    // Lock it now so this check is fast next time
    await storeArtAsset({ ...existing, locked: true }, campaignState);
    return null;
  }

  const apiKey = readApiKey();
  if (!apiKey) {
    notifyMissingApiKey();
    return null;
  }

  const { prompt, size } = buildRegenerationPrompt(entityType, entity.portraitSourceDescription, entity);
  const asset = await callDallE(apiKey, prompt, size, entity._id, entityType);

  if (!asset) return null;

  // Mark old asset as superseded, lock the new one
  if (existing) {
    await storeArtAsset({ ...existing, superseded: true }, campaignState);
  }

  const lockedAsset = { ...asset, regenerationUsed: true, locked: true };
  await storeArtAsset(lockedAsset, campaignState);
  await linkPortraitToEntity(journalEntryId, entityType, lockedAsset._id);

  console.log(`${MODULE_ID} | Art: regenerated (and locked) portrait for ${entityType} ${entity._id}`);
  return lockedAsset;
}


// ─────────────────────────────────────────────────────────────────────────────
// DALL-E API CALL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call the DALL-E 3 API.
 * Returns a raw ArtAsset record on success, null on any failure.
 * Retries once on rate limit (10s delay).
 *
 * @param {string} apiKey
 * @param {string} prompt
 * @param {string} size    — "1024x1024" | "1792x1024"
 * @param {string} entityId
 * @param {string} entityType
 * @returns {Promise<ArtAsset|null>}
 */
async function callDallE(apiKey, prompt, size, entityId, entityType) {
  return attemptDallECall(apiKey, prompt, size, entityId, entityType, false);
}

async function attemptDallECall(apiKey, prompt, size, entityId, entityType, isRetry) {
  try {
    const body = {
      model:           DALLE_MODEL,
      prompt,
      n:               1,
      size,
      quality:         "standard",
      style:           "natural",
      response_format: "b64_json",
    };

    const headers = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Route through api-proxy.js — handles Forge vs local proxy detection
    const data = await apiPost(
      "https://api.openai.com/v1/images/generations",
      headers,
      body
    );

    const b64      = data.data?.[0]?.b64_json;
    const revised  = data.data?.[0]?.revised_prompt ?? prompt;

    if (!b64) throw new Error("DALL-E returned no image data.");

    return {
      _id:              generateId(),
      entityId,
      entityType,
      prompt,
      revisedPrompt:    revised,
      b64,
      size,
      generatedAt:      new Date().toISOString(),
      regenerationUsed: false,
      locked:           false,
      superseded:       false,
    };
  } catch (err) {
    // Retry once on rate limit
    if (!isRetry && err.message?.includes("429")) {
      console.warn(`${MODULE_ID} | Art: rate limited, retrying in 10s...`);
      await delay(10000);
      return attemptDallECall(apiKey, prompt, size, entityId, entityType, true);
    }

    // Auth / billing errors — surface immediately
    if (err.message?.includes("401") || err.message?.includes("403")) {
      notifyBillingError(err.message);
    } else {
      console.error(`${MODULE_ID} | Art: DALL-E call failed:`, err.message);
    }
    return null;
  }
}

/**
 * Handle DALL-E API errors.
 * Returns null for all errors except rate limits (retried once).
 */
async function handleDallEError(error, apiKey, prompt, size, entityId, entityType, isRetry) {
  const code = error?.error?.code ?? error?.error?.type ?? "unknown";

  switch (code) {
    case "content_policy_violation":
      console.warn(`${MODULE_ID} | Art: content policy violation — portrait will be skipped.`);
      console.warn(`${MODULE_ID} | Art: prompt was: ${prompt}`);
      // Non-blocking — entity continues without portrait
      return null;

    case "rate_limit_exceeded":
      if (!isRetry) {
        console.warn(`${MODULE_ID} | Art: rate limited — retrying in 10s`);
        await delay(10_000);
        return attemptDallECall(apiKey, prompt, size, entityId, entityType, true);
      }
      console.error(`${MODULE_ID} | Art: rate limit retry failed`);
      return null;

    case "invalid_api_key":
    case "account_deactivated":
      notifyBillingError(code);
      return null;

    case "billing_hard_limit_reached":
    case "insufficient_quota":
      notifyBillingError(code);
      return null;

    default:
      console.error(`${MODULE_ID} | Art: DALL-E error (${code}):`, error?.error?.message);
      return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ENTITY LINKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the generated asset ID back to the entity record.
 * Routes to the correct entity module based on entityType.
 */
async function linkPortraitToEntity(journalEntryId, entityType, artAssetId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    if (!entry) {
      console.warn(`${MODULE_ID} | Art: journal entry not found for portrait link: ${journalEntryId}`);
      return;
    }

    const page = entry.pages?.contents?.[0];
    if (!page) {
      console.warn(`${MODULE_ID} | Art: no page found in entry: ${journalEntryId}`);
      return;
    }

    // Write portraitId directly to the entity's flag object.
    // All entity types (connection, ship, settlement, faction, planet) store
    // their data under page.flags[MODULE_ID][entityType] — this approach works
    // for all of them without depending on each module's specific export names.
    const existing = page.flags?.[MODULE_ID]?.[entityType] ?? {};
    await page.setFlag(MODULE_ID, entityType, {
      ...existing,
      portraitId: artAssetId,
      updatedAt:  new Date().toISOString(),
    });

    console.log(`${MODULE_ID} | Art: linked portrait ${artAssetId} to ${entityType} ${journalEntryId}`);
  } catch (err) {
    console.error(`${MODULE_ID} | Art: failed to link portrait to entity:`, err.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readApiKey() {
  try {
    return game.settings.get(MODULE_ID, "artApiKey") ?? null;
  } catch {
    return null;
  }
}

function notifyMissingApiKey() {
  console.warn(`${MODULE_ID} | Art: no OpenAI API key configured`);
  if (typeof ui !== "undefined") {
    ui.notifications?.warn(
      "Starforged Companion: No OpenAI API key is configured. " +
      "Add your key in module settings to enable portrait generation.",
      { permanent: false }
    );
  }
}

function notifyBillingError(code) {
  console.error(`${MODULE_ID} | Art: OpenAI billing/auth error: ${code}`);
  if (typeof ui !== "undefined") {
    ui.notifications?.error(
      `Starforged Companion: OpenAI API error (${code}). ` +
      "Check your API key and account billing status in module settings.",
      { permanent: true }
    );
  }
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @typedef {Object} ArtAsset
 * @property {string}  _id
 * @property {string}  entityId
 * @property {string}  entityType
 * @property {string}  prompt
 * @property {string}  revisedPrompt
 * @property {string}  b64             — base64 encoded PNG
 * @property {string}  size            — "1024x1024" | "1792x1024"
 * @property {string}  generatedAt     — ISO timestamp
 * @property {boolean} regenerationUsed
 * @property {boolean} locked
 * @property {boolean} superseded
 */
