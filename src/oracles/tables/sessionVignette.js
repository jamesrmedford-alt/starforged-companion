/**
 * STARFORGED COMPANION
 * src/oracles/tables/sessionVignette.js
 *
 * Begin a Session — Spotlight Vignette d100 (play kit p. 1).
 * Rolled at session start when the player opts to spotlight a new danger,
 * opportunity, or insight. On any result, all players take +1 momentum
 * as they return to play from the viewpoint of their characters.
 */

export const SPOTLIGHT_VIGNETTE = [
  { min:  1,  max:  10,  result: "Flashback reveals an aspect of your background or nature" },
  { min: 11,  max:  20,  result: "Flashback reveals an aspect of another character, place, or faction" },
  { min: 21,  max:  30,  result: "Influential character or faction is introduced or given new detail" },
  { min: 31,  max:  40,  result: "Seemingly unrelated situations are shown to be connected" },
  { min: 41,  max:  50,  result: "External factors create new danger, urgency, or importance for a quest" },
  { min: 51,  max:  60,  result: "Important character is put in danger or suffers a misadventure" },
  { min: 61,  max:  70,  result: "Key location is made unsafe or becomes mired in conflict" },
  { min: 71,  max:  80,  result: "Unexpected return of an enemy or threat" },
  { min: 81,  max:  90,  result: "Peril lies ahead or lurks just out of view" },
  { min: 91,  max: 100,  result: "Unforeseen aid is on the way or within reach" },
];
