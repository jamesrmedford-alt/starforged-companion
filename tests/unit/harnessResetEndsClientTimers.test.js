/**
 * STARFORGED COMPANION
 * tests/unit/harnessResetEndsClientTimers.test.js
 *
 * Issue #364 HARNESS-TIMERS-OUTLIVE-RESET. The multi-client harness
 * (tests/helpers/multiClient.js; its own tests: multiClientHarness.test.js)
 * resets the table between tests but kept every real timer a simulated
 * client had scheduled: a background pass test K started ran inside test
 * K+1's world. Each move narration schedules its chronicle entry on a real
 * 2 s timer (chronicleWriter.js scheduleChronicleEntry), and the scribe
 * about the previous test's prose landed in the next test's first window —
 * counted as that test's narrator call and given its scripted reply
 * (narratorDetailPersistence.test.js, TESTS-FLAKY-UNDER-LOAD).
 *
 * reset() and teardown() now end the clients' pending real-clock timers, as
 * a page reload ends a page's timers. Within a test a client's timer fires
 * as before, and a timer the test itself sets (outside any client) is left
 * alone.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';

const { GM, GM2, P1 } = USERS;
const SCRIBE = 'You are the chronicle scribe';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let table;
let bootTimers = [];
beforeAll(async () => {
  table = await simulateTable({ users: [GM, P1] });
  // What the pages left pending at boot. The table lists every timer a
  // client set until it fires; one its module cleared itself stays listed
  // (the harness does not route clearTimeout), so ask Node whether each is
  // still live — the boot's campaignState write chain sets a bounded wait
  // and clears it once the write ahead lands.
  bootTimers = [...(table._clientTimers ?? [])].filter(t => t.handle?._destroyed !== true).map(t => `${t.client} ${t.name}`);
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(() => table.reset());

describe('reset() ends what the pages scheduled, as a reload does', () => {
  it('a client timer scheduled before reset() never fires after it; one scheduled after does', async () => {
    const fired = [];
    let ticks = 0;
    table.client('gm-1').run(() => setTimeout(() => fired.push('GM timeout from before'), 150));
    table.client('pl-1').run(() => setTimeout(() => fired.push('player timeout from before'), 150));
    table.client('pl-1').run(() => setInterval(() => { ticks += 1; }, 10));
    // The test's own timer, outside any client: no page's, so reset() leaves it.
    setTimeout(() => fired.push('test timer from before'), 150);
    await wait(25);
    expect(ticks).toBeGreaterThan(0);   // the interval runs within the test

    await table.reset();
    const ticksAtReset = ticks;
    table.client('pl-1').run(() => setTimeout(() => fired.push('player timeout from after'), 20));
    await wait(200);   // past every timer's due time

    expect(fired.sort()).toEqual(['player timeout from after', 'test timer from before']);
    expect(ticks).toBe(ticksAtReset);
  });

  it('the chronicle scribe one test\'s narration scheduled does not run in the next test; the next test\'s own still does', async () => {
    const scheduleScribe = async (narrationText) => {
      const gm = table.client('gm-1');
      const { scheduleChronicleEntry } = await gm.import('../../src/character/chronicleWriter.js');
      gm.run(() => scheduleChronicleEntry({ narrationText, campaignState: { characterIds: ['pc-kira'] }, kind: 'paced' }));
    };
    const scribes = () => table.claude.calls.filter(c => c.system.startsWith(SCRIBE));

    // Test K: a narration, its scribe 2 s out.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await scheduleScribe('The derelict\'s hatch gives way with a groan.');
    // Between tests — then test K+1 seats its key and narrates.
    await table.reset();
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await scheduleScribe('Kira finds the beacon still warm.');

    const deadline = Date.now() + 6000;
    while (!scribes().some(c => c.userText.includes('beacon')) && Date.now() < deadline) await wait(25);
    await table.settle();
    // One scribe, about this test's prose. Before the fix the hatch's ran
    // here too, first.
    expect(scribes().map(c => [c.client, c.userText.includes('beacon') ? 'this test' : 'the last test'])).toEqual([['gm-1', 'this test']]);
  }, 15_000);

  it('a page a reload replaced is ended too — what it still had in flight sets no timer that outlives the test', async () => {
    const fired = [];
    const old = table.client('pl-1');
    await table.reload('pl-1');
    // The closed tab's in-flight work goes on in the harness (its writes are
    // refused): a timer it sets now is not the fresh page's, nor in
    // table.clients — and still ends at reset().
    old.run(() => setTimeout(() => fired.push('closed tab'), 80));
    table.client('pl-1').run(() => setTimeout(() => fired.push('fresh page'), 80));
    await table.reset();
    await wait(160);
    expect(fired).toEqual([]);
  }, 15_000);

  it('a page sets no timer at boot, which reset() would end for good (it does not re-boot)', () => {
    expect(bootTimers).toEqual([]);
  });
});

describe('teardown()', () => {
  it('ends the pages\' pending timers with them', async () => {
    const fired = [];
    const other = await simulateTable({ users: [GM2], boot: false });
    other.client('gm-2').run(() => setTimeout(() => fired.push('short'), 30));
    other.client('gm-2').run(() => setTimeout(() => fired.push('long'), 100));
    await other.teardown();
    await wait(160);
    expect(fired).toEqual([]);
  });
});
