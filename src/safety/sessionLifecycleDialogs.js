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
      <label class="row">
        <input type="checkbox" name="galleyVignette" value="1" checked>
        Include an opening galley vignette (narrator-written scene)
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
        const rollVignette  = form?.querySelector('input[name="vignette"]')?.checked;
        const includeGalley = form?.querySelector('input[name="galleyVignette"]')?.checked ?? true;
        await postBeginSessionCard(rollVignette, includeGalley);
      },
    },
  });
}

async function postBeginSessionCard(rollVignette, includeGalley = true) {
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

  // Flip the session-active gate ON. From this point forward, plain
  // typed narration runs through the move pipeline / paced narrator
  // again. GM-gate the persist write — non-GM clients can't write
  // world-scoped settings, so the dialog itself is functionally GM-
  // only via the surrounding `!begin-session` predicate already.
  if (game.user?.isGM) {
    try {
      const { beginSession } = await import("../session/lifecycle.js");
      const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
      beginSession(cs);
      await game.settings.set(MODULE_ID, "campaignState", cs);
      Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | beginSession state flip failed:`, err?.message ?? err);
    }
  }

  // Campaign clocks — roll Ask the Oracle for each at session start (play
  // kit: campaign clocks advance at Begin a Session via the clock's
  // advanceOdds).
  if (game.user?.isGM) {
    try {
      const { advanceCampaignClocksForBeginSession } = await import("../clocks/clocks.js");
      const clockResults = await advanceCampaignClocksForBeginSession();
      if (clockResults.length) {
        const rows = clockResults.map(r => {
          const bar    = "█".repeat(r.filled) + "░".repeat(Math.max(0, r.segments - r.filled));
          const status = r.advanced
            ? `YES (d100=${r.roll}) — <strong>${r.filled}/${r.segments}</strong>${r.triggered ? " <strong>(TRIGGERED)</strong>" : ""}`
            : `NO (d100=${r.roll})`;
          return `<li>${escapeHtml(r.name)} [${bar}] — Ask the Oracle (${r.odds}): ${status}</li>`;
        }).join("");
        await ChatMessage.create({
          content: `<div class="sf-clock-card"><strong>⏳ Campaign clocks — Begin a Session</strong><ul>${rows}</ul></div>`,
          flags:   { [MODULE_ID]: { clockCard: true, beginSessionAdvance: true } },
        });
        const advanced = clockResults.filter(r => r.advanced);
        if (advanced.length) {
          setTimeout(async () => {
            try {
              const { narrateClockAdvancement } = await import("../narration/narrator.js");
              const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
              for (const cd of advanced) {
                const text = await narrateClockAdvancement({ clock: cd, campaignState: cs });
                if (text) {
                  // Flag family (NARR-RING-CLOCKVIG): threat-advance fiction
                  // must enter the ring/summary or it is forgotten instantly.
                  await ChatMessage.create({
                    content: `<div class="sf-clock-card">${cd.triggered ? "<strong>⚠ TRIGGERED — </strong>" : ""}<em>${escapeHtml(text)}</em></div>`,
                    flags:   {
                      [MODULE_ID]: {
                        clockCard:         true,
                        clockVignetteCard: true,
                        narratorCard:      true,
                        narrationText:     text,
                        sessionId:         cs.currentSessionId ?? null,
                      },
                    },
                  });
                }
              }
            } catch (err) {
              console.warn(`${MODULE_ID} | session-start clock vignette generation failed:`, err?.message ?? err);
            }
          }, 0);
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | campaign clock session-start roll failed:`, err?.message ?? err);
    }
  }

  // Fire-and-forget galley vignette — narrator-generated 4-6 sentence
  // opening scene describing the active PCs in the ship's galley
  // bantering about the absent ones. Silent skip when the Claude key
  // is unset or narration is disabled. Gated on the dialog's "Include an
  // opening galley vignette" checkbox (default on) so unchecking it
  // suppresses the scene (playtest finding: it ran regardless).
  if (!includeGalley) return;
  setTimeout(async () => {
    try {
      const { collectGalleyParticipants, buildGalleyVignetteUserMessage, postGalleyVignetteCard }
        = await import("../session/galleyVignette.js");
      const { narrateSessionVignette } = await import("../narration/narrator.js");
      const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const participants = collectGalleyParticipants();
      const userMessage  = buildGalleyVignetteUserMessage(participants, cs);
      const text = await narrateSessionVignette({ userMessage, campaignState: cs });
      if (text) {
        await postGalleyVignetteCard({ text, kind: "galley_begin", sessionId: cs.currentSessionId ?? "" });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette generation failed:`, err?.message ?? err);
    }
  }, 0);
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
  // them. Also flip the session-active gate OFF and award the +1 momentum to
  // all players if a focus was set.
  if (game.user?.isGM) {
    const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
    if (questFocus)      state.questFocus      = questFocus;
    if (connectionFocus) state.connectionFocus = connectionFocus;
    try {
      const { endSession } = await import("../session/lifecycle.js");
      endSession(state);
    } catch (err) {
      console.warn(`${MODULE_ID} | endSession state flip failed:`, err?.message ?? err);
    }

    // NARR-SESSION-SCENE (narrator-context audit 2026-07): End Session used
    // to flip the gate only — the active scene survived into the next
    // session, whose empty ring + empty summary then mixed with stale scene
    // truths. Close the scene so truths migrate to their durable homes
    // (entity tiers / WJ Lore). `session_close` was already a documented
    // endScene reason — this wires the call the design intended.
    try {
      const { endScene } = await import("../factContinuity/sceneLifecycle.js");
      await endScene(state, { reason: "session_close" });
    } catch (err) {
      console.warn(`${MODULE_ID} | endSession scene close failed:`, err?.message ?? err);
    }

    // Finalise the rolling session summary (architecture §8.6) before the
    // Session Log write, so the log captures the tail since the last debounced
    // regen. Self-gates on narratorSessionSummary; fail-open.
    try {
      const { getRollingSessionSummary } = await import("../narration/narrator.js");
      await getRollingSessionSummary(state, { forceRefresh: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | rolling session summary finalise failed:`, err?.message ?? err);
    }

    await game.settings.set(MODULE_ID, "campaignState", state);
    Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: false });

    // Write the session log on End (F18). writeSessionLog was implemented but
    // never called from production, so the Session Log journal stayed blank.
    if (game.settings.get(MODULE_ID, "sessionLogAutoWrite") !== false) {
      try {
        const { writeSessionLog } = await import("../world/worldJournal.js");
        await writeSessionLog(state);
      } catch (err) {
        console.warn(`${MODULE_ID} | session log write failed:`, err?.message ?? err);
      }
    }

    if (questFocus || connectionFocus) {
      await applyMomentumToAllPlayers(1);
    }
  }

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>${focusBlock}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });

  // Fire-and-forget closing vignette — narrator-generated slice-of-life
  // featuring a currently-important NPC (bonded connection → recurring
  // threat → fallback) doing something trivial and mundane. Silent skip
  // when the Claude key is unset or narration is disabled.
  setTimeout(async () => {
    try {
      const { selectEndSessionNPC, buildEndSessionVignetteUserMessage, postEndSessionVignetteCard }
        = await import("../session/endSessionVignette.js");
      const { narrateSessionVignette } = await import("../narration/narrator.js");
      const cs  = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const npc = selectEndSessionNPC(cs);
      const userMessage = buildEndSessionVignetteUserMessage(npc, cs);
      const text = await narrateSessionVignette({ userMessage, campaignState: cs });
      if (text) {
        await postEndSessionVignetteCard({ text, npcName: npc.name, sessionId: cs.currentSessionId ?? "" });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | end-session vignette generation failed:`, err?.message ?? err);
    }
  }, 0);
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
