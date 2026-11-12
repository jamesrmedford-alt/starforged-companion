/**
 * STARFORGED COMPANION
 * tests/unit/triggerVignetteLatePost.test.js
 *
 * TRIGGER-VIGNETTE-LATE-POST (found while fixing issue #338 D8). A clock's
 * trigger vignette ("⚠ TRIGGERED — …") posts after its Claude call. A Burn
 * Momentum or Improve Result that rewinds the clock out of its triggered state
 * meanwhile (D8) found no card to strike — or struck an earlier trigger's, of
 * the same clock this session — and the late vignette then landed live, its
 * truths binding, for a trigger that did not happen. Now a trigger vignette is
 * narrated into the story only while its clock is still full when its reply
 * comes in: otherwise no card posts and its narration writes nothing (its
 * sidecar is never applied). All three post sites: Pay the Price, `!clock` /
 * the Clocks panel, and Begin a Session's campaign clocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
// Begin a Session's campaign clock roll answered YES.
vi.mock('../../src/oracles/roller.js', async (orig) => ({
  ...(await orig()), rollYesNo: vi.fn(() => ({ answer: 'yes', roll: 1, isMatch: false })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { revertPayThePrice } from '../../src/moves/resultUpgrade.js';
import { adjustClockSegments, handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice, triggerVignettesSettled } from '../../src/clocks/payThePriceClocks.js';
import { applyBeginSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { deferred } from '../helpers/faults.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const state = () => game.settings.get(MODULE_ID, 'campaignState');

const VIGNETTE = 'The reactor core vents into the lower decks.\n```json\n'
  + '{"newTruths":[{"subject":"reactor","fact":"The reactor core is venting into the lower decks"}],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

/** Every Claude call waits for the test: `calls[i].resolve(reply(…))` answers the i-th. */
let calls;
const vignetteCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.clockVignetteCard);
const reactorTruths = () => (state().sceneTruths ?? []).filter(t => /reactor core is venting/.test(t.fact));

async function until(pred, label, ms = 2000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise(r => setTimeout(r, 2));
  }
  throw new Error(`timed out waiting for ${label}`);
}
/** A few macrotask turns: what follows a reply is microtasks and the stubs' writes. */
async function turns(n = 20) { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); }

let messages;
function setMessages(list) {
  messages = list;
  global.game.messages = { get contents() { return messages; }, get: (id) => messages.find(m => m.id === id) };
}

function campaignState(extra = {}) {
  return {
    currentSessionId: 'tv-s1', sessionNumber: 1, sessionActive: true, sessionStartedId: 'tv-s1',
    lastSessionTimestamp: new Date().toISOString(),
    currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 3, active: true }],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  ChatMessage._reset();
  game.actors._reset();
  global.game.user = { id: 'test-user-gm', isGM: true };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, campaignState());
  setMessages(ChatMessage._created);
  calls = [];
  apiPost.mockImplementation(() => { const d = deferred(); calls.push(d); return d.promise; });
});

describe('Pay the Price: a burn rewinds the clock while its trigger vignette is being written', () => {
  const PTP = { sufferMeterDeltas: [] };

  it('posts no vignette, and nothing of its narration reaches the ledgers', async () => {
    const advanced = await advanceClocksOnPayThePrice();
    expect(state().clocks[0].filled).toBe(4);              // the price fills it: TRIGGERED
    await until(() => calls.length === 1, 'the vignette\'s Claude call');

    // The burn lands while the vignette is still being written.
    await revertPayThePrice({ ...PTP, clocksAdvanced: advanced }, null, { kind: 'burn', failures: [] });
    expect(state().clocks[0].filled).toBe(3);

    // Every world write from here on: none may carry the vignette's truth —
    // its ledger persist runs in the background, so a write that later
    // retracted it would race the one that wrote it.
    const set = vi.spyOn(game.settings, 'set');
    try {
      calls[0].resolve(reply(VIGNETTE));
      await triggerVignettesSettled();
      await turns();
      const carried = set.mock.calls.filter(([, key, value]) => key === 'campaignState'
        && (value?.sceneTruths ?? []).some(t => /reactor core is venting/.test(t.fact)));
      expect(carried).toEqual([]);
    } finally {
      set.mockRestore();
    }

    expect(vignetteCards()).toEqual([]);
    expect(reactorTruths()).toEqual([]);
  });

  it("an earlier trigger's vignette of the same clock (before a reset) is not struck in its place", async () => {
    const earlier = makeTestMessage({
      content: '<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>The first breach.</em></div>',
      flags: { [MODULE_ID]: { clockCard: true, clockVignetteCard: true, narratorCard: true, narrationText: 'The first breach.',
        sessionId: 'tv-s1', narrationId: 'nar-first-breach', clockId: 't1' } },
    }, { author: 'test-user-gm' });
    setMessages([earlier]);

    const advanced = await advanceClocksOnPayThePrice();
    await until(() => calls.length === 1, 'the vignette\'s Claude call');
    await revertPayThePrice({ ...PTP, clocksAdvanced: advanced }, null, { kind: 'burn', failures: [] });
    calls[0].resolve(reply(VIGNETTE));
    await triggerVignettesSettled();
    await turns();

    expect(earlier.flags[MODULE_ID].burnSuperseded).toBeUndefined();   // that trigger happened
    expect(earlier.content).not.toMatch(/Superseded/);
  });

  it("a vow's countdown clock rewound by the burn: no vignette either", async () => {
    game.settings._store.set(KEY, campaignState({ clocks: [] }));
    const vow = {
      id: 'vow-item', name: "Chen's captivity", type: 'progress',
      system: { subtype: 'vow', hasClock: true, clockTicks: 3, clockMax: 4, completed: false },
      flags: { [MODULE_ID]: { vowId: 'vow-chen' } },
      async update(changes) { vow.system.clockTicks = changes['system.clockTicks']; return vow; },
    };
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [vow] } });
    game.actors._set('pc-kira', kira);

    const advanced = await advanceClocksOnPayThePrice();
    expect(vow.system.clockTicks).toBe(4);
    await until(() => calls.length === 1, 'the vignette\'s Claude call');
    await revertPayThePrice({ ...PTP, clocksAdvanced: advanced }, null, { kind: 'burn', failures: [] });
    expect(vow.system.clockTicks).toBe(3);

    calls[0].resolve(reply(VIGNETTE));
    await triggerVignettesSettled();
    await turns();

    expect(vignetteCards()).toEqual([]);
    expect(reactorTruths()).toEqual([]);
  });

  it('control: a trigger that stands posts its vignette, naming its clock, its truth live', async () => {
    await advanceClocksOnPayThePrice();
    await until(() => calls.length === 1, 'the vignette\'s Claude call');
    calls[0].resolve(reply(VIGNETTE));
    await triggerVignettesSettled();
    await turns();

    expect(vignetteCards()).toHaveLength(1);
    expect(vignetteCards()[0].flags[MODULE_ID].clockId).toBe('t1');
    expect(reactorTruths()).toMatchObject([{ retracted: false }]);
  });
});

describe('!clock fill onto the last segment, rewound while its vignette is written', () => {
  it('posts no vignette, and nothing of its narration reaches the ledgers', async () => {
    await handleClockCommand({ content: '!clock fill Reactor', flags: {} });
    expect(state().clocks[0].filled).toBe(4);
    await until(() => calls.length === 1, 'the vignette\'s Claude call');

    await adjustClockSegments('t1', -1);                   // the GM takes the fill back
    calls[0].resolve(reply(VIGNETTE));
    await turns();

    expect(vignetteCards()).toEqual([]);
    expect(reactorTruths()).toEqual([]);
  });

  it('control: left full, the vignette posts', async () => {
    await handleClockCommand({ content: '!clock fill Reactor', flags: {} });
    await until(() => calls.length === 1, 'the vignette\'s Claude call');
    calls[0].resolve(reply(VIGNETTE));
    await until(() => vignetteCards().length === 1, 'the vignette');
    expect(reactorTruths()).toMatchObject([{ retracted: false }]);
  });

  it("a co-GM's vignette relays nothing of a rewound trigger to the canonical GM", async () => {
    // Another GM is canonical: this one's narration side-data would be relayed there.
    game.users._set([{ id: 'gm-a', isGM: true, active: true }, { id: 'test-user-gm', isGM: true, active: true }]);
    game.socket._reset?.();
    await handleClockCommand({ content: '!clock fill Reactor', flags: {} });
    await until(() => calls.length === 1, 'the vignette\'s Claude call');

    await adjustClockSegments('t1', -1);
    calls[0].resolve(reply(VIGNETTE));
    await turns();

    expect(vignetteCards()).toEqual([]);
    expect((game.socket._emitted ?? []).filter(e => /narrator\.sidecar/.test(e.payload?.kind ?? ''))).toEqual([]);
  });
});

describe("Begin a Session's campaign clock, rewound while its trigger vignette is written", () => {
  beforeEach(() => {
    global.Hooks.callAll ??= (event, ...args) => Hooks.call(event, ...args);   // the stub has no callAll
    game.settings._store.set(KEY, campaignState({
      sessionActive: false, sessionStartedId: null,
      clocks: [{ _id: 'camp-1', name: 'Hostile expansion', type: 'campaign', segments: 4, filled: 3, active: true, advanceOdds: 'likely' }],
    }));
  });

  it('posts no vignette, and nothing of its narration reaches the ledgers', async () => {
    await applyBeginSession({ vignetteRolled: false, includeGalley: false });
    expect(state().clocks[0].filled).toBe(4);
    await until(() => calls.length === 1, 'the vignette\'s Claude call');

    await adjustClockSegments('camp-1', -1);
    calls[0].resolve(reply(VIGNETTE));
    await turns();

    expect(vignetteCards()).toEqual([]);
    expect(reactorTruths()).toEqual([]);
  });

  it('control: left full, the TRIGGERED vignette posts', async () => {
    await applyBeginSession({ vignetteRolled: false, includeGalley: false });
    await until(() => calls.length === 1, 'the vignette\'s Claude call');
    calls[0].resolve(reply(VIGNETTE));
    await until(() => vignetteCards().length === 1, 'the vignette');
    expect(vignetteCards()[0].content).toMatch(/TRIGGERED/);
    expect(vignetteCards()[0].flags[MODULE_ID].clockId).toBe('camp-1');
  });
});

/**
 * TRIGGER-VIGNETTE-POST-WINDOW (residual of TRIGGER-VIGNETTE-LATE-POST): the
 * vignette checks its clock when its reply comes in; a rewind landing during
 * the card's own creation round trip found the vignette still in flight (its
 * supersede skipped it) and the card posted live. The card now re-checks its
 * clock once posted and is struck — named for the upgrade that rewound it.
 */
describe('Pay the Price: a burn rewinds the clock while the vignette\'s card is being created', () => {
  const PTP = { sufferMeterDeltas: [] };

  it('the card that posted anyway is struck, its truth retracted, and it names the upgrade', async () => {
    const realCreate = ChatMessage.create;
    const gate = deferred();
    const reached = deferred();
    ChatMessage.create = async (data) => {
      if (data?.flags?.[MODULE_ID]?.clockVignetteCard) { reached.resolve(); await gate.promise; }
      return realCreate(data);
    };
    try {
      const advanced = await advanceClocksOnPayThePrice();
      await until(() => calls.length === 1, 'the vignette\'s Claude call');
      calls[0].resolve(reply(VIGNETTE));
      await reached.promise;                                // past its check, its card on the way

      await revertPayThePrice({ ...PTP, clocksAdvanced: advanced }, null, { kind: 'burn', failures: [], resolutionId: 'res-burned' });
      expect(state().clocks[0].filled).toBe(3);

      gate.resolve();
      await triggerVignettesSettled();
      await turns(40);
    } finally {
      ChatMessage.create = realCreate;
    }

    const [card] = vignetteCards();
    expect(card, 'the card posted (setup)').toBeDefined();
    expect(card.flags[MODULE_ID]).toMatchObject({ burnSuperseded: true, supersededFor: 'res-burned' });
    expect(card.content).toMatch(/Superseded/);
    await until(() => reactorTruths().every(t => t.retracted), 'the vignette\'s truth retracted');
    expect(reactorTruths().every(t => t.retractedBy === 'superseded')).toBe(true);
  });

  it('control: no rewind while the card is created — it stays live', async () => {
    const realCreate = ChatMessage.create;
    const gate = deferred();
    const reached = deferred();
    ChatMessage.create = async (data) => {
      if (data?.flags?.[MODULE_ID]?.clockVignetteCard) { reached.resolve(); await gate.promise; }
      return realCreate(data);
    };
    try {
      await advanceClocksOnPayThePrice();
      await until(() => calls.length === 1, 'the vignette\'s Claude call');
      calls[0].resolve(reply(VIGNETTE));
      await reached.promise;
      gate.resolve();
      await triggerVignettesSettled();
      await turns(40);
    } finally {
      ChatMessage.create = realCreate;
    }
    const [card] = vignetteCards();
    expect(card.flags[MODULE_ID].burnSuperseded).toBeUndefined();
    expect(reactorTruths()).toMatchObject([{ retracted: false }]);
  });
});
