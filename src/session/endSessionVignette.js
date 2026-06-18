/**
 * STARFORGED COMPANION
 * src/session/endSessionVignette.js — End Session closing vignette.
 *
 * Renders a short atmospheric prose card featuring an NPC currently
 * important to the campaign — a bonded connection, a recurring threat,
 * a faction figurehead — caught doing something trivial and mundane.
 * The cosmic threat eating a sandwich; the bonded ally watering
 * houseplants. Specific, small, almost tender.
 *
 * NPC selection priority (highest first):
 *   1. A bonded connection (Forge a Bond completed — most personal)
 *   2. An active non-bonded connection with rank >= dangerous
 *   3. An active threat from the World Journal (named NPC variants)
 *   4. Any active non-bonded connection
 *   5. Active sector's trouble (generic adversarial framing)
 *   6. Fallback: "a familiar adversary you can't quite name"
 *
 * Reuses the `session_vignette` narrator mode (see narratorPrompt.js
 * ROLE_DESCRIPTIONS) with the user-message FLAVOUR set to END so the
 * tone leans wry-observed rather than the absurd-banter of the begin-
 * session galley vignette.
 */

import { listConnections } from "../entities/connection.js";
import { getActiveThreats } from "../world/worldJournal.js";
import { stripMarkup } from "../audio/segments.js";

const MODULE_ID = "starforged-companion";

/**
 * Pick the best NPC to feature in the end-session vignette. Returns a
 * `{ kind, name, hint }` triple where `kind` is one of
 * `bonded_connection` | `connection` | `threat` | `sector_trouble` |
 * `fallback`, `name` is the displayable NPC name, and `hint` is one or
 * two sentences of context the narrator can lean on.
 *
 * @param {Object} campaignState
 * @returns {{ kind: string, name: string, hint: string }}
 */
export function selectEndSessionNPC(campaignState) {
  // 1. Bonded connection
  let connections = [];
  try { connections = listConnections(campaignState ?? {}); } catch { connections = []; }

  const bonded = connections.find(c => c?.bonded === true);
  if (bonded?.name) {
    return {
      kind: "bonded_connection",
      name: bonded.name,
      hint: composeConnectionHint(bonded),
    };
  }

  // 2. Active non-bonded connection at rank >= dangerous
  const RANK_WEIGHT = { troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5 };
  const activeConnections = connections
    .filter(c => c?.active !== false && c?.name)
    .sort((a, b) => (RANK_WEIGHT[b?.rank] ?? 0) - (RANK_WEIGHT[a?.rank] ?? 0));

  const significant = activeConnections.find(c => (RANK_WEIGHT[c?.rank] ?? 0) >= 2);
  if (significant) {
    return {
      kind: "connection",
      name: significant.name,
      hint: composeConnectionHint(significant),
    };
  }

  // 3. Active threat from the World Journal
  let threats = [];
  try { threats = getActiveThreats(campaignState ?? {}) ?? []; } catch { threats = []; }
  const threatWithName = threats.find(t => t?.name?.trim());
  if (threatWithName) {
    return {
      kind: "threat",
      name: threatWithName.name,
      hint: (threatWithName.summary ?? "").slice(0, 200),
    };
  }

  // 4. Any active connection at all
  const anyConnection = activeConnections[0];
  if (anyConnection) {
    return {
      kind: "connection",
      name: anyConnection.name,
      hint: composeConnectionHint(anyConnection),
    };
  }

  // 5. Active sector's trouble (generic)
  const sector = (campaignState?.sectors ?? []).find?.(s => s?.id === campaignState?.activeSectorId);
  if (sector?.trouble) {
    return {
      kind: "sector_trouble",
      name: `the architect of ${sector.name ?? "this trouble"}`,
      hint: sector.trouble,
    };
  }

  // 6. Fallback
  return {
    kind: "fallback",
    name: "a familiar adversary you can't quite name",
    hint: "an antagonist who has shadowed the crew across the recent past",
  };
}

function composeConnectionHint(c) {
  // Pronouns lead the hint (finding R): the vignette runs in the
  // session_vignette narrator mode, which injects no entity cards, so the
  // user-message hint is the narrator's only source for the NPC's established
  // gender. Placing it first guarantees it survives the 220-char truncation.
  const pron  = c.pronouns    ? `Pronouns: ${c.pronouns}` : "";
  const role  = c.role        ? `Role: ${c.role}` : "";
  const motiv = c.motivation  ? `Motivation: ${c.motivation}` : "";
  const desc  = c.description ? c.description : "";
  return [pron, role, motiv, desc].filter(Boolean).join(" · ").slice(0, 220);
}

/**
 * Build the user-message body for the End Session vignette narrator
 * call. The FLAVOUR marker tells the narrator (per
 * narratorPrompt.js's `session_vignette` mode) to use the wry-observed
 * slice-of-life tone rather than the begin-session galley tone.
 *
 * @param {{ kind, name, hint }} npc
 * @param {Object} campaignState
 * @returns {string}
 */
export function buildEndSessionVignetteUserMessage(npc, campaignState) {
  const sectorName = campaignState?.sectors?.find?.(s => s?.id === campaignState?.activeSectorId)?.name
                 ?? "an unspecified sector";

  const npcLine = npc.kind === "fallback"
    ? `Featured NPC: ${npc.name}.`
    : `Featured NPC (${npc.kind}): ${npc.name}.${npc.hint ? ` Context: ${npc.hint}` : ""}`;

  return [
    "CLOSING VIGNETTE — end-session NPC slice-of-life.",
    "",
    "FLAVOUR: END.",
    "",
    npcLine,
    `Ship's sector when the session ended: ${sectorName}.`,
    "",
    "Render a 3-5 sentence closing vignette set somewhere the players are NOT.",
    "The featured NPC is doing something trivial and mundane — eating, tidying,",
    "watering a plant, fiddling with a small repair, reading the same page",
    "for the third time, queueing for fuel. Specific. Small. Almost tender.",
    "The audience knows what this NPC means to the campaign; the prose does",
    "not need to remind them. Show the cosmic threat or significant connection",
    "as an ordinary person finishing an ordinary minute, while the players'",
    "ship is somewhere else entirely.",
    "",
    "End on a small private gesture — a shrug, a half-smile, switching a light",
    "off, looking out a window — that closes the session without underlining.",
    "Do not describe a move, do not propose a mechanical action.",
  ].join("\n");
}

/**
 * Post the End Session vignette card. Sentinel flag `sessionVignetteCard`
 * is the cross-cutting marker; `vignetteKind` distinguishes end-of-
 * session variants from the begin-of-session galley card.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string} args.npcName
 * @param {string|null} [args.sessionId]
 */
export async function postEndSessionVignetteCard({ text, npcName, sessionId = null }) {
  await globalThis.ChatMessage?.create?.({
    content:
      `<div class="sf-session-vignette-card"><strong>Closing — ${escapeHtml(npcName)}</strong>` +
      `<p class="sf-narration-prose">${escapeHtml(stripMarkup(text))}</p>` +
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div></div>`,
    // narratorCard + narrationText bring the card into the audio render path.
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        "npc_end",
        sessionId:           sessionId ?? "",
        narratorCard:        true,
        narrationText:       text,
      },
    },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
