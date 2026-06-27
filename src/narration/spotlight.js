/**
 * STARFORGED COMPANION
 * src/narration/spotlight.js — narrator rotating-spotlight rotation core
 *
 * Issue #232. In multiplayer GM-less play, unstructured input leads to
 * players talking over each other. Rather than enforce a turn order
 * (which would kill conversational flow), the narrator rotates which PC it
 * addresses when a beat ends by inviting action — implying a turn order
 * without gating anyone.
 *
 * This module is PURE — no Foundry globals, no I/O. The caller
 * (buildNarratorExtras in narrator.js) gathers the live PC roster, the
 * scene-frame `present` list, and the stored rotation pointer, then calls
 * selectSpotlight() to pick the next PC and buildSpotlightBlock() to render
 * the system-prompt nudge. Pointer advancement and persistence live in the
 * caller; this module only decides who is next.
 */

/**
 * Narrator modes where the spotlight nudge applies: the live, interactive
 * beats that naturally end by inviting the next action. Reactive/answer
 * modes (scene_interrogation, oracle_followup) and meta/setup modes
 * (campaign_recap, session_vignette, inciting_incident) are excluded — the
 * inciting incident in particular opens on a group address, with rotation
 * kicking in once play is underway (issue #232 open question 3).
 */
export const SPOTLIGHT_MODES = Object.freeze(new Set([
  'move_resolution',
  'paced_narrative',
]));

/**
 * Choose the next PC to draw into the spotlight by round-robin.
 *
 * Candidates are the player characters currently in the scene. When the
 * scene frame names who is present, the roster is narrowed to the PCs in it
 * (absent PCs are skipped); when the frame is empty (e.g. the first beat of
 * a fresh scene) the full roster is used. Rotation only applies when at
 * least two PCs are candidates — a scene with one PC has no turn order to
 * imply, so the function returns null and the narrator addresses normally.
 *
 * Ordering is stable by actor id so the rotation is deterministic across
 * turns and survives a mid-scene rename (which changes name, not id).
 *
 * @param {Object} args
 * @param {Array<{id: string, name: string}>} args.roster — all PCs in the world
 * @param {string[]} [args.presentNames] — scene-frame `present` names (PCs + NPCs)
 * @param {string|null} [args.lastActorId] — actor id addressed on the prior beat
 * @returns {{ nextActorId: string, nextActorName: string,
 *             candidates: Array<{id: string, name: string}> } | null}
 */
export function selectSpotlight({ roster, presentNames = [], lastActorId = null } = {}) {
  const pcs = Array.isArray(roster)
    ? roster.filter(r => r && typeof r.id === 'string' && r.id
        && typeof r.name === 'string' && r.name.trim())
    : [];
  if (pcs.length < 2) return null;

  const present = Array.isArray(presentNames)
    ? presentNames
        .filter(n => typeof n === 'string' && n.trim())
        .map(n => n.trim().toLowerCase())
    : [];

  // Narrow to PCs the scene frame says are present. Only adopt the narrowed
  // set when it still leaves a rotation (>= 2); otherwise the frame is empty,
  // lagging, or centred on a single PC — fall back to the full roster.
  let candidates = pcs;
  if (present.length) {
    const inScene = pcs.filter(pc => present.includes(pc.name.trim().toLowerCase()));
    if (inScene.length >= 2) candidates = inScene;
    else return null; // 0–1 PCs in scene → no turn order to imply this beat.
  }

  // Stable order by id so the pointer means the same thing every turn.
  const ordered = candidates.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const lastIdx = lastActorId
    ? ordered.findIndex(pc => pc.id === lastActorId)
    : -1;
  const next = ordered[(lastIdx + 1) % ordered.length];

  return { nextActorId: next.id, nextActorName: next.name.trim(), candidates: ordered };
}

/**
 * Render the `## SPOTLIGHT` system-prompt block for a selection.
 *
 * The block is a nudge, not a gate: it asks the narrator to address its
 * closing prompt to the named PC only when the beat invites action and the
 * fiction does not already centre someone else, and states plainly that any
 * player may act at any time.
 *
 * @param {{ nextActorName: string,
 *           candidates: Array<{id: string, name: string}> }|null} selection
 * @returns {string} the block, or '' when selection is null/empty
 */
export function buildSpotlightBlock(selection) {
  const name = selection?.nextActorName;
  if (typeof name !== 'string' || !name.trim()) return '';
  const roster = Array.isArray(selection?.candidates)
    ? selection.candidates.map(c => c?.name).filter(n => typeof n === 'string' && n.trim())
    : [];

  const safeName = name.trim();
  const lines = [
    '## SPOTLIGHT',
    '',
    'This is a multiplayer scene. To keep every player involved, the table',
    `rotates whom the narrator draws in. By the rotation, ${safeName} is next.`,
    '',
    'If this beat ends by inviting the players to act — and the fiction does',
    'not already centre a specific character (someone mid-action, in danger,',
    `or directly spoken to) — address your closing prompt to ${safeName} by`,
    `name, e.g. "${safeName}, what do you do?" or a question that fits their`,
    'place in the scene.',
    '',
    'This is only a nudge to spread the spotlight, never a gate. Any player',
    'may act or speak at any time, prompted or not. If the fiction clearly',
    'centres a different character, follow the fiction and address them',
    'instead.',
  ];
  if (roster.length) {
    lines.push('', `Player characters in the scene: ${roster.join(', ')}.`);
  }
  return lines.join('\n');
}
