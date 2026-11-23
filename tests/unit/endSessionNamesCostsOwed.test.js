/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/endSessionNamesCostsOwed.test.js
 *
 * known-issues WEAK-HIT-COST-UNPAID (issue #374 A10; the memory charter's
 * third live run, 2026-11-23).
 *
 * A weak hit's cost is a card with choices on it, and the card holds nothing
 * up — by design: a blocking dialog once wedged the move lock. In the live
 * run the player typed past two of them, and two more moves, End a Session
 * and Begin a Session went by with nothing said: both costs were unpaid when
 * the run ended.
 *
 * Now End a Session names the costs nobody has answered — in its dialog,
 * while there is still a session to answer them in, and on its card. It
 * blocks nothing and applies nothing: the choice is still the player's.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { costsOwedSentence } from "../../src/moves/sufferCard.js";

let table;
let dialogs;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false, narrationEnabled: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: "co-s1", sessionNumber: 1, sessionActive: true,
      sessionStartedId: "co-s1", sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: null, sceneTruths: [], clocks: [],
    },
  } } });
  table.addActor({ id: "pc-mira", name: "Mira Kestrel", ownership: { "pl-1": 3 }, items: { contents: [] } });
  table.addActor({ id: "pc-ren",  name: "Ren",          ownership: { "gm-1": 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => "{}" });
  dialogs = [];
  silenceConsoleErrors();
});

/** A cost card as the move pipeline posts one for a weak hit (sufferCard.js postSufferChoiceCard's flags). */
async function costCard(actorId, moveId, extra = {}) {
  await table.client("gm-1").run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-card sf-suffer-choice-card"><div class="sf-card-header">◈ Resolve consequence</div></div>`,
    flags: { [MODULE_ID]: {
      sufferCard: true, sufferPrompt: { kind: "any", amount: 1, count: 1 }, executorOpts: {},
      actorId, moveId, resolutionId: `res-${Math.random().toString(36).slice(2, 8)}`, pickedIndices: [], resolved: false, ...extra,
    } },
  }));
  await table.settle(); await table.drain();
}

async function endSession() {
  const gm = table.client("gm-1");
  gm.answerDialogs(d => {
    dialogs.push({ title: d.title, content: d.content });
    return d.submit({ 'input[name="questFocus"]': "", 'input[name="connectionFocus"]': "" });
  });
  await gm.chat("!end-session");
  await table.settle(); await table.drain();
}

const endCard   = () => table.world.messages().map(m => m.content ?? "").find(c => c.includes("<strong>End a Session</strong>")) ?? "";
const endDialog = () => dialogs.find(d => d.title === "End a Session")?.content ?? "";

describe("WEAK-HIT-COST-UNPAID — End a Session names the costs nobody has answered", () => {
  it("two unanswered weak hits: the dialog and the card both say whose, and for which move", async () => {
    await costCard("pc-mira", "face_danger");
    await costCard("pc-mira", "face_danger");
    await endSession();
    const said = "2 costs are still owed — Mira Kestrel: Face Danger ×2. Each waits on its card in the chat.";
    expect(endDialog(), "the dialog, before the session ends").toContain(said);
    expect(endCard(), "the End a Session card").toContain(`<strong>Unpaid:</strong> ${said}`);
    // It names them and does nothing else: the session ended, and the cards are still there to answer.
    expect(table.world.campaignState().sessionEndedId).toBe("co-s1");
    expect(table.world.messages().filter(m => m.flags?.[MODULE_ID]?.sufferCard && m.flags[MODULE_ID].resolved !== true)).toHaveLength(2);
  }, 30_000);

  it("costs of two characters are named apiece; an answered, a retired and an X-carded card are not owed", async () => {
    await costCard("pc-mira", "face_danger");
    await costCard("pc-ren",  "gather_information");
    await costCard("pc-ren",  "compel", { resolved: true });                      // answered
    await costCard("pc-mira", "clash",  { resolved: true, superseded: true });   // retired by an upgraded result
    await costCard("pc-mira", "strike", { xCarded: true });                      // its narration was X-carded
    await endSession();
    expect(endCard()).toContain("2 costs are still owed — Mira Kestrel: Face Danger; Ren: Gather Information. Each waits on its card in the chat.");
  }, 30_000);

  it("control: with nothing owed, neither the dialog nor the card says anything of it", async () => {
    await costCard("pc-mira", "face_danger", { resolved: true });
    await endSession();
    expect(endCard()).toContain("<strong>End a Session</strong>");
    expect(endCard()).not.toMatch(/Unpaid|still owed/);
    expect(endDialog()).not.toMatch(/Unpaid|still owed/);
  }, 30_000);
});

describe("the sentence itself", () => {
  const owed = (actorName, moveName) => ({ messageId: "m", actorId: "a", actorName, moveId: "x", moveName });

  it("one cost, one character", () => {
    expect(costsOwedSentence([owed("Mira Kestrel", "Face Danger")]))
      .toBe("1 cost is still owed — Mira Kestrel: Face Danger. It waits on its card in the chat.");
  });

  it("nothing owed is no sentence", () => {
    expect(costsOwedSentence([])).toBe("");
  });
});
