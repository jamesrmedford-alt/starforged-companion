/**
 * STARFORGED COMPANION
 * src/net/uploadResult.js — what a FilePicker.upload actually stored, and a
 * deadline for every FilePicker request.
 *
 * Foundry v13's FilePicker.upload does not throw when an upload fails: it
 * resolves `false` (the server reported an error — with its own toast),
 * `undefined` (no path, or a 413 with notify:false — console only) or `{}`
 * (the request failed). Every upload site returned
 * `response?.path ?? <the path it built>`, so each failure came back as a
 * path to a file that was never written: a black sector map the record
 * called generated, a portrait or deck plan pointing nowhere, an audio clip
 * the cache said it held (issue #322 V26).
 *
 * Nor does it ever time out. FilePicker.upload, createDirectory and browse are
 * Foundry's own requests to its server (on The Forge, calls to its Assets
 * Library) with no deadline, and one that stalls neither resolves nor rejects
 * — the fault fetchWithTimeout bounds for the module's own calls ("a stall is
 * not a throw"). An unanswered upload wedged sector creation (the Scene never
 * built, the wizard stuck on "Creating sector…"), a narrator-audio clip for
 * the rest of the page load, a portrait and the deck plan (issue #347 AB02).
 * Every FilePicker request the module makes goes through
 * withFilePickerDeadline.
 */

import { DEFAULT_TIMEOUT_MS } from "./fetchWithTimeout.js";

const MODULE_ID = "starforged-companion";

/**
 * How long a FilePicker request may take: the 120 s every network call the
 * module makes gets — generous for a slow upload of a large image, short
 * enough that a dead one fails where the caller can say so.
 */
export const FILE_PICKER_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

/**
 * A FilePicker request — upload, createDirectory, browse — bounded: what it
 * resolved to, or a rejection once `timeoutMs` passes with no answer, so a
 * stalled request reaches the caller's ordinary failure path (every site
 * already handles a throw) instead of hanging it. Foundry's request cannot be
 * aborted; an answer after the deadline is ignored.
 *
 * @param {Promise<*>|*} request — the FilePicker call, already made
 * @param {Object} [opts]
 * @param {string} [opts.label]      — what the request was, for the error and the log
 * @param {number} [opts.timeoutMs]  — default FILE_PICKER_TIMEOUT_MS
 * @returns {Promise<*>} what the request resolved to
 * @throws {Error} `<label> timed out after <n>s`, or the request's own error
 */
export async function withFilePickerDeadline(request, { label = "File upload", timeoutMs = FILE_PICKER_TIMEOUT_MS } = {}) {
  const pending = Promise.resolve(request);
  pending.catch(() => {});   // an answer after the deadline is no one's to handle
  let timer = null;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const seconds = Math.round(timeoutMs / 1000);
      console.warn(`${MODULE_ID} | ${label} timed out after ${seconds}s — the server never answered.`);
      reject(new Error(`${label} timed out after ${seconds}s`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The stored file's path: the response's own (The Forge answers with its
 * Assets Library URL, which the built local path is not), the path the
 * caller built when the server reported success without one, else null —
 * the upload failed.
 *
 * @param {*} response — what FilePicker.upload resolved to
 * @param {string} builtPath — `${dir}/${filename}`
 * @returns {string|null}
 */
export function uploadedPath(response, builtPath) {
  if (response && typeof response === "object") {
    if (typeof response.path === "string" && response.path) return response.path;
    if (response.status === "success" && builtPath) return builtPath;
  }
  return null;
}
