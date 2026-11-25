/**
 * STARFORGED COMPANION
 * tests/unit/beginVowSwornOnTheRecord.test.js
 *
 * Known-issues VOW-SWORN-UNNAMED-IN-THE-RECORD — the long haul's fourth live
 * run (issue #383, `explorations/long-haul-live-20261124-213912/`, a2–a3, and
 * its free rehearsal). The player swore "Find who is raiding the Cinder
 * Expanse lanes" in Begin a Session's dialog (the "no vow in play" offer,
 * issue #353 R3), and no prompt of the run held "swore the vow": session 1's
 * record had no `vow.sworn`, its swear roll's line named no vow ("Swear an
 * Iron Vow (+heart), weak hit — LASTING: a vow sworn"), and a76's recap took
 * the seeded background vow for the one sworn.
 *
 * Traced: the dialog's client made the vow on the sheet as soon as it had
 * sent the Begin to the canonical GM (the relay has no ack), so the GM's
 * sheet watch saw the vow before the GM had begun — or, at a world's first
 * Begin, minted — the session: its `vow.sworn` was built for the session the
 * store held then, none (dropped) or the session before (filed there). The
 * vow is made by the canonical GM now, in the Begin it belongs to, once the
 * session is begun. And the record's line for a vow move names its vow
 * (phrasing.js moveText).
 *
 * Production entry point: openBeginSessionDialog on the player's client, on
 * the multi-client harness with live documents, read at the session's stored
 * record (the canonical GM's Session Log page).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { moveText } from '../../src/record/phrasing.js';
import { beatFacts } from '../../src/record/recapView.js';

const MODULE_ID = 'starforged-companion';
const VOW = 'Find who is raiding the Cinder Expanse lanes';
const BACKGROUND = { id: 'bg-mira', name: 'Find the lost colony ship Verity\'s Hope', type: 'progress',
  system: { subtype: 'vow', rank: 'epic', current: 0, completed: false } };

let table;

beforeAll(async () => {
  table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
}, 30_000);
afterAll(() => table?.teardown());

/** A world before Begin — `cs` its session fields — and Mira, the player's, holding the background vow only. */
async function seat(cs) {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, ...cs } } } });
  return table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', ownership: { 'pl-1': 3 }, items: [BACKGROUND] });
}

/**
 * The canonical GM's write that begins the session is a round trip to the
 * server in Foundry, and what the player's client writes meanwhile reaches
 * the GM before it lands — the vow the dialog swore did, in the live run.
 * The harness applies a write at once; held here until the vow is on the
 * sheet (and its createItem has reached the GM), or for a moment when no vow
 * comes before it.
 */
function holdTheBeginWrite(actor, name) {
  let held = false;
  table.interceptWrites(async (write) => {
    if (held || write.kind !== 'setting' || !String(write.key).endsWith('campaignState') || write.client !== 'gm-1') return;
    const v = write.value ?? {};
    if (!v.currentSessionId || v.sessionStartedId !== v.currentSessionId) return;
    held = true;
    const start = Date.now();
    while (Date.now() - start < 300 && !actor.items.contents.some(i => i.name === name)) await new Promise(r => setTimeout(r, 5));
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
  });
}

/** Begin a Session on the player's client with a vow written in its dialog; settled, the record written. */
async function beginWithVow(actor, name, rank = 'dangerous') {
  holdTheBeginWrite(actor, name);
  const pl = table.client('pl-1');
  pl.answerDialogs((d) => (d.title === 'Begin a Session'
    ? d.submit({ 'input[name="newVow"]': name, 'select[name="newVowRank"]': rank })
    : d.close()));
  const { openBeginSessionDialog } = await pl.import('../../src/safety/sessionLifecycleDialogs.js');
  await pl.run(() => openBeginSessionDialog());
  await table.drain(5000);
  const gm = table.client('gm-1');
  const { recordSettled } = await gm.import('../../src/record/record.js');
  await gm.run(() => recordSettled());
  await table.settle();
}

/** The events the session's page of the Session Log holds. */
function storedEvents(sessionId) {
  const page = table.journal.contents.find(j => j.name === JOURNAL_NAMES.sessionLog)?.pages.contents
    .find(p => p.flags?.[MODULE_ID]?.sessionRecord?.sessionId === sessionId || p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === sessionId);
  return Object.values(page?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {});
}

describe('the vow Begin a Session\'s dialog swears is on the session\'s record (VOW-SWORN-UNNAMED-IN-THE-RECORD)', () => {
  it('a world\'s first Begin, pressed by a player: the session it mints records the vow sworn', async () => {
    const mira = await seat({ currentSessionId: '', sessionNumber: 0, sessionStartedId: null, sessionActive: false });
    await beginWithVow(mira, VOW);

    const cs = table.world.campaignState();
    expect(cs.currentSessionId).toBeTruthy();
    expect(cs.sessionStartedId).toBe(cs.currentSessionId);
    expect(mira.items.contents.find(i => i.name === VOW)).toMatchObject({ type: 'progress', system: { subtype: 'vow', rank: 'dangerous' } });

    const sworn = storedEvents(cs.currentSessionId).filter(e => e.k === 'vow.sworn');
    expect(sworn).toHaveLength(1);
    expect(sworn[0]).toMatchObject({ s: cs.currentSessionId, who: { actor: 'pc-mira' }, d: { name: VOW, rank: 'dangerous', actorId: 'pc-mira' } });
    // After its session's first event — the vow is the begun session's.
    const begun = storedEvents(cs.currentSessionId).find(e => e.k === 'session.begun');
    expect(begun).toBeTruthy();
  });

  it('the Begin after an End a Session: the vow is the new session\'s, not the one that ended', async () => {
    const mira = await seat({ currentSessionId: 'sess-1', sessionNumber: 1, sessionStartedId: 'sess-1', sessionEndedId: 'sess-1', sessionActive: false });
    await beginWithVow(mira, VOW, 'formidable');

    const cs = table.world.campaignState();
    expect(cs.currentSessionId).not.toBe('sess-1');
    expect(storedEvents('sess-1').filter(e => e.k === 'vow.sworn')).toEqual([]);
    expect(storedEvents(cs.currentSessionId).filter(e => e.k === 'vow.sworn').map(e => e.d.name)).toEqual([VOW]);
  });

  it('the dialog\'s vow is sworn once, on the player\'s own character — not on the client that pressed Begin', async () => {
    const mira = await seat({ currentSessionId: '', sessionNumber: 0, sessionStartedId: null, sessionActive: false });
    const made = [];
    table.onEvent((event) => {
      if (event.type === 'write' && event.outcome === 'applied' && event.kind === 'item.create' && event.name === VOW) made.push(event.client);
    });
    await beginWithVow(mira, VOW);
    expect(mira.items.contents.filter(i => i.name === VOW)).toHaveLength(1);
    expect(made).toEqual(['gm-1']);
  });
});

describe('the record\'s line for a vow move names its vow (moveText)', () => {
  const swear = { moveId: 'swear_an_iron_vow', name: 'Swear an Iron Vow', stat: 'heart', outcome: 'weak_hit', target: { name: VOW, id: 'vow-1' } };

  it('Swear an Iron Vow, Reach a Milestone, Fulfill Your Vow and Forsake Your Vow say which vow', () => {
    expect(moveText(swear)).toBe(`Swear an Iron Vow (+heart): “${VOW}”, weak hit`);
    expect(moveText({ moveId: 'reach_a_milestone', name: 'Reach a Milestone', target: { name: VOW } })).toBe(`Reach a Milestone: “${VOW}”`);
    expect(moveText({ moveId: 'fulfill_your_vow', name: 'Fulfill Your Vow', rollKind: 'progress', stat: null, outcome: 'strong_hit', target: { name: VOW } }))
      .toBe(`Fulfill Your Vow: “${VOW}”, strong hit`);
    expect(moveText({ moveId: 'forsake_your_vow', name: 'Forsake Your Vow', outcome: null, target: { name: VOW } })).toBe(`Forsake Your Vow: “${VOW}”`);
  });

  it('the recap\'s and the summary\'s line for the run\'s swear: the vow by its words', () => {
    const beat = { kind: 'play', who: { name: 'Mira Kestrel', actor: 'pc-mira' }, line: null, move: swear,
      changes: [{ actor: 'pc-mira', what: 'momentum', from: 3, to: 4, cause: 'move' }], did: [], established: [], lasting: 'a vow sworn' };
    expect(beatFacts(beat)).toBe(`Mira Kestrel — Swear an Iron Vow (+heart): “${VOW}”, weak hit — Momentum 3 → 4 — LASTING: a vow sworn`);
  });

  it('control: a move with a target that is no vow, or a vow move with none, reads as before', () => {
    expect(moveText({ moveId: 'face_danger', name: 'Face Danger', stat: 'edge', outcome: 'miss', target: { name: 'the breach' } })).toBe('Face Danger (+edge), miss');
    expect(moveText({ moveId: 'swear_an_iron_vow', name: 'Swear an Iron Vow', stat: 'heart', outcome: 'strong_hit', target: null })).toBe('Swear an Iron Vow (+heart), strong hit');
  });
});
