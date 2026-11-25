/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecordComposition.test.js — what the table does reaches the Session Log page (issue #382, slice 1)
 *
 * Composition (rules/reachability.md §3): the record's events come from the
 * real producers on a booted table — a player's typed line through the
 * canonical GM's chat hook and move pipeline, the narration card as it posts,
 * the sheet watch on the roller's momentum, `!truth` relayed to the GM, the
 * X-Card — and are read at the real consumer, the GM's Session Log page,
 * rendered from the record by the GM's own module copy. Nothing is hand-set
 * in the record.
 *
 *   producer (client)                              → consumer
 *   a typed line (player) → move → narration (GM)  → the page's "What happened"
 *   `!truth set` / strike / set again (player)      → standing truths, the name corrected (SESSION-LOG-KEEPS-OLD-NAMES)
 *   `!x` (player)                                    → the page and the stored flag hold nothing it removed (D3)
 *   a progress roll on the system's sheet (player)   → a move on the record (rolled outside the pipeline)
 *   `!bond` (player, rolled on their client)         → a move on the record, a miss too
 *   a typed line → move → narration (GM)            → the campaign recap's request (slice 2): the
 *                                                      player's words, the move, the change — no narration;
 *                                                      a sentence citing nothing is not kept
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline as multiplayerComposition.test.js runs it: Face Danger +iron,
// no pacing call, no confirm, three scripted dice in the real resolveMove —
// 3 / 4 / 6, a strong hit.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration,   // as the interpreter hands it on: the narration's ground (overhaul 2 §5.2)
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-1';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const LINE = 'I brace against the hull and push through the breach.';
// What the narration established, borne out by the player's line (overhaul 2 §5.2): it binds, and the page lists it.
const FACT = 'gives way to a push through the hull';
const PROSE = 'The hull plate buckles under your shoulder and the breach yawns open.';

let table;
const world = () => table.world.campaignState();
const sessionLogPage = () => table.journal.contents
  .find(j => j.name === JOURNAL_NAMES.sessionLog)?.pages.contents
  .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION || p.flags?.[MODULE_ID]?.sessionRecord?.sessionId === SESSION) ?? null;
const storedEvents = () => Object.values(sessionLogPage()?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {});

/** The GM's own render of the page (its module copy), once its record writes have landed. */
async function renderedPage() {
  const gm = table.client('gm-1');
  await table.settle();
  const { recordSettled } = await gm.import('../../src/record/record.js');
  await gm.run(() => recordSettled());
  const { renderSessionLog } = await gm.import('../../src/record/sessionLogView.js');
  await gm.run(() => renderSessionLog(SESSION));
  await table.settle();
  return sessionLogPage()?.text?.content ?? '';
}

beforeAll(async () => {
  table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35, 0.9];
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: SESSION, sessionStartedId: SESSION, sessionNumber: 3,
    currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 2, max: 10 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 } } });
  table.claude.respond((call) => (call.model === NARRATION_MODEL
    ? `${PROSE}\n\`\`\`json\n${JSON.stringify({ newTruths: [{ subject: 'the breach', fact: FACT, from: 'line' }], stateChanges: [] })}\n\`\`\``
    : undefined));
});

describe('a player\'s line, its move and its telling reach the Session Log page as one beat', () => {
  it('the record holds the line, the move, the momentum it paid and the narration; the page lists the player\'s words, the move, its outcome and the change — and no narration', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-pat' } });
    const body = await renderedPage();

    const kinds = storedEvents().map(e => e.k);
    expect(kinds).toEqual(expect.arrayContaining(['session.begun', 'line', 'move.resolved', 'sheet.changed', 'narration', 'truth.set']));
    const line = storedEvents().find(e => e.k === 'line');
    expect(line).toMatchObject({ text: LINE, who: { user: 'pl-1', actor: 'pc-pat' }, d: { via: 'typed' } });
    const move = storedEvents().find(e => e.k === 'move.resolved');
    expect(move.d).toMatchObject({ moveId: 'face_danger', outcome: 'strong_hit' });
    const change = storedEvents().find(e => e.k === 'sheet.changed' && e.d.what === 'momentum');
    expect(change).toMatchObject({ ref: { res: move.ref.res }, d: { from: 2, to: 3, cause: { kind: 'move', res: move.ref.res } } });

    expect(body).toContain('Kira');
    expect(body).toContain(LINE);
    expect(body).toMatch(/Face Danger \(\+iron\), strong hit/);
    expect(body).toMatch(/Momentum 2 → 3/);
    expect(body).toContain(FACT);                                         // established and standing
    expect(body).not.toContain('buckles under your shoulder');            // the chat has the narration
    // Nothing the record writes touches campaignState.
    expect(world()).not.toHaveProperty('sessionRecord');
  });
});

describe('a correction of a name reaches the page (known-issues SESSION-LOG-KEEPS-OLD-NAMES)', () => {
  it('`!truth strike` then `!truth set` of a ship\'s name: the page lists the truth under the new name, says it was corrected, and holds the old one nowhere but in the strike, as struck', async () => {
    await table.client('pl-1').chat('!truth set "raider cutter" is named the Ashen Wake');
    await table.settle();
    const first = world().sceneTruths.find(t => /Ashen Wake/.test(t.fact));
    expect(first).toBeTruthy();
    await table.client('pl-1').chat(`!truth strike ${first.id}`);
    await table.settle();
    await table.client('pl-1').chat('!truth set "raider cutter" is named the Cinder Wren');
    await table.settle();
    expect(world().nameChanges).toEqual([expect.objectContaining({ from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected' })]);

    const body = await renderedPage();
    expect(storedEvents().map(e => e.k)).toEqual(expect.arrayContaining(['truth.set', 'truth.struck', 'name.changed']));
    expect(body).toContain('is named the Cinder Wren');
    expect(body).toMatch(/A name was corrected: <strong>Cinder Wren<\/strong>/);
    // The strike stays as struck, the new name beside it (known-issues
    // STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME: it read "Struck: … is named the
    // Cinder Wren", the truth that stands) — the one place the old name is.
    const struck = '<li>Struck: raider cutter — <s>is named the Ashen Wake</s> (now: Cinder Wren)</li>';
    expect(body).toContain(struck);
    expect(body.replace(struck, '')).not.toMatch(/Ashen|Wake/);
  });
});

describe('the X-Card reaches the page and the stored record (decision D3)', () => {
  it('the removed narration\'s words and the truth it filed are on neither; the move and its momentum stay', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(JSON.stringify(sessionLogPage()?.flags)).toContain('buckles under your shoulder');   // setup: recorded

    await table.client('pl-1').chat('!x');
    const body = await renderedPage();

    const flag = JSON.stringify(sessionLogPage()?.flags?.[MODULE_ID]?.sessionRecord);
    expect(flag).not.toContain('buckles under your shoulder');
    expect(flag).not.toContain(FACT);
    expect(storedEvents().find(e => e.k === 'narration.removed')?.d).toMatchObject({ by: 'xcard' });
    expect(body).toMatch(/Face Danger \(\+iron\), strong hit/);
    expect(body).toMatch(/Momentum 2 → 3/);
    expect(body).toMatch(/removed by the table/);
    expect(body).not.toContain(FACT);
    expect(body).not.toContain(LINE);                                    // its line left with its telling
  });
});

describe('a move rolled outside the move pipeline is still a move on the record', () => {
  function nativeProgressCard({ source, value, dice, actorId }) {
    const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
    const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
  }

  it('a Fulfill Your Vow rolled on the system\'s sheet', async () => {
    table.addItem('pc-pat', { id: 'it-vow', name: 'Find the lost ark', type: 'progress', system: { subtype: 'vow', rank: 'dangerous', current: 40 } });
    const card = await table.client('pl-1').run(() => globalThis.ChatMessage.create({
      content: nativeProgressCard({ source: 'Find the lost ark', value: 10, dice: [1, 2], actorId: 'pc-pat' }),
      speaker: { actor: 'pc-pat', alias: 'Kira' },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    }));
    await renderedPage();
    const move = storedEvents().find(e => e.k === 'move.resolved');
    expect(move).toMatchObject({ who: { user: 'pl-1', actor: 'pc-pat' }, ref: { res: `native-${card.id}` },
      d: { moveId: 'fulfill_your_vow', rollKind: 'progress', progressScore: 10, challengeDice: [1, 2], outcome: 'strong_hit' } });
  });

  it('`!bond` — its dice from the card its author\'s client posted, a miss as much as a hit', async () => {
    control.dice = [];
    const random = vi.spyOn(Math, 'random');
    try {
      random.mockReturnValueOnce(0.0).mockReturnValueOnce(0.95).mockReturnValueOnce(0.95);   // action 1; challenge 10, 10
      await table.client('pl-1').chat('!bond troublesome', { speaker: { actor: 'pc-pat' } });
      await renderedPage();
    } finally {
      random.mockRestore();
    }
    const move = storedEvents().find(e => e.k === 'move.resolved');
    expect(move).toMatchObject({ who: { user: 'pl-1', actor: 'pc-pat' },
      d: { moveId: 'develop_your_relationship', outcome: 'miss', isMatch: true, actionDie: 1, challengeDice: [10, 10] } });
    expect(move.ref.res).toMatch(/^bond-/);
  });
});

describe('the campaign recap is a view of the record (slice 2)', () => {
  it('a move\'s beat reaches the recap\'s request: the player\'s sentence word for word, the move, its outcome and the momentum — and no sentence of the narration; an uncited sentence is not kept', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-pat' } });
    await renderedPage();
    const RECAP = { paragraphs: [[
      { text: 'Kira put a shoulder to the hull and pushed through the breach.', because: ['s3-1'] },
      { text: 'It was the point of it all.', because: [] },
    ]] };
    table.claude.respond((call) => (call.model === NARRATION_MODEL && /## THE RECORD/.test(call.userText ?? '')
      ? JSON.stringify(RECAP) : undefined));
    const gm = table.client('gm-1');
    const narrator = await gm.import('../../src/narration/narrator.js');
    const recap = await gm.run(() => narrator.getCampaignRecap(world(), { forceRefresh: true }));
    await table.settle();

    const request = table.claude.calls.filter(c => /## THE RECORD/.test(c.userText ?? '')).at(-1);
    expect(request?.client).toBe('gm-1');
    expect(request.userText).toContain(`the player wrote “${LINE}”`);
    expect(request.userText).toMatch(/Face Danger \(\+iron\), strong hit — Momentum 2 → 3/);
    expect(request.userText).toMatch(/## WHERE THINGS STAND[\s\S]*Kira — health 5, spirit 5, supply 5, momentum 3/);
    expect(request.userText).not.toContain('buckles under your shoulder');
    expect(recap).toBe('Kira put a shoulder to the hull and pushed through the breach.');
    expect(world().campaignRecapCache).toMatchObject({ text: recap, sourceHash: expect.any(String), cites: [[['s3-1']]] });
  });
});
