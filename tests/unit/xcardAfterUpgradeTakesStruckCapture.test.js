/**
 * STARFORGED COMPANION
 * tests/unit/xcardAfterUpgradeTakesStruckCapture.test.js
 *
 * Issue #347 D2 (XCARD-AFTER-BURN-KEEPS-STRUCK-CAPTURE) — the maintainer's
 * option A: an X-Card on a beat also takes the capture of the narrations that
 * beat's Burn Momentum / Improve Result struck — their lore, NPC details and
 * facts, which are then blocked.
 *
 * A miss is narrated (the prisoner's hand is burned with a torch; Vex held him
 * down). About two seconds later its capture records what the prose
 * established: a confirmed World Journal lore entry and a detail on Vex's
 * card, both stamped with the narration's id (issue #329 X01). The roller
 * burns momentum: the pre-burn card is struck through (`burnSuperseded`) and
 * the re-narration posts under it. A player then plays the X-Card on the beat
 * on screen.
 *
 * `xCardedNarrationCards` (narrator.js) walked the beat but took only cards
 * still "in narrator memory" — a `burnSuperseded` card is skipped — so
 * `suppressScene` → `finishXCardRemoval` (src/context/safety.js) undid the
 * re-narration alone: the struck card's narration id never reached
 * `retractNarrationCapture`, and its lore and tier detail went on reaching
 * every later prompt (ESTABLISHED LORE, the NPC's card), its facts no bar to
 * a later narration restating them (#338 D8's rule for the supersede).
 *
 * The re-narration now names the resolution it upgraded (`upgradeOf`, from
 * the upgraded resolution), a struck trigger vignette the resolution whose
 * upgrade struck it (`supersededFor`), and the X-Card's pick adds the struck
 * narrations of the beat's upgrade to what it removes.
 */

/* global makeTestActor, makeTestMessage */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, narrateResolution } from '../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../src/context/safety.js';
import { getConfirmedLore, JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { routeWorldJournalResults } from '../../src/entities/entityExtractor.js';
import { supersedeOriginalNarration, applyBurnFromRelay, registerBurnMomentumHook } from '../../src/moves/burnMomentum.js';
import { applyImproveFromRelay, registerImproveResultHook } from '../../src/moves/improveResult.js';
import { revertPayThePrice, retryUpgradeStep, upgradeStepRecord } from '../../src/moves/resultUpgrade.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(d => makePage(d, pages)); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc, pages) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => { const i = pages.indexOf(page); if (i >= 0) pages.splice(i, 1); },
  };
  return page;
}

let journals, orig, vex;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };

  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];

  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);

  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const MISS = {
  newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [],
  sceneFrame: { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The torch hovers over his hand' },
};
const HIT = {
  newTruths: [{ subject: 'the prisoner', fact: 'Gave up the door code' }],
  stateChanges: [],
  sceneFrame: { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The prisoner talks' },
};
const RES_ID = 'res-compel-1';
const TORCH_LORE = 'The Torch Room';

/** The move's own resolution, and the one its burn made (a new id, naming the one it upgraded). */
const MISS_RES   = { moveId: 'compel', outcome: 'miss', _id: RES_ID };
const BURNED_RES = { moveId: 'compel', outcome: 'strong_hit', _id: 'res-compel-1-burned', upgradeOf: RES_ID };

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar, resolution = MISS_RES) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, resolution, stored(),
    { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
  // let the chained sidecar persist land
  await new Promise(r => setTimeout(r, 0));
}

/** The narration's capture (runDiscoveryDetection → routeWorldJournalResults), ~2 s after its card: world lore and a fact for Vex's card. */
const capture = (narrationId) => routeWorldJournalResults({
  lore: [
    { title: TORCH_LORE, text: 'Vex burned the prisoner\'s hand with a cutting torch to get the code.' },
    { title: 'Vex and the torch', text: 'Held the prisoner down for the torch', entityName: 'Vex' },
  ],
}, stored(), { narrationId });

const someoneSpeaks = () => ChatMessage.create({ content: 'I press the prisoner for the code.', flags: {} });
const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const loreEntry  = (title) => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.loreEntry).find(e => e?.title === title) ?? null;
const vexDetails = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);
const cardOf     = (narrationId) => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.narrationId === narrationId);

describe('issue #347 D2 — the X-Card after a Burn Momentum / Improve Result', () => {
  it('control: an X-Card on the miss narration itself (no burn) undoes what its capture recorded', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');
    expect(loreTitles()).toContain(TORCH_LORE);
    expect(loreEntry(TORCH_LORE).narrationId).toBe('nar-miss');
    expect(vexDetails()).toEqual(['Held the prisoner down for the torch']);

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-miss']);
    expect(loreTitles()).not.toContain(TORCH_LORE);
    expect(vexDetails()).toEqual([]);
  });

  it('control: the burn strikes the miss narration and takes it out of the ring; its capture\'s records stand (issue #338 D8)', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');
    syncChat();
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    expect(cardOf('nar-miss').flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(stored().sceneTruths.find(t => t.narrationId === 'nar-miss')).toMatchObject({ retracted: true, retractedBy: 'superseded' });
    expect(loreTitles()).toContain(TORCH_LORE);
  });

  it('the X-Card on the beat on screen — the struck miss narration and its re-narration — removes the miss narration\'s lore and NPC detail too', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');

    // Burn Momentum: the miss narration is superseded, the upgraded outcome re-narrated under it.
    syncChat();
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    await narrate('nar-hit', 'The prisoner breaks before the torch touches him again, and talks.', HIT, BURNED_RES);
    expect(cardOf('nar-hit').flags[MODULE_ID].upgradeOf, 'the re-narration names the resolution it upgraded').toBe(RES_ID);

    // A player plays the X-Card: both cards of the beat are on screen.
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(cardOf('nar-hit').flags[MODULE_ID].xCarded, 'the re-narration is removed').toBe(true);
    expect(cardOf('nar-miss').flags[MODULE_ID].xCarded, 'the struck narration is removed with it').toBe(true);

    expect(stored().xCardedNarrationIds, 'the narrations the X-Card removed').toEqual(['nar-miss', 'nar-hit']);
    expect(loreTitles(), 'ESTABLISHED LORE after the X-Card').not.toContain(TORCH_LORE);
    expect(vexDetails(), 'Narrator-added details on Vex\'s card after the X-Card').toEqual([]);
    expect(stored().sceneTruths.find(t => t.narrationId === 'nar-miss'), 'the struck fact is the X-Card\'s now — blocked')
      .toMatchObject({ retracted: true, retractedBy: 'xcard' });

    // A GM resumes; a later narration, fed that lore, states the struck card's fact again:
    // a fact of the beat the table removed is not recorded as binding.
    expect(await clearXCard()).toBe(true);
    await someoneSpeaks();
    await narrate('nar-later', 'The prisoner cradles his burned hand.', { ...MISS, sceneFrame: null });
    const live = stored().sceneTruths.filter(t => !t.retracted && /burned with a cutting torch/i.test(t.fact));
    expect(live.map(t => t.narrationId), 'live truths restating the removed beat').toEqual([]);
  });

  it('control: an X-Card on a later beat leaves an earlier move\'s struck narration and its records alone', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');
    syncChat();
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    await narrate('nar-hit', 'The prisoner breaks before the torch touches him again, and talks.', HIT, BURNED_RES);
    await someoneSpeaks();
    await narrate('nar-next', 'Vex wipes the torch clean.', { newTruths: [], stateChanges: [] }, { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-fd-2' });

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-next']);
    expect(cardOf('nar-miss').flags[MODULE_ID].xCarded).toBeUndefined();
    expect(loreTitles()).toContain(TORCH_LORE);
    expect(stored().sceneTruths.find(t => t.narrationId === 'nar-miss')).toMatchObject({ retracted: true, retractedBy: 'superseded' });
  });

  it('the trigger vignette of a clock the burn rewound is taken too — named by the resolution the burn upgraded', async () => {
    game.settings._store.set(KEY, { ...stored(), clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }] });
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    const vignette = makeTestMessage({
      content: '<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>The reactor core vents.</em></div>',
      flags: { [MODULE_ID]: { clockCard: true, clockVignetteCard: true, narratorCard: true, narrationText: 'The reactor core vents.',
        sessionId: SESSION, narrationId: 'nar-vignette', clockId: 't1' } },
    }, { author: 'gm-1' });
    ChatMessage._created.push(vignette);
    syncChat();

    // The burn's reversal rewinds the clock, striking its vignette; then the narration's supersede and the re-narration.
    await revertPayThePrice({ clocksAdvanced: [{ _id: 't1', name: 'Reactor breach', type: 'tension', filled: 4, segments: 4, triggered: true }],
      sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [], resolutionId: RES_ID });
    expect(vignette.flags[MODULE_ID]).toMatchObject({ burnSuperseded: true, supersededFor: RES_ID });
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    await narrate('nar-hit', 'The prisoner breaks before the torch touches him again, and talks.', HIT, BURNED_RES);

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-miss', 'nar-vignette', 'nar-hit']);
    expect(vignette.flags[MODULE_ID].xCarded).toBe(true);
  });

  it('a refused rewind\'s Retry stamps the struck vignette with the resolution upgraded too', async () => {
    game.settings._store.set(KEY, { ...stored(), clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }] });
    const vignette = makeTestMessage({
      content: '<div class="sf-clock-card"><em>The reactor core vents.</em></div>',
      flags: { [MODULE_ID]: { clockCard: true, clockVignetteCard: true, narratorCard: true, narrationText: 'The reactor core vents.',
        sessionId: SESSION, narrationId: 'nar-vignette', clockId: 't1' } },
    }, { author: 'gm-1' });
    ChatMessage._created.push(vignette);
    syncChat();
    const failures = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const set = vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused by the test'));
    try {
      await revertPayThePrice({ clocksAdvanced: [{ _id: 't1', name: 'Reactor breach', type: 'tension', filled: 4, segments: 4, triggered: true }],
        sufferMeterDeltas: [] }, null, { kind: 'burn', failures, resolutionId: RES_ID });
    } finally {
      set.mockRestore();
      warn.mockRestore();
    }
    const step = upgradeStepRecord(failures[0]);
    expect(step.resolutionId).toBe(RES_ID);
    await expect(retryUpgradeStep(step)).resolves.toEqual({ ok: true });
    expect(vignette.flags[MODULE_ID]).toMatchObject({ burnSuperseded: true, supersededFor: RES_ID });
  });
});

describe('issue #347 D2 — an upgrade\'s re-narration names the resolution it upgraded', () => {
  const GM_CTX = { requesterId: 'gm-1', requester: { id: 'gm-1', isGM: true }, requesterIsGM: true, local: true };
  const ORIGINAL = { momentumChange: 0, healthChange: 1, spiritChange: 0, supplyChange: 0 };
  const narratorReply = { content: [{ type: 'text', text: 'The salve bites, then cools.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn' };

  beforeEach(() => {
    apiPost.mockImplementation(async () => narratorReply);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
    registerBurnMomentumHook({ narrate: narrateResolution });
    registerImproveResultHook({ narrate: narrateResolution });
    const pc = makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira', hasPlayerOwner: true,
      system: { momentum: { value: 8, max: 10, min: -6, resetValue: 2 }, health: { value: 3 } } });
    game.actors._set('pc-kira', pc);
    invalidateActorCache('pc-kira');
  });
  afterEach(() => { apiPost.mockImplementation(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })); });

  function moveCard(id, moduleFlags) {
    const msg = makeTestMessage({ content: '<div class="sf-move-card"></div>', flags: { [MODULE_ID]: moduleFlags } });
    msg.id = id;
    ChatMessage._created.push(msg);
    global.game.messages = { get contents() { return ChatMessage._created; }, get: (mid) => ChatMessage._created.find(m => m.id === mid) ?? null };
    return msg;
  }
  const reNarration = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.narratorCard === true);

  it('Burn Momentum', async () => {
    moveCard('m-burn', { burn: {
      canBurn: true, challengeDice: [2, 6], momentum: 8, outcomeMomentum: 0, markedImpactCount: 0,
      moveId: 'heal', originalOutcome: 'weak_hit', originalConsequences: ORIGINAL, previewOutcome: 'strong_hit',
      originalApplied: true, actorId: 'pc-kira', resolutionId: 'res-heal-1', ptpReversals: null,
    } });
    expect(await applyBurnFromRelay({ messageId: 'm-burn' }, GM_CTX)).toEqual({ applied: true });
    expect(reNarration()?.flags[MODULE_ID].upgradeOf).toBe('res-heal-1');
  });

  it('Improve Result', async () => {
    moveCard('m-imp', { improve: {
      canImprove: true, improveTo: 'strong_hit', moveId: 'heal', isMatch: false,
      originalOutcome: 'weak_hit', originalConsequences: ORIGINAL, originalApplied: true,
      actorId: 'pc-kira', resolutionId: 'res-heal-2', assetId: null, abilityIndex: null,
      assetName: 'Fugitive', abilityName: '', hasClock: false, clockMax: 4, consumed: false,
    } });
    expect(await applyImproveFromRelay({ messageId: 'm-imp' }, GM_CTX)).toEqual({ applied: true });
    expect(reNarration()?.flags[MODULE_ID].upgradeOf).toBe('res-heal-2');
  });

  it('control: a move\'s own narration names no upgrade', async () => {
    await postNarrationCard('Prose.', { moveId: 'heal', outcome: 'weak_hit', _id: 'res-heal-3' }, stored(), {});
    expect(ChatMessage._created.at(-1).flags[MODULE_ID]).not.toHaveProperty('upgradeOf');
  });
});
