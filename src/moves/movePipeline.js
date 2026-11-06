/**
 * STARFORGED COMPANION
 * src/moves/movePipeline.js — the move pipeline's stages
 *
 * A typed line used to run as one ~1,150-line closure in src/index.js
 * (registerChatHook's onMessage): pacing, interpretation, the confirm dialog,
 * the roll, the outcome's effects, the narration and the record. Batch Mode
 * (issue #340) needs those stages separately — a round reads each player's
 * action when it is submitted, rolls every confirmed entry when the round
 * resolves, records them, and narrates the round once — and a second copy of
 * the stages would be two pipelines drifting apart (rules/reachability.md §2).
 * So the stages live here, and both callers run them:
 *
 *   Stage        Free-flow (onMessage)          A Batch Mode round (src/batch/driver.js)
 *   readMove     on the line, under the lock    on Submit, through readAction (pacing first)
 *   confirm      the GM's dialog                the player's Round window (applyConfirmChoices)
 *   rollMove     after the confirm              when the round resolves, in confirm order
 *   recordMove   after the narration            before the round's narration
 *   finishMove   after the record               after the round's narration
 *
 * The stages run on the canonical GM only: the callers gate on isCanonicalGM()
 * and hold the move lock (campaignState.pendingMove) around the roll and the
 * record. What the stages post and apply beyond their own modules — the
 * "Which fight?" / track-gone cards, the outcome-effects applier, the per-move
 * cards, the move result card, the unsaved-record report and the consequence
 * riders — stays in src/index.js, which hands those helpers in once at load
 * (configureMovePipeline). The move code itself moved here verbatim (issue
 * #340 Phase 0: no behaviour change).
 */

import { MOVES, rankName } from "../schemas.js";
import { interpretMove } from "./interpreter.js";
import { resolveMove, withPayThePriceSeed } from "./resolver.js";
import { buildMischiefAside } from "./mischief.js";
import { persistResolution } from "./persistResolution.js";
import { buildBurnState } from "./burnMomentum.js";
import { buildImproveState } from "./improveResult.js";
import { closeUpgradesForLaterMove } from "./resultUpgrade.js";
import { scanForApplicableAbilities, getCommandVehicleActor } from "./abilityScanner.js";
import {
  enrichInterpretationStatValue,
  enrichProgressTicks,
  enrichBondedDevelop,
  enrichForcedMoveStat,
  resolveHealPatient,
  resolveAidedAlly,
  enrichBondAdds,
  legacyTrackNamed,
  legacyTrackScores,
} from "./statEnrichment.js";
import { narrateAndPostVowSwearing, suppressPcDirectedSocialMove } from "../narration/narrator.js";
import {
  getPlayerActors,
  readVows,
  readMomentumState,
  completeVowItem,
  setSharedVowReward,
  vowCopyId,
  setBondItemRank,
} from "../character/actorBridge.js";
import { getActiveCombatPosition, listProgressTracks, completeProgressTrack } from "../ui/progressTracks.js";
import { finishExpedition, legacyRewardTicks, selectExpeditionTrack } from "./expedition.js";
import { finishVow } from "./vow.js";
import { selectCombatTrack } from "./combat.js";
import { selectConnection, planDevelopRelationship, buildConnectionSuggestion } from "./developRelationship.js";
import { SCENE_CHALLENGE_VARIANTS, moveOutsideSceneChallenge } from "./sceneChallenge.js";
import { moveDisplayName } from "../system/i18n.js";
import { buildMilestoneSuggestion, selectFulfilVow } from "./milestone.js";
import { extractRiders } from "./consequenceRiders.js";
import { resolveRelevance } from "../context/relevanceResolver.js";
import { getCurrentSiteKind } from "../entities/location.js";
import { ClarificationDialog, applyClarificationSelection } from "../world/clarificationDialog.js";
import { swearSharedVowForAll } from "../session/swearVow.js";
import { consumeNextMoveAdd, consumeNextMoveBonus } from "./nextMoveAdd.js";
import { decidePacing } from "../pacing/router.js";
import { READING_KIND } from "../batch/round.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// The host's helpers (src/index.js)
// ─────────────────────────────────────────────────────────────────────────────

/** The helpers every stage needs from src/index.js — see HOST_HELPERS. */
let _host = null;

/**
 * The src/index.js helpers the stages call, by name. configureMovePipeline
 * refuses a host that lacks one, so a helper renamed or dropped there fails
 * at load, not mid-move.
 */
const HOST_HELPERS = Object.freeze([
  // readMove's "which track?" answers, posted by free-flow (postTargetChoiceCard)
  "postWhichFightCard", "postWhichVowCard", "postWhichLegacyCard", "postTrackGoneCard",
  // rollMove — the outcome's effects, the per-move branches and the cards they post
  "applyOutcomeEffects", "addLegacyTicks", "postDevelopRelationshipCard", "applyReachMilestone",
  "postForgeABondCard", "postExpeditionFinishCard", "noteUnsavedOnCopy", "postSceneFinishCard",
  "postRecommitOfferCard", "postVowRecommitOfferCard", "postBondRecommitOfferCard",
  "resolveVowItemCopies", "completeVowItemByName", "postFulfillVowCard", "payFulfilledVowNative",
  "postForsakeVowCard", "postDecisiveActionCostCard", "postMovePayThePriceCard", "postMoveResult",
  // recordMove / finishMove
  "reportUnsavedMoveRecord", "applyMoveConsequenceRiders",
]);

/**
 * Hand the stages src/index.js's helpers. Called once by src/index.js at
 * load (each client's module copy configures its own).
 *
 * @param {Object<string, Function>} host — every name in HOST_HELPERS
 */
export function configureMovePipeline(host) {
  const missing = HOST_HELPERS.filter(name => typeof host?.[name] !== "function");
  if (missing.length) throw new Error(`movePipeline: the host lacks ${missing.join(", ")}`);
  _host = Object.freeze(Object.fromEntries(HOST_HELPERS.map(name => [name, host[name]])));
}

/** The configured helpers; a stage run before src/index.js loaded is a wiring bug. */
function pipelineHost() {
  if (!_host) throw new Error("movePipeline: no host configured — src/index.js calls configureMovePipeline at load");
  return _host;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every PC's vows, each copy with its holder — the speaker first, so a name
 * tie resolves to the roller's own copy.
 *
 * @param {string|null} speakerActorId
 * @returns {Promise<Object[]>}
 */
async function readAllVows(speakerActorId) {
  const actors = getPlayerActors();
  actors.sort((a, b) =>
    (a.id === speakerActorId ? -1 : 0) - (b.id === speakerActorId ? -1 : 0));
  return actors.flatMap(a => readVows(a).map(v => ({ ...v, actorId: a.id })));
}

/**
 * The speaker's PC, and the roller: the speaker, else the first PC — the
 * fallback only where resolveSpeakerActorId leaves none and the move still
 * runs (decisions.md → "Multiplayer attribution"; issue #326 D8).
 *
 * @param {string|null} speakerActorId
 * @returns {{ speakerActor: Actor|null, rollerActor: Actor|null }}
 */
function rollerFor(speakerActorId) {
  const speakerActor = speakerActorId ? game.actors?.get(speakerActorId) : null;
  const rollerActor  = speakerActor ?? getPlayerActors()[0] ?? null;
  return { speakerActor, rollerActor };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — read the action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal interpretation when the move ID is supplied by the caller
 * (the NWMA suggestion button, the way-out and Battle buttons …), without
 * interpreting the move. The stat starts as the move's first listed stat; the
 * pipeline then reads the narration for it when the move lists several
 * (enrichForcedMoveStat — issue #321 U04), and the confirm dialog shows it.
 */
function buildForcedInterpretation(moveId, narration, mischiefLevel, moveTarget = null, moveTargetId = null) {
  const moveData = MOVES[moveId];
  const statUsed = moveData?.stat?.[0] ?? null;
  const moveName = moveDisplayName(moveId);
  return {
    playerNarration:  narration,
    inputMethod:      "chat",
    mischiefLevel,
    moveId,
    moveName,
    statUsed,
    statValue:        0,
    adds:             0,
    isProgressMove:   moveData?.progressMove === true,
    progressTicks:    0,
    moveTarget:       typeof moveTarget === "string" && moveTarget.trim() ? moveTarget.trim() : null,
    // The target's stable id when the card that forced the move knows it: a
    // connection picker's host Actor id (selectConnection), or a progress
    // track's id for Take Decisive Action / Finish an Expedition from a
    // Progress Tracks row or an expedition card (selectCombatTrack /
    // selectExpeditionTrack, issue #306 R06), for Take Decisive Action from
    // a combat move card or a which-fight pick, and for Battle from an Enter
    // the Fray card (TDA-BUTTON-NO-TARGET) — resolved before any name.
    moveTargetId:     typeof moveTargetId === "string" && moveTargetId ? moveTargetId : null,
    rationale:        "Move nominated by pacing classifier; player confirmed via suggestion button.",
    mischiefApplied:  false,
    confidence:       "high",
    playerConfirmed:  false,
  };
}

/**
 * Read a line as a move — what free-flow does once it holds the move lock,
 * and what a round's reading does on Submit (readAction). The interpretation
 * (the forced move's, or interpretMove's), its stat, the scene-challenge
 * variant, the Mischief aside, which track it scores when it names none of
 * several, the asset abilities that apply and their consequence riders.
 *
 * A move that scores one of several open tracks and names none — or names a
 * vow already fulfilled — comes back with `targetChoice` and nothing more:
 * free-flow posts the "Which fight?" / "Which vow?" / "Which legacy track?" /
 * track-gone card from it (postTargetChoiceCard) and stops. A round's reading
 * (`gatherChoices`) keeps going, so its window shows the pick beside the
 * abilities.
 *
 * @param {Object} args
 * @param {string} args.narration — the player's line
 * @param {string|null} args.speakerActorId — the roller's PC
 * @param {Object} args.campaignState — the working copy
 * @param {string|null} args.apiKey
 * @param {*} args.dial — the Mischief dial
 * @param {{ moveId: string, moveTarget?: string|null, moveTargetId?: string|null }|null} [args.forced]
 * @param {string|null} [args.swearToConnection] — a forced Swear an Iron Vow's connection
 * @param {boolean} [args.gatherChoices] — a round's reading: go on past a target choice
 * @returns {Promise<{ interpretation: Object, combatPosition: *, targetChoice: Object|null,
 *   speakerActor: Actor|null, rollerActor: Actor|null }>}
 */
export async function readMove({
  narration, speakerActorId, campaignState, apiKey, dial,
  forced = null, swearToConnection = null, gatherChoices = false,
}) {
  const forcedMoveId       = forced?.moveId ?? null;
  const forcedMoveTarget   = forced?.moveTarget ?? null;
  const forcedMoveTargetId = forced?.moveTargetId ?? null;
  let targetChoice = null;

  // The roller's combat position, resolved once: their own in the open
  // fight, else the fight's when one is open (position is per character —
  // issue #322 V03: one PC's bad spot remapped another's Strike to Clash).
  // Fed to the interpreter so it only proposes position-appropriate combat
  // moves (constrainMoveToPosition forces the result legal), and reused
  // below for the Take Decisive Action bad-spot downgrade. null out of
  // combat, or when it cannot be told which fight applies.
  const combatPosition = await getActiveCombatPosition(speakerActorId ?? getPlayerActors()[0]?.id ?? null);

  const interpretation = forcedMoveId
    ? buildForcedInterpretation(forcedMoveId, narration, dial, forcedMoveTarget, forcedMoveTargetId)
    : await interpretMove(narration, {
        campaignState,
        mischiefLevel: dial,
        apiKey,
        combatPosition,
      });
  if (swearToConnection && interpretation?.moveId === "swear_an_iron_vow") {
    interpretation.swearToConnection = swearToConnection;
  }
  // A forced move whose stat is a choice rolls the one its narration's
  // approach fits — a stat-only interpretation — not its first listed
  // stat (issue #321 U04). No key keeps the listed stat.
  if (forcedMoveId) {
    await enrichForcedMoveStat(interpretation, {
      interpret: apiKey
        ? (text, moveId) => interpretMove(text, { campaignState, mischiefLevel: dial, apiKey, expectedMoveSlug: moveId })
        : null,
    });
  }

  // A scene-challenge move (Face Danger / Secure an Advantage within a
  // scene challenge — issue #338 D2) with no challenge open is the
  // ordinary move it varies: its progress and segments would land on
  // nothing, and its strong hit takes no momentum.
  if (SCENE_CHALLENGE_VARIANTS[interpretation.moveId]) {
    const ordinary = moveOutsideSceneChallenge(interpretation.moveId, await listProgressTracks().catch(() => []));
    if (ordinary !== interpretation.moveId) {
      console.debug(`${MODULE_ID} | ${interpretation.moveId}: no scene challenge is open — resolved as ${ordinary}.`);
      interpretation.moveId   = ordinary;
      interpretation.moveName = moveDisplayName(ordinary);
    }
  }

  if (interpretation.mischiefApplied) {
    // The aside plays on the gap between what the player SAID and the move
    // the Trickster chose — the narration, not the model's rationale
    // (issue #326 W50: the fight-reframe lines never fired).
    interpretation._mischiefAside = buildMischiefAside(
      narration ?? "",
      interpretation.moveId,
      interpretation.statUsed,
      dial
    );
  }

  // Take Decisive Action scores one fight's progress. With two or more
  // fights open and none named — a typed "I take decisive action", or a
  // combat card whose fight nothing named — it would score nothing: a
  // certain miss. Ask which fight instead of rolling; each pick posts the
  // move again with that fight's id (TDA-BUTTON-NO-TARGET). Strike and
  // Clash mark one fight's progress and Undertake an Expedition one
  // expedition's: unnamed among several, they made a phantom track (issue
  // #321 U16), so they ask too — a named destination is its own
  // expedition, or a new one.
  const whichTrackType =
    ["take_decisive_action", "strike", "clash"].includes(interpretation.moveId) ? "combat"
    : interpretation.moveId === "undertake_an_expedition" ? "expedition"
    : null;
  if (whichTrackType && !interpretation.moveTargetId) {
    const tracks = await listProgressTracks().catch(err => {
      console.warn(`${MODULE_ID} | which-${whichTrackType === "combat" ? "fight" : "expedition"} lookup failed:`, err?.message ?? err);
      return [];
    });
    const open   = tracks.filter(t => t.type === whichTrackType && !t.completed);
    const target = interpretation.moveTarget ?? null;
    const unresolved = whichTrackType === "combat"
      ? !selectCombatTrack(open, target)
      : !(typeof target === "string" && target.trim());
    if (open.length >= 2 && unresolved) {
      targetChoice = { kind: "track", trackType: whichTrackType, tracks: open };
    }
  }

  // The ROLLER's character (decisions.md → "Multiplayer attribution"):
  // the speaker resolved from the message. The first PC is the fallback
  // only where resolveSpeakerActorId leaves none and the move still runs —
  // no PC of the author's own at a one-PC (or empty) table; a PC-less
  // player at a table of several was told above (issue #326 D8).
  // One actor drives the ability scan, the stat substitution it offers,
  // and the stat values read below — scanning PC A's assets but reading
  // PC B's stats offered substitutions B doesn't have.
  const { speakerActor, rollerActor } = rollerFor(speakerActorId);

  // Fulfill Your Vow scores one vow's progress. Naming none while the
  // roller — or, holding none, the table — has several open, it scored
  // nothing: a certain miss. Ask which vow instead of rolling; each pick
  // posts the move again with that vow's copy, as the roller (issue #321
  // U02). A shared vow's copies are one vow (selectFulfilVow).
  if (interpretation.moveId === "fulfill_your_vow" && !interpretation.moveTargetId) {
    const { vow, choices, completed } = selectFulfilVow(await readAllVows(speakerActorId), interpretation.moveTarget ?? null,
      { rollerActorId: rollerActor?.id ?? null });
    // It names a vow that is already fulfilled: nothing is rolled, and no
    // other vow is scored in its place (issue #325 W29).
    if (!vow && completed) {
      targetChoice = { kind: "vow-gone" };
    } else if (!vow && choices.length >= 2) {
      targetChoice = { kind: "vow", vows: choices };
    }
  }

  // Continue a Legacy rolls each legacy track by name. Naming none, it
  // scored 0 — "progress (0 ticks)", a certain miss — and nothing on the
  // card said no track was found (issue #331 X63). Ask which track
  // instead of rolling: the card offers all three, each rolled once.
  if (interpretation.moveId === "continue_a_legacy" && !legacyTrackNamed(interpretation.moveTarget)) {
    const stored = game.settings.get(MODULE_ID, "campaignState") ?? campaignState;
    targetChoice = { kind: "legacy", tracks: legacyTrackScores(stored?.legacyTracks ?? {}) };
  }

  // A target to choose first: free-flow posts its card and stops here
  // (postTargetChoiceCard); a round's reading goes on, so its window shows
  // the pick beside the abilities.
  if (targetChoice && !gatherChoices) {
    return { interpretation, combatPosition, targetChoice, speakerActor, rollerActor };
  }

  // Scan the character's assets + the command vehicle's modules for
  // abilities that apply to the chosen move. Surfaced on the
  // confirmation dialog as opt-in checkboxes — accepted abilities
  // add their +N to interpretation.adds before the dice are rolled.
  const commandShipForScan      = getCommandVehicleActor(campaignState);
  const applicableAbilities = await scanForApplicableAbilities({
    moveId:           interpretation.moveId,
    moveName:         interpretation.moveName,
    narration,
    characterActor:   rollerActor,
    commandShipActor: commandShipForScan,
    apiKey,
  }).catch(err => {
    console.warn(`${MODULE_ID} | ability scan failed:`, err);
    return [];
  });
  interpretation.applicableAbilities = applicableAbilities;

  // Extract structured consequence riders from the applicable abilities now
  // (pre-roll, during the confirm-dialog wait) so they're ready to apply the
  // instant the outcome is known. No key / nothing applicable → []; the
  // post-roll step then no-ops and the ability text is just surfaced.
  interpretation.extractedRiders =
    (game.settings.get(MODULE_ID, "riders.autoApply") !== false && applicableAbilities.length)
      ? await extractRiders({
          abilities: applicableAbilities,
          moveName:  interpretation.moveName,
          apiKey,
        }).catch(err => {
          console.warn(`${MODULE_ID} | rider extraction failed:`, err?.message ?? err);
          return [];
        })
      : [];

  return { interpretation, combatPosition, targetChoice, speakerActor, rollerActor };
}

/**
 * Post the card a free-flow line gets in place of its roll when readMove
 * found it needs a target first: "Which fight?" / "Which expedition?",
 * "Which vow?", "Which legacy track?", or that the vow it named is already
 * fulfilled. Nothing is rolled.
 *
 * @param {{ interpretation: Object, targetChoice: Object, rollerActor: Actor|null }} read
 * @param {{ narration: string, speakerActorId: string|null }} ctx
 */
export async function postTargetChoiceCard(read, { narration, speakerActorId }) {
  const { postWhichFightCard, postWhichVowCard, postWhichLegacyCard, postTrackGoneCard } = pipelineHost();
  const { interpretation, targetChoice, rollerActor } = read;
  if (targetChoice?.kind === "track") {
    const whichTrackType = targetChoice.trackType;
    await postWhichFightCard({
      moveId:    interpretation.moveId,
      moveName:  interpretation.moveName,
      narration,
      actorId:   speakerActorId ?? null,
      fights:    targetChoice.tracks,
      trackType: whichTrackType,
    }).catch(err =>
      console.warn(`${MODULE_ID} | which-${whichTrackType === "combat" ? "fight" : "expedition"} card failed:`, err?.message ?? err));
  } else if (targetChoice?.kind === "vow-gone") {
    await postTrackGoneCard(interpretation).catch(err =>
      console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
  } else if (targetChoice?.kind === "vow") {
    await postWhichVowCard({ narration, actorId: rollerActor?.id ?? null, vows: targetChoice.vows }).catch(err =>
      console.warn(`${MODULE_ID} | which-vow card failed:`, err?.message ?? err));
  } else if (targetChoice?.kind === "legacy") {
    await postWhichLegacyCard({
      narration, actorId: rollerActor?.id ?? null, tracks: targetChoice.tracks,
    }).catch(err => console.warn(`${MODULE_ID} | which-legacy card failed:`, err?.message ?? err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1, for a Batch Mode round — read a submission into a stored reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a round entry's action on Submit (issue #340): the pacing decision
 * first — readings ignore `!roll` (the window has "Roll a move instead"),
 * `!pace` overrides still apply — then, for a move, readMove gathering its
 * target choice beside the abilities. Runs on the canonical GM, on its key,
 * outside the GM relay queue (it makes Claude calls).
 *
 * The reading is what the player's window shows and confirms, and what
 * rollMove rolls from when the round resolves — stored on the round, so it is
 * plain JSON.
 *
 * @param {Object} args
 * @param {string} args.text — the player's action
 * @param {string} args.speakerActorId — their PC
 * @param {Object} args.campaignState — a working copy
 * @param {string|null} args.apiKey
 * @param {*} args.dial — the Mischief dial
 * @param {{ move?: boolean, moveId?: string|null, moveTargetId?: string|null, forced?: Object|null }|null} [args.readAs]
 *   read as a move ("Roll a move instead"), as the move named ("Roll ⟨move⟩"
 *   — with the challenge the classifier named for it, by id), or as a card
 *   button's forced move
 * @returns {Promise<Object>} the reading
 */
export async function readAction({ text, speakerActorId, campaignState, apiKey, dial, readAs = null }) {
  const forced = readAs?.forced?.moveId
    ? readAs.forced
    : (readAs?.moveId ? { moveId: readAs.moveId, moveTargetId: readAs.moveTargetId ?? null } : null);
  const speakerName = (speakerActorId ? game.actors?.get(speakerActorId)?.name : null) ?? null;
  let pacing = null;
  if (!readAs?.move) {
    pacing = await decidePacing({
      playerText: text, campaignState, character: speakerName ? { name: speakerName } : null,
      apiKey, ignoreForceMove: true,
    });
    if (!pacing.runMove) {
      // The offer is the classifier's alone — no narration exists yet to
      // reconcile it with — and never a social move against a fellow PC
      // (finding G, suppressPcDirectedSocialMove).
      const suggestedMove = suppressPcDirectedSocialMove(pacing.suggestedMove ?? null, text, speakerName);
      return {
        kind:              READING_KIND.NARRATIVE,
        decision:          pacing.decision,
        suggestedMove:     suggestedMove ?? null,
        suggestedTargetId: suggestedMove ? (pacing.suggestedTargetId ?? null) : null,
      };
    }
  }
  const read = await readMove({
    narration: text, speakerActorId, campaignState, apiKey, dial,
    forced: forced ? { moveId: forced.moveId, moveTarget: forced.moveTarget ?? null, moveTargetId: forced.moveTargetId ?? null } : null,
    swearToConnection: forced?.swearToConnection ?? null,
    gatherChoices: true,
  });
  return readingFromMove(read, { forced, decision: pacing?.decision ?? "MOVE" });
}

/**
 * A readMove result as a stored reading: what the window shows (the move,
 * stat, rationale, Mischief aside, abilities, stat substitutions, target
 * choices) and the interpretation the roll starts from.
 *
 * @param {Object} read — readMove's result
 * @param {{ forced?: Object|null, decision?: string }} [opts]
 * @returns {Object}
 */
function readingFromMove(read, { forced = null, decision = "MOVE" } = {}) {
  const interpretation = jsonCopy(read.interpretation ?? {});
  const abilities = Array.isArray(interpretation.applicableAbilities) ? interpretation.applicableAbilities : [];
  const statOptions = [...new Set(abilities
    .map(a => (typeof a.statReplacement === "string" ? a.statReplacement : ""))
    .filter(Boolean))];
  return {
    kind:           READING_KIND.MOVE,
    decision,
    moveId:         interpretation.moveId ?? null,
    moveName:       interpretation.moveName ?? (interpretation.moveId ? moveDisplayName(interpretation.moveId) : null),
    statUsed:       interpretation.statUsed ?? null,
    rationale:      interpretation.rationale ?? "",
    mischiefAside:  interpretation._mischiefAside ?? "",
    abilities,
    statOptions,
    targetChoices:  targetOptionsFrom(read.targetChoice),
    blocked:        read.targetChoice?.kind === "vow-gone" ? "vow-gone" : null,
    combatPosition: read.combatPosition ?? null,
    forced: forced ? {
      tokenDragSetCourse:     forced.tokenDragSetCourse ?? null,
      incitingSwearMessageId: forced.incitingSwearMessageId ?? null,
    } : null,
    interpretation,
  };
}

/**
 * readMove's target choice as the window's pick: which fight or expedition,
 * which vow, which legacy track — each option by the id the roll names it by.
 *
 * @param {Object|null} choice — readMove's `targetChoice`
 * @returns {{ kind: string, trackType?: string, prompt: string, options: Array<{ id: string, label: string, detail: string }> }|null}
 */
function targetOptionsFrom(choice) {
  const boxes = (ticks) => `${Math.floor(Number(ticks ?? 0) / 4)}/10 boxes`;
  const rank  = (r) => String(rankName(r)).replace(/^\w/, c => c.toUpperCase());
  if (choice?.kind === "track") {
    const expedition = choice.trackType === "expedition";
    return {
      kind: "track", trackType: choice.trackType,
      prompt: expedition ? "Which expedition?" : "Which fight?",
      options: (choice.tracks ?? []).map(t => ({
        id: t.id, label: t.label ?? (expedition ? "Expedition" : "Combat"),
        detail: `${rank(t.rank ?? "dangerous")}, ${boxes(t.ticks)}`,
      })),
    };
  }
  if (choice?.kind === "vow") {
    return {
      kind: "vow", prompt: "Which vow?",
      options: (choice.vows ?? []).map(v => ({ id: v.id, label: v.name || "Vow", detail: `${rank(v.rank)}, ${boxes(v.ticks)}` })),
    };
  }
  if (choice?.kind === "legacy") {
    return {
      kind: "legacy", prompt: "Which legacy track?",
      options: (choice.tracks ?? []).map(t => ({ id: t.track, label: t.label, detail: `${boxes(t.ticks)}${t.cleared ? " (cleared)" : ""}` })),
    };
  }
  return null;
}

/**
 * The choices a reading not yet confirmed is rolled with ("used as read",
 * when a GM sends the round now): what the confirm dialog pre-checks — the
 * abilities that add to the roll or swap its stat — the listed stat kept, and
 * no target.
 *
 * @param {Object} reading
 * @returns {{ abilityIds: string[], statReplacement: null, targetId: null }}
 */
export function defaultChoices(reading) {
  const abilities = Array.isArray(reading?.abilities) ? reading.abilities : [];
  return {
    abilityIds: abilities.filter(a => Number(a.adds ?? 0) > 0 || (typeof a.statReplacement === "string" && a.statReplacement)).map(a => a.key),
    statReplacement: null,
    targetId: null,
  };
}

/**
 * Stage 2 for a round — the player's confirm in their window, as the confirm
 * dialog applies it: the checked abilities' adds, a stat substitution a
 * checked ability offers, and the picked target, on a fresh copy of the
 * reading's interpretation (src/ui/settingsPanel.js MoveConfirmDialog).
 *
 * @param {Object} reading
 * @param {{ abilityIds?: string[], statReplacement?: string|null, targetId?: string|null }} choices — validated (round.js validateChoices)
 * @returns {Object} the interpretation rollMove takes
 */
export function interpretationForRoll(reading, choices) {
  const interpretation = jsonCopy(reading?.interpretation ?? {});
  const offered = new Map((Array.isArray(reading?.abilities) ? reading.abilities : []).map(a => [a.key, a]));
  const chosen = (choices?.abilityIds ?? []).map(k => offered.get(k)).filter(Boolean);
  interpretation.appliedAbilityAdds = chosen.reduce((sum, a) => {
    const n = Number(a.adds ?? 0);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
  interpretation.appliedAbilityKeys = chosen.map(a => a.key);
  const stat = typeof choices?.statReplacement === "string" ? choices.statReplacement : "";
  interpretation.appliedStatReplacement = stat && chosen.some(a => a.statReplacement === stat) ? stat : null;
  const option = (reading?.targetChoices?.options ?? []).find(o => o.id === choices?.targetId) ?? null;
  if (option) {
    interpretation.moveTarget = option.label;
    if (reading.targetChoices.kind !== "legacy") interpretation.moveTargetId = option.id;
  }
  return interpretation;
}

/** A JSON-safe deep copy (a reading is stored on a world setting). */
function jsonCopy(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 — roll the move
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll a confirmed move and apply its outcome: the confirm's ability adds and
 * stat substitution, the stat and progress enrichment, the "not rolled"
 * guards, the adds owed (Take a Break, the roller's +1, a bond), the dice,
 * the outcome's effects, the per-move branches, a Pay the Price, the
 * narrator's relevance (with the GM's clarification dialog when it asks) and
 * the move result card. Canonical GM, under the move lock.
 *
 * @param {Object} args
 * @param {Object} args.interpretation — confirmed (confirmInterpretation, or applyConfirmChoices)
 * @param {Object} args.campaignState — the working copy (legacy ticks and a revealed site ride it to the record)
 * @param {string|null} args.speakerActorId
 * @param {string} args.narration — the player's line
 * @param {*} [args.combatPosition] — the roller's position as read; undefined reads it now
 * @param {Object|null} [args.tokenDragSetCourse]
 * @param {string|null} [args.incitingSwearMessageId] — an inciting "⚔ Swear this vow" card
 * @param {Object|null} [args.cardFlags] — more flags for the result card (a round's entry: its round and player)
 * @returns {Promise<{ refused: string }|{ refused: null, resolution: Object, interpretation: Object,
 *   relevance: Object, moveTargets: Object, burnState: Object|null, improveState: Object|null,
 *   moveResultMessage: ChatMessage|null, rollerActor: Actor|null, speakerActorId: string|null }>}
 */
export async function rollMove({
  interpretation, campaignState, speakerActorId, narration,
  combatPosition = undefined, tokenDragSetCourse = null, incitingSwearMessageId = null,
  cardFlags = null,
}) {
  const {
    postTrackGoneCard, applyOutcomeEffects, addLegacyTicks, postDevelopRelationshipCard, applyReachMilestone,
    postForgeABondCard, postExpeditionFinishCard, noteUnsavedOnCopy, postSceneFinishCard,
    postRecommitOfferCard, postVowRecommitOfferCard, postBondRecommitOfferCard,
    resolveVowItemCopies, completeVowItemByName, postFulfillVowCard, payFulfilledVowNative,
    postForsakeVowCard, postDecisiveActionCostCard, postMovePayThePriceCard, postMoveResult,
  } = pipelineHost();
  const { speakerActor, rollerActor } = rollerFor(speakerActorId);
  if (combatPosition === undefined) {
    combatPosition = await getActiveCombatPosition(speakerActorId ?? getPlayerActors()[0]?.id ?? null);
  }

  // A scene-challenge variant with no challenge open is the ordinary move it
  // varies (issue #338 D2; readMove applies it as it reads) — and again here,
  // as it is rolled: a Batch Mode entry is rolled after it was read, so an
  // earlier entry's Finish the Scene can have ended the challenge, and the
  // variant would mark nothing and take no momentum on a strong hit (issue
  // #342 Z39).
  if (SCENE_CHALLENGE_VARIANTS[interpretation.moveId]) {
    const ordinary = moveOutsideSceneChallenge(interpretation.moveId, await listProgressTracks().catch(() => []));
    if (ordinary !== interpretation.moveId) {
      console.debug(`${MODULE_ID} | ${interpretation.moveId}: no scene challenge is open as it is rolled — rolled as ${ordinary}.`);
      interpretation.moveId   = ordinary;
      interpretation.moveName = moveDisplayName(ordinary);
    }
  }

  // Apply opt-in adds from abilities the player kept checked in the
  // dialog. confirmInterpretation mutates interpretation.appliedAbilityAdds.
  const abilityAdds = Number(interpretation.appliedAbilityAdds ?? 0);
  if (abilityAdds > 0) {
    interpretation.adds = (interpretation.adds ?? 0) + abilityAdds;
  }

  // Stat substitution — when an asset ability (e.g. Empath's
  // "roll +heart in place of the listed stat") was offered AND the
  // player picked it on the confirm dialog, swap the move stat
  // before stat-value enrichment reads the actor sheet. The dialog
  // has already gated the value to one of the offered stats.
  const subStat = typeof interpretation.appliedStatReplacement === 'string'
    ? interpretation.appliedStatReplacement.trim()
    : '';
  if (subStat) {
    interpretation.statSubstitutedFrom = interpretation.statUsed;
    interpretation.statUsed = subStat;
  }

  // Fill in statValue from the speaker's character sheet. The
  // interpreter system prompt explicitly tells the model to leave
  // statValue at 0 and have the calling code fill it in (see
  // interpreter.js line 149); pre-this-fix nothing did, so every
  // action move resolved as actionDie + 0 + adds — players saw
  // "+iron (0)" and "Action: 6 + 0 = 6" on every chat card.
  enrichInterpretationStatValue(rollerActor, interpretation, campaignState);

  // Progress moves score from live module data (combat/expedition journal
  // tracks, actor vow Items, connection records) — the fix for pipeline
  // progress rolls always resolving at score 0 (nothing ever copied a
  // track's ticks into statValue, so Take Decisive Action and the victory
  // card's Attempt to Fulfill could never hit). Also returns the resolved
  // combat track's own position for the TDA downgrade below. No-op for
  // action moves.
  // The active connection records, each with its host Actor id (the
  // `connectionIds` entry the write helpers take) as `__hostId`.
  const listConnections = async () => {
    const conn = await import("../entities/connection.js");
    return (campaignState.connectionIds ?? [])
      .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
      .filter(Boolean);
  };
  const tickInfo = await enrichProgressTicks(interpretation, {
    listTracks: () => listProgressTracks(),
    readAllVows: () => readAllVows(speakerActorId),
    // The crew's shared legacy tracks as they stand (Overcome
    // Destruction, Continue a Legacy — issue #330 D6).
    readLegacyTracks: async () => (game.settings.get(MODULE_ID, "campaignState") ?? campaignState)?.legacyTracks ?? {},
    rollerActorId: rollerActor?.id ?? null,
    listConnections,
  }).catch(err => {
    console.warn(`${MODULE_ID} | progress tick enrichment failed:`, err?.message ?? err);
    return null;
  });

  // Develop Your Relationship with a bonded connection is a roll +rank: the
  // connection is resolved before the dice and its rank is the stat (issue
  // #314 Q06 — the schema lists no stat, so a bonded development rolled +0
  // where `!bond` rolled +rank). The develop branch below marks the
  // connection resolved here, by its id.
  await enrichBondedDevelop(interpretation, { listConnections }).catch(err => {
    console.warn(`${MODULE_ID} | bonded develop enrichment failed:`, err?.message ?? err);
    return null;
  });

  // The "not rolled" guards come before any +1 is taken: a move that is
  // not rolled pays no add, and both decisions put the +1 on the next
  // action roll MADE — a claim that adds nothing leaves it pending (issue
  // #331 X17: a forced Battle on a fight that had ended ate Take a
  // Break's +1 and the roller's own, then rolled nothing).
  //
  // A roll started from a track (a Progress Tracks row, an expedition
  // card, a "Which vow?" pick) names it by id. When that track was
  // deleted or finished meanwhile, nothing is rolled — and it says so: a
  // same-named sibling is a different fight, and a score of 0 would be a
  // certain miss with its consequences (issue #306 R06, #321 U02). A scene
  // challenge's Finish the Scene too (issue #326 D6 made it a progress move
  // after R06): a second finish, or a stale row, rolled a certain miss and
  // paid its price for a scene already over (issue #342 Z07).
  if (interpretation.moveTargetId
      && (tickInfo?.source === "combat" || tickInfo?.source === "expedition" || tickInfo?.source === "vow"
        || tickInfo?.source === "scene_challenge")
      && !tickInfo.trackId) {
    await postTrackGoneCard(interpretation).catch(err =>
      console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
    return { refused: "track-gone" };
  }
  // Battle is an action roll, so the guard above (progress moves) let a
  // Battle naming a finished fight by id roll in full — its +2 momentum
  // or a Pay the Price for a fight that was over (issue #325 W11).
  if (interpretation.moveId === "battle" && interpretation.moveTargetId) {
    const fights = await listProgressTracks().catch(() => []);
    const fight  = fights.find(t => t.id === interpretation.moveTargetId);
    if (!fight || fight.completed) {
      await postTrackGoneCard(interpretation).catch(err =>
        console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
      return { refused: "track-gone" };
    }
  }

  // Take a Break → "Move on": a single-use +1 on the next action roll (not
  // a progress move). Claimed on the stored campaignState before it is added
  // — a refused claim adds nothing and leaves it pending, so it is never
  // added to two rolls (issue #342 Z52) — and dropped from the working copy.
  // Taken after the enrichment, on the roll kind it resolved: a bonded
  // Develop Your Relationship (no roll by its data) rolls +rank and takes the
  // +1 (issue #326 W48 — it was taken by the next roll after it).
  const rollKind = interpretation.rollKind ?? null;
  const breakAdd = await consumeNextMoveAdd(campaignState, interpretation.moveId, { rollKind });
  if (breakAdd > 0) {
    interpretation.adds = (interpretation.adds ?? 0) + breakAdd;
  }
  // "+1 on your next move" the roller earned (Secure an Advantage, Gain
  // Ground): their own, on their next action roll — claimed on the store
  // first, so a refused claim adds nothing (issue #322 V02).
  const bonusAdd = await consumeNextMoveBonus(campaignState, rollerActor?.id ?? null, interpretation.moveId, { rollKind });
  if (bonusAdd > 0) {
    interpretation.adds = (interpretation.adds ?? 0) + bonusAdd;
  }
  // Heal: the patient — an ally the care is for, or a companion — resolved
  // before the dice; the recovery card checks and heals them, not the
  // healer (issue #325 W04).
  resolveHealPatient(interpretation, rollerActor, { players: getPlayerActors() });
  // Aid Your Ally: the ally whose benefits a hit is (issue #325 W17).
  resolveAidedAlly(interpretation, rollerActor, { players: getPlayerActors() });
  // A bonded Test Your Relationship adds +1; a vow sworn to a connection
  // +1, to a bonded one +2 (issue #325 W18).
  const bondAdd = await enrichBondAdds(interpretation, { listConnections }).catch(err => {
    console.warn(`${MODULE_ID} | bond add enrichment failed:`, err?.message ?? err);
    return 0;
  });
  if (bondAdd > 0) interpretation.adds = (interpretation.adds ?? 0) + bondAdd;

  // Take Decisive Action — the resolver applies the bad-spot downgrade
  // (play kit p. 5). Prefer the scored fight's position for the roller —
  // their own there, else the fight's (enrichProgressTicks; exact even
  // with several open fights, where getActiveCombatPosition can return
  // null); fall back to the position resolved at the top of this block.
  // resolveMove gates the downgrade on moveId, so passing a position for
  // every move is safe (no-op for non-TDA moves).
  const resolvedPosition =
    (interpretation.moveId === "take_decisive_action" && tickInfo?.combatState)
      ? tickInfo.combatState
      : combatPosition;
  // Site-aware waypoint seeds (SITE-WAYPOINT-BLIND): when the crew's
  // current location is a vault or derelict, explore_a_waypoint rolls
  // that site's canonical interior tables.
  const currentSite = getCurrentSiteKind(campaignState);
  // The roller's momentum as the dice are rolled: negative and matching the
  // action die, it cancels the die (resolver cancelsActionDie). Never read,
  // a -3 momentum never cancelled a 3 (issue #311 P01).
  const momentum = rollerActor ? readMomentumState(rollerActor).value : null;
  // Aid Your Ally resolves as Gain Ground while a fight is open, else as
  // Secure an Advantage (issue #325 W17).
  const inFight = interpretation.moveId === "aid_your_ally"
    && (await listProgressTracks().catch(() => [])).some(t => t.type === "combat" && !t.completed);
  const resolution = resolveMove(interpretation, campaignState, { combatPosition: resolvedPosition, currentSite, momentum, inFight });
  // resolveMove leaves the id to its caller. The move card's Burn / Improve
  // flags and the narration card both carry it, and superseding the
  // original narration after an upgrade finds that card by it — with no id
  // the struck-through pre-burn prose was never struck and kept reaching
  // the narrator's recent-narration ring (issue #300 F02).
  resolution._id = foundry.utils.randomID();

  // The outcome's effects beyond the roller's meters and its choice card —
  // an arrival, the expedition's progress, a legacy mark, the companion's
  // health, the fight's threshold, progress, position and end — through
  // the one applier Burn Momentum and Improve Result also run, for what
  // their upgraded outcome adds over this one (UPGRADE-PIPELINE-EFFECTS).
  // The fight the move was about comes back for its cards.
  const { moveFight, sceneChallenge } = await applyOutcomeEffects({
    resolution, interpretation, campaignState, rollerActor, speakerActor, tokenDragSetCourse,
  });

  // Develop Your Relationship (audit 3.14) — GM-gated. An un-bonded
  // connection marks its own relationship track ("no roll, mark progress");
  // a bonded connection pays the rolled outcome (§3.3.5,
  // BONDED_DEVELOP_OUTCOMES: strong 2 bonds-legacy ticks / weak +2
  // momentum / miss nothing), and a strong hit with a match raises its rank
  // by one (issue #322 V01).
  if (resolution.consequences?.developRelationship && game.user.isGM) {
    try {
      const conn = await import("../entities/connection.js");
      // Preserve each connection's host actor id (the value stored in
      // connectionIds); connection._id is a separate generated id that the
      // write helpers (getEntityDocument → game.actors.get) do not accept.
      const connections = (campaignState.connectionIds ?? [])
        .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
        .filter(Boolean);
      // A picker's host id first — without it, a picked un-bonded
      // connection fell back to the sole bonded one (issue #301 B01).
      const target = selectConnection(connections, interpretation.moveTarget ?? null,
        { hostId: interpretation.moveTargetId ?? null });
      const plan   = planDevelopRelationship(target, resolution.outcome, resolution.isMatch);

      if (plan.action === "bond-legacy") {
        if (plan.ticks > 0) addLegacyTicks(campaignState, "bonds", plan.ticks);
        // A Test Your Relationship hit develops with the test's own roll,
        // whose consequences cannot know the connection is bonded: its weak
        // hit's +2 momentum joins them here, before the card and the
        // persist, so it is credited to the roller with the move's other
        // meters. Develop Your Relationship's roll carries it from the
        // resolver already.
        if (plan.momentum > 0 && resolution.moveId !== "develop_your_relationship" && resolution.consequences) {
          resolution.consequences.momentumChange =
            Number(resolution.consequences.momentumChange ?? 0) + plan.momentum;
        }
        if (plan.raiseRank && plan.newRank && plan.connection.__hostId) {
          await conn.updateConnection(plan.connection.__hostId, { rank: plan.newRank }).catch(err =>
            console.warn(`${MODULE_ID} | develop: rank raise failed:`, err?.message ?? err));
          // Mirror onto the PCs' bond Items so CHARACTER STATE shows the
          // raised rank (NARR-BOND-RANK-STALE). The Items are keyed by the
          // record's `_id`, not the host Actor id (issue #314 Q04 — the
          // host id matched nothing, and the name fallback hid it until a
          // rename).
          await setBondItemRank(
            { connectionId: plan.connection._id, name: plan.connection.name },
            plan.newRank,
          ).catch(err =>
            console.warn(`${MODULE_ID} | develop: bond rank mirror failed:`, err?.message ?? err));
        }
        await postDevelopRelationshipCard(plan).catch(err =>
          console.warn(`${MODULE_ID} | develop card failed:`, err?.message ?? err));
      } else if (plan.action === "connection-progress" && plan.connection.__hostId) {
        await conn.markRelationshipProgress(plan.connection.__hostId, plan.marks).catch(err =>
          console.warn(`${MODULE_ID} | develop: progress mark failed:`, err?.message ?? err));
        await postDevelopRelationshipCard(plan).catch(err =>
          console.warn(`${MODULE_ID} | develop card failed:`, err?.message ?? err));
      }
      // action "none" → no resolvable connection; the move card's otherEffect
      // already tells the player to develop a relationship.
    } catch (err) {
      console.warn(`${MODULE_ID} | develop relationship failed:`, err?.message ?? err);
    }
  }

  // Reach a Milestone (no-roll quest move) — mark progress on the target vow
  // per its rank. The old resolver returned progressMarked:1 with a null
  // progressTrackId, so the persist gate never marked anything (playtest:
  // "successes are not granting progress on this Vow"). Now GM-gated and
  // driven by planReachMilestone (sole open vow → auto-mark; several → picker).
  if (resolution.consequences?.reachMilestone && game.user.isGM) {
    await applyReachMilestone(rollerActor, interpretation.moveTarget ?? null)
      .catch(err => console.warn(`${MODULE_ID} | reach a milestone failed:`, err?.message ?? err));
  }

  // Swear an Iron Vow — the vow is sworn regardless of outcome; the resolver
  // applies the momentum (+2 strong / +1 weak) and complication. GM-gated.
  if (resolution.moveId === "swear_an_iron_vow" && game.user.isGM) {
    // #248 Theme C: an inciting "⚔ Swear this vow" click routes through this
    // move so it actually rolls (+heart → momentum/complication, credited to
    // the clicker). Now that the roll has resolved, create the shared vow from
    // the original card's incitingMeta — swearSharedVowForAll posts its own
    // (richer, ranked) vow-swearing scene + connection + crisis clock + reward.
    // A plain typed swear (no inciting card) just gets the generic scene.
    const incitingSwearId = incitingSwearMessageId ?? null;
    const incitingMsg = incitingSwearId ? game.messages?.get?.(incitingSwearId) : null;
    if (incitingSwearId && !incitingMsg) {
      console.warn(`${MODULE_ID} | inciting swear: original card ${incitingSwearId} not found — no vow created`);
    }
    // The oath scene is the roller's, as the move narration is.
    if (incitingMsg) {
      await swearSharedVowForAll(incitingMsg, { speakerActorId: rollerActor?.id ?? null }).catch(err =>
        console.warn(`${MODULE_ID} | inciting swear creation failed:`, err?.message ?? err));
    } else {
      await narrateAndPostVowSwearing({
        vow: { name: interpretation.moveTarget ?? null, rank: null },
        campaignState,
        speakerActorId: rollerActor?.id ?? null,
      }).catch(err => console.warn(`${MODULE_ID} | vow-swearing scene failed:`, err?.message ?? err));
    }
  }

  // Forge a Bond hit (strong or weak) — mark connection as bonded and pay
  // bonds legacy. The Bolster/Expand Influence choice is surfaced in the
  // card text; it affects connection influence (tracked manually on the
  // character sheet).
  if (resolution.consequences?.forgeABond && game.user.isGM) {
    try {
      const conn = await import("../entities/connection.js");
      const connections = (campaignState.connectionIds ?? [])
        .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
        .filter(Boolean);
      // The same resolution enrichment scored (issue #301 B01): the
      // picker's host id, then the name, never a bonded fallback.
      const target = selectConnection(connections, interpretation.moveTarget ?? null,
        { hostId: interpretation.moveTargetId ?? null, unbonded: true });
      if (target?.__hostId && !target.bonded) {
        await conn.forgeBond(target.__hostId).catch(err =>
          console.warn(`${MODULE_ID} | forge bond: forgeBond failed:`, err?.message ?? err));
        // Same rank ladder as vow/expedition completion rewards.
        const ticks = legacyRewardTicks(target.rank, 0);
        if (ticks > 0) addLegacyTicks(campaignState, "bonds", ticks);
        await postForgeABondCard(target, ticks).catch(err =>
          console.warn(`${MODULE_ID} | forge bond card failed:`, err?.message ?? err));
      } else if (target?.bonded) {
        console.debug(`${MODULE_ID} | forge bond: "${target.name}" is already bonded — payoff already made.`);
      } else {
        console.warn(`${MODULE_ID} | forge bond: no connection matched "${interpretation.moveTarget ?? "?"}" — nothing forged.`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | forge a bond failed:`, err?.message ?? err);
    }
  }

  // Finish an Expedition — complete the open expedition track and pay its
  // rank's legacy reward (weak hit pays one rank lower) onto discoveries.
  if (resolution.consequences?.finishExpedition && game.user.isGM) {
    try {
      const fin = await finishExpedition(
        {
          moveTarget:   interpretation.moveTarget,
          moveTargetId: interpretation.moveTargetId ?? null,
          ranksDown:    resolution.consequences.finishExpedition.ranksDown ?? 0,
        },
        {
          listTracks:   () => listProgressTracks(),
          completeTrack: (id) => completeProgressTrack(id),
        },
      );
      if (fin?.track) {
        if (fin.legacyTicks > 0) addLegacyTicks(campaignState, "discoveries", fin.legacyTicks);
        await postExpeditionFinishCard(fin).catch(err =>
          console.warn(`${MODULE_ID} | expedition finish card failed:`, err?.message ?? err));

        // Reaching the end of an expedition discovers the unexplored sector
        // site it led to (precursor vault / derelict): the one its track
        // links, or the one its label names — never the sector's sole site
        // by guess, which charted the frontier derelict at the end of an
        // expedition to Bleakhold (issue #342 D7; the arrival went to the
        // same site — selectExpeditionSite, Z14). The discovered flag
        // is folded into the in-memory campaignState so it rides along with
        // the pending persistResolution write below (revealSectorSite sets
        // it on a copy — issue #326 W51); the scene pin + passage and the
        // location Actor update apply at once.
        try {
          const { revealSectorSite, postSiteDiscoveryCard } = await import("../sectors/siteDiscovery.js");
          const revealed = await revealSectorSite(fin.track?.label ?? interpretation.moveTarget, {
            source:   "expedition",
            siteId:   fin.track?.siteId ?? null,
            requireLabelMatch: true,
            getState: () => campaignState,
            setState: (next) => { campaignState.sectors = next.sectors; },
          });
          if (revealed) {
            noteUnsavedOnCopy(campaignState, { step: "site", sectorId: revealed.sector?.id ?? null,
              siteId: revealed.site?.id ?? null, name: revealed.site?.name ?? null });
            await postSiteDiscoveryCard(revealed);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | site reveal on finish-expedition failed:`, err?.message ?? err);
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | finish expedition failed:`, err?.message ?? err);
    }
  }

  // Finish the Scene (issue #326 D6) — the scene concludes on every
  // outcome: its challenge track completes here, which retires its
  // tension clock (completeProgressTrack), before a weak hit's or miss's
  // Pay the Price (routed below) could advance the clock of a scene that
  // has ended.
  if (resolution.consequences?.finishScene && game.user.isGM) {
    try {
      const { finishSceneChallenge } = await import("./sceneChallenge.js");
      const fin = await finishSceneChallenge(
        { moveTarget: interpretation.moveTarget ?? null, moveTargetId: interpretation.moveTargetId ?? null },
        {
          listTracks:    () => listProgressTracks(),
          completeTrack: (id) => completeProgressTrack(id),
        },
      );
      if (fin?.track) {
        await postSceneFinishCard(fin.track).catch(err =>
          console.warn(`${MODULE_ID} | scene finish card failed:`, err?.message ?? err));
      } else {
        console.warn(`${MODULE_ID} | finish the scene: no open scene challenge matched "${interpretation.moveTarget ?? "?"}" — nothing finished.`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | finish the scene failed:`, err?.message ?? err);
    }
  }

  // Finish an Expedition MISS — offer the play kit's recommit as a click
  // (roll both challenge dice, clear filled boxes equal to the lowest,
  // raise the rank one step) instead of advisory text the GM applies by
  // hand. The track stays open either way; the button is optional.
  if (resolution.moveId === "finish_an_expedition" && resolution.outcome === "miss" && game.user.isGM) {
    try {
      const track = selectExpeditionTrack(await listProgressTracks(), interpretation.moveTarget ?? null,
        { trackId: interpretation.moveTargetId ?? null });
      if (track) {
        await postRecommitOfferCard(track).catch(err =>
          console.warn(`${MODULE_ID} | recommit offer card failed:`, err?.message ?? err));
      } else {
        console.debug(`${MODULE_ID} | recommit offer skipped — no open expedition matched "${interpretation.moveTarget ?? "?"}".`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | recommit offer failed:`, err?.message ?? err);
    }
  }

  // Fulfill Your Vow and Forge a Bond MISS — the same recommit, offered as
  // a click on the vow scored or the connection forged (issue #330 D1):
  // "roll both challenge dice, take the lowest value, clear that number
  // of progress boxes, and raise the rank by one". It was advisory text
  // the GM applied by hand to the vow's copies or the connection's record
  // and its bond Items.
  if (resolution.outcome === "miss" && game.user.isGM
      && (resolution.moveId === "fulfill_your_vow" || resolution.moveId === "forge_a_bond")) {
    try {
      if (resolution.moveId === "fulfill_your_vow") {
        const vowName = (tickInfo?.source === "vow" ? tickInfo.label : null) ?? interpretation.moveTarget ?? null;
        const itemId  = tickInfo?.source === "vow" ? (tickInfo.trackId ?? null) : null;
        if (vowName) await postVowRecommitOfferCard({ vowName, itemId, actorId: rollerActor?.id ?? null });
        else console.debug(`${MODULE_ID} | vow recommit offer skipped — no vow was scored.`);
      } else {
        const conn = await import("../entities/connection.js");
        const connections = (campaignState.connectionIds ?? [])
          .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
          .filter(Boolean);
        const target = selectConnection(connections, interpretation.moveTarget ?? null,
          { hostId: interpretation.moveTargetId ?? null, unbonded: true });
        if (target?.__hostId && !target.bonded) await postBondRecommitOfferCard(target, rollerActor?.id ?? null);
        else console.debug(`${MODULE_ID} | bond recommit offer skipped — no un-bonded connection matched "${interpretation.moveTarget ?? "?"}".`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | recommit offer failed:`, err?.message ?? err);
    }
  }

  // Fulfill Your Vow — close the target vow everywhere it lives and pay the
  // payoff once. Vows are dual-stored: journal `vow` tracks and actor vow
  // Items (the live store for inciting / shared / hand-made vows —
  // milestones mark items). A hit must complete BOTH forms: pre-fix this
  // branch only completed journal tracks, so item-stored vows closed
  // nothing when fulfilled through the pipeline. Weak hit pays one rank
  // lower (ranksDown: 1). Legacy ticks always land on the pipeline's own
  // campaignState object (persisted once, later) — payFulfilledVowNative's
  // internal legacy write is reserved for the native-sheet hook, where no
  // pipeline persist could clobber it.
  if (resolution.consequences?.fulfillVow && game.user.isGM) {
    try {
      const ranksDown = resolution.consequences.fulfillVow.ranksDown ?? 0;
      // The vow the roll scored names the journal twin to close — a
      // fulfilment that names none (the Attempt to Fulfill button) fell to
      // the sole open journal vow, another vow's twin (issue #326 W44).
      const scoredVowName = tickInfo?.source === "vow" ? (tickInfo.label ?? null) : null;
      const fin = await finishVow(
        { moveTarget: scoredVowName ?? interpretation.moveTarget, ranksDown },
        {
          listTracks:    () => listProgressTracks(),
          completeTrack: (id) => completeProgressTrack(id),
        },
      );
      // The enriched vow name — the exact item the roll scored against —
      // is the most reliable key; the journal track label and the raw
      // moveTarget are fallbacks.
      const vowName =
        (tickInfo?.source === "vow" ? tickInfo.label : null)
        ?? fin?.track?.label
        ?? interpretation.moveTarget
        ?? null;
      // The roller and the Item the roll scored: completion and payoff
      // resolve THAT vow, never another PC's same-named one (issue #301
      // B02). trackId is a journal track's id on the journal fallback —
      // it then matches no Item and the roller's name match applies.
      const vowKey = {
        actorId: rollerActor?.id ?? null,
        itemId:  tickInfo?.source === "vow" ? (tickInfo.trackId ?? null) : null,
      };
      // A vow already fulfilled on the sheet carries `fulfilPaid` (the
      // native payoff's claim — the vendor leaves the Item open, so it can
      // be fulfilled again here): its Quests legacy is paid, and the write
      // below paid it a second time (issue #325 W28).
      const legacyPaid = resolveVowItemCopies(vowName, vowKey).copies
        .some(({ item }) => item?.flags?.[MODULE_ID]?.fulfilPaid === true);
      const itemDone = await completeVowItemByName(vowName, vowKey);

      if (fin?.track) {
        if (fin.legacyTicks > 0 && !legacyPaid) addLegacyTicks(campaignState, "quests", fin.legacyTicks);
        await postFulfillVowCard(fin).catch(err =>
          console.warn(`${MODULE_ID} | fulfill vow card failed:`, err?.message ?? err));
        // Journal path already paid the quests legacy — deliver only the
        // connection deepen + promised reward. Sets fulfilPaid, so a later
        // native-sheet roll of the same vow can't double-pay.
        if (itemDone) await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true, ...vowKey });
      } else if (itemDone) {
        // Item-only vow (no journal twin): legacy on the pipeline's
        // campaignState, deepen + reward via the shared payoff, then a
        // fulfil card synthesized from the item.
        const ticks = legacyPaid ? 0 : legacyRewardTicks(itemDone.rank, ranksDown);
        if (ticks > 0) addLegacyTicks(campaignState, "quests", ticks);
        await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true, ...vowKey });
        await postFulfillVowCard({ track: { label: itemDone.name, rank: itemDone.rank }, legacyTicks: ticks, legacyPaid }).catch(err =>
          console.warn(`${MODULE_ID} | fulfill vow card failed:`, err?.message ?? err));
      } else {
        console.warn(`${MODULE_ID} | fulfil: hit but no vow track or item matched "${vowName ?? "?"}" — nothing completed.`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | fulfill vow failed:`, err?.message ?? err);
    }
  }

  // Forsake Your Vow — actually clear the vow (VOW-FORSAKE-COSMETIC fix:
  // the costs used to be presented while the vow item/track stayed open).
  // Every copy is marked completed + flagged forsaken (audit-preserving —
  // nothing is deleted), the journal twin closes, and a still-promised
  // reward flips to lost. No legacy pays — the vow was abandoned, not
  // achieved. The resolver's cost sufferPrompt rides separately.
  if (resolution.consequences?.forsakeVow && game.user.isGM) {
    try {
      // The roller's own vow first (issue #301 B02) — never another PC's
      // vow that shares the name.
      const { primary, copies } = resolveVowItemCopies(interpretation.moveTarget ?? null,
        { actorId: rollerActor?.id ?? null });
      const fin = await finishVow(
        { moveTarget: interpretation.moveTarget ?? primary?.item?.name ?? null, ranksDown: 0 },
        {
          listTracks:    () => listProgressTracks(),
          completeTrack: (id) => completeProgressTrack(id),
        },
      ).catch(() => null); // journal twin close — legacyTicks deliberately unused
      if (primary) {
        for (const { actor, item } of copies) {
          if (item.system?.completed !== true) {
            await completeVowItem(actor, item.id).catch(err =>
              console.warn(`${MODULE_ID} | forsake: complete failed:`, err?.message ?? err));
          }
          await item.setFlag?.(MODULE_ID, "forsaken", true).catch(() => {});
        }
        const rewardCopy = copies.find(({ item }) =>
          item.flags?.[MODULE_ID]?.reward?.status === "promised");
        if (rewardCopy) {
          // Keyed as the copies are found — the flag, else the Item's own id:
          // a sheet vow whose stamp never landed kept a forsaken vow's reward
          // "promised" (issue #342 Z54).
          const f = rewardCopy.item.flags[MODULE_ID];
          await setSharedVowReward(vowCopyId(rewardCopy.item), { ...f.reward, status: "lost" }).catch(() => {});
        }
        await postForsakeVowCard(primary.item.name).catch(err =>
          console.warn(`${MODULE_ID} | forsake card failed:`, err?.message ?? err));
      } else if (fin?.track) {
        await postForsakeVowCard(fin.track.label).catch(err =>
          console.warn(`${MODULE_ID} | forsake card failed:`, err?.message ?? err));
      } else {
        console.warn(`${MODULE_ID} | forsake: no vow matched "${interpretation.moveTarget ?? "?"}" — nothing cleared.`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | forsake vow failed:`, err?.message ?? err);
    }
  }

  // TDA weak hit — roll decisive_action_cost d100 and post a visible card.
  // Entry 1-40 carries sufferRoute {move:"any", amount:2} which opens the
  // B1 generic suffer picker so the player can choose which move takes -2.
  if (resolution.consequences?.rollDecisiveActionCost && game.user.isGM) {
    await postDecisiveActionCostCard(rollerActor?.id ?? null).catch(err =>
      console.warn(`${MODULE_ID} | decisive action cost card failed:`, err?.message ?? err));
  }

  // A result that routes Pay the Price (a Face Danger / Strike / Set a
  // Course … miss, Face Defeat) — roll pay_the_price d100, post a visible
  // card under the move that paid it, and dispatch any routable suffer
  // entry (as typing !pay-the-price does). Capture the PtP reversals
  // (clocks advanced + suffer meter applied) so the burn button can undo
  // them when the player burns momentum to upgrade the outcome.
  let ptpReversals = null;
  if (resolution.consequences?.routePayThePrice && game.user.isGM) {
    // Whether the move card will offer Burn Momentum or Improve Result:
    // the price is paid before that card posts, and a resist roll its
    // harm owes — the roller's next move, which closes them — says to
    // take them first (issue #336 Y18). Read before the price lands, the
    // live momentum is the momentum buildBurnState below adds it back to.
    const upgradeOffered = !!(buildBurnState(resolution, rollerActor)?.canBurn
      || buildImproveState(resolution, interpretation.applicableAbilities, rollerActor)?.canImprove);
    // A scene-challenge move's miss filled its challenge's clock itself:
    // "fill a clock segment and Pay the Price" is one fill (issue #338 D2).
    const skipClockIds = sceneChallenge?.clockId ? [sceneChallenge.clockId] : [];
    const ptp = await postMovePayThePriceCard(rollerActor?.id ?? null, resolution.moveName ?? null, resolution._id ?? null, { upgradeOffered, skipClockIds }).catch(err => {
      console.warn(`${MODULE_ID} | ${resolution.moveName ?? "move"} PtP card failed:`, err?.message ?? err);
      return null;
    });
    ptpReversals = ptp?.reversals ?? null;
    // The move's narration depicts this card's price — the one the table
    // pays; the resolver rolled none for it (issue #321 U03).
    resolution.oracleSeeds = withPayThePriceSeed(resolution.oracleSeeds, resolution.moveId, ptp?.price ?? null);
  }

  // Step 7: relevance resolver — picks the narrator-permission block
  // and identifies which entity records to inject as cards. For hybrid
  // moves with implicit references, we pause the pipeline for a
  // clarification dialog before continuing.
  let relevance = await resolveRelevance(
    resolution.playerNarration ?? narration,
    resolution.moveId,
    resolution.outcome,
    campaignState,
  ).catch(err => {
    console.warn(`${MODULE_ID} | relevance resolver failed:`, err);
    return {
      resolvedClass: 'embellishment', entityIds: [], entityTypes: [],
      matchedNames: [], needsClarification: false, referenceType: 'none',
    };
  });

  if (relevance.needsClarification) {
    // (The pendingClarification campaignState marker written around this
    // prompt had no reader and was removed in the 2026-10 audit.)
    const selection = await ClarificationDialog.prompt(campaignState, relevance);
    relevance = applyClarificationSelection(relevance, selection);
  }

  // Step 8 (retired 2026-07, FACTION-PACKET-DEAD): the assembler context
  // packet was built here and passed to narrateResolution, whose packet
  // parameter was never read — a Loremaster-era conduit. The narrator's
  // context flows entirely through buildNarratorExtras (which now carries
  // the packet's load-bearing WJ sections: threats, faction landscape,
  // confirmed lore). See decisions.md → "The context packet is retired".

  // Step 9: post move result card. Determine burn eligibility against the
  // active character so the card can carry a 🔥 Burn Momentum button when
  // the dice would actually improve under burn.
  // What the move was made against: its suffer-choice card changes that
  // vehicle, companion or fight (issue #309), and so does the choice card
  // an upgrade of its result posts (issue #311 P03).
  const moveTargets = {
    vehicleActorId:  interpretation.vehicleActorId ?? null,
    companionItemId: interpretation.companionItemId ?? null,
    combatTrackId:   moveFight?.id ?? null,
    // A support vehicle's own roll: its integrity choices change that asset's
    // track, not the command vehicle's (issue #342 Z53). Absent otherwise.
    ...(interpretation.vehicleItemId ? { vehicleItemId: interpretation.vehicleItemId } : {}),
    // Heal's patient: its recovery is checked against and applied to them
    // (issue #325 W04). Absent for every other move.
    ...(interpretation.patientActorId ? { patientActorId: interpretation.patientActorId } : {}),
    ...(interpretation.patientCompanionItemId ? { patientCompanionItemId: interpretation.patientCompanionItemId } : {}),
    // Aid Your Ally's ally: a hit's benefits — the choice card's too —
    // are theirs (issue #325 W17).
    ...(interpretation.allyActorId && resolution.consequences?.beneficiary === "ally"
      ? { allyActorId: interpretation.allyActorId } : {}),
    // A scene-challenge move's challenge and what it filled of its clock:
    // an upgrade scores that challenge and takes back no more than this
    // filled (issue #338 D2).
    ...(sceneChallenge ? { sceneChallenge } : {}),
  };
  // What an upgrade of this result needs to apply the upgraded outcome's
  // other effects as this pipeline applied the original's — the move's
  // target, its id and the ranks the interpreter inferred
  // (applyOutcomeEffects; UPGRADE-PIPELINE-EFFECTS).
  const moveContext = {
    moveTarget:     interpretation.moveTarget ?? null,
    moveTargetId:   interpretation.moveTargetId ?? null,
    combatRank:     interpretation.combatRank ?? null,
    expeditionRank: interpretation.expeditionRank ?? null,
  };
  const burnActor   = rollerActor;
  const burnState   = buildBurnState(resolution, burnActor, ptpReversals, moveTargets, moveContext);
  // Post-roll "improve the result" affordance (finding G) — e.g. Fugitive's
  // "improve the result to a strong hit" at the cost of filling its clock.
  // Driven by the same abilities surfaced pre-roll on the confirm dialog.
  // A miss's Pay the Price is undone by either upgrade (issue #311 P05).
  const improveState = buildImproveState(resolution, interpretation.applicableAbilities, burnActor, ptpReversals, moveTargets, moveContext);
  // "Reach a Milestone" suggestion (playtest: surface vow progress on a
  // success). Eligible on a quest-advancing hit when the PC has an open vow;
  // clicking marks progress without retyping the move. See moves/milestone.js.
  const milestoneState = buildMilestoneSuggestion(
    resolution, readVows(burnActor), MOVES[resolution.moveId]?.category ?? null,
  );
  const { getConnection: _getConn } = await import("../entities/connection.js");
  const _activeConns = (campaignState.connectionIds ?? [])
    .map(hostId => { const c = _getConn(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(Boolean);
  const connectionState = buildConnectionSuggestion(
    resolution, _activeConns, MOVES[resolution.moveId]?.category ?? null,
  );
  const moveResultMessage = await postMoveResult(
    resolution,
    interpretation._mischiefAside ?? null,
    burnState,
    improveState,
    milestoneState,
    connectionState,
    moveFight,
    rollerActor?.id ?? null,
    cardFlags,
  );

  return {
    refused: null,
    resolution, interpretation, relevance, moveTargets, burnState, improveState,
    moveResultMessage: moveResultMessage ?? null, rollerActor, speakerActorId,
  };
}

/**
 * What a round's narration needs from a rolled entry, kept on the round so a
 * round resumed after a reload narrates without rolling again (issue #340):
 * the move, its outcome and match, the outcome text the narrator is given
 * (with the price it paid — the oracle seeds carry a Pay the Price's), and the
 * relevance the roll resolved (its class and matched entities).
 *
 * @param {Object} resolution
 * @param {Object|null} [relevance]
 * @returns {Object}
 */
export function narrationInputFrom(resolution, relevance = null) {
  return jsonCopy({
    kind:              "move",
    resolutionId:      resolution?._id ?? null,
    moveId:            resolution?.moveId ?? null,
    moveName:          resolution?.moveName ?? (resolution?.moveId ? moveDisplayName(resolution.moveId) : null),
    statUsed:          resolution?.statUsed ?? null,
    outcome:           resolution?.outcome ?? null,
    outcomeLabel:      resolution?.outcomeLabel ?? null,
    isMatch:           resolution?.isMatch === true,
    loremasterContext: resolution?.loremasterContext ?? "",
    oracleSeeds:       resolution?.oracleSeeds ?? null,
    relevance: relevance ? {
      resolvedClass: relevance.resolvedClass ?? "embellishment",
      entityIds:     Array.isArray(relevance.entityIds) ? relevance.entityIds : [],
      entityTypes:   Array.isArray(relevance.entityTypes) ? relevance.entityTypes : [],
    } : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — record the move
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a rolled move: persistResolution writes its meters and its record
 * (a refused record goes on the GMs' card with a Retry — the move resolved),
 * the move card's Burn Momentum / Improve Result open now the original
 * outcome is on the sheet, and the roller's earlier move cards' upgrades
 * close. Canonical GM, under the move lock. Free-flow records after the
 * narration; a round records before it narrates.
 *
 * @param {Object} rolled — rollMove's result
 * @param {Object} campaignState — the working copy
 * @returns {Promise<void>}
 */
export async function recordMove(rolled, campaignState) {
  const { reportUnsavedMoveRecord } = pipelineHost();
  const { resolution, moveTargets, burnState, improveState, moveResultMessage, rollerActor, speakerActorId } = rolled;
  // What the move was made against rides onto its suffer-choice card,
  // so a choice changes that vehicle, companion or fight (issue #309).
  // A refused record is not a failed interpretation: the move resolved
  // and its meters stand, so the pipeline goes on — what the record
  // carried is on the GMs' card, with a Retry (issue #331 X18). So are
  // the roller's meters when the world refused them, the record saved
  // or not (issue #336 Y16), and the move's suffer-choice card
  // (ERROR-TEXT-BLAMES-KEY).
  try {
    const persisted = await persistResolution(resolution, campaignState, speakerActorId, moveTargets);
    if (persisted?.meterFailures?.length || persisted?.cardFailures?.length) {
      await reportUnsavedMoveRecord(campaignState, {
        actorId: rollerActor?.id ?? null, moveName: resolution.moveName ?? null,
        recordSaved: true, meterFailures: persisted.meterFailures ?? [], cardFailures: persisted.cardFailures ?? [],
      });
    }
  } catch (err) {
    if (!err?.moveRecordRefused) throw err;
    console.error(`${MODULE_ID} | ${err.message}`);
    await reportUnsavedMoveRecord(campaignState, {
      actorId: rollerActor?.id ?? null, moveName: resolution.moveName ?? null, error: String(err.cause?.message ?? err.cause ?? err.message),
      meterFailures: err.meterFailures ?? [], cardFailures: err.cardFailures ?? [],
    });
  }
  // The original outcome is on the sheet: open the card's Burn Momentum /
  // Improve Result buttons. They stay disabled (and their GM handlers
  // refuse) until this stamp — a burn clicked during the narration above
  // applied the upgraded outcome, then this persist added the original
  // on top of it (issue #300 F02). The click handlers diff the upgraded
  // outcome against the recorded original.
  const recorded = {
    ...(burnState    ? { [`flags.${MODULE_ID}.burn.originalApplied`]:    true } : {}),
    ...(improveState ? { [`flags.${MODULE_ID}.improve.originalApplied`]: true } : {}),
  };
  if (moveResultMessage && Object.keys(recorded).length) {
    await moveResultMessage.update(recorded).catch(err =>
      console.warn(`${MODULE_ID} | burn / improve metadata update failed:`, err));
  }
  // This roller's earlier move cards: their Burn / Improve belonged to
  // the moves being made then — closed now this one has resolved (issue
  // #326 D4). Canonical GM: the pipeline runs there.
  await closeUpgradesForLaterMove(rollerActor?.id ?? null, resolution._id ?? null).catch(err =>
    console.warn(`${MODULE_ID} | closing earlier move cards' upgrades failed:`, err?.message ?? err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5 — finish the move
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-apply the asset consequence riders the move's outcome fires — meters
 * and progress — with a GM prompt for a choice. Runs after the record, with
 * the move lock released: an unanswered prompt must not hold it
 * (PLAYTEST-1712 M/N).
 *
 * @param {Object} rolled — rollMove's result
 * @param {Object} campaignState — the working copy
 * @returns {Promise<void>}
 */
export async function finishMove(rolled, campaignState) {
  const { applyMoveConsequenceRiders } = pipelineHost();
  const { resolution, interpretation, rollerActor } = rolled;
  // Auto-apply asset consequence riders from this outcome — meters and
  // progress — so the player never adjusts resources by hand. Runs after
  // persistResolution so the move's own consequences land first; optional
  // / choice / ambiguous-progress riders prompt. That prompt no longer
  // holds the move lock (released just above). GM-gated (world writes).
  await applyMoveConsequenceRiders(resolution, interpretation, campaignState, rollerActor)
    .catch(err => console.warn(`${MODULE_ID} | consequence riders failed:`, err?.message ?? err));
}
