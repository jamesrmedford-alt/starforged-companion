/**
 * STARFORGED COMPANION
 * src/session/spotlightVignette.js — Begin a Session's spotlight vignette.
 *
 * The move: "you may spotlight a new danger, opportunity, or insight. This
 * can include a scene hidden from your character's perspective. If you do,
 * envision a brief vignette (you may roll or choose on the table below for
 * inspiration). Then, all players take +1 momentum as you return to play from
 * the viewpoint of your characters." The Begin card showed the rolled
 * result, and nothing narrated it: the canonical GM, which writes the
 * session's narrations, was sent a boolean (the long haul's third live run,
 * a2: "External factors create new danger, urgency, or importance for a
 * quest" over a scene of noodles).
 *
 * Now (issue #381 D3) the pressing client sends the d100 alone
 * (`spotlightRoll`), and the canonical GM reads the result off the table
 * itself — a relayed payload cannot put words into a prompt. The vignette is
 * a short cutaway of its own, before the opening: a scene the characters are
 * not in, or a flashback, built from the result and rolled material —
 * whom or what it is about (a die among the campaign's records of the kind
 * the row names, sceneRecords.js), what happens (Action + Theme) and what it
 * looks like (Descriptor + Focus). It may do what an opening may not — a new
 * danger is a new plot element — so it runs at the interaction latitude, and
 * at discovery when its row introduces someone and the campaign has no one
 * to give new detail to; and its capture runs the detection pass, as a clock
 * vignette's does. Its scene is its own and ends with its card
 * (safety/sessionLifecycleDialogs.js), as the closing cutaway's does; the
 * opening then starts the session's scene clean. In the session's memory
 * its card is marked a cutaway (narrator.js ringEntryText), so the beats
 * after it do not have the characters know it.
 */

import { rollOracle } from "../oracles/roller.js";
import { proseToHtml } from "../audio/segments.js";
import { collectGalleyParticipants } from "./galleyVignette.js";
import { connectionsInPlay, namedThreats, sectorSettlements, recordedFactions, openVowsOnRecord, tableClocksOnRecord } from "./sceneRecords.js";
import { drawDie, rollSpotlightSeeds, formatMaterial, seedsForFlags, factBlockWritten } from "./sceneSeeds.js";

const MODULE_ID = "starforged-companion";

/**
 * What a Spotlight Vignette row is about, and the records its die is cast
 * among (src/oracles/tables/sessionVignette.js — the rows, in tens). A row
 * with no records of its kind has no such seed: the two pairs carry it.
 */
const ABOUT_BY_ROW = Object.freeze([
  { max: 10,  label: "Whose background or nature it reveals", pool: "the characters at the table",  sources: ["pcs"] },
  { max: 20,  label: "Whom or what it reveals",               pool: "the campaign's connections, settlements and factions", sources: ["connections", "settlements", "factions"] },
  { max: 30,  label: "Who is given new detail",               pool: "the campaign's factions and connections", sources: ["factions", "connections"], introduce: true },
  { max: 40,  label: "What it shows connected",               pool: "the open vows, threats and clocks", sources: ["vows", "threats", "clocks"], two: true },
  { max: 50,  label: "The quest it touches",                  pool: "the open vows",                sources: ["vows"] },
  { max: 60,  label: "Who is put in danger",                  pool: "the connections in play",      sources: ["connections"] },
  { max: 70,  label: "The place made unsafe",                 pool: "the active sector's settlements", sources: ["settlements"] },
  { max: 80,  label: "Who returns",                           pool: "the threats",                  sources: ["threats"] },
  { max: 90,  label: null,                                    pool: null,                           sources: [] },
  { max: 100, label: "Whose aid it is",                       pool: "the connections and factions", sources: ["connections", "factions"] },
]);

/** The records each source names, as options for the about-seed's die. */
function recordsOf(source, campaignState) {
  switch (source) {
    case "pcs": {
      let active = [];
      try { active = collectGalleyParticipants(campaignState).active ?? []; } catch { active = []; }
      return active.map(p => p?.actor).filter(a => a?.name)
        .map(a => ({ name: String(a.name).trim(), kind: "character", ref: a.id ? `pc:${a.id}` : null }));
    }
    case "connections": return connectionsInPlay(campaignState);
    case "settlements": return sectorSettlements(campaignState);
    case "factions":    return recordedFactions(campaignState);
    case "vows":        return openVowsOnRecord();
    case "threats":     return namedThreats(campaignState);
    case "clocks":      return tableClocksOnRecord(campaignState);
    default:            return [];
  }
}

/** The about-seed's options for a row: its sources' records, one per name. */
function aboutOptions(row, campaignState) {
  const out = [];
  for (const source of row?.sources ?? []) {
    for (const o of recordsOf(source, campaignState)) {
      if (!o?.name || out.some(p => p.name.toLowerCase() === o.name.toLowerCase())) continue;
      out.push({ ...o, weight: 1 });
    }
  }
  return out;
}

/**
 * The spotlight vignette, ready to narrate: its rolled material, its user
 * message and the latitude it runs at. Run once, on the canonical GM, for a
 * scene that will be narrated (safety/sessionLifecycleDialogs.js
 * narrateSpotlightAtBegin): this is where its dice are rolled — the Begin
 * card's d100 is handed in, never rolled again. Null for a roll that is no
 * face of the table's d100.
 *
 * @param {Object} campaignState
 * @param {{ roll: number, draw?: (faces: number) => number }} opts — `roll`: the Begin card's d100
 * @returns {{ userMessage: string, seeds: Object[], result: string, narratorClass: string }|null}
 */
export function composeSpotlightScene(campaignState, { roll, draw = drawDie } = {}) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) return null;
  let rolled = null;
  try {
    rolled = rollOracle("spotlight_vignette", { roll });
  } catch (err) {
    console.warn(`${MODULE_ID} | spotlight vignette: the table could not be read:`, err?.message ?? err);
    return null;
  }
  const result = String(rolled?.result ?? "").trim();
  if (!result || result === "—") return null;
  const row = ABOUT_BY_ROW.find(r => roll <= r.max) ?? null;
  const options = row?.label ? aboutOptions(row, campaignState) : [];
  const seeds = rollSpotlightSeeds({
    roll, tableName: rolled.tableName, result,
    about: options.length ? { label: row.label, pool: row.pool, options, two: row.two === true } : null,
  }, draw);
  // A row that introduces someone, with no one on record to give new detail
  // to, is the discovery latitude: the vignette may name a new figure.
  const introduce = row?.introduce === true && !seeds.some(s => s.slot === "about");
  return {
    userMessage: buildSpotlightVignetteUserMessage(campaignState, { seeds, introduce, account: factBlockWritten() }),
    seeds, result,
    narratorClass: introduce ? "discovery" : "interaction",
  };
}

/**
 * Build the user-message body for the spotlight vignette's narrator call: what
 * it is, its MATERIAL (sceneSeeds.js — the Begin card's result first), how it
 * stops, and its length last. Pure.
 *
 * @param {Object} campaignState
 * @param {{ seeds?: Object[]|null, introduce?: boolean, account?: boolean }} [opts] —
 *   `introduce`: its row introduces someone and the campaign has no one to
 *   give new detail to; `account`: false when the narration writes no fact block
 * @returns {string}
 */
export function buildSpotlightVignetteUserMessage(campaignState, { seeds = null, introduce = false, account = true } = {}) {
  const sectorName = campaignState?.sectors?.find?.(s => s?.id === campaignState?.activeSectorId)?.name
                 ?? "an unspecified sector";
  const material = formatMaterial(seeds, { account, spotlight: true });
  return [
    "SPOTLIGHT VIGNETTE — begin-session.",
    "",
    "FLAVOUR: SPOTLIGHT.",
    "",
    "The Spotlight Vignette the table rolled at Begin a Session, happening: a cutaway or a",
    "flashback — a scene the characters are not in, or a moment of the past — that the table",
    "sees and the characters do not. It brings a new danger, an opportunity or an insight into",
    "play, as its result says.",
    ...(introduce ? ["The figure it introduces is new: no one on record is given this part."] : []),
    `Ship is currently in: ${sectorName}.`,
    ...(material ? ["", material] : []),
    "",
    "It stops before the characters could learn of it: when play returns to them, the first",
    "move is still the players'. Do not describe a move, do not propose a mechanical action.",
    "",
    "Length: three to five sentences, about 90 words — never more than five",
    "sentences. Count them.",
  ].join("\n");
}

/**
 * Post the spotlight vignette's card: the narrator flag family (narrator-memory
 * invariant 1), a kind of its own (`spotlight_begin`), and what it was built
 * from (`builtFrom` — "Rolled for this scene" is rendered from it).
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string|null} [args.sessionId]
 * @param {string|null} [args.narrationId]
 * @param {Object[]|null} [args.seeds]
 */
export async function postSpotlightVignetteCard({ text, sessionId = null, narrationId = null, seeds = null }) {
  const rolled = seedsForFlags(seeds);
  await globalThis.ChatMessage?.create?.({
    content:
      `<div class="sf-session-vignette-card"><strong>Spotlight</strong>` +
      `<p class="sf-narration-prose">${proseToHtml(text)}</p>` +
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div></div>`,
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        "spotlight_begin",
        sessionId:           sessionId ?? "",
        narratorCard:        true,
        narrationText:       text,
        // What an X-Card on this card retracts (issue #321 U07).
        narrationId:         narrationId ?? null,
        ...(rolled.length ? { builtFrom: rolled } : {}),
      },
    },
  });
}
