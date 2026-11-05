/**
 * STARFORGED COMPANION
 * tests/unit/notesCardEntityDecoded.test.js
 *
 * An NPC's or ship's Notes reach ENTITIES IN SCENE with their HTML entities
 * decoded (known-issues NOTES-CARD-ENTITY-UNDECODED).
 *
 * The seeds' Notes introduction ends in a fact line joined by `&middot;`
 * (connection.js / ship.js, and `!ship envision`'s beat line), and
 * notesAsCardText — the card's Notes row (issue #326 W39), and the Entities
 * panel's Notes field — decoded only &nbsp; &lt; &gt; &quot; &#39; and &amp;,
 * so the narrator was handed "she/her &middot; Wary &middot; …". It now
 * decodes &middot;, the other named entities a seed or the editor writes, and
 * numeric entities — in one pass, so an escaped "&amp;middot;" stays text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { seedConnectionActor, getConnection } from '../../src/entities/connection.js';
import { formatEntityCard, notesAsCardText } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const notesRow = (card) => card.split('\n').find(l => l.startsWith('  Notes:'));

describe("the seed's fact line on an NPC's entity card", () => {
  beforeEach(() => {
    global.game.actors._reset();
    global.game.settings._store.clear();
    global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');   // the seed writes prose + its fact line
    apiPost.mockReset();
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: 'She watches the dock with a gambler’s patience.' }] });
  });

  it('reads "she/her · Wary · …" — the seed\'s &middot; decoded, as the narrator is handed it', async () => {
    const actor = global.makeTestActor({
      id: 'npc-vex', type: 'character', name: 'Vex',
      flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'rec-vex', connection: {
        _id: 'rec-vex', name: 'Vex', description: 'A wiry pilot with a burned hand.',
        pronouns: 'she/her', disposition: 'Wary', role: 'Smuggler', goal: 'Pay off an old debt',
      } } },
    });
    global.game.actors._set(actor.id, actor);

    await seedConnectionActor(actor, { connectionIds: ['npc-vex'] });
    expect(actor.system.notes).toContain('she/her &middot; Wary &middot;');   // control: the seed's HTML

    // The record the narrator reads (its Notes are the sheet's tab, issue #329 X12).
    const row = notesRow(formatEntityCard(getConnection('npc-vex'), 'connection'));
    expect(row).toContain('gambler’s patience');                          // control: the prose reaches it
    expect(row).toContain('she/her · Wary · Smuggler · Pay off an old debt');
    expect(row).not.toMatch(/&[a-z#0-9]+;/i);
  });
});

describe('notesAsCardText decodes entities', () => {
  it("the named ones a seed or the editor writes: a ship's fact line, typography, a no-break space", () => {
    expect(notesAsCardText('<p><em>Hauler &middot; Heavy armor &middot; Transport cargo</em></p>'))
      .toBe('Hauler · Heavy armor · Transport cargo');
    expect(notesAsCardText('<p>Don&rsquo;t trust &ldquo;the Broker&rdquo; &mdash; ever&hellip; 3&ndash;4 jumps out&nbsp;now.</p>'))
      .toBe('Don’t trust “the Broker” — ever… 3–4 jumps out now.');
    expect(notesAsCardText('<p>It&apos;s &lsquo;fine&rsquo; &bull; mostly</p>')).toBe('It\'s ‘fine’ • mostly');
  });

  it('numeric ones, decimal and hex', () => {
    expect(notesAsCardText('<p>Wary &#183; Smuggler &#x2014; it&#39;s &#039;hers&#039;</p>'))
      .toBe('Wary · Smuggler — it\'s \'hers\'');
  });

  it('once: an escaped entity is text, and the markup-escapes still decode', () => {
    expect(notesAsCardText('<p>Write &amp;middot; for a dot; &lt;signal lost&gt; &amp; &quot;static&quot;</p>'))
      .toBe('Write &middot; for a dot; <signal lost> & "static"');
  });

  it('control: an unknown name or an impossible code point is left as written', () => {
    expect(notesAsCardText('<p>&madeup; and &#0; and &#x110000;</p>')).toBe('&madeup; and &#0; and &#x110000;');
  });
});
