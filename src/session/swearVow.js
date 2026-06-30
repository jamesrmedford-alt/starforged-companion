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
import { getPlayerActors, createCharacterVowItem, setSharedVowReward } from "../character/actorBridge.js";
import { entityExistsAnyType, postCreationEnrichment, registerConnectionOnActiveCharacter }
  from "../entities/entityExtractor.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { progressPerMilestoneLine, legacyRewardLine, proposeRewards, buildRewardChoiceHtml }
  from "../moves/rewards.js";

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
 * Build the forced Swear an Iron Vow move post for an inciting "⚔ Swear this
 * vow" click (#248 Theme C). Pure — returns the ChatMessage payload, or null
 * when the card carries no suggested vow.
 *
 * @param {ChatMessage} message  the inciting-incident card
 * @returns {{ content: string, flags: object } | null}
 */
export function buildSwearMovePost(message) {
  const meta = message?.flags?.[MODULE_ID]?.incitingMeta ?? null;
  if (!meta?.vow?.statement) return null;
  return {
    content: `Swear an iron vow: ${meta.vow.statement}.`,
    flags: { [MODULE_ID]: {
      bypassPacing:           true,
      forcedMoveId:           "swear_an_iron_vow",
      forcedMoveTarget:       meta.vow.statement,
      incitingSwearMessageId: message?.id ?? null,
    } },
  };
}

/**
 * Execute a swear-vow click. Swearing rolls (#248 Theme C): the click routes
 * through the **Swear an Iron Vow** move so it actually rolls (+heart →
 * momentum on a hit, complication on a weak hit/miss), crediting the clicker.
 * Posting the forced-move ChatMessage is itself the relay — any client may post
 * it; the canonical GM runs the move pipeline and, in the GM-side swear branch
 * (src/index.js), creates the shared vow from this card's incitingMeta (created
 * on every player character + kept in lockstep, see registerSharedVowSyncHook).
 * Never throws — failures surface as notifications + console warnings.
 *
 * @param {ChatMessage} message
 * @returns {Promise<null>}
 */
export async function executeSwearVow(message) {
  const post = buildSwearMovePost(message);
  if (!post) {
    globalThis.ui?.notifications?.warn("Starforged Companion: no suggested vow found on this card.");
    return null;
  }
  try {
    await globalThis.ChatMessage?.create?.(post);
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: forced swear-move post failed:`, err?.message ?? err);
    globalThis.ui?.notifications?.error(
      "Starforged Companion: couldn't start the Swear an Iron Vow roll — see console.");
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

  // 1b. The proximal crisis (#248 Theme A): a standalone tension clock — a first
  //     scene to tackle now, separate from the long vow (whose own deadline clock
  //     is now rare). Created once, GM-side, on swear.
  const crisis = meta?.immediateCrisis ?? null;
  if (crisis?.label) {
    try {
      const { createClock } = await import("../clocks/clocks.js");
      await createClock({ name: crisis.label, segments: crisis.segments ?? 4, type: "tension" });
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: immediate-crisis clock creation failed:`, err?.message ?? err);
    }
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

  await postSwornConfirmation({ plan, actors: sworn, connection, crisis });
  await markCardSworn(message).catch(err =>
    console.debug?.(`${MODULE_ID} | swearVow: card sworn-state update skipped:`, err?.message ?? err));

  // Vow-swearing scene (#241 follow-up): a brief Iron-truth-grounded scene of the
  // oath being made. Dynamic import avoids a static narrator.js dependency cycle.
  try {
    const { narrateAndPostVowSwearing } = await import("../narration/narrator.js");
    await narrateAndPostVowSwearing({ vow: plan.vow, campaignState });
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: vow-swearing scene failed:`, err?.message ?? err);
  }

  // Concrete reward (#241 Phase 2): propose two options the crew can pick from
  // (or write their own), to be granted when the vow is fulfilled. Best-effort —
  // a missing/failed proposal still posts a write-your-own card.
  try {
    const apiKey  = globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") ?? "";
    const options = await proposeRewards({ kind: "vow", target: plan.vow.name, apiKey });
    await postRewardChoiceCard(message.id, options);
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: reward proposal failed:`, err?.message ?? err);
  }

  return { actors: sworn, connection };
}

/** Post the reward-choice card for a sworn vow (two options + write-your-own). */
async function postRewardChoiceCard(vowId, options) {
  try {
    await ChatMessage.create({
      content: buildRewardChoiceHtml(options),
      flags:   { [MODULE_ID]: { rewardChoiceCard: true, vowId, rewardOptions: options ?? [] } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: reward-choice card failed:`, err?.message ?? err);
  }
}

/** Post the confirmation card describing exactly what was created. */
async function postSwornConfirmation({ plan, actors, connection, crisis = null }) {
  const names = (actors ?? []).map(a => a?.name).filter(Boolean).map(escapeHtml).join(", ");
  const vrank = plan.vow.rank ?? "dangerous";
  const lines = [
    `<p><strong>⚔ Vow sworn${names ? ` — ${names}` : ""}</strong> <em>(shared by the crew)</em></p>`,
    `<p>"${escapeHtml(plan.vow.name)}"${plan.vow.rank ? ` <em>(${escapeHtml(plan.vow.rank)})</em>` : ""}` +
      `${plan.vow.clock ? ` · ⏱ ${plan.vow.clock.max}-segment clock attached` : ""}</p>`,
    `<p class="sf-stakes"><em>${escapeHtml(progressPerMilestoneLine(vrank))} ${escapeHtml(legacyRewardLine(vrank, "Quests"))}</em></p>`,
  ];
  if (crisis?.label) {
    lines.push(`<p class="sf-incite-crisis">⏱ <strong>Immediate crisis:</strong> ${escapeHtml(crisis.label)} — a ${crisis.segments}-segment tension clock (a first scene to tackle now, separate from the vow).</p>`);
  }
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
      fresh.disabled = true;   // stays disabled — the roll is firing; re-enable only if the post itself fails
      executeSwearVow(message)
        .catch(err => {
          console.error(`${MODULE_ID} | swearVow: execute failed:`, err);
          fresh.disabled = false;
        });
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
      if (!payload || !isCanonicalGM()) return;
      if (payload.kind === "vow.swearShared") {
        const message = globalThis.game?.messages?.get?.(payload.messageId);
        if (message) await swearSharedVowForAll(message);
      } else if (payload.kind === "vow.setReward") {
        await setSharedVowReward(payload.vowId, payload.reward);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: shared-vow socket handler failed:`, err?.message ?? err);
    }
  });
}

/**
 * Wire the reward-choice card (#241 Phase 2): picking one of the two proposed
 * rewards, or writing your own, stamps it on the vow (promised) — GM-gated, so
 * non-canonical clients relay over the module socket.
 */
export function registerRewardChoiceHook() {
  if (registerRewardChoiceHook._installed) return;
  registerRewardChoiceHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.rewardChoiceCard) return;
    const vowId = f.vowId;
    const opts  = Array.isArray(f.rewardOptions) ? f.rewardOptions : [];
    const store = async (reward) => {
      const full = { status: "promised", description: reward.description, form: reward.form ?? "gear" };
      if (isCanonicalGM()) await setSharedVowReward(vowId, full);
      else globalThis.game?.socket?.emit?.(SOCKET, { kind: "vow.setReward", vowId, reward: full });
      try {
        await ChatMessage.create({
          content: `<p class="sf-incite-sworn">🎁 Reward set: <em>${escapeHtml(reward.description)}</em></p>`,
          flags:   { [MODULE_ID]: { rewardSetCard: true } },
        });
      } catch (err) {
        console.warn(`${MODULE_ID} | swearVow: reward-set card failed:`, err?.message ?? err);
      }
    };
    root.querySelectorAll('[data-action="sf-reward-pick"]').forEach((btn) => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const opt = opts[Number(fresh.dataset.idx)];
        if (!opt) return;
        root.querySelectorAll("button").forEach(b => { b.disabled = true; });
        await store({ description: opt.description, form: opt.form });
      });
    });
    const ownBtn = root.querySelector('[data-action="sf-reward-own"]');
    if (ownBtn) {
      const fresh = ownBtn.cloneNode(true);
      ownBtn.replaceWith(fresh);
      fresh.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const text = root.querySelector(".sf-reward-own")?.value?.trim();
        if (!text) return;
        root.querySelectorAll("button").forEach(b => { b.disabled = true; });
        await store({ description: text.slice(0, 120), form: "gear" });
      });
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
