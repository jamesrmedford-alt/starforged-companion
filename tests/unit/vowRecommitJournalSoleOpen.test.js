/**
 * Issue #336 Y25 — VOW-RECOMMIT-SOLE-OPEN-FALLBACK.
 *
 * A world from before 2026-07 still holds a journal `vow` track ("Repay the
 * Syndicate" in the Progress Tracks journal — the dormant store vow-flow.md
 * describes). Kira recommits her sheet vow "Find Chen", which has no journal
 * twin: performVowRecommit looked for the twin with selectVowTrack and no
 * `byNameOnly`, whose last rung is the sole open journal vow, so the
 * unrelated "Repay the Syndicate" was cleared and raised with the Item's
 * plan. The inverse too: a miss scored from a journal-only vow (its id is the
 * track's, matching no Item) fell through resolveVowItemCopies' sole-open
 * rung to the crew's one open Item vow and rewrote that.
 *
 * A recommit is written to the vow the miss scored and its own copies — a
 * costly write never falls to a sole-open sibling (rules/reachability.md §6;
 * issue #326 W44 gave finishVow `byNameOnly` for exactly this): the Item by
 * its id or the roller's exact name, the twin by its id or that name, and a
 * journal-only vow recommits from its own ticks.
 *
 * Control: an Item vow with a same-named journal twin has both written.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vow, journal;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
    tracks: () => store[`${MODULE_ID}.tracks`],
  };
}

function makeVow(id, name, current = 12) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: `vid-${id}` } },
    system: { subtype: 'vow', rank: 'dangerous', current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
  };
  return item;
}

/** The GM recommits, with the d10s scripted (2 and 6 → lowest 2: two boxes). */
async function recommit(args) {
  const gm = table.client('gm-1');
  const rng = vi.spyOn(Math, 'random');
  rng.mockReturnValueOnce(0.15).mockReturnValueOnce(0.55);
  try {
    const res = await gm.run(() => gm.index.performVowRecommit(args));
    await table.settle(); await table.drain();
    return res;
  } finally { rng.mockRestore(); }
}

const track = (id) => journal.tracks().find(t => t.id === id);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'js-s1', sessionNumber: 1 },
  } } });
  vow = makeVow('vow-kira', 'Find Chen');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true, items: { contents: [vow] } });
  silenceConsoleErrors();
});

describe('issue #336 Y25 — a vow recommit beside an unrelated journal vow track', () => {
  it('leaves the sole open journal vow alone when the Item vow has no twin', async () => {
    journal = makeTracksJournal([{ id: 'jt-1', label: 'Repay the Syndicate', type: 'vow', rank: 'dangerous', ticks: 20, completed: false }]);
    table.journal._set(journal);

    const res = await recommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 4, rank: 'formidable' });          // Kira's vow: recommitted
    expect(track('jt-1')).toMatchObject({ ticks: 20, rank: 'dangerous' });          // another vow: untouched
  }, 30_000);

  it('a journal-only vow\'s recommit never rewrites the crew\'s one open Item vow, and plans from its own ticks', async () => {
    journal = makeTracksJournal([{ id: 'jt-1', label: 'Repay the Syndicate', type: 'vow', rank: 'dangerous', ticks: 20, completed: false }]);
    table.journal._set(journal);

    // The pipeline's offer for a miss scored from the journal track: its id is the track's (matches no Item).
    const res = await recommit({ vowName: 'Repay the Syndicate', itemId: 'jt-1', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 12, rank: 'dangerous' });           // Kira's "Find Chen": untouched
    expect(track('jt-1')).toMatchObject({ ticks: 12, rank: 'formidable' });         // 20 → 12, from its own ticks
  }, 30_000);

  it('a name that is no vow of the roller\'s and no journal track recommits nothing', async () => {
    journal = makeTracksJournal([{ id: 'jt-1', label: 'Repay the Syndicate', type: 'vow', rank: 'dangerous', ticks: 20, completed: false }]);
    table.journal._set(journal);

    const res = await recommit({ vowName: 'Hunt the Wyrm', itemId: null, actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: false, reason: 'no-vow' });
    expect(vow.system).toMatchObject({ current: 12, rank: 'dangerous' });
    expect(track('jt-1')).toMatchObject({ ticks: 20, rank: 'dangerous' });
  }, 30_000);

  it('control: an Item vow with a same-named journal twin has both written', async () => {
    journal = makeTracksJournal([{ id: 'jt-2', label: 'Find Chen', type: 'vow', rank: 'dangerous', ticks: 12, completed: false }]);
    table.journal._set(journal);

    const res = await recommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 4, rank: 'formidable' });
    expect(track('jt-2')).toMatchObject({ ticks: 4, rank: 'formidable' });
  }, 30_000);
});
