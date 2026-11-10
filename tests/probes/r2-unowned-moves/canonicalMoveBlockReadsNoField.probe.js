/**
 * PROBE R2U-3 — CANONICAL-MOVE-BLOCK-READS-NO-FIELD (PRODUCED-BUT-DEAD)
 *
 * interpretMove's stat-only reading of a move already chosen (issue #321 U04 —
 * a forced Heal / Face Danger / Battle …) is meant to be grounded in the
 * system's own move text: a `<canonical_move>` block built from the
 * foundry-ironsworn starforged-moves compendium document.
 *
 *   src/moves/interpreter.js:353-357  buildCanonicalMoveBlock reads
 *     doc.system?.description ?? doc.system?.text ?? doc.system?.Text?.text
 *   src/moves/interpreter.js:397-399  interpretMove adds the block only when
 *     expectedMoveSlug is set (enrichForcedMoveStat, statEnrichment.js:361)
 *
 * The system's sfmove data model has none of those: its move text is
 * `system.Text`, an HTMLField — a STRING (vendor/foundry-ironsworn/src/module/
 * item/subtypes/sfmove.ts:98 `Text: new fields.HTMLField()`; every vendored
 * json-packs/starforged-moves/*.json has `system.Text: "<markdown>"`). So
 * `.Text.text` is undefined, the block is "" for every real move, and the
 * grounding never reaches the model. The unit test
 * (tests/unit/canonicalMoveBlock.test.js:30-49) passes only because it hands
 * the function a `system: { description }` shape no sfmove has
 * (rules/reachability.md §3 — a test that hand-sets the field its consumer
 * reads proves nothing about the hop).
 *
 * Scenario:
 *   1. The pacing card offers "Roll Heal"; Kira presses it ("I clean and
 *      stitch the gash on my own arm").
 *   2. The forced Heal's stat is read by interpretMove({ expectedMoveSlug:
 *      "heal" }) — the user message should carry the vendored Heal text
 *      ("Mend your own wounds: Roll +iron or +wits, whichever is lower" …).
 *   Expected: a <canonical_move> block holding the move's text.
 *   Actual: "" — the message carries no canonical block.
 *
 * Control: the same lookup on a document with `system.description` (the shape
 * the unit test uses) builds the block — the lookup itself finds the move.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildCanonicalMoveBlock, interpretMove } from '../../../src/moves/interpreter.js';
import { _clearPackCache, IS_PACKS } from '../../../src/system/ironswornPacks.js';
import { apiPost } from '../../../src/api-proxy.js';

const HEAL_JSON = fileURLToPath(new URL(
  '../../../vendor/foundry-ironsworn/json-packs/starforged-moves/Heal_2051538f0c9d5d27.json', import.meta.url));
const HAVE_VENDOR = fs.existsSync(HEAL_JSON);

/** A compendium as Foundry serves it: a slim index ({ _id, name, type }) and the full document on getDocument. */
function packWith(doc) {
  const index = [{ _id: doc._id, name: doc.name, type: doc.type }];
  index.find = (fn) => Array.prototype.find.call(index, fn);
  index.size = index.length;
  return { index, getDocument: async (id) => (id === doc._id ? doc : null) };
}

describe.skipIf(!HAVE_VENDOR)('R2U-3 CANONICAL-MOVE-BLOCK-READS-NO-FIELD — the system move text never reaches the stat reading', () => {
  let originalPacks;
  beforeEach(() => {
    _clearPackCache();
    originalPacks = global.game.packs;
    vi.clearAllMocks();
  });
  afterEach(() => { global.game.packs = originalPacks; _clearPackCache(); });

  it('the vendored Heal document (system.Text) builds a <canonical_move> block with its text', async () => {
    const heal = JSON.parse(fs.readFileSync(HEAL_JSON, 'utf8'));
    global.game.packs = { get: (id) => (id === IS_PACKS.STARFORGED_MOVES ? packWith(heal) : null) };
    const block = await buildCanonicalMoveBlock('heal');
    expect(block).toContain('<canonical_move>');
    expect(block).toContain('Mend your own wounds');
  });

  it("a forced Heal's stat reading sends the model the move's text", async () => {
    const heal = JSON.parse(fs.readFileSync(HEAL_JSON, 'utf8'));
    global.game.packs = { get: (id) => (id === IS_PACKS.STARFORGED_MOVES ? packWith(heal) : null) };
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({
      moveId: 'heal', statUsed: 'iron', healSituation: 'self', rationale: 'Self-care.', confidence: 'high' }) }] });
    await interpretMove('I clean and stitch the gash on my own arm', {
      campaignState: {}, mischiefLevel: 'balanced', apiKey: 'test-key', expectedMoveSlug: 'heal',
    });
    const userMessage = apiPost.mock.calls[0][2].messages[0].content;
    expect(userMessage).toContain('<canonical_move>');
  });

  it('control: the same lookup on a document with system.description builds the block', async () => {
    const heal = JSON.parse(fs.readFileSync(HEAL_JSON, 'utf8'));
    const shaped = { ...heal, system: { description: heal.system.Text } };
    global.game.packs = { get: (id) => (id === IS_PACKS.STARFORGED_MOVES ? packWith(shaped) : null) };
    const block = await buildCanonicalMoveBlock('heal');
    expect(block).toContain('<canonical_move>');
    expect(block).toContain('Mend your own wounds');
  });
});
