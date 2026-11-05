/**
 * PROBE — CARDS-02 NATIVE-PAYOFF-NPC-CARD-SPEAKER (tenth audit, area cards)
 *
 * What the user does: the GM keeps an NPC's own goal as a vow on that NPC
 * card's Starforged sheet (NPC and connection cards are `character` Actors
 * with the full sheet, FOLDER-002) and rolls its progress there: "Hunt the
 * crew" on Vex's card, a strong hit. The crew's one PC, Kira, has one open
 * vow, "Find Chen".
 *
 * What happens: registerNativeFulfilConsequenceHook (src/index.js) takes
 * the roll card's `speaker.actor` as the roller with no player-character
 * check and calls payFulfilledVowNative("Hunt the crew", "strong_hit",
 * { actorId: "npc-vex" }). resolveVowItemCopies finds no vow of that name
 * on any PC and falls to its sole-open rung — Kira's "Find Chen" — so her
 * vow is stamped `fulfilPaid`, the Quests legacy is paid by HER vow's rank,
 * her linked connection would be deepened and her promised reward granted,
 * all for a roll about an NPC. Her vow stays open: when she really fulfils
 * it, the payoff finds `fulfilPaid` and pays nothing. A miss on the NPC's
 * roll posts a "Vow — recommit?" offer for the NPC card
 * (offerSheetMissRecommit, issue #331 X62), whose press can recommit
 * nothing. (The narration hook narrates the same roll as the GM's first PC
 * fulfilling a vow: resolveSpeakerActorId falls through the NPC speaker to
 * the author's PC.)
 *
 * What should happen: a sheet roll whose speaker is not a player character
 * is nobody's vow — CLAUDE.md: "Never use type === 'character' alone to
 * mean player character … an unfiltered check leaks NPC cards into PC-only
 * logic (momentum grants, chat-speaker attribution …)"; the payoff hook
 * gates on isPlayerCharacterActor like resolveSpeakerActorId does, and pays
 * and offers nothing.
 *
 * Control: Kira's own sheet roll of "Find Chen" pays her vow once.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/sheetRollNpcCardPaysPcVow.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, kiraVow, npcVow;
const world = () => table.world.campaignState();

/** The vendor's progress-roll card: JSON HTML-escaped inside a single-quoted attribute. */
function nativeProgressCard({ source, value, dice, actorId }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** `userId` rolls `source` on `actorId`'s sheet. */
async function rollOnSheet(userId, actorId, alias, source, { value, dice }) {
  await table.client(userId).run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source, value, dice, actorId }),
    speaker: { actor: actorId, alias },
    rolls:   [{ formula: '{d10,d10}', total: 0 }],    // the vendor attaches its Roll: no move pipeline
  }));
  await table.settle(); await table.drain();
}

function progressItem(id, name, subtype, current, itemFlags = {}) {
  const item = {
    id, type: 'progress', name, flags: itemFlags,
    system: { subtype, rank: 'dangerous', current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'np-s1', sessionNumber: 1,
      currentSceneId: 'np-scene', sceneTruths: [], clocks: [], legacyTracks: {}, connectionIds: ['npc-vex'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kiraVow = progressItem('vow-kira', 'Find Chen', 'vow', 40, { [MODULE_ID]: { vowId: 'vid-kira' } });
  npcVow  = progressItem('vow-vex',  'Hunt the crew', 'vow', 40);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true,
    items: { contents: [kiraVow] } });
  // Vex: an NPC card — a `character` Actor tagged entityType (FOLDER-002), with a vow on its own sheet.
  table.addActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'conn-vex', name: 'Vex', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
    items: { contents: [npcVow] } });
  scriptClaude(table, { fallback: () => 'The hunt goes on.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('CARDS-02 the GM rolls a vow on an NPC card\'s sheet', () => {
  it('pays nothing on the PC\'s vow: no fulfilPaid stamp, no Quests legacy', async () => {
    await rollOnSheet('gm-1', 'npc-vex', 'Vex', 'Hunt the crew', { value: 10, dice: [1, 2] });   // a strong hit on the NPC's vow

    // Expected: an NPC card's roll is nobody's vow — nothing paid, nothing marked.
    // Actual: Kira's "Find Chen" is stamped fulfilPaid and the Quests legacy takes her vow's 2 ticks.
    expect(kiraVow.flags[MODULE_ID].fulfilPaid ?? false).toBe(false);
    expect(world().legacyTracks?.quests?.ticks ?? 0).toBe(0);
    expect.soft(table.cards(f => f.rewardAbsentNote)).toHaveLength(0);
  }, 30_000);

  it('a miss on the NPC\'s roll offers no vow recommit for the NPC card', async () => {
    await rollOnSheet('gm-1', 'npc-vex', 'Vex', 'Hunt the crew', { value: 2, dice: [5, 7] });    // a miss
    // Expected: no offer (the roll is not a player character's). Actual: a "Vow — recommit?" card for actorId npc-vex.
    expect(table.cards(f => f.vowRecommitOfferCard)).toHaveLength(0);
  }, 30_000);

  it('control: Kira\'s own sheet roll of "Find Chen" pays her vow once', async () => {
    await rollOnSheet('pl-1', 'pc-kira', 'Kira', 'Find Chen', { value: 10, dice: [1, 2] });
    expect(kiraVow.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(world().legacyTracks?.quests?.ticks ?? 0).toBe(2);
  }, 30_000);
});
