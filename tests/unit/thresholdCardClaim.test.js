/* global structuredClone */
/**
 * STARFORGED COMPANION
 * tests/unit/thresholdCardClaim.test.js
 *
 * Issue #329 X06 (THRESHOLD-CARD-NO-CLAIM) — the "⚔ A fight looms" card's
 * buttons act once per card.
 *
 * The threshold card was the one shared-button card with no claim: its
 * buttons were disabled in the clicker's DOM only, so every other client —
 * and the clicker's next render — showed both armed. A second "Find another
 * way" posted a second way-out card (two exits from one fight); a stale
 * "Enter the Fray" after the fight was won created a second "Raiders" track.
 * Its press was also the raw `combat.enterFray` socket (RELAY-LEGACY-KINDS).
 * Now both buttons relay "combat.threshold" to the canonical GM, which claims
 * the card (`thresholdTaken`) before creating the fight or posting the
 * way-out card; a claimed card renders both disabled, and an effect that
 * does not land releases the claim.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/cards/thresholdCardNoClaim.probe.js.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildCombatThresholdHtml } from '../../src/moves/combatThreshold.js';
import { applyCombatThresholdChoice } from '../../src/moves/cardActions.js';

const refuseTrackWrites = { on: false };
function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => {
      if (refuseTrackWrites.on) throw new Error('the server refused the write');
      store[`${mod}.${key}`] = structuredClone(value);
    },
  };
}

let table;
const journal = () => table.journal.find(j => j.name === 'Starforged Progress Tracks');
const tracks  = () => journal().getFlag(MODULE_ID, 'tracks') ?? [];
const openFights = () => tracks().filter(t => t.type === 'combat' && !t.completed);

async function postThresholdCard({ vowNames = [] } = {}) {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: buildCombatThresholdHtml({ label: 'Raiders', suggestedRank: 'dangerous', vowNames }),
    flags: { [MODULE_ID]: { combatThresholdCard: true, label: 'Raiders', position: null, actorId: 'pc-kira', resolutionId: 'res-1' } },
  }));
  await table.settle();
  return card.id;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  refuseTrackWrites.on = false;
  table.journal._set(makeTracksJournal([]));
});

describe('issue #329 X06 — the threshold card\'s buttons act once per card', () => {
  it('control: the first "Find another way" posts one way-out card with its three off-ramps', async () => {
    const id = await postThresholdCard();
    table.client('pl-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    const wayOut = table.cards(f => f.wayOutCard);
    expect(wayOut).toHaveLength(1);
    expect(wayOut[0].content).toContain('data-action="sf-way-out-move"');
  }, 30_000);

  it('control: the first "Enter the Fray" creates the fight the card names, once', async () => {
    const id = await postThresholdCard();
    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(openFights().map(t => t.label)).toEqual(['Raiders']);
    expect(table.cards(f => f.combatTrackCard && f.created)).toHaveLength(1);
  }, 30_000);

  it('"Find another way" pressed by the player, then by the GM on a re-render, posts one way-out card', async () => {
    const id = await postThresholdCard();

    table.client('pl-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.wayOutCard)).toHaveLength(1);           // control: the first press works

    const gmRoot = table.client('gm-1').render(id);
    // The choice is taken everywhere: both buttons render disabled.
    expect(gmRoot.querySelector('[data-action="sf-way-out"]').disabled).toBe(true);
    expect(gmRoot.querySelector('[data-action="sf-enter-fray"]').disabled).toBe(true);

    table.client('gm-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.wayOutCard)).toHaveLength(1);           // was 2 — two sets of off-ramps
  }, 30_000);

  it('"Enter the Fray" pressed again on the old card after the fight ended begins no new fight', async () => {
    const id = await postThresholdCard();

    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(openFights()).toHaveLength(1);                             // control: the fight is created
    expect(openFights()[0].label).toBe('Raiders');

    // The fight is won: its track completes (Take Decisive Action's endCombat).
    await journal().setFlag(MODULE_ID, 'tracks', tracks().map(t => ({ ...t, completed: true, completedAt: Date.now() })));
    expect(openFights()).toHaveLength(0);

    const gmRoot = table.client('gm-1').render(id);
    expect(gmRoot.querySelector('[data-action="sf-enter-fray"]').disabled).toBe(true);   // was armed again
    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    // No second "Raiders" fight, no second "Created combat track … Battle instead".
    expect(openFights()).toHaveLength(0);
    expect(table.cards(f => f.combatTrackCard && f.created)).toHaveLength(1);
  }, 30_000);

  it('a vow the card does not offer is not linked to the fight; one it offers is', async () => {
    const id = await postThresholdCard({ vowNames: ['Free the colony'] });
    const ctx = { requesterId: 'pl-1', requesterIsGM: false, requester: { id: 'pl-1', isGM: false } };
    const res = await table.client('gm-1').run(() =>
      applyCombatThresholdChoice({ messageId: id, choice: 'fray', rank: 'formidable', vowName: 'Betray the crew', objective: 'hold the gate' }, ctx));
    expect(res).toEqual({ applied: true });
    const fight = tracks().find(t => t.type === 'combat');
    expect(fight).toMatchObject({ label: 'Raiders', rank: 'formidable', objective: 'hold the gate', linkedVowName: null });

    // That fight is over; the next card's foe begins a new one.
    await journal().setFlag(MODULE_ID, 'tracks', tracks().map(t => ({ ...t, completed: true })));
    const id2 = await postThresholdCard({ vowNames: ['Free the colony'] });
    await table.client('gm-1').run(() =>
      applyCombatThresholdChoice({ messageId: id2, choice: 'fray', rank: 'dangerous', vowName: 'Free the colony' }, ctx));
    expect(tracks().filter(t => t.type === 'combat').at(-1).linkedVowName).toBe('Free the colony');
  }, 30_000);

  it('an Enter the Fray whose fight could not be saved releases the claim — the card can be pressed again', async () => {
    const id = await postThresholdCard();
    refuseTrackWrites.on = true;
    silenceConsoleErrors?.();
    const res = await table.client('gm-1').run(() =>
      applyCombatThresholdChoice({ messageId: id, choice: 'fray', rank: 'dangerous' }, { requesterIsGM: true }));
    expect(res).toEqual({ applied: false, reason: 'not-created' });
    expect(table.world.message(id).flags[MODULE_ID].thresholdTaken ?? null).toBeNull();

    refuseTrackWrites.on = false;
    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(openFights().map(t => t.label)).toEqual(['Raiders']);
  }, 30_000);
});
