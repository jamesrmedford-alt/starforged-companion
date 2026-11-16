/**
 * MOVA-06 · RIDER-EXTRACT-MULTI-OBJECT (INCOMPLETE-FIX of issue #354 P2-25)
 *
 * Scenario: after the ability scan, the move pipeline asks Haiku for the
 * applicable abilities' consequence riders (consequenceRiders.extractRiders).
 * Issue #354 P2-25 found that Haiku "sometimes adds a sentence after [the
 * object], and sometimes returns more than one object", which the ability
 * scan's "slice from the first { to the last }" turned into invalid JSON: the
 * scan returned nothing and nobody was told. The scan's parse was made
 * tolerant (abilityScanner.parseHaikuResponse reads every complete top-level
 * object). The rider extraction — the same model, called a moment later for
 * the same abilities — still slices from the first `{` to the last `}`.
 *
 * Correct: a reply of one object per ability, or an object followed by a
 * remark that holds a brace, yields the riders it states.
 *
 * Today: `JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1))`
 * throws on either shape; extractRiders returns [] behind a console.warn. The
 * move then applies no asset effect (Veteran's "+1 momentum on a strong hit"
 * …), its abilities are not pre-checked for their effects on the confirm, and
 * no card says the effects were skipped.
 *
 * Production function: consequenceRiders.extractRiders, with its transport
 * (the Claude call) injected — the module's own seam (`_call`).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { extractRiders } from "../../../src/moves/consequenceRiders.js";
import { parseHaikuResponse } from "../../../src/moves/abilityScanner.js";

const ABILITIES = [
  { key: "vet:0", assetName: "Veteran", abilityName: "", text: "When you Strike, take +1 momentum on a strong hit." },
  { key: "gun:1", assetName: "Gunner",  abilityName: "", text: "When you Strike with it, take +1 momentum on a hit." },
];
const VET = '{"abilities":[{"key":"vet:0","riders":[{"condition":"strong_hit","resource":"momentum","amount":1,"optional":false,"choiceGroup":null,"option":null,"label":"+1 momentum"}]}]}';
const GUN = '{"abilities":[{"key":"gun:1","riders":[{"condition":"hit","resource":"momentum","amount":1,"optional":false,"choiceGroup":null,"option":null,"label":"+1 momentum"}]}]}';

const extract = (reply) => extractRiders({ abilities: ABILITIES, moveName: "Strike", apiKey: "k", _call: async () => reply });
const keysOf = (out) => out.map(e => e.key).sort();

beforeEach(() => { silenceConsoleErrors(); });

describe("MOVA-06 — the rider extraction reads the reply shapes the ability scan was fixed to read", () => {
  it("control: one object, with a sentence after it that holds no brace — both abilities' riders", async () => {
    const one = '{"abilities":[' + VET.slice('{"abilities":['.length, -2) + "," + GUN.slice('{"abilities":['.length, -2) + "]}";
    const out = await extract(`${one}\nBoth abilities key to Strike.`);
    expect(keysOf(out)).toEqual(["gun:1", "vet:0"]);
  });

  it("control: the ability scan's parser reads the same two shapes (issue #354 P2-25)", () => {
    const a = '{"matches":[{"key":"vet:0","summary":"s","statReplacement":null}]}';
    const b = '{"matches":[{"key":"gun:1","summary":"s","statReplacement":null}]}';
    expect(parseHaikuResponse(`${a}\n${b}`).map(m => m.key)).toEqual(["vet:0", "gun:1"]);
    expect(parseHaikuResponse(`${a}\n(No other ability applies: {none}.)`).map(m => m.key)).toEqual(["vet:0"]);
  });

  it("one object per ability: both abilities' riders are read", async () => {
    const out = await extract(`${VET}\n${GUN}`);
    expect(keysOf(out)).toEqual(["gun:1", "vet:0"]);
  });

  it("an object followed by a remark that holds a brace: its riders are read", async () => {
    const out = await extract(`${VET}\n(Gunner's rider would be {"condition":"hit"} only when the weapon is used.)`);
    expect(keysOf(out)).toEqual(["vet:0"]);
  });
});
