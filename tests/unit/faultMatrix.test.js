/**
 * STARFORGED COMPANION
 * tests/unit/faultMatrix.test.js
 *
 * Issue #302 slice B — interruptions on a booted table (tests/helpers/
 * multiClient.js), driven through the fault boundaries in
 * tests/helpers/faults.js. Each row pauses or fails the work at a defined
 * boundary, then asserts only after everything deferred has settled
 * (table.drain): what the players were told, what was stored, that the move
 * lock and the card buttons recovered, and that play continues. A failing row
 * prints the order things actually happened in (traceTable).
 *
 *   Late completion   Claude fails mid-narration (overloaded, a server error, a
 *                     malformed or empty reply, a network error, a rate limit —
 *                     retried once — a body that stalls, a request never
 *                     answered); the confirm dialog closed without choosing; a
 *                     session ended while a move is narrated
 *   Refused writes    the move lock's claim and release; the move's record; the
 *                     X-Card pause, played on the GM and relayed from a player
 *   Repeat clicks     Confirm on a new NPC's draft card; two suffer moves picked
 *                     from one card, on one client and on two
 *   Disconnect        a relayed Burn Momentum the GM never receives (relays
 *                     have no ack — the button re-arms), then one that lands
 *
 * Expected outcomes come from the documented contracts (decisions.md: the move
 * lock is released in a `finally`; a move's result stands when its narration
 * fails; the narrator retries a rate limit once; a card button applies once;
 * the X-Card card says whether the pause was recorded; relays are
 * fire-and-forget and one-shot buttons re-arm), not from the functions under
 * test. A row for a defect that is known and still open uses
 * expectKnownIssue, keyed to its known-issues.md entry.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// The pipeline: Face Danger +iron, no pacing call, the confirm dialog answered
// with `control.confirm`, and three scripted dice (`control.dice`) inside the
// REAL resolveMove. STRONG: challenge 3 and 4, action 6 (+iron 3 = 9) — a
// strong hit, +1 momentum. WEAK: challenge 3 and 9 — a weak hit (a suffer
// card), which a momentum of 10 can burn into a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const WEAK   = [0.25, 0.85, 0.9];
const control = vi.hoisted(() => ({ confirm: true, dice: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(control.confirm)),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const [c1, c2, action] = control.dice;
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(action);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import {
  campaignStateWrite, claudeFault, expectKnownIssue, failWrites, scriptClaude, traceTable,
} from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { DEFAULT_TIMEOUT_MS } from '../../src/net/fetchWithTimeout.js';
import { RELAY_RECOVERY_MS } from '../../src/moves/burnMomentum.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const isNarration = (call) => call.model === NARRATION_MODEL;

let table;
const world = () => table.world.campaignState();
const meter = (actorId, name) => table.actors.get(actorId)?.system?.[name]?.value;
const momentumOf = (actorId) => meter(actorId, 'momentum');
const narrated = () => table.cards(f => f.narratorCard && !f.narrationFallback);
const fallbacks = () => table.cards(f => f.narrationFallback);
const sessionLog = () => world().sessionLogs?.['sess-1'] ?? [];
const notices = (userId) => table.client(userId).notifications.map(n => `${n.level}: ${n.message}`);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = true;
  control.dice = STRONG;
  await table.reset({ world: { settings: {
    // The chronicle pass runs 2 s after a narration; these rows don't need it.
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
});

afterEach(() => { vi.useRealTimers(); });

/** A player narrates a move; the canonical GM's pipeline runs it. */
async function move(userId = 'pl-1', text = 'I brace against the hull and push through the breach.') {
  const actor = userId === 'pl-2' ? 'pc-quinn' : 'pc-pat';
  await table.client(userId).chat(text, { speaker: { actor } });
  await table.settle();
}

/** The move stands and recovered: one result, recorded once, lock released. */
function expectMoveRecordedOnce({ momentum = 3 } = {}) {
  expect(table.cards(f => f.moveResolution)).toHaveLength(1);
  expect(sessionLog().filter(e => e.moveId === 'face_danger')).toHaveLength(1);
  expect(momentumOf('pc-pat')).toBe(momentum);
  expect(world().pendingMove).toBe(false);
}

/** Play continues: another player's move narrates. */
async function expectNextMoveNarrates() {
  const before = narrated().length;
  control.dice = STRONG;
  await move('pl-2', 'I follow her through.');
  await table.drain();
  expect(narrated()).toHaveLength(before + 1);
  expect(momentumOf('pc-quinn')).toBe(3);
  expect(world().pendingMove).toBe(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Late completion: Claude fails while a move is narrated
// ─────────────────────────────────────────────────────────────────────────────

describe('Claude fails while a move is narrated: the result stands, the narration is marked unavailable, play continues', () => {
  it.each([
    ['an overloaded API (529)', () => claudeFault.overloaded()],
    ['a server error (500)', () => claudeFault.serverError()],
    ['a malformed reply body', () => claudeFault.malformed()],
    ['a network error', () => claudeFault.networkError()],
    ['a reply with no text (synthetic)', () => ({ id: 'msg_empty', type: 'message', role: 'assistant', content: [], stop_reason: 'end_turn' })],
  ])('%s', async (_label, reply) => {
    expectConsoleError(/narrateResolution failed/);
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY }).when(isNarration, reply());

    await move();
    await table.drain();

    expectMoveRecordedOnce();
    expect(fallbacks()).toHaveLength(1);
    expect(fallbacks()[0].content).toMatch(/narration unavailable/i);
    expect(narrated()).toHaveLength(0);
    expect(world().sceneTruths).toEqual([]);
    await expectNextMoveNarrates();
  });

  it('a rate limit is retried once after 5 s — narrated once, recorded once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const trace = traceTable(table);
    scriptClaude(table, { fallback: () => REPLY }).when(isNarration, claudeFault.rateLimited());

    await move();
    expect(world().pendingMove).toBe(true);   // waiting out the retry delay
    trace.mark('advance 5 s');
    await vi.advanceTimersByTimeAsync(5_000);
    await table.drain();

    expect(table.claude.calls.filter(isNarration)).toHaveLength(2);
    expect(narrated()).toHaveLength(1);
    expect(fallbacks()).toHaveLength(0);
    expectMoveRecordedOnce();
  });

  it('a rate limit on the retry too: one fallback, the move recorded once, the lock released', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expectConsoleError(/narrateResolution (retry )?failed/);
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY }).when(isNarration, claudeFault.rateLimited(), { times: 2 });

    await move();
    await vi.advanceTimersByTimeAsync(5_000);
    await table.drain();

    expect(table.claude.calls.filter(isNarration)).toHaveLength(2);
    expect(fallbacks()).toHaveLength(1);
    expect(narrated()).toHaveLength(0);
    expectMoveRecordedOnce();
  });

  it.each([
    ['a reply body that stalls', () => claudeFault.stalledBody()],
    ['a request never answered', () => claudeFault.hang()],
  ])('%s: the request deadline ends it; the lock is held until then and released after', async (_label, reply) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expectConsoleError(/narrateResolution failed/);
    const trace = traceTable(table);
    scriptClaude(table, { fallback: () => REPLY }).when(isNarration, reply());

    await move();
    expect(world().pendingMove).toBe(true);
    trace.mark(`advance ${DEFAULT_TIMEOUT_MS / 1000} s — the request deadline`);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await table.drain();

    expect(getCapturedWarns().some(w => /Anthropic request timed out after 120s/.test(w))).toBe(true);
    expect(fallbacks()).toHaveLength(1);
    expectMoveRecordedOnce();
    vi.useRealTimers();
    await expectNextMoveNarrates();
  });

  it('KNOWN ISSUE MOVE-BUSY-NOTICE: a line typed while another move is narrated is dropped — the player who typed it is told', async () => {
    const trace = traceTable(table);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;
    trace.mark("Ren's player types while Kira's move is narrated");
    await move('pl-2', 'I follow her through.');
    narration.release(REPLY);
    await table.drain();

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);   // Ren's line ran no move …
    expect(notices('gm-1')).toContainEqual(expect.stringMatching(/already being resolved/));   // … and the GM was told
    await expectKnownIssue('MOVE-BUSY-NOTICE', /already being resolved/, async () => {
      expect(notices('pl-2').join(' | ')).toMatch(/already being resolved/);   // the player who typed is not
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Late completion: a dialog closed, a session ended mid-move
// ─────────────────────────────────────────────────────────────────────────────

describe('a move cut short', () => {
  it('the confirm dialog closed without choosing: no result, no narration, the lock released — the next move runs', async () => {
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY });
    control.confirm = null;   // DialogV2 resolves null when it is closed

    await move();
    await table.drain();

    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(table.claude.calls.filter(isNarration)).toHaveLength(0);
    expect(momentumOf('pc-pat')).toBe(2);
    expect(world().pendingMove).toBe(false);
    control.confirm = true;
    await expectNextMoveNarrates();
  });

  it('a session ended while a move is narrated: the move lands in its session, the session stays ended', async () => {
    const trace = traceTable(table);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;

    trace.mark('Ren ends the session while the narration is in flight');
    table.client('pl-2').answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
    await table.client('pl-2').chat('!end-session');
    await table.settle();
    expect(world()).toMatchObject({ sessionActive: false, sessionEndedId: 'sess-1' });

    trace.mark('the narration completes');
    narration.release(REPLY);
    await table.drain();

    expect(world()).toMatchObject({ sessionActive: false, sessionEndedId: 'sess-1', currentSessionId: 'sess-1', pendingMove: false });
    expect(sessionLog().filter(e => e.moveId === 'face_danger')).toHaveLength(1);
    expect(momentumOf('pc-pat')).toBe(3);
    expect(narrated().filter(c => c.flags[MODULE_ID].moveId === 'face_danger')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refused writes
// ─────────────────────────────────────────────────────────────────────────────

describe('a world write is refused', () => {
  it("the move's record is refused: the lock is still released and the GM is told; the next move runs", async () => {
    expectConsoleError(/Move interpretation failed/);
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY });
    const refused = failWrites(table, w => campaignStateWrite('gm-1')(w)
      && (w.value?.sessionLogs?.['sess-1'] ?? []).some(e => e.moveId === 'face_danger'));

    await move();
    await table.drain();

    expect(refused.refused).toBe(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(sessionLog()).toEqual([]);               // the record never landed …
    expect(momentumOf('pc-pat')).toBe(3);           // … the PC's sheet was written first, and stands
    expect(world().pendingMove).toBe(false);
    expect(notices('gm-1')).toContainEqual(expect.stringMatching(/^error: /));
    await expectNextMoveNarrates();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refused writes: the move lock (the claim and the release write a value a
// refusal must not leave half-applied in this client's cached setting)
// ─────────────────────────────────────────────────────────────────────────────

describe('the move lock survives a refused write', () => {
  it('the lock claim is refused: no move runs, the GM is told, and the next move runs — the lock is not left set', async () => {
    expectConsoleError(/could not claim the move lock/);
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY });
    const refused = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true);

    await move();
    await table.drain();

    expect(refused.refused).toBe(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(notices('gm-1')).toContainEqual(expect.stringMatching(/^error: .*could not start/));
    await expectNextMoveNarrates();
  });

  it('the lock release is refused once: the pipeline\'s finally releases it — the next move runs', async () => {
    expectConsoleError(/Failed to release pendingMove lock/);
    traceTable(table);
    scriptClaude(table, { fallback: () => REPLY });
    const refused = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === false);

    await move();
    await table.drain();

    expect(refused.refused).toBe(1);
    expectMoveRecordedOnce();
    await expectNextMoveNarrates();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refused writes: the X-Card pause
// ─────────────────────────────────────────────────────────────────────────────

describe('the X-Card card says whether its pause was saved', () => {
  it("the GM's X-Card pause is refused: the card says it was not saved, with no resume button", async () => {
    traceTable(table);
    failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.xCardActive === true);

    await table.client('gm-1').chat('!x');
    await table.drain();

    expect(world().xCardActive).not.toBe(true);
    const cards = table.cards(f => f.xcardCard);
    expect(cards).toHaveLength(1);
    expect(cards[0].flags[MODULE_ID].xcardRecorded).toBe(false);
    expect(cards[0].content).toMatch(/could not be saved/);
    expect(cards[0].content).not.toMatch(/Current content is suppressed/);
    expect(cards[0].content).not.toContain('sf-xcard-resume');
  });

  it("a player's X-Card the GM cannot save: the GM's card says so — the player's card could not know", async () => {
    const trace = traceTable(table);
    failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.xCardActive === true);

    await table.client('pl-1').chat('!x');
    await table.drain();

    expect(world().xCardActive).not.toBe(true);
    const cards = table.cards(f => f.xcardCard);
    trace.mark(`X-Card cards: ${cards.map(c => `${c.author} recorded=${c.flags[MODULE_ID].xcardRecorded}`).join(', ')}`);
    // The relay has no ack (decisions.md → GM relay), so the player's own card
    // says the scene is paused; the GM, whose write failed, says it was not.
    expect(cards.map(c => [c.author, c.flags[MODULE_ID].xcardRecorded])).toEqual([['pl-1', true], ['gm-1', false]]);
    expect(cards[1].content).toMatch(/could not be saved/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repeat clicks: a new NPC's draft card
// ─────────────────────────────────────────────────────────────────────────────

describe("Confirm on a new NPC's draft card applies once", () => {
  /** A "New Entities Detected" card for Vance Oduya, posted on the GM. */
  async function draftCard() {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false },
    ));
    await table.settle();
    const cards = table.cards(f => f.draftEntityCard);
    expect(cards).toHaveLength(1);
    return cards[0];
  }

  const vances = () => table.actors.filter(a => a.name === 'Vance Oduya' && a.flags?.[MODULE_ID]?.entityType === 'connection');

  it('Confirm on a new NPC clicked twice before the first finished: one NPC card', async () => {
    const trace = traceTable(table);
    const card = await draftCard();
    const gm = table.client('gm-1');
    trace.mark('the GM double-clicks Confirm');
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    expect(vances()).toHaveLength(1);
    expect(world().connectionIds).toEqual([vances()[0].id]);
    expect(table.world.message(card._id).flags[MODULE_ID].drafts.map(d => d.status)).toEqual(['confirmed']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repeat clicks: a suffer card
// ─────────────────────────────────────────────────────────────────────────────

describe('a suffer card applies one pick', () => {
  /** Kira rolls a weak hit; the suffer card ("make a suffer move -1") is posted. */
  async function sufferCard() {
    control.dice = WEAK;
    scriptClaude(table, { fallback: () => REPLY });
    await move();
    await table.drain();
    const cards = table.cards(f => f.sufferCard);
    expect(cards).toHaveLength(1);
    return cards[0];
  }

  // ANY_SUFFER_MOVES order: endure_harm, endure_stress, lose_momentum, sacrifice_resources, …
  const LOSE_MOMENTUM = 2;
  const SACRIFICE_RESOURCES = 3;
  const sufferApplied = () => [momentumOf('pc-pat') < 2, meter('pc-pat', 'supply') < 3].filter(Boolean).length;

  it('two suffer moves picked from one card on one client: one is applied', async () => {
    const trace = traceTable(table);
    const card = await sufferCard();
    const player = table.client('pl-1');
    trace.mark('Kira\'s player taps Lose Momentum, then Sacrifice Resources');
    player.click(card._id, '[data-action="sf-suffer-pick"]', { index: LOSE_MOMENTUM });
    player.click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.drain();

    expect(sufferApplied()).toBe(1);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
  });

  it('the player and the GM each pick a suffer move from the same card: one is applied', async () => {
    const trace = traceTable(table);
    const card = await sufferCard();
    trace.mark('the player taps Lose Momentum while the GM taps Sacrifice Resources');
    table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: LOSE_MOMENTUM });
    table.client('gm-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.drain();

    expect(sufferApplied()).toBe(1);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
  });

  it('a pick-two card still takes two picks, one after the other (control)', async () => {
    traceTable(table);
    const gm = table.client('gm-1');
    const { postSufferChoiceCard } = await gm.import('../../src/moves/sufferCard.js');
    await gm.run(() => postSufferChoiceCard({
      sufferPrompt: { kind: 'enumerated', multi: 2, options: [
        { label: '+1 momentum', momentum: 1 }, { label: '+1 supply', supply: 1 }, { label: '+1 spirit', spirit: 1 },
      ] },
      actor: table.actors.get('pc-pat'),
      moveId: 'secure_an_advantage',
    }));
    await table.settle();
    const [card] = table.cards(f => f.sufferCard);
    const player = table.client('pl-1');
    player.click(card._id, '[data-action="sf-suffer-pick"]', { index: 0 });
    await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID]).toMatchObject({ resolved: false, pickedIndices: [0] });
    player.click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
    await table.drain();

    expect(momentumOf('pc-pat')).toBe(3);
    expect(meter('pc-pat', 'supply')).toBe(4);
    expect(meter('pc-pat', 'spirit')).toBe(5);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Disconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("a relayed click the GM never receives", () => {
  it('Burn Momentum relayed while the GM\'s connection is down: nothing applies, the button re-arms, and the next click applies once', async () => {
    const trace = traceTable(table);
    control.dice = WEAK;
    table.actors.get('pc-pat').system.momentum.value = 10;
    scriptClaude(table, { fallback: () => REPLY });
    await move();
    await table.drain();
    const [card] = table.cards(f => f.moveResolution);
    expect(table.world.message(card._id).flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalApplied: true });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    trace.mark("the GM's connection drops (Foundry still lists the GM as active)");
    table.client('gm-1').connected = false;
    const player = table.client('pl-1');
    const button = () => player.render(card._id).querySelector('[data-action="sf-burn-momentum"]');
    player.click(card._id, '[data-action="sf-burn-momentum"]');
    await table.settle();
    expect(momentumOf('pc-pat')).toBe(10);
    expect(player.rendered.get(card._id).querySelector('[data-action="sf-burn-momentum"]').disabled).toBe(true);

    trace.mark(`advance ${RELAY_RECOVERY_MS / 1000} s — the relay recovery window`);
    await vi.advanceTimersByTimeAsync(RELAY_RECOVERY_MS);
    await table.settle();
    expect(player.rendered.get(card._id).querySelector('[data-action="sf-burn-momentum"]').disabled).toBe(false);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).not.toBe(true);

    vi.useRealTimers();
    trace.mark('the connection is back; the player clicks again');
    table.client('gm-1').connected = true;
    player.click(card._id, '[data-action="sf-burn-momentum"]');
    await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(momentumOf('pc-pat')).toBe(3);   // reset to 2, +1 for the strong hit — once
    expect(button().disabled).toBe(true);
  });
});
