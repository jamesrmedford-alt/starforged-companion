/**
 * STARFORGED COMPANION
 * tests/unit/playtestFixesV1728.test.js
 *
 * Unit coverage for the v1.7.28 playtest-fix batch:
 *   #1 abilityScanner — robust JSON extraction (trailing prose can't break it)
 *   #3 audio cache    — eviction throttle + positive-lookup memo
 *   #5 statEnrichment — no-stat moves log at debug, not warn
 *   #6 native roll    — parse/classify foundry-ironsworn vow/connection rolls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { parseHaikuResponse } from '../../src/moves/abilityScanner.js';
import { enrichInterpretationStatValue } from '../../src/moves/statEnrichment.js';
import {
  parseIronswornProgressRoll,
  classifyProgressRoll,
} from '../../src/narration/nativeProgressRoll.js';
import {
  lookup as cacheLookup,
  write as cacheWrite,
  evictIfOverflow,
  _resetAudioCacheStateForTests,
} from '../../src/audio/cache.js';

// ─────────────────────────────────────────────────────────────────────────────
// #1 abilityScanner — robust JSON extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('#1 parseHaikuResponse — trailing prose tolerance', () => {
  it('parses valid JSON followed by trailing prose (the recurring playtest bug)', () => {
    const raw = '{"matches":[{"key":"empath","summary":"roll +heart","statReplacement":"heart"}]}\n'
      + 'Here is the analysis you requested.';
    const out = parseHaikuResponse(raw);
    expect(out).toEqual([{ key: 'empath', summary: 'roll +heart', statReplacement: 'heart' }]);
  });

  it('still parses fenced JSON', () => {
    const raw = '```json\n{"matches":[{"key":"a","summary":"s"}]}\n```';
    expect(parseHaikuResponse(raw)).toEqual([{ key: 'a', summary: 's', statReplacement: null }]);
  });

  it('returns [] on unparseable input', () => {
    expect(parseHaikuResponse('not json at all')).toEqual([]);
    expect(parseHaikuResponse('')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #5 statEnrichment — no-stat moves are debug, not warn
// ─────────────────────────────────────────────────────────────────────────────

describe('#5 enrichInterpretationStatValue — no-stat noise', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs at debug (not warn) for a legitimately no-stat move (ask_the_oracle)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warnSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const interp = { moveId: 'ask_the_oracle', statUsed: null };
    const v = enrichInterpretationStatValue({}, interp, {});
    expect(v).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();
  });

  it('still warns for a stat-bearing move missing its stat', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const interp = { moveId: 'face_danger', statUsed: null };
    enrichInterpretationStatValue({}, interp, {});
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #6 native foundry-ironsworn progress-roll detection
// ─────────────────────────────────────────────────────────────────────────────

function rollCard({ progress, stat, dice = [3, 8], moveDsId } = {}) {
  const roll = { preRollOptions: {}, rawChallengeDiceValues: dice };
  if (progress !== undefined) roll.preRollOptions.progress = progress;
  if (stat !== undefined)     roll.preRollOptions.stat = stat;
  if (moveDsId)               roll.preRollOptions.moveDsId = moveDsId;
  // Mirror Handlebars {{json}} inside a single-quoted attribute: HTML-escape.
  const escaped = JSON.stringify(roll)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  return `<article class='ironsworn-roll' data-ironswornroll='${escaped}'><div>graphic</div></article>`;
}

describe('#6 parseIronswornProgressRoll', () => {
  it('parses a progress roll and computes the outcome', () => {
    const out = parseIronswornProgressRoll(rollCard({ progress: { source: 'Find Chen', value: 6 }, dice: [3, 8] }));
    expect(out).toMatchObject({ score: 6, challengeDice: [3, 8], outcome: 'weak_hit', source: 'Find Chen' });
  });

  it('computes strong hit and miss correctly', () => {
    expect(parseIronswornProgressRoll(rollCard({ progress: { source: 'V', value: 9 }, dice: [3, 8] })).outcome).toBe('strong_hit');
    expect(parseIronswornProgressRoll(rollCard({ progress: { source: 'V', value: 2 }, dice: [3, 8] })).outcome).toBe('miss');
  });

  it('returns null for an action roll (stat, not progress)', () => {
    expect(parseIronswornProgressRoll(rollCard({ stat: { source: 'iron', value: 3 } }))).toBeNull();
  });

  it('returns null for non-roll content and our own cards', () => {
    expect(parseIronswornProgressRoll('<div class="sf-narration-card">prose</div>')).toBeNull();
    expect(parseIronswornProgressRoll('')).toBeNull();
    expect(parseIronswornProgressRoll(null)).toBeNull();
  });

  it('survives apostrophes in the source name (HTML-escaped)', () => {
    const out = parseIronswornProgressRoll(rollCard({ progress: { source: "Avenger's Hoard", value: 5 }, dice: [1, 2] }));
    expect(out.source).toBe("Avenger's Hoard");
    expect(out.outcome).toBe('strong_hit');
  });
});

describe('#6 classifyProgressRoll', () => {
  it('uses moveDsId when present', () => {
    expect(classifyProgressRoll({ moveDsId: 'move:starforged/quest/fulfill_your_vow' })).toBe('fulfill_your_vow');
    expect(classifyProgressRoll({ moveDsId: 'move:starforged/connection/forge_a_bond' })).toBe('forge_a_bond');
    expect(classifyProgressRoll({ moveDsId: 'move:starforged/connection/develop_your_relationship' })).toBe('forge_a_bond');
  });

  it('falls back to the source subtype lookup', () => {
    expect(classifyProgressRoll({ source: 'Vow A' }, () => 'vow')).toBe('fulfill_your_vow');
    expect(classifyProgressRoll({ source: 'Pal' }, () => 'connection')).toBe('forge_a_bond');
  });

  it('returns null for non-vow/connection progress (expedition/combat/unknown)', () => {
    expect(classifyProgressRoll({ moveDsId: 'move:starforged/exploration/finish_an_expedition' }, () => null)).toBeNull();
    expect(classifyProgressRoll({ source: 'Expedition X' }, () => null)).toBeNull();
    expect(classifyProgressRoll({})).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #3 audio cache — eviction throttle + lookup memo
// ─────────────────────────────────────────────────────────────────────────────

const HASH = 'a'.repeat(64);

describe('#3 audio cache throttle + memo', () => {
  let browseSpy;
  beforeEach(() => {
    _resetAudioCacheStateForTests();
    globalThis.foundry.applications.apps.FilePicker.implementation._reset();
    browseSpy = vi.spyOn(globalThis.foundry.applications.apps.FilePicker.implementation, 'browse');
  });
  afterEach(() => vi.restoreAllMocks());

  it('throttles repeated eviction sweeps but honours force', async () => {
    await evictIfOverflow(1000);                 // first sweep runs (browses root)
    expect(browseSpy).toHaveBeenCalled();
    browseSpy.mockClear();

    await evictIfOverflow(1000);                  // within interval → throttled
    expect(browseSpy).not.toHaveBeenCalled();

    await evictIfOverflow(1000, { force: true }); // bypass throttle
    expect(browseSpy).toHaveBeenCalled();
  });

  it('memoises a positive lookup so the second call does not browse again', async () => {
    await cacheWrite(HASH, new Uint8Array([1, 2, 3]));
    browseSpy.mockClear();

    const first = await cacheLookup(HASH);
    expect(first).toBeTruthy();
    expect(browseSpy).toHaveBeenCalledTimes(1);

    browseSpy.mockClear();
    const second = await cacheLookup(HASH);
    expect(second).toBe(first);
    expect(browseSpy).not.toHaveBeenCalled();     // served from memo
  });
});
