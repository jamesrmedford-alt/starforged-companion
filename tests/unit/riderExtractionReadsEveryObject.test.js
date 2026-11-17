/**
 * STARFORGED COMPANION
 * tests/unit/riderExtractionReadsEveryObject.test.js
 *
 * Issue #362 AC69 RIDER-EXTRACT-MULTI-OBJECT (an incomplete fix of issue #354
 * P2-25). After the ability scan, the move pipeline asks Haiku for the
 * applicable abilities' consequence riders (consequenceRiders.extractRiders).
 * P2-25 found Haiku "sometimes adds a sentence after [the object], and
 * sometimes returns more than one object", which "slice from the first { to
 * the last }" turned into invalid JSON; the scan's parse was made tolerant
 * (abilityScanner.parseHaikuResponse reads every complete top-level object).
 * The rider extraction — the same model, called a moment later for the same
 * abilities — still sliced, so either shape dropped every asset effect of the
 * move behind a console.warn: no effect applied, the confirm's abilities not
 * pre-checked, no card saying so.
 *
 * It now reads each complete top-level object (abilityScanner.topLevelObjects,
 * shared) and merges their abilities, the first entry of an ability winning.
 *
 * Production function: consequenceRiders.extractRiders, its transport (the
 * Claude call) injected — the module's own seam (`_call`).
 */

/* global getCapturedWarns */
import { describe, it, expect } from "vitest";
import { extractRiders } from "../../src/moves/consequenceRiders.js";
import { parseHaikuResponse, topLevelObjects } from "../../src/moves/abilityScanner.js";

const ABILITIES = [
  { key: "vet:0", assetName: "Veteran", abilityName: "", text: "When you Strike, take +1 momentum on a strong hit." },
  { key: "gun:1", assetName: "Gunner",  abilityName: "", text: "When you Strike with it, take +1 momentum on a hit." },
];
const VET_ENTRY = '{"key":"vet:0","riders":[{"condition":"strong_hit","resource":"momentum","amount":1,"optional":false,"choiceGroup":null,"option":null,"label":"+1 momentum"}]}';
const GUN_ENTRY = '{"key":"gun:1","riders":[{"condition":"hit","resource":"momentum","amount":1,"optional":false,"choiceGroup":null,"option":null,"label":"+1 momentum"}]}';
const VET = `{"abilities":[${VET_ENTRY}]}`;
const GUN = `{"abilities":[${GUN_ENTRY}]}`;

const extract = (reply) => extractRiders({ abilities: ABILITIES, moveName: "Strike", apiKey: "k", _call: async () => reply });
const keysOf = (out) => out.map(e => e.key).sort();

describe("issue #362 AC69 — the rider extraction reads the reply shapes the ability scan was fixed to read", () => {
  it("control: one object, with a sentence after it that holds no brace — both abilities' riders", async () => {
    const out = await extract(`{"abilities":[${VET_ENTRY},${GUN_ENTRY}]}\nBoth abilities key to Strike.`);
    expect(keysOf(out)).toEqual(["gun:1", "vet:0"]);
    expect(out.find(e => e.key === "vet:0")).toMatchObject({ assetName: "Veteran", riders: [expect.objectContaining({ condition: "strong_hit", resource: "momentum", amount: 1 })] });
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

  it("one bare ability object per ability, as the scan accepts a bare match", async () => {
    const out = await extract(`${VET_ENTRY}\n${GUN_ENTRY}`);
    expect(keysOf(out)).toEqual(["gun:1", "vet:0"]);
  });

  it("an ability given twice is extracted once — its effect is not applied twice", async () => {
    const out = await extract(`${VET}\n${VET}\n${GUN}`);
    expect(out.map(e => e.key)).toEqual(["vet:0", "gun:1"]);
  });

  it("an object that is not JSON is skipped; the others are read", async () => {
    const out = await extract(`${VET}\n{"abilities": [oops]}\n${GUN}`);
    expect(keysOf(out)).toEqual(["gun:1", "vet:0"]);
  });

  it("control: a reply with no JSON object extracts nothing, with a warning", async () => {
    const out = await extract("I could not find any riders.");
    expect(out).toEqual([]);
    expect(getCapturedWarns().some(w => /consequenceRiders: extraction parse failed/.test(w))).toBe(true);
  });

  it("control: an ability the move was not asked about is never extracted", async () => {
    const out = await extract('{"abilities":[{"key":"other:2","riders":[{"condition":"hit","resource":"momentum","amount":1}]}]}');
    expect(out).toEqual([]);
  });

  it("topLevelObjects: the closed top-level objects, braces in strings ignored", () => {
    expect(topLevelObjects('a {"x":"}{"} b {"y":{"z":1}} {"cut":')).toEqual(['{"x":"}{"}', '{"y":{"z":1}}']);
  });
});
