import { create } from "zustand";

const useTabStore = create((set) => ({
  openTabs: [], // start empty
  addTab: (tab) =>
    set((state) =>
      state.openTabs.find((t) => t.path === tab.path)
        ? state
        : { openTabs: [...state.openTabs, tab] }
    ),
  removeTab: (path) =>
    set((state) => ({
      openTabs: state.openTabs.filter((t) => t.path !== path),
    })),
}));

export default useTabStore;
