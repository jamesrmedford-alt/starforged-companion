// src/ui/settingsPanel.js
// Settings Panel + Move Confirmation Dialog — Starforged Companion module
//
// Exports:
//   SettingsPanelApp        — tabbed ApplicationV2: Safety | Mischief | Narrator | About
//   MoveConfirmDialog       — ApplicationV2 dialog replacing confirmInterpretation() stub
//   registerSettings()      — register game.settings (call from init hook)
//   registerSettingsHooks() — wire X-Card chat hook + initial safety sync (call from ready hook)
//   openSettingsPanel()     — public opener
//   confirmInterpretation() — await-able wrapper for MoveConfirmDialog
//   getSafetyConfig()       — read safety config (for assembler.js)
//   getMischiefDial()       — read dial value (for mischief.js / index.js)
//
// Safety config storage fix:
//   Lines/Veils are stored in game.settings (world/client-scoped).
//   assembler.js reads from campaignState.safety.lines / .veils / .privateLines.
//   syncSafetyToCampaignState() bridges the two, called on every write and on ready.

import { suppressScene } from '../context/safety.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_ID = 'starforged-companion';

const DIAL_POSITIONS = [
  {
    value: 'lawful',
    label: 'Lawful',
    description: 'Always interprets the most rules-literal reading of player narration. No misdirection. Confirmations are plain.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Default. Interprets with context and intent. Occasional wry asides when interpretation is ambiguous. No mechanical misdirection.',
  },
  {
    value: 'chaotic',
    label: 'Chaotic',
    description: 'May read subtext over surface text. Asides are openly smug. May choose a mechanically distinct but narratively fitting move when interpretation is genuinely ambiguous.',
  },
];

const SETTING = {
  DIAL:                     'mischiefDial',
  GLOBAL_LINES:             'globalSafetyLines',
  GLOBAL_VEILS:             'globalSafetyVeils',
  PRIVATE_LINES:            'privateLines',         // client-scoped
  NARRATION_ENABLED:        'narrationEnabled',
  NARRATION_MODEL:          'narrationModel',
  NARRATION_PERSPECTIVE:    'narrationPerspective',
  NARRATION_TONE:           'narrationTone',
  NARRATION_LENGTH:         'narrationLength',
  NARRATION_INSTRUCTIONS:   'narrationInstructions',
  NARRATION_MAX_TOKENS:     'narrationMaxTokens',
  NARRATOR_CONTEXT_CARDS:   'narratorContextCards',
  // ── Character management ─────────────────────────────────────────────────
  ACTIVE_CHARACTER_ID:      'activeCharacterId',
  CHRONICLE_AUTO_ENTRY:     'chronicleAutoEntry',
  CHRONICLE_CONTEXT_COUNT:  'chronicleContextCount',
  CHRONICLE_SALIENCE:       'chronicleSalienceThreshold',
  CHARACTER_CONTEXT_ENABLED:'characterContextEnabled',
  // ── Scene interrogation ──────────────────────────────────────────────────
  SCENE_QUERY_ENABLED:      'sceneQueryEnabled',
  SCENE_RESPONSE_LENGTH:    'sceneResponseLength',
  SCENE_CONTEXT_CARDS:      'sceneContextCards',
  // ── Previously On / recap ────────────────────────────────────────────────
  AUTO_RECAP_ENABLED:       'autoRecapEnabled',
  SESSION_GAP_HOURS:        'sessionGapHours',
  RECAP_GM_ONLY:            'recapGmOnly',
  // ── World Journal ─────────────────────────────────────────────────────────
  WJ_ENABLED:                  'worldJournalEnabled',
  WJ_AUTO_DETECT:              'worldJournalAutoDetect',
  WJ_LORE_IN_CONTEXT:          'loreInContext',
  WJ_THREATS_IN_CONTEXT:       'threatsInContext',
  WJ_FACTION_IN_CONTEXT:       'factionLandscapeInContext',
  WJ_CONTRADICTION_NOTIFY:     'contradictionNotifications',
  WJ_SESSION_LOG_AUTOWRITE:    'sessionLogAutoWrite',
  WJ_LORE_SALIENCE:            'loreSalienceThreshold',
  WJ_THREAT_SALIENCE:          'threatSalienceThreshold',
  // ── Pacing classifier ────────────────────────────────────────────────────
  PACING_ENABLED:              'pacing.enabled',
  PACING_DENSITY_WINDOW:       'pacing.densityWindow',
  PACING_DIAL_COMBAT:          'pacing.dial.combat',
  PACING_DIAL_INVESTIGATION:   'pacing.dial.investigation',
  PACING_DIAL_EXPLORATION:     'pacing.dial.exploration',
  PACING_DIAL_SOCIAL:          'pacing.dial.social',
  PACING_DIAL_DOWNTIME:        'pacing.dial.downtime',
  // ── Fact continuity ──────────────────────────────────────────────────────
  FC_ENABLED:                  'factContinuity.enabled',
  FC_LEDGER_IN_CONTEXT:        'factContinuity.ledgerInContext',
  FC_SIDECAR_REQUIRED:         'factContinuity.sidecarRequired',
  FC_MAX_LEDGER_TOKENS:        'factContinuity.maxLedgerTokens',
  FC_CONSISTENCY_CHECK:        'factContinuity.consistencyCheck',
  FC_SCENE_FRAME:              'factContinuity.sceneFrame',
  // ── Fact continuity — ship positioning (§20) ─────────────────────────────
  FC_SHIP_POSITIONING:         'factContinuity.shipPositioning',
  FC_SHIP_AUTO_MOVE:           'factContinuity.shipAutoMoveOnCourse',
  FC_SHIP_TOKEN_ENABLED:       'factContinuity.shipTokenEnabled',
  FC_SHIP_TOKEN_SNAP_RADIUS:   'factContinuity.shipTokenSnapRadius',
};

const PACING_DEFAULTS = {
  combat:        9,
  investigation: 6,
  exploration:   6,
  social:        5,
  downtime:      1,
};

// Per-channel auto-capture floors (lore / threats / chronicle). Ordered least →
// most durable; see src/world/salience.js. Conservative default is "significant"
// so transient scene beats are dropped (findings F15 / F17 / F20 / F21).
const SALIENCE_CHOICES = {
  trivial:     'Everything (no filtering)',
  scene:       'Scene and above',
  notable:     'Notable and above',
  significant: 'Significant and above (recommended)',
  defining:    'Campaign-defining only',
};

const NARRATION_MODELS = {
  'claude-haiku-4-5-20251001':  'Haiku 4.5 (fast, economical)',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5 (richer narration, recommended)',
};

const NARRATION_PERSPECTIVES = {
  auto:          'Auto — second person for solo, third person for multiplayer (recommended)',
  second_person: 'Second person — always "you" regardless of party size',
  third_person:  'Third person — always character names regardless of party size',
};

const NARRATION_TONES = {
  wry:              'Wry — knowing, slightly sardonic, aware of the fiction\'s weight (default)',
  grim_and_grounded:'Grim and grounded — sparse, consequential, Ironsworn-canonical',
  operatic:         'Operatic — heightened stakes, vivid imagery',
  noir:             'Noir — world-weary, shadowed, dry',
  matter_of_fact:   'Matter of fact — mechanical, precise, minimal flourish',
};

// ---------------------------------------------------------------------------
// game.settings registration
// ---------------------------------------------------------------------------

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING.DIAL, {
    name:    'Mischief Dial',
    hint:    'Controls how aggressively the module interprets ambiguous player narration.',
    scope:   'world',
    config:  false,
    type:    String,
    default: 'balanced',
    choices: Object.fromEntries(DIAL_POSITIONS.map(d => [d.value, d.label])),
  });

  game.settings.register(MODULE_ID, SETTING.GLOBAL_LINES, {
    name:    'Global Lines (Hard)',
    hint:    'Hard content limits. Always injected first in every Loremaster context packet.',
    scope:   'world',
    config:  false,
    type:    Array,
    default: [
      'No situations that endanger children. Children may not appear as characters in peril under any circumstances.',
    ],
  });

  game.settings.register(MODULE_ID, SETTING.GLOBAL_VEILS, {
    name:    'Global Veils (Soft)',
    hint:    'Soft content limits. Present in context packet but may be acknowledged rather than strictly excluded.',
    scope:   'world',
    config:  false,
    type:    Array,
    default: [
      'Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines.',
    ],
  });

  game.settings.register(MODULE_ID, SETTING.PRIVATE_LINES, {
    name:    'Private Lines',
    hint:    'Personal hard limits visible only to you. Injected into your context packets.',
    scope:   'client',
    config:  false,
    type:    Array,
    default: [],
  });

  // ── Narrator settings ────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.NARRATION_ENABLED, {
    name:    'Narration Enabled',
    hint:    'When enabled, Claude narrates the consequence of each move result as atmospheric prose.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_MODEL, {
    name:    'Narration Model',
    hint:    'Claude model used for narration. Sonnet produces richer prose; Haiku is faster and cheaper.',
    scope:   'world',
    config:  false,
    type:    String,
    choices: NARRATION_MODELS,
    default: 'claude-sonnet-4-5-20250929',
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_PERSPECTIVE, {
    name:    'Narration Perspective',
    hint:    'Whether the narrator addresses the player as "you" (solo) or by character name (multiplayer).',
    scope:   'world',
    config:  false,
    type:    String,
    choices: NARRATION_PERSPECTIVES,
    default: 'auto',
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_TONE, {
    name:    'Narration Tone',
    hint:    'Narrative voice and style of the narrator.',
    scope:   'world',
    config:  false,
    type:    String,
    choices: NARRATION_TONES,
    default: 'wry',
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_LENGTH, {
    name:    'Narration Length (sentences)',
    hint:    'Target number of sentences per narration. Range: 1–6.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 3,
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_INSTRUCTIONS, {
    name:    'Custom Narrator Instructions',
    hint:    'Additional instructions injected into the narrator system prompt. Leave blank for defaults.',
    scope:   'world',
    config:  false,
    type:    String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTING.NARRATION_MAX_TOKENS, {
    name:    'Narration Max Tokens',
    hint:    'Maximum tokens for each narration response. Default 300 (~3 sentences).',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 300,
  });

  game.settings.register(MODULE_ID, SETTING.NARRATOR_CONTEXT_CARDS, {
    name:    'Narrator Context Cards',
    hint:    'How many recent narrator cards feed each paced narration and oracle follow-up as fiction context. Higher values give the narrator a longer memory horizon at a small token cost per call. Range 1–10, default 3. Scene questions use their own Scene Context Cards setting.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 3,
  });

  // ── Character management settings ─────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.ACTIVE_CHARACTER_ID, {
    name:    'Active Character Actor ID',
    hint:    'The Foundry Actor ID of the active player character. Defaults to game.user.character when blank.',
    scope:   'world',
    config:  false,
    type:    String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTING.CHRONICLE_AUTO_ENTRY, {
    name:    'Chronicle Auto-Entry',
    hint:    'Automatically add a chronicle entry after each narration call.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.CHRONICLE_CONTEXT_COUNT, {
    name:    'Chronicle Entries in Context',
    hint:    'Number of recent chronicle entries included in each context packet. Range: 1–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 5,
  });

  game.settings.register(MODULE_ID, SETTING.CHRONICLE_SALIENCE, {
    name:    'Chronicle Capture Threshold',
    hint:    'Minimum salience for an automatic chronicle entry to be recorded. Conservative by default — fleeting scene beats are skipped; the player can still add smaller notes by hand. One of: trivial, scene, notable, significant, defining.',
    scope:   'world',
    config:  false,
    type:    String,
    choices: SALIENCE_CHOICES,
    default: 'significant',
  });

  game.settings.register(MODULE_ID, SETTING.CHARACTER_CONTEXT_ENABLED, {
    name:    'Character Context in Packet',
    hint:    'Include character state (stats, meters, chronicle) in context packets sent to the narrator.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  // ── Scene interrogation settings ──────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.SCENE_QUERY_ENABLED, {
    name:    'Scene Interrogation Enabled',
    hint:    'When enabled, messages starting with @scene are routed to the narrator as free-form scene questions.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.SCENE_RESPONSE_LENGTH, {
    name:    'Scene Response Length (sentences)',
    hint:    'Target number of sentences for scene interrogation responses. Range: 1–4.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 2,
  });

  game.settings.register(MODULE_ID, SETTING.SCENE_CONTEXT_CARDS, {
    name:    'Scene Context Cards',
    hint:    'Number of recent narration cards included as context for scene interrogation. Range: 1–6.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 3,
  });

  // ── Previously On / recap ────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.AUTO_RECAP_ENABLED, {
    name:    'Auto Recap at Session Start',
    hint:    'When enabled, a campaign recap is automatically posted to chat when a new session begins (after a gap longer than the threshold).',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.SESSION_GAP_HOURS, {
    name:    'Session Gap Threshold (hours)',
    hint:    'Hours of inactivity that define the start of a new session for auto-recap purposes.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 4,
  });

  game.settings.register(MODULE_ID, SETTING.RECAP_GM_ONLY, {
    name:    'Recap GM-Only',
    hint:    'When enabled, only the GM can trigger recap generation via /recap commands.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  // ── World Journal ─────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.WJ_ENABLED, {
    name:    'World Journal Enabled',
    hint:    'Master switch for the World Journal subsystem (folder, !journal commands, panel, context injection).',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_AUTO_DETECT, {
    name:    'World Journal Auto-Detect',
    hint:    'When enabled, the combined detection pass populates lore, threats, factions, and locations from narration. Wired in Phase 4.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_LORE_IN_CONTEXT, {
    name:    'Confirmed Lore in Narrator Context',
    hint:    'When enabled, confirmed World Journal lore is injected into the narrator context as a hard constraint.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_THREATS_IN_CONTEXT, {
    name:    'Active Threats in Narrator Context',
    hint:    'When enabled, active and immediate threats are injected into the narrator context.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_FACTION_IN_CONTEXT, {
    name:    'Faction Landscape in Narrator Context',
    hint:    'When enabled, the faction attitude landscape (up to 3 factions) is injected into the narrator context.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_CONTRADICTION_NOTIFY, {
    name:    'Contradiction Notifications',
    hint:    'When enabled, the GM is notified via chat card when the narrator may have contradicted a confirmed lore entry.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_SESSION_LOG_AUTOWRITE, {
    name:    'Session Log Auto-Write',
    hint:    'When enabled, a session-log page is written automatically at session end.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.WJ_LORE_SALIENCE, {
    name:    'Lore Capture Threshold',
    hint:    'Minimum salience for an auto-detected lore entry to be recorded. Conservative by default — transient scene beats are dropped so Lore holds durable world facts. One of: trivial, scene, notable, significant, defining.',
    scope:   'world',
    config:  false,
    type:    String,
    choices: SALIENCE_CHOICES,
    default: 'significant',
  });

  game.settings.register(MODULE_ID, SETTING.WJ_THREAT_SALIENCE, {
    name:    'Threat Capture Threshold',
    hint:    'Minimum salience for an auto-detected threat to be recorded. Conservative by default — scene-level complications are dropped so Threats holds campaign-level dangers. One of: trivial, scene, notable, significant, defining.',
    scope:   'world',
    config:  false,
    type:    String,
    choices: SALIENCE_CHOICES,
    default: 'significant',
  });

  // ── Pacing classifier ────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTING.PACING_ENABLED, {
    name:    'Pacing Classifier Enabled',
    hint:    'Master switch. When enabled, a Haiku pre-classifier decides whether undecorated chat input should trigger a move, be handled as narration, or be narrated with an inline move suggestion. When disabled, every input routes to the move interpreter as before.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DENSITY_WINDOW, {
    name:    'Pacing Density Window',
    hint:    'Number of recent inputs considered for the recent-move-density signal. Higher values smooth pacing, lower values react faster. Range: 3–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 5,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DIAL_COMBAT, {
    name:    'Pacing Dial — Combat',
    hint:    'How move-leaning combat scenes should be. 10 = almost every input is a move. 0 = almost never.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: PACING_DEFAULTS.combat,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DIAL_INVESTIGATION, {
    name:    'Pacing Dial — Investigation',
    hint:    'How move-leaning investigation scenes should be. 0–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: PACING_DEFAULTS.investigation,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DIAL_EXPLORATION, {
    name:    'Pacing Dial — Exploration',
    hint:    'How move-leaning exploration scenes should be. 0–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: PACING_DEFAULTS.exploration,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DIAL_SOCIAL, {
    name:    'Pacing Dial — Social',
    hint:    'How move-leaning social scenes should be. Default 5 — pressing a connection on intent or stakes reads as a move; idle chat reads as narrative. 0–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: PACING_DEFAULTS.social,
  });

  game.settings.register(MODULE_ID, SETTING.PACING_DIAL_DOWNTIME, {
    name:    'Pacing Dial — Downtime',
    hint:    'How move-leaning downtime scenes should be. Default 1 — downtime is mostly narrative. 0–10.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: PACING_DEFAULTS.downtime,
  });

  // ── Fact continuity — see docs/fact-continuity/fact-continuity-scope.md §12 ──────────────

  game.settings.register(MODULE_ID, SETTING.FC_ENABLED, {
    name:    'Fact Continuity Enabled',
    hint:    'Master switch. When enabled, the narrator records scene truths and current state via a structured sidecar, and the active-scene ledger is fed back into subsequent narrator calls.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_LEDGER_IN_CONTEXT, {
    name:    'Inject Active-Scene Ledger Into Narrator Context',
    hint:    'When enabled, the narrator system prompt receives a Section 6.5 block listing binding truths and current state for in-scope subjects. Has no effect when Fact Continuity is disabled.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_SIDECAR_REQUIRED, {
    name:    'Sidecar Required',
    hint:    'When enabled, the narrator response is expected to contain a fenced JSON sidecar after every reply. When disabled, missing sidecars are tolerated silently (rare in practice).',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_MAX_LEDGER_TOKENS, {
    name:    'Max Ledger Tokens',
    hint:    'Soft cap on the size of the active-scene ledger block in the narrator system prompt. State entries are truncated first when the cap is exceeded; binding truths are never dropped.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 400,
  });

  game.settings.register(MODULE_ID, SETTING.FC_CONSISTENCY_CHECK, {
    name:    'Consistency Check (experimental)',
    hint:    'After every narration, run a Haiku audit pass that checks the prose against the active-scene ledger. High-confidence contradictions surface on the existing GM-only Narrative Review card. Adds ~$0.0004 and 200–500ms per narration; off by default.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING.FC_SCENE_FRAME, {
    name:    'Scene Frame',
    hint:    'The narrator maintains a per-scene snapshot — where the scene is set, who is present, what is happening — emitted with every response and injected into every narrator call. Subjects in the frame keep their ledger entries and entity cards in scope even on turns that don\'t name them. Prevents location/premise drift; on by default.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  // Fact-continuity §20 — ship positioning. Four settings gate the full
  // feature: master toggle, the set_a_course auto-update, the sector-
  // Scene Token affordance, and the Token snap radius.
  game.settings.register(MODULE_ID, SETTING.FC_SHIP_POSITIONING, {
    name:    'Ship Positioning',
    hint:    'Track the command vehicle’s position (sector / planet / nearest settlement) and surface it in the narrator’s system prompt. Position updates from `!at`, non-miss `set_a_course`, narrator sidecar, and (when enabled) sector-Scene Token drag.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_SHIP_AUTO_MOVE, {
    name:    'Auto-Move Ship on Set a Course',
    hint:    'When enabled, a strong / weak hit on Set a Course updates the command vehicle’s position to the destination named in the player’s narration. Disable to force manual `!at` after every travel resolution. Has no effect when Ship Positioning is disabled.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_SHIP_TOKEN_ENABLED, {
    name:    'Sector-Scene Ship Token',
    hint:    'Place a Token representing the command vehicle on the sector Scene. Dragging the Token onto a settlement Note pin fires the same Set a Course pipeline a chat-typed move would. The Token snaps back to its previous position on a miss.',
    scope:   'world',
    config:  false,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTING.FC_SHIP_TOKEN_SNAP_RADIUS, {
    name:    'Ship Token Snap Radius (grid cells)',
    hint:    'How close the Token must come to a settlement Note pin to count as a destination drop. 0 = exact-cell overlap; 2 = forgiving. Default 1.',
    scope:   'world',
    config:  false,
    type:    Number,
    default: 1,
  });
}

// ---------------------------------------------------------------------------
// Settings helpers — read
// ---------------------------------------------------------------------------

function getDial()         { return game.settings.get(MODULE_ID, SETTING.DIAL); }
function getGlobalLines()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_LINES) ?? []; }
function getGlobalVeils()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_VEILS) ?? []; }
function getPrivateLines() { return game.settings.get(MODULE_ID, SETTING.PRIVATE_LINES) ?? []; }

// ---------------------------------------------------------------------------
// Narrator settings helpers — read
// ---------------------------------------------------------------------------

function getNarrationEnabled()      { return game.settings.get(MODULE_ID, SETTING.NARRATION_ENABLED)      ?? true; }
function getNarrationModel()        { return game.settings.get(MODULE_ID, SETTING.NARRATION_MODEL)        ?? 'claude-sonnet-4-5-20250929'; }
function getNarrationPerspective()  { return game.settings.get(MODULE_ID, SETTING.NARRATION_PERSPECTIVE)  ?? 'auto'; }
function getNarrationTone()         { return game.settings.get(MODULE_ID, SETTING.NARRATION_TONE)         ?? 'wry'; }
function getNarrationLength()       { return game.settings.get(MODULE_ID, SETTING.NARRATION_LENGTH)       ?? 3; }
function getNarrationInstructions() { return game.settings.get(MODULE_ID, SETTING.NARRATION_INSTRUCTIONS) ?? ''; }
function getNarrationMaxTokens()    { return game.settings.get(MODULE_ID, SETTING.NARRATION_MAX_TOKENS)   ?? 300; }
export function getNarratorContextCards() {
  const v = Number(game.settings.get(MODULE_ID, SETTING.NARRATOR_CONTEXT_CARDS));
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(10, Math.round(v)));
}

// ── Previously On / recap ────────────────────────────────────────────────
function getAutoRecapEnabled() { return game.settings.get(MODULE_ID, SETTING.AUTO_RECAP_ENABLED) ?? true; }
function getSessionGapHours()  { return game.settings.get(MODULE_ID, SETTING.SESSION_GAP_HOURS)  ?? 4; }
function getRecapGmOnly()      { return game.settings.get(MODULE_ID, SETTING.RECAP_GM_ONLY)      ?? true; }

// ── Pacing classifier ────────────────────────────────────────────────────
function getPacingEnabled()       { return game.settings.get(MODULE_ID, SETTING.PACING_ENABLED) ?? true; }
function getPacingDensityWindow() { return game.settings.get(MODULE_ID, SETTING.PACING_DENSITY_WINDOW) ?? 5; }
function getPacingDials() {
  return {
    combat:        game.settings.get(MODULE_ID, SETTING.PACING_DIAL_COMBAT)        ?? PACING_DEFAULTS.combat,
    investigation: game.settings.get(MODULE_ID, SETTING.PACING_DIAL_INVESTIGATION) ?? PACING_DEFAULTS.investigation,
    exploration:   game.settings.get(MODULE_ID, SETTING.PACING_DIAL_EXPLORATION)   ?? PACING_DEFAULTS.exploration,
    social:        game.settings.get(MODULE_ID, SETTING.PACING_DIAL_SOCIAL)        ?? PACING_DEFAULTS.social,
    downtime:      game.settings.get(MODULE_ID, SETTING.PACING_DIAL_DOWNTIME)      ?? PACING_DEFAULTS.downtime,
  };
}

// ── Fact continuity ──────────────────────────────────────────────────────
export function getFactContinuityEnabled()        { return game.settings.get(MODULE_ID, SETTING.FC_ENABLED)             ?? true; }
export function getFactContinuityLedgerInContext(){ return game.settings.get(MODULE_ID, SETTING.FC_LEDGER_IN_CONTEXT)   ?? true; }
export function getFactContinuitySidecarRequired(){ return game.settings.get(MODULE_ID, SETTING.FC_SIDECAR_REQUIRED)    ?? true; }
export function getFactContinuityMaxLedgerTokens(){ return game.settings.get(MODULE_ID, SETTING.FC_MAX_LEDGER_TOKENS)   ?? 400; }
export function getFactContinuityConsistencyCheck(){ return game.settings.get(MODULE_ID, SETTING.FC_CONSISTENCY_CHECK)  ?? false; }
export function getFactContinuitySceneFrame()      { return game.settings.get(MODULE_ID, SETTING.FC_SCENE_FRAME)        ?? true; }

// Ship positioning (§20) — feature-gated via a master toggle plus three
// per-trigger toggles. All four default to "on" so a fresh world that
// upgrades to this version gets the full experience without configuration.
// Reads tolerate the settings being unregistered (unit tests, early init).
export function getShipPositioningEnabled() {
  try { return game.settings.get(MODULE_ID, SETTING.FC_SHIP_POSITIONING) !== false; } catch { return true; }
}
export function getShipAutoMoveOnCourse() {
  try { return game.settings.get(MODULE_ID, SETTING.FC_SHIP_AUTO_MOVE) !== false; } catch { return true; }
}
export function getShipTokenEnabled() {
  try { return game.settings.get(MODULE_ID, SETTING.FC_SHIP_TOKEN_ENABLED) !== false; } catch { return true; }
}
export function getShipTokenSnapRadius() {
  try {
    const v = Number(game.settings.get(MODULE_ID, SETTING.FC_SHIP_TOKEN_SNAP_RADIUS));
    if (!Number.isFinite(v) || v < 0) return 1;
    return v;
  } catch { return 1; }
}

// ---------------------------------------------------------------------------
// Settings helpers — write (always sync to campaignState after writing)
// ---------------------------------------------------------------------------

async function setDial(val) {
  await game.settings.set(MODULE_ID, SETTING.DIAL, val);
  // Dial doesn't live in campaignState.safety — no sync needed
}

async function setGlobalLines(arr) {
  await game.settings.set(MODULE_ID, SETTING.GLOBAL_LINES, arr);
  await syncSafetyToCampaignState();
}

async function setGlobalVeils(arr) {
  await game.settings.set(MODULE_ID, SETTING.GLOBAL_VEILS, arr);
  await syncSafetyToCampaignState();
}

async function setPrivateLines(arr) {
  await game.settings.set(MODULE_ID, SETTING.PRIVATE_LINES, arr);
  await syncSafetyToCampaignState();
}

// ---------------------------------------------------------------------------
// Safety sync — bridges game.settings → campaignState.safety
// ---------------------------------------------------------------------------

/**
 * Sync the current safety settings into campaignState.safety so that
 * assembler.js / safety.js always have live values.
 *
 * Called automatically after every write to Lines/Veils/PrivateLines,
 * and once from registerSettingsHooks() on the ready hook to initialise.
 *
 * Private Lines are stored in campaignState as an array of
 * { playerId, lines } objects — one entry per player. Each client only
 * updates its own entry; other players' entries are preserved.
 * This matches the shape that safety.js's resolvePrivateLines() expects.
 */
async function syncSafetyToCampaignState() {
  // campaignState is world-scoped — only the GM can write it.
  // Non-GM players store their Private Lines in client-scoped game.settings;
  // the assembler reads safety config from campaignState which the GM client
  // keeps up to date. Private lines for non-GM players reach the assembler via
  // the client-scoped read in getSafetyConfig() when narration runs locally.
  if (!game.user?.isGM) return;

  try {
    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    if (!campaignState.safety) campaignState.safety = {};

    // Global Lines and Veils — GM-controlled, world-scoped
    campaignState.safety.lines = getGlobalLines();
    campaignState.safety.veils = getGlobalVeils();

    // Private Lines — client-scoped, keyed by player ID in campaignState
    // Each player only writes their own entry; others are preserved
    const userId = game.user?.id;
    if (userId) {
      const existing = campaignState.safety.privateLines ?? [];
      const others   = existing.filter(e => e.playerId !== userId);
      const myLines  = getPrivateLines();

      campaignState.safety.privateLines = myLines.length > 0
        ? [...others, { playerId: userId, lines: myLines }]
        : others;   // Don't write an empty entry — avoids noise in the state
    }

    await game.settings.set(MODULE_ID, 'campaignState', campaignState);
  } catch (err) {
    // Non-Foundry context (tests) or settings not yet available
    console.warn(`${MODULE_ID} | syncSafetyToCampaignState: could not sync:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// X-Card hook
// ---------------------------------------------------------------------------

function registerXCardHook() {
  Hooks.on('chatMessage', (chatLog, message, _chatData) => {
    if (message.trim().toLowerCase() !== '!x') return true;

    suppressScene();

    ChatMessage.create({
      content: `
        <div class="starforged-move-card xcard-card">
          <div class="move-header">
            <span class="move-type">X-Card</span>
          </div>
          <div class="move-body">
            <p class="xcard-message">
              Scene paused. Current content is suppressed.<br>
              The story will redirect at the next narration beat.
            </p>
          </div>
        </div>
      `.trim(),
      flags: { [MODULE_ID]: { type: 'xcard' } },
    });

    return false;
  });
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Settings Panel
// ---------------------------------------------------------------------------

const { ApplicationV2 } = foundry.applications.api;

export class SettingsPanelApp extends ApplicationV2 {

  static #instance = null;
  #activeTab = 'safety';

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-settings`,
    classes: [MODULE_ID, 'settings-panel'],
    tag:     'div',
    window: {
      title:       'Starforged Companion — Settings',
      resizable:   false,
      minimizable: true,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      switchTab:              SettingsPanelApp.#onSwitchTab,
      addLine:                SettingsPanelApp.#onAddLine,
      removeLine:             SettingsPanelApp.#onRemoveLine,
      addVeil:                SettingsPanelApp.#onAddVeil,
      removeVeil:             SettingsPanelApp.#onRemoveVeil,
      addPrivateLine:         SettingsPanelApp.#onAddPrivateLine,
      removePrivateLine:      SettingsPanelApp.#onRemovePrivateLine,
      setDial:                     SettingsPanelApp.#onSetDial,
      saveNarratorSettings:        SettingsPanelApp.#onSaveNarratorSettings,
      savePacingSettings:          SettingsPanelApp.#onSavePacingSettings,
      saveFactContinuitySettings:  SettingsPanelApp.#onSaveFactContinuitySettings,
      saveApiKeys:                 SettingsPanelApp.#onSaveApiKeys,
      saveAudioSettings:           SettingsPanelApp.#onSaveAudioSettings,
      refreshAudioBudget:          SettingsPanelApp.#onRefreshAudioBudget,
    },
  };

  static open() {
    if (!SettingsPanelApp.#instance) {
      SettingsPanelApp.#instance = new SettingsPanelApp();
    }
    SettingsPanelApp.#instance.render({ force: true });
    return SettingsPanelApp.#instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async _prepareContext(_options) {
    const campaignState = (() => {
      try { return game.settings.get(MODULE_ID, 'campaignState') ?? {}; }
      catch { return {}; }
    })();

    return {
      activeTab:             this.#activeTab,
      isGM:                  game.user.isGM,
      dial:                  getDial(),
      dialPositions:         DIAL_POSITIONS,
      globalLines:           getGlobalLines(),
      globalVeils:           getGlobalVeils(),
      privateLines:          getPrivateLines(),
      narrationEnabled:      getNarrationEnabled(),
      narrationModel:        getNarrationModel(),
      narrationPerspective:  getNarrationPerspective(),
      narrationTone:         getNarrationTone(),
      narrationLength:       getNarrationLength(),
      narrationInstructions: getNarrationInstructions(),
      narrationMaxTokens:    getNarrationMaxTokens(),
      narratorContextCards:  getNarratorContextCards(),
      narrationModels:       NARRATION_MODELS,
      narrationPerspectives: NARRATION_PERSPECTIVES,
      narrationTones:        NARRATION_TONES,
      autoRecapEnabled:      getAutoRecapEnabled(),
      sessionGapHours:       getSessionGapHours(),
      recapGmOnly:           getRecapGmOnly(),
      pacingEnabled:         getPacingEnabled(),
      pacingDensityWindow:   getPacingDensityWindow(),
      pacingDials:           getPacingDials(),
      pacingSceneOverride:   campaignState?.pacing?.sceneOverride ?? null,
      factContinuity: {
        enabled:           getFactContinuityEnabled(),
        ledgerInContext:   getFactContinuityLedgerInContext(),
        sidecarRequired:   getFactContinuitySidecarRequired(),
        maxLedgerTokens:   getFactContinuityMaxLedgerTokens(),
        consistencyCheck:  getFactContinuityConsistencyCheck(),
        sceneFrame:        getFactContinuitySceneFrame(),
      },
      sessionNumber:         campaignState.sessionNumber         ?? 0,
      currentSessionId:      campaignState.currentSessionId      ?? '',
      lastSessionTimestamp:  campaignState.lastSessionTimestamp  ?? null,
      apiKeys: game.user.isGM ? {
        claudeKeySet:     !!game.settings.get(MODULE_ID, 'claudeApiKey'),
        openRouterKeySet: !!game.settings.get(MODULE_ID, 'openRouterApiKey'),
        elevenLabsKeySet: !!game.settings.get(MODULE_ID, 'elevenLabsApiKey'),
      } : null,
      audio: {
        enabled:         (() => { try { return game.settings.get(MODULE_ID, 'audio.enabled') === true; } catch { return false; } })(),
        narratorVoiceId: (() => { try { return game.settings.get(MODULE_ID, 'audio.narratorVoiceId') ?? ''; } catch { return ''; } })(),
        npcVoiceId:      (() => { try { return game.settings.get(MODULE_ID, 'audio.npcVoiceId') ?? ''; } catch { return ''; } })(),
        modelId:         (() => { try { return game.settings.get(MODULE_ID, 'audio.modelId') ?? 'eleven_flash_v2_5'; } catch { return 'eleven_flash_v2_5'; } })(),
        speed:           (() => { try { return Number(game.settings.get(MODULE_ID, 'audio.speed') ?? 1.0); } catch { return 1.0; } })(),
        clientEnabled:   (() => { try { return game.settings.get(MODULE_ID, 'audio.clientEnabled') === true; } catch { return false; } })(),
        autoplay:        (() => { try { return game.settings.get(MODULE_ID, 'audio.autoplay') === true; } catch { return false; } })(),
        volume:          (() => { try { return Number(game.settings.get(MODULE_ID, 'audio.volume') ?? 0.8); } catch { return 0.8; } })(),
      },
    };
  }

  async _renderHTML(context, _options) {
    const tabs = [
      { id: 'safety',   label: 'Safety'   },
      { id: 'mischief', label: 'Mischief' },
      { id: 'narrator', label: 'Narrator' },
      { id: 'audio',    label: 'Audio'    },
      { id: 'about',    label: 'About'    },
    ];

    const tabNav = tabs.map(t => `
      <button class="settings-tab-btn ${t.id === context.activeTab ? 'is-active' : ''}"
              data-action="switchTab" data-tab="${t.id}">
        ${t.label}
      </button>
    `).join('');

    let paneHtml;
    switch (context.activeTab) {
      case 'safety':   paneHtml = this.#renderSafetyPane(context);   break;
      case 'mischief': paneHtml = this.#renderMischiefPane(context); break;
      case 'narrator': paneHtml = this.#renderNarratorPane(context); break;
      case 'audio':    paneHtml = this.#renderAudioPane(context);    break;
      case 'about':    paneHtml = this.#renderAboutPane(context);    break;
    }

    const html = `
      <div class="sf-settings-panel">
        <nav class="settings-tab-nav">${tabNav}</nav>
        <div class="settings-pane">${paneHtml}</div>
      </div>
    `;

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  // -----------------------------------------------------------------------
  // Pane renderers
  // -----------------------------------------------------------------------

  #renderSafetyPane(ctx) {
    const renderList = (items, removeAction, addAction, inputName, placeholder, label, description) => `
      <div class="safety-list-block">
        <div class="safety-block-header">
          <strong>${label}</strong>
          <span class="safety-block-desc">${description}</span>
        </div>
        <ul class="safety-item-list">
          ${items.length
            ? items.map((item, i) => `
              <li class="safety-item">
                <span class="safety-item-text">${item}</span>
                ${ctx.isGM || addAction.includes('Private')
                  ? `<button class="settings-btn btn-remove-item" data-action="${removeAction}"
                             data-index="${i}" title="Remove">✕</button>`
                  : ''}
              </li>`).join('')
            : '<li class="safety-item safety-item-empty">None set.</li>'
          }
        </ul>
        ${ctx.isGM || addAction.includes('Private') ? `
          <div class="safety-add-row">
            <input class="settings-input" name="${inputName}" type="text"
                   placeholder="${placeholder}" maxlength="200">
            <button class="settings-btn btn-add-item" data-action="${addAction}">Add</button>
          </div>
        ` : '<p class="safety-readonly-note">Set by GM.</p>'}
      </div>
    `;

    const gmNote = ctx.isGM ? '' : `
      <p class="safety-gm-note">
        Global Lines and Veils are set by the GM. Your private Lines are visible only to you.
      </p>
    `;

    return `
      <div class="safety-pane">
        ${gmNote}
        ${renderList(
          ctx.globalLines, 'removeLine', 'addLine', 'newLine',
          'No situations that endanger…',
          'Lines — Hard Limits',
          'Absolute. Content matching a Line will never appear regardless of other settings.',
        )}
        ${renderList(
          ctx.globalVeils, 'removeVeil', 'addVeil', 'newVeil',
          'Children as plot-significant characters…',
          'Veils — Soft Limits',
          'Present in context packets. Content will be redirected, not strictly excluded.',
        )}
        <hr class="safety-divider">
        ${renderList(
          ctx.privateLines, 'removePrivateLine', 'addPrivateLine', 'newPrivateLine',
          'My personal hard limit…',
          'Private Lines — Visible only to you',
          'Stored on this client. Never shared with GM or other players.',
        )}
        <div class="safety-xcard-note">
          <strong>X-Card:</strong> Type <code>!x</code> in chat at any time to immediately suppress the current scene.
        </div>
      </div>
    `;
  }

  #renderMischiefPane(ctx) {
    const dialHtml = ctx.dialPositions.map(pos => `
      <label class="dial-option ${pos.value === ctx.dial ? 'is-selected' : ''}"
             data-action="setDial" data-value="${pos.value}"
             role="radio" aria-checked="${pos.value === ctx.dial}" tabindex="0">
        <div class="dial-option-header">
          <span class="dial-radio ${pos.value === ctx.dial ? 'is-checked' : ''}"></span>
          <span class="dial-label">${pos.label}</span>
          ${pos.value === ctx.dial ? '<span class="dial-current-badge">Current</span>' : ''}
        </div>
        <p class="dial-description">${pos.description}</p>
      </label>
    `).join('');

    const gmNote = ctx.isGM ? '' : `
      <p class="dial-player-note">Mischief and pacing are controlled by the GM.</p>
    `;

    const dis = ctx.isGM ? '' : 'disabled';
    const dials = ctx.pacingDials ?? {};
    const dialRow = (name, label, value) => `
      <div class="pacing-dial-row">
        <label class="pacing-dial-label" for="sf-pacing-${name}">${label}</label>
        <input class="settings-input pacing-dial-input" id="sf-pacing-${name}"
               name="pacing.dial.${name}" type="number" min="0" max="10" step="1"
               value="${value}" ${dis}>
      </div>
    `;

    const overrideLabel = ctx.pacingSceneOverride?.label
      ? `${ctx.pacingSceneOverride.label} (${ctx.pacingSceneOverride.modifier >= 0 ? '+' : ''}${ctx.pacingSceneOverride.modifier})`
      : 'none';

    return `
      <div class="mischief-pane">
        ${gmNote}
        <h4 class="mischief-section-heading">Mischief Dial</h4>
        <div class="dial-options ${!ctx.isGM ? 'dial-readonly' : ''}">
          ${dialHtml}
        </div>
        <div class="dial-ceiling-note">
          <strong>Note:</strong> Safety configuration is always a hard ceiling on the mischief layer.
          Active Lines and Veils are injected before any mischief is applied, regardless of dial setting.
        </div>

        <hr class="mischief-divider">
        <h4 class="mischief-section-heading">Pacing Classifier</h4>
        <p class="pacing-pane-intro">
          When enabled, a small Haiku call decides whether each undecorated chat input should
          trigger a move, be handled as pure narration, or end with an inline move suggestion.
          Dials below set how move-leaning each scene type should be on a 0–10 scale.
        </p>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="pacing.enabled"
                   ${ctx.pacingEnabled ? 'checked' : ''} ${dis}>
            Enable pacing classifier
          </label>
        </div>
        <div class="pacing-dials-grid">
          ${dialRow('combat',        'Combat',        dials.combat        ?? PACING_DEFAULTS.combat)}
          ${dialRow('investigation', 'Investigation', dials.investigation ?? PACING_DEFAULTS.investigation)}
          ${dialRow('exploration',   'Exploration',   dials.exploration   ?? PACING_DEFAULTS.exploration)}
          ${dialRow('social',        'Social',        dials.social        ?? PACING_DEFAULTS.social)}
          ${dialRow('downtime',      'Downtime',      dials.downtime      ?? PACING_DEFAULTS.downtime)}
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label" for="sf-pacing-window">Density window</label>
          <input class="settings-input pacing-dial-input" id="sf-pacing-window"
                 name="pacing.densityWindow" type="number" min="3" max="10" step="1"
                 value="${ctx.pacingDensityWindow ?? 5}" ${dis}>
          <span class="pacing-field-hint">Number of recent inputs considered for pacing recovery. 3–10.</span>
        </div>
        <p class="pacing-override-line">
          <strong>Scene override:</strong> ${overrideLabel}
          <span class="pacing-field-hint">— change with <code>!pace hot</code>, <code>!pace quiet</code>, or <code>!pace clear</code>.</span>
        </p>
        ${ctx.isGM ? `
          <div class="pacing-actions">
            <button class="settings-btn btn-save-pacing" data-action="savePacingSettings">Save Pacing Settings</button>
          </div>
        ` : ''}

        <hr class="mischief-divider">
        <h4 class="mischief-section-heading">Fact Continuity</h4>
        <p class="pacing-pane-intro">
          The narrator records binding scene truths and current state via a structured sidecar
          attached to every response. The active-scene ledger is fed back into subsequent
          narrator calls so established facts stay consistent.
        </p>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="factContinuity.enabled"
                   ${ctx.factContinuity.enabled ? 'checked' : ''} ${dis}>
            Enable fact continuity
          </label>
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="factContinuity.ledgerInContext"
                   ${ctx.factContinuity.ledgerInContext ? 'checked' : ''} ${dis}>
            Inject the active-scene ledger into the narrator system prompt
          </label>
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="factContinuity.sidecarRequired"
                   ${ctx.factContinuity.sidecarRequired ? 'checked' : ''} ${dis}>
            Require a sidecar on every narrator response
          </label>
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label" for="sf-fc-max-tokens">Max ledger tokens</label>
          <input class="settings-input pacing-dial-input" id="sf-fc-max-tokens"
                 name="factContinuity.maxLedgerTokens" type="number" min="100" max="2000" step="50"
                 value="${ctx.factContinuity.maxLedgerTokens}" ${dis}>
          <span class="pacing-field-hint">Soft cap on the Section 6.5 block. State drops first when the cap is exceeded; truths are never dropped.</span>
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="factContinuity.sceneFrame"
                   ${ctx.factContinuity.sceneFrame ? 'checked' : ''} ${dis}>
            Scene frame
          </label>
          <span class="pacing-field-hint">The narrator maintains a per-scene snapshot (where / who is present / what is happening) injected into every call. Subjects in the frame stay in scope on turns that don't name them. Prevents location and premise drift.</span>
        </div>
        <div class="pacing-field">
          <label class="pacing-field-label">
            <input type="checkbox" name="factContinuity.consistencyCheck"
                   ${ctx.factContinuity.consistencyCheck ? 'checked' : ''} ${dis}>
            Consistency check (experimental)
          </label>
          <span class="pacing-field-hint">Run a Haiku audit pass after every narration. High-confidence contradictions surface on the GM Narrative Review card. ~$0.0004 and 200–500ms per call; off by default.</span>
        </div>
        ${ctx.isGM ? `
          <div class="pacing-actions">
            <button class="settings-btn btn-save-pacing" data-action="saveFactContinuitySettings">Save Fact Continuity Settings</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  #renderNarratorPane(ctx) {
    const renderSelect = (name, value, options, disabled = false) => {
      const opts = Object.entries(options)
        .map(([v, label]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`)
        .join('');
      return `<select class="settings-input" name="${name}" ${disabled ? 'disabled' : ''}>${opts}</select>`;
    };

    const gmOnly = !ctx.isGM;
    const dis    = gmOnly ? 'disabled' : '';

    return `
      <div class="narrator-pane">
        ${gmOnly ? '<p class="safety-gm-note">Narrator settings are controlled by the GM.</p>' : ''}
        <div class="narrator-field">
          <label class="narrator-field-label">
            <input type="checkbox" name="narrationEnabled" ${ctx.narrationEnabled ? 'checked' : ''} ${dis}>
            Enable narration
          </label>
          <span class="narrator-field-hint">When enabled, Claude narrates the consequence of each move as atmospheric prose.</span>
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Model</label>
          ${renderSelect('narrationModel', ctx.narrationModel, ctx.narrationModels, gmOnly)}
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Perspective</label>
          ${renderSelect('narrationPerspective', ctx.narrationPerspective, ctx.narrationPerspectives, gmOnly)}
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Tone</label>
          ${renderSelect('narrationTone', ctx.narrationTone, ctx.narrationTones, gmOnly)}
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Length (sentences)</label>
          <input class="settings-input narrator-number-input" name="narrationLength"
                 type="number" min="1" max="6" value="${ctx.narrationLength}" ${dis}>
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Context cards (memory horizon)</label>
          <input class="settings-input narrator-number-input" name="narratorContextCards"
                 type="number" min="1" max="10" value="${ctx.narratorContextCards}" ${dis}>
          <span class="narrator-field-hint">How many recent narrator cards each narration sees as fiction context. Raise if the narrator forgets recent events; small token cost per call. Default 3.</span>
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Custom instructions</label>
          <textarea class="settings-input narrator-instructions" name="narrationInstructions"
                    rows="3" maxlength="500" placeholder="Additional instructions for the narrator…"
                    ${dis}>${ctx.narrationInstructions}</textarea>
        </div>
        <hr class="narrator-divider">
        <h4 class="narrator-section-heading">Previously On / Recap</h4>
        <div class="narrator-field">
          <label class="narrator-field-label">
            <input type="checkbox" name="autoRecapEnabled" ${ctx.autoRecapEnabled ? 'checked' : ''} ${dis}>
            Auto recap at session start
          </label>
          <span class="narrator-field-hint">Post a campaign recap to chat automatically when a new session begins.</span>
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">Session gap (hours)</label>
          <input class="settings-input narrator-number-input" name="sessionGapHours"
                 type="number" min="1" max="48" value="${ctx.sessionGapHours}" ${dis}>
          <span class="narrator-field-hint">Hours of inactivity before a world load is treated as a new session.</span>
        </div>
        <div class="narrator-field">
          <label class="narrator-field-label">
            <input type="checkbox" name="recapGmOnly" ${ctx.recapGmOnly ? 'checked' : ''} ${dis}>
            GM-only recap commands
          </label>
          <span class="narrator-field-hint">Restrict !recap commands to the GM to prevent API call spam in multiplayer.</span>
        </div>
        ${ctx.isGM ? `
          <div class="narrator-actions">
            <button class="settings-btn btn-save-narrator" data-action="saveNarratorSettings">Save Narrator Settings</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Audio pane — docs/audio/audio-narration-scope.md §5
  //
  // GM section: world-scoped voice/model/speed/master toggle + budget
  // refresh button. Player section: per-client enable / volume / autoplay.
  // -----------------------------------------------------------------------
  #renderAudioPane(ctx = {}) {
    const a = ctx.audio ?? {};
    const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const MODEL_OPTIONS = [
      { id: 'eleven_flash_v2_5',      label: 'Flash v2.5 — fastest, lowest cost'   },
      { id: 'eleven_turbo_v2_5',      label: 'Turbo v2.5 — balanced'                },
      { id: 'eleven_multilingual_v2', label: 'Multilingual v2 — long-form quality'  },
      { id: 'eleven_v3',              label: 'Eleven v3 — highest expressiveness'   },
    ];

    const modelOptionsHtml = MODEL_OPTIONS.map(m => `
      <option value="${escAttr(m.id)}" ${a.modelId === m.id ? 'selected' : ''}>${m.label}</option>
    `).join('');

    const gmBlock = ctx.isGM ? `
      <fieldset class="settings-fieldset">
        <legend>World audio settings (GM)</legend>
        <p class="settings-field-hint">
          These controls are shared across all players. Voice IDs come from your
          ElevenLabs voice library — paste the ID, not the display name.
        </p>
        <div class="settings-field">
          <label class="settings-field-label">
            <input type="checkbox" name="audio.enabled" ${a.enabled ? 'checked' : ''}>
            Enable audio narration for this world
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="sf-audio-narrator-voice">Narrator voice ID</label>
          <input class="settings-input" type="text" id="sf-audio-narrator-voice"
                 name="audio.narratorVoiceId" value="${escAttr(a.narratorVoiceId)}"
                 placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" autocomplete="off" spellcheck="false">
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="sf-audio-npc-voice">NPC voice ID</label>
          <input class="settings-input" type="text" id="sf-audio-npc-voice"
                 name="audio.npcVoiceId" value="${escAttr(a.npcVoiceId)}"
                 placeholder="e.g. pNInz6obpgDQGcFmaJgB" autocomplete="off" spellcheck="false">
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="sf-audio-model">Model</label>
          <select class="settings-input" id="sf-audio-model" name="audio.modelId">
            ${modelOptionsHtml}
          </select>
        </div>
        <div class="settings-field">
          <label class="settings-field-label" for="sf-audio-speed">Playback speed: ${Number(a.speed).toFixed(2)}×</label>
          <input class="settings-input" type="range" id="sf-audio-speed"
                 name="audio.speed" min="0.7" max="1.5" step="0.05"
                 value="${escAttr(a.speed)}">
        </div>
        <div class="settings-field">
          <button class="settings-btn" data-action="refreshAudioBudget">
            ⟳ Check ElevenLabs usage
          </button>
          <p class="settings-field-hint">
            Shows characters used / limit in a toast. Read-only; no hard cutoff.
          </p>
        </div>
      </fieldset>
    ` : `
      <p class="safety-readonly-note">
        Voice and model selection are configured by the GM.
      </p>
    `;

    return `
      <div class="audio-pane">
        ${gmBlock}

        <fieldset class="settings-fieldset">
          <legend>Your client</legend>
          <p class="settings-field-hint">
            Each player decides whether audio plays on their own client. The
            ElevenLabs API key is entered in the About tab.
          </p>
          <div class="settings-field">
            <label class="settings-field-label">
              <input type="checkbox" name="audio.clientEnabled"
                     ${a.clientEnabled ? 'checked' : ''}>
              Enable audio narration on this client
            </label>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="sf-audio-volume">
              Volume: ${Math.round(Number(a.volume) * 100)}%
            </label>
            <input class="settings-input" type="range" id="sf-audio-volume"
                   name="audio.volume" min="0" max="1" step="0.05"
                   value="${escAttr(a.volume)}">
          </div>
          <div class="settings-field">
            <label class="settings-field-label">
              <input type="checkbox" name="audio.autoplay"
                     ${a.autoplay ? 'checked' : ''}>
              Auto-play narrator audio when a card appears
            </label>
            <p class="settings-field-hint">
              Off by default. Browsers require a user gesture before audio can
              play — the first card after a page load shows a brief
              "click anywhere" overlay.
            </p>
          </div>
        </fieldset>

        <div class="settings-actions">
          <button class="settings-btn" data-action="saveAudioSettings">Save Audio Settings</button>
        </div>
      </div>
    `;
  }

  #renderAboutPane(ctx = {}) {
    const sessionLabel = ctx.sessionNumber
      ? `#${ctx.sessionNumber} — ${ctx.currentSessionId ? ctx.currentSessionId.slice(0, 8) : 'not started'}`
      : 'not started';

    const sessionStarted = ctx.lastSessionTimestamp
      ? new Date(ctx.lastSessionTimestamp).toLocaleString()
      : '—';

    return `
      <div class="about-pane">
        <h3 class="about-module-name">Starforged Companion</h3>
        <p class="about-desc">
          Move interpretation, narration, entity tracking, and art generation for Ironsworn: Starforged.
        </p>
        <dl class="about-fields">
          <div class="about-field">
            <dt>Current session</dt>
            <dd>${sessionLabel}</dd>
          </div>
          <div class="about-field">
            <dt>Session started</dt>
            <dd>${sessionStarted}</dd>
          </div>
          <div class="about-field">
            <dt>Move AI</dt>
            <dd>claude-haiku-4-5-20251001 · system prompt cached</dd>
          </div>
          <div class="about-field">
            <dt>Narration AI</dt>
            <dd>claude-sonnet-4-5-20250929 default · configurable in Narrator tab · system prompt cached</dd>
          </div>
          <div class="about-field">
            <dt>Art generation</dt>
            <dd>OpenRouter · FLUX.2 Pro by default · model configurable in module settings</dd>
          </div>
          <div class="about-field">
            <dt>Foundry target</dt>
            <dd>v12 minimum · v13 verified</dd>
          </div>
        </dl>
        ${ctx.isGM ? `
          <div class="about-api-keys">
            <h3 class="about-section-title">API Keys</h3>
            <p class="about-api-note">
              These keys are stored in your browser only and are never sent to
              Foundry's server or visible to other players.
            </p>
            <div class="api-key-field">
              <label class="api-key-label" for="sf-claude-key">
                Claude API Key
                ${ctx.apiKeys.claudeKeySet
                  ? '<span class="api-key-status api-key-set">● Set</span>'
                  : '<span class="api-key-status api-key-unset">○ Not set</span>'}
              </label>
              <input class="settings-input api-key-input" type="password"
                     id="sf-claude-key" name="claudeApiKey"
                     placeholder="sk-ant-..."
                     autocomplete="off" spellcheck="false">
            </div>
            <div class="api-key-field">
              <label class="api-key-label" for="sf-openrouter-key">
                OpenRouter API Key (image generation)
                ${ctx.apiKeys.openRouterKeySet
                  ? '<span class="api-key-status api-key-set">● Set</span>'
                  : '<span class="api-key-status api-key-unset">○ Not set</span>'}
              </label>
              <input class="settings-input api-key-input" type="password"
                     id="sf-openrouter-key" name="openRouterApiKey"
                     placeholder="sk-or-v1-..."
                     autocomplete="off" spellcheck="false">
            </div>
            <div class="api-key-field">
              <label class="api-key-label" for="sf-elevenlabs-key">
                ElevenLabs API Key (audio narration)
                ${ctx.apiKeys.elevenLabsKeySet
                  ? '<span class="api-key-status api-key-set">● Set</span>'
                  : '<span class="api-key-status api-key-unset">○ Not set</span>'}
              </label>
              <input class="settings-input api-key-input" type="password"
                     id="sf-elevenlabs-key" name="elevenLabsApiKey"
                     placeholder="sk_..."
                     autocomplete="off" spellcheck="false">
            </div>
            <div class="api-key-actions">
              <button class="settings-btn btn-save-keys" data-action="saveApiKeys">
                Save Keys
              </button>
              <span class="api-key-save-note">
                Leave a field blank to keep the existing value.
              </span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Action handlers (static — bound via DEFAULT_OPTIONS.actions)
  //
  // Each handler records its in-flight promise on `this._lastAction` so that
  // integration tests can await the full async chain after dispatching a real
  // DOM click event. ApplicationV2's action dispatcher invokes handlers
  // fire-and-forget, so without this hook there is no way for a test to wait
  // for multi-step persistence (e.g. game.settings.set + syncSafetyToCampaignState)
  // to settle before re-reading state. On hosted environments like Forge VTT,
  // world-scoped settings writes round-trip to the server and exceed the
  // microtask window the test helper otherwise relies on.
  // -----------------------------------------------------------------------

  static #onSwitchTab(event, target) {
    const work = (async () => {
      this.#activeTab = target.dataset.tab;
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onSetDial(event, target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      await setDial(target.dataset.value);
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onAddLine(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const input = this.element.querySelector('[name="newLine"]');
      const text = input?.value.trim();
      if (!text) return;
      const lines = getGlobalLines();
      lines.push(text);
      await setGlobalLines(lines);   // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onRemoveLine(_event, target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const idx = Number(target.dataset.index);
      const lines = getGlobalLines();
      lines.splice(idx, 1);
      await setGlobalLines(lines);   // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onAddVeil(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const input = this.element.querySelector('[name="newVeil"]');
      const text = input?.value.trim();
      if (!text) return;
      const veils = getGlobalVeils();
      veils.push(text);
      await setGlobalVeils(veils);   // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onRemoveVeil(_event, target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const idx = Number(target.dataset.index);
      const veils = getGlobalVeils();
      veils.splice(idx, 1);
      await setGlobalVeils(veils);   // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onAddPrivateLine(_event, _target) {
    const work = (async () => {
      const input = this.element.querySelector('[name="newPrivateLine"]');
      const text = input?.value.trim();
      if (!text) return;
      const lines = getPrivateLines();
      lines.push(text);
      await setPrivateLines(lines);  // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onRemovePrivateLine(_event, target) {
    const work = (async () => {
      const idx = Number(target.dataset.index);
      const lines = getPrivateLines();
      lines.splice(idx, 1);
      await setPrivateLines(lines);  // sync included
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onSaveNarratorSettings(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const el = this.element;

      const enabled      = el.querySelector('[name="narrationEnabled"]')?.checked ?? true;
      const model        = el.querySelector('[name="narrationModel"]')?.value         ?? 'claude-sonnet-4-5-20250929';
      const perspective  = el.querySelector('[name="narrationPerspective"]')?.value   ?? 'auto';
      const tone         = el.querySelector('[name="narrationTone"]')?.value           ?? 'wry';
      const lengthRaw    = el.querySelector('[name="narrationLength"]')?.value;
      const length       = Math.max(1, Math.min(6, Number(lengthRaw) || 3));
      const contextRaw   = el.querySelector('[name="narratorContextCards"]')?.value;
      const contextCards = Math.max(1, Math.min(10, Number(contextRaw) || 3));
      const instructions = el.querySelector('[name="narrationInstructions"]')?.value.trim() ?? '';

      const autoRecapEnabled = el.querySelector('[name="autoRecapEnabled"]')?.checked ?? true;
      const sessionGapRaw    = el.querySelector('[name="sessionGapHours"]')?.value;
      const sessionGapHours  = Math.max(1, Math.min(48, Number(sessionGapRaw) || 4));
      const recapGmOnly      = el.querySelector('[name="recapGmOnly"]')?.checked ?? true;

      await Promise.all([
        game.settings.set(MODULE_ID, SETTING.NARRATION_ENABLED,      enabled),
        game.settings.set(MODULE_ID, SETTING.NARRATION_MODEL,        model),
        game.settings.set(MODULE_ID, SETTING.NARRATION_PERSPECTIVE,  perspective),
        game.settings.set(MODULE_ID, SETTING.NARRATION_TONE,         tone),
        game.settings.set(MODULE_ID, SETTING.NARRATION_LENGTH,       length),
        game.settings.set(MODULE_ID, SETTING.NARRATOR_CONTEXT_CARDS, contextCards),
        game.settings.set(MODULE_ID, SETTING.NARRATION_INSTRUCTIONS, instructions),
        game.settings.set(MODULE_ID, SETTING.AUTO_RECAP_ENABLED,     autoRecapEnabled),
        game.settings.set(MODULE_ID, SETTING.SESSION_GAP_HOURS,      sessionGapHours),
        game.settings.set(MODULE_ID, SETTING.RECAP_GM_ONLY,          recapGmOnly),
      ]);

      ui.notifications?.info('Starforged Companion: Narrator settings saved.');
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onSavePacingSettings(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const el = this.element;

      const enabled = el.querySelector('[name="pacing.enabled"]')?.checked ?? true;
      const windowRaw = el.querySelector('[name="pacing.densityWindow"]')?.value;
      const densityWindow = Math.max(3, Math.min(10, Number(windowRaw) || 5));

      const read = (name, fallback) => {
        const v = Number(el.querySelector(`[name="pacing.dial.${name}"]`)?.value);
        return Math.max(0, Math.min(10, Number.isFinite(v) ? v : fallback));
      };
      const dials = {
        combat:        read('combat',        PACING_DEFAULTS.combat),
        investigation: read('investigation', PACING_DEFAULTS.investigation),
        exploration:   read('exploration',   PACING_DEFAULTS.exploration),
        social:        read('social',        PACING_DEFAULTS.social),
        downtime:      read('downtime',      PACING_DEFAULTS.downtime),
      };

      await Promise.all([
        game.settings.set(MODULE_ID, SETTING.PACING_ENABLED,             enabled),
        game.settings.set(MODULE_ID, SETTING.PACING_DENSITY_WINDOW,      densityWindow),
        game.settings.set(MODULE_ID, SETTING.PACING_DIAL_COMBAT,         dials.combat),
        game.settings.set(MODULE_ID, SETTING.PACING_DIAL_INVESTIGATION,  dials.investigation),
        game.settings.set(MODULE_ID, SETTING.PACING_DIAL_EXPLORATION,    dials.exploration),
        game.settings.set(MODULE_ID, SETTING.PACING_DIAL_SOCIAL,         dials.social),
        game.settings.set(MODULE_ID, SETTING.PACING_DIAL_DOWNTIME,       dials.downtime),
      ]);

      ui.notifications?.info('Starforged Companion: Pacing settings saved.');
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onSaveFactContinuitySettings(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;
      const el = this.element;

      const enabled          = el.querySelector('[name="factContinuity.enabled"]')?.checked          ?? true;
      const ledgerInContext  = el.querySelector('[name="factContinuity.ledgerInContext"]')?.checked  ?? true;
      const sidecarRequired  = el.querySelector('[name="factContinuity.sidecarRequired"]')?.checked  ?? true;
      const consistencyCheck = el.querySelector('[name="factContinuity.consistencyCheck"]')?.checked ?? false;
      const sceneFrame       = el.querySelector('[name="factContinuity.sceneFrame"]')?.checked       ?? true;
      const maxRaw           = el.querySelector('[name="factContinuity.maxLedgerTokens"]')?.value;
      const maxTokens        = Math.max(100, Math.min(2000, Number(maxRaw) || 400));

      await Promise.all([
        game.settings.set(MODULE_ID, SETTING.FC_ENABLED,             enabled),
        game.settings.set(MODULE_ID, SETTING.FC_LEDGER_IN_CONTEXT,   ledgerInContext),
        game.settings.set(MODULE_ID, SETTING.FC_SIDECAR_REQUIRED,    sidecarRequired),
        game.settings.set(MODULE_ID, SETTING.FC_MAX_LEDGER_TOKENS,   maxTokens),
        game.settings.set(MODULE_ID, SETTING.FC_CONSISTENCY_CHECK,   consistencyCheck),
        game.settings.set(MODULE_ID, SETTING.FC_SCENE_FRAME,         sceneFrame),
      ]);

      ui.notifications?.info('Starforged Companion: Fact Continuity settings saved.');
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onSaveApiKeys(_event, _target) {
    const work = (async () => {
      if (!game.user.isGM) return;

      const panel          = this.element;
      const claudeKey      = panel.querySelector('[name="claudeApiKey"]')?.value?.trim();
      const openRouterKey  = panel.querySelector('[name="openRouterApiKey"]')?.value?.trim();
      const elevenLabsKey  = panel.querySelector('[name="elevenLabsApiKey"]')?.value?.trim();

      if (claudeKey) {
        await game.settings.set(MODULE_ID, 'claudeApiKey', claudeKey);
      }
      if (openRouterKey) {
        await game.settings.set(MODULE_ID, 'openRouterApiKey', openRouterKey);
      }
      if (elevenLabsKey) {
        await game.settings.set(MODULE_ID, 'elevenLabsApiKey', elevenLabsKey);
      }

      if (claudeKey || openRouterKey || elevenLabsKey) {
        ui.notifications.info('Starforged Companion: API keys saved.');
      }

      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  // -----------------------------------------------------------------------
  // Audio tab — audio narration settings (docs/audio/audio-narration-scope.md §5).
  // Action handler defined as static private; the audio pane renderer
  // composes the markup based on isGM (world fields hidden for non-GMs).
  // -----------------------------------------------------------------------

  static #onSaveAudioSettings(_event, _target) {
    const work = (async () => {
      const panel = this.element;

      // World-scoped (GM only).
      if (game.user.isGM) {
        const enabled       = !!panel.querySelector('[name="audio.enabled"]')?.checked;
        const narratorVoice = panel.querySelector('[name="audio.narratorVoiceId"]')?.value?.trim();
        const npcVoice      = panel.querySelector('[name="audio.npcVoiceId"]')?.value?.trim();
        const modelId       = panel.querySelector('[name="audio.modelId"]')?.value?.trim();
        const speed         = Number(panel.querySelector('[name="audio.speed"]')?.value);

        await game.settings.set(MODULE_ID, 'audio.enabled', enabled);
        if (narratorVoice) await game.settings.set(MODULE_ID, 'audio.narratorVoiceId', narratorVoice);
        if (npcVoice)      await game.settings.set(MODULE_ID, 'audio.npcVoiceId',      npcVoice);
        if (modelId)       await game.settings.set(MODULE_ID, 'audio.modelId',         modelId);
        if (Number.isFinite(speed)) await game.settings.set(MODULE_ID, 'audio.speed', speed);
      }

      // Client-scoped (anyone).
      const clientEnabled = !!panel.querySelector('[name="audio.clientEnabled"]')?.checked;
      const autoplay      = !!panel.querySelector('[name="audio.autoplay"]')?.checked;
      const volume        = Number(panel.querySelector('[name="audio.volume"]')?.value);

      await game.settings.set(MODULE_ID, 'audio.clientEnabled', clientEnabled);
      await game.settings.set(MODULE_ID, 'audio.autoplay',      autoplay);
      if (Number.isFinite(volume)) await game.settings.set(MODULE_ID, 'audio.volume', volume);

      ui.notifications.info('Starforged Companion: Audio settings saved.');
      this.render();
    })();
    this._lastAction = work;
    return work;
  }

  static #onRefreshAudioBudget(_event, _target) {
    const work = (async () => {
      try {
        const { fetchSubscription } = await import('../audio/elevenlabs.js');
        const key = game.settings.get(MODULE_ID, 'elevenLabsApiKey') ?? '';
        if (!key) {
          ui.notifications.warn('Starforged Companion: ElevenLabs key not set.');
          return;
        }
        const { used, limit } = await fetchSubscription(key);
        ui.notifications.info(
          `ElevenLabs usage: ${used.toLocaleString()} / ${limit.toLocaleString()} characters`,
        );
      } catch (err) {
        console.warn(`${MODULE_ID} | audio budget refresh failed:`, err);
        ui.notifications.error('Starforged Companion: Could not read ElevenLabs usage.');
      }
    })();
    this._lastAction = work;
    return work;
  }
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Move Confirmation Dialog
// ---------------------------------------------------------------------------

export class MoveConfirmDialog extends ApplicationV2 {

  #resolve = null;
  #interp  = null;
  #decided = false;

  // Most-recently-prompted instance, exposed so callers (and Quench tests)
  // can locate the in-flight dialog without scanning foundry.applications.instances
  // (which is a Map in v13 and unfriendly to Object.values()).
  static #pending = null;
  static get pending() { return MoveConfirmDialog.#pending; }

  // No static `id` — each prompt() creates an instance with a unique id.
  // A singleton id makes ApplicationV2 reuse the prior entry in
  // foundry.applications.instances; the new instance can then inherit a
  // sticky #decided=true from the old close() and the next #onAccept
  // becomes a no-op, hanging the prompt promise.
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, 'move-confirm-dialog'],
    tag:     'div',
    window: {
      title:       'Confirm Move Interpretation',
      resizable:   false,
      minimizable: false,
    },
    position: { width: 440, height: 'auto' },
    actions: {
      accept: MoveConfirmDialog.#onAccept,
      reject: MoveConfirmDialog.#onReject,
    },
  };

  /**
   * Show the dialog for an interpretation and return the player's choice.
   * Awaits the inner render so the instance is fully wired (DOM in place,
   * action handlers bound) before the returned promise can be observed.
   * @param {object} interpretation
   * @returns {Promise<boolean>}
   */
  static async prompt(interpretation) {
    const dialog = new MoveConfirmDialog({
      id: `${MODULE_ID}-move-confirm-${foundry.utils.randomID()}`,
    });
    dialog.#interp = interpretation;
    const result = new Promise((resolve) => { dialog.#resolve = resolve; });
    MoveConfirmDialog.#pending = dialog;
    await dialog.render({ force: true });
    return result;
  }

  async _prepareContext(_options) {
    const interp   = this.#interp ?? {};
    const dialLabel = DIAL_POSITIONS.find(d => d.value === getDial())?.label ?? 'Balanced';
    return {
      moveId:          interp.moveId    ?? '—',
      statUsed:        interp.statUsed  ?? '—',
      rationale:       interp.rationale ?? '',
      mischiefApplied: !!interp.mischiefApplied,
      mischiefAside:   interp._mischiefAside ?? '',
      applicableAbilities: Array.isArray(interp.applicableAbilities) ? interp.applicableAbilities : [],
      dialLabel,
    };
  }

  async _renderHTML(context, _options) {
    const mischiefBlock = context.mischiefApplied && context.mischiefAside ? `
      <div class="confirm-mischief-aside">
        <span class="mischief-label">Mischief (${context.dialLabel})</span>
        <p class="mischief-aside-text">${context.mischiefAside}</p>
      </div>
    ` : '';

    const abilitiesBlock = renderApplicableAbilitiesBlock(context.applicableAbilities, context.statUsed);

    const html = `
      <div class="sf-move-confirm">
        <div class="confirm-move-row">
          <span class="confirm-field-label">Move</span>
          <span class="confirm-field-value confirm-move-id">${context.moveId}</span>
        </div>
        <div class="confirm-move-row">
          <span class="confirm-field-label">Stat</span>
          <span class="confirm-field-value">${context.statUsed}</span>
        </div>
        <div class="confirm-rationale">
          <span class="confirm-field-label">Interpretation</span>
          <p class="confirm-rationale-text">${context.rationale}</p>
        </div>
        ${mischiefBlock}
        ${abilitiesBlock}
        <div class="confirm-actions">
          <button class="settings-btn btn-accept" data-action="accept">Accept — Roll</button>
          <button class="settings-btn btn-reject" data-action="reject">Re-interpret</button>
        </div>
      </div>
    `;

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  // Single resolution gate — the first call wins. Prevents close() from
  // clobbering an explicit accept/reject when the framework runs both paths
  // (action handler resolves true, then close() races to resolve false).
  #settle(value) {
    if (this.#decided) return;
    this.#decided = true;
    const r = this.#resolve;
    this.#resolve = null;
    if (MoveConfirmDialog.pending === this) MoveConfirmDialog.#pending = null;
    r?.(value);
  }

  async close(options) {
    // External close (X button, escape, programmatic) is treated as cancel.
    // No-op if the user already accepted or rejected.
    this.#settle(false);
    return super.close(options);
  }

  static async #onAccept(_event, _target) {
    // Sum the adds value from each checked ability before settling so the
    // pipeline can apply them to interpretation.adds. The interpretation
    // object is shared by reference with the caller.
    try {
      const root = this.element ?? document;
      const checked = root.querySelectorAll?.('.sf-applicable-ability-cb:checked') ?? [];
      let total = 0;
      const applied = [];
      const offeredStats = new Set();
      checked.forEach(cb => {
        const n = Number(cb.dataset.adds ?? 0);
        if (Number.isFinite(n) && n > 0) total += n;
        if (cb.dataset.key) applied.push(cb.dataset.key);
        const stat = cb.dataset.statReplacement;
        if (stat) offeredStats.add(stat);
      });
      // Stat substitution — apply only when the selected radio matches one
      // of the offered stats and at least one ability advertising that
      // substitution is currently checked. Otherwise the user has
      // unchecked the gating ability and the substitution must not fire.
      let pickedStat = '';
      const picked = root.querySelector?.('input[name="sf-stat-sub"]:checked');
      const candidate = String(picked?.value ?? '').trim();
      if (candidate && offeredStats.has(candidate)) pickedStat = candidate;

      if (this.#interp) {
        this.#interp.appliedAbilityAdds  = total;
        this.#interp.appliedAbilityKeys  = applied;
        this.#interp.appliedStatReplacement = pickedStat || null;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | MoveConfirmDialog: failed to read ability checkboxes:`, err.message);
    }
    this.#settle(true);
    this.close({ animate: false });
  }

  static async #onReject(_event, _target) {
    this.#settle(false);
    this.close({ animate: false });
  }
}

/**
 * Build the "Applicable abilities" block shown above the dialog's accept
 * / reject buttons. Each ability gets a checkbox the player can toggle.
 * Pre-checked when the heuristic / Haiku identified a non-zero adds
 * value, since the most common reason an ability surfaces is to add to
 * the roll; player can uncheck if it doesn't apply this turn.
 */
function renderApplicableAbilitiesBlock(abilities, currentStat) {
  if (!Array.isArray(abilities) || abilities.length === 0) return '';
  const items = abilities.map(a => {
    const adds      = Number(a.adds ?? 0);
    const stat      = typeof a.statReplacement === 'string' ? a.statReplacement : '';
    // Pre-check when there's a numeric add OR a stat substitution — both
    // are concrete mechanical effects the player will almost always want
    // to apply when the ability fires.
    const checked   = (adds > 0 || stat) ? 'checked' : '';
    const addsLabel = adds > 0 ? `<span class="sf-ability-adds">+${adds}</span>` : '';
    const statLabel = stat ? `<span class="sf-ability-stat-sub" title="May substitute the listed stat">↻ +${escapeAttr(stat)}</span>` : '';
    const tag       = a.source === 'command_vehicle' ? 'Vehicle' : (a.category || 'Asset');
    const summary   = a.summary ? `<div class="sf-ability-summary">${escapeAttr(a.summary)}</div>` : '';
    const sourceTag = a.detection === 'structured' ? '🔗 explicit' : '✨ inferred';
    return `
      <label class="sf-applicable-ability-row">
        <input type="checkbox" class="sf-applicable-ability-cb"
               data-key="${escapeAttr(a.key)}"
               data-adds="${adds}"
               data-stat-replacement="${escapeAttr(stat)}"
               ${checked}>
        <span class="sf-ability-name">${escapeAttr(a.assetName)}${a.abilityName ? ` — ${escapeAttr(a.abilityName)}` : ''}</span>
        <span class="sf-ability-tag">[${escapeAttr(tag)}]</span>
        ${addsLabel}
        ${statLabel}
        <span class="sf-ability-detection" title="${sourceTag}">${sourceTag}</span>
        ${summary}
      </label>`;
  }).join('');

  // Build the stat-override block — one radio per unique replacement stat
  // advertised by the ability list, plus a "Keep listed stat" default.
  const uniqueStats = Array.from(new Set(
    abilities
      .map(a => (typeof a.statReplacement === 'string' ? a.statReplacement : ''))
      .filter(Boolean),
  ));
  const statSubBlock = uniqueStats.length ? `
    <div class="confirm-stat-substitution" data-current-stat="${escapeAttr(currentStat || '')}">
      <span class="confirm-field-label">Stat substitution</span>
      <div class="sf-stat-sub-row">
        <label class="sf-stat-sub-option">
          <input type="radio" name="sf-stat-sub" value="" checked>
          Keep listed (+${escapeAttr(currentStat || '?')})
        </label>
        ${uniqueStats.map(stat => `
          <label class="sf-stat-sub-option">
            <input type="radio" name="sf-stat-sub" value="${escapeAttr(stat)}">
            Substitute +${escapeAttr(stat)}
          </label>`).join('')}
      </div>
      <p class="sf-ability-hint">Only available when a checked ability allows a stat swap.</p>
    </div>` : '';

  return `
    <div class="confirm-applicable-abilities">
      <span class="confirm-field-label">Applicable abilities</span>
      <div class="sf-ability-list">${items}</div>
      <p class="sf-ability-hint">Uncheck any that don't apply this turn. Checked items add to your roll.</p>
      ${statSubBlock}
    </div>`;
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openSettingsPanel() {
  return SettingsPanelApp.open();
}

export async function confirmInterpretation(interpretation) {
  return MoveConfirmDialog.prompt(interpretation);
}

/**
 * Register hooks. Called from index.js ready hook.
 * Also runs the initial safety sync so campaignState.safety is populated
 * from whatever is currently in game.settings before the first move fires.
 */
export function registerSettingsHooks() {
  registerXCardHook();

  // Initialise campaignState.safety from current game.settings values.
  // This covers first load and the case where settings existed before this
  // sync mechanism was deployed.
  syncSafetyToCampaignState().catch(err =>
    console.warn(`${MODULE_ID} | Initial safety sync failed:`, err.message)
  );
}

/**
 * Read safety config from game.settings.
 * Shape matches what safety.js's formatSafetyContext expects when called
 * without a campaignState (e.g. from tests or direct use).
 */
export function getSafetyConfig() {
  return {
    lines:        getGlobalLines(),
    veils:        getGlobalVeils(),
    privateLines: getPrivateLines(),
  };
}

export { getDial as getMischiefDial };
export { getAutoRecapEnabled, getSessionGapHours, getRecapGmOnly };
