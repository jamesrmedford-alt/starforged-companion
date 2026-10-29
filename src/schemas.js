/**
 * STARFORGED COMPANION — CORE DATA SCHEMAS
 *
 * All schemas are plain JS objects used as templates and validators.
 * Stored in Foundry journal entries and flags unless noted otherwise.
 *
 * Foundry v13 notes:
 * - UI panels must use ApplicationV2 / HandlebarsApplicationMixin (not legacy Application)
 * - Journal content uses JournalEntryPage documents inside a parent JournalEntry
 * - foundry.utils.randomID() is stable and used for all _id fields
 * - ChatMessage.create(), game.settings.register(), and core hooks are unchanged
 */


// ─────────────────────────────────────────────────────────────────────────────
// ENUMERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five stats used on action rolls.
 * Source: Reference Guide p.8 / Rulebook p.136
 */
export const STATS = ["edge", "heart", "iron", "shadow", "wits"];

/**
 * Challenge ranks for progress tracks, vows, expeditions, connections, fights.
 * Progress per mark:
 *   troublesome = 12 ticks (3 boxes)
 *   dangerous   =  8 ticks (2 boxes)
 *   formidable  =  4 ticks (1 box)
 *   extreme     =  2 ticks
 *   epic        =  1 tick
 * Source: Reference Guide p.118
 */
export const RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];

/**
 * Ticks marked per rank when a move says "mark progress".
 */
export const RANK_TICKS = {
  troublesome: 12,
  dangerous:   8,
  formidable:  4,
  extreme:     2,
  epic:        1,
};

/**
 * foundry-ironsworn's ProgressModel stores challenge rank as a NUMBER
 * (ChallengeRank field: Troublesome=1 … Epic=5), so a live vow/track read
 * back from the Actor carries `system.rank` as an integer, not the string
 * keys RANK_TICKS uses. This maps the numeric form back to the string key.
 */
const RANK_KEY_BY_NUMBER = { 1: "troublesome", 2: "dangerous", 3: "formidable", 4: "extreme", 5: "epic" };

/**
 * Ticks for one "mark progress" at the given rank, accepting either a string
 * rank ("dangerous") or the numeric ChallengeRank the live ironsworn schema
 * stores (2). Defaults to formidable (4) for unknown ranks — the same default
 * the progress panel uses. Centralised so milestone / develop-relationship /
 * persistence all resolve rank ticks identically (a string-keyed lookup
 * against a numeric rank silently defaulted every vow to 4 ticks).
 *
 * @param {string|number} rank
 * @returns {number}
 */
export function rankTicks(rank) {
  const n = Number(rank);
  const key = Number.isInteger(n) && RANK_KEY_BY_NUMBER[n] ? RANK_KEY_BY_NUMBER[n] : rank;
  return RANK_TICKS[key] ?? 4;
}

/**
 * Normalise a rank — string ("dangerous") or numeric ChallengeRank (2) — to its
 * string key, defaulting to "formidable" for unknown ranks. Used wherever rank
 * logic needs the name rather than the tick count (e.g. the #241 milestone
 * mark-count scale).
 *
 * @param {string|number} rank
 * @returns {"troublesome"|"dangerous"|"formidable"|"extreme"|"epic"}
 */
export function rankName(rank) {
  const n = Number(rank);
  if (Number.isInteger(n) && RANK_KEY_BY_NUMBER[n]) return RANK_KEY_BY_NUMBER[n];
  return RANKS.includes(rank) ? rank : "formidable";
}

/**
 * All 40 named moves with category, stat options, and progress move flag.
 *
 * stat meanings:
 *   null            = no action roll (progress move, or narrative-only)
 *   string[]        = valid stats for this move (player or module chooses)
 *   "supply"        = rolls against the supply condition meter
 *   "integrity"     = rolls against the vehicle integrity meter
 *   "health"/"iron" = Endure Harm uses higher of the two
 *   "spirit"/"heart"= Endure Stress uses higher of the two
 *
 * progressMove: true = no action die; tally filled progress boxes vs challenge dice
 *
 * Source: Reference Guide pp.9–25
 */
export const MOVES = {
  // SESSION
  begin_a_session:           { category: "session",     stat: null,                                                  narratorClass: "discovery"     },
  set_a_flag:                { category: "session",     stat: null,                                                  narratorClass: "embellishment" },
  change_your_fate:          { category: "session",     stat: null,                                                  narratorClass: "embellishment" },
  take_a_break:              { category: "session",     stat: null,                                                  narratorClass: "embellishment" },
  end_a_session:             { category: "session",     stat: null,                                                  narratorClass: "embellishment" },

  // ADVENTURE
  face_danger:               { category: "adventure",   stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "hybrid"         },
  secure_an_advantage:       { category: "adventure",   stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "hybrid"         },
  gather_information:        { category: "adventure",   stat: ["wits"],                                              narratorClass: "discovery"      },
  compel:                    { category: "adventure",   stat: ["heart","iron","shadow"],                             narratorClass: "interaction"    },
  aid_your_ally:             { category: "adventure",   stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "embellishment" },   // resolves as Secure an Advantage / Gain Ground; on a hit the ally takes the benefits
  check_your_gear:           { category: "adventure",   stat: ["supply"],                                            narratorClass: "embellishment" },

  // QUEST
  swear_an_iron_vow:         { category: "quest",       stat: ["heart"],                                             narratorClass: "hybrid"         },
  reach_a_milestone:         { category: "quest",       stat: null,                                                  narratorClass: "embellishment" },
  fulfill_your_vow:          { category: "quest",       stat: null,  progressMove: true,                             narratorClass: "hybrid"         },
  forsake_your_vow:          { category: "quest",       stat: null,                                                  narratorClass: "hybrid"         },

  // CONNECTION
  make_a_connection:         { category: "connection",  stat: ["heart"],                                             narratorClass: "discovery"      },
  develop_your_relationship: { category: "connection",  stat: null,                                                  narratorClass: "interaction"    },
  test_your_relationship:    { category: "connection",  stat: ["heart"],                                             narratorClass: "interaction"    },
  forge_a_bond:              { category: "connection",  stat: null,  progressMove: true,                             narratorClass: "interaction"    },

  // EXPLORATION
  undertake_an_expedition:   { category: "exploration", stat: ["edge","shadow","wits"],                              narratorClass: "hybrid"         },
  explore_a_waypoint:        { category: "exploration", stat: ["wits"],                                              narratorClass: "discovery"      },
  finish_an_expedition:      { category: "exploration", stat: null,  progressMove: true,                             narratorClass: "hybrid"         },
  set_a_course:              { category: "exploration", stat: ["supply"],                                            narratorClass: "embellishment" },
  make_a_discovery:          { category: "exploration", stat: null,                                                  narratorClass: "discovery"      },
  confront_chaos:            { category: "exploration", stat: null,                                                  narratorClass: "discovery"      },

  // COMBAT
  enter_the_fray:            { category: "combat",      stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "interaction"    },
  gain_ground:               { category: "combat",      stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "interaction"    },
  strike:                    { category: "combat",      stat: ["iron","edge"],                                       narratorClass: "interaction"    },
  clash:                     { category: "combat",      stat: ["iron","edge"],                                       narratorClass: "interaction"    },
  react_under_fire:          { category: "combat",      stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "interaction"    },
  take_decisive_action:      { category: "combat",      stat: null,  progressMove: true,                             narratorClass: "interaction"    },
  face_defeat:               { category: "combat",      stat: null,                                                  narratorClass: "embellishment" },
  battle:                    { category: "combat",      stat: ["edge","heart","iron","shadow","wits"],               narratorClass: "hybrid"         },

  // SUFFER
  lose_momentum:             { category: "suffer",      stat: null,                                                  narratorClass: "embellishment" },
  endure_harm:               { category: "suffer",      stat: ["health","iron"],                                     narratorClass: "embellishment" },   // roll higher of the two
  endure_stress:             { category: "suffer",      stat: ["spirit","heart"],                                    narratorClass: "embellishment" },   // roll higher of the two
  withstand_damage:          { category: "suffer",      stat: ["integrity"],                                         narratorClass: "embellishment" },
  companion_takes_a_hit:     { category: "suffer",      stat: ["companion_health"],                                  narratorClass: "embellishment" },
  sacrifice_resources:       { category: "suffer",      stat: null,                                                  narratorClass: "embellishment" },

  // RECOVER
  sojourn:                   { category: "recover",     stat: ["heart"],                                             narratorClass: "discovery"      },
  heal:                      { category: "recover",     stat: ["iron","wits","heart"],                               narratorClass: "embellishment" },
  hearten:                   { category: "recover",     stat: ["heart"],                                             narratorClass: "embellishment" },
  resupply:                  { category: "recover",     stat: ["heart","iron","shadow","wits"],                      narratorClass: "hybrid"         },
  repair:                    { category: "recover",     stat: ["wits","supply"],                                     narratorClass: "embellishment" },

  // THRESHOLD
  face_death:                { category: "threshold",   stat: ["heart"],                                             narratorClass: "interaction"    },
  face_desolation:           { category: "threshold",   stat: ["heart"],                                             narratorClass: "interaction"    },
  overcome_destruction:      { category: "threshold",   stat: null,  progressMove: true,                             narratorClass: "interaction"    },

  // LEGACY
  earn_experience:           { category: "legacy",      stat: null,                                                  narratorClass: "embellishment" },
  advance:                   { category: "legacy",      stat: null,                                                  narratorClass: "embellishment" },
  continue_a_legacy:         { category: "legacy",      stat: null,  progressMove: true,                             narratorClass: "embellishment" },

  // FATE
  ask_the_oracle:            { category: "fate",        stat: null,                                                  narratorClass: "discovery"      },
  pay_the_price:             { category: "fate",        stat: null,                                                  narratorClass: "hybrid"         },
};

/**
 * Valid narratorClass values for the MOVES taxonomy.
 *   "discovery"     — narrator may introduce new named entities
 *   "interaction"   — narrator must use established entities; may add generative detail
 *   "embellishment" — sensory/atmospheric only; no entity introduction permitted
 *   "hybrid"        — class resolved at runtime via the relevance resolver
 *
 * Contract anchor — deliberately no runtime consumer: the MOVES narratorClass
 * contract test (tests/unit/schemas.test.js) enforces membership against this
 * list, which is what keeps the valid set single-sourced. Do not delete as
 * "test-only" (2026-07 test-suite review).
 */
export const NARRATOR_CLASSES = ["discovery", "interaction", "embellishment", "hybrid"];

/**
 * Ask the Oracle yes/no odds and their threshold rolls.
 * Source: Reference Guide p.24
 */
export const ORACLE_ODDS = {
  small_chance:   10,
  unlikely:       25,
  "50_50":        50,
  likely:         75,
  almost_certain: 90,
};


// Player characters are foundry-ironsworn `character` Actors, read and written
// only through src/character/actorBridge.js — there is no module-side
// character schema (the old CharacterSchema template had no consumer and was
// removed in the 2026-10 dead-export audit).


// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION (NPC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connection and NPC record.
 * Progressive disclosure: starts sparse, fills through play.
 * Art is generated after Loremaster's first description — not on name appearance.
 * Source: Reference Guide pp.13, 163–166
 */
export const ConnectionSchema = {
  _id: "",
  sectorId: null,               // Home sector — routes the NPC card into
                                // `Sectors / <Name> / NPCs` (see decisions.md →
                                // "NPCs and connections: native ironsworn
                                // `character` Actors"). null → top-level NPCs/.
  name: "",                     // May be null initially ("Unknown Keeper") until named
  role: "",                     // Defining role — drives the +1 bonus on related moves
  secondRole: null,             // Set if bond forged and Expand Influence chosen
  rank: "dangerous",            // RANKS — governs progress per Develop Your Relationship
  relationshipType: "neutral",  // "ally" | "neutral" | "antagonist" | "unknown"

  portraitId: null,             // ArtAsset _id — populated after first Loremaster description
  portraitSourceDescription: "",// The Loremaster narration excerpt that triggered art generation

  bonded: false,                // true after Forge a Bond (strong or weak hit)
  active: true,                 // false if connection lost or permanently severed (!sever)

  relationshipTicks: 0,         // Relationship progress track (0–40) — written by
                                // markRelationshipProgress (Develop Your Relationship,
                                // deepenLinkedConnection) and scored by Forge a Bond
                                // (enrichProgressTicks). Was written ad-hoc without a
                                // schema home until the 2026-07 soft-spot cleanup.

  progressTrackId: null,        // Associated ProgressTrack _id

  // Narrative — populated progressively through play
  firstAppearance: "",          // Session/scene reference
  description: "",              // Physical description
  pronouns: "",                 // Pronoun set ("she/her" | "he/him" | "they/them" | custom).
                                // Established once: detection capture / inciting target line /
                                // createConnection data win; seedConnectionActor rolls only
                                // when still blank (finding E; CHAR-NPC-PRONOUN-ROLL-BLIND).
                                // Anchors portrait prompt, entity card, seeded Notes, audio voice.
  background: "",               // Known history
  motivation: "",               // What drives them (may be blank — unknown)
  goal: "",                     // CHARACTERS.GOAL oracle result — the driving objective
                                // rolled at creation (sector wizard / Make a Connection).
                                // F3: rolled by sector creator and passed to createConnection
                                // but had no schema home, so it never reached the journal body.
  secrets: "",                  // Information hidden from the player character (GM only)

  // Append-only relationship history log
  history: [
    // { timestamp: ISO string, entry: "Rescued from Exodus-era pod in debris field" }
  ],

  loremasterNotes: "",          // How to voice/play this character — injected into context

  // Context injection flags

  // Privacy — per Brief §3: individual player Lines must not be visible to other players
  playerVisible: true,          // false = GM-only record (hidden antagonists, secret NPCs)

  // Set true when this connection was authored by the sector creator (or any
  // other canonical source) and should not be overwritten by narrator entity
  // discovery. No-op until the entity discovery system reads it.
  canonicalLocked: false,

  // Narrator-added detail entries with session attribution. See
  // narrator-entity-discovery scope §3 for shape and lifecycle.
  generativeTier: [],

  createdAt: null,
  updatedAt: null,
};


// ─────────────────────────────────────────────────────────────────────────────
// MOVE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fully resolved move — interpreter.js picks the move, resolver.js rolls
 * and attaches the consequences, persistResolution.js applies them, and the
 * narrator receives the whole record. Documentation-only typedef: the
 * runtime `MoveResolutionSchema` template object had no consumer (2026-10
 * dead-export audit); the many JSDoc `@param … MoveResolutionSchema`
 * references across src/ point here.
 *
 * @typedef {Object} MoveResolutionSchema
 * @property {string}   moveId           key from MOVES, e.g. "face_danger"
 * @property {string}   moveName         display name, e.g. "Face Danger"
 * @property {string}   playerNarration  raw player text (typed or speech-transcribed)
 * @property {string}   statUsed         e.g. "wits"
 * @property {number}   statValue
 * @property {number}   adds             bonus adds from assets or move context
 * @property {string}   rationale        internal only — why this move was chosen
 * @property {boolean}  mischiefApplied  internal only — whether mischief reframed it
 * @property {number}   actionDie        d6 (1–6); 0 for progress moves
 * @property {boolean}  actionDieCancelled the roller's negative momentum matched
 *                                     the action die, which then counts 0
 * @property {number}   actionScore      actionDie + statValue + adds, capped at 10
 *                                     (the die counts 0 when cancelled)
 * @property {number[]} challengeDice    two d10 results
 * @property {boolean}  isMatch          both challenge dice equal
 * @property {boolean}  momentumBurned
 * @property {string}   outcome          "strong_hit" | "weak_hit" | "miss"
 * @property {string}   outcomeLabel     display label, e.g. "Strong Hit with a Match"
 * @property {boolean}  isProgressMove
 * @property {number}   progressScore    filled boxes — progress moves only
 * @property {Object}   consequences     mechanical effects applied before narration:
 *   momentumChange / healthChange / spiritChange / supplyChange (numbers);
 *   sufferPrompt (the SufferChoiceDialog prompt — { kind: "any", amount,
 *   count } | { kind: "enumerated", options, multi?, allowComplication? } |
 *   null; see docs/moves/suffer-routing-audit.md); combatPosition
 *   ("in_control" | "bad_spot" | null); expeditionProgress (boolean);
 *   legacyMark ({ track, ticks } | null); finishExpedition ({ ranksDown } |
 *   null); otherEffect (narrative consequence text).
 * @property {string}   loremasterContext formatted narrator-context string
 * @property {string}   sessionId
 */


// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level campaign state — one record per campaign.
 * Stored as a world-scoped Foundry module setting.
 *
 * v13 note: registered via game.settings.register() in src/index.js on the "init" hook.
 */
export const CampaignStateSchema = {
  // All 14 World Truths with full roll provenance
  // Sub-rolls are null for categories without sub-tables
  worldTruths: {
    cataclysm:    { roll: null, result: "", subRoll: null, subResult: "" },
    exodus:       { roll: null, result: "", subRoll: null, subResult: "" },
    communities:  { roll: null, result: "", subRoll: null, subResult: "" },
    iron:         { roll: null, result: "", subRoll: null, subResult: "" },
    laws:         { roll: null, result: "", subRoll: null, subResult: "" },
    religion:     { roll: null, result: "", subRoll: null, subResult: "" },
    magic:        { roll: null, result: "", subRoll: null, subResult: "" },
    commsAndData: { roll: null, result: "", subRoll: null, subResult: "" },
    medicine:     { roll: null, result: "", subRoll: null, subResult: "" },
    ai:           { roll: null, result: "", subRoll: null, subResult: "" },
    war:          { roll: null, result: "", subRoll: null, subResult: "" },
    lifeforms:    { roll: null, result: "", subRoll: null, subResult: "" },
    precursors:   { roll: null, result: "", subRoll: null, subResult: "" },
    horrors:      { roll: null, result: "", subRoll: null, subResult: "" },
  },

  // Global safety configuration.
  // ALWAYS injected first in every Loremaster context packet, before any creative content.
  // Safety config is a hard ceiling on the mischief dial regardless of session setting.
  safety: {
    lines: [
      // Hard stops — absolute. No exceptions. Established in Session Zero.
      "No situations that endanger children. Children may not appear as characters in peril under any circumstances."
    ],
    veils: [
      // Soft cautions — approach mindfully.
      "Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines."
    ],
    // Per-player private Lines. GM-only visibility. Not shared to other players at the table.
    // Array of { playerId: string, lines: string[] }
    privateLines: [],
  },

  // Sector records — created by the Sector Creator
  sectors:       [],            // Array of StoredSector objects
  activeSectorId: null,         // The sector the party is currently in

  // Active entity ID collections
  //
  // `characterIds`: dead schema field, never written by any production
  // code path (see Priority 12 of the behaviour-coverage audit at
  // docs/testing/behaviour-coverage-audit.md). Three callers historically read
  // it — `src/narration/narrator.js`, `src/character/chronicleWriter.js`,
  // `src/moves/persistResolution.js` — all now fall back to
  // `getPlayerActors()` (the same source the assembler uses) when the
  // stored list is empty (RECAP-003 fix in v1.2.12). The field is
  // retained for backward-compatibility with snapshots created by older
  // module versions; future schema migrations may remove it. Tests that
  // populate it explicitly (chronicleWriter.test.js, speaker.test.js)
  // still exercise the "stored value present" code branch.
  characterIds:     [],
  connectionIds:    [],
  settlementIds:    [],
  locationIds:      [],         // JournalEntry IDs for location records
  creatureIds:      [],         // JournalEntry IDs for creature records

  // Current scene location — set via !at command. Populates the current
  // location card in narrator context.
  currentLocationId:   null,    // JournalEntry ID of current settlement/location/planet
  currentLocationType: null,    // "settlement" | "location" | "planet"

  // Campaign premise — the inciting incident's load-bearing fiction, captured
  // once when ✦ Envision Inciting Incident runs. Campaign-level and never
  // scene-scoped: injected into EVERY narrator call as canon so the opening
  // premise (who / where / stakes / deadline) cannot age out of the recent-
  // narration ring or be cleared by a scene transition (PLAYTEST-1712 S; the
  // narrator-memory "never-dropped" tier). null until the incident is composed.
  // Shape: { prose, spark:{action,theme}, vow, clock, target, sessionId, establishedAt }
  incitingIncident: null,

  // Entity names suppressed from narrator extraction. Populated by the
  // entity panel's dismiss action.
  dismissedEntities:   [],

  // Concurrency lock — true while the move interpretation pipeline is running.
  // Prevents two narration messages from kicking off parallel pipelines that
  // would race on campaignState writes. Cleared on ready if left stuck.
  pendingMove: false,

  // Claude API configuration — read by the move interpreter (which falls back
  // to its own constants); nothing writes it, so it stays at these defaults.
  api: {
    // Primary model for move interpretation and oracle calls
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1000,
    promptCachingEnabled: true,
    // Fallback model for ambiguous multi-move situations
    fallbackModel: "claude-sonnet-4-6",
  },

  // World Truths state
  worldTruthsSet:       false,  // true once truths established via any method
  // Foundry document references
  // v13 note: world truths journal uses JournalEntryPage documents inside a parent JournalEntry
  worldTruthsJournalId: null,   // Parent JournalEntry Foundry ID (system-created or ours)
  loreRecap:          "",       // last generated lore recap text (for context injection)

  currentSessionId:     "",    // minted by mintSession() (src/session/lifecycle.js)
  sessionNumber:        0,     // increments each new session
  lastSessionTimestamp: null,  // ISO string: when the session was last seen live — at mint,
                               // on chat activity (at most every 10 minutes) and at closeWorld
  // The session End a Session closed (issue #286 C4). The next world load or
  // Begin a Session mints a new session while this equals currentSessionId.
  sessionEndedId:       null,
  // The rolling summary of the session before this one, kept when the new
  // session is minted (issue #286 C3) and shown to the narrator as LAST
  // SESSION. Written only by mintSession (src/session/lifecycle.js), from
  // sessionSummary — the canonical, live record.
  //   { sessionId, sessionNumber, text, updatedAt }
  previousSessionSummary: null,

  // Session-active gate (see docs/scope-index.md → Session moves panel).
  // false at world load and after End Session; flipped to true by Begin
  // Session. Used by the createChatMessage hook to short-circuit the
  // implicit move-pipeline / paced-narrator paths so users can interact
  // with cards (X-Card, draft Confirm/Dismiss, recap Refresh) and run
  // explicit narration commands (@scene, !oracle yes, !pay-the-price,
  // !lore) without triggering automatic narration on every typed
  // message.
  sessionActive:        false,
  // Wall-clock ISO of the last beginSession() call. Powers the panel's
  // "active for N minutes" display and the session-vignette anchor.
  sessionActiveStartedAt: null,
  // The session whose start effects (Spotlight momentum, campaign clocks,
  // galley vignette) Begin a Session already applied — they run once per
  // session (issue #300 F11). Written and read by applyBeginSession.
  sessionStartedId:     null,

  // End a Session spotlights: the vow and connection the
  // table wants to focus on next time. Written by applyEndSession, surfaced
  // and cleared at the next Begin a Session (src/safety/sessionLifecycleDialogs.js).
  questFocus:           "",
  connectionFocus:      "",
  // Those foci, carried into the session Begin a Session opens (issue #286
  // C5) — the narrator's THE TABLE'S FOCUS THIS SESSION block. Written by
  // applyBeginSession, read by buildNarratorExtras while sessionId matches.
  //   { sessionId, quest, connection }
  sessionFocus:         null,

  // The chronicle a recap was made from — getCampaignRecap and the session's
  // first narration use the text only while the chronicle still matches
  // (narrator.js campaignRecapCacheKey, issue #301 B04).
  campaignRecapCache: {
    text:            "",
    generatedAt:     null,
    chronicleLength: 0,
    chronicleHash:   null,
  },

  // Pacing classifier state (see issue #220 (Pacing))
  //   sceneOverride   — { modifier, label } when GM has set !pace hot/quiet; null otherwise
  //   forceNextAsMove — set by !roll, consumed by router before classification
  // Recent-decision rolling window lives in-memory in src/pacing/router.js;
  // it resets when the scene tag changes and does not need to persist.
  pacing: {
    sceneOverride:   null,
    forceNextAsMove: false,
  },

  // Fact-continuity active-scene ledgers (see issue #227 (Fact Continuity) §4–5).
  //   currentSceneId — assigned on scene start, cleared on scene end
  //   sceneTruths    — append-only ledger of narrator-asserted truths
  //                    { id, subject: { kind, ... }, fact, sessionId, sceneId,
  //                      moveId, source, asserter, createdAt, retracted,
  //                      retractedBy, retractedAt, correctedTo, migratedTo }
  //   sceneState     — supersede-on-attribute state ledger
  //                    { bySubject: { [subjectKey]: [{ attribute, value, updatedAt }] }, sceneId }
  currentSceneId: null,
  sceneTruths:    [],
  sceneState:     { bySubject: {}, sceneId: null },

  // Bare strikes of this session's ended scenes (issue #286 B6), so the
  // CORRECTED block and the rolling-summary prompt keep naming them after
  // their scene closes. Written by endScene (rememberSessionRetractions);
  // read by sessionRetractedFacts (src/factContinuity/retractions.js).
  //   { sessionId, facts: [{ label, fact, sceneId, at }] }  (cap 20)
  sessionRetractions: { sessionId: null, facts: [] },

  // Narrator rotating spotlight (issue #232). Per-scene round-robin pointer
  // naming the PC the narrator last drew into an open prompting beat, so the
  // next beat rotates to another player. Reset on scene start/end.
  //   lastActorId — actor id addressed on the prior eligible beat (null = fresh)
  //   sceneId     — the scene the pointer belongs to (guards stale carry-over)
  spotlight:      { lastActorId: null, sceneId: null },

  // Raw oracle-result memory (narrator-context audit 2026-07). Small append
  // ring of `!oracle` / `!pay-the-price` outcomes so the narrator is told
  // what the dice established (prompt section [3b]) instead of being free to
  // contradict a roll the table just made. Written by the canonical GM's
  // capture hook (src/index.js) via src/oracles/oracleMemory.js; capped at
  // RECENT_ORACLE_CAP entries of { name, question, answer, sessionId, at }.
  recentOracles:  [],
};


// ─────────────────────────────────────────────────────────────────────────────
// ART ASSET
// ─────────────────────────────────────────────────────────────────────────────

// Art asset records are built and stored by src/art/generator.js +
// src/art/storage.js (storeArtAsset / loadArtAsset); the old ArtAssetSchema
// template had no consumer and was removed in the 2026-10 dead-export audit.


