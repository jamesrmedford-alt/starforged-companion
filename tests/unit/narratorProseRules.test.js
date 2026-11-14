/**
 * STARFORGED COMPANION
 * tests/unit/narratorProseRules.test.js
 *
 * Issue #354 section E — narration quality (the alpha 23 playtest, part 2):
 *
 *   P2-20  the Length setting counted sentences, so the sentences grew: at
 *          Length 3 a beat ran 120–200 words. A length is a word budget with
 *          a sentence cap, in short sentences — shorter read aloud.
 *   P2-21  Levity "Playful" dropped out of the tense exchanges. The
 *          permission holds under threat, and is said again with the beat.
 *   P2-22  one simile came back in three narrations, and an NPC's lines were
 *          set in italics — the closing move-hint's styling.
 *   P2-26  the closing vignette ran about eight sentences against its 3–5.
 *   P2-27  every prose role asked for "vivid, atmospheric prose"; nearly every
 *          beat leaned on a strained comparison, and all were built one way.
 *
 * "Depict, do not offer", the beat-ending rule and the closing italic
 * move-hint are unchanged (corrections, not reversals).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { buildNarratorExtras, narratePacedInput } from '../../src/narration/narrator.js';
import {
  buildNarratorSystemPrompt, buildNarratorSystemBlocks, formatBeatProseBlock,
  buildNarratorUserMessage, buildPacedNarrativeUserMessage, buildRoundUserMessage,
  NARRATOR_PERMISSIONS,
} from '../../src/narration/narratorPrompt.js';
import { buildEndSessionVignetteUserMessage } from '../../src/session/endSessionVignette.js';
import { BEAT_SHAPES } from '../../src/narration/proseVariety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const PROSE_MODES = [
  'move_resolution', 'round_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup',
  'session_vignette', 'inciting_incident', 'vow_swearing', 'clock_advance',
];
const BEAT_MODES = ['move_resolution', 'round_resolution', 'paced_narrative'];

const prompt = (mode, settings = {}, extras = {}) =>
  buildNarratorSystemPrompt({}, settings, { name: 'Isaac Sutton' }, '', { mode, ...extras });

const card = (text, extra = {}) => ({
  flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: text, ...extra } },
});

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
  game.settings._store.set(KEY, { currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1' });
});

describe('P2-27 — plain prose, not "vivid, atmospheric"', () => {
  it('no prose mode is asked for vivid, atmospheric prose any more', () => {
    for (const mode of PROSE_MODES) {
      expect(prompt(mode), mode).not.toMatch(/vivid, atmospheric/);
    }
    for (const mode of ['move_resolution', 'round_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup']) {
      expect(prompt(mode), mode).toMatch(/plain, concrete prose/);
    }
  });

  it('every prose mode carries the prose rule: plain, at most one comparison, no chains, no reused image, varied build', () => {
    for (const mode of PROSE_MODES) {
      const p = prompt(mode);
      expect(p, mode).toContain('### PROSE');
      expect(p, mode).toMatch(/Write plainly\. Concrete nouns and verbs/);
      expect(p, mode).toMatch(/At most one comparison — a simile or a metaphor — in a narration/);
      expect(p, mode).toMatch(/Never chain them/);
      expect(p, mode).toMatch(/Never reuse an image, or another from the same source/);
      expect(p, mode).toMatch(/Vary how narrations are built/);
    }
  });

  it('the permission blocks no longer hand out atmosphere freely', () => {
    expect(NARRATOR_PERMISSIONS.interaction).not.toMatch(/atmospheric texture freely/);
    expect(NARRATOR_PERMISSIONS.interaction).toMatch(/a touch, not a layer/);
    expect(NARRATOR_PERMISSIONS.embellishment).not.toMatch(/sensory, atmospheric, and emotional/);
    expect(NARRATOR_PERMISSIONS.embellishment).toMatch(/concrete sensory and emotional detail/);
  });

  it('Wry is dry: its irony is in what happens, not in a comparison', () => {
    const p = prompt('paced_narrative', { narrationTone: 'wry' });
    expect(p).toMatch(/Tone: Wry — dry and understated/);
    expect(p).toMatch(/never in a clever comparison/);
    expect(p).not.toMatch(/It notices the irony/);
  });

  it('what is unchanged: depict-do-not-offer, how a beat ends, the closing move hint', () => {
    for (const mode of BEAT_MODES) {
      const p = prompt(mode);
      expect(p, mode).toContain('### DEPICT, DO NOT OFFER');
      expect(p, mode).toContain('### HOW A BEAT ENDS');
      expect(p, mode).toMatch(/A recurring motif must change, or be dropped/);
    }
    const paced = buildPacedNarrativeUserMessage('I wait.', '', 3, 'compel', 'Isaac');
    expect(paced).toMatch(/End your narration with ONE italicized\s+sentence inviting this move/);
    expect(paced).toMatch(/ONE permitted exception to the\s+"depict, do not offer" rule/);
  });
});

describe('P2-20 — a length is a word budget, in short sentences', () => {
  it('the system prompt gives the budget, not a sentence count', () => {
    const p = prompt('move_resolution', { narrationLength: 3 });
    expect(p).toContain('Length: about 65 words — never more than 85 — in at most 5 sentences.');
    expect(p).toMatch(/Short sentences, one idea each, none over about 30 words\. Never stack clauses/);
    expect(p).not.toMatch(/Length: 3 sentences/);
    expect(prompt('paced_narrative', { narrationLength: 1 })).toContain('Length: about 20 words — never more than 30 — in at most 2 sentences.');
  });

  it('with audio narration on, the sentences are shorter', () => {
    const aloud = prompt('move_resolution', { narrationLength: 3 }, { audioMarkupEnabled: true });
    expect(aloud).toMatch(/This narration is read aloud: short sentences, one idea each, none over about 18 words/);
    expect(aloud).toContain('about 65 words');
    expect(prompt('move_resolution', { narrationLength: 3 })).not.toMatch(/read aloud/);
  });

  it('the move, paced and round user messages ask for the same budget', () => {
    const move = buildNarratorUserMessage({ loremasterContext: '[MOVE: Face Danger]' }, 'I duck.', 3, 'Isaac');
    expect(move).toContain('Narrate the consequence in about 65 words — never more than 85 — in at most 5 sentences.');
    expect(move).not.toMatch(/in 3 sentences/);
    expect(move).toMatch(/none over about 30 words/);

    const paced = buildPacedNarrativeUserMessage('I answer the hail.', '', 3, null, 'Isaac');
    expect(paced).toContain('Continue the fiction from this input in about 65 words — never more than 85 — in at most 5 sentences.');
    expect(paced).toMatch(/No move was rolled — stay in narration/);          // PT01's wording stands

    const round = buildRoundUserMessage({ entries: [{ actorName: 'Isaac', text: 'I run.', input: { kind: 'narrative' } }], sentenceTarget: 5 });
    expect(round).toContain('Narrate the round as one scene in about 110 words — never more than 140 — in at most 8 sentences.');
    expect(round).toMatch(/Close on a beat the whole party can answer/);     // unchanged
  });

  it('read aloud, each user message says so', () => {
    const opts = { audio: true };
    expect(buildNarratorUserMessage({}, 'I duck.', 3, null, '', opts)).toMatch(/read aloud: short sentences, one idea each, none over about 18 words/);
    expect(buildPacedNarrativeUserMessage('I wait.', '', 3, null, null, opts)).toMatch(/none over about 18 words/);
    expect(buildRoundUserMessage({ entries: [], sentenceTarget: 3, audio: true })).toMatch(/none over about 18 words/);
  });

  it('the closing move hint is outside the budget', () => {
    expect(buildPacedNarrativeUserMessage('I wait.', '', 3, 'compel')).toMatch(/the closing move hint, if you include it, is not counted/);
    expect(buildPacedNarrativeUserMessage('I wait.', '', 3, null)).not.toMatch(/closing move hint/);
  });

  it('a paced narration is sent the read-aloud budget when audio narration is on', async () => {
    apiPost.mockResolvedValue({
      content: [{ type: 'text', text: 'The channel opens.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
      usage: {}, stop_reason: 'end_turn',
    });
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
    await narratePacedInput('I answer the hail.', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), { speakerActorId: 'a-actor' });
    const body = apiPost.mock.calls.map(c => c[2]).find(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
    expect(body, 'a narration was requested').toBeTruthy();
    const system = body.system.map(b => b.text).join('\n');
    expect(system).toMatch(/Length: about 65 words — never more than 85 — in at most 5 sentences\. This narration is read aloud/);
    expect(String(body.messages[0].content)).toMatch(/read aloud: short sentences, one idea each, none over about 18 words/);
  });
});

describe('P2-22 / P2-27 — the images already used, and a shape for the beat', () => {
  it('formatBeatProseBlock lists the images and the shape, and is empty with neither', () => {
    expect(formatBeatProseBlock()).toBe('');
    expect(formatBeatProseBlock({ usedImages: [], beatShape: null, levity: 'default' })).toBe('');
    const block = formatBeatProseBlock({
      usedImages: ['the way an usher waits for a latecomer', 'like a swimmer surfacing'],
      beatShape:  { hint: 'Open on what someone does. Any speech comes after it.' },
    });
    expect(block.startsWith("## THIS BEAT'S PROSE")).toBe(true);
    expect(block).toContain('Shape: Open on what someone does. Any speech comes after it.');
    expect(block).toMatch(/it changes nothing about what happens/);
    expect(block).toContain('### IMAGES ALREADY USED');
    expect(block).toContain('- the way an usher waits for a latecomer');
    expect(block).toContain('- like a swimmer surfacing');
    expect(block).toMatch(/Do not use any of them again, or another\s+drawn from the same source/);
  });

  it('the beat modes carry it; the others do not', () => {
    const extras = { usedImages: ['like a swimmer surfacing'], beatShape: { hint: 'Open on a line of speech.' } };
    for (const mode of BEAT_MODES) expect(prompt(mode, {}, extras), mode).toContain("## THIS BEAT'S PROSE");
    for (const mode of PROSE_MODES.filter(m => !BEAT_MODES.includes(m))) {
      expect(prompt(mode, {}, extras), mode).not.toContain("## THIS BEAT'S PROSE");
    }
  });

  it("the narrator is given the session's recent comparisons — the usher three narrations running", async () => {
    game.messages = { contents: [
      card('The escort waits the way an usher waits for a latecomer.'),
      card('It holds the channel open the way an usher holds a door, and Archer breathes like a swimmer surfacing.'),
      card('Another session entirely, like a gull over a trawler.', { sessionId: 'sess-0' }),
      card('Struck prose, like a coin of unfamiliar mint.', { burnSuperseded: true }),
      card('Karthik thumbs the key.'),
    ] };
    const extras = await buildNarratorExtras('paced_narrative', game.settings.get(MODULE_ID, 'campaignState'), {
      playerNarration: 'Tell us the whole story.', character: { actorId: 'a-actor', name: 'Isaac Sutton' },
    });
    expect(extras.usedImages).toEqual([
      'the way an usher holds a door',
      'like a swimmer surfacing',
      'the way an usher waits for a latecomer',
    ]);
    const system = buildNarratorSystemPrompt({}, {}, { name: 'Isaac Sutton' }, '', extras);
    expect(system).toContain('- the way an usher waits for a latecomer');
    // Another session's card and a superseded one are no part of this scene.
    expect(system).not.toContain('gull over a trawler');
    expect(system).not.toContain('coin of unfamiliar mint');
  });

  it('each beat is given a shape, and the next beat a different one', async () => {
    const state = () => game.settings.get(MODULE_ID, 'campaignState');
    const opts  = { playerNarration: 'I wait.', character: { actorId: 'a-actor', name: 'Isaac Sutton' } };
    const shapes = [];
    for (let i = 0; i < 6; i += 1) {
      const extras = await buildNarratorExtras(i % 2 ? 'move_resolution' : 'paced_narrative', state(), opts);
      expect(BEAT_SHAPES.map(s => s.id)).toContain(extras.beatShape.id);
      expect(buildNarratorSystemPrompt({}, {}, null, '', extras)).toContain(`Shape: ${extras.beatShape.hint}`);
      shapes.push(extras.beatShape.id);
      game.messages.contents.push(card(`Beat ${i}.`));   // the narration posts; the next beat follows it
    }
    for (let i = 1; i < shapes.length; i += 1) expect(shapes[i], `beats ${i - 1} and ${i}`).not.toBe(shapes[i - 1]);
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(BEAT_SHAPES.length);
  });

  it('a mode that is not a beat gets neither', async () => {
    game.messages = { contents: [card('It waits like a creditor at the door.')] };
    const extras = await buildNarratorExtras('scene_interrogation', game.settings.get(MODULE_ID, 'campaignState'), { playerNarration: 'what do I see?' });
    expect(extras.usedImages).toBeUndefined();
    expect(extras.beatShape).toBeUndefined();
  });

  it('speech is never set in italics: italics are the move hint\'s', () => {
    for (const mode of PROSE_MODES) {
      expect(prompt(mode), mode).toMatch(/Set speech in quotation marks, in plain type — never in italics/);
    }
  });
});

describe('P2-21 — levity holds under threat', () => {
  it('Playful says so in its description, and again with the beat', () => {
    const blocks = buildNarratorSystemBlocks({}, { narrationLevity: 'playful' }, null, '', { mode: 'move_resolution' });
    expect(blocks.standing).toMatch(/This holds on a miss, under threat and in a hard conversation: every beat carries one\s+light touch/);
    expect(blocks.standing).toMatch(/never drop it because the scene is tense/);
    expect(blocks.beat).toContain("## THIS BEAT'S PROSE");
    expect(blocks.beat).toMatch(/Levity \(Playful\): this beat carries one light touch .* even on a miss or under threat/);
  });

  it('Light permits a warm detail under threat', () => {
    const blocks = buildNarratorSystemBlocks({}, { narrationLevity: 'light' }, null, '', { mode: 'paced_narrative' });
    expect(blocks.standing).toMatch(/This holds on a miss and under threat/);
    expect(blocks.beat).toMatch(/Levity \(Light\): this beat may carry one warm or human detail, even on a miss or under threat/);
  });

  it('Default levity adds nothing, and a recap carries none', () => {
    const none = buildNarratorSystemBlocks({}, { narrationLevity: 'default' }, null, '', { mode: 'move_resolution' });
    expect(none.standing).not.toContain('### LEVITY');
    expect(none.beat).not.toMatch(/Levity \(/);
    expect(prompt('campaign_recap', { narrationLevity: 'playful' })).not.toMatch(/Levity/);
    // …and a mode that is not a beat keeps the description only.
    const vignette = buildNarratorSystemBlocks({}, { narrationLevity: 'playful' }, null, '', { mode: 'session_vignette' });
    expect(vignette.standing).toContain('### LEVITY');
    expect(vignette.beat).not.toMatch(/Levity \(/);
  });
});

describe('P2-26 — the closing vignette keeps to its length', () => {
  it('its message ends on the limit: three to five sentences, never more', () => {
    const message = buildEndSessionVignetteUserMessage({ kind: 'connection', name: 'Vuldar Archer', hint: 'a broker' }, {});
    expect(message).toMatch(/Render a 3-5 sentence closing vignette/);     // as before
    const last = message.trim().split('\n').slice(-2).join(' ');
    expect(last).toMatch(/three to five sentences, about 90 words — never more than five\s+sentences/);
    expect(last).toMatch(/Count them/);
  });

  it('the vignette role says its length is a limit', () => {
    expect(prompt('session_vignette')).toMatch(/that is a limit, not a guide — count them, and stop at the last one/);
  });
});
