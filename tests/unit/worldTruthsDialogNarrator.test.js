/**
 * STARFORGED COMPANION
 * tests/unit/worldTruthsDialogNarrator.test.js
 *
 * Truths chosen in the World Truths dialog reach the narrator (issue #322 V34,
 * known-issues TRUTHS-TWO-STORES; the maintainer's decision of 2026-11-01).
 *
 * The narrator's WORLD TRUTHS block and getTruth (the vow scene's Iron truth)
 * read `campaignState.worldTruths`, which only the Playtest Quickstart wrote.
 * A save of the system dialog (`!truths`, the toolbar button, the setup card)
 * was recorded as `worldTruthsSet` / `worldTruthsJournalId` alone, and only
 * `!lore` read that journal: a world set up in the dialog gave the narrator no
 * WORLD TRUTHS, and one that revised the Quickstart's truths in the dialog
 * kept the Quickstart's while `!lore` said otherwise.
 *
 * Now each dialog save is parsed into worldTruths as it is linked (one store,
 * written through on every save — rules/reachability.md §5), and a world
 * saved before that is brought up to its newest save when it loads. The
 * pages below are what the dialog writes (vendor sf-truths.vue saveTruths,
 * with truth-category.vue / truth-selectable.vue's markdown), with the
 * vendored Starforged truths' own text.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: "swear_an_iron_vow", moveName: "Swear an Iron Vow", statUsed: "heart", adds: 0,
    rationale: "test", mischiefApplied: false, moveTarget: "Find the lost beacon",
    playerNarration: narration, inputMethod: "chat",
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { rollCategory } from "../../src/truths/generator.js";

const MODULE_ID = "starforged-companion";
const TITLE = "Setting Truths";
const NARRATION_MODEL = "claude-sonnet-5-5";

// ─── what the dialog saves ───────────────────────────────────────────────────

const CATACLYSM_WAR = `<h2>Cataclysm</h2>
<p><strong>We escaped the ravages of a catastrophic war.</strong></p>
<p>Over millennia, we consumed resources and shattered lives as we fueled the engines of industry, expansion, and war. In the end, a powerful foe took advantage of our rivalries in a violent bid for power. Fleeing the devastation, we assembled our fleets and traveled to the Forge. A new home. A fresh start.</p>
<p>In this final war, we were set upon by:</p>
<blockquote>
<p>Artificial intelligence</p>
</blockquote>
<p><em>A delegation of your dreaded foe arrives in the Forge. They claim to represent a rebel force seeking sanctuary. In return, they offer vital information. What news do they carry?</em></p><p>Do you possess a keepsake or artifact of pre-cataclysm society? What is it? Why is it important to you?</p>`;

const IRON_SHARDS = `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships. Fragments of the ships were also given to survivors as a remembrance, and passed from one generation to the next. Today, the Ironsworn swear vows upon the shards to honor the sacrifice of their forebears, the essence of the places left behind, and the souls of those great ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon? Why is this object meaningful to you?</p>`;

const AI_ADEPTS = `<h2>Artificial Intelligence</h2>
<p><strong>We no longer have access to advanced computer systems. Instead, we must rely on the seers we call Adepts.</strong></p>
<p>Our computers are limited to simple digital systems and the most basic machine intelligence. This is because:</p>
<blockquote>
<p>AI was outlawed in the aftermath of the machine wars</p>
</blockquote>
<p>The Adepts serve in place of those advanced systems. They utilize mind-altering drugs to see the universe as a dazzling lattice of data.</p>
<p><em>An Adept is tormented by a dire future they have seen for the inhabitants of the Forge. What does this vision show?</em></p><p>If you are accompanied by machine intelligence, you might have a companion such as a Combat Bot.</p>`;

// A custom truth — the GM's own text, then the category's inspiration text.
const HORRORS_CUSTOM = `<h2>Horrors</h2>
<p>The dead walk the derelicts of the Rift, and the Soulbinders hunt them for coin.</p><p>Have you experienced any supernatural encounters?</p>`;

const FIRST_SAVE  = [CATACLYSM_WAR, IRON_SHARDS, AI_ADEPTS, HORRORS_CUSTOM].join("\n\n");
const REVISED_SAVE = [
  CATACLYSM_WAR.replace("Artificial intelligence", "Religious zealots"),
  IRON_SHARDS,
].join("\n\n");

/** A journal the dialog's Save creates — no module flags — with its one page. */
const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: "text", name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

// ─── the dialog's save reaches the narrator ──────────────────────────────────

describe("truths chosen in the World Truths dialog reach the narrator", () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1], i18n: { "IRONSWORN.JOURNALENTRYPAGES.TypeTruth": TITLE } });
  }, 30_000);
  afterAll(() => table?.teardown());

  async function seed(campaignState = {}) {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [], ...campaignState,
    } } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    table.addActor({ id: "pc-pat", name: "Kira", ownership: { "pl-1": 3 } });
  }

  /** The GM saves the dialog: the system creates the journal, then its page. */
  async function save(id, html, createdTime) {
    const { journal, page } = dialogSave(id, html, createdTime);
    table.journal.set(journal.id, journal);
    table.fireDocumentHook("gm-1", "createJournalEntry", journal);
    table.fireDocumentHook("gm-1", "createJournalEntryPage", page);
    await table.settle();
  }

  /** Kira swears a vow: the move narration's system prompt, and the oath scene's request. */
  async function swear() {
    const before = table.claude.calls.length;
    await table.client("pl-1").chat("I swear on the iron of my ship to find the lost beacon.", { speaker: { actor: "pc-pat" } });
    await table.settle();
    const calls = table.claude.calls.slice(before);
    return {
      move: calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText)),
      oath: calls.find(c => c.model === NARRATION_MODEL && /A character is swearing/.test(c.userText)),
    };
  }

  const worldTruthsBlock = (system) => (system.match(/## WORLD TRUTHS\n\n([\s\S]*?)(?:\n\n|$)/) ?? [])[1] ?? "";

  it("a world set up in the dialog: the WORLD TRUTHS block carries each chosen truth, with its sub-table detail", async () => {
    await seed({ worldTruthsSet: false, worldTruthsJournalId: null });
    await save("j-truths", FIRST_SAVE, 1_000);

    const state = table.world.campaignState();
    expect(state).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: "j-truths" });
    expect(Object.keys(state.worldTruths)).toEqual(["cataclysm", "iron", "ai", "horrors"]);   // was {}

    const { move, oath } = await swear();
    const block = worldTruthsBlock(move.system);
    expect(block).toContain("Cataclysm: We escaped the ravages of a catastrophic war. In this final war, we were set upon by: Artificial intelligence");
    expect(block).toContain("Ai: We no longer have access to advanced computer systems. Instead, we must rely on the seers we call Adepts. This is because: AI was outlawed in the aftermath of the machine wars");
    expect(block).toContain("Iron: Iron vows are sworn upon the remnants of ships that carried our people to the Forge.");
    expect(block).toContain("Horrors: The dead walk the derelicts of the Rift, and the Soulbinders hunt them for coin.");
    expect(block).not.toMatch(/keepsake|Combat Bot|supernatural encounters|delegation/);   // inspiration and quest text stay out

    // getTruth: the oath scene is grounded in the Iron truth the dialog saved.
    expect(oath.userText).toContain("In this world, the Ironsworn bind their oaths thus — Iron vows are sworn upon the remnants of ships");
    expect(oath.userText).toContain("the Ironsworn swear vows upon the shards");
  }, 30_000);

  it("a revision in the dialog replaces the Quickstart's truths, and !lore reads the same save", async () => {
    // The Playtest Quickstart rolled the Sun Plague and linked its own journal.
    const quickstart = { id: "j-module", name: "World Truths", flags: { [MODULE_ID]: { entityType: "worldTruths" } }, _stats: { createdTime: 500 }, pages: { contents: [] } };
    table.journal.set(quickstart.id, quickstart);
    await seed({
      worldTruthsSet: true, worldTruthsJournalId: "j-module",
      worldTruths: { cataclysm: rollCategory("cataclysm", { roll: 10, subRoll: 10 }), iron: rollCategory("iron", { roll: 90 }) },
    });
    expect(table.world.campaignState().worldTruths.cataclysm.title).toMatch(/Sun Plague/);

    await save("j-first", FIRST_SAVE, 1_000);
    await save("j-revised", REVISED_SAVE, 2_000);

    const state = table.world.campaignState();
    expect(state.worldTruthsJournalId).toBe("j-revised");
    expect(Object.keys(state.worldTruths)).toEqual(["cataclysm", "iron"]);   // the newest save, whole

    const { move } = await swear();
    const block = worldTruthsBlock(move.system);
    expect(block).toContain("set upon by: Religious zealots");
    expect(block).not.toMatch(/Sun Plague|Artificial intelligence|Horrors/);

    table.claude.respond(() => "The zealots' war still smoulders behind every hull.");
    await table.client("gm-1").chat("!lore");
    await table.settle();
    const lore = table.claude.calls.find(c => /world-weary spacer narrator/.test(c.system));
    expect(lore.userText).toContain("Religious zealots");
    expect(lore.userText).not.toContain("Sun Plague");
  }, 30_000);

  it("an empty save (no truth selected) moves nothing — the narrator keeps the truths it had", async () => {
    await seed({ worldTruthsSet: false, worldTruthsJournalId: null });
    await save("j-truths", FIRST_SAVE, 1_000);
    await save("j-empty", "<p></p>", 2_000);

    const state = table.world.campaignState();
    expect(state.worldTruthsJournalId).toBe("j-truths");
    expect(state.worldTruths.cataclysm.subResult).toBe("Artificial intelligence");
  }, 30_000);

  it("with the linked journal gone, !lore's repair links the newest save together with its truths", async () => {
    await seed({ worldTruthsSet: true, worldTruthsJournalId: "j-deleted", worldTruths: {} });
    const { journal } = dialogSave("j-newest", REVISED_SAVE, 3_000);
    table.journal.set(journal.id, journal);

    table.claude.respond(() => "The zealots' war still smoulders.");
    await table.client("gm-1").chat("!lore");
    await table.settle();

    const state = table.world.campaignState();
    expect(state.worldTruthsJournalId).toBe("j-newest");
    expect(state.worldTruths.cataclysm.subResult).toBe("Religious zealots");   // was: the link alone
  }, 30_000);
});

// ─── a world saved before the write-through, at its next load ────────────────

describe("a world whose truths were saved in the dialog gets them at its next load", () => {
  let table;
  afterAll(() => table?.teardown());

  /** Load a world (boot the GM) holding `campaignState` and `journals`. */
  async function load(campaignState, journals) {
    await table?.teardown();
    table = await simulateTable({
      users: [USERS.GM], boot: false,
      i18n: { "IRONSWORN.JOURNALENTRYPAGES.TypeTruth": TITLE },
      world: { settings: { campaignState: { ...CampaignStateSchema, ...campaignState } } },
    });
    for (const j of journals) table.journal.set(j.id, j);
    await table.client("gm-1").boot();
    await table.settle();
    return table.world.campaignState();
  }

  it("the linked dialog save is parsed into worldTruths", async () => {
    const state = await load(
      { worldTruthsSet: true, worldTruthsJournalId: "j-truths", worldTruths: {} },
      [dialogSave("j-truths", FIRST_SAVE, 1_000).journal],
    );
    expect(state.worldTruthsJournalId).toBe("j-truths");
    expect(state.worldTruths.cataclysm).toMatchObject({
      title: "We escaped the ravages of a catastrophic war.",
      subTableLabel: "In this final war, we were set upon by:", subResult: "Artificial intelligence",
    });
    expect(state.worldTruths.iron.description).toMatch(/^Many of our outposts were built from the iron bones/);
  }, 30_000);

  it("a world linked to its first of two saves (before #321 U65) moves to the newest", async () => {
    const state = await load(
      { worldTruthsSet: true, worldTruthsJournalId: "j-first", worldTruths: {} },
      [dialogSave("j-first", FIRST_SAVE, 1_000).journal, dialogSave("j-revised", REVISED_SAVE, 2_000).journal],
    );
    expect(state.worldTruthsJournalId).toBe("j-revised");
    expect(state.worldTruths.cataclysm.subResult).toBe("Religious zealots");
  }, 30_000);

  it("a world never linked links its newest save, and is not asked to set World Truths", async () => {
    const state = await load({ worldTruthsSet: false, worldTruthsJournalId: null }, [dialogSave("j-truths", FIRST_SAVE, 1_000).journal]);
    expect(state).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: "j-truths" });
    expect(Object.keys(state.worldTruths)).toContain("iron");
    expect(table.cards(f => f.setupCard)).toEqual([]);
  }, 30_000);

  it("control: the Quickstart's truths, linked to its own journal, are left as they are", async () => {
    const quickstart = { id: "j-module", name: "World Truths", flags: { [MODULE_ID]: { entityType: "worldTruths" } }, _stats: { createdTime: 2_000 }, pages: { contents: [] } };
    const rolled = { cataclysm: rollCategory("cataclysm", { roll: 10, subRoll: 10 }) };
    const state = await load(
      { worldTruthsSet: true, worldTruthsJournalId: "j-module", worldTruths: rolled },
      [dialogSave("j-old", FIRST_SAVE, 1_000).journal, quickstart],
    );
    expect(state.worldTruthsJournalId).toBe("j-module");
    expect(state.worldTruths).toEqual(rolled);
  }, 30_000);

  it("control: a world with no truths anywhere still gets the setup card", async () => {
    const state = await load({ worldTruthsSet: false, worldTruthsJournalId: null }, []);
    expect(state.worldTruthsSet).toBe(false);
    expect(table.cards(f => f.setupCard)).toHaveLength(1);
  }, 30_000);
});
