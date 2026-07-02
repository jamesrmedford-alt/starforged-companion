/**
 * STARFORGED COMPANION
 * tests/unit/combatThreshold.test.js
 *
 * The "Enter the Fray, or take a way out" threshold card builder (#241 Phase 1).
 */

import { describe, it, expect } from 'vitest';
import { buildCombatThresholdHtml, WAY_OUT_PROMPT } from '../../src/moves/combatThreshold.js';

describe('buildCombatThresholdHtml', () => {
  it('renders Enter the Fray + way-out buttons and the foe label', () => {
    const html = buildCombatThresholdHtml({ label: 'Crimson Guard', suggestedRank: 'formidable' });
    expect(html).toContain('data-action="sf-enter-fray"');
    expect(html).toContain('data-action="sf-way-out"');
    expect(html).toContain('Crimson Guard');
  });

  it('preselects the narrator-suggested rank in the difficulty select', () => {
    const html = buildCombatThresholdHtml({ label: 'foe', suggestedRank: 'epic' });
    expect(html).toContain('<option value="epic" selected>epic</option>');
  });

  it('defaults a missing/invalid rank to dangerous', () => {
    expect(buildCombatThresholdHtml({ label: 'foe' }))
      .toContain('<option value="dangerous" selected>dangerous</option>');
    expect(buildCombatThresholdHtml({ label: 'foe', suggestedRank: 'bogus' }))
      .toContain('<option value="dangerous" selected>dangerous</option>');
  });

  it('lists open vows as link options plus a "not tied" default', () => {
    const html = buildCombatThresholdHtml({ label: 'foe', vowNames: ['Rescue the hostages'] });
    expect(html).toContain('(not tied to a vow)');
    expect(html).toContain('Rescue the hostages');
  });

  it('escapes HTML in the label and vow names', () => {
    const html = buildCombatThresholdHtml({ label: '<b>x</b>', vowNames: ['"q"'] });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('WAY_OUT_PROMPT', () => {
  it('names the non-combat options and that the fight only begins on Enter the Fray', () => {
    expect(WAY_OUT_PROMPT).toMatch(/Face Danger|Compel|Secure an Advantage/);
    expect(WAY_OUT_PROMPT).toMatch(/Enter the Fray/);
  });
});

describe('buildCombatThresholdHtml — carried opening position', () => {
  it('renders the in-control line when position is in_control', () => {
    const html = buildCombatThresholdHtml({ label: 'raiders', position: 'in_control' });
    expect(html).toContain('in control');
    expect(html).not.toContain('bad spot');
  });

  it('renders the bad-spot line when position is bad_spot', () => {
    const html = buildCombatThresholdHtml({ label: 'raiders', position: 'bad_spot' });
    expect(html).toContain('in a bad spot');
  });

  it('renders no position line when position is absent (weak hit / none)', () => {
    const html = buildCombatThresholdHtml({ label: 'raiders' });
    expect(html).not.toContain('If you enter this fight');
  });
});
