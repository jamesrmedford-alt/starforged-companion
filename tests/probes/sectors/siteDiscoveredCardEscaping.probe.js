/**
 * PROBE — SEC-02 SITE-DISCOVERED-CARD-UNESCAPED
 * (src/sectors/siteDiscovery.js postSiteDiscoveryCard, line 133)
 *
 * What the user does: the GM renames a generated site's location Actor on its
 * sheet (the name is free text — "Hollow <Bride> & Co"), then a player
 * finishes an expedition there, or the GM types `!reveal-site`.
 *
 * What happens: the ◈ Site Discovered card is built with
 *   `<h3>◈ Site Discovered — ${site.name}</h3>`
 * where `site.name` is the Actor's current name (siteDisplayName, issue #326
 * W75) put into the HTML raw. `<`, `&` and tags in the name are rendered as
 * markup: a stray `<` swallows the rest of the heading, an `<img onerror>`
 * runs. The same function escapes the first-look line beside it
 * (escapeSiteHtml), and `!clear-site`'s card escapes the same name
 * (src/index.js:3294, escapeChatHtml).
 *
 * What should happen: the name goes into the card escaped, like every other
 * free-text field on a card (issue #322 V18 — "card text is escaped").
 *
 * Controls (pass today): the first-look line is escaped; the plain generated
 * name renders unchanged.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/siteDiscoveredCardEscaping.probe.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { postSiteDiscoveryCard } from "../../../src/sectors/siteDiscovery.js";
import { createLocation } from "../../../src/entities/location.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset?.();
  game.folders._reset?.();
  _resetFolderCache();
});

const lastCard = () => ChatMessage._created.at(-1);

describe("PROBE SEC-02 — the ◈ Site Discovered card escapes the site's name", () => {
  it("a renamed site's name is escaped on the card", async () => {
    await postSiteDiscoveryCard({
      sector: { id: "sec-1" },
      site:   { id: "site-1", type: "derelict", name: "Hollow <b>Bride</b> & Co", actorId: null, discovered: true },
    });
    const html = lastCard().content;
    // Expected: the name as text. Today: raw "<b>Bride</b> & Co" markup in the heading.
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
