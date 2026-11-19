/**
 * STARFORGED COMPANION
 * tests/unit/privateChannelPublishRefusalInWindow.test.js
 *
 * Issue #364 PRIVATE-REFLECTION-REFUSAL-IN-CHAT. Publishing a Private Channel
 * reflection goes through the canonical GM, which checks it against every
 * player's Private Lines (issue #362 D13). When the GM's game refused it —
 * the text crosses a line, cannot be checked, the X-Card was played — the
 * publisher was whispered in the main chat, away from the window they
 * pressed Publish in, whose banner is where every other reason is said.
 *
 * A relayed publish is now an ask the canonical GM answers over the module
 * socket, as an oracle question's odds are: the answer carries the ask's id
 * and one word of outcome, and the publishing client words it in its own
 * window's banner. Nothing is whispered into the main chat.
 *
 * On a booted table of a GM and two players: the real window's Publish
 * action, the real relay, the GM's real handler and its answer; only the
 * Claude endpoint is scripted.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REFLECTION = 'Kira remembers the web strung across the vent, and the thing that moved in it.';
const RENS_LINE  = 'spiders';

let table;
let verdict;   // what the GM's check is answered: a word, or a function returning one (or a promise of one)

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset({ gmKey = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, currentSessionId: 'pr-s1', sessionNumber: 2, sessionActive: true,
      lastSessionTimestamp: new Date().toISOString(),
      safety: { ...CampaignStateSchema.safety, privateLines: [{ playerId: 'pl-2', lines: [RENS_LINE] }] } },
  } } });
  if (gmKey) await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
  verdict = 'CLEAR';
  table.claude.respond((call) => {
    if (call.userText?.includes('LIMITS:')) return typeof verdict === 'string' ? verdict : verdict();
    return 'Steel rings.';
  });
  silenceConsoleErrors();
}

beforeEach(() => reset());
afterEach(async () => {
  vi.useRealTimers();
  const { PrivateChannelApp } = await pat().import('../../src/private-channel/app.js');
  pat().run(() => PrivateChannelApp._resetInstances());
});

const pat         = () => table.client('pl-1');
const reflections = () => table.cards(f => f.publishedReflection);
const whispers    = () => table.cards(() => true).filter(m => (m.whisper ?? []).length);
const answers     = async () => {
  const { PUBLISH_ANSWER_KIND } = await import('../../src/private-channel/publish.js');
  return table.socketLog.filter(e => e.payload?.kind === PUBLISH_ANSWER_KIND);
};

/** Pat's Private Channel window, the narrator's last turn the reflection; `publish()` presses Publish… and confirms. */
async function openWindow() {
  const { PrivateChannelApp } = await pat().import('../../src/private-channel/app.js');
  const app = await pat().run(() => PrivateChannelApp.open({ userId: 'pl-1' }));
  app.turns = [{ who: 'player', name: 'Kira', text: 'What do I remember?' }, { who: 'narrator', name: 'Narrator', text: REFLECTION }];
  pat().answerDialogs(dialog => dialog.choose('yes'));
  const press = () => pat().run(() => PrivateChannelApp.DEFAULT_OPTIONS.actions.publish.call(app, {}, null));
  const publish = async () => { await press(); await table.settle(); await table.drain(); };
  return { app, press, publish, PrivateChannelApp };
}

describe('issue #364 PRIVATE-REFLECTION-REFUSAL-IN-CHAT — the GM\'s refusal is said in the publisher\'s window', () => {
  it('a reflection that crosses another player\'s line: the window\'s banner says so, naming no one and no line', async () => {
    verdict = 'CROSSES';
    const { app, publish } = await openWindow();
    await publish();

    expect(reflections()).toEqual([]);
    expect(app.errorBanner).toMatch(/was not published/i);
    expect(app.errorBanner).toMatch(/safety settings/i);
    expect(app.errorBanner).not.toContain(RENS_LINE);
    expect(app.errorBanner).not.toMatch(/\bRen\b/);
    expect(app.publishing, 'Publish is not left waiting').toBe(false);
  }, 30_000);

  it('nothing is whispered into the main chat, and nobody else is told', async () => {
    verdict = 'CROSSES';
    const { publish } = await openWindow();
    await publish();

    expect(whispers(), 'whispered chat messages').toEqual([]);
    expect(table.cards(() => true), 'chat messages of any kind').toEqual([]);
    expect(pat().notifications, 'said in the window, not as a notification').toEqual([]);
    expect(table.client('pl-2').notifications).toEqual([]);
  }, 30_000);

  it('the GM\'s answer carries the ask\'s id and one word — never the line, a name or the text', async () => {
    verdict = 'CROSSES';
    const { publish } = await openWindow();
    await publish();

    const sent = await answers();
    expect(sent.map(e => e.from)).toEqual(['gm-1']);
    expect(Object.keys(sent[0].payload).sort()).toEqual(['id', 'kind', 'outcome']);
    expect(sent[0].payload.outcome).toBe('crosses');
    const wire = JSON.stringify(sent[0].payload);
    expect(wire).not.toContain(RENS_LINE);
    expect(wire).not.toContain('pl-2');
    expect(wire).not.toContain('pl-1');
    expect(wire).not.toContain('web strung');
  }, 30_000);

  it('a reflection that cannot be checked (a keyless GM): the banner says it can\'t be checked', async () => {
    await reset({ gmKey: false });
    const { app, publish } = await openWindow();
    await publish();
    expect(reflections()).toEqual([]);
    expect(app.errorBanner).toMatch(/can't be checked/);
    expect(whispers()).toEqual([]);
  }, 30_000);

  it('the X-Card played while the check was out: the banner says the X-Card is in play', async () => {
    verdict = () => {
      // The X-Card lands on the GM's client while its check is out.
      table.client('gm-1').run(() => {
        const cs = { ...game.settings.get(MODULE_ID, 'campaignState'), xCardActive: true };
        return game.settings.set(MODULE_ID, 'campaignState', cs);
      });
      return 'CLEAR';
    };
    const { app, publish } = await openWindow();
    await publish();
    expect(reflections()).toEqual([]);
    expect(app.errorBanner).toMatch(/X-Card is in play/);
  }, 30_000);

  it('control: a clear reflection is published, and the banner stays empty', async () => {
    const { app, publish } = await openWindow();
    await publish();
    expect(reflections()).toHaveLength(1);
    expect(app.errorBanner).toBe('');
    expect(app.publishing).toBe(false);
    expect((await answers())[0].payload.outcome).toBe('published');
    expect(pat().notifications).toEqual([]);
  }, 30_000);

  it('Publish waits for the answer: a second press while it is out asks nothing more', async () => {
    let release;
    verdict = () => new Promise((resolve) => { release = () => resolve('CLEAR'); });
    const { app, press } = await openWindow();
    const first = press();
    await vi.waitFor(() => expect(release, 'the GM\'s check is out').toBeTypeOf('function'));
    expect(app.publishing).toBe(true);
    expect((await pat().run(() => app._prepareContext({}))).publishing).toBe(true);
    await press();   // pressed again while the first is out
    release();
    await first;
    await table.settle(); await table.drain();
    expect(reflections()).toHaveLength(1);
    expect(app.publishing).toBe(false);
  }, 30_000);

  it('no answer in time: the window says so and Publish is free again — and the refusal, when it comes, replaces the line', async () => {
    const publishModule = await pat().import('../../src/private-channel/publish.js');
    let release;
    verdict = () => new Promise((resolve) => { release = () => resolve('CROSSES'); });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { app, press } = await openWindow();
    const pressed = press();
    await vi.waitFor(() => expect(release, 'the GM\'s check is out').toBeTypeOf('function'));
    await vi.advanceTimersByTimeAsync(publishModule.PUBLISH_WAIT_MS + 1);
    await pressed;
    expect(app.errorBanner).toBe(publishModule.PUBLISH_UNANSWERED);
    expect(app.publishing, 'the wait is bounded').toBe(false);

    vi.useRealTimers();
    release();
    await table.settle(); await table.drain();
    expect(reflections()).toEqual([]);
    expect(app.errorBanner).toMatch(/was not published/i);
    expect(whispers()).toEqual([]);
  }, 30_000);

  it('a late answer that it was published clears the "not answered yet" line', async () => {
    const publishModule = await pat().import('../../src/private-channel/publish.js');
    let release;
    verdict = () => new Promise((resolve) => { release = () => resolve('CLEAR'); });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { app, press } = await openWindow();
    const pressed = press();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await vi.advanceTimersByTimeAsync(publishModule.PUBLISH_WAIT_MS + 1);
    await pressed;
    expect(app.errorBanner).toBe(publishModule.PUBLISH_UNANSWERED);

    vi.useRealTimers();
    release();
    await table.settle(); await table.drain();
    expect(reflections()).toHaveLength(1);
    expect(app.errorBanner).toBe('');
  }, 30_000);

  it('the window was closed before a late refusal came: it is said as a notification, to the publisher alone', async () => {
    const publishModule = await pat().import('../../src/private-channel/publish.js');
    let release;
    verdict = () => new Promise((resolve) => { release = () => resolve('CROSSES'); });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { app, press, PrivateChannelApp } = await openWindow();
    const pressed = press();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await vi.advanceTimersByTimeAsync(publishModule.PUBLISH_WAIT_MS + 1);
    await pressed;
    pat().run(() => { app._onClose({}); });
    expect(pat().run(() => PrivateChannelApp._hasInstance('pl-1'))).toBe(false);

    vi.useRealTimers();
    release();
    await table.settle(); await table.drain();
    expect(pat().notifications.some(n => /was not published/i.test(n.message))).toBe(true);
    expect(table.client('pl-2').notifications).toEqual([]);
    expect(whispers()).toEqual([]);
  }, 30_000);
});
