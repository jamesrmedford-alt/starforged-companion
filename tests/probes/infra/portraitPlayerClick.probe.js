// tests/probes/infra/portraitPlayerClick.probe.test.js
//
// PROBE (infra audit) — PORTRAIT-PLAYER-NO-RELAY.
//
// The Entities panel is on every player's toolbar (companionToolbarTools:
// `entityPanel` visible: true) and renders "Generate portrait" /
// "Regenerate portrait" with no GM check (entityPanel.js). The click runs
// generatePortrait() on the player's own client: it reads the player's
// client-scoped OpenRouter key (none → "No OpenRouter API key is configured.
// Add your key…", steering the player to buy one), and with a key it pays for
// the image, then storeArtAsset() creates a JournalEntry and writes the world
// `campaignState` setting — both refused for a player — so the generated image
// is thrown away: never linked, never on the Actor. There is no GM relay.
//
// Invariant asserted: a player's click must not spend image credits on a
// portrait that cannot be stored — either nothing is generated on the player
// client (the work is relayed to the GM) or the portrait lands. FAILS today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/art/openRouterImage.js', () => ({ generateOpenRouterImage: vi.fn() }));

import { generatePortrait } from '../../../src/art/generator.js';
import { generateOpenRouterImage } from '../../../src/art/openRouterImage.js';

const MODULE_ID = 'starforged-companion';
let restoreUser;

beforeEach(() => {
  silenceConsoleErrors();          // the refused writes log, as they should
  game.actors._reset();
  restoreUser = asPlayer();
  game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, 'sk-or-v1-the-players-own-key');
  generateOpenRouterImage.mockResolvedValue('A'.repeat(400));   // a "generated" image
});

afterEach(() => {
  restoreUser();
  game.settings._store.delete(`${MODULE_ID}.openRouterApiKey`);
  game.actors._reset();
});

describe('PROBE PORTRAIT-PLAYER-NO-RELAY — Generate portrait clicked by a player', () => {
  it('never pays for an image it then cannot store', async () => {
    const record = {
      _id: 'conn-1', name: 'Vance', role: 'Pilot', pronouns: 'he/him',
      portraitSourceDescription: 'A weathered pilot in a patched flight suit',
    };
    const npc = makeTestActor({ id: 'npc-1', name: 'Vance', flags: { [MODULE_ID]: { connection: record, entityType: 'connection' } } });
    game.actors._set('npc-1', npc);

    const outcome = await generatePortrait('npc-1', 'connection', record, {}).then(
      asset => ({ asset }), error => ({ error }));
    const linkedId = npc.flags?.[MODULE_ID]?.connection?.portraitId ?? null;

    if (generateOpenRouterImage.mock.calls.length > 0) {
      // Actual today: the image was generated (player's credits) and then
      // dropped — generatePortrait rejects with the refused campaignState write.
      expect(outcome.error?.message ?? null).toBeNull();
      expect(linkedId).toBeTruthy();
    }
  });
});
