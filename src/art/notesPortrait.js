/**
 * STARFORGED COMPANION
 * src/art/notesPortrait.js — the portrait block at the top of an Actor's Notes.
 *
 * The art pipeline embeds a large copy of a connection's or a ship's portrait
 * at the top of its Notes, wrapped in a marker div (withPortraitInNotes,
 * art/generator.js) so it can be replaced on regeneration without duplicating.
 * A re-seed (↻ Regenerate flavour) keeps it, as it keeps everything on the tab
 * but the seed's own introduction (entities/seedIntro.js — issue #322 V30, the
 * existing portrait is not attached again; issue #338 D4).
 */

/** The marker-wrapped portrait block. */
export const PORTRAIT_BLOCK_RE = /<div class="sf-ship-portrait"[\s\S]*?<\/div>/;
