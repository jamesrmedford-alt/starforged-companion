/**
 * STARFORGED COMPANION
 * tests/unit/worldSnapshotRequest.test.js
 *
 * Issue #357 — the world state is cached for the session: a frozen snapshot
 * the narrator reads on every call.
 *
 * In the alpha 23 playtest no narrator call read the prompt cache: the prompt
 * changed every beat. Issue #354 P2-23 split out the rules that never change.
 * This is the rest: the whole world state — every sector, entity card,
 * faction, threat, lore entry, earlier session and hidden plan — rendered
 * once, stored on a GM-only page, and sent byte for byte as a cached block
 * until a new snapshot is taken; what changed since rides in the per-beat
 * context and wins.
 *
 * On a simulated table (a GM with a Claude key; Pat plays Kira), from the
 * real writers — the settlement and lore records, the plan store, the X-Card,
 * `!scene`, `!truth strike` — to the request the narrator is sent:
 *   - two narrations with lore written between them carry the same rules and
 *     the same snapshot, and the second's context holds the new lore;
 *   - a reload sends the stored text unchanged;
 *   - each trigger takes a new snapshot, several between two calls take one,
 *     and what the table says does not count takes none;
 *   - an X-Card or a strike on what the snapshot holds forces a new one;
 *   - a Line added mid-session is in the very next request;
 *   - the cached blocks lead the request, each on a one-hour breakpoint;
 *   - with the switch off, or on a player's own key, the request is as it
 *     was before the snapshot.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks, plansOf,
} from '../helpers/skeletonTable.js';
import {
  SNAPSHOT_BLOCK_HEADING, NARRATION_BLOCK_HEADING, CONTEXT_BLOCK_HEADING,
} from '../../src/narration/narratorPrompt.js';

const PLAN_TRUTH = 'SENTINEL-PLAN: the escort is a Keeper drone collecting names for the Pale Choir';
const OTHER_TRUTH = 'SENTINEL-OTHER: the broker sold the crew\'s route to the Syndicate';
const LORE = 'SENTINEL-LORE: the Covenant blockade closes the Vantage corridor at each shift change';
const LATER_LORE = 'SENTINEL-LATER: the corridor\'s beacons answer only to Covenant hails';

let table;
let restore;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

/** A page load: what the GM's client held in memory — the snapshot it took, the events it reported — is gone. */
async function reloadGm() {
  const store  = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
  const events = await gmOf(table).import('../../src/narration/snapshotEvents.js');
  gmOf(table).run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
}

beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { sessionNumber: 3 });
  await reloadGm();   // each test is a new world
});

const gm = () => gmOf(table);
const world = () => gm().run(() => game.settings.get(MODULE_ID, 'campaignState'));
const blocksOf = (call) => call.body.system;
const lastCall = () => narrationCallsOf(table).at(-1);
/** A request's blocks by what each is: the rules, the snapshot (when it has one), this narration, the context. */
const partsOf = (call) => {
  const system = blocksOf(call);
  const find = (heading) => system.find(b => b.text.startsWith(heading)) ?? null;
  return {
    system,
    rules:    system[0],
    snapshot: find(SNAPSHOT_BLOCK_HEADING),
    mode:     find(NARRATION_BLOCK_HEADING),
    context:  find(CONTEXT_BLOCK_HEADING),
  };
};

/** The snapshot's page in the GM-only Secrets journal, as stored. */
const storedSnapshot = () => gm().run(() => {
  const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
  const page = (journal?.pages?.contents ?? []).find(p => p.flags?.[MODULE_ID]?.worldSnapshot);
  return page ? { journal, page, record: page.flags[MODULE_ID].worldSnapshot } : null;
});
const snapshotLog = () => storedSnapshot()?.record?.log ?? [];

async function onTheGm(work) {
  const result = await gm().run(work);
  await table.settle();
  await table.drain();
  return result;
}

async function recordLore(title, text) {
  const { recordLoreDiscovery } = await gm().import('../../src/world/worldJournal.js');
  return onTheGm(() => recordLoreDiscovery(title, { text, confirmed: true }, game.settings.get(MODULE_ID, 'campaignState')));
}

async function makeSettlement(name) {
  const { createSettlement } = await gm().import('../../src/entities/settlement.js');
  return onTheGm(async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    return createSettlement({ name, authority: 'Lawless', trouble: 'Failing life support' }, cs);
  });
}

async function makePlan(name, truth) {
  const { createSkeleton } = await gm().import('../../src/world/secrets.js');
  return onTheGm(() => createSkeleton({
    kind: 'threat', subject: { type: 'name', id: null, name }, truth, wants: 'to finish its count',
    clues: ['It asks every traveller the same question'], escalation: ['It stops asking and starts taking'],
  }, { byGm: true }));
}

const narrate = (line = 'I slip past the escort.') => narrateMoveOn(table, moveResolution({ playerNarration: line }));

describe('issue #357 — the request carries the rules, the snapshot, this narration and its context', () => {
  it('four blocks: the three cached ones first, each on a one-hour breakpoint, then the uncached context', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate();
    const { system, rules, snapshot, mode, context } = partsOf(lastCall());

    expect(system).toHaveLength(4);
    expect(system.map(b => b.text.split('\n', 1)[0])).toEqual([
      '## NARRATOR ROLE AND VOICE', SNAPSHOT_BLOCK_HEADING, NARRATION_BLOCK_HEADING, CONTEXT_BLOCK_HEADING,
    ]);
    // The API takes at most four breakpoints, and the longer lifetime first:
    // every cached block is one hour, none follows the uncached context.
    for (const block of [rules, snapshot, mode]) expect(block.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(context.cache_control).toBeUndefined();
    expect(system.findLastIndex(b => b.cache_control)).toBe(2);
    // The retired caching beta header is gone.
    expect(lastCall().body).not.toHaveProperty('anthropic-beta');

    // The whole world state is in the snapshot, not the context.
    expect(snapshot.text).toContain(LORE);
    expect(context.text).not.toContain(LORE);
    expect(context.text).not.toContain('## ESTABLISHED LORE');
    expect(context.text).not.toContain('## ACTIVE SECTOR');
  }, 40_000);

  it('two narrations with lore written between them carry the same rules and snapshot; the second\'s context holds the new lore', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate('I slip past the escort.');
    const first = partsOf(lastCall());
    await recordLore('The corridor beacons', LATER_LORE);
    await narrate('I hail the corridor beacon.');
    const second = partsOf(lastCall());

    expect(second.rules.text).toBe(first.rules.text);
    expect(second.snapshot.text).toBe(first.snapshot.text);
    expect(second.snapshot.text).not.toContain(LATER_LORE);
    expect(second.context.text).toMatch(/## CHANGED SINCE THE SNAPSHOT[\s\S]*### ESTABLISHED LORE\n\n- The corridor beacons: SENTINEL-LATER/);
    expect(second.context.text).toContain('Where anything here disagrees with the snapshot, this wins.');
    expect(first.context.text).not.toContain('## CHANGED SINCE THE SNAPSHOT');
    // One snapshot was taken, and stored for the GMs alone.
    expect(snapshotLog()).toHaveLength(1);
    expect(storedSnapshot().record.text).toBe(first.snapshot.text);
    expect(storedSnapshot().journal.ownership).toEqual({ default: 0 });
  }, 60_000);

  it('every prose mode reads the same two blocks: a move, an @scene answer and an oracle follow-up', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate();
    const move = partsOf(lastCall());
    const { interrogateScene, narrateOracleFollowup } = await gm().import('../../src/narration/narrator.js');
    await onGm(table, () => interrogateScene('What does the escort look like?',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    const scene = partsOf(lastCall());
    await onGm(table, () => narrateOracleFollowup({ kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (Likely)',
      question: 'Does it follow?', rolledLine: 'YES',
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira' }));
    const oracle = partsOf(lastCall());

    for (const other of [scene, oracle]) {
      expect(other.rules.text).toBe(move.rules.text);
      expect(other.snapshot.text).toBe(move.snapshot.text);
    }
    expect(scene.mode.text).not.toBe(move.mode.text);
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);

  it('a reload sends the stored text unchanged, and takes no new snapshot', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate();
    const before = partsOf(lastCall());
    // The page reloads: what this client held in memory is gone; the page is not.
    await reloadGm();
    await narrate('I keep walking.');
    const after = partsOf(lastCall());

    expect(after.snapshot.text).toBe(before.snapshot.text);
    expect(after.rules.text).toBe(before.rules.text);
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);

  it('a Line added mid-session is in the very next request, and the snapshot is not rewritten for it', async () => {
    await narrate();
    const before = partsOf(lastCall());
    // The Safety tab's own write: the world's Lines, which the canonical GM lays onto campaignState.
    await onTheGm(() => game.settings.set(MODULE_ID, 'globalSafetyLines', ['SENTINEL-LINE: no harm to animals']));
    await narrate('I keep walking.');
    const after = partsOf(lastCall());

    expect(before.rules.text).not.toContain('SENTINEL-LINE');
    expect(after.rules.text).toContain('SENTINEL-LINE: no harm to animals');
    expect(after.snapshot.text).toBe(before.snapshot.text);
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);
});

describe('issue #357 — what the snapshot holds, and what the context says is in play', () => {
  it('every recorded entity\'s card and every active plan are in the snapshot; the context names the ones in play', async () => {
    await makeSettlement('Bleakhold');
    await makeSettlement('Vantage Station');
    await makePlan('the escort', PLAN_TRUTH);
    await makePlan('the broker', OTHER_TRUTH);
    await narrate('I slip past the escort and make for Bleakhold.');
    const { snapshot, context } = partsOf(lastCall());

    // Both settlements' cards, whichever the line named.
    expect(snapshot.text).toMatch(/#### BLEAKHOLD — Settlement \(id [^)]+\)[\s\S]*Authority: Lawless/);
    expect(snapshot.text).toMatch(/#### VANTAGE STATION — Settlement \(id [^)]+\)/);
    // All active plans go in (decided), in a section of their own.
    expect(snapshot.text).toMatch(/### HIDDEN PLANS — FOR THE NARRATOR ONLY[\s\S]*SENTINEL-PLAN[\s\S]*/);
    expect(snapshot.text).toContain(OTHER_TRUTH);
    expect(snapshot.text).toContain('Every other plan here is background');

    // The context names what this narration involves, and prints none of it again.
    expect(context.text).toMatch(/## IN PLAY NOW[\s\S]*- In this scene: Bleakhold \(Settlement, id [^)]+\)/);
    expect(context.text).not.toContain('Vantage Station');
    expect(context.text).not.toContain('## ENTITIES IN SCENE');
    expect(context.text).toMatch(/## UNREVEALED[\s\S]*### IN PLAY FOR THIS NARRATION[\s\S]*- Threat — the escort \(id sk-/);
    expect(context.text).not.toContain(PLAN_TRUTH);
    expect(context.text).not.toContain('the broker');
  }, 60_000);

  it('the snapshot has no clock in it: taken twice from the same world, it is the same text', async () => {
    await makeSettlement('Bleakhold');
    await recordLore('The Covenant blockade', LORE);
    await narrate();
    const first = partsOf(lastCall()).snapshot.text;
    await gm().chat('!scene start');
    await table.settle();
    await table.drain();
    await narrate('I keep walking.');
    expect(snapshotLog()).toHaveLength(2);
    expect(partsOf(lastCall()).snapshot.text).toBe(first);
  }, 60_000);
});

describe('issue #357 — when a new snapshot is taken', () => {
  const causes = () => snapshotLog().map(e => e.causes);

  it('the first narration of a session takes one; a narration with nothing reported takes none', async () => {
    await narrate();
    await narrate('I keep walking.');
    await narrate('And on.');
    expect(causes()).toEqual([['no_snapshot']]);
  }, 60_000);

  it('!scene start and !scene end each take one at the next narration', async () => {
    await narrate();
    await gm().chat('!scene end');
    await table.settle();
    await table.drain();
    await narrate('Later.');
    await gm().chat('!scene start');
    await table.settle();
    await table.drain();
    await narrate('Later still.');
    expect(causes()).toEqual([['no_snapshot'], ['scene_ended'], ['scene_started']]);
  }, 80_000);

  it('several major events between two narrations take one snapshot, which holds all of them', async () => {
    await narrate();
    await makeSettlement('Bleakhold');
    await makePlan('the escort', PLAN_TRUTH);
    await gm().chat('!scene start');
    await table.settle();
    await table.drain();
    await narrate('I keep walking.');
    const { snapshot, context } = partsOf(lastCall());

    expect(snapshotLog()).toHaveLength(2);
    expect(causes()[1]).toEqual(expect.arrayContaining(['entity_recorded', 'plan_made', 'scene_started']));
    expect(snapshot.text).toContain('#### BLEAKHOLD — Settlement');
    expect(snapshot.text).toContain(PLAN_TRUTH);
    expect(context.text).not.toContain('## CHANGED SINCE THE SNAPSHOT');
    // The events it answered are spent: the next narration takes none.
    await narrate('And on.');
    expect(snapshotLog()).toHaveLength(2);
  }, 80_000);

  it('what the table says does not count takes none: an oracle\'s yes/no, a switch of the active sector', async () => {
    await narrate();
    const { narrateOracleFollowup } = await gm().import('../../src/narration/narrator.js');
    await onGm(table, () => narrateOracleFollowup({ kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (Likely)',
      question: 'Does it follow?', rolledLine: 'YES',
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira' }));
    const events = await gm().import('../../src/narration/snapshotEvents.js');
    expect(gm().run(() => events.reportSnapshotEvent('sector_switched'))).toBe(false);
    await narrate('I keep walking.');
    expect(causes()).toEqual([['no_snapshot']]);
  }, 60_000);

  it('a plan a GM retires leaves the snapshot before the next narration', async () => {
    const plan = await makePlan('the escort', PLAN_TRUTH);
    await narrate();
    expect(partsOf(lastCall()).snapshot.text).toContain(PLAN_TRUTH);
    const { retireSkeleton } = await gm().import('../../src/world/secrets.js');
    await onTheGm(() => retireSkeleton(plan.id));
    await narrate('I keep walking.');
    expect(causes().at(-1)).toEqual(expect.arrayContaining(['plan_retired']));
    expect(lastCall().system).not.toContain(PLAN_TRUTH);
  }, 60_000);
});

describe('issue #357 — the snapshot never keeps asserting removed content', () => {
  it('an X-Card forces a new snapshot before the next narration, and what it removed is in neither block', async () => {
    // A price reveals a new enemy; the narration decides its plan (the real
    // capture: the plan is stamped with that narration).
    await patSpeaks(table, 'We wait.');
    table.replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort, waiting.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: PLAN_TRUTH }] } : {}) } };
    };
    const { withPayThePriceSeed } = await import('../../src/moves/resolver.js');
    await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(plansOf(table).map(p => p.truth)).toEqual([PLAN_TRUTH]);

    // The same beat's next narration takes a snapshot that holds the plan.
    table.replies = () => ({ prose: 'It repeats the question.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrate('I answer it.');
    expect(snapshotLog().at(-1).causes).toEqual(expect.arrayContaining(['plan_made', 'new_enemy_revealed']));
    expect(partsOf(lastCall()).snapshot.text).toContain(PLAN_TRUTH);
    const taken = snapshotLog().length;

    await playXCard(table);
    expect(world().xCardActive).toBe(true);
    expect(plansOf(table)).toEqual([]);
    const { clearXCard } = await gm().import('../../src/context/safety.js');
    await onTheGm(() => clearXCard());
    expect(world().xCardActive).toBe(false);
    await narrate('I walk on.');

    expect(snapshotLog().length).toBe(taken + 1);
    expect(snapshotLog().at(-1).causes).toEqual(expect.arrayContaining(['xcard_played']));
    expect(lastCall().system).not.toContain(PLAN_TRUTH);
  }, 90_000);

  it('a lore entry a GM rules a rumour is out of the next request: the record it was is gone, so a new snapshot is taken', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate();
    expect(partsOf(lastCall()).snapshot.text).toContain(LORE);
    await gm().chat('!journal lore "The Covenant blockade" rumour');
    await table.settle();
    await table.drain();
    await narrate('I keep walking.');
    expect(snapshotLog().at(-1).causes).toEqual(['record_removed']);
    expect(lastCall().system).not.toContain(LORE);
  }, 60_000);

  it('a strike on a fact reports the retraction: the next narration takes a new snapshot', async () => {
    table.replies = () => ({ prose: 'The escort is armed.', sidecar: { newTruths: [{ subject: 'the escort', fact: 'carries a Covenant sidearm' }], stateChanges: [] } });
    await narrate();
    const truth = world().sceneTruths.find(t => /sidearm/.test(t.fact));
    expect(truth).toBeTruthy();
    const taken = snapshotLog().length;
    await gm().chat(`!truth strike ${truth.id.slice(0, 8)}`);
    await table.settle();
    await table.drain();
    table.replies = () => ({ prose: 'The corridor is quiet.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrate('I keep walking.');
    expect(snapshotLog().length).toBe(taken + 1);
    expect(snapshotLog().at(-1).causes).toEqual(expect.arrayContaining(['fact_retracted']));
  }, 60_000);
});

describe('issue #357 — without a snapshot the request is as it was', () => {
  const legacyShape = (call) => {
    const system = blocksOf(call);
    expect(system).toHaveLength(3);
    expect(system.map(b => b.text.split('\n', 1)[0])).toEqual(['## NARRATOR ROLE AND VOICE', NARRATION_BLOCK_HEADING, CONTEXT_BLOCK_HEADING]);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[2].cache_control).toBeUndefined();
    return system;
  };

  it('with the switch off: three blocks, lore chosen per beat, nothing stored', async () => {
    restore();
    restore = await resetSkeletonTable(table, { worldSnapshot: false }, { sessionNumber: 3 });
    await recordLore('The Covenant blockade', LORE);
    await makePlan('the escort', PLAN_TRUTH);
    await narrate();
    const system = legacyShape(lastCall());
    expect(system[2].text).toMatch(/## ESTABLISHED LORE\n\n- The Covenant blockade: SENTINEL-LORE/);
    expect(system[2].text).toMatch(/## UNREVEALED[\s\S]*SENTINEL-PLAN/);
    expect(lastCall().system).not.toContain(SNAPSHOT_BLOCK_HEADING);
    expect(lastCall().system).not.toContain('## IN PLAY NOW');
    expect(storedSnapshot()).toBeNull();
    // And no event is marked while it is off.
    const events = await gm().import('../../src/narration/snapshotEvents.js');
    expect(gm().run(() => events.pendingSnapshotEvents())).toEqual([]);
  }, 60_000);

  it('a narration on a player\'s own key sends no snapshot: the page is the GMs\'', async () => {
    await recordLore('The Covenant blockade', LORE);
    await narrate();                                   // the GM's: a snapshot is stored
    expect(storedSnapshot()).not.toBeNull();
    await table.setClaudeKey('pl-1', 'sk-ant-player');
    const pat = table.client('pl-1');
    const { interrogateScene } = await pat.import('../../src/narration/narrator.js');
    await pat.run(() => interrogateScene('What does the escort look like?',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    await table.settle();
    await table.drain();
    const call = table.claude.by('pl-1').filter(c => String(c.system).startsWith('## NARRATOR ROLE AND VOICE')).at(-1);
    expect(call, 'the player\'s client narrated').toBeTruthy();
    legacyShape(call);
    expect(call.system).not.toContain(SNAPSHOT_BLOCK_HEADING);
  }, 60_000);
});

describe('issue #357 — each major event takes a new snapshot at the next narration', () => {
  const lastCauses = () => snapshotLog().at(-1).causes;

  it('a plan a narration decides, and a truth a narration reveals', async () => {
    const { createSkeleton } = await gm().import('../../src/world/secrets.js');
    const plan = await onTheGm(() => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
      oracleSeeds: ['Character Role: Warden'], sceneId: 'sc-1', sessionId: 's-1' }, { byGm: true }));
    await narrate();   // the first snapshot: the plan is in it, undecided
    expect(partsOf(lastCall()).snapshot.text).toMatch(/#### Threat — the escort \(id sk-[^)]+\)\nNot yet decided/);

    table.replies = () => ({ prose: 'The escort waits.', sidecar: { newTruths: [], stateChanges: [],
      plans: [{ id: plan.id, subject: 'the escort', truth: PLAN_TRUTH, clues: ['It asks every traveller the same question'] }] } });
    await narrate('I watch it.');
    expect(plansOf(table)[0].truth).toBe(PLAN_TRUTH);

    table.replies = () => ({ prose: 'It is a drone, and it says so.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrate('I ask what it is.');
    expect(lastCauses()).toEqual(expect.arrayContaining(['plan_decided']));
    expect(partsOf(lastCall()).snapshot.text).toContain(`Truth: ${PLAN_TRUTH}`);

    table.replies = () => ({ prose: 'The corridor is quiet.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrate('I walk on.');
    expect(lastCauses()).toEqual(expect.arrayContaining(['plan_revealed']));
    expect(partsOf(lastCall()).snapshot.text).toContain('(already revealed — the characters know it)');
  }, 90_000);

  it('a clue shown rides with the changes: no new snapshot for it', async () => {
    const { createSkeleton } = await gm().import('../../src/world/secrets.js');
    const plan = await onTheGm(() => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
      truth: PLAN_TRUTH, clues: ['It asks every traveller the same question'], sceneId: 'sc-1', sessionId: 's-1' }, { byGm: true }));
    table.replies = () => ({ prose: 'It asks again.', sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['c1'] }] } });
    await narrate();
    const taken = snapshotLog().length;
    table.replies = () => ({ prose: 'The corridor is quiet.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrate('I walk on.');
    expect(snapshotLog()).toHaveLength(taken);
    expect(partsOf(lastCall()).context.text).toMatch(/## CHANGED SINCE THE SNAPSHOT[\s\S]*### HIDDEN PLANS[\s\S]*\[c1\] It asks every traveller the same question \(shown\)/);
  }, 60_000);

  it('a plan a GM edits', async () => {
    const plan = await makePlan('the escort', PLAN_TRUTH);
    await narrate();
    const { editSkeleton } = await gm().import('../../src/world/secrets.js');
    await onTheGm(() => editSkeleton(plan.id, { truth: OTHER_TRUTH }));
    await narrate('I walk on.');
    expect(lastCauses()).toEqual(expect.arrayContaining(['plan_edited']));
    expect(lastCall().system).not.toContain(PLAN_TRUTH);
    expect(partsOf(lastCall()).snapshot.text).toContain(OTHER_TRUTH);
  }, 60_000);

  it('Make a Discovery, once it is narrated', async () => {
    await narrate();
    await narrateMoveOn(table, moveResolution({ moveId: 'make_a_discovery', moveName: 'Make a Discovery', outcome: 'strong_hit',
      outcomeLabel: 'Strong Hit', playerNarration: 'I chart what the beacon points at.',
      oracleSeeds: { results: ['Descriptor + Focus: Ancient / Machine'], names: [], context: 'make_a_discovery strong_hit' } }));
    // Its own narration took none: the discovery was not yet told.
    expect(snapshotLog()).toHaveLength(1);
    await narrate('I walk on.');
    expect(lastCauses()).toEqual(expect.arrayContaining(['discovery_rolled']));
  }, 60_000);

  it('a routine "envision" seed and a price that reveals no one take none', async () => {
    await narrate();
    const { withPayThePriceSeed } = await import('../../src/moves/resolver.js');
    await narrateMoveOn(table, moveResolution({ moveId: 'gather_information', moveName: 'Gather Information', outcome: 'strong_hit',
      outcomeLabel: 'Strong Hit', playerNarration: 'I read the manifest.',
      oracleSeeds: withPayThePriceSeed({ results: ['Story Clue: A hidden ledger'], names: [], context: 'gather_information strong_hit' },
        'gather_information', 'It is stressful') }));
    await narrate('I walk on.');
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);

  it('a sector created, and its settlements\' descriptions written', async () => {
    await narrate();
    const sectors = await gm().import('../../src/sectors/sectorGenerator.js');
    const settlement = await makeSettlement('Bleakhold');   // entity_recorded — answered by the next snapshot
    await narrate('I walk on.');
    const taken = snapshotLog().length;

    await onTheGm(() => sectors.storeSector({
      id: 'sec-9', name: 'The Rift', region: 'expanse', regionLabel: 'Expanse', trouble: null, createdAt: '2026-11-14T00:00:00Z',
      mapData: { sectorId: 'sec-9', settlements: [], passages: [], discoveries: [] },
    }, { settlements: {} }, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'))));
    await narrate('And on.');
    expect(snapshotLog()).toHaveLength(taken + 1);
    expect(lastCauses()).toEqual(['sector_created']);
    expect(partsOf(lastCall()).snapshot.text).toContain('#### The Rift (id sec-9)');
    expect(partsOf(lastCall()).context.text).toContain('- Active sector: The Rift (id sec-9)');

    const actor = gm().run(() => game.actors.get(game.settings.get(MODULE_ID, 'campaignState').settlementIds[0]));
    expect(settlement && actor).toBeTruthy();
    await onTheGm(() => sectors.applyStubsToSettlementEntities({ g1: actor }, { settlements: { g1: 'A ring of rusted docks.' } }));
    await narrate('Further.');
    expect(lastCauses()).toEqual(['sector_details_written']);
    expect(partsOf(lastCall()).snapshot.text).toContain('A ring of rusted docks.');
  }, 90_000);

  it('a threat recorded at significant salience; one the detector did not rate rides with the changes', async () => {
    await narrate();
    const { routeWorldJournalResults } = await gm().import('../../src/entities/entityExtractor.js');
    // Unrated: recorded (the salience gate fails open), but not a major event.
    await onTheGm(() => routeWorldJournalResults({ threats: [{ name: 'Dock rats', severity: 'looming', summary: 'Pilfering the stores.' }] },
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'))));
    await narrate('I walk on.');
    expect(snapshotLog()).toHaveLength(1);
    expect(partsOf(lastCall()).context.text).toMatch(/## CHANGED SINCE THE SNAPSHOT[\s\S]*### THREATS\n\n- Dock rats \(looming; id [^)]+\): Pilfering the stores\./);

    await onTheGm(() => routeWorldJournalResults({ threats: [{ name: 'Drift Raiders', severity: 'immediate', summary: 'They hold the corridor.', salience: 'significant' }] },
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'))));
    await narrate('And on.');
    expect(lastCauses()).toEqual(expect.arrayContaining(['threat_recorded']));
    expect(partsOf(lastCall()).context.text).toMatch(/- Threats in motion: Drift Raiders \(immediate, id [^)]+\); Dock rats \(looming, id [^)]+\)/);
  }, 90_000);
});

describe('issue #357 — Begin a Session: a new snapshot, and the cache written ahead of the first narration', () => {
  const isPrewarm = (call) => call.body?.max_tokens === 0;
  const unbegun = { sessionActive: false, sessionStartedId: null, lastSessionTimestamp: new Date().toISOString(), clocks: [], sessionNumber: 3 };

  async function begin({ galley }) {
    gm().answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': galley }));
    await onGm(table, () => ChatMessage.create({ content: '!begin-session' }));
  }

  it('with no opening narration, the rules and the snapshot are written with max_tokens 0 — the blocks the first narration then sends', async () => {
    restore();
    restore = await resetSkeletonTable(table, {}, unbegun);
    await reloadGm();
    await recordLore('The Covenant blockade', LORE);
    await begin({ galley: false });
    expect(world().sessionActive).toBe(true);

    const warm = table.claude.calls.filter(isPrewarm);
    expect(warm).toHaveLength(1);
    const [call] = warm;
    expect(call.model).toBe('claude-sonnet-5-5');
    expect(call.body.stream).toBeUndefined();
    // The thinking setting every narrator call carries (api-proxy.js): a different one writes an entry nothing reads.
    expect(call.body.thinking).toEqual({ type: 'between_tools' });
    expect(call.body.system).toHaveLength(2);
    expect(call.body.system.every(b => b.cache_control?.ttl === '1h')).toBe(true);
    expect(call.body.system[1].text.startsWith(SNAPSHOT_BLOCK_HEADING)).toBe(true);
    expect(call.body.system[1].text).toContain(LORE);
    expect(snapshotLog().at(-1).causes).toEqual(expect.arrayContaining(['session_begin']));
    const taken = snapshotLog().length;

    await narrate();
    const first = partsOf(lastCall());
    expect(lastCall().body.thinking).toEqual(call.body.thinking);
    expect(first.rules.text).toBe(call.body.system[0].text);
    expect(first.snapshot.text).toBe(call.body.system[1].text);
    expect(snapshotLog()).toHaveLength(taken);
  }, 90_000);

  it('with the galley vignette, nothing is written ahead: the vignette is the session\'s first narration and carries the snapshot', async () => {
    restore();
    restore = await resetSkeletonTable(table, {}, unbegun);
    await reloadGm();
    await recordLore('The Covenant blockade', LORE);
    await begin({ galley: true });

    expect(table.claude.calls.filter(isPrewarm)).toEqual([]);
    const galley = narrationCallsOf(table).at(-1);
    expect(galley, 'the galley vignette was narrated').toBeTruthy();
    const { snapshot } = partsOf(galley);
    expect(snapshot.text).toContain(LORE);
    expect(snapshotLog().at(-1).causes).toEqual(expect.arrayContaining(['session_begin']));
    const taken = snapshotLog().length;
    await narrate();
    expect(partsOf(lastCall()).snapshot.text).toBe(snapshot.text);
    expect(snapshotLog()).toHaveLength(taken);
  }, 90_000);

  it('with the snapshot switched off, nothing is written ahead', async () => {
    restore();
    restore = await resetSkeletonTable(table, { worldSnapshot: false }, unbegun);
    await reloadGm();
    await begin({ galley: false });
    expect(world().sessionActive).toBe(true);
    expect(table.claude.calls.filter(isPrewarm)).toEqual([]);
  }, 60_000);
});
