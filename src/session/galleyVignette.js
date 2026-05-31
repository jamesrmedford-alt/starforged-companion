/**
 * STARFORGED COMPANION
 * src/session/galleyVignette.js — Begin Session opening vignette.
 *
 * Renders a short atmospheric prose card describing the active players'
 * characters together in the ship's galley, bantering humorously and
 * absurdly about what the absent crewmates are up to.
 *
 * Player enumeration — important: in this module the GM IS a player
 * (the dominant solo-GM use case has the GM running their own PC).
 * Active vs absent is determined by Foundry's `User.active` flag, NOT
 * by GM status. Both lists include the GM when applicable.
 *
 * Solo-GM mode (only one user, who is the GM): the vignette describes
 * the lone PC in the galley narrating absurd theories about the
 * (always-absent) co-pilot. Same code path, same tone — the absent
 * list just falls back to a generic "the rest of the crew" framing
 * when no other PCs are registered in the world.
 *
 * Tone override: regardless of the configured narrator tone, galley
 * vignettes always render `wry + absurd`. The configured tone resumes
 * for the next narration after the session begins.
 */

import { readCharacterSnapshot } from "../character/actorBridge.js";
import { stripMarkup } from "../audio/segments.js";

const MODULE_ID = "starforged-companion";

/**
 * Collect every Foundry User that has a `User.character` set, split by
 * connected state. The GM is included on both sides — see the file
 * header.
 *
 * @returns {{ active: Array<{ user, actor }>, absent: Array<{ user, actor }> }}
 */
export function collectGalleyParticipants() {
  const users = globalThis.game?.users?.contents ?? [];
  const active = [];
  const absent = [];

  for (const user of users) {
    const actor = user?.character;
    if (!actor) continue;
    if (user.active === true) active.push({ user, actor });
    else                       absent.push({ user, actor });
  }

  return { active, absent };
}

/**
 * Build the user-message body for the galley vignette narrator call.
 * Pulls character names, callsigns, biography snippets, and current-
 * vehicle context via the existing actor-bridge snapshot so any future
 * schema rename (e.g. `system.biography`) tracks automatically.
 *
 * @param {{ active: Array, absent: Array }} participants
 * @param {Object} campaignState
 * @returns {string}
 */
export function buildGalleyVignetteUserMessage(participants, campaignState) {
  const { active, absent } = participants;

  const summariseActor = (actor) => {
    const snap = readCharacterSnapshot(actor);
    if (!snap) return `- ${actor?.name ?? "Unknown"}`;
    const callsign  = snap.callsign ? ` ("${snap.callsign}")` : "";
    const pronouns  = snap.pronouns ? ` [${snap.pronouns}]` : "";
    const bio       = (snap.biography ?? "").trim();
    const bioLine   = bio ? `\n    Bio: ${truncate(bio, 220)}` : "";
    const stats     = snap.stats
      ? `\n    Stats: edge ${snap.stats.edge} · heart ${snap.stats.heart} · iron ${snap.stats.iron} · shadow ${snap.stats.shadow} · wits ${snap.stats.wits}`
      : "";
    return `- ${snap.name}${callsign}${pronouns}${bioLine}${stats}`;
  };

  const summariseAbsent = (actor) => {
    const snap = readCharacterSnapshot(actor);
    if (!snap) return `- ${actor?.name ?? "Unknown"}`;
    const callsign = snap.callsign ? ` ("${snap.callsign}")` : "";
    // Don't include the full bio for absent players — just enough hook
    // for the active PCs to invent absurd theories about them.
    const trait = (snap.biography ?? "").trim();
    return `- ${snap.name}${callsign}${trait ? ` — ${truncate(trait, 80)}` : ""}`;
  };

  const activeList = active.length
    ? active.map(p => summariseActor(p.actor)).join("\n")
    : "- (No active players have a character set on their Foundry user.)";

  const absentList = absent.length
    ? absent.map(p => summariseAbsent(p.actor)).join("\n")
    : "- (No absent crewmates registered — invent generic absurd crew.)";

  const sectorName = campaignState?.sectors?.find?.(s => s?.id === campaignState?.activeSectorId)?.name
                 ?? "an unspecified sector";

  return [
    "OPENING VIGNETTE — begin-session ship's galley.",
    "",
    "Active players (their PCs are physically in the galley together):",
    activeList,
    "",
    "Absent crewmates (referenced in banter, not present):",
    absentList,
    "",
    `Ship is currently in: ${sectorName}.`,
    "",
    "Render a 4-6 sentence opening vignette set in the ship's galley.",
    "The active PCs are eating, drinking, or otherwise hanging out — pick a",
    "specific food/drink that fits their character traits. They banter,",
    "humorously and absurdly, about what each of the absent crewmates is",
    "doing elsewhere on the ship or out in the sector. Be specific and",
    "weird (e.g. 'rewiring her own escape pod from the inside again',",
    "'recalibrating the gravity in the laundry'), but stay anchored to",
    "the PCs' established traits.",
    "",
    "TONE OVERRIDE: regardless of any tone configured elsewhere, this",
    "vignette is WRY + ABSURD. Affectionate ribbing, not sneering.",
    "End on a beat that hands the scene to the players — a line of",
    "dialogue, a question, or a small interruption.",
  ].join("\n");
}

function truncate(s, max) {
  if (typeof s !== "string") return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Post the vignette chat card. Sentinel flag `sessionVignetteCard` is
 * the cross-cutting marker; `vignetteKind` distinguishes begin-session
 * variants from any future ones.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string} args.kind
 * @param {string|null} [args.sessionId]
 */
export async function postGalleyVignetteCard({ text, kind, sessionId = null }) {
  await globalThis.ChatMessage?.create?.({
    content: `<div class="sf-session-vignette-card"><strong>Opening — Ship's Galley</strong><p>${escapeHtml(stripMarkup(text))}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        kind,
        sessionId:           sessionId ?? "",
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
