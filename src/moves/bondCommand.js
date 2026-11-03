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
 * — developRelationship.js BONDED_DEVELOP_OUTCOMES, the table the move
 * pipeline's bonded roll pays from too (issue #322 V01).
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

import { rollActionDie, rollChallengeDice, calcActionScore, calcOutcome, cancelsActionDie } from "./resolver.js";
import { selectConnection, nextRank, bondedDevelopOutcome, BOND_ROLL_ADDS } from "./developRelationship.js";
import { showActionRoll } from "../dice/diceAnimation.js";
import { getPlayerActors, applyMeterChanges, setBondItemRank, readMomentumState } from "../character/actorBridge.js";
import { resolveSpeakerActorId } from "../multiplayer/speaker.js";
import { requestGmAction } from "../multiplayer/gmRelay.js";
import { requesterOwnsActor } from "./burnMomentum.js";

const MODULE_ID = "starforged-companion";

// The rank → adds table is developRelationship.js BOND_ROLL_ADDS, shared with
// the move pipeline's own bonded Develop roll (issue #314 Q06).

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

  // The roller: credited with the momentum, and whose negative momentum
  // cancels a matching action die, as on every action roll (issue #311 P01).
  const rollerId      = resolveSpeakerActorId(message, campaignState);
  const roller        = rollerId ? (game.actors?.get?.(rollerId) ?? null) : null;
  const adds          = BOND_ROLL_ADDS[rank];
  const actionDie     = rollActionDie();
  const challengeDice = rollChallengeDice();
  const dieCancelled  = cancelsActionDie(actionDie, roller ? readMomentumState(roller).value : null);
  const actionScore   = calcActionScore(dieCancelled ? 0 : actionDie, 0, adds);
  const { outcome, isMatch } = calcOutcome(actionScore, challengeDice);

  // 3D dice for the bond roll (fire-and-forget, fail-open).
  void showActionRoll(actionDie, challengeDice);

  const matchBadge = isMatch ? " ✦ MATCH" : "";
  // The pipeline's table (BONDED_DEVELOP_OUTCOMES): strong 2 ticks, weak +2
  // momentum, a match raising the rank on a strong hit only (issue #322 V01).
  const effect     = bondedDevelopOutcome(outcome, isMatch);
  const raiseRank  = !!target && effect.raiseRank && target.rank !== "epic";
  const raisedRank = raiseRank ? nextRank(target.rank) : null;
  let body;

  switch (outcome) {
    case "strong_hit":
      body = `<strong>Strong hit${matchBadge}.</strong> Mark ${effect.ticks} ticks on your bonds legacy track.`;
      break;
    case "weak_hit":
      body = `<strong>Weak hit${matchBadge}.</strong> Take +${effect.momentum} momentum.`;
      break;
    case "miss":
      body = `<strong>Miss${matchBadge}.</strong> Take no lasting benefit.`;
      break;
  }
  if (raiseRank) {
    body += ` The match bolsters your standing — <strong>${escapeHtml(target.name)}</strong>'s rank rises to <strong>${raisedRank}</strong>.`;
  } else if (!target && effect.raiseRank) {
    body += " You may also envision how recent events bolstered your connection's standing and raise their rank by one (if not already epic).";
  }

  const title = target
    ? `Develop Your Relationship (bonded: ${escapeHtml(target.name)}, ${escapeHtml(rank)})`
    : `Develop Your Relationship (bonded, ${escapeHtml(rank)})`;
  await ChatMessage.create({
    content: `<div class="sf-bond-card"><strong>${title}</strong><p>Action: ${dieCancelled ? `<s>${actionDie}</s> (cancelled by momentum -${actionDie})` : actionDie} + ${adds} = <strong>${actionScore}</strong> vs Challenge ${challengeDice[0]}, ${challengeDice[1]}</p><p>${body}</p></div>`,
    flags:   { [MODULE_ID]: { bondCommandCard: true } },
  });

  if (!effect.ticks && !effect.momentum && !raiseRank) {
    console.debug(`${MODULE_ID} | !bond: ${outcome} — no lasting effect to apply.`);
    return;
  }

  // Credit the roller (decisions.md → "Multiplayer attribution"): the momentum
  // goes to the typing player's PC, resolved from the message, never the GM's
  // character or the first PC in the world. The relay carries the roll's
  // result, not its effects: the GM pays it from the shared table.
  await requestGmAction("bond.apply", {
    outcome,
    isMatch,
    targetHostId: raiseRank ? (target.__hostId ?? null) : null,
    raisedRank,
    actorId:      rollerId,
  });
}

/**
 * gmRelay handler for "bond.apply" — runs on the canonical GM.
 *
 * The payload is client-supplied (gmRelay.js "Trust model"), so it carries the
 * roll's result — `outcome` and `isMatch` — and the handler pays it from
 * BONDED_DEVELOP_OUTCOMES, the table the move pipeline pays a bonded
 * development from: a strong hit 2 bonds-legacy ticks, a weak hit +2 momentum,
 * never both; anything else is refused. Each value is the table's, so a
 * request can never ask for more (the old clamp turned any tick count into 2
 * — issue #322 V01). A strong hit with a match raises the rank only to the
 * connection's real next rank, and the momentum goes only to a PC the
 * requester owns (or the requester is a GM).
 *
 * @param {{ outcome?: string, isMatch?: boolean, targetHostId?: string|null,
 *           raisedRank?: string|null, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyBondEffects(payload = {}, ctx = {}) {
  const effect = bondedDevelopOutcome(payload.outcome, payload.isMatch === true);
  if (!effect) {
    console.warn(`${MODULE_ID} | !bond: relayed outcome "${payload.outcome}" is not a roll result — refused.`, payload);
    return { applied: false, reason: "invalid" };
  }
  const ticks    = effect.ticks;
  let   momentum = effect.momentum;
  const raise    = effect.raiseRank
    && typeof payload.targetHostId === "string" && payload.targetHostId.length > 0
    && typeof payload.raisedRank === "string" && payload.raisedRank in BOND_ROLL_ADDS;

  if (effect.raiseRank && payload.targetHostId != null && !raise) {
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

  // A refused tick save is reported after the rest is applied: it threw
  // past the match's rank raise and the momentum (issue #326 W52).
  let ticksRefused = null;
  if (ticks > 0) {
    // Route through addLegacyTicks so filled boxes award XP like every other
    // legacy write. Lazy import: index.js is the module entry (already loaded
    // in Foundry), and a static import would make this module a cycle.
    const { addLegacyTicks, awardSavedLegacyXp } = await import("../index.js");
    // Marked on a copy (rules/foundry-api.md): the cached state took the
    // ticks before a write that could be refused, and the GM's next
    // whole-object write carried them into the world (issue #326 W51).
    const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const campaignState = { ...stored, legacyTracks: foundry.utils.deepClone(stored.legacyTracks ?? {}) };
    addLegacyTicks(campaignState, "bonds", ticks);
    try {
      await game.settings.set(MODULE_ID, "campaignState", campaignState);
      // The box XP once the ticks are saved — it was paid before the save,
      // so a refusal paid XP for ticks never saved (issue #326 W52).
      await awardSavedLegacyXp(campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | !bond: the bonds legacy ticks were not saved — no XP paid:`, err?.message ?? err);
      ticksRefused = err;
    }
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
      // rank (NARR-BOND-RANK-STALE). The Items are keyed by the record's own
      // `_id` and the record's name is read here, not the client's (issue #314
      // Q04 — the host Actor id matched no Item, and the name fallback hid it
      // until a rename).
      await setBondItemRank(
        { connectionId: current._id ?? null, name: current.name ?? null },
        payload.raisedRank,
      ).catch(err =>
        console.warn(`${MODULE_ID} | !bond rank mirror failed:`, err?.message ?? err));
    }
  }

  if (momentum > 0 && momentumActor) {
    await applyMeterChanges(momentumActor, { momentum });
  }
  if (ticksRefused) throw ticksRefused;
  return { applied: true };
}

/**
 * Clamp a relayed effect count to {0, legal}. Anything else is a forged or
 * corrupted payload — warned, then clamped (a positive value to `legal`).
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
