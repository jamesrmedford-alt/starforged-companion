/**
 * STARFORGED COMPANION
 * tests/unit/incitingSwearRearmAfterGate.test.js
 *
 * Issue #337 Y36 (INCITING-SWEAR-DISABLED-AFTER-GATE) — the inciting card's
 * ⚔ Swear this vow can be pressed again after the session gate refused it.
 *
 * Before Begin a Session the GM (solo play's common case) or a player
 * presses the inciting card's ⚔. The gate drops the forced post and
 * whispers "This move was not rolled: no session has begun. Press Begin a
 * Session …, then press the button again" (issue #329 X14). The press had
 * disabled the button on the presser's client for good — the post did not
 * fail, the gate dropped it — so after Begin the second press did nothing
 * until a reload. Now the gate's notice names the post it dropped, and the
 * client that posted it re-arms its button. (The other option, holding the
 * post with `deferWhileBusy` until Begin, was not taken: the inciting card is
 * not claimed, so two presses before Begin — or one again after a reload —
 * would each be held and each roll at Begin.)
 *
 * (Converted from the tenth audit's probe
 * tests/probes/session/incitingSwearRearmAfterGate.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const INCITING_TEXT = [
  'The relay at Paradox Station goes dark; a distress code older than the Forge repeats on every band.',
  '',
  'Suggested vow: Find who silenced the relay (dangerous)',
].join('\n');

let table;
const world = () => table.world.campaignState();
const moveCards = () => table.cards(f => f.moveResolution);
const swearPosts = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === 'swear_an_iron_vow');
const gateNotices = () => table.cards(f => f.sessionGateNotice);
const swearButton = (userId, cardId) => (table.client(userId).rendered.get(cardId) ?? table.client(userId).render(cardId))
  .querySelector('[data-action="sf-swear-vow"]');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: false, currentSessionId: 'sw-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sw-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
}

async function postIncitingCard() {
  const { postIncitingIncidentCard } = await table.client('gm-1').import('../../src/session/incitingIncident.js');
  await table.client('gm-1').run(() => postIncitingIncidentCard({
    spark: { action: 'Seize', theme: 'Power' }, text: INCITING_TEXT, fallback: false, sessionId: 'sw-s1', narrationId: 'nar-incite',
  }));
  await table.settle();
  return table.cards(f => f.incitingIncidentCard)[0];
}

async function press(userId, cardId) {
  table.client(userId).click(cardId, '[data-action="sf-swear-vow"]');
  await table.settle(); await table.drain();
}

async function beginSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: true, sessionStartedId: 'sw-s1' });
  await table.settle(); await table.drain();
}

describe('issue #337 Y36 — the inciting ⚔ refused by the session gate can be pressed again', () => {
  it('the GM presses ⚔ before Begin, is told to press again — and pressing again after Begin swears the vow', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();

    await press('gm-1', card._id);
    expect(moveCards()).toHaveLength(0);                  // the gate dropped it
    expect(swearPosts()).toHaveLength(1);
    const notice = gateNotices().at(-1);
    expect(notice?.content ?? '').toMatch(/press the button again/);
    expect(notice.flags[MODULE_ID].gatedMessageId).toBe(swearPosts()[0]._id);   // it names the dropped post
    expect(swearButton('gm-1', card._id).disabled).toBe(false);                 // … and the presser's button is live

    await beginSession();
    expect(world().sessionActive).toBe(true);

    // The presser does as told: presses the button again, on the card as they see it.
    await press('gm-1', card._id);

    expect(swearPosts()).toHaveLength(2);
    expect(moveCards()).toHaveLength(1);
    expect(moveCards()[0]?.content ?? '').toMatch(/Swear an Iron Vow/i);
  }, 60_000);

  it('a player presser is told to press again, and their button is live again where they pressed it', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();

    await press('pl-1', card._id);
    expect(moveCards()).toHaveLength(0);
    expect(gateNotices().at(-1)?.whisper ?? []).toContain('pl-1');
    expect(swearButton('pl-1', card._id).disabled).toBe(false);

    await beginSession();
    await press('pl-1', card._id);

    expect(swearPosts()).toHaveLength(2);
    expect(moveCards()).toHaveLength(1);
  }, 60_000);

  it('a press while a session is active rolls at once: no gate notice, and the card is sworn', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();
    await beginSession();

    await press('pl-1', card._id);

    expect(gateNotices()).toHaveLength(0);
    expect(swearPosts()).toHaveLength(1);
    expect(moveCards()).toHaveLength(1);
    expect(table.world.message(card._id).flags[MODULE_ID].vowSworn).toBe(true);
  }, 60_000);

  it('control: after a reload (the card re-rendered) the button is live again and the press rolls Swear an Iron Vow', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();

    await press('gm-1', card._id);
    expect(moveCards()).toHaveLength(0);
    await beginSession();

    table.client('gm-1').render(card._id);              // a fresh render: the binder arms a fresh button
    await press('gm-1', card._id);

    expect(swearPosts()).toHaveLength(2);
    expect(moveCards()).toHaveLength(1);
    expect(moveCards()[0].content).toMatch(/Swear an Iron Vow/i);
  }, 60_000);
});
