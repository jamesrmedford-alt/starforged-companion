/**
 * CONN-BACKGROUND-UNWRITTEN (known-issues; issue #287's follow-up). A
 * connection's `background` and `secrets` sat on ConnectionSchema — so on
 * every new record — with no production writer and no reader: neither reached
 * the entity card, the narrator or the sheet. Issue #287: "Wire a writer
 * (entity panel or detection) or retire the fields." Retired (a field no
 * consumer reads is a bug, rules/reachability.md): history is `history` and
 * the generative tier, GM-only notes the sheet's Notes. Stored records keep
 * the empty fields, which do no harm.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionSchema, CampaignStateSchema } from '../../src/schemas.js';
import { createConnection } from '../../src/entities/connection.js';
import { productionSources } from '../helpers/sourceScan.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE}.campaignState`, { ...CampaignStateSchema, connectionIds: [] });
});

describe('CONN-BACKGROUND-UNWRITTEN — the unwritten connection fields are retired', () => {
  it('the schema — and so a new record — carries neither', async () => {
    expect(ConnectionSchema).not.toHaveProperty('background');
    expect(ConnectionSchema).not.toHaveProperty('secrets');
    const record = await createConnection({ name: 'Vex' }, global.game.settings.get(MODULE, 'campaignState'));
    expect(record).not.toHaveProperty('background');
    expect(record).not.toHaveProperty('secrets');
  });

  it('no entity, narrator or session code reads or writes a record\'s background or secrets', () => {
    // (A Scene's `background` — the sector map, the ship map — is another thing.)
    const users = productionSources()
      .filter(({ file }) => /^src\/(entities|narration|context|session|ui\/entityPanel)/.test(file))
      .filter(({ code }) => /\.(background|secrets)\b|\b(background|secrets)\s*:/.test(code))
      .map(({ file }) => file);
    expect(users).toEqual([]);
  });

  it('control: the fields a card renders are still on the schema', () => {
    for (const key of ['role', 'goal', 'description', 'pronouns', 'history']) expect(ConnectionSchema).toHaveProperty(key);
  });
});
