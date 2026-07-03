/**
 * STARFORGED COMPANION
 * src/private-channel/context.js — context packet for a private-channel turn
 *
 * Mirrors the main narrator's prompt assembly, but for a private, no-move
 * conversation (issue #226 (Private Channel) §4). The cacheable prefix
 * (SAFETY + ROLE + WORLD TRUTHS + CHARACTER) is stable within a session; the
 * volatile tail (scene context + transcript + player message) changes every
 * turn. Returns { system, user, cacheBreakpoint } — `system` is the cacheable
 * block and `cacheBreakpoint` is its length, the boundary the API caller marks
 * with cache_control.
 *
 * Reuses the shared builders rather than re-deriving: formatSafetyContext
 * (src/context/safety.js), buildCampaignTruthsBlock (src/system/campaignTruths.js),
 * getActiveCharacter + getRecentNarrationContext (src/narration/narrator.js).
 */

import { formatSafetyContext } from "../context/safety.js";
import { buildCampaignTruthsBlock } from "../system/campaignTruths.js";
import { getActiveCharacter, getRecentNarrationContext } from "../narration/narrator.js";

const ROLE = [
  "## ROLE",
  "",
  "You are the narrator running a private channel session. The player has",
  "stepped aside from main play to think, reflect, or ask you something",
  "privately. Respond conversationally. Do NOT narrate as if this is the main",
  "scene. Do NOT resolve moves or mechanical changes.",
].join("\n");

function formatCharacterBlock(character) {
  // getActiveCharacter now returns the full snapshot (CHAR-PC-BLOCK-STARVED
  // fix) — render the identity fields directly. The old `description` field
  // never existed on the vendor schema, and narratorNotes no longer falls
  // back to biography, so biography renders on its own line here.
  const idBits = [];
  if (character.callsign) idBits.push(`"${character.callsign}"`);
  if (character.pronouns) idBits.push(character.pronouns);
  const lines = [
    "## CHARACTER", "",
    `Name: ${character.name ?? "Unknown"}${idBits.length ? ` (${idBits.join(", ")})` : ""}`,
  ];
  if (character.description) lines.push(`Description: ${character.description}`);
  if (character.biography)   lines.push(`Biography: ${character.biography}`);
  const m = character.meters;
  if (m && typeof m === "object") {
    const bits = Object.entries(m)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k} ${v}`);
    if (bits.length) lines.push(`Meters: ${bits.join(", ")}`);
  }
  if (character.narratorNotes) lines.push(`Notes: ${character.narratorNotes}`);
  return lines.join("\n");
}

function formatSceneContext(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? "";
  const beats     = getRecentNarrationContext(sessionId, 3);
  const loc       = campaignState?.currentLocationName
                 ?? campaignState?.currentLocation?.name
                 ?? null;
  const lines = ["## CURRENT SCENE CONTEXT"];
  if (loc) lines.push(`Location: ${loc}`);
  lines.push("", "Recent narration:", beats || "(none yet this session)");
  return lines.join("\n");
}

function formatTranscriptBlock(transcriptTurns) {
  const turns = (Array.isArray(transcriptTurns) ? transcriptTurns : [])
    .filter(t => typeof t === "string" && t.trim());
  if (!turns.length) return "";
  return ["## PRIVATE TRANSCRIPT THIS SESSION", "", ...turns].join("\n");
}

/**
 * Build the private-channel narrator context.
 *
 * @param {object} args
 * @param {object} args.campaignState
 * @param {string} args.userId
 * @param {string} [args.actorId]            — resolved upstream; getActiveCharacter falls back
 * @param {string[]} [args.transcriptTurns]  — verbatim prior turns this session
 * @param {string} args.playerMessage
 * @returns {Promise<{ system: string, user: string, cacheBreakpoint: number }>}
 * @throws if no active character can be resolved
 */
export async function buildPrivateContext({ campaignState, userId, actorId, transcriptTurns, playerMessage }) {
  const character = getActiveCharacter(campaignState, actorId);
  if (!character) throw new Error("Private channel: no active character resolvable");

  const safety = formatSafetyContext(campaignState, null, userId);
  const truths = await buildCampaignTruthsBlock(campaignState);

  const system = [safety, ROLE, truths, formatCharacterBlock(character)]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    formatSceneContext(campaignState),
    formatTranscriptBlock(transcriptTurns),
    `## PLAYER MESSAGE\n\n${playerMessage ?? ""}`,
  ].filter(Boolean).join("\n\n");

  return { system, user, cacheBreakpoint: system.length };
}
