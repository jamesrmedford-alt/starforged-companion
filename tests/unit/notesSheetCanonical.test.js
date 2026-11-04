/**
 * STARFORGED COMPANION
 * tests/unit/notesSheetCanonical.test.js
 *
 * Issue #329 X12 (NOTES-SHEET-NOT-MIRRORED) — an NPC card's or ship's notes
 * are its sheet's Notes tab.
 *
 * The GM writes in an NPC card's or the ship's Notes tab expecting the
 * narrator to know; the Auto-Seed itself writes the introduction and the
 * portrait into that tab (`system.notes`). But the ENTITIES IN SCENE card's
 * Notes row read the RECORD's `notes` flag — a second store only an
 * `!ship envision` / `!ship history` append and the Entities panel's ⤴
 * Promote wrote — so the narrator's Notes row was empty for every seeded NPC
 * and ship and never saw the GM's edits. Now the sheet is canonical
 * (decisions.md): getConnection / getShip read the notes from it, the
 * Entities panel shows it, and ⤴ Promote appends to it.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/entities/notesSheetNotMirrored.probe.js.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';
const NPC_PROSE = 'Vex meets your eye and does not look away.';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => ({
    content: [{ type: 'text', text: /introduction to an NPC/.test(body?.system?.[0]?.text ?? '') ? NPC_PROSE : PROSE }],
  })),
}));
vi.mock('../../src/oracles/roller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn((id) => ({
    tableId: id,
    result: ({
      starship_type: 'Hauler — Heavy transport', starship_first_look: 'Heavy armor', starship_mission_terminus: 'Transport cargo',
      character_role: 'Smuggler', character_goal: 'Pay off a debt', character_first_look: 'Scarred hands', character_disposition: 'Wary',
    })[id] ?? '—',
  })),
}));
vi.mock('../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { seedStarshipActor, getShip, ShipSchema } from '../../src/entities/ship.js';
import { seedConnectionActor, getConnection } from '../../src/entities/connection.js';
import { appendNotesSection } from '../../src/entities/shipEnvision.js';
import { formatEntityCard } from '../../src/narration/narratorPrompt.js';
import { applyEntityEditFromRelay } from '../../src/ui/entityPanel.js';
import { ConnectionSchema } from '../../src/schemas.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';
const notesRow = (card) => (card.split('\n').find(l => /^\s*Notes:/.test(l)) ?? '').trim();

function makeShip() {
  const actor = global.makeTestActor({
    type: 'starship', name: 'Kestrel',
    flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-kestrel', ship: { ...ShipSchema, _id: 'rec-kestrel', name: 'Kestrel' } } },
  });
  actor.createEmbeddedDocuments = async () => [];
  global.game.actors._set(actor.id, actor);
  return actor;
}
function makeNpc() {
  const actor = global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: { ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous' } } },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  _resetFolderCache();
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], connectionIds: ['npc-vex'], sectors: [], activeSectorId: null });
});

describe("issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row", () => {
  it("a ship: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE", async () => {
    const actor = makeShip();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await seedStarshipActor(actor, cs);
    expect(String(actor.system.notes)).toContain('hull plates scarred');              // the seed wrote the sheet

    // The Notes row carries the sheet's Notes (there was none — the record's
    // `notes` flag was "").
    expect(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('hull plates scarred');

    await actor.update({ 'system.notes': `${actor.system.notes}<p>The hold is full of contraband.</p>` });
    expect(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('contraband');
  });

  it("an NPC card: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE", async () => {
    const npc = makeNpc();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const seeded = await seedConnectionActor(npc, cs);
    expect(seeded?.seeded).toBe(true);
    expect(String(npc.system.notes)).toContain('does not look away');                 // the seed wrote the sheet

    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toContain('does not look away');

    await npc.update({ 'system.notes': `${npc.system.notes}<p>She is secretly on the Syndicate's payroll.</p>` });
    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toContain('payroll');
  });

  it('control: an `!ship envision` append reaches the row (it writes the Notes tab)', async () => {
    const actor = makeShip();
    await appendNotesSection(actor, 'History', '<p>Once a smuggler, always a smuggler.</p>');
    expect(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('Once a smuggler');
  });

  it('notes the GM cleared from the sheet are gone from the card, whatever the record still holds', async () => {
    const npc = makeNpc();
    npc.flags[MODULE_ID].connection.notes = 'An old note the record kept.';
    await npc.update({ 'system.notes': '' });
    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toBe('');
  });

  it("⤴ Promote appends the detail to the NPC card's Notes tab, where the narrator reads it", async () => {
    const npc = makeNpc();
    npc.flags[MODULE_ID].connection.generativeTier = [{ detail: 'Owes the Syndicate', sessionId: 's-1', pinned: false, promoted: false }];
    await npc.update({ 'system.notes': '<p>Keeps her own counsel.</p>' });
    const res = await applyEntityEditFromRelay({ op: 'promote', entityId: npc.id, detail: 'Owes the Syndicate' }, { requesterIsGM: true });
    expect(res).toEqual({ applied: true });
    expect(npc.system.notes).toBe('<p>Keeps her own counsel.</p><p>Owes the Syndicate</p>');
    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toBe('Notes: Keeps her own counsel. Owes the Syndicate');
    expect(npc.getFlag(MODULE_ID, 'connection').generativeTier[0].promoted).toBe(true);
  });
});

describe("issue #329 X12 — the Entities panel shows an NPC card's Notes tab", () => {
  it("as text, from the sheet — not the record's own notes", async () => {
    const { StubElement } = await import('../helpers/cardDom.js');
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    try {
      const npc = makeNpc();
      npc.flags[MODULE_ID].connection.notes = 'An old note the record kept.';
      await npc.update({ 'system.notes': '<p>She is secretly on the <strong>Syndicate</strong> payroll.</p>' });
      const { EntityPanelApp } = await import('../../src/ui/entityPanel.js');
      const app = new EntityPanelApp();
      await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(
        Object.assign(app, { render() {} }), {}, { dataset: { journalId: npc.id } });
      const root = await app._renderHTML(await app._prepareContext({}), {});
      const notes = [...root.querySelectorAll('.detail-field')]
        .find(f => f.querySelector('.detail-label').textContent === 'Notes');
      expect(notes.querySelector('.detail-value').textContent).toBe('She is secretly on the Syndicate payroll.');
    } finally {
      delete globalThis.document;
    }
  });
});
