/**
 * STARFORGED COMPANION
 * src/art/notesPortrait.js — the portrait block at the top of an Actor's Notes.
 *
 * The art pipeline embeds a large copy of a connection's or a ship's portrait
 * at the top of its Notes, wrapped in a marker div (withPortraitInNotes,
 * art/generator.js) so it can be replaced on regeneration without duplicating.
 */

/** The marker-wrapped portrait block. */
export const PORTRAIT_BLOCK_RE = /<div class="sf-ship-portrait"[\s\S]*?<\/div>/;

/**
 * Notes rewritten from scratch keep the portrait block the old Notes carried.
 * ↻ Regenerate flavour (finalizeEntity with force) re-seeds a connection's or
 * a ship's Notes, and generatePortrait then returns the record's existing
 * portrait without attaching it again (generate-once), so the embedded copy
 * was gone for good (issue #322 V30). Old Notes with no block, or new Notes
 * that already lead with one, leave the new Notes as they are.
 *
 * @param {string} previousNotes — the Notes being replaced
 * @param {string} nextNotes     — the freshly written Notes
 * @returns {string}
 */
export function keepNotesPortrait(previousNotes, nextNotes) {
  const next  = String(nextNotes ?? "");
  const block = PORTRAIT_BLOCK_RE.exec(String(previousNotes ?? ""))?.[0];
  if (!block || PORTRAIT_BLOCK_RE.test(next)) return next;
  return block + next.trimStart();
}
