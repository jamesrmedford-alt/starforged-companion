/**
 * STARFORGED COMPANION
 * src/art/portraitRouting.js — a new card's automatic portrait, made where an
 * OpenRouter key lives
 *
 * The Auto-Seed hooks' seeds (seedConnectionActor / seedStarshipActor) and a
 * creation's enrichment (entityExtractor.postCreationEnrichment) run on the
 * canonical GM, which is chosen by the Claude key. At a two-GM table where
 * only the non-canonical GM held an OpenRouter key, a new card got no
 * automatic portrait (known-issues AUTOSEED-KEYLESS-CANONICAL). Issue #342
 * Z67 fixed the same shape for the ElevenLabs key; this follows it: each GM
 * advertises its OpenRouter key in `artKeyedGmUserIds` (gmGate
 * advertiseOpenRouterKeyPresence), and a keyless client asks the art GM
 * (gmGate.isArtGM — the lowest-id active GM listed) over the module socket.
 * The art GM reads the record itself and calls generatePortrait, whose
 * policy (one first portrait, claimed on the record) bounds what it makes.
 */

import { generatePortrait } from "./generator.js";
import { getEntityDocument, readEntityFlag, withSheetNotes } from "../entities/registry.js";
import { isArtGM, hasArtKeyedActiveGM } from "../multiplayer/gmGate.js";

const MODULE_ID = "starforged-companion";

/** The module socket the portrait request travels on. */
const ART_SOCKET_NAME = `module.${MODULE_ID}`;
const PORTRAIT_REQUEST = "art.portrait.request";

// The entity types a seed or a creation's enrichment makes a portrait for.
const SEEDED_PORTRAIT_TYPES = new Set(["connection", "ship", "settlement", "planet", "location", "faction", "creature"]);

/** Does this client hold an OpenRouter key (blank is none — gmGate's rule)? */
function hasOwnOpenRouterKey() {
  let key = null;
  try { key = globalThis.game?.settings?.get(MODULE_ID, "openRouterApiKey"); }
  catch { key = null; }
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * A new card's automatic portrait, made where an OpenRouter key lives: on
 * this client when it holds one (generatePortrait), else asked of the art GM
 * over the module socket. With no keyed GM anywhere nothing is asked — as
 * before, silently.
 *
 * @param {string} hostId
 * @param {string} entityType
 * @param {Object} entity
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} the portrait when made here; null when asked of another GM or not made
 */
export async function generatePortraitWhereKeyLives(hostId, entityType, entity, campaignState) {
  if (hasOwnOpenRouterKey()) return generatePortrait(hostId, entityType, entity, campaignState);
  if (!entity?.portraitSourceDescription || !hasArtKeyedActiveGM() || isArtGM()) return null;
  try {
    globalThis.game?.socket?.emit?.(ART_SOCKET_NAME, { kind: PORTRAIT_REQUEST, entityType, hostId });
    console.debug(`${MODULE_ID} | Art: no OpenRouter key here — the portrait for ${entityType} ${hostId} is asked of the GM who holds one.`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Art: asking the keyed GM for a portrait failed:`, err?.message ?? err);
  }
  return null;
}

/** Register the art GM's listener for portraits a keyless client asks of it. Called once on `ready`. */
export function registerArtSocket() {
  if (!globalThis.game?.socket?.on) return;
  game.socket.on(ART_SOCKET_NAME, (payload) => {
    if (payload?.kind !== PORTRAIT_REQUEST) return undefined;
    return handlePortraitRequest(payload).catch(err =>
      console.warn(`${MODULE_ID} | Art: a requested portrait failed:`, err?.message ?? err));
  });
}

/**
 * The art GM: make the first portrait a keyless client's seed asked for. A
 * relayed payload is bounded to what the sender could honestly ask
 * (rules/reachability.md §8): an entity in the world, of a type a seed makes
 * portraits for, with a source description and no portrait — the one first
 * portrait this GM's own Generate would make; the generator's policy (one
 * first portrait, its claim) bounds a forged ask to that. The record is read
 * here, as it stands, never taken from the payload.
 */
async function handlePortraitRequest(payload) {
  if (!isArtGM() || !hasOwnOpenRouterKey()) return;
  const entityType = typeof payload.entityType === "string" ? payload.entityType : "";
  const hostId     = typeof payload.hostId === "string" ? payload.hostId : "";
  if (!SEEDED_PORTRAIT_TYPES.has(entityType) || !hostId) return;
  const document = getEntityDocument(entityType, hostId);
  if (!document) return;
  const record = withSheetNotes(entityType, document, readEntityFlag(entityType, document));
  if (!record?.portraitSourceDescription || record.portraitId) return;
  const campaignState = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
  await generatePortrait(hostId, entityType, record, campaignState);
}
