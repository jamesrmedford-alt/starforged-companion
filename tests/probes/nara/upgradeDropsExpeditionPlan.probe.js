/**
 * NARA-02 · UPGRADED-RESULT-DROPS-PLAN-REQUEST
 *
 * Scenario (default settings — free-flow holds a result that can be
 * upgraded): Kira's Undertake an Expedition rolls a weak hit that momentum
 * can burn to a strong hit. The roll begins the expedition (its track is
 * created at the roll) and asks the move's narration to plan it
 * (`resolution.skeletonRequests`, resolver.js expeditionPlanRequest — issue
 * #353 Phase 3). The result is held; the player burns momentum.
 *
 * Correct: the upgraded result is "the move's one narration" (heldResult.js),
 * so it is the narration that plans the expedition: it is shown the request
 * under UNREVEALED → DECIDE NOW, and a plan about the track is filed (decided,
 * or with its rolls alone) — exactly as when the same held result is kept.
 *
 * Today: a Burn Momentum / Improve Result narrates a resolution built from
 * scratch (burnMomentum.js buildBurnedResolution / improveResult.js:
 * `oracleSeeds: null`, no `skeletonRequests`), the upgraded outcome's effects
 * add a request only when the upgrade itself begins the expedition
 * (`next.expeditionProgress && !orig.expeditionProgress`), and
 * narrateHeldUpgrade copies only the player's line from the held resolution.
 * narrateResolution reads `resolution.skeletonRequests`, finds none, and the
 * expedition is never planned: no waypoints, no end to reveal at Finish an
 * Expedition.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, pc, tracksJournal, savedJournalEntry;
let nextId = 0;

const NARRATION_MODEL = 'claude-sonnet-5-5';
const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit; momentum 9 burns to a strong hit
const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit: nothing to upgrade
const BURN = '[data-action="sf-burn-momentum"]';
const KEEP = '[data-action="sf-keep-result"]';
const DESTINATION = 'Kessler Drift';

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const store = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

/** A JournalEntry that keeps its pages and their flags (the Secrets journal's plans). */
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

const tracks = () => tracksJournal.getFlag(MODULE_ID, 'tracks') ?? [];
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));
const plans = () => {
  const journal = table.client('gm-1').run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets')) ?? null;
  return (journal?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.secretEntry).filter(Boolean);
};

async function roll(dice) {
  control.interpretation = { moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'wits', adds: 0,
    rationale: 'test', mischiefApplied: false, moveTarget: DESTINATION, expeditionRank: 'dangerous' };
  control.dice = dice;
  await table.client('pl-1').chat(`We set out for ${DESTINATION}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });
async function resetTable(settings = {}) {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'exp-s1', sessionNumber: 1,
      currentSceneId: 'exp-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // Momentum 9: a weak hit against 3 and 7 can be burned to a strong hit.
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 } } });
  tracksJournal = makeTracksJournal();
  table.journal._set(tracksJournal);
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  scriptClaude(table, { fallback: (call) => (call.model !== NARRATION_MODEL ? '{}'
    : 'The drift opens ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```') });
}
beforeEach(async () => { await resetTable(); });

const expeditionAsked = (call) => /### DECIDE NOW[\s\S]*Expedition — the expedition to Kessler Drift/.test(call?.system ?? '');
const expeditionPlan = () => plans().find(p => p.kind === 'expedition') ?? null;

describe('NARA-02 — an expedition begun by a result that is then upgraded is still planned', () => {
  it('control: a strong hit begins the expedition and its narration is asked to plan it', async () => {
    await roll(STRONG);
    expect(tracks()).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    expect(expeditionAsked(narrationCalls().at(-1))).toBe(true);
    expect(expeditionPlan()).toMatchObject({ kind: 'expedition', subject: { type: 'track', id: tracks()[0].id } });
  }, 40_000);

  it('control: a held weak hit that is KEPT is narrated once and that narration is asked to plan the expedition', async () => {
    const card = await roll(WEAK);
    expect(card.flags[MODULE_ID].awaitingUpgrade?.open).toBe(true);
    expect(tracks()).toHaveLength(1);           // the expedition began at the roll
    expect(narrations()).toEqual([]);           // held: not narrated yet

    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(expeditionAsked(narrationCalls().at(-1))).toBe(true);
    expect(expeditionPlan()).toMatchObject({ kind: 'expedition', subject: { type: 'track', id: tracks()[0].id } });
  }, 40_000);

  it('the same held weak hit BURNED to a strong hit: its one narration is asked to plan the expedition, and a plan is filed', async () => {
    const card = await roll(WEAK);
    expect(card.flags[MODULE_ID].awaitingUpgrade?.open).toBe(true);
    // The held resolution carries the request the roll made.
    expect(card.flags[MODULE_ID].awaitingUpgrade.resolution.skeletonRequests?.[0]).toMatchObject({ kind: 'expedition' });
    expect(tracks()).toHaveLength(1);
    expect(narrations()).toEqual([]);

    await click(card, BURN);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);       // the move's one narration
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe('strong_hit');
    expect(tracks()).toHaveLength(1);           // still the one expedition, open

    expect(expeditionAsked(narrationCalls().at(-1)), 'the narration is asked to plan the expedition (DECIDE NOW)').toBe(true);
    expect(expeditionPlan(), 'the open expedition has a hidden plan').toMatchObject({ kind: 'expedition', subject: { type: 'track', id: tracks()[0].id } });
  }, 40_000);

  // The same loss with "ask before paying and narrating" off: the weak hit's
  // own narration plans the expedition, the burn supersedes that narration and
  // takes its plan back (resultUpgrade.js undoSupersededPlans) — and the
  // re-narration is not asked.
  it('hold off: the weak hit is narrated and planned at once; burned, the expedition still has a plan', async () => {
    await resetTable({ holdResultForUpgrade: false });
    const card = await roll(WEAK);
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(narrations()).toHaveLength(1);
    expect(expeditionPlan(), 'control: the first narration planned it').toMatchObject({ kind: 'expedition' });

    await click(card, BURN);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(tracks()).toHaveLength(1);
    expect(expeditionPlan(), 'the open expedition has a hidden plan after the burn').toMatchObject({ kind: 'expedition', subject: { type: 'track', id: tracks()[0].id } });
  }, 40_000);
});
