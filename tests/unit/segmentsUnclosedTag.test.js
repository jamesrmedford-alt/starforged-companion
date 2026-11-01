/**
 * STARFORGED COMPANION
 * tests/unit/segmentsUnclosedTag.test.js
 *
 * Issue #322 V17 (the audit's segmentsUnclosedTag probe,
 * NPC-TAG-UNCLOSED-LEAKS): splitSegments and stripMarkup matched only whole
 * `<npc>…</npc>` pairs. A reply cut off mid-line leaves an opening tag the
 * model never closed, and a stray closing tag happens too: either showed as
 * literal text on the card (stripMarkup's output) and was sent to the TTS
 * engine. Half a pair is removed now, and the text after an unclosed opening
 * tag is read as the NPC's line.
 */

import { describe, it, expect } from "vitest";
import { splitSegments, stripMarkup, SEGMENT_VOICE } from "../../src/audio/segments.js";

const TRUNCATED   = 'Vance leans in. <npc>"There is something you need to know about the';
const STRAY_CLOSE = 'Kira looks up. "We leave at dawn."</npc> The engines whine.';
const TAG = /<\/?npc\s*>/i;

describe("half a tag pair (NPC-TAG-UNCLOSED-LEAKS)", () => {
  it("stripMarkup removes an unclosed opening tag, keeping the line", () => {
    expect(stripMarkup(TRUNCATED)).toBe('Vance leans in. "There is something you need to know about the');
  });

  it("stripMarkup removes a stray closing tag", () => {
    expect(stripMarkup(STRAY_CLOSE)).toBe('Kira looks up. "We leave at dawn." The engines whine.');
  });

  it("splitSegments sends no tag text to the TTS engine", () => {
    const texts = [...splitSegments(TRUNCATED), ...splitSegments(STRAY_CLOSE)].map(s => s.text);
    expect(texts.join(" ")).not.toMatch(TAG);
  });

  it("the text after an unclosed opening tag is the NPC's", () => {
    expect(splitSegments(TRUNCATED)).toEqual([
      { voice: SEGMENT_VOICE.NARRATOR, text: "Vance leans in. " },
      { voice: SEGMENT_VOICE.NPC,      text: '"There is something you need to know about the' },
    ]);
  });

  it("a stray tag inside a pair, or around one, is dropped", () => {
    const segs = splitSegments('He turns. <npc>"Wait. <npc>Listen."</npc> She does.</npc>');
    expect(segs.map(s => s.text).join("")).not.toMatch(TAG);
    expect(segs.find(s => s.voice === SEGMENT_VOICE.NPC).text).toBe('"Wait. Listen."');
  });

  it("control: matched pairs split and strip as before", () => {
    const prose = 'The door opens. <npc>"Took you long enough."</npc> Vance waits.';
    expect(splitSegments(prose).map(s => s.voice)).toEqual([SEGMENT_VOICE.NARRATOR, SEGMENT_VOICE.NPC, SEGMENT_VOICE.NARRATOR]);
    expect(stripMarkup(prose)).toBe('The door opens. "Took you long enough." Vance waits.');
    expect(stripMarkup(stripMarkup(TRUNCATED))).toBe(stripMarkup(TRUNCATED));   // idempotent
  });
});
