/**
 * NARP-04 · SECTOR-STUB-PERSPECTIVE-PER-CALL (INCOMPLETE-FIX of issue #348 PT03)
 *
 * Scenario: Perspective is "Auto". Begin a Session runs with one player at the
 * table, so the session's perspective is recorded as second person
 * (lifecycle.js beginSession → campaignState.sessionPerspective). A second
 * window or player then connects mid-session — PT03's own trigger — and the GM
 * creates a sector: the Sector Creator writes the sector's and each
 * settlement's description with generateNarratorStubs.
 *
 * Correct (decisions.md → PT03: "Auto is decided once per session, at Begin a
 * Session … kept until the next session is minted"; the stub's own contract,
 * issue #326 W73: "the narration's own perspective — `auto` resolved as the
 * narrator resolves it"): the stubs are written in the session's perspective —
 * second person, like every narration of that session.
 *
 * Today: narratorPrompt.js resolveNarrationPerspective only honours the
 * session's perspective when its caller passes `sessionPerspective`
 * (buildNarratorSystemBlocks and the spotlight do). sectorGenerator.js calls
 * `resolveNarrationPerspective(narratorSettings.perspective ?? "auto")` with
 * nothing, so it counts the connected users at that moment: the stored Sector
 * Record and settlement descriptions say "refer to the characters by name,
 * never as 'you'" in a session whose narration says "you".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const calls = vi.hoisted(() => []);
vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body.messages[0].content);
    return { content: [{ type: 'text', text: 'The station turns slowly over the ice.' }], stop_reason: 'end_turn' };
  }),
}));

import { generateNarratorStubs } from '../../../src/sectors/sectorGenerator.js';
import { beginSession } from '../../../src/session/lifecycle.js';
import { buildNarratorSystemBlocks } from '../../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

const sector = {
  id: 's1', name: "Devil's Maw", region: 'outlands', regionLabel: 'Outlands',
  trouble: 'Ships regularly go missing', faction: null,
  settlements: [{ id: 'st1', name: 'Bleakhold', locationType: 'orbital', population: 'Hundreds', authority: 'Fair', projects: ['Mining'], firstLook: [], planet: null }],
};

const SOLO  = [{ id: 'gm', isGM: true, active: true }, { id: 'p1', isGM: false, active: true }];
const JOINED = [...SOLO, { id: 'p2', isGM: false, active: true }];

let savedUsers;
beforeEach(() => {
  calls.length = 0;
  savedUsers = game.users;
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
});
afterEach(() => { game.users = savedUsers; });

/** Begin a Session with one player at the table: the session's Auto perspective is recorded — second person. */
function beginSolo() {
  game.users = SOLO;
  const cs = beginSession({ currentSessionId: 'sess-1', sessionNumber: 2, sessionActive: false });
  game.settings._store.set(`${MODULE_ID}.campaignState`, cs);
  return cs;
}

describe('NARP-04 — sector stubs are written in the session\'s perspective', () => {
  it('control: the session began solo — Auto was recorded as second person', () => {
    const cs = beginSolo();
    expect(cs.sessionPerspective).toEqual({ sessionId: 'sess-1', perspective: 'second_person' });
  });

  it('control: after a second player connects, the narrator still narrates the session in second person (PT03)', () => {
    const cs = beginSolo();
    game.users = JOINED;
    const { mode } = buildNarratorSystemBlocks(cs, { narrationPerspective: 'auto' }, null, '', { mode: 'paced_narrative' });
    expect(mode).toContain('Address the player character directly as "you"');
  });

  it('control: with nobody else connected the stubs are second person', async () => {
    beginSolo();
    await generateNarratorStubs(sector, { perspective: 'auto', tone: 'wry' });
    expect(calls).toHaveLength(2);
    for (const prompt of calls) expect(prompt).toMatch(/second person/i);
  });

  it('a second player connects mid-session, then a sector is created: its stubs are second person too', async () => {
    beginSolo();
    game.users = JOINED;   // a second window or player connects after Begin a Session
    // What sectorPanel.js getNarratorSettings passes for the "Auto" setting.
    await generateNarratorStubs(sector, { perspective: 'auto', tone: 'wry' });
    expect(calls).toHaveLength(2);   // the sector's stub and Bleakhold's
    const perspectives = calls.map(p => (/Narrate in third person/i.test(p) ? 'third_person' : /Narrate in second person/i.test(p) ? 'second_person' : 'none'));
    expect(perspectives).toEqual(['second_person', 'second_person']);
  });
});
