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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build the threshold decision card HTML. Pure — no Foundry calls.
 *
 * @param {{ label?: string, suggestedRank?: string, vowNames?: string[] }} opts
 * @returns {string}
 */
export function buildCombatThresholdHtml({ label, suggestedRank, vowNames = [] } = {}) {
  const foe  = esc(label || "the enemy");
  const rank = normalizeCombatRank(suggestedRank);
  const rankOpts = COMBAT_RANKS
    .map(r => `<option value="${r}"${r === rank ? " selected" : ""}>${r}</option>`)
    .join("");
  const vowOpts = ['<option value="">(not tied to a vow)</option>']
    .concat((vowNames ?? []).filter(Boolean).map(n => `<option value="${esc(n)}">${esc(n)}</option>`))
    .join("");
  return `<div class="sf-card sf-combat-threshold" data-suggested-rank="${rank}">`
    + `<div class="sf-card-header">⚔ A fight looms — ${foe}</div>`
    + `<div class="sf-card-body">`
    + `<p>Commit to the fight, or look for a way out. The narrator suggests this is a <strong>${rank}</strong> fight.</p>`
    + `<p><label>Difficulty: <select class="sf-threshold-rank">${rankOpts}</select></label></p>`
    + `<p><label>This fight serves: <select class="sf-threshold-vow">${vowOpts}</select></label></p>`
    + `<p><label>Objective: <input type="text" class="sf-threshold-objective" maxlength="120" placeholder="e.g. free the hostages" /></label></p>`
    + `<p>`
    + `<button type="button" class="entity-btn" data-action="sf-enter-fray">⚔ Enter the Fray</button> `
    + `<button type="button" class="entity-btn" data-action="sf-way-out">🚪 Find another way</button>`
    + `</p>`
    + `</div></div>`;
}
