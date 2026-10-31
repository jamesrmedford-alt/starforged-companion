/**
 * PROBE (oracles audit) — the Explore a Waypoint match button rolls its
 * oracle move as often as it is clicked.
 *
 * An Explore a Waypoint strong hit + match (miss + match) card carries
 * flags.waypointOracleCard and a "🔭 Make a Discovery" ("🌀 Confront Chaos")
 * button. wireWaypointOracleButton (src/index.js) only disables the button in
 * the DOM of the client that clicked; nothing stamps the card as used
 * (no writer of any "used" flag exists — grep waypointOracleCard). Every
 * other client's render, and the clicker's own re-render after a reload,
 * offers a live button again, and each click posts another forced
 * make_a_discovery move — each of which the pipeline resolves, rolling the
 * Make a Discovery table again and marking another 2 discoveries-legacy
 * ticks. The rulebook gives one discovery per match.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseHTML } from "../../helpers/cardDom.js";
import { wireWaypointOracleButton } from "../../../src/index.js";

const MODULE_ID = "starforged-companion";
const BUTTON = '<div><button type="button" class="sf-followup-btn" data-action="sf-waypoint-oracle">🔭 Make a Discovery</button></div>';

const forcedDiscoveries = () =>
  ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "make_a_discovery");

beforeEach(() => ChatMessage._reset());

describe("PROBE: a waypoint match yields one Make a Discovery", () => {
  it("a second render of the same card (another player, or after a reload) cannot roll it again", async () => {
    const card = makeTestMessage({ flags: { [MODULE_ID]: { waypointOracleCard: "make_a_discovery" } } }, { author: "gm-1" });

    // Player A's client renders the card and clicks.
    const rootA = parseHTML(BUTTON);
    wireWaypointOracleButton(card, rootA);
    rootA.querySelector('[data-action="sf-waypoint-oracle"]').click();
    await new Promise(r => setTimeout(r, 0));
    expect(forcedDiscoveries()).toHaveLength(1);

    // Player B's client (or A after a reload) renders the same card.
    const rootB = parseHTML(BUTTON);
    wireWaypointOracleButton(card, rootB);
    rootB.querySelector('[data-action="sf-waypoint-oracle"]').click();
    await new Promise(r => setTimeout(r, 0));

    expect(forcedDiscoveries()).toHaveLength(1);   // FAILS today: 2 forced Make a Discovery moves
  });
});
