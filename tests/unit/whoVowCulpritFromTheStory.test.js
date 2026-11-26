/**
 * STARFORGED COMPANION
 * tests/unit/whoVowCulpritFromTheStory.test.js
 *
 * VOW-WON-BY-A-STRANGER (the long haul's eighth live round, 2026-11-26,
 * explorations/long-haul-live-20261126-184225/): the vow "Find who is raiding
 * the Cinder Expanse lanes" was won at a91 by naming "Dalen Voss, of the
 * Spire's own administration" — the plan the oath decided at a3 — whom the
 * player had never met: "Voss's face is not one you have seen". The cold
 * read's first complaint.
 *
 * The maintainer's call: a who-vow's culprit is one of the people the story
 * has met where one fits, and a new one is shown in play before the truth is
 * revealed. DECIDE NOW lists the people met; a decided who-plan whose truth
 * names a stranger is told to show them first.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { strangerNamedIn } from '../../src/world/skeletons.js';
import { formatUnrevealedBlock } from '../../src/narration/narratorPrompt.js';

const RUN = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-184225/replay.json'), 'utf8'));
const VOW = 'Find who is raiding the Cinder Expanse lanes';
/** a3's plan, as the oath decided it. */
const A3_TRUTH = (() => {
  const reply = RUN.recording.exchanges.find(x => x.step === 'a3' && /callNarratorAPI>call$/.test(x.kind)).response.content.map(c => c.text ?? '').join('');
  return /"truth":\s*"([^"]+)"/.exec(reply)[1];
})();
const PLAN = { id: 'plan-vow-1', kind: 'vow', subject: { type: 'vow', id: 'vow-1', name: VOW }, truth: A3_TRUTH,
  wants: 'To steer the lanes', escalation: [], clues: [{ id: 'c1', text: 'two relay consoles disagree' }], resolutions: [] };

describe('the one behind a who-vow: one met, or a stranger shown first', () => {
  it('a3\'s plan names Dalen Voss, whom the story had not met', () => {
    expect(A3_TRUTH).toContain('Dalen Voss');
    expect(strangerNamedIn(A3_TRUTH, { people: ['Tamsin Okoro'], notNames: ['Hollow Spire', 'Bleakhold Station'] })).toBe('Dalen Voss');
    // Met, he is no stranger; a truth that names one of the story's people names none.
    expect(strangerNamedIn(A3_TRUTH, { people: ['Tamsin Okoro', 'Dalen Voss'] })).toBeNull();
    expect(strangerNamedIn('Tamsin keeps the raiders\' schedules in her ledger.', { people: ['Tamsin Okoro'] })).toBeNull();
    expect(strangerNamedIn('Someone in the Spire\'s administration steers the lanes.', { people: [] })).toBeNull();
  });

  it('DECIDE NOW lists the people met for a who-vow, and prefers them', () => {
    const block = formatUnrevealedBlock([], {
      planRequests: [{ ref: 'plan-nar-1-vow', kind: 'vow', trigger: 'vow', label: `what is really behind the vow "${VOW}"`, oracleSeeds: [] }],
      people: ['Tamsin Okoro', 'Vance Oduya'],
    });
    expect(block).toContain('Its truth names the one behind it — a person, by name: one of the people the story has met if one fits '
      + '(Tamsin Okoro, Vance Oduya), else a new name; a new one is shown in play, by name, before the truth is revealed.');
  });

  it('a decided who-plan that names a stranger is told to show them before the reveal; a met one is not', () => {
    const shown = formatUnrevealedBlock([PLAN], { strangers: { 'plan-vow-1': 'Dalen Voss' } });
    expect(shown).toContain('- Not yet in play: Dalen Voss. Before this truth is revealed, show Dalen Voss in the story — seen, met, or spoken of by name — as one of its clues.');
    expect(formatUnrevealedBlock([PLAN], { strangers: {} })).not.toContain('Not yet in play');
  });
});
