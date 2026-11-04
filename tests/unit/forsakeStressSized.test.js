/* global makeTestActor */
/**
 * Issue #330 D7 — Forsake Your Vow's Endure Stress is the size the fiction
 * gives it.
 *
 * The cost option read "Endure Stress (-2)" (`amount: 2`), but the vendored
 * move says only "You are demoralized or dispirited: Endure Stress." — the
 * amount is the suffer move's own (minor -1 / serious -2 / major -3), chosen
 * in the fiction. Decided (option A): the option takes no amount of its
 * own; picking it posts a minor / serious / major card.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { postSufferChoiceCard, applySufferPickFromRelay } from "../../src/moves/sufferCard.js";
import { resolveSufferSelection } from "../../src/moves/sufferDialog.js";
import { mapConsequences } from "../../src/moves/resolver.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const gm = { requesterId: "gm-1", requesterIsGM: true };
let pc;

const forsakePrompt = () => mapConsequences("forsake_your_vow", null, false).sufferPrompt;
const stressIndex = (prompt) => prompt.options.findIndex(o => o.suffer === "endure_stress");
const choiceCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sufferCard && m.flags[MODULE_ID].sufferPrompt);
const useCards = () => { game.messages = { contents: ChatMessage._created, get: (id) => ChatMessage._created.find(m => m.id === id) ?? null }; };

async function pick(card, optionIndex) {
  useCards();
  return applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: String(optionIndex) }, gm);
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  pc = makeTestActor({ id: "pc-1", name: "Kira", ownership: { "pl-1": 3 }, system: { spirit: { value: 5, max: 5 } } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
});

describe("issue #330 D7 — Forsake Your Vow's Endure Stress is minor, serious or major", () => {
  it("the cost names no fixed amount: picking it asks how much", () => {
    const prompt = forsakePrompt();
    const opt = prompt.options[stressIndex(prompt)];
    expect(opt.amount).toBeUndefined();
    expect(opt.amountPick).toEqual([1, 2, 3]);
    expect(resolveSufferSelection(prompt, { optionIndices: [stressIndex(prompt)] }))
      .toEqual([{ kind: "needs-amount", sufferId: "endure_stress", amounts: [1, 2, 3] }]);
  });

  it("the pick posts a minor / serious / major card, and its major costs 3 spirit", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: forsakePrompt(), actor: pc, moveId: "forsake_your_vow" });
    expect(await pick(card, stressIndex(forsakePrompt()))).toEqual({ applied: true });
    expect(pc.system.spirit.value).toBe(5);                    // nothing taken yet

    const followUp = choiceCards().at(-1);
    expect(followUp).not.toBe(card);
    expect(followUp.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(["Minor stress (-1)", "Serious stress (-2)", "Major stress (-3)"]);

    expect(await pick(followUp, 2)).toEqual({ applied: true });
    expect(pc.system.spirit.value).toBe(2);
  });

  it("a minor pick costs 1", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: forsakePrompt(), actor: pc, moveId: "forsake_your_vow" });
    await pick(card, stressIndex(forsakePrompt()));
    await pick(choiceCards().at(-1), 0);
    expect(pc.system.spirit.value).toBe(4);
  });

  it("control: the forsake card still takes more costs after the stress pick", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: forsakePrompt(), actor: pc, moveId: "forsake_your_vow" });
    await pick(card, stressIndex(forsakePrompt()));
    expect(card.flags[MODULE_ID].resolved).not.toBe(true);
    expect(card.flags[MODULE_ID].pickedIndices).toEqual([stressIndex(forsakePrompt())]);
  });
});
