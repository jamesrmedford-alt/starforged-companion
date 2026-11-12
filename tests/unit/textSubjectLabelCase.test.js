/**
 * STARFORGED COMPANION
 * tests/unit/textSubjectLabelCase.test.js
 *
 * known-issues TEXT-SUBJECT-LOWERCASE: a state change about a subject that is
 * no recorded entity ("The Ember Gate" — a text subject) is filed under a
 * lowercased key (subjectKey), and the narrator's CURRENT STATE block labelled
 * it from the key: "the ember gate — status: sealed". The entry now keeps the
 * subject as the narrator wrote it, and the label reads it.
 */

import { describe, it, expect } from "vitest";
import { applySidecar } from "../../src/factContinuity/ledgers.js";
import { buildLedgerBlock } from "../../src/narration/narratorPrompt.js";

function stateWith(changes) {
  const cs = { currentSessionId: "s1", sessionNumber: 1, currentSceneId: "sc-1", sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" } };
  applySidecar({ newTruths: [], stateChanges: changes }, { campaignState: cs, sessionId: "s1", sceneId: "sc-1" });
  return cs;
}

const ledgerText = (cs) => {
  const block = buildLedgerBlock(cs, { matchedEntityIds: [] });
  return typeof block === "string" ? block : JSON.stringify(block);
};

describe("TEXT-SUBJECT-LOWERCASE — a text subject's CURRENT STATE label keeps its case", () => {
  it("'The Ember Gate' is labelled as written, not 'the ember gate'", () => {
    const cs = stateWith([{ subject: "The Ember Gate", attribute: "status", value: "sealed" }]);
    expect(Object.keys(cs.sceneState.bySubject)).toContain("the ember gate");   // the key stays lowercased
    const text = ledgerText(cs);
    expect(text).toContain("The Ember Gate — status: sealed");
    expect(text).not.toContain("the ember gate — status");
  });

  it("control: an entry written before the label was kept falls back to the key", () => {
    const cs = stateWith([]);
    cs.sceneState.bySubject["the ember gate"] = [{ attribute: "status", value: "sealed", updatedAt: 1 }];
    expect(ledgerText(cs)).toContain("the ember gate — status: sealed");
  });
});
