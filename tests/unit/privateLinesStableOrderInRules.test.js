/**
 * STARFORGED COMPANION
 * tests/unit/privateLinesStableOrderInRules.test.js
 *
 * Issue #362 AC67 STANDING-BLOCK-PRIVATE-LINES-ORDER. Two players (Pat, Sam)
 * each keep a Private Line, synced to the canonical GM; a narration's standing
 * rules block — the request's first cached block, ahead of the world snapshot
 * — lists both. Then Pat reloads the page: every client re-syncs its Private
 * Lines at `ready` (settingsPanel.js → gmRelay "safety.syncPrivateLines" →
 * applyPrivateLinesSync), unchanged. The sync moved Pat's entry to the end of
 * campaignState.safety.privateLines, and the GM's safety block listed the
 * lines in entry order — so the same lines came out in another order, the
 * standing block's bytes changed, and the next narration rewrote the whole
 * cached prefix (rules, snapshot, mode) at the one-hour write price.
 * rules/narrator-memory.md 7b: the standing block changes only when the table
 * changes a setting, a Line or a truth.
 *
 * The GM's block now lists the Lines by their users' ids, whatever order the
 * syncs (or a lost update and its healing) left the entries in.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyPrivateLinesSync } from '../../src/ui/settingsPanel.js';
import { buildNarratorSystemBlocks, splitNarratorSystemPrompt, buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';
import { formatSafetyContext } from '../../src/context/safety.js';

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
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's-1', sessionNumber: 1,
    safety: { lines: ['No harm to children'], veils: [], privateLines: [] },
  });
});

describe('issue #362 AC67 — a player re-syncing unchanged Private Lines leaves the cached rules block byte-identical', () => {
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

  it('whichever order the syncs landed in, the same Lines give the same block', async () => {
    await sync('pl-sam', [SAM_LINE]);
    await sync('pl-pat', [PAT_LINE]);
    const samFirst = standingNow();
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 's-1', sessionNumber: 1,
      safety: { lines: ['No harm to children'], veils: [], privateLines: [] },
    });
    await sync('pl-pat', [PAT_LINE]);
    await sync('pl-sam', [SAM_LINE]);
    expect(standingNow()).toBe(samFirst);
  });
});

describe('issue #362 AC67 — the GM\'s safety block lists Private Lines in a stable order', () => {
  const stateWith = (privateLines) => ({ safety: { lines: [], veils: [], privateLines } });
  const pat = { playerId: 'pl-pat', lines: [PAT_LINE, 'SENTINEL-PAT-2: no needles'] };
  const sam = { playerId: 'pl-sam', lines: [SAM_LINE] };

  it('by user id, each user\'s own lines in their own order', () => {
    const out = formatSafetyContext(stateWith([sam, pat]), null, 'gm');
    expect(out).toBe(formatSafetyContext(stateWith([pat, sam]), null, 'gm'));
    expect(out.indexOf(PAT_LINE)).toBeLessThan(out.indexOf('SENTINEL-PAT-2'));
    expect(out.indexOf('SENTINEL-PAT-2')).toBeLessThan(out.indexOf(SAM_LINE));
  });

  it('control: a line two players share is listed once; a player\'s own request carries only their lines', () => {
    const shared = { playerId: 'pl-sam', lines: [SAM_LINE, PAT_LINE] };
    const out = formatSafetyContext(stateWith([shared, pat]), null, 'gm');
    expect(out.split(PAT_LINE)).toHaveLength(2);
    const own = formatSafetyContext(stateWith([sam, pat]), null, 'pl-sam');
    expect(own).toContain(SAM_LINE);
    expect(own).not.toContain(PAT_LINE);
  });
});
