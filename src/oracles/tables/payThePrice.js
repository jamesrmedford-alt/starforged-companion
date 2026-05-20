/**
 * STARFORGED COMPANION
 * src/oracles/tables/payThePrice.js
 *
 * Pay the Price d100 — fate move (play kit p. 8 / Reference Guide p. 23).
 * Rolled when the player chooses "roll on the table" as their Pay the Price
 * option, or surfaced alongside the move card so the player can use it.
 */

export const PAY_THE_PRICE = [
  { min:  1,  max:  2,   result: "A trusted individual or community acts against you" },
  { min:  3,  max:  4,   result: "An individual or community you care about is exposed to danger" },
  { min:  5,  max:  7,   result: "You encounter signs of a looming threat" },
  { min:  8,  max: 10,   result: "You create an opportunity for an enemy" },
  { min: 11,  max: 14,   result: "You face a tough choice" },
  { min: 15,  max: 18,   result: "You face the consequences of an earlier choice" },
  { min: 19,  max: 22,   result: "A surprising development complicates your quest" },
  { min: 23,  max: 26,   result: "You are separated from something or someone" },
  { min: 27,  max: 32,   result: "Your action causes collateral damage or has an unintended effect" },
  { min: 33,  max: 38,   result: "Something of value is lost or destroyed" },
  { min: 39,  max: 44,   result: "The environment or terrain introduces a new hazard" },
  { min: 45,  max: 50,   result: "A new enemy is revealed" },
  { min: 51,  max: 56,   result: "A friend, companion, or ally is in harm's way (or you are, if alone)" },
  { min: 57,  max: 62,   result: "Your equipment or vehicle malfunctions" },
  { min: 63,  max: 68,   result: "Your vehicle suffers damage" },
  { min: 69,  max: 74,   result: "You waste resources" },
  { min: 75,  max: 81,   result: "You are harmed" },
  { min: 82,  max: 88,   result: "You are stressed" },
  { min: 89,  max: 95,   result: "You are delayed or put at a disadvantage" },
  { min: 96,  max: 100,  result: "Roll twice" },
];
