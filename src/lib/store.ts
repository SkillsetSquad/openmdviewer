import { defaultPreferences } from "./preferences";
import { create } from "zustand";
import type { Preferences, ReaderDocument, ReadingMode } from "./types";
interface ReaderState {
  workspaceId: string;
  documents: ReaderDocument[];
  activeId: string;
  tabs: string[];
  mode: ReadingMode;
  preferences: Preferences;
  setDocuments: (documents: ReaderDocument[]) => void;
  open: (id: string) => void;
  closeTab: (id: string) => void;
  setMode: (mode: ReadingMode) => void;
  setPreferences: (preferences: Partial<Preferences>) => void;
}
export const useReader = create<ReaderState>((set) => ({
  workspaceId: "default",
  documents: [],
  activeId: "example-0",
  tabs: ["example-0"],
  mode: "read",
  preferences: { ...defaultPreferences },
  setDocuments: (documents) => set({ documents }),
  open: (id) =>
    set((s) => ({
      activeId: id,
      tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id],
    })),
  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== id);
      return {
        tabs,
        activeId: s.activeId === id ? tabs[tabs.length - 1] || "" : s.activeId,
      };
    }),
  setMode: (mode) => set({ mode }),
  setPreferences: (preferences) =>
    set((s) => ({ preferences: { ...s.preferences, ...preferences } })),
}));
