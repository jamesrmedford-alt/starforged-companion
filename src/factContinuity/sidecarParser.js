/**
 * STARFORGED COMPANION
 * src/factContinuity/sidecarParser.js
 *
 * Extracts the structured sidecar JSON block from narrator output.
 * See docs/fact-continuity/fact-continuity-scope.md §7.
 *
 * The narrator is instructed to emit prose followed by a single fenced JSON
 * block of shape:
 *
 *   ```json
 *   {
 *     "newTruths":     [{ "subject": "Vance", "fact": "Walks with a limp" }],
 *     "stateChanges":  [{ "subject": "scene", "attribute": "lighting", "value": "dim" }]
 *   }
 *   ```
 *
 * extractSidecar() returns { prose, sidecar, parseError } where:
 *   - prose      — the input with the fenced block stripped (no trailing whitespace
 *                  beyond a single newline). When no block is present, the input
 *                  is returned unchanged.
 *   - sidecar    — parsed object with `newTruths` and `stateChanges` arrays,
 *                  or null when absent / malformed.
 *   - parseError — Error when a block was present but JSON.parse failed.
 *
 * This module is pure — no I/O, no globals.
 */

// Matches the final ```json … ``` fence in the response. The narrator is
// instructed to emit exactly one block, but if the model emits multiple we
// take the last one — it is the most recent assertion of state.
//
// `[\s\S]` rather than `.` so the body may span lines. Non-greedy so multiple
// blocks (when they occur) match individually rather than collapsing.
const FENCE_PATTERN = /```json\s*\n?([\s\S]*?)\n?```/gi;

/**
 * Pull the last fenced JSON block from raw narrator text and parse it.
 *
 * @param {string} rawText — full narrator response (prose + sidecar)
 * @returns {{ prose: string, sidecar: object|null, parseError: Error|null }}
 */
export function extractSidecar(rawText) {
  if (typeof rawText !== 'string' || !rawText.length) {
    return { prose: rawText ?? '', sidecar: null, parseError: null };
  }

  const matches = [...rawText.matchAll(FENCE_PATTERN)];
  if (!matches.length) {
    // Defensive: if the model emitted an opening ```json fence but the
    // closing ``` never arrived — typically because maxTokens cut the
    // response mid-sidecar — the regex above will not match. Without this
    // fallback, the truncated JSON bleeds verbatim into the chat card
    // (observed on Forge with v1.3.0). Strip from the opening fence
    // forward, surface a parseError so the caller logs the cause, and
    // return sidecar=null so partial data is not applied to the ledger.
    const openIdx = rawText.search(/```json\b/i);
    if (openIdx >= 0) {
      const prose = rawText.slice(0, openIdx).replace(/\s+$/u, '');
      return {
        prose,
        sidecar:    null,
        parseError: new Error(
          'Sidecar opening fence found but no closing fence — narrator response likely truncated by maxTokens.',
        ),
      };
    }
    return { prose: rawText, sidecar: null, parseError: null };
  }

  // Take the last fence in the response. Strip every fence from the prose so
  // the player never sees JSON regardless of how many the model emitted.
  const lastMatch = matches[matches.length - 1];
  const body      = lastMatch[1]?.trim() ?? '';
  const prose     = stripFences(rawText, matches);

  let sidecar = null;
  let parseError = null;
  try {
    const parsed = JSON.parse(body);
    sidecar = normaliseSidecar(parsed);
  } catch (err) {
    parseError = err instanceof Error ? err : new Error(String(err));
  }

  return { prose, sidecar, parseError };
}

/**
 * Remove every fenced JSON block from the response. Adjacent whitespace is
 * collapsed so the prose ends cleanly without trailing blank lines.
 */
function stripFences(rawText, matches) {
  let out = rawText;
  // Iterate in reverse so earlier indices remain valid as we splice.
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  return out.replace(/\s+$/u, '');
}

/**
 * Coerce a parsed sidecar object into the canonical shape. Missing arrays
 * become empty arrays; non-array fields are treated as empty. Non-object
 * input returns null so the caller treats it as a parse failure.
 */
function normaliseSidecar(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    newTruths:    Array.isArray(parsed.newTruths)    ? parsed.newTruths    : [],
    stateChanges: Array.isArray(parsed.stateChanges) ? parsed.stateChanges : [],
  };
}
