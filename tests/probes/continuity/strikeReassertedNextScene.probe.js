/**
 * Probe — CONT-3 STRIKE-REASSERTED-NEXT-SCENE (continuity auditor, eleventh audit).
 *
 * rules/narrator-memory.md 6b: a bare Strike renders under CORRECTED AND
 * blocks the narrator re-asserting it at applySidecar — "do not simplify
 * either half away: the render defense and the write defense cover different
 * failure paths (model ignores instructions vs. model re-emits the fact)".
 * Since issue #286 B6 a scene's strikes outlive it for the session
 * (`sessionRetractions` → CORRECTED and the summary's leave-out list), but
 * only the render half does: applySidecar's block (findEquivalentTruth) reads
 * the active scene's `sceneTruths` alone. After a `!scene start`, a narration
 * that re-emits the struck fact records it live — binding in the ledger
 * beside CORRECTED's "do NOT re-assert" — and the next scene end archives it
 * as confirmed canon (World Journal lore for a text subject, the card's tier
 * for an entity), where it outlives CORRECTED, which ends with the session.
 * The ring still carries the original prose that stated it, so the model has
 * the fact in front of it.
 *
 * Real producers: the narrator sidecar apply and persist
 * (applyNarratorSidecar), the GM's `!truth strike` (the relay handler), the
 * `!scene start` path (startScene on a copy — its implicit end keeps the
 * strike), the ledger block builder, endScene's archive.
 *
 * Asserts the CORRECT behaviour: the session's strike blocks the
 * re-assertion in the next scene too.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyNarratorSidecar } from '../../../src/narration/narrator.js';
import { startScene, endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';
import { getConfirmedLore, recordLoreDiscovery } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const DEAD = 'Is dead';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const copy = () => foundry.utils.deepClone(stored());
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user, users: global.game.users };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  const gmUser = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gmUser], { get: (id) => (id === 'gm-1' ? gmUser : null) });
  global.game.user = gmUser;
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, dismissedEntities: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.game.user = orig.user;
  global.game.users = orig.users;
});

/** A narration whose sidecar states "Vance — Is dead", applied as the narrator applies it. */
async function narrateVanceDead(narrationId) {
  const raw = `Vance slumps against the bulkhead and does not move again.\n\`\`\`json\n${JSON.stringify({
    newTruths: [{ subject: 'Vance', fact: DEAD }], stateChanges: [],
  })}\n\`\`\``;
  applyNarratorSidecar(raw, copy(), { narrationId });
  await flush();
}

const vanceDead = (truths) => (truths ?? []).filter(t => t?.subject?.kind === 'text' && t.subject.text === 'Vance' && t.fact === DEAD);
const liveVanceDead = () => vanceDead(stored().sceneTruths).filter(t => !t.retracted);

/** Scene A: the narration says Vance died; the GM strikes it. */
async function sceneWithStrike() {
  await startScene(copy(), { reason: 'test' });
  await narrateVanceDead('nar-1');
  const [t1] = liveVanceDead();
  expect(t1).toBeDefined();
  await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
  expect(liveVanceDead()).toHaveLength(0);
}

describe('CONT-3 — a struck fact the narrator re-asserts after a scene boundary', () => {
  it('is blocked in the next scene of the session, as in the scene it was struck in', async () => {
    await sceneWithStrike();
    // The GM's `!scene start`: a copy, as handleSceneCommand passes.
    const sceneB = await startScene(copy(), { reason: 'scene_command' });
    expect(stored().currentSceneId).toBe(sceneB);
    // The strike outlives its scene for the session — the render half.
    expect(stored().sessionRetractions?.facts?.map(f => `${f.label} — ${f.fact}`)).toEqual([`Vance — ${DEAD}`]);

    await narrateVanceDead('nar-2');   // the ring still holds nar-1's prose; the model re-emits the fact

    const block = buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });
    expect.soft(block.corrections ?? '', 'CORRECTED names the strike').toContain(DEAD);
    expect.soft(block.truths ?? '', 'the binding truths do not state it').not.toContain(DEAD);
    expect(liveVanceDead().map(t => t.narrationId), 'live "Vance — Is dead" in the new scene').toEqual([]);
  });

  it('…and so never reaches canon at the next scene end', async () => {
    await sceneWithStrike();
    await startScene(copy(), { reason: 'scene_command' });
    await narrateVanceDead('nar-2');
    await endScene(copy(), { reason: 'scene_command' });
    expect(getConfirmedLore(stored()).map(e => e.title)).not.toContain(`Vance: ${DEAD}`);
  });

  it("the GM's `!truth set` in the next scene lifts the session's strike, as it does in the strike's own scene (W60, X31)", async () => {
    await startScene(copy(), { reason: 'test' });
    await narrateVanceDead('nar-1');
    // nar-1's capture filed the fact as confirmed lore; the strike retracts it.
    await recordLoreDiscovery("Vance's fate", { text: 'Vance is dead.', narratorAsserted: true, confirmed: true, narrationId: 'nar-1' }, stored());
    const [t1] = liveVanceDead();
    await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(getConfirmedLore(stored()).map(e => e.title)).not.toContain("Vance's fate");

    await startScene(copy(), { reason: 'scene_command' });
    const card = await applyFactContinuityCommand({ text: `!truth set "Vance" ${DEAD}` }, { requesterIsGM: true });
    expect(liveVanceDead()).toHaveLength(1);                              // the GM's ruling is recorded…

    const block = buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });
    expect.soft(card, 'the card says the strike is lifted').toMatch(/strike on it is lifted/);
    expect.soft(getConfirmedLore(stored()).map(e => e.title), 'the lore the strike retracted').toContain("Vance's fate");
    expect(block.corrections ?? '', 'CORRECTED beside the binding truth').not.toContain(DEAD);
  });

  it('control: in the scene it was struck in, the re-assertion is blocked (applySidecar)', async () => {
    await sceneWithStrike();
    await narrateVanceDead('nar-2');
    expect(vanceDead(stored().sceneTruths).map(t => t.retracted)).toEqual([true]);
    await endScene(copy(), { reason: 'scene_command' });
    expect(getConfirmedLore(stored()).map(e => e.title)).not.toContain(`Vance: ${DEAD}`);
  });

  it("control: in the strike's own scene the GM's `!truth set` lifts it — CORRECTED no longer names it, its lore is back", async () => {
    await startScene(copy(), { reason: 'test' });
    await narrateVanceDead('nar-1');
    await recordLoreDiscovery("Vance's fate", { text: 'Vance is dead.', narratorAsserted: true, confirmed: true, narrationId: 'nar-1' }, stored());
    const [t1] = liveVanceDead();
    await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
    const card = await applyFactContinuityCommand({ text: `!truth set "Vance" ${DEAD}` }, { requesterIsGM: true });
    expect(card).toMatch(/strike on it is lifted/);
    const block = buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });
    expect(block.corrections ?? '').not.toContain(DEAD);
    expect(getConfirmedLore(stored()).map(e => e.title)).toContain("Vance's fate");
  });
});
