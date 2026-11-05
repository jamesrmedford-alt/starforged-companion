/**
 * Issue #338 D8 BURN-REWINDS-FIRED-CLOCK-KEEPS-ITS-VIGNETTE (option A) — a
 * burn or improvement that rewinds a clock out of its triggered state
 * supersedes that clock's trigger vignette, and the superseded move narration
 * leaves the scene ledgers.
 *
 * Kira misses; the Pay the Price fills the "Reactor breach" tension clock and
 * it triggers: the "⚠ TRIGGERED" vignette, a narrator card whose sidecar wrote
 * "the reactor core is venting" into the scene ledger. She burns: the burn
 * reversal rewinds the clock to 3/4 and strikes the move's own narration — and
 * left the vignette a live narrator card (ring, rolling summary, recap) whose
 * truths stayed binding, with nothing linking it to the clock. The burn's own
 * superseded narration kept its ledger entries too: no caller in src/moves/
 * retracted by narration id. Now the trigger vignette names its clock
 * (`clockId`, at all three post sites); the reversal strikes the clock's
 * newest live trigger vignette of the session and flags it `burnSuperseded`
 * (the move narration's flag), and both narrations' ledger entries are
 * retracted by their narrationId (the X-Card's retractNarrations) — as
 * superseded, which renders nowhere and is never named under CORRECTED, but
 * does not stop a later narration stating the same fact.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/session/burnRewindFiredClockVignette.probe.js; the vignette
 * carries its clockId as the post sites now stamp it, and the flag asserted is
 * the one the move narration's supersede uses.)
 */

/* global makeTestMessage, expectConsoleError */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { revertPayThePrice } from '../../src/moves/resultUpgrade.js';
import { supersedeOriginalNarration } from '../../src/moves/burnMomentum.js';
import { applySidecar, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { createClock, handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice, vignetteClockId } from '../../src/clocks/payThePriceClocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const VIGNETTE_ID = 'nar-reactor-trigger';
const state = () => game.settings.get(MODULE_ID, 'campaignState');

let messages;
function setMessages(list) {
  messages = list;
  global.game.messages = { get contents() { return messages; }, get: (id) => messages.find(m => m.id === id) };
}

function vignetteCard({ narrationId = VIGNETTE_ID, clockId = 't1', sessionId = 'bs-s1', text = 'The reactor core vents into the lower decks.' } = {}) {
  return makeTestMessage({
    content: `<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>${text}</em></div>`,
    flags: { [MODULE_ID]: {
      clockCard: true, clockVignetteCard: true, narratorCard: true,
      narrationText: text, sessionId, narrationId, ...(clockId ? { clockId } : {}),
    } },
  }, { author: 'gm-1' });
}

function truth(id, fact, narrationId, extra = {}) {
  return { id, fact, subject: { kind: 'text', text: 'ship' }, category: 'situation', narrationId,
    sceneId: 'sc-1', sessionId: 'bs-s1', retracted: false, retractedBy: null, correctedTo: null, ...extra };
}

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'bs-s1', sessionNumber: 1, currentSceneId: 'sc-1',
    clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }],
    sceneTruths: [truth('tr-1', 'The reactor core is venting into the lower decks', VIGNETTE_ID)],
    sceneState: { bySubject: { kira: [{ attribute: 'location', value: 'the sealed lower deck', narrationId: VIGNETTE_ID,
      previous: { attribute: 'location', value: 'the engine room', narrationId: 'nar-earlier' } }] }, sceneId: 'sc-1' },
    sceneFrame: null,
  });
  setMessages([]);
});

const CLOCKS_ADVANCED = [{ _id: 't1', name: 'Reactor breach', type: 'tension', filled: 4, segments: 4, triggered: true }];

describe('issue #338 D8 — a burn rewinds a clock out of its triggered state', () => {
  it('the trigger vignette is struck and flagged out of memory, and its ledger entries are retracted', async () => {
    const vignette = vignetteCard();
    setMessages([vignette]);
    const failures = [];
    const reverted = await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures });

    expect(reverted).toEqual(['Reactor breach clock rewound']);
    expect(state().clocks[0].filled).toBe(3);
    expect(failures).toEqual([]);

    const f = vignette.flags[MODULE_ID];
    expect(f.burnSuperseded).toBe(true);
    expect(vignette.content).toMatch(/<s>The reactor core vents into the lower decks\.<\/s>/);
    expect(vignette.content).toMatch(/Superseded — momentum was burned and the clock rewound: this has not happened\./);

    // Its truth: retracted as superseded — never named under CORRECTED.
    const t = state().sceneTruths.find(x => x.id === 'tr-1');
    expect(t).toMatchObject({ retracted: true, retractedBy: 'superseded' });
    expect(sessionRetractedFacts(state()).join('\n')).not.toMatch(/reactor core/i);
    // Its state value gives way to the one it superseded.
    expect(state().sceneState.bySubject.kira[0]).toMatchObject({ value: 'the engine room', narrationId: 'nar-earlier' });
  });

  it("an improvement's reversal says so on the vignette", async () => {
    const vignette = vignetteCard();
    setMessages([vignette]);
    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'improve', failures: [] });
    expect(vignette.flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(vignette.content).toMatch(/the result was improved and the clock rewound/);
  });

  it("only the clock's newest trigger vignette of this session: an earlier trigger's (before a reset) and another session's stand", async () => {
    const earlier  = vignetteCard({ narrationId: 'nar-earlier-trigger', text: 'The first breach.' });
    const lastWeek = vignetteCard({ narrationId: 'nar-last-week', sessionId: 'bs-s0', text: 'Last week.' });
    const current  = vignetteCard();
    setMessages([lastWeek, earlier, current]);

    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });

    expect(current.flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(earlier.flags[MODULE_ID].burnSuperseded).toBeUndefined();
    expect(lastWeek.flags[MODULE_ID].burnSuperseded).toBeUndefined();
  });

  it('a clock the price advanced without triggering leaves every vignette alone', async () => {
    const vignette = vignetteCard();
    setMessages([vignette]);
    await revertPayThePrice({ clocksAdvanced: [{ ...CLOCKS_ADVANCED[0], filled: 3, triggered: false }], sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });
    expect(vignette.flags[MODULE_ID].burnSuperseded).toBeUndefined();
    expect(state().sceneTruths[0].retracted).toBe(false);
  });

  it('a rewind the world refuses leaves the vignette standing (the clock is still triggered)', async () => {
    expectConsoleError(/upgrade tensionClocks not applied|refused/i);
    const vignette = vignetteCard();
    setMessages([vignette]);
    const set = vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused by the test'));
    try {
      const failures = [];
      await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures });
      expect(failures).toHaveLength(1);
    } finally {
      set.mockRestore();
    }
    expect(vignette.flags[MODULE_ID].burnSuperseded).toBeUndefined();
    expect(state().sceneTruths[0].retracted).toBe(false);
  });

  it("a vow's countdown clock rewound out of its trigger supersedes its vignette, named by the vow", async () => {
    const item = { id: 'item-1', system: { clockTicks: 4 }, async update(changes) { item.system.clockTicks = changes['system.clockTicks']; return item; } };
    game.actors._set('pc-kira', { id: 'pc-kira', name: 'Kira', items: [item] });
    const entry = { actorId: 'pc-kira', itemId: 'item-1', vowId: 'vow-chen', name: "Chen's captivity", type: 'vow', filled: 4, segments: 4, triggered: true };
    expect(vignetteClockId(entry)).toBe('vow-chen');
    const vignette = vignetteCard({ clockId: 'vow-chen' });
    setMessages([vignette]);

    const reverted = await revertPayThePrice({ clocksAdvanced: [entry], sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });

    expect(reverted).toEqual(["Chen's captivity clock rewound"]);
    expect(item.system.clockTicks).toBe(3);
    expect(vignette.flags[MODULE_ID].burnSuperseded).toBe(true);
  });

  it('control: the clock is rewound to 3/4 and the reversal card names it', async () => {
    setMessages([vignetteCard()]);
    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });
    expect(state().clocks[0].filled).toBe(3);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.burnReversal);
    expect(card?.content ?? '').toMatch(/Reactor breach clock rewound/);
  });
});

describe("issue #338 D8 — the superseded move narration's own ledger entries are retracted", () => {
  const MOVE_NID = 'nar-move-miss';
  function narrationCard() {
    return makeTestMessage({
      content: '<div class="sf-narration-card"><div class="sf-narration-prose">Kira is pinned under the fallen bulkhead.</div></div>',
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Kira is pinned…', sessionId: 'bs-s1', resolutionId: 'res-1', narrationId: MOVE_NID } },
    }, { author: 'gm-1' });
  }
  beforeEach(() => {
    const cs = state();
    game.settings._store.set(KEY, {
      ...cs,
      sceneTruths: [...cs.sceneTruths, truth('tr-m', 'Kira is pinned under the fallen bulkhead', MOVE_NID, { subject: { kind: 'text', text: 'Kira' } })],
      sceneFrame: { location: 'the lower deck', present: ['Kira'], situation: 'pinned', narrationId: MOVE_NID },
    });
  });

  it('in the store and on the upgrade\'s working copy — and the re-narration may state the same fact again', async () => {
    const card = narrationCard();
    setMessages([card]);
    const working = foundry.utils.deepClone(state());

    await supersedeOriginalNarration({ resolutionId: 'res-1' }, { campaignState: working });

    expect(card.flags[MODULE_ID].burnSuperseded).toBe(true);
    for (const cs of [state(), working]) {
      expect(cs.sceneTruths.find(t => t.id === 'tr-m')).toMatchObject({ retracted: true, retractedBy: 'superseded' });
      expect(cs.sceneFrame).toBeNull();
      // The vignette's entries (another narration) are untouched.
      expect(cs.sceneTruths.find(t => t.id === 'tr-1').retracted).toBe(false);
    }

    // The re-narration's sidecar states the same fact: recorded, not blocked as a strike would be.
    const { truthIds } = applySidecar({ newTruths: [{ subject: 'Kira', fact: 'Kira is pinned under the fallen bulkhead.' }] },
      { campaignState: working, narrationId: 'nar-move-burned' });
    expect(truthIds).toHaveLength(1);
    expect(working.sceneTruths.filter(t => !t.retracted && /pinned/.test(t.fact))).toHaveLength(1);
  });

  it('control: an X-Card retraction still blocks the narrator re-asserting the fact', () => {
    const cs = foundry.utils.deepClone(state());
    retractNarrations(cs, [MOVE_NID]);
    expect(cs.sceneTruths.find(t => t.id === 'tr-m').retractedBy).toBe('xcard');
    const { truthIds } = applySidecar({ newTruths: [{ subject: 'Kira', fact: 'Kira is pinned under the fallen bulkhead.' }] },
      { campaignState: cs, narrationId: 'nar-next' });
    expect(truthIds).toHaveLength(0);
  });

  it('a narration with nothing left in the ledgers writes nothing', async () => {
    game.settings._store.set(KEY, { ...state(), sceneTruths: [], sceneFrame: null, sceneState: { bySubject: {}, sceneId: 'sc-1' } });
    setMessages([narrationCard()]);
    const set = vi.spyOn(game.settings, 'set');
    try {
      await supersedeOriginalNarration({ resolutionId: 'res-1' });
      expect(set).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
    }
  });
});

describe('issue #338 D8 — a trigger vignette names its clock (the Begin a Session site: burnSupersedesNarrationLedger.test.js)', () => {
  const RAW = 'The reactor screams.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
  async function waitForCard(pred, label, ms = 1500) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const card = ChatMessage._created.find(m => pred(m.flags?.[MODULE_ID] ?? {}));
      if (card) return card;
      await new Promise(r => setTimeout(r, 5));
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    global.game.user = { id: 'gm-1', isGM: true };
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(KEY, { ...state(), clocks: [], sceneTruths: [] });
    apiPost.mockResolvedValue(reply(RAW));
  });

  it('a Pay the Price that fills a tension clock', async () => {
    const clock = await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    const cs = state();
    game.settings._store.set(KEY, { ...cs, clocks: cs.clocks.map(c => ({ ...c, filled: 3 })) });
    ChatMessage._reset();

    await advanceClocksOnPayThePrice();
    const card = await waitForCard(f => f.clockVignetteCard, 'the trigger vignette');
    expect(card.flags[MODULE_ID].clockId).toBe(clock?._id ?? state().clocks[0]._id);
  });

  it('`!clock fill` onto the last segment; an advance that does not trigger names none', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    const id = state().clocks[0]._id;
    ChatMessage._reset();

    await handleClockCommand({ content: '!clock advance Reactor', flags: {} });   // 1/4: a notch vignette
    const notch = await waitForCard(f => f.clockVignetteCard, 'the notch vignette');
    expect(notch.flags[MODULE_ID].clockId).toBeUndefined();

    game.settings._store.set(KEY, { ...state(), clocks: state().clocks.map(c => ({ ...c, filled: 3 })) });
    ChatMessage._reset();
    await handleClockCommand({ content: '!clock fill Reactor', flags: {} });
    const trigger = await waitForCard(f => f.clockVignetteCard, 'the trigger vignette');
    expect(trigger.flags[MODULE_ID].clockId).toBe(id);
  });
});
