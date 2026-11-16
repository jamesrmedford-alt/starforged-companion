/**
 * SESS-02 · PLAYER-VOW-PLAN-NO-VOW-ID
 *
 * Scenario: Kira's player writes a vow on the sheet ("Learn who sent the
 * escort"); its "🆕 New vow recorded" card's ⚔ Swear it (roll) is pressed. The
 * swearing scene files the vow's hidden plan ("what is really behind it",
 * issue #353 Phase 4). Later the player rewords the vow on the sheet.
 *
 * Correct (decisions.md "The narrative skeleton, Phase 4": the vow plan is
 * "about the vow by its stable `vowId`", and "in play while its vow is the one
 * this scene serves — matched by the vow's id across its copies, or its
 * name"): the plan carries the vow's id — the card holds it (`vowId`) — so the
 * reworded vow's plan is still in play in the next narration.
 *
 * Today: the card's forced swear carries the vow's name only, movePipeline
 * hands narrateAndPostVowSwearing `{ name, rank: null }` with no vowId, and the
 * plan is filed with `subject.id: null`. Only the inciting ⚔ passes an id.
 * So the Fulfill Your Vow that scores it (movePipeline: `endingTrackIds` = the
 * copies' `vowId`) does not bring the plan into its narration unless the
 * player's line happens to name the vow, and
 * once the vow is reworded nothing links the plan to it: from the next scene
 * on (a plan made in the current scene is in play whatever it is about) it
 * drops out of the narrator's UNREVEALED block for good.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';

const SWEAR = '[data-action="sf-player-vow-swear"]';

let table, restore, kira;
const vowCards = () => table.cards(f => f.playerVowCard);
const vowPlans = () => plansOf(table).filter(p => p.kind === 'vow');
const lastCall = () => narrationCallsOf(table).at(-1);

function sheetVow(id, name) {
  const item = {
    id, type: 'progress', name, parent: kira, flags: {},
    system: { subtype: 'vow', rank: 2, current: 0, completed: false },
    async update(changes) { if (typeof changes?.name === 'string') item.name = changes.name; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  kira.items.contents.push(item);
  return item;
}

async function created(item) {
  for (const c of table.connectedClients) c.run(() => Hooks.callAll('createItem', item, {}, 'pl-1'));
  await table.settle(); await table.drain();
}

async function pressSwear(cardId) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    table.client('pl-1').click(cardId, SWEAR);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}

/** Kira writes the vow on her sheet and swears it from its card. Returns the Item. */
async function writeAndSwear() {
  const vow = sheetVow('vow-escort', 'Learn who sent the escort');
  await created(vow);
  const [card] = vowCards();
  await pressSwear(card._id ?? card.id);
  return vow;
}

/** A later scene: the plan is no longer "made in this scene", so only its subject brings it into play. */
function laterScene() {
  table.world.setSetting('campaignState', { ...table.world.campaignState(), currentSceneId: 'sc-2',
    sceneFrame: { location: 'the engine deck', present: ['Kira'], situation: 'The reactor ticks as it cools' } });
}

async function refreshKira() {
  const { invalidateActorCache } = await gmOf(table).import('../../src/character/actorBridge.js');
  gmOf(table).run(() => invalidateActorCache('pc-kira'));
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { connectionIds: [] });
  kira = table.actors.get('pc-kira');
  globalThis.silenceConsoleErrors();
});
afterEach(() => restore?.());

describe('SESS-02 — the hidden plan of a vow sworn from its "New vow recorded" card', () => {
  it('control: the swear files one vow plan, and in a later scene it is in play while the vow keeps its name', async () => {
    await writeAndSwear();
    const plans = vowPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'vow', status: 'active', subject: { type: 'vow', name: 'Learn who sent the escort' } });

    laterScene();
    await refreshKira();
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I check the reactor.' }));
    expect(lastCall().system).toContain(`- id ${plans[0].id}: Vow`);
  }, 60_000);

  it('the plan is about the vow by its id — the card\'s vowId', async () => {
    const vow = await writeAndSwear();
    const [plan] = vowPlans();
    expect(vow.flags[MODULE_ID]?.vowId, 'the createItem hook stamped the vow\'s id').toBe('vow-escort');
    expect(plan.subject.id).toBe('vow-escort');
  }, 60_000);

  it('reworded on the sheet, the vow a later scene serves still brings its plan into the narration', async () => {
    const vow = await writeAndSwear();
    const [plan] = vowPlans();

    vow.name = 'Find out who hired the mercenaries';        // the player rewords the vow on the sheet
    laterScene();
    await refreshKira();
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I check the reactor.' }));

    // Kira's only vow is the vow this scene serves ([2.6]), whatever it is called now.
    expect(lastCall().system).toContain('Find out who hired the mercenaries');
    expect(lastCall().system).toContain(`- id ${plan.id}: Vow`);
  }, 60_000);

  it('fulfilled by a line that does not name it, the Fulfill Your Vow narration still carries its plan (its vowId among the tracks the beat ends)', async () => {
    const vow = await writeAndSwear();
    const [plan] = vowPlans();

    laterScene();
    vow.system.completed = true;                             // the fulfilment completed the vow (completeVowItemByName)
    await refreshKira();
    // movePipeline's fulfil branch: resolution.endingTrackIds = the scored copies' vowId flags.
    await narrateMoveOn(table, moveResolution({
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'It is done. I set the last piece on the table.',
      loremasterContext: '[MOVE: Fulfill Your Vow] [OUTCOME: Strong Hit]',
      endingTrackIds: [vow.flags[MODULE_ID].vowId],
    }));
    expect(lastCall().system).toContain(`- id ${plan.id}: Vow`);
  }, 60_000);
});
