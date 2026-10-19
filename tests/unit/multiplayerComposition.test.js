/**
 * STARFORGED COMPANION
 * tests/unit/multiplayerComposition.test.js
 *
 * Composition tests (issue #282 item 4): the fixture state comes from the real
 * producer, on the client that produces it, and is observed at the real
 * consumer, on the client that consumes it — on a booted multi-client table
 * (tests/helpers/multiClient.js). rules/reachability.md → "Composition test".
 *
 * Each unit suite on either side of these hops hand-sets the field it reads or
 * asserts on the field it writes; none of them can see the hop itself. That is
 * where the produced-but-dead family lives — the session recap's "A match was
 * rolled" line read a narrator-card flag no code wrote, behind a green unit
 * suite, until this file was written.
 *
 *   producer (client)                       → consumer (client)
 *   Private Lines panel action (player)     → move narration prompt (GM)
 *   `!oracle` result card (player)          → move narration prompt (GM)
 *   `!truth set` (player, relayed)          → move narration prompt (GM)
 *   Take a Break "move on" (player)         → next action roll's adds (GM pipeline)
 *   move pipeline narrator card (GM)        → `!recap session` (GM)
 *   Claude key entered / cleared (GM)       → CLAUDE-policy command routing (all)
 *
 * The custom-oracle hop (`!oracle-add` on the GM → `!oracle <id>` on a player)
 * lives with the other `!oracle` routing tests in chatCommandRouting.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: Face Danger +iron, no pacing call, no confirm dialog, and
// three scripted dice inside the REAL resolveMove (challenge, challenge,
// action) — by default 3 / 4 / 6: a strong hit, no match.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
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
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35, 0.9];
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  resolveMove.mockClear();
});

/**
 * A player narrates an action; the canonical GM's pipeline resolves and
 * narrates it. Returns the move narration's Claude call — exactly one, on the GM.
 */
async function narrateMove(userId = 'pl-1', actor = 'pc-pat', text = 'I brace against the hull and push through the breach.') {
  const from = table.claude.calls.length;
  await table.client(userId).chat(text, { speaker: { actor } });
  await table.settle();
  const narration = table.claude.calls.slice(from).filter(c => c.model === NARRATION_MODEL);
  expect(narration.map(c => c.client)).toEqual(['gm-1']);
  return narration[0];
}

async function type(userId, text) {
  await table.client(userId).chat(text);
  await table.settle();
}

// ─────────────────────────────────────────────────────────────────────────────
// Into the GM's move narration prompt
// ─────────────────────────────────────────────────────────────────────────────

describe('what a player establishes reaches the GM\'s next move narration', () => {
  /**
   * Run one of the Companion Settings panel's own actions on a client — the
   * production writer of the client-scoped Private Lines.
   */
  async function panelAction(userId, action, { newPrivateLine = '', index = 0 } = {}) {
    const c = table.client(userId);
    const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
    const app = {
      element: parseHTML(`<input name="newPrivateLine" value="${newPrivateLine}">`),
      render() {},
    };
    const target = parseHTML('<button></button>').firstElementChild;
    target.dataset.index = String(index);
    await c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(app, null, target));
    await table.settle();
  }

  it('a Private Line a player adds in their settings panel is a hard stop in the GM\'s narration — and removing it lifts it', async () => {
    await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'spiders' });
    expect(table.client('pl-1').getSetting('privateLines')).toEqual(['spiders']);

    const first = await narrateMove('pl-2', 'pc-quinn');
    expect(first.system).toMatch(/### PRIVATE LINES[^\n]*\n- spiders/);

    await panelAction('pl-1', 'removePrivateLine', { index: 0 });
    const second = await narrateMove('pl-2', 'pc-quinn');
    expect(second.system).not.toContain('PRIVATE LINES');
    expect(second.system).not.toContain('spiders');
  });

  it('a player\'s !oracle answer is in the GM\'s next move narration as an established result', async () => {
    await type('pl-2', '!oracle yes likely is the hatch sealed');
    const answer = table.cards(f => f.oracleCommandCard)[0].flags[MODULE_ID].oracleMemory.answer;

    const call = await narrateMove();
    expect(call.system).toContain('## RECENT ORACLE RESULTS');
    expect(call.system).toContain(`- Ask the Oracle (likely): "is the hatch sealed" → ${answer}`);
  });

  it('a truth a player sets with !truth is binding in the GM\'s next move narration', async () => {
    await type('pl-2', '!truth set scene the hatch is welded shut');
    expect(world().sceneTruths).toMatchObject([{ fact: 'the hatch is welded shut', asserter: 'player' }]);

    const call = await narrateMove();
    expect(call.system).toMatch(/TRUTHS:\n {2}scene — the hatch is welded shut/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Into the GM's move pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('Take a Break → the next action roll', () => {
  it('one player moves on; the next action roll at the table — another player\'s — takes +1, once', async () => {
    table.client('pl-2').answerDialogs(d => d.choose('move_on'));
    await type('pl-2', '!break');
    expect(world().nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });

    await narrateMove('pl-1', 'pc-pat');
    await narrateMove('pl-1', 'pc-pat');
    expect(resolveMove.mock.calls.map(([interpretation]) => interpretation.adds)).toEqual([1, 0]);
    expect(world().nextMoveAdd).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Out of the GM's move pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('the move pipeline\'s narrator card → the session recap', () => {
  it('a match rolled in the session is named in !recap session', async () => {
    control.dice = [0.65, 0.65, 0.9];   // challenge 7 and 7 — a match
    await narrateMove();
    expect(table.cards(f => f.narratorCard).map(c => [c.author, c.flags[MODULE_ID].isMatch])).toEqual([['gm-1', true]]);

    await type('gm-1', '!recap session');
    const recap = table.cards(f => f.recapCard && f.recapType === 'session');
    expect(recap).toHaveLength(1);
    expect(recap[0].content).toContain('A match was rolled — Face Danger.');
  });

  it('without a match the recap says nothing about one', async () => {
    await narrateMove();
    await type('gm-1', '!recap session');
    const recap = table.cards(f => f.recapCard && f.recapType === 'session');
    expect(recap[0].content).toContain('1 move resolved.');
    expect(recap[0].content).not.toContain('A match was rolled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The keyed-GM registry → command routing
// ─────────────────────────────────────────────────────────────────────────────

describe('a GM entering or clearing their Claude key moves CLAUDE-policy commands', () => {
  it('keyless GMs: a keyed player\'s @scene runs on the player; the second GM keys up → on that GM; clears it → back', async () => {
    await table.setClaudeKey('gm-1', '');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    const callers = async (text) => {
      const from = table.claude.calls.length;
      await type('pl-1', text);
      return table.claude.calls.slice(from).map(c => `${c.client}:${c.apiKey}`);
    };

    expect(await callers('@scene what is behind the hatch?')).toEqual(['pl-1:sk-ant-pat']);

    await table.setClaudeKey('gm-2', 'sk-ant-gus');
    expect(table.world.getSetting('keyedGmUserIds')).toEqual(['gm-2']);
    expect(await callers('@scene who is on watch?')).toEqual(['gm-2:sk-ant-gus']);

    await table.setClaudeKey('gm-2', '');
    expect(table.world.getSetting('keyedGmUserIds')).toEqual([]);
    expect(await callers('@scene is anyone there?')).toEqual(['pl-1:sk-ant-pat']);
  });
});
