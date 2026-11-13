/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonFlow.test.js
 *
 * Issue #353 Phase 1 — the narrative skeleton end to end, on a simulated
 * table (a GM with a Claude key; Pat plays Kira):
 *
 *  - A move's price reveals a new enemy. Its seeds (the real
 *    withPayThePriceSeed) ask the narration to decide what the enemy is
 *    (UNREVEALED → DECIDE NOW, by ref); the narrator's sidecar `plans` answers
 *    and the plan is filed in the GM-only Secrets journal, stamped with the
 *    narration's id. The next beat is shown it as a truth not to state, and no
 *    chat card carries it. The X-Card on the narration that made it takes it
 *    back.
 *  - A narration poses a question (`openQuestions`): its hidden answer is
 *    rolled (Action + Theme, Descriptor + Focus) and filed undecided; the next
 *    narration is asked to decide it from those rolls, and does; an X-Card on
 *    that narration puts it back undecided.
 *  - The Private Channel's story reads the plans, with no instruction to write.
 *  - With the setting off nothing is planned or shown.
 *
 * The alpha 23 playtest: "A new enemy is revealed" became a voice with no
 * nature or goal, and the escort asked an unanswerable question three times —
 * the narrator had no answer in mind.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const ENEMY_TRUTH = 'SENTINEL-TRUTH: the escort is a Keeper drone collecting names for the Pale Choir';
const ANSWER = 'SENTINEL-ANSWER: the name of the ship that fled the Choir thirty years ago';

let table;
let replies;   // per-test reply builder: (call) => { prose, sidecar }
let savedJournalEntry;
let nextId = 0;

/** A JournalEntry that keeps its ownership and pages and lives in game.journal (the setup stub keeps neither). */
function makeJournal(data) {
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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

async function resetTable(settings = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [], clocks: [],
      sceneFrame: { location: 'the corridor', present: ['Kira', 'the escort'], situation: 'The escort blocks the way' } },
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
  replies = () => ({ prose: 'The escort waits.', sidecar: { newTruths: [], stateChanges: [] } });
  scriptClaude(table, {
    fallback: (call) => {
      if (call.model !== NARRATION_MODEL) return '{}';
      const { prose, sidecar } = replies(call);
      return `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
    },
  });
}

beforeEach(async () => { await resetTable(); });

const gm = () => table.client('gm-1');
const secretsJournal = () => gm().run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets')) ?? null;
const plans = () => (secretsJournal()?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.secretEntry).filter(Boolean);
const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const lastCall = () => narrationCalls().at(-1);

/** Run `work` on the GM and let the narration's capture (2 s after its card) run. */
async function onGm(work) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    const result = gm().run(work);
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

async function narrateMove(resolution) {
  const { narrateResolution } = await gm().import('../../src/narration/narrator.js');
  return onGm(() => narrateResolution(resolution, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    { speakerActorId: 'pc-kira' }));
}

const move = (over = {}) => ({
  _id: `res-${Math.random().toString(36).slice(2, 8)}`, moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'miss', outcomeLabel: 'Miss', playerNarration: 'I slip past the escort.',
  loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]', oracleSeeds: null, ...over,
});

describe('issue #353 Phase 1 — a price that reveals a new enemy is planned', () => {
  it('the narration decides it, it is filed GM-only and stamped, the next beat holds it, and no card shows it', async () => {
    replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'A second shape detaches from the dark: an escort, waiting.', sidecar: {
        newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: ENEMY_TRUTH, wants: 'A name the crew carries.',
          escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'],
          resolutions: ['Give it a false name'] }] } : {}),
      } };
    };
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));

    const asked = narrationCalls()[0];
    expect(asked.system).toMatch(/### DECIDE NOW/);
    expect(asked.system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals\. Oracle: Character Role: /);

    const journal = secretsJournal();
    expect(journal, 'the Secrets journal').toBeTruthy();
    expect(journal.ownership?.default ?? 0, 'no player permission').toBe(0);
    const [plan] = plans();
    expect(plan).toMatchObject({ kind: 'threat', status: 'active', truth: ENEMY_TRUTH, sceneId: 'sc-1',
      subject: { type: 'name', name: 'the escort' } });
    expect(plan.oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
    const card = table.cards(f => f.narratorCard === true && f.narrationId).at(-1);
    expect(plan.narrationId).toBe(card.flags[MODULE_ID].narrationId);

    // The next beat is shown it — a decided plan, not a decision.
    replies = () => ({ prose: 'The escort tilts its head.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMove(move({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).toMatch(/## UNREVEALED — FOR THE NARRATOR ONLY/);
    expect(lastCall().system).toContain(`Truth: ${ENEMY_TRUTH}`);
    expect(lastCall().system).not.toMatch(/DECIDE NOW/);

    // Hidden: no chat card, content or flags, carries it.
    for (const m of table.world.messages()) {
      expect(`${m.content} ${JSON.stringify(m.flags ?? {})}`).not.toContain('SENTINEL-TRUTH');
    }
  }, 40_000);

  it('a narration that decides nothing still files the plan with its rolls, for the next one to decide', async () => {
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    const [plan] = plans();
    expect(plan).toMatchObject({ kind: 'threat', truth: '', subject: { name: 'the new enemy this price reveals' } });
    await narrateMove(move({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).toContain(`- id ${plan.id}: Threat — the new enemy this price reveals. Oracle: Character Role: `);
  }, 40_000);

  it('the X-Card on the narration that made it takes the plan back', async () => {
    replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort, waiting.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: ENEMY_TRUTH }] } : {}) } };
    };
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(plans()).toHaveLength(1);

    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();
    expect(plans()).toEqual([]);
  }, 40_000);
});

describe('issue #353 Phase 1 — a question the narration poses gets a hidden answer', () => {
  it('rolled and filed undecided; the next narration decides it from the rolls; the X-Card on that one undoes the decision', async () => {
    replies = () => ({ prose: '"Which name are we here to meet?" the escort asks.', sidecar: { newTruths: [], stateChanges: [],
      openQuestions: [{ question: 'Which name are we here to meet?', about: 'the escort' }] } });
    await narrateMove(move({ moveId: 'compel', moveName: 'Compel', outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));

    let [mystery] = plans();
    expect(mystery).toMatchObject({ kind: 'mystery', question: 'Which name are we here to meet?', truth: '',
      subject: { type: 'scene', id: 'sc-1', name: 'the escort' } });
    expect(mystery.oracleSeeds).toEqual([expect.stringMatching(/^Action \+ Theme: \S.* \/ \S/), expect.stringMatching(/^Descriptor \+ Focus: \S.* \/ \S/)]);

    // The same question posed again is not a second mystery.
    await narrateMove(move({ moveId: 'compel', moveName: 'Compel', outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(plans()).toHaveLength(1);

    // Pat speaks (a whisper — no narration of its own): the X-Card's beat begins after it.
    await table.client('pl-1').run(() => ChatMessage.create({ content: 'We say nothing yet.', whisper: ['gm-1'] }));
    await table.settle();

    replies = (call) => {
      const id = new RegExp(`- id (${mystery.id}): the hidden answer to`).exec(call.system ?? '')?.[1];
      return { prose: 'The escort waits for an answer.', sidecar: { newTruths: [], stateChanges: [],
        ...(id ? { plans: [{ id, truth: ANSWER, clues: ['An old registry code'] }] } : {}) } };
    };
    await narrateMove(move({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).toContain(`- id ${mystery.id}: the hidden answer to "Which name are we here to meet?" (about the escort). Oracle: Action + Theme: `);
    [mystery] = plans();
    expect(mystery.truth).toBe(ANSWER);
    expect(mystery.previous?.[0]?.truth).toBe('');   // the version before, for the X-Card

    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();
    [mystery] = plans();
    expect(mystery?.truth).toBe('');
  }, 60_000);
});

describe('issue #353 Phase 1 — the Private Channel reads the plans', () => {
  it('its story holds a decided plan in play, and no instruction to write', async () => {
    replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort, waiting.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: ENEMY_TRUTH }] } : {}) } };
    };
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    const { buildPrivateChannelStory } = await gm().import('../../src/narration/narrator.js');
    const story = await gm().run(() => buildPrivateChannelStory(game.settings.get(MODULE_ID, 'campaignState'), 'What is the escort, really?'));
    expect(story.scene).toMatch(/## UNREVEALED — FOR THE NARRATOR ONLY/);
    expect(story.scene).toContain(ENEMY_TRUTH);
    expect(story.scene).not.toMatch(/DECIDE NOW|sidecar/);
  }, 40_000);
});

describe('issue #353 Phase 1 — hidden oracle rolls', () => {
  it('stay off every card by default; with "Show hidden oracle rolls" on, a new plan\'s rolls are posted — and the X-Card still takes the plan back', async () => {
    await resetTable({ narrativeSkeletonsShowRolls: true });
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    const [plan] = plans();
    expect(plan.rollsShown).toBe(true);
    const rollsCard = table.cards(f => f.secretRollsCard === true).at(-1);
    expect(rollsCard?.content).toMatch(/Character Role: /);
    expect(plan.narrationId, 'still the narration\'s plan').toBeTruthy();

    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();
    expect(plans()).toEqual([]);
  }, 40_000);

  it('control: with the setting off, no card carries the rolls', async () => {
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(plans()[0].rollsShown).toBe(false);
    expect(table.cards(f => f.secretRollsCard === true)).toEqual([]);
    for (const m of table.world.messages()) expect(`${m.content}`).not.toMatch(/Character Role: /);
  }, 40_000);
});

describe('issue #353 Phase 1 — with Narrative skeletons off', () => {
  it('nothing is asked, planned or shown', async () => {
    await resetTable({ narrativeSkeletons: false });
    replies = () => ({ prose: '"Which name?" the escort asks.', sidecar: { newTruths: [], stateChanges: [],
      openQuestions: [{ question: 'Which name?', about: 'the escort' }] } });
    await narrateMove(move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(lastCall().system).not.toMatch(/UNREVEALED|DECIDE NOW|openQuestions/);
    expect(plans()).toEqual([]);
  }, 40_000);
});
