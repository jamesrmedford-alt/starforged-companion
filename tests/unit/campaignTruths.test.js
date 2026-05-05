// tests/unit/campaignTruths.test.js
// Phase 8 — campaign truths digest builder.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatCampaignTruthsBlock,
  buildCampaignTruthsBlock,
} from '../../src/system/campaignTruths.js';
import { _clearPackCache, IS_PACKS } from '../../src/system/ironswornPacks.js';

describe('Phase 8 — formatCampaignTruthsBlock', () => {
  it('returns "" for an empty list', () => {
    expect(formatCampaignTruthsBlock([])).toBe('');
    expect(formatCampaignTruthsBlock(undefined)).toBe('');
    expect(formatCampaignTruthsBlock(null)).toBe('');
  });

  it('wraps entries in <campaign_truths> tags', () => {
    const block = formatCampaignTruthsBlock([
      { category: 'Cataclysm', title: 'Foe: AI', summary: 'War with the machines' },
      { category: 'Exodus',    title: 'Long journey' },
    ]);
    expect(block.startsWith('<campaign_truths>')).toBe(true);
    expect(block.endsWith('</campaign_truths>')).toBe(true);
    expect(block).toContain('Cataclysm: Foe: AI — War with the machines');
    expect(block).toContain('Exodus: Long journey');
  });

  it('skips entries without a title', () => {
    const block = formatCampaignTruthsBlock([
      { category: 'X' },
      { category: 'Y', title: 'Real one' },
    ]);
    expect(block).toContain('Y: Real one');
    expect(block).not.toMatch(/^- X/m);
  });

  it('returns "" when every entry is missing a title', () => {
    expect(formatCampaignTruthsBlock([{ category: 'no-title' }])).toBe('');
  });
});

describe('Phase 8 — buildCampaignTruthsBlock (live pack mock)', () => {
  let originalPacks;

  beforeEach(() => {
    _clearPackCache();
    originalPacks = global.game.packs;
  });

  afterEach(() => {
    global.game.packs = originalPacks;
  });

  it('returns "" when canonicalTruthSlugs is empty or absent', async () => {
    expect(await buildCampaignTruthsBlock({})).toBe('');
    expect(await buildCampaignTruthsBlock({ canonicalTruthSlugs: [] })).toBe('');
  });

  it('builds a digest from selected slugs that match pack documents', async () => {
    const cataclysm = {
      _id: 't1',
      name: 'Cataclysm',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/truths/cataclysm' } },
      pages: { contents: [{ name: 'Foe: AI', text: { content: '<p>Ancient war.</p>' } }] },
    };
    const exodus = {
      _id: 't2',
      name: 'Exodus',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/truths/exodus' } },
      pages: { contents: [{ name: 'Long journey', text: { content: '<p>Generations adrift.</p>' } }] },
    };
    const entries = [cataclysm, exodus];
    entries.find = (fn) => Array.prototype.find.call(entries, fn);
    entries.size = 2;
    global.game.packs = {
      get: (id) => id === IS_PACKS.STARFORGED_TRUTHS
        ? {
            index: entries,
            getDocument: async (id) => entries.find(e => e._id === id),
          }
        : null,
    };

    const block = await buildCampaignTruthsBlock({
      canonicalTruthSlugs: ['starforged/truths/cataclysm'],
    });
    expect(block).toContain('Cataclysm');
    expect(block).toContain('Foe: AI');
    expect(block).toContain('Ancient war.');
    expect(block).not.toContain('Exodus');
  });

  it('returns "" when no pack documents match the configured slugs', async () => {
    const truth = {
      _id: 't1', name: 'Cataclysm',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/truths/cataclysm' } },
      pages: { contents: [] },
    };
    const entries = [truth];
    entries.find = (fn) => Array.prototype.find.call(entries, fn);
    entries.size = 1;
    global.game.packs = {
      get: () => ({
        index: entries,
        getDocument: async (id) => entries.find(e => e._id === id),
      }),
    };

    expect(await buildCampaignTruthsBlock({
      canonicalTruthSlugs: ['something/unrelated'],
    })).toBe('');
  });
});
