/**
 * STARFORGED COMPANION
 * tests/unit/connectionSchemaDeadFieldsRetired.test.js
 *
 * Issue #362 AC81 CONNECTION-SCHEMA-DEAD-FIELDS (the audit's
 * uisec/connectionSchemaDeadFields probe; UISEC-07).
 *
 * CONN-BACKGROUND-UNWRITTEN (v1.8.1 sweep) retired two ConnectionSchema
 * fields no production code wrote or read (`background`, `secrets`). Four
 * siblings in the same template were in the same state, and every NPC record
 * created carried them:
 *
 *   playerVisible   — "false = GM-only record (hidden antagonists, secret
 *                     NPCs)": nothing wrote or read it — no path hides an NPC
 *                     card from players by it;
 *   progressTrackId — "Associated ProgressTrack _id": no writer, no reader
 *                     (the relationship track is `relationshipTicks`);
 *   firstAppearance — written by two creators (the inciting vow's target,
 *                     Make a Connection's auto-create), read by nothing;
 *   loremasterNotes — only ever the schema's empty default; its one reader
 *                     (the CHARACTER block's `narratorNotes ?? loremasterNotes`)
 *                     read a PC's snapshot, which never carries it.
 *
 * Retired, with their writes, the `sessionId` option of routeEntityDrafts that
 * only fed `firstAppearance`, and the dead fallback read (rules/reachability.md
 * §1, §2: a field with no consumer is a bug; teardown is bidirectional).
 * Stored records keep the stale fields, which do no harm.
 *
 * The planet, settlement and faction templates carried the same
 * `loremasterNotes: ""` — no writer, no reader — and are retired the same way.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionSchema, CampaignStateSchema } from '../../src/schemas.js';
import { createConnection } from '../../src/entities/connection.js';
import { PlanetSchema, createPlanet } from '../../src/entities/planet.js';
import { SettlementSchema, createSettlement } from '../../src/entities/settlement.js';
import { FactionSchema, createFaction } from '../../src/entities/faction.js';
import { productionSources } from '../helpers/sourceScan.js';

const MODULE = 'starforged-companion';
const RETIRED = ['playerVisible', 'progressTrackId', 'firstAppearance', 'loremasterNotes'];

const sources = productionSources().filter(s => s.file !== 'src/schemas.js');

/** Property reads of `field`: `.field` not followed by an assignment. */
function reads(field) {
  const out = [];
  const re = new RegExp(`(?:\\?\\.|\\.)${field}\\b(?!\\s*=[^=])`, 'g');
  for (const s of sources) {
    for (const m of s.code.matchAll(re)) out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
  }
  return out;
}

/** Writes of `field` with a value that is not an empty template default: `field: <expr>` or `.field = <expr>`. */
function writes(field) {
  const out = [];
  const key = new RegExp(`\\b${field}\\s*:\\s*([^,\\n}]+)`, 'g');
  const set = new RegExp(`\\.${field}\\s*=[^=]`, 'g');
  for (const s of sources) {
    for (const m of s.code.matchAll(key)) {
      const value = m[1].trim();
      if (value === '""' || value === "''" || value === 'null' || value === 'true' || value === 'false') continue;
      out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
    }
    for (const m of s.code.matchAll(set)) out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
  }
  return out;
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE}.campaignState`, { ...CampaignStateSchema, connectionIds: [] });
});

describe('issue #362 AC81 — the connection template carries no field without a writer and a reader', () => {
  it('control: the scan sees a live field — relationshipTicks is written and read', () => {
    expect(Object.keys(ConnectionSchema)).toContain('relationshipTicks');
    expect(writes('relationshipTicks').length).toBeGreaterThan(0);
    expect(reads('relationshipTicks').length).toBeGreaterThan(0);
  });

  it('control: the fields CONN-BACKGROUND-UNWRITTEN retired are gone from the template', () => {
    expect(Object.keys(ConnectionSchema)).not.toContain('background');
    expect(Object.keys(ConnectionSchema)).not.toContain('secrets');
  });

  it.each(RETIRED)('%s is retired from the template — and so from a new record', async (field) => {
    expect(ConnectionSchema).not.toHaveProperty(field);
    const record = await createConnection({ name: 'Vex' }, global.game.settings.get(MODULE, 'campaignState'));
    expect(record).not.toHaveProperty(field);
  });

  it.each(RETIRED)('no production code writes or reads %s any more', (field) => {
    expect({ writes: writes(field), reads: reads(field) }).toEqual({ writes: [], reads: [] });
  });

  it('control: the fields a card renders are still on the template', () => {
    for (const key of ['role', 'goal', 'description', 'pronouns', 'history', 'relationshipTicks', 'generativeTier']) {
      expect(ConnectionSchema).toHaveProperty(key);
    }
  });
});

describe('issue #362 AC81 — the planet, settlement and faction templates carry no loremasterNotes', () => {
  const SIBLINGS = [
    ['PlanetSchema',     PlanetSchema,     (cs) => createPlanet({ name: 'Ferrous' }, cs)],
    ['SettlementSchema', SettlementSchema, (cs) => createSettlement({ name: 'Bleakhold' }, cs)],
    ['FactionSchema',    FactionSchema,    (cs) => createFaction({ name: 'Iron Syndicate' }, cs)],
  ];

  it.each(SIBLINGS)('%s has no loremasterNotes — and so neither has a new record', async (_name, schema, create) => {
    expect(schema).not.toHaveProperty('loremasterNotes');
    const record = await create(global.game.settings.get(MODULE, 'campaignState'));
    expect(record?.name, 'the record was made').toBeTruthy();
    expect(record).not.toHaveProperty('loremasterNotes');
  });

  it.each(SIBLINGS)('control: %s keeps the fields its card and the narrator read', (_name, schema) => {
    for (const key of ['description', 'notes', 'portraitSourceDescription', 'canonicalLocked', 'generativeTier']) {
      expect(schema).toHaveProperty(key);
    }
  });
});
