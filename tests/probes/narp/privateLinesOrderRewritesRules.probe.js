/**
 * NARP-02 · STANDING-BLOCK-PRIVATE-LINES-ORDER (COST — a cached block that is not byte-stable)
 *
 * Scenario: two players (Pat, Sam) each keep one Private Line. Both are synced
 * to the canonical GM, and a narration is sent: its standing rules block — the
 * first cached block of the request, ahead of the world snapshot — lists both
 * lines. Then Pat reloads the page (or reconnects). Every client re-syncs its
 * Private Lines at `ready` (settingsPanel.js syncSafetyToCampaignState →
 * relayPrivateLinesToGm → gmRelay "safety.syncPrivateLines"), unchanged.
 *
 * Correct (rules/narrator-memory.md 7b: the standing block "changes only when
 * the table changes a setting, a Line or a truth"; a cache read needs the
 * bytes identical): nobody changed a Line, so the standing block of the next
 * narration is byte-identical and the cached rules, world snapshot and mode
 * blocks are read back.
 *
 * Today: applyPrivateLinesSync → withPrivateLinesEntry moves the syncing
 * user's entry to the END of campaignState.safety.privateLines, and the GM's
 * safety block lists the lines in entry order (context/safety.js
 * resolvePrivateLines "gm"). Pat's unchanged re-sync swaps the two lines, the
 * standing block's bytes change, and the next narration rewrites the whole
 * cached prefix — rules, world snapshot and mode — at the one-hour write price.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyPrivateLinesSync } from '../../../src/ui/settingsPanel.js';
import { buildNarratorSystemBlocks, splitNarratorSystemPrompt, buildNarratorSystemPrompt } from '../../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const PAT_LINE = 'SENTINEL-PAT: no spiders';
const SAM_LINE = 'SENTINEL-SAM: no drowning';
const SETTINGS = { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 };

const stored = () => game.settings.get(MODULE_ID, 'campaignState');
/** The standing rules block of a narration built now on the GM's client, as buildNarratorExtras hands the safety in (read from the store). */
const standingNow = () => buildNarratorSystemBlocks(stored(), SETTINGS, null, '',
  { mode: 'paced_narrative', safety: stored().safety }).standing;
/** A player's client syncing its Private Lines: the relay handler, on the canonical GM. */
const sync = (playerId, lines) => applyPrivateLinesSync({ lines }, { requesterId: playerId, requesterIsGM: false });

beforeEach(() => {
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's-1', sessionNumber: 1,
    safety: { lines: ['No harm to children'], veils: [], privateLines: [] },
  });
});

describe('NARP-02 — a player re-syncing unchanged Private Lines leaves the cached rules block byte-identical', () => {
  it('control: both players\' lines reach the GM\'s rules block', async () => {
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    const standing = standingNow();
    expect(standing).toContain(PAT_LINE);
    expect(standing).toContain(SAM_LINE);
  });

  it('control: the last player to sync re-syncing unchanged lines changes nothing', async () => {
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    const before = standingNow();
    await sync('pl-sam', [SAM_LINE]);   // Sam reloads
    expect(standingNow()).toBe(before);
  });

  it('control: a Line that really changes does change the block', async () => {
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    const before = standingNow();
    await sync('pl-pat', [PAT_LINE, 'SENTINEL-PAT-2: no needles']);
    expect(standingNow()).not.toBe(before);
  });

  it('Pat reloads (an unchanged re-sync): the rules block is byte-identical, so the cached prefix is read', async () => {
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    const before = standingNow();

    await sync('pl-pat', [PAT_LINE]);   // Pat's page reloads: the same lines, synced again at `ready`
    const after = standingNow();

    // The same set of lines either way.
    expect(after).toContain(PAT_LINE);
    expect(after).toContain(SAM_LINE);
    expect(after === before, 'the standing block is byte-identical after an unchanged re-sync').toBe(true);
  });

  it('…and so is the first cached block of the request built from it', async () => {
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    const requestBlocks = () => splitNarratorSystemPrompt(buildNarratorSystemPrompt(stored(), SETTINGS, null, '',
      { mode: 'paced_narrative', safety: stored().safety }));
    const before = requestBlocks();
    await sync('pl-pat', [PAT_LINE]);
    const after = requestBlocks();
    expect(before[0].cached).toBe(true);
    expect(after[0].text === before[0].text, 'the request\'s first cached block is unchanged').toBe(true);
  });
});
