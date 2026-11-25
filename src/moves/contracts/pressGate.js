/**
 * STARFORGED COMPANION
 * src/moves/contracts/pressGate.js — the gate for a move a button makes
 *
 * Overhaul 4, "moves as contracts" (design §6.2). Some moves are made by a
 * button, not rolled through the pipeline: a "Which vow?" pick's Reach a
 * Milestone (milestone.pick), a won fight's ⚑ and 🤝 (fightVow.markMilestone,
 * fightVow.deepenBond), a waypoint's 🔭 / 🌀 (waypoint.oracle), the
 * scene-challenge offer's Begin the Scene (sceneChallenge.begin), Enter the
 * Fray's commit (combat.threshold), and a vow or a bond rolled on the system's
 * own sheet (the native payoff hooks) and `!bond`. Each asks the gate
 * (gate.js checkMove, over situation.js readMoveSituation, at the roll stage)
 * before its effect: a refusal changes nothing and is told — to the presser
 * and the GMs on their press (gmRelay refusePress "cannot", with the one line
 * every refusal carries — obligations.js refusalNote), to the GMs for a roll
 * on the sheet (its dice have fallen: no payoff). A GM's press is the GM's
 * word over a soft precondition (D2); a hard one is never passed.
 *
 * The table's own hand is never asked (D7): the Progress Tracks panel's Add,
 * edit and delete, the sheet's own ticks.
 */

import { readMoveSituation } from "../situation.js";
import { checkMove, refusalOf } from "./gate.js";
import { refusalNote } from "./obligations.js";

const MODULE_ID = "starforged-companion";

/**
 * Ask the gate of a button's move, for the PC it is made by; on a refusal,
 * tell it and change nothing.
 *
 * @param {string} moveId
 * @param {{ actorId?: string|null, reading?: Object, ctx?: Object|null, campaignState?: Object|null,
 *   label?: string, sheetRoll?: boolean }} opts — `ctx`: the relay's (a press);
 *   `sheetRoll`: a roll made on the system's sheet (no presser: the GMs are told)
 * @returns {Promise<{ ok: true, note: string|null } | { ok: false, refusal: Object }>}
 */
export async function gatePress(moveId, { actorId = null, reading = {}, ctx = null, campaignState = null, label = "press", sheetRoll = false, alsoTell = [] } = {}) {
  let verdict;
  try {
    const stored = campaignState ?? globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
    const situation = await readMoveSituation(actorId, { campaignState: stored });
    verdict = checkMove(moveId, situation, reading, { stage: "roll", override: ctx?.requesterIsGM === true });
  } catch (err) {
    console.warn(`${MODULE_ID} | ${label}: the move gate could not be asked — the ${moveId} is made:`, err?.message ?? err);
    return { ok: true, note: null };
  }
  if (verdict.ok) return { ok: true, note: verdict.note ?? null };
  const refusal = refusalOf(verdict);
  const note = refusalNote(refusal);
  console.warn(`${MODULE_ID} | ${label}: not made — ${note}`);
  const actor = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (ctx && !sheetRoll) {
    const { refusePress } = await import("../../multiplayer/gmRelay.js");
    refusePress(ctx, "cannot", actor, { note, refusal });
  } else {
    await tellGms(note, refusal, sheetRoll, alsoTell);
  }
  return { ok: false, refusal };
}

/** Whisper the GMs (and `alsoTell` — a command's author) a refusal no press carries: a roll on the sheet, a typed command. Never throws. */
async function tellGms(note, refusal, sheetRoll, alsoTell = []) {
  const gmIds = [...new Set([...Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM).map(u => u.id),
    ...(Array.isArray(alsoTell) ? alsoTell : []).filter(id => typeof id === "string" && id)])];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  try {
    await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-ptp-card"><strong>${sheetRoll ? "No payoff" : "Not rolled"}</strong><p>${esc(note)}${sheetRoll ? " The roll on the sheet stands; the companion paid nothing for it." : " Nothing was rolled."}</p></div>`,
      whisper: gmIds,
      flags: { [MODULE_ID]: { pressRefusedNotice: true,
        cannotMake: { moveId: refusal.moveId, code: refusal.code ?? null, why: refusal.why ?? "", hard: refusal.hard === true } } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | the GMs could not be told a move was not made:`, err?.message ?? err);
  }
}
