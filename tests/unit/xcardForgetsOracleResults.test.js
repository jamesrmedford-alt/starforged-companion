/**
 * STARFORGED COMPANION
 * tests/unit/xcardForgetsOracleResults.test.js
 *
 * Issue #345 AA01 XCARD-ORACLE-MEMORY-KEPT (SAFETY) — the twelfth audit's
 * NARR-2 and CONT-4 probes, with the Pay the Price half of the row added.
 *
 * The X-Card's "full exclusion" (decisions.md → issue #321 U07) takes the
 * narration it answers out of every narrator-memory store. RECENT ORACLE
 * RESULTS ([3b], `campaignState.recentOracles`) was not one of them: an
 * `!oracle` answer (or a `!pay-the-price` result) is ringed by the canonical
 * GM's capture hook, its follow-up narration tells it, and when the table
 * X-Cards that narration every later prompt of the session still listed the
 * answer under "The dice established these outcomes. Your narration must not
 * contradict them — build on what the oracle answered", beside the X-CARD —
 * REDIRECT block that says the beat did not happen. The same held for a move
 * narration depicting the Pay the Price its miss paid (the price's entry
 * carries the move's `resolutionId`, issue #342 Z11).
 *
 * Fixed: each ring entry carries the id of the card it came from (`cardId`),
 * the follow-up's card names that card (`oracleCardId`), and
 * applyXCardToNarratorMemory drops the entries the X-carded cards told — by
 * card id, and by a move narration's (or a round card's entries')
 * `resolutionId` — in the same write as the pause.
 *
 * Controls: with no X-Card the next narration is told the answer; an X-Card on
 * a narration that told none of them leaves the ring alone.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'chat, no move',
});

let table;
const world = () => table.world.campaignState();

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

// ── NARR-2: a paced line after the resume ───────────────────────────────────

describe('issue #345 AA01 — the X-Card on an oracle\'s narration takes its answer out of RECENT ORACLE RESULTS (paced line)', () => {
  const QUESTION = 'Is the captain still alive';
  const LINE = 'I lean against the bulkhead and wait for the others.';

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    scriptClaude(table, {
      fallback: (call) => {
        if (/pacing pre-classifier/.test(call.system)) return NARRATIVE;
        if (call.model === NARRATION_MODEL) {
          return /The player invoked the oracle/.test(call.userText ?? '')
            ? 'The captain lies still in the wreckage, a dark stain spreading.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
            : 'The bulkhead hums against your back.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
        }
        return '{}';
      },
    });
  });

  const followUps   = () => table.cards(f => f.oracleNarrationCard === true);
  const pacedCall   = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /No move was rolled/.test(c.userText ?? '')).at(-1);
  const oracleBlock = (system) => (String(system ?? '').split('\n\n---\n\n').find(s => s.startsWith('## RECENT ORACLE RESULTS')) ?? '');

  async function askOracleAndNarrate() {
    await table.client('pl-1').chat(`!oracle yes ${QUESTION}?`);
    await table.settle(); await table.drain();
    // Setup: the answer reached oracle memory, and the GM narrated it.
    expect((world().recentOracles ?? []).map(e => e.question)).toContain(`${QUESTION}?`);
    expect(followUps()).toHaveLength(1);
  }

  it('after the X-Card on the follow-up and a resume, the next narration is not told the dice established the removed answer', async () => {
    await askOracleAndNarrate();
    // The follow-up's card names the raw card whose result the ring holds.
    const raw = table.cards(f => f.oracleCommandCard === true && !!f.oracleMemory)[0];
    expect(followUps()[0].flags[MODULE_ID].oracleCardId).toBe(raw._id);
    expect((world().recentOracles ?? []).find(e => e.question === `${QUESTION}?`)?.cardId).toBe(raw._id);

    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    // Setup: the X-Card answered the oracle's narration.
    expect(table.world.message(followUps()[0]._id).flags[MODULE_ID].xCarded).toBe(true);
    expect((world().recentOracles ?? []).map(e => e.question)).not.toContain(`${QUESTION}?`);
    await table.client('gm-1').chat('!x clear');
    await table.settle(); await table.drain();

    await table.client('pl-1').chat(LINE);
    await table.settle(); await table.drain();

    const call = pacedCall();
    expect(call?.userText).toContain(LINE);
    expect(call.system).toContain('## X-CARD — REDIRECT');          // the redirect is there …
    expect(oracleBlock(call.system)).not.toContain(QUESTION);         // … and the removed beat's answer is not, "established"
  }, 60_000);

  it('control: with no X-Card, the next narration carries the answer in RECENT ORACLE RESULTS', async () => {
    await askOracleAndNarrate();

    await table.client('pl-1').chat(LINE);
    await table.settle(); await table.drain();

    const call = pacedCall();
    expect(call?.userText).toContain(LINE);
    expect(oracleBlock(call.system)).toContain(QUESTION);
    expect(call.system).not.toContain('## X-CARD — REDIRECT');
  }, 60_000);
});

// ── CONT-4: an @scene after the resume ──────────────────────────────────────

describe('issue #345 AA01 — the oracle answer of an X-carded beat is not "established" in later prompts (@scene)', () => {
  const QUESTION = 'Is the child dead?';
  const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' },
    } } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
    table.claude.respond((call) => {
      if (call.model !== NARRATION_MODEL) return '{}';
      if (/child/.test(call.userText)) {
        return 'The small body lies still beneath the collapsed bulkhead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
      }
      return 'The corridor hums.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    });
  });

  /** The oracle question and its narrated answer; returns the follow-up narration's card. */
  async function askTheOracle() {
    const dice = vi.spyOn(Math, 'random').mockReturnValue(0.05);   // d100 = 6: YES on "likely"
    try {
      await table.client('pl-1').chat(`!oracle yes likely ${QUESTION}`, { speaker: { actor: 'pc-pat' } });
      // A player's question first asks the GM's game for its odds (issue #354
      // P2-31), so the d100 is rolled a moment after the line is sent.
      await table.settle();
    } finally {
      dice.mockRestore();
    }
    expect((world().recentOracles ?? []).find(o => o.question === QUESTION)?.answer).toMatch(/^YES/);   // setup: rung
    const followups = table.world.messages().filter(m => m.flags?.[MODULE_ID]?.narratorCard && /small body/.test(m.flags[MODULE_ID].narrationText ?? ''));
    expect(followups).toHaveLength(1);                                                                 // setup: narrated
    return followups[0];
  }

  async function nextNarrationSystem() {
    const before = narrations().length;
    await table.client('gm-1').chat('@scene What do we see now?');
    await table.settle();
    const call = narrations().slice(before)[0];
    expect(call).toBeDefined();
    return call.system;
  }

  it('control: with no X-Card, the next narration is told the oracle answer', async () => {
    await askTheOracle();
    const system = await nextNarrationSystem();
    expect(system).toContain('## RECENT ORACLE RESULTS');
    expect(system).toContain(QUESTION);
  }, 60_000);

  it("after the X-Card on the oracle's narration, the redirect narration is not told to build on its answer", async () => {
    const followup = await askTheOracle();
    await table.client('pl-1').chat('!x');
    await table.settle();
    const nid = followup.flags[MODULE_ID].narrationId;
    const removed = table.world.messages().find(m => m.flags?.[MODULE_ID]?.narrationId === nid);
    expect(removed?.flags?.[MODULE_ID]?.xCarded).toBe(true);                       // setup: the beat was removed
    expect(world().xCardedNarrationIds).toContain(nid);
    await table.client('gm-1').chat('!x clear');
    await table.settle();

    const system = await nextNarrationSystem();
    expect(system).toContain('## X-CARD — REDIRECT');                               // setup: the post-resume narration
    const oracles = (system.split('## RECENT ORACLE RESULTS')[1] ?? '').split('\n## ')[0];
    expect(oracles, 'the removed beat\'s oracle answer, given as binding').not.toContain(QUESTION);
  }, 60_000);
});

// ── The Pay the Price a move narration told ─────────────────────────────────

describe('issue #345 AA01 — the X-Card on a move narration takes the Pay the Price it told out of RECENT ORACLE RESULTS', () => {
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
        sceneState: { bySubject: {}, sceneId: 'sc-1' }, recentOracles: [],
      },
    } } });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  });

  /** A result card on the canonical GM, ringed by its capture hook. */
  async function resultCard(oracleMemory, flags = {}) {
    await table.client('gm-1').run(() => ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>${oracleMemory.name}</strong></div>`,
      flags: { [MODULE_ID]: { ...flags, oracleMemory } },
    }));
    await table.settle(); await table.drain();
  }

  /** A narrator card on the canonical GM (as the move pipeline and a round post them). */
  async function narratorCard(flags) {
    await table.client('gm-1').run(() => ChatMessage.create({
      content: `<div class="sf-narration-prose">${flags.narrationText}</div>`,
      flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-2', ...flags } },
    }));
    await table.settle(); await table.drain();
  }

  const answers = () => (world().recentOracles ?? []).map(e => e.answer);

  async function playXCard() {
    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    expect(world().xCardActive).toBe(true);
  }

  it("a move narration depicting its miss's price: the price goes with it, an earlier oracle answer stays", async () => {
    // An answer nothing narrated (no follow-up), then the move's price and its narration.
    await resultCard({ name: 'Ask the Oracle (50/50)', question: 'Is the hatch sealed?', answer: 'YES' }, { oracleCommandCard: true });
    await resultCard({ name: 'Pay the Price', question: 'Face Danger', answer: 'A companion is hurt', resolutionId: 'res-9' }, { payThePriceCard: true });
    await narratorCard({ narrationText: 'The blade snaps; Ren cries out as the hatch slams on his hand.', narrationId: 'nar-move', resolutionId: 'res-9', moveId: 'face_danger', outcome: 'miss' });
    expect(answers()).toEqual(['YES', 'A companion is hurt']);   // setup: both rung

    await playXCard();
    expect(world().xCardedNarrationIds).toContain('nar-move');
    expect(answers()).toEqual(['YES']);
  }, 60_000);

  it("a Batch Mode round card: each entry's price goes with it", async () => {
    await resultCard({ name: 'Pay the Price', question: 'Strike', answer: 'You are separated', resolutionId: 'res-r1' }, { payThePriceCard: true });
    await resultCard({ name: 'Pay the Price', question: 'Face Danger', answer: 'Your gear is damaged', resolutionId: 'res-r2' }, { payThePriceCard: true });
    await narratorCard({
      narrationText: 'The round goes badly for both of you.', narrationId: 'nar-round', roundId: 'round-1', roundNumber: 1,
      resolutionId: '',
      roundEntries: [
        { userId: 'pl-1', actorId: 'pc-kira', playerName: 'Kira', playerText: '', moveId: 'strike', outcome: 'miss', isMatch: false, resolutionId: 'res-r1' },
        { userId: 'gm-1', actorId: 'pc-ren', playerName: 'Ren', playerText: '', moveId: 'face_danger', outcome: 'miss', isMatch: false, resolutionId: 'res-r2' },
      ],
    });
    expect(answers()).toEqual(['You are separated', 'Your gear is damaged']);

    await playXCard();
    expect(answers()).toEqual([]);
  }, 60_000);

  it('control: an X-Card on a narration that told no ringed result leaves the ring alone', async () => {
    await resultCard({ name: 'Pay the Price', question: 'Face Danger', answer: 'A companion is hurt', resolutionId: 'res-9' }, { payThePriceCard: true });
    await narratorCard({ narrationText: 'The airlock cycles with a long sigh.', narrationId: 'nar-other', resolutionId: 'res-other', moveId: 'face_danger', outcome: 'strong_hit' });

    await playXCard();
    expect(world().xCardedNarrationIds).toContain('nar-other');
    expect(answers()).toEqual(['A companion is hurt']);
  }, 60_000);
});
