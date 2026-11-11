// tests/unit/canonicalMoveBlock.test.js
// Phase 6 — buildCanonicalMoveBlock injects pack text when present.
//
// Issue #345 AA44 (CANONICAL-MOVE-TEXT-UNREAD): the system's move document
// (`sfmove`) keeps its text in `system.Text`, an HTMLField string (vendor
// src/module/item/subtypes/sfmove.ts:98 — every vendored starforged-moves
// document). The block read `system.description ?? system.text ??
// system.Text.text`, so it was "" for every real move, and a forced move's
// stat reading never carried the move's text. This test once built its
// fixture with a `system.description` no move has; it now uses the vendor
// shape, and the vendored Heal document itself (skipped without the
// submodule). The forced reading through a booted table is
// forcedMoveCanonicalText.test.js.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildCanonicalMoveBlock, interpretMove } from '../../src/moves/interpreter.js';
import { _clearPackCache, IS_PACKS } from '../../src/system/ironswornPacks.js';
import { apiPost } from '../../src/api-proxy.js';

const HEAL_JSON = fileURLToPath(new URL(
  '../../vendor/foundry-ironsworn/json-packs/starforged-moves/Heal_2051538f0c9d5d27.json', import.meta.url));
const HAVE_VENDOR = fs.existsSync(HEAL_JSON);

/** A compendium as Foundry serves it: a slim index ({ _id, name, type }) and the full document on getDocument. */
function packWith(doc) {
  const index = [{ _id: doc._id, name: doc.name, type: doc.type }];
  index.find = (fn) => Array.prototype.find.call(index, fn);
  index.size = index.length;
  return { index, getDocument: async (id) => (id === doc._id ? doc : null) };
}

describe('Phase 6 — buildCanonicalMoveBlock', () => {
  let originalPacks;

  beforeEach(() => {
    _clearPackCache();
    originalPacks = global.game.packs;
  });

  afterEach(() => {
    global.game.packs = originalPacks;
    _clearPackCache();
  });

  it('returns "" when slug is empty', async () => {
    expect(await buildCanonicalMoveBlock('')).toBe('');
    expect(await buildCanonicalMoveBlock(null)).toBe('');
  });

  it('returns "" when no pack is registered', async () => {
    global.game.packs = { get: () => null };
    expect(await buildCanonicalMoveBlock('pay_the_price')).toBe('');
  });

  it("wraps the move's text (system.Text, as the system ships it) in <canonical_move> tags, its links reduced to labels", async () => {
    // issue #345 AA44: the vendor sfmove shape — the fixture used to hand-set
    // a system.description no move document has.
    const move = {
      _id: 'm1', name: 'Pay the Price', type: 'sfmove',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/moves/fate/pay_the_price' } },
      system: { Text: 'Roll on the table or choose. Then @Compendium[foundry-ironsworn.starforgedmoves.x1]{Endure Harm} (-1).' },
    };
    global.game.packs = { get: (id) => (id === IS_PACKS.STARFORGED_MOVES ? packWith(move) : null) };
    const block = await buildCanonicalMoveBlock('pay_the_price');
    expect(block).toContain('<canonical_move>');
    expect(block).toContain('Roll on the table or choose. Then Endure Harm (-1).');
    expect(block).not.toContain('@Compendium');
    expect(block).toContain('</canonical_move>');
  });

  it('control: a document with its text in system.description still builds the block', async () => {
    const move = { _id: 'm1', name: 'Pay the Price', type: 'sfmove', system: { description: 'Roll on the table or choose.' } };
    global.game.packs = { get: (id) => (id === IS_PACKS.STARFORGED_MOVES ? packWith(move) : null) };
    expect(await buildCanonicalMoveBlock('pay_the_price')).toContain('Roll on the table or choose.');
  });

  it('returns "" when the matched move has no text', async () => {
    const move = { _id: 'm1', name: 'Face Danger', system: {} };
    const entries = [move];
    entries.find = (fn) => Array.prototype.find.call(entries, fn);
    entries.size = 1;
    global.game.packs = {
      get: () => ({
        index: entries,
        getDocument: async (id) => entries.find(e => e._id === id),
      }),
    };
    expect(await buildCanonicalMoveBlock('face_danger')).toBe('');
  });
});

describe.skipIf(!HAVE_VENDOR)('issue #345 AA44 — the vendored move document reaches the stat reading', () => {
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
    expect(block).toContain('Choose one: Lose Momentum (-2) or Sacrifice Resources (-2).');
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
    expect(userMessage).toContain('Mend your own wounds: Roll +iron or +wits, whichever is lower');
  });
});
