/**
 * STARFORGED COMPANION
 * tests/unit/helpJournal.test.js
 *
 * Issue #300 F16 — the Safety help page said Private Lines are "visible only
 * to you and the GM … never visible to other players". They are never shown
 * in another player's interface or sent in another player's narration
 * request, but the canonical GM stores them in the world-scoped campaignState,
 * which every client receives (decisions.md → Private Lines, "Boundary"). The
 * help, and every other line of module text, must describe the privacy the
 * module actually provides.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { PAGES } from '../../src/help/helpJournal.js';
import { productionSources } from '../helpers/sourceScan.js';

const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';

describe('help journal — Private Lines privacy wording', () => {
  const safety = page('Safety System');

  it('no longer promises the lines are never visible to other players', () => {
    expect(safety).toContain('<strong>Private Lines</strong>');
    expect(safety).not.toMatch(/never visible to other players/i);
    expect(safety).not.toMatch(/visible only to you/i);
  });

  it('says who can see them, what is never shared, and that they sit in shared world data', () => {
    expect(safety).toContain('<strong>Who can see them:</strong> the GM can.');
    expect(safety).toContain('never shown in another player&rsquo;s interface or sent in another player&rsquo;s narration request');
    expect(safety).toContain('stored in the world&rsquo;s shared data, which another player could read from their browser&rsquo;s developer console');
  });

  it('no module text promises Private Lines are visible only to their owner', () => {
    const offenders = productionSources()
      .filter(({ text }) => /visible only to you|never visible to other players/i.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

// Issue #322 V07 (the audit's helpJournalAccuracy probe, HELP-RANK-TICKS-WRONG):
// the Progress Tracks page's "Ticks per mark" column listed boxes (3, 2, 1,
// ½, ¼) — one Mark Progress adds 12 / 8 / 4 / 2 / 1 ticks. The First Session
// walkthrough sent players to make a vow in the Progress Tracks panel, which
// lists no vows (they live on the character sheet — decisions.md), and two
// pages still put their buttons "in Token Controls", where the floating
// toolbar replaced them.
describe('help journal — Progress Tracks copy', () => {
  let progress, journal, savedJournal;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    progress = await import('../../src/ui/progressTracks.js');
  });
  beforeEach(() => {
    const flags = {};
    journal = {
      id: 'pt', name: 'Starforged Progress Tracks',
      getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
    };
    savedJournal = game.journal;
    game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  });
  afterEach(() => { game.journal = savedJournal; });

  it.each([
    ['troublesome', 'Troublesome'], ['dangerous', 'Dangerous'], ['formidable', 'Formidable'],
    ['extreme', 'Extreme'], ['epic', 'Epic'],
  ])('%s: the documented ticks per mark equal one Mark Progress', async (rank, label) => {
    const track  = await progress.addProgressTrack({ label: `A ${rank} fight`, type: 'combat', rank });
    const marked = await progress.markProgressById(track.id);
    const row = page('Progress Tracks').match(new RegExp(`<td>${label}</td><td>([^<]*)</td>`));
    expect(row, 'rank row present in the help table').toBeTruthy();
    expect(Number.parseFloat(row[1])).toBe(marked.ticks);
  });

  it('no page sends a player to make a vow in the Progress Tracks panel', () => {
    expect(page('First Session')).not.toMatch(/Progress Tracks<\/strong> panel and create a <strong>vow/);
    expect(page('First Session')).toMatch(/Add a <strong>vow<\/strong> to your character sheet/);
    expect(page('Toolbar Buttons')).not.toMatch(/complete vows/);
  });

  it('no page places a button in Token Controls', () => {
    for (const p of PAGES) expect(p.text.content, p.name).not.toContain('Token Controls');
    expect(page('Progress Tracks')).toContain('floating toolbar');
    expect(page('Entities & Portraits')).toContain('floating toolbar');
  });
});
