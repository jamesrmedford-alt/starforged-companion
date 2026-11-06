/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/cacheMutatedBeforeWrite.test.js
 *
 * CACHE-MUTATED-BEFORE-WRITE (found while fixing the issue #342 open items).
 *
 * `game.settings.get` hands back this client's cached campaignState by
 * reference (rules/foundry-api.md). Two writers set their field on that
 * object and then wrote it: the narrator's rolling-summary persist
 * (`stored.sessionSummary = record`) and a draft card's Dismiss
 * (`campaignState.dismissedEntities = list`). A write the world refused left
 * the GM's cache holding what the world never took — a summary the narrator
 * then served from this client alone, a dismissed name — and the GM's next
 * whole-object write carried it into the world. Each also read the cache off
 * the client's campaignState write chain, so inside an oracle capture's round
 * trip its write erased the answer. Both now write a copy, on the chain.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
let gm;
let gates = [];
const world = () => table.world.campaignState();
const gmCache = () => gm.run(() => globalThis.game.settings.get(MODULE_ID, 'campaignState'));
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client('gm-1');
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    // narratorContextCards 1: the rolling summary regenerates every second card (K = 2).
    chronicleAutoEntry: false, narratorSessionSummary: true, narratorContextCards: 1,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      recentOracles: [], dismissedEntities: [], sessionSummary: null,
    },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Kira reached the docks and bargained for a berth.' });
  silenceConsoleErrors();
});

/** Hold the GM's campaignState writes (the round trip): each released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

/** The GM asks the oracle (no key yet: no follow-up); the d100 lands on YES at "likely". */
async function gmAsks() {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11
  try {
    await gm.chat('!oracle yes likely is the hatch sealed');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

/**
 * Two narrator cards of this session post on the keyed GM: the second one's
 * card hook regenerates the rolling summary (registerRollingSummaryRefreshHook
 * → refreshRollingSessionSummary), and the GM persists it.
 */
async function twoNarratedBeats() {
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  for (const [id, text] of [['nar-docks', 'The dockmaster waves Kira through.'], ['nar-berth', 'Kira finds a berth on the lower ring.']]) {
    await gm.run(() => globalThis.ChatMessage.create({
      content: `<p>${text}</p>`,
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 'sess-1', narrationId: id } },
    }));
    await table.settle();
  }
}

/** A "New Entities Detected" card with one connection row. */
async function draftCard() {
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' }],
    globalThis.game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false },
  ));
  await table.settle();
  return table.cards(f => f.draftEntityCard)[0];
}

describe('CACHE-MUTATED-BEFORE-WRITE — the rolling-summary persist', () => {
  it('a refused write leaves the GM\'s cache without the summary the world never took', async () => {
    const refused = failWrites(table, (w) => campaignStateWrite('gm-1')(w) && !!w.value?.sessionSummary?.text);
    await twoNarratedBeats();
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(world().sessionSummary ?? null).toBeNull();
    expect(gmCache().sessionSummary ?? null).toBeNull();
  }, 30_000);

  it('control: the summary\'s write lands — the world and the GM have it', async () => {
    await twoNarratedBeats();
    await table.drain();
    expect(world().sessionSummary).toMatchObject({ sessionId: 'sess-1', coveredCount: 2 });
    expect(gmCache().sessionSummary?.text).toMatch(/docks/);
  }, 30_000);

  it('written while an oracle answer is on its way: the summary and the answer both stand', async () => {
    const held = holdGmCampaignStateWrites();
    await gmAsks();   // no key yet: no follow-up narration
    expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);
    await twoNarratedBeats();
    await releaseInOrder(held);
    expect(world().sessionSummary?.text).toMatch(/docks/);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});

describe('CACHE-MUTATED-BEFORE-WRITE — a draft card\'s Dismiss', () => {
  it('a refused write leaves the GM\'s cache without the dismissed name', async () => {
    const card = await draftCard();
    const refused = failWrites(table, (w) => campaignStateWrite('gm-1')(w) && (w.value?.dismissedEntities ?? []).includes('Vance Oduya'));
    gm.click(card._id, '[data-action="sf-draft-dismiss"]', { index: 0 });
    await table.settle(); await table.drain();
    expect(refused.refused).toBe(1);
    expect(world().dismissedEntities ?? []).toEqual([]);
    expect(gmCache().dismissedEntities ?? []).toEqual([]);
  }, 30_000);

  it('a Dismiss while an oracle answer is on its way: the dismissal and the answer both stand', async () => {
    const card = await draftCard();
    const held = holdGmCampaignStateWrites();
    await gmAsks();
    gm.click(card._id, '[data-action="sf-draft-dismiss"]', { index: 0 });
    await table.settle();
    await releaseInOrder(held);
    expect(world().dismissedEntities).toEqual(['Vance Oduya']);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});
