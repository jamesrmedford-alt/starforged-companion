/* global makeTestActor */
/**
 * PROBE — CARDS-04 CONNECTION-PICK-PCLESS-PLAYER (ninth audit, area cards)
 *
 * What the user does: a player who owns no player character (an observer, a
 * player whose character the GM has not assigned yet) presses a connection
 * on the "Which connection?" picker card (🤝 Develop Relationship / 🔗 Forge
 * a Bond).
 *
 * What happens: their client sends `actorId: null` (clickerActorId,
 * src/index.js:7760-7776 — "sends null rather than another player's PC,
 * which the GM-side handler would refuse as not theirs"). But the handler,
 * applyConnectionPick (src/moves/cardActions.js:178-191), refuses only a PC
 * the requester does not own; with no actor it logs "the pipeline resolves
 * the speaker from the message author" and posts the forced Develop /
 * Forge — authored by the canonical GM, with no speaker — so the pipeline's
 * resolveSpeakerActorId hands it the GM's first PC: another player's
 * character develops or forges the bond, takes the roll's momentum and the
 * Bonds legacy is paid for a press nobody with a character made.
 *
 * What should happen: as every W11 handler does through relayedClickerPc
 * (:589-601), a player's press with no PC of their own is refused
 * ("not-owner"); only a GM's press may speak as nobody. Issue #326 D8 and
 * #321 U23: a player with no PC is never handed another player's.
 *
 * Controls: a GM's press with no PC is posted; a player's press for a PC
 * they own is posted as that PC.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/connectionPickPclessPlayer.probe.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyConnectionPick } from '../../../src/moves/cardActions.js';
import { _resetGmRelayForTests } from '../../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const P9 = { id: 'pl-9', isGM: false, active: true };   // owns no character
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };
const P9_CTX = { requesterId: 'pl-9', requester: P9, requesterIsGM: false };

function makeCard(id, flags) {
  const msg = {
    id, author: GM,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.').slice(2);
        let cur = msg.flags[MODULE_ID];
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
        cur[parts[parts.length - 1]] = val;
      }
    }),
  };
  return msg;
}

let picker;

beforeEach(() => {
  ChatMessage._reset();
  game.socket?._reset?.();
  _resetGmRelayForTests();
  game.users = Object.assign([GM, P1, P9], { get: (id) => [GM, P1, P9].find(u => u.id === id) ?? null });
  game.user = GM;
  const pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  const pcB = makeTestActor({ id: 'pc-b', name: 'Bex' });
  pcB.ownership = { 'pl-1': 3 };
  const npc = makeTestActor({ id: 'npc-1', name: 'Kira', flags: { [MODULE_ID]: { entityType: 'connection' } } });
  game.actors._setAll([pcA, pcB, npc]);
  picker = makeCard('pick-1', {
    connectionPicker: true, pickAction: 'develop', resolved: false,
    choices: [{ hostId: 'npc-1', name: 'Kira' }],
  });
  game.messages = { get: (id) => (id === picker.id ? picker : null) };
});

describe('CARDS-04 a connection pick from a player with no character', () => {
  it('is refused, not rolled as the first PC', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: null }, P9_CTX);

    // Today: { posted: true } — a GM-authored forced move with no speaker, rolled as Ash.
    expect.soft(res.posted).toBe(false);
    expect.soft(res.reason).toBe('not-owner');
    expect.soft(ChatMessage._created).toHaveLength(0);
    expect.soft(picker.flags[MODULE_ID].resolved).toBe(false);
  });

  it('control: a GM\'s pick with no PC is posted (the pipeline resolves the GM\'s PC)', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: null }, GM_CTX);
    expect(res.posted).toBe(true);
    expect(ChatMessage._created).toHaveLength(1);
  });

  it('control: a player\'s pick for their own PC is posted as that PC', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: 'pc-b' }, P1_CTX);
    expect(res.posted).toBe(true);
    expect(ChatMessage._created.at(-1).speaker.actor).toBe('pc-b');
  });
});
