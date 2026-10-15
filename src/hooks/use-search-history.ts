"use client";
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { storage } from "@/lib/storage";
import type { RecentSearch } from "@/lib/search-history";
import type { SearchOptions } from "@/lib/search-results";

export function useSearchHistory(
  workspaceId: string,
  active: boolean,
  notify: (message: string) => void,
) {
  const [state, setState] = useState<{
    workspaceId: string;
    items: RecentSearch[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!active) return;
    const subscription = liveQuery(() =>
      storage.searchHistory(workspaceId),
    ).subscribe({
      next: (items) => setState({ workspaceId, items }),
      error: () =>
        setState({
          workspaceId,
          items: [],
          error:
            "Recent searches could not be loaded. Document search still works.",
        }),
    });
    return () => subscription.unsubscribe();
  }, [workspaceId, active]);
  const run = async (operation: Promise<unknown>) => {
    try {
      await operation;
    } catch {
      notify(
        "Search history could not be updated in browser storage. Document search still works.",
      );
    }
  };
  return {
    items: state?.workspaceId === workspaceId ? state.items : [],
    error: state?.workspaceId === workspaceId ? state.error : undefined,
    remember: (query: string, options: SearchOptions) =>
      run(storage.rememberSearch(workspaceId, query, options)),
    remove: (key: string) => run(storage.removeSearch(workspaceId, key)),
    clear: () => run(storage.clearSearchHistory(workspaceId)),
  };
}
