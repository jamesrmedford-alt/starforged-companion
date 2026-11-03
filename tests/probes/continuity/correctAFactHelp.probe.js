/**
 * PROBE — FC-05 CORRECT-A-FACT-UNREACHABLE (help journal vs narrator cards)
 * (src/help/helpJournal.js "Fact Continuity" + "Chat Commands" pages;
 *  src/narration/narrator.js postNarrationCard / postPacedNarrativeCard;
 *  src/factContinuity/chatCommands.js `!truth set` result card)
 *
 * What the user does: reads the in-game help — "Every narrator card carries a
 * Correct a fact button in its footer… with per-row Strike / Replace
 * actions" (Player: "Any except GM-asserted"), and `!truth strike
 * <id-prefix>` "Accepts a unique 4+ character ID prefix from the
 * Correct-a-fact dialog" — and looks for the button to strike a wrong fact.
 *
 * What happens: the button was removed from narrator cards on purpose in
 * v1.7.26 (CHANGELOG: "Correct a fact button removed from narrator cards").
 * The dialog now opens only from the ◈ Narrative Review card, which is
 * whispered to GMs and posted only for a high-confidence consistency-check
 * catch. A truth's id is shown nowhere else — not on the narrator card, not
 * in the ledger block, not even on the `!truth set` result card — so
 * `!truth strike` has no id to take in normal play, and a player has no way
 * to strike or replace a truth at all, though the help's permission table
 * promises it.
 *
 * What should happen: the help describes the affordance that exists (or the
 * affordance the help describes exists): what a narrator card shows matches
 * the help, and a struck-able truth's id is discoverable where `!truth strike`
 * says it is.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { PAGES } from '../../../src/help/helpJournal.js';
import { postNarrationCard } from '../../../src/narration/narrator.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const help = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
});

describe('the Correct-a-fact affordance the help describes', () => {
  it('a narrator card carries the Correct a fact button the help says every narrator card has', async () => {
    const claimsButton = /Every narrator card carries a <em>Correct a fact<\/em> button/.test(help('Fact Continuity'));
    expect(claimsButton).toBe(true);    // the help's promise, as written today
    const card = await postNarrationCard('The dockmaster waves you through.', { moveId: 'face_danger', outcome: 'strong_hit', _id: 'r1' },
      game.settings.get(MODULE_ID, 'campaignState'), { narrationId: 'nar-1' });
    const hasButton = /data-action="openCorrectionDialog"/.test(card.content);

    // Today: the help claims the button; the card has none (hasButton false).
    expect(hasButton).toBe(claimsButton);
  });

  it('the id `!truth strike` needs is shown when a truth is recorded with `!truth set`', async () => {
    await applyFactContinuityCommand({ text: '!truth set "the dockmaster" Owes the crew a favour' }, { requesterIsGM: true });
    const truth = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.at(-1);
    const card  = ChatMessage._created.at(-1);

    // Today: "Truth recorded: the dockmaster — Owes the crew a favour." — no id, so the
    // truth can never be struck by `!truth strike` without a review card's dialog.
    expect(card.content).toContain(truth.id.slice(0, 8));
  });
});
