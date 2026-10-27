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

import { describe, it, expect } from 'vitest';
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
