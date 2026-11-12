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
 *   5. Generated on a GM's client only — the only one that can store it
 *      (canKeepPortrait; issue #321 U33)
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

import { buildPrompt, buildRegenerationPrompt, buildNeutralPortraitPrompt } from "./promptBuilder.js";
import { storeArtAsset, loadArtAsset, findEntityPortrait } from "./storage.js";
import { generateOpenRouterImage }                from "./openRouterImage.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "../entities/registry.js";
import { uploadedPath, withFilePickerDeadline } from "../net/uploadResult.js";
import { PORTRAIT_BLOCK_RE } from "./notesPortrait.js";

const MODULE_ID = "starforged-companion";

// This client's first-portrait generations in flight, by entity
// (`<type>:<host id>` → the generation's promise): one image at a time per
// entity, claimed before the image call and released in a `finally`
// (known-issues PORTRAIT-LATE-FIRST-GENERATION).
const _portraitsInFlight = new Map();


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
  if (!canKeepPortrait()) return null;
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
    if (existing) {
      // Only regeneratePortrait replaces a portrait — the caller must ask for
      // it. One whose regeneration is claimed (`regenerationUsed` while its
      // image is out, or once a regenerated portrait's record write was
      // refused) stays the entity's: generating past it billed the portrait
      // the one regeneration had spent (known-issues
      // REGEN-LINK-REFUSED-SECOND-REGEN).
      console.log(`${MODULE_ID} | Art: portrait exists for ${entity._id} — use regeneratePortrait() to replace`);
      return existing;
    }
  }

  // One image at a time per entity on this client (known-issues
  // PORTRAIT-LATE-FIRST-GENERATION): a second generation while one is out —
  // the Entities panel's Generate pressed while a new card's seed is making
  // its portrait — waits for it and gets its portrait. Each bought an image,
  // and the later link won.
  const slot = `${entityType}:${journalEntryId}`;
  const inFlight = _portraitsInFlight.get(slot);
  if (inFlight) {
    console.debug(`${MODULE_ID} | Art: a portrait for ${entityType} ${entity._id} is already being made — waiting for it.`);
    return inFlight;
  }
  const run = makeFirstPortrait(journalEntryId, entityType, entity, campaignState);
  _portraitsInFlight.set(slot, run);
  try {
    return await run;
  } finally {
    if (_portraitsInFlight.get(slot) === run) _portraitsInFlight.delete(slot);
  }
}

/** generatePortrait's image call and its writes, once its slot is claimed. */
async function makeFirstPortrait(journalEntryId, entityType, entity, campaignState) {
  // A portrait already made for this entity that no record names — stored,
  // its link refused — is the one to save: no second image is bought (known-
  // issues FIRST-PORTRAIT-LINK-REFUSED; the next press of Generate, the card's
  // seed or a Finalise each bought another).
  const made = findEntityPortrait(entityType, entity._id);
  if (made) {
    if (!getEntityDocument(entityType, journalEntryId)) return null;
    console.debug(`${MODULE_ID} | Art: ${entityType} ${entity._id} has a portrait made but not saved — saving it, no new image.`);
    return linkFirstPortrait(journalEntryId, entityType, entity, made);
  }

  const { prompt, size } = buildPrompt(entityType, entity.portraitSourceDescription, entity);
  const neutralPrompt = buildNeutralPortraitPrompt(entityType, entity).prompt;
  const asset = await callOpenRouter(prompt, size, entity._id, entityType, neutralPrompt);

  if (!asset) return null;
  // The entity may be gone when the image comes back — a connection the
  // X-Card took back with the narration that made it, while the call was out
  // (issue #338 D6(ii); XCARD-LATE-CAPTURE): stored, the portrait would be an
  // Art Cache entry nothing links to.
  const document = getEntityDocument(entityType, journalEntryId);
  if (!document) {
    console.debug(`${MODULE_ID} | Art: ${entityType} ${journalEntryId} was deleted before its portrait came back — not stored.`);
    return null;
  }
  // The record as it stands now: a portrait linked while the image was out —
  // another GM's Generate, perhaps then its one regeneration — is the
  // entity's, and this image is not stored. Linked unchecked, a late first
  // portrait replaced a locked regenerated one with a fresh unlocked one, and
  // Regenerate was offered again (known-issues PORTRAIT-LATE-FIRST-GENERATION).
  const linkedMeanwhile = readEntityFlag(entityType, document)?.portraitId ?? null;
  if (linkedMeanwhile && linkedMeanwhile !== (entity.portraitId ?? null)) {
    console.debug(`${MODULE_ID} | Art: ${entityType} ${entity._id} was given a portrait while this one was being made — it stands; this image is not stored.`);
    return (await loadArtAsset(linkedMeanwhile)) ?? null;
  }

  await storeArtAsset(asset, campaignState);
  return linkFirstPortrait(journalEntryId, entityType, entity, asset);
}

/**
 * Link a stored first portrait to its entity's record, and put it on the
 * Actor only once the record names it. A refused link leaves the Actor as it
 * was and tells the GM; the stored portrait is the one the next generation
 * links (known-issues FIRST-PORTRAIT-LINK-REFUSED — the card and its token
 * showed a portrait the record did not name, "Portrait generated" was said,
 * and Generate was offered, and billed, again).
 *
 * @returns {Promise<ArtAsset|null>} the portrait, once the record names it
 */
async function linkFirstPortrait(journalEntryId, entityType, entity, asset) {
  if (!(await linkPortraitToEntity(journalEntryId, entityType, asset._id))) {
    // A host gone meanwhile is not the world refusing a save.
    if (getEntityDocument(entityType, journalEntryId) && typeof ui !== "undefined") {
      ui.notifications?.warn(`Starforged Companion: The portrait for ${entity.name ?? "this entity"} could not be saved — the world refused it. Generate portrait saves it again, without making a new image.`);
    }
    return null;
  }
  await attachPortraitToActor(journalEntryId, entityType, asset.b64, asset._id);

  console.log(`${MODULE_ID} | Art: generated portrait for ${entityType} ${entity._id}`);
  return asset;
}

/**
 * Regenerate a portrait — the one permitted second attempt.
 * Only callable if: portrait exists, regeneration not yet used, not locked.
 *
 * The regeneration is claimed before its image is bought (known-issues
 * REGEN-LINK-REFUSED-SECOND-REGEN): the portrait the record names is marked
 * `regenerationUsed`, so a second press — another GM's included — finds it
 * spent, and only an image that could not be made gives it back. It used to
 * be marked only by the new portrait, once linked: a refused link left the
 * record on a portrait that carried no sign of it, and Regenerate was offered
 * — and billed — again. A regenerated portrait the world did not save (its
 * store or its record write refused) spends it: the earlier portrait stays
 * the entity's, locked, and the GM is told.
 *
 * @param {string} journalEntryId
 * @param {string} entityType
 * @param {Object} entity
 * @param {Object} campaignState
 * @returns {Promise<ArtAsset|null>} the new portrait, once the record names it
 */
export async function regeneratePortrait(journalEntryId, entityType, entity, campaignState) {
  if (!canKeepPortrait()) return null;
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

  // The claim — before anything is billed.
  const claimed = existing ? { ...existing, regenerationUsed: true } : null;
  if (claimed) {
    try {
      await storeArtAsset(claimed, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | Art: the regeneration could not be claimed for ${entity._id} — nothing was generated:`, err?.message ?? err);
      return null;
    }
  }

  const { prompt, size } = buildRegenerationPrompt(entityType, entity.portraitSourceDescription, entity);
  const neutralPrompt = buildNeutralPortraitPrompt(entityType, entity).prompt;
  const asset = await callOpenRouter(prompt, size, entity._id, entityType, neutralPrompt);

  if (!asset) {
    await releaseRegeneration(claimed, campaignState);
    return null;
  }

  const lockedAsset = { ...asset, regenerationUsed: true, locked: true };
  let linked = false;
  try {
    await storeArtAsset(lockedAsset, campaignState);
    linked = await linkPortraitToEntity(journalEntryId, entityType, lockedAsset._id);
  } catch (err) {
    console.warn(`${MODULE_ID} | Art: the regenerated portrait for ${entity._id} could not be stored:`, err?.message ?? err);
  }
  if (!linked) {
    await keepRegenerationSpent(claimed, entity, campaignState);
    return null;
  }

  // The earlier portrait is superseded only once the record names the new
  // one — as it stands now (another GM's press may have locked it meanwhile).
  if (claimed) {
    const current = (await loadArtAsset(claimed._id)) ?? claimed;
    await storeArtAsset({ ...current, superseded: true }, campaignState).catch(err =>
      console.warn(`${MODULE_ID} | Art: marking the earlier portrait of ${entity._id} superseded failed:`, err?.message ?? err));
  }
  await attachPortraitToActor(journalEntryId, entityType, lockedAsset.b64, lockedAsset._id);

  console.log(`${MODULE_ID} | Art: regenerated (and locked) portrait for ${entityType} ${entity._id}`);
  return lockedAsset;
}

/**
 * An image that could not be made gives the claimed regeneration back: the
 * portrait the record names is as it was before the claim — unlocked too, as
 * it was then (a second GM's press during the call, reading the claim as
 * spent, locks it). A refused write leaves the regeneration spent, logged.
 *
 * @param {ArtAsset|null} claimed
 * @param {Object} campaignState
 */
async function releaseRegeneration(claimed, campaignState) {
  if (!claimed) return;
  const current = (await loadArtAsset(claimed._id)) ?? claimed;
  await storeArtAsset({ ...current, regenerationUsed: false, locked: false }, campaignState).catch(err =>
    console.warn(`${MODULE_ID} | Art: giving the regeneration of ${claimed.entityId ?? "?"} back failed — it stays spent:`, err?.message ?? err));
}

/**
 * A regenerated portrait the world did not save — its store or its record
 * write refused: the image was bought, so the one regeneration is spent. The
 * earlier portrait stays the entity's, locked, as a regenerated one is, and
 * the GM is told.
 *
 * @param {ArtAsset|null} claimed
 * @param {Object} entity
 * @param {Object} campaignState
 */
async function keepRegenerationSpent(claimed, entity, campaignState) {
  if (claimed) {
    const current = (await loadArtAsset(claimed._id)) ?? claimed;
    await storeArtAsset({ ...current, regenerationUsed: true, locked: true }, campaignState).catch(err =>
      console.warn(`${MODULE_ID} | Art: locking the earlier portrait of ${entity._id} failed — its regeneration stays spent:`, err?.message ?? err));
  }
  if (typeof ui !== "undefined") {
    ui.notifications?.warn(`Starforged Companion: The regenerated portrait for ${entity.name ?? "this entity"} could not be saved — the world refused it. The earlier portrait stays, now locked: the one regeneration is spent.`);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter call
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenRouter(prompt, size, entityId, entityType, fallbackPrompt = null) {
  const apiKey = readOpenRouterKey();
  if (!apiKey) {
    notifyMissingOpenRouterKey();
    return null;
  }

  const model = readOpenRouterModel();
  let usedPrompt = prompt;
  let b64;

  try {
    b64 = await generateOpenRouterImage({
      apiKey, prompt, model,
      title: "Starforged Companion - entity portrait",
    });
  } catch (err) {
    if (err.message?.includes("401") || err.message?.includes("403")) {
      notifyAuthError(err.message);
      return null;
    }

    // Content-moderation refusal — the image provider flagged the prompt
    // (e.g. Black Forest Labs returns status "Content Moderated" in the 400
    // body). The narrator scene description is the usual trigger; retry once
    // with a neutral, card-only prompt that drops it. (Playtest finding #3.)
    const moderated = /content moderated|moderation/i.test(err.message ?? "");
    if (moderated && fallbackPrompt && fallbackPrompt !== prompt) {
      console.warn(`${MODULE_ID} | Art: prompt was content-moderated; retrying with a neutral portrait prompt.`);
      try {
        b64 = await generateOpenRouterImage({
          apiKey, prompt: fallbackPrompt, model,
          title: "Starforged Companion - entity portrait",
        });
        usedPrompt = fallbackPrompt;
      } catch (err2) {
        console.error(`${MODULE_ID} | Art: neutral-prompt retry failed:`, err2.message);
        if (/content moderated|moderation/i.test(err2.message ?? "")) notifyModeration(entityType);
        return null;
      }
    } else {
      if (moderated) notifyModeration(entityType);
      else console.error(`${MODULE_ID} | Art: OpenRouter call failed:`, err.message);
      return null;
    }
  }

  if (!b64) {
    console.warn(`${MODULE_ID} | Art: OpenRouter returned no image data.`);
    return null;
  }

  return {
    _id:              generateId(),
    entityId,
    entityType,
    prompt:           usedPrompt,
    revisedPrompt:    usedPrompt,
    b64,
    size,
    generatedAt:      new Date().toISOString(),
    regenerationUsed: false,
    locked:           false,
    superseded:       false,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// ENTITY LINKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the generated asset ID back to the entity record. Routes through the
 * entity registry so journal-hosted and (post-migration) actor-hosted entities
 * share one write path. Reports whether the record names the portrait now —
 * a regeneration whose link was refused spends its regeneration on the
 * earlier portrait (regeneratePortrait); the refusal used to be logged only.
 *
 * @returns {Promise<boolean>}
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
      return false;
    }

    const existing = readEntityFlag(entityType, document) ?? {};
    await writeEntityFlag(entityType, document, {
      ...existing,
      portraitId: artAssetId,
      updatedAt:  new Date().toISOString(),
    });

    console.log(`${MODULE_ID} | Art: linked portrait ${artAssetId} to ${entityType} ${journalEntryId}`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Art: failed to link portrait to entity:`, err.message);
    return false;
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
 * No-op for journal-hosted entities (faction / creature) — they have no
 * image-bearing document. GM-gated (uploads require GM). Non-blocking:
 * a missing Actor portrait is preferable to a broken seed or narration.
 */
/**
 * Embed (or replace) a portrait image block at the top of a starship's Notes
 * HTML (F5). Wrapped in a marker div so it can be swapped on regeneration
 * without duplicating, and so it's stripped cleanly before re-adding.
 *
 * @param {string} notesHtml  existing system.notes
 * @param {string} imgPath    uploaded image path / URL
 * @returns {string}
 */
export function withPortraitInNotes(notesHtml, imgPath) {
  const existing = String(notesHtml ?? "");
  // Remove any prior companion art block (idempotent on regeneration).
  const stripped = existing.replace(PORTRAIT_BLOCK_RE, "").trimStart();
  if (!imgPath) return stripped;
  const block =
    `<div class="sf-ship-portrait" style="text-align:center;margin-bottom:0.5em;">` +
    `<img src="${imgPath}" alt="Ship portrait" style="max-width:100%;border-radius:6px;"/>` +
    `</div>`;
  return block + stripped;
}

async function attachPortraitToActor(journalEntryId, entityType, b64, assetId) {
  try {
    if (!b64) return;
    if (typeof game !== "undefined" && game?.user && !game.user.isGM) return;

    let document = null;
    try { document = getEntityDocument(entityType, journalEntryId); } catch { document = null; }
    if (!document || document.documentName !== "Actor") return;

    const path = await uploadPortraitImage(b64, `${document.id}-${assetId}.png`);
    if (!path) return;

    const update = {
      img:                          path,
      "prototypeToken.texture.src": path,
    };

    // Mirror the portrait into the Notes tab: the sheet's header icon is small,
    // so embed a larger copy at the top of the notes HTML. Idempotent — replace
    // any prior companion art block rather than stacking. Starships and
    // connection NPC-cards both have a meaningful Notes tab.
    if (entityType === "ship" || entityType === "connection") {
      const notes = String(document.system?.notes ?? "");
      update["system.notes"] = withPortraitInNotes(notes, path);
    }

    await document.update(update);
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
      await withFilePickerDeadline(FP.createDirectory("data", uploadDir, {}), { label: "Art: creating the art folder" });
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

    // Bounded: an upload the server never answers is a failed upload — the
    // portrait stays in its Art Cache journal, unattached (issue #347 AB02).
    const response = await withFilePickerDeadline(FP.upload("data", uploadDir, file, {}, { notify: false }),
      { label: "Portrait upload" });
    return uploadedPath(response, `${uploadDir}/${filename}`);   // null when it failed (issue #322 V26)
  } catch (err) {
    console.warn(`${MODULE_ID} | Art: portrait upload failed:`, err?.message ?? err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether this client can keep a portrait it generates. Storing one creates
 * an art journal entry and registers it in the world art index
 * (campaignState), linking it writes the entity's host document, attaching it
 * uploads the image — all GM-only. So a portrait is generated only on a GM's
 * client, before anything is billed: a player's click used to pay for the
 * image with their own key and then lose it at the refused store (issue #321
 * U33). Logged, not toasted — the automatic portrait triggers are silent by
 * design, and the Entities panel shows its portrait buttons to GMs only.
 *
 * @returns {boolean}
 */
function canKeepPortrait() {
  if (globalThis.game?.user?.isGM) return true;
  console.warn(`${MODULE_ID} | Art: portraits are generated on a GM's client — nothing was generated here.`);
  return false;
}

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

function notifyModeration(entityType) {
  console.warn(`${MODULE_ID} | Art: portrait blocked by image-provider content moderation (${entityType ?? "entity"}).`);
  if (typeof ui !== "undefined") {
    ui.notifications?.warn(
      "Starforged Companion: The portrait was blocked by the image provider's content filter, " +
      "even after softening the prompt. The entity is fine — only its art was skipped. " +
      "You can retry from the Entities panel once the surrounding fiction is less graphic."
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
