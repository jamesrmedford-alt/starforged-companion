/**
 * PROBE — ENT-03 NPC-PRONOUNS-SHEET-EDIT-IGNORED (tenth audit, area entities)
 *
 * What the user does: an NPC card was seeded with rolled pronouns (she/her —
 * the fallback roll when the narration established none, connection.js:450)
 * or the detection pass misread them. The GM opens Vex's sheet and corrects
 * the Pronouns field — the one place with a pronoun field, the one the seed
 * itself fills (`system.pronouns`, connection.js:488) — to they/them.
 *
 * What happens: every narrator surface reads the record's `pronouns`, never
 * the sheet's: the ENTITIES IN SCENE card (`Pronouns:` row,
 * narratorPrompt.js:756 via getConnection), the ACTIVE SECTOR roster
 * (`formatSectorNpcProfile`, narrator.js:3117), the end-session vignette
 * (endSessionVignette.js:118), the audio voice (audio/index.js:225), the
 * portrait prompt (promptBuilder.js:170) and the consistency check's
 * RECORDED IDENTITIES (consistencyCheck.js:379). Nothing mirrors a sheet
 * edit back: the rename sync (index.js:2758 syncEntityRecordNameOnUpdate)
 * covers `name` alone, the ready-time `syncEntityRecordNames` the same, the
 * Entities panel edits no record field. So the narrator keeps misgendering
 * Vex — and the consistency check, auditing against the stale record, flags
 * the narrator for using the pronouns the GM chose.
 *
 * What should happen: the sheet field the GM edits is the fact's store, as it
 * is for a PC (readCharacterSnapshot reads `system.pronouns`) and for the
 * Notes tab (decisions.md → "An NPC card's or ship's notes are its sheet's
 * Notes tab": "the sheet is what the GM edits and what the seed writes");
 * rules/reachability.md §5 — one fact, two stores, the mirror written through
 * on every change. Either the getter reads the sheet's pronouns as it reads
 * the Notes (withSheetNotes), or the rename sync mirrors `system.pronouns`
 * into the record as it mirrors `name`.
 *
 * Control: a rename on the same sheet reaches the record (the rename sync);
 * a PC's pronoun edit reaches the narrator's CHARACTER block.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/entities/npcPronounsSheetEdit.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema, ConnectionSchema } from '../../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: ['npc-vex'], sectors: [] },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { pronouns: 'she/her' } });
  // A seeded NPC card: the record and the sheet agree, as the seed leaves them.
  table.addActor({
    id: 'npc-vex', type: 'character', name: 'Vex', hasPlayerOwner: false,
    system: { pronouns: 'she/her', notes: '<p>A wiry pilot.</p>' },
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: {
      ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous', role: 'Smuggler',
      pronouns: 'she/her', seeded: true, active: true,
    } } },
  });
});

describe('ENT-03 the GM corrects an NPC card\'s pronouns on its sheet', () => {
  it('the narrator\'s card, the sector roster and the consistency check follow the sheet', async () => {
    const gm = table.client('gm-1');
    const { getConnection } = await gm.import('../../src/entities/connection.js');
    const { formatEntityCard } = await gm.import('../../src/narration/narratorPrompt.js');
    const { formatSectorNpcProfile } = await gm.import('../../src/narration/narrator.js');
    const { buildRecordedIdentitiesBlock } = await gm.import('../../src/factContinuity/consistencyCheck.js');

    await gm.run(() => game.actors.get('npc-vex').update({ 'system.pronouns': 'they/them' }));
    await table.drain();

    const vex = table.actors.find(a => a.id === 'npc-vex');
    expect(vex.system.pronouns).toBe('they/them');                                   // control: the sheet took the edit

    // Expected: every narrator surface says they/them. Actual: she/her — the
    // record, which no sheet edit reaches.
    const record = gm.run(() => getConnection('npc-vex'));
    expect.soft(gm.run(() => formatEntityCard(record, 'connection'))).toContain('Pronouns: they/them');
    expect.soft(gm.run(() => formatSectorNpcProfile(record))).toContain('Pronouns: they/them');
    expect.soft(gm.run(() => buildRecordedIdentitiesBlock(['npc-vex']))).toContain('Vex — they/them');
    expect(record.pronouns).toBe('they/them');
  }, 30_000);

  it('✦ Finalise on an unseeded card keeps the pronouns the GM set on its sheet first', async () => {
    const gm = table.client('gm-1');
    const { getConnection } = await gm.import('../../src/entities/connection.js');
    const { finalizeEntity } = await gm.import('../../src/entities/finalize.js');
    // Auto-Seed NPC off: a draft Confirm leaves the card unseeded with no
    // pronouns established; the GM fills the sheet's Pronouns before Finalise.
    table.addActor({
      id: 'npc-orin', type: 'character', name: 'Orin', hasPlayerOwner: false,
      system: { pronouns: 'they/them', notes: '' },
      flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-orin', connection: {
        ...ConnectionSchema, _id: 'conn-orin', name: 'Orin', rank: 'dangerous', role: 'Medic', pronouns: '', seeded: false, active: true,
      } } },
    });
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0);   // the seed's fallback roll → "she/her"
    try {
      const result = await gm.run(() => finalizeEntity('connection', 'npc-orin', game.settings.get(MODULE_ID, 'campaignState')));
      await table.drain();
      expect(result).toMatchObject({ ok: true, reason: 'finalized' });                 // control: the seed ran
    } finally {
      rng.mockRestore();
    }
    const orin = table.actors.find(a => a.id === 'npc-orin');
    // Expected: the GM's they/them stands on the sheet and reaches the record.
    // Actual: the seed rolls a set for the record and writes it over the sheet.
    expect(orin.system.pronouns).toBe('they/them');
    expect.soft(gm.run(() => getConnection('npc-orin')).pronouns).toBe('they/them');
  }, 30_000);

  it('control: a rename on the same sheet reaches the record (the rename sync)', async () => {
    const gm = table.client('gm-1');
    const { getConnection } = await gm.import('../../src/entities/connection.js');
    await gm.run(() => game.actors.get('npc-vex').update({ name: 'Vexa Harrow' }));
    await table.drain();
    expect(gm.run(() => getConnection('npc-vex')).name).toBe('Vexa Harrow');
  }, 30_000);

  it('control: a PC\'s pronoun edit reaches the narrator\'s CHARACTER block', async () => {
    const gm = table.client('gm-1');
    const { readCharacterSnapshot } = await gm.import('../../src/character/actorBridge.js');
    const { buildRecordedIdentitiesBlock } = await gm.import('../../src/factContinuity/consistencyCheck.js');
    await gm.run(() => game.actors.get('pc-kira').update({ 'system.pronouns': 'they/them' }));
    await table.drain();
    expect(gm.run(() => readCharacterSnapshot(game.actors.get('pc-kira'))).pronouns).toBe('they/them');
    expect(gm.run(() => buildRecordedIdentitiesBlock([]))).toContain('Kira — they/them');
  }, 30_000);
});
