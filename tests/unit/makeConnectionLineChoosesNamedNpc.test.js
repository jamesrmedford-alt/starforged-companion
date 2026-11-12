/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionLineChoosesNamedNpc.test.js
 *
 * Issue #347 AB10 (MAKE-CONNECTION-WRONG-PENDING-NPC; the audit's
 * makeConnectionWrongPendingRow probe). A Make a Connection hit that creates
 * no one connects an NPC the move names whom the detection leaves out — a
 * row pending on a draft card (issue #325 W23) or an NPC the table already
 * knows (issue #345 AA19). The pending fallback walked the draft cards newest
 * first and confirmed the FIRST pending connection row named anywhere in the
 * player's line or the narrator's prose, and it ran before the known-NPC
 * step:
 *   - Ren: "I ask Sable Ortiz to vouch for me" — the narration has Dace Mirren
 *     watching from the bar: Dace's row, first on the card, was confirmed and
 *     bonded to Ren; Sable stayed pending;
 *   - Ren's hit with Kira's contact Vance, whose narration mentions pending
 *     Dace: Dace was bonded, and the move never reached Vance.
 * The move card said only "Connection made".
 *
 * connectNamedFigure now gathers every NPC the move names (pending rows, listed
 * NPCs, dismissed rows): the player's line decides when it names exactly one;
 * a line naming none leaves it to the narration when that names exactly one;
 * otherwise none is guessed and the GMs are told.
 *
 * Single GM client; api-proxy mocked (a compliant detector: the NPCs are
 * pending drafts, so it returns no entity).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DETECTION = JSON.stringify({
  entities: [], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const narrationFor = (prose) => `${prose}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
let narration = '';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = JSON.stringify(body?.messages ?? []);
    const text = user.includes('ENTITY TYPES TO DETECT') ? DETECTION
      : String(body?.model ?? '').includes('haiku') ? '{}'
      : narration;
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narrateResolution } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';

function pc(id, name) {
  const a = global.makeTestActor({ id, type: 'character', name });
  global.game.actors._set(id, a);
  return a;
}
const bondNames = (actor) => (actor.items.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const npcCards = (name) => global.game.actors.filter(a => a.name === name && a.flags?.[MODULE]?.entityType === 'connection');
const npcCard = (name) => npcCards(name)[0];
const notices = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.knownNpcsConnectionNotice);

/** The GM's draft card from an earlier narration: its rows, all pending. */
function draftCard(names) {
  const card = {
    id: 'msg-draft-1',
    flags: { [MODULE]: { draftEntityCard: true, source: 'move_resolution', actorId: 'pc-kira',
      drafts: names.map((name, index) => ({ type: 'connection', name, description: `${name}, seen at the salvage yard.`, index, status: 'pending' })) } },
  };
  card.update = async (changes) => { if (typeof changes?.content === 'string') card.content = changes.content; return card; };
  card.setFlag = async (mod, key, value) => { card.flags[mod][key] = value; return card; };
  return card;
}
const rowStatus = (card, name) => card.flags[MODULE].drafts.find(d => d.name === name)?.status;
const showCards = (...cards) => {
  global.game.messages = { contents: cards, get: (id) => cards.find(c => c.id === id) ?? null };
};

const RESOLUTION = {
  _id: 'res-1', moveId: 'make_a_connection', moveName: 'Make a Connection',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', statUsed: 'heart', statValue: 2,
  playerNarration: 'I ask Sable Ortiz to vouch for me with the salvage guild.',
};
const RELEVANCE = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [],
  needsClarification: false, referenceType: 'none' };
const UNNAMED_LINE = 'I ask around the salvage guild for someone to vouch for me.';

async function renHits(line = RESOLUTION.playerNarration) {
  await narrateResolution({ ...RESOLUTION, playerNarration: line }, global.game.settings.get(MODULE, 'campaignState'),
    { relevance: RELEVANCE, speakerActorId: 'pc-ren' });
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.claudeApiKey`, 'sk-ant-test');
  store.set(`${MODULE}.chronicleAutoEntry`, false);
  store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    connectionIds: [],
  });
});

afterEach(() => { delete global.game.messages; });

describe('Make a Connection, and a narration that names two pending draft NPCs', () => {
  it('control: the narration names only Sable — her row is confirmed, bonded to Ren; Dace stays pending', async () => {
    silenceConsoleErrors();   // unrelated best-effort passes log in this bare unit env
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    showCards(card);
    narration = narrationFor('Sable Ortiz looks you over, then shakes your hand: she will vouch for you.');

    await renHits();

    expect(bondNames(ren)).toEqual(['Sable Ortiz']);
    expect({ sable: rowStatus(card, 'Sable Ortiz'), dace: rowStatus(card, 'Dace Mirren') })
      .toEqual({ sable: 'confirmed', dace: 'pending' });
    expect(npcCard('Dace Mirren')).toBeFalsy();
  });

  it('the narration also mentions pending Dace Mirren — Sable, whom Ren\'s line names, is his connection; Dace is untouched', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    showCards(card);
    narration = narrationFor('Sable Ortiz looks you over while Dace Mirren watches from the bar. Then she shakes your hand: she will vouch for you.');

    await renHits();

    expect({
      daceCard:  !!npcCard('Dace Mirren'),
      daceRow:   rowStatus(card, 'Dace Mirren'),
      renBonds:  bondNames(ren).includes('Dace Mirren'),
    }, 'the NPC the roller never named is neither created, confirmed nor bonded').toEqual({
      daceCard: false, daceRow: 'pending', renBonds: false,
    });
    expect({ sable: rowStatus(card, 'Sable Ortiz'), renBonds: bondNames(ren) })
      .toEqual({ sable: 'confirmed', renBonds: ['Sable Ortiz'] });
    expect(notices(), 'nothing to tell the GMs').toHaveLength(0);
  });

  it("Ren's hit with Kira's contact Vance, whose narration mentions pending Dace: Vance — whom his line names — is made his connection", async () => {
    silenceConsoleErrors();
    const kira = pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    // Vance Oduya is on the table already — Kira's connection (issue #345 AA19's case).
    const state = global.game.settings.get(MODULE, 'campaignState');
    const { createConnection } = await import('../../src/entities/connection.js');
    const { registerConnectionOnActiveCharacter } = await import('../../src/entities/entityExtractor.js');
    const vance = await createConnection({ name: 'Vance Oduya', description: 'The dockmaster.' }, state);
    await registerConnectionOnActiveCharacter(vance, { actorId: 'pc-kira' });
    expect(bondNames(kira), 'Vance is Kira\'s connection (setup)').toEqual(['Vance Oduya']);

    const card = draftCard(['Dace Mirren']);
    showCards(card);
    narration = narrationFor('Vance Oduya hears you out while Dace Mirren watches from the bar. Then he nods: you have a friend on the docks.');

    await renHits('I ask Vance Oduya to put in a word for me on the docks.');

    expect({ renBonds: bondNames(ren), daceCard: !!npcCard('Dace Mirren'), daceRow: rowStatus(card, 'Dace Mirren') },
      'Ren is bonded to the NPC his line names, never to the bystander')
      .toEqual({ renBonds: ['Vance Oduya'], daceCard: false, daceRow: 'pending' });
    expect(npcCards('Vance Oduya'), 'no second Vance card').toHaveLength(1);
  });

  it('the narration names two pending rows and the line names neither: none is guessed, and the GMs are told which', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    showCards(card);
    narration = narrationFor('Sable Ortiz and Dace Mirren look you over; one of them will vouch for you.');

    await renHits(UNNAMED_LINE);

    expect({ renBonds: bondNames(ren), sable: rowStatus(card, 'Sable Ortiz'), dace: rowStatus(card, 'Dace Mirren') })
      .toEqual({ renBonds: [], sable: 'pending', dace: 'pending' });
    expect(notices(), 'the GMs are told').toHaveLength(1);
    expect(String(notices()[0].content)).toContain('<strong>Dace Mirren</strong>, <strong>Sable Ortiz</strong>');
    expect(String(notices()[0].content)).toMatch(/New Entities card/);
  });

  it('the line names both pending rows: none is guessed, and the GMs are told', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    showCards(card);
    narration = narrationFor('Sable Ortiz and Dace Mirren trade a look, then both nod.');

    await renHits('I ask Sable Ortiz and Dace Mirren to vouch for me.');

    expect(bondNames(ren)).toEqual([]);
    expect(notices()).toHaveLength(1);
  });

  it('control: the line names nobody and the narration names one pending row — it is confirmed (W23)', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    showCards(card);
    narration = narrationFor('Sable Ortiz looks you over, then shakes your hand: she will vouch for you.');

    await renHits(UNNAMED_LINE);

    expect({ renBonds: bondNames(ren), sable: rowStatus(card, 'Sable Ortiz'), dace: rowStatus(card, 'Dace Mirren') })
      .toEqual({ renBonds: ['Sable Ortiz'], sable: 'confirmed', dace: 'pending' });
    expect(notices()).toHaveLength(0);
  });
});
