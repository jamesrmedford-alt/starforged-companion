/**
 * The reward-choice card and the player-vow card's 🤝 Link act once, on the
 * canonical GM, and a reward already granted or lost is never promised again
 * (issue #325 W11).
 *
 * A reward pick stamped the reward "promised" on every copy of the vow
 * (setSharedVowReward checks no status) and disabled only the clicker's DOM
 * buttons: after the reward was granted (a won linked fight), an old card's
 * pick — another client's, or one after a reload — promised it again, and the
 * next linked win or the fulfilment granted a second reward. Both cards now
 * relay ("vow.reward", "vow.link") to the canonical GM, which claims the card
 * (`rewardChosen`, `linkedConnection`) before the write.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildRewardChoiceHtml } from '../../src/moves/rewards.js';
import { buildPlayerVowSetupHtml } from '../../src/session/swearVow.js';

const OPTIONS = [
  { description: 'A salvaged jump drive', form: 'gear' },
  { description: 'Fresh supplies from the relay', form: 'supply' },
];

let table, vow;

function vowItem(reward) {
  const item = {
    id: 'vow-1', name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v1', ...(reward ? { reward } : {}) } },
  };
  item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };
  return item;
}

async function postRewardCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: buildRewardChoiceHtml(OPTIONS),
    flags: { [MODULE_ID]: { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS } },
  }));
  await table.settle();
  return msg.id;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', connectionIds: ['conn-sable'],
  } } } });
  table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
});

describe('the reward-choice card', () => {
  it('a pick promises the reward once; the card is claimed and a second pick changes nothing', async () => {
    vow = vowItem(null);
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    const id = await postRewardCard();

    table.client('pl-1').click(id, '[data-action="sf-reward-pick"]', { index: 0 });
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
    expect(table.world.message(id).flags[MODULE_ID].rewardChosen).toBe(true);

    table.client('pl-2').click(id, '[data-action="sf-reward-pick"]', { index: 1 });
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward.description).toBe('A salvaged jump drive');
    expect(table.cards(f => f.rewardSetCard)).toHaveLength(1);
  }, 30_000);

  it('a pick on an old card after the reward was granted does not promise it again', async () => {
    const granted = { status: 'granted', description: 'A salvaged jump drive', form: 'gear' };
    vow = vowItem({ ...granted });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    const id = await postRewardCard();

    table.client('pl-1').click(id, '[data-action="sf-reward-pick"]', { index: 1 });
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject(granted);
    expect(table.cards(f => f.rewardSetCard)).toHaveLength(0);
  }, 30_000);

  it("a forsaken vow's lost reward stays lost", async () => {
    vow = vowItem({ status: 'lost', description: 'A salvaged jump drive', form: 'gear' });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    const id = await postRewardCard();

    table.client('gm-1').click(id, '[data-action="sf-reward-pick"]', { index: 0 });
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward.status).toBe('lost');
  }, 30_000);
});

describe("the player-vow card's 🤝 Link", () => {
  it('links once; the card is claimed and the button stays disabled on re-render', async () => {
    vow = vowItem(null);
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: buildPlayerVowSetupHtml({ name: 'Break the Covenant', rank: 'formidable', connections: ['Sable'] }),
      flags: { [MODULE_ID]: { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' } },
    }));
    await table.settle();

    const client = table.client('pl-1');
    const root = client.render(card.id);
    root.querySelector('.sf-vow-connection').value = 'Sable';
    client.click(card.id, '[data-action="sf-player-vow-link"]');
    await table.settle(); await table.drain();

    expect(vow.flags[MODULE_ID].linkedConnectionName).toBe('Sable');
    expect(table.world.message(card.id).flags[MODULE_ID].linkedConnection).toBe('Sable');
    expect(table.cards(f => f.vowLinkedCard)).toHaveLength(1);
    expect(table.client('pl-2').render(card.id).querySelector('[data-action="sf-player-vow-link"]').disabled).toBe(true);
  }, 30_000);
});
