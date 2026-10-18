/**
 * Which rows of a list are ticked, shared between the row checkboxes and the action bar. A tiny store (no
 * library) that React reads with useSyncExternalStore. The cap matches what the server accepts in one go.
 */

export const MAX_SELECTION = 200;

export type SelectionStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly string[];
  toggle: (id: string, on: boolean) => void;
  setMany: (ids: readonly string[], on: boolean) => void;
  clear: () => void;
};

export function createSelectionStore(): SelectionStore {
  let selected: readonly string[] = [];
  const listeners = new Set<() => void>();
  const set = (next: readonly string[]) => {
    selected = next.slice(0, MAX_SELECTION);
    listeners.forEach((l) => l());
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => selected,
    toggle(id, on) {
      const has = selected.includes(id);
      if (on && !has) set([...selected, id]);
      else if (!on && has) set(selected.filter((s) => s !== id));
    },
    setMany(ids, on) {
      const rest = selected.filter((s) => !ids.includes(s));
      set(on ? [...rest, ...ids] : rest);
    },
    clear() {
      if (selected.length) set([]);
    },
  };
}
