import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../index';
import type { ForgeSpecApi, SearchResult } from '../index';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'done'; query: string; result: SearchResult }
  | { status: 'error'; query: string; message: string };

export function useSearch(api: Pick<ForgeSpecApi, 'library'>) {
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const latest = useRef(0);

  const run = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      const id = ++latest.current;
      if (query.length < 2) {
        setState({ status: 'idle' });
        return;
      }
      setState({ status: 'loading', query });
      try {
        const result = await api.library.search({ q: query, limit: 12 });
        if (id === latest.current) setState({ status: 'done', query, result });
      } catch (e) {
        if (id !== latest.current) return; // a newer search superseded this one
        const message =
          e instanceof ApiError && e.code === 'NETWORK_ERROR'
            ? 'Cannot reach the ForgeSpec server. Is the backend running?'
            : e instanceof Error
              ? e.message
              : 'Search failed';
        // Shown before "Showing the sample list instead.", so it must end like a sentence.
        setState({ status: 'error', query, message: /[.!?]$/.test(message) ? message : `${message}.` });
      }
    },
    [api],
  );

  return { state, run };
}
