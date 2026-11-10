/**
 * UI-1 PANEL-POSITION-BADGE-NOT-CLICKERS (twelfth audit, ui area).
 *
 * Combat position is per character (decisions.md → "Combat position is per
 * character", issue #322 V03): the fight's track holds each PC's own position
 * (`positions[actorId]`) beside the fight's last-set one (`combatState`), and
 * the roller's own drives the interpreter and Take Decisive Action. Issue #326
 * W56 made the Progress Tracks panel's position button cycle the CLICKER's own
 * position (applyProgressTrackEditFromRelay 'position' →
 * combatPositionFor(fight, actor.id), src/ui/progressTracks.js:1194-1210).
 * But the button still LABELS the fight's last-set position for every viewer
 * (src/ui/progressTracks.js:435 `combatState: t.combatState` and the label at
 * :502-508). In a two-PC fight the label is whoever set a position last.
 *
 * Scenario (two players, one fight, all through the panel's own button):
 *   1. Kira's player presses the badge once: Kira → in control.
 *   2. Ren's player presses it once: Ren, with no position of his own, cycles
 *      from the fight's last-set one (the V03 fallback): → in a bad spot.
 *   3. Kira's player opens the panel: the badge reads "In a bad spot" — Ren's.
 *   4. Kira's player presses it to clear "the bad spot": Kira's own in-control
 *      becomes a bad spot, and the badge still reads "In a bad spot".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import { userOwnsDocument, permissionError } from '../../helpers/foundryPermissions.js';

const MODULE_ID = 'starforged-companion';

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  const journal = {
    id: 'pt-journal',
    name: 'Starforged Progress Tracks',
    ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) {
      const user = globalThis.game?.user;
      if (!userOwnsDocument(user, journal)) {
        throw permissionError(user, 'update', 'JournalEntry', journal.id, 'needs OWNER permission');
      }
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
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 60_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    combatTrackerEnabled: false,
    campaignState: { sessionActive: true, clocks: [], characterIds: ['pc-kira', 'pc-ren'] },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  journal = makeTracksJournal([{
    id: 'fight-1', label: 'Corsair boarding party', type: 'combat', rank: 'dangerous',
    ticks: 8, completed: false, combatState: null, createdAt: 1,
  }]);
  table.journal.set(journal.id, journal);
});

const stored = () => journal.getFlag(MODULE_ID, 'tracks')[0];

/** A user presses the fight's position badge on their own panel. */
async function pressBadge(userId) {
  const c = table.client(userId);
  const { ProgressTrackApp } = await c.import('../../src/ui/progressTracks.js');
  const app = { render() {}, element: null };
  await c.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset: { trackId: 'fight-1' } }));
  await table.settle();
}

/** The position badge's label on a user's own Progress Tracks panel, rendered as ApplicationV2 does. */
async function badgeLabel(userId) {
  const c = table.client(userId);
  const { ProgressTrackApp } = await c.import('../../src/ui/progressTracks.js');
  return c.run(async () => {
    const app = new ProgressTrackApp();
    const ctx = await app._prepareContext({});
    const root = await app._renderHTML(ctx, {});
    return root.querySelector('.btn-combat-state')?.textContent.trim() ?? null;
  });
}

describe('UI-1: the Progress Tracks position badge shows the viewer\'s own position', () => {
  it('control: in a one-character fight the badge shows that character\'s position', async () => {
    await pressBadge('pl-1');                       // Kira: neutral → in control
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control' });
    expect(await badgeLabel('pl-1')).toBe('In control');
  }, 60_000);

  it('Kira is in control and Ren set a bad spot last: Kira\'s badge should read "In control"', async () => {
    await pressBadge('pl-1');                       // Kira: neutral → in control
    await pressBadge('pl-2');                       // Ren: (fight's in control) → in a bad spot
    // Setup sound: each character holds their own position on the track.
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control', 'pc-ren': 'bad_spot' });

    // Kira's player sees Ren's bad spot as theirs.
    expect(await badgeLabel('pl-1')).toBe('In control');
  }, 60_000);

  it('pressing the badge Kira was shown ("In a bad spot") should change what it shows', async () => {
    await pressBadge('pl-1');                       // Kira: in control
    await pressBadge('pl-2');                       // Ren: bad spot (set last)
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control', 'pc-ren': 'bad_spot' });
    const before = await badgeLabel('pl-1');

    await pressBadge('pl-1');                       // Kira presses, to leave "the bad spot"
    const after = await badgeLabel('pl-1');

    // Kira's own in-control was turned into a bad spot by the press…
    expect(stored().positions['pc-kira']).toBe('bad_spot');
    // …and the badge she pressed shows no change at all.
    expect({ before, after, changed: before !== after }).toEqual({ before, after, changed: true });
  }, 60_000);
});
