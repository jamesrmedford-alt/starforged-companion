// src/narration/narrator.js
// Core narration module — calls Claude API and posts narration chat cards.
// Runs on whichever client triggered the move; no GM dependency, no socket relay.

import { apiPost } from '../api-proxy.js';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  buildSceneUserMessage,
  buildCampaignRecapUserMessage,
  buildSharedStorySections,
  buildPacedNarrativeUserMessage,
  buildRoundUserMessage,
  roundSentenceTarget,
  roundMaxTokens,
  formatEntityCard,
  formatSettlementPlanet,
  splitNarratorSystemPrompt,
  sanitizePlayerText,
  SCENE_LEDGER_FIELDS,
  resolveNarrationPerspective,
  sessionPerspectiveOf,
} from './narratorPrompt.js';
import { resolveRelevance, collectAllEntities, resolveEntityName, wholeWordPattern, namesOneWordName } from '../context/relevanceResolver.js';
import { isCanonicalGM, hasKeyedActiveGM } from '../multiplayer/gmGate.js';
import { connectionDrops, pageIsStale } from '../multiplayer/connectionWatch.js';
import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';
import { settledWithin, WORLD_WRITE_WAIT_MS } from '../multiplayer/settleWithin.js';
import { isNarrationXCarded } from '../context/safety.js';
import { lastSessionToTell } from '../session/lifecycle.js';
import { stripMarkup, proseToHtml } from '../audio/segments.js';
import { unpacedClock, pacedByOneOf, planInPlayFor } from '../clocks/planClockPacing.js';
import { claudeFailureReason, NO_CLAUDE_KEY_REASON, EMPTY_REPLY_REASON } from './failureReason.js';
import { SPOTLIGHT_MODES, selectSpotlight, buildSpotlightBlock } from './spotlight.js';
import { recentImages, pickBeatShape, beatShapeAfter, BEAT_SHAPES, IMAGE_SOURCE_CARDS } from './proseVariety.js';
import { extractSidecar, normaliseSidecar } from '../factContinuity/sidecarParser.js';
import { markSeedsUsed } from '../session/sceneSeeds.js';
import { applySidecar, applySceneFrame, retractNarrations, newNarrationId } from '../factContinuity/ledgers.js';
import { readRecentOracleResults, dropOracleResultsFor } from '../oracles/oracleMemory.js';
import { logNarratorUsage } from '../pacing/telemetry.js';
import { recordNarratorRequest, recordNarratorResponse, recordNarratorFactBlock } from './narratorDebug.js';
import { inferShipPosition }  from '../factContinuity/shipPosition.js';
import { startScene, persistSceneLedgerFields, mergeSceneLedgers } from '../factContinuity/sceneLifecycle.js';
import { formatNameChangesBlock, NAME_CHANGES_HEADING } from '../factContinuity/nameChanges.js';
import { runConsistencyCheck } from '../factContinuity/consistencyCheck.js';
import {
  runCombinedDetectionPass,
  routeEntityDrafts,
  routeWorldJournalResults,
  appendGenerativeTierUpdates,
  applyEntityRenames,
  PACED_NARRATIVE_MOVE_ID,
  PACED_NARRATIVE_OUTCOME,
} from '../entities/entityExtractor.js';
import { getConnection, listConnections }  from '../entities/connection.js';
import {
  getActiveThreats,
  getFactionLandscape,
  getConfirmedLore,
  getRecordedLocations,
  selectLoreForContext,
  hiddenPlansInPlayWithout,
} from '../world/worldJournal.js';
import { getSettlement, listSettlements }  from '../entities/settlement.js';
import { getFaction, listFactions, mergeFactionLandscape } from '../entities/faction.js';
import { getShip }        from '../entities/ship.js';
import { getPlanet, listPlanets }       from '../entities/planet.js';
import { getLocation, listLocations }   from '../entities/location.js';
import { getCreature }    from '../entities/creature.js';
import { buildCampaignTruthsBlock } from '../system/campaignTruths.js';
import { getTruth } from '../truths/generator.js';
import { getChronicleEntries } from '../character/chronicle.js';
import { campaignRecapSourceOf, citedRecap, recapText, recapReplyAgain, recapLastingUntold } from '../record/recapView.js';
import {
  summaryState, summarySourceThrough, sessionSummaryText, summariesOwed, sessionIdOfNumber,
  SESSION_SUMMARY_SYSTEM_PROMPT, sessionSummaryUserMessage, summaryLastingUntold, summaryReplyAgain,
} from '../record/summaryView.js';
import { writeRecordView } from '../record/store.js';
import { recordSettled } from '../record/record.js';
import { renderSessionLog } from '../record/sessionLogView.js';
import { readCharacterSnapshot, getPlayerActors, isPlayerCharacterActor } from '../character/actorBridge.js';
import { MOVES, toMoveId } from '../schemas.js';
import { moveDisplayName } from '../system/i18n.js';
import { SCENE_CHALLENGE_VARIANTS } from '../moves/sceneChallenge.js';
import { priceRevealsNewEnemy, newEnemySeedLines, vowPlanRequest, withHiddenRolls, settlePriceChoice } from '../moves/resolver.js';
import { priceChoiceStatus, withUnansweredCards } from '../moves/resultUpgrade.js';
// What the long haul's third live run turned up (a line of its own, apart from the block above).
import { formatOracleAnswerRule } from './narratorPrompt.js';
import { withoutUntoldTruths } from '../world/secrets.js';
import { listSkeletons, skeletonsEnabled, applyPlanSideData, revealedTruthsOf, planForClock, planClock, fileRequestedPlan, rollReroll, rearmUnplayedPlanClock, requestPlansInPlay } from '../world/secrets.js';
import { selectRelevantSkeletons, planRequestsFromSeeds, normalisePlanRequests, normaliseReveals, plannedBeings, planFiledFor, seedsWithPlannedEnemy, PLANS_PER_SIDECAR, PLAN_REQUESTS_PER_NARRATION } from '../world/skeletons.js';
import { resolveWorldSnapshot, noteWorldSnapshotSent } from './worldSnapshotStore.js';
import { entityUnitKey, planUnitKey } from './worldSnapshot.js';
import { reportSnapshotEvent, worldSnapshotEnabled } from './snapshotEvents.js';

const ENTITY_GETTERS = {
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
};

const LOCATION_GETTERS = {
  settlement: getSettlement,
  location:   getLocation,
  planet:     getPlanet,
};

const MODULE_ID      = 'starforged-companion';

/** campaignState fields a narrator sidecar writes (applySidecar + applySceneFrame). */
const SIDECAR_FIELDS = Object.freeze(['sceneTruths', 'sceneState', 'sceneFrame']);

/**
 * True when the X-Card is active. Checks the caller's campaignState AND the
 * live stored setting: the move pipeline narrates from a snapshot read before
 * its confirm dialog and Claude calls, so an X-Card played meanwhile (relayed
 * to the GM) is only visible in the store. Errs toward suppressing. Exported
 * for the Private Channel's narrator and Publish (issue #321 U09).
 *
 * @param {Object|null} campaignState
 * @returns {boolean}
 */
export function isXCardActive(campaignState) {
  if (campaignState?.xCardActive) return true;
  try {
    return !!game.settings.get(MODULE_ID, 'campaignState')?.xCardActive;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: live X-Card read failed; using the caller's state:`, err?.message ?? err);
    return false;
  }
}

/**
 * How many times the X-Card has been played in this world (suppressScene
 * counts each play in `campaignState.xCardPlays`). Read live; 0 when unread.
 *
 * @returns {number}
 */
function xCardPlayCount() {
  try {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    return Number(cs?.xCardPlays) || 0;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: live X-Card count read failed:`, err?.message ?? err);
    return 0;
  }
}

/**
 * Watch for the X-Card while a narration is generated (issue #300 F13).
 * Every narrator entry point checks the X-Card on entry, but the reply
 * arrives seconds later: the table must not read or hear what the card was
 * played to stop, and the reply's side-data must not enter the scene ledger.
 *
 * Start the watch on entry, after the entry gate; call `interrupted(label)`
 * right after each Claude call returns — before the sidecar is applied or
 * anything is posted — and stand down as on entry when it is true. It is
 * true while the X-Card is active, and also when it was played since the
 * watch began and a GM has already resumed (issue #306 R01): resuming lets
 * new narrations run, it doesn't revive one the card interrupted.
 *
 * @param {Object|null} campaignState
 * @returns {{ interrupted: (label: string) => boolean }}
 */
export function watchXCard(campaignState) {
  const playsAtStart = xCardPlayCount();
  const dropsAtStart = connectionDrops();
  return {
    interrupted(label) {
      // This client's connection dropped while the narration was written: a
      // pause recorded meanwhile never reached its cache, so neither the
      // count nor the flag can be trusted — the narration is discarded, its
      // sidecar never applied (issue #347 AB19).
      _discardedForDrop = false;
      _discardedForStale = false;
      if (connectionDrops() !== dropsAtStart) {
        console.warn(`${MODULE_ID} | ${label}: the connection to the server dropped while the narration was generated — discarded.`);
        _discardedForDrop = true;
        return true;
      }
      // Nor can a narration started on a page whose connection had already
      // dropped: its cache may lack an X-Card played during the drop — a
      // player's page, which keeps narrating on the player's own key (the
      // Private Channel; a command or follow-up at a table with no keyed GM),
      // is not reloaded for it (STALE-PLAYER-PAGE).
      if (pageIsStale()) {
        console.warn(`${MODULE_ID} | ${label}: this page's connection to the server dropped earlier and it has not reloaded — discarded.`);
        _discardedForStale = true;
        return true;
      }
      if (!isXCardActive(campaignState) && xCardPlayCount() === playsAtStart) return false;
      console.debug(`${MODULE_ID} | ${label}: X-Card played while the narration was generated — discarded.`);
      return true;
    },
  };
}

/**
 * What a card says when the X-Card stopped a narration: paused while the
 * card is active, or discarded when it was played while the narration was
 * being written and a GM has resumed since (issue #306 R01).
 *
 * @param {Object|null} campaignState
 * @param {string} what  — "Narration" or "Answer"
 * @returns {string} HTML
 */
function xCardDiscardReason(campaignState, what) {
  if (isXCardActive(campaignState)) {
    return what === 'Narration'
      ? 'Narration paused — the X-Card is active. A GM can resume it from the X-Card card or with <code>!x clear</code>.'
      : 'Scene paused — X-Card is active.';
  }
  if (_discardedForDrop) {
    return `${what} discarded — this GM's connection to the server dropped while it was being written, so an X-Card played meanwhile could not be checked.`;
  }
  if (_discardedForStale) {
    return `${what} discarded — this browser's connection to the server dropped earlier, so an X-Card played meanwhile could not be checked. Reload it (F5).`;
  }
  return `${what} discarded — the X-Card was played while it was being written.`;
}

/** Whether the last narration a watch discarded was discarded for a dropped connection (xCardDiscardReason's wording). */
let _discardedForDrop = false;
/** Whether it was discarded because its page was already stale (STALE-PLAYER-PAGE). */
let _discardedForStale = false;

const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const RETRY_DELAY_MS = 5000;

// Extra tokens reserved for the fact-continuity sidecar JSON when it ships
// alongside narrator prose. Sized for the post-Cluster-A contract: required
// stateChanges (NPC location/condition, ~45–90 tokens on an active turn) +
// newTruths for intent/stakes (~20–60) + the sceneFrame snapshot (~50–75) +
// fence/key overhead (~25) — a heavy turn runs ~240–290 and the
// inciting-incident premise addendum can reach ~400. We budget 500 so the
// tightest call sites (@scene at base 200) cannot clip the sidecar even on a
// full-length answer. maxTokens is a cap, not a target — unused headroom
// costs nothing. A truncated sidecar is silently expensive now: the
// defensive strip in extractSidecar keeps the prose clean, but the turn
// loses its frame update and required emissions (watch for the
// "truncated by maxTokens" parseError warning in console).
const SIDECAR_TOKEN_HEADROOM = 500;

/**
 * Compute the maxTokens budget for a narrator API call, adding headroom
 * for the fact-continuity sidecar when the feature is enabled. Reads the
 * setting defensively (try/catch) so unit tests without registered
 * settings still get the headroom.
 */
function maxTokensWithSidecar(baseMaxTokens) {
  let fcEnabled = true;
  try {
    fcEnabled = globalThis.game?.settings?.get?.(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch {
    fcEnabled = true;
  }
  return fcEnabled ? (baseMaxTokens ?? 0) + SIDECAR_TOKEN_HEADROOM : baseMaxTokens;
}

// ---------------------------------------------------------------------------
// Unified narrator context assembly
// ---------------------------------------------------------------------------

/**
 * Build the shipboard-combat guidance block when a fight is active aboard the
 * command vehicle. Detects an open combat track + a command vehicle, then
 * delegates the inject/skip decision and the text to the pure battleStations
 * module. Fail-open: any failure returns '' so narration is never blocked.
 *
 * @param {Object} campaignState
 * @returns {Promise<string>}
 */
async function buildShipboardGuidanceBlock(campaignState) {
  try {
    const [{ getActiveCombatTrack }, { getCommandVehicleActor }, bs] = await Promise.all([
      import('../ui/progressTracks.js'),
      import('../moves/abilityScanner.js'),
      import('../moves/battleStations.js'),
    ]);
    const track    = await getActiveCombatTrack();
    const ship     = getCommandVehicleActor(campaignState);
    const shipName = ship?.name ?? null;
    if (!bs.shouldInjectShipboardGuidance(track, shipName)) return '';
    return bs.buildShipboardCombatGuidance({ shipName });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: shipboard guidance build failed:`, err?.message ?? err);
    return '';
  }
}

/**
 * The open tracks in the Progress Tracks journal (ui/progressTracks.js),
 * for [4j]. Fail-open: a read failure is no tracks, never a blocked narration.
 *
 * @returns {Promise<Object[]>}
 */
async function readOpenProgressTracks() {
  try {
    const { listOpenProgressTracks } = await import('../ui/progressTracks.js');
    return listOpenProgressTracks();
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: open progress tracks read failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * The vow this scene serves (issue #353 R3; session/openThreads.js
 * readSceneVow): an open track's linked vow, the session's quest focus, or
 * the only vow in play — over the extras' open tracks and focus. Fail-open:
 * null, never a blocked narration.
 *
 * @param {{ progressTracks?: Object[], sessionFocus?: Object|null }} extras
 * @returns {Promise<Object|null>}
 */
async function readSceneVowFor(extras) {
  try {
    const { readSceneVow } = await import('../session/openThreads.js');
    return readSceneVow({ tracks: extras?.progressTracks ?? [], focus: extras?.sessionFocus ?? null });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the vow this scene serves could not be read:`, err?.message ?? err);
    return null;
  }
}

/**
 * The narrator's system-prompt context is assembled in exactly ONE place: here.
 * Every narrator call site — move resolution, paced narrative, scene query,
 * oracle follow-up, session vignette, inciting incident, campaign recap —
 * builds its `extras` packet through this function, so new context added here
 * reaches every path at once. This is the single seam to extend going forward;
 * do not hand-assemble `extras` at a call site (that is the per-path drift this
 * unifies away — campaign truths used to reach only the move path, entity cards
 * only three paths, the party roster only three, and the recap none).
 *
 * Context EVERY path receives (the uniform packet):
 *   - current location card, active sector anchor, campaign-truths digest
 *   - multiplayer party roster, audio-markup flag, the mode + player text
 * The creative-latitude permission block is also uniform, but resolved one
 * level up in buildNarratorSystemPrompt: move_resolution's class is dynamic
 * (passed in via the relevance result below); every other mode falls back to a
 * per-mode default (DEFAULT_PERMISSION_CLASS_BY_MODE).
 *
 * Relevance (entity cards + matched IDs + name map) has just two rules:
 *   - move_resolution: derived from the FULL relevance result the caller
 *     already resolved (it owns the clarification-dialog control flow and the
 *     dynamic permission class); oracle seeds — which only a move produces —
 *     ride along here too.
 *   - every other mode: resolved here lexically (no API call) from the player
 *     text ∪ scene-frame present names. Modes with no player text (vignette /
 *     inciting / recap) match nothing and rely on the sector roster for cast.
 *
 * @param {string} mode               — narrator mode (see NARRATOR_MODES)
 * @param {Object} campaignState
 * @param {Object} [opts] — the four below, and actingActorIds, planRequests,
 *   endingTrackIds, planIds and beatClaim (see the body)
 * @param {string} [opts.playerNarration] — player text this turn (lexical relevance)
 * @param {Object|null} [opts.character]  — resolved active character (names the speaking PC for the roster)
 * @param {Object|null} [opts.relevance]  — pre-resolved FULL relevance result (move path only)
 * @param {Object|null} [opts.oracleSeeds]— oracle seeds (move path only)
 * @returns {Promise<Object>} the extras packet for buildNarratorSystemPrompt
 */
export async function buildNarratorExtras(mode, campaignState, opts = {}) {
  const {
    playerNarration = '',
    character       = null,
    relevance       = null,
    oracleSeeds     = null,
    actingActorIds  = null,
    planRequests    = [],
    endingTrackIds  = [],
    planIds         = [],
    beatClaim       = null,
  } = opts;

  // The scene's ledgers as they stand in the store (issue #325 W05; rules/
  // reachability.md §9): the move pipeline narrates from a snapshot taken
  // before its confirm dialog, and an X-Card played meanwhile has retracted
  // the removed beat's truths, removed its state and cleared its frame only
  // in the store — the snapshot handed them back as binding beside the
  // X-CARD — REDIRECT block. The frame's cast and lore read it too.
  const sceneLedger = liveSceneLedger(campaignState);
  const sceneState  = sceneLedger ? { ...(campaignState ?? {}), ...sceneLedger } : campaignState;

  // Context every narrator path receives.
  const extras = {
    mode,
    sceneLedger,
    // Lines, Veils and Private Lines, read live (issue #321 U08; rules/
    // reachability.md §9: a safety-critical flag is read at the point of
    // use): the move pipeline narrates from a snapshot taken before its
    // confirm dialog, and a Private Line added meanwhile is only in the store.
    safety: storedCampaignState()?.safety ?? campaignState?.safety ?? null,
    currentLocationCard: formatCurrentLocation(campaignState),
    activeSectorBlock:   formatActiveSector(campaignState),
    campaignTruthsBlock: await buildCampaignTruthsBlock(campaignState).catch(err => {
      console.warn(`${MODULE_ID} | narrator: campaignTruths build failed:`, err);
      return '';
    }),
    party:              buildPartyContext(character?.name ?? null, actingActorIds),
    audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    // Spotlight rotation (issue #232) — multiplayer turn-implication nudge.
    // Advances the per-scene pointer as a side effect; '' when not applicable.
    // The acting PC is never the one named next (issue #330 D8).
    spotlightBlock:     maybeAdvanceSpotlight(mode, campaignState, sceneState, character?.actorId ?? null),
    // The names the table changed (issue #377 item 1), from the store: told
    // wherever the old name still reaches the prompt (NAMES THE TABLE CHANGED).
    nameChanges:        storedCampaignState()?.nameChanges ?? campaignState?.nameChanges ?? [],
  };

  // What keeps this beat from reading like the last (issue #354 P2-22,
  // P2-27): the comparisons the session's last narrations made — listed as
  // images not to reuse — and a shape for this beat, by its place in the
  // session, so two in a row are never built the same way. The beat modes
  // only; rendered as [8d] THIS BEAT'S PROSE. A narration that posts the
  // beat's card hands its `beatClaim` (narrateWithBeatClaim): the shape is
  // its own while it is being written (issue #364 BEAT-SHAPE-SIMULTANEOUS).
  if (BEAT_VARIETY_MODES.has(mode)) Object.assign(extras, beatVariety(campaignState?.currentSessionId ?? null, beatClaim));

  // Rolling session summary (architecture §8.6) — the cached text. It is
  // regenerated after a narrator card posts (registerRollingSummaryRefreshHook),
  // not here: a regen is a Haiku call over the whole session's prose, and it
  // used to run inside the narration it delayed (issue #286 B7). Skipped for
  // campaign_recap, which is itself a summary.
  extras.rollingSummary = (mode === 'campaign_recap')
    ? ''
    : cachedRollingSessionSummary(campaignState);

  // Earlier sessions (issue #286 C3). The ring, the summary above and recent
  // oracles are all session-scoped, so a session used to start from one
  // campaign recap, on its first move narration per page load. Every prose
  // mode now gets the summary of the session before this one (LAST SESSION,
  // kept when this session was minted), and the session's first narration
  // gets the campaign recap.
  if (mode !== 'campaign_recap') {
    extras.previousSessionSummary = previousSessionSummaryFor(campaignState);
    extras.campaignRecap          = await sessionStartRecap(campaignState);
  }

  // Clocks and the session's focus (issue #286 C5) — in no prompt before.
  // Read from the store: a move narrates from a snapshot taken before its own
  // Pay the Price advanced a tension clock.
  if (mode !== 'campaign_recap') {
    const stored = storedCampaignState() ?? campaignState;
    extras.clocks       = Array.isArray(stored?.clocks) ? stored.clocks : [];
    extras.sessionFocus = (stored?.sessionFocus?.sessionId && stored.sessionFocus.sessionId === campaignState?.currentSessionId)
      ? stored.sessionFocus
      : null;
  }

  // Open fights, expeditions and scene challenges (TRACKS-UNPORTED, issue
  // #290): each fight's objective, position and the vow it serves. Only the
  // retired context assembler ever rendered them, so no narration saw an open
  // fight; vows and bonds reach the CHARACTER block from the sheet.
  extras.progressTracks = (mode === 'campaign_recap') ? [] : await readOpenProgressTracks();

  // The vow this scene serves (issue #353 R3): a linked track's vow, the
  // session's quest focus, or the only vow in play, with its progress — the
  // line at the top of the per-beat context ([2.6]). Read here, after the
  // tracks and the focus it is chosen from.
  extras.sceneVow = (mode === 'campaign_recap') ? null : await readSceneVowFor(extras);

  // Each PC's pinned Chronicle entries, for its CHARACTER block (issue #345
  // AA07). The Chronicle panel's 📌 promises "pinned entries always appear in
  // the narrator's context", and the pin was saved onto a flag nothing read:
  // the context assembler's chronicle reader went with the 2026-10 dead-
  // surface audit. Read for every PC, so a round's or the galley's blocks
  // carry theirs too; the recap reads the whole chronicle itself.
  extras.pinnedChronicle = (mode === 'campaign_recap') ? {} : await readPinnedChronicle(character);

  // Recent oracle results (narrator-context audit 2026-07) — the raw
  // `!oracle` / `!pay-the-price` outcomes for this session, so the narrator
  // never contradicts a roll the table just made. Rendered as [3b]; the
  // prompt builder skips it for meta modes. Read from the store (issue #321
  // U08): an oracle a table-mate asked while a move sat at its confirm dialog
  // is only there.
  extras.recentOracles = readRecentOracleResults(storedCampaignState() ?? campaignState);

  // The X-Card's redirect (issue #321 U07): pending from the play until the
  // first narration after a GM resumes has posted (registerXCardRedirectHook
  // clears it). Read from the store — the X-Card is played mid-pipeline.
  extras.xCardRedirect = mode !== 'campaign_recap'
    && xCardRedirectPending(storedCampaignState() ?? campaignState);

  // World Journal state (FACTION-PACKET-DEAD fix, 2026-07): active threats,
  // the faction landscape, and recent confirmed lore used to ride the
  // assembler context packet — which was passed to narrateResolution and
  // never read, so the narrator had NEVER seen a faction attitude or WJ
  // threat. They now flow through this seam like everything else, bounded
  // and gated on the existing WJ per-section settings. Fail-open: any read
  // failure yields an empty block, never a blocked narration.
  extras.activeThreats    = wjSectionEnabled('threatsInContext')
    ? safeWjRead(() => getActiveThreats(campaignState).slice(0, 4), 'threats')
    : [];
  // The most recently updated factions, records and World Journal ranked
  // together (issue #342 Z13 — in creation order the first four records held
  // the block for good).
  extras.factionLandscape = wjSectionEnabled('factionLandscapeInContext')
    ? safeWjRead(() => mergeFactionLandscape(
        listFactions(campaignState),
        getFactionLandscape(campaignState, { limit: Infinity }),
      ), 'factions')
    : [];

  // World-lore recap (LORERECAP-INJECT-ORPHANED fix, 2026-07): `!lore`
  // persists its narrator recap to campaignState.loreRecap "for context
  // injection", but the only injector was the retired assembler packet — the
  // narrator silently stopped receiving it. It now rides this seam, gated
  // with the other lore surfacing. Plain property read; cannot throw.
  extras.loreRecap        = wjSectionEnabled('loreInContext')
    ? String(campaignState?.loreRecap ?? '').trim()
    : '';

  // Shipboard combat (Battle Stations!) — when a fight is active aboard the
  // crew's command vehicle, hand the narrator the canonical shipboard-combat
  // framing (11 crew roles, per-character position, Aid Your Ally hands off
  // control). Additive guidance; does not affect the entity-permission class.
  // Fail-open, and skipped for campaign_recap (a summary, not a live scene).
  extras.shipboardGuidance = (mode === 'campaign_recap')
    ? ''
    : await buildShipboardGuidanceBlock(campaignState);

  if (mode === 'move_resolution') {
    // The move pipeline resolves relevance itself (clarification dialog +
    // dynamic permission class) and hands the result in; oracle seeds (which
    // only a move resolution produces) ride along here too.
    if (relevance) {
      extras.narratorClass      = relevance.resolvedClass;
      extras.entityCards        = collectEntityCards(relevance.entityIds, relevance.entityTypes);
      extras.matchedEntityIds   = relevance.entityIds ?? [];
      extras.matchedEntityTypes = relevance.entityTypes ?? [];
      extras.entityNamesById    = collectEntityNamesById(relevance.entityIds, relevance.entityTypes);
    }
    extras.oracleSeeds = oracleSeeds;
  } else if (mode === 'round_resolution') {
    // A Batch Mode round (issue #340): each move entry resolved its own
    // relevance when it rolled (the GM's clarification dialog included), and
    // narrateRound hands in their union at the widest class. The entries'
    // text, joined, is matched lexically too (no API call) and unioned in.
    // Each entry keeps its oracle seeds in the user message, not here.
    const lexical = await resolvePathRelevance(playerNarration, sceneState);
    const ids   = [...(relevance?.entityIds ?? [])];
    const types = [...(relevance?.entityTypes ?? [])];
    lexical.entityIds.forEach((id, i) => {
      if (ids.includes(id)) return;
      ids.push(id);
      types.push(lexical.entityTypes?.[i]);
    });
    extras.narratorClass      = relevance?.resolvedClass ?? null;
    extras.entityCards        = collectEntityCards(ids, types);
    extras.matchedEntityIds   = ids;
    extras.matchedEntityTypes = types;
    extras.entityNamesById    = collectEntityNamesById(ids, types);
  } else {
    // One uniform rule for every non-move mode: resolve relevance lexically
    // (no API cost). Modes with no player text (vignette / inciting / recap)
    // naturally match nothing and get no entity cards — the active-sector
    // roster carries their cast — so this stays a single rule, not per-mode
    // special-casing. The permission class for these modes is supplied by
    // buildNarratorSystemPrompt's per-mode default, not here.
    const lexical = await resolvePathRelevance(playerNarration, sceneState);
    extras.entityCards        = lexical.entityCards;
    extras.matchedEntityIds   = lexical.entityIds;
    extras.matchedEntityTypes = lexical.entityTypes;
    extras.entityNamesById    = lexical.entityNamesById;
  }

  addSceneFrameCast(extras, sceneState);

  // The narrative skeleton (issue #353): the hidden plans whose subject is in
  // play this beat — made in this scene, its entity matched or in the frame's
  // cast, its name in the frame or the player's line — and the plans this
  // narration must decide (a price that revealed a new enemy). Rendered as
  // [6.6] UNREVEALED. Fail-open: an unreadable journal is no plans. A
  // narration on a player's own key reads none — a player's client reads no
  // plan (issue #362 D1), as it is sent no world snapshot — and still files
  // the plans its own rolls ask it to decide (DECIDE NOW, relayed).
  extras.unrevealed   = [];
  extras.planRequests = [];
  extras.decideNowRequests = [];
  extras.plannedSubjects = [];
  // The vows this beat's move fulfils: UNREVEALED tells their plan's truth
  // now (formatUnrevealedBlock THIS BEAT ENDS A VOW).
  extras.endingTrackIds = Array.isArray(endingTrackIds) ? endingTrackIds : [];
  if (mode !== 'campaign_recap' && skeletonsEnabled()) {
    try {
      const allPlans = listSkeletons();
      // The beings already planned, for a narration that has an enemy or an
      // agenda to decide: it may say the new one is one of them (issue #354
      // P2-30; formatUnrevealedBlock ALREADY PLANNED).
      extras.plannedSubjects = plannedBeings(allPlans);
      // A beat that ends a track or a vow sees its plan, resolved in code as
      // the subject ended, to reveal its end (issue #362 D4; planInPlay).
      extras.unrevealed = selectRelevantSkeletons(endingTrackIds.length ? listSkeletons({ includeInactive: true }) : allPlans, {
        sceneId:           sceneState?.currentSceneId ?? null,
        frame:             sceneState?.sceneFrame ?? null,
        matchedEntityIds:  extras.matchedEntityIds ?? [],
        text:              playerNarration,
        activeThreatNames: immediateThreatNames(campaignState),
        // An open expedition's plan is in play while it runs, and a finished
        // one's in the narration that finishes it (Phase 3).
        openTrackIds:      (extras.progressTracks ?? []).map(t => t?.id).filter(Boolean),
        endingTrackIds,
        // The plans this beat is about whatever its text: a clock vignette's,
        // a chosen complication's.
        planIds,
        // A vow's plan is in play while its vow is the one this scene serves
        // (Phase 4, by R3's ladder: a linked track's vow, the quest focus, the
        // only vow in play) — by the vow's id across its copies, or its name.
        sceneVow:          extras.sceneVow?.vow
          ? { id: extras.sceneVow.vow.key ?? null, name: extras.sceneVow.vow.name ?? '' }
          : null,
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: the hidden plans could not be read:`, err?.message ?? err);
    }
    // Each plan this narration must decide gets its one re-roll (issue
    // #353 "one re-roll"): offered under DECIDE NOW, kept with the request.
    // Every request rides with the narration (`planRequests` — what its
    // side-data files): it is asked to decide the first PLANS_PER_SIDECAR,
    // all one sidecar answers (`decideNowRequests` — what DECIDE NOW lists),
    // and the rest — a Batch Mode round's entries can bring more — are filed
    // with their rolls alone by the same apply (issue #364
    // ROUND-PLAN-REQUEST-CAP: the fifth onward was dropped here, unfiled).
    extras.planRequests = await Promise.all(normalisePlanRequests(planRequests, { max: PLAN_REQUESTS_PER_NARRATION })
      .map(async q => (q.reroll ? q : { ...q, reroll: await rollReroll() })));
    extras.decideNowRequests = extras.planRequests.slice(0, PLANS_PER_SIDECAR);
  }

  // Established lore, picked for what this turn is about (issue #286 C2):
  // the player's text, the scene frame and the entities now in play. It was
  // the five most recently updated entries. Place details the detection pass
  // recorded for unrecorded places (the Locations journal) are in the pool.
  extras.confirmedLore = wjSectionEnabled('loreInContext')
    ? safeWjRead(() => selectLoreForContext(
        [...getConfirmedLore(campaignState), ...getRecordedLocations(campaignState)]
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))),
        loreQueryText(playerNarration, sceneState, extras),
      ), 'lore')
    : [];

  // The world snapshot (issue #357): the whole world state as it stood when
  // the snapshot was taken, stored and sent unchanged so the request reads
  // it from the prompt cache — with what changed since, and what this
  // narration involves (IN PLAY NOW). Gathered last: it names what the
  // relevance and the plan selection above matched. Null on a player's own
  // key, with the switch off, or when it cannot be read; the prompt is then
  // built from the per-beat sections above, as before the snapshot.
  extras.worldSnapshot = null;
  extras.inPlay        = null;
  if (mode !== 'campaign_recap') {
    const snapshot = await resolveWorldSnapshot(campaignState, {
      // The world as the store has it: a move narrates from a snapshot of
      // campaignState taken before its confirm dialog.
      world:           storedCampaignState() ?? campaignState,
      progressTracks:  extras.progressTracks ?? [],
      summaries:       rollingSummaryEnabled(),
      include: {
        threats:  wjSectionEnabled('threatsInContext'),
        factions: wjSectionEnabled('factionLandscapeInContext'),
        lore:     wjSectionEnabled('loreInContext'),
      },
      lastNarrationAt: lastNarratorCardAt(campaignState?.currentSessionId ?? null),
      cacheTtlMs:      NARRATOR_CACHE_TTL_MS,
    });
    if (snapshot) {
      extras.worldSnapshot = { text: snapshot.text, changesText: snapshot.changesText };
      extras.inPlay        = inPlayFor(extras, campaignState, snapshot.units);
    }
  }

  return extras;
}

/** How many threats IN PLAY NOW names — the most urgent, as ACTIVE THREATS listed. */
const IN_PLAY_THREATS = 4;

/**
 * What a narration with a world snapshot names as in play (issue #357;
 * narratorPrompt.js formatInPlayBlock): the active sector and the current
 * location, the entities relevance and the scene frame's cast matched, the
 * most urgent threats — and, for what the snapshot holds no record of (an
 * uncharted site the player's line names), the card itself, as before.
 *
 * @param {Object} extras — the packet so far (its matched set, cards and plans)
 * @param {Object} campaignState
 * @param {Object[]} units — the world's snapshot units as they stand now
 * @returns {Object}
 */
function inPlayFor(extras, campaignState, units) {
  const byKey = new Map((Array.isArray(units) ? units : []).map(u => [u.key, u]));
  const ids   = extras.matchedEntityIds ?? [];
  const types = extras.matchedEntityTypes ?? [];
  const names = extras.entityNamesById instanceof Map ? extras.entityNamesById : new Map();
  const entities = [];
  const uncoveredIds = [];
  const uncoveredTypes = [];
  ids.forEach((id, i) => {
    const held = byKey.get(entityUnitKey(id));
    if (held) entities.push({ id, type: types[i], name: names.get(id) ?? held.label ?? '' });
    else {
      uncoveredIds.push(id);
      uncoveredTypes.push(types[i]);
    }
  });
  const sector     = (campaignState?.sectors ?? []).find(s => s?.id && s.id === campaignState?.activeSectorId) ?? null;
  const locationId = campaignState?.currentLocationId ?? null;
  const location   = currentLocationName(campaignState);
  const urgency    = { immediate: 0, active: 1, looming: 2 };
  const threats = (Array.isArray(units) ? units : []).filter(u => u.section === 'threats')
    .sort((a, b) => ((urgency[a.severity] ?? 9) - (urgency[b.severity] ?? 9))
      || String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, IN_PLAY_THREATS)
    .map(u => ({ id: u.pageId, name: u.label, severity: u.severity }));
  return {
    activeSector:        sector ? { id: sector.id, name: sector.name } : null,
    currentLocation:     location ? { id: locationId, name: location } : null,
    entities,
    threats,
    uncoveredCards:      collectEntityCards(uncoveredIds, uncoveredTypes),
    currentLocationCard: locationId && byKey.has(entityUnitKey(locationId)) ? '' : (extras.currentLocationCard ?? ''),
    coveredPlanIds:      (extras.unrevealed ?? []).map(r => r?.id).filter(id => id && byKey.has(planUnitKey(id))),
  };
}

/** When the session's newest narrator card posted (ms) — the last narrator call the chat log shows — or null. */
function lastNarratorCardAt(sessionId) {
  try {
    const cards = sessionNarratorCards(sessionId);
    return cards.length ? messageTime(cards[cards.length - 1]) : null;
  } catch {
    return null;
  }
}

/** The modes whose beats get a shape and the list of images already used (narratorPrompt.js BEAT_PROSE_MODES). */
const BEAT_VARIETY_MODES = new Set(['move_resolution', 'paced_narrative', 'round_resolution']);

/**
 * Whether a chat message is a beat's own card — a move's narration, a paced
 * line's, a round's (BEAT_VARIETY_MODES' cards: `narrationCard`,
 * `pacedNarrative`, `roundId`) — of this session. Never an @scene answer, an
 * oracle follow-up, a vignette, a vow scene or a published reflection.
 *
 * @param {Object} m — a ChatMessage
 * @param {string|null} sessionId
 * @returns {boolean}
 */
function isSessionBeatCard(m, sessionId) {
  const f = m?.flags?.[MODULE_ID];
  if (!f?.narratorCard || f.sessionId !== sessionId) return false;
  return f.narrationCard === true || f.pacedNarrative === true || (typeof f.roundId === 'string' && f.roundId !== '');
}

/** A beat card's `beatShape` flag — the id of the shape its narration was written in — or nothing when none was picked. */
function beatShapeFlag(shapeId) {
  return typeof shapeId === 'string' && shapeId ? { beatShape: shapeId } : {};
}

/**
 * The shape the session's newest written beat was given — its card's
 * `beatShape` stamp (postNarrationCard, postRoundNarrationCard,
 * postPacedNarrativeCard) — or null when no card of the session carries one.
 * Read from the chat as it was (chatAsItWas): a beat whose card a GM deleted,
 * or a Clear Chat Log took, is still the beat before the next one. A struck
 * or X-Carded narration was written in its shape and counts; a "narration
 * unavailable" card carries no stamp — nothing was written in the shape
 * picked for it.
 *
 * @param {string|null} sessionId
 * @returns {string|null} a BEAT_SHAPES id
 */
function lastBeatShapeId(sessionId) {
  const chat = chatAsItWas();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const f = chat[i]?.flags?.[MODULE_ID];
    if (f?.narratorCard && f.sessionId === sessionId && typeof f.beatShape === 'string' && f.beatShape) return f.beatShape;
  }
  return null;
}

// ── The shapes being written right now (issue #364 BEAT-SHAPE-SIMULTANEOUS) ──
// A beat's shape is read off the newest written beat's card, and a card is
// posted only once its narration is written — so two beats narrated at the
// same moment (two players' lines, a move beside a paced line, a round
// beside either) both read the same last card and were given the same shape.
// A beat's narration claims its shape when it picks it, for as long as it is
// being written, and a beat picked meanwhile steps past the claimed ones.
//
// In memory, this client's own narrations only, and never a second store of
// "the last shape" (decisions.md → "Issue #364", the beat-shape bullet): a
// claim says a shape is being written now, and is gone when its narration
// ends — written, failed or thrown (narrateWithBeatClaim's `finally`). With
// nothing being written the set is empty and the next shape is read from the
// cards alone. A reload ends every narration and every claim with it.
const liveBeatClaims = new Set();   // of { sessionId, shapeId }

/**
 * Run one beat's narration with a claim on its shape, released when the
 * narration ends however it ends. The three narrations that post a beat's
 * card (narrateResolution, narrateRound, narratePacedInput) call themselves
 * through this once: each makes its own Claude call — the playthrough
 * harness names a call by the function that makes it — so its body cannot
 * move into a helper that would hold the `finally`.
 *
 * @template T
 * @param {(claim: { sessionId: string|null, shapeId: string|null }) => Promise<T>} narrate
 * @returns {Promise<T>}
 */
async function narrateWithBeatClaim(narrate) {
  const claim = { sessionId: null, shapeId: null };
  try {
    return await narrate(claim);
  } finally {
    liveBeatClaims.delete(claim);
  }
}

/**
 * `shape`, or the first shape after it in the cycle that no narration of the
 * session is being written in right now. With every shape claimed — five
 * narrations at once — `shape` itself.
 *
 * @param {{ id: string, hint: string }} shape
 * @param {string|null} sessionId
 * @returns {{ id: string, hint: string }}
 */
function shapeNotBeingWritten(shape, sessionId) {
  const claimed = new Set([...liveBeatClaims].filter(c => c.sessionId === sessionId).map(c => c.shapeId));
  let free = shape;
  for (let step = 1; step < BEAT_SHAPES.length && free && claimed.has(free.id); step += 1) free = beatShapeAfter(free.id);
  return free && !claimed.has(free.id) ? free : shape;
}

/**
 * The images the session's last narrations used and the shape for the beat
 * about to be written (issue #354 P2-22, P2-27; proseVariety.js) — read from
 * the session's narrator cards, the ring's own source. The shape is the one
 * after the newest written beat's, which its card carries (`beatShape`,
 * lastBeatShapeId): the count of the session's beat cards alone gave the next
 * beat the shape of the one before it once a GM deleted an earlier beat's
 * card, and could after a Clear Chat Log (issue #364
 * BEAT-SHAPE-AFTER-DELETED-CARD). A session with no stamped card — its first
 * beat, or beats written before the cards carried one — is shaped by how many
 * beat cards it holds, a struck, X-Carded or unnarrated one included: counted
 * over all its narrator cards, four @scene answers, oracle follow-ups or
 * vignettes between two beats brought the five-shape cycle back round to the
 * same shape, and a card a Burn / Improve struck took the count back one
 * (issue #362 AC72). A shape another narration of the session is being
 * written in at this moment is stepped past, and the shape picked is claimed
 * for `claim`'s narration (issue #364 BEAT-SHAPE-SIMULTANEOUS; liveBeatClaims).
 * Fail-open: an unreadable chat log gives no list and the first shape.
 *
 * @param {string|null} sessionId
 * @param {{ sessionId: string|null, shapeId: string|null }|null} [claim] — the
 *   narration's claim (narrateWithBeatClaim); none claims nothing
 * @returns {{ usedImages: string[], beatShape: { id: string, hint: string } }}
 */
function beatVariety(sessionId, claim = null) {
  let variety;
  try {
    const cards = sessionNarratorCards(sessionId);
    const prose = cards.slice(-IMAGE_SOURCE_CARDS)
      .map(m => m?.flags?.[MODULE_ID]?.narrationText)
      .filter(t => typeof t === 'string' && t.trim());
    const beats = (game.messages?.contents ?? []).filter(m => isSessionBeatCard(m, sessionId)).length;
    variety = {
      usedImages: recentImages(prose),
      beatShape:  beatShapeAfter(lastBeatShapeId(sessionId)) ?? pickBeatShape({ beatIndex: beats, seed: sessionId }),
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the recent narrations could not be read for this beat's shape and images:`, err?.message ?? err);
    variety = { usedImages: [], beatShape: pickBeatShape({ beatIndex: 0, seed: sessionId }) };
  }
  variety.beatShape = shapeNotBeingWritten(variety.beatShape, sessionId);
  if (claim) {
    claim.sessionId = sessionId;
    claim.shapeId   = variety.beatShape.id;
    liveBeatClaims.add(claim);
  }
  return variety;
}

/** The World Journal's immediate threats, by name — their plans are in play every beat (issue #353). Fail-open. */
function immediateThreatNames(campaignState) {
  try {
    return getActiveThreats(campaignState).filter(t => t?.severity === 'immediate').map(t => t.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** How many pinned Chronicle entries a CHARACTER block carries (the newest), and how long each may run. */
const PINNED_CHRONICLE_ENTRIES = 5;
const PINNED_CHRONICLE_CHARS   = 300;

/**
 * Every PC's pinned Chronicle entries (issue #345 AA07) — actorId → texts,
 * oldest first: the newest PINNED_CHRONICLE_ENTRIES of each, each on one
 * line, clipped. `character` (the narration's PC) is read too should it not
 * be in the roster. Fail-open: a chronicle that cannot be read gives none.
 *
 * @param {Object|null} [character] — getActiveCharacter's snapshot
 * @returns {Promise<Object<string, string[]>>}
 */
async function readPinnedChronicle(character = null) {
  const ids = new Set();
  try {
    for (const actor of getPlayerActors() ?? []) if (actor?.id) ids.add(actor.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: listing the PCs for their pinned Chronicle entries failed:`, err?.message ?? err);
  }
  if (character?.actorId) ids.add(character.actorId);
  const pinned = {};
  for (const actorId of ids) {
    const texts = await readPinnedEntriesOf(actorId);
    if (texts.length) pinned[actorId] = texts;
  }
  return pinned;
}

/**
 * One PC's pinned Chronicle entries: the newest PINNED_CHRONICLE_ENTRIES,
 * oldest first, each on one line, clipped. Fail-open: none.
 *
 * @param {string} actorId
 * @returns {Promise<string[]>}
 */
async function readPinnedEntriesOf(actorId) {
  try {
    return ((await getChronicleEntries(actorId)) ?? [])
      .filter(e => e?.pinned === true && typeof e.text === 'string' && e.text.trim())
      .slice(-PINNED_CHRONICLE_ENTRIES)
      .map(e => {
        const text = e.text.replace(/\s+/g, ' ').trim();
        return text.length > PINNED_CHRONICLE_CHARS ? `${text.slice(0, PINNED_CHRONICLE_CHARS - 1)}…` : text;
      });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: reading ${actorId}'s pinned Chronicle entries failed:`, err?.message ?? err);
    return [];
  }
}

/** The stored campaignState, or null when it cannot be read. */
function storedCampaignState() {
  try { return game.settings.get(MODULE_ID, 'campaignState') ?? null; }
  catch { return null; }
}

/**
 * The scene-ledger fields (narratorPrompt.js SCENE_LEDGER_FIELDS) from the
 * store, for a narration built from an older snapshot — null when the store
 * cannot be read or holds another world's session than the snapshot's (a
 * narration built for a session that has since ended keeps its own).
 *
 * @param {Object|null} campaignState — the caller's snapshot
 * @returns {Object|null}
 */
function liveSceneLedger(campaignState) {
  const stored = storedCampaignState();
  if (!stored || typeof stored !== 'object') return null;
  if (campaignState?.currentSessionId && stored.currentSessionId !== campaignState.currentSessionId) return null;
  const out = {};
  for (const field of SCENE_LEDGER_FIELDS) out[field] = stored[field] ?? null;
  return out;
}

/**
 * What a narration's consistency check audits its prose against (issue #329
 * X02): the scene ledgers as the sidecar persist leaves them in the store —
 * the latest stored ledgers with this narration's own entries merged in by
 * the persist's own policy (mergeSceneLedgers: a truth the X-Card or a
 * `!truth strike` retracted meanwhile stays retracted, what an X-carded
 * narration wrote is dropped, a store on another scene wins) — and the
 * session's strikes as stored. The caller's object may be the move
 * pipeline's pre-dialog snapshot: W05 made the narration's prompt read the
 * live ledgers, and the audit kept the snapshot, so an X-carded beat was its
 * binding truth and a struck fact was not under RETRACTED FACTS. The caller's
 * own object when it is the store, or a narration built for a session that
 * has since ended (liveSceneLedger's rule).
 *
 * @param {Object} campaignState — the caller's object, the sidecar applied to it
 * @returns {Object} a new object (never the store's), or campaignState itself
 */
function auditCampaignState(campaignState) {
  const latest = storedCampaignState();
  if (!latest || typeof latest !== 'object' || latest === campaignState) return campaignState;
  if (campaignState?.currentSessionId && latest.currentSessionId !== campaignState.currentSessionId) return campaignState;
  const ledgers = {};
  for (const key of ['currentSceneId', 'sceneTruths', 'sceneState', 'sceneFrame']) {
    if (Object.prototype.hasOwnProperty.call(campaignState, key)) ledgers[key] = campaignState[key];
  }
  mergeSceneLedgers(ledgers, latest);
  return { ...campaignState, ...ledgers, sessionRetractions: latest.sessionRetractions ?? null };
}

/**
 * The summary of the session before this one — LAST SESSION, read from the
 * session record (lifecycle.js lastSessionToTell, issue #382) — as
 * `{ text, sessionNumber, isLast }`: `isLast` false when the session it
 * names is not the one just before this. Null when there is none (a stale
 * summary is not told until it is made again), or when the session summary
 * is turned off.
 */
function previousSessionSummaryFor(campaignState) {
  if (!rollingSummaryEnabled()) return null;
  const prev = lastSessionToTell(campaignState);
  if (typeof prev?.text !== 'string' || !prev.text.trim()) return null;
  if (prev.sessionId && prev.sessionId === campaignState?.currentSessionId) return null;
  const number  = Number.isFinite(prev.sessionNumber) ? prev.sessionNumber : null;
  const current = Number(campaignState?.sessionNumber);
  return {
    text:          prev.text.trim(),
    sessionNumber: number,
    isLast:        number === null || !Number.isFinite(current) || number === current - 1,
  };
}

/**
 * The campaign recap for the session's first narration, in any prose mode —
 * no narrator card of this session exists yet — else ''. It came only with
 * the first move narration per page load, after a fresh Claude call whenever
 * the chronicle had grown (issue #286 C3). It is read from the cache, which
 * End a Session and a new session's world load refresh; generated here only
 * when no current one exists, and only on a GM — the client that keeps it.
 *
 * Only a recap of the chronicle as it stands now is used (issue #301 B04):
 * this read used no validity check at all, so a recap made before an entry
 * was corrected opened every session with the uncorrected story — and at a
 * table whose GM has no key, where nothing regenerates it, indefinitely.
 *
 * A reflection a player published from the Private Channel is canon, in the
 * ring and the summary, but not a narration — the X-Card redirect hook's
 * rule: published before the session's first narration, it took that
 * narration's recap (issue #345 AA32).
 *
 * It is the session-start recap (`sessionStart`, record/recapView.js
 * recapSource): the session under way is left out of its source, so the last
 * session before it is given in full. Read with the session under way in it,
 * that session's own first beats — Begin's vow, a clock, a momentum — were
 * "the latest session, in full", and the session just played was cut to its
 * turning points: the lines of play that set up a sister's compass or a
 * promise made at the dock were told to no session's opening. End a Session's
 * recap (made while the session it ends is under way) is the same source,
 * so its cache opens the next session when nothing else has changed.
 */
async function sessionStartRecap(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return '';
  try {
    // …nor is an `@scene` answer (known-issues SCENE-ANSWER-NOT-A-CAMERA): a
    // question asked before the session's first beat took that beat's recap.
    if (sessionNarratorCards(sessionId).some(m => !m.flags?.[MODULE_ID]?.publishedReflection && !m.flags?.[MODULE_ID]?.sceneResponse)) return '';
  } catch {
    return '';
  }
  let stored = null;
  try { stored = game.settings.get(MODULE_ID, 'campaignState')?.campaignRecapCache ?? null; }
  catch { stored = null; }
  const key = await campaignRecapCacheKey(campaignState, { sessionStart: true });
  // A session's start is told what came before it. A campaign's first session
  // has nothing before it: its own first beats — the vow sworn in Begin — are
  // no "previously" (known-issues RECAP-AT-THE-FIRST-BEGIN: since the recap
  // became a view of the record, they made one, and the first narration was
  // given a recap of the session it opened). A session numbered past the
  // first had one before it, whatever the record still holds of it.
  if (!key.before && !(Number(campaignState?.sessionNumber) > 1)) return '';
  for (const cache of [stored, campaignState?.campaignRecapCache]) {
    if (isRecapCacheCurrent(cache, key)) return cache.text;
  }
  if (!game.user?.isGM) return '';
  return getCampaignRecap(campaignState, { sessionStart: true }).catch(() => '');
}

/**
 * The shared story a Private Channel turn reads (issue #286 D1, #287) — what
 * the main narrator knows, so a private aside can't contradict the table:
 * `canon` (world truths, the campaign premise) for its cached prefix, and
 * `scene` (last and this session's summaries, the cards of the recorded
 * entities the player's message or the scene frame names, the scene ledger).
 * Relevance is lexical, as on every non-move path: no API call and no side
 * effects (no spotlight advance, no recap generation). With `actorId`, also
 * `pinned` — that PC's pinned Chronicle entries, as its CHARACTER block on the
 * main path carries them (issue #345 AA07; the Private Channel builds its
 * block outside the shared assembly and saw none — PRIVATE-CHANNEL-NO-PINS).
 *
 * @param {Object} campaignState
 * @param {string} playerMessage
 * @param {{ actorId?: string|null }} [opts] — the player's own PC
 * @returns {Promise<{ canon: string, scene: string, pinned: string[] }>}
 */
export async function buildPrivateChannelStory(campaignState, playerMessage, { actorId = null } = {}) {
  const lexical = await resolvePathRelevance(playerMessage, campaignState);
  const extras = {
    entityCards:            lexical.entityCards,
    matchedEntityIds:       lexical.entityIds,
    matchedEntityTypes:     lexical.entityTypes,
    entityNamesById:        lexical.entityNamesById,
    rollingSummary:         cachedRollingSessionSummary(campaignState),
    previousSessionSummary: previousSessionSummaryFor(campaignState),
  };
  addSceneFrameCast(extras, campaignState);
  // The hidden plans relevant to what the player asks, under the main
  // narrator's rule (issue #353, decided: the Private Channel reads them).
  // A player's client reads no plan (issue #362 D1): it asks the canonical
  // GM for the decided ones this message brings into play — none with no GM
  // connected, or no answer in time.
  extras.unrevealed = [];
  if (skeletonsEnabled()) {
    try {
      extras.unrevealed = globalThis.game?.user?.isGM === true
        ? selectRelevantSkeletons(listSkeletons(), {
          sceneId:          campaignState?.currentSceneId ?? null,
          frame:            campaignState?.sceneFrame ?? null,
          matchedEntityIds: extras.matchedEntityIds ?? [],
          text:             playerMessage,
        })
        : await requestPlansInPlay({ text: playerMessage, matchedEntityIds: extras.matchedEntityIds ?? [] });
    } catch (err) {
      console.warn(`${MODULE_ID} | privateChannel: the hidden plans could not be read:`, err?.message ?? err);
    }
  }
  const sections = buildSharedStorySections(campaignState, getNarratorSettings(), extras);
  const pinned = actorId ? await readPinnedEntriesOf(actorId) : [];
  return { ...sections, pinned };
}

/** What this turn is about, as text for lore selection: player text, scene frame, entity names, current location. */
function loreQueryText(playerNarration, campaignState, extras) {
  const frame = campaignState?.sceneFrame ?? {};
  const names = extras.entityNamesById instanceof Map ? [...extras.entityNamesById.values()] : [];
  return [
    playerNarration,
    frame.location,
    ...(Array.isArray(frame.present) ? frame.present : []),
    frame.situation,
    ...names,
    currentLocationName(campaignState),
  ].filter(v => typeof v === 'string' && v.trim()).join(' \n ');
}

/**
 * Add the recorded entities the scene frame lists as present to the matched
 * set — their cards, and so their entity-keyed truths and state — on every
 * path (issue #286 B3: on a move turn that named nobody, "I convince him" lost
 * the partner's card and every fact about him). Present names resolve
 * through resolveEntityName, so "Captain Vance" in the frame finds Vance.
 *
 * This extends the matched set only. A move's permission class was resolved
 * already, from the player's text alone (architecture §8.2), and its tier pass
 * still follows that resolution. Gated with the frame's other effects on
 * `factContinuity.sceneFrame`. Fail-open: any failure leaves extras as built.
 *
 * @param {Object} extras — mutated
 * @param {Object} campaignState
 */
function addSceneFrameCast(extras, campaignState) {
  try {
    if (!sceneFrameEnabledFromSettings()) return;
    const present = Array.isArray(campaignState?.sceneFrame?.present)
      ? campaignState.sceneFrame.present.filter(p => typeof p === 'string' && p.trim())
      : [];
    if (!present.length) return;

    const roster    = collectAllEntities(campaignState);
    const dismissed = campaignState?.dismissedEntities ?? [];
    const ids   = [...(extras.matchedEntityIds ?? [])];
    const types = [...(extras.matchedEntityTypes ?? [])];
    const addedIds = [];
    const addedTypes = [];
    for (const name of present) {
      const hit = resolveEntityName(name, roster, dismissed);
      const id  = hit?.journalId ?? hit?._id;
      if (!id || ids.includes(id)) continue;
      ids.push(id);
      types.push(hit.entityType);
      addedIds.push(id);
      addedTypes.push(hit.entityType);
    }
    if (!addedIds.length) return;

    extras.matchedEntityIds   = ids;
    extras.matchedEntityTypes = types;
    extras.entityCards        = [...(extras.entityCards ?? []), ...collectEntityCards(addedIds, addedTypes)];
    const names = extras.entityNamesById instanceof Map ? extras.entityNamesById : new Map();
    for (const [id, name] of collectEntityNamesById(addedIds, addedTypes)) names.set(id, name);
    extras.entityNamesById = names;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: scene-frame cast resolution failed:`, err?.message ?? err);
  }
}

/** `factContinuity.sceneFrame` (default on; unregistered in unit tests → on). */
function sceneFrameEnabledFromSettings() {
  try {
    return game.settings.get(MODULE_ID, 'factContinuity.sceneFrame') !== false;
  } catch {
    return true;
  }
}

/** Seed lines a price adds to a move's seeds (resolver.js priceSeedLines): the price, a new enemy's rolls, the momentum note. */
const PRICE_SEED_LINE = /^(?:Pay the Price: |The new enemy — |This price is paid in momentum)/;

/**
 * Tell the world snapshot's rules what a move's narration just told (issue
 * #357; snapshotEvents.js decides which of these takes a new snapshot):
 * Make a Discovery or Confront Chaos, a price that revealed a new enemy —
 * and the rolls that do not count, a routine "envision" seed and a price
 * that reveals no one. Reported once the narration is written and posted, so
 * the snapshot the next narrator call takes holds what this one established;
 * reported at the roll, the move's own narration would take it, without.
 *
 * @param {string|null} moveId
 * @param {{ results?: string[] }|null} seeds — the move's oracle seeds
 */
function reportNarratedMove(moveId, seeds) {
  const lines = (Array.isArray(seeds?.results) ? seeds.results : []).filter(l => typeof l === 'string' && l.trim());
  const price = lines.find(l => /^Pay the Price: /.test(l)) ?? null;
  if (price) reportSnapshotEvent(priceRevealsNewEnemy(price) ? 'new_enemy_revealed' : 'price_paid');
  if (moveId === 'make_a_discovery' || moveId === 'confront_chaos') reportSnapshotEvent('discovery_rolled');
  else if (lines.some(l => !PRICE_SEED_LINE.test(l))) reportSnapshotEvent('oracle_seed_envisioned');
}

/** The world snapshot's event for an oracle result the narrator has just told, by its follow-up's kind. */
const ORACLE_FOLLOWUP_EVENTS = Object.freeze({
  oracle_yes_no: 'oracle_yes_no',
  oracle_table:  'oracle_table_rolled',
  pay_the_price: 'price_paid',
});

/**
 * As reportNarratedMove, for an oracle follow-up: a price that revealed a new
 * enemy, or the roll's own kind — a yes/no answer, a table, a price paid. A
 * chosen complication reports nothing here: it plays a plan's step, which the
 * plan store reports.
 *
 * @param {string} kind — the follow-up's kind
 * @param {string} rolledLine — the result it told
 */
function reportNarratedOracle(kind, rolledLine) {
  if (priceRevealsNewEnemy(rolledLine)) reportSnapshotEvent('new_enemy_revealed');
  else if (ORACLE_FOLLOWUP_EVENTS[kind]) reportSnapshotEvent(ORACLE_FOLLOWUP_EVENTS[kind]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Narrate the consequence of a resolved move.
 * Builds the prompt, calls Claude, posts the narration card.
 * On any failure, posts a fallback card and returns null — never blocks the move result.
 *
 * @param {Object} resolution    — MoveResolutionSchema from resolver.js
 * @param {Object} campaignState — CampaignStateSchema
 * @param {Object} [options]
 * @param {Object} [options.relevance] — Pre-resolved RelevanceResult from
 *   the createChatMessage pipeline (lets the caller insert a clarification
 *   dialog between resolveRelevance and narration). If omitted, resolveRelevance
 *   is called internally.
 * @param {string|null} [options.moveTarget] — the interpreter's target for the
 *   move, for its capture (runPostNarrationPasses — KNOWN-NPC-CONNECTION-NO-TARGET)
 * @param {Object|null} [beatClaim] — internal: this narration's claim on its
 *   beat's shape (narrateWithBeatClaim). Callers pass none.
 * @returns {Promise<string|null>} narration text, or null on failure/disabled
 */
export async function narrateResolution(resolution, campaignState, options = {}, beatClaim = null) {
  // The beat's shape is claimed while this narration is written (issue #364
  // BEAT-SHAPE-SIMULTANEOUS): run once more under a claim, released however it ends.
  if (!beatClaim) return narrateWithBeatClaim(claim => narrateResolution(resolution, campaignState, options, claim));
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  // X-Card: the move still resolves (its result card is already posted), but
  // the narrator stays silent until a GM resumes. This gate lived in the
  // retired context assembler (ASSEMBLER-003) and was lost with it.
  if (isXCardActive(campaignState)) {
    console.debug(`${MODULE_ID} | narrateResolution: X-Card active — narration paused.`);
    // The move stands, and so does what it owes the hidden plans — a price's
    // new enemy, an expedition begun: filed with their rolls alone, as every
    // exit that writes no narration files them (issue #364
    // XCARD-PAUSED-NARRATION-PLAN-REQUESTS). Nothing narrates this move
    // again once a GM resumes; the next narration decides them.
    filePausedPlanRequests(() => movePlanRequests(resolution, campaignState, newNarrationId()).planRequests,
      campaignState, { moveId: resolution?.moveId ?? null });
    await postNarrationPausedCard(resolution, campaignState);
    return null;
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateResolution: Claude API key not configured`);
    await postFallbackCard(resolution, campaignState, NO_CLAUDE_KEY_REASON);
    return null;
  }

  const character    = getActiveCharacter(campaignState, options?.speakerActorId);

  // First narration of a session implicitly starts a scene if none is active.
  // See issue #227 (Fact Continuity) §9.1.
  await ensureSceneStarted(campaignState, 'first_narration_move_resolution');

  // Phase 2 — relevance resolver runs before the narrator call:
  //   - Picks the narrator-permission block (discovery / interaction / embellishment)
  //   - Identifies which entity records to inject as cards
  // The pipeline (index.js) may pass in a pre-resolved relevance after a
  // clarification dialog has run. Otherwise we resolve internally.
  let relevance = options.relevance ?? null;
  if (!relevance) {
    try {
      relevance = await resolveRelevance(
        resolution.playerNarration ?? '',
        resolution.moveId,
        resolution.outcome,
        campaignState,
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: resolveRelevance failed; defaulting to embellishment:`, err);
      relevance = {
        resolvedClass: 'embellishment',
        entityIds:     [],
        entityTypes:   [],
        matchedNames:  [],
        needsClarification: false,
        referenceType: 'none',
      };
    }
  }

  if (relevance.needsClarification) {
    console.log(
      `${MODULE_ID} | narrator: needsClarification=true reached narrateResolution — ` +
      `proceeding as ${relevance.resolvedClass} (caller did not run clarification dialog).`
    );
  }

  // The move as it is narrated — its price as the player's choice stands, its
  // hidden rolls made — and the plans it asks this narration to decide
  // (movePlanRequests).
  const owed = movePlanRequests(resolution, campaignState, narrationId);
  resolution = owed.resolution;
  const planRequests = owed.planRequests;
  // The tracks and vows this move ends: their plans are in play to reveal
  // their end, resolved or not (issue #362 D4).
  const endingTrackIds = Array.isArray(resolution.endingTrackIds) ? resolution.endingTrackIds : [];
  const extras = await buildNarratorExtras('move_resolution', campaignState, {
    playerNarration: resolution.playerNarration ?? '',
    character,
    relevance,
    oracleSeeds:     resolution.oracleSeeds ?? null,
    planRequests,
    // The plans already filed for this move, put to its narration by id.
    planIds:         owed.planIds,
    endingTrackIds,
    beatClaim,
  });

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );
  const userMessage  = buildNarratorUserMessage(
    resolution,
    resolution.playerNarration ?? '',
    settings.narrationLength,
    character?.name ?? null,
    getRecentNarrationContext(
      campaignState?.currentSessionId ?? null,
      Math.min(MOVE_RING_CARDS, getNarratorContextCards()),
    ),
    { audio: extras.audioMarkupEnabled === true },
  );
  // The card keeps the line the player wrote (B5) — not the marker a burn /
  // improve re-narration carries in its place.
  const cardOptions = {
    matchedEntityIds: extras.matchedEntityIds ?? [],
    playerText:       writtenLine(resolution),
    playerName:       character?.name ?? null,
    narrationId,
    beatShape:        extras.beatShape?.id ?? null,
  };
  // Whether this narration's side-data was applied, the plans it was asked
  // to decide with it: an exit that wrote none files them with their rolls
  // alone (issue #362 AC07).
  let sideDataApplied = false;

  try {
    const raw = await callNarratorAPI({
      label: 'narrateResolution',
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
    });
    if (xCard.interrupted('narrateResolution')) {
      // The reply is discarded; the plans the move asked for are still owed
      // (issue #364 XCARD-PAUSED-NARRATION-PLAN-REQUESTS).
      filePausedPlanRequests(() => extras.planRequests, campaignState, { moveId: resolution?.moveId ?? null });
      await postNarrationPausedCard(resolution, campaignState);
      return null;
    }
    const narration = applyNarratorSidecar(raw, campaignState, {
      moveId:           resolution?.moveId,
      matchedEntityIds: extras.matchedEntityIds ?? [],
      narrationId,
      planRequests:     extras.planRequests,
      endingTrackIds,
    });

    if (!narration?.trim()) {
      fileUnansweredPlanRequests(extras.planRequests, campaignState, { moveId: resolution?.moveId ?? null });
      await postFallbackCard(resolution, campaignState, EMPTY_REPLY_REASON);
      return null;
    }
    sideDataApplied = true;

    await postNarrationCard(narration, resolution, campaignState, cardOptions);
    reportNarratedMove(resolution?.moveId ?? null, resolution?.oracleSeeds ?? null);
    await runPostNarrationPasses(narration, resolution, relevance, campaignState, { actorId: character?.actorId ?? null, narrationId, moveTarget: options?.moveTarget ?? null });
    // Its Chronicle entry is written from the session record's beat once the
    // card's narration is recorded (record/chronicleView.js, issue #382 slice 4).
    return narration;

  } catch (err) {
    // What the fallback card names as the cause (ERROR-TEXT-BLAMES-KEY): the
    // last failure — the retry's, when there was one.
    let failure = claudeFailureReason(err);
    // Rate limit — retry once after 5 s
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
      label: 'narrateResolution',
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
        });
        if (xCard.interrupted('narrateResolution')) {
          filePausedPlanRequests(() => extras.planRequests, campaignState, { moveId: resolution?.moveId ?? null });
          await postNarrationPausedCard(resolution, campaignState);
          return null;
        }
        const narration = applyNarratorSidecar(raw, campaignState, {
          moveId:           resolution?.moveId,
          matchedEntityIds: extras.matchedEntityIds ?? [],
          narrationId,
          planRequests:     extras.planRequests,
          endingTrackIds,
        });
        if (narration?.trim()) {
          sideDataApplied = true;
          await postNarrationCard(narration, resolution, campaignState, cardOptions);
          reportNarratedMove(resolution?.moveId ?? null, resolution?.oracleSeeds ?? null);
          await runPostNarrationPasses(narration, resolution, relevance, campaignState, { actorId: character?.actorId ?? null, narrationId, moveTarget: options?.moveTarget ?? null });
          return narration;
        }
        failure = EMPTY_REPLY_REASON;
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateResolution retry failed:`, retryErr);
        failure = claudeFailureReason(retryErr);
      }
    }

    console.error(`${MODULE_ID} | narrateResolution failed:`, err);
    if (!sideDataApplied) fileUnansweredPlanRequests(extras.planRequests, campaignState, { moveId: resolution?.moveId ?? null });
    await postFallbackCard(resolution, campaignState, failure);
    return null;
  }
}


/**
 * A move as its narration takes it, and the plans it asks that narration to
 * decide — narrateResolution's, and the same for a move whose narration the
 * X-Card pauses before it is asked for (issue #364
 * XCARD-PAUSED-NARRATION-PLAN-REQUESTS):
 *  - a miss's price that is one of the player's choices (Explore a
 *    Waypoint's match — Confront Chaos instead; Sojourn's — the community's
 *    need, taken on with a vow, instead) is told as it stands now: the choice
 *    card posts after a free-flow narration and before a held result's, so
 *    the pick may not be made yet, or may have declined the price (issue #364
 *    EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY,
 *    SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE). Before the hidden rolls: a
 *    declined price's new enemy is rolled for no one;
 *  - the hidden rolls behind a plan this narration decides, which a store
 *    every client holds kept none of — a held result's card, an upgrade's
 *    card state — are rolled here, on the GM that narrates it (issue #362
 *    AC15). A player's own key rolls none: plans are a GM's;
 *  - a price that revealed a new enemy asks the narration to decide what it
 *    is (issue #353 Phase 1) — from its seeds, the one record of the roll. So
 *    does an expedition the move began (its track — Phase 3);
 *  - each request names the resolution it is made for — this move's, or the
 *    one a Burn Momentum / Improve Result re-narration upgrades — and the
 *    plan it files keeps it (`createdFrom.resolutionId`). A request whose
 *    plan was already filed for that resolution is not made again (issue
 *    #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE): a Battle or Clash burned or
 *    improved to a weak hit keeps its price, and when the move's first
 *    narration was never written — its call failed, its reply was empty, the
 *    X-Card paused it — the new enemy that price revealed was filed with its
 *    rolls alone, under no narration's stamp, and the re-narration's seeds
 *    asked for a second. The plan filed is put to this narration instead
 *    (`planIds` — shown whatever else is in play, to decide by its id), and
 *    the seeds tell the enemy by that plan's rolls, not by a second set.
 *
 * @param {Object} resolution
 * @param {Object|null} campaignState
 * @param {string} refBase — unique to the narration (its id)
 * @returns {{ resolution: Object, planRequests: Object[], planIds: string[] }}
 */
function movePlanRequests(resolution, campaignState, refBase) {
  let move = resolution;
  if (move?.priceChoice) move = settlePriceChoice(move, priceChoiceStatus(move._id ?? null));
  // What the table has still to answer about the result — a cost that is the
  // player's choice, not yet chosen: its narration stops short of it.
  move = withUnansweredCards(move);
  if (globalThis.game?.user?.isGM === true) move = withHiddenRolls(move, campaignState);
  if (!skeletonsEnabled()) return { resolution: move, planRequests: [], planIds: [] };
  const asked = forResolution([move?.upgradeOf, move?._id].find(id => typeof id === 'string' && id) ?? null,
    [...planRequestsFromSeeds(move?.oracleSeeds, refBase), ...unplannedRequests(normalisePlanRequests(move?.skeletonRequests))]);
  const { requests, plans } = lessPlansAlreadyFiled(asked);
  // A plan no longer in play — retired by a GM, or joined to another plan —
  // was filed all the same: it is neither asked for again nor shown.
  const inPlay = plans.filter(p => p.status === 'active');
  if (inPlay.length && move?.oracleSeeds) move = { ...move, oracleSeeds: seedsWithPlannedEnemy(move.oracleSeeds, inPlay) };
  return { resolution: move, planRequests: requests, planIds: inPlay.map(p => p.id) };
}

/** Plan requests, each naming the resolution it is made for — what the plan it files keeps (skeletons.js normaliseProvenance). */
const forResolution = (resolutionId, requests) => (typeof resolutionId === 'string' && resolutionId
  ? requests.map(r => ({ ...r, resolutionId })) : requests);

/**
 * A move's plan requests, less those whose plan was already filed for the
 * resolution they name (skeletons.js planFiledFor), with the plans found. It
 * reads the plans, as unplannedRequests does, on the GM's client its caller
 * runs on. Fail-open: an unreadable journal asks for them all.
 *
 * @param {Object[]} requests — each naming its resolution (forResolution)
 * @returns {{ requests: Object[], plans: Object[] }}
 */
function lessPlansAlreadyFiled(requests) {
  if (!requests.some(r => r?.resolutionId)) return { requests, plans: [] };
  let records;
  try {
    records = listSkeletons({ includeInactive: true });
  } catch {
    return { requests, plans: [] };
  }
  const plans = [];
  const open = requests.filter((r) => {
    const plan = planFiledFor(records, r);
    if (plan) plans.push(plan);
    return !plan;
  });
  return { requests: open, plans };
}

/**
 * The plans a round's entries ask its narration to decide: each entry's
 * price that revealed a new enemy, each expedition one began — each request
 * naming its own entry's resolution, which the plan it files keeps.
 *
 * @param {Object[]} entries — roundNarrationEntries', their hidden rolls made
 * @param {string} refBase — unique to the narration (its id)
 * @returns {Object[]}
 */
function roundPlanRequests(entries, refBase) {
  if (!skeletonsEnabled()) return [];
  return entries.flatMap((e, i) => forResolution(e.input?.resolutionId ?? null, [
    ...planRequestsFromSeeds(e.input?.oracleSeeds ?? null, `${refBase}-${i + 1}`),
    ...normalisePlanRequests(e.input?.skeletonRequests),
  ]));
}

/**
 * The plan requests of a narration the X-Card paused — active when the move
 * or round came to be narrated, or played while the reply was on its way —
 * filed with their rolls alone (fileUnansweredPlanRequests; issue #364
 * XCARD-PAUSED-NARRATION-PLAN-REQUESTS). The exit posted its paused notice
 * and filed nothing: the move's result stands, so the enemy its price
 * revealed had no plan and the rolls behind it existed nowhere. A paused
 * narration is final — its notice offers no retry, a paused round's notice
 * closes the round (batch/driver.js roundNarrationPosted), and a GM's resume
 * picks play up at the next move — so this is the one filing; a Burn Momentum
 * or Improve Result re-narration asks again only for subjects still unplanned
 * (unplannedRequests), and for no plan already filed for the move it upgrades
 * (lessPlansAlreadyFiled). Never throws: the paused notice posts whatever
 * happens here.
 *
 * @param {() => Object[]} requests — builds the narration's plan requests
 * @param {Object|null} campaignState
 * @param {{ moveId?: string|null }} [opts]
 */
function filePausedPlanRequests(requests, campaignState, opts = {}) {
  try {
    fileUnansweredPlanRequests(requests(), campaignState, opts);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the plans a paused narration was asked to decide were not filed:`, err?.message ?? err);
  }
}

/**
 * A narration's plan requests about a known subject (an expedition's track),
 * less those whose subject already has a plan of their kind. A burned or
 * improved result is asked for the plan its roll's narration was (issue #362
 * AC04): a plan that narration filed is taken back with it, but one its
 * fallback filed unstamped (a failed call — issue #362 AC07) stays, and was
 * planned a second time. Fail-open: an unreadable journal asks for them all.
 *
 * It reads the plans, which only a GM's client does (issue #362 D1) — and
 * only a GM's client is ever handed such a request: the move pipeline, a burn
 * or an improvement, a held result, a round and the vow scene all run on the
 * canonical GM, and the one move narration on a player's own key (a sheet
 * roll with no keyed GM connected) carries none. So no answer about which
 * subjects are planned crosses the relay (issue #364
 * PLAYER-KEY-PLAN-REQUESTS-UNFILTERED: checked, nothing takes that path —
 * playerKeyNarrationPlanRequests.test.js pins it). Were one to arrive there
 * it would be asked again, and the canonical GM joins its relayed answer to
 * the plan the subject has, whose truth stands (applyPlanSideData, AC14).
 *
 * @param {Object[]} requests — normalisePlanRequests'
 * @returns {Object[]}
 */
function unplannedRequests(requests) {
  const about = (r) => (typeof r?.subject?.id === 'string' && r.subject.id ? r.subject.id : null);
  if (!requests.some(about)) return requests;
  let plans;
  try {
    plans = listSkeletons();
  } catch {
    return requests;
  }
  return requests.filter(r => !about(r) || !plans.some(p => p?.kind === r.kind && p?.subject?.id === about(r)));
}

// ---------------------------------------------------------------------------
// A Batch Mode round — every acting player's action, narrated once (issue #340)
// ---------------------------------------------------------------------------

/** Each class's rank: a round narrates at the widest class among its entries. */
const PERMISSION_CLASS_RANK = Object.freeze({ embellishment: 0, interaction: 1, discovery: 2 });

/**
 * The widest permission class among a round's entries — discovery, then
 * interaction, then embellishment. A move entry brings its own relevance's
 * class; an action with no roll (a narrative entry, or one the roll stage
 * refused) is narrated as paced narration is, at interaction.
 *
 * @param {Array<{ input: Object }>} entries
 * @returns {"discovery"|"interaction"|"embellishment"}
 */
export function widestRoundClass(entries) {
  let best = 'embellishment';
  for (const e of entries ?? []) {
    const cls = e?.input?.kind === 'move' ? (e.input.relevance?.resolvedClass ?? 'embellishment') : 'interaction';
    if ((PERMISSION_CLASS_RANK[cls] ?? 0) > PERMISSION_CLASS_RANK[best]) best = cls;
  }
  return best;
}

/**
 * The acting entries of a round, in order, as the narration takes them —
 * each with the narration input its roll kept (src/moves/movePipeline.js
 * narrationInputFrom), the refusal the roll stage gave it, or none: an action
 * with no roll. Nobody who sat the round out is here.
 *
 * @param {Object} round — src/batch/round.js
 * @returns {Array<{ userId: string, actorId: string, actorName: string, userName: string, text: string, input: Object }>}
 */
export function roundNarrationEntries(round) {
  return (round?.acting ?? [])
    .map(id => round.entries?.[id])
    .filter(Boolean)
    .map(e => ({
      userId:    e.userId,
      actorId:   e.actorId,
      // The PC as it is named now, by its id: the entry's name was copied when
      // the round opened, and a rename since (a new character's name settled
      // in the first session) narrated the old one (issue #342 Z36). The
      // copy names a PC that is gone.
      actorName: String(game.actors?.get?.(e.actorId)?.name ?? '').trim() || e.actorName || 'Someone',
      userName:  e.userName ?? '',
      text:      e.text ?? '',
      input:     e.rolled?.narrationInput ?? { kind: 'narrative' },
    }));
}

/**
 * Narrate a Batch Mode round as one scene and post its one card (issue #340
 * — the narrator mode `round_resolution`). The canonical GM's round driver
 * calls it once every acting entry is rolled, recorded and its upgrade
 * decided, under the move lock. As every narration does: the X-Card gate on
 * entry and on the reply (the moves stand; the round posts the "narration
 * paused" notice), one rate-limit retry, the sidecar applied under one
 * `narrationId`, the `!narrator debug` capture, and a fallback card on
 * failure — "Move: outcome — narration unavailable" for each entry, with the
 * flag family and `narrationFallback`, so the session recap counts the moves.
 *
 * Context goes through buildNarratorExtras('round_resolution', …): the
 * entries' text joined for lexical relevance and lore, each move entry's own
 * relevance unioned, at the widest class; a CHARACTER block for every acting
 * PC, the PARTY block naming who acts, no SPOTLIGHT (every PC is asked each
 * round). The narrator is told only who acted.
 *
 * `stillNarrating` — the driver's check that this call's narration is still
 * the round's — is asked once the reply is in (or the call has failed),
 * before anything is applied or posted: a round another GM took over,
 * narrated or closed meanwhile is not narrated again from here — no card, no
 * fallback, no sidecar — and the call answers `{ superseded: true }` (issue
 * #347 AB17: the first GM's late reply posted a second card).
 *
 * @param {{ round: Object, campaignState: Object, stillNarrating?: (() => boolean)|null }} args — a working copy of campaignState
 *   (`beatClaim` is internal — this narration's claim on its shape, narrateWithBeatClaim; callers pass none)
 * @returns {Promise<{ posted: "card"|"fallback"|"paused"|null, narrationId?: string, card?: Object, superseded?: boolean }>}
 */
export async function narrateRound({ round, campaignState, stillNarrating = null, noKeyReason = null, beatClaim = null }) {
  // The round's shape is claimed while it is narrated (issue #364
  // BEAT-SHAPE-SIMULTANEOUS; narrateResolution's rule).
  if (!beatClaim) return narrateWithBeatClaim(claim => narrateRound({ round, campaignState, stillNarrating, noKeyReason, beatClaim: claim }));
  // The hidden rolls behind the plans its entries ask for, which the round —
  // a world setting every client holds — keeps none of, are rolled here, on
  // the GM that narrates it (issue #362 AC15).
  // An entry's price that is its player's choice is told as it stands now —
  // its choice card posted when the entry was recorded, before this narration
  // (issue #364 EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY; narrateResolution's rule).
  const entries = roundNarrationEntries(round)
    .map(e => (e.input?.priceChoice
      ? { ...e, input: settlePriceChoice(e.input, priceChoiceStatus(e.input.resolutionId ?? null)) } : e))
    // …and so is a cost still its player's to choose (narrateResolution's rule).
    .map(e => (e.input?.kind === 'move' ? { ...e, input: withUnansweredCards(e.input) } : e))
    .map(e => (globalThis.game?.user?.isGM === true
      ? { ...e, input: withHiddenRolls(e.input, campaignState) } : e));
  if (!entries.length) return { posted: null };
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return { posted: null };

  if (isXCardActive(campaignState)) {
    console.debug(`${MODULE_ID} | narrateRound: X-Card active — narration paused.`);
    // Its entries' moves stand, and what they owe the hidden plans with them
    // (issue #364 XCARD-PAUSED-NARRATION-PLAN-REQUESTS; narrateResolution's rule).
    filePausedPlanRequests(() => roundPlanRequests(entries, newNarrationId()), campaignState);
    return { posted: 'paused', card: await postRoundPausedCard(round, entries, campaignState) };
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateRound: Claude API key not configured`);
    return { posted: 'fallback', card: await postRoundFallbackCard(round, entries, campaignState, noKeyReason || NO_CLAUDE_KEY_REASON) };
  }

  await ensureSceneStarted(campaignState, 'first_narration_round_resolution');

  // Each move entry's relevance, unioned, at the widest class among them.
  const widest = widestRoundClass(entries);
  const ids = [];
  const types = [];
  for (const e of entries) {
    const rel = e.input?.kind === 'move' ? e.input.relevance : null;
    (rel?.entityIds ?? []).forEach((id, i) => {
      if (ids.includes(id)) return;
      ids.push(id);
      types.push(rel.entityTypes?.[i]);
    });
  }
  const relevance = { resolvedClass: widest, entityIds: ids, entityTypes: types };

  // A block per acting PC still in the game, by its own id: getActiveCharacter
  // falls back to another PC for an id that no longer resolves, so an entry
  // whose PC was deleted since the round opened (refused, Z35) brought a PC
  // who sat the round out into it (ROUND-CHARACTER-BLOCK-GONE-PC).
  const characters = entries
    .filter(e => isPlayerCharacterActor(game.actors?.get?.(e.actorId) ?? null))
    .map(e => getActiveCharacter(campaignState, e.actorId))
    .filter((c, i, all) => c && all.findIndex(o => o?.actorId === c.actorId && o?.name === c.name) === i);
  // The tracks and vows the round's moves end (issue #362 D4; narrateResolution's rule).
  const endingTrackIds = entries.flatMap(e => (Array.isArray(e.input?.endingTrackIds) ? e.input.endingTrackIds : []));
  const extras = await buildNarratorExtras('round_resolution', campaignState, {
    playerNarration: entries.map(e => e.text).filter(Boolean).join('\n'),
    character:       null,
    relevance,
    actingActorIds:  entries.map(e => e.actorId),
    // Each entry's price that revealed a new enemy asks for its plan (issue #353).
    planRequests:    skeletonsEnabled()
      ? roundPlanRequests(entries, narrationId)
      : [],
    endingTrackIds,
    beatClaim,
  });
  extras.roundCharacters = characters;

  const sentenceTarget = roundSentenceTarget(settings.narrationLength, entries.length);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, { ...settings, narrationLength: sentenceTarget }, null, '', extras,
  );
  const userMessage = buildRoundUserMessage({
    recentContext: getRecentNarrationContext(
      campaignState?.currentSessionId ?? null,
      Math.min(MOVE_RING_CARDS, getNarratorContextCards()),
    ),
    entries,
    sentenceTarget,
    audio: extras.audioMarkupEnabled === true,
  });
  const maxTokens = maxTokensWithSidecar(roundMaxTokens(settings.narrationMaxTokens, entries.length));
  // Asked after the call's long wait: is this narration still the round's?
  const superseded = () => {
    if (typeof stillNarrating !== 'function' || stillNarrating()) return false;
    console.debug(`${MODULE_ID} | narrateRound: round ${round?.number ?? '?'} was taken over or narrated meanwhile — this reply is not posted.`);
    return true;
  };

  // One call, and one retry after a rate limit. The call is made here, not in
  // a helper, so its caller is narrateRound (the playthrough harness files a
  // call under the two module functions above the proxy).
  let failure = claudeFailureReason(null);   // the fallback card's cause (ERROR-TEXT-BLAMES-KEY)
  // Whether the side-data was applied, the entries' plan requests with it
  // (issue #362 AC07; narrateResolution's rule).
  let sideDataApplied = false;
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      if (tries) await delay(RETRY_DELAY_MS);
      const raw = await callNarratorAPI({
        label: 'narrateRound', apiKey, systemPrompt, userMessage, model: settings.narrationModel, maxTokens,
      });
      if (superseded()) return { posted: null, superseded: true };
      if (xCard.interrupted('narrateRound')) {
        filePausedPlanRequests(() => extras.planRequests, campaignState);
        return { posted: 'paused', card: await postRoundPausedCard(round, entries, campaignState) };
      }
      const narration = applyNarratorSidecar(raw, campaignState, {
        moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, planRequests: extras.planRequests,
        endingTrackIds,
      });
      if (!narration?.trim()) {
        failure = EMPTY_REPLY_REASON;
        break;
      }
      sideDataApplied = true;
      const card = await postRoundNarrationCard(narration, round, entries, campaignState, {
        matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, beatShape: extras.beatShape?.id ?? null,
      });
      for (const e of entries) reportNarratedMove(e.input?.moveId ?? null, e.input?.oracleSeeds ?? null);
      await runRoundNarrationPasses(narration, entries, campaignState, {
        narrationId, matchedEntityIds: extras.matchedEntityIds ?? [], matchedEntityTypes: extras.matchedEntityTypes ?? [],
      });
      // Its Chronicle entry — about the acting character the scribe names — is
      // written from the session record's round (record/chronicleView.js).
      return { posted: 'card', narrationId, card };
    } catch (err) {
      failure = claudeFailureReason(err);
      if (!tries && isRateLimit(err)) continue;
      console.error(`${MODULE_ID} | narrateRound ${tries ? 'retry ' : ''}failed:`, err);
      break;
    }
  }
  if (superseded()) return { posted: null, superseded: true };
  // A round no narration was written for: its entries' plan requests are
  // filed with their rolls alone (issue #362 AC07).
  if (!sideDataApplied) fileUnansweredPlanRequests(extras.planRequests, campaignState);
  return { posted: 'fallback', card: await postRoundFallbackCard(round, entries, campaignState, failure) };
}

/**
 * The capture a round's narration gets: one detection call for the round,
 * its results routed per entry (issue #342).
 *
 * A Make a Connection miss creates no one (scope §9) — that entry's rule, not
 * the round's: it takes no part in the capture, neither its lead nor its
 * class, and the rest of the round is captured as though it were not there
 * (Z08 — a round led by a miss skipped its whole capture).
 *
 * Each Make a Connection hit creates one connection — the figure its own
 * character met (roundFigureOwner), with its own seed, bonded to its roller —
 * synchronously, as free-flow's does (Z09: the round's first connection,
 * whoever met them, went to the first hit's roller with that roller's seed).
 * Otherwise the detection runs ~2 s after the card, at the captured entries'
 * widest class: none at embellishment, as runPostNarrationPasses rules. What
 * it queues goes on a draft card carrying every acting PC (D3 — the
 * maintainer's ruling A): a connection row's Confirm asks which of them the
 * NPC is a connection of, or no one; it was filed as the first entry's PC.
 *
 * The tier pass — an NPC's NARRATOR-ADDED developments — runs whatever that
 * class is, over what the round's interaction-class entries were about
 * (roundTierRefs; Z10: it ran over the rolled moves' entities alone, only
 * when the widest class was interaction, so an unrolled action's NPC, or
 * every NPC beside a discovery roll, got no details).
 *
 * @param {string} narration
 * @param {Array<Object>} entries — roundNarrationEntries
 * @param {Object} campaignState
 * @param {{ narrationId: string, matchedEntityIds?: string[], matchedEntityTypes?: string[] }} opts —
 *   the matched set the round's prompt used (buildNarratorExtras)
 * @returns {Promise<void>}
 */
function runRoundNarrationPasses(narration, entries, campaignState, { narrationId, matchedEntityIds = [], matchedEntityTypes = [] }) {
  // The capture's world-scoped writes are a GM's, and it runs where the round
  // was narrated — the GM resolving it, canonical when it took the round: a
  // lower-id keyed GM joining meanwhile left the round's capture undone (the
  // runPostNarrationPasses gate, issue #345 AA34).
  if (!game.user?.isGM) return Promise.resolve();
  const isHit = (o) => o === 'strong_hit' || o === 'weak_hit';
  const isConnection = (e) => e.input?.kind === 'move' && e.input.moveId === 'make_a_connection';
  const captured = entries.filter(e => !isConnection(e) || isHit(e.input.outcome));
  const hits = captured.filter(isConnection);
  // The detection names one lead move. A round with no rolled move — actions
  // with no roll, moves the roll stage refused — is told so as paced
  // narration's is: its prompt read "Move: null." (ROUND-DETECTION-NULL-MOVE).
  const lead = hits[0] ?? captured.find(e => e.input?.kind === 'move') ?? null;
  const resolution = {
    moveId:          lead ? lead.input.moveId ?? null : PACED_NARRATIVE_MOVE_ID,
    outcome:         lead ? lead.input.outcome ?? null : PACED_NARRATIVE_OUTCOME,
    playerNarration: entries.map(e => e.text).filter(Boolean).join('\n'),
  };

  const refs = roundTierRefs(captured, matchedEntityIds, matchedEntityTypes);
  if (refs.length) {
    setTimeout(() => {
      appendGenerativeTierUpdates(
        narration, refs, campaignState?.currentSessionId, campaignState?.sessionNumber, { narrationId },
      ).catch(err => console.error(`${MODULE_ID} | round tier update failed:`, err));
    }, ASYNC_DETECTION_DELAY_MS);
  }

  // Its draft card carries every acting PC — whose connection a figure is,
  // the GM's Confirm asks (issue #342 D3); one acting PC is free-flow's card.
  const actorIds = [...new Set(entries.map(e => e.actorId).filter(id => typeof id === 'string' && id))];
  const options = {
    actorId: actorIds.length === 1 ? actorIds[0] : null, actorIds, narrationId,
    // Each acting character's line, for the detection pass: a name a line
    // gives to someone the round's narration shows is theirs (known-issues
    // PLAYER-NAMED-PERSON-GETS-NO-CARD).
    playerLines: entries.map(e => ({ name: e.actorName ?? null, text: e.text ?? '' })),
  };
  if (hits.length) {
    const owner = roundFigureOwner(entries, narration);
    return runDiscoveryDetection(narration, resolution, campaignState, {
      ...options,
      // Each hit's own line says which NPC it was with (issue #347 AB10's
      // rule): the round's lines joined named every player's NPCs as each
      // roller's (ROUND-CONNECTION-LINE-JOINED).
      connectionRollers: hits.map(e => ({
        actorId:        e.actorId ?? null,
        connectionSeed: e.input.oracleSeeds?.connectionSeed ?? null,
        owns:           (figure) => !!e.actorId && owner(figure) === e.actorId,
        lineText:       String(e.text ?? ''),
      })),
    });
  }
  if (widestRoundClass(captured) === 'embellishment') return Promise.resolve();
  setTimeout(() => {
    runDiscoveryDetection(narration, resolution, campaignState, options)
      .catch(err => console.error(`${MODULE_ID} | round detection failed:`, err));
  }, ASYNC_DETECTION_DELAY_MS);
  return Promise.resolve();
}

/**
 * The entities a round's tier pass covers (issue #342 Z10), each entry as its
 * free-flow narration's pass would: an action with no roll is narrated as
 * paced narration is (widestRoundClass), so it brings what the round's prompt
 * matched — paced's rule (schedulePacedTierUpdate), the scene frame's cast
 * included; a rolled interaction-class move brings its own relevance — the
 * move pass's rule (runPostNarrationPasses; architecture §8.2: a move's tier
 * pass follows the player's text, not the frame); a discovery- or
 * embellishment-class move brings none.
 *
 * @param {Array<Object>} entries — the captured roundNarrationEntries
 * @param {string[]} matchedEntityIds
 * @param {string[]} matchedEntityTypes
 * @returns {Array<{ journalId: string, type: string|undefined }>}
 */
function roundTierRefs(entries, matchedEntityIds, matchedEntityTypes) {
  const refs = [];
  const add = (id, type) => {
    if (typeof id === 'string' && id && !refs.some(r => r.journalId === id)) refs.push({ journalId: id, type });
  };
  for (const e of entries ?? []) {
    if (e?.input?.kind !== 'move') {
      (matchedEntityIds ?? []).forEach((id, i) => add(id, matchedEntityTypes?.[i]));
    } else if (e.input.relevance?.resolvedClass === 'interaction') {
      (e.input.relevance.entityIds ?? []).forEach((id, i) => add(id, e.input.relevance.entityTypes?.[i]));
    }
  }
  return refs;
}

/**
 * Whose action in a round met a figure its narration introduced — an acting
 * PC's id, or null when the round cannot tell (issue #342 Z09). A bounded
 * ladder that stops before a guess (rules/reachability.md §6):
 *   1. the acting player whose own line names the figure (several: null);
 *   2. else the one acting PC named by the figure's detected description and
 *      by the narration's sentences or clauses (. ! ? ;) that name the
 *      figure, taken together — either may name no one.
 * When they disagree (the description names one acting PC, a clause another)
 * the figure is no one's here: it waits on the draft card, whose Confirm asks
 * whose connection it is (issue #345 D2, the maintainer's ruling B — the
 * description outranked the clause, so "once crewed with Ren" made Kira's
 * find Ren's connection; the detection never says who met a figure). Names
 * match whole words; the figure's own name is taken out first, so a PC's
 * name inside it ("Kira's Brother") is not a mention. A round with one acting
 * PC is free-flow's case: every figure is theirs.
 *
 * @param {Array<Object>} entries — roundNarrationEntries
 * @param {string} narration
 * @returns {(figure: { name?: string, description?: string }) => (string|null)}
 */
function roundFigureOwner(entries, narration) {
  const pcs = [];
  for (const e of entries ?? []) {
    if (e?.actorId && !pcs.some(p => p.actorId === e.actorId)) {
      pcs.push({ actorId: e.actorId, name: String(e.actorName ?? '').trim() });
    }
  }
  if (pcs.length <= 1) return () => pcs[0]?.actorId ?? null;
  const clauses = String(narration ?? '').split(/[.!?;\n]+/);
  const only = (ids) => (ids.size === 1 ? [...ids][0] : null);
  return (figure) => {
    const name = String(figure?.name ?? '').trim();
    if (!name) return null;
    const pattern = wholeWordPattern(name);
    const without = (text) => String(text ?? '').replace(wholeWordPattern(name, 'gi'), ' ');
    const byLine = new Set(entries.filter(e => e?.actorId && pattern.test(String(e.text ?? ''))).map(e => e.actorId));
    if (byLine.size) return only(byLine);
    return only(new Set([
      ...actingPcsNamedIn(without(figure.description), pcs),
      ...clauses.filter(c => pattern.test(c)).flatMap(c => [...actingPcsNamedIn(without(c), pcs)]),
    ]));
  };
}

/**
 * The acting PCs a text names: a full name, or a first or last name no other
 * acting PC shares, as whole words.
 *
 * @param {string} text
 * @param {Array<{ actorId: string, name: string }>} pcs
 * @returns {Set<string>} actor ids
 */
function actingPcsNamedIn(text, pcs) {
  const out = new Set();
  const hay = String(text ?? '');
  if (!hay.trim()) return out;
  const parts = (n) => String(n ?? '').split(/\s+/).filter(p => p.length >= 2);
  for (const pc of pcs) {
    if (!pc.name) continue;
    const own = parts(pc.name);
    const shared = (tok) => pcs.some(o => o !== pc && parts(o.name).some(p => p.toLowerCase() === tok.toLowerCase()));
    const tokens = [pc.name, own.length > 1 ? own[0] : null, own.length > 1 ? own.at(-1) : null]
      .filter(tok => tok && (tok === pc.name || !shared(tok)));
    if (tokens.some(tok => wholeWordPattern(tok).test(hay))) out.add(pc.actorId);
  }
  return out;
}

/** One entry's line on a round card: who, and what the move rolled. */
function roundEntryHtml(e) {
  const input = e.input ?? {};
  const roll = input.kind === 'move'
    ? `${escapeHtml(input.moveName ?? moveDisplayName(input.moveId))}: ${escapeHtml(String(input.outcomeLabel ?? input.outcome ?? '').replace(/_/g, ' '))}`
    : input.kind === 'refused'
      ? `${escapeHtml(input.moveName ?? 'A move')}: not rolled`
      : 'no roll';
  const said = sanitizePlayerText(e.text ?? '');
  return `<li class="sf-round-entry"><strong>${escapeHtml(e.actorName)}</strong> — ${roll}`
    + (said ? `<div class="sf-round-entry-line">“${escapeHtml(said)}”</div>` : '')
    + `</li>`;
}

/** The round card's `roundEntries`: the players who acted, and no one else. */
function roundEntriesFlag(entries) {
  return entries.map(e => ({
    userId:       e.userId,
    actorId:      e.actorId,
    playerName:   e.actorName,
    playerText:   sanitizePlayerText(e.text ?? ''),
    moveId:       e.input?.kind === 'move' ? (e.input.moveId ?? null) : null,
    outcome:      e.input?.kind === 'move' ? (e.input.outcome ?? null) : null,
    isMatch:      e.input?.kind === 'move' ? e.input.isMatch === true : false,
    resolutionId: e.input?.kind === 'move' ? (e.input.resolutionId ?? '') : '',
  }));
}

/**
 * The round's one narrator card: each acting player's line and roll, then
 * the prose (issue #340). It carries the flag family — `narratorCard`,
 * `narrationText`, `sessionId`, `narrationId`, `matchedEntityIds` — and
 * `roundId`, `roundNumber` and `roundEntries`; its own `moveId`, `outcome`
 * and `resolutionId` stay empty (a Burn Momentum's supersede never matches
 * it: upgrades are decided before the round is narrated).
 *
 * @param {string} narrationText
 * @param {Object} round
 * @param {Array<Object>} entries — roundNarrationEntries
 * @param {Object} campaignState
 * @param {{ matchedEntityIds?: string[], narrationId?: string|null, beatShape?: string|null }} [options]
 * @returns {Promise<ChatMessage>}
 */
export async function postRoundNarrationCard(narrationText, round, entries, campaignState, options = {}) {
  const matchedEntityIds = Array.isArray(options.matchedEntityIds) ? options.matchedEntityIds : [];
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-round-card">
        <div class="sf-narration-label">◈ Round ${escapeHtml(String(round?.number ?? ''))}</div>
        <ul class="sf-round-entries">${entries.map(roundEntryHtml).join('')}</ul>
        <div class="sf-narration-prose">${proseToHtml(narrationText)}</div>
        <div class="sf-narration-footer">
          <button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden>
            <i class="fas fa-play"></i> Play
          </button>
          <button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden>
            <i class="fas fa-stop"></i> Stop
          </button>
        </div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:     true,
        narrationCard:    true,
        narrationText,
        sessionId:        campaignState?.currentSessionId ?? null,
        sessionNumber:    campaignState?.sessionNumber ?? null,
        moveId:           null,
        outcome:          null,
        isMatch:          false,
        resolutionId:     '',
        matchedEntityIds,
        playerText:       '',
        playerName:       null,
        narrationId:      typeof options.narrationId === 'string' && options.narrationId ? options.narrationId : null,
        roundId:          round?.id ?? null,
        roundNumber:      round?.number ?? null,
        roundEntries:     roundEntriesFlag(entries),
        ...beatShapeFlag(options.beatShape),   // the shape the round was written in (beatVariety)
        timestamp:        new Date().toISOString(),
      },
    },
  });
}

/**
 * The round's card when its narration failed: each entry's "Move: outcome —
 * narration unavailable" — the flag family with `narrationFallback`, so the
 * session recap counts the moves and every narrator-memory read leaves it out
 * (rules/narrator-memory.md invariant 1). No narrationId: no sidecar ran.
 */
async function postRoundFallbackCard(round, entries, campaignState = null, reason = claudeFailureReason(null)) {
  const lines = entries.map(e => {
    const input = e.input ?? {};
    const what = input.kind === 'move'
      ? `${input.moveName ?? moveDisplayName(input.moveId)}: ${input.outcomeLabel ?? String(input.outcome ?? '').replace(/_/g, ' ')}`
      : `${e.actorName}: no roll`;
    return `${input.kind === 'move' ? `${e.actorName} — ` : ''}${what} — narration unavailable.`;
  });
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback sf-round-card">
        <div class="sf-narration-label">◈ Round ${escapeHtml(String(round?.number ?? ''))}</div>
        <div class="sf-narration-prose">${lines.map(escapeHtml).join('<br>')}</div>
        <div class="sf-narration-error">Narration unavailable — ${escapeHtml(reason)}.</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:      true,
        narrationCard:     true,
        narrationFallback: true,
        narrationText:     lines.join(' '),
        sessionId:         campaignState?.currentSessionId ?? null,
        sessionNumber:     campaignState?.sessionNumber ?? null,
        moveId:            null,
        outcome:           null,
        resolutionId:      '',
        matchedEntityIds:  [],
        roundId:           round?.id ?? null,
        roundNumber:       round?.number ?? null,
        roundEntries:      roundEntriesFlag(entries),
        timestamp:         new Date().toISOString(),
      },
    },
  });
}

/**
 * The notice a round posts instead of its narration while the X-Card is in
 * play (or when it was played while the narration was written). Not a
 * narrator card: never in the ring, the summary or the Chronicle. The moves
 * stand.
 */
async function postRoundPausedCard(round, entries, campaignState = null) {
  const moves = entries
    .filter(e => e.input?.kind === 'move')
    .map(e => `${e.actorName} — ${e.input.moveName ?? moveDisplayName(e.input.moveId)}: ${e.input.outcomeLabel ?? String(e.input.outcome ?? '').replace(/_/g, ' ')}`);
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback sf-round-card">
        <div class="sf-narration-label">◈ Round ${escapeHtml(String(round?.number ?? ''))}</div>
        <div class="sf-narration-prose">${moves.length ? moves.map(escapeHtml).join('<br>') : 'Round resolved.'}</div>
        <div class="sf-narration-error">${xCardDiscardReason(campaignState, 'Narration')}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narrationPaused: true,
        sessionId:       campaignState?.currentSessionId ?? null,
        roundId:         round?.id ?? null,
        roundNumber:     round?.number ?? null,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Post-narration passes — combined detection + generative tier updates
// ---------------------------------------------------------------------------

const ASYNC_DETECTION_DELAY_MS = 2000;

/**
 * Schedule the post-narration passes specified in narrator-entity-discovery
 * scope §14, step 9. Returns the dispatched promise so tests can await it.
 *
 * Routing:
 *   - discovery + make_a_connection + (strong_hit|weak_hit)
 *       → SYNCHRONOUS detection + auto-create connection
 *   - discovery + any other move
 *       → ASYNCHRONOUS detection (~2 s) + GM-only draft card
 *   - interaction + matched entities
 *       → ASYNCHRONOUS generative-tier update
 *   - embellishment / no relevant outcome
 *       → no pass
 *
 * `actorId` is the PC the narration was for (the roller): a connection it
 * creates — or a draft card's Confirm — puts the bond Item on their sheet,
 * not the first PC's (issue #321 U23). `narrationId` is the narration's id,
 * stamped on what the passes record — lore, threats, Session Log beats, tier
 * details — so an X-Card on it undoes them (issue #329 X01). `moveTarget` is
 * the interpreter's target for the move: a Make a Connection hit whose
 * narration names several NPCs the table knows connects the one it names when
 * the player's line does not say (KNOWN-NPC-CONNECTION-NO-TARGET).
 */
export function runPostNarrationPasses(
  narrationText, resolution, relevance, campaignState, { actorId = null, narrationId = null, moveTarget = null } = {},
) {
  if (!resolution || !relevance) return Promise.resolve();

  // Hardening (multiplayer): the detection passes below perform world-scoped
  // writes — World Journal pages (JournalEntryPage), entity generative tiers,
  // and entity Actor creation. Players lack permission for those, so an
  // un-gated run on their client floods the server log with "lacks permission
  // to create JournalEntryPage" errors (the v1.7.24-era multiplayer playtest
  // bug). The single emitter is the narration: the move pipeline claims the
  // move lock on the canonical GM (src/index.js) and narrates there once, and
  // its capture runs where it ran. It re-checked isCanonicalGM here, so when a
  // lower-id keyed GM joined while the narration was written, the capture ran
  // nowhere — a Make a Connection hit said "Connection made" and made no one,
  // and nobody was told (issue #345 AA34).
  if (!game.user?.isGM) return Promise.resolve();

  const cls = relevance.resolvedClass;

  if (cls === 'embellishment') return Promise.resolve();

  // Discovery class
  if (cls === 'discovery') {
    const isMakeAConnection = resolution.moveId === 'make_a_connection';
    const isHit = resolution.outcome === 'strong_hit' || resolution.outcome === 'weak_hit';

    if (isMakeAConnection && !isHit) {
      // Per scope §9: no entity creation on a miss
      return Promise.resolve();
    }
    if (isMakeAConnection) {
      // Synchronous — driver awaits so the draft + auto-creation appear
      // in chat at the same moment as the narration.
      return runDiscoveryDetection(
        narrationText, resolution, campaignState,
        {
          autoCreateConnection: true,
          connectionSeed:       resolution.oracleSeeds?.connectionSeed ?? null,
          actorId,
          narrationId,
          moveTarget,
        },
      );
    }

    // Other discovery-class moves — async ~2 s, fire and forget.
    setTimeout(() => {
      runDiscoveryDetection(narrationText, resolution, campaignState, { actorId, narrationId })
        .catch(err => console.error(`${MODULE_ID} | post-narration detection failed:`, err));
    }, ASYNC_DETECTION_DELAY_MS);
    return Promise.resolve();
  }

  // Interaction class — the generative tier update, and (issue #286 D4) the
  // detection pass paced narration runs for the same class: world lore and
  // threats recorded, new entities queued for the GM's review (never
  // auto-created).
  if (cls === 'interaction') {
    setTimeout(() => {
      runDiscoveryDetection(narrationText, resolution, campaignState, { actorId, narrationId })
        .catch(err => console.error(`${MODULE_ID} | post-narration detection failed:`, err));
    }, ASYNC_DETECTION_DELAY_MS);
  }
  if (cls === 'interaction' && Array.isArray(relevance.entityIds) && relevance.entityIds.length) {
    setTimeout(() => {
      const refs = relevance.entityIds.map((id, i) => ({
        journalId: id,
        type:      relevance.entityTypes?.[i],
      }));
      appendGenerativeTierUpdates(
        narrationText,
        refs,
        campaignState?.currentSessionId,
        campaignState?.sessionNumber,
        { narrationId },
      ).catch(err =>
        console.error(`${MODULE_ID} | post-narration tier update failed:`, err),
      );
    }, ASYNC_DETECTION_DELAY_MS);
  }

  return Promise.resolve();
}

/**
 * The player's line — or a round's lines, each with its character — as the
 * detection pass is handed them: markup stripped, empty ones left out.
 *
 * @param {string|Array<{ name?: string|null, text?: string }>|null} lines
 * @returns {Array<{ name: string|null, text: string }>}
 */
function detectionPlayerLinesOf(lines) {
  const list = Array.isArray(lines) ? lines : [{ name: null, text: lines }];
  return list
    .map(l => ({ name: typeof l?.name === 'string' && l.name.trim() ? l.name.trim() : null, text: sanitizePlayerText(String(l?.text ?? '')) }))
    .filter(l => l.text);
}

async function runDiscoveryDetection(narrationText, resolution, campaignState, options) {
  const narrationId = options.narrationId ?? null;
  // Nothing is captured for a narration the X-Card removed — checked when the
  // pass starts (its timer has fired: no Claude call) and when its reply
  // returns; each router checks again before every write (XCARD-LATE-CAPTURE).
  if (isNarrationXCarded(narrationId)) return;
  try {
    const detection = await runCombinedDetectionPass(
      narrationText,
      resolution.moveId,
      resolution.outcome,
      campaignState,
      // The line the player wrote beside the narration (known-issues
      // PLAYER-NAMED-PERSON-GETS-NO-CARD): a name it gives to someone the
      // narration shows is that person's name. A round hands in each acting
      // character's (`options.playerLines`); a Burn Momentum / Improve Result
      // re-narration has none (writtenLine).
      { playerLines: detectionPlayerLinesOf(options.playerLines ?? writtenLine(resolution)) },
    );
    if (isNarrationXCarded(narrationId)) return;
    await routeWorldJournalResults(detection.worldJournal, campaignState, { narrationId });
    // Renames before drafts: a placeholder figure revealed to have a proper
    // name is renamed in place, not duplicated into a new connection card.
    // Both carry the narration's id, so an X-Card on it undoes what they
    // record (issue #335 Y02 — the X01 rule, at the last two writers).
    await applyEntityRenames(detection.renames, campaignState, { narrationId });
    await routeEntityDrafts(detection.entities, campaignState, {
      autoCreateConnection: options.autoCreateConnection === true,
      connectionSeed:       options.connectionSeed ?? null,
      // People the detection read as someone known: listed on the card as
      // read as them (issue #362 D10).
      readAs:               detection.readAs ?? [],
      // A Batch Mode round's Make a Connection hits, each its own roller and
      // seed (runRoundNarrationPasses — issue #342 Z09).
      connectionRollers:    options.connectionRollers ?? null,
      // A round's acting PCs: its draft card asks which of them a new
      // connection belongs to (issue #342 D3).
      actorIds:             options.actorIds ?? null,
      actorId:              options.actorId ?? null,
      // What names a Make a Connection's NPC — a pending draft's included
      // (issue #325 W23); the player's line says which when the narration
      // names several (issue #347 AB10).
      namingText:           `${resolution?.playerNarration ?? ''}\n${narrationText ?? ''}`,
      lineText:             resolution?.playerNarration ?? '',
      // …and, when the line does not, the interpreter's target for the move
      // (KNOWN-NPC-CONNECTION-NO-TARGET).
      targetName:           typeof options.moveTarget === 'string' ? options.moveTarget : null,
      // The narration alone: a round's hit is named by its own line and this,
      // not another player's line (ROUND-CONNECTION-OTHER-LINE-CANDIDATE).
      narrationText:        narrationText ?? '',
      narrationId,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | runDiscoveryDetection failed:`, err);
  }
}

/**
 * Post a styled narration chat card.
 * Separated from narrateResolution so integration tests can call it directly.
 *
 * @param {string} narrationText
 * @param {Object} resolution     — MoveResolutionSchema
 * @param {Object} [campaignState] — CampaignStateSchema (provides session fields)
 * @returns {Promise<ChatMessage>}
 */
export async function postNarrationCard(narrationText, resolution, campaignState, options = {}) {
  const matchedEntityIds = Array.isArray(options.matchedEntityIds) ? options.matchedEntityIds : [];
  const playerText = typeof options.playerText === 'string' ? options.playerText.trim() : '';
  const playerName = typeof options.playerName === 'string' && options.playerName.trim() ? options.playerName.trim() : null;
  const narrationId = typeof options.narrationId === 'string' && options.narrationId ? options.narrationId : null;
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${proseToHtml(narrationText)}</div>
        <div class="sf-narration-footer">
          <button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden>
            <i class="fas fa-play"></i> Play
          </button>
          <button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden>
            <i class="fas fa-stop"></i> Stop
          </button>
        </div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:     true,
        narrationCard:    true,                              // kept for backwards compat
        narrationText:    narrationText,
        sessionId:        campaignState?.currentSessionId ?? null,
        sessionNumber:    campaignState?.sessionNumber     ?? null,
        moveId:           resolution?.moveId               ?? null,
        outcome:          resolution?.outcome              ?? null,
        // Read by postSessionRecap's "A match was rolled" line, which had no
        // producer until the 2026-10 test-infrastructure audit (#282).
        isMatch:          resolution?.isMatch === true,
        resolutionId:     resolution?._id                  ?? '',
        matchedEntityIds,
        // The line the player wrote and who wrote it — read back with the
        // prose by the ring and the rolling summary (ringEntryText).
        playerText,
        playerName,
        // Links the card to the ledger entries its sidecar wrote, which an
        // X-Card on it retracts (issue #321 U07).
        narrationId,
        // The shape this beat was written in: the next beat takes the one
        // after it (beatVariety — issue #364 BEAT-SHAPE-AFTER-DELETED-CARD).
        ...beatShapeFlag(options.beatShape),
        // A Burn Momentum / Improve Result re-narration: the resolution it
        // upgraded, whose struck narrations an X-Card on this card takes too
        // (issue #347 D2; xCardedNarrationCards).
        ...(typeof resolution?.upgradeOf === 'string' && resolution.upgradeOf ? { upgradeOf: resolution.upgradeOf } : {}),
        timestamp:        new Date().toISOString(),
      },
    },
  });
}

/**
 * The line a player wrote for this move — '' when the resolution's
 * playerNarration is not one: the marker a Burn Momentum / Improve Result
 * re-narration carries, or the one a Sojourn miss resolved as a strong hit
 * carries ('resolved' — moves/sojournNeed.js). What the narration card keeps
 * as the player's line (B5), and what the Chronicle scribe reads with the
 * prose (issue #374 A2).
 */
function writtenLine(resolution) {
  return ['burn', 'improve', 'resolved'].includes(resolution?.inputMethod) ? '' : (resolution?.playerNarration ?? '');
}

/**
 * Retrieve the last N narration cards from the current session — each the
 * player's line that prompted it, then the narrator's prose (ringEntryText).
 * Reads from chat history — not from the chronicle — to reflect the immediate scene.
 *
 * @param {string} sessionId
 * @param {number} [limit=3]
 * @returns {string}
 */
export function getRecentNarrationContext(sessionId, limit = 3) {
  try {
    return sessionNarratorCards(sessionId)
      .slice(-limit)
      .map(ringEntryText)
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: getRecentNarrationContext failed:`, err);
    return '';
  }
}

/** What heads a cutaway's entry in the ring and the summary's source (ringEntryText, issue #381). */
const CUTAWAY_LINE = 'CUTAWAY — the table saw this; the characters did not, and know nothing of it:';

/** How many cards the last narration the table read is told in. */
const LAST_STORY_CARDS = 2;
/** …and the most of it told, the newest kept. */
const LAST_STORY_MAX_CHARS = 2400;

/**
 * The last narration the table read, word for word (issue #381 D2): the
 * newest story card in the chat, and the one before it of the same session —
 * each the player's line that prompted it, then the prose, as the ring tells
 * a card (ringEntryText) and by the ring's own rule for what is in memory
 * (inNarratorMemory: nothing the X-Card removed, an upgrade struck or a
 * fallback card stands for). A session set-piece is no part of it — an
 * opening, a closing cutaway, a spotlight (`sessionVignetteCard`): a cutaway
 * is its session's newest card and is not where the characters are — nor is a
 * clock's vignette, which is where a threat stands. Told to a session's
 * opening scene as where the last session stopped: the session summary is "a
 * droppable convenience, not a fact store" (invariant 8) — it can be off,
 * late or wrong — and this is read from the cards, the ring's own source, so
 * it adds no store. Null with no such card.
 *
 * @param {number} [limit]
 * @returns {{ sessionId: string, text: string }|null}
 */
export function getLastStoryNarration(limit = LAST_STORY_CARDS) {
  try {
    const story = (m) => {
      const f = m?.flags?.[MODULE_ID];
      return !!f?.narratorCard && !f.sessionVignetteCard && !f.clockVignetteCard
        && typeof f.sessionId === 'string' && !!f.sessionId && inNarratorMemory(m, f.sessionId);
    };
    const all = game.messages?.contents ?? [];
    let newest = null;
    for (let i = all.length - 1; i >= 0 && !newest; i -= 1) if (story(all[i])) newest = all[i];
    const sessionId = newest?.flags?.[MODULE_ID]?.sessionId ?? null;
    if (!sessionId) return null;
    const whole = sessionNarratorCards(sessionId).filter(story).slice(-Math.max(1, limit))
      .map(ringEntryText).filter(Boolean).join('\n\n');
    if (!whole) return null;
    const text = whole.length <= LAST_STORY_MAX_CHARS ? whole : `…${whole.slice(-LAST_STORY_MAX_CHARS)}`;
    return { sessionId, text };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: getLastStoryNarration failed:`, err);
    return null;
  }
}

/** How many recent cards the move interpreter and the pacing classifier read. */
const READING_SCENE_CARDS = 3;
/** …and the most of them they read, the newest kept. */
export const READING_SCENE_MAX_CHARS = 2400;

/**
 * The recent scene the move interpreter and the pacing classifier read a line
 * against (alpha 23 playtest): the last few ring entries — each the player's
 * line, then the narrator's prose — with the newest kept when they run long.
 * A line like "we're on our way" or "set a course" means nothing without the
 * destination the characters were just discussing: both read the line alone
 * (the classifier a one-line scene frame), so travel to an NPC's coordinates
 * was neither offered a move nor given its destination.
 *
 * @param {string|null} sessionId
 * @returns {string} '' when there is none
 */
export function getRecentSceneForReading(sessionId) {
  if (!sessionId) return '';
  const text = getRecentNarrationContext(sessionId, READING_SCENE_CARDS);
  if (text.length <= READING_SCENE_MAX_CHARS) return text;
  const tail = text.slice(-READING_SCENE_MAX_CHARS);
  const cut  = tail.indexOf('\n\n');
  return `…${cut >= 0 && cut < tail.length / 2 ? tail.slice(cut + 2) : tail}`;
}

/**
 * How many recent cards a MOVE narration's user message carries (issue #286
 * B1: it carried none, so for the first 30 cards of a session a move was
 * narrated from the ledger alone). A few, not the paced path's full ring:
 * this input is uncached and every move pays for it. Bounded by
 * `narratorContextCards` so a lowered ring lowers this too.
 */
const MOVE_RING_CARDS = 4;

/**
 * One ring entry as text: the line the player wrote that prompted the card,
 * when it carries one, then the narrator's prose (issue #286 B5: what a player
 * wrote — "I give him my father's compass" — survived only if the narrator
 * happened to repeat it). Shared by the ring and the rolling summary's source.
 *
 * @param {Object} message — a narrator-card ChatMessage
 * @returns {string}
 */
function ringEntryText(message) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  const prose = typeof f.narrationText === 'string' ? f.narrationText.trim() : '';
  if (!prose) return '';
  // A spotlight vignette is a cutaway the characters are not in (issue #381
  // D3): its entry says so, so the beats after it — the ring, the session
  // summary's source — do not have them know it.
  if (f.sessionVignetteCard === true && f.vignetteKind === 'spotlight_begin') return `${CUTAWAY_LINE}\n${prose}`;
  // A Batch Mode round's card (issue #340): one line for each player who
  // acted, in the round's order, then the prose.
  if (Array.isArray(f.roundEntries) && f.roundEntries.length) {
    const lines = f.roundEntries.map(e => {
      const said = sanitizePlayerText(String(e?.playerText ?? ''));
      if (!said) return null;
      const who = typeof e?.playerName === 'string' && e.playerName.trim() ? e.playerName.trim() : 'Player';
      return `PLAYER — ${who} wrote: "${said}"`;
    }).filter(Boolean);
    return [...lines, prose].join('\n');
  }
  const said  = sanitizePlayerText(String(f.playerText ?? f.sceneQuestion ?? ''));
  if (!said) return prose;
  const who  = typeof f.playerName === 'string' && f.playerName.trim() ? f.playerName.trim() : 'Player';
  const verb = f.sceneResponse ? 'asked' : 'wrote';
  return `PLAYER — ${who} ${verb}: "${said}"\n${prose}`;
}

/**
 * All narrator-prose cards for a session, oldest → newest. The single source
 * both the recent-narration ring (last N) and the rolling session summary
 * (full feed) read from, so the flag-family contract + defensive excludes are
 * defined once. Audited consumer of `narratorCard` (narrator-memory
 * architecture §2) — added with the rolling session summary.
 *
 * @param {string} sessionId
 * @param {{ forRecap?: boolean }} [opts] — `forRecap`: the session recap's
 *   reading, which keeps a fallback card and an X-carded narration (their
 *   moves happened) and leaves out the rest as the narrator's does
 * @returns {Array<Object>} ChatMessage documents
 */
function sessionNarratorCards(sessionId, { forRecap = false } = {}) {
  return (game.messages?.contents ?? []).filter(m => inNarratorMemory(m, sessionId, { forRecap }));
}

/**
 * Whether one chat message is a narrator card of the session that narrator
 * memory reads (sessionNarratorCards' rule, per message) — for a message still
 * in chat or one deleted since this page loaded (the X-Card's pick, issue
 * #347 AB22).
 *
 * @param {Object} m — a ChatMessage, or a deleted message's record
 * @param {string|null} sessionId
 * @param {{ forRecap?: boolean }} [opts]
 * @returns {boolean}
 */
function inNarratorMemory(m, sessionId, { forRecap = false } = {}) {
  const f = m?.flags?.[MODULE_ID];
  if (!f?.narratorCard) return false;
  if (f.sessionId !== sessionId) return false;
  // Defensive excludes — even if a future code path co-marks a system card
  // as a narratorCard, none of these should ever feed back into the
  // narrator's context. Avoids module-meta leaking into prose.
  if (f.worldJournalContradiction) return false;
  if (f.worldJournalCard) return false;
  if (f.recapCard) return false;
  if (f.draftEntityCard) return false;
  // Burn Momentum superseded this prose — the pre-burn outcome it describes
  // no longer happened, so it must not feed the ring or rolling summary (the
  // upgraded re-narration card carries the live prose). Playtest: the struck
  // pre-burn narration kept reaching the narrator.
  if (f.burnSuperseded) return false;
  // A fallback card ("<Move>: <Outcome> — narration unavailable.") is not
  // fiction (rules/narrator-memory.md invariant 1). It keeps the flag family
  // so the session recap still counts the move, but its line must not reach
  // the ring or the rolling summary, nor count as the session's first
  // narration — that cancelled the session's campaign recap (issue #321 U35).
  // The session recap (`forRecap`) keeps it: the move happened — the recap
  // counts it and quotes none of its line (issue #322 V05).
  if (f.narrationFallback && !forRecap) return false;
  // The X-Card removed this narration (issue #321 U07): the table took it
  // out of the story, so the narrator never reads it again. Its move still
  // happened: the recap counts it, without its prose.
  if (f.xCarded && !forRecap) return false;
  if (Array.isArray(m.whisper) && m.whisper.length) return false;
  return true;
}

/**
 * Whether a card is a narration of its own session that narrator memory
 * reads (inNarratorMemory, for the session the card names) — the cards the
 * session record takes as `narration` events as they post
 * (record/cards.js, issue #382), so the record and the narrator's memory keep
 * one rule for what a narration is.
 *
 * @param {Object} m — a ChatMessage
 * @returns {boolean}
 */
export function narratorMemoryCard(m) {
  const sessionId = m?.flags?.[MODULE_ID]?.sessionId;
  return typeof sessionId === 'string' && !!sessionId && inNarratorMemory(m, sessionId);
}

/**
 * Whether a narration card was posted late into an earlier session: filed
 * under a session other than the one current in `cs`, in that session's
 * narrator memory, and posted since the current session was minted
 * (`lastSessionTimestamp`, which only a mint stamps). A Batch Mode round
 * whose session is over can be narrated after the world load has minted the
 * next one, and its card keeps the round's own session
 * (ROUND-CARD-SESSION-ID-AFTER-MINT): the table is shown it in the current
 * session, so the readers that answer "the narration on screen" — the
 * X-Card's pick, its guard for a card that posts during the pause, the Round
 * window — reach it by this, where "the current session's cards" walked past
 * it (issue #364 XCARD-MISSES-LATE-ROUND-CARD). The store names the session a
 * mint replaced only when that session left a summary
 * (`previousSessionSummary`), so the mint's time is the test: no card filed
 * under another session and posted since can be anything else. The narrator's
 * ring and the rolling summary do not read it — the card is its own
 * session's story.
 *
 * @param {Object} m — a ChatMessage, or a deleted message's record
 * @param {Object|null} cs — campaignState (`currentSessionId`, `lastSessionTimestamp`)
 * @returns {boolean}
 */
export function narratedLateIntoEarlierSession(m, cs) {
  const current = cs?.currentSessionId ?? null;
  const own = m?.flags?.[MODULE_ID]?.sessionId ?? null;
  if (!current || !own || own === current) return false;
  const mintedAt = Date.parse(cs?.lastSessionTimestamp ?? '');
  const at = messageTime(m);
  if (!Number.isFinite(mintedAt) || at === null || at < mintedAt) return false;
  return inNarratorMemory(m, own);
}

// ---------------------------------------------------------------------------
// Deleted chat messages and the X-Card (issue #347 AB22)
// ---------------------------------------------------------------------------
//
// The X-Card answers the newest narration — read from chat. A GM who deletes
// a narration's chat card (the first thing a GM reaches for) took it out of
// chat but not out of the story: its truths, state, frame and capture stayed
// binding, and the next X-Card walked past the gap and removed the beat
// before it — a kept narration still on screen — instead. Each client keeps a
// record of the chat messages deleted since its page loaded, so the X-Card's
// pick reads the chat as it was (chatAsItWas): a deleted narration is still
// the newest one, and the X-Card removes it and what it wrote. A deletion
// alone changes nothing in narrator memory — Clear Chat Log deletes every
// card, and tidying chat must not rewrite the story. The page's record holds
// every deleted message; the canonical GM also keeps the newest deleted
// messages the pick reads — narration and X-Card cards, and the lines that end
// a beat, without their text — on campaignState (`deletedChatMessages`), so
// the pick survives a reload (issue #347 residual
// DELETED-NARRATION-MEMORY-PAGE-ONLY — a reload forgot them, and the X-Card
// answered the beat before again).

/** Deleted chat messages remembered, newest last. */
const DELETED_MESSAGE_CAP = 200;
const _deletedMessages = [];

/** Deleted chat messages kept on campaignState, newest last. */
const STORED_DELETED_CAP = 20;

// The module flags the X-Card's pick and removal read off a card, and the
// shape a beat's card was written in, which the next beat follows (`beatShape`
// — beatVariety, issue #364 BEAT-SHAPE-AFTER-DELETED-CARD) — all a stored
// record keeps (narrator memory never reads a deleted card's text).
const DELETED_RECORD_FLAGS = [
  'narratorCard', 'sessionId', 'narrationId', 'resolutionId', 'roundId', 'oracleCardId', 'upgradeOf',
  'supersededFor', 'burnSuperseded', 'xCarded', 'narrationFallback', 'worldJournalContradiction',
  'worldJournalCard', 'recapCard', 'draftEntityCard', 'bypassPacing', 'forcedMoveId', 'xcardCard',
  'xcardClearedCard', 'beatShape', 'timestamp',
];

/**
 * A deleted message's record as campaignState keeps it, or null for one the
 * pick passes over (this module's other cards). A narration or X-Card card
 * keeps the flags the pick and the removal read; a message that ends a beat —
 * a person's line or another module's (no flags of this module), a forced
 * move's post, a round's card — keeps what ends it. No text is kept.
 */
function storedDeletedRecord(record) {
  if (!record?.id) return null;
  const base = { id: record.id, timestamp: record.timestamp ?? null, deleted: true };
  const f = record.flags?.[MODULE_ID];
  if (!f) return { ...base, whisper: [], flags: {} };   // someone spoke
  if (!(f.narratorCard || f.xcardCard || f.xcardClearedCard || f.bypassPacing || f.forcedMoveId || f.roundId)) return null;
  const kept = {};
  for (const key of DELETED_RECORD_FLAGS) if (f[key] !== undefined) kept[key] = f[key];
  if (Array.isArray(f.roundEntries)) {
    kept.roundEntries = f.roundEntries.map(e => ({ resolutionId: e?.resolutionId ?? null })).filter(e => e.resolutionId);
  }
  return { ...base, whisper: record.whisper ?? [], flags: { [MODULE_ID]: kept } };
}

// Records waiting for the next write, by id, newest last — a Clear Chat Log
// deletes every card at once, and one write takes them all.
const _pendingStoredDeleted = new Map();
let _storedDeletedFlushQueued = false;

/**
 * Keep `record` on campaignState's `deletedChatMessages` (the newest
 * STORED_DELETED_CAP), or update the one there of its id. Canonical GM
 * (single emitter), on the client's campaignState write chain;
 * fire-and-forget, never throws.
 *
 * @param {Object} record — a deleted message's record
 */
function persistDeletedRecord(record) {
  const rec = storedDeletedRecord(record);
  if (!rec || !isCanonicalGM()) return;
  _pendingStoredDeleted.delete(rec.id);
  _pendingStoredDeleted.set(rec.id, rec);
  if (_storedDeletedFlushQueued) return;
  _storedDeletedFlushQueued = true;
  serialiseCampaignStateWrite(async () => {
    await Promise.resolve();             // a bulk deletion's other hooks come first
    _storedDeletedFlushQueued = false;   // a record deleted from here on queues the next write
    const pending = [..._pendingStoredDeleted.values()];
    _pendingStoredDeleted.clear();
    if (!pending.length) return;
    const latest = { ...(game.settings.get(MODULE_ID, 'campaignState') ?? {}) };
    const list = Array.isArray(latest.deletedChatMessages) ? latest.deletedChatMessages : [];
    const ids = new Set(pending.map(r => r.id));
    latest.deletedChatMessages = [...list.filter(d => !ids.has(d?.id)), ...pending].slice(-STORED_DELETED_CAP);
    await game.settings.set(MODULE_ID, 'campaignState', latest);
  }, 'deleted chat message').catch(err => {
    _storedDeletedFlushQueued = false;
    console.warn(`${MODULE_ID} | X-Card: a deleted chat message could not be kept for after a reload:`, err?.message ?? err);
  });
}

/** The deleted chat messages campaignState keeps (persistDeletedRecord), as the pick reads records. */
function storedDeletedMessages() {
  let list = null;
  try { list = game.settings.get(MODULE_ID, 'campaignState')?.deletedChatMessages ?? null; }
  catch { list = null; }
  return Array.isArray(list)
    ? list.filter(d => typeof d?.id === 'string' && d.id && d.flags && typeof d.flags === 'object')
    : [];
}

/**
 * Remember a deleted chat message as the X-Card's pick reads one: its id, its
 * time, its whisper and a copy of this module's flags (none for a person's
 * message — the walk's "someone spoke"). Never throws.
 *
 * @param {Object} message — the deleted ChatMessage
 */
function rememberDeletedMessage(message) {
  try {
    if (!message?.id || _deletedMessages.some(d => d.id === message.id)) return;
    const f = message.flags?.[MODULE_ID];
    _deletedMessages.push({
      id:        message.id,
      timestamp: messageTime(message),
      whisper:   Array.isArray(message.whisper) ? [...message.whisper] : [],
      flags:     f ? { [MODULE_ID]: foundry.utils.deepClone(f) } : {},
      deleted:   true,
    });
    if (_deletedMessages.length > DELETED_MESSAGE_CAP) _deletedMessages.splice(0, _deletedMessages.length - DELETED_MESSAGE_CAP);
    persistDeletedRecord(_deletedMessages[_deletedMessages.length - 1]);
  } catch (err) {
    console.debug(`${MODULE_ID} | X-Card: a deleted chat message could not be remembered:`, err?.message ?? err);
  }
}

/**
 * Keep the record of deleted chat messages the X-Card's pick reads (issue
 * #347 AB22). Every client: whichever GM is canonical when the X-Card is
 * played saw the deletion too.
 */
export function registerDeletedChatHook() {
  Hooks.on('deleteChatMessage', rememberDeletedMessage);
}

/** Test seam: forget the deleted messages remembered (a page load starts with none). */
export function _resetDeletedMessagesForTests() {
  _deletedMessages.length = 0;
  _pendingStoredDeleted.clear();
  _storedDeletedFlushQueued = false;
}

/**
 * The chat as it was: the messages still in chat, with those deleted since
 * this page loaded put back in their place by time. A message with no time
 * is never passed; a deleted one later than every timed message goes last.
 *
 * @returns {Array<Object>}
 */
function chatAsItWas() {
  const live = game.messages?.contents ?? [];
  // This page's record, then campaignState's — what a reload kept.
  const remembered = new Set(_deletedMessages.map(d => d.id));
  const ghosts = [..._deletedMessages, ...storedDeletedMessages().filter(d => !remembered.has(d.id))];
  if (!ghosts.length) return live;
  const liveIds = new Set(live.map(m => m?.id).filter(Boolean));
  const out = [...live];
  for (const ghost of ghosts) {
    if (liveIds.has(ghost.id)) continue;
    const at = ghost.timestamp;
    let idx = out.length;
    if (at !== null) {
      const later = out.findIndex(m => { const t = messageTime(m); return t !== null && t > at; });
      if (later >= 0) idx = later;
    }
    out.splice(idx, 0, ghost);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The X-Card and narrator memory (issue #321 U07)
// ---------------------------------------------------------------------------
//
// Full exclusion (decisions.md → "X-Card: anyone plays it, a GM resumes it"):
// the narration an X-Card answers leaves narrator memory — its cards are
// flagged `xCarded` (out of the ring, the rolling summary and the session
// recap's prose), the ledger entries its sidecar wrote are retracted, the
// oracle results it told leave RECENT ORACLE RESULTS (issue #345 AA01), a
// rolling summary that covered it loses its text, and the first narration
// after a GM resumes carries a redirect away from it.
//
// Which cards: the narration on screen when the card is played — the newest
// narrator card of the session still in narrator memory, with the narrator
// cards posted in the same beat: those after the last message someone sent
// (any chat message that is not one of this module's cards, or a forced
// move's post — the Roll button's re-post of the player's line) and at most
// XCARD_BEAT_WINDOW_MS older than it. An earlier X-Card's card, its "X-Card
// cleared" card, or a card an earlier X-Card removed bounds the beat; when one
// of those is newer than any narration, nothing was narrated since and the
// X-Card removes nothing more.
//
// A narration posted since the session was minted but filed under the session
// before it — a Batch Mode round narrated late (narratedLateIntoEarlierSession)
// — is on screen like any other: when it is the newest narration, the X-Card
// answers it, with the late narrations of its session posted in its beat. A
// beat is one session's: a narration of the current session bounds a late
// beat, and a late narration is passed over by a current one's (issue #364
// XCARD-MISSES-LATE-ROUND-CARD — the pick took the current session's cards
// alone, so it removed nothing, or an older narration instead).

/** How much older than the newest X-carded card a card of the same beat may be. */
const XCARD_BEAT_WINDOW_MS = 2 * 60 * 1000;

/** X-carded narration ids kept on campaignState, newest last (the merge and relay checks read them). */
const XCARD_NARRATION_ID_CAP = 50;

/** A ChatMessage's creation time (ms), or null when it carries none. */
function messageTime(message) {
  const t = Number(message?.timestamp);
  if (Number.isFinite(t) && t > 0) return t;
  const iso = Date.parse(message?.flags?.[MODULE_ID]?.timestamp ?? '');
  return Number.isFinite(iso) ? iso : null;
}

/**
 * The narrator cards an X-Card played now removes, oldest first (the rule
 * above). Reads the chat as it was (chatAsItWas): a narration whose card a GM
 * deleted is still the newest narration, and is removed — returned as its
 * record (`deleted: true`), which flagXCardedCards passes over — never the
 * kept beat before it (issue #347 AB22).
 *
 * @param {string|null} sessionId — the current session
 * @param {Object|null} [cs] — the campaignState the card is played on: when
 *   its session was minted (`lastSessionTimestamp`), so a narration posted
 *   since into the session before it is reached; without it, the current
 *   session's cards alone
 * @returns {Array<Object>} ChatMessage documents, and deleted messages' records
 */
export function xCardedNarrationCards(sessionId, cs = null) {
  if (!sessionId) return [];
  const messages = chatAsItWas();
  const minted = { currentSessionId: sessionId, lastSessionTimestamp: cs?.lastSessionTimestamp ?? null };
  const isLate = (m) => narratedLateIntoEarlierSession(m, minted);
  const isBoundary = (f) => !!(f?.xcardCard || f?.xcardClearedCard);

  // The newest narration, unless an earlier X-Card already answered it.
  let newestIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const f = m?.flags?.[MODULE_ID];
    if (inNarratorMemory(m, sessionId) || isLate(m)) { newestIdx = i; break; }
    if (f?.xcardClearedCard || f?.xCarded) return [];   // nothing narrated since
    // anything else — this play's own X-Card card, a person's message, another card — is passed over
  }
  if (newestIdx < 0) return [];

  const newest   = messages[newestIdx];
  const newestAt = messageTime(newest);
  const newestRound = newest?.flags?.[MODULE_ID]?.roundId ?? null;
  // The beat is the newest narration's session's: the current one's, or — a
  // narration posted late into the session before — that session's late cards.
  const beatSession = newest?.flags?.[MODULE_ID]?.sessionId ?? null;
  const lateBeat = beatSession !== sessionId;
  const inMemory = { has: lateBeat
    ? (m) => isLate(m) && (m?.flags?.[MODULE_ID]?.sessionId ?? null) === beatSession
    : (m) => inNarratorMemory(m, sessionId) };
  const beat = [newest];
  for (let i = newestIdx - 1; i >= 0; i--) {
    const m = messages[i];
    const f = m?.flags?.[MODULE_ID];
    if (!f) break;                              // someone spoke: the beat began after it
    // A Batch Mode round's card is a beat of its own (issue #340): the walk
    // stops at a card of another round. Round submissions aren't chat
    // messages, so nothing else would end the beat between two rounds.
    if (f.roundId && f.roundId !== newestRound) break;
    // A forced move's post — the Roll button's re-post of the player's line,
    // a way-out / Battle / milestone / fulfil button, a token drag — is the
    // player acting: the beat began after it too (issue #326 W42 — the walk
    // passed it and took the paced narration before it).
    if (f.bypassPacing || f.forcedMoveId) break;
    if (isBoundary(f) || f.xCarded) break;      // an earlier X-Card answered what came before
    if (lateBeat && inNarratorMemory(m, sessionId)) break;   // the current session's narration: a late beat began after it
    if (!inMemory.has(m)) continue;             // one of this module's other cards
    const at = messageTime(m);
    if (newestAt !== null && at !== null && newestAt - at > XCARD_BEAT_WINDOW_MS) break;
    beat.unshift(m);
  }
  return withStruckByUpgrade(beat, messages, beatSession);
}

/**
 * The beat's cards with the narrations its own upgrade struck (issue #347
 * D2, the maintainer's option A). A Burn Momentum or Improve Result
 * re-narration names the resolution it upgraded (`upgradeOf`); the upgrade
 * struck that move's first narration (its `resolutionId`) and the trigger
 * vignette of a clock it rewound (`supersededFor`), each flagged
 * `burnSuperseded` — out of narrator memory, so the walk passes them, while
 * #338 D8 left their World Journal and tier records standing beside the
 * re-narration. The table's X-Card on the beat removes the beat it saw,
 * the struck version included: these join the cards it removes, so their
 * capture is undone and their facts blocked too. Oldest first, in chat order.
 *
 * @param {Object[]} beat — the cards the walk picked
 * @param {Object[]} messages — the chat as it was
 * @param {string} sessionId — the beat's session (its cards' own)
 * @returns {Object[]}
 */
function withStruckByUpgrade(beat, messages, sessionId) {
  const upgraded = new Set(beat.map(m => m?.flags?.[MODULE_ID]?.upgradeOf).filter(id => typeof id === 'string' && id));
  if (!upgraded.size) return beat;
  const picked = new Set(beat);
  const struck = messages.filter(m => {
    if (picked.has(m)) return false;
    const f = m?.flags?.[MODULE_ID];
    return f?.narratorCard === true && f.burnSuperseded === true && f.xCarded !== true
      && (f.sessionId ?? null) === sessionId
      && (upgraded.has(f.resolutionId) || upgraded.has(f.supersededFor));
  });
  if (!struck.length) return beat;
  const all = new Set([...struck, ...beat]);
  return messages.filter(m => all.has(m));
}

/**
 * Take the narration an X-Card answers out of narrator memory's stores on
 * `cs` — a copy of the stored campaignState that the caller (suppressScene,
 * on the canonical GM) writes in the same write as the pause. Synchronous: no
 * await between the caller's read and its write. Sets:
 *   - the ledger: what the X-carded narrations' sidecars wrote, retracted
 *     (retractNarrations — truths `retractedBy: "xcard"`, state removed, a
 *     frame they wrote cleared);
 *   - `xCardedNarrationIds`: their ids, so a stale writer's merge
 *     (mergeSceneLedgers) or a late relayed sidecar cannot bring them back;
 *   - `recentOracles`: the oracle results they told — an oracle follow-up's
 *     result card (its `oracleCardId`), a move narration's Pay the Price (its
 *     `resolutionId`, a round card's entries' too) — out of RECENT ORACLE
 *     RESULTS, which told every later narration the removed answer was
 *     established (issue #345 AA01);
 *   - `incitingIncident`: the campaign premise, when they include the
 *     inciting narration it was written from (XCARD-INCITING-PREMISE);
 *   - `sessionSummary`: its text dropped and a regen due, when it covered
 *     them (the summary is a droppable convenience; the next regen reads the
 *     remaining cards);
 *   - `xCardRedirect`: the redirect the first narration after a GM resumes
 *     carries — set on every play, X-carded cards or not.
 * The caller then flags the returned cards `xCarded` (flagXCardedCards).
 * `opts.cards` names the cards to remove instead of the pick: a narration
 * whose card posted after the pause (safety.js, XCARD-POST-RACE).
 *
 * @param {Object} cs — the copy to update (mutated; its ledger objects are replaced, never changed)
 * @param {{ cards?: Object[]|null }} [opts]
 * @returns {{ cards: Object[], retracted: Object[], sessionId: string|null }}
 *   the X-carded cards, the truths retracted, and the current session. The
 *   session summaries that told them are stale by the record's removal
 *   (record/summaryView.js — issue #382): never shown, made again.
 */
export function applyXCardToNarratorMemory(cs, { cards: given = null } = {}) {
  const sessionId = cs?.currentSessionId ?? null;
  // `cards`: a narration that posted after the pause (XCARD-POST-RACE) —
  // removed the same way, in place of the pick.
  const cards = Array.isArray(given) ? given.filter(Boolean) : xCardedNarrationCards(sessionId, cs);
  const ids = [...new Set(cards.map(m => m.flags?.[MODULE_ID]?.narrationId).filter(id => typeof id === 'string' && id))];

  const retracted = retractNarrations(cs, ids);
  if (ids.length) {
    const prior = Array.isArray(cs.xCardedNarrationIds) ? cs.xCardedNarrationIds : [];
    cs.xCardedNarrationIds = [...prior.filter(id => !ids.includes(id)), ...ids].slice(-XCARD_NARRATION_ID_CAP);
  }
  dropOracleResultsFor(cs, xCardedOracleResults(cards));
  dropXCardedPremise(cs, cards, ids);
  // The countdown clocks those narrations started (issue #353) go in the
  // same write: a clock is campaignState's, and this is the pause's write.
  if (ids.length && Array.isArray(cs.clocks) && cs.clocks.some(c => ids.includes(c?.narrationId))) {
    cs.clocks = cs.clocks.filter(c => !ids.includes(c?.narrationId));
  }
  // A plan's clock one of them paced — emptied, or retired after a last step,
  // when its beat played the step — is re-armed one short of full: the undo
  // puts the step back unplayed (undoNarrationEntries), and the next price
  // plays it (issue #362 AC33; the clock stayed empty or retired, and a last
  // step was never paced again). Theirs by its stamp, wherever a later price
  // has turned it since: asked whether it still stood as paced, a price paid
  // between a trigger vignette and this card left the clock where it was with
  // the step back unplayed (issue #364 PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE).
  // Only a clock whose plan is in play once they are taken back — the undo
  // of the plans runs after this write, so the plans are read as it will
  // leave them (hiddenPlansInPlayWithout): a clock retired after a last step
  // keeps its stamp when its plan is then retired or deleted, and ran again
  // with no plan behind it (issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES).
  if (ids.length && Array.isArray(cs.clocks) && cs.clocks.some(c => pacedByOneOf(c, ids))) {
    const plansInPlay = hiddenPlansInPlayWithout(ids);
    const theirs = (c) => pacedByOneOf(c, ids) && planInPlayFor(c, plansInPlay);
    if (cs.clocks.some(theirs)) cs.clocks = cs.clocks.map(c => (theirs(c) ? unpacedClock(c) : c));
  }

  cs.xCardRedirect = { sessionId, at: new Date().toISOString() };
  return { cards, retracted, sessionId };
}

/**
 * Take the campaign premise out of `cs` when the X-Card removed the inciting
 * narration it was written from (XCARD-INCITING-PREMISE). The premise
 * (`campaignState.incitingIncident`, runIncitingIncident) renders as
 * CAMPAIGN PREMISE — canon — in every narrator prompt, so its prose kept
 * telling the removed beat after its card, ledger entries, lore and capture
 * were gone. Found by the narration id it carries; a premise saved before it
 * carried one, by an X-carded inciting card of its session. Mutates `cs`.
 *
 * @param {Object} cs
 * @param {Object[]} cards — the X-carded cards
 * @param {string[]} ids — their narration ids
 * @returns {boolean} whether the premise was dropped
 */
function dropXCardedPremise(cs, cards, ids) {
  const premise = cs?.incitingIncident;
  if (!premise || typeof premise !== 'object') return false;
  const byId = typeof premise.narrationId === 'string' && premise.narrationId
    ? ids.includes(premise.narrationId)
    : (cards ?? []).some(m => {
      const f = m?.flags?.[MODULE_ID];
      return f?.incitingIncidentCard === true && (f.sessionId ?? null) === (premise.sessionId ?? null);
    });
  if (!byId) return false;
  cs.incitingIncident = null;
  return true;
}

/**
 * The oracle results the X-carded cards told, as dropOracleResultsFor takes
 * them: an oracle follow-up names its result card (`oracleCardId`); a move
 * narration, its move's resolution (`resolutionId` — the Pay the Price its
 * miss paid seeded it); a Batch Mode round card, each entry's.
 *
 * @param {Object[]} cards
 * @returns {{ cardIds: string[], resolutionIds: string[] }}
 */
function xCardedOracleResults(cards) {
  const cardIds = [];
  const resolutionIds = [];
  for (const m of cards ?? []) {
    const f = m?.flags?.[MODULE_ID] ?? {};
    if (f.oracleCardId) cardIds.push(f.oracleCardId);
    if (f.resolutionId) resolutionIds.push(f.resolutionId);
    for (const e of Array.isArray(f.roundEntries) ? f.roundEntries : []) {
      if (e?.resolutionId) resolutionIds.push(e.resolutionId);
    }
  }
  return { cardIds, resolutionIds };
}

/**
 * Flag the X-carded cards `xCarded` (sessionNarratorCards leaves them out).
 * GM-authored update on the canonical GM; a card that cannot be updated is
 * logged and skipped.
 *
 * @param {Object[]} cards
 * @returns {Promise<number>} cards flagged
 */
export async function flagXCardedCards(cards) {
  let flagged = 0;
  for (const message of cards ?? []) {
    if (message?.deleted) {
      // A deleted card's record (issue #347 AB22): nothing in chat to flag —
      // the record itself is marked, here and on campaignState, so it reads
      // as removed, as a removed card in chat does (issue #347 residual
      // DELETED-NARRATION-MEMORY-PAGE-ONLY).
      const f = message.flags?.[MODULE_ID];
      if (f) f.xCarded = true;
      const mine = _deletedMessages.find(d => d.id === message.id);
      if (mine?.flags?.[MODULE_ID]) mine.flags[MODULE_ID].xCarded = true;
      persistDeletedRecord(message);
      continue;
    }
    try {
      await message.update({ [`flags.${MODULE_ID}.xCarded`]: true });
      flagged += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: could not flag narration card ${message?.id} removed:`, err?.message ?? err);
    }
  }
  return flagged;
}

/** True when an X-Card redirect is pending for this session (buildNarratorExtras). */
function xCardRedirectPending(cs) {
  const redirect = cs?.xCardRedirect;
  if (!redirect || typeof redirect !== 'object') return false;
  return !redirect.sessionId || redirect.sessionId === (cs.currentSessionId ?? null);
}

/**
 * Clear the X-Card redirect once the first narration after a GM resumed has
 * posted (issue #321 U07). Every narration built after the resume carried it
 * — buildNarratorExtras reads it from the store, and while the X-Card is
 * active every narrator path stands down — so the first narrator card posted
 * with the X-Card lifted is one that delivered it. A fallback card (nothing
 * was delivered), a published Private Channel reflection (not a narration),
 * an `@scene` answer (not one either: it moves nothing, so it steers nothing
 * away — known-issues SCENE-ANSWER-NOT-A-CAMERA) and an X-carded card do not
 * count. On the canonical GM — a single-emitter
 * world write onto the latest store, read at its turn on the client's
 * campaignState write chain: the Batch Mode round's lock release, read inside
 * this clear's round trip right after its card, wrote the redirect back, and
 * every later round carried it (CAMPSTATE-CHAIN-PARTIAL).
 */
export function registerXCardRedirectHook() {
  Hooks.on('createChatMessage', (message) => {
    if (!isCanonicalGM()) return;
    const f = message?.flags?.[MODULE_ID];
    if (!f?.narratorCard || !f.narrationText) return;
    if (f.narrationFallback || f.publishedReflection || f.sceneResponse || f.xCarded) return;
    clearXCardRedirect().catch(err =>
      console.warn(`${MODULE_ID} | X-Card: clearing the redirect failed:`, err?.message ?? err));
  });
}

function clearXCardRedirect() {
  return serialiseCampaignStateWrite(async () => {
    const latest = storedCampaignState();
    if (!latest?.xCardRedirect || latest.xCardActive) return;
    await game.settings.set(MODULE_ID, 'campaignState', { ...latest, xCardRedirect: null });
  }, 'X-Card redirect clear');
}

/**
 * The session `!recap session N` names: the current one when N is its number,
 * else the session whose narrator cards carry N (`sessionNumber`, stamped on
 * every narrator card), else last session's summary when it is N's. The
 * number was matched and dropped, so every `!recap session N` recapped the
 * current session under its own number (issue #322 V05).
 *
 * @param {Object} campaignState
 * @param {number} sessionNumber
 * @returns {{ sessionId: string|null, sessionNumber: number }} a null id when
 *   no record of session N is left
 */
function recapSessionFor(campaignState, sessionNumber) {
  if (Number(campaignState?.sessionNumber) === sessionNumber) {
    return { sessionId: campaignState?.currentSessionId ?? null, sessionNumber };
  }
  const card = (game.messages?.contents ?? []).findLast?.(m => {
    const f = m.flags?.[MODULE_ID];
    return f?.narratorCard && Number(f.sessionNumber) === sessionNumber && typeof f.sessionId === 'string' && f.sessionId;
  });
  if (card) return { sessionId: card.flags[MODULE_ID].sessionId, sessionNumber };
  // The session record numbers every session a table began (issue #382).
  const recorded = sessionIdOfNumber(sessionNumber);
  if (recorded) return { sessionId: recorded, sessionNumber };
  return { sessionId: null, sessionNumber };
}

/**
 * Assemble and post a session recap card from chat history.
 * No Claude API call — reads narrator card flags from game.messages.
 *
 * The cards are the session's narrator cards as the narrator reads them
 * (sessionNarratorCards — a burned move's superseded prose left out), plus
 * its fallback and X-carded cards, whose moves happened: they count, and none
 * of their lines is quoted. "Moves resolved" counts the cards that carry a
 * move — paced prose, an @scene answer or a vignette is part of the story,
 * not a move. The recap read every narrator card itself: a burned Strike
 * showed as "Strike → Miss" beside "Strike → Strong Hit", and every card
 * counted as a move (issue #322 V05).
 *
 * @param {Object} campaignState
 * @param {string|null} sessionId  — null = current session (or the one
 *   `opts.sessionNumber` names)
 * @param {{ sessionNumber?: number|null }} [opts] — `!recap session N`'s N
 * @returns {Promise<void>}
 */
export async function postSessionRecap(campaignState, sessionId = null, { sessionNumber = null } = {}) {
  const asked   = Number.isInteger(sessionNumber) && sessionNumber > 0 ? sessionNumber : null;
  const target  = sessionId
    ? { sessionId, sessionNumber: null }
    : asked !== null
      ? recapSessionFor(campaignState, asked)
      : { sessionId: campaignState?.currentSessionId ?? null, sessionNumber: campaignState?.sessionNumber ?? null };
  const targetId   = target.sessionId;
  const sessionNum = target.sessionNumber
    ?? (targetId && targetId === campaignState?.currentSessionId ? campaignState?.sessionNumber ?? null : null);

  const messages = asked !== null && !targetId ? [] : sessionNarratorCards(targetId, { forRecap: true });

  if (!messages.length) {
    return ChatMessage.create({
      content: `
        <div class="sf-recap-session-card">
          <div class="sf-recap-label">◈ Session Recap</div>
          <div class="sf-recap-empty">${asked !== null ? `No narrated moves found for session ${asked}.` : 'No narrated moves found for this session.'}</div>
        </div>
      `.trim(),
      flags: {
        [MODULE_ID]: {
          recapCard:    true,
          recapType:    'session',
          recapEmpty:   true,
          ...(sessionNum != null ? { sessionNumber: sessionNum } : {}),
        },
      },
    });
  }

  const outcomes = { strong_hit: 0, weak_hit: 0, miss: 0 };
  const moveLines = [];
  let matchContext = null;
  let totalMoves = 0;

  for (const msg of messages) {
    const f = msg.flags[MODULE_ID];
    // A Batch Mode round's card (issue #340) counts each entry's move,
    // outcome and match; its prose's first sentence is quoted once.
    if (Array.isArray(f.roundEntries) && f.roundEntries.length) {
      const text = stripMarkup((f.xCarded || f.narrationFallback) ? '' : (f.narrationText ?? ''));
      const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? '';
      const moves = f.roundEntries.filter(e => e?.moveId);
      for (const e of moves) {
        totalMoves++;
        if (e.outcome && outcomes[e.outcome] !== undefined) outcomes[e.outcome]++;
        if (e.isMatch) matchContext = moveDisplayName(e.moveId);
      }
      const rolls = moves.map(e => `${moveDisplayName(e.moveId)}${e.outcome ? ` → ${e.outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : ''}`);
      const label = `Round${f.roundNumber ? ` ${f.roundNumber}` : ''}`;
      if (rolls.length || firstSentence) {
        moveLines.push(`• ${label}${rolls.length ? `: ${rolls.join('; ')}` : ''}${firstSentence ? ` — ${escapeHtml(firstSentence)}` : ''}`);
      }
      continue;
    }
    const moveName = f.moveId ? moveDisplayName(f.moveId) : null;
    const outcome  = f.outcome ?? null;
    // A narration the X-Card removed (issue #321 U07) and a fallback card
    // ("narration unavailable") count their move; no line of theirs is quoted.
    // The NPC voice markup the audio keeps in `narrationText` is stripped, as
    // on every fiction card (issue #336 Y29 — the recap showed `&lt;npc&gt;`).
    const text     = stripMarkup((f.xCarded || f.narrationFallback) ? '' : (f.narrationText ?? ''));
    const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? '';

    if (moveName) totalMoves++;
    if (moveName && outcome && outcomes[outcome] !== undefined) outcomes[outcome]++;
    if (f.isMatch) matchContext = moveName;

    if (moveName && outcome) {
      const outcomeLabel = outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      moveLines.push(`• ${moveName} → ${outcomeLabel}${firstSentence ? ': ' + escapeHtml(firstSentence) : ''}`);
    } else if (moveName) {
      moveLines.push(`• ${moveName}${firstSentence ? ': ' + escapeHtml(firstSentence) : ''}`);
    } else if (firstSentence) {
      moveLines.push(`• ${escapeHtml(firstSentence)}`);
    }
  }

  const summaryParts = [`${totalMoves} move${totalMoves !== 1 ? 's' : ''} resolved.`];
  if (outcomes.strong_hit > 0) summaryParts.push(`${outcomes.strong_hit} strong hit${outcomes.strong_hit !== 1 ? 's' : ''}.`);
  if (matchContext) summaryParts.push(`A match was rolled — ${matchContext}.`);

  const sessionLabel = sessionNum ? `Session ${sessionNum}` : 'Current Session';

  return ChatMessage.create({
    content: `
      <div class="sf-recap-session-card">
        <div class="sf-recap-label">◈ Session Recap</div>
        <div class="sf-recap-session-title">${sessionLabel} — ${new Date().toLocaleDateString()}</div>
        <div class="sf-recap-moves">${moveLines.join('<br>')}</div>
        <div class="sf-recap-summary">${summaryParts.join(' ')}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        recapCard:    true,
        recapType:    'session',
        sessionId:    targetId,
        sessionNumber: sessionNum,
      },
    },
  });
}

/**
 * Get the campaign recap text — from cache if valid, or generate via Claude.
 *
 * Its source is the session record (issue #382, slice 2 — record/recapView.js):
 * each session's turning points and the latest session in full, as facts;
 * WHERE THINGS STAND read live from the sheets and tracks; the players' own
 * Chronicle notes; a session from before the record as its Session Log story
 * and Chronicle entries had it. The reply is cited sentences: one that cites
 * nothing the source holds is dropped, a lasting beat no sentence cites sends
 * it back once, and a reply that is not the JSON asked for is asked for once
 * more before the recap that stood stays. The cache is valid while the source
 * hashes the same (campaignRecapCacheKey): a correction anywhere in the record
 * moves the hash. A stale cache is never returned: with no key to make it
 * again, the result is ''. A reply made across a correction is discarded.
 *
 * End a Session's, `!recap`'s and its Refresh's recap tell the session under
 * way in full. The recap a session's start is told (`sessionStart` — the
 * session's first narration, sessionStartRecap, and the world load's
 * "Previously On") leaves the session under way out, so the last session
 * before it is the one given in full (recapView.js recapSource).
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]
 * @param {boolean} [options.sessionStart] — the recap a session's start is told
 * @returns {Promise<string>}
 */
export async function getCampaignRecap(campaignState, options = {}) {
  const cache  = campaignState?.campaignRecapCache;
  const view   = { sessionStart: options.sessionStart === true };
  const source = await campaignRecapSourceOf(campaignState, { chronicle: await _recapChronicle(campaignState), ...view });

  if (!options.forceRefresh && isRecapCacheCurrent(cache, source)) {
    return cache.text;
  }

  const apiKey = getApiKey();
  if (!apiKey) return '';
  if (source.empty) return '';

  const settings    = getNarratorSettings();
  const character   = getActiveCharacter(campaignState);
  const extras      = await buildNarratorExtras('campaign_recap', campaignState, { character });
  // The record's lines are written with every changed name; a session from
  // before the record is given as it was written, with the names note it
  // gets wherever an old name reaches a prompt (issue #377 item 1).
  extras.nameChangeTexts = source.earlierTexts;
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character, '', extras);
  const userMessage  = buildCampaignRecapUserMessage(source);
  const ask = (message) => callNarratorAPI({
    label: 'getCampaignRecap', apiKey, systemPrompt, userMessage: message,
    model: settings.narrationModel, maxTokens: maxTokensWithSidecar(16000),
  });

  try {
    let cited = citedRecap(await ask(userMessage), source);
    if (!cited.ok) {
      cited = citedRecap(await ask(`${userMessage}\n\n${recapReplyAgain()}`), source);
    } else if (cited.missing.length) {
      const again = citedRecap(await ask(`${userMessage}\n\n${recapLastingUntold(cited.missing)}`), source);
      if (again.ok && again.paragraphs.length) cited = again;
    }
    // Fail-open: the recap that stood stays — while it is still current.
    if (!cited.ok || !cited.paragraphs.length) return isRecapCacheCurrent(cache, source) ? cache.text : '';
    const text = recapText(cited.paragraphs, source);
    // A correction landed while the call was out: the reply retells a record that no longer stands.
    const now = await campaignRecapSourceOf(campaignState, { chronicle: await _recapChronicle(campaignState), ...view });
    if (now.hash !== source.hash) return '';

    // Written on a copy of the latest store: `get` hands back the cached
    // value, and a refused write left the GM's cache holding a recap the
    // world lacked — served as current on this client alone (issue #331
    // X25). One emitter: the canonical GM. Read at its turn on the client's
    // campaignState write chain (CAMPSTATE-CHAIN-REST).
    if (text && isCanonicalGM()) {
      await serialiseCampaignStateWrite(() => {
        const cs = { ...(game.settings.get(MODULE_ID, 'campaignState') ?? campaignState) };
        cs.campaignRecapCache = {
          text,
          // UNWIRED: the playtest runner's recap review (each sentence beside
          // the beats it cites — issue #382 design 11.4) is its reader; that
          // runner change is outside this module (known-issues RECAP-CITES-UNREAD).
          cites:       cited.paragraphs.map(p => p.map(sentence => sentence.because)),
          generatedAt: new Date().toISOString(),
          sourceHash:  source.hash,       // the record it was made from
        };
        return game.settings.set(MODULE_ID, 'campaignState', cs);
      }, 'campaign recap cache');
    }

    return text;
  } catch (err) {
    console.error(`${MODULE_ID} | getCampaignRecap failed:`, err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Rolling session summary (narrator-memory architecture §8.6)
//
// A trailing, session-scoped prose "story so far" that bridges the gap the
// verbatim ring leaves: after the first card of a session the ring shows only
// the last N cards, so the narrative ARC of everything older survives only as
// discrete ledger facts. This maintains a compressed summary regenerated from
// SOURCE (all of the session's narrator cards — never summary-of-summary) on a
// debounce of ~1.5×N aged-out cards, runs the whole session, and is written to
// the World Journal Session Log at End Session for subsequent use. The §8.6
// escalation, taken with debounce answering the original cost objection (see
// decisions.md → "Rolling session summary").
// ---------------------------------------------------------------------------

const ROLLING_SUMMARY_MODEL     = 'claude-haiku-5-5';
// The summary is asked for 4–8 sentences, each with the beats it tells (a JSON
// list — issue #382). A reply cut off at its cap is not JSON, and is asked for
// once more; the cap leaves room above what a session's list runs to.
const ROLLING_SUMMARY_MAX_TOK   = 1200;
const ROLLING_SUMMARY_DEBOUNCE  = 1.5;

/**
 * Debounce threshold — how many new beats the record must hold beyond a
 * session's summary before it is made again, derived from the ring depth:
 * K = round(1.5 × N), floor 1. Because 1.5 × N always exceeds N, a summary
 * only ever materialises once there is a tail beyond the verbatim ring.
 *
 * @param {number} ringDepth — `narratorContextCards`
 * @returns {number}
 */
export function rollingSummaryThreshold(ringDepth) {
  const n = Number(ringDepth);
  const base = (!Number.isFinite(n) || n < 1) ? 3 : n;
  return Math.max(1, Math.round(ROLLING_SUMMARY_DEBOUNCE * base));
}

function rollingSummaryEnabled() {
  try { return game.settings.get(MODULE_ID, 'narratorSessionSummary') ?? true; }
  catch { return true; }
}

/**
 * Make (and return) a session's summary — a view of the session record
 * (record/summaryView.js, issue #382 slice 3). Its source is the session read
 * with the table's corrections: numbered beats — the facts, and TOLD AS the
 * narrator's prose — the questions asked, what the table struck. The reply is
 * cited sentences: one citing no beat it was sent is dropped, a lasting beat
 * none tells sends it back once, and the text kept has every changed name
 * written as the new one. Kept on the session's page
 * (`sessionRecord.views.summary`), valid while the span it was made from
 * reads the same: a correction makes it stale — never shown, made again here.
 *
 * Debounced: made only once the record holds K beats beyond it
 * (`rollingSummaryThreshold`) — every beat, for a summary that is stale or
 * not made yet; `forceRefresh` makes it whenever the record holds more than
 * it tells (End a Session, a closing session's mint, an earlier session's
 * catch-up). On the canonical GM the
 * view is stored; a keyed player's client at a table whose GMs hold no key
 * sends it to the GM (`relay`, SUMMARY-KEYLESS-GM), who stores it only when
 * its own read of the span gives the same hash. A reply made across a
 * correction is discarded. Fail-open: an error returns what stood.
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string} [options.sessionId] — default: the current session
 * @param {boolean} [options.forceRefresh] — make it whenever the record holds more than it tells
 * @param {boolean} [options.relay] — made on a player's key, for the GM to store
 * @returns {Promise<string>}
 */
export async function getRollingSessionSummary(campaignState, options = {}) {
  if (!rollingSummaryEnabled()) return '';
  const sessionId = options.sessionId ?? campaignState?.currentSessionId ?? null;
  if (!sessionId) return '';
  // The card that asked for this is on the record once its own write lands.
  await settledWithin(recordSettled(), WORLD_WRITE_WAIT_MS, 'session record');

  const state = summaryState(sessionId);
  const shown = state.valid ? state.view.text.trim() : '';
  if (state.source.empty) return shown;
  // Due: forced, whenever the record holds more than the summary tells (or it
  // is stale, or there is none); else once K beats wait beyond it — a stale
  // summary or none counts every beat — so a summary only ever materialises
  // once there is a tail beyond the verbatim ring.
  const K = rollingSummaryThreshold(getNarratorContextCards());
  const due = options.forceRefresh
    ? (!state.valid || state.behind)
    : (state.valid ? state.behind && state.newBeats >= K : state.source.ids.length >= K);
  if (!due) return shown;

  const apiKey = getApiKey();
  if (!apiKey) return shown;

  const source  = state.source;
  const message = sessionSummaryUserMessage(source);
  const ask = (userMessage) => callNarratorAPI({
    label: 'getRollingSessionSummary', apiKey, systemPrompt: SESSION_SUMMARY_SYSTEM_PROMPT, userMessage,
    model: ROLLING_SUMMARY_MODEL, maxTokens: ROLLING_SUMMARY_MAX_TOK,
  });
  let cited;
  try {
    cited = citedRecap(await ask(message), source);
    if (!cited.ok) {
      cited = citedRecap(await ask(`${message}\n\n${summaryReplyAgain()}`), source);
    } else if (cited.missing.length) {
      const again = citedRecap(await ask(`${message}\n\n${summaryLastingUntold(cited.missing)}`), source);
      if (again.ok && again.paragraphs.length) cited = again;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the session summary could not be made:`, err?.message ?? err);
    return shown;
  }
  if (!cited?.ok || !cited.paragraphs.length) return shown;
  const text = recapText(cited.paragraphs, state.naming).trim();
  if (!text) return shown;

  // A correction landed while the call was out — an X-Card, a strike, a name
  // changed, an upgrade's supersede: the reply tells a record that no longer
  // stands, and is never stored.
  await settledWithin(recordSettled(), WORLD_WRITE_WAIT_MS, 'session record');
  if (summarySourceThrough(sessionId, source.through).hash !== source.hash) {
    console.debug(`${MODULE_ID} | narrator: the record changed while the session summary was being made — it is discarded.`);
    return '';
  }
  const view = {
    text,
    cites:      cited.paragraphs.flat().map(s => s.because),
    through:    source.through,
    sourceHash: source.hash,
    madeAt:     Date.now(),
  };

  if (options.relay === true) {
    await relaySessionSummary(sessionId, view);
    return text;
  }
  if (isCanonicalGM()) {
    // A summary made meanwhile from more of the session stands.
    const now = summaryState(sessionId);
    if (now.valid && Number(now.view.through) > view.through) return now.view.text.trim();
    const write = writeRecordView(sessionId, 'summary', view);
    if (!await settledWithin(write, WORLD_WRITE_WAIT_MS, 'session summary write')) {
      console.warn(`${MODULE_ID} | narrator: the session summary's write was not answered — it may not be saved.`);
    } else if (await write) {
      renderSessionLog(sessionId).catch(() => {});
    }
  }
  return text;
}

/**
 * The current session's summary (STORY SO FAR), or '' — the stored view while
 * it stands (record/summaryView.js). No API call.
 *
 * @param {Object} campaignState
 * @returns {string}
 */
function cachedRollingSessionSummary(campaignState) {
  if (!rollingSummaryEnabled()) return '';
  return sessionSummaryText(campaignState?.currentSessionId ?? null);
}

let _summaryRefresh = null;
let _summaryRefreshAgain = false;
// When the refresh in flight began: one older than SUMMARY_REFRESH_WAIT_MS
// is passed, not joined (issue #347 AB05).
let _summaryRefreshStartedAt = 0;

/**
 * How long a refresh may run before the next card starts its own — two
 * bounded Claude calls and a bounded write, with headroom. Only a refresh
 * that never settles is passed.
 */
const SUMMARY_REFRESH_WAIT_MS = 5 * 60_000;

/**
 * Make the session summary again after each narrator card posts, on the
 * canonical GM — off the narration's critical path (issue #286 B7). Debounced
 * in getRollingSessionSummary; this only moves when it runs. One refresh at a
 * time: a card that posts while one is running runs it once more afterwards
 * (a no-op below the debounce). Released in a `finally`, so a failed refresh
 * never wedges it. An earlier session's summary that is stale or behind —
 * an X-Card or a strike since, a Batch Mode round narrated after its session
 * closed — is made again too (refreshStaleSummaries).
 */
export function registerRollingSummaryRefreshHook() {
  Hooks.on('createChatMessage', (message) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.narratorCard || !f.narrationText) return;
    if (!isCanonicalGM()) {
      // A table whose GMs hold no Claude key: the canonical GM can make no
      // summary, so narration on a player's key had no STORY SO FAR. The
      // keyed client whose card this is makes it and sends it to the GM to
      // store (SUMMARY-KEYLESS-GM) — one client per card, its author.
      if (summaryFallsToThisClient(message)) refreshRollingSessionSummary({ relay: true });
      return;
    }
    refreshRollingSessionSummary();
    refreshStaleSummaries();
  });
}

/**
 * Whether this client makes the session summary for a narrator card the
 * canonical GM cannot (SUMMARY-KEYLESS-GM): it wrote the card, it holds a
 * Claude key, a GM is connected to store it, and no connected GM holds a key
 * (one that does makes its own — isCanonicalGM prefers it).
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
function summaryFallsToThisClient(message) {
  const me = game.user?.id ?? null;
  const author = message?.author?.id ?? message?._source?.author ?? null;
  if (!me || author !== me || !getApiKey()) return false;
  try {
    return Array.from(game.users ?? []).some(u => u?.isGM && u?.active) && !hasKeyedActiveGM();
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: keyed-GM lookup failed — no relayed summary:`, err?.message ?? err);
    return false;
  }
}

/** The longest session summary a client may relay (4-8 sentences, with headroom). */
const RELAYED_SUMMARY_MAX_CHARS = 6000;

/**
 * Send a session summary made on this client's key to the canonical GM (GM
 * relay `"narrator.summary"`), with the span it was made from — the GM
 * stores it only while its own read of that span hashes the same.
 * Fire-and-forget; a refusal is logged.
 *
 * @param {string} sessionId
 * @param {{ text: string, cites: string[][], through: number, sourceHash: string }} view
 * @returns {Promise<void>}
 */
async function relaySessionSummary(sessionId, view) {
  try {
    const { requestGmAction } = await import('../multiplayer/gmRelay.js');
    await requestGmAction('narrator.summary', {
      sessionId, text: view.text, cites: view.cites, through: view.through, sourceHash: view.sourceHash,
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the session summary could not be sent to the GM:`, err?.message ?? err);
  }
}

/**
 * GM-relay handler for `"narrator.summary"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js): store a session summary a keyed player's
 * client made at a table whose GMs hold no key (SUMMARY-KEYLESS-GM). Stored
 * only when the GM's own read of the span it names (`through`) gives the hash
 * it was made from — a correction since, an X-Card among them, and it is
 * refused — and it tells more of the session than the summary that stands. A
 * GM with a key of its own makes its own summary and ignores relayed ones.
 * Bounded: it crossed the socket from a client.
 *
 * @param {{ sessionId?: string, text?: string, cites?: Array, through?: number, sourceHash?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ stored: boolean, reason?: string }>}
 */
export async function applyRelayedSessionSummary(payload = {}, _ctx = {}) {
  if (!rollingSummaryEnabled()) return { stored: false, reason: 'disabled' };
  if (getApiKey()) return { stored: false, reason: 'keyed-gm' };
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
  const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, RELAYED_SUMMARY_MAX_CHARS) : '';
  const through = Math.floor(Number(payload.through));
  const sourceHash = typeof payload.sourceHash === 'string' && /^[0-9a-f]{8}$/.test(payload.sourceHash) ? payload.sourceHash : null;
  if (!sessionId || !text || !Number.isFinite(through) || through < 0 || !sourceHash) return { stored: false, reason: 'malformed' };
  const cites = (Array.isArray(payload.cites) ? payload.cites : []).slice(0, 40)
    .map(c => (Array.isArray(c) ? c.slice(0, 20).map(String).filter(id => /^\d{1,4}$/.test(id)) : []));
  await settledWithin(recordSettled(), WORLD_WRITE_WAIT_MS, 'session record');
  if (summarySourceThrough(sessionId, through).hash !== sourceHash) {
    console.debug(`${MODULE_ID} | narrator: a relayed session summary was made from a record that has changed since — discarded.`);
    return { stored: false, reason: 'stale' };
  }
  const standing = summaryState(sessionId);
  if (standing.valid && Number(standing.view.through) >= through) return { stored: false, reason: 'stale' };
  let stored = false;
  try {
    stored = await writeRecordView(sessionId, 'summary', { text, cites, through, sourceHash, madeAt: Date.now() });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: a relayed session summary could not be stored:`, err?.message ?? err);
    return { stored: false, reason: 'refused' };
  }
  if (stored) renderSessionLog(sessionId).catch(() => {});
  return stored ? { stored: true } : { stored: false, reason: 'refused' };
}

/**
 * A reflection a player publishes from the Private Channel is canon (issue
 * #286 D1, #287). Its card carries the narrator flag family, so it reaches the
 * ring and the rolling summary like any narration; here, on the canonical GM,
 * the recorded entities it names get its developments on their cards — the
 * tier pass vow scenes and vignettes run. It records no ledger facts: the
 * private narrator writes no sidecar. The capture takes the card's
 * `narrationId`, so an X-Card on the reflection drops what it recorded
 * (issue #335 Y03 — issue #329 X01's rule, at its last capture caller).
 */
export function registerPublishedReflectionHook() {
  Hooks.on('createChatMessage', (message) => {
    if (!isCanonicalGM()) return;
    const f = message?.flags?.[MODULE_ID];
    if (!f?.publishedReflection || !f.narrationText) return;
    scheduleNarrationCapture(f.narrationText, game.settings.get(MODULE_ID, 'campaignState'),
      { narrationId: typeof f.narrationId === 'string' ? f.narrationId : null });
  });
}

let _staleRefresh = null;

/**
 * Make again the summaries of the earlier sessions LAST SESSION and the world
 * snapshot read when they are owed (record/summaryView.js summariesOwed):
 * never made — a session closed on a browser with no key, or played before
 * the summary was a view — made stale by a correction since, or behind what
 * the record holds (a Batch Mode round narrated after its session closed).
 * The record says what is owed; nothing marks it. On the canonical GM with a
 * key: after each narrator card, at the world load (after its mint) and when
 * this GM's key is set. One at a time; fail-open — a failed call is tried
 * again next time.
 *
 * @returns {Promise<number>} how many summaries were made
 */
export function refreshStaleSummaries() {
  if (_staleRefresh) return _staleRefresh;
  if (!isCanonicalGM() || !rollingSummaryEnabled() || !getApiKey()) return Promise.resolve(0);
  const run = (async () => {
    // None of the body runs before the memo below is set (issue #364
    // CATCHUP-MEMOISED-SETTLED-PROMISE).
    await null;
    let made = 0;
    try {
      await settledWithin(recordSettled(), WORLD_WRITE_WAIT_MS, 'session record');
      const cs = storedCampaignState() ?? {};
      for (const sessionId of summariesOwed(cs)) {
        if (await getRollingSessionSummary(cs, { sessionId, forceRefresh: true })) made += 1;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: an earlier session's summary could not be made again:`, err?.message ?? err);
    }
    return made;
  })();
  const memo = run.finally(() => { if (_staleRefresh === memo) _staleRefresh = null; });
  _staleRefresh = memo;
  return memo;
}

function refreshRollingSessionSummary({ relay = false } = {}) {
  // A refresh still running past its bound never settled — a write the
  // server never answered: passed, so this card refreshes the summary (issue
  // #347 AB05). It was joined for the rest of the page load.
  if (_summaryRefresh && Date.now() - _summaryRefreshStartedAt < SUMMARY_REFRESH_WAIT_MS) {
    _summaryRefreshAgain = true;
    return _summaryRefresh;
  }
  if (_summaryRefresh) console.warn(`${MODULE_ID} | narrator: a session summary refresh has not settled in ${SUMMARY_REFRESH_WAIT_MS}ms — starting another.`);
  _summaryRefreshStartedAt = Date.now();
  const mine = (async () => {
    try {
      do {
        _summaryRefreshAgain = false;
        await getRollingSessionSummary(game.settings.get(MODULE_ID, 'campaignState') ?? {}, { relay });
      } while (_summaryRefreshAgain && _summaryRefresh === mine);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: session summary refresh failed:`, err?.message ?? err);
    } finally {
      if (_summaryRefresh === mine) _summaryRefresh = null;
    }
  })();
  _summaryRefresh = mine;
  return mine;
}

/**
 * Generate and post a campaign recap card.
 * Posts from cache immediately if available; otherwise calls Claude (Sonnet, cached).
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]  — ignore cache
 * @param {boolean} [options.silent]        — skip the chat card (used for context injection only)
 * @returns {Promise<string>}               — the recap text
 */
export async function postCampaignRecap(campaignState, options = {}) {
  const text = await getCampaignRecap(campaignState, options);

  if (!text?.trim()) {
    if (!options.silent) {
      await ChatMessage.create({
        content: `
          <div class="sf-recap-campaign-card">
            <div class="sf-recap-label">◈ Campaign Recap</div>
            <div class="sf-recap-empty">No campaign history available yet. Play some sessions first!</div>
          </div>
        `.trim(),
        flags: {
          [MODULE_ID]: {
            recapCard:    true,
            recapType:    'campaign',
            recapEmpty:   true,
          },
        },
      });
    }
    return '';
  }

  if (!options.silent) {
    const isGM = game.user?.isGM ?? false;
    // The model's text (and any GM-edited chronicle entry it quotes) is
    // prose, escaped as the narrator card's own sink is: "<signal lost>"
    // vanished as an unknown tag and live markup rendered (issue #331 X24).
    const paragraphs = text.split(/\n\n+/).map(p => `<p>${proseToHtml(p.trim())}</p>`).join('');
    await ChatMessage.create({
      content: `
        <div class="sf-recap-campaign-card">
          <div class="sf-recap-label">◈ Campaign Recap</div>
          <div class="sf-recap-prose">${paragraphs}</div>
          ${isGM ? '<div class="sf-recap-actions"><button class="sf-recap-refresh" data-action="refreshCampaignRecap">↻ Refresh</button></div>' : ''}
        </div>
      `.trim(),
      flags: {
        [MODULE_ID]: {
          recapCard: true,
          recapType: 'campaign',
        },
      },
    });
  }

  return text;
}

/**
 * Respond to a free-form scene interrogation from the player.
 * Posts a scene card to chat — no dice, no move, no chronicle entry.
 *
 * The answer is the fact, said plainly, and it is not written back (known-
 * issues SCENE-ANSWER-NOT-A-CAMERA; the role and the user message are
 * narratorPrompt.js's): no fact block is asked for or applied — no frame, no
 * truths or state, no plan — and no capture runs, so no lore, no draft card
 * and no detail on an NPC's card. Sixteen answers of the long haul's third
 * live run each wrote the scene's frame, and their invented scenery became
 * lore and draft locations. What an answer still feeds, deliberately
 * (docs/narrator/narrator-memory-architecture.md §2, the A1 decision kept):
 * its card carries the narrator flag family, so the recent-narration ring and
 * the rolling summary's source hold the question and what was said in reply
 * — a later beat must not contradict an answer the table has just read. It
 * is no narration for the session's first-narration recap or the X-Card's
 * redirect (sessionStartRecap, registerXCardRedirectHook), and it is still
 * checked against the ledger (the consistency check reads; it writes no fact).
 *
 * @param {string} question       — the player's question (stripped of @scene prefix)
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string} [options.actorId]  — requesting player's actor ID (unused; reserved)
 * @returns {Promise<string|null>}    — response text, or null on failure/disabled
 */
export async function interrogateScene(question, campaignState, options = {}) {
  const sessionId = campaignState?.currentSessionId ?? null;

  if (!getSceneQueryEnabled()) {
    await postSceneFallbackCard(question, 'Scene queries are disabled in module settings.', sessionId);
    return null;
  }

  if (isXCardActive(campaignState)) {
    await postSceneFallbackCard(question, 'Scene paused — X-Card is active.', sessionId);
    return null;
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | interrogateScene: Claude API key not configured`);
    await postSceneFallbackCard(question, 'Scene query unavailable — Claude API key not configured.', sessionId);
    return null;
  }

  const settings = getNarratorSettings();
  // Multiplayer speaker disambiguation — the @scene intercept passes the
  // resolved speaker (token selection / author binding / ownership).
  // `actorId` is the legacy option name; both are honoured. A player with no
  // PC of their own at a table of several resolves to none, and is asked as
  // no one — the paced path's rule (issue #342 Z50): getActiveCharacter's
  // first-PC fallback made it Kira's CHARACTER block, "asked by Kira" and the
  // ring's "Kira asked", and her actorId on the capture (issue #345 AA30).
  const speakerActorId = options?.speakerActorId ?? options?.actorId ?? null;
  const character      = speakerActorId ? getActiveCharacter(campaignState, speakerActorId) : null;
  // @scene continues the scene in progress (issue #286 A4) — this starts one
  // only when none is active, so the question is asked of the frame, truths,
  // state and CORRECTED list as they stand. The answer adds nothing to them.
  await ensureSceneStarted(campaignState, 'first_narration_scene_interrogation');
  const extras = await buildNarratorExtras('scene_interrogation', campaignState, {
    playerNarration: question,
    character,
  });

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  const contextLimit  = getSceneContextCards();
  const recentContext = getRecentNarrationContext(sessionId, contextLimit);
  const sentenceTarget = getSceneResponseLength();
  const userMessage   = buildSceneUserMessage(
    question, recentContext, sentenceTarget, character?.name ?? null,
  );

  try {
    const raw = await callNarratorAPI({
      label: 'interrogateScene',
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });
    if (xCard.interrupted('interrogateScene')) {
      await postSceneFallbackCard(question, xCardDiscardReason(campaignState, 'Answer'), sessionId);
      return null;
    }
    const response = sceneAnswerText(raw, campaignState, { matchedEntityIds: extras.matchedEntityIds, narrationId });

    if (!response?.trim()) {
      await postSceneFallbackCard(question, 'Scene query returned no content — try again.', sessionId);
      return null;
    }

    await postSceneCard(question, response, sessionId, character?.name ?? null, narrationId);
    return response;

  } catch (err) {
    let failure = claudeFailureReason(err);   // the card's cause (ERROR-TEXT-BLAMES-KEY)
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
      label: 'interrogateScene',
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(16000),
        });
        if (xCard.interrupted('interrogateScene')) {
          await postSceneFallbackCard(question, xCardDiscardReason(campaignState, 'Answer'), sessionId);
          return null;
        }
        const response = sceneAnswerText(raw, campaignState, { matchedEntityIds: extras.matchedEntityIds, narrationId });
        if (response?.trim()) {
          await postSceneCard(question, response, sessionId, character?.name ?? null, narrationId);
          return response;
        }
        failure = EMPTY_REPLY_REASON;
      } catch (retryErr) {
        console.error(`${MODULE_ID} | interrogateScene retry failed:`, retryErr);
        failure = claudeFailureReason(retryErr);
      }
    }
    console.error(`${MODULE_ID} | interrogateScene failed:`, err);
    await postSceneFallbackCard(question, `Scene query failed — ${failure}.`, sessionId);
    return null;
  }
}

/**
 * An `@scene` answer's text, with nothing of it recorded (known-issues
 * SCENE-ANSWER-NOT-A-CAMERA). The answer is asked for no fact block; one the
 * model writes anyway is taken off the text and dropped — never applied, and
 * never relayed from a player's client: no frame, no truth or state, no plan.
 * Nor is the answer mined: the detection and tier passes it used to run
 * (playtest v1.7.22 — "a direct question surfaces the richest world detail of
 * the session") recorded as lore, draft cards and NPC details whatever
 * scenery the answer added. A plain answer restates what is recorded already.
 *
 * It is still read against the scene's ledger (the consistency check, on the
 * canonical GM, fire-and-forget — as applyNarratorSidecar runs it): a wrong
 * answer is the one thing left to catch, and the check writes no fact.
 *
 * @param {string} raw — the narrator's reply
 * @param {Object|null} campaignState
 * @param {{ matchedEntityIds?: string[], narrationId?: string|null }} [ctx]
 * @returns {string} the answer
 */
function sceneAnswerText(raw, campaignState, { matchedEntityIds = [], narrationId = null } = {}) {
  const { prose } = extractSidecar(raw);
  recordNarratorFactBlock(raw, { skipped: 'an @scene answer records nothing' });
  const text = typeof prose === 'string' ? prose : (typeof raw === 'string' ? raw : '');
  // …with fact continuity on, as every narration's audit is: off, nothing
  // is checked against a ledger nobody keeps.
  if (factContinuityEnabled() && campaignState && text.trim() && isCanonicalGM()) {
    runConsistencyCheck(text, auditCampaignState(campaignState), {
      matchedEntityIds:  Array.isArray(matchedEntityIds) ? matchedEntityIds : [],
      currentLocationId: campaignState.currentLocationId ?? null,
      narrationId:       typeof narrationId === 'string' ? narrationId : null,
    }).catch(err =>
      console.warn(`${MODULE_ID} | factContinuity: consistencyCheck dispatch failed:`, err),
    );
  }
  return text;
}

/**
 * Append a narration card after a raw oracle / table chat-command card. The
 * raw card has already been posted by the caller; this helper posts a follow-
 * up card flagged `oracleNarrationCard: true` that renders the rolled result
 * as 2–3 sentences of in-fiction prose in the configured tone.
 *
 * Skips — no fallback card, no error toast, just a console.debug breadcrumb —
 * when any of these is true:
 *   - the Claude API key is unset (so the feature is opt-in via key config)
 *   - the X-Card is active (scene paused; never narrate during suppression)
 *   - the narrator-enabled toggle is off in module settings
 *
 * Callers do not call this directly: src/oracles/oracleFollowup.js routes the
 * follow-up to exactly one keyed client (the author's, or the canonical GM).
 *
 * Reuses the narrator's `oracle_followup` mode (added to
 * narratorPrompt.js's ROLE_DESCRIPTIONS) so safety / tone / perspective /
 * length / sector / location / character context all flow through the same
 * `buildNarratorSystemPrompt` path the move pipeline uses.
 *
 * @param {Object}  args
 * @param {string}  args.kind            — `oracle_yes_no` | `oracle_table` | `pay_the_price` (extensible)
 * @param {string}  args.oracleName      — e.g. "Ask the Oracle (50/50)" or "Pay the Price"
 * @param {string}  [args.question]      — optional player-supplied question text
 * @param {string}  args.rolledLine      — the structured roll line, e.g.
 *                                          "d100 = 47 → An ally is exposed to harm"
 * @param {string|null} [args.speakerActorId] — the PC of the player who rolled
 *                                          (credit the roller); none — a
 *                                          player with no PC of their own —
 *                                          narrates it as no one's (issue
 *                                          #345 AA30, the Z50 rule)
 * @param {string|null} [args.oracleCardId] — the raw result card narrated: the
 *                                          narration's card names it, so an
 *                                          X-Card on it drops the card's result
 *                                          from RECENT ORACLE RESULTS (issue
 *                                          #345 AA01)
 * @param {string|null} [args.trackId]     — a waypoint peril's expedition, the
 *                                          one the move was on: its plan's
 *                                          next danger is the peril (issue
 *                                          #362 AC11)
 * @param {Object}  args.campaignState
 * @returns {Promise<string|null>} the rendered narration text or null on skip / failure
 */
export async function narrateOracleFollowup({
  kind, oracleName, question = '', rolledLine, campaignState, speakerActorId = null, oracleCardId = null, scope = null,
  trackId = null,
}) {
  const sessionId = campaignState?.currentSessionId ?? null;

  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) {
    console.debug(`${MODULE_ID} | narrateOracleFollowup: narration disabled — skipped.`);
    return null;
  }

  if (isXCardActive(campaignState)) {
    console.debug(`${MODULE_ID} | narrateOracleFollowup: X-Card active — skipped.`);
    return null;
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.debug(`${MODULE_ID} | narrateOracleFollowup: no Claude key on this client — skipped.`);
    return null;
  }

  // Its sidecar writes truths, state and the frame: they belong to a scene
  // (issue #321 U34 — NARR-INCITING-SCENE on every sidecar-writing path).
  // Written under no scene, the next move's scene start ended them as a
  // phantom scene, discarding the state and the frame.
  await ensureSceneStarted(campaignState, 'oracle_followup');

  // The roller's own PC, or no one: the router names none for a player with
  // no PC of their own (oracleFollowup.js), and getActiveCharacter's first-PC
  // fallback narrated their oracle as Kira's (issue #345 AA30, Z50's rule).
  const character = speakerActorId ? getActiveCharacter(campaignState, speakerActorId) : null;
  // A price that reveals a new enemy is told what it is and wants — rolled
  // once, here, where it is narrated (issue #353 Phase 0; never on the raw
  // card a player can read) — and asks this narration to decide its plan.
  const seedLines      = priceRevealsNewEnemy(rolledLine) ? newEnemySeedLines() : [];
  // A chosen complication is the next escalation step of the plan in play —
  // a waypoint's peril the open expedition's (issue #353 Phase 3) — so it
  // has something concrete to be. Marked played with this narration.
  const step = kind === 'complication' ? await complicationStep(campaignState, scope, trackId) : null;
  const extras = await buildNarratorExtras('oracle_followup', campaignState, {
    playerNarration: question,
    character,
    planRequests:    skeletonsEnabled() ? planRequestsFromSeeds(seedLines, narrationId) : [],
    planIds:         step ? [step.plan.id] : [],
  });
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  // One sentence count: the oracle_followup role's "2-3 sentences". The
  // Length setting governs move and paced narration only (issue #326 W40); it
  // was read into this user message while the role said 2-3 (issue #331 X28).
  const recentContext  = getRecentNarrationContext(sessionId, getNarratorContextCards());
  const userMessage    = buildOracleUserMessage({
    kind, oracleName, question, rolledLine, recentContext, seedLines,
    stepLine: step ? `It is the next escalation step of ${step.plan.subject.name} under UNREVEALED: "${step.step.text}". Play it as that.` : '',
  });
  const stepReveals = step ? [{ id: step.plan.id, advanced: step.step.id }] : [];
  // What forced the step, for a relay off the canonical GM to be checked by
  // (issue #362 D2: a relayed fact block's own reveals are dropped).
  const forcedFor = step ? { complication: { scope, trackId } } : null;
  // Whether the side-data was applied, the price's plan request with it
  // (issue #362 AC07; narrateResolution's rule).
  let sideDataApplied = false;

  try {
    const raw = await callNarratorAPI({
      label: 'narrateOracleFollowup',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });
    if (xCard.interrupted('narrateOracleFollowup')) return forgetInterruptedOracleResult(oracleCardId);
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, planRequests: extras.planRequests, reveals: stepReveals, forcedFor });

    if (!text?.trim()) {
      fileUnansweredPlanRequests(extras.planRequests, campaignState);
      return null;
    }
    sideDataApplied = true;

    await postOracleNarrationCard({ text, kind, oracleName, sessionId, narrationId, oracleCardId });
    reportNarratedOracle(kind, rolledLine);
    // The narration of a roll the table made — discovery by nature (#286 D4).
    scheduleNarrationCapture(text, campaignState, { detect: true, source: 'oracle_followup', actorId: character?.actorId ?? null, narrationId });
    return text;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
      label: 'narrateOracleFollowup',
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(16000),
        });
        if (xCard.interrupted('narrateOracleFollowup')) return forgetInterruptedOracleResult(oracleCardId);
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, planRequests: extras.planRequests, reveals: stepReveals, forcedFor });
        if (text?.trim()) {
          sideDataApplied = true;
          await postOracleNarrationCard({ text, kind, oracleName, sessionId, narrationId, oracleCardId });
          reportNarratedOracle(kind, rolledLine);
          scheduleNarrationCapture(text, campaignState, { detect: true, source: 'oracle_followup', actorId: character?.actorId ?? null, narrationId });
          return text;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateOracleFollowup retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateOracleFollowup failed:`, err);
    if (!sideDataApplied) fileUnansweredPlanRequests(extras.planRequests, campaignState);
    return null;
  }
}

/**
 * An oracle follow-up the X-Card interrupted posts no card, so nothing names
 * its raw result card for the X-Card's drop: the result leaves RECENT ORACLE
 * RESULTS here instead (oracleFollowup.js forgetOracleResultUnderXCard —
 * XCARD-ORACLE-FOLLOWUP-UNWRITTEN). Resolves null, the follow-up's skip value.
 *
 * @param {string|null} oracleCardId
 * @returns {Promise<null>}
 */
async function forgetInterruptedOracleResult(oracleCardId) {
  if (typeof oracleCardId === 'string' && oracleCardId) {
    try {
      const { forgetOracleResultUnderXCard } = await import('../oracles/oracleFollowup.js');
      await forgetOracleResultUnderXCard(oracleCardId);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrateOracleFollowup: forgetting the interrupted result failed:`, err?.message ?? err);
    }
  }
  return null;
}

/**
 * The plan step a chosen complication plays (issue #353 Phase 3): a
 * waypoint's peril is the next danger of the plan of the expedition under way
 * — the one the move was on (`trackId`, its choice card's), else the open
 * expedition's, the most recently changed when several are open; never a
 * finished or removed expedition's plan, which took it in the Secrets
 * journal's page order (issue #362 AC11). Any other complication — or a peril
 * with no open expedition planned — is the next escalation step of the most
 * recently changed plan made in this scene. Null when no plan in play has a
 * step left.
 *
 * @param {Object} campaignState
 * @param {string|null} scope — the complication's ("waypoint", "destination", "scene")
 * @param {string|null} [trackId] — the expedition the move was on
 * @returns {Promise<{ plan: Object, step: Object }|null>}
 */
async function complicationStep(campaignState, scope, trackId = null) {
  if (!skeletonsEnabled()) return null;
  try {
    const withStep = listSkeletons().filter(r => r.escalation.some(e => !e.done));
    const time = (r) => String(r.updatedAt ?? r.createdAt ?? '');
    const newest = (list) => [...list].sort((a, b) => time(b).localeCompare(time(a)))[0] ?? null;
    const sceneId = campaignState?.currentSceneId ?? null;
    let peril = null;
    if (scope === 'waypoint') {
      const open = new Set((await readOpenProgressTracks()).filter(t => t?.type === 'expedition').map(t => t.id));
      const underWay = withStep.filter(r => r.kind === 'expedition' && r.subject?.id && open.has(r.subject.id));
      peril = (trackId ? underWay.find(r => r.subject.id === trackId) : null) ?? newest(underWay);
    }
    const plan = peril ?? newest(withStep.filter(r => sceneId && r.sceneId === sceneId));
    return plan ? { plan, step: plan.escalation.find(e => !e.done) } : null;
  } catch {
    return null;
  }
}

function buildOracleUserMessage({
  kind = 'oracle_table', oracleName, question, rolledLine, recentContext, seedLines = [], stepLine = '',
}) {
  // recentContext is a pre-joined STRING (getRecentNarrationContext), matching
  // the scene/paced builders. Use it directly — calling .join here threw
  // "recentContext.join is not a function" and silently killed every oracle
  // narration follow-up (bug since the oracle-narration feature landed).
  const recent = (typeof recentContext === 'string' && recentContext.length > 0)
    ? `\n\nRECENT NARRATION (most recent last):\n${recentContext}`
    : '';
  const q = question?.trim() ? `Question or context: ${question.trim()}\n` : '';
  const seeds = (Array.isArray(seedLines) ? seedLines : []).filter(l => typeof l === 'string' && l.trim());
  const seedBlock = seeds.length ? `What the oracle says of it:\n${seeds.map(l => `- ${l}`).join('\n')}\n` : '';
  // A complication the player chose as a weak hit's cost (issue #353 Phase
  // 0): it is delivered now, as its own beat. Its card only promised that the
  // narrator would "surface" it, and nothing ever did.
  if (kind === 'complication') {
    return (
      `The player chose a complication as the cost of their last move:\n` +
      `Complication: ${oracleName}\n` +
      q +
      (rolledLine ? `Oracle: ${rolledLine}\n` : '') +
      (stepLine ? `${stepLine}\n` : '') +
      `${recent}\n\n` +
      `Render the complication arriving now, as 2-3 sentences of in-fiction prose anchored to ` +
      `the current scene: it happens, concretely, and it costs or threatens the characters. ` +
      `Do not resolve it. Do not repeat the dice number or the literal table text — transform ` +
      `it into narrative.`
    );
  }
  // A yes/no answer binds the narration of it (ORACLE-NO-NARRATED-AS-YES): said
  // back after the recent scene, which may say otherwise, and before the ask.
  const binds = formatOracleAnswerRule({ kind, question, rolledLine });
  return (
    `The player invoked the oracle:\n` +
    `Oracle: ${oracleName}\n` +
    q +
    `Mechanical result: ${rolledLine}\n` +
    seedBlock +
    `${recent}\n\n` +
    (binds ? `${binds}\n\n` : '') +
    `Render this result as 2-3 sentences of in-fiction prose anchored to ` +
    `the current scene. Do not repeat the dice number or the literal table text — transform ` +
    `it into narrative.`
  );
}

async function postOracleNarrationCard({ text, kind, oracleName, sessionId, narrationId = null, oracleCardId = null }) {
  const header = oracleName || (kind === 'pay_the_price' ? 'Pay the Price' : 'Oracle');
  // Flag family (narrator-context audit 2026-07): the oracle follow-up is
  // in-fiction prose anchored to the scene — without the family it never
  // entered the ring or rolling summary, so the narrator forgot how an
  // oracle result landed the moment it posted it.
  await ChatMessage.create({
    content: `<div class="sf-oracle-narration-card"><strong>${escapeHtml(header)} — narration</strong><p>${proseToHtml(text)}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleNarrationCard: true,
        narrationKind:       kind,
        sessionId:           sessionId ?? '',
        narratorCard:        true,
        narrationText:       text,
        narrationId:         narrationId ?? null,   // for the X-Card (issue #321 U07)
        // The result card it narrates — an X-Card on this narration takes
        // that card's result out of RECENT ORACLE RESULTS (issue #345 AA01).
        oracleCardId:        typeof oracleCardId === 'string' && oracleCardId ? oracleCardId : null,
      },
    },
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The CHARACTER blocks of a narration about the PCs `actorIds` names — each
 * still a PC, by its own id (narrateRound's rule): one is the beat's
 * character; two or more each get a block, and the narration is third person
 * (issue #342 Z40's rule); none gets none. The galley's rule (issue #345
 * AA31).
 *
 * @param {string[]} actorIds
 * @param {Object} campaignState
 * @returns {{ character: Object|null, roundCharacters: Object[]|null }}
 */
function partyBlocksFor(actorIds, campaignState) {
  const present = (Array.isArray(actorIds) ? actorIds : [])
    .filter(id => isPlayerCharacterActor(game.actors?.get?.(id) ?? null))
    .map(id => getActiveCharacter(campaignState, id))
    .filter((c, i, all) => c && all.findIndex(o => o?.actorId === c.actorId) === i);
  return { character: present.length === 1 ? present[0] : null, roundCharacters: present.length > 1 ? present : null };
}

/**
 * The CHARACTER blocks of a narration about the party that no one PC's line
 * or roll started — a clock vignette, the inciting incident: the PCs at the
 * table (galleyVignette.js collectGalleyParticipants' active split; a PC no
 * player owns counts as present with a GM online), as the galley and the
 * closing vignette are written. Both took the campaign's first PC, so with its
 * player away the vignette's "you" was a crewmate not there, and the PCs who
 * were had no block (issue #362 AC75). Fail-open: the first PC, as before.
 *
 * @param {Object} campaignState
 * @returns {Promise<{ character: Object|null, roundCharacters: Object[]|null }>}
 */
async function partyBlocksAtTable(campaignState) {
  try {
    const { collectGalleyParticipants } = await import('../session/galleyVignette.js');
    const ids = collectGalleyParticipants(campaignState).active.map(p => p.actor?.id).filter(Boolean);
    return partyBlocksFor(ids, campaignState);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: the PCs at the table could not be read — the first PC narrates:`, err?.message ?? err);
    return { character: getActiveCharacter(campaignState), roundCharacters: null };
  }
}

/**
 * Whether a session set-piece would be narrated on this client now — the
 * three gates of narrateSessionVignette (narration switched off, the X-Card
 * active, no Claude key here), which it asks itself, and which Begin and End a
 * Session ask first: a scene's dice are rolled only for a scene that will be
 * attempted (issue #381).
 *
 * @param {Object|null} campaignState
 * @returns {boolean}
 */
export function sessionVignetteWillRun(campaignState) {
  return !!getNarratorSettings().narrationEnabled && !isXCardActive(campaignState) && !!getApiKey();
}

/**
 * Render a Begin Session opening vignette via the narrator API and return the
 * prose text. The caller is responsible for posting the chat card; see
 * `src/session/galleyVignette.js` for the participant-enumeration + card-post
 * wrapper.
 *
 * Silent skip with `null` return when the Claude API key is unset, the
 * narrator-enabled toggle is off, or the X-Card is active.
 *
 * Tone is overridden to wry+absurd via the `session_vignette` mode (see
 * narratorPrompt.js ROLE_DESCRIPTIONS) regardless of any campaign tone
 * setting — Begin Session is always intentionally light.
 *
 * The galley names the PCs it is about — those at the table
 * (`actorIds`, collectGalleyParticipants' active split): each gets its
 * CHARACTER block, as a round's acting PCs do — two or more are third person
 * (issue #342 Z40's rule) — and a vignette with none present gets none. It
 * took the campaign's first PC, so with that PC's player away the vignette's
 * "you" was the crewmate its own user message called absent, and the PC in
 * the galley had no block (issue #345 AA31). End a Session's closing
 * vignette, about an NPC, passes the PCs at the table too (known-issues
 * CLOSING-VIGNETTE-FIRST-PC). Without `actorIds` the block is the first PC's.
 *
 * @param {Object} args
 * @param {string} args.userMessage    — pre-built vignette prompt body
 *                                       (active/absent rosters, sector context,
 *                                       generation instructions)
 * @param {Object} args.campaignState
 * @param {string[]|null} [args.actorIds] — the PCs the vignette is about (the galley's present PCs)
 * @param {Object[]|null} [args.seeds] — the scene's rolled material, as its
 *   user message gives it (session/sceneSeeds.js): each seed is marked in
 *   place with the narration's account of it (`builtFrom`, issue #381)
 * @param {string|null} [args.narratorClass] — the latitude, over the mode's
 *   (embellishment): the spotlight vignette brings a new danger into play,
 *   so it runs at interaction — discovery when it introduces someone
 * @param {boolean} [args.detect] — its capture runs the detection pass too,
 *   as a clock vignette's does (the spotlight's — detection follows latitude)
 * @returns {Promise<string|null>}
 */
export async function narrateSessionVignette({ userMessage, campaignState, narrationId = newNarrationId(), actorIds = null, seeds = null, narratorClass = null, detect = false }) {
  if (!sessionVignetteWillRun(campaignState)) return null;
  const settings = getNarratorSettings();
  const xCard = watchXCard(campaignState);
  const apiKey = getApiKey();

  // Its sidecar's facts belong to a scene (issue #321 U34; see narrateOracleFollowup).
  await ensureSceneStarted(campaignState, 'session_vignette');

  // The PCs it is about, each still a PC, by its own id (narrateRound's rule).
  const { character, roundCharacters } = Array.isArray(actorIds)
    ? partyBlocksFor(actorIds, campaignState)
    : { character: getActiveCharacter(campaignState), roundCharacters: null };
  const extras = await buildNarratorExtras('session_vignette', campaignState, { character });
  if (roundCharacters) extras.roundCharacters = roundCharacters;
  // A spotlight vignette's latitude (issue #381 D3), over the mode's own.
  if (narratorClass) extras.narratorClass = narratorClass;
  const capture = detect ? { narrationId, detect: true, source: 'spotlight_vignette' } : { narrationId };
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  try {
    const raw = await callNarratorAPI({
      label: 'narrateSessionVignette',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),  // 4-6 sentences, comfortable headroom
    });
    if (xCard.interrupted('narrateSessionVignette')) return null;
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, bookend: true, seeds });
    if (!text?.trim()) return null;
    scheduleNarrationCapture(text, campaignState, capture);   // its NPCs' developments → their cards (#286 D4)
    return text;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
      label: 'narrateSessionVignette',
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(16000),
        });
        if (xCard.interrupted('narrateSessionVignette')) return null;
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, bookend: true, seeds });
        if (!text?.trim()) return null;
        scheduleNarrationCapture(text, campaignState, capture);
        return text;
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateSessionVignette retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateSessionVignette failed:`, err);
    return null;
  }
}

/**
 * What a filled plan clock's trigger vignette is made to play, as reveals:
 * its plan's next escalation step, or — a countdown's mystery with no step
 * left — its answer coming out (issue #353 Phase 3). The vignette marks it
 * (narrateClockAdvancement), and a relayed vignette's is checked against it
 * (standingForcedReveals, issue #362 D2). [] for no plan.
 *
 * @param {{ plan: Object, step: Object|null, revealsTruth: boolean }|null} paced — secrets.js planForClock's
 * @returns {Array<{ id: string, advanced?: string, revealed?: string[] }>}
 */
function stepRevealsOf(paced) {
  if (!paced?.plan) return [];
  if (paced.step) return [{ id: paced.plan.id, advanced: paced.step.id }];
  return paced.revealsTruth ? [{ id: paced.plan.id, revealed: ['truth'] }] : [];
}

/**
 * Generate a brief (2-3 sentence) narrative vignette for a clock segment
 * filling — a story beat describing what it feels like as that faction plot
 * tightens, a reactor gauge drops another notch, or a deadline finally
 * arrives. Returns null when narration is off / no key / the call fails
 * (the caller falls back silently).
 *
 * A trigger is narrated only while it stands (TRIGGER-VIGNETTE-LATE-POST):
 * `stillTriggered`, asked once the reply is in and before its sidecar is
 * applied, says whether the clock is still full. One rewound meanwhile — a
 * Burn Momentum or Improve Result undoing the price that filled it (issue
 * #338 D8), a GM taking the fill back — returns null: no card, and nothing of
 * the narration is written (its ledger persist, a relay of it from a co-GM's
 * client, a ship move, the consistency audit, the tier pass), so there is
 * nothing to retract. A narration that stands runs the tier pass for the
 * recorded entities it names, as a session vignette does (issue #345 AA33),
 * and the detection pass (CLOCK-VIGNETTE-NO-DETECTION).
 *
 * @param {{ clock: { name:string, type:string, filled:number, segments:number, triggered:boolean }, campaignState: Object,
 *           narrationId?: string, stillTriggered?: (() => boolean|Promise<boolean>)|null }} args
 * @returns {Promise<string|null>}
 */
export async function narrateClockAdvancement({ clock, campaignState, narrationId = newNarrationId(), stillTriggered = null }) {
  // A plan's clock whose trigger vignette is not written — on any exit below
  // but the one that narrates it — is re-armed one short of full, its step
  // still owed (issue #362 AC08; secrets.js rearmUnplayedPlanClock). A
  // trigger rewound meanwhile is no longer full, and is left as it is.
  let narrated = false;
  try {
    const settings = getNarratorSettings();
    if (!settings.narrationEnabled) return null;
    if (isXCardActive(campaignState))  return null;
    const xCard = watchXCard(campaignState);

    const apiKey = getApiKey();
    if (!apiKey) return null;

    // Its sidecar's facts belong to a scene (issue #321 U34; see narrateOracleFollowup).
    await ensureSceneStarted(campaignState, 'clock_vignette');

    // Its own role (a threat tightening, or arriving), not the session
    // vignette's "calm before / after" (issue #322 V23). The PCs at the table
    // are its characters (issue #362 AC75).
    const { character, roundCharacters } = await partyBlocksAtTable(campaignState);
    // A clock a hidden plan holds (issue #353 Phase 3): its filling plays the
    // plan's next escalation step — or a countdown's answer coming out — and
    // marks it played with this narration (a rewind that supersedes the
    // vignette takes it back with it). Every vignette of the clock is about
    // the plan, filling or not: an advance is written with it in play, so the
    // beat grows the threat the plan holds (issue #362 AC38 — it was asked how
    // "the Choir — escalation" grows with the Choir's plan not in play).
    const ofPlan = skeletonsEnabled() ? planForClock(clock._id ?? null) : null;
    const paced = clock.triggered ? ofPlan : null;
    const pacedReveals = stepRevealsOf(paced);
    // What forced the step, for a relay off the canonical GM to be checked by
    // (issue #362 D2: a relayed fact block's own reveals are dropped).
    const forcedFor = pacedReveals.length ? { clockId: clock._id ?? null } : null;
    const extras = await buildNarratorExtras('clock_advance', campaignState, {
      character, planIds: ofPlan ? [ofPlan.plan.id] : [],
    });
    if (roundCharacters) extras.roundCharacters = roundCharacters;
    const systemPrompt = buildNarratorSystemPrompt(
      campaignState, settings, character, '', extras,
    );

    const typeFlair = clock.type === "campaign"
      ? "a long-running campaign threat or faction project"
      : "an immediate scene danger or countdown";
    const pacedLine = paced?.step
      ? ` It paces ${paced.plan.subject.name} under UNREVEALED: what happens now is its next escalation step — "${paced.step.text}".`
      : (paced?.revealsTruth ? ` It was counting down to the answer under UNREVEALED for ${paced.plan.subject.name}: that answer comes out now.` : '');
    const userMessage = clock.triggered
      ? `The clock "${clock.name}" (${typeFlair}) has TRIGGERED — it has now filled all ${clock.segments} segments.${pacedLine} Write exactly 2-3 sentences of vivid fiction describing the moment this threat materialises or this deadline arrives. Pure narrative — no game mechanics, no clock language, no numbers.`
      : `The clock "${clock.name}" (${typeFlair}) has advanced to ${clock.filled}/${clock.segments} segments. Write exactly 2-3 sentences of vivid fiction describing how this pressure or looming threat grows by a notch. Pure narrative — no game mechanics, no clock language, no numbers.`;

    // A rewound trigger did not happen: nothing of it is applied (see above).
    const triggerStands = async () => {
      if (!clock.triggered || typeof stillTriggered !== 'function') return true;
      try {
        if (await stillTriggered()) return true;
      } catch (err) {
        console.debug?.(`${MODULE_ID} | narrateClockAdvancement: the clock could not be read — narrating:`, err?.message ?? err);
        return true;
      }
      console.debug?.(`${MODULE_ID} | narrateClockAdvancement: "${clock.name}" was rewound before its trigger vignette — not narrated.`);
      return false;
    };

    try {
      const raw = await callNarratorAPI({
        label: 'narrateClockAdvancement',
        apiKey, systemPrompt, userMessage,
        model:     settings.narrationModel,
        maxTokens: maxTokensWithSidecar(16000),
      });
      if (xCard.interrupted('narrateClockAdvancement')) return null;
      if (!(await triggerStands())) return null;
      const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, reveals: pacedReveals, forcedFor });
      if (!text?.trim()) return null;
      // The developments of the recorded NPCs it names → their cards, as a
      // session vignette's (#286 D4) — every post site goes through here
      // (issue #345 AA33) — and the detection pass: a clock vignette is written
      // at interaction latitude (issue #322 V23), so the figures, lore and
      // threats it introduces are captured as a move's are
      // (CLOCK-VIGNETTE-NO-DETECTION; D4 rejected detection after vignettes
      // only for their embellishment latitude).
      scheduleNarrationCapture(text, campaignState, { detect: true, source: 'clock_vignette', narrationId });
      narrated = true;
      return text;
    } catch (err) {
      if (isRateLimit(err)) {
        try {
          await delay(RETRY_DELAY_MS);
          const raw = await callNarratorAPI({
        label: 'narrateClockAdvancement',
            apiKey, systemPrompt, userMessage,
            model:     settings.narrationModel,
            maxTokens: maxTokensWithSidecar(16000),
          });
          if (xCard.interrupted('narrateClockAdvancement')) return null;
          if (!(await triggerStands())) return null;
          const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, reveals: pacedReveals, forcedFor });
          if (!text?.trim()) return null;
          scheduleNarrationCapture(text, campaignState, { detect: true, source: 'clock_vignette', narrationId });
          narrated = true;
          return text;
        } catch (retryErr) {
          console.error(`${MODULE_ID} | narrateClockAdvancement retry failed:`, retryErr);
        }
      }
      console.error(`${MODULE_ID} | narrateClockAdvancement failed:`, err);
      return null;
    }
  } finally {
    if (!narrated && clock?.triggered) await rearmUnplayedPlanClock(clock?._id ?? null);
  }
}

/**
 * Build the user message for a vow-swearing scene: the Iron truth (how the
 * Ironsworn bind their oaths in this world) + the vow being sworn. Pure;
 * exported for tests.
 *
 * @param {{ name?: string, rank?: string|null }} vow
 * @param {{ title?: string, description?: string }|null} ironTruth
 * @returns {string}
 */
export function buildVowSwearingUserMessage(vow, ironTruth) {
  const subject   = vow?.name ? `"${vow.name}"` : "a vow";
  const rank      = vow?.rank ? ` (${vow.rank})` : "";
  // A custom Iron truth chosen in the World Truths dialog is its title alone
  // (issue #322 V34).
  // A title that ends its own sentence ("…to the Forge.") is followed by the
  // description, not by ": " (known-issues IRON-TRUTH-COLON — every truth
  // source titles a truth with its first sentence).
  const title = String(ironTruth?.title ?? "").trim();
  const lead  = !title ? "" : /[.!?…]["'”’)]?$/u.test(title) ? `${title} ` : `${title}: `;
  const truthLine = ironTruth?.description
    ? `In this world, the Ironsworn bind their oaths thus — ${lead}${ironTruth.description}`
    : ironTruth?.title
      ? `In this world, the Ironsworn bind their oaths thus — ${ironTruth.title}`
      : `In this world, vows are sworn upon iron.`;
  return [
    `A character is swearing ${subject}${rank}.`,
    ``,
    truthLine,
    ``,
    `Write 2-3 sentences depicting the act of swearing this vow, grounded in how the`,
    `Ironsworn swear their oaths above. Pure sensory fiction; do not restate the vow's`,
    `text or mention game mechanics.`,
  ].join("\n");
}

/**
 * Narrate the moment a vow is sworn (#241 follow-up): a brief scene grounded in
 * the campaign's Iron truth. Mirrors narrateClockAdvancement — GM-gated via the
 * caller; returns null (silently) when narration or the vow-scene toggle is off,
 * no API key, X-Card active, or the call fails. Never blocks vow creation.
 *
 * The scene is written for the PC who swore (`speakerActorId`, the roller —
 * issue #321 U23), as the move narration before it is.
 *
 * @param {{ vow: { name?: string, rank?: string|null }, campaignState: Object,
 *           speakerActorId?: string|null, narrationId?: string }} args —
 *   `narrationId`: stamped on the sidecar's facts and the posted card, so an
 *   X-Card can remove this narration (issue #321 U07)
 * @returns {Promise<string|null>}
 */
export async function narrateVowSwearing({ vow, campaignState, speakerActorId = null, narrationId = newNarrationId(), planRequests = [] }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  let vowSceneOn = true;
  try { vowSceneOn = game.settings.get(MODULE_ID, 'vowSwearingNarration') !== false; }
  catch (err) { console.debug?.(`${MODULE_ID} | vowSwearingNarration read failed:`, err?.message ?? err); }
  if (!vowSceneOn) return null;
  if (isXCardActive(campaignState)) return null;
  const xCard = watchXCard(campaignState);

  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Its sidecar's facts belong to a scene (issue #321 U34; see narrateOracleFollowup).
  await ensureSceneStarted(campaignState, 'vow_swearing');

  const character    = getActiveCharacter(campaignState, speakerActorId);
  const ironTruth    = getTruth(campaignState, 'iron');
  // What is really behind the vow is decided here (issue #353 Phase 4).
  const extras       = await buildNarratorExtras('vow_swearing', campaignState, { character, planRequests });
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character, '', extras);
  const userMessage  = buildVowSwearingUserMessage(vow, ironTruth);

  const call = async () => {
    const raw  = await callNarratorAPI({
      label: 'narrateVowSwearing',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });
    if (xCard.interrupted('narrateVowSwearing')) return null;
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId, planRequests: extras.planRequests });
    return (text && text.trim()) ? text : null;
  };

  try {
    return await call();
  } catch (err) {
    if (isRateLimit(err)) {
      try { await delay(RETRY_DELAY_MS); return await call(); }
      catch (retryErr) { console.error(`${MODULE_ID} | narrateVowSwearing retry failed:`, retryErr); }
    }
    console.error(`${MODULE_ID} | narrateVowSwearing failed:`, err);
    return null;
  }
}

/**
 * Narrate a vow-swearing scene and, if one was produced, post it as a chat card.
 * The single entry point both vow-swearing hooks call (inciting-vow swear and
 * the Swear an Iron Vow move). Safe to call from any client — narrateVowSwearing
 * only produces text on the canonical GM path with a key; callers are GM-gated.
 *
 * @param {{ vow: { name?: string, rank?: string|null }, campaignState: Object,
 *           speakerActorId?: string|null }} args — `speakerActorId`: the PC who swore
 * @returns {Promise<string|null>}
 */
export async function narrateAndPostVowSwearing({ vow, campaignState, speakerActorId = null }) {
  const narrationId = newNarrationId();
  // The vow's plan (issue #353 Phase 4): decided by its swearing scene, or —
  // no scene (switched off, no key, a failure) — filed with its roll for the
  // next narration it is in play for. The canonical GM's (callers are GM-gated).
  const request = skeletonsEnabled() ? vowPlanRequest(vow, narrationId) : null;
  const text = await narrateVowSwearing({ vow, campaignState, speakerActorId, narrationId, planRequests: request ? [request] : [] });
  if (!text) {
    if (request) await fileRequestedPlan(request, { campaignState }).catch(() => null);
    return null;
  }
  // The prose rendered as every narrator-prose card renders it (proseToHtml,
  // issue #348 PT13): stripMarkup and a hand escape left the narrator's
  // Markdown emphasis as literal asterisks — "*Forgeborn*" (issue #362 AC73).
  const clean = proseToHtml(text);
  try {
    // Flag family (NARR-RING-VOWSCENE, narrator-context audit 2026-07): the
    // oath scene is fiction the narrator must remember — without these flags
    // it never entered the ring, the rolling summary, or the session recap,
    // and the narrator could contradict its own swearing scene next turn.
    // Consumer audit (architecture §2): no audio/correction markup → those
    // hooks no-op; no resolutionId → burn-supersede unaffected.
    await ChatMessage.create({
      content: `<div class="sf-card sf-vow-scene"><div class="sf-card-body"><p>⚔ <em>${clean}</em></p></div></div>`,
      flags:   {
        [MODULE_ID]: {
          vowSceneCard:  true,
          narratorCard:  true,
          narrationText: text,
          sessionId:     campaignState?.currentSessionId ?? null,
          narrationId,   // for the X-Card (issue #321 U07)
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrateAndPostVowSwearing: card post failed:`, err?.message ?? err);
  }
  scheduleNarrationCapture(text, campaignState, { narrationId });   // the oath scene's NPCs → their cards (#286 D4)
  return text;
}

/**
 * Compose the campaign's inciting incident — the dramatic opening event that
 * launches the campaign and sets up the first vow (rulebook "Begin your
 * adventure", step 1). Grounded in the established World Truths, starting
 * sector, local connection, and character, plus the oracle spark carried in
 * `userMessage`. Returns prose (4-6 sentences) ending with a single
 * `Suggested vow: … (<rank>)` line, or null when narration is disabled / no key
 * / the call fails (the caller falls back to an oracle-spark-only card).
 *
 * @param {{ userMessage: string, campaignState: Object }} args
 * @returns {Promise<string|null>}
 */
export async function narrateIncitingIncident({ userMessage, campaignState, narrationId = newNarrationId() }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  if (isXCardActive(campaignState))  return null;
  const xCard = watchXCard(campaignState);

  const apiKey = getApiKey();
  if (!apiKey) return null;

  // NARR-INCITING-SCENE (narrator-context audit 2026-07): the premise sidecar
  // used to write truths/state/frame under `currentSceneId: null`; the first
  // real turn's ensureSceneStarted then saw non-empty ledgers and implicitly
  // ended that phantom scene — discarding the target NPC's opening
  // location/condition (state never migrates) and clearing the opening frame.
  // Starting the scene HERE means the first move continues it instead.
  await ensureSceneStarted(campaignState, 'inciting_incident');

  // The PCs at the table, not the campaign's first PC (issue #362 AC75).
  const { character, roundCharacters } = await partyBlocksAtTable(campaignState);
  const extras = await buildNarratorExtras('inciting_incident', campaignState, { character });
  if (roundCharacters) extras.roundCharacters = roundCharacters;
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  const run = async () => {
    const raw = await callNarratorAPI({
      label: 'narrateIncitingIncident',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });
    if (xCard.interrupted('narrateIncitingIncident')) return null;
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
    return (text && text.trim()) ? text : null;
  };

  try {
    return await run();
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        return await run();
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateIncitingIncident retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateIncitingIncident failed:`, err);
    return null;
  }
}

/**
 * Run a narrator-only response for the pacing classifier's NARRATIVE and
 * NARRATIVE_WITH_MOVE_AVAILABLE decisions. No move is rolled, no move card is
 * posted, no chronicle entry — just a narrator card continuing the fiction
 * directly from the player's input.
 *
 * @param {string} playerText        — raw player narration
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string|null} [options.suggestedMove] — when set, the narrator is
 *   instructed to end with an italicized inline hint nominating this move
 * Never throws: a throw outside its own guarded steps — before the prompt
 * is built (the X-Card watch, the key, the speaker's character) — told
 * nobody; the pacing router only logged it (known-issues PACED-ROUTER-THROW).
 * The table is told the line was not narrated, as a failed call's line is
 * (issue #347 AB21). A reply the X-Card discards posts the paused notice
 * (PACED-DISCARD-UNDER-XCARD-SILENT).
 *
 * `beatClaim` is internal — this narration's claim on its beat's shape
 * (narrateWithBeatClaim); callers pass none.
 *
 * @returns {Promise<string|null>}   — narration text, or null on failure/disabled
 */
export async function narratePacedInput(playerText, campaignState, options = {}, beatClaim = null) {
  // The line's shape is claimed while it is narrated (issue #364
  // BEAT-SHAPE-SIMULTANEOUS; narrateResolution's rule) — the call below still
  // has narratePacedInput as its caller.
  if (!beatClaim) return narrateWithBeatClaim(claim => narratePacedInput(playerText, campaignState, options, claim));
  options = options ?? {};
  // One function, its failure caught inline: the paced narration's Claude
  // call keeps narratePacedInput as its caller (PACED-ROUTER-THROW's guard
  // must not add a named frame — the playthrough harness names a call by it).
  try {
    const sessionId = campaignState?.currentSessionId ?? null;

    const settings = getNarratorSettings();
    if (!settings.narrationEnabled) return null;

    if (isXCardActive(campaignState)) {
      // Don't run the narrator while the scene is paused — and say so, as a
      // move's paused notice and @scene's card do: the line posted nothing,
      // told nobody, and was never narrated after the resume (issue #345 AA29).
      await postPacedNarrationPausedCard(campaignState);
      return null;
    }
    const xCard = watchXCard(campaignState);
    const narrationId = newNarrationId();

    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn(`${MODULE_ID} | narratePacedInput: Claude API key not configured`);
      return null;
    }

    // The speaker's own character. A player with no PC of their own at a table
    // of several resolves to none (resolveSpeakerActorId gives the first PC
    // only to a GM or in solo play — issue #321 U23): the line is still
    // narrated (#326 D8) but with no character — getActiveCharacter's
    // first-PC fallback made it Kira's CHARACTER block, Kira speaking, and the
    // ring's "Kira wrote" (issue #342 Z50).
    const character    = options?.speakerActorId ? getActiveCharacter(campaignState, options.speakerActorId) : null;

    // The prompt is built before the call. A throw here — a store read, an
    // entity card, the scene start — escaped to the pacing router's catch,
    // which only logged it: the line sat in chat, narrated by nothing and told
    // to nobody, as a failed call's line did before AB21 (issue #347 residual
    // PACED-NARRATION-THROW-BEFORE-CALL). It posts AB21's notice too.
    let suggestedMove, extras, systemPrompt, userMessage;
    try {
      await ensureSceneStarted(campaignState, 'first_narration_paced');

      // Don't suggest a social move against a fellow player character (finding G):
      // inter-PC tension is resolved through roleplay, not a Compel roll. Suppress
      // the nomination before it reaches the narrator (so no hint is written) and
      // the card (so no Roll button appears).
      suggestedMove = suppressPcDirectedSocialMove(
        options.suggestedMove ?? null, playerText, character?.name ?? null,
      );

      extras = await buildNarratorExtras('paced_narrative', campaignState, {
        playerNarration: playerText,
        character,
        beatClaim,
      });

      systemPrompt = buildNarratorSystemPrompt(
        campaignState, settings, character, '', extras,
      );

      const recentContext = getRecentNarrationContext(sessionId, getNarratorContextCards());
      const sentenceTarget = settings.narrationLength ?? 3;
      userMessage = buildPacedNarrativeUserMessage(
        playerText, recentContext, sentenceTarget, suggestedMove, character?.name ?? null,
        { audio: extras.audioMarkupEnabled === true },
      );
    } catch (err) {
      console.error(`${MODULE_ID} | narratePacedInput: the narration could not be prepared:`, err);
      await postPacedNarrationFailedCard(campaignState, claudeFailureReason(err));
      return null;
    }

    try {
      const raw = await callNarratorAPI({
        label: 'narratePacedInput',
        apiKey, systemPrompt, userMessage,
        model:     settings.narrationModel,
        maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
      });
      if (xCard.interrupted('narratePacedInput')) {
        // Discarded because the X-Card was played while it was written: said
        // so, as a move's and @scene's are (PACED-DISCARD-UNDER-XCARD-SILENT).
        await postPacedNarrationPausedCard(campaignState);
        return null;
      }
      const text = applyNarratorSidecar(raw, campaignState, {
        moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
      });

      if (!text?.trim()) {
        console.warn(`${MODULE_ID} | narratePacedInput: the narrator's reply had no prose — nothing to post.`);
        await postPacedNarrationFailedCard(campaignState, EMPTY_REPLY_REASON);
        return null;
      }

      const buttonMove = reconcileSuggestedMove(text, suggestedMove, { playerText, speakerName: character?.name ?? null });
      await postPacedNarrativeCard(text, playerText, sessionId, buttonMove, character?.name ?? null, narrationId, extras.matchedEntityIds, options?.speakerActorId ?? null, options?.suggestedTargetId ?? null, extras.beatShape?.id ?? null);
      schedulePacedDetection(text, campaignState, { actorId: character?.actorId ?? null, narrationId, playerText });
      schedulePacedTierUpdate(text, extras.matchedEntityIds, extras.matchedEntityTypes, campaignState, { narrationId });
      // Its Chronicle entry is written from the session record's beat (record/chronicleView.js).
      return text;
    } catch (err) {
      let failure = claudeFailureReason(err);   // the notice's cause (ERROR-TEXT-BLAMES-KEY)
      if (isRateLimit(err)) {
        try {
          await delay(RETRY_DELAY_MS);
          const raw = await callNarratorAPI({
        label: 'narratePacedInput',
            apiKey, systemPrompt, userMessage,
            model:     settings.narrationModel,
            maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
          });
          if (xCard.interrupted('narratePacedInput')) {
            await postPacedNarrationPausedCard(campaignState);
            return null;
          }
          const text = applyNarratorSidecar(raw, campaignState, {
            moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
          });
          if (text?.trim()) {
            const buttonMove = reconcileSuggestedMove(text, suggestedMove, { playerText, speakerName: character?.name ?? null });
            await postPacedNarrativeCard(text, playerText, sessionId, buttonMove, character?.name ?? null, narrationId, extras.matchedEntityIds, options?.speakerActorId ?? null, options?.suggestedTargetId ?? null, extras.beatShape?.id ?? null);
            schedulePacedDetection(text, campaignState, { actorId: character?.actorId ?? null, narrationId, playerText });
            schedulePacedTierUpdate(text, extras.matchedEntityIds, extras.matchedEntityTypes, campaignState, { narrationId });
            return text;
          }
          failure = EMPTY_REPLY_REASON;
        } catch (retryErr) {
          console.error(`${MODULE_ID} | narratePacedInput retry failed:`, retryErr);
          failure = claudeFailureReason(retryErr);
        }
      }
      console.error(`${MODULE_ID} | narratePacedInput failed:`, err);
      await postPacedNarrationFailedCard(campaignState, failure);
      return null;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | narratePacedInput failed:`, err);
    await postPacedNarrationFailedCard(campaignState, claudeFailureReason(err));
    return null;
  }
}

/**
 * Schedule the paced-narrative detection pass. Fire-and-forget; matches
 * the async ~2 s pattern used by the non-make_a_connection discovery
 * branch in `runPostNarrationPasses` so the narration card settles
 * before the GM-only draft card appears.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @param {{ actorId?: string|null, narrationId?: string|null, playerText?: string|null }} [options] — the PC
 *   the narration was for (the draft card carries it, so Confirm puts a
 *   connection's bond Item on them), the narration's id (stamped on what
 *   the pass records, for the X-Card — issue #329 X01), and the line the
 *   player wrote that it answers (a name it gives to someone the narration
 *   shows is theirs — known-issues PLAYER-NAMED-PERSON-GETS-NO-CARD)
 */
export function schedulePacedDetection(narrationText, campaignState, { actorId = null, narrationId = null, playerText = null } = {}) {
  setTimeout(() => {
    runPacedDetection(narrationText, campaignState, { actorId, narrationId, playerText })
      .catch(err => console.error(`${MODULE_ID} | paced detection failed:`, err));
  }, ASYNC_DETECTION_DELAY_MS);
}

/**
 * Paced-narrative counterpart to the move path's interaction-class generative
 * tier update (see runPostNarrationPasses). Free narration defaults to the
 * interaction class, so the established entities the narrator just developed in
 * a conversation or roleplay scene should accrue to their cards too — otherwise
 * an NPC's behaviour during paced play never lands on their record. The append
 * pass is salience-gated (entityExtractor TIER_SALIENCE_FLOOR), so chatty
 * narration doesn't flood the tier. Fire-and-forget, matching
 * schedulePacedDetection's delay; no-op when nothing was matched in scene.
 *
 * @param {string}   narrationText
 * @param {string[]} matchedEntityIds   — in-scene confirmed entity ids (extras)
 * @param {string[]} matchedEntityTypes — parallel entity types (extras)
 * @param {Object}   campaignState
 * @param {{ narrationId?: string|null }} [options] — stamped on each detail (issue #329 X01)
 */
export function schedulePacedTierUpdate(narrationText, matchedEntityIds, matchedEntityTypes, campaignState, { narrationId = null } = {}) {
  if (!Array.isArray(matchedEntityIds) || !matchedEntityIds.length) return;
  setTimeout(() => {
    const refs = matchedEntityIds.map((id, i) => ({ journalId: id, type: matchedEntityTypes?.[i] }));
    appendGenerativeTierUpdates(
      narrationText, refs,
      campaignState?.currentSessionId, campaignState?.sessionNumber,
      { narrationId },
    ).catch(err => console.error(`${MODULE_ID} | paced tier update failed:`, err));
  }, ASYNC_DETECTION_DELAY_MS);
}

/**
 * Run the paced-narrative detection pass synchronously and route the
 * results. Drafts route through the GM-only review card surface (Path 2)
 * — `autoCreateConnection` is never set, so the make_a_connection
 * auto-create branch can't fire from this path. World Journal results
 * route through the §4 routing rule unchanged.
 *
 * Exposed for direct testing; production calls go through
 * `schedulePacedDetection`.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @param {{ skipLore?: boolean, source?: string, actorId?: string|null, narrationId?: string|null, playerText?: string|null }} [options] —
 *   `source` labels the draft card (default "paced_narrative"); `actorId`, the PC the narration was for,
 *   rides it to Confirm; `narrationId` is stamped on what the pass records (issue #329 X01); `playerText`,
 *   the line the narration answers, is shown to the detector beside it (none for an oracle follow-up, a
 *   vignette or the inciting incident: no line of play prompted them)
 * @returns {Promise<void>}
 */
export async function runPacedDetection(narrationText, campaignState, options = {}) {
  // An X-carded narration's capture writes nothing (XCARD-LATE-CAPTURE): see
  // runDiscoveryDetection.
  if (isNarrationXCarded(options.narrationId)) return;
  try {
    const detection = await runCombinedDetectionPass(
      narrationText,
      PACED_NARRATIVE_MOVE_ID,
      PACED_NARRATIVE_OUTCOME,
      campaignState,
      { playerLines: detectionPlayerLinesOf(options.playerText ?? '') },
    );
    if (isNarrationXCarded(options.narrationId)) return;
    // The inciting incident records its own cohesive lore entry (the "Situation"
    // line), so it asks us to skip the per-item lore spray that would otherwise
    // scatter the opening fiction across several loosely-worded WJ-Lore pages.
    // Factions, threats, locations, and state transitions still route normally.
    const worldJournal = options.skipLore
      ? { ...detection.worldJournal, lore: [] }
      : detection.worldJournal;
    const narrationId = options.narrationId ?? null;
    await routeWorldJournalResults(worldJournal, campaignState, { narrationId });
    // Renames before drafts: a placeholder figure revealed to have a proper
    // name is renamed in place, not duplicated into a new connection card.
    // Both carry the narration's id, for the X-Card (issue #335 Y02).
    await applyEntityRenames(detection.renames, campaignState, { narrationId });
    await routeEntityDrafts(detection.entities, campaignState, {
      autoCreateConnection: false,
      readAs:               detection.readAs ?? [],   // issue #362 D10
      source:               options.source ?? 'paced_narrative',
      actorId:              options.actorId ?? null,
      narrationId,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | runPacedDetection failed:`, err);
  }
}

/**
 * Capture what a narration outside the move and paced paths established
 * (issue #286 D4 — the passes ran only after moves, paced narration, `@scene`
 * and the inciting incident): developments of the recorded entities it names
 * go to their cards (runNarrationTierUpdate), and with `detect` the detection
 * pass records world lore and threats and queues new entities on the GM's
 * review card. On the GM whose client narrated it (world writes; a player's
 * client runs none) — the single emitter its caller chose: it re-checked
 * isCanonicalGM when the reply landed, so a lower-id keyed GM joining
 * meanwhile dropped an oracle follow-up's or a vignette's capture (AA34's
 * gate — CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE). After the same short delay
 * as the paced passes, so the card settles first. Both passes catch their own
 * errors.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @param {{ detect?: boolean, source?: string, actorId?: string|null, narrationId?: string|null }} [opts] —
 *   `narrationId`: stamped on what both passes record, for the X-Card (issue #329 X01)
 */
function scheduleNarrationCapture(narrationText, campaignState, { detect = false, source, actorId = null, narrationId = null } = {}) {
  if (!narrationText?.trim() || !game.user?.isGM) return;
  setTimeout(() => {
    if (detect) runPacedDetection(narrationText, campaignState, { source, actorId, narrationId });
    runNarrationTierUpdate(narrationText, campaignState, { narrationId });
  }, ASYNC_DETECTION_DELAY_MS);
}

/**
 * Resolve which ESTABLISHED entities a block of narration mentions and append
 * any narrator-added developments to their generative tier. For narration
 * paths that produce prose but have no player-typed text to scope relevance
 * from — notably the inciting incident, whose opening fiction can develop (or
 * kill) an established sector connection. Lexical match against the prose
 * itself (moveId null → no Haiku classifier in resolveRelevance). The caller
 * GM-gates; fail-open so it never blocks the surrounding flow.
 *
 * The move and paced paths always run BOTH detection (new entities) and the
 * tier update (existing entities). The inciting path previously ran only
 * detection, so an NPC the opening fiction developed or killed kept an empty
 * "Narrator-added details" section (playtest v1.7.20 — the inciting incident
 * killed Karthik Freeman but her connection card recorded nothing).
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @param {{ narrationId?: string|null }} [options] — stamped on each detail, for the X-Card (issue #329 X01)
 * @returns {Promise<Array>} applied tier updates ({ journalId, detail })
 */
export async function runNarrationTierUpdate(narrationText, campaignState, { narrationId = null } = {}) {
  try {
    if (!narrationText?.trim()) return [];
    const { entityIds, entityTypes } = await resolvePathRelevance(narrationText, campaignState);
    if (!entityIds.length) return [];
    const refs = entityIds.map((id, i) => ({ journalId: id, type: entityTypes?.[i] }));
    return await appendGenerativeTierUpdates(
      narrationText, refs,
      campaignState?.currentSessionId, campaignState?.sessionNumber,
      { narrationId },
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | runNarrationTierUpdate failed:`, err?.message ?? err);
    return [];
  }
}

async function postPacedNarrativeCard(narrationText, playerText, sessionId, suggestedMove, playerName = null, narrationId = null, matchedEntityIds = [], actorId = null, suggestedTargetId = null, beatShape = null) {
  const suggestionClass = suggestedMove ? ' sf-narration-card--with-suggestion' : '';
  const buttonRow = suggestedMove
    ? `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll ${escapeChatHtml(moveDisplayName(suggestedMove))}</button></div>`
    : '';
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-card--paced${suggestionClass}">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${proseToHtml(narrationText)}</div>
        ${buttonRow}
        <div class="sf-narration-footer">
          <button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden>
            <i class="fas fa-play"></i> Play
          </button>
          <button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden>
            <i class="fas fa-stop"></i> Stop
          </button>
        </div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:     true,
        narrationCard:    true,                  // back-compat
        pacedNarrative:   true,
        narrationText:    narrationText,
        playerText:       playerText,
        playerName:       playerName ?? null,
        // The narrating PC: the card's Roll button rolls the move as them,
        // whoever presses it (issue #325 W09 — it rolled as the clicker).
        actorId:          typeof actorId === 'string' && actorId ? actorId : null,
        suggestedMove:    suggestedMove ?? null,
        // The scene challenge a scene-challenge Roll is part of (the router's
        // resolution of the classifier's pick): its Roll's target. None for
        // any other move — a hint may have made the button one
        // (PACED-VARIANT-NO-TARGET).
        suggestedMoveTargetId: SCENE_CHALLENGE_VARIANTS[suggestedMove] && typeof suggestedTargetId === 'string' && suggestedTargetId
          ? suggestedTargetId : null,
        sessionId:        sessionId ?? null,
        // The scene's matched entities, as the move narration card stamps
        // them: the audio picks an NPC's pronoun-keyed voice from them
        // (resolveNpcVoiceForCard). Stamped [], a paced card never got it
        // (issue #322 V22).
        matchedEntityIds: Array.isArray(matchedEntityIds) ? [...matchedEntityIds] : [],
        narrationId:      narrationId ?? null,   // for the X-Card (issue #321 U07)
        ...beatShapeFlag(beatShape),             // the shape this beat was written in (beatVariety)
        timestamp:        new Date().toISOString(),
      },
    },
  });
}

function escapeChatHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The hint matchers' phrase for a move id — its words, as prose names it
// ("face danger scene challenge"). Not a display name: a card shows
// moveDisplayName (i18n.js), the confirm dialog's title (SCENE-CHALLENGE-MOVE-NAME).
function formatMoveLabel(moveId) {
  return String(moveId ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Move';
}

function escapeRegexLiteral(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Move-name → id matchers, built once: each a whole-phrase, case-insensitive,
// global regex. extractMoveFromNarrationHint collects every move named in the
// hint and picks the one it invites — not the longest name (issue #325 W36).
const MOVE_HINT_MATCHERS = Object.keys(MOVES)
  .map(id => ({ id, name: formatMoveLabel(id).toLowerCase() }))
  .filter(m => m.name && m.name !== 'move')
  .map(({ id, name }) => ({ id, re: new RegExp(`\\b${escapeRegexLiteral(name)}\\b`, 'gi') }));

/**
 * Extract the content of the LAST italic span in a narration string. The
 * paced-narrative move hint is, by instruction, the single italicized
 * sentence at the very end of the prose. Handles both markdown (`*…*`) and
 * HTML (`<em>…</em>` / `<i>…</i>`) emphasis. Returns '' when none is found.
 */
function lastItalicSpan(text) {
  const s = String(text ?? '');
  let best = '';
  let bestIdx = -1;
  const patterns = [
    /\*([^*\n]+)\*/g,                               // *markdown italics*
    /<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi,    // <em>/<i> html italics
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m.index >= bestIdx) {
        bestIdx = m.index;
        best = m[1];
      }
    }
  }
  return best.trim();
}

/**
 * Read the move the narrator actually invited from its closing italic hint.
 * Returns the matched move id, or null when the hint names no recognised move
 * (or there is no hint). Only the final italic span is scanned, so single-word
 * move names ("Compel", "Strike") in the prose body cannot false-match.
 *
 * The hint can name more than one move-shaped word: "Binding that wound
 * before the battle could be a Heal." The move it invites is the one written
 * as a move — capitalised, and not just because it opens a sentence — else
 * the last one named. A name inside a longer one named there is that longer
 * move. The longest name used to win, so the common noun "battle" made the
 * button "Roll Battle" (issue #325 W36).
 *
 * @param {string} narrationText
 * @returns {string|null}
 */
export function extractMoveFromNarrationHint(narrationText) {
  const hint = lastItalicSpan(narrationText);
  if (!hint) return null;
  const found = [];
  for (const { id, re } of MOVE_HINT_MATCHERS) {
    re.lastIndex = 0;
    for (const m of hint.matchAll(re)) found.push({ id, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  const named = found.filter(a => !found.some(b =>
    b !== a && b.start <= a.start && b.end >= a.end && (b.end - b.start) > (a.end - a.start)));
  if (!named.length) return null;
  const asMove = named.filter(n => /^\p{Lu}/u.test(n.text) && !opensSentence(hint, n.start));
  const pool   = asMove.length ? asMove : named;
  return pool.reduce((last, n) => (n.start > last.start ? n : last)).id;
}

/** True when the text before `index` is empty or ends a sentence (quotes and brackets aside). */
function opensSentence(text, index) {
  const before = text.slice(0, index).replace(/[\s"'\u201C\u2018([]+$/u, '');
  return before === '' || /[.!?]$/.test(before);
}

/**
 * Reconcile the move the pacing classifier nominated with the move the
 * narrator actually named in its closing italic hint (finding J). The two are
 * computed independently — the classifier picks before the narrator runs, and
 * the narrator has creative latitude to invite a different move. The prose is
 * the source of truth the player reads, so when the hint names a recognised
 * move it wins; otherwise the classifier's nomination stands.
 *
 * With `guard`, the hint's move passes the same finding-G guard the
 * nomination did: a social move against a fellow PC ("Pressing Ren for the
 * truth would be a Compel") never becomes the button — the hint reads as
 * naming no move, and the (already guarded) nomination stands. Only the
 * nomination was guarded, so the card offered a Compel against a PC (issue
 * #325 W36).
 *
 * A scene-challenge nomination (issue #338 D2) is named in prose by the move
 * it varies — "…would be a Face Danger": a hint naming Face Danger or Secure
 * an Advantage is that move within the challenge the classifier was told of,
 * so the button keeps the variant. The ordinary move replaced it, and the
 * Roll left the challenge unscored (PACING-ROLL-NO-SCENE-CHALLENGE).
 *
 * @param {string} narrationText
 * @param {string|null} classifierMove
 * @param {{ playerText: string, speakerName?: string|null, pcActors?: Array }} [guard]
 * @returns {string|null}
 */
export function reconcileSuggestedMove(narrationText, classifierMove, guard = null) {
  if (!classifierMove) return null;
  let hinted = extractMoveFromNarrationHint(narrationText);
  if (hinted && guard) {
    hinted = suppressPcDirectedSocialMove(hinted, guard.playerText, guard.speakerName ?? null, guard.pcActors);
  }
  if (hinted && SCENE_CHALLENGE_VARIANTS[classifierMove]) {
    const variant = Object.keys(SCENE_CHALLENGE_VARIANTS).find(v => SCENE_CHALLENGE_VARIANTS[v] === hinted);
    if (variant) return variant;
  }
  return hinted ?? classifierMove;
}

// Social moves that act upon another character. Suggesting one against a fellow
// player character is wrong (finding G) — Compel/relationship moves are for
// NPCs and difficult situations; inter-PC tension is roleplay, not a roll.
const PC_DIRECTED_SOCIAL_MOVES = new Set([
  'compel',
  'develop_your_relationship',
  'test_your_relationship',
]);

/**
 * Whether a typed line names `name`: a name of more than one word whole, in
 * any case; a one-word name — a name of one word, or the word of a name a
 * player calls someone by — only as a name is written, with its capital as
 * typed or in address position (relevanceResolver.namesOneWordName, issue
 * #362 D6). Unicode-aware: "Zoë" and "Élise" are whole words too (issue #322
 * V19).
 *
 * @param {string} text
 * @param {string} name
 * @returns {boolean}
 */
function lineNamesName(text, name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return false;
  return n.includes(' ') ? wholeWordPattern(n).test(text) : namesOneWordName(text, n);
}

/**
 * True when `playerText` names a player character other than the speaker. Used
 * to suppress social-move suggestions aimed at a fellow PC (finding G). Matches
 * each other PC's full name and their first name as whole words — a one-word
 * name only as a name is written (lineNamesName, issue #362 D6: a PC called
 * Will, Ash or Hope turned every other player's line with that word in it —
 * "I will press the dockmaster" — into narration with no move offered).
 *
 * @param {string} playerText
 * @param {string|null} speakerName
 * @param {Array<{name?: string}>} [pcActors] — injectable for tests
 * @returns {boolean}
 */
export function inputNamesOtherPlayerCharacter(playerText, speakerName, pcActors) {
  const text = String(playerText ?? '');
  if (!text.trim()) return false;
  let actors = pcActors;
  if (!Array.isArray(actors)) {
    try { actors = getPlayerActors(); } catch { actors = []; }
  }
  const speaker = String(speakerName ?? '').trim().toLowerCase();
  for (const a of actors) {
    const name = String(a?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.toLowerCase() === speaker) continue;
    for (const t of new Set([name, name.split(' ')[0]])) {
      if (t.length >= 2 && lineNamesName(text, t)) return true;
    }
  }
  return false;
}

// Words of an NPC's name nobody is called by ("the Escort", "Keeper of Ash").
const NAME_FILLER_WORDS = new Set(['the', 'of', 'and', 'von', 'van', 'del']);

/**
 * Whether a line read as a social move is spoken to a fellow player character
 * — on the MOVE path, where the line would otherwise be rolled (issue #354
 * P2-06; pacing/router.js decidePacing). Stricter than the offer's rule
 * (suppressPcDirectedSocialMove, which only withholds a suggestion): the line
 * must name another PC and name no tracked NPC, so "Archer, hand Karthik the
 * codes or I take them" — a Compel of Archer — is still rolled. A one-word
 * name — a PC's or an NPC's — counts only as a name is written, capitalised
 * as typed or in address position (lineNamesName, issue #362 D6).
 *
 * @param {string|null} moveId — the move the classifier named
 * @param {string} playerText
 * @param {string|null} speakerName
 * @param {{ campaignState?: Object|null, pcActors?: Array<{name?: string}>, npcNames?: string[] }} [opts] —
 *   `pcActors` / `npcNames` injectable for tests
 * @returns {boolean}
 */
export function lineIsToAFellowPlayerCharacter(moveId, playerText, speakerName, { campaignState = null, pcActors, npcNames } = {}) {
  if (!moveId || !PC_DIRECTED_SOCIAL_MOVES.has(moveId)) return false;
  if (!inputNamesOtherPlayerCharacter(playerText, speakerName, pcActors)) return false;
  const text = String(playerText ?? '');
  let names = npcNames;
  if (!Array.isArray(names)) {
    names = [];
    try {
      for (const id of campaignState?.connectionIds ?? []) {
        const name = getConnection(id)?.name;
        if (name) names.push(name);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: the NPC names could not be read for the fellow-PC check:`, err?.message ?? err);
    }
  }
  for (const raw of names) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    // The full name, or any word of it a player would call them by ("Archer").
    const tokens = new Set([name, ...name.split(' ').filter(t => t.length >= 3 && !NAME_FILLER_WORDS.has(t.toLowerCase()))]);
    for (const t of tokens) {
      if (lineNamesName(text, t)) return false;
    }
  }
  return true;
}

/**
 * Drop a social-move nomination that targets a fellow player character
 * (finding G); pass any other move through. The nomination is read as a move
 * id whatever its case or form ("Compel" is compel — issue #321 U45), and one
 * that names no move is dropped, since it becomes the card's Roll button.
 *
 * @param {string|null} suggestedMove
 * @param {string} playerText
 * @param {string|null} speakerName
 * @param {Array<{name?: string}>} [pcActors] — injectable for tests
 * @returns {string|null} the nominated move's id, or null
 */
export function suppressPcDirectedSocialMove(suggestedMove, playerText, speakerName, pcActors) {
  const moveId = toMoveId(suggestedMove);
  if (!moveId || !PC_DIRECTED_SOCIAL_MOVES.has(moveId)) return moveId;
  return inputNamesOtherPlayerCharacter(playerText, speakerName, pcActors) ? null : moveId;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build entity-card strings for the matched entities returned by the relevance
 * resolver. Used to populate the "ENTITIES IN SCENE" section of the narrator
 * system prompt.
 */
function collectEntityCards(ids, types) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const cards = [];
  for (let i = 0; i < ids.length; i++) {
    const journalId = ids[i];
    const type      = types?.[i];
    if (!journalId || !type) continue;
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    let entity = null;
    try {
      entity = getter(journalId);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: load entity (${type} ${journalId}) failed:`, err);
      continue;
    }
    if (!entity) continue;
    const card = formatEntityCard(entity, type);
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * Build a { entityId → name } map for the matched entities. Used by the
 * fact-continuity ledger block in narratorPrompt.js so entity-subject lines
 * render with display names rather than journal IDs.
 */
function collectEntityNamesById(ids, types) {
  const map = new Map();
  if (!Array.isArray(ids) || !ids.length) return map;
  for (let i = 0; i < ids.length; i++) {
    const journalId = ids[i];
    const type      = types?.[i];
    if (!journalId || !type) continue;
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    try {
      const e = getter(journalId);
      if (e?.name) map.set(journalId, e.name);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: collectEntityNamesById (${type} ${journalId}) failed:`, err);
    }
  }
  return map;
}

/**
 * The current location's entity record (`!at` writes currentLocationId /
 * currentLocationType), or null when none is set or it cannot be loaded.
 */
function loadCurrentLocation(campaignState) {
  const id   = campaignState?.currentLocationId;
  const type = campaignState?.currentLocationType;
  if (!id || !type) return null;
  const getter = LOCATION_GETTERS[type];
  if (!getter) return null;
  try {
    return getter(id) ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: load currentLocation (${type} ${id}) failed:`, err);
    return null;
  }
}

/**
 * Build the current-location card from campaignState.currentLocationId.
 * Returns empty string when no current location is set or the record cannot
 * be resolved.
 */
function formatCurrentLocation(campaignState) {
  const entity = loadCurrentLocation(campaignState);
  return entity ? formatEntityCard(entity, campaignState.currentLocationType) : '';
}

/**
 * Display name of the current location, or null — for the Private Channel's
 * scene context, which used to read `currentLocationName` / `currentLocation`,
 * fields nothing writes (issue #282's campaignState field check).
 */
export function currentLocationName(campaignState) {
  const name = loadCurrentLocation(campaignState)?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * Render an established NPC's recorded profile for the active-sector roster.
 * Leads with `Name — Role` (kept as the stable head so reuse directives and
 * tests still match) and appends every other recorded attribute — goal,
 * motivation, pronouns, disposition, first look, rank, description — so the
 * narrator can keep the NPC consistent with who they already are instead of
 * inventing a contradictory identity (PLAYTEST-1717 C). Only present fields
 * are listed.
 *
 * @param {Object} c — a connection record from listConnections()
 * @returns {string}
 */
export function formatSectorNpcProfile(c) {
  const lead = `${c.name}${c.role ? ` — ${c.role}` : ''}`;
  const bits = [];
  // A lost connection says so first, with how it was lost, and its rolled
  // disposition reads as the initial one: the line offered a severed NPC as
  // friendly cast every turn, while only the entity card — rendered when the
  // player names them — said the bond was broken (issue #325 W37).
  const lost = c.active === false;
  if (lost)          bits.push(lostConnectionNote(c));
  if (c.goal)        bits.push(`Goal: ${c.goal}`);
  if (c.motivation)  bits.push(`Motivation: ${c.motivation}`);
  if (c.pronouns)    bits.push(`Pronouns: ${c.pronouns}`);
  if (c.disposition) bits.push(`${lost ? 'Initial disposition' : 'Disposition'}: ${c.disposition}`);
  const firstLook = Array.isArray(c.firstLook)
    ? c.firstLook.filter(Boolean).join(', ')
    : c.firstLook;
  if (firstLook)     bits.push(`First look: ${firstLook}`);
  if (c.rank)        bits.push(`Rank: ${c.rank}`);
  if (c.description) bits.push(c.description);
  return bits.length ? `${lead} (${bits.join('; ')})` : lead;
}

/** "connection lost: <how>" — the latest "Connection lost: …" history entry's reason, when there is one. */
function lostConnectionNote(c) {
  const entries = (Array.isArray(c?.history) ? c.history : [])
    .map(h => (typeof h === 'string' ? h : h?.entry))
    .filter(e => typeof e === 'string' && e.trim());
  const loss   = [...entries].reverse().find(e => /^\s*connection lost\b/i.test(e));
  const reason = loss ? loss.trim().replace(/^connection lost\s*:?\s*/i, '').trim() : '';
  return reason ? `connection lost: ${reason}` : 'connection lost';
}

/**
 * Build the active-sector anchor block for the narrator system prompt.
 *
 * The paced-narrative and scene-interrogation narrator paths previously had
 * no sector context whatsoever and would freely invent settlement names for
 * places the player was already inside. The move-pipeline narrator got
 * sector content through `buildSectorSection` in the assembler, but the
 * other two paths never call the assembler.
 *
 * This helper emits a directive block — not just a list — so the model is
 * pushed to *reuse* the established settlement names rather than inventing
 * alternatives. Returns empty string when no active sector is set.
 */
export function formatActiveSector(campaignState) {
  const id     = campaignState?.activeSectorId;
  if (!id) return '';
  const sector = (campaignState?.sectors ?? []).find(s => s.id === id);
  if (!sector) return '';

  const lines = [];
  lines.push(`Active sector: ${sector.name}`);
  const regionLabel = sector.regionLabel ?? sector.region;
  if (regionLabel) lines.push(`Region: ${regionLabel}`);
  if (sector.trouble) lines.push(`Trouble: ${sector.trouble}`);
  if (sector.faction) lines.push(`Faction control: ${sector.faction}`);

  // Established settlements WITH their rolled attributes (PLAYTEST-1712 T).
  // Surfacing each settlement's Authority and Trouble stops the narrator
  // inventing an official or governing figure for a settlement whose Authority
  // is "none / lawless" (the playtest created an "Administrator of Hypatia" for
  // a lawless settlement), and anchors new fiction to the established troubles.
  // Falls back to the map-data names when the Settlement Actor records can't be
  // read (e.g. mid-migration).
  let settlementLines = [];
  try {
    settlementLines = listSettlements(campaignState)
      .filter(s => s && (!s.sectorId || s.sectorId === id))
      .map(s => {
        const bits = [];
        if (s.authority) bits.push(`Authority: ${s.authority}`);
        if (s.trouble)   bits.push(`Trouble: ${s.trouble}`);
        // The world and star pinned beside it on the sector map — rolled at
        // creation, no entity of their own (issue #321 U51).
        const planet = formatSettlementPlanet(s.planet);
        if (planet)      bits.push(`Planet: ${planet}`);
        if (s.stellar)   bits.push(`Stellar object: ${s.stellar}`);
        return `- ${s.name}${bits.length ? ` (${bits.join('; ')})` : ''}`;
      });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: settlement read failed:`, err?.message ?? err);
  }
  if (!settlementLines.length) {
    settlementLines = (sector.mapData?.settlements ?? [])
      .map(s => s?.name).filter(Boolean).map(n => `- ${n}`);
  }
  if (settlementLines.length) {
    lines.push(
      '',
      'Established settlements (reuse these names and respect each one\'s ' +
      'Authority and Trouble — do not invent a new settlement for the same ' +
      'place, and do not introduce an official, administrator, or governing ' +
      'figure for a settlement whose Authority is none or lawless):',
      ...settlementLines,
    );
  }

  // Known planets & standalone locations (LIST-LOC-PLANET-DEAD fix, issue
  // #275): settlements and charted sites had standing anchors; planets and
  // named non-site locations did not, so the narrator could re-invent them.
  // Site records (type vault/derelict) are EXCLUDED here — undiscovered
  // sites must not leak (site-flow §5), and discovered ones render in the
  // Charted sites block below. Capped like the NPC roster.
  let planetLines = [];
  try {
    planetLines = listPlanets(campaignState)
      .filter(p => p && p.active !== false && (!p.sectorId || p.sectorId === id))
      .slice(0, 12)
      .map(p => `- ${p.name}${p.type ? ` (${p.type})` : ''}`);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: planet read failed:`, err?.message ?? err);
  }
  if (planetLines.length) {
    lines.push(
      '',
      'Known planets (established — reuse these names; do not invent a ' +
      'different world for the same place):',
      ...planetLines,
    );
  }

  let locationLines = [];
  try {
    locationLines = listLocations(campaignState)
      .filter(l => l && l.active !== false
        && l.type !== 'vault' && l.type !== 'derelict'
        && (!l.sectorId || l.sectorId === id))
      .slice(0, 12)
      .map(l => `- ${l.name}${l.type ? ` (${l.type})` : ''}`);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: location read failed:`, err?.message ?? err);
  }
  if (locationLines.length) {
    lines.push(
      '',
      'Known locations (established — reuse these; vaults and derelicts are ' +
      'listed under Charted sites once discovered):',
      ...locationLines,
    );
  }

  // Established NPCs in this sector (PLAYTEST-1712 T). Listing the existing cast
  // pushes the narrator to build on them — especially when envisioning an
  // inciting incident — rather than cold-inventing a new NPC. Each NPC carries
  // its full recorded profile (role, goal, pronouns, disposition, first look, …)
  // so the fiction can be kept consistent with who they already are rather than
  // contradicting an oracle-rolled identity (PLAYTEST-1717 C: an inciting
  // incident recast a "Prophet" sector NPC as a researcher). Capped so a large
  // campaign can't bloat the prompt.
  // A lost connection (`!sever`) is listed apart, never as reuse-first cast
  // (issue #325 W37).
  let npcLines  = [];
  let lostLines = [];
  try {
    const inSector = listConnections(campaignState)
      .filter(c => c && (!c.sectorId || c.sectorId === id));
    npcLines  = inSector.filter(c => c.active !== false).map(c => `- ${formatSectorNpcProfile(c)}`);
    lostLines = inSector.filter(c => c.active === false).map(c => `- ${formatSectorNpcProfile(c)}`);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: connection read failed:`, err?.message ?? err);
  }
  if (npcLines.length) {
    lines.push(
      '',
      'Established NPCs in this sector — when you feature one, keep them ' +
      'consistent with their recorded profile below: do not reassign their role ' +
      'or goal, change their pronouns or disposition, or invent a history that ' +
      'contradicts it. Build the fiction around who they already are:',
      ...npcLines,
    );
  }
  if (lostLines.length) {
    lines.push(
      '',
      'Lost connections in this sector — the bond with the crew is broken. ' +
      'They are not allies and not cast to reuse as friends; if one appears, ' +
      'the break shows:',
      ...lostLines,
    );
  }

  // Cast discipline — reuse before you invent (PLAYTEST-1712, throwaway
  // characters). When the fiction needs someone to fill a functional role, the
  // narrator should try an established character first and only mint a new one
  // when none can plausibly fit — and any new character is scoped to THIS
  // sector, consistent with its authority and troubles, so it can recur rather
  // than being a drifting one-off. Always emitted when a sector is active, even
  // when the roster is empty (the sector-scoping half still applies).
  const reuseTarget = npcLines.length
    ? 'one of the NPCs listed above, a player character, or any entity already in the scene'
    : 'a player character, an entity already in the scene, or any character established elsewhere in the campaign';
  lines.push(
    '',
    'CAST DISCIPLINE — reuse before you invent: when this scene needs a ' +
    'character to fill a role (an official, a vendor, a pilot, a fixer, a guard, ' +
    'a witness, a contact, a voice on the comm), FIRST decide whether an ' +
    `established character — ${reuseTarget} — can plausibly fill it, and if so ` +
    'use them by name. Introduce a brand-new named character ONLY when none of ' +
    `the established cast can fill the role; any new character you do introduce ` +
    `belongs to ${sector.name}, consistent with its authority and troubles, and ` +
    'should be given enough substance to recur — not a single throwaway mention.',
  );


  // Charted sites (SITE-ANCHOR-ABSENT fix, 2026-07): DISCOVERED vaults and
  // derelicts join the standing sector picture so prose about "the derelict"
  // has an anchor between discovery and arrival. Undiscovered sites stay
  // hidden. Status comes from the location record (visited/cleared).
  try {
    const charted = (sector.mapData?.discoveries ?? [])
      .filter(d => d && d.discovered)
      .map(d => {
        // The site by its location Actor's name, the record's generated one a
        // fallback (issue #326 W75 — a renamed site had two names).
        let status = "";
        let name = d.name;
        try {
          const loc = getLocation(d.actorId);
          status = loc?.status ?? "";
          if (typeof loc?.name === "string" && loc.name.trim()) name = loc.name.trim();
        } catch (err) { console.debug?.(`${MODULE_ID} | narrator: site status read failed:`, err?.message ?? err); }
        return `- ${name} (${d.type}${status ? `, ${status}` : ""})`;
      });
    if (charted.length) {
      lines.push("Charted sites (established — do not reinvent them):");
      lines.push(...charted);
    }
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: charted-sites block failed:`, err?.message ?? err);
  }

  return lines.join('\n');
}

async function postSceneCard(question, responseText, sessionId, playerName = null, narrationId = null) {
  return ChatMessage.create({
    content: `
      <div class="sf-scene-card">
        <div class="sf-scene-label">◈ Scene</div>
        <div class="sf-scene-question">${escapeHtml(question)}</div>
        <div class="sf-scene-prose">${proseToHtml(responseText)}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneResponse: true,
        sceneText:     responseText,
        sceneQuestion: question,
        // Narrator-memory A1 — a scene answer is something the narrator
        // said: it feeds the recent-narration ring, the rolling summary's
        // source and the session recap, so a later beat does not contradict
        // it. Kept when the answer stopped being written back (known-issues
        // SCENE-ANSWER-NOT-A-CAMERA); `sceneResponse` is what keeps it from
        // counting as a narration where one is meant (the first-narration
        // recap, the X-Card's redirect). Audited consumers:
        // the correction/audio render hooks no-op (no button markup on
        // this card), burn-supersede requires a resolutionId.
        narratorCard:  true,
        narrationText: responseText,
        sessionId:     sessionId ?? null,
        playerName:    playerName ?? null,   // with sceneQuestion, read back by the ring (ringEntryText)
        narrationId:   narrationId ?? null,  // the X-Card names the answer it removes by it (issue #321 U07)
      },
    },
  });
}

async function postSceneFallbackCard(question, reason, sessionId) {
  return ChatMessage.create({
    content: `
      <div class="sf-scene-card sf-scene-fallback">
        <div class="sf-scene-label">◈ Scene</div>
        <div class="sf-scene-question">${escapeHtml(question)}</div>
        <div class="sf-scene-error">${escapeHtml(reason)}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneResponse:    true,
        sceneFallback:    true,
        sceneQuestion:    question,
        sceneFailReason:  reason,
        sessionId:        sessionId ?? null,
      },
    },
  });
}

/**
 * Short notice posted instead of move narration while the X-Card is active.
 * Deliberately NOT flagged as a narrator card, so it never enters the
 * recent-narration ring, the rolling summary or the chronicle.
 */
async function postNarrationPausedCard(resolution, campaignState = null) {
  const moveInfo = resolution?.moveName && resolution?.outcomeLabel
    ? `${resolution.moveName}: ${resolution.outcomeLabel}`
    : 'Move resolved.';
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${moveInfo}</div>
        <div class="sf-narration-error">${xCardDiscardReason(campaignState, 'Narration')}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narrationPaused: true,
        sessionId:       campaignState?.currentSessionId ?? null,
        moveId:          resolution?.moveId ?? null,
        resolutionId:    resolution?._id ?? '',
      },
    },
  });
}

/**
 * Short notice posted instead of a paced narration — a typed line the pacing
 * classifier read as narrative — while the X-Card is active (issue #345
 * AA29): a move gets postNarrationPausedCard, `@scene` its fallback card, and
 * the line got nothing. Not a narrator card, so it never enters the
 * recent-narration ring, the rolling summary or the chronicle; posted by the
 * client that narrates the line (the chat pipeline's, the canonical GM).
 *
 * @param {Object|null} [campaignState]
 * @returns {Promise<ChatMessage|null>}
 */
async function postPacedNarrationPausedCard(campaignState = null) {
  try {
    return await ChatMessage.create({
      content: `
        <div class="sf-narration-card sf-narration-fallback">
          <div class="sf-narration-label">◈ Narrator</div>
          <div class="sf-narration-prose">That line was not narrated &mdash; say it again once a GM resumes.</div>
          <div class="sf-narration-error">${xCardDiscardReason(campaignState, 'Narration')}</div>
        </div>
      `.trim(),
      flags: {
        [MODULE_ID]: {
          narrationPaused: true,
          sessionId: campaignState?.currentSessionId ?? null,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | narratePacedInput: the paused notice could not be posted:`, err?.message ?? err);
    return null;
  }
}

/**
 * The pacing router's way to tell the table a line it read as narrative was
 * not narrated — a throw before narratePacedInput began (known-issues
 * PACED-ROUTER-THROW). Never throws.
 *
 * @param {Object|null} campaignState
 * @param {unknown} err — the cause, worded by claudeFailureReason
 * @returns {Promise<ChatMessage|null>}
 */
export function tellPacedLineNotNarrated(campaignState, err) {
  return postPacedNarrationFailedCard(campaignState, claudeFailureReason(err));
}

/**
 * Short notice posted when a paced narration — a typed line the pacing
 * classifier read as narrative — could not be written: its Claude call failed
 * (overloaded, a server error, a timeout, a rate limit on the retry too), its
 * reply had no prose (issue #347 AB21), or its prompt could not be built
 * (issue #347 residual PACED-NARRATION-THROW-BEFORE-CALL). A move's failed narration posts
 * postFallbackCard and `@scene` its fallback card; the line posted nothing and
 * told nobody, after a wait of up to four minutes, and just sat in chat. Not
 * a narrator card, so it never enters the recent-narration ring, the rolling
 * summary or the chronicle; posted by the client that narrates the line (the
 * chat pipeline's, the canonical GM).
 *
 * @param {Object|null} [campaignState]
 * @param {string} [reason] — failureReason.js clause
 * @returns {Promise<ChatMessage|null>}
 */
async function postPacedNarrationFailedCard(campaignState = null, reason = claudeFailureReason(null)) {
  try {
    return await ChatMessage.create({
      content: `
        <div class="sf-narration-card sf-narration-fallback">
          <div class="sf-narration-label">◈ Narrator</div>
          <div class="sf-narration-prose">That line was not narrated &mdash; say it again in a moment.</div>
          <div class="sf-narration-error">Narration unavailable — ${escapeHtml(reason)}.</div>
        </div>
      `.trim(),
      flags: {
        [MODULE_ID]: {
          sessionId: campaignState?.currentSessionId ?? null,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | narratePacedInput: the failure notice could not be posted:`, err?.message ?? err);
    return null;
  }
}

/**
 * A move's card when its narration failed: the move and outcome, and why —
 * by cause (ERROR-TEXT-BLAMES-KEY: every failure said "check your API key and
 * proxy").
 *
 * @param {Object} resolution
 * @param {Object|null} [campaignState]
 * @param {string} [reason] — failureReason.js clause
 */
async function postFallbackCard(resolution, campaignState = null, reason = claudeFailureReason(null)) {
  const moveInfo = resolution?.moveName && resolution?.outcomeLabel
    ? `${resolution.moveName}: ${resolution.outcomeLabel}`
    : 'Move resolved.';
  const fallbackProse = `${moveInfo} — narration unavailable.`;

  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${moveInfo}</div>
        <div class="sf-narration-error">Narration unavailable — ${escapeHtml(reason)}.</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        // Match the success-path narratorCard flag shape so the session
        // recap still counts the move and the live-Quench narrator-card
        // assertion can locate the fallback alongside real narrations. The
        // line is not fiction: `narrationFallback` keeps it out of the ring,
        // the rolling summary and the first-narration check
        // (sessionNarratorCards — issue #321 U35).
        narratorCard:      true,
        narrationCard:     true,
        narrationFallback: true,
        narrationText:     fallbackProse,
        sessionId:         campaignState?.currentSessionId ?? null,
        sessionNumber:     campaignState?.sessionNumber     ?? null,
        moveId:            resolution?.moveId               ?? null,
        outcome:           resolution?.outcome              ?? null,
        resolutionId:      resolution?._id                  ?? '',
        matchedEntityIds:  [],
        timestamp:         new Date().toISOString(),
      },
    },
  });
}

/**
 * Ensure an active fact-continuity scene exists before a narrator call.
 * If `currentSceneId` is null, assigns one by calling startScene with the
 * given reason — on the canonical GM only (a world write); elsewhere it
 * debug-logs and returns. A persist failure is logged, never thrown.
 *
 * @param {Object} campaignState
 * @param {string} reason — diagnostic only ("first_narration", "paced_narrative", …)
 */
async function ensureSceneStarted(campaignState, reason) {
  if (!campaignState) return;
  let enabled = true;
  try {
    enabled = game.settings.get(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | ensureSceneStarted: setting lookup failed; defaulting to enabled:`, err);
  }
  if (!enabled) return;
  if (campaignState.currentSceneId) return;
  // A scene boundary is a world write (campaignState, WJ Lore pages, entity
  // tiers) — single-emitter, like the sidecar apply. A RUN_ON.CLAUDE command
  // or oracle follow-up narrating on a keyed author's client (no keyed GM
  // online) leaves it to the GM's next narration.
  if (!isCanonicalGM()) {
    console.debug?.(`${MODULE_ID} | ensureSceneStarted (${reason}): not the canonical GM — scene start left to the GM.`);
    return;
  }
  await startScene(campaignState, { reason });
}

/** Whether fact continuity is switched on — on when the setting cannot be read (unit tests, very early init). */
function factContinuityEnabled() {
  try {
    return (game.settings.get(MODULE_ID, 'factContinuity.enabled') ?? true) !== false;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | factContinuity: setting lookup failed; defaulting to enabled:`, err);
    return true;
  }
}

/**
 * What the code owes a narration written with fact continuity off (issue #364
 * PLAN-REQUESTS-FACT-CONTINUITY-OFF). No fact block is read then, and none of
 * the scene's ledgers is written — but two things a narration carries are the
 * code's, not its fact block's, and were dropped with the block:
 *   - the plans it was asked to decide (`ctx.planRequests` — a price's new
 *     enemy, an expedition begun, a vow sworn): the narrator is shown no
 *     DECIDE NOW without the sidecar, so each is filed with its oracle rolls
 *     alone, which exist nowhere else (issue #362 AC07's rule);
 *   - the step it was made to play (`ctx.reveals` — a plan clock's trigger
 *     vignette, a chosen complication): unmarked, the plan's clock stayed
 *     full for good with its vignette written (issue #362 AC08's shape).
 * Stamped with the narration's id, as its side-data is. Only for a reply with
 * prose: every caller files the requests of a narration it did not post
 * (fileUnansweredPlanRequests, fileRequestedPlan), and one filed here too
 * would be planned twice. On the canonical GM, else relayed to it.
 * Fire-and-forget; never throws.
 *
 * @param {string} rawText — the narrator's reply
 * @param {Object|null} campaignState
 * @param {Object} ctx — applyNarratorSidecar's
 */
function applyOwedPlanSideData(rawText, campaignState, ctx = {}) {
  if (!campaignState || typeof rawText !== 'string' || !rawText.trim()) return;
  const forced = normaliseReveals(ctx.reveals);
  const planRequests = Array.isArray(ctx.planRequests) ? ctx.planRequests : [];
  if (!forced.length && !planRequests.length) return;
  try {
    const sidecar = { ...normaliseSidecar({}), reveals: forced };
    if (isCanonicalGM()) {
      void applyPlanSideData(sidecar, {
        campaignState,
        narrationId:      typeof ctx.narrationId === 'string' ? ctx.narrationId : null,
        moveId:           ctx.moveId ?? null,
        planRequests,
        endingSubjectIds: Array.isArray(ctx.endingTrackIds) ? ctx.endingTrackIds : [],
      });
    } else {
      relayNarratorSidecar(sidecar, campaignState, ctx);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the plans this narration was asked to decide, and the step it played, were not recorded:`, err?.message ?? err);
  }
}

/**
 * Process a raw narrator API response: strip the fenced JSON sidecar from
 * the prose, apply it to the active-scene ledgers in campaignState, and
 * persist campaignState in the background. Returns the prose with the
 * sidecar removed. See issue #227 (Fact Continuity) §7–8.
 *
 * Failures (missing block, JSON parse error, persistence write rejected)
 * never block the narrator: the prose is always returned, only ledger
 * updates are skipped.
 *
 * @param {string} rawText
 * @param {Object} campaignState
 * @param {Object} [ctx]
 * @param {string|null} [ctx.moveId]
 * @param {string|null} [ctx.narrationId] — the narration's id (its card
 *   carries it too), stamped on what the sidecar writes (issue #321 U07)
 * @returns {string} prose with the sidecar block removed
 */
export function applyNarratorSidecar(rawText, campaignState, ctx = {}) {
  // Master gate — when fact-continuity is disabled, return the raw text
  // unchanged. The sidecar instruction is also suppressed at the prompt
  // layer so well-behaved narrators won't emit a fence in this state, but
  // skip the parse just in case to avoid mutating ledgers silently. What the
  // code owes the narration — its plan requests, the step it was made to
  // play — is not the fact block's, and is still recorded.
  if (!factContinuityEnabled()) {
    recordNarratorFactBlock(rawText, { skipped: 'fact continuity is off' });
    applyOwedPlanSideData(rawText, campaignState, ctx);
    return rawText;
  }

  const parsedBlock = extractSidecar(rawText);
  const { prose, parseError } = parsedBlock;
  recordNarratorFactBlock(rawText, { sidecar: parsedBlock.sidecar, parseError });
  // A session set-piece's rolled material (issue #381): each seed is marked,
  // in place, with the fact block's account of it — "builtFrom", checked
  // against the prose. With no fact block read there is no account, and the
  // seeds are left as they were. Nothing is retried on it.
  if (Array.isArray(ctx.seeds)) markSeedsUsed(ctx.seeds, parsedBlock.sidecar ? parsedBlock.sidecar.builtFrom : null, prose);
  // What the narration was made to play — a clock's escalation step, a chosen
  // complication's (issue #353 Phase 3) — is marked whatever its sidecar
  // says: added to the sidecar's own reveals, so it is applied (or relayed)
  // with the narration's id like the rest.
  const forced = normaliseReveals(ctx.reveals);
  // The plans this narration was asked to decide (DECIDE NOW) are filed
  // whatever its fact block holds — cut off, unreadable or missing, with
  // their rolls alone (issue #362 AC07; decisions.md "keep the raw rolls as
  // the skeleton"): the request is the move's, and its rolls exist nowhere
  // else.
  const asked = Array.isArray(ctx.planRequests) && ctx.planRequests.length > 0;
  // A plan's truth is revealed by prose that tells it, never by the fact
  // block's say alone (VOW-FULFILLED-WITH-NOBODY-NAMED): "truth" comes off a
  // reveal of the narration's own whose prose told none of it, before the
  // ledger and the plans read the block. A step the code forced is left.
  const written = withoutUntoldTruths(parsedBlock.sidecar, prose);
  // The forced reveals go first: the reveals are capped at
  // REVEALS_PER_SIDECAR, and a fact block that held four of its own cut the
  // step the beat was made to play — its clock then stayed full though the
  // vignette was written (issue #362 AC08; coverage FC D5).
  const sidecar = (forced.length || asked)
    ? { ...(written ?? normaliseSidecar({})),
      ...(forced.length ? { reveals: [...forced, ...(written?.reveals ?? [])] } : {}) }
    : written;

  if (parseError) {
    console.warn(`${MODULE_ID} | factContinuity: sidecar parse failed:`, parseError);
  } else if (!parsedBlock.sidecar) {
    // NARR-SIDECAR-SILENT (narrator-context audit 2026-07): the sidecar is
    // MANDATORY in every mode that reaches this function, so a response with
    // no fence at all means this turn's scene-frame update and required
    // emissions are lost. That used to happen with zero logging — a
    // no-silent-failures violation. Warn; never block the narration post.
    console.warn(
      `${MODULE_ID} | factContinuity: narrator response carried no sidecar fence — ` +
      `this turn's scene-frame update and required emissions were not captured.`,
    );
  }

  // Hardening (multiplayer): applying the sidecar persists campaignState (a
  // world-scoped Setting) and may update the ship Actor. Players lack
  // permission for world writes, so gate the whole apply-and-persist block on
  // the canonical GM. The clean prose is extracted above and still returned
  // below, so a non-canonical caller gets correct text with no failed server
  // write. The move pipeline runs only on the canonical GM, but some narration
  // legitimately runs elsewhere: an oracle follow-up or a RUN_ON.CLAUDE
  // command (@scene, !recap, !incite, …) runs on the author's keyed client
  // when no keyed GM is connected (src/oracles/oracleFollowup.js,
  // src/index.js chat routing). There the side-data is relayed to the
  // canonical GM (issue #286 D2: it was dropped, so a keyless-GM table's
  // narrated facts never reached the ledger).
  //
  // A reply with no prose is no narration (issue #362 AC39): every caller
  // posts its fallback card, or nothing, for it — and a fallback card carries
  // no narrationId (invariant 1) — so nothing of its fact block is recorded.
  // Its truths, state, frame and plan writes were stamped with an id no card
  // carries: told to every later narration as established, and out of every
  // X-Card's reach.
  const narrated = typeof prose === 'string' && prose.trim().length > 0;
  if (sidecar && !narrated) {
    console.debug?.(`${MODULE_ID} | factContinuity: the narrator's reply had no prose — its fact block is not recorded.`);
  }
  const applySidecarHere = isCanonicalGM();
  if (sidecar && campaignState && narrated && !applySidecarHere) {
    relayNarratorSidecar(sidecar, campaignState, ctx);
  }
  if (sidecar && campaignState && narrated && applySidecarHere) {
    applySidecarSideData(sidecar, campaignState, ctx);
  }

  // Phase E — optional Haiku audit of the prose against the active-scene
  // ledger. Gated inside runConsistencyCheck on the
  // factContinuity.consistencyCheck setting; fire-and-forget. Also gated on
  // the canonical GM here: the audit makes an API call and posts a GM-only
  // review card, so it must be single-emitter like the writes above. It
  // audits the ledger as it stands in the store, never the caller's
  // pre-dialog snapshot (auditCampaignState, issue #329 X02).
  if (campaignState && prose?.trim() && isCanonicalGM()) {
    runConsistencyCheck(prose, auditCampaignState(campaignState), {
      matchedEntityIds:  ctx.matchedEntityIds ?? [],
      currentLocationId: campaignState.currentLocationId ?? null,
      narrationId:       typeof ctx.narrationId === 'string' ? ctx.narrationId : null,
    }).catch(err =>
      console.warn(`${MODULE_ID} | factContinuity: consistencyCheck dispatch failed:`, err),
    );
  }

  return prose ?? rawText;
}

/**
 * Send a narration's side-data to the canonical GM (GM relay
 * `"narrator.sidecar"`), from a client that narrated on its own key. Tagged
 * with the scene it was written in, so the GM drops it if that scene has
 * ended. Fire-and-forget; with no GM connected nothing can be recorded.
 */
function relayNarratorSidecar(sidecar, campaignState, ctx) {
  // The step a clock vignette or a chosen complication was made to play rides
  // apart from the fact block, with what forced it, for the GM to check: a
  // relayed block's own reveals are dropped there (issue #362 D2).
  const forced = normaliseReveals(ctx.reveals);
  const cause = ctx.forcedFor && typeof ctx.forcedFor === 'object' ? ctx.forcedFor : {};
  import('../multiplayer/gmRelay.js').then(({ requestGmAction, hasActiveGM }) => {
    if (!hasActiveGM()) {
      console.debug?.(`${MODULE_ID} | factContinuity: no GM connected — narrator side-data (truths, state changes, scene frame) not recorded.`);
      return null;
    }
    return requestGmAction('narrator.sidecar', {
      sidecar:          { ...sidecar, reveals: [] },
      sceneId:          campaignState.currentSceneId ?? null,
      moveId:           ctx.moveId ?? null,
      matchedEntityIds: Array.isArray(ctx.matchedEntityIds) ? ctx.matchedEntityIds : [],
      narrationId:      typeof ctx.narrationId === 'string' ? ctx.narrationId : null,
      // The plans the narration was asked to decide (issue #353): the GM files them.
      planRequests:     Array.isArray(ctx.planRequests) ? ctx.planRequests : [],
      // A session vignette's frame is a bookend's (applySidecarSideData).
      ...(ctx.bookend === true ? { bookend: true } : {}),
      ...(forced.length ? { forced: {
        reveals: forced,
        ...(typeof cause.clockId === 'string' && cause.clockId ? { clockId: cause.clockId } : {}),
        ...(cause.complication && typeof cause.complication === 'object' ? { complication: {
          scope:   typeof cause.complication.scope === 'string' ? cause.complication.scope : null,
          trackId: typeof cause.complication.trackId === 'string' ? cause.complication.trackId : null,
        } } : {}),
      } } : {}),
    });
  }).catch(err =>
    console.warn(`${MODULE_ID} | factContinuity: narrator side-data relay failed:`, err?.message ?? err));
}

/**
 * The plans a narration was asked to decide (UNREVEALED → DECIDE NOW — a
 * price's new enemy, an expedition begun, a discovery), filed with their
 * rolls alone when it wrote no narration: its reply had no prose, or its call
 * failed (issue #362 AC07; decisions.md "keep the raw rolls as the
 * skeleton"). The next narration they are in play for decides them. A reply
 * with prose files them through its own side-data, its fact block readable or
 * not (applyNarratorSidecar). Unstamped: no card carries the narration's id.
 * On the canonical GM, else relayed to it, as a sidecar's are. Fire-and-forget;
 * never throws.
 *
 * @param {Object[]} planRequests — the narration's extras.planRequests
 * @param {Object|null} campaignState
 * @param {{ moveId?: string|null }} [opts]
 */
function fileUnansweredPlanRequests(planRequests, campaignState, { moveId = null } = {}) {
  if (!Array.isArray(planRequests) || !planRequests.length || !campaignState) return;
  try {
    const sidecar = normaliseSidecar({});
    if (isCanonicalGM()) void applyPlanSideData(sidecar, { campaignState, narrationId: null, moveId, planRequests });
    else relayNarratorSidecar(sidecar, campaignState, { moveId, planRequests });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the plans this narration was asked to decide were not filed:`, err?.message ?? err);
  }
}

/** Truths and state changes taken from one relayed sidecar, at most (a response emits a handful). */
const RELAYED_SIDECAR_MAX_ENTRIES = 20;

/**
 * GM-relay handler for `"narrator.sidecar"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js): apply side-data a player's client narrated on
 * its own key, onto the latest stored campaignState. Dropped when the scene it
 * was written in has ended; when no scene is active yet, one starts first (the
 * player's client could not start it). Like any narration on a player's key,
 * the content is the player's client's — the same trust as its prose. Also
 * dropped when the X-Card has removed the narration it came with (issue #321
 * U07): it may arrive after the X-Card retracted that narration's facts.
 *
 * What it may do to the hidden plans is narrower (issue #362 D2, the
 * maintainer's answer A): plan ids are public (a clock's `planId`, a rolls
 * card's `skeletonId`), so a hand-made relay could reveal a hidden truth into
 * the ledger, Lore and a table card, or rewrite or end a plan. Its `reveals`
 * are dropped, and its `plans` but the answers to its own plan requests (by
 * their refs, `sameAs` taken off: a plan by id is no relay's to name); its
 * `openQuestions`, `newThreats` and `countdown` stand — the countdown about
 * what its `about` names, never the plan of that id (`relayed`, secrets.js
 * applyCountdown; issue #364 RELAYED-COUNTDOWN-ABOUT-BY-ID: by id it hung a
 * new clock on a plan that had none). The step a clock
 * vignette or a chosen complication was made to play rides apart (`forced`)
 * and stands only as this GM would force it for the same cause
 * (standingForcedReveals) — dropping it would leave the plan's clock full
 * with its vignette written (issue #362 AC08).
 *
 * @param {{ sidecar: Object, sceneId?: string|null, moveId?: string|null, narrationId?: string|null,
 *   planRequests?: Object[], forced?: { reveals: Object[], clockId?: string, complication?: Object }|null }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<void>}
 */
export async function applyRelayedNarratorSidecar(payload = {}, _ctx = {}) {
  // Re-normalised and bounded: it crossed the socket from a client.
  const sidecar = normaliseSidecar(payload?.sidecar);
  if (!sidecar) return;
  sidecar.newTruths    = sidecar.newTruths.slice(0, RELAYED_SIDECAR_MAX_ENTRIES);
  sidecar.stateChanges = sidecar.stateChanges.slice(0, RELAYED_SIDECAR_MAX_ENTRIES);
  const planRequests = normalisePlanRequests(payload.planRequests);
  const refs = new Set(planRequests.map(r => r.ref));
  sidecar.plans   = sidecar.plans.filter(p => refs.has(p.id)).map(p => ({ ...p, sameAs: '' }));
  sidecar.reveals = [];
  const narrationId = (typeof payload.narrationId === 'string' && /^[\w-]{1,64}$/.test(payload.narrationId))
    ? payload.narrationId : null;
  // A working copy: the scene start and the sidecar apply change the object
  // they are given, and a write the world refuses must leave this client's
  // cached setting as the world has it (issue #329 X09).
  const stored = game.settings.get(MODULE_ID, 'campaignState');
  if (!stored) return;
  const campaignState = foundry.utils.deepClone(stored);
  if (payload.sceneId && payload.sceneId !== (campaignState.currentSceneId ?? null)) {
    console.debug?.(`${MODULE_ID} | factContinuity: relayed narrator side-data belongs to a scene that has ended — dropped.`);
    return;
  }
  if (narrationId && (campaignState.xCardedNarrationIds ?? []).includes(narrationId)) {
    console.debug?.(`${MODULE_ID} | factContinuity: relayed narrator side-data belongs to a narration the X-Card removed — dropped.`);
    return;
  }
  // With fact continuity off no fact block was read on the client that
  // narrated, and none is applied here: only what the code owes the narration
  // — its plan requests, filed with their rolls alone, and the step it was
  // made to play, as this GM would force it (applyOwedPlanSideData; issue
  // #364 PLAN-REQUESTS-FACT-CONTINUITY-OFF). No ledger is written.
  if (!factContinuityEnabled()) {
    const reveals = await standingForcedReveals(payload.forced, campaignState);
    await applyPlanSideData({ ...normaliseSidecar({}), reveals }, {
      campaignState, narrationId, moveId: payload.moveId ?? null, planRequests,
    });
    return;
  }
  await ensureSceneStarted(campaignState, 'relayed_narration');
  sidecar.reveals = await standingForcedReveals(payload.forced, campaignState);
  await applySidecarSideData(sidecar, campaignState, {
    moveId: payload.moveId ?? null, narrationId, planRequests, relayed: true,
    bookend: payload.bookend === true,
  });
}

/**
 * The step marks a relayed narration was made to play (`forced` — a clock
 * vignette's, a chosen complication's) that stand on this GM (issue #362 D2):
 * those this GM forces itself for the same cause — the plan the clock paces,
 * its next step or its answer, while that clock is full (stepRevealsOf); the
 * in-scene plan's next step a complication of that scope plays
 * (complicationStep) — and nothing else. Never throws.
 *
 * @param {{ reveals?: Object[], clockId?: string, complication?: { scope?: string|null, trackId?: string|null } }|null} forced
 * @param {Object} campaignState — the store's, as this GM reads it
 * @returns {Promise<Object[]>} normaliseReveals' entries
 */
async function standingForcedReveals(forced, campaignState) {
  const given = normaliseReveals(forced?.reveals);
  if (!given.length || !skeletonsEnabled()) return [];
  try {
    let expected = [];
    if (typeof forced.clockId === 'string' && forced.clockId) {
      const paced = planForClock(forced.clockId);
      const clock = paced ? planClock(paced.plan) : null;
      expected = clock && (clock.filled ?? 0) >= clock.segments ? stepRevealsOf(paced) : [];
    } else if (forced.complication && typeof forced.complication === 'object') {
      const scope   = typeof forced.complication.scope === 'string' ? forced.complication.scope : null;
      const trackId = typeof forced.complication.trackId === 'string' ? forced.complication.trackId : null;
      const step = await complicationStep(campaignState, scope, trackId);
      expected = step ? [{ id: step.plan.id, advanced: step.step.id }] : [];
    }
    const key = (r) => JSON.stringify([r.id, r.advanced ?? null, [...(r.revealed ?? [])].sort(), r.resolved === true]);
    const standing = new Set(normaliseReveals(expected).map(key));
    return given.filter(r => standing.has(key(r)));
  } catch (err) {
    console.warn(`${MODULE_ID} | factContinuity: a relayed narration's forced step could not be checked — dropped:`, err?.message ?? err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// How long a scene's question stands (known-issues NARRATOR-REFRAINS)
// ---------------------------------------------------------------------------
//
// The scene frame's `question` (issue #353 R2) is what the scene is deciding.
// ledgers.js applySceneFrame keeps it, word for word, until a beat marks it
// answered — and nothing ends a scene but the table, so a session is one
// scene. In the long haul's third live run a session's opening vignette set
// "What is the speaker over the hatch about to say?", the player never took
// the hook up, and it stood in 22 of the session's prompts: 23 narrations of
// 23 ended on the speaker, the drawer, the needle or the lamp.
//
// Two rules, applied around applySceneFrame (applySidecarSideData):
//   - a session vignette is a bookend, not a beat of play: its frame never
//     sets, rewords or answers the question (bookendFrame), and it is not
//     counted against one;
//   - a question play has not answered in SCENE_QUESTION_BEATS beats is
//     released (countSceneQuestionBeat): the frame holds none, and the next
//     prompt asks for the one the scene turns on now (narratorPrompt.js
//     buildLedgerBlock's `askSceneQuestion`).
//
// The count is `questionBeats`, on the frame beside the question it counts —
// the one store of both (campaignState.sceneFrame): saved and merged with the
// frame, so it survives a reload, and carried in the frame's `previous` chain,
// so an X-Card on a beat puts back the count that beat changed.

/**
 * How many beats of play a scene's question stands unanswered before it is
 * released. From the long haul's third live run: no question was answered
 * later than its second beat (a2 → a3), and by the second, third and fifth
 * beat the narrator's own fact block had moved to another question (a12,
 * a25, a62 — each refused, the old one kept). Three leaves a question the
 * player takes up its approach and its answer, and lets go before a refrain
 * sets in (that run's ran eleven to thirteen narrations).
 */
export const SCENE_QUESTION_BEATS = 3;

/** A frame's open question — '' with none, or once it is answered. */
function openSceneQuestion(frame) {
  if (!frame || typeof frame !== 'object' || frame.questionAnswered === true) return '';
  return typeof frame.question === 'string' ? frame.question.trim() : '';
}

/**
 * The frame a session vignette's fact block writes: where it is set, who is
 * in it and what is happening — never a question. A vignette brackets the
 * session (the galley before play, a cutaway to an NPC after it) and is told
 * to close on a hook; that hook is not what the players' scene turns on, and
 * the question is the one part of a frame a later snapshot cannot replace.
 * With the question taken off, applySceneFrame keeps whatever the scene's
 * frame already holds — its question, and whether it is answered.
 *
 * Where / present / now are written as any narration's are (a full
 * replacement the next beat replaces in turn): the closing cutaway's scene is
 * its own (rules/narrator-memory.md invariant 6), its facts filed at that
 * scene's end by the place its frame names; the galley's frame is where the
 * table has just been shown the characters, and stands until the first line
 * of play moves it.
 *
 * @param {Object|null} frame — the vignette's sidecar frame (normalised)
 * @returns {Object|null} the frame to apply
 */
export function bookendFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const rest = { ...frame };
  delete rest.question;
  delete rest.questionAnswered;
  return rest;
}

/**
 * Count one beat against the scene's question, on the frame applySceneFrame
 * has just written. A question this beat set starts at 0; one kept from the
 * frame before stands one beat longer; at SCENE_QUESTION_BEATS it is released
 * — the frame keeps no question, so the next beat's is the scene's. An
 * answered question is not counted (its mark already hands over to the next).
 * A bookend's frame (`bookend`) is no beat of play: the count stays as it was.
 *
 * @param {Object|null} frame — the scene's new frame
 * @param {Object|null} prior — the frame it replaced
 * @param {{ bookend?: boolean }} [opts]
 * @returns {Object|null} the frame with its count, or without its question
 */
export function countSceneQuestionBeat(frame, prior, { bookend = false } = {}) {
  if (!frame || typeof frame !== 'object') return frame;
  const rest = { ...frame };
  delete rest.questionBeats;
  const question = openSceneQuestion(frame);
  if (!question) return rest;
  const sameScene = !!prior && typeof prior === 'object' && (prior.sceneId ?? null) === (frame.sceneId ?? null);
  if (!sameScene || openSceneQuestion(prior) !== question) return { ...rest, questionBeats: 0 };
  const stood = Number.isInteger(prior.questionBeats) && prior.questionBeats > 0 ? prior.questionBeats : 0;
  const beats = bookend ? stood : stood + 1;
  if (beats < SCENE_QUESTION_BEATS) return { ...rest, questionBeats: beats };
  delete rest.question;
  delete rest.questionAnswered;
  return rest;
}

/**
 * Apply a parsed sidecar on the canonical GM: ship position to the command
 * vehicle, truths and state through applySidecar, the scene frame, then a
 * persist of the ledger fields onto the latest store.
 *
 * @returns {Promise<void>} settles when the ledger persist has (never rejects)
 */
function applySidecarSideData(sidecar, campaignState, ctx = {}) {
  let persisted = Promise.resolve();
  // Fact-continuity §20 — the "ship" subject is special-cased. A
  // stateChange with subject === "ship" and attribute === "position"
  // is routed to the command vehicle's persistent position field,
  // NOT to sceneState. We pull those entries out before applySidecar
  // sees them so the ledger stays clean and the assembler reads the
  // new position from the Ship Actor on the next turn.
  const shipPositionChanges = [];
  const otherChanges = [];
  for (const c of sidecar.stateChanges ?? []) {
    const subject   = typeof c?.subject === 'string' ? c.subject.trim().toLowerCase() : '';
    const attribute = typeof c?.attribute === 'string' ? c.attribute.trim().toLowerCase() : '';
    if (subject === 'ship' && attribute === 'position') {
      shipPositionChanges.push(c);
    } else {
      otherChanges.push(c);
    }
  }
  // A plan's truth this beat revealed becomes a stated fact (issue #353
  // Phase 2): a truth of the narration's own, stamped with its id, so the
  // X-Card retracts it with the reveal.
  // The tracks and vows the beat ends: a plan their end resolved is still
  // this narration's to reveal (issue #362 D4).
  const endingSubjectIds = Array.isArray(ctx.endingTrackIds) ? ctx.endingTrackIds : [];
  // A revealed truth is marked with its plan's id (`revealOf`): its reveal
  // files it as Lore, and the scene's end archives it no second time (issue
  // #362 AC37). The marker is the code's: one the model's own truths carry
  // is dropped. The revealed ones go first, so a model truth stating the same
  // fact is the duplicate the ledger skips, not the marked one.
  const ownTruths = (sidecar.newTruths ?? []).map(t => {
    if (!t || typeof t !== 'object' || !('revealOf' in t)) return t;
    const rest = { ...t };
    delete rest.revealOf;
    return rest;
  });
  const filteredSidecar = {
    ...sidecar,
    stateChanges: otherChanges,
    newTruths:    [...revealedTruthsOf(sidecar, { endingSubjectIds }), ...ownTruths],
  };

  try {
    // Narrator-memory A2 — resolve sidecar subjects against the full
    // entity roster so a confirmed NPC's truths/state land entity-keyed
    // (not as text subjects). Without this, entity-scoped ledger
    // filtering never matches and entries are only found by name
    // mention. Tolerant: an empty roster degrades to text subjects.
    let entities = [];
    try {
      entities = collectAllEntities(campaignState);
    } catch (err) {
      console.debug?.(`${MODULE_ID} | factContinuity: entity roster collect failed:`, err?.message ?? err);
    }

    // The narration id is stamped on every entry, so an X-Card on the
    // narration can retract them (issue #321 U07).
    const narrationId = typeof ctx.narrationId === 'string' ? ctx.narrationId : null;
    applySidecar(filteredSidecar, {
      campaignState,
      sessionId: campaignState.currentSessionId ?? null,
      sceneId:   campaignState.currentSceneId   ?? null,
      moveId:    ctx.moveId ?? null,
      asserter:  'narrator',
      entities,
      narrationId,
      // The re-assertion checks read the store's ledgers too: the move
      // pipeline's copy predates its confirm dialog, so a fact the X-Card or
      // a strike removed while the move waited was recorded live again
      // (issue #345 AA04 — W05's live read, for the write half).
      storedLedger: liveSceneLedger(campaignState),
    });

    // Narrator-memory A4 — merge the scene-frame snapshot (full
    // replacement; omitted frame keeps the previous one). Gated on its
    // own setting so the frame can be disabled independently.
    let frameEnabled = true;
    try {
      frameEnabled = game.settings.get(MODULE_ID, 'factContinuity.sceneFrame') ?? true;
    } catch (err) {
      // Unregistered (unit tests, early init) — default on.
      console.debug?.(`${MODULE_ID} | factContinuity: sceneFrame setting read failed:`, err?.message ?? err);
    }
    if (frameEnabled && sidecar.sceneFrame) {
      // How long the scene's question stands (known-issues NARRATOR-REFRAINS;
      // SCENE_QUESTION_BEATS, above): a session vignette is a bookend — its frame says
      // where, who and what, never the question — and every other beat is
      // counted against the question the frame keeps, which is released once
      // play has left it unanswered for SCENE_QUESTION_BEATS. A session's
      // opening vignette used to set the question its whole session was then
      // asked, beat after beat.
      const bookend = ctx.bookend === true;
      const prior = campaignState.sceneFrame ?? null;
      const frame = bookend ? bookendFrame(sidecar.sceneFrame) : sidecar.sceneFrame;
      if (frame && applySceneFrame(frame, campaignState, { narrationId })) {
        campaignState.sceneFrame = countSceneQuestionBeat(campaignState.sceneFrame, prior, { bookend });
      }
    }

    // Persist only the ledger fields the sidecar wrote, merged onto the
    // latest stored campaignState: the caller's object may be the move
    // pipeline's pre-narration snapshot. Writing it whole reverted a relayed
    // X-Card / Take a Break / safety flag that landed meanwhile; writing its
    // ledgers whole dropped a mid-narration `!truth` correction or oracle
    // truth and resurrected a scene End a Session had just closed — so the
    // ledgers are unioned by id, and skipped when the scene changed.
    persisted = persistSceneLedgerFields(campaignState, SIDECAR_FIELDS, 'narrator sidecar').catch(err =>
      console.warn(`${MODULE_ID} | factContinuity: campaignState persist failed:`, err),
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | factContinuity: applySidecar threw:`, err);
  }

  if (shipPositionChanges.length) {
    applyShipPositionChanges(shipPositionChanges, campaignState, { narrationId: ctx.narrationId ?? null }).catch(err =>
      console.debug?.(`${MODULE_ID} | shipPosition: sidecar update failed:`, err?.message ?? err),
    );
  }

  // The narrative skeleton (issue #353): the plans this narration decided, the
  // ones it was asked to decide, and the questions it posed — filed in the
  // Secrets journal, stamped with its id for the X-Card. Fire-and-forget,
  // never throws.
  if (sidecar.plans?.length || sidecar.openQuestions?.length || sidecar.reveals?.length || sidecar.countdown
    || sidecar.newThreats?.length || ctx.planRequests?.length) {
    void applyPlanSideData(sidecar, {
      campaignState,
      narrationId:  typeof ctx.narrationId === 'string' ? ctx.narrationId : null,
      moveId:       ctx.moveId ?? null,
      planRequests: Array.isArray(ctx.planRequests) ? ctx.planRequests : [],
      endingSubjectIds,
      // A relayed block names no plan by id (applyRelayedNarratorSidecar).
      relayed:      ctx.relayed === true,
    });
  }
  return persisted;
}

/**
 * How long the narrator's cached blocks live. A table's beats are often more
 * than five minutes apart — a player thinking, table talk, a rules lookup — and
 * every read restarts the hour, so one write serves a session; at the default
 * five minutes each such pause paid for the standing block again.
 */
const NARRATOR_CACHE_TTL = '1h';
/** The same lifetime in ms: with no narrator call for this long the world snapshot's cache entry has lapsed (issue #357). */
const NARRATOR_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * The `system` field of a narrator request (issue #354 P2-23): the prompt as
 * the blocks narratorPrompt.js orders it in — the standing rules and this
 * narration's block each closing on a cache breakpoint, the per-beat context
 * after them uncached. The whole prompt went as one cached block that changed
 * every beat, so every call wrote it to the cache and none ever read it.
 *
 * With a world snapshot (issue #357) there are four: the standing rules, the
 * snapshot, this narration, the context — the first three each closing on a
 * one-hour breakpoint (the API allows four), in that order, so a new snapshot
 * rewrites the snapshot and the narration's block and never the rules, and
 * every prose mode reads the first two.
 *
 * A prompt with no such blocks (the campaign recap's, the rolling summary's)
 * is one block with no breakpoint: nothing later repeats it. So is every
 * prompt when the world's prompt caching is off
 * (`campaignState.api.promptCachingEnabled`).
 *
 * @param {Array<{ text: string, cached: boolean }>} blocks — splitNarratorSystemPrompt's
 * @param {string} systemPrompt
 * @param {{ cachingEnabled?: boolean }} [opts]
 * @returns {Array<{ type: 'text', text: string, cache_control?: Object }>}
 */
function narratorSystemBlocks(blocks, systemPrompt, { cachingEnabled = true } = {}) {
  if (!blocks.length) return [{ type: 'text', text: String(systemPrompt ?? '') }];
  return blocks.map(b => (b.cached && cachingEnabled
    ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral', ttl: NARRATOR_CACHE_TTL } }
    : { type: 'text', text: b.text }));
}

/**
 * How a narrator reply's characters split between its prose and its fact
 * block (the sidecar fence extractSidecar takes off) — the Narrator Usage
 * page's Prose / Fact block columns. Zero for an empty reply.
 *
 * @param {string} text — the reply as returned
 * @returns {{ proseChars: number, sidecarChars: number }}
 */
function outputSplit(text) {
  const raw = typeof text === 'string' ? text : '';
  let prose = raw;
  try {
    prose = String(extractSidecar(raw)?.prose ?? raw);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator usage: the reply's fact block could not be measured:`, err?.message ?? err);
  }
  const proseChars = Math.min(raw.length, prose.trim().length);
  return { proseChars, sidecarChars: Math.max(0, raw.trim().length - proseChars) };
}

/** Whether this world caches prompts (schemas.js `api.promptCachingEnabled`; on unless switched off). */
function promptCachingEnabled() {
  return storedCampaignState()?.api?.promptCachingEnabled !== false;
}

/** The headers of a narrator request. */
function narratorHeaders(apiKey) {
  return {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
  };
}

/**
 * Write the narrator's cached prefix — the standing rules and the world
 * snapshot — before a session's first narration, so that narration reads it
 * and is not the slow one (issue #357; #287 F4). A request with
 * `max_tokens: 0` writes the cache at its breakpoints and returns no text.
 *
 * It must write the entry real narrations read: the same blocks, built the
 * way a narration's are (buildNarratorExtras → buildNarratorSystemPrompt →
 * splitNarratorSystemPrompt), on the narration model, with the thinking
 * setting api-proxy.js gives every narrator call. It cannot stream.
 *
 * Begin a Session calls it only when no opening narration follows (the
 * galley vignette unchecked, no clock vignette): the first of those shares
 * both blocks and warms the cache itself. Canonical GM, with a key, narration
 * and prompt caching on, and a snapshot to send. Never throws.
 *
 * @param {Object} campaignState — a working copy
 * @returns {Promise<boolean>} whether the request was sent and answered
 */
export async function prewarmNarratorCache(campaignState) {
  try {
    const settings = getNarratorSettings();
    if (!settings.narrationEnabled || !worldSnapshotEnabled() || !promptCachingEnabled() || !isCanonicalGM()) return false;
    const apiKey = getApiKey();
    if (!apiKey) return false;
    const extras = await buildNarratorExtras('session_vignette', campaignState);
    if (!extras.worldSnapshot) return false;
    const blocks = splitNarratorSystemPrompt(buildNarratorSystemPrompt(campaignState, settings, null, '', extras));
    const last = blocks.findIndex(b => b.snapshot);
    if (last < 0) return false;
    const system = narratorSystemBlocks(blocks.slice(0, last + 1), '', { cachingEnabled: true });
    const started = Date.now();
    noteWorldSnapshotSent(started);
    const data = await apiPost(ANTHROPIC_URL, narratorHeaders(apiKey), {
      model:      settings.narrationModel,
      max_tokens: 0,
      system,
      // Read during the cache write, never answered.
      messages:   [{ role: 'user', content: 'Session start.' }],
    }, { label: 'narrator:prewarmNarratorCache' });
    logNarratorUsage({
      label: 'prewarmNarratorCache', model: settings.narrationModel, usage: data?.usage ?? null,
      elapsedMs: Date.now() - started, sessionId: campaignState?.currentSessionId ?? null,
    }).catch(() => {});
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the session's cache was not written ahead of its first narration:`, err?.message ?? err);
    return false;
  }
}

/**
 * A call's user message with NAMES THE TABLE CHANGED added at its end, when
 * the user message names an old name and nothing in the call tells the new
 * one yet (issue #377 item 1). The system prompt carries the note wherever its
 * own text, or this session, calls for it (narratorPrompt.js [6.4]), but every
 * path builds its user message after its system prompt — so an old name only
 * the user message holds went untold: a player's line, the recent scene, or
 * a closing scene's earlier bookends ("(Tamsin Vey) Tamsin closes her ledger
 * stall", from a session before the rename — the long haul's rehearsal,
 * 2026-11-23). The user message is per call, so the cached blocks stay as
 * they are. Pure but for the store read; never throws.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {string}
 */
function withNameChangesNoted(systemPrompt, userMessage) {
  try {
    const text = typeof userMessage === 'string' ? userMessage : '';
    if (!text || String(systemPrompt ?? '').includes(NAME_CHANGES_HEADING) || text.includes(NAME_CHANGES_HEADING)) return userMessage;
    const changes = storedCampaignState()?.nameChanges;
    if (!Array.isArray(changes) || !changes.length) return userMessage;
    const note = formatNameChangesBlock(changes, { texts: [text] });
    return note ? `${text}\n\n${note}` : userMessage;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: the name-change note was not added:`, err?.message ?? err);
    return userMessage;
  }
}

async function callNarratorAPI({ apiKey, systemPrompt, userMessage: message, model, maxTokens, label = null, reply = null }) {
  const blocks = splitNarratorSystemPrompt(systemPrompt);
  const userMessage = withNameChangesNoted(systemPrompt, message);
  const body = {
    model,
    max_tokens: maxTokens ?? 16000,
    system:   narratorSystemBlocks(blocks, systemPrompt, { cachingEnabled: promptCachingEnabled() }),
    messages: [{ role: 'user', content: userMessage }],
  };
  // No extended thinking eating the max_tokens cap on a thinking-by-default
  // model (Sonnet 5, Sonnet 5.5, Haiku 5.5): api-proxy.js sends the body with
  // its model's thinking-off form (narration/thinking.js) (#latency).

  // Prompt caching and its one-hour lifetime need no beta header (issue #357:
  // the `prompt-caching-2024-07-31` header this sent is long retired).
  const headers = narratorHeaders(apiKey);
  // A request that carries the world snapshot reads its cache entry, which
  // restarts the entry's hour: the store's expiry check counts from here.
  if (blocks.some(b => b.snapshot)) noteWorldSnapshotSent();

  // What the narrator is sent and what comes back, for `!narrator debug`
  // (issue #290) — in memory, this browser only.
  const capture = recordNarratorRequest({
    label, model, maxTokens: body.max_tokens, system: systemPrompt, user: userMessage,
  });
  const started = Date.now();
  let data;
  try {
    data = await apiPost(ANTHROPIC_URL, headers, body, { label: `narrator:${label ?? 'narration'}` });
  } catch (err) {
    recordNarratorResponse(capture, { error: err, elapsedMs: Date.now() - started });
    throw err;
  }
  // NARR-SIDECAR-SILENT (narrator-context audit 2026-07): a response cut off
  // by max_tokens BEFORE the sidecar fence opens parses as clean prose with
  // no sidecar — invisible without this check. The unclosed-fence heuristic
  // in extractSidecar only catches truncation AFTER the fence opened.
  if (data?.stop_reason === 'max_tokens') {
    console.warn(
      `${MODULE_ID} | narrator: response truncated by maxTokens (cap ${maxTokens ?? 16000}) — ` +
      `prose and/or the fact-continuity sidecar may be incomplete. ` +
      `Raise the narration length headroom if this recurs.`,
    );
  }

  // Why the reply ended, for a caller that keeps its text as written (the
  // rolling summary — issue #374 A12).
  if (reply) reply.stopReason = data?.stop_reason ?? null;

  const text = (data.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  recordNarratorResponse(capture, { data, text, elapsedMs: Date.now() - started });

  // Token usage and time per call (issue #286 F6 step 1), with how the reply
  // split between prose and the fact block (issue #354 P2-24: output grew
  // over a session and nothing said which half) — fire-and-forget.
  logNarratorUsage({
    label, model,
    usage:     data?.usage ?? null,
    elapsedMs: Date.now() - started,
    sessionId: storedCampaignState()?.currentSessionId ?? null,
    ...outputSplit(text),
  }).catch(() => {});

  if (!text) throw new Error('Narrator API returned no text content.');
  return text;
}

/**
 * Read a World Journal per-section context toggle (threatsInContext /
 * factionLandscapeInContext / loreInContext). Defaults on, matching the
 * registrations; unregistered (unit tests, early init) also defaults on so
 * the pure builders stay testable.
 */
function wjSectionEnabled(key) {
  try {
    return game.settings.get(MODULE_ID, key) !== false;
  } catch {
    return true;
  }
}

/**
 * Run a World Journal reader defensively — WJ journals may not exist yet
 * (fresh world, unit tests). Any failure returns [] so the prompt build
 * never blocks on missing journals.
 */
function safeWjRead(fn, label) {
  try {
    return fn() ?? [];
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: WJ ${label} read failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * Read the audio.enabled world toggle. Used by buildNarratorSystemPrompt
 * call sites to conditionally include the NPC-markup instruction.
 * Defaults to false (audio is opt-in).
 */
function audioMarkupEnabledFromSettings() {
  try {
    return game.settings.get(MODULE_ID, 'audio.enabled') === true;
  } catch {
    return false;
  }
}

/**
 * Read the Rotating Spotlight world toggle (issue #232). Off unless the
 * setting is stored on — its default since issue #354 P2-07 — and off when
 * the setting is unregistered (early init, unit tests).
 */
function spotlightRotationEnabledFromSettings() {
  try {
    return game.settings.get(MODULE_ID, 'narratorSpotlightRotation') === true;
  } catch {
    return false;
  }
}

/**
 * Spotlight rotation (issue #232) — compute the multiplayer turn-implication
 * nudge for this beat and advance the per-scene rotation pointer.
 *
 * Returns the `## SPOTLIGHT` system-prompt block, or '' when the nudge does
 * not apply (setting off, non-eligible mode, fewer than two PCs in scene).
 * The pointer (`campaignState.spotlight`) is advanced in memory for every
 * client and persisted by the GM only — the same pattern getRollingSessionSummary
 * uses for its world-scoped write. Tying the pointer to `currentSceneId` makes
 * the rotation restart automatically on a new scene even before sceneLifecycle
 * clears it.
 *
 * The PC whose beat this is (`actingActorId`, the narration's CHARACTER) is
 * skipped when another PC is in the scene: naming the player who just acted
 * spreads nothing (issue #330 D8).
 *
 * Never throws: any failure yields '' so narration proceeds without the nudge.
 *
 * @param {string} mode
 * @param {Object} campaignState
 * @param {Object} [frameState]
 * @param {string|null} [actingActorId]
 * @returns {string}
 */
function maybeAdvanceSpotlight(mode, campaignState, frameState = campaignState, actingActorId = null) {
  try {
    if (!spotlightRotationEnabledFromSettings()) return '';
    if (!SPOTLIGHT_MODES.has(mode)) return '';

    const roster = (getPlayerActors() ?? [])
      .map(a => ({ id: a?.id, name: a?.name }))
      .filter(r => r.id && typeof r.name === 'string' && r.name.trim());

    // The frame and scene as they stand in the store (issue #325 W05).
    const presentNames = Array.isArray(frameState?.sceneFrame?.present)
      ? frameState.sceneFrame.present
      : [];

    // The stored pointer only applies within the scene it was set in; a scene
    // change (new currentSceneId, or null when fact continuity is off) resets
    // the rotation to the start of the roster.
    const sceneId = frameState?.currentSceneId ?? null;
    const lastActorId = (campaignState?.spotlight?.sceneId === sceneId)
      ? (campaignState?.spotlight?.lastActorId ?? null)
      : null;

    const selection = selectSpotlight({ roster, presentNames, lastActorId, actingActorId });
    if (!selection) return '';

    const record = { lastActorId: selection.nextActorId, sceneId };
    campaignState.spotlight = record;
    // Persisted onto a copy of the latest store, by the canonical GM: set on
    // the cached value first, a refused write left this GM's pointer a step
    // ahead of the world's (issue #331 X26). Read at its turn on the client's
    // campaignState write chain, once the write ahead has landed
    // (CAMPSTATE-CHAIN-PARTIAL).
    if (isCanonicalGM()) {
      serialiseCampaignStateWrite(() => {
        const stored = game.settings.get(MODULE_ID, 'campaignState') ?? campaignState;
        return game.settings.set(MODULE_ID, 'campaignState', { ...stored, spotlight: record });
      }, 'spotlight').catch(err =>
        console.warn(`${MODULE_ID} | narrator: spotlight persist failed:`, err?.message ?? err));
    }

    // "You" is the acting character alone in second person (issue #354 P2-08).
    const perspective = resolveNarrationPerspective(getNarratorSettings().narrationPerspective, {
      sessionPerspective: sessionPerspectiveOf(campaignState),
    });
    return buildSpotlightBlock(selection, { perspective });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: spotlight build failed:`, err?.message ?? err);
    return '';
  }
}

/**
 * Multiplayer speaker disambiguation — build the PARTY section payload for
 * buildNarratorSystemPrompt extras. Returns null in solo play (one PC or
 * fewer): no roster, no prompt cost. The speaking name comes from the
 * already-resolved active character so the roster and the CHARACTER block
 * always agree.
 *
 * @param {string|null} speakingName
 * @param {string[]|null} [actingActorIds] — a Batch Mode round's acting PCs, by actor id
 * @returns {{ names: string[], speaking: string|null }|null}
 */
function buildPartyContext(speakingName = null, actingActorIds = null) {
  try {
    const round = Array.isArray(actingActorIds) && actingActorIds.length ? new Set(actingActorIds) : null;
    // CHAR-PARTY-NAMES-ONLY (character-detail audit 2026-07): the roster
    // used to carry bare names, so third-person narration had pronouns for
    // no PC and misgendered non-speaking party members. Carry each member's
    // recorded pronouns + callsign (snapshot reads are cached).
    const members = (getPlayerActors() ?? [])
      // A Batch Mode round (issue #340) is told only who acted: who sat it
      // out is never sent, so the roster names the acting PCs alone — by
      // actor id: matched by the names the round copied when it opened, a
      // PC renamed since fell out, and with it the whole roster (issue #342
      // Z36; rules/reachability.md §6).
      .filter(a => !round || round.has(a?.id))
      .map(a => {
        try { return readCharacterSnapshot(a); } catch { return null; }
      })
      .filter(s => s && typeof s.name === 'string' && s.name.trim())
      .map(s => ({
        name:     s.name.trim(),
        pronouns: s.pronouns ?? '',
        callsign: s.callsign ?? '',
      }));
    if (members.length < 2) return null;
    return {
      names:    members.map(m => m.name),   // kept for back-compat consumers
      members,
      speaking: speakingName ?? null,
      // A Batch Mode round names who acts in it (issue #340) — as they are named now.
      ...(round ? { acting: members.map(m => m.name) } : {}),
    };
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: party context build failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Narrator-memory A2.5 — relevance resolution for the non-move narrator
 * paths (paced narrative, scene interrogation). Purely lexical: moveId is
 * null, so resolveRelevance never reaches its Haiku Phase-2 classifier.
 *
 * The active scene frame's `present` names are unioned into the match text
 * so entities who are in the scene stay matched — and therefore keep their
 * ENTITIES IN SCENE card and their entity-scoped ledger entries — on turns
 * where the player's own message doesn't name them ("What does that even
 * mean?"). See docs/narrator/narrator-memory-architecture.md.
 *
 * Never throws; returns empty arrays on any failure so narration proceeds
 * with the thinner context rather than failing the turn.
 *
 * @param {string} playerText
 * @param {Object} campaignState
 * @returns {Promise<{ entityIds: string[], entityCards: string[],
 *                     entityNamesById: Map<string,string> }>}
 */
async function resolvePathRelevance(playerText, campaignState) {
  const empty = { entityIds: [], entityTypes: [], entityCards: [], entityNamesById: new Map() };
  try {
    const present = Array.isArray(campaignState?.sceneFrame?.present)
      ? campaignState.sceneFrame.present.filter(p => typeof p === 'string' && p.trim())
      : [];
    const matchText = present.length
      ? `${playerText ?? ''}\n${present.join(', ')}`
      : (playerText ?? '');

    const relevance = await resolveRelevance(matchText, null, null, campaignState);
    const ids   = relevance?.entityIds   ?? [];
    const types = relevance?.entityTypes ?? [];
    return {
      entityIds:       ids,
      entityTypes:     types,
      entityCards:     collectEntityCards(ids, types),
      entityNamesById: collectEntityNamesById(ids, types),
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: path relevance resolution failed:`, err);
    return empty;
  }
}

/**
 * Narrator-memory A3 — how many recent narrator cards feed the paced /
 * oracle-followup user message. World setting `narratorContextCards`,
 * default 20, clamped 1–50. Scene interrogation keeps its own
 * `sceneContextCards` setting.
 */
function getNarratorContextCards() {
  try {
    const v = Number(game.settings.get(MODULE_ID, 'narratorContextCards'));
    if (!Number.isFinite(v)) return 20;
    return Math.max(1, Math.min(50, Math.round(v)));
  } catch {
    return 20;
  }
}

function getNarratorSettings() {
  try {
    return {
      narrationEnabled:        game.settings.get(MODULE_ID, 'narrationEnabled')      ?? true,
      narrationModel:          game.settings.get(MODULE_ID, 'narrationModel')        ?? 'claude-sonnet-5-5',
      narrationPerspective:    game.settings.get(MODULE_ID, 'narrationPerspective')  ?? 'auto',
      narrationTone:           game.settings.get(MODULE_ID, 'narrationTone')         ?? 'wry',
      narrationLevity:         game.settings.get(MODULE_ID, 'narrationLevity')       ?? 'default',
      narrationLength:         game.settings.get(MODULE_ID, 'narrationLength')       ?? 3,
      narrationInstructions:   game.settings.get(MODULE_ID, 'narrationInstructions') ?? '',
      narrationMaxTokens:      game.settings.get(MODULE_ID, 'narrationMaxTokens')    ?? 300,
      factContinuityEnabled:        game.settings.get(MODULE_ID, 'factContinuity.enabled')          ?? true,
      factContinuityLedgerInContext:game.settings.get(MODULE_ID, 'factContinuity.ledgerInContext')  ?? true,
      factContinuityMaxLedgerTokens:game.settings.get(MODULE_ID, 'factContinuity.maxLedgerTokens')  ?? 400,
      factContinuitySceneFrame:     game.settings.get(MODULE_ID, 'factContinuity.sceneFrame')       ?? true,
      narrativeSkeletons:           skeletonsEnabled(),
    };
  } catch (err) {
    console.error(`${MODULE_ID} | narrator: getNarratorSettings failed; falling back to hardcoded defaults:`, err);
    return {
      narrationEnabled:        true,
      narrationModel:          'claude-sonnet-5-5',
      narrationPerspective:    'auto',
      narrationTone:           'wry',
      narrationLevity:         'default',
      narrationLength:         3,
      narrationInstructions:   '',
      narrationMaxTokens:      300,
      factContinuityEnabled:         true,
      factContinuityLedgerInContext: true,
      factContinuityMaxLedgerTokens: 400,
      factContinuitySceneFrame:      true,
      narrativeSkeletons:            true,
      _error:                err,
    };
  }
}

function getApiKey() {
  try {
    return game.settings.get(MODULE_ID, 'claudeApiKey') || null;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: claudeApiKey settings read failed:`, err);
    return null;
  }
}

export function getActiveCharacter(campaignState, speakerActorId = null) {
  try {
    // Prefer the speaker if one was resolved upstream from the chat
    // message (token selection / author binding / ownership) — without
    // this, every narration in a 2-player session described whichever PC
    // happened to be first in campaignState, regardless of who actually
    // typed. A stale speaker id (deleted actor) falls back to the
    // campaign's resolved PCs rather than dropping character context.
    const ids = speakerActorId
      ? [speakerActorId, ..._resolveCharacterIds(campaignState)]
      : _resolveCharacterIds(campaignState);
    if (!ids.length) return null;
    let actor = null;
    for (const id of ids) {
      actor = game.actors?.get?.(id);
      if (actor) break;
    }
    if (!actor) return null;
    const snap = readCharacterSnapshot(actor);
    if (!snap) return null;
    // CHAR-PC-BLOCK-STARVED (character-detail audit 2026-07): this used to
    // narrow the snapshot to {name, description, narratorNotes, meters} —
    // and `system.description` doesn't even exist on the vendor character —
    // so the CHARACTER block never carried the PC's pronouns, callsign,
    // biography, stats, impacts, assets, or vows on ANY narrator path, and
    // the narrator guessed gender from the name. Pass the full snapshot;
    // buildCharacterBlock renders every field it holds. narratorNotes stays
    // flag-only: the old `?? system.biography` fallback would now render
    // the biography twice (the snapshot carries it as its own line).
    return {
      ...snap,
      narratorNotes: actor.getFlag?.(MODULE_ID, 'narratorNotes') ?? '',
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: getActiveCharacter failed:`, err);
    return null;
  }
}

function getSceneQueryEnabled() {
  try {
    return game.settings.get(MODULE_ID, 'sceneQueryEnabled') ?? true;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneQueryEnabled settings read failed:`, err);
    return true;
  }
}

function getSceneResponseLength() {
  try {
    return game.settings.get(MODULE_ID, 'sceneResponseLength') ?? 2;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneResponseLength settings read failed:`, err);
    return 2;
  }
}

function getSceneContextCards() {
  try {
    return game.settings.get(MODULE_ID, 'sceneContextCards') ?? 3;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneContextCards settings read failed:`, err);
    return 3;
  }
}

function isRateLimit(err) {
  return err?.message?.includes('429') ||
    err?.message?.toLowerCase().includes('rate limit');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// campaignState.characterIds is never written by the module, so the stored
// value is effectively always []. Fall back to actorBridge — the same source
// the assembler uses — so the recap actually reads chronicle entries.
function _resolveCharacterIds(campaignState) {
  const ids = campaignState?.characterIds ?? [];
  if (ids.length) return ids;
  try {
    return getPlayerActors().map(a => a.id);
  } catch {
    return [];
  }
}

/**
 * Aggregate chronicle entries (oldest first) across every PC in the campaign.
 * Each entry is annotated with `actorId` so a single combined sort by
 * timestamp produces a coherent campaign timeline.
 */
async function _collectAllChronicleEntries(campaignState) {
  const ids = _resolveCharacterIds(campaignState);
  if (!ids.length) return [];

  const aggregated = [];
  for (const actorId of ids) {
    try {
      const entries = await getChronicleEntries(actorId);
      for (const entry of entries ?? []) {
        if (entry) aggregated.push({ ...entry, _actorId: actorId });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: getChronicleEntries(${actorId}) failed:`, err);
    }
  }

  aggregated.sort((a, b) => {
    const ta = a.timestamp ?? '';
    const tb = b.timestamp ?? '';
    if (ta === tb) return 0;
    return ta < tb ? -1 : 1;
  });
  return aggregated;
}

/**
 * What a campaign recap's cache is checked against: the hash of the source it
 * would be made from now (record/recapView.js — the session record read with
 * the table's corrections, where things stand, the players' notes, the
 * sessions from before the record). Any correction moves it (issue #382); it
 * was a hash of the Chronicle's text (issue #301 B04) — and whether a session
 * before the current one is in that source (`before`, recapView.js), which a
 * session's start needs for its recap (sessionStartRecap). With
 * `sessionStart`, the key of the recap a session's start is told — the
 * session under way left out (getCampaignRecap). Exported for the tests and
 * Quench checks that seed a cache. No API call.
 *
 * @param {Object} campaignState
 * @param {{ sessionStart?: boolean }} [opts]
 * @returns {Promise<{ sourceHash: string, before: boolean }>}
 */
export async function campaignRecapCacheKey(campaignState, { sessionStart = false } = {}) {
  const source = await campaignRecapSourceOf(campaignState, { chronicle: await _recapChronicle(campaignState), sessionStart });
  return { sourceHash: source.hash, before: source.before };
}

// Every PC's chronicle entries — the players' own notes, and the sessions
// from before the record (recapView.js) — [] when they cannot be read.
async function _recapChronicle(campaignState) {
  try {
    return await _collectAllChronicleEntries(campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: reading the chronicle for the recap failed:`, err);
    return [];
  }
}

// A recap cache is current when it was made from the source as it stands
// now: `key` is campaignRecapCacheKey's, or a source (its `hash`). One from
// before the record (a Chronicle hash) is not — it is made again once.
function isRecapCacheCurrent(cache, key) {
  const hash = key?.sourceHash ?? key?.hash ?? null;
  return typeof cache?.text === 'string' && cache.text.trim() !== '' && !!hash && cache.sourceHash === hash;
}

// How many earlier positions a narrated move keeps (`position.previous`),
// for an X-Card whose beat moved the ship more than once.
const SHIP_POSITION_HISTORY = 3;

/** The command vehicle's stored position record, or null. */
function shipPositionRecord(cvActorId, getShipFn) {
  try {
    const pos = getShipFn(cvActorId)?.position;
    return pos && typeof pos === 'object' ? pos : null;
  } catch {
    return null;
  }
}

/** A position with its `previous` chain cut to SHIP_POSITION_HISTORY − 1 links. */
function trimPositionHistory(position, depth = 1) {
  if (!position || typeof position !== 'object') return null;
  const { previous, ...rest } = position;
  return depth < SHIP_POSITION_HISTORY && previous
    ? { ...rest, previous: trimPositionHistory(previous, depth + 1) }
    : rest;
}

/**
 * Put the command vehicle back where it was before an X-carded narration moved
 * it (issue #325 W07). The narrator's REQUIRED ship / position emission is
 * routed around the ledgers to the ship record (applyShipPositionChanges) —
 * `retractNarrations` never touched it, so after a resume every prompt's
 * never-dropped SHIP POSITION line still named the removed beat's destination.
 * A position a removed narration wrote is replaced by the one it recorded as
 * `previous` (again, while that one is also a removed narration's), or by an
 * empty position when it recorded none; the sector token follows. Runs on the
 * canonical GM (suppressScene's finish). Never throws.
 *
 * The token goes back where the removed narration's sync took it from (the
 * `tokenBefore` its record carries — the oldest removed one's, when several
 * moved it): the sync moves a token only onto a pin, so a ship parked in deep
 * space, or with no position, kept its token on the removed destination's pin
 * while the narrator was told otherwise — and the token is the position
 * statement, so its next nudge recorded the removed place again (issue #342
 * Z12). A record with no spot (written before it, or a move that left the
 * token where it was) falls back to the sync of the restored position.
 *
 * @param {string[]} narrationIds — the X-carded narrations
 * @param {Object} [campaignState]
 * @returns {Promise<boolean>} whether the ship was moved back
 */
export async function restoreShipPositionAfterXCard(narrationIds, campaignState = storedCampaignState()) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === 'string' && id));
  if (!removed.size) return false;
  try {
    const { getCommandVehicleActorId, getShip, updateShip } = await import('../entities/ship.js');
    const cvActorId = getCommandVehicleActorId(campaignState ?? {});
    if (!cvActorId) return false;
    let position = shipPositionRecord(cvActorId, getShip);
    if (!position?.narrationId || !removed.has(position.narrationId)) return false;
    let tokenSpot = null;
    while (position?.narrationId && removed.has(position.narrationId)) {
      if (position.tokenBefore && typeof position.tokenBefore === 'object') tokenSpot = position.tokenBefore;
      position = position.previous ?? null;
    }
    const { emptyPosition } = await import('../factContinuity/shipPosition.js');
    // Every key written — `narrationId` / `previous` / `tokenBefore` too, null
    // when the position put back has none: setFlag merges, so a key left out
    // kept the removed narration's (SHIP-POSITION-FLAG-MERGE).
    const restored = position
      ? { ...emptyPosition(), ...position }
      : { ...emptyPosition(), updatedAt: new Date().toISOString(), updatedBy: 'manual' };
    await updateShip(cvActorId, { position: restored });
    const { syncCommandVehicleTokenToPosition, moveCommandVehicleTokenToDestination } = await import('../sectors/sectorSceneHooks.js');
    const tokenBack = tokenSpot
      ? await moveCommandVehicleTokenToDestination({
        sceneId: tokenSpot.sceneId, tokenId: tokenSpot.tokenId, destX: Number(tokenSpot.x), destY: Number(tokenSpot.y),
      }).catch(err => {
        console.debug?.(`${MODULE_ID} | shipPosition: X-Card token restore failed:`, err?.message ?? err);
        return false;
      })
      : false;
    // Otherwise the token follows whatever pin the restored position names —
    // a settlement's or a site's (a recorded location — issue #335 Y14).
    if (!tokenBack) {
      await syncCommandVehicleTokenToPosition(restored, campaignState).catch(err =>
        console.debug?.(`${MODULE_ID} | shipPosition: X-Card token sync failed:`, err?.message ?? err));
    }
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: the ship's position could not be restored:`, err?.message ?? err);
    return false;
  }
}

/**
 * Apply sidecar state changes with subject === "ship" and attribute ===
 * "position" to the command vehicle's persistent position record
 * (fact-continuity scope §20.4). Multiple entries collapse to the last
 * — the narrator only meaningfully asserts one position per turn, and
 * preserving every intermediate is noise.
 *
 * Quietly no-ops when no command vehicle is registered or the feature
 * is gated off. Errors are swallowed at debug — the narrator's
 * primary output (the prose) has already posted by this point.
 */
async function applyShipPositionChanges(changes, campaignState, { narrationId = null } = {}) {
  if (!Array.isArray(changes) || !changes.length) return;
  // Feature gate is checked lazily so this module stays import-safe in
  // unit tests where `game.settings` may be partial.
  let enabled = true;
  try { enabled = game.settings.get(MODULE_ID, 'factContinuity.shipPositioning') !== false; }
  catch { enabled = true; }
  if (!enabled) return;
  if (!game.user?.isGM) return;

  const last = changes[changes.length - 1];
  const dest = typeof last?.value === 'string' ? last.value.trim() : '';
  if (!dest) return;

  try {
    const { getCommandVehicleActorId, updateShip } = await import('../entities/ship.js');
    // updateShip resolves by Actor id — the record's `_id` is a module GUID
    // and threw "Ship actor not found" on every write here (finding #5).
    const cvActorId = getCommandVehicleActorId(campaignState);
    if (!cvActorId) return;
    const position = inferShipPosition(dest, campaignState, { source: 'narrator_sidecar' });
    const { syncCommandVehicleTokenToPosition, commandVehicleTokenSpotBeforeSync } = await import('../sectors/sectorSceneHooks.js');
    // The narration that moved the ship, and where it was before: an X-Card
    // on that narration puts it back (restoreShipPositionAfterXCard, issue
    // #325 W07 — the move was routed around the ledgers with no narration id,
    // so SHIP POSITION kept naming the removed destination) — the sector-map
    // token too, from wherever the sync below takes it (issue #342 Z12).
    if (typeof narrationId === 'string' && narrationId) {
      position.narrationId = narrationId;
      const prior = shipPositionRecord(cvActorId, getShip);
      if (prior) position.previous = trimPositionHistory(prior);
      position.tokenBefore = commandVehicleTokenSpotBeforeSync(position, campaignState);
    }
    await updateShip(cvActorId, { position });

    // Cluster C — the map follows the fiction (see index.js
    // maybeUpdateShipPositionFromName for the chat-command twin).
    await syncCommandVehicleTokenToPosition(position, campaignState).catch(err =>
      console.debug?.(`${MODULE_ID} | shipPosition: sidecar token sync failed:`, err?.message ?? err));
  } catch (err) {
    console.debug?.(`${MODULE_ID} | shipPosition: sidecar update for "${dest}" failed:`, err?.message ?? err);
  }
}
