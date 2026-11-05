/**
 * PROBE — UI-04 HELP-FIRST-SESSION-ABOUT-GM-ONLY (tenth audit, area ui;
 * DOC-DRIFT — issue #331 X59(a)'s shape at a second help page the fix did not
 * reach)
 *
 * What the user does: a player at a multiplayer table follows the help's
 * "First Session — Setup Walkthrough" page to enter the Claude key their
 * Private Channel needs (or the ElevenLabs key for audio on their client).
 *
 * What happens: step 1 reads "Add your API keys. Open Companion Settings →
 * About (GM only)." — the same claim X59 corrected on the Quick Start page
 * ("every player enters their own keys there"): the 🛡 tool is shown to
 * every user (companionToolbarTools) and the About tab renders a player's
 * own Claude and ElevenLabs key fields (settingsPanel.js #renderAboutPane);
 * only the OpenRouter field is the GM's. helpRoleClaims.test.js checks the
 * Quick Start step only, so the First Session page kept the wrong claim.
 *
 * What should happen: the step says every player enters their own keys
 * there, and names the OpenRouter key as the GM's — as Quick Start now does.
 *
 * Controls: the Quick Start step (fixed) makes no GM-only claim; the code —
 * 🛡 is every user's and a player's About tab has the Claude key field.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/helpFirstSessionAboutGmOnly.probe.js
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGES } from "../../../src/help/helpJournal.js";
import { companionToolbarTools } from "../../../src/ui/companionToolbarTools.js";

const GM_ONLY = /\bGM(?:-| )only\b|\bGMs only\b|\bonly the GM\b/i;
const page    = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";
const plain   = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const steps   = (name) => [...page(name).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => plain(m[1]));

describe("UI-04 the First Session walkthrough says whose the About tab is", () => {
  it("control: 🛡 is every user's, and a player's About tab offers the Claude key field", () => {
    expect(companionToolbarTools({ isGM: false }).map(t => t.key)).toContain("sfSettings");
    const panel = readFileSync("src/ui/settingsPanel.js", "utf8");
    // The Claude key field is rendered unconditionally; only the OpenRouter field sits behind ctx.isGM.
    expect(panel).toMatch(/name="claudeApiKey"/);
    expect(panel).toMatch(/\$\{ctx\.isGM \? `\s*<div class="api-key-field">\s*<label class="api-key-label" for="sf-openrouter-key">/);
  });

  it("control: Quick Start's key step (issue #331 X59) no longer calls the About tab GM-only", () => {
    const open = steps("Quick Start").find(s => /Open Companion Settings → About/.test(s));
    expect(open).toBeDefined();
    expect(open).not.toMatch(GM_ONLY);
    expect(open).toMatch(/every player/);
  });

  it("First Session's 'Add your API keys' step does not call the About tab GM-only, and says every player enters their own", () => {
    const step = steps("First Session").find(s => /Add your API keys/.test(s));
    expect(step).toBeDefined();
    // Today: "Add your API keys. Open Companion Settings → About (GM only). …"
    expect(step).not.toMatch(GM_ONLY);
    expect(step).toMatch(/every player|each player|own key/i);
  });
});
