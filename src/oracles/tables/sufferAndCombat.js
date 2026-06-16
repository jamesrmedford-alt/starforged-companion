/**
 * STARFORGED COMPANION
 * src/oracles/tables/sufferAndCombat.js
 *
 * Suffer- and combat-move outcome tables from the play kit:
 *   - Take Decisive Action — weak hit cost   (p. 5)
 *   - Endure Harm — mortal-wound table       (p. 6)
 *   - Endure Stress — desolation table       (p. 6)
 *   - Withstand Damage — vehicle-damage      (p. 6)
 *
 * These are advisory rolls surfaced alongside the move card; the GM and
 * player apply them when the move's "if you are at 0" branch fires.
 */

export const DECISIVE_ACTION_COST = [
  { min:   1, max:  40,  result: "It's worse than you thought: make a suffer move (-2)",
    sufferRoute: { move: "any", amount: 2 } },
  { min:  41, max:  52,  result: "Victory is short-lived: a new peril or foe appears" },
  { min:  53, max:  64,  result: "You face collateral damage: something is lost, damaged, or broken" },
  { min:  65, max:  76,  result: "Others pay the price: someone else suffers the cost" },
  { min:  77, max:  88,  result: "Others won't forget: you are marked for vengeance" },
  { min:  89, max: 100,  result: "It gets complicated: the true nature of a foe or objective is revealed" },
];

export const MORTAL_WOUND = [
  { min:   1, max:  10,  result: "You suffer mortal harm. Face Death." },
  { min:  11, max:  20,  result: "You are dying. Within an hour or two, you must Heal and raise your health above 0, or Face Death." },
  { min:  21, max:  35,  result: "You are unconscious and out of action. If left alone, you come back to your senses in an hour or two. If vulnerable to ongoing harm, Face Death." },
  { min:  36, max:  50,  result: "You are reeling. If you engage in any vigorous activity before taking a breather, roll on this table again (before resolving the other move)." },
  { min:  51, max: 100,  result: "You are still standing." },
];

export const DESOLATION = [
  { min:   1, max:  10,  result: "You are overwhelmed. Face Desolation." },
  { min:  11, max:  25,  result: "You give up. Forsake Your Vow." },
  { min:  26, max:  50,  result: "You give in to fear or compulsion, and act against your better instincts." },
  { min:  51, max: 100,  result: "You persevere." },
];

export const VEHICLE_DAMAGE = [
  { min:   1, max:  10,  result: "Immediate catastrophic destruction. All aboard must Endure Harm or Face Death, as appropriate." },
  { min:  11, max:  25,  result: "Destruction is imminent and unavoidable. If you do not have the means or intention to get clear, Endure Harm or Face Death, as appropriate." },
  { min:  26, max:  40,  result: "Destruction is imminent, but can be averted if you Repair your vehicle and raise its integrity above 0. If you fail, see 11–25." },
  { min:  41, max:  55,  result: "You cannot Repair this vehicle until you Resupply and obtain a crucial replacement part. If you roll this result again prior to that, see 11–25." },
  { min:  56, max:  70,  result: "The vehicle is crippled or out of your control. To get it back in action, you must Repair and raise its integrity above 0." },
  { min:  71, max:  85,  result: "It's a rough ride. All aboard must make the Endure Harm, Endure Stress, or Companion Takes a Hit move, suffering a serious (-2) cost." },
  { min:  86, max:  95,  result: "You've lost fuel, energy, or cargo. Sacrifice Resources (-2)." },
  { min:  96, max: 100,  result: "Against all odds, the vehicle holds together." },
];
