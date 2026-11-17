/**
 * STARFORGED COMPANION
 * tests/unit/publishedReflectionCheckedAgainstPrivateLines.test.js
 *
 * Issue #362 D13 (PUBLISHED-REFLECTION-OTHER-PLAYERS-LINES; the maintainer's
 * answer A) — the Private Channel's narrator writes under its publisher's own
 * Private Lines (formatOwnSafetyContext), by decision, yet a published
 * reflection is read by the whole table and becomes canon (ring, summary,
 * tier pass): shared narration in effect, for which "Private Lines in shared
 * narration" says a limit someone else set must hold. Nothing checked the
 * published text against the other players' lines, and the publisher's
 * client cannot (it must never be sent them). Publishing now goes through the
 * canonical GM, which holds every player's lines: when another player has
 * some, it checks the text with one short call and refuses — with a notice
 * that names no one and no line — a text that crosses one, or one it cannot
 * check. With nobody else's lines, nothing is checked.
 *
 * On a booted table of a GM and two players: the real Publish, the relay and
 * the GM's handler; only the Claude endpoint is scripted.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REFLECTION = 'Kira remembers the web strung across the vent, and the thing that moved in it.';
const RENS_LINE  = 'spiders';
const PATS_LINE  = 'drowning';

let table;
let verdict;   // what the GM's check is answered: a word, or a fault

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

/** The table's Private Lines as the GM-side copy holds them. */
const linesOf = (entries) => ({ ...CampaignStateSchema.safety, privateLines: entries });

async function reset({ privateLines = [{ playerId: 'pl-2', lines: [RENS_LINE] }], gmKey = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, currentSessionId: 'pr-s1', sessionNumber: 2, sessionActive: true,
      lastSessionTimestamp: new Date().toISOString(), safety: linesOf(privateLines) },
  } } });
  if (gmKey) await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
  verdict = 'CLEAR';
  table.claude.respond((call) => {
    if (call.userText?.includes('LIMITS:')) return typeof verdict === 'string' ? verdict : verdict();
    return 'Steel rings.';   // the tier pass, and anything else
  });
  silenceConsoleErrors();
}

const checks      = () => table.claude.calls.filter(c => c.userText?.includes('LIMITS:'));
const reflections = () => table.cards(f => f.publishedReflection);
const refusals    = () => table.cards(f => f.publishRefusedNotice);

/** Pat publishes from his Private Channel. */
async function patPublishes(content = REFLECTION) {
  const pat = table.client('pl-1');
  const { publishToMainChat } = await pat.import('../../src/private-channel/publish.js');
  const out = await pat.run(() => publishToMainChat({ userId: 'pl-1', content }));
  await table.settle(); await table.drain();
  return out;
}

describe('issue #362 D13 — a published reflection is checked against the other players\' Private Lines', () => {
  beforeEach(() => reset());

  it('another player has Private Lines: the GM checks the text once, and posts the clear reflection', async () => {
    await patPublishes();

    expect(checks().map(c => c.client), 'one check, on the GM\'s client').toEqual(['gm-1']);
    expect(checks()[0].userText).toContain(RENS_LINE);
    expect(checks()[0].userText).toContain(REFLECTION);
    // Pat's browser was sent no other player's line.
    expect(table.claude.calls.filter(c => c.client !== 'gm-1')).toEqual([]);
    expect(reflections()).toHaveLength(1);
    expect(reflections()[0].flags[MODULE_ID]).toMatchObject({ narratorCard: true, narrationText: REFLECTION, sessionId: 'pr-s1' });
    expect(reflections()[0].content).toContain('◈ Kira — private reflection');
  }, 30_000);

  it('a reflection that crosses another player\'s line is not published, and the notice names no one and no line', async () => {
    verdict = 'CROSSES';
    await patPublishes();

    expect(reflections()).toEqual([]);
    const notice = refusals().at(-1);
    expect(notice, 'Pat is told').toBeTruthy();
    expect(notice.whisper).toEqual(['pl-1']);
    expect(notice.content).toMatch(/not published/i);
    expect(notice.content).not.toContain(RENS_LINE);
    expect(notice.content).not.toMatch(/\bRen\b/);
  }, 30_000);

  it('a check that cannot run — the call fails — refuses: "can\'t be checked right now"', async () => {
    verdict = () => claudeFault.overloaded();
    await patPublishes();

    expect(reflections()).toEqual([]);
    expect(refusals().at(-1)?.content).toMatch(/can(?:'|&#39;)t be checked/);
  }, 30_000);

  it('a reply that names neither answer is not taken as clear', async () => {
    verdict = 'Hard to say.';
    await patPublishes();
    expect(reflections()).toEqual([]);
    expect(refusals()).toHaveLength(1);
  }, 30_000);

  it('a keyless GM cannot check another player\'s lines: refused, and no call is made', async () => {
    await reset({ gmKey: false });
    await patPublishes();

    expect(checks()).toEqual([]);
    expect(reflections()).toEqual([]);
    expect(refusals().at(-1)?.content).toMatch(/can(?:'|&#39;)t be checked/);
  }, 30_000);

  it('control: only the publisher\'s own Private Lines — nothing is checked, and the reflection is posted', async () => {
    await reset({ privateLines: [{ playerId: 'pl-1', lines: [PATS_LINE] }] });
    await patPublishes();

    expect(checks()).toEqual([]);
    expect(reflections()).toHaveLength(1);
  }, 30_000);

  it('control: a keyless GM with nobody else\'s lines still publishes', async () => {
    await reset({ privateLines: [], gmKey: false });
    await patPublishes();
    expect(reflections()).toHaveLength(1);
  }, 30_000);

  it('no GM connected: the publisher is told it cannot be checked, and nothing is posted', async () => {
    await table.leave('gm-1');
    try {
      const out = await patPublishes();
      expect(out).toBeNull();
      expect(reflections()).toEqual([]);
      expect(table.client('pl-1').notifications.some(n => /can't be checked/.test(n.message))).toBe(true);
    } finally {
      await table.join('gm-1');
      await table.reload('gm-1');
    }
  }, 30_000);
});
