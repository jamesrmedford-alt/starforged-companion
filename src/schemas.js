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
 * All 11 move categories.
 * Source: Reference Guide p.5 (A-Z index)
 */
export const MOVE_CATEGORIES = [
  "session",
  "adventure",
  "quest",
  "connection",
  "exploration",
  "combat",
  "suffer",
  "recover",
  "threshold",
  "legacy",
  "fate",
];

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
  begin_a_session:           { category: "session",     stat: null },
  set_a_flag:                { category: "session",     stat: null },
  change_your_fate:          { category: "session",     stat: null },
  take_a_break:              { category: "session",     stat: null },
  end_a_session:             { category: "session",     stat: null },

  // ADVENTURE
  face_danger:               { category: "adventure",   stat: ["edge","heart","iron","shadow","wits"] },
  secure_an_advantage:       { category: "adventure",   stat: ["edge","heart","iron","shadow","wits"] },
  gather_information:        { category: "adventure",   stat: ["wits"] },
  compel:                    { category: "adventure",   stat: ["heart","iron","shadow"] },
  aid_your_ally:             { category: "adventure",   stat: null },   // delegates to secure_an_advantage or gain_ground
  check_your_gear:           { category: "adventure",   stat: ["supply"] },

  // QUEST
  swear_an_iron_vow:         { category: "quest",       stat: ["heart"] },
  reach_a_milestone:         { category: "quest",       stat: null },
  fulfill_your_vow:          { category: "quest",       stat: null,  progressMove: true },
  forsake_your_vow:          { category: "quest",       stat: null },

  // CONNECTION
  make_a_connection:         { category: "connection",  stat: ["heart"] },
  develop_your_relationship: { category: "connection",  stat: null },
  test_your_relationship:    { category: "connection",  stat: ["heart"] },
  forge_a_bond:              { category: "connection",  stat: null,  progressMove: true },

  // EXPLORATION
  undertake_an_expedition:   { category: "exploration", stat: ["edge","shadow","wits"] },
  explore_a_waypoint:        { category: "exploration", stat: ["wits"] },
  finish_an_expedition:      { category: "exploration", stat: null,  progressMove: true },
  set_a_course:              { category: "exploration", stat: ["supply"] },
  make_a_discovery:          { category: "exploration", stat: null },
  confront_chaos:            { category: "exploration", stat: null },

  // COMBAT
  enter_the_fray:            { category: "combat",      stat: ["edge","heart","iron","shadow","wits"] },
  gain_ground:               { category: "combat",      stat: ["edge","heart","iron","shadow","wits"] },
  strike:                    { category: "combat",      stat: ["iron","edge"] },
  clash:                     { category: "combat",      stat: ["iron","edge"] },
  react_under_fire:          { category: "combat",      stat: ["edge","heart","iron","shadow","wits"] },
  take_decisive_action:      { category: "combat",      stat: null,  progressMove: true },
  face_defeat:               { category: "combat",      stat: null },
  battle:                    { category: "combat",      stat: ["edge","heart","iron","shadow","wits"] },

  // SUFFER
  lose_momentum:             { category: "suffer",      stat: null },
  endure_harm:               { category: "suffer",      stat: ["health","iron"] },   // roll higher of the two
  endure_stress:             { category: "suffer",      stat: ["spirit","heart"] },  // roll higher of the two
  withstand_damage:          { category: "suffer",      stat: ["integrity"] },
  companion_takes_a_hit:     { category: "suffer",      stat: ["companion_health"] },
  sacrifice_resources:       { category: "suffer",      stat: null },

  // RECOVER
  sojourn:                   { category: "recover",     stat: ["heart"] },
  heal:                      { category: "recover",     stat: ["iron","wits","heart"] },
  hearten:                   { category: "recover",     stat: ["heart"] },
  resupply:                  { category: "recover",     stat: ["heart","iron","shadow","wits"] },
  repair:                    { category: "recover",     stat: ["wits","supply"] },

  // THRESHOLD
  face_death:                { category: "threshold",   stat: ["heart"] },
  face_desolation:           { category: "threshold",   stat: ["heart"] },
  overcome_destruction:      { category: "threshold",   stat: null,  progressMove: true },

  // LEGACY
  earn_experience:           { category: "legacy",      stat: null },
  advance:                   { category: "legacy",      stat: null },
  continue_a_legacy:         { category: "legacy",      stat: null,  progressMove: true },

  // FATE
  ask_the_oracle:            { category: "fate",        stat: null },
  pay_the_price:             { category: "fate",        stat: null },
};

/**
 * Mischief dial settings for the Trickster Layer move interpretation personality.
 * serious  — literal interpretation, no reframing
 * balanced — occasional organic misreads for emergent story moments
 * chaotic  — deliberately forces square pegs into round holes
 * Source: Brief §1 Feature 2
 */
export const MISCHIEF_LEVELS = ["serious", "balanced", "chaotic"];

/**
 * Connection/entity relationship stance from the player character's perspective.
 */
export const RELATIONSHIP_TYPES = ["ally", "neutral", "antagonist", "unknown"];

/**
 * Progress track types — each gets a progress track and a rank.
 */
export const TRACK_TYPES = ["vow", "expedition", "connection", "combat", "scene_challenge"];

/**
 * The three legacy tracks. Each is a 10-box track.
 * Filling a box (4 ticks) triggers Earn Experience: 2 exp per box (1 per box on a cleared track).
 * Source: Reference Guide p.118–119
 */
export const LEGACY_TRACKS = ["quests", "bonds", "discoveries"];

/**
 * All named impacts, grouped by type.
 * Each marked impact reduces max momentum by 1 and affects momentum reset.
 * Source: Reference Guide p.120
 */
export const IMPACTS = {
  misfortunes:     ["wounded", "shaken", "unprepared"],
  vehicle_troubles:["battered", "cursed"],
  burdens:         ["doomed", "tormented", "indebted"],
  lasting_effects: ["permanently_harmed", "traumatized"],
};

/**
 * External art generation backends.
 * Local generation is not supported — backend is always an external API.
 */
export const ART_BACKENDS = ["replicate", "fal", "dalle"];

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


// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Player character schema.
 * Stats: 1–3 at creation, max 4 during play.
 * Health / spirit / supply: 0–5.
 * Momentum: -6 to +10. Default max 10, default reset +2.
 * Source: Rulebook character sheet / Reference Guide p.119
 */
export const CharacterSchema = {
  _id: "",                      // foundry.utils.randomID()
  name: "",
  pronouns: "",
  description: "",              // Brief appearance/background for Loremaster context
  portraitId: null,             // ArtAsset _id

  stats: {
    edge:   1,                  // Speed, mobility, agility
    heart:  1,                  // Resolve, command, sociability
    iron:   1,                  // Strength, endurance, aggression
    shadow: 1,                  // Deception, stealth, trickery
    wits:   1,                  // Expertise, focus, observation
  },

  meters: {
    health:   5,                // Physical condition. Reduced by Endure Harm.
    spirit:   5,                // Morale/mental state. Reduced by Endure Stress.
    supply:   5,                // Shared with allies. Reduced by Sacrifice Resources.
    momentum: 2,                // -6 to +10.
  },

  momentumMax:   10,            // Reduced by 1 per marked impact. Default 10.
  momentumReset: 2,             // Default +2. Drops to +1 (1 impact) or 0 (2+ impacts).

  // Impacts — true if currently marked
  impacts: {
    // Misfortunes — cleared by recover moves
    wounded:            false,
    shaken:             false,
    unprepared:         false,
    // Vehicle troubles — only apply when aboard the vehicle
    battered:           false,
    cursed:             false,  // Permanent on command vehicle
    // Burdens — cleared only by completing the associated quest
    doomed:             false,
    tormented:          false,
    indebted:           false,
    // Lasting effects — permanent
    permanently_harmed: false,
    traumatized:        false,
  },

  // Legacy tracks — 0 to 40 ticks (10 boxes × 4 ticks per box)
  // cleared: true means the track has been completed once; experience rate drops to 1/box
  legacyTracks: {
    quests:      { ticks: 0, cleared: false },
    bonds:       { ticks: 0, cleared: false },
    discoveries: { ticks: 0, cleared: false },
  },

  experience: {
    earned: 0,
    spent:  0,
  },

  assetIds: [],                 // Foundry document IDs of owned assets

  ironShard: null,              // Description of the character's iron shard (World Truth: Iron)

  notes: "",
  loremasterNotes: "",          // Injected into context packet — voice/personality notes

  createdAt: null,
  updatedAt: null,
};


// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS TRACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Universal progress track.
 * Used for vows, expeditions, connections, fights, and scene challenges.
 * 10 boxes × 4 ticks = 40 ticks maximum.
 * Source: Reference Guide p.118
 */
export const ProgressTrackSchema = {
  _id: "",
  type: "vow",                  // TRACK_TYPES
  name: "",
  rank: "dangerous",            // RANKS
  ticks: 0,                     // 0–40. Rendered boxes = Math.floor(ticks / 4)
  active: true,
  outcome: null,                // "strong_hit" | "weak_hit" | "miss" | "forsaken" on resolution

  // Vow fields (type === "vow")
  vow: {
    description: "",            // Full vow text as sworn
    characterId: "",
    allyIds: [],
    connectionId: null,         // If sworn to a connection: +1 on roll; +2 if bonded
  },

  // Expedition fields (type === "expedition")
  expedition: {
    description: "",
    currentWaypoint: "",
    route: "",
  },

  // Combat fields (type === "combat")
  combat: {
    objective: "",
    controlState: "neutral",    // "in_control" | "bad_spot" | "neutral"
  },

  // Scene challenge fields (type === "scene_challenge")
  sceneChallenge: {
    objective: "",
    tensionClockId: null,       // Associated Clock _id (4-segment tension clock)
  },

  notes: "",
  createdAt: null,
  updatedAt: null,
};


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
  name: "",                     // May be null initially ("Unknown Keeper") until named
  role: "",                     // Defining role — drives the +1 bonus on related moves
  secondRole: null,             // Set if bond forged and Expand Influence chosen
  rank: "dangerous",            // RANKS — governs progress per Develop Your Relationship
  relationshipType: "neutral",  // RELATIONSHIP_TYPES

  portraitId: null,             // ArtAsset _id — populated after first Loremaster description
  portraitSourceDescription: "",// The Loremaster narration excerpt that triggered art generation

  bonded: false,                // true after Forge a Bond (strong or weak hit)
  active: true,                 // false if connection lost or permanently severed

  progressTrackId: null,        // Associated ProgressTrack _id

  // Narrative — populated progressively through play
  firstAppearance: "",          // Session/scene reference
  description: "",              // Physical description
  background: "",               // Known history
  motivation: "",               // What drives them (may be blank — unknown)
  secrets: "",                  // Information hidden from the player character (GM only)

  // Append-only relationship history log
  history: [
    // { timestamp: ISO string, entry: "Rescued from Exodus-era pod in debris field" }
  ],

  loremasterNotes: "",          // How to voice/play this character — injected into context

  // Context injection flags
  allyFlag: false,              // true = inject into every context packet
  sceneRelevant: false,         // true = inject into current scene packet

  // Privacy — per Brief §3: individual player Lines must not be visible to other players
  playerVisible: true,          // false = GM-only record (hidden antagonists, secret NPCs)

  // Set true when this connection was authored by the sector creator (or any
  // other canonical source) and should not be overwritten by narrator entity
  // discovery. No-op until the entity discovery system reads it.
  canonicalLocked: false,

  createdAt: null,
  updatedAt: null,
};


// ─────────────────────────────────────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clock schema — campaign clocks and tension clocks.
 * Campaign clocks: advance at Begin a Session via Ask the Oracle.
 * Tension clocks: advance when you Pay the Price or face a complication.
 * Source: Reference Guide pp.122–123
 */
export const ClockSchema = {
  _id: "",
  name: "",
  type: "tension",              // "campaign" | "tension"
  segments: 4,                  // 4 | 6 | 8 | 10
  filled: 0,                    // 0 to segments
  active: true,

  // Campaign clocks only — odds used when checking at Begin a Session
  advanceOdds: "likely",        // ORACLE_ODDS key

  description: "",
  notes: "",
  createdAt: null,
  updatedAt: null,
};


// ─────────────────────────────────────────────────────────────────────────────
// MOVE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fully resolved move result produced by the Trickster Layer.
 * This is the complete output passed to the Loremaster context packet.
 * Loremaster receives move name, stat, numerical outcome, AND specific consequences —
 * not just a dice number.
 *
 * Mischief is not signalled to the player — interpretation plays it straight.
 * The rationale field is populated for internal debugging only.
 */
export const MoveResolutionSchema = {
  _id: "",
  timestamp: null,

  // Input
  playerNarration: "",          // Raw text from player (typed or speech-transcribed)
  inputMethod: "chat",          // "chat" | "speech"
  mischiefLevel: "balanced",    // Dial setting at time of interpretation

  // Interpretation — produced by moves/interpreter.js via Claude API
  moveId: "",                   // Key from MOVES, e.g. "face_danger"
  moveName: "",                 // Display name, e.g. "Face Danger"
  statUsed: "",                 // e.g. "wits"
  statValue: 0,
  adds: 0,                      // Any bonus adds from assets or move context
  rationale: "",                 // Internal only — why this move was chosen. Not surfaced to player.
  mischiefApplied: false,       // Whether mischief reframing occurred. Internal only.
  playerConfirmed: true,        // Did player accept the interpretation in the confirmation UI?

  // Dice — produced by moves/resolver.js
  actionDie: 0,                 // d6 result (1–6). 0 if progress move.
  actionScore: 0,               // actionDie + statValue + adds, capped at 10
  challengeDice: [0, 0],        // Two d10 results
  isMatch: false,               // Both challenge dice show the same value
  momentumBurned: false,
  momentumBurnedFrom: 0,        // Momentum value used if burned

  // Outcome
  outcome: "",                  // "strong_hit" | "weak_hit" | "miss"
  outcomeLabel: "",             // "Strong Hit with a Match" etc. for display
  isProgressMove: false,
  progressScore: 0,             // Filled boxes tally — progress moves only

  // Specific mechanical consequences for this move + outcome combination.
  // Populated from move text, not inferred from dice alone.
  // These are applied to the character sheet before Loremaster is called.
  consequences: {
    momentumChange:        0,   // e.g. +1 on Face Danger strong hit
    healthChange:          0,
    spiritChange:          0,
    supplyChange:          0,
    progressMarked:        0,   // Ticks to mark on the relevant progress track
    sufferMoveTriggered:   null,// e.g. { move: "endure_harm", amount: 1 }
    progressTrackId:       null,// Which track to apply progressMarked to
    otherEffect:           "",  // Narrative consequence for Loremaster
  },

  // Fully formatted string injected into the Loremaster context packet
  loremasterContext: "",

  sessionId: "",
};


// ─────────────────────────────────────────────────────────────────────────────
// ORACLE RESULT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single oracle roll result.
 * Stored and injected into context packets as recent oracle results.
 */
export const OracleResultSchema = {
  _id: "",
  timestamp: null,
  sessionId: "",

  tableId: "",                  // Oracle table identifier, e.g. "action", "theme", "pay_the_price"
  tableName: "",                // Display name
  roll: 0,                      // d100 result (1–100)
  result: "",                   // Text result from the table

  // For paired oracles (Action + Theme, Descriptor + Focus)
  pairedTableId: null,
  pairedRoll: null,
  pairedResult: null,

  context: "",                  // What prompted this oracle roll (player narration or move outcome)
  injectedIntoContext: false,   // Whether this has been included in a context packet
};


// ─────────────────────────────────────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Session record — one per play session.
 */
export const SessionSchema = {
  _id: "",
  sessionNumber: 1,
  date: null,
  mischiefLevel: "balanced",    // MISCHIEF_LEVELS — configurable per session

  // Session-scoped safety overrides (supplement campaign-level config)
  safetyOverrides: {
    additionalLines: [],
    additionalVeils: [],
  },

  notes: "",
  questFocus: "",               // Vow to spotlight in next session (set at End a Session)
  connectionFocus: "",          // Connection to spotlight

  // Momentum snapshots for tracking drift across the session
  momentumAtStart: {},          // { [characterId]: momentum }
  momentumAtEnd:   {},

  moveCount: 0,
  moveResolutionIds: [],
  oracleResultIds: [],

  createdAt: null,
  updatedAt: null,
};


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
  _id: "",
  title: "",
  version: "0.1.0",             // Module version that created this record

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
  characterIds:     [],
  connectionIds:    [],
  settlementIds:    [],
  progressTrackIds: [],
  clockIds:         [],
  oracleResultIds:  [],         // Recent results for context injection

  // Claude API configuration
  api: {
    // Primary model for move interpretation and oracle calls
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1000,
    promptCachingEnabled: true,
    // Fallback model for ambiguous multi-move situations
    fallbackModel: "claude-sonnet-4-6",
  },

  // Art generation — external API only
  art: {
    // ART_BACKENDS: "replicate" | "fal" | "dalle"
    // null until configured in module settings during setup
    backend: null,
    // API key stored in Foundry's client settings (not here — never serialise credentials)
    enabled: false,
  },

  // Speech input (push-to-talk via Web Speech API)
  // Supported in Chromium-based browsers. Firefox support inconsistent.
  speechInput: {
    enabled: false,
    // Auto-inject transcription directly to chat on recognition end — no review step.
    // Chat input remains available as fallback for corrections.
    autoInject: true,
    language: "en-US",          // BCP 47 language tag passed to Web Speech API
  },

  // Foundry document references
  // v13 note: world truths journal uses JournalEntryPage documents inside a parent JournalEntry
  worldTruthsJournalId: null,   // Parent JournalEntry Foundry ID
  worldTruthsPageId: null,      // JournalEntryPage Foundry ID

  currentSessionId:     "",    // managed by initSessionId() on ready hook
  sessionNumber:        0,     // increments each new session
  lastSessionTimestamp: null,  // ISO string, updated on ready and closeWorld
  sessionCount:         0,

  campaignRecapCache: {
    text:            "",
    generatedAt:     null,
    chronicleLength: 0,
  },

  createdAt: null,
  updatedAt: null,
};


// ─────────────────────────────────────────────────────────────────────────────
// ART ASSET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Art asset metadata record.
 *
 * Storage path: starforged-companion/{entityType}/{entityId}.webp
 * (The Forge manages this as cloud storage under Foundry Data.)
 *
 * Generation policy:
 * - Triggered after Loremaster's first description of the entity, not on name appearance
 * - Generated once and stored permanently — no regeneration drift, predictable cost
 * - One regeneration permitted if the image misses — then locked permanently
 * - Backend is always an external API (ART_BACKENDS)
 *
 * Source: Brief §1 Feature 7
 */
export const ArtAssetSchema = {
  _id: "",                      // Matches the owning entity's Foundry document ID
  entityType: "",               // "connection" | "settlement" | "ship" | "faction" | "planet"
  entityId: "",

  // Generation state machine
  // pending → generating → complete | failed
  // complete → (one regeneration allowed) → complete → locked
  status: "pending",            // "pending" | "generating" | "complete" | "failed" | "locked"
  regenerationAvailable: true,  // false after first regeneration

  // File
  path: "",                     // Foundry Data path, e.g. starforged-companion/connections/{id}.webp
  filename: "",

  // Prompt traceability
  sourceDescription: "",        // Loremaster narration excerpt that triggered generation
  promptUsed: "",               // Final translated prompt sent to the backend
  styleTokens: [],              // Style tokens appended by art/promptBuilder.js

  // Backend metadata — stored for debugging and consistency reference
  backend: "",                  // ART_BACKENDS
  model: "",                    // Specific model or checkpoint used
  settings: {},                 // Backend-specific: steps, CFG scale, seed, etc.
  generatedAt: null,

  // Lock state
  lockedAt: null,               // Timestamp of permanent lock (after second generation)
  overrideFlag: false,          // GM-only manual override to unlock
};


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT PACKET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The assembled Loremaster context packet.
 * Built by context/assembler.js before every @lm call.
 *
 * Injection order — safety is always first, no exceptions:
 *   1. Safety configuration (lines, veils — never omitted regardless of token budget)
 *   2. World Truths summary
 *   3. Active connections (scene-relevant first, then allies, then others by recency)
 *   4. Open vows and progress track states
 *   5. Recent oracle results
 *   6. Session notes
 *   7. Resolved move outcome (move name, stat, outcome, specific consequences)
 *
 * Token budget: assembler compresses or drops lower-priority sections to fit.
 * Safety section is exempt from budget pressure — never dropped, never summarised.
 *
 * Source: Brief §1 Feature 6
 */
export const ContextPacketSchema = {
  _id: "",
  timestamp: null,
  sessionId: "",
  triggeredBy: "",              // "move_resolution" | "oracle" | "player_message" | "manual"

  sections: {
    safety: {
      content: "",
      tokenEstimate: 0,
      alwaysInclude: true,      // Never omitted. Never summarised. Hard rule.
    },
    worldTruths: {
      content: "",
      tokenEstimate: 0,
      summarized: false,        // true if compressed to fit token budget
    },
    activeConnections: {
      content: "",
      tokenEstimate: 0,
      connectionIds: [],
    },
    progressTracks: {
      content: "",
      tokenEstimate: 0,
      trackIds: [],
    },
    recentOracles: {
      content: "",
      tokenEstimate: 0,
      oracleResultIds: [],
    },
    sessionNotes: {
      content: "",
      tokenEstimate: 0,
    },
    moveOutcome: {
      content: "",
      tokenEstimate: 0,
      moveResolutionId: "",
    },
  },

  totalTokenEstimate: 0,
  tokenBudget: 400,             // Target token ceiling for the context packet
  budgetExceeded: false,
  omittedSections: [],          // Sections dropped to fit budget. Never includes "safety".

  assembled: "",                // Final concatenated string prepended to the Loremaster call
};
