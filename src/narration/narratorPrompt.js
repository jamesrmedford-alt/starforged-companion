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
/**
 * NPC-dialogue markup instruction — audio-narration scope §6.
 *
 * Appended to the narrator system prompt only when the audio.enabled
 * world setting is true. Tells the model to wrap NPC speech in
 * `<npc>…</npc>` so the audio pipeline can split the response into
 * voice-tagged segments. The chat card strips the markers at render
 * time; players see clean prose.
 *
 * Player-character speech is NOT tagged — players hear their own
 * characters internally; flattening PC dialogue to the narrator voice
 * is intentional.
 */
export function appendNpcMarkupInstruction() {
  return [
    '## NPC DIALOGUE MARKUP — required when audio narration is enabled',
    '',
    'Wrap each piece of NPC dialogue in <npc>…</npc> tags. Examples:',
    '',
    '  Vance pauses. <npc>"You can\'t be serious."</npc> The lights flicker.',
    '  <npc>"You won\'t find them there,"</npc> Kira says, not looking up.',
    '',
    'Rules:',
    '- Only NPC speech. Player-character speech does NOT get tagged',
    '  (players hear their own characters in their own heads; flatten to',
    '  the narrator voice).',
    '- One tag pair per dialogue chunk. Do not nest. Do not split a single',
    '  spoken line across multiple tag pairs.',
    '- Quoted text that is NOT spoken dialogue (a sign, a comm transmission',
    '  read aloud, a remembered phrase) is NOT tagged.',
    '- The narrator voice handles everything outside <npc> tags, including',
    '  attribution ("Vance says", "she replies"), action beats, and',
    '  description.',
    '- Tags appear inside the prose body only, not inside the sidecar JSON.',
  ].join('\n');
}

export function appendSidecarInstruction(options = {}) {
  const mode              = typeof options.mode === 'string' ? options.mode : 'move_resolution';
  const sceneFrameEnabled = options.sceneFrameEnabled !== false;

  const exampleLines = [
    '    ```json',
    '    {',
    '      "newTruths": [',
    '        { "subject": "Vance", "fact": "Walks with a slight limp" }',
    '      ],',
    '      "stateChanges": [',
    '        { "subject": "Vance",     "attribute": "location", "value": "aboard his shuttle" },',
    '        { "subject": "cargo bay", "attribute": "door",     "value": "open"   }',
    '      ]' + (sceneFrameEnabled ? ',' : ''),
  ];
  if (sceneFrameEnabled) {
    exampleLines.push(
      '      "sceneFrame": {',
      '        "location":  "Lyra\'s orbital graveyard",',
      '        "present":   ["Venri Quint", "Vance"],',
      '        "situation": "Hailing Vance\'s shuttle across the debris field"',
      '      }',
    );
  }
  exampleLines.push('    }', '    ```');

  const lines = [
    '## RESPONSE FORMAT — MANDATORY SIDECAR',
    '',
    'Respond with prose followed by a single fenced JSON code block, in this',
    'exact shape:',
    '',
    '    <your prose narration here, no JSON inside the prose>',
    '',
    ...exampleLines,
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
    '- REQUIRED: when your prose establishes or changes WHERE a named',
    '  character is (their location, the vessel or structure they are',
    '  aboard) or their physical condition (wounded, dying, well), you MUST',
    '  emit a stateChange for that character recording it — e.g.',
    '  { "subject": "Vance", "attribute": "location", "value": "aboard his',
    '  shuttle in the graveyard" } or { "subject": "Vance", "attribute":',
    '  "condition", "value": "life support failing" }. Continuity depends',
    '  on these; do not leave them to inference.',
    '- REQUIRED: when your prose establishes WHY a character is somewhere,',
    '  what they want, or what is at stake — especially anything with a',
    '  deadline or a cost for failure — you MUST emit a newTruth recording',
    '  it. Stakes that are not recorded will be lost.',
    '- A subject is the name as it appears in the scene. If the subject is',
    '  the scene itself (lighting, weather, ambient sound) use "scene".',
    '- REQUIRED: when your prose moves the player\'s command vehicle —',
    '  departure, transit, or arrival — emit the exact shape',
    '  { "subject": "ship", "attribute": "position", "value": "<destination',
    '  name>" }. The "ship" subject is reserved for the command vehicle;',
    '  the value is matched against known settlements, planets, and',
    '  locations, so prefer an established place name over an invented',
    '  phrase. Do not emit it when the ship has not moved.',
    '- Do not declare a truth that diverges from the active scene block. If',
    '  a fact needs to change, the player or GM will retract the old one.',
  ];

  if (sceneFrameEnabled) {
    lines.push(
      '- "sceneFrame" is a full snapshot of the scene as it stands AFTER',
      '  your narration: where the scene is set, every named character',
      '  present or directly engaged (include characters on comms), and the',
      '  situation in one sentence. Include it on EVERY response — it',
      '  replaces the previous snapshot. Keep names exactly as established.',
    );
  }

  if (mode === 'inciting_incident') {
    lines.push(
      '',
      'THIS IS THE CAMPAIGN\'S OPENING SCENE. Its premise must survive into',
      'later sessions, so your sidecar MUST capture the load-bearing facts:',
      '- newTruths for: who the central NPC is and their history with the',
      '  character; why they are where they are; what is at stake and what',
      '  fails if the character is too late (the deadline).',
      '- stateChanges for: the central NPC\'s current location (vessel or',
      '  structure included) and physical condition.',
      '- REQUIRED: the player\'s STARTING position. Your opening scene places',
      '  the character (and their ship) somewhere — emit',
      '  { "subject": "ship", "attribute": "position", "value": "<starting',
      '  place>" } recording it, preferring an established settlement or',
      '  location name. Without it, later "where am I" answers have no anchor.',
    );
  }

  return lines.join('\n');
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

  // ── Scene frame (Cluster A4) ─────────────────────────────────────────────
  // The narrator-maintained snapshot of the active scene. Subjects named in
  // the frame's `present` list are treated as mentioned this turn, so their
  // ledger entries stay in scope even when the player's message doesn't name
  // them (the conversation-partner case — see narrator-memory architecture).
  const sceneFrameEnabled = options?.sceneFrameEnabled !== false;
  const frame = sceneFrameEnabled && campaignState?.sceneFrame
    && typeof campaignState.sceneFrame === 'object'
    ? campaignState.sceneFrame
    : null;
  const presentNames = Array.isArray(frame?.present)
    ? frame.present.filter(p => typeof p === 'string' && p.trim())
    : [];
  const scopeText = presentNames.length
    ? `${narration} ${presentNames.join(' ').toLowerCase()}`
    : narration;

  // ── Filter truths ────────────────────────────────────────────────────────
  const truthLines = [];
  for (const t of truths) {
    if (!t || t.retracted) continue;
    if (!isSubjectInScope(t.subject, matchedIds, scopeText)) continue;
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
    if (!isSubjectInScope(subjectForKey, matchedIds, scopeText)) continue;
    const label = formatSubjectLabel(subjectForKey, nameLookup);
    for (const e of entries) {
      const attr  = String(e?.attribute ?? '').trim();
      const value = e?.value;
      if (!attr || value === undefined || value === null || value === '') continue;
      stateLines.push(`  ${label} — ${attr}: ${value}`);
    }
  }

  // ── Render the frame block ───────────────────────────────────────────────
  // Confirmed-lore tier: never dropped under budget pressure (like the ship
  // line) — losing "where we are and who is here" is how drift starts.
  const frameLines = [];
  if (frame) {
    if (frame.location)      frameLines.push(`  Where:   ${frame.location}`);
    if (presentNames.length) frameLines.push(`  Present: ${presentNames.join(', ')}`);
    if (frame.situation)     frameLines.push(`  Now:     ${frame.situation}`);
  }
  const frameBlock = frameLines.length
    ? ['SCENE FRAME (the scene as it stands):', ...frameLines].join('\n')
    : '';

  // ── Ship position (§20) ──────────────────────────────────────────────────
  // The command vehicle's persistent position record is fact-continuity
  // confirmed-lore tier — it is never dropped under budget pressure and
  // renders even when truths / state are otherwise empty. Returns "" when
  // no command vehicle exists or its position record is blank.
  const shipPositionLine = buildShipPositionLine(campaignState);

  // ── Empty short-circuit ──────────────────────────────────────────────────
  if (!truthLines.length && !stateLines.length && !shipPositionLine && !frameBlock) {
    return {
      header: '', frame: '', truths: '', state: '', shipPosition: '', combined: '',
      tokenEstimates: { header: 0, frame: 0, truths: 0, state: 0, ship: 0 },
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  // Header only renders when there are truths, state, or a frame to
  // introduce — the SHIP POSITION line stands on its own when it's the only
  // thing in the block (§20).
  const header = (truthLines.length || stateLines.length || frameBlock)
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
  // Ship position and the scene frame count toward the budget for telemetry
  // but are never dropped — both are confirmed-lore tier (scope §20.5;
  // narrator-memory architecture A4). State drops first when the cap is
  // exceeded.
  const tokenEstimates = {
    header: estimateTokens(header),
    frame:  estimateTokens(frameBlock),
    truths: estimateTokens(truthsBlock),
    state:  estimateTokens(stateBlock),
    ship:   estimateTokens(shipPositionLine),
  };
  let total = tokenEstimates.header + tokenEstimates.frame + tokenEstimates.truths
            + tokenEstimates.state + tokenEstimates.ship;
  if (total > maxTokens && stateBlock) {
    stateBlock = '';
    tokenEstimates.state = 0;
    total = tokenEstimates.header + tokenEstimates.frame
          + tokenEstimates.truths + tokenEstimates.ship;
  }

  const combined = [header, frameBlock, truthsBlock, stateBlock, shipPositionLine]
    .filter(Boolean)
    .join('\n\n');

  return {
    header,
    frame:        frameBlock,
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
    // Lone-ship fallback: a single tracked starship is the command vehicle
    // even when nothing has set the isCommandVehicle flag yet.
    if (!actor) {
      const starships = ids
        .map(id => globalThis.game?.actors?.get?.(id))
        .filter(a => a?.type === 'starship');
      if (starships.length === 1) {
        actor   = starships[0];
        payload = actor.flags?.[MID]?.ship ?? null;
      }
    }
    if (!actor) return '';

    const name  = actor?.name ?? payload?.name ?? '';
    const lines = [];

    // Identity line — always present so the narrator knows the command
    // vehicle exists and its name, even before any position is established.
    const idParts = [];
    if (payload?.type)      idParts.push(String(payload.type).trim());
    if (payload?.firstLook) idParts.push(`first look: ${String(payload.firstLook).trim()}`);
    if (payload?.mission)   idParts.push(`mission: ${String(payload.mission).trim()}`);
    if (typeof payload?.integrity === 'number') {
      const max     = payload.integrityMax ?? 5;
      const impacts = [payload.battered && 'battered', payload.cursed && 'cursed'].filter(Boolean);
      idParts.push(`integrity ${payload.integrity}/${max}${impacts.length ? ` [${impacts.join(', ')}]` : ''}`);
    }
    lines.push(`COMMAND VEHICLE: ${name || 'Unknown ship'}${idParts.length ? ` — ${idParts.join('; ')}` : ''}`);

    // Position line — when the record carries information. When it doesn't,
    // say so explicitly: with no position signal the narrator confidently
    // improvises one from the campaign premise (v1.7.10 finding #5 — the
    // ship sat near Astra on the map while "where am I" answered Mudd).
    const posLine = formatShipPositionLine(payload?.position, campaignState, name);
    if (posLine) {
      lines.push(posLine);
    } else {
      lines.push(
        'SHIP POSITION: not yet established — do NOT assert or invent where '
        + 'the ship is. If the player asks where they are, say their position '
        + 'has not been established yet and suggest anchoring it (the GM can '
        + 'type !at <place> or position the ship token on the sector map).',
      );
    }

    return lines.join('\n');
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
    ['pronouns',         'Pronouns'],
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
const NARRATOR_MODES = new Set([
  'move_resolution',
  'paced_narrative',
  'scene_interrogation',
  'oracle_followup',
  'session_vignette',   // Begin Session opening vignette — see src/session/galleyVignette.js
  'inciting_incident',  // Campaign-launch inciting incident — see src/session/incitingIncident.js
]);

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

  oracle_followup:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `weave a rolled oracle result into the current scene as vivid, atmospheric prose.\n\n` +
    `The player has rolled an oracle table or asked the Oracle a yes/no question. The ` +
    `mechanical result is given to you verbatim. Render it as 2-3 sentences anchored to ` +
    `the current scene: describe what the player sees, hears, or learns as the oracle's ` +
    `answer manifests in the fiction. Do not repeat the d100 number, the threshold, or ` +
    `the literal table text — transform it into narrative.`,

  session_vignette:
    `You are the narrator for an Ironsworn: Starforged campaign. Your role is to render ` +
    `a session-bookend vignette — a short atmospheric scene that brackets the play ` +
    `session itself.\n\n` +
    `Two flavours, distinguished by the user message:\n\n` +
    `BEGIN — active PCs together in a quiet downtime moment (the ship's galley, etc.), ` +
    `bantering about what the absent crewmates might be up to. TONE OVERRIDE for ` +
    `BEGIN: WRY AND ABSURD. Affectionate ribbing about absent crewmates, vivid specific ` +
    `food or activity for the present ones, weird little crew-life details. Not ` +
    `cynical, not sneering — fond, observed, a little odd.\n\n` +
    `END — a single important NPC (an established connection, a recurring threat, a ` +
    `faction figurehead) caught doing something trivial and mundane, in a place the ` +
    `players are NOT. TONE OVERRIDE for END: WRY AND OBSERVED, slice-of-life. The ` +
    `cosmic threat eating a sandwich; the rival captain taking inventory of spare ` +
    `parts; the bonded ally watering houseplants. Specific, small, almost tender.\n\n` +
    `Both flavours: end the vignette on a beat that closes (END) or hands the scene ` +
    `over (BEGIN). Do not describe a move, do not propose a mechanical action — depict ` +
    `the calm before / the calm after, not the start or end of the action.`,

  inciting_incident:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `envision the campaign's INCITING INCIDENT — the dramatic opening event that ` +
    `launches the campaign and sets up the player's first vow.\n\n` +
    `Ground the incident ONLY in what is already established: the World Truths, the ` +
    `starting sector and its settlements, the local connection (an important NPC), the ` +
    `character — plus the oracle spark (Action + Theme) given in the user message, which ` +
    `you interpret loosely as inspiration, never quoting it literally. Write 4-6 ` +
    `sentences of vivid prose that drop the character into a charged situation demanding ` +
    `action. Do not resolve it; leave the player poised to make the first move. Do not ` +
    `invent proper nouns beyond what the truths / sector / connection already establish.\n\n` +
    `The "depict, do not offer" rule governs the PROSE BODY. AFTER the prose, append a ` +
    `short structured proposal block — each item on its own line, in this order and ` +
    `these exact forms:\n\n` +
    `Suggested vow: <a short first-person vow statement> (<rank>)\n` +
    `Suggested clock: <a short clock label> (<segments> segments)\n` +
    `Vow target: <Name> — <2-3 sentences on one line: who they are, their history with ` +
    `the character, and their current situation and condition>\n\n` +
    `Rules for the block: <rank> is exactly one of: troublesome, dangerous, formidable, ` +
    `extreme, epic. The "Suggested vow" line is always present. The "Suggested clock" ` +
    `line appears ONLY when the incident carries explicit time pressure (something fails, ` +
    `expires, or arrives if the character is too slow) — <segments> is one of 4, 6, 8, ` +
    `10, 12 (fewer segments = tighter deadline); omit the line entirely for vows without ` +
    `a deadline. The "Vow target" line appears when the vow concerns a specific person, ` +
    `creature, faction, or vessel — use their established name, keep the whole line ` +
    `single-line. This trailing block is the one place you propose mechanics; keep all ` +
    `of it out of the prose body itself.`,
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
 *   4a. Campaign truths                     (foundry-ironsworn digest, when present)
 *   4b. Campaign premise                    (inciting incident as canon; never dropped)
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
    factContinuitySceneFrame      = true,
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
    party                = null,
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

  // [4b] Campaign premise — the inciting incident as durable canon. Campaign-
  //      level and never dropped (unlike the scene-scoped §6.5 ledger), so the
  //      opening premise can't age out of the ring or be cleared at scene end
  //      (PLAYTEST-1712 S).
  const incitingBlock = buildIncitingIncidentBlock(campaignState);
  if (incitingBlock) parts.push(incitingBlock);

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
      sceneFrameEnabled: factContinuitySceneFrame,
    });
    if (ledger.combined) parts.push(ledger.combined);
  }

  // [7] Active connections summary (legacy — connection names/roles only)
  const connections = buildConnectionsSummary(campaignState);
  if (connections) parts.push(connections);

  // [8] Character
  if (character) parts.push(buildCharacterBlock(character));

  // [8b] Party roster — multiplayer speaker disambiguation. Rendered only
  // when more than one player character shares the campaign; names the PC
  // speaking this turn so narration never conflates the party members.
  const partyBlock = buildPartyBlock(party);
  if (partyBlock) parts.push(partyBlock);

  // [9] Fact-continuity sidecar instruction — appended last so it is the most
  // recent guidance the model sees before generating. Applies to every mode,
  // gated by the master Fact Continuity setting. Mode-aware: the inciting
  // incident gets a premise-capture addendum (narrator-memory architecture
  // A2); the sceneFrame key is included only when the A4 frame is enabled.
  if (factContinuityEnabled) {
    parts.push(appendSidecarInstruction({
      mode:              resolvedMode,
      sceneFrameEnabled: factContinuitySceneFrame,
    }));
  }

  // [10] Audio NPC-dialogue markup instruction — appended only when audio
  // narration is enabled. Tells the narrator to wrap NPC speech with
  // <npc>…</npc> so the audio pipeline can dispatch a distinct voice. See
  // docs/audio/audio-narration-scope.md §6.
  const audioMarkupEnabled = extras?.audioMarkupEnabled === true;
  if (audioMarkupEnabled) {
    parts.push(appendNpcMarkupInstruction());
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
export function buildSceneUserMessage(question, recentContext, sentenceTarget, speakerName = null) {
  const parts = [];

  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) {
    parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);
  }

  const speaker = typeof speakerName === 'string' && speakerName.trim()
    ? speakerName.trim()
    : null;
  parts.push(
    `## PLAYER QUESTION${speaker ? ` — asked by ${speaker}` : ''}\n\n` +
    `${speaker ? `${speaker}: ` : ''}"${sanitizePlayerText(question)}"`,
  );

  parts.push(
    `Answer this question with ${sentenceTarget}–${sentenceTarget + 1} sentences of atmospheric ` +
    `description. Do not introduce new plot elements. Stay grounded in what has already been ` +
    `established. The narrator is a camera, not a writer, in this mode.` +
    (speaker ? ` The character asking is ${speaker}.` : ''),
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
export function buildPacedNarrativeUserMessage(playerText, recentContext, sentenceTarget, suggestedMove, speakerName = null) {
  const parts = [];

  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) {
    parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);
  }

  const speaker = typeof speakerName === 'string' && speakerName.trim()
    ? speakerName.trim()
    : null;
  parts.push(
    `## PLAYER NARRATION${speaker ? ` — spoken by ${speaker}` : ''}\n\n` +
    `${speaker ? `${speaker}: ` : ''}"${sanitizePlayerText(playerText ?? '')}"`,
  );
  if (speaker) {
    parts.push(
      `The character speaking and acting this turn is ${speaker}. Attribute the ` +
      `actions and dialogue in the input to ${speaker}, not to any other player character.`,
    );
  }

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
export function buildNarratorUserMessage(resolution, playerNarration, sentenceTarget, speakerName = null) {
  const parts = [];

  const moveOutcome = resolution?.loremasterContext ?? '';
  if (moveOutcome) {
    parts.push(`## MOVE OUTCOME\n\n${moveOutcome}`);
  }

  const speaker = typeof speakerName === 'string' && speakerName.trim()
    ? speakerName.trim()
    : null;
  const cleanedPlayerNarration = sanitizePlayerText(playerNarration);
  if (cleanedPlayerNarration) {
    parts.push(
      `## PLAYER NARRATION${speaker ? ` — spoken by ${speaker}` : ''}\n\n` +
      `${speaker ? `${speaker}: ` : ''}"${cleanedPlayerNarration}"`,
    );
  }

  parts.push(
    `Narrate the consequence in ${sentenceTarget} sentence${sentenceTarget !== 1 ? 's' : ''}. ` +
    `Stay in the fiction. Do not explain the mechanical outcome — embody it.` +
    (speaker ? ` The character who made this move is ${speaker}.` : ''),
  );

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Section builders (pure — no async, no Foundry API)
// ---------------------------------------------------------------------------

/**
 * Render the multiplayer party roster (section [8b]). Returns '' unless
 * the party carries two or more PCs — solo play needs no disambiguation.
 * Exported for unit testing.
 *
 * @param {{ names: string[], speaking?: string|null }|null} party
 * @returns {string}
 */
export function buildPartyBlock(party) {
  const names = Array.isArray(party?.names)
    ? party.names.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
    : [];
  if (names.length < 2) return '';

  const speaking = typeof party?.speaking === 'string' && party.speaking.trim()
    ? party.speaking.trim()
    : null;
  const roster = names
    .map(n => (speaking && n === speaking ? `${n} (speaking this turn)` : n))
    .join(', ');

  return [
    '## PARTY',
    '',
    `This is a multiplayer campaign. Player characters: ${roster}.`,
    'Each chat input belongs to exactly one of them — attribute actions and',
    'dialogue to the named speaker only, and never merge the player',
    'characters into a single "you". Other PCs are present in the scene',
    'only when the fiction or the scene frame says so.',
  ].join('\n');
}

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

/**
 * Campaign premise block — the inciting incident's load-bearing fiction,
 * captured once at the campaign's outset (`campaignState.incitingIncident`,
 * written by `runIncitingIncident`) and injected as canon into EVERY narrator
 * call. Campaign-level and never dropped: it gives the opening premise (who /
 * where / timeframe / stakes / deadline) a durable home so it can't age out of
 * the recent-narration ring or be cleared at scene end (PLAYTEST-1712 S — the
 * inciting incident drifted and the end-of-session recap crystallised the drift
 * because the premise had no permanent home). Returns '' until composed.
 */
function buildIncitingIncidentBlock(campaignState) {
  const ii    = campaignState?.incitingIncident;
  const prose = typeof ii?.prose === 'string' ? ii.prose.trim() : '';
  if (!prose) return '';

  const lines = [
    '## CAMPAIGN PREMISE',
    '',
    'The inciting incident below opened the campaign. Treat it as canon: its',
    'people, places, timeframe, and stakes are established fact — never',
    'contradict, re-date, or reinvent them.',
    '',
    prose,
  ];

  const target = ii.target;
  if (target?.name) {
    lines.push('', `Central figure: ${target.name}${target.description ? ` — ${target.description}` : ''}`);
  }
  const vow = ii.vow;
  if (vow?.statement) {
    lines.push(`At stake (first vow): ${vow.statement}${vow.rank ? ` (${vow.rank})` : ''}`);
  }
  const clock = ii.clock;
  if (clock?.label) {
    lines.push(`Deadline: ${clock.label}${clock.segments ? ` (${clock.segments}-segment clock)` : ''}`);
  }

  return lines.join('\n');
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

  const idBits = [];
  if (character.callsign) idBits.push(`"${character.callsign}"`);
  if (character.pronouns) idBits.push(character.pronouns);
  lines.push(`Name: ${character.name ?? 'Unknown'}${idBits.length ? ` (${idBits.join(', ')})` : ''}`);

  if (character.description) lines.push(`Description: ${character.description}`);

  // Player-authored backstory from the character sheet (Biography / Notes tab).
  const bio = (character.biography ?? '').trim();
  if (bio) lines.push(`Biography: ${bio}`);
  const charNotes = (character.notes ?? '').trim();
  if (charNotes) lines.push(`Notes: ${charNotes}`);

  // GM/narrator-facing notes (legacy field names retained for back-compat).
  const narratorNotes = character.narratorNotes ?? character.loremasterNotes ?? '';
  if (narratorNotes) lines.push(`Notes for narrator: ${narratorNotes}`);

  if (character.stats) {
    const { edge = 0, heart = 0, iron = 0, shadow = 0, wits = 0 } = character.stats;
    lines.push(`Stats: Edge ${edge}, Heart ${heart}, Iron ${iron}, Shadow ${shadow}, Wits ${wits}`);
  }

  if (character.meters) {
    const { health = 5, spirit = 5, supply = 5, momentum = 2 } = character.meters;
    lines.push(`Current state: Health ${health}/5, Spirit ${spirit}/5, Supply ${supply}/5, Momentum ${momentum}`);
  }

  // Marked impacts only — the active debilities the narrator should weave in.
  const marked = character.debilities
    ? Object.entries(character.debilities).filter(([, v]) => v === true).map(([k]) => k)
    : [];
  if (marked.length) lines.push(`Impacts: ${marked.join(', ')}`);

  // Paths / assets — name plus enabled ability text, so the narrator can
  // reference what the character is actually capable of.
  const assets = Array.isArray(character.assets) ? character.assets : [];
  if (assets.length) {
    lines.push('Assets & paths:');
    for (const a of assets) {
      const abilities = Array.isArray(a.abilities) ? a.abilities.filter(Boolean) : [];
      const summary = abilities.length ? ` — ${abilities.join(' ')}` : '';
      lines.push(`  - ${a.name}${summary}`);
    }
  }

  // Vows — spotlight the background (founding) vow, then active others.
  const vows = Array.isArray(character.vows) ? character.vows : [];
  if (vows.length) {
    const bg     = vows.find(v => v.isBackground);
    const others = vows.filter(v => !v.isBackground && !v.completed);
    if (bg)            lines.push(`Background vow: ${bg.name} (${bg.rank})`);
    if (others.length) lines.push(`Other vows: ${others.map(v => `${v.name} (${v.rank})`).join('; ')}`);
  }

  // Connections (bonds) the character holds.
  const connections = Array.isArray(character.connections) ? character.connections : [];
  if (connections.length) {
    lines.push(`Connections: ${connections.map(c => `${c.name} (${c.rank})`).join('; ')}`);
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
