/**
 * SWP — ROUND-FIELDS-WRITE-ONLY (eleventh audit, sweep).
 *
 * The Batch Mode round is its own world setting (`batchMode.round`), so
 * tests/unit/campaignStateFields.test.js — the check that every stored field
 * has a writer and a reader — never sees its fields. Two non-timestamp fields
 * the round stores have a writer and no reader anywhere in production:
 *
 *   - `sceneId` — createRound stores the scene the round opened in
 *     (driver.js openRoundIfDue: `sceneId: cs.currentSceneId`); nothing reads
 *     it back (the narration uses whatever scene is current when it runs);
 *   - `resolverClaim` — beginResolution stores the move-lock claim the
 *     resolving GM holds, and its doc says "The resolver's claim names the GM
 *     resolving it, so another client's recovery leaves it alone while that GM
 *     is connected" — but recovery reads `resolverId` only (driver.js
 *     recoverRound / onUserConnected).
 *
 * rules/reachability.md §1: "A producer with zero consumers is a bug … a
 * schema field"; the tenth audit's Y44 (a write-only card flag) and the
 * X50 / X55 / X66 precedent ("A field nothing reads is retired, not kept").
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../../scripts/deadscan.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

// Every production file that touches the round (imports a batch module, or is one).
const ROUND_FILES = [
  'src/batch/round.js', 'src/batch/driver.js', 'src/batch/relay.js', 'src/batch/roundView.js',
  'src/ui/roundWindow.js', 'src/ui/companionToolbar.js', 'src/narration/narrator.js',
  'src/moves/movePipeline.js', 'src/multiplayer/gmRelay.js', 'src/index.js',
];
// The names a round is held under in those files.
const ROUND_NAMES = 'round|r|latest|next|prev|previous|stored|before|after|closed|opened|finished|view';

function code(file) {
  return stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/** Reads of `<round>.field` (an access that is not the left side of an assignment). */
function roundReads(field) {
  const re = new RegExp(`\\b(?:${ROUND_NAMES})\\??\\.${field}\\b(?!\\s*=[^=>])`, 'g');
  return ROUND_FILES.flatMap(f => [...code(f).matchAll(re)].map(m => `${f}: ${m[0]}`));
}

/** Writes: `field:` in an object literal in the round modules (createRound / beginResolution / their callers). */
function roundWrites(field) {
  const re = new RegExp(`[{,\\s]${field}\\s*[:,]`, 'g');
  return ['src/batch/round.js', 'src/batch/driver.js'].flatMap(f => [...code(f).matchAll(re)].map(() => f));
}

describe('SWP — a field the round stores is read somewhere', () => {
  it('control: resolverId is written and read (recovery leaves a connected resolver alone)', () => {
    expect(roundWrites('resolverId').length).toBeGreaterThan(0);
    expect(roundReads('resolverId').length).toBeGreaterThan(0);
  });

  it('control: closeReason is written and read (the window keeps a closed round\'s text as a draft)', () => {
    expect(roundWrites('closeReason').length).toBeGreaterThan(0);
    expect(roundReads('closeReason').length).toBeGreaterThan(0);
  });

  it.each(['sceneId', 'resolverClaim'])('%s: written, and read by something', (field) => {
    expect(roundWrites(field).length, `${field} is written`).toBeGreaterThan(0);
    expect(roundReads(field), `${field} is stored on the round and read nowhere`).not.toEqual([]);
  });
});
