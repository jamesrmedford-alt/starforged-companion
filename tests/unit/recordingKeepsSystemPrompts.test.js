/**
 * STARFORGED COMPANION
 * tests/unit/recordingKeepsSystemPrompts.test.js
 *
 * Issue #402, change 6: "A kept run keeps its requests' system prompts, each
 * section's text once. A replay keeps a call's user turn alone, so round 10's
 * review could not read back what a prompt said." The worn-details list the
 * refrains test reconstructed (Part 7) was in the system prompts no kept run
 * held. A recording now stores each section of a request's system prompt once
 * (`systemSections`, by its hash) and each exchange the ids of its sections
 * (`system`), and `systemPromptOf` puts a prompt back together.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClaudeHarness, splitSections, sectionId, systemPromptOf } from '../../test/ci/playwright/lib/claude.mjs';

const STACK = [
  'Error',
  '    at apiPost (http://foundry:30000/modules/starforged-companion/src/api-proxy.js:40:9)',
  '    at callNarratorAPI (http://foundry:30000/modules/starforged-companion/src/narration/narrator.js:200:9)',
  '    at narratePacedInput (http://foundry:30000/modules/starforged-companion/src/narration/narrator.js:640:23)',
].join('\n');

const PROMPT = (worn) => [
  'You are the narrator.',
  '## NARRATOR ROLE AND VOICE',
  'Second person, present tense.',
  '',
  '## DETAILS ALREADY WORN',
  `- ${worn}`,
].join('\n');

afterEach(() => vi.unstubAllGlobals());

describe('a recording keeps each request\'s system prompt, each section once', () => {
  it('a prompt splits into its sections and joins back to itself', () => {
    for (const text of [PROMPT('pen'), '## ONLY\nA line.', 'No heading at all.', '## A\n\n## B\n', '']) {
      expect(splitSections(text).join('\n'), JSON.stringify(text)).toBe(text);
    }
    expect(splitSections(PROMPT('pen'))).toEqual([
      'You are the narrator.',
      '## NARRATOR ROLE AND VOICE\nSecond person, present tense.\n',
      '## DETAILS ALREADY WORN\n- pen',
    ]);
  });

  it('two calls sharing a section store it once; each prompt reads back whole', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ model: 'opus',
      content: [{ type: 'text', text: 'The dock hums.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 })));
    const harness = createClaudeHarness({ mode: 'record', apiKey: 'sk-test-key', log: () => {} });
    let bridge = null;
    harness.attach({ exposeFunction: async (_n, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
    const send = (system) => bridge({ url: 'https://api.anthropic.com/v1/messages', headers: {}, stack: STACK,
      body: JSON.stringify({ model: 'opus', max_tokens: 100, system: [{ type: 'text', text: system }], messages: [{ role: 'user', content: 'I look around.' }] }) });
    harness.setStep('a1');
    await send(PROMPT('pen'));
    harness.setStep('a2');
    await send(PROMPT('hook man'));
    const out = harness.recordingOut({ scenario: 'explore-long-haul', passed: true });
    // The role section is shared; each worn list is its own.
    expect(Object.keys(out.systemSections)).toHaveLength(4);
    expect(out.exchanges[0].system).toHaveLength(3);
    expect(out.exchanges[0].system[1]).toBe(out.exchanges[1].system[1]);
    expect(out.exchanges[0].system[1]).toBe(sectionId('## NARRATOR ROLE AND VOICE\nSecond person, present tense.\n'));
    expect(systemPromptOf(out, out.exchanges[0])).toBe(PROMPT('pen'));
    expect(systemPromptOf(out, out.exchanges[1])).toBe(PROMPT('hook man'));
    expect(JSON.stringify(out)).not.toContain('sk-test-key');
  });

  it('a recording kept before prompts were kept reads back none', () => {
    expect(systemPromptOf({ exchanges: [{ step: 'a1', user: 'x' }] }, { step: 'a1', user: 'x' })).toBe('');
    expect(systemPromptOf(null, null)).toBe('');
  });
});
