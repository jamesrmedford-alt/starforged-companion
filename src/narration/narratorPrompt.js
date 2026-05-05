// src/narration/narratorPrompt.js
// Pure string-building functions for the narrator system prompt and user message.
// No Foundry API calls — all inputs are passed in; safe to call in tests.

import { formatSafetyContext } from '../context/safety.js';

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
- Contradict any established canonical entity detail
- Introduce more than one major new named entity per narration
- Name an entity and immediately resolve their arc in the same narration

Any entity you name will be captured for the campaign record.`,

  interaction: `## NARRATOR PERMISSIONS — INTERACTION MODE

This move involves established entities. Consistency is required.

Use the entity cards provided. Canonical details are fixed — do not
contradict them. Generative details are soft-established and should be
honoured unless a strong narrative reason requires divergence.

You MAY:
- Add new detail to the generative tier of established entities
- Deepen relationships and develop implied history
- Add sensory and atmospheric texture freely

You may NOT:
- Rename, reassign motivation, or change the disposition of established
  entities without an explicit story reason
- Introduce new named entities
- Contradict canonical details (do not contradict canonical entity facts)
- State that an NPC "always" or "never" does something not already
  established`,

  embellishment: `## NARRATOR PERMISSIONS — EMBELLISHMENT MODE

This move has a mechanical consequence. Narrate its texture.

You MUST:
- Focus on sensory, atmospheric, and emotional detail
- Stay grounded in the current scene

You may NOT introduce any new named entity (no new named entity may appear
in this narration — no person, ship, location, faction, or creature). You
may not introduce any new plot element or revelation, and you may not
advance any story thread beyond the immediate consequence of this move.

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
    ? 'CANONICAL (do not contradict):'
    : 'CANONICAL (established — prefer consistency):';
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
    const playerCount = game.users.filter(u => u.active && !u.isGM).length;
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
 * @param {Object} [extras.oracleSeeds]        — { results, names, context } per scope §7
 * @param {string} [extras.campaignTruthsBlock]— Pre-built `<campaign_truths>` block from system asset integration Phase 8
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
    narrationTone         = 'wry',
    narrationPerspective  = 'auto',
    narrationLength       = 3,
    narrationInstructions = '',
  } = narratorSettings ?? {};

  const {
    narratorClass        = null,
    entityCards          = [],
    currentLocationCard  = '',
    oracleSeeds          = null,
    campaignTruthsBlock  = '',
  } = extras ?? {};

  const resolvedPerspective = resolveNarrationPerspective(narrationPerspective);
  const toneDesc        = TONE_DESCRIPTIONS[narrationTone]          ?? TONE_DESCRIPTIONS.wry;
  const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[resolvedPerspective] ?? PERSPECTIVE_DESCRIPTIONS.second_person;

  const parts = [];

  // [0] Role and style block
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
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `narrate the mechanical consequences of move outcomes as vivid, atmospheric prose ` +
    `that serves the story.\n\n` +
    `Do not repeat the mechanical outcome verbatim. Transform it into narrative. ` +
    `Keep the player in the fiction.\n\n` +
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

  // [6] Matched entity cards — from relevance resolver
  if (Array.isArray(entityCards) && entityCards.length) {
    const cards = entityCards.filter(s => typeof s === 'string' && s.trim().length);
    if (cards.length) {
      parts.push(['## ENTITIES IN SCENE', ...cards].join('\n\n'));
    }
  }

  // [7] Active connections summary (legacy — connection names/roles only)
  const connections = buildConnectionsSummary(campaignState);
  if (connections) parts.push(connections);

  // [8] Character
  if (character) parts.push(buildCharacterBlock(character));

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

  if (recentContext?.trim()) {
    parts.push(`## RECENT SCENE\n\n${recentContext.trim()}`);
  }

  parts.push(`## PLAYER QUESTION\n\n"${question.trim()}"`);

  parts.push(
    `Answer this question with ${sentenceTarget}–${sentenceTarget + 1} sentences of atmospheric ` +
    `description. Do not introduce new plot elements. Stay grounded in what has already been ` +
    `established. The narrator is a camera, not a writer, in this mode.`
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

  if (playerNarration?.trim()) {
    parts.push(`## PLAYER NARRATION\n\n"${playerNarration.trim()}"`);
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
