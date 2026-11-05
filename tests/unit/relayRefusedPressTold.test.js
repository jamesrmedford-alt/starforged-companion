/* global makeTestActor, silenceConsoleErrors */
/**
 * Known-issues RELAY-REFUSED-PRESS-UNTOLD (found while fixing issue #338) — a
 * card press the canonical GM refuses for whose the card is is told to the
 * presser, once.
 *
 * Ren's player pressed a button on Kira's card — ⚔ Attempt to Finish the
 * Fight (issue #338 D1), a way-out move or ⚔ Battle instead (issue #335 Y11),
 * 🏁 Attempt to Fulfill, a 🔁 Recommit, a picker, a Burn or a suffer pick.
 * The canonical GM refused it (`not-owner`; `no-actor` / `not-a-pc` when the
 * character the card is for is gone), logged it on the GM's console only,
 * and the relay has no ack: the button re-armed 15 s later with nothing
 * said. The relay dispatch now whispers the presser — and the GMs, as the
 * module's refusal notices do (issue #329 X07 / X14, #326 D8) — once per
 * refused press, saying whose button it is. A handler names the refusal
 * (`refusePress`); runGmAction, the one path every relayed and local action
 * takes, tells.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { runGmAction, _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM   = { id: 'gm-1', name: 'Gina',  isGM: true,  active: true };
const PAT  = { id: 'pl-1', name: 'Pat',   isGM: false, active: true };
const QUIN = { id: 'pl-2', name: 'Quinn', isGM: false, active: true };

const notices  = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.pressRefusedNotice);
const nonNotes = () => ChatMessage._created.filter(m => !m.flags?.[MODULE_ID]?.pressRefusedNotice);

function makeCard(id, flags, content = '') {
  const msg = {
    id, content, flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        if (path === 'content') { msg.content = val; continue; }
        const parts = path.split('.');
        let t = msg;
        for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
        t[parts.at(-1)] = val;
      }
    }),
  };
  return msg;
}

let cards;
const onTheTable = (...msgs) => {
  cards = msgs;
  game.messages = { contents: msgs, get: (id) => msgs.find(m => m.id === id) ?? null };
  return msgs[0];
};

const vow = (id, name) => ({
  id, name, type: 'progress', flags: { [MODULE_ID]: { vowId: id } },
  system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
  update: async () => {}, setFlag: async () => {},
});

// Each relayed card press that refuses a crewmate: the kind, Kira's card, and the press.
const KIRA = 'pc-kira';
const PRESSES = [
  ['tda.attempt',          { combatMoveCard: true, actorId: KIRA }],
  ['expedition.finish',    { expeditionProgressCard: true, trackId: 'exp-1', trackLabel: 'The Drift', actorId: KIRA }],
  ['vow.swearRoll',        { playerVowCard: true, vowName: 'Find Chen', vowId: 'vow-kira', actorId: KIRA }],
  ['paced.roll',           { pacedNarrative: true, suggestedMove: 'face_danger', playerText: 'I dive through.', actorId: KIRA }],
  ['whichFight.pick',      { whichFightCard: true, moveId: 'take_decisive_action', actorId: KIRA, fights: [{ id: 'fight-1', label: 'Corsairs' }] }, { trackId: 'fight-1' }],
  ['fulfilVow.attempt',    { milestoneSuggestion: { eligible: true, vowItemId: 'vow-kira' }, actorId: KIRA }],
  ['milestone.suggestion', { milestoneSuggestion: { eligible: true }, actorId: KIRA }],
  ['fulfilVow.pick',       { whichVowCard: true, actorId: KIRA, choices: [{ itemId: 'vow-kira', name: 'Find Chen' }] }, { itemId: 'vow-kira' }],
  ['legacy.pick',          { whichLegacyCard: true, actorId: KIRA, tracks: [{ track: 'quests', label: 'Quests' }] }, { track: 'quests' }],
  ['waypoint.oracle',      { waypointOracleCard: 'make_a_discovery', actorId: KIRA }],
  ['combatTrack.battle',   { combatTrackCard: true, created: true, trackId: 'fight-1', actorId: KIRA }],
  ['wayOut.pick',          { wayOutCard: true, actorId: KIRA }, { moveId: 'face_danger' }],
  ['vow.recommit',         { vowRecommitOfferCard: true, vowName: 'Find Chen', itemId: 'vow-kira', actorId: KIRA }],
  ['bond.recommit',        { bondRecommitOfferCard: true, hostId: 'conn-1', actorId: KIRA }],
  ['milestone.pick',       { milestonePicker: true, choices: [{ vowId: 'vow-kira', actorId: KIRA, marks: 1 }] }, { vowId: 'vow-kira', actorId: KIRA }],
  ['suffer.pick',          { sufferCard: true, sufferPrompt: { kind: 'any', amount: 1, count: 1 }, executorOpts: {}, actorId: KIRA, moveId: 'face_danger', pickedIndices: [], resolved: false },
    { pickKind: 'any', sufferId: 'lose_momentum' }],
  ['move.burnMomentum',    { burn: {
    canBurn: true, challengeDice: [2, 7], momentum: 8, outcomeMomentum: 1, markedImpactCount: 0, moveId: 'gather_information',
    originalOutcome: 'weak_hit', originalConsequences: { momentumChange: 1 }, previewOutcome: 'strong_hit',
    originalApplied: true, actorId: KIRA, resolutionId: null, ptpReversals: null } }],
  ['move.improveResult',   { improve: {
    canImprove: true, improveTo: 'strong_hit', moveId: 'gather_information', isMatch: false, originalOutcome: 'weak_hit',
    originalConsequences: { momentumChange: 1 }, originalApplied: true, actorId: KIRA, resolutionId: null, consumed: false } }],
];

beforeEach(() => {
  ChatMessage._reset();
  _resetGmRelayForTests();
  game.users._set([GM, PAT, QUIN]);
  game.user = GM;
  game.actors._reset();
  const kira = makeTestActor({ id: KIRA, name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow('vow-kira', 'Find Chen')] } });
  const ren  = makeTestActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
  game.actors._setAll([kira, ren]);
  invalidateActorCache(KIRA); invalidateActorCache('pc-ren');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, characterIds: [KIRA, 'pc-ren'] });
  silenceConsoleErrors();
});

describe("Ren's player presses a button on Kira's card: the GM refuses it and tells them whose it is", () => {
  it.each(PRESSES)('%s — one whisper to the presser and the GMs, naming Kira; nothing else posted', async (kind, flags, extra = {}) => {
    onTheTable(makeCard('card-1', flags));
    const res = await runGmAction(kind, { messageId: 'card-1', ...extra }, { requesterId: 'pl-2' });
    expect(res.reason).toBe('not-owner');

    const [note, ...more] = notices();
    expect(note, 'the presser is told').toBeTruthy();
    expect(more).toHaveLength(0);
    expect(new Set(note.whisper)).toEqual(new Set(['pl-2', 'gm-1']));
    expect(note.content).toContain('Kira');
    expect(note.content).toMatch(/only Kira&rsquo;s player or a GM/);
    expect(note.content).toContain('Quinn');
    expect(nonNotes()).toHaveLength(0);
  });

  it('two refused presses are two notices — one each', async () => {
    onTheTable(makeCard('card-1', PRESSES[0][1]));
    await runGmAction('tda.attempt', { messageId: 'card-1' }, { requesterId: 'pl-2' });
    await runGmAction('tda.attempt', { messageId: 'card-1' }, { requesterId: 'pl-2' });
    expect(notices()).toHaveLength(2);
  });

  it('a card that names no character of theirs is a GM\'s: the presser is told so', async () => {
    onTheTable(makeCard('card-1', { connectionPicker: true, pickAction: 'develop', choices: [{ hostId: 'conn-1', name: 'Sable' }] }));
    const res = await runGmAction('connection.pick', { messageId: 'card-1', hostId: 'conn-1', actorId: null }, { requesterId: 'pl-2' });
    expect(res.reason).toBe('not-owner');
    const [note] = notices();
    expect(note.content).toMatch(/names no character of yours/);
    expect(new Set(note.whisper)).toEqual(new Set(['pl-2', 'gm-1']));
  });

  it('a card whose character is gone: the presser is told it is gone (no-actor, not-a-pc)', async () => {
    onTheTable(makeCard('card-1', { ...PRESSES.find(p => p[0] === 'suffer.pick')[1], actorId: 'pc-gone' }));
    expect((await runGmAction('suffer.pick', { messageId: 'card-1', pickKind: 'any', sufferId: 'lose_momentum' }, { requesterId: 'pl-1' })).reason).toBe('no-actor');
    onTheTable(makeCard('card-2', { combatMoveCard: true, actorId: 'pc-gone' }));
    expect((await runGmAction('tda.attempt', { messageId: 'card-2' }, { requesterId: 'pl-1' })).reason).toBe('not-a-pc');

    const told = notices();
    expect(told).toHaveLength(2);
    for (const note of told) {
      expect(note.content).toMatch(/no longer one of the table&rsquo;s player characters/);
      expect(new Set(note.whisper)).toEqual(new Set(['pl-1', 'gm-1']));
    }
  });

  it('control: Kira\'s player\'s press lands and nobody is told anything', async () => {
    onTheTable(makeCard('card-1', PRESSES[0][1]));
    const res = await runGmAction('tda.attempt', { messageId: 'card-1' }, { requesterId: 'pl-1' });
    expect(res).toEqual({ posted: true });
    expect(notices()).toHaveLength(0);
  });

  it('control: a GM\'s press on a suffer card whose character is gone retires the card, which says so — no second notice', async () => {
    const card = onTheTable(makeCard('card-1', { ...PRESSES.find(p => p[0] === 'suffer.pick')[1], actorId: 'pc-gone' }));
    await runGmAction('suffer.pick', { messageId: 'card-1', pickKind: 'any', sufferId: 'lose_momentum' }, { requesterId: 'gm-1', local: true });
    expect(card.content).toMatch(/no longer in the world/);
    expect(notices()).toHaveLength(0);
  });

  it('control: a press refused for another reason (already pressed) is not told as whose', async () => {
    onTheTable(makeCard('card-1', { ...PRESSES[0][1], decisiveActionAttempted: true }));
    await runGmAction('tda.attempt', { messageId: 'card-1' }, { requesterId: 'pl-2' });
    expect(notices()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Across a booted table: the press relayed over the socket
// ─────────────────────────────────────────────────────────────────────────────

describe('on a booted table, the relayed refusal reaches the presser', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rr-s1', sessionNumber: 1,
        currentSceneId: 'rr-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true });
    scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  it("Ren's player's ⚔ Attempt to Finish the Fight on Kira's card: refused, and whispered to them and the GM — not to Kira's player", async () => {
    const id = (await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-move-result"><button type="button" class="sf-followup-btn" data-action="sf-take-decisive-action">⚔ Attempt to Finish the Fight</button></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, combatMoveCard: true, resolutionId: 'res-1', actorId: 'pc-kira' } },
    }))).id;
    await table.settle();

    table.client('pl-2').click(id, '[data-action="sf-take-decisive-action"]');
    await table.settle(); await table.drain();

    expect(table.cards(f => f.forcedMoveId === 'take_decisive_action')).toHaveLength(0);
    const told = table.cards(f => f.pressRefusedNotice);
    expect(told).toHaveLength(1);
    expect(told[0].content).toContain('Kira');
    expect(new Set(told[0].whisper)).toEqual(new Set(['pl-2', 'gm-1']));
  }, 30_000);
});
