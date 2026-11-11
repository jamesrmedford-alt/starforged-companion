/**
 * STARFORGED COMPANION
 * tests/unit/positionBadgeShowsOwnPosition.test.js
 *
 * Issue #345 AA64 (PANEL-POSITION-BADGE-NOT-CLICKERS, the audit's UI-1
 * probe). Combat position is per character (decisions.md → "Combat position
 * is per character", issue #322 V03): the fight's track holds each PC's own
 * position (`positions[actorId]`) beside the fight's last-set one
 * (`combatState`), and the roller's own drives the interpreter and Take
 * Decisive Action. Issue #326 W56 made the Progress Tracks panel's position
 * button cycle the CLICKER's own position (applyProgressTrackEditFromRelay
 * 'position' → combatPositionFor(fight, actor.id)) — but the button still
 * LABELLED the fight's last-set position for every viewer. In a two-PC fight
 * the label was whoever set a position last:
 *   1. Kira's player presses the badge once: Kira → in control.
 *   2. Ren's player presses it once: Ren, with no position of his own, cycles
 *      from the fight's last-set one (the V03 fallback): → in a bad spot.
 *   3. Kira's player opens the panel: the badge read "In a bad spot" — Ren's.
 *   4. Kira's player pressed it to clear "the bad spot": Kira's own in-control
 *      became a bad spot, and the badge still read "In a bad spot".
 *
 * Now the badge shows the viewer's own position — the one its press cycles
 * (combatPositionFor with the viewer's PC, resolveUserActorId as the press
 * resolves it) — and its title names whose it is.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { userOwnsDocument, permissionError } from '../helpers/foundryPermissions.js';

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

/** The position badge on a user's own Progress Tracks panel, rendered as ApplicationV2 does. */
async function badge(userId) {
  const c = table.client(userId);
  const { ProgressTrackApp } = await c.import('../../src/ui/progressTracks.js');
  return c.run(async () => {
    const app = new ProgressTrackApp();
    const ctx = await app._prepareContext({});
    const root = await app._renderHTML(ctx, {});
    const btn = root.querySelector('.btn-combat-state');
    return btn ? { label: btn.textContent.trim(), title: btn.getAttribute?.('title') ?? btn.title ?? null } : null;
  });
}
const badgeLabel = async (userId) => (await badge(userId))?.label ?? null;

describe('issue #345 AA64 — the Progress Tracks position badge shows the viewer\'s own position', () => {
  it('control: in a one-character fight the badge shows that character\'s position', async () => {
    await pressBadge('pl-1');                       // Kira: neutral → in control
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control' });
    expect(await badgeLabel('pl-1')).toBe('In control');
  }, 60_000);

  it('Kira is in control and Ren set a bad spot last: Kira\'s badge reads "In control", Ren\'s "In a bad spot"', async () => {
    await pressBadge('pl-1');                       // Kira: neutral → in control
    await pressBadge('pl-2');                       // Ren: (fight's in control) → in a bad spot
    // Setup sound: each character holds their own position on the track.
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control', 'pc-ren': 'bad_spot' });

    expect(await badgeLabel('pl-1')).toBe('In control');
    expect(await badgeLabel('pl-2')).toBe('In a bad spot');
  }, 60_000);

  it('pressing the badge changes what it shows — the viewer\'s own position, cycled', async () => {
    await pressBadge('pl-1');                       // Kira: in control
    await pressBadge('pl-2');                       // Ren: bad spot (set last)
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control', 'pc-ren': 'bad_spot' });
    const before = await badgeLabel('pl-1');

    await pressBadge('pl-1');                       // Kira presses
    const after = await badgeLabel('pl-1');

    expect(stored().positions['pc-kira']).toBe('bad_spot');
    expect({ before, after, changed: before !== after }).toEqual({ before: 'In control', after: 'In a bad spot', changed: true });
  }, 60_000);

  it('the badge\'s title names whose position it shows and toggles', async () => {
    await pressBadge('pl-1');
    expect((await badge('pl-1')).title).toMatch(/Kira/);
    expect((await badge('pl-2')).title).toMatch(/Ren/);
  }, 60_000);

  it('a GM sees the position its press cycles — the first PC\'s own, not the fight\'s last-set', async () => {
    await pressBadge('pl-1');                       // Kira: in control
    await pressBadge('pl-2');                       // Ren: bad spot (set last)
    expect(await badgeLabel('gm-1')).toBe('In control');   // the GM's press cycles Kira's (resolveUserActorId)
  }, 60_000);

  it('control: a character with no position of their own sees the fight\'s', async () => {
    await pressBadge('pl-1');                       // Kira: in control — Ren has none
    expect(stored().positions).toEqual({ 'pc-kira': 'in_control' });
    expect(await badgeLabel('pl-2')).toBe('In control');
  }, 60_000);
});
