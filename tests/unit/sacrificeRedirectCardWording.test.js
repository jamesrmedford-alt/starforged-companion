/**
 * STARFORGED COMPANION
 * tests/unit/sacrificeRedirectCardWording.test.js
 *
 * W16-CHOOSE-BELOW (found while fixing issue #338 D3). A loss of resources
 * while unprepared goes to another suffer move (issue #325 W16, D3): the
 * Sacrifice Resources executor posts the "Make a suffer move" picker, then its
 * own card — which said "(choose below)", while the picker sat above it (it
 * is posted first, so the card can say whether it was). The order stays — the
 * card's wording depends on the picker's post — and the card says where the
 * choice is without a direction: "(choose it on its card)", as an asset
 * rider's redirected supply loss already words it (consequenceRiders, Y19).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { sacrificeResources } from "../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";

function unpreparedKira(supply = 2) {
  const kira = makeTestActor({ id: "pc-kira", name: "Kira", system: { supply: { value: supply }, debility: { unprepared: true } } });
  game.actors._set(kira.id, kira);
  invalidateActorCache(kira.id);
  return kira;
}
const isPicker  = (m) => !!m.flags?.[MODULE_ID]?.sufferPrompt;      // the "Make a suffer move" choice card
const isSummary = (m) => m.flags?.[MODULE_ID]?.suffer === "sacrifice_resources";

describe("the Sacrifice Resources card says where its redirect's picker is", () => {
  beforeEach(() => { ChatMessage._reset(); game.actors._reset(); });

  it("the picker posts first; the card after it names no direction — 'choose it on its card'", async () => {
    await sacrificeResources(unpreparedKira(), 1);
    const order = ChatMessage._created.map(m => (isPicker(m) ? "picker" : isSummary(m) ? "card" : "other"));
    expect(order).toEqual(["picker", "card"]);
    const card = ChatMessage._created.find(isSummary).content;
    expect(card).not.toMatch(/below/);
    expect(card).toMatch(/the loss goes to another suffer move \(choose it on its card\)\./);
  });

  it("control: a picker the world refused — the card says to apply one on the sheet", async () => {
    const create = ChatMessage.create;
    ChatMessage.create = async (data, ...rest) => {
      if (data?.flags?.[MODULE_ID]?.sufferPrompt) throw new Error("refused (test fault)");
      return create.call(ChatMessage, data, ...rest);
    };
    try {
      await sacrificeResources(unpreparedKira(), 1);
    } finally {
      ChatMessage.create = create;
    }
    expect(ChatMessage._created.filter(isPicker)).toHaveLength(0);
    expect(ChatMessage._created.find(isSummary).content).toMatch(/the loss goes to another suffer move — choose one and apply it on the sheet\./);
  });
});
