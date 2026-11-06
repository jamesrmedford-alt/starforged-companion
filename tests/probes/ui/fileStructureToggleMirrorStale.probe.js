/**
 * UI-9 FILE-STRUCTURE-TOGGLE-MIRROR-STALE (eleventh audit, ui).
 *
 * docs/file-structure.md's progressTracks.js row says the panel's position
 * toggle is "mirrored to the clicker's assigned character
 * (`game.user.character`) when it is a PC they own (U05, U19)". Issue #326
 * W56 changed that: the toggle sends the clicker's PC as resolveUserActorId
 * resolves it (assigned PC → an owned PC → for a GM with none, the campaign's
 * first PC), and the GM cycles that PC's own position — `game.user.character`
 * was null for a solo GM and cycled the fight's position instead (the W56
 * bug). docs/flows/combat-flow.md tells it right; the file map — "what each
 * file exports and does", read every session — still describes the bug.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const doc = readFileSync('docs/file-structure.md', 'utf8');
const row = doc.split('\n').find(l => l.startsWith('| `progressTracks.js` |')) ?? '';
const panel = readFileSync('src/ui/progressTracks.js', 'utf8');

describe('UI-9: the file map\'s Progress Tracks row and the position toggle', () => {
  it('control: the toggle sends resolveUserActorId\'s PC, and the combat flow map says so', () => {
    const toggle = panel.split('static #onToggleCombatState(')[1]?.split('\n  }\n')[0] ?? '';
    expect(toggle).toMatch(/resolveUserActorId\(game\.user, game\.settings\.get\(MODULE_ID, 'campaignState'\)\)/);
    expect(readFileSync('docs/flows/combat-flow.md', 'utf8').replace(/\s+/g, ' '))
      .toMatch(/the clicker's PC resolved by `resolveUserActorId`/);
    expect(row).toMatch(/the toggle cycles/);                                  // control: the row
  });

  it('the row does not describe the toggle as mirrored to `game.user.character`', () => {
    expect(row).not.toMatch(/assigned character \(`game\.user\.character`\)/);
  });
});
