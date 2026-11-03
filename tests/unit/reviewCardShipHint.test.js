// tests/unit/reviewCardShipHint.test.js
// The ◈ Narrative Review card's ship remedy names the command that sets the
// ship's position (issue #326 W66). It said "correct it with `!ship`" — no
// `!ship` verb sets a position (only `!ship envision` / `history` exist);
// the command is `!at <place>`.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applyStateTransition } from '../../src/world/worldJournal.js';

let routes;
beforeAll(async () => {
  ({ CHAT_COMMAND_ROUTES: routes } = await import('../../src/index.js'));
});
beforeEach(() => ChatMessage._reset());

const routed = (content) => routes.filter(r => r.match({ content, flags: {} })).map(r => r.name);

describe('the ship-kind review card names a command that corrects the ship position (issue #326 W66)', () => {
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

    // It named "!ship" — routed('!ship Bleakhold') is [].
    expect(named).toEqual(['!at']);
    for (const cmd of named) expect({ cmd, routes: routed(`${cmd} Bleakhold`) }).not.toMatchObject({ routes: [] });
  });
});
