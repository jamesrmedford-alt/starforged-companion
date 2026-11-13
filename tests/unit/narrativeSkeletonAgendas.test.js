/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonAgendas.test.js
 *
 * Issue #353 Phase 4 — plans for NPC agendas, vows and discoveries, and the
 * GM's "has a plan" markers. On a simulated table (a keyed GM; Pat plays
 * Kira):
 *   - a connection made (Make a Connection's auto-create, a confirmed NPC
 *     draft) gets an agenda plan about its card, rolled from its goal, role,
 *     a disposition and an Action + Theme, for the next narration it is in to
 *     decide — one plan an NPC, and only the canonical GM files one;
 *   - a vow sworn is asked what is really behind it in its swearing scene, or
 *     — no scene — has its roll filed for a later narration to decide; its
 *     plan is in play while its vow is the one the scene serves (R3's
 *     ladder), and when it is fulfilled;
 *   - Make a Discovery and Confront Chaos keep what their find means;
 *   - the GM's "has a plan" markers read subject ids and names only (their
 *     rendering is tests/unit/secretsPanel.test.js's).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { planRequestsFromSeeds, selectRelevantSkeletons, normaliseSkeleton } from '../../src/world/skeletons.js';
import { vowPlanRequest, buildOracleSeeds } from '../../src/moves/resolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// What a move asks to plan (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe('issue #353 Phase 4 — discoveries and vows are asked for a plan', () => {
  it('Make a Discovery keeps what its find means: a discovery request with the find\'s rolls', () => {
    const seeds = buildOracleSeeds('make_a_discovery', 'strong_hit', false);
    const [req] = planRequestsFromSeeds(seeds, 'nar-1');
    expect(req).toMatchObject({ ref: 'plan-nar-1-find', kind: 'discovery', trigger: 'make_a_discovery',
      label: 'the discovery this move makes' });
    expect(req.oracleSeeds).toEqual(seeds.results);
    expect(req.oracleSeeds.join('\n')).toMatch(/^Discovery descriptor and focus: /m);
  });

  it('Confront Chaos too; a price on the same seeds is not part of the find', () => {
    const seeds = { results: ['Chaos prompt (action + theme): Breach / Ruin', 'Confront Chaos: A rift opens',
      'Pay the Price: You are separated'], names: [], context: 'confront_chaos' };
    const reqs = planRequestsFromSeeds(seeds, 'nar-2');
    expect(reqs).toEqual([expect.objectContaining({ ref: 'plan-nar-2-find', kind: 'discovery', trigger: 'confront_chaos',
      oracleSeeds: ['Chaos prompt (action + theme): Breach / Ruin', 'Confront Chaos: A rift opens'] })]);
  });

  it('other moves\' rolls are not a discovery', () => {
    const seeds = { results: ['Space Sighting: A derelict'], names: [], context: 'undertake_an_expedition' };
    expect(planRequestsFromSeeds(seeds, 'nar-3')).toEqual([]);
  });

  it('a vow is asked what is really behind it, about the vow by its stable id', () => {
    const req = vowPlanRequest({ name: 'Free the Kessan miners', vowId: 'msg-vow-1' }, 'nar-4');
    expect(req).toMatchObject({ ref: 'plan-nar-4-vow', kind: 'vow', trigger: 'vow',
      label: 'what is really behind the vow "Free the Kessan miners"',
      subject: { type: 'vow', id: 'msg-vow-1', name: 'Free the Kessan miners' } });
    expect(req.oracleSeeds).toEqual([expect.stringMatching(/^What is behind it — Action \+ Theme: \S.* \/ \S/)]);
    expect(vowPlanRequest({ name: '  ' }, 'nar-5')).toBeNull();
  });
});

describe('issue #353 Phase 4 — when a vow\'s plan is in play', () => {
  const vowPlan = normaliseSkeleton({ id: 'sk-vow', kind: 'vow', truth: 'The miners are the bait.',
    subject: { type: 'vow', id: 'msg-vow-1', name: 'Free the Kessan miners' }, sceneId: 'sc-old' });

  it('while its vow is the one this scene serves — by the vow\'s id, or its name', () => {
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', sceneVow: { id: 'msg-vow-1', name: 'Kessan' } })).toHaveLength(1);
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', sceneVow: { id: null, name: 'Free the Kessan Miners' } })).toHaveLength(1);
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', sceneVow: { id: 'msg-vow-2', name: 'Find the lost ship' } })).toEqual([]);
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', sceneVow: null })).toEqual([]);
  });

  it('when the move fulfils it (its vow id among the tracks this beat ends), with several open', () => {
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', endingTrackIds: ['msg-vow-1'] })).toHaveLength(1);
  });

  it('when the fiction names it', () => {
    expect(selectRelevantSkeletons([vowPlan], { sceneId: 'sc-1', text: 'We swore to free the Kessan miners.' })).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On the table
// ─────────────────────────────────────────────────────────────────────────────

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table, {}, { connectionIds: [] }); });
afterEach(() => restore?.());

const lastCall = () => narrationCallsOf(table).at(-1);
const VANCE = { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' };
const vanceCard = () => table.actors.find(a => a.name === 'Vance Oduya' && a.flags?.[MODULE_ID]?.entityType === 'connection');

/** A Make a Connection hit auto-creates Vance, as the capture of narration `narrationId`. */
async function autoCreateVance(narrationId = 'nar-meet') {
  const { routeEntityDrafts } = await gmOf(table).import('../../src/entities/entityExtractor.js');
  await onGm(table, () => routeEntityDrafts([VANCE], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: true, narrationId }));
}

describe('issue #353 Phase 4 — a connection made gets an agenda plan', () => {
  it('Make a Connection\'s auto-create: an agenda about the new card, its rolls waiting to be decided', async () => {
    await autoCreateVance();
    const card = vanceCard();
    expect(card).toBeTruthy();
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'npcAgenda', truth: '', narrationId: 'nar-meet',
      subject: { type: 'entity', id: card.id, name: 'Vance Oduya' },
      createdFrom: { trigger: 'make_a_connection', narrationId: 'nar-meet' }, sceneId: 'sc-1', sessionId: 's-1' });
    expect(plan.oracleSeeds.at(-1)).toMatch(/^What they hide — Action \+ Theme: \S.* \/ \S/);
    expect(plan.oracleSeeds.some(l => /^Character Disposition: /.test(l))).toBe(true);
  });

  it('the next narration they are in decides it', async () => {
    await autoCreateVance();
    const [pending] = plansOf(table);
    table.replies = (call) => {
      const decide = call.system.includes(`- id ${pending.id}: NPC agenda — Vance Oduya.`);
      return { prose: 'Vance counts the crates twice.', sidecar: { newTruths: [], stateChanges: [],
        ...(decide ? { plans: [{ id: pending.id, truth: 'Vance skims the relief cargo for the Hollow Syndicate.',
          wants: 'To keep the dock books clean.', clues: ['A second ledger'] }] } : {}) } };
    };
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vance about the missing crates.' }));
    expect(lastCall().system).toContain('### DECIDE NOW');
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ truth: 'Vance skims the relief cargo for the Hollow Syndicate.',
      wants: 'To keep the dock books clean.' });
  }, 40_000);

  it('a confirmed NPC draft gets one too', async () => {
    const gm = gmOf(table);
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts([VANCE], game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false }));
    await table.settle();
    const draft = table.cards(f => f.draftEntityCard)[0];
    gm.click(draft._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(vanceCard()).toBeTruthy();
    expect(plansOf(table)).toEqual([expect.objectContaining({ kind: 'npcAgenda',
      subject: expect.objectContaining({ type: 'entity', id: vanceCard().id }),
      createdFrom: expect.objectContaining({ trigger: 'connection_confirmed' }) })]);
  }, 40_000);

  it('one plan an NPC; only the canonical GM files one; none with the skeleton off', async () => {
    await autoCreateVance();
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const record = { _id: 'conn-again', name: 'Vance Oduya', goal: 'Stay unnoticed' };
    expect(await onGm(table, () => secrets.planNpcAgenda(record))).toBeNull();
    expect(plansOf(table)).toHaveLength(1);

    const fromPat = await table.client('pl-1').import('../../src/world/secrets.js');
    expect(await table.client('pl-1').run(() => fromPat.planNpcAgenda({ _id: 'conn-2', name: 'Orla Teague' }))).toBeNull();

    await resetSkeletonTable(table, { narrativeSkeletons: false }, { connectionIds: [] });
    await autoCreateVance();
    expect(vanceCard()).toBeTruthy();
    expect(plansOf(table)).toEqual([]);
  }, 40_000);
});

describe('issue #353 Phase 4 — a vow sworn is asked what is behind it', () => {
  const VOW = { name: 'Free the Kessan miners', rank: 'dangerous', vowId: 'msg-vow-1' };

  async function swear(over = {}) {
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narrateAndPostVowSwearing({ vow: { ...VOW, ...over },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira' }));
  }

  it('its swearing scene decides it: a vow plan about the vow, by its id', async () => {
    table.replies = (call) => {
      const ref = call.system.match(/- id (plan-\S+-vow): Vow — what is really behind the vow "Free the Kessan miners"\./)?.[1];
      return { prose: 'Kira swears on the iron.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the Kessan miners\' captivity',
          truth: 'The miners were sold by their own union boss.', wants: 'To bury the sale.' }] } : {}) } };
    };
    await swear();
    expect(lastCall().system).toMatch(/Oracle: What is behind it — Action \+ Theme: /);
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'vow', truth: 'The miners were sold by their own union boss.',
      subject: { type: 'vow', id: 'msg-vow-1' }, createdFrom: { trigger: 'vow' } });
  }, 40_000);

  it('no scene (switched off): its roll is filed for a later narration to decide', async () => {
    await resetSkeletonTable(table, { vowSwearingNarration: false }, { connectionIds: [] });
    await swear();
    expect(narrationCallsOf(table)).toEqual([]);
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'vow', truth: '', subject: { type: 'vow', id: 'msg-vow-1', name: 'Free the Kessan miners' },
      createdFrom: { trigger: 'vow' } });
    expect(plan.oracleSeeds).toEqual([expect.stringMatching(/^What is behind it — Action \+ Theme: /)]);
  });

  it('the plan of the vow the scene serves (here the only vow in play) is in play every beat — the next narration decides it', async () => {
    await resetSkeletonTable(table, { vowSwearingNarration: false }, { connectionIds: [] });
    await swear();
    const [pending] = plansOf(table);
    const kira = table.actors.get('pc-kira');
    kira.items.contents.push({ id: 'vow-kira', name: 'Free the Kessan miners', type: 'progress',
      system: { subtype: 'vow', rank: 2, progress: 0, completed: false }, flags: { [MODULE_ID]: { vowId: 'msg-vow-1' } } });
    const { invalidateActorCache } = await gmOf(table).import('../../src/character/actorBridge.js');
    gmOf(table).run(() => invalidateActorCache('pc-kira'));
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I check the reactor.' }));
    expect(lastCall().system).toContain(`- id ${pending.id}: Vow — Free the Kessan miners.`);
  }, 40_000);
});

describe('issue #353 Phase 4 — a discovery\'s meaning is kept', () => {
  it('the narration of a Make a Discovery decides what its find means', async () => {
    const seeds = { results: ['Discovery descriptor and focus: Ancient / Engine', 'Make a Discovery: A working precursor drive'],
      names: [], context: 'make_a_discovery' };
    table.replies = (call) => {
      const ref = call.system.match(/- id (plan-\S+-find): Discovery — the discovery this move makes\./)?.[1];
      return { prose: 'The drive hums awake.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the precursor drive', truth: 'It is a beacon, not a drive.' }] } : {}) } };
    };
    await narrateMoveOn(table, moveResolution({ moveId: 'make_a_discovery', moveName: 'Make a Discovery',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', oracleSeeds: seeds }));
    expect(lastCall().system).toContain('Oracle: Discovery descriptor and focus: Ancient / Engine; Make a Discovery: A working precursor drive.');
    expect(plansOf(table)).toEqual([expect.objectContaining({ kind: 'discovery', truth: 'It is a beacon, not a drive.',
      subject: expect.objectContaining({ name: 'the precursor drive' }), createdFrom: expect.objectContaining({ trigger: 'make_a_discovery' }) })]);
  }, 40_000);
});

describe('issue #353 Phase 4 — what the GM\'s "has a plan" markers read', () => {
  it('plannedSubjects gives the panels subject ids and names only', async () => {
    await autoCreateVance();
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const subjects = gmOf(table).run(() => secrets.plannedSubjects());
    expect([...subjects.ids]).toEqual([vanceCard().id]);
    expect(subjects.names).toEqual(['Vance Oduya']);
    expect(Object.keys(subjects).sort()).toEqual(['ids', 'names']);
  }, 40_000);
});
