// src/narration/narratorPrompt.js
// Pure string-building functions for the narrator system prompt and user message.
// No Foundry API calls — all inputs are passed in; safe to call in tests.

import { formatSafetyContext } from '../context/safety.js';
import { formatShipPositionLine } from '../factContinuity/shipPosition.js';

// ---------------------------------------------------------------------------
// Fact-continuity sidecar instruction — fact-continuity scope §7
// ---------------------------------------------------------------------------

/**
 * Mandatory sidecar response-format instruction appended to every narrator
 * system prompt. Tells the narrator to emit prose followed by a single
 * fenced JSON block describing new truths and state changes. The block is
 * parsed off-screen by src/factContinuity/sidecarParser.js and stripped
 * before the prose reaches chat.
 *
 * Returns a single string ready to push onto the system-prompt parts array.
 */
export function appendSidecarInstruction() {
  return [
    '## RESPONSE FORMAT — MANDATORY SIDECAR',
    '',
    'Respond with prose followed by a single fenced JSON code block, in this',
    'exact shape:',
    '',
    '    <your prose narration here, no JSON inside the prose>',
    '',
    '    ```json',
    '    {',
    '      "newTruths": [',
    '        { "subject": "Vance", "fact": "Walks with a slight limp" }',
    '      ],',
    '      "stateChanges": [',
    '        { "subject": "scene",     "attribute": "lighting", "value": "stable" },',
    '        { "subject": "cargo bay", "attribute": "door",     "value": "open"   }',
    '      ]',
    '    }',
    '    ```',
    '',
    'The JSON block MUST be present. Both arrays MAY be empty. The block is',
    'how this turn\'s bookkeeping is captured — the prose itself stays pure',
    'fiction (no mention of truths, state, the block itself, or any other',
    'tooling concern).',
    '',
    'Rules:',
    '- A "newTruth" is binding — a fact that, if asserted again later, must',
    '  not change. Use it for established physical traits, named history,',
    '  declared backstory.',
    '- A "stateChange" is what is true right now. Use it for posture, mood,',
    '  visible state, door positions, lighting, weather. These supersede',
    '  prior state for the same subject + attribute.',
    '- A subject is the name as it appears in the scene. If the subject is',
    '  the scene itself (lighting, weather, ambient sound) use "scene".',
    '- The "ship" subject is reserved for the player\'s command vehicle.',
    '  Use it only when narration actually moves the ship. Persistent',
    '  position updates use the exact shape',
    '  { "subject": "ship", "attribute": "position", "value": "<destination',
    '  name>" } — the value is matched against known settlements,',
    '  planets, and locations.',
    '- Do not declare a truth that diverges from the active scene block. If',
    '  a fact needs to change, the player or GM will retract the old one.',
  ].join('\n');
}

/**
 * Build the Section 6.5 active-scene ledger block — fact-continuity scope §6.
 *
 * Returns an object with separately budgetable sub-blocks so the assembler
 * can drop state under budget pressure while keeping truths:
 *
 *   {
 *     header:        '## ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE\n\n…',
 *     truths:        'TRUTHS:\n  Vance — Walks with a slight limp\n  …',
 *     state:         'CURRENT STATE (right now in this scene):\n  Vance — …',
 *     shipPosition:  '',                        // populated in §20
 *     combined:      header + truths + state,   // for direct prompt use
 *     tokenEstimates:{ header, truths, state, ship },
 *   }
 *
 * Returns `{ combined: '' }` (all fields empty strings) when there is nothing
 * to render — both ledgers empty for the in-scope subjects.
 *
 * Filtering (fact-continuity scope §6 — "Filtering"). A subject is in scope
 * for this turn if any of:
 *   - the scene itself (`subject.kind === "scene"`)               — always
 *   - the entity ID appears in `options.matchedEntityIds`         — always
 *   - the entity ID equals `options.currentLocationId`            — always
 *   - the free-text subject is mentioned in `options.playerNarration`
 *
 * @param {Object} campaignState     — CampaignStateSchema
 * @param {Object} [options]
 * @param {string[]} [options.matchedEntityIds]
 * @param {string|null} [options.currentLocationId]
 * @param {string} [options.playerNarration]
 * @param {number} [options.maxTokens] — soft cap; state drops first when exceeded
 * @param {Map<string,string>|Object} [options.entityNamesById] — entity ID → display name
 * @returns {{ header: string, truths: string, state: string,
 *             shipPosition: string, combined: string,
 *             tokenEstimates: { header: number, truths: number, state: number, ship: number } }}
 */
export function buildLedgerBlock(campaignState, options = {}) {
  const truths = Array.isArray(campaignState?.sceneTruths) ? campaignState.sceneTruths : [];
  const stateBySubject = (campaignState?.sceneState && typeof campaignState.sceneState === 'object'
    ? campaignState.sceneState.bySubject
    : null) ?? {};

  const matchedIds        = new Set(options?.matchedEntityIds ?? []);
  const currentLocationId = options?.currentLocationId ?? null;
  if (currentLocationId) matchedIds.add(currentLocationId);
  // Sanitize the narration before substring-matching free-text subjects so
  // stray HTML from chat enrichment never produces false matches (see PR #94).
  const narration         = sanitizePlayerText(options?.playerNarration ?? '').toLowerCase();
  const maxTokens         = Number.isFinite(options?.maxTokens) ? options.maxTokens : Infinity;
  const nameLookup        = normaliseNameLookup(options?.entityNamesById);

  // ── Filter truths ────────────────────────────────────────────────────────
  const truthLines = [];
  for (const t of truths) {
    if (!t || t.retracted) continue;
    if (!isSubjectInScope(t.subject, matchedIds, narration)) continue;
    const label = formatSubjectLabel(t.subject, nameLookup);
    const fact  = String(t.fact ?? '').trim();
    if (!fact) continue;
    truthLines.push(`  ${label} — ${fact}`);
  }

  // ── Filter state ─────────────────────────────────────────────────────────
  const stateLines = [];
  for (const [key, entries] of Object.entries(stateBySubject)) {
    if (!Array.isArray(entries) || !entries.length) continue;
    const subjectForKey = subjectFromStateKey(key);
    if (!isSubjectInScope(subjectForKey, matchedIds, narration)) continue;
    const label = formatSubjectLabel(subjectForKey, nameLookup);
    for (const e of entries) {
      const attr  = String(e?.attribute ?? '').trim();
      const value = e?.value;
      if (!attr || value === undefined || value === null || value === '') continue;
      stateLines.push(`  ${label} — ${attr}: ${value}`);
    }
  }

  // ── Ship position (§20) ──────────────────────────────────────────────────
  // The command vehicle's persistent position record is fact-continuity
  // confirmed-lore tier — it is never dropped under budget pressure and
  // renders even when truths / state are otherwise empty. Returns "" when
  // no command vehicle exists or its position record is blank.
  const shipPositionLine = buildShipPositionLine(campaignState);

  // ── Empty short-circuit ──────────────────────────────────────────────────
  if (!truthLines.length && !stateLines.length && !shipPositionLine) {
    return {
      header: '', truths: '', state: '', shipPosition: '', combined: '',
      tokenEstimates: { header: 0, truths: 0, state: 0, ship: 0 },
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  // Header only renders when there are truths or state to introduce —
  // the SHIP POSITION line stands on its own when it's the only thing
  // in the block (§20).
  const header = (truthLines.length || stateLines.length)
    ? [
        '## ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE',
        '',
        'You established the following facts during this scene. They are',
        'binding. Subsequent narration must honour them and may add to them,',
        'but must not diverge from them.',
      ].join('\n')
    : '';

  const truthsBlock = truthLines.length
    ? ['TRUTHS:', ...truthLines].join('\n')
    : '';

  let stateBlock = stateLines.length
    ? ['CURRENT STATE (right now in this scene):', ...stateLines].join('\n')
    : '';

  // ── Soft-cap enforcement: drop state when over budget ────────────────────
  // Ship position counts toward the budget for telemetry but is never
  // dropped — it's confirmed-lore tier per scope §20.5. State drops first
  // when the cap is exceeded.
  const tokenEstimates = {
    header: estimateTokens(header),
    truths: estimateTokens(truthsBlock),
    state:  estimateTokens(stateBlock),
    ship:   estimateTokens(shipPositionLine),
  };
  let total = tokenEstimates.header + tokenEstimates.truths
            + tokenEstimates.state + tokenEstimates.ship;
  if (total > maxTokens && stateBlock) {
    stateBlock = '';
    tokenEstimates.state = 0;
    total = tokenEstimates.header + tokenEstimates.truths + tokenEstimates.ship;
  }

  const combined = [header, truthsBlock, stateBlock, shipPositionLine]
    .filter(Boolean)
    .join('\n\n');

  return {
    header,
    truths:       truthsBlock,
    state:        stateBlock,
    shipPosition: shipPositionLine,
    combined,
    tokenEstimates,
  };
}

/**
 * Render the SHIP POSITION line for the section-6.5 ledger block, when
 * the campaign state has a registered command vehicle with a non-empty
 * position record. Returns "" when no information is available —
 * callers treat this as the "omit" signal.
 *
 * Reads the command vehicle directly off the global game.actors / the
 * campaign state shipIds list. Wrapped in try/catch so the assembler
 * never throws because of a stale Actor reference.
 *
 * Exported for unit testing.
 *
 * @param {Object} campaignState
 * @returns {string}
 */
export function buildShipPositionLine(campaignState) {
  if (!campaignState) return '';
  try {
    const ids   = Array.isArray(campaignState.shipIds) ? campaignState.shipIds : [];
    const MID   = 'starforged-companion';
    let payload = null;
    let actor   = null;
    for (const id of ids) {
      const a = globalThis.game?.actors?.get?.(id);
      const p = a?.flags?.[MID]?.ship;
      if (p?.isCommandVehicle) { payload = p; actor = a; break; }
    }
    if (!payload) return '';
    const name = actor?.name ?? payload?.name ?? '';
    return formatShipPositionLine(payload.position, campaignState, name);
  } catch (err) {
    console.warn?.('starforged-companion | buildShipPositionLine failed:', err?.message ?? err);
    return '';
  }
}

/**
 * Cheap ~4-chars-per-token estimate, identical to assembler.js. Inline so this
 * module stays free of cross-module imports beyond safety formatting.
 */
function estimateTokens(s) {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/**
 * Render a ledger subject as the human-readable prefix used in the block.
 *   entity → display name from the lookup, or the entity ID as fallback.
 *   scene  → "scene"
 *   text   → the original text
 */
function formatSubjectLabel(subject, nameLookup) {
  if (!subject || typeof subject !== 'object') return 'unknown';
  switch (subject.kind) {
    case 'entity': {
      const id = subject.entityId ?? '';
      const fromMap = nameLookup?.get?.(id);
      return fromMap || id || 'entity';
    }
    case 'scene': return 'scene';
    case 'text':  return String(subject.text ?? '').trim() || 'unknown';
    default:      return 'unknown';
  }
}

/**
 * Accept either a Map or a plain object for entityNamesById and return a
 * Map-like with a .get() method so the renderer can stay agnostic.
 */
function normaliseNameLookup(input) {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  if (typeof input === 'object') return new Map(Object.entries(input));
  return new Map();
}

function isSubjectInScope(subject, matchedIds, lowerCaseNarration) {
  if (!subject || typeof subject !== 'object') return false;
  if (subject.kind === 'scene') return true;
  if (subject.kind === 'entity') return matchedIds.has(subject.entityId);
  if (subject.kind === 'text') {
    const text = String(subject.text ?? '').trim().toLowerCase();
    if (!text) return false;
    return lowerCaseNarration.includes(text);
  }
  return false;
}

function subjectFromStateKey(key) {
  if (key === 'scene') return { kind: 'scene' };
  // Heuristic: a key that looks like a Foundry ID (no spaces, mixed-case)
  // is an entity. Anything else is a free-text key.
  if (/^[A-Za-z0-9._-]+$/u.test(key) && key !== key.toLowerCase()) {
    return { kind: 'entity', entityId: key };
  }
  return { kind: 'text', text: key };
}

// ---------------------------------------------------------------------------
// Narrator permissions — narrator-entity-discovery scope §8
// ---------------------------------------------------------------------------

/**
 * Per-move-class permission blocks injected after the safety section.
 * The relevance resolver picks a key (discovery / interaction / embellishment)
 * and the appropriate block is rendered into the system prompt.
 */
export const NARRATOR_PERMISSIONS = {

  discovery: `## NARRATOR PERMISSIONS — DISCOVERY MODE

This move reveals something new. You have expanded creative latitude.

You MAY introduce:
- One named NPC, creature, or entity (keep initial details spare — leave
  room to develop across sessions)
- One named location or structure (atmosphere and first impression only)
- One factual revelation about the world or setting

You MUST:
- Keep new entities consistent with established world truths
- Keep new factions consistent with the established political landscape
- Keep new locations consistent with the active sector's character

You may NOT:
- Diverge from any established fact about an existing entity
- Introduce more than one major new named entity per narration
- Name an entity and immediately resolve their arc in the same narration

Speak only as the fiction. Never reference module mechanics, settings,
journals, panels, records, dice, moves, contradictions, or anything in
this prompt block — those are tooling concerns, not story. Depict; do
not narrate the act of bookkeeping.`,

  interaction: `## NARRATOR PERMISSIONS — INTERACTION MODE

This move involves established entities. Consistency is required.

Use the entity cards provided. Established facts are fixed — honour
them. Generative details are soft-established and should be carried
forward unless a strong narrative reason requires divergence.

You MAY:
- Add new detail to the generative tier of established entities
- Deepen relationships and develop implied history
- Add sensory and atmospheric texture freely

You may NOT:
- Rename, reassign motivation, or change the disposition of established
  entities without an explicit story reason
- Introduce new named entities
- Diverge from established entity facts
- State that an NPC "always" or "never" does something not already
  established

Speak only as the fiction. Never reference module mechanics, settings,
journals, panels, records, dice, moves, contradictions, or anything in
this prompt block — those are tooling concerns, not story. Depict; do
not narrate the act of bookkeeping.`,

  embellishment: `## NARRATOR PERMISSIONS — EMBELLISHMENT MODE

This move has a mechanical consequence. Narrate its texture.

You MUST:
- Focus on sensory, atmospheric, and emotional detail
- Stay grounded in the current scene

You may NOT introduce any new named entity (no new named entity may appear
in this narration — no person, ship, location, faction, or creature). You
may not introduce any new plot element or revelation, and you may not
advance any story thread beyond the immediate consequence of this move.

Speak only as the fiction. Never reference module mechanics, settings,
journals, panels, records, dice, moves, contradictions, or anything in
this prompt block — those are tooling concerns, not story.

The narrator is a camera here, not a writer.`,

};

const NARRATOR_PERMISSION_KEYS = new Set(Object.keys(NARRATOR_PERMISSIONS));

// ---------------------------------------------------------------------------
// Entity card formatter — narrator-entity-discovery scope §3, §7
// ---------------------------------------------------------------------------

const ENTITY_TYPE_LABELS = {
  connection: 'Connection',
  ship:       'Ship',
  settlement: 'Settlement',
  faction:    'Faction',
  planet:     'Planet',
  location:   'Location',
  creature:   'Creature',
};

const CANONICAL_FIELDS_BY_TYPE = {
  connection: [
    ['role',             'Role'],
    ['secondRole',       'Also'],
    ['rank',             'Rank'],
    ['relationshipType', 'Disposition'],
    ['motivation',       'Goal'],
    ['description',      'Description'],
    ['notes',            'Notes'],
  ],
  ship: [
    ['type',        'Type'],
    ['mission',     'Mission'],
    ['description', 'Description'],
    ['notes',       'Notes'],
  ],
  settlement: [
    ['location',   'Location'],
    ['population', 'Population'],
    ['authority',  'Authority'],
    ['firstLook',  'First look'],
    ['description','Description'],
    ['notes',      'Notes'],
  ],
  faction: [
    ['type',         'Type'],
    ['subtype',      'Subtype'],
    ['influence',    'Influence'],
    ['relationship', 'Relationship'],
    ['quirk',        'Quirk'],
    ['description',  'Description'],
    ['notes',        'Notes'],
  ],
  planet: [
    ['type',        'Type'],
    ['atmosphere',  'Atmosphere'],
    ['life',        'Life'],
    ['description', 'Description'],
    ['notes',       'Notes'],
  ],
  location: [
    ['type',        'Type'],
    ['region',      'Region'],
    ['status',      'Status'],
    ['firstLook',   'First look'],
    ['feature',     'Feature'],
    ['description', 'Description'],
    ['notes',       'Notes'],
  ],
  creature: [
    ['scale',       'Scale'],
    ['environment', 'Environment'],
    ['form',        'Form'],
    ['behavior',    'Behavior'],
    ['rank',        'Rank'],
    ['description', 'Description'],
    ['notes',       'Notes'],
  ],
};

/**
 * Format a single entity record as a narrator-prompt card.
 * Includes the canonical tier (with a hard or soft instruction depending on
 * canonicalLocked) and up to 5 generative-tier entries (pinned first).
 *
 * @param {Object} entity     — entity record (any type)
 * @param {string} entityType — "connection" | "ship" | "settlement" | "faction" | "planet" | "location" | "creature"
 * @returns {string}
 */
export function formatEntityCard(entity, entityType) {
  if (!entity) return '';
  const typeLabel = ENTITY_TYPE_LABELS[entityType] ?? 'Entity';
  const name      = entity.name?.trim() || `Unknown ${typeLabel}`;
  const lines     = [`## ${name.toUpperCase()} — ${typeLabel}`];

  const canonicalIntro = entity.canonicalLocked
    ? 'ESTABLISHED FACTS (fixed):'
    : 'ESTABLISHED FACTS (prefer consistency):';
  lines.push('', canonicalIntro);

  const fields = CANONICAL_FIELDS_BY_TYPE[entityType] ?? [['description', 'Description']];
  for (const [key, label] of fields) {
    const value = entity[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`  ${label}: ${value.join(', ')}`);
    } else {
      lines.push(`  ${label}: ${value}`);
    }
  }

  // Generative tier — pinned first, then by recency (sessionNum descending),
  // capped at 5 displayed.
  const tier = Array.isArray(entity.generativeTier) ? entity.generativeTier : [];
  const visible = tier.filter(e => !e.promoted);
  if (visible.length) {
    const sorted = visible.slice().sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.sessionNum ?? 0) - (a.sessionNum ?? 0);
    });
    const top = sorted.slice(0, 5);
    lines.push('', 'NARRATOR-ADDED (honour and build on these):');
    for (const e of top) {
      const marker = e.pinned ? '📌 ' : '';
      const session = e.sessionNum ? `Session ${e.sessionNum}: ` : '';
      lines.push(`  ${marker}${session}${e.detail ?? ''}`.trimEnd());
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Role descriptions — narrator-suggestion-loop remediation §A1
// ---------------------------------------------------------------------------

/**
 * Per-call-site role descriptions. The narrator is invoked from three places
 * and each has a different job — `buildNarratorSystemPrompt` would previously
 * reuse the move-resolution role description for all three, which contributed
 * to the "suggest rather than depict" drift documented in the investigation
 * report (H4). Each mode now gets a role description that matches its call
 * site.
 */
const NARRATOR_MODES = new Set(['move_resolution', 'paced_narrative', 'scene_interrogation']);

const ROLE_DESCRIPTIONS = {
  move_resolution:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `narrate the mechanical consequences of move outcomes as vivid, atmospheric prose ` +
    `that serves the story.\n\n` +
    `Do not repeat the mechanical outcome verbatim. Transform it into narrative. ` +
    `Keep the player in the fiction.`,

  paced_narrative:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `continue the fiction in response to the player's narration as vivid, atmospheric ` +
    `prose that serves the story.\n\n` +
    `No move was rolled for this turn. Stay in narration; do not announce mechanics. ` +
    `Keep the player in the fiction.`,

  scene_interrogation:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `answer the player's question about the current scene as vivid, atmospheric prose ` +
    `that serves the story.\n\n` +
    `The narrator is a camera here, not a writer. Describe what is already established; ` +
    `do not introduce new plot elements.`,
};

/**
 * Anti-suggestion clause applied to every mode. Fixes the H6 finding —
 * the model generalizing the closing-italic-hint pattern in
 * `buildPacedNarrativeUserMessage` into inline bracketed suggestions inside
 * the prose. The closing italic move-hint, where applicable, is carved out
 * explicitly by the user-message builder.
 */
const ANTI_SUGGESTION_CLAUSE =
  `Depict, do not offer. Do not propose actions to the player in the body of the ` +
  `narration. Do not surface mechanical options as parenthetical or italicized asides ` +
  `inside the prose. The fiction moves forward through what the narrator describes ` +
  `happening, not through suggestions about what could happen next.`;

const TONE_DESCRIPTIONS = {
  wry: "Wry — knowing and slightly sardonic, aware of consequence without wallowing in it. The narrator has seen this before. It notices the irony. It does not editorialize, but it does not pretend not to notice.",
  grim_and_grounded: "Grim and grounded — sparse, consequential, Ironsworn-canonical. Short sentences. Weighted words. No flourish.",
  operatic: "Operatic — heightened stakes, vivid imagery, emotion at full volume.",
  noir: "Noir — world-weary, shadowed, dry. The city has seen it all; so has the narrator.",
  matter_of_fact: "Matter of fact — mechanical, precise, minimal flourish. Just what happened.",
};

const PERSPECTIVE_DESCRIPTIONS = {
  second_person: 'Address the player character directly as "you". e.g. "You feel the deck shudder..."',
  third_person:  'Refer to characters by name. e.g. "Kira feels the deck shudder..."',
};

// ---------------------------------------------------------------------------
// Perspective resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective narration perspective.
 * "auto" resolves to second_person for solo (1 active player) or third_person
 * for multiplayer (2+ active players). Explicit values pass through unchanged.
 *
 * @param {string} setting — "auto" | "second_person" | "third_person"
 * @returns {"second_person"|"third_person"}
 */
export function resolveNarrationPerspective(setting) {
  if (setting !== 'auto') return setting;
  try {
    const playerCount = game.users.filter(u => u.active).length;
    return playerCount === 1 ? 'second_person' : 'third_person';
  } catch {
    return 'second_person';
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the full narrator system prompt.
 *
 * Injection order (narrator-entity-discovery scope §8):
 *   0. Role and style                       (always first)
 *   0b. Campaign recap                      (when present)
 *   1. Safety configuration                 (always second; never dropped)
 *   2. Narrator permissions                 (per-move-class block; never dropped)
 *   3. Oracle seeds                         (when resolution provides them)
 *   4. World truths
 *   5. Current location card                (when set)
 *   6. Matched entity cards                 (relevance resolver results)
 *   7. Active connections summary
 *   8. Character block
 *
 * @param {Object} campaignState      — CampaignStateSchema
 * @param {Object} narratorSettings   — narrator game.settings values
 * @param {Object|null} character     — CharacterSchema (active character, may be null)
 * @param {string} [campaignRecap]    — injected at session start only (first narration)
 * @param {Object} [extras]
 * @param {string} [extras.narratorClass]      — "discovery" | "interaction" | "embellishment"
 * @param {Array}  [extras.entityCards]        — Pre-formatted entity card strings (from formatEntityCard)
 * @param {string} [extras.currentLocationCard]— Pre-formatted current location card
 * @param {string} [extras.activeSectorBlock]  — Pre-built active-sector anchor block listing
 *   established settlement names; tells the narrator to reuse them rather than invent
 *   alternatives. Built by `formatActiveSector` in narrator.js.
 * @param {Object} [extras.oracleSeeds]        — { results, names, context } per scope §7
 * @param {string} [extras.campaignTruthsBlock]— Pre-built `<campaign_truths>` block from system asset integration Phase 8
 * @param {string} [extras.mode]               — "move_resolution" | "paced_narrative" | "scene_interrogation"
 *   Selects the role description and downstream wording. Defaults to
 *   "move_resolution" for back-compat with existing call sites and tests.
 * @returns {string}
 */
export function buildNarratorSystemPrompt(
  campaignState,
  narratorSettings,
  character,
  campaignRecap = '',
  extras = {},
) {
  const {
    narrationTone                 = 'wry',
    narrationPerspective          = 'auto',
    narrationLength               = 3,
    narrationInstructions         = '',
    factContinuityEnabled         = true,
    factContinuityLedgerInContext = true,
    factContinuityMaxLedgerTokens = 400,
  } = narratorSettings ?? {};

  const {
    narratorClass        = null,
    entityCards          = [],
    currentLocationCard  = '',
    activeSectorBlock    = '',
    oracleSeeds          = null,
    campaignTruthsBlock  = '',
    mode                 = 'move_resolution',
    matchedEntityIds     = [],
    playerNarration      = '',
    entityNamesById      = null,
  } = extras ?? {};

  const resolvedMode    = NARRATOR_MODES.has(mode) ? mode : 'move_resolution';
  const roleDescription = ROLE_DESCRIPTIONS[resolvedMode];

  const resolvedPerspective = resolveNarrationPerspective(narrationPerspective);
  const toneDesc        = TONE_DESCRIPTIONS[narrationTone]          ?? TONE_DESCRIPTIONS.wry;
  const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[resolvedPerspective] ?? PERSPECTIVE_DESCRIPTIONS.second_person;

  const parts = [];

  // [0] Role and style block — role description per call-site mode, anti-
  //     suggestion clause appended in every mode (paced-narrative carves out
  //     its closing italic move-hint in its own user message).
  const styleLines = [
    `Perspective: ${perspectiveDesc}`,
    `Tone: ${toneDesc}`,
    `Length: ${narrationLength} sentence${narrationLength !== 1 ? 's' : ''}`,
  ];
  if (narrationInstructions?.trim()) {
    styleLines.push(`Custom instructions: ${narrationInstructions.trim()}`);
  }

  parts.push(
    `## NARRATOR ROLE AND VOICE\n\n` +
    `${roleDescription}\n\n` +
    `### DEPICT, DO NOT OFFER\n\n` +
    `${ANTI_SUGGESTION_CLAUSE}\n\n` +
    `### STYLE\n\n` +
    styleLines.join('\n')
  );

  // [0b] Campaign recap — injected at session start only
  if (campaignRecap?.trim()) {
    parts.push(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${campaignRecap.trim()}`);
  }

  // [1] Safety configuration
  const safetyContent = formatSafetyContext(campaignState);
  if (safetyContent) parts.push(safetyContent);

  // [2] Narrator permissions — appears immediately after safety, before any
  //     other contextual section. Resolved by the relevance resolver.
  if (narratorClass && NARRATOR_PERMISSION_KEYS.has(narratorClass)) {
    parts.push(NARRATOR_PERMISSIONS[narratorClass]);
  }

  // [3] Oracle seeds — only when the resolved move provides them
  const seedsBlock = formatOracleSeedsBlock(oracleSeeds);
  if (seedsBlock) parts.push(seedsBlock);

  // [4] World truths
  const worldTruths = buildWorldTruthsBlock(campaignState);
  if (worldTruths) parts.push(worldTruths);

  // [4a] Campaign truths — canonical setting-truth digest from foundry-ironsworn
  if (typeof campaignTruthsBlock === 'string' && campaignTruthsBlock.trim()) {
    parts.push(campaignTruthsBlock.trim());
  }

  // [5] Current location card — always injected when set
  if (currentLocationCard?.trim()) {
    parts.push(`## CURRENT LOCATION\n\n${currentLocationCard.trim()}`);
  }

  // [5b] Active sector anchor — names + directive to reuse them. Closes the
  //      paced-narrative / scene-interrogation gap where the narrator had
  //      no sector context and would invent new settlement names for
  //      places that already exist in the active sector.
  if (activeSectorBlock?.trim()) {
    parts.push(`## ACTIVE SECTOR\n\n${activeSectorBlock.trim()}`);
  }

  // [6] Matched entity cards — from relevance resolver
  if (Array.isArray(entityCards) && entityCards.length) {
    const cards = entityCards.filter(s => typeof s === 'string' && s.trim().length);
    if (cards.length) {
      parts.push(['## ENTITIES IN SCENE', ...cards].join('\n\n'));
    }
  }

  // [6.5] Active scene ledger — binding truths + current state for in-scope
  //       subjects. Gated by both the master fact-continuity toggle and the
  //       ledger-in-context sub-toggle (fact-continuity scope §6).
  if (factContinuityEnabled && factContinuityLedgerInContext) {
    const ledger = buildLedgerBlock(campaignState, {
      matchedEntityIds,
      currentLocationId: campaignState?.currentLocationId ?? null,
      playerNarration,
      maxTokens:         factContinuityMaxLedgerTokens,
      entityNamesById,
    });
    if (ledger.combined) parts.push(ledger.combined);
  }

  // [7] Active connections summary (legacy — connection names/roles only)
  const connections = buildConnectionsSummary(campaignState);
  if (connections) parts.push(connections);

  // [8] Character
  if (character) parts.push(buildCharacterBlock(character));

  // [9] Fact-continuity sidecar instruction — appended last so it is the most
  // recent guidance the model sees before generating. Applies to every mode,
  // gated by the master Fact Continuity setting.
  if (factContinuityEnabled) {
    parts.push(appendSidecarInstruction());
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Format an oracle-seed block per scope §7. Returns empty string when no
 * seeds are present.
 *
 * @param {Object|null} seeds — { results, names, context }
 * @returns {string}
 */
export function formatOracleSeedsBlock(seeds) {
  if (!seeds || typeof seeds !== 'object') return '';
  const results = Array.isArray(seeds.results) ? seeds.results.filter(Boolean) : [];
  const names   = Array.isArray(seeds.names)   ? seeds.names.filter(Boolean)   : [];
  if (!results.length && !names.length) return '';

  const lines = ['## ORACLE SEEDS (use as inspiration — you may develop or adapt)', ''];
  for (const r of results) lines.push(r);
  if (names.length) {
    lines.push(`Name suggestion${names.length === 1 ? '' : 's'}: ${names.join(', ')}`);
  }
  lines.push('');
  lines.push(
    'These seeds define the starting outline. Add voice, specific detail, and ' +
    'atmosphere. The campaign record will be built from your narration.',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// User message builders
// ---------------------------------------------------------------------------

/**
 * Build the user message for the campaign recap generation call.
 * This is passed to Claude (Sonnet) to produce a 3–5 paragraph campaign summary.
 *
 * @param {string[]} chronicleEntries — formatted chronicle entries, oldest first
 * @returns {string}
 */
export function buildCampaignRecapUserMessage(chronicleEntries) {
  const entriesText = chronicleEntries.join('\n\n');
  return [
    `## CAMPAIGN CHRONICLE\n\n${entriesText}`,
    `Write a campaign recap of 3–5 paragraphs covering:\n` +
    `- How the campaign began and what the inciting situation was\n` +
    `- The key relationships that have developed\n` +
    `- The vows sworn and their current status\n` +
    `- The most significant revelations\n` +
    `- Where things stand now\n\n` +
    `Write in second person for solo campaigns, third person for multiplayer. ` +
    `Be wry but respectful of what the player has accomplished.`,
  ].join('\n\n');
}

/**
 * Strip HTML markup and decode HTML entities. Preserves whitespace and
 * paragraph breaks — used for multi-paragraph context where line breaks
 * carry meaning (e.g. the joined recent-narration window).
 */
export function stripHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    // Collapse runs of horizontal whitespace, but keep newlines so
    // paragraph structure survives.
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Sanitize text that arrived as a Foundry chat message's content before
 * it reaches the narrator's user message. Foundry's chat enricher, the
 * formatting toolbar, and pasted rich text can introduce HTML tags (and
 * entities like `&nbsp;` / `&amp;`) into `message.content`; without
 * sanitization the tags arrive verbatim in `PLAYER NARRATION` and the
 * model has been observed riffing on them — e.g. "you speak the HTML
 * aloud" — instead of treating them as out-of-fiction markup.
 *
 * Player input is treated as a single utterance — newlines are flattened
 * to spaces. For multi-paragraph context preservation use `stripHtml`
 * instead. Exported for tests.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizePlayerText(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

/**
 * Build the user message for a scene interrogation call.
 * This is uncached — it changes every call with the player's question.
 *
 * @param {string} question        — player's question (stripped of @scene prefix)
 * @param {string} recentContext   — recent narration cards joined as text (may be empty)
 * @param {number} sentenceTarget  — how many sentences to produce
 * @returns {string}
 */
export function buildSceneUserMessage(question, recentContext, sentenceTarget) {
  const parts = [];

  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) {
    parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);
  }

  parts.push(`## PLAYER QUESTION\n\n"${sanitizePlayerText(question)}"`);

  parts.push(
    `Answer this question with ${sentenceTarget}–${sentenceTarget + 1} sentences of atmospheric ` +
    `description. Do not introduce new plot elements. Stay grounded in what has already been ` +
    `established. The narrator is a camera, not a writer, in this mode.`
  );

  return parts.join('\n\n');
}

/**
 * Build the user message for a paced narrative-only response.
 * Used when the pacing classifier returns NARRATIVE or
 * NARRATIVE_WITH_MOVE_AVAILABLE — no move is rolled, the narrator continues
 * the fiction directly from the player's input.
 *
 * When `suggestedMove` is provided, the narrator is instructed to end with a
 * single italicized line inviting that move. The narrator may decline if the
 * fiction wouldn't carry it.
 *
 * @param {string} playerText      — raw player narration
 * @param {string} recentContext   — recent narration cards joined as text (may be empty)
 * @param {number} sentenceTarget  — how many sentences to produce
 * @param {string|null} suggestedMove
 * @returns {string}
 */
export function buildPacedNarrativeUserMessage(playerText, recentContext, sentenceTarget, suggestedMove) {
  const parts = [];

  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) {
    parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);
  }

  parts.push(`## PLAYER NARRATION\n\n"${sanitizePlayerText(playerText ?? '')}"`);

  if (suggestedMove) {
    parts.push(
      `## SUGGESTED MOVE\n\n` +
      `The pacing classifier nominated ${suggestedMove} as a move the player could ` +
      `make if they want to push this moment. End your narration with ONE italicized ` +
      `sentence inviting this move, in the narrator's voice. Do not announce it ` +
      `mechanically. Examples:\n\n` +
      `  *If you want to read him for tells, this could be a Gather Information.*\n` +
      `  *Pressing further here would be a Compel.*\n\n` +
      `This closing italic sentence is the ONE permitted exception to the ` +
      `"depict, do not offer" rule. It must appear at the very end of the ` +
      `narration, after the prose body has finished. Do not place italicized ` +
      `suggestions or "you could…" / "perhaps you might…" asides inside the ` +
      `body of the prose — only at the close.\n\n` +
      `Do not include this hint if your narration would naturally close the moment or ` +
      `if the moment doesn't actually warrant pressing. The hint is optional.`
    );
  }

  const target = Math.max(1, Number(sentenceTarget) || 3);
  parts.push(
    `Continue the fiction from this input in ${target} sentence${target !== 1 ? 's' : ''}. ` +
    `No move was rolled — stay in narration. Do not announce mechanics. Do not introduce ` +
    `unestablished plot elements. The narrator is continuing the scene, not advancing it.`
  );

  return parts.join('\n\n');
}

/**
 * Build the user message for a single narration call.
 * This is the uncached portion — it changes every call.
 *
 * @param {Object} resolution       — MoveResolutionSchema
 * @param {string} playerNarration  — raw player input
 * @param {number} sentenceTarget   — how many sentences to produce
 * @returns {string}
 */
export function buildNarratorUserMessage(resolution, playerNarration, sentenceTarget) {
  const parts = [];

  const moveOutcome = resolution?.loremasterContext ?? '';
  if (moveOutcome) {
    parts.push(`## MOVE OUTCOME\n\n${moveOutcome}`);
  }

  const cleanedPlayerNarration = sanitizePlayerText(playerNarration);
  if (cleanedPlayerNarration) {
    parts.push(`## PLAYER NARRATION\n\n"${cleanedPlayerNarration}"`);
  }

  parts.push(
    `Narrate the consequence in ${sentenceTarget} sentence${sentenceTarget !== 1 ? 's' : ''}. ` +
    `Stay in the fiction. Do not explain the mechanical outcome — embody it.`
  );

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Section builders (pure — no async, no Foundry API)
// ---------------------------------------------------------------------------

function buildWorldTruthsBlock(campaignState) {
  const truths  = campaignState?.worldTruths ?? {};
  const entries = Object.entries(truths)
    .map(([key, v]) => {
      const text = v.title ?? v.result;
      if (!text) return null;
      return `${toLabel(key)}: ${text}`;
    })
    .filter(Boolean);

  if (!entries.length) return '';
  return '## WORLD TRUTHS\n\n' + entries.join('\n');
}

function buildConnectionsSummary(campaignState) {
  // In a live Foundry session, connections are journal entries loaded async by
  // the assembler. The system prompt uses a lightweight summary built from the
  // connectionIds count; the full assembled packet reaches the user message via
  // the move outcome context. This keeps buildNarratorSystemPrompt pure/sync.
  const ids = campaignState?.connectionIds ?? [];
  if (!ids.length) return '';
  return `## ACTIVE CONNECTIONS\n\n${ids.length} active connection(s) this campaign.`;
}

function buildCharacterBlock(character) {
  const lines = ['## CHARACTER'];
  if (character.name) lines.push(`Name: ${character.name}`);
  if (character.description) lines.push(`Description: ${character.description}`);

  // Support both old (loremasterNotes) and new (narratorNotes) field names
  const notes = character.narratorNotes ?? character.loremasterNotes ?? '';
  if (notes) lines.push(`Notes for narrator: ${notes}`);

  if (character.meters) {
    const { health = 5, spirit = 5, supply = 5, momentum = 2 } = character.meters;
    lines.push(`Current state: Health ${health}/5, Spirit ${spirit}/5, Supply ${supply}/5, Momentum ${momentum}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function toLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\band\b/gi, '&')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}
