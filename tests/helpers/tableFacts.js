/**
 * STARFORGED COMPANION
 * tests/helpers/tableFacts.js — a narration's fact block as the table's facts
 *
 * Since overhaul 2 (slice 3, §5) a narrator fact binds only when the beat's
 * own words bear it out — the player's line, what the dice decided — and only
 * what binds is filed at a scene's end (tier details, Lore, LAST KNOWN). The
 * narrator's own colour fades with its scene; it has tests of its own
 * (colourNotFiled, colourFades, provenanceFloor).
 *
 * The tests of what a scene's end, a strike or the X-Card does with what
 * binds apply their narrations through `applyAsTheTable`: the narration's
 * every fact tagged `from: "line"` and its ground the facts' own words — a
 * beat whose player's line said all of it, so it is the player's and binds.
 */

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { groundOf } from '../../src/factContinuity/provenance.js';

const FENCE = /```json\n([\s\S]*?)\n```/;

/**
 * applyNarratorSidecar, the fact block's facts the player's.
 *
 * @param {string} raw — prose, then the fenced fact block
 * @param {Object} campaignState
 * @param {Object} [ctx] — applyNarratorSidecar's
 * @returns {string} the clean prose
 */
export function applyAsTheTable(raw, campaignState, ctx = {}) {
  const m = FENCE.exec(String(raw ?? ''));
  if (!m) return applyNarratorSidecar(raw, campaignState, ctx);
  const block = JSON.parse(m[1]);
  const tag = (list) => (Array.isArray(list) ? list.map(f => (f && typeof f === 'object' ? { ...f, from: 'line' } : f)) : list);
  const tagged = { ...block, newTruths: tag(block.newTruths), stateChanges: tag(block.stateChanges) };
  const said = [
    ...(Array.isArray(tagged.newTruths) ? tagged.newTruths : []).map(t => t?.fact),
    ...(Array.isArray(tagged.stateChanges) ? tagged.stateChanges : []).map(c => c?.value),
  ].filter(v => typeof v === 'string' && v.trim());
  const rewritten = String(raw).replace(FENCE, `\`\`\`json\n${JSON.stringify(tagged)}\n\`\`\``);
  return applyNarratorSidecar(rewritten, campaignState, { ...ctx, ground: groundOf({ line: said.join('. ') }) });
}
