/**
 * Eleventh audit — UPG-6 BURN-GONE-ROLLER-BURNS-FIRST-PC.
 *
 * Kira's Gather Information missed (its Pay the Price cost her 1 health) and
 * her move card still offers 🔥 Burn Momentum. Her character is deleted from
 * the world (her player left the campaign) before anyone presses it. A GM's
 * press reaches applyBurnFromRelay, whose `resolveActor` falls back to the
 * world's FIRST player character when the card's own roller is gone
 * (burnMomentum.js:804-810 — `getActor(actorId) ?? getPlayerActors()[0]`):
 * Ren's momentum is burned and reset, his meters swapped for the strong hit's,
 * and the price Kira paid is refunded onto Ren (revertPayThePrice's
 * `refundTo = … ?? actor`). Improve Result on the same card refuses ("no
 * character"), as a suffer card whose PC is gone does (issue #336 Y20: "A
 * suffer card applies to its own character or to nobody"). Credit the roller:
 * never the first PC.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/burnGoneRollerBurnsFirstPc.probe.js
 */

/* global silenceConsoleErrors, makeTestActor */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyBurnFromRelay, registerBurnMomentumHook } from '../../../src/moves/burnMomentum.js';
import { applyImproveFromRelay, registerImproveResultHook } from '../../../src/moves/improveResult.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const GM_CTX = { requesterId: 'gm-1', requester: { id: 'gm-1', isGM: true }, requesterIsGM: true, local: true };

let ren;

function makeCard(id, moduleFlags) {
  const msg = {
    id,
    content: '<div class="sf-move-card"><div class="sf-move-outcome">Miss</div></div>',
    flags: { [MODULE_ID]: moduleFlags },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        if (path === 'content') { msg.content = val; continue; }
        const parts = path.split('.');
        let t = msg;
        for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
        t[parts.at(-1)] = val;
      }
    }),
  };
  return msg;
}

// Kira's miss — her price's receipt: Endure Harm (-1), health 3 → 2 — on her card.
const PRICE = { clocksAdvanced: [], sufferMeterDeltas: [{ move: 'endure_harm', meterKey: 'health', amount: 1, actorId: 'pc-kira', before: 3, after: 2 }] };
const ORIGINAL = { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0, routePayThePrice: true };

const burnCard = () => makeCard('m-burn', { burn: {
  canBurn: true, challengeDice: [2, 7], momentum: 9, outcomeMomentum: 0, markedImpactCount: 0,
  moveId: 'gather_information', originalOutcome: 'miss', originalConsequences: ORIGINAL,
  previewOutcome: 'strong_hit', originalApplied: true, actorId: 'pc-kira', resolutionId: null, ptpReversals: PRICE,
} });

const improveCard = () => makeCard('m-imp', { improve: {
  canImprove: true, improveTo: 'strong_hit', moveId: 'gather_information', isMatch: false,
  originalOutcome: 'miss', originalConsequences: ORIGINAL, originalApplied: true, actorId: 'pc-kira',
  resolutionId: null, ptpReversals: PRICE, assetId: null, abilityIndex: null, assetName: 'Fugitive', abilityName: '',
  hasClock: false, clockMax: 4, consumed: false,
} });

function installMessages(...msgs) {
  game.messages = { contents: msgs, get: (id) => msgs.find(m => m.id === id) ?? null };
}

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1' });
  ChatMessage._reset();
  registerBurnMomentumHook({ narrate: vi.fn(async () => {}) });
  registerImproveResultHook({ narrate: vi.fn(async () => {}) });
  // Kira (pc-kira) is gone from the world; Ren — another player's — is the first PC.
  ren = makeTestActor({ id: 'pc-ren', type: 'character', name: 'Ren',
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, health: { value: 4, max: 5 } } });
  ren.ownership = { 'pl-2': 3 };
  game.actors._set('pc-ren', ren);
  invalidateActorCache('pc-ren');
  silenceConsoleErrors();
});

describe('UPG-6 — a burn on a move card whose roller is gone', () => {
  it('control: Improve Result on the same card refuses — no character — and Ren is untouched', async () => {
    installMessages(improveCard());
    const res = await applyImproveFromRelay({ messageId: 'm-imp' }, GM_CTX);
    expect(res).toMatchObject({ applied: false, reason: 'no-actor' });
    expect(ren.system.momentum.value).toBe(9);
    expect(ren.system.health.value).toBe(4);
  });

  it('burns nobody\'s momentum: refused, and the first PC\'s meters stand', async () => {
    installMessages(burnCard());
    const res = await applyBurnFromRelay({ messageId: 'm-burn' }, GM_CTX);
    expect(res).toMatchObject({ applied: false, reason: 'no-actor' });
    expect(ren.system.momentum.value).toBe(9);     // not burned and reset to 2 + the strong hit's +2
    expect(ren.system.health.value).toBe(4);       // Kira's refund never lands on Ren
  });
});
