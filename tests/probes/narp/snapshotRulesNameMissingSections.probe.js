/**
 * NARP-03 · SNAPSHOT-RULES-NAME-MISSING-SECTIONS (WRONG-DETAIL — a one-sided section move)
 *
 * Scenario: a narration with a world snapshot (issue #357, the default). The
 * per-beat sections ENTITIES IN SCENE and ACTIVE SECTOR are no longer sent —
 * their content moved into WORLD SNAPSHOT (RECORDED PEOPLE, PLACES AND SHIPS;
 * SECTORS) and IN PLAY NOW names what is in play.
 *
 * Correct (rules/narrator-memory.md 7c "Section moves are two-sided"): the
 * rules the narrator is sent point only at sections the request has. In
 * particular the sidecar's REQUIRED identity-anchor rule must exempt the
 * characters the narrator has a card for.
 *
 * Today the cached rules still name the retired sections:
 *   - sidecar instruction (every prose mode): "the first time your prose
 *     introduces or names a character or faction who does NOT appear in the
 *     ENTITIES IN SCENE cards, emit a newTruth anchoring their identity" —
 *     with a snapshot there are no ENTITIES IN SCENE cards, so read as written
 *     the rule now asks for an identity anchor for every recorded NPC a
 *     narration names, the ones in play included;
 *   - third-person perspective: "recorded pronouns (CHARACTER, PARTY, and
 *     ENTITIES IN SCENE sections)";
 *   - DISCOVERY permissions: "see the ACTIVE SECTOR roster and any ENTITIES IN
 *     SCENE"; the inciting incident's role and sidecar addendum: "see ACTIVE
 *     SECTOR" / "see the ACTIVE SECTOR cast".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';
import { buildNarratorSystemBlocks } from '../../../src/narration/narratorPrompt.js';
import { renderWorldSnapshot } from '../../../src/narration/worldSnapshot.js';

/** The per-beat sections a snapshot narration no longer carries. */
const MOVED = ['ENTITIES IN SCENE', 'ACTIVE SECTOR'];

/** The moved sections a prompt's text points at, and whether the prompt has a section so headed. */
function danglingReferences(blocks) {
  const all = blocks.join('\n\n---\n\n');
  const flat = all.replace(/\s+/g, ' ');
  return MOVED.filter(name => flat.includes(name) && !new RegExp(`^##+ ${name}\\b`, 'm').test(all));
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

describe('NARP-03 — the rules a snapshot narration is sent name only sections the request has', () => {
  beforeEach(() => reset());

  it('control: with the snapshot switched off, the card of the NPC in play is under ENTITIES IN SCENE, as the rules say', async () => {
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

  it('every prose mode and permission class, built with a snapshot: none points at ENTITIES IN SCENE or ACTIVE SECTOR', () => {
    const snapshot = renderWorldSnapshot([
      { key: 'sector:sec-1', section: 'sectors', text: '#### Devil\'s Maw (id sec-1)\nPeople: Vuldar Archer — Broker' },
      { key: 'entity:a1', section: 'entities', text: '#### VULDAR ARCHER — Connection (id a1)\n\nESTABLISHED FACTS (prefer consistency):\n  Pronouns: he/him' },
    ], { activeSector: 'Devil\'s Maw' });
    const dangling = {};
    const cases = [
      ['move_resolution', 'discovery'], ['move_resolution', 'interaction'], ['paced_narrative', null],
      ['inciting_incident', null], ['scene_interrogation', null],
    ];
    for (const perspective of ['second_person', 'third_person']) {
      for (const [mode, narratorClass] of cases) {
        const b = buildNarratorSystemBlocks({ currentSessionId: 's-1' }, { narrationPerspective: perspective }, null, '', {
          mode, narratorClass,
          worldSnapshot: { text: snapshot.text, changesText: '' },
          inPlay: { activeSector: { id: 'sec-1', name: 'Devil\'s Maw' }, entities: [{ id: 'a1', name: 'Vuldar Archer', type: 'connection' }] },
        });
        const found = danglingReferences([b.standing, b.snapshot, b.mode, b.beat]);
        if (found.length) dangling[`${mode}${narratorClass ? `/${narratorClass}` : ''} (${perspective})`] = found;
      }
    }
    expect(dangling).toEqual({});
  });
});
