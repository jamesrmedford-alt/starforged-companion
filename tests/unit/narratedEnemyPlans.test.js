/**
 * STARFORGED COMPANION
 * tests/unit/narratedEnemyPlans.test.js
 *
 * Issue #354 section H (after the narrative skeleton, issue #353):
 *
 * P2-29  A hidden plan for a new enemy was asked for only when a rolled price
 *        was the table row "A new enemy is revealed". Since a miss usually
 *        pays the outcome stated before the roll, that row is rare — and an
 *        enemy that entered any other way had no plan until entity detection
 *        recorded it as a significant threat. The narrator may now say so
 *        itself: its sidecar's `newThreats` names an enemy or danger the prose
 *        introduced; the module rolls Character Role, Goal and Disposition for
 *        it once and files it undecided, and the next narration decides it.
 *
 * P2-30  (the narrator's half) One enemy named ways that share no word — "the
 *        escort", "the second presence" — cannot be matched in code. A
 *        narration with an enemy to decide is shown the beings already planned
 *        (ALREADY PLANNED) and may answer `sameAs`: the plan is not decided a
 *        second time, the one the subject has keeps the other name, and later
 *        names are matched against both.
 *
 * On a simulated table (a GM with a Claude key; Pat plays Kira).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import {
  normalisePlans, normaliseNewThreats, normaliseSkeleton, plannedBeings, withAlias, selectRelevantSkeletons,
  NEW_THREATS_PER_SIDECAR, ALIASES_MAX,
} from '../../src/world/skeletons.js';
import { normaliseSidecar } from '../../src/factContinuity/sidecarParser.js';
import { formatUnrevealedBlock, appendSidecarInstruction } from '../../src/narration/narratorPrompt.js';
import { planIsAbout } from '../../src/world/secrets.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const ESCORT_TRUTH = 'SENTINEL-TRUTH: the escort is a Keeper drone collecting names for the Pale Choir';

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
      sceneFrame: { location: 'the corridor', present: ['Kira'], situation: 'Something is out there' } },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira Vale', ownership: { 'pl-1': 3 } });
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  replies = () => ({ prose: 'The corridor is quiet.', sidecar: { newTruths: [], stateChanges: [] } });
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
const activePlans = () => plans().filter(p => p.status === 'active');
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
  outcome: 'weak_hit', outcomeLabel: 'Weak Hit', playerNarration: 'I ease the ship into the corridor.',
  loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Weak Hit]', oracleSeeds: null, ...over,
});

const bare = { newTruths: [], stateChanges: [] };
const introduces = (...names) => () => ({ prose: 'Something answers from the far side.',
  sidecar: { ...bare, newThreats: names.map(name => ({ name })) } });

// ─────────────────────────────────────────────────────────────────────────────

describe('issue #354 P2-29 — an enemy the narration introduces gets a hidden plan', () => {
  it('the narrator is told how to say so, with the other plan keys', () => {
    const on = appendSidecarInstruction({ skeletonsEnabled: true });
    expect(on).toMatch(/"newThreats": \[\{ "name":/);
    expect(on).toMatch(/Not for a hazard\s+this beat ends, a player character, or anything already under\s+UNREVEALED/);
    expect(appendSidecarInstruction({ skeletonsEnabled: false })).not.toMatch(/newThreats/);
  });

  it('its rolls are made once and it is filed undecided, stamped with the narration; the next narration decides it', async () => {
    replies = introduces('the second presence');
    await narrateMove(move());

    let [plan] = plans();
    expect(plan).toMatchObject({ kind: 'threat', status: 'active', truth: '', sceneId: 'sc-1',
      subject: { type: 'name', id: null, name: 'the second presence' },
      createdFrom: { trigger: 'narrated_enemy', moveId: 'face_danger' } });
    expect(plan.oracleSeeds).toEqual([
      expect.stringMatching(/^Character Role: \S/), expect.stringMatching(/^Character Goal: \S/),
      expect.stringMatching(/^Character Disposition: \S/),
    ]);
    const card = table.cards(f => f.narratorCard === true && f.narrationId).at(-1);
    expect(plan.narrationId).toBe(card.flags[MODULE_ID].narrationId);

    // The next beat is asked to decide it, from those rolls — and does.
    replies = (call) => {
      const id = new RegExp(`- id (${plan.id}): Threat — the second presence\\.`).exec(call.system ?? '')?.[1];
      return { prose: 'The second presence drifts closer.', sidecar: { ...bare,
        ...(id ? { plans: [{ id, truth: ESCORT_TRUTH, wants: 'A name the crew carries.', escalation: ['It asks again'], clues: ['A pulse'] }] } : {}) } };
    };
    await narrateMove(move());
    expect(lastCall().system).toMatch(/### DECIDE NOW/);
    expect(lastCall().system).toContain(`- id ${plan.id}: Threat — the second presence. Oracle: Character Role: `);
    [plan] = plans();
    expect(plan.truth).toBe(ESCORT_TRUTH);
    expect(plans()).toHaveLength(1);
  }, 60_000);

  it('named again by a later narration — in the same words or a longer telling — it is not planned twice', async () => {
    replies = introduces('the second presence');
    await narrateMove(move());
    replies = introduces('The Second Presence', 'the second presence: closing fast');
    await narrateMove(move());
    expect(plans()).toHaveLength(1);
  }, 60_000);

  it('a player character named as a threat is never planned; two enemies in one beat are two plans, a third is not taken', async () => {
    replies = introduces('Kira');
    await narrateMove(move());
    expect(plans()).toEqual([]);

    replies = introduces('the raider wing', 'the debt collector', 'a third thing');
    await narrateMove(move());
    expect(plans().map(p => p.subject.name).sort()).toEqual(['the debt collector', 'the raider wing']);
  }, 60_000);

  it('the X-Card on the narration that introduced it takes the plan back', async () => {
    replies = introduces('the second presence');
    await narrateMove(move());
    expect(plans()).toHaveLength(1);
    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();
    expect(plans()).toEqual([]);
  }, 40_000);

  it('with the narrative skeleton off, nothing is planned', async () => {
    await resetTable({ narrativeSkeletons: false });
    replies = introduces('the second presence');
    await narrateMove(move());
    expect(plans()).toEqual([]);
  }, 40_000);
});

describe('issue #354 P2-30 — the narrator says a "new" enemy is one already planned', () => {
  /** The escort, planned and decided through a price's "A new enemy is revealed". */
  async function planTheEscort() {
    replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort, waiting.', sidecar: { ...bare,
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: ESCORT_TRUTH, wants: 'A name.' }] } : {}) } };
    };
    await narrateMove(move({ outcome: 'miss', outcomeLabel: 'Miss',
      oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    const [escort] = plans();
    expect(escort).toMatchObject({ kind: 'threat', truth: ESCORT_TRUTH, subject: { name: 'the escort' } });
    return escort;
  }

  it('a waiting plan answered sameAs joins the planned one, which keeps its name as another of its own; the waiting plan is retired', async () => {
    const escort = await planTheEscort();

    // Two names with no word in common: code cannot know they are one enemy.
    replies = introduces('the second presence');
    await narrateMove(move());
    const waiting = plans().find(p => p.subject.name === 'the second presence');
    expect(waiting, 'filed apart — nothing in the names says they are one').toBeTruthy();

    // The next narration is shown who is planned already, and says so.
    replies = (call) => {
      const shown = (call.system ?? '').includes('### ALREADY PLANNED') && (call.system ?? '').includes(`- id ${escort.id}: Threat — the escort`);
      return { prose: 'The second presence is the escort, come round the far side.', sidecar: { ...bare,
        ...(shown ? { plans: [{ id: waiting.id, sameAs: escort.id, subject: 'the second presence', knows: 'Which ship fled the Choir.' }] } : {}) } };
    };
    await narrateMove(move());
    expect(lastCall().system).toMatch(/### ALREADY PLANNED\nIf an enemy or a person above is in truth one of these under another name/);

    const after = plans();
    expect(after.find(p => p.id === waiting.id)).toMatchObject({ status: 'retired', truth: '' });
    const joined = after.find(p => p.id === escort.id);
    expect(joined).toMatchObject({ status: 'active', truth: ESCORT_TRUTH, wants: 'A name.', knows: 'Which ship fled the Choir.',
      subject: { name: 'the escort' }, aliases: ['the second presence'] });
    expect(activePlans()).toHaveLength(1);

    // From here the other name is the escort's: it is not planned again, and
    // a beat that names it is shown the escort's plan.
    expect(planIsAbout(joined, 'the second presence')).toBe(true);
    replies = introduces('the second presence');
    await narrateMove(move({ playerNarration: 'I hail the second presence.' }));
    expect(activePlans()).toHaveLength(1);
    expect(lastCall().system).toContain(`Threat — the escort (also called: the second presence) (id ${escort.id})`);
  }, 90_000);

  it('a price\'s new enemy answered sameAs files no second plan', async () => {
    const escort = await planTheEscort();
    replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'The hull itself seems to lean in.', sidecar: { ...bare,
        ...(ref ? { plans: [{ id: ref, sameAs: escort.id, subject: 'the hull' }] } : {}) } };
    };
    await narrateMove(move({ outcome: 'miss', outcomeLabel: 'Miss',
      oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(lastCall().system).toContain(`- id ${escort.id}: Threat — the escort`);
    expect(plans()).toHaveLength(1);
    expect(plans()[0]).toMatchObject({ id: escort.id, truth: ESCORT_TRUTH, aliases: ['the hull'] });
  }, 60_000);

  it('the X-Card on the narration that joined them puts both plans back', async () => {
    const escort = await planTheEscort();
    replies = introduces('the second presence');
    await narrateMove(move());
    const waiting = plans().find(p => p.subject.name === 'the second presence');

    await table.client('pl-1').run(() => ChatMessage.create({ content: 'We hold position.', whisper: ['gm-1'] }));
    await table.settle();
    replies = () => ({ prose: 'It is the escort.', sidecar: { ...bare, plans: [{ id: waiting.id, sameAs: escort.id }] } });
    await narrateMove(move());
    expect(plans().find(p => p.id === waiting.id).status).toBe('retired');

    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();
    expect(plans().find(p => p.id === waiting.id)).toMatchObject({ status: 'active' });
    expect(plans().find(p => p.id === escort.id).aliases ?? []).toEqual([]);
  }, 90_000);

  it('sameAs is not taken for a plan already decided, for an id that names no plan, or for a plan that is not a being\'s', async () => {
    const escort = await planTheEscort();
    replies = introduces('the debt collector');
    await narrateMove(move());
    const collector = plans().find(p => p.subject.name === 'the debt collector');
    // Decide it, then try to fold the decided plan into the escort's.
    replies = () => ({ prose: 'The collector names a sum.', sidecar: { ...bare, plans: [{ id: collector.id, truth: 'A broker for the Vale Combine.' }] } });
    await narrateMove(move());
    replies = () => ({ prose: 'Nothing changes.', sidecar: { ...bare, plans: [{ id: collector.id, sameAs: escort.id }, { id: escort.id, sameAs: 'sk-nobody' }] } });
    await narrateMove(move());
    expect(activePlans().map(p => p.subject.name).sort()).toEqual(['the debt collector', 'the escort']);
    expect(plans().find(p => p.id === escort.id).aliases ?? []).toEqual([]);
  }, 90_000);
});

describe('issue #354 P2-29 / P2-30 — the shapes, bounded', () => {
  it('newThreats: names or { name }, each once, at most the cap; anything else is none', () => {
    expect(normaliseNewThreats([{ name: ' the escort ' }, 'The Escort', { name: '' }, null, 7])).toEqual([{ name: 'the escort' }]);
    expect(normaliseNewThreats(['a', 'b', 'c', 'd']).length).toBe(NEW_THREATS_PER_SIDECAR);
    expect(normaliseNewThreats({ name: 'x' })).toEqual([]);
    expect(normaliseSidecar({ newThreats: ['the escort'] }).newThreats).toEqual([{ name: 'the escort' }]);
    expect(normaliseSidecar({}).newThreats).toEqual([]);
  });

  it('a plan entry that only says sameAs is kept; one that points at itself, or at nothing, is not', () => {
    expect(normalisePlans([{ id: 'sk-1', sameAs: 'sk-2' }])).toEqual([expect.objectContaining({ id: 'sk-1', sameAs: 'sk-2', truth: '' })]);
    expect(normalisePlans([{ id: 'sk-1', sameAs: 'sk-1' }, { id: 'sk-3', sameAs: 'not an id!' }, { id: 'sk-4' }])).toEqual([]);
  });

  it('a plan\'s other names: each once, never its own, capped — and they make it relevant to a beat that uses one', () => {
    const base = normaliseSkeleton({ id: 'sk-1', kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: 'x' });
    expect(base.aliases).toEqual([]);
    let r = withAlias(withAlias(withAlias(base, 'the second presence'), 'The Escort'), 'the second presence');
    expect(r.aliases).toEqual(['the second presence']);
    expect(withAlias(r, '')).toBe(r);
    for (let i = 0; i < 10; i += 1) r = withAlias(r, `name ${i}`);
    expect(r.aliases).toHaveLength(ALIASES_MAX);

    const aliased = withAlias(base, 'the second presence');
    expect(selectRelevantSkeletons([aliased], { text: 'I hail the second presence.' })).toHaveLength(1);
    expect(selectRelevantSkeletons([base], { text: 'I hail the second presence.' })).toHaveLength(0);
  });

  it('ALREADY PLANNED is shown only when an enemy or an agenda is being decided, and never lists the plan being decided', () => {
    const escort = normaliseSkeleton({ id: 'sk-escort', kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: 'A drone.' });
    const waiting = normaliseSkeleton({ id: 'sk-wait', kind: 'threat', subject: { type: 'name', name: 'the second presence' }, oracleSeeds: ['Character Role: Scout'] });
    const mystery = normaliseSkeleton({ id: 'sk-q', kind: 'mystery', subject: { type: 'scene', id: 'sc-1', name: 'the scene' }, question: 'Who sent it?' });
    const planned = plannedBeings([escort, waiting, mystery]);
    expect(planned.map(p => p.id)).toEqual(['sk-escort', 'sk-wait']);

    const deciding = formatUnrevealedBlock([escort, waiting], { plannedSubjects: planned });
    expect(deciding).toMatch(/### ALREADY PLANNED/);
    expect(deciding).toContain('- id sk-escort: Threat — the escort');
    expect(deciding.split('### ALREADY PLANNED')[1]).not.toContain('sk-wait');

    // A question to decide is not a being: no list. Nothing to decide: no list.
    expect(formatUnrevealedBlock([escort, mystery], { plannedSubjects: planned })).not.toMatch(/ALREADY PLANNED/);
    expect(formatUnrevealedBlock([escort], { plannedSubjects: planned })).not.toMatch(/ALREADY PLANNED/);
    // The Private Channel (no sidecar) is never asked to write.
    expect(formatUnrevealedBlock([escort, waiting], { plannedSubjects: planned, sidecar: false })).not.toMatch(/ALREADY PLANNED|DECIDE NOW/);
  });
});
