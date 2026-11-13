/**
 * STARFORGED COMPANION
 * tests/helpers/skeletonTable.js — a simulated table for the narrative
 * skeleton's tests (issue #353)
 *
 * A GM with a Claude key and Pat playing Kira, in scene sc-1 of session s-1,
 * with journals that keep their pages (the setup stub keeps none) and a
 * scripted narrator whose reply each test builds from the request it answers
 * (`table.replies = (call) => ({ prose, sidecar })`).
 */

import { vi } from 'vitest';
import { scriptClaude } from './faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

export const MODULE_ID = 'starforged-companion';
export const NARRATION_MODEL = 'claude-sonnet-5-5';

let nextId = 0;

/** A JournalEntry that keeps its ownership and pages and lives in game.journal. */
export function makeJournal(data) {
  const journal = {
    id: `jrnl${String(++nextId).padStart(12, '0')}`, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    ownership: JSON.parse(JSON.stringify(data.ownership ?? { default: 0 })),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
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
 * Reset the table for a test: the world (settings over the defaults), the
 * GM's key, Kira, the journal stub and the scripted narrator. Returns a
 * restore function for afterEach.
 *
 * @param {Object} table — simulateTable's
 * @param {Object} [settings] — world settings
 * @param {Object} [state] — campaignState fields over the scene defaults
 * @returns {Promise<() => void>}
 */
export async function resetSkeletonTable(table, settings = {}, state = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [], clocks: [],
      sceneFrame: { location: 'the corridor', present: ['Kira', 'the escort'], situation: 'The escort blocks the way' },
      ...state },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  const saved = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  table.replies = () => ({ prose: 'The escort waits.', sidecar: { newTruths: [], stateChanges: [] } });
  // `table.script.when(match, reply)` answers other calls (a Haiku helper's).
  table.script = scriptClaude(table, {
    fallback: (call) => {
      if (call.model !== NARRATION_MODEL) return '{}';
      const { prose, sidecar } = table.replies(call);
      return `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
    },
  });
  return () => { globalThis.JournalEntry = saved; };
}

/** The GM's client. */
export const gmOf = (table) => table.client('gm-1');

/** Every plan record in the Secrets journal, as stored. */
export function plansOf(table) {
  const journal = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets')) ?? null;
  return (journal?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.secretEntry).filter(Boolean);
}

/** The narrator calls made so far. */
export const narrationCallsOf = (table) => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

/** Run `work` on the GM and let the narration's capture (2 s after its card) run. */
export async function onGm(table, work) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    const result = gmOf(table).run(work);
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
}

/** A move resolution for narrateResolution, as the pipeline hands one in. */
export const moveResolution = (over = {}) => ({
  _id: `res-${Math.random().toString(36).slice(2, 8)}`, moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'miss', outcomeLabel: 'Miss', playerNarration: 'I slip past the escort.',
  loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]', oracleSeeds: null, ...over,
});

/** Narrate a move on the GM, as the pipeline does, from the stored campaignState. */
export async function narrateMoveOn(table, resolution) {
  const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
  return onGm(table, () => narrateResolution(resolution,
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
}

/** Play the X-Card from Pat's client and let it land. */
export async function playXCard(table) {
  await table.client('pl-1').chat('!x');
  await table.settle();
  await table.drain();
}

/** Pat speaks (a whisper — no narration of its own): an X-Card's beat begins after it. */
export async function patSpeaks(table, content = 'We wait.') {
  await table.client('pl-1').run(() => ChatMessage.create({ content, whisper: ['gm-1'] }));
  await table.settle();
}
