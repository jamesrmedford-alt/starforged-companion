/**
 * STARFORGED COMPANION
 * tests/unit/siteDiscoveredCardEscaping.test.js
 *
 * Issue #331 X45 (SITE-DISCOVERED-CARD-UNESCAPED). The ◈ Site Discovered card
 * put the site's name — the location Actor's name, GM-edited free text — into
 * its heading raw, while the first-look line beside it and `!clear-site`'s
 * card escape it (issue #322 V18: card text is escaped).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { postSiteDiscoveryCard } from "../../src/sectors/siteDiscovery.js";
import { createLocation } from "../../src/entities/location.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset?.();
  game.folders._reset?.();
  _resetFolderCache();
});

const lastCard = () => ChatMessage._created.at(-1);

describe("X45 — the ◈ Site Discovered card escapes the site's name", () => {
  it("a renamed site's name is escaped on the card", async () => {
    await postSiteDiscoveryCard({
      sector: { id: "sec-1" },
      site:   { id: "site-1", type: "derelict", name: "Hollow <b>Bride</b> & Co", actorId: null, discovered: true },
    });
    const html = lastCard().content;
    // The name as text (it was raw "<b>Bride</b> & Co" markup in the heading).
    expect(html).toContain("Hollow &lt;b&gt;Bride&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Bride</b>");
  });

  it("control: the first-look line beside it is escaped", async () => {
    const cs = { locationIds: [], sectors: [], activeSectorId: null };
    await createLocation(
      { name: "Derelict Starship", type: "derelict", firstLook: "Hull <em>breached</em>", sectorId: null },
      cs, { persist: false },
    );
    const actorId = cs.locationIds[0];
    await postSiteDiscoveryCard({ site: { id: "site-2", type: "derelict", name: "Derelict Starship", actorId, discovered: true } });
    const html = lastCard().content;
    expect(html).toContain("Hull &lt;em&gt;breached&lt;/em&gt;");
    expect(html).toContain("Site Discovered — Derelict Starship");
    expect(lastCard().flags[MODULE_ID].siteDiscovered).toBe(true);
  });
});
