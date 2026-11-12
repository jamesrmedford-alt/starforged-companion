/**
 * STARFORGED COMPANION
 * tests/unit/sidecarUnfenced.test.js
 *
 * known-issues SIDECAR-UNFENCED: the narrator is told to put its fact
 * sidecar in a ```json fence, and a bare ``` fence is read too (issue #321
 * U41); a sidecar written with no fence at all — the object on its own line
 * after the prose — stayed in the prose: the raw JSON showed on the card and
 * the turn's facts were dropped. It is read as the sidecar now.
 */

import { describe, it, expect } from "vitest";
import { extractSidecar } from "../../src/factContinuity/sidecarParser.js";

const PROSE = "Vance limps to the console. The lights flicker.";
const SIDECAR = { newTruths: [{ subject: "Vance", fact: "Walks with a limp" }], stateChanges: [] };

describe("SIDECAR-UNFENCED — a sidecar with no fence", () => {
  it("an object on its own line after the prose is the sidecar, out of the prose", () => {
    const out = extractSidecar(`${PROSE}\n\n${JSON.stringify(SIDECAR, null, 2)}`);
    expect(out.prose).toBe(PROSE);
    expect(out.sidecar?.newTruths).toEqual(SIDECAR.newTruths);
    expect(out.parseError).toBeNull();
  });

  it("one cut off mid-object is stripped and reported, not shown", () => {
    const out = extractSidecar(`${PROSE}\n{"newTruths":[{"subject":"Vance","fact":"Walks wi`);
    expect(out.prose).toBe(PROSE);
    expect(out.sidecar).toBeNull();
    expect(out.parseError).toBeInstanceOf(Error);
  });

  it("control: prose that merely contains braces is untouched", () => {
    const text = 'The screen reads {ACCESS DENIED}. Vance swears.\n{"note": "not a sidecar"}';
    const out = extractSidecar(text);
    expect(out.prose).toBe(text);
    expect(out.sidecar).toBeNull();
    expect(out.parseError).toBeNull();
  });

  it("control: a fenced sidecar is read as before", () => {
    const out = extractSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``);
    expect(out.prose).toBe(PROSE);
    expect(out.sidecar?.newTruths).toEqual(SIDECAR.newTruths);
  });
});
