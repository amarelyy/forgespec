import { Dispatch, SetStateAction, useEffect, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** useState remembered in this browser; still works when storage is blocked. */
export function useStored<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(() => ({ key, value: read(key, fallback) }));
  if (state.key !== key) setState({ key, value: read(key, fallback) });
  useEffect(() => {
    try {
      window.localStorage.setItem(state.key, JSON.stringify(state.value));
    } catch {
      // Storage full or blocked: keep the value for this visit only.
    }
  }, [state]);
  const set: Dispatch<SetStateAction<T>> = (next) =>
    setState((old) => ({ key: old.key, value: typeof next === 'function' ? (next as (v: T) => T)(old.value) : next }));
  return [state.value, set];
}
