/**
 * STARFORGED COMPANION
 * src/factContinuity/sheetClaims.js — the sheet is the only source of meters
 *
 * PRICE-TOLD-WITH-A-COST-NOT-PAID, the seventh live round (2026-11-26): a24's
 * pick "The scan turns up something worse among the ribs, or nothing useful
 * at all" took no meter, and a25's narration told "your supplies thinned
 * working through it". Its fact block filed it — "Kobayashi IV: the scan of
 * the ribs turned up something worse, and the effort cost Mira supply", from
 * the result, so bound as the dice's — and it came back as a [dice] line on
 * later beats and in the recap, a cost the sheet never took.
 *
 * A character's health, spirit, supply and momentum are the sheet's (the
 * character sheet, through actorBridge.js): the narration never records one.
 * A new truth or a state change of the fact block that tells a meter of a
 * player character — said of them, of their ship, or naming them, "you" or
 * "your" — changing is not kept. The rest of the block is. Pure; no Foundry
 * access.
 */

/** A meter of the sheet's, as a narration writes it. */
const METER = /\b(?:supply|supplies|resources|provisions|health|spirit|momentum)\b/i;

/** A meter's change, as a narration writes it. */
const CHANGE = new RegExp(String.raw`\b(?:cost|costs|costing|spent|spend|spends|spending|thinn?ed|thinner|thinning|ran low|run(?:s|ning)? low|low|`
  + String.raw`lost|lose|loses|losing|drop(?:s|ped|ping)?|drain(?:s|ed|ing)?|deplet(?:e|es|ed|ing)|dwindl(?:e|es|ed|ing)|short|gone|`
  + String.raw`used up|use(?:s|d)? up|reduc(?:e|es|ed|ing)|less|fell|fall(?:s|en)?|restor(?:e|es|ed|ing)|refill(?:s|ed|ing)?|`
  + String.raw`replenish(?:es|ed|ing)?|gain(?:s|ed|ing)?|recover(?:s|ed|ing)?|heal(?:s|ed|ing)?|took|toll)\b`, 'i');

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a fact block entry tells a player character's meter changing: a
 * meter and its change in its words, said of one of `owners` (a PC or their
 * ship, by name or by a word of a name of three letters or more) or naming
 * one, "you" or "your".
 *
 * @param {string} subject
 * @param {string} text — the fact, or a state change's attribute and value
 * @param {string[]} owners — the PCs' names and their ships'
 * @returns {boolean}
 */
export function isMeterClaim(subject, text, owners = []) {
  const said = `${clean(subject)} ${clean(text)}`;
  if (!METER.test(said) || !CHANGE.test(said)) return false;
  if (/\b(?:you|your|yours)\b/i.test(said)) return true;
  const words = [...new Set((owners ?? []).flatMap(n => {
    const name = clean(n);
    return name ? [name, ...name.split(' ').filter(w => w.length >= 3)] : [];
  }))];
  return words.some(w => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'iu').test(said));
}

/**
 * The fact block without the entries that tell a player character's meter
 * changing (isMeterClaim). The block as it was when none does, or when it is
 * no block. Never throws.
 *
 * @param {Object|null} sidecar — a normalised fact block (sidecarParser.js normaliseSidecar)
 * @param {{ owners?: string[] }} [opts] — the PCs' names and their ships'
 * @returns {Object|null}
 */
export function withoutMeterClaims(sidecar, { owners = [] } = {}) {
  try {
    if (!sidecar || typeof sidecar !== 'object') return sidecar;
    const truths = Array.isArray(sidecar.newTruths) ? sidecar.newTruths : [];
    const changes = Array.isArray(sidecar.stateChanges) ? sidecar.stateChanges : [];
    const keptTruths = truths.filter(t => !(t && typeof t === 'object' && isMeterClaim(t.subject, t.fact, owners)));
    const keptChanges = changes.filter(c => !(c && typeof c === 'object' && isMeterClaim(c.subject, `${clean(c.attribute)} ${clean(c.value)}`, owners)));
    if (keptTruths.length === truths.length && keptChanges.length === changes.length) return sidecar;
    console.debug?.(`starforged-companion | factContinuity: ${truths.length - keptTruths.length + changes.length - keptChanges.length} `
      + 'fact block entr(y/ies) told a character\'s meter changing — the sheet is its only source; not kept (PRICE-TOLD-WITH-A-COST-NOT-PAID).');
    return { ...sidecar, newTruths: keptTruths, stateChanges: keptChanges };
  } catch (err) {
    console.warn('starforged-companion | factContinuity: the fact block\'s meter claims were not read — kept as written:', err?.message ?? err);
    return sidecar;
  }
}
