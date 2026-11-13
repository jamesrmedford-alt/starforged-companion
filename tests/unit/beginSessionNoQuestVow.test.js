/**
 * STARFORGED COMPANION
 * tests/unit/beginSessionNoQuestVow.test.js
 *
 * Issue #353 R3 — at Begin a Session, when no character has an open vow
 * besides a background vow, say so and offer Swear an Iron Vow.
 *
 * In the alpha 23 playtest none of a session's four hit cards offered Reach a
 * Milestone: Isaac had no open vow, so the campaign had no throughline in the
 * rules' own terms, and nothing said so. Begin a Session's dialog and card now
 * say so, and the dialog offers to swear one for the user's own character:
 * it goes on the sheet (actorBridge), where the canonical GM's createItem hook
 * posts its "🆕 New vow recorded" card with ⚔ Swear it (roll) — the path a
 * vow written on the sheet already takes.
 *
 * A background vow, for this check, is a character's first vow that is not
 * the shared inciting vow; the inciting vow is a quest (session/openThreads.js
 * questVows).
 *
 * Production entry point: openBeginSessionDialog on Pat's client (the Session
 * panel's Begin Session, `!begin-session`), on the multi-client harness.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
let table;

/** A vow Item on a sheet. */
const vowItem = (id, name, { rank = 'dangerous', completed = false, flags = {} } = {}) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank, current: 0, completed }, flags,
});
const BACKGROUND = () => vowItem('bg-kira', 'Avenge the Iron Hollow', { rank: 'epic' });
const INCITING   = (over = {}) => vowItem('inc-kira', 'Free Dani from the Hollow', {
  rank: 'formidable', flags: { [MODULE_ID]: { vowId: 'inc', sharedVow: true } }, ...over,
});

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

/** A fresh world before Begin, and Kira — Pat's — holding `vows`. */
async function seat(vows) {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, currentSessionId: 'bsq-s2', sessionNumber: 2, sessionActive: false,
    sessionStartedId: null, lastSessionTimestamp: new Date().toISOString(),
  } } } });
  return table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: vows } });
}

/** Open Begin a Session on `userId`'s client; `answer(dialog)` closes or submits it. Returns what it showed. */
async function begin(userId, answer = (d) => d.close()) {
  let shown = null;
  table.client(userId).answerDialogs((d) => {
    if (d.title !== 'Begin a Session') return d.close();
    shown = d.content;
    return answer(d);
  });
  const { openBeginSessionDialog } = await table.client(userId).import('../../src/safety/sessionLifecycleDialogs.js');
  await table.client(userId).run(() => openBeginSessionDialog());
  await table.settle();
  return shown ?? '';
}

const beginCards = () => table.cards(f => f.sessionLifecycleCard);

describe('Begin a Session with no vow in play (issue #353 R3)', () => {
  it('says so, and offers Pat a vow for Kira', async () => {
    await seat([BACKGROUND()]);
    const html = await begin('pl-1');
    expect(html).toMatch(/No vow in play/);
    expect(html).toMatch(/No character has an open vow besides a background vow/);
    expect(html).toMatch(/Swear an Iron Vow for Kira/);
    expect(html).toContain('name="newVow"');
  });

  it('Begin with a vow written: the card says no vow was in play, and the vow goes on Kira\'s sheet — whose card offers the swear roll', async () => {
    const kira = await seat([BACKGROUND()]);
    await begin('pl-1', d => d.submit({
      'input[name="newVow"]': '  Learn who sent the escort  ',
      'select[name="newVowRank"]': 'formidable',
    }));

    const card = beginCards().find(c => /Begin a Session/.test(c.content));
    expect(card.author).toBe('pl-1');
    expect(card.content).toMatch(/No character has a vow in play besides a background vow/);
    // The session began on the GM.
    expect(table.world.campaignState()).toMatchObject({ sessionActive: true, sessionStartedId: 'bsq-s2' });

    const sworn = kira.items.contents.find(i => i.name === 'Learn who sent the escort');
    expect(sworn).toMatchObject({ type: 'progress', system: { subtype: 'vow', rank: 'formidable' } });
    // A hand-made vow (no module vowId yet): the canonical GM's createItem
    // hook offers it the swear roll, as it does a vow written on the sheet.
    expect(sworn.flags?.[MODULE_ID]?.vowId).toBeUndefined();
    for (const c of table.connectedClients) c.run(() => Hooks.callAll('createItem', sworn, {}, 'pl-1'));
    await table.settle();
    const offered = table.cards(f => f.playerVowCard);
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ author: 'gm-1' });
    expect(offered[0].flags[MODULE_ID]).toMatchObject({ vowName: 'Learn who sent the escort', actorId: 'pc-kira' });
    expect(offered[0].content).toMatch(/Swear it \(roll\)/);
  });

  it('Begin with the vow left blank swears nothing — the card still says so', async () => {
    const kira = await seat([BACKGROUND()]);
    await begin('pl-1', d => d.submit({}));
    expect(kira.items.contents).toHaveLength(1);
    expect(beginCards().find(c => /Begin a Session/.test(c.content)).content).toMatch(/No character has a vow in play/);
  });

  it('a character with no vow at all is flagged too', async () => {
    await seat([]);
    expect(await begin('gm-1')).toMatch(/No vow in play/);
  });

  it('a fulfilled inciting vow leaves only the background vow: flagged', async () => {
    await seat([BACKGROUND(), INCITING({ completed: true })]);
    expect(await begin('pl-1')).toMatch(/No vow in play/);
  });
});

describe('Begin a Session with a quest in play says nothing of it (issue #353 R3)', () => {
  it('the shared inciting vow is a quest — even labelled the background vow for the narrator', async () => {
    await seat([INCITING()]);
    const html = await begin('pl-1');
    expect(html).not.toMatch(/No vow in play/);
    expect(html).not.toContain('name="newVow"');
  });

  it('a vow sworn after the background vow is a quest', async () => {
    await seat([BACKGROUND(), vowItem('v-beacon', 'Find the lost beacon')]);
    await begin('pl-1', d => d.submit({}));
    expect(beginCards().find(c => /Begin a Session/.test(c.content)).content).not.toMatch(/No character has a vow in play/);
  });
});
