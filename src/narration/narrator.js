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
  sanitizePlayerText,
  SCENE_LEDGER_FIELDS,
} from './narratorPrompt.js';
import { resolveRelevance, collectAllEntities, resolveEntityName, wholeWordPattern } from '../context/relevanceResolver.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';
import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';
import { isNarrationXCarded } from '../context/safety.js';
import { stripMarkup } from '../audio/segments.js';
import { SPOTLIGHT_MODES, selectSpotlight, buildSpotlightBlock } from './spotlight.js';
import { extractSidecar, normaliseSidecar } from '../factContinuity/sidecarParser.js';
import { applySidecar, applySceneFrame, retractNarrations, newNarrationId } from '../factContinuity/ledgers.js';
import { readRecentOracleResults, dropOracleResultsFor } from '../oracles/oracleMemory.js';
import { narrationDisablesThinking } from './thinking.js';
import { logNarratorUsage } from '../pacing/telemetry.js';
import { recordNarratorRequest, recordNarratorResponse, recordNarratorFactBlock } from './narratorDebug.js';
import { inferShipPosition }  from '../factContinuity/shipPosition.js';
import { startScene, persistSceneLedgerFields, mergeSceneLedgers } from '../factContinuity/sceneLifecycle.js';
import { sessionRetractedFacts } from '../factContinuity/retractions.js';
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
import { scheduleChronicleEntry } from '../character/chronicleWriter.js';
import { readCharacterSnapshot, getPlayerActors, isPlayerCharacterActor } from '../character/actorBridge.js';
import { MOVES, toMoveId } from '../schemas.js';
import { moveDisplayName } from '../system/i18n.js';
import { SCENE_CHALLENGE_VARIANTS } from '../moves/sceneChallenge.js';

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
  return {
    interrupted(label) {
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
  return `${what} discarded — the X-Card was played while it was being written.`;
}

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
 * @param {Object} [opts]
 * @param {string} [opts.playerNarration] — player text this turn (lexical relevance)
 * @param {Object|null} [opts.character]  — resolved active character (names the speaking PC for the roster)
 * @param {Object|null} [opts.relevance]  — pre-resolved FULL relevance result (move path only)
 * @param {Object|null} [opts.oracleSeeds]— oracle seeds (move path only)
 * @returns {Promise<Object>} the extras packet for buildNarratorSystemPrompt
 */
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

export async function buildNarratorExtras(mode, campaignState, opts = {}) {
  const {
    playerNarration = '',
    character       = null,
    relevance       = null,
    oracleSeeds     = null,
    actingActorIds  = null,
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
  };

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

  return extras;
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
 * The summary of the session before this one (mintSession keeps it), as
 * `{ text, sessionNumber, isLast }` — `isLast` false when sessions between
 * them left no summary. Null when there is none, or when the rolling summary
 * is turned off.
 */
function previousSessionSummaryFor(campaignState) {
  if (!rollingSummaryEnabled()) return null;
  const prev = campaignState?.previousSessionSummary;
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
 */
async function sessionStartRecap(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return '';
  try {
    if (sessionNarratorCards(sessionId).length) return '';
  } catch {
    return '';
  }
  let stored = null;
  try { stored = game.settings.get(MODULE_ID, 'campaignState')?.campaignRecapCache ?? null; }
  catch { stored = null; }
  const key = await campaignRecapCacheKey(campaignState);
  for (const cache of [stored, campaignState?.campaignRecapCache]) {
    if (isRecapCacheCurrent(cache, key)) return cache.text;
  }
  if (!game.user?.isGM) return '';
  return getCampaignRecap(campaignState).catch(() => '');
}

/**
 * The shared story a Private Channel turn reads (issue #286 D1, #287) — what
 * the main narrator knows, so a private aside can't contradict the table:
 * `canon` (world truths, the campaign premise) for its cached prefix, and
 * `scene` (last and this session's summaries, the cards of the recorded
 * entities the player's message or the scene frame names, the scene ledger).
 * Relevance is lexical, as on every non-move path: no API call and no side
 * effects (no spotlight advance, no recap generation).
 *
 * @param {Object} campaignState
 * @param {string} playerMessage
 * @returns {Promise<{ canon: string, scene: string }>}
 */
export async function buildPrivateChannelStory(campaignState, playerMessage) {
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
  return buildSharedStorySections(campaignState, getNarratorSettings(), extras);
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
 * @returns {Promise<string|null>} narration text, or null on failure/disabled
 */
export async function narrateResolution(resolution, campaignState, options = {}) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  // X-Card: the move still resolves (its result card is already posted), but
  // the narrator stays silent until a GM resumes. This gate lived in the
  // retired context assembler (ASSEMBLER-003) and was lost with it.
  if (isXCardActive(campaignState)) {
    console.debug(`${MODULE_ID} | narrateResolution: X-Card active — narration paused.`);
    await postNarrationPausedCard(resolution, campaignState);
    return null;
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateResolution: Claude API key not configured`);
    await postFallbackCard(resolution, campaignState);
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

  const extras = await buildNarratorExtras('move_resolution', campaignState, {
    playerNarration: resolution.playerNarration ?? '',
    character,
    relevance,
    oracleSeeds:     resolution.oracleSeeds ?? null,
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
  );
  // The card keeps the line the player wrote (B5) — not the marker a burn /
  // improve re-narration carries in its place.
  const cardOptions = {
    matchedEntityIds: extras.matchedEntityIds ?? [],
    playerText:       isPlayerWrittenInput(resolution) ? (resolution.playerNarration ?? '') : '',
    playerName:       character?.name ?? null,
    narrationId,
  };

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
      await postNarrationPausedCard(resolution, campaignState);
      return null;
    }
    const narration = applyNarratorSidecar(raw, campaignState, {
      moveId:           resolution?.moveId,
      matchedEntityIds: extras.matchedEntityIds ?? [],
      narrationId,
    });

    if (!narration?.trim()) {
      await postFallbackCard(resolution, campaignState);
      return null;
    }

    await postNarrationCard(narration, resolution, campaignState, cardOptions);
    await runPostNarrationPasses(narration, resolution, relevance, campaignState, { actorId: character?.actorId ?? null, narrationId });
    scheduleChronicleEntry({
      narrationText: narration,
      campaignState,
      moveId:        resolution.moveId,
      outcome:       resolution.outcome,
      kind:          'move',
    });
    return narration;

  } catch (err) {
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
          await postNarrationPausedCard(resolution, campaignState);
          return null;
        }
        const narration = applyNarratorSidecar(raw, campaignState, {
          moveId:           resolution?.moveId,
          matchedEntityIds: extras.matchedEntityIds ?? [],
          narrationId,
        });
        if (narration?.trim()) {
          await postNarrationCard(narration, resolution, campaignState, cardOptions);
          await runPostNarrationPasses(narration, resolution, relevance, campaignState, { actorId: character?.actorId ?? null, narrationId });
          scheduleChronicleEntry({
            narrationText: narration,
            campaignState,
            moveId:        resolution.moveId,
            outcome:       resolution.outcome,
            kind:          'move',
          });
          return narration;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateResolution retry failed:`, retryErr);
      }
    }

    console.error(`${MODULE_ID} | narrateResolution failed:`, err);
    await postFallbackCard(resolution, campaignState);
    return null;
  }
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
 * @param {{ round: Object, campaignState: Object }} args — a working copy of campaignState
 * @returns {Promise<{ posted: "card"|"fallback"|"paused"|null, narrationId?: string, card?: Object }>}
 */
export async function narrateRound({ round, campaignState }) {
  const entries = roundNarrationEntries(round);
  if (!entries.length) return { posted: null };
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return { posted: null };

  if (isXCardActive(campaignState)) {
    console.debug(`${MODULE_ID} | narrateRound: X-Card active — narration paused.`);
    return { posted: 'paused', card: await postRoundPausedCard(round, entries, campaignState) };
  }
  const xCard = watchXCard(campaignState);
  const narrationId = newNarrationId();

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateRound: Claude API key not configured`);
    return { posted: 'fallback', card: await postRoundFallbackCard(round, entries, campaignState) };
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
  const extras = await buildNarratorExtras('round_resolution', campaignState, {
    playerNarration: entries.map(e => e.text).filter(Boolean).join('\n'),
    character:       null,
    relevance,
    actingActorIds:  entries.map(e => e.actorId),
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
  });
  const maxTokens = maxTokensWithSidecar(roundMaxTokens(settings.narrationMaxTokens, entries.length));

  // One call, and one retry after a rate limit. The call is made here, not in
  // a helper, so its caller is narrateRound (the playthrough harness files a
  // call under the two module functions above the proxy).
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      if (tries) await delay(RETRY_DELAY_MS);
      const raw = await callNarratorAPI({
        label: 'narrateRound', apiKey, systemPrompt, userMessage, model: settings.narrationModel, maxTokens,
      });
      if (xCard.interrupted('narrateRound')) {
        return { posted: 'paused', card: await postRoundPausedCard(round, entries, campaignState) };
      }
      const narration = applyNarratorSidecar(raw, campaignState, {
        moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId,
      });
      if (!narration?.trim()) break;
      const card = await postRoundNarrationCard(narration, round, entries, campaignState, {
        matchedEntityIds: extras.matchedEntityIds ?? [], narrationId,
      });
      await runRoundNarrationPasses(narration, entries, campaignState, {
        narrationId, matchedEntityIds: extras.matchedEntityIds ?? [], matchedEntityTypes: extras.matchedEntityTypes ?? [],
      });
      scheduleChronicleEntry({ narrationText: narration, campaignState, kind: 'round' });
      return { posted: 'card', narrationId, card };
    } catch (err) {
      if (!tries && isRateLimit(err)) continue;
      console.error(`${MODULE_ID} | narrateRound ${tries ? 'retry ' : ''}failed:`, err);
      break;
    }
  }
  return { posted: 'fallback', card: await postRoundFallbackCard(round, entries, campaignState) };
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
  // The capture's world-scoped writes are the canonical GM's (the
  // runPostNarrationPasses gate).
  if (!isCanonicalGM()) return Promise.resolve();
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
  const options = { actorId: actorIds.length === 1 ? actorIds[0] : null, actorIds, narrationId };
  if (hits.length) {
    const owner = roundFigureOwner(entries, narration);
    return runDiscoveryDetection(narration, resolution, campaignState, {
      ...options,
      connectionRollers: hits.map(e => ({
        actorId:        e.actorId ?? null,
        connectionSeed: e.input.oracleSeeds?.connectionSeed ?? null,
        owns:           (figure) => !!e.actorId && owner(figure) === e.actorId,
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
 * @param {{ matchedEntityIds?: string[], narrationId?: string|null }} [options]
 * @returns {Promise<ChatMessage>}
 */
export async function postRoundNarrationCard(narrationText, round, entries, campaignState, options = {}) {
  const matchedEntityIds = Array.isArray(options.matchedEntityIds) ? options.matchedEntityIds : [];
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-round-card">
        <div class="sf-narration-label">◈ Round ${escapeHtml(String(round?.number ?? ''))}</div>
        <ul class="sf-round-entries">${entries.map(roundEntryHtml).join('')}</ul>
        <div class="sf-narration-prose">${escapeHtml(stripMarkup(narrationText))}</div>
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
async function postRoundFallbackCard(round, entries, campaignState = null) {
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
        <div class="sf-narration-error">Narration unavailable — check your API key and proxy.</div>
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
 * details — so an X-Card on it undoes them (issue #329 X01).
 */
export function runPostNarrationPasses(
  narrationText, resolution, relevance, campaignState, { actorId = null, narrationId = null } = {},
) {
  if (!resolution || !relevance) return Promise.resolve();

  // Hardening (multiplayer): the detection passes below perform world-scoped
  // writes — World Journal pages (JournalEntryPage), entity generative tiers,
  // and entity Actor creation. Players (and non-canonical GMs) lack permission
  // for those, so an un-gated run on their client floods the server log with
  // "lacks permission to create JournalEntryPage" errors (the v1.7.24-era
  // multiplayer playtest bug). In production the pipeline entry is already
  // isCanonicalGM-gated (src/index.js); this is belt-and-suspenders so a future
  // un-gated caller cannot reproduce it. Single-emitter by design.
  if (!isCanonicalGM()) return Promise.resolve();

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
      // A Batch Mode round's Make a Connection hits, each its own roller and
      // seed (runRoundNarrationPasses — issue #342 Z09).
      connectionRollers:    options.connectionRollers ?? null,
      // A round's acting PCs: its draft card asks which of them a new
      // connection belongs to (issue #342 D3).
      actorIds:             options.actorIds ?? null,
      sessionId:            campaignState?.currentSessionId ?? '',
      actorId:              options.actorId ?? null,
      // What names a Make a Connection's NPC — a pending draft's included
      // (issue #325 W23).
      namingText:           `${resolution?.playerNarration ?? ''}\n${narrationText ?? ''}`,
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
        <div class="sf-narration-prose">${escapeHtml(stripMarkup(narrationText))}</div>
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
        timestamp:        new Date().toISOString(),
      },
    },
  });
}

/**
 * True when the resolution's playerNarration is what a player wrote — not
 * the marker a Burn Momentum / Improve Result re-narration carries.
 */
function isPlayerWrittenInput(resolution) {
  return resolution?.inputMethod !== 'burn' && resolution?.inputMethod !== 'improve';
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
  return (game.messages?.contents ?? []).filter(m => {
    const f = m.flags?.[MODULE_ID];
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
  });
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
 * above). Reads chat only.
 *
 * @param {string|null} sessionId
 * @returns {Array<Object>} ChatMessage documents
 */
export function xCardedNarrationCards(sessionId) {
  if (!sessionId) return [];
  const messages = game.messages?.contents ?? [];
  const inMemory = new Set(sessionNarratorCards(sessionId));
  const isBoundary = (f) => !!(f?.xcardCard || f?.xcardClearedCard);

  // The newest narration, unless an earlier X-Card already answered it.
  let newestIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const f = m?.flags?.[MODULE_ID];
    if (inMemory.has(m)) { newestIdx = i; break; }
    if (f?.xcardClearedCard || f?.xCarded) return [];   // nothing narrated since
    // anything else — this play's own X-Card card, a person's message, another card — is passed over
  }
  if (newestIdx < 0) return [];

  const newest   = messages[newestIdx];
  const newestAt = messageTime(newest);
  const newestRound = newest?.flags?.[MODULE_ID]?.roundId ?? null;
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
    if (!inMemory.has(m)) continue;             // one of this module's other cards
    const at = messageTime(m);
    if (newestAt !== null && at !== null && newestAt - at > XCARD_BEAT_WINDOW_MS) break;
    beat.unshift(m);
  }
  return beat;
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
 *   - `sessionSummary`: its text dropped and a regen due, when it covered
 *     them (the summary is a droppable convenience; the next regen reads the
 *     remaining cards);
 *   - `xCardRedirect`: the redirect the first narration after a GM resumes
 *     carries — set on every play, X-carded cards or not.
 * The caller then flags the returned cards `xCarded` (flagXCardedCards).
 *
 * @param {Object} cs — the copy to update (mutated; its ledger objects are replaced, never changed)
 * @returns {{ cards: Object[], retracted: Object[], sessionId: string|null, summaryDropped: boolean }}
 *   the X-carded cards, the truths retracted, their session, and whether the
 *   session's summary was dropped — the Session Log's story End wrote from it
 *   goes too (safety.js finishXCardRemoval, issue #345 AA27)
 */
export function applyXCardToNarratorMemory(cs) {
  const sessionId = cs?.currentSessionId ?? null;
  const cards = xCardedNarrationCards(sessionId);
  const ids = [...new Set(cards.map(m => m.flags?.[MODULE_ID]?.narrationId).filter(id => typeof id === 'string' && id))];

  const retracted = retractNarrations(cs, ids);
  if (ids.length) {
    const prior = Array.isArray(cs.xCardedNarrationIds) ? cs.xCardedNarrationIds : [];
    cs.xCardedNarrationIds = [...prior.filter(id => !ids.includes(id)), ...ids].slice(-XCARD_NARRATION_ID_CAP);
  }
  dropOracleResultsFor(cs, xCardedOracleResults(cards));

  const summary = cs.sessionSummary;
  let summaryDropped = false;
  if (cards.length && summary?.sessionId === sessionId) {
    if (summaryCoversCards(summary, sessionId, cards)) {
      // Stamped now: a move in flight merges its working copy's summary back
      // only when that one is newer (persistResolution's sessionSummary
      // rule). Kept at the old `updatedAt`, the tie wrote the removed beat
      // back, text and coverage — and the restored coverage held the regen
      // off for another K cards (issue #325 W06).
      const now = new Date().toISOString();
      cs.sessionSummary = { ...summary, text: '', coveredCount: 0, updatedAt: now, xCardedAt: now };
      summaryDropped = true;
    }
  }

  cs.xCardRedirect = { sessionId, at: new Date().toISOString() };
  return { cards, retracted, sessionId, summaryDropped };
}

/**
 * Whether the rolling summary was made from any of `cards`: it was made from
 * the session's cards in memory, oldest first, and covers the first
 * `coveredCount` of them (the X-Card's covered-index rule). Read while the
 * cards are still in memory — before they are flagged.
 *
 * @param {Object|null} summary — campaignState.sessionSummary
 * @param {string|null} sessionId
 * @param {Object[]} cards — ChatMessage documents
 * @returns {boolean}
 */
function summaryCoversCards(summary, sessionId, cards) {
  if (!sessionId || summary?.sessionId !== sessionId || !cards?.length) return false;
  const inMemory = sessionNarratorCards(sessionId);
  const at = cards
    .map(c => inMemory.findIndex(m => m === c || (!!m?.id && m.id === c?.id)))
    .filter(i => i >= 0);
  return at.length > 0 && Math.min(...at) < (Number(summary.coveredCount) || 0);
}

/**
 * Drop the session's rolling summary when it was made from narrations a Burn
 * Momentum or Improve Result is about to supersede — the move narration it
 * replaces, the trigger vignette of a clock it rewinds (issue #345 AA24).
 * Flagged `burnSuperseded`, a card leaves the summary's source, and its
 * re-narration joins it: the count stays where the summary's coverage is, so
 * the debounce kept serving the replaced outcome as STORY SO FAR — beside its
 * re-narration — for up to round(1.5 × Context Cards) narrations. As the
 * X-Card drops a summary that covered what it removed: text emptied, a regen
 * due (`coveredCount` 0), stamped now so a working copy's older summary does
 * not merge back over it. Call it BEFORE the cards are flagged (the coverage
 * is read from their place in memory). On the canonical GM, onto the latest
 * store at its turn on the write chain. Never throws.
 *
 * @param {Object[]} cards — the narration cards to be superseded
 * @returns {Promise<boolean>} whether the summary was dropped
 */
export async function dropSummaryOfSupersededCards(cards) {
  const list = (Array.isArray(cards) ? cards : []).filter(Boolean);
  if (!list.length) return false;
  try {
    if (!isCanonicalGM()) return false;
    const stored = storedCampaignState();
    const sessionId = stored?.currentSessionId ?? null;
    if (!summaryCoversCards(stored?.sessionSummary, sessionId, list)) return false;
    return await serialiseCampaignStateWrite(async () => {
      const latest = storedCampaignState();
      const summary = latest?.sessionSummary;
      if (!summary || summary.sessionId !== sessionId) return false;
      if (!summary.text && !(Number(summary.coveredCount) > 0)) return false;   // dropped already
      await game.settings.set(MODULE_ID, 'campaignState', {
        ...latest,
        sessionSummary: { ...summary, text: '', coveredCount: 0, updatedAt: new Date().toISOString() },
      });
      return true;
    }, 'superseded narration: rolling summary');
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: the rolling summary of a superseded narration could not be dropped:`, err?.message ?? err);
    return false;
  }
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
 * was delivered), a published Private Channel reflection (not a narration)
 * and an X-carded card do not count. On the canonical GM — a single-emitter
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
    if (f.narrationFallback || f.publishedReflection || f.xCarded) return;
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
  const prev = campaignState?.previousSessionSummary;
  if (prev && Number(prev.sessionNumber) === sessionNumber && typeof prev.sessionId === 'string' && prev.sessionId) {
    return { sessionId: prev.sessionId, sessionNumber };
  }
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
 * The cache is valid while the chronicle is exactly what it was made from
 * (campaignRecapCacheKey — issue #301 B04). A stale cache is never returned:
 * with no key to regenerate, the result is ''.
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]
 * @returns {Promise<string>}
 */
export async function getCampaignRecap(campaignState, options = {}) {
  const cache     = campaignState?.campaignRecapCache;
  const chronicle = await _recapChronicle(campaignState);
  const key       = chronicleRecapKey(chronicle);

  if (!options.forceRefresh && isRecapCacheCurrent(cache, key)) {
    return cache.text;
  }

  const apiKey = getApiKey();
  if (!apiKey) return '';

  const chronicleEntries = formatRecapEntries(chronicle);
  if (!chronicleEntries.length) return '';

  const settings    = getNarratorSettings();
  const character   = getActiveCharacter(campaignState);
  const extras      = await buildNarratorExtras('campaign_recap', campaignState, { character });
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character, '', extras);
  const userMessage  = buildCampaignRecapUserMessage(chronicleEntries);

  try {
    const text = await callNarratorAPI({
      label: 'getCampaignRecap',
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });

    // Written on a copy of the latest store: `get` hands back the cached
    // value, and a refused write left the GM's cache holding a recap the
    // world lacked — served as current on this client alone (issue #331
    // X25). One emitter: the canonical GM. Read at its turn on the client's
    // campaignState write chain (CAMPSTATE-CHAIN-REST).
    if (text?.trim() && isCanonicalGM()) {
      await serialiseCampaignStateWrite(() => {
        const cs = { ...(game.settings.get(MODULE_ID, 'campaignState') ?? campaignState) };
        cs.campaignRecapCache = {
          text:            text,
          generatedAt:     new Date().toISOString(),
          ...key,          // the chronicle it was made from
        };
        return game.settings.set(MODULE_ID, 'campaignState', cs);
      }, 'campaign recap cache');
    }

    return text ?? '';
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

const ROLLING_SUMMARY_MODEL     = 'claude-haiku-4-5-20251001';
const ROLLING_SUMMARY_MAX_TOK   = 320;
const ROLLING_SUMMARY_DEBOUNCE  = 1.5;

const ROLLING_SUMMARY_SYSTEM_PROMPT =
  `You are the continuity scribe for an Ironsworn: Starforged campaign. You are ` +
  `given the current play session, oldest first: the narrator's prose, each ` +
  `passage after the player's line that prompted it ("PLAYER — <name> wrote: …"). ` +
  `Write a tight "story so far" summary of THIS SESSION for the narrator to hold as ` +
  `background memory. What the players did and said counts as much as the prose.\n\n` +
  `Capture the through-line: where the characters have been, who they met and what ` +
  `those figures want, decisions made, promises and threats now in play, and any ` +
  `unresolved tension the next beat should honour. Prefer the proper nouns the prose ` +
  `establishes, and keep concrete specifics exact: objects handed over, prices and ` +
  `debts, codes, counts, deals and promises, marks and injuries. ` +
  `Past tense, plain prose, 4-8 sentences, no headings or lists.\n\n` +
  `This is narrative memory, not a recap card: do not address the player, do not ` +
  `propose actions, do not mention dice, moves, momentum, or any game mechanic. ` +
  `Summarise only what the session contains — never invent.`;

/**
 * Debounce threshold — how many new narrator cards must accrue before the
 * rolling summary regenerates, derived from the ring depth: K = round(1.5 × N),
 * floor 1. Because 1.5 × N always exceeds N, a summary only ever materialises
 * once there is a tail beyond the verbatim ring.
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
 * Maintain (and return) the rolling session summary. Debounced: regenerates
 * from the full session card feed only once ≥ K new cards have accrued since
 * the last regeneration (K = `rollingSummaryThreshold(ring depth)`); otherwise
 * returns the cached text. GM-gated on the write (world-scoped campaignState),
 * like the campaign recap and chronicle writer. Fail-open — any error returns
 * the previous text so a summary hiccup never blocks a narration.
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh] — regenerate regardless of debounce
 * @returns {Promise<string>}
 */
export async function getRollingSessionSummary(campaignState, options = {}) {
  if (!rollingSummaryEnabled()) return '';
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return '';

  const cache      = (campaignState.sessionSummary?.sessionId === sessionId)
                       ? campaignState.sessionSummary : null;
  const cachedText = typeof cache?.text === 'string' ? cache.text : '';

  let cards;
  try { cards = sessionNarratorCards(sessionId); }
  catch { return cachedText; }
  const total = cards.length;
  if (total === 0) return cachedText;

  const K       = rollingSummaryThreshold(getNarratorContextCards());
  const covered = Number(cache?.coveredCount) || 0;

  // Debounce: nothing new enough to re-summarise.
  if (!options.forceRefresh && (total - covered) < K) return cachedText;

  const apiKey = getApiKey();
  if (!apiKey) return cachedText;

  const sourceProse = cards
    .map(ringEntryText)
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (!sourceProse.trim()) return cachedText;
  // The source prose still states what the table struck (issue #286 B6).
  const struck = sessionRetractedFacts(campaignState);
  const leaveOut = struck.length
    ? `\n\n## RETRACTED BY THE TABLE — these did not happen; leave them out\n\n` +
      struck.map(f => `- ${f.label} — ${f.fact}`).join('\n')
    : '';

  // An X-Card played while the call is out removes a narration this summary
  // was made from: its reply is never stored (issue #325 W06). So does one
  // played before the call whose removal had not reached the source yet: the
  // pause's own write names the narrations it removes (`xCardedNarrationIds`)
  // before their cards are flagged `xCarded`. A pause still standing from an
  // earlier play is no reason to discard — its cards are out of the source:
  // the next session's mint at a world load, or End a Session pressed while
  // paused, threw away the summary of the session just played and LAST
  // SESSION was the session before (issue #345 AA57).
  const xCardPlaysAtStart = xCardPlayCount();
  const madeFromXCarded = () => cards.some(m => {
    const f = m?.flags?.[MODULE_ID];
    return !!f?.xCarded || isNarrationXCarded(f?.narrationId);
  });

  let text;
  try {
    text = await callNarratorAPI({
      label: 'getRollingSessionSummary',
      apiKey,
      systemPrompt: ROLLING_SUMMARY_SYSTEM_PROMPT,
      userMessage:  `## SESSION NARRATION (oldest first)\n\n${sourceProse}${leaveOut}`,
      model:        ROLLING_SUMMARY_MODEL,
      maxTokens:    ROLLING_SUMMARY_MAX_TOK,
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: rolling summary generation failed:`, err?.message ?? err);
    return cachedText;
  }
  if (!text?.trim()) return cachedText;
  if (xCardPlayCount() !== xCardPlaysAtStart || madeFromXCarded()) {
    console.debug(`${MODULE_ID} | narrator: X-Card played during the rolling summary's call — its summary is discarded.`);
    return '';
  }

  const record = {
    text:         text.trim(),
    coveredCount: total,
    sessionId,
    updatedAt:    new Date().toISOString(),
  };

  // Canonical-GM-gated persist (world-scoped write; single-emitter like every
  // other ledger write — a plain isGM gate raced in multi-GM worlds). Non-GM
  // clients keep the fresh text for this call but leave the durable write to
  // the canonical GM's own narration pass.
  // Written on a copy of the latest store, at its turn on the client's
  // campaignState write chain: set on the cached object first, a refused
  // write left the GM's client serving a summary the world never took, and
  // read inside an oracle capture's round trip it erased the answer
  // (CACHE-MUTATED-BEFORE-WRITE).
  // The reply-time X-Card check runs again at that turn, on the play count
  // (issue #345 AA25): an X-Card played while the write waited behind
  // another jumps the chain and lands first, and its pause can only empty a
  // summary already stored — this one, made from the narration it removed,
  // was written over it. Discarded then, here and on the caller's copy.
  if (isCanonicalGM()) {
    let kept = true;
    try {
      kept = await serialiseCampaignStateWrite(async () => {
        if (xCardPlayCount() !== xCardPlaysAtStart) return false;
        const stored = game.settings.get(MODULE_ID, 'campaignState') ?? campaignState;
        await game.settings.set(MODULE_ID, 'campaignState', { ...stored, sessionSummary: record });
        return true;
      }, 'rolling summary');
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: rolling summary persist failed:`, err?.message ?? err);
    }
    if (!kept) {
      console.debug(`${MODULE_ID} | narrator: X-Card played while the rolling summary waited to be written — its summary is discarded.`);
      return '';
    }
  }
  campaignState.sessionSummary = record;
  return record.text;
}

/**
 * The current session's cached rolling summary, or ''. Prefers the stored
 * campaignState — a move pipeline narrates from a snapshot read before the
 * last refresh landed — and falls back to the caller's copy. No API call.
 *
 * @param {Object} campaignState
 * @returns {string}
 */
function cachedRollingSessionSummary(campaignState) {
  if (!rollingSummaryEnabled()) return '';
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return '';
  let stored = null;
  try { stored = game.settings.get(MODULE_ID, 'campaignState')?.sessionSummary ?? null; }
  catch { stored = null; }
  for (const summary of [stored, campaignState?.sessionSummary]) {
    if (summary?.sessionId === sessionId && typeof summary.text === 'string') return summary.text;
  }
  return '';
}

let _summaryRefresh = null;
let _summaryRefreshAgain = false;

/**
 * Regenerate the rolling session summary after each narrator card posts, on
 * the canonical GM — off the narration's critical path (issue #286 B7). The
 * regen stays debounced and summarised from source (getRollingSessionSummary);
 * this only moves when it runs. One refresh at a time: a card that posts
 * while one is running runs it once more afterwards (a no-op below the
 * debounce). Released in a `finally`, so a failed refresh never wedges it.
 */
export function registerRollingSummaryRefreshHook() {
  Hooks.on('createChatMessage', (message) => {
    if (!isCanonicalGM()) return;
    const f = message?.flags?.[MODULE_ID];
    if (!f?.narratorCard || !f.narrationText) return;
    refreshRollingSessionSummary();
  });
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

/**
 * Bring the session's rolling summary up to date as the session closes
 * (rollSessionIfDue, src/session/lifecycle.js), so the summary carried into
 * the next session covers all of it: the debounce can leave up to K cards out,
 * and a short session never reaches K. An ended session's too: End a
 * Session's own refresh can fail or never land, and a Batch Mode round
 * resolving at End — or a move narrated while End runs — posts its card into
 * the ended session after that refresh (issue #345 AA21). The summary covers
 * the session's first `coveredCount` cards; makes no call when every card
 * past them is End a Session's own closing vignette (End's refresh runs
 * before it posts — not worth a second call), or there is none. Updates
 * campaignState's `sessionSummary`; fail-open.
 *
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
export async function finalizeSessionSummary(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId || !rollingSummaryEnabled()) return;
  if (_summaryRefresh) await _summaryRefresh;
  let stored = null;
  try { stored = game.settings.get(MODULE_ID, 'campaignState')?.sessionSummary ?? null; }
  catch { stored = null; }
  const covered = (summary) => (summary?.sessionId === sessionId ? Number(summary.coveredCount) || 0 : -1);
  if (covered(stored) > covered(campaignState.sessionSummary)) campaignState.sessionSummary = stored;
  const ended = campaignState.sessionEndedId === sessionId;
  const uncovered = sessionNarratorCards(sessionId)
    .slice(Math.max(0, covered(campaignState.sessionSummary)))
    .filter(m => !(ended && m.flags?.[MODULE_ID]?.vignetteKind === 'npc_end'));
  if (!uncovered.length) return;
  await getRollingSessionSummary(campaignState, { forceRefresh: true });
}

function refreshRollingSessionSummary() {
  if (_summaryRefresh) {
    _summaryRefreshAgain = true;
    return _summaryRefresh;
  }
  _summaryRefresh = (async () => {
    try {
      do {
        _summaryRefreshAgain = false;
        // A copy: getRollingSessionSummary sets the summary on the object it
        // is given — the cached setting itself, before a write the world can
        // refuse (CACHE-MUTATED-BEFORE-WRITE).
        await getRollingSessionSummary({ ...(game.settings.get(MODULE_ID, 'campaignState') ?? {}) });
      } while (_summaryRefreshAgain);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: rolling summary refresh failed:`, err?.message ?? err);
    } finally {
      _summaryRefresh = null;
    }
  })();
  return _summaryRefresh;
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
    const paragraphs = text.split(/\n\n+/).map(p => `<p>${escapeHtml(stripMarkup(p.trim()))}</p>`).join('');
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
  // `actorId` is the legacy option name; both are honoured.
  const speakerActorId = options?.speakerActorId ?? options?.actorId ?? null;
  const character      = getActiveCharacter(campaignState, speakerActorId);
  // @scene continues the scene in progress (issue #286 A4) — this starts one
  // only when none is active, so the answer is written against the frame,
  // truths, state and CORRECTED list it was asked about.
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
    const response = applyNarratorSidecar(raw, campaignState, {
      moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
    });

    if (!response?.trim()) {
      await postSceneFallbackCard(question, 'Scene query returned no content — try again.', sessionId);
      return null;
    }

    await postSceneCard(question, response, sessionId, character?.name ?? null, narrationId);
    scheduleSceneAnswerCapture(response, extras, campaignState, character?.actorId ?? null, narrationId);
    return response;

  } catch (err) {
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
        const response = applyNarratorSidecar(raw, campaignState, {
          moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
        });
        if (response?.trim()) {
          await postSceneCard(question, response, sessionId, character?.name ?? null, narrationId);
          scheduleSceneAnswerCapture(response, extras, campaignState, character?.actorId ?? null, narrationId);
          return response;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | interrogateScene retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | interrogateScene failed:`, err);
    await postSceneFallbackCard(question, 'Scene query failed — check your API key and proxy.', sessionId);
    return null;
  }
}

/**
 * Mine an @scene ANSWER for entities, factions, and lore — the same passes
 * the paced-narrative path runs. A direct question ("who is the
 * Triumvirate?") routinely surfaces the richest world detail of the session;
 * without this the narrator's answer reached the chat log and the
 * recent-narration ring but never the World Journal or entity records
 * (playtest v1.7.22).
 *
 * Canonical GM only, like scheduleNarrationCapture: both passes write the
 * world (World Journal pages, session-log beats, entity cards, the GM's draft
 * card). @scene runs RUN_ON.CLAUDE, so at a table with no keyed GM it answers
 * on the asking player's client, where those writes are refused (issue #321
 * U36). There the answer's ledger facts still reach the GM through the
 * sidecar relay (applyNarratorSidecar); the passes are skipped.
 *
 * @param {string} response — the answer's prose
 * @param {{ matchedEntityIds?: string[], matchedEntityTypes?: string[] }} extras
 * @param {Object} campaignState
 * @param {string|null} [actorId] — the asking PC, stamped on any draft card (issue #321 U23)
 * @param {string|null} [narrationId] — the answer's id, stamped on what the passes record (issue #329 X01)
 */
function scheduleSceneAnswerCapture(response, extras, campaignState, actorId = null, narrationId = null) {
  if (!isCanonicalGM()) return;
  schedulePacedDetection(response, campaignState, { actorId, narrationId });
  schedulePacedTierUpdate(response, extras.matchedEntityIds, extras.matchedEntityTypes, campaignState, { narrationId });
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
 *                                          (credit the roller); falls back to
 *                                          the campaign's first PC
 * @param {string|null} [args.oracleCardId] — the raw result card narrated: the
 *                                          narration's card names it, so an
 *                                          X-Card on it drops the card's result
 *                                          from RECENT ORACLE RESULTS (issue
 *                                          #345 AA01)
 * @param {Object}  args.campaignState
 * @returns {Promise<string|null>} the rendered narration text or null on skip / failure
 */
export async function narrateOracleFollowup({
  kind, oracleName, question = '', rolledLine, campaignState, speakerActorId = null, oracleCardId = null,
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

  const character = getActiveCharacter(campaignState, speakerActorId);
  const extras = await buildNarratorExtras('oracle_followup', campaignState, {
    playerNarration: question,
    character,
  });
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  // One sentence count: the oracle_followup role's "2-3 sentences". The
  // Length setting governs move and paced narration only (issue #326 W40); it
  // was read into this user message while the role said 2-3 (issue #331 X28).
  const recentContext  = getRecentNarrationContext(sessionId, getNarratorContextCards());
  const userMessage    = buildOracleUserMessage({
    oracleName, question, rolledLine, recentContext,
  });

  try {
    const raw = await callNarratorAPI({
      label: 'narrateOracleFollowup',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(16000),
    });
    if (xCard.interrupted('narrateOracleFollowup')) return null;
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });

    if (!text?.trim()) return null;

    await postOracleNarrationCard({ text, kind, oracleName, sessionId, narrationId, oracleCardId });
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
        if (xCard.interrupted('narrateOracleFollowup')) return null;
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
        if (text?.trim()) {
          await postOracleNarrationCard({ text, kind, oracleName, sessionId, narrationId, oracleCardId });
          scheduleNarrationCapture(text, campaignState, { detect: true, source: 'oracle_followup', actorId: character?.actorId ?? null, narrationId });
          return text;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateOracleFollowup retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateOracleFollowup failed:`, err);
    return null;
  }
}

function buildOracleUserMessage({
  oracleName, question, rolledLine, recentContext,
}) {
  // recentContext is a pre-joined STRING (getRecentNarrationContext), matching
  // the scene/paced builders. Use it directly — calling .join here threw
  // "recentContext.join is not a function" and silently killed every oracle
  // narration follow-up (bug since the oracle-narration feature landed).
  const recent = (typeof recentContext === 'string' && recentContext.length > 0)
    ? `\n\nRECENT NARRATION (most recent last):\n${recentContext}`
    : '';
  const q = question?.trim() ? `Question or context: ${question.trim()}\n` : '';
  return (
    `The player invoked the oracle:\n` +
    `Oracle: ${oracleName}\n` +
    q +
    `Mechanical result: ${rolledLine}\n` +
    `${recent}\n\n` +
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
    content: `<div class="sf-oracle-narration-card"><strong>${escapeHtml(header)} — narration</strong><p>${escapeHtml(stripMarkup(text))}</p></div>`,
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
 * @param {Object} args
 * @param {string} args.userMessage    — pre-built vignette prompt body
 *                                       (active/absent rosters, sector context,
 *                                       generation instructions)
 * @param {Object} args.campaignState
 * @returns {Promise<string|null>}
 */
export async function narrateSessionVignette({ userMessage, campaignState, narrationId = newNarrationId() }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  if (isXCardActive(campaignState))  return null;
  const xCard = watchXCard(campaignState);

  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Its sidecar's facts belong to a scene (issue #321 U34; see narrateOracleFollowup).
  await ensureSceneStarted(campaignState, 'session_vignette');

  const character = getActiveCharacter(campaignState);
  const extras = await buildNarratorExtras('session_vignette', campaignState, { character });
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
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
    if (!text?.trim()) return null;
    scheduleNarrationCapture(text, campaignState, { narrationId });   // its NPCs' developments → their cards (#286 D4)
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
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
        if (!text?.trim()) return null;
        scheduleNarrationCapture(text, campaignState, { narrationId });
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
 * client, a ship move, the consistency audit), so there is nothing to retract.
 *
 * @param {{ clock: { name:string, type:string, filled:number, segments:number, triggered:boolean }, campaignState: Object,
 *           narrationId?: string, stillTriggered?: (() => boolean|Promise<boolean>)|null }} args
 * @returns {Promise<string|null>}
 */
export async function narrateClockAdvancement({ clock, campaignState, narrationId = newNarrationId(), stillTriggered = null }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  if (isXCardActive(campaignState))  return null;
  const xCard = watchXCard(campaignState);

  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Its sidecar's facts belong to a scene (issue #321 U34; see narrateOracleFollowup).
  await ensureSceneStarted(campaignState, 'clock_vignette');

  // Its own role (a threat tightening, or arriving), not the session
  // vignette's "calm before / after" (issue #322 V23).
  const character = getActiveCharacter(campaignState);
  const extras = await buildNarratorExtras('clock_advance', campaignState, { character });
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  const typeFlair = clock.type === "campaign"
    ? "a long-running campaign threat or faction project"
    : "an immediate scene danger or countdown";
  const userMessage = clock.triggered
    ? `The clock "${clock.name}" (${typeFlair}) has TRIGGERED — it has now filled all ${clock.segments} segments. Write exactly 2-3 sentences of vivid fiction describing the moment this threat materialises or this deadline arrives. Pure narrative — no game mechanics, no clock language, no numbers.`
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
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
    return (text && text.trim()) ? text : null;
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
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
        return (text && text.trim()) ? text : null;
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateClockAdvancement retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateClockAdvancement failed:`, err);
    return null;
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
  const truthLine = ironTruth?.description
    ? `In this world, the Ironsworn bind their oaths thus — ${ironTruth.title ? `${ironTruth.title}: ` : ""}${ironTruth.description}`
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
export async function narrateVowSwearing({ vow, campaignState, speakerActorId = null, narrationId = newNarrationId() }) {
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
  const extras       = await buildNarratorExtras('vow_swearing', campaignState, { character });
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
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, matchedEntityIds: extras.matchedEntityIds ?? [], narrationId });
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
  const text = await narrateVowSwearing({ vow, campaignState, speakerActorId, narrationId });
  if (!text) return null;
  const clean = stripMarkup(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  const character = getActiveCharacter(campaignState);
  const extras = await buildNarratorExtras('inciting_incident', campaignState, { character });
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
 * @returns {Promise<string|null>}   — narration text, or null on failure/disabled
 */
export async function narratePacedInput(playerText, campaignState, options = {}) {
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
  await ensureSceneStarted(campaignState, 'first_narration_paced');

  // Don't suggest a social move against a fellow player character (finding G):
  // inter-PC tension is resolved through roleplay, not a Compel roll. Suppress
  // the nomination before it reaches the narrator (so no hint is written) and
  // the card (so no Roll button appears).
  const suggestedMove = suppressPcDirectedSocialMove(
    options.suggestedMove ?? null, playerText, character?.name ?? null,
  );

  const extras = await buildNarratorExtras('paced_narrative', campaignState, {
    playerNarration: playerText,
    character,
  });

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '', extras,
  );

  const recentContext = getRecentNarrationContext(sessionId, getNarratorContextCards());
  const sentenceTarget = settings.narrationLength ?? 3;
  const userMessage = buildPacedNarrativeUserMessage(
    playerText, recentContext, sentenceTarget, suggestedMove, character?.name ?? null,
  );

  try {
    const raw = await callNarratorAPI({
      label: 'narratePacedInput',
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
    });
    if (xCard.interrupted('narratePacedInput')) return null;
    const text = applyNarratorSidecar(raw, campaignState, {
      moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
    });

    if (!text?.trim()) return null;

    const buttonMove = reconcileSuggestedMove(text, suggestedMove, { playerText, speakerName: character?.name ?? null });
    await postPacedNarrativeCard(text, playerText, sessionId, buttonMove, character?.name ?? null, narrationId, extras.matchedEntityIds, options?.speakerActorId ?? null, options?.suggestedTargetId ?? null);
    schedulePacedDetection(text, campaignState, { actorId: character?.actorId ?? null, narrationId });
    schedulePacedTierUpdate(text, extras.matchedEntityIds, extras.matchedEntityTypes, campaignState, { narrationId });
    scheduleChronicleEntry({
      narrationText: text,
      campaignState,
      kind:          'paced',
    });
    return text;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
      label: 'narratePacedInput',
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
        });
        if (xCard.interrupted('narratePacedInput')) return null;
        const text = applyNarratorSidecar(raw, campaignState, {
          moveId: null, matchedEntityIds: extras.matchedEntityIds, narrationId,
        });
        if (text?.trim()) {
          const buttonMove = reconcileSuggestedMove(text, suggestedMove, { playerText, speakerName: character?.name ?? null });
          await postPacedNarrativeCard(text, playerText, sessionId, buttonMove, character?.name ?? null, narrationId, extras.matchedEntityIds, options?.speakerActorId ?? null, options?.suggestedTargetId ?? null);
          schedulePacedDetection(text, campaignState, { actorId: character?.actorId ?? null, narrationId });
          schedulePacedTierUpdate(text, extras.matchedEntityIds, extras.matchedEntityTypes, campaignState, { narrationId });
          scheduleChronicleEntry({
            narrationText: text,
            campaignState,
            kind:          'paced',
          });
          return text;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narratePacedInput retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narratePacedInput failed:`, err);
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
 * @param {{ actorId?: string|null, narrationId?: string|null }} [options] — the PC
 *   the narration was for (the draft card carries it, so Confirm puts a
 *   connection's bond Item on them), and the narration's id (stamped on what
 *   the pass records, for the X-Card — issue #329 X01)
 */
export function schedulePacedDetection(narrationText, campaignState, { actorId = null, narrationId = null } = {}) {
  setTimeout(() => {
    runPacedDetection(narrationText, campaignState, { actorId, narrationId })
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
 * @param {{ skipLore?: boolean, source?: string, actorId?: string|null, narrationId?: string|null }} [options] —
 *   `source` labels the draft card (default "paced_narrative"); `actorId`, the PC the narration was for,
 *   rides it to Confirm; `narrationId` is stamped on what the pass records (issue #329 X01)
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
      sessionId:            campaignState?.currentSessionId ?? '',
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
 * review card. Canonical GM only (world writes); after the same short delay
 * as the paced passes, so the card settles first. Both passes catch their own
 * errors.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @param {{ detect?: boolean, source?: string, actorId?: string|null, narrationId?: string|null }} [opts] —
 *   `narrationId`: stamped on what both passes record, for the X-Card (issue #329 X01)
 */
function scheduleNarrationCapture(narrationText, campaignState, { detect = false, source, actorId = null, narrationId = null } = {}) {
  if (!narrationText?.trim() || !isCanonicalGM()) return;
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

async function postPacedNarrativeCard(narrationText, playerText, sessionId, suggestedMove, playerName = null, narrationId = null, matchedEntityIds = [], actorId = null, suggestedTargetId = null) {
  const suggestionClass = suggestedMove ? ' sf-narration-card--with-suggestion' : '';
  const buttonRow = suggestedMove
    ? `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll ${escapeChatHtml(moveDisplayName(suggestedMove))}</button></div>`
    : '';
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-card--paced${suggestionClass}">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${escapeHtml(stripMarkup(narrationText))}</div>
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
 * True when `playerText` names a player character other than the speaker. Used
 * to suppress social-move suggestions aimed at a fellow PC (finding G). Matches
 * each other PC's full name and its first-name token as whole words.
 *
 * @param {string} playerText
 * @param {string|null} speakerName
 * @param {Array<{name?: string}>} [pcActors] — injectable for tests
 * @returns {boolean}
 */
export function inputNamesOtherPlayerCharacter(playerText, speakerName, pcActors) {
  const text = String(playerText ?? '').toLowerCase();
  if (!text) return false;
  let actors = pcActors;
  if (!Array.isArray(actors)) {
    try { actors = getPlayerActors(); } catch { actors = []; }
  }
  const speaker = String(speakerName ?? '').trim().toLowerCase();
  for (const a of actors) {
    const name = String(a?.name ?? '').trim();
    if (!name || name.toLowerCase() === speaker) continue;
    const tokens = new Set([name.toLowerCase(), name.split(/\s+/)[0].toLowerCase()]);
    for (const t of tokens) {
      if (t.length < 2) continue;
      // Unicode-aware: a PC named "Zoë" or "Élise" is a whole word too (issue #322 V19).
      if (wholeWordPattern(t, '').test(text)) return true;
    }
  }
  return false;
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
        <div class="sf-scene-prose">${escapeHtml(stripMarkup(responseText))}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneResponse: true,
        sceneText:     responseText,
        sceneQuestion: question,
        // Narrator-memory A1 — scene answers are narrator prose and feed
        // the recent-narration ring + session recap. Audited consumers:
        // the correction/audio render hooks no-op (no button markup on
        // this card), burn-supersede requires a resolutionId.
        narratorCard:  true,
        narrationText: responseText,
        sessionId:     sessionId ?? null,
        playerName:    playerName ?? null,   // with sceneQuestion, read back by the ring (ringEntryText)
        narrationId:   narrationId ?? null,  // its sidecar's ledger entries, for the X-Card (issue #321 U07)
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

async function postFallbackCard(resolution, campaignState = null) {
  const moveInfo = resolution?.moveName && resolution?.outcomeLabel
    ? `${resolution.moveName}: ${resolution.outcomeLabel}`
    : 'Move resolved.';
  const fallbackProse = `${moveInfo} — narration unavailable.`;

  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${moveInfo}</div>
        <div class="sf-narration-error">Narration unavailable — check your API key and proxy.</div>
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

export function applyNarratorSidecar(rawText, campaignState, ctx = {}) {
  // Master gate — when fact-continuity is disabled, return the raw text
  // unchanged. The sidecar instruction is also suppressed at the prompt
  // layer so well-behaved narrators won't emit a fence in this state, but
  // skip the parse just in case to avoid mutating ledgers silently.
  let enabled = true;
  try {
    enabled = game.settings.get(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch (err) {
    // Setting not registered (unit tests, very early init). Default to on.
    console.debug?.(`${MODULE_ID} | factContinuity: setting lookup failed; defaulting to enabled:`, err);
  }
  if (!enabled) {
    recordNarratorFactBlock(rawText, { skipped: 'fact continuity is off' });
    return rawText;
  }

  const { prose, sidecar, parseError } = extractSidecar(rawText);
  recordNarratorFactBlock(rawText, { sidecar, parseError });

  if (parseError) {
    console.warn(`${MODULE_ID} | factContinuity: sidecar parse failed:`, parseError);
  } else if (!sidecar) {
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
  const applySidecarHere = isCanonicalGM();
  if (sidecar && campaignState && !applySidecarHere) {
    relayNarratorSidecar(sidecar, campaignState, ctx);
  }
  if (sidecar && campaignState && applySidecarHere) {
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
  import('../multiplayer/gmRelay.js').then(({ requestGmAction, hasActiveGM }) => {
    if (!hasActiveGM()) {
      console.debug?.(`${MODULE_ID} | factContinuity: no GM connected — narrator side-data (truths, state changes, scene frame) not recorded.`);
      return null;
    }
    return requestGmAction('narrator.sidecar', {
      sidecar,
      sceneId:          campaignState.currentSceneId ?? null,
      moveId:           ctx.moveId ?? null,
      matchedEntityIds: Array.isArray(ctx.matchedEntityIds) ? ctx.matchedEntityIds : [],
      narrationId:      typeof ctx.narrationId === 'string' ? ctx.narrationId : null,
    });
  }).catch(err =>
    console.warn(`${MODULE_ID} | factContinuity: narrator side-data relay failed:`, err?.message ?? err));
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
 * @param {{ sidecar: Object, sceneId?: string|null, moveId?: string|null, narrationId?: string|null }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<void>}
 */
export async function applyRelayedNarratorSidecar(payload = {}, _ctx = {}) {
  // Re-normalised and bounded: it crossed the socket from a client.
  const sidecar = normaliseSidecar(payload?.sidecar);
  if (!sidecar) return;
  sidecar.newTruths    = sidecar.newTruths.slice(0, RELAYED_SIDECAR_MAX_ENTRIES);
  sidecar.stateChanges = sidecar.stateChanges.slice(0, RELAYED_SIDECAR_MAX_ENTRIES);
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
  await ensureSceneStarted(campaignState, 'relayed_narration');
  await applySidecarSideData(sidecar, campaignState, { moveId: payload.moveId ?? null, narrationId });
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
  const filteredSidecar = { ...sidecar, stateChanges: otherChanges };

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
      applySceneFrame(sidecar.sceneFrame, campaignState, { narrationId });
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
  return persisted;
}

// Whether a call on `model` turns extended thinking off — the rule lives in
// narration/thinking.js, shared with every short structured call that runs on
// the narration model (issue #325 W27); re-exported here for its callers.
export { narrationDisablesThinking };

async function callNarratorAPI({ apiKey, systemPrompt, userMessage, model, maxTokens, label = null }) {
  const body = {
    model,
    max_tokens: maxTokens ?? 16000,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };
  // Keep narration fast and un-truncated on a thinking-by-default model (Sonnet
  // 5): no extended thinking eating the max_tokens cap. No-op for the older
  // offered models, which already default to thinking-off (#latency).
  if (narrationDisablesThinking(model)) {
    body.thinking = { type: 'disabled' };
  }

  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta':    'prompt-caching-2024-07-31',
  };

  // What the narrator is sent and what comes back, for `!narrator debug`
  // (issue #290) — in memory, this browser only.
  const capture = recordNarratorRequest({
    label, model, maxTokens: body.max_tokens, system: systemPrompt, user: userMessage,
  });
  const started = Date.now();
  let data;
  try {
    data = await apiPost(ANTHROPIC_URL, headers, body);
  } catch (err) {
    recordNarratorResponse(capture, { error: err, elapsedMs: Date.now() - started });
    throw err;
  }
  // Token usage and time per call (issue #286 F6 step 1) — fire-and-forget.
  logNarratorUsage({
    label, model,
    usage:     data?.usage ?? null,
    elapsedMs: Date.now() - started,
    sessionId: storedCampaignState()?.currentSessionId ?? null,
  }).catch(() => {});

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

  const text = (data.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  recordNarratorResponse(capture, { data, text, elapsedMs: Date.now() - started });

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
 * Read the narrator.spotlightRotation world toggle (issue #232). Defaults to
 * enabled when the setting is unregistered (early init, unit tests).
 */
function spotlightRotationEnabledFromSettings() {
  try {
    return game.settings.get(MODULE_ID, 'narratorSpotlightRotation') !== false;
  } catch {
    return true;
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

    return buildSpotlightBlock(selection);
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
      narrationModel:          game.settings.get(MODULE_ID, 'narrationModel')        ?? 'claude-sonnet-4-5-20250929',
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
    };
  } catch (err) {
    console.error(`${MODULE_ID} | narrator: getNarratorSettings failed; falling back to hardcoded defaults:`, err);
    return {
      narrationEnabled:        true,
      narrationModel:          'claude-sonnet-4-5-20250929',
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
 * What a campaign recap's cache is checked against (issue #301 B04): the
 * entry count and a hash of exactly what the recap prompt is built from —
 * each entry's text, timestamp and session number, in campaign order (pins
 * and type changes do not count). The count alone kept serving a recap made
 * before a correction that kept the count: "Vex died." edited to "Vex
 * survived.", or a wrong entry deleted and a right one added, left the old
 * recap in the cache and in every session-opening narration. Exported for
 * the tests and Quench checks that seed a cache.
 *
 * @param {Object} campaignState
 * @returns {Promise<{ chronicleLength: number, chronicleHash: string }>}
 */
export async function campaignRecapCacheKey(campaignState) {
  return chronicleRecapKey(await _recapChronicle(campaignState));
}

// Every PC's chronicle entries for the recap — [] when they cannot be read.
async function _recapChronicle(campaignState) {
  try {
    return await _collectAllChronicleEntries(campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: reading the chronicle for the recap failed:`, err);
    return [];
  }
}

function chronicleRecapKey(entries) {
  let h = 0x811c9dc5;                                   // FNV-1a, 32-bit
  for (const e of entries) {
    const s = `${e?.timestamp ?? ''}\u0000${e?.sessionNumber ?? ''}\u0000${e?.text ?? e?.content ?? ''}\u0001`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return { chronicleLength: entries.length, chronicleHash: (h >>> 0).toString(16).padStart(8, '0') };
}

// A recap cache is current when it was made from the chronicle as it stands
// now. One from before the hash existed is not — it is regenerated once.
function isRecapCacheCurrent(cache, key) {
  return typeof cache?.text === 'string' && cache.text.trim() !== ''
    && cache.chronicleLength === key.chronicleLength
    && cache.chronicleHash === key.chronicleHash;
}

/**
 * Chronicle entries as formatted strings for the campaign recap prompt.
 */
function formatRecapEntries(entries) {
  return entries.map(e => {
    const date    = e.timestamp ? new Date(e.timestamp).toLocaleDateString() : '';
    const session = e.sessionNumber ? `Session ${e.sessionNumber}` : '';
    const header  = [session, date].filter(Boolean).join(' — ');
    const body    = e.text ?? e.content ?? '';
    return header ? `[${header}]\n${body}` : body;
  }).filter(Boolean);
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
