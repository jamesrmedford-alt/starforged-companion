// tests/probes/narration/shipNotesHtmlInPrompt.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR SHIP-NOTES-HTML — a ship's entity card hands the narrator its Notes tab's
// raw HTML: the embedded portrait's <img> tag and path, the <hr>/<h4> section
// headers.
//
// What the user does: the GM runs `!ship envision` (or the Entities panel's
// Envision / History) on the crew's ship; later a player names the ship in
// play ("I climb back aboard the Wayfarer and seal the lock").
//
// What happens: appendNotesSection (src/entities/shipEnvision.js) writes the
// whole Notes HTML — the seeded portrait block `<div class="sf-ship-portrait">
// <img src=…>`, the seed's paragraphs and `<hr><h4>✦ Envisioned details —
// date</h4><p>…</p>` — into the ship record through updateShip, so the flag
// record's `notes` is HTML. The lexical relevance pass matches the ship's name;
// collectEntityCards → formatEntityCard (src/narration/narratorPrompt.js)
// prints `Notes: ${record.notes}` verbatim into ENTITIES IN SCENE. The
// CHARACTER block strips its notes (actorBridge stripHtml); entity cards do not.
//
// What should happen: the card carries the notes as text — no markup, no image
// path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../../src/narration/narrator.js';
import { appendNotesSection } from '../../../src/entities/shipEnvision.js';

const MODULE_ID = 'starforged-companion';
const PORTRAIT = '<div class="sf-ship-portrait"><img src="worlds/w/starforged-companion/art/ship-abc.webp" style="max-width:100%"></div>';

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer', ownership: { default: 3 },
    system: { notes: `${PORTRAIT}<p>A battered courier with a patched dorsal fin.</p>` },
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfarer', type: 'Courier', isCommandVehicle: true, notes: '' } } },
  });
  game.actors._set('ship-1', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', shipIds: ['ship-1'] });
});

describe("a ship's entity card is text, not its Notes HTML", () => {
  it('after !ship envision, ENTITIES IN SCENE carries no HTML markup or image path', async () => {
    // The production writer of the ship record's notes.
    await appendNotesSection(game.actors.get('ship-1'), 'Envisioned details', '<p>The galley smells of burnt coffee.</p>');
    expect(game.actors.get('ship-1').flags[MODULE_ID].ship.notes).toContain('<h4>');

    const extras = await buildNarratorExtras('paced_narrative', game.settings.get(MODULE_ID, 'campaignState'), {
      playerNarration: 'I climb back aboard the Wayfarer and seal the lock.',
    });
    const card = extras.entityCards.find(c => c.includes('WAYFARER'));
    expect(card).toBeDefined();
    expect(card).toContain('burnt coffee');          // control: the notes do reach the card
    expect(card).not.toMatch(/<\/?(?:div|img|p|hr|h4)\b/);
    expect(card).not.toContain('ship-abc.webp');
  });
});
