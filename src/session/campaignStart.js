/**
 * STARFORGED COMPANION
 * src/session/campaignStart.js — ✦ Campaign Start (one-click full campaign setup)
 *
 * Chains the full campaign-launch sequence into a single hotbar Macro:
 *
 *   1. Playtest Quickstart — rolls World Truths, generates a sector, creates
 *      two PCs with path assets, creates and seeds a command-vehicle starship.
 *   2. Envision ship — rolls captain / crew / agenda / contact oracle bundles
 *      and generates narrator prose for the command vehicle, appending the
 *      detail to ship notes.
 *   3. Finalize connections — seeds every connection NPC created during sector
 *      generation (portrait, narrator description, oracle identity). Skipped
 *      gracefully when no connections were generated.
 *   4. Begin Session — flips the session-active gate ON, posts the Begin
 *      Session card, and fires the sessionStateChanged hook. No spotlight-
 *      vignette prompt; campaign-start sessions open clean.
 *   5. Inciting Incident — rolls an Action + Theme spark, asks the narrator to
 *      envision the campaign's opening event, posts the card, and offers the
 *      ⚔ Swear this vow affordance.
 *
 * Each phase is fail-open: a failure in one step is logged in the summary card
 * and does not abort the remaining steps. The summary card appears after all
 * five phases complete.
 *
 * Exposed as `game.modules.get("starforged-companion").api.runCampaignStart()`;
 * `ensureCampaignStartMacro()` creates the hotbar-ready Macro document on first
 * GM load (same ensure-once pattern as the Quickstart macro).
 */

import { runPlaytestQuickstart }                                  from "./quickstart.js";
import { beginSession }                                           from "./lifecycle.js";
import { finalizeEntity }                                         from "../entities/finalize.js";
import { envisionShip, renderEnvisionHtml, appendNotesSection }  from "../entities/shipEnvision.js";
import { runIncitingIncident }                                    from "./incitingIncident.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full campaign-start sequence. GM-only; confirms before beginning.
 * Never throws — each phase reports into the summary card.
 *
 * @param {{ skipConfirm?: boolean }} [opts]
 * @returns {Promise<{ phases: Array<{phase:string, ok:boolean, detail:string}> }|null>}
 */
export async function runCampaignStart(opts = {}) {
  if (!game.user?.isGM) {
    ui?.notifications?.warn("Starforged Companion: Campaign Start is GM-only.");
    return null;
  }

  const confirmed = opts.skipConfirm === true || await foundry.applications.api.DialogV2.confirm({
    window:  { title: "✦ Campaign Start" },
    content:
      `<p>Run the full campaign-start sequence in this world?</p>` +
      `<ul><li><strong>Quickstart</strong> — World Truths, sector, two PCs, starship</li>` +
      `<li><strong>Envision ship</strong> — captain / crew / agenda / contact</li>` +
      `<li><strong>Finalize connections</strong> — seed each NPC card with oracle identity + portrait</li>` +
      `<li><strong>Begin Session</strong> — activate the session gate</li>` +
      `<li><strong>Inciting Incident</strong> — open scene, suggested vow</li></ul>` +
      `<p>Each run creates new content — start on a fresh world for a clean slate.</p>`,
  }).catch(() => false);
  if (!confirmed) return null;

  const phases = [];
  const report = (phase, ok, detail) => phases.push({ phase, ok, detail });

  // ── Phase 1: Quickstart ───────────────────────────────────────────────────
  try {
    const result = await runPlaytestQuickstart({ skipConfirm: true });
    if (!result) throw new Error("quickstart returned null");
    const failures = result.phases.filter(p => !p.ok);
    report("Quickstart", failures.length === 0,
      failures.length
        ? `${failures.length} phase(s) failed — see Quickstart card for details`
        : "World Truths, sector, PCs, and starship created");
  } catch (err) {
    console.error(`${MODULE_ID} | campaignStart: quickstart failed:`, err);
    report("Quickstart", false, err?.message ?? "failed");
  }

  // ── Phase 2: Envision ship ────────────────────────────────────────────────
  let campaignState = readCampaignState();
  try {
    const actor = findCommandVehicle(campaignState);
    if (!actor) throw new Error("no command vehicle found after quickstart");

    const result   = await envisionShip(actor, { facet: "all" });
    const html     = renderEnvisionHtml(result);
    await appendNotesSection(actor, "Envisioned details", html)
      .catch(err => console.warn(`${MODULE_ID} | campaignStart: ship notes append failed:`, err?.message ?? err));
    await ChatMessage.create({
      content:
        `<div class="sf-ship-envision-card">` +
        `<strong>✦ Envision — ${escapeHtml(actor.name)}</strong>` +
        html +
        `</div>`,
      flags: { [MODULE_ID]: { shipEnvisionCard: true, actorId: actor.id, facet: "all" } },
    });
    report("Ship envision", true, `${actor.name} — captain / crew / agenda / contact`);
  } catch (err) {
    console.error(`${MODULE_ID} | campaignStart: ship envision failed:`, err);
    report("Ship envision", false, err?.message ?? "failed");
  }

  // ── Phase 3: Finalize connections ─────────────────────────────────────────
  campaignState = readCampaignState();
  const connectionIds = campaignState.connectionIds ?? [];
  if (connectionIds.length === 0) {
    report("Connections", true, "none generated by the sector pipeline");
  }
  for (const connId of connectionIds) {
    const actor = game.actors?.get?.(connId);
    const label = actor?.name ?? connId;
    try {
      const res = await finalizeEntity("connection", connId, campaignState);
      report(`Connection — ${label}`, res.ok, res.reason ?? "finalized");
    } catch (err) {
      console.warn(`${MODULE_ID} | campaignStart: connection finalize failed (${label}):`, err?.message ?? err);
      report(`Connection — ${label}`, false, err?.message ?? "failed");
    }
  }

  // ── Phase 4: Begin Session ────────────────────────────────────────────────
  campaignState = readCampaignState();
  try {
    beginSession(campaignState);
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
    Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: true });
    await ChatMessage.create({
      content:
        `<div class="sf-session-card"><strong>Begin a Session</strong>` +
        `<p>Campaign started — session active. Inciting incident follows.</p></div>`,
      flags: { [MODULE_ID]: { sessionLifecycleCard: true } },
    });
    report("Begin Session", true, "session gate activated");
  } catch (err) {
    console.error(`${MODULE_ID} | campaignStart: begin session failed:`, err);
    report("Begin Session", false, err?.message ?? "failed");
  }

  // ── Phase 5: Inciting Incident ────────────────────────────────────────────
  campaignState = readCampaignState();
  try {
    await runIncitingIncident(campaignState);
    report("Inciting Incident", true, "opening scene posted");
  } catch (err) {
    console.error(`${MODULE_ID} | campaignStart: inciting incident failed:`, err);
    report("Inciting Incident", false, err?.message ?? "failed");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const rows = phases
    .map(p => `<li>${p.ok ? "✅" : "❌"} <strong>${escapeHtml(p.phase)}:</strong> ${escapeHtml(p.detail)}</li>`)
    .join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-quickstart-card"><strong>✦ Campaign Start — complete</strong><ul>${rows}</ul></div>`,
      flags:   { [MODULE_ID]: { campaignStartCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | campaignStart: summary card failed:`, err);
  }

  return { phases };
}

// ─────────────────────────────────────────────────────────────────────────────
// MACRO (hotbar affordance)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the ✦ Campaign Start hotbar Macro exists (GM, ready hook).
 * The Macro body is a one-liner into the module API so its logic stays in
 * tested module code (same ensure-once pattern as the Quickstart macro).
 */
export async function ensureCampaignStartMacro() {
  if (!game.user?.isGM) return null;
  try {
    const existing = (game.macros?.contents ?? []).find(
      m => m.flags?.[MODULE_ID]?.campaignStartMacro === true,
    );
    if (existing) return existing;

    return await Macro.create({
      name:    "✦ Campaign Start",
      type:    "script",
      img:     "icons/svg/castle.svg",
      command: `game.modules.get("${MODULE_ID}")?.api?.runCampaignStart?.();`,
      flags:   { [MODULE_ID]: { campaignStartMacro: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | campaignStart: macro creation failed:`, err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readCampaignState() {
  try { return game.settings.get(MODULE_ID, "campaignState") ?? {}; }
  catch { return {}; }
}

/**
 * Find the command vehicle among tracked ships, falling back to the lone ship
 * when no command vehicle flag is set. Returns null when shipIds is empty.
 */
function findCommandVehicle(campaignState) {
  const ids = campaignState?.shipIds ?? [];
  const actors = ids
    .map(id => { try { return game.actors?.get?.(id) ?? null; } catch { return null; } })
    .filter(a => a?.type === "starship");

  const cv = actors.find(a => !!a.flags?.[MODULE_ID]?.ship?.isCommandVehicle);
  if (cv) return cv;
  return actors[0] ?? null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
