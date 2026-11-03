/**
 * PROBE SC — VOW-TARGET-ANY-KIND-CONNECTION (WRONG-DETAIL)
 *
 * What the user does: Envision an Inciting Incident whose vow is against a
 * faction or for a vessel — the narrator's own inciting prompt asks for a
 * "Vow target" line "when the vow concerns a specific person, creature,
 * faction, or vessel" (narratorPrompt.js ROLE_DESCRIPTIONS.inciting_incident)
 * — then ⚔ Swear this vow.
 *
 * What happens: the parsed target carries only { name, pronouns,
 * description } (splitVowTarget), and swearSharedVowForAll creates EVERY
 * target that does not exist yet as a connection — createConnection, a bond
 * Item on every PC's Connections tab (registerConnectionOnActiveCharacter)
 * and `linkedConnectionName` on every vow copy, so fulfilling the vow offers
 * "Deepen your bond with The Iron Covenant". A faction, creature or ship is
 * never a Starforged connection (Make a Connection: a person you rely on).
 *
 * What should happen: only a person becomes a connection; a faction / vessel
 * / creature target is left to its own entity type (or not created), and the
 * vow is not linked to deepen a bond with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'rec-new', name: data.name, rank: 'dangerous' })),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  postCreationEnrichment:         vi.fn(async () => {}),
  promoteNewEntityLedgerSubjects: vi.fn(async () => {}),
}));
vi.mock('../../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));

import { createConnection } from '../../../src/entities/connection.js';
import { splitIncitingMeta } from '../../../src/session/incitingIncident.js';
import { swearSharedVowForAll } from '../../../src/session/swearVow.js';
import { buildNarratorSystemPrompt } from '../../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

// The proposal block as the prompt asks for it, for a faction target.
const REPLY = [
  'The relay goes dark as the Iron Covenant seizes the Ashwind docks.',
  '',
  'Suggested vow: I will break the Iron Covenant\'s hold on Ashwind (formidable)',
  'Vow target: The Iron Covenant (they/them) — a zealot faction that seized the Ashwind relay and its people.',
  'Situation: The Iron Covenant holds the Ashwind relay.',
].join('\n');

function incitingCard(meta) {
  return makeTestMessage({
    id: 'inc-1',
    content: '<div class="sf-incite-card"><div class="sf-incite-actions"><button>⚔</button></div></div>',
    flags: { [MODULE_ID]: { incitingIncidentCard: true, incitingMeta: meta } },
  }, { author: 'test-user-gm' });
}

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', connectionIds: [] });
  game.user.isGM = true;
  vi.mocked(createConnection).mockClear();
});

describe('PROBE VOW-TARGET-ANY-KIND-CONNECTION', () => {
  it('control: the inciting prompt asks for a vow target that is a faction or a vessel', () => {
    const prompt = buildNarratorSystemPrompt(
      { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {} },
      { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 },
      null, '', { mode: 'inciting_incident' },
    );
    expect(prompt).toMatch(/person,\s*creature,\s*faction,\s*or vessel/);
  });

  it('swearing a vow against a faction does not make the faction a connection with a bond on every PC', async () => {
    silenceConsoleErrors();
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    const ren  = makeTestActor({ id: 'pc-ren',  name: 'Ren',  type: 'character' });
    game.actors._setAll([kira, ren]);
    const meta = splitIncitingMeta(REPLY);
    await swearSharedVowForAll(incitingCard({ vow: meta.vow, clock: meta.clock, immediateCrisis: meta.immediateCrisis, target: meta.target }),
      { speakerActorId: 'pc-kira' });

    // Actual: createConnection({ name: "The Iron Covenant", … }), a bond Item
    // "The Iron Covenant" on both PCs, and the vow linked to deepen it.
    expect(vi.mocked(createConnection)).not.toHaveBeenCalled();
    for (const pc of [kira, ren]) {
      expect(pc.items.contents.filter(i => i.system?.subtype === 'bond').map(i => i.name)).toEqual([]);
      const vow = pc.items.contents.find(i => i.system?.subtype === 'vow');
      expect(vow.flags[MODULE_ID].linkedConnectionName ?? null).toBeNull();
    }
  });
});
