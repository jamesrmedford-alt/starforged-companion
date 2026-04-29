// src/narration/narratorPrompt.js
// Pure string-building functions for the narrator system prompt and user message.
// No Foundry API calls — all inputs are passed in; safe to call in tests.

import { formatSafetyContext } from '../context/safety.js';

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
 * This is the cached portion — rebuild only when campaign state or settings change.
 *
 * @param {Object} campaignState      — CampaignStateSchema
 * @param {Object} narratorSettings   — narrator game.settings values
 * @param {Object|null} character     — CharacterSchema (active character, may be null)
 * @param {string} [campaignRecap]    — injected at session start only (first narration)
 * @returns {string}
 */
export function buildNarratorSystemPrompt(campaignState, narratorSettings, character, campaignRecap = '') {
  const {
    narrationTone         = 'wry',
    narrationPerspective  = 'auto',
    narrationLength       = 3,
    narrationInstructions = '',
  } = narratorSettings ?? {};

  const resolvedPerspective = resolveNarrationPerspective(narrationPerspective);
  const toneDesc        = TONE_DESCRIPTIONS[narrationTone]          ?? TONE_DESCRIPTIONS.wry;
  const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[resolvedPerspective] ?? PERSPECTIVE_DESCRIPTIONS.second_person;

  const parts = [];

  // [1] Role and style block
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

  // [1b] Campaign recap — injected at session start only
  if (campaignRecap?.trim()) {
    parts.push(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${campaignRecap.trim()}`);
  }

  // [2] Safety configuration
  const safetyContent = formatSafetyContext(campaignState);
  if (safetyContent) parts.push(safetyContent);

  // [3] World truths
  const worldTruths = buildWorldTruthsBlock(campaignState);
  if (worldTruths) parts.push(worldTruths);

  // [4] Active connections (summary from campaignState — connection names/roles only)
  const connections = buildConnectionsSummary(campaignState);
  if (connections) parts.push(connections);

  // [5] Character
  if (character) parts.push(buildCharacterBlock(character));

  return parts.join('\n\n---\n\n');
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
