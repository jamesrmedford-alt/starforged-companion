/**
 * PROBE — R2F-1 DISMISSED-NAME-HIDES-RECORD (twelfth audit, round 2 — follow-up
 * of the entities report's "Not probed: dismissed names hide existing
 * entities from relevance index")
 *
 * A draft card's Dismiss puts a NAME on campaignState.dismissedEntities
 * (entityExtractor.js:2300-2323 handleDraftDismiss) — a decision about a
 * draft row: the Entities panel's Dismissed tab says "Names dismissed from
 * the entity-discovery draft card appear here" (entityPanel.js:350-351). But
 * the relevance index drops every RECORD whose full name is on that list:
 *   src/context/relevanceResolver.js:108-118 indexNames — `live` excludes an
 *   entity whose fullNameKey is dismissed, so neither its full name nor its
 *   name parts are indexed; buildNameIndex (:154) feeds resolveRelevance
 *   (:276), which every narration path uses for its ENTITIES IN SCENE cards
 *   (narrator.js buildNarratorExtras / resolvePathRelevance :4650 — the tier
 *   pass too), and resolveEntityName (:185) feeds sidecar subjects
 *   (ledgers.js:458) and the scene-frame cast (narrator.js:649).
 * shipPosition.js:99-103 already knows a dismissed name can belong to a real
 * record ("a settlement the GM dismissed from a draft card still exists as a
 * real location once the GM accepts it") and skips the filter there.
 *
 * A record takes a dismissed name on an ordinary path: an identity reveal.
 * applyEntityRenames (entityExtractor.js:733-774) renames a placeholder
 * connection onto the revealed name after checking only that no ENTITY has
 * it (:751) — never the dismissed list. So: the narrator mentions "Sable
 * Ortiz" in passing, the GM dismisses her draft row (a rumour, not yet a
 * person); later the hooded figure the table has been dealing with lowers her
 * hood — it is Sable Ortiz — and her card (history, bond, portrait) is
 * renamed. From then on she is invisible to the narrator: asked about by
 * name, no card of hers is in the prompt, and what the narration says about
 * her is filed as text, not on her card.
 *
 * Driven end to end: the dismissal through the draft card's Dismiss button;
 * the rename through a player's @scene whose capture's detection reply
 * carries the reveal (scripted Claude replies); the consequence through the
 * next @scene's narrator request.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const FENCE = (truths = []) => `\n\`\`\`json\n${JSON.stringify({ newTruths: truths, stateChanges: [] })}\n\`\`\``;
const REVEAL = 'The hooded figure lowers her hood: it is Sable Ortiz, the salvage broker everyone talks about.';
const LATER  = 'Sable Ortiz counts her credits at the bar, one eye on the door.';
const DETECT = (patch = {}) => JSON.stringify({
  entities: [], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
  ...patch,
});

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [], dismissedEntities: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    if (/ENTITY TYPES TO DETECT/.test(user)) {
      // The capture of the reveal names the placeholder's real name.
      return user.includes('lowers her hood')
        ? DETECT({ renames: [{ from: 'Hooded Figure', to: 'Sable Ortiz' }] })
        : DETECT();
    }
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return user.includes('What is Sable Ortiz doing now?')
        ? LATER + FENCE([{ subject: 'Sable Ortiz', fact: 'Is waiting for someone at the bar' }])
        : REVEAL + FENCE();
    }
    return '{}';
  } });
  // Earlier play: the table met a cloaked woman; her placeholder card exists.
  const gm = table.client('gm-1');
  const { createConnection } = await gm.import('../../src/entities/connection.js');
  await gm.run(() => createConnection(
    { name: 'Hooded Figure', description: 'A cloaked woman who watches the bar.', pronouns: 'she/her' },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  ));
  await table.settle();
});

const sableRecordIds = () => table.actors
  .filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection' && a.flags[MODULE_ID].connection?.name === 'Sable Ortiz')
  .map(a => a.id);
const sceneCallAbout = (re) => table.claude.calls.filter(c => c.model === NARRATION_MODEL && re.test(c.userText ?? '')).at(-1);

/** The narrator named "Sable Ortiz" in passing; the GM pressed Dismiss on her draft row. */
async function gmDismissesSableDraft() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Sable Ortiz', description: 'A salvage broker the dockhands gossip about.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-kira' },
  ));
  await table.settle();
  const [card] = table.cards(f => f.draftEntityCard);
  gm.click(card._id, '[data-action="sf-draft-dismiss"]');
  await table.drain();
  expect(table.world.campaignState().dismissedEntities, 'the Dismiss landed (setup)').toEqual(['Sable Ortiz']);
}

/** Pat asks who the hooded figure is; the narration reveals her, and its capture renames her card. */
async function revealHoodedFigure() {
  // The answer's capture runs 2 s after its card (narrator.js ASYNC_DETECTION_DELAY_MS).
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    await table.client('pl-1').chat('@scene Who is the hooded figure watching us?');
    await table.settle();
    await vi.advanceTimersByTimeAsync(2_100);
    await table.settle();
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
  expect(sableRecordIds(), 'the placeholder card was renamed to Sable Ortiz (setup)').toHaveLength(1);
}

async function askAboutSable() {
  await table.client('pl-1').chat('@scene What is Sable Ortiz doing now?');
  await table.settle(); await table.drain();
  const call = sceneCallAbout(/What is Sable Ortiz doing now/);
  expect(call, 'the question was narrated (setup)').toBeTruthy();
  return { ...call, prompt: `${call.system ?? ''}\n${call.userText ?? ''}` };
}

describe('R2F-1 — a record renamed onto a name the GM once dismissed from a draft card', () => {
  it('asked about by name, Sable Ortiz\'s card is in the narrator\'s ENTITIES IN SCENE', async () => {
    await gmDismissesSableDraft();
    await revealHoodedFigure();
    const call = await askAboutSable();

    // What the narration said about her is filed under her card, not as text …
    const truth = (table.world.campaignState().sceneTruths ?? []).find(t => /waiting for someone/.test(t.fact ?? ''));
    expect(truth, 'the narration\'s truth about her was recorded (setup)').toBeTruthy();
    expect.soft(truth.subject?.kind ?? null, 'the sidecar truth\'s subject').toBe('entity');
    // … and her card is in the narrator's ENTITIES IN SCENE when she is asked about.
    expect.soft(call.prompt, 'her entity card').toMatch(/## SABLE ORTIZ — /);
  }, 60_000);

  it('control: with no earlier dismissal the same reveal and question carry her card', async () => {
    await revealHoodedFigure();
    const call = await askAboutSable();

    expect(call.prompt).toMatch(/## SABLE ORTIZ — /);
    const truth = (table.world.campaignState().sceneTruths ?? []).find(t => /waiting for someone/.test(t.fact ?? ''));
    expect(truth?.subject?.kind ?? null).toBe('entity');
  }, 60_000);
});
