/**
 * STARFORGED COMPANION
 * src/factContinuity/placeClaims.js — a character's place is the frame's
 *
 * RECAP-TOLD-A-PLACE-SHE-HAD-LEFT (issue #397, Code fix 3): two recaps said the
 * character was somewhere she had left — round 7's a77 "aboard the Cinder Wren
 * at her command console", round 8's a93 "at the relay console on the Hollow
 * Spire docks". Each repeated its own input: a fact block's state entry for
 * the player character's location, tagged from her line, which binds. It was
 * replaced only by a later entry for the same subject and attribute, and the
 * beats after it were card presses with no line, so none came, while every
 * narration's frame moved her on. The recap's WHERE THINGS STAND, the
 * narrator's STANDING NOW and the judge all read the stale entry.
 *
 * Where the characters are within their place is the scene frame's
 * `location` alone (rules/narrator-memory.md 6c: no store restates
 * another's). A state change of the fact block is not kept when its subject
 * is a player character (by the whole name, a single word of it, "you", "PC"
 * or "the PC"), its attribute is a place (location, vessel, aboard,
 * whereabouts), and that character is in the scene: the campaign has one
 * player character, or the block's own frame has them present. The rest of
 * the block is kept — another character's place, a player character's other
 * facts, and the place of one who is not in the scene. Matched on the subject
 * only: a value that names her ("Tamsin — location: beside Mira") is
 * Tamsin's. Pure; no Foundry access.
 */

/** The attributes that say where someone is. */
const PLACE_ATTRIBUTES = new Set(['location', 'vessel', 'aboard', 'whereabouts']);

/** The subjects a narration writes for "the player character" without a name. */
const GENERIC_PC = new Set(['you', 'pc', 'the pc']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether `subject` is `name`: the whole name, or a single word of it of three letters or more. */
function isNamed(subject, name) {
  const s = clean(subject);
  const n = clean(name);
  if (!s || !n) return false;
  if (s === n) return true;
  return !s.includes(' ') && s.length >= 3 && n.split(' ').includes(s);
}

/**
 * The fact block without the state changes that say where a player character
 * in the scene is (see the header). The block as it was when none does, or
 * when it is no block. Never throws.
 *
 * @param {Object|null} sidecar — a normalised fact block (sidecarParser.js normaliseSidecar)
 * @param {{ pcs?: string[] }} [opts] — the player characters' names
 * @returns {Object|null}
 */
export function withoutPlaceClaims(sidecar, { pcs = [] } = {}) {
  try {
    if (!sidecar || typeof sidecar !== 'object') return sidecar;
    const changes = Array.isArray(sidecar.stateChanges) ? sidecar.stateChanges : null;
    const names = (Array.isArray(pcs) ? pcs : []).map(n => String(n ?? '').trim()).filter(Boolean);
    if (!changes || !names.length) return sidecar;
    const present = Array.isArray(sidecar.sceneFrame?.present) ? sidecar.sceneFrame.present : [];
    const here = (name) => names.length === 1 || present.some(p => isNamed(p, name) || clean(p).includes(clean(name)));
    const inScene = (subject) => {
      if (GENERIC_PC.has(clean(subject))) return names.some(here);
      const pc = names.find(n => isNamed(subject, n));
      return pc ? here(pc) : false;
    };
    const keptChanges = changes.filter(c => !(c && typeof c === 'object'
      && PLACE_ATTRIBUTES.has(clean(c.attribute)) && typeof c.subject === 'string' && inScene(c.subject)));
    if (keptChanges.length === changes.length) return sidecar;
    console.debug?.(`starforged-companion | factContinuity: ${changes.length - keptChanges.length} fact block state change(s) said where a player `
      + 'character in the scene is — the scene frame\'s location is its only store; not kept (RECAP-TOLD-A-PLACE-SHE-HAD-LEFT).');
    return { ...sidecar, stateChanges: keptChanges };
  } catch (err) {
    console.warn('starforged-companion | factContinuity: the fact block\'s place claims were not read — kept as written:', err?.message ?? err);
    return sidecar;
  }
}
