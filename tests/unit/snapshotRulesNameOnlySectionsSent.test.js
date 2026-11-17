/**
 * STARFORGED COMPANION
 * tests/unit/snapshotRulesNameOnlySectionsSent.test.js
 *
 * Issue #362 AC66 SNAPSHOT-RULES-NAME-MISSING-SECTIONS. With a world snapshot
 * (issue #357, the default) the per-beat sections ENTITIES IN SCENE and
 * ACTIVE SECTOR are not sent — their content is in WORLD SNAPSHOT (RECORDED
 * PEOPLE, PLACES AND SHIPS; SECTORS) and IN PLAY NOW names what is in play.
 * rules/narrator-memory.md 7c: "Section moves are two-sided".
 *
 * The cached rules still pointed at the retired sections: the sidecar's
 * REQUIRED identity anchor ("a character or faction who does NOT appear in
 * the ENTITIES IN SCENE cards" — with no such cards, read as written, an
 * anchor for every recorded NPC a narration names), the third-person
 * pronoun rule, DISCOVERY's reuse rule, and the inciting incident's role and
 * sidecar addendum. They are now worded for both layouts — naming no
 * per-beat section — so the standing block is the same with and without a
 * snapshot.
 *
 * Controls (the probe's): with the snapshot off the card is under ENTITIES
 * IN SCENE; with it on the NPC has a snapshot card and an IN PLAY NOW line.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { buildNarratorSystemBlocks, appendSidecarInstruction, sidecarModeAddendum } from '../../src/narration/narratorPrompt.js';
import { renderWorldSnapshot } from '../../src/narration/worldSnapshot.js';

/** The per-beat sections a snapshot narration no longer carries. */
const MOVED = ['ENTITIES IN SCENE', 'ACTIVE SECTOR'];

/** The moved sections a prompt's text points at, and whether the prompt has a section so headed. */
function danglingReferences(blocks) {
  const all = blocks.join('\n\n---\n\n');
  const flat = all.replace(/\s+/g, ' ');
  return MOVED.filter(name => flat.includes(name) && !new RegExp(`^##+ ${name}\\b`, 'm').test(all));
}

const PROSE_CASES = [
  ['move_resolution', 'discovery'], ['move_resolution', 'interaction'], ['move_resolution', 'embellishment'],
  ['move_resolution', null], ['round_resolution', 'discovery'], ['paced_narrative', null],
  ['scene_interrogation', null], ['vow_swearing', null], ['oracle_followup', 'discovery'],
  ['session_vignette', null], ['clock_advance', null], ['inciting_incident', null],
];
const PERSPECTIVES = ['second_person', 'third_person'];

const SNAPSHOT = renderWorldSnapshot([
  { key: 'sector:sec-1', section: 'sectors', text: '#### Devil\'s Maw (id sec-1)\nPeople: Vuldar Archer — Broker' },
  { key: 'entity:a1', section: 'entities', text: '#### VULDAR ARCHER — Connection (id a1)\n\nESTABLISHED FACTS (prefer consistency):\n  Pronouns: he/him' },
], { activeSector: 'Devil\'s Maw' });

/** One narration's blocks, with the snapshot or without it. */
function blocksFor(mode, narratorClass, perspective, { snapshot = true } = {}) {
  return buildNarratorSystemBlocks({ currentSessionId: 's-1' }, { narrationPerspective: perspective }, null, '', {
    mode, narratorClass,
    ...(snapshot ? {
      worldSnapshot: { text: SNAPSHOT.text, changesText: '' },
      inPlay: { activeSector: { id: 'sec-1', name: 'Devil\'s Maw' }, entities: [{ id: 'a1', name: 'Vuldar Archer', type: 'connection' }] },
    } : {}),
  });
}

let table;
let restore;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

const gm = () => gmOf(table);
async function reset(settings = {}) {
  restore = await resetSkeletonTable(table, settings, { sessionNumber: 3 });
  const store  = await gm().import('../../src/narration/worldSnapshotStore.js');
  const events = await gm().import('../../src/narration/snapshotEvents.js');
  gm().run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
}
async function makeVuldar() {
  const { createConnection } = await gm().import('../../src/entities/connection.js');
  await gm().run(async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    await createConnection({ name: 'Vuldar Archer', role: 'Broker', pronouns: 'he/him' }, cs);
  });
  await table.settle();
  await table.drain();
}
const requestBlocks = () => narrationCallsOf(table).at(-1).body.system.map(b => b.text);

describe('issue #362 AC66 — the rules a snapshot narration is sent name only sections the request has', () => {
  beforeEach(() => reset());

  it('control: with the snapshot switched off, the card of the NPC in play is under ENTITIES IN SCENE', async () => {
    await reset({ worldSnapshot: false });
    await makeVuldar();
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vuldar Archer what he knows.' }));
    const blocks = requestBlocks();
    expect(blocks.join('\n')).toMatch(/^## ENTITIES IN SCENE$/m);
    expect(blocks.join('\n')).toContain('VULDAR ARCHER — Connection');
    expect(danglingReferences(blocks)).not.toContain('ENTITIES IN SCENE');
  }, 60_000);

  it('control: with the snapshot, the NPC in play has a card in WORLD SNAPSHOT and is named under IN PLAY NOW', async () => {
    await makeVuldar();
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vuldar Archer what he knows.' }));
    const all = requestBlocks().join('\n');
    expect(all).toMatch(/## WORLD SNAPSHOT[\s\S]*#### VULDAR ARCHER — Connection/);
    expect(all).toMatch(/## IN PLAY NOW[\s\S]*Vuldar Archer \(Connection/);
  }, 60_000);

  it('a move narration with a snapshot: no rule points at a section that is not in the request', async () => {
    await makeVuldar();
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vuldar Archer what he knows.' }));
    expect(danglingReferences(requestBlocks())).toEqual([]);
  }, 60_000);
});

describe('issue #362 AC66 — every prose mode, permission class and perspective', () => {
  it('built with a snapshot: none points at ENTITIES IN SCENE or ACTIVE SECTOR', () => {
    const dangling = {};
    for (const perspective of PERSPECTIVES) {
      for (const [mode, narratorClass] of PROSE_CASES) {
        const b = blocksFor(mode, narratorClass, perspective);
        expect(b.snapshot, `${mode}: the snapshot block is sent (setup)`).toContain('## WORLD SNAPSHOT');
        const found = danglingReferences([b.standing, b.snapshot, b.mode, b.beat]);
        if (found.length) dangling[`${mode}${narratorClass ? `/${narratorClass}` : ''} (${perspective})`] = found;
      }
    }
    expect(dangling).toEqual({});
  });

  it('the standing rules are the same bytes with and without a snapshot', () => {
    for (const perspective of PERSPECTIVES) {
      for (const [mode, narratorClass] of PROSE_CASES) {
        expect(blocksFor(mode, narratorClass, perspective).standing, `${mode} (${perspective})`)
          .toBe(blocksFor(mode, narratorClass, perspective, { snapshot: false }).standing);
      }
    }
  });

  it('the identity anchor is asked for a character with no card in the prompt, whichever section holds the cards', () => {
    const rule = appendSidecarInstruction();
    expect(rule).toMatch(/REQUIRED: the first time your prose introduces or names a character or\n\s*faction who has no card of their own in this prompt/);
    expect(rule).not.toMatch(/ENTITIES IN\s+SCENE/);
    expect(sidecarModeAddendum('inciting_incident')).not.toMatch(/ACTIVE SECTOR/);
    expect(sidecarModeAddendum('inciting_incident')).toMatch(/an existing NPC \(one recorded for the sector\)/);
  });
});
