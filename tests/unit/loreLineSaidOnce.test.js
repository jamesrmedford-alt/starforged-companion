/**
 * STARFORGED COMPANION
 * tests/unit/loreLineSaidOnce.test.js
 *
 * Issue #388 #18 (LORE-LINE-SAID-TWICE). A truth's Lore entry is titled
 * "Subject: fact" and holds the fact again, and ESTABLISHED LORE printed
 * `- <title>: <text>` — so every truth-made line said its fact twice: "- Mira
 * Kestrel: promised Tamsin Vey she would be back before the next cargo
 * arrives: promised Tamsin Vey she would be back before the next cargo
 * arrives". Now the fact is said once; a Lore entry of its own is as it was.
 */

import { describe, it, expect } from 'vitest';
import { loreLine, formatEstablishedLoreBlock } from '../../src/narration/narratorPrompt.js';

const FACT = 'promised Tamsin Vey she would be back before the next cargo arrives';

describe('a Lore line says its fact once (issue #388 #18)', () => {
  it('a truth\'s entry, titled with its subject and fact: the title is the line', () => {
    expect(loreLine(`Mira Kestrel: ${FACT}`, FACT)).toBe(`- Mira Kestrel: ${FACT}`);
    expect(loreLine('The beacon is a lure', 'The beacon is a lure')).toBe('- The beacon is a lure');
  });

  it('a title cut short of its fact gives way to the subject and the whole fact', () => {
    expect(loreLine('Mira Kestrel: promised Tamsin Vey she would be back…', FACT)).toBe(`- Mira Kestrel: ${FACT}`);
  });

  it('an entry of its own — a title and a text that says more — is as it was', () => {
    expect(loreLine('The Iron Hollow', 'A derelict ring where the old covenant met.')).toBe('- The Iron Hollow: A derelict ring where the old covenant met.');
    expect(loreLine('', 'Water is rationed on the lower ring.')).toBe('- Lore: Water is rationed on the lower ring.');
    expect(loreLine('The Iron Hollow', '')).toBe('- The Iron Hollow');
  });

  it('the prompt\'s ESTABLISHED LORE block writes it the same way', () => {
    expect(formatEstablishedLoreBlock([{ title: `Mira Kestrel: ${FACT}`, text: FACT }]))
      .toBe(`## ESTABLISHED LORE\n\n- Mira Kestrel: ${FACT}`);
  });
});
