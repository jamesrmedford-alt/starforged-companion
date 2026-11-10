/**
 * STARFORGED COMPANION — twelfth bug audit, session area (SESS)
 * tests/probes/session/beginDialogPrivateFlagCount.probe.js
 *
 * SESS-6 — Begin a Session's review list counts the GM-only flags for every
 * viewer.
 *
 * Set a Flag offers "Private — GM only": its card is whispered to the GMs
 * (src/safety/sessionDialogs.js:79-90) and Begin a Session lists a private
 * flag for GMs only (src/safety/sessionLifecycleDialogs.js:57-61 — the list
 * filters `visibility !== "private" || game.user.isGM`). The list's heading
 * counts the unfiltered array (sessionLifecycleDialogs.js:62-63:
 * `Flagged content to review (${(state.safetyFlags ?? []).length})`), so a
 * player opening Begin a Session — the Session panel's button, or
 * `!begin-session` — reads "Flagged content to review (3)" over one listed
 * flag: the table learns that two private flags exist (and, flag by flag,
 * when someone sets one).
 *
 * Production entry point: openBeginSessionDialog on a player's client (the
 * Session panel's Begin Session, `!begin-session`), on the multi-client
 * harness; the dialog is dismissed without beginning.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe("SESS-6 — Begin a Session's flagged-content review on a player's screen", () => {
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
