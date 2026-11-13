/**
 * STARFORGED COMPANION
 * tests/unit/sessionPanelOpenThreads.test.js
 *
 * Issue #353 R4 — show the player what is open. The recap covers what
 * happened; what is still open was spread over the sheet, the Progress
 * Tracks and Clocks panels and the World Journal, and standing demands and
 * unanswered questions were listed nowhere. The Session panel (decided by the
 * maintainer) now lists them: open vows and their progress, open tracks,
 * running clocks, and — from the narrative skeleton — the standing demands
 * and unanswered questions the table has been shown, never their secrets:
 *   - an unanswered question is an active mystery whose truth is not
 *     revealed: its question only;
 *   - a standing demand is an active threat or NPC agenda whose truth is
 *     revealed: its subject and what it wants.
 * Built from the stores that already exist; no model call.
 *
 * The plans are written by the real store (secrets.js createSkeleton, the
 * narration's reveal applyPlanSideData, the GM's Reveal now) and the panel is
 * rendered on Pat's client — a player's list reads the same journal the
 * GM's does, so a sentinel planted in every hidden field must reach no
 * client's panel.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { resetSkeletonTable, gmOf, MODULE_ID } from '../helpers/skeletonTable.js';

let table;
let restore;
let savedDocument;

/** The hidden fields of a plan, each a sentinel no panel may show. */
const hidden = (tag) => ({
  truth:       `SENTINEL-${tag}-TRUTH`,
  knows:       `SENTINEL-${tag}-KNOWS`,
  escalation:  [{ text: `SENTINEL-${tag}-STEP` }],
  clues:       [{ text: `SENTINEL-${tag}-CLUE` }],
  resolutions: [`SENTINEL-${tag}-ENDING`],
  oracleSeeds: [`Action + Theme: SENTINEL-${tag}-ROLL`],
});

const vowItem = (id, name, { rank = 'dangerous', ticks = 0, flags = {} } = {}) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank, current: ticks, completed: false }, flags,
});

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  return {
    id: 'pt-journal', name: 'Starforged Progress Tracks', ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) { flags[mod] ??= {}; flags[mod][key] = structuredClone(value); },
  };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  restore = await resetSkeletonTable(table, {}, {
    clocks: [
      { _id: 'c-count', name: "Archer's count", type: 'tension', segments: 6, filled: 2, active: true },
      { _id: 'c-standoff', name: 'The standoff', type: 'tension', segments: 4, filled: 1, active: true },
      { _id: 'c-done', name: 'The reactor', type: 'tension', segments: 4, filled: 4, active: true },
    ],
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    vowItem('bg-kira', 'Avenge the Iron Hollow', { rank: 'epic' }),
    vowItem('v-beacon', 'Find the lost beacon', { rank: 'formidable', ticks: 12, flags: { [MODULE_ID]: { vowId: 'v-beacon' } } }),
  ] } });
  const journal = makeTracksJournal([
    { id: 't-shroud', type: 'expedition', label: 'Into the Shroud', rank: 'dangerous', ticks: 8, completed: false,
      linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon', createdAt: 1 },
    { id: 't-standoff', type: 'scene_challenge', label: 'The standoff', rank: 'formidable', ticks: 4, completed: false,
      tensionClockId: 'c-standoff', createdAt: 2 },
  ]);
  table.journal.set(journal.id, journal);
});

afterEach(() => {
  restore?.();
  globalThis.document = savedDocument;
});

/** File the plans as narration and the GM's panel do, with their hidden fields. */
async function filePlans() {
  const gm = gmOf(table);
  const secrets = await gm.import('../../src/world/secrets.js');
  const make = (record) => gm.run(() => secrets.createSkeleton(record, { byGm: true }));
  const question = await make({
    kind: 'mystery', subject: { type: 'scene', id: 'sc-1', name: 'SENTINEL-MYSTERY-SUBJECT' },
    question: 'Which name are we here to meet?', wants: 'SENTINEL-MYSTERY-WANTS', ...hidden('MYSTERY'), sceneId: 'sc-1',
  });
  const hiddenThreat = await make({
    kind: 'threat', subject: { type: 'name', id: null, name: 'SENTINEL-HIDDEN-SUBJECT' },
    wants: 'SENTINEL-HIDDEN-WANTS', ...hidden('HIDDEN'),
  });
  const demand = await make({
    kind: 'threat', subject: { type: 'name', id: null, name: 'The escort' },
    wants: 'The codes to the inner lock, before the count ends', ...hidden('DEMAND'),
  });
  const agenda = await make({
    kind: 'npcAgenda', subject: { type: 'entity', id: 'npc-archer', name: 'Vuldar Archer' },
    wants: 'Passage off the station for her crew', ...hidden('AGENDA'),
  });
  const answered = await make({
    kind: 'mystery', subject: { type: 'scene', id: 'sc-1', name: 'the scene' },
    question: 'Who sent the escort?', ...hidden('ANSWERED'),
  });
  const retired = await make({
    kind: 'mystery', subject: { type: 'scene', id: 'sc-1', name: 'the scene' },
    question: 'SENTINEL-RETIRED-QUESTION', ...hidden('RETIRED'),
  });

  // The escort's truth comes out in a narration (its sidecar's reveals); the
  // GM reveals Archer's agenda and the answer to who sent the escort.
  const campaignState = table.world.campaignState();
  await gm.run(() => secrets.applyPlanSideData({ reveals: [{ id: demand.id, revealed: ['truth'] }] }, { campaignState, narrationId: 'n-reveal' }));
  await gm.run(() => secrets.revealSkeletonNow(agenda.id));
  await gm.run(() => secrets.revealSkeletonNow(answered.id));
  await gm.run(() => secrets.retireSkeleton(retired.id));
  await table.settle();
  return { question, hiddenThreat, demand, agenda, answered, retired };
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

describe("the Session panel's What's open (issue #353 R4)", () => {
  it('lists the open vows, the open tracks with the vow each serves, and the running clocks', async () => {
    const html = await panelHtml('pl-1');
    expect(html).toContain("<h3>What's open</h3>");
    expect(html).toMatch(/Find the lost beacon<\/span> <span class="muted">formidable · 3\/10 · Kira<\/span>/);
    expect(html).toMatch(/Avenge the Iron Hollow<\/span> <span class="muted">epic · 0\/10 · Kira<\/span>/);
    expect(html).toMatch(/Expedition: Into the Shroud<\/span> <span class="muted">dangerous · 2\/10 · serves “Find the lost beacon”<\/span>/);
    expect(html).toMatch(/Scene challenge: The standoff<\/span> <span class="muted">formidable · 1\/10 · danger 1\/4<\/span>/);
    expect(html).toContain("<span class=\"thread-name\">Archer's count</span> <span class=\"muted\">tension · 2/6</span>");
    // A full clock is not running; a scene challenge's own clock is on its row.
    expect(html).not.toContain('The reactor');
    expect(html.match(/The standoff/g)).toHaveLength(1);
    expect(html).not.toMatch(/No character has a vow in play/);
  });

  it('says when no character has a vow in play besides a background vow (issue #353 R3)', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
      vowItem('bg-kira', 'Avenge the Iron Hollow', { rank: 'epic' }),
    ] } });
    expect(await panelHtml('pl-1')).toMatch(/No character has a vow in play besides a background vow/);
  });

  it('lists the revealed standing demands and the unanswered questions — and no hidden field of any plan', async () => {
    await filePlans();
    for (const userId of ['pl-1', 'gm-1']) {
      const html = await panelHtml(userId);
      // Unanswered: the mystery whose truth is hidden — its question alone.
      expect(html, userId).toContain('<h4>Unanswered questions</h4>');
      expect(html, userId).toContain('Which name are we here to meet?');
      // Standing demands: the revealed threat and NPC agenda — subject and wants.
      expect(html, userId).toContain('<h4>Standing demands</h4>');
      expect(html, userId).toContain('<span class="thread-name">The escort</span> wants: The codes to the inner lock, before the count ends');
      expect(html, userId).toContain('<span class="thread-name">Vuldar Archer</span> wants: Passage off the station for her crew');
      // An answered question and a retired plan are not open.
      expect(html, userId).not.toContain('Who sent the escort?');
      expect(html, userId).not.toContain('SENTINEL-RETIRED');
      // No hidden field reaches the panel: a truth (revealed or not), what a
      // plan knows, its steps, clues, endings and rolls, an unrevealed
      // threat's very existence, a mystery's own subject and wants.
      expect(html, userId).not.toMatch(/SENTINEL/);
    }
  });

  it('with the narrative skeleton off, no plan is listed', async () => {
    await filePlans();
    table.world.setSetting('narrativeSkeletons', false);
    const html = await panelHtml('pl-1');
    expect(html).not.toContain('Standing demands');
    expect(html).not.toContain('Unanswered questions');
    expect(html).toContain('Find the lost beacon');
  });
});
