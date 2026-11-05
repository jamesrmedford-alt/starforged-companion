/**
 * STARFORGED COMPANION
 * src/ui/keepTypedInput.js — a panel's re-render keeps what the user is typing.
 *
 * The Progress Tracks, Clocks and Chronicle panels re-render whenever another
 * client's write changes what they show — a player's Strike marking a fight,
 * a Pay the Price advancing a clock, the automatic Chronicle entry after a
 * narration (their document and setting hooks: issue #322 V12, issue #306
 * R11) — and each `_replaceHTML` empties its content node before appending
 * the new tree. A track or clock name half typed in the add form, with its
 * chosen type and rank, was gone; a Chronicle entry being edited in place was
 * taken out of the page before its blur save, which never came (a browser
 * fires no `blur` on an element it removes). `replaceKeepingInput` is that
 * replacement, carrying them across (issue #337 Y45).
 */

// The text each inline-edit element was rendered with — what tells an edit in
// progress from an entry the user only clicked into, whose newer stored text
// the re-render must show.
const _renderedText = new WeakMap();

/**
 * Replace `content`'s children with `result`, keeping what the user typed:
 * - every form field matching `fields` keeps its value, matched by `name`;
 * - the inline edit matching `edits` that has focus keeps its text when the
 *   user changed it, matched by `editKey(el)` — unchanged, it shows the
 *   stored text the new render brings;
 * - whichever of them had focus has it again: a text field with its caret
 *   where it was, an inline edit with the caret at its end.
 *
 * @param {HTMLElement} content — the panel's content element (ApplicationV2 `_replaceHTML`)
 * @param {HTMLElement} result  — the freshly rendered tree
 * @param {{ fields?: string, edits?: string, editKey?: (el: HTMLElement) => (string|null|undefined) }} [opts]
 */
export function replaceKeepingInput(content, result, { fields = null, edits = null, editKey = null } = {}) {
  const active  = globalThis.document?.activeElement ?? null;
  const focused = active && active !== content && content.contains?.(active) ? active : null;

  const values = fields
    ? [...content.querySelectorAll(fields)].filter(el => el.name).map(el => ({
        name: el.name, value: el.value, focused: el === focused, caret: el === focused ? caretOf(el) : null,
      }))
    : [];
  let edit = null;
  if (edits && editKey && focused?.matches?.(edits)) {
    const key  = editKey(focused);
    const text = focused.textContent ?? "";
    if (key != null) edit = { key, text: text === _renderedText.get(focused) ? null : text };
  }

  content.innerHTML = "";
  content.append(result);

  if (values.length) {
    const fresh = [...result.querySelectorAll(fields)];
    for (const v of values) {
      const el = fresh.find(f => f.name === v.name);
      if (!el) continue;
      el.value = v.value;
      if (v.focused) refocus(el, v.caret);
    }
  }
  if (edits) {
    const fresh = [...result.querySelectorAll(edits)];
    for (const el of fresh) _renderedText.set(el, el.textContent ?? "");
    const el = edit ? fresh.find(f => editKey(f) === edit.key) : null;
    if (el) {
      if (edit.text != null) el.textContent = edit.text;   // the edit in progress, still unsaved
      el.focus?.();
      caretToEnd(el);
    }
  }
}

/** A text field's selection, when it has one. */
function caretOf(el) {
  try {
    return typeof el.selectionStart === "number" ? [el.selectionStart, el.selectionEnd] : null;
  } catch {
    return null;   // a field type with no selection (a browser may throw on the read)
  }
}

function refocus(el, caret) {
  el.focus?.();
  if (!caret || typeof el.setSelectionRange !== "function") return;
  try {
    el.setSelectionRange(caret[0], caret[1]);
  } catch (err) {
    console.debug(`starforged-companion | keepTypedInput: caret not restored:`, err?.message ?? err);
  }
}

/** Put the caret at the end of an inline edit (the Selection API; absent outside a browser). */
function caretToEnd(el) {
  const selection = globalThis.getSelection?.();
  const doc = globalThis.document;
  if (!selection || typeof doc?.createRange !== "function") return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
