/**
 * STARFORGED COMPANION
 * src/narration/failureReason.js — why a Claude call failed, in a few words
 * for a card or a notification.
 *
 * Every narration failure — overloaded, a server error, a timeout, a reply
 * with no text — posted "Narration unavailable — check your API key and
 * proxy", and every move-pipeline exception "Move interpretation failed.
 * Check your API key…". Only a refused key (401) is about the key
 * (known-issues ERROR-TEXT-BLAMES-KEY). Pure: it reads only the error's
 * message, as `api-proxy.js` (`Anthropic API error <status>: …`),
 * `net/fetchWithTimeout.js` (`… timed out after Ns`) and the callers'
 * empty-reply errors word them.
 */

/** A Claude call this client could not make: no key is set here. */
export const NO_CLAUDE_KEY_REASON =
  "no Claude API key is set on this game — add one in Companion Settings";

/** The reply came back with no prose (only a sidecar, or nothing). */
export const EMPTY_REPLY_REASON =
  "the narrator's reply had no text — try again in a moment";

/**
 * A short, lower-case clause naming the cause of a failed Claude call (or of
 * any exception a Claude-driven step threw), for "… unavailable — <reason>."
 *
 * @param {unknown} err
 * @returns {string}
 */
export function claudeFailureReason(err) {
  const msg = String(err?.message ?? err ?? "");
  const status = Number(msg.match(/Anthropic API error (\d{3})/)?.[1]) || null;
  if (/API key not configured/i.test(msg)) return NO_CLAUDE_KEY_REASON;
  if (status === 401 || status === 403) return "the Claude API key was refused — check it in Companion Settings";
  if (status === 429 || /rate limit/i.test(msg)) return "Claude's rate limit was reached — try again in a moment";
  if (status === 529 || /overloaded/i.test(msg)) return "Claude is overloaded right now — try again in a moment";
  if (status && status >= 500) return "Claude's servers returned an error — try again in a moment";
  if (status) return `Claude refused the request (error ${status}) — see the console (F12) for details`;
  if (/timed out/i.test(msg)) return "the request to Claude timed out — try again in a moment";
  if (/returned no text/i.test(msg)) return EMPTY_REPLY_REASON;
  if (err instanceof SyntaxError || /JSON|Unexpected end of/i.test(msg)) {
    return "Claude's reply was cut off or malformed — try again in a moment";
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return "Claude could not be reached — check the network connection and any proxy";
  }
  return "something went wrong — see the console (F12) for details";
}
