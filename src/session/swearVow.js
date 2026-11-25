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
import { getPlayerActors, createCharacterVowItem, setSharedVowReward, isPlayerCharacterActor, setVowLinkedConnection, isVowCopy, readVows } from "../character/actorBridge.js";
import { entityExistsAnyType, postCreationEnrichment, promoteNewEntityLedgerSubjects }
  from "../entities/entityExtractor.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { relayCardAction, applyCardRollerFollowup } from "../moves/cardActions.js";
import { progressPerMilestoneLine, legacyRewardLine, proposeRewards, buildRewardChoiceHtml }
  from "../moves/rewards.js";
import { rankName } from "../schemas.js";

const MODULE_ID = "starforged-companion";

// Cross-PC sync of the shared inciting vow: the progress fields kept in lockstep
// across every player character's copy, and a re-entrancy guard (keyed by vowId)
// so the GM's sibling-writes don't cascade back through the updateItem hook.
// `completed` included so fulfilling (or forsaking) a shared vow on ONE copy —
// e.g. the vendor sheet's native fulfil — closes every crewmate's copy too
// (VOW-FULFIL-SIBLINGS fix: siblings used to stay open and kept showing as an
// active Background Vow to the narrator). `rank` included so a sheet-side
// re-rank keeps every copy — and therefore the fulfil payoff scaling — in
// agreement: a SHARED vow has one rank for the whole crew.
const SHARED_VOW_SYNC_FIELDS = ["current", "clockTicks", "completed", "rank"];
// The canonical GM marks its sibling writes with this update option, so the
// sync hook tells them from independent changes (as sharedSupply.js does).
const VOW_MIRROR_OPTION = "sharedVowMirror";
// vowId → { running, next }: a sync pass writing the copies, and the newest
// value per field still to propagate (issue #322 V32).
const _vowSync = new Map();

/**
 * Decide what a swear-vow click should do. Pure — unit-tested.
 *
 * Built only by `swearSharedVowForAll`, on the canonical GM, which writes the
 * target connection itself — there is no player-side branch (its unreachable
 * `!isGM` draft-queue branch is gone, SWEAR-PLAN-DEAD-BRANCH).
 *
 * @param {{ vow, clock, target }|null} meta — message flags incitingMeta
 * @param {{ hasActor: boolean, targetExists: boolean,
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

  // Only a person is made a connection: a faction, creature or vessel the vow
  // concerns became a connection with a bond on every PC, and fulfilling the
  // vow offered "Deepen your bond with The Iron Covenant" (issue #326 W70).
  if (meta.target?.name && !isPersonTarget(meta.target)) {
    plan.targetNotice = `${meta.target.name} is the vow's ${meta.target.kind} — not made a connection.`;
  } else if (meta.target?.name) {
    if (ctx.targetExists) {
      plan.targetNotice = `${meta.target.name} is already established — no new record created.`;
    } else {
      plan.createTarget = true;
    }
  }

  return plan;
}

/**
 * True for a vow target that is a person — the only kind made a connection.
 * A target with no kind (a card proposed before kinds) is read as before.
 *
 * @param {{ kind?: string }|null} target
 * @returns {boolean}
 */
export function isPersonTarget(target) {
  return !target?.kind || target.kind === "person";
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
      // The vow is sworn to its target — the connection every copy is linked
      // to: +1 to the roll, +2 when bonded (issue #325 W18).
      ...(meta.target?.name && isPersonTarget(meta.target) ? { swearToConnection: meta.target.name } : {}),
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
 * @returns {Promise<ChatMessage|null>} the forced post, or null when none was made
 */
export async function executeSwearVow(message) {
  const post = buildSwearMovePost(message);
  if (!post) {
    globalThis.ui?.notifications?.warn("Starforged Companion: no suggested vow found on this card.");
    return null;
  }
  try {
    return (await globalThis.ChatMessage?.create?.(post)) ?? null;
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
 * The vow target is a connection of every PC the vow is sworn on, and the
 * oath scene is written for the PC who rolled the swear (`speakerActorId`) —
 * neither is the first PC's alone (issue #321 U23).
 *
 * @param {ChatMessage} message
 * @param {{ speakerActorId?: string|null }} [options]
 * @returns {Promise<{ actors: Actor[], connection: Object|null }|null>}
 */
export async function swearSharedVowForAll(message, { speakerActorId = null } = {}) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  const meta  = flags.incitingMeta ?? null;

  // A working copy: the oath scene below mints a scene and applies its
  // sidecar's truths, state and frame on the object it is given, each before
  // a write the world can refuse — on the cached setting a refusal left them
  // on this GM's cache alone (issue #342 Z02; the X09 / Y04 rule,
  // rules/foundry-api.md).
  let campaignState = null;
  try {
    const stored = game.settings.get(MODULE_ID, "campaignState");
    campaignState = stored ? foundry.utils.deepClone(stored) : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | swearVow: campaignState read failed:`, err?.message ?? err);
  }

  const actors = getPlayerActors() ?? [];
  const plan   = buildSwearVowPlan(meta, {
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
      // vow → connection (#241) — a person only (issue #326 W70)
      linkedConnectionName: meta?.target?.name && isPersonTarget(meta.target) ? meta.target.name : null,
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

  // 2. The vow's target, recorded as a person (its NPC card) and linked to the
  //    vow — never made anyone's connection (overhaul 4, D5). This REVERSES
  //    the settled decision of issue #241 and issue #321 U23, which made the
  //    target every swearer's connection so the swear could take its +1: by
  //    the rules a vow is sworn +1 only to someone already a connection, and
  //    a connection is what Make a Connection makes. The sworn card offers
  //    🤝 Make a Connection to each who swore (applyVowTargetMakeConnection).
  //    D5 is the design's first decision to take back if the opening reads
  //    worse for it.
  let connection = null;
  if (plan.createTarget && campaignState) {
    try {
      const { createConnection } = await import("../entities/connection.js");
      connection = await createConnection({
        name:                      meta.target.name,
        description:               meta.target.description ?? "",
        // Pronouns the opening prose established (splitVowTarget) — with
        // them set, seedConnectionActor keeps them instead of rolling a
        // random set against the fiction (CHAR-NPC-PRONOUN-ROLL-BLIND).
        pronouns:                  meta.target.pronouns ?? "",
        sectorId:                  campaignState.activeSectorId ?? null,
        portraitSourceDescription: meta.target.description ?? "",
      }, campaignState);
      await postCreationEnrichment("connection", connection, campaignState).catch(err =>
        console.warn(`${MODULE_ID} | swearVow: connection enrichment failed:`, err));
      // The opening scene recorded who they are and what is at stake under
      // their name, before this card existed (issue #286 A3).
      await promoteNewEntityLedgerSubjects(meta.target.name, "connection", connection, campaignState);
      // A person recorded: their agenda is planned (issue #353 Phase 4 — the
      // plan is about the NPC's card, connection or not; overhaul 4 keeps it
      // for the person the vow concerns).
      const { planNpcAgenda } = await import("../world/secrets.js");
      await planNpcAgenda(connection, { campaignState, trigger: "vow_target" });
    } catch (err) {
      console.error(`${MODULE_ID} | swearVow: vow-target connection create failed:`, err);
      ui?.notifications?.warn(
        `Starforged Companion: vow created, but adding ${meta.target.name} failed — see console.`,
      );
    }
  }

  // The vow is linked to its target's NPC card, by the card's id — the card
  // made just above, or the one that was already in the world (known-issues
  // VOW-CONNECTION-LINK-BY-NAME: by the name alone, a rename lost the link).
  if (meta?.target?.name && isPersonTarget(meta.target)) {
    try {
      const { reconcileVowLinks } = await import("../entities/connection.js");
      await reconcileVowLinks();
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: the vow's link to ${meta.target.name} keeps their name only:`, err?.message ?? err);
    }
  }

  await postSwornConfirmation({ plan, actors: sworn, connection, crisis, campaignState });
  await markCardSworn(message).catch(err =>
    console.debug?.(`${MODULE_ID} | swearVow: card sworn-state update skipped:`, err?.message ?? err));

  // Vow-swearing scene (#241 follow-up): a brief Iron-truth-grounded scene of the
  // oath being made. Dynamic import avoids a static narrator.js dependency cycle.
  try {
    const { narrateAndPostVowSwearing } = await import("../narration/narrator.js");
    // The vow's id: its plan is about this vow (issue #353 Phase 4).
    await narrateAndPostVowSwearing({ vow: { ...plan.vow, vowId: message.id }, campaignState, speakerActorId });
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

/** The vow target's NPC card id (its host Actor's), found by the record it holds, or null. */
function targetHostId(record, campaignState) {
  const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
  const ids = [...new Set([...(campaignState?.connectionIds ?? []), ...(stored?.connectionIds ?? [])])];
  for (const id of ids) {
    const actor = globalThis.game?.actors?.get?.(id) ?? null;
    const f = actor?.flags?.[MODULE_ID];
    if (f?.entityType === "connection" && (f.entityId === record?._id || f.connection?._id === record?._id)) return id;
  }
  return null;
}

/** The sworn card's claim for one PC's Make a Connection. */
function vowTargetMoveClaim(actorId) {
  return `connectionMoveBy_${String(actorId ?? "").replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * gmRelay handler for "vow.makeConnection" — the sworn card's 🤝 Make a
 * Connection (overhaul 4, D5): the inciting vow's target was recorded as a
 * person, and a connection with them is made by the move. One press a sworn
 * PC (`swornActorIds`), its player's or a GM's (applyCardRollerFollowup):
 * Make a Connection posted as that PC, the person's card its target.
 *
 * @param {{ messageId?: string, actorId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export function applyVowTargetMakeConnection(payload = {}, ctx = {}) {
  const actorId = typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null;
  return applyCardRollerFollowup(payload, ctx, {
    label: "make a connection (vow target)", claim: vowTargetMoveClaim(actorId),
    isCard: (f) => f.vowSwornCard === true && typeof f.vowTarget?.name === "string" && !!f.vowTarget.name,
    offers: (f) => !!actorId && Array.isArray(f.swornActorIds) && f.swornActorIds.includes(actorId),
    roller: () => actorId,
    build: (f) => ({
      content: `I make a connection with ${f.vowTarget.name}.`,
      flags: {
        forcedMoveId: "make_a_connection", forcedMoveTarget: f.vowTarget.name,
        ...(typeof f.vowTarget.hostId === "string" && f.vowTarget.hostId ? { forcedMoveTargetId: f.vowTarget.hostId } : {}),
      },
    }),
  });
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
async function postSwornConfirmation({ plan, actors, connection, crisis = null, campaignState = null }) {
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
  // The target is a person, not a connection (D5): recorded, the vow tied to
  // them, and Make a Connection offered to each who swore.
  let vowTarget = null;
  const swornIds = (actors ?? []).map(a => a?.id).filter(id => typeof id === "string" && id);
  if (connection) {
    const hostId = targetHostId(connection, campaignState);
    vowTarget = { name: connection.name ?? "", hostId };
    lines.push(`<p>✦ <strong>${escapeHtml(connection.name)}</strong> recorded — the vow is sworn to them; ` +
      `they are not yet anyone's connection (find them in the Entities panel; use ✦ Finalise for a portrait).</p>`);
    if (swornIds.length) {
      lines.push(`<div class="sf-milestone-suggest-row">` + (actors ?? []).filter(a => a?.id).map(a =>
        `<button type="button" class="sf-followup-btn" data-action="sf-vow-make-connection" data-actor-id="${escapeHtml(a.id)}" ` +
        `title="Roll Make a Connection for ${escapeHtml(a.name ?? "")}, with ${escapeHtml(connection.name)}">` +
        `🤝 Make a Connection${swornIds.length > 1 ? ` (${escapeHtml(a.name ?? "")})` : ""}</button>`).join("") + `</div>`);
    }
  } else if (plan.targetNotice) {
    lines.push(`<p><em>${escapeHtml(plan.targetNotice)}</em></p>`);
  }
  try {
    await ChatMessage.create({
      content: `<div class="sf-vow-sworn-card">${lines.join("")}</div>`,
      flags:   { [MODULE_ID]: { vowSwornCard: true, ...(vowTarget ? { vowTarget, swornActorIds: swornIds } : {}) } },
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
    // The sworn card's 🤝 Make a Connection, one a sworn PC (D5): relayed to
    // the canonical GM ("vow.makeConnection" → applyVowTargetMakeConnection).
    if (flags?.vowSwornCard && flags.vowTarget) {
      root.querySelectorAll('[data-action="sf-vow-make-connection"]').forEach((btn) => {
        const actorId = btn.dataset.actorId ?? "";
        const claim = vowTargetMoveClaim(actorId);
        if (liveFlags(message)?.[claim]) { btn.disabled = true; return; }
        const fresh = btn.cloneNode(true);
        btn.replaceWith(fresh);
        fresh.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          fresh.disabled = true;
          await relayCardAction({
            kind:       "vow.makeConnection",
            payload:    { messageId: message?.id ?? null, actorId },
            isResolved: () => !!liveFlags(message)?.[claim],
            restore:    () => { fresh.disabled = false; },
          });
        });
      });
      return;
    }
    if (!flags?.incitingIncidentCard || !flags?.incitingMeta?.vow) return;

    const btn = root.querySelector('[data-action="sf-swear-vow"]');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Stays disabled — the roll is firing; re-enabled if the post itself
      // fails, or if the session gate drops it (rearmSwearOnGateRefusal). The
      // wait is set before the post: on the canonical GM the gate's notice
      // can come back before the post's own create resolves.
      fresh.disabled = true;
      const cardId = message?.id ?? null;
      if (cardId) awaitSessionGate(cardId, () => { fresh.disabled = false; });
      executeSwearVow(message)
        .then(posted => {
          if (posted) return;
          if (cardId) _swearAwaitingGate.delete(cardId);
          fresh.disabled = false;
        })
        .catch(err => {
          console.error(`${MODULE_ID} | swearVow: execute failed:`, err);
          fresh.disabled = false;
        });
    });
  });
  Hooks.on("createChatMessage", rearmSwearOnGateRefusal);
}

// Inciting cards whose ⚔ this client pressed → re-arm that press's button.
// The card is not claimed: before Begin a Session the gate drops the forced
// post and whispers "press the button again" (issue #329 X14), and the
// disabled button could not be pressed again here until a reload (issue #337
// Y36). Bounded: the oldest is forgotten (a press that rolled is never
// refused, and its card is rewritten sworn).
const _swearAwaitingGate = new Map();
const SWEAR_AWAITING_GATE_MAX = 20;

function awaitSessionGate(cardId, rearm) {
  _swearAwaitingGate.delete(cardId);
  _swearAwaitingGate.set(cardId, rearm);
  while (_swearAwaitingGate.size > SWEAR_AWAITING_GATE_MAX) {
    _swearAwaitingGate.delete(_swearAwaitingGate.keys().next().value);
  }
}

/**
 * createChatMessage: the session gate's notice naming the forced ⚔ post it
 * dropped (`gatedMessageId`) re-arms the button that made it — only on the
 * post's author's client: the button disabled itself there alone. So does a
 * Batch Mode round's notice that the press was not rolled because the crew's
 * swear is already on its way (`swearPressDropped`, src/batch/driver.js —
 * issue #342 Z30), and the pipeline's "Not rolled" notice — the press met
 * another move's lock, its confirm was cancelled or its reading failed
 * (`moveNotRolledNotice`, index.js — issue #347 AB06).
 *
 * @param {ChatMessage} notice
 */
function rearmSwearOnGateRefusal(notice) {
  const f = notice?.flags?.[MODULE_ID];
  const postId = (f?.sessionGateNotice || f?.swearPressDropped || f?.moveNotRolledNotice) ? f.gatedMessageId : null;
  if (!postId || !_swearAwaitingGate.size) return;
  const post = globalThis.game?.messages?.get?.(postId) ?? null;
  const cardId = post?.flags?.[MODULE_ID]?.incitingSwearMessageId ?? null;
  if (!cardId || !_swearAwaitingGate.has(cardId)) return;
  const postAuthorId = post.author?.id ?? post._source?.author ?? null;
  if (postAuthorId !== game.user?.id) return;
  const rearm = _swearAwaitingGate.get(cardId);
  _swearAwaitingGate.delete(cardId);
  console.debug?.(`${MODULE_ID} | swearVow: no session had begun — the ⚔ press was not rolled; its button is live again.`);
  rearm();
}

// Quotes too: the card's attributes take these strings — a connection named
// with a quoted nickname (`Mara "Doc" Reyes`) closed the link picker's
// `<option value="…">`, so its Link sent "Mara " (issue #331 X21).
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared inciting-vow: cross-PC progress sync + GM relay
// ─────────────────────────────────────────────────────────────────────────────

/** Every copy of a shared vow across the roster. */
function sharedVowCopies(vowId, allActors) {
  const out = [];
  for (const actor of allActors ?? []) {
    for (const item of (actor.items ?? [])) {
      const f = item.flags?.[MODULE_ID];
      if (f?.sharedVow && f.vowId === vowId) out.push(item);
    }
  }
  return out;
}

/** The update that brings a copy to `target` — the fields that differ; null when none. */
function syncUpdateFor(item, target) {
  const update = {};
  for (const [field, value] of Object.entries(target)) {
    if (item.system?.[field] !== value) update[`system.${field}`] = value;
  }
  return Object.keys(update).length ? update : null;
}

/**
 * Wire the reward-choice card (#241 Phase 2): picking one of the two proposed
 * rewards, or writing your own, stamps it on the vow (promised). The pick is
 * relayed to the canonical GM ("vow.reward" → applyRewardPickFromRelay), which
 * claims the card once (`rewardChosen`) — the disable was the clicker's DOM
 * only, so another client or a re-render re-armed the buttons — and never
 * re-promises a reward already granted or lost (issue #325 W11). A pick of a
 * proposed option carries, beside its index, the option's text as this render
 * of the card showed it: the card's options can be replaced while it is open
 * (reproposeVowRewards), and the GM refuses a click made on the options as
 * they were (issue #364 VOW-CARD-RENAME-NO-GM).
 */
export function registerRewardChoiceHook() {
  if (registerRewardChoiceHook._installed) return;
  registerRewardChoiceHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.rewardChoiceCard) return;
    const buttons = () => root.querySelectorAll("button");
    const live = () => liveFlags(message);
    if (live()?.rewardChosen) {
      buttons().forEach(b => { b.disabled = true; });
      return;
    }
    // The options this render shows — the card's own, read now: an update that
    // replaces them re-renders the card, and a click on this render names what
    // it showed (issue #364 VOW-CARD-RENAME-NO-GM).
    const shown = (Array.isArray(f.rewardOptions) ? f.rewardOptions : []).map(o => String(o?.description ?? ""));
    const relay = async (payload) => {
      buttons().forEach(b => { b.disabled = true; });
      await relayCardAction({
        kind:       "vow.reward",
        payload:    { messageId: message?.id ?? null, ...payload },
        isResolved: () => !!live()?.rewardChosen,
        restore:    () => buttons().forEach(b => { b.disabled = false; }),
      });
    };
    root.querySelectorAll('[data-action="sf-reward-pick"]').forEach((btn) => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = Number(fresh.dataset.idx);
        if (!Number.isInteger(idx)) return;
        await relay({ idx, ...(shown[idx] ? { text: shown[idx] } : {}) });
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
        await relay({ own: text });
      });
    }
  });
}

/** The card's flags as the world holds them now (the render's copy otherwise). */
function liveFlags(message) {
  const stored = message?.id ? (globalThis.game?.messages?.get?.(message.id) ?? null) : null;
  return (stored ?? message)?.flags?.[MODULE_ID] ?? null;
}

/**
 * The player character holding the vow Item `vowId` (its id or its module
 * `vowId` flag), or null.
 *
 * @param {string|null} vowId
 * @returns {string|null} the actor id
 */
function vowHolderActorId(vowId) {
  if (typeof vowId !== "string" || !vowId) return null;
  for (const actor of getPlayerActors()) {
    const holds = (actor?.items?.contents ?? []).some(i => i?.id === vowId || i?.flags?.[MODULE_ID]?.vowId === vowId);
    if (holds) return actor.id;
  }
  return null;
}

/**
 * gmRelay handler for "vow.reward" — runs on the canonical GM (issue #325
 * W11). A reward-choice card's pick — one of its proposed options (`idx`, from
 * the GM-authored card's `rewardOptions`) or the clicker's own words (`own`,
 * at most 120 characters) — promises that reward on every copy of the vow.
 * One pick per card: the card is claimed (`rewardChosen`) before the write,
 * behind the in-flight guard. A vow whose reward was already granted or lost
 * (a won fight's grant, a forsaken vow) is never re-promised: the old card's
 * pick set it "promised" again and the next linked win or the fulfilment
 * granted a second reward. A vow fulfilled or forsaken on every copy with no
 * reward chosen is refused too, the card closed and the presser told —
 * nothing would ever grant it (issue #345 AA52). Any user may pick, as the
 * card is the table's.
 *
 * A pick of an option names it twice — its index and its `text`, the option
 * as the clicker's card showed it. The card's options are replaced in place
 * when its vow gets a name (reproposeVowRewards), so an index alone promised
 * whatever sat there once a click made on the old options landed: a `text`
 * that is not the card's option at that index is refused (`option-changed`),
 * nothing promised, the card left open and the clicker told to choose again
 * (issue #364 VOW-CARD-RENAME-NO-GM). The reward promised is always the
 * card's own option — the click's text is compared, never used. A pick with
 * no `text` (a page loaded before the click carried it) is taken by its index.
 *
 * @param {{ messageId?: string, idx?: number, text?: string, own?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyRewardPickFromRelay(payload = {}, _ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) return { applied: false, reason: "no-message" };
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.rewardChoiceCard || !f.vowId) return { applied: false, reason: "not-a-reward-card" };
  const key = `${messageId}:reward`;
  if (f.rewardChosen || _rewardPicksInFlight.has(key)) {
    console.debug(`${MODULE_ID} | swearVow: reward card ${messageId} already chosen — ignoring the pick.`);
    return { applied: false, reason: "already-chosen" };
  }
  const opts = Array.isArray(f.rewardOptions) ? f.rewardOptions : [];
  const own  = typeof payload.own === "string" ? payload.own.trim().slice(0, 120) : "";
  const opt  = Number.isInteger(payload.idx) ? opts[payload.idx] : null;
  // The option the clicker pressed is not the one the card has at that index
  // now: its options were replaced as the click was made.
  if (Number.isInteger(payload.idx) && typeof payload.text === "string" && payload.text !== String(opt?.description ?? "")) {
    console.warn(`${MODULE_ID} | swearVow: reward card ${messageId}'s options changed as option ${payload.idx} was chosen — nothing promised.`);
    await postVowWriteRefusedNotice(_ctx,
      "The rewards offered on this card changed as you chose — nothing was promised. Choose again from the card as it is now.",
      { title: "Reward not set" });
    return { applied: false, reason: "option-changed" };
  }
  const reward = opt?.description ? { description: String(opt.description), form: opt.form ?? "gear" }
    : own ? { description: own, form: "gear" } : null;
  if (!reward) return { applied: false, reason: "not-on-card" };

  _rewardPicksInFlight.add(key);
  try {
    const settled = vowRewardStatuses(f.vowId).find(s => s === "granted" || s === "lost");
    if (settled) {
      console.warn(`${MODULE_ID} | swearVow: the vow's reward is already ${settled} — not promised again.`);
      await message.update({ [`flags.${MODULE_ID}.rewardChosen`]: settled }).catch(() => {});
      return { applied: false, reason: settled };
    }
    // A vow already fulfilled or forsaken on every copy can never pay a
    // reward out — a fulfilment pays once, and the won-fight ladders skip a
    // completed vow — so a pick on its old card is not "set": the card is
    // closed and the presser told (issue #345 AA52 — it was promised on the
    // finished vow and "🎁 Reward set" posted).
    const closed = vowClosedEverywhere(f.vowId);
    if (closed) {
      console.warn(`${MODULE_ID} | swearVow: the vow is ${closed} — no reward promised.`);
      await message.update({ [`flags.${MODULE_ID}.rewardChosen`]: `vow-${closed}` })
        .catch(err => console.warn(`${MODULE_ID} | swearVow: closing reward card ${messageId} failed:`, err?.message ?? err));
      await postVowWriteRefusedNotice(_ctx, closed === "forsaken"
        ? "This vow was forsaken — no reward can be promised on it; the card is closed."
        : "This vow is already fulfilled — a reward chosen now would never be granted; the card is closed.",
      { title: "Reward not set" });
      return { applied: false, reason: `vow-${closed}` };
    }
    try {
      await message.update({ [`flags.${MODULE_ID}.rewardChosen`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: reward card ${messageId} could not be claimed — nothing promised:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }
    // The vow must hold the reward before the card says so: a refused write
    // left no reward on the vow — the fulfilment granted none — while the
    // card said "Reward set" and stayed claimed (issue #329 X07). The claim is
    // released so the pick can be made again, and the presser told. A vow no
    // character holds (its Item deleted — one whose vowId flag never landed
    // is found by its Item id, VOW-ID-NEVER-LANDED) can hold no pick: the
    // card is closed and the presser told why — "Choose it again" asked for a
    // retry that could never land (issue #336 Y27).
    const saved = await setSharedVowReward(f.vowId, { status: "promised", ...reward });
    if (!saved.ok && saved.reason === "no-copy") {
      await message.update({ [`flags.${MODULE_ID}.rewardChosen`]: "no-vow" })
        .catch(err => console.warn(`${MODULE_ID} | swearVow: closing reward card ${messageId} failed:`, err?.message ?? err));
      await postVowWriteRefusedNotice(_ctx, "No character holds this vow any more — nothing to promise; the card is closed.");
      return { applied: false, reason: "no-copy" };
    }
    if (!saved.ok) {
      await message.update({ [`flags.${MODULE_ID}.rewardChosen`]: null })
        .catch(err => console.warn(`${MODULE_ID} | swearVow: releasing reward card ${messageId} failed:`, err?.message ?? err));
      await postVowWriteRefusedNotice(_ctx, "The reward could not be saved on the vow — nothing was promised. Choose it again.");
      return { applied: false, reason: "write-refused" };
    }
    await ChatMessage.create({
      content: `<p class="sf-incite-sworn">🎁 Reward set: <em>${escapeHtml(reward.description)}</em></p>`,
      flags:   { [MODULE_ID]: { rewardSetCard: true } },
    }).catch(err => console.warn(`${MODULE_ID} | swearVow: reward-set card failed:`, err?.message ?? err));
    return { applied: true };
  } finally {
    _rewardPicksInFlight.delete(key);
  }
}

const _rewardPicksInFlight = new Set();

/**
 * Tell the presser — and the GMs — that a vow card's pick did not land (a
 * refused vow write, issue #329 X07): whispered, so it never reads as the
 * story. Never throws.
 *
 * @param {{ requesterId?: string|null }} ctx — the relay context
 * @param {string} text
 * @param {{ title?: string }} [opts] — the heading ("Not saved"; a refused
 *   swear's "Not sworn")
 */
async function postVowWriteRefusedNotice(ctx, text, { title = "Not saved" } = {}) {
  const gmIds = Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM).map(u => u.id);
  const whisper = [...new Set([ctx?.requesterId ?? globalThis.game?.user?.id ?? null, ...gmIds].filter(Boolean))];
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`,
    whisper,
    flags: { [MODULE_ID]: { vowWriteRefusedNotice: true } },
  }).catch(err => console.warn(`${MODULE_ID} | swearVow: the not-saved notice failed:`, err?.message ?? err));
}

/**
 * Whether every copy of a vow (by its vowId, on every PC) is closed —
 * "forsaken" when a closed copy carries the Forsake Your Vow flag, else
 * "fulfilled" — or null while any copy is open, or no PC holds one (the
 * pick's `no-copy` path says that). Issue #345 AA52.
 *
 * @param {string} vowId
 * @returns {"fulfilled"|"forsaken"|null}
 */
function vowClosedEverywhere(vowId) {
  // readVows names a copy by its vowId flag or its own Item id, as isVowCopy.
  const copies = getPlayerActors().flatMap(a => readVows(a)).filter(v => v.vowId === vowId || v.id === vowId);
  if (!copies.length || copies.some(v => !v.completed)) return null;
  return copies.some(v => v.forsaken) ? "forsaken" : "fulfilled";
}

/**
 * Every copy's reward status for a vow, by its vowId (copies on every PC —
 * actorBridge isVowCopy). A copy found by its Item id may carry no module
 * flags at all — a sheet vow both of whose createItem stamps the world
 * refused — so the read is guarded: it threw, and every reward pick on the
 * vow failed with nothing said (issue #342 Z55).
 */
function vowRewardStatuses(vowId) {
  const out = [];
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (isVowCopy(item, vowId)) {
        const status = item.flags?.[MODULE_ID]?.reward?.status;
        if (typeof status === "string") out.push(status);
      }
    }
  }
  return out;
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
  Hooks.on("updateItem", async (item, change, options) => {
    try {
      if (!isCanonicalGM()) return;
      if (item?.type !== "progress") return;
      const f = item.flags?.[MODULE_ID];
      if (!f?.sharedVow || !f.vowId) return;
      if (options?.[MODULE_ID]?.[VOW_MIRROR_OPTION]) return;          // our own sibling write
      const sys = change?.system ?? {};
      // The values this change set — only the synced fields it touched.
      const fields = {};
      for (const field of SHARED_VOW_SYNC_FIELDS) {
        if (field in sys && sys[field] !== undefined && sys[field] !== null) fields[field] = sys[field];
      }
      if (!Object.keys(fields).length) return;                         // only progress changes

      // Queued, newest value per field: a change that lands mid-pass is the
      // next pass, never dropped (issue #322 V32 — the in-flight guard
      // discarded it, as the shared supply's did before issue #300 F05).
      const sync = _vowSync.get(f.vowId) ?? { running: false, next: null };
      _vowSync.set(f.vowId, sync);
      sync.next = { ...(sync.next ?? {}), ...fields };
      if (sync.running) return;                                        // the running pass picks it up
      sync.running = true;
      try {
        while (sync.next) {
          const target = sync.next;
          sync.next = null;
          for (const copy of sharedVowCopies(f.vowId, getPlayerActors())) {
            // A newer change: this pass's fields join it and its pass writes
            // every copy — an older planned write never lands on a copy
            // edited meanwhile (issue #306 R03's rule for the supply).
            if (sync.next) { sync.next = { ...target, ...sync.next }; break; }
            const update = syncUpdateFor(copy, target);
            if (!update) continue;
            // Each copy's write stands alone, as the supply sync's does (issue
            // #331 X52): a refused copy is warned and named to the GM, and the
            // pass goes on to the other copies and to a change queued
            // meanwhile — it threw out of the pass, skipping the copies after
            // it and stranding that change until the vow's next edit.
            try {
              await copy.update(update, { [MODULE_ID]: { [VOW_MIRROR_OPTION]: true } });
            } catch (err) {
              const owner = copy.parent?.name ?? "a crewmate";
              console.warn(`${MODULE_ID} | swearVow: shared-vow sync — ${owner}'s copy of "${copy.name}" was not updated:`, err?.message ?? err);
              globalThis.ui?.notifications?.warn?.(`Shared vow: ${owner}'s copy of "${copy.name}" could not be updated — set it on their sheet.`);
            }
          }
        }
      } finally {
        sync.running = false;
        if (!sync.next) _vowSync.delete(f.vowId);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | swearVow: shared-vow sync failed:`, err?.message ?? err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Player-authored vows (#248 Theme B1): recognise a vow made on the sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure: should the module offer setup (reward + swear roll) for a just-created
 * Item? True only for a hand-made vow — a progress/subtype:"vow" Item with no
 * module vowId (so not an inciting/shared vow we created) that hasn't already
 * been offered. The caller checks the parent is a player character.
 *
 * @param {Item} item
 * @returns {boolean}
 */
export function shouldOfferVowSetup(item) {
  if (item?.type !== "progress") return false;
  if (String(item?.system?.subtype ?? "") !== "vow") return false;
  const f = item?.flags?.[MODULE_ID] ?? {};
  if (f.vowId) return false;            // module-created (inciting / shared) vow
  if (f.vowSetupOffered) return false;  // already offered for this vow
  return true;
}

/**
 * Whether a vow Item still carries the name the character sheet gave it
 * before its player named it: the sheet's + Vow creates the Item as its
 * subtype ("Vow") and only then opens it (vendor progress-controls.vue
 * addProgressItem) — or no name at all (issue #362 AC23).
 *
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
function isPlaceholderVowName(name) {
  const n = typeof name === "string" ? name.trim() : "";
  return !n || /^(?:new\s+|unnamed\s+)?vow$/i.test(n);
}

/**
 * Pure: the "new vow recorded" setup card HTML — states the mechanical stakes
 * and offers a ⚔ Swear it (roll) button. The reward-choice card is posted
 * alongside (same flow as swearing the inciting vow). Escapes its inputs.
 * A vow its player has not named yet (`unnamed` — the sheet's + Vow posts the
 * card before the Item is named or ranked) is worded as one: no name, no
 * rank's stakes, and the swear said to take the vow as its sheet then has it
 * (issue #362 AC23).
 *
 * @param {{ name: string, rank: string|null, connections?: string[], unnamed?: boolean }} vow
 * @returns {string}
 */
export function buildPlayerVowSetupHtml({ name, rank, connections = [], unnamed = false } = {}) {
  // A sheet-made vow's rank is the vendor's ChallengeRank number: the card
  // names it — "(formidable)", never "(3)" (issue #325 W01).
  if (rank != null && rank !== "") rank = rankName(rank);
  const vrank = rank ?? "dangerous";
  // Connection picker (#248 B-link): link this vow to a connection so fulfilling
  // it deepens that bond. Rendered only when connections exist — and brought
  // up to date when they come to (refreshVowCardLinkRows).
  const linkHtml = vowLinkRowHtml(connections);
  const what = unnamed
    ? `<p>A new vow — name it and set its rank on its sheet. ⚔ Swear it (roll) swears the vow as its sheet has it then.</p>`
    : `<p>"${escapeHtml(name ?? "Unnamed Vow")}"${rank ? ` <em>(${escapeHtml(rank)})</em>` : ""}</p>`
      + `<p class="sf-stakes"><em>${escapeHtml(progressPerMilestoneLine(vrank))} ${escapeHtml(legacyRewardLine(vrank, "Quests"))}</em></p>`;
  return `<div class="sf-card sf-player-vow"><div class="sf-card-header">🆕 New vow recorded</div>`
    + `<div class="sf-card-body">`
    + what
    + `<p><button type="button" class="entity-btn" data-action="sf-player-vow-swear">⚔ Swear it (roll)</button></p>`
    + linkHtml
    + vowLinkHintHtml(!!linkHtml)
    + `</div></div>`;
}

/** The player-vow card's 🤝 Link row for these connections, by name; nothing for none. */
function vowLinkRowHtml(connections) {
  if (!Array.isArray(connections) || !connections.length) return "";
  return `<p class="sf-vow-link">🤝 For a connection? `
    + `<select class="sf-vow-connection"><option value="">— none —</option>`
    + connections.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
    + `</select> <button type="button" class="entity-btn" data-action="sf-player-vow-link">Link</button></p>`;
}

/** The card's closing hint, which names the link only when the card offers one. */
function vowLinkHintHtml(hasLink) {
  return `<p class="sf-incite-hint">Pick a reward for it below${hasLink ? "; linking a connection makes fulfilling this vow deepen that bond" : ""}.</p>`;
}

/**
 * Pure: a player-vow card's content with its 🤝 Link row for the connections
 * the table has now — the row added, its names replaced, or the row taken
 * away when there are none. The rest of the card is left as it stands.
 * Content with no closing hint (not this card's shape) is returned unchanged.
 *
 * @param {string} content — the card's HTML
 * @param {string[]} connections — the connections' names
 * @returns {string}
 */
export function withVowLinkRow(content, connections) {
  const html = String(content ?? "");
  const tail = /(?:<p class="sf-vow-link">[\s\S]*?<\/p>)?<p class="sf-incite-hint">[\s\S]*?<\/p>/;
  if (!tail.test(html)) return html;
  const linkHtml = vowLinkRowHtml(connections);
  return html.replace(tail, () => linkHtml + vowLinkHintHtml(!!linkHtml));
}

/**
 * Bring the 🤝 Link row of every open, unlinked player-vow card up to date
 * with the connections the table has now. The row was written once, when the
 * card was posted: a vow recorded before its connection was met — Begin a
 * Session's vow, then the first NPC of the session — had no Link at all, and
 * no later way to get one (known-issues VOW-CARD-LINK-ONLY-AT-POSTING; found
 * while the long haul's charter was written, issue #373). Called when a
 * connection is created, renamed or deleted (src/entities/connection.js).
 * Canonical GM: one emitter for a shared card. Never throws.
 *
 * @param {{ campaignState?: Object|null }} [opts] — the state to read the
 *   connections from: the caller's, when it holds one the store does not yet
 * @returns {Promise<number>} how many cards changed
 */
export async function refreshVowCardLinkRows({ campaignState = null } = {}) {
  let changed = 0;
  try {
    if (!globalThis.game?.ready || !isCanonicalGM()) return 0;
    const cards = (globalThis.game?.messages?.contents ?? []).filter((m) => {
      const f = m?.flags?.[MODULE_ID];
      return f?.playerVowCard === true && !f.linkedConnection && !f.vowGone;
    });
    if (!cards.length) return 0;
    const connections = await connectionNamesForVowCard(campaignState);
    for (const card of cards) {
      const content = withVowLinkRow(card.content, connections);
      if (content === card.content) continue;
      await card.update({ content });
      changed += 1;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | playerVow: the vow cards' Link rows were not brought up to date:`, err?.message ?? err);
  }
  return changed;
}

/**
 * Pure: build a forced Swear an Iron Vow move post for a hand-made vow by name
 * (no inciting card behind it, so the GM-side swear branch just rolls + scenes —
 * the vow already exists). Returns null for an empty name.
 *
 * @param {string} vowName
 * @param {string|null} [linkedConnectionName] — the connection the vow is linked to
 * @param {string|null} [actorId] — the PC whose vow it is: the post speaks as
 *   them, so the swear's roll, momentum and oath scene are theirs whoever
 *   presses the button (issue #329 X05)
 * @param {string|null} [vowId] — the vow's stable id (its card's `vowId`): the
 *   swear's hidden plan is filed about the vow by it, so a vow reworded on the
 *   sheet, or fulfilled by a line that does not name it, keeps its plan
 *   (issue #362 AC14)
 * @returns {{ content: string, flags: object, speaker?: object } | null}
 */
export function buildSwearMovePostForName(vowName, linkedConnectionName = null, actorId = null, vowId = null) {
  const name = String(vowName ?? "").trim();
  if (!name) return null;
  const linked = typeof linkedConnectionName === "string" ? linkedConnectionName.trim() : "";
  return {
    content: `Swear an iron vow: ${name}.`,
    ...(typeof actorId === "string" && actorId ? { speaker: { actor: actorId } } : {}),
    flags: { [MODULE_ID]: {
      bypassPacing:     true,
      forcedMoveId:     "swear_an_iron_vow",
      forcedMoveTarget: name,
      ...(typeof vowId === "string" && vowId ? { forcedMoveTargetId: vowId } : {}),
      // Linked to a connection (🤝 Link): sworn to them — +1, or +2 bonded
      // (issue #325 W18).
      ...(linked ? { swearToConnection: linked } : {}),
    } },
  };
}

/**
 * Recognise a vow authored directly on the character sheet and offer it the
 * same setup as a sworn vow: a reward proposal + a ⚔ Swear it (roll) button
 * (#248 Theme B1). Single-emitter on the canonical GM (it writes Item flags +
 * proposes rewards). Skipped pre-`ready` (world load / import). Idempotent via
 * the vowSetupOffered flag. Register once on ready. Its card then follows the
 * vow's sheet — a rename, a rank change — until the vow is sworn from it
 * (the updateItem listener, followVowOnItsCard; issue #364
 * VOW-CARD-GENERIC-UNTIL-NAMED). An edit made while no GM was connected is
 * followed at the GM's next load (reconcileUnswornVowCards; issue #364
 * VOW-CARD-RENAME-NO-GM).
 */
export function registerPlayerVowHook() {
  if (registerPlayerVowHook._installed) return;
  registerPlayerVowHook._installed = true;
  Hooks.on("createItem", async (item) => {
    try {
      if (!globalThis.game?.ready) return;                       // skip world load / import
      if (!isCanonicalGM()) return;                              // single emitter + can write flags
      if (!isPlayerCharacterActor(item?.parent ?? null)) return;
      if (!shouldOfferVowSetup(item)) return;

      // Mark it (so edits/re-renders don't re-offer) and give it a vowId so the
      // reward-choice flow (setSharedVowReward, keyed by vowId) can find it.
      await item.setFlag?.(MODULE_ID, "vowSetupOffered", true).catch(() => {});
      await item.setFlag?.(MODULE_ID, "vowId", item.id).catch(() => {});

      const name = item.name ?? "Unnamed Vow";
      const rank = item.system?.rank ?? null;
      // The sheet's + Vow makes the Item as "Vow", at the default rank, and
      // opens it to be named: the card is worded for a vow still to be named,
      // and its rewards proposed for no name (issue #362 AC23; coverage SESS
      // D5). ⚔ Swear it swears the vow as the sheet has it then.
      const unnamed = isPlaceholderVowName(item.name);
      // Enumerate existing connections for the link picker (#248 B-link).
      const connections = await connectionNamesForVowCard();
      // actorId: the vow's holder — ⚔ Swear it posts as them (issue #329 X05).
      await ChatMessage.create({
        content: buildPlayerVowSetupHtml({ name, rank, connections, unnamed }),
        flags:   { [MODULE_ID]: { playerVowCard: true, vowName: name, vowId: item.id, actorId: item.parent?.id ?? null } },
      }).catch(err => console.warn(`${MODULE_ID} | playerVow: setup card failed:`, err?.message ?? err));

      // Same reward flow as swearing the inciting vow — propose two (or
      // write-your-own), stored on the vow as promised, delivered on fulfilment.
      try {
        const apiKey  = globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") ?? "";
        const options = await proposeRewards({ kind: "vow", target: unnamed ? null : name, apiKey });
        await postRewardChoiceCard(item.id, options);
      } catch (err) {
        console.warn(`${MODULE_ID} | playerVow: reward proposal failed:`, err?.message ?? err);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | playerVow: createItem hook failed:`, err?.message ?? err);
    }
  });
  // The vow named, or re-ranked, on its sheet: its card follows it (issue
  // #364 VOW-CARD-GENERIC-UNTIL-NAMED). Single emitter, as the card's post.
  Hooks.on("updateItem", async (item, change) => {
    try {
      if (!globalThis.game?.ready) return;
      if (!isCanonicalGM()) return;
      const renamed  = typeof change?.name === "string";
      const reranked = change?.system?.rank !== undefined || change?.["system.rank"] !== undefined;
      if (!renamed && !reranked) return;
      if (item?.type !== "progress" || String(item?.system?.subtype ?? "") !== "vow") return;
      if (!isPlayerCharacterActor(item?.parent ?? null)) return;
      await followVowOnItsCard(item);
    } catch (err) {
      console.warn(`${MODULE_ID} | playerVow: the vow's card was not brought in line with its sheet:`, err?.message ?? err);
    }
  });
}

/**
 * The connections the world has, by name — the player-vow card's link picker
 * (#248 B-link). From `campaignState` when one is given (a creator's own
 * copy, which lists a connection the store does not yet), else the store's.
 * Fail-open: none.
 */
async function connectionNamesForVowCard(campaignState = null) {
  try {
    const cs = campaignState ?? globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    const { getConnection } = await import("../entities/connection.js");
    return (cs.connectionIds ?? [])
      .map(hostId => getConnection(hostId)?.name)
      .filter(Boolean);
  } catch (err) {
    console.warn(`${MODULE_ID} | playerVow: connection enumeration failed:`, err?.message ?? err);
    return [];
  }
}

// Vow ids whose card is being given its vow's first name — one reward
// re-proposal for it, however many sheet edits land while its call is out.
const _vowCardsBeingNamed = new Set();

/**
 * Bring a sheet-made vow's "🆕 New vow recorded" card in line with the vow as
 * its sheet now has it (issue #364 VOW-CARD-GENERIC-UNTIL-NAMED). The sheet's
 * + Vow posts the card while the Item is still "Vow", worded for a vow still
 * to be named (issue #362 AC23), and nothing updated it: the card stayed
 * generic, and its rewards — proposed for no name — stayed generic, after the
 * player named the vow. Until the vow is sworn from the card, a rename or a
 * rank change on the sheet re-renders the card with the vow's name, rank and
 * that rank's stakes; and the first time the vow gets a name of its own, the
 * rewards on its reward-choice card are proposed again for that name
 * (reproposeVowRewards). The card is found by the vow's id, never its name.
 * Canonical GM (registerPlayerVowHook's updateItem hook).
 *
 * @param {Item} item — the vow, as updated
 * @returns {Promise<void>}
 */
async function followVowOnItsCard(item) {
  if (isPlaceholderVowName(item.name)) return;            // still to be named: its card says so
  const card = (globalThis.game?.messages?.contents ?? [])
    .filter(m => m?.flags?.[MODULE_ID]?.playerVowCard === true && isVowCopy(item, m.flags[MODULE_ID].vowId))
    .at(-1) ?? null;
  if (!card) return;
  const f = card.flags[MODULE_ID];
  const vowId = f.vowId;
  // Sworn: the swear took the vow as its sheet had it. Closed: no vow to show.
  if (f.swearRolled || f.vowGone) return;
  const naming = isPlaceholderVowName(f.vowName) && !_vowCardsBeingNamed.has(vowId);
  if (naming) _vowCardsBeingNamed.add(vowId);
  try {
    const content = buildPlayerVowSetupHtml({
      name: item.name, rank: item.system?.rank ?? null, connections: await connectionNamesForVowCard(), unnamed: false,
    });
    if (content !== card.content || f.vowName !== item.name) {
      await card.update({ content, [`flags.${MODULE_ID}.vowName`]: item.name });
    }
    if (naming) await reproposeVowRewards(vowId, item.name);
  } finally {
    if (naming) _vowCardsBeingNamed.delete(vowId);
  }
}

/**
 * Propose a vow's rewards again, for the name it now has, on its open
 * reward-choice card — the card's options and buttons replaced in place, so
 * one vow keeps one reward card. Nothing changes when a reward was already
 * chosen (before or while the proposal was out), or when no proposal comes
 * back (no Claude key, a failed call): the card's own options, and its
 * write-your-own field, stand. Canonical GM.
 *
 * @param {string} vowId
 * @param {string} name — the vow's name
 * @returns {Promise<void>}
 */
async function reproposeVowRewards(vowId, name) {
  const openCard = () => (globalThis.game?.messages?.contents ?? [])
    .filter(m => {
      const f = m?.flags?.[MODULE_ID];
      return f?.rewardChoiceCard === true && f.vowId === vowId && !f.rewardChosen;
    })
    .at(-1) ?? null;
  if (!openCard()) return;
  const apiKey  = globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") ?? "";
  const options = await proposeRewards({ kind: "vow", target: name, apiKey });
  if (!options.length) return;
  const card = openCard();   // a pick made while the call was out stands
  if (!card) return;
  await card.update({ content: buildRewardChoiceHtml(options), [`flags.${MODULE_ID}.rewardOptions`]: options });
}

// How many of the newest chat messages the load-time reconcile reads. A vow
// named while no GM was connected was made moments before — its card is among
// the last cards posted — so an old card is not looked for, and the whole
// chat log is never walked.
const VOW_CARD_RECONCILE_WINDOW = 200;

/**
 * Whether a named vow's card already shows the vow as its sheet has it: its
 * name (the card's `vowName`) and its rank, as the card words it.
 *
 * @param {ChatMessage} card — a player-vow card
 * @param {Item} item — its vow
 * @returns {boolean}
 */
function vowCardInStep(card, item) {
  if (card.flags?.[MODULE_ID]?.vowName !== item.name) return false;
  const rank = item.system?.rank ?? null;
  if (rank == null || rank === "") return true;
  return String(card.content ?? "").includes(`(${escapeHtml(rankName(rank))})`);
}

/** The vow Item a player-vow card is about — on the card's holder, else on any PC — or null when no character holds it. */
function vowItemOfCard(f) {
  const holder = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actors = getPlayerActors();
  for (const actor of [...actors.filter(a => a?.id === holder), ...actors.filter(a => a?.id !== holder)]) {
    const item = (actor?.items?.contents ?? []).find(i => isVowCopy(i, f.vowId));
    if (item) return item;
  }
  return null;
}

/**
 * Bring the unsworn "🆕 New vow recorded" cards in step with their vows at
 * load (issue #364 VOW-CARD-RENAME-NO-GM). The card follows its vow's sheet
 * through the canonical GM's updateItem listener (followVowOnItsCard), so a
 * vow named or re-ranked while no GM was connected — the GM's page reloading
 * as the player typed the name — was followed by nobody: the card, and its
 * rewards, stayed generic until the next edit of the vow.
 *
 * Canonical GM, at ready (index.js). Bounded: the newest
 * VOW_CARD_RECONCILE_WINDOW chat messages, each vow's newest card, open and
 * unsworn (no `swearRolled`, no `vowGone`), its vow still held by a character
 * and named. A card that already shows its vow's name and rank is left as it
 * is — no write, no Claude call; one that does not goes through
 * followVowOnItsCard, the listener's own path: the card re-rendered, and the
 * rewards proposed again only when the vow gets its first name here and no
 * reward was chosen. Never throws.
 *
 * @returns {Promise<void>}
 */
export async function reconcileUnswornVowCards() {
  try {
    if (!isCanonicalGM()) return;
    const recent = (globalThis.game?.messages?.contents ?? []).slice(-VOW_CARD_RECONCILE_WINDOW);
    const seen = new Set();
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const card = recent[i];
      const f = card?.flags?.[MODULE_ID];
      if (f?.playerVowCard !== true || typeof f.vowId !== "string" || !f.vowId || seen.has(f.vowId)) continue;
      seen.add(f.vowId);                                  // a vow's newest card is its card (followVowOnItsCard)
      if (f.swearRolled || f.vowGone) continue;
      const item = vowItemOfCard(f);
      if (!item || isPlaceholderVowName(item.name) || vowCardInStep(card, item)) continue;
      try {
        await followVowOnItsCard(item);
      } catch (err) {
        console.warn(`${MODULE_ID} | playerVow: the card of "${item.name}" was not brought in line with its sheet at load:`, err?.message ?? err);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | playerVow: the vow cards were not reconciled at load:`, err?.message ?? err);
  }
}

/**
 * Wire the ⚔ Swear it (roll) button on the player-vow setup card. A click
 * relays to the canonical GM ("vow.swearRoll" → applyPlayerVowSwearFromRelay),
 * which claims the card once (`swearRolled`) and posts the forced Swear an
 * Iron Vow for the vow (the pipeline rolls +heart → momentum / complication;
 * the vow already exists), spoken as the vow's holder (issue #329 X05). Only
 * the holder's player or a GM may press it (issue #338 D1). A card already
 * pressed renders the button disabled; a click that is not delivered re-arms
 * it. Register once.
 */
export function registerPlayerVowSwearHook() {
  if (registerPlayerVowSwearHook._installed) return;
  registerPlayerVowSwearHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.playerVowCard) return;
    const btn = root.querySelector('[data-action="sf-player-vow-swear"]');
    if (!btn) return;
    // Sworn, or closed because no character holds the vow (SWEAR-ROLL-VOW-GONE).
    const taken = () => !!(liveFlags(message)?.swearRolled || liveFlags(message)?.vowGone);
    if (taken()) {
      btn.disabled = true;
      return;
    }
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      fresh.disabled = true;
      await relayCardAction({
        kind:       "vow.swearRoll",
        payload:    { messageId: message?.id ?? null },
        isResolved: taken,
        restore:    () => { fresh.disabled = false; },
      });
    });
  });
}

/**
 * gmRelay handler for "vow.swearRoll" — runs on the canonical GM (issue #338
 * D1). The player-vow card's ⚔ Swear it (roll) posted the forced swear from
 * the presser's client, spoken as the vow's holder with no check of who
 * pressed: a crewmate swore another player's vow — their momentum, their
 * oath scene — and each client's press rolled it again. The
 * fulfilVow.attempt shape (cardActions.applyCardRollerFollowup): the holder
 * — the card's `actorId`, or the PC holding its `vowId` on an older card —
 * or a GM may press it, once per card (claim `swearRolled`); the swear speaks
 * as the holder and carries the vow's 🤝 link (`linkedConnection`). A card
 * that names neither its holder nor its vow is a GM's to press.
 *
 * A vow no character holds any more — its Item deleted — is sworn by nobody:
 * the swear still rolled, its momentum and an oath scene for a vow that no
 * longer existed (known-issues SWEAR-ROLL-VOW-GONE). Refused, the card is
 * closed (`vowGone`, as its 🤝 Link and reward pick close it — issue #336
 * Y27) and the presser and the GMs are told why.
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyPlayerVowSwearFromRelay(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const f = message?.flags?.[MODULE_ID] ?? {};
  if (f.playerVowCard === true && !f.swearRolled && (f.vowGone || (f.vowId && !vowHolderActorId(f.vowId)))) {
    console.warn(`${MODULE_ID} | swear it: no character holds the vow on card ${messageId} — nothing sworn.`);
    if (!f.vowGone) {
      await message.update({ [`flags.${MODULE_ID}.vowGone`]: true })
        .catch(err => console.warn(`${MODULE_ID} | swear it: closing card ${messageId} failed:`, err?.message ?? err));
    }
    await postVowWriteRefusedNotice(ctx, "No character holds this vow any more — nothing to swear; the card is closed.",
      { title: "Not sworn" });
    return { posted: false, reason: "no-copy" };
  }
  return applyCardRollerFollowup({ messageId }, ctx, {
    label: "swear it", claim: "swearRolled",
    isCard: (f) => f.playerVowCard === true,
    roller: (f) => (typeof f.actorId === "string" && f.actorId) ? f.actorId : vowHolderActorId(f.vowId),
    build:  (f, actor) => {
      // The vow as it stands on the sheet now (issue #362 AC23): the sheet's
      // + Vow makes the Item as "Vow" and only then opens it to be named, so
      // the card's `vowName` is the name it had when it was made — the oath
      // scene, the move and the plan were all about "Vow".
      const item = (actor?.items?.contents ?? []).find(i => isVowCopy(i, f.vowId));
      const name = typeof item?.name === "string" && item.name.trim() ? item.name : f.vowName;
      const post = buildSwearMovePostForName(name, f.linkedConnection ?? null, actor?.id ?? null, f.vowId ?? null);
      return post ? { content: post.content, flags: post.flags[MODULE_ID] } : null;
    },
  });
}

/**
 * Wire the 🤝 Link button on the player-vow setup card: links the vow to the
 * selected connection (#248 B-link), so fulfilling it deepens that bond. The
 * link is relayed to the canonical GM ("vow.link" →
 * applyPlayerVowLinkFromRelay), which claims the card once (`linkedConnection`)
 * — the disable was the clicker's DOM only (issue #325 W11). Register once.
 */
export function registerPlayerVowLinkHook() {
  if (registerPlayerVowLinkHook._installed) return;
  registerPlayerVowLinkHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.playerVowCard) return;
    const btn = root.querySelector('[data-action="sf-player-vow-link"]');
    if (!btn) return;
    // Linked, or closed because no character holds the vow (issue #336 Y27).
    const taken = () => !!(liveFlags(message)?.linkedConnection || liveFlags(message)?.vowGone);
    if (taken()) {
      btn.disabled = true;
      return;
    }
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const connectionName = root.querySelector(".sf-vow-connection")?.value?.trim();
      if (!connectionName) return;                 // nothing selected — leave the button live
      fresh.disabled = true;
      await relayCardAction({
        kind:       "vow.link",
        payload:    { messageId: message?.id ?? null, connectionName },
        isResolved: taken,
        restore:    () => { fresh.disabled = false; },
      });
    });
  });
}

/**
 * gmRelay handler for "vow.link" — runs on the canonical GM (issue #325 W11).
 * Links the player-vow card's vow (`vowId`) to a connection the world has —
 * picked by name, as the card's picker lists them — once per card: the card
 * is claimed (`linkedConnection`) before the write. Any user may link, as the
 * card is the table's. The vow is linked to that connection's NPC card, by
 * its id, when the name names one card (known-issues
 * VOW-CONNECTION-LINK-BY-NAME); a name two cards share links by name alone.
 *
 * @param {{ messageId?: string, connectionName?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyPlayerVowLinkFromRelay(payload = {}, _ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) return { applied: false, reason: "no-message" };
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.playerVowCard || !f.vowId) return { applied: false, reason: "not-a-vow-card" };
  if (f.linkedConnection) return { applied: false, reason: "already-linked" };
  if (f.vowGone) return { applied: false, reason: "no-copy" };
  const wanted = typeof payload.connectionName === "string" ? payload.connectionName.trim() : "";
  let connectionName = null;
  let connectionId   = null;
  try {
    const cs = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    const { getConnection } = await import("../entities/connection.js");
    const named = (cs.connectionIds ?? []).filter(id => { const n = getConnection(id)?.name; return n && n === wanted; });
    connectionName = named.length ? wanted : null;
    connectionId   = named.length === 1 ? named[0] : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | playerVow: connection lookup failed:`, err?.message ?? err);
  }
  if (!connectionName) return { applied: false, reason: "no-such-connection" };
  try {
    await message.update({ [`flags.${MODULE_ID}.linkedConnection`]: connectionName });
  } catch (err) {
    console.warn(`${MODULE_ID} | playerVow: card ${messageId} could not be claimed — not linked:`, err?.message ?? err);
    return { applied: false, reason: "claim-refused" };
  }
  // The vow must hold the link before the card says so (issue #329 X07): a
  // refused write is released for another press, and the presser told. A vow
  // no character holds can take no link: the Link is closed (`vowGone`, the
  // claim on a name the vow does not carry released) and the presser told
  // why (issue #336 Y27).
  const linked = await setVowLinkedConnection(f.vowId, connectionName, connectionId);
  if (!linked.ok && linked.reason === "no-copy") {
    await message.update({ [`flags.${MODULE_ID}.linkedConnection`]: null, [`flags.${MODULE_ID}.vowGone`]: true })
      .catch(err => console.warn(`${MODULE_ID} | playerVow: closing card ${messageId} failed:`, err?.message ?? err));
    await postVowWriteRefusedNotice(_ctx, "No character holds this vow any more — nothing to link; the card is closed.");
    return { applied: false, reason: "no-copy" };
  }
  if (!linked.ok) {
    await message.update({ [`flags.${MODULE_ID}.linkedConnection`]: null })
      .catch(err => console.warn(`${MODULE_ID} | playerVow: releasing card ${messageId} failed:`, err?.message ?? err));
    await postVowWriteRefusedNotice(_ctx, `The link to ${connectionName} could not be saved on the vow — it is not linked. Link it again.`);
    return { applied: false, reason: "write-refused" };
  }
  await ChatMessage.create({
    content: `<p class="sf-incite-sworn">🤝 Linked to <strong>${escapeHtml(connectionName)}</strong> — fulfilling this vow will deepen that bond.</p>`,
    flags:   { [MODULE_ID]: { vowLinkedCard: true } },
  }).catch(() => {});
  return { applied: true };
}
