/**
 * STARFORGED COMPANION
 * tests/unit/secretsStayHidden.test.js
 *
 * Issue #353 test plan, "static check: no secret text reaches any
 * player-visible card builder". A plan's truth and its hidden oracle rolls
 * reach exactly three places: the narrator's prompt (UNREVEALED), the GM-only
 * World Journal panel, and — when its truth is revealed, or with "show hidden
 * oracle rolls" on — the store's own reveal card. So:
 *   - only the modules below may import the store (src/world/secrets.js) or
 *     read a plan's page flag; a new reader is a decision, made here;
 *   - the store posts chat only through postSecretCard, and only from the
 *     GM's Reveal now and the opt-in roll display;
 *   - the narrator-card builders never read a plan.
 * The sentinel checks in narrativeSkeletonFlow.test.js test the same at run
 * time (no card, content or flags, carries a plan's truth).
 */

import { describe, it, expect } from 'vitest';
import { productionSources, resolveFunctionSource } from '../helpers/sourceScan.js';

const sources = productionSources();
const byFile = new Map(sources.map(s => [s.file, s]));

/** The modules that may import the store or its record model, and why. */
const STORE_READERS = new Map([
  ['src/narration/narrator.js', 'the UNREVEALED block, the sidecar apply, the Private Channel story'],
  ['src/world/worldJournalPanel.js', 'the GM-only Secrets section'],
]);
const MODEL_READERS = new Map([
  ['src/narration/narrator.js', 'relevance and plan requests'],
  ['src/factContinuity/sidecarParser.js', 'the sidecar keys\' normalisers'],
  ['src/world/secrets.js', 'the store'],
  ['src/world/worldJournalPanel.js', 'kind labels'],
]);

const importers = (target) => sources
  .filter(s => new RegExp(`from\\s+['"][./]*(?:world/)?${target}['"]|import\\(\\s*['"][./]*(?:world/)?${target}['"]`).test(s.code))
  .map(s => s.file)
  .sort();

describe('issue #353 — the hidden plans stay hidden', () => {
  it('only the allow-listed modules import the plan store', () => {
    expect(importers('secrets\\.js')).toEqual([...STORE_READERS.keys()].sort());
  });

  it('only the allow-listed modules import the plan model', () => {
    expect(importers('skeletons\\.js')).toEqual([...MODEL_READERS.keys()].sort());
  });

  it('a plan\'s page flag is read only by the store, its journal and the GM panel', () => {
    const readers = sources.filter(s => /FLAG_KEYS\.secrets\b|\bsecretEntry\b/.test(s.code)).map(s => s.file).sort();
    expect(readers).toEqual(['src/world/secrets.js', 'src/world/worldJournal.js', 'src/world/worldJournalPanel.js']);
  });

  it('the store posts chat only from Reveal now and the opt-in roll display', () => {
    const store = byFile.get('src/world/secrets.js');
    expect(store.code.match(/ChatMessage\??\.create/g)).toHaveLength(1);
    expect(resolveFunctionSource(store, 'postSecretCard')).toMatch(/ChatMessage\?\.create\?\.\(/);
    const callers = ['revealSkeletonNow', 'showRollsIfSet']
      .filter(name => /postSecretCard\(/.test(resolveFunctionSource(store, name) ?? ''));
    expect(callers).toEqual(['revealSkeletonNow', 'showRollsIfSet']);
    expect(store.code.match(/postSecretCard\(/g)).toHaveLength(3);   // its definition and those two calls
    // The roll display only with the setting on.
    expect(resolveFunctionSource(store, 'showRollsIfSet')).toMatch(/if \(!hiddenRollsShownAtOnce\(\)/);
  });

  it('the narrator-card builders never read a plan', () => {
    const narrator = byFile.get('src/narration/narrator.js');
    for (const builder of ['postNarrationCard', 'postPacedNarrativeCard', 'postSceneCard', 'postOracleNarrationCard',
      'postRoundNarrationCard', 'postFallbackCard']) {
      const body = resolveFunctionSource(narrator, builder);
      expect(body, builder).toBeTruthy();
      expect(body, builder).not.toMatch(/listSkeletons|unrevealed|planRequests|secret/i);
    }
  });
});
