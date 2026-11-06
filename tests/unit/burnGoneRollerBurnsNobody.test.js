/**
 * STARFORGED COMPANION
 * tests/unit/burnGoneRollerBurnsNobody.test.js
 *
 * Issue #342 Z48 BURN-GONE-ROLLER-BURNS-FIRST-PC (the upgrades auditor's
 * UPG-6 probe).
 *
 * Kira's Gather Information missed (its Pay the Price cost her 1 health) and
 * her move card still offers 🔥 Burn Momentum. Her character is deleted from
 * the world (her player left the campaign) before anyone presses it. A GM's
 * press reached applyBurnFromRelay, whose `resolveActor` fell back to the
 * world's FIRST player character when the card's own roller was gone
 * (`getActor(actorId) ?? getPlayerActors()[0]`): Ren's momentum was burned
 * and reset, his meters swapped for the strong hit's, and the price Kira paid
 * was refunded onto Ren (revertPayThePrice's `refundTo = … ?? actor`). The
 * burn now resolves the card's own roller or nobody — refused `no-actor`, as
 * Improve Result on the same card is and a suffer card whose PC is gone
 * (issue #336 Y20: "A suffer card applies to its own character or to
 * nobody") — and a receipt that names its PC refunds that PC or nobody.
 * Credit the roller: never the first PC.
 */

/* global silenceConsoleErrors, makeTestActor */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyBurnFromRelay, registerBurnMomentumHook } from '../../src/moves/burnMomentum.js';
import { applyImproveFromRelay, registerImproveResultHook } from '../../src/moves/improveResult.js';
import { revertPayThePrice } from '../../src/moves/resultUpgrade.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

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

describe('Z48 — a burn on a move card whose roller is gone', () => {
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

describe('Z48 — a reversal refunds the PC its receipt names, or nobody', () => {
  it("a receipt naming a PC who is gone refunds no one — not the upgrading PC", async () => {
    const reverted = await revertPayThePrice(PRICE, ren, { kind: 'improve', failures: [] });
    expect(reverted).toEqual([]);
    expect(ren.system.health.value).toBe(4);
  });

  it('control: a receipt naming the upgrading PC refunds them', async () => {
    const own = { clocksAdvanced: [], sufferMeterDeltas: [{ ...PRICE.sufferMeterDeltas[0], actorId: 'pc-ren' }] };
    const reverted = await revertPayThePrice(own, ren, { kind: 'improve', failures: [] });
    expect(reverted).toEqual(['health +1 refunded']);
    expect(ren.system.health.value).toBe(5);
  });
});
