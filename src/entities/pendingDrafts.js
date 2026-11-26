/**
 * STARFORGED COMPANION
 * src/entities/pendingDrafts.js
 *
 * The rows a narration drafted that the table has neither confirmed nor
 * dismissed: the "New Entities Detected" cards' pending rows, the one store
 * of them, read here and never copied.
 *
 * A pending person is tracked as real until the table confirms or dismisses
 * them (the maintainer's call after the eighth live round, 2026-11-26 —
 * PEOPLE-WAITING-AT-THE-ARRIVAL (c)). Their whereabouts are read as a
 * recorded person's are (factContinuity/whereabouts.js pendingPeopleOf), the
 * narrator is told them by the name the card gives (narratorPrompt.js PEOPLE
 * MET, NOT YET ON RECORD), and a vow that asks who may be won by one. Confirm
 * makes a row a record — the roster — and Dismiss drops it: either way it
 * leaves this list.
 *
 * Pure over the messages it is given (default: the chat log). Never throws.
 */

const MODULE_ID = 'starforged-companion';

/** Whether a draft row is still pending — no status, or "pending". */
export const isPendingDraftRow = (d) => !d?.status || d.status === 'pending';

/**
 * Every pending row of the draft cards, in the chat log's order (the oldest
 * card first), each with its card: the row's name, type and description, the
 * card's id and time, and the narration whose capture drafted it.
 *
 * @param {{ messages?: Object[], type?: string|null }} [opts] — `type`: one type's rows ("connection": the people)
 * @returns {Array<{ name: string, type: string|null, description: string, cardId: string|null, at: number|null, narrationId: string|null }>}
 */
export function pendingDraftRows({ messages = undefined, type = null } = {}) {
  try {
    const list = messages ?? globalThis.game?.messages?.contents ?? [];
    const out = [];
    for (const m of list) {
      const f = m?.flags?.[MODULE_ID];
      if (!f?.draftEntityCard) continue;
      for (const d of Array.isArray(f.drafts) ? f.drafts : []) {
        if (!isPendingDraftRow(d) || (type && d?.type !== type)) continue;
        const name = typeof d?.name === 'string' ? d.name.trim() : '';
        if (!name) continue;
        const at = Number(m.timestamp);
        out.push({
          name,
          type: typeof d.type === 'string' ? d.type : null,
          description: typeof d.description === 'string' ? d.description.trim() : '',
          cardId: m.id ?? null,
          at: Number.isFinite(at) ? at : null,
          narrationId: typeof f.narrationId === 'string' && f.narrationId ? f.narrationId : null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
