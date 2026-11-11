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
 *                                  flags[MODULE_ID].ship.integrity — or,
 *                                  when the move's target names one of the
 *                                  roller's support vehicles (or that vehicle's
 *                                  ability swapped the stat for it), that
 *                                  asset's Integrity track (vehicleItemId)
 *   - companion_health → the Companion asset's track value
 *                                  (the swapping or named companion's,
 *                                  else resolveCompanionHealth); the roll's
 *                                  companion and vehicle are recorded on
 *                                  the interpretation for its consequences
 *                                  (companionItemId / vehicleActorId /
 *                                  vehicleItemId).
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

import { MOVES } from "../schemas.js";
import { readCharacterSnapshot, listCompanionAssets, listSupportVehicleAssets, readAssetIntegrity } from "../character/actorBridge.js";
import { getCommandVehicleActor } from "./abilityScanner.js";
import { selectCombatTrack, combatPositionFor } from "./combat.js";
import { selectExpeditionTrack } from "./expedition.js";
import { selectSceneChallengeTrack } from "./sceneChallenge.js";
import { selectVowTrack } from "./vow.js";
import { selectFulfilVow } from "./milestone.js";
import { selectConnection, bondedDevelopRoll } from "./developRelationship.js";
import { wholeWordPattern } from "../context/relevanceResolver.js";

const MODULE_ID = "starforged-companion";

const ACTION_STATS = new Set(["edge", "heart", "iron", "shadow", "wits"]);
const PLAYER_METERS = new Set(["health", "spirit", "supply", "momentum"]);

// Moves that legitimately roll no stat (Fate moves / progress moves resolve
// without an action-die stat). A missing statUsed for these is expected, so it
// is logged at debug rather than warn — only a stat-bearing move missing its
// stat is worth a warning.
const NO_STAT_MOVES = new Set([
  "ask_the_oracle", "pay_the_price", "fulfill_your_vow", "forge_a_bond",
  "finish_an_expedition", "finish_the_scene", "take_decisive_action", "reach_a_milestone",
  "develop_your_relationship",   // bonded: +rank, filled by enrichBondedDevelop; else no roll
]);

// Moves whose play-kit rule is "roll +X or +Y, whichever is higher".
// statEnrichment resolves both options and overrides interpretation.statUsed
// with the higher one so the move card reflects the actual roll.
const PICK_HIGHER_OF = {
  endure_harm:   ["health", "iron"],
  endure_stress: ["spirit", "heart"],
};

// Moves whose rule is "roll +X or +Y, whichever is lower" in one situation:
// Heal's "Mend your own wounds" (vendored `"Method": "Lowest"`). The
// interpreter names the situation (`healSituation`); a self-mend rolled
// whichever of iron / wits it named (issue #330 D4).
const PICK_LOWER_OF = {
  heal: { situation: "self", stats: ["iron", "wits"] },
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
  // override the interpreter's pick with the higher of the two stats. It
  // picks between the move's own two: a substitution the player chose on the
  // confirm dialog (Vanguard's "you may roll +wits", recorded by the
  // pipeline as statSubstitutedFrom) stands (issue #326 W49 — the rule
  // overwrote it with +spirit).
  const moveId = interpretation?.moveId;
  if (moveId && PICK_HIGHER_OF[moveId] && !interpretation?.statSubstitutedFrom) {
    const [a, b] = PICK_HIGHER_OF[moveId];
    const va = resolveStatValue(actor, a, campaignState);
    const vb = resolveStatValue(actor, b, campaignState);
    const winner = vb > va ? b : a;
    interpretation.statUsed  = winner;
    interpretation.statValue = Math.max(va, vb);
    return interpretation.statValue;
  }

  // "Whichever is lower" — Heal's self-mend. The card says so (statRule).
  const lower = moveId ? PICK_LOWER_OF[moveId] : null;
  if (lower && interpretation?.healSituation === lower.situation && !interpretation?.statSubstitutedFrom) {
    const [a, b] = lower.stats;
    const va = resolveStatValue(actor, a, campaignState);
    const vb = resolveStatValue(actor, b, campaignState);
    interpretation.statUsed  = vb < va ? b : a;
    interpretation.statValue = Math.min(va, vb);
    interpretation.statRule  = `lower of ${a} / ${b}`;
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

  // A support vehicle the move names — the roller's asset with its own
  // Integrity track (the Hoverbike, Rover, Skiff …) — is the vehicle the
  // roll is made for: "+integrity" is that track, and the choices change it
  // (vehicleItemId), not the command vehicle in orbit (issue #342 Z53). So is
  // the one whose ability swapped the move's stat for "+integrity" — the
  // Snub Fighter's Enter the Fray (issue #345 AA10).
  if (statUsed === "integrity") {
    const bike = substitutingAsset(listSupportVehicleAssets(actor), interpretation)
      ?? selectNamedVehicleAsset(actor, interpretation);
    if (bike) {
      interpretation.statValue      = readAssetIntegrity(actor, bike.id) ?? 0;
      interpretation.vehicleItemId  = bike.id;
      interpretation.vehicleActorId = null;
      return interpretation.statValue;
    }
  }

  // A companion whose ability swapped the move's stat for "+its health" — the
  // Survey Bot's Face Danger, the Banshee's Set a Course — rolls its own
  // health, not the healthiest companion's (issue #345 AA10). So does the one
  // the move's target or its line names: "The glowcat is clipped by a
  // ricochet" is the Glowcat's hit, though the Rockhorn is healthier (issue
  // #345 AA45 — the notice told the player to re-narrate, and nothing read it).
  if (statUsed === "companion_health") {
    const companions = listCompanionAssets(actor);
    const companion  = substitutingAsset(companions, interpretation) ?? namedCompanion(companions, interpretation);
    if (companion) {
      interpretation.statValue       = Number(companion.system?.track?.value ?? 0);
      interpretation.companionItemId = companion.id;
      return interpretation.statValue;
    }
  }

  const value = resolveStatValue(actor, statUsed, campaignState);
  interpretation.statValue = value;
  // The vehicle or companion the roll was made against: its consequences
  // change that one (issue #309 N02 / N03 — they went to the PC's meters,
  // which have neither integrity nor companion health, and were dropped).
  if (statUsed === "integrity") {
    interpretation.vehicleActorId = getCommandVehicleActor(campaignState)?.id ?? null;
  }
  if (statUsed === "companion_health") {
    interpretation.companionItemId = selectCompanionAsset(actor)?.id ?? null;
  }
  return value;
}

/**
 * Develop Your Relationship: resolve the move's connection before the dice —
 * a picker's host id first, else the named one (selectConnection) — and, when
 * it is bonded, fill the stat from its rank: "roll +rank", troublesome +1 to
 * epic +5 (bondedDevelopRoll). The move's schema lists no stat, so the
 * pipeline rolled +0 for every bonded development — an epic bond's 3 against
 * 4 and 7 was a miss that `!bond` scored 8 (issue #314 Q06). The resolved
 * connection's host id and name are stamped on the interpretation so the
 * develop branch after the roll marks the same connection. An un-bonded
 * connection changes nothing: its development is no roll, a mark of progress.
 *
 * @param {Object} interpretation — mutated: `statUsed` / `statValue` when
 *   bonded; `moveTargetId` / `moveTarget` when a connection resolves
 * @param {{ listConnections: () => Promise<Array<Object>> }} deps — the active
 *   connection records, each with its host Actor id as `__hostId`
 * @returns {Promise<{ connection: Object|null, bonded: boolean, adds: number }|null>}
 *   null for any other move
 */
export async function enrichBondedDevelop(interpretation, { listConnections }) {
  if (interpretation?.moveId !== "develop_your_relationship") return null;
  const connections = await listConnections();
  const target = selectConnection(connections, interpretation.moveTarget ?? null,
    { hostId: interpretation.moveTargetId ?? null });
  if (!target) return { connection: null, bonded: false, adds: 0 };
  if (target.__hostId) interpretation.moveTargetId = target.__hostId;
  if (target.name)     interpretation.moveTarget   = target.name;
  const roll = bondedDevelopRoll(target);
  if (!roll) return { connection: target, bonded: false, adds: 0 };
  interpretation.statUsed  = roll.statUsed;
  interpretation.statValue = roll.statValue;
  // The schema lists no stat, so the move resolves with no roll (schemas.js
  // moveRollKind "none"); bonded, it is an action roll +rank — said here, where
  // the stat is made, for the resolver (issue #316 T05).
  interpretation.rollKind  = "action";
  return { connection: target, bonded: true, adds: roll.statValue };
}

/**
 * Heal: whose care it is, resolved before the dice (issue #325 W04). The
 * recovery card read the roller's impacts and wrote the roller: "I patch up
 * Kira's wounds" offered "Take/give +3 health" while Kira lay wounded, and
 * healed the healer. The move text: "If you (or the ally under your care) are
 * wounded, clear the impact and take or give +2 health. Otherwise, take or
 * give +3 health."
 *
 * - Obtain treatment for a companion (+heart): the roller's companion — the
 *   one the move's target or the narration names, else the only one, else the
 *   most hurt — is `patientCompanionItemId`.
 * - Provide care for an ally: another player character named as the move's
 *   target — or, when it names none, the only other PC the narration names
 *   (the move's "Provide care") — is `patientActorId`.
 * - Otherwise the roller tends their own wounds or receives treatment: no
 *   patient, and the card is the roller's.
 *
 * Which of these it is comes from the situation the interpreter read
 * (`healSituation`: "companion", "ally", "self", "treated" — issue #330 D4).
 * Only with none read does the stat stand in: +heart a companion's, +wits
 * the move's Provide care. Read from the stat alone, a self-mend — which
 * rolls the lower of iron and wits — rolled +wits by a roller whose wits is
 * the lower, and whose line mentions a crewmate ("While Kira keeps watch, I
 * stitch the gash on my own arm"), healed the crewmate and left the roller
 * wounded (issue #345 AA13).
 *
 * Names match whole words (`wholeWordPattern`): a PC's full name or a first or
 * last name no other PC shares. The cost of a weak hit stays the roller's.
 *
 * @param {Object} interpretation — mutated: `patientActorId` /
 *   `patientCompanionItemId` set (or null)
 * @param {Actor|null} roller
 * @param {{ players?: Array<Actor> }} [deps] — every player character
 * @returns {{ patientActorId: string|null, patientCompanionItemId: string|null }|null}
 *   null for any other move
 */
export function resolveHealPatient(interpretation, roller, { players = [] } = {}) {
  if (interpretation?.moveId !== "heal") return null;
  const out = { patientActorId: null, patientCompanionItemId: null };
  const target = typeof interpretation.moveTarget === "string" ? interpretation.moveTarget : "";
  const prose  = typeof interpretation.playerNarration === "string" ? interpretation.playerNarration : "";
  const situation = typeof interpretation.healSituation === "string" && interpretation.healSituation
    ? interpretation.healSituation : null;

  if (situation === "self" || situation === "treated") {
    // The roller's own wounds, or treatment they receive: no patient.
  } else if (situation ? situation === "companion" : interpretation.statUsed === "heart") {
    const companions = listCompanionAssets(roller);
    const named = namedOnce(companions, target) ?? namedOnce(companions, prose);
    const hurt  = [...companions].sort((a, b) => (a.system?.track?.value ?? 0) - (b.system?.track?.value ?? 0))[0];
    out.patientCompanionItemId = (named ?? (companions.length === 1 ? companions[0] : hurt))?.id ?? null;
  } else {
    const others = (Array.isArray(players) ? players : []).filter(a => a?.id && a.id !== roller?.id);
    const care   = situation === "ally" || interpretation.statUsed === "wits";
    const named  = namedOnce(others, target) ?? (!target && care ? namedOnce(others, prose) : null);
    out.patientActorId = named?.id ?? null;
  }
  interpretation.patientActorId         = out.patientActorId;
  interpretation.patientCompanionItemId = out.patientCompanionItemId;
  return out;
}

/**
 * The bond adds a move's text gives (issue #325 W18), resolved before the
 * dice: Test Your Relationship — "If you share a bond, add +1" — and Swear an
 * Iron Vow — "If you swear this vow to a connection, add +1; if you share a
 * bond, add +2". The pipeline rolls these moves itself and nothing added
 * either: a bonded Test rolled bare +heart, and so did the inciting vow sworn
 * to the sector's connection.
 *
 * Test Your Relationship's connection resolves as its develop branch does (a
 * picker's host id, else the named one — selectConnection), and is stamped on
 * the interpretation so that branch develops the same one. A swear's
 * connection is the one its card names (`swearToConnection` — the inciting
 * vow's target, or the connection a sheet-made vow is linked to), matched by
 * name among the active connections; a vow sworn to nobody the crew knows adds
 * nothing.
 *
 * @param {Object} interpretation — mutated: `bondAdd` (and the Test's
 *   `moveTargetId` / `moveTarget` when its connection resolves)
 * @param {{ listConnections: () => Promise<Array<Object>> }} deps
 * @returns {Promise<number>} the add (0 when none applies)
 */
export async function enrichBondAdds(interpretation, { listConnections }) {
  const moveId = interpretation?.moveId;
  if (moveId !== "test_your_relationship" && moveId !== "swear_an_iron_vow") return 0;
  const connections = (await listConnections()) ?? [];
  let add = 0;
  if (moveId === "test_your_relationship") {
    const target = selectConnection(connections, interpretation.moveTarget ?? null,
      { hostId: interpretation.moveTargetId ?? null });
    if (target?.__hostId) interpretation.moveTargetId = target.__hostId;
    if (target?.name)     interpretation.moveTarget   = target.name;
    add = target?.bonded ? 1 : 0;
  } else {
    const name = typeof interpretation.swearToConnection === "string" ? interpretation.swearToConnection.trim() : "";
    const norm = (s) => String(s ?? "").trim().toLowerCase();
    const sworn = name ? connections.find(c => c && c.active !== false && norm(c.name) === norm(name)) : null;
    add = sworn ? (sworn.bonded ? 2 : 1) : 0;
  }
  interpretation.bondAdd = add;
  return add;
}

/**
 * Aid Your Ally: the ally aided, resolved before the dice (issue #325 W17) —
 * another player character named as the move's target, else the only other
 * PC the narration names. Their benefits are the ally's on a hit
 * (resolver.aidYourAllyConsequences). No ally found: the benefits stay the
 * roller's, as before.
 *
 * @param {Object} interpretation — mutated: `allyActorId` set (or null)
 * @param {Actor|null} roller
 * @param {{ players?: Array<Actor> }} [deps] — every player character
 * @returns {string|null} the ally's actor id; null for any other move
 */
export function resolveAidedAlly(interpretation, roller, { players = [] } = {}) {
  if (interpretation?.moveId !== "aid_your_ally") return null;
  const others = (Array.isArray(players) ? players : []).filter(a => a?.id && a.id !== roller?.id);
  const target = typeof interpretation.moveTarget === "string" ? interpretation.moveTarget : "";
  const prose  = typeof interpretation.playerNarration === "string" ? interpretation.playerNarration : "";
  const ally   = namedOnce(others, target) ?? (!target ? namedOnce(others, prose) : null);
  interpretation.allyActorId = ally?.id ?? null;
  return interpretation.allyActorId;
}

/** The one document of `docs` whose name `text` names (whole words: the full name, or a first / last name no other shares) — null for none or several. */
function namedOnce(docs, text) {
  const hay = String(text ?? "");
  if (!hay.trim() || !docs.length) return null;
  const tokensOf = (d) => {
    const name  = String(d?.name ?? "").trim();
    const parts = name.split(/\s+/).filter(p => p.length >= 2);
    return { name, first: parts[0] ?? null, last: parts.length > 1 ? parts.at(-1) : null };
  };
  const all = docs.map(d => ({ d, ...tokensOf(d) })).filter(e => e.name);
  const shared = (tok) => tok && all.filter(e => e.first?.toLowerCase() === tok.toLowerCase()
    || e.last?.toLowerCase() === tok.toLowerCase()).length > 1;
  const hits = all.filter(e =>
    wholeWordPattern(e.name).test(hay)
    || (e.first && !shared(e.first) && wholeWordPattern(e.first).test(hay))
    || (e.last && !shared(e.last) && wholeWordPattern(e.last).test(hay)));
  return hits.length === 1 ? hits[0].d : null;
}

/**
 * A forced move's stat, read from its narration (issue #321 U04). A move a
 * card or button forces — the pacing "Roll ⟨move⟩" button, the way-out and
 * Battle buttons — skips the interpreter, and rolled the move's first listed
 * stat: every forced Face Danger, Secure an Advantage, Enter the Fray, Gain
 * Ground or Battle rolled +edge, every Heal +iron. When the move's stat is a
 * choice — several listed, and not "whichever is higher" (PICK_HIGHER_OF,
 * settled when the value is read) — the injected stat-only interpretation
 * reads the narration's approach. A stat the move does not list, no
 * interpreter (no Claude key) or a failed reading keeps the listed default;
 * the confirm dialog shows the stat either way.
 *
 * @param {Object} interpretation — a forced interpretation; `statUsed` (and
 *   `rationale`, with the reading's) updated in place
 * @param {{ interpret?: ((narration: string, moveId: string) => Promise<Object>)|null }} deps
 *   — the stat-only interpretation: interpretMove with the move as its
 *   expectedMoveSlug; null when no Claude key is available
 * @returns {Promise<string|null>} the stat read, or null when none was
 */
export async function enrichForcedMoveStat(interpretation, { interpret = null } = {}) {
  const moveId = interpretation?.moveId;
  const stats  = Array.isArray(MOVES[moveId]?.stat) ? MOVES[moveId].stat : [];
  if (typeof interpret !== "function" || stats.length < 2 || PICK_HIGHER_OF[moveId]) return null;
  let reading = null;
  try {
    reading = await interpret(interpretation.playerNarration ?? "", moveId);
  } catch (err) {
    console.warn(`${MODULE_ID} | forced move: reading the stat failed — rolling the listed +${interpretation.statUsed}:`, err?.message ?? err);
    return null;
  }
  if (!stats.includes(reading?.statUsed)) return null;
  interpretation.statUsed = reading.statUsed;
  // A forced Heal's situation is read with its stat (issue #330 D4).
  if (moveId === "heal" && reading?.healSituation) interpretation.healSituation = reading.healSituation;
  if (reading.rationale) interpretation.rationale = [interpretation.rationale, reading.rationale].filter(Boolean).join(" ");
  return reading.statUsed;
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
  // src/module/item/subtypes/asset.ts. A companion the move or its line
  // names is picked before this (enrichInterpretationStatValue); with none
  // named the heuristic is: of the character's Companion-category assets
  // with an enabled track, the one with the highest current track value.
  // That's the most charitable resolution and matches the typical single-
  // companion case exactly; multi-companion characters get an info
  // notification naming which one was used, and that naming the companion
  // picks it (issue #345 AA45).
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
 * The companion a companion_health roll is made for: of the character's
 * Companion-category assets with an enabled track (actorBridge
 * listCompanionAssets — the system stores the asset family on
 * system.category, matched case-insensitively), the one with the highest
 * current track value — the most charitable resolution, exact for the
 * common single-companion character. Null when there is none.
 *
 * @param {Actor|null} actor
 * @returns {Item|null}
 */
function selectCompanionAsset(actor) {
  let chosen = null;
  for (const c of listCompanionAssets(actor)) {
    if (!chosen || (c.system?.track?.value ?? 0) > (chosen.system?.track?.value ?? 0)) chosen = c;
  }
  return chosen;
}

/**
 * Of `assets` (the roller's support vehicles, or companions), the one whose
 * ability the confirm's stat substitution came from — the pipeline stamps it
 * as `statSubstitutedAssetId` beside `statSubstitutedFrom` (issue #345 AA10).
 * Null when the roll's stat was not substituted, or by another asset.
 *
 * @param {Item[]} assets
 * @param {Object} interpretation
 * @returns {Item|null}
 */
function substitutingAsset(assets, interpretation) {
  const id = interpretation?.statSubstitutedFrom ? interpretation.statSubstitutedAssetId : null;
  return typeof id === "string" && id ? (assets.find(a => a?.id === id) ?? null) : null;
}

/**
 * The support vehicle an integrity roll is made for: the roller's vehicle
 * asset (actorBridge listSupportVehicleAssets) the move's target names, as
 * whole words (`namedOnce`). Null otherwise: the roll is the command
 * vehicle's, as an unnamed or starship target always was. Never a guess: a
 * sole support vehicle the move does not name is not taken for it
 * (rules/reachability.md §6).
 *
 * The narration does not name it. The interpreter gives withstand_damage's
 * target "null for the command starship" (interpreter.js), and a null target
 * read as "nothing named" let the line pick one instead — any support vehicle
 * it mentioned, by its full name or a first or last word: "An enemy fighter
 * rakes the Wayfarer's hull" was the Snub Fighter's hit, "The Wayfarer
 * shudders as the hoverbike breaks loose" the Hoverbike's (issue #345 AA14,
 * a regression of issue #342 Z53).
 *
 * @param {Actor|null} actor
 * @param {Object} interpretation — its `moveTarget`
 * @returns {Item|null}
 */
function selectNamedVehicleAsset(actor, interpretation) {
  const vehicles = listSupportVehicleAssets(actor);
  if (!vehicles.length) return null;
  const target = typeof interpretation?.moveTarget === "string" ? interpretation.moveTarget : "";
  return namedOnce(vehicles, target);
}

/**
 * The companion a companion_health roll names: the one the move's target
 * names, else the one its narration names, as whole words (`namedOnce` — the
 * full name, or a first / last name no other companion shares) — null for
 * none, or several (issue #345 AA45). Heal's companion is read the same way
 * (resolveHealPatient).
 *
 * @param {Item[]} companions — listCompanionAssets
 * @param {Object} interpretation — its `moveTarget` / `playerNarration`
 * @returns {Item|null}
 */
function namedCompanion(companions, interpretation) {
  const target = typeof interpretation?.moveTarget === "string" ? interpretation.moveTarget : "";
  const prose  = typeof interpretation?.playerNarration === "string" ? interpretation.playerNarration : "";
  return namedOnce(companions, target) ?? namedOnce(companions, prose);
}

/**
 * Resolve the character's companion_health to the highest enabled
 * Companion-asset track value (selectCompanionAsset) — the roll's companion
 * when none is named. Notifies on multi-companion ambiguity.
 *
 * Exported for test coverage.
 */
export function resolveCompanionHealth(actor) {
  if (!actor) {
    warnMissingActor("companion_health");
    return 0;
  }

  const companions = listCompanionAssets(actor);
  const chosen = selectCompanionAsset(actor);
  if (!chosen) {
    console.warn(
      `${MODULE_ID} | statEnrichment: companion_health rolled but no enabled Companion-category asset found on ${actor.name ?? actor.id}. Defaulting to 0.`,
    );
    return 0;
  }

  // For multi-companion characters we surface which one we used, and how to
  // roll another: name it (issue #345 AA45 — "Re-narrate if you meant a
  // different companion" promised a remedy nothing read).
  const value = Number(chosen.system?.track?.value ?? 0);

  if (companions.length > 1) {
    globalThis.ui?.notifications?.info?.(
      `Starforged Companion: no companion named among ${companions.length} — rolling the healthiest, "${chosen.name}" (track ${value}). Name the companion in your line to roll its health instead.`,
    );
  }

  return value;
}

// ---------------------------------------------------------------------------
// Progress-move tick enrichment
// ---------------------------------------------------------------------------

/**
 * Which module data source scores each progress move. Overcome Destruction
 * and Continue a Legacy roll against the crew's shared legacy tracks
 * (`campaignState.legacyTracks`, mirrored to every PC's sheet since issue
 * #326 D3) — they scored 0, a certain miss, while the module "did not store"
 * them (issue #330 D6).
 */
export const PROGRESS_TICK_SOURCES = {
  take_decisive_action: "combat",
  fulfill_your_vow:     "vow",
  forge_a_bond:         "connection",
  finish_an_expedition: "expedition",
  finish_the_scene:     "scene_challenge",   // issue #326 D6
  overcome_destruction: "legacy",            // the bonds legacy track (issue #330 D6)
  continue_a_legacy:    "legacy",            // the legacy track it names (issue #330 D6)
};

const LEGACY_TRACK_LABELS = { quests: "Quests", bonds: "Bonds", discoveries: "Discoveries" };

/**
 * The legacy track a Continue a Legacy names — "quests", "bonds" or
 * "discoveries", by any of their words — or null.
 *
 * @param {string|null} target
 * @returns {"quests"|"bonds"|"discoveries"|null}
 */
export function legacyTrackNamed(target) {
  const t = String(target ?? "").toLowerCase();
  if (/\bquest/.test(t)) return "quests";
  if (/\b(bond|connection)/.test(t)) return "bonds";
  if (/\bdiscover/.test(t)) return "discoveries";
  return null;
}

/** The progress a legacy track is rolled at: a cleared one "as if at 10 progress" (Earn Experience — issue #330 D6). */
function legacyScoreTicks(legacy) {
  return legacy?.cleared ? 40 : Math.max(0, Math.min(40, Number(legacy?.ticks ?? 0) || 0));
}

/**
 * The three legacy tracks Continue a Legacy rolls — each with the label a
 * roll names it by and the progress it is rolled at. The "which legacy
 * track?" card's choices, when a Continue a Legacy names none (issue #331
 * X63).
 *
 * @param {Object} [legacyTracks] — campaignState.legacyTracks
 * @returns {Array<{ track: "quests"|"bonds"|"discoveries", label: string, ticks: number, cleared: boolean }>}
 */
export function legacyTrackScores(legacyTracks = {}) {
  return Object.entries(LEGACY_TRACK_LABELS).map(([track, label]) => ({
    track,
    label:   `${label} legacy`,
    ticks:   legacyScoreTicks(legacyTracks?.[track]),
    cleared: !!legacyTracks?.[track]?.cleared,
  }));
}

/**
 * Fill interpretation.statValue (and progressTicks, for card display) with the
 * live tick count of the track this progress move rolls against. Module data
 * is ground truth — the interpreter is instructed never to supply tick counts,
 * and card buttons only name a target via forcedMoveTarget (a connection
 * picker, a Progress Tracks row, an expedition card and a "Which vow?" pick
 * also by id, via forcedMoveTargetId → interpretation.moveTargetId).
 *
 * Dependency-injected so it unit-tests without Foundry:
 *
 * @param {Object} interpretation — mutated in place (statValue, progressTicks)
 * @param {{ listTracks?:    () => Promise<Array<{id,label,type,rank,ticks,completed,combatState}>>,
 *           readAllVows?:   () => Promise<Array<{id,name,rank,ticks,completed,actorId,vowId}>>,
 *           readLegacyTracks?: () => Promise<Object<string,{ticks,cleared,cycles}>>,
 *           rollerActorId?: string|null,
 *           listConnections?: () => Promise<Array<{name,rank,relationshipTicks,bonded,active,__hostId}>> }} deps
 *   — `rollerActorId`: whose vows a Fulfill Your Vow prefers (credit the roller),
 *     and whose own position in the scored fight is returned
 * @returns {Promise<{ ticks:number, source:string, label:string|null,
 *                     trackId:string|null,
 *                     combatState:("in_control"|"bad_spot"|null) }|null>}
 *   null when the move isn't a progress move or has no module tick source;
 *   ticks 0 (statValue and progressTicks set to 0) when the source resolves
 *   nothing.
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

  if (source === "combat" || source === "expedition" || source === "scene_challenge") {
    // A row's id when the roll came from it (the Progress Tracks panel, an
    // expedition card): that track or nothing — a same-named sibling is a
    // different fight (issue #306 R06).
    const trackId = interpretation?.moveTargetId ?? null;
    const tracks = (await deps.listTracks?.()) ?? [];
    const track = source === "combat"
      ? selectCombatTrack(tracks, target, { trackId })
      : source === "expedition"
        ? selectExpeditionTrack(tracks, target, { trackId })
        : selectSceneChallengeTrack(tracks, target, { trackId });
    if (track) {
      resolved = {
        ticks:       Number(track.ticks ?? 0),
        label:       track.label ?? null,
        trackId:     track.id ?? null,
        // The roller's own position in this fight, else the fight's — Take
        // Decisive Action's bad-spot downgrade is the roller's (issue #322 V03).
        combatState: source === "combat" ? combatPositionFor(track, deps.rollerActorId ?? null) : null,
      };
    }
  } else if (source === "vow") {
    // Item vows are the live store — milestones mark actor vow Items, while
    // journal `vow` tracks are creation-time mirrors that are never
    // tick-synced afterwards. Items first: a "Which vow?" pick's copy by id,
    // else the named vow, else the roller's one vow — a shared vow's copies
    // counted as one (selectFulfilVow, issue #321 U02). The journal fallback
    // only when no item vow is open — never for a vow the roller must pick.
    const itemId = interpretation?.moveTargetId ?? null;
    const vows = (await deps.readAllVows?.()) ?? [];
    const { vow, choices } = selectFulfilVow(vows, target, { itemId, rollerActorId: deps.rollerActorId ?? null });
    if (vow) {
      resolved = {
        ticks: Number(vow.ticks ?? 0), label: vow.name ?? null,
        trackId: vow.id ?? null, combatState: null,
      };
    } else if (!itemId && !choices.length) {
      const tracks = (await deps.listTracks?.()) ?? [];
      const track  = selectVowTrack(tracks, target);
      if (track) {
        resolved = {
          ticks: Number(track.ticks ?? 0), label: track.label ?? null,
          trackId: track.id ?? null, combatState: null,
        };
      }
    }
  } else if (source === "legacy") {
    // The crew's shared legacy tracks: Overcome Destruction rolls the bonds
    // track ("compare to the progress on your bonds legacy track"), Continue
    // a Legacy the one it names. A track already cleared is rolled "as if at
    // 10 progress" (Earn Experience) — issue #330 D6.
    const track = moveId === "overcome_destruction" ? "bonds" : legacyTrackNamed(target);
    if (track) {
      const legacy = ((await deps.readLegacyTracks?.()) ?? {})[track] ?? null;
      resolved = { ticks: legacyScoreTicks(legacy), label: `${LEGACY_TRACK_LABELS[track]} legacy`, trackId: track, combatState: null };
    }
  } else if (source === "connection") {
    // A picker's host id first; Forge a Bond never scores a bonded connection
    // it wasn't asked for (issue #301 B01 — with the id dropped, it scored the
    // sole bonded one's full track).
    const connections = (await deps.listConnections?.()) ?? [];
    const conn = selectConnection(connections, target, {
      hostId:   interpretation?.moveTargetId ?? null,
      unbonded: moveId === "forge_a_bond",
    });
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
    // Score 0, as the warning says — not whatever number the interpretation
    // carried: the resolver scores `statValue`, and a model that ignored
    // "ALWAYS leave statValue as 0" scored its own guess (issue #322 V08).
    interpretation.statValue     = 0;
    interpretation.progressTicks = 0;
    return { ticks: 0, source, label: null, trackId: null, combatState: null };
  }

  interpretation.statValue     = resolved.ticks;
  interpretation.progressTicks = resolved.ticks;
  return { source, ...resolved };
}
