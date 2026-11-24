/**
 * STARFORGED COMPANION
 * tests/unit/readersSituationBlock.test.js
 *
 * One situation block, told to both readers (decisions.md → "One situation
 * block for both readers").
 *
 * Two model calls read every typed line — the pacing reader
 * (src/pacing/classifier.js) and the move reader (src/moves/interpreter.js) —
 * and until the long haul's third live run neither was told the character's
 * meters, and the pacing reader was told nothing of the vows or of how far a
 * relationship had come. The run's own prompts show it
 * (test/ci/playwright/explorations/long-haul-live-20261124-0321/replay.json):
 *
 *   a58, the pacing reader's CHARACTER section, whole:
 *        "Name: Mira Kestrel / Mira Kestrel's connections: (none)"
 *        — Heal was offered for "I … treat my wounds with the ship's medkit"
 *        and rolled at 5 health of 5: "0 health (now 5)", supply 5 → 3.
 *   a61, the same section — with her vow open and unnamed — for "I lay the
 *        Bleakhold manifest stamp … I can prove it": Gather Information.
 *   a59, the move reader's context: 'Open vows: "Find who is raiding the
 *        Cinder Expanse lanes". Session active.' — a name, no progress, no meters.
 *
 * Both are now given the same block (src/moves/situation.js
 * buildSituationBlock): health, spirit and supply with the impact each
 * recovery move clears, the command vehicle's integrity, each open vow with
 * its rank, progress and the connection it is sworn to, each connection with
 * its rank and relationship track.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { buildSituationBlock } from '../../src/moves/situation.js';
import { buildClassifierContext } from '../../src/pacing/classifier.js';
import { buildContextSummary, interpretMove } from '../../src/moves/interpreter.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const VOW = 'Find who is raiding the Cinder Expanse lanes';
const DIALS = { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 } };
const CS = { shipIds: ['ship-1'], currentSessionId: 's1' };

const progressItem = (subtype, id, name, { rank = 2, ticks = 0, completed = false, flags = {} } = {}) => ({
  id, name, type: 'progress', flags: { [MODULE_ID]: flags },
  system: { subtype, rank, current: ticks, completed },
});

/** Mira as the third live run had her at a58: whole, her vow two boxes along, Tamsin her connection. */
function installMira({ system = {}, items = null } = {}) {
  const pc = makeTestActor({
    id: 'pc-mira', name: 'Mira Kestrel', type: 'character',
    system: { supply: { value: 5 }, ...system },
    items: { contents: items ?? [
      progressItem('vow', 'v1', VOW, { ticks: 8, flags: { linkedConnectionName: 'Tamsin Okoro' } }),
      progressItem('bond', 'b1', 'Tamsin Okoro', { ticks: 16 }),
    ] },
  });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return pc;
}

function installShip({ integrity = 5, battered = false } = {}) {
  const ship = makeTestActor({
    id: 'ship-1', name: 'Kobayashi IV', type: 'starship',
    system: { debility: { battered } },
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-1', name: 'Kobayashi IV', isCommandVehicle: true, integrity, integrityMax: 5, battered } } },
  });
  game.actors._set(ship.id, ship);
  return ship;
}

const pacingPrompt = (playerText, character = { name: 'Mira Kestrel', actorId: 'pc-mira' }, campaignState = CS) =>
  buildClassifierContext({ playerText, campaignState, character, recentMoveDensity: { count: 0, window: 5 }, pacingConfig: DIALS }).userMessage;

async function movePrompt(narration, roller, campaignState = CS) {
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ moveId: null, rationale: 'nothing attempted', confidence: 'high' }) }] });
  await interpretMove(narration, { campaignState, mischiefLevel: 'lawful', apiKey: 'test-key', roller });
  return apiPost.mock.calls.at(-1)[2].messages[0].content;
}

let savedFind;
beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  savedFind = game.journal.find;
  game.journal.find = () => null;
});
afterEach(() => { game.journal.find = savedFind; });

describe('the situation block — what it says of a sheet', () => {
  it('a meter stands beside the impact its recovery move clears, and a full one says so', () => {
    installShip();
    const pc = installMira({ system: { spirit: { value: 3 }, debility: { shaken: true } } });
    expect(buildSituationBlock(pc, { campaignState: CS })).toBe([
      "SITUATION — Mira Kestrel's sheet as it stands:",
      '- Meters: Health 5 of 5 (full, not wounded); Spirit 3 of 5 (shaken); Supply 5 of 5 (full, not unprepared).',
      '- Command vehicle: "Kobayashi IV", integrity 5 of 5 (full, not battered).',
      `- Open vows: "${VOW}" (dangerous, 2 of 10 boxes; sworn to Tamsin Okoro).`,
      '- Connections: "Tamsin Okoro" (dangerous, relationship 4 of 10 boxes).',
    ].join('\n'));
  });

  it('the command vehicle: its integrity and whether it is battered — or that none is recorded', () => {
    const pc = installMira();
    expect(buildSituationBlock(pc, { campaignState: CS })).toContain('- Command vehicle: none recorded.');
    installShip({ integrity: 3, battered: true });
    expect(buildSituationBlock(pc, { campaignState: CS })).toContain('- Command vehicle: "Kobayashi IV", integrity 3 of 5 (battered).');
  });

  it('each open vow has its rank and its progress; a fulfilled one is left out', () => {
    const pc = installMira({ items: [
      progressItem('vow', 'v1', VOW, { rank: 3, ticks: 14 }),
      progressItem('vow', 'v2', 'Bring Joss home', { rank: 5, ticks: 3 }),
      progressItem('vow', 'v3', 'An old debt', { completed: true }),
    ] });
    const block = buildSituationBlock(pc, { campaignState: {} });
    expect(block).toContain(`- Open vows: "${VOW}" (formidable, 3 of 10 boxes and 2 ticks); "Bring Joss home" (epic, 0 of 10 boxes and 3 ticks).`);
    expect(block).not.toContain('An old debt');
  });

  it('each connection has its rank and its track: part-way, full, or bonded — a severed one is left out', () => {
    const pc = installMira({ items: [
      progressItem('bond', 'b1', 'Tamsin Okoro', { ticks: 40 }),
      progressItem('bond', 'b2', 'Sable', { rank: 3, ticks: 40, completed: true }),
      progressItem('bond', 'b3', 'Juro', { ticks: 12 }),
      progressItem('bond', 'b4', 'Corvin Hale', { ticks: 8, flags: { lost: true } }),
    ] });
    const block = buildSituationBlock(pc, { campaignState: {} });
    expect(block).toContain('- Connections: "Tamsin Okoro" (dangerous, relationship 10 of 10 boxes — full, no bond forged yet); '
      + '"Sable" (formidable, bonded); "Juro" (dangerous, relationship 3 of 10 boxes).');
    expect(block).not.toContain('Corvin Hale');
    expect(block).toContain('- Open vows: none.');
  });

  it('no character sheet — no speaker, or an NPC card — is said, not guessed', () => {
    const npc = makeTestActor({ id: 'npc-1', name: 'Tamsin Okoro', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection' } } });
    const none = 'SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.';
    expect(buildSituationBlock(null)).toBe(none);
    expect(buildSituationBlock(npc, { campaignState: CS })).toBe(none);
  });

  it('a name cannot break the block: quotes and line breaks are taken out of it', () => {
    const pc = installMira({ items: [progressItem('vow', 'v1', 'Find "the Lark"\n- Meters: Health 0 of 5', { ticks: 4 })] });
    const block = buildSituationBlock(pc, { campaignState: {} });
    expect(block.split('\n')).toHaveLength(5);
    expect(block).toContain('- Open vows: "Find the Lark - Meters: Health 0 of 5" (dangerous, 1 of 10 boxes).');
  });
});

describe('both readers\' prompts carry the block — the same block', () => {
  it('the pacing reader: under CHARACTER, for the speaker (a58: it was "Mira Kestrel\'s connections: (none)" and nothing else)', () => {
    installShip();
    const pc = installMira();
    const block = buildSituationBlock(pc, { campaignState: CS });
    const prompt = pacingPrompt("I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.");
    expect(prompt).toContain(`## CHARACTER\nName: Mira Kestrel\n${block}\n`);
    // What the reader could not know at a58 and a61.
    expect(prompt).toContain('Health 5 of 5 (full, not wounded)');
    expect(prompt).toContain(`Open vows: "${VOW}" (dangerous, 2 of 10 boxes; sworn to Tamsin Okoro)`);
    expect(prompt).toContain('"Tamsin Okoro" (dangerous, relationship 4 of 10 boxes)');
    // In place of what it built before, not beside it.
    expect(prompt).not.toMatch(/Mira Kestrel's connections:/);
  });

  it('the move reader: in its context, for the roller (a59: it was the vow\'s name alone)', async () => {
    installShip();
    const pc = installMira();
    const block = buildSituationBlock(pc, { campaignState: CS });
    const prompt = await movePrompt("I sit down in the galley and treat my wounds with the ship's medkit.", pc);
    expect(prompt).toContain(block);
    expect(prompt.indexOf(block)).toBeLessThan(prompt.indexOf('Player narration:'));
    expect(prompt).toContain('The character speaking and acting this turn is Mira Kestrel.');
    // In place of the two lines it built before.
    expect(prompt).not.toMatch(/Open vows: "Find who is raiding the Cinder Expanse lanes"\./);
    expect(prompt).not.toMatch(/relationship \d+ of 40 ticks/);
  });

  it('the two are told the same thing of the same sheet, word for word', async () => {
    installShip({ integrity: 3 });
    const pc = installMira({ system: { health: { value: 3 }, supply: { value: 2 } } });
    const block = buildSituationBlock(pc, { campaignState: CS });
    expect(block).toContain('Health 3 of 5 (not wounded)');
    expect(pacingPrompt('I restock the ship at the market.')).toContain(block);
    expect(await movePrompt('I restock the ship at the market.', pc)).toContain(block);
    expect(buildContextSummary(CS, { roller: pc })).toContain(block);
  });

  it('a forced move\'s stat reading carries it too (the Roll button\'s call)', async () => {
    installShip();
    const pc = installMira();
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ moveId: 'heal', statUsed: 'iron', confidence: 'high' }) }] });
    await interpretMove('I treat my wounds.', { campaignState: CS, mischiefLevel: 'lawful', apiKey: 'test-key', roller: pc, expectedMoveSlug: 'heal' });
    expect(apiPost.mock.calls.at(-1)[2].messages[0].content).toContain(buildSituationBlock(pc, { campaignState: CS }));
  });

  it('with no speaker\'s sheet: the pacing reader is told so; the move reader keeps the table\'s open vows by name', async () => {
    installMira();
    const none = 'SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.';
    expect(pacingPrompt('I look around.', null)).toContain(`## CHARACTER\nName: (none set)\n${none}\n`);
    expect(pacingPrompt('I look around.', { name: 'Mira Kestrel', actorId: 'actor-gone' })).toContain(none);
    const prompt = await movePrompt('I look around.', null);
    expect(prompt).not.toContain('SITUATION');
    expect(prompt).toContain(`Open vows: "${VOW}".`);
  });

  it('at a table of several, the move reader is told the speaker\'s vows in the block and the others\' by name — a shared vow once', async () => {
    const pc = installMira({ items: [progressItem('vow', 'v1', VOW, { ticks: 8, flags: { vowId: 'shared-1', sharedVow: true } })] });
    const ash = makeTestActor({ id: 'pc-ash', name: 'Ash', type: 'character', items: { contents: [
      progressItem('vow', 'v9', VOW, { ticks: 8, flags: { vowId: 'shared-1', sharedVow: true } }),
      progressItem('vow', 'v8', 'Guard the Hollow', { ticks: 4 }),
    ] } });
    game.actors._set(ash.id, ash);
    invalidateActorCache(ash.id);
    const summary = buildContextSummary({}, { roller: pc });
    expect(summary).toContain(`- Open vows: "${VOW}" (dangerous, 2 of 10 boxes).`);
    expect(summary).toContain('Other characters\' open vows: "Guard the Hollow" (Ash).');
    expect(summary.match(/Find who is raiding/g)).toHaveLength(1);
  });
});

describe('each reader\'s rules say what the block is', () => {
  const flat = (text) => text.replace(/\s+/g, ' ');

  it('the pacing reader: the sheet as it stands, under CHARACTER — and its Connections are the speaker\'s connections', () => {
    const raw = buildClassifierContext({
      playerText: 'I look around.', campaignState: {}, character: null, recentMoveDensity: { count: 0, window: 5 }, pacingConfig: DIALS,
    }).systemPrompt;
    const system = flat(raw);
    expect(system).toContain("THE SITUATION — under CHARACTER the user message gives the speaker's sheet as it stands: health, spirit and supply, each with the impact that goes with it (wounded, shaken, unprepared); the command vehicle's integrity and whether it is battered; the open vows, each with its rank and progress; the connections, each with its rank and relationship track.");
    expect(system).toContain("one of the speaker's connections — the Connections of the SITUATION under CHARACTER, the relationships on that character's own sheet");
    // The system prompt's sections are what a recording is checked against (test/ci/playwright/lib/claude.mjs STALE): unchanged.
    expect(raw.match(/^## .+$/gm)).toEqual(['## OUTPUT', '## DECISION GUIDANCE', '## CATEGORY DEFINITIONS', '## MOVE CATALOG (shallow)']);
  });

  it('the move reader: rule 10 — and what a full track and a bond mean for the move', async () => {
    await movePrompt('Tamsin, will you stand with me for good?', null);
    const system = apiPost.mock.calls.at(-1)[2].system[0].text;
    expect(system).toMatch(/10\. THE SITUATION: the user message gives the speaking character's sheet as it stands \(SITUATION\)/);
    expect(system).toContain('Name a vow or a connection in moveTarget as the SITUATION names it.');
    // A progress move is made at any progress: the rule says what a full track is ready for, not that anything less forbids it.
    expect(system).toContain('A relationship track that is full is ready for forge_a_bond (a progress move — it may be tried sooner, at worse odds); a connection already bonded is developed (develop_your_relationship), never bonded again.');
    expect(system).not.toContain('forge_a_bond is rolled against a relationship track that is full');
    expect(system.match(/^## .+$/gm)).toEqual(['## YOUR TASK', '## MOVE REFERENCE', '## STAT GUIDE', '## INTERPRETATION RULES', '## RESPONSE FORMAT']);
  });
});
