/**
 * STARFORGED COMPANION
 * tests/unit/pacedRollGmPressKeepsTypist.test.js
 *
 * Issue #362 AC74 PACED-ROLL-GM-PRESS-SPEAKS-AS-FIRST-PC (an incomplete fix of
 * issue #348 PT14). A player with no character of their own ("Pat") types a
 * line; the narrator's paced card answers it with a "Roll <move>" button and
 * names no roller (`actorId: null`). The GM presses it at a table with other
 * players' characters. The button relays the presser's PC (index.js
 * clickerActorId), and a GM always resolves one — a GM owns every Actor, so
 * the ladder ends on the first PC: applyCardRollerFollowup had an `actor`,
 * never read the line's speaker (PT14's fix), and posted Pat's words as Kira
 * — whose move it then was. Now a GM's press of a player's own line with no
 * PC on its card speaks as the line was typed and names its typist
 * (`lineAuthorId`); the pipeline rolls it as the typist's (speaker.js) — a
 * PC-less player's line at a table of several is not rolled as another
 * player's character (issue #326 D8): the no-character notice, the card's
 * Roll handed back. The "Not rolled" notice's "Narrate it — no move" is the
 * same follow-up.
 *
 * Booted GM + two-player tables (tests/helpers/multiClient.js), the first
 * block from the audit's probe (tests/probes/movb/pacedRollGmPressSpeaker.probe.js).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const LINE = "We're in — I take the hatch.";
const forcedPosts = () => table.cards(f => f.forcedMoveId === 'face_danger');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset({ session = false } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: session, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  if (session) {
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    scriptClaude(table, { fallback: () => 'The hatch gives.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  }
  silenceConsoleErrors();
}

async function pacedCardFor({ actorId = null } = {}) {
  await table.client('pl-1').chat(LINE, { speaker: { alias: 'Pat' } });   // Pat's line, typed with no PC
  await table.settle();
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: '<div class="sf-narration-card sf-narration-card--paced"><p>The hatch gives.</p>'
      + '<button type="button" data-action="sf-paced-roll">Roll Face Danger</button></div>',
    flags: { [MODULE_ID]: { narratorCard: true, pacedNarrative: true, narrationText: 'The hatch gives.',
      playerText: LINE, actorId, suggestedMove: 'face_danger', sessionId: 'sess-1' } },
  }));
  await table.settle();
  return card;
}
async function gmPresses(card, action = 'sf-paced-roll') {
  await table.client('gm-1').click(card.id ?? card._id, `[data-action="${action}"]`);
  await table.settle(); await table.drain();
}

describe('issue #362 AC74 — a GM\'s Roll on a PC-less player\'s line posts it as that player', () => {
  // No session begun: the forced move the press posts is held, not rolled.
  beforeEach(() => reset());

  it('control: in a world with no characters, the GM\'s press keeps the speaker the line was typed under', async () => {
    const card = await pacedCardFor();
    await gmPresses(card);
    expect(forcedPosts()).toHaveLength(1);
    expect(forcedPosts()[0].speaker?.alias).toBe('Pat');
    // The Roll posts the move rolled from the offer, its line on the flags (OFFER-FLOW-FRICTION, offerLine.js).
    expect(forcedPosts()[0].content).toContain('rolled from the offer above');
    expect(forcedPosts()[0].flags[MODULE_ID].offerLine).toBe(LINE);
  }, 30_000);

  it('control: a card that names its roller is posted as that roller', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    const card = await pacedCardFor({ actorId: 'pc-kira' });
    await gmPresses(card);
    expect(forcedPosts()[0].speaker).toMatchObject({ actor: 'pc-kira', alias: 'Kira' });
    expect(forcedPosts()[0].flags[MODULE_ID].lineAuthorId).toBeUndefined();
  }, 30_000);

  it('with other players\' characters at the table, the GM\'s press posts Pat\'s line as Pat, naming its typist', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
    const card = await pacedCardFor();
    await gmPresses(card);
    expect(forcedPosts()).toHaveLength(1);
    // The Roll posts the move rolled from the offer, its line on the flags (OFFER-FLOW-FRICTION, offerLine.js).
    expect(forcedPosts()[0].content).toContain('rolled from the offer above');
    expect(forcedPosts()[0].flags[MODULE_ID].offerLine).toBe(LINE);
    // It spoke as { actor: 'pc-kira', alias: 'Kira' } — another player's character (AC74).
    expect(forcedPosts()[0].speaker?.alias, 'the line keeps the speaker it was typed under').toBe('Pat');
    expect(forcedPosts()[0].speaker?.actor ?? null, "not another player's character").toBe(null);
    expect(forcedPosts()[0].flags[MODULE_ID].lineAuthorId).toBe('pl-1');
  }, 30_000);

  it('a "Not rolled" notice\'s Narrate, pressed by a GM, posts the PC-less line as its typist too', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
    const notice = await table.client('gm-1').run(() => ChatMessage.create({
      content: '<div class="sf-ptp-card"><p>Not rolled.</p><button type="button" data-action="sf-narrate-no-move">Narrate it — no move</button></div>',
      flags: { [MODULE_ID]: { moveNotRolledNotice: true, narrateOffered: true, restoreLine: LINE, restoreLineFor: 'pl-1',
        lineActorId: null, lineAuthorId: 'pl-1', lineSpeaker: { alias: 'Pat' } } },
    }));
    await table.settle();
    await gmPresses(notice, 'sf-narrate-no-move');
    const [post] = table.cards(f => f.narrateOnly === true);
    expect(post?.speaker?.alias).toBe('Pat');
    expect(post?.speaker?.actor ?? null).toBe(null);
    expect(post?.flags[MODULE_ID].lineAuthorId).toBe('pl-1');
  }, 30_000);
});

describe('issue #362 AC74 — the line\'s move is its typist\'s', () => {
  beforeEach(() => reset({ session: true }));

  it('at a table of several PCs, a PC-less player\'s line is not rolled as another player\'s character: they are told, and the Roll is handed back', async () => {
    const kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, system: { momentum: { value: 2 }, edge: 2 } });
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
    const card = await pacedCardFor();
    await gmPresses(card);
    expect(table.cards(f => f.moveResolution), "nothing rolled for Kira").toEqual([]);
    expect(kira.system.momentum.value).toBe(2);
    const [notice] = table.cards(f => f.noCharacterNotice);
    expect(notice, 'the no-character notice').toBeTruthy();
    expect(notice.whisper).toContain('pl-1');
    expect(table.world.message(card.id ?? card._id).flags[MODULE_ID].rolled, 'the Roll is handed back').toBeFalsy();
  }, 30_000);

  it('control: in solo play (one PC), the line is rolled as the one PC, as a typed line of theirs would be', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, system: { momentum: { value: 2 }, edge: 2 } });
    const card = await pacedCardFor();
    await gmPresses(card);
    const [rolled] = table.cards(f => f.moveResolution);
    expect(rolled, 'the move was rolled').toBeTruthy();
    expect(rolled.flags[MODULE_ID].actorId).toBe('pc-kira');
    expect(table.cards(f => f.noCharacterNotice)).toEqual([]);
  }, 30_000);
});

describe('issue #362 AC74 — a typist is trusted only on a GM\'s post', () => {
  beforeEach(() => reset());

  it('a GM\'s post naming its typist is the typist\'s PC; a player\'s own message naming another user stays the player\'s', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 } });
    const c = table.client('gm-1');
    const speaker = await c.import('../../src/multiplayer/speaker.js');
    const resolved = await c.run(() => ({
      gmPost:   speaker.resolveSpeakerActorId({ author: game.users.get('gm-1'), speaker: { alias: 'Pat' },
        flags: { [MODULE_ID]: { lineAuthorId: 'pl-1' } } }, {}),
      forged:   speaker.resolveSpeakerActorId({ author: game.users.get('pl-1'), speaker: {},
        flags: { [MODULE_ID]: { lineAuthorId: 'pl-2' } } }, {}),
      gmOwnPost: speaker.resolveSpeakerActorId({ author: game.users.get('gm-1'), speaker: {} }, {}),
    }));
    expect(resolved.gmPost, "the typist's own PC, not the GM ladder's first").toBe('pc-ren');
    expect(resolved.forged, "a player's message cannot name another typist").toBe('pc-ren');
    expect(resolved.gmOwnPost, 'control: a GM\'s own post keeps the GM ladder').toBe('pc-kira');
  }, 30_000);
});
