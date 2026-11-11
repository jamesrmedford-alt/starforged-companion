/**
 * STARFORGED COMPANION
 * tests/unit/beginDialogCountsShownFlags.test.js
 *
 * Issue #345 AA60 BEGIN-DIALOG-COUNTS-PRIVATE-FLAGS (the twelfth audit's
 * SESS-6) — Begin a Session's review list counted the GM-only flags for
 * every viewer.
 *
 * Set a Flag offers "Private — GM only": its card is whispered to the GMs
 * and Begin a Session lists a private flag for GMs only (the list filters
 * `visibility !== "private" || game.user.isGM`). The list's heading counted
 * the unfiltered array, so a player opening Begin a Session — the Session
 * panel's button, or `!begin-session` — read "Flagged content to review (3)"
 * over one listed flag: the table learnt that two private flags existed (and,
 * flag by flag, when someone set one). The heading now counts the flags the
 * viewer is shown.
 *
 * Production entry point: openBeginSessionDialog on a player's client (the
 * Session panel's Begin Session, `!begin-session`), on the multi-client
 * harness; the dialog is dismissed without beginning.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

const FLAGS = [
  { _id: 'f1', text: 'No spiders', visibility: 'public', createdBy: 'Pat', createdAt: '2026-11-01T00:00:00.000Z' },
  { _id: 'f2', text: 'Nothing about drowning, please', visibility: 'private', createdBy: 'Quinn', createdAt: '2026-11-02T00:00:00.000Z' },
  { _id: 'f3', text: 'Keep my brother out of it', visibility: 'private', createdBy: 'Quinn', createdAt: '2026-11-03T00:00:00.000Z' },
];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2], world: { settings: {
    campaignState: {
      ...CampaignStateSchema, currentSessionId: 'bdp-s2', sessionNumber: 2, sessionActive: false,
      sessionStartedId: null, lastSessionTimestamp: new Date().toISOString(), safetyFlags: FLAGS,
    },
  } } });
}, 30_000);
afterAll(() => table?.teardown());

/** Open Begin a Session on `userId`'s client and return what its dialog shows; dismiss it. */
async function beginDialogContent(userId) {
  let shown = null;
  table.client(userId).answerDialogs((d) => { if (d.title === 'Begin a Session') shown = d.content; return d.close(); });
  const { openBeginSessionDialog } = await table.client(userId).import('../../src/safety/sessionLifecycleDialogs.js');
  await table.client(userId).run(() => openBeginSessionDialog());
  await table.settle();
  return shown ?? '';
}

describe("issue #345 AA60 — Begin a Session's flagged-content review on a player's screen", () => {
  it('counts only the flags the player is shown — the GM-only flags stay unannounced', async () => {
    const html = await beginDialogContent('pl-1');
    expect(html, 'sanity: the public flag is listed').toMatch(/No spiders/);
    expect(html, 'sanity: no private flag text is shown').not.toMatch(/drowning|brother/);
    expect(html).toMatch(/Flagged content to review \(1\)/);
  }, 30_000);

  it("control: the GM's dialog lists and counts all three", async () => {
    const html = await beginDialogContent('gm-1');
    expect(html).toMatch(/Flagged content to review \(3\)/);
    expect(html).toMatch(/drowning/);
    expect(html).toMatch(/brother/);
  }, 30_000);
});

describe("issue #345 AA60 — the count is the viewer's flags, however many the list shows", () => {
  const setFlags = async (flags) => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, currentSessionId: 'bdp-s2', sessionNumber: 2, sessionActive: false,
      sessionStartedId: null, lastSessionTimestamp: new Date().toISOString(), safetyFlags: flags,
    } } } });
  };
  const flag = (i, visibility) => ({ _id: `g${i}`, text: `Flag number ${i}`, visibility, createdBy: 'Pat', createdAt: `2026-11-0${i}T00:00:00.000Z` });

  it("a player whose table set only private flags is shown no list and no count", async () => {
    await setFlags([flag(1, 'private'), flag(2, 'private')]);
    const html = await beginDialogContent('pl-1');
    expect(html).not.toMatch(/Flagged content to review/);
    expect(html).toMatch(/No flagged content/);
  }, 30_000);

  it("six public flags and two private: a player reads (6) over the last five; the GM (8)", async () => {
    await setFlags([1, 2, 3, 4, 5, 6].map(i => flag(i, 'public')).concat([flag(7, 'private'), flag(8, 'private')]));
    const player = await beginDialogContent('pl-1');
    expect(player).toMatch(/Flagged content to review \(6\)/);
    expect((player.match(/<li>/g) ?? []).length).toBe(5);
    expect(await beginDialogContent('gm-1')).toMatch(/Flagged content to review \(8\)/);
  }, 30_000);
});
