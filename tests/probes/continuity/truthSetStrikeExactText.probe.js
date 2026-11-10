/**
 * PROBE — CONT-2 TRUTH-SET-STRIKE-EXACT-TEXT (GM-GATE / WRONG-DETAIL)
 *
 * `!truth set` finds the active scene's strike of the fact by EXACT lowercase
 * text (ledgers.js findBareStrike, ~891: `String(t.fact).trim().toLowerCase()
 * === fact.toLowerCase()`), while every other fact match in the module —
 * the narrator's re-assertion guard (findEquivalentTruth) and the kept
 * strike's lift (findSessionStrike) — normalises (normaliseFactText:
 * whitespace collapsed, trailing . ! ? dropped). So a `!truth set` whose fact
 * differs from the struck one only by a full stop:
 *   - from a PLAYER over a GM's strike is not refused (W60: "a player's set
 *     over a GM's strike is refused") — it is recorded as a live binding truth
 *     while CORRECTED still says "do NOT re-assert" the same fact;
 *   - from the GM does not lift the strike — the two instructions render
 *     together (W60's "so the two never render together"), and the card says
 *     nothing about a strike.
 * The same set after the scene ends IS matched (findSessionStrike normalises)
 * — the player's is refused there, so one command behaves two ways.
 * Entry: chatCommands.js applyFactContinuityCommand (~247 findBareStrike,
 * ~252 setTruth) ← the `factContinuity.command` relay ← a typed `!truth set`.
 *
 * Harness: the multi-client table; the struck truth is a real @scene answer's.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const DEAD = 'Is dead';

let table;
const world = () => table.world.campaignState();
const sidecar = (newTruths) => '\n```json\n' + JSON.stringify({ newTruths, stateChanges: [] }) + '\n```';
const cards = () => table.world.messages().filter(m => m.flags?.['starforged-companion']?.factContinuityCommand);
const liveDead = () => (world().sceneTruths ?? []).filter(t => /^is dead\.?$/i.test(t.fact) && !t.retracted);

/** The ACTIVE SCENE block of the next narration's prompt, split into its binding and CORRECTED halves. */
async function nextPrompt() {
  const before = table.claude.calls.length;
  await table.client('gm-1').chat('@scene What does the dock look like now?');
  await table.settle();
  const call = table.claude.calls.slice(before).find(c => c.model === NARRATION_MODEL);
  const scene = (call?.system ?? '').split('## ACTIVE SCENE')[1] ?? '';
  const [binding, corrected = ''] = scene.split('CORRECTED');
  return { binding: /Vance — Is dead/.test(binding), corrected: /Vance — Is dead/.test(corrected.split('\n## ')[0]) };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    if (/still breathing/.test(call.userText)) {
      return 'Vance lies twisted at the foot of the gantry.' + sidecar([{ subject: 'Vance', fact: DEAD }]);
    }
    return 'The dock is quiet; cranes creak overhead.' + sidecar([]);
  });
  // The narrator records "Vance — Is dead"; the GM strikes it.
  await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
  await table.settle();
  const truth = world().sceneTruths.find(t => t.fact === DEAD);
  await table.client('gm-1').chat(`!truth strike ${truth.id.slice(0, 8)}`);
  await table.settle();
  expect(world().sceneTruths.find(t => t.id === truth.id)).toMatchObject({ retracted: true, retractedBy: 'gm' });
});

describe("CONT-2 — `!truth set` matches the scene's strike by exact text", () => {
  it("control: a player's `!truth set Vance Is dead` over the GM's strike is refused", async () => {
    await table.client('pl-1').chat('!truth set Vance Is dead');
    await table.settle();
    expect(cards().at(-1)?.content).toMatch(/only a GM can restore it/);
    expect(liveDead()).toEqual([]);
  }, 60_000);

  it("a player's `!truth set Vance Is dead.` (a full stop) over the GM's strike is refused too", async () => {
    await table.client('pl-1').chat('!truth set Vance Is dead.');
    await table.settle();
    expect(liveDead().map(t => `${t.fact} (asserted by ${t.asserter})`)).toEqual([]);
    expect(cards().at(-1)?.content).toMatch(/only a GM can restore it/);
  }, 60_000);

  it("the narrator is never told the fact is binding and struck at once after a player's set with a full stop", async () => {
    await table.client('pl-1').chat('!truth set Vance Is dead.');
    await table.settle();
    expect(await nextPrompt()).toEqual({ binding: false, corrected: true });
  }, 60_000);

  it("the GM's `!truth set Vance Is dead.` lifts the strike — one instruction, not both", async () => {
    await table.client('gm-1').chat('!truth set Vance Is dead.');
    await table.settle();
    const card = cards().at(-1)?.content ?? '';
    expect(await nextPrompt()).toEqual({ binding: true, corrected: false });
    expect(card).toMatch(/strike on it is lifted/);
  }, 60_000);

  it("control: the GM's `!truth set Vance Is dead` (exact text) lifts it", async () => {
    await table.client('gm-1').chat('!truth set Vance Is dead');
    await table.settle();
    expect(cards().at(-1)?.content).toMatch(/strike on it is lifted/);
    expect(await nextPrompt()).toEqual({ binding: true, corrected: false });
  }, 60_000);

  it("control: once the scene has ended, the player's set with a full stop IS refused (the kept strike's match normalises)", async () => {
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    expect(world().sessionRetractions?.facts?.some(f => f.fact === DEAD)).toBe(true);
    await table.client('pl-1').chat('!truth set Vance Is dead.');
    await table.settle();
    expect(cards().at(-1)?.content).toMatch(/only a GM can restore it/);
    expect(liveDead()).toEqual([]);
  }, 60_000);
});
