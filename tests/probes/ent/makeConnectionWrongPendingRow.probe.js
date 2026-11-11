/**
 * PROBE (thirteenth audit, area ENT) — ENT: a Make a Connection hit whose
 * narration names TWO pending draft NPCs confirms and bonds whichever row
 * comes first on the newest card — not the one the player's line names.
 *
 * routeEntityDrafts → confirmNamedPendingConnection (issue #325 W23) walks the
 * draft cards newest first and their rows in order, and confirms the FIRST
 * pending connection row whose full name appears, whole words, anywhere in
 * `namingText` — the player's line AND the narrator's prose — then returns.
 * It never looks for a second named row. Its sibling for NPCs the table
 * already knows (connectKnownNpc, issue #345 AA19) guesses nothing when
 * several are named and whispers the GMs; a pending row has no such rule.
 *
 * Scenario (single GM client; api-proxy mocked):
 *   - The GM's newest draft card holds two pending rows, in this order:
 *     Dace Mirren (a guild enforcer), Sable Ortiz (a salvage broker).
 *   - Ren: "I ask Sable Ortiz to vouch for me with the salvage guild." —
 *     Make a Connection, strong hit.
 *   - The narrator: "Sable Ortiz looks you over while Dace Mirren watches
 *     from the bar. Then she shakes your hand…"
 * Correct: Dace Mirren — whom Ren's line never names — is not made Ren's
 * connection (Sable is, or none is guessed and the GMs are told).
 * Today: Dace Mirren's card is created and bonded to Ren; Sable stays pending.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A compliant detector: both NPCs are PENDING DRAFTS, so it returns no entity.
const DETECTION = JSON.stringify({
  entities: [], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const narrationFor = (prose) => `${prose}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
let narration = '';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = JSON.stringify(body?.messages ?? []);
    const text = user.includes('ENTITY TYPES TO DETECT') ? DETECTION
      : String(body?.model ?? '').includes('haiku') ? '{}'
      : narration;
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narrateResolution } from '../../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE = 'starforged-companion';

function pc(id, name) {
  const a = global.makeTestActor({ id, type: 'character', name });
  global.game.actors._set(id, a);
  return a;
}
const bondNames = (actor) => (actor.items.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const npcCard = (name) => global.game.actors.find(a => a.name === name && a.flags?.[MODULE]?.entityType === 'connection');

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

const RESOLUTION = {
  _id: 'res-1', moveId: 'make_a_connection', moveName: 'Make a Connection',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', statUsed: 'heart', statValue: 2,
  playerNarration: 'I ask Sable Ortiz to vouch for me with the salvage guild.',
};
const RELEVANCE = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [],
  needsClarification: false, referenceType: 'none' };

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

describe('ENT — Make a Connection, and a narration that names two pending draft NPCs', () => {
  it('control: the narration names only Sable — her row is confirmed, bonded to Ren; Dace stays pending', async () => {
    silenceConsoleErrors();   // unrelated best-effort passes log in this bare unit env
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };
    narration = narrationFor('Sable Ortiz looks you over, then shakes your hand: she will vouch for you.');

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    expect(bondNames(ren)).toEqual(['Sable Ortiz']);
    expect({ sable: rowStatus(card, 'Sable Ortiz'), dace: rowStatus(card, 'Dace Mirren') })
      .toEqual({ sable: 'confirmed', dace: 'pending' });
    expect(npcCard('Dace Mirren')).toBeFalsy();
  });

  it('the narration also mentions pending Dace Mirren — Dace is not made the connection of Ren, whose line names Sable', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = draftCard(['Dace Mirren', 'Sable Ortiz']);
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };
    narration = narrationFor('Sable Ortiz looks you over while Dace Mirren watches from the bar. Then she shakes your hand: she will vouch for you.');

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    expect({
      daceCard:  !!npcCard('Dace Mirren'),
      daceRow:   rowStatus(card, 'Dace Mirren'),
      renBonds:  bondNames(ren).includes('Dace Mirren'),
    }, 'the NPC the roller never named is neither created, confirmed nor bonded').toEqual({
      daceCard: false, daceRow: 'pending', renBonds: false,
    });
  });

  it("the pending-row fallback outranks the known NPC the move was with: Ren's hit with Kira's contact Vance bonds pending Dace instead", async () => {
    silenceConsoleErrors();
    const kira = pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    // Vance Oduya is on the table already — Kira's connection (issue #345 AA19's case).
    const state = global.game.settings.get(MODULE, 'campaignState');
    const { createConnection } = await import('../../../src/entities/connection.js');
    const { registerConnectionOnActiveCharacter } = await import('../../../src/entities/entityExtractor.js');
    const vance = await createConnection({ name: 'Vance Oduya', description: 'The dockmaster.' }, state);
    await registerConnectionOnActiveCharacter(vance, { actorId: 'pc-kira' });
    expect(bondNames(kira), 'Vance is Kira\'s connection (setup)').toEqual(['Vance Oduya']);

    const card = draftCard(['Dace Mirren']);
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };
    narration = narrationFor('Vance Oduya hears you out while Dace Mirren watches from the bar. Then he nods: you have a friend on the docks.');

    await narrateResolution(
      { ...RESOLUTION, playerNarration: 'I ask Vance Oduya to put in a word for me on the docks.' },
      global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    // Fix-agnostic: Vance (AA19's rule), or no one with the GMs told — never the bystander.
    expect({ renBondedToDace: bondNames(ren).includes('Dace Mirren'), daceCard: !!npcCard('Dace Mirren'), daceRow: rowStatus(card, 'Dace Mirren') },
      `Ren is bonded to the NPC his line names — or to no one — never to the bystander (Ren's bonds: ${bondNames(ren).join(', ') || 'none'})`)
      .toEqual({ renBondedToDace: false, daceCard: false, daceRow: 'pending' });
  });
});
