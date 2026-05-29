/**
 * STARFORGED COMPANION
 * src/art/generator.js — Entity portrait generation pipeline
 *
 * Responsibilities:
 * - Call the OpenRouter image API with a built prompt
 * - Enforce the one-generation / one-regeneration / locked policy
 * - Store generated assets via art/storage.js
 * - Trigger generation from entity hooks (first narrator description)
 * - Handle API errors gracefully — generation failure is silent, not blocking
 *
 * Generation policy (per Brief §2 — Art Generation):
 *   1. Generation fires after the narrator's first description of an entity —
 *      not on name first appearance
 *   2. One generation, one permitted regeneration, then locked
 *   3. Art is generated once per entity per campaign — not per session
 *   4. API key stored scope: "client" — never sent to server
 *
 * Transport: OpenRouter chat-completions with `modalities: ["image"]`. The
 * default model is FLUX.2 Pro (`black-forest-labs/flux.2-pro`), configurable
 * via the `openRouterImageModel` setting. See src/art/openRouterImage.js
 * for the request shape; that helper handles base64 decoding, response-shape
 * variance, and ISO-8859-1 header sanitisation.
 *
 * Error handling:
 *   auth (401/403)          — notify GM via ui.notifications, return null
 *   any other API error     — log, return null
 *   network / parse failure — log, return null
 *
 * All errors are non-blocking. A missing portrait is preferable to a broken scene.
 */

import { buildPrompt, buildRegenerationPrompt } from "./promptBuilder.js";
import { storeArtAsset, loadArtAsset }           from "./storage.js";
import { generateOpenRouterImage }                from "./openRouterImage.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "../entities/registry.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a portrait for an entity after the narrator's first description.
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

  const { prompt, size } = buildPrompt(entityType, entity.portraitSourceDescription, entity);
  const asset = await callOpenRouter(prompt, size, entity._id, entityType);

  if (!asset) return null;

  await storeArtAsset(asset, campaignState);
  await linkPortraitToEntity(journalEntryId, entityType, asset._id);
  await attachPortraitToActor(journalEntryId, entityType, asset.b64, asset._id);

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

  const { prompt, size } = buildRegenerationPrompt(entityType, entity.portraitSourceDescription, entity);
  const asset = await callOpenRouter(prompt, size, entity._id, entityType);

  if (!asset) return null;

  if (existing) {
    await storeArtAsset({ ...existing, superseded: true }, campaignState);
  }

  const lockedAsset = { ...asset, regenerationUsed: true, locked: true };
  await storeArtAsset(lockedAsset, campaignState);
  await linkPortraitToEntity(journalEntryId, entityType, lockedAsset._id);
  await attachPortraitToActor(journalEntryId, entityType, lockedAsset.b64, lockedAsset._id);

  console.log(`${MODULE_ID} | Art: regenerated (and locked) portrait for ${entityType} ${entity._id}`);
  return lockedAsset;
}


// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter call
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenRouter(prompt, size, entityId, entityType) {
  const apiKey = readOpenRouterKey();
  if (!apiKey) {
    notifyMissingOpenRouterKey();
    return null;
  }

  try {
    const b64 = await generateOpenRouterImage({
      apiKey,
      prompt,
      model: readOpenRouterModel(),
      title: "Starforged Companion - entity portrait",
    });

    if (!b64) {
      console.warn(`${MODULE_ID} | Art: OpenRouter returned no image data.`);
      return null;
    }

    return {
      _id:              generateId(),
      entityId,
      entityType,
      prompt,
      revisedPrompt:    prompt,
      b64,
      size,
      generatedAt:      new Date().toISOString(),
      regenerationUsed: false,
      locked:           false,
      superseded:       false,
    };
  } catch (err) {
    if (err.message?.includes("401") || err.message?.includes("403")) {
      notifyAuthError(err.message);
    } else {
      console.error(`${MODULE_ID} | Art: OpenRouter call failed:`, err.message);
    }
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ENTITY LINKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the generated asset ID back to the entity record. Routes through the
 * entity registry so journal-hosted and (post-migration) actor-hosted entities
 * share one write path.
 */
async function linkPortraitToEntity(journalEntryId, entityType, artAssetId) {
  try {
    const document = getEntityDocument(entityType, journalEntryId);
    if (!document) {
      // The host can legitimately disappear between the OpenRouter call
      // starting and the link write — e.g. seedStarshipActor's fire-and-
      // forget portrait gen running after the user (or a Quench cleanup)
      // deletes the actor. That's a race, not a defect; log at debug so
      // the console isn't littered with warnings on every Quench run.
      console.debug(`${MODULE_ID} | Art: host document gone before portrait link landed: ${entityType} ${journalEntryId}`);
      return;
    }

    const existing = readEntityFlag(entityType, document) ?? {};
    await writeEntityFlag(entityType, document, {
      ...existing,
      portraitId: artAssetId,
      updatedAt:  new Date().toISOString(),
    });

    console.log(`${MODULE_ID} | Art: linked portrait ${artAssetId} to ${entityType} ${journalEntryId}`);
  } catch (err) {
    console.error(`${MODULE_ID} | Art: failed to link portrait to entity:`, err.message);
  }
}

/**
 * Attach a generated portrait to an Actor-hosted entity so the native Actor
 * sheet and its tokens render the art — not just the Entity Panel. The base64
 * journal copy (storeArtAsset) feeds the panel's custom HTML; Foundry document
 * image fields need a real file path, so the bytes are uploaded to the world
 * data dir and `actor.img` / the prototype-token texture point at it (per
 * docs/foundry-reference/foundry-api-reference.md → FilePicker.upload).
 *
 * No-op for journal-hosted entities (connection / faction / creature) — they
 * have no image-bearing document. GM-gated (uploads require GM). Non-blocking:
 * a missing Actor portrait is preferable to a broken seed or narration.
 */
async function attachPortraitToActor(journalEntryId, entityType, b64, assetId) {
  try {
    if (!b64) return;
    if (typeof game !== "undefined" && game?.user && !game.user.isGM) return;

    let document = null;
    try { document = getEntityDocument(entityType, journalEntryId); } catch { document = null; }
    if (!document || document.documentName !== "Actor") return;

    const path = await uploadPortraitImage(b64, `${document.id}-${assetId}.png`);
    if (!path) return;

    await document.update({
      img:                          path,
      "prototypeToken.texture.src": path,
    });
    console.log(`${MODULE_ID} | Art: attached portrait to Actor ${document.id} (${path})`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Art: attachPortraitToActor failed:`, err?.message ?? err);
  }
}

/**
 * Upload a base64 PNG to the world data dir and return its path. Mirrors the
 * sector-art / audio-cache upload pattern. Prefers the upload response's
 * `path` (The Forge stores uploads in the Assets Library and returns the real
 * URL there — the constructed local path 404s on Forge; see AUDIO-002).
 *
 * @returns {Promise<string|null>}
 */
async function uploadPortraitImage(b64, filename) {
  try {
    const worldId   = globalThis.game?.world?.id ?? "world";
    const uploadDir = `worlds/${worldId}/art`;
    const FP = foundry.applications.apps.FilePicker.implementation;

    try {
      await FP.createDirectory("data", uploadDir, {});
    } catch (err) {
      const msg = err?.message ?? String(err);
      if (!/exists/i.test(msg)) {
        console.warn(`${MODULE_ID} | Art: createDirectory(${uploadDir}) failed:`, err);
      }
    }

    const byteString = atob(b64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    const file = new File([blob], filename, { type: "image/png" });

    const response = await FP.upload("data", uploadDir, file, {}, { notify: false });
    return response?.path ?? `${uploadDir}/${filename}`;
  } catch (err) {
    console.warn(`${MODULE_ID} | Art: portrait upload failed:`, err?.message ?? err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readOpenRouterKey() {
  try {
    return game.settings.get(MODULE_ID, "openRouterApiKey") ?? null;
  } catch {
    return null;
  }
}

function readOpenRouterModel() {
  try {
    return game.settings.get(MODULE_ID, "openRouterImageModel") || "black-forest-labs/flux.2-pro";
  } catch {
    return "black-forest-labs/flux.2-pro";
  }
}

function notifyMissingOpenRouterKey() {
  console.warn(`${MODULE_ID} | Art: no OpenRouter API key configured`);
  if (typeof ui !== "undefined") {
    ui.notifications?.warn(
      "Starforged Companion: No OpenRouter API key is configured. " +
      "Add your key in Companion Settings → About to enable portrait generation."
    );
  }
}

function notifyAuthError(code) {
  console.error(`${MODULE_ID} | Art: OpenRouter auth/billing error: ${code}`);
  if (typeof ui !== "undefined") {
    ui.notifications?.error(
      `Starforged Companion: OpenRouter API error (${code}). ` +
      "Check your API key and account balance in module settings.",
      { permanent: true }
    );
  }
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
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
