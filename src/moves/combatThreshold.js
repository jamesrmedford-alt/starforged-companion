/**
 * STARFORGED COMPANION
 * src/moves/combatThreshold.js — "Enter the Fray, or take a way out" (#241)
 *
 * Combat is a choice, not a forced consequence. When a move's fiction reaches a
 * fight, the pipeline posts this threshold decision card instead of silently
 * creating the combat track: the player picks Enter the Fray (committing to the
 * fight at a narrator-suggested, adjustable rank, optionally linked to the vow
 * it serves, with an objective) or a way out (flee / talk down / buy your way
 * clear). The combat track is created only on Enter the Fray.
 *
 * This module is the pure card builder + constants; the click wiring and the
 * GM-gated track creation live in index.js, where the combat-track/tracker
 * helpers already are.
 */

import { COMBAT_RANKS, normalizeCombatRank } from "./combat.js";

export const WAY_OUT_PROMPT =
  "You look for a way out — slip away, talk them down, or buy your way clear. "
  + "Take the move that fits (Face Danger, Compel, or Secure an Advantage); the "
  + "fight only begins if you choose to Enter the Fray.";

/**
 * The off-ramp moves a way-out click offers, one button each. The narration
 * strings clear isPlayerNarration's 10-char floor and give the interpreter
 * usable fiction when the forced move resolves.
 */
export const WAY_OUT_MOVES = [
  { moveId: "face_danger",         label: "🏃 Slip away (Face Danger)",
    narration: "I look for a way out of this fight — slipping away before it starts." },
  { moveId: "compel",              label: "🗣 Talk them down (Compel)",
    narration: "I look for a way out of this fight — talking them down before iron is drawn." },
  { moveId: "secure_an_advantage", label: "🪙 Buy your way clear (Secure an Advantage)",
    narration: "I look for a way out of this fight — buying my way clear of it." },
];

/**
 * Build the way-out card: the advisory prompt plus one forced-move button per
 * off-ramp, so choosing an exit rolls the move instead of leaving the player
 * to retype it. Pure — no Foundry calls.
 *
 * @returns {string}
 */
export function buildWayOutHtml() {
  const buttons = WAY_OUT_MOVES
    .map(m => `<button type="button" class="entity-btn" data-action="sf-way-out-move" data-move-id="${m.moveId}">${m.label}</button>`)
    .join(" ");
  return `<div class="sf-card sf-way-out"><div class="sf-card-body">`
    + `<p>🚪 <em>${esc(WAY_OUT_PROMPT)}</em></p>`
    + `<p>${buttons}</p>`
    + `</div></div>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build the threshold decision card HTML. Pure — no Foundry calls.
 *
 * @param {{ label?: string, suggestedRank?: string, vowNames?: string[],
 *           position?: ('in_control'|'bad_spot'|null) }} opts
 *   position — Enter the Fray's own outcome position, applied to the track at
 *   creation; shown here so the player sees it before committing.
 * @returns {string}
 */
export function buildCombatThresholdHtml({ label, suggestedRank, vowNames = [], position = null } = {}) {
  const foe  = esc(label || "the enemy");
  const rank = normalizeCombatRank(suggestedRank);
  const rankOpts = COMBAT_RANKS
    .map(r => `<option value="${r}"${r === rank ? " selected" : ""}>${r}</option>`)
    .join("");
  const vowOpts = ['<option value="">(not tied to a vow)</option>']
    .concat((vowNames ?? []).filter(Boolean).map(n => `<option value="${esc(n)}">${esc(n)}</option>`))
    .join("");
  const positionLine = position === "in_control"
    ? `<p>⚑ If you enter this fight, you begin <strong>in control</strong>.</p>`
    : position === "bad_spot"
      ? `<p>⚑ If you enter this fight, you begin <strong>in a bad spot</strong>.</p>`
      : "";
  return `<div class="sf-card sf-combat-threshold" data-suggested-rank="${rank}">`
    + `<div class="sf-card-header">⚔ A fight looms — ${foe}</div>`
    + `<div class="sf-card-body">`
    + `<p>Commit to the fight, or look for a way out. The narrator suggests this is a <strong>${rank}</strong> fight.</p>`
    + positionLine
    + `<p><label>Difficulty: <select class="sf-threshold-rank">${rankOpts}</select></label></p>`
    + `<p><label>This fight serves: <select class="sf-threshold-vow">${vowOpts}</select></label></p>`
    + `<p><label>Objective: <input type="text" class="sf-threshold-objective" maxlength="120" placeholder="e.g. free the hostages" /></label></p>`
    + `<p>`
    + `<button type="button" class="entity-btn" data-action="sf-enter-fray">⚔ Enter the Fray</button> `
    + `<button type="button" class="entity-btn" data-action="sf-way-out">🚪 Find another way</button>`
    + `</p>`
    + `</div></div>`;
}
