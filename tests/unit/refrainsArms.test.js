/**
 * STARFORGED COMPANION
 * tests/unit/refrainsArms.test.js
 *
 * Issue #402, Part 7 — the refrains test's arms (test/ci/playwright/lib/arms.mjs,
 * run by refrains-arms.mjs). Each arm is a change to a beat's request made in
 * the runner; no module code changes until one wins. Held here on round 10's
 * kept run: its narrations of play reproduce the lock-in the scope measured
 * (the hook man in every narration from a67 to a75), and since that run kept
 * no system prompts, nothing of it can be asked again as sent — a run made
 * since change 6 can.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { narrationsOf, lockedIn, beatsToAsk, armRequest, writtenAgain, guardsOf, verdict, WINDOW } from '../../test/ci/playwright/lib/arms.mjs';
import { sectionId } from '../../test/ci/playwright/lib/claude.mjs';

const RUN = fileURLToPath(new URL('../../test/ci/playwright/explorations/long-haul-live-20261127-202557/replay.json', import.meta.url));
const R10 = JSON.parse(readFileSync(RUN, 'utf8')).recording;
const SYSTEM = [
  '## NARRATOR ROLE AND VOICE',
  'Second person, present tense.',
  '',
  "## THIS BEAT'S PROSE",
  '',
  '### DETAILS ALREADY WORN',
  '',
  'The recent narrations kept coming back to these. Reach for something else this beat —',
  'another sense, another person, another thing in the place; use one again only where the',
  "player's line turns on it:",
  '- pen',
  '- channel',
].join('\n');
/** Round 10's recording with one system prompt kept for every exchange, as a run since change 6 keeps them. */
const withPrompts = () => {
  const id = sectionId(SYSTEM);
  return { ...R10, systemSections: { [id]: SYSTEM }, exchanges: R10.exchanges.map(x => ({ ...x, system: [id] })) };
};

describe('the beats to re-ask (lib/arms.mjs)', () => {
  it('round 10\'s narrations of play hold the lock-in the scope measured: the hook man in a67 to a75\'s last six', () => {
    const ns = narrationsOf(R10);
    expect(ns).toHaveLength(45);
    const at = (step) => ns.findIndex(n => n.step === step);
    expect(lockedIn(ns, at('a69'))).toEqual(['hook man', 'hatch', 'clerk', 'channel', 'pen']);
    for (const step of ['a67', 'a68', 'a69', 'a70', 'a71', 'a72', 'a75']) expect(lockedIn(ns, at(step)), step).toContain('hook man');
    // Fewer than six narrations before it: no window to read.
    expect(lockedIn(ns, WINDOW - 1)).toEqual([]);
  });

  it('a run kept before its prompts were can be asked nothing again; one kept since can', () => {
    expect(beatsToAsk(R10)).toEqual([]);
    const beats = beatsToAsk(withPrompts());
    expect(beats.length).toBe(33);
    expect(beats.find(b => b.step === 'a69')).toMatchObject({ system: SYSTEM, locked: ['hook man', 'hatch', 'clerk', 'channel', 'pen'] });
  });
});

describe('each arm is a change to the request', () => {
  const beat = beatsToAsk(withPrompts()).find(b => b.step === 'a71');
  const recentOf = (user) => user.slice(user.indexOf('## RECENT SCENE'), user.indexOf('\n## ', user.indexOf('## RECENT SCENE') + 3));
  // Each entry is the player's line, then its narration under it; the scene's heads and an offer line are none.
  const narrationParagraphs = (user) => recentOf(user).split('\n\n')
    .map(p => (/^PLAYER — /.test(p) ? p.slice(p.indexOf('\n') + 1) : p))
    .filter(p => p.trim() && !/^(PLAYER — |THE SCENE BEFORE|THIS SCENE:|## |\*)/.test(p));

  it('arm 0 is the request as sent', () => {
    expect(armRequest(beat, 0, beat)).toEqual({ system: beat.system, user: beat.user });
  });

  it('arm 1 takes the sentences holding a locked-in detail out of the recent narrations; the player\'s lines stay', () => {
    const { user } = armRequest(beat, 1, beat);
    expect(narrationParagraphs(beat.user).some(p => writtenAgain(beat.locked, p).length)).toBe(true);
    for (const p of narrationParagraphs(user)) expect(writtenAgain(beat.locked, p), p).toEqual([]);
    expect(recentOf(user).match(/^PLAYER — /gm)?.length).toBe(recentOf(beat.user).match(/^PLAYER — /gm)?.length);
  });

  it('arm 2 keeps the last narration word for word and gives the older ones a line each', () => {
    const before = narrationParagraphs(beat.user);
    const after = narrationParagraphs(armRequest(beat, 2, beat).user);
    expect(after.at(-1)).toBe(before.at(-1));
    expect(after.slice(0, -1).every(p => /^\(.+\)$/.test(p))).toBe(true);
  });

  it('arm 3 lists the details of three or more of the last six, the scene\'s people on it, with no cap', () => {
    const { system } = armRequest(beat, 3, beat);
    const listed = system.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
    expect(listed).toContain('hook man');
    expect(listed).toContain('clerk');
    expect(listed.length).toBeGreaterThan(2);
  });

  it('arm 4 adds the line code writes: what the last narrations kept showing, left out unless it acts', () => {
    const { user, system } = armRequest(beat, 4, beat);
    expect(system).toBe(beat.system);
    expect(user).toContain(`## WHAT THE LAST NARRATIONS KEPT SHOWING\n\nShown in each of the last 6 narrations and doing nothing new: ${beat.locked.join(', ')} — leave them out of this beat unless they act.`);
    expect(user.indexOf('## WHAT THE LAST NARRATIONS KEPT SHOWING')).toBeLessThan(user.indexOf('## PLAYER NARRATION'));
  });

  it('arm 5 moves the worn list from advice into NOT SO', () => {
    const { user, system } = armRequest(beat, 5, beat);
    expect(system).not.toContain('DETAILS ALREADY WORN');
    expect(user).toContain('NOT SO — never tell it as true:\n- [worn] Never write these again in this beat: pen; channel.');
  });
});

describe('scoring, guards and the rule', () => {
  it('a reply is scored by the locked-in details it writes again — a word a pair holds counts', () => {
    expect(writtenAgain(['hook man', 'clerk', 'pen'], 'The hook man waits by the rail. The clerk says nothing.')).toEqual(['hook man', 'clerk']);
    expect(writtenAgain(['man'], 'The hook man waits by the rail.')).toEqual(['man']);
    expect(writtenAgain(['hook man'], 'A dockhand coils a line at the rail.')).toEqual([]);
  });

  it('the guards: in budget, and the fact block lists who is present', () => {
    const user = 'Narrate the consequence in about 65 words — never more than 85 — in at most 5 sentences.';
    const block = (present) => `\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [], sceneFrame: { location: 'the dock ring', present, situation: 'x' } })}\n\`\`\``;
    expect(guardsOf(`The rail is empty.${block(['Mira Kestrel', 'customs clerk'])}`, user)).toMatchObject({ ok: true, words: 4, ceiling: 85 });
    expect(guardsOf(`${'word '.repeat(90)}${block(['Mira Kestrel'])}`, user)).toMatchObject({ ok: false, inBudget: false });
    expect(guardsOf(`The rail is empty.${block([])}`, user).ok).toBe(false);
  });

  it('an arm wins if it halves arm 0 in every asking and breaks no more guards', () => {
    const rows = [];
    for (let k = 0; k < 5; k++) {
      rows.push({ arm: 0, asking: k, locked: 4, again: 3, ok: true }, { arm: 1, asking: k, locked: 4, again: 1, ok: true },
        { arm: 4, asking: k, locked: 4, again: k === 2 ? 2 : 1, ok: true }, { arm: 5, asking: k, locked: 4, again: 0, ok: k !== 3 });
    }
    const v = verdict(rows);
    expect(v.rates[0]).toEqual([0.75, 0.75, 0.75, 0.75, 0.75]);
    // Arm 4 misses the bar at the third asking (0.5 > 0.375); arm 5 breaks a guard arm 0 did not.
    expect(v.winners).toEqual([1]);
    expect(v.guardsBroken).toMatchObject({ 0: 0, 5: 1 });
  });
});
