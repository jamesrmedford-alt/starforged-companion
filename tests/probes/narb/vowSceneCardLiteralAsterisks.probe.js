/**
 * NARB-03 · VOW-SCENE-CARD-LITERAL-ASTERISKS  (INCOMPLETE-FIX of issue #348 PT13)
 *
 * Scenario: the narrator writes Markdown emphasis in a vow-swearing scene — a
 * ship's name, a stressed word ("*Forgeborn*").
 *
 * Correct (known-issues PT13: "Every narrator-prose card sink now uses
 * [proseToHtml]"): the card shows the emphasis, as the move, paced, scene,
 * oracle, recap, galley and clock-vignette cards do — no literal asterisks.
 *
 * Today: narrateAndPostVowSwearing still builds its card with
 * `stripMarkup(text)` + a hand escape (narrator.js), so the oath scene shows
 * "*Forgeborn*" with its asterisks. (The Pay the Price trigger vignette card,
 * src/clocks/payThePriceClocks.js `escapeChatHtml(stripMarkup(text))`, is the
 * other sink the fix missed.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm } from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const PROSE = 'Kira lays her palm on the hull of the *Forgeborn* and says the words.';
const reply = () => ({ prose: PROSE, sidecar: { newTruths: [], stateChanges: [] } });
const cs = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));

describe('NARB-03 — a vow-swearing scene\'s card renders the narrator\'s emphasis', () => {
  it('control: an oracle follow-up\'s card renders *emphasis* as <em>', async () => {
    table.replies = reply;
    const { narrateOracleFollowup } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateOracleFollowup({
      kind: 'oracle_table', oracleName: 'Action + Theme', rolledLine: 'd100 = 12 → Guard Ship',
      speakerActorId: 'pc-kira', campaignState: cs(),
    }));
    const [card] = table.cards(f => f.oracleNarrationCard === true);
    expect(card.content).toContain('<em>Forgeborn</em>');
    expect(card.content).not.toContain('*Forgeborn*');
  }, 40_000);

  it('the vow scene card shows no literal asterisks', async () => {
    table.replies = reply;
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    const text = await onGm(table, () => narrateAndPostVowSwearing({
      vow: { name: 'Find the lost ark', rank: 'dangerous' }, campaignState: cs(), speakerActorId: 'pc-kira',
    }));
    expect(text).toBe(PROSE);
    const [card] = table.cards(f => f.vowSceneCard === true);
    expect(card, 'the oath scene posted').toBeTruthy();
    expect(card.flags[MODULE_ID].narrationText).toBe(PROSE);   // the stored prose keeps its markup
    expect(card.content).not.toContain('*Forgeborn*');
    expect(card.content).toContain('<em>Forgeborn</em>');
  }, 40_000);
});
