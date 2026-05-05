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
 * Pure — no Foundry API calls. Exported for testing.
 *
 * @param {Object} actor — a foundry-ironsworn foe Actor (or shaped fixture)
 * @returns {string}
 */
export function buildEncounterCard(actor) {
  if (!actor) return "<p><em>Encounter not found.</em></p>";
  const name = actor.name ?? "Unknown";
  const sys  = actor.system ?? {};
  const lines = [`<h3>${escapeHtml(name)}</h3>`];

  const rank = sys.rank ?? sys.Rank;
  if (rank) lines.push(`<p><strong>Rank:</strong> ${escapeHtml(String(rank))}</p>`);

  const description = sys.description ?? sys.Description ?? "";
  if (description) lines.push(`<div class="sf-encounter-desc">${description}</div>`);

  const features = sys.features ?? [];
  if (Array.isArray(features) && features.length) {
    const items = features.map(f => `<li>${escapeHtml(String(f))}</li>`).join("");
    lines.push(`<p><strong>Features:</strong></p><ul>${items}</ul>`);
  }

  const drives = sys.drives ?? [];
  if (Array.isArray(drives) && drives.length) {
    const items = drives.map(d => `<li>${escapeHtml(String(d))}</li>`).join("");
    lines.push(`<p><strong>Drives:</strong></p><ul>${items}</ul>`);
  }

  return lines.join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resolve and (optionally) place an encounter Actor.
 *   GM with an active scene → import the actor and create a token at canvas centre.
 *   Otherwise → post a stat-summary chat card.
 *
 * @param {string} name
 * @returns {Promise<{actor: Object|null, placed: boolean}>}
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
      const tokenData = await canonical.getTokenDocument({
        x: (scene.width ?? 1000) / 2,
        y: (scene.height ?? 1000) / 2,
        hidden: false,
      });
      await scene.createEmbeddedDocuments("Token", [tokenData.toObject?.() ?? tokenData]);
      return { actor: canonical, placed: true };
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
