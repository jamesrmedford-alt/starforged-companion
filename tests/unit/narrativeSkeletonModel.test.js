/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonModel.test.js
 *
 * Issue #353 Phase 1 — the narrative skeleton's pure rules (src/world/
 * skeletons.js) and its prompt section (narratorPrompt.js
 * formatUnrevealedBlock):
 *   - the sidecar's `plans` and `openQuestions` are parsed tolerantly and
 *     bounded — garbage shapes never reach the store (rules/narrator-memory.md
 *     invariant 2: a key added to the instruction is normalised, with parser
 *     tests for garbage);
 *   - only the plans whose subject is in play reach a beat (relevance), within
 *     a token cap;
 *   - a narration is asked to decide what its seeds introduced (a new enemy),
 *     and what a posed question's rolls left undecided.
 */

import { describe, it, expect } from 'vitest';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import {
  normaliseSkeleton, normalisePlans, normaliseOpenQuestions, applyPlanToSkeleton,
  selectRelevantSkeletons, planRequestsFromSeeds, normalisePlanRequests, nameMentioned, sameQuestion,
} from '../../src/world/skeletons.js';
import { formatUnrevealedBlock, appendSidecarInstruction } from '../../src/narration/narratorPrompt.js';

const fence = (obj) => `Prose.\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

function record(over = {}) {
  return normaliseSkeleton({
    id: 'sk-1', kind: 'threat', subject: { type: 'name', name: 'the escort' },
    truth: 'A Keeper drone that collects names for its masters.', wants: 'The name the crew carries.',
    escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'],
    resolutions: ['Give it a false name'], sceneId: 'sc-1', status: 'active',
    updatedAt: '2026-11-13T10:00:00.000Z', ...over,
  });
}

describe('issue #353 — the sidecar\'s plans and open questions are parsed tolerantly', () => {
  it('a well-formed plan and question come through, trimmed and bounded', () => {
    const { sidecar } = extractSidecar(fence({
      newTruths: [], stateChanges: [],
      plans: [{ id: 'sk-1', subject: '  the escort ', truth: 'A drone.', escalation: ['a', 'b', 'c', 'd', 'e', 'f'], clues: 'one clue' }],
      openQuestions: [{ question: 'Which name are we here to meet?', about: 'the escort' }],
    }));
    expect(sidecar.plans).toEqual([{
      id: 'sk-1', subject: 'the escort', truth: 'A drone.', wants: '', knows: '',
      escalation: ['a', 'b', 'c', 'd'], clues: ['one clue'], resolutions: [],
    }]);
    expect(sidecar.openQuestions).toEqual([{ question: 'Which name are we here to meet?', about: 'the escort' }]);
  });

  it('garbage shapes are dropped, never thrown', () => {
    for (const garbage of [null, 'plans', 7, {}, [null, 3, { id: 'bad id!' }, { id: 'sk-2' }, { question: '   ' }]]) {
      const { sidecar, parseError } = extractSidecar(fence({ newTruths: [], plans: garbage, openQuestions: garbage }));
      expect(parseError).toBeNull();
      expect(sidecar.plans).toEqual([]);
      expect(sidecar.openQuestions).toEqual([]);
    }
    // A question written as a bare string is still a question.
    expect(normaliseOpenQuestions(['Who sent it?'])).toEqual([{ question: 'Who sent it?', about: '' }]);
    expect(normalisePlans([{ id: 'sk-1' }])).toEqual([]);           // nothing decided
    expect(normaliseOpenQuestions(['Who sent it?', 'And why?'])).toHaveLength(1);   // one a response
  });

  it('a sidecar with no plan keys keeps empty lists (the old shape still parses)', () => {
    const { sidecar } = extractSidecar(fence({ newTruths: [], stateChanges: [] }));
    expect(sidecar.plans).toEqual([]);
    expect(sidecar.openQuestions).toEqual([]);
  });

  it('a bare sidecar that opens with "plans" is still the sidecar, stripped from the prose', () => {
    const raw = `The corridor waits.\n{"plans":[{"id":"sk-1","truth":"A drone."}],"newTruths":[]}`;
    const { prose, sidecar } = extractSidecar(raw);
    expect(prose).toBe('The corridor waits.');
    expect(sidecar.plans[0].id).toBe('sk-1');
  });
});

describe('issue #353 — a plan laid onto its record', () => {
  it('replaces what it gives, follows the prose\'s name, and keeps what was already shown', () => {
    const shown = { ...record(), clues: [{ id: 'c1', text: 'A pulse that counts down', revealed: true }] };
    const next = applyPlanToSkeleton(shown, normalisePlans([{ id: 'sk-1', subject: 'the Keeper', truth: 'It is a Keeper.',
      clues: ['A pulse that counts down', 'A seal on its hull'] }])[0]);
    expect(next.subject.name).toBe('the Keeper');
    expect(next.truth).toBe('It is a Keeper.');
    expect(next.wants).toBe('The name the crew carries.');           // not given: kept
    expect(next.clues).toEqual([
      { id: 'c1', text: 'A pulse that counts down', revealed: true },
      { id: 'c2', text: 'A seal on its hull', revealed: false },
    ]);
  });
});

describe('issue #353 — which plans a beat is shown', () => {
  const plans = [
    record({ id: 'sk-scene', sceneId: 'sc-1', subject: { name: 'the escort' } }),
    record({ id: 'sk-npc', sceneId: 'sc-0', subject: { type: 'entity', id: 'act-archer', name: 'Vuldar Archer' } }),
    record({ id: 'sk-named', sceneId: 'sc-0', subject: { name: 'the Pale Choir' } }),
    record({ id: 'sk-away', sceneId: 'sc-0', subject: { name: 'the Drift Syndicate' } }),
    record({ id: 'sk-retired', sceneId: 'sc-1', status: 'retired' }),
  ];

  it('made in this scene, its entity matched, or its name in the frame or the line — nothing else', () => {
    const ids = selectRelevantSkeletons(plans, {
      sceneId: 'sc-1', matchedEntityIds: ['act-archer'],
      frame: { location: 'the corridor', present: ['Isaac'], situation: 'Hymns of the Pale Choir echo' },
      text: 'We wait.',
    }).map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining(['sk-scene', 'sk-npc', 'sk-named']));
    expect(ids).not.toContain('sk-away');
    expect(ids).not.toContain('sk-retired');
    expect(ids[0]).toBe('sk-scene');   // in-scene first
  });

  it('a part of a name is not the name; an article is not needed', () => {
    expect(nameMentioned('the escort', 'The Escort waits by the door')).toBe(true);
    expect(nameMentioned('Vuldar Archer', "Archer's count goes on")).toBe(false);
    expect(nameMentioned('the Pale Choir', 'pale choir')).toBe(true);
  });

  it('caps the plans shown', () => {
    const many = Array.from({ length: 9 }, (_, i) => record({ id: `sk-${i}`, sceneId: 'sc-1' }));
    expect(selectRelevantSkeletons(many, { sceneId: 'sc-1' })).toHaveLength(4);
  });
});

describe('issue #353 — the UNREVEALED section', () => {
  it('shows a decided plan as truths not to state, and the rule for reveals', () => {
    const block = formatUnrevealedBlock([record()]);
    expect(block).toMatch(/^## UNREVEALED — FOR THE NARRATOR ONLY/);
    expect(block).toMatch(/Never state one outright/);
    expect(block).toMatch(/a hit shows one of its clues/);
    expect(block).toMatch(/refused the same request twice/);
    expect(block).toContain('### Threat — the escort (id sk-1)');
    expect(block).toContain('Truth: A Keeper drone that collects names for its masters.');
    expect(block).toContain('Escalation, in order: [e1] It asks again, closer; [e2] It seals the corridor');
    expect(block).toMatch(/"reveals": \[\{ "id": "<its id>", "revealed"/);
    expect(block).not.toMatch(/DECIDE NOW/);
  });

  it('asks the narration to decide a requested plan and an undecided question, with their rolls', () => {
    const question = record({ id: 'sk-q', kind: 'mystery', question: 'Which name are we here to meet?', truth: '',
      escalation: [], clues: [], resolutions: [], oracleSeeds: ['Action + Theme: Secure / Debt', 'Descriptor + Focus: Ancient / Name'] });
    const block = formatUnrevealedBlock([question], {
      planRequests: [{ ref: 'plan-n1-enemy', kind: 'threat', label: 'the new enemy this price reveals', oracleSeeds: ['Character Role: Scout'] }],
    });
    expect(block).toMatch(/### DECIDE NOW/);
    expect(block).toMatch(/"plans": \[\{ "id": "<its id>"/);
    expect(block).toContain('- id plan-n1-enemy: Threat — the new enemy this price reveals. Oracle: Character Role: Scout.');
    expect(block).toContain('- id sk-q: the hidden answer to "Which name are we here to meet?" (about the escort). Oracle: Action + Theme: Secure / Debt; Descriptor + Focus: Ancient / Name — use the pair that fits.');
  });

  it('without a sidecar (the Private Channel) it shows decided plans only, and no instruction to write', () => {
    const pending = record({ id: 'sk-q', truth: '' });
    const block = formatUnrevealedBlock([record(), pending], { sidecar: false,
      planRequests: [{ ref: 'plan-x', kind: 'threat', label: 'x', oracleSeeds: [] }] });
    expect(block).toContain('(id sk-1)');
    expect(block).not.toMatch(/sk-q|DECIDE NOW|sidecar/);
  });

  it('nothing to show is no section', () => {
    expect(formatUnrevealedBlock([])).toBe('');
    expect(formatUnrevealedBlock([record({ truth: '' })], { sidecar: false })).toBe('');
  });

  it('trims later plans to the token cap, but always shows the first and every decision asked for', () => {
    const long = (id) => record({ id, truth: 'x'.repeat(500) });
    const block = formatUnrevealedBlock([long('sk-a'), long('sk-b'), long('sk-c')], {
      maxTokens: 300, planRequests: [{ ref: 'plan-r', kind: 'threat', label: 'the new enemy', oracleSeeds: [] }],
    });
    expect(block).toContain('(id sk-a)');
    expect(block).not.toContain('(id sk-c)');
    expect(block).toContain('- id plan-r:');
  });
});

describe('issue #353 — the plans a narration is asked to decide', () => {
  it('a price that revealed a new enemy asks for a threat plan, carrying its rolls', () => {
    const seeds = { results: ['Pay the Price: A new enemy is revealed',
      'The new enemy — Character Role: Scout', 'The new enemy — Character Goal: Find a home', 'The new enemy — Character Disposition: Hostile'] };
    expect(planRequestsFromSeeds(seeds, 'nar-1')).toEqual([{
      ref: 'plan-nar-1-enemy', kind: 'threat', trigger: 'new_enemy', label: 'the new enemy this price reveals',
      oracleSeeds: ['Character Role: Scout', 'Character Goal: Find a home', 'Character Disposition: Hostile'],
    }]);
  });

  it('any other seeds ask for nothing', () => {
    expect(planRequestsFromSeeds({ results: ['Pay the Price: You are harmed', 'What you learn — Story Clue: x'] }, 'nar-1')).toEqual([]);
    expect(planRequestsFromSeeds(null, 'nar-1')).toEqual([]);
  });

  it('requests crossing the relay are bounded to known kinds and refs', () => {
    expect(normalisePlanRequests([{ ref: 'plan-a', kind: 'threat', label: 'x' }, { ref: 'bad ref!', kind: 'threat' },
      { ref: 'plan-b', kind: 'dragon' }, 'junk']).map(r => r.ref)).toEqual(['plan-a']);
  });

  it('the same question, worded alike, is one mystery', () => {
    expect(sameQuestion('Which name are we here to meet?', 'which name are we here to meet')).toBe(true);
    expect(sameQuestion('Which name?', 'Who sent the escort?')).toBe(false);
  });
});

describe('issue #353 — the sidecar instruction asks for open questions only with skeletons on', () => {
  it('on: the openQuestions rule; off: not', () => {
    expect(appendSidecarInstruction({ skeletonsEnabled: true })).toMatch(/"openQuestions": \[\{ "question"/);
    expect(appendSidecarInstruction({ skeletonsEnabled: false })).not.toMatch(/openQuestions/);
  });
});
