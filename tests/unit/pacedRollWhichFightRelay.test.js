/**
 * Known-issues PACED-ROLL-OPEN-PRESS (found while fixing issue #338; it closes
 * the older WHICH-FIGHT-LOCAL-DISABLE) — the paced card's Roll and the "Which
 * fight?" pick are the roller's to press, once.
 *
 * At a two-PC table (Kira, Ren) both buttons posted their forced move from
 * the presser's client, spoken as the card's roller, with no ownership check
 * and a local disable only: Ren's player rolled Kira's paced Face Danger or
 * her Take Decisive Action — her momentum, a Pay the Price on her — and a
 * player's press could not stamp the GM-authored card, so another client (or
 * a re-render) rolled the move again. Issue #338 D1's open press, at the two
 * sites D1 did not list (issue #335 Y08 made them wait, not relay). Both now
 * relay through GM_ACTIONS ("paced.roll", "whichFight.pick") on D1's shape
 * (cardActions.applyCardRollerFollowup): a non-owner refused unless a GM, the
 * card claimed once on the canonical GM, the move posted as the roller with
 * `deferWhileBusy` (Y08's hold), the claim released when the post fails; the
 * pick must be one of the card's own fights (`fights`).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const forced = (moveId) => table.cards(f => f.forcedMoveId === moveId);
const flags  = (id) => table.world.message(id).flags[MODULE_ID];

const gmPosts = (data) => table.client('gm-1').run(() => globalThis.ChatMessage.create(data)).then(async (m) => { await table.settle(); return m.id; });

async function press(userId, id, selector) {
  table.client(userId).click(id, selector);
  await table.settle(); await table.drain();
}

const ROLL = '[data-action="sf-paced-roll"]';
const pick = (trackId) => `[data-action="sf-which-fight"][data-track-id="${trackId}"]`;

/** Kira's paced card, as postPacedNarrativeCard posts it on the canonical GM. */
const postPacedCard = (extra = {}) => gmPosts({
  content: `<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The hatch hisses.</div>`
    + `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll Face Danger</button></div></div>`,
  flags: { [MODULE_ID]: {
    narratorCard: true, narrationCard: true, pacedNarrative: true, narrationText: 'The hatch hisses.',
    playerText: 'Kira forces the hatch and dives through.', playerName: 'Kira', actorId: 'pc-kira',
    suggestedMove: 'face_danger', sessionId: 'pw-s1', ...extra,
  } },
});

/** Kira's "Which fight?" card, as postWhichFightCard posts it (a third button names no fight of the card's). */
const postWhichFightCard = () => gmPosts({
  content: `<div class="sf-ptp-card"><strong>Take Decisive Action — which fight?</strong><div class="sf-milestone-suggest-row">`
    + `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="fight-1">⚔ Corsairs</button>`
    + `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="fight-2">⚔ Drones</button>`
    + `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="fight-9">⚔ Elsewhere</button></div></div>`,
  flags: { [MODULE_ID]: {
    whichFightCard: true, moveId: 'take_decisive_action', narration: 'Kira takes decisive action.', actorId: 'pc-kira',
    fights: [{ id: 'fight-1', label: 'Corsairs' }, { id: 'fight-2', label: 'Drones' }],
  } },
});

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'pw-s1', sessionNumber: 1,
      currentSceneId: 'pw-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("the paced card's Roll is the narrator's to press (PACED-ROLL-OPEN-PRESS)", () => {
  it("Ren's player's press on Kira's paced card is refused: nothing rolled, the card left unclaimed", async () => {
    const id = await postPacedCard();
    await press('pl-2', id, ROLL);
    expect(forced('face_danger')).toHaveLength(0);
    expect(flags(id).rolled ?? false).toBe(false);
  }, 30_000);

  it("Kira's player rolls it once, as Kira — the card is claimed, and the GM's later press rolls nothing more", async () => {
    const id = await postPacedCard();
    await press('pl-1', id, ROLL);
    const [post] = forced('face_danger');
    expect(post, 'the forced move was posted').toBeTruthy();
    expect(post.speaker?.actor).toBe('pc-kira');
    expect(post.content).toBe('Kira forces the hatch and dives through.');
    expect(post.flags[MODULE_ID]).toMatchObject({ bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true });
    expect(flags(id).rolled, 'claimed on the GM-authored card').toBe(true);

    await press('gm-1', id, ROLL);
    expect(forced('face_danger')).toHaveLength(1);
  }, 30_000);

  it('a GM may press it, and it rolls as Kira (issue #325 W09)', async () => {
    const id = await postPacedCard();
    await press('gm-1', id, ROLL);
    expect(forced('face_danger').map(m => m.speaker?.actor)).toEqual(['pc-kira']);
  }, 30_000);

  it('once claimed, every client renders the button "Rolled" and disabled', async () => {
    const id = await postPacedCard();
    await press('pl-1', id, ROLL);
    const btn = table.client('pl-2').render(id).querySelector(ROLL);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Rolled');
  }, 30_000);

  it('a card that names no narrator (before issue #325 W09) rolls for the presser\'s own PC', async () => {
    const id = await postPacedCard({ actorId: null });
    await press('pl-2', id, ROLL);
    expect(forced('face_danger').map(m => m.speaker?.actor)).toEqual(['pc-ren']);
  }, 30_000);
});

describe('the "Which fight?" pick is the roller\'s to make, once (WHICH-FIGHT-LOCAL-DISABLE)', () => {
  it("Ren's player's pick on Kira's card is refused: nothing rolled, the card left unclaimed", async () => {
    const id = await postWhichFightCard();
    await press('pl-2', id, pick('fight-1'));
    expect(forced('take_decisive_action')).toHaveLength(0);
    expect(flags(id).whichFightPicked ?? null).toBe(null);
  }, 30_000);

  it("Kira's player's pick rolls that fight once, as Kira; another client's pick rolls nothing more", async () => {
    const id = await postWhichFightCard();
    await press('pl-1', id, pick('fight-2'));
    const [post] = forced('take_decisive_action');
    expect(post, 'the forced move was posted').toBeTruthy();
    expect(post.speaker?.actor).toBe('pc-kira');
    expect(post.content).toBe('Kira takes decisive action.');
    expect(post.flags[MODULE_ID]).toMatchObject({
      bypassPacing: true, forcedMoveId: 'take_decisive_action', deferWhileBusy: true,
      forcedMoveTargetId: 'fight-2', forcedMoveTarget: 'Drones',
    });
    expect(flags(id).whichFightPicked, 'the card records the pick').toBe('fight-2');

    await press('gm-1', id, pick('fight-1'));
    expect(forced('take_decisive_action')).toHaveLength(1);
  }, 30_000);

  it('a GM may pick for Kira', async () => {
    const id = await postWhichFightCard();
    await press('gm-1', id, pick('fight-1'));
    expect(forced('take_decisive_action').map(m => m.speaker?.actor)).toEqual(['pc-kira']);
  }, 30_000);

  it('a pick that names none of the card\'s fights is refused', async () => {
    const id = await postWhichFightCard();
    await press('gm-1', id, pick('fight-9'));
    expect(forced('take_decisive_action')).toHaveLength(0);
    expect(flags(id).whichFightPicked ?? null).toBe(null);
  }, 30_000);

  it('a post the world refuses releases the claim, and the pick can be made again', async () => {
    const id = await postWhichFightCard();
    const stop = table.interceptWrites((w) => (w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.forcedMoveId
      ? new Error('refused by the test') : undefined));
    await press('pl-1', id, pick('fight-1'));
    stop();
    expect(forced('take_decisive_action')).toHaveLength(0);
    expect(flags(id).whichFightPicked ?? false).toBeFalsy();

    await press('gm-1', id, pick('fight-1'));
    expect(forced('take_decisive_action')).toHaveLength(1);
  }, 30_000);
});
