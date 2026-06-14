/**
 * STARFORGED COMPANION
 * src/session/swearVow.js — ⚔ Swear this vow (inciting-incident follow-through)
 *
 * Cluster B from the v1.7.8 playtest triage (findings F2 + F3 + F4): the
 * inciting-incident card's structured proposal becomes one affordance that
 *   1. creates the suggested vow as a progress item on the player character
 *      (F2 — `createCharacterVowItem`, idempotent via the message id),
 *   2. pre-attaches the sheet-native clock when the narrator flagged time
 *      pressure (F4 — `Suggested clock:` line → system.hasClock/clockMax),
 *   3. instantiates the vow-target NPC as a connection card with the rich
 *      inciting description (F3 — same pipeline as the make_a_connection
 *      auto-create: createConnection → postCreationEnrichment → bond item).
 *
 * Permission asymmetry: the vow lands for any user who owns the PC; the
 * connection half writes world-scoped campaignState and is therefore
 * GM-only (PERSIST-001 family) — non-GM clicks create the vow and post a
 * notice asking the GM to add the NPC.
 *
 * The click handler reads the structured proposal from the message flags
 * (`incitingMeta`, written by postIncitingIncidentCard) — it never
 * re-parses card HTML.
 */

import { onChatMessageRender } from "../system/chatHooks.js";
import { getPlayerActors, createCharacterVowItem } from "../character/actorBridge.js";
import { entityExistsAnyType, postCreationEnrichment, registerConnectionOnActiveCharacter, routeEntityDrafts }
  from "../entities/entityExtractor.js";

const MODULE_ID = "starforged-companion";

/**
 * Decide what a swear-vow click should do. Pure — unit-tested.
 *
 * @param {{ vow, clock, target }|null} meta — message flags incitingMeta
 * @param {{ isGM: boolean, hasActor: boolean, targetExists: boolean,
 *           alreadySworn: boolean }} ctx
 * @returns {{ ok: boolean, reason?: string,
 *             vow?: { name: string, rank: string|null, clock: {max:number}|null },
 *             createTarget: boolean, targetNotice?: string }}
 */
export function buildSwearVowPlan(meta, ctx = {}) {
  if (ctx.alreadySworn)  return { ok: false, reason: "already_sworn",  createTarget: false };
  if (!meta?.vow?.statement) return { ok: false, reason: "no_vow",     createTarget: false };
  if (!ctx.hasActor)     return { ok: false, reason: "no_character",   createTarget: false };

  const plan = {
    ok: true,
    vow: {
      name:  meta.vow.statement,
      rank:  meta.vow.rank ?? null,
      clock: meta.clock?.segments ? { max: meta.clock.segments } : null,
    },
    createTarget: false,
  };

  if (meta.target?.name) {
    if (ctx.targetExists) {
      plan.targetNotice = `${meta.target.name} is already established — no new record created.`;
    } else if (!ctx.isGM) {
      // Non-GM can't write the connection (world-scoped), but instead of a dead
      // "ask your GM" advisory (finding C) we queue a GM-actionable draft —
      // same pipeline as narration-detected entities, so it lands in the
      // Entities review with a one-click Confirm.
      plan.queueTargetDraft = true;
      plan.targetNotice = `${meta.target.name} has been queued as a connection for your GM to confirm.`;
    } else {
      plan.createTarget = true;
    }
  }

  return plan;
}

/**
 * Resolve the PC the vow lands on: the user's assigned character when it is
 * a player-character actor, else the first PC. NPC cards are already
 * excluded by getPlayerActors (FOLDER-002).
 */
function resolveVowActor() {
  const actors = getPlayerActors() ?? [];
  if (!actors.length) return null;
  const assigned = globalThis.game?.user?.character ?? null;
  if (assigned && actors.some(a => a.id === assigned.id)) return assigned;
  return actors[0];
}

/**
 * Execute a swear-vow click on an inciting-incident message. Never throws —
 * failures surface as UI notifications and console warnings.
 *
 * @param {ChatMessage} message
 * @returns {Promise<{ vowItem: Item|null, connection: Object|null }|null>}
 */
export async function executeSwearVow(message) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  const meta  = flags.incitingMeta ?? null;

  let campaignState = null;
  try {
    campaignState = game.settings.get(MODULE_ID, "campaignState");
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: campaignState read failed:`, err?.message ?? err);
  }

  const actor = resolveVowActor();
  const plan  = buildSwearVowPlan(meta, {
    isGM:         game.user?.isGM === true,
    hasActor:     !!actor,
    targetExists: meta?.target?.name
      ? entityExistsAnyType(meta.target.name, campaignState ?? {})
      : false,
    alreadySworn: flags.vowSworn === true,
  });

  if (!plan.ok) {
    const msg = {
      already_sworn: "This vow has already been sworn.",
      no_vow:        "No suggested vow found on this card.",
      no_character:  "No player character found to swear the vow on.",
    }[plan.reason] ?? "Unable to swear the vow.";
    ui?.notifications?.warn(`Starforged Companion: ${msg}`);
    return null;
  }

  // 1. The vow (idempotent on the message id).
  const vowItem = await createCharacterVowItem(actor, {
    name:  plan.vow.name,
    rank:  plan.vow.rank ?? undefined,
    vowId: message.id,
    clock: plan.vow.clock,
  });
  if (!vowItem) {
    ui?.notifications?.error("Starforged Companion: creating the vow failed — see console.");
    return null;
  }

  // 2. The vow-target connection (GM-only; same pipeline as
  //    make_a_connection auto-create).
  let connection = null;
  if (plan.createTarget && campaignState) {
    try {
      const { createConnection } = await import("../entities/connection.js");
      connection = await createConnection({
        name:                      meta.target.name,
        description:               meta.target.description ?? "",
        sectorId:                  campaignState.activeSectorId ?? null,
        firstAppearance:           campaignState.currentSessionId ?? "",
        portraitSourceDescription: meta.target.description ?? "",
      }, campaignState);
      await postCreationEnrichment("connection", connection, campaignState).catch(err =>
        console.warn(`${MODULE_ID} | swearVow: connection enrichment failed:`, err));
      await registerConnectionOnActiveCharacter(connection).catch(err =>
        console.warn(`${MODULE_ID} | swearVow: bond item registration failed:`, err));
    } catch (err) {
      console.error(`${MODULE_ID} | swearVow: vow-target connection create failed:`, err);
      ui?.notifications?.warn(
        `Starforged Companion: vow created, but adding ${meta.target.name} failed — see console.`,
      );
    }
  }

  // 2b. Non-GM target: queue a draft so the GM gets a one-click Confirm
  //     (finding C). createTarget already handled the GM path above.
  if (plan.queueTargetDraft && meta.target?.name) {
    try {
      await routeEntityDrafts(
        [{ name: meta.target.name, type: "connection", description: meta.target.description ?? "" }],
        campaignState ?? {},
        { source: "vow_target", sessionId: campaignState?.currentSessionId ?? null },
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: vow-target draft queue failed:`, err?.message ?? err);
    }
  }

  await postSwornConfirmation({ plan, actor, connection });
  await markCardSworn(message).catch(err =>
    console.debug?.(`${MODULE_ID} | swearVow: card sworn-state update skipped:`, err?.message ?? err));

  return { vowItem, connection };
}

/** Post the confirmation card describing exactly what was created. */
async function postSwornConfirmation({ plan, actor, connection }) {
  const lines = [
    `<p><strong>⚔ Vow sworn${actor?.name ? ` — ${escapeHtml(actor.name)}` : ""}</strong></p>`,
    `<p>"${escapeHtml(plan.vow.name)}"${plan.vow.rank ? ` <em>(${escapeHtml(plan.vow.rank)})</em>` : ""}` +
      `${plan.vow.clock ? ` · ⏱ ${plan.vow.clock.max}-segment clock attached` : ""}</p>`,
  ];
  if (connection) {
    lines.push(`<p>✦ <strong>${escapeHtml(connection.name)}</strong> added to Connections` +
      ` (find them in the Entities panel; use ✦ Finalise for a portrait).</p>`);
  } else if (plan.targetNotice) {
    lines.push(`<p><em>${escapeHtml(plan.targetNotice)}</em></p>`);
  }
  try {
    await ChatMessage.create({
      content: `<div class="sf-vow-sworn-card">${lines.join("")}</div>`,
      flags:   { [MODULE_ID]: { vowSwornCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: confirmation card failed:`, err);
  }
}

/**
 * Rewrite the original card's action row to the sworn state and flag the
 * message so re-clicks and re-renders stay idempotent. May fail for non-GM
 * clickers (the card is GM-authored) — callers treat that as non-fatal; the
 * vowId idempotency already prevents duplicate vows.
 */
async function markCardSworn(message) {
  const content = String(message?.content ?? "");
  const updated = content.replace(
    /<div class="sf-incite-actions">[\s\S]*?<\/div>/,
    `<p class="sf-incite-sworn">✓ <em>Vow sworn.</em></p>`,
  );
  await message.update({
    content: updated,
    [`flags.${MODULE_ID}.vowSworn`]: true,
  });
}

/**
 * Register the click handler for the ⚔ Swear this vow button. Uses the
 * V13-safe dual-hook helper (chatHooks) and the clone-replace listener
 * pattern. Idempotent.
 */
export function registerSwearVowHandler() {
  if (registerSwearVowHandler._installed) return;
  registerSwearVowHandler._installed = true;

  onChatMessageRender((message, root) => {
    const flags = message?.flags?.[MODULE_ID];
    if (!flags?.incitingIncidentCard || !flags?.incitingMeta?.vow) return;

    const btn = root.querySelector('[data-action="sf-swear-vow"]');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      fresh.disabled = true;
      executeSwearVow(message)
        .catch(err => console.error(`${MODULE_ID} | swearVow: execute failed:`, err))
        .finally(() => { fresh.disabled = false; });
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
