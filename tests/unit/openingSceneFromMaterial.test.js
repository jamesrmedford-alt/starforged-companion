/**
 * STARFORGED COMPANION
 * tests/unit/openingSceneFromMaterial.test.js
 *
 * Issue #381, slice 1 — the session's opening scene is set where the last
 * session stopped and built from rolled material, and the fixed stock that
 * made two separate campaigns' openings one scene is gone from its prompt.
 *
 * What recurred, and the instruction that asked for it (the long haul's
 * second and third live runs, eight openings):
 *   - the galley, 7 of 8 — "Render a 4-6 sentence opening vignette set in the
 *     ship's galley";
 *   - one odd food or drink, 8 of 8 — "pick a specific food or drink";
 *   - the ship personified, 8 of 8 — "the ship itself as the absurd company:
 *     its noises, its habits, its small failures";
 *   - a last sentence in which a device or the ship sounds, 8 of 8 — "a line
 *     of dialogue, a question, or a small interruption", with nobody there to
 *     speak or ask.
 *   - and the third opening soaked apricots in the galley with a raider's
 *     boarding lock open beside the ship: told where the session stopped, it
 *     was still told to be "back aboard".
 *
 * The first half checks the message on hand-built input. The second runs the
 * real Begin a Session on the multi-client table with the scene's dice
 * scripted, and asserts where the hop ends: at the model call's user message
 * and at the posted card's flags and rendered line.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { installSceneDice } from '../helpers/scriptedDice.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { makeJournal } from '../helpers/fullStateFixture.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { buildGalleyVignetteUserMessage, composeOpeningScene } from '../../src/session/galleyVignette.js';
import { buildNarratorSystemBlocks, sidecarModeAddendum } from '../../src/narration/narratorPrompt.js';
import { normaliseSidecar, extractSidecar } from '../../src/factContinuity/sidecarParser.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';

const actor = (name, bio = '') => ({ id: `a-${name}`, name, type: 'character', system: { biography: bio } });
const mira = { active: [{ actor: actor('Mira Kestrel') }], absent: [] };
const SEEDS = [
  { slot: 'moment', label: 'What Mira Kestrel is doing in this lull', from: 'oracle', result: 'Bolster Debt', used: null,
    tables: [{ id: 'action', name: 'Action', roll: 14, result: 'Bolster' }, { id: 'theme', name: 'Theme', roll: 20, result: 'Debt' }],
    second: { tables: [{ id: 'action', name: 'Action', roll: 5, result: 'Inspect' }, { id: 'theme', name: 'Theme', roll: 6, result: 'Time' }], result: 'Inspect Time' } },
  { slot: 'eye', label: 'What the scene\'s eye rests on', from: 'oracle', result: 'Makeshift Container', used: null,
    tables: [{ id: 'descriptor', name: 'Descriptor', roll: 63, result: 'Makeshift' }, { id: 'focus', name: 'Focus', roll: 18, result: 'Container' }] },
];
const STOPPED = { text: 'The Ashen Wake is grappled alongside; her captain waits at the open hatch.', sessionNumber: 2 };

describe('the opening\'s message — the fixed stock is gone', () => {
  const messages = [
    buildGalleyVignetteUserMessage(mira, {}, { earlier: [], lastSession: STOPPED, seeds: SEEDS }),
    buildGalleyVignetteUserMessage(mira, {}, { earlier: [], seeds: SEEDS }),
    buildGalleyVignetteUserMessage({ active: [{ actor: actor('Kira') }], absent: [{ actor: actor('Ren', 'Fixes things with tape') }] }, {}, { earlier: [], seeds: SEEDS }),
  ];

  it('keeps the marker the call is found by, without the galley', () => {
    for (const msg of messages) expect(msg.split('\n')[0]).toBe('OPENING VIGNETTE — begin-session.');
  });

  it('names no galley, no food or drink, no talking ship, no interruption and no "specific and weird"', () => {
    for (const msg of messages) {
      expect(msg).not.toMatch(/galley/i);
      expect(msg).not.toMatch(/eating, drinking|pick a\s+specific food or drink|food or drink that fits/);
      expect(msg).not.toMatch(/ship itself as the absurd company|its noises, its\s+habits|The humour is the ship's/);
      expect(msg).not.toMatch(/a line of\s+dialogue, a question, or a small interruption/);
      expect(msg).not.toMatch(/specific and weird/);
      expect(msg).not.toMatch(/Render a 4-6 sentence opening vignette/);
    }
  });

  it('gives the scene its material, between where it is set and the earlier openings', () => {
    const msg = buildGalleyVignetteUserMessage(mira, {}, { earlier: [{ text: 'The kettle clicks.', title: null }], lastSession: STOPPED, seeds: SEEDS });
    expect(msg).toContain('1. What Mira Kestrel is doing in this lull — Action + Theme (14, 20): Bolster Debt');
    expect(msg).toContain('     (if that cannot be true here: Inspect Time)');
    expect(msg).toContain('2. What the scene\'s eye rests on — Descriptor + Focus (63, 18): Makeshift Container');
    expect(msg.indexOf('WHERE THE LAST SESSION STOPPED')).toBeLessThan(msg.indexOf('MATERIAL —'));
    expect(msg.indexOf('MATERIAL —')).toBeLessThan(msg.indexOf('EARLIER OPENINGS'));
  });

  it('ends by returning to what the last session left open — nothing new happens', () => {
    expect(messages[0]).toMatch(/Its last sentence returns to what that leaves open, as it stands\. Nothing new happens in this scene: the first move is the players'\./);
  });

  it('with nothing behind it, it stops with the first result unfinished', () => {
    expect(messages[1]).toMatch(/It stops with \(1\) unfinished\. Nothing new happens in this scene/);
    expect(messages[1]).toMatch(/No earlier session is on record\./);
    expect(messages[1]).not.toMatch(/WHERE THE LAST SESSION STOPPED/);
  });

  it('the length is the last thing it reads, and the tone override stays', () => {
    for (const msg of messages) {
      expect(msg.trimEnd().split('\n').slice(-2).join(' ')).toBe('Length: four to six sentences, about 110 words — never more than six sentences. Count them.');
      expect(msg).toMatch(/TONE OVERRIDE: regardless of any tone configured elsewhere, this\s+vignette is WRY \+ ABSURD/);
    }
  });

  it('an absent crewmate\'s business is the material\'s, not "specific and weird"', () => {
    expect(messages[2]).toMatch(/Absent crewmates \(referenced in banter, not present\):\n- Ren/);
    expect(messages[2]).toMatch(/speak, fondly, of what each absent crewmate is up to:\s+the MATERIAL says what, for each, and nothing else is made up for them\./);
  });
});

describe('where it is set — the last narration word for word, and the table\'s own word', () => {
  it('the last narration is told beside the summary, as the later word', () => {
    const msg = buildGalleyVignetteUserMessage(mira, {}, {
      earlier: [], seeds: SEEDS,
      lastSession: { ...STOPPED, lastNarration: 'PLAYER — Mira wrote: "I keep my hand on the lock."\nThe captain\'s voice comes over the open comm: come aboard.' },
    });
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 2, as its summary has it):');
    expect(msg).toMatch(/ITS LAST NARRATION, word for word — what the table last read \(where the two differ, this is the later word\):\nPLAYER — Mira wrote: "I keep my hand on the lock\."\nThe captain's voice comes over the open comm: come aboard\./);
  });

  it('with the summary off, the last narration alone says where the session stopped', () => {
    const msg = buildGalleyVignetteUserMessage(mira, {}, { earlier: [], seeds: SEEDS, lastSession: { text: '', lastNarration: 'You stand at the dock rail.' } });
    expect(msg).toMatch(/WHERE THE LAST SESSION STOPPED — ITS LAST NARRATION, word for word — what the table last read:\nYou stand at the dock rail\./);
    expect(msg).toMatch(/This opening picks the story up there, and nowhere later\./);
  });

  it('the table\'s own word outranks both, and the scene is set there and then', () => {
    const msg = buildGalleyVignetteUserMessage(mira, {}, { earlier: [], seeds: SEEDS, lastSession: STOPPED, pickUp: '  Three days later,\n docked at <b>Bleakhold</b>.  ' });
    expect(msg).toMatch(/WHERE AND WHEN THE TABLE PICKS UP — the table's own word, which outranks everything under it:\nThree days later, docked at Bleakhold \.\n\nThe scene is set there and then\./);
    expect(msg.indexOf('WHERE AND WHEN THE TABLE PICKS UP')).toBeLessThan(msg.indexOf('WHERE THE LAST SESSION STOPPED'));
    // What the last session left is still told — as what lies behind the table's word.
    expect(msg).toMatch(/That is what lies behind the table's word above/);
    expect(msg).not.toMatch(/picks the story up there, and nowhere later/);
  });
});

describe('composeOpeningScene — the one place that asks where the last session stopped, and rolls', () => {
  const card = (id, sessionId, text, extra = {}) => ({ id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId, ...extra } } });
  const state = { currentSessionId: 's-2', sessionNumber: 2 };
  let saved;
  beforeEach(() => { saved = game.messages; });
  afterEach(() => { game.messages = saved; });

  const dice = (faces) => {
    const queue = [...faces];
    return Object.assign(() => queue.shift(), { left: () => queue.length });
  };

  it('reads the last session\'s last two narrations from the cards — not its closing cutaway, a clock\'s beat or what the X-Card removed', async () => {
    game.messages = { contents: [
      card('m1', 's-1', 'You leave Hollow Spire.'),
      card('m2', 's-1', 'The Ashen Wake closes on your stern.', { playerText: 'I run for the lane.', playerName: 'Mira' }),
      card('m3', 's-1', 'Her grapples bite. The captain hails you: come aboard.'),
      card('m4', 's-1', 'A raider tells a joke nobody should hear.', { xCarded: true }),
      card('m5', 's-1', 'Far away, Tamsin counts coins.', { sessionVignetteCard: true, vignetteKind: 'npc_end' }),
      card('m6', 's-2', 'The Cinder Choir\'s signal grows.', { clockVignetteCard: true }),
    ] };
    const draw = dice([14, 20, 5, 6, 63, 18, 7, 8]);
    const { userMessage, seeds } = await composeOpeningScene(mira, state, { draw });

    expect(userMessage).toMatch(/WHERE THE LAST SESSION STOPPED — ITS LAST NARRATION, word for word — what the table last read:\nPLAYER — Mira wrote: "I run for the lane\."\nThe Ashen Wake closes on your stern\.\n\nHer grapples bite\. The captain hails you: come aboard\./);
    expect(userMessage).not.toMatch(/You leave Hollow Spire|Tamsin counts coins|Cinder Choir|nobody should hear/);
    // Something says where the scene is set: no place aboard is rolled.
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye']);
    expect(draw.left()).toBe(0);
  });

  it('with nothing behind it — no summary, no card — the dice say where aboard', async () => {
    game.messages = { contents: [] };
    const draw = dice([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30]);
    const { userMessage, seeds } = await composeOpeningScene(mira, state, { draw });
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye', 'place']);
    expect(userMessage).toContain('3. Where aboard the ship this is — Ship zone + area (40, 12): Galley or kitchen (Living)');
    expect(userMessage).toMatch(/the scene is set\s+aboard the ship, in the place the MATERIAL gives\./);
    expect(draw.left()).toBe(0);
  });

  it('the table\'s word is enough to place it: nothing is rolled for where', async () => {
    game.messages = { contents: [] };
    const draw = dice([14, 20, 5, 6, 63, 18, 7, 8]);
    const { seeds, userMessage } = await composeOpeningScene(mira, state, { draw, pickUp: 'On the dock at Bleakhold, an hour on.' });
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye']);
    expect(userMessage).toContain('On the dock at Bleakhold, an hour on.');
  });

  it('a narration of this session written before it began is told as that', async () => {
    game.messages = { contents: [card('m1', 's-2', 'Your father\'s ledger arrives by courier, unasked for.')] };
    const { userMessage } = await composeOpeningScene(mira, state, { draw: dice([14, 20, 5, 6, 63, 18, 7, 8]) });
    expect(userMessage).toMatch(/THE LAST NARRATION, word for word — written this session, before it began; what the table last read:\nYour father's ledger arrives/);
  });
});

describe('builtFrom — the fact block\'s key for a set-piece (narrator-memory invariant 2)', () => {
  it('the mode\'s addendum says how to write it, in the cached mode block and nowhere per call', () => {
    expect(sidecarModeAddendum('session_vignette')).toMatch(/your\s+JSON block MUST also carry "builtFrom": one entry for each numbered\s+result/);
    const blocks = buildNarratorSystemBlocks({}, {}, null, '', { mode: 'session_vignette' });
    expect(blocks.mode).toMatch(/## THE SCENE'S MATERIAL\n\nA session set-piece is built from the MATERIAL/);
    expect(blocks.standing).not.toMatch(/builtFrom/);
    expect(blocks.beat).not.toMatch(/builtFrom/);
    // Another mode's prompt says nothing of it.
    expect(buildNarratorSystemBlocks({}, {}, null, '', { mode: 'paced_narrative' }).mode).not.toMatch(/builtFrom/);
  });

  it('the parser keeps a well-formed account', () => {
    const { sidecar } = extractSidecar('Prose.\n```json\n{"newTruths":[],"stateChanges":[],"builtFrom":[{"n":1,"words":" counts the  debts "},{"n":"2","words":"a jar","second":true}]}\n```');
    expect(sidecar.builtFrom).toEqual([{ n: 1, words: 'counts the debts', second: false }, { n: 2, words: 'a jar', second: true }]);
  });

  it('…and reads garbage as no account', () => {
    for (const raw of [undefined, null, 'x', 7, {}, { n: 1, words: 'a' }]) expect(normaliseSidecar({ builtFrom: raw }).builtFrom).toEqual([]);
    expect(normaliseSidecar({ builtFrom: [null, 'x', [1, 'a'], {}, { n: 0, words: 'a' }, { n: 1.5, words: 'a' }, { n: -2, words: 'a' },
      { n: 99, words: 'a' }, { n: 1 }, { n: 1, words: '   ' }, { n: 1, words: 7 }, { n: 'one', words: 'a' }] }).builtFrom).toEqual([]);
    // A number named twice keeps its first entry; "second" is true only when it is true.
    expect(normaliseSidecar({ builtFrom: [{ n: 2, words: 'first', second: 'yes' }, { n: 2, words: 'again' }] }).builtFrom).toEqual([{ n: 2, words: 'first', second: false }]);
    // Bounded: twelve entries at most, a run of words cut at 160 characters.
    const many = Array.from({ length: 30 }, (_, i) => ({ n: (i % 12) + 1, words: 'w'.repeat(400) }));
    const kept = normaliseSidecar({ builtFrom: many }).builtFrom;
    expect(kept).toHaveLength(12);
    expect(kept[0].words).toHaveLength(160);
  });

  it('a block written bare, opening with builtFrom, is still the fact block and never prose', () => {
    const { prose, sidecar } = extractSidecar('She counts the debts.\n{"builtFrom":[{"n":1,"words":"counts the debts"}],"newTruths":[],"stateChanges":[]}');
    expect(prose).toBe('She counts the debts.');
    expect(sidecar.builtFrom).toEqual([{ n: 1, words: 'counts the debts', second: false }]);
  });
});

describe('the role — a set-piece is built from its material', () => {
  const role = buildNarratorSystemBlocks({}, {}, null, '', { mode: 'session_vignette' }).mode;

  it('says the user message gives the material, and to build the scene from it', () => {
    expect(role).toMatch(/gives its MATERIAL: results rolled for this scene on the game's oracles/);
    expect(role).toMatch(/Build the scene from the material\./);
    expect(role).toMatch(/OPENING — the player characters whose players are at the table, in a quiet moment inside the situation the last session left\. Nothing new happens in it\./);
  });

  it('the opening\'s stock is gone from it: no galley, no food, no talking ship, no "calm before"', () => {
    expect(role).not.toMatch(/galley/i);
    expect(role).not.toMatch(/Vivid specific food or activity|weird little details of life aboard/);
    expect(role).not.toMatch(/the humour is the ship's and the solitude's/);
    expect(role).not.toMatch(/the calm before/);
    expect(role).toMatch(/no crew is invented, present or absent/);
  });
});

// ── the real Begin a Session ────────────────────────────────────────────────

describe('Begin a Session — the opening\'s dice reach the prompt and the card', () => {
  const OPENING = 'Kira counts the debts on her fingers, twice over. On the shelf sits a jar with a taped lid.\n```json\n' + JSON.stringify({
    newTruths: [], stateChanges: [],
    sceneFrame: { location: 'Space off Bleakhold Station', present: ['Kira'], situation: 'Waiting at the open hatch' },
    builtFrom: [{ n: 1, words: 'counts the debts on her fingers' }, { n: 2, words: 'a jar with a rusted lid' }],
  }) + '\n```';

  let table;
  let dice;

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  afterEach(() => dice?.restore());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'os-s2',
        sessionNumber: 2, lastSessionTimestamp: new Date().toISOString(), safetyFlags: [],
        currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
      },
    } } });
    // LAST SESSION is read from the session record (issue #382): session 1's
    // Session Log page holds its story.
    const log = makeJournal(JOURNAL_NAMES.sessionLog);
    table.journal._set(log.id, log);
    await log.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Session 1', flags: { [MODULE_ID]: { sessionLogPage: {
      sessionId: 'os-s1', sessionNumber: 1, pageName: 'Session 1', createdAt: new Date(1).toISOString(),
      summary: { narrative: 'The Ashen Wake is grappled alongside off Bleakhold Station.', writtenAt: new Date(1).toISOString() },
    } } } }]);
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? OPENING : '{}') });
  });

  async function begin(client, fields = {}) {
    table.client(client).answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': true, ...fields }));
    await table.client(client).chat('!begin-session');
    await table.settle(); await table.drain();
  }
  const openingCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /^OPENING VIGNETTE/.test(c.userText ?? ''));
  const openingCard = () => table.world.messages().find(m => m.flags?.[MODULE_ID]?.vignetteKind === 'galley_begin');

  it('the player presses Begin; the canonical GM rolls once, and the prompt carries each result', async () => {
    // The last session's last narration, filed under it.
    await table.client('gm-1').run(() => ChatMessage.create({
      content: '<p>Her grapples bite.</p>',
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Her grapples bite. The captain hails you: come aboard.', sessionId: 'os-s1' } },
    }));
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1');

    const call = openingCall();
    expect(call, 'the opening was narrated').toBeTruthy();
    expect(call.client).toBe('gm-1');
    expect(call.userText).toContain('1. What Kira is doing in this lull — Action + Theme (14, 20): Bolster Debt');
    expect(call.userText).toContain('2. What the scene\'s eye rests on — Descriptor + Focus (63, 18): Makeshift Container');
    // Where the last session stopped: its summary, and its last narration from the card.
    expect(call.userText).toContain('The Ashen Wake is grappled alongside off Bleakhold Station.');
    expect(call.userText).toContain('Her grapples bite. The captain hails you: come aboard.');
    // So no place aboard was rolled: eight dice, and all of them the script's.
    expect(dice.drawn).toHaveLength(8);
    // The material is per call: it is in the user message, never in the system prompt.
    expect(String(call.system)).not.toMatch(/Bolster Debt|Makeshift Container/);
  }, 30_000);

  it('the card keeps the rolls with the narration\'s account, and every client is shown them', async () => {
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1');

    const card = openingCard();
    expect(card, 'the opening card was posted').toBeTruthy();
    expect(card.content).toContain('<strong>Opening</strong>');
    expect(card.content).not.toMatch(/Galley/);
    const seeds = card.flags[MODULE_ID].builtFrom;
    expect(seeds.map(s => [s.slot, s.result])).toEqual([['moment', 'Bolster Debt'], ['eye', 'Makeshift Container']]);
    expect(seeds[0].tables.map(t => [t.id, t.roll])).toEqual([['action', 14], ['theme', 20]]);
    // The account: the first result's words are in the prose; the second's are not.
    expect(seeds[0].used).toBe('counts the debts on her fingers');
    expect(seeds[1]).toMatchObject({ used: false, claimed: 'a jar with a rusted lid' });
    // The fact block's own key never reaches the prose.
    expect(card.flags[MODULE_ID].narrationText).not.toMatch(/builtFrom|json/);

    // Rendered on the player's client: the dice are the table's to see.
    const root = table.client('pl-1').render(card._id ?? card.id);
    const line = root.querySelector('.sf-scene-rolls');
    expect(line, '"Rolled for this scene" is on the card').toBeTruthy();
    expect(line.textContent).toContain('Rolled for this scene');
    expect(line.textContent).toContain('Action + Theme (14, 20): Bolster Debt');
    expect(line.textContent).toMatch(/Makeshift Container — not used/);
  }, 30_000);

  it('rendering again reads the same rolls: nothing is rolled at a render', async () => {
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('gm-1');
    const card = openingCard();
    const drawnAtPost = dice.drawn.length;
    const first = table.client('gm-1').render(card._id ?? card.id).querySelector('.sf-scene-rolls').textContent;
    const again = table.client('pl-1').render(card._id ?? card.id).querySelector('.sf-scene-rolls').textContent;
    expect(again).toBe(first);
    expect(dice.drawn).toHaveLength(drawnAtPost);
  }, 30_000);

  it('the table\'s own word is on the Begin card and in the prompt, above where the last session stopped', async () => {
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1', { 'input[name="pickUp"]': 'Three days on, docked at Bleakhold.' });

    const beginCard = table.world.messages().find(m => m.flags?.[MODULE_ID]?.sessionLifecycleCard);
    expect(beginCard.content).toContain('<strong>Picking up:</strong> Three days on, docked at Bleakhold.');
    const text = openingCall().userText;
    expect(text).toMatch(/WHERE AND WHEN THE TABLE PICKS UP[^\n]*\nThree days on, docked at Bleakhold\./);
    expect(text.indexOf('WHERE AND WHEN THE TABLE PICKS UP')).toBeLessThan(text.indexOf('WHERE THE LAST SESSION STOPPED'));
  }, 30_000);

  it('a first session with nothing behind it rolls where aboard', async () => {
    table.journal._reset();   // no Session Log: nothing behind this session
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30]);
    await begin('gm-1');
    expect(openingCall().userText).toContain('3. Where aboard the ship this is — Ship zone + area (40, 12): Galley or kitchen (Living)');
    expect(openingCard().flags[MODULE_ID].builtFrom.map(s => s.slot)).toEqual(['moment', 'eye', 'place']);
    expect(dice.drawn).toHaveLength(12);
  }, 30_000);

  it('no narration, no dice: with narration switched off nothing is rolled and no card is posted', async () => {
    await table.client('gm-1').setSetting('narrationEnabled', false);
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1');
    expect(openingCall()).toBeFalsy();
    expect(openingCard()).toBeFalsy();
    expect(dice.drawn).toHaveLength(0);
  }, 30_000);

  it('…and with the opening scene unchecked', async () => {
    dice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1', { 'input[name="galleyVignette"]': false });
    expect(openingCall()).toBeFalsy();
    expect(dice.drawn).toHaveLength(0);
  }, 30_000);
});
