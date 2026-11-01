/**
 * STARFORGED COMPANION
 * tests/unit/narratorLiveSafety.test.js
 *
 * The narrator's safety block and RECENT ORACLE RESULTS come from the stored
 * campaignState, not the caller's snapshot (issue #321 U08) — the unit half
 * of tests/unit/moveNarrationStaleSnapshot.test.js. buildNarratorExtras reads
 * `safety` and the recent-oracle ring from the store (extras.safety,
 * extras.recentOracles); buildNarratorSystemPrompt renders extras.safety in
 * place of the snapshot's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const snapshot = () => ({
  currentSessionId: 'sess-1',
  safety: { lines: ['old line'], veils: [], privateLines: [] },
  recentOracles: [],
});

beforeEach(() => {
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
});

describe('buildNarratorExtras reads safety and recent oracles live', () => {
  it('takes Lines, Veils and Private Lines from the store, not the snapshot', async () => {
    game.settings._store.set(KEY, {
      ...snapshot(),
      safety: { lines: ['old line', 'new line'], veils: ['a veil'], privateLines: [{ playerId: 'pl-1', lines: ['spiders'] }] },
    });
    const extras = await buildNarratorExtras('move_resolution', snapshot(), {});
    expect(extras.safety).toEqual({
      lines: ['old line', 'new line'], veils: ['a veil'], privateLines: [{ playerId: 'pl-1', lines: ['spiders'] }],
    });
  });

  it("takes the session's recent oracle results from the store", async () => {
    game.settings._store.set(KEY, {
      ...snapshot(),
      recentOracles: [{ name: 'Ask the Oracle', question: 'is the hatch rigged', answer: 'Yes', sessionId: 'sess-1' }],
    });
    const extras = await buildNarratorExtras('move_resolution', snapshot(), {});
    expect(extras.recentOracles).toEqual([{ name: 'Ask the Oracle', question: 'is the hatch rigged', answer: 'Yes' }]);
  });

  // Nothing stored (a unit context, an early read): the caller's copy.
  it("falls back to the caller's copy when nothing is stored", async () => {
    const extras = await buildNarratorExtras('move_resolution', snapshot(), {});
    expect(extras.safety).toEqual({ lines: ['old line'], veils: [], privateLines: [] });
  });
});

describe('buildNarratorSystemPrompt renders the live safety block', () => {
  it("prefers extras.safety over the snapshot's", () => {
    const prompt = buildNarratorSystemPrompt(snapshot(), {}, null, '', {
      mode: 'move_resolution',
      safety: { lines: ['new line'], veils: [], privateLines: [{ playerId: 'pl-1', lines: ['spiders'] }] },
    });
    expect(prompt).toMatch(/### LINES[^\n]*\n- new line/);
    expect(prompt).toMatch(/### PRIVATE LINES[^\n]*\n- spiders/);
    expect(prompt).not.toContain('old line');
  });
});
