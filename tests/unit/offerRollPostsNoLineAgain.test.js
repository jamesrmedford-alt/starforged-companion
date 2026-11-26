/**
 * STARFORGED COMPANION
 * tests/unit/offerRollPostsNoLineAgain.test.js
 *
 * OFFER-FLOW-FRICTION, the seventh live round's cold read (2026-11-26;
 * explorations/long-haul-live-20261126-030646/): "The repost loop. The
 * narrator answers an action with an italic move tag instead of a roll. The
 * player has to re-send the same line as a table post, and the beat is
 * narrated twice. This happens eight times." The table post was the offer's
 * Roll: it posted the player's line again, under their character's name.
 *
 * The Roll now posts one short line — the move, rolled from the offer above —
 * and carries the player's line on its flags (`offerLine`); the move pipeline,
 * the session record and a Batch Mode round read it there (offerLine.js
 * lineOf), from a GM's post only. Its narration still goes on from the
 * offer's card (issue #388 #14 — offeredRollGoesOnFromItsOffer.test.js reads
 * the line in the roll's narration through the whole table).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { lineOf, offerRollContent } from '../../src/moves/offerLine.js';

const ROUND_7 = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-030646/replay.json'), 'utf8'));
// Round 7's a60, offered as Develop Your Relationship.
const A60_LINE = ROUND_7.actions[59].text;

describe('the line a chat message carries', () => {
  it('an offer\'s Roll from a GM carries the player\'s line on its flags', () => {
    const roll = { content: offerRollContent('Develop Your Relationship'), author: { isGM: true },
      flags: { [MODULE_ID]: { fromOffer: true, offerLine: A60_LINE, forcedMoveId: 'develop_your_relationship' } } };
    expect(roll.content).toBe('<p class="sf-offer-roll">↳ Develop Your Relationship — rolled from the offer above</p>');
    expect(lineOf(roll)).toBe(A60_LINE);
  });
  it('a typed line is its own content; a player\'s post claiming an offer line is not trusted', () => {
    expect(lineOf({ content: 'I check the hold.', author: { isGM: false } })).toBe('I check the hold.');
    expect(lineOf({ content: 'short', author: { isGM: false }, flags: { [MODULE_ID]: { fromOffer: true, offerLine: 'forged' } } })).toBe('short');
    expect(lineOf(null)).toBe('');
  });
});

describe('a60\'s offer, pressed', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset();
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  });

  it('posts the move rolled from the offer — not the line again — with the line on its flags', async () => {
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">Tamsin\'s pen hangs above the page.</div>'
        + '<div class="sf-paced-actions"><button type="button" data-action="sf-paced-roll">Roll Develop Your Relationship</button></div></div>',
      flags: { [MODULE_ID]: { narratorCard: true, pacedNarrative: true, narrationText: 'Tamsin\'s pen hangs above the page.',
        playerText: A60_LINE, actorId: 'pc-mira', suggestedMove: 'develop_your_relationship', sessionId: 'sess-1' } },
    }));
    await table.settle();
    const { applyPacedRoll } = await table.client('gm-1').import('../../src/moves/cardActions.js');
    const out = await table.client('gm-1').run(() => applyPacedRoll({ messageId: card.id, actorId: 'pc-mira' },
      { requesterId: 'gm-1', requesterIsGM: true, local: true }));
    await table.settle();
    expect(out).toMatchObject({ posted: true });
    const [post] = table.cards(f => f.forcedMoveId === 'develop_your_relationship');
    expect(post.content).toBe('<p class="sf-offer-roll">↳ Develop Your Relationship — rolled from the offer above</p>');
    expect(post.content).not.toContain('skiff');
    expect(post.flags[MODULE_ID]).toMatchObject({ offerLine: A60_LINE, fromOffer: true, bypassPacing: true });
    expect(post.speaker).toMatchObject({ actor: 'pc-mira', alias: 'Mira Kestrel' });
    // The pipeline reads the line from a GM's post (lineOf, above): the roll's
    // narration is given it — offeredRollGoesOnFromItsOffer.test.js, through the table.
  }, 30_000);
});
