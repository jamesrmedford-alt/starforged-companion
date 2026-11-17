/**
 * STARFORGED COMPANION
 * tests/unit/privateChannelFailedSendLineBackInBox.test.js
 *
 * Issue #362 AC80 PRIVATE-FAILED-SEND-LINE-NOT-RETRIABLE — Pat sends a line in
 * his Private Channel and the narrator call fails (an overloaded API, a
 * dropped request). The window's banner reads "The narrator call failed. Your
 * message is preserved; try again." #onSend emptied the box and filed the
 * line as a transcript turn before the call, and nothing handed it back: Send
 * on the empty box did nothing, so "try again" meant typing the line again —
 * and the retyped line was then in the transcript, and in what the narrator
 * was sent, twice. A line the narrator did not answer now goes back in the
 * box (the module's rule for a line not acted on: PT11, MOVE-BUSY-NOTICE) and
 * is no turn of the conversation — not shown, not saved, not sent again.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const LINE = 'I never told anyone about the ring. Should I tell Ren before we dock?';
let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(),
  } } } });
  await table.setClaudeKey('pl-1', 'sk-ant-pat');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  silenceConsoleErrors();
});

afterEach(async () => {
  const client = table.client('pl-1');
  const transcript = await client.import('../../src/private-channel/transcript.js');
  client.run(() => transcript._resetBuffers());
  const { PrivateChannelApp } = await client.import('../../src/private-channel/app.js');
  client.run(() => PrivateChannelApp._resetInstances());
});

const pat = () => table.client('pl-1');

/** Pat's window, with the box he types in. */
async function openWindow() {
  const { PrivateChannelApp } = await pat().import('../../src/private-channel/app.js');
  const app = await pat().run(() => PrivateChannelApp.open({ userId: 'pl-1' }));
  const box = { value: '' };
  app.element = { querySelector: (s) => (s === '[data-pc-input]' ? box : null) };
  const send = async () => {
    await pat().run(() => PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null));
    await table.settle();
  };
  return { app, box, send };
}

describe('issue #362 AC80 — a Private Channel line whose narrator call failed', () => {
  it('control: an answered line leaves the box empty and the exchange in the window', async () => {
    table.claude.respond(() => 'Tell him. He already suspects.');
    const { app, box, send } = await openWindow();
    box.value = LINE;
    await send();
    expect(app.errorBanner).toBe('');
    expect(app.turns.map(t => t.who)).toEqual(['player', 'narrator']);
    expect(box.value).toBe('');
  }, 30_000);

  it('the failed line is back in the box, so "try again" is one press', async () => {
    table.claude.respond(() => claudeFault.overloaded());
    const { app, box, send } = await openWindow();
    box.value = LINE;
    await send();
    expect(app.errorBanner).toMatch(/Your message is preserved; try again/);
    expect(app.busy, 'the window is not left busy').toBe(false);
    expect(box.value).toBe(LINE);
  }, 30_000);

  it('tried again, the narrator is sent the line as one turn of the conversation', async () => {
    let fail = true;
    table.claude.respond(() => (fail ? claudeFault.overloaded() : 'Tell him. He already suspects.'));
    const { box, send } = await openWindow();
    box.value = LINE;
    await send();

    fail = false;
    expect(box.value, 'Send retries the line in the box').toBe(LINE);
    await send();
    const last = table.claude.calls.at(-1);
    const transcript = last.userText.split('## PLAYER MESSAGE')[0];
    expect(transcript.split(LINE).length - 1, 'times the line is in the transcript the narrator reads').toBe(1);
  }, 30_000);

  it('the unanswered line is no turn: not in the window, not kept for the session\'s page', async () => {
    table.claude.respond(() => claudeFault.overloaded());
    const { app, box, send } = await openWindow();
    box.value = LINE;
    await send();
    expect(app.turns).toEqual([]);
    const transcript = await pat().import('../../src/private-channel/transcript.js');
    expect(await pat().run(() => transcript.loadSessionTurns('pl-1', 'sess-1'))).toEqual([]);
    const context = await pat().run(() => app._prepareContext({}));
    expect(context.transcriptHtml).not.toContain('about the ring');
  }, 30_000);
});
