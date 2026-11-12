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
 * by GM status: a PC is present while the user at the table with it is
 * connected — a player's own PC, or the GM's (one no player has) — see
 * collectGalleyParticipants.
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

import { readCharacterSnapshot, getPlayerActors } from "../character/actorBridge.js";
import { resolveUserActorId } from "../multiplayer/speaker.js";
import { proseToHtml } from "../audio/segments.js";

const MODULE_ID = "starforged-companion";

/**
 * Collect every player character actor, split by connected state. The roster
 * is the canonical PC list (`getPlayerActors`, which excludes NPC/connection
 * cards), NOT the set of users with a `User.character` assignment — a PC actor
 * that no connected user has selected as their character was previously dropped
 * from the vignette entirely (finding B: the second PC was missing). Every PC
 * now appears, present or in the absent list so the banter still references
 * them.
 *
 * A PC is present when a connected user is at the table with it (issue #325
 * W32 — only `User.character` counted, which nothing in the module sets, so a
 * solo GM's own PC was "absent"):
 *   - a connected user has it as their `User.character`;
 *   - it is a connected player's own PC — `resolveUserActorId`, the one
 *     "whose PC is this user?" resolver (User.character, else a PC they own,
 *     else the lone PC of a solo game);
 *   - no player has it (none has it as User.character or owns it): it is the
 *     GM's — a solo game's, or a GM-run PC at a mixed table — and is at the
 *     table while a GM is connected. A GM owns every actor, so ownership
 *     never makes a player's PC the GM's.
 *
 * @param {Object|null} [campaignState] — for resolveUserActorId's solo-play rung
 * @returns {{ active: Array<{ user, actor }>, absent: Array<{ user, actor }> }}
 */
export function collectGalleyParticipants(campaignState = null) {
  const users   = globalThis.game?.users?.contents ?? [];
  const actors  = (() => { try { return getPlayerActors() ?? []; } catch { return []; } })();
  const active  = [];
  const absent  = [];

  const players  = users.filter(u => u && !u.isGM);
  const gmOnline = users.find(u => u?.isGM && u.active === true) ?? null;
  const playerPc = new Map();   // actor id → the connected player at the table with it
  for (const user of players) {
    if (user.active !== true) continue;
    let id = null;
    try {
      id = resolveUserActorId(user, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette: could not resolve ${user.name ?? user.id}'s PC:`, err?.message ?? err);
    }
    if (id && !playerPc.has(id)) playerPc.set(id, user);
  }

  for (const actor of actors) {
    if (!actor) continue;
    const assigned = users.find(u => u?.character?.id === actor.id) ?? null;
    const owner    = players.find(u => u.character?.id === actor.id || ownsActor(actor, u)) ?? null;
    const present  = assigned?.active === true ? assigned
      : playerPc.get(actor.id) ?? (!owner ? gmOnline : null);
    if (present) active.push({ user: present, actor });
    else         absent.push({ user: assigned ?? owner, actor });
  }

  // Fallback: if the PC roster came back empty (unusual config), preserve the
  // old user.character enumeration so we never regress to an empty vignette.
  if (!active.length && !absent.length) {
    for (const user of users) {
      const actor = user?.character;
      if (!actor) continue;
      if (user.active === true) active.push({ user, actor });
      else                      absent.push({ user, actor });
    }
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
    // Absent crewmates are the subject of the banter, so the narrator still
    // needs their pronouns to invent theories without misgendering them
    // (pronoun-propagation cluster, sibling of finding R).
    const pronouns = snap.pronouns ? ` [${snap.pronouns}]` : "";
    // Don't include the full bio for absent players — just enough hook
    // for the active PCs to invent absurd theories about them.
    const trait = (snap.biography ?? "").trim();
    return `- ${snap.name}${callsign}${pronouns}${trait ? ` — ${truncate(trait, 80)}` : ""}`;
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

/** True when `user` owns `actor` (Foundry's permission test, else the ownership map). */
function ownsActor(actor, user) {
  if (typeof actor?.testUserPermission === "function") {
    try {
      return actor.testUserPermission(user, "OWNER") === true;
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette: permission test failed:`, err?.message ?? err);
    }
  }
  return Number(actor?.ownership?.[user?.id]) === 3;
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
export async function postGalleyVignetteCard({ text, kind, sessionId = null, narrationId = null }) {
  await globalThis.ChatMessage?.create?.({
    content:
      `<div class="sf-session-vignette-card"><strong>Opening — Ship's Galley</strong>` +
      `<p class="sf-narration-prose">${proseToHtml(text)}</p>` +
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div></div>`,
    // narratorCard + narrationText bring the card into the audio render path
    // (onChatMessageRender gates on narratorCard; audio synthesises narrationText,
    // which keeps any <npc> markup for voice splitting). The display prose above
    // is already markup-stripped.
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        kind,
        sessionId:           sessionId ?? "",
        narratorCard:        true,
        narrationText:       text,
        // The narration's id (narrateSessionVignette stamped it on its
        // sidecar's ledger entries) — what an X-Card on this card retracts.
        narrationId:         narrationId ?? null,
      },
    },
  });
}

