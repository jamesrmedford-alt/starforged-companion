/**
 * STARFORGED COMPANION
 * src/moves/statEnrichment.js — fill interpretation.statValue from the actor
 *
 * Why this exists
 * ---------------
 * The interpreter system prompt explicitly tells Claude to leave statValue
 * at 0 ("filled in from character sheet by the calling code" — see
 * src/moves/interpreter.js line 149). For a long stretch nothing in the
 * pipeline actually filled it in, so every action move resolved as
 * `actionDie + 0 + adds` — players reported "all rolls registering stats
 * as 0." The chat card showed `+iron (0)` and `Action: 6 + 0 + 0 = 6`
 * which made the bug visible the moment two players started rolling
 * against each other and comparing notes.
 *
 * What this does
 * --------------
 * Resolves the numeric value of the named stat off the speaker's Actor
 * snapshot:
 *   - action stats   (edge/heart/iron/shadow/wits) → snapshot.stats[name]
 *   - player meters  (health/spirit/supply/momentum) → snapshot.meters[name]
 *   - vehicle stat   (integrity) → command-vehicle Actor's
 *                                  flags[MODULE_ID].ship.integrity
 *   - companion_health → 0 with a console.warn — companion health lives
 *                                  on a Companion asset Item's track; not
 *                                  yet wired through. Logged so the next
 *                                  Companion Takes A Hit roll surfaces
 *                                  exactly what's missing.
 *
 * Progress moves are scored by the separate enrichProgressTicks() below.
 * The resolver reads a progress move's score from `interpretation.statValue`
 * (repurposed as the tick carrier — see resolver.js "statValue is repurposed
 * here to carry the progress ticks"); enrichProgressTicks fills it from the
 * live module data (combat/expedition journal tracks, actor vow Items,
 * connection records). Module data is ground truth — the interpreter is
 * instructed never to supply tick counts. enrichInterpretationStatValue
 * itself skips progress moves.
 */

import { readCharacterSnapshot } from "../character/actorBridge.js";
import { getCommandVehicleActor } from "./abilityScanner.js";
import { selectCombatTrack } from "./combat.js";
import { selectExpeditionTrack } from "./expedition.js";
import { selectVowTrack } from "./vow.js";
import { selectMilestoneVow } from "./milestone.js";
import { selectConnection } from "./developRelationship.js";

const MODULE_ID = "starforged-companion";

const ACTION_STATS = new Set(["edge", "heart", "iron", "shadow", "wits"]);
const PLAYER_METERS = new Set(["health", "spirit", "supply", "momentum"]);

// Moves that legitimately roll no stat (Fate moves / progress moves resolve
// without an action-die stat). A missing statUsed for these is expected, so it
// is logged at debug rather than warn — only a stat-bearing move missing its
// stat is worth a warning.
const NO_STAT_MOVES = new Set([
  "ask_the_oracle", "pay_the_price", "fulfill_your_vow", "forge_a_bond",
  "finish_an_expedition", "take_decisive_action", "reach_a_milestone",
]);

// Moves whose play-kit rule is "roll +X or +Y, whichever is higher".
// statEnrichment resolves both options and overrides interpretation.statUsed
// with the higher one so the move card reflects the actual roll.
const PICK_HIGHER_OF = {
  endure_harm:   ["health", "iron"],
  endure_stress: ["spirit", "heart"],
};

/**
 * Look up the numeric value of `statUsed` for this character.
 *
 * @param {Actor|null} actor — the speaker's character Actor
 * @param {Object}     interpretation — the parsed interpreter response,
 *   mutated in place with the resolved statValue. Carries statUsed,
 *   isProgressMove, progressTicks, moveId, moveName for diagnostics.
 * @param {Object}     campaignState — used to find the command vehicle
 *   when statUsed === "integrity".
 * @returns {number} the resolved statValue (also assigned onto
 *   interpretation.statValue as a convenience).
 */
export function enrichInterpretationStatValue(actor, interpretation, campaignState) {
  // Progress moves score from live track/vow/connection data — filled in
  // by enrichProgressTicks() below, not from an action stat. Leave
  // statValue alone here.
  if (interpretation?.isProgressMove) return interpretation.statValue ?? 0;

  // Play-kit "whichever is higher" rule for Endure Harm / Stress —
  // override the interpreter's pick with the higher of the two stats.
  const moveId = interpretation?.moveId;
  if (moveId && PICK_HIGHER_OF[moveId]) {
    const [a, b] = PICK_HIGHER_OF[moveId];
    const va = resolveStatValue(actor, a, campaignState);
    const vb = resolveStatValue(actor, b, campaignState);
    const winner = vb > va ? b : a;
    interpretation.statUsed  = winner;
    interpretation.statValue = Math.max(va, vb);
    return interpretation.statValue;
  }

  const statUsed = interpretation?.statUsed ?? null;
  if (!statUsed) {
    const moveId = interpretation?.moveId;
    const expected = NO_STAT_MOVES.has(moveId);
    const log = expected ? console.debug : console.warn;
    log?.(
      `${MODULE_ID} | statEnrichment: interpretation has no statUsed (move: ${moveId}); leaving statValue at 0.`,
    );
    interpretation.statValue = 0;
    return 0;
  }

  const value = resolveStatValue(actor, statUsed, campaignState);
  interpretation.statValue = value;
  return value;
}

/**
 * Resolve `statUsed` to a numeric value. Exported for test coverage.
 *
 * @returns {number}
 */
export function resolveStatValue(actor, statUsed, campaignState) {
  if (!statUsed) return 0;

  // Action stat — straight off the character snapshot.
  if (ACTION_STATS.has(statUsed)) {
    if (!actor) {
      warnMissingActor(statUsed);
      return 0;
    }
    const snap = readCharacterSnapshot(actor);
    return Number(snap?.stats?.[statUsed] ?? 0);
  }

  // Player meter — health / spirit / supply / momentum (endure_harm,
  // endure_stress, sojourn, hearten, etc.).
  if (PLAYER_METERS.has(statUsed)) {
    if (!actor) {
      warnMissingActor(statUsed);
      return 0;
    }
    const snap = readCharacterSnapshot(actor);
    return Number(snap?.meters?.[statUsed] ?? 0);
  }

  // Vehicle integrity — withstand_damage rolls against the command
  // vehicle's integrity meter (stored on the starship Actor's
  // module flag, since foundry-ironsworn's starship schema has no
  // native integrity field — see vendor/foundry-ironsworn/src/module/
  // actor/subtypes/starship.ts which only carries notes + debility).
  if (statUsed === "integrity") {
    const vehicle = getCommandVehicleActor(campaignState);
    const integrity = vehicle?.flags?.[MODULE_ID]?.ship?.integrity;
    if (integrity == null) {
      console.warn(
        `${MODULE_ID} | statEnrichment: withstand_damage rolled but no command vehicle integrity was readable. Defaulting to 0.`,
      );
      return 0;
    }
    return Number(integrity);
  }

  // Companion health — lives on the Companion-asset Item's track
  // (system.track.value). foundry-ironsworn stores it on the asset
  // schema's AssetConditionMeterField — see vendor/foundry-ironsworn/
  // src/module/item/subtypes/asset.ts. We can't ask the player which
  // companion is being hit mid-pipeline, so the heuristic is: of the
  // character's Companion-category assets with an enabled track,
  // pick the one with the highest current track value. That's the
  // most charitable resolution and matches the typical single-
  // companion case exactly; multi-companion characters get an info
  // notification naming which one was used so they can adjust the
  // narration if it's wrong.
  if (statUsed === "companion_health") {
    return resolveCompanionHealth(actor);
  }

  console.warn(
    `${MODULE_ID} | statEnrichment: unknown statUsed "${statUsed}" — defaulting to 0.`,
  );
  return 0;
}

function warnMissingActor(statUsed) {
  console.warn(
    `${MODULE_ID} | statEnrichment: cannot resolve "${statUsed}" — no speaker actor available. Defaulting to 0.`,
  );
}

/**
 * Resolve the character's companion_health to the highest enabled
 * Companion-asset track value. Notifies on multi-companion ambiguity.
 *
 * Exported for test coverage.
 */
export function resolveCompanionHealth(actor) {
  if (!actor) {
    warnMissingActor("companion_health");
    return 0;
  }

  const items = actor.items?.contents ?? actor.items ?? [];
  const assetItems = Array.isArray(items) ? items.filter(i => i?.type === "asset") : [];

  // The system stores the asset family on system.category. The string
  // is "Companion" (capital C) for companion assets out of the asset
  // tables, but match case-insensitively so user-renamed categories
  // or future localisation don't silently drop matches.
  const companions = assetItems.filter(i => {
    const category = String(i.system?.category ?? "").toLowerCase();
    return category.includes("companion") && i.system?.track?.enabled !== false;
  });

  if (!companions.length) {
    console.warn(
      `${MODULE_ID} | statEnrichment: companion_health rolled but no enabled Companion-category asset found on ${actor.name ?? actor.id}. Defaulting to 0.`,
    );
    return 0;
  }

  // Pick the companion with the highest current track value — the most
  // charitable resolution. For single-companion characters (the common
  // case) this is exact; for multi-companion characters we surface
  // which one we used so the player can re-narrate if they intended a
  // different companion.
  let chosen = companions[0];
  for (const c of companions) {
    if ((c.system?.track?.value ?? 0) > (chosen.system?.track?.value ?? 0)) chosen = c;
  }
  const value = Number(chosen.system?.track?.value ?? 0);

  if (companions.length > 1) {
    globalThis.ui?.notifications?.info?.(
      `Starforged Companion: companion_health rolled with ${companions.length} active Companion assets — using "${chosen.name}" (track ${value}). Re-narrate if you meant a different companion.`,
    );
  }

  return value;
}

// ---------------------------------------------------------------------------
// Progress-move tick enrichment
// ---------------------------------------------------------------------------

/**
 * Which module data source scores each progress move. Progress moves absent
 * from this map (continue_a_legacy, overcome_destruction) roll against the
 * player's own legacy tracks, which the module doesn't store — those stay a
 * deliberate no-op.
 */
export const PROGRESS_TICK_SOURCES = {
  take_decisive_action: "combat",
  fulfill_your_vow:     "vow",
  forge_a_bond:         "connection",
  finish_an_expedition: "expedition",
};

/**
 * Fill interpretation.statValue (and progressTicks, for card display) with the
 * live tick count of the track this progress move rolls against. Module data
 * is ground truth — the interpreter is instructed never to supply tick counts,
 * and card buttons only name a target via forcedMoveTarget.
 *
 * Dependency-injected so it unit-tests without Foundry:
 *
 * @param {Object} interpretation — mutated in place (statValue, progressTicks)
 * @param {{ listTracks?:    () => Promise<Array<{id,label,type,rank,ticks,completed,combatState}>>,
 *           readAllVows?:   () => Promise<Array<{id,name,rank,ticks,completed}>>,
 *           listConnections?: () => Promise<Array<{name,rank,relationshipTicks,bonded,active}>> }} deps
 * @returns {Promise<{ ticks:number, source:string, label:string|null,
 *                     trackId:string|null,
 *                     combatState:("in_control"|"bad_spot"|null) }|null>}
 *   null when the move isn't a progress move or has no module tick source;
 *   ticks 0 (statValue untouched) when the source resolves nothing.
 */
export async function enrichProgressTicks(interpretation, deps = {}) {
  if (interpretation?.isProgressMove !== true) return null;

  const moveId = interpretation?.moveId ?? null;
  const source = PROGRESS_TICK_SOURCES[moveId] ?? null;
  const target = interpretation?.moveTarget ?? null;

  if (!source) {
    // Deliberate no-op (see PROGRESS_TICK_SOURCES) — debug, not warn.
    console.debug(
      `${MODULE_ID} | enrichProgressTicks: no module tick source for progress move "${moveId}" — leaving score at 0.`,
    );
    return null;
  }

  let resolved = null; // { ticks, label, trackId, combatState }

  if (source === "combat" || source === "expedition") {
    const tracks = (await deps.listTracks?.()) ?? [];
    const track = source === "combat"
      ? selectCombatTrack(tracks, target)
      : selectExpeditionTrack(tracks, target);
    if (track) {
      resolved = {
        ticks:       Number(track.ticks ?? 0),
        label:       track.label ?? null,
        trackId:     track.id ?? null,
        combatState: source === "combat" ? (track.combatState ?? null) : null,
      };
    }
  } else if (source === "vow") {
    // Item vows are the live store — milestones mark actor vow Items, while
    // journal `vow` tracks are creation-time mirrors that are never
    // tick-synced afterwards. Items first; journal fallback only when no
    // item matches.
    const vows = (await deps.readAllVows?.()) ?? [];
    const vow  = selectMilestoneVow(vows, target);
    if (vow) {
      resolved = {
        ticks: Number(vow.ticks ?? 0), label: vow.name ?? null,
        trackId: vow.id ?? null, combatState: null,
      };
    } else {
      const tracks = (await deps.listTracks?.()) ?? [];
      const track  = selectVowTrack(tracks, target);
      if (track) {
        resolved = {
          ticks: Number(track.ticks ?? 0), label: track.label ?? null,
          trackId: track.id ?? null, combatState: null,
        };
      }
    }
  } else if (source === "connection") {
    const connections = (await deps.listConnections?.()) ?? [];
    const conn = selectConnection(connections, target);
    if (conn) {
      resolved = {
        ticks: Number(conn.relationshipTicks ?? 0), label: conn.name ?? null,
        trackId: conn._id ?? conn.id ?? null, combatState: null,
      };
    }
  }

  if (!resolved) {
    console.warn(
      `${MODULE_ID} | enrichProgressTicks: no open ${source} matched for ${moveId} (target: ${target ? `"${target}"` : "none"}) — progress score will be 0.`,
    );
    return { ticks: 0, source, label: null, trackId: null, combatState: null };
  }

  interpretation.statValue     = resolved.ticks;
  interpretation.progressTicks = resolved.ticks;
  return { source, ...resolved };
}
