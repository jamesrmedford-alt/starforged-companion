/**
 * STARFORGED COMPANION
 * tests/unit/nativeRollNarration.test.js
 *
 * #248 Theme D — native-sheet vow/connection rolls are first-class:
 *   - ironswornRollKind() separates a normal action roll from a malformed
 *     progress card, so the hook can log each at the right level.
 *   - planNativeRollNarration() decides act/skip + reason + log level so the
 *     native-roll bridge never skips without a trace (decisions.md → "No
 *     silent failures").
 */

import { describe, it, expect } from 'vitest';
import { ironswornRollKind, planNativeRollNarration } from '../../src/narration/nativeProgressRoll.js';

// Mirror the vendor card: the serialised roll lives in a single-quoted,
// HTML-escaped data-ironswornroll attribute. `raw` injects a payload verbatim
// (for the malformed-card cases).
function rollCard({ progress, stat, dice = [3, 8], moveDsId, raw } = {}) {
  if (raw !== undefined) {
    return `<article class='ironsworn-roll' data-ironswornroll='${raw}'><div>graphic</div></article>`;
  }
  const roll = { preRollOptions: {}, rawChallengeDiceValues: dice };
  if (progress !== undefined) roll.preRollOptions.progress = progress;
  if (stat !== undefined)     roll.preRollOptions.stat = stat;
  if (moveDsId)               roll.preRollOptions.moveDsId = moveDsId;
  const escaped = JSON.stringify(roll)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  return `<article class='ironsworn-roll' data-ironswornroll='${escaped}'><div>graphic</div></article>`;
}

describe('ironswornRollKind', () => {
  it('identifies a progress roll', () => {
    expect(ironswornRollKind(rollCard({ progress: { source: 'V', value: 6 } }))).toBe('progress');
  });

  it('identifies an action roll', () => {
    expect(ironswornRollKind(rollCard({ stat: { source: 'iron', value: 3 } }))).toBe('action');
  });

  it('returns not-a-roll for non-roll content', () => {
    expect(ironswornRollKind('<div class="sf-narration-card">prose</div>')).toBe('not-a-roll');
    expect(ironswornRollKind('')).toBe('not-a-roll');
    expect(ironswornRollKind(null)).toBe('not-a-roll');
  });

  it('returns unparseable for a roll marker with broken JSON (vendor-shape change)', () => {
    expect(ironswornRollKind(rollCard({ raw: '{not valid json' }))).toBe('unparseable');
  });

  it('returns unparseable for a roll payload missing preRollOptions', () => {
    const escaped = JSON.stringify({ rawChallengeDiceValues: [3, 8] }).replace(/"/g, '&quot;');
    expect(ironswornRollKind(rollCard({ raw: escaped }))).toBe('unparseable');
  });
});

describe('planNativeRollNarration — no silent failures', () => {
  it('stands down quietly when this client is not the roller', () => {
    expect(planNativeRollNarration({ isRoller: false, rollKind: 'progress', parsed: { source: 'V' }, moveId: 'fulfill_your_vow' }))
      .toEqual({ act: false, reason: 'not-this-clients-roll', log: 'none' });
  });

  it('narrates when the roller parsed a classified vow/connection roll', () => {
    expect(planNativeRollNarration({ isRoller: true, rollKind: 'progress', parsed: { source: 'V', outcome: 'weak_hit' }, moveId: 'fulfill_your_vow' }))
      .toEqual({ act: true, reason: 'narrate', log: 'debug' });
  });

  it('debug-logs a progress roll that is not a vow/connection (expedition/combat)', () => {
    expect(planNativeRollNarration({ isRoller: true, rollKind: 'progress', parsed: { source: 'Expedition' }, moveId: null }))
      .toEqual({ act: false, reason: 'not-vow-or-connection', log: 'debug' });
  });

  it('stays quiet on a normal action roll', () => {
    expect(planNativeRollNarration({ isRoller: true, rollKind: 'action', parsed: null, moveId: null }))
      .toEqual({ act: false, reason: 'action-roll', log: 'none' });
  });

  it('WARNS on an unparseable roll card (a possible vendor-shape change)', () => {
    expect(planNativeRollNarration({ isRoller: true, rollKind: 'unparseable', parsed: null, moveId: null }))
      .toEqual({ act: false, reason: 'unparseable-roll-card', log: 'warn' });
  });

  it('stays quiet on an ordinary non-roll message', () => {
    expect(planNativeRollNarration({ isRoller: true, rollKind: 'not-a-roll', parsed: null, moveId: null }))
      .toEqual({ act: false, reason: 'not-an-ironsworn-roll', log: 'none' });
  });

  it('treats missing facts as a quiet stand-down (no throw)', () => {
    expect(planNativeRollNarration()).toEqual({ act: false, reason: 'not-this-clients-roll', log: 'none' });
  });
});
