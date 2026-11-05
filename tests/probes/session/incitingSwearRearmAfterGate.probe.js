/**
 * PROBE — SESSION-03 INCITING-SWEAR-DISABLED-AFTER-GATE (tenth audit, area session)
 *
 * What the user does: before Begin a Session (a fresh world after ✦ Envision
 * Inciting Incident, or the night after an End), the GM — or any player —
 * presses the inciting card's ⚔ Swear this vow. The session gate holds the
 * forced move and whispers (issue #329 X14): "This move was not rolled: no
 * session has begun. Press Begin a Session …, then press the button again."
 * They press Begin a Session, then press the button again, as told.
 *
 * What happens: nothing. The ⚔ press disables its button on the presser's
 * client and leaves it so — "stays disabled — the roll is firing; re-enable
 * only if the post itself fails" (src/session/swearVow.js:383-388) — and the
 * forced post did not fail: it posted and the gate dropped it. The inciting
 * card is not updated (no `vowSworn`, no re-render), so the button stays
 * dead on that client until a reload; the whisper's instruction cannot be
 * followed where it is read. (The ⚔ post carries no `deferWhileBusy`,
 * src/session/swearVow.js:124-135, so the gate does not hold it either —
 * the X14 hold is for claimed cards; this card tells the presser to press
 * again instead.) In solo play the GM is the presser: their only way on is
 * a reload. The help's Troubleshooting page promises the whisper's other
 * branch: "a card button's move pressed then is rolled once the session
 * begins, or says to press it again".
 *
 * What should happen: a press the gate refused re-arms its button (the
 * forced post was not rolled, so the press is not spent), or the post is held
 * like a claimed card's and rolled once the session begins (decisions.md
 * [X14]: "a claimed card's forced move is held, not dropped, before a session
 * begins as while the lock is held"; "No silent no-op on a player's action").
 *
 * Control: the same card re-rendered (a reload) re-arms the button, and the
 * press then rolls Swear an Iron Vow once the session is active.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/incitingSwearRearmAfterGate.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SESSION-03 the inciting card\'s ⚔ press refused by the session gate cannot be pressed again where it was pressed', () => {
  it('the GM presses ⚔ before Begin, is told to press again after Begin — and the second press does nothing', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();

    await press('gm-1', card._id);
    // Sanity: the gate held the move and told the presser to press again (issue #329 X14).
    expect(moveCards()).toHaveLength(0);
    expect(swearPosts()).toHaveLength(1);
    expect(gateNotices().at(-1)?.content ?? '').toMatch(/press the button again/);

    await beginSession();
    expect(world().sessionActive).toBe(true);

    // The presser does as told: presses the button again, on the card as they see it.
    await press('gm-1', card._id);

    // Expected: a second forced Swear an Iron Vow post, rolled now that the session is active.
    // Actual: the button is still disabled on this client (the first press greyed it for
    // good) — the click is swallowed, nothing is posted and nothing rolls.
    expect(swearPosts()).toHaveLength(2);
    expect.soft(moveCards()).toHaveLength(1);
    expect.soft(moveCards()[0]?.content ?? '').toMatch(/Swear an Iron Vow/i);
  }, 60_000);

  it('a player presser is in the same place: told to press again, their button stays dead', async () => {
    await reset();
    silenceConsoleErrors();
    const card = await postIncitingCard();

    await press('pl-1', card._id);
    expect(moveCards()).toHaveLength(0);
    expect(gateNotices().at(-1)?.whisper ?? []).toContain('pl-1');

    await beginSession();
    await press('pl-1', card._id);

    expect(swearPosts()).toHaveLength(2);
    expect.soft(moveCards()).toHaveLength(1);
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
