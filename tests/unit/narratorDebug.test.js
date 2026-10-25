/**
 * STARFORGED COMPANION
 * tests/unit/narratorDebug.test.js
 *
 * Issue #290 part 1 — `!narrator debug`. Every narrator request is recorded
 * in this browser as it goes out (callNarratorAPI), with its response and the
 * fact block applyNarratorSidecar parsed out of it; the command whispers the
 * GM the last narration's request, section by section. The captures here come
 * from real narrator calls (apiPost is the only mock), and the prompts the
 * splitter is tested on from the real builders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

// The consistency check is its own Claude call and a GM card; the usage page a journal write.
vi.mock('../../src/factContinuity/consistencyCheck.js', () => ({
  runConsistencyCheck: vi.fn(async () => undefined),
}));
vi.mock('../../src/pacing/telemetry.js', async () => ({
  ...(await vi.importActual('../../src/pacing/telemetry.js')),
  logNarratorUsage: vi.fn(async () => undefined),
}));

import { apiPost } from '../../src/api-proxy.js';
import {
  splitPromptSections,
  isNarratorCommand,
  handleNarratorCommand,
  _resetNarratorDebugForTests,
} from '../../src/narration/narratorDebug.js';
import { narrateVowSwearing, getRollingSessionSummary } from '../../src/narration/narrator.js';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  formatEntityCard,
} from '../../src/narration/narratorPrompt.js';
import { formatSafetyContext } from '../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const VOW = { name: 'Rescue the hostages', rank: 'dangerous' };

const SIDECAR = {
  newTruths:    [{ subject: 'scene', fact: 'The oath is sworn on the reactor housing' }],
  stateChanges: [],
  sceneFrame:   { location: 'Engine room', present: ['Kira Vey'], situation: 'Swearing the vow' },
};

/** A Claude response: prose, then the fenced fact block. */
function narratorReply(prose, sidecar = SIDECAR) {
  return {
    content:     [{ type: 'text', text: `${prose}\n\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\`` }],
    stop_reason: 'end_turn',
    usage:       { input_tokens: 1200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0, output_tokens: 180 },
  };
}

/** Run `!narrator debug` as typed, and return the card it posted (or null). */
async function debugCard(content = '!narrator debug') {
  const before = ChatMessage._created.length;
  await handleNarratorCommand({ content, flags: {} });
  return ChatMessage._created.length > before ? ChatMessage._created.at(-1) : null;
}

beforeEach(() => {
  _resetNarratorDebugForTests();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
  apiPost.mockReset();
});

describe('splitPromptSections', () => {
  it('splits the narrator system prompt at its section rules, with each entity card a section', () => {
    const prompt = buildNarratorSystemPrompt(
      { safety: { lines: ['No harm to children'], veils: [], privateLines: [] } },
      {},
      { name: 'Kira Vey', pronouns: 'she/her' },
      '',
      {
        mode:        'paced_narrative',
        entityCards: [formatEntityCard({ name: 'Vex', role: 'Smuggler' }, 'connection')],
        clocks:      [{ name: 'Reactor breach', type: 'tension', segments: 4, filled: 2 }],
      },
    );
    const sections = splitPromptSections(prompt);
    const headings = sections.map(s => s.heading);

    expect(headings[0]).toBe('NARRATOR ROLE AND VOICE');
    expect(headings).toContain('SAFETY CONFIGURATION');
    expect(headings).toContain('NARRATOR PERMISSIONS — INTERACTION MODE');
    expect(headings).toContain('CLOCKS');
    expect(headings).toContain('ENTITIES IN SCENE');
    expect(headings).toContain('VEX — Connection');
    expect(headings).toContain('CHARACTER');
    expect(headings.at(-1)).toMatch(/^RESPONSE FORMAT/);
    // ### sub-headings stay in their section, and no rule survives in a section.
    expect(headings).not.toContain('DEPICT, DO NOT OFFER');
    expect(sections.find(s => s.heading === 'SAFETY CONFIGURATION').text).toContain('No harm to children');
    for (const s of sections) expect(s.text).not.toMatch(/^-{3,}\s*$/m);
  });

  it('splits a user message at its headings', () => {
    const user = buildNarratorUserMessage(
      { moveName: 'Face Danger', outcome: 'weak_hit', loremasterContext: '[MOVE: Face Danger +wits] [OUTCOME: Weak Hit]' },
      'I wedge the hatch shut.',
      3,
      'Kira Vey',
      'The hull groans.',
    );
    const headings = splitPromptSections(user).map(s => s.heading);
    expect(headings).toEqual(expect.arrayContaining(['RECENT SCENE', 'MOVE OUTCOME', 'PLAYER NARRATION — spoken by Kira Vey']));
  });

  it('a text with no heading is one section, headed by its first line; nothing is no sections', () => {
    expect(splitPromptSections('OPENING VIGNETTE — the galley.\n\nRender four sentences.')).toEqual([
      { heading: 'OPENING VIGNETTE — the galley.', text: 'OPENING VIGNETTE — the galley.\n\nRender four sentences.' },
    ]);
    expect(splitPromptSections('')).toEqual([]);
    expect(splitPromptSections(null)).toEqual([]);
  });
});

describe('!narrator debug — the last narration\'s request', () => {
  it('shows the request a real narrator call sent, section by section, with the fact block it returned', async () => {
    apiPost.mockResolvedValueOnce(narratorReply('Kira presses her palm to the housing and swears.'));
    await narrateVowSwearing({ vow: VOW, campaignState: { currentSceneId: 'scene-1' } });

    const [, , body] = apiPost.mock.calls[0];
    const card = await debugCard();
    expect(card.flags[MODULE_ID].narratorDebugCard).toBe(true);
    expect(card.flags[MODULE_ID].narratorCard).toBeUndefined();   // not fiction: kept out of the ring
    expect(card.whisper).toEqual([game.user.id]);

    const html = card.content;
    expect(html).toContain('narrateVowSwearing');
    expect(html).toContain(body.model);
    expect(html).toContain('stop: end_turn');
    // Every section of what was sent is listed, under its heading.
    for (const s of splitPromptSections(body.system[0].text)) expect(html).toContain(escape(s.heading));
    expect(html).toContain('Rescue the hostages');                // the user message
    // The fact block, as parsed.
    expect(html).toContain('The oath is sworn on the reactor housing');
    expect(html).toContain('Engine room');
    expect(html).toContain('1,200 in');
  });

  it('details the last narration, not a background summary regen, which it lists', async () => {
    apiPost.mockResolvedValueOnce(narratorReply('Kira swears.'));
    await narrateVowSwearing({ vow: VOW, campaignState: { currentSceneId: 'scene-1' } });

    game.messages = { contents: [1, 2, 3].map(i => ({
      flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: `Beat ${i}.` } },
    })) };
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'The crew swore an oath.' }] });
    await getRollingSessionSummary({ currentSessionId: 'sess-1' }, { forceRefresh: true });
    delete game.messages;

    const html = (await debugCard()).content;
    expect(html).toMatch(/<p class="sf-narrator-debug-meta"><strong>narrateVowSwearing<\/strong>/);
    expect(html).toContain('Earlier in this browser');
    expect(html).toContain('<strong>getRollingSessionSummary</strong> (background)');
    expect(html).not.toContain('SESSION NARRATION (oldest first)');   // the summary's prompt isn't detailed
  });

  it('says when the response carried no fact block, or one that could not be read', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Kira swears, and says nothing more.' }] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await narrateVowSwearing({ vow: VOW, campaignState: { currentSceneId: 'scene-1' } });
    expect((await debugCard()).content).toContain('The response carried no fact block.');

    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Kira swears.\n\n```json\n{"newTruths": [\n```' }] });
    await narrateVowSwearing({ vow: VOW, campaignState: { currentSceneId: 'scene-1' } });
    warn.mockRestore();
    expect((await debugCard()).content).toContain('Could not be read:');
  });

  it('says when fact continuity is off', async () => {
    game.settings._store.set(`${MODULE_ID}.factContinuity.enabled`, false);
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Kira swears.' }] });
    await narrateVowSwearing({ vow: VOW, campaignState: {} });
    expect((await debugCard()).content).toContain('Not read &mdash; fact continuity is off.');
  });

  it('records a call that failed', async () => {
    apiPost.mockRejectedValueOnce(new Error('Anthropic API error 529: overloaded'));
    expectConsoleError(/narrateVowSwearing failed/);
    await narrateVowSwearing({ vow: VOW, campaignState: {} });

    const html = (await debugCard()).content;
    expect(html).toContain('failed');
    expect(html).toContain('No response: Anthropic API error 529: overloaded.');
  });

  it('counts Private Lines and never shows them', async () => {
    const campaignState = {
      currentSceneId: 'scene-1',
      safety: {
        lines: ['No gore'], veils: [],
        privateLines: [{ playerId: 'pl-1', lines: ['Spiders', 'Drowning'] }],
      },
    };
    // The real safety block carries both lines to the narrator…
    expect(formatSafetyContext(campaignState, null, 'gm')).toContain('Drowning');
    apiPost.mockResolvedValueOnce(narratorReply('Kira swears.'));
    await narrateVowSwearing({ vow: VOW, campaignState });
    expect(apiPost.mock.calls[0][2].system[0].text).toContain('Drowning');

    // …and the card counts them.
    const html = (await debugCard()).content;
    expect(html).toContain('No gore');
    expect(html).toContain('(2 private lines — not shown)');
    expect(html).not.toContain('Spiders');
    expect(html).not.toContain('Drowning');
  });

  it('escapes what it shows', async () => {
    apiPost.mockResolvedValueOnce(narratorReply('Kira swears. <img src=x onerror=alert(1)>'));
    await narrateVowSwearing({ vow: { name: '<script>alert(1)</script>' }, campaignState: { currentSceneId: 'scene-1' } });
    const html = (await debugCard()).content;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps the last ten requests', async () => {
    for (let i = 1; i <= 12; i += 1) {
      apiPost.mockResolvedValueOnce(narratorReply(`Oath ${i}.`));
      await narrateVowSwearing({ vow: { name: `Vow number ${i}` }, campaignState: { currentSceneId: 'scene-1' } });
    }
    const html = (await debugCard()).content;
    expect(html).toContain('Vow number 12');
    expect((html.match(/<li>[^<]*<strong>narrateVowSwearing<\/strong>/g) ?? []).length).toBe(9);   // + the one detailed
  });

  it('with nothing captured, says where narration runs', async () => {
    const html = (await debugCard()).content;
    expect(html).toContain('This browser hasn&rsquo;t sent the narrator anything since it loaded.');
  });
});

describe('!narrator — who may run it, and what it matches', () => {
  it('is GM-only', async () => {
    const restore = withUser({ isGM: false, id: 'pl-1' });
    const warn = vi.spyOn(ui.notifications, 'warn');
    try {
      expect(await debugCard()).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/GM-only/));
    } finally {
      warn.mockRestore();
      restore();
    }
  });

  it('shows the usage for anything but debug', async () => {
    const info = vi.spyOn(ui.notifications, 'info');
    expect(await debugCard('!narrator')).toBeNull();
    expect(await debugCard('!narrator dbug')).toBeNull();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/!narrator debug/));
    info.mockRestore();
  });

  it('matches !narrator commands, not other text or its own card', () => {
    expect(isNarratorCommand({ content: '!narrator debug' })).toBe(true);
    expect(isNarratorCommand({ content: '  !Narrator DEBUG ' })).toBe(true);
    expect(isNarratorCommand({ content: '!narrator' })).toBe(true);
    expect(isNarratorCommand({ content: '!narratorx' })).toBe(false);
    expect(isNarratorCommand({ content: 'the narrator debug' })).toBe(false);
    expect(isNarratorCommand({ content: '!narrator debug', flags: { [MODULE_ID]: { narratorDebugCard: true } } })).toBe(false);
  });
});

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
