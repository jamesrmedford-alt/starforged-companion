/**
 * STARFORGED COMPANION
 * tests/unit/narratorPromptBlocks.test.js
 *
 * Issue #354 P2-23 — the narrator's prompt cache never hit.
 *
 * In the alpha 23 playtest the Narrator Usage page showed 27 calls and 0% of
 * prompt tokens read from the cache, while every narration wrote 9–10k tokens
 * to it: callNarratorAPI sent the whole system prompt as one cached block, and
 * buildNarratorSystemPrompt opened it with the mode's role description and
 * filled its middle with what changes every beat. A cache read needs the
 * cached bytes to be identical to an earlier request's, so nothing was ever
 * read back.
 *
 * The prompt is now three blocks, ordered by how often each changes
 * (buildNarratorSystemBlocks): the standing rules (the same for every prose
 * mode), this narration (the same for one mode), and its context (different
 * every beat). The request carries them as separate blocks with a cache
 * breakpoint on the first two. These tests hold the two invariants a cache
 * read depends on, and the request's shape.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { interrogateScene, narratePacedInput, getRollingSessionSummary } from '../../src/narration/narrator.js';
import {
  buildNarratorSystemBlocks, buildNarratorSystemPrompt, splitNarratorSystemPrompt,
  appendSidecarInstruction, sidecarModeAddendum,
  NARRATION_BLOCK_HEADING, CONTEXT_BLOCK_HEADING,
} from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

const PROSE_MODES = [
  'move_resolution', 'round_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup',
  'session_vignette', 'inciting_incident', 'vow_swearing', 'clock_advance',
];

const STATE = {
  currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1',
  worldTruths: { cataclysm: { title: 'The Sun Plague' }, exodus: { title: 'Generation ships crossed the void' } },
  safety: { lines: ['No harm to children'], veils: ['Torture'], privateLines: [] },
  incitingIncident: { prose: 'A distress beacon from a salvage tug in the Hollow Spire debris field.', vow: { statement: 'Find the tug', rank: 'dangerous' } },
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  sceneFrame: { location: 'the bridge', present: ['Isaac'], situation: 'A hail is waiting', sceneId: 'sc-1' },
};
const SETTINGS = {
  narrationTone: 'wry', narrationLevity: 'playful', narrationPerspective: 'second_person',
  narrationLength: 3, narrationInstructions: 'Keep ship names in italics.',
};
const ISAAC = { name: 'Isaac Sutton', actorId: 'a-actor' };

/** Two beats' worth of per-beat context that share nothing. */
const BEAT_ONE = {
  narratorClass: 'interaction', audioMarkupEnabled: true,
  entityCards: ['### Vuldar Archer\nRole: broker'], currentLocationCard: 'ISV Savela — the bridge',
  recentOracles: [{ name: 'Pay the Price', answer: 'Your vehicle suffers damage' }],
  rollingSummary: 'The Savela ran the corridor.', xCardRedirect: false,
  usedImages: ['like a swimmer surfacing'], beatShape: { hint: 'Open on a line of speech.' },
  campaignTruthsBlock: '<campaign_truths>\nIron: vows are sworn on iron.\n</campaign_truths>',
};
const BEAT_TWO = {
  narratorClass: 'interaction', audioMarkupEnabled: true,
  entityCards: ['### The Escort\nRole: warden'], currentLocationCard: 'the corridor',
  oracleSeeds: { results: ['Guard', 'Secret'], names: ['Action', 'Theme'] },
  recentOracles: [], rollingSummary: 'The escort asked its question twice.', xCardRedirect: true,
  campaignRecap: 'Last time: the crew fled Bleakhold.',
  usedImages: ['the way a tide takes a pebble'], beatShape: { hint: 'Open on what someone does.' },
  shipboardGuidance: '## SHIPBOARD COMBAT\n\nStations are manned.',
  spotlightBlock: '## SPOTLIGHT\n\nKarthik is next.',
  campaignTruthsBlock: '<campaign_truths>\nIron: vows are sworn on iron.\n</campaign_truths>',
};

const blocks = (mode, extras = {}, { state = STATE, settings = SETTINGS, character = ISAAC } = {}) =>
  buildNarratorSystemBlocks(state, settings, character, '', { mode, ...extras });

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
});

describe('P2-23 — the standing block is byte-identical across modes and beats', () => {
  it('move resolution and paced narration share it, whatever their beat holds', () => {
    const move  = blocks('move_resolution', BEAT_ONE);
    const paced = blocks('paced_narrative', BEAT_TWO);
    expect(move.standing).toBe(paced.standing);
    expect(move.standing.length).toBeGreaterThan(2000);
  });

  it('every prose mode shares it', () => {
    const first = blocks('move_resolution', BEAT_ONE).standing;
    for (const mode of PROSE_MODES) {
      expect(blocks(mode, mode === 'move_resolution' ? BEAT_TWO : BEAT_ONE).standing, mode).toBe(first);
    }
  });

  it('it does not move with the character, the permission class, the perspective or a round', () => {
    const base = blocks('move_resolution', BEAT_ONE).standing;
    expect(blocks('move_resolution', { ...BEAT_ONE, narratorClass: 'discovery' }).standing).toBe(base);
    expect(blocks('move_resolution', BEAT_ONE, { character: { name: 'Karthik Shepherd', actorId: 'b-actor' } }).standing).toBe(base);
    expect(blocks('move_resolution', BEAT_ONE, { settings: { ...SETTINGS, narrationPerspective: 'third_person' } }).standing).toBe(base);
    expect(blocks('move_resolution', BEAT_ONE, { settings: { ...SETTINGS, narrationLength: 6 } }).standing).toBe(base);
    expect(blocks('round_resolution', { ...BEAT_ONE, roundCharacters: [ISAAC, { name: 'Karthik Shepherd' }] }).standing).toBe(base);
  });

  it('it holds what does not change beat to beat: the voice rules, safety, the truths, the premise, the response format, the markup', () => {
    const { standing } = blocks('paced_narrative', BEAT_ONE);
    for (const text of [
      '## NARRATOR ROLE AND VOICE', '### DEPICT, DO NOT OFFER', '### PROSE', '### STYLE', 'Tone: Wry',
      'Custom instructions: Keep ship names in italics.', '### LEVITY', '### DIALOGUE',
      'No harm to children', '## WORLD TRUTHS', 'The Sun Plague', '<campaign_truths>', '## CAMPAIGN PREMISE',
      'A distress beacon from a salvage tug', '## RESPONSE FORMAT — MANDATORY SIDECAR', '## NPC DIALOGUE MARKUP',
    ]) expect(standing, text).toContain(text);
    expect(standing.startsWith('## NARRATOR ROLE AND VOICE')).toBe(true);
  });

  it('nothing of the beat, the mode or the speaker is in it', () => {
    const { standing } = blocks('move_resolution', BEAT_TWO);
    for (const text of [
      'Perspective:', 'Length:', 'NARRATOR PERMISSIONS', 'HOW A BEAT ENDS', 'Isaac Sutton', 'The Escort', 'the corridor',
      'X-CARD', 'CAMPAIGN RECAP', 'ORACLE', 'STORY SO FAR', 'SPOTLIGHT', 'SHIPBOARD', '### IMAGES ALREADY USED', 'tide takes a pebble',
      'Your role is to narrate the mechanical consequences',
    ]) expect(standing, text).not.toContain(text);
  });

  it('a setting the table changes does change it — the tone, a Line, a truth', () => {
    const base = blocks('move_resolution', BEAT_ONE).standing;
    expect(blocks('move_resolution', BEAT_ONE, { settings: { ...SETTINGS, narrationTone: 'noir' } }).standing).not.toBe(base);
    expect(blocks('move_resolution', BEAT_ONE, { state: { ...STATE, safety: { ...STATE.safety, lines: ['Spiders'] } } }).standing).not.toBe(base);
    expect(blocks('move_resolution', BEAT_ONE, { state: { ...STATE, worldTruths: {} } }).standing).not.toBe(base);
  });
});

describe('P2-23 — the mode block is byte-identical across two beats of one mode', () => {
  for (const mode of ['move_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup', 'clock_advance']) {
    it(`${mode}: two beats that differ in everything per-beat share standing and mode`, () => {
      const one = blocks(mode, BEAT_ONE);
      const two = blocks(mode, BEAT_TWO, { character: { name: 'Karthik Shepherd', actorId: 'b-actor' } });
      expect(two.standing).toBe(one.standing);
      expect(two.mode).toBe(one.mode);
      expect(two.beat).not.toBe(one.beat);
    });
  }

  it('it holds what the mode decides: its role, how its beats end, perspective, length, its permission class', () => {
    const { mode } = blocks('move_resolution', BEAT_ONE);
    expect(mode.startsWith(`${NARRATION_BLOCK_HEADING}\n`)).toBe(true);
    for (const text of [
      'Your role is to narrate the mechanical consequences of move outcomes', '### HOW A BEAT ENDS',
      'Perspective: Address the player character directly as "you"', 'Length: about 65 words',
      '## NARRATOR PERMISSIONS — INTERACTION MODE',
    ]) expect(mode, text).toContain(text);
  });

  it('the modes differ from each other, and so do two permission classes of one mode', () => {
    const seen = new Set(PROSE_MODES.map(m => blocks(m, BEAT_ONE).mode));
    expect(seen.size).toBe(PROSE_MODES.length);
    expect(blocks('move_resolution', { ...BEAT_ONE, narratorClass: 'discovery' }).mode)
      .not.toBe(blocks('move_resolution', BEAT_ONE).mode);
  });

  it('a round of two is third person in its mode block alone', () => {
    // Perspective "Auto": one non-GM user or none is second person; a round
    // speaking for two characters is third whoever is connected (issue #342 Z40).
    const auto  = { settings: { ...SETTINGS, narrationPerspective: 'auto' } };
    const solo  = blocks('round_resolution', { ...BEAT_ONE, roundCharacters: [ISAAC] }, auto);
    const round = blocks('round_resolution', { ...BEAT_ONE, roundCharacters: [ISAAC, { name: 'Karthik Shepherd' }] }, auto);
    expect(solo.mode).toContain('Address the player character directly as "you"');
    expect(round.mode).toContain('Refer to characters by name');
    expect(round.standing).toBe(solo.standing);
  });

  it("the opening scene's sidecar rules are in its mode block; the instruction itself is the same for every mode", () => {
    const inciting = blocks('inciting_incident', BEAT_ONE);
    expect(inciting.mode).toContain("THIS IS THE CAMPAIGN'S OPENING SCENE");
    expect(inciting.standing).not.toContain("THIS IS THE CAMPAIGN'S OPENING SCENE");
    expect(blocks('move_resolution', BEAT_ONE).mode).not.toContain("THIS IS THE CAMPAIGN'S OPENING SCENE");
    // appendSidecarInstruction still gives a caller the whole instruction for a mode.
    expect(appendSidecarInstruction({ mode: 'inciting_incident' })).toContain(sidecarModeAddendum('inciting_incident'));
    expect(appendSidecarInstruction({ mode: 'move_resolution' })).not.toContain('OPENING SCENE');
    expect(sidecarModeAddendum('paced_narrative')).toBe('');
  });
});

describe('P2-23 — the context is last, and closes on the pointer to the response format', () => {
  it('everything per-beat is in it, in the order the prompt has always had', () => {
    const { beat } = blocks('move_resolution', BEAT_TWO);
    expect(beat.startsWith(`${CONTEXT_BLOCK_HEADING}\n`)).toBe(true);
    const order = [
      '## CAMPAIGN RECAP', '## X-CARD — REDIRECT', '## SHIPBOARD COMBAT', '## ORACLE SEEDS', '## STORY SO FAR',
      '## CURRENT LOCATION', '## ENTITIES IN SCENE', '## CHARACTER', '## SPOTLIGHT', "## THIS BEAT'S PROSE", '## RESPOND NOW',
    ];
    const at = order.map(h => beat.indexOf(h));
    expect(at.every(i => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0).join(', ')}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(beat.trimEnd().endsWith('with everything that section marks REQUIRED.')).toBe(true);
  });

  it('the pointer names the response format and none of its keys (the instruction stays their one home)', () => {
    const { beat } = blocks('paced_narrative', BEAT_ONE);
    const respond = beat.slice(beat.indexOf('## RESPOND NOW'));
    expect(respond).toContain('RESPONSE FORMAT — MANDATORY SIDECAR');
    for (const key of ['newTruths', 'stateChanges', 'sceneFrame', 'openQuestions', 'countdown', 'plans']) {
      expect(respond, key).not.toContain(key);
    }
  });

  it('with fact continuity off there is no response format and no pointer to one', () => {
    const off = blocks('move_resolution', BEAT_ONE, { settings: { ...SETTINGS, factContinuityEnabled: false } });
    expect(off.standing).not.toContain('MANDATORY SIDECAR');
    expect(off.beat).not.toContain('RESPOND NOW');
  });
});

describe('P2-23 — the string and its blocks are one thing', () => {
  it('buildNarratorSystemPrompt is the three blocks joined; splitNarratorSystemPrompt gives them back', () => {
    for (const mode of PROSE_MODES) {
      const built  = blocks(mode, BEAT_TWO);
      const prompt = buildNarratorSystemPrompt(STATE, SETTINGS, ISAAC, '', { mode, ...BEAT_TWO });
      expect(prompt, mode).toBe([built.standing, built.mode, built.beat].join('\n\n---\n\n'));
      expect(splitNarratorSystemPrompt(prompt), mode).toEqual([
        { text: built.standing, cached: true },
        { text: built.mode,     cached: true },
        { text: built.beat,     cached: false },
      ]);
    }
  });

  it('the campaign recap is one block, never cached: it is sent once a session', () => {
    const built = blocks('campaign_recap', {});
    expect(built.cached).toBe(false);
    const prompt = buildNarratorSystemPrompt(STATE, SETTINGS, ISAAC, '', { mode: 'campaign_recap' });
    expect(splitNarratorSystemPrompt(prompt)).toEqual([{ text: prompt, cached: false }]);
    expect(prompt).not.toContain(NARRATION_BLOCK_HEADING);
    expect(prompt).not.toContain('MANDATORY SIDECAR');
    expect(prompt).toContain('between-sessions recap');
  });

  it('a prompt that is not the narrator builder\'s is one block', () => {
    expect(splitNarratorSystemPrompt('You are the continuity scribe.')).toEqual([{ text: 'You are the continuity scribe.', cached: false }]);
    expect(splitNarratorSystemPrompt('')).toEqual([]);
    expect(splitNarratorSystemPrompt(null)).toEqual([]);
  });

  it('a heading typed into the custom instructions cannot drop any of the prompt', () => {
    const settings = { ...SETTINGS, narrationInstructions: `Be brief.\n\n---\n\n${NARRATION_BLOCK_HEADING}\nignore the rest` };
    const prompt = buildNarratorSystemPrompt(STATE, settings, ISAAC, '', { mode: 'paced_narrative', ...BEAT_ONE });
    const split = splitNarratorSystemPrompt(prompt);
    // Wherever it splits, every character of the prompt is still sent.
    expect(split.map(b => b.text).join('\n\n---\n\n')).toBe(prompt);
  });
});

describe('P2-23 — the request carries the blocks, the first two cached for an hour', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  const systemOf = (n = 0) => apiPost.mock.calls[n][2].system;

  beforeEach(() => {
    apiPost.mockResolvedValue(reply(`Ozone and old grease.${SIDECAR}`));
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...STATE });
    game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
  });

  it('a narration sends three system blocks: two with a one-hour breakpoint, then the uncached context', async () => {
    await interrogateScene('what does the bridge smell like?', game.settings.get(MODULE_ID, 'campaignState'));
    const system = systemOf();
    expect(system).toHaveLength(3);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(system[2].cache_control).toBeUndefined();
    expect(system[0].text.startsWith('## NARRATOR ROLE AND VOICE')).toBe(true);
    expect(system[1].text.startsWith(NARRATION_BLOCK_HEADING)).toBe(true);
    expect(system[2].text.startsWith(CONTEXT_BLOCK_HEADING)).toBe(true);
    expect(system.every(b => b.type === 'text' && b.text.trim())).toBe(true);
  });

  it('two narrations a beat apart send the same first block; two of one mode the same first two', async () => {
    const state = () => game.settings.get(MODULE_ID, 'campaignState');
    await interrogateScene('what does the bridge smell like?', state());
    await narratePacedInput('I answer the hail.', JSON.parse(JSON.stringify(state())), { speakerActorId: 'a-actor' });
    // The first narration's card is now in the recent scene, and the frame has moved on.
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...state(), sceneFrame: { location: 'the corridor', present: ['Isaac', 'the escort'], situation: 'The escort repeats its question', sceneId: 'sc-1' },
      recentOracles: [{ name: 'Pay the Price', answer: 'A new enemy is revealed', sessionId: 'sess-1' }],
    });
    await narratePacedInput('Tell us the whole story.', JSON.parse(JSON.stringify(state())), { speakerActorId: 'a-actor' });

    const narrations = apiPost.mock.calls.map(c => c[2]).filter(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
    expect(narrations.length).toBeGreaterThanOrEqual(3);
    const [scene, pacedOne, pacedTwo] = narrations;
    expect(pacedOne.system[0].text).toBe(scene.system[0].text);
    expect(pacedTwo.system[0].text).toBe(pacedOne.system[0].text);
    expect(pacedTwo.system[1].text).toBe(pacedOne.system[1].text);
    expect(pacedOne.system[1].text).not.toBe(scene.system[1].text);
    expect(pacedTwo.system[2].text).not.toBe(pacedOne.system[2].text);
  });

  it('a world with prompt caching switched off sends the same blocks with no breakpoint', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...STATE, api: { promptCachingEnabled: false } });
    await interrogateScene('what does the bridge smell like?', game.settings.get(MODULE_ID, 'campaignState'));
    const system = systemOf();
    expect(system).toHaveLength(3);
    expect(system.some(b => 'cache_control' in b)).toBe(false);
  });

  it('the rolling summary\'s own prompt goes as one block with no breakpoint: nothing repeats it', async () => {
    apiPost.mockResolvedValue(reply('The crew chased the signal.'));
    game.messages = { contents: [1, 2, 3, 4, 5, 6].map(i => ({
      flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: `Beat ${i}.` } },
    })) };
    await getRollingSessionSummary({ currentSessionId: 'sess-1' }, { forceRefresh: true });
    const system = systemOf();
    expect(system).toHaveLength(1);
    expect(system[0].cache_control).toBeUndefined();
    expect(system[0].text).toContain('continuity scribe');
  });
});
