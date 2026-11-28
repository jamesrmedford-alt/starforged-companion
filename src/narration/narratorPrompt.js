// src/narration/narratorPrompt.js
// Pure string-building functions for the narrator system prompt and user message.
// No Foundry API calls — all inputs are passed in; safe to call in tests. One
// exception: the safety block reads the building client's user and that user's
// Private Lines setting (formatNarratorSafetyContext, src/context/safety.js).

import { decodeHtmlEntities } from '../system/htmlEntities.js';
import { formatNarratorSafetyContext } from '../context/safety.js';
import { formatShipPositionLine } from '../factContinuity/shipPosition.js';
import { subjectFromStateKey, WHEREABOUTS_ATTRIBUTES } from '../factContinuity/ledgers.js';
import { sessionRetractedFacts } from '../factContinuity/retractions.js';
import { normaliseLetGo, touchesLetGo, binds, entryBasis, inColourWindow } from '../factContinuity/provenance.js';
import { formatNameChangesBlock, writeNewNames } from '../factContinuity/nameChanges.js';
import { actorNames } from '../character/actorBridge.js';
import { resolveEntityById, withSheetNotes } from '../entities/registry.js';
import { isLoneShipCandidate } from '../entities/ship.js';
import { PORTRAIT_BLOCK_RE } from '../art/notesPortrait.js';
import { lengthPhrase, sentenceRule } from './proseVariety.js';
import { obligationsFor, formatObligationsBlock } from '../moves/contracts/obligations.js';
import { connectionStanding } from '../moves/situation.js';
import { vowAsksWho } from '../world/tellingWords.js';
import { pronounsIn } from '../factContinuity/pronouns.js';

/**
 * The scene's own lines for a beat's obligations block (overhaul 2 §10.3 —
 * TELL [scene], NOT SO [letgo]; factContinuity/sceneTurns.js
 * sceneObligations), as the narration's caller hands them in: well-formed
 * `{ kind, list, text }` lines only.
 *
 * @param {unknown} lines
 * @returns {Array<{ kind: string, list: string, text: string }>}
 */
function sceneLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter(o => o && typeof o.kind === 'string' && typeof o.list === 'string'
    && typeof o.text === 'string' && o.text.trim());
}

// ---------------------------------------------------------------------------
// Fact-continuity sidecar instruction — fact-continuity scope §7
// ---------------------------------------------------------------------------

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

/**
 * Mandatory sidecar response-format instruction appended to every narrator
 * system prompt. Tells the narrator to emit prose followed by a single
 * fenced JSON block describing new truths and state changes. The block is
 * parsed off-screen by src/factContinuity/sidecarParser.js and stripped
 * before the prose reaches chat.
 *
 * Returns a single string ready to push onto the system-prompt parts array.
 *
 * @param {{ mode?: string, sceneFrameEnabled?: boolean, skeletonsEnabled?: boolean }} [options]
 * @returns {string}
 */
export function appendSidecarInstruction(options = {}) {
  const mode              = typeof options.mode === 'string' ? options.mode : 'move_resolution';
  const sceneFrameEnabled = options.sceneFrameEnabled !== false;
  const skeletonsEnabled  = options.skeletonsEnabled === true;

  const exampleLines = [
    '    ```json',
    '    {',
    '      "newTruths": [',
    '        { "subject": "Vance", "fact": "holds the crate the PC handed him", "from": "line" },',
    '        { "subject": "Vance", "fact": "Walks with a slight limp" }',
    '      ],',
    '      "stateChanges": [',
    '        { "subject": "Vance",     "attribute": "location", "value": "aboard his shuttle", "from": "line" },',
    '        { "subject": "cargo bay", "attribute": "door",     "value": "open"   }',
    '      ]' + (sceneFrameEnabled ? ',' : ''),
  ];
  if (sceneFrameEnabled) {
    exampleLines.push(
      '      "sceneFrame": {',
      '        "location":  "Lyra\'s orbital graveyard",',
      '        "present":   ["Venri Quint (she/her)"],',
      '        "remote":    ["Vance"],',
      '        "situation": "Hailing Vance\'s shuttle across the debris field",',
      '        "question":  "Will Vance let them board?"',
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
    // Overhaul 2 §5.4 (D5): it read "A newTruth is binding" — every fact the
    // narration wrote bound later narration and was filed as canon at its
    // scene's end. A fact says where it comes from; code checks the claim
    // against the beat's own words (factContinuity/provenance.js factBasis).
    // Issue #402, D1: "result" is no tag — what the dice decided (the stakes
    // line a rolled move's outcome delivered, an oracle's answer) the table
    // files itself (narrator.js moveDiceFacts, ledgers.js fileDiceFact).
    '- A "newTruth" records a fact your prose establishes. Say where it comes',
    '  from: "from": "line" when the player\'s line says it — what their',
    '  character does, says, gives, carries, where they go. Leave "from" out',
    '  when it is your own description, or the outcome of the move or the',
    '  oracle\'s answer told in your words: what the dice decided, the table',
    '  records itself. Only "line" facts bind later narration; the rest are',
    '  kept for this scene as colour and then let go.',
    '- A "stateChange" is what is true right now. Use it for posture, mood,',
    '  visible state, door positions, lighting, weather. These supersede',
    '  prior state for the same subject + attribute. Say where it comes from',
    '  as for a newTruth.',
    // The tag is the only way a narrator fact binds (§5.2, D5 — no lexical
    // rule): a fact the player's own line states, left untagged, is colour and
    // never becomes LAST KNOWN. The example's facts pass the floor against
    // their own line (provenanceFloor.test.js).
    '- A fact the player\'s own line states is always tagged "from": "line" —',
    '  what their character does, says, gives or carries, and where they and',
    '  whoever is with them are — in the line\'s own words. E.g. the line "I',
    '  hand Kael the datapad and wait with him in the cargo bay" states',
    '  { "subject": "Kael Dros", "fact": "holds the datapad the PC handed him",',
    '  "from": "line" } and { "subject": "Kael Dros", "attribute": "location",',
    '  "value": "in the cargo bay with the PC", "from": "line" }.',
    // RECAP-TOLD-A-PLACE-SHE-HAD-LEFT (issue #397, Code fix 3): a player
    // character's own place in a state change bound and went stale as the
    // frames moved her on; the frame's location is its one store
    // (placeClaims.js drops such an entry — the matched pair).
    ...(sceneFrameEnabled ? [
      '  Where the player characters themselves are is "sceneFrame"\'s',
      '  "location" alone: no stateChange says it.',
    ] : []),
    // Players can't overrule dice (issue #389 #2): the line binds the
    // character's own acts and words, never what the dice decided otherwise.
    '- A line that takes for granted what the dice decided otherwise — the',
    '  wreck of a ship the dice sent fleeing, a dead man talking — does not',
    '  make it so: narrate what the dice made true, and tag none of what the',
    '  line assumed "line".',
    '- REQUIRED: when your prose establishes or changes WHERE a named',
    `  character${sceneFrameEnabled ? ' other than a player character' : ''} is (their location, the vessel or structure they are`,
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
    '- REQUIRED: when your prose establishes a concrete specific the table may',
    '  bring up later — an object handed over or taken, a price or a debt, a',
    '  code or password, a count, a deal or a promise, a name said in passing,',
    '  a mark or injury — you MUST emit a newTruth recording it exactly (the',
    '  item, the number, the words), e.g. { "subject": "Kael Dros", "fact":',
    '  "gave the PC the brass key to cargo locker 7" }. At most five of these',
    '  per response: the ones most likely to matter later.',
    '- Name sparingly. Give a proper name only to a character who will matter',
    '  beyond this moment. Leave one-off functionaries generic and unnamed — "a',
    '  dock worker", "the comms officer", "a guard" — so they stay light and',
    '  freely mutable rather than entering the record. A name is a commitment to',
    '  keep that character consistent forever; do not spend it on a spear-carrier.',
    // Worded for both layouts (issue #362 AC66): with a world snapshot the
    // cards are in WORLD SNAPSHOT and there is no ENTITIES IN SCENE, which the
    // rule named — read as written it asked for an anchor for every recorded
    // NPC a narration named. The other rules that pointed at a per-beat
    // section the snapshot replaces (the third-person pronouns, DISCOVERY's
    // reuse, the inciting incident's role and addendum) name none either.
    '- REQUIRED: the first time your prose introduces or names a character or',
    '  faction who has no card of their own in this prompt (a "NAME — Type"',
    '  heading over ESTABLISHED FACTS), emit a newTruth',
    '  anchoring their identity — who or what they are, their role',
    '  in this context, their agenda, their relationship to the player',
    '  character, and (for a person) the pronouns your prose used for them —',
    '  e.g. { "subject": "Kael Dros", "fact": "dockmaster at Bleakhold',
    '  Station (he/him); meeting the PC here for the first time" } or',
    '  { "subject": "Khatri Syndicate", "fact": "bounty-hunting cartel;',
    '  pursuing the PC for an outstanding debt" }. Without this anchor,',
    '  the same entity can be written differently — or regendered — each',
    '  turn.',
    '- A subject is the name as it appears in the scene. If the subject is',
    '  the scene itself (lighting, weather, ambient sound) use "scene".',
    // Overhaul 2 §6.2 (SHIP-POSITION-AND-FRAME-DISAGREE): it read "when your
    // prose moves" the ship — the fourth live run's a38 moved it in the
    // player's line ("drops out of the dark off Bleakhold's ring. I spin the
    // Kobayashi IV to face her"), nothing recorded it, and the frame said
    // "open space" while the ship's record said docked.
    '- REQUIRED: when the player\'s line or your prose puts the player\'s',
    '  command vehicle somewhere its position does not say — departure,',
    '  transit, arrival, undocked, under way, in a fight off the station —',
    '  emit the exact shape { "subject": "ship", "attribute": "position",',
    '  "value": "<where she is now>" }. The "ship" subject is reserved for the',
    '  command vehicle; the value is matched against known settlements,',
    '  planets, and locations, so prefer an established place name over an',
    '  invented phrase. Do not emit it when the ship has not moved.',
    '- Do not declare a truth that diverges from WHAT BINDS. What the narration',
    '  has described may change when the player\'s line changes it.',
    '- Do not re-emit a newTruth that restates a fact already shown in the',
    '  ACTIVE SCENE block — identity anchors are recorded once, the first',
    '  time. Never re-assert a fact listed under CORRECTED.',
  ];

  if (sceneFrameEnabled) {
    lines.push(
      // Overhaul 2 §6.1, §7.1 (FRAME-REASONING-IN-PROSE): the frame sat
      // under "binding", and the narration argued its own Where against the
      // player's line ("You are no longer at Tamsin's stall, so…"). The
      // place is the stores'; the frame is the narration's own.
      '- "sceneFrame" describes the scene as your narration leaves it; the',
      '  player\'s line moves it. "location": where the characters are, in a',
      '  few words — a room, a street, a deck, a stall — never where the ship',
      '  is in space: the ship\'s position says that, and a move of the ship is',
      // Issue #397, Code fix 5: it asked for "every named character here in
      // person" — no unnamed figure (r7 a63, r8 a68 and a72 left theirs out,
      // though the same block's stateChanges named them), and nothing of the
      // player characters (round 8's lists left Mira out of 40 of 68).
      '  a ship/position change. "present": everyone here in person — each',
      '  player character in the scene, by name; each named character; and an',
      '  unnamed figure by a short handle, the same words the fact block\'s',
      '  stateChanges use for them, kept the same from beat to beat; "remote": a',
      '  named character heard or seen over a comm, a screen or a call — never in',
      // Issue #402, change 2: an unnamed person's pronoun had nowhere to live
      // but a card — round 10's clerk was "her", then "he" after the break.
      '  "present". An entry may end with its person\'s pronouns as your prose',
      '  gives them — "customs clerk (she/her)"; the first set given is kept for',
      '  them. "situation": the',
      '  situation in one sentence. Include it on EVERY response — it replaces',
      '  the previous snapshot. Keep names exactly as established. When the',
      '  player\'s line has moved the scene within the characters\' place, write',
      '  it where the line put it, and never explain a difference in the prose;',
      '  a line never takes them to another place — that is a journey\'s move.',
      // Known-issues NARRATOR-REFRAINS: the rule read "Set it on the scene's
      // first beat; afterwards copy it unchanged … it is kept for the scene",
      // and nothing ends a scene but the table — a session's opening hook was
      // its question for the whole session, rung at the end of every beat. A
      // question is the player's line's, and one play leaves unanswered is
      // let go (narrator.js SCENE_QUESTION_BEATS; THE SCENE then asks
      // for the next — buildLedgerBlock's `askSceneQuestion`). Since overhaul
      // 2 (§7.2–7.3, REFRAIN-OUTLIVES-THE-QUESTION) the code holds both: a
      // question that shares no word with the player's line is not set, and a
      // let-go one — under PLAY LET THESE GO — is not set again in any words.
      '- "question" (inside "sceneFrame") is what this scene is deciding now, in a',
      '  few words, and it is the player\'s: when the player\'s latest line sets out',
      '  to settle something, set that, in a few words that use the line\'s own;',
      '  when it does not, or no line prompted this beat, set none — never a hook',
      '  of your own. While THE SCENE shows what it turns on, copy it unchanged. When',
      '  this beat answers it, add "questionAnswered": true and end the beat on a',
      '  cut forward — to the consequence, the next place or a later hour — not on',
      '  another exchange in the same room. A question play left unanswered is',
      '  listed under PLAY LET THESE GO: do not set it again, in any words, and do',
      '  not bring it back in your prose, unless the player\'s line takes it up.',
      // Overhaul 2 §4.5 (D1, reversing issue #353 R2's "scenes stay manual"):
      // the stores turn the scene; the narration's word never does.
      '  The scene turns when the place or the situation changes; your fact block',
      '  never ends one.',
    );
  }

  // The narrative skeleton (issue #353 Phase 1): a question the prose poses
  // gets a hidden answer, rolled and kept (src/world/secrets.js).
  if (skeletonsEnabled) {
    lines.push(
      '- When your prose poses a question or a mystery the characters are',
      '  meant to answer — a question an NPC presses on them, an unexplained',
      '  sign, a puzzle the scene turns on — emit it once, as',
      '  "openQuestions": [{ "question": "<the question, in a few words>",',
      '  "about": "<who or what it concerns>" }]. Do not answer it in the',
      '  prose. Do not emit a question already listed under UNREVEALED.',
      '- When your prose starts a countdown — a count, a deadline, "before it',
      '  asks again" — emit it once, as "countdown": { "label": "<what is',
      '  counting down, in a few words>", "about": "<the id from UNREVEALED it',
      '  belongs to, or who or what it concerns>" }. Not for one already',
      '  running (see CLOCKS).',
      // Issue #354 P2-29: an enemy got a plan only when a rolled price was
      // "A new enemy is revealed" — rare, now a miss pays its stated outcome.
      '- When your prose brings in a new enemy or danger the story will have',
      '  to deal with — a pursuer, a rival, a hostile presence, something',
      '  hunting or closing in — emit it once, as "newThreats": [{ "name":',
      '  "<what your prose calls it, in a few words>" }]. Not for a hazard',
      '  this beat ends, a player character, or anything already under',
      '  UNREVEALED or among the threats, under any name.',
    );
  }

  const addendum = sidecarModeAddendum(mode);
  if (addendum) lines.push('', addendum);

  return lines.join('\n');
}

/**
 * What a mode adds to the sidecar instruction — the opening scene's
 * premise-capture rules (narrator-memory architecture A2), a session
 * set-piece's "builtFrom" (issue #381); '' for every other
 * mode. On its own so the instruction itself is the same for every mode: it
 * sits in the system prompt's standing block, which is cached across modes,
 * and this goes in the per-narration block (issue #354 P2-23).
 *
 * @param {string} mode
 * @returns {string}
 */
export function sidecarModeAddendum(mode) {
  // A session set-piece's account of its rolled material (issue #381): the
  // one key this mode adds to the fact block. The same text for every call of
  // the mode — the material itself is in the user message.
  if (mode === 'session_vignette') {
    return [
      'A session set-piece is built from the MATERIAL its user message gives:',
      'results rolled for this scene. When the message carries MATERIAL, your',
      'JSON block MUST also carry "builtFrom": one entry for each numbered',
      'result, with the three to eight words of your prose that are it, exactly',
      'as you wrote them —',
      '[{ "n": 1, "words": "<words of your prose>" }, { "n": 2, "words": "…", "second": true }].',
      '"second": true only when you set a result aside for the one in brackets',
      'under it. A result the scene did not use gets no entry: never claim one',
      'the prose does not hold. With no MATERIAL, leave "builtFrom" out.',
    ].join('\n');
  }
  if (mode !== 'inciting_incident') return '';
  return [
    'THIS IS THE CAMPAIGN\'S OPENING SCENE. Ground it in the established',
    'sector: when an existing NPC (one recorded for the sector) or settlement',
    'trouble can carry the incident, build on them rather than cold-inventing',
    'a new NPC, and never give a settlement an authority figure its Authority',
    'rules out (a lawless settlement has no administrator or governor).',
    'Its premise must survive into',
    'later sessions, so your sidecar MUST capture the load-bearing facts:',
    '- newTruths for: who the central NPC is and their history with the',
    '  character; why they are where they are; and what is at stake. Only if',
    '  the situation is genuinely time-gated, also what worsens if the',
    '  character is too slow — many openings have no deadline, so do not',
    '  invent one.',
    '- stateChanges for: the central NPC\'s current location (vessel or',
    '  structure included) and physical condition.',
    '- REQUIRED: the player\'s STARTING position. Your opening scene places',
    '  the character (and their ship) somewhere — emit',
    '  { "subject": "ship", "attribute": "position", "value": "<starting',
    '  place>" } recording it, preferring an established settlement or',
    '  location name. Without it, later "where am I" answers have no anchor.',
  ].join('\n');
}

/**
 * State attributes the ledger block keeps longest under its token cap
 * (WHEREABOUTS_ATTRIBUTES). Everything else (posture, mood, lighting,
 * doors…) sheds first.
 */
const STATE_KEPT_LONGEST = new Set(WHEREABOUTS_ATTRIBUTES);

/** How a binding entry's basis is named in the block (overhaul 2 §5.5). */
const BASIS_LABELS = Object.freeze({ player: 'the player', dice: 'the dice', gm: 'the GM', setup: 'the premise' });

/** At most this many people not yet on record are told in THE SCENE — the newest drafted first. */
const PENDING_PEOPLE_TOLD = 4;

/** A text cut at its last whole word within `max` characters, marked "…" when cut. */
function clipWords(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/, '')}…`;
}

/**
 * Build the Section 6.5 active-scene ledger block — fact-continuity scope §6,
 * reshaped by overhaul 2 (§5.5, D8) so the narrator weighs what binds apart
 * from what its own narration described:
 *
 *   ## ACTIVE SCENE — WHAT BINDS, AND WHAT THE NARRATION DESCRIBED
 *   THE SCENE — began 4 beats ago, when the Kobayashi IV arrived at Bleakhold Station.
 *     Place / Ship      — where the characters are and where the ship is, by the stores
 *     Where / Present / Now / Turns on — the frame: the narration's, the question the player's
 *   WHAT BINDS          — what the player said, the dice decided, the GM set, the premise
 *   CORRECTED           — the table's strikes
 *   STANDING NOW        — binding state
 *   WHAT THE NARRATION HAS DESCRIBED — colour: this scene's, while one of its
 *                         latest COLOUR_BEATS narrations wrote or restated it
 *   PLAY LET THESE GO   — the questions play let go
 *   COMMAND VEHICLE     — the ship's identity line
 *
 * It used to open on "BINDING TRUTHS AND CURRENT STATE … They are binding …
 * must not diverge from them" over every truth the narration had written and
 * the frame's Where — so the narrator argued its own scenery against the
 * player's line (FRAME-REASONING-IN-PROSE: "You are no longer at Tamsin's
 * stall, so the manifest is not where you left it").
 *
 * Returns the sub-blocks for their readers — `scene` and `place` (its Place
 * and Ship lines, which the consistency audit reads), `binds`, `corrections`,
 * `standing`, `described`, `letGo`, `shipPosition` (the command vehicle's
 * lines as a meta mode renders them alone) — and `combined`.
 *
 * Under `maxTokens` the described state sheds first, oldest first, then the
 * described truths, then standing state (every other attribute before a
 * character's location / vessel / condition, oldest first, issue #286 A6).
 * Never dropped: THE SCENE, WHAT BINDS, CORRECTED, PLAY LET THESE GO, the
 * ship (invariant 4).
 *
 * Filtering (fact-continuity scope §6 — "Filtering"). A subject is in scope
 * for this turn if any of:
 *   - the scene itself (`subject.kind === "scene"`)               — always
 *   - a free-text subject (an unrecorded figure or place)         — always
 *   - the entity ID appears in `options.matchedEntityIds`         — always
 *   - the entity ID equals `options.currentLocationId`            — always
 * The ledger holds only the current scene's entries, so a free-text subject is
 * scene-local by construction (issue #286 B4). Recorded entities stay scoped
 * by match: relevance, the current location, and the frame's cast.
 *
 * @param {Object} campaignState     — CampaignStateSchema
 * @param {Object} [options]
 * @param {string[]} [options.matchedEntityIds]
 * @param {string|null} [options.currentLocationId]
 * @param {number} [options.maxTokens] — soft cap; described colour, then standing state, shed when exceeded
 * @param {Map<string,string>|Object} [options.entityNamesById] — entity ID → display name
 * @param {string} [options.askSceneQuestion] — what Turns on says when the frame holds no
 *   question (the narration is asked to set one); '' or omitted: no line
 * @param {Set<string>|null} [options.colourWindow] — the scene's latest COLOUR_BEATS narrations' ids
 *   (null: the scene's cards are unstamped — all its colour stands)
 * @param {number|null} [options.sceneBeats] — how many narrations the scene has had
 * @param {string} [options.playerLine] — the beat's player words (a let-go hook it takes up stands)
 * @param {Array|null} [options.nameChanges] — the names the table changed, from the store: written new
 *   in the frame's words as THE SCENE renders them (sceneForReading)
 * @returns {{ header: string, scene: string, place: string, binds: string, corrections: string,
 *   standing: string, described: string, letGo: string, shipPosition: string, combined: string,
 *   tokenEstimates: Object }}
 */
export function buildLedgerBlock(campaignState, options = {}) {
  const truths = Array.isArray(campaignState?.sceneTruths) ? campaignState.sceneTruths : [];
  const stateBySubject = (campaignState?.sceneState && typeof campaignState.sceneState === 'object'
    ? campaignState.sceneState.bySubject
    : null) ?? {};

  const matchedIds        = new Set(options?.matchedEntityIds ?? []);
  const currentLocationId = options?.currentLocationId ?? null;
  if (currentLocationId) matchedIds.add(currentLocationId);
  const maxTokens         = Number.isFinite(options?.maxTokens) ? options.maxTokens : Infinity;
  const nameLookup        = normaliseNameLookup(options?.entityNamesById);
  const window            = options?.colourWindow instanceof Set ? options.colourWindow : null;
  const playerLine        = typeof options?.playerLine === 'string' ? options.playerLine : '';

  // ── Scene frame (Cluster A4) ─────────────────────────────────────────────
  // The narrator-maintained snapshot of the active scene. The recorded
  // entities its `present` list names join matchedEntityIds upstream
  // (buildNarratorExtras), so their ledger entries stay in scope even when
  // the player's message doesn't name them (the conversation-partner case).
  const sceneFrameEnabled = options?.sceneFrameEnabled !== false;
  const frame = sceneFrameEnabled && campaignState?.sceneFrame
    && typeof campaignState.sceneFrame === 'object'
    ? campaignState.sceneFrame
    : null;
  const letGoList = frame ? normaliseLetGo(frame.letGo) : [];

  // ── Truths: what binds, and what the narration described ────────────────
  // A truth's basis (overhaul 2 §5.1): the player's line, the dice, the GM,
  // the premise bind; the narrator's own colour is shown apart, while one of
  // the scene's latest narrations wrote or restated it, and not once a hook
  // it carries was let go (§5.3).
  const bindLines = [];
  const describedEntries = [];
  for (const t of truths) {
    if (!t || t.retracted) continue;
    if (!isSubjectInScope(t.subject, matchedIds)) continue;
    const label = formatSubjectLabel(t.subject, nameLookup);
    const fact  = String(t.fact ?? '').trim();
    if (!fact) continue;
    if (binds(t)) {
      bindLines.push(`  ${label} — ${fact} (${BASIS_LABELS[entryBasis(t)]})`);
    } else if (inColourWindow(t, window) && !touchesLetGo(fact, playerLine, letGoList)) {
      describedEntries.push({ line: `  ${label} — ${fact}`, truth: true, keep: false,
        updatedAt: Number(t.createdAt) || 0, order: describedEntries.length });
    }
  }

  // ── Retraction defense (NARR-RETRACT-PASSIVE) ────────────────────────────
  // A bare Strike renders as an explicit do-not-re-assert line: this scene's,
  // and since issue #286 B6 the session's earlier scenes' too — the ring and
  // the summary's source outlive the scene. Not scope-filtered; capped at the
  // most recent few; never dropped. An earlier scene's strike of a scene fact
  // is named only at its place (issue #345 AA28). A strike of colour is a
  // strike (invariant 6b).
  const MAX_CORRECTION_LINES = 5;
  const correctionLines = sessionRetractedFacts(campaignState, { here: frame?.location })
    .slice(-MAX_CORRECTION_LINES)
    .map(f => `  ${f.label} — ${f.fact}`);

  // ── State: standing, and described ───────────────────────────────────────
  const standingEntries = [];
  for (const [key, entries] of Object.entries(stateBySubject)) {
    if (!Array.isArray(entries) || !entries.length) continue;
    const subjectForKey = subjectFromStateKey(key);
    if (!isSubjectInScope(subjectForKey, matchedIds)) continue;
    // A text subject as the narrator last wrote it — its key is lowercased
    // (TEXT-SUBJECT-LOWERCASE); an entry from before the label was kept has none.
    const written = subjectForKey.kind === 'text' ? textSubjectAsWritten(entries, key) : '';
    const label = written || formatSubjectLabel(subjectForKey, nameLookup);
    for (const e of entries) {
      const attr  = String(e?.attribute ?? '').trim();
      const value = e?.value;
      if (!attr || value === undefined || value === null || value === '') continue;
      const row = {
        keep:      STATE_KEPT_LONGEST.has(attr.toLowerCase()),
        updatedAt: Number(e?.updatedAt) || 0,
      };
      if (binds(e)) {
        standingEntries.push({ ...row, line: `  ${label} — ${attr}: ${value} (${BASIS_LABELS[entryBasis(e)]})`, order: standingEntries.length });
      } else if (inColourWindow(e, window) && !touchesLetGo(String(value), playerLine, letGoList)) {
        describedEntries.push({ ...row, line: `  ${label} — ${attr}: ${value}`, truth: false, order: describedEntries.length });
      }
    }
  }

  // ── THE SCENE ────────────────────────────────────────────────────────────
  // Three stores, three facts (overhaul 2 §6.1): the characters' recorded
  // place, the ship's position, and where in that place the frame says they
  // are — the narration's own. The scene's anchor says why it began.
  // One read of the scene (sceneForReading), which the reader is told too
  // (formatSceneForReading — overhaul 2 §10.1): the narrator and the reader
  // are told the scene by one renderer, from one read.
  const read = sceneForReading(campaignState, {
    sceneBeats: options?.sceneBeats, sceneFrameEnabled, nameChanges: options?.nameChanges ?? null,
    underway: options?.underway ?? '', cardPronouns: options?.cardPronouns ?? null,
  });
  const what = read.began?.what ?? '';
  const beats = read.began?.beats ?? null;
  const sceneHead = what
    ? (beats === null ? `THE SCENE — began when ${what}.`
      : beats === 0 ? `THE SCENE — begins with this beat: ${what}.`
      : `THE SCENE — began ${beats} beat${beats === 1 ? '' : 's'} ago, when ${what}.`)
    : 'THE SCENE';
  const vehicle = commandVehicleLines(campaignState);
  const placeLines = [];
  if (read.place?.name) placeLines.push(`  Place:    ${read.place.name} — where the characters are, by the table's record`);
  else if (read.between) placeLines.push(`  Place:    none — the characters are between places, ${read.between}, until it arrives`);
  if (read.ship) placeLines.push(`  Ship:     ${read.ship}`);
  // What the player's line names elsewhere (issue #393 D5): another place, and
  // the people whose whereabouts are one.
  for (const p of options?.elsewhere?.people ?? []) placeLines.push(`  Elsewhere: ${p.name} — ${p.where}, not here`);
  for (const p of options?.elsewhere?.places ?? []) placeLines.push(`  Elsewhere: ${p.name} — another place, reached only by a journey's move`);
  // The people met whom the table has not yet confirmed — tracked as real
  // until it does (the maintainer's call after round 8): the fact block names
  // them by this name, so where they are can be kept.
  const pending = (Array.isArray(options?.pendingPeople) ? options.pendingPeople : []).filter(p => typeof p?.name === 'string' && p.name.trim())
    .slice(0, PENDING_PEOPLE_TOLD);
  if (pending.length) {
    placeLines.push('  Not yet on record — people met; when one is in the scene, the fact block names them so, in "present" or "remote":');
    for (const p of pending) {
      const what = typeof p.description === 'string' && p.description.trim() ? ` — ${clipWords(p.description.trim(), 90).replace(/[\s.;,:]+$/, '')}` : '';
      const where = typeof p.where === 'string' && p.where.trim() ? `; ${p.where.trim()}` : '';
      // Their pronouns as the narration gave them, so they hold (UNNAMED-FIGURE-PRONOUN-DRIFT).
      const pronouns = typeof p.pronouns === 'string' && p.pronouns.trim() ? ` (${p.pronouns.trim()})` : '';
      placeLines.push(`    ${p.name.trim()}${pronouns}${what}${where}`);
    }
  }
  const frameLines = [];
  if (frame) {
    if (read.where)          frameLines.push(`  Where:    ${read.where} — as the narration has it`);
    if (read.present.length) frameLines.push(`  Present:  ${read.present.join(', ')}`);
    // Heard or seen over a comm — not here in person (round 7's a57).
    if (read.remote.length)  frameLines.push(`  Remote:   ${read.remote.join(', ')} — over a comm, not here in person`);
    if (read.now)            frameLines.push(`  Now:      ${read.now} — as the narration has it`);
    // What the scene is deciding (issue #353 R2) — the player's (overhaul 2
    // §7.2). With none standing, a narration that can set one is asked for
    // it, in its caller's words (`askSceneQuestion`; NARRATOR-REFRAINS).
    const ask = typeof options?.askSceneQuestion === 'string' ? options.askSceneQuestion.trim() : '';
    if (read.question) {
      frameLines.push(frame.questionAnswered === true
        ? `  Turns on (answered): ${read.question} — the scene has moved past it; set what it turns on now.`
        : `  Turns on: ${read.question} — from the player's line`);
    } else if (ask && frameLines.length) {
      frameLines.push(`  Turns on: ${ask}`);
    }
  }
  // A scene with nothing to say of itself says nothing: no anchor, no place, no frame.
  const hasScene = !!(what || placeLines.length || frameLines.length);
  const sceneBlock = hasScene ? [sceneHead, ...placeLines, ...frameLines].join('\n') : '';

  // ── What play let go (overhaul 2 §7.3) ───────────────────────────────────
  // The questions play left unanswered for SCENE_QUESTION_BEATS beats, at
  // most LET_GO_MAX. Never dropped.
  const letGoBlock = letGoList.length
    ? [
        'PLAY LET THESE GO — hooks the narration posed that play did not take up. Do not end on one,',
        'restate it or bring it back, in the prose or the fact block, unless the player\'s line takes it up:',
        ...letGoList.map(e => `  "${e.text}"`),
      ].join('\n')
    : '';

  // ── Empty short-circuit ──────────────────────────────────────────────────
  if (!bindLines.length && !standingEntries.length && !describedEntries.length && !vehicle.identity && !sceneBlock
      && !correctionLines.length && !letGoBlock) {
    return {
      header: '', scene: '', place: '', binds: '', corrections: '', standing: '', described: '', letGo: '',
      shipPosition: '', combined: '',
      tokenEstimates: { header: 0, scene: 0, binds: 0, corrections: 0, standing: 0, described: 0, letGo: 0, ship: 0 },
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const header = '## ACTIVE SCENE — WHAT BINDS, AND WHAT THE NARRATION DESCRIBED';
  const bindsBlock = bindLines.length
    ? ['WHAT BINDS — what the player said, the dice decided or the GM set. Never contradict it:', ...bindLines].join('\n')
    : '';
  const correctionsBlock = correctionLines.length
    ? [
        'CORRECTED (retracted by the table — do NOT re-assert these, even if',
        'earlier narration mentions them):',
        ...correctionLines,
      ].join('\n')
    : '';
  const renderStanding = (entries) => (entries.length ? ['STANDING NOW:', ...entries.map(e => e.line)].join('\n') : '');
  const renderDescribed = (entries) => (entries.length
    ? [
        'WHAT THE NARRATION HAS DESCRIBED — your own colour in this scene. Keep to it while it stands. When the player\'s',
        'line, the dice or the GM change any of it, it changes, and the narration follows without a word of argument.',
        'It is not carried out of this scene.',
        ...entries.map(e => e.line),
      ].join('\n')
    : '');
  let standingBlock  = renderStanding(standingEntries);
  let describedBlock = renderDescribed(describedEntries);

  // ── Soft-cap enforcement (overhaul 2 D8, amending invariant 4) ───────────
  // The described colour sheds first — state, oldest first, then truths,
  // oldest first — then standing state, every other attribute before a
  // character's location, vessel and condition, the oldest first (issue #286
  // A6). THE SCENE, WHAT BINDS, CORRECTED, PLAY LET THESE GO and the ship are
  // never dropped.
  const tokenEstimates = {
    header:      estimateTokens(header),
    scene:       estimateTokens(sceneBlock),
    binds:       estimateTokens(bindsBlock),
    corrections: estimateTokens(correctionsBlock),
    letGo:       estimateTokens(letGoBlock),
    standing:    estimateTokens(standingBlock),
    described:   estimateTokens(describedBlock),
    ship:        estimateTokens(vehicle.identity),
  };
  const fixedTokens = tokenEstimates.header + tokenEstimates.scene + tokenEstimates.binds
                    + tokenEstimates.corrections + tokenEstimates.letGo + tokenEstimates.ship;
  const over = () => fixedTokens + estimateTokens(standingBlock) + estimateTokens(describedBlock) > maxTokens;
  if (over()) {
    const describedOrder = describedEntries.slice().sort((a, b) =>
      (a.truth - b.truth) || (a.updatedAt - b.updatedAt) || (a.order - b.order));
    const keptDescribed = new Set(describedEntries);
    for (const victim of describedOrder) {
      if (!over()) break;
      keptDescribed.delete(victim);
      describedBlock = renderDescribed(describedEntries.filter(e => keptDescribed.has(e)));
    }
    const standingOrder = standingEntries.slice().sort((a, b) =>
      (a.keep - b.keep) || (a.updatedAt - b.updatedAt) || (a.order - b.order));
    const keptStanding = new Set(standingEntries);
    for (const victim of standingOrder) {
      if (!over()) break;
      keptStanding.delete(victim);
      standingBlock = renderStanding(standingEntries.filter(e => keptStanding.has(e)));
    }
    tokenEstimates.standing  = estimateTokens(standingBlock);
    tokenEstimates.described = estimateTokens(describedBlock);
  }

  const combined = [header, sceneBlock, bindsBlock, correctionsBlock, standingBlock, describedBlock, letGoBlock, vehicle.identity]
    .filter(Boolean)
    .join('\n\n');

  return {
    header,
    scene:        sceneBlock,
    place:        placeLines.join('\n'),
    binds:        bindsBlock,
    corrections:  correctionsBlock,
    standing:     standingBlock,
    described:    describedBlock,
    letGo:        letGoBlock,
    // A meta mode's whole ledger (formatLedgerSection's shipPositionOnly):
    // the command vehicle's identity and position lines, as one read gives them.
    shipPosition: buildShipPositionLine(campaignState),
    combined,
    tokenEstimates,
  };
}

/**
 * The scene, as one read (overhaul 2 §6.1, §10.1): three stores, three facts
 * — the characters' recorded place (`currentLocationId`), where the ship is
 * (its position record's line), and where in that place the frame says they
 * are, who is present, what is happening and what the scene turns on (the
 * narration's; the question the player's) — and why it began (its anchor).
 * Names the table changed are written new in the frame's words as they are
 * read (nameChanges.js writeNewNames, the record's rule — the fourth live
 * run's a50 copied "Ashen Wake pilot" a step after the cutter was renamed).
 * Read by the ACTIVE SCENE block's THE SCENE and by the reader
 * (formatSceneForReading). It writes nothing and turns
 * nothing. Never throws.
 *
 * @param {Object} campaignState
 * @param {{ sceneBeats?: number|null, sceneFrameEnabled?: boolean, nameChanges?: Array|null }} [opts] —
 *   `nameChanges` the table's changes from the store (narrator extras), else campaignState's
 * @returns {{ began: { cause: string, what: string, beats: number|null }|null, place: { id: string, name: string }|null,
 *   ship: string, where: string, present: string[], now: string, question: string, letGo: string[] }}
 */
export function sceneForReading(campaignState, { sceneBeats = null, sceneFrameEnabled = true, nameChanges = null, underway = '', cardPronouns = null } = {}) {
  const anchor = campaignState?.sceneBegan && typeof campaignState.sceneBegan === 'object'
    && campaignState.sceneBegan.sceneId && campaignState.sceneBegan.sceneId === (campaignState.currentSceneId ?? null)
    ? campaignState.sceneBegan : null;
  const beats = Number.isInteger(sceneBeats) && sceneBeats >= 0 ? sceneBeats : null;
  const began = anchor ? { cause: anchor.cause ?? 'first', what: typeof anchor.what === 'string' ? anchor.what.trim() : '', beats } : null;
  const placeName = currentPlaceName(campaignState);
  const place = placeName ? { id: campaignState.currentLocationId, name: placeName } : null;
  // No place, on an expedition: the characters set out — aboard, between
  // places, until its arrival (issue #393 D1).
  const journey = typeof underway === 'string' ? underway.trim() : '';
  const between = !campaignState?.currentLocationId && journey ? `on the expedition ${journey}` : '';
  const ship = commandVehicleLines(campaignState).position.replace(/^SHIP POSITION:\s*/, '');
  const frame = sceneFrameEnabled !== false && campaignState?.sceneFrame && typeof campaignState.sceneFrame === 'object'
    ? campaignState.sceneFrame : null;
  const changes = Array.isArray(nameChanges) ? nameChanges
    : Array.isArray(campaignState?.nameChanges) ? campaignState.nameChanges : [];
  const others = changes.length ? actorNames() : [];
  const fresh = (text) => {
    const t = typeof text === 'string' ? text.trim() : '';
    return t && changes.length ? writeNewNames(t, changes, { otherNames: others }) : t;
  };
  const question = typeof frame?.question === 'string' ? frame.question.trim() : '';
  // Each person with their pronouns (issue #402, change 2): a recorded
  // person's card's, else the first set the scene was given for them.
  const named = (p) => {
    const name = fresh(p);
    const set = pronounsIn(cardPronouns, name) || pronounsIn(cardPronouns, p) || pronounsIn(frame?.pronouns, p);
    return set ? `${name} (${set})` : name;
  };
  return {
    began,
    place,
    between,
    ship,
    where: fresh(frame?.location),
    present: (Array.isArray(frame?.present) ? frame.present : []).filter(p => typeof p === 'string' && p.trim()).map(named),
    remote: (Array.isArray(frame?.remote) ? frame.remote : []).filter(p => typeof p === 'string' && p.trim()).map(named),
    now: fresh(frame?.situation),
    question: fresh(question),
    letGo: frame ? normaliseLetGo(frame.letGo).map(e => e.text) : [],
  };
}

/**
 * The scene as the reader is told it (overhaul 2 §10.1) — the same read the
 * narrator's THE SCENE renders, in two lines:
 *   "- Place: Bleakhold Station. Ship: Kobayashi IV docked at Bleakhold Station.
 *      Scene — began when the characters arrived (3 beats ago); where: …; present: …; now: …; turns on: …."
 * '' with nothing to say.
 *
 * @param {ReturnType<typeof sceneForReading>} scene
 * @returns {string}
 */
export function formatSceneForReading(scene) {
  if (!scene || typeof scene !== 'object') return '';
  const ship = /^not yet established\b/i.test(scene.ship ?? '') ? 'not yet established' : (scene.ship ?? '');
  const place = scene.place?.name ? `Place: ${scene.place.name}.`
    : scene.between ? `Place: none — between places, ${scene.between}.` : '';
  const head = [place, ship ? `Ship: ${ship}.` : '']
    .filter(Boolean).join(' ');
  const bits = [];
  if (scene.began?.what) {
    const ago = Number.isInteger(scene.began.beats) ? ` (${scene.began.beats} beat${scene.began.beats === 1 ? '' : 's'} ago)` : '';
    bits.push(`began when ${scene.began.what}${ago}`);
  }
  if (scene.where) bits.push(`where: ${scene.where}`);
  if (Array.isArray(scene.present) && scene.present.length) bits.push(`present: ${scene.present.join(', ')}`);
  if (Array.isArray(scene.remote) && scene.remote.length) bits.push(`over a comm, not here: ${scene.remote.join(', ')}`);
  if (scene.now) bits.push(`now: ${scene.now}`);
  if (scene.question) bits.push(`turns on: ${scene.question}`);
  if (Array.isArray(scene.letGo) && scene.letGo.length) bits.push(`play let go: ${scene.letGo.map(t => `"${t}"`).join(', ')}`);
  const lines = [];
  if (head) lines.push(`- ${head}`);
  if (bits.length) lines.push(`${head ? '  ' : '- '}Scene — ${bits.join('; ')}.`);
  return lines.join('\n');
}

/**
 * The characters' recorded place by name (`currentLocationId` — overhaul 2
 * §6.1: canonical for the scene's place), or ''. Never throws.
 *
 * @param {Object} campaignState
 * @returns {string}
 */
function currentPlaceName(campaignState) {
  const id = campaignState?.currentLocationId;
  if (typeof id !== 'string' || !id) return '';
  try {
    const name = resolveEntityById(id)?.data?.name;
    return typeof name === 'string' ? name.trim() : '';
  } catch {
    return '';
  }
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
  const { identity, position } = commandVehicleLines(campaignState);
  return [identity, position].filter(Boolean).join('\n');
}

/**
 * The command vehicle's two lines: its identity (COMMAND VEHICLE — name,
 * type, integrity) and where it is (SHIP POSITION — its record's line, or the
 * "not yet established" guard). Both '' with no command vehicle. The scene
 * block shows the position as THE SCENE's Ship line and the identity last
 * (overhaul 2 §5.5); a meta mode renders both, alone (buildShipPositionLine).
 *
 * @param {Object} campaignState
 * @returns {{ identity: string, position: string }}
 */
function commandVehicleLines(campaignState) {
  if (!campaignState) return { identity: '', position: '' };
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
    // even when nothing has set the isCommandVehicle flag yet. A confirmed
    // NPC ship is never a candidate (issue #321 U26).
    if (!actor) {
      const starships = ids
        .map(id => globalThis.game?.actors?.get?.(id))
        .filter(a => a?.type === 'starship' && isLoneShipCandidate(a.flags?.[MID]?.ship));
      if (starships.length === 1) {
        actor   = starships[0];
        payload = actor.flags?.[MID]?.ship ?? null;
      }
    }
    if (!actor) return { identity: '', position: '' };
    // The record as getShip gives it: its integrity is the STARSHIP asset's
    // Integrity track on the sheet (issue #345 AA20 — the record's copy was
    // read, and drifted from what the player saw and marked).
    payload = withSheetNotes('ship', actor, payload);

    const name  = actor?.name ?? payload?.name ?? '';

    // Identity line — always present so the narrator knows the command
    // vehicle exists and its name, even before any position is established.
    const idParts = [];
    if (payload?.type)      idParts.push(String(payload.type).trim());
    if (payload?.firstLook) idParts.push(`first look: ${String(payload.firstLook).trim()}`);
    if (payload?.mission)   idParts.push(`mission: ${String(payload.mission).trim()}`);
    if (typeof payload?.integrity === 'number') {
      const max     = payload.integrityMax ?? 5;
      // The starship sheet's native debility fields are canonical (the sheet
      // toggle and the suffer dialog write only those); the flag payload's copy
      // is a write-through mirror, used only when the native field is absent.
      const debility = actor?.system?.debility ?? {};
      const battered = typeof debility.battered === 'boolean' ? debility.battered : !!payload.battered;
      const cursed   = typeof debility.cursed   === 'boolean' ? debility.cursed   : !!payload.cursed;
      const impacts = [battered && 'battered', cursed && 'cursed'].filter(Boolean);
      idParts.push(`integrity ${payload.integrity}/${max}${impacts.length ? ` [${impacts.join(', ')}]` : ''}`);
    }
    const identity = `COMMAND VEHICLE: ${name || 'Unknown ship'}${idParts.length ? ` — ${idParts.join('; ')}` : ''}`;

    // Position line — when the record carries information. When it doesn't,
    // say so explicitly: with no position signal the narrator confidently
    // improvises one from the campaign premise (v1.7.10 finding #5 — the
    // ship sat near Astra on the map while "where am I" answered Mudd).
    const position = formatShipPositionLine(payload?.position, campaignState, name)
      || ('SHIP POSITION: not yet established — do NOT assert or invent where '
        + 'the ship is. If the player asks where they are, say their position '
        + 'has not been established yet and suggest anchoring it (the GM can '
        + 'type !at <place> or position the ship token on the sector map).');
    return { identity, position };
  } catch (err) {
    console.warn?.('starforged-companion | the command vehicle\'s lines failed:', err?.message ?? err);
    return { identity: '', position: '' };
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

/** The newest `subjectText` among a text subject's state entries that still names its key, or ''. */
function textSubjectAsWritten(entries, key) {
  let best = null;
  for (const e of entries) {
    const text = typeof e?.subjectText === 'string' ? e.subjectText.trim() : '';
    if (!text || text.toLowerCase() !== String(key).toLowerCase()) continue;
    if (!best || (Number(e.updatedAt) || 0) >= (Number(best.updatedAt) || 0)) best = { text, updatedAt: e.updatedAt };
  }
  return best?.text ?? '';
}

/**
 * Render a ledger subject as the human-readable prefix used in the block.
 *   entity → display name from the lookup, else the record's own name, else
 *            the entity ID.
 *   scene  → "scene"
 *   text   → the original text
 */
function formatSubjectLabel(subject, nameLookup) {
  if (!subject || typeof subject !== 'object') return 'unknown';
  switch (subject.kind) {
    case 'entity': {
      const id = subject.entityId ?? '';
      const fromMap = nameLookup?.get?.(id);
      return fromMap || entityNameById(id) || id || 'entity';
    }
    case 'scene': return 'scene';
    case 'text':  return String(subject.text ?? '').trim() || 'unknown';
    default:      return 'unknown';
  }
}

/**
 * An entity record's name by its host document id, or '' — for ledger labels
 * the caller's lookup does not cover (the consistency check passes none; an
 * entity can be in scope through the scene frame without a card match). The
 * auditor and the narrator need "Kael Dros", not an Actor id.
 */
function entityNameById(id) {
  if (!id) return '';
  try {
    const name = resolveEntityById(id)?.data?.name;
    return typeof name === 'string' ? name.trim() : '';
  } catch {
    return '';
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

function isSubjectInScope(subject, matchedIds) {
  if (!subject || typeof subject !== 'object') return false;
  if (subject.kind === 'scene') return true;
  if (subject.kind === 'entity') return matchedIds.has(subject.entityId);
  if (subject.kind === 'text') return String(subject.text ?? '').trim() !== '';
  return false;
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

Something new may enter the fiction this turn. You have expanded creative latitude.

You MAY introduce, but only when no established character or place can already
fill the role the scene needs:
- One named NPC, creature, or entity (keep initial details spare — leave
  room to develop across sessions)
- One named location or structure (atmosphere and first impression only)
- One factual revelation about the world or setting

You MUST:
- Reuse before you invent: when the scene needs someone (or somewhere) to fill
  a role, first check whether an established character or place — the people
  and places recorded for the active sector, and anyone already in the scene —
  can fill it, and use them by name if so.
  Mint a new named entity only when none of the established cast can
- Name sparingly: a functionary the scene needs only for a moment (a guard, a
  clerk, a deckhand, a voice on the comm) should stay generic and unnamed. Give
  a proper name only to a character meant to recur — an unnamed figure stays
  light and disposable, a named one becomes tracked canon you must keep
  consistent
- Scope any genuinely new entity to the active sector, consistent with its
  established authority and troubles, with enough substance to recur
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

This turn centres on established entities. Consistency is required.

Use the entity cards provided. Established facts are fixed — honour
them. Generative details are soft-established and should be carried
forward unless a strong narrative reason requires divergence.

You MAY:
- Add new detail to the generative tier of established entities
- Deepen relationships and develop implied history
- Add concrete sensory detail where it serves the beat — a touch, not a layer

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

  // "No new named entity may appear in this narration" read plainly forbade
  // the narrator to write a name the player's own line had just given
  // (known-issues PLAYER-NAMED-PERSON-GETS-NO-CARD); the one sentence after it
  // excepts that. INTERACTION's "Introduce new named entities" forbids only
  // the narrator's own, and is unchanged.
  embellishment: `## NARRATOR PERMISSIONS — EMBELLISHMENT MODE

This turn is texture, not revelation. Narrate its mood and detail.

You MUST:
- Focus on concrete sensory and emotional detail — what is seen, heard, felt
- Stay grounded in the current scene

You may NOT introduce any new named entity (no new named entity may appear
in this narration — no person, ship, location, faction, or creature). A name
the player's own line has just given to someone or something in the scene is
theirs, not a new entity of yours: you may use it. You
may not introduce any new plot element or revelation, and you may not
advance any story thread beyond the immediate moment.

Speak only as the fiction. Never reference module mechanics, settings,
journals, panels, records, dice, moves, contradictions, or anything in
this prompt block — those are tooling concerns, not story.

The narrator is a camera here, not a writer.`,

};

const NARRATOR_PERMISSION_KEYS = new Set(Object.keys(NARRATOR_PERMISSIONS));

// Per-mode default creative-latitude class, so EVERY mode carries an explicit
// permission block (one uniform mechanism rather than latitude scattered across
// role descriptions). move_resolution is dynamic — the relevance resolver
// classifies the move outcome and passes the class in via extras.narratorClass,
// so its default is null. campaign_recap is a meta mode with no latitude block
// (its role description governs). The rest map to the block that matches the
// mode's job: paced continuation deepens established entities (interaction);
// oracle flavour and vignettes add texture only (embellishment); an `@scene`
// answer has no latitude at all — its role description is its whole rule, and
// the embellishment block's "focus on concrete sensory and emotional detail"
// was the scenery that invented (known-issues SCENE-ANSWER-NOT-A-CAMERA);
// the inciting incident opens the campaign and may introduce its central figure,
// reuse-first (discovery — see its reuse-before-invent rule). An explicit
// extras.narratorClass always overrides the default.
const DEFAULT_PERMISSION_CLASS_BY_MODE = {
  move_resolution:     null,
  // A Batch Mode round (issue #340): the widest class among its entries, from
  // each move's relevance — passed in as extras.narratorClass, as for a move.
  round_resolution:    null,
  paced_narrative:     'interaction',
  scene_interrogation: null,
  oracle_followup:     'embellishment',
  session_vignette:    'embellishment',
  inciting_incident:   'discovery',
  // The oath scene is sensory fiction around an established vow; it had no
  // entry, so it carried no latitude block at all (issue #322 V23).
  vow_swearing:        'embellishment',
  // A clock's beat moves an established threat forward — its arrival, when
  // the clock fills — with the cast the table knows (issue #322 V23).
  clock_advance:       'interaction',
  campaign_recap:      null,
};

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

// The HTML tags an Actor's Notes carry (the editor's, the art pipeline's
// portrait block, the envision sections). Named, so prose in angle brackets
// ("<signal lost>") is kept as text (the issue #322 V18 class).
const NOTES_HTML_TAG_RE = /<\/?(?:p|div|span|br|hr|h[1-6]|img|ul|ol|li|strong|em|b|i|u|s|a|blockquote|section|article|table|thead|tbody|tr|td|th|figure|figcaption|code|pre|sup|sub|small|mark)\b[^>]*>/gi;

/**
 * An entity record's Notes as card text. A ship's and an NPC's Notes tab is
 * HTML — the embedded portrait block (`<div class="sf-ship-portrait"><img
 * src=…>`), the `<hr><h4>✦ Envisioned details — …</h4>` sections — and the
 * record keeps a copy, which the card printed verbatim (issue #326 W39; the
 * CHARACTER block strips its notes). The portrait block and images are
 * dropped, the other markup becomes spaces, entities are decoded — the seed's
 * fact line reached ENTITIES IN SCENE as "she/her &middot; Wary &middot; …"
 * (known-issues NOTES-CARD-ENTITY-UNDECODED).
 *
 * @param {unknown} notes
 * @returns {string} '' when nothing is left
 */
export function notesAsCardText(notes) {
  if (notes === undefined || notes === null) return '';
  return decodeHtmlEntities(String(notes)
    .replace(new RegExp(PORTRAIT_BLOCK_RE.source, 'g'), ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(NOTES_HTML_TAG_RE, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_FIELDS_BY_TYPE = {
  connection: [
    ['pronouns',         'Pronouns'],
    ['role',             'Role'],
    ['secondRole',       'Also'],
    ['rank',             'Rank'],
    // The record's rolled / established disposition (the seed, the sector
    // generator). The card read `relationshipType`, which nothing writes, so
    // every NPC said "neutral" beside the roster's real one (issue #325 W22).
    ['disposition',      'Disposition'],
    ['goal',             'Goal'],
    ['motivation',       'Motivation'],
    ['description',      'Description'],
    ['notes',            'Notes', notesAsCardText],
  ],
  ship: [
    ['type',        'Type'],
    ['mission',     'Mission'],
    ['description', 'Description'],
    ['notes',       'Notes', notesAsCardText],
  ],
  settlement: [
    ['location',   'Location'],
    ['population', 'Population'],
    ['authority',  'Authority'],
    // What the settlement is working on and the trouble it faces — rolled by
    // the sector generator (and the trouble by the zoom-in), stored, and
    // shown on the sheet, but missing here (known-issues SECTOR-CARD-GAPS).
    ['projects',   'Projects'],
    ['trouble',    'Trouble'],
    ['firstLook',  'First look'],
    ['initialContact', 'Initial contact'],
    // The world and star the sector generator rolled and pinned beside the
    // settlement on the map (issue #321 U51 — stored, never shown).
    ['planet',     'Planet', formatSettlementPlanet],
    ['stellar',    'Stellar object'],
    ['description','Description'],
    ['notes',      'Notes', notesAsCardText],
  ],
  faction: [
    ['type',         'Type'],
    ['subtype',      'Subtype'],
    ['influence',    'Influence'],
    ['relationship', 'Relationship'],
    ['quirk',        'Quirk'],
    ['description',  'Description'],
    ['notes',        'Notes', notesAsCardText],
  ],
  planet: [
    ['type',        'Type'],
    ['atmosphere',  'Atmosphere'],
    ['life',        'Life'],
    ['description', 'Description'],
    ['notes',       'Notes', notesAsCardText],
  ],
  location: [
    ['type',        'Type'],
    ['region',      'Region'],
    ['status',      'Status'],
    ['firstLook',   'First look'],
    ['feature',     'Feature'],
    ['description', 'Description'],
    ['notes',       'Notes', notesAsCardText],
  ],
  creature: [
    ['scale',       'Scale'],
    ['environment', 'Environment'],
    ['form',        'Form'],
    ['behavior',    'Behavior'],
    ['rank',        'Rank'],
    ['description', 'Description'],
    ['notes',       'Notes', notesAsCardText],
  ],
};

/**
 * The LAST KNOWN lines for an entity card: one per whereabouts attribute the
 * record holds, in WHEREABOUTS_ATTRIBUTES order — "location: the docking ring
 * (Session 3)".
 *
 * @param {Object|undefined} lastKnown — { [attribute]: { value, sessionNum, at } }
 * @returns {string[]}
 */
function formatLastKnown(lastKnown) {
  if (!lastKnown || typeof lastKnown !== 'object') return [];
  const out = [];
  for (const attr of WHEREABOUTS_ATTRIBUTES) {
    const entry = lastKnown[attr];
    const value = String(entry?.value ?? '').trim();
    if (!value) continue;
    out.push(`  ${attr}: ${value}${entry.sessionNum ? ` (Session ${entry.sessionNum})` : ''}`);
  }
  return out;
}

/**
 * A settlement's rolled planet as narrator text — "Vorn Prime (Desert World)".
 * The sector generator rolls one per orbital / planetside settlement and keeps
 * it on the settlement's record as `{ name, type }` (no planet entity exists),
 * so the settlement card and the active sector's roster both render it here.
 *
 * @param {{name?: string, type?: string}|string|null} planet
 * @returns {string} '' when there is none
 */
export function formatSettlementPlanet(planet) {
  if (!planet) return '';
  if (typeof planet !== 'object') return String(planet).trim();
  const name = String(planet.name ?? '').trim();
  const type = String(planet.type ?? '').trim();
  return name && type ? `${name} (${type})` : (name || type);
}

/** Generative-tier lines an entity card shows, and how many of them are held for traits. */
const CARD_TIER_LINES  = 10;
const CARD_TRAIT_SLOTS = 4;

/** Tier sources that carry binding traits (scene truths, entity-specific lore), not developments. */
const TRAIT_TIER_SOURCES = new Set(['scene_truth_migration', 'wj_lore_entity_route']);

/**
 * The generative-tier entries an entity card shows, in display order: pinned
 * first, then the newest. A tier is append-only, so a later entry is a newer
 * one. Up to CARD_TRAIT_SLOTS of the lines go to the newest binding traits
 * (a scar, a history, an allegiance migrated from the scene ledger) before
 * newer developments fill the rest, so a trait recorded three scenes ago is
 * not crowded out (issue #286 A7: the card sorted by sessionNum, which
 * migrated truths never had, and its stable sort kept a session's OLDEST five).
 *
 * @param {Array} tier
 * @returns {Array}
 */
function selectCardTierEntries(tier) {
  const newestFirst = tier
    .filter(e => e && !e.promoted && String(e.detail ?? '').trim())
    .reverse();
  const picked = new Set();
  const take = (pred, limit) => {
    for (const e of newestFirst) {
      if (picked.size >= CARD_TIER_LINES || limit <= 0) return;
      if (picked.has(e) || !pred(e)) continue;
      picked.add(e);
      limit -= 1;
    }
  };
  take(e => e.pinned, CARD_TIER_LINES);
  take(e => TRAIT_TIER_SOURCES.has(e.source), CARD_TRAIT_SLOTS);
  take(() => true, CARD_TIER_LINES);
  return newestFirst
    .filter(e => picked.has(e))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/**
 * Where a connection's relationship stands (issue #286 C5): lost or bonded,
 * then its last few relationship events (`history`, written by forgeBond /
 * loseConnection) — none of which reached the narrator, so a severed
 * connection could be written as a friend.
 *
 * @param {Object} connection — the connection record
 * @returns {string[]} card lines
 */
function formatConnectionStanding(connection) {
  const lines = [];
  if (connection.active === false) lines.push('  Status: connection lost');
  else if (connection.bonded === true) lines.push('  Bond: forged');
  const events = (Array.isArray(connection.history) ? connection.history : [])
    .map(h => (typeof h === 'string' ? h : h?.entry))
    .filter(e => typeof e === 'string' && e.trim())
    .slice(-3);
  if (events.length) lines.push('', 'HISTORY (oldest first):', ...events.map(e => `  - ${e.trim()}`));
  return lines;
}

/**
 * Format a single entity record as a narrator-prompt card.
 * Includes the canonical tier (with a hard or soft instruction depending on
 * canonicalLocked) and up to CARD_TIER_LINES generative-tier entries
 * (selectCardTierEntries).
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
  const shown  = new Set();   // a value two fields share (a goal also stored as the motivation) shows once
  for (const [key, label, format] of fields) {
    const value = format ? format(entity[key]) : entity[key];
    if (value === undefined || value === null || value === '') continue;
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    if (!text || shown.has(text)) continue;
    shown.add(text);
    lines.push(`  ${label}: ${text}`);
  }
  if (entityType === 'connection') lines.push(...formatConnectionStanding(entity));

  // Last known whereabouts from earlier scenes (issue #286 C1) — kept by
  // endScene, binding ones only (overhaul 2 §5.6); what the active scene says
  // of them now — STANDING NOW, or what the narration described — supersedes them.
  const lastKnown = formatLastKnown(entity.lastKnown);
  if (lastKnown.length) {
    lines.push('', 'LAST KNOWN (from earlier scenes — what this scene says of them now wins):', ...lastKnown);
  }
  // Where the session record last had them with the characters (issue #393
  // D5), when no LAST KNOWN location of their own outranks it.
  const seenAt = entity.lastSeen && typeof entity.lastSeen === 'object' ? entity.lastSeen : null;
  if (seenAt) {
    const where = seenAt.place?.name ? `at ${seenAt.place.name}` : 'with the characters, between places';
    lines.push('', `LAST SEEN with the characters (the session record): ${where}${seenAt.session ? ` (Session ${seenAt.session})` : ''}`);
  }

  // Generative tier — pinned first, then the newest, with slots held for
  // binding traits (selectCardTierEntries).
  const tier = Array.isArray(entity.generativeTier) ? entity.generativeTier : [];
  const top = selectCardTierEntries(tier);
  if (top.length) {
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
  'round_resolution',   // A Batch Mode round: every acting player's action narrated once — see narrateRound (issue #340)
  'paced_narrative',
  'scene_interrogation',
  'oracle_followup',
  'session_vignette',   // Begin Session opening vignette — see src/session/galleyVignette.js
  'inciting_incident',  // Campaign-launch inciting incident — see src/session/incitingIncident.js
  'vow_swearing',       // The moment a vow is sworn, grounded in the Iron truth — see narrateVowSwearing
  'clock_advance',      // A tracked threat's clock advancing or filling — see narrateClockAdvancement
  'campaign_recap',     // Between-sessions recap generation — see getCampaignRecap (narrator.js)
]);

// Meta modes produce out-of-fiction text (a retrospective summary), not live
// scene prose. They MUST NOT receive the fact-continuity sidecar instruction
// (their output is consumed verbatim and never run through applyNarratorSidecar,
// so a stray JSON block would leak straight into the recap) nor the NPC
// audio-markup instruction.
const META_MODES = new Set(['campaign_recap']);

// The modes whose length is the Length setting — move narration
// and paced narration, whose user messages repeat it. Every other mode states
// its own (the @scene answer the Scene Response Length setting, the recap
// 3–5 paragraphs, the vignettes, vow, clock, oracle and inciting beats their
// sentence counts), so the STYLE block's Length line is theirs alone: it was
// sent to every mode, beside the mode's own length (issue #326 W40).
const NARRATION_LENGTH_MODES = new Set(['move_resolution', 'paced_narrative', 'round_resolution']);

/**
 * What an oracle's answer is to the narration that tells it (known-issues
 * ORACLE-NO-NARRATED-AS-YES). "Is anyone left alive aboard the wreck?" rolled
 * NO, and the follow-up wrote "The open comm still hisses with the dry voice's
 * breathing, which means someone is aboard": the narrator kept what it had
 * made — a voice on the comm, three beats running — over what the oracle
 * said. RECENT ORACLE RESULTS already asked it not to contradict the dice;
 * nothing said which gives way when the scene and the answer disagree. The
 * scene does. In the mode's role (the same for every follow-up); the user
 * message says it of the one answer (its obligations block's TELL [oracle] /
 * NOT SO [oracle] lines — moves/contracts/obligations.js).
 */
const ORACLE_ANSWER_BINDS =
  `The oracle's answer is the table's, not yours, and it binds the story from here. A yes ` +
  `is narrated as yes and a no as no — never as its opposite, never as doubtful, and never ` +
  `as something still to be found out. Where the scene so far said otherwise — a voice ` +
  `heard, a light seen, a thing taken for granted — the scene gives way, not the answer: ` +
  `reconcile it inside the fiction, in this narration (what was heard was a recording, a ` +
  `relay or an echo, was mistaken, or has stopped), so that nothing left standing ` +
  `contradicts the answer. A table's result is read with latitude; it is never turned ` +
  `into its reverse.`;

/** The heading of a recap's section on how things stand (record/recapView.js); the recap's rules name it. */
const STANDS_NOW_HEADING = 'WHERE THINGS STAND';

/**
 * A recap says only what its sources say (known-issues
 * RECAP-STATES-WHAT-DID-NOT-HAPPEN). The long haul's third live run's four
 * recaps held fourteen sentences the story does not support (its
 * review-notes.md lists each); run 2's a76 held three. As read from the
 * prompts, by cause:
 *   - inference: "your first hint that the Spire's water shortage and the
 *     raids might share a source" — no step links them; "it is a question you
 *     can now answer" — the entry before says the question is still pressed;
 *   - a gap filled in: "What you found there was the point of it all", of a
 *     ship never boarded — the Chronicle steps from "won grudging leave to
 *     board" to the stamp because the step between was X-Carded;
 *   - a third-person entry turned to "you": "first pick of her hauls" — the
 *     offer was first pick of the character's own, in all four recaps;
 *   - an earlier state carried forward: "The compass still swings toward the
 *     dark lane" — it swung north and stopped; the entry for that step dropped
 *     the needle, and the recap was sent nothing else of how things stood.
 * The role told it only to "draw only on the chronicle provided". Since issue
 * #382 slice 2 its source is the session record (record/recapView.js): facts,
 * the players' own words, and how things stand read live — each line an id
 * its sentences cite.
 */
const RECAP_SOURCES_RULE =
  `A recap says only what its sources say. THE RECORD in the user message is what happened, ` +
  `session by session, as facts: who acted and the words their player wrote, the move and its ` +
  `outcome, what changed on a sheet, what play did, what was established and still stands. ` +
  `${STANDS_NOW_HEADING} is how things stand as play stopped, read from the sheets and tracks.\n` +
  `- Every sentence restates what a line it cites states. Infer nothing: no cause, motive or link ` +
  `between two things that no line gives ("your first hint that…", "which is how…"), no verdict on ` +
  `what something meant ("the point of it all"), and no answer to a question a line leaves open.\n` +
  `- Fill nothing in between lines. Where the record steps from one beat to a later one, the recap ` +
  `steps with it and says nothing of what lay between: a beat may be missing because the table took ` +
  `it out of the story. A place no line says was entered was not entered; a thing no line says was ` +
  `found was not found.\n` +
  `- What a player wrote is what their character said or tried. What it claims about the world is ` +
  `the character's claim, unless an outcome or an established line supports it.\n` +
  `- Keep whose things are whose. The record names each character; the recap may call the player ` +
  `character "you" — and no one else. Keep a player's own words as they wrote them ("first pick of ` +
  `whatever I haul" is the character's own haul).\n` +
  `- How a thing stands now is ${STANDS_NOW_HEADING}'s word. Say that something still stands only ` +
  `when ${STANDS_NOW_HEADING} says so; never carry an earlier state forward as still true.\n` +
  `- Use each name as the record writes it, and write no other name for anyone.\n` +
  // Known-issues RECAP-TELLS-THE-DICE (the fourth live run): 13 of the 64
  // recap sentences named an outcome — "it landed as a weak hit", "Your search
  // near the wreck missed" — and about a dozen read a sheet's numbers aloud.
  // The record's lines carry them; this rule had no word against telling them
  // as the dice do, where the move narration's role has one (OUTCOME_WORDS_RULE).
  `- Tell what happened, not the dice or the numbers. "strong hit", "weak hit", "miss" and "match" ` +
  `are the table's words, never the recap's: not as the roll's name ("it landed as a weak hit", ` +
  `"on a miss"), not as a remark on the dice, and not as an image made out of the word. Nor is a ` +
  `number from a sheet or a track — a meter, momentum, XP, ticks, boxes, "4 of 10". Say what came ` +
  `of a line instead, as the lines state it: what the character did, found, gained, lost or failed ` +
  `at, and how far a vow or a tie has come, in words. A rank — troublesome, dangerous, formidable, ` +
  `extreme, epic — is how hard a vow, a tie or a fight is to see through: never a word for the ` +
  `person or thing it is about. Nor are the record's own words for itself ("the record", "at the ` +
  `table") the recap's.`;

/** The oracle's own word for a doubled roll stays out of the prose too (NARRATION-NAMES-THE-OUTCOME). */
const ORACLE_MATCH_RULE =
  `A result that came with a match is the answer at its most extreme, or with a twist: ` +
  `tell that as what happens. The word "match" is the table's and is never written.`;

/**
 * The dice's own words stay out of the prose (known-issues
 * NARRATION-NAMES-THE-OUTCOME). The move's outcome block reads "[OUTCOME:
 * Strong Hit with a Match [MATCH]]", and the rule against repeating it named
 * no word: two live runs wrote them in — "Strong hit, and a match: he throws
 * in a sealed ration crate…" (run 2, a51) and "The match flares bright on the
 * scope" (run 3, a27), an image made from the word with nothing in the scene
 * to be one. Nor was the narrator told what a match is for. In the move and
 * round roles, beside that rule.
 */
const OUTCOME_WORDS_RULE =
  `The outcome's own words are the table's, never the story's. "Strong hit", "weak hit", ` +
  `"miss" and "match" never appear in the narration as such: not as the roll's name ("a ` +
  `strong hit", "it's a miss", "and a match"), not as a remark on the dice, and not as an ` +
  `image made out of the word (a match that flares, a hit that lands "strong"). Narrate ` +
  `what happens instead. A match is told as its twist — on a hit, something unexpected or ` +
  `a new opening; on a miss, the turn that makes it worse — as an event in the scene, ` +
  `with no name for it.`;

const ROLE_DESCRIPTIONS = {
  move_resolution:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `narrate the mechanical consequences of move outcomes as plain, concrete prose ` +
    `that serves the story.\n\n` +
    `Do not repeat the mechanical outcome verbatim. Transform it into narrative. ` +
    `Keep the player in the fiction.\n\n` +
    OUTCOME_WORDS_RULE,

  round_resolution:
    `You are the narrator for an Ironsworn: Starforged campaign played by several players ` +
    `at once. Your role is to narrate one round of play — every character who acted, each ` +
    `action and the outcome its move rolled — as a single scene of plain, concrete ` +
    `prose that serves the story.\n\n` +
    `Do not repeat a mechanical outcome verbatim. Transform each into narrative, in the ` +
    `order given, and keep every action with the character who took it. Keep the players ` +
    `in the fiction.\n\n` +
    OUTCOME_WORDS_RULE,

  paced_narrative:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `continue the fiction in response to the player's narration as plain, concrete ` +
    `prose that serves the story.\n\n` +
    `No move was rolled for this turn. Stay in narration; do not announce mechanics. ` +
    `Keep the player in the fiction.`,

  // Known-issues SCENE-ANSWER-NOT-A-CAMERA (the long haul's third live run):
  // the role said "describe only what is already established — answer the
  // question, do not invent", the user message asked for "2–3 sentences of
  // atmospheric description", and the permission block for sensory detail.
  // Sixteen answers were right and each dressed its fact in scenery that
  // invented — the compass on a table, in a coat, in a hand, in a drawer, on
  // a belt. An answer is the fact, said plainly by a narrator who knows what
  // this prompt holds; it is not narration, and nothing of it is recorded
  // (narrator.js interrogateScene).
  scene_interrogation:
    `You are the narrator for an Ironsworn: Starforged solo campaign. The player has ` +
    `stepped out of the story to ask you a question about it. Your role is to answer ` +
    `it in your own voice, plainly, as the one who knows everything this prompt holds.\n\n` +
    `Answer the question and nothing else: the fact asked for, in a sentence or two ` +
    `(the user message gives the limit). This is an answer, not narration:\n` +
    `- State only what this prompt holds — the world's records, the active scene, the ` +
    `recent scene, the character. Where something is, what it looks like, how long it ` +
    `has been so: these are facts too. If the prompt does not give one, do not supply it.\n` +
    `- If the prompt does not hold the answer, say plainly that the story has not ` +
    `established it. Never guess, and never fill the gap.\n` +
    `- No scenery, no sensory detail, no mood, no comparison, nothing to close on.\n` +
    `- Nothing happens in an answer: no one speaks or acts, no time passes, the scene ` +
    `stays exactly as it is.\n` +
    `- What this prompt marks FOR THE NARRATOR ONLY — a hidden plan, anything under ` +
    `UNREVEALED — the characters do not know. Never state it; asked about it, say it ` +
    `is not yet known.`,

  // Told "the iron they touch, the words, the weight of commitment … pure
  // sensory fiction", and given no scene, the oath was one image in all four
  // live long hauls — a palm pressed flat to a bulkhead, the words said low
  // (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT). It is built from what
  // the user message gives.
  vow_swearing:
    `You are the narrator for an Ironsworn: Starforged campaign. Your role is to render ` +
    `the moment a character swears a vow as a brief scene, built from what the user ` +
    `message gives: the vow's own words, how oaths are bound in THIS world (the Iron ` +
    `truth), and the scene the character swears it in.\n\n` +
    `Write 2-3 sentences, no game mechanics. The words sworn are the vow's own, or the ` +
    `character's for them; the iron is what is at hand in this scene, as this world ` +
    `binds an oath; the moment comes out of the scene and what the vow is about — no ` +
    `stock gesture.`,

  oracle_followup:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `weave a rolled oracle result into the current scene as plain, concrete prose.\n\n` +
    `The player has rolled an oracle table or asked the Oracle a yes/no question. The ` +
    `mechanical result is given to you verbatim. Render it as 2-3 sentences anchored to ` +
    `the current scene: describe what the player sees, hears, or learns as the oracle's ` +
    `answer manifests in the fiction. Do not repeat the d100 number, the threshold, or ` +
    `the literal table text — transform it into narrative.\n\n` +
    `${ORACLE_ANSWER_BINDS}\n\n` +
    ORACLE_MATCH_RULE,

  session_vignette:
    // Issue #381: the role named the galley, "vivid specific food or activity"
    // and the ship as the joke, and two separate campaigns' openings came out
    // as one scene; its closings were "the cosmic threat eating a sandwich …
    // the bonded ally watering houseplants", and wrote them. A set-piece is
    // built from what its user message gives — rolled material and the
    // campaign's records — and the role names no place, no business and no
    // example scene.
    `You are the narrator for an Ironsworn: Starforged campaign. Your role is to render ` +
    `a session set-piece: a short scene that brackets the play session. The user ` +
    `message says which it is, who is in it and where, and gives its MATERIAL: results ` +
    `rolled for this scene on the game's oracles, and what the campaign's records hold. ` +
    `Build the scene from the material.\n\n` +
    // "Nothing new happens in it" was a shape too: the fourth live run's
    // openings each ended still (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT).
    `OPENING — the player characters whose players are at the table, in a quiet moment ` +
    `inside the situation the last session left. No turn of the plot happens in it. With ` +
    `crewmates registered but away, the characters speak of what those crewmates are up ` +
    `to; with none, no crew is invented, present or absent. TONE OVERRIDE for OPENING: ` +
    `WRY AND ABSURD — fond, observed, played straight. Not cynical, not sneering.\n\n` +
    `CLOSING — a cutaway to someone or somewhere the table knows, away from the ` +
    `characters, at something small: the world going on without them. TONE OVERRIDE ` +
    `for CLOSING: WRY AND OBSERVED — specific, small, almost tender.\n\n` +
    `SPOTLIGHT — a cutaway or a flashback the characters do not see: the Spotlight ` +
    `Vignette result the table rolled, happening. The campaign's own tone.\n\n` +
    `All of them: do not describe a move, do not propose a mechanical action. The user ` +
    `message gives the scene's length in sentences: that is a limit, not a guide — ` +
    `count them, and stop at the last one.`,

  // A clock beat used the session-vignette role — "depict the calm before /
  // the calm after, not the start or end of the action" — for a threat
  // materialising (issue #322 V23).
  clock_advance:
    `You are the narrator for an Ironsworn: Starforged campaign. Your role is to render ` +
    `a tracked threat moving closer — a danger, a faction's plot or a deadline whose ` +
    `clock has just advanced — as a brief story beat.\n\n` +
    `The user message names the threat and whether its clock has filled. Make the ` +
    `advance felt in the current fiction: a sign, a report, a tremor, a warning that ` +
    `the pressure has grown. When the clock has filled, the threat MATERIALISES — depict ` +
    `its arrival concretely, as happening now, and leave the characters poised to ` +
    `respond. Do not resolve it, and do not name a move, a mechanic, the clock or its ` +
    `segments.`,

  inciting_incident:
    `You are the narrator for an Ironsworn: Starforged solo campaign. Your role is to ` +
    `envision the campaign's INCITING INCIDENT — the dramatic opening event that ` +
    `launches the campaign and sets up the player's first vow.\n\n` +
    `Ground the incident ONLY in what is already established: the World Truths, the ` +
    `starting sector and its settlements, the local connection (an important NPC), the ` +
    `character — plus the oracle spark (Action + Theme) given in the user message, which ` +
    `you interpret loosely as inspiration, never quoting it literally. Write 4-6 ` +
    `sentences of vivid prose that drop the character into a charged situation demanding ` +
    `action. Do not resolve it; leave the player poised to make the first move. Prefer the ` +
    `proper nouns the truths / sector / connection already establish; introduce a new named ` +
    `figure only if none of them can carry the incident, and scope it to the starting sector.\n\n` +
    `The "depict, do not offer" rule governs the PROSE BODY. AFTER the prose, append a ` +
    `short structured proposal block — each item on its own line, in this order and ` +
    `these exact forms:\n\n` +
    `Suggested vow: <a short first-person vow statement> (<rank>)\n` +
    `Suggested clock: <a short clock label> (<segments> segments)\n` +
    `Immediate crisis: <a short danger label> (<segments> segments)\n` +
    `Vow target: <Name> (<pronouns — the set your prose established for them, ` +
    `e.g. she/her, he/him, they/them>) [<kind — exactly one of: person, creature, faction, ` +
    `vessel>] — <2-3 sentences on one line: who they are — for an ` +
    `already-established NPC (one recorded for the starting sector), consistent with their recorded ` +
    `role, goal, and pronouns, never reassigning or contradicting them — their ` +
    `history with the character, and their current situation and condition>\n` +
    `Situation: <one or two sentences on one line, third person, summarising the ` +
    `DURABLE facts of this incident for the campaign journal — who is involved, what ` +
    `is at stake, any named factions, and any deadline. This is the single cohesive ` +
    `World Journal entry for the opening, so name the key players and stakes plainly ` +
    `rather than restating the prose.>\n\n` +
    `Rules for the block: <rank> is exactly one of: troublesome, dangerous, formidable, ` +
    `extreme, epic. The "Suggested vow" line is always present, as is the "Situation" ` +
    `line. The "Suggested clock" line is a DEADLINE ON THE VOW ITSELF and is RARE — ` +
    `include it ONLY when the vow is genuinely time-gated, i.e. failing to fulfil it in ` +
    `time makes it harder or impossible (the threat the vow addresses crosses a point of ` +
    `no return), and it must measure THAT deadline, not the opening scene's drama. Most ` +
    `opening vows are open-ended quests with no deadline — OMIT it for those. A dramatic, ` +
    `urgent opening scene is NOT by itself a reason for a vow clock. <segments> is one of ` +
    `4, 6, 8, 10, 12 (fewer = tighter). The "Immediate crisis" line is a SEPARATE, ` +
    `proximal danger unfolding RIGHT NOW in the opening scene that is NOT the long vow's ` +
    `deadline — a short, self-contained first scene to tackle immediately (e.g. a runaway ` +
    `transport about to crash, while the vow is the long investigation into the sickness ` +
    `behind it). Include it only when such an urgent, tickable danger is actually present; ` +
    `it becomes its own countdown, distinct from the vow. Do NOT restate the vow here. ` +
    `<segments> is one of 4, 6, 8, 10 (fewer = more urgent). The "Vow target" line appears ` +
    `when the vow concerns a specific person, ` +
    `creature, faction, or vessel — use their established name, keep the whole line ` +
    `single-line. This trailing block is the one place you propose mechanics; keep all ` +
    `of it out of the prose body itself.`,

  campaign_recap:
    `You are the narrator for an Ironsworn: Starforged campaign, writing a ` +
    `between-sessions recap. Your role is to summarise the campaign so far as a ` +
    `concise, vivid retrospective that reminds the players where things stand.\n\n` +
    `This is a meta-summary, not a live scene: do not advance the story, stage new ` +
    `events, introduce new entities, or propose actions. Draw only on the record ` +
    `below and the established campaign context. Keep it tight and respectful of ` +
    `what the players have accomplished.\n\n` +
    RECAP_SOURCES_RULE,
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

/**
 * How an everyday beat ends (issue #348 PT02). The move, paced and round
 * modes asked only for "vivid, atmospheric prose", so beats closed on a mood
 * line or a quip with nothing for the player to pick up, and a recurring
 * image repeated unchanged beat after beat. The clock and inciting modes
 * already end "poised to respond"; these three get the same kind of rule.
 * The hook is an event in the story, so "depict, do not offer" stands.
 */
const BEAT_ENDING_MODES = new Set(['move_resolution', 'paced_narrative', 'round_resolution']);
const BEAT_ENDING_RULE =
  `Each beat changes something: new information, a present character acting on their ` +
  `own goal, a threat or an obstacle, or a recurring detail that shifts. Restating the ` +
  `mood does not count.\n` +
  `Each beat ends on something unresolved inside the story: a question a character ` +
  `asks, an imminent danger, a demand or an offer, something unexplained. Never end on ` +
  `a reflective or atmospheric line.\n` +
  `A recurring motif must change, or be dropped: do not repeat an image from the recent ` +
  `scene as it was.\n` +
  // Known-issues NARRATOR-REFRAINS: 23 narrations of 23 ended on the opening's
  // hook; REFRAIN-OUTLIVES-THE-QUESTION (overhaul 2 §7.4): the fourth live run's
  // "second hail light" — a thread of the narrator's own — ended 15 of 17.
  `The hook is the story's answer to the player's line — a present character's next ` +
  `word or act, the danger the result left — never a new thread of your own, and never ` +
  `one under PLAY LET THESE GO. It is something that happens in the story, never a menu ` +
  `of options — it follows "depict, do not offer". Keep it within the narrator permissions in this ` +
  `prompt: where only embellishment is allowed, the change is small and immediate (a ` +
  `present character's next word or act, a detail already in the scene that shifts), ` +
  `not a new plot element. Where a closing italic move-hint is asked for, it comes ` +
  `after this final story beat.`;

/**
 * How the prose is written (issue #354 P2-27, P2-22). Every prose role asked
 * for "vivid, atmospheric prose" and nothing asked for economy, so the alpha 23
 * playtest's beats ran long, leaned on a strained comparison in nearly every
 * one ("takes Isaac's offer the way a tide takes a pebble"), repeated one
 * simile across three narrations, and were all built the same way. Standing
 * rules, the same for every mode; what varies by beat — the images already
 * used, the beat's shape — is in the per-beat context (formatBeatProseBlock).
 */
const PROSE_RULE =
  `Write plainly. Concrete nouns and verbs: show what someone does, says, or sees. ` +
  `Short sentences, one idea each.\n` +
  `At most one comparison — a simile or a metaphor — in a narration, and only where it ` +
  `makes something clearer than the plain statement would. Most narrations need none. ` +
  `Never chain them ("the way a…", "as though…", "like a…" one after another).\n` +
  `Never reuse an image, or another from the same source, that the recent scene has ` +
  `already used (IMAGES ALREADY USED lists them when there are any).\n` +
  `Vary how narrations are built. Not every one opens by setting the scene, and not ` +
  `every one needs each recurring detail of the scene: leave some out.`;

/**
 * Levity restated for the beat (issue #354 P2-21): Playful landed in ship and
 * action beats and dropped out of the tense exchanges, though its description
 * already said "even under pressure". The description is one line among the
 * standing rules; the miss and its price are the newest thing the narrator
 * reads. So the permission is said again with the beat's own context.
 */
const LEVITY_BEAT_LINES = {
  light:   'Levity (Light): this beat may carry one warm or human detail, even on a miss or under threat.',
  playful: 'Levity (Playful): this beat carries one light touch — a dry aside, a fond or odd detail — even on a miss or under threat. One, placed where it does not undercut the danger.',
};

/** The modes whose beats are built to a shape and checked against the images already used. */
const BEAT_PROSE_MODES = new Set(['move_resolution', 'paced_narrative', 'round_resolution']);

/** What leads the beat's shape in THIS BEAT'S PROSE (was "Shape:" — issue #377 item 2). */
export const BEAT_SHAPE_LABEL = 'How this narration is built:';

/**
 * [8d] THIS BEAT'S PROSE — what varies from one beat to the next (issue #354
 * P2-21, P2-22, P2-27): the comparisons the recent narrations used
 * (buildNarratorExtras → extras.usedImages; proseVariety.js recentImages), the
 * shape picked for this beat (extras.beatShape; pickBeatShape — never the one
 * before's), and the levity permission. '' when there is none of them.
 *
 * @param {{ usedImages?: string[], wornDetails?: string[], beatShape?: { hint?: string }|null, levity?: string }} [beat] —
 *   `wornDetails`: what the recent narrations kept coming back to (proseVariety.js wornDetails)
 * @returns {string}
 */
export function formatBeatProseBlock({ usedImages = [], wornDetails = [], beatShape = null, levity = 'default' } = {}) {
  const images = (Array.isArray(usedImages) ? usedImages : [])
    .filter(i => typeof i === 'string' && i.trim())
    .map(i => i.replace(/\s+/g, ' ').trim());
  const worn = (Array.isArray(wornDetails) ? wornDetails : []).filter(w => typeof w === 'string' && w.trim()).map(w => w.trim());
  const hint = typeof beatShape?.hint === 'string' ? beatShape.hint.trim() : '';
  const levityLine = LEVITY_BEAT_LINES[levity] ?? '';
  if (!images.length && !worn.length && !hint && !levityLine) return '';

  const lines = ["## THIS BEAT'S PROSE"];
  if (hint) {
    // Said as an instruction to the narrator, about the narration — the line
    // that read "Shape: Open on …" was written into the story as "Open on the
    // hatch, not you." (issue #377 item 2).
    lines.push('', `${BEAT_SHAPE_LABEL} ${hint} This changes nothing about what happens; it keeps the beat from reading like the last one. It is an instruction to you — never write it, quote it or describe it in the narration.`);
  }
  if (levityLine) lines.push('', levityLine);
  if (images.length) {
    lines.push(
      '',
      '### IMAGES ALREADY USED',
      '',
      'The recent narrations made these comparisons. Do not use any of them again, or another',
      'drawn from the same source:',
      ...images.map(i => `- ${i}`),
    );
  }
  // The details the recent narrations kept coming back to (NARRATION-REFRAINS-RISING,
  // round 7: Tamsin's pen, the ledger boy, the data chit, beat after beat).
  if (worn.length) {
    lines.push(
      '',
      '### DETAILS ALREADY WORN',
      '',
      'The recent narrations kept coming back to these. Reach for something else this beat —',
      'another sense, another person, another thing in the place; use one again only where the',
      'player\'s line turns on it:',
      ...worn.map(w => `- ${w}`),
    );
  }
  return lines.join('\n');
}

/**
 * The redirect the first narration after an X-Card carries (issue #321 U07,
 * section [1b]). The removed beat is already out of every memory the narrator
 * reads; this tells it to move the story away without saying what it was.
 */
const XCARD_REDIRECT_BLOCK =
  `## X-CARD — REDIRECT\n\n` +
  `A player used the X-Card on the most recent beat of the story. That beat has been ` +
  `removed: it did not happen. Do not continue it, refer to it, describe its aftermath, ` +
  `or bring back anything it introduced, even indirectly. Take the scene in a clearly ` +
  `different direction — a cut to another moment, a shift of focus, or a new ` +
  `development — and carry on from what remains of the story. Do not mention the ` +
  `X-Card or that anything was removed.`;

const TONE_DESCRIPTIONS = {
  // Dry, not ornate (issue #354 P2-27): "It notices the irony" read as licence
  // for a clever comparison in every sentence.
  wry: "Wry — dry and understated, aware of consequence without wallowing in it. The narrator has seen this before. The irony is in what happens and in what goes unsaid, never in a clever comparison. It does not editorialize, but it does not pretend not to notice.",
  grim_and_grounded: "Grim and grounded — sparse, consequential, Ironsworn-canonical. Short sentences. Weighted words. No flourish.",
  operatic: "Operatic — heightened stakes, vivid imagery, emotion at full volume.",
  noir: "Noir — world-weary, shadowed, dry. The city has seen it all; so has the narrator.",
  matter_of_fact: "Matter of fact — mechanical, precise, minimal flourish. Just what happened.",
};

// Optional tonal-weight axis layered ON TOP of the tone above (issue #236).
// Each string opens by preserving the chosen tone's voice — the composition
// guarantee, so e.g. "noir + light" reads as noir that permits warmth, not a
// tone override. `default` is intentionally absent: it resolves to '' and emits
// no prompt text, leaving default-campaign prompts byte-for-byte unchanged.
const LEVITY_DESCRIPTIONS = {
  light:
    "Levity — keep the chosen tone's voice, but let the fiction breathe. " +
    "Permit ordinary life, small victories, and moments of rest alongside the danger. " +
    "When the stakes are present, show the human texture around them — not just the dread. " +
    "Warmth and relief are allowed to land. This holds on a miss and under threat: a tense " +
    "beat may still carry one warm or human detail.",
  playful:
    "Levity — keep the chosen tone's voice, but lighten its weight. " +
    "Allow humour, affectionate detail, and the small odd specifics of crew life. " +
    "Be fond and observed rather than grim or sneering; a beat may be almost tender. " +
    "This holds on a miss, under threat and in a hard conversation: every beat carries one " +
    "light touch — a dry aside, a fond or odd detail — set where it does not undercut the " +
    "danger. One, not several; never drop it because the scene is tense.",
};

// CHAR-PERSPECTIVE-NO-PRONOUN-RULE (character-detail audit 2026-07): both
// perspectives make recorded pronouns binding. Third person is where drift
// bit hardest (every PC referred to by name AND pronoun); second person still
// needs the rule for NPC dialogue ABOUT the player character.
const PERSPECTIVE_DESCRIPTIONS = {
  // "You" is one character for the whole card (issue #354 P2-08): a card said
  // "you" of Isaac in its body and of Karthik in its close, and another mixed
  // "Isaac's offer" with "watching you".
  second_person:
    'Address the player character directly as "you". e.g. "You feel the deck ' +
    'shudder..." "You" is the character in the CHARACTER section, for the whole ' +
    'narration: never call them by name in narration (their name appears only ' +
    'when another character says it in dialogue), and never call anyone else ' +
    '"you" — every other player character is named, in the third person. When ' +
    'other characters speak ABOUT the player character, use the recorded ' +
    'pronouns from the CHARACTER section.',
  third_person:
    'Refer to characters by name. e.g. "Kira feels the deck shudder..." Use ' +
    'each character\'s recorded pronouns (in the CHARACTER and PARTY sections ' +
    'and on their card) exactly as given. If no pronouns are recorded for ' +
    'someone, do not infer gender from their name — write around it or use ' +
    'they/them.',
};

// ---------------------------------------------------------------------------
// Perspective resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective narration perspective.
 * "auto" resolves to second_person for solo (at most 1 active non-GM player)
 * or third_person for multiplayer (2+ active players). Explicit values pass
 * through unchanged.
 *
 * A narration that speaks for two or more PCs at once — a Batch Mode round
 * with several acting (`actingCharacters`) — is third person whoever is
 * connected: "you" would merge them, beside the PARTY block's "never merge
 * the player characters into a single 'you'" (issue #342 Z40: a GM playing
 * Ash beside one player's Kira counted one non-GM user, so the round was
 * second person over two CHARACTER blocks).
 *
 * Auto is decided once per session (issue #348 PT03): `sessionPerspective`,
 * the one Begin a Session recorded (sessionPerspectiveOf), wins over the
 * count. Recomputed on every call, a second window or player connecting
 * mid-session flipped "you" to names between beats. Without one — a session
 * not begun — the connected users are counted, as before.
 *
 * @param {string} setting — "auto" | "second_person" | "third_person"
 * @param {{ actingCharacters?: number, sessionPerspective?: string|null }} [narration] —
 *   how many PCs the narration speaks for; the session's recorded perspective
 * @returns {"second_person"|"third_person"}
 */
export function resolveNarrationPerspective(setting, { actingCharacters = 0, sessionPerspective = null } = {}) {
  if (setting !== 'auto') return setting;
  if (actingCharacters > 1) return 'third_person';
  if (sessionPerspective === 'second_person' || sessionPerspective === 'third_person') return sessionPerspective;
  try {
    // Active NON-GM users (decisions.md "Narrator tone and perspective"): the
    // GM counted too, so a GM running one player's character — or a solo GM
    // with a second window open — got third person (issue #325 W21). A solo
    // GM alone counts none: second person.
    const playerCount = game.users.filter(u => u.active && !u.isGM).length;
    return playerCount <= 1 ? 'second_person' : 'third_person';
  } catch {
    return 'second_person';
  }
}

/**
 * The perspective Auto resolved to when the current session began (issue
 * #348 PT03; `campaignState.sessionPerspective`, written by lifecycle.js
 * beginSession) — null when this session recorded none.
 *
 * @param {Object|null} campaignState
 * @returns {"second_person"|"third_person"|null}
 */
export function sessionPerspectiveOf(campaignState) {
  const rec = campaignState?.sessionPerspective;
  const id  = campaignState?.currentSessionId;
  if (!rec || !id || rec.sessionId !== id) return null;
  return rec.perspective === 'second_person' || rec.perspective === 'third_person' ? rec.perspective : null;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/** [4c] STORY SO FAR — this session's rolling summary, under the ledger-wins caveat. '' when empty. */
function formatStorySoFarBlock(rollingSummary) {
  if (typeof rollingSummary !== 'string' || !rollingSummary.trim()) return '';
  return (
    `## STORY SO FAR (THIS SESSION)\n\n` +
    `(Narrative texture only — where this summary conflicts with the ` +
    `ACTIVE SCENE block or CHARACTER STATE below, those win.)\n\n` +
    rollingSummary.trim()
  );
}

/** [6] ENTITIES IN SCENE — the matched entity cards. '' when there are none. */
function formatEntityCardsBlock(entityCards) {
  const cards = (Array.isArray(entityCards) ? entityCards : [])
    .filter(c => typeof c === 'string' && c.trim().length);
  return cards.length ? ['## ENTITIES IN SCENE', ...cards].join('\n\n') : '';
}

/**
 * [6.5] The active-scene ledger, when fact continuity and its in-context
 * toggle are on. '' otherwise, or when nothing is in scope. With
 * `shipPositionOnly` (a meta mode's — the campaign recap), the ship's
 * position line alone: the scene's frame, truths and state are a scene's.
 * `askSceneQuestion` is buildLedgerBlock's: the narrator prompt's alone, for
 * the modes whose fact block may set the scene's question.
 */
function formatLedgerSection(campaignState, settings = {}, {
  matchedEntityIds = [], entityNamesById = null, shipPositionOnly = false, askSceneQuestion = '', sceneNarrations = null, playerLine = '',
  nameChanges = null, progressTracks = [], elsewhere = null, pendingPeople = [], cardPronouns = [],
} = {}) {
  const {
    factContinuityEnabled         = true,
    factContinuityLedgerInContext = true,
    factContinuityMaxLedgerTokens = 400,
    factContinuitySceneFrame      = true,
  } = settings ?? {};
  if (!factContinuityEnabled || !factContinuityLedgerInContext) return '';
  const block = buildLedgerBlock(campaignState, {
    matchedEntityIds,
    currentLocationId: campaignState?.currentLocationId ?? null,
    maxTokens:         factContinuityMaxLedgerTokens,
    entityNamesById,
    sceneFrameEnabled: factContinuitySceneFrame,
    askSceneQuestion,
    // The scene's latest narrations (overhaul 2 §5.3): a colour entry stands
    // while one of them wrote or restated it; and how many it has had.
    colourWindow: sceneNarrations?.window instanceof Set ? sceneNarrations.window : null,
    sceneBeats:   Number.isInteger(sceneNarrations?.beats) ? sceneNarrations.beats : null,
    playerLine,
    nameChanges,
    underway: expeditionUnderway(progressTracks),
    elsewhere,
    pendingPeople,
    cardPronouns,
  });
  return shipPositionOnly ? block.shipPosition : block.combined;
}

/**
 * The shared story, for a narrator with a prompt of its own — the Private
 * Channel (issue #286 D1, #287), so a private aside cannot contradict what
 * the table established. Rendered as buildNarratorSystemPrompt renders the
 * same sections, from the same extras:
 *   - `canon` — world truths [4] and the campaign premise [4b]: stable within
 *     a campaign, so they can sit in a cached prefix;
 *   - `scene` — LAST SESSION and STORY SO FAR [4c], the matched entity cards
 *     [6] and the active-scene ledger [6.5]: they change turn to turn.
 *
 * @param {Object} campaignState
 * @param {Object} [narratorSettings] — the factContinuity* settings (getNarratorSettings)
 * @param {Object} [extras] — rollingSummary, previousSessionSummary, entityCards,
 *   matchedEntityIds, entityNamesById
 * @returns {{ canon: string, scene: string }}
 */
export function buildSharedStorySections(campaignState, narratorSettings = {}, extras = {}) {
  const join = (blocks) => blocks.filter(Boolean).join('\n\n---\n\n');
  return {
    canon: join([buildWorldTruthsBlock(campaignState), buildIncitingIncidentBlock(campaignState)]),
    scene: join([
      formatPreviousSessionBlock(extras.previousSessionSummary ?? null),
      formatStorySoFarBlock(extras.rollingSummary ?? ''),
      formatEntityCardsBlock(extras.entityCards),
      formatLedgerSection(withSceneLedger(campaignState, extras.sceneLedger), narratorSettings, extras),
      // The hidden plans, under the main narrator's rule: never state one
      // outright. It writes nothing back, so no sidecar lines (issue #353).
      formatUnrevealedBlock(extras.unrevealed, { sidecar: false }),
    ]),
  };
}

/**
 * The scene-ledger fields a narration renders as it stands in the store — the
 * scene, its truths, state and frame, and the session's strikes — read by
 * buildNarratorExtras at narration time (issue #325 W05). Every other field
 * stays the caller's.
 */
export const SCENE_LEDGER_FIELDS = Object.freeze(
  ['currentSessionId', 'currentSceneId', 'sceneTruths', 'sceneState', 'sceneFrame', 'sessionRetractions', 'sceneBegan'],
);

/** `campaignState` with the live scene ledger (`extras.sceneLedger`) laid over it; the state itself when there is none. */
function withSceneLedger(campaignState, sceneLedger) {
  return sceneLedger && typeof sceneLedger === 'object' ? { ...(campaignState ?? {}), ...sceneLedger } : campaignState;
}

/**
 * [4c] LAST SESSION — the summary of the session before this one
 * (buildNarratorExtras → previousSessionSummaryFor), with the STORY SO FAR
 * caveat: narrative texture, never a fact store. Headed by its session number,
 * and not called the last session when sessions between them left no summary.
 *
 * @param {{ text: string, sessionNumber: number|null, isLast: boolean }|null} summary
 * @returns {string} '' when there is none
 */
function formatPreviousSessionBlock(summary) {
  const text = typeof summary?.text === 'string' ? summary.text.trim() : '';
  if (!text) return '';
  const number  = Number.isFinite(summary.sessionNumber) ? summary.sessionNumber : null;
  const heading = summary.isLast === false && number !== null
    ? `SESSION ${number} (THE LATEST SESSION SUMMARISED)`
    : (number !== null ? `LAST SESSION (SESSION ${number})` : 'LAST SESSION');
  return (
    `## ${heading}\n\n` +
    `(Narrative texture only — where this summary conflicts with the ` +
    `ACTIVE SCENE block or CHARACTER STATE below, those win.)\n\n` +
    text
  );
}

/** The rule the system prompt's sections are joined with. */
const SECTION_RULE = '\n\n---\n\n';

/**
 * The headings that open the second and third blocks of a prose narration's
 * system prompt (buildNarratorSystemBlocks). splitNarratorSystemPrompt finds
 * the blocks by them, so they appear nowhere else in a prompt.
 */
export const NARRATION_BLOCK_HEADING = '## THIS NARRATION';
export const CONTEXT_BLOCK_HEADING   = '## CONTEXT FOR THIS NARRATION';

/**
 * The heading the world snapshot's block opens on (issue #357; worldSnapshot.js
 * renders the block). When a narration has one it sits between the standing
 * rules and THIS NARRATION, so every prose mode shares both.
 */
export const SNAPSHOT_BLOCK_HEADING  = '## WORLD SNAPSHOT';

// A meta mode's prompt (the campaign recap) is one block: it is sent once a
// session, so there is nothing to read back from a cache. Its headings differ
// so splitNarratorSystemPrompt leaves it whole.
const META_NARRATION_HEADING = '## THIS SUMMARY';
const META_CONTEXT_HEADING   = '## CONTEXT FOR THIS SUMMARY';

/**
 * What every narration is, whatever its mode — the standing block's opening.
 * The mode's own role description follows in THIS NARRATION.
 */
const STANDING_ROLE =
  `You are the narrator for an Ironsworn: Starforged campaign. The rules in this first ` +
  `part hold for every narration. THIS NARRATION, after them, says what this one is ` +
  `for; CONTEXT FOR THIS NARRATION, last, is the story as it stands now.`;

/**
 * The line that opens the per-beat context: what it is, and — with a world
 * snapshot ahead of it — which of the two wins.
 */
const CONTEXT_INTRO          = `The story as it stands now. The rules above say how to use it.`;
const CONTEXT_INTRO_SNAPSHOT =
  `The story as it stands now. The rules above say how to use it. WORLD SNAPSHOT, above, holds the ` +
  `world's records as they stood when it was taken; this context is newer — where the two disagree, ` +
  `this context wins.`;
const META_STANDING_ROLE =
  `You are the narrator for an Ironsworn: Starforged campaign. The rules in this first ` +
  `part hold throughout. THIS SUMMARY, after them, says what you are asked to write; ` +
  `CONTEXT FOR THIS SUMMARY, last, is the campaign as it stands now.`;

/**
 * What THE SCENE's Turns on line says when the frame holds none, by the mode
 * of the narration reading it (known-issues NARRATOR-REFRAINS): the modes
 * whose fact block may set the scene's question are asked for it — from the
 * player's words. Since overhaul 2 (§7.2) only a beat of play the player's
 * words prompted may set one (provenance.js QUESTION_MODES): a clock vignette,
 * the oath scene and the inciting incident were asked to "set the one the
 * scene turns on now" with no line to set it from, and set the narrator's own
 * hook — they have no entry now. A session vignette (a bookend:
 * BOOKEND_FRAME_RULE), an `@scene` answer (it writes nothing back) and the
 * recap have none either, and are shown no such line.
 */
const SCENE_QUESTION_ASK = Object.freeze({
  move_resolution:  `none stands — if the player's latest line sets out to settle something, set that, in a few words that use the line's own; if it does not, set none.`,
  paced_narrative:  `none stands — if the player's latest line sets out to settle something, set that, in a few words that use the line's own; if it does not, set none.`,
  round_resolution: `none stands — if the players' lines this round set out to settle something, set that, in a few words that use their own; if they do not, set none.`,
  oracle_followup:  `none stands — if the question the player put to the oracle sets out to settle something, set that, in a few words that use the question's own; if it does not, set none.`,
});

/**
 * What a session vignette's fact block leaves alone (known-issues
 * NARRATOR-REFRAINS): the scene's question. A vignette is told to "end on a
 * beat that hands the scene to the players", and the hook it closed on — "What
 * is the speaker over the hatch about to say?" — was set as the question of the
 * scene it opened: all 22 of that session's prompts carried it. The apply
 * drops a vignette's question whatever it sends (narrator.js bookendFrame);
 * this keeps it from being written. In the vignette's mode
 * block: the standing block's sidecar instruction is the same for every mode.
 */
const BOOKEND_FRAME_RULE =
  `## A VIGNETTE IS NOT THE SCENE\n\n` +
  `This vignette brackets the session; the scene the players are in is not its to set. In its ` +
  `"sceneFrame" give where the vignette is set, who is in it and what is happening, and no ` +
  `"question": never set one, and never copy or mark answered one that THE SCENE shows. What ` +
  `the session's scene turns on is decided by the players' first line, not by how this vignette ends.`;

/**
 * The line that closes the per-narration context when the fact-continuity
 * sidecar is on (issue #354 P2-23). The sidecar instruction used to be the
 * prompt's last section, "the most recent guidance the model sees"; it is now
 * in the standing block, which is cached, so the last thing the narrator reads
 * points back at it. It names no key of the sidecar: the instruction is the
 * one place those are written (rules/narrator-memory.md invariant 2).
 */
const RESPOND_BLOCK =
  `## RESPOND NOW\n\n` +
  `Write the narration, then the one fenced JSON block, exactly as RESPONSE FORMAT — ` +
  `MANDATORY SIDECAR above specifies. The block is required on every response, after ` +
  `the prose, with everything that section marks REQUIRED.`;

/**
 * What closes the context of an `@scene` answer, in RESPOND NOW's place
 * (known-issues SCENE-ANSWER-NOT-A-CAMERA): an answer records nothing, so it
 * is asked for no fact block. The response format stays in the standing block
 * — that block is the same for every mode (rules/narrator-memory.md invariant
 * 7b) — and this says it is not an answer's. A block the model writes anyway
 * is taken off and dropped (narrator.js sceneAnswerText).
 */
const ANSWER_BLOCK =
  `## ANSWER NOW\n\n` +
  `Answer the player's question in plain words, from what is above, and stop. An answer ` +
  `records nothing: RESPONSE FORMAT — MANDATORY SIDECAR above is for narration and does ` +
  `not apply here. Write no JSON block.`;

/**
 * Build the narrator system prompt as its three blocks (issue #354 P2-23).
 *
 * The request used to carry the whole prompt as one cached block that opened
 * with the mode's role description and changed every beat, so nothing was ever
 * read back from the cache: every call paid the cache-write premium on the
 * whole prompt (27 calls, 0% read, in the alpha 23 playtest). The prompt is
 * now ordered by how often each part changes, and the request sends the parts
 * as separate blocks (splitNarratorSystemPrompt, narrator.js callNarratorAPI):
 *
 *   standing — the same for every prose mode, call after call: the voice
 *              rules (depict, do not offer; prose; tone; levity; dialogue),
 *              safety, world truths, campaign truths, the campaign premise,
 *              the sidecar response format, the NPC dialogue markup. It
 *              changes only when the table changes a setting, a Line or a
 *              truth. Cached.
 *   snapshot — the world snapshot (issue #357), when the narration has one
 *              (`extras.worldSnapshot`, narrator.js buildNarratorExtras →
 *              worldSnapshotStore.js): the whole world state as it stood when
 *              the snapshot was taken — every sector, entity card, faction,
 *              threat, lore entry, earlier sessions' summaries and hidden
 *              plan — stored text, sent byte for byte until a new one is
 *              taken. The same for every prose mode. Cached. '' without one,
 *              and the request is then as it was before the snapshot.
 *   mode     — what this narration is: the mode's role description, how a
 *              beat ends, perspective and length, the permission class, the
 *              opening scene's sidecar addendum. The same for every call of
 *              one mode at one permission class. Cached.
 *   beat     — the story as it stands: everything else, in the order it has
 *              always had, closing on the pointer back to the response
 *              format. Different every call. Not cached.
 *
 * The ordering rule: nothing that can differ between two calls goes in
 * `standing`, and nothing that can differ between two calls of one mode goes
 * in `mode`, unless it is constant for that block. A value read per call —
 * the perspective (a round forces third person), the X-Card redirect, oracle
 * seeds, the session's first-narration recap — belongs in `mode` or `beat`.
 * tests/unit/narratorPromptBlocks.test.js holds the two invariants: `standing`
 * is byte-identical across modes, and `standing` + `mode` across two beats of
 * one mode.
 *
 * A meta mode (campaign_recap) is not cached (`cached: false`): one call a
 * session. Its three parts are joined into one block.
 *
 * Sections, by block (the numbers are the ones this function has always used):
 *   standing: [0] voice rules · [1] safety · [4] world truths · [4a] campaign
 *             truths · [4b] campaign premise · [9] sidecar format · [10] NPC markup
 *   mode:     [0m] role, beat ending, perspective, length · [2] permissions ·
 *             [9m] the opening scene's sidecar addendum
 *   beat:     [0b] campaign recap · [1b] X-Card redirect · [2.5] shipboard ·
 *             [2.6] scene vow · [3] oracle seeds · [3b] recent oracles · [4c]
 *             last session, story so far · [4d]-[4j] World Journal state,
 *             clocks, focus, tracks · [5] location · [5b] active sector · [6]
 *             entity cards · [6.5] scene ledger · [6.6] unrevealed · [8]
 *             character · [8b] party · [8c] spotlight · [8d] this beat's prose
 *             · [9b] respond now
 *   With a snapshot, the context leaves out what the snapshot holds — [4c]'s
 *   last session, [4d]-[4g], [5], [5b], [6] and the plans of [6.6] — and has
 *   in their place [5s] IN PLAY NOW (the active sector, the current location
 *   and the entities and threats this narration involves, by name and id) and
 *   [5c] CHANGED SINCE THE SNAPSHOT (every record made or changed since, in
 *   full: it wins over the snapshot). [6.6] names the plans in play and keeps
 *   its rules and DECIDE NOW.
 *
 * @param {Object} campaignState      — CampaignStateSchema
 * @param {Object} narratorSettings   — narrator game.settings values
 * @param {Object|null} character     — CharacterSchema (active character, may be null)
 * @param {string} [campaignRecap]    — overrides extras.campaignRecap when non-empty
 * @param {Object} [extras]
 * @param {string} [extras.campaignRecap]      — the campaign recap, on a session's first narration ([0b])
 * @param {Object} [extras.previousSessionSummary] — `{ text, sessionNumber, isLast }`, rendered as LAST SESSION ([4c])
 * @param {string} [extras.narratorClass]      — "discovery" | "interaction" | "embellishment"
 * @param {Array}  [extras.entityCards]        — Pre-formatted entity card strings (from formatEntityCard)
 * @param {string} [extras.currentLocationCard]— Pre-formatted current location card
 * @param {string} [extras.activeSectorBlock]  — Pre-built active-sector anchor block listing
 *   established settlement names; tells the narrator to reuse them rather than invent
 *   alternatives. Built by `formatActiveSector` in narrator.js.
 * @param {Object} [extras.oracleSeeds]        — { results, names, context } per scope §7
 * @param {string} [extras.campaignTruthsBlock]— Pre-built `<campaign_truths>` block from system asset integration Phase 8
 * @param {string} [extras.mode]               — "move_resolution" | "paced_narrative" | "scene_interrogation" | …
 *   Selects the role description and downstream wording. Defaults to
 *   "move_resolution" for back-compat with existing call sites and tests.
 * @param {string[]} [extras.usedImages]       — the comparisons the recent narrations made ([8d])
 * @param {string[]} [extras.wornDetails]      — the details the recent narrations kept coming back to ([8d])
 * @param {{ hint: string }|null} [extras.beatShape] — the shape picked for this beat ([8d])
 * @param {{ text: string, changesText?: string }|null} [extras.worldSnapshot] — the world snapshot's
 *   block and what changed since, rendered (issue #357)
 * @param {Object|null} [extras.inPlay] — what IN PLAY NOW names (formatInPlayBlock), the cards of
 *   entities in play the snapshot leaves out (`uncoveredCards`, `currentLocationCard`) and the ids
 *   of the plans in play it holds (`coveredPlanIds`)
 * @returns {{ standing: string, snapshot: string, mode: string, beat: string, cached: boolean }}
 */
export function buildNarratorSystemBlocks(
  campaignState,
  narratorSettings,
  character,
  campaignRecap = '',
  extras = {},
) {
  const {
    narrationTone                 = 'wry',
    narrationLevity               = 'default',
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
    entityNamesById      = null,
    party                = null,
    rollingSummary       = '',
    shipboardGuidance    = '',
    spotlightBlock       = '',
    recentOracles        = [],
    activeThreats        = [],
    factionLandscape     = [],
    confirmedLore        = [],
    loreRecap            = '',
    previousSessionSummary = null,
    clocks               = [],
    sessionFocus         = null,
    progressTracks       = [],
    sceneLedger          = null,
    sceneNarrations      = null,
    playerLine           = '',
    pinnedChronicle      = null,
    unrevealed           = [],
    planRequests         = [],
    decideNowRequests    = null,
    plannedSubjects      = [],
    storyPeople          = [],
    strangers            = {},
    quietThread          = null,
    usedImages           = [],
    wornDetails          = [],
    beatShape            = null,
    worldSnapshot        = null,
    inPlay               = null,
  } = extras ?? {};

  const resolvedMode    = NARRATOR_MODES.has(mode) ? mode : 'move_resolution';
  const roleDescription = ROLE_DESCRIPTIONS[resolvedMode];
  const isMetaMode      = META_MODES.has(resolvedMode);
  // The world snapshot this narration reads (issue #357), when it has one:
  // the block goes between the standing rules and THIS NARRATION, and the
  // per-beat sections it covers are left out of the context below.
  const snapshot = !isMetaMode && typeof worldSnapshot?.text === 'string'
    && worldSnapshot.text.startsWith(`${SNAPSHOT_BLOCK_HEADING}\n`)
    ? worldSnapshot
    : null;
  const audioMarkupEnabled = extras?.audioMarkupEnabled === true;

  // A round speaks for every acting PC at once (its CHARACTER blocks, issue #342 Z40).
  // Auto keeps the perspective the session began with (issue #348 PT03).
  const resolvedPerspective = resolveNarrationPerspective(narrationPerspective, {
    actingCharacters: Array.isArray(extras?.roundCharacters) ? extras.roundCharacters.filter(Boolean).length : 0,
    sessionPerspective: sessionPerspectiveOf(campaignState),
  });
  const toneDesc        = TONE_DESCRIPTIONS[narrationTone]          ?? TONE_DESCRIPTIONS.wry;
  const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[resolvedPerspective] ?? PERSPECTIVE_DESCRIPTIONS.second_person;
  // Levity (issue #236) — optional tonal-weight modulation composed on top of
  // the tone. Empty for `default`/unknown values (no-op) and suppressed for
  // meta modes (a recap is an out-of-fiction summary, not live scene prose).
  const levityDesc      = LEVITY_DESCRIPTIONS[narrationLevity] ?? '';

  // ── The standing block ─────────────────────────────────────────────────────
  // Nothing here may differ between two calls: no mode, no perspective, no
  // per-beat value (the ordering rule, above).
  const standing = [];

  // [0] The voice rules — the anti-suggestion clause in every mode
  //     (paced-narrative carves out its closing italic move-hint in its own
  //     user message), the prose rules, tone, levity, dialogue.
  const styleLines = [`Tone: ${toneDesc}`];
  if (narrationInstructions?.trim()) {
    styleLines.push(`Custom instructions: ${narrationInstructions.trim()}`);
  }
  const levitySection = (levityDesc && !isMetaMode)
    ? `### LEVITY\n\n${levityDesc}\n\n`
    : '';

  standing.push(
    `## NARRATOR ROLE AND VOICE\n\n` +
    `${isMetaMode ? META_STANDING_ROLE : STANDING_ROLE}\n\n` +
    `### DEPICT, DO NOT OFFER\n\n` +
    `${ANTI_SUGGESTION_CLAUSE}\n\n` +
    `### PROSE\n\n` +
    `${PROSE_RULE}\n\n` +
    `### STYLE\n\n` +
    styleLines.join('\n') + `\n\n` +
    levitySection +
    `### DIALOGUE\n\n` +
    `When a character speaks, write their words in the first person — a speaking ` +
    `character refers to themselves as "I"/"me", never in the third person. A ` +
    `captured or absent character pleading over the comm says "if you want me ` +
    `back," not "if you want her back." Use third person only for what the ` +
    `narrator or OTHER characters say about someone, never for that person's own speech.\n` +
    // Issue #354 P2-22: an NPC's lines were set in italics in one narration —
    // the styling of the closing move-hint, so the two read as one thing.
    `Set speech in quotation marks, in plain type — never in italics. Italics are for ` +
    `a ship's name or one stressed word, and for the closing move hint where the user ` +
    `message asks for one.`
  );

  // [1] Safety configuration — with Private Lines scoped to this client: every
  //     player's on a GM's client, only the building player's own on a
  //     player's (formatNarratorSafetyContext). From the live store when the
  //     caller read it (buildNarratorExtras → extras.safety, issue #321 U08).
  const safetyContent = formatNarratorSafetyContext(
    extras?.safety ? { ...campaignState, safety: extras.safety } : campaignState,
  );
  if (safetyContent) standing.push(safetyContent);

  // [4] World truths
  const worldTruths = buildWorldTruthsBlock(campaignState);
  if (worldTruths) standing.push(worldTruths);

  // [4a] Campaign truths — canonical setting-truth digest from foundry-ironsworn
  if (typeof campaignTruthsBlock === 'string' && campaignTruthsBlock.trim()) {
    standing.push(campaignTruthsBlock.trim());
  }

  // [4b] Campaign premise — the inciting incident as durable canon. Campaign-
  //      level and never dropped (unlike the scene-scoped §6.5 ledger), so the
  //      opening premise can't age out of the ring or be cleared at scene end
  //      (PLAYTEST-1712 S).
  const incitingBlock = buildIncitingIncidentBlock(campaignState);
  if (incitingBlock) standing.push(incitingBlock);

  // [9] Fact-continuity sidecar instruction — every prose mode, gated by the
  //     master Fact Continuity setting; the sceneFrame key only when the A4
  //     frame is enabled. The same text for every mode: the opening scene's
  //     premise-capture addendum (narrator-memory architecture A2) is in the
  //     mode block ([9m]), and the context closes on a pointer back here ([9b]).
  const sidecarEnabled = factContinuityEnabled && !isMetaMode;
  if (sidecarEnabled) {
    standing.push(appendSidecarInstruction({
      sceneFrameEnabled: factContinuitySceneFrame,
      skeletonsEnabled:  narratorSettings?.narrativeSkeletons !== false,
    }));
  }

  // [10] Audio NPC-dialogue markup instruction — only when audio narration is
  // enabled. Tells the narrator to wrap NPC speech with <npc>…</npc> so the
  // audio pipeline can dispatch a distinct voice. See issue #221 (Audio
  // Narration) §6. Skipped for meta modes (a recap carries no live NPC
  // dialogue to voice).
  if (audioMarkupEnabled && !isMetaMode) {
    standing.push(appendNpcMarkupInstruction());
  }

  // ── The mode block ─────────────────────────────────────────────────────────
  // What this narration is. The same for every call of one mode at one
  // permission class (and, for a round, one size).
  const modeParts = [];

  // [0m] The mode's role description, how its beats end, and the two style
  //      lines that are not the same for every call: the perspective (a
  //      round of two or more is third person whatever the setting) and the
  //      length (the modes the Length setting governs — a round's grows with
  //      its entries).
  const modeStyle = [`Perspective: ${perspectiveDesc}`];
  if (NARRATION_LENGTH_MODES.has(resolvedMode)) {
    const lengthOpts = { audio: audioMarkupEnabled };
    modeStyle.push(`Length: ${lengthPhrase(narrationLength, lengthOpts)}. ${sentenceRule(narrationLength, lengthOpts)}`);
  }
  modeParts.push(
    `${isMetaMode ? META_NARRATION_HEADING : NARRATION_BLOCK_HEADING}\n\n` +
    `${roleDescription}\n\n` +
    (BEAT_ENDING_MODES.has(resolvedMode) ? `### HOW A BEAT ENDS\n\n${BEAT_ENDING_RULE}\n\n` : '') +
    `### PERSPECTIVE${NARRATION_LENGTH_MODES.has(resolvedMode) ? ' AND LENGTH' : ''}\n\n` +
    modeStyle.join('\n')
  );

  // [2] Narrator permissions — the creative-latitude block. Every prose mode
  //     has a latitude class: move_resolution's is resolved dynamically from
  //     the move outcome (passed in via extras.narratorClass); the other modes
  //     fall back to their per-mode default (DEFAULT_PERMISSION_CLASS_BY_MODE).
  //     Meta modes (recap) carry no latitude block — their role description
  //     governs.
  const effectiveClass = (narratorClass ?? DEFAULT_PERMISSION_CLASS_BY_MODE[resolvedMode]) ?? null;
  if (!isMetaMode && effectiveClass && NARRATOR_PERMISSION_KEYS.has(effectiveClass)) {
    modeParts.push(NARRATOR_PERMISSIONS[effectiveClass]);
  }

  // [9m] What the mode adds to the sidecar instruction — the opening scene's,
  //      and a session set-piece's account of its material (issue #381).
  if (sidecarEnabled) {
    const addendum = sidecarModeAddendum(resolvedMode);
    if (addendum) modeParts.push(`## ${resolvedMode === 'session_vignette' ? 'THE SCENE\'S MATERIAL' : 'THE OPENING SCENE'}\n\n${addendum}`);
    // …and what a session vignette's leaves alone: the scene's question.
    if (factContinuitySceneFrame && resolvedMode === 'session_vignette') modeParts.push(BOOKEND_FRAME_RULE);
  }

  // ── The beat block ─────────────────────────────────────────────────────────
  // The story as it stands. Different every call.
  const parts = [
    `${isMetaMode ? META_CONTEXT_HEADING : CONTEXT_BLOCK_HEADING}\n\n` +
    (snapshot ? CONTEXT_INTRO_SNAPSHOT : CONTEXT_INTRO),
  ];

  // [0b] Campaign recap — on a session's first narration, in any prose mode
  //      (buildNarratorExtras sets extras.campaignRecap; a recap passed as the
  //      positional argument wins).
  const recapText = campaignRecap?.trim() ? campaignRecap : (extras?.campaignRecap ?? '');
  if (typeof recapText === 'string' && recapText.trim()) {
    parts.push(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${recapText.trim()}`);
  }

  // [1b] X-Card redirect — the first narration after a GM resumes from an
  //      X-Card steers away from the beat the card removed (issue #321 U07;
  //      buildNarratorExtras → extras.xCardRedirect, cleared once a narration
  //      has posted). It never names the removed content.
  if (extras?.xCardRedirect && !isMetaMode) parts.push(XCARD_REDIRECT_BLOCK);

  // [2.5] Shipboard combat (Battle Stations!) — additive rules framing when a
  //       fight is active aboard the command vehicle. Supplements (does not
  //       replace) the permission class with the canonical crew-role context.
  //       The detection + text live in moves/battleStations.js (pure); extras
  //       carries the rendered block in, or '' when not applicable.
  if (shipboardGuidance) parts.push(shipboardGuidance);

  // [2.6] The vow this scene serves (issue #353 R3) — at the top of the
  //       per-beat context, in the beat modes: the vow a linked track, the
  //       session's quest focus or the only vow in play says this scene is
  //       for, with its progress, and the one instruction to show what a beat
  //       achieves toward it (buildNarratorExtras → extras.sceneVow).
  if (SCENE_VOW_MODES.has(resolvedMode)) {
    const sceneVowBlock = formatSceneVowBlock(extras?.sceneVow ?? null);
    if (sceneVowBlock) parts.push(sceneVowBlock);
  }

  // [3] Oracle seeds — only when the resolved move provides them
  const seedsBlock = formatOracleSeedsBlock(oracleSeeds);
  if (seedsBlock) parts.push(seedsBlock);

  // [3b] Recent oracle results — raw `!oracle` / `!pay-the-price` outcomes
  //      (narrator-context audit 2026-07: raw oracle results had no memory
  //      home; the narrator could contradict a roll the table just made).
  //      Read from campaignState.recentOracles via buildNarratorExtras;
  //      skipped for meta modes like every other live-scene block.
  if (!isMetaMode) {
    const recentOraclesBlock = formatRecentOraclesBlock(recentOracles);
    if (recentOraclesBlock) parts.push(recentOraclesBlock);
  }

  // [4c] Story so far — the rolling, session-scoped narrative summary
  //      (architecture §8.6). Bridges the arc the verbatim ring drops once a
  //      session runs long. Droppable continuity, not a fact store: it sheds
  //      before any §6.5 ledger tier and is never rendered for meta modes. See
  //      decisions.md → "Rolling session summary: a debounced trailing tier".
  //      The caveat line makes the "not a fact store" invariant visible to the
  //      model itself: the summary re-summarises raw prose (including narration
  //      whose facts were later retracted), so where it conflicts with the
  //      ledger, the ledger wins.
  //      The summary of the session before this one comes first (issue #286
  //      C3) — the ring, this session's summary and recent oracles all reset
  //      when a session is minted — under the same caveat.
  //      With a world snapshot, earlier sessions' summaries are in it (its
  //      EARLIER SESSIONS); this session's stays here — it changes as it runs.
  if (!isMetaMode) {
    const lastSessionBlock = snapshot ? '' : formatPreviousSessionBlock(previousSessionSummary);
    if (lastSessionBlock) parts.push(lastSessionBlock);
    const storyBlock = formatStorySoFarBlock(rollingSummary);
    if (storyBlock) parts.push(storyBlock);
  }

  // [4d]-[4g] World Journal state (FACTION-PACKET-DEAD fix, 2026-07) —
  //      active threats, the faction landscape, recent confirmed lore, and
  //      the `!lore` world-lore recap (LORERECAP-INJECT-ORPHANED fix).
  //      These rode the assembler context packet, which no live path ever
  //      read; they now render like every other extras block. Skipped for
  //      meta modes with the other live-scene sections.
  //      With a world snapshot (issue #357) all four are in it, whole — every
  //      threat, the whole landscape, all confirmed lore — and IN PLAY NOW
  //      names the threats in motion; nothing is sent twice.
  // The Lore sent with no snapshot, as kept: NAMES THE TABLE CHANGED reads
  // the old names in it, though it is sent in the new ones (issue #389 #2).
  let loreAsKept = '';
  if (!isMetaMode) {
    if (!snapshot) {
      const threatsBlock = formatActiveThreatsBlock(activeThreats);
      if (threatsBlock) parts.push(threatsBlock);
      const factionsBlock = formatFactionLandscapeBlock(factionLandscape);
      if (factionsBlock) parts.push(factionsBlock);
      const loreBlock = formatEstablishedLoreBlock(confirmedLore);
      if (loreBlock) {
        loreAsKept = loreBlock;
        parts.push(inTheNamesNow(loreBlock, extras?.nameChanges ?? campaignState?.nameChanges));
      }
      const recapBlock = formatWorldLoreRecapBlock(loreRecap);
      if (recapBlock) parts.push(recapBlock);
    }
    // [4h] Clocks and [4i] the session's focus (issue #286 C5) — neither
    //      reached any prompt.
    const clocksBlock = formatClocksBlock(clocks);
    if (clocksBlock) parts.push(clocksBlock);
    const focusBlock = formatSessionFocusBlock(sessionFocus);
    if (focusBlock) parts.push(focusBlock);
    // [4j] Open fights, expeditions and scene challenges (TRACKS-UNPORTED,
    //      issue #290) — only the retired assembler rendered them.
    const tracksBlock = formatProgressTracksBlock(progressTracks);
    if (tracksBlock) parts.push(tracksBlock);
  }

  if (snapshot) {
    // [5s] IN PLAY NOW (issue #357) — in place of [5], [5b] and [6]: the
    //      snapshot holds every sector and every card, so the context names
    //      the active sector, the current location and the entities and
    //      threats this narration involves, and says where to look. A record
    //      in play that the snapshot leaves out — an uncharted site the
    //      player's line names — still has its card here.
    const inPlayBlock = formatInPlayBlock(inPlay);
    if (inPlayBlock) parts.push(inPlayBlock);
    if (typeof inPlay?.currentLocationCard === 'string' && inPlay.currentLocationCard.trim()) {
      parts.push(`## CURRENT LOCATION\n\n${inPlay.currentLocationCard.trim()}`);
    }
    const uncoveredCards = formatEntityCardsBlock(inPlay?.uncoveredCards);
    if (uncoveredCards) parts.push(uncoveredCards);
    // [5c] CHANGED SINCE THE SNAPSHOT — every record made or changed since it
    //      was taken, in full. Where it and the snapshot disagree, it wins.
    const changedBlock = formatChangedSinceBlock(snapshot.changesText);
    if (changedBlock) parts.push(changedBlock);
  } else {
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
    const cardsBlock = formatEntityCardsBlock(entityCards);
    if (cardsBlock) parts.push(cardsBlock);
  }

  // [6.5] Active scene ledger — binding truths + current state for in-scope
  //       subjects. Gated by both the master fact-continuity toggle and the
  //       ledger-in-context sub-toggle (fact-continuity scope §6).
  //       The scene's ledgers come from the store as it stands now
  //       (`extras.sceneLedger` — buildNarratorExtras, issue #325 W05): a
  //       move narrates from a snapshot taken before its confirm dialog, and
  //       an X-Card or `!truth strike` made meanwhile is only in the store.
  //       Of this block a meta mode gets the ship's position alone — the one
  //       line of it that is no scene's. A recap retells the Chronicle, and
  //       the scene that happens to be open is not its to honour: told, as
  //       binding, the frame of End a Session's closing cutaway, it set the
  //       whole campaign there (issue #374 A1). What a recap is told of how
  //       things stand is its own section, [6.5m] below.
  // [6.4] NAMES THE TABLE CHANGED (issue #377 item 1) goes here, just above
  //       the scene's truths, once the rest of the prompt is built (below):
  //       it is told only where an old name still reaches the call.
  const namesAt = parts.length;
  // [6.5m] A recap is told how things stand in its own user message, read
  //        live — WHERE THINGS STAND, beside the session record it retells
  //        (record/recapView.js, issue #382): never from a summary, and never
  //        as a binding scene (issue #374 A1).
  const ledgerBlock = formatLedgerSection(withSceneLedger(campaignState, sceneLedger), {
    factContinuityEnabled, factContinuityLedgerInContext, factContinuityMaxLedgerTokens, factContinuitySceneFrame,
  }, {
    matchedEntityIds, entityNamesById, shipPositionOnly: isMetaMode,
    // A frame with no question asks for one — of the narrations whose fact
    // block may set it (never a vignette's, an `@scene` answer's or a recap's).
    askSceneQuestion: sidecarEnabled && factContinuitySceneFrame ? (SCENE_QUESTION_ASK[resolvedMode] ?? '') : '',
    sceneNarrations, playerLine,
    nameChanges: extras?.nameChanges ?? null,
    progressTracks,
    elsewhere: extras?.elsewhere ?? null,
    // The people met whom the table has not yet confirmed (whereabouts.js pendingPeopleOf).
    pendingPeople: Array.isArray(extras?.pendingPeople) ? extras.pendingPeople : [],
    // The recorded people's pronouns, from their cards: they win over the frame's (issue #402, change 2).
    cardPronouns: Array.isArray(extras?.cardPronouns) ? extras.cardPronouns : [],
  });
  if (ledgerBlock) parts.push(ledgerBlock);

  // [6.6] UNREVEALED — the narrative skeleton (issue #353): the hidden plans
  //       relevant to this beat (buildNarratorExtras selects them), and the
  //       plans this narration must decide in its sidecar. Never in a meta
  //       mode; its writes need the sidecar, so DECIDE NOW only with it.
  if (!isMetaMode) {
    //       With a world snapshot the plans themselves are in it: the
    //       block names the ones in play and keeps its rules and DECIDE NOW.
    //       DECIDE NOW lists the requests this narration is asked to decide
    //       (`decideNowRequests` — as many as one sidecar answers); the rest
    //       of what it carries (`planRequests` — a Batch Mode round can bring
    //       more) are filed with their rolls alone, never shown (issue #364
    //       ROUND-PLAN-REQUEST-CAP). Extras that name no asked list ask them all.
    const unrevealedBlock = formatUnrevealedBlock(unrevealed, {
      planRequests: Array.isArray(decideNowRequests) ? decideNowRequests : planRequests,
      plannedSubjects,
      // A who-vow's culprit: the people met, and the strangers to be shown (VOW-WON-BY-A-STRANGER).
      people: storyPeople,
      strangers,
      // A thread gone quiet, to be brought back with a clue (the maintainer's call after round 8).
      quiet: quietThread,
      // An `@scene` answer writes nothing back: the plans in play without the
      // lines that ask for a record of them, and nothing to decide.
      sidecar: factContinuityEnabled && resolvedMode !== 'scene_interrogation',
      coveredIds: snapshot ? (inPlay?.coveredPlanIds ?? []) : [],
      // The vows this beat's move fulfils (narrator.js buildNarratorExtras).
      endingSubjectIds: Array.isArray(extras?.endingTrackIds) ? extras.endingTrackIds : [],
    });
    if (unrevealedBlock) parts.push(unrevealedBlock);
  }

  // [7] — retired: a legacy "N active connection(s)" count of every id in
  // `connectionIds`, a lost connection's included, while the ACTIVE SECTOR
  // roster lists it apart as lost (issue #331 X29). The roster and CHARACTER
  // STATE name the connections; a bare count told the narrator nothing else.

  // [8] Character — a round (issue #340) has one CHARACTER block per acting
  // PC, in the round's order, as the galley vignette has for two or more PCs
  // at the table (issue #345 AA31); every other mode the one character speaking.
  // Each carries its PC's pinned Chronicle entries (issue #345 AA07).
  const roundCharacters = Array.isArray(extras?.roundCharacters) ? extras.roundCharacters.filter(Boolean) : [];
  const pinnedFor = (c) => (c?.actorId && pinnedChronicle && typeof pinnedChronicle === 'object' ? pinnedChronicle[c.actorId] : null) ?? [];
  if (roundCharacters.length) {
    for (const c of roundCharacters) parts.push(buildCharacterBlock(c, pinnedFor(c)));
  } else if (character) {
    parts.push(buildCharacterBlock(character, pinnedFor(character)));
  }

  // [8b] Party roster — multiplayer speaker disambiguation. Rendered only
  // when more than one player character shares the campaign; names the PC
  // speaking this turn so narration never conflates the party members.
  const partyBlock = buildPartyBlock(party);
  if (partyBlock) parts.push(partyBlock);

  // [8c] Spotlight rotation nudge (issue #232) — multiplayer turn-implication.
  // Pre-built in buildNarratorExtras (empty in solo play, non-eligible modes,
  // or when the toggle is off). Skipped for meta modes (a recap has no live
  // beat to address).
  if (spotlightBlock && !isMetaMode) parts.push(spotlightBlock);

  // [8d] This beat's prose (issue #354 P2-21, P2-22, P2-27) — the shape picked
  // for the beat, the levity permission said again where the outcome is, and
  // the comparisons the recent narrations already made. The beat modes only.
  if (BEAT_PROSE_MODES.has(resolvedMode)) {
    const beatProse = formatBeatProseBlock({ usedImages, wornDetails, beatShape, levity: narrationLevity });
    if (beatProse) parts.push(beatProse);
  }

  // [6.4] The names the table changed (issue #377 item 1,
  //       CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD): a GM's rename, or a
  //       table's correction of a name, leaves the old name in the snapshot's
  //       lore, plans and earlier sessions, in clocks and in the scene's own
  //       truths — and, told nothing, the narrator made both names true. A
  //       change is told while it is this session's, or while its old name is
  //       anywhere in what this call sends (the cached blocks included, and
  //       what a caller adds — the recap's Chronicle). Per-beat: it changes
  //       as the stores do.
  const namesBlock = formatNameChangesBlock(extras?.nameChanges ?? campaignState?.nameChanges, {
    sessionId: campaignState?.currentSessionId ?? null,
    texts: [
      ...standing, snapshot?.text ?? '', loreAsKept, ...modeParts, ...parts,
      ...(Array.isArray(extras?.nameChangeTexts) ? extras.nameChangeTexts : []),
    ],
  });
  if (namesBlock) parts.splice(namesAt, 0, namesBlock);

  // [9b] The pointer back to the response format — last, so it is the most
  // recent guidance the narrator reads, as the instruction itself used to be.
  //      An `@scene` answer closes on its own: it writes no fact block.
  if (sidecarEnabled) parts.push(resolvedMode === 'scene_interrogation' ? ANSWER_BLOCK : RESPOND_BLOCK);

  return {
    standing: standing.join(SECTION_RULE),
    // In the names the table uses now (issue #389 #2): a correction's old
    // name in its Lore read "Ashen Wake: driven off the docking ring…", and
    // the sixth live long haul's a77 narrator wrote the wreck of the "Cinder
    // Wren" beside it. NAMES THE TABLE CHANGED still tells the change.
    snapshot: snapshot ? inTheNamesNow(snapshot.text.trim(), extras?.nameChanges ?? campaignState?.nameChanges) : '',
    mode:     modeParts.join(SECTION_RULE),
    beat:     parts.join(SECTION_RULE),
    cached:   !isMetaMode,
  };
}

/**
 * Build the full narrator system prompt, as one string: the blocks of
 * buildNarratorSystemBlocks — the standing rules, the world snapshot when
 * there is one, this narration, its context — joined by the section rule. It
 * is what every narrator call site builds and
 * hands to callNarratorAPI, which sends it as those blocks
 * (splitNarratorSystemPrompt), and what `!narrator debug` shows.
 *
 * @param {Object} campaignState      — CampaignStateSchema
 * @param {Object} narratorSettings   — narrator game.settings values
 * @param {Object|null} character     — CharacterSchema (active character, may be null)
 * @param {string} [campaignRecap]    — overrides extras.campaignRecap when non-empty
 * @param {Object} [extras]           — see buildNarratorSystemBlocks
 * @returns {string}
 */
export function buildNarratorSystemPrompt(
  campaignState,
  narratorSettings,
  character,
  campaignRecap = '',
  extras = {},
) {
  const blocks = buildNarratorSystemBlocks(campaignState, narratorSettings, character, campaignRecap, extras);
  return [blocks.standing, blocks.snapshot, blocks.mode, blocks.beat].filter(Boolean).join(SECTION_RULE);
}

/**
 * A narrator system prompt as the blocks the request carries (issue #354
 * P2-23): the standing rules, the world snapshot when the narration has one
 * (issue #357; marked `snapshot`), this narration, and its context — found by
 * the headings buildNarratorSystemBlocks opens each with. All but the last
 * are the cached prefix; the context is never cached.
 *
 * A prompt without the mode and context headings — a meta mode's, the rolling
 * summary's own — comes back as one block, not cached: it has no prefix a
 * later call repeats.
 *
 * @param {string} systemPrompt — buildNarratorSystemPrompt's string, or any other system prompt
 * @returns {Array<{ text: string, cached: boolean, snapshot?: boolean }>} never empty for a non-empty prompt
 */
export function splitNarratorSystemPrompt(systemPrompt) {
  const text = typeof systemPrompt === 'string' ? systemPrompt : '';
  if (!text) return [];
  const at = (heading, from = 0) => text.indexOf(`${SECTION_RULE}${heading}\n`, from);
  const modeAt    = at(NARRATION_BLOCK_HEADING);
  const contextAt = modeAt < 0 ? -1 : at(CONTEXT_BLOCK_HEADING, modeAt + SECTION_RULE.length);
  if (modeAt <= 0 || contextAt < 0) return [{ text, cached: false }];
  // A world snapshot sits between the standing rules and THIS NARRATION. Its
  // own text never holds a section rule (worldSnapshot.js unitText), so the
  // first THIS NARRATION is the mode block's whether or not there is one.
  const snapshotAt  = at(SNAPSHOT_BLOCK_HEADING);
  const standingEnd = snapshotAt > 0 && snapshotAt < modeAt ? snapshotAt : modeAt;
  return [
    { text: text.slice(0, standingEnd), cached: true },
    ...(standingEnd < modeAt ? [{ text: text.slice(standingEnd + SECTION_RULE.length, modeAt), cached: true, snapshot: true }] : []),
    { text: text.slice(modeAt + SECTION_RULE.length, contextAt), cached: true },
    { text: text.slice(contextAt + SECTION_RULE.length), cached: false },
  ].filter(b => b.text);
}

/**
 * [5s] IN PLAY NOW (issue #357) — with a world snapshot, the records this
 * narration involves, by name and id: the active sector, the current
 * location, the entities relevance and the scene frame's cast matched, and
 * the threats in motion. The snapshot (or CHANGED SINCE THE SNAPSHOT) holds
 * each one's content; this says where to look. '' when it names nothing.
 *
 * @param {{ activeSector?: { id: string, name: string }|null, currentLocation?: { id: string, name: string }|null,
 *   entities?: Array<{ id: string, name: string, type: string }>,
 *   threats?: Array<{ id: string, name: string, severity: string }> }|null} inPlay
 * @returns {string}
 */
function formatInPlayBlock(inPlay) {
  const named = (x) => typeof x?.name === 'string' && x.name.trim();
  const id = (x) => (x?.id ? `id ${x.id}` : '');
  const lines = [];
  if (named(inPlay?.activeSector))    lines.push(`- Active sector: ${inPlay.activeSector.name.trim()}${id(inPlay.activeSector) ? ` (${id(inPlay.activeSector)})` : ''}`);
  if (named(inPlay?.currentLocation)) lines.push(`- Current location: ${inPlay.currentLocation.name.trim()}${id(inPlay.currentLocation) ? ` (${id(inPlay.currentLocation)})` : ''}`);
  const entities = (Array.isArray(inPlay?.entities) ? inPlay.entities : []).filter(named)
    .map(e => `${e.name.trim()} (${[ENTITY_TYPE_LABELS[e.type] ?? 'Entity', id(e)].filter(Boolean).join(', ')})`);
  if (entities.length) lines.push(`- In this scene: ${entities.join('; ')}`);
  const threats = (Array.isArray(inPlay?.threats) ? inPlay.threats : []).filter(named)
    .map(t => `${t.name.trim()} (${[t.severity, id(t)].filter(Boolean).join(', ')})`);
  if (threats.length) lines.push(`- Threats in motion: ${threats.join('; ')}`);
  if (!lines.length) return '';
  return (
    `## IN PLAY NOW\n\n` +
    `The records this narration involves. WORLD SNAPSHOT holds each one — find it there by name or id. ` +
    `One that is also under CHANGED SINCE THE SNAPSHOT below is as it stands there.\n\n` +
    lines.join('\n')
  );
}

/**
 * [5c] CHANGED SINCE THE SNAPSHOT (issue #357) — the records made or changed
 * since the world snapshot was taken, each in full, under the snapshot's own
 * section headings (worldSnapshot.js renderUnitSections). '' when nothing
 * changed.
 *
 * @param {string} changesText
 * @returns {string}
 */
function formatChangedSinceBlock(changesText) {
  const text = typeof changesText === 'string' ? changesText.trim() : '';
  if (!text) return '';
  return (
    `## CHANGED SINCE THE SNAPSHOT\n\n` +
    `Made or changed after WORLD SNAPSHOT was taken — each in full, as it stands now. Where anything ` +
    `here disagrees with the snapshot, this wins. A hidden plan here is used only when UNREVEALED ` +
    `names it.\n\n` +
    text
  );
}

/** The UNREVEALED section's budget for its plans, in estimated tokens (DECIDE NOW is never trimmed). */
export const UNREVEALED_MAX_TOKENS = 600;

const SKELETON_KIND_NAMES = Object.freeze({
  threat: 'Threat', mystery: 'Mystery', npcAgenda: 'NPC agenda',
  expedition: 'Expedition', discovery: 'Discovery', vow: 'Vow',
});

/** A plan's heading: "Threat — the escort", "Mystery — "Which name…?" (about the escort)". */
function skeletonHeading(r) {
  const kind = SKELETON_KIND_NAMES[r?.kind] ?? 'Plan';
  if (r?.kind === 'mystery' && r.question) {
    const about = r.subject?.name && r.subject.name !== 'the scene' ? ` (about ${r.subject.name})` : '';
    return `${kind} — "${r.question}"${about}`;
  }
  const also = Array.isArray(r?.aliases) && r.aliases.length ? ` (also called: ${r.aliases.join(', ')})` : '';
  return `${kind} — ${r?.subject?.name ?? ''}${also}`;
}

/** What a plan's fields are called for the narrator — an expedition's read as its journey (issue #353 Phase 3). */
const ENTRY_LABELS = Object.freeze({
  default:    { truth: 'Truth', steps: 'Escalation, in order', clues: 'Clues' },
  mystery:    { truth: 'Answer', steps: 'Escalation, in order', clues: 'Clues' },
  expedition: { truth: 'What waits at the end', steps: 'Dangers along the way, in order',
    clues: 'Waypoints, in order (the next not yet shown is the next one reached)' },
});

/**
 * Whether the X-Card withheld a plan's truth (`truthWithheldBy` on the record,
 * issue #364 XCARD-REVEAL-REREVEAL-NO-LORE): the narrator is never given it,
 * nor asked to reveal it.
 */
const truthWithheld = (r) => typeof r?.truthWithheldBy === 'string' && r.truthWithheldBy.length > 0;

/** One decided plan, as the narrator reads it — a withheld truth left out (truthWithheld). */
function formatSkeletonEntry(r) {
  const label = ENTRY_LABELS[r.kind] ?? ENTRY_LABELS.default;
  const lines = [`### ${skeletonHeading(r)} (id ${r.id})`];
  const withheld = truthWithheld(r);
  lines.push(withheld
    ? `${label.truth}: not part of this story — never decide, reveal or hint at it, and never record "truth" as revealed for this plan.`
    : `${label.truth}: ${r.truth}${r.truthRevealed ? ' (already revealed — the characters know it)' : ''}`);
  if (r.wants) lines.push(`Wants: ${r.wants}`);
  if (r.knows) lines.push(`Knows: ${r.knows}`);
  const steps = (r.escalation ?? []).map(e => `[${e.id}] ${e.text}${e.done ? ' (played)' : ''}`);
  if (steps.length) lines.push(`${label.steps}: ${steps.join('; ')}`);
  const clues = (r.clues ?? []).map(c => `[${c.id}] ${c.text}${c.revealed ? ' (shown)' : ''}`);
  if (clues.length) lines.push(`${label.clues}: ${clues.join('; ')}`);
  if (r.resolutions?.length) lines.push(`Could end: ${r.resolutions.join('; ')}`);
  if (r.kind === 'expedition') {
    lines.push(withheld ? 'When the expedition is finished, record it as resolved.'
      : 'When the expedition is finished, what waits at the end comes out: record it as revealed ("truth") and resolved.');
  } else if (r.kind === 'vow') {
    // A vow's end does not reveal its truth; telling it does (known-issues
    // VOW-FULFILLED-WITH-NOBODY-NAMED: "and "truth" as revealed if it comes
    // out" was recorded under a fulfilment whose prose told none of it).
    lines.push(withheld ? 'When the vow is fulfilled or forsaken, its story ends: record it as resolved.'
      : 'When the vow is fulfilled or forsaken, its story ends: record it as resolved. Its truth comes out only by being told: ' +
        'record "truth" as revealed when your prose states it, never because the vow ended.');
  }
  return lines.join('\n');
}

/**
 * [6.6] THIS BEAT ENDS A VOW — for each decided vow plan the beat's move
 * fulfils (`endingSubjectIds`, the vow's id on the move's `endingTrackIds`;
 * known-issues VOW-FULFILLED-WITH-NOBODY-NAMED, the long haul's third live
 * run, a64). "Find who is raiding the Cinder Expanse lanes" was fulfilled
 * under UNREVEALED's standing rule — "Never state one outright" — and its
 * narration obeyed: "The thing you swore to find has a hand and a seal, and
 * both are named now", with no name anywhere in the story, and "truth"
 * recorded as revealed. The fulfilment is where the vow's truth is told, so
 * the rule is lifted for that plan, here: the prose states the truth, as far
 * as the truth goes, and claims nothing it does not hold. '' with no such
 * plan, and for one whose truth the X-Card withheld (truthWithheld).
 *
 * @param {Object[]} decided — the decided plans in play
 * @param {Iterable<string>} endingSubjectIds
 * @returns {string[]} lines, [] for none
 */
function vowEndingLines(decided, endingSubjectIds) {
  const ending = new Set(endingSubjectIds ?? []);
  const vows = decided.filter(r => r?.kind === 'vow' && r.subject?.id && ending.has(r.subject.id) && !truthWithheld(r));
  if (!vows.length) return [];
  return [
    '',
    '### THIS BEAT ENDS A VOW',
    `The move this beat narrates fulfils ${vows.map(r => `${skeletonHeading(r)} (id ${r.id})`).join(' and ')}. What that vow set out`,
    'to find, do or learn is told now, in the prose, as far as the story holds it:',
    '- For this plan the rule against stating a truth outright is lifted. Where the fulfilment brings its',
    '  truth out — it does when the vow was sworn to find out who, what or why, and the Truth line is the',
    '  answer — state that truth in the narration itself, in plain words a player could repeat: who or what',
    '  it is, where, what they want, as the Truth line gives them. Then record "truth" as revealed. A truth',
    '  recorded as revealed that the prose did not tell is not revealed.',
    '- The Truth line is all there is to tell. Where it gives no name, there is no name: say what was found,',
    '  and say plainly that the rest — who, by name — is still not known.',
    '- Never write that an answer is "known", "named", "found" or "proved" without saying what it is.',
  ];
}

/**
 * An active plan as the world snapshot holds it (issue #357): a decided one
 * as UNREVEALED shows it; one not yet decided by its heading and the oracle
 * rolls it waits on (DECIDE NOW lists it, in the context, when it is in
 * play). '' for anything that is no plan.
 *
 * @param {Object} r — a plan record (skeletons.js normaliseSkeleton)
 * @returns {string}
 */
export function formatSnapshotPlan(r) {
  if (!r || typeof r !== 'object' || !r.subject || !r.id) return '';
  if (typeof r.truth === 'string' && r.truth.trim()) return formatSkeletonEntry(r);
  const seeds = Array.isArray(r.oracleSeeds) && r.oracleSeeds.length ? `\nOracle rolls: ${r.oracleSeeds.join('; ')}` : '';
  return `### ${skeletonHeading(r)} (id ${r.id})\nNot yet decided — what is true of it is decided when it is next in play.${seeds}`;
}

/**
 * What a decided who-vow plan carries when its truth names someone the story
 * has not met (VOW-WON-BY-A-STRANGER): show them before the truth comes out.
 * The one wording, for a plan written out under UNREVEALED and one the world
 * snapshot holds (IN PLAY FOR THIS NARRATION).
 *
 * @param {string} name
 * @returns {string}
 */
function strangerLine(name) {
  return `Not yet in play: ${name}. Before this truth is revealed, show ${name} in the story — seen, met, or spoken of by name — as one of its clues.`;
}

/**
 * [6.6] UNREVEALED — the narrative skeleton's hidden plans for this beat
 * (issue #353 "What the narrator sees"), and — with the sidecar — DECIDE NOW,
 * the plans this narration must decide: a price that revealed a new enemy
 * (`planRequests`, by ref — the ones this narration is asked to decide,
 * `extras.decideNowRequests`: as many as one sidecar can answer), a posed
 * question whose answer was rolled but not
 * yet decided (a plan with no truth, by id). The plans are trimmed from the
 * end to UNREVEALED_MAX_TOKENS; DECIDE NOW is not. Without the sidecar (the
 * Private Channel) only decided plans, and no instruction to write. Exported
 * for unit testing and the Private Channel's shared story.
 *
 * @param {Object[]} skeletons — selectRelevantSkeletons' records
 * @param {{ planRequests?: Object[], plannedSubjects?: Object[], sidecar?: boolean, maxTokens?: number,
 *   coveredIds?: string[], endingSubjectIds?: string[], people?: string[], strangers?: Object<string, string>, quiet?: Object|null }} [opts] —
 *   `people`: the people the story has met, for a who-vow's DECIDE NOW to prefer as the one behind it;
 *   `strangers`: decided who-vow plans whose truth names someone not met — id → name — each told to
 *   show that person in play before the truth is revealed (VOW-WON-BY-A-STRANGER, round 8);
 *   `quiet`: a thread gone quiet — { id, subject, scenes, clue } (skeletons.js quietestPlan) — told to come
 *   back in this beat through that clue (A THREAD GONE QUIET; the maintainer's call after round 8);
 *   `plannedSubjects`: the beings that already have a plan (skeletons.js plannedBeings), listed under
 *   DECIDE NOW when an enemy or an NPC's agenda is being decided, so the narrator can answer that the
 *   "new" one is one of them (`sameAs`, issue #354 P2-30);
 *   `coveredIds`: the decided plans the world snapshot holds (issue #357) — each is named by its
 *   heading and id, not printed again; a decided plan not among them is printed as before;
 *   `endingSubjectIds`: the vows the beat's move fulfils (its `endingTrackIds`) — a vow plan about one
 *   is told now (THIS BEAT ENDS A VOW, vowEndingLines)
 * @returns {string} '' when there is nothing to show
 */
export function formatUnrevealedBlock(skeletons, { planRequests = [], plannedSubjects = [], sidecar = true, maxTokens = UNREVEALED_MAX_TOKENS, coveredIds = [], endingSubjectIds = [], people = [], strangers = {}, quiet = null } = {}) {
  const list = (Array.isArray(skeletons) ? skeletons : []).filter(r => r && typeof r === 'object' && r.subject);
  const covered = new Set(Array.isArray(coveredIds) ? coveredIds : []);
  const everyDecided = list.filter(r => typeof r.truth === 'string' && r.truth.trim());
  const named   = everyDecided.filter(r => covered.has(r.id));
  const decided = everyDecided.filter(r => !covered.has(r.id));
  const pending = sidecar ? list.filter(r => !(typeof r.truth === 'string' && r.truth.trim())) : [];
  const requests = sidecar ? (Array.isArray(planRequests) ? planRequests : []).filter(q => q?.ref) : [];
  if (!everyDecided.length && !pending.length && !requests.length) return '';

  const lines = [
    '## UNREVEALED — FOR THE NARRATOR ONLY',
    '',
    'The story holds these truths, but the characters do not know them yet. Never state one outright,',
    'and never hint that a plan exists. Let them shape what characters do and say, which clues appear',
    'and what escalates.',
    '- Reveals follow move outcomes. When a move touches a subject below, a hit shows one of its clues',
    '  or moves it toward a way it could end; a weak hit shows a clue with a complication; a miss plays',
    '  its next escalation step. A beat that does not touch a subject leaves it alone.',
    '- When a character has refused the same request twice, the next beat reveals, trades or escalates.',
  ];
  if (sidecar) {
    lines.push(
      '- When this beat shows something below, record exactly what it showed in your sidecar:',
      '  "reveals": [{ "id": "<its id>", "revealed": ["<clue id>", or "truth" when the truth itself comes',
      '  out>], "advanced": "<the escalation step id it played>", "resolved": true when its story ends }].',
      '  Only what this beat actually showed; nothing for a subject it did not touch.',
      // VOW-FULFILLED-WITH-NOBODY-NAMED: "truth" was recorded under prose that told none of it.
      '  "truth" only when the prose of this narration states the truth itself, naming what it names: a',
      '  line saying that something is now known, named or proved, without saying what, reveals nothing.',
      '- Where your narration contradicts something below, your narration stands: record the change in',
      '  your sidecar as "plans": [{ "id": "<its id>", …only the fields that changed: "subject", "truth",',
      '  "wants", "knows", "escalation", "clues" or "resolutions" }].',
    );
  }

  const budget = Math.max(0, Number(maxTokens) || 0) * 4;   // ~4 characters a token
  let used = lines.join('\n').length;
  const entries = [];
  // A who-vow's culprit the story has not met is shown before the truth comes
  // out (VOW-WON-BY-A-STRANGER: round 8's vow was won by a name the player
  // never saw) — told with the plan, whether it is written out here or held
  // by the world snapshot (issue #397, Code fix 1: the snapshot, on by
  // default, held round 8's plan in every narration, and the line rode only
  // with a plan written out here).
  const strangerOf = (r) => (typeof strangers?.[r.id] === 'string' && strangers[r.id].trim() ? strangerLine(strangers[r.id].trim()) : '');
  for (const r of decided) {
    const stranger = strangerOf(r);
    const entry = formatSkeletonEntry(r) + (stranger ? `\n- ${stranger}` : '');
    if (entries.length && used + entry.length > budget) break;   // the first always shows
    entries.push(entry);
    used += entry.length;
  }
  if (entries.length) lines.push('', entries.join('\n\n'));
  // A thread gone quiet (the maintainer's call after round 8): one plan that
  // has not come up for scenes, brought back in this beat with a clue — the
  // exception to "a beat that does not touch a subject leaves it alone".
  if (sidecar && quiet && typeof quiet === 'object' && quiet.id && quiet.clue && list.some(r => r.id === quiet.id)) {
    lines.push('', '### A THREAD GONE QUIET',
      `${quiet.subject} (id ${quiet.id}) has not come up for ${quiet.scenes} scenes. Bring it back in this beat through one of its clues — `
      + `"${quiet.clue}" — shown in the fiction, never explained, and record the reveal in your sidecar.`);
  }
  if (named.length) {
    lines.push(
      '',
      '### IN PLAY FOR THIS NARRATION',
      'Each of these is written out under HIDDEN PLANS in WORLD SNAPSHOT — or, changed since, under',
      'CHANGED SINCE THE SNAPSHOT, which wins. Use these and no other plan the snapshot holds:',
      ...named.map(r => `- ${skeletonHeading(r)} (id ${r.id})${strangerOf(r) ? `\n  ${strangerOf(r)}` : ''}`),
    );
  }
  // The vow this beat's move fulfils is told now — with the fact block, which
  // records it (the Private Channel narrates no move).
  if (sidecar) lines.push(...vowEndingLines(everyDecided, endingSubjectIds));

  if (pending.length || requests.length) {
    lines.push(
      '',
      '### DECIDE NOW',
      'Each of these has entered the story but has not been decided. Decide what is true about it now —',
      'from its oracle rolls and what the story has established, in Starforged terms — and record it in',
      'your sidecar, whether or not this beat shows any of it (show none of it outright):',
      '  "plans": [{ "id": "<its id>", "subject": "<the name your prose uses for it>",',
      '    "truth": "<what it really is, 1-3 sentences>", "wants": "<what it is trying to do>",',
      '    "knows": "<what it knows that the characters do not>",',
      '    "escalation": ["<2-3 steps, in order: what happens if it is ignored or provoked>"],',
      '    "clues": ["<2-4 things the fiction can show that point at the truth>"],',
      '    "resolutions": ["<1-3 ways it could end>"] }]',
      'If one oracle result for a subject contradicts what the story has established, use its re-roll in',
      'that result\'s place — once — and add "rerolled": "<the result it replaces>" to that entry.',
    );
    const rerollOf = (x) => (typeof x?.reroll === 'string' && x.reroll ? ` Re-roll: ${x.reroll}.` : '');
    // A vow that asks who is won by a name (VOW-FULFILLED-UNANSWERED): its
    // truth names the one behind it — and an oath whose plan names no one is
    // asked for it once more (narrator.js whoPlanNamingAsk; issue #402,
    // change 4, which deleted the name drawn from the name oracle).
    // The one behind it is one of the story's people where one fits (the
    // maintainer's call after round 8, VOW-WON-BY-A-STRANGER), and a new one is
    // shown in play before the truth comes out.
    const met = (Array.isArray(people) ? people : []).map(n => String(n ?? '').trim()).filter(Boolean);
    const whoOf = (kind, name) => (kind === 'vow' && vowAsksWho(name)
      ? ` Its truth names the one behind it — a person, by name: ${met.length ? `one of the people the story has met if one fits (${met.join(', ')}), else a new name` : 'someone the story has met, or a new name'}; a new one is shown in play, by name, before the truth is revealed.`
      : '');
    for (const q of requests) {
      const seeds = Array.isArray(q.oracleSeeds) && q.oracleSeeds.length ? ` Oracle: ${q.oracleSeeds.join('; ')}.` : '';
      const journey = q.kind === 'expedition'
        ? ' Its truth is what waits at the end, its clues are 2-4 waypoints in order, its escalation the danger along the way.'
        : '';
      lines.push(`- id ${q.ref}: ${SKELETON_KIND_NAMES[q.kind] ?? 'Plan'} — ${q.label}.${journey}${whoOf(q.kind, q.label)}${seeds}${rerollOf(q)}`);
    }
    for (const r of pending) {
      const seeds = Array.isArray(r.oracleSeeds) && r.oracleSeeds.length ? ` Oracle: ${r.oracleSeeds.join('; ')}` : '';
      const what = r.kind === 'mystery' && r.question
        ? `the hidden answer to ${skeletonHeading(r).replace(/^Mystery — /, '')}.${seeds}${seeds ? ' — use the pair that fits.' : ''}`
        : `${skeletonHeading(r)}.${whoOf(r.kind, r.subject?.name)}${seeds}`;
      lines.push(`- id ${r.id}: ${what}${rerollOf(r)}`);
    }
    // Issue #354 P2-30: one enemy named three ways got three plans. Names
    // that share a word are matched in code; only the narrator knows "the
    // second presence" is the escort — so it is shown who is planned already.
    const BEINGS = new Set(['threat', 'npcAgenda']);
    const deciding = new Set(pending.map(r => r.id));
    const planned = (Array.isArray(plannedSubjects) ? plannedSubjects : [])
      .filter(p => p?.id && p.name && !deciding.has(p.id));
    if (planned.length && (requests.some(q => BEINGS.has(q.kind)) || pending.some(r => BEINGS.has(r.kind)))) {
      lines.push(
        '',
        '### ALREADY PLANNED',
        'If an enemy or a person above is in truth one of these under another name, do not decide it a',
        'second time: answer it with only { "id": "<its id above>", "sameAs": "<the id below of the one it is>",',
        '"subject": "<the name your prose uses for it>" }.',
        ...planned.map(p => `- id ${p.id}: ${SKELETON_KIND_NAMES[p.kind] ?? 'Plan'} — ${p.name}` +
          `${Array.isArray(p.aliases) && p.aliases.length ? ` (also: ${p.aliases.join(', ')})` : ''}`),
      );
    }
  }
  return lines.join('\n');
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

/**
 * Format the RECENT ORACLE RESULTS block ([3b]) from the entries
 * `readRecentOracleResults` returns (src/oracles/oracleMemory.js). Returns ''
 * when there is nothing to render. Exported for unit testing.
 *
 * @param {Array<{ name: string, question: string, answer: string }>} entries
 * @returns {string}
 */
export function formatRecentOraclesBlock(entries) {
  const list = Array.isArray(entries)
    ? entries.filter(e => e && (e.name || e.answer))
    : [];
  if (!list.length) return '';

  const lines = ['## RECENT ORACLE RESULTS (this session, oldest first)', ''];
  for (const e of list) {
    const q = e.question ? ` "${e.question}"` : '';
    lines.push(`- ${e.name || 'Oracle'}:${q} → ${e.answer}`);
  }
  lines.push('');
  // Which gives way (known-issues ORACLE-NO-NARRATED-AS-YES): a narration
  // written before an answer, or beside it, may say otherwise — the answer stands.
  lines.push(
    'The dice established these outcomes. Your narration must not contradict ' +
    'them — build on what the oracle answered. Where earlier narration in this ' +
    'prompt says otherwise, the answer stands and the story is brought into ' +
    'line with it, never the answer with the story.',
  );
  return lines.join('\n');
}

/**
 * Format the ACTIVE THREATS block ([4d]) from getActiveThreats entries.
 * Returns '' when empty. Exported for unit testing.
 */
export function formatActiveThreatsBlock(threats) {
  const list = Array.isArray(threats) ? threats.filter(t => t && t.name) : [];
  if (!list.length) return '';
  const lines = ['## ACTIVE THREATS', ''];
  for (const t of list) {
    const summary = t.summary ? `: ${t.summary}` : '';
    lines.push(`- ${t.name} (${t.severity ?? 'looming'})${summary}`);
  }
  lines.push('');
  lines.push('These dangers are established and in motion — weave them consistently; do not resolve or dismiss one without the fiction earning it.');
  return lines.join('\n');
}

/**
 * Format the FACTION LANDSCAPE block ([4e]) from mergeFactionLandscape
 * entries ({ name, stance, detail }). Returns '' when empty. Exported for
 * unit testing.
 */
export function formatFactionLandscapeBlock(entries) {
  const list = Array.isArray(entries) ? entries.filter(e => e && e.name) : [];
  if (!list.length) return '';
  const lines = ['## FACTION LANDSCAPE', ''];
  for (const e of list) {
    const bits = [e.stance ? `stance: ${e.stance}` : '', e.detail ?? ''].filter(Boolean).join(' · ');
    lines.push(`- ${e.name}${bits ? ` — ${bits}` : ''}`);
  }
  lines.push('');
  lines.push('These stances are established — keep faction behaviour consistent with them; a stance changes only through played fiction.');
  return lines.join('\n');
}

/**
 * Format the ESTABLISHED LORE block ([4f]) from the World Journal entries
 * ({ title, text }) buildNarratorExtras picked for this turn
 * (selectLoreForContext — relevant first, then recent). Text is clipped to
 * keep the block bounded. Returns '' when empty. Exported for unit testing.
 */
export function formatEstablishedLoreBlock(lore) {
  const list = Array.isArray(lore) ? lore.filter(l => l && (l.title || l.text)) : [];
  if (!list.length) return '';
  const clip = (t) => {
    const v = String(t ?? '').trim();
    return v.length > 160 ? `${v.slice(0, 157)}…` : v;
  };
  const lines = ['## ESTABLISHED LORE', ''];
  for (const l of list) lines.push(loreLine(String(l.title ?? '').trim(), clip(l.text)));
  return lines.join('\n');
}

/**
 * One Lore entry as a line — `- title: text` — its fact said once (issue
 * #388 #18, LORE-LINE-SAID-TWICE). A truth's Lore entry is titled
 * "Subject: fact" and holds the fact again: the fifth live long haul's
 * narrator read "- Mira Kestrel: promised Tamsin Vey she would be back before
 * the next cargo arrives: promised Tamsin Vey she would be back before the
 * next cargo arrives" for every one. A title that holds its text is the line;
 * one that opens on it cut short ("Subject: the first words…") gives way to
 * its subject and the whole text. The world snapshot's lore and this block
 * write it the same way.
 *
 * @param {string} title
 * @param {string} text
 * @returns {string}
 */
export function loreLine(title, text) {
  const t = String(title ?? '').trim();
  const x = String(text ?? '').trim();
  if (!x) return `- ${t || 'Lore'}`;
  if (!t) return `- Lore: ${x}`;
  const low = (s) => s.toLowerCase().replace(/\s+/g, ' ');
  if (low(t) === low(x) || low(t).endsWith(`: ${low(x)}`)) return `- ${t}`;
  const cut = /^(.+?):\s+(.+?)\s*(?:…|\.\.\.)$/.exec(t);
  if (cut && low(x).startsWith(low(cut[2]))) return `- ${cut[1]}: ${x}`;
  return `- ${t}: ${x}`;
}

/**
 * [4h] The table's campaign and tension clocks (`campaignState.clocks`,
 * src/clocks/clocks.js). Active clocks, at most eight; a full one is marked
 * TRIGGERED. The narrator is told to let them show as pressure in the
 * fiction, never as numbers. '' when there are none.
 *
 * @param {Array<{ name: string, type: string, segments: number, filled: number, active?: boolean }>} clocks
 * @returns {string}
 */
function formatClocksBlock(clocks) {
  const list = (Array.isArray(clocks) ? clocks : [])
    .filter(c => c?.active !== false && typeof c?.name === 'string' && c.name.trim())
    .slice(0, 8);
  if (!list.length) return '';
  const lines = list.map(c => {
    const segments = Number(c.segments) || 0;
    const filled   = Math.min(Number(c.filled) || 0, segments);
    const kind     = c.type === 'campaign' ? 'Campaign' : 'Tension';
    return `- ${kind}: ${c.name.trim()} — ${filled}/${segments}${segments && filled >= segments ? ' (TRIGGERED)' : ''}`;
  });
  return (
    `## CLOCKS\n\n` +
    `The threats and projects the table is tracking. Let an advancing clock show ` +
    `in the fiction as pressure, and treat a triggered one as having happened — ` +
    `never mention the clock or its count.\n\n` +
    lines.join('\n')
  );
}

/**
 * [4i] The quest and connection the table chose to focus on at the last End
 * a Session, carried for this session (`campaignState.sessionFocus`, written
 * at Begin a Session). '' when none was chosen.
 *
 * @param {{ quest?: string, connection?: string }|null} focus
 * @returns {string}
 */
function formatSessionFocusBlock(focus) {
  const quest      = typeof focus?.quest === 'string' ? focus.quest.trim() : '';
  const connection = typeof focus?.connection === 'string' ? focus.connection.trim() : '';
  if (!quest && !connection) return '';
  const lines = [];
  if (quest)      lines.push(`- Quest: ${quest}`);
  if (connection) lines.push(`- Connection: ${connection}`);
  return (
    `## THE TABLE'S FOCUS THIS SESSION\n\n` +
    `At the end of the last session the table chose these threads to focus on. ` +
    `Give them room when the fiction allows; never force them.\n\n` +
    lines.join('\n')
  );
}

/**
 * The modes the scene's vow line speaks to (issue #353 R3): the beats of play
 * — a move, a line of free narration, a Batch Mode round, a question about
 * the scene, an oracle's follow-up. Not a vignette, the vow-swearing scene or
 * the inciting incident (each has its own subject), a clock's beat or the
 * recap.
 */
const SCENE_VOW_MODES = new Set(['move_resolution', 'round_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup']);

/** A linked track's kind, as the vow line names it. */
const SCENE_VOW_TRACK_NAMES = Object.freeze({ combat: 'fight', expedition: 'expedition', scene_challenge: 'scene challenge' });

/** "A", "A and B", "A, B and C". */
function joinNames(names) {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Why the vow is this scene's, as the vow line says it. */
function sceneVowReason(sceneVow) {
  if (sceneVow?.source === 'track') {
    const kind  = SCENE_VOW_TRACK_NAMES[sceneVow.track?.type] ?? 'track';
    const label = typeof sceneVow.track?.label === 'string' ? sceneVow.track.label.trim() : '';
    return label ? `the open ${kind} "${label}" serves it` : `an open ${kind} serves it`;
  }
  if (sceneVow?.source === 'focus') return `the table chose it as this session's quest focus`;
  if (sceneVow?.source === 'only') return `the only vow in play`;
  return '';
}

/**
 * [2.6] THE VOW THIS SCENE SERVES (issue #353 R3): one line at the top of the
 * per-beat context — the vow the scene serves (buildNarratorExtras →
 * extras.sceneVow, session/openThreads.js selectSceneVow), its rank and
 * progress, who swore it and why it is this scene's — and one instruction:
 * when a beat achieves something toward it, show that in the fiction. The
 * player marks the progress (the move card's ⚑ Mark Progress on Vow), so the
 * narrator never names a milestone. '' with no vow.
 *
 * @param {{ vow: { name: string, rank?: string, progress?: number, holders?: string[] },
 *   source: "track"|"focus"|"only", track?: { type: string, label: string } }|null} sceneVow
 * @returns {string}
 */
export function formatSceneVowBlock(sceneVow) {
  const vow  = sceneVow?.vow;
  const name = typeof vow?.name === 'string' ? vow.name.trim() : '';
  if (!name) return '';
  const bits = [];
  if (typeof vow.rank === 'string' && vow.rank.trim()) bits.push(vow.rank.trim());
  if (Number.isFinite(Number(vow.progress)) && vow.progress !== null) {
    bits.push(`progress ${Math.max(0, Math.min(10, Math.floor(Number(vow.progress))))}/10`);
  }
  const holders = (Array.isArray(vow.holders) ? vow.holders : []).filter(h => typeof h === 'string' && h.trim()).map(h => h.trim());
  if (holders.length) bits.push(`sworn by ${joinNames(holders)}`);
  const why = sceneVowReason(sceneVow);
  return (
    `## THE VOW THIS SCENE SERVES\n\n` +
    `"${name}"${bits.length ? ` (${bits.join(', ')})` : ''}${why ? ` — ${why}` : ''}.\n\n` +
    `When a beat achieves something toward this vow, show that in the fiction. Never mention the vow's ` +
    `track, its progress or a milestone: marking it is the player's.`
  );
}

/** Track types the Progress Tracks panel lists, as the [4j] block names them. */
const PROGRESS_TRACK_LABELS = {
  combat:          'Fight',
  expedition:      'Expedition',
  scene_challenge: 'Scene challenge',
};

/**
 * [4j] The table's open fights, expeditions and scene challenges, from the
 * Progress Tracks journal (`listOpenProgressTracks`, src/ui/progressTracks.js):
 * rank and filled boxes, and for a fight its objective, position and the vow
 * it serves (#241 P1 — that block lived in the retired context assembler and
 * no narration saw it, TRACKS-UNPORTED). At most six. '' when none is open.
 *
 * A fight's characters' own positions (`characterPositions`, named by
 * listOpenProgressTracks) are listed each by name; without them, the fight's
 * last-set position (issue #322 V03 — position is per character).
 *
 * @param {Array<{ type: string, label: string, rank?: string, ticks?: number, objective?: string|null,
 *   combatState?: string|null, characterPositions?: Array<{ name: string, position: string }>,
 *   linkedVowName?: string|null }>} tracks
 * @returns {string}
 */
function formatProgressTracksBlock(tracks) {
  const list = (Array.isArray(tracks) ? tracks : [])
    .filter(t => PROGRESS_TRACK_LABELS[t?.type] && typeof t?.label === 'string' && t.label.trim() && !t.completed)
    .slice(0, 6);
  if (!list.length) return '';
  const lines = list.map(t => {
    const boxes = Math.max(0, Math.min(10, Math.floor((Number(t.ticks) || 0) / 4)));
    const bits  = [[t.rank, `${boxes}/10 progress`].filter(Boolean).join(', ')];
    if (typeof t.objective === 'string' && t.objective.trim()) bits.push(`objective: ${t.objective.trim()}`);
    const positionText = { in_control: 'in control', bad_spot: 'in a bad spot' };
    const own = (Array.isArray(t.characterPositions) ? t.characterPositions : [])
      .filter(e => typeof e?.name === 'string' && e.name.trim() && positionText[e.position]);
    if (own.length) bits.push(`positions: ${own.map(e => `${e.name.trim()} ${positionText[e.position]}`).join(', ')}`);
    else if (positionText[t.combatState]) bits.push(`position: ${positionText[t.combatState]}`);
    if (typeof t.linkedVowName === 'string' && t.linkedVowName.trim()) {
      // An expedition or a scene challenge can serve a vow too (issue #353 R3).
      bits.push(t.type === 'combat'
        ? `serves the vow "${t.linkedVowName.trim()}" — winning it is a milestone on that vow`
        : `serves the vow "${t.linkedVowName.trim()}" — seeing it through is a step toward that vow`);
    }
    return `- ${PROGRESS_TRACK_LABELS[t.type]}: ${t.label.trim()} — ${bits.join('; ')}`;
  });
  return (
    `## OPEN PROGRESS TRACKS\n\n` +
    `The fights, expeditions and challenges under way. Keep the fiction true to ` +
    `each one's objective and position; never mention the track or its count.\n\n` +
    lines.join('\n')
  );
}

/**
 * Format the WORLD LORE block ([4g]) from the persisted `!lore` recap
 * (`campaignState.loreRecap` — LORERECAP-INJECT-ORPHANED fix, 2026-07). The
 * retired assembler's buildLoreRecapSection was this field's only injector;
 * the block now renders through the live seam. Clipped to ~400 chars, the
 * assembler's original bound. Returns '' when empty. Exported for unit
 * testing.
 */
export function formatWorldLoreRecapBlock(recap) {
  const text = String(recap ?? '').trim();
  if (!text) return '';
  const clipped = text.length > 400 ? `${text.slice(0, 397)}…` : text;
  return `## WORLD LORE\n\n${clipped}`;
}

// ---------------------------------------------------------------------------
// User message builders
// ---------------------------------------------------------------------------

/**
 * Build the user message for the campaign recap generation call — the
 * session record's source (record/recapView.js recapSource: THE RECORD, WHERE
 * THINGS STAND, the players' own notes, the sessions from before the record),
 * then what a recap covers and the cited reply it is asked for. Passed to
 * Claude (Sonnet) for a 3–5 paragraph campaign recap.
 *
 * @param {{ text: string }} source
 * @returns {string}
 */
export function buildCampaignRecapUserMessage(source) {
  return [
    String(source?.text ?? ''),
    `Write a campaign recap of 3–5 paragraphs covering:\n` +
    `- How the campaign began and what the inciting situation was\n` +
    `- The key relationships that have developed\n` +
    `- The vows sworn and their current status\n` +
    `- The most significant revelations\n` +
    `- Where things stand now\n\n` +
    // RECAP-STATES-WHAT-DID-NOT-HAPPEN: the last thing it reads is what it may say.
    `Each of these only as far as the lines above state it — and, for where things stand, ` +
    `${STANDS_NOW_HEADING}. Nothing inferred, nothing filled in between two lines, and no "your" for ` +
    `what a line does not make certainly the character's own. A point the lines say nothing of is ` +
    `left out. Every beat marked LASTING is told. Tell what came of each line — never its outcome's ` +
    `word or a number from a sheet.\n\n` +
    `Write in second person for solo campaigns, third person for multiplayer. ` +
    `Be wry but respectful of what the player has accomplished.\n\n` +
    `Reply with JSON only: {"paragraphs": [[{"text": "<one sentence>", "because": ["<id>", …]}, …], …]} — ` +
    `the recap's paragraphs in order, each a list of its sentences, and with each sentence the ids ` +
    `(the bracketed [s3-2], [now-1], [note-1], [old-1] above) of every line it rests on. A sentence ` +
    `that rests on no line given above is left out of the recap.`,
  ].filter(Boolean).join('\n\n');
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
    // One pass, shared (CHARACTER-STATE-ENTITY-UNDECODED): "&amp;lt;" stays
    // "&lt;" — decoding &amp; first made it "<".
    .replace(/&[#a-z0-9]+;/gi, (e) => decodeHtmlEntities(e))
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
 * The answer is the fact and nothing else (known-issues
 * SCENE-ANSWER-NOT-A-CAMERA): this message asked for "N–N+1 sentences of
 * atmospheric description" beside a role that said "do not invent", and the
 * description is where each answer invented. The Scene Response Length setting
 * is now the most sentences an answer runs to.
 *
 * @param {string} question        — player's question (stripped of @scene prefix)
 * @param {string} recentContext   — recent narration cards joined as text (may be empty)
 * @param {number} sentenceTarget  — the most sentences the answer may run to (Scene Response Length)
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

  const most  = Math.min(4, Math.max(1, Math.floor(Number(sentenceTarget)) || 2));
  const limit = most === 1
    ? 'one plain sentence'
    : `at most ${['', 'one', 'two', 'three', 'four'][most]} plain sentences — one, if one answers it`;
  parts.push(
    `Answer this question in ${limit}: the fact asked for and nothing else, in your own ` +
    `voice. No description, no scenery, nothing new, and nothing happens. If this prompt does ` +
    `not hold the answer, say that the story has not established it.` +
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
 * What the narration must tell and must not (overhaul 4, slice 1) is one
 * block, last before the instruction (moves/contracts/obligations.js): the
 * offered move NOT YET made, no sheet changing, no apparatus — and, when the
 * line's move could not be made (`refusal`, the gate's), its premise NOT SO,
 * so a Heal refused at full health is not narrated as a wound dressed
 * (NOTHING-TO-RECOVER-UNTOLD).
 *
 * @param {string} playerText      — raw player narration
 * @param {string} recentContext   — recent narration cards joined as text (may be empty)
 * @param {number} sentenceTarget  — the Length setting: a word budget (proseVariety.js lengthBudget)
 * @param {string|null} suggestedMove
 * @param {string|null} [speakerName]
 * @param {{ audio?: boolean, refusal?: Object|null }} [opts] — `audio`: the narration is read aloud (shorter
 *   sentences); `refusal`: the move the line was read as could not be made (contracts/gate.js refusalOf)
 * @returns {string}
 */
export function buildPacedNarrativeUserMessage(playerText, recentContext, sentenceTarget, suggestedMove, speakerName = null, opts = {}) {
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

  // What the narration must tell and must not, last before the instruction:
  // the offer not yet made, the sheet unchanged, no apparatus — a refused
  // move's premise told as not so, and what the sheet says of a person or a
  // fight the line touches (overhaul 4).
  const block = formatObligationsBlock(Array.isArray(opts?.obligations) ? opts.obligations : obligationsFor({
    mode: 'paced', offer: suggestedMove ?? null, refusal: opts?.refusal ?? null,
    situation: opts?.situation ?? null, line: playerText ?? '', cast: opts?.cast ?? [], chosenSince: opts?.chosenSince ?? [],
  }));
  if (block) parts.push(block);

  const target = Math.max(1, Number(sentenceTarget) || 3);
  // Issue #348 PT01: "continuing the scene, not advancing it" held the story
  // still — "not yet", "twenty minutes out", an arrival pushed back on every
  // ask. What a move decides stays undecided; the rest may move.
  // Issue #354 P2-20: "in N sentences" was met with N long ones — the length
  // is a word budget, in short sentences.
  const lengthOpts = { audio: opts?.audio === true };
  parts.push(
    `Continue the fiction from this input in ${lengthPhrase(target, lengthOpts)}` +
    `${suggestedMove ? ' (the closing move hint, if you include it, is not counted)' : ''}. ` +
    `${sentenceRule(target, lengthOpts)} ` +
    `No move was rolled — stay in narration. Do not announce mechanics. Do not decide ` +
    `what a move would decide: no risky action succeeds or fails, no fight is won, no ` +
    `danger is escaped. Keep to the block above: what it says is not yet decided stays undecided, and what it says is not so is never told as so. ` +
    `Within that, let the scene move: small developments, and the ` +
    `time the player's line implies passing, are yours to narrate. When the player skips ` +
    `time ("wake me when we get there", "we wait for nightfall"), cut to the next moment ` +
    `that needs them, not to the middle of the wait.`
  );

  return parts.join('\n\n');
}

/**
 * Build the user message for a single narration call.
 * This is the uncached portion — it changes every call.
 *
 * @param {Object} resolution       — MoveResolutionSchema
 * @param {string} playerNarration  — raw player input
 * @param {number} sentenceTarget   — the Length setting: a word budget (proseVariety.js lengthBudget)
 * @param {string|null} [speakerName]
 * @param {string} [recentContext]  — the last few ring entries (may be empty)
 * @param {{ audio?: boolean, toldBefore?: boolean, madeLine?: boolean }} [opts] — `audio`: the narration is read
 *   aloud (shorter sentences); `toldBefore`: the line was narrated before the roll — an offer's Roll (issue #388
 *   #14); `madeLine`: the line is a card's words for a move pressed on it, not the player's (issue #388 #10)
 * @returns {string}
 */
export function buildNarratorUserMessage(resolution, playerNarration, sentenceTarget, speakerName = null, recentContext = '', opts = {}) {
  const parts = [];

  // What just happened (issue #286 B1): a move used to be narrated with no
  // earlier prose at all until the rolling summary appeared, 30 cards in.
  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) {
    parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);
  }

  const moveOutcome = resolution?.loremasterContext ?? '';
  if (moveOutcome) {
    parts.push(`## MOVE OUTCOME\n\n${moveOutcome}`);
  }

  const speaker = typeof speakerName === 'string' && speakerName.trim()
    ? speakerName.trim()
    : null;
  const cleanedPlayerNarration = sanitizePlayerText(playerNarration);
  if (cleanedPlayerNarration && opts?.madeLine === true) {
    // A move pressed on a card or a panel (issue #388 #10): its line is the
    // card's words for the move, never the character's — [unsaid] says so.
    parts.push(
      `## THE MOVE — made from a button or the map; the player wrote no line\n\n` +
      `Its words on the table: "${cleanedPlayerNarration}"`,
    );
  } else if (cleanedPlayerNarration) {
    parts.push(
      `## PLAYER NARRATION${speaker ? ` — spoken by ${speaker}` : ''}\n\n` +
      `${speaker ? `${speaker}: ` : ''}"${cleanedPlayerNarration}"` +
      // A move rolled from its offer (issue #388 #14, BEAT-TOLD-TWICE): the
      // line was narrated before the roll, and each offered Develop of the
      // fifth live long haul told its line twice — the pen given three times.
      (opts?.toldBefore === true
        ? `\n\nThis line was narrated before the move was made: that narration is in RECENT SCENE, above. ` +
          `It is told. Go on from where it ends — tell what the move decides, and do not tell the line, ` +
          `or anything that narration already told, again.`
        : ''),
    );
  }

  // What the narration must tell and must not — one block, last before the
  // instruction (overhaul 4, moves/contracts/obligations.js): what the result
  // is ([outcome]); the stakes the player saw and which of them it delivers
  // ([stakes], issue #353 R1); a miss's price still the player's choice, or
  // declined for what replaces it ([price], EXPLORE-WAYPOINT-MATCH-MISS-
  // ADVISORY — narrator.js settles it); a cost still the player's to choose
  // ([cost], COST-NARRATED-BEFORE-IT-IS-CHOSEN) or chosen before this
  // narration ([chosen]); an Enter the Fray's fight not begun ([fight],
  // FIGHT-NARRATED-BEFORE-IT-IS-BEGUN) — narrator.js reads the table's cards
  // (unansweredCardsFor); a vow fulfilled says what it asked for ([vow],
  // VOW-FULFILLED-WITH-NOBODY-NAMED); a match's twist ([match]); a
  // recommit the player's ([recommit]); a soft refusal rolled at the GM's
  // word ([overridden]); what the sheet says of a person or a fight the
  // beat touches ([state], TRACK-TOLD-AS-A-BOND); the sheet and the
  // apparatus. The STAKES, PRICE, FIGHT, COST and VOW blocks it replaces
  // kept their words in it.
  const obligations = formatObligationsBlock(Array.isArray(opts?.obligations) ? opts.obligations : obligationsFor({
    mode: 'move', resolution, situation: opts?.situation ?? null, line: playerNarration ?? '',
    cast: opts?.cast ?? [], speaker, chosenSince: opts?.chosenSince ?? [], madeLine: opts?.madeLine === true,
  }));
  if (obligations) parts.push(obligations);

  // Issue #354 P2-20: a word budget, in short sentences — not a sentence count.
  const lengthOpts = { audio: opts?.audio === true };
  parts.push(
    `Narrate the consequence in ${lengthPhrase(sentenceTarget, lengthOpts)}. ` +
    `${sentenceRule(sentenceTarget, lengthOpts)} ` +
    `Stay in the fiction. Do not explain the mechanical outcome — embody it.` +
    (obligations ? ` Keep to the block above: what it says is not yet decided stays undecided, and what it says is not so is never told as so.` : '') +
    (speaker ? ` The character who made this move is ${speaker}.` : ''),
  );

  return parts.join('\n\n');
}

/** A round's narration grows this many sentences for each acting entry past the first. */
export const ROUND_EXTRA_SENTENCES_PER_ENTRY = 2;
/** …up to this many times the Length setting. */
export const ROUND_SENTENCE_CAP_FACTOR = 3;
/** Its max tokens scale with the acting entries, up to this many. */
export const ROUND_TOKEN_ENTRY_CAP = 3;

/**
 * The sentences a round's narration is asked for (issue #340): the Length
 * setting, plus ROUND_EXTRA_SENTENCES_PER_ENTRY for each further acting
 * entry, capped at ROUND_SENTENCE_CAP_FACTOR × the setting.
 *
 * @param {number} narrationLength — the Length setting
 * @param {number} actingCount
 * @returns {number}
 */
export function roundSentenceTarget(narrationLength, actingCount) {
  const base = Math.max(1, Number(narrationLength) || 3);
  const extra = Math.max(0, (Number(actingCount) || 1) - 1) * ROUND_EXTRA_SENTENCES_PER_ENTRY;
  return Math.min(base + extra, base * ROUND_SENTENCE_CAP_FACTOR);
}

/**
 * The max tokens a round's narration may use, before the sidecar's headroom:
 * the narration setting × the acting entries, up to ROUND_TOKEN_ENTRY_CAP.
 *
 * @param {number} narrationMaxTokens
 * @param {number} actingCount
 * @returns {number}
 */
export function roundMaxTokens(narrationMaxTokens, actingCount) {
  const base = Math.max(1, Number(narrationMaxTokens) || 1000);
  return base * Math.min(Math.max(1, Number(actingCount) || 1), ROUND_TOKEN_ENTRY_CAP);
}

/** What each class lets the narrator do with an entry, in one line. */
const ROUND_LATITUDE_LINES = Object.freeze({
  discovery:     'Latitude: something new may enter the fiction.',
  interaction:   'Latitude: deepen what is established.',
  embellishment: 'Latitude: embellish only.',
});

/**
 * The user message for a Batch Mode round's narration (issue #340): the
 * recent scene, then THIS ROUND — every acting entry in order: who acted,
 * the move and stat, its outcome (and the price it paid), the line the player
 * wrote, the latitude its move allows — then the instruction to narrate the
 * round as one scene. Only the characters listed act: no one who sat the
 * round out is named, and the instruction forbids acting for, or remarking
 * on, anyone else. Player lines are sanitised (sanitizePlayerText): one line
 * each, inside its quotes.
 *
 * @param {Object} args
 * @param {string} [args.recentContext] — the last ring entries
 * @param {Array<{ actorName: string, text: string, input: Object }>} args.entries — in order;
 *   `input` is the entry's narration input: { kind: "move"|"narrative"|"refused", moveName,
 *   statUsed, outcomeLabel, outcome, loremasterContext, oracleSeeds, relevance, reason }
 * @param {number} args.sentenceTarget — roundSentenceTarget: a word budget (proseVariety.js lengthBudget)
 * @param {boolean} [args.audio] — the narration is read aloud (shorter sentences)
 * @returns {string}
 */
export function buildRoundUserMessage({ recentContext = '', entries = [], sentenceTarget = 3, audio = false,
  sceneObligations = [], chosenSince = [], roundLines = {} }) {
  const parts = [];
  const cleanedRecent = stripHtml(recentContext).trim();
  if (cleanedRecent) parts.push(`## RECENT SCENE\n\n${cleanedRecent}`);

  const acting = entries.filter(e => e && typeof e.actorName === 'string' && e.actorName.trim());
  const n = acting.length;
  const blocks = acting.map((e, i) => {
    const name = e.actorName.trim();
    const input = e.input ?? {};
    const lines = [];
    if (input.kind === 'move') {
      const stat = input.statUsed ? ` (+${input.statUsed})` : '';
      const outcome = String(input.outcomeLabel ?? input.outcome ?? '').replace(/_/g, ' ').trim().toLowerCase();
      lines.push(`### ${i + 1}. ${name} — ${input.moveName ?? 'A move'}${stat}${outcome ? `: ${outcome}` : ''}`);
      if (input.loremasterContext) lines.push(String(input.loremasterContext).trim());
      const seeds = formatOracleSeedsBlock(input.oracleSeeds);
      if (seeds) lines.push(seeds.replace(/^## /gm, '#### '));
      // What this entry's result obliges its telling to — the move's own
      // block, under the entry (overhaul 4: the STAKES, PRICE, FIGHT, COST,
      // VOW and match lines it replaces kept their words in it).
      const block = formatObligationsBlock(obligationsFor({ mode: 'round-entry', resolution: input, speaker: name }), { heading: '####' });
      if (block) lines.push(block);
    } else if (input.kind === 'refused') {
      lines.push(`### ${i + 1}. ${name} — ${input.moveName ?? 'A move'}: not rolled`);
      lines.push(`${input.reason ?? 'It could not be rolled.'} Narrate this as an action with no roll: no success or failure is decided for it.`);
    } else {
      lines.push(`### ${i + 1}. ${name} — no roll`);
    }
    // A move it could not make (the move gate, overhaul 4): its premise is
    // not so — the round tells it as the paced narration does.
    if (input.kind !== 'move' && input.refusal?.premise) {
      const block = formatObligationsBlock(obligationsFor({ mode: 'round-entry', refusal: input.refusal }), { heading: '####' });
      if (block) lines.push(block);
    }
    const said = sanitizePlayerText(e.text ?? '');
    if (said) lines.push(`${name}: "${said}"`);
    if (input.kind === 'move') {
      const latitude = ROUND_LATITUDE_LINES[input.relevance?.resolvedClass] ?? ROUND_LATITUDE_LINES.embellishment;
      lines.push(latitude);
    }
    return lines.join('\n');
  });
  parts.push(
    `## THIS ROUND — ${n} character${n !== 1 ? 's' : ''} acted at once, in this order\n\n` +
    blocks.join('\n\n'),
  );

  // The round's own obligations — the sheet, the apparatus (overhaul 4) — and
  // what the scene obliges its narration to tell: TELL [scene], NOT SO
  // [letgo] (overhaul 2 §10.3). One block for the round.
  // The round's own lines, a move's beat-of-play lines among them (narrator.js
  // roundLinesOf; issue #399's audit N28) — the same list its check holds it to.
  const roundBlock = formatObligationsBlock([...obligationsFor({ mode: 'round', chosenSince, ...roundLines }), ...sceneLines(sceneObligations)]);
  if (roundBlock) parts.push(roundBlock);

  const target = Math.max(1, Number(sentenceTarget) || 3);
  const lengthOpts = { audio: audio === true };
  parts.push(
    `Narrate the round as one scene in ${lengthPhrase(target, lengthOpts)}. ` +
    `${sentenceRule(target, lengthOpts)} Narrate each action ` +
    `and its outcome in the order given, and attribute each to its own character only — let ` +
    `the actions meet where the fiction allows. Do not explain a mechanical outcome — embody it. ` +
    `An action with no roll happens as described, with no success or failure decided. Only the ` +
    `characters listed above act this round: invent no action for anyone else, and do not ` +
    `remark on who did not act. Close on a beat the whole party can answer, not a question ` +
    `to one character.`,
  );
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Section builders (pure — no async, no Foundry API)
// ---------------------------------------------------------------------------

/**
 * Render the multiplayer party roster (section [8b]). Returns '' unless
 * the party carries two or more PCs — solo play needs no disambiguation.
 * Prefers `party.members` ({name, pronouns, callsign} — CHAR-PARTY-NAMES-ONLY
 * fix) and falls back to the legacy names-only shape. Exported for unit
 * testing.
 *
 * @param {{ names?: string[], members?: Array<{name:string,pronouns?:string,callsign?:string}>,
 *           speaking?: string|null }|null} party
 * @returns {string}
 */
export function buildPartyBlock(party) {
  const members = Array.isArray(party?.members) && party.members.length
    ? party.members
        .filter(m => m && typeof m.name === 'string' && m.name.trim())
        .map(m => ({
          name:     m.name.trim(),
          pronouns: typeof m.pronouns === 'string' ? m.pronouns.trim() : '',
          callsign: typeof m.callsign === 'string' ? m.callsign.trim() : '',
        }))
    : (Array.isArray(party?.names) ? party.names : [])
        .filter(n => typeof n === 'string' && n.trim())
        .map(n => ({ name: n.trim(), pronouns: '', callsign: '' }));
  if (members.length < 2) return '';

  const speaking = typeof party?.speaking === 'string' && party.speaking.trim()
    ? party.speaking.trim()
    : null;
  // A Batch Mode round names who acts in it (issue #340) — and no one else.
  const acting = new Set(Array.isArray(party?.acting) ? party.acting.filter(n => typeof n === 'string').map(n => n.trim()) : []);
  const roster = members
    .map(m => {
      const idBits = [];
      if (m.callsign) idBits.push(`"${m.callsign}"`);
      if (m.pronouns) idBits.push(m.pronouns);
      const id = idBits.length ? ` (${idBits.join(', ')})` : '';
      const mark = acting.size
        ? (acting.has(m.name) ? ' (acting this round)' : '')
        : (speaking && m.name === speaking ? ' (speaking this turn)' : '');
      return `${m.name}${id}${mark}`;
    })
    .join(', ');

  const anyPronouns = members.some(m => m.pronouns);
  return [
    '## PARTY',
    '',
    `This is a multiplayer campaign. Player characters: ${roster}.`,
    ...(acting.size ? [
      'This round, only the characters marked acting this round act — each',
      'action belongs to its own character. Invent no action for anyone else,',
      'and never merge the player characters into a single "you".',
    ] : [
      'Each chat input belongs to exactly one of them — attribute actions and',
      'dialogue to the named speaker only, and never merge the player',
      'characters into a single "you". Other PCs are present in the scene',
      'only when the fiction or the scene frame says so.',
    ]),
    ...(anyPronouns ? [
      'The pronouns above are each character\'s recorded pronouns — use them',
      'exactly; never infer gender from a name.',
    ] : []),
  ].join('\n');
}

/**
 * WORLD TRUTHS block — one line per established truth. A truth whose option
 * carries a sub-table (the Cataclysm war's foe, why AI is outlawed) keeps its
 * rolled detail after the title, with the table's label, as the World Truths
 * journal prints it: without it the narrator knew there was a war but not
 * who it was against, and was free to invent a foe (issue #321 U66).
 */
function buildWorldTruthsBlock(campaignState) {
  const truths  = campaignState?.worldTruths ?? {};
  const entries = Object.entries(truths)
    .map(([key, v]) => {
      const text = v.title ?? v.result;
      if (!text) return null;
      const sub = typeof v.subResult === 'string' ? v.subResult.trim() : '';
      return `${toLabel(key)}: ${text}${sub ? ` ${v.subTableLabel ?? 'Detail:'} ${sub}` : ''}`;
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
  const crisis = ii.immediateCrisis;
  if (crisis?.label) {
    lines.push(`Immediate crisis (separate from the vow, a first scene to tackle now): ${crisis.label}${crisis.segments ? ` (${crisis.segments}-segment tension clock)` : ''}`);
  }

  return lines.join('\n');
}

function buildCharacterBlock(character, pinnedEntries = []) {
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

  // GM/narrator-facing notes. (The `loremasterNotes` fallback is retired —
  // nothing ever wrote it on any record — issue #362 AC81.)
  const narratorNotes = character.narratorNotes ?? '';
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

  // Vows — spotlight the background (founding) vow, then active others —
  // with their progress and any countdown clock (issue #286 C5: the narrator
  // could not tell a vow nearly fulfilled from one just sworn).
  const vows = Array.isArray(character.vows) ? character.vows : [];
  if (vows.length) {
    const bg     = vows.find(v => v.isBackground);
    const others = vows.filter(v => !v.isBackground && !v.completed);
    if (bg)            lines.push(`Background vow: ${bg.name} (${formatTrackDetail(bg)})`);
    if (others.length) lines.push(`Other vows: ${others.map(v => `${v.name} (${formatTrackDetail(v)})`).join('; ')}`);
  }

  // Connections (bonds) the character holds — a severed one apart, as the
  // sector roster lists it (issue #330 D10; W37).
  const connections = Array.isArray(character.connections) ? character.connections : [];
  const held = connections.filter(c => c?.lost !== true);
  const lost = connections.filter(c => c?.lost === true);
  // A bond Item marked complete is a forged bond (setBondItemForged — the
  // vendor sheet's own reading), not a fulfilled quest (issue #342 Z57).
  // The words are the situation's (moves/situation.js connectionStanding) —
  // one wording for the readers, the narrator and the recap: a full track is
  // "full, no bond forged yet", never a bond (TRACK-TOLD-AS-A-BOND, overhaul 4).
  if (held.length) {
    lines.push(`Connections: ${held.map(c => `${c.name} (${[c.rank, connectionStanding(c)].filter(Boolean).join(', ')})`).join('; ')}`);
  }
  if (lost.length) {
    lines.push(`Connections lost — no longer a connection: ${lost.map(c => c.name).join('; ')}`);
  }

  // Rewards the character was granted — gear, contacts, knowledge (#241;
  // recordGrantedReward). Recorded on the sheet, never shown to the narrator
  // until issue #286 C5. The most recent eight.
  const rewards = Array.isArray(character.grantedRewards) ? character.grantedRewards : [];
  if (rewards.length) {
    lines.push(`Rewards received: ${rewards.slice(-8).map(r => `${r.description} (${r.form ?? 'gear'})`).join('; ')}`);
  }

  // The moments the player pinned in the character's Chronicle — the newest
  // few, read by buildNarratorExtras. The panel's pin promised "pinned
  // entries always appear in the narrator's context" and reached no prompt
  // (issue #345 AA07).
  const pinned = (Array.isArray(pinnedEntries) ? pinnedEntries : []).filter(t => typeof t === 'string' && t.trim());
  if (pinned.length) {
    lines.push('Pinned in their Chronicle (moments the player wants kept in mind):');
    for (const text of pinned) lines.push(`  - ${text.trim()}`);
  }

  return lines.join('\n');
}

/**
 * A vow's or bond's rank, progress boxes, countdown clock and completion, for
 * the CHARACTER block — `done` names what a completed track is: a vow
 * "fulfilled", a bond "bonded".
 */
function formatTrackDetail(track, done = 'fulfilled') {
  const bits = [track.rank];
  if (Number.isFinite(track.progress)) bits.push(`progress ${track.progress}/10`);
  if (Number(track.clock?.max) > 0)    bits.push(`clock ${Number(track.clock.ticks) || 0}/${track.clock.max}`);
  if (track.completed === true)        bits.push(done);
  return bits.filter(Boolean).join(', ');
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

/** A prompt's text in the names the table uses now (nameChanges.js writeNewNames); unchanged with none (issue #389 #2). */
function inTheNamesNow(text, nameChanges) {
  const changes = Array.isArray(nameChanges) ? nameChanges : [];
  if (!text || !changes.length) return text;
  return writeNewNames(text, changes, { otherNames: actorNames() });
}

/**
 * The open expedition the characters are under way on, by its label, or ''
 * (issue #393 D1: with no place recorded, they are between places on it).
 * The first open one — the tracks as the narration was given them.
 *
 * @param {Array<{ type?: string, label?: string, completed?: boolean }>} tracks
 * @returns {string}
 */
export function expeditionUnderway(tracks) {
  const open = (Array.isArray(tracks) ? tracks : []).find(t => t?.type === 'expedition' && t.completed !== true);
  return open ? String(open.label ?? '').trim() : '';
}
