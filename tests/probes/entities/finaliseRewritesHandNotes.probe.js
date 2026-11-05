/**
 * PROBE — ENT-01 FINALISE-REWRITES-HAND-NOTES (tenth audit, area entities)
 *
 * What the user does: with Auto-Seed NPC off (the default), the GM confirms
 * a narrator-detected connection ("Vex") from the New Entities card — an
 * unseeded card with an empty Characteristics / Notes tab — and types what
 * they know into Vex's Notes tab. Later they press ✦ Finalise on the
 * Entities panel to get the oracle Characteristics and a portrait. A sibling
 * case: an NPC card whose narrator-added detail the GM ⤴ Promoted to canon
 * (the detail lives on the Notes tab since issue #329 X12, and the panel and
 * the narrator's NARRATOR-ADDED block hide a promoted entry), then presses
 * ↻ Regenerate flavour "to refresh the description". And a ship the GM made
 * by hand with its own Notes: Finalise stamps it (issue #331 X34), the panel
 * then offers only ↻ Regenerate flavour.
 *
 * What happens: seedConnectionActor (src/entities/connection.js:480-493)
 * writes `system.notes` whole — `keepNotesPortrait(oldNotes, composed)`
 * keeps the portrait block alone — so the GM's paragraph is gone after
 * Finalise, and the promoted canon detail is gone from every surface after
 * Regenerate: the Notes tab (rewritten), the panel (promoted entries hidden)
 * and the narrator's card (selectCardTierEntries drops promoted entries,
 * narratorPrompt.js:881; the Notes row no longer holds it). The ship's
 * Regenerate (ship.js:644-649) rewrites its Notes the same way. Nothing asks
 * the GM first (↻ Regenerate portrait does, entityPanel.js:749).
 *
 * What should happen: issue #331 X34 gave the ship seed the rule for Notes
 * that already hold text — "stamped by its first Finalise, nothing else" —
 * and issue #311 P07 states the harm ("a fresh introduction written over
 * Notes the GM had edited"); the connection seed is the sibling site the
 * rule did not reach. A ⤴ Promoted detail is canon the GM chose to keep: a
 * flavour regeneration must keep it (the panel's Promote dialog says it is
 * "appended to the entity's notes"), as it keeps the portrait (issue #322
 * V30). The seed should write its own introduction and leave the rest of the
 * tab — or, at the least, ask before replacing it.
 *
 * Control: a card with an empty Notes tab gets the seed's introduction;
 * Regenerate keeps the portrait block (V30); the record is stamped either way.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/entities/finaliseRewritesHandNotes.probe.js
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const PROSE = 'Vex meets your eye only once, then goes back to counting cargo seals.';
const SHIP_PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => ({
    content: [{ type: 'text', text: /starship/i.test(String(body?.system?.[0]?.text ?? '')) ? SHIP_PROSE : PROSE }],
  })),
}));
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn((id) => ({
    tableId: id,
    result: ({
      character_role:            'Smuggler',
      character_goal:            'Pay a debt',
      character_first_look:      'Scarred',
      character_disposition:     'Wary',
      starship_type:             'Hauler — Heavy transport',
      starship_first_look:       'Heavy armor',
      starship_mission_terminus: 'Transport cargo',
    })[id] ?? '—',
  })),
}));
vi.mock('../../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { finalizeEntity } from '../../../src/entities/finalize.js';
import { getConnection } from '../../../src/entities/connection.js';
import { getShip, registerStarshipActorLight, ShipSchema } from '../../../src/entities/ship.js';
import { formatEntityCard } from '../../../src/narration/narratorPrompt.js';
import { ConnectionSchema } from '../../../src/schemas.js';
import { _resetFolderCache } from '../../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';
const PORTRAIT  = '<div class="sf-ship-portrait" style="text-align:center;margin-bottom:0.5em;"><img src="worlds/w/art/npc-vex.png" alt="Portrait" style="max-width:100%"/></div>';
const GM_NOTE   = 'Vex owes Kira her life after the Bleakhold run — she will not say why.';
const PROMOTED  = 'Vex keeps a hidden cache behind the Bleakhold docks';

let applyEntityEditFromRelay;
beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ applyEntityEditFromRelay } = await import('../../../src/ui/entityPanel.js'));
});

/** An NPC card as a draft Confirm makes it with Auto-Seed NPC off: the record filled, the sheet blank. */
function makeNpc({ seeded, notes = '', biography = '', tier = [] }) {
  const actor = global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    system: { notes, biography },
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: {
      ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous',
      role: 'Smuggler', goal: 'Pay a debt', description: 'A wiry pilot with a burned hand.',
      pronouns: 'she/her', disposition: 'Wary', firstLook: [],
      seeded, generativeTier: tier,
    } } },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}

function makeHandMadeShip(notes) {
  const actor = global.makeTestActor({ id: 'ship-kestrel', type: 'starship', name: 'Kestrel', system: { notes } });
  actor.createEmbeddedDocuments = async () => [];
  global.game.actors._set(actor.id, actor);
  return actor;
}

const cardFor = (actorId) => formatEntityCard(getConnection(actorId), 'connection');

beforeEach(() => {
  _resetFolderCache();
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], connectionIds: ['npc-vex'], sectors: [], activeSectorId: null });
  global.game.user = { id: 'gm-1', isGM: true, active: true };
});

describe('ENT-01 ✦ Finalise on an unseeded NPC card keeps what the GM typed into its Notes tab', () => {
  it('the GM\'s paragraph survives the seed (the issue #331 X34 rule, which reached the ship seed only)', async () => {
    const actor = makeNpc({ seeded: false, notes: `<p>${GM_NOTE}</p>`, biography: 'Keeps a knife in her boot.' });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    const result = await finalizeEntity('connection', actor.id, cs);
    expect(result).toMatchObject({ ok: true, reason: 'finalized' });            // control: Finalise ran
    expect.soft(String(actor.system.biography)).toContain('Role: Smuggler');     // control: the Characteristics are seeded
    expect(getConnection(actor.id).finalizedAt).toBeTruthy();

    // Expected: the GM's note is still on the tab (and on the narrator's Notes
    // row), and their Characteristics line beside the seeded ones. Actual: the
    // tab holds the seed's introduction alone; Characteristics the oracle lines.
    expect.soft(String(actor.system.biography)).toContain('knife in her boot');
    expect.soft(cardFor(actor.id)).toContain('owes Kira her life');
    expect(String(actor.system.notes)).toContain('owes Kira her life');
  });

  it('control: an unseeded card with an empty Notes tab gets the seed\'s introduction', async () => {
    const actor = makeNpc({ seeded: false, notes: '' });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await finalizeEntity('connection', actor.id, cs);
    expect(String(actor.system.notes)).toContain('counting cargo seals');
    expect(cardFor(actor.id)).toContain('counting cargo seals');
  });
});

describe('ENT-01 ↻ Regenerate flavour keeps a detail the GM ⤴ Promoted to canon', () => {
  it('after Regenerate the promoted detail still reaches the narrator\'s card and the Notes tab', async () => {
    const actor = makeNpc({ seeded: true, notes: `${PORTRAIT}<p>Smuggler and fixer.</p>`,
      tier: [{ detail: PROMOTED, source: 'narration', pinned: false, sessionNum: 2 }] });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    // The real producer: the panel's ⤴ Promote (relayed to the canonical GM).
    const promoted = await applyEntityEditFromRelay({ op: 'promote', entityId: actor.id, detail: PROMOTED }, { requesterIsGM: true });
    expect(promoted).toEqual({ applied: true });
    expect(cardFor(actor.id)).toContain('hidden cache');                        // control: canon, on the Notes row
    expect(getConnection(actor.id).generativeTier[0].promoted).toBe(true);      // and hidden from NARRATOR-ADDED

    const result = await finalizeEntity('connection', actor.id, cs, { force: true });
    expect(result).toMatchObject({ ok: true, reason: 'regenerated' });
    expect.soft(String(actor.system.notes).startsWith(PORTRAIT)).toBe(true);    // control: the portrait is kept (V30)

    // Expected: the promoted canon detail is still somewhere the narrator and
    // the panel read. Actual: the Notes tab was rewritten and the tier entry
    // stays promoted (hidden) — the detail exists nowhere.
    expect.soft(String(actor.system.notes)).toContain('hidden cache');
    expect(cardFor(actor.id)).toContain('hidden cache');
  });

  it('a hand-made ship: Finalise stamps it (X34), then Regenerate — the only button left — replaces the GM\'s Notes', async () => {
    const actor = makeHandMadeShip('<p>The Kestrel was Kira\'s father\'s ship; she will not sell it.</p>');
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await registerStarshipActorLight(actor, cs);                                // the createActor hook, Auto-Seed off

    const first = await finalizeEntity('ship', actor.id, cs);
    expect(first).toMatchObject({ ok: true, reason: 'finalized', artTriggered: false });   // control: X34 — stamped, not seeded
    expect(String(actor.system.notes)).toContain("father's ship");
    expect.soft(getShip(actor.id).type).toBe('');                               // no rolled identity: the panel now offers only ↻ Regenerate

    const second = await finalizeEntity('ship', actor.id, cs, { force: true });
    expect(second).toMatchObject({ ok: true, reason: 'regenerated' });
    expect.soft(getShip(actor.id).type).toBe('Hauler — Heavy transport');       // control: the seed rolled the identity
    // Expected: the GM's paragraph is kept beside the seed's introduction.
    // Actual: the tab holds the introduction alone.
    expect.soft(String(actor.system.notes)).toContain("father's ship");
  });

  it('control: a seeded card with no promoted detail — Regenerate rewrites the introduction and keeps the portrait', async () => {
    const actor = makeNpc({ seeded: true, notes: `${PORTRAIT}<p>Old intro.</p>` });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const result = await finalizeEntity('connection', actor.id, cs, { force: true });
    expect(result).toMatchObject({ ok: true, reason: 'regenerated' });
    expect(String(actor.system.notes).startsWith(PORTRAIT)).toBe(true);
    expect(String(actor.system.notes)).toContain('counting cargo seals');
    void ShipSchema;
  });
});
