/**
 * PROBE SC — PLAYER-VOW-CARD-RANK-NUMBER (WRONG-DETAIL, the U62 class)
 *
 * What the user does: a player adds a vow on their Starforged sheet (Progress
 * tab, rank Formidable).
 *
 * What happens: registerPlayerVowHook (createItem, canonical GM) posts the
 * "🆕 New vow recorded" card with `rank = item.system?.rank` — the vendor's
 * ChallengeRank NUMBER (1 troublesome … 5 epic; fields/ChallengeRank.ts) —
 * and buildPlayerVowSetupHtml prints it raw: `"Find the Wanderer" (3)`.
 * (Its stakes line is right: progressPerMilestoneLine runs rankName.)
 * Issue #321 U62 mapped readVows / readConnections through rankName; this
 * card was missed.
 *
 * What should happen: the card names the rank — "(formidable)".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlayerVowHook } from '../../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  game.actors._reset();
  ChatMessage._reset();
  game.user.isGM = true;
  game.ready = true;
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: [] });
  registerPlayerVowHook();
});

describe('PROBE PLAYER-VOW-CARD-RANK-NUMBER', () => {
  it('the "New vow recorded" card names the vow\'s rank, not the vendor\'s number', async () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([kira]);
    // What foundry-ironsworn holds for a sheet-made Formidable vow.
    const item = { id: 'it-1', name: 'Find the Wanderer', type: 'progress', parent: kira,
      system: { subtype: 'vow', rank: 3, current: 0 }, flags: {} };
    item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };

    Hooks.call('createItem', item);
    for (let i = 0; i < 8; i++) await flush();

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.playerVowCard);
    expect(card).toBeTruthy();
    expect(card.content).toContain('Rank formidable');           // control: the stakes line maps the number
    expect(card.content).toContain('<em>(formidable)</em>');     // actual: "<em>(3)</em>"
  });
});
