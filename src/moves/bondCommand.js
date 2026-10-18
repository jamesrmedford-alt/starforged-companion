/**
 * STARFORGED COMPANION
 * src/moves/bondCommand.js — `!bond`: bonded Develop Your Relationship
 *
 * Per play kit p. 3: when developing a relationship with a bonded
 * connection, skip the normal progress mark. Instead, roll +their rank
 * (troublesome=+1 ... epic=+5) and:
 *   strong hit → mark 2 ticks on bonds legacy track
 *   strong + match → also raise the connection's rank by 1
 *   weak hit → +2 momentum
 *   miss → no lasting benefit
 *
 * Multiplayer split (2026-10 audit)
 * ---------------------------------
 * handleBondCommand() runs ONCE, on the authoring client (src/index.js chat
 * routing): it rolls the dice and posts the result card. The world writes —
 * bonds legacy ticks (campaignState), the connection rank raise + its bond-Item
 * mirror, and the momentum — need GM authority, so they are relayed to the
 * canonical GM as plain data via requestGmAction("bond.apply", …) and applied
 * by applyBondEffects(). Before this split a player's `!bond` only "worked"
 * because the GM's client re-ran the whole command with its own dice, and the
 * momentum landed on the GM's character (or the first PC), not the roller's.
 */

import { rollActionDie, rollChallengeDice, calcActionScore, calcOutcome } from "./resolver.js";
import { selectConnection, nextRank } from "./developRelationship.js";
import { showActionRoll } from "../dice/diceAnimation.js";
import { getPlayerActors, applyMeterChanges, setBondItemRank } from "../character/actorBridge.js";
import { resolveSpeakerActorId } from "../multiplayer/speaker.js";
import { requestGmAction } from "../multiplayer/gmRelay.js";
import { requesterOwnsActor } from "./burnMomentum.js";

const MODULE_ID = "starforged-companion";

// Rank → +X adds for the bonded-path Develop Your Relationship roll
// (play kit p. 3: troublesome=+1; dangerous=+2; formidable=+3; extreme=+4; epic=+5).
const BOND_ROLL_ADDS = {
  troublesome: 1,
  dangerous:   2,
  formidable:  3,
  extreme:     4,
  epic:        5,
};

/**
 * Handle a `!bond [rank] [name]` chat command on the authoring client: resolve
 * the bonded connection, roll, post the result card, and relay any lasting
 * effect to the canonical GM.
 *
 * @param {ChatMessage} message
 */
export async function handleBondCommand(message) {
  const text = message.content?.trim() ?? "";
  const rest = text.slice("!bond".length).trim();
  const firstToken = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
  const rankArg = firstToken in BOND_ROLL_ADDS ? firstToken : null;
  const nameArg = (rankArg ? rest.slice(firstToken.length) : rest).trim() || null;

  // Resolve which BONDED connection this roll develops: named explicitly, or
  // the sole bonded one. The resolved connection's own rank drives the adds
  // (and a hit-with-match raises its rank for real, matching the develop
  // pipeline); a bare rank arg stays as the untargeted fallback.
  const conn = await import("../entities/connection.js");
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const bondedConnections = (campaignState.connectionIds ?? [])
    .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(c => c && c.active !== false && c.bonded === true);
  const target = nameArg
    ? selectConnection(bondedConnections, nameArg)
    : (bondedConnections.length === 1 ? bondedConnections[0] : null);
  if (nameArg && !target) {
    ui.notifications?.warn(`Starforged Companion: no bonded connection matched "${nameArg}".`);
  }

  const rank = target?.rank ?? rankArg;
  if (!rank || !(rank in BOND_ROLL_ADDS)) {
    await ChatMessage.create({
      content: `<div class="sf-bond-card"><strong>Develop Your Relationship (bonded)</strong> <p>Usage: <code>!bond [rank] [name]</code> — name a bonded connection to use their rank (and raise it on a hit with a match), or give a bare rank for an untargeted roll.<br>Rank: <code>troublesome</code> · <code>dangerous</code> · <code>formidable</code> · <code>extreme</code> · <code>epic</code></p></div>`,
      flags:   { [MODULE_ID]: { bondCommandCard: true } },
    });
    return;
  }

  const adds          = BOND_ROLL_ADDS[rank];
  const actionDie     = rollActionDie();
  const challengeDice = rollChallengeDice();
  const actionScore   = calcActionScore(actionDie, 0, adds);
  const { outcome, isMatch } = calcOutcome(actionScore, challengeDice);

  // 3D dice for the bond roll (fire-and-forget, fail-open).
  void showActionRoll(actionDie, challengeDice);

  const matchBadge = isMatch ? " ✦ MATCH" : "";
  const raiseRank  = !!target && isMatch && outcome !== "miss" && target.rank !== "epic";
  const raisedRank = raiseRank ? nextRank(target.rank) : null;
  let body, momentumChange = 0, ticksOnBonds = 0;

  switch (outcome) {
    case "strong_hit":
      ticksOnBonds = 2;
      body = `<strong>Strong hit${matchBadge}.</strong> Mark 2 ticks on your bonds legacy track.`;
      break;
    case "weak_hit":
      momentumChange = 2;
      body = `<strong>Weak hit${matchBadge}.</strong> Take +2 momentum.`;
      break;
    case "miss":
      body = `<strong>Miss${matchBadge}.</strong> Take no lasting benefit.`;
      break;
  }
  if (raiseRank) {
    body += ` The match bolsters your standing — <strong>${escapeHtml(target.name)}</strong>'s rank rises to <strong>${raisedRank}</strong>.`;
  } else if (!target && isMatch && outcome !== "miss") {
    body += " You may also envision how recent events bolstered your connection's standing and raise their rank by one (if not already epic).";
  }

  const title = target
    ? `Develop Your Relationship (bonded: ${escapeHtml(target.name)}, ${escapeHtml(rank)})`
    : `Develop Your Relationship (bonded, ${escapeHtml(rank)})`;
  await ChatMessage.create({
    content: `<div class="sf-bond-card"><strong>${title}</strong><p>Action: ${actionDie} + ${adds} = <strong>${actionScore}</strong> vs Challenge ${challengeDice[0]}, ${challengeDice[1]}</p><p>${body}</p></div>`,
    flags:   { [MODULE_ID]: { bondCommandCard: true } },
  });

  if (ticksOnBonds === 0 && momentumChange === 0 && !raiseRank) {
    console.debug(`${MODULE_ID} | !bond: ${outcome} — no lasting effect to apply.`);
    return;
  }

  // Credit the roller (decisions.md → "Multiplayer attribution"): the momentum
  // goes to the typing player's PC, resolved from the message, never the GM's
  // character or the first PC in the world.
  await requestGmAction("bond.apply", {
    ticksOnBonds,
    momentumChange,
    raiseRank,
    targetHostId: raiseRank ? (target.__hostId ?? null) : null,
    targetName:   raiseRank ? (target.name ?? null)     : null,
    raisedRank,
    actorId:      resolveSpeakerActorId(message, campaignState),
  });
}

// The only lasting effects one `!bond` roll can produce (play kit p. 3): a
// strong hit marks 2 bonds-legacy ticks, a weak hit gives +2 momentum — never
// both. The relay payload is client-supplied (gmRelay.js "Trust model"), so
// the handler clamps to these values.
const BOND_LEGACY_TICKS = 2;
const BOND_MOMENTUM     = 2;

/**
 * gmRelay handler for "bond.apply" — runs on the canonical GM.
 *
 * Validates the client-supplied payload before writing: ticks and momentum
 * clamp to the legal {0, 2} (a request carrying both is refused — no single
 * roll yields both), the rank raise must name a real next rank, and the
 * momentum target must be a PC the requester owns (or the requester is a GM).
 *
 * @param {{ ticksOnBonds?: number, momentumChange?: number, raiseRank?: boolean,
 *           targetHostId?: string|null, targetName?: string|null,
 *           raisedRank?: string|null, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyBondEffects(payload = {}, ctx = {}) {
  const ticks    = clampEffect(payload.ticksOnBonds,   BOND_LEGACY_TICKS, "ticksOnBonds");
  let   momentum = clampEffect(payload.momentumChange, BOND_MOMENTUM,     "momentumChange");
  const raise    = payload.raiseRank === true
    && typeof payload.targetHostId === "string" && payload.targetHostId.length > 0
    && typeof payload.raisedRank === "string" && payload.raisedRank in BOND_ROLL_ADDS;

  if (ticks > 0 && momentum > 0) {
    console.warn(`${MODULE_ID} | !bond: relay asked for both legacy ticks and momentum — no single roll yields both; refused.`, payload);
    return { applied: false, reason: "invalid" };
  }
  if (payload.raiseRank === true && !raise) {
    console.warn(`${MODULE_ID} | !bond: rank raise requested without a valid target/rank — skipped.`, payload);
  }

  // Credit the roller — but only a PC the requester may act for.
  let momentumActor = null;
  if (momentum > 0) {
    const actorId = typeof payload.actorId === "string" ? payload.actorId : null;
    momentumActor = (actorId ? game.actors?.get?.(actorId) : null) ?? getPlayerActors()[0] ?? null;
    if (!momentumActor) {
      console.warn(`${MODULE_ID} | !bond: no player character to receive +${momentum} momentum.`);
      momentum = 0;
    } else if (!requesterOwnsActor(momentumActor, ctx)) {
      console.warn(`${MODULE_ID} | !bond: user ${ctx?.requesterId ?? "?"} does not own ${momentumActor.name} — momentum refused.`);
      momentumActor = null;
      momentum = 0;
    }
  }

  if (!ticks && !momentum && !raise) {
    console.debug(`${MODULE_ID} | !bond: relay carried no effect — nothing applied.`);
    return { applied: false };
  }

  if (ticks > 0) {
    // Route through addLegacyTicks so filled boxes award XP like every other
    // legacy write. Lazy import: index.js is the module entry (already loaded
    // in Foundry), and a static import would make this module a cycle.
    const { addLegacyTicks } = await import("../index.js");
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    addLegacyTicks(campaignState, "bonds", ticks);
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  }

  if (raise) {
    const conn = await import("../entities/connection.js");
    // The raise must be exactly one step up from the connection's CURRENT
    // rank, on a bonded connection — so a forged or repeated relay cannot
    // jump ranks or raise twice.
    const current = conn.getConnection(payload.targetHostId);
    const legal = current?.bonded === true
      && current.rank !== "epic"
      && nextRank(current.rank) === payload.raisedRank;
    if (!legal) {
      console.warn(
        `${MODULE_ID} | !bond: rank raise to "${payload.raisedRank}" is not the next rank of bonded connection ` +
        `${payload.targetHostId} (current: ${current?.rank ?? "none"}) — skipped.`,
      );
    } else {
      await conn.updateConnection(payload.targetHostId, { rank: payload.raisedRank }).catch(err =>
        console.warn(`${MODULE_ID} | !bond rank raise failed:`, err?.message ?? err));
      // Mirror onto the PCs' bond Items so CHARACTER STATE shows the raised
      // rank (NARR-BOND-RANK-STALE).
      await setBondItemRank(
        { connectionId: payload.targetHostId, name: payload.targetName ?? null },
        payload.raisedRank,
      ).catch(err =>
        console.warn(`${MODULE_ID} | !bond rank mirror failed:`, err?.message ?? err));
    }
  }

  if (momentum > 0 && momentumActor) {
    await applyMeterChanges(momentumActor, { momentum });
  }
  return { applied: true };
}

/**
 * Clamp a relayed effect count to {0, legal}. Anything else is a forged or
 * corrupted payload — warned, then clamped (a positive value to `legal`).
 */
function clampEffect(value, legal, label) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n !== legal) {
    console.warn(`${MODULE_ID} | !bond: relayed ${label}=${value} is not a legal roll result — clamped to ${legal}.`);
  }
  return legal;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
