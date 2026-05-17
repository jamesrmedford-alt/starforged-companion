/**
 * STARFORGED COMPANION
 * src/safety/sessionLifecycleDialogs.js
 *
 * DialogV2-backed flows for Begin a Session and End a Session.
 *
 * Begin a Session (play kit p. 1):
 *   - Lists flagged content for review.
 *   - Offers an optional Spotlight Vignette roll (d100, 10 entries) —
 *     uses src/oracles/tables/sessionVignette.js. On roll, all players
 *     take +1 momentum.
 *
 * End a Session (play kit p. 1):
 *   - Capture quest focus and/or connection focus for next session.
 *   - If at least one focus is noted, the player takes +1 momentum.
 *   - Surfaces a reminder for any vow that advanced this session
 *     (the player should Reach a Milestone before posting the card).
 */

import { rollOracle } from "../oracles/roller.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Begin a Session
// ─────────────────────────────────────────────────────────────────────────────

export async function openBeginSessionDialog() {
  const { DialogV2 } = foundry.applications.api;

  const state    = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const flagList = (state.safetyFlags ?? [])
    .filter(f => f.visibility !== "private" || game.user?.isGM)
    .slice(-5)
    .map(f => `<li>${escapeHtml(f.text)}</li>`)
    .join("");
  const flagBlock = flagList
    ? `<details open><summary>Flagged content to review (${(state.safetyFlags ?? []).length})</summary><ul>${flagList}</ul></details>`
    : `<p class="muted"><em>No flagged content. Use Set a Flag to add some.</em></p>`;

  const content = `
    <form class="sf-begin-session-form">
      <p class="hint">Identify or adjust flagged content. Review or recap what
      happened last session. Set the scene by envisioning your character's
      current situation and intent.</p>
      ${flagBlock}
      <label class="row">
        <input type="checkbox" name="vignette" value="1">
        Roll a Spotlight Vignette (+1 momentum to all players)
      </label>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Begin a Session" },
    content,
    ok: {
      label:    "Begin",
      callback: async (_event, button) => {
        const form = button.form;
        const rollVignette = form?.querySelector('input[name="vignette"]')?.checked;
        await postBeginSessionCard(rollVignette);
      },
    },
  });
}

async function postBeginSessionCard(rollVignette) {
  let vignetteBlock = "";
  if (rollVignette) {
    try {
      const r = rollOracle("spotlight_vignette");
      vignetteBlock = `<p><strong>Spotlight vignette:</strong> ${escapeHtml(r.result)}</p><p>All players take <strong>+1 momentum</strong>.</p>`;

      if (game.user?.isGM) {
        await applyMomentumToAllPlayers(1);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | openBeginSessionDialog: vignette roll failed:`, err);
    }
  }

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>Flagged content reviewed; scene set.</p>${vignetteBlock}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// End a Session
// ─────────────────────────────────────────────────────────────────────────────

export async function openEndSessionDialog() {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <form class="sf-end-session-form">
      <p class="hint">Reflect on the events of the game and identify any missed
      opportunities to mark progress. If a quest advanced, Reach a Milestone now.
      If a tie strengthened, Develop Your Relationship.</p>
      <label>
        <span>Quest focus for next session (optional)</span>
        <input type="text" name="questFocus" maxlength="120">
      </label>
      <label>
        <span>Connection focus for next session (optional)</span>
        <input type="text" name="connectionFocus" maxlength="120">
      </label>
      <p class="hint">Setting at least one focus grants <strong>+1 momentum</strong>.</p>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "End a Session" },
    content,
    ok: {
      label:    "End Session",
      callback: async (_event, button) => {
        const form = button.form;
        const questFocus      = form?.querySelector('input[name="questFocus"]')?.value.trim() ?? "";
        const connectionFocus = form?.querySelector('input[name="connectionFocus"]')?.value.trim() ?? "";
        await postEndSessionCard({ questFocus, connectionFocus });
      },
    },
  });
}

async function postEndSessionCard({ questFocus, connectionFocus }) {
  const lines = [];
  if (questFocus)      lines.push(`<li><strong>Quest focus:</strong> ${escapeHtml(questFocus)}</li>`);
  if (connectionFocus) lines.push(`<li><strong>Connection focus:</strong> ${escapeHtml(connectionFocus)}</li>`);
  const focusBlock = lines.length
    ? `<ul>${lines.join("")}</ul><p>You take <strong>+1 momentum</strong>.</p>`
    : `<p class="muted"><em>No focus set — no momentum bonus.</em></p>`;

  // Persist the foci to campaignState so the next Begin a Session can surface
  // them. Also award the +1 momentum to all players if a focus was set.
  if (game.user?.isGM) {
    const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
    if (questFocus)      state.questFocus      = questFocus;
    if (connectionFocus) state.connectionFocus = connectionFocus;
    await game.settings.set(MODULE_ID, "campaignState", state);

    if (questFocus || connectionFocus) {
      await applyMomentumToAllPlayers(1);
    }
  }

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>${focusBlock}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function applyMomentumToAllPlayers(delta) {
  const { getPlayerActors }   = await import("../character/actorBridge.js");
  const { applyMeterChanges } = await import("../character/actorBridge.js");
  const actors = getPlayerActors();
  for (const a of actors) {
    try { await applyMeterChanges(a, { momentum: delta }); }
    catch (err) { console.warn(`${MODULE_ID} | momentum delta failed for ${a.name}:`, err); }
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
