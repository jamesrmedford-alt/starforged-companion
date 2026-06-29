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
import { entityExistsAnyType, postCreationEnrichment, registerConnectionOnActiveCharacter }
  from "../entities/entityExtractor.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { progressPerMilestoneLine, legacyRewardLine } from "../moves/rewards.js";

const MODULE_ID = "starforged-companion";
const SOCKET    = `module.${MODULE_ID}`;

// Cross-PC sync of the shared inciting vow: the progress fields kept in lockstep
// across every player character's copy, and a re-entrancy guard (keyed by vowId)
// so the GM's sibling-writes don't cascade back through the updateItem hook.
const SHARED_VOW_SYNC_FIELDS = ["current", "clockTicks"];
const _vowSyncInFlight = new Set();

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
 * Execute a swear-vow click. The inciting vow is the crew's SHARED founding
 * vow: it is created on every player character and its progress is kept in
 * lockstep across all of them (see registerSharedVowSyncHook). Creating Items
 * on PCs the clicker doesn't own — and the vow-target connection — are
 * privileged writes, so anyone who isn't the canonical GM relays the action;
 * the GM performs it for the whole table and the Items sync down to each sheet.
 * Never throws — failures surface as notifications + console warnings.
 *
 * @param {ChatMessage} message
 * @returns {Promise<{ actors: Actor[], connection: Object|null }|null>}
 */
export async function executeSwearVow(message) {
  if (isCanonicalGM()) return swearSharedVowForAll(message);
  try {
    globalThis.game?.socket?.emit?.(SOCKET, { kind: "vow.swearShared", messageId: message?.id });
    globalThis.ui?.notifications?.info(
      "Starforged Companion: swearing the crew's vow — your GM is recording it for everyone.");
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: shared-vow relay emit failed:`, err?.message ?? err);
  }
  return null;
}

/**
 * GM-side: create the shared inciting vow on EVERY player character (idempotent
 * per actor on the message id) and the vow-target connection, then post a
 * confirmation. Runs only on the canonical GM — invoked directly on a GM click
 * or via the swear-shared-vow socket relay from another client.
 *
 * @param {ChatMessage} message
 * @returns {Promise<{ actors: Actor[], connection: Object|null }|null>}
 */
export async function swearSharedVowForAll(message) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  const meta  = flags.incitingMeta ?? null;

  let campaignState = null;
  try {
    campaignState = game.settings.get(MODULE_ID, "campaignState");
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: campaignState read failed:`, err?.message ?? err);
  }

  const actors = getPlayerActors() ?? [];
  const plan   = buildSwearVowPlan(meta, {
    isGM:         true,
    hasActor:     actors.length > 0,
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

  // 1. The shared vow — created on EVERY player character, all tagged with the
  //    inciting message id and a sharedVow flag so registerSharedVowSyncHook
  //    keeps their progress in lockstep. Idempotent per actor.
  const sworn = [];
  for (const actor of actors) {
    const vowItem = await createCharacterVowItem(actor, {
      name:                 plan.vow.name,
      rank:                 plan.vow.rank ?? undefined,
      vowId:                message.id,
      clock:                plan.vow.clock,
      shared:               true,
      linkedConnectionName: meta?.target?.name ?? null,   // vow → connection (#241)
    });
    if (vowItem) sworn.push(actor);
  }
  if (!sworn.length) {
    ui?.notifications?.error("Starforged Companion: creating the vow failed — see console.");
    return null;
  }

  // 2. The vow-target connection (same pipeline as make_a_connection auto-create).
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

  await postSwornConfirmation({ plan, actors: sworn, connection });
  await markCardSworn(message).catch(err =>
    console.debug?.(`${MODULE_ID} | swearVow: card sworn-state update skipped:`, err?.message ?? err));

  return { actors: sworn, connection };
}

/** Post the confirmation card describing exactly what was created. */
async function postSwornConfirmation({ plan, actors, connection }) {
  const names = (actors ?? []).map(a => a?.name).filter(Boolean).map(escapeHtml).join(", ");
  const vrank = plan.vow.rank ?? "dangerous";
  const lines = [
    `<p><strong>⚔ Vow sworn${names ? ` — ${names}` : ""}</strong> <em>(shared by the crew)</em></p>`,
    `<p>"${escapeHtml(plan.vow.name)}"${plan.vow.rank ? ` <em>(${escapeHtml(plan.vow.rank)})</em>` : ""}` +
      `${plan.vow.clock ? ` · ⏱ ${plan.vow.clock.max}-segment clock attached` : ""}</p>`,
    `<p class="sf-stakes"><em>${escapeHtml(progressPerMilestoneLine(vrank))} ${escapeHtml(legacyRewardLine(vrank, "Quests"))}</em></p>`,
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared inciting-vow: cross-PC progress sync + GM relay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure: given a just-updated shared-vow Item and the full PC roster, return the
 * sibling vow Items (same vowId on the other PCs) whose synced progress fields
 * differ, paired with the update that brings them into lockstep. Returns []
 * when `source` is not a shared vow or nothing needs changing. The source item
 * itself is always skipped. Exported for unit tests.
 *
 * @param {Item} source
 * @param {Actor[]} allActors
 * @returns {Array<{ item: Item, update: object }>}
 */
export function computeSharedVowSyncUpdates(source, allActors) {
  const sf = source?.flags?.[MODULE_ID];
  if (!sf?.sharedVow || !sf.vowId) return [];

  const update = {};
  for (const field of SHARED_VOW_SYNC_FIELDS) {
    const v = source.system?.[field];
    if (v !== undefined && v !== null) update[`system.${field}`] = v;
  }
  if (!Object.keys(update).length) return [];

  const out = [];
  for (const actor of allActors ?? []) {
    for (const item of (actor.items ?? [])) {
      if (item.id === source.id) continue;
      const f = item.flags?.[MODULE_ID];
      if (!f?.sharedVow || f.vowId !== sf.vowId) continue;
      const differs = SHARED_VOW_SYNC_FIELDS.some(
        field => update[`system.${field}`] !== undefined
              && item.system?.[field] !== source.system?.[field],
      );
      if (differs) out.push({ item, update: { ...update } });
    }
  }
  return out;
}

/**
 * GM-side socket handler: a non-canonical client relays a swear-shared-vow click
 * here, and the canonical GM creates the vow on every PC. Register once on
 * ready (all clients; non-canonical receivers no-op).
 */
export function registerSharedVowSocket() {
  if (registerSharedVowSocket._installed) return;
  if (!globalThis.game?.socket?.on) return;
  registerSharedVowSocket._installed = true;
  game.socket.on(SOCKET, async (payload) => {
    try {
      if (!payload || payload.kind !== "vow.swearShared") return;
      if (!isCanonicalGM()) return;
      const message = globalThis.game?.messages?.get?.(payload.messageId);
      if (message) await swearSharedVowForAll(message);
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: shared-vow socket handler failed:`, err?.message ?? err);
    }
  });
}

/**
 * Keep every PC's copy of a shared inciting vow in lockstep: when one copy's
 * progress changes — via the module's vow flow OR a native sheet edit — the
 * canonical GM writes the same value to the others. Single-writer via
 * isCanonicalGM; a vowId-keyed re-entrancy guard stops the sibling writes from
 * cascading back through this same hook. Register once on ready.
 */
export function registerSharedVowSyncHook() {
  if (registerSharedVowSyncHook._installed) return;
  registerSharedVowSyncHook._installed = true;
  Hooks.on("updateItem", async (item, change) => {
    try {
      if (!isCanonicalGM()) return;
      if (item?.type !== "progress") return;
      const f = item.flags?.[MODULE_ID];
      if (!f?.sharedVow || !f.vowId) return;
      const sys = change?.system ?? {};
      if (!SHARED_VOW_SYNC_FIELDS.some(field => field in sys)) return;  // only progress changes
      if (_vowSyncInFlight.has(f.vowId)) return;                        // sibling-write cascade guard
      _vowSyncInFlight.add(f.vowId);
      try {
        for (const u of computeSharedVowSyncUpdates(item, getPlayerActors())) {
          await u.item.update(u.update);
        }
      } finally {
        _vowSyncInFlight.delete(f.vowId);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: shared-vow sync failed:`, err?.message ?? err);
    }
  });
}
