/**
 * PROBE — CARDS-04 VOW-RECOMMIT-SOLE-OPEN-FALLBACK (tenth audit, area cards)
 *
 * What the user does: a crew whose world predates 2026-07 still holds a
 * journal `vow` track ("Repay the Syndicate" in the Progress Tracks journal
 * — the dormant store the vow-flow doc describes). Kira misses Fulfill Your
 * Vow on her sheet vow "Find Chen", which has no journal twin, and presses
 * 🔁 Recommit to the Vow (issue #330 D1).
 *
 * What happens: performVowRecommit (src/index.js) looks for the vow's
 * journal twin with selectVowTrack(openTracks, "Find Chen") and no
 * `byNameOnly`: the ladder's last rung is the SOLE OPEN journal vow, so the
 * unrelated "Repay the Syndicate" track has the lowest die's boxes cleared
 * and its rank raised beside Kira's Item. The inverse holds too: a miss
 * scored from a journal-only vow (its id is a track's, matching no Item)
 * falls through resolveVowItemCopies' sole-open rung to the crew's one open
 * Item vow and rewrites that.
 *
 * What should happen: a recommit is written to the vow the roll scored and
 * its own copies — a costly write never falls to a sole-open sibling
 * (rules/reachability.md §6; issue #326 W44 gave finishVow `byNameOnly`
 * for exactly this: "completing a track is a costly guess").
 *
 * Control: an Item vow with a same-named journal twin has both written.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/vowRecommitJournalSoleOpen.probe.js
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('CARDS-04 a vow recommit beside an unrelated journal vow track', () => {
  it('leaves the sole open journal vow alone when the Item vow has no twin', async () => {
    journal = makeTracksJournal([{ id: 'jt-1', label: 'Repay the Syndicate', type: 'vow', rank: 'dangerous', ticks: 20, completed: false }]);
    table.journal._set(journal);

    const res = await recommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 4, rank: 'formidable' });          // Kira's vow: recommitted

    // Expected: "Repay the Syndicate" untouched — it is another vow. Actual: 20 → 12 ticks, dangerous → formidable.
    expect(journal.tracks().find(t => t.id === 'jt-1')).toMatchObject({ ticks: 20, rank: 'dangerous' });
  }, 30_000);

  it('a journal-only vow\'s recommit never rewrites the crew\'s one open Item vow', async () => {
    journal = makeTracksJournal([{ id: 'jt-1', label: 'Repay the Syndicate', type: 'vow', rank: 'dangerous', ticks: 20, completed: false }]);
    table.journal._set(journal);

    // The pipeline's offer for a miss scored from the journal track: its id is the track's (matches no Item).
    const res = await recommit({ vowName: 'Repay the Syndicate', itemId: 'jt-1', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });

    // Expected: Kira's "Find Chen" untouched. Actual: 12 → 4 ticks and formidable — the sole-open Item rung.
    expect(vow.system).toMatchObject({ current: 12, rank: 'dangerous' });
    // And the journal vow recommitted from ITS ticks (20 → 12); actual: 4 — the plan was made from the Item's 12.
    expect.soft(journal.tracks().find(t => t.id === 'jt-1')).toMatchObject({ ticks: 12, rank: 'formidable' });
  }, 30_000);

  it('control: an Item vow with a same-named journal twin has both written', async () => {
    journal = makeTracksJournal([{ id: 'jt-2', label: 'Find Chen', type: 'vow', rank: 'dangerous', ticks: 12, completed: false }]);
    table.journal._set(journal);

    const res = await recommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' });
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 4, rank: 'formidable' });
    expect(journal.tracks().find(t => t.id === 'jt-2')).toMatchObject({ ticks: 4, rank: 'formidable' });
  }, 30_000);
});
