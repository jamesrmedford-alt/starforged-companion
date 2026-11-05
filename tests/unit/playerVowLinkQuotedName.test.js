/**
 * STARFORGED COMPANION
 * tests/unit/playerVowLinkQuotedName.test.js
 *
 * Issue #331 X21 (PLAYER-VOW-LINK-QUOTED-NAME). The "🆕 New vow recorded"
 * card's "🤝 For a connection?" picker writes each connection into
 * `<option value="…">` with swearVow.js's own escapeHtml, which escaped
 * `& < >` but not `"`. A connection named with a quoted nickname
 * (`Mara "Doc" Reyes`, as the narrator writes them) closed the attribute: the
 * option's value was `Mara `, the Link relay sent "Mara", and the vow could
 * never be linked to that NPC (the picker is the only link path for a
 * sheet-made vow). Every other card builder escapes quotes.
 */

import { describe, it, expect } from "vitest";
import { buildPlayerVowSetupHtml } from "../../src/session/swearVow.js";
import { parseHTML } from "../helpers/cardDom.js";

describe("X21 — the player-vow card's connection picker with a quoted name", () => {
  it("escapes the double quotes in the option's value attribute", () => {
    const html = buildPlayerVowSetupHtml({ name: "Find the archive", rank: "dangerous", connections: ['Mara "Doc" Reyes'] });
    expect(html).toContain('value="Mara &quot;Doc&quot; Reyes"');
    expect(html).not.toContain('value="Mara "Doc" Reyes"');
  });

  it("the option the Link reads carries the whole name", () => {
    const html = buildPlayerVowSetupHtml({ name: "Find the archive", rank: "dangerous", connections: ['Mara "Doc" Reyes', "Sable"] });
    const options = parseHTML(html).querySelectorAll("option").filter(o => o.getAttribute("value"));
    expect(options.map(o => o.getAttribute("value"))).toEqual(['Mara "Doc" Reyes', "Sable"]);
  });

  it("control: angle brackets and ampersands are escaped, and a plain name is intact", () => {
    const html = buildPlayerVowSetupHtml({ name: "Find the archive", rank: "dangerous", connections: ["Sable", "R&D <Unit>"] });
    expect(html).toContain('<option value="Sable">Sable</option>');
    expect(html).toContain("R&amp;D &lt;Unit&gt;");
    expect(html).not.toContain("<Unit>");
  });
});
