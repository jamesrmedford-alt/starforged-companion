/**
 * STARFORGED COMPANION
 * tests/unit/plansAreTheGmsAlone.test.js
 *
 * Issue #362 D1 SECRETS-JOURNAL-CLIENT-READ (the maintainer's answer A). The
 * code and the records disagreed on whether a player's client can read the
 * GM-only Secrets journal: `listSkeletons()` had no GM check and ran on
 * players' clients — the Private Channel's story, narration on a player's
 * own key, the Session panel's "What's open" — while oracleConsult.js
 * (P2-31), SNAPSHOT-PLAYER-KEY and worldSnapshotStore.js assumed it cannot.
 * On the simulated table (journals shared, as Foundry may deliver them) a
 * player's Private Channel request carried a plan's truth from the player's
 * browser. Decided: a player's client reads no plan;
 *   - its Private Channel gets the decided plans its message brings into play
 *     from the canonical GM, by relay (bounded; no GM, no plans);
 *   - narration on its own key gets none, as it gets no world snapshot;
 *   - the Session panel shows the table's view the canonical GM keeps.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution,
} from '../helpers/skeletonTable.js';

const TRUTH = 'SENTINEL-TRUTH: the escort is a Keeper drone collecting names for the Pale Choir.';
const OTHER = 'SENTINEL-OTHER: the broker sold the crew\'s route to the Syndicate.';
const WANTS = 'SENTINEL-WANTS: the name Kira carries';

let table;
let restore;
let savedDocument;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  restore = await resetSkeletonTable(table);
});
afterEach(async () => {
  restore?.();
  globalThis.document = savedDocument;
  if (!table.client('gm-1').connected) await table.join('gm-1');
});

const secretsOn = (id) => table.client(id).import('../../src/world/secrets.js');

/** Two decided plans, filed by the GM: the escort (in this scene's frame) and the broker (named nowhere). */
async function filePlans() {
  const secrets = await secretsOn('gm-1');
  const make = (record) => gmOf(table).run(() => secrets.createSkeleton(record, { byGm: true }));
  const escort = await make({ kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' }, truth: TRUTH, wants: WANTS,
    oracleSeeds: ['Character Role: SENTINEL-ROLL'], sceneId: 'sc-0' });
  const broker = await make({ kind: 'threat', subject: { type: 'name', id: null, name: 'the broker' }, truth: OTHER, sceneId: 'sc-0' });
  await table.settle();
  return { escort, broker };
}

/** The Session panel's HTML as `userId`'s client renders it. */
async function panelHtml(userId) {
  const client = table.client(userId);
  const { SessionPanelApp } = await client.import('../../src/ui/sessionPanel.js');
  return client.run(async () => {
    const app = new SessionPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    return root.outerHTML;
  });
}

describe('issue #362 D1 — a player\'s client reads no plan', () => {
  it('the store gives a player\'s client nothing, though the journal is in its collection; the GM reads it', async () => {
    const { escort } = await filePlans();
    expect(plansOf(table).length, 'the shared journal holds them').toBe(2);
    const player = await secretsOn('pl-1');
    expect(table.client('pl-1').run(() => player.listSkeletons({ includeInactive: true }))).toEqual([]);
    expect(table.client('pl-1').run(() => player.getSkeleton(escort.id))).toBeNull();
    expect(table.client('pl-1').run(() => player.plannedSubjects().ids.size)).toBe(0);
    const gm = await secretsOn('gm-1');
    expect(gmOf(table).run(() => gm.listSkeletons()).map(r => r.id)).toContain(escort.id);
  }, 40_000);

  it('a narration on a player\'s own key is sent no plan — as it is sent no world snapshot', async () => {
    await filePlans();
    await table.setClaudeKey('pl-1', 'sk-ant-player');
    const { narrateResolution } = await table.client('pl-1').import('../../src/narration/narrator.js');
    await onGm(table, () => table.client('pl-1').run(() => narrateResolution(moveResolution({ playerNarration: 'I face the escort.' }),
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' })));
    const call = narrationCallsOf(table).at(-1);
    expect(call, 'the narration ran').toBeTruthy();
    expect(call).toMatchObject({ client: 'pl-1', apiKey: 'sk-ant-player' });
    expect(JSON.stringify(call.body)).not.toMatch(/SENTINEL|## UNREVEALED — FOR THE NARRATOR ONLY/);
  }, 40_000);

  it('control: the same narration on the GM\'s key is told the plan in play', async () => {
    await filePlans();
    const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateResolution(moveResolution({ playerNarration: 'I face the escort.' }),
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    expect(JSON.stringify(narrationCallsOf(table).at(-1).body)).toContain(TRUTH);
  }, 40_000);

  it('the Private Channel on a player\'s client is given the decided plans in play by the canonical GM — and only those', async () => {
    await filePlans();
    const { buildPrivateChannelStory } = await table.client('pl-1').import('../../src/narration/narrator.js');
    const sent = [];
    const socket = gmOf(table).run(() => game.socket);
    const emit = socket.emit.bind(socket);
    socket.emit = (channel, message) => { sent.push(message); return emit(channel, message); };
    let story;
    try {
      story = await table.client('pl-1').run(() => buildPrivateChannelStory(game.settings.get(MODULE_ID, 'campaignState'), 'What is the escort, really?'));
    } finally {
      socket.emit = emit;
    }
    expect(story.scene).toMatch(/## UNREVEALED — FOR THE NARRATOR ONLY/);
    expect(story.scene).toContain(TRUTH);
    expect(story.scene, 'a plan not in play is not sent').not.toContain(OTHER);
    // What the GM sent: the plans in play, without their oracle rolls.
    const answer = sent.find(m => m?.kind === 'plansInPlay.answer');
    expect(answer?.plans?.map(p => p.subject.name)).toEqual(['the escort']);
    expect(JSON.stringify(answer)).not.toMatch(/SENTINEL-ROLL|oracleSeeds/);
  }, 40_000);

  it('with no GM connected, the player\'s Private Channel turn is told no plan', async () => {
    await filePlans();
    await table.leave('gm-1');
    const { buildPrivateChannelStory } = await table.client('pl-1').import('../../src/narration/narrator.js');
    const story = await table.client('pl-1').run(() => buildPrivateChannelStory(game.settings.get(MODULE_ID, 'campaignState'), 'What is the escort, really?'));
    expect(story.scene).not.toMatch(/SENTINEL|UNREVEALED/);
  }, 40_000);

  it('control: the Private Channel on the GM\'s client reads the plans itself, as before', async () => {
    await filePlans();
    const { buildPrivateChannelStory } = await gmOf(table).import('../../src/narration/narrator.js');
    const story = await gmOf(table).run(() => buildPrivateChannelStory(game.settings.get(MODULE_ID, 'campaignState'), 'What is the escort, really?'));
    expect(story.scene).toContain(TRUTH);
  }, 40_000);
});

describe('issue #362 D1 — the table\'s view of the plans, kept by the canonical GM', () => {
  it('a plan decided in secret writes nothing a player\'s client could see; a truth revealed does', async () => {
    const writes = [];
    table.interceptWrites((w) => { if (w.kind === 'setting' && /narrativeSkeletonsTableView/.test(w.key)) writes.push(w.value ?? w); });
    const secrets = await secretsOn('gm-1');
    const plan = await gmOf(table).run(() => secrets.createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
      oracleSeeds: ['Character Role: Scout'] }, { byGm: true }));
    await gmOf(table).run(() => secrets.updateSkeleton(plan.id, r => ({ ...r, truth: TRUTH, wants: WANTS }), { byGm: true }));
    await table.settle();
    expect(writes, 'nothing for a secret decision').toEqual([]);
    expect(await panelHtml('pl-1')).not.toContain('SENTINEL');

    await gmOf(table).run(() => secrets.revealSkeletonNow(plan.id));
    await table.settle();
    expect(writes).toHaveLength(1);
    expect(await panelHtml('pl-1')).toContain(`<span class="thread-name">the escort</span> wants: ${WANTS}`);
  }, 40_000);

  it('a plan page a GM deletes in the journal leaves the view (the canonical GM\'s page hook)', async () => {
    const secrets = await secretsOn('gm-1');
    const plan = await gmOf(table).run(() => secrets.createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
      truth: TRUTH, wants: WANTS, truthRevealed: true }, { byGm: true }));
    await table.settle();
    expect(await panelHtml('pl-1')).toContain('the escort');

    const journal = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets'));
    const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === plan.id);
    await page.delete();
    table.fireDocumentHook('gm-1', 'deleteJournalEntryPage', page);
    await table.settle();
    expect(await panelHtml('pl-1')).not.toContain('the escort');
  }, 40_000);
});
