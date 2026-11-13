/**
 * STARFORGED COMPANION
 * tests/unit/lineTooShortToldNotDropped.test.js
 *
 * Issue #354 P2-05 — a line under ten characters is told to its author, not
 * dropped in silence.
 *
 * In the alpha 23 playtest an NPC offered "…or you will tell us you cannot";
 * the player typed "I cannot" (8 characters) and nothing happened for six
 * minutes: isPlayerNarration returned false for any line under ten
 * characters, with no notice and no log. "Yes", "No", "Run!" went the same
 * way. The maintainer's decision: the minimum stays (short table talk — "ok",
 * "lol" — must not be narrated), and the line's author is told it was not
 * sent, with the line back in their chat box.
 *
 * Production entry points: the predicates, and a player's typed line through
 * the chat hook on a simulated GM + player table.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ routed: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async ({ playerText }) => {
      control.routed.push(playerText);
      return { runMove: false, decision: 'NARRATIVE', suggestedMove: null };
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { isPlayerNarration, isLineTooShortForNarrator, MIN_NARRATION_LENGTH } from '../../src/index.js';

const line = (content, extra = {}) => ({ type: 'ic', content, author: { isGM: false, id: 'pl-1' }, flags: {}, ...extra });

describe('issue #354 P2-05 — isLineTooShortForNarrator', () => {
  it('"I cannot" is not sent to the narrator, and is recognised as too short', () => {
    expect(MIN_NARRATION_LENGTH).toBe(10);
    expect(isPlayerNarration(line('I cannot'))).toBe(false);
    expect(isLineTooShortForNarrator(line('I cannot'))).toBe(true);
    for (const text of ['Yes', 'No', 'Run!', 'Fire!', 'I agree', '<b>Go</b>']) {
      expect(isLineTooShortForNarrator(line(text)), text).toBe(true);
    }
  });

  it('a line of ten characters or more is narration, not "too short"', () => {
    expect(isPlayerNarration(line('I cannot go'))).toBe(true);
    expect(isLineTooShortForNarrator(line('I cannot go'))).toBe(false);
  });

  it('what was never narration is not "too short": commands, escapes, whispers, rolls, emotes, cards, nothing at all', () => {
    for (const text of ['!at x', '/r 1d6', '@scene', '\\ok', '', '   ', '...', '<p></p>']) {
      expect(isLineTooShortForNarrator(line(text)), JSON.stringify(text)).toBe(false);
    }
    expect(isLineTooShortForNarrator(line('ok', { whisper: ['gm-1'] }))).toBe(false);
    expect(isLineTooShortForNarrator(line('ok', { rolls: [{}] }))).toBe(false);
    expect(isLineTooShortForNarrator(line('ok', { style: 3 }))).toBe(false);
    expect(isLineTooShortForNarrator(line('ok', { type: 'ooc' }))).toBe(false);
    expect(isLineTooShortForNarrator(line('ok', { flags: { [MODULE_ID]: { narratorCard: true } } }))).toBe(false);
    expect(isLineTooShortForNarrator(line('Roll it', { flags: { [MODULE_ID]: { bypassPacing: true } } }))).toBe(false);
    expect(isLineTooShortForNarrator(line('ok', { flags: { 'foundry-ironsworn': {} } }))).toBe(false);
  });
});

let table;
afterEach(async () => { await table?.teardown(); table = null; control.routed = []; });

async function boot({ sessionActive = true, batch = false } = {}) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false, narratorSessionSummary: false,
      ...(batch ? { batchMode: true } : {}),
      campaignState: {
        ...CampaignStateSchema, currentSessionId: 'short-s1', sessionNumber: 2,
        sessionActive, sessionStartedId: sessionActive ? 'short-s1' : null,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], xCardActive: false,
      },
    } },
  });
  table.addActor({ id: 'pc-isaac', name: 'Isaac Sutton', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  await table.settle();
}

const notices = () => table.cards(f => f.lineTooShortNotice);

describe('issue #354 P2-05 — the author of a short line is told', () => {
  it('"I cannot" in a live session: one notice, whispered to its author alone, carrying the line back', async () => {
    await boot();
    await table.client('pl-1').chat('I cannot', { speaker: { actor: 'pc-isaac' } });
    await table.settle(); await table.drain();

    expect(control.routed, 'the line was not sent to the narrator').toEqual([]);
    const told = notices();
    expect(told, 'one notice — posted by the author\'s client, not once per client').toHaveLength(1);
    expect(told[0].whisper).toEqual(['pl-1']);
    expect(told[0].content).toMatch(/Not sent to the narrator/);
    expect(told[0].content).toMatch(/under 10 characters/);
    expect(told[0].flags[MODULE_ID]).toMatchObject({ restoreLineFor: 'pl-1', restoreLine: 'I cannot' });
  }, 60_000);

  it('control: the same answer with a word more is sent to the narrator, and nobody is told anything', async () => {
    await boot();
    await table.client('pl-1').chat('I cannot do that', { speaker: { actor: 'pc-isaac' } });
    await table.settle(); await table.drain();
    expect(control.routed).toEqual(['I cannot do that']);
    expect(notices()).toHaveLength(0);
  }, 60_000);

  it('before a session has begun nothing typed is narrated, so a short line posts no notice', async () => {
    await boot({ sessionActive: false });
    await table.client('pl-1').chat('ok', { speaker: { actor: 'pc-isaac' } });
    await table.settle(); await table.drain();
    expect(notices()).toHaveLength(0);
    expect(control.routed).toEqual([]);
  }, 60_000);
});
