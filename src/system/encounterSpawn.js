/**
 * STARFORGED COMPANION
 * src/system/encounterSpawn.js — Spawn canonical foundry-ironsworn encounters
 *
 * Phase 7 of the system asset integration scope. Provides the parser and
 * handler for the `!sfc encounter <name>` chat command.
 *
 * GM behaviour: drops a token on the active scene at the canvas centre.
 * Player behaviour: posts a stat-summary chat card visible to all.
 *
 * All operations degrade cleanly when the encounters pack is unavailable —
 * a warning is logged and a notification is shown to the user.
 */

import { getCanonicalEncounterActor } from "./ironswornPacks.js";
import { rankName } from "../schemas.js";

const MODULE_ID = "starforged-companion";
const ENCOUNTER_RE = /^!sfc\s+encounter\s+(.+?)\s*$/i;

/**
 * Parse a chat message content string. Returns the encounter name when the
 * message matches `!sfc encounter <name>`, otherwise null.
 *
 * @param {string} content
 * @returns {string|null}
 */
export function parseEncounterCommand(content) {
  const m = ENCOUNTER_RE.exec(String(content ?? "").trim());
  if (!m) return null;
  const name = m[1].trim();
  return name.length ? name : null;
}

/**
 * Detect whether a chat message is a `!sfc encounter ...` command.
 *
 * @param {{content?: string}} message
 * @returns {boolean}
 */
export function isEncounterCommand(message) {
  return parseEncounterCommand(message?.content) !== null;
}

/**
 * Build a chat-card HTML summary for an encounter Actor. Used by the
 * player path (and as a fallback for the GM path when no scene is active).
 *
 * A foundry-ironsworn foe (FoeModel: `system` is `{ dfid }` only) keeps its
 * challenge rank and its Features / Drives / Tactics text on its embedded
 * `progress` Item. The card read them from `actor.system`, where no foe has
 * them, and came out a bare name (issue #321 U32). The rank is the numeric
 * ChallengeRank, shown by name.
 *
 * Pure — no Foundry API calls. Exported for testing.
 *
 * @param {Object} actor — a foundry-ironsworn foe Actor
 * @returns {string}
 */
export function buildEncounterCard(actor) {
  if (!actor) return "<p><em>Encounter not found.</em></p>";
  const name = actor.name ?? "Unknown";
  const lines = [`<h3>${escapeHtml(name)}</h3>`];

  const progress = foeProgressItem(actor);
  const rank = progress?.system?.rank;
  if (rank !== undefined && rank !== null && rank !== "") {
    const label = rankName(rank);
    lines.push(`<p><strong>Rank:</strong> ${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</p>`);
  }

  // The compendium's own HTML: the Features / Drives / Tactics boxes, then lore.
  const description = progress?.system?.description ?? "";
  if (description) lines.push(`<div class="sf-encounter-desc">${description}</div>`);

  return lines.join("");
}

/** The foe's embedded `progress` Item (its rank and stat text), or null. */
function foeProgressItem(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  return Array.from(items).find(i => i?.type === "progress") ?? null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The world Actor for a compendium encounter: one already imported from that
 * compendium entry (`_stats.compendiumSource`, or the older `flags.core.sourceId`),
 * else a fresh import (`game.actors.importFromCompendium`). A token needs a
 * world Actor: a compendium Actor's getTokenDocument() names its compendium
 * id, which no world Actor has (issue #306 R12).
 *
 * @param {Object} canonical — the compendium Actor
 * @returns {Promise<Object|null>} the world Actor, or null when it could not be imported
 */
async function worldEncounterActor(canonical) {
  const uuid = canonical?.uuid ?? null;
  const imported = uuid
    ? globalThis.game?.actors?.find?.(a =>
      a?._stats?.compendiumSource === uuid || a?.flags?.core?.sourceId === uuid) ?? null
    : null;
  if (imported) return imported;
  const pack = canonical?.compendium ?? globalThis.game?.packs?.get?.(canonical?.pack) ?? null;
  if (!pack || typeof globalThis.game?.actors?.importFromCompendium !== "function") return null;
  return (await globalThis.game.actors.importFromCompendium(pack, canonical.id ?? canonical._id)) ?? null;
}

/**
 * Resolve and (optionally) place an encounter Actor.
 *   GM with an active scene → reuse or import the world Actor and create its
 *   token at canvas centre.
 *   Otherwise → post a stat-summary chat card.
 *
 * @param {string} name
 * @returns {Promise<{actor: Object|null, placed: boolean}>} `actor` is the
 *   world Actor when placed, else the compendium Actor
 */
export async function spawnEncounter(name) {
  const canonical = await getCanonicalEncounterActor(name);
  if (!canonical) {
    try {
      globalThis.ui?.notifications?.warn(
        `Encounter "${name}" not found in foundry-ironsworn encounters compendium.`
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | encounterSpawn: notification failed:`, err);
    }
    return { actor: null, placed: false };
  }

  const isGm = !!globalThis.game?.user?.isGM;
  const scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.active ?? null;

  if (isGm && scene) {
    try {
      const actor = await worldEncounterActor(canonical);
      if (!actor) throw new Error(`"${canonical.name}" could not be imported into the world`);
      const tokenData = await actor.getTokenDocument({
        x: (scene.width ?? 1000) / 2,
        y: (scene.height ?? 1000) / 2,
        hidden: false,
      });
      await scene.createEmbeddedDocuments("Token", [tokenData.toObject?.() ?? tokenData]);
      return { actor, placed: true };
    } catch (err) {
      console.warn(`${MODULE_ID} | encounterSpawn: token placement failed, falling back to chat card:`, err);
    }
  }

  try {
    await globalThis.ChatMessage?.create({
      content: buildEncounterCard(canonical),
      flags:   { [MODULE_ID]: { encounterCard: true, encounterName: canonical.name } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | encounterSpawn: ChatMessage.create failed:`, err);
  }

  return { actor: canonical, placed: false };
}
