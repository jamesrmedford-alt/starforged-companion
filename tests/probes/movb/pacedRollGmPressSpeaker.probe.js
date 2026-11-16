/**
 * MOVB-04 · PACED-ROLL-GM-PRESS-SPEAKS-AS-FIRST-PC (INCOMPLETE-FIX of issue #348 PT14, part 2)
 *
 * Scenario: a player with no character of their own ("Pat") types a line; the
 * narrator's paced card answers it with a "Roll <move>" button and names no
 * roller (`actorId: null`). The GM presses the button. The table has player
 * characters — other players' (any played world).
 *
 * Correct (known-issues PT14: "It now keeps the speaker the line was typed
 * under", cardActions.js speakerOfLine): the line is posted again under the
 * speaker it was typed under — Pat.
 * Today: the button's click relays the presser's PC (index.js clickerActorId),
 * and a GM always resolves one — a GM owns every Actor, so the ladder ends on
 * the first PC. applyCardRollerFollowup then has an `actor`, and `lineSpeaker`
 * (read only when there is none) is never consulted: Pat's words are posted
 * as another player's character, whose move it then is. The unit test for
 * PT14 calls applyPacedRoll with `actorId: null` by hand in a world with no
 * Actors, so it never sees what the real button sends.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const LINE = "We're in — I take the hatch.";
const forcedPosts = () => table.cards(f => f.forcedMoveId === 'face_danger');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // No session begun: the forced move the press posts is held, not rolled.
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: false, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
});

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
async function gmPressesRoll(card) {
  await table.client('gm-1').click(card.id ?? card._id, '[data-action="sf-paced-roll"]');
  await table.settle(); await table.drain();
}

describe('MOVB-04 PACED-ROLL-GM-PRESS-SPEAKS-AS-FIRST-PC', () => {
  it('control: in a world with no characters, the GM\'s press keeps the speaker the line was typed under', async () => {
    const card = await pacedCardFor();
    await gmPressesRoll(card);
    expect(forcedPosts()).toHaveLength(1);
    expect(forcedPosts()[0].speaker?.alias).toBe('Pat');
    expect(forcedPosts()[0].content).toBe(LINE);
  }, 30_000);

  it('control: a card that names its roller is posted as that roller', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    const card = await pacedCardFor({ actorId: 'pc-kira' });
    await gmPressesRoll(card);
    expect(forcedPosts()[0].speaker).toMatchObject({ actor: 'pc-kira', alias: 'Kira' });
  }, 30_000);

  it('with other players\' characters at the table, the GM\'s press still posts Pat\'s line as Pat', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
    const card = await pacedCardFor();
    await gmPressesRoll(card);
    expect(forcedPosts()).toHaveLength(1);
    expect(forcedPosts()[0].content).toBe(LINE);
    // FAILS today: speaker is { actor: 'pc-kira', alias: 'Kira' } — another player's character says it.
    expect(forcedPosts()[0].speaker?.alias, 'the line keeps the speaker it was typed under').toBe('Pat');
    expect(forcedPosts()[0].speaker?.actor ?? null, "not another player's character").toBe(null);
  }, 30_000);
});
