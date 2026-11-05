/**
 * Issue #337 Y48 FACTION-FLOW-PANEL-EDIT-CLAIM — the faction flow map names
 * the manual stance path that exists.
 *
 * docs/flows/faction-flow.md said twice that the Entities panel edits a
 * faction's stance ("which can edit `relationship` manually"; "the entity
 * panel can edit the record's stance directly", listed under "What held up
 * under audit"). The panel edits no record field — its only edits are lock /
 * pin / promote / remove, and `relationship` is a display label. The GM's
 * stance correction is `!journal faction "Name" <attitude> — summary`, which
 * writes the World Journal attitude and maps it onto the record.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const flow  = readFileSync('docs/flows/faction-flow.md', 'utf8').replace(/\s+/g, ' ');
const panel = readFileSync('src/ui/entityPanel.js', 'utf8');

describe('the faction flow map says how a faction\'s stance is corrected by hand (issue #337 Y48)', () => {
  it('control: the Entities panel\'s edits are lock / pin / promote / remove, and its relationship is a label', () => {
    expect(panel).toMatch(/const ENTITY_EDIT_OPS = new Set\(\['lock', 'pin', 'promote', 'remove'\]\);/);
    expect(panel).toMatch(/\{ key: 'relationship', label: 'Relationship' \}/);
  });

  it('control: `!journal faction` maps its attitude onto the faction record', () => {
    const wj = readFileSync('src/world/worldJournal.js', 'utf8');
    expect(wj).toMatch(/!journal faction "Name" attitude — summary/);
    expect(wj).toMatch(/applyAttitudeToFactionRecord\(cleanName, attitude, campaignState\)/);
  });

  it('the map does not say the panel edits a stance, and names `!journal faction` as the correction', () => {
    expect(flow).not.toMatch(/can edit `relationship`|can edit the record's stance/);
    expect(flow).toMatch(/the GM's manual stance correction is `!journal faction "Name" <attitude> — summary`/);
    expect(flow).toMatch(/`!journal faction "Name" <attitude> — summary` \([^)]*\) is the GM's manual stance correction/);
  });
});
