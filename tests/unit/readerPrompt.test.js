/**
 * STARFORGED COMPANION
 * tests/unit/readerPrompt.test.js
 *
 * The line reader's prompt and call (src/moves/reader.js readLine) —
 * issue #384 — decisions.md → "Overhauls 1 and 4":
 *
 *   - the system prompt is the same bytes in every world and every mode, and
 *     carries nothing per call (one cache entry, kept an hour — D7);
 *   - the user message holds, in order, the mode, the speaker and the party,
 *     the SITUATION, POSSIBLE NOW / NOT NOW, a round's other actions, the
 *     Mischief framing (scoped to the move and stat), the recent scene and
 *     the line — and not the dials or the density (code applies them, D1);
 *   - the call: Sonnet 5.5, through the proxy as `lineReader`, one retry
 *     after a rate limit and none after anything else (D13); a failed call,
 *     a refusal or a reply cut short is a failed reading, never a throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { readLine, buildReaderSystemPrompt, buildReaderUserMessage, READING_MODES } from '../../src/moves/reader.js';
import { readLineSituation } from '../../src/moves/readerSituation.js';
import { availableMoves } from '../../src/moves/availability.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { READER_CATALOGUE } from '../../src/moves/readerCatalogue.js';

const MODULE_ID = 'starforged-companion';
const VOW = 'Find who is raiding the Cinder Expanse lanes';
const LINE = 'I slide the salvage rights across the counter. They are Tamsin\'s now.';

const progressItem = (subtype, id, name, { rank = 2, ticks = 0, completed = false } = {}) => ({
  id, name, type: 'progress', flags: { [MODULE_ID]: {} }, system: { subtype, rank, current: ticks, completed },
});
const reply = (body) => ({ content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn', usage: {} });
const DEVELOP = {
  move: 'develop_your_relationship', asked: false, risk: null, category: 'social', confidence: 'high',
  reason: 'Giving her the rights is giving her something of worth.', target: 'Tamsin Okoro', sceneChallenge: null, stat: null,
  healSituation: null, expeditionRank: null, combatRank: null, stakes: null, mischiefApplied: false, plainMove: null,
};

/** Two worlds that share nothing: a character, a sheet, a place, a scene. */
function worldMira() {
  const pc = makeTestActor({
    id: 'pc-mira', name: 'Mira Kestrel', type: 'character', system: { health: { value: 3 }, supply: { value: 5 }, debility: { wounded: true } },
    items: { contents: [progressItem('vow', 'v1', VOW, { ticks: 8 }), progressItem('bond', 'b1', 'Tamsin Okoro', { ticks: 16 })] },
  });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return { actorId: pc.id, campaignState: { currentSessionId: 's1', sceneFrame: { location: 'Tamsin Okoro\'s stall', present: ['Mira Kestrel', 'Tamsin Okoro'], situation: 'the ledger is open' } } };
}
function worldKarthik() {
  const pc = makeTestActor({ id: 'pc-karthik', name: 'Karthik Rao', type: 'character', items: { contents: [] } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return { actorId: pc.id, campaignState: { currentSessionId: 's9', xCardActive: true, api: { promptCachingEnabled: true } } };
}

let savedFind;
beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  savedFind = game.journal.find;
  game.journal.find = () => null;
  apiPost.mockResolvedValue(reply(DEVELOP));
});
afterEach(() => { game.journal.find = savedFind; vi.useRealTimers(); });

const sent = (i = -1) => apiPost.mock.calls.at(i);

describe('the system prompt: the same bytes for every call', () => {
  it('is byte-stable across two worlds and the three modes, and holds nothing of either world', async () => {
    const a = worldMira();
    await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k', mischiefLevel: 'balanced', recentScene: 'Tamsin looks up.' });
    const first = sent()[2].system[0].text;
    game.actors._reset();
    const b = worldKarthik();
    await readLine({ mode: READING_MODES.ROLL, text: 'I shove the hatch.', speakerActorId: b.actorId, campaignState: b.campaignState, apiKey: 'k' });
    await readLine({ mode: READING_MODES.CHOSEN, chosen: { moveId: 'face_danger' }, text: 'I shove the hatch.', speakerActorId: b.actorId, campaignState: b.campaignState, apiKey: 'k' });
    expect(sent(1)[2].system[0].text).toBe(first);
    expect(sent(2)[2].system[0].text).toBe(first);
    expect(first).toBe(buildReaderSystemPrompt());
    for (const perWorld of ['Mira', 'Karthik', 'Tamsin', 'Okoro', VOW, 'ledger', 's1', 's9', 'X-Card is active']) expect(first, perWorld).not.toContain(perWorld);
    // No dial, no date, no count that moves.
    expect(first).not.toMatch(/\d+\/10|\d{4}-\d{2}-\d{2}|PACING DIALS|density/i);
  });

  it('carries none of the readers\' plain-line test: no name of its world and no line of its list (the measure\'s answers stay out of the prompt)', () => {
    const list = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../test/ci/playwright/readers/plain-lines.json'), 'utf8'));
    const text = buildReaderSystemPrompt();
    // A word of a move's own name ("Reach", of Vigil Reach) is the game's, not the list's.
    const moveWords = new Set(READER_CATALOGUE.flatMap(g => g.moves).flatMap(m => m.name.split(/\W+/)));
    const names = [list.world.pc.name, list.world.ship?.name, list.world.sector.name, ...list.world.settlements.map(s => s.name),
      ...Object.values(list.contexts).flatMap(c => [c.state.connection?.name, c.state.vow?.name, ...(c.state.frame?.present ?? [])])]
      .filter(Boolean).flatMap(n => [n, ...n.split(/\s+/).filter(w => w.length >= 4 && /^[A-Z]/.test(w) && !moveWords.has(w))]);
    for (const name of new Set(names)) expect(text, name).not.toContain(name);
    for (const c of list.cases) expect(text, c.id).not.toContain(c.line);
  });

  it('opens on the role and its sections, in order, and names the three modes', () => {
    const text = buildReaderSystemPrompt();
    expect(text).toMatch(/^You are the line reader for an Ironsworn: Starforged tabletop RPG companion\./);
    const order = ['## HOW TO READ A LINE', '## WHAT HANGS ON IT (risk)', '## THE DIAL CATEGORIES (category)', '## THE MOVES', '## THE REPLY', '## THE MODES'];
    const at = order.map(h => text.indexOf(h));
    expect(at.every(i => i > 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(text).toContain('never decide whether the line is rolled, offered or narrated');
    for (const mode of ['READ THE LINE', 'A ROLL WAS ASKED FOR', 'THE MOVE IS CHOSEN']) expect(text).toContain(`- ${mode}:`);
    // The twelve rules.
    for (let n = 1; n <= 12; n += 1) expect(text, `rule ${n}`).toMatch(new RegExp(`^${n}\\. `, 'm'));
    // Asking for trust is named as talk; a deed for a connection needs nothing at risk; headway the scene bears out;
    // a line that names its move asks for it, everyday English included (issue #384, the first measure's mend).
    expect(text).toContain('asking for the relationship itself while it is still being built: to be trusted, to be friends, to count on each other, to be someone\'s contact');
    // ...but a lasting tie asked for with the track full is Forge a Bond, and a vow sworn in their service is Swear an Iron Vow.
    expect(text).toContain('when the SITUATION shows the relationship ready to forge (its track full) is forge_a_bond');
    expect(text).toContain('A vow sworn, in anyone\'s service, is swear_an_iron_vow');
    expect(text).toContain('A move with no roll needs nothing at risk — its trigger is the deed.');
    expect(text).toContain('reach_a_milestone is for headway the RECENT SCENE bears out');
    expect(text).toContain('A claim the scene contradicts, or that nothing in the scene supports');
    expect(text).toContain('it is fulfill_your_vow, not a milestone, whether or not the player says it is done');
    expect(text).toContain('even where the name is everyday English');
    // The reply leaves out what does not apply.
    expect(text).toContain('Leave out a key whose value would be null or false; always give move (null when the line sets about none), category, confidence and reason');
  });
});

describe('the call', () => {
  it('Sonnet 5.5, the 1300-token cap, through the proxy as lineReader, the system prompt cached an hour', async () => {
    const a = worldMira();
    const reading = await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'sk-test' });
    const [url, headers, body, opts] = sent();
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers).toMatchObject({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01' });
    expect(opts).toEqual({ label: 'lineReader' });
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 1300 });
    expect(body.system).toEqual([{ type: 'text', text: buildReaderSystemPrompt(), cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    expect(body.messages).toHaveLength(1);
    expect(body).not.toHaveProperty('thinking');   // api-proxy.js sends the model's own off form
    expect(reading).toMatchObject({ mode: 'open', moveId: 'develop_your_relationship', failed: null });
  });

  it('a world with prompt caching off sends no breakpoint', async () => {
    const a = worldMira();
    await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: { ...a.campaignState, api: { promptCachingEnabled: false } }, apiKey: 'k' });
    expect(sent()[2].system).toEqual([{ type: 'text', text: buildReaderSystemPrompt() }]);
  });

  it('the Balanced note is the system\'s second block, cached with the rules; Chaotic\'s rides with the line; a chosen move has none', async () => {
    const a = worldMira();
    await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k', mischiefLevel: 'balanced' });
    const balanced = sent()[2];
    expect(balanced.system).toHaveLength(2);
    expect(balanced.system[0]).toEqual({ type: 'text', text: buildReaderSystemPrompt(), cache_control: { type: 'ephemeral', ttl: '1h' } });
    expect(balanced.system[1].text).toMatch(/^## THE TABLE'S MISCHIEF — for every line read here\n\nINTERPRETATION NOTE: /);
    expect(balanced.system[1].text).toMatch(/It is about which move and stat; it never makes a move of a line that makes none\.$/);
    expect(balanced.system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(balanced.messages[0].content).not.toContain('INTERPRETATION NOTE');
    // Another line, the same note: the block is the same bytes, so the cache holds it.
    await readLine({ text: 'I lean on the clerk.', speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k', mischiefLevel: 'balanced' });
    expect(sent()[2].system[1].text).toBe(balanced.system[1].text);

    // Chaotic's heuristics are built from the line: they ride with it, uncached.
    await readLine({ text: 'I fix the panel quietly.', speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k', mischiefLevel: 'chaotic' });
    const chaotic = sent()[2];
    expect(chaotic.system).toHaveLength(1);
    expect(chaotic.messages[0].content).toContain('INTERPRETATION NOTE: You are playing the Trickster.');

    await readLine({ mode: READING_MODES.CHOSEN, chosen: { moveId: 'face_danger' }, text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k', mischiefLevel: 'balanced' });
    const chosen = sent()[2];
    expect(chosen.system).toHaveLength(1);
    expect(chosen.messages[0].content).not.toContain('INTERPRETATION NOTE');

    await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: { ...a.campaignState, api: { promptCachingEnabled: false } }, apiKey: 'k', mischiefLevel: 'balanced' });
    expect(sent()[2].system.map(b => b.cache_control)).toEqual([undefined, undefined]);
  });

  it('a rate limit is tried once more, five seconds later; another failure is not — each a failed reading, never a throw', async () => {
    const a = worldMira();
    vi.useFakeTimers();
    apiPost.mockRejectedValueOnce(new Error('Anthropic API error 429: rate limited')).mockResolvedValueOnce(reply(DEVELOP));
    const pending = readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k' });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).moveId).toBe('develop_your_relationship');
    expect(apiPost).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    apiPost.mockClear();
    apiPost.mockRejectedValueOnce(new Error('Anthropic API error 500: overloaded'));
    const failed = await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k' });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(failed).toMatchObject({ moveId: null, interpretation: null, failed: expect.stringMatching(/the reader's call failed: Anthropic API error 500/) });
    expect(getCapturedWarns().some(w => /line reader/.test(w))).toBe(true);
  });

  it('a refusal, a reply cut short, no key or an empty line is a failed reading', async () => {
    const a = worldMira();
    apiPost.mockResolvedValueOnce({ content: [], stop_reason: 'refusal' });
    expect((await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k' })).failed).toMatch(/declined/);
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"move": "develop_your_rel' }], stop_reason: 'max_tokens' });
    expect((await readLine({ text: LINE, speakerActorId: a.actorId, campaignState: a.campaignState, apiKey: 'k' })).failed).toBe('the reply was cut short');
    apiPost.mockClear();
    expect((await readLine({ text: LINE, campaignState: a.campaignState, apiKey: null })).failed).toBe('no Claude API key is set');
    expect((await readLine({ text: '  ', campaignState: a.campaignState, apiKey: 'k' })).failed).toBe('the line is empty');
    expect((await readLine({ mode: 'chosen', chosen: { moveId: 'tend_wounds' }, text: LINE, apiKey: 'k' })).failed).toBe('no move was chosen');
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('the user message', () => {
  const message = (args) => {
    const a = worldMira();
    const situation = readLineSituation(game.actors.get(a.actorId), { campaignState: a.campaignState });
    return buildReaderUserMessage({ text: LINE, situation, available: availableMoves(situation, { mode: args?.mode ?? 'open' }), recentScene: 'Tamsin looks up from the ledger.', ...args });
  };

  it('holds the mode, the speaker and the party, the SITUATION, POSSIBLE NOW / NOT NOW, the recent scene and the line — in that order', () => {
    const text = message();
    const order = ['MODE — READ THE LINE: say which move it sets about, if any.', 'SPEAKER — The character speaking and acting this turn is Mira Kestrel.',
      "SITUATION — Mira Kestrel's sheet as it stands:", 'POSSIBLE NOW', 'NOT NOW', 'RECENT SCENE (what the line follows', 'PLAYER LINE'];
    const at = order.map(h => text.indexOf(h));
    expect(at.every(i => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(text).toContain('Other player characters: none.');
    expect(text).toContain('- Meters: Health 3 of 5 (wounded); Spirit 5 of 5 (full, not shaken); Supply 5 of 5 (full, not unprepared).');
    expect(text).toContain('- Scene — where: Tamsin Okoro\'s stall; present: Mira Kestrel, Tamsin Okoro; now: the ledger is open.');
    expect(text).toContain('- develop_your_relationship, test_your_relationship — "Tamsin Okoro"');
    expect(text).toContain('- hearten — spirit 5 of 5, full, not shaken: nothing to recover');
    expect(text).toContain('Tamsin looks up from the ledger.');
    expect(text.endsWith(`PLAYER LINE\n"${LINE}"`)).toBe(true);
    // Code applies the dials and the density: the reader is told neither.
    expect(text).not.toMatch(/PACING DIALS|RECENT MOVE DENSITY|\d+\/10/);
  });

  it('the Mischief framing, in the open and roll modes, says it never makes a move of a line that makes none', () => {
    const framing = 'INTERPRETATION NOTE: You are allowed to occasionally interpret this narration in a slightly unexpected way.';
    expect(message({ mischiefFraming: framing })).toContain(`${framing} It is about which move and stat; it never makes a move of a line that makes none.`);
    expect(message({ mischiefFraming: framing, mode: 'chosen', chosen: { moveId: 'face_danger' } })).not.toContain('INTERPRETATION NOTE');
    expect(message({ mischiefFraming: null })).not.toContain('INTERPRETATION NOTE');
  });

  it('a roll asked for: its mode line, and NOT NOW names only what cannot be rolled at all', () => {
    const text = message({ mode: 'roll' });
    expect(text.startsWith('MODE — A ROLL WAS ASKED FOR: choose the move that fits it best; never no move.')).toBe(true);
    const not = text.slice(text.indexOf('NOT NOW'), text.indexOf('RECENT SCENE'));
    expect(not).toContain('no scene challenge is open (face_danger, secure_an_advantage instead)');
    expect(not).not.toContain('hearten');
    expect(not).not.toContain('no fight is open');
  });

  it('POSSIBLE NOW lists only what it has something to say of: every other move of THE MOVES goes without saying', () => {
    const text = message();
    expect(text).toContain('POSSIBLE NOW — every move of THE MOVES but those named after this list, and these as told:');
    expect(text).not.toContain('Any time');
    const possible = text.slice(text.indexOf('POSSIBLE NOW'), text.indexOf('\nNOT NOW'));
    for (const id of ['face_danger', 'gather_information', 'set_a_course', 'pay_the_price']) expect(possible, id).not.toContain(id);
    expect(possible).toContain('- develop_your_relationship, test_your_relationship — "Tamsin Okoro"');
  });

  it('a chosen move: its id, its name and its own text, and no availability', () => {
    const text = message({ mode: 'chosen', chosen: { moveId: 'face_danger' }, canonicalBlock: '<canonical_move>\nWhen you attempt something risky…\n</canonical_move>' });
    expect(text.startsWith('MODE — THE MOVE IS CHOSEN: face_danger (Face Danger), by a card the table pressed. Read its stat, target and stakes from the line; never another move.\n<canonical_move>')).toBe(true);
    expect(text).not.toContain('POSSIBLE NOW');
  });

  it('a Batch Mode round: the other actions already submitted, for context', () => {
    const text = message({ round: [{ name: 'Karthik Rao', text: 'I cover the "hatch" while she works.' }, { name: '', text: 'nobody' }] });
    expect(text).toContain('ROUND — Other actions already submitted this round (context only; read this player\'s action):\n- Karthik Rao: "I cover the \'hatch\' while she works."');
    expect(text).not.toContain('nobody');
    expect(message()).not.toContain('ROUND —');
  });

  it('no player character behind the line: said, not guessed', () => {
    const situation = readLineSituation(null, { campaignState: {} });
    const text = buildReaderUserMessage({ text: 'The hatch groans.', situation });
    expect(text).toContain('SPEAKER — no player character is known behind this line.');
    expect(text).toContain('SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.');
  });
});
