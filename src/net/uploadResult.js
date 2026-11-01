/**
 * STARFORGED COMPANION
 * src/net/uploadResult.js — what a FilePicker.upload actually stored.
 *
 * Foundry v13's FilePicker.upload does not throw when an upload fails: it
 * resolves `false` (the server reported an error — with its own toast),
 * `undefined` (no path, or a 413 with notify:false — console only) or `{}`
 * (the request failed). Every upload site returned
 * `response?.path ?? <the path it built>`, so each failure came back as a
 * path to a file that was never written: a black sector map the record
 * called generated, a portrait or deck plan pointing nowhere, an audio clip
 * the cache said it held (issue #322 V26).
 */

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
