/**
 * PROBE — CARDS-06 PLAYER-VOW-LINK-QUOTED-NAME (ninth audit, area cards)
 *
 * What the user does: the crew knows a connection whose name carries double
 * quotes — a nickname the narrator wrote as `Mara "Doc" Reyes` (the
 * detection pass keeps names as narrated). A player makes a vow on their
 * sheet; the "🆕 New vow recorded" card offers "🤝 For a connection?" with
 * every connection in a <select>, and the player picks Mara and presses Link.
 *
 * What happens: buildPlayerVowSetupHtml (src/session/swearVow.js:680-701)
 * writes each option as `<option value="${escapeHtml(c)}">` with the
 * module's own escapeHtml (:393-396), which escapes & < > but not the double
 * quote. The option becomes `<option value="Mara "Doc" Reyes">`: the browser
 * ends the attribute at the first inner quote, so the option's value is
 * `Mara ` and the Link relay sends "Mara" — which applyPlayerVowLinkFromRelay
 * (:868-877) matches against no connection ("no-such-connection"): the vow
 * is never linked, the button re-arms, and the player has no way to link it
 * (the picker is the only path — the vow Item carries no linkedConnectionName
 * otherwise). The inciting vow's `swearToConnection` and the fulfilment's
 * deepen both key on this name.
 *
 * What should happen: attribute text is escaped for attributes — `"` as
 * `&quot;` — as every other card builder here does (index.js escapeChatHtml,
 * combatThreshold.js esc, rewards.js escReward); the select's value is the
 * connection's full name and the Link lands.
 *
 * Controls: `<` and `&` in a name are escaped; a plain name's option is intact.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/playerVowLinkQuotedName.probe.js
 */

import { describe, it, expect } from 'vitest';
import { buildPlayerVowSetupHtml } from '../../../src/session/swearVow.js';

describe('CARDS-06 the player-vow card\'s connection picker with a quoted name', () => {
  it('escapes the double quotes in the option\'s value attribute', () => {
    const html = buildPlayerVowSetupHtml({ name: 'Find the archive', rank: 'dangerous', connections: ['Mara "Doc" Reyes'] });
    // Today: value="Mara "Doc" Reyes" — the attribute ends at the first inner quote.
    expect(html).toContain('value="Mara &quot;Doc&quot; Reyes"');
    expect(html).not.toContain('value="Mara "Doc" Reyes"');
  });

  it('control: angle brackets and ampersands are escaped, and a plain name is intact', () => {
    const html = buildPlayerVowSetupHtml({ name: 'Find the archive', rank: 'dangerous', connections: ['Sable', 'R&D <Unit>'] });
    expect(html).toContain('<option value="Sable">Sable</option>');
    expect(html).toContain('R&amp;D &lt;Unit&gt;');
    expect(html).not.toContain('<Unit>');
  });
});
