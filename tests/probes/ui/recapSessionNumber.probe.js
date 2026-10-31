/**
 * PROBE (ui audit) — HELP-RECAP-SESSION-N
 *
 * The help journal's Chat Commands page documents
 *   `!recap session 3` — "Post a recap of a specific past session by number."
 * The command matcher even captures the number
 * (`/^!recap\s+session(?:\s+(\d+))?/i` in index.js handleRecapCommand), but
 * the handler calls `postSessionRecap(campaignState, null)` — null means the
 * CURRENT session — so `!recap session 1` posts the current session's moves,
 * titled with the current session number.
 *
 * Asserts the CORRECT (documented) behaviour, so it FAILS today.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";

const MODULE_ID = "starforged-companion";

describe("!recap session <N> (HELP-RECAP-SESSION-N)", () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      sessionActive: true, currentSessionId: "sess-2", sessionNumber: 2,
      previousSessionSummary: { sessionId: "sess-1", sessionNumber: 1, text: "The old war ended." },
    } } } });
  });

  it("the help's `!recap session 1` recaps session 1, not the current session", async () => {
    silenceConsoleErrors();
    const gm = table.client("gm-1");
    const card = (sessionId, text) => gm.run(() => ChatMessage.create({
      content: `<div class="sf-narration">${text}</div>`,
      flags: { [MODULE_ID]: { narratorCard: true, sessionId, narrationText: text, moveId: "face_danger", outcome: "strong_hit" } },
    }));
    await card("sess-1", "The old war ended at Firstlight.");
    await card("sess-2", "The reactor hums tonight.");
    await table.settle();

    await gm.chat("!recap session 1");
    await table.settle();

    const recaps = table.cards(f => f.recapCard && f.recapType === "session");
    expect(recaps).toHaveLength(1);
    // Today: the number is dropped — the card recaps session 2 ("The reactor hums").
    expect(recaps[0].content).toContain("The old war ended");
    expect(recaps[0].content).not.toContain("The reactor hums");
  });
});
