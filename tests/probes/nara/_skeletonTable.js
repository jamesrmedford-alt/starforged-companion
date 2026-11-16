/**
 * tests/probes/nara/_skeletonTable.js — shared harness for the NARA probes.
 *
 * A simulated table (a GM with a Claude key; Pat plays Kira) with a journal
 * stub that keeps pages and their flags, as tests/unit/narrativeSkeletonFlow
 * .test.js builds it. Not a probe: holds no test.
 */

import { vi } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

export const MODULE_ID = 'starforged-companion';
export const NARRATION_MODEL = 'claude-sonnet-5-5';

let nextId = 0;

/** Awaited before a page of the Secrets journal is created, when a probe sets one (a slow server round trip). */
export const pageCreate = { gate: null };

/** A JournalEntry that keeps its ownership and pages and lives in game.journal. */
function makeJournal(data) {
  const journal = {
    id: `jrnl${String(++nextId).padStart(12, '0')}`, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    ownership: JSON.parse(JSON.stringify(data.ownership ?? { default: 0 })),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      if (pageCreate.gate && data.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets') await pageCreate.gate;
      return list.map((d) => {
        const page = {
          id: `page${String(++nextId).padStart(12, '0')}`, parent: journal,
          name: d.name, type: d.type ?? 'text', text: d.text ?? {},
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = JSON.parse(JSON.stringify(value)); return this; },
          async update(changes) { if (changes.text) this.text = changes.text; if (changes.name) this.name = changes.name; return this; },
          async delete() { journal.pages.contents = journal.pages.contents.filter(p => p !== page); return page; },
        };
        journal.pages.contents.push(page);
        return page;
      });
    },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
    async update(changes) { Object.assign(this, changes); return this; },
  };
  return journal;
}

/**
 * Build the table and its helpers. Call `h.reset()` in beforeEach,
 * `h.restore()` in afterEach, `h.teardown()` in afterAll.
 */
export async function skeletonTable() {
  const table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  let savedJournalEntry;
  const h = {
    table,
    /** Per-test reply builder: (call) => raw reply text. */
    reply: null,
    async reset(settings = {}, state = {}) {
      await table.reset({ world: { settings: {
        chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
        campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1,
          currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [], clocks: [],
          sceneFrame: { location: 'the corridor', present: ['Kira'], situation: 'Kira waits at the lock' },
          ...state },
      } } });
      await table.setClaudeKey('gm-1', 'sk-ant-test');
      table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
      savedJournalEntry = globalThis.JournalEntry;
      globalThis.JournalEntry = {
        async create(data) {
          const j = makeJournal(data);
          globalThis.game.journal._set(j.id, j);
          return j;
        },
      };
      h.reply = () => 'The corridor hums.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
      scriptClaude(table, {
        fallback: (call) => (call.model !== NARRATION_MODEL ? '{}' : h.reply(call)),
      });
    },
    restore() { pageCreate.gate = null; globalThis.JournalEntry = savedJournalEntry; },
    teardown() { table?.teardown(); },
    gm: () => table.client('gm-1'),
    secretsJournal: () => table.client('gm-1').run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets')) ?? null,
    plans: () => (h.secretsJournal()?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.secretEntry).filter(Boolean),
    narrationCalls: () => table.claude.calls.filter(c => c.model === NARRATION_MODEL),
    /** Run `work` on the GM and let the narration's capture (2 s after its card) run. */
    async onGm(work) {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const result = table.client('gm-1').run(work);
        for (let i = 0; i < 3; i += 1) {
          await table.settle();
          await vi.advanceTimersByTimeAsync(2_100);
        }
        await table.settle();
        return await result;
      } finally {
        vi.useRealTimers();
        await table.drain();
      }
    },
    async narrateMove(resolution) {
      const { narrateResolution } = await table.client('gm-1').import('../../src/narration/narrator.js');
      return h.onGm(() => narrateResolution(resolution, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
        { speakerActorId: 'pc-kira' }));
    },
  };
  return h;
}

/** A fenced sidecar reply. */
export const withSidecar = (prose, sidecar) => `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;

export const move = (over = {}) => ({
  _id: `res-${Math.random().toString(36).slice(2, 8)}`, moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'miss', outcomeLabel: 'Miss', playerNarration: 'I slip past the escort.',
  loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]', oracleSeeds: null, ...over,
});
