/**
 * STARFORGED COMPANION
 * src/oracles/tables/discoveryAndChaos.js
 *
 * Make a Discovery and Confront Chaos d100 tables (play kit p. 4).
 * Both tables are rolled after Explore a Waypoint on a strong-hit-with-match
 * (discovery) or a miss-with-match (chaos), and may be rolled on demand
 * outside of an Explore roll if the GM wants seed material.
 */

export const MAKE_A_DISCOVERY = [
  { min:   1, max:   4,  result: "Advanced technology waiting to be harnessed or salvaged" },
  { min:   5, max:   9,  result: "Ancient archive or message" },
  { min:  10, max:  12,  result: "Artificial consciousness evolved to a higher state" },
  { min:  13, max:  17,  result: "Clues to a crucial resource or uncharted domain" },
  { min:  18, max:  20,  result: "Envoy from another time or reality" },
  { min:  21, max:  24,  result: "Extraordinary natural phenomenon" },
  { min:  25, max:  27,  result: "First contact with intelligent life" },
  { min:  28, max:  32,  result: "Gateway to another time or alternate reality" },
  { min:  33, max:  36,  result: "Key to unlocking a language or method of communication" },
  { min:  37, max:  41,  result: "Lost or hidden people" },
  { min:  42, max:  45,  result: "Majestic or unusual lifeforms" },
  { min:  46, max:  50,  result: "Marvel of ancient engineering" },
  { min:  51, max:  53,  result: "Miraculously preserved artifact or specimen" },
  { min:  54, max:  58,  result: "Monumental architecture or artistry of an ancient civilization" },
  { min:  59, max:  63,  result: "Mysterious device or artifact of potential value" },
  { min:  64, max:  68,  result: "New understanding of an enduring mystery" },
  { min:  69, max:  72,  result: "Pathway or means of travel to a distant location" },
  { min:  73, max:  77,  result: "Person or lifeform with phenomenal abilities" },
  { min:  78, max:  82,  result: "Place of awe-inspiring beauty" },
  { min:  83, max:  87,  result: "Rare and valuable resource" },
  { min:  88, max:  92,  result: "Safeguarded or idyllic location" },
  { min:  93, max:  96,  result: "Visions or prophesies of the future" },
  { min:  97, max: 100,  result: "Roll twice" },
];

export const CONFRONT_CHAOS = [
  { min:   1, max:   4,  result: "Baneful weapon of mass destruction" },
  { min:   5, max:   9,  result: "Cataclysmic environmental effects" },
  { min:  10, max:  12,  result: "Dead given unnatural life" },
  { min:  13, max:  17,  result: "Destructive lifeform of monstrous proportion" },
  { min:  18, max:  20,  result: "Dread hallucinations or illusions" },
  { min:  21, max:  24,  result: "Harbingers of an imminent invasion" },
  { min:  25, max:  27,  result: "Horde of insatiable hunger or fury" },
  { min:  28, max:  32,  result: "Horrific lifeforms of inscrutable purpose" },
  { min:  33, max:  36,  result: "Impostors in human form" },
  { min:  37, max:  41,  result: "Machines made enemy" },
  { min:  42, max:  45,  result: "Malignant contagion or parasite" },
  { min:  46, max:  50,  result: "Messenger or signal with a dire warning" },
  { min:  51, max:  53,  result: "Passage to a grim alternate reality" },
  { min:  54, max:  58,  result: "People corrupted by chaos" },
  { min:  59, max:  63,  result: "Powerful distortions of time or space" },
  { min:  64, max:  68,  result: "Signs of an impending catastrophe" },
  { min:  69, max:  72,  result: "Site of a baffling disappearance" },
  { min:  73, max:  77,  result: "Site of a horrible disaster" },
  { min:  78, max:  82,  result: "Site of terrible carnage" },
  { min:  83, max:  87,  result: "Technology nullified or made unstable" },
  { min:  88, max:  92,  result: "Technology warped for dark purpose" },
  { min:  93, max:  96,  result: "Vault of dread technology or power" },
  { min:  97, max: 100,  result: "Worshipers of great and malevolent powers" },
];
