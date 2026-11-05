/**
 * STARFORGED COMPANION
 * tests/unit/seedKeepsHandNotes.test.js
 *
 * Issue #335 Y12 (REGENERATE-ERASES-PROMOTED-CANON) and issue #338 D4
 * (SEED-REWRITES-HAND-NOTES, option A). Both seeds — the connection seed and
 * the ship seed — wrote `system.notes` whole (the portrait block alone kept,
 * issue #322 V30), and the connection seed `system.biography` whole:
 * - ↻ Regenerate flavour after a ⤴ Promote erased the promoted canon detail
 *   from every surface (the tab rewritten; the panel and the narrator's
 *   NARRATOR-ADDED block hide a promoted entry);
 * - ✦ Finalise on an unseeded NPC card (Auto-Seed NPC off) replaced the Notes
 *   and Characteristics the GM had typed;
 * - a ship made by hand with its own Notes was only stamped by Finalise
 *   (issue #331 X34), leaving ↻ Regenerate — which replaced those Notes — the
 *   only way to its type / first look / mission.
 * Each seed now writes its own marked introduction and keeps the rest of the
 * tab, prepending the introduction on an unmarked one; Characteristics keep
 * every line the seed did not write; a hand-made ship's Finalise seeds it.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const PROSE = 'Vex meets your eye only once, then goes back to counting cargo seals.';
const SHIP_PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => ({
    content: [{ type: 'text', text: /starship/i.test(String(body?.system?.[0]?.text ?? '')) ? SHIP_PROSE : PROSE }],
  })),
}));
vi.mock('../../src/oracles/roller.js', async (importOriginal) => ({
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
vi.mock('../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { finalizeEntity } from '../../src/entities/finalize.js';
import { getConnection } from '../../src/entities/connection.js';
import { getShip, registerStarshipActorLight } from '../../src/entities/ship.js';
import { formatEntityCard } from '../../src/narration/narratorPrompt.js';
import { ConnectionSchema } from '../../src/schemas.js';
import { _resetFolderCache } from '../../src/entities/folder.js';
import { SEED_INTRO_CLASS, markSeedIntro, writeSeedIntro } from '../../src/entities/seedIntro.js';
import { appendNotesSection } from '../../src/entities/shipEnvision.js';

const MODULE_ID = 'starforged-companion';
const PORTRAIT  = '<div class="sf-ship-portrait" style="text-align:center;margin-bottom:0.5em;"><img src="worlds/w/art/npc-vex.png" alt="Portrait" style="max-width:100%"/></div>';
const GM_NOTE   = 'Vex owes Kira her life after the Bleakhold run — she will not say why.';
const PROMOTED  = 'Vex keeps a hidden cache behind the Bleakhold docks';
const count = (haystack, needle) => String(haystack).split(needle).length - 1;

let applyEntityEditFromRelay;
beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ applyEntityEditFromRelay } = await import('../../src/ui/entityPanel.js'));
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

describe('D4 — ✦ Finalise on an unseeded NPC card keeps what the GM typed on its sheet', () => {
  it("the GM's Notes paragraph and Characteristics line survive the seed", async () => {
    const actor = makeNpc({ seeded: false, notes: `<p>${GM_NOTE}</p>`, biography: 'Keeps a knife in her boot.' });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    const result = await finalizeEntity('connection', actor.id, cs);
    expect(result).toMatchObject({ ok: true, reason: 'finalized' });            // control: Finalise ran
    expect(String(actor.system.biography)).toContain('Role: Smuggler');          // control: the Characteristics are seeded
    expect(getConnection(actor.id).finalizedAt).toBeTruthy();

    expect(String(actor.system.biography)).toContain('knife in her boot');
    expect(cardFor(actor.id)).toContain('owes Kira her life');
    expect(String(actor.system.notes)).toContain('owes Kira her life');
    // The introduction goes above the GM's paragraph, marked as the seed's.
    const notes = String(actor.system.notes);
    expect(notes.indexOf('counting cargo seals')).toBeLessThan(notes.indexOf('owes Kira her life'));
    expect(notes).toContain(`class="${SEED_INTRO_CLASS}"`);
    expect(notes).toMatch(new RegExp(`<p>${GM_NOTE}</p>$`));                       // the GM's paragraph is not marked
  });

  it("control: an unseeded card with an empty Notes tab gets the seed's introduction", async () => {
    const actor = makeNpc({ seeded: false, notes: '' });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await finalizeEntity('connection', actor.id, cs);
    expect(String(actor.system.notes)).toContain('counting cargo seals');
    expect(cardFor(actor.id)).toContain('counting cargo seals');
  });
});

describe('Y12 — ↻ Regenerate flavour keeps a detail the GM ⤴ Promoted to canon', () => {
  it("after Regenerate the promoted detail still reaches the narrator's card and the Notes tab", async () => {
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
    expect(String(actor.system.notes).startsWith(PORTRAIT)).toBe(true);         // control: the portrait is kept (V30)

    expect(String(actor.system.notes)).toContain('hidden cache');
    expect(cardFor(actor.id)).toContain('hidden cache');
  });

  it('a second Regenerate replaces only its own introduction — once, the rest kept in place', async () => {
    const actor = makeNpc({ seeded: true, notes: `${PORTRAIT}<p>${GM_NOTE}</p>` });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await finalizeEntity('connection', actor.id, cs, { force: true });
    const once = String(actor.system.notes);
    await finalizeEntity('connection', actor.id, cs, { force: true });
    const twice = String(actor.system.notes);

    expect(twice).toBe(once);                                                    // same rolls, same prose: nothing stacks
    expect(count(twice, 'counting cargo seals')).toBe(1);
    expect(count(twice, 'owes Kira her life')).toBe(1);
    expect(twice.startsWith(PORTRAIT)).toBe(true);
  });

  it("control: Regenerate rewrites the seed's own introduction (its old text gone) and keeps the portrait", async () => {
    const actor = makeNpc({ seeded: true, notes: `${PORTRAIT}${markSeedIntro('<p>Old intro.</p><p><em>she/her &middot; Wary</em></p>')}` });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const result = await finalizeEntity('connection', actor.id, cs, { force: true });
    expect(result).toMatchObject({ ok: true, reason: 'regenerated' });
    expect(String(actor.system.notes).startsWith(PORTRAIT)).toBe(true);
    expect(String(actor.system.notes)).toContain('counting cargo seals');
    expect(String(actor.system.notes)).not.toContain('Old intro.');
  });

  it("an introduction written before the mark is kept — the new one goes above it, nothing is lost", async () => {
    const actor = makeNpc({ seeded: true, notes: `${PORTRAIT}<p>Old intro.</p>` });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await finalizeEntity('connection', actor.id, cs, { force: true });
    const notes = String(actor.system.notes);
    expect(notes.startsWith(PORTRAIT)).toBe(true);
    expect(notes).toContain('Old intro.');
    expect(notes.indexOf('counting cargo seals')).toBeLessThan(notes.indexOf('Old intro.'));
  });

  it("the mark survives the sheet editor's normalising, and the paragraph the GM starts after it is theirs", async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const actor = makeNpc({ seeded: true, notes: '' });
    await finalizeEntity('connection', actor.id, cs, { force: true });
    // What the Notes editor (Foundry's ProseMirror) saves after the GM types a
    // paragraph at the end: every element's class kept (its other attributes
    // reordered, a class beside it), `&middot;` as the character, and the new
    // paragraph — Enter at the end of a block — a plain one.
    const edited = String(actor.system.notes)
      .replace(new RegExp(`<p class="${SEED_INTRO_CLASS}">`, 'g'), `<p style="text-align: justify" class="lead ${SEED_INTRO_CLASS}">`)
      .replace(/&middot;/g, '·')
      + `<p>${GM_NOTE}</p>`;
    await actor.update({ 'system.notes': edited });

    await finalizeEntity('connection', actor.id, cs, { force: true });
    const notes = String(actor.system.notes);
    expect(count(notes, 'counting cargo seals')).toBe(1);
    expect(notes).not.toContain('text-align: justify');                         // the old introduction is gone
    expect(notes).toContain(GM_NOTE);
  });

  it('Characteristics: the seed rewrites its own lines once; a line the GM typed or changed stays', async () => {
    const actor = makeNpc({ seeded: true, biography: 'Pronouns: she/her\nRole: Smuggler\nRole: ex-navy pilot\nKeeps a knife in her boot.' });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await finalizeEntity('connection', actor.id, cs, { force: true });
    const bio = String(actor.system.biography);
    expect(count(bio, 'Pronouns: she/her')).toBe(1);
    expect(count(bio, 'Role: Smuggler')).toBe(1);
    expect(bio).toContain('Role: ex-navy pilot');
    expect(bio).toContain('Keeps a knife in her boot.');
    expect(bio.indexOf('Goal: Pay a debt')).toBeLessThan(bio.indexOf('Keeps a knife'));
  });
});

describe("D4 — a ship made by hand: ✦ Finalise rolls its identity and keeps the GM's Notes", () => {
  it('Finalise seeds it (type / first look / mission, an introduction above the GM\'s paragraph); Regenerate rewrites only the introduction', async () => {
    const actor = makeHandMadeShip('<p>The Kestrel was Kira\'s father\'s ship; she will not sell it.</p>');
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await registerStarshipActorLight(actor, cs);                                // the createActor hook, Auto-Seed off

    const first = await finalizeEntity('ship', actor.id, cs);
    expect(first).toMatchObject({ ok: true, reason: 'finalized', artTriggered: true });
    expect(getShip(actor.id).type).toBe('Hauler — Heavy transport');
    expect(getShip(actor.id).mission).toBe('Transport cargo');
    expect(String(actor.system.notes)).toContain("father's ship");
    expect(String(actor.system.notes)).toContain('hull plates scarred');

    // An `!ship envision` section, then ↻ Regenerate — what the walkthrough's
    // "add more detail later" leads to.
    await appendNotesSection(actor, 'Envisioned captain', '<p>The captain hums old freighter shanties.</p>');
    const second = await finalizeEntity('ship', actor.id, cs, { force: true });
    expect(second).toMatchObject({ ok: true, reason: 'regenerated' });
    const notes = String(actor.system.notes);
    expect(count(notes, 'hull plates scarred')).toBe(1);
    expect(notes).toContain("father's ship");
    expect(notes).toContain('freighter shanties');
  });

  it('control: an Auto-Seeded ship (identity rolled, its introduction written) is still only stamped (X34)', async () => {
    const actor = makeHandMadeShip('<p>A battered hauler, all patched plates.</p>');
    actor.flags[MODULE_ID] = { entityType: 'ship', entityId: 'rec-k', ship: { _id: 'rec-k', name: 'Kestrel', type: 'Hauler', firstLook: 'Patched', mission: 'Cargo' } };
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const result = await finalizeEntity('ship', actor.id, cs);
    expect(result).toMatchObject({ ok: true, reason: 'finalized', artTriggered: false });
    expect(String(actor.system.notes)).toBe('<p>A battered hauler, all patched plates.</p>');
  });
});

describe('writeSeedIntro', () => {
  const intro = markSeedIntro('<p>New intro.</p><p><em>facts</em></p>');
  const BLOCK = '<div class="sf-ship-portrait"><img src="a.png"/></div>';

  it("replaces the seed's elements where the first stood and keeps everything else in place", () => {
    const tab = `${BLOCK}<p>GM above.</p>${markSeedIntro('<p>Old.</p>')}<p>GM between.</p>${markSeedIntro('<p><em>old facts</em></p>')}<hr><h4>✦ History</h4><p>Beat.</p>`;
    expect(writeSeedIntro(tab, intro))
      .toBe(`${BLOCK}<p>GM above.</p>${intro}<p>GM between.</p><hr><h4>✦ History</h4><p>Beat.</p>`);
  });

  it('prepends on an unmarked tab — below the portrait block, which stays once', () => {
    expect(writeSeedIntro(`${BLOCK}<p>Mine.</p>`, intro)).toBe(`${BLOCK}${intro}<p>Mine.</p>`);
    expect(writeSeedIntro('<p>Mine.</p>', intro)).toBe(`${intro}<p>Mine.</p>`);
    expect(writeSeedIntro('', intro)).toBe(intro);
    expect(writeSeedIntro(undefined, intro)).toBe(intro);
  });

  it('takes a marked list whole, nested list included, and nothing after an element that never closes', () => {
    const list = `<ul class="${SEED_INTRO_CLASS}"><li><p>Type</p><ul><li>nested</li></ul></li><li>Mission</li></ul>`;
    expect(writeSeedIntro(`${list}<ul><li>GM bullet</li></ul>`, intro)).toBe(`${intro}<ul><li>GM bullet</li></ul>`);
    expect(writeSeedIntro(`<p class="${SEED_INTRO_CLASS}">unclosed<p>GM text</p>`, intro)).toContain('GM text');
  });

  it('knows the mark by its class token, not a look-alike', () => {
    const tab = `<p class="${SEED_INTRO_CLASS}-end">Mine.</p><p data-class="${SEED_INTRO_CLASS}">Mine too.</p>`;
    expect(writeSeedIntro(tab, intro)).toBe(`${intro}${tab}`);
    expect(writeSeedIntro(`<p class='x ${SEED_INTRO_CLASS}'>Old.</p><p>Mine.</p>`, intro)).toBe(`${intro}<p>Mine.</p>`);
  });
});
