/**
 * STARFORGED COMPANION
 * src/world/storyPeople.js — who the story has met: one reader (issue #402, change 3b)
 *
 * Round 10's culprit (a75) came from two earlier fixes colliding over one
 * question — whom has the story met? — that three places answered three ways:
 *   - the oath's DECIDE NOW (narrator.js, from the recorded people and the
 *     pending drafts) offered "Foreman", and the plan chose him: "The raids
 *     are run by the foreman who once collected on Mira's family debt…";
 *   - secrets.js namedIfAWhoVow (the recorded people alone) found no one named
 *     and appended a name drawn from the name oracle, "Talia Tolari";
 *   - narrator.js strangersOfWhoPlans (the recorded people, and the drafts by
 *     their whole names) found the draft "Foreman" met, so no prompt told the
 *     narrator to show Talia Tolari before she was revealed.
 * Each asks here now, and the other two readers are gone — and since issue
 * #402's change 4 namedIfAWhoVow too: an oath whose who-vow plan names no one
 * is asked for a name once more (narrator.js whoPlanNamingAsk), and nothing
 * draws one.
 *
 * The story's people are its recorded connections (people recorded by
 * Confirm or Make a Connection) and the people a narration drafted that the
 * table has neither confirmed nor dismissed — tracked as real until it does
 * (whereabouts.js pendingPeopleOf). A draft's name is often a description
 * ("The Man From the Berth"), so it is matched only whole (issue #397, Code
 * fix 1; skeletons.js personMetIn). The names that are no person's — places,
 * ships, factions, creatures, the player characters and their command
 * vehicle — are `notNames`: never the one a plan names.
 */

import { collectAllEntities } from '../context/relevanceResolver.js';
import { pendingPeopleOf } from '../factContinuity/whereabouts.js';
import { getPlayerActors } from '../character/actorBridge.js';
import { getCommandVehicle } from '../entities/ship.js';

const MODULE_ID = 'starforged-companion';

/** The entity types that are people (relevanceResolver.js collectAllEntities). */
const PERSON_TYPES = new Set(['connection']);

const uniq = (names) => [...new Set(names.map(n => String(n ?? '').trim()).filter(Boolean))];

/**
 * Who the story has met, and the names that are no one's. Never throws.
 *
 * @param {Object|null} campaignState
 * @param {{ entities?: Object[]|null }} [opts] — the roster, when the caller has read it
 * @returns {{ people: string[], drafts: string[], notNames: string[] }} — `people`: the recorded
 *   connections; `drafts`: the pending drafts of people, none of them a recorded name;
 *   `notNames`: every other name the story holds
 */
export function storyPeople(campaignState, { entities = null } = {}) {
  const people = [];
  const notNames = [];
  let roster = [];
  try { roster = Array.isArray(entities) ? entities : collectAllEntities(campaignState ?? {}); }
  catch (err) { console.debug?.(`${MODULE_ID} | storyPeople: the story's roster was not read:`, err?.message ?? err); }
  for (const e of roster) {
    const name = String(e?.name ?? '').trim();
    if (name) (PERSON_TYPES.has(e?.entityType) ? people : notNames).push(name);
  }
  let drafts = [];
  try { drafts = (pendingPeopleOf(campaignState ?? {}, { entities: roster }) ?? []).map(p => p?.name); }
  catch (err) { console.debug?.(`${MODULE_ID} | storyPeople: the pending drafts were not read:`, err?.message ?? err); }
  try { for (const actor of getPlayerActors() ?? []) if (actor?.name) notNames.push(actor.name); }
  catch (err) { console.debug?.(`${MODULE_ID} | storyPeople: the player characters were not read:`, err?.message ?? err); }
  try { const ship = getCommandVehicle(campaignState ?? {})?.name; if (ship) notNames.push(ship); }
  catch (err) { console.debug?.(`${MODULE_ID} | storyPeople: the command vehicle was not read:`, err?.message ?? err); }
  const recorded = uniq(people);
  const known = new Set(recorded.map(n => n.toLowerCase()));
  return { people: recorded, drafts: uniq(drafts).filter(n => !known.has(n.toLowerCase())), notNames: uniq(notNames) };
}
