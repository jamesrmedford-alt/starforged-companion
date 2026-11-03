/**
 * PROBE — FC-10 REVIEW-SHIP-HINT-NO-COMMAND
 * (src/world/worldJournal.js postContradictionNotification REMEDY_HINTS.ship;
 *  echoed in docs/flows/narrator-consistency-flow.md §2)
 *
 * What the user does: the consistency check flags prose that contradicts the
 * SHIP POSITION line ("ship" kind). The GM's ◈ Narrative Review card carries
 * the targeted remedy instead of the Retract button (NARRCHK-REMEDY-MISMATCH):
 *   "Ship position lives on the ship record — correct it with !ship or by
 *    moving the command-vehicle token."
 * The GM types `!ship Bleakhold`.
 *
 * What happens: there is no `!ship` command that sets a position — only
 * `!ship envision` and `!ship history` exist (CHAT_COMMAND_ROUTES). The line
 * matches no route, and as a `!`-prefixed line it is not player narration
 * either: nothing happens, and the stale position stands. The command that
 * corrects the ship position is `!at <place>` (maybeUpdateShipPositionFromName
 * "at_command").
 *
 * What should happen: the remedy names a command that exists (`!at <place>`)
 * — the hint is the card's whole remedy for this kind.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applyStateTransition } from '../../../src/world/worldJournal.js';

let routes;
beforeAll(async () => {
  ({ CHAT_COMMAND_ROUTES: routes } = await import('../../../src/index.js'));
});
beforeEach(() => ChatMessage._reset());

const routed = (content) => routes.filter(r => r.match({ content, flags: {} })).map(r => r.name);

describe('the ship-kind review card names a command that corrects the ship position', () => {
  it('control: `!at <place>` is a routed command', () => {
    expect(routed('!at Bleakhold')).toEqual(['!at']);
  });

  it('every `!command` the ship remedy names is routed', async () => {
    await applyStateTransition({
      entryType: 'factContinuity', change: 'contradicted', kind: 'ship',
      name: 'Wayfinder', newValue: 'the ship drifts near Ironway', summary: 'docked at Bleakhold', matchedEntityIds: [],
    }, {});
    const card = ChatMessage._created.at(-1);
    const named = [...card.content.matchAll(/<code>(![a-z-]+)[^<]*<\/code>/gi)].map(m => m[1]);
    expect(named.length).toBeGreaterThan(0);

    // Today: the hint names "!ship" — routed('!ship Bleakhold') is [].
    for (const cmd of named) expect({ cmd, routes: routed(`${cmd} Bleakhold`) }).not.toMatchObject({ routes: [] });
  });
});
