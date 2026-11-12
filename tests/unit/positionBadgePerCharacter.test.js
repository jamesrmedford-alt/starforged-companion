/**
 * STARFORGED COMPANION
 * tests/unit/positionBadgePerCharacter.test.js
 *
 * POSITION-BADGE-GM-FIRST-PC (issue #345 AA64's residual). Combat position is
 * per character (decisions.md, "Combat position is per character"): a fight
 * keeps each PC's own (`positions[actorId]`). The Progress Tracks panel's one
 * badge showed and cycled the position of the PC resolveUserActorId picks —
 * for a GM that is the first PC — so a GM who runs several PCs (solo play
 * with a crew, or the GM-run PCs at a table) could see and set only the
 * first's from the panel; the combat tracker's per-combatant badges set each.
 *
 * Now a fight shows one badge per character the viewer plays — each named,
 * each cycling its own character's position — and a player still sees only
 * their own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  const journal = {
    id: 'pt-journal',
    name: 'Starforged Progress Tracks',
    ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) {
      if (!globalThis.game?.user?.isGM) throw new Error('only a GM may write the tracks journal');
      flags[mod] ??= {};
      flags[mod][key] = structuredClone(value);
    },
  };
  return journal;
}

let table;
let journal;
let savedDocument;

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    combatTrackerEnabled: false,
    campaignState: { sessionActive: true, clocks: [], characterIds: ['pc-kira', 'pc-ren', 'pc-ash'] },
  } } });
  // Kira and Ren are the GM's to run; Ash is the player's.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: {}, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: {}, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-1': 3 }, items: { contents: [] } });
  journal = makeTracksJournal([{
    id: 'fight-1', label: 'Corsair boarding party', type: 'combat', rank: 'dangerous',
    ticks: 8, completed: false, combatState: null, createdAt: 1,
  }]);
  table.journal.set(journal.id, journal);
});

const stored = () => journal.getFlag(MODULE_ID, 'tracks')[0];

/** The fight's position badges on a user's own panel: whose each is, and what it reads. */
async function badges(userId) {
  const c = table.client(userId);
  const { ProgressTrackApp } = await c.import('../../src/ui/progressTracks.js');
  return c.run(async () => {
    const app = new ProgressTrackApp();
    const ctx = await app._prepareContext({});
    const root = await app._renderHTML(ctx, {});
    return root.querySelectorAll('.btn-combat-state').map(btn => ({
      actorId: btn.dataset?.actorId ?? btn.getAttribute?.('data-actor-id') ?? null,
      label:   btn.textContent.trim(),
    }));
  });
}

/** A user presses one badge — the one for `actorId` — on their own panel. */
async function press(userId, actorId) {
  const c = table.client(userId);
  const { ProgressTrackApp } = await c.import('../../src/ui/progressTracks.js');
  const app = { render() {}, element: null };
  const dataset = actorId ? { trackId: 'fight-1', actorId } : { trackId: 'fight-1' };
  await c.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset }));
  await table.settle();
}

describe('POSITION-BADGE-GM-FIRST-PC — one position badge per character the viewer plays', () => {
  it('the GM sees a badge for each PC, each reading that PC\'s own position', async () => {
    await press('gm-1', 'pc-kira');                 // Kira: in control
    const shown = await badges('gm-1');
    expect(shown.map(b => b.actorId)).toEqual(['pc-kira', 'pc-ren', 'pc-ash']);
    expect(shown.find(b => b.actorId === 'pc-kira').label).toBe('In control');
  }, 60_000);

  it('the GM\'s press on Ren\'s badge sets Ren\'s position, not the first PC\'s', async () => {
    await press('gm-1', 'pc-ren');                  // Ren: neutral → in control
    await press('gm-1', 'pc-ren');                  // Ren: in control → in a bad spot
    expect(stored().positions).toEqual({ 'pc-ren': 'bad_spot' });
    const shown = await badges('gm-1');
    expect(shown.find(b => b.actorId === 'pc-ren').label).toBe('In a bad spot');
  }, 60_000);

  it('control: a player sees only their own character\'s badge', async () => {
    const shown = await badges('pl-1');
    expect(shown.map(b => b.actorId)).toEqual(['pc-ash']);
  }, 60_000);

  it('a player\'s press naming a character they do not own changes no character\'s own position', async () => {
    await press('pl-1', 'pc-kira');
    expect(stored().positions?.['pc-kira']).toBeUndefined();
  }, 60_000);
});
