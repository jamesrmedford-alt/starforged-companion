/**
 * STARFORGED COMPANION
 * src/entities/entityExtractor.js — Combined detection pass
 *
 * One Haiku call per narration that serves both entity extraction (per
 * narrator-entity-discovery scope §9) and World Journal updates (per
 * world-journal scope §5). The single prompt asks for both at once, the
 * single response is parsed, then routed to the entity draft-card pipeline
 * and to the World Journal write functions.
 *
 * Routing rule (world-journal scope §4):
 *   - Lore   → WJ when salience clears the lore floor, else the running session log
 *   - Threat → WJ when salience clears the threat floor, else the running session log
 *   - Faction → WJ only if no entity record with that name exists, else
 *     handled via the entity generative tier
 *   - Location → same rule as faction
 *   - NPC / ship / creature → entity only, never WJ
 *
 * The detector rates each lore/threat candidate's salience (see
 * src/world/salience.js); per-channel floors keep transient scene beats out of
 * the World Journal (findings F15 / F17 / F21). Below-threshold beats append to
 * one running session-log page (D7 / F18) rather than being dropped. Fail-open —
 * an unrated item is recorded as durable, never rerouted.
 *
 * For interaction-class moves with matched entities, a separate Haiku call
 * (`appendGenerativeTierUpdates`) extracts narrator-added details and
 * appends them to the entity generativeTier flags.
 *
 * The Haiku call is injectable via options.callDetectionAPI for testing —
 * default uses apiPost from src/api-proxy.js.
 */

import { apiPost } from "../api-proxy.js";
import { getEntityDocument, readEntityFlag, writeEntityFlag, ENTITY_ID_LISTS, unionIdList } from "./registry.js";

import { getConnection, createConnection, updateConnection, roleTitleFromName } from "./connection.js";
import { getPlayerActors, createCharacterBondItem, isPlayerCharacterActor } from "../character/actorBridge.js";
import { resolveUserActorId } from "../multiplayer/speaker.js";
import { getSettlement, createSettlement } from "./settlement.js";
import { getFaction,    createFaction, findFactionByName, applyAttitudeToFactionRecord, seedFactionRecord } from "./faction.js";
import { getShip,       createShip, resolveActiveRegion } from "./ship.js";
import { getPlanet,     createPlanet }     from "./planet.js";
import { getLocation,   createLocation }   from "./location.js";
import { getCreature,   createCreature }   from "./creature.js";
import { rollOracle }                      from "../oracles/roller.js";
import { onChatMessageRender }             from "../system/chatHooks.js";
import { HONORIFIC_PREFIXES, wholeWordPattern } from "../context/relevanceResolver.js";
import { isNarrationXCarded }              from "../context/safety.js";
import { serialiseCampaignStateWrite }     from "../multiplayer/campaignStateChain.js";

import {
  recordLoreDiscovery,
  recordThreat,
  recordFactionIntelligence,
  recordLocation,
  promoteLoreToConfirmed,
  applyStateTransition as wjApplyStateTransition,
  appendSessionLogBeat,
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
  getFactionEntry,
} from "../world/worldJournal.js";
import { passesSalience, getSalienceThreshold, SALIENCE_ORDER } from "../world/salience.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-5-5";

const ENTITY_GETTERS = {
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
};

const ENTITY_ID_FIELDS = {
  connection: "connectionIds",
  settlement: "settlementIds",
  faction:    "factionIds",
  ship:       "shipIds",
  planet:     "planetIds",
  location:   "locationIds",
  creature:   "creatureIds",
};

/**
 * The caller's campaignState with each entity id list widened to the store's
 * (issue #347 AB09). A move holds the copy it read before its lock claim for
 * the whole move, and its capture deduped against that copy: an NPC the GM
 * confirmed from a draft card while the move was confirmed or narrated is
 * listed in the store only, so the detection prompt did not call them
 * established, every route gate passed them, and the hit made a second card
 * — with a second bond and portrait. A read-only view for the dedup gates
 * (the established list, entityExistsForName / entityExistsAnyType, the
 * known-NPC match); never written back.
 *
 * @param {Object|null} campaignState
 * @returns {Object|null}
 */
function withStoredEntityIds(campaignState) {
  let stored = null;
  try { stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null; }
  catch { stored = null; }
  if (!stored || stored === campaignState) return campaignState;
  const view = { ...(campaignState ?? {}) };
  for (const field of ENTITY_ID_LISTS) {
    const merged = unionIdList(stored[field], campaignState?.[field]);
    if (merged) view[field] = merged;
  }
  return view;
}

/**
 * Reduce an entity name to a canonical form for dedup comparisons.
 * The detector may strip a title when it extracts a name from prose, so we
 * strip one shared title set: the honorifics (HONORIFIC_PREFIXES, shared with
 * the name index) and the titles the module itself writes into NPC names as
 * their role (connection.js NAME_TITLE_ROLES, via roleTitleFromName). "Dr.
 * Chen" stored as a connection matches a "Chen" detection on the next
 * narration, and the PC "Doctor Chen" or the vow target "Administrator Lyssa
 * Chen" match "Dr. Chen" / "Lyssa Chen" (issue #321 U30), instead of each
 * being offered as a new NPC.
 * Lowercases, trims, collapses interior whitespace, and strips a single
 * leading title (with optional trailing period). Returns `""` for
 * non-string / empty input.
 */
export function normalizeEntityName(name) {
  if (typeof name !== "string") return "";
  let n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return "";
  const m = n.match(/^([a-z]+)\.?\s+(.+)$/);
  if (m && (HONORIFIC_PREFIXES.has(m[1]) || roleTitleFromName(m[1]))) n = m[2];
  return n.trim();
}

/**
 * Heuristic: does this look like an auto-generated placeholder name for an
 * as-yet-unnamed figure ("Unknown Suited Figure", "Unknown Connection", "The
 * Stranger") rather than a proper name? Used to bound the rename/identity-merge
 * path (a placeholder figure later named in the fiction is renamed in place;
 * genuinely-named entities are never auto-merged). Deliberately conservative —
 * a false negative just falls back to the old "treat as new" behaviour, which
 * the GM can dismiss, whereas a false positive would wrongly collapse two
 * distinct characters.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isPlaceholderName(name) {
  const n = String(name ?? "").trim();
  if (!n) return false;
  // Leading generic qualifier: "Unknown …", "Unnamed …", "Mysterious …", "The …"
  if (/^(unknown|unnamed|unidentified|mysterious|the)\b/i.test(n)) return true;
  // Generic noun standing in for a person, anywhere in the name.
  if (/\b(figure|stranger|newcomer|silhouette|individual|operative)\b/i.test(n)) return true;
  return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the combined detection pass for one narration. Returns the parsed
 * detection result (entities + worldJournal sections). Does not route
 * anywhere — call routeEntityDrafts and routeWorldJournalResults to apply.
 *
 * @param {string} narrationText
 * @param {string} moveId
 * @param {string} outcome
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {Function} [options.callDetectionAPI] — async (prompt, system) => raw text.
 *   Override for tests. Default posts to Anthropic via apiPost.
 * @returns {Promise<Object>} — { entities, worldJournal }
 */
// Detection API resilience (PLAYTEST-1717 B). The Haiku call can fail
// transiently (rate limit, network blip); a bounded retry recovers those. A
// *persistent* failure must not be silent — it means the narration's new
// entities / lore / factions are dropped, which is exactly how an inciting
// incident captured nothing while the only signal was a swallowed console line.
// On final failure we raise to console.error AND surface a GM-only toast.
const DETECTION_API_RETRIES      = 1;    // total attempts = retries + 1
const DETECTION_RETRY_BACKOFF_MS = 500;  // multiplied by the attempt number

export async function runCombinedDetectionPass(
  narrationText, moveId, outcome, campaignState, options = {},
) {
  const prompt   = buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState);
  const callAPI  = options.callDetectionAPI ?? defaultCallDetectionAPI;
  const retries  = Number.isInteger(options.detectionRetries) ? options.detectionRetries : DETECTION_API_RETRIES;
  const backoff  = Number.isInteger(options.retryBackoffMs)   ? options.retryBackoffMs   : DETECTION_RETRY_BACKOFF_MS;

  let raw;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      raw = await callAPI(prompt);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && backoff > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff * (attempt + 1)));
      }
    }
  }

  if (lastErr) {
    console.error(
      `${MODULE_ID} | entityExtractor: detection API failed after ${retries + 1} attempt(s):`,
      lastErr,
    );
    notifyDetectionFailure();
    return emptyDetection();
  }

  // A reply that holds no JSON object — cut off at max_tokens, or malformed —
  // drops every entity, lore item, threat and faction of this narration, so
  // it is never silent either (issue #321 U15; cf. NARRCHK-TRUNC-SILENT).
  if (raw && !parseDetectionJson(raw)) {
    console.warn(
      `${MODULE_ID} | entityExtractor: the detection reply is not a complete JSON object — ` +
      `this narration's entities, lore and factions were not captured.`,
    );
    notifyDetectionFailure();
  }
  return parseDetectionResponse(raw, campaignState);
}


// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel `moveId` value used by the paced-narrative detection path
 * (narrator-suggestion-loop remediation §C). Triggers the conditional
 * "no move was rolled" framing in `buildCombinedDetectionPrompt`. Not a
 * real foundry-ironsworn move id; using a snake_case sentinel keeps the
 * shape compatible with the existing string parameter without changing
 * the call signature.
 */
export const PACED_NARRATIVE_MOVE_ID = "paced_narrative";

/**
 * Sentinel `outcome` value paired with PACED_NARRATIVE_MOVE_ID. The
 * paced path has no roll outcome; the prompt builder omits the
 * `Outcome:` line entirely when this sentinel is seen so the model
 * doesn't get confused by `Outcome: n/a` masquerading as a real result.
 */
export const PACED_NARRATIVE_OUTCOME = "n/a";

/**
 * Build the single Haiku prompt covering both entity extraction (scope §9)
 * and World Journal state updates (WJ scope §5). The base entity-extraction
 * prompt is prefixed with the current WJ state so the model can detect
 * state transitions. Scopes for established entity names + dismissed names
 * are appended so the model does not re-suggest them.
 *
 * When `moveId === PACED_NARRATIVE_MOVE_ID` the move/outcome lines are
 * rendered as a "no move was rolled" framing instead of literal values,
 * so paced-narrative detection calls get a clearer prompt without
 * confusing the model with a fake move id (suggestion-loop remediation §C).
 */
export function buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState) {
  // The store's lists too: an NPC confirmed while the move ran is established (issue #347 AB09).
  const listed       = withStoredEntityIds(campaignState);
  const established  = collectEstablishedEntityNames(listed);
  const placeholders = collectPlaceholderConnectionNames(listed);
  const dismissed    = (campaignState?.dismissedEntities ?? []).filter(Boolean);
  const pending      = collectPendingDraftNames();

  const wjState = describeWorldJournalState(campaignState);

  const isPaced = moveId === PACED_NARRATIVE_MOVE_ID;
  const moveLine = isPaced
    ? `Move: (paced narration — no move was rolled).`
    : `Move: ${moveId}.`;
  const outcomeLine = isPaced || outcome === PACED_NARRATIVE_OUTCOME
    ? null
    : `Outcome: ${outcome}.`;

  return [
    `You are analysing an Ironsworn: Starforged narration.`,
    moveLine,
    ...(outcomeLine ? [outcomeLine] : []),
    ``,
    `ENTITY TYPES TO DETECT:`,
    `- connection: named individual (NPC, person, AI)`,
    `- ship: named vessel or craft`,
    `- settlement: named community, station, outpost`,
    `- faction: named organisation, order, or power`,
    `- location: named specific place (derelict, vault, structure, site)`,
    `- creature: named or distinctly described creature type`,
    ``,
    `For a connection, set "pronouns" to the pronoun set the narration`,
    `established for that person ("she/her", "he/him", "they/them"), or null`,
    `when the prose never gendered them. Report what the text used — do not`,
    `guess from the name. Likewise set "role" to the role or occupation the`,
    `narration gave them ("dockmaster", "smuggler") and "goal" to what it says`,
    `they want — each null when the prose did not say.`,
    ``,
    `ESTABLISHED ENTITIES (do not return these as new entities):`,
    established.length ? established.join(", ") : "(none)",
    `Treat honorifics and titles as equivalent to the bare name —`,
    `"Dr. Chen" and "Chen" refer to the same person; "Captain Reyes" and`,
    `"Reyes" refer to the same person. Match against this list by stripping`,
    `any leading title before comparing.`,
    ``,
    `PENDING DRAFTS (already proposed in earlier narration, not yet confirmed —`,
    `do not return these again, the GM has them under review):`,
    pending.length ? pending.join(", ") : "(none)",
    ``,
    `UNNAMED / PLACEHOLDER FIGURES (established entities introduced without a`,
    `proper name). If THIS narration reveals a real name for one of them — e.g.`,
    `the figure recorded as "Unknown Suited Figure" gives the name "Vex" — do`,
    `NOT return a new connection; instead record it under "renames" below, with`,
    `"from" set to the exact placeholder name and "to" the revealed name:`,
    placeholders.length ? placeholders.join(", ") : "(none)",
    ``,
    `DISMISSED NAMES (do not return these — the GM has already rejected them):`,
    dismissed.length ? dismissed.join(", ") : "(none)",
    ``,
    `CURRENT WORLD JOURNAL STATE (for state transition detection):`,
    `Confirmed lore: ${wjState.confirmedLore.join("; ") || "(none)"}`,
    `Narrator-asserted lore: ${wjState.assertedLore.join("; ") || "(none)"}`,
    `Active threats: ${wjState.threats.join("; ") || "(none)"}`,
    `Faction attitudes: ${wjState.factions.join("; ") || "(none)"}`,
    ``,
    `Return a single JSON object with this exact shape (no prose):`,
    `{`,
    `  "entities": [`,
    `    { "type": string, "name": string, "description": string,`,
    `      "pronouns": string|null, "role": string|null, "goal": string|null,`,
    `      "confidence": "high"|"medium"|"low" }`,
    `  ],`,
    `  "renames": [`,
    `    { "from": string, "to": string }`,
    `  ],`,
    `  "worldJournal": {`,
    `    "lore": [`,
    `      { "title": string, "category": string, "text": string,`,
    `        "salience": "trivial"|"scene"|"notable"|"significant"|"defining",`,
    `        "narratorAsserted": true, "confirmed": false,`,
    `        "entityName": string|null }`,
    `    ],`,
    `    "threats": [`,
    `      { "name": string, "type": string, "severity": string, "summary": string,`,
    `        "salience": "trivial"|"scene"|"notable"|"significant"|"defining" }`,
    `    ],`,
    `    "factionUpdates": [`,
    `      { "name": string, "attitude": string, "summary": string, "isNew": boolean }`,
    `    ],`,
    `    "locationUpdates": [`,
    `      { "name": string, "type": string, "summary": string, "isNew": boolean }`,
    `    ],`,
    `    "stateTransitions": [`,
    `      { "entryType": "threat"|"lore"|"faction", "name": string,`,
    `        "change": "resolved"|"escalated"|"contradicted"|"attitudeShift",`,
    `        "newValue": string }`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `SALIENCE — rate how durable each lore and threat item is, so transient`,
    `scene beats do not become permanent World Journal entries:`,
    `  - "defining":    a world truth, a faction's overarching agenda, or a`,
    `                   revelation that reshapes the campaign.`,
    `  - "significant": a durable world or character fact that will still matter`,
    `                   in later sessions (e.g. the cargo is actually wartime munitions).`,
    `  - "notable":     a meaningful clue or complication that may matter beyond`,
    `                   the current scene.`,
    `  - "scene":       matters only within the current encounter (a sensor blip,`,
    `                   a description, an immediate observation).`,
    `  - "trivial":     atmospheric flavour with no lasting weight.`,
    `Be sparing: most moment-to-moment narration is "scene" or "trivial". Reserve`,
    `"significant" and "defining" for facts worth remembering next session.`,
    ``,
    `entityName rules: set to the entity's exact name when a lore item is a`,
    `fact specific to one ESTABLISHED ENTITY (NPC, ship, faction, location,`,
    `creature). Those facts belong on the entity record, not in the World`,
    `Journal lore. If the lore is a world-level fact (not about one specific`,
    `known entity), leave entityName null or omit it.`,
    `Lore rules: only extract concrete narrative facts, not atmosphere.`,
    `Threat rules: only named or distinctly typed dangers with narrative weight.`,
    `Faction update rules: include every named faction that appears in this narration`,
    `in "factionUpdates" — even on its first mention, and even when it is named only`,
    `in passing or in possessive/adjectival form. "classified Triumvirate intelligence",`,
    `"the Compact's enemies", and "a Devoted shrine" all name a faction — emit`,
    `"Triumvirate", "the Compact", "the Devoted". Treat named orders, churches, cults,`,
    `guilds, dominions, syndicates, clans, fleets, crews, and intelligence networks as`,
    `factions. When the prose names several at once ("three religious orders — the`,
    `Lattice, the Devoted, and the Circle of Iron"), emit ONE factionUpdates entry per`,
    `named order. Set isNew: true for factions not in ESTABLISHED ENTITIES; set isNew:`,
    `false for ones already listed. Never downgrade a named faction to a lore item —`,
    `a fact ABOUT a faction may be lore, but the faction itself belongs in factionUpdates.`,
    `Location update rules: include every named specific site (vault, derelict, station,`,
    `structure) in "locationUpdates" — even on first mention. Set isNew: true for`,
    `locations not in ESTABLISHED ENTITIES.`,
    `Entity rules: only return entities clearly named or distinctly typed.`,
    `Do NOT return generic references ("a guard", "the station", "some raiders").`,
    `Rename rules: only emit a rename when the narration gives a proper name to`,
    `one of the PLACEHOLDER FIGURES above. "from" must be exactly one of those`,
    `placeholder names; never rename an already-properly-named entity. A renamed`,
    `figure must NOT also appear in "entities".`,
    `State transitions: compare narration against the CURRENT WORLD JOURNAL STATE`,
    `above. Threat resolved/escalated, lore contradicted, faction attitude shift.`,
    `For a threat transition, "name" MUST exactly match a threat that already`,
    `appears in the CURRENT WORLD JOURNAL STATE above — do NOT invent a threat`,
    `name from the narration, and do NOT emit a threat transition for a danger`,
    `that is not already a recorded threat (a brand-new danger belongs in its own`,
    `detection, not as a state change). If no recorded threat matches, omit it.`,
    `Return empty arrays for any section with nothing to report.`,
    ``,
    `Narration:`,
    narrationText ?? "",
  ].join("\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the raw Haiku response. Filters out:
 *   - low-confidence entity results
 *   - entities whose names match an established entity record
 *   - entities whose names appear in campaignState.dismissedEntities
 *
 * Returns the empty detection shape on any parse error so callers don't have
 * to special-case missing fields.
 *
 * @param {string} text — raw JSON-wrapped string
 * @param {Object} campaignState
 * @returns {{ entities, worldJournal }}
 */
export function parseDetectionResponse(text, campaignState) {
  return detectionFromParsed(parseDetectionJson(text), campaignState);
}

/** The reply's JSON object, or null when it holds none (cut off, malformed, empty). */
function parseDetectionJson(text) {
  if (!text || typeof text !== "string") return null;
  const slice = (text.match(/\{[\s\S]*\}/) ?? [text])[0];
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function detectionFromParsed(parsed, campaignState) {
  if (!parsed) return emptyDetection();

  const entities = Array.isArray(parsed?.entities) ? parsed.entities : [];
  const wj       = parsed?.worldJournal && typeof parsed.worldJournal === "object"
    ? parsed.worldJournal
    : {};

  const dismissed = new Set(
    (campaignState?.dismissedEntities ?? [])
      .filter(n => typeof n === "string")
      .map(normalizeEntityName)
      .filter(Boolean),
  );
  const established = new Set(
    collectEstablishedEntityNames(withStoredEntityIds(campaignState))
      .map(normalizeEntityName)
      .filter(Boolean),
  );
  const pending = new Set(
    collectPendingDraftNames().map(normalizeEntityName).filter(Boolean),
  );

  // Renames: a placeholder figure (e.g. "Unknown Suited Figure") revealed to
  // have a proper name (e.g. "Vex"). Validate to { from, to } string pairs.
  const renames = (Array.isArray(parsed?.renames) ? parsed.renames : [])
    .map(r => ({
      from: typeof r?.from === "string" ? r.from.trim() : "",
      to:   typeof r?.to   === "string" ? r.to.trim()   : "",
    }))
    .filter(r => r.from && r.to && normalizeEntityName(r.from) !== normalizeEntityName(r.to));

  // A name being renamed TO must never also be created as a brand-new entity —
  // belt-and-braces in case the model lists it in both places. Only for a
  // rename that can land, though: its `from` must name a recorded placeholder
  // figure. Any other rename is skipped (applyEntityRenames), and dropping its
  // `to` as well lost the newly named NPC entirely (issue #321 U27).
  const renameTargets = new Set(renames
    .filter(r => findPlaceholderConnection(r.from, campaignState))
    .map(r => normalizeEntityName(r.to))
    .filter(Boolean));

  const filteredEntities = entities
    .filter(e => e && typeof e.name === "string" && e.name.trim())
    .filter(e => (e.confidence ?? "high") !== "low")
    .filter(e => !dismissed.has(normalizeEntityName(e.name)))
    .filter(e => !established.has(normalizeEntityName(e.name)))
    .filter(e => !pending.has(normalizeEntityName(e.name)))
    .filter(e => !renameTargets.has(normalizeEntityName(e.name)))
    // Sanitize detected pronouns (CHAR-NPC-PRONOUN-ROLL-BLIND): keep only
    // pronoun-shaped values ("she/her", "ze/zir", up to three tokens);
    // anything else — prose, guesses, junk — drops to "". The role and goal
    // the narration gave a connection (issue #286 D3) are short strings.
    .map(e => ({
      ...e,
      pronouns: normalisePronounSet(e.pronouns),
      role:     detectedPhrase(e.role),
      goal:     detectedPhrase(e.goal),
    }));

  return {
    entities: filteredEntities,
    renames,
    worldJournal: {
      lore:             Array.isArray(wj.lore)             ? wj.lore             : [],
      threats:          Array.isArray(wj.threats)          ? wj.threats          : [],
      factionUpdates:   Array.isArray(wj.factionUpdates)   ? wj.factionUpdates   : [],
      locationUpdates:  Array.isArray(wj.locationUpdates)  ? wj.locationUpdates  : [],
      stateTransitions: Array.isArray(wj.stateTransitions) ? wj.stateTransitions : [],
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING — entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route entity drafts to either an auto-create path (for make_a_connection
 * connection drafts) or a GM-only draft chat card listing the candidates.
 *
 * @param {Array}  entities
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.autoCreateConnection]  — when true, the first
 *   connection-typed draft is auto-created via createConnection() rather
 *   than queued on the GM card. Used by make_a_connection on a hit.
 *   The paced-narrative detection path explicitly sets this to false
 *   so detected NPCs always go through GM review (suggestion-loop
 *   remediation §C — see docs/narrator/narrator-suggestion-loop-group-c-design-memo.md).
 *   When no connection was created, a pending draft row or a known NPC
 *   `namingText` names is made the roller's connection (issue #325 W23,
 *   #345 AA19) — the one `lineText` names, when the narration names several
 *   (connectNamedFigure; issue #347 AB10).
 * @param {string}  [options.namingText] — the move's narration (player's and
 *   narrator's), for the pending-draft and known-NPC fallback
 * @param {string}  [options.lineText] — the player's line: which of several
 *   named NPCs the move was with (a round's hit reads its own, below)
 * @param {string|null} [options.targetName] — the interpreter's target for a
 *   free-flow Make a Connection: which of several named NPCs it was with when
 *   the line does not say (KNOWN-NPC-CONNECTION-NO-TARGET)
 * @param {Array<{ actorId: string|null, connectionSeed?: Object|null, owns: (figure: Object) => boolean, lineText?: string }>} [options.connectionRollers]
 *   — a Batch Mode round's Make a Connection hits, in confirm order, in place
 *   of `autoCreateConnection` (issue #342 Z09): each creates one connection,
 *   the first detected (else pending) one its `owns` says its own roller's
 *   action met, with its own seed and its bond on its roller. The rest are
 *   queued — the round's narration is several characters', so its first
 *   connection is not the first hit's. `lineText` is the hit's own entry's
 *   line, in place of `options.lineText` (ROUND-CONNECTION-LINE-JOINED).
 * @param {string}  [options.sessionId]
 * @param {string}  [options.source]  — telemetry flag attached to the
 *   GM draft card. "paced_narrative" for paced-path detection;
 *   anything else / omitted is treated as "move_resolution" (default).
 * @param {string|null} [options.actorId] — the PC the narration was for (the
 *   roller): an auto-created connection's bond Item goes to them, and the
 *   draft card carries it so Confirm does too (issue #321 U23).
 * @param {string[]|null} [options.actorIds] — a Batch Mode round's acting PCs:
 *   with two or more, the draft card carries them all (`flags.actorIds`) in
 *   place of `actorId`, and a connection row's Confirm asks which of them the
 *   NPC is a connection of, or none (issue #342 D3).
 * @param {string|null} [options.narrationId] — the narration whose capture
 *   this is: stamped on the faction it surfaces to the World Journal, so an
 *   X-Card on the narration deletes that page (issue #335 Y02; issue #329
 *   X01 — a capture writer takes the id from its caller), on the draft card
 *   (issue #338 D6(i)) and on the connection it auto-creates
 *   (`createdFromNarrationId`, D6(ii)).
 * @returns {Promise<{ created: Array, queued: Array }>}
 */
export async function routeEntityDrafts(entities, campaignState, options = {}) {
  const narrationId = typeof options.narrationId === "string" && options.narrationId ? options.narrationId : null;
  // Nothing for a narration the X-Card removed — checked before each write
  // (XCARD-LATE-CAPTURE): no connection, faction page or draft card from it.
  const removed = () => isNarrationXCarded(narrationId);
  const created = [];
  const queued  = [];
  const pendingNormalized = new Set(
    collectPendingDraftNames().map(normalizeEntityName).filter(Boolean),
  );
  const slots = connectionSlots(options);

  for (const entity of entities ?? []) {
    if (removed()) return { created, queued: [] };
    if (!entity?.name || !entity?.type) continue;
    if (!ENTITY_GETTERS[entity.type]) continue;
    // Cross-type dedup. A name that already exists anywhere in
    // campaignState — settlement, location, faction, anything — should not
    // be re-proposed as a different entity type. The detector classifies
    // entities by surface form ("Oxidized Kettle cantina" can read as a
    // Location even though the parent settlement is also called Oxidized
    // Kettle), so the type-scoped entityExistsForName(name, type, …) lets
    // duplicates through. entityExistsAnyType catches the cross-type case.
    if (entityExistsAnyType(entity.name, campaignState)) continue;
    // Skip names already sitting in an unresolved draft card — the GM is
    // already reviewing them; re-flagging causes the suggestion loop.
    if (pendingNormalized.has(normalizeEntityName(entity.name))) continue;

    const slot = entity.type === "connection" ? slots.find(s => !s.done && s.takes(entity)) : null;
    if (slot) {
      try {
        const seedData = buildConnectionSeedData(entity, slot.connectionSeed);
        const record = await createConnection({
          name:                      seedData.name,
          description:               seedData.description,
          role:                      seedData.role,
          goal:                      seedData.goal,
          pronouns:                  seedData.pronouns,
          portraitSourceDescription: seedData.portraitSource,
          firstAppearance:           options.sessionId ?? "",
          // The narration that made them: an X-Card on it takes the card
          // away again while nobody has used it (retractNarrationConnections
          // — issue #338 D6(ii)).
          ...(narrationId ? { createdFromNarrationId: narrationId } : {}),
        }, campaignState);
        // An X-Card landing while the card is made deletes it (the stamp
        // above); nothing more is added to it — no bond, portrait or facts.
        if (removed()) return { created, queued: [] };
        await registerConnectionOnActiveCharacter(record, { actorId: slot.actorId }).catch(err =>
          console.warn(`${MODULE_ID} | entityExtractor: bond item registration failed:`, err));
        if (removed()) return { created, queued: [] };
        // The narration that introduced them recorded their identity anchor
        // under their name, before the card existed.
        await promoteNewEntityLedgerSubjects(entity.name, "connection", record, campaignState);
        slot.done = true;
        created.push({ entity, record });
        // Last, and started rather than awaited: the move this capture is
        // part of holds the table's move lock until the capture returns, and
        // the portrait — the image, its download and upload — can take
        // minutes (issue #347 AB01). The card and the bond exist now.
        if (!removed()) await postCreationEnrichment("connection", record, campaignState);
      } catch (err) {
        console.error(`${MODULE_ID} | entityExtractor: auto-create connection failed:`, err);
        queued.push(entity);
      }
      continue;
    }

    // Factions are soft world-canon, like lore — surface them to the World
    // Journal the moment they're named, instead of leaving them invisible in a
    // GM-only draft card. Lore auto-confirms to WJ (the "world lore is now
    // auto-confirmed" decision); factions did not, so a faction the narrator
    // introduced ("the Triumvirate", "the Lattice/Devoted/Circle of Iron")
    // never appeared anywhere until the GM happened to confirm its draft. We
    // still queue the draft below so the GM can build a full faction entity
    // record; the WJ entry gives the table an immediate, durable home for it.
    // Once: a faction this pass's factionUpdates already put on the Factions
    // journal — routed first (runDiscoveryDetection) — has its encounter, and
    // a second surface doubled every new faction's first encounter (issue
    // #331 X33). A page from an earlier pass has served this purpose too.
    if (entity.type === "faction" && !entityExistsForName(entity.name, "faction", campaignState)
        && !getFactionEntry(entity.name)) {
      await recordFactionIntelligence(
        entity.name,
        { summary: entity.description ?? "", isNew: true, narrationId },
        campaignState,
      ).catch(err =>
        console.warn(`${MODULE_ID} | routeEntityDrafts: faction WJ surface failed:`, err?.message ?? err));
    }

    queued.push(entity);
  }

  // Make a Connection that made no one, with an NPC the detection leaves out:
  // one pending on a draft card (issue #325 W23) or one the table already
  // knows — a listed card, or a row the GM dismissed (issue #345 AA19). The
  // player's line says which (issue #347 AB10); naming several, none is
  // guessed and the GMs are told. Each hit that made no one gets its own
  // (a round's — issue #342 Z09).
  for (const slot of slots) {
    if (slot.done || !slot.names || removed()) continue;
    const made = await connectNamedFigure(slot, campaignState, {
      namingText: options.namingText, lineText: slot.lineText ?? options.lineText, narrationId,
    }).catch(err => {
      console.warn(`${MODULE_ID} | routeEntityDrafts: connecting the NPC the move names failed:`, err?.message ?? err);
      return null;
    });
    if (made) {
      slot.done = true;
      created.push(made);
    }
  }

  if (removed()) return { created, queued: [] };
  if (queued.length) {
    await postDraftEntityCard(queued, campaignState, {
      source: options.source, actorId: options.actorId, actorIds: options.actorIds ?? null, narrationId,
    });
  }

  return { created, queued };
}

/**
 * The connections a capture may create (routeEntityDrafts): one per Make a
 * Connection hit (scope §9). Free-flow's one hit (`autoCreateConnection`)
 * takes the first connection detected — its narration is that move's alone —
 * and a pending row its `namingText` names. A Batch Mode round's hits
 * (`connectionRollers`) each take only a figure their `owns` gives their own
 * roller (issue #342 Z09: the round's first connection, whoever met them,
 * went to the first hit's roller with that roller's seed), and a pending row
 * only when the round's `namingText` — its lines and its narration — names it
 * too, as free-flow's must (issue #345 AA09: `owns` alone gave a one-PC
 * round every row, and read a two-PC round's off the row's old description,
 * so the first pending row on the newest card — an NPC the round never
 * mentioned — was confirmed and bonded to the roller).
 *
 * @param {Object} options — routeEntityDrafts' options
 * @returns {Array<{ actorId: string|null, connectionSeed: Object|null, takes: Function, names: Function|null, lineText: string|null, done: boolean }>}
 *   — `lineText` a round's hit's own line (null: the move's, `options.lineText`)
 */
function connectionSlots(options) {
  const hay = String(options.namingText ?? "");
  const named = hay.trim() ? (draft) => wholeWordPattern(String(draft?.name ?? "").trim()).test(hay) : null;
  if (Array.isArray(options.connectionRollers)) {
    return options.connectionRollers
      .filter(r => r && typeof r.owns === "function")
      .map(r => ({
        actorId:        typeof r.actorId === "string" && r.actorId ? r.actorId : null,
        connectionSeed: r.connectionSeed ?? null,
        takes:          (entity) => r.owns(entity) === true,
        names:          named ? (draft) => named(draft) && r.owns(draft) === true : null,
        lineText:       typeof r.lineText === "string" ? r.lineText : null,
        done:           false,
      }));
  }
  if (!options.autoCreateConnection) return [];
  return [{
    actorId:        options.actorId ?? null,
    connectionSeed: options.connectionSeed ?? null,
    takes:          () => true,
    names:          named,
    lineText:       null,
    targetName:     typeof options.targetName === "string" && options.targetName.trim() ? options.targetName.trim() : null,
    done:           false,
  }];
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING — renames (placeholder figure revealed to have a proper name)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply detected entity renames: a placeholder figure ("Unknown Suited Figure")
 * revealed to have a proper name ("Vex") is renamed in place rather than
 * duplicated into a second connection card. GM-gated (writes the actor /
 * record). Bounded to placeholder connections — a "rename" whose `from` is a
 * genuinely-named entity is ignored, so two distinct characters are never
 * auto-merged on a model hiccup. Fail-open per rename; never throws.
 *
 * A rename a narration's capture made carries that narration's id on the
 * card (`renamedBy: { narrationId, from, to }`), so an X-Card on the
 * narration puts the placeholder name back (retractNarrationCapture — issue
 * #335 Y02): the name was the removed prose's.
 *
 * @param {Array<{from:string,to:string}>} renames
 * @param {Object} campaignState
 * @param {Object} [deps]                  — the narration's id, and the injection seam for tests
 * @param {string|null} [deps.narrationId] — the narration whose capture revealed the names
 * @param {boolean}  [deps.isGM]
 * @param {Function} [deps.getConn]        (id) => record
 * @param {Function} [deps.updateConn]     (id, updates) => Promise
 * @param {Function} [deps.entityExists]   (name, state) => boolean
 * @param {Function} [deps.postNotice]     (applied) => Promise
 * @returns {Promise<Array<{from:string,to:string,id:string}>>} applied renames
 */
export async function applyEntityRenames(renames, campaignState, deps = {}) {
  const isGM = deps.isGM ?? globalThis.game?.user?.isGM ?? false;
  if (!isGM) return [];
  if (!Array.isArray(renames) || !renames.length) return [];

  const getConn      = deps.getConn      ?? getConnection;
  const updateConn   = deps.updateConn   ?? updateConnection;
  const entityExists = deps.entityExists ?? entityExistsAnyType;
  const narrationId  = typeof deps.narrationId === "string" && deps.narrationId ? deps.narrationId : null;
  const applied      = [];

  for (const { from, to } of renames) {
    // Nothing for a narration the X-Card removed (XCARD-LATE-CAPTURE).
    if (isNarrationXCarded(narrationId)) break;
    const fromNorm = normalizeEntityName(from);
    const toNorm   = normalizeEntityName(to);
    if (!fromNorm || !toNorm || fromNorm === toNorm) continue;
    // Never rename onto a name that already belongs to another entity.
    if (entityExists(to, campaignState)) continue;

    // The placeholder connection this rename targets — only placeholder
    // figures collapse, never properly-named ones.
    const target = findPlaceholderConnection(from, campaignState, getConn);
    if (!target) continue;

    try {
      await updateConn(target.id, {
        name: to,
        ...(narrationId ? { renamedBy: { narrationId, from: target.rec.name, to } } : {}),
      });
      applied.push({ from: target.rec.name, to, id: target.id });
    } catch (err) {
      console.warn(`${MODULE_ID} | applyEntityRenames: ${from} → ${to} failed:`, err?.message ?? err);
      continue;
    }
    // A revealed name the GM once dismissed from a draft card is hers now:
    // dismissed, it kept her card out of the narrator's name index for good
    // (issue #345 AA55).
    await undismissRecordName(to, campaignState, { narrationId });
    // The revealing narration recorded its facts under the new name as a
    // text subject (no card was named that yet): they join the renamed card,
    // as a new entity's do (issue #326 W68 — they neither rendered on the
    // card nor migrated to it).
    const promote = deps.promoteSubjects ?? promoteNewEntityLedgerSubjects;
    await promote(to, "connection", target.rec, campaignState);
  }

  // The notice names the removed prose's names too.
  if (applied.length && !isNarrationXCarded(narrationId)) {
    const postNotice = deps.postNotice ?? postRenameNoticeCard;
    try {
      await postNotice(applied);
    } catch (err) {
      console.warn(`${MODULE_ID} | applyEntityRenames: rename notice failed:`, err?.message ?? err);
    }
  }
  return applied;
}

/**
 * The recorded connection a rename's `from` names, when that connection is
 * still a placeholder figure — `{ id, rec }` — else null (no such connection,
 * or one with a proper name). A rename lands only on one; the detection parse
 * drops the rename's `to` from the new entities only then.
 *
 * @param {string} from
 * @param {Object} campaignState
 * @param {Function} [getConn]  (id) => record
 * @returns {{ id: string, rec: Object }|null}
 */
function findPlaceholderConnection(from, campaignState, getConn = getConnection) {
  const fromNorm = normalizeEntityName(from);
  if (!fromNorm) return null;
  for (const id of campaignState?.connectionIds ?? []) {
    let rec = null;
    try { rec = getConn(id); } catch { continue; }
    if (rec?.name && normalizeEntityName(rec.name) === fromNorm) {
      return isPlaceholderName(rec.name) ? { id, rec } : null;
    }
  }
  return null;
}

/**
 * GM-visible notice that an introduced figure was identified by name, so the
 * continuity (the existing card was renamed, not duplicated) is visible rather
 * than silent — the gap the playtest flagged.
 */
async function postRenameNoticeCard(applied) {
  const lines = applied
    .map(a => `<li><strong>${escapeHtml(a.from)}</strong> is now known as <strong>${escapeHtml(a.to)}</strong></li>`)
    .join("");
  await globalThis.ChatMessage?.create?.({
    content: `<div class="sf-card sf-card--rename"><div class="sf-card-header">◈ Identity revealed</div><ul>${lines}</ul></div>`,
    flags:   { [MODULE_ID]: { entityRenameCard: true } },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// SEED ENRICHMENT — oracle backfill + silent portrait generation
// ─────────────────────────────────────────────────────────────────────────────
//
// New entities created from a detector draft (or auto-created on a
// make_a_connection hit) carry only the detector's surface description.
// The journal records would otherwise sit with empty role / goal /
// description and no portrait. To give the GM a minimal sketch to work
// with, we backfill the structured fields from the Starforged oracle
// tables and trigger a silent portrait generation. Output never goes to
// chat — the resulting detail lives only on the journal/actor record
// and in the entity panel.

/**
 * Build connection-creation fields from a draft and an oracle seed.
 * Re-uses the rolls made by buildOracleSeeds() when a fresh seed is
 * not provided (e.g. confirm-from-draft path).
 *
 * @param {Object} draft           — { name, description, pronouns?, role?, goal? } (detected)
 * @param {Object|null} seed       — { role, goal, firstLook, givenName }
 * @returns {{ name, description, role, goal, pronouns, portraitSource }}
 */
export function buildConnectionSeedData(draft, seed) {
  const s = seed ?? {};
  const name = (draft?.name && draft.name.trim()) || s.givenName || "Unknown Connection";
  const descriptorParts = [];
  if (draft?.description && draft.description.trim()) descriptorParts.push(draft.description.trim());
  if (s.firstLook) descriptorParts.push(`First look: ${s.firstLook}.`);
  const description = descriptorParts.join(" ");
  // Portrait source must contain enough visual detail to render. Combine
  // the detector description (if any) with the first-look oracle so the
  // model has something concrete to render even when the narrator's prose
  // was abstract.
  const portraitParts = [];
  if (draft?.description && draft.description.trim()) portraitParts.push(draft.description.trim());
  if (s.firstLook) portraitParts.push(s.firstLook);
  if (s.role)      portraitParts.push(`role: ${s.role}`);
  // What the narration said wins over an oracle roll (issue #286 D3): the
  // confirm path rolls AFTER the narration, and a rolled role or goal the
  // card then lists as ESTABLISHED FACTS could contradict it. The goal is
  // the record's `goal` — it went to `motivation`, so the seed found `goal`
  // blank and rolled one beside it (issue #325 W31).
  return {
    name,
    description,
    role:           draft?.role || (s.role ?? ""),
    goal:           draft?.goal || (s.goal ?? ""),
    // Pronouns the narration established (detector capture) — with these on
    // the record, seedConnectionActor keeps them instead of rolling a random
    // set against the fiction (CHAR-NPC-PRONOUN-ROLL-BLIND).
    pronouns:       normalisePronounSet(draft?.pronouns),
    portraitSource: portraitParts.join(". "),
  };
}

/** A detected role / goal: a trimmed string of at most 120 characters, else "". */
function detectedPhrase(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return v && v.length <= 120 && !/^(null|none|unknown|n\/a)$/i.test(v) ? v : "";
}

/**
 * Coerce a detected pronoun value to a canonical "a/b" or "a/b/c" set —
 * lowercased word tokens separated by slashes, e.g. "she/her", "they/them",
 * "ze/zir". Anything else (prose, null, name-based guesses the prompt
 * forbids) returns "". Exported for unit testing.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalisePronounSet(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v || v.length > 24) return "";
  return /^[a-z]+\/[a-z]+(\/[a-z]+)?$/.test(v) ? v : "";
}

/**
 * Build ship-creation fields from a draft and an oracle seed.
 *
 * @param {Object} draft  — { name, description }
 * @param {Object} seed   — { type, firstLook, name }
 * @returns {{ name, description, type, firstLook, portraitSource }}
 */
export function buildShipSeedData(draft, seed) {
  const s = seed ?? {};
  const name = (draft?.name && draft.name.trim()) || s.name || "Unknown Ship";
  const descriptorParts = [];
  if (draft?.description && draft.description.trim()) descriptorParts.push(draft.description.trim());
  if (s.firstLook) descriptorParts.push(`First look: ${s.firstLook}.`);
  if (s.type)      descriptorParts.push(`Type: ${s.type}.`);
  const description = descriptorParts.join(" ");
  const portraitParts = [];
  if (draft?.description && draft.description.trim()) portraitParts.push(draft.description.trim());
  if (s.firstLook) portraitParts.push(s.firstLook);
  if (s.type)      portraitParts.push(s.type);
  return {
    name,
    description,
    type:           s.type      ?? "",
    firstLook:      s.firstLook ?? "",
    portraitSource: portraitParts.join(". "),
  };
}

function rollFreshConnectionSeed() {
  return {
    role:      safeOracleRoll("character_role"),
    goal:      safeOracleRoll("character_goal"),
    firstLook: safeOracleRoll("character_first_look"),
    givenName: safeOracleRoll("given_name"),
  };
}

/**
 * A detected ship's identity rolls. A type whose row names a mission
 * ("Multipurpose", or Fleet → "Starship Mission") rolls the active sector's
 * region's mission table, as the ship seed does — it rolled the Terminus one
 * in every region (issue #338 D5's rule; known-issues SHIP-SEED-MISSION-REGION).
 *
 * @param {Object} campaignState
 */
function rollFreshShipSeed(campaignState) {
  return {
    type:      safeOracleRoll("starship_type", { region: resolveActiveRegion(campaignState) }),
    firstLook: safeOracleRoll("starship_first_look"),
    name:      safeOracleRoll("starship_name"),
  };
}

function safeOracleRoll(tableId, options = {}) {
  try {
    const r = rollOracle(tableId, options);
    return r?.result && r.result !== "—" ? r.result : "";
  } catch {
    return "";
  }
}

/**
 * After a connection or ship is created with `portraitSourceDescription`
 * already on the record, silently trigger portrait generation. Gated on
 * the OpenRouter key being configured — when absent, this is a no-op (no
 * notification, no chat surface).
 *
 * The portraitSourceDescription itself is written by the caller as part
 * of the create-call data so the journal/actor entry persists atomically
 * — earlier versions did the portraitSource write here in a follow-up
 * step, which raced with tests (and other readers) that observed the
 * journal after createXxx() returned but before this function landed.
 *
 * Lives here (not in connection.js / ship.js) so the portrait-generation
 * policy is applied consistently regardless of which create path runs.
 *
 * The portrait is started, not awaited (issue #347 AB01): a Make a
 * Connection hit's capture — the auto-create, a pending row it confirms —
 * runs inside the narration call, inside the table's move lock, and waited
 * on the image request, its retry, the download, the Art Cache write and the
 * upload (which had no deadline, AB02). Until then no other move could start,
 * the move's meters, record and Burn / Improve were not applied, and the
 * roller held no bond. generatePortrait tolerates finishing late: it stores
 * nothing for an entity deleted meanwhile (an X-Card on the narration), keeps
 * a portrait linked meanwhile, and makes one image at a time per entity.
 *
 * @returns {Promise<void>} once the portrait is started (or skipped) — never its end
 */
// Exported for the inciting-incident ⚔ Swear this vow flow (Cluster B),
// which creates the vow-target connection through the exact same
// pipeline as the make_a_connection auto-create above.
export async function postCreationEnrichment(typeKey, record, campaignState) {
  if (!record || !record.portraitSourceDescription) return;
  if (!hasOpenRouterKey()) return;
  // One portrait owner per creation (issue #321 U29): with Auto-Seed NPC on,
  // the createActor seed hook seeds every new connection card — its portrait
  // included, drawn from the portrait source set here — so generating here
  // too billed OpenRouter twice for one NPC.
  if (typeKey === "connection" && seedHookOwnsPortrait(record)) return;

  const hostId = findHostDocumentId(typeKey, record._id, campaignState);
  if (!hostId) return;

  try {
    const { generatePortrait } = await import("../art/generator.js");
    generatePortrait(hostId, typeKey, record, campaignState ?? {}).catch(err =>
      console.warn(`${MODULE_ID} | postCreationEnrichment: portrait generation failed:`, err));
  } catch (err) {
    console.warn(`${MODULE_ID} | postCreationEnrichment: portrait generation failed:`, err);
  }
}

/**
 * True when the createActor seed hook (index.js, "Auto-Seed NPC / Connection
 * Details" on) will seed this new connection card — portrait included — so
 * it is that card's one portrait owner. The hook seeds any card not yet
 * marked `seeded` (connectionNeedsSeed).
 */
function seedHookOwnsPortrait(record) {
  if (record?.seeded) return false;
  try {
    return !!globalThis.game?.settings?.get(MODULE_ID, "autoSeedConnection");
  } catch (err) {
    console.debug?.(`${MODULE_ID} | postCreationEnrichment: autoSeedConnection read failed:`, err?.message ?? err);
    return false;
  }
}

/**
 * Re-key the scene ledgers' truths and state recorded under a new entity's
 * name to that entity, once its record exists (issue #286 A3). Facts the
 * narrator records before an NPC has a card land as text subjects; promoting
 * them makes them render with the card and migrate to it at scene end.
 *
 * Keyed by the HOST document id (an Actor id for a connection), the id the
 * roster, relevance matches and scene-end migration resolve. The record's own
 * `_id` resolves nowhere, so promoting with it hid the facts instead.
 *
 * Promotes the caller's copy too: the move pipeline holds one across its
 * awaits and writes its scene ledgers back at the end of the move. The write
 * is the stored campaignState, read at its turn on the write chain, with
 * only the two ledger fields changed — promoted on a deep copy of the
 * store's, never on the cached setting itself: a refused write left the
 * re-key on the GM's cache, which the world never took
 * (PROMOTE-SUBJECTS-CACHED-MUTATE). A caller's copy that IS the cached
 * setting (a draft card's Confirm hands it over) is not promoted in place —
 * the write sets the store. Fail-open; never throws.
 *
 * @param {string} name     — the name the facts were recorded under
 * @param {string} typeKey  — the entity type
 * @param {Object} record   — the new entity record (its `_id` finds the host document)
 * @param {Object} [campaignState] — the caller's working copy
 * @returns {Promise<void>}
 */
export async function promoteNewEntityLedgerSubjects(name, typeKey, record, campaignState) {
  const text = String(name ?? "").trim();
  if (!text || !record?._id) return;
  try {
    const hostId = findHostDocumentId(typeKey, record._id, campaignState)
      ?? findHostDocumentId(typeKey, record._id, globalThis.game?.settings?.get(MODULE_ID, "campaignState"));
    if (!hostId) {
      console.debug?.(`${MODULE_ID} | promote ledger subjects: no ${typeKey} host document for "${text}" yet.`);
      return;
    }
    const { promoteTextSubject, subjectKey } = await import("../factContinuity/ledgers.js");
    const ref     = { entityId: hostId, entityType: typeKey };
    const textKey = subjectKey({ kind: "text", text });
    const promote = (cs) => {
      if (!cs || typeof cs !== "object") return false;
      const hadState = !!cs.sceneState?.bySubject?.[textKey];
      return promoteTextSubject(text, ref, cs) > 0 || hadState;
    };

    const cached = () => globalThis.game?.settings?.get(MODULE_ID, "campaignState");
    if (campaignState !== cached()) promote(campaignState);
    // Read and written at its turn on the client's campaignState write chain
    // (CAMPSTATE-CHAIN-REST), on a copy of the store's two ledgers.
    await serialiseCampaignStateWrite(async () => {
      const latest = cached();
      if (!latest) return;
      const target = {
        ...latest,
        sceneTruths: foundry.utils.deepClone(latest.sceneTruths ?? []),
        sceneState:  foundry.utils.deepClone(latest.sceneState ?? { bySubject: {}, sceneId: null }),
      };
      if (promote(target)) await globalThis.game.settings.set(MODULE_ID, "campaignState", target);
    }, "promote ledger subjects");
  } catch (err) {
    console.warn(`${MODULE_ID} | promote ledger subjects for "${text}" failed:`, err?.message ?? err);
  }
}

function findHostDocumentId(typeKey, recordId, campaignState) {
  if (!recordId) return null;
  const idsField = ENTITY_ID_FIELDS[typeKey];
  const getter   = ENTITY_GETTERS[typeKey];
  if (!idsField || !getter) return null;
  const ids = campaignState?.[idsField] ?? [];
  for (const hostId of ids) {
    let rec = null;
    try { rec = getter(hostId); } catch { continue; }
    if (rec?._id === recordId) return hostId;
  }
  return null;
}

function hasOpenRouterKey() {
  try {
    return !!globalThis.game?.settings?.get(MODULE_ID, "openRouterApiKey");
  } catch {
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING — World Journal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locate a known entity record by name across all entity types.
 * Returns { journalId, type } for the first match, or null if no entity record
 * exists with this name. Used by routeWorldJournalResults to divert entity-
 * specific lore to the entity's generative tier instead of the WJ lore journal.
 *
 * @param {string} entityName
 * @param {Object} campaignState
 * @returns {{ journalId: string, type: string }|null}
 */
function findEntityForLoreRouting(entityName, campaignState) {
  const target = normalizeEntityName(entityName);
  if (!target) return null;
  for (const [type, idsField] of Object.entries(ENTITY_ID_FIELDS)) {
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    const ids = campaignState?.[idsField] ?? [];
    for (const journalId of ids) {
      let rec = null;
      try { rec = getter(journalId); } catch { continue; }
      if (rec?.name && normalizeEntityName(rec.name) === target) return { journalId, type };
    }
  }
  return null;
}

/** The less durable of two salience tiers. */
function lowerSalience(a, b) {
  return (SALIENCE_ORDER[a] ?? Infinity) <= (SALIENCE_ORDER[b] ?? Infinity) ? a : b;
}

/**
 * Route the World Journal section of the detection response to the
 * worldJournal.js write functions. Per WJ scope §4 the routing rule is:
 *   - Lore (world-level): always → recordLoreDiscovery, auto-confirmed
 *   - Lore (entity-specific, entityName set): → entity generative tier only
 *   - Threat:  always → recordThreat
 *   - Faction: only when no entity record exists → recordFactionIntelligence
 *   - Location: only when no entity record exists → recordLocation
 *   - State transitions: applyStateTransition (delegates by entryType)
 *
 * Each record is stamped with the narration it came from (`narrationId`):
 * a lore, threat, faction or place entry, a Session Log beat and a tier
 * detail alike, so an X-Card on that narration undoes them (issue #329 X01;
 * rules/narrator-memory.md 6b) — and the entry a state transition changes
 * (XCARD-CAPTURE-TRANSITIONS). Nothing is written once an X-Card has
 * removed that narration — each write checks the store first
 * (XCARD-LATE-CAPTURE): the X-Card's undo has run, so a later write would
 * stand.
 *
 * @param {Object} wj — parsed worldJournal section
 * @param {Object} campaignState
 * @param {{ narrationId?: string|null }} [options] — the narration the detection read
 * @returns {Promise<void>}
 */
export async function routeWorldJournalResults(wj, campaignState, { narrationId = null } = {}) {
  if (!wj) return;
  // Only a real id is stamped: a write without one owns the entry it touches.
  const fromNarration = typeof narrationId === "string" && narrationId ? { narrationId } : {};
  const removed = () => isNarrationXCarded(narrationId);

  // Below-threshold lore/threat items are transient scene beats: route them to
  // the running session log (D7 / F18) instead of spawning a WJ entry each.
  // Fail-open items (unrated salience) clear the gate and are recorded as
  // durable, never rerouted.
  const loreThreshold = getSalienceThreshold("lore");
  // A fact about one recorded entity is card material at the tier pass's own
  // floor, lower than the world-lore one (issue #286 D4: the lore floor ran
  // first, so a "notable" NPC fact went to the Session Log, never the card).
  const entityLoreThreshold = lowerSalience(loreThreshold, TIER_SALIENCE_FLOOR);
  for (const lore of wj.lore ?? []) {
    if (!lore?.title) continue;
    if (removed()) return;
    // Entity-specific lore (Task D): if the detector flagged this as a fact
    // about a specific known entity, migrate it to that entity's generative
    // tier instead of the WJ lore journal. Keeps per-entity detail on the
    // entity record where the narrator can use it, not as world-level canon.
    // Entity not found (no record yet) — the lore gate and WJ lore as usual.
    const entityRef = lore.entityName ? findEntityForLoreRouting(lore.entityName, campaignState) : null;
    if (entityRef && passesSalience(lore.salience, entityLoreThreshold)) {
      await appendMigratedTruthToTier(entityRef.journalId, entityRef.type, {
        sessionId:  campaignState?.currentSessionId ?? "",
        sessionNum: campaignState?.sessionNumber ?? null,
        detail:     lore.text ?? lore.title,
        source:     "wj_lore_entity_route",
        pinned:     false,
        promoted:   false,
        promotedAt: null,
        createdAt:  Date.now(),
        ...fromNarration,
      }).catch(err =>
        console.warn(`${MODULE_ID} | routeWorldJournalResults: entity-lore migration failed:`, err),
      );
      continue;
    }
    if (!passesSalience(lore.salience, loreThreshold)) {
      await appendSessionLogBeat(campaignState, { kind: "lore", title: lore.title, text: lore.text ?? "", ...fromNarration });
      continue;
    }
    // Auto-confirm (Task C): narrator-detected lore goes straight to confirmed
    // state; promotedAt is set by recordLoreDiscovery when confirmed === true.
    await recordLoreDiscovery(lore.title, {
      ...lore,
      narratorAsserted: true,
      confirmed:        true,
      ...fromNarration,
    }, campaignState);
  }

  const threatThreshold = getSalienceThreshold("threats");
  for (const threat of wj.threats ?? []) {
    if (!threat?.name) continue;
    if (removed()) return;
    if (!passesSalience(threat.salience, threatThreshold)) {
      await appendSessionLogBeat(campaignState, { kind: "threat", title: threat.name, text: threat.summary ?? "", ...fromNarration });
      continue;
    }
    await recordThreat(threat.name, { ...threat, ...fromNarration }, campaignState);
  }

  for (const faction of wj.factionUpdates ?? []) {
    if (!faction?.name) continue;
    if (removed()) return;
    if (entityExistsForName(faction.name, "faction", campaignState)) continue;
    await recordFactionIntelligence(faction.name, { ...faction, ...fromNarration }, campaignState);
  }

  for (const location of wj.locationUpdates ?? []) {
    if (!location?.name) continue;
    if (removed()) return;
    if (entityExistsForName(location.name, "location", campaignState)) continue;
    await recordLocation(location.name, { ...location, ...fromNarration }, campaignState);
  }

  // A transition changes an entry the capture did not make — stamped all the
  // same, so the X-Card undoes it (XCARD-CAPTURE-TRANSITIONS).
  for (const transition of wj.stateTransitions ?? []) {
    if (removed()) return;
    await applyStateTransition(transition, campaignState, fromNarration);
  }
}

/**
 * Apply a state transition. Delegates to worldJournal.applyStateTransition
 * for threat / faction / lore-contradicted, and adds a "lore confirmed"
 * change that promotes a soft entry to canonical. A narration's capture
 * passes its `narrationId`, stamped on the entry it changes.
 *
 * @param {Object} transition
 * @param {Object} campaignState
 * @param {{ narrationId?: string|null }} [options]
 */
export async function applyStateTransition(transition, campaignState, { narrationId = null } = {}) {
  if (!transition?.entryType) return null;
  const fromNarration = typeof narrationId === "string" && narrationId ? { narrationId } : {};

  // The narrator's "lore confirmed" never overturns a GM's ruling (issue #330 D9).
  if (transition.entryType === "lore" && transition.change === "confirmed") {
    return promoteLoreToConfirmed(transition.name, campaignState, { ...fromNarration, byNarrator: true });
  }

  return wjApplyStateTransition(transition, campaignState, fromNarration);
}


// ─────────────────────────────────────────────────────────────────────────────
// entityExistsForName
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when an entity record of the given type with the given name
 * (case-insensitive, trimmed) already exists in the campaign. Used by the
 * routing layer to suppress duplicate WJ entries when the entity record is
 * authoritative.
 */
export function entityExistsForName(name, type, callerState) {
  if (!name || !type) return false;
  // The store's lists too (issue #347 AB09): the caller's copy may predate a record made meanwhile.
  const campaignState = withStoredEntityIds(callerState);
  // A faction is one faction whatever article, case or spacing names it
  // (factionNameKey, issue #336 Y31) — besides the title-stripped match below.
  if (type === "faction" && findFactionByName(name, campaignState)) return true;
  const idsField = ENTITY_ID_FIELDS[type];
  const getter   = ENTITY_GETTERS[type];
  if (!idsField || !getter) return false;

  const target = normalizeEntityName(name);
  if (!target) return false;
  const ids    = campaignState?.[idsField] ?? [];
  for (const journalId of ids) {
    let rec = null;
    try { rec = getter(journalId); }
    catch { continue; }
    if (rec?.name && normalizeEntityName(rec.name) === target) return true;
  }
  return false;
}

/**
 * The listed record of a type a name names, by entityExistsForName's rule
 * (normalizeEntityName — a title aside; a faction by findFactionByName
 * first), a record of exactly that name first. null when none.
 *
 * @param {string} type — an entity type (connection, faction, ship, …)
 * @param {string} name
 * @param {Object} campaignState
 * @returns {Object|null}
 */
function listedRecordNamed(type, name, campaignState) {
  if (type === "faction") {
    const hit = findFactionByName(name, campaignState);
    if (hit) return hit.faction;
  }
  const idsField = ENTITY_ID_FIELDS[type];
  const getter   = ENTITY_GETTERS[type];
  const exact    = String(name ?? "").trim().toLowerCase();
  const target   = normalizeEntityName(name);
  if (!idsField || !getter || !target) return null;
  let same = null;
  for (const id of campaignState?.[idsField] ?? []) {
    let rec = null;
    try { rec = getter(id); }
    catch { continue; }
    if (!rec?.name) continue;
    if (rec.name.trim().toLowerCase() === exact) return rec;
    if (!same && normalizeEntityName(rec.name) === target) same = rec;
  }
  return same;
}

/** The listed connection record a name names (listedRecordNamed). */
function listedConnectionNamed(name, campaignState) {
  return listedRecordNamed("connection", name, campaignState);
}

/**
 * Cross-type variant of entityExistsForName — returns true if any entity of
 * any type already carries this name. Used as the primary dedup gate in
 * routeEntityDrafts so the detector's type classification cannot smuggle a
 * duplicate through (e.g. proposing Location "Oxidized Kettle" when the
 * Settlement of the same name is already established in the active sector).
 *
 * The WJ routing rules in routeWorldJournalResults still use the type-scoped
 * entityExistsForName because faction/location WJ entries are deliberately
 * scoped — a faction WJ note about "Blue Star Compact" should not be blocked
 * by an unrelated settlement-typed entity that happens to share a name.
 *
 * @param {string} name
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function entityExistsAnyType(name, callerState) {
  const target = normalizeEntityName(name);
  if (!target) return false;
  // The store's lists too (issue #347 AB09): the caller's copy may predate a
  // record made meanwhile — a draft the GM confirmed while a move resolved.
  const campaignState = withStoredEntityIds(callerState);

  // The detector's "what's known" set is built from several layers. Any
  // single layer missed creates the F14 defect class — we keep flagging
  // already-known entities as new because we only checked our own
  // bookkeeping IDs and not the canonical Foundry sources.
  //
  // 1. Player characters (foundry-ironsworn `character` Actors).
  if (isPlayerCharacterName(target)) return true;

  // 2. Active sector + all peer sectors. The Sector Creator writes sector
  //    names into campaignState.sectors[] but doesn't add them to any
  //    entityIds list — so a narration that mentioned the active sector
  //    by name (e.g. "Delphian Anvil") was being proposed as a new
  //    Location every time.
  if (sectorNameMatches(target, campaignState)) return true;

  // 3. Our own bookkeeping ID lists (connection/settlement/faction/ship/
  //    planet/location/creature). This was the only check before F14. A
  //    faction matches with or without its article too (issue #336 Y31).
  if (findFactionByName(name, campaignState)) return true;
  for (const [type, idsField] of Object.entries(ENTITY_ID_FIELDS)) {
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    const ids = campaignState?.[idsField] ?? [];
    for (const journalId of ids) {
      let rec = null;
      try { rec = getter(journalId); }
      catch { continue; }
      if (rec?.name && normalizeEntityName(rec.name) === target) return true;
    }
  }

  // 4. Live Actor surfaces. After the Entity → Actor migration, starships
  //    / settlements / planets / locations live as Foundry Actors; an
  //    Actor that exists but isn't in campaignState.{shipIds,settlementIds,…}
  //    (manually-created, vendor-seeded, or migrated out-of-band) was
  //    invisible to the dedup gate. Walk game.actors directly so the
  //    bookkeeping list isn't load-bearing for "what exists in Foundry".
  if (actorNameMatches(target)) return true;

  return false;
}

/**
 * @param {string} normalisedName
 * @param {Object} campaignState
 * @returns {boolean} true if any sector in campaignState.sectors[] has a
 *   name matching this (normalised). Covers both the active sector and
 *   peer sectors so the detector never re-proposes an already-named sector
 *   as a "new" location.
 */
function sectorNameMatches(normalisedName, campaignState) {
  if (!normalisedName) return false;
  const sectors = campaignState?.sectors ?? [];
  for (const s of sectors) {
    if (s?.name && normalizeEntityName(s.name) === normalisedName) return true;
  }
  return false;
}

/**
 * @param {string} normalisedName
 * @returns {boolean} true if any non-character Actor in game.actors
 *   (starship, location-typed settlement/planet/location subtypes) matches
 *   this name. Character actors are handled by isPlayerCharacterName.
 *
 * Catches the F14 case where a starship Actor (e.g. the PC's command
 * vehicle) was named in narration but wasn't in campaignState.shipIds,
 * so the bookkeeping-only dedup missed it.
 */
function actorNameMatches(normalisedName) {
  if (!normalisedName) return false;
  try {
    const actors = globalThis.game?.actors ?? [];
    for (const a of actors) {
      if (!a?.name) continue;
      if (a?.type === "character") continue; // covered by isPlayerCharacterName
      if (a?.type !== "starship" && a?.type !== "location") continue;
      if (normalizeEntityName(a.name) === normalisedName) return true;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | actorNameMatches: actor lookup failed:`, err?.message ?? err);
  }
  return false;
}

/**
 * @param {string} normalisedName — output of normalizeEntityName(rawName)
 * @returns {boolean} true if any character-type Actor in the world
 *   matches this name (case-insensitive, honorific-stripped).
 *
 * Includes both player-owned PCs and any GM-created character actor
 * (e.g. an Ironsworn co-op campaign with multiple PC actors not all
 * formally "owned" by a player User). The detector's existing
 * normalizeEntityName already strips honorifics and lowercases, so a
 * PC named "Doctor Chen" matches a detection of "Chen" or "Dr. Chen".
 */
function isPlayerCharacterName(normalisedName) {
  if (!normalisedName) return false;
  try {
    const actors = globalThis.game?.actors ?? [];
    for (const a of actors) {
      if (a?.type !== "character") continue;
      // NPC/connection cards are `character` actors too (FOLDER-002) — they are
      // entities, not player characters, and are deduped via the entity registry.
      if (a?.flags?.[MODULE_ID]?.entityType) continue;
      if (!a?.name) continue;
      if (normalizeEntityName(a.name) === normalisedName) return true;
    }
  } catch (err) {
    // Test environments without game.actors land here. Best-effort dedup —
    // returning false just lets the detector propose the entity, which the
    // GM can dismiss; not catastrophic.
    console.warn(`${MODULE_ID} | isPlayerCharacterName: actor lookup failed:`, err?.message ?? err);
  }
  return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// GENERATIVE TIER UPDATES — interaction-class moves with matched entities
// ─────────────────────────────────────────────────────────────────────────────

// Salience floor for generative-tier capture. The tier records an entity's
// durable developments/actions, so trivia and incidental motion are dropped
// while character-relevant beats ("may echo later") and up are kept — a more
// permissive floor than the chronicle/lore channels by design. Fail-open via
// passesSalience: an unrated update still lands (degrades to capture-all), so
// model format drift never silently empties the tier.
const TIER_SALIENCE_FLOOR = "notable";

/**
 * Run a Haiku pass to identify narrator-added details about known entities
 * present in the scene, then append them to the corresponding generativeTier
 * flag arrays. Skips entries whose `detail` already appears (case-insensitive
 * substring match) so we don't restate the same observation.
 *
 * Pinned entries are never trimmed. The display cap (5 entries in the
 * prompt) is enforced by formatEntityCard, not here.
 *
 * @param {string}   narrationText
 * @param {Array}    entityRefs   — [{ journalId, type, name, ... }] from the resolver
 * @param {string}   sessionId
 * @param {number}   sessionNum
 * @param {Object}   [options]
 * @param {Function} [options.callTierAPI]  — async (prompt) => raw JSON text
 * @param {string}   [options.narrationId]  — the narration read; stamped on each detail, for the X-Card (issue #329 X01)
 * @returns {Promise<Array>}                — list of applied { journalId, detail }
 *
 * Nothing for a narration the X-Card removed: checked before the Claude call
 * (a timer that fires after the X-Card pays for nothing) and before each
 * detail's write (XCARD-LATE-CAPTURE).
 */
export async function appendGenerativeTierUpdates(
  narrationText, entityRefs, sessionId, sessionNum, options = {},
) {
  if (!Array.isArray(entityRefs) || !entityRefs.length) return [];
  if (isNarrationXCarded(options.narrationId)) return [];

  const records = entityRefs
    .map(ref => {
      const getter = ENTITY_GETTERS[ref?.type];
      if (!getter || !ref?.journalId) return null;
      let rec = null;
      try { rec = getter(ref.journalId); } catch { return null; }
      if (!rec) return null;
      return { ...ref, record: rec };
    })
    .filter(Boolean);

  if (!records.length) return [];

  const prompt   = buildTierUpdatePrompt(narrationText, records);
  const callAPI  = options.callTierAPI ?? defaultCallTierAPI;
  let raw;
  try {
    raw = await callAPI(prompt);
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: generative tier API failed:`, err);
    return [];
  }

  const parsed = parseTierUpdateResponse(raw);
  const applied = [];

  for (const update of parsed.updates ?? []) {
    if (isNarrationXCarded(options.narrationId)) break;
    if (!update?.entityId || !update?.detail) continue;
    // Salience gate (fail-open) — keep consequential developments, drop trivia.
    if (!passesSalience(update.salience, TIER_SALIENCE_FLOOR)) continue;
    const matched = records.find(r =>
      r.journalId === update.entityId
      || r.record?._id === update.entityId
      || r.record?.name === update.entityId,
    );
    if (!matched) continue;
    const ok = await appendDetailToTier(matched, update.detail, sessionId, sessionNum, { narrationId: options.narrationId });
    if (ok) applied.push({ journalId: matched.journalId, detail: update.detail });
  }

  return applied;
}

/**
 * Append a generative-tier detail to an entity record and save it on the
 * record's host document. Returns true when the detail was saved, false when
 * it was deduplicated or could not be saved. A detail a narration's capture
 * added carries its `narrationId`, so an X-Card on that narration drops it
 * (issue #329 X01).
 */
export async function appendDetailToTier(entityRef, detail, sessionId, sessionNum, { narrationId = null } = {}) {
  const cleanDetail = detail?.trim();
  if (!cleanDetail || !entityRef?.record || !entityRef?.journalId) return false;

  const newEntry = {
    sessionId:  sessionId ?? "",
    sessionNum: sessionNum ?? null,
    detail:     cleanDetail,
    source:     "narrator_extraction",
    pinned:     false,
    promoted:   false,
    promotedAt: null,
    createdAt:  Date.now(),
    ...(typeof narrationId === "string" && narrationId ? { narrationId } : {}),
  };

  const updated = await persistGenerativeTier(entityRef, newEntry);
  if (!updated) return false;
  entityRef.record.generativeTier = updated; // keep ref consistent for return value
  return true;
}

/**
 * Same detail already in the tier — the check both tier writers use (the live
 * tier pass, persistGenerativeTier; the scene-end migration,
 * appendMigratedTruthToTier). One detail restates another when it is the
 * other's words, in order, as whole words, with nothing around them that
 * negates or reverses them: "Vex runs the lower docks" restates the sidecar's
 * "Runs the lower docks" (the duplicate this check exists for). It used to be
 * raw substring containment, so "Distrusts the crew" on the card swallowed the
 * scene's "Trusts the crew", "Is deadly with a blade" swallowed "Is dead", and
 * "locker 71" swallowed "locker 7": each new truth was counted as migrated and
 * written nowhere, and the card went on saying the opposite (issue #347 AB11).
 * A negation around the shared words — "Has not paid the debt" beside "Paid
 * the debt" — is never the same fact. Nor is a detail led by any word but the
 * entity's own name or role, a pronoun or filler (`subjectWords`,
 * LEADING_NEUTRAL_WORDS): a reversal is mostly worded ahead of the fact —
 * "Used to run the lower docks", "Feigned loyalty to the Compact" — and a
 * word list cannot hold every one, so one past it read as a repeat and the
 * new fact was written nowhere (TIER-DETAIL-NEGATION-WORDS). A duplicate kept
 * is the safer miss.
 */
function tierHasDetail(tier, detail, subjectWords = new Set()) {
  const words = detailWords(detail);
  if (!words.length) return false;
  const neutral = new Set([...LEADING_NEUTRAL_WORDS, ...subjectWords]);
  return tier.some(e => {
    const existing = detailWords(e?.detail);
    if (!existing.length) return false;
    return restatesDetail(existing, words, neutral) || restatesDetail(words, existing, neutral);
  });
}

/**
 * Words that may lead a restatement of a detail without changing it: an
 * article, a pronoun, "is", "also", "still", "now" — and the possessive's
 * "s" ("Vex's ship" → "vex s ship"). With the entity's own name and role
 * words (detailSubjectWords) — "Vex runs the lower docks" restates "Runs the
 * lower docks" — they are all a restatement may lead with.
 */
const LEADING_NEUTRAL_WORDS = new Set([
  "a", "an", "the", "s", "and", "also", "still", "now", "currently", "indeed",
  "he", "she", "they", "it", "his", "her", "their", "its", "who", "is", "are",
]);

/** The entity's name and role words, lowercased (detailWords) — what may lead a restatement of its detail. */
function detailSubjectWords(record, document) {
  return new Set([record?.name, document?.name, record?.role].flatMap(detailWords));
}

// Words that, around a detail's own words, negate or reverse it ("has NOT paid
// the debt", "NO LONGER trusts the crew", "FORMERLY the captain", "BROKE her
// oath to the crew") — `n't` arrives as "not" (detailWords). A fixed list:
// it grew from the first one AB11 shipped with (issue #347 residual
// TIER-DETAIL-NEGATION-LIST) — a reversal phrased past it can still dedupe
// when the words line up, a duplicate kept is the safer miss.
const REVERSING_WORDS = new Set([
  "not", "no", "never", "nor", "none", "nobody", "nothing", "neither", "without", "cannot",
  "longer", "anymore", "formerly", "former", "ex", "once",
  "stopped", "stops", "stopping", "ceased", "ceases", "ceasing", "quit", "quits", "quitting", "quitted",
  "lost", "loses", "losing", "broke", "broken", "breaks", "breaking",
  "betrayed", "betrays", "betraying", "betrayal", "abandoned", "abandons", "abandoning",
  "renounced", "renounces", "renouncing", "forsook", "forsaken", "forsakes", "abandon", "renounce",
  "refused", "refuses", "refusing", "denied", "denies", "denying", "failed", "fails", "failing",
  "undid", "undoes", "undone", "reversed", "reverses", "revoked", "revokes", "withdrew", "withdrawn",
  "until", "till",
]);

// Two-word reversals: "GAVE UP running the docks", "TURNED AGAINST the crew".
const REVERSING_PAIRS = [
  [["gave", "give", "gives", "giving", "given"], ["up"]],
  [["turned", "turns", "turning"], ["against", "on"]],
  [["fell", "falls", "falling", "fallen"], ["out"]],
  [["backed", "backs", "backing"], ["out"]],
];

// A prefix that reverses the word it is on — "DIStrusted", "UNhappy",
// "MISled": around a detail's words, the prefixed form of one of them
// reverses it ("Trusted the crew, then distrusted them" is no restatement of
// "Trusted the crew"). On different words, whole-word matching already
// keeps "Distrusts the crew" from restating "Trusts the crew".
const REVERSING_PREFIXES = ["dis", "un", "mis", "non"];

/** A word's rough stem: a plural, past or -ing ending off, for the same-root check. */
function rootOf(word) {
  for (const end of ["ing", "ed", "es", "s", "d"]) {
    if (word.length - end.length >= 3 && word.endsWith(end)) return word.slice(0, -end.length);
  }
  return word;
}

/** True when the words around a detail's own reverse them (REVERSING_WORDS / _PAIRS / _PREFIXES). */
function reversesAround(around, inner) {
  if (around.some(w => REVERSING_WORDS.has(w))) return true;
  for (let i = 0; i + 1 < around.length; i++) {
    if (REVERSING_PAIRS.some(([first, second]) => first.includes(around[i]) && second.includes(around[i + 1]))) return true;
  }
  const roots = new Set(inner.map(rootOf));
  return around.some(w => REVERSING_PREFIXES.some(p => w.length > p.length + 2 && w.startsWith(p)
    && roots.has(rootOf(w.slice(p.length)))));
}

/** A detail's words: lowercased, `n't` spelled "not", punctuation dropped. */
function detailWords(text) {
  return String(text ?? "").toLowerCase()
    .replace(/n['’]t\b/gu, " not")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when `inner`'s words appear in `outer` in order, as whole words, led
 * only by `neutral` words (tierHasDetail) and with no reversing word around
 * them.
 */
function restatesDetail(outer, inner, neutral = LEADING_NEUTRAL_WORDS) {
  if (inner.length > outer.length) return false;
  for (let i = 0; i + inner.length <= outer.length; i++) {
    if (!inner.every((w, j) => outer[i + j] === w)) continue;
    const before = outer.slice(0, i);
    if (before.some(w => !neutral.has(w))) continue;
    const around = [...before, ...outer.slice(i + inner.length)];
    if (!reversesAround(around, inner)) return true;
  }
  return false;
}

function buildTierUpdatePrompt(narrationText, records) {
  const formatted = records.map(r => {
    const rec = r.record;
    return [
      `## ${rec.name} — ${r.type}  (id: ${r.journalId})`,
      rec.description ? `Description: ${rec.description}` : "",
      rec.role        ? `Role: ${rec.role}`               : "",
      rec.notes       ? `Notes: ${rec.notes}`             : "",
      Array.isArray(rec.generativeTier) && rec.generativeTier.length
        ? `Existing details: ${rec.generativeTier.map(e => e.detail).filter(Boolean).join(" | ")}`
        : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return [
    `Given the following established entity records and a passage of narration,`,
    `capture any SIGNIFICANT new development about each entity that is NOT already`,
    `in the record below — what the character did, decided, or revealed; how their`,
    `disposition, allegiance, or relationship to the player character shifted; a`,
    `durable new trait or piece of history. Record consequential beats, not`,
    `incidental motion, passing scenery, or restatements of what is already known.`,
    ``,
    formatted,
    ``,
    `Rate each update with a "salience" — one of trivial, scene, notable,`,
    `significant, defining — for how much it matters to that entity's ongoing`,
    `story. Be conservative: most narration is "scene" or "trivial" and should be`,
    `omitted entirely.`,
    ``,
    `Return a single JSON object (no prose):`,
    `{ "updates": [ { "entityId": string, "detail": string, "salience": string } ] }`,
    ``,
    `entityId must match the id shown in the record header (e.g. "id: ABC123").`,
    `detail should be one short sentence — the new development only.`,
    ``,
    `Narration:`,
    narrationText ?? "",
  ].join("\n");
}

export function parseTierUpdateResponse(text) {
  if (!text || typeof text !== "string") return { updates: [] };
  const slice = (text.match(/\{[\s\S]*\}/) ?? [text])[0];
  try {
    const parsed = JSON.parse(slice);
    return { updates: Array.isArray(parsed?.updates) ? parsed.updates : [] };
  } catch {
    return { updates: [] };
  }
}

/**
 * Append `entry` to the entity's stored generative tier, through the registry
 * (issue #286 A2: this used to look the record up in game.journal only, so for
 * the Actor-hosted types — connections, ships, settlements, planets, locations
 * — it found no page and returned silently while the caller reported success).
 * Reads the stored tier immediately before the write, so a pin, a scene-end
 * migration or another tier pass that landed during the Haiku call is kept.
 *
 * @param {{ journalId: string, type: string }} entityRef
 * @param {Object} entry — a fully-formed generative-tier entry
 * @returns {Promise<Array|null>} the saved tier; null when deduplicated or not saved
 */
async function persistGenerativeTier(entityRef, entry) {
  try {
    const document = getEntityDocument(entityRef.type, entityRef.journalId);
    if (!document) {
      console.warn(`${MODULE_ID} | entityExtractor: no ${entityRef.type} record for ${entityRef.journalId} — generative-tier detail not saved.`);
      return null;
    }
    const existingFlags = readEntityFlag(entityRef.type, document) ?? {};
    const tier = Array.isArray(existingFlags.generativeTier) ? existingFlags.generativeTier : [];
    if (tierHasDetail(tier, entry.detail, detailSubjectWords(existingFlags, document))) return null;
    const updated = [...tier, entry];
    await writeEntityFlag(entityRef.type, document, {
      ...existingFlags,
      generativeTier: updated,
      updatedAt:      new Date().toISOString(),
    });
    return updated;
  } catch (err) {
    console.error(`${MODULE_ID} | entityExtractor: persistGenerativeTier failed:`, err);
    return null;
  }
}

/**
 * Append a fact-continuity scene-end migration entry to an entity's
 * generative tier. See issue #227 (Fact Continuity) §9.2 step 1.
 *
 * Dedupes against existing entries with the same containment check as
 * `appendDetailToTier` (narrator-context audit 2026-07: a fact captured live
 * during the scene by the tier-update pass and migrated again at scene end
 * used to land twice, spending tier tokens on the duplicate in every later
 * prompt). A dedupe hit returns true — the fact IS in the tier, so the
 * caller may mark the truth migrated.
 *
 * Returns false when the entity's host document cannot be resolved.
 *
 * @param {string} journalId
 * @param {string} type — "connection" | "ship" | "settlement" | …
 * @param {Object} entry — fully-formed generative-tier entry
 * @returns {Promise<boolean>}
 */
export async function appendMigratedTruthToTier(journalId, type, entry) {
  if (!journalId || !type || !entry) return false;
  try {
    // Registry-dispatch — PR #100 moved ship/planet/location/settlement onto
    // native Actor documents while connection/faction/creature stayed
    // journal-backed. The "journalId" argument name is preserved for
    // back-compat (Phase C callers built around the old shape) but the value
    // is the host document id of either flavour. See src/entities/registry.js.
    const document = getEntityDocument(type, journalId);
    if (!document) return false;

    const existingFlags = readEntityFlag(type, document) ?? {};
    const tier          = Array.isArray(existingFlags.generativeTier)
      ? existingFlags.generativeTier
      : [];

    if (tierHasDetail(tier, entry.detail, detailSubjectWords(existingFlags, document))) return true;

    const updated = {
      ...existingFlags,
      generativeTier: [...tier, entry],
      updatedAt:      new Date().toISOString(),
    };
    await writeEntityFlag(type, document, updated);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | entityExtractor: appendMigratedTruthToTier failed:`, err);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CARD
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_GLYPHS = {
  connection: "⬡",
  ship:       "◈",
  settlement: "⬟",
  faction:    "⬢",
  planet:     "◉",
  location:   "◧",
  creature:   "⬣",
};

const TYPE_LABELS = {
  connection: "Connection",
  ship:       "Ship",
  settlement: "Settlement",
  faction:    "Faction",
  planet:     "Planet",
  location:   "Location",
  creature:   "Creature",
};

async function postDraftEntityCard(entities, _campaignState, options = {}) {
  if (!globalThis.ChatMessage?.create) return null;
  if (!entities?.length) return null;

  // Stable index lets click handlers identify the right draft after re-render.
  // We never reorder the array so the index in the flag matches the index in
  // the rendered DOM.
  const drafts = entities.map((e, idx) => ({ ...e, index: idx, status: "pending" }));

  // A Batch Mode round's narration is several PCs' (issue #342 D3): the card
  // carries every acting PC (`actorIds`), and a connection row's Confirm asks
  // which of them the NPC is a connection of, or none — the detection cannot
  // tell which of them met whom.
  const listed = [...new Set((Array.isArray(options.actorIds) ? options.actorIds : [])
    .filter(id => typeof id === "string" && id))];
  const actorIds = listed.length > 1 ? listed : [];

  const html = renderDraftCardHtml(drafts, actorIds.length ? draftCardHolders(actorIds) : null);

  const whisper = collectGmIds();

  // `source` is purely a telemetry flag — "paced_narrative" when the drafts
  // came from runPacedDetection, otherwise defaults to "move_resolution"
  // (the legacy / Path 2 path). Lets operators audit how often paced
  // detection is firing and what the GM does with those drafts without
  // adding an explicit UI.
  const source = options.source === "paced_narrative" ? "paced_narrative" : "move_resolution";
  // The PC the narration was for: a confirmed connection's bond Item goes to
  // them (confirmDraft), not the first PC (issue #321 U23).
  const actorId = actorIds.length ? null
    : (typeof options.actorId === "string" && options.actorId ? options.actorId : (listed[0] ?? null));
  // The narration whose capture queued these rows: an X-Card on it withdraws
  // the ones still pending (withdrawNarrationDrafts — issue #338 D6(i)).
  const narrationId = typeof options.narrationId === "string" && options.narrationId ? options.narrationId : null;

  try {
    return await ChatMessage.create({
      content: html,
      whisper,
      flags: {
        [MODULE_ID]: {
          draftEntityCard: true,
          drafts,
          source,
          ...(actorIds.length ? { actorIds } : (actorId ? { actorId } : {})),
          ...(narrationId ? { narrationId } : {}),
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: postDraftEntityCard failed:`, err);
    return null;
  }
}

/**
 * The acting PCs a round's draft card offers a connection row to (issue #342
 * D3): each of `actorIds` that is still a PC, with its current name.
 *
 * @param {string[]} actorIds
 * @returns {Array<{ actorId: string, name: string }>}
 */
function draftCardHolders(actorIds) {
  return (Array.isArray(actorIds) ? actorIds : [])
    .map(id => globalThis.game?.actors?.get?.(id) ?? null)
    .filter(isPlayerCharacterActor)
    .map(actor => ({ actorId: actor.id, name: String(actor.name ?? "").trim() || "Unnamed character" }));
}

/**
 * Render the HTML body of the draft entity card from a `drafts` array.
 * Pure / re-runnable so the renderChatMessage hook can rebuild after each
 * Confirm/Dismiss click. `holders` — on a round's card, its acting PCs
 * (draftCardHolders): a pending connection row asks whose connection it is,
 * a button per PC and "No one", in place of its Confirm (issue #342 D3);
 * null on any other card.
 */
function renderDraftCardHtml(drafts, holders = null) {
  const items = drafts.map((e) => {
    const glyph = TYPE_GLYPHS[e.type] ?? "◇";
    const label = TYPE_LABELS[e.type] ?? e.type;
    const desc  = e.description ? ` — ${escapeHtml(e.description)}` : "";
    const status = e.status ?? "pending";

    let actions;
    if (status === "confirmed") {
      actions = `<span class="sf-draft-status sf-draft-status-confirmed">✓ Confirmed</span>`;
    } else if (status === "dismissed") {
      actions = `<span class="sf-draft-status sf-draft-status-dismissed">✕ Dismissed</span>`;
    } else if (status === DRAFT_XCARDED) {
      actions = `<span class="sf-draft-status sf-draft-status-xcarded">Withdrawn — X-Card</span>`;
    } else if (e.type === "connection" && Array.isArray(holders)) {
      actions =
        `<span class="sf-draft-holder-ask">Confirm — whose connection?</span>` +
        holders.map(h =>
          `<button class="sf-draft-btn sf-draft-confirm" data-action="sf-draft-confirm" ` +
          `data-index="${e.index}" data-actor-id="${escapeHtml(h.actorId)}">${escapeHtml(h.name)}</button>`).join("") +
        `<button class="sf-draft-btn sf-draft-confirm" data-action="sf-draft-confirm" ` +
        `data-index="${e.index}" data-actor-id="">No one</button>` +
        `<button class="sf-draft-btn sf-draft-dismiss" ` +
        `data-action="sf-draft-dismiss" data-index="${e.index}">Dismiss</button>`;
    } else {
      actions =
        `<button class="sf-draft-btn sf-draft-confirm" ` +
        `data-action="sf-draft-confirm" data-index="${e.index}">Confirm</button>` +
        `<button class="sf-draft-btn sf-draft-dismiss" ` +
        `data-action="sf-draft-dismiss" data-index="${e.index}">Dismiss</button>`;
    }

    const rowClass = `sf-draft-row sf-draft-row-${String(status).toLowerCase()}`;
    return (
      `<li class="${rowClass}">` +
      `<div class="sf-draft-row-info">` +
      `[${glyph} ${escapeHtml(label)}] <strong>${escapeHtml(e.name)}</strong>${desc}` +
      `</div>` +
      `<div class="sf-draft-row-actions">${actions}</div>` +
      `</li>`
    );
  }).join("");

  const allResolved = drafts.every(d => d.status && d.status !== "pending");
  const hint = allResolved
    ? `<div class="sf-draft-entity-hint sf-draft-entity-hint-done">All entities reviewed.</div>`
    : `<div class="sf-draft-entity-hint">Confirm to add to the Entities panel; Dismiss to suppress this name.</div>`;

  return (
    `<div class="sf-draft-entity-card">` +
    `<div class="sf-draft-entity-label">◈ New Entities Detected</div>` +
    `<ul class="sf-draft-entity-list">${items}</ul>` +
    hint +
    `</div>`
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CARD — Confirm / Dismiss handlers
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_CREATORS = {
  connection: createConnection,
  ship:       createShip,
  settlement: createSettlement,
  faction:    createFaction,
  planet:     createPlanet,
  location:   createLocation,
  creature:   createCreature,
};

/**
 * Wire Confirm/Dismiss button clicks on draft entity chat cards. Idempotent:
 * registers a single chat-render hook that re-attaches listeners every
 * render. Call once at module ready.
 *
 * A press is relayed to the canonical GM (`draft.confirm` / `draft.dismiss`,
 * relayCardAction — the suffer card's shape), where the relay queue runs one
 * at a time: two GMs pressing Confirm on one row at the same moment each ran
 * it on their own client, past the per-client in-flight guard, and both
 * created the NPC (DRAFT-CONFIRM-TWO-GMS). The second press now runs after the
 * first, finds the row confirmed, and does nothing.
 */
export function registerDraftCardHooks() {
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.draftEntityCard) return;

    // Non-GMs see the card (they're whispered in) but cannot mutate state.
    // Hide buttons rather than wire dead handlers.
    if (!globalThis.game?.user?.isGM) {
      root.querySelectorAll(".sf-draft-btn").forEach(btn => { btn.style.display = "none"; });
      return;
    }

    const wire = (action, kind) => root.querySelectorAll(`[data-action="${action}"]`).forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        const idx = Number(btn.dataset.index);
        const { relayCardAction } = await import("../moves/cardActions.js");
        await relayCardAction({
          kind,
          // A round's connection row: whose connection the GM picked ("" — no one).
          payload:    { messageId: message?.id ?? null, draftIndex: idx, pick: btn.dataset.actorId },
          isResolved: () => draftRowSettled(message?.id, idx),
          restore:    () => { btn.disabled = false; },
        });
      });
    });
    wire("sf-draft-confirm", "draft.confirm");
    wire("sf-draft-dismiss", "draft.dismiss");
  });
}

/** True when the live card's row is no longer pending (confirmed or dismissed). */
function draftRowSettled(messageId, draftIndex) {
  const message = globalThis.game?.messages?.get?.(messageId);
  const drafts = message?.flags?.[MODULE_ID]?.drafts;
  const row = Array.isArray(drafts) ? drafts.find(d => d?.index === draftIndex) : null;
  return !!row && !!row.status && row.status !== "pending";
}

/**
 * The relayed press's card and row (applyDraftConfirmFromRelay /
 * applyDraftDismissFromRelay): a GM's press on a draft card's row, or null —
 * refused, with the presser told, for anyone else (the buttons are a GM's).
 *
 * @param {{ messageId?: string, draftIndex?: number|string }} payload
 * @param {Object} ctx — the relay context
 * @returns {{ message: ChatMessage, draftIndex: number }|null}
 */
async function relayedDraftPress(payload, ctx) {
  if (!ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | draft card: user ${ctx?.requesterId ?? "?"} is not a GM — press refused.`);
    const { refusePress } = await import("../multiplayer/gmRelay.js");
    refusePress(ctx, "not-owner");
    return null;
  }
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const draftIndex = Number(payload?.draftIndex);
  if (!message?.flags?.[MODULE_ID]?.draftEntityCard || !Number.isInteger(draftIndex)) {
    console.warn(`${MODULE_ID} | draft card: card ${messageId ?? "?"} row ${payload?.draftIndex ?? "?"} not found — press ignored.`);
    return null;
  }
  return { message, draftIndex };
}

/**
 * gmRelay handler for "draft.confirm" — runs on the canonical GM, one press
 * at a time (DRAFT-CONFIRM-TWO-GMS): confirmDraft creates the row's entity
 * unless the row is no longer pending.
 *
 * @param {{ messageId?: string, draftIndex?: number, pick?: string }} payload
 * @param {Object} ctx — the relay context
 * @returns {Promise<{ applied: boolean }>}
 */
export async function applyDraftConfirmFromRelay(payload = {}, ctx = {}) {
  const press = await relayedDraftPress(payload, ctx);
  if (!press) return { applied: false };
  await handleDraftConfirm(press.message, press.draftIndex, typeof payload.pick === "string" ? payload.pick : undefined);
  return { applied: true };
}

/**
 * gmRelay handler for "draft.dismiss" — runs on the canonical GM, behind any
 * Confirm of the same row (DRAFT-CONFIRM-TWO-GMS).
 *
 * @param {{ messageId?: string, draftIndex?: number }} payload
 * @param {Object} ctx — the relay context
 * @returns {Promise<{ applied: boolean }>}
 */
export async function applyDraftDismissFromRelay(payload = {}, ctx = {}) {
  const press = await relayedDraftPress(payload, ctx);
  if (!press) return { applied: false };
  await handleDraftDismiss(press.message, press.draftIndex);
  return { applied: true };
}

// "<messageId>:<draftIndex>" drafts this client is confirming. The card says
// "confirmed" only once the entity exists, so a second click meanwhile — a
// double-click, a re-rendered card — created the entity twice (issue #302).
const _draftsInFlight = new Set();

/**
 * A Confirm press. On a round's card (`flags.actorIds`, issue #342 D3) a
 * connection row's press names whose connection the NPC is — `pick` is one
 * of the card's acting PCs, or "" for no one — checked against the card's
 * own choices, as the connection pickers check theirs; a press that names
 * none of them creates nothing.
 *
 * @param {ChatMessage} message
 * @param {number} draftIndex
 * @param {string} [pick] — the pressed button's `data-actor-id`
 * @returns {Promise<void>}
 */
async function handleDraftConfirm(message, draftIndex, pick) {
  const key = `${message?.id}:${draftIndex}`;
  if (_draftsInFlight.has(key)) return;
  _draftsInFlight.add(key);
  try {
    const opts = draftConfirmPick(message, draftIndex, pick);
    if (!opts) {
      console.warn(`${MODULE_ID} | draft confirm: "${pick ?? ""}" is not a character this card offers — nothing created.`);
      globalThis.ui?.notifications?.warn?.("Pick whose connection this is — one of the characters on the card, or No one.");
      return;
    }
    await confirmDraft(message, draftIndex, opts);
  } finally {
    _draftsInFlight.delete(key);
  }
}

/**
 * The bond a Confirm press asks for (handleDraftConfirm): `{}` — the card's
 * own PC (`flags.actorId`), as every card but a round's; on a round's card
 * (`flags.actorIds`) a connection row's pick — `{ actorId }` for one of its
 * acting PCs, `{ noBond: true }` for no one, or null when the press names
 * neither (a stale button, a PC no longer on the card).
 *
 * @param {ChatMessage} message
 * @param {number} draftIndex
 * @param {string|undefined} pick
 * @returns {{ actorId?: string, noBond?: true }|null}
 */
function draftConfirmPick(message, draftIndex, pick) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  const offered = Array.isArray(f.actorIds) ? f.actorIds : null;
  const draft = (Array.isArray(f.drafts) ? f.drafts : []).find(d => d?.index === draftIndex);
  if (!offered || draft?.type !== "connection") return {};
  if (pick === "") return { noBond: true };
  return (typeof pick === "string" && offered.includes(pick) && draftCardHolders([pick]).length) ? { actorId: pick } : null;
}

/**
 * Whose sheet a confirmed connection row's bond Item goes on
 * (registerConnectionOnActiveCharacter's target): `opts.actorId` — a Make a
 * Connection's roller (confirmNamedPendingConnection, issue #325 W23) or the
 * PC a GM picked on a round's card; nobody's for `opts.noBond` (issue #342
 * D3); else the card's own PC (`flags.actorId`, issue #321 U23).
 *
 * @param {ChatMessage} message
 * @param {{ actorId?: string|null, noBond?: boolean }} opts
 * @returns {{ actorId: string|null }|{ actors: [] }}
 */
function draftBondHolder(message, opts) {
  if (typeof opts?.actorId === "string" && opts.actorId) return { actorId: opts.actorId };
  if (opts?.noBond === true) return { actors: [] };
  return { actorId: message?.flags?.[MODULE_ID]?.actorId ?? null };
}

/**
 * Create a draft row's entity and mark the row confirmed. A connection's bond
 * Item goes to the PC of the card's narration (`flags.actorId`), or to
 * `opts.actorId` — the roller of a Make a Connection that named the pending
 * NPC (issue #325 W23), or the PC a GM picked on a round's card — or to no
 * one (`opts.noBond`, issue #342 D3; draftBondHolder). Returns the created
 * record (null when nothing was created).
 *
 * @param {ChatMessage} message — the draft card
 * @param {number} draftIndex
 * @param {{ actorId?: string|null, noBond?: boolean, narrationId?: string|null, dismissed?: boolean }} [opts] —
 *   `narrationId`: the Make a Connection narration confirming the row,
 *   stamped on the connection with the row (`createdFromNarrationId`,
 *   `createdFromDraft`); `dismissed`: a row the GM dismissed is confirmed too
 *   (that Make a Connection named it — connectKnownNpc)
 * @returns {Promise<Object|null>}
 */
async function confirmDraft(message, draftIndex, opts = {}) {
  const drafts = Array.isArray(message?.flags?.[MODULE_ID]?.drafts)
    ? [...message.flags[MODULE_ID].drafts]
    : [];
  const draft = drafts.find(d => d.index === draftIndex);
  // A dismissed row only for a Make a Connection that names it (connectKnownNpc — issue #345 AA19).
  if (!draft || !(draft.status === "pending" || (opts.dismissed === true && draft.status === "dismissed"))) return null;

  const creator = ENTITY_CREATORS[draft.type];
  if (!creator) {
    console.warn(`${MODULE_ID} | draft confirm: no creator for type "${draft.type}"`);
    return null;
  }

  const campaignState = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};

  // Already created — by a Confirm whose card write was lost, or another GM's:
  // mark the row, create nothing twice (issue #321 U25). A connection's bond
  // still goes on the PC this Confirm bonds (idempotent per PC and
  // connection): a refused Confirm's card, listed by the world load before
  // this press (issue #337 Y34), never reached it (known-issues
  // BOND-ITEM-AFTER-RELIST).
  if (entityExistsForName(draft.name, draft.type, campaignState)) {
    const existing = draft.type === "connection" ? listedConnectionNamed(draft.name, campaignState) : null;
    if (existing) {
      await registerConnectionOnActiveCharacter(existing, {
        ...draftBondHolder(message, opts),
      }).catch(err =>
        console.warn(`${MODULE_ID} | entityExtractor: bond item registration failed:`, err));
    }

    // The rest of what its creation does, each step a no-op once done: a
    // refused Confirm whose record the world load listed died before them
    // (issue #342 Z60).
    await completeListedEntity(draft, campaignState);
    await setDraftStatus(message, draftIndex, "confirmed");
    return null;
  }

  let record = null;
  try {
    if (draft.type === "connection") {
      // These rolls come after the narration (issue #286 D3): a rolled first
      // look is added only when the narration did not describe them, and the
      // role and goal it gave them win (buildConnectionSeedData).
      const rolled = rollFreshConnectionSeed();
      const seedData = buildConnectionSeedData(
        // `pronouns`, `role` and `goal` rode the draft card from the detection
        // pass (postDraftEntityCard spreads the whole entity into the flag).
        { name: draft.name, description: draft.description ?? "", pronouns: draft.pronouns ?? "",
          role: draft.role ?? "", goal: draft.goal ?? "" },
        draft.description?.trim() ? { ...rolled, firstLook: "" } : rolled,
      );
      record = await creator({
        name:                      seedData.name,
        description:               seedData.description,
        role:                      seedData.role,
        goal:                      seedData.goal,
        pronouns:                  seedData.pronouns,
        portraitSourceDescription: seedData.portraitSource,
        // A Make a Connection's narration made it (confirmNamedPendingConnection).
        ...(opts.narrationId ? {
          createdFromNarrationId: opts.narrationId,
          // A row the GM had dismissed goes back to dismissed (XCARD-KEEPS-UNDISMISS).
          createdFromDraft:       { messageId: message?.id ?? null, index: draftIndex, ...(draft.status === "dismissed" ? { status: "dismissed" } : {}) },
        } : {}),
      }, campaignState);
      // An X-Card on that narration meanwhile takes the stamped card back:
      // no bond for it (XCARD-LATE-CAPTURE).
      if (isNarrationXCarded(opts.narrationId)) return null;
      await registerConnectionOnActiveCharacter(record, {
        ...draftBondHolder(message, opts),
      }).catch(err =>
        console.warn(`${MODULE_ID} | entityExtractor: bond item registration failed:`, err));
    } else if (draft.type === "ship") {
      const seedData = buildShipSeedData(
        { name: draft.name, description: draft.description ?? "" },
        rollFreshShipSeed(campaignState),
      );
      record = await creator({
        name:                      seedData.name,
        description:               seedData.description,
        type:                      seedData.type,
        firstLook:                 seedData.firstLook,
        portraitSourceDescription: seedData.portraitSource,
        // A ship the narration introduced is someone else's: it never becomes
        // the players' ship by the lone-ship fallback (issue #321 U26).
        npcShip:                   true,
      }, campaignState);
    } else if (draft.type === "faction") {
      // Faction confirm (faction-lifecycle audit 2026-07): reconcile any
      // pre-record WJ intelligence onto the new record (attitude → canonical
      // stance, known goal, entityId backlink) and seed the Starforged
      // faction oracles — previously factions were created bare (name +
      // description) and frozen there (FACTION-DUAL-STORE /
      // FACTION-RECORD-WRITE-ONCE).
      record = await creator({
        name:                      draft.name,
        description:               draft.description ?? "",
        portraitSourceDescription: draft.description ?? "",
      }, campaignState);
      await reconcileConfirmedFaction(draft.name, campaignState);
    } else {
      record = await creator({
        name:                      draft.name,
        description:               draft.description ?? "",
        // Seed the portrait source from the detected description so the entity
        // can generate art immediately instead of showing "Awaiting description".
        portraitSourceDescription: draft.description ?? "",
      }, campaignState);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | draft confirm: createXxx failed:`, err);
    if (globalThis.ui?.notifications?.warn) {
      globalThis.ui.notifications.warn(`Failed to create ${draft.type} "${draft.name}". See console.`);
    }
    return null;
  }

  if (record) {
    await postCreationEnrichment(draft.type, record, campaignState);

    if (draft.type === "faction") await mirrorConfirmedFaction(draft, campaignState);

    // Promote any free-text fact-continuity ledger entries that were
    // captured against this name into entity-scoped entries pointing at
    // the new record. Without this rewrite, truths captured before the
    // entity existed stay text-bound forever and never migrate at scene
    // end. Idempotent — a no-op when no matching text subjects exist.
    // (Priority 6 of the behaviour-coverage audit; host id since #286 A3.)
    await promoteNewEntityLedgerSubjects(draft.name, draft.type, record, campaignState);
  }

  // The X-Card's finish reopened the row with the card it deleted.
  if (isNarrationXCarded(opts.narrationId)) return null;
  await setDraftStatus(message, draftIndex, "confirmed");
  return record;
}

/**
 * What a confirmed faction's creation makes of its record, each step a no-op
 * once done (FACTION-RECORD-WRITE-ONCE / FACTION-DUAL-STORE): the Starforged
 * faction oracles rolled (`seedFactionRecord` — once, by its `seeded` flag),
 * the stance the narration gave it on the World Journal taken as the record's
 * canonical one, and that entry backlinked to the record's host id (which
 * re-syncs the stance) unless it already links it. The creation runs it, and
 * a Confirm that finds the faction already listed (completeListedEntity).
 * Never throws.
 *
 * @param {string} name
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
async function reconcileConfirmedFaction(name, campaignState) {
  try {
    const hit = findFactionByName(name, campaignState);
    if (!hit) return;
    await seedFactionRecord(hit.id);
    const wjEntry = getFactionEntry(name);
    if (wjEntry?.attitude && wjEntry.attitude !== "unknown") {
      await applyAttitudeToFactionRecord(name, wjEntry.attitude, campaignState);
    }
    // A backlink only: the Confirm met the faction nowhere in the fiction, so
    // it logs no encounter (FACTION-CONFIRM-TWO-ENCOUNTERS). An entry not
    // there yet is the mirror's to start (mirrorConfirmedFaction).
    if (wjEntry && wjEntry.entityId !== hit.id) {
      await recordFactionIntelligence(name, { entityId: hit.id, encounter: false }, campaignState);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | draft confirm: faction reconcile/seed failed:`, err?.message ?? err);
  }
}

/**
 * Mirror a confirmed faction into the World Journal — Factions page so it
 * lands as established lore. The WJ faction loop (routeWorldJournalResults)
 * skips any faction that already has an entity record, so without this the
 * entity and the journal stay disconnected and the Factions page stays empty
 * (playtest finding). No attitude: the entry keeps the one the narration
 * established (a new entry starts "unknown"); the backlink is the host id, as
 * the reconcile writes it. Passing attitude "unknown" overwrote a known
 * attitude, and record._id re-pointed the backlink (issue #321 U28). The
 * description is the page's first encounter only when the mirror starts the
 * page: an entry the narration surfaced has its encounter, and the Confirm's
 * backlink and mirror each appended another (FACTION-CONFIRM-TWO-ENCOUNTERS).
 * Never throws.
 *
 * @param {Object} draft — the confirmed row (`name`, `description`)
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
async function mirrorConfirmedFaction(draft, campaignState) {
  try {
    await recordFactionIntelligence(draft.name, {
      summary:  draft.description ?? "",
      entityId: findFactionByName(draft.name, campaignState)?.id ?? null,
      ...(getFactionEntry(draft.name) ? { encounter: false } : {}),
    }, campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | draft confirm: faction World Journal mirror failed:`, err?.message ?? err);
  }
}

/**
 * Finish an entity a draft Confirm found already listed (issue #342 Z60). A
 * Confirm whose registration the world refused leaves its record unlisted,
 * and the canonical GM's world load lists it
 * (migrator.registerUnlistedEntityActors) — so the retried Confirm took the
 * "exists" path, and nothing the refused one died before ever ran: a faction
 * stayed unseeded, without the stance the narration gave it and unlinked from
 * its World Journal entry. The creation's later steps run here, each a no-op
 * once done, so a Confirm whose card write was lost (issue #321 U25) changes
 * nothing: a faction's seed and stance reconcile (reconcileConfirmedFaction)
 * and its World Journal mirror while the entry does not link the record yet;
 * the portrait, for a record with none; the ledger facts recorded under its
 * name promoted to it. (A connection's bond is the caller's.) Never throws.
 *
 * @param {Object} draft — the row (`type`, `name`, `description`)
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
async function completeListedEntity(draft, campaignState) {
  try {
    const record = listedRecordNamed(draft.type, draft.name, campaignState);
    if (!record) return;
    let mirror = false;
    if (draft.type === "faction") {
      const hit = findFactionByName(draft.name, campaignState);
      mirror = !!hit && getFactionEntry(draft.name)?.entityId !== hit.id;
      await reconcileConfirmedFaction(draft.name, campaignState);
    }
    if (!record.portraitId) await postCreationEnrichment(draft.type, record, campaignState);
    if (mirror) await mirrorConfirmedFaction(draft, campaignState);
    await promoteNewEntityLedgerSubjects(draft.name, draft.type, record, campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | draft confirm: finishing the listed ${draft.type} "${draft.name}" failed:`, err?.message ?? err);
  }
}

/**
 * A Make a Connection hit that made no one, on an NPC the move names whom the
 * detection pass leaves out, so the move card said "Connection made" and
 * nothing was made:
 *   - a connection row still pending on a draft card (issue #325 W23 — and a
 *     later Confirm gave the bond to the PC of the old narration): the row is
 *     confirmed with the bond on the roller, stamped with the move's narration
 *     and the row, so an X-Card on that narration removes the connection while
 *     unused and puts the row back to pending
 *     (connection.retractNarrationConnections;
 *     MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED);
 *   - an NPC the table already knows (issue #345 AA19 — the move covers "an
 *     existing relationship"): an active listed connection gets the roller's
 *     bond Item (idempotent per PC and connection — known-issues
 *     BOND-ITEM-AFTER-RELIST), no second card; a connection row the GM
 *     dismissed is un-dismissed and confirmed as the roller's, with a pending
 *     row's stamps. A name in both is the listed NPC, un-dismissed (a
 *     dismissed name keeps a record out of the narrator's name index).
 *
 * Which one is the player's line's to say (issue #347 AB10). The first
 * pending row named anywhere in the line or the narration was confirmed: a
 * hit with Sable whose narration had pending Dace watching from the bar
 * bonded Dace, and the pending rows were tried before the known NPC the line
 * named. Now the line decides when it names exactly one of them; a line that
 * names none leaves it to the narration when that names exactly one; else
 * the interpreter's target for the move (`slot.targetName`) picks the one it
 * names, when it names exactly one of them (KNOWN-NPC-CONNECTION-NO-TARGET:
 * no target reached the capture, so "I win him over" with two known NPCs in
 * the narration got the GMs' notice); otherwise none is guessed and the GMs
 * are told which were named.
 *
 * @param {{ actorId: string|null, names: Function }} slot — the hit
 *   (connectionSlots): whether the move names a figure as its roller's —
 *   free-flow's, its full name in the player's line or the narrator's; a
 *   round's hit, one the round names whose figure its roller met (issue #342
 *   Z09, #345 AA09)
 * @param {Object} campaignState
 * @param {{ namingText?: string, lineText?: string, narrationId?: string|null }} opts
 *   — `namingText` the line and the narration; `lineText` the player's line
 *   (a round's hit: its own entry's — ROUND-CONNECTION-LINE-JOINED)
 * @returns {Promise<{ entity: Object, record: Object }|null>}
 */
async function connectNamedFigure(slot, campaignState, { namingText = "", lineText = "", narrationId = null } = {}) {
  if (!String(namingText ?? "").trim() || typeof slot?.names !== "function") return null;
  const store = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? campaignState ?? {};
  const dismissed = new Set((store.dismissedEntities ?? []).filter(n => typeof n === "string").map(normalizeEntityName));
  const candidates = namedConnectionCandidates(slot, campaignState, dismissed);
  if (!candidates.length) return null;

  const line = String(lineText ?? "");
  const inLine = line.trim() ? candidates.filter(c => wholeWordPattern(c.name).test(line)) : [];
  const target = String(slot.targetName ?? "").trim();
  const byTarget = target
    ? (inLine.length ? inLine : candidates).filter(c => wholeWordPattern(c.name).test(target) || wholeWordPattern(target).test(c.name))
    : [];
  const pick = inLine.length === 1 ? inLine[0]
    : inLine.length === 0 && candidates.length === 1 ? candidates[0]
    : byTarget.length === 1 ? byTarget[0]
    : null;
  if (!pick) {
    const named = inLine.length ? inLine : candidates;
    console.warn(`${MODULE_ID} | make a connection: the move names several NPCs (${named.map(c => c.name).join(", ")}) — none was made the roller's connection.`);
    await postNamedNpcsNotice(named, slot.actorId);
    return null;
  }

  if (pick.kind === "pending") {
    const record = await confirmDraft(pick.message, pick.draft.index, { actorId: slot.actorId, narrationId });
    return record ? { entity: pick.draft, record } : null;
  }
  if (dismissed.has(pick.key)) {
    await undismissEntityName(pick.key, "make a connection undismiss", { narrationId }).catch(err =>
      console.warn(`${MODULE_ID} | make a connection: un-dismissing the name failed:`, err?.message ?? err));
  }
  if (pick.kind === "listed") {
    await registerConnectionOnActiveCharacter(pick.record, { actorId: slot.actorId });
    return { entity: { type: "connection", name: pick.record.name }, record: pick.record };
  }
  const record = await confirmDraft(pick.message, pick.draft.index, { actorId: slot.actorId, narrationId, dismissed: true });
  return record ? { entity: pick.draft, record } : null;
}

/**
 * The NPCs a Make a Connection hit names that connectNamedFigure may connect,
 * one per name: pending connection rows (the newest card first), then active
 * listed connections — the store's list too (issue #347 AB09) — then the
 * newest dismissed connection row of a name still dismissed.
 *
 * @returns {Array<{ kind: "pending"|"listed"|"dismissed", key: string, name: string, record?: Object, message?: Object, draft?: Object }>}
 */
function namedConnectionCandidates(slot, campaignState, dismissed) {
  const out = [];
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate.key || seen.has(candidate.key)) return;
    seen.add(candidate.key);
    out.push(candidate);
  };
  const named = (figure) => !!String(figure?.name ?? "").trim() && slot.names(figure) === true;
  const cards = [...(globalThis.game?.messages?.contents ?? [])].reverse()   // the newest card first
    .filter(m => m?.flags?.[MODULE_ID]?.draftEntityCard);
  const rows = (status) => cards.flatMap(message => (Array.isArray(message.flags[MODULE_ID].drafts) ? message.flags[MODULE_ID].drafts : [])
    .filter(draft => draft?.type === "connection" && status(draft.status))
    .map(draft => ({ message, draft })));

  for (const { message, draft } of rows(status => !status || status === "pending")) {
    if (named(draft)) add({ kind: "pending", key: normalizeEntityName(draft.name), name: draft.name.trim(), message, draft });
  }
  for (const id of withStoredEntityIds(campaignState)?.connectionIds ?? []) {
    let rec = null;
    try { rec = getConnection(id); } catch { continue; }
    if (rec?._id && rec.active !== false && named(rec)) add({ kind: "listed", key: normalizeEntityName(rec.name), name: rec.name, record: rec });
  }
  for (const { message, draft } of rows(status => status === "dismissed")) {
    const key = normalizeEntityName(draft.name);
    if (dismissed.has(key) && named(draft)) add({ kind: "dismissed", key, name: draft.name.trim(), message, draft });
  }
  return out;
}

/** Narrations' un-dismissals kept on campaignState for the X-Card, newest last (as `xCardedNarrationIds` keeps). */
const UNDISMISS_LOG_CAP = 50;

/**
 * Take a name off the dismissed list (by normalizeEntityName), on the GM's
 * campaignState write chain. A narration's un-dismissal — a Make a
 * Connection that named the dismissed NPC, an identity reveal onto a
 * dismissed name — is logged with its narration id
 * (`undismissedByNarration`), so an X-Card on that narration dismisses the
 * name again (restoreNarrationDismissals, XCARD-KEEPS-UNDISMISS); one the
 * X-Card has already removed un-dismisses nothing.
 *
 * @param {string} key — the normalised name
 * @param {string} [label]
 * @param {{ narrationId?: string|null }} [opts]
 */
async function undismissEntityName(key, label = "make a connection undismiss", { narrationId = null } = {}) {
  await serialiseCampaignStateWrite(() => {
    const latest = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
    const byNarration = typeof narrationId === "string" && narrationId ? narrationId : null;
    if (byNarration && (latest.xCardedNarrationIds ?? []).includes(byNarration)) return undefined;
    const list = Array.isArray(latest.dismissedEntities) ? latest.dismissedEntities : [];
    const kept = list.filter(n => normalizeEntityName(n) !== key);
    if (kept.length === list.length) return undefined;
    const cs = { ...latest, dismissedEntities: kept };
    if (byNarration) {
      const name = list.find(n => normalizeEntityName(n) === key);
      const log = Array.isArray(latest.undismissedByNarration) ? latest.undismissedByNarration : [];
      cs.undismissedByNarration = [...log, { name, narrationId: byNarration }].slice(-UNDISMISS_LOG_CAP);
    }
    return globalThis.game.settings.set(MODULE_ID, "campaignState", cs);
  }, label);
}

/**
 * Dismiss again the names X-carded narrations took off the Dismissed list
 * (XCARD-KEEPS-UNDISMISS): a Make a Connection hit on a dismissed NPC, or an
 * identity reveal onto a dismissed name. The X-Card's finish already put the
 * row back and the placeholder's name back (retractNarrationConnections,
 * revertNarrationRenames), but the name stayed off the list. A name a record
 * still holds — the connection the table had used, a GM's rename onto it —
 * stays off: dismissed, it would hide that record from the narrator (issue
 * #345 AA55). Canonical GM (the X-Card's finish), on the write chain, after
 * the connections are settled. Never throws.
 *
 * @param {string[]} narrationIds
 * @returns {Promise<string[]>} the names dismissed again
 */
export async function restoreNarrationDismissals(narrationIds) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === "string" && id));
  if (!removed.size) return [];
  // Nothing logged for them: no write, and no wait on the write chain.
  const logged = (cs) => (Array.isArray(cs?.undismissedByNarration) ? cs.undismissedByNarration : [])
    .some(e => removed.has(e?.narrationId));
  if (!logged(globalThis.game?.settings?.get(MODULE_ID, "campaignState"))) return [];
  let restored = [];
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
      const log = Array.isArray(latest.undismissedByNarration) ? latest.undismissedByNarration : [];
      const theirs = log.filter(e => removed.has(e?.narrationId));
      if (!theirs.length) return undefined;
      const list = Array.isArray(latest.dismissedEntities) ? latest.dismissedEntities : [];
      const held = new Set(list.map(normalizeEntityName));
      restored = [];
      for (const { name } of theirs) {
        const key = normalizeEntityName(name);
        if (!key || held.has(key) || entityExistsAnyType(name, latest)) continue;
        held.add(key);
        restored.push(name);
      }
      return globalThis.game.settings.set(MODULE_ID, "campaignState", {
        ...latest,
        dismissedEntities:      [...list, ...restored],
        undismissedByNarration: log.filter(e => !removed.has(e?.narrationId)),
      });
    }, "X-Card: dismissals restored");
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: dismissing again the names the removed narration un-dismissed failed:`, err?.message ?? err);
    return [];
  }
  return restored;
}

/**
 * A name a record has just taken comes off the Dismissed list (issue #345
 * AA55). A draft card's Dismiss vetoes the detector's suggestion of a name,
 * but the name index leaves out every record whose name is dismissed
 * (relevanceResolver indexNames), so a placeholder renamed onto a name the GM
 * once dismissed — an identity reveal, or the GM's own sidebar rename —
 * vanished from the narrator: no card when she was named, her facts filed as
 * text. A name a record holds is the table's again, as a Make a Connection's
 * (AA19). Also off `campaignState` — the caller's copy — once the store took
 * it. GM only; never throws (a refused write is logged).
 *
 * @param {string} name — the record's new name
 * @param {Object} [campaignState] — the caller's copy
 * @param {{ narrationId?: string|null }} [opts] — the narration that gave the
 *   record the name (an identity reveal): logged, for its X-Card
 * @returns {Promise<boolean>} whether the name was dismissed
 */
export async function undismissRecordName(name, campaignState = null, { narrationId = null } = {}) {
  const key = normalizeEntityName(name);
  if (!key || !globalThis.game?.user?.isGM) return false;
  const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
  const held = (list) => Array.isArray(list) && list.some(n => typeof n === "string" && normalizeEntityName(n) === key);
  if (!held(stored.dismissedEntities) && !held(campaignState?.dismissedEntities)) return false;
  try {
    await undismissEntityName(key, "record name undismiss", { narrationId });
  } catch (err) {
    console.warn(`${MODULE_ID} | un-dismissing "${name}" (a record now holds it) failed:`, err?.message ?? err);
    return false;
  }
  if (held(campaignState?.dismissedEntities)) {
    campaignState.dismissedEntities = campaignState.dismissedEntities.filter(n => normalizeEntityName(n) !== key);
  }
  console.log(`${MODULE_ID} | "${name}" is a record's name now — taken off the Dismissed list.`);
  return true;
}

/**
 * GM whisper: a Make a Connection hit named several NPCs it could connect —
 * the table's known ones (issue #345 AA19), rows pending on a draft card
 * (issue #347 AB10) — and the player's line did not single one out, so none
 * was made the roller's.
 *
 * @param {Array<{ kind: string, name: string }>} named — connectNamedFigure's candidates
 * @param {string|null} actorId — the roller
 */
async function postNamedNpcsNotice(named, actorId) {
  const who = escapeHtml((actorId ? globalThis.game?.actors?.get?.(actorId)?.name : null) ?? "the character");
  const list = named.map(c => `<strong>${escapeHtml(c.name)}</strong>`).join(", ");
  const pending = named.some(c => c.kind === "pending");
  const text = pending
    ? `The move names more than one NPC it could make ${who}'s connection (${list}), and ${who}'s line does not say which, so none was made. Confirm the right one on its New Entities card, or add them on ${who}'s sheet.`
    : `The narration names more than one NPC the table already knows (${list}), so none was made ${who}'s connection. Add the right one on ${who}'s sheet.`;
  await globalThis.ChatMessage?.create?.({
    content: `<div class="sf-ptp-card"><strong>Make a Connection — no connection made</strong><p>${text}</p></div>`,
    whisper: collectGmIds(),
    flags:   { [MODULE_ID]: { knownNpcsConnectionNotice: true } },
  }).catch(err => console.warn(`${MODULE_ID} | make a connection: the notice failed:`, err?.message ?? err));
}

async function handleDraftDismiss(message, draftIndex) {
  const drafts = Array.isArray(message?.flags?.[MODULE_ID]?.drafts)
    ? [...message.flags[MODULE_ID].drafts]
    : [];
  const draft = drafts.find(d => d.index === draftIndex);
  if (!draft || draft.status !== "pending") return;

  // A copy of the latest store, at its turn on the client's campaignState
  // write chain: set on the cached object, a refused write left the GM's
  // client holding a dismissal the world never took, and read inside an
  // oracle capture's round trip it erased the answer (CACHE-MUTATED-BEFORE-WRITE).
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
      const list = Array.isArray(latest.dismissedEntities) ? [...latest.dismissedEntities] : [];
      if (draft.name && !list.includes(draft.name)) list.push(draft.name);
      return globalThis.game.settings.set(MODULE_ID, "campaignState", { ...latest, dismissedEntities: list });
    }, "draft dismiss");
  } catch (err) {
    console.error(`${MODULE_ID} | draft dismiss: settings.set failed:`, err);
    return;
  }

  await setDraftStatus(message, draftIndex, "dismissed");
}

// Card writes per draft card on this client, one at a time. Each re-reads the
// card's live rows and changes only its own: two rows confirmed back to back
// each wrote the whole array copied at its click, and the later write reverted
// the other row to "pending" — its Confirm came back and made the NPC twice
// (issue #321 U25). The creation itself stays concurrent (the per-row
// _draftsInFlight guard covers a double-click), so a slow one never holds up
// another row.
const _draftCardWrites = new Map();

async function setDraftStatus(message, draftIndex, status) {
  await changeDraftRows(message, (drafts) => {
    const at = drafts.findIndex(d => d.index === draftIndex);
    if (at < 0) return null;
    drafts[at] = { ...drafts[at], status };
    return drafts;
  });
}

/**
 * Change a draft card's rows on its live copy, one write at a time per card
 * (the queue above): `change` gets a copy of the live rows and returns the
 * rows to write, or null to write nothing. Resolves to `change`'s result.
 *
 * @param {ChatMessage} message
 * @param {(drafts: Object[]) => Object[]|null} change
 * @returns {Promise<Object[]|null>}
 */
async function changeDraftRows(message, change) {
  const id = message?.id;
  const prev = _draftCardWrites.get(id);
  let release;
  const done = new Promise(resolve => { release = resolve; });
  _draftCardWrites.set(id, done);
  try {
    if (prev) await prev;
    const live = globalThis.game?.messages?.get?.(id) ?? message;
    const drafts = Array.isArray(live?.flags?.[MODULE_ID]?.drafts) ? [...live.flags[MODULE_ID].drafts] : [];
    const next = change(drafts);
    if (next) await updateDraftCard(live, next);
    return next;
  } finally {
    release();
    if (_draftCardWrites.get(id) === done) _draftCardWrites.delete(id);
  }
}

/** A draft row the X-Card withdrew: not pending, not dismissed (withdrawNarrationDrafts). */
const DRAFT_XCARDED = "xCarded";

/**
 * Withdraw the draft rows X-carded narrations queued (issue #338 D6(i) — U07
 * full exclusion): each ◈ New Entities card stamped with one of their ids
 * (postDraftEntityCard's `narrationId`) has its still-pending rows marked
 * `xCarded` and re-rendered, so Confirm can no longer mint an NPC from the
 * removed prose and the names stop suppressing re-detection and riding the
 * detection prompt's PENDING DRAFTS (collectPendingDraftNames reads pending
 * rows only). The names are not added to `dismissedEntities`: a later,
 * genuine mention proposes them again. A row the GM already confirmed or
 * dismissed stands. Runs on the canonical GM in the X-Card's finish
 * (retractNarrationCapture). Fail-open per card.
 *
 * @param {string[]} narrationIds
 * @returns {Promise<number>} rows withdrawn
 */
export async function withdrawNarrationDrafts(narrationIds) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === "string" && id));
  if (!removed.size) return 0;
  let withdrawn = 0;
  for (const message of [...(globalThis.game?.messages?.contents ?? [])]) {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.draftEntityCard || !removed.has(f.narrationId)) continue;
    try {
      let rows = 0;
      await changeDraftRows(message, (drafts) => {
        const next = drafts.map((d) => {
          if (d?.status && d.status !== "pending") return d;
          rows += 1;
          return { ...d, status: DRAFT_XCARDED };
        });
        return rows ? next : null;
      });
      withdrawn += rows;
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: withdrawing the draft rows on card ${message?.id} failed:`, err?.message ?? err);
    }
  }
  return withdrawn;
}

/**
 * Reopen the draft row a Make a Connection confirmed, once the X-Card has
 * removed that connection (connection.retractNarrationConnections —
 * MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED): the NPC was the earlier
 * narration's, which the X-Card kept, so the row is pending again — Confirm
 * and Dismiss back on the card. A row whose own narration an X-Card removed
 * is withdrawn instead (`xCarded`, issue #338 D6(i)); a row the GM had
 * dismissed before the hit confirmed it is dismissed again (its link's
 * `status`, XCARD-KEEPS-UNDISMISS). A row no longer confirmed is left as it
 * is. Canonical GM (the X-Card's finish).
 *
 * @param {{ messageId?: string|null, index?: number, status?: "dismissed" }} link — the connection's `createdFromDraft`
 * @returns {Promise<string|null>} the row's new status, or null when nothing changed
 */
export async function reopenConfirmedDraftRow(link) {
  const message = globalThis.game?.messages?.get?.(link?.messageId);
  const f = message?.flags?.[MODULE_ID];
  if (!f?.draftEntityCard) return null;
  const removed = globalThis.game?.settings?.get(MODULE_ID, "campaignState")?.xCardedNarrationIds ?? [];
  const status = link?.status === "dismissed" ? "dismissed"
    : f.narrationId && removed.includes(f.narrationId) ? DRAFT_XCARDED : "pending";
  const rows = await changeDraftRows(message, (drafts) => {
    const at = drafts.findIndex(d => d?.index === link.index);
    if (at < 0 || drafts[at].status !== "confirmed") return null;
    drafts[at] = { ...drafts[at], status };
    return drafts;
  });
  return rows ? status : null;
}

async function updateDraftCard(message, drafts) {
  // The Confirm/Dismiss click handler chains: createEntity → settings.set →
  // updateDraftCard. The first two steps can take multiple socket round-trips
  // on Forge, and a GM (or test cleanup) can delete the draft card during
  // that window. When the message has already been deleted, message.update
  // raises "ChatMessage <id> does not exist!" and the resulting failed
  // ui.notifications.error on Foundry's side throws an uncaught TypeError
  // when no notification host is mounted. Skip silently when the message has
  // been removed from the collection.
  if (!message?.id || !globalThis.game?.messages?.get?.(message.id)) return;

  // A round's card keeps asking whose connection a row is (issue #342 D3).
  const offered = message.flags?.[MODULE_ID]?.actorIds;
  const content = renderDraftCardHtml(drafts, Array.isArray(offered) && offered.length ? draftCardHolders(offered) : null);
  try {
    // Update content first, then flags via setFlag so we don't accidentally
    // clobber sibling flags (draftEntityCard, source) by passing a partial
    // flags object to message.update.
    await message.update({ content });
    await message.setFlag(MODULE_ID, "drafts", drafts);
  } catch (err) {
    // Same race as above — the message may be deleted between the existence
    // check and the update. Swallow "does not exist" quietly and only log
    // other failure modes.
    const msg = String(err?.message ?? err);
    if (msg.includes("does not exist")) return;
    console.error(`${MODULE_ID} | updateDraftCard failed:`, err);
  }
}

function collectGmIds() {
  try {
    const users = globalThis.game?.users;
    if (!users?.filter) return [];
    return users.filter(u => u.isGM).map(u => u.id);
  } catch {
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Default API call (Haiku)
// ─────────────────────────────────────────────────────────────────────────────

// The combined detection reply carries every entity, rename, lore item,
// threat, faction, location and state transition of one narration; a busy one
// (an inciting incident) runs ~900 tokens. At 600 it was cut off mid-JSON and
// the whole detection dropped (issue #321 U15). The tier reply is one short list.
// Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5: 1500 / 600 before.
const DETECTION_MAX_TOKENS = 2000;
const TIER_MAX_TOKENS      = 800;

async function defaultCallDetectionAPI(prompt) {
  return callHaiku(prompt, "Return only the JSON object — no prose.", DETECTION_MAX_TOKENS);
}

async function defaultCallTierAPI(prompt) {
  return callHaiku(prompt, "Return only the JSON object — no prose.", TIER_MAX_TOKENS);
}

async function callHaiku(userPrompt, systemPrompt, maxTokens) {
  const apiKey = readApiKey();
  if (!apiKey) return "";

  const body = {
    model:      HAIKU_MODEL,
    max_tokens: maxTokens,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  };

  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta":    "prompt-caching-2024-07-31",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  if (data?.stop_reason === "max_tokens") {
    // Cut off at the cap: the JSON ends mid-object. The caller reports the
    // loss; this names the cause (issue #321 U15).
    console.warn(`${MODULE_ID} | entityExtractor: Haiku reply cut off at max_tokens (${maxTokens}).`);
  }
  return (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
}

function readApiKey() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "claudeApiKey") || null;
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyDetection() {
  return {
    entities: [],
    renames: [],
    worldJournal: {
      lore: [], threats: [], factionUpdates: [],
      locationUpdates: [], stateTransitions: [],
    },
  };
}

/**
 * Surface a detection-pipeline API failure to the GM (PLAYTEST-1717 B). Silent
 * loss of detected entities was the failure mode; a one-line toast tells the GM
 * the narration's entities were not captured and to check the console. GM-gated
 * (detection runs GM-side) and never throws — surfacing must not break the
 * pipeline it is reporting on.
 */
function notifyDetectionFailure() {
  try {
    if (!globalThis.game?.user?.isGM) return;
    globalThis.ui?.notifications?.warn?.(
      "Starforged Companion: entity detection failed — new entities from this narration " +
      "were not captured. See the console for details.",
    );
  } catch (err) {
    // Surfacing must never throw — a failed toast is itself a non-event.
    console.debug?.(`${MODULE_ID} | notifyDetectionFailure: notify failed:`, err?.message ?? err);
  }
}

function collectEstablishedEntityNames(campaignState) {
  if (!campaignState) return [];
  const names = new Set();
  // Player characters are established actors and must never be proposed as new
  // Connections (finding F). The downstream gate (entityExistsAnyType) also
  // checks PC names, but it exact-matches the normalized name — so a detection
  // of "Kylar" never matches the actor "Kylar Nazari" and slips through.
  // Listing the PCs here tells the detector model not to return them at all,
  // and it resolves first-name variants the exact gate cannot.
  try {
    for (const a of getPlayerActors()) {
      if (a?.name) names.add(a.name.trim());
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | collectEstablishedEntityNames: PC roster lookup failed:`, err?.message ?? err);
  }
  for (const [type, idsField] of Object.entries(ENTITY_ID_FIELDS)) {
    const getter = ENTITY_GETTERS[type];
    const ids    = campaignState[idsField] ?? [];
    for (const id of ids) {
      let rec = null;
      try { rec = getter(id); } catch { continue; }
      if (rec?.name) names.add(rec.name.trim());
    }
  }
  return [...names];
}

/**
 * Names of established CONNECTIONS whose recorded name still reads as a
 * placeholder (isPlaceholderName). Fed to the detection prompt so the model can
 * map a freshly-revealed proper name onto the existing unnamed figure and emit
 * a rename instead of a duplicate. Connections only — a ship or settlement is
 * not "named later in dialogue" the way an introduced person is.
 *
 * @param {Object} campaignState
 * @returns {string[]}
 */
function collectPlaceholderConnectionNames(campaignState) {
  if (!campaignState) return [];
  const out = [];
  for (const id of campaignState.connectionIds ?? []) {
    let rec = null;
    try { rec = getConnection(id); } catch { continue; }
    if (rec?.name && isPlaceholderName(rec.name)) out.push(rec.name.trim());
  }
  return out;
}

/**
 * Collect names that have been proposed in a still-pending "New Entities
 * Detected" draft card but not yet accepted into an entity record or
 * dismissed. Reading from chat is sufficient — the draft card carries the
 * full `drafts` array as a flag, and deleting the card (the de-facto
 * "dismiss" gesture) naturally drops the names from this list.
 *
 * Suppresses the same NPC being re-flagged on every subsequent narration
 * that mentions them.
 */
function collectPendingDraftNames() {
  try {
    const messages = globalThis.game?.messages?.contents ?? [];
    const names = new Set();
    for (const m of messages) {
      const f = m?.flags?.[MODULE_ID];
      if (!f?.draftEntityCard) continue;
      const drafts = Array.isArray(f.drafts) ? f.drafts : [];
      for (const d of drafts) {
        // Only "pending" drafts should suppress re-detection. Confirmed
        // drafts are now established entities (caught by collectEstablished-
        // EntityNames). Dismissed drafts are now in dismissedEntities.
        if (d?.status && d.status !== "pending") continue;
        if (d?.name && typeof d.name === "string") names.add(d.name.trim());
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

function describeWorldJournalState(campaignState) {
  const safe = (fn) => { try { return fn() ?? []; } catch { return []; } };

  const confirmedLore = safe(() => getConfirmedLore(campaignState))
    .map(e => e.title).filter(Boolean);
  const assertedLore = safe(() => getNarratorAssertedLore(campaignState))
    .map(e => e.title).filter(Boolean);
  const threats = safe(() => getActiveThreats(campaignState))
    .map(t => `${t.name}: ${t.severity}`).filter(Boolean);
  const factions = safe(() => getFactionLandscape(campaignState))
    .map(f => `${f.factionName}: ${f.attitude}`).filter(Boolean);

  return { confirmedLore, assertedLore, threats, factions };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Register a confirmed Connection on a character Actor as an ironsworn
 * `progress` Item with subtype "bond". This is what makes the Connection
 * appear under the character sheet's Connections tab with its own progress
 * track — mirroring what the system's built-in "+ Connection" button does.
 *
 * The bond goes to the roller / owner, never simply the first PC (issue #321
 * U23 — Ren's new connection used to land on Kira's sheet):
 *   - `actors`  — each of these PCs (the shared inciting vow's target: the
 *                 whole crew swore the vow, so each holds the connection);
 *   - `actorId` — the PC the narration was for (the roller), when it is a PC;
 *   - otherwise the acting user's own PC (resolveUserActorId: User#character
 *     → an owned PC → the first PC only for a GM or in solo play).
 * With no PC to hold it, this is a no-op. Idempotent per actor and
 * connection (createCharacterBondItem).
 *
 * @param {Object} record — the connection record (`_id`, `name`, `rank`)
 * @param {{ actorId?: string|null, actors?: Actor[]|null }} [target]
 */
// Exported for the inciting-incident ⚔ Swear this vow flow (Cluster B).
export async function registerConnectionOnActiveCharacter(record, { actorId = null, actors = null } = {}) {
  if (!record?._id) return;
  const holders = Array.isArray(actors)
    ? actors.filter(isPlayerCharacterActor)
    : [bondHolderActor(actorId)].filter(Boolean);
  for (const actor of holders) {
    await createCharacterBondItem(actor, {
      name:         record.name,
      rank:         record.rank,
      connectionId: record._id,
    });
  }
}

/** The PC a new connection's bond Item goes to: `actorId` when it is a PC, else the acting user's own. */
function bondHolderActor(actorId) {
  const named = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (isPlayerCharacterActor(named)) return named;
  let campaignState = null;
  try { campaignState = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null; }
  catch (err) { console.debug(`${MODULE_ID} | bond item: campaignState read failed:`, err?.message ?? err); }
  const ownId = resolveUserActorId(globalThis.game?.user ?? null, campaignState);
  return ownId ? (globalThis.game?.actors?.get?.(ownId) ?? null) : null;
}
