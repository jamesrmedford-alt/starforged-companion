/**
 * PROBE — SESSION-05 BURN-REWINDS-FIRED-CLOCK-KEEPS-ITS-VIGNETTE (tenth audit, area session — a decision row)
 *
 * What the user does: Kira misses; the Pay the Price advances the "Reactor
 * breach" tension clock onto its last segment. The clock triggers: the
 * "⏳ The clock turns" card and then the "⚠ TRIGGERED — …" vignette post
 * (src/clocks/payThePriceClocks.js:82-116) — a narrator card whose sidecar
 * wrote the trigger into the scene ledger ("the reactor core is venting",
 * stamped with the vignette's narrationId). Kira then burns momentum: the
 * miss becomes a hit, the burn reversal rewinds the clock to 3/4
 * (revertPayThePrice, src/moves/resultUpgrade.js:278-297 — "⏰ Burn reversal
 * … Reactor breach clock rewound") and strikes through the move's own
 * narration (supersedeOriginalNarration, src/moves/burnMomentum.js:597).
 *
 * What happens: the trigger vignette stands untouched. It stays a live
 * narrator card — in the recent-narration ring, the rolling summary and the
 * session recap — and the truths its sidecar wrote stay binding in the scene
 * ledger: the narrator is told the breach happened while the clock says it
 * did not. The next Pay the Price fills the last segment again and fires a
 * second "⚠ TRIGGERED" vignette for the same clock. The move narration the
 * burn superseded is struck and left out of memory (issue #313 / W20); the
 * vignette narrated from that same superseded outcome is not, and nothing
 * links the vignette card to the clock it narrated (it carries no clock id).
 *
 * What should happen (recommended): the burn reversal that rewinds a clock
 * out of its triggered state supersedes that clock's trigger vignette as it
 * supersedes the move narration — the card struck and flagged out of memory,
 * its narrationId's ledger entries retracted (the X-Card's retractNarrations
 * already does this by id) — so the narrator is not told of a trigger the
 * table undid. The other option: keep the vignette as fiction that stands
 * ("it nearly happened") and say so on the reversal card.
 *
 * Control: the clock itself is rewound to 3/4 and the reversal card says so.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/burnRewindFiredClockVignette.probe.js
 */

/* global makeTestMessage */
import { describe, it, expect, beforeEach } from 'vitest';

import { revertPayThePrice } from '../../../src/moves/resultUpgrade.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const VIGNETTE_ID = 'nar-reactor-trigger';
const state = () => game.settings.get(MODULE_ID, 'campaignState');

let vignette;

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'bs-s1', sessionNumber: 1, currentSceneId: 'sc-1',
    clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }],
    sceneTruths: [{
      id: 'tr-1', fact: 'The reactor core is venting into the lower decks', subject: 'ship', category: 'situation',
      narrationId: VIGNETTE_ID, sceneId: 'sc-1', sessionId: 'bs-s1', confidence: 'binding',
    }],
    sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
  });
  // The trigger vignette the Pay the Price posted, as payThePriceClocks.js posts it.
  vignette = makeTestMessage({
    content: '<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>The reactor core vents into the lower decks.</em></div>',
    flags: { [MODULE_ID]: {
      clockCard: true, clockVignetteCard: true, narratorCard: true,
      narrationText: 'The reactor core vents into the lower decks.', sessionId: 'bs-s1', narrationId: VIGNETTE_ID,
    } },
  }, { author: 'gm-1' });
  global.game.messages = { contents: [vignette], get: (id) => (vignette.id === id ? vignette : undefined) };
});

const CLOCKS_ADVANCED = [{ _id: 't1', name: 'Reactor breach', type: 'tension', filled: 4, segments: 4, triggered: true }];

describe('SESSION-05 a burn rewinds a clock out of its triggered state', () => {
  it('the trigger vignette the undone Pay the Price narrated is superseded and its ledger facts retracted', async () => {
    const failures = [];
    const reverted = await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures });

    // Sanity: the clock is rewound and the reversal card says so.
    expect(reverted).toEqual(['Reactor breach clock rewound']);
    expect(state().clocks[0].filled).toBe(3);
    expect(failures).toEqual([]);

    // Expected: the vignette is no longer a live narrator card (struck / flagged out of
    // memory, as the burn does to the move narration). Actual: untouched.
    const f = vignette.flags?.[MODULE_ID] ?? {};
    expect(!!(f.superseded || f.xCarded || f.narrationSuperseded)).toBe(true);
    // Expected: the truth its sidecar wrote is retracted. Actual: still binding.
    const truth = state().sceneTruths.find(t => t.id === 'tr-1');
    expect.soft(!!truth?.retracted || !!truth?.retractedBy).toBe(true);
  });

  it('control: the clock is rewound to 3/4 and the reversal card names it', async () => {
    const failures = [];
    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures });

    expect(state().clocks[0].filled).toBe(3);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.burnReversal);
    expect(card?.content ?? '').toMatch(/Reactor breach clock rewound/);
  });
});
