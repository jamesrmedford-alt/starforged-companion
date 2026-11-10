/**
 * R2I — CANONICAL-MOVE-TEXT-UNREAD (PRODUCED-BUT-DEAD, low)
 *
 * The interpreter's "canonical move" grounding (Phase 6 of the Ironsworn API
 * integration) is never sent: buildCanonicalMoveBlock reads the compendium
 * move's text from `system.description ?? system.text ?? system.Text?.text`
 * (src/moves/interpreter.js:354-356 at 22bdbeb), but foundry-ironsworn's
 * `sfmove` data model keeps it in `system.Text`, an HTMLField string
 * (vendor/foundry-ironsworn/src/module/item/subtypes/sfmove.ts:98; both the
 * starforged-moves and ironsworn-moves packs are sfmove documents —
 * vendor/foundry-ironsworn/json-packs/starforged-moves/Face_Danger_e6ed148eff82c171.json).
 * `"…".text` is undefined, so the block is "" for every move, and the
 * forced-move stat reading (statEnrichment.enrichForcedMoveStat →
 * interpretMove(…, { expectedMoveSlug }) — interpreter.js:398) never
 * carries the rulebook text the pack lookup (src/system/ironswornPacks.js
 * getCanonicalMove) found. tests/unit/canonicalMoveBlock.test.js hand-builds a
 * document with `system: { description }`, a shape the system never has —
 * the fixture pattern of the fixed ASSET-ABILITY-TEXT (known-issues.md:1772),
 * on another reader of a vendor document.
 *
 * Scenario (the usual forced move): a paced card offers "Roll Face Danger";
 * the player clicks it; the canonical GM reads the stat with a stat-only
 * interpretation. The Starforged moves compendium is loaded with the
 * vendored Face Danger document as the system ships it.
 *
 * Expected: the interpreter's user message carries
 * `<canonical_move>` with the move's text. Actual: it carries none.
 * Control: the same flow with a pack document whose text sits where the
 * reader looks (`system.description`) does carry the block — the pack is
 * reached and the forced reading runs; only the field name differs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge 2, 3; action 6 → a strong hit (no Pay the Price, no choice card)
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const STARFORGED_MOVES = 'foundry-ironsworn.starforgedmoves';
const VENDOR_FACE_DANGER = path.resolve(__dirname,
  '../../../vendor/foundry-ironsworn/json-packs/starforged-moves/Face_Danger_e6ed148eff82c171.json');
const vendoredFaceDanger = JSON.parse(fs.readFileSync(VENDOR_FACE_DANGER, 'utf8'));

const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? '');
const SNEAK = 'I melt into the shadows and slip past the sentries.';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

/** A compendium pack as Foundry exposes one: an index of {_id, name, type}, and getDocument. */
function packOf(doc) {
  const index = [{ _id: doc._id, name: doc.name, type: doc.type }];
  index.size = index.length;
  return {
    index,
    getDocument: async (id) => (id === doc._id ? structuredClone(doc) : null),
  };
}

async function loadMovesPack(doc) {
  // Every client's own copy of the packs (the pipeline runs on the canonical GM).
  for (const id of ['gm-1', 'pl-1']) {
    // The lookup cache is per page load; each test is a fresh compendium.
    const { _clearPackCache } = await table.client(id).import('../../src/system/ironswornPacks.js');
    _clearPackCache();
    await table.client(id).run(() => globalThis.game.packs.set(STARFORGED_MOVES, packOf(doc)));
  }
}

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 1, shadow: 4 } });
  scriptClaude(table).when(isInterpreter,
    JSON.stringify({ moveId: 'face_danger', statUsed: 'shadow', confidence: 'high', rationale: 'Creeping past unseen is stealth.' }),
    { times: 5 });
});

async function clickRollFaceDanger() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The corridor narrows.</div>`
      + `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll it</button></div></div>`,
    flags: { [MODULE_ID]: { narratorCard: true, pacedNarrative: true, playerText: SNEAK, suggestedMove: 'face_danger', sessionId: 'sess-1' } },
  }));
  await table.settle();
  table.client('pl-1').click(msg.id, '[data-action="sf-paced-roll"]');
  await table.settle(); await table.drain();
  const readings = table.claude.calls.filter(isInterpreter);
  expect(readings).toHaveLength(1);
  expect(readings[0].userText).toContain('MOVE ALREADY CHOSEN: the player chose Face Danger');
  return readings[0].userText;
}

describe('R2I CANONICAL-MOVE-TEXT-UNREAD — the forced-move reading carries the compendium move text', () => {
  it('the vendored Face Danger (system.Text, as foundry-ironsworn ships it) reaches the interpreter as <canonical_move>', async () => {
    await loadMovesPack(vendoredFaceDanger);
    const userText = await clickRollFaceDanger();
    expect(userText).toContain('<canonical_move>');
    expect(userText).toContain('When you attempt something risky or react to an imminent threat');
  }, 60_000);

  it('control: a pack document with its text where the reader looks (system.description) is sent', async () => {
    const shaped = { ...vendoredFaceDanger, system: { description: 'When you attempt something risky or react to an imminent threat, envision your action and roll.' } };
    await loadMovesPack(shaped);
    const userText = await clickRollFaceDanger();
    expect(userText).toContain('<canonical_move>');
    expect(userText).toContain('When you attempt something risky or react to an imminent threat');
  }, 60_000);
});
