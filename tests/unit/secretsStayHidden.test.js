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
  ['src/entities/connection.js', 'a deleted NPC card\'s agenda plan, retired with the card (issue #362 D10 — the plans\' subject ids are read, the plan retired; no plan field reaches a card)'],
  ['src/entities/entityExtractor.js', 'a significant threat\'s plan (planSignificantThreat — a write, no read)'],
  ['src/narration/narrator.js', 'the UNREVEALED block, the sidecar apply, the Private Channel story'],
  ['src/narration/worldSnapshot.js', 'the narrator\'s world snapshot (issue #357): every active plan, rendered as prompt text for the cached block — stored by worldSnapshotStore.js on a page of the GM-only Secrets journal, read by narrator.js alone'],
  ['src/oracles/oracleConsult.js', 'a yes/no about a planned subject: its truth sets the odds on the GM\'s client, sent to Claude, never to a card; a player\'s client is sent the odds word only (issue #354 P2-31)'],
  ['src/session/swearVow.js', 'a vow target\'s agenda plan (planNpcAgenda — a write, no read)'],
  ['src/ui/entityPanel.js', 'the GM-only "has a plan" marker — subject ids only (plannedSubjects)'],
  ['src/ui/progressTracks.js', 'the GM-only "has a plan" marker — subject ids only (plannedSubjects)'],
  ['src/ui/sessionPanel.js', 'the "What\'s open" list (issue #353 R4): a mystery\'s question while its truth is unrevealed, a revealed threat\'s or NPC agenda\'s subject and wants — no other plan field (sessionPanelOpenThreads.test.js)'],
  ['src/world/worldJournalPanel.js', 'the GM-only Secrets section'],
]);
const MODEL_READERS = new Map([
  ['src/narration/narrator.js', 'relevance and plan requests'],
  ['src/oracles/oracleConsult.js', 'which plan a question names'],
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

  it('the store posts chat only for a revealed truth and the opt-in roll display', () => {
    const store = byFile.get('src/world/secrets.js');
    const src = (name) => resolveFunctionSource(store, name) ?? '';
    expect(store.code.match(/ChatMessage\??\.create/g)).toHaveLength(1);
    expect(src('postSecretCard')).toMatch(/ChatMessage\?\.create\?\.\(/);
    // postSecretCard: the GM's Reveal now, and the rolls card.
    expect(['revealSkeletonNow', 'postRollsCard'].filter(n => /postSecretCard\(/.test(src(n)))).toEqual(['revealSkeletonNow', 'postRollsCard']);
    expect(store.code.match(/postSecretCard\(/g)).toHaveLength(3);   // its definition and those two calls
    // The rolls card: a truth the fiction revealed, and the opt-in display.
    expect(['onTruthRevealed', 'showRollsIfSet'].filter(n => /postRollsCard\(/.test(src(n)))).toEqual(['onTruthRevealed', 'showRollsIfSet']);
    expect(store.code.match(/postRollsCard\(/g)).toHaveLength(3);
    // The roll display only with the setting on; a truth's only once revealed.
    expect(src('showRollsIfSet')).toMatch(/if \(!hiddenRollsShownAtOnce\(\)/);
    expect(src('applyPlanSideData')).toMatch(/if \(truthNow\) await onTruthRevealed\(/);
  });

  it('the markers read subject ids only, and only for a GM', () => {
    for (const file of ['src/ui/entityPanel.js', 'src/ui/progressTracks.js']) {
      const code = byFile.get(file).code;
      expect(code, file).toMatch(/plannedSubjects\(\)\.ids/);
      expect(code, file).not.toMatch(/listSkeletons|getSkeleton|\.truth\b|oracleSeeds/);
      expect(code, file).toMatch(/game\.user\?\.isGM \? planned\w+Ids\(\) : new Set\(\)/);
    }
  });

  it('the Session panel reads a plan\'s question, subject and wants only — and each only when shown (issue #353 R4)', () => {
    const panel = byFile.get('src/ui/sessionPanel.js');
    // No hidden field is named anywhere in the panel.
    expect(panel.code).not.toMatch(/\.(?:truth|knows|clues|escalation|resolutions|oracleSeeds)\b/);
    const rows = resolveFunctionSource(panel, 'revealedPlanRows') ?? '';
    expect(rows).toMatch(/if \(!skeletonsEnabled\(\)\) return out;/);
    expect(rows).toMatch(/plan\.kind === "mystery" && plan\.truthRevealed !== true && plan\.question/);
    expect(rows).toMatch(/\(plan\.kind === "threat" \|\| plan\.kind === "npcAgenda"\) && plan\.truthRevealed === true && plan\.wants/);
    // The plans reach the panel through this one reader.
    expect(panel.code.match(/listSkeletons\(/g)).toHaveLength(1);
  });

  it('the world snapshot — its builder and its store — is read by the narrator\'s request alone (issue #357)', () => {
    // The snapshot's text holds every active plan. It reaches the prompt and
    // the GM-only page; no card builder and no panel reads either module.
    expect(importers('worldSnapshot\\.js')).toEqual(['src/narration/narrator.js', 'src/narration/worldSnapshotStore.js']);
    expect(importers('worldSnapshotStore\\.js')).toEqual(['src/narration/narrator.js']);
    const store = byFile.get('src/narration/worldSnapshotStore.js');
    const builder = byFile.get('src/narration/worldSnapshot.js');
    for (const module of [store, builder]) expect(module.code).not.toMatch(/ChatMessage/);
    // Stored on the Secrets journal — made with no player permission — and nowhere else.
    expect(store.code).toMatch(/getOrCreateWorldJournal\('secrets'\)/);
    expect(store.code).not.toMatch(/game\.settings\.set|JournalEntry\.create/);
    // The page's flag is read by the store alone.
    const flagReaders = sources.filter(s => /SNAPSHOT_FLAG\b/.test(s.code)).map(s => s.file);
    expect(flagReaders).toEqual(['src/narration/worldSnapshotStore.js']);
  });

  it('the narrator-card builders never read a plan', () => {
    const narrator = byFile.get('src/narration/narrator.js');
    for (const builder of ['postNarrationCard', 'postPacedNarrativeCard', 'postSceneCard', 'postOracleNarrationCard',
      'postRoundNarrationCard', 'postFallbackCard']) {
      const body = resolveFunctionSource(narrator, builder);
      expect(body, builder).toBeTruthy();
      expect(body, builder).not.toMatch(/listSkeletons|unrevealed|planRequests|secret|worldSnapshot|inPlay/i);
    }
  });
});
