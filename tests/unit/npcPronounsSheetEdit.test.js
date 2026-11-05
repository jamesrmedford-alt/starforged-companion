/**
 * STARFORGED COMPANION
 * tests/unit/npcPronounsSheetEdit.test.js
 *
 * Issue #335 Y13 (NPC-PRONOUNS-SHEET-EDIT-IGNORED). An NPC card's pronouns
 * are rolled at seed (when the narration established none) or come from the
 * detection pass; the GM corrects them on the card's sheet — the one surface
 * with a Pronouns field, the one the seed itself fills (`system.pronouns`).
 * Every narrator surface read the record's `pronouns`, which no sheet edit
 * reached: the ENTITIES IN SCENE card, the ACTIVE SECTOR roster, the
 * end-session vignette, the audio voice, the portrait prompt and the
 * consistency check's RECORDED IDENTITIES (which then flagged the narrator for
 * using the pronouns the GM chose); and ✦ Finalise on an unseeded card wrote
 * the record's set (or a roll) over the sheet's. The sheet is the card's
 * pronouns now, as its Notes tab is its notes (decisions.md → "An NPC card's
 * or ship's notes are its sheet's Notes tab"; rules/reachability.md §5): the
 * getter overlays a non-empty `system.pronouns`, the Entities panel reads
 * records through it, and the seed prefers it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema, ConnectionSchema } from '../../src/schemas.js';

vi.mock('../../src/art/openRouterImage.js', () => ({ generateOpenRouterImage: vi.fn() }));

import { generateOpenRouterImage } from '../../src/art/openRouterImage.js';
import { getConnection } from '../../src/entities/connection.js';
import { resolveNpcVoiceForCard } from '../../src/audio/index.js';
import { selectEndSessionNPC } from '../../src/session/endSessionVignette.js';

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

describe('the GM corrects an NPC card\'s pronouns on its sheet', () => {
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
    expect(vex.getFlag(MODULE_ID, 'connection').pronouns).toBe('she/her');          // the record is not written

    const record = gm.run(() => getConnection('npc-vex'));
    expect(record.pronouns).toBe('they/them');
    expect(gm.run(() => formatEntityCard(record, 'connection'))).toContain('Pronouns: they/them');
    expect(gm.run(() => formatSectorNpcProfile(record))).toContain('Pronouns: they/them');
    expect(gm.run(() => buildRecordedIdentitiesBlock(['npc-vex']))).toContain('Vex — they/them');
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
    expect(orin.system.pronouns).toBe('they/them');
    expect(orin.getFlag(MODULE_ID, 'connection').pronouns).toBe('they/them');          // the record written through
    expect(gm.run(() => getConnection('npc-orin')).pronouns).toBe('they/them');
    expect(orin.system.biography).toContain('Pronouns: they/them');
  }, 30_000);

  it('control: an empty Pronouns field leaves the set the narration established on the record', async () => {
    const gm = table.client('gm-1');
    const { getConnection } = await gm.import('../../src/entities/connection.js');
    await gm.run(() => game.actors.get('npc-vex').update({ 'system.pronouns': '' }));
    await table.drain();
    expect(gm.run(() => getConnection('npc-vex')).pronouns).toBe('she/her');
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

describe('the voice, the end-session vignette and the portrait follow the sheet (single client)', () => {
  let EntityPanelApp;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    ({ EntityPanelApp } = await import('../../src/ui/entityPanel.js'));
  });

  /** A seeded NPC card whose sheet the GM corrected to they/them; the record still says she/her. */
  beforeEach(() => {
    game.actors._reset();
    const npc = makeTestActor({
      id: 'npc-sol', type: 'character', name: 'Sol',
      system: { pronouns: 'they/them', notes: '' },
      flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-sol', connection: {
        ...ConnectionSchema, _id: 'conn-sol', name: 'Sol', rank: 'formidable', role: 'Archivist', bonded: true,
        pronouns: 'she/her', seeded: true, active: true,
        portraitSourceDescription: 'a woman. Ink-stained fingers. Archivist. Curious',
      } } },
    });
    game.actors._set(npc.id, npc);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, connectionIds: ['npc-sol'] });
    game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, 'sk-or-v1-a-key');
    generateOpenRouterImage.mockReset();
    generateOpenRouterImage.mockResolvedValue('A'.repeat(400));
  });

  it('the NPC voice is the sheet\'s', async () => {
    const voices = { npcVoiceId: 'v-default', npcVoiceByKey: { feminine: 'v-fem', masculine: 'v-masc', neutral: 'v-neutral' } };
    expect(getConnection('npc-sol').pronouns).toBe('they/them');
    expect(await resolveNpcVoiceForCard({ flags: { [MODULE_ID]: { matchedEntityIds: ['npc-sol'] } } }, voices)).toBe('v-neutral');
  });

  it('the end-session vignette\'s NPC hint leads with the sheet\'s pronouns', () => {
    const npc = selectEndSessionNPC(game.settings.get(MODULE_ID, 'campaignState'));
    expect(npc).toMatchObject({ kind: 'bonded_connection', name: 'Sol' });
    expect(npc.hint.startsWith('Pronouns: they/them')).toBe(true);
  });

  it('the GM\'s Generate portrait on the Entities panel paints the sheet\'s pronouns, not the seed\'s', async () => {
    const app = new EntityPanelApp();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.generatePortrait.call(app, {}, { dataset: { journalId: 'npc-sol' } });
    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);
    const { prompt } = generateOpenRouterImage.mock.calls[0][0];
    expect(prompt).toContain('a person');
    expect(prompt).not.toContain('a woman');
  });
});
